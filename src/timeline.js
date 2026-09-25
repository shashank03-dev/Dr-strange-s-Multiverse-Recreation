// The edit. Shot order and transitions follow the reference sequence beat
// for beat; this is the extended cut, so every universe gets room to breathe.
// The camera takes the place of the travellers.

export const P = (o) => ({
  exposure: 1, sat: 1, contrast: 1, tint: [1, 1, 1], lift: [0, 0, 0],
  ca: 0.0015, zoomBlur: 0, grain: 0.045, vignette: 0.35, flicker: 0, sepia: 0,
  bloom: 0.7, streak: 0.25, streakTint: [0.45, 0.65, 1.0],
  trail: 0, trailZoom: 0.015, trailRot: 0, shake: 0.004, shakeHz: 1.3,
  ...o,
});

const EDIT = [
  { id: 'eye', len: 3.0, name: 'The Spark', 
    post: P({ bloom: 1.0, streak: 0.6, streakTint: [1, 0.35, 0.7], shake: 0.002, vignette: 0.6 }) },
  { id: 'sanctum', len: 8.5, name: 'Sanctum', 
    post: P({ bloom: 0.9, streak: 0.5, exposure: 1.1, shake: 0.006, contrast: 1.08, lift: [0.0, 0.004, 0.012] }) },
  { id: 'firehall', len: 3.2, name: 'Hall of Giants', 
    post: P({ bloom: 0.9, zoomBlur: 0.035, trail: 0.18, trailZoom: 0.025, trailRot: 0.01, shake: 0.015, shakeHz: 3, streakTint: [1, 0.6, 0.3], ca: 0.003 }) },
  { id: 'cosmos', len: 2.6, name: 'Deep Space', 
    post: P({ bloom: 1.0, streak: 0.8, zoomBlur: 0.05, trail: 0.3, trailRot: -0.02, shake: 0.012, shakeHz: 2.2, ca: 0.004 }) },
  { id: 'silk', len: 2.4, name: 'Silk Realm', 
    post: P({ bloom: 1.0, zoomBlur: 0.08, trail: 0.35, trailZoom: 0.035, shake: 0.015, shakeHz: 2.5, streakTint: [1, 0.5, 0.7], sat: 1.05 }) },
  { id: 'crystal', len: 2.8, name: 'Crystal Realm', 
    post: P({ bloom: 0.9, zoomBlur: 0.06, trail: 0.3, trailRot: 0.015, shake: 0.015, shakeHz: 2.6, ca: 0.004 }) },
  { id: 'canyon', len: 2.4, name: 'The Fall', 
    post: P({ bloom: 0.8, zoomBlur: 0.04, trail: 0.15, trailZoom: 0.05, shake: 0.02, shakeHz: 4, ca: 0.005, streakTint: [1, 0.7, 0.4] }) },
  { id: 'ocean', len: 7.0, name: 'Ocean', 
    post: P({ bloom: 0.8, streak: 0.15, zoomBlur: 0.02, trail: 0.12, shake: 0.008, shakeHz: 0.6, ca: 0.002, sat: 1.1 }) },
  { id: 'city', len: 5.0, name: 'Manhattan', 
    post: P({ exposure: 1.25, bloom: 0.6, streak: 0.2, zoomBlur: 0.03, trail: 0.15, shake: 0.012, shakeHz: 1.8, contrast: 1.06, sat: 1.05 }) },
  { id: 'machine', len: 3.2, name: 'Machine Realm', 
    post: P({ bloom: 0.9, zoomBlur: 0.06, trail: 0.3, trailZoom: 0.03, shake: 0.012, shakeHz: 2.2, streakTint: [0.4, 1, 0.95], ca: 0.003 }) },
  { id: 'boneyard', len: 4.2, name: 'Boneyard', 
    post: P({ bloom: 1.0, streak: 0.4, zoomBlur: 0.04, trail: 0.2, shake: 0.01, shakeHz: 1.6, streakTint: [1, 0.55, 0.2], contrast: 1.1 }) },
  { id: 'jungle', len: 3.6, name: 'Primeval', 
    post: P({ bloom: 0.8, zoomBlur: 0.035, trail: 0.18, shake: 0.012, shakeHz: 2, sat: 1.1, contrast: 1.08, streakTint: [0.8, 1, 0.6] }) },
  { id: 'toon', len: 3.4, name: 'Ink Realm', 
    post: P({ bloom: 0.35, streak: 0.0, zoomBlur: 0.02, trail: 0.1, grain: 0.02, shake: 0.01, shakeHz: 1.5, sat: 1.1, vignette: 0.15 }) },
  { id: 'ruins', len: 3.6, name: 'Incursion', 
    post: P({ bloom: 0.7, zoomBlur: 0.02, trail: 0.15, trailRot: 0.01, shake: 0.008, shakeHz: 1.1, sat: 0.8, contrast: 1.12, lift: [0, 0.006, 0.01] }) },
  { id: 'voxel', len: 4.0, name: 'Block Realm', 
    post: P({ bloom: 0.9, zoomBlur: 0.03, trail: 0.2, shake: 0.01, shakeHz: 1.6, streakTint: [1, 0.8, 0.5] }) },
  { id: 'paint', len: 4.2, name: 'Paint Realm', 
    post: P({ bloom: 0.6, streak: 0.1, zoomBlur: 0.05, trail: 0.25, trailZoom: 0.03, shake: 0.014, shakeHz: 2.3, sat: 1.15, contrast: 1.05 }) },
  { id: 'sepia', len: 2.8, name: 'Old World', 
    post: P({ bloom: 0.6, streak: 0.0, zoomBlur: 0.04, trail: 0.2, shake: 0.014, shakeHz: 2.5, sepia: 0.9, flicker: 1, grain: 0.12, vignette: 0.8 }) },
  { id: 'neon', len: 3.2, name: 'Glass City', 
    post: P({ bloom: 1.0, streak: 0.5, zoomBlur: 0.07, trail: 0.3, trailZoom: 0.035, shake: 0.016, shakeHz: 2.8, ca: 0.004 }) },
  { id: 'rooftop', len: 7.0, name: 'Earth-616', 
    post: P({ bloom: 0.7, streak: 0.35, shake: 0.004, shakeHz: 0.7, sat: 1.05, lift: [0.01, 0.005, 0] }) },
  { id: 'title', len: 10.0, name: 'Multiverse', 
    post: P({ bloom: 0.9, streak: 0.3, streakTint: [1, 0.5, 0.25], shake: 0.0015, grain: 0.05, vignette: 0.55 }) },
];

