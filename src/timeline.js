// The edit. Shot order, lengths and transitions follow the reference
// sequence beat for beat; the camera takes the place of the travellers.

export const P = (o) => ({
  exposure: 1, sat: 1, contrast: 1, tint: [1, 1, 1], lift: [0, 0, 0],
  ca: 0.0015, zoomBlur: 0, grain: 0.045, vignette: 0.35, flicker: 0, sepia: 0,
  bloom: 0.7, streak: 0.25, streakTint: [0.45, 0.65, 1.0],
  trail: 0, trailZoom: 0.015, trailRot: 0, shake: 0.004, shakeHz: 1.3,
  ...o,
});

export const SHOTS = [
  { id: 'eye', name: 'The Spark', start: 0.0, end: 2.6,
    post: P({ bloom: 1.0, streak: 0.6, streakTint: [1, 0.35, 0.7], shake: 0.002, vignette: 0.6 }) },
  { id: 'sanctum', name: 'Sanctum', start: 2.6, end: 8.4,
    post: P({ bloom: 0.9, streak: 0.5, exposure: 1.1, shake: 0.006, contrast: 1.08, lift: [0.0, 0.004, 0.012] }) },
  { id: 'firehall', name: 'Hall of Giants', start: 8.4, end: 10.4,
    post: P({ bloom: 0.9, zoomBlur: 0.035, trail: 0.18, trailZoom: 0.025, trailRot: 0.01, shake: 0.015, shakeHz: 3, streakTint: [1, 0.6, 0.3], ca: 0.003 }) },
  { id: 'cosmos', name: 'Deep Space', start: 10.4, end: 11.8,
    post: P({ bloom: 1.0, streak: 0.8, zoomBlur: 0.05, trail: 0.3, trailRot: -0.02, shake: 0.012, shakeHz: 2.2, ca: 0.004 }) },
  { id: 'silk', name: 'Silk Realm', start: 11.8, end: 13.2,
    post: P({ bloom: 1.0, zoomBlur: 0.08, trail: 0.35, trailZoom: 0.035, shake: 0.015, shakeHz: 2.5, streakTint: [1, 0.5, 0.7], sat: 1.05 }) },
  { id: 'crystal', name: 'Crystal Realm', start: 13.2, end: 14.8,
    post: P({ bloom: 0.9, zoomBlur: 0.06, trail: 0.3, trailRot: 0.015, shake: 0.015, shakeHz: 2.6, ca: 0.004 }) },
  { id: 'canyon', name: 'The Fall', start: 14.8, end: 16.0,
    post: P({ bloom: 0.8, zoomBlur: 0.04, trail: 0.15, trailZoom: 0.05, shake: 0.02, shakeHz: 4, ca: 0.005, streakTint: [1, 0.7, 0.4] }) },
  { id: 'ocean', name: 'Ocean', start: 16.0, end: 20.2,
    post: P({ bloom: 0.8, streak: 0.15, zoomBlur: 0.02, trail: 0.12, shake: 0.008, shakeHz: 0.6, ca: 0.002, sat: 1.1 }) },
  { id: 'city', name: 'Manhattan', start: 20.2, end: 23.2,
    post: P({ bloom: 0.6, streak: 0.2, zoomBlur: 0.03, trail: 0.15, shake: 0.012, shakeHz: 1.8, contrast: 1.06, sat: 1.05 }) },
  { id: 'machine', name: 'Machine Realm', start: 23.2, end: 25.4,
    post: P({ bloom: 0.9, zoomBlur: 0.06, trail: 0.3, trailZoom: 0.03, shake: 0.012, shakeHz: 2.2, streakTint: [0.4, 1, 0.95], ca: 0.003 }) },
  { id: 'boneyard', name: 'Boneyard', start: 25.4, end: 28.4,
    post: P({ bloom: 1.0, streak: 0.4, zoomBlur: 0.04, trail: 0.2, shake: 0.01, shakeHz: 1.6, streakTint: [1, 0.55, 0.2], contrast: 1.1 }) },
  { id: 'jungle', name: 'Primeval', start: 28.4, end: 30.4,
    post: P({ bloom: 0.8, zoomBlur: 0.035, trail: 0.18, shake: 0.012, shakeHz: 2, sat: 1.1, contrast: 1.08, streakTint: [0.8, 1, 0.6] }) },
  { id: 'toon', name: 'Ink Realm', start: 30.4, end: 32.9,
    post: P({ bloom: 0.35, streak: 0.0, zoomBlur: 0.02, trail: 0.1, grain: 0.02, shake: 0.01, shakeHz: 1.5, sat: 1.1, vignette: 0.15 }) },
  { id: 'ruins', name: 'Incursion', start: 32.9, end: 35.6,
    post: P({ bloom: 0.7, zoomBlur: 0.02, trail: 0.15, trailRot: 0.01, shake: 0.008, shakeHz: 1.1, sat: 0.8, contrast: 1.12, lift: [0, 0.006, 0.01] }) },
  { id: 'voxel', name: 'Block Realm', start: 35.6, end: 38.4,
    post: P({ bloom: 0.9, zoomBlur: 0.03, trail: 0.2, shake: 0.01, shakeHz: 1.6, streakTint: [1, 0.8, 0.5] }) },
  { id: 'paint', name: 'Paint Realm', start: 38.4, end: 41.8,
    post: P({ bloom: 0.6, streak: 0.1, zoomBlur: 0.05, trail: 0.25, trailZoom: 0.03, shake: 0.014, shakeHz: 2.3, sat: 1.15, contrast: 1.05 }) },
  { id: 'sepia', name: 'Old World', start: 41.8, end: 43.4,
    post: P({ bloom: 0.6, streak: 0.0, zoomBlur: 0.04, trail: 0.2, shake: 0.014, shakeHz: 2.5, sepia: 0.9, flicker: 1, grain: 0.12, vignette: 0.8 }) },
  { id: 'neon', name: 'Glass City', start: 43.4, end: 45.6,
    post: P({ bloom: 1.0, streak: 0.5, zoomBlur: 0.07, trail: 0.3, trailZoom: 0.035, shake: 0.016, shakeHz: 2.8, ca: 0.004 }) },
  { id: 'rooftop', name: 'Earth-616', start: 45.6, end: 50.0,
    post: P({ bloom: 0.7, streak: 0.35, shake: 0.004, shakeHz: 0.7, sat: 1.05, lift: [0.01, 0.005, 0] }) },
  { id: 'title', name: 'Multiverse', start: 50.0, end: 58.0,
    post: P({ bloom: 0.9, streak: 0.3, streakTint: [1, 0.5, 0.25], shake: 0.0015, grain: 0.05, vignette: 0.55 }) },
];

