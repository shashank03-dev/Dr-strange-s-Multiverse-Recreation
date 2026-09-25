// The score. D minor, 140 bpm, a pedal D under everything; every hit is
// placed on the frame of the cut it belongs to.

import { CUTS, SHOTS } from './timeline.js';
import { SR, Bus, mulberry32, mtof, voice, adsr, ramp, expSweep, filterBus, reverb, master } from './synth.js';

const S16 = 60 / 140 / 4;

// One chord per universe (MIDI root, quality).
const HARMONY = {
  eye: [50, 'm'], sanctum: [50, 'm'], firehall: [50, 'm'], cosmos: [46, 'M'], silk: [43, 'm'],
  crystal: [45, 'M'], canyon: [45, 'M'], ocean: [41, 'M'], city: [50, 'm'], machine: [48, 'M'],
  boneyard: [46, 'M'], jungle: [41, 'M'], toon: [48, 'M'], ruins: [43, 'm'], voxel: [46, 'M'],
  paint: [41, 'M'], sepia: [50, 'm'], neon: [45, 'M'], rooftop: [50, 'M'], title: [50, 'm'],
};
const tonesOf = ([r, q]) => [r, r + (q === 'm' ? 3 : 4), r + 7];

export function renderScore(duration) {
  const N = Math.ceil(duration * SR);
  const rnd = mulberry32(1987);
  const music = new Bus(N), sfx = new Bus(N), send = new Bus(N);
  const shot = (id) => SHOTS.find((s) => s.id === id);
  const ocean = shot('ocean');
  const V = (o) => voice(o, rnd);

  // ---------------------------------------------------------------- music
  // Pedal drone: D1 + A1 saws in a dark filter that slowly opens.
  V({
    out: music, t0: 0, len: duration,
    env: ramp([[0, 0], [2.5, 0.07], [8.4, 0.09], [duration - 3, 0.09], [duration, 0]]),
    oscs: [{ type: 'saw', f: 36.71 }, { type: 'saw', f: 36.71, detune: 9 }, { type: 'saw', f: 55, amp: 0.7 }, { type: 'sin', f: 36.71, amp: 1.0 }],
    filters: [{ type: 'lp', f: ramp([[0, 110], [8.4, 380], [45, 260], [duration, 150]]), q: 2.5 }],
  });

  // Choir: detuned saw stacks through "ah" formants, one chord per realm.
  for (const s of SHOTS) {
    const tones = tonesOf(HARMONY[s.id]);
    const t0 = Math.max(0, s.start - 0.15), len = s.end - s.start + 0.8;
    const peak = s.id === 'eye' ? 0.04 : s.id === 'title' ? 0.12 : s.id === 'rooftop' ? 0.1 : 0.075;
    const notes = [tones[0] + 12, tones[1] + 12, tones[2] + 12, tones[0] + 24, tones[1] + 24];
    const oscs = [];
    for (const m of notes) for (const dt of [-9, 0, 8]) oscs.push({ type: 'saw', f: mtof(m), detune: dt + (rnd() - 0.5) * 5, amp: 0.3 });
    V({
      out: music, send, sendAmt: 0.8, t0, len, vib: 5, vibRate: 4.8,
      env: ramp([[0, 0], [0.35, peak], [len - 0.8, peak], [len, 0]]),
      oscs, parallel: true,
      filters: [{ type: 'bp', f: 730, q: 5, amp: 1.2 }, { type: 'bp', f: 1090, q: 6, amp: 0.7 }, { type: 'bp', f: 2440, q: 8, amp: 0.35 }],
    });
  }

  // Driving string ostinato through the jump sequence.
  {
    const start = shot('firehall').start, end = shot('rooftop').start;
    const pat = [0, 12, 7, 12, 0, 12, 3, 12, 0, 12, 7, 12, 0, 15, 12, 7];
    const steps = Math.floor((end - start) / S16);
    for (let i = 0; i < steps; i++) {
      const t = start + i * S16;
      const s = SHOTS.find((x) => t >= x.start && t < x.end);
      const [root, q] = HARMONY[s.id];
      let iv = pat[i % 16];
      if (iv === 3 && q === 'M') iv = 4;
      if (iv === 15 && q === 'M') iv = 16;
      if (s.id === 'ocean' && i % 4) continue;
      const acc = i % 4 === 0 ? 1 : 0.62;
      const f = mtof(root + iv);
      V({
        out: music, send, sendAmt: 0.25, t0: t, len: S16 * 2.2, pan: i % 2 ? 0.35 : -0.35,
        env: adsr(0.004, 0.1 * acc, 0.02, S16 * 1.2),
        oscs: [{ type: 'saw', f, detune: -6 }, { type: 'sqr', f, detune: 6, amp: 0.6 }],
        filters: [{ type: 'lp', f: expSweep(3800 * acc, 450, S16 * 1.2), q: 3 }],
      });
      // octave-down cello doubling on the downbeats
      if (i % 4 === 0) {
        V({
          out: music, t0: t, len: S16 * 4, env: adsr(0.006, 0.05, S16, S16 * 2),
          oscs: [{ type: 'saw', f: f / 2 }], filters: [{ type: 'lp', f: expSweep(1400, 300, S16 * 3), q: 2 }],
        });
      }
    }
  }

  // War drums in the most violent stretches.
  const drum = (t, gain) => {
    V({ out: sfx, t0: t, len: 0.7, env: adsr(0.002, gain, 0.01, 0.4), oscs: [{ type: 'sin', f: expSweep(130, 38, 0.3) }] });
    V({ out: sfx, t0: t, len: 0.15, env: adsr(0.001, gain * 0.35, 0.004, 0.06), oscs: [{ type: 'noise' }], filters: [{ type: 'lp', f: 1000, q: 0.8 }] });
  };
  for (const [a, b] of [[shot('city').start, shot('voxel').start], [shot('paint').start, shot('rooftop').start - 0.3]]) {
    const beat = S16 * 4;
    for (let t = a, k = 0; t < b; t += beat / 2, k++) if (k % 8 === 0 || k % 8 === 3 || k % 8 === 6) drum(t, k % 8 === 0 ? 0.55 : 0.32);
  }

  // ---------------------------------------------------------------- cut design
  const whoosh = (t, len, gain) => V({
    out: sfx, send, sendAmt: 0.3, t0: t - len, len: len + 0.35, pan: (rnd() - 0.5) * 0.6,
    env: (x) => (x < len ? gain * Math.pow(x / len, 3) : gain * Math.exp(-(x - len) * 25)),
    oscs: [{ type: 'noise' }], filters: [{ type: 'bp', f: expSweep(250, 5000, len), q: 1.3 }],
  });
  const boom = (t, gain) => {
    V({ out: sfx, t0: t, len: 2.2, env: adsr(0.003, gain, 0.05, 1.5), oscs: [{ type: 'sin', f: expSweep(78, 26, 1.4) }] });
    V({ out: sfx, send, sendAmt: 0.5, t0: t, len: 0.9, env: adsr(0.002, gain * 0.55, 0.02, 0.45), oscs: [{ type: 'noise' }], filters: [{ type: 'lp', f: expSweep(1200, 200, 0.5), q: 0.8 }] });
  };
  const glass = (t, amount) => {
    for (let i = 0; i < 46 * amount; i++) {
      const tt = t + Math.pow(rnd(), 2) * 0.7, dec = 0.05 + rnd() * 0.35;
      V({ out: sfx, send, sendAmt: 0.6, t0: tt, len: dec * 1.2, pan: rnd() * 1.6 - 0.8,
        env: adsr(0.001, 0.02 + rnd() * 0.035, 0, dec), oscs: [{ type: 'sin', f: 2200 + rnd() * 7000 }] });
    }
    V({ out: sfx, send, sendAmt: 0.4, t0: t, len: 0.6, env: adsr(0.002, 0.25 * amount, 0.03, 0.35), oscs: [{ type: 'noise' }], filters: [{ type: 'hp', f: 3500, q: 0.7 }] });
  };
  const crackle = (t0, t1, density, gain) => {
    const n = Math.floor((t1 - t0) * density);
    for (let i = 0; i < n; i++) {
      const t = t0 + rnd() * (t1 - t0), d = 0.004 + rnd() * 0.03;
      V({ out: sfx, send, sendAmt: 0.3, t0: t, len: d * 1.5, pan: rnd() * 2 - 1,
        env: adsr(0.0008, gain * (0.3 + rnd()), 0, d), oscs: [{ type: 'noise' }], filters: [{ type: 'hp', f: 1500 + rnd() * 4000, q: 0.6 }] });
    }
  };
  const brass = (t, id, gain, len = 1.4) => {
    const tones = tonesOf(HARMONY[id]);
    const oscs = [];
    for (const m of [tones[0] - 12, tones[0], tones[2], tones[0] + 12, tones[1] + 12]) for (const dt of [-8, 0, 9]) oscs.push({ type: 'saw', f: mtof(m), detune: dt, amp: 0.4 });
    V({ out: music, send, sendAmt: 0.6, t0: t, len: len * 1.6, env: adsr(0.03, gain, len * 0.3, len),
      oscs, filters: [{ type: 'lp', f: (x) => (x < 0.08 ? 300 * Math.pow(2600 / 300, x / 0.08) : 2600 * Math.pow(700 / 2600, Math.min((x - 0.08) / len, 1))), q: 1.5 }] });
  };
  const chime = (t, id) => {
    const tones = tonesOf(HARMONY[id]);
    for (let i = 0; i < 9; i++) {
      const m = tones[i % 3] + 36 + 12 * Math.floor(i / 3), tt = t + i * 0.035;
      V({ out: sfx, send, sendAmt: 0.8, t0: tt, len: 1.8, pan: (i / 8) * 1.6 - 0.8, env: adsr(0.002, 0.04, 0, 1.4),
        oscs: [{ type: 'sin', f: mtof(m) }, { type: 'sin', f: mtof(m) * 2.76, amp: 0.3 }] });
    }
  };
  const reverseSwell = (t, len, gain) => V({
    out: sfx, send, sendAmt: 0.5, t0: t - len, len: len + 0.02,
    env: (x) => gain * Math.pow(Math.min(x / len, 1), 3), oscs: [{ type: 'noise' }], filters: [{ type: 'hp', f: 4000, q: 0.6 }],
  });
  const zap = (t0, t1, gain) => V({
    out: sfx, send, sendAmt: 0.4, t0, len: t1 - t0,
    env: ramp([[0, 0], [0.6, gain], [t1 - t0 - 0.2, gain * 1.4], [t1 - t0, 0]]),
    oscs: [{ type: 'saw', f: 58 }, { type: 'saw', f: 87.3, detune: 7 }],
    filters: [{ type: 'bp', f: (x) => 600 + 2200 * (0.5 + 0.5 * Math.sin(x * 17.3) * Math.sin(x * 5.1)), q: 5 }],
  });

  const BIG = new Set(['sanctum', 'firehall', 'ocean', 'boneyard', 'voxel', 'rooftop', 'title']);
  for (const c of CUTS) {
    const next = SHOTS.find((s) => Math.abs(s.start - c.t) < 1e-6);
    const big = BIG.has(next.id) && next.id !== 'sanctum';
    whoosh(c.t, 0.55 + c.dur * 0.4, big ? 0.5 : 0.32);
    boom(c.t, big ? 0.9 : 0.5);
    if (c.type === 1) reverseSwell(c.t, 0.6, 0.16);
    if (c.type === 2) glass(c.t, 1);
    if (c.type === 3) crackle(c.t - 0.6, c.t + 0.4, 90, 0.2);
    if (c.type === 5) { chime(c.t, next.id); glass(c.t, 0.5); }
    if (big) brass(c.t, next.id, next.id === 'title' ? 0.14 : 0.1, next.id === 'title' ? 3.5 : 1.4);
  }

  // ---------------------------------------------------------------- scene design
  // The spark: a trembling high cluster swelling into the first flash.
  for (const [m, d] of [[86, 0], [93, 5], [100, -4], [98, 7]]) {
    const sp = shot('eye').len;
    V({ out: music, send, sendAmt: 0.9, t0: 0.2, len: sp + 0.6, vib: 12, vibRate: 7 + rnd() * 3,
      env: (x) => 0.022 * Math.pow(Math.min(x / (sp - 0.6), 1), 2) * (x > sp - 0.2 ? Math.exp(-(x - sp + 0.2) * 5) : 1),
      oscs: [{ type: 'sin', f: mtof(m), detune: d }] });
  }
  // The rift: electric hum and crackling that intensify until we are pulled in.
  const sanct = shot('sanctum');
  zap(sanct.start + 0.6, sanct.end + 0.1, 0.05);
  crackle(sanct.start + 1.0, sanct.end, 30, 0.1);
  crackle(sanct.end - 2.4, sanct.end, 60, 0.14);
  // Wind of the fall.
  const windA = shot('firehall').start - 0.2, windB = shot('rooftop').start + 0.7;
  V({
    out: sfx, t0: windA, len: windB - windA,
    env: ramp([[0, 0], [0.6, 0.12], [ocean.start - windA - 0.1, 0.12], [ocean.start - windA + 0.4, 0.02], [ocean.end - windA - 0.2, 0.02], [ocean.end - windA + 0.4, 0.1], [windB - windA - 1.3, 0.1], [windB - windA, 0]]),
    oscs: [{ type: 'noise' }],
    filters: [{ type: 'bp', f: (x) => 700 + 500 * Math.sin(x * 1.7) + 400 * Math.sin(x * 4.3), q: 0.8 }],
  });
  // Ocean: bubbles.
  for (let i = 0; i < 40; i++) {
    const t = ocean.start + 0.2 + rnd() * (ocean.end - ocean.start - 0.4), f = 300 + rnd() * 500;
    V({ out: sfx, t0: t, len: 0.1, pan: rnd() * 1.4 - 0.7, env: adsr(0.002, 0.03 + rnd() * 0.03, 0, 0.06), oscs: [{ type: 'sin', f: expSweep(f, f * 2.8, 0.05) }] });
  }
  // Manhattan: a distant taxi horn.
  V({ out: sfx, send, sendAmt: 0.6, t0: shot('city').start + 0.9, len: 0.4, pan: 0.5, env: adsr(0.01, 0.03, 0.28, 0.05),
    oscs: [{ type: 'sqr', f: 415 }, { type: 'sqr', f: 349 }], filters: [{ type: 'lp', f: 1800, q: 1 }] });
  // Earth-616: the portal collapses, then birdsong in the quiet.
  {
    const r = shot('rooftop');
    crackle(r.start, r.start + 3.2, 25, 0.09);
    boom(r.start + 3.3, 0.5); chime(r.start + 3.3, 'rooftop');
    for (let i = 0; i < 7; i++) {
      const t = r.start + 3.6 + i * 0.13 + (i > 3 ? 0.4 : 0);
      V({ out: sfx, send, sendAmt: 0.5, t0: t, len: 0.12, pan: 0.6, env: adsr(0.005, 0.012, 0.02, 0.05), oscs: [{ type: 'sin', f: expSweep(3200 + rnd() * 600, 4800, 0.06) }] });
    }
  }
  // Title: a bell motif over the last chord; a hit when the name burns in.
  {
    const t0 = shot('title').start;
    for (const [m, dt] of [[74, 1.4], [81, 2.1], [77, 2.8], [76, 3.5], [74, 4.4]]) {
      V({ out: music, send, sendAmt: 0.9, t0: t0 + dt, len: 3, env: adsr(0.003, 0.07, 0, 2.4),
        oscs: [{ type: 'sin', f: mtof(m) }, { type: 'sin', f: mtof(m) * 3.01, amp: 0.3 }] });
    }
    reverseSwell(t0 + 5.6, 1.6, 0.22);
    boom(t0 + 5.6, 0.9);
    brass(t0 + 5.6, 'title', 0.11, 4.2);
  }

  // ---------------------------------------------------------------- mix
  // breaths: the music drops out for a beat before the biggest jumps
  const breath = (id) => { const t = shot(id).start; return [[t - 0.6, 1], [t - 0.3, 0.12], [t, 1]]; };
  const duck = ramp([[0, 1], ...breath('boneyard'), ...breath('voxel'), ...breath('rooftop')]);
  for (let n = 0; n < N; n++) { const g = duck(n / SR); music.L[n] *= g; music.R[n] *= g; }
  filterBus(music, 'lp', ramp([[ocean.start - 0.1, 18000], [ocean.start + 0.25, 650], [ocean.end - 0.3, 650], [ocean.end + 0.1, 18000]]), 0.7);
  const mix = new Bus(N);
  for (let n = 0; n < N; n++) {
    mix.L[n] = music.L[n] * 0.9 + sfx.L[n];
    mix.R[n] = music.R[n] * 0.9 + sfx.R[n];
  }
  reverb(send, mix, { room: 0.88, damp: 0.3, wet: 1.0 });
  master(mix, { drive: 1.25, threshold: 0.75, release: 0.2 });
  const fade = ramp([[0, 0], [0.3, 1], [duration - 2.2, 1], [duration - 0.05, 0]]);
  for (let n = 0; n < N; n++) { const g = fade(n / SR); mix.L[n] *= g; mix.R[n] *= g; }
  return [mix.L, mix.R];
}
