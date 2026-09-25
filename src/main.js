import { createContext, beginProgram, finishProgram, isReady, createTarget, deleteTarget, textureFromCanvas, draw } from './gl.js';
import { HEAD, FOOT } from './shaders/common.js';
import { COMPOSITE, PREFILTER, DOWN, UP, STREAK, FINAL } from './shaders/post.js';
import { SCENES } from './scenes/index.js';
import { menu as MENU_DEF } from './scenes/menu.js';
import { SHOTS, DURATION, frameState, lerpPost, impulse, P } from './timeline.js';
import { composeScore } from './audio.js';
import { makeTitleCanvas } from './title.js';
import { MenuAudio } from './menuAudio.js';
import { AssetLibrary } from './assets.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('film');
const $ = (id) => document.getElementById(id);
const ui = {
  card: $('card'), menu: $('menu'), quip: $('quip'),
  loader: $('loader'), status: $('status'), pct: $('pct'),
  yes: $('opt-yes'), no: $('opt-no'),
  secs: [$('sec-chapters'), $('sec-settings'), $('sec-credits')],
  panel: $('panel'), panelTitle: $('panelTitle'), panelSub: $('panelSub'), panelBack: $('panelBack'),
  pChapters: $('p-chapters'), pSettings: $('p-settings'), pCredits: $('p-credits'),
  hud: $('hud'), shot: $('shot'), time: $('time'), scrub: $('scrub'), fill: $('fill'), res: $('res'),
};

let gl, floatRT, parallel;
try {
  ({ gl, floatRT, parallel } = createContext(canvas));
} catch (e) {
  ui.card.querySelector('.big').textContent = 'This film needs WebGL2';
  ui.card.querySelector('.kicker').textContent = 'Try a recent Chrome, Edge, Firefox or Safari';
  throw e;
}
const assets = new AssetLibrary(gl);

// ------------------------------------------------------------------ settings
const QUALITY = [
  { name: 'Performance', max: 0.5 }, { name: 'Balanced', max: 0.75 },
  { name: 'High', max: 1.0 }, { name: 'Ultra', max: 1.25 },
];
const ASPECTS = [{ name: '2.00 : 1', v: 2.0 }, { name: '2.39 : 1', v: 2.39 }, { name: 'Fill screen', v: 0 }];
const settings = { quality: 2, volume: 90, grain: true, trails: true, aspect: 0 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('multiverse.settings') || '{}')); } catch (e) { /* storage unavailable */ }
function saveSettings() { try { localStorage.setItem('multiverse.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } }

// ------------------------------------------------------------------ programs & scene definitions
const progs = {};
const defs = {};
function defOf(id) {
  const s = id === 'menu' ? MENU_DEF : SCENES[id];
  return typeof s === 'string' ? { glsl: s, uses: {}, env: {} } : { uses: {}, env: {}, ...s };
}
for (const s of SHOTS) defs[s.id] = defOf(s.id);
defs.menu = defOf('menu');

const MENU_SHOT = {
  id: 'menu', start: 0, end: 1e9,
  post: P({ bloom: 0.6, streak: 0.18, streakTint: [1, 0.55, 0.25], grain: 0.035, vignette: 0.25, ca: 0.0012, shake: 0.0012, shakeHz: 0.5 }),
};
const compileNow = (key, src) => { progs[key] = finishProgram(beginProgram(gl, src, key)); };

// ------------------------------------------------------------------ targets
let W = 0, Hh = 0, film = { x: 0, y: 0, w: 1, h: 1 };
let targets = null;
let mode = 'menu';
let maxScale = params.has('max') ? +params.get('max') : QUALITY[settings.quality].max;
let scale = +(params.get('q') || Math.min(0.75, maxScale));
const fixedScale = params.has('q');
let titleTex = null;
let titleRect = [0.05, 0.6, 0.9, 0.25];

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = Math.max(2, Math.floor(canvas.clientWidth * dpr));
  Hh = Math.max(2, Math.floor(canvas.clientHeight * dpr));
  canvas.width = W; canvas.height = Hh;
  const filmAspect = ASPECTS[settings.aspect].v || W / Hh;
  const aspect = mode === 'film' ? filmAspect : W / Hh;
  let fw = W, fh = Math.round(W / aspect);
  if (fh > Hh) { fh = Hh; fw = Math.round(Hh * aspect); }
  film = { x: Math.floor((W - fw) / 2), y: Math.floor((Hh - fh) / 2), w: fw, h: fh };
  const cw = Math.min(fw, 1920), ch = Math.max(2, Math.round(cw / aspect));
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
    A: createTarget(gl, sw, sh, floatRT), B: createTarget(gl, sw, sh, floatRT),
    comp0: createTarget(gl, cw, ch, floatRT), comp1: createTarget(gl, cw, ch, floatRT),
    bloom, up,
    streak0: createTarget(gl, sl.w, sl.h, floatRT), streak1: createTarget(gl, sl.w, sl.h, floatRT),
    frame: 0,
  };
  layoutTitle();
}
function layoutTitle() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const w = Math.min(vw * 0.92, vh * 2.2);
  const h = w / 4;
  const cy = vh * 0.28;
  const cap = h * 0.27;
  const root = document.documentElement.style;
  root.setProperty('--title-top', `${cy - h / 2}px`);
  root.setProperty('--title-h', `${h}px`);
  root.setProperty('--pre-top', `${cy - cap * 0.62 - Math.max(30, vh * 0.045)}px`);
  root.setProperty('--quip-top', `${cy + cap * 0.75 + 18}px`);
  titleRect = [(vw - w) / 2 / vw, 1 - (cy + h / 2) / vh, w / vw, h / vh];
}
window.addEventListener('resize', resize);
const setMode = (m) => { if (m !== mode) { mode = m; resize(); } };

