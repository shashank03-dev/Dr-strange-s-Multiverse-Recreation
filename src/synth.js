// A tiny offline synthesiser: band-limited oscillators, biquads, envelopes,
// a Freeverb-style reverb and a bus limiter, all on Float32Arrays.

export const SR = 44100;
const BLOCK = 16;

export class Bus {
  constructor(n) { this.L = new Float32Array(n); this.R = new Float32Array(n); }
}

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// RBJ biquad, coefficients refreshed per block.
export class Biquad {
  constructor(type, f, q) { this.type = type; this.q = q; this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(f); }
  set(f) {
    f = Math.min(Math.max(f, 10), SR * 0.45);
    const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), a = s / (2 * this.q);
    let b0, b1, b2;
    if (this.type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
    else if (this.type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
    else { b0 = a; b1 = 0; b2 = -a; } // band-pass, 0 dB peak
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = -2 * c / a0; this.a2 = (1 - a) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

// Envelope helpers return gain(t) where t is seconds since voice start.
export const adsr = (a, peak, hold, rel) => (t) => {
  if (t < a) return peak * (t / a);
  if (t < a + hold) return peak;
  return peak * Math.exp(-(t - a - hold) * 6.9 / rel);
};
export const ramp = (points) => (t) => { // [[t, v], ...] linear
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (t < points[i][0]) {
      const [t0, v0] = points[i - 1], [t1, v1] = points[i];
      return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
};
export const expSweep = (f0, f1, dur) => (t) => f0 * Math.pow(f1 / f0, Math.min(t / dur, 1));

/*
 * Render one voice into `out` (and optionally a reverb send bus).
 * oscs: [{ type: 'saw'|'sqr'|'sin'|'noise', f: number|fn, amp, detune (cents) }]
 * filters: serial list [{ type, f: number|fn, q }] or, with parallel: true,
 *          a formant bank [{ type:'bp', f, q, amp }]
 */
export function voice(o, rnd) {
  const { out, send = null, sendAmt = 0, t0, len, env, pan = 0, oscs, filters = [], parallel = false, vib = 0, vibRate = 5 } = o;
  const n0 = Math.max(0, Math.floor(t0 * SR));
  const n1 = Math.min(out.L.length, Math.floor((t0 + len) * SR));
  if (n1 <= n0) return;
  const pl = Math.cos((pan + 1) * Math.PI / 4), pr = Math.sin((pan + 1) * Math.PI / 4);
  const ph = oscs.map(() => rnd());
  const fl = filters.map((f) => new Biquad(f.type, typeof f.f === 'function' ? f.f(0) : f.f, f.q));
  const vPhase = rnd() * 6.28;
  let g = 0, gNext = env(0);
  const freqs = oscs.map((os) => (typeof os.f === 'function' ? os.f(0) : os.f));
  for (let n = n0; n < n1; n += BLOCK) {
    const t = (n - n0) / SR;
    g = gNext;
    gNext = env(t + BLOCK / SR);
    const vib_ = vib ? Math.pow(2, (vib * Math.sin(vPhase + t * vibRate * 6.283)) / 1200) : 1;
    for (let k = 0; k < oscs.length; k++) {
      const os = oscs[k];
      const f = typeof os.f === 'function' ? os.f(t) : os.f;
      freqs[k] = f * (os.detune ? Math.pow(2, os.detune / 1200) : 1) * vib_;
    }
    for (let k = 0; k < fl.length; k++) if (typeof filters[k].f === 'function') fl[k].set(filters[k].f(t));
    const m = Math.min(BLOCK, n1 - n);
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let k = 0; k < oscs.length; k++) {
        const os = oscs[k];
        const dt = freqs[k] / SR;
        let p = ph[k];
        let v;
        if (os.type === 'saw') v = 2 * p - 1 - blep(p, dt);
        else if (os.type === 'sqr') { v = (p < 0.5 ? 1 : -1) + blep(p, dt) - blep((p + 0.5) % 1, dt); }
        else if (os.type === 'sin') v = Math.sin(p * 6.283185307);
        else v = rnd() * 2 - 1;
        p += dt; if (p >= 1) p -= 1;
        ph[k] = p;
        s += v * (os.amp ?? 1);
      }
      if (parallel) {
        let acc = 0;
        for (let k = 0; k < fl.length; k++) acc += fl[k].run(s) * (filters[k].amp ?? 1);
        s = acc;
      } else {
        for (let k = 0; k < fl.length; k++) s = fl[k].run(s);
      }
      const gg = (g + (gNext - g) * (i / BLOCK)) * s;
      out.L[n + i] += gg * pl;
      out.R[n + i] += gg * pr;
      if (send) { send.L[n + i] += gg * pl * sendAmt; send.R[n + i] += gg * pr * sendAmt; }
    }
  }
}

// Time-varying filter applied to a whole bus (used for the underwater muffle).
export function filterBus(bus, type, fOf, q) {
  const fL = new Biquad(type, fOf(0), q), fR = new Biquad(type, fOf(0), q);
  for (let n = 0; n < bus.L.length; n += BLOCK) {
    const f = fOf(n / SR); fL.set(f); fR.set(f);
    const m = Math.min(BLOCK, bus.L.length - n);
    for (let i = 0; i < m; i++) { bus.L[n + i] = fL.run(bus.L[n + i]); bus.R[n + i] = fR.run(bus.R[n + i]); }
  }
}

// Freeverb: 8 damped combs + 4 all-passes per channel.
export function reverb(input, out, { room = 0.86, damp = 0.35, wet = 1 } = {}) {
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const apT = [556, 441, 341, 225];
  for (let ch = 0; ch < 2; ch++) {
    const x = ch ? input.R : input.L, y = ch ? out.R : out.L;
    const spread = ch ? 23 : 0;
    const combs = combT.map((l) => ({ buf: new Float32Array(Math.round((l + spread) * SR / 44100)), i: 0, f: 0 }));
    const aps = apT.map((l) => ({ buf: new Float32Array(Math.round((l + spread) * SR / 44100)), i: 0 }));
    for (let n = 0; n < x.length; n++) {
      const inp = x[n] * 0.015;
      let s = 0;
      for (let c = 0; c < 8; c++) {
        const cb = combs[c];
        const o = cb.buf[cb.i];
        cb.f = o * (1 - damp) + cb.f * damp;
        cb.buf[cb.i] = inp + cb.f * room;
        if (++cb.i >= cb.buf.length) cb.i = 0;
        s += o;
      }
      for (let a = 0; a < 4; a++) {
        const ap = aps[a];
        const b = ap.buf[ap.i];
        ap.buf[ap.i] = s + b * 0.5;
        s = b - s;
        if (++ap.i >= ap.buf.length) ap.i = 0;
      }
      y[n] += s * wet;
    }
  }
}

// Feed-forward peak limiter with smooth release, then a gentle soft clip.
export function master(bus, { drive = 1, threshold = 0.7, release = 0.15 } = {}) {
  let env = 0;
  const rel = Math.exp(-1 / (release * SR));
  const att = Math.exp(-1 / (0.002 * SR));
  for (let n = 0; n < bus.L.length; n++) {
    const l = bus.L[n] * drive, r = bus.R[n] * drive;
    const pk = Math.max(Math.abs(l), Math.abs(r));
    env = pk > env ? att * env + (1 - att) * pk : rel * env + (1 - rel) * pk;
    const gr = env > threshold ? threshold / env : 1;
    bus.L[n] = Math.tanh(l * gr * 1.1) / 1.1 * 1.0;
    bus.R[n] = Math.tanh(r * gr * 1.1) / 1.1 * 1.0;
  }
}
