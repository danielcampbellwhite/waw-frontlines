// CORINE Land Cover 2018 legend colours (EEA) -> class codes, used to classify the EEA-rendered map image.
export const CLC = {
  111: [230, 0, 77], 112: [255, 0, 0], 121: [204, 77, 242], 122: [204, 0, 0], 123: [230, 204, 204], 124: [230, 204, 230],
  131: [166, 0, 204], 132: [166, 77, 0], 133: [255, 77, 255], 141: [255, 166, 255], 142: [255, 230, 255],
  211: [255, 255, 168], 212: [255, 255, 0], 213: [230, 230, 0], 221: [230, 128, 0], 222: [242, 166, 77], 223: [230, 166, 0],
  231: [230, 230, 77], 241: [255, 230, 166], 242: [255, 230, 77], 243: [230, 204, 77], 244: [242, 204, 166],
  311: [128, 255, 0], 312: [0, 166, 0], 313: [77, 255, 0], 321: [204, 242, 77], 322: [166, 255, 128], 323: [166, 230, 77], 324: [166, 242, 0],
  331: [230, 230, 230], 332: [204, 204, 204], 333: [204, 255, 204], 334: [0, 0, 0], 335: [166, 230, 204],
  411: [166, 166, 255], 412: [77, 77, 255], 421: [204, 204, 255], 422: [230, 230, 255], 423: [166, 166, 230],
  511: [0, 204, 242], 512: [128, 242, 230], 521: [0, 255, 166], 522: [166, 255, 230], 523: [230, 242, 255],
};
export const FOREST = new Set([311, 312, 313]);
export const URBAN = new Set([111, 112]);
/** hedged mixed farmland: complex cultivation patterns, agriculture with significant natural vegetation, agro-forestry (bocage hint) */
export const BOCAGE = new Set([242, 243, 244]);
export const MARSH = new Set([411, 412, 421]);
const exact = new Map(Object.entries(CLC).map(([k, v]) => [(v[0] << 16) | (v[1] << 8) | v[2], +k]));
/** class code for an RGB pixel, or 0 when it does not match any legend colour within tolerance */
export function classify(r, g, b) {
  const k = (r << 16) | (g << 8) | b;
  const hit = exact.get(k);
  if (hit) return hit;
  let best = 0, bd = 300; // squared distance tolerance (~17 per channel)
  for (const [code, c] of Object.entries(CLC)) { const d = (c[0] - r) ** 2 + (c[1] - g) ** 2 + (c[2] - b) ** 2; if (d < bd) { bd = d; best = +code; } }
  return best;
}
