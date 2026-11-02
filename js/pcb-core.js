// PCB core: footprints, netlist from the schematic, board layout, connectivity, DRC.
// Units: mm. Board coords: x right, y DOWN (like the screen), origin = board top-left.
// Single-sided board: copper on the BOTTOM, parts on top. The view is from the top (parts side).
import { TYPES, pinsOf, wirePieces, key, rotPt, BOARDS, isBoard } from './sch-core.js';

// ---------- footprints ----------
const PITCH = 2.54;
const th = (x, y, pin, d = 1.8, drill = 0.8, shape = 'round', w = d, h = d) => ({ x, y, pin, shape, w, h, drill });
const smd = (x, y, pin, w, h) => ({ x, y, pin, shape: 'rect', w, h, drill: 0 });
const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
const circ = (r, cx = 0, cy = 0, n = 28) => Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos(i / n * 2 * Math.PI), cy + r * Math.sin(i / n * 2 * Math.PI)]);
const square1 = (pads) => { const p = pads.find(q => q.pin === 0 && q.drill); if (p) p.shape = 'rect'; return pads; };

// letter → schematic pin index, for 3-pin packages
export const PIN_LETTERS = { NPN: { B: 0, C: 1, E: 2 }, PNP: { B: 0, C: 1, E: 2 }, NMOS: { G: 0, D: 1, S: 2 }, PMOS: { G: 0, D: 1, S: 2 }, REG: { I: 0, O: 1, G: 2 } };
export const ORDERS = {
  NPN: ['EBC', 'CBE', 'BCE', 'ECB'], PNP: ['EBC', 'CBE', 'BCE', 'ECB'],
  NMOS: ['GDS', 'SGD', 'GSD', 'DGS'], PMOS: ['GDS', 'SGD', 'GSD', 'DGS'], REG: ['IGO', 'GOI', 'OGI', 'IOG'],
};
// key → { label, n (pins), make(order, opts) }
export const FOOTPRINTS = {
  AX300: { label: 'Axial 7.62 mm (300 mil)', n: 2, make: (o) => ({ pads: square1([th(-3.81, 0, 0, 1.8, o.drill ?? 0.8), th(3.81, 0, 1, 1.8, o.drill ?? 0.8)]), body: [box(-2.2, -1, 2.2, 1)] }) },
  AX400: { label: 'Axial 10.16 mm (400 mil)', n: 2, make: (o) => ({ pads: square1([th(-5.08, 0, 0, 1.8, o.drill ?? 0.8), th(5.08, 0, 1, 1.8, o.drill ?? 0.8)]), body: [box(-3.2, -1.2, 3.2, 1.2)] }) },
  AX500: { label: 'Axial 12.7 mm (500 mil)', n: 2, make: (o) => ({ pads: square1([th(-6.35, 0, 0, 2, o.drill ?? 1)]).concat([th(6.35, 0, 1, 2, o.drill ?? 1)]), body: [box(-4.2, -1.6, 4.2, 1.6)] }) },
  // standing (upright) resistor / diode: body sits on hole 1, the other leg bends down next to it
  UP254: { label: 'Upright (standing) 2.54 mm', n: 2, make: (o) => ({ pads: square1([th(-1.27, 0, 0, 1.6, o.drill ?? 0.8), th(1.27, 0, 1, 1.6, o.drill ?? 0.8)]), body: [circ(1.35, -1.27, 0), [[-1.27, -1.35], [1.27, -1.35], [1.27, -0.8]]] }) },
  UP508: { label: 'Upright (standing) 5.08 mm', n: 2, make: (o) => ({ pads: square1([th(-2.54, 0, 0, 1.8, o.drill ?? 0.8), th(2.54, 0, 1, 1.8, o.drill ?? 0.8)]), body: [circ(1.5, -2.54, 0), [[-2.54, -1.5], [2.54, -1.5], [2.54, -0.9]]] }) },
  RAD25: { label: 'Radial 2.54 mm (small cap)', n: 2, make: () => ({ pads: square1([th(-1.27, 0, 0, 1.6, 0.8), th(1.27, 0, 1, 1.6, 0.8)]), body: [circ(2.6)] }) },
  RAD50: { label: 'Radial 5.08 mm (big cap)', n: 2, make: () => ({ pads: square1([th(-2.54, 0, 0, 1.8, 0.9), th(2.54, 0, 1, 1.8, 0.9)]), body: [circ(5)] }) },
  LED5: { label: 'LED 5 mm', n: 2, make: () => ({ pads: square1([th(-1.27, 0, 0, 1.6, 0.8), th(1.27, 0, 1, 1.6, 0.8)]), body: [circ(2.7).slice(3, 26)] }) },
  TERM2: { label: 'Screw terminal 2-pin 5.08 mm', n: 2, make: () => ({ pads: square1([th(-2.54, 0, 0, 2.6, 1.3), th(2.54, 0, 1, 2.6, 1.3)]), body: [box(-5, -4, 5, 4)] }) },
  HDR2: { label: 'Pin header 2-pin', n: 2, make: () => ({ pads: square1([th(-1.27, 0, 0, 1.8, 1.0), th(1.27, 0, 1, 1.8, 1.0)]), body: [box(-2.54, -1.27, 2.54, 1.27)] }) },
  HDR3: { label: 'Pin header 3-pin', n: 3, make: (o) => { const m = o.map ?? [0, 1, 2]; return { pads: square1([th(-2.54, 0, m[0], 1.8, 1.0), th(0, 0, m[1], 1.8, 1.0), th(2.54, 0, m[2], 1.8, 1.0)]), body: [box(-3.81, -1.27, 3.81, 1.27)] }; } },
  HDR2x3: { label: 'Header 2×3 (DPDT)', n: 6, make: () => ({ pads: square1([th(-2.54, -1.27, 1, 1.8, 1.0), th(0, -1.27, 0, 1.8, 1.0), th(2.54, -1.27, 2, 1.8, 1.0), th(-2.54, 1.27, 4, 1.8, 1.0), th(0, 1.27, 3, 1.8, 1.0), th(2.54, 1.27, 5, 1.8, 1.0)]), body: [box(-3.81, -2.54, 3.81, 2.54)] }) },
  TACT6: { label: 'Tactile button 6 mm', n: 2, make: () => ({ pads: [th(-3.25, -2.25, 0, 1.8, 1.0), th(3.25, -2.25, 0, 1.8, 1.0), th(-3.25, 2.25, 1, 1.8, 1.0), th(3.25, 2.25, 1, 1.8, 1.0)], body: [box(-3, -3, 3, 3), circ(1.7)] }) },
  POT3: { label: 'Trimpot / pot 3-pin inline', n: 3, make: () => ({ pads: [th(-2.54, 0, 0, 1.8, 1.0), th(0, 0, 2, 1.8, 1.0), th(2.54, 0, 1, 1.8, 1.0)], body: [box(-4.8, -4.8, 4.8, 1.6)] }) },
  TO92: { label: 'TO-92 (legs 2.54 mm)', n: 3, ordered: true, make: (o) => ({ pads: o.order.map((idx, k) => th((k - 1) * PITCH, 0, idx, 1.6, 0.8)), body: [[[-2.4, 1.2], [2.4, 1.2]], circ(2.5, 0, -0.2).slice(15, 29).concat(circ(2.5, 0, -0.2).slice(0, 1))] }) },
  TO220: { label: 'TO-220 (standing)', n: 3, ordered: true, make: (o) => ({ pads: o.order.map((idx, k) => th((k - 1) * PITCH, 0, idx, 1.9, 1.1, 'oval', 1.8, 2.6)), body: [box(-5.1, -3.3, 5.1, 1.5), [[-5.1, -2.1], [5.1, -2.1]]] }) },
  SOT23: { label: 'SOT-23 (SMD)', n: 3, ordered: true, make: (o) => ({ pads: [smd(-0.95, 1.1, o.order[0], 0.9, 1.1), smd(0.95, 1.1, o.order[1], 0.9, 1.1), smd(0, -1.1, o.order[2], 0.9, 1.1)], body: [box(-1.5, -0.7, 1.5, 0.7)] }) },
  SOT223: { label: 'SOT-223 (SMD)', n: 3, ordered: true, make: (o) => ({ pads: [smd(-2.3, 3.2, o.order[0], 1.1, 2), smd(0, 3.2, o.order[1], 1.1, 2), smd(2.3, 3.2, o.order[2], 1.1, 2), smd(0, -3.2, o.order[1], 3.4, 2)], body: [box(-3.3, -1.8, 3.3, 1.8)] }) },
  DIP4: { label: 'DIP-4 (PC817)', n: 4, make: () => ({ pads: square1([th(-3.81, -1.27, 0, 1.7, 0.8, 'oval', 2.2, 1.6), th(-3.81, 1.27, 1, 1.7, 0.8, 'oval', 2.2, 1.6), th(3.81, 1.27, 3, 1.7, 0.8, 'oval', 2.2, 1.6), th(3.81, -1.27, 2, 1.7, 0.8, 'oval', 2.2, 1.6)]), body: [box(-2.6, -2.6, 2.6, 2.6)] }) },
  // dual op-amp, unit A: 1 OUT, 2 IN−, 3 IN+, 4 V−, 8 V+ (5–7 = unit B, left free)
  DIP8: { label: 'DIP-8 (dual op-amp, unit A)', n: 5, make: () => {
    const map = { 1: 2, 2: 1, 3: 0, 4: 4, 8: 3 };
    const pads = [];
    for (let n = 1; n <= 8; n++) { const x = n <= 4 ? -3.81 : 3.81, y = n <= 4 ? -3.81 + (n - 1) * PITCH : 3.81 - (n - 5) * PITCH; pads.push({ ...th(x, y, map[n] ?? -1, 1.7, 0.8, n === 1 ? 'rect' : 'oval', 2.2, 1.6), num: n }); }
    return { pads, body: [box(-2.6, -5, 2.6, 5)] };
  } },
  DIP16: { label: 'DIP-16 (0.3")', n: 16, make: () => {
    const pads = [];
    for (let n = 1; n <= 16; n++) { const x = n <= 8 ? -3.81 : 3.81, y = n <= 8 ? -8.89 + (n - 1) * PITCH : 8.89 - (n - 9) * PITCH; pads.push({ ...th(x, y, n - 1, 1.7, 0.8, n === 1 ? 'rect' : 'oval', 2.2, 1.6), num: n }); }
    return { pads, body: [box(-2.6, -10.2, 2.6, 10.2)] };
  } },
  // 1-channel relay module: 3-pin header (VCC GND IN) + 3-way screw terminal 5.08 mm (NO COM NC), wire both to the module
  RMOD6: { label: 'Relay module: header VCC GND IN + terminal NO COM NC', n: 6, make: () => ({ pads: square1([th(-2.54, 0, 0, 1.8, 1.0), th(0, 0, 1, 1.8, 1.0), th(2.54, 0, 2, 1.8, 1.0), th(-5.08, 7, 4, 2.6, 1.3), th(0, 7, 3, 2.6, 1.3), th(5.08, 7, 5, 2.6, 1.3)]), body: [box(-3.81, -1.27, 3.81, 1.27), box(-7.6, 3.5, 7.6, 10.5)] }) },
  DIP8N: { label: 'DIP-8 (pin 1…8 in order)', n: 8, make: () => {
    const pads = [];
    for (let n = 1; n <= 8; n++) { const x = n <= 4 ? -3.81 : 3.81, y = n <= 4 ? -3.81 + (n - 1) * PITCH : 3.81 - (n - 5) * PITCH; pads.push({ ...th(x, y, n - 1, 1.7, 0.8, n === 1 ? 'rect' : 'oval', 2.2, 1.6), num: n }); }
    return { pads, body: [box(-2.6, -5, 2.6, 5)] };
  } },
  // ESP32 DevKit 30-pin: two rows of 15 (2.54 mm pitch). Row spacing differs between makers: measure yours.
  DK30W: { label: 'ESP32 DevKit 30-pin, rows 25.4 mm (1")', n: 30, make: () => devkit(25.4) },
  DK30N: { label: 'ESP32 DevKit 30-pin, rows 22.86 mm (0.9")', n: 30, make: () => devkit(22.86) },
  // Arduino UNO R3 shield headers (the board plugs on top)
  UNOSH: { label: 'Arduino UNO shield headers', n: 25, make: () => unoShield() },
  // Pololu-style A4988 carrier, 2 × 8 pins, rows 12.7 mm apart. RST + SLP go to VDD; MS pins to VDD as set; motor coil pins left free
  A4988: { label: 'A4988 / DRV8825 module socket', n: 6, make: (o) => {
    const m = o.micro ?? 1, ms = { 1: [], 2: [1], 4: [2], 8: [1, 2], 16: [1, 2, 3] }[m] ?? [];
    const L = ['EN', 'MS1', 'MS2', 'MS3', 'RST', 'SLP', 'STEP', 'DIR'], R = ['VMOT', 'GND', '2B', '2A', '1A', '1B', 'VDD', 'GND'];
    const idx = { STEP: 0, DIR: 1, EN: 2, VDD: 3, GND: 4, VMOT: 5, RST: 3, SLP: 3 };
    const pads = [];
    L.forEach((n, k) => pads.push({ ...th(-6.35, (k - 3.5) * PITCH, n.startsWith('MS') ? (ms.includes(+n[2]) ? 3 : -1) : idx[n] ?? -1, 1.8, 1.0, k === 0 ? 'rect' : 'round'), name: n }));
    R.forEach((n, k) => pads.push({ ...th(6.35, (k - 3.5) * PITCH, idx[n] ?? -1, 1.8, 1.0), name: n }));
    return { pads, body: [box(-7.6, -10.2, 7.6, 10.2)] };
  } },
  // small mains / inverter transformer: primary P1, CT, P2 on one side, secondary S1, S2 on the other, 10 mm apart (high voltage gap)
  XF5: { label: 'Transformer 5-pin (P1 CT P2 | S1 S2)', n: 5, make: () => ({ pads: square1([th(-7.5, -5, 0, 2.6, 1.2), th(-7.5, 0, 1, 2.6, 1.2), th(-7.5, 5, 2, 2.6, 1.2), th(7.5, -5, 3, 2.6, 1.2), th(7.5, 5, 4, 2.6, 1.2)]), body: [box(-10.5, -9, 10.5, 9), [[0, -9], [0, 9]]] }) },
  HDR8: { label: 'Pin header 8-pin (keypad R1-R4 C1-C4)', n: 8, make: () => ({ pads: square1([...Array(8)].map((_, k) => th((k - 3.5) * PITCH, 0, k, 1.8, 1.0))), body: [box(-10.4, -1.27, 10.4, 1.27)] }) },
  // LCD I2C backpack header: GND VCC SDA SCL in a row (fits a 4-pin female header or the wires to the LCD)
  HDR5: { label: 'Pin header 5-pin', n: 5, make: () => ({ pads: square1([...Array(5)].map((_, k) => th((k - 2) * PITCH, 0, k, 1.8, 1.0))), body: [box(-6.35, -1.27, 6.35, 1.27)] }) },
  HDR4: { label: 'Pin header 4-pin', n: 4, make: () => ({ pads: square1([th(-3.81, 0, 0, 1.8, 1.0), th(-1.27, 0, 1, 1.8, 1.0), th(1.27, 0, 2, 1.8, 1.0), th(3.81, 0, 3, 1.8, 1.0)]), body: [box(-5.08, -1.27, 5.08, 1.27)] }) },
  // 0.56" single digit (5161AS / 5161BS): top row 10 g · 9 f · 8 COM · 7 a · 6 b, bottom row 1 e · 2 d · 3 COM · 4 c · 5 dp, rows 15.24 mm apart
  SEG10: { label: '7-segment 0.56" (10 pins, 5161)', n: 9, make: () => {
    const top = [6, 5, 8, 0, 1], bot = [4, 3, 8, 2, 7], pads = [];
    bot.forEach((pin, k) => pads.push({ ...th((k - 2) * PITCH, 7.62, pin, 1.8, 0.9, k === 0 ? 'rect' : 'round'), num: k + 1 }));
    top.forEach((pin, k) => pads.push({ ...th((k - 2) * PITCH, -7.62, pin, 1.8, 0.9), num: 10 - k }));
    return { pads, body: [box(-6.25, -9.5, 6.25, 9.5)] };
  } },
  // SRD-05VDC-SL-C style relay (check against your relay's datasheet)
  SRD: { label: 'Relay SRD (Songle) 5-pin', n: 5, make: () => ({ pads: [th(-6, -2, 0, 2.2, 1.2), th(-6, 10, 1, 2.2, 1.2), th(-8, 4, 2, 2.4, 1.3), th(6.2, -2, 3, 2.4, 1.3), th(6.2, 10, 4, 2.4, 1.3)], body: [box(-9.8, -4.3, 9.2, 11.2)] }) },
};
// lead spacings (mm) you can choose for 2-leg parts (bent legs)
const AXS = [7.62, 10.16, 12.7, 15.24, 17.78, 20.32, 22.86, 25.4], RADS = [2.54, 5.08, 7.62, 10.16];
export const SPACINGS = { AX300: AXS, AX400: AXS, AX500: AXS, RAD25: RADS, RAD50: RADS, LED5: RADS };
function devkit(w) {
  const pads = [];
  for (let i = 0; i < 15; i++) { const y = (i - 7) * PITCH; pads.push(th(-w / 2, y, i, 1.8, 1.0, i === 0 ? 'rect' : 'round'), th(w / 2, y, 15 + i, 1.8, 1.0)); }
  return { pads, body: [box(-w / 2 - 2.2, -26, w / 2 + 2.2, 26), box(-4, 20, 4, 26.5), [[-w / 2 - 2.2, -12], [w / 2 + 2.2, -12]]] };
}
function unoShield() {
  // positions in inches from the UNO's lower-left corner (Arduino shield layout), board centre at (1.35", 1.05")
  const B = BOARDS.UNO.pins.map(q => q.n), ix = (n) => B.indexOf(n);
  const at = (xi, yi) => [(xi - 1.35) * 25.4, -(yi - 1.05) * 25.4];
  const pads = [];
  const put = (xi, yi, name, sq) => { const [x, y] = at(xi, yi); pads.push(th(x, y, name == null ? -1 : ix(name), 1.8, 1.0, sq ? 'rect' : 'round')); };
  // digital D0–D7 (right), D8–D13 + GND, AREF, SDA, SCL (left, 0.16" gap between D7 and D8)
  for (let d = 0; d <= 7; d++) put(2.6 - d * 0.1, 2.0, 'D' + d, d === 0);
  ['D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'GND', null, 'A4', 'A5'].forEach((n, k) => put(1.74 - k * 0.1, 2.0, n));
  // power header: NC, IOREF, RESET, 3.3V, 5V, GND, GND, VIN · analog A0–A5
  [null, '5V', null, '3V3', '5V', 'GND', 'GND2', 'VIN'].forEach((n, k) => put(1.04 + k * 0.1, 0.1, n));
  ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].forEach((n, k) => put(2.0 + k * 0.1, 0.1, n));
  return { pads, body: [box(-34.29, -26.67, 34.29, 26.67), box(-38.5, 13, -27, 25), box(-36, -20, -27, -11)] };
}
const PCB_SKIP = new Set(['GND', 'VM', 'SCOPE', 'AM']);
export const onBoard = (p) => !PCB_SKIP.has(p.type);
export function fpChoices(p) {
  const n = TYPES[p.type].pins.length;
  if (p.type === 'OPAMP') return ['DIP8'];
  if (p.type === 'OPTO') return ['DIP4'];
  if (p.type === 'T555') return ['DIP8N'];
  if (p.type === 'SERVO') return ['HDR3'];
  if (p.type === 'STEPPER') return ['A4988'];
  if (p.type === 'ESP32') return ['DK30W', 'DK30N'];
  if (p.type === 'UNO') return ['UNOSH'];
  if (p.type === 'RELAY') return ['SRD'];
  if (p.type === 'XFMR') return ['XF5'];
  if (p.type === 'LCD' || p.type === 'OLED') return ['HDR4'];
  if (p.type === 'DHT' || p.type === 'PIR') return ['HDR3'];
  if (p.type === 'HCSR04') return ['HDR4'];
  if (p.type === 'KEYPAD') return ['HDR8'];
  if (p.type === 'ENC') return ['HDR5'];
  if (p.type === 'SR595' || p.type === 'TL494') return ['DIP16'];
  if (p.type === 'RMOD') return ['RMOD6'];
  if (p.type === 'SEG7') return ['SEG10'];
  if (p.type === 'DPDT') return ['HDR2x3'];
  if (p.type === 'PB') return ['TACT6', 'HDR2', 'TERM2'];
  if (p.type === 'POT') return ['POT3', 'HDR3'];
  if (p.type === 'SPDT') return ['HDR3'];
  if (n === 3) return ['TO92', 'TO220', 'SOT23', 'SOT223'].filter(k => p.type !== 'REG' || k !== 'TO92');
  return ['AX300', 'AX400', 'AX500', 'UP254', 'UP508', 'RAD25', 'RAD50', 'LED5', 'TERM2', 'HDR2'];
}
export function defaultFp(p) {
  const q = p.props, m = q.model ?? '';
  switch (p.type) {
    case 'R': return { fp: 'AX400' };
    case 'D': return { fp: 'AX400', drill: /4007|5408|5819/.test(m) ? 1.0 : 0.8 };
    case 'ZD': return { fp: 'AX300' };
    case 'LED': return { fp: 'LED5' };
    case 'C': return { fp: q.c >= 100e-6 ? 'RAD50' : 'RAD25' };
    case 'L': return { fp: q.l >= 5e-3 ? 'TERM2' : 'AX400' };
    case 'LDR': return { fp: 'RAD50' };
    case 'BUZZER': return { fp: 'RAD50' };
    case 'LOCK': return { fp: 'TERM2' };
    case 'BAT': case 'LAMP': return { fp: 'TERM2' };
    case 'SIG': case 'ISRC': case 'SW': return { fp: 'HDR2' };
    case 'SPDT': return { fp: 'HDR3', map: [1, 0, 2] };
    case 'SERVO': return { fp: 'HDR3', map: [2, 1, 0] };
    case 'NPN': case 'PNP': return /^TIP/.test(m) ? { fp: 'TO220', order: 'BCE' } : /^BC5/.test(m) ? { fp: 'TO92', order: 'CBE' } : { fp: 'TO92', order: 'EBC' };
    case 'NMOS': case 'PMOS': return /^AO34/.test(m) ? { fp: 'SOT23', order: 'GSD' } : m === '2N7000' ? { fp: 'TO92', order: 'SGD' } : { fp: 'TO220', order: 'GDS' };
    case 'REG': return /^AMS1117/.test(m) ? { fp: 'SOT223', order: 'GOI' } : m === 'LM317' ? { fp: 'TO220', order: 'GOI' } : { fp: 'TO220', order: 'IGO' };
    default: return { fp: fpChoices(p)[0] };
  }
}
// footprint (local pads + body) for a part, using its board settings
// DIY big pads (default ON): more copper to solder on CNC-milled boards. Pads in a tight row become ovals that grow
// across the row (the gap to the next pin stays the same), lone pads become 2.4 mm round. Set by analyze() from c.pcb.rules.bigPads.
let BIG = true;
export const setBigPads = (v) => { BIG = v !== false; };
function bigPads(pads) {
  const th2 = pads.filter(q => q.drill > 0);
  for (const pd of th2) {
    let fx = Infinity, fy = Infinity;
    for (const q of th2) { if (q === pd) continue; const dx = Math.abs(q.x - pd.x), dy = Math.abs(q.y - pd.y); if (dy < 0.6 && dx > 0.01) fx = Math.min(fx, dx); if (dx < 0.6 && dy > 0.01) fy = Math.min(fy, dy); if (dx >= 0.6 && dy >= 0.6 && Math.hypot(dx, dy) < 3.2) { fx = Math.min(fx, dx); fy = Math.min(fy, dy); } }
    const short = Math.min(pd.w, pd.h), longMax = 3.0;
    if (fx >= 4 && fy >= 4) { if (pd.shape === 'round' && pd.w < 2.4) pd.w = pd.h = 2.4; else if (pd.shape !== 'round') { pd.w = Math.max(pd.w, 2.4); pd.h = Math.max(pd.h, 2.4); } continue; }
    if (fx >= 3.8 && fx > fy) { const L = Math.min(longMax, fx - 0.8); if (L > pd.w) { pd.w = L; pd.h = short; if (pd.shape === 'round') pd.shape = 'oval'; } }
    else if (fy >= 3.8 && fy > fx) { const L = Math.min(longMax, fy - 0.8); if (L > pd.h) { pd.h = L; pd.w = short; if (pd.shape === 'round') pd.shape = 'oval'; } }
  }
  return pads;
}
export function footprintOf(p, bp = {}, big = BIG) {
  const d = defaultFp(p);
  let fpKey = bp.fp && FOOTPRINTS[bp.fp] && fpChoices(p).includes(bp.fp) ? bp.fp : d.fp;
  const F = FOOTPRINTS[fpKey];
  const letters = PIN_LETTERS[p.type];
  let order = [0, 1, 2];
  if (F.ordered && letters) { const s = (bp.order && ORDERS[p.type].includes(bp.order)) ? bp.order : (d.order ?? ORDERS[p.type][0]); order = [...s].map(ch => letters[ch]); }
  const made = F.make({ order, drill: bp.drill ?? d.drill, map: d.map, micro: p.props.micro });
  // lead spacing (hole to hole) set by hand: bend the legs wider so traces fit underneath
  const sp = SPACINGS[fpKey], nat = made.pads.length === 2 ? Math.abs(made.pads[1].x - made.pads[0].x) : 0;
  let pitch = nat;
  if (sp && bp.pitch && sp.includes(bp.pitch)) { pitch = bp.pitch; made.pads[0].x = -pitch / 2; made.pads[1].x = pitch / 2; }
  if (big) bigPads(made.pads);
  return { key: fpKey, ...made, pitch: sp ? Math.round(pitch * 100) / 100 : null, orderStr: F.ordered && letters ? [...order].map(i => Object.keys(letters).find(k => letters[k] === i)).join('') : null };
}
// pad name shown on the board
export function pinLabel(p, i) {
  if (isBoard(p.type)) return BOARDS[p.type].pins[i]?.n ?? String(i + 1);
  const L = { BAT: ['+', '−'], LED: ['A', 'K'], D: ['A', 'K'], ZD: ['A', 'K'], C: ['+', '−'], NPN: ['B', 'C', 'E'], PNP: ['B', 'C', 'E'], NMOS: ['G', 'D', 'S'], PMOS: ['G', 'D', 'S'],
    OPAMP: ['IN+', 'IN−', 'OUT', 'V+', 'V−'], REG: ['IN', 'OUT', p.props.model === 'LM317' ? 'ADJ' : 'GND'], RELAY: ['A1', 'A2', 'COM', 'NC', 'NO'], T555: ['GND', 'TRIG', 'OUT', 'RST', 'CV', 'THR', 'DIS', 'VCC'], SERVO: ['SIG', 'V+', 'GND'], LCD: ['GND', 'VCC', 'SDA', 'SCL'], OLED: ['GND', 'VCC', 'SCL', 'SDA'], ENC: ['CLK', 'DT', 'SW', '+', 'GND'], SR595: ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'GND', "QH'", 'SRCLR', 'SRCLK', 'RCLK', 'OE', 'SER', 'QA', 'VCC'], TL494: ['1IN+', '1IN−', 'FB', 'DTC', 'CT', 'RT', 'GND', 'C1', 'E1', 'E2', 'C2', 'VCC', 'OC', 'REF', '2IN−', '2IN+'], RMOD: ['VCC', 'GND', 'IN', 'COM', 'NO', 'NC'], DHT: ['VCC', 'DATA', 'GND'], HCSR04: ['VCC', 'TRIG', 'ECHO', 'GND'], PIR: ['VCC', 'OUT', 'GND'], KEYPAD: ['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'], BUZZER: ['+', '-'], SEG7: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp', 'COM'], STEPPER: ['STEP', 'DIR', 'EN', 'VDD', 'GND', 'VMOT'], OPTO: ['A', 'K', 'C', 'E'], POT: ['1', '3', 'W'], SIG: ['+', '−'] }[p.type];
  return L?.[i] ?? String(i + 1);
}