// type: 1 flash, 2 shatter, 3 portal, 4 zoom, 5 prism
export const CUTS = [
  { t: 2.6, type: 1, dur: 0.5, color: [1.0, 0.55, 0.85] },
  { t: 8.4, type: 3, dur: 1.1, color: [0.6, 0.8, 1.0] },
  { t: 10.4, type: 4, dur: 0.5, color: [0.5, 0.7, 1.0] },
  { t: 11.8, type: 1, dur: 0.4, color: [1.0, 0.6, 0.8] },
  { t: 13.2, type: 2, dur: 0.6, color: [0.5, 0.9, 1.0] },
  { t: 14.8, type: 4, dur: 0.4, color: [0.8, 0.9, 1.0] },
  { t: 16.0, type: 1, dur: 0.7, color: [0.8, 1.0, 0.95] },
  { t: 20.2, type: 2, dur: 0.6, color: [0.85, 0.95, 1.0] },
  { t: 23.2, type: 4, dur: 0.5, color: [0.6, 1.0, 1.0] },
  { t: 25.4, type: 2, dur: 0.7, color: [1.0, 0.6, 0.3] },
  { t: 28.4, type: 1, dur: 0.5, color: [0.7, 0.85, 1.0] },
  { t: 30.4, type: 1, dur: 0.6, color: [0.7, 0.9, 1.0] },
  { t: 32.9, type: 2, dur: 0.5, color: [0.7, 0.9, 1.0] },
  { t: 35.6, type: 5, dur: 0.7, color: [1, 1, 1] },
  { t: 38.4, type: 5, dur: 0.6, color: [1, 1, 1] },
  { t: 41.8, type: 2, dur: 0.5, color: [1.0, 0.9, 0.75] },
  { t: 43.4, type: 4, dur: 0.5, color: [0.6, 1.0, 1.0] },
  { t: 45.6, type: 1, dur: 0.8, color: [1.0, 0.9, 0.8] },
  { t: 50.0, type: 1, dur: 0.6, color: [1.0, 0.55, 0.25] },
];

export const DURATION = 58.0;

export function shotAt(t) {
  for (let i = 0; i < SHOTS.length; i++) if (t < SHOTS[i].end) return i;
  return SHOTS.length - 1;
}

// Returns {a, b, p, cut} where b/p/cut are set while a transition is running.
export function frameState(t) {
  for (const c of CUTS) {
    const h = c.dur / 2;
    if (t >= c.t - h && t < c.t + h) {
      const bi = SHOTS.findIndex((s) => Math.abs(s.start - c.t) < 1e-6);
      return { a: bi - 1, b: bi, p: (t - (c.t - h)) / c.dur, cut: c };
    }
  }
  return { a: shotAt(t), b: -1, p: 0, cut: null };
}

export function lerpPost(a, b, k) {
  const o = {};
  for (const key in a) {
    const x = a[key], y = b[key];
    o[key] = Array.isArray(x) ? x.map((v, i) => v + (y[i] - v) * k) : x + (y - x) * k;
  }
  return o;
}

// Impact envelope around each cut: drives camera kicks and lens aberration.
export function impulse(t) {
  let s = 0;
  for (const c of CUTS) {
    const d = t - c.t;
    if (d > -0.15) s += Math.exp(-Math.max(d, 0) * 6) * Math.min(1, (d + 0.15) / 0.15);
  }
  return Math.min(s, 1.5);
}
