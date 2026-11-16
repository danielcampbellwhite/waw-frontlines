/**
 * Original hand-authored vector unit illustrations (side views, facing right, 64x40 box).
 * No third-party or copyrighted art: every silhouette is built here from SVG path data.
 * Single source of truth: the same Shape[] is (a) serialised by `unitIllustrationSvg` for the UI and
 * (b) drawn synchronously on canvas with Path2D by icons.ts for MapLibre images.
 * Nation variants (helmets, tank silhouettes, national markings) only for GER / FRA / GBR(+Commonwealth);
 * everything else uses a generic variant.
 */
import type { NationId, UnitType } from '../core/types';

export interface Shape { d: string; fill?: string; stroke?: string; sw?: number; tr?: [dx: number, dy: number, scale: number] }
export const ILLUSTRATION_W = 64;
export const ILLUSTRATION_H = 40;

export const UNIT_TYPES: UnitType[] = ['infantry', 'armoured', 'mechanised', 'motorised', 'paratroop', 'artillery', 'antitank', 'recon', 'engineer', 'logistics', 'hq', 'air_fighter', 'air_bomber', 'naval', 'carrier'];

type Group = 'ger' | 'fra' | 'gbr' | 'gen';
const groupOf = (n: NationId): Group =>
  n === 'GER' ? 'ger' : n === 'FRA' || n === 'BEL' ? 'fra' : n === 'GBR' || n === 'CAN' || n === 'AUS' || n === 'NZL' || n === 'IND' || n === 'RSA' ? 'gbr' : 'gen';

const INK = '#1b1f24';
const PAL: Record<Group, { body: string; dark: string; light: string; uniform: string; accent: string }> = {
  ger: { body: '#70767d', dark: '#3b3f45', light: '#9aa1aa', uniform: '#69705f', accent: '#a52a2a' },
  fra: { body: '#8c8b5c', dark: '#4d4c2f', light: '#b4b384', uniform: '#7d8aa0', accent: '#2b4fa3' },
  gbr: { body: '#7c784f', dark: '#44412a', light: '#a9a577', uniform: '#8a7d50', accent: '#b22234' },
  gen: { body: '#707a58', dark: '#3c4430', light: '#9aa482', uniform: '#79805f', accent: '#6b7280' },
};
const SKIN = '#d8b48f';
const CANVAS = '#b9b08a';

// ── path helpers ──
const circ = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
const rect = (x: number, y: number, w: number, h: number, r = 0) => (r
  ? `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}Z`
  : `M${x} ${y}h${w}v${h}h${-w}Z`);
const P = (d: string, fill?: string, stroke: string | undefined = INK, sw = 1): Shape => ({ d, fill, stroke, sw });
const line = (d: string, stroke = INK, sw = 1): Shape => ({ d, stroke, sw });
const moved = (shapes: Shape[], dx: number, dy: number, s = 1): Shape[] => shapes.map((x) => ({ ...x, tr: [dx, dy, s] }));
const wheel = (cx: number, cy: number, r: number): Shape[] => [P(circ(cx, cy, r), '#2a2d31'), P(circ(cx, cy, r * 0.45), '#8d949c', INK, 0.5)];