// ------------------------------------------------------------------ audio
let actx = null, menuAudio = null, scoreBuffer = null, master = null, gainNode = null;
const noAudio = params.has('noaudio');
function ensureAudio() {
  if (noAudio) return;
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    actx = new AC();
    master = actx.createGain();
    master.gain.value = settings.volume / 100;
    master.connect(actx.destination);
    gainNode = actx.createGain();
    gainNode.connect(master);
    menuAudio = new MenuAudio(actx, master);
  }
  if (actx.state !== 'running') actx.resume();
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
// Relative cost of each universe's shader (1 = a typical shot), measured offline
// with window.__profileScene.
const COST = {
  eye: 0.25, sanctum: 1.38, firehall: 1.73, cosmos: 0.43, silk: 0.73, crystal: 0.52, canyon: 1.45, ocean: 3.63, city: 2.65, machine: 0.63, boneyard: 1.68, jungle: 1.97, toon: 0.28, ruins: 1.75, voxel: 0.32, paint: 1.02, sepia: 0.78, neon: 0.33, rooftop: 2.65, title: 0.67, menu: 0.57,
};
let lastEffScale = 1;
const smoothNoise = (t, s) => Math.sin(t + s) * 0.5 + Math.sin(t * 2.31 + s * 1.7) * 0.3 + Math.sin(t * 5.17 + s * 3.1) * 0.2;

