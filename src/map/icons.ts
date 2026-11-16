import type { NationId, SideId, UnitType } from '../core/types';
import { ILLUSTRATION_H, ILLUSTRATION_W, NATION_BANNER, unitIllustrationShapes } from './illustrations';

/** Logical icon size (CSS px at pixelRatio 1). Images are generated at ICON_RATIO x. */
export const ICON_W = 48;
export const ICON_H = 40;
export const ICON_RATIO = 2;

export const SIDE_COLOURS: Record<SideId, { fill: string; stroke: string }> = {
  allies: { fill: '#8fc1f5', stroke: '#0f2a4a' },
  axis: { fill: '#f09a9a', stroke: '#4a1111' },
  neutral: { fill: '#c9ced4', stroke: '#333a42' },
};

export const unitIconName = (type: UnitType, side: SideId, q: number): string => `u-${type}-${side}-${q}`;
export const parseUnitIconName = (name: string): { type: UnitType; side: SideId; q: number } | null => {
  const m = /^u-([a-z_]+)-(allies|axis|neutral)-(\d)$/.exec(name);
  return m ? { type: m[1] as UnitType, side: m[2] as SideId, q: Number(m[3]) } : null;
};

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function drawSymbol(c: Ctx, type: UnitType, cx: number, cy: number): void {
  c.beginPath();
  const x = (dx: number, dy: number) => c.lineTo(cx + dx, cy + dy);
  const m = (dx: number, dy: number) => c.moveTo(cx + dx, cy + dy);
  const cross = () => { m(-12, -9); x(12, 9); m(-12, 9); x(12, -9); };
  const oval = () => c.ellipse(cx, cy, 11, 6.5, 0, 0, Math.PI * 2);
  switch (type) {
    case 'infantry': cross(); break;
    case 'armoured': oval(); break;
    case 'mechanised': cross(); c.moveTo(cx + 11, cy); oval(); break;
    case 'motorised': cross(); m(0, -9); x(0, 9); break;
    case 'paratroop': cross(); m(-8, 12); c.quadraticCurveTo(cx, cy + 3, cx + 8, cy + 12); break;
    case 'artillery': c.arc(cx, cy, 4, 0, Math.PI * 2); c.fill(); break;
    case 'antitank': m(-11, 8); x(0, -9); x(11, 8); break;
    case 'recon': m(-12, 9); x(12, -9); break;
    case 'engineer': m(-9, 8); x(-9, -3); x(-5, -3); x(-5, 1); x(5, 1); x(5, -3); x(9, -3); x(9, 8); break;
    case 'logistics': m(-8, 8); x(-8, -8); x(8, -8); x(8, 0); x(-8, 0); m(-8, 8); x(8, 8); break;
    case 'hq': m(-10, 10); x(-10, -10); m(-10, -10); x(8, -10); x(8, -2); x(-10, -2); break;
    case 'air_fighter': m(-12, 4); c.quadraticCurveTo(cx - 6, cy - 12, cx, cy); c.quadraticCurveTo(cx + 6, cy - 12, cx + 12, cy + 4); break;
    case 'air_bomber': m(-12, 4); c.quadraticCurveTo(cx - 6, cy - 12, cx, cy); c.quadraticCurveTo(cx + 6, cy - 12, cx + 12, cy + 4); m(0, 0); x(0, 10); break;
    case 'naval': case 'carrier':
      c.arc(cx, cy - 7, 2.5, 0, Math.PI * 2); m(0, -4.5); x(0, 9); m(-5, 0); x(5, 0); m(-9, 3); c.quadraticCurveTo(cx - 8, cy + 11, cx, cy + 9); c.quadraticCurveTo(cx + 8, cy + 11, cx + 9, cy + 3);
      if (type === 'carrier') { m(-12, -2); x(12, -2); }
      break;
  }
  if (type !== 'artillery') c.stroke();
}

