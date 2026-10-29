// Port of Model.kt
// All units: mm and radians. World Y points up. Angles CCW positive.

const PI = Math.PI;

// ---------- small Kotlin helpers ----------

// Kotlin coerceIn: throws when the range is empty
export function coerceIn(v, lo, hi) {
  if (lo > hi) throw new Error(`Cannot coerce value to an empty range: maximum ${hi} is less than minimum ${lo}.`);
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// Kotlin Pair: a 2-element array (destructurable) that also has .first / .second
export function pair(a, b) {
  const r = [a, b];
  r.first = a;
  r.second = b;
  return r;
}

// MutableList.removeAll { pred } — in place, keeps the array identity
function removeIf(arr, pred) {
  let w = 0;
  let removed = false;
  for (let r = 0; r < arr.length; r++) {
    const v = arr[r];
    if (pred(v)) { removed = true; continue; }
    arr[w++] = v;
  }
  arr.length = w;
  return removed;
}

function removeItem(arr, item) {
  const i = arr.indexOf(item);
  if (i >= 0) { arr.splice(i, 1); return true; }
  return false;
}

// ---------- P2 ----------

export class P2 {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
  equals(o) { return o instanceof P2 && o.x === this.x && o.y === this.y; }
  copy(x = this.x, y = this.y) { return new P2(x, y); }
  component1() { return this.x; }
  component2() { return this.y; }
  toString() { return `P2(x=${this.x}, y=${this.y})`; }
}

export function frac(v) { return v - Math.floor(v); }

export function wrapPi(v) {
  let r = v % (2 * PI);
  if (r > PI) r -= 2 * PI;
  if (r <= -PI) r += 2 * PI;
  return r;
}

// ---------- enums ----------

function makeEnum(enumName, defs) {
  const vals = [];
  const E = {};
  defs.forEach(([name, extra], ordinal) => {
    const v = Object.freeze({ name, ordinal, ...extra, toString() { return name; } });
    E[name] = v;
    vals.push(v);
  });
  Object.freeze(vals);
  E.values = () => vals.slice();
  E.valueOf = (n) => {
    const v = vals.find((x) => x.name === n);
    if (!v) throw new Error(`IllegalArgumentException: No enum constant ${enumName}.${n}`);
    return v;
  };
  return Object.freeze(E);
}

export const BodyType = makeEnum('BodyType', [
  ['RECT', { label: 'Rect' }], ['GEAR', { label: 'Gear' }], ['RAIL', { label: 'Rail' }], ['RACK', { label: 'Rack' }],
  ['TUBE', { label: 'Tube' }], ['PULLEY', { label: 'Pulley' }], ['SOLENOID', { label: 'Solenoid' }], ['DISC', { label: 'Disc' }],
]);

export const JointKind = makeEnum('JointKind', [
  ['PIN', {}], ['SLIDE', {}], ['GEAR', {}], ['RACK', {}], ['SLOT', {}], ['WELD', {}], ['BELT', {}],
]);

// ---------- Body ----------

export class Body {
  constructor(id, type) {
    this.id = id;
    this.type = type;
    this.x = 0.0;
    this.y = 0.0;
    this.a = 0.0;          // not wrapped on purpose (gear math needs continuous angle)
    this.w = 100.0;        // RECT/RAIL/RACK length
    this.h = 20.0;         // RECT width, RAIL diameter, RACK height
    this.teeth = 20;       // GEAR
    this.module = 2.0;     // GEAR, RACK
    this.fixed = false;
    this.wall = 2.0;       // TUBE wall thickness
    this.noGravity = false;   // true = this part ignores gravity (floats)
    this.strong = false;      // true = holds its position like an actuator: can't be pushed back
    this.stroke = 10.0;       // SOLENOID: how far the plunger travels (mm)
    this.pushType = false;    // SOLENOID: false = pull (plunger pulls in when ON), true = push (pushes out)
    this.plain = false;       // DISC: true = plain solid disc (no spokes)
  }

  get name() { return `${this.type === BodyType.DISC && this.plain ? 'Circle' : this.type.label} ${this.id}`; }

  pitchR() { return this.module * this.teeth / 2.0; }
  // radius the belt/chain wraps on: gear = pitch circle, pulley = its diameter / 2
  wheelR() { return (this.type === BodyType.PULLEY || this.type === BodyType.DISC) ? this.w / 2 : this.pitchR(); }
  isWheel() { return this.type === BodyType.GEAR || this.type === BodyType.PULLEY || this.type === BodyType.DISC; }
  outerR() { return this.pitchR() + this.module; }
  railBlockH() { return Math.max(this.h * 3.0, 20.0); }

  toWorld(lx, ly) {
    const c = Math.cos(this.a); const s = Math.sin(this.a);
    return new P2(this.x + lx * c - ly * s, this.y + lx * s + ly * c);
  }

  toLocal(wx, wy) {
    const c = Math.cos(this.a); const s = Math.sin(this.a);
    const dx = wx - this.x; const dy = wy - this.y;
    return new P2(dx * c + dy * s, -dx * s + dy * c);
  }

  contains(wx, wy, tol) {
    const l = this.toLocal(wx, wy);
    const w = this.w; const h = this.h;
    switch (this.type) {
      case BodyType.RECT: case BodyType.TUBE: case BodyType.SOLENOID:
        return Math.abs(l.x) <= w / 2 + tol && Math.abs(l.y) <= h / 2 + tol;
      case BodyType.GEAR:
        return Math.hypot(l.x, l.y) <= this.outerR() + tol;
      case BodyType.PULLEY: case BodyType.DISC:
        return Math.hypot(l.x, l.y) <= w / 2 + tol;
      case BodyType.RAIL: {
        const rod = Math.abs(l.x) <= w / 2 + tol && Math.abs(l.y) <= h / 2 + tol;
        const blocks = Math.abs(l.x) >= w / 2 - tol && Math.abs(l.x) <= w / 2 + 15 + tol &&
          Math.abs(l.y) <= this.railBlockH() / 2 + tol;
        return rod || blocks;
      }
      case BodyType.RACK:
        return Math.abs(l.x) <= w / 2 + tol && l.y >= -h / 2 - tol && l.y <= h / 2 + this.module + tol;
    }
    return false;
  }

  // local points that pins / tracers snap to
  snapPoints() {
    const w = this.w; const h = this.h;
    switch (this.type) {
      // end holes sit along the LONG side, half the short side in from each end
      case BodyType.RECT: case BodyType.TUBE: case BodyType.SOLENOID:
        if (w / 2 - h / 2 > 0.5) return [new P2(0.0, 0.0), new P2(-(w / 2 - h / 2), 0.0), new P2(w / 2 - h / 2, 0.0)];
        if (h / 2 - w / 2 > 0.5) return [new P2(0.0, 0.0), new P2(0.0, -(h / 2 - w / 2)), new P2(0.0, h / 2 - w / 2)];
        return [new P2(0.0, 0.0)];
      case BodyType.GEAR: case BodyType.PULLEY:
        return [new P2(0.0, 0.0)];
      // flywheel: center + 4 crank-pin spots on the rim's inner edge (70% of the radius)
      case BodyType.DISC: {
        const out = [new P2(0.0, 0.0)];
        for (let k = 0; k < 4; k++) out.push(new P2(0.35 * w * Math.cos(k * PI / 2), 0.35 * w * Math.sin(k * PI / 2)));
        return out;
      }
      case BodyType.RAIL:
        return [new P2(0.0, 0.0), new P2(-w / 2, 0.0), new P2(w / 2, 0.0)];
      case BodyType.RACK:
        return [new P2(0.0, 0.0)];
    }
    return [];
  }

  // half size across local X (used to rest a part on top of another)
  sideHalf() {
    switch (this.type) {
      case BodyType.RECT: case BodyType.TUBE: case BodyType.SOLENOID: return this.h / 2;
      case BodyType.GEAR: return this.outerR();
      case BodyType.PULLEY: case BodyType.DISC: return this.w / 2;
      case BodyType.RAIL: return this.h / 2;
      case BodyType.RACK: return this.h / 2;
    }
    return 0;
  }

  // half length along local X (used for slide travel limits)
  halfLen() {
    switch (this.type) {
      case BodyType.RECT: case BodyType.RACK: case BodyType.TUBE: case BodyType.SOLENOID: return this.w / 2;
      case BodyType.GEAR: return this.outerR();
      case BodyType.PULLEY: case BodyType.DISC: return this.w / 2;
      case BodyType.RAIL: return this.w / 2 + 15;
    }
    return 0;
  }

  boundR() {
    const w = this.w; const h = this.h;
    switch (this.type) {
      case BodyType.RECT: case BodyType.TUBE: case BodyType.SOLENOID: return Math.hypot(w / 2, h / 2);
      case BodyType.GEAR: return this.outerR();
      case BodyType.PULLEY: case BodyType.DISC: return w / 2;
      case BodyType.RAIL: return Math.hypot(w / 2 + 15, this.railBlockH() / 2);
      case BodyType.RACK: return Math.hypot(w / 2, h / 2 + this.module);
    }
    return 0;
  }
}

// ---------- measurements ----------
// An anchor is a point stuck to a part (moves with it), or a fixed point on the ground (body = -1).
export class Anchor {
  constructor(body, lx, ly) {
    this.body = body;
    this.lx = lx;
    this.ly = ly;
  }
}

export const MK = Object.freeze({
  DIST: 1,        // 2 points: Pythagoras a, b, c
  ANGLE: 2,       // 3 points: angle at the middle one
  TRAVEL: 3,      // 1 point on a part: how far it moves (path, straight, arc)
  CROSS: 4,       // where 2 distance lines cross (refA, refB = their numbers)
  TRACECROSS: 5,  // where the trace path crosses a distance line (refA)
  GAP: 6,         // smallest gap between 2 parts (refA, refB = body ids)
});

export class Measure {
  constructor(kind, num, pts, refA = -1, refB = -1) {
    this.kind = kind;
    this.num = num;
    this.pts = pts;
    this.refA = refA;
    this.refB = refB;
    // live values (not saved)
    this.start = null;
    this.last = null;
    this.path = 0.0;
    this.startA = 0.0;
    this.minGap = Number.MAX_VALUE;
    this.pathPts = [];
  }
  get name() {
    let p;
    switch (this.kind) {
      case MK.DIST: p = 'D'; break;
      case MK.ANGLE: p = 'A'; break;
      case MK.TRAVEL: p = 'T'; break;
      case MK.CROSS: p = 'X'; break;
      case MK.TRACECROSS: p = 'C'; break;
      default: p = 'G';
    }
    return p + this.num;
  }
  reset() { this.start = null; this.last = null; this.path = 0.0; this.minGap = Number.MAX_VALUE; this.pathPts.length = 0; }
}

// b = -1 means "ground" (only for PIN; then bx/by is a world point)
export class Joint {
  constructor(kind, a, b) {
    this.kind = kind;
    this.a = a;
    this.b = b;
    this.ax = 0.0; this.ay = 0.0;
    this.bx = 0.0; this.by = 0.0;
    this.c = 0.0;
    this.lo = 0.0; this.hi = 0.0;
    this.phi = 0.0;
    // SLIDE only: spring (0 = none, 1 = on) and the spot on the track it pulls/pushes toward
    this.spring = 0;
    this.rest = 0.0;
    // SLIDE of a solenoid plunger: 0 = not a solenoid, 1 = OFF, 2 = ON (energized)
    this.sol = 0;
  }
}

// Where the belt runs. spans = 4 points: (span1 start, span1 end, span2 start, span2 end).
// arcs = for each wheel: start angle and sweep (radians, CCW). length in mm.
export class BeltGeom {
  constructor(spans, arc1, arc2, length) {
    this.spans = spans;
    this.arc1 = arc1;
    this.arc2 = arc2;
    this.length = length;
  }
}

// ---------- org.json-like readers (Android org.json semantics) ----------

function jHas(o, k) { return o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }

function jToDouble(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '' || !/^[+-]?(NaN|Infinity|(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?)[dDfF]?$/.test(t)) return null;
    return Number(t.replace(/[dDfF]$/, ''));
  }
  return null;
}

