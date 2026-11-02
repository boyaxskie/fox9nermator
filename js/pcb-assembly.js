// Assembly print + parts list (BOM): which part goes in which holes, and what to buy.
// PDF at exact 1:1 (seen from the parts side, like you hold the board while soldering), BOM on the same sheet or page 2.
import { analyze, footprintOf, onBoard, padCapsule, FOOTPRINTS } from './pcb-core.js';
import { rotPt, isBoard } from './sch-core.js';
import { si } from './num.js';

// PDF text is plain ASCII (built-in Helvetica)
const ascii = (s) => String(s).replace(/Ω/g, '').replace(/[µμ]/g, 'u').replace(/[−–—]/g, '-').replace(/×/g, 'x').replace(/°/g, ' deg').replace(/[^\x20-\x7E]/g, '');
const compact = (v, unit = '') => ascii(si(v, unit, 3)).replace(/\s+/g, '');

export function partValue(p) {
  const q = p.props;
  switch (p.type) {
    case 'R': return compact(q.r) + (q.rating && q.rating !== 0.25 ? ` ${q.rating}W` : '');
    case 'POT': return compact(q.r) + ' pot';
    case 'C': return compact(q.c, 'F') + (q.vmax ? ` ${q.vmax}V` : '') + (q.polar ? ' elec.' : '');
    case 'L': return compact(q.l, 'H');
    case 'LED': return `LED ${q.color ?? ''}`.trim();
    case 'ZD': return `zener ${q.model ?? compact(q.vz, 'V')}`;
    case 'BAT': return `supply ${compact(q.v, 'V')} (terminal)`;
    case 'LAMP': return `lamp ${compact(q.vr, 'V')} ${compact(q.wr, 'W')}`;
    case 'SW': return 'switch'; case 'PB': return 'push button'; case 'SPDT': return 'SPDT switch'; case 'DPDT': return 'DPDT switch';
    case 'SIG': return 'signal in (header)';
    case 'RELAY': return `relay ${q.relay ?? `${q.vcoil}V coil`}`;
    case 'XFMR': return `transformer ${q.n1}+${q.n2}:${q.ns}`;
    case 'ESP32': return 'ESP32 DevKit 30-pin (+ 2x15 female headers)';
    case 'UNO': return 'Arduino UNO (shield headers)';
    case 'SERVO': return `servo ${q.model} (3-pin header)`;
    case 'STEPPER': return 'A4988 module (+ 2x8 female headers)';
    case 'OPTO': return 'PC817';
    case 'SR595': return q.model ?? '74HC595';
    case 'TL494': return `${q.model ?? 'TL494C'} (DIP-16, use a socket)`;
    case 'RMOD': return `relay module 5V 1ch (${q.trig === 'high' ? 'HIGH' : 'LOW'} trigger)`;
    case 'ENC': return 'rotary encoder KY-040 (5-pin header)';
    case 'OLED': return 'OLED 0.96in SSD1306 I2C (4-pin header)';
    case 'LCD': return 'LCD 16x2 + I2C backpack (4-pin header)';
    case 'ISRC': return 'current source';
    default: return q.model ?? p.type;
  }
}

function bomRows(c) {
  const L = c.pcb, groups = new Map();
  for (const p of c.parts) {
    if (!onBoard(p) || !L.parts[p.id]) continue;
    const f = footprintOf(p, L.parts[p.id]);
    const val = partValue(p), pkg = ascii(FOOTPRINTS[f.key]?.label ?? f.key), k = val + '|' + pkg;
    const g = groups.get(k) ?? { val, pkg, refs: [] }; g.refs.push(ascii(p.name)); groups.set(k, g);
  }
  const rows = [...groups.values()].sort((a, b) => a.refs[0].localeCompare(b.refs[0], undefined, { numeric: true }));
  const nj = (L.jumpers ?? []).length;
  if (nj) rows.push({ val: 'jumper wire (parts side)', pkg: 'wire', refs: [...Array(nj)].map((_, i) => 'J' + (i + 1)) });
  return rows;
}

export function bomCsv(c) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  return ['Qty,Reference,Value,Package', ...bomRows(c).map(r => [r.refs.length, q(r.refs.join(' ')), q(r.val), q(r.pkg)].join(','))].join('\r\n') + '\r\n';
}

