// Port of Collision.kt
import { P2, BodyType, coerceIn } from './model.js';

// Simple 2D shapes per part: circle (gears) or convex polygons (everything else).
// pts = flat [x0, y0, x1, y1, ...] array
export class Shape {
  constructor(circle, cx, cy, r, pts) {
    this.circle = circle;
    this.cx = cx;
    this.cy = cy;
    this.r = r;
    this.pts = pts;
  }
}

// n = unit direction from a toward b, depth = how far they overlap (mm),
// (px, py) = roughly where they touch.
export class Contact {
  constructor(a, b, nx, ny, depth, px, py) {
    this.a = a; this.b = b;
    this.nx = nx; this.ny = ny;
    this.depth = depth;
    this.px = px; this.py = py;
  }
}

const EPS = 0.02;   // mm of overlap allowed (touching is fine)
const MAX = Number.MAX_VALUE;

function box(b, x0, y0, x1, y1) {
  const p = new Array(8);
  const c = [new P2(x0, y0), new P2(x1, y0), new P2(x1, y1), new P2(x0, y1)];
  for (let i = 0; i < 4; i++) {
    const w = b.toWorld(c[i].x, c[i].y);
    p[i * 2] = w.x; p[i * 2 + 1] = w.y;
  }
  return new Shape(false, 0.0, 0.0, 0.0, p);
}

function hit(a, b) {
  if (a.circle && b.circle) return Math.hypot(a.cx - b.cx, a.cy - b.cy) < a.r + b.r - EPS;
  if (a.circle) return circlePoly(a, b);
  if (b.circle) return circlePoly(b, a);
  return polyPoly(a, b);
}

function axesOf(p, out) {
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = p[j * 2] - p[i * 2]; const ey = p[j * 2 + 1] - p[i * 2 + 1];
    const l = Math.hypot(ex, ey);
    if (l > 1e-9) out.push([-ey / l, ex / l]);
  }
}