function jToInt(v) {
  const d = jToDouble(v);
  if (d === null) return null;
  if (Number.isNaN(d)) return 0;
  if (Number.isInteger(d) && Math.abs(d) < 2 ** 63) return d | 0;   // Integer/Long.intValue()
  if (d >= 2147483647) return 2147483647;                            // (int) of a double saturates
  if (d <= -2147483648) return -2147483648;
  return Math.trunc(d);
}

function jToBool(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    const l = v.toLowerCase();
    if (l === 'true') return true;
    if (l === 'false') return false;
  }
  return null;
}

function jMissing(k) { return new Error(`JSONException: No value for ${k}`); }
function jType(k, t) { return new Error(`JSONException: Value at ${k} is not a ${t}`); }

function getDouble(o, k) {
  if (!jHas(o, k)) throw jMissing(k);
  const r = jToDouble(o[k]); if (r === null) throw jType(k, 'double'); return r;
}
function getInt(o, k) {
  if (!jHas(o, k)) throw jMissing(k);
  const r = jToInt(o[k]); if (r === null) throw jType(k, 'int'); return r;
}
function getBoolean(o, k) {
  if (!jHas(o, k)) throw jMissing(k);
  const r = jToBool(o[k]); if (r === null) throw jType(k, 'boolean'); return r;
}
function getString(o, k) {
  if (!jHas(o, k)) throw jMissing(k);
  const v = o[k];
  return v === null ? 'null' : String(v);
}
function getArray(o, k) {
  if (!jHas(o, k)) throw jMissing(k);
  if (!Array.isArray(o[k])) throw jType(k, 'JSONArray'); return o[k];
}
function getObject(o, k) {
  if (!jHas(o, k)) throw jMissing(k);
  const v = o[k];
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw jType(k, 'JSONObject'); return v;
}
function optArray(o, k) { return jHas(o, k) && Array.isArray(o[k]) ? o[k] : null; }
function optInt(o, k, d) { if (!jHas(o, k)) return d; const r = jToInt(o[k]); return r === null ? d : r; }
function optDouble(o, k, d) { if (!jHas(o, k)) return d; const r = jToDouble(o[k]); return r === null ? d : r; }
function optBoolean(o, k, d) { if (!jHas(o, k)) return d; const r = jToBool(o[k]); return r === null ? d : r; }

