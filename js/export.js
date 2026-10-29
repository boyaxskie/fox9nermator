// Port of Export.kt
/*
 * Export parts flat for cutting (CNC router / laser), real size in mm.
 * Each piece = one part, or a welded group as ONE piece. Outline + pin holes + slot cutouts.
 * Pieces are laid out side by side to fit a 300 x 180 mm bed (CNC 3018), wrapping into rows.
 */
import { formatFixed } from './calc.js';
import { P2, BodyType, JointKind } from './model.js';
import polygonClipping from './vendor/polygon-clipping.esm.js';

const PI = Math.PI;
const POCKET = 'POCKET';

export class Cut {
  constructor(layer) { this.layer = layer; }
}
export class Poly extends Cut {            // closed outline
  constructor(pts, layer) { super(layer); this.pts = pts; }
}
export class Circ extends Cut {
  constructor(c, r, layer) { super(layer); this.c = c; this.r = r; }
}

export class Piece {
  constructor(name, cuts) { this.name = name; this.cuts = cuts; }
}

export class Result {
  constructor(pieces, width, height, notes) {
    this.pieces = pieces; this.width = width; this.height = height; this.notes = notes;
  }
}

const OUTLINE = 'OUTLINE';
const HOLES = 'HOLES';

// ---------- outlines (in the part's own frame, mm) ----------

function rectPts(w, h) {
  return [new P2(-w / 2, -h / 2), new P2(w / 2, -h / 2), new P2(w / 2, h / 2), new P2(-w / 2, h / 2)];
}

function gearPts(n, m) {
  const R = m * n / 2.0;
  const rr = Math.max(R - 1.25 * m, m * 0.5);
  const ra = R + m;
  const p = 2 * PI / n;
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = k * p;
    for (const [f, r] of [[-0.5, rr], [-0.27, rr], [-0.12, ra], [0.12, ra], [0.27, rr]])
      out.push(new P2(r * Math.cos(t + f * p), r * Math.sin(t + f * p)));
  }
  return out;
}

function rackPts(b) {
  const m = b.module;
  const p = PI * m;
  const hw = b.w / 2;
  const y0 = b.h / 2 - 1.25 * m;
  const y1 = b.h / 2 + m;
  const out = [new P2(-hw, -b.h / 2), new P2(hw, -b.h / 2), new P2(hw, y0)];
  const count = Math.trunc(Math.floor(b.w / p));
  for (let k = count - 1; k >= 0; k--) {
    const u = -hw + p / 2 + k * p;
    out.push(new P2(u + 0.27 * p, y0)); out.push(new P2(u + 0.12 * p, y1));
    out.push(new P2(u - 0.12 * p, y1)); out.push(new P2(u - 0.27 * p, y0));
  }
  out.push(new P2(-hw, y0));
  return out;
}

// slot cutout (rounded both ends) along local x from x0 to x1 at y, width = d
function slotPts(x0, x1, y, d) {
  const r = d / 2;
  const out = [];
  const n = 16;
  for (let k = 0; k <= n; k++) { const t = -PI / 2 + PI * k / n; out.push(new P2(x1 + r * Math.cos(t), y + r * Math.sin(t))); }
  for (let k = 0; k <= n; k++) { const t = PI / 2 + PI * k / n; out.push(new P2(x0 + r * Math.cos(t), y + r * Math.sin(t))); }
  return out;
}

function bbox(p) {
  let x0 = Number.MAX_VALUE; let y0 = Number.MAX_VALUE; let x1 = -Number.MAX_VALUE; let y1 = -Number.MAX_VALUE;
  for (const c of p.cuts) {
    if (c instanceof Poly) {
      for (const it of c.pts) { x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x); y1 = Math.max(y1, it.y); }
    } else if (c instanceof Circ) {
      x0 = Math.min(x0, c.c.x - c.r); y0 = Math.min(y0, c.c.y - c.r); x1 = Math.max(x1, c.c.x + c.r); y1 = Math.max(y1, c.c.y + c.r);
    }
  }
  return [x0, y0, x1, y1];
}

