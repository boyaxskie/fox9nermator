// Port of Measure.kt
/*
 * Live math for the Measure tool, written out step by step so you can check it:
 *  - Distance: Pythagoras  c = √(a² + b²)
 *  - Angle at a point
 *  - Travel: path length, straight line (Pythagoras), arc  s = r × θ
 *  - Where two lines cross, where the trace crosses a line
 *  - Smallest gap between two parts during the motion
 * Lengths are shown in the chosen units (mm or inch).
 */
import { Units, formatFixed } from './calc.js';
import { P2, MK, wrapPi, pair } from './model.js';
import { Collision } from './collision.js';

const PI = Math.PI;

function n(v) { return formatFixed(Units.toUser(v), Units.inch ? 3 : 1); }
function sq(v) {   // a value squared, in display units
  const u = Units.toUser(v);
  return formatFixed(u * u, Units.inch ? 3 : 1);
}
function deg(r) { return formatFixed(r * 180 / PI, 1) + '°'; }
function unit() { return Units.label; }
const in01 = (v) => v >= 0.0 && v <= 1.0;

export const MeasureCalc = {

  // ---------- geometry ----------

  // crossing point of the infinite lines p1-p2 and p3-p4; null if parallel.
  // [x, y, t, u]: t and u are positions along each segment (0..1 = on the segment)
  lineCross(p1, p2, p3, p4) {
    const d1x = p2.x - p1.x; const d1y = p2.y - p1.y;
    const d2x = p4.x - p3.x; const d2y = p4.y - p3.y;
    const den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
    const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / den;
    return [p1.x + t * d1x, p1.y + t * d1y, t, u];
  },

  // returns a Pair [a, b] (also .first / .second) or null
  distPts(s, m) {
    if (m.pts.length < 2) return null;
    const a = s.anchorWorld(m.pts[0]); if (a == null) return null;
    const b = s.anchorWorld(m.pts[1]); if (b == null) return null;
    return pair(a, b);
  },

  // where the trace path crosses distance line m (the segment itself)
  traceCrossings(s, line) {
    const ab = MeasureCalc.distPts(s, line);
    if (ab == null) return [];
    const [a, b] = ab;
    const out = [];
    const t = s.trace;
    for (let k = 1; k < t.length; k++) {
      const c = MeasureCalc.lineCross(t[k - 1], t[k], a, b); if (c == null) continue;
      if (in01(c[2]) && in01(c[3])) {
        const p = new P2(c[0], c[1]);
        if (!out.some((it) => Math.hypot(it.x - p.x, it.y - p.y) < 0.5)) out.push(p);
      }
    }
    return out;
  },

  // ---------- live values (call once per frame) ----------

  update(s) {
    for (const m of s.measures) {
      switch (m.kind) {
        case MK.TRAVEL: {
          const p = s.anchorWorld(m.pts[0]); if (p == null) continue;
          const b = s.byId(m.pts[0].body);
          const st = m.start;
          if (st == null) {
            m.start = p; m.last = p; m.path = 0.0; m.startA = b?.a ?? 0.0;
            m.pathPts.length = 0; m.pathPts.push(p);
          } else {
            const l = m.last ?? p;
            const d = Math.hypot(p.x - l.x, p.y - l.y);
            if (d > 0.01) {
              m.path += d; m.last = p;
              const lp = m.pathPts[m.pathPts.length - 1];
              if (lp === undefined) throw new Error('NoSuchElementException: List is empty.');
              if (Math.hypot(p.x - lp.x, p.y - lp.y) > 0.5 && m.pathPts.length < 8000) m.pathPts.push(p);
            }
          }
          break;
        }
        case MK.GAP: {
          const a = s.byId(m.refA); if (a == null) continue;
          const b = s.byId(m.refB); if (b == null) continue;
          m.minGap = Math.min(m.minGap, Collision.closest(a, b)[4]);
          break;
        }
        default: break;
      }
    }
  },

  // ---------- the written-out calculations ----------

  text(s) {
    let sb = '';
    for (const m of s.measures) {
      if (sb.length > 0) sb += '\n';
      switch (m.kind) {
        case MK.DIST: {
          const pq = MeasureCalc.distPts(s, m);
          if (pq == null) { sb += `${m.name}: part deleted`; continue; }
          const [p, q] = pq;
          const a = Math.abs(q.x - p.x); const b = Math.abs(q.y - p.y); const c = Math.hypot(a, b);
          const ua = Units.toUser(a); const ub = Units.toUser(b);
          const sum = ua * ua + ub * ub;
          sb += `${m.name}  a = Δx = ${n(a)}   b = Δy = ${n(b)}\n`;
          sb += `    c = √(a² + b²) = √(${n(a)}² + ${n(b)}²) = √(${sq(a)} + ${sq(b)})`;
          sb += ' = √' + formatFixed(sum, Units.inch ? 3 : 1);
          sb += ` = ${n(c)} ${unit()}`;
          sb += `   θ = atan(b ÷ a) = ${deg(Math.atan2(b, a))}`;
          break;
        }
        case MK.ANGLE: {
          const pA = s.anchorWorld(m.pts[0]); const pV = s.anchorWorld(m.pts[1]); const pB = s.anchorWorld(m.pts[2]);
          if (pA == null || pV == null || pB == null) { sb += `${m.name}: part deleted`; continue; }
          const a1 = Math.atan2(pA.y - pV.y, pA.x - pV.x); const a2 = Math.atan2(pB.y - pV.y, pB.x - pV.x);
          const d = Math.abs(wrapPi(a2 - a1));
          sb += `${m.name}  angle at the middle point = ${deg(d)}`;
          sb += `   (arms ${n(Math.hypot(pA.x - pV.x, pA.y - pV.y))} and ${n(Math.hypot(pB.x - pV.x, pB.y - pV.y))} ${unit()})`;
          break;
        }
        case MK.TRAVEL: {
          const b = s.byId(m.pts[0].body);
          const p = s.anchorWorld(m.pts[0]); const st = m.start;
          if (p == null || st == null) { sb += `${m.name}: waiting…`; continue; }
          const a = Math.abs(p.x - st.x); const bb = Math.abs(p.y - st.y); const c = Math.hypot(a, bb);
          sb += `${m.name}  ${b?.name ?? 'point'}: path traveled = ${n(m.path)} ${unit()}\n`;
          sb += `    straight: a = ${n(a)}, b = ${n(bb)} → c = √(${n(a)}² + ${n(bb)}²) = ${n(c)} ${unit()}`;
          const piv = b != null ? s.pivotOf(b) : null;
          if (b != null && piv != null) {
            const r = Math.hypot(p.x - piv.x, p.y - piv.y);
            const th = b.a - m.startA;
            sb += `\n    arc: s = r × θ = ${n(r)} × `;
            sb += `${formatFixed(Math.abs(th), 3)} rad (${deg(Math.abs(th))})`;
            sb += ` = ${n(r * Math.abs(th))} ${unit()}`;
          }
          break;
        }
        case MK.CROSS: {
          const l1 = s.measureByNum(m.refA); const l2 = s.measureByNum(m.refB);
          const p1 = l1 != null ? MeasureCalc.distPts(s, l1) : null;
          const p2 = l2 != null ? MeasureCalc.distPts(s, l2) : null;
          if (p1 == null || p2 == null) { sb += `${m.name}: a line was deleted`; continue; }
          const c = MeasureCalc.lineCross(p1[0], p1[1], p2[0], p2[1]);
          if (c == null) sb += `${m.name}  ${l1.name} × ${l2.name}: parallel, they never cross`;
          else {
            const on = in01(c[2]) && in01(c[3]);
            sb += `${m.name}  ${l1.name} × ${l2.name} cross at X = ${n(c[0])}, Y = ${n(c[1])} ${unit()}`;
            sb += on ? '  (on both lines)' : '  (where the lines would meet if extended)';
          }
          break;
        }
        case MK.TRACECROSS: {
          const l = s.measureByNum(m.refA);
          if (l == null) { sb += `${m.name}: line deleted`; continue; }
          const pts = MeasureCalc.traceCrossings(s, l);
          if (s.traceBody < 0) sb += `${m.name}  turn on Trace (tap a point) to find where its path crosses ${l.name}`;
          else if (pts.length === 0) sb += `${m.name}  trace hasn't crossed ${l.name} yet`;
          else {
            sb += `${m.name}  trace crosses ${l.name} ${pts.length}×: `;
            sb += pts.slice(0, 4).map((it) => `(${n(it.x)}, ${n(it.y)})`).join('  ');
            if (pts.length > 4) sb += ' …';
          }
          break;
        }
        case MK.GAP: {
          const a = s.byId(m.refA); const b = s.byId(m.refB);
          if (a == null || b == null) { sb += `${m.name}: part deleted`; continue; }
          const now = Collision.closest(a, b)[4];
          const mn = m.minGap === Number.MAX_VALUE ? now : Math.min(m.minGap, now);
          sb += `${m.name}  gap ${a.name} ↔ ${b.name}: now ${n(now)} ${unit()}, smallest so far ${n(mn)} ${unit()}`;
          if (mn <= 0.0) sb += '  ⚠ they touch';
          break;
        }
        default: break;
      }
    }
    return sb;
  },
};