// org.json refuses NaN / Infinity
function num(v) {
  if (!Number.isFinite(v)) throw new Error('JSONException: Forbidden numeric value: ' + v);
  return v;
}

// ---------- Scene ----------

export class Scene {
  constructor() {
    this.bodies = [];
    this.joints = [];
    this.nextId = 1;

    this.traceBody = -1;
    this.traceLx = 0.0;
    this.traceLy = 0.0;
    this.trace = [];

    this.measures = [];
    this.nextMeasure = 1;
  }

  byId(id) { return this.bodies.find((it) => it.id === id) ?? null; }

  add(type, x, y) {
    const b = new Body(this.nextId++, type);
    b.x = x; b.y = y;
    b.noGravity = true;      // new parts float; choose which ones fall with "Falls: YES"
    switch (type) {
      case BodyType.RECT: b.w = 100.0; b.h = 20.0; break;
      case BodyType.GEAR: b.teeth = 20; b.module = 2.0; break;
      case BodyType.RAIL: b.w = 300.0; b.h = 10.0; b.fixed = true; break;
      case BodyType.RACK: b.w = 200.0; b.h = 14.0; b.module = 2.0; break;
      case BodyType.TUBE: b.w = 200.0; b.h = 30.0; b.wall = 2.0; break;
      case BodyType.SOLENOID: b.w = 30.0; b.h = 16.0; b.fixed = true; break;
      case BodyType.PULLEY: b.w = 40.0; b.h = 40.0; break;
      case BodyType.DISC: b.w = 120.0; b.h = 120.0; break;
    }
    this.bodies.push(b);
    return b;
  }

