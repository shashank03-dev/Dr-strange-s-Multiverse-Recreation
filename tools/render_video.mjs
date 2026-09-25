#!/usr/bin/env node
// Renders the whole experience -- the title screen, the "yes", the dive and
// the film -- to an MP4, one deterministic frame at a time.
//
//   npx http-server -p 8765 -c-1 .          (in another terminal)
//   node tools/render_video.mjs out/multiverse.mp4
//
// Env: FPS (30), WIDTH (1920), HEIGHT (1080), QUALITY (render scale, 0.7),
//      FROM / TO (frame range, for resuming), FRAMES_DIR, PLAYWRIGHT (module path),
//      FFMPEG (binary), CHROMIUM_ARGS (extra flags, space separated).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

const out = process.argv[2] || 'multiverse.mp4';
const FPS = +(process.env.FPS || 30);
const W = +(process.env.WIDTH || 1920), H = +(process.env.HEIGHT || 1080);
const Q = process.env.QUALITY || '0.7';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FRAMES = process.env.FRAMES_DIR || path.join(path.dirname(path.resolve(out)), 'frames');
const PW = process.env.PLAYWRIGHT || 'playwright';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const URL_BASE = process.env.URL || 'http://localhost:8765/index.html';

const { chromium } = await import(PW);
const { DURATION } = await import(pathToFileURL(path.join(ROOT, 'src/timeline.js')));
const { renderScore } = await import(pathToFileURL(path.join(ROOT, 'src/score.js')));

// ------------------------------------------------------------------ the intro, scripted
const INTRO = 15.2;               // seconds of title screen before the film starts
const clamp = (x) => Math.max(0, Math.min(1, x));
const TOTAL = INTRO + DURATION;
const nFrames = Math.round(TOTAL * FPS);
const from = +(process.env.FROM || 0), to = Math.min(nFrames, +(process.env.TO || nFrames));
fs.mkdirSync(FRAMES, { recursive: true });

const browser = await chromium.launch({ args: (process.env.CHROMIUM_ARGS || '--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist').split(' ') });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('page error:', String(e)));
await page.goto(`${URL_BASE}?noaudio&q=${Q}`);
await page.waitForFunction(() => window.__ready && window.__ready(), null, { timeout: 30 * 60 * 1000 });
await page.addStyleTag({ content: '*{transition:none!important;animation:none!important}' });
await page.evaluate(() => { window.__hold = true; document.getElementById('hud').classList.add('hidden'); });

// Title-screen DOM state for a given video time (the shader state is passed to __menuAt).
async function introFrame(tv, hoverS, awakeS) {
  await page.evaluate(({ tv, hoverS, awakeS }) => {
    const $ = (id) => document.getElementById(id);
    const c = (x) => Math.max(0, Math.min(1, x));
    const card = $('card'), menu = $('menu');
    card.style.display = tv < 3.4 ? '' : 'none';
    card.style.opacity = String(1 - c((tv - 2.6) / 0.8));
    const [em, ki, bi] = [card.querySelector('.emblem'), card.querySelector('.kicker'), card.querySelector('.big')];
    em.style.opacity = String(c((tv - 0.2) / 1.2)); ki.style.opacity = String(c((tv - 0.5) / 1.2)); bi.style.opacity = String(c((tv - 0.8) / 1.2));
    menu.classList.add('titled', 'awake', 'ready');
    const leave = 1 - c((tv - 12.6) / 0.5);
    $('pre').style.opacity = String(c((tv - 3.2) / 1.4) * leave);
    $('pre').style.transform = 'none';
    const press = $('press');
    press.style.opacity = tv > 4.4 && tv < 7.0 ? String(0.35 + 0.65 * (0.5 + 0.5 * Math.cos((tv - 4.4) * 2.6))) : '0';
    $('loader').style.opacity = '0';
    const show = c((tv - 7.8) / 0.8) * leave;
    $('options').style.opacity = String(show); $('options').style.transform = 'none';
    document.querySelector('.rule').style.opacity = String(c((tv - 7.95) / 0.8) * 0.8 * leave); document.querySelector('.rule').style.transform = 'none';
    $('secondary').style.opacity = String(c((tv - 8.1) / 0.8) * leave); $('secondary').style.transform = 'none';
    for (const h of document.querySelectorAll('.hints')) h.style.opacity = String((h.classList.contains('left') ? c((tv - 3.2) / 1.4) : show) * leave);
    const no = tv >= 9.2 && tv < 11.8;
    $('opt-yes').classList.toggle('sel', !no); $('opt-no').classList.toggle('sel', no);
    const shake = tv >= 9.8 && tv < 10.25 ? Math.sin((tv - 9.8) * 60) * 9 * (1 - (tv - 9.8) / 0.45) : 0;
    $('opt-no').style.transform = `translateX(${shake}px)${no ? ' scale(1.05)' : ''}`;
    $('opt-yes').style.transform = no ? 'none' : 'scale(1.05)';
    const quip = $('quip');
    quip.textContent = 'The multiverse does not take no for an answer.';
    quip.style.opacity = String(c((tv - 9.95) / 0.5) * (1 - c((tv - 11.8) / 0.4)) * 0.95);
    quip.style.transform = 'none';
  }, { tv, hoverS, awakeS });
  const form = tv < 7 ? clamp((tv - 3.2) / 4) * 0.75 : 0.75 + 0.25 * clamp((tv - 7) / 1.5);
  const warp = clamp((tv - 12.6) / 2.6);
  const titleIn = clamp((tv - 3.4) / 2.6);
  const noT = tv >= 9.8 ? tv - 9.8 : 99;
  await page.evaluate(([t, f, w, h, ti, a, n]) => window.__menuAt(t, f, w, h, ti, a, n), [tv, form, warp, hoverS, titleIn, awakeS, noT]);
}