function shift(c, dx, dy) {
  if (c instanceof Poly) return new Poly(c.pts.map((it) => new P2(it.x + dx, it.y + dy)), c.layer);
  return new Circ(new P2(c.c.x + dx, c.c.y + dy), c.r, c.layer);
}

// polygon-clipping ring helpers
const ring = (pl) => [pl.map((p) => [p.x, p.y])];
function unring(r) {
  const pts = r.map(([x, y]) => new P2(x, y));
  if (pts.length > 1) { const a = pts[0], b = pts[pts.length - 1]; if (a.x === b.x && a.y === b.y) pts.pop(); }
  return pts;
}

// ---------- file formats ----------

function f(v) { return formatFixed(v, 4); }

// Real polygon union for the web (Android used Path.op). Input: list of polygons
// (each a list of P2). Output: the outer ring of every resulting polygon, as lists of P2.
function polygonUnion(polys) {
  const geoms = polys
    .filter((pl) => pl.length >= 3)
    .map((pl) => [pl.map((p) => [p.x, p.y])]);
  if (geoms.length === 0) return [];
  const mp = polygonClipping.union(...geoms);
  const out = [];
  for (const poly of mp) {
    const ring = poly[0];
    if (!ring) continue;
    const pts = ring.map(([x, y]) => new P2(x, y));
    // polygon-clipping closes rings (last = first): drop the duplicate
    if (pts.length > 1) {
      const a = pts[0]; const b = pts[pts.length - 1];
      if (a.x === b.x && a.y === b.y) pts.pop();
    }
    if (pts.length >= 3) out.push(pts);
  }
  return out;
}

