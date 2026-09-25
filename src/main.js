import { createContext, beginProgram, finishProgram, isReady, createTarget, deleteTarget, textureFromCanvas, draw } from './gl.js';
import { HEAD, FOOT } from './shaders/common.js';
import { COMPOSITE, PREFILTER, DOWN, UP, STREAK, FINAL } from './shaders/post.js';
import { SCENES } from './scenes/index.js';
import { menu as MENU_SRC } from './scenes/menu.js';
import { SHOTS, DURATION, frameState, lerpPost, impulse, P } from './timeline.js';
import { composeScore } from './audio.js';
import { makeTitleCanvas } from './title.js';
import { MenuAudio } from './menuAudio.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('film');
const $ = (id) => document.getElementById(id);
const ui = {
  menu: $('menu'), pre: $('pre'), title: $('title'), quip: $('quip'),
  loader: $('loader'), status: $('status'), bar: $('bar'), pct: $('pct'),
  options: $('options'), yes: $('opt-yes'), no: $('opt-no'),
  hud: $('hud'), shot: $('shot'), time: $('time'), scrub: $('scrub'), fill: $('fill'), res: $('res'),
};

let gl, floatRT, parallel;
try {
  ({ gl, floatRT, parallel } = createContext(canvas));
} catch (e) {
  ui.status.textContent = 'This film needs WebGL2. Try a recent Chrome, Edge, Firefox or Safari.';
  ui.status.classList.add('error');
  throw e;
}

// ------------------------------------------------------------------ programs
const progs = {};
const MENU_SHOT = {
  id: 'menu', start: 0, end: 1e9,
  post: P({ bloom: 1.05, streak: 0.55, streakTint: [1, 0.55, 0.25], grain: 0.04, vignette: 0.25, ca: 0.0015, shake: 0.0015, shakeHz: 0.5 }),
};
function compileNow(key, src) {
  progs[key] = finishProgram(beginProgram(gl, src, key));
}

// ------------------------------------------------------------------ targets
let W = 0, Hh = 0, film = { x: 0, y: 0, w: 1, h: 1 };
let targets = null;
let mode = 'menu';                        // 'menu' | 'film'
let scale = +(params.get('q') || 0.75);
let maxScale = +(params.get('max') || 1.0);
const fixedScale = params.has('q');
let titleTex = null;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(2, Math.floor(canvas.clientWidth * dpr));
  Hh = Math.max(2, Math.floor(canvas.clientHeight * dpr));
  canvas.width = W; canvas.height = Hh;
  // The film is framed 2:1 with letterbox bars; the title screen fills the window.
  const aspect = mode === 'film' ? 2.0 : W / Hh;
  let fw = W, fh = Math.round(W / aspect);
  if (fh > Hh) { fh = Hh; fw = Math.round(Hh * aspect); }
  film = { x: Math.floor((W - fw) / 2), y: Math.floor((Hh - fh) / 2), w: fw, h: fh };
  const cw = Math.min(fw, 2560), ch = Math.max(2, Math.round(cw / aspect));
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
function setMode(m) { if (m !== mode) { mode = m; resize(); } }

// ------------------------------------------------------------------ audio
let actx = null, menuAudio = null, scoreBuffer = null, gainNode = null;
const noAudio = params.has('noaudio');
function ensureAudio() {
  if (noAudio) return;
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();
    gainNode = actx.createGain();
    gainNode.connect(actx.destination);
    menuAudio = new MenuAudio(actx);
  }
  if (actx.state !== 'running') actx.resume();
  if (mode === 'menu' && !leaving) menuAudio.startAmbient();
}

