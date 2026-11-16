import type { NationId, Unit, UnitType } from '../core/types';

/** Contract of src/art/index.ts (owned by the art engineer). */
export interface PhotoInfo { thumb: string; panel?: string; credit?: string; subject?: string; /** e.g. 'hq' | 'staff' | 'command' | 'signals' | 'combat' */ role?: string; tags?: string[] }
type UnitPhotoFn = (type: UnitType, nation: NationId, hint?: string, variantSeed?: string) => PhotoInfo | null;
type MainEquipFn = (held: Record<string, number>) => string | undefined;

// Optional module: import.meta.glob yields {} while the file does not exist, so nothing breaks before it lands.
const mods = import.meta.glob('../art/index.ts', { eager: true }) as Record<string, { unitPhoto?: UnitPhotoFn; mainEquipmentKey?: MainEquipFn }>;
let unitPhoto: UnitPhotoFn | null = Object.values(mods).map((m) => m.unitPhoto).find((f): f is UnitPhotoFn => typeof f === 'function') ?? null;
let mainEquipmentKey: MainEquipFn | null = Object.values(mods).map((m) => m.mainEquipmentKey).find((f): f is MainEquipFn => typeof f === 'function') ?? null;
export const photosAvailable = (): boolean => unitPhoto !== null;
/** Test/dev hook: override the provider (e.g. to preview the photo layout before src/art exists). */
export function setPhotoProvider(fn: UnitPhotoFn | null): void { unitPhoto = fn; infoCache.clear(); }

const SMALL_ARMS = /rifle|pistol|smg|carbine|grenade|small|mortar_light/i;
/** Hint = the art module's mainEquipmentKey(held) when available (same as the UI panel); else the largest non-small-arms holding. */
export function equipmentHint(u: Pick<Unit, 'equipment'>): string | undefined {
  if (mainEquipmentKey) { try { return mainEquipmentKey(u.equipment?.held ?? {}); } catch { /* fall through */ } }
  let best: string | undefined, bn = 0, bestAny: string | undefined, an = 0;
  for (const [k, n] of Object.entries(u.equipment?.held ?? {})) {
    if (n > an) { an = n; bestAny = k; }
    if (!SMALL_ARMS.test(k) && n > bn) { bn = n; best = k; }
  }
  return best ?? bestAny;
}

const infoCache = new Map<string, PhotoInfo | null>();
export function photoFor(u: Pick<Unit, 'id' | 'type' | 'nation' | 'equipment'>): PhotoInfo | null {
  if (!unitPhoto) return null;
  const hint = equipmentHint(u);
  const k = `${u.type}|${u.nation}|${hint ?? ''}|${u.id}`; // unit id = variantSeed: rotates between equally good photos, like the UI panel
  let v = infoCache.get(k);
  if (v === undefined) {
    try { v = unitPhoto(u.type, u.nation, hint, u.id) ?? null; } catch { v = null; }
    // HQ markers must never show a plain infantry/combat photo: require an explicit headquarters-type role/subject/tag
    if (v && u.type === 'hq' && !isHqPhoto(v)) v = null;
    infoCache.set(k, v);
  }
  return v;
}

const imgs = new Map<string, { img: HTMLImageElement; ok: boolean; failed: boolean }>();
/** Returns the decoded thumbnail when ready; otherwise starts loading and calls onReady when it arrives. */
export function loadThumb(url: string, onReady: () => void): HTMLImageElement | null {
  let e = imgs.get(url);
  if (!e) {
    const img = new Image();
    e = { img, ok: false, failed: false };
    const entry = e;
    img.onload = () => { entry.ok = true; onReady(); };
    img.onerror = () => { entry.failed = true; };
    img.src = url;
    imgs.set(url, e);
  }
  return e.ok ? e.img : null;
}

export function hashStr(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const HQ_WORDS = /headquarter|hq|staff|command|signal|radio|telephone|map table|conference/i;
export function isHqPhoto(p: PhotoInfo): boolean {
  return HQ_WORDS.test(p.role ?? '') || (p.tags ?? []).some((t) => HQ_WORDS.test(t)) || HQ_WORDS.test(p.subject ?? '');
}