function renderScene(shot, t, tgt, shake, extra = {}, sc = scale) {
  const p = progs[shot.id];
  const def = defs[shot.id];
  sc = Math.min(maxScale, sc);
  const vw = Math.max(8, Math.floor(targets.sw / maxScale * sc));
  const vh = Math.max(4, Math.floor(targets.sh / maxScale * sc));
  target(tgt, vw, vh);
  gl.useProgram(p.prog);
  setU(p, 'uRes', vw, vh);
  setU(p, 'uT', t - shot.start);
  setU(p, 'uDur', shot.end - shot.start);
  setU(p, 'uG', t);
  setU(p, 'uShake', shake[0], shake[1], shake[2]);
  setU(p, 'uEnvRot', def.env.rot ?? 0);
  setU(p, 'uEnvGain', def.env.gain ?? 1);
  for (const [k, v] of Object.entries(extra)) setU(p, k, ...(Array.isArray(v) ? v : [v]));
  if (titleTex) bindTex(p, 'uTex', 0, titleTex);
  assets.bind(p, def.uses, 1);
  draw(gl);
  return [vw / tgt.w, vh / tgt.h];
}

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
  setU(pr, 'uGrain', settings.grain ? post.grain : 0.004);
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
  if (!settings.trails) post = { ...post, trail: 0, zoomBlur: post.zoomBlur * 0.5 };
  const imp = impulse(t);
  const amp = post.shake + imp * 0.02, hz = post.shakeHz;
  const shake = [smoothNoise(t * hz * 3, 1.3) * amp, smoothNoise(t * hz * 3, 7.1) * amp, smoothNoise(t * hz * 2, 4.2) * amp * 1.5];
  // Predictive resolution: heavy universes (and transitions, which draw two)
  // drop pixels the moment they start instead of stuttering while we react.
  const load = (COST[shotA.id] ?? 1) + (st.b >= 0 ? (COST[SHOTS[st.b].id] ?? 1) : 0);
  const sc = fixedScale ? scale : scale / Math.sqrt(load);
  lastEffScale = sc;
  const scaleA = renderScene(shotA, t, targets.A, shake, {}, sc);
  const scaleB = st.b >= 0 ? renderScene(SHOTS[st.b], t, targets.B, shake, {}, sc) : scaleA;
  const fade = Math.min(1, t / 0.6) * Math.min(1, Math.max(0, (DURATION - t) / 1.5));
  postChain(t, post, scaleA, scaleB, st.cut, st.p, imp, fade);
  return st;
}

// ------------------------------------------------------------------ title screen
const M = {
  t0: performance.now(), form: 0, formTarget: 0, hover: 1, hoverS: 1, noAt: -99, noCount: 0,
  titleAt: -1, awakeAt: -1, awakeS: 0, warp: 0,
};
let leaving = false, warpStart = 0, ready = false, awake = false, returning = false, startAt = null;
const WARP_MS = 2600;

function renderMenu(nowMs) {
  const t = (nowMs - M.t0) / 1000;
  M.form += (M.formTarget - M.form) * 0.035;
  M.hoverS += (M.hover - M.hoverS) * 0.08;
  M.awakeS += ((awake ? 1 : 0) - M.awakeS) * 0.03;
  const warp = leaving ? Math.min(1, (nowMs - warpStart) / WARP_MS) : 0;
  const noT = t - M.noAt;
  const titleIn = M.titleAt < 0 ? 0 : Math.min(1, (nowMs - M.titleAt) / 2600);
  const kick = Math.exp(-noT * 5) * 0.03 + warp * warp * 0.01 + (M.awakeAt > 0 ? Math.exp(-(nowMs - M.awakeAt) / 250) * 0.02 : 0);
  const post = {
    ...MENU_SHOT.post, zoomBlur: warp * warp * 0.3, trail: settings.trails ? warp * 0.5 : 0,
    trailZoom: 0.01 + warp * 0.06, ca: 0.0012 + warp * 0.008,
  };
  const amp = post.shake + kick;
  const shake = [smoothNoise(t * 3, 1.3) * amp, smoothNoise(t * 3, 7.1) * amp, 0];
  const s = renderScene(MENU_SHOT, t, targets.A, shake, {
    uMenu: [M.form, warp, M.hoverS, noT], uTitleRect: titleRect,
    uTitleQ: assets.get('ui:the')?.meta.q ?? 0.925, uTitleIn: titleIn, uAwake: M.awakeS,
  });
  postChain(t, post, s, s, null, 0, 0, Math.min(1, t / 1.5));
  if (leaving && warp >= 1) enterFilm();
}

function setQuip(text) {
  ui.quip.classList.remove('on');
  setTimeout(() => { ui.quip.textContent = text; if (text) ui.quip.classList.add('on'); }, text ? 180 : 0);
}

// Focus model: row 0 = YES / NO, row 1 = Chapters / Settings / Credits.
const rows = [[ui.yes, ui.no], ui.secs];
let cur = { r: 0, c: 0 };
function focusMenu(r, c, sound = true) {
  r = Math.max(0, Math.min(rows.length - 1, r));
  c = ((c % rows[r].length) + rows[r].length) % rows[r].length;
  if (r === cur.r && c === cur.c) return;
  cur = { r, c };
  rows.flat().forEach((b) => b.classList.remove('sel'));
  rows[r][c].classList.add('sel');
  M.hover = r === 0 ? (c === 0 ? 1 : -1) : 0.3;
  if (sound) menuAudio?.hover();
}