function projPoly(p, ax) {
  let lo = MAX; let hi = -MAX;
  for (let i = 0; i < p.length / 2; i++) {
    const v = p[i * 2] * ax[0] + p[i * 2 + 1] * ax[1];
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  return [lo, hi];
}

function separated(a, b) { return a[1] - b[0] <= EPS || b[1] - a[0] <= EPS; }

function polyPoly(a, b) {
  const axes = [];
  axesOf(a.pts, axes); axesOf(b.pts, axes);
  for (const ax of axes) if (separated(projPoly(a.pts, ax), projPoly(b.pts, ax))) return false;
  return true;
}

function circlePoly(c, p) {
  const axes = [];
  axesOf(p.pts, axes);
  // axis toward nearest vertex
  let best = MAX; let vx = 0.0; let vy = 0.0;
  for (let i = 0; i < p.pts.length / 2; i++) {
    const dx = p.pts[i * 2] - c.cx; const dy = p.pts[i * 2 + 1] - c.cy;
    const d = dx * dx + dy * dy;
    if (d < best) { best = d; vx = dx; vy = dy; }
  }
  const l = Math.sqrt(best);
  if (l > 1e-9) axes.push([vx / l, vy / l]);
  for (const ax of axes) {
    const cp = c.cx * ax[0] + c.cy * ax[1];
    if (separated([cp - c.r, cp + c.r], projPoly(p.pts, ax))) return false;
  }
  return true;
}

function key(a, b) { return Math.min(a, b) * 1000000 + Math.max(a, b); }

// pairs that can never block each other: joined directly, or both locked
function exempt(s) {
  const e = new Set();
  for (const j of s.joints) if (j.b >= 0) e.add(key(j.a, j.b));
  return e;
}

// a loose part (no joints, not locked) is still being placed: it never blocks
function active(s) {
  const a = new Set();
  for (const b of s.bodies) if (b.fixed) a.add(b.id);
  for (const j of s.joints) { a.add(j.a); if (j.b >= 0) a.add(j.b); }
  return a;
}

function center(x) {
  if (x.circle) return [x.cx, x.cy];
  let cx = 0.0; let cy = 0.0; const n = x.pts.length / 2;
  for (let i = 0; i < n; i++) { cx += x.pts[i * 2]; cy += x.pts[i * 2 + 1]; }
  return [cx / n, cy / n];
}

// the point(s) of a shape furthest along a direction (averaged for flat faces)
function support(x, dx, dy) {
  if (x.circle) return [x.cx + dx * x.r, x.cy + dy * x.r];
  const n = x.pts.length / 2;
  let mx = -MAX;
  for (let i = 0; i < n; i++) mx = Math.max(mx, x.pts[i * 2] * dx + x.pts[i * 2 + 1] * dy);
  let sx = 0.0; let sy = 0.0; let c = 0;
  for (let i = 0; i < n; i++) {
    const v = x.pts[i * 2] * dx + x.pts[i * 2 + 1] * dy;
    if (v > mx - 0.05) { sx += x.pts[i * 2]; sy += x.pts[i * 2 + 1]; c++; }
  }
  return [sx / c, sy / c];
}

function range(x, ax, ay) {
  if (x.circle) { const c = x.cx * ax + x.cy * ay; return [c - x.r, c + x.r]; }
  return projPoly(x.pts, [ax, ay]);
}

// smallest push that separates x and y: [nx, ny, depth], n points from x to y; null if apart
function mtv(x, y) {
  const axes = [];
  if (!x.circle) axesOf(x.pts, axes);
  if (!y.circle) axesOf(y.pts, axes);
  const cx = center(x); const cy = center(y);
  if (x.circle || y.circle) {
    const c = x.circle ? x : y;
    const o = x.circle ? y : x;
    if (o.circle) {
      const dx = o.cx - c.cx; const dy = o.cy - c.cy; const d = Math.hypot(dx, dy);
      if (d > 1e-9) axes.push([dx / d, dy / d]); else axes.push([1.0, 0.0]);
    } else {
      let best = MAX; let vx = 0.0; let vy = 0.0;
      for (let i = 0; i < o.pts.length / 2; i++) {
        const dx = o.pts[i * 2] - c.cx; const dy = o.pts[i * 2 + 1] - c.cy;
        const d = dx * dx + dy * dy;
        if (d < best) { best = d; vx = dx; vy = dy; }
      }
      const l = Math.sqrt(best);
      if (l > 1e-9) axes.push([vx / l, vy / l]);
    }
  }
  let bestDepth = MAX; let bx = 0.0; let by = 0.0;
  for (const ax of axes) {
    const ra = range(x, ax[0], ax[1]); const rb = range(y, ax[0], ax[1]);
    const o = Math.min(ra[1], rb[1]) - Math.max(ra[0], rb[0]);
    if (o <= EPS) return null;
    if (o < bestDepth) { bestDepth = o; bx = ax[0]; by = ax[1]; }
  }
  if ((cy[0] - cx[0]) * bx + (cy[1] - cx[1]) * by < 0) { bx = -bx; by = -by; }
  return [bx, by, bestDepth];
}

// ---------- closest distance (for the Gap measurement) ----------

function segClosest(px, py, ax, ay, bx, by) {
  const vx = bx - ax; const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 < 1e-12 ? 0.0 : coerceIn(((px - ax) * vx + (py - ay) * vy) / l2, 0.0, 1.0);
  return [ax + t * vx, ay + t * vy];
}

function insidePoly(px, py, p) {
  let inside = false;
  const n = p.length / 2;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const xi = p[i * 2]; const yi = p[i * 2 + 1]; const xj = p[j * 2]; const yj = p[j * 2 + 1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    j = i;
  }
  return inside;
}

// closest point of a shape to (px, py), and whether (px, py) is inside it
function closestOn(x, px, py) {
  if (x.circle) {
    const dx = px - x.cx; const dy = py - x.cy; const d = Math.hypot(dx, dy);
    if (d <= x.r) return [px, py, 1.0];
    return [x.cx + dx / d * x.r, x.cy + dy / d * x.r, 0.0];
  }
  if (insidePoly(px, py, x.pts)) return [px, py, 1.0];
  let best = MAX; let bx = px; let by = py;
  const n = x.pts.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const q = segClosest(px, py, x.pts[i * 2], x.pts[i * 2 + 1], x.pts[j * 2], x.pts[j * 2 + 1]);
    const d = Math.hypot(q[0] - px, q[1] - py);
    if (d < best) { best = d; bx = q[0]; by = q[1]; }
  }
  return [bx, by, 0.0];
}

// points that may be closest: polygon corners, or the point of a circle facing the other shape
function probePts(x, toward) {
  if (!x.circle) {
    const out = [];
    for (let i = 0; i < x.pts.length / 2; i++) out.push([x.pts[i * 2], x.pts[i * 2 + 1]]);
    return out;
  }
  const q = closestOn(toward, x.cx, x.cy);
  const dx = q[0] - x.cx; const dy = q[1] - x.cy; const d = Math.hypot(dx, dy);
  return d < 1e-9 ? [[x.cx, x.cy]] : [[x.cx + dx / d * x.r, x.cy + dy / d * x.r]];
}