// ---------- netlist ----------
// every schematic pin → net index. Ground symbols join into "GND"; an ammeter becomes a plain connection.
export function netlist(c) {
  const parent = new Map();
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  const add = (a) => { if (!parent.has(a)) parent.set(a, a); };
  const uni = (a, b) => { add(a); add(b); const x = find(a), y = find(b); if (x !== y) parent.set(x, y); };
  add('GND');
  for (const w of wirePieces(c)) uni(key(w.x1, w.y1), key(w.x2, w.y2));
  for (const p of c.parts) {
    const pins = pinsOf(p).map(([x, y]) => key(x, y));
    pins.forEach(add);
    if (p.type === 'GND') uni(pins[0], 'GND');
    if (p.type === 'AM') uni(pins[0], pins[1]);
  }
  const ids = new Map(), nets = [];
  const netOf = (k) => { const r = find(k); if (!ids.has(r)) { ids.set(r, nets.length); nets.push({ id: nets.length, root: r, members: [] }); } return ids.get(r); };
  netOf('GND');
  const pinNet = new Map();
  for (const p of c.parts) {
    if (!onBoard(p)) continue;
    const ns = pinsOf(p).map(([x, y]) => netOf(key(x, y)));
    pinNet.set(p.id, ns);
    ns.forEach((n, i) => nets[n].members.push({ part: p, pin: i }));
  }
  // names: GND, else the first battery +, else the first member "R1.2"
  for (const n of nets) {
    if (n.root === find('GND')) { n.name = 'GND'; continue; }
    const bat = n.members.find(m => m.part.type === 'BAT' && m.pin === 0);
    const m = bat ?? n.members[0];
    n.name = m ? `${m.part.name}.${pinLabel(m.part, m.pin)}` : `N${n.id}`;
    n.power = n.members.some(m => ['BAT', 'LAMP', 'REG', 'L', 'XFMR', 'LOCK'].includes(m.part.type) || (m.part.type === 'STEPPER' && m.pin >= 4) || (m.part.type === 'SERVO' && m.pin >= 1) || (m.part.type === 'RELAY' && m.pin >= 2) || (isBoard(m.part.type) && /pwr|gnd/.test(BOARDS[m.part.type].pins[m.pin].k)));
  }
  nets[0].power = true;
  return { nets, pinNet };
}

