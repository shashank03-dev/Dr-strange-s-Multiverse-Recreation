import { createContext, beginProgram, finishProgram, isReady, createTarget, deleteTarget, textureFromCanvas, draw } from './gl.js';
import { HEAD, FOOT } from './shaders/common.js';
import { COMPOSITE, PREFILTER, DOWN, UP, STREAK, FINAL } from './shaders/post.js';
import { SCENES } from './scenes/index.js';
import { SHOTS, DURATION, frameState, lerpPost, impulse } from './timeline.js';
import { composeScore } from './audio.js';
import { makeTitleCanvas } from './title.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('film');
const ui = {
  overlay: document.getElementById('overlay'),
  start: document.getElementById('start'),
  status: document.getElementById('status'),
  bar: document.getElementById('bar'),
  hud: document.getElementById('hud'),
  shot: document.getElementById('shot'),
  time: document.getElementById('time'),
  scrub: document.getElementById('scrub'),
  fill: document.getElementById('fill'),
  res: document.getElementById('res'),
};

const { gl, floatRT, parallel } = createContext(canvas);
const ASPECT = 2.0; // IMAX-ish 2:1 extraction; the rest is letterbox

// ------------------------------------------------------------------ programs
const jobs = [];
for (const s of SHOTS) {
  const src = SCENES[s.id];
  if (!src) throw new Error('Missing scene ' + s.id);
  jobs.push({ key: s.id, h: beginProgram(gl, HEAD + src + FOOT, s.id) });
}
for (const [key, src] of Object.entries({ COMPOSITE, PREFILTER, DOWN, UP, STREAK, FINAL })) {
  jobs.push({ key, h: beginProgram(gl, src, key) });
}
const progs = {};

// ------------------------------------------------------------------ state
let W = 0, Hh = 0, film = { x: 0, y: 0, w: 1, h: 1 };
let targets = null;
let scale = +(params.get('q') || 0.75);
let maxScale = +(params.get('max') || 1.0);
const fixedScale = params.has('q');
let titleTex = null;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(2, Math.floor(canvas.clientWidth * dpr));
  Hh = Math.max(2, Math.floor(canvas.clientHeight * dpr));
  canvas.width = W; canvas.height = Hh;
  let fw = W, fh = Math.round(W / ASPECT);
  if (fh > Hh) { fh = Hh; fw = Math.round(Hh * ASPECT); }
  film = { x: Math.floor((W - fw) / 2), y: Math.floor((Hh - fh) / 2), w: fw, h: fh };
  // Composite/post resolution is capped so 4K screens stay real-time.
  const cw = Math.min(fw, 2560), ch = Math.round(cw / ASPECT);
  if (targets) {
    for (const k of ['A', 'B', 'comp0', 'comp1', 'streak0', 'streak1']) deleteTarget(gl, targets[k]);
    targets.bloom.forEach((t) => deleteTarget(gl, t));
    targets.up.forEach((t) => deleteTarget(gl, t));
  }
  const sw = Math.ceil(cw * maxScale), sh = Math.ceil(ch * maxScale);
  const bloom = [], up = [];
  let bw = cw >> 1, bh = ch >> 1;
  for (let i = 0; i < 7 && bw > 4 && bh > 4; i++) {
    bloom.push(createTarget(gl, bw, bh, floatRT));
    up.push(createTarget(gl, bw, bh, floatRT));
    bw >>= 1; bh >>= 1;
  }
  const sl = bloom[Math.min(2, bloom.length - 1)];
  targets = {
    cw, ch, sw, sh,
    A: createTarget(gl, sw, sh, floatRT),
    B: createTarget(gl, sw, sh, floatRT),
    comp0: createTarget(gl, cw, ch, floatRT),
    comp1: createTarget(gl, cw, ch, floatRT),
    bloom, up,
    streak0: createTarget(gl, sl.w, sl.h, floatRT),
    streak1: createTarget(gl, sl.w, sl.h, floatRT),
    frame: 0,
  };
}
window.addEventListener('resize', resize);

// ------------------------------------------------------------------ clock / audio
let audio = null; // { ctx, buffer, gain }
let source = null, playing = false, startedAt = 0, offset = +(params.get('t') || 0);
let wallStart = 0;
const noAudio = params.has('noaudio');