const REFUSALS = [
  'The multiverse does not take no for an answer.',
  'Are you sure? Infinite realities are waiting.',
  'There is only one way out of here.',
];
function activate(btn) {
  if (!ready || leaving) return;
  ensureAudio();
  if (btn.dataset.panel) { openPanel(btn.dataset.panel); return; }
  if (btn.dataset.choice === 'no') {
    M.noAt = (performance.now() - M.t0) / 1000;
    menuAudio?.deny();
    btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
    setQuip(REFUSALS[Math.min(M.noCount, REFUSALS.length - 1)]);
    if (++M.noCount >= 3) { btn.querySelector('.label').textContent = 'Yes'; btn.dataset.choice = 'yes'; }
    return;
  }
  enter(startAt ?? (returning ? 0 : offset));
}
function enter(from) {
  if (leaving) return;
  startAt = from;
  leaving = true;
  warpStart = performance.now();
  setQuip('');
  closePanel(false);
  ui.menu.classList.add('leaving');
  menuAudio?.confirm();
}
function enterFilm() {
  leaving = false;
  ui.menu.classList.add('gone');
  document.body.classList.add('playing');
  setMode('film');
  hudTimer = performance.now();
  play(startAt ?? 0);
  startAt = null;
}
function wake() {
  if (awake) return;
  awake = true;
  M.awakeAt = performance.now();
  if (M.titleAt < 0) showTitle();
  ensureAudio();
  menuAudio?.ignite();
  menuAudio?.startAmbient();
  ui.menu.classList.add('awake');
  if (ready) setTimeout(showOptions, 700);
}
function showTitle() {
  if (M.titleAt >= 0) return;
  M.titleAt = performance.now();
  ui.card.classList.add('gone');
  ui.menu.classList.add('titled');
}
function showOptions() {
  if (ui.menu.classList.contains('ready')) return;
  ui.menu.classList.add('ready');
  menuAudio?.reveal();
  ui.yes.focus({ preventScroll: true });
}
function backToMenu() {
  pause();
  offset = 0; returning = true; startAt = null;
  setMode('menu');
  document.body.classList.remove('playing');
  ui.hud.classList.add('hidden');
  M.t0 = performance.now();
  M.form = 0; M.formTarget = 1; M.noCount = 0; M.noAt = -99; M.titleAt = performance.now();
  ui.no.querySelector('.label').textContent = 'No';
  ui.no.dataset.choice = 'no';
  cur = { r: -1, c: -1 }; focusMenu(0, 0, false);
  ui.menu.classList.remove('leaving', 'gone');
  document.getElementById('pre').textContent = 'Do you want to go back into';
  setQuip('');
  menuAudio?.startAmbient();
}