// ---------- layout ----------
export const DEFAULT_CAM = {
  vAngle: 30, vTip: 0.1, isoDepth: 0.1, isoPasses: 2, isoOverlap: 0.4, isoFeed: 150, plunge: 50, rpm: 10000,
  zSafe: 3, zTravel: 1, bits: '0.8, 1.0, 1.2', drillDepth: 1.8, drillFeed: 60,
  cutDia: 1.5, cutDepth: 1.7, cutStep: 0.4, cutFeed: 120, tabs: 4, tabW: 3, tabH: 0.6, thick: 1.6, mirror: true,
};
export const DEFAULT_RULES = { trace: 0.6, power: 1.0, clear: 0.4, grid: 0.25, edge: 0.6, bigPads: true };
export function newLayout() { return { v: 1, w: 50, h: 40, parts: {}, traces: [], jumpers: [], cam: { ...DEFAULT_CAM }, rules: { ...DEFAULT_RULES } }; }

// make sure every board part has a place; drop removed parts. New parts land near their schematic spot.
export function syncLayout(c) {
  setBigPads(c.pcb?.rules?.bigPads);
  const L = c.pcb ?? (c.pcb = newLayout());
  L.cam = { ...DEFAULT_CAM, ...L.cam }; L.rules = { ...DEFAULT_RULES, ...L.rules }; L.jumpers ??= [];
  const live = new Set();
  const fresh = [];
  for (const p of c.parts) {
    if (!onBoard(p)) continue;
    live.add(String(p.id));
    if (!L.parts[p.id]) { L.parts[p.id] = { x: 0, y: 0, rot: p.rot & 3 }; fresh.push(p); }
  }
  for (const k of Object.keys(L.parts)) if (!live.has(k)) delete L.parts[k];
  if (fresh.length) {
    const S = 2.54;
    const all = Object.keys(L.parts).length === fresh.length;
    if (all) {
      // first time: copy the schematic arrangement (1 grid = 2.54 mm), push overlapping parts apart, fit the board
      for (const p of fresh) Object.assign(L.parts[p.id], { x: snap(p.x * S, 1.27), y: snap(p.y * S, 1.27) });
      spread(c, fresh);
      fitBoard(c, 4);
    } else {
      // added later: drop it below the board's parts
      let y = Math.max(...Object.values(L.parts).filter((_, i) => true).map(q => q.y)) + 8;
      let x = 6;
      for (const p of fresh) { Object.assign(L.parts[p.id], { x, y }); x += 14; }
      fitBoard(c, 4, true);
    }
  }
  return L;
}
// push overlapping parts apart (keeps 2 mm between bodies)
export function spread(c, ps, gap = 2) {
  const L = c.pcb;
  for (let it = 0; it < 80; it++) {
    let moved = false;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const A = L.parts[ps[i].id], B = L.parts[ps[j].id], a = partExtents(ps[i], A), b = partExtents(ps[j], B);
      const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]) + gap, oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]) + gap;
      if (ox <= 0 || oy <= 0) continue;
      moved = true;
      if (ox < oy) { const s = (a[0] + a[2] < b[0] + b[2] ? 1 : -1) * (ox / 2 + 0.3); A.x -= s; B.x += s; }
      else { const s = (a[1] + a[3] < b[1] + b[3] ? 1 : -1) * (oy / 2 + 0.3); A.y -= s; B.y += s; }
    }
    if (!moved) break;
  }
  for (const p of ps) { const bp = L.parts[p.id]; bp.x = snap(bp.x, 1.27); bp.y = snap(bp.y, 1.27); }
}
export const snap = (v, g) => Math.round(v / g) * g;
export function partExtents(p, bp) {
  const f = footprintOf(p, bp); const pts = [];
  for (const pd of f.pads) { const [x, y] = rotPt([pd.x, pd.y], bp.rot); const [w, h] = (bp.rot & 1) ? [pd.h, pd.w] : [pd.w, pd.h]; pts.push([x - w / 2, y - h / 2], [x + w / 2, y + h / 2]); }
  for (const b of f.body) for (const q of b) pts.push(rotPt(q, bp.rot));
  const xs = pts.map(q => q[0] + bp.x), ys = pts.map(q => q[1] + bp.y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
// shrink / grow the board around the parts (grow only if growOnly)
export function fitBoard(c, margin = 4, growOnly = false) {
  setBigPads(c.pcb?.rules?.bigPads);
  const L = c.pcb; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of c.parts) { const bp = L.parts[p.id]; if (!bp) continue; const e = partExtents(p, bp); x0 = Math.min(x0, e[0]); y0 = Math.min(y0, e[1]); x1 = Math.max(x1, e[2]); y1 = Math.max(y1, e[3]); }
  if (!Number.isFinite(x0)) return;
  if (growOnly) {
    const dx = Math.max(0, margin - x0), dy = Math.max(0, margin - y0);
    if (dx || dy) shiftAll(L, snap(dx + 0.6, 1.27), snap(dy + 0.6, 1.27));
    L.w = Math.max(L.w, Math.ceil(x1 + dx + margin)); L.h = Math.max(L.h, Math.ceil(y1 + dy + margin));
    return;
  }
  shiftAll(L, snap(margin - x0, 1.27), snap(margin - y0, 1.27));
  L.w = Math.ceil(x1 - x0 + 2 * margin); L.h = Math.ceil(y1 - y0 + 2 * margin);
}
export function shiftAll(L, dx, dy) {
  for (const bp of Object.values(L.parts)) { bp.x += dx; bp.y += dy; }
  for (const t of L.traces) t.pts = t.pts.map(([x, y]) => [x + dx, y + dy]);
  for (const j of L.jumpers ?? []) { j.x1 += dx; j.x2 += dx; j.y1 += dy; j.y2 += dy; }
}

// pads in board coordinates, with their nets
export function boardPads(c, nl) {
  setBigPads(c.pcb?.rules?.bigPads);
  const L = c.pcb, out = [];
  for (const p of c.parts) {
    const bp = L.parts[p.id]; if (!bp) continue;
    const f = footprintOf(p, bp), nets = nl.pinNet.get(p.id);
    f.pads.forEach((pd, k) => {
      const [x, y] = rotPt([pd.x, pd.y], bp.rot);
      const [w, h] = (bp.rot & 1) ? [pd.h, pd.w] : [pd.w, pd.h];
      out.push({ part: p, k, pin: pd.pin, net: pd.pin >= 0 ? nets[pd.pin] : -1, x: bp.x + x, y: bp.y + y, w, h, shape: pd.shape, drill: pd.drill, num: pd.num });
    });
  }
  // jumper wires: a pad at each end, joined by a wire on the parts side
  (L.jumpers ?? []).forEach((j, ji) => {
    out.push({ part: null, jumper: ji, k: 0, pin: -1, net: -1, x: j.x1, y: j.y1, w: 1.8, h: 1.8, shape: 'round', drill: 0.8 });
    out.push({ part: null, jumper: ji, k: 1, pin: -1, net: -1, x: j.x2, y: j.y2, w: 1.8, h: 1.8, shape: 'round', drill: 0.8 });
  });
  return out;
}
// capsule for a pad: segment + radius (rect corners are treated a bit generously)
export function padCapsule(pd) {
  if (pd.shape === 'round') return { x1: pd.x, y1: pd.y, x2: pd.x, y2: pd.y, r: pd.w / 2 };
  const r = Math.min(pd.w, pd.h) / 2, L = Math.max(pd.w, pd.h) / 2 - r;
  return pd.w >= pd.h ? { x1: pd.x - L, y1: pd.y, x2: pd.x + L, y2: pd.y, r } : { x1: pd.x, y1: pd.y - L, x2: pd.x, y2: pd.y + L, r };
}
export function segDist(ax, ay, bx, by, cx, cy, dx, dy) {
  // distance between segments AB and CD
  const pt = (px, py, x1, y1, x2, y2) => { const vx = x2 - x1, vy = y2 - y1, l2 = vx * vx + vy * vy; const t = l2 ? Math.max(0, Math.min(1, ((px - x1) * vx + (py - y1) * vy) / l2)) : 0; return Math.hypot(px - x1 - t * vx, py - y1 - t * vy); };
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  if (o(ax, ay, bx, by, cx, cy) * o(ax, ay, bx, by, dx, dy) < 0 && o(cx, cy, dx, dy, ax, ay) * o(cx, cy, dx, dy, bx, by) < 0) return 0;
  return Math.min(pt(ax, ay, cx, cy, dx, dy), pt(bx, by, cx, cy, dx, dy), pt(cx, cy, ax, ay, bx, by), pt(dx, dy, ax, ay, bx, by));
}
const capDist = (a, b) => segDist(a.x1, a.y1, a.x2, a.y2, b.x1, b.y1, b.x2, b.y2) - a.r - b.r;

// copper items: pads + trace segments
export function copperItems(c, nl) {
  const pads = boardPads(c, nl);
  const items = pads.map(pd => ({ kind: 'pad', pad: pd, net: pd.net, cap: padCapsule(pd) }));
  c.pcb.traces.forEach((t, ti) => { for (let k = 0; k + 1 < t.pts.length; k++) { const [x1, y1] = t.pts[k], [x2, y2] = t.pts[k + 1]; items.push({ kind: 'seg', ti, k, net: -1, cap: { x1, y1, x2, y2, r: t.w / 2 } }); } });
  return { pads, items };
}
// connectivity: which copper touches which. Gives shorts, the net of each trace, and the missing connections (ratsnest).
export function analyze(c, nl = netlist(c)) {
  setBigPads(c.pcb?.rules?.bigPads);
  const { pads, items } = copperItems(c, nl);
  const n = items.length, par = items.map((_, i) => i);
  const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  const jEnd = new Map();
  items.forEach((it, i) => { if (it.kind === 'pad' && it.pad.jumper != null) { const k = it.pad.jumper; if (jEnd.has(k)) { const x = find(i), y = find(jEnd.get(k)); if (x !== y) par[x] = y; } else jEnd.set(k, i); } });
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = items[i].cap, b = items[j].cap;
    if (Math.min(a.x1, a.x2) - a.r > Math.max(b.x1, b.x2) + b.r || Math.min(b.x1, b.x2) - b.r > Math.max(a.x1, a.x2) + a.r) continue;
    if (Math.min(a.y1, a.y2) - a.r > Math.max(b.y1, b.y2) + b.r || Math.min(b.y1, b.y2) - b.r > Math.max(a.y1, a.y2) + a.r) continue;
    if (capDist(a, b) <= 1e-6) { const x = find(i), y = find(j); if (x !== y) par[x] = y; }
  }
  const clusters = new Map();
  items.forEach((it, i) => { const r = find(i); if (!clusters.has(r)) clusters.set(r, { items: [], nets: new Set() }); const cl = clusters.get(r); cl.items.push(it); if (it.kind === 'pad' && it.net >= 0) cl.nets.add(it.net); it.cl = r; });
  const shorts = [];
  for (const cl of clusters.values()) if (cl.nets.size > 1) shorts.push({ nets: [...cl.nets].map(i => nl.nets[i].name), items: cl.items });
  // trace net = net of its cluster (if exactly one)
  const traceNet = c.pcb.traces.map(() => -1);
  for (const it of items) {
    const cl = clusters.get(it.cl); if (cl.nets.size !== 1) continue;
    const nn = [...cl.nets][0];
    if (it.kind === 'seg') { traceNet[it.ti] = nn; it.net = nn; } else if (it.pad.jumper != null) it.net = nn;
  }
  // ratsnest: per net, join its clusters with a minimum spanning tree (pad to pad)
  const rats = [];
  for (const net of nl.nets) {
    const mine = pads.filter(p => p.net === net.id);
    if (mine.length < 2) continue;
    const groups = new Map();
    items.forEach((it) => { if (it.kind === 'pad' && it.net === net.id) { const r = it.cl; if (!groups.has(r)) groups.set(r, []); groups.get(r).push(it.pad); } });
    const G = [...groups.values()];
    if (G.length < 2) continue;
    const inTree = [G[0]], rest = G.slice(1);
    while (rest.length) {
      let best = null;
      for (const a of inTree) for (let gi = 0; gi < rest.length; gi++) for (const pa of a) for (const pb of rest[gi]) {
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y); if (!best || d < best.d) best = { d, a: pa, b: pb, gi };
      }
      rats.push({ net: net.id, a: best.a, b: best.b, d: best.d });
      inTree.push(rest.splice(best.gi, 1)[0]);
    }
  }
  return { nl, pads, items, clusters, shorts, rats, traceNet };
}