// type: 1 flash, 2 shatter, 3 portal, 4 zoom, 5 prism
const CUT_STYLE = [
  { type: 1, dur: 0.5, color: [1.0, 0.55, 0.85] },
  { type: 3, dur: 1.1, color: [0.6, 0.8, 1.0] },
  { type: 4, dur: 0.5, color: [0.5, 0.7, 1.0] },
  { type: 1, dur: 0.4, color: [1.0, 0.6, 0.8] },
  { type: 2, dur: 0.6, color: [0.5, 0.9, 1.0] },
  { type: 4, dur: 0.4, color: [0.8, 0.9, 1.0] },
  { type: 1, dur: 0.7, color: [0.8, 1.0, 0.95] },
  { type: 2, dur: 0.6, color: [0.85, 0.95, 1.0] },
  { type: 4, dur: 0.5, color: [0.6, 1.0, 1.0] },
  { type: 2, dur: 0.7, color: [1.0, 0.6, 0.3] },
  { type: 1, dur: 0.5, color: [0.7, 0.85, 1.0] },
  { type: 1, dur: 0.6, color: [0.7, 0.9, 1.0] },
  { type: 2, dur: 0.5, color: [0.7, 0.9, 1.0] },
  { type: 5, dur: 0.7, color: [1, 1, 1] },
  { type: 5, dur: 0.6, color: [1, 1, 1] },
  { type: 2, dur: 0.5, color: [1.0, 0.9, 0.75] },
  { type: 4, dur: 0.5, color: [0.6, 1.0, 1.0] },
  { type: 1, dur: 0.8, color: [1.0, 0.9, 0.8] },
  { type: 1, dur: 0.6, color: [1.0, 0.55, 0.25] },
];

// Lay the edit end to end: each shot starts where the previous one ends,
// and every shot after the first opens with the next transition style.
let clock = 0;
export const SHOTS = EDIT.map((s) => {
  const shot = { ...s, start: clock, end: clock + s.len };
  clock = shot.end;
  return shot;
});
export const CUTS = SHOTS.slice(1).map((s, i) => ({ t: s.start, ...CUT_STYLE[i] }));
export const DURATION = clock;
export const shotById = (id) => SHOTS.find((s) => s.id === id);

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