// ------------------------------------------------------------------ film clock
let source = null, playing = false, startedAt = 0, offset = +(params.get('t') || 0);
let wallStart = 0;
const useAudioClock = () => actx && scoreBuffer && !noAudio;
function now() {
  if (!playing) return offset;
  if (useAudioClock()) return actx.currentTime - startedAt;
  return (performance.now() - wallStart) / 1000;
}
function play(from) {
  offset = Math.max(0, Math.min(from, DURATION - 0.01));
  if (useAudioClock()) {
    if (source) try { source.stop(); } catch (e) { /* already stopped */ }
    source = actx.createBufferSource();
    source.buffer = scoreBuffer;
    source.connect(gainNode);
    actx.resume();
    startedAt = actx.currentTime + 0.05 - offset;
    source.start(actx.currentTime + 0.05, offset);
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
  else gl.uniform4f(loc, v[0], v[1], v[2], v[3]);
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

function renderScene(shot, t, tgt, shake, menuU = [0, 0, 0, 99]) {
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
  setU(p, 'uMenu', ...menuU);
  if (titleTex) bindTex(p, 'uTex', 0, titleTex);
  draw(gl);
  return [vw / tgt.w, vh / tgt.h];
}

// composite (transition + trail) -> bloom -> streak -> final grade
function postChain(t, post, scaleA, scaleB, cut, p, imp, fade) {
  const src = targets.frame & 1 ? targets.comp1 : targets.comp0;
  const dst = targets.frame & 1 ? targets.comp0 : targets.comp1;
  targets.frame++;
  let pr = progs.COMPOSITE;
  target(dst);
  gl.useProgram(pr.prog);
  bindTex(pr, 'uA', 0, targets.A.tex);
  bindTex(pr, 'uB', 1, targets.B.tex);
  bindTex(pr, 'uPrev', 2, src.tex);
  setU(pr, 'uScaleA', scaleA[0], scaleA[1]);
  setU(pr, 'uScaleB', scaleB[0], scaleB[1]);
  setU(pr, 'uRes', dst.w, dst.h);
  setU(pr, 'uP', p);
  gl.uniform1i(pr.uniforms.uType, cut ? cut.type : 0);
  const fc = cut ? cut.color : [1, 1, 1];
  setU(pr, 'uFlash', fc[0], fc[1], fc[2]);
  setU(pr, 'uTrail', post.trail);
  setU(pr, 'uTrailZoom', post.trailZoom + imp * 0.02);
  setU(pr, 'uTrailRot', post.trailRot);
  setU(pr, 'uTime', t);
  draw(gl);

  const bl = targets.bloom, up = targets.up;
  pr = progs.PREFILTER;
  target(bl[0]); gl.useProgram(pr.prog);
  bindTex(pr, 'uSrc', 0, dst.tex);
  setU(pr, 'uTexel', 1 / dst.w, 1 / dst.h);
  setU(pr, 'uThreshold', 1.0);
  draw(gl);
  pr = progs.DOWN; gl.useProgram(pr.prog);
  for (let i = 1; i < bl.length; i++) {
    target(bl[i]);
    bindTex(pr, 'uSrc', 0, bl[i - 1].tex);
    setU(pr, 'uTexel', 1 / bl[i - 1].w, 1 / bl[i - 1].h);
    draw(gl);
  }
  pr = progs.UP; gl.useProgram(pr.prog);
  let prev = bl[bl.length - 1];
  for (let i = bl.length - 2; i >= 0; i--) {
    target(up[i]);
    bindTex(pr, 'uSrc', 0, prev.tex);
    bindTex(pr, 'uBase', 1, bl[i].tex);
    setU(pr, 'uTexel', 1 / prev.w, 1 / prev.h);
    setU(pr, 'uDstTexel', 1 / up[i].w, 1 / up[i].h);
    setU(pr, 'uW', 1.0);
    draw(gl);
    prev = up[i];
  }
  const si = Math.min(2, bl.length - 1);
  pr = progs.STREAK; gl.useProgram(pr.prog);
  target(targets.streak0);
  bindTex(pr, 'uSrc', 0, bl[si].tex);
  setU(pr, 'uTexel', 1 / bl[si].w, 1 / bl[si].h);
  setU(pr, 'uSpread', 2.0);
  draw(gl);
  target(targets.streak1);
  bindTex(pr, 'uSrc', 0, targets.streak0.tex);
  setU(pr, 'uSpread', 6.0);
  draw(gl);

  pr = progs.FINAL;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, W, Hh);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.viewport(film.x, film.y, film.w, film.h);
  gl.useProgram(pr.prog);
  bindTex(pr, 'uComp', 0, dst.tex);
  bindTex(pr, 'uBloom', 1, up[0].tex);
  bindTex(pr, 'uStreak', 2, targets.streak1.tex);
  setU(pr, 'uRes', film.w, film.h);
  setU(pr, 'uOffset', film.x, film.y);
  setU(pr, 'uTime', t);
  setU(pr, 'uExposure', post.exposure);
  setU(pr, 'uSat', post.sat);
  setU(pr, 'uContrast', post.contrast);
  setU(pr, 'uCA', post.ca + imp * 0.006);
  setU(pr, 'uZoomBlur', post.zoomBlur + imp * 0.05);
  setU(pr, 'uGrain', post.grain);
  setU(pr, 'uVignette', post.vignette);
  setU(pr, 'uFlicker', post.flicker);
  setU(pr, 'uSepia', post.sepia);
  setU(pr, 'uFade', fade);
  setU(pr, 'uBloomAmt', post.bloom);
  setU(pr, 'uStreakAmt', post.streak);
  setU(pr, 'uTint', ...post.tint);
  setU(pr, 'uLift', ...post.lift);
  setU(pr, 'uStreakTint', ...post.streakTint);
  draw(gl);
}

function renderFilm(t) {
  const st = frameState(t);
  const shotA = SHOTS[st.a];
  let post = shotA.post;
  if (st.b >= 0) post = lerpPost(shotA.post, SHOTS[st.b].post, Math.min(1, Math.max(0, (st.p - 0.35) / 0.3)));
  const imp = impulse(t);
  const amp = post.shake + imp * 0.02, hz = post.shakeHz;
  const shake = [smoothNoise(t * hz * 3, 1.3) * amp, smoothNoise(t * hz * 3, 7.1) * amp, smoothNoise(t * hz * 2, 4.2) * amp * 1.5];
  const scaleA = renderScene(shotA, t, targets.A, shake);
  const scaleB = st.b >= 0 ? renderScene(SHOTS[st.b], t, targets.B, shake) : scaleA;
  const fade = Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (DURATION - t) / 1.5));
  postChain(t, post, scaleA, scaleB, st.cut, st.p, imp, fade);
  return st;
}