// ── national markings ──
function balkenkreuz(cx: number, cy: number, s: number): Shape[] {
  const a = s, b = s * 0.34;
  const plus = (x: number, y: number, w: number, t: number) => `M${x - t} ${y - w}h${2 * t}v${w - t}h${w - t}v${2 * t}h${-(w - t)}v${w - t}h${-2 * t}v${-(w - t)}h${-(w - t)}v${-2 * t}h${w - t}Z`;
  return [P(plus(cx, cy, a + 0.8, b + 0.8), '#f4f4f0', 'none', 0), P(plus(cx, cy, a, b), '#101010', 'none', 0)];
}
function roundel(cx: number, cy: number, r: number, rings: [string, string, string]): Shape[] {
  return [P(circ(cx, cy, r), rings[0], INK, 0.4), P(circ(cx, cy, r * 0.66), rings[1], 'none', 0), P(circ(cx, cy, r * 0.33), rings[2], 'none', 0)];
}
/** Ground vehicles: German Balkenkreuz; French/British vehicles carry a small national-colours patch (recognition panel). */
function vehicleMark(g: Group, cx: number, cy: number): Shape[] {
  if (g === 'ger') return balkenkreuz(cx, cy, 4.2);
  if (g === 'fra') return [P(rect(cx - 4, cy - 2.6, 2.7, 5.2), '#2b4fa3', 'none', 0), P(rect(cx - 1.3, cy - 2.6, 2.7, 5.2), '#f4f4f0', 'none', 0), P(rect(cx + 1.4, cy - 2.6, 2.7, 5.2), '#d62f2f', 'none', 0)];
  if (g === 'gbr') return [P(rect(cx - 4, cy - 2.6, 8, 5.2), '#24408e', 'none', 0), line(`M${cx - 4} ${cy - 2.6}L${cx + 4} ${cy + 2.6}M${cx + 4} ${cy - 2.6}L${cx - 4} ${cy + 2.6}`, '#f4f4f0', 1.3), line(`M${cx - 4} ${cy}h8M${cx} ${cy - 2.6}v5.2`, '#d62f2f', 1.3)];
  return [];
}
function aircraftMark(g: Group, cx: number, cy: number, r: number): Shape[] {
  if (g === 'ger') return balkenkreuz(cx, cy, r * 0.95);
  if (g === 'fra') return roundel(cx, cy, r, ['#d62f2f', '#f4f4f0', '#24408e']);
  if (g === 'gbr') return roundel(cx, cy, r, ['#24408e', '#f4f4f0', '#d62f2f']);
  return roundel(cx, cy, r, ['#6b7280', '#f4f4f0', '#6b7280']);
}

// ── soldier ──
function soldier(g: Group, rifle = true): Shape[] {
  const p = PAL[g];
  const helmet: Record<Group, Shape[]> = {
    ger: [P('M25.6 10.5Q25.6 4 31.2 4Q36.8 4 36.8 10.5L38.6 13.2L24.6 13.2Z', '#4f5550')],               // Stahlhelm: deep skirt, flared rear
    fra: [P('M26.4 10Q26.4 4.2 31.2 4.2Q36 4.2 36 10Z', '#6f7c92'), P(rect(30.4, 2.4, 1.8, 3), '#6f7c92')],  // Adrian: rounded, crest
    gbr: [P('M23.8 9.8Q31.2 1.6 38.6 9.8Q31.2 8.4 23.8 9.8Z', '#6a6b45')],                                // Brodie: shallow wide brim
    gen: [P('M26 10Q26 4.2 31.2 4.2Q36.4 4.2 36.4 10Z', '#5d6850')],
  };
  const s: Shape[] = [
    P('M27 27L26 37.4L30.8 37.4L32 28Z', p.dark), P('M32 27L34.4 37.4L39.2 37.4L36.6 27Z', p.dark),
    P(rect(25.4, 36.4, 6, 2.4, 1), '#25201b'), P(rect(33.6, 36.4, 6, 2.4, 1), '#25201b'),
    P(rect(26, 13.6, 10.4, 14.4, 2.4), p.uniform),
    line('M26 22L36.4 22', p.dark, 1),
    P(circ(31.2, 10.2, 3.5), SKIN),
    ...helmet[g],
  ];
  if (rifle) s.push(P('M30 22.5L55 14.6L55.8 16.6L31 24.6Z', '#6b4a2a'), P('M45 17.4L47 16.8L47.6 18.6L45.6 19.2Z', '#2a2d31', 'none', 0));
  return s;
}

