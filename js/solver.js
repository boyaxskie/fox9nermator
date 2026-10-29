// Port of Solver.kt
import { P2, JointKind, wrapPi } from './model.js';

// What the user is pulling on while the constraints keep everything assembled.
// (Kotlin: private constructor — build with Drive.point / Drive.angle / Drive.gravity)
export class Drive {
  constructor(body, isAngle, lx, ly, tx, ty, ang, holdAngle = true, weight = 1.0) {
    this.body = body;
    this.isAngle = isAngle;
    this.lx = lx; this.ly = ly;
    this.tx = tx; this.ty = ty;
    this.ang = ang;
    this.holdAngle = holdAngle;   // false for gravity: parts may tip and swing freely
    this.weight = weight;         // heavier parts pull harder (gravity)
    this.keepA = body.a;          // weak preference to keep the dragged part's angle (free parts translate)
  }

  static point(b, lx, ly, tx, ty) { return new Drive(b, false, lx, ly, tx, ty, 0.0); }
  static angle(b, target) { return new Drive(b, true, 0.0, 0.0, 0.0, 0.0, target); }
  static gravity(b, tx, ty, weight) { return new Drive(b, false, 0.0, 0.0, tx, ty, 0.0, false, weight); }
}

/*
 * Damped Gauss-Newton on all free bodies (x, y, angle).
 * Pass 1: constraints + a weak pull toward the drive target.
 * Pass 2: constraints only, so parts end up exactly assembled.
 */
const L = 50.0;      // mm per radian, balances angle vs distance
const WD = 0.1;      // drive weight (constraints weigh 1)
const WK = 0.01;     // keep-angle weight while dragging a point
const EPS = 1e-5;
const LAMBDA = 1e-7;

function afterSolve(s) {
  for (const j of s.joints) {
    if (j.kind !== JointKind.GEAR) continue;
    const A = s.byId(j.a); if (A == null) continue;
    const B = s.byId(j.b); if (B == null) continue;
    j.phi = j.phi + wrapPi(Math.atan2(B.y - A.y, B.x - A.x) - j.phi);
  }
  s.recordTrace();
}

function count(s, ds) {
  let m = 0;
  for (const j of s.joints) {
    switch (j.kind) {
      case JointKind.PIN: m += 2; break;
      case JointKind.SLIDE: m += 3; break;
      case JointKind.SLOT: m += 2; break;
      case JointKind.WELD: m += 3; break;
      case JointKind.GEAR: case JointKind.RACK: case JointKind.BELT: m += 1; break;
    }
  }
  for (const d of ds) m += d.isAngle ? 1 : (d.holdAngle ? 3 : 2);
  return m;
}

function evalF(s, ds, f) {
  let i = 0;
  for (const j of s.joints) {
    const A = s.byId(j.a);
    const B = j.b >= 0 ? s.byId(j.b) : null;
    switch (j.kind) {
      case JointKind.PIN: {
        if (A == null) { f[i++] = 0.0; f[i++] = 0.0; continue; }
        const pa = A.toWorld(j.ax, j.ay);
        const pb = B == null ? new P2(j.bx, j.by) : B.toWorld(j.bx, j.by);
        f[i++] = pa.x - pb.x;
        f[i++] = pa.y - pb.y;
        break;
      }
      case JointKind.SLIDE: {
        if (A == null || B == null) { f[i++] = 0.0; f[i++] = 0.0; f[i++] = 0.0; continue; }
        const l = B.toLocal(A.x, A.y);
        f[i++] = l.y - j.ay;
        f[i++] = wrapPi(A.a - B.a - j.c) * L;
        f[i++] = Math.min(0.0, l.x - j.lo) + Math.max(0.0, l.x - j.hi);
        break;
      }
      case JointKind.WELD: {
        if (A == null || B == null) { f[i++] = 0.0; f[i++] = 0.0; f[i++] = 0.0; continue; }
        const pa = A.toWorld(j.ax, j.ay);
        const pb = B.toWorld(j.bx, j.by);
        f[i++] = pa.x - pb.x;
        f[i++] = pa.y - pb.y;
        f[i++] = wrapPi(A.a - B.a - j.c) * L;
        break;
      }
      case JointKind.SLOT: {
        if (A == null || B == null) { f[i++] = 0.0; f[i++] = 0.0; continue; }
        const p = A.toWorld(j.ax, j.ay);
        const l = B.toLocal(p.x, p.y);
        f[i++] = l.y - j.by;
        f[i++] = Math.min(0.0, l.x - j.lo) + Math.max(0.0, l.x - j.hi);
        break;
      }
      case JointKind.BELT: {
        if (A == null || B == null) { f[i++] = 0.0; continue; }
        f[i++] = s.beltValue(j, A, B) - j.c;
        break;
      }
      case JointKind.GEAR: {
        if (A == null || B == null) { f[i++] = 0.0; continue; }
        const r1 = A.pitchR(); const r2 = B.pitchR();
        const raw = Math.atan2(B.y - A.y, B.x - A.x);
        const phi = j.phi + wrapPi(raw - j.phi);
        f[i++] = r1 * A.a + r2 * B.a - (r1 + r2) * phi - j.c;
        break;
      }
      case JointKind.RACK: {
        if (A == null || B == null) { f[i++] = 0.0; continue; }
        const l = B.toLocal(A.x, A.y);
        f[i++] = l.x + A.pitchR() * (A.a - B.a) - j.c;
        break;
      }
    }
  }
  for (const d of ds) {
    const w = WD * d.weight;
    if (d.isAngle) {
      f[i++] = (d.body.a - d.ang) * L * w;
    } else {
      const p = d.body.toWorld(d.lx, d.ly);
      f[i++] = (p.x - d.tx) * w;
      f[i++] = (p.y - d.ty) * w;
      if (d.holdAngle) f[i++] = (d.body.a - d.keepA) * L * WK;
    }
  }
}