function now() {
  if (!playing) return offset;
  if (audio && !noAudio) return audio.ctx.currentTime - startedAt;
  return (performance.now() - wallStart) / 1000;
}
function play(from) {
  offset = Math.max(0, Math.min(from, DURATION - 0.01));
  if (audio && !noAudio) {
    if (source) try { source.stop(); } catch (e) { /* already stopped */ }
    source = audio.ctx.createBufferSource();
    source.buffer = audio.buffer;
    source.connect(audio.gain);
    audio.ctx.resume();
    startedAt = audio.ctx.currentTime + 0.05 - offset;
    source.start(audio.ctx.currentTime + 0.05, offset);
  } else {
    wallStart = performance.now() - offset * 1000;
  }
  playing = true;
}
function pause() {
  offset = now();
  playing = false;
  if (source) { try { source.stop(); } catch (e) { /* noop */ } source = null; }
}

// ------------------------------------------------------------------ rendering
function setU(p, name, ...v) {
  const loc = p.uniforms[name];
  if (loc === undefined || loc === null) return;
  if (v.length === 1) gl.uniform1f(loc, v[0]);
  else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
  else if (v.length === 3) gl.uniform3f(loc, v[0], v[1], v[2]);
}
function bindTex(p, name, unit, tex) {
  const loc = p.uniforms[name];
  if (loc === undefined) return;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(loc, unit);
}
function target(t, w, h) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
  gl.viewport(0, 0, w ?? t.w, h ?? t.h);
}

function smoothNoise(t, seed) {
  return Math.sin(t * 1.0 + seed) * 0.5 + Math.sin(t * 2.31 + seed * 1.7) * 0.3 + Math.sin(t * 5.17 + seed * 3.1) * 0.2;
}

function renderScene(shotIndex, t, tgt, shake) {
  const shot = SHOTS[shotIndex];
  const p = progs[shot.id];
  const vw = Math.max(8, Math.floor(targets.sw / maxScale * scale));
  const vh = Math.max(4, Math.floor(targets.sh / maxScale * scale));
  target(tgt, vw, vh);
  gl.useProgram(p.prog);
  setU(p, 'uRes', vw, vh);
  setU(p, 'uT', t - shot.start);
  setU(p, 'uDur', shot.end - shot.start);
  setU(p, 'uG', t);
  setU(p, 'uShake', shake[0], shake[1], shake[2]);
  if (titleTex) bindTex(p, 'uTex', 0, titleTex);
  draw(gl);
  return [vw / tgt.w, vh / tgt.h];
}