// ── vehicles ──
function tank(g: Group): Shape[] {
  const p = PAL[g];
  if (g === 'fra') { // Char B1-style: long rhomboid track run, hull gun, small turret
    return [
      P('M5 31L13 21.5L49 21.5L57 31L53 35.4L9 35.4Z', p.dark),
      ...[14, 21, 28, 35, 42, 49].flatMap((x) => wheel(x, 31.4, 2.6)),
      P(rect(14, 14.6, 34, 7, 1.2), p.body),
      P('M29 14.6L31 8.6L40 8.6L42 14.6Z', p.body), P(rect(32, 6.4, 5, 2.4, 1), p.light),
      P(rect(41, 10.6, 11, 1.7), p.dark), P(rect(48, 16.4, 9, 2.4), p.dark),
      ...vehicleMark(g, 22, 18.2),
    ];
  }
  if (g === 'gbr') { // Matilda II-style: low hull, track skirt, small round turret, 2-pdr
    return [
      P('M7 30Q7 35.6 13 35.6L51 35.6Q57 35.6 57 30L52 22.6L12 22.6Z', p.body),
      ...[15, 23, 31, 39, 47].map((x) => P(circ(x, 30.6, 2.4), p.dark, INK, 0.7)),
      P(rect(12, 20.4, 40, 3, 1), p.body),
      P('M25 20.4Q26 11.6 33 11.6Q40 11.6 41 20.4Z', p.body), P(rect(31, 8.8, 5, 3, 1), p.light),
      P(rect(40, 14.4, 15, 1.9), p.dark),
      ...vehicleMark(g, 18, 27.6),
    ];
  }
  if (g === 'ger') { // Panzer III/IV-style: boxy hull, upright turret with cupola, spaced road wheels
    return [
      P(rect(8, 27, 46, 8.6, 4.2), p.dark),
      ...[14, 21, 28, 35, 42, 49].flatMap((x) => wheel(x, 31.4, 2.7)),
      P('M10 27L14 18.4L46 18.4L52 23L54 27Z', p.body),
      P('M21 18.4L23.4 10.4L38 10.4L40.6 18.4Z', p.body), P(rect(29, 7.4, 5.6, 3.2, 1), p.light),
      P(rect(40, 12, 15, 2.1), p.dark), P(rect(36.6, 11.2, 4.6, 3.8), p.dark),
      ...vehicleMark(g, 30, 22.6),
    ];
  }
  return [
    P(rect(8, 27, 46, 8.6, 4.2), p.dark), ...[14, 22, 30, 38, 46].flatMap((x) => wheel(x, 31.4, 2.7)),
    P('M10 27L14 19L48 19L54 27Z', p.body), P('M22 19L25 11L39 11L41 19Z', p.body), P(rect(40, 12.6, 14, 2.2), p.dark),
  ];
}
function recon(g: Group): Shape[] {
  const p = PAL[g];
  return [
    line('M14 18L10 4', INK, 0.8),
    P('M6 27L9 19.4L40 19.4L46 23L57 25L57 31L6 31Z', p.body),
    P(rect(24, 13, 14, 6.6, 2), p.body), P(rect(37, 15, 12, 1.6), p.dark),
    P(rect(11, 21.4, 8, 3.6), '#9fc3d8'),
    ...wheel(16, 33, 5.4), ...wheel(47, 33, 5.4),
    ...vehicleMark(g, 30, 25.6),
  ];
}
function halftrack(g: Group): Shape[] {
  const p = PAL[g];
  return [
    P(rect(8, 28, 32, 8, 4), p.dark), ...[13, 20, 27, 34].flatMap((x) => wheel(x, 32.4, 2.6)),
    P('M8 28L10 18.4L40 18.4L44 12.4L54 12.4L57 22L57 28Z', p.body),
    P(rect(45, 14.2, 7, 4, 1), '#9fc3d8'),
    ...[15, 22, 29].map((x) => [P(circ(x, 16.6, 2.9), SKIN), P(`M${x - 3.2} 16.4Q${x - 3.2} 11.8 ${x} 11.8Q${x + 3.2} 11.8 ${x + 3.2} 16.4Z`, p.dark)]).flat(),
    ...wheel(50, 33, 4.8),
    line('M36 18.4L38 14L42 14', INK, 1),
    ...vehicleMark(g, 38, 24),
  ];
}
function truck(g: Group, loaded: 'troops' | 'cargo'): Shape[] {
  const p = PAL[g];
  const s: Shape[] = [];
  if (loaded === 'cargo') s.push(P('M6 10Q6 7.4 9 7.4L36 7.4Q38 7.4 38 10L38 29L6 29Z', CANVAS), line('M14 8L14 28M22 8L22 28M30 8L30 28', '#8f8660', 0.8));
  else {
    s.push(P(rect(6, 19, 32, 10, 1), p.body));
    for (const x of [13, 20.5, 28]) s.push(P(circ(x, 16.2, 2.9), SKIN), P(`M${x - 3.2} 16Q${x - 3.2} 11.4 ${x} 11.4Q${x + 3.2} 11.4 ${x + 3.2} 16Z`, p.dark));
  }
  s.push(P('M38 15.4L47 15.4L53 23L57 25L57 31L38 31Z', p.body), P('M40 17.4L46 17.4L50 23L40 23Z', '#9fc3d8'), ...wheel(15, 33, 5), ...wheel(29, 33, 5), ...wheel(48, 33, 5), ...vehicleMark(g, 24, 24));
  return s;
}