  remove(b) {
    removeIf(this.joints, (it) => it.a === b.id || it.b === b.id);
    removeItem(this.bodies, b);
    if (this.traceBody === b.id) this.clearTracer();
    removeIf(this.measures, (m) => m.pts.some((it) => it.body === b.id) || (m.kind === MK.GAP && (m.refA === b.id || m.refB === b.id)));
  }

  clear() {
    this.bodies.length = 0; this.joints.length = 0; this.nextId = 1; this.clearTracer();
    this.measures.length = 0; this.nextMeasure = 1;
  }

  // ---------- measurements ----------

  addMeasure(kind, pts, refA = -1, refB = -1) {
    const m = new Measure(kind, this.nextMeasure++, pts, refA, refB);
    this.measures.push(m);
    return m;
  }

  measureByNum(n) { return this.measures.find((it) => it.num === n) ?? null; }

  anchorWorld(a) {
    if (a.body < 0) return new P2(a.lx, a.ly);
    const b = this.byId(a.body);
    return b ? b.toWorld(a.lx, a.ly) : null;
  }

  anchorAt(b, p) {
    if (b == null) return new Anchor(-1, p.x, p.y);
    const l = b.toLocal(p.x, p.y);
    return new Anchor(b.id, l.x, l.y);
  }

  // the pivot a part turns around: its pin to the ground or to a locked part (looks through welds)
  pivotOf(b) {
    const ids = new Set(this.weldGroupOf(b).map((it) => it.id));
    for (const j of this.joints) {
      if (j.kind !== JointKind.PIN) continue;
      const A = this.byId(j.a); if (A == null) continue;
      const B = j.b >= 0 ? this.byId(j.b) : null;
      if (ids.has(A.id) && (B == null || B.fixed)) return A.toWorld(j.ax, j.ay);
      if (B != null && ids.has(B.id) && A.fixed) return B.toWorld(j.bx, j.by);
    }
    return null;
  }

  // ---------- tracer ----------

  setTracer(b, p) {
    const l = b.toLocal(p.x, p.y);
    this.traceBody = b.id; this.traceLx = l.x; this.traceLy = l.y;
    this.trace.length = 0;
    this.recordTrace();
  }

  clearTracer() { this.traceBody = -1; this.trace.length = 0; }

  recordTrace() {
    const b = this.byId(this.traceBody); if (b == null) return;
    const p = b.toWorld(this.traceLx, this.traceLy);
    const last = this.trace.length ? this.trace[this.trace.length - 1] : null;
    if (last == null || Math.hypot(p.x - last.x, p.y - last.y) > 0.2) {
      this.trace.push(p);
      if (this.trace.length > 30000) this.trace.shift();
    }
  }

  // ---------- joints ----------

  pin(p, top, under) {
    const j = new Joint(JointKind.PIN, top.id, under?.id ?? -1);
    const la = top.toLocal(p.x, p.y);
    j.ax = la.x; j.ay = la.y;
    if (under == null) { j.bx = p.x; j.by = p.y; } else {
      const lb = under.toLocal(p.x, p.y); j.bx = lb.x; j.by = lb.y;
    }
    this.joints.push(j);
    return j;
  }

  slide(car, rail) {
    const j = new Joint(JointKind.SLIDE, car.id, rail.id);
    const l = rail.toLocal(car.x, car.y);
    // bx = 1 means "inside" (telescopic): part placed within the guide's width
    // slides along the guide's center line and may extend out of its ends.
    j.bx = (rail.type !== BodyType.RAIL && Math.abs(l.y) < rail.h / 2) ? 1.0 : 0.0;
    this.setSlideLimits(j, car, rail);
    const u = coerceIn(l.x, j.lo, j.hi);
    // ay = sideways offset of the slide line from the guide's center line.
    // Rod rail: always on the axis. Rectangle guide: keep where the part was placed,
    // snapping to "resting exactly on the top/bottom edge" when close.
    let off = 0.0;
    if (rail.type !== BodyType.RAIL && j.bx === 1.0) {
      off = 0.0;
      if (car.type !== BodyType.GEAR) car.a = rail.a + Math.round((car.a - rail.a) / PI) * PI;
    } else if (rail.type !== BodyType.RAIL) {
      // rest flat on the nearest surface (top or bottom) of the guide
      const touch = rail.h / 2 + car.sideHalf();
      off = l.y >= 0 ? touch : -touch;
      if (car.type !== BodyType.GEAR) car.a = rail.a + Math.round((car.a - rail.a) / PI) * PI;
    }
    j.ay = off;
    if (!car.fixed) {
      const wp = rail.toWorld(u, off);
      car.x = wp.x; car.y = wp.y;
    }
    j.c = car.a - rail.a;
    this.joints.push(j);
    this.fixInnerOrder();
    return j;
  }