// ------------------------------------------------------------------ title screen state
const menuState = { t0: performance.now(), form: 0, formTarget: 0, hover: 1, hoverS: 1, noAt: -99, noCount: 0, warp: 0 };
let leaving = false, warpStart = 0, ready = false, returning = false;
const WARP_MS = 2600;

function renderMenu(nowMs) {
  const t = (nowMs - menuState.t0) / 1000;
  menuState.form += (menuState.formTarget - menuState.form) * 0.04;
  menuState.hoverS += (menuState.hover - menuState.hoverS) * 0.08;
  const warp = leaving ? Math.min(1, (nowMs - warpStart) / WARP_MS) : 0;
  menuState.warp = warp;
  const noT = t - menuState.noAt;
  const kick = Math.exp(-noT * 5) * 0.03 + warp * warp * 0.01;
  const post = { ...MENU_SHOT.post, zoomBlur: warp * warp * 0.3, trail: warp * 0.5, trailZoom: 0.01 + warp * 0.06, ca: 0.0015 + warp * 0.008 };
  const amp = post.shake + kick;
  const shake = [smoothNoise(t * 3, 1.3) * amp, smoothNoise(t * 3, 7.1) * amp, 0];
  const s = renderScene(MENU_SHOT, t, targets.A, shake, [menuState.form, warp, menuState.hoverS, noT]);
  postChain(t, post, s, s, null, 0, 0, Math.min(1, t / 1.2));
  if (leaving && warp >= 1) enterFilm();
}

