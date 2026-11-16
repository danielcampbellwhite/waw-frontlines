// Shared geometry / PNG helpers for the map data pipeline (Node 24, no dependencies).
import zlib from 'node:zlib';

/** Sutherland-Hodgman clip of a ring against an axis-aligned box. */
export function clipRing(ring, b) {
  const edges = [
    [(p) => p[0] >= b.west, (a, c) => { const t = (b.west - a[0]) / (c[0] - a[0]); return [b.west, a[1] + t * (c[1] - a[1])]; }],
    [(p) => p[0] <= b.east, (a, c) => { const t = (b.east - a[0]) / (c[0] - a[0]); return [b.east, a[1] + t * (c[1] - a[1])]; }],
    [(p) => p[1] >= b.south, (a, c) => { const t = (b.south - a[1]) / (c[1] - a[1]); return [a[0] + t * (c[0] - a[0]), b.south]; }],
    [(p) => p[1] <= b.north, (a, c) => { const t = (b.north - a[1]) / (c[1] - a[1]); return [a[0] + t * (c[0] - a[0]), b.north]; }],
  ];
  let out = ring;
  for (const [inside, isect] of edges) {
    const inp = out; out = [];
    if (!inp.length) break;
    let prev = inp[inp.length - 1];
    for (const cur of inp) {
      if (inside(cur)) { if (!inside(prev)) out.push(isect(prev, cur)); out.push(cur); }
      else if (inside(prev)) out.push(isect(prev, cur));
      prev = cur;
    }
  }
  return out;
}

export function bboxOfRing(r) {
  let w = 1e9, e = -1e9, s = 1e9, n = -1e9;
  for (const p of r) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; }
  return { west: w, east: e, south: s, north: n };
}
export const boxesOverlap = (a, b) => a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;

/** Douglas-Peucker (iterative). tol in degrees. */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [a, c] = stack.pop();
    let md = -1, mi = -1;
    const [ax, ay] = pts[a], [cx, cy] = pts[c];
    const dx = cx - ax, dy = cy - ay, l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < c; i++) {
      let t = l2 ? ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx - pts[i][0], py = ay + t * dy - pts[i][1];
      const d = px * px + py * py;
      if (d > md) { md = d; mi = i; }
    }
    if (md > t2) { keep[mi] = 1; stack.push([a, mi], [mi, c]); }
  }
  return pts.filter((_, i) => keep[i]);
}

export const round = (p, n = 4) => [+p[0].toFixed(n), +p[1].toFixed(n)];

/** Split a polyline into pieces lying inside the box (segment-level clip, Liang-Barsky). */
export function clipLine(line, b) {
  const out = []; let cur = [];
  const seg = (p, q) => {
    let t0 = 0, t1 = 1; const dx = q[0] - p[0], dy = q[1] - p[1];
    const chk = (pp, qq) => { if (pp === 0) return qq >= 0; const r = qq / pp; if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
    if (chk(-dx, p[0] - b.west) && chk(dx, b.east - p[0]) && chk(-dy, p[1] - b.south) && chk(dy, b.north - p[1])) return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy], t0 > 0, t1 < 1];
    return null;
  };
  for (let i = 1; i < line.length; i++) {
    const s = seg(line[i - 1], line[i]);
    if (!s) { if (cur.length > 1) out.push(cur); cur = []; continue; }
    if (s[2] && cur.length > 1) { out.push(cur); cur = []; }
    if (!cur.length) cur.push(s[0]);
    cur.push(s[1]);
    if (s[3]) { if (cur.length > 1) out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Even-odd scanline rasteriser of rings onto a fine lon/lat mask. Returns Uint8Array(cols*rows) row 0 = north. */
export function rasterise(rings, bbox, res) {
  const cols = Math.round((bbox.east - bbox.west) / res), rows = Math.round((bbox.north - bbox.south) / res);
  const mask = new Uint8Array(cols * rows);
  const buckets = Array.from({ length: rows }, () => []);
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], c = ring[(i + 1) % ring.length];
      if (a[1] === c[1]) continue;
      const [lo, hi] = a[1] < c[1] ? [a, c] : [c, a];
      const r0 = Math.max(0, Math.ceil((bbox.north - hi[1]) / res - 0.5)), r1 = Math.min(rows - 1, Math.floor((bbox.north - lo[1]) / res - 0.5));
      for (let r = r0; r <= r1; r++) {
        const y = bbox.north - (r + 0.5) * res;
        if (y < lo[1] || y >= hi[1]) continue;
        buckets[r].push(lo[0] + ((y - lo[1]) / (hi[1] - lo[1])) * (hi[0] - lo[0]));
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    const xs = buckets[r].sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - bbox.west) / res - 0.5)), c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - bbox.west) / res - 0.5));
      for (let c = c0; c <= c1; c++) mask[r * cols + c] = 1;
    }
  }
  return { mask, cols, rows };
}

/** Decode an 8-bit non-interlaced RGB/RGBA PNG. */
export function decodePng(buf) {
  let pos = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(pos + 8); h = buf.readUInt32BE(pos + 12); if (buf[pos + 16] !== 8 || buf[pos + 20] !== 0) throw new Error('unsupported png'); ct = buf[pos + 17]; }
    else if (type === 'IDAT') idat.push(buf.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  const bpp = ct === 2 ? 3 : ct === 6 ? 4 : 0;
  if (!bpp) throw new Error('unsupported colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[dst - stride + x] : 0, c = x >= bpp && y ? out[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  return { w, h, bpp, data: out };
}