// ── guns ──
function fieldGun(g: Group, heavy: boolean): Shape[] {
  const p = PAL[g];
  const L = heavy ? 58 : 56;
  return [
    P(`M24 31L5 37.4L6.6 39.2L26 33.6Z`, p.dark),
    P(`M25 19.6L${L} ${heavy ? 8.6 : 12.6}L${L + 1} ${heavy ? 12 : 15.4}L26.4 24.4Z`, p.dark),
    P(rect(heavy ? 52 : 54, heavy ? 8.2 : 12.2, 4, heavy ? 4 : 3.4, 1), '#2a2d31', INK, 0.6),
    P('M21 13.6L26 13.6L27.6 30L20.4 30Z', p.body),
    ...wheel(24, 31, heavy ? 8 : 7.2),
  ];
}
function antitank(g: Group): Shape[] {
  const p = PAL[g];
  return [
    P('M24 27L7 34.4L8.6 36.4L26 30.4Z', p.dark),
    P('M20 22.6L57 19.6L57 21.6L22 26Z', p.dark), P(rect(55, 18.8, 4, 3.6, 1), '#2a2d31', INK, 0.6),
    P('M19 16L24 16L25.2 28.4L18 28.4Z', p.body),
    ...wheel(23, 30.6, 5.4),
    ...moved(soldier(g, false), -9, 6, 0.7),
  ];
}

// ── air ──
function fighter(g: Group): Shape[] {
  const p = PAL[g];
  return [
    P('M9 21.4L4 9.6L11.6 9.6L17 19Z', p.body),
    P('M6 22.4Q8 18.4 18 17.2L44 17.2L56 21.4L44 25.6L16 26.6Q8 26.6 6 22.4Z', p.body),
    P('M24 17.2Q27 11.4 33.4 11.4Q36.6 12.4 37.6 17.2Z', '#9fc3d8'),
    P('M27 22.4L37 29.4L30.4 29.4L21 22.4Z', p.dark),
    P('M56 21.4L60 21.4L60 22.4L56 22.4Z', INK),
    P(rect(58.4, 13.2, 1.6, 16.4, 0.8), 'rgba(40,40,40,0.55)', 'none', 0),
    ...aircraftMark(g, 18.4, 22, 2.8),
  ];
}
function bomber(g: Group): Shape[] {
  const p = PAL[g];
  return [
    P('M10 22L3 7.6L12.4 7.6L19 18Z', p.body),
    P('M3 23Q9 16.4 24 15.6L46 15.6Q57 17.6 61 23.6Q57 27.4 44 27.4L12 27.4Q6 26.6 3 23Z', p.body),
    P('M47 16Q55 17 59.6 22.4L47 22.4Z', '#9fc3d8'),
    P('M22 24L40 32.6L29 32.6L13 24Z', p.dark),
    P(rect(26, 26, 13, 6, 3), p.dark),
    P(rect(58.6, 15, 1.6, 18, 0.8), 'rgba(40,40,40,0.55)', 'none', 0),
    ...aircraftMark(g, 15.6, 21.4, 3),
  ];
}

// ── sea ──
const waves = (): Shape => line('M0 34.6Q4 32.4 8 34.6T16 34.6T24 34.6T32 34.6T40 34.6T48 34.6T56 34.6T64 34.6', '#3f6f9a', 1.6);
function ship(g: Group, carrier: boolean): Shape[] {
  const hull = '#6d7780', dark = '#3f474f';
  const flag = (x: number, y: number): Shape[] => [line(`M${x} ${y}v-6`, INK, 0.8), P(`M${x} ${y - 6}h6v3.4h-6Z`, g === 'ger' ? '#a52a2a' : g === 'fra' ? '#2b4fa3' : g === 'gbr' ? '#b22234' : '#6b7280', INK, 0.4)];
  if (carrier) return [
    P('M3 24L60 24L55 32Q30 36 8 32Z', hull),
    P(rect(2, 20.6, 60, 3.6, 1), dark),
    P(rect(40, 11.6, 8, 9, 1), hull), P(rect(42, 7.6, 3.4, 4.2), dark),
    P('M13 20.6L15 17.4L19 17.4L21 20.6Z', '#b5bcc4', INK, 0.6), P('M26 20.6L28 17.4L32 17.4L34 20.6Z', '#b5bcc4', INK, 0.6),
    ...flag(5, 20.6), waves(),
  ];
  return [
    P('M2 26.4L8 22.4L56 22.4L62 20.4L58 31.4Q30 36 6 31.4Z', hull),
    P(rect(22, 15.4, 17, 7, 1), hull), P(rect(29.6, 10.6, 7, 4.8, 1), hull),
    P(rect(21, 8.4, 4.2, 7.4), dark), P(rect(40, 11, 4, 5), dark),
    P(rect(10, 17.6, 9, 4.8, 1), dark), P(rect(18, 18.8, 8, 1.5), dark),
    P(rect(45, 17.6, 9, 4.8, 1), dark), P(rect(53, 18.8, 9, 1.5), dark),
    line('M33 10.6L33 3', INK, 0.8), ...flag(5, 22.4), waves(),
  ];
}