// Wrap each character in a span so the question can be revealed letter by letter.
function spell(el, text, delay = 0) {
  el.innerHTML = '';
  [...text].forEach((ch, i) => {
    const s = document.createElement('span');
    s.className = 'ch'; s.textContent = ch; s.style.setProperty('--i', i); s.style.setProperty('--d', `${delay}ms`);
    el.appendChild(s);
  });
}
function showQuestion(pre, title) {
  ui.menu.classList.remove('reveal');
  spell(ui.pre, pre);
  spell(ui.title, title, 700);
  const q = document.createElement('span');
  q.className = 'ch qm'; q.textContent = '?';
  q.style.setProperty('--i', title.length + 3); q.style.setProperty('--d', '900ms');
  ui.title.appendChild(q);
  ui.title.setAttribute('aria-label', `${pre} ${title}?`);
  void ui.menu.offsetWidth;
  ui.menu.classList.add('reveal');
}
function setQuip(text) {
  ui.quip.classList.remove('on');
  setTimeout(() => { ui.quip.textContent = text; if (text) ui.quip.classList.add('on'); }, text ? 180 : 0);
}

let sel = 'yes';
function select(which, withSound = true) {
  if (which === sel) return;
  sel = which;
  ui.yes.classList.toggle('sel', which === 'yes');
  ui.no.classList.toggle('sel', which === 'no');
  menuState.hover = which === 'yes' ? 1 : -1;
  if (withSound && menuAudio) menuAudio.hover();
}

const REFUSALS = [
  'The multiverse does not take no for an answer.',
  'Are you sure? Infinite realities are waiting.',
  'There is only one way out of here.',
];
function choose(which) {
  if (!ready || leaving) return;
  ensureAudio();
  if (which === 'no') {
    menuState.noAt = (performance.now() - menuState.t0) / 1000;
    menuAudio?.deny();
    ui.no.classList.remove('shake'); void ui.no.offsetWidth; ui.no.classList.add('shake');
    setQuip(REFUSALS[Math.min(menuState.noCount, REFUSALS.length - 1)]);
    menuState.noCount++;
    if (menuState.noCount >= 3) {
      // the multiverse decides for you
      ui.no.querySelector('.label').textContent = 'Yes';
      ui.no.dataset.choice = 'yes';
    }
    return;
  }
  leaving = true;
  warpStart = performance.now();
  setQuip('');
  ui.menu.classList.add('leaving');
  menuAudio?.confirm();
}

function enterFilm() {
  leaving = false;
  ui.menu.classList.add('gone');
  document.body.classList.add('playing');
  setMode('film');
  hudTimer = performance.now();
  play(returning ? 0 : offset);
}

function backToMenu() {
  pause();
  offset = 0;
  returning = true;
  setMode('menu');
  document.body.classList.remove('playing');
  ui.hud.classList.add('hidden');
  menuState.t0 = performance.now();
  menuState.form = 0; menuState.formTarget = 1; menuState.noCount = 0; menuState.noAt = -99;
  ui.no.querySelector('.label').textContent = 'No';
  ui.no.dataset.choice = 'no';
  select('yes', false);
  ui.menu.classList.remove('leaving', 'gone');
  showQuestion('Do you want to go back into', 'The Multiverse');
  setQuip('');
  menuAudio?.startAmbient();
}

