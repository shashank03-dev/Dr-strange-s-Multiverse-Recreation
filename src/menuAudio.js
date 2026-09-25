// Real-time sound for the title screen: an ambient drone with a distant
// choir, hover ticks, a refusal and the surge when you say yes.

export class MenuAudio {
  constructor(ctx) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.9;
    this.out.connect(ctx.destination);
    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    this.ambient = null;
  }

  now() { return this.ctx.currentTime; }

  startAmbient() {
    if (this.ambient) return;
    const c = this.ctx, t = this.now();
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 3);
    g.connect(this.out);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 2;
    lp.connect(g);
    const nodes = [];
    // D pedal and a slow, breathing fifth
    for (const [f, det, amp] of [[36.71, 0, 0.18], [36.71, 8, 0.18], [55, -5, 0.1], [73.42, 4, 0.06]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const og = c.createGain(); og.gain.value = amp; o.connect(og); og.connect(lp); o.start(); nodes.push(o);
    }
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 160; lfo.connect(lg); lg.connect(lp.frequency); lfo.start(); nodes.push(lfo);
    // high choir shimmer, D minor add9
    const choir = c.createGain(); choir.gain.value = 0.018; choir.connect(g);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 3; bp.connect(choir);
    for (const m of [62, 65, 69, 76]) {
      for (const det of [-7, 6]) {
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.value = 440 * Math.pow(2, (m - 69) / 12); o.detune.value = det;
        o.connect(bp); o.start(); nodes.push(o);
      }
    }
    // crackling embers from the circle
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const cg = c.createGain(); cg.gain.value = 0.0;
    src.connect(hp); hp.connect(cg); cg.connect(g); src.start(); nodes.push(src);
    this._crackle = setInterval(() => {
      const tt = this.now();
      cg.gain.setValueAtTime(Math.random() * 0.12, tt);
      cg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.02 + Math.random() * 0.03);
    }, 70);
    this.ambient = { g, nodes };
  }

  stopAmbient(fade = 1.5) {
    if (!this.ambient) return;
    const { g, nodes } = this.ambient, t = this.now();
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    nodes.forEach((n) => n.stop(t + fade + 0.1));
    clearInterval(this._crackle);
    this.ambient = null;
  }

  _tone(type, f, t, dur, peak, f1) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + dur + 0.05);
  }

  _noise(t, dur, peak, type, f0, f1) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out); s.start(t); s.stop(t + dur + 0.05);
  }

  hover() {
    const t = this.now();
    this._tone('triangle', 1318.5, t, 0.09, 0.05);
    this._tone('sine', 2637, t + 0.01, 0.06, 0.02);
  }

  deny() {
    const t = this.now();
    this._tone('sawtooth', 110, t, 0.35, 0.12, 55);
    this._tone('square', 116.5, t, 0.3, 0.05, 58);
    this._noise(t, 0.25, 0.15, 'lowpass', 1200, 200);
  }

  reveal() {
    const t = this.now();
    [74, 81, 86].forEach((m, i) => this._tone('sine', 440 * Math.pow(2, (m - 69) / 12), t + i * 0.09, 1.6, 0.04));
  }

  confirm() {
    const t = this.now();
    // surge: rising whoosh into a sub drop, with a chime of the star
    this._noise(t, 2.2, 0.35, 'bandpass', 200, 7000);
    this._tone('sine', 55, t + 2.1, 1.6, 0.6, 28);
    this._tone('sawtooth', 73.4, t, 2.2, 0.05, 146.8);
    [62, 69, 74, 77, 81, 86].forEach((m, i) =>
      this._tone('sine', 440 * Math.pow(2, (m - 69) / 12), t + i * 0.06, 1.8, 0.035));
    this.stopAmbient(2.0);
  }
}
