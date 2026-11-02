// Fillet / round for a piece (a part, or welded parts as one piece), on its outline polygon.
//   inside corners  (fillet) = "closing": grow by r, then shrink by r  -> concave corners get radius r
//   outside corners (round)  = "opening": shrink by r, then grow by r  -> convex corners get radius r
// Polygons are polygon-clipping MultiPolygons: [ [ outerRing, holeRing… ], … ], rings = [[x, y], …].
import polygonClipping from './vendor/polygon-clipping.esm.js';

const SEG = 14;   // corners of each little circle (enough for a smooth look and a clean CNC path)
let Q = 1e-3;     // points are snapped to this grid (mm): the polygon library trips on near-identical points

// snap to the grid, drop repeated / too-close points and collapsed rings (takes a Polygon or a MultiPolygon)
function clean(mp) {
  if (mp.length && typeof mp[0][0][0] === 'number') mp = [mp];   // a single Polygon: [ring, …]
  const out = [];
  for (const poly of mp) {
    const rings = [];
    for (const ring of poly) {
      const r = [];
      for (const [x, y] of ring) {
        const q = [Math.round(x / Q) * Q, Math.round(y / Q) * Q], last = r[r.length - 1];
        if (!last || Math.abs(last[0] - q[0]) > Q / 2 || Math.abs(last[1] - q[1]) > Q / 2) r.push(q);
      }
      if (r.length > 1 && Math.abs(r[0][0] - r[r.length - 1][0]) < Q / 2 && Math.abs(r[0][1] - r[r.length - 1][1]) < Q / 2) r.pop();
      if (r.length >= 3) { r.push(r[0]); rings.push(r); }
    }
    if (rings.length) out.push(rings);
  }
  return out;
}
const U = (...g) => clean(polygonClipping.union(...g.map(clean)));
const D = (a, ...b) => clean(polygonClipping.difference(clean(a), ...b.map(clean)));

// corners per circle so the arc is within 0.05 mm of a true circle (smooth on screen and for the CNC)
const segFor = (r) => Math.max(SEG, Math.min(72, Math.ceil(Math.PI / Math.acos(Math.max(-1, 1 - 0.05 / r)))));
function circle(x, y, r) {
  const ring = [], n = segFor(r);
  for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n; ring.push([x + r * Math.cos(t), y + r * Math.sin(t)]); }
  ring.push(ring[0]);
  return [ring];
}

// grow the shape by r (Minkowski sum with a disc): the shape + a band along every edge + a disc at every corner
function grow(mp, r) {
  const add = [];
  for (const poly of mp) for (const ring of poly) {
    for (let i = 0; i + 1 < ring.length; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
      const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy);
      if (l < 1e-9) continue;
      const nx = -dy / l * r, ny = dx / l * r;
      add.push([[[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny], [x1 + nx, y1 + ny]]]);
      // a disc at the corner, unless the outline barely turns there (curves): the bands already cover it
      const [x0, y0] = ring[(i - 1 + ring.length - 1) % (ring.length - 1)], ex = x1 - x0, ey = y1 - y0, el = Math.hypot(ex, ey);
      const turn = el < 1e-9 ? Math.PI : Math.abs(Math.atan2(ex * dy - ey * dx, ex * dx + ey * dy));
      if (turn > Math.sqrt(0.4 / r)) add.push(circle(x1, y1, r));
    }
  }
  // union in batches keeps polygon-clipping fast and stable
  let out = mp;
  for (let i = 0; i < add.length; i += 40) out = U(out, ...add.slice(i, i + 40));
  return out;
}

function bbox(mp, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of mp) for (const ring of poly) for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [[[[x0 - pad, y0 - pad], [x1 + pad, y0 - pad], [x1 + pad, y1 + pad], [x0 - pad, y1 + pad], [x0 - pad, y0 - pad]]]];
}

// shrink by r = grow the outside by r and take it away
function shrink(mp, r) {
  if (!mp.length) return mp;
  const box = bbox(mp, 2 * r + 5);
  const outside = D(box, mp);
  return D(box, grow(outside, r));
}

export function roundShape(mp, rIn, rOut) {
  // try a fine grid first, then coarser ones; if all fail, keep the sharp shape (never break the app)
  for (const q of [1e-3, 1e-2, 0.05]) {
    Q = q;
    try {
      let s = clean(mp);
      if (rIn > 0.05) s = shrink(grow(s, rIn), rIn);
      // outside corners: a radius bigger than the part is thick would erase it, so use the biggest that fits
      for (let r = rOut, k = 0; r > 0.05 && k < 12; r *= 0.8, k++) {
        const sh = shrink(s, r);
        if (sh.length) { s = grow(sh, r); break; }
      }
      return s;
    } catch { /* try the next grid */ }
  }
  return mp;
}

// round single corners (classic CAD fillet): corners = [{ x, y, r }] in the shape's frame. The outline point at each
// corner is replaced by an arc of radius r that touches both edges: it cuts an outside corner off and fills an inside
// corner. Works on the plain outline, before any whole-piece rounding.
export function roundCorners(mp, corners) {
  if (!corners.length) return mp;
  const out = [];
  for (const poly of mp) {
    const rings = [];
    for (const ring of poly) {
      const pts = ring.slice(0, -1), n = pts.length, res = [];
      for (let i = 0; i < n; i++) {
        const [vx, vy] = pts[i], c = corners.find((k) => Math.hypot(k.x - vx, k.y - vy) < 0.6);
        if (!c || !(c.r > 0.05)) { res.push([vx, vy]); continue; }
        const [px, py] = pts[(i - 1 + n) % n], [nx, ny] = pts[(i + 1) % n];
        let l1 = Math.hypot(px - vx, py - vy), l2 = Math.hypot(nx - vx, ny - vy);
        const u1 = [(px - vx) / l1, (py - vy) / l1], u2 = [(nx - vx) / l2, (ny - vy) / l2];
        const alpha = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1])));   // angle between the two edges
        if (alpha < 0.02 || alpha > Math.PI - 0.02) { res.push([vx, vy]); continue; }          // straight or folded: nothing to round
        let r = c.r, t = r / Math.tan(alpha / 2);
        const tMax = 0.49 * Math.min(l1, l2);                                                  // the arc may use at most half of each edge
        if (t > tMax) { t = tMax; r = t * Math.tan(alpha / 2); }
        let bx = u1[0] + u2[0], by = u1[1] + u2[1]; const bl = Math.hypot(bx, by); bx /= bl; by /= bl;
        const d = r / Math.sin(alpha / 2), cx = vx + bx * d, cy = vy + by * d;               // arc centre on the bisector
        const a1 = Math.atan2(vy + u1[1] * t - cy, vx + u1[0] * t - cx), a2 = Math.atan2(vy + u2[1] * t - cy, vx + u2[0] * t - cx);
        let sweep = a2 - a1; while (sweep > Math.PI) sweep -= 2 * Math.PI; while (sweep < -Math.PI) sweep += 2 * Math.PI;
        const steps = Math.max(4, Math.ceil(segFor(r) * Math.abs(sweep) / (2 * Math.PI)));
        for (let k = 0; k <= steps; k++) { const a = a1 + sweep * k / steps; res.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
      }
      res.push(res[0]);
      rings.push(res);
    }
    out.push(rings);
  }
  return out;
}

// remember results: welded parts never move against each other, so the rounded outline stays valid
const cache = new Map();
export function roundedCached(key, make) {
  if (cache.has(key)) return cache.get(key);
  const v = make();
  if (cache.size > 60) cache.delete(cache.keys().next().value);
  cache.set(key, v);
  return v;
}