  // WELD: a and b become one rigid part, exactly as they sit now.
  // (ax, ay) on a and (bx, by) on b are the same world point; c = angle difference.
  weld(p, a, b) {
    const j = new Joint(JointKind.WELD, a.id, b.id);
    const la = a.toLocal(p.x, p.y); j.ax = la.x; j.ay = la.y;
    const lb = b.toLocal(p.x, p.y); j.bx = lb.x; j.by = lb.y;
    j.c = a.a - b.a;
    removeIf(this.joints, (it) => (it.a === a.id && it.b === b.id) || (it.a === b.id && it.b === a.id));
    this.joints.push(j);
    return j;
  }

  // SLOT: a point on `car` (ax, ay local) rides along a line on `guide`
  // (guide local y = by), free to rotate. Like a pin running in a slot or on a surface.
  slot(p, car, guide) {
    const j = new Joint(JointKind.SLOT, car.id, guide.id);
    const la = car.toLocal(p.x, p.y);
    j.ax = la.x; j.ay = la.y;
    const l = guide.toLocal(p.x, p.y);
    let off;
    if (guide.type === BodyType.RAIL) off = 0.0;
    else if (Math.abs(l.y) < guide.h / 4) off = 0.0;   // tapped near the middle: run along the center line
    else if (l.y >= 0) off = guide.h / 2;              // ride on the top surface
    else off = -guide.h / 2;                           // ride on the bottom surface
    j.by = off;
    j.lo = -guide.w / 2; j.hi = guide.w / 2;
    const u = coerceIn(l.x, j.lo, j.hi);
    if (!car.fixed) {
      const target = guide.toWorld(u, off);
      car.x += target.x - p.x; car.y += target.y - p.y;
    }
    this.joints.push(j);
    return j;
  }

  // ---------- belt / chain ----------
  // bx = 1 means crossed belt (wheels turn opposite ways), else open (same way).
  // Rule: open  r1*a1 - r2*a2 = c   crossed  r1*a1 + r2*a2 = c

  beltValue(j, A, B) {
    return j.bx === 1.0 ? A.wheelR() * A.a + B.wheelR() * B.a : A.wheelR() * A.a - B.wheelR() * B.a;
  }

  belt(w1, w2, crossed) {
    removeIf(this.joints, (it) => it.kind === JointKind.BELT &&
      ((it.a === w1.id && it.b === w2.id) || (it.a === w2.id && it.b === w1.id)));
    const j = new Joint(JointKind.BELT, w1.id, w2.id);
    j.bx = crossed ? 1.0 : 0.0;
    j.c = this.beltValue(j, w1, w2);
    this.joints.push(j);
    return j;
  }

  beltGeom(j, A, B) {
    const r1 = A.wheelR(); const r2 = B.wheelR();
    const dx = B.x - A.x; const dy = B.y - A.y;
    const d = Math.hypot(dx, dy);
    const u = Math.atan2(dy, dx);
    const on = (b, r, t) => new P2(b.x + r * Math.cos(t), b.y + r * Math.sin(t));
    if (j.bx === 1.0) {
      if (d <= r1 + r2 + 1e-6) return null;
      const beta = Math.acos((r1 + r2) / d);
      const len = 2 * Math.sqrt(d * d - (r1 + r2) * (r1 + r2)) + (r1 + r2) * (PI + 2 * Math.asin((r1 + r2) / d));
      return new BeltGeom(
        [on(A, r1, u + beta), on(B, r2, u + beta + PI), on(A, r1, u - beta), on(B, r2, u - beta + PI)],
        [u + beta, 2 * PI - 2 * beta],
        [u + PI + beta, 2 * PI - 2 * beta],
        len,
      );
    } else {
      if (d <= Math.abs(r1 - r2) + 1e-6) return null;
      const beta = Math.acos((r1 - r2) / d);
      const len = 2 * Math.sqrt(d * d - (r1 - r2) * (r1 - r2)) + PI * (r1 + r2) + 2 * (r1 - r2) * Math.asin((r1 - r2) / d);
      return new BeltGeom(
        [on(A, r1, u + beta), on(B, r2, u + beta), on(A, r1, u - beta), on(B, r2, u - beta)],
        [u + beta, 2 * PI - 2 * beta],
        [u - beta, 2 * beta],
        len,
      );
    }
  }

  // ---------- layers (draw order: first = back, last = front) ----------

  // all parts welded to b (directly or through others), in draw order
  weldGroupOf(b) {
    const ids = new Set([b.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const j of this.joints) if (j.kind === JointKind.WELD && j.b >= 0) {
        if (ids.has(j.a) && !ids.has(j.b)) { ids.add(j.b); grew = true; }
        if (ids.has(j.b) && !ids.has(j.a)) { ids.add(j.a); grew = true; }
      }
    }
    return this.bodies.filter((it) => ids.has(it.id));
  }

  toFront(b) { const g = this.weldGroupOf(b); const gs = new Set(g); removeIf(this.bodies, (x) => gs.has(x)); this.bodies.push(...g); }
  toBack(b) { const g = this.weldGroupOf(b); const gs = new Set(g); removeIf(this.bodies, (x) => gs.has(x)); this.bodies.unshift(...g); }

