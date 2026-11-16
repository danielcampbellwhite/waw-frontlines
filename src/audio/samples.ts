/**
 * Sample playback bank: lazy-loads small CC0 Ogg files from /audio (see credits.ts) into AudioBuffers.
 * If a file is missing or fails to decode, `play()` returns false and callers fall back to the procedural synth.
 */
export type SampleGroup = 'ui' | 'radio' | 'combat' | 'vehicles' | 'stings';

export const SAMPLE_GROUPS: Record<SampleGroup, string[]> = {
  ui: ['ui_click', 'ui_panel_open', 'ui_panel_close', 'ui_select_1', 'ui_select_2', 'ui_confirm', 'ui_error', 'ui_pause', 'ui_resume', 'ui_speed', 'ui_notify', 'ui_save', 'ui_load', 'ord_move', 'ord_attack', 'ord_defend', 'ord_generic'],
  radio: ['radio_squelch_1', 'radio_squelch_2', 'radio_bed', 'event_telegraph', 'alert_beep'],
  combat: ['rifle_1', 'rifle_2', 'rifle_3', 'smg_short', 'mg_long', 'smg_long', 'art_fire_1', 'art_fire_2', 'art_fire_3', 'art_fire_4', 'impact_1', 'impact_2', 'impact_3', 'impact_4', 'impact_wall', 'battle_start'],
  vehicles: ['tank_loop', 'truck_loop', 'rumble_loop'],
  stings: ['sting_victory', 'sting_defeat', 'sting_obj_captured', 'sting_obj_lost'],
};

export type Fetcher = (url: string) => Promise<ArrayBuffer>;
const defaultFetcher: Fetcher = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.arrayBuffer(); };

export interface PlayOpts { when?: number; gain?: number; pan?: number; rate?: number; lowpass?: number; loop?: boolean; dest: AudioNode }

export class SampleBank {
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<void>>();
  private failed = new Set<string>();
  private base: string; private fetcher: Fetcher;
  constructor(base: string, fetcher: Fetcher = defaultFetcher) { this.base = base; this.fetcher = fetcher; }

  has(id: string) { return this.buffers.has(id); }
  hasFailed(id: string) { return this.failed.has(id); }
  get(id: string) { return this.buffers.get(id); }
  get loadedCount() { return this.buffers.size; }

  /** Starts loading (idempotent). Resolves when decoded or failed; never rejects. */
  load(ctx: BaseAudioContext, id: string): Promise<void> {
    if (this.buffers.has(id) || this.failed.has(id)) return Promise.resolve();
    let p = this.pending.get(id);
    if (!p) {
      p = this.fetcher(`${this.base}${id}.ogg`)
        .then(data => ctx.decodeAudioData(data))
        .then(buf => { this.buffers.set(id, buf); }, () => { this.failed.add(id); })
        .finally(() => { this.pending.delete(id); });
      this.pending.set(id, p);
    }
    return p;
  }

  /** Loads a group in the background, a few files at a time (does not block anything). */
  async loadGroup(ctx: BaseAudioContext, group: SampleGroup, concurrency = 3): Promise<void> {
    const queue = SAMPLE_GROUPS[group].filter(id => !this.buffers.has(id) && !this.failed.has(id));
    const worker = async () => { for (let id = queue.shift(); id; id = queue.shift()) await this.load(ctx, id); };
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  }

  /** Plays a loaded sample. Returns the source node, or null when the sample is not available (caller falls back). */
  play(ctx: AudioContext, id: string, o: PlayOpts): AudioBufferSourceNode | null {
    const buf = this.buffers.get(id);
    if (!buf) { if (!this.failed.has(id)) void this.load(ctx, id); return null; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = !!o.loop;
    if (o.rate) src.playbackRate.value = o.rate;
    const g = ctx.createGain(); g.gain.value = o.gain ?? 1;
    let node: AudioNode = src; node.connect(g); node = g;
    if (o.lowpass) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lowpass; node.connect(f); node = f; }
    if (o.pan !== undefined && 'createStereoPanner' in ctx) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); node.connect(p); node = p; }
    node.connect(o.dest);
    src.start(o.when ?? 0);
    return src;
  }
}