function renderFrame(t) {
  const st = frameState(t);
  const shotA = SHOTS[st.a];
  let post = shotA.post;
  if (st.b >= 0) post = lerpPost(shotA.post, SHOTS[st.b].post, Math.min(1, Math.max(0, (st.p - 0.35) / 0.3)));
  const imp = impulse(t);

  const amp = post.shake + imp * 0.02;
  const hz = post.shakeHz;
  const shake = [smoothNoise(t * hz * 3, 1.3) * amp, smoothNoise(t * hz * 3, 7.1) * amp, smoothNoise(t * hz * 2, 4.2) * amp * 1.5];

  const scaleA = renderScene(st.a, t, targets.A, shake);
  let scaleB = scaleA;
  if (st.b >= 0) scaleB = renderScene(st.b, t, targets.B, shake);

  // composite + feedback
  const src = targets.frame & 1 ? targets.comp1 : targets.comp0;
  const dst = targets.frame & 1 ? targets.comp0 : targets.comp1;
  targets.frame++;
  let p = progs.COMPOSITE;
  target(dst);
  gl.useProgram(p.prog);
  bindTex(p, 'uA', 0, targets.A.tex);
  bindTex(p, 'uB', 1, targets.B.tex);
  bindTex(p, 'uPrev', 2, src.tex);
  setU(p, 'uScaleA', scaleA[0], scaleA[1]);
  setU(p, 'uScaleB', scaleB[0], scaleB[1]);
  setU(p, 'uRes', dst.w, dst.h);
  setU(p, 'uP', st.p);
  gl.uniform1i(p.uniforms.uType, st.cut ? st.cut.type : 0);
  const fc = st.cut ? st.cut.color : [1, 1, 1];
  setU(p, 'uFlash', fc[0], fc[1], fc[2]);
  setU(p, 'uTrail', post.trail);
  setU(p, 'uTrailZoom', post.trailZoom + imp * 0.02);
  setU(p, 'uTrailRot', post.trailRot);
  setU(p, 'uTime', t);
  draw(gl);

  // bloom chain
  const bl = targets.bloom, up = targets.up;
  p = progs.PREFILTER;
  target(bl[0]); gl.useProgram(p.prog);
  bindTex(p, 'uSrc', 0, dst.tex);
  setU(p, 'uTexel', 1 / dst.w, 1 / dst.h);
  setU(p, 'uThreshold', 1.0);
  draw(gl);
  p = progs.DOWN; gl.useProgram(p.prog);
  for (let i = 1; i < bl.length; i++) {
    target(bl[i]);
    bindTex(p, 'uSrc', 0, bl[i - 1].tex);
    setU(p, 'uTexel', 1 / bl[i - 1].w, 1 / bl[i - 1].h);
    draw(gl);
  }
  p = progs.UP; gl.useProgram(p.prog);
  let prev = bl[bl.length - 1];
  for (let i = bl.length - 2; i >= 0; i--) {
    target(up[i]);
    bindTex(p, 'uSrc', 0, prev.tex);
    bindTex(p, 'uBase', 1, bl[i].tex);
    setU(p, 'uTexel', 1 / prev.w, 1 / prev.h);
    setU(p, 'uDstTexel', 1 / up[i].w, 1 / up[i].h);
    setU(p, 'uW', 1.0);
    draw(gl);
    prev = up[i];
  }
  // anamorphic streak from a mid mip
  const si = Math.min(2, bl.length - 1);
  p = progs.STREAK; gl.useProgram(p.prog);
  target(targets.streak0);
  bindTex(p, 'uSrc', 0, bl[si].tex);
  setU(p, 'uTexel', 1 / bl[si].w, 1 / bl[si].h);
  setU(p, 'uSpread', 2.0);
  draw(gl);
  target(targets.streak1);
  bindTex(p, 'uSrc', 0, targets.streak0.tex);
  setU(p, 'uSpread', 6.0);
  draw(gl);

  // final
  p = progs.FINAL;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, Hh);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.viewport(film.x, film.y, film.w, film.h);
  gl.useProgram(p.prog);
  bindTex(p, 'uComp', 0, dst.tex);
  bindTex(p, 'uBloom', 1, up[0].tex);
  bindTex(p, 'uStreak', 2, targets.streak1.tex);
  setU(p, 'uRes', film.w, film.h);
  setU(p, 'uOffset', film.x, film.y);
  setU(p, 'uTime', t);
  setU(p, 'uExposure', post.exposure);
  setU(p, 'uSat', post.sat);
  setU(p, 'uContrast', post.contrast);
  setU(p, 'uCA', post.ca + imp * 0.006);
  setU(p, 'uZoomBlur', post.zoomBlur + imp * 0.05);
  setU(p, 'uGrain', post.grain);
  setU(p, 'uVignette', post.vignette);
  setU(p, 'uFlicker', post.flicker);
  setU(p, 'uSepia', post.sepia);
  const fadeIn = Math.min(1, t / 0.6);
  const fadeOut = Math.min(1, Math.max(0, (DURATION - t) / 1.5));
  setU(p, 'uFade', fadeIn * fadeOut);
  setU(p, 'uBloomAmt', post.bloom);
  setU(p, 'uStreakAmt', post.streak);
  setU(p, 'uTint', ...post.tint);
  setU(p, 'uLift', ...post.lift);
  setU(p, 'uStreakTint', ...post.streakTint);
  draw(gl);
  return st;
}

// ------------------------------------------------------------------ loop
let last = performance.now(), ema = 16.7, settle = 0, hudTimer = 0, lastShot = -1;
function frame() {
  if (window.__hold) { requestAnimationFrame(frame); return; }
  const nowMs = performance.now();
  const dt = nowMs - last; last = nowMs;
  let t = now();
  if (t >= DURATION) { pause(); offset = DURATION - 0.001; t = offset; showEnd(); }
  const st = renderFrame(t);

  // Dynamic resolution: hold ~60fps by trading pixels for frame time.
  if (!fixedScale && playing) {
    ema = ema * 0.9 + dt * 0.1;
    if (++settle > 20) {
      if (ema > 19.5) { scale = Math.max(0.35, scale * 0.9); settle = 0; }
      else if (ema < 17.2 && scale < maxScale) { scale = Math.min(maxScale, scale * 1.03); settle = 10; }
    }
  }
  if (st.a !== lastShot) { lastShot = st.a; ui.shot.textContent = SHOTS[st.a].name; }
  ui.time.textContent = `${t.toFixed(1)}s`;
  ui.fill.style.width = `${(t / DURATION) * 100}%`;
  ui.res.textContent = `${Math.round(scale * 100)}% · ${Math.round(1000 / ema)} fps`;
  if (playing && nowMs - hudTimer > 2500) ui.hud.classList.add('hidden');
  requestAnimationFrame(frame);
}