// ------------------------------------------------------------------ loop
let last = performance.now(), ema = 16.7, settle = 0, hudTimer = 0, lastShot = -1;
function frame() {
  requestAnimationFrame(frame);
  if (window.__hold) return;
  const nowMs = performance.now();
  const dt = nowMs - last; last = nowMs;
  if (!targets || !progs.FINAL || !progs.menu) return;

  if (mode === 'menu') {
    renderMenu(nowMs);
  } else {
    let t = now();
    if (t >= DURATION) { backToMenu(); return; }
    const st = renderFilm(t);
    if (st.a !== lastShot) { lastShot = st.a; ui.shot.textContent = SHOTS[st.a].name; }
    ui.time.textContent = `${t.toFixed(1)}s`;
    ui.fill.style.width = `${(t / DURATION) * 100}%`;
    ui.res.textContent = `${Math.round(scale * 100)}% · ${Math.round(1000 / ema)} fps`;
    if (playing && nowMs - hudTimer > 2500) ui.hud.classList.add('hidden');
  }
  // Dynamic resolution: hold ~60fps by trading pixels for frame time.
  if (!fixedScale && (playing || mode === 'menu')) {
    ema = ema * 0.9 + dt * 0.1;
    if (++settle > 20) {
      if (ema > 19.5) { scale = Math.max(0.35, scale * 0.9); settle = 0; }
      else if (ema < 17.2 && scale < maxScale) { scale = Math.min(maxScale, scale * 1.03); settle = 10; }
    }
  }
}

// ------------------------------------------------------------------ input
window.addEventListener('keydown', (e) => {
  if (e.repeat && mode === 'menu') return;
  if (mode === 'menu') {
    ensureAudio();
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab', 'KeyA', 'KeyD'].includes(e.code)) {
      e.preventDefault();
      if (ready) select(sel === 'yes' ? 'no' : 'yes');
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      const btn = sel === 'yes' ? ui.yes : ui.no;
      choose(btn.dataset.choice);
    } else if (e.code === 'KeyY') choose('yes');
    else if (e.code === 'KeyN') { select('no'); choose(ui.no.dataset.choice); }
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(offset); }
  else if (e.code === 'ArrowRight') play(now() + 2);
  else if (e.code === 'ArrowLeft') play(now() - 2);
  else if (e.code === 'KeyR') play(0);
  else if (e.code === 'Escape') { backToMenu(); return; }
  else if (e.code === 'KeyF') {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    p?.catch?.(() => {});
  }
  else if (e.code === 'KeyH') ui.hud.classList.toggle('hidden');
  else if (e.code === 'KeyM' && gainNode) gainNode.gain.value = gainNode.gain.value > 0 ? 0 : 1;
  else if (e.code === 'KeyQ') { maxScale = maxScale >= 1 ? 0.5 : maxScale + 0.25; scale = Math.min(scale, maxScale); resize(); }
  else if (/^Digit\d$/.test(e.code)) {
    const idx = [0, 1, 2, 7, 8, 10, 14, 15, 18, 19][+e.code.slice(5)];
    play(SHOTS[idx].start);
  }
  hudTimer = performance.now(); ui.hud.classList.remove('hidden');
});
window.addEventListener('pointerdown', () => ensureAudio());
window.addEventListener('mousemove', () => {
  if (mode === 'film') { hudTimer = performance.now(); ui.hud.classList.remove('hidden'); }
});
for (const btn of [ui.yes, ui.no]) {
  btn.addEventListener('pointerenter', () => { if (ready && !leaving) select(btn.id === 'opt-yes' ? 'yes' : 'no'); });
  btn.addEventListener('click', (e) => { e.preventDefault(); select(btn.id === 'opt-yes' ? 'yes' : 'no', false); choose(btn.dataset.choice); });
}
ui.scrub.addEventListener('click', (e) => {
  const r = ui.scrub.getBoundingClientRect();
  play(((e.clientX - r.left) / r.width) * DURATION);
});