export const Collision = {
  shapesOf(b) {
    switch (b.type) {
      case BodyType.RECT: case BodyType.SOLENOID:
        return [box(b, -b.w / 2, -b.h / 2, b.w / 2, b.h / 2)];
      case BodyType.GEAR:
        return [new Shape(true, b.x, b.y, b.outerR(), [])];
      case BodyType.PULLEY: case BodyType.DISC:
        return [new Shape(true, b.x, b.y, b.w / 2, [])];
      case BodyType.RAIL: {
        const bh = b.railBlockH() / 2;
        return [
          box(b, -b.w / 2, -b.h / 2, b.w / 2, b.h / 2),
          box(b, -b.w / 2 - 15, -bh, -b.w / 2, bh),
          box(b, b.w / 2, -bh, b.w / 2 + 15, bh),
        ];
      }
      case BodyType.RACK:
        return [box(b, -b.w / 2, -b.h / 2, b.w / 2, b.h / 2 + b.module)];
      // only the two walls are solid; the hollow inside is free space
      case BodyType.TUBE: {
        const t = coerceIn(b.wall, 0.1, b.h / 2);
        return [
          box(b, -b.w / 2, b.h / 2 - t, b.w / 2, b.h / 2),
          box(b, -b.w / 2, -b.h / 2, b.w / 2, -b.h / 2 + t),
        ];
      }
    }
    return [];
  },

  overlap(a, b) {
    for (const x of a) for (const y of b) if (hit(x, y)) return true;
    return false;
  },

  key,

  // all part pairs overlapping right now (these are ignored while dragging)
  overlappingPairs(s) {
    const out = new Set();
    const ex = exempt(s);
    const act = active(s);
    const sh = s.bodies.map((it) => Collision.shapesOf(it));
    for (let i = 0; i < s.bodies.length; i++) for (let k = i + 1; k < s.bodies.length; k++) {
      const a = s.bodies[i]; const b = s.bodies[k];
      if (a.fixed && b.fixed) continue;
      if (!act.has(a.id) || !act.has(b.id)) continue;
      const kk = key(a.id, b.id);
      if (ex.has(kk)) continue;
      if (Collision.overlap(sh[i], sh[k])) out.add(kk);
    }
    return out;
  },

  hasNew(s, ignore) {
    const ex = exempt(s);
    const act = active(s);
    const sh = s.bodies.map((it) => Collision.shapesOf(it));
    for (let i = 0; i < s.bodies.length; i++) for (let k = i + 1; k < s.bodies.length; k++) {
      const a = s.bodies[i]; const b = s.bodies[k];
      if (a.fixed && b.fixed) continue;
      if (!act.has(a.id) || !act.has(b.id)) continue;
      const kk = key(a.id, b.id);
      if (ex.has(kk) || ignore.has(kk)) continue;
      if (Collision.overlap(sh[i], sh[k])) return true;
    }
    return false;
  },

  // ---------- contacts (for pushing) ----------

  Contact,
  Shape,

  newContacts(s, ignore) {
    const out = [];
    const ex = exempt(s);
    const act = active(s);
    const sh = s.bodies.map((it) => Collision.shapesOf(it));
    for (let i = 0; i < s.bodies.length; i++) for (let k = i + 1; k < s.bodies.length; k++) {
      const a = s.bodies[i]; const b = s.bodies[k];
      if (a.fixed && b.fixed) continue;
      if (!act.has(a.id) || !act.has(b.id)) continue;
      const kk = key(a.id, b.id);
      if (ex.has(kk) || ignore.has(kk)) continue;
      let best = null;
      for (const x of sh[i]) for (const y of sh[k]) {
        const m = mtv(x, y); if (m == null) continue;
        if (best == null || m[2] > best.depth) {
          const sa = support(x, m[0], m[1]); const sb = support(y, -m[0], -m[1]);
          best = new Contact(a, b, m[0], m[1], m[2], (sa[0] + sb[0]) / 2, (sa[1] + sb[1]) / 2);
        }
      }
      if (best != null) out.push(best);
    }
    return out;
  },

  // [ax, ay, bx, by, distance]: closest points between two parts (0 if they overlap)
  closest(a, b) {
    let best = [a.x, a.y, b.x, b.y, MAX];
    for (const x of Collision.shapesOf(a)) for (const y of Collision.shapesOf(b)) {
      if (hit(x, y)) {
        const c = center(x); return [c[0], c[1], c[0], c[1], 0.0];
      }
      for (const p of probePts(x, y)) {
        const q = closestOn(y, p[0], p[1]); const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < best[4]) best = [p[0], p[1], q[0], q[1], d];
      }
      for (const p of probePts(y, x)) {
        const q = closestOn(x, p[0], p[1]); const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < best[4]) best = [q[0], q[1], p[0], p[1], d];
      }
    }
    return best;
  },
};