function showEnd() {
  ui.hud.classList.remove('hidden');
}

// ------------------------------------------------------------------ input
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(offset >= DURATION - 0.01 ? 0 : offset); }
  else if (e.code === 'ArrowRight') play(now() + 2);
  else if (e.code === 'ArrowLeft') play(now() - 2);
  else if (e.code === 'KeyR') play(0);
  else if (e.code === 'KeyF') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  else if (e.code === 'KeyH') ui.hud.classList.toggle('hidden');
  else if (e.code === 'KeyM' && audio) audio.gain.gain.value = audio.gain.gain.value > 0 ? 0 : 1;
  else if (e.code === 'KeyQ') { maxScale = maxScale >= 1 ? 0.5 : maxScale + 0.25; scale = Math.min(scale, maxScale); resize(); }
  else if (/^Digit\d$/.test(e.code)) {
    const i = +e.code.slice(5);
    const idx = [0, 1, 2, 7, 8, 10, 14, 15, 18, 19][i];
    play(SHOTS[idx].start);
  }
  hudTimer = performance.now(); ui.hud.classList.remove('hidden');
});
window.addEventListener('mousemove', () => { hudTimer = performance.now(); ui.hud.classList.remove('hidden'); });
ui.scrub.addEventListener('click', (e) => {
  const r = ui.scrub.getBoundingClientRect();
  play(((e.clientX - r.left) / r.width) * DURATION);
});

// ------------------------------------------------------------------ boot
async function compileAll() {
  const total = jobs.length;
  let done = 0;
  const pending = new Set(jobs);
  while (pending.size) {
    for (const j of pending) {
      if (isReady(gl, parallel, j.h)) {
        progs[j.key] = finishProgram(j.h);
        pending.delete(j);
        done++;
        ui.bar.style.width = `${(done / total) * 70}%`;
        ui.status.textContent = `Building universes… ${done}/${total}`;
        if (!parallel) await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (pending.size && parallel) await new Promise((r) => setTimeout(r, 16));
  }
}

async function boot() {
  resize();
  try {
    await document.fonts.load('600 120px Cinzel').catch(() => {});
    titleTex = textureFromCanvas(gl, makeTitleCanvas());
    const scorePromise = noAudio ? Promise.resolve(null) : composeScore(DURATION, (k) => {
      ui.status.textContent = 'Composing the score…';
    });
    await compileAll();
    ui.status.textContent = 'Composing the score…';
    const buffer = await scorePromise;
    ui.bar.style.width = '100%';
    if (buffer) {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const gain = ctx.createGain();
      gain.connect(ctx.destination);
      audio = { ctx, buffer, gain };
    }
    // warm up every program once so the first play has no hitches
    for (let i = 0; i < SHOTS.length; i++) renderScene(i, SHOTS[i].start + 0.5, targets.A, [0, 0, 0]);
    renderFrame(offset);
    ui.status.textContent = 'Headphones on. Lights off.';
    ui.start.disabled = false;
    ui.start.focus();
  } catch (err) {
    console.error(err);
    ui.status.textContent = String(err.message || err).split('\n')[0];
    ui.status.classList.add('error');
    throw err;
  }
  if (params.has('autoplay')) begin();
}

function begin() {
  ui.overlay.classList.add('gone');
  hudTimer = performance.now();
  play(offset);
}
ui.start.addEventListener('click', begin);

boot().then(() => requestAnimationFrame(frame));

// Test hook: render a specific time synchronously (used for stills).
window.__renderAt = (t) => {
  window.__hold = true; renderFrame(t); gl.finish(); return true; };
window.__ready = () => !!progs.FINAL;