function nudge(b, k, v) {
  switch (k) {
    case 0: b.x += v; break;
    case 1: b.y += v; break;
    default: b.a += v / L;
  }
}

function run(s, vars, d, iters) {
  const m = count(s, d);
  if (m === 0) return;
  const n = vars.length * 3;
  const f0 = new Float64Array(m);
  const f1 = new Float64Array(m);
  const jac = Array.from({ length: m }, () => new Float64Array(n));
  const A = Array.from({ length: n }, () => new Float64Array(n));
  const g = new Float64Array(n);

  for (let it = 0; it < iters; it++) {
    evalF(s, d, f0);
    let err = 0.0;
    for (const v of f0) err += v * v;
    if (err < 1e-12) return;

    for (let c = 0; c < n; c++) {
      const b = vars[Math.floor(c / 3)]; const k = c % 3;
      nudge(b, k, EPS);
      evalF(s, d, f1);
      nudge(b, k, -EPS);
      for (let r = 0; r < m; r++) jac[r][c] = (f1[r] - f0[r]) / EPS;
    }

    for (let p = 0; p < n; p++) { g[p] = 0.0; A[p].fill(0.0); }
    for (let r = 0; r < m; r++) {
      const row = jac[r];
      for (let p = 0; p < n; p++) {
        const jp = row[p];
        if (jp === 0.0) continue;
        g[p] += jp * f0[r];
        const Ap = A[p];
        for (let q = p; q < n; q++) Ap[q] += jp * row[q];
      }
    }
    for (let p = 0; p < n; p++) {
      for (let q = 0; q < p; q++) A[p][q] = A[q][p];
      A[p][p] += LAMBDA;
      g[p] = -g[p];
    }

    const dq = gauss(A, g, n);
    if (dq == null) return;
    let big = 0.0;
    for (const v of dq) big = Math.max(big, Math.abs(v));
    const k = big > 20.0 ? 20.0 / big : 1.0;
    if (dq.some((v) => !Number.isFinite(v))) return;           // impossible numbers: keep the last good pose
    for (let c = 0; c < n; c++) nudge(vars[Math.floor(c / 3)], c % 3, dq[c] * k);
  }
}

// solves A x = b (A and b are overwritten)
function gauss(A, b, n) {
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(A[r][col]);
      if (v > best) { best = v; piv = r; }
    }
    if (best < 1e-18) return null;
    if (piv !== col) {
      const t = A[piv]; A[piv] = A[col]; A[col] = t;
      const tb = b[piv]; b[piv] = b[col]; b[col] = tb;
    }
    const pv = A[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / pv;
      if (f === 0.0) continue;
      const rr = A[r]; const rc = A[col];
      for (let c = col; c < n; c++) rr[c] -= f * rc[c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(n).fill(0.0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r];
    for (let c = r + 1; c < n; c++) sum -= A[r][c] * x[c];
    x[r] = sum / A[r][r];
  }
  return x;
}

export const Solver = {
  solve(s, drive, iters = 12) {
    return Solver.solveMulti(s, (drive != null && !drive.body.fixed) ? [drive] : [], iters);
  },

  // several pulls at once (gravity pulls on every part)
  solveMulti(s, drives, iters = 12) {
    const vars = s.bodies.filter((it) => !it.fixed);
    if (vars.length > 0) {
      const ds = drives.filter((it) => !it.body.fixed);
      if (ds.length > 0) run(s, vars, ds, iters);
      run(s, vars, [], 10);
    }
    afterSolve(s);
  },
};