// ------------------------------------------------------------------ boot
const LOAD_STEPS = [
  'Drawing the circle', 'Lighting the sanctum', 'Waking the giants', 'Charting deep space', 'Weaving silk',
  'Growing crystal', 'Carving the canyon', 'Filling the ocean', 'Building Manhattan', 'Starting the machine',
  'Digging up bones', 'Planting the jungle', 'Inking the city', 'Breaking the world', 'Stacking blocks',
  'Mixing paint', 'Developing old film', 'Raising glass towers', 'Finding Earth-616', 'Forging the relic',
];
let scoreDone = noAudio;
function progress(done, total) {
  const k = (done + (scoreDone ? 1 : 0)) / (total + 1);
  menuState.formTarget = Math.max(menuState.formTarget, k);
  ui.bar.style.width = `${k * 100}%`;
  ui.pct.textContent = `${Math.round(k * 100)}%`;
}

async function boot() {
  resize();
  showQuestion('Do you want to enter', 'The Multiverse');
  // Post chain and the title screen first, so something beautiful is on screen at once.
  for (const [key, src] of Object.entries({ COMPOSITE, PREFILTER, DOWN, UP, STREAK, FINAL })) compileNow(key, src);
  compileNow('menu', HEAD + MENU_SRC + FOOT);
  requestAnimationFrame(frame);

  let doneCount = 0;
  const scorePromise = noAudio ? Promise.resolve(null) : composeScore(DURATION).then((b) => {
    scoreBuffer = b; scoreDone = true; progress(doneCount, SHOTS.length);
    return b;
  });
  await document.fonts.load('900 120px Cinzel').catch(() => {});
  titleTex = textureFromCanvas(gl, makeTitleCanvas());

  // Universes compile one by one (in parallel where the driver allows) while the circle draws.
  const pending = [];
  for (let i = 0; i < SHOTS.length; i++) {
    const s = SHOTS[i];
    const h = beginProgram(gl, HEAD + SCENES[s.id] + FOOT, s.id);
    pending.push({ s, h });
    if (!parallel) {
      progs[s.id] = finishProgram(h);
      doneCount++;
      ui.status.textContent = LOAD_STEPS[Math.min(doneCount, LOAD_STEPS.length - 1)];
      progress(doneCount, SHOTS.length);
      await new Promise((r) => setTimeout(r, 30));
    }
  }
  if (parallel) {
    const left = new Set(pending);
    while (left.size) {
      for (const j of left) {
        if (isReady(gl, parallel, j.h)) {
          progs[j.s.id] = finishProgram(j.h);
          left.delete(j);
          doneCount++;
          ui.status.textContent = LOAD_STEPS[Math.min(doneCount, LOAD_STEPS.length - 1)];
          progress(doneCount, SHOTS.length);
        }
      }
      if (left.size) await new Promise((r) => setTimeout(r, 30));
    }
  }
  ui.status.textContent = 'Composing the score';
  await scorePromise;
  progress(SHOTS.length, SHOTS.length);
  // Warm each universe up once so the first jump has no hitches.
  for (const s of SHOTS) renderScene(s, s.start + 0.5, targets.B, [0, 0, 0]);
  menuState.formTarget = 1;
  ready = true;
  ui.status.textContent = 'Ready';
  ui.loader.classList.add('done');
  setTimeout(() => ui.options.classList.add('on'), 250);
  ui.yes.focus({ preventScroll: true });
  menuAudio?.reveal();
  if (params.has('autoplay')) choose('yes');
}

boot().catch((err) => {
  console.error(err);
  ui.status.textContent = String(err.message || err).split('\n')[0];
  ui.status.classList.add('error');
});

// Test hooks: render a film time or a title-screen state synchronously.
window.__renderAt = (t) => {
  window.__hold = true;
  setMode('film');
  renderFilm(t); gl.finish(); return true;
};
window.__menuAt = (t, form, warp, hover, noT = 99) => {
  window.__hold = true;
  setMode('menu');
  const s = renderScene(MENU_SHOT, t, targets.A, [0, 0, 0], [form, warp, hover, noT]);
  const post = { ...MENU_SHOT.post, zoomBlur: warp * warp * 0.3, trail: 0, ca: 0.0015 + warp * 0.008 };
  postChain(t, post, s, s, null, 0, 0, 1);
  gl.finish(); return true;
};
window.__ready = () => ready;