  // a rod sliding INSIDE a tube/rect must be drawn in front of it
  fixInnerOrder() {
    for (const j of this.joints) {
      if (j.kind !== JointKind.SLIDE || j.bx !== 1.0) continue;
      const car = this.byId(j.a); if (car == null) continue;
      const rail = this.byId(j.b); if (rail == null) continue;
      if (this.bodies.indexOf(car) < this.bodies.indexOf(rail)) {
        removeItem(this.bodies, car);
        this.bodies.splice(this.bodies.indexOf(rail) + 1, 0, car);
      }
    }
  }

  // ---------- solenoid ----------
  // A coil (SOLENOID part, locked by default) + a steel plunger sliding inside it.
  // OFF: a return spring holds the plunger at its rest end. ON: the coil drives it to the other end.
  // Pull type: OFF = plunger out, ON = pulled in. Push type: OFF = in, ON = pushed out.

  addSolenoid(x, y, push) {
    const coil = this.add(BodyType.SOLENOID, x, y);
    coil.pushType = push;
    const pl = this.add(BodyType.RECT, x, y);
    pl.w = 30.0; pl.h = 6.0;
    pl.strong = true; pl.noGravity = true;
    const j = this.slide(pl, coil);            // center inside the coil = telescopic slide
    j.sol = 1; j.spring = 1;
    this.updateSolenoid(j);
    const u = push ? j.lo : j.hi;    // start at the OFF position
    const w = coil.toWorld(u, 0.0); pl.x = w.x; pl.y = w.y;
    return coil;
  }

  solenoidOf(b) {
    return this.joints.find((it) => it.kind === JointKind.SLIDE && it.sol > 0 && (it.a === b.id || it.b === b.id)) ?? null;
  }

  // travel: plunger fully in = sticks out 4 mm past the coil's front; out = in + stroke
  updateSolenoid(j) {
    const coil = this.byId(j.b); if (coil == null) return;
    const pl = this.byId(j.a); if (pl == null) return;
    const uIn = coil.w / 2 + 4.0 - pl.w / 2;
    j.lo = uIn; j.hi = uIn + coil.stroke;
    j.ay = 0.0; j.bx = 1.0;
    const onEnd = coil.pushType ? j.hi : j.lo;
    const offEnd = coil.pushType ? j.lo : j.hi;
    j.rest = j.sol === 2 ? onEnd : offEnd;
  }

  setSolenoid(j, on) {
    j.sol = on ? 2 : 1;
    j.spring = 1;
    this.updateSolenoid(j);
  }

  // ---------- torsion springs (on a PIN) ----------
  // twists part a relative to part b (or to the ground). rest = target relative angle (radians)

  relAngle(j) {
    const A = this.byId(j.a); if (A == null) return 0.0;
    const B = j.b >= 0 ? this.byId(j.b) : null;
    return A.a - (B?.a ?? 0.0);
  }

  // mode: 0 remove, 1 turn counter-clockwise, 2 turn clockwise, 3 return to this angle
  setTorsion(j, mode) {
    const t = this.relAngle(j);
    switch (mode) {
      case 0: j.spring = 0; break;
      case 1: j.spring = 1; j.rest = t + PI; break;      // keeps turning ↺ up to half a turn, or until blocked
      case 2: j.spring = 1; j.rest = t - PI; break;      // keeps turning ↻ up to half a turn, or until blocked
      default: j.spring = 1; j.rest = t;
    }
  }

  // ---------- springs (on a SLIDE) ----------
  // mode: 0 remove, 1 push toward + end, 2 pull toward - end, 3 return to where it is now
  setSpring(j, mode) {
    const car = this.byId(j.a); if (car == null) return;
    const g = this.byId(j.b); if (g == null) return;
    switch (mode) {
      case 0: j.spring = 0; break;
      case 1: j.spring = 1; j.rest = j.hi; break;
      case 2: j.spring = 1; j.rest = j.lo; break;
      default: j.spring = 1; j.rest = coerceIn(g.toLocal(car.x, car.y).x, j.lo, j.hi);
    }
  }

  // only one slide/slot between the same two parts, in either direction
  removeGuideJoints(x, y) {
    removeIf(this.joints, (it) =>
      (it.kind === JointKind.SLIDE || it.kind === JointKind.SLOT) &&
      ((it.a === x.id && it.b === y.id) || (it.a === y.id && it.b === x.id)));
  }

  // (private in Kotlin)
  setSlideLimits(j, car, rail) {
    const half = car.halfLen();
    if (j.bx === 1.0) {
      // telescopic: can pull out until only 20% of the shorter part still overlaps
      const keep = 0.2 * Math.min(car.halfLen() * 2, rail.w);
      j.lo = -rail.w / 2 - half + keep;
      j.hi = rail.w / 2 + half - keep;
      return;
    }
    let lo = -rail.w / 2 + half;
    let hi = rail.w / 2 - half;
    if (lo > hi) { lo = 0.0; hi = 0.0; }
    j.lo = lo; j.hi = hi;
  }