/** Draws a NATO-style unit icon onto ctx (logical coordinates; caller scales by ICON_RATIO). */
export function drawUnitIcon(c: Ctx, type: UnitType, side: SideId, q: number): void {
  const col = SIDE_COLOURS[side];
  c.clearRect(0, 0, ICON_W, ICON_H);
  // frame
  const fx = 2, fy = 2, fw = 44, fh = 30;
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.fillStyle = col.fill; c.strokeStyle = col.stroke; c.lineWidth = 2;
  c.beginPath(); c.rect(fx, fy, fw, fh); c.fill(); c.stroke();
  c.lineWidth = 2; c.fillStyle = col.stroke;
  drawSymbol(c, type, fx + fw / 2, fy + fh / 2);
  // strength bar
  c.fillStyle = '#10151b'; c.fillRect(fx, 35, fw, 5);
  const f = Math.max(0, Math.min(1, q / 4));
  c.fillStyle = q >= 3 ? '#4cc36b' : q === 2 ? '#e0b23a' : '#e0503a';
  c.fillRect(fx + 1, 36, (fw - 2) * f, 3);
}

export function drawBattleIcon(c: Ctx, size: number): void {
  c.clearRect(0, 0, size, size);
  const r = size / 2 - 2;
  c.beginPath(); c.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  c.fillStyle = 'rgba(190,30,30,0.9)'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
  c.lineWidth = 3; c.lineCap = 'round'; c.strokeStyle = '#fff';
  c.beginPath(); c.moveTo(size * 0.3, size * 0.3); c.lineTo(size * 0.7, size * 0.7); c.moveTo(size * 0.7, size * 0.3); c.lineTo(size * 0.3, size * 0.7); c.stroke();
}

export interface RawImage { width: number; height: number; data: Uint8ClampedArray }

function makeCtx(w: number, h: number): { ctx: Ctx; read: () => RawImage } {
  const cv: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = cv.getContext('2d') as Ctx;
  return { ctx, read: () => { const d = ctx.getImageData(0, 0, w, h); return { width: w, height: h, data: d.data }; } };
}

export function createUnitIcon(type: UnitType, side: SideId, q: number): RawImage {
  const { ctx, read } = makeCtx(ICON_W * ICON_RATIO, ICON_H * ICON_RATIO);
  ctx.scale(ICON_RATIO, ICON_RATIO);
  drawUnitIcon(ctx, type, side, q);
  return read();
}

export function createBattleIcon(): RawImage {
  const s = 32 * ICON_RATIO;
  const { ctx, read } = makeCtx(s, s);
  ctx.scale(ICON_RATIO, ICON_RATIO);
  drawBattleIcon(ctx, 32);
  return read();
}

// ───────── illustrated (close-zoom) icons ─────────
export const ART_W = 72;
export const ART_H = 62;

export const illustrationIconName = (type: UnitType, nation: NationId, side: SideId, q: number): string => `i-${type}-${nation}-${side}-${q}`;
export const parseIllustrationIconName = (name: string): { type: UnitType; nation: NationId; side: SideId; q: number } | null => {
  const m = /^i-([a-z_]+)-([A-Z]+)-(allies|axis|neutral)-(\d)$/.exec(name);
  return m ? { type: m[1] as UnitType, nation: m[2] as NationId, side: m[3] as SideId, q: Number(m[4]) } : null;
};