// ------------------------------------------------------------------ panels
const SWATCH = {
  eye: '#ff2a8a,#3a0620', sanctum: '#b8d8ff,#1c1020', firehall: '#ff8a2a,#1a0c08', cosmos: '#4c7dff,#060a24',
  silk: '#ff5aa8,#6a1450', crystal: '#7fe8ff,#0b3b4c', canyon: '#ff9a4a,#6b2410', ocean: '#2fb6d6,#03203a',
  city: '#f2c14a,#5c6b80', machine: '#c8ffff,#2a5a60', boneyard: '#ff8a2a,#2a0c04', jungle: '#b8e060,#123410',
  toon: '#39d04a,#8fb4ff', ruins: '#5f6f7a,#0c1216', voxel: '#ffd27a,#4a3a6a', paint: '#ff3a1a,#6a1ad0',
  sepia: '#d8c098,#40301c', neon: '#58f0ff,#0a3a50', rooftop: '#ffc070,#2e6a2a', title: '#ff3a4a,#1a0440',
};
let panel = null, pIndex = 0;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function buildChapters() {
  ui.pChapters.innerHTML = '';
  SHOTS.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'chap';
    const [a, c] = SWATCH[s.id].split(',');
    b.style.setProperty('--sw', `radial-gradient(120% 140% at 30% 20%, ${a} 0%, ${c} 70%, #000 100%)`);
    b.innerHTML = `<span class="sw"></span><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${s.name}</span><span class="tm">${fmt(s.start)}</span>`;
    b.addEventListener('click', () => { menuAudio?.select(); enter(s.start); });
    b.addEventListener('pointerenter', () => setPIndex(i, false));
    ui.pChapters.appendChild(b);
  });
}
const SETTING_ROWS = [
  { key: 'quality', label: 'Render quality', desc: 'Resolution ceiling. The film still adapts to hold 60 fps.', values: QUALITY.map((q) => q.name) },
  { key: 'aspect', label: 'Aspect ratio', desc: 'Frame the film like the cinema, or fill the screen.', values: ASPECTS.map((a) => a.name) },
  { key: 'volume', label: 'Master volume', desc: 'Score and interface sound.', range: [0, 100, 10] },
  { key: 'trails', label: 'Motion trails', desc: 'The smeared, falling-through-realities look.', values: ['Off', 'On'], bool: true },
  { key: 'grain', label: 'Film grain', desc: 'Organic grain over every frame.', values: ['Off', 'On'], bool: true },
];
function settingValue(r) {
  const v = settings[r.key];
  if (r.range) return `${v}%`;
  return r.values[r.bool ? (v ? 1 : 0) : v];
}
function changeSetting(i, dir) {
  const r = SETTING_ROWS[i];
  if (r.range) settings[r.key] = Math.max(r.range[0], Math.min(r.range[1], settings[r.key] + dir * r.range[2]));
  else if (r.bool) settings[r.key] = !settings[r.key];
  else settings[r.key] = (settings[r.key] + dir + r.values.length) % r.values.length;
  if (r.key === 'quality' && !params.has('max')) { maxScale = QUALITY[settings.quality].max; scale = Math.min(scale, maxScale); resize(); }
  if (r.key === 'volume' && master) master.gain.value = settings.volume / 100;
  saveSettings();
  menuAudio?.hover();
  buildSettings();
}
function buildSettings() {
  ui.pSettings.innerHTML = '';
  SETTING_ROWS.forEach((r, i) => {
    const row = document.createElement('div');
    row.className = 'row' + (panel === 'settings' && i === pIndex ? ' sel' : '');
    row.innerHTML = `<div><div class="l">${r.label}</div><div class="d">${r.desc}</div></div>
      <div class="choice"><button aria-label="Previous">‹</button><span class="v">${settingValue(r)}</span><button aria-label="Next">›</button></div>`;
    const [prev, next] = row.querySelectorAll('button');
    prev.addEventListener('click', () => changeSetting(i, -1));
    next.addEventListener('click', () => changeSetting(i, 1));
    row.addEventListener('pointerenter', () => setPIndex(i, false));
    ui.pSettings.appendChild(row);
  });
}
function buildCredits() {
  const m = assets.manifest || { env: {}, mat: {}, vol: {} };
  const list = (group) => Object.values(group).map((e) => e.credit).filter(Boolean);
  const people = new Map();
  for (const c of [...list(m.env), ...list(m.mat), ...list(m.vol)]) {
    for (const a of c.authors) { if (!people.has(a)) people.set(a, []); people.get(a).push(c.name); }
  }
  const esc = (s) => String(s).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  ui.pCredits.innerHTML = `
    <section><p class="lead">Multiverse</p><p>A real-time procedural film. Every frame is ray-marched live on your GPU; the score is synthesised in the browser.</p></section>
    <section><h3>Created by</h3><p>Shashank Gowda T</p></section>
    <section><h3>Inspired by</h3><p>The multiverse sequence of <em>Doctor Strange in the Multiverse of Madness</em> (Marvel Studios, 2022). A fan tribute, not affiliated with or endorsed by Marvel.</p></section>
    <section><h3>Typefaces</h3><p>Cinzel, Cormorant SC, Cormorant Garamond, Barlow Semi Condensed (SIL Open Font License)</p></section>
    <section><h3>HDRIs, textures and models</h3><p>Poly Haven (CC0). With thanks to:</p></section>
    ${[...people.entries()].map(([a, items]) => `<section><h3>${esc(a)}</h3><p>${items.map(esc).join(', ')}</p></section>`).join('')}`;
}
function openPanel(name) {
  panel = name; pIndex = 0;
  ui.panelTitle.textContent = name[0].toUpperCase() + name.slice(1);
  ui.panelSub.textContent = { chapters: `${SHOTS.length} universes · ${fmt(DURATION)}`, settings: 'Saved on this device', credits: 'All assets CC0 · Poly Haven' }[name];
  ui.pChapters.hidden = name !== 'chapters';
  ui.pSettings.hidden = name !== 'settings';
  ui.pCredits.hidden = name !== 'credits';
  if (name === 'chapters') buildChapters();
  if (name === 'settings') buildSettings();
  if (name === 'credits') buildCredits();
  ui.panel.classList.add('on');
  menuAudio?.open();
  setPIndex(0, false);
}
function closePanel(sound = true) {
  if (!panel) return;
  panel = null;
  ui.panel.classList.remove('on');
  if (sound) menuAudio?.close();
  rows[cur.r]?.[cur.c]?.focus({ preventScroll: true });
}
function panelItems() {
  if (panel === 'chapters') return [...ui.pChapters.children];
  if (panel === 'settings') return [...ui.pSettings.children];
  return [];
}
function setPIndex(i, sound = true) {
  const items = panelItems();
  if (!items.length) return;
  i = Math.max(0, Math.min(items.length - 1, i));
  if (sound && i !== pIndex) menuAudio?.hover();
  pIndex = i;
  items.forEach((el, k) => el.classList.toggle('sel', k === i));
  items[i].scrollIntoView({ block: 'nearest' });
  if (panel === 'chapters') items[i].focus({ preventScroll: true });
}
function panelKey(e) {
  const items = panelItems();
  const code = e.code;
  if (code === 'Escape' || code === 'Backspace') { closePanel(); return; }
  if (panel === 'credits') {
    const f = ui.panel.querySelector('.frame');
    if (code === 'ArrowDown') f.scrollBy({ top: 80 });
    if (code === 'ArrowUp') f.scrollBy({ top: -80 });
    return;
  }
  if (panel === 'chapters') {
    const top = items[0].offsetTop;
    const cols = Math.max(1, items.filter((el) => el.offsetTop === top).length);
    if (code === 'ArrowRight') setPIndex(pIndex + 1);
    else if (code === 'ArrowLeft') setPIndex(pIndex - 1);
    else if (code === 'ArrowDown') setPIndex(pIndex + cols);
    else if (code === 'ArrowUp') setPIndex(pIndex - cols);
    else if (code === 'Enter' || code === 'Space') { e.preventDefault(); items[pIndex].click(); }
  } else if (panel === 'settings') {
    if (code === 'ArrowDown') { setPIndex(pIndex + 1); buildSettings(); }
    else if (code === 'ArrowUp') { setPIndex(pIndex - 1); buildSettings(); }
    else if (code === 'ArrowRight' || code === 'Enter') changeSetting(pIndex, 1);
    else if (code === 'ArrowLeft') changeSetting(pIndex, -1);
  }
}
ui.panelBack.addEventListener('click', () => closePanel());

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
    const t = now();
    if (t >= DURATION) { backToMenu(); return; }
    const st = renderFilm(t);
    if (st.a !== lastShot) { lastShot = st.a; ui.shot.textContent = SHOTS[st.a].name; }
    ui.time.textContent = `${fmt(t)}`;
    ui.fill.style.width = `${(t / DURATION) * 100}%`;
    ui.res.textContent = `${Math.round(Math.min(maxScale, lastEffScale) * 100)}% · ${Math.round(1000 / ema)} fps`;
    if (playing && nowMs - hudTimer > 2500) ui.hud.classList.add('hidden');
  }
  if (!fixedScale && (playing || mode === 'menu')) {
    ema = ema * 0.9 + dt * 0.1;
    if (++settle > 20) {
      if (ema > 19.) { scale = Math.max(0.3, scale * 0.9); settle = 0; }
      else if (ema < 16.9 && scale < maxScale * 1.6) { scale = Math.min(maxScale * 1.6, scale * 1.03); settle = 10; }
    }
  }
}