export const Exporter = {
  Cut, Poly, Circ, Piece, Result,

  OUTLINE,
  HOLES,
  POCKET,

  circlePts(r, n = 96) {
    const out = [];
    for (let it = 0; it < n; it++) out.push(new P2(r * Math.cos(2 * PI * it / n), r * Math.sin(2 * PI * it / n)));
    return out;
  },

  // outline polygon of one part (pulley as a polygon is only used for welded groups)
  outlinePts(b) {
    switch (b.type) {
      case BodyType.RECT: case BodyType.TUBE: case BodyType.SOLENOID: return rectPts(b.w, b.h);
      case BodyType.GEAR: return gearPts(b.teeth, b.module);
      case BodyType.PULLEY: case BodyType.DISC: return Exporter.circlePts(b.w / 2);
      case BodyType.RACK: return rackPts(b);
      case BodyType.RAIL: return rectPts(b.w, b.h);
    }
    return [];
  },

  // union of polygons (for welded pieces). On Android the app supplied it (Path.op);
  // on the web it is a real polygon union (polygon-clipping). Set to null to disable.
  union: polygonUnion,

  build(s, parts, holeDia, bedWidth = 280.0) {
    const notes = [];
    const done = new Set();
    const pieces = [];
    let skippedStock = 0;
    let hasGear = false;

    for (const b of parts) {
      if (done.has(b.id)) continue;
      const whole = s.weldGroupOf(b);
      whole.forEach((it) => done.add(it.id));
      const group = whole.filter((it) => !it.cut);
      const holesB = whole.filter((it) => it.cut === 1), pocketsB = whole.filter((it) => it.cut === 2);
      if (group.length === 0) continue;
      if (group.length === 1 && !holesB.length && (group[0].type === BodyType.RAIL || b.type === BodyType.TUBE || b.type === BodyType.SOLENOID)) { skippedStock++; continue; }
      let main = group[0];
      if (group.length > 0) {
        main = group[0];
        for (const it of group) if (it.boundR() > main.boundR()) main = it;
      }
      const toMain = (m, p) => { const w = m.toWorld(p.x, p.y); return main.toLocal(w.x, w.y); };

      const cuts = [];
      // outline
      const polysOf = (list) => list.map((m) => Exporter.outlinePts(m).map((it) => toMain(m, it)));
      if (holesB.length || pocketsB.length) {
        // cut holes out of the welded outline; inner rings = through cuts, pockets on their own layer
        const solid = polygonClipping.union(...polysOf(group).map(ring));
        const rest = holesB.length ? polygonClipping.difference(solid, ...polysOf(holesB).map(ring)) : solid;
        for (const poly of rest) for (const r of poly) { const pts = unring(r); if (pts.length >= 3) cuts.push(new Poly(pts, OUTLINE)); }
        if (pocketsB.length) {
          const pk = polygonClipping.intersection(rest, polygonClipping.union(...polysOf(pocketsB).map(ring)));
          for (const poly of pk) { const pts = unring(poly[0]); if (pts.length >= 3) cuts.push(new Poly(pts, POCKET)); }
          notes.push(`${main.name}: ${pocketsB.length} pocket(s) on layer POCKET (green in SVG). Set the pocket depth in your CAM software.`);
        }
      } else if (group.length === 1 && (main.type === BodyType.PULLEY || main.type === BodyType.DISC)) {
        cuts.push(new Circ(new P2(0.0, 0.0), main.w / 2, OUTLINE));
      } else if (group.length === 1) {
        cuts.push(new Poly(Exporter.outlinePts(main), OUTLINE));
      } else {
        const polys = group.map((m) => Exporter.outlinePts(m).map((it) => toMain(m, it)));
        const u = Exporter.union != null ? Exporter.union(polys) : null;
        if (u != null && u.length > 0) u.forEach((it) => cuts.push(new Poly(it, OUTLINE)));
        else { polys.forEach((it) => cuts.push(new Poly(it, OUTLINE))); notes.push(`${main.name}: welded parts exported as overlapping outlines.`); }
      }
      if (group.some((it) => it.type === BodyType.GEAR)) hasGear = true;

      // holes and slots
      const ids = new Set(group.map((it) => it.id));
      const holes = [];
      const addHole = (p) => { if (!holes.some((it) => Math.hypot(it.x - p.x, it.y - p.y) < 0.01)) holes.push(p); };
      for (const j of s.joints) {
        const A = s.byId(j.a);
        const B = j.b >= 0 ? s.byId(j.b) : null;
        switch (j.kind) {
          case JointKind.PIN:
            if (A != null && ids.has(A.id)) addHole(toMain(A, new P2(j.ax, j.ay)));
            if (B != null && ids.has(B.id)) addHole(toMain(B, new P2(j.bx, j.by)));
            break;
          case JointKind.SLOT:
            if (A != null && ids.has(A.id)) addHole(toMain(A, new P2(j.ax, j.ay)));
            // groove through the middle of a plate = a slot you cut
            if (B != null && ids.has(B.id) && B.type === BodyType.RECT && Math.abs(j.by) < 1e-6) {
              const x0 = Math.max(j.lo, -B.w / 2 + B.h / 2); const x1 = Math.min(j.hi, B.w / 2 - B.h / 2);
              if (x1 > x0) cuts.push(new Poly(slotPts(x0, x1, 0.0, holeDia).map((it) => toMain(B, it)), HOLES));
            }
            break;
          default: break;
        }
      }
      holes.forEach((it) => cuts.push(new Circ(it, holeDia / 2, HOLES)));
      pieces.push(new Piece(group.length > 1 ? `${main.name} (welded)` : main.name, cuts));
    }

    if (skippedStock > 0) notes.push(`${skippedStock} rail/tube/solenoid part(s) skipped: they're bought, not cut.`);
    if (hasGear) notes.push('Gear teeth are simplified: for working gears use a gear generator with the same teeth and module.');

    // ---------- lay out side by side ----------
    const gap = 6.0;
    let x = 0.0; let y = 0.0; let rowH = 0.0; let maxW = 0.0;
    const placed = [];
    const sorted = pieces.map((p) => [p, bbox(p)]).sort((a, b) => (b[1][3] - b[1][1]) - (a[1][3] - a[1][1])).map((e) => e[0]);
    for (const p of sorted) {
      const bb = bbox(p);
      const w = bb[2] - bb[0]; const h = bb[3] - bb[1];
      if (x > 0 && x + w > bedWidth) { x = 0.0; y += rowH + gap; rowH = 0.0; }
      const dx = x - bb[0]; const dy = y - bb[1];
      placed.push(new Piece(p.name, p.cuts.map((it) => shift(it, dx, dy))));
      x += w + gap;
      rowH = Math.max(rowH, h);
      maxW = Math.max(maxW, x - gap);
    }
    const totalH = placed.length === 0 ? 0.0 : y + rowH;
    if (maxW > 300.0 || totalH > 180.0) notes.push(
      `Layout is ${formatFixed(maxW, 0)} × ${formatFixed(totalH, 0)} mm: bigger than a 300 × 180 mm CNC 3018 bed, cut it in batches.`);
    return new Result(placed, maxW, totalH, notes);
  },

  // DXF R12 (opens in almost every CAM / CAD program). Units: mm. Layers: OUTLINE, HOLES.
  toDxf(r) {
    const sb = [];
    const g = (code, v) => { sb.push(String(code), '\n', v, '\n'); };
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    g(9, '$INSUNITS'); g(70, '4');
    g(9, '$MEASUREMENT'); g(70, '1');
    g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'TABLES');
    g(0, 'TABLE'); g(2, 'LAYER'); g(70, '3');
    for (const [name, color] of [[OUTLINE, '7'], [HOLES, '1'], [POCKET, '3']]) {
      g(0, 'LAYER'); g(2, name); g(70, '0'); g(62, color); g(6, 'CONTINUOUS');
    }
    g(0, 'ENDTAB'); g(0, 'ENDSEC');
    g(0, 'SECTION'); g(2, 'ENTITIES');
    for (const p of r.pieces) for (const c of p.cuts) {
      if (c instanceof Poly) {
        g(0, 'POLYLINE'); g(8, c.layer); g(66, '1'); g(70, '1');
        g(10, '0.0'); g(20, '0.0'); g(30, '0.0');
        for (const pt of c.pts) { g(0, 'VERTEX'); g(8, c.layer); g(10, f(pt.x)); g(20, f(pt.y)); g(30, '0.0'); }
        g(0, 'SEQEND'); g(8, c.layer);
      } else if (c instanceof Circ) {
        g(0, 'CIRCLE'); g(8, c.layer); g(10, f(c.c.x)); g(20, f(c.c.y)); g(30, '0.0'); g(40, f(c.r));
      }
    }
    g(0, 'ENDSEC'); g(0, 'EOF');
    return sb.join('');
  },

  // SVG in real mm (Inkscape, laser software). Outlines black, holes red. Y flipped for SVG.
  toSvg(r) {
    const m = 2.0;
    const w = r.width + 2 * m; const h = r.height + 2 * m;
    const X = (v) => f(v + m);
    const Y = (v) => f(r.height - v + m);
    let sb = '';
    sb += '<?xml version="1.0" encoding="UTF-8"?>\n';
    sb += `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">\n`;
    sb += '<!-- fox9nerMator export, units: mm. Black = outline (inner rings = through cuts), red = holes/slots, green = pockets -->\n';
    for (const p of r.pieces) {
      sb += `<g id="${p.name.replaceAll('"', '')}">\n`;
      for (const c of p.cuts) {
        const col = c.layer === HOLES ? '#ff0000' : c.layer === POCKET ? '#00a000' : '#000000';
        if (c instanceof Poly) {
          sb += `<path fill="none" stroke="${col}" stroke-width="0.1" d="M`;
          c.pts.forEach((pt, i) => { if (i > 0) sb += ' L'; sb += X(pt.x) + ',' + Y(pt.y); });
          sb += ' Z"/>\n';
        } else if (c instanceof Circ) {
          sb += `<circle fill="none" stroke="${col}" stroke-width="0.1" cx="${X(c.c.x)}" cy="${Y(c.c.y)}" r="${f(c.r)}"/>\n`;
        }
      }
      sb += '</g>\n';
    }
    sb += '</svg>\n';
    return sb;
  },
};