  // returns error message or null
  meshGears(g1, g2) {
    if (Math.abs(g1.module - g2.module) > 1e-9) return 'Gears need the same module';
    const r1 = g1.pitchR(); const r2 = g2.pitchR();
    const dist = r1 + r2;
    let dx = g2.x - g1.x; let dy = g2.y - g1.y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-6) { dx = 1.0; dy = 0.0; d = 1.0; }
    const phi = Math.atan2(dy, dx);
    const p1 = 2 * PI / g1.teeth;
    const p2 = 2 * PI / g2.teeth;
    if (!g2.fixed) {
      g2.x = g1.x + dx / d * dist; g2.y = g1.y + dy / d * dist;
      const f1 = frac((phi - g1.a) / p1);
      g2.a = phi + PI - p2 * (0.5 - f1);
    } else if (!g1.fixed) {
      g1.x = g2.x - dx / d * dist; g1.y = g2.y - dy / d * dist;
      const f2 = frac((phi + PI - g2.a) / p2);
      g1.a = phi - p1 * (0.5 - f2);
    }
    const j = new Joint(JointKind.GEAR, g1.id, g2.id);
    const phiNow = Math.atan2(g2.y - g1.y, g2.x - g1.x);
    j.phi = phiNow;
    j.c = r1 * g1.a + r2 * g2.a - (r1 + r2) * phiNow;
    this.joints.push(j);
    return null;
  }

  // gear sits on the toothed (+Y) side of the rack
  meshRack(g, r) {
    if (Math.abs(g.module - r.module) > 1e-9) return 'Gear and rack need the same module';
    const R = g.pitchR();
    const ly = r.h / 2 + R;
    const l = r.toLocal(g.x, g.y);
    if (!g.fixed) {
      const wp = r.toWorld(l.x, ly);
      g.x = wp.x; g.y = wp.y;
    } else if (!r.fixed) {
      const c = Math.cos(r.a); const s = Math.sin(r.a);
      r.x = g.x - (l.x * c - ly * s);
      r.y = g.y - (l.x * s + ly * c);
    }
    const l2 = r.toLocal(g.x, g.y);
    if (!g.fixed) {
      const p = PI * r.module;
      const u0 = -r.w / 2 + p / 2;
      const gph = frac((l2.x - u0) / p);
      const pg = 2 * PI / g.teeth;
      const psi = r.a - PI / 2;
      g.a = psi - pg * (gph + 0.5);
    }
    const j = new Joint(JointKind.RACK, g.id, r.id);
    j.c = l2.x + R * (g.a - r.a);
    this.joints.push(j);
    return null;
  }

  // after a part changes size: rebuild its joints so the math matches the new size
  rebuildJointsOf(b) {
    const mine = this.joints.filter((it) => it.a === b.id || it.b === b.id);
    for (const j of mine) {
      const A = this.byId(j.a); if (A == null) continue;
      const B = j.b >= 0 ? this.byId(j.b) : null;
      switch (j.kind) {
        case JointKind.PIN: case JointKind.WELD: break;
        case JointKind.BELT: if (B != null) j.c = this.beltValue(j, A, B); break;
        case JointKind.SLIDE: if (B != null) { if (j.sol > 0) this.updateSolenoid(j); else this.setSlideLimits(j, A, B); } break;
        case JointKind.SLOT: if (B != null) { j.lo = -B.w / 2; j.hi = B.w / 2; } break;
        case JointKind.GEAR: if (B != null) { removeItem(this.joints, j); this.meshGears(A, B); } break;
        case JointKind.RACK: if (B != null) { removeItem(this.joints, j); this.meshRack(A, B); } break;
      }
    }
  }

  jointWorldPoint(j) {
    const A = this.byId(j.a); if (A == null) return null;
    const B = j.b >= 0 ? this.byId(j.b) : null;
    switch (j.kind) {
      case JointKind.PIN: return A.toWorld(j.ax, j.ay);
      case JointKind.SLIDE: return new P2(A.x, A.y);
      case JointKind.SLOT: case JointKind.WELD: return A.toWorld(j.ax, j.ay);
      case JointKind.BELT: {
        if (B == null) return null;
        const g = this.beltGeom(j, A, B);
        if (g == null) return new P2((A.x + B.x) / 2, (A.y + B.y) / 2);
        return new P2((g.spans[0].x + g.spans[1].x) / 2, (g.spans[0].y + g.spans[1].y) / 2);
      }
      case JointKind.GEAR: {
        if (B == null) return null;
        const t = A.pitchR() / (A.pitchR() + B.pitchR());
        return new P2(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t);
      }
      case JointKind.RACK: {
        if (B == null) return null;
        const l = B.toLocal(A.x, A.y);
        return B.toWorld(l.x, B.h / 2);
      }
    }
    return null;
  }

  // ---------- demo ----------

  buildDemo() {
    this.clear();
    const rail = this.add(BodyType.RAIL, 0.0, 0.0);
    const rack = this.add(BodyType.RACK, 0.0, 0.0);
    this.slide(rack, rail);

    const g1 = this.add(BodyType.GEAR, 0.0, 30.0);
    this.meshRack(g1, rack);
    this.pin(new P2(g1.x, g1.y), g1, null);

    const g2 = this.add(BodyType.GEAR, g1.x, g1.y + 40.0);
    g2.teeth = 30;
    this.meshGears(g1, g2);
    this.pin(new P2(g2.x, g2.y), g2, null);

    const arm = this.add(BodyType.RECT, 0.0, 0.0);
    arm.w = 80.0; arm.h = 12.0;
    const crank = new P2(g2.x + 20.0, g2.y);
    arm.x = crank.x + (arm.w / 2 - arm.h / 2); arm.y = crank.y;
    this.pin(crank, arm, g2);

    this.setTracer(arm, arm.toWorld(arm.w / 2 - arm.h / 2, 0.0));
  }

  // ---------- save / load ----------

  toJson() {
    const o = {};
    o.nextId = this.nextId;
    o.bodies = this.bodies.map((b) => ({
      id: b.id, type: b.type.name,
      x: num(b.x), y: num(b.y), a: num(b.a),
      w: num(b.w), h: num(b.h),
      teeth: b.teeth, module: num(b.module),
      fixed: b.fixed,
      noGrav: b.noGravity,
      strong: b.strong,
      stroke: num(b.stroke), push: b.pushType,
      wall: num(b.wall),
      ...(b.plain ? { plain: true } : {}),
    }));
    o.joints = this.joints.map((j) => ({
      kind: j.kind.name, a: j.a, b: j.b,
      ax: num(j.ax), ay: num(j.ay), bx: num(j.bx), by: num(j.by),
      c: num(j.c), lo: num(j.lo), hi: num(j.hi), phi: num(j.phi),
      spring: j.spring, rest: num(j.rest), sol: j.sol,
    }));
    o.measures = this.measures.map((m) => ({
      kind: m.kind, num: m.num, refA: m.refA, refB: m.refB,
      pts: m.pts.map((p) => [p.body, num(p.lx), num(p.ly)]),
    }));
    o.nextMeasure = this.nextMeasure;
    o.traceBody = this.traceBody; o.traceLx = num(this.traceLx); o.traceLy = num(this.traceLy);
    return JSON.stringify(o);
  }

  loadJson(s) {
    try {
      const o = JSON.parse(s);
      if (o === null || typeof o !== 'object' || Array.isArray(o)) throw new Error('JSONException: not a JSONObject');
      const nb = [];
      const ba = getArray(o, 'bodies');
      for (let i = 0; i < ba.length; i++) {
        const bo = getObject(ba, i);
        const b = new Body(getInt(bo, 'id'), BodyType.valueOf(getString(bo, 'type')));
        b.x = getDouble(bo, 'x'); b.y = getDouble(bo, 'y'); b.a = getDouble(bo, 'a');
        b.w = getDouble(bo, 'w'); b.h = getDouble(bo, 'h');
        b.teeth = getInt(bo, 'teeth'); b.module = getDouble(bo, 'module');
        b.fixed = getBoolean(bo, 'fixed');
        b.noGravity = optBoolean(bo, 'noGrav', false);
        b.strong = optBoolean(bo, 'strong', false);
        b.stroke = optDouble(bo, 'stroke', 10.0);
        b.pushType = optBoolean(bo, 'push', false);
        b.wall = optDouble(bo, 'wall', 2.0);
        b.plain = optBoolean(bo, 'plain', false);
        nb.push(b);
      }
      const nj = [];
      const ja = getArray(o, 'joints');
      for (let i = 0; i < ja.length; i++) {
        const jo = getObject(ja, i);
        const j = new Joint(JointKind.valueOf(getString(jo, 'kind')), getInt(jo, 'a'), getInt(jo, 'b'));
        j.ax = getDouble(jo, 'ax'); j.ay = getDouble(jo, 'ay');
        j.bx = getDouble(jo, 'bx'); j.by = getDouble(jo, 'by');
        j.c = getDouble(jo, 'c'); j.lo = getDouble(jo, 'lo'); j.hi = getDouble(jo, 'hi');
        j.phi = getDouble(jo, 'phi');
        j.spring = optInt(jo, 'spring', 0);
        j.rest = optDouble(jo, 'rest', 0.0);
        j.sol = optInt(jo, 'sol', 0);
        nj.push(j);
      }
      for (const b of nb) {
        if (!Number.isFinite(b.x) || Math.abs(b.x) > 1.0e6) b.x = 0.0;
        if (!Number.isFinite(b.y) || Math.abs(b.y) > 1.0e6) b.y = 0.0;
        if (!Number.isFinite(b.a)) b.a = 0.0;
      }
      this.bodies.length = 0; this.bodies.push(...nb);
      this.joints.length = 0; this.joints.push(...nj);
      this.measures.length = 0;
      const ma = optArray(o, 'measures');
      if (ma != null) for (let i = 0; i < ma.length; i++) {
        const mo = getObject(ma, i);
        const pa = getArray(mo, 'pts');
        const pts = [];
        for (let k = 0; k < pa.length; k++) {
          const q = getArray(pa, k);
          pts.push(new Anchor(getInt(q, 0), getDouble(q, 1), getDouble(q, 2)));
        }
        this.measures.push(new Measure(getInt(mo, 'kind'), getInt(mo, 'num'), pts, optInt(mo, 'refA', -1), optInt(mo, 'refB', -1)));
      }
      const maxNum = this.measures.length ? Math.max(...this.measures.map((it) => it.num)) : 0;
      this.nextMeasure = optInt(o, 'nextMeasure', maxNum + 1);
      this.nextId = getInt(o, 'nextId');
      this.fixInnerOrder();
      this.trace.length = 0;
      this.traceBody = optInt(o, 'traceBody', -1);
      this.traceLx = optDouble(o, 'traceLx', 0.0); this.traceLy = optDouble(o, 'traceLy', 0.0);
      this.recordTrace();
      return true;
    } catch (e) {
      return false;
    }
  }
}

// nested Kotlin class Scene.BeltGeom
Scene.BeltGeom = BeltGeom;