// ------------------------------------------------------------------ input
window.addEventListener('keydown', (e) => {
  if (mode === 'menu') {
    if (!awake) { e.preventDefault(); wake(); return; }
    ensureAudio();
    if (panel) { panelKey(e); return; }
    if (!ready || leaving || e.repeat) return;
    const k = e.code;
    if (k === 'ArrowLeft' || k === 'KeyA') focusMenu(cur.r, cur.c - 1);
    else if (k === 'ArrowRight' || k === 'KeyD' || k === 'Tab') { e.preventDefault(); focusMenu(cur.r, cur.c + 1); }
    else if (k === 'ArrowDown' || k === 'KeyS') focusMenu(cur.r + 1, cur.r === 0 ? 1 : cur.c);
    else if (k === 'ArrowUp' || k === 'KeyW') focusMenu(cur.r - 1, cur.r === 1 ? 0 : cur.c);
    else if (k === 'Enter' || k === 'Space') { e.preventDefault(); activate(rows[cur.r][cur.c]); }
    else if (k === 'KeyY') activate(ui.yes);
    else if (k === 'KeyN') { focusMenu(0, 1); activate(ui.no); }
    return;
  }
  if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play(offset); }
  else if (e.code === 'ArrowRight') play(now() + 2);
  else if (e.code === 'ArrowLeft') play(now() - 2);
  else if (e.code === 'KeyR') play(0);
  else if (e.code === 'Escape') { backToMenu(); return; }
  else if (e.code === 'KeyF') {
    const pr = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    pr?.catch?.(() => {});
  }
  else if (e.code === 'KeyH') ui.hud.classList.toggle('hidden');
  else if (e.code === 'KeyM' && gainNode) gainNode.gain.value = gainNode.gain.value > 0 ? 0 : 1;
  else if (/^Digit\d$/.test(e.code)) {
    const idx = [0, 1, 2, 7, 8, 10, 14, 15, 18, 19][+e.code.slice(5)];
    play(SHOTS[idx].start);
  }
  hudTimer = performance.now(); ui.hud.classList.remove('hidden');
});
window.addEventListener('pointerdown', () => { if (mode === 'menu' && !awake) wake(); else ensureAudio(); });
window.addEventListener('mousemove', () => {
  if (mode === 'film') { hudTimer = performance.now(); ui.hud.classList.remove('hidden'); }
});
rows.forEach((row, r) => row.forEach((btn, c) => {
  btn.addEventListener('pointerenter', () => { if (ready && !leaving && !panel) focusMenu(r, c); });
  btn.addEventListener('click', (e) => { e.preventDefault(); if (!awake) return; focusMenu(r, c, false); activate(btn); });
}));
ui.scrub.addEventListener('click', (e) => {
  const r = ui.scrub.getBoundingClientRect();
  play(((e.clientX - r.left) / r.width) * DURATION);
});