// design rule check: copper of different nets too close, copper off the board, parts overlapping
export function drc(c, an = analyze(c)) {
  const L = c.pcb, R = L.rules, out = [];
  const { items } = an;
  const netOfItem = (it) => (it.kind === 'pad' ? it.net : it.net);
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j];
    if (A.cl === B.cl) continue;
    const na = netOfItem(A), nb = netOfItem(B);
    if (na >= 0 && na === nb) continue;
    if (A.kind === 'pad' && B.kind === 'pad' && A.pad.part && A.pad.part === B.pad.part) continue;    // pads of one part: as designed
    const a = A.cap, b = B.cap;
    if (Math.min(a.x1, a.x2) - a.r - R.clear > Math.max(b.x1, b.x2) + b.r) continue;
    if (Math.min(b.x1, b.x2) - b.r - R.clear > Math.max(a.x1, a.x2) + a.r) continue;
    if (Math.min(a.y1, a.y2) - a.r - R.clear > Math.max(b.y1, b.y2) + b.r) continue;
    if (Math.min(b.y1, b.y2) - b.r - R.clear > Math.max(a.y1, a.y2) + a.r) continue;
    const d = capDist(a, b);
    if (d < R.clear - 1e-6) {
      const mx = (a.x1 + a.x2 + b.x1 + b.x2) / 4, my = (a.y1 + a.y2 + b.y1 + b.y2) / 4;
      out.push({ kind: 'clear', x: mx, y: my, d: Math.max(0, d), msg: `Gap ${d.toFixed(2)} mm (rule ${R.clear} mm)` });
    }
  }
  for (const s of an.shorts) { const it = s.items.find(x => x.kind === 'seg') ?? s.items[0]; out.push({ kind: 'short', x: (it.cap.x1 + it.cap.x2) / 2, y: (it.cap.y1 + it.cap.y2) / 2, msg: `SHORT: ${s.nets.join(' + ')} are joined` }); }
  for (const it of items) {
    const a = it.cap, m = a.r;
    if (Math.min(a.x1, a.x2) - m < 0 || Math.min(a.y1, a.y2) - m < 0 || Math.max(a.x1, a.x2) + m > L.w || Math.max(a.y1, a.y2) + m > L.h) out.push({ kind: 'edge', x: a.x1, y: a.y1, msg: 'Copper off the board edge' });
  }
  // part bodies overlapping (pads too close counts above)
  const ps = c.parts.filter(p => L.parts[p.id]);
  const ex = ps.map(p => partExtents(p, L.parts[p.id]));
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ex[i], b = ex[j], ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]), oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
    if (ox > 0.8 && oy > 0.8) out.push({ kind: 'overlap', x: (Math.max(a[0], b[0]) + Math.min(a[2], b[2])) / 2, y: (Math.max(a[1], b[1]) + Math.min(a[3], b[3])) / 2, msg: `${ps[i].name} and ${ps[j].name} overlap` });
  }
  return out;
}