// ---------- tiny multi-page PDF writer ----------
function pdf(pages, pw, ph) {
  const k = 72 / 25.4, P = (v) => (Math.round(v * 1000) / 1000).toString();
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', null, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  const kids = [];
  for (const ops of pages) {
    const s = ops.join('\n');
    objs.push(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${P(pw * k)} ${P(ph * k)}] /Contents ${objs.length} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`);
    kids.push(`${objs.length} 0 R`);
  }
  objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  return out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}

export function assemblyPdf(c, title = 'board') {
  const L = c.pcb, an = analyze(c), k = 72 / 25.4, P = (v) => (Math.round(v * 1000) / 1000).toString();
  const pw = Math.max(210, L.w + 30), mx = 15, my = 30;
  const rows = bomRows(c), rowH = 5.2, bomH = 14 + rows.length * rowH;
  const boardBlock = L.h + 22;
  const one = my + boardBlock + bomH + 10 <= 297;
  const ph = Math.max(297, my + boardBlock + 10);
  const page1 = [], page2 = [];
  const txt = (ops, x, y, size, s, bold = false) => ops.push('BT', `/${bold ? 'F2' : 'F1'} ${size} Tf`, `${P(x * k)} ${P((ph - y) * k)} Td`, `(${ascii(s).replace(/[\\()]/g, (m) => '\\' + m)}) Tj`, 'ET');
  const ops = page1;
  txt(ops, mx, 13, 12, `Fox9nertron assembly - ${title} - board ${+L.w.toFixed(2)} x ${+L.h.toFixed(2)} mm`, true);
  txt(ops, mx, 19, 9, 'Seen from the PARTS side (top), 1:1. Print at 100 % / Actual size: the ruler under the board must be 50 mm.');
  txt(ops, mx, 24, 9, 'Square pad = pin 1 / + / anode. Solder the low parts first (resistors, diodes), then sockets and headers, then the tall parts.');
  ops.push('q', `${P(k)} 0 0 ${P(-k)} ${P(mx * k)} ${P((ph - my) * k)} cm`, '1 J 1 j');
  ops.push('0 G 0.25 w', `0 0 ${P(L.w)} ${P(L.h)} re S`);
  // pads (outline only, so names stay readable)
  ops.push('0.45 G 0.15 w');
  for (const pd of an.pads) {
    if (pd.shape === 'rect') { ops.push(`${P(pd.x - pd.w / 2)} ${P(pd.y - pd.h / 2)} ${P(pd.w)} ${P(pd.h)} re S`); continue; }
    const cp = padCapsule(pd);
    ops.push(`${P(2 * cp.r)} w 0.75 G ${P(cp.x1)} ${P(cp.y1)} m ${P(cp.x2 + 1e-3)} ${P(cp.y2)} l S 0.15 w 0.45 G`);
  }
  // part outlines
  ops.push('0 G 0.3 w');
  for (const p of c.parts) {
    const bp = L.parts[p.id]; if (!bp || !onBoard(p)) continue;
    const f = footprintOf(p, bp);
    for (const b of f.body) { if (b.length < 2) continue; ops.push(b.map((q, i) => { const [x, y] = rotPt(q, bp.rot); return `${P(bp.x + x)} ${P(bp.y + y)} ${i ? 'l' : 'm'}`; }).join(' ') + ' S'); }
  }
  // jumper wires
  ops.push('0.2 0.4 0.9 RG 0.5 w');
  (L.jumpers ?? []).forEach(j => ops.push(`${P(j.x1)} ${P(j.y1)} m ${P(j.x2)} ${P(j.y2)} l S`));
  // 50 mm ruler
  const ry = L.h + 10;
  ops.push('0 G 0.3 w', `0 ${P(ry)} m 50 ${P(ry)} l S`);
  for (let t = 0; t <= 50; t += 5) ops.push(`${t} ${P(ry)} m ${t} ${P(ry - (t % 10 ? 1.5 : 3))} l S`);
  ops.push('Q');
  txt(ops, mx + 51, my + ry + 1, 8, '50 mm');
  // names + values on the parts
  for (const p of c.parts) {
    const bp = L.parts[p.id]; if (!bp || !onBoard(p)) continue;
    const big = isBoard(p.type) || p.type === 'STEPPER';
    txt(ops, mx + bp.x - 2, my + bp.y - (big ? 2 : 0.4), big ? 9 : 7, p.name, true);
    if (!big) txt(ops, mx + bp.x - 2, my + bp.y + 2.4, 5.5, partValue(p).slice(0, 22));
  }
  (L.jumpers ?? []).forEach((j, i) => txt(ops, mx + (j.x1 + j.x2) / 2, my + (j.y1 + j.y2) / 2 - 0.6, 6, 'J' + (i + 1)));
  // parts list
  const bops = one ? page1 : page2, y0 = one ? my + boardBlock + 4 : 20;
  txt(bops, mx, y0, 11, `Parts list (${rows.reduce((s, r) => s + r.refs.length, 0)} parts)`, true);
  const cols = [mx, mx + 10, mx + 62, mx + 128];
  txt(bops, cols[0], y0 + 7, 8, 'Qty', true); txt(bops, cols[1], y0 + 7, 8, 'Reference', true); txt(bops, cols[2], y0 + 7, 8, 'Value', true); txt(bops, cols[3], y0 + 7, 8, 'Package', true);
  rows.forEach((r, i) => {
    const y = y0 + 7 + (i + 1) * rowH;
    txt(bops, cols[0], y, 8, String(r.refs.length)); txt(bops, cols[1], y, 8, r.refs.join(' ').slice(0, 34)); txt(bops, cols[2], y, 8, r.val.slice(0, 44)); txt(bops, cols[3], y, 7, r.pkg.slice(0, 40));
  });
  return pdf(one ? [page1] : [page1, page2], pw, ph);
}