// ------------------------------------------------------------------ boot
const LOAD_STEPS = [
  'Opening the sanctum', 'Waking the giants', 'Charting deep space', 'Weaving silk', 'Growing crystal',
  'Carving the canyon', 'Filling the ocean', 'Building Manhattan', 'Starting the machine', 'Digging up bones',
  'Planting the jungle', 'Inking the city', 'Breaking the world', 'Stacking blocks', 'Mixing paint',
  'Developing old film', 'Raising glass towers', 'Finding Earth-616', 'Forging the relic', 'Tuning the score',
];
const prog = { shaders: 0, assets: 0, assetTotal: 1, score: noAudio ? 1 : 0 };
function progress() {
  const k = (prog.shaders / SHOTS.length) * 0.5 + (prog.assets / prog.assetTotal) * 0.4 + prog.score * 0.1;
  M.formTarget = Math.max(M.formTarget, k);
  ui.pct.textContent = `${Math.round(k * 100)}%`;
  ui.status.textContent = LOAD_STEPS[Math.min(LOAD_STEPS.length - 1, Math.floor(k * LOAD_STEPS.length))];
}

async function boot() {
  resize();
  for (const [key, src] of Object.entries({ COMPOSITE, PREFILTER, DOWN, UP, STREAK, FINAL })) compileNow(key, src);
  compileNow('menu', HEAD + defs.menu.glsl + FOOT);
  await assets.loadManifest();
  // the title screen's own assets come first
  await assets.load(Object.values(defs.menu.uses));
  requestAnimationFrame(frame);
  setTimeout(showTitle, params.has('autoplay') ? 0 : 2600);

  const scorePromise = noAudio ? Promise.resolve(null) : composeScore(DURATION).then((b) => {
    scoreBuffer = b; prog.score = 1; progress(); return b;
  });
  const keys = new Set();
  for (const s of SHOTS) Object.values(defs[s.id].uses).forEach((k) => keys.add(k));
  prog.assetTotal = Math.max(1, keys.size);
  const assetPromise = assets.load([...keys], (d) => { prog.assets = d; progress(); });
  await document.fonts.load('900 120px Cinzel').catch(() => {});
  titleTex = textureFromCanvas(gl, makeTitleCanvas());

  const pending = SHOTS.map((s) => ({ s, h: beginProgram(gl, HEAD + defs[s.id].glsl + FOOT, s.id) }));
  const left = new Set(pending);
  while (left.size) {
    for (const j of left) {
      if (isReady(gl, parallel, j.h)) {
        progs[j.s.id] = finishProgram(j.h);
        left.delete(j);
        prog.shaders++;
        progress();
        if (!parallel) await new Promise((r) => setTimeout(r, 16));
      }
    }
    if (left.size && parallel) await new Promise((r) => setTimeout(r, 30));
  }
  await assetPromise;
  await scorePromise;
  for (const s of SHOTS) renderScene(s, s.start + 0.5, targets.B, [0, 0, 0]);
  M.formTarget = 1;
  ready = true;
  ui.loader.classList.add('done');
  if (awake) setTimeout(showOptions, 300);
  if (params.has('autoplay')) { wake(); showOptions(); enter(offset); }
}