// ── support ──
function engineer(g: Group): Shape[] {
  const p = PAL[g];
  return [
    P(rect(4, 34, 56, 3, 1), '#8b6a3e'), P(rect(4, 31, 6, 3.4), '#6b4f2d'), P(rect(54, 31, 6, 3.4), '#6b4f2d'),
    ...moved(soldier(g, false), -4, -2, 0.92),
    P('M40 14L52 28L50.4 29.6L38.4 15.6Z', '#6b4a2a'), P('M48 8L56 12L52 18L50.4 14Z', '#9097a0'),
    P(rect(46, 22, 10, 3, 1), p.dark),
  ];
}
function hq(g: Group): Shape[] {
  const p = PAL[g];
  return [
    P('M6 35L30 14L54 35Z', CANVAS), P('M25 35L30 22L35 35Z', '#3d3a2a'),
    line('M30 14L30 2', INK, 1.1), P('M30 2L43 5.4L30 9Z', p.accent, INK, 0.7),
    line('M44 35L44 18M40 18L48 18', INK, 0.9),
    P(rect(48, 30, 10, 5, 1), p.body),
  ];
}
function paratroop(g: Group): Shape[] {
  return [
    P('M10 15Q32 -8 54 15Q43 10.4 32 13Q21 10.4 10 15Z', '#e8e2cc'),
    line('M10 15L26 27M21 11.4L29 25M32 13L32 24M43 11.4L35 25M54 15L38 27', '#8a8466', 0.7),
    ...moved(soldier(g, true), 11.5, 14, 0.64),
  ];
}
function infantry(g: Group): Shape[] {
  return [...moved(soldier(g), -9, 3, 0.82), ...moved(soldier(g), 4, 0, 1)];
}

const BUILDERS: Record<UnitType, (g: Group) => Shape[]> = {
  infantry, armoured: tank, mechanised: halftrack, motorised: (g) => truck(g, 'troops'), paratroop, artillery: (g) => fieldGun(g, true),
  antitank, recon, engineer, logistics: (g) => truck(g, 'cargo'), hq, air_fighter: fighter, air_bomber: bomber, naval: (g) => ship(g, false), carrier: (g) => ship(g, true),
};

/** Shape list for a unit illustration (the single registry used by canvas rendering and SVG export). */
export function unitIllustrationShapes(type: UnitType, nation: NationId): Shape[] {
  return BUILDERS[type](groupOf(nation));
}

/** Standalone SVG markup (viewBox 0 0 64 40) for UI reuse. Pure string, no external references. */
export function unitIllustrationSvg(type: UnitType, nation: NationId): string {
  const body = unitIllustrationShapes(type, nation).map((s) => {
    const t = s.tr ? ` transform="translate(${s.tr[0]} ${s.tr[1]}) scale(${s.tr[2]})"` : '';
    return `<path d="${s.d}" fill="${s.fill ?? 'none'}"${s.stroke && s.stroke !== 'none' ? ` stroke="${s.stroke}" stroke-width="${s.sw ?? 1}" stroke-linejoin="round" stroke-linecap="round"` : ''}${t}/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ILLUSTRATION_W} ${ILLUSTRATION_H}" width="${ILLUSTRATION_W}" height="${ILLUSTRATION_H}">${body}</svg>`;
}

/** Banner colours + short code for the nation plate under an illustrated icon. */
export const NATION_BANNER: Partial<Record<NationId, string>> = {
  GER: '#4d5258', FRA: '#2f55a4', GBR: '#8a2432', USA: '#3f6f3f', ITA: '#4f7a3f', BEL: '#b8981c', NED: '#d9792a', POL: '#b0415f', CAN: '#a83232', AUS: '#2b4d86', NZL: '#1f4d5a', IND: '#a06a1e', RSA: '#4f7a3a', ROU: '#b59c2a', HUN: '#5f8a3f', SOV: '#8f2b2b', JPN: '#8a8a96',
};
