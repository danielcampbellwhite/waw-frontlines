import { computeMix, type MixInput, type MixTargets } from './mix';
import { CUES, CueGate, type CueName } from './cues';
import { SampleBank } from './samples';
import { artilleryShot, burst, explosion, gunshot, makeNoise, radioBlip, shellWhistle, thump, uiTone } from './synth';

export interface AudioLevels { master: number; music: number; sfx: number; ambience: number; muted: boolean }

type VoiceState = { nextGun: number; nextArty: number; nextBoom: number; burstLeft: number; gate: GainNode };

/** Anti-click ramp time constant (s): effects settle in roughly 40 ms; there are no longer fades. */
const CLICK_TC = 0.012;

/**
 * Web Audio engine. CC0 recordings from public/audio (see credits.ts) are played when loaded; the procedural synth
 * (oscillators + filtered noise) is the fallback for anything that has not loaded or failed to load.
 * Must be unlocked by a user gesture (`unlock()`).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode; private musicBus!: GainNode; private sfxBus!: GainNode; private ambBus!: GainNode;
  private noiseWhite!: AudioBuffer; private noisePink!: AudioBuffer; private noiseBrown!: AudioBuffer;
  private windG!: GainNode; private radioBus!: GainNode; private vehG!: GainNode; private musicG!: GainNode;
  private battleBus!: GainNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private voices = new Map<string, VoiceState>();
  private targets: MixTargets | null = null;
  private levels: AudioLevels = { master: 0.8, music: 0.5, sfx: 0.8, ambience: 0.7, muted: false };
  private nextRadio = 0; private nextNote = 0; private noteIdx = 0;
  /** exposed for tests/diagnostics */
  lastMix: MixTargets | null = null;
  shotsFired = 0;
  samplesPlayed = 0;
  readonly bank = new SampleBank(((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/') + 'audio/');
  readonly gate = new CueGate();
  private vehSynthG!: GainNode; private loopsOn = false;
  private loadedCombat = false; private loadedVehicles = false; private loadedStings = false;

  get running() { return !!this.ctx && this.ctx.state === 'running'; }
  get available() { return typeof AudioContext !== 'undefined' || typeof (globalThis as { webkitAudioContext?: unknown }).webkitAudioContext !== 'undefined'; }

  /** Create/resume the context. Call from a click/keydown handler. */
  unlock(): boolean {
    if (!this.available) return false;
    try {
      if (!this.ctx) this.init();
      void this.ctx!.resume();
      return true;
    } catch { return false; }
  }

  private init() {
    const AC = (globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new AC(); this.ctx = ctx;
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(this.master);
    this.musicBus = ctx.createGain(); this.sfxBus = ctx.createGain(); this.ambBus = ctx.createGain();
    this.musicBus.connect(comp); this.sfxBus.connect(comp); this.ambBus.connect(comp);
    this.noiseWhite = makeNoise(ctx, 3, 'white'); this.noisePink = makeNoise(ctx, 4, 'pink'); this.noiseBrown = makeNoise(ctx, 4, 'brown');
    this.battleBus = ctx.createGain(); this.battleBus.connect(this.sfxBus);
    this.radioBus = ctx.createGain(); this.radioBus.gain.value = 0;
    const rbp = ctx.createBiquadFilter(); rbp.type = 'bandpass'; rbp.frequency.value = 1500; rbp.Q.value = 0.7;
    this.radioBus.connect(rbp).connect(this.ambBus);
    this.buildWind(ctx); this.buildVehicles(ctx); this.buildMusic(ctx);
    this.applyLevels();
    // lazy, background loading: UI + radio first, the rest on demand (see update()/cue())
    void this.bank.loadGroup(ctx, 'ui').then(() => this.bank.loadGroup(ctx, 'radio')).then(() => this.startRadioBed());
    this.timer = setInterval(() => this.tick(), 100);
  }

  setLevels(l: AudioLevels) { this.levels = l; this.applyLevels(); }
  private applyLevels() {
    if (!this.ctx) return; const t = this.ctx.currentTime; const l = this.levels;
    this.master.gain.setTargetAtTime(l.muted ? 0 : l.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(l.music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(l.sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(l.ambience, t, 0.05);
  }

  // persistent layers
  private loop(buf: AudioBuffer) { const s = this.ctx!.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
  private buildWind(ctx: AudioContext) {
    const src = this.loop(this.noisePink);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 1.2;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09; const lfoG = ctx.createGain(); lfoG.gain.value = 260; lfo.connect(lfoG).connect(lp.frequency); lfo.start();
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.23; const l2g = ctx.createGain(); l2g.gain.value = 90; lfo2.connect(l2g).connect(lp.frequency); lfo2.start();
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src.connect(lp).connect(this.windG).connect(this.ambBus);
  }
  private buildVehicles(ctx: AudioContext) {
    const src = this.loop(this.noiseBrown);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    this.vehG = ctx.createGain(); this.vehG.gain.value = 0;
    this.vehSynthG = ctx.createGain(); this.vehSynthG.gain.value = 1; this.vehSynthG.connect(this.vehG);
    src.connect(lp).connect(this.vehSynthG);
    for (const f of [47, 61, 92]) { // diesel idle partials with tremolo
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0.05;
      const trem = ctx.createOscillator(); trem.frequency.value = 9 + f / 20; const tg = ctx.createGain(); tg.gain.value = 0.03; trem.connect(tg).connect(g.gain); trem.start();
      const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 260;
      o.connect(g).connect(lp2).connect(this.vehSynthG); o.start();
    }
    this.vehG.connect(this.sfxBus);
  }
  private startRadioBed() {
    const ctx = this.ctx; if (!ctx || !this.bank.has('radio_bed')) return;
    this.bank.play(ctx, 'radio_bed', { loop: true, gain: 0.5, dest: this.radioBus });
  }
  /** Engine/propeller/rumble loops from samples; the synth layers are turned down once these are running. */
  private startVehicleLoops() {
    const ctx = this.ctx; if (!ctx || this.loopsOn) return;
    if (!this.bank.has('tank_loop')) return;
    this.loopsOn = true;
    this.bank.play(ctx, 'tank_loop', { loop: true, gain: 0.9, dest: this.vehG });
    this.bank.play(ctx, 'rumble_loop', { loop: true, gain: 0.5, dest: this.vehG });
    this.bank.play(ctx, 'truck_loop', { loop: true, gain: 0.35, dest: this.vehG });
    this.vehSynthG.gain.setTargetAtTime(0.12, ctx.currentTime, 0.3);
  }
  private buildMusic(ctx: AudioContext) {
    // Slow minor pad (A1, A2, C3, E3, G3) through a drifting lowpass: restrained "map table" bed.
    this.musicG = ctx.createGain(); this.musicG.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.04; const lg = ctx.createGain(); lg.gain.value = 320; lfo.connect(lg).connect(lp.frequency); lfo.start();
    for (const f of [55, 110, 130.81, 164.81, 196]) {
      for (const dt of [-6, 6]) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = dt;
        const g = ctx.createGain(); g.gain.value = f < 100 ? 0.12 : 0.045; o.connect(g).connect(lp); o.start();
      }
    }
    lp.connect(this.musicG).connect(this.musicBus);
  }

  /** Contextual update (called ~2 Hz by the bridge). */
  update(input: MixInput) {
    const m = computeMix(input); this.targets = m; this.lastMix = m;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (!this.loadedCombat && m.voices.length) { this.loadedCombat = true; void this.bank.loadGroup(this.ctx, 'combat'); }
    if (!this.loadedVehicles && m.vehicles > 0) { this.loadedVehicles = true; void this.bank.loadGroup(this.ctx, 'vehicles').then(() => this.startVehicleLoops()); }
    // threshold switches: constant levels, only a short anti-click ramp (no zoom crossfades)
    this.windG.gain.setTargetAtTime(0.25 * m.ambience, t, 0.05);
    this.vehG.gain.setTargetAtTime(0.5 * m.vehicles, t, CLICK_TC);
    this.musicG.gain.setTargetAtTime(0.5 * m.music, t, 0.05);
    this.radioBus.gain.setTargetAtTime(m.radio, t, 0.05);
  }

  private tick() {
    const ctx = this.ctx; const m = this.targets; if (!ctx || !m || ctx.state !== 'running') return;
    const now = ctx.currentTime, ahead = now + 0.15;
    const live = new Set(m.voices.map(v => v.id));
    for (const [id, st] of this.voices) if (!live.has(id)) { this.closeGate(st.gate, now); this.voices.delete(id); }

    for (const v of m.voices) {
      let st = this.voices.get(v.id);
      if (!st) { st = { nextGun: now + Math.random() * 0.5, nextArty: now + 1 + Math.random() * 3, nextBoom: now + 2 + Math.random() * 5, burstLeft: 0, gate: this.openGate(now) }; this.voices.set(v.id, st); }
      const dest = st.gate; const g = 1;
      const lp = undefined; // constant tone: no distance filtering
      const muffle = 0;
      const smp = this.bank.has('rifle_1') && this.bank.has('smg_short');
      while (st.nextGun < ahead) {
        if (smp) {
          const t = Math.max(now, st.nextGun);
          if (v.mg && Math.random() < 0.3 + v.intensity * 0.4) { // only battles with machine guns get recorded bursts
            const id = ['mg_long', 'smg_short'][Math.floor(Math.random() * 2)];
            const dur = this.bank.get(id)?.duration ?? 2;
            this.playSample(id, { when: t, gain: 0.55 * g, pan: v.pan, rate: 0.95 + Math.random() * 0.12, lowpass: lp, dest });
            st.nextGun = t + dur * 0.75 + (0.8 + Math.random() * 2.2) / (0.4 + v.intensity * 1.6);
          } else { // scattered rifle shots
            this.playSample(['rifle_1', 'rifle_2', 'rifle_3'][Math.floor(Math.random() * 3)], { when: t, gain: 0.5 * g * (0.7 + Math.random() * 0.5), pan: v.pan + (Math.random() - 0.5) * 0.3, rate: 0.92 + Math.random() * 0.2, lowpass: lp, dest });
            st.nextGun = t + (0.35 + Math.random() * 1.4) / (0.4 + v.intensity * 1.6);
          }
          this.shotsFired++;
          continue;
        }
        if (st.burstLeft <= 0) st.burstLeft = 2 + Math.floor(Math.random() * (3 + v.intensity * 7));
        const t = Math.max(now, st.nextGun);
        gunshot(ctx, dest, this.noiseWhite, t, { gain: 0.35 * g * (0.7 + Math.random() * 0.5), pan: v.pan + (Math.random() - 0.5) * 0.2, heavy: Math.random() < 0.12, muffled: muffle });
        this.shotsFired++;
        st.burstLeft--;
        st.nextGun = t + (st.burstLeft > 0 ? 0.05 + Math.random() * 0.09 : (0.6 + Math.random() * 2.4) / (0.4 + v.intensity * 1.6));
      }
      if (st.nextArty < ahead) {
        const t = Math.max(now, st.nextArty);
        if (Math.random() < 0.5) shellWhistle(ctx, dest, t, { gain: g, pan: v.pan, dur: 0.9 });
        if (this.bank.has('art_fire_1')) {
          this.playSample(['art_fire_1', 'art_fire_2', 'art_fire_3', 'art_fire_4'][Math.floor(Math.random() * 4)], { when: t, gain: 0.8 * g, pan: v.pan, rate: 0.9 + Math.random() * 0.2, lowpass: lp, dest });
          if (this.bank.has('impact_1')) this.playSample(['impact_1', 'impact_2', 'impact_3', 'impact_4'][Math.floor(Math.random() * 4)], { when: t + 1 + Math.random() * 1.5, gain: 0.7 * g, pan: v.pan + (Math.random() - 0.5) * 0.4, rate: 0.9 + Math.random() * 0.2, lowpass: lp, dest });
        } else artilleryShot(ctx, dest, this.noiseWhite, t + (Math.random() < 0.5 ? 0 : 0.9), { gain: 0.5 * g, pan: v.pan, distance: 0 });
        st.nextArty = t + (2.5 + Math.random() * 5) / (0.4 + v.intensity * 1.4);
      }
      if (st.nextBoom < ahead) {
        const t = Math.max(now, st.nextBoom);
        if (this.bank.has('impact_1')) this.playSample(['impact_1', 'impact_2', 'impact_3', 'impact_4', 'impact_wall'][Math.floor(Math.random() * 5)], { when: t, gain: 0.8 * g, pan: v.pan + (Math.random() - 0.5) * 0.3, rate: 0.85 + Math.random() * 0.3, lowpass: lp, dest });
        else explosion(ctx, dest, this.noiseWhite, t, { gain: 0.6 * g, pan: v.pan + (Math.random() - 0.5) * 0.3, distance: 0 });
        st.nextBoom = t + (3 + Math.random() * 7) / (0.4 + v.intensity * 1.5);
      }
    }

    if (m.radio > 0.05 && this.nextRadio < ahead) {
      const t = Math.max(now, this.nextRadio);
      const dur = this.bank.has('radio_squelch_1')
        ? (this.playSample(Math.random() < 0.5 ? 'radio_squelch_1' : 'radio_squelch_2', { when: t, gain: 0.8, dest: this.radioBus, rate: 0.9 + Math.random() * 0.2 }), 0.3)
        : radioBlip(ctx, this.radioBus, this.noiseWhite, t, { gain: 0.16, syllables: 3 + Math.floor(Math.random() * 6) });
      burst(ctx, this.radioBus, this.noiseWhite, t + dur, { dur: 0.5, gain: 0.012, type: 'bandpass', freq: 2500, q: 0.6 });
      this.nextRadio = t + dur + 4 + Math.random() * 12 / (0.4 + m.radio);
    }
    if (m.music > 0.1 && this.nextNote < ahead) this.playNote(Math.max(now, this.nextNote), m);
  }

  private openGate(now: number): GainNode {
    const gate = this.ctx!.createGain(); gate.gain.value = 0; gate.gain.setTargetAtTime(1, now, CLICK_TC); gate.connect(this.battleBus); return gate;
  }
  /** Source left the viewport or the zoom dropped below the threshold: silence it (short ramp), tails included. */
  private closeGate(gate: GainNode, now: number) {
    gate.gain.cancelScheduledValues(now); gate.gain.setTargetAtTime(0, now, CLICK_TC);
    setTimeout(() => { try { gate.disconnect(); } catch { /* already gone */ } }, 250);
  }

  private playNote(t: number, m: MixTargets) {
    const ctx = this.ctx!; const scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25]; // A natural minor fragment
    this.noteIdx = (this.noteIdx + 1 + Math.floor(Math.random() * 3)) % scale.length;
    const f = scale[this.noteIdx];
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.003;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * m.music, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o.connect(g); o2.connect(g2).connect(g); g.connect(this.musicBus); o.start(t); o2.start(t); o.stop(t + 5.2); o2.stop(t + 5.2);
    this.nextNote = t + 4 + Math.random() * 7;
    if (m.combatIntensity > 0.4 && Math.random() < 0.5) thump(ctx, this.musicBus, t + 0.5, { freq: 70, freqEnd: 40, dur: 0.5, gain: 0.25 * m.music });
  }

  private playSample(id: string, o: { when?: number; gain?: number; pan?: number; rate?: number; lowpass?: number; dest?: AudioNode }) {
    if (!this.ctx) return null;
    const src = this.bank.play(this.ctx, id, { when: o.when, gain: o.gain, pan: o.pan, rate: o.rate, lowpass: o.lowpass, dest: o.dest ?? this.sfxBus });
    if (src) this.samplesPlayed++;
    return src;
  }

  /**
   * Plays a named cue (UI/order/stinger) through the SFX bus: a CC0 sample when loaded, otherwise the synth fallback.
   * Throttled per cue and by a global budget; returns whether it played.
   */
  cue(name: CueName, nowMs: number = (typeof performance !== 'undefined' ? performance.now() : Date.now())): boolean {
    const ctx = this.ctx; if (!ctx || ctx.state !== 'running') return false;
    if (!this.gate.allow(name, nowMs)) return false;
    const def = CUES[name];
    if (def.sting && !this.loadedStings) { this.loadedStings = true; void this.bank.loadGroup(ctx, 'stings'); }
    const id = def.samples[Math.floor(Math.random() * def.samples.length)];
    const t = ctx.currentTime + 0.01;
    const rate = def.jitter ? 1 + (Math.random() - 0.5) * 2 * def.jitter : undefined;
    if (this.bank.has(id)) {
      if (def.radio && this.bank.has('radio_squelch_1')) { this.playSample('radio_squelch_1', { when: t, gain: 0.35, dest: this.sfxBus }); this.playSample(id, { when: t + 0.12, gain: def.gain, rate, dest: this.sfxBus }); }
      else this.playSample(id, { when: t, gain: def.gain, rate, dest: this.sfxBus });
      return true;
    }
    if (!this.bank.hasFailed(id)) void this.bank.load(ctx, id);
    if (def.fallback) uiTone(ctx, this.sfxBus, t, def.fallback);
    return !!def.fallback;
  }

  /** Legacy UI feedback blips; mapped onto cues so they use samples when available. */
  sfx(kind: 'click' | 'order' | 'alert' | 'confirm') {
    this.cue(kind === 'click' ? 'click' : kind === 'order' ? 'order' : kind === 'alert' ? 'alert' : 'confirm');
  }

  dispose() { if (this.timer) clearInterval(this.timer); this.timer = null; void this.ctx?.close(); this.ctx = null; this.voices.clear(); }
}