boot().catch((err) => {
  console.error(err);
  ui.status.textContent = String(err.message || err).split('\n')[0];
  ui.status.classList.add('error');
  ui.menu.classList.add('awake');
});

// Test hooks: render a film time or a title-screen state synchronously.
window.__renderAt = (t) => { window.__hold = true; setMode('film'); renderFilm(t); gl.finish(); return true; };
window.__menuAt = (t, form, warp, hover, titleIn = 1, awakeV = 1, noT = 99) => {
  window.__hold = true;
  setMode('menu');
  const s = renderScene(MENU_SHOT, t, targets.A, [0, 0, 0], {
    uMenu: [form, warp, hover, noT], uTitleRect: titleRect, uTitleQ: assets.get('ui:the')?.meta.q ?? 0.925,
    uTitleIn: titleIn, uAwake: awakeV,
  });
  postChain(t, { ...MENU_SHOT.post, zoomBlur: warp * warp * 0.3, trail: 0, ca: 0.0012 + warp * 0.008 }, s, s, null, 0, 0, 1);
  gl.finish(); return true;
};
window.__ready = () => ready;
window.__ui = { wake, showTitle, showOptions, openPanel, closePanel };
// Profiling hook: time one universe's shader alone (used to balance frame cost).
window.__profileScene = (id, t, n = 3) => {
  window.__hold = true;
  const shot = id === 'menu' ? MENU_SHOT : SHOTS.find((s) => s.id === id);
  const px = new Uint8Array(4);
  const sync = () => { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  renderScene(shot, t, targets.A, [0, 0, 0]); sync();
  const t0 = performance.now();
  for (let i = 0; i < n; i++) { renderScene(shot, t + i * 0.1, targets.A, [0, 0, 0]); sync(); }
  return (performance.now() - t0) / n;
};
