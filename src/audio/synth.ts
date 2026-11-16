/** Procedural sound building blocks (all synthesised; no external assets, no licensing). */

export function makeNoise(ctx: BaseAudioContext, seconds: number, kind: 'white' | 'pink' | 'brown' = 'white'): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'white') d[i] = w;
    else if (kind === 'pink') { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  }
  return buf;
}

export interface Bus { input: AudioNode }

/** One-shot noise burst through a filter with an exponential envelope. */
export function burst(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, t: number, o: {
  dur: number; gain: number; type?: BiquadFilterType; freq: number; freqEnd?: number; q?: number; pan?: number; attack?: number; offset?: number;
}) {
  const src = ctx.createBufferSource(); src.buffer = noise;
  const f = ctx.createBiquadFilter(); f.type = o.type ?? 'bandpass'; f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.freqEnd), t + o.dur);
  const g = ctx.createGain(); const a = o.attack ?? 0.002;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g);
  let out: AudioNode = g;
  if (o.pan !== undefined && 'createStereoPanner' in ctx) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); out = p; }
  out.connect(dest);
  src.start(t, Math.random() * Math.max(0, noise.duration - o.dur - 0.01)); src.stop(t + o.dur + 0.05);
}

/** Low sine "thump" (artillery report / explosion body). */
export function thump(ctx: AudioContext, dest: AudioNode, t: number, o: { freq: number; freqEnd: number; dur: number; gain: number; pan?: number }) {
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(o.freq, t); osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(o.gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g);
  if (o.pan !== undefined && 'createStereoPanner' in ctx) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(dest); } else g.connect(dest);
  osc.start(t); osc.stop(t + o.dur + 0.05);
}

/** Rifle / MG crack: short sharp noise + body. */
export function gunshot(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, t: number, o: { gain: number; pan: number; heavy?: boolean; muffled?: number }) {
  const lp = 1 - (o.muffled ?? 0);
  burst(ctx, dest, noise, t, { dur: o.heavy ? 0.12 : 0.07, gain: o.gain, type: 'bandpass', freq: (o.heavy ? 1400 : 2600) * (0.4 + 0.6 * lp), freqEnd: 500, q: 0.7, pan: o.pan });
  if (o.heavy) thump(ctx, dest, t, { freq: 140, freqEnd: 50, dur: 0.14, gain: o.gain * 0.8, pan: o.pan });
}

/** Artillery: boom + rumbling tail. */
export function artilleryShot(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, t: number, o: { gain: number; pan: number; distance: number }) {
  const d = Math.min(1, o.distance);
  thump(ctx, dest, t, { freq: 90 - d * 30, freqEnd: 30, dur: 0.5 + d * 0.5, gain: o.gain });
  burst(ctx, dest, noise, t, { dur: 0.9 + d, gain: o.gain * 0.7, type: 'lowpass', freq: 600 - d * 350, freqEnd: 70, q: 0.5, pan: o.pan, attack: 0.01 });
}

export function explosion(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, t: number, o: { gain: number; pan: number; distance: number }) {
  const d = Math.min(1, o.distance);
  thump(ctx, dest, t, { freq: 120, freqEnd: 28, dur: 0.9, gain: o.gain, pan: o.pan });
  burst(ctx, dest, noise, t, { dur: 1.1 + d * 0.6, gain: o.gain * 0.9, type: 'lowpass', freq: 1800 * (1 - d * 0.7), freqEnd: 90, q: 0.4, pan: o.pan, attack: 0.004 });
  burst(ctx, dest, noise, t + 0.08, { dur: 0.35, gain: o.gain * 0.35, type: 'highpass', freq: 3000 * (1 - d * 0.7), q: 0.5, pan: o.pan });
}

/** Whistle of an incoming shell. */
export function shellWhistle(ctx: AudioContext, dest: AudioNode, t: number, o: { gain: number; pan: number; dur: number }) {
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(2400, t); osc.frequency.exponentialRampToValueAtTime(700, t + o.dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(o.gain * 0.15, t + o.dur * 0.7); g.gain.linearRampToValueAtTime(0, t + o.dur);
  osc.connect(g);
  if ('createStereoPanner' in ctx) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(dest); } else g.connect(dest);
  osc.start(t); osc.stop(t + o.dur + 0.02);
}

/** Radio chatter: gated static with formant-ish blips (unintelligible by design). */
export function radioBlip(ctx: AudioContext, dest: AudioNode, noise: AudioBuffer, t: number, o: { gain: number; syllables: number }) {
  let tt = t;
  burst(ctx, dest, noise, tt, { dur: 0.05, gain: o.gain * 0.8, type: 'bandpass', freq: 3000, q: 2 });
  tt += 0.07;
  for (let i = 0; i < o.syllables; i++) {
    const dur = 0.06 + Math.random() * 0.12;
    const f = 280 + Math.random() * 260;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(f, tt); osc.frequency.linearRampToValueAtTime(f * (0.8 + Math.random() * 0.5), tt + dur);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700 + Math.random() * 1400; bp.Q.value = 5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(o.gain * 0.5, tt + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, tt + dur);
    osc.connect(bp).connect(g).connect(dest); osc.start(tt); osc.stop(tt + dur + 0.02);
    tt += dur + 0.03 + Math.random() * 0.07;
  }
  burst(ctx, dest, noise, tt, { dur: 0.09, gain: o.gain * 0.6, type: 'bandpass', freq: 2200, q: 1.5 });
  return tt - t;
}

/** UI feedback sounds. */
export function uiTone(ctx: AudioContext, dest: AudioNode, t: number, kind: 'click' | 'order' | 'alert' | 'confirm') {
  const seq: [number, number, number][] = kind === 'click' ? [[1200, 0.03, 0.15]]
    : kind === 'order' ? [[620, 0.05, 0.22], [880, 0.07, 0.22]]
      : kind === 'confirm' ? [[520, 0.06, 0.2], [780, 0.06, 0.2], [1040, 0.09, 0.2]]
        : [[880, 0.12, 0.3], [660, 0.16, 0.3]];
  let tt = t;
  for (const [f, d, gn] of seq) {
    const osc = ctx.createOscillator(); osc.type = kind === 'alert' ? 'square' : 'triangle'; osc.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(gn * 0.5, tt + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
    osc.connect(g).connect(dest); osc.start(tt); osc.stop(tt + d + 0.02); tt += d * 0.9;
  }
}