// ------------------------------------------------------------------ frames
let hoverS = 1, awakeS = 0;
const t0 = Date.now();
for (let f = 0; f < to; f++) {
  const tv = f / FPS;
  // integrate the title screen's smoothed values even for skipped frames
  const hoverTarget = tv >= 9.2 && tv < 11.8 ? -1 : 1;
  hoverS += (hoverTarget - hoverS) * 0.16;
  awakeS += ((tv >= 7 ? 1 : 0) - awakeS) * 0.06;
  if (f < from) continue;
  const file = path.join(FRAMES, `f${String(f).padStart(5, '0')}.jpg`);
  if (tv < INTRO) {
    await introFrame(tv, hoverS, awakeS);
  } else {
    if (tv - 1 / FPS < INTRO || f === from) await page.evaluate(() => { for (const id of ['menu', 'card', 'panel']) document.getElementById(id).style.display = 'none'; });
    // warm the motion-trail feedback when resuming mid-film
    if (f === from && f > 0) for (let k = 3; k > 0; k--) await page.evaluate((t) => window.__renderAt(t), tv - INTRO - k / FPS);
    await page.evaluate((t) => window.__renderAt(t), tv - INTRO);
  }
  await page.screenshot({ path: file, type: 'jpeg', quality: 94, timeout: 10 * 60 * 1000 });
  if (f % 30 === 0) {
    const done = f - from + 1, per = (Date.now() - t0) / done;
    console.log(`frame ${f}/${nFrames}  ${(per / 1000).toFixed(2)} s/frame  eta ${((to - f) * per / 60000).toFixed(0)} min`);
  }
}

// ------------------------------------------------------------------ sound
// Title-screen sounds, rendered offline in the page with the same code the menu uses.
const menuPCM = await page.evaluate(async () => {
  const { MenuAudio } = await import('/src/menuAudio.js');
  const ctx = new OfflineAudioContext(2, 44100 * 16, 44100);
  const ma = new MenuAudio(ctx);
  let T = 0; ma.now = () => T;
  const at = (t, fn) => { T = t; fn(); };
  at(7.0, () => { ma.ignite(); ma.startAmbient(); clearInterval(ma._crackle); });
  at(7.8, () => ma.reveal());
  at(9.2, () => ma.hover());
  at(9.8, () => ma.deny());
  at(11.8, () => ma.hover());
  at(12.6, () => ma.confirm());
  const buf = await ctx.startRendering();
  const enc = (a) => { const b = new Uint8Array(a.buffer); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
  return [enc(buf.getChannelData(0)), enc(buf.getChannelData(1))];
});
await browser.close();

const dec = (s) => new Float32Array(Buffer.from(s, 'base64').buffer.slice(0));
const [mL, mR] = menuPCM.map(dec);
const [sL, sR] = renderScore(DURATION);
const SR = 44100, N = Math.ceil(TOTAL * SR), off = Math.round(INTRO * SR);
const wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22); wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) {
  let l = (i < mL.length ? mL[i] * 0.9 : 0), r = (i < mR.length ? mR[i] * 0.9 : 0);
  if (i >= off && i - off < sL.length) { l += sL[i - off]; r += sR[i - off]; }
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l)) * 32767), 44 + i * 4);
  wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r)) * 32767), 46 + i * 4);
}
const wavPath = path.join(FRAMES, 'soundtrack.wav');
fs.writeFileSync(wavPath, wav);

// ------------------------------------------------------------------ encode
if (to >= nFrames) {
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.jpg'), '-i', wavPath,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '256k', '-shortest', out], { stdio: 'inherit' });
  console.log('wrote', out);
}