/** Draws card + illustration + nation banner + strength bar (logical px, caller scales by ICON_RATIO). */
export function drawIllustratedIcon(c: Ctx, type: UnitType, nation: NationId, side: SideId, q: number, photo?: CanvasImageSource & { width: number; height: number }): void {
  const col = SIDE_COLOURS[side];
  c.clearRect(0, 0, ART_W, ART_H);
  c.lineJoin = 'round'; c.lineCap = 'round';
  // card
  const grd = c.createLinearGradient(0, 2, 0, 45);
  grd.addColorStop(0, '#f6f1e2'); grd.addColorStop(1, '#d9d2b8');
  c.fillStyle = grd; c.beginPath(); c.roundRect(2, 2, 68, 44, 4); c.fill();
  c.strokeStyle = col.stroke; c.lineWidth = 1; c.stroke();
  // ground line
  c.fillStyle = 'rgba(90,80,50,0.18)'; c.fillRect(3, 38, 66, 7);
  // photo (cover-fit, rounded) or illustration (64x40 box)
  if (photo) {
    c.save(); c.beginPath(); c.roundRect(3, 3, 66, 42, 3); c.clip();
    const k = Math.max(66 / photo.width, 42 / photo.height), pw = photo.width * k, ph = photo.height * k;
    c.drawImage(photo, 3 + (66 - pw) / 2, 3 + (42 - ph) / 2, pw, ph);
    c.restore();
  }
  c.save(); c.translate(4, 4.5); c.scale(1, 1);
  for (const s of photo ? [] : unitIllustrationShapes(type, nation)) {
    c.save();
    if (s.tr) { c.translate(s.tr[0], s.tr[1]); c.scale(s.tr[2], s.tr[2]); }
    const path = new Path2D(s.d);
    if (s.fill) { c.fillStyle = s.fill; c.fill(path); }
    if (s.stroke && s.stroke !== 'none') { c.strokeStyle = s.stroke; c.lineWidth = s.sw ?? 1; c.stroke(path); }
    c.restore();
  }
  c.restore();
  void ILLUSTRATION_W; void ILLUSTRATION_H;
  // frame: side colour for illustrations; nation colour (inside) + side colour (outside) for photos
  if (photo) { c.strokeStyle = NATION_BANNER[nation] ?? '#5b6670'; c.lineWidth = 3; c.beginPath(); c.roundRect(3.5, 3.5, 65, 41, 3.5); c.stroke(); c.strokeStyle = col.fill; c.lineWidth = 2; c.beginPath(); c.roundRect(1.5, 1.5, 69, 45, 4.5); c.stroke(); }
  else { c.strokeStyle = col.fill; c.lineWidth = 3; c.beginPath(); c.roundRect(2, 2, 68, 44, 4); c.stroke(); }
  c.strokeStyle = col.stroke; c.lineWidth = 1; c.beginPath(); c.roundRect(0.5, 0.5, 71, 47, 5); c.stroke();
  // nation banner
  c.fillStyle = NATION_BANNER[nation] ?? '#5b6670';
  c.beginPath(); c.roundRect(2, 46, 68, 10, [0, 0, 4, 4]); c.fill();
  c.strokeStyle = col.stroke; c.lineWidth = 1; c.stroke();
  c.fillStyle = '#fff'; c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(nation, ART_W / 2, 51.4);
  // strength bar
  c.fillStyle = '#10151b'; c.fillRect(2, 57, 68, 5);
  const f = Math.max(0, Math.min(1, q / 4));
  c.fillStyle = q >= 3 ? '#4cc36b' : q === 2 ? '#e0b23a' : '#e0503a';
  c.fillRect(3, 58, 66 * f, 3);
}

export function createIllustratedIcon(type: UnitType, nation: NationId, side: SideId, q: number): RawImage {
  const { ctx, read } = makeCtx(ART_W * ICON_RATIO, ART_H * ICON_RATIO);
  ctx.scale(ICON_RATIO, ICON_RATIO);
  drawIllustratedIcon(ctx, type, nation, side, q);
  return read();
}

export function createPhotoIcon(type: UnitType, nation: NationId, side: SideId, q: number, photo: CanvasImageSource & { width: number; height: number }): RawImage {
  const { ctx, read } = makeCtx(ART_W * ICON_RATIO, ART_H * ICON_RATIO);
  ctx.scale(ICON_RATIO, ICON_RATIO);
  drawIllustratedIcon(ctx, type, nation, side, q, photo);
  return read();
}
