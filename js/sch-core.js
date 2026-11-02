// Schematic core: part library, circuit model, netlist from pins + wires, DC solver (MNA) with LEDs / diodes.
// Coordinates are grid units, y points DOWN (like paper). Parts sit on grid points and rotate in 90° steps.

export const LED_COLORS = {
  red: { vf: 1.8, rs: 12, hex: '#FF3B30' }, orange: { vf: 2.0, rs: 12, hex: '#FF9500' }, yellow: { vf: 2.1, rs: 12, hex: '#FFD60A' },
  green: { vf: 2.2, rs: 14, hex: '#34C759' }, blue: { vf: 3.0, rs: 16, hex: '#0A84FF' }, white: { vf: 3.0, rs: 16, hex: '#F2F2F7' },
};
export const DIODES = {
  '1N4007': { vf: 0.7, rs: 0.05, imax: 1, piv: 1000, note: 'general 1 A rectifier' },
  '1N5408': { vf: 0.75, rs: 0.02, imax: 3, piv: 1000, note: '3 A rectifier' },
  '1N4148': { vf: 0.65, rs: 0.5, imax: 0.2, piv: 75, note: 'small signal' },
  '1N5819': { vf: 0.35, rs: 0.05, imax: 1, piv: 40, note: 'Schottky, low drop (flyback diode)' },
};

export const BJTS = {
  '2N2222': { pol: 'npn', beta: 150, vbe: 0.65, rb: 2, vsat: 0.2, rsat: 0.3, imax: 0.6, vmax: 40, pmax: 0.5, note: 'NPN 600 mA, small switch' },
  'BC547': { pol: 'npn', beta: 200, vbe: 0.65, rb: 5, vsat: 0.2, rsat: 1, imax: 0.1, vmax: 45, pmax: 0.5, note: 'NPN 100 mA, small signal' },
  'S8050': { pol: 'npn', beta: 200, vbe: 0.65, rb: 2, vsat: 0.25, rsat: 0.4, imax: 0.5, vmax: 25, pmax: 0.6, note: 'NPN 500 mA' },
  'TIP120': { pol: 'npn', beta: 1000, vbe: 1.3, rb: 2, vsat: 0.9, rsat: 0.1, imax: 5, vmax: 60, pmax: 2, note: 'NPN Darlington 5 A' },
  'TIP31C': { pol: 'npn', beta: 50, vbe: 0.8, rb: 1, vsat: 0.3, rsat: 0.1, imax: 3, vmax: 100, pmax: 2, note: 'NPN power 3 A' },
  '2N2907': { pol: 'pnp', beta: 150, vbe: 0.65, rb: 2, vsat: 0.2, rsat: 0.3, imax: 0.6, vmax: 60, pmax: 0.5, note: 'PNP 600 mA' },
  'BC557': { pol: 'pnp', beta: 200, vbe: 0.65, rb: 5, vsat: 0.2, rsat: 1, imax: 0.1, vmax: 45, pmax: 0.5, note: 'PNP 100 mA' },
  'S8550': { pol: 'pnp', beta: 200, vbe: 0.65, rb: 2, vsat: 0.25, rsat: 0.4, imax: 0.5, vmax: 25, pmax: 0.6, note: 'PNP 500 mA' },
  'TIP125': { pol: 'pnp', beta: 1000, vbe: 1.3, rb: 2, vsat: 0.9, rsat: 0.1, imax: 5, vmax: 60, pmax: 2, note: 'PNP Darlington 5 A' },
  'TIP32C': { pol: 'pnp', beta: 50, vbe: 0.8, rb: 1, vsat: 0.3, rsat: 0.1, imax: 3, vmax: 100, pmax: 2, note: 'PNP power 3 A' },
};
// rdson is at gate voltage vfull; logic = fully on from a 3.3–5 V pin
export const FETS = {
  'IRLZ44N': { pol: 'n', vth: 1.5, rdson: 0.025, vfull: 5, imax: 47, vmax: 55, pmax: 2, logic: true, note: 'N, logic level, 47 A' },
  'AO3400': { pol: 'n', vth: 1.05, rdson: 0.033, vfull: 4.5, imax: 5.7, vmax: 30, pmax: 1.4, logic: true, note: 'N, SOT-23, 3.3 V gate OK, 5.7 A' },
  'IRF540N': { pol: 'n', vth: 3, rdson: 0.044, vfull: 10, imax: 33, vmax: 100, pmax: 2, logic: false, note: 'N, needs 10 V gate, 33 A' },
  'IRFZ44N': { pol: 'n', vth: 3, rdson: 0.0175, vfull: 10, imax: 49, vmax: 55, pmax: 2, logic: false, note: 'N, needs 10 V gate, 49 A' },
  '2N7000': { pol: 'n', vth: 2.1, rdson: 1.8, vfull: 10, imax: 0.2, vmax: 60, pmax: 0.4, logic: false, note: 'N, small 200 mA' },
  'AO3401': { pol: 'p', vth: 0.9, rdson: 0.05, vfull: 4.5, imax: 4, vmax: 30, pmax: 1.4, logic: true, note: 'P, SOT-23, 4 A' },
  'IRFBC40': { pol: 'n', vth: 3, rdson: 1.2, vfull: 10, imax: 6.2, vmax: 600, pmax: 2, logic: false, note: 'N, 600 V, 6 A: off-line SMPS / flyback (220 V)' },
  'IRF840': { pol: 'n', vth: 3, rdson: 0.85, vfull: 10, imax: 8, vmax: 500, pmax: 2, logic: false, note: 'N, 500 V, 8 A: SMPS, inverters' },
  'IRF9540N': { pol: 'p', vth: 3, rdson: 0.117, vfull: 10, imax: 23, vmax: 100, pmax: 2, logic: false, note: 'P, needs 10 V gate, 23 A' },
};
// dh / dl = how close the output gets to the top / bottom supply
export const AMPS = {
  'LM358': { dh: 1.5, dl: 0.02, a: 1e5, iq: 0.0007, vmax: 32, iout: 0.03, note: 'single supply 3–32 V, output reaches 0 V but not the top' },
  'LM741': { dh: 2, dl: 2, a: 2e5, iq: 0.0017, vmax: 36, iout: 0.025, note: 'old, needs ± supply, 2 V from both rails' },
  'TL072': { dh: 1.5, dl: 1.5, a: 2e5, iq: 0.0014, vmax: 36, iout: 0.03, note: 'audio, JFET input' },
  'MCP6002': { dh: 0.025, dl: 0.025, a: 1e5, iq: 0.0001, vmax: 6, iout: 0.02, note: 'rail-to-rail, 1.8–6 V (3.3 V MCU)' },
};
export const REGS = {
  '7805': { vout: 5, drop: 2, ilim: 1.5, iq: 0.005, vinmax: 35, note: '5 V, 1.5 A, input 7–35 V' },
  '7809': { vout: 9, drop: 2, ilim: 1.5, iq: 0.005, vinmax: 35, note: '9 V, 1.5 A' },
  '7812': { vout: 12, drop: 2, ilim: 1.5, iq: 0.005, vinmax: 35, note: '12 V, 1.5 A, input 14–35 V' },
  'AMS1117-3.3': { vout: 3.3, drop: 1.1, ilim: 1, iq: 0.005, vinmax: 15, note: '3.3 V, 1 A low-drop (ESP32)' },
  'AMS1117-5.0': { vout: 5, drop: 1.1, ilim: 1, iq: 0.005, vinmax: 15, note: '5 V, 1 A low-drop' },
  'LM317': { vout: 1.25, drop: 2, ilim: 1.5, iq: 0, iadj: 50e-6, vinmax: 40, adj: true, note: 'adjustable: Vout = 1.25 × (1 + R2 ÷ R1)' },
};
// 555 timer: dh = how far the output HIGH sits below Vcc, iq = supply current
export const TIMERS = {
  NE555: { dh: 1.7, vmin: 4.5, vmax: 16, iq: 0.006, iout: 0.2, note: 'bipolar, 4.5–16 V, output 200 mA, HIGH ≈ Vcc − 1.7 V' },
  TLC555: { dh: 0.1, vmin: 2, vmax: 15, iq: 0.0002, iout: 0.1, note: 'CMOS, 2–15 V, rail-to-rail, low power (also 7555, LMC555)' },
};
// TL494 PWM controller (TI SLVS074): ramp 0 → 3 V on CT, charged by 3 V ÷ RT → f = 1 ÷ (RT × CT).
// dead-time comparator offset 0.11 V, PWM comparator offset 0.7 V, 5 V reference, 7–40 V supply, outputs 200 mA (Vce sat ≈ 1.1 V)
export const TL494 = { peak: 3, dtcOff: 0.11, pwmOff: 0.7, vmin: 7, vmax: 40, iout: 0.2, iref: 0.01, vsat: 1.1, rsat: 1, ea: { a: 56000, dh: 1.5, dl: 0 } };
const TL_F = new Map();          // TL494 id → oscillator frequency seen in the last run (sets the time step)
// motors
export const SERVOS = {
  SG90: { vmin: 4.0, vmax: 6.0, idle: 0.01, run: 0.25, stall: 0.65, speed: 600, note: 'micro servo 9 g, 1.8 kg·cm' },          // speed in °/s (0.1 s / 60°)
  MG996R: { vmin: 4.8, vmax: 7.2, idle: 0.01, run: 0.5, stall: 2.5, speed: 350, note: 'metal gear, 10 kg·cm, needs its own 5–6 V supply' },
};
export const RELAYS = { 5: { rcoil: 70, l: 0.02 }, 12: { rcoil: 400, l: 0.12 }, 24: { rcoil: 1600, l: 0.5 } };
export const ZENERS = [2.7, 3.3, 3.9, 4.7, 5.1, 5.6, 6.2, 6.8, 8.2, 9.1, 10, 12, 15, 18, 24];

// ---------- custom parts (typed in from a datasheet) ----------
// kind → which part types use it, and the fields the form asks for: [key, label, unit, default, hint, optional]
export const CUSTOM_KINDS = {
  BJT: { types: ['NPN', 'PNP'], title: 'Transistor', fields: [
    ['beta', 'Gain hFE (β)', '', 100, 'hFE / DC current gain, typical'], ['vbe', 'Vbe (on)', 'V', 0.7, 'base-emitter on voltage'], ['vsat', 'Vce(sat)', 'V', 0.3, 'collector-emitter saturation voltage'],
    ['imax', 'Max collector current Ic', 'A', 1, ''], ['vmax', 'Max Vce (Vceo)', 'V', 40, ''], ['pmax', 'Max power (no heatsink)', 'W', 0.6, 'Ptot / Pd at 25 °C ambient']] },
  FET: { types: ['NMOS', 'PMOS'], title: 'MOSFET', fields: [
    ['vth', 'Gate threshold Vgs(th)', 'V', 2, 'starts to turn on (use the typical value)'], ['rdson', 'Rds(on)', 'Ω', 0.05, 'on-resistance'], ['vfull', '…measured at gate voltage', 'V', 10, 'the Vgs written next to Rds(on)'],
    ['imax', 'Max drain current Id', 'A', 10, ''], ['vmax', 'Max Vds', 'V', 60, 'V(BR)DSS'], ['pmax', 'Max power (no heatsink)', 'W', 1, '≈ 2 W for TO-220, 1 W for SOT-23']] },
  DIODE: { types: ['D'], title: 'Diode', fields: [['vf', 'Forward voltage Vf', 'V', 0.7, ''], ['imax', 'Max forward current', 'A', 1, 'IF(AV)'], ['piv', 'Max reverse voltage', 'V', 100, 'VRRM']] },
  ZENER: { types: ['ZD'], title: 'Zener', fields: [['vz', 'Zener voltage Vz', 'V', 5.1, ''], ['pmax', 'Power rating', 'W', 0.5, 'Ptot']] },
  LED: { types: ['LED'], title: 'LED', fields: [['vf', 'Forward voltage Vf', 'V', 2, 'typical'], ['imax', 'Max current', 'A', 0.02, 'IF'], ['glow', 'Glow color', '', 'red', '']] },
  AMP: { types: ['OPAMP'], title: 'Op-amp', fields: [
    ['dh', 'Output stops below top supply by', 'V', 1.5, 'from "output swing" (0.02 for rail-to-rail)'], ['dl', 'Output stops above bottom supply by', 'V', 1.5, ''],
    ['vmax', 'Max supply (top to bottom)', 'V', 36, ''], ['iout', 'Max output current', 'A', 0.03, 'short-circuit current'],
    ['a', 'Open-loop gain', '', 100000, '100 dB = 100 000', true], ['iq', 'Supply current', 'A', 0.002, '', true]] },
  REG: { types: ['REG'], title: 'Regulator', fields: [
    ['adj', 'Adjustable (has ADJ pin)?', '', 0, ''], ['vout', 'Output voltage (adjustable: reference)', 'V', 5, 'adjustable: 1.25 V between OUT and ADJ'], ['drop', 'Dropout voltage', 'V', 2, ''],
    ['ilim', 'Current limit', 'A', 1.5, ''], ['vinmax', 'Max input (adjustable: max in − out)', 'V', 35, ''],
    ['iq', 'Quiescent current (fixed) / ADJ pin current', 'A', 0.005, 'ADJ pin: ≈ 0.00005', true]] },
  RELAY: { types: ['RELAY'], title: 'Relay', fields: [['vcoil', 'Coil voltage', 'V', 12, ''], ['rcoil', 'Coil resistance', 'Ω', 400, ''], ['l', 'Coil inductance', 'H', 0.1, 'rarely given: 0.02–0.5', true]] },
};
export const ZENER_PARTS = {};
export const kindOfType = (t) => Object.keys(CUSTOM_KINDS).find(k => CUSTOM_KINDS[k].types.includes(t));
const libOf = (kind) => ({ BJT: BJTS, FET: FETS, DIODE: DIODES, ZENER: ZENER_PARTS, LED: LED_COLORS, AMP: AMPS, REG: REGS, RELAY: RELAYS })[kind];
// turn the typed-in values into the model the solver uses
export function registerCustom(kind, name, d, pol) {
  const n = (k, def) => (Number.isFinite(+d[k]) && d[k] !== '' ? +d[k] : def);
  let m;
  switch (kind) {
    case 'BJT': m = { pol: d.pol ?? pol, beta: n('beta', 100), vbe: n('vbe', 0.7), rb: 2, vsat: n('vsat', 0.3), rsat: 0.2, imax: n('imax', 1), vmax: n('vmax', 40), pmax: n('pmax', 0.6) }; break;
    case 'FET': m = { pol: d.pol ?? pol, vth: n('vth', 2), rdson: n('rdson', 0.05), vfull: Math.max(n('vfull', 10), n('vth', 2) + 0.5), imax: n('imax', 10), vmax: n('vmax', 60), pmax: n('pmax', 1) }; m.logic = m.vfull <= 5; break;
    case 'DIODE': m = { vf: n('vf', 0.7), rs: 0.05, imax: n('imax', 1), piv: n('piv', 100) }; break;
    case 'ZENER': m = { vz: n('vz', 5.1), pmax: n('pmax', 0.5) }; break;
    case 'LED': m = { vf: n('vf', 2), rs: 12, imax: n('imax', 0.02), hex: (LED_COLORS[d.glow] ?? LED_COLORS.red).hex, glow: d.glow ?? 'red' }; break;
    case 'AMP': m = { dh: n('dh', 1.5), dl: n('dl', 1.5), a: n('a', 1e5), iq: n('iq', 0.002), vmax: n('vmax', 36), iout: n('iout', 0.03) }; break;
    case 'REG': { const adj = !!+d.adj; m = { vout: n('vout', adj ? 1.25 : 5), drop: n('drop', 2), ilim: n('ilim', 1.5), vinmax: n('vinmax', 35), adj }; if (adj) { m.iq = 0; m.iadj = n('iq', 50e-6); } else m.iq = n('iq', 0.005); break; }
    case 'RELAY': m = { vcoil: n('vcoil', 12), rcoil: Math.max(1, n('rcoil', 400)), l: n('l', 0.1) }; break;
  }
  m.custom = true; m.raw = { ...d }; m.note = '★ your part';
  libOf(kind)[name] = m;
  return m;
}
export function unregisterCustom(kind, name) { const L = libOf(kind); if (L[name]?.custom) delete L[name]; }
export const zenerOf = (pr) => ZENER_PARTS[pr.model] ?? pr;          // {vz, pmax}
export const relayOf = (pr) => (RELAYS[pr.relay]?.custom ? RELAYS[pr.relay] : pr);   // {vcoil, rcoil, l}
export const isBuiltIn = (kind, name) => !!libOf(kind)[name] && !libOf(kind)[name].custom;
export const getCustom = (kind, name) => (libOf(kind)[name]?.custom ? libOf(kind)[name] : null);
// which part on the circuit uses which custom model (saved with the project so it opens on another phone)
export function partModelKey(p) { return p.type === 'LED' ? p.props.color : p.type === 'RELAY' ? p.props.relay : p.props.model; }
export function usedCustom(c) {
  const lib = {};
  for (const p of c.parts) {
    const kind = kindOfType(p.type), nm = kind && partModelKey(p), m = nm && getCustom(kind, nm);
    if (m) (lib[kind] ??= {})[nm] = { ...m.raw, pol: m.pol };
  }
  return lib;
}

// ---------- microcontroller boards (pins set by hand: no program runs) ----------
// k: gpio | gnd | pwr (v = volts, r = source resistance) | en (reset, pulled up) | nc
const ESP_L = [['EN', 'en'], ['VP', 36], ['VN', 39], ['D34', 34], ['D35', 35], ['D32', 32], ['D33', 33], ['D25', 25], ['D26', 26], ['D27', 27], ['D14', 14], ['D12', 12], ['D13', 13], ['GND', 'gnd'], ['VIN', 'vin']];
const ESP_R = [['D23', 23], ['D22', 22], ['TX0', 1], ['RX0', 3], ['D21', 21], ['D19', 19], ['D18', 18], ['D5', 5], ['TX2', 17], ['RX2', 16], ['D4', 4], ['D2', 2], ['D15', 15], ['GND2', 'gnd'], ['3V3', '3v3']];
const espPin = ([n, g]) => {
  if (g === 'gnd') return { n, k: 'gnd' };
  if (g === 'en') return { n, k: 'en' };
  if (g === 'vin') return { n, k: 'pwr', v: 4.7, r: 0.5, imax: 0.5, note: 'USB 5 V through a diode' };
  if (g === '3v3') return { n, k: 'pwr', v: 3.3, r: 0.3, imax: 0.5, note: 'AMS1117 regulator (ESP32 itself uses ≈ 80–250 mA)' };
  const inOnly = g >= 34;
  return { n, k: 'gpio', g, label: `GPIO${g}`, inOnly, pwm: !inOnly, adc: g >= 32 ? 'ADC1' : [0, 2, 4, 12, 13, 14, 15, 25, 26, 27].includes(g) ? 'ADC2' : null,
    strap: [0, 2, 5, 12, 15].includes(g), serial: g === 1 || g === 3, pull: !inOnly };
};
const UNO_L = ['5V', '3V3', 'VIN', 'GND', 'GND2', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
const unoPin = (n) => {
  if (n === '5V') return { n, k: 'pwr', v: 5, r: 0.3, imax: 0.5, note: 'from USB (≈ 500 mA max)' };
  if (n === '3V3') return { n, k: 'pwr', v: 3.3, r: 1, imax: 0.05, note: '3.3 V regulator, 50 mA max' };
  if (n === 'VIN') return { n, k: 'nc', note: 'input 7–12 V (not used on USB power)' };
  if (n.startsWith('GND')) return { n, k: 'gnd' };
  const d = n.startsWith('D') ? +n.slice(1) : null;
  return { n, k: 'gpio', label: n, pwm: d != null && [3, 5, 6, 9, 10, 11].includes(d), adc: n.startsWith('A') ? 'ADC' : null, serial: d === 0 || d === 1, pull: true, i2c: n === 'A4' ? 'SDA' : n === 'A5' ? 'SCL' : null };
};
export const BOARDS = {
  ESP32: { name: 'ESP32 DevKit', vcc: 3.3, rout: 30, pullR: 45000, adcBits: 12, adcRef: 3.3, vih: 2.48, vil: 0.83, imax: 40, irec: 20,
    pins: [...ESP_L.map(espPin), ...ESP_R.map(espPin)] },
  UNO: { name: 'Arduino UNO', vcc: 5, rout: 25, pullR: 35000, adcBits: 10, adcRef: 5, vih: 3.0, vil: 1.5, imax: 40, irec: 20,
    pins: [...UNO_L.map(unoPin), ...Array.from({ length: 14 }, (_, i) => unoPin('D' + i))] },
};
const boardPins = (b, nl) => b.pins.map((q, i) => (i < nl ? [-4, i - Math.floor((nl - 1) / 2)] : [4, i - nl - (b.pins.length - nl === 14 ? 7 : 7)]));
export const isBoard = (t) => t === 'ESP32' || t === 'UNO';
export const PIN_MODES = { in: 'INPUT (high impedance)', pu: 'INPUT_PULLUP', pd: 'INPUT_PULLDOWN', adc: 'analogRead (ADC)', high: 'OUTPUT HIGH', low: 'OUTPUT LOW', pwm: 'PWM (analogWrite / ledc)', dac: 'DAC output (dacWrite, set by code)' };
export function pinModesFor(board, q) {
  if (q.k !== 'gpio') return [];
  const m = ['in', 'pu'];
  if (board === 'ESP32' && !q.inOnly) m.push('pd');
  if (q.inOnly) return board === 'ESP32' ? ['in', ...(q.adc ? ['adc'] : [])] : m;
  if (q.adc) m.push('adc');
  m.push('high', 'low');
  m.push('pwm');      // UNO: real PWM only on ~ pins; other pins = pulses made by code / Servo library
  return m;
}

// pins: local coords; first pin is "a" (+ / anode / start), second "b"
export const TYPES = {
  R: { label: 'Resistor', prefix: 'R', pins: [[-2, 0], [2, 0]], box: [-2, -0.7, 2, 0.7], props: { r: 1000, rating: 0.25 } },
  POT: { label: 'Potentiometer', prefix: 'RV', pins: [[-2, 0], [2, 0], [0, -2]], box: [-2, -2, 2, 0.8], props: { r: 10000, pos: 50 } },
  BAT: { label: 'Battery / DC supply', prefix: 'B', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 1], props: { v: 9, rint: 0 } },
  ISRC: { label: 'Current source', prefix: 'I', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 1], props: { i: 0.01 } },
  SW: { label: 'Switch', prefix: 'S', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 0.6], props: { on: false } },
  SPDT: { label: 'SPDT switch (1 pole, 2 ways)', prefix: 'S', pins: [[-2, 0], [2, -1], [2, 1]], box: [-2, -1.6, 2, 1.6], props: { on: false } },
  DPDT: { label: 'DPDT switch (2 poles, 2 ways)', prefix: 'S', pins: [[-2, -2], [2, -3], [2, -1], [-2, 2], [2, 1], [2, 3]], box: [-2, -3.6, 2, 3.6], props: { on: false } },
  PB: { label: 'Push button', prefix: 'PB', pins: [[-2, 0], [2, 0]], box: [-2, -1.3, 2, 0.6], props: { on: false } },
  LED: { label: 'LED', prefix: 'LED', pins: [[-2, 0], [2, 0]], box: [-2, -1.3, 2, 0.8], props: { color: 'red', imax: 0.02 } },
  D: { label: 'Diode', prefix: 'D', pins: [[-2, 0], [2, 0]], box: [-2, -0.8, 2, 0.8], props: { model: '1N4007' } },
  LAMP: { label: 'Lamp / bulb', prefix: 'LP', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 1], props: { vr: 12, wr: 5 } },
  C: { label: 'Capacitor', prefix: 'C', pins: [[-2, 0], [2, 0]], box: [-2, -1, 2, 1], props: { c: 100e-6, vmax: 25, polar: true } },
  L: { label: 'Inductor / coil', prefix: 'L', pins: [[-2, 0], [2, 0]], box: [-2, -0.8, 2, 0.6], props: { l: 0.01, r: 1 } },
  SIG: { label: 'Signal generator', prefix: 'G', pins: [[-2, 0], [2, 0]], box: [-2, -1.1, 2, 1.1], props: { wave: 'sine', f: 50, amp: 5, off: 0, duty: 50 } },
  SCOPE: { label: 'Oscilloscope probes', prefix: 'SC', pins: [[-3, -1], [-3, 1], [0, 2]], box: [-3, -1.8, 2.2, 2], props: {} },
  OPTO: { label: 'Optocoupler PC817', prefix: 'U', pins: [[-2, -1], [-2, 1], [2, -1], [2, 1]], box: [-2, -1.9, 2, 1.9], props: { ctr: 100 } },
  ZD: { label: 'Zener diode', prefix: 'ZD', pins: [[-2, 0], [2, 0]], box: [-2, -0.8, 2, 0.8], props: { vz: 5.1, pmax: 0.5 } },
  NPN: { label: 'NPN transistor', prefix: 'Q', pins: [[-2, 0], [1, -2], [1, 2]], box: [-2, -2, 1.6, 2], props: { model: '2N2222' } },
  PNP: { label: 'PNP transistor', prefix: 'Q', pins: [[-2, 0], [1, 2], [1, -2]], box: [-2, -2, 1.6, 2], props: { model: '2N2907' } },
  NMOS: { label: 'N-channel MOSFET', prefix: 'Q', pins: [[-2, 0], [1, -2], [1, 2]], box: [-2, -2, 1.8, 2], props: { model: 'IRLZ44N' } },
  PMOS: { label: 'P-channel MOSFET', prefix: 'Q', pins: [[-2, 0], [1, 2], [1, -2]], box: [-2, -2, 1.8, 2], props: { model: 'AO3401' } },
  OPAMP: { label: 'Op-amp', prefix: 'U', pins: [[-3, 1], [-3, -1], [3, 0], [0, -2], [0, 2]], box: [-3, -2, 3, 2], props: { model: 'LM358' } },
  REG: { label: 'Voltage regulator', prefix: 'U', pins: [[-3, 0], [3, 0], [0, 2]], box: [-3, -1.2, 3, 2], props: { model: '7805' } },
  ESP32: { label: 'ESP32 DevKit (30 pin)', prefix: 'MCU', pins: boardPins(BOARDS.ESP32, 15), box: [-4, -8.6, 4, 8.6], props: { pins: {} } },
  UNO: { label: 'Arduino UNO', prefix: 'MCU', pins: boardPins(BOARDS.UNO, 11), box: [-4, -8.6, 4, 8.6], props: { pins: {} } },
  SERVO: { label: 'Servo motor', prefix: 'M', pins: [[-3, -1], [-3, 0], [-3, 1]], box: [-3, -2.2, 3.2, 2.2], props: { model: 'SG90' } },
  STEPPER: { label: 'Stepper motor + A4988 driver', prefix: 'M', pins: [[-4, -2], [-4, -1], [-4, 0], [-4, 1], [-4, 2], [-4, 3]], box: [-4, -3.4, 5.6, 3.8], props: { micro: 1, ilim: 1.0, steps: 200 } },
  T555: { label: '555 timer', prefix: 'U', pins: [[0, 4], [-4, 2], [4, 0], [1, -4], [2, 4], [-4, 0], [-4, -2], [-1, -4]], box: [-4, -4, 4, 4], props: { model: 'NE555' } },
  RELAY: { label: 'Relay (coil + changeover)', prefix: 'K', pins: [[-3, -2], [-3, 2], [0, 2], [0, -2], [2, -2]], box: [-3.7, -2.4, 2.4, 2.4], props: { vcoil: 5, rcoil: 70, l: 0.02 } },
  XFMR: { label: 'Transformer (center tap)', prefix: 'TR', pins: [[-3, -2], [-3, 0], [-3, 2], [3, -2], [3, 2]], box: [-3, -2.6, 3, 2.6], props: { n1: 10, n2: 10, ns: 190, lm: 0.3, r1: 0.02, r2: 0.02, rs: 2 } },
  // LCD 16×2 with I2C backpack. Schematic pin order (top→bottom) SCL, SDA, VCC, GND; index order GND, VCC, SDA, SCL like the real header
  // OLED 0.96" SSD1306 128×64 I2C. Schematic pin order (top→bottom) SCL, SDA, VCC, GND; index order GND, VCC, SCL, SDA like the real header
  OLED: { label: 'OLED 0.96" 128×64 (SSD1306 I2C)', prefix: 'OLED', pins: [[-5, 2], [-5, 1], [-5, -1], [-5, 0]], box: [-5, -2.3, 5, 3.3], props: { addr: 0x3C, color: 'white' } },
  // KY-040 rotary encoder module: header CLK, DT, SW, +, GND on the right. CLK / DT have 10 kΩ pull-ups to +, contacts pull them to GND
  ENC: { label: 'Rotary encoder (KY-040)', prefix: 'ENC', pins: [[3, -2], [3, -1], [3, 0], [3, 1], [3, 2]], box: [-3.4, -2.6, 3, 2.6], props: {} },
  // 74HC595 shift register, index = DIP pin − 1: 1 QB … 7 QH, 8 GND, 9 QH', 10 SRCLR, 11 SRCLK, 12 RCLK, 13 OE, 14 SER, 15 QA, 16 VCC
  SR595: { label: '74HC595 shift register (8 outputs)', prefix: 'U', pins: [[4, -3], [4, -2], [4, -1], [4, 0], [4, 1], [4, 2], [4, 3], [0, 7], [4, 5], [2, -6], [-4, -3], [-4, -2], [2, 7], [-4, -4], [4, -4], [0, -6]], box: [-4, -6, 4, 7], props: { model: '74HC595' } },
  // TL494 PWM controller, index = DIP pin − 1: 1 1IN+, 2 1IN−, 3 FEEDBACK, 4 DTC, 5 CT, 6 RT, 7 GND, 8 C1, 9 E1, 10 E2, 11 C2, 12 VCC, 13 OUTPUT CTRL, 14 REF, 15 2IN−, 16 2IN+
  TL494: { label: 'TL494 PWM controller (SMPS, inverters)', prefix: 'U', pins: [[-5, -4], [-5, -5], [-5, -2], [-5, 4], [-3, 7], [-1, 7], [1, 7], [5, -5], [5, -2], [5, 0], [5, -4], [2, -7], [3, 7], [-2, -7], [-5, 2], [-5, 0]], box: [-5, -7, 5, 7], props: { model: 'TL494C' } },
  // 1-channel 5 V relay module (opto / transistor + LED on board): VCC, GND, IN | COM, NO, NC
  RMOD: { label: 'Relay module 5 V (1 channel)', prefix: 'K', pins: [[-3, -1], [-3, 0], [-3, 1], [3, 0], [3, -1], [3, 1]], box: [-3, -2, 3, 2], props: { trig: 'low' } },
  LCD: { label: 'LCD 16×2 (I2C backpack)', prefix: 'LCD', pins: [[-7, 2], [-7, 1], [-7, 0], [-7, -1]], box: [-7, -2.3, 7, 2.8], props: { addr: 0x27 } },
  SEG7: { label: '7-segment display', prefix: 'DS', pins: [[-3, -4], [-3, -3], [-3, -2], [-3, -1], [-3, 0], [-3, 1], [-3, 2], [-3, 3], [-3, 4]], box: [-3, -4.7, 2.6, 4.7], props: { common: 'cathode', color: 'red' } },
  // sensors: a slider in the panel sets what they "feel"; sketches read them (DHT library, pulseIn) or the voltage does the job (LDR, PIR)
  DHT: { label: 'DHT22 / DHT11 temp + humidity', prefix: 'U', pins: [[-3, -1], [-3, 0], [-3, 1]], box: [-3, -2.2, 2.6, 2.2], props: { model: 'DHT22', temp: 25, hum: 60 } },
  HCSR04: { label: 'HC-SR04 ultrasonic distance', prefix: 'U', pins: [[-4, -1], [-4, 0], [-4, 1], [-4, 2]], box: [-4, -2.3, 4, 2.8], props: { cm: 50 } },
  LDR: { label: 'LDR light sensor', prefix: 'LDR', pins: [[-2, 0], [2, 0]], box: [-2, -1.3, 2, 1.1], props: { lux: 100 } },
  PIR: { label: 'PIR motion sensor (HC-SR501)', prefix: 'U', pins: [[-3, -1], [-3, 0], [-3, 1]], box: [-3, -2, 2.8, 2.2], props: { motion: false } },
  KEYPAD: { label: 'Keypad 4×4 (tap the keys)', prefix: 'KP', pins: [[-5, -3], [-5, -2], [-5, -1], [-5, 0], [-5, 1], [-5, 2], [-5, 3], [-5, 4]], box: [-5, -4, 4, 5.2], props: {} },
  BUZZER: { label: 'Buzzer (active, 3–5 V)', prefix: 'BZ', pins: [[-2, 0], [2, 0]], box: [-2, -1.3, 2, 1.3], props: {} },
  LOCK: { label: 'Solenoid door lock (12 V)', prefix: 'LK', pins: [[-2, 0], [2, 0]], box: [-2, -1.6, 2, 1.4], props: { v: 12, r: 24, l: 0.05 } },
  GND: { label: 'Ground', prefix: 'GND', pins: [[0, 0]], box: [-0.8, 0, 0.8, 1.6], props: {} },
  VM: { label: 'Voltmeter', prefix: 'VM', pins: [[-2, 0], [2, 0]], box: [-2, -1.1, 2, 1.1], props: {} },
  AM: { label: 'Ammeter', prefix: 'AM', pins: [[-2, 0], [2, 0]], box: [-2, -1.1, 2, 1.1], props: {} },
};
export const PALETTE = ['R', 'POT', 'C', 'L', 'BAT', 'SIG', 'LED', 'D', 'ZD', 'NPN', 'PNP', 'NMOS', 'PMOS', 'OPAMP', 'T555', 'TL494', 'SR595', 'ESP32', 'UNO', 'LCD', 'OLED', 'SEG7', 'DHT', 'HCSR04', 'LDR', 'PIR', 'KEYPAD', 'ENC', 'BUZZER', 'LOCK', 'SERVO', 'STEPPER', 'REG', 'RELAY', 'RMOD', 'OPTO', 'SW', 'SPDT', 'DPDT', 'PB', 'LAMP', 'XFMR', 'ISRC', 'VM', 'AM', 'SCOPE', 'GND'];
export const DYNAMIC = new Set(['C', 'L', 'XFMR', 'LOCK', 'SIG', 'SCOPE', 'RELAY', 'SERVO', 'STEPPER', 'ENC', 'TL494']);
export const isDynamic = (c) => c.parts.some(p => DYNAMIC.has(p.type) || (isBoard(p.type) && ((p.props.run && p.props.code) || Object.values(p.props.pins ?? {}).some(x => x.mode === 'pwm'))));

// signal generator value at time t
export function sigValue(q, t) {
  const ph = ((t * q.f) % 1 + 1) % 1, A = q.amp, o = q.off;
  switch (q.wave) {
    case 'square': return o + (ph < 0.5 ? A : -A);
    case 'triangle': return o + A * (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph);
    case 'pwm': return o + (ph < q.duty / 100 ? A : 0);
    case 'saw': return o + A * (2 * ph - 1);
    default: return o + A * Math.sin(2 * Math.PI * ph);
  }
}

// average of a PWM wave over [t0, t1] (exact, so pulse widths stay exact even with big time steps)
export function pwmAvg(f, duty, amp, t0, t1) {
  const T = 1 / f, D = Math.min(1, Math.max(0, duty / 100)) * T;
  const I = (t) => { const n = Math.floor(t / T), ph = t - n * T; return n * D + Math.min(ph, D); };
  return t1 > t0 ? amp * (I(t1) - I(t0)) / (t1 - t0) : (((t0 / T) % 1) * T < D ? amp : 0);
}
// fastest repeating signal in the circuit (Hz): the simulation time step follows it
export function fastestFreq(c) {
  let f = 0;
  for (const p of c.parts) {
    if (p.type === 'SIG') f = Math.max(f, p.props.f);
    if (p.type === 'TL494') f = Math.max(f, TL_F.get(p.id) ?? 0);      // its own oscillator: at least 40 steps per cycle
    if (isBoard(p.type)) for (const q of Object.values(p.props.pins ?? {})) if (q.mode === 'pwm') f = Math.max(f, Math.min(500, q.f ?? 1000));   // pwmAvg keeps faster PWM exact on average
  }
  return f;
}
const R_WIRE = 1e-4, R_OPEN = 1e12, G_MIN = 1e-12;

export const rotPt = ([x, y], rot) => { for (let k = 0; k < (rot & 3); k++) [x, y] = [-y, x]; return [x, y]; };
export const pinsOf = (p) => TYPES[p.type].pins.map(q => { const [x, y] = rotPt(q, p.rot); return [p.x + x, p.y + y]; });
export const key = (x, y) => `${Math.round(x * 1000) / 1000},${Math.round(y * 1000) / 1000}`;

export function newCircuit() { return { v: 1, nextId: 1, parts: [], wires: [] }; }
export function addPart(c, type, x, y, rot = 0) {
  const t = TYPES[type];
  const n = c.parts.filter(p => p.type === type).length;
  let k = n + 1; const names = new Set(c.parts.map(p => p.name));
  while (names.has(t.prefix + k)) k++;
  const p = { id: c.nextId++, type, name: type === 'GND' ? 'GND' : t.prefix + k, x, y, rot, props: structuredClone(t.props) };
  c.parts.push(p);
  return p;
}
// does point (px,py) lie on segment (strictly inside)?
function onSeg(px, py, w) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return false;
  const cross = (px - w.x1) * dy - (py - w.y1) * dx;
  if (Math.abs(cross) > 1e-6 * Math.sqrt(l2)) return false;
  const t = ((px - w.x1) * dx + (py - w.y1) * dy) / l2;
  return t > 1e-6 && t < 1 - 1e-6;
}

// split wires at every pin / wire end lying on them (T junctions)
export function wirePieces(c) {
  const pts = [];
  for (const p of c.parts) for (const q of pinsOf(p)) pts.push(q);
  for (const w of c.wires) { pts.push([w.x1, w.y1]); pts.push([w.x2, w.y2]); }
  const out = [];
  c.wires.forEach((w, wi) => {
    const inner = pts.filter(([x, y]) => onSeg(x, y, w));
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy || 1;
    const ts = [...new Set(inner.map(([x, y]) => ((x - w.x1) * dx + (y - w.y1) * dy) / l2).map(t => +t.toFixed(9)))].sort((a, b) => a - b);
    const cuts = [0, ...ts, 1];
    for (let i = 0; i + 1 < cuts.length; i++) {
      const a = cuts[i], b = cuts[i + 1];
      out.push({ wi, x1: w.x1 + dx * a, y1: w.y1 + dy * a, x2: w.x1 + dx * b, y2: w.y1 + dy * b });
    }
  });
  return out;
}

// how many things meet at each point (for junction dots)
export function junctions(c) {
  const count = new Map();
  const add = (x, y) => { const k = key(x, y); count.set(k, (count.get(k) ?? 0) + 1); };
  for (const w of wirePieces(c)) { add(w.x1, w.y1); add(w.x2, w.y2); }
  for (const p of c.parts) for (const [x, y] of pinsOf(p)) add(x, y);
  return [...count.entries()].filter(([, n]) => n >= 3).map(([k]) => k.split(',').map(Number));
}

// LDR (GL5528 style): ≈ 10 kΩ at 10 lux, ≈ 1 kΩ in daylight, 1 MΩ dark
export const ldrOhms = (lux) => Math.max(100, Math.min(1e6, 15000 * Math.pow(Math.max(lux, 0.01) / 10, -0.75)));

// ---------- faults (Troubleshoot mode): break a part on purpose and measure it like on the bench ----------
// open = no connection between any pins · short = the two pins below welded together (others float) · weak = drifted value
export const FAULT_SHORT = { NPN: [1, 2], PNP: [1, 2], NMOS: [1, 2], PMOS: [1, 2], OPAMP: [3, 4], T555: [7, 0], TL494: [11, 6], REG: [0, 1], RELAY: [2, 4], OPTO: [2, 3], XFMR: [0, 1] };
const FAULTABLE = new Set(['R', 'POT', 'C', 'L', 'D', 'LED', 'ZD', 'LAMP', 'SW', 'PB', 'NPN', 'PNP', 'NMOS', 'PMOS', 'OPAMP', 'REG', 'T555', 'TL494', 'RELAY', 'OPTO', 'XFMR', 'BAT']);
export function faultOptions(type) {
  if (!FAULTABLE.has(type)) return [];
  const shortTxt = { NPN: 'shorted C–E (blown)', PNP: 'shorted C–E (blown)', NMOS: 'shorted D–S (blown)', PMOS: 'shorted D–S (blown)', OPAMP: 'shorted supply (dead chip)', T555: 'shorted VCC–GND (dead chip)', TL494: 'shorted VCC–GND (dead chip)', REG: 'shorted IN–OUT (blown)',
    RELAY: 'contacts welded (always ON)', OPTO: 'shorted output (always ON)', XFMR: 'shorted primary turns', SW: 'stuck closed', PB: 'stuck pressed', BAT: 'shorted cell' }[type] ?? 'shorted';
  const openTxt = { R: 'open (burnt)', C: 'open (broken lead)', L: 'open (broken wire)', LAMP: 'open (filament gone)', SW: 'stuck open', PB: 'never closes', BAT: 'dead / disconnected', XFMR: 'open winding', RELAY: 'dead (coil + contacts open)', POT: 'open (worn track)' }[type] ?? 'open (dead)';
  const o = [['ok', 'OK (working)'], ['open', openTxt], ['short', shortTxt]];
  const weak = { R: 'drifted high (×5)', C: 'dried out (10 % left)', BAT: 'low / weak' }[type];
  if (weak) o.push(['weak', weak]);
  return o;
}
export const faultOf = (p) => (FAULTABLE.has(p.type) && p.props.fault && p.props.fault !== 'ok' ? p.props.fault : null);
const deadFault = (p) => { const f = faultOf(p); return f === 'open' || f === 'short' ? f : null; };
function propsWithFault(p) {
  if (faultOf(p) !== 'weak') return p.props;
  const q = { ...p.props };
  if (p.type === 'R') q.r *= 5;
  if (p.type === 'C') q.c *= 0.1;
  if (p.type === 'BAT') { q.v *= 0.7; q.rint = (q.rint || 0) + 2; }
  return q;
}

// MOSFET: on-resistance falls as the gate voltage rises; saturation current k·(Vgs − Vth)²
export const fetRds = (m, vc) => m.rdson * Math.max(0.7, (m.vfull - m.vth) / Math.max(1e-3, vc - m.vth));
export const fetK = (m) => 3 * m.imax / (m.vfull - m.vth) ** 2;

// ---------- solver ----------
// sim = null → DC (capacitors open, inductors shorted). sim = { t, dt, state } → one time step (backward Euler).
// opts.sigOff: signal generators sit at their DC offset (used to start a time simulation from the DC operating point)
export function solveCircuit(c, sim = null, opts = {}) {
  const st = sim?.state ?? new Map();
  const grounds = c.parts.filter(p => p.type === 'GND');
  const nodeOf = new Map();       // point key -> node index (0 = ground)
  let nextNode = 1;
  const gkeys = new Set(grounds.map(g => key(...pinsOf(g)[0])));
  const node = (x, y) => {
    const k = key(x, y);
    if (gkeys.has(k)) return 0;
    if (!nodeOf.has(k)) nodeOf.set(k, nextNode++);
    return nodeOf.get(k);
  };
  const notes = [];
  const pieces = wirePieces(c);
  const els = [];       // {kind:'R'|'V'|'I', a, b, val, owner, role}
  const R = (a, b, val, owner, role) => els.push({ kind: 'R', a, b, val, owner, role });
  const V = (a, b, val, owner, role) => els.push({ kind: 'V', a, b, val, owner, role });
  const I = (a, b, val, owner, role) => els.push({ kind: 'I', a, b, val, owner, role });
  const inner = () => nextNode++;

  // auto ground if none: the − side of the first battery
  let autoGround = null;
  if (!grounds.length) {
    const b = c.parts.find(p => p.type === 'BAT'), mc = !b && c.parts.find(p => isBoard(p.type));
    if (b) { const [x, y] = pinsOf(b)[1]; gkeys.add(key(x, y)); autoGround = b.name; }
    else if (mc) { const gi = BOARDS[mc.type].pins.findIndex(q => q.k === 'gnd'); const [x, y] = pinsOf(mc)[gi]; gkeys.add(key(x, y)); autoGround = mc.name + ' GND'; }
  }
  pieces.forEach((w, k) => R(node(w.x1, w.y1), node(w.x2, w.y2), R_WIRE, null, 'wire' + k));
  const diodes = [], trans = [], fets = [], zeners = [], amps = [], regs = [], relays = [], timers = [], tls = [];
  for (const p of c.parts) {
    if (p.type === 'GND') continue;
    const pins = pinsOf(p).map(([x, y]) => node(x, y));
    const [a, b] = pins, pr = propsWithFault(p), dead = deadFault(p);
    if (dead === 'open') { for (let k = 1; k < pins.length; k++) R(pins[0], pins[k], R_OPEN, p, k === 1 ? 'main' : 'open' + k); continue; }
    if (dead === 'short') { const [i, j] = FAULT_SHORT[p.type] ?? [0, 1]; R(pins[i], pins[j], 0.01, p, 'main'); continue; }
    switch (p.type) {
      case 'R': R(a, b, Math.max(pr.r, 1e-6), p, 'main'); break;
      case 'POT': {
        const f = Math.min(1, Math.max(0, pr.pos / 100));
        R(a, pins[2], Math.max(pr.r * f, 1e-3), p, 'aw'); R(pins[2], b, Math.max(pr.r * (1 - f), 1e-3), p, 'wb'); break;
      }
      case 'BAT':
        if (pr.rint > 0) { const n = inner(); V(a, n, pr.v, p, 'main'); R(n, b, pr.rint, p, 'rint'); } else V(a, b, pr.v, p, 'main');
        break;
      case 'ISRC': I(a, b, pr.i, p, 'main'); break;
      case 'SW': case 'PB': R(a, b, pr.on ? R_WIRE : R_OPEN, p, 'main'); break;
      case 'SPDT': R(a, b, pr.on ? R_OPEN : R_WIRE, p, 'p1a'); R(a, pins[2], pr.on ? R_WIRE : R_OPEN, p, 'p1b'); break;
      case 'DPDT':
        R(a, b, pr.on ? R_OPEN : R_WIRE, p, 'p1a'); R(a, pins[2], pr.on ? R_WIRE : R_OPEN, p, 'p1b');
        R(pins[3], pins[4], pr.on ? R_OPEN : R_WIRE, p, 'p2a'); R(pins[3], pins[5], pr.on ? R_WIRE : R_OPEN, p, 'p2b');
        break;
      case 'LAMP': R(a, b, pr.vr * pr.vr / Math.max(pr.wr, 1e-6), p, 'main'); break;
      case 'VM': R(a, b, 10e6, p, 'main'); break;
      case 'AM': R(a, b, R_WIRE, p, 'main'); break;
      case 'C': {
        const s0 = st.get(p.id) ?? { v: 0 };
        if (sim) { const g = pr.c / sim.dt; R(a, b, 1 / g, p, 'main'); I(b, a, g * s0.v, p, 'hist'); } else R(a, b, R_OPEN, p, 'main');
        break;
      }
      case 'L': {
        const s0 = st.get(p.id) ?? { i: 0 }, n = inner();
        if (sim) { R(a, n, pr.l / sim.dt, p, 'main'); I(a, n, s0.i, p, 'hist'); } else R(a, n, R_WIRE, p, 'main');
        R(n, b, Math.max(pr.r, 1e-4), p, 'dcr');
        break;
      }
      case 'XFMR': {
        // ideal transformer + magnetizing inductance on winding A (P1–CT). Winding B (CT–P2) and the secondary (S1–S2) copy A's voltage × turns ratio,
        // and their currents are reflected back into A (power in = power out). Dots at P1 and S1.
        const [P1, CT, P2, S1, S2] = pins, s0 = st.get(p.id) ?? { im: 0 }, nA = inner(), nB = inner(), nS = inner(), n1 = Math.max(pr.n1, 1e-6);
        R(P1, nA, Math.max(pr.r1, 1e-4), p, 'r1');
        if (sim) { R(nA, CT, Math.max(pr.lm, 1e-9) / sim.dt, p, 'lm'); I(nA, CT, s0.im, p, 'hist'); } else R(nA, CT, R_OPEN, p, 'lm');   // DC: a transformer passes no DC (start with zero magnetizing current)
        R(CT, nB, Math.max(pr.r2, 1e-4), p, 'r2');
        const vb = { kind: 'V', a: nB, b: P2, val: 0, gp: nA, gn: CT, gain: pr.n2 / n1, owner: p, role: 'wb' }; els.push(vb);
        els.push({ kind: 'F', a: nA, b: CT, ctrl: vb, val: -pr.n2 / n1, owner: p, role: 'fb' });
        R(S1, nS, Math.max(pr.rs, 1e-4), p, 'rs');
        const vsx = { kind: 'V', a: nS, b: S2, val: 0, gp: nA, gn: CT, gain: pr.ns / n1, owner: p, role: 'ws' }; els.push(vsx);
        els.push({ kind: 'F', a: nA, b: CT, ctrl: vsx, val: -pr.ns / n1, owner: p, role: 'fs' });
        break;
      }
      case 'KEYPAD': for (let k = 1; k < 8; k++) R(pins[0], pins[k], R_OPEN, p, k === 1 ? 'main' : 'k' + k); break;   // key presses go to the sketch (Keypad library)
      case 'BUZZER': R(a, b, 3.3 / 0.012, p, 'main'); break;     // ≈ 12 mA at 3.3 V, 20 mA at 5 V
      case 'LOCK': {
        const s0 = st.get(p.id) ?? { i: 0 }, n = inner();
        if (sim) { R(a, n, Math.max(pr.l, 1e-6) / sim.dt, p, 'main'); I(a, n, s0.i, p, 'hist'); } else R(a, n, R_WIRE, p, 'main');
        R(n, b, Math.max(pr.r, 0.1), p, 'dcr');
        break;
      }
      case 'DHT': R(pins[0], pins[2], 3.3 / 0.0015, p, 'main'); R(pins[1], pins[0], 10000, p, 'pull'); break;       // VCC, DATA (10 kΩ pull-up on the module), GND
      case 'HCSR04': R(pins[0], pins[3], 5 / 0.015, p, 'main'); R(pins[1], pins[3], 100000, p, 'trig'); R(pins[2], pins[3], 1000, p, 'echo'); break;   // VCC, TRIG, ECHO (low between pulses), GND
      case 'LDR': R(a, b, ldrOhms(pr.lux), p, 'main'); break;
      case 'PIR': {
        // VCC, OUT, GND: OUT is 3.3 V while it sees motion (even on a 5 V supply), 0 V otherwise
        R(pins[0], pins[2], 5 / 0.00006, p, 'main'); const n2 = inner();
        V(n2, pins[2], pr.motion ? 3.3 : 0, p, 'src'); R(n2, pins[1], 1000, p, 'out');
        break;
      }
      case 'SR595': {
        // outputs push-pull (≈ 50 Ω to VCC or GND) from the storage register of the last step; inputs are CMOS (almost no current)
        const prev = st.get(p.id) ?? {}, [QB, QC, QD, QE, QF, QG, QH, Gp, QHs, MR, SH, ST, OE, SER, QA, Vp] = pins;
        R(Vp, Gp, 50000, p, 'main');
        [SER, SH, ST, MR, OE].forEach((n, k) => R(n, Gp, 1e8, p, 'in' + k));
        const outs = [QA, QB, QC, QD, QE, QF, QG, QH], q = prev.q ?? 0, sr = prev.sr ?? 0, pw = prev.pw ?? false;
        outs.forEach((n, k) => { if (pw && prev.en) R((q >> k) & 1 ? Vp : Gp, n, 50, p, 'q' + k); else R(n, Gp, R_OPEN, p, 'q' + k); });
        if (pw) R((sr >> 7) & 1 ? Vp : Gp, QHs, 50, p, 'qhs'); else R(QHs, Gp, R_OPEN, p, 'qhs');
        break;
      }
      case 'RMOD': {
        // IN pulls ≈ 3 mA through the opto LED (to VCC for LOW trigger, to GND for HIGH trigger); coil ≈ 70 Ω when on
        const prev = st.get(p.id), [Vp, Gp, IN, COM, NO, NC] = pins, on = !!prev?.on;
        if (pr.trig === 'high') R(IN, Gp, 1500, p, 'in'); else R(Vp, IN, 1500, p, 'in');
        R(Vp, Gp, on ? 70 : 100000, p, 'main');
        R(COM, NO, on ? R_WIRE : R_OPEN, p, 'no'); R(COM, NC, on ? R_OPEN : R_WIRE, p, 'nc');
        break;
      }
      case 'ENC': {
        // pins CLK, DT, SW, +, GND. _a / _b / _sw = contact closed right now (set by the schematic as the knob turns)
        const [A, Bp, SWp, Vp, Gp] = pins;
        R(A, Vp, 10000, p, 'main'); R(Bp, Vp, 10000, p, 'pb');
        R(A, Gp, pr._a ? 1 : R_OPEN, p, 'ca'); R(Bp, Gp, pr._b ? 1 : R_OPEN, p, 'cb'); R(SWp, Gp, pr._sw ? 1 : R_OPEN, p, 'csw');
        break;
      }
      case 'OLED': {
        // pins GND, VCC, SCL, SDA. ≈ 20 mA (3.3 V regulator on the module), 10 kΩ I2C pull-ups to VCC
        const [Gp, Vp, SCL, SDA] = pins;
        R(Vp, Gp, 220, p, 'main'); R(SDA, Vp, 10000, p, 'sda'); R(SCL, Vp, 10000, p, 'scl');
        break;
      }
      case 'LCD': {
        // pins GND, VCC, SDA, SCL. ≈ 25 mA (backlight + controller), 4.7 kΩ I2C pull-ups to VCC on the backpack
        const [Gp, Vp, SDA, SCL] = pins;
        R(Vp, Gp, 200, p, 'main'); R(SDA, Vp, 4700, p, 'sda'); R(SCL, Vp, 4700, p, 'scl');
        break;
      }
      case 'SEG7': {
        // 8 LEDs (a–g, dp) sharing one common pin: cathode (CC) or anode (CA)
        const m = LED_COLORS[pr.color] ?? LED_COLORS.red, cc = pr.common !== 'anode', prev = st.get(p.id)?.segOn ?? [];
        for (let k = 0; k < 8; k++) diodes.push({ p, a: cc ? pins[k] : pins[8], b: cc ? pins[8] : pins[k], vf: m.vf, rs: m.rs, on: !!prev[k], n: inner(), role: 'seg' + k });
        break;
      }
      case 'SIG': V(a, b, opts.sigOff ? pr.off : sigValue(pr, sim ? sim.t : 0), p, 'main'); break;
      case 'SCOPE': R(pins[0], pins[2], 10e6, p, 'ch1'); R(pins[1], pins[2], 10e6, p, 'ch2'); break;
      case 'OPTO': {
        const prev = st.get(p.id);
        const d = { p, a: pins[0], b: pins[1], vf: 1.2, rs: 5, on: prev?.on ?? false, n: inner(), role: 'led' };
        diodes.push(d);
        trans.push({ p, d, c: pins[2], e: pins[3], gain: pr.ctr / 100, vsat: 0.1, rsat: 4, vbr: Infinity, state: prev?.ts ?? 'off', n: inner() });
        break;
      }
      case 'NPN': case 'PNP': {
        const npn = p.type === 'NPN', m = BJTS[pr.model] ?? BJTS[npn ? '2N2222' : '2N2907'], prev = st.get(p.id), [B, Cc, E] = pins;
        // base-emitter junction: real diode curve (Newton steps), so small-signal gain comes out right in amplifiers
        const nj = m.vbe > 1 ? 2 : 1;
        const d = { p, a: npn ? B : E, b: npn ? E : B, vf: m.vbe - 0.15 * nj, rs: m.rb, on: prev?.on ?? false, n: inner(), role: 'be',
          exp: { vbe0: m.vbe, ib0: 1e-3 / m.beta, nvt: nj * 0.025852, rb: m.rb }, ib: prev?.ib ?? 1e-3 / m.beta };
        diodes.push(d);
        trans.push({ p, d, c: npn ? Cc : E, e: npn ? E : Cc, gain: m.beta, vsat: m.vsat, rsat: m.rsat, vbr: m.vmax * 1.3, state: prev?.ts ?? 'off', n: inner() });
        break;
      }
      case 'NMOS': case 'PMOS': {
        const nch = p.type === 'NMOS', m = FETS[pr.model] ?? FETS[nch ? 'IRLZ44N' : 'AO3401'], prev = st.get(p.id), [G, Dn, Sn] = pins;
        diodes.push({ p, a: nch ? Sn : Dn, b: nch ? Dn : Sn, vf: 0.8, rs: 0.02, on: prev?.bon ?? false, n: inner(), role: 'body' });
        fets.push({ p, m, g: G, s: Sn, hi: nch ? Dn : Sn, lo: nch ? Sn : Dn, sign: nch ? 1 : -1, vc: prev?.vc ?? 0, state: prev?.ts ?? 'off', vbr: m.vmax * 1.3, n: inner() });
        break;
      }
      case 'ZD': {
        const prev = st.get(p.id);
        const zm = zenerOf(pr);
        zeners.push({ p, a, b, vz: Math.max(0.5, zm.vz), rz: 2 + zm.vz, state: prev?.zs ?? 'off', n: inner() });
        break;
      }
      case 'OPAMP': {
        const m = AMPS[pr.model] ?? AMPS.LM358, prev = st.get(p.id), n = inner();
        I(pins[3], pins[4], m.iq, p, 'iq');
        R(n, pins[2], 20, p, 'rout');
        amps.push({ p, m, ip: pins[0], in: pins[1], out: pins[2], vp: pins[3], vn: pins[4], n, state: prev?.os ?? 'lin' });
        break;
      }
      case 'REG': {
        const m = REGS[pr.model] ?? REGS['7805'], prev = st.get(p.id), [IN, OUT, REF] = pins;
        if (m.iq) I(IN, REF, m.iq, p, 'iq');
        if (m.adj) I(IN, REF, m.iadj, p, 'iadj'); else R(OUT, REF, 100e3, p, 'int');
        regs.push({ p, m, i: IN, o: OUT, r: REF, state: prev?.rs ?? 'reg' });
        break;
      }
      case 'SERVO': {
        // pins: SIG, VCC, GND. Signal input ≈ 20 kΩ. Supply current: idle, or running while the arm moves.
        const m = SERVOS[pr.model] ?? SERVOS.SG90, prev = st.get(p.id);
        R(pins[0], pins[2], 20000, p, 'sig');
        R(pins[1], pins[2], 5 / (prev?.moving ? m.run : m.idle), p, 'load');
        break;
      }
      case 'STEPPER': {
        // A4988: pins STEP, DIR, EN (LOW = on, pulled down inside), VDD (logic 3–5.5 V), GND, VMOT (8–35 V)
        const prev = st.get(p.id), on = prev ? prev.en : true;
        R(pins[0], pins[4], 100000, p, 'step'); R(pins[1], pins[4], 100000, p, 'dir'); R(pins[2], pins[4], 100000, p, 'en');
        R(pins[3], pins[4], 1000, p, 'vdd');
        R(pins[5], pins[4], on ? 12 / Math.max(0.05, pr.ilim * 0.65) : 1e6, p, 'vmot');
        break;
      }
      case 'ESP32': case 'UNO': {
        // powered from USB. Every pin is what you set: OUTPUT = source with ≈ 25–30 Ω, inputs = high impedance (+ optional pull resistor)
        const B = BOARDS[p.type], cfg = pr.pins ?? {}, gi = B.pins.findIndex(q => q.k === 'gnd'), G = pins[gi], vccN = inner();
        V(vccN, G, B.vcc, p, 'vcc');
        B.pins.forEach((q, i) => {
          const nd = pins[i];
          if (q.k === 'gnd') { if (i !== gi) R(nd, G, R_WIRE, p, 'gndj'); return; }
          if (q.k === 'nc') { R(G, nd, 1e9, p, 'pin:' + q.n); return; }
          if (q.k === 'en') { R(vccN, nd, 10000, p, 'pin:' + q.n); return; }
          if (q.k === 'pwr') {
            if (q.v === B.vcc) R(vccN, nd, q.r, p, 'pin:' + q.n);
            else { const n2 = inner(); V(n2, G, q.v, p, 'src:' + q.n); R(n2, nd, q.r, p, 'pin:' + q.n); }
            return;
          }
          const m = cfg[q.n]?.mode ?? 'in';
          if (m === 'high') R(vccN, nd, B.rout, p, 'pin:' + q.n);
          else if (m === 'low') R(G, nd, B.rout, p, 'pin:' + q.n);
          else if (m === 'dac') { const n2 = inner(); V(n2, G, B.vcc * Math.max(0, Math.min(255, cfg[q.n].val ?? 0)) / 255, p, 'src:' + q.n); R(n2, nd, 1000, p, 'pin:' + q.n); }   // ESP32 DAC: 8 bit, weak output (≈ 1 kΩ)
          else if (m === 'pwm') {
            const c0 = cfg[q.n], n2 = inner();
            const val = sim ? pwmAvg(c0.f ?? 1000, c0.duty ?? 50, B.vcc, sim.t - sim.dt, sim.t) : B.vcc * (c0.duty ?? 50) / 100;
            V(n2, G, val, p, 'src:' + q.n); R(n2, nd, B.rout, p, 'pin:' + q.n);
          }
          else if (m === 'pu') R(vccN, nd, B.pullR, p, 'pin:' + q.n);
          else if (m === 'pd') R(G, nd, B.pullR, p, 'pin:' + q.n);
          else R(G, nd, 1e9, p, 'pin:' + q.n);
        });
        break;
      }
      case 'T555': {
        // pins: 1 GND, 2 TRIG, 3 OUT, 4 RESET, 5 CTRL, 6 THR, 7 DIS, 8 VCC. Inside: 3 × 5 kΩ divider (2/3 and 1/3 Vcc), two comparators, a latch.
        const m = TIMERS[pr.model] ?? TIMERS.NE555, prev = st.get(p.id), [G, TR, OUT, RST, CV, TH, DIS, VCC] = pins, n13 = inner(), no = inner();
        R(VCC, CV, 5000, p, 'div1'); R(CV, n13, 5000, p, 'div2'); R(n13, G, 5000, p, 'div3');
        R(VCC, G, 12 / m.iq, p, 'iq');           // supply current (≈ iq at 12 V), a resistor so an unpowered chip draws nothing
        R(no, OUT, m === TIMERS.NE555 ? 10 : 25, p, 'rout');
        timers.push({ p, m, G, TR, OUT, RST, CV, TH, DIS, VCC, n13, no, q: prev?.q ?? 0 });
        break;
      }
      case 'TL494': {
        // pins: 1IN+, 1IN−, FB, DTC, CT, RT, GND, C1, E1, E2, C2, VCC, OC, REF, 2IN−, 2IN+ (index = DIP pin − 1)
        const T = TL494, prev = st.get(p.id) ?? {}, [I1p, I1n, FB, DTC, CT, RT, G, C1, E1, E2, C2, VCC, OC, REF, I2n, I2p] = pins;
        R(VCC, G, 1700, p, 'main');                                   // ≈ 7 mA supply current at 12 V
        const nref = inner(), nrt = inner(), ref0 = prev.vref ?? 5;
        const vref = { kind: 'V', a: nref, b: G, val: ref0, owner: p, role: 'ref' }; els.push(vref); R(nref, REF, 1, p, 'rref');      // 5 V reference
        const vrt = { kind: 'V', a: nrt, b: G, val: ref0 * T.peak / 5, owner: p, role: 'rt' }; els.push(vrt); R(nrt, RT, 1, p, 'rrt');   // RT pin held at 3 V
        if (sim) els.push({ kind: 'F', a: VCC, b: CT, ctrl: vrt, val: -1, owner: p, role: 'ich' });   // CT charged with the same current that flows out of RT
        if (sim && prev.dis) { const nd = inner(); V(nd, G, prev.v0 ?? 0, p, 'disv'); R(nd, CT, 1e-3, p, 'dis'); }   // reset step: CT jumps back to the start of the ramp
        R(DTC, G, 1e8, p, 'dtc'); R(OC, G, 1e8, p, 'oc'); R(FB, G, 10000, p, 'fbpd');                 // FB: pulled down inside (≈ 0.3 mA at 3 V)
        const ea = [[I1p, I1n], [I2p, I2n]].map(([ip, inn], k) => {
          const n = inner(), eo = inner();
          R(n, eo, 20, p, 'ear' + k);
          const a = { p, m: T.ea, ip, in: inn, out: eo, vp: VCC, vn: G, n, state: prev.es?.[k] ?? 'low' }; amps.push(a);
          const d = { p, a: eo, b: FB, vf: 0.01, rs: 1, on: prev.ds?.[k] ?? false, n: inner(), role: 'ead' + k }; diodes.push(d);   // the two error amps are OR-ed onto FB
          return { a, d };
        });
        tls.push({ p, G, VCC, CT, DTC, FB, OC, REF, vref, vrt, ea, dis: !!prev.dis, ff: prev.ff ?? 0, pp: false, en: false,
          outs: [{ c: C1, e: E1, n: inner(), on: !!prev.o?.[0] }, { c: C2, e: E2, n: inner(), on: !!prev.o?.[1] }] });
        break;
      }
      case 'RELAY': {
        const prev = st.get(p.id), n = inner(), rm = relayOf(pr);
        if (sim) { R(pins[0], n, Math.max(rm.l, 1e-9) / sim.dt, p, 'coil'); I(pins[0], n, prev?.i ?? 0, p, 'hist'); } else R(pins[0], n, R_WIRE, p, 'coil');
        R(n, pins[1], Math.max(rm.rcoil, 1e-3), p, 'rc');
        relays.push({ p, com: pins[2], nc: pins[3], no: pins[4], on: prev?.on ?? false });
        break;
      }
      case 'LED': case 'D': {
        const m = p.type === 'LED' ? LED_COLORS[pr.color] ?? LED_COLORS.red : DIODES[pr.model] ?? DIODES['1N4007'];
        diodes.push({ p, a, b, vf: m.vf, rs: m.rs, on: st.get(p.id)?.on ?? false, n: inner(), role: 'main' });
        break;
      }
    }
  }
  if (!c.parts.some(p => p.type !== 'GND')) return { ok: false, error: 'Add some parts.' };
  if (!grounds.length && !autoGround) notes.push('No ground and no battery: voltages are measured from an arbitrary point.');
  if (autoGround) notes.push(`No ground symbol: the − side of ${autoGround} is used as 0 V.`);

  let res = null;
  const findEl = (list, owner, role, kind) => list.find(x => x.owner === owner && x.role === role && (!kind || x.kind === kind));
  for (let it = 0; it < 250; it++) {
    const all = [...els];
    for (const d of diodes) {
      d.was = d.on;
      if (d.on && d.exp) {
        // tangent of Vbe = vbe0 + n·Vt·ln(Ib / Ib0) at the last base current
        const X = d.exp, ib = Math.max(d.ib, 1e-12), rd = Math.min(1e8, X.nvt / ib), vj = X.vbe0 + X.nvt * Math.log(ib / X.ib0);
        all.push({ kind: 'V', a: d.a, b: d.n, val: vj - rd * ib, owner: d.p, role: d.role }); all.push({ kind: 'R', a: d.n, b: d.b, val: rd + X.rb, owner: d.p, role: d.role + 'rs' });
      } else if (d.on) { all.push({ kind: 'V', a: d.a, b: d.n, val: d.vf, owner: d.p, role: d.role }); all.push({ kind: 'R', a: d.n, b: d.b, val: d.rs, owner: d.p, role: d.role + 'rs' }); }
      else all.push({ kind: 'R', a: d.a, b: d.b, val: 1e10, owner: d.p, role: d.role });
    }
    for (const o of trans) {
      const st2 = o.d.was ? o.state : (o.state === 'brk' ? 'brk' : 'off');
      if (st2 === 'act') all.push({ kind: 'F', a: o.c, b: o.e, ctrl: findEl(all, o.p, o.d.role, 'V'), val: o.gain, owner: o.p, role: 'ce' });
      else if (st2 === 'sat') { all.push({ kind: 'V', a: o.c, b: o.n, val: o.vsat, owner: o.p, role: 'ce' }); all.push({ kind: 'R', a: o.n, b: o.e, val: o.rsat, owner: o.p, role: 'sat' }); }
      else if (st2 === 'brk') { all.push({ kind: 'V', a: o.c, b: o.n, val: o.vbr, owner: o.p, role: 'ce' }); all.push({ kind: 'R', a: o.n, b: o.e, val: 2, owner: o.p, role: 'sat' }); }
      else all.push({ kind: 'R', a: o.c, b: o.e, val: R_OPEN, owner: o.p, role: 'ce' });
    }
    for (const f of fets) {
      const m = f.m;
      if (f.state === 'ohm') all.push({ kind: 'R', a: f.hi, b: f.lo, val: fetRds(m, f.vc), owner: f.p, role: 'ch' });
      else if (f.state === 'sat') {
        const k = fetK(m), ov = Math.max(0, f.vc - m.vth), gm = 2 * k * ov, id0 = k * ov * ov;
        all.push({ kind: 'G', a: f.hi, b: f.lo, gp: f.g, gn: f.s, gain: gm * f.sign, val: id0 - gm * f.vc, owner: f.p, role: 'ch' });
      } else if (f.state === 'brk') { all.push({ kind: 'V', a: f.hi, b: f.n, val: f.vbr, owner: f.p, role: 'ch' }); all.push({ kind: 'R', a: f.n, b: f.lo, val: 2, owner: f.p, role: 'brkr' }); }
      else all.push({ kind: 'R', a: f.hi, b: f.lo, val: R_OPEN, owner: f.p, role: 'ch' });
    }
    for (const z of zeners) {
      if (z.state === 'fwd') { all.push({ kind: 'V', a: z.a, b: z.n, val: 0.7, owner: z.p, role: 'main' }); all.push({ kind: 'R', a: z.n, b: z.b, val: 0.1, owner: z.p, role: 'rs' }); }
      else if (z.state === 'rev') { all.push({ kind: 'V', a: z.b, b: z.n, val: z.vz, owner: z.p, role: 'main' }); all.push({ kind: 'R', a: z.n, b: z.a, val: z.rz, owner: z.p, role: 'rs' }); }
      else all.push({ kind: 'R', a: z.a, b: z.b, val: 1e10, owner: z.p, role: 'main' });
    }
    for (const o of amps) {
      if (o.state === 'high') all.push({ kind: 'V', a: o.vp, b: o.n, val: o.m.dh, owner: o.p, role: 'o' });
      else if (o.state === 'low') all.push({ kind: 'V', a: o.n, b: o.vn, val: o.m.dl, owner: o.p, role: 'o' });
      else all.push({ kind: 'V', a: o.n, b: 0, val: 0, gp: o.ip, gn: o.in, gain: o.m.a, owner: o.p, role: 'o' });
    }
    for (const g of regs) {
      const m = g.m;
      if (g.state === 'reg') all.push({ kind: 'V', a: g.o, b: g.r, ca: g.i, cb: g.o, val: m.vout, owner: g.p, role: 'pass' });
      else if (g.state === 'drop') all.push({ kind: 'V', a: g.i, b: g.o, val: m.drop, owner: g.p, role: 'pass' });
      else if (g.state === 'lim') all.push({ kind: 'I', a: g.i, b: g.o, val: m.ilim, owner: g.p, role: 'pass' });
      else all.push({ kind: 'R', a: g.i, b: g.o, val: R_OPEN, owner: g.p, role: 'pass' });
    }
    for (const t of timers) {
      if (t.q) all.push({ kind: 'V', a: t.VCC, b: t.no, val: t.m.dh, owner: t.p, role: 'o' }); else all.push({ kind: 'V', a: t.no, b: t.G, val: 0.1, owner: t.p, role: 'o' });
      all.push({ kind: 'R', a: t.DIS, b: t.G, val: t.q ? R_OPEN : 10, owner: t.p, role: 'dis' });
    }
    for (const t of tls) {
      t.outs.forEach((o, k) => {
        if (o.on) { all.push({ kind: 'V', a: o.c, b: o.n, val: TL494.vsat, owner: t.p, role: 'q' + k }); all.push({ kind: 'R', a: o.n, b: o.e, val: TL494.rsat, owner: t.p, role: 'qr' + k }); }
        else all.push({ kind: 'R', a: o.c, b: o.e, val: R_OPEN, owner: t.p, role: 'q' + k });
      });
    }
    for (const k of relays) {
      all.push({ kind: 'R', a: k.com, b: k.nc, val: k.on ? R_OPEN : R_WIRE, owner: k.p, role: 'nc' });
      all.push({ kind: 'R', a: k.com, b: k.no, val: k.on ? R_WIRE : R_OPEN, owner: k.p, role: 'no' });
    }
    res = mna(all, nextNode);
    if (!res) return { ok: false, error: 'Two voltage sources (batteries) are connected directly in parallel or shorted by a wire. Add a resistor.' };
    const V_ = res.v;
    let changed = false;
    for (const d of diodes) {
      const vd = V_[d.a] - V_[d.b];
      if (d.on) {
        const e = findEl(res.els, d.p, d.role);
        if (e.i < -1e-12) { d.on = false; changed = true; }
        else if (d.exp && d.was) {
          // Newton update of the base current (limit the step so it can't run away)
          const ni = Math.min(Math.max(e.i, d.ib * 1e-3, 1e-12), d.ib * 1e3 + 1e-9);
          if (Math.abs(ni - d.ib) > 1e-4 * d.ib + 1e-13) { d.ib = ni; changed = true; }
        }
      }
      else if (vd > d.vf + 1e-9) { d.on = true; changed = true; }
    }
    for (const o of trans) {
      const ce = findEl(res.els, o.p, 'ce'), vce = V_[o.c] - V_[o.e];
      const ib = o.d.was ? Math.max(0, findEl(res.els, o.p, o.d.role, 'V').i) : 0;
      let ns = o.state;
      if (o.state === 'brk') { if (ce.i < 0) ns = 'off'; }
      else if (!o.d.was || ib < 1e-12) ns = vce > o.vbr ? 'brk' : 'off';
      else if (o.state === 'off') ns = 'act';
      else if (o.state === 'act' && vce < o.vsat) ns = 'sat';
      else if (o.state === 'sat' && (ce.i > o.gain * ib * (1 + 1e-9) || ce.i < 0)) ns = 'act';
      if (ns !== o.state) { o.state = ns; changed = true; }
    }
    for (const f of fets) {
      const vc = f.sign * (V_[f.g] - V_[f.s]), vds = V_[f.hi] - V_[f.lo], m = f.m, ch = findEl(res.els, f.p, 'ch');
      if (Math.abs(vc - f.vc) > 1e-7 * Math.max(1, Math.abs(vc))) { f.vc = vc; changed = true; }
      const isat = fetK(m) * Math.max(0, f.vc - m.vth) ** 2;
      let ns = f.state;
      if (f.state === 'brk') { if (ch.i < 0) ns = 'off'; }
      else if (f.vc <= m.vth) ns = vds > f.vbr ? 'brk' : 'off';
      else if (f.state === 'off') ns = 'ohm';
      else if (f.state === 'ohm' && ch.i > isat) ns = 'sat';
      else if (f.state === 'sat' && vds < isat * fetRds(m, f.vc)) ns = 'ohm';
      if (ns !== f.state) { f.state = ns; changed = true; }
    }
    for (const z of zeners) {
      const vd = V_[z.a] - V_[z.b], e = findEl(res.els, z.p, 'main');
      let ns = z.state;
      if (z.state === 'off') { if (vd > 0.7 + 1e-9) ns = 'fwd'; else if (vd < -z.vz - 1e-9) ns = 'rev'; }
      else if (e.i < -1e-12) ns = 'off';
      if (ns !== z.state) { z.state = ns; changed = true; }
    }
    for (const o of amps) {
      const hi = V_[o.vp] - o.m.dh, lo = V_[o.vn] + o.m.dl, vo = V_[o.n], want = o.m.a * (V_[o.ip] - V_[o.in]);
      let ns = o.state;
      if (hi <= lo) ns = 'low';
      else if (o.state === 'lin') { if (vo > hi + 1e-9) ns = 'high'; else if (vo < lo - 1e-9) ns = 'low'; }
      else if (o.state === 'high') { if (want < hi) ns = want < lo ? 'low' : 'lin'; }
      else if (want > lo) ns = want > hi ? 'high' : 'lin';
      if (ns !== o.state) { o.state = ns; changed = true; }
    }
    for (const g of regs) {
      const m = g.m, j = findEl(res.els, g.p, 'pass').i, vin = V_[g.i], vo = V_[g.o], vr = V_[g.r];
      let ns = g.state;
      if (g.state === 'reg') { if (vin - vo < m.drop - 1e-9) ns = 'drop'; else if (j > m.ilim) ns = 'lim'; else if (j < -1e-6) ns = 'off'; }
      else if (g.state === 'drop') { if (vo - vr > m.vout + 1e-9) ns = 'reg'; else if (j < -1e-9) ns = 'off'; }
      else if (g.state === 'lim') { if (vo - vr > m.vout + 1e-9) ns = 'reg'; else if (vin - vo < m.drop - 1e-9) ns = 'drop'; }
      else if (vo - vr < m.vout - 1e-3 && vin - vo > 1e-3) ns = vin - vo >= m.drop ? 'reg' : 'drop';
      if (ns !== g.state) { g.state = ns; changed = true; }
    }
    // relays only switch once everything else has settled (avoids pull-in from a half-solved step)
    // 555 latch: RESET low → 0; TRIG below 1/3 → 1 (wins); THR above 2/3 → 0; otherwise keep
    for (const t of timers) {
      const vg = V_[t.G], vcc = V_[t.VCC] - vg, lo = V_[t.n13], hi = V_[t.CV];
      let q = t.q;
      if (vcc < 1 || V_[t.RST] - vg < 0.7) q = 0;
      else if (V_[t.TR] < lo) q = 1;
      else if (V_[t.TH] > hi) q = 0;
      if (q !== t.q) { t.q = q; changed = true; }
    }
    // TL494: reference follows the supply below 7 V; outputs ON while the ramp on CT is above both DTC + 0.11 V and FB − 0.7 V.
    // OUTPUT CTRL (pin 13) HIGH = push-pull (the flip-flop gives alternate cycles to Q1 / Q2), LOW = both outputs together.
    for (const t of tls) {
      const T = TL494, vg = V_[t.G], vcc = V_[t.VCC] - vg, ref = Math.min(5, Math.max(0, vcc - 2));
      if (Math.abs(ref - t.vref.val) > 1e-6) { t.vref.val = ref; t.vrt.val = ref * T.peak / 5; changed = true; }
      const vct = V_[t.CT] - vg;
      t.en = vcc >= T.vmin && !t.dis && vct > V_[t.DTC] - vg + T.dtcOff && vct > V_[t.FB] - vg - T.pwmOff;
      t.pp = V_[t.OC] - vg > 2;
      const want = t.pp ? [t.en && t.ff === 0, t.en && t.ff === 1] : [t.en, t.en];
      t.outs.forEach((o, k) => {
        let on = o.on;
        if (!want[k]) on = false;
        else if (!o.on) on = V_[o.c] - V_[o.e] > T.vsat + 1e-9;
        else if ((findEl(res.els, t.p, 'q' + k, 'V')?.i ?? 0) < -1e-12) on = false;
        if (on !== o.on) { o.on = on; changed = true; }
      });
    }
    if (!changed) for (const k of relays) {
      const rm = relayOf(k.p.props), ic = Math.abs(findEl(res.els, k.p, 'rc').i), inom = rm.vcoil / Math.max(rm.rcoil, 1e-3);
      const on = k.on ? ic >= 0.3 * inom : ic >= 0.75 * inom;
      if (on !== k.on) { k.on = on; changed = true; }
    }
    if (!changed) break;
    if (it === 249) notes.push('Some parts did not settle (diodes / transistors / op-amps flip-flopping); results are approximate.');
  }
  // per-part results
  const parts = new Map();
  for (const p of c.parts) {
    if (p.type === 'GND') continue;
    const pins = pinsOf(p).map(([x, y]) => node(x, y));
    const va = res.v[pins[0]], vb = res.v[pins[1]];
    const mine = res.els.filter(e => e.owner === p);
    let i = 0, pw = 0;
    const dead = deadFault(p);
    if (dead) {
      const m = mine.find(e => e.role === 'main'), [si2, sj] = dead === 'short' ? (FAULT_SHORT[p.type] ?? [0, 1]) : [0, 1];
      const v = res.v[pins[si2]] - res.v[pins[sj]];
      parts.set(p.id, { va, vb, v, i: m ? m.i : 0, p: m ? m.i * m.i * m.val : 0, fault: dead, dots: dead === 'short' ? [[si2, sj, m ? m.i : 0]] : [] });
      continue;
    }
    const main = mine.find(e => e.role === 'main');
    if (p.type === 'POT') {
      const aw = mine.find(e => e.role === 'aw'), wb = mine.find(e => e.role === 'wb');
      parts.set(p.id, { va, vb, vw: res.v[pins[2]], v: va - vb, iaw: aw.i, iwb: wb.i, i: aw.i, p: aw.i * aw.i * aw.val + wb.i * wb.i * wb.val });
      continue;
    }
    if (p.type === 'SPDT' || p.type === 'DPDT') {
      const cur = (role) => mine.find(e => e.role === role)?.i ?? 0;
      const i1 = p.props.on ? cur('p1b') : cur('p1a'), i2 = p.type === 'DPDT' ? (p.props.on ? cur('p2b') : cur('p2a')) : 0;
      parts.set(p.id, { va, vb, v: 0, i: i1, i1, i2, p: 0 });
      continue;
    }
    if (p.type === 'C') {
      const s0 = st.get(p.id) ?? { v: 0 }, v = va - vb;
      const ic = sim ? (propsWithFault(p).c / sim.dt) * (v - s0.v) : 0;
      parts.set(p.id, { va, vb, v, i: ic, p: v * ic, energy: 0.5 * propsWithFault(p).c * v * v });
      continue;
    }
    if (p.type === 'L') {
      const s0 = st.get(p.id) ?? { i: 0 }, m = mine.find(e => e.role === 'main');
      const il = sim ? m.i + s0.i : m.i;
      parts.set(p.id, { va, vb, v: va - vb, i: il, p: (va - vb) * il, energy: 0.5 * p.props.l * il * il });
      continue;
    }
    if (p.type === 'XFMR') {
      const s0 = st.get(p.id) ?? { im: 0 }, g = (role) => mine.find(e => e.role === role), lm = g('lm');
      const im = sim ? lm.i + s0.im : lm.i, i1 = g('r1').i, i2 = g('r2').i, is = g('rs').i;
      const v1 = res.v[pins[0]] - res.v[pins[1]], v2 = res.v[pins[1]] - res.v[pins[2]], vs = res.v[pins[3]] - res.v[pins[4]];
      const pin = v1 * i1 + v2 * i2, pout = -vs * is;
      parts.set(p.id, { va, vb, v1, v2, vs, i1, i2, is, im, v: v1, i: i1, pin, pout, p: pin - pout, dots: [[0, 1, i1], [1, 2, i2], [3, 4, is]] });
      continue;
    }
    if (p.type === 'LOCK') {
      const s0 = st.get(p.id) ?? { i: 0 }, m = mine.find(e => e.role === 'main'), il = sim ? m.i + s0.i : m.i, inom = p.props.v / Math.max(p.props.r, 0.1);
      parts.set(p.id, { va, vb, v: va - vb, i: il, p: (va - vb) * il, open: Math.abs(il) > 0.5 * inom, inom });
      continue;
    }
    if (p.type === 'DHT' || p.type === 'HCSR04' || p.type === 'PIR') {
      const m = mine.find(e => e.role === 'main'), gi = p.type === 'HCSR04' ? 3 : 2, v = res.v[pins[0]] - res.v[pins[gi]];
      parts.set(p.id, { va, vb, v, i: m.i, p: v * m.i, vout: res.v[pins[1 + (p.type === 'HCSR04' ? 1 : 0)]] - res.v[pins[gi]], dots: [] });
      continue;
    }
    if (p.type === 'SR595') {
      const [, , , , , , , Gp, , MR, SH, ST, OE, SER, , Vp] = pins, g = res.v[Gp], vcc = res.v[Vp] - g, prev = st.get(p.id) ?? {};
      const hct = p.props.model === '74HCT595', hi = hct ? 2.0 : 0.7 * vcc, lo = hct ? 0.8 : 0.3 * vcc, bad = [];
      const lvl = (n, last, name) => { const v = res.v[n] - g; if (v >= hi) return 1; if (v <= lo) return 0; bad.push(name); return last; };
      const pw = vcc > 1.8, sh = lvl(SH, prev.sh ?? 0, 'SRCLK'), stc = lvl(ST, prev.stc ?? 0, 'RCLK'), mr = lvl(MR, 1, 'SRCLR'), oe = lvl(OE, 0, 'OE'), ser = lvl(SER, prev.ser ?? 0, 'SER');
      let sr = prev.sr ?? 0, q = prev.q ?? 0;
      if (!pw) { sr = 0; q = 0; }
      else {
        if (stc && !prev.stc) q = sr;                         // storage clock: copies the shift register as it was before this edge
        if (!mr) sr = 0; else if (sh && !prev.sh) sr = ((sr << 1) | ser) & 0xFF;   // shift clock: QA ← SER, QB ← QA … QH' ← QH
      }
      const m = mine.find(e => e.role === 'main');
      parts.set(p.id, { va, vb, v: vcc, i: m.i, p: vcc * m.i, sr, q, sh, stc, ser, en: pw && !oe, pw, mr, bad: pw && vcc > 2 ? bad : [], hi, lo, dots: [] });
      continue;
    }
    if (p.type === 'RMOD') {
      const [Vp, Gp, IN] = pins, g = res.v[Gp], vcc = res.v[Vp] - g, vin = res.v[IN] - g, prev = st.get(p.id);
      const drive = p.props.trig === 'high' ? vin : vcc - vin, on = vcc > 3.5 && drive > (prev?.on ? 1.6 : 2.0);   // opto LED + transistor need ≈ 2 V on IN
      const m = mine.find(e => e.role === 'main');
      parts.set(p.id, { va, vb, v: vcc, i: m.i, p: vcc * m.i, on, vin, drive, dots: [] });
      continue;
    }
    if (p.type === 'ENC') {
      const g = res.v[pins[4]];
      parts.set(p.id, { va, vb, v: res.v[pins[3]] - g, vclk: res.v[pins[0]] - g, vdt: res.v[pins[1]] - g, vsw: res.v[pins[2]] - g, i: 0, p: 0, dots: [] });
      continue;
    }
    if (p.type === 'OLED') {
      const m = mine.find(e => e.role === 'main'), v = res.v[pins[1]] - res.v[pins[0]];
      parts.set(p.id, { va, vb, v, i: m.i, p: v * m.i, vsda: res.v[pins[3]] - res.v[pins[0]], vscl: res.v[pins[2]] - res.v[pins[0]], dots: [[1, 0, m.i]] });
      continue;
    }
    if (p.type === 'LCD') {
      const m = mine.find(e => e.role === 'main'), v = res.v[pins[1]] - res.v[pins[0]];
      parts.set(p.id, { va, vb, v, i: m.i, p: v * m.i, vsda: res.v[pins[2]] - res.v[pins[0]], vscl: res.v[pins[3]] - res.v[pins[0]], dots: [[1, 0, m.i]] });
      continue;
    }
    if (p.type === 'SEG7') {
      const ds = diodes.filter(d => d.p === p), segs = ds.map((d, k) => (d.on ? (mine.find(e => e.role === 'seg' + k && e.kind === 'V')?.i ?? 0) : 0));
      const vf = (LED_COLORS[p.props.color] ?? LED_COLORS.red).vf, tot = segs.reduce((x, y) => x + y, 0);
      parts.set(p.id, { va, vb, v: 0, i: tot, segs, segOn: ds.map(d => d.on), p: segs.reduce((x, y) => x + y * vf, 0), dots: [] });
      continue;
    }
    if (p.type === 'SCOPE') { parts.set(p.id, { ch1: res.v[pins[0]] - res.v[pins[2]], ch2: res.v[pins[1]] - res.v[pins[2]], v: 0, i: 0, p: 0 }); continue; }
    if (p.type === 'OPTO' || p.type === 'NPN' || p.type === 'PNP') {
      const o = trans.find(x => x.p === p), d = o.d, inV = d.on ? mine.find(e => e.role === d.role && e.kind === 'V') : null, ce = mine.find(e => e.role === 'ce');
      const iin = inV ? inV.i : 0, ic = ce.kind === 'F' ? ce.i : ce.i, state = d.on || o.state === 'brk' ? o.state : 'off';
      if (p.type === 'OPTO') {
        const vce = res.v[pins[2]] - res.v[pins[3]];
        parts.set(p.id, { va, vb, v: va - vb, i: iin, ifw: iin, ic, vce, state, on: d.on, p: (va - vb) * iin + vce * ic, dots: [[0, 1, iin], [2, 3, ic]] });
      } else {
        const npn = p.type === 'NPN', sg = npn ? 1 : -1, vbe = sg * (res.v[pins[0]] - res.v[pins[2]]), vce = sg * (res.v[pins[1]] - res.v[pins[2]]);   // PNP: Veb, Vec
        // ib: into the base (NPN) / out of the base (PNP); ic: into collector (NPN) / out of collector (PNP), both shown positive when working normally
        parts.set(p.id, { va, vb, vbe, vce, ib: iin, ic, ie: iin + ic, state, on: d.on, v: vce, i: ic, p: Math.abs(vbe * iin) + Math.abs(vce * ic),
          dots: npn ? [[0, 2, iin], [1, 2, ic]] : [[2, 0, iin], [2, 1, ic]] });
      }
      continue;
    }
    if (p.type === 'NMOS' || p.type === 'PMOS') {
      const f = fets.find(x => x.p === p), ch = mine.find(e => e.role === 'ch'), body = diodes.find(x => x.p === p), bel = mine.find(e => e.role === 'body');
      const ich = ch.kind === 'G' ? ch.val + ch.gain * (res.v[ch.gp] - res.v[ch.gn]) : ch.i;
      const ib = body.on ? bel.i : 0, id = ich - ib;             // channel current (D→S for N, S→D for P), minus body diode
      const vgs = f.sign * (res.v[pins[0]] - res.v[pins[2]]), vds = f.sign * (res.v[pins[1]] - res.v[pins[2]]);   // PMOS: Vsg, Vsd
      const rds = f.state === 'ohm' ? fetRds(f.m, f.vc) : null;
      parts.set(p.id, { va, vb, vgs, vds, id, state: f.state, body: body.on, rds, v: vds, i: id, p: Math.abs((res.v[f.hi] - res.v[f.lo]) * id),
        dots: p.type === 'NMOS' ? [[1, 2, id]] : [[2, 1, id]] });
      continue;
    }
    if (p.type === 'ZD') {
      const z = zeners.find(x => x.p === p), e = mine.find(x => x.role === 'main');
      const iz = z.state === 'fwd' ? e.i : z.state === 'rev' ? -e.i : e.i;
      parts.set(p.id, { va, vb, v: va - vb, i: iz, p: Math.abs((va - vb) * iz), state: z.state, on: z.state !== 'off' });
      continue;
    }
    if (p.type === 'OPAMP') {
      const o = amps.find(x => x.p === p), ro = mine.find(e => e.role === 'rout');
      const vout = res.v[pins[2]], iout = ro.i, vsup = res.v[pins[3]] - res.v[pins[4]];
      parts.set(p.id, { va, vb, vout, vdiff: va - vb, iout, vsup, state: o.state, v: vout, i: iout, p: o.m.iq * vsup + Math.abs(iout) * (iout > 0 ? res.v[pins[3]] - vout : vout - res.v[pins[4]]), dots: [] });
      continue;
    }
    if (p.type === 'REG') {
      const g = regs.find(x => x.p === p), e = mine.find(x => x.role === 'pass');
      const j = e.kind === 'I' ? e.val : e.i, vin = res.v[pins[0]], vout = res.v[pins[1]], vref = res.v[pins[2]], iq = (g.m.iq ?? 0) + (g.m.iadj ?? 0);
      const gr = g.m.adj ? 0 : vref;
      parts.set(p.id, { va, vb, vin: vin - gr, vout: vout - gr, vadj: vout - vref, vio: vin - vout, iin: j + iq, iout: j, state: g.state, v: vout - gr, i: j, p: (vin - vout) * j + (vin - vref) * iq, dots: [] });
      continue;
    }
    if (p.type === 'SERVO') {
      // pulse width = time the signal is high, added up step by step (a step that is partly high counts partly)
      const m = SERVOS[p.props.model] ?? SERVOS.SG90, prev = st.get(p.id) ?? { ang: 90, tgt: 90, acc: 0, hi: 0, vh: 0, w: null };
      const vg = res.v[pins[2]], vs = res.v[pins[0]] - vg, vcc = res.v[pins[1]] - vg, load = mine.find(e => e.role === 'load');
      let { ang, tgt, acc, hi, vh, w } = prev;
      if (sim) {
        vh = Math.max(vh * 0.9999, vs);
        const fr = vh > 1.2 ? Math.max(0, Math.min(1, vs / vh)) : 0, now = fr > 0.02 ? 1 : 0;
        if (now) acc += fr * sim.dt;
        if (!now && hi) { const pw = acc; if (pw > 0.3e-3 && pw < 3e-3) { w = pw; tgt = Math.max(0, Math.min(180, (pw - 0.5e-3) / 2e-3 * 180)); } acc = 0; }
        if (!now) acc = 0;
        hi = now;
        if (vcc >= m.vmin * 0.9) { const stp = m.speed * sim.dt; ang = Math.abs(tgt - ang) <= stp ? tgt : ang + Math.sign(tgt - ang) * stp; }
      }
      parts.set(p.id, { va, vb, vsig: vs, vcc, icc: load.i, ang, tgt, w, moving: Math.abs(tgt - ang) > 0.5, v: vcc, i: load.i, p: vcc * load.i, acc, hi, vh, dots: [] });
      continue;
    }
    if (p.type === 'STEPPER') {
      const pr2 = p.props, prev = st.get(p.id) ?? { ang: 0, lvl: 0, n: 0, en: true, last: null, rate: 0 };
      const vg = res.v[pins[4]], vdd = res.v[pins[3]] - vg, vmot = res.v[pins[5]] - vg, thr = 0.7 * Math.max(vdd, 1);
      const stepHi = res.v[pins[0]] - vg > thr ? 1 : 0, dirHi = res.v[pins[1]] - vg > thr, en = !(res.v[pins[2]] - vg > thr) && vdd > 3 && vmot > 8;
      let { ang, lvl, n, last, rate } = prev; const t = sim ? sim.t : 0;
      if (sim && en && stepHi && !lvl) {
        const d = (dirHi ? 1 : -1) * 360 / pr2.steps / pr2.micro; ang = ((ang + d) % 360 + 360) % 360; n += dirHi ? 1 : -1;
        if (last != null) rate = 1 / Math.max(1e-6, t - last); last = t;
      }
      if (sim && last != null && t - last > 0.5) rate = 0;
      const im = mine.find(e => e.role === 'vmot');
      parts.set(p.id, { va, vb, ang, lvl: stepHi, n, last, rate, en, dir: dirHi, vdd, vmot, imot: im.i, rpm: rate * 60 / pr2.steps / pr2.micro * (dirHi ? 1 : -1), v: vmot, i: im.i, p: vmot * im.i, dots: [] });
      continue;
    }
    if (isBoard(p.type)) {
      const B = BOARDS[p.type], gi = B.pins.findIndex(q => q.k === 'gnd'), vg = res.v[pins[gi]], out = {};
      let pw = 0;
      B.pins.forEach((q, i) => {
        if (q.k === 'gnd') return;
        const e = mine.find(x => x.role === 'pin:' + q.n), v = res.v[pins[i]] - vg, cur = e ? e.i : 0;
        out[q.n] = { v, i: cur, mode: q.k === 'gpio' ? (p.props.pins?.[q.n]?.mode ?? 'in') : q.k };
        if (q.k === 'pwr' || (q.k === 'gpio' && /high|pwm/.test(out[q.n].mode))) pw += Math.max(0, cur) * Math.max(0, v);
      });
      const vcc = mine.find(x => x.role === 'vcc');
      parts.set(p.id, { va, vb, pins: out, v: 0, i: 0, p: pw, isrc: vcc ? -vcc.i : 0, dots: [] });
      continue;
    }
    if (p.type === 'T555') {
      const t = timers.find(x => x.p === p), ro = mine.find(e => e.role === 'rout'), dis = mine.find(e => e.role === 'dis'), o = mine.find(e => e.role === 'o');
      const vg = res.v[t.G], vcc = res.v[t.VCC] - vg;
      const pw = Math.abs(o.i * o.val) + vcc * vcc / (12 / t.m.iq) + Math.abs(ro.i) * Math.abs(ro.i) * ro.val + (t.q ? 0 : dis.i * dis.i * dis.val);
      parts.set(p.id, { va, vb, q: t.q, vcc, vout: res.v[t.OUT] - vg, iout: ro.i, vtrig: res.v[t.TR] - vg, vthr: res.v[t.TH] - vg, vlo: res.v[t.n13] - vg, vhi: res.v[t.CV] - vg, idis: t.q ? 0 : dis.i, v: res.v[t.OUT] - vg, i: ro.i, p: pw, dots: [] });
      continue;
    }
    if (p.type === 'TL494') {
      const T = TL494, t = tls.find(x => x.p === p), vg = res.v[t.G], vcc = res.v[t.VCC] - vg, g = (role) => mine.find(e => e.role === role);
      const prev = st.get(p.id) ?? {}, vct = res.v[t.CT] - vg, peak = t.vrt.val, irt = -(g('rt')?.i ?? 0), iref = -(g('ref')?.i ?? 0);
      const ic = t.outs.map((o, k) => (o.on ? g('q' + k).i : 0));
      // oscillator: start discharging at the peak (the flip-flop toggles), back to charging near 0 V. Pulse widths are added up per cycle.
      let dis = t.dis, ff = t.ff, tl = prev.tl ?? null, per = prev.per ?? null, v0 = 0, acc = prev.acc ? [...prev.acc] : [0, 0], w = prev.w ? prev.w.map(x => [...x]) : [[0, 0], [0, 0]];
      if (sim) {
        t.outs.forEach((o, k) => { if (o.on) acc[k] += sim.dt; });
        if (dis) dis = false;                                       // the reset takes one step (outputs off: part of the dead time)
        else if (vcc >= T.vmin && peak > 0.5 && vct >= peak) {
          // the ramp crossed the peak inside this step: find when (straight line), so the period comes out exact
          const slope = prev.vct != null && vct > prev.vct ? (vct - prev.vct) / sim.dt : 0, tc = slope ? sim.t - (vct - peak) / slope : sim.t;
          dis = true; ff ^= 1; v0 = Math.min(peak, Math.max(0, (sim.t + sim.dt - tc) * slope));
          if (tl != null) per = tc - tl;
          tl = tc; w = [[acc[0], w[0][0]], [acc[1], w[1][0]]]; acc = [0, 0];
        }
        const est = per ? 1 / per : (prev.vct != null && vct > prev.vct && peak > 0.5 ? (vct - prev.vct) / sim.dt / peak : 0);
        if (est) TL_F.set(p.id, est);
      }
      const duty = per ? w.map(x => Math.min(1, t.pp ? (x[0] + x[1]) / (2 * per) : x[0] / per)) : null;
      const pw = vcc * g('main').i + ic.reduce((s2, x) => s2 + Math.abs(x) * (T.vsat + Math.abs(x) * T.rsat), 0) + Math.max(0, iref) * Math.max(0, vcc - 5);
      parts.set(p.id, { va, vb, v: vcc, i: g('main').i, p: pw, vcc, vref: res.v[t.REF] - vg, iref, vct, peak, vdtc: res.v[t.DTC] - vg, vfb: res.v[t.FB] - vg, irt,
        q: t.outs.map(o => o.on), ic, pp: t.pp, f: per ? 1 / per : null, per, duty, dis, v0, ff, tl, acc, w, es: t.ea.map(x => x.a.state), ds: t.ea.map(x => x.d.on), on: vcc >= T.vmin, dots: [] });
      continue;
    }
    if (p.type === 'RELAY') {
      const k = relays.find(x => x.p === p), rc = mine.find(e => e.role === 'rc'), nc = mine.find(e => e.role === 'nc'), no = mine.find(e => e.role === 'no');
      const ic = rc.i, icon = k.on ? no.i : nc.i;
      parts.set(p.id, { va, vb, v: va - vb, i: ic, icoil: ic, on: k.on, icon, p: ic * ic * rc.val, dots: [[0, 1, ic], k.on ? [2, 4, no.i] : [2, 3, nc.i]] });
      continue;
    }
    i = main ? main.i : 0;
    pw = mine.reduce((s, e) => s + (e.kind === 'R' ? e.i * e.i * e.val : e.kind === 'V' ? e.val * e.i : e.val * (res.v[e.a] - res.v[e.b])), 0);
    const d = diodes.find(x => x.p === p);
    parts.set(p.id, { va, vb, v: va - vb, i, p: pw, on: d ? d.on : undefined });
  }
  for (const p of c.parts) if (p.type === 'BAT' && Math.abs(parts.get(p.id).i) > 50) notes.push(`SHORT CIRCUIT: ${p.name} is shorted (${Math.abs(parts.get(p.id).i).toFixed(0)} A). Real batteries get hot, wires melt, fuses blow.`);
  const wires = pieces.map((w, k) => ({ ...w, i: res.els.find(e => e.role === 'wire' + k).i, va: res.v[node(w.x1, w.y1)], vb: res.v[node(w.x2, w.y2)] }));
  const vAt = (x, y) => { const k = key(x, y); if (gkeys.has(k)) return 0; const n = nodeOf.get(k); return n == null ? null : res.v[n]; };
  const sources = c.parts.filter(p => p.type === 'BAT' || p.type === 'ISRC' || p.type === 'SIG');
  const delivered = sources.reduce((s, p) => s - parts.get(p.id).p, 0) + c.parts.filter(p => isBoard(p.type)).reduce((s, p) => s + parts.get(p.id).p, 0);
  // state to carry into the next time step
  const next = new Map();
  for (const p of c.parts) {
    const r = parts.get(p.id); if (!r || r.fault) continue;
    if (p.type === 'C') next.set(p.id, { v: r.v });
    else if (p.type === 'L') next.set(p.id, { i: r.i });
    else if (p.type === 'XFMR') next.set(p.id, { im: r.im });
    else if (p.type === 'LOCK') next.set(p.id, { i: r.i });
    else if (p.type === 'LED' || p.type === 'D') next.set(p.id, { on: r.on });
    else if (p.type === 'OPTO' || p.type === 'NPN' || p.type === 'PNP') { const o = trans.find(x => x.p === p); next.set(p.id, { on: o.d.on, ts: o.state, ib: o.d.ib }); }
    else if (p.type === 'NMOS' || p.type === 'PMOS') { const f = fets.find(x => x.p === p); next.set(p.id, { ts: f.state, vc: f.vc, bon: diodes.find(x => x.p === p).on }); }
    else if (p.type === 'ZD') next.set(p.id, { zs: r.state });
    else if (p.type === 'OPAMP') next.set(p.id, { os: r.state });
    else if (p.type === 'REG') next.set(p.id, { rs: r.state });
    else if (p.type === 'RELAY') next.set(p.id, { i: r.icoil, on: r.on });
    else if (p.type === 'T555') next.set(p.id, { q: r.q });
    else if (p.type === 'TL494') next.set(p.id, { vref: tls.find(x => x.p === p).vref.val, dis: r.dis, v0: r.v0, ff: r.ff, tl: r.tl, per: r.per, acc: r.acc, w: r.w, o: r.q, es: r.es, ds: r.ds, vct: r.vct });
    else if (p.type === 'SR595') next.set(p.id, { sr: r.sr, q: r.q, sh: r.sh, stc: r.stc, ser: r.ser, en: r.en, pw: r.pw });
    else if (p.type === 'RMOD') next.set(p.id, { on: r.on });
    else if (p.type === 'SEG7') next.set(p.id, { segOn: r.segOn });
    else if (p.type === 'SERVO') next.set(p.id, { ang: r.ang, tgt: r.tgt, acc: r.acc, hi: r.hi, vh: r.vh, w: r.w, moving: r.moving });
    else if (p.type === 'STEPPER') next.set(p.id, { ang: r.ang, lvl: r.lvl, n: r.n, en: r.en, last: r.last, rate: r.rate });
  }
  return { ok: true, parts, wires, vAt, notes, delivered, nodes: nextNode, next, t: sim?.t ?? 0 };
}

// Modified Nodal Analysis with a tiny conductance to ground on every node (so open parts never make it unsolvable)
function mna(els, nNodes) {
  // R: resistor · I: current a→b · V: v(a) − v(b) − gain·(v(gp) − v(gn)) = val, its current flows ca→cb (default a→b)
  // F: current val × (current of V element ctrl), a→b · G: current val + gain·(v(gp) − v(gn)), a→b
  const vs = els.filter(e => e.kind === 'V');
  const vIdx = new Map(vs.map((e, k) => [e, k]));
  const N = nNodes - 1, M = N + vs.length;
  const A = Array.from({ length: M }, () => new Float64Array(M)), z = new Float64Array(M);
  const r = n => n - 1;
  for (let k = 0; k < N; k++) A[k][k] += G_MIN;
  for (const e of els) {
    const ia = r(e.a), ib = r(e.b);
    if (e.kind === 'R') {
      const g = 1 / e.val;
      if (ia >= 0) A[ia][ia] += g; if (ib >= 0) A[ib][ib] += g;
      if (ia >= 0 && ib >= 0) { A[ia][ib] -= g; A[ib][ia] -= g; }
    } else if (e.kind === 'I') { if (ia >= 0) z[ia] -= e.val; if (ib >= 0) z[ib] += e.val; }
    else if (e.kind === 'G') {
      const ip = r(e.gp), im = r(e.gn);
      for (const [row, sg] of [[ia, 1], [ib, -1]]) { if (row < 0) continue; if (ip >= 0) A[row][ip] += sg * e.gain; if (im >= 0) A[row][im] -= sg * e.gain; }
      if (ia >= 0) z[ia] -= e.val; if (ib >= 0) z[ib] += e.val;
    } else if (e.kind === 'F') {
      const col = N + vIdx.get(e.ctrl);
      if (ia >= 0) A[ia][col] += e.val; if (ib >= 0) A[ib][col] -= e.val;
    }
  }
  vs.forEach((e, k) => {
    const c = N + k, ia = r(e.a), ib = r(e.b), ca = r(e.ca ?? e.a), cb = r(e.cb ?? e.b);
    if (ca >= 0) A[ca][c] += 1; if (cb >= 0) A[cb][c] -= 1;
    if (ia >= 0) A[c][ia] += 1; if (ib >= 0) A[c][ib] -= 1;
    if (e.gain) { const ip = r(e.gp), im = r(e.gn); if (ip >= 0) A[c][ip] -= e.gain; if (im >= 0) A[c][im] += e.gain; }
    z[c] = e.val;
  });
  const x = gauss(A, z);
  if (!x) return null;
  const v = new Float64Array(nNodes); for (let k = 0; k < N; k++) v[k + 1] = x[k];
  const out = els.map(e => {
    let i;
    if (e.kind === 'R') i = (v[e.a] - v[e.b]) / e.val;
    else if (e.kind === 'I') i = e.val;
    else if (e.kind === 'V') i = x[N + vIdx.get(e)];
    else if (e.kind === 'F') i = e.val * x[N + vIdx.get(e.ctrl)];
    else i = e.val + e.gain * (v[e.gp] - v[e.gn]);
    return { ...e, i };
  });
  return { v, els: out };
}
function gauss(A0, z0) {
  const n = z0.length, A = A0.map(r => Float64Array.from(r)), z = Float64Array.from(z0);
  for (let c = 0; c < n; c++) {
    let p = c; for (let k = c + 1; k < n; k++) if (Math.abs(A[k][c]) > Math.abs(A[p][c])) p = k;
    if (Math.abs(A[p][c]) < 1e-18) return null;
    [A[c], A[p]] = [A[p], A[c]]; [z[c], z[p]] = [z[p], z[c]];
    for (let k = c + 1; k < n; k++) { const f = A[k][c] / A[c][c]; if (!f) continue; for (let j = c; j < n; j++) A[k][j] -= f * A[c][j]; z[k] -= f * z[c]; }
  }
  const x = new Float64Array(n);
  for (let c = n - 1; c >= 0; c--) { let s = z[c]; for (let j = c + 1; j < n; j++) s -= A[c][j] * x[j]; x[c] = s / A[c][c]; }
  return x;
}

// ---------- examples ----------
const SKETCH_EX = {
  relay10: '// 10 relay modules on 3 wires: two 74HC595 shift registers in a chain (cascade)\n// Serial Monitor commands (type below, press Send):\n//   3          toggle relay 3\n//   on 3 / off 3\n//   on 1,3,5   off 2,4   (pick several)\n//   all on / all off\n//   1000000001 binary, one digit per relay (relay 1 first), 1 = ON\n//   time 5     reset time: each relay switches itself OFF 5 s after it went ON (time 0 = stays ON)\n\nconst int DATA  = 19;   // 74HC595 pin 14 SER   (only to the 1st chip)\nconst int CLOCK = 18;   // 74HC595 pin 11 SRCLK (both chips)\nconst int LATCH = 5;    // 74HC595 pin 12 RCLK  (both chips)\nconst int OE    = 4;    // 74HC595 pin 13 OE    (both chips): HIGH = all outputs off\nconst int NRELAYS = 10;\nconst bool ACTIVE_LOW = true;   // most relay modules switch ON when IN is LOW\n\nunsigned int relays = 0;     // bit 0 = relay 1 ... bit 9 = relay 10\nunsigned int before = 0;     // what writeRelays() sent last time\nunsigned long onSince[10];   // millis() when each relay went ON\nunsigned long resetMs = 0;   // reset time in ms (0 = relays stay ON)\n\nvoid writeRelays() {\n  for (int i = 0; i < NRELAYS; i++)\n    if (((relays >> i) & 1) && !((before >> i) & 1)) onSince[i] = millis();   // just went ON: start its timer\n  before = relays;\n  unsigned int out = relays;\n  if (ACTIVE_LOW) out = ~relays;              // flip: ON = LOW\n  digitalWrite(LATCH, LOW);\n  shiftOut(DATA, CLOCK, MSBFIRST, (out >> 8) & 0xFF);   // the LAST chip\'s byte goes first\n  shiftOut(DATA, CLOCK, MSBFIRST, out & 0xFF);          // the 1st chip\'s byte\n  digitalWrite(LATCH, HIGH);                             // all outputs change at the same moment\n}\n\n// "1,3,5" → switch those relays on or off\nvoid setList(String list, bool on) {\n  list += ",";\n  int start = 0;\n  for (int i = 0; i < list.length(); i++) {\n    if (list.charAt(i) == \',\') {\n      int n = list.substring(start, i).toInt();\n      if (n >= 1 && n <= NRELAYS) {\n        if (on) relays |= (1 << (n - 1));\n        else relays &= ~(1 << (n - 1));\n      }\n      start = i + 1;\n    }\n  }\n}\n\nvoid printRelays() {\n  Serial.print("Relays 1-10: ");\n  for (int i = 0; i < NRELAYS; i++) Serial.print((relays >> i) & 1);\n  Serial.println();\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(DATA, OUTPUT);\n  pinMode(CLOCK, OUTPUT);\n  pinMode(LATCH, OUTPUT);\n  pinMode(OE, OUTPUT);\n  digitalWrite(OE, HIGH);           // outputs off while we load "all OFF"\n  writeRelays();                    // all OFF first\n  digitalWrite(OE, LOW);            // now the chips drive the relays\n\n  // test: click each relay once, 1 to 10\n  for (int i = 0; i < NRELAYS; i++) {\n    relays = 1 << i;\n    writeRelays();\n    delay(250);\n  }\n  relays = 0;\n  writeRelays();\n  Serial.println("Ready. Type 3, on 1,3,5, off 2, all on, all off, 1000000001 or time 5");\n}\n\nvoid loop() {\n  if (Serial.available()) {\n    String cmd = Serial.readStringUntil(\'\\n\');\n    cmd.trim();\n    cmd.toLowerCase();\n\n    if (cmd == "all on") relays = (1 << NRELAYS) - 1;\n    else if (cmd == "all off") relays = 0;\n    else if (cmd.startsWith("time ")) {\n      resetMs = cmd.substring(5).toFloat() * 1000;\n      Serial.print("Reset time: ");\n      if (resetMs == 0) Serial.println("off");\n      else {\n        Serial.print(resetMs / 1000.0, 1);\n        Serial.println(" s");\n      }\n    }\n    else if (cmd.startsWith("on ")) setList(cmd.substring(3), true);\n    else if (cmd.startsWith("off ")) setList(cmd.substring(4), false);\n    else if (cmd.length() == NRELAYS && cmd.indexOf(\'2\') < 0) {   // binary\n      relays = 0;\n      for (int i = 0; i < NRELAYS; i++) if (cmd.charAt(i) == \'1\') relays |= (1 << i);\n    } else {\n      int n = cmd.toInt();\n      if (n >= 1 && n <= NRELAYS) relays ^= (1 << (n - 1));   // toggle\n      else Serial.println("?? " + cmd);\n    }\n    writeRelays();\n    printRelays();\n  }\n\n  // reset time: switch OFF every relay that has been ON long enough\n  if (resetMs > 0) {\n    unsigned int was = relays;\n    for (int i = 0; i < NRELAYS; i++)\n      if (((relays >> i) & 1) && millis() - onSince[i] >= resetMs) relays &= ~(1 << i);\n    if (relays != was) {\n      writeRelays();\n      printRelays();\n    }\n  }\n}\n',
  encoder: '#include <Wire.h>\n#include <Adafruit_GFX.h>\n#include <Adafruit_SSD1306.h>\n\nAdafruit_SSD1306 display(128, 64, &Wire, -1);   // SDA = GPIO21, SCL = GPIO22\n\nconst int CLK = 32;   // encoder CLK (A)\nconst int DT  = 33;   // encoder DT (B)\nconst int SW  = 25;   // encoder push button\nconst int LED = 23;\n\nvolatile int steps = 0;   // changed by the interrupt, read by loop()\n\n// runs by itself the instant CLK falls (one click of the knob)\nvoid IRAM_ATTR readEncoder() {\n  if (digitalRead(DT) == HIGH) steps++;   // CLK fell first: clockwise\n  else steps--;                           // DT fell first: counter-clockwise\n}\n\nconst String items[4] = {"LED", "Blink", "Speed", "About"};\nint sel = 0;            // selected line\nbool editing = false;   // pushed on Speed: the knob changes the number\nbool ledOn = true;\nbool blinking = false;\nint speed = 2;          // blinks per second\nbool about = false;\nbool wasPressed = false;\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(CLK, INPUT);          // the KY-040 has its own 10k pull-ups on CLK and DT\n  pinMode(DT, INPUT);\n  pinMode(SW, INPUT_PULLUP);    // SW has none: use the internal one\n  pinMode(LED, OUTPUT);\n  attachInterrupt(digitalPinToInterrupt(CLK), readEncoder, FALLING);\n  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);\n  delay(100);                   // let the pull-ups settle before the first read\n}\n\nvoid loop() {\n  // 1. knob turns since last time (stop interrupts for a moment while we copy)\n  noInterrupts();\n  int s = steps;\n  steps = 0;\n  interrupts();\n  if (s != 0) {\n    if (editing) speed = constrain(speed + s, 1, 10);\n    else sel = (sel + s + 40) % 4;\n    Serial.print("turn ");\n    Serial.println(s);\n  }\n\n  // 2. push button: act once per press\n  bool pressed = digitalRead(SW) == LOW;\n  if (pressed && !wasPressed) {\n    if (about) about = false;\n    else if (editing) editing = false;\n    else if (sel == 0) ledOn = !ledOn;\n    else if (sel == 1) blinking = !blinking;\n    else if (sel == 2) editing = true;\n    else about = true;\n    Serial.println("push");\n  }\n  wasPressed = pressed;\n\n  // 3. the LED\n  bool on = ledOn && (!blinking || int(millis() * speed / 500) % 2 == 0);\n  digitalWrite(LED, on ? HIGH : LOW);\n\n  // 4. the screen\n  display.clearDisplay();\n  display.setTextColor(SSD1306_WHITE);\n  if (about) {\n    display.setTextSize(2);\n    display.setCursor(0, 0);\n    display.println("Fox9ner");\n    display.setTextSize(1);\n    display.setCursor(0, 24);\n    display.println("Rotary encoder menu");\n    display.println("with interrupts.");\n    display.println("");\n    display.println("Push to go back.");\n  } else {\n    display.setTextSize(1);\n    display.setCursor(0, 0);\n    display.print(editing ? "Turn: speed, push: OK" : "MENU  turn + push");\n    for (int i = 0; i < 4; i++) {\n      int y = 18 + i * 11;\n      if (i == sel) {\n        display.fillRect(0, y - 2, 128, 11, SSD1306_WHITE);\n        display.setTextColor(SSD1306_BLACK);\n      } else {\n        display.setTextColor(SSD1306_WHITE);\n      }\n      display.setCursor(4, y);\n      display.print(items[i]);\n      display.setCursor(84, y);\n      if (i == 0) display.print(ledOn ? "ON" : "OFF");\n      if (i == 1) display.print(blinking ? "ON" : "OFF");\n      if (i == 2) {\n        display.print(speed);\n        display.print(editing ? " /s <" : " /s");\n      }\n    }\n  }\n  display.display();\n  delay(20);\n}\n',
  oled: '#include <Wire.h>\n#include <Adafruit_GFX.h>\n#include <Adafruit_SSD1306.h>\n\n#define SCREEN_WIDTH 128\n#define SCREEN_HEIGHT 64\nAdafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);   // SDA = GPIO21, SCL = GPIO22\n\nint graph[128];   // last 128 readings for the moving graph\n\nvoid setup() {\n  Serial.begin(115200);\n  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {\n    Serial.println("OLED not found");\n    for (;;);\n  }\n  for (int i = 0; i < 128; i++) graph[i] = 63;\n  display.clearDisplay();\n  display.setTextSize(2);\n  display.setTextColor(SSD1306_WHITE);\n  display.setCursor(4, 24);\n  display.println("Hello migo");\n  display.display();\n  delay(1500);\n}\n\nvoid loop() {\n  float v = analogRead(34) * 3.3 / 4095;\n\n  for (int i = 0; i < 127; i++) graph[i] = graph[i + 1];\n  graph[127] = 63 - int(v / 3.3 * 28);\n\n  display.clearDisplay();\n  display.setTextSize(1);\n  display.setCursor(0, 0);\n  display.print("Pot voltage");\n  display.setTextSize(2);\n  display.setCursor(0, 14);\n  display.print(v, 2);\n  display.print(" V");\n  display.drawRect(84, 16, 44, 10, SSD1306_WHITE);\n  display.fillRect(86, 18, int(v / 3.3 * 40), 6, SSD1306_WHITE);\n  display.drawFastHLine(0, 34, 128, SSD1306_WHITE);\n  for (int x = 1; x < 128; x++) display.drawLine(x - 1, graph[x - 1], x, graph[x], SSD1306_WHITE);\n  display.display();\n  delay(100);\n}\n',
  doorlock: '#include <Keypad.h>\n#include <LiquidCrystal_I2C.h>\n\nconst byte ROWS = 4, COLS = 4;\nchar keys[ROWS][COLS] = {\n  {\'1\', \'2\', \'3\', \'A\'},\n  {\'4\', \'5\', \'6\', \'B\'},\n  {\'7\', \'8\', \'9\', \'C\'},\n  {\'*\', \'0\', \'#\', \'D\'}\n};\nbyte rowPins[ROWS] = {19, 18, 5, 17};\nbyte colPins[COLS] = {16, 4, 2, 15};\nKeypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);\nLiquidCrystal_I2C lcd(0x27, 16, 2);\n\nconst int LOCK = 13;      // MOSFET gate\nconst int BUZZ = 23;\nString code = "1234";     // change your PIN here\nString typed = "";\n\nvoid beep(int ms) {\n  digitalWrite(BUZZ, HIGH);\n  delay(ms);\n  digitalWrite(BUZZ, LOW);\n}\n\nvoid askPin() {\n  lcd.clear();\n  lcd.print("Enter PIN, #=OK");\n  lcd.setCursor(0, 1);\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  pinMode(LOCK, OUTPUT);\n  pinMode(BUZZ, OUTPUT);\n  lcd.init();\n  lcd.backlight();\n  askPin();\n}\n\nvoid loop() {\n  char key = keypad.getKey();\n  if (!key) return;\n  Serial.println(key);\n  beep(40);\n  if (key == \'#\') {\n    if (typed == code) {\n      lcd.clear();\n      lcd.print("OPEN - welcome!");\n      digitalWrite(LOCK, HIGH);   // solenoid pulls the bolt\n      beep(200);\n      delay(3000);\n      digitalWrite(LOCK, LOW);\n    } else {\n      lcd.clear();\n      lcd.print("WRONG PIN");\n      beep(800);\n      delay(1000);\n    }\n    typed = "";\n    askPin();\n  } else if (key == \'*\') {\n    typed = "";\n    askPin();\n  } else if (typed.length() < 8) {\n    typed += key;\n    lcd.print(\'*\');\n  }\n}\n',
  thermo: '#include <DHT.h>\n\nDHT dht(4, DHT22);        // DATA on GPIO4\nconst int FAN = 23;\n\nvoid setup() {\n  Serial.begin(115200);\n  dht.begin();\n  pinMode(FAN, OUTPUT);\n}\n\nvoid loop() {\n  float t = dht.readTemperature();\n  float h = dht.readHumidity();\n  if (isnan(t)) {\n    Serial.println("DHT not found!");\n    delay(1000);\n    return;\n  }\n  digitalWrite(FAN, t > 30 ? HIGH : LOW);   // fan above 30 C\n  Serial.printf("%.1f C  %.0f %%  fan %s\\n", t, h, t > 30 ? "ON" : "OFF");\n  delay(1000);\n}\n',
  parking: 'const int TRIG = 9, ECHO = 10, LED = 13;\n\nvoid setup() {\n  Serial.begin(9600);\n  pinMode(TRIG, OUTPUT);\n  pinMode(ECHO, INPUT);\n  pinMode(LED, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(TRIG, LOW);\n  delayMicroseconds(2);\n  digitalWrite(TRIG, HIGH);              // 10 us pulse starts a measurement\n  delayMicroseconds(10);\n  digitalWrite(TRIG, LOW);\n  long us = pulseIn(ECHO, HIGH, 30000);   // echo time in microseconds\n  float cm = us / 58.0;\n  digitalWrite(LED, cm > 0 && cm < 20 ? HIGH : LOW);\n  Serial.print("Distance: ");\n  Serial.print(cm, 1);\n  Serial.println(" cm");\n  delay(200);\n}\n',
  autolight: 'const int LED = 9;   // PWM pin\n\nvoid setup() {\n  Serial.begin(9600);\n}\n\nvoid loop() {\n  int light = analogRead(A0);              // dark = low, bright = high\n  int pwm = map(light, 0, 1023, 255, 0);   // darker = brighter LED\n  analogWrite(LED, constrain(pwm, 0, 255));\n  Serial.print("light ");\n  Serial.print(light);\n  Serial.print("   LED ");\n  Serial.println(pwm);\n  delay(200);\n}\n',
};
export function example(name) {
  const c = newCircuit();
  const W = (x1, y1, x2, y2) => c.wires.push({ x1, y1, x2, y2 });
  if (name === 'led') {
    const b = addPart(c, 'BAT', 0, 6, 1); b.props.v = 9;                   // vertical, + on top
    const r = addPart(c, 'R', 4, 0); r.props.r = 470;
    const l = addPart(c, 'LED', 10, 0); l.props.color = 'red';
    addPart(c, 'GND', 0, 10);
    const s = addPart(c, 'SW', 14, 4, 1); s.props.on = true;
    W(0, 4, 0, 0); W(0, 0, 2, 0); W(6, 0, 8, 0); W(12, 0, 14, 0); W(14, 0, 14, 2); W(14, 6, 14, 10); W(14, 10, 0, 10); W(0, 8, 0, 10);
  } else if (name === 'divider') {
    const b = addPart(c, 'BAT', 0, 6, 1); b.props.v = 12;
    const r1 = addPart(c, 'R', 6, 2, 1); r1.props.r = 10000;
    const r2 = addPart(c, 'R', 6, 8, 1); r2.props.r = 4700;
    addPart(c, 'VM', 12, 8, 1);
    addPart(c, 'GND', 0, 12);
    W(0, 4, 0, 0); W(0, 0, 6, 0); W(6, 4, 6, 6); W(6, 10, 6, 12); W(0, 8, 0, 12); W(0, 12, 12, 12); W(6, 5, 12, 5); W(12, 5, 12, 6); W(12, 10, 12, 12);
  } else if (name === 'esp32') {
    // 12 V solenoid coil (lamp as the coil load) switched by a push button, with flyback diode across it
    const b = addPart(c, 'BAT', 0, 6, 1); b.props.v = 12;
    const coil = addPart(c, 'LAMP', 8, 4, 1); coil.name = 'COIL'; coil.props.vr = 12; coil.props.wr = 6;
    const d = addPart(c, 'D', 12, 4, 3); d.props.model = '1N5819';
    const pb = addPart(c, 'PB', 8, 10, 1);
    const am = addPart(c, 'AM', 4, 0);
    addPart(c, 'GND', 0, 14);
    W(0, 4, 0, 0); W(0, 0, 2, 0); W(6, 0, 8, 0); W(8, 0, 8, 2); W(8, 0, 12, 0); W(12, 0, 12, 2); W(8, 6, 8, 8); W(12, 6, 12, 7); W(12, 7, 8, 7);
    W(8, 12, 8, 14); W(8, 14, 0, 14); W(0, 8, 0, 14);
  } else if (name === 'dpdt') {
    // DPDT reversing a DC motor: battery on the two commons, throws cross-wired to the motor. Flip = motor reverses.
    const b = addPart(c, 'BAT', 0, 8, 1); b.props.v = 12;
    addPart(c, 'DPDT', 8, 8);                      // commons (6,6) (6,10) · throws A1 (10,5) B1 (10,7) A2 (10,9) B2 (10,11)
    const m = addPart(c, 'R', 16, 8, 1); m.name = 'MOTOR'; m.props.r = 24; m.props.rating = 10;
    addPart(c, 'GND', 0, 12);
    W(0, 6, 6, 6); W(0, 10, 6, 10); W(0, 10, 0, 12);
    W(10, 5, 16, 5);                                // A1 -> motor top
    W(10, 7, 13, 7); W(13, 7, 13, 9); W(10, 9, 13, 9); W(13, 9, 13, 10); W(13, 10, 16, 10);   // B1 + A2 -> motor bottom
    W(10, 11, 10, 13); W(10, 13, 18, 13); W(18, 13, 18, 4); W(18, 4, 16, 4); W(16, 4, 16, 6);   // B2 -> motor top (around)
  } else if (name === 'rc') {
    // square wave into an RC low-pass: watch the capacitor charge and discharge (τ = R × C = 1 ms)
    const g = addPart(c, 'SIG', 0, 6, 1); Object.assign(g.props, { wave: 'pwm', f: 100, amp: 5, off: 0, duty: 50 });
    addPart(c, 'R', 4, 2).props.r = 1000;
    addPart(c, 'C', 8, 6, 1).props.c = 1e-6;
    addPart(c, 'SCOPE', 16, 6);
    addPart(c, 'GND', 0, 10);
    W(0, 4, 0, 2); W(0, 2, 2, 2); W(6, 2, 8, 2); W(8, 2, 8, 4); W(8, 8, 8, 10); W(8, 10, 0, 10); W(0, 8, 0, 10);
    W(13, 5, 13, 0); W(13, 0, 0, 0); W(0, 0, 0, 2);            // CH1 = input
    W(13, 7, 11, 7); W(11, 7, 11, 3); W(11, 3, 8, 3);           // CH2 = capacitor
    W(16, 8, 16, 10); W(16, 10, 8, 10);
  } else if (name === 'pwmled') {
    const g = addPart(c, 'SIG', 0, 6, 1); Object.assign(g.props, { wave: 'pwm', f: 1000, amp: 5, off: 0, duty: 30 });
    addPart(c, 'R', 4, 2).props.r = 150;
    addPart(c, 'LED', 10, 2).props.color = 'green';
    addPart(c, 'SCOPE', 22, 6);
    addPart(c, 'GND', 0, 10);
    W(0, 4, 0, 2); W(0, 2, 2, 2); W(6, 2, 8, 2); W(12, 2, 14, 2); W(14, 2, 14, 10); W(14, 10, 0, 10); W(0, 8, 0, 10);
    W(19, 5, 17, 5); W(17, 5, 17, 0); W(17, 0, 7, 0); W(7, 0, 7, 2);
    W(22, 8, 22, 10); W(22, 10, 14, 10);
  } else if (name === 'flyback') {
    // hold the button, then let go: the coil's current must go somewhere. The diode catches it.
    const b = addPart(c, 'BAT', 0, 6, 1); b.props.v = 12;
    const l = addPart(c, 'L', 8, 4, 1); l.name = 'COIL'; Object.assign(l.props, { l: 0.05, r: 24 });
    addPart(c, 'D', 18, 4, 3).props.model = '1N5819';
    addPart(c, 'PB', 8, 10, 1);
    addPart(c, 'SCOPE', 28, 8);
    addPart(c, 'GND', 0, 14);
    W(0, 4, 0, 0); W(0, 0, 8, 0); W(8, 0, 8, 2); W(8, 0, 18, 0); W(18, 0, 18, 2); W(18, 6, 18, 7); W(18, 7, 8, 7); W(8, 6, 8, 8);
    W(8, 12, 8, 14); W(8, 14, 0, 14); W(0, 8, 0, 14);
    W(25, 7, 18, 7); W(28, 10, 28, 14); W(28, 14, 8, 14);
  } else if (name === 'rectifier') {
    // 12 V AC (17 V peak, 60 Hz) → bridge → 1000 µF → 100 Ω load. The scope shows the ripple.
    const g = addPart(c, 'SIG', 0, 8, 1); g.name = 'AC'; Object.assign(g.props, { wave: 'sine', f: 60, amp: 17, off: 0 });
    for (const [x, y] of [[6, 4], [6, 8], [14, 4], [14, 8]]) addPart(c, 'D', x, y, 3);
    addPart(c, 'C', 20, 6, 1).props.c = 1000e-6;
    const rl = addPart(c, 'R', 26, 6, 1); rl.props.r = 100; rl.props.rating = 5;
    addPart(c, 'SCOPE', 32, 6);
    addPart(c, 'GND', 20, 10);
    W(6, 2, 14, 2); W(6, 10, 14, 10); W(0, 6, 6, 6);
    W(0, 10, 0, 12); W(0, 12, 16, 12); W(16, 12, 16, 6); W(16, 6, 14, 6);
    W(14, 2, 20, 2); W(20, 2, 20, 4); W(20, 2, 26, 2); W(26, 2, 26, 4);
    W(14, 10, 20, 10); W(20, 8, 20, 10); W(20, 10, 26, 10); W(26, 8, 26, 10);
    W(29, 5, 29, 2); W(29, 2, 26, 2); W(32, 8, 32, 10); W(32, 10, 26, 10);
  } else if (name === 'opto') {
    // ESP32 pin (3.3 V PWM) → 220 Ω → PC817 LED. The transistor side pulls a 12 V line low.
    const g = addPart(c, 'SIG', 0, 6, 1); g.name = 'ESP32'; Object.assign(g.props, { wave: 'pwm', f: 50, amp: 3.3, off: 0, duty: 50 });
    addPart(c, 'R', 4, 2).props.r = 220;
    addPart(c, 'OPTO', 10, 4);
    const r2 = addPart(c, 'R', 16, 1); r2.props.r = 4700;
    const b = addPart(c, 'BAT', 22, 6, 1); b.props.v = 12;
    addPart(c, 'SCOPE', 30, 6);
    addPart(c, 'GND', 0, 10);
    W(0, 4, 0, 2); W(0, 2, 2, 2); W(6, 2, 8, 2); W(8, 2, 8, 3); W(8, 5, 8, 10); W(8, 10, 0, 10); W(0, 8, 0, 10);
    W(12, 3, 12, 1); W(12, 1, 14, 1); W(18, 1, 22, 1); W(22, 1, 22, 4);
    W(12, 5, 12, 10); W(12, 10, 8, 10); W(22, 8, 22, 10); W(22, 10, 12, 10);
    W(27, 5, 26, 5); W(26, 5, 26, -1); W(26, -1, 0, -1); W(0, -1, 0, 2);
    W(27, 7, 24, 7); W(24, 7, 24, 2); W(24, 2, 12, 2);
    W(30, 8, 30, 10); W(30, 10, 22, 10);
  } else if (name === 'relay') {
    // ESP32 pin (3.3 V) → 1 kΩ → 2N2222 switches a 12 V relay coil. The relay contact turns on a 12 V lamp. 1N4148 catches the coil spike.
    const e = addPart(c, 'BAT', -6, 8, 1); e.name = 'ESP32'; e.props.v = 3.3;
    const sw = addPart(c, 'SW', 4, 6); sw.name = 'GPIO'; sw.props.on = true;
    addPart(c, 'R', 10, 6).props.r = 1000;
    addPart(c, 'NPN', 14, 6).props.model = '2N2222';
    const k = addPart(c, 'RELAY', 18, 0); Object.assign(k.props, { vcoil: 12, rcoil: 400, l: 0.12 });
    addPart(c, 'D', 10, 0, 3).props.model = '1N4148';
    const lp = addPart(c, 'LAMP', 18, 6, 1); Object.assign(lp.props, { vr: 12, wr: 5 });
    const b = addPart(c, 'BAT', 26, 4, 1); b.props.v = 12;
    addPart(c, 'GND', -6, 12);
    W(-6, 6, 2, 6); W(6, 6, 8, 6); W(15, 8, 15, 12); W(15, 2, 15, 4);
    W(10, -2, 15, -2); W(10, 2, 15, 2); W(15, -2, 15, -4); W(15, -4, 26, -4); W(26, -4, 26, 2); W(20, -2, 20, -4);
    W(18, 2, 18, 4); W(18, 8, 18, 12); W(-6, 10, -6, 12); W(-6, 12, 26, 12); W(26, 6, 26, 12);
  } else if (name === 'mosfet') {
    // ESP32 PWM (3.3 V) drives an IRLZ44N that switches a 12 V solenoid. 10 kΩ keeps the gate off at boot, diode eats the spike.
    const b = addPart(c, 'BAT', -4, 4, 1); b.props.v = 12;
    const g = addPart(c, 'SIG', 0, 10, 1); g.name = 'ESP32'; Object.assign(g.props, { wave: 'pwm', f: 50, amp: 3.3, off: 0, duty: 50 });
    addPart(c, 'R', 4, 6).props.r = 100;
    addPart(c, 'R', 9, 8, 1).props.r = 10000;
    addPart(c, 'NMOS', 16, 6).props.model = 'IRLZ44N';
    const l = addPart(c, 'L', 17, 0, 1); l.name = 'SOLENOID'; Object.assign(l.props, { l: 0.05, r: 24 });
    addPart(c, 'D', 26, 0, 3).props.model = '1N5819';
    addPart(c, 'SCOPE', 35, 4);
    addPart(c, 'GND', -4, 12); addPart(c, 'GND', 35, 6);
    W(-4, 2, -4, -4); W(-4, -4, 26, -4); W(-4, 6, -4, 12); W(-4, 12, 17, 12);
    W(0, 8, 0, 6); W(0, 6, 2, 6); W(6, 6, 14, 6); W(9, 10, 9, 12); W(17, 8, 17, 12);
    W(17, -2, 17, -4); W(17, 2, 17, 4); W(17, 2, 26, 2); W(26, -2, 26, -4);
    W(11, 6, 11, -6); W(11, -6, 32, -6); W(32, -6, 32, 3);
    W(17, 3, 29, 3); W(29, 3, 29, 5); W(29, 5, 32, 5);
  } else if (name === 'reg7805') {
    // 12 V → 7805 → 5 V. The 7 V difference turns into heat in the regulator.
    const b = addPart(c, 'BAT', 0, 4, 1); b.props.v = 12;
    addPart(c, 'REG', 6, 2).props.model = '7805';
    const r = addPart(c, 'R', 12, 4, 1); r.name = 'LOAD'; r.props.r = 20; r.props.rating = 2;
    addPart(c, 'VM', 19, 4, 1);
    addPart(c, 'GND', 0, 8);
    W(0, 2, 3, 2); W(6, 4, 6, 8); W(9, 2, 12, 2); W(12, 6, 12, 8); W(12, 2, 19, 2); W(19, 6, 19, 8); W(0, 6, 0, 8); W(0, 8, 19, 8);
  } else if (name === 'lm317') {
    // LM317: Vout = 1.25 × (1 + R2 ÷ R1) = 1.25 × (1 + 720 ÷ 240) = 5 V. Change R2 to set the voltage.
    const b = addPart(c, 'BAT', 0, 4, 1); b.props.v = 12;
    addPart(c, 'REG', 6, 2).props.model = 'LM317';
    addPart(c, 'R', 11, 4, 1).props.r = 240;
    addPart(c, 'R', 6, 8, 1).props.r = 720;
    const r = addPart(c, 'R', 17, 4, 1); r.name = 'LOAD'; r.props.r = 100; r.props.rating = 1;
    addPart(c, 'VM', 23, 4, 1);
    addPart(c, 'GND', 0, 12);
    W(0, 2, 3, 2); W(9, 2, 11, 2); W(6, 4, 6, 6); W(6, 6, 11, 6); W(6, 10, 6, 12); W(11, 2, 17, 2); W(17, 6, 17, 12); W(17, 2, 23, 2); W(23, 6, 23, 12);
    W(0, 6, 0, 12); W(0, 12, 23, 12);
  } else if (name === 'zener') {
    // 12 V → 1 kΩ → 5.1 V zener: the zener holds 5.1 V and the resistor takes the rest.
    const b = addPart(c, 'BAT', 0, 4, 1); b.props.v = 12;
    addPart(c, 'R', 4, 0).props.r = 1000;
    addPart(c, 'ZD', 8, 3, 3).props.vz = 5.1;
    addPart(c, 'VM', 14, 3, 1);
    addPart(c, 'GND', 0, 6);
    W(0, 2, 0, 0); W(0, 0, 2, 0); W(6, 0, 8, 0); W(8, 0, 8, 1); W(8, 0, 14, 0); W(14, 0, 14, 1); W(8, 5, 8, 6); W(14, 5, 14, 6); W(0, 6, 14, 6);
  } else if (name === 'comparator') {
    // op-amp as a comparator: triangle wave vs the pot voltage → PWM out. Turn the pot to change the duty.
    const g = addPart(c, 'SIG', -4, 9, 1); Object.assign(g.props, { wave: 'triangle', f: 100, amp: 2.5, off: 2.5 });
    addPart(c, 'OPAMP', 10, 6).props.model = 'MCP6002';
    const pot = addPart(c, 'POT', 4, 1, 1); pot.props.pos = 70;
    const b = addPart(c, 'BAT', 18, -1, 1); b.props.v = 5;
    addPart(c, 'SCOPE', 19, 8);
    for (const [x, y] of [[-4, 11], [4, 3], [10, 8], [18, 1], [19, 10]]) addPart(c, 'GND', x, y);
    W(-4, 7, 7, 7); W(6, 1, 6, 5); W(6, 5, 7, 5); W(4, -1, 4, -3); W(4, -3, 18, -3); W(10, 4, 10, -3);
    W(13, 6, 15, 6); W(15, 6, 15, 7); W(15, 7, 16, 7);
    W(6, 7, 6, 11); W(6, 11, 16, 11); W(16, 11, 16, 9);
  } else if (name === 'preamp') {
    // classic 1-transistor audio preamp (common emitter): 10 mV mic signal in, about 1 V out (gain ≈ 100)
    const g = addPart(c, 'SIG', 0, 14, 1); g.name = 'MIC'; Object.assign(g.props, { wave: 'sine', f: 1000, amp: 0.01, off: 0 });
    const cin = addPart(c, 'C', 5, 10, 2); cin.name = 'CIN'; Object.assign(cin.props, { c: 10e-6, vmax: 16 });
    addPart(c, 'R', 10, 5, 1).props.r = 47000;
    addPart(c, 'R', 10, 15, 1).props.r = 10000;
    addPart(c, 'NPN', 14, 10).props.model = 'BC547';
    const rc = addPart(c, 'R', 15, 5, 1); rc.name = 'RC'; rc.props.r = 4700;
    const re = addPart(c, 'R', 15, 15, 1); re.name = 'RE'; re.props.r = 1000;
    const ce = addPart(c, 'C', 19, 15, 1); ce.name = 'CE'; Object.assign(ce.props, { c: 100e-6, vmax: 16 });
    const co = addPart(c, 'C', 20, 7); co.name = 'COUT'; Object.assign(co.props, { c: 10e-6, vmax: 16 });
    const rl = addPart(c, 'R', 24, 11, 1); rl.name = 'LOAD'; rl.props.r = 10000;
    const b = addPart(c, 'BAT', 36, 10, 1); b.props.v = 9;
    addPart(c, 'SCOPE', 14, 25);
    addPart(c, 'GND', 0, 20); addPart(c, 'GND', 14, 27);
    W(0, 12, 0, 10); W(0, 10, 3, 10); W(7, 10, 12, 10); W(10, 7, 10, 10); W(10, 13, 10, 10);
    W(10, 3, 10, 1); W(10, 1, 36, 1); W(15, 1, 15, 3); W(36, 1, 36, 8);
    W(15, 7, 15, 8); W(15, 12, 15, 13); W(15, 12, 19, 12); W(19, 12, 19, 13); W(15, 7, 18, 7);
    W(22, 7, 24, 7); W(24, 7, 24, 9);
    W(0, 16, 0, 20); W(0, 20, 36, 20); W(10, 17, 10, 20); W(15, 17, 15, 20); W(19, 17, 19, 20); W(24, 13, 24, 20); W(36, 12, 36, 20);
    W(24, 8, 27, 8); W(27, 8, 27, 24); W(27, 24, 11, 24);
    W(0, 10, -2, 10); W(-2, 10, -2, 26); W(-2, 26, 11, 26);
  } else if (name === 'tl494pwm') {
    // TL494 PWM lamp dimmer, 12 V. RT 10 kΩ + CT 10 nF → f = 1 ÷ (10 kΩ × 10 nF) = 10 kHz. Error amps switched off (IN+ to GND, IN− to REF),
    // the DUTY pot on DTC sets the pulse width. OUTPUT CTRL to GND = both outputs together (single-ended), emitters drive the MOSFET gate.
    c.tdiv = 5e-5;
    const u = addPart(c, 'TL494', 0, 0); u.name = 'U1';
    const b = addPart(c, 'BAT', -16, -5, 1); b.name = 'B1'; b.props.v = 12;
    const pot = addPart(c, 'POT', -8, 4, 1); pot.name = 'DUTY'; Object.assign(pot.props, { r: 10000, pos: 70 }); pot.lbl = [-14.7, 0];
    const ct = addPart(c, 'C', -3, 10, 1); ct.name = 'CT'; Object.assign(ct.props, { c: 10e-9, vmax: 50, polar: false }); ct.lbl = [-9.4, 0];
    const rt = addPart(c, 'R', -1, 10, 1); rt.name = 'RT'; rt.props.r = 10000; rt.lbl = [0, 1];
    const rg = addPart(c, 'R', 13, 0); rg.name = 'RG'; rg.props.r = 22;
    const rpd = addPart(c, 'R', 9, 3, 1); rpd.name = 'RPD'; rpd.props.r = 1000; rpd.lbl = [-3.6, 4.4];
    const q = addPart(c, 'NMOS', 17, 0); q.name = 'Q1'; q.props.model = 'IRLZ44N';
    const lp = addPart(c, 'LAMP', 18, -6, 1); lp.name = 'LAMP'; Object.assign(lp.props, { vr: 12, wr: 5 });
    addPart(c, 'SCOPE', 24, 13);
    for (const [x, y] of [[-16, -2], [-6, -4], [-6, 0], [-8, 6], [-3, 12], [-1, 12], [2, 8], [9, 5], [18, 3], [24, 16]]) addPart(c, 'GND', x, y);
    // +12 V rail: battery, VCC, C1 + C2, lamp
    W(-16, -7, -16, -11); W(-16, -11, 18, -11); W(-16, -3, -16, -2);
    W(2, -7, 2, -11); W(5, -5, 7, -5); W(5, -4, 7, -4); W(7, -4, 7, -11); W(18, -8, 18, -11);
    // 5 V REF → 1IN−, 2IN−, top of the DUTY pot. 1IN+ and 2IN+ to ground: both error amps stay LOW (off)
    W(-2, -7, -2, -9); W(-2, -9, -12, -9); W(-12, -9, -12, 2); W(-5, -5, -7, -5); W(-7, -5, -7, -9); W(-5, 2, -12, 2);
    W(-5, -4, -6, -4); W(-5, 0, -6, 0);
    // DUTY wiper → DTC, CT + RT to ground, chip GND, OUTPUT CTRL to ground
    W(-6, 4, -5, 4); W(-3, 7, -3, 8); W(-1, 7, -1, 8); W(1, 7, 1, 8); W(3, 7, 3, 8); W(1, 8, 3, 8);
    // E1 + E2 → 22 Ω → MOSFET gate, 1 kΩ pull-down; lamp in the drain
    W(5, -2, 9, -2); W(5, 0, 9, 0); W(9, -2, 9, 1); W(9, 0, 11, 0); W(18, -4, 18, -2); W(18, 2, 18, 3);
    // scope: CH1 = gate, CH2 = the CT ramp
    W(15, 0, 15, 12); W(15, 12, 21, 12); W(-3, 8, -4, 8); W(-4, 8, -4, 15); W(-4, 15, 20, 15); W(20, 15, 20, 14); W(20, 14, 21, 14); W(24, 15, 24, 16);
  } else if (name === 'tl494inv') {
    // TL494 push-pull inverter 12 V DC → 220 V AC 50 Hz. RT 100 kΩ + CT 100 nF → oscillator 1 ÷ (100 kΩ × 100 nF) = 100 Hz;
    // OUTPUT CTRL to REF = push-pull: Q1 and Q2 take turns, each gets every 2nd cycle → 100 ÷ 2 = 50 Hz. POWER pot on DTC = dead time.
    c.tdiv = 0.01;
    const u = addPart(c, 'TL494', 0, 0); u.name = 'U1';
    const b = addPart(c, 'BAT', -16, -5, 1); b.name = 'BATT'; b.props.v = 12;
    const pot = addPart(c, 'POT', -8, 4, 1); pot.name = 'POWER'; Object.assign(pot.props, { r: 10000, pos: 90 }); pot.lbl = [-14.7, 0];
    const ct = addPart(c, 'C', -3, 10, 1); ct.name = 'CT'; Object.assign(ct.props, { c: 100e-9, vmax: 50, polar: false }); ct.lbl = [-9.4, 0];
    const rt = addPart(c, 'R', -1, 10, 1); rt.name = 'RT'; rt.props.r = 100000; rt.lbl = [0, 1];
    const r1 = addPart(c, 'R', 11, -2); r1.name = 'R1'; r1.props.r = 1000; r1.lbl = [0.8, -4.6];
    const r2 = addPart(c, 'R', 11, 0); r2.name = 'R2'; r2.props.r = 1000; r2.lbl = [5, 0.4];
    const q1 = addPart(c, 'NMOS', 15, -6); q1.name = 'Q1'; q1.props.model = 'IRFZ44N';
    const q2 = addPart(c, 'NMOS', 15, 6); q2.name = 'Q2'; q2.props.model = 'IRFZ44N';
    const t = addPart(c, 'XFMR', 22, 0); t.name = 'TR1'; Object.assign(t.props, { n1: 10, n2: 10, ns: 190, lm: 0.3, r1: 0.02, r2: 0.02, rs: 2 });
    const lp = addPart(c, 'LAMP', 29, 0, 1); lp.name = 'LOAD'; Object.assign(lp.props, { vr: 220, wr: 60 });
    addPart(c, 'SCOPE', 36, 10);
    for (const [x, y] of [[-16, -2], [-6, -4], [-6, 0], [-8, 6], [-3, 12], [-1, 12], [1, 8], [13, -2], [13, 0], [16, -3], [16, 9], [29, 3], [36, 13]]) addPart(c, 'GND', x, y);
    // +12 V rail: battery, VCC, C1 + C2, transformer center tap
    W(-16, -7, -16, -11); W(-16, -11, 18, -11); W(-16, -3, -16, -2);
    W(2, -7, 2, -11); W(5, -5, 7, -5); W(5, -4, 7, -4); W(7, -4, 7, -11); W(19, 0, 18, 0); W(18, 0, 18, -11);
    // 5 V REF → 1IN−, 2IN−, POWER pot, and down + across to OUTPUT CTRL (push-pull). 1IN+ / 2IN+ to ground: error amps off
    W(-2, -7, -2, -9); W(-2, -9, -12, -9); W(-12, -9, -12, 15); W(-5, -5, -7, -5); W(-7, -5, -7, -9); W(-5, 2, -12, 2);
    W(-5, -4, -6, -4); W(-5, 0, -6, 0); W(-12, 15, 7, 15); W(7, 15, 7, 8); W(7, 8, 3, 8); W(3, 8, 3, 7);
    // POWER wiper → DTC, CT + RT + GND
    W(-6, 4, -5, 4); W(-3, 7, -3, 8); W(-1, 7, -1, 8); W(1, 7, 1, 8);
    // E1 → Q1 gate, E2 → Q2 gate, 1 kΩ pull-downs; drains → the two ends of the primary
    W(5, -2, 9, -2); W(9, -2, 9, -6); W(9, -6, 13, -6); W(5, 0, 9, 0); W(9, 0, 9, 6); W(9, 6, 13, 6);
    W(16, -4, 16, -3); W(16, 8, 16, 9);
    W(16, -8, 19, -8); W(19, -8, 19, -2); W(16, 4, 19, 4); W(19, 4, 19, 2);
    // secondary → 220 V lamp (bottom end grounded so the scope can see it)
    W(25, -2, 29, -2); W(25, 2, 29, 2); W(29, 2, 29, 3);
    // scope: CH1 = the 220 V output, CH2 = Q2 gate
    W(29, -2, 32, -2); W(32, -2, 32, 9); W(32, 9, 33, 9); W(9, 6, 9, 13); W(9, 13, 33, 13); W(33, 13, 33, 11); W(36, 12, 36, 13);
  } else if (name === 'delay555') {
    // power-on delay: flip POWER on → C1 pulls TRIG/THR high (output LOW), R1 drains it → below 1/3 Vcc the output goes HIGH. t ≈ 1.1 × R1 × C1 ≈ 1.1 s
    c.tdiv = 0.2;
    const b = addPart(c, 'BAT', 0, 10, 1); b.props.v = 12;
    const sw = addPart(c, 'SW', 3, 2); sw.name = 'POWER'; sw.props.on = false;
    addPart(c, 'T555', 16, 10).props.model = 'NE555';
    const c1 = addPart(c, 'C', 9, 6, 1); c1.name = 'C1'; Object.assign(c1.props, { c: 10e-6, vmax: 25 });
    const r1 = addPart(c, 'R', 9, 14, 1); r1.name = 'R1'; r1.props.r = 100000;
    const c2 = addPart(c, 'C', 18, 16, 1); c2.name = 'C2'; Object.assign(c2.props, { c: 10e-9, vmax: 50, polar: false });
    const r2 = addPart(c, 'R', 24, 10); r2.name = 'R2'; r2.props.r = 1000;
    const l = addPart(c, 'LED', 29, 10); l.name = 'ON'; l.props.color = 'green';
    addPart(c, 'SCOPE', 36, 14);
    addPart(c, 'GND', 0, 18);
    W(0, 8, 0, 2); W(0, 2, 1, 2); W(5, 2, 17, 2); W(15, 6, 15, 2); W(17, 6, 17, 2);
    W(9, 4, 9, 2); W(9, 8, 9, 10); W(9, 10, 12, 10); W(12, 10, 12, 12); W(9, 12, 12, 12); W(9, 16, 9, 18);
    W(16, 14, 16, 18);
    W(20, 10, 22, 10); W(26, 10, 27, 10); W(31, 10, 31, 18);
    W(0, 12, 0, 18); W(0, 18, 36, 18); W(36, 16, 36, 18);
    W(21, 10, 21, 8); W(21, 8, 33, 8); W(33, 8, 33, 13);
    W(10, 10, 10, 0); W(10, 0, 34, 0); W(34, 0, 34, 15); W(34, 15, 33, 15);
  } else if (name === 'fridge') {
    // fridge / aircon guard: after power comes back the compressor waits ≈ 4 min (1.1 × 1 MΩ × 220 µF), so the gas pressure equalizes first.
    // D1 empties C1 at once when power drops, so even a 2-second brownout restarts the full wait.
    c.tdiv = 30; c.speed = 10;
    const b = addPart(c, 'BAT', 0, 10, 1); b.name = 'SUPPLY'; b.props.v = 12;
    const sw = addPart(c, 'SW', 3, 2); sw.name = 'MAINS'; sw.props.on = false;
    addPart(c, 'T555', 16, 10).props.model = 'NE555';
    const c1 = addPart(c, 'C', 9, 6, 1); c1.name = 'C1'; Object.assign(c1.props, { c: 220e-6, vmax: 25 });
    const r1 = addPart(c, 'R', 9, 14, 1); r1.name = 'R1'; r1.props.r = 1e6;
    const d1 = addPart(c, 'D', 6, 14, 3); d1.name = 'D1'; d1.props.model = '1N4148';
    const c2 = addPart(c, 'C', 18, 16, 1); c2.name = 'C2'; Object.assign(c2.props, { c: 10e-9, vmax: 50, polar: false });
    const r2 = addPart(c, 'R', 24, 10); r2.name = 'R2'; r2.props.r = 1000;
    addPart(c, 'NPN', 28, 10).props.model = '2N2222';
    const k = addPart(c, 'RELAY', 32, 4); Object.assign(k.props, { vcoil: 12, rcoil: 400, l: 0.12 });
    const d2 = addPart(c, 'D', 24, 4, 3); d2.name = 'D2'; d2.props.model = '1N4007';
    const lp = addPart(c, 'LAMP', 32, 10, 1); lp.name = 'FRIDGE'; Object.assign(lp.props, { vr: 12, wr: 5 });
    addPart(c, 'SCOPE', 44, 14);
    addPart(c, 'GND', 0, 18);
    W(0, 8, 0, 2); W(0, 2, 1, 2); W(5, 2, 17, 2); W(15, 6, 15, 2); W(17, 6, 17, 2);
    W(17, 2, 24, 2); W(24, 2, 29, 2); W(29, 2, 29, 0); W(29, 0, 34, 0); W(34, 0, 34, 2);
    W(9, 4, 9, 2); W(9, 8, 9, 10); W(9, 10, 12, 10); W(12, 10, 12, 12); W(9, 12, 12, 12); W(9, 16, 9, 18);
    W(6, 12, 6, 10); W(6, 10, 9, 10); W(6, 16, 6, 18);
    W(16, 14, 16, 18);
    W(20, 10, 22, 10);
    W(24, 6, 29, 6); W(29, 6, 29, 8); W(29, 12, 29, 18);
    W(32, 6, 32, 8); W(32, 12, 32, 18);
    W(0, 12, 0, 18); W(0, 18, 44, 18); W(44, 16, 44, 18);
    W(10, 10, 10, -4); W(10, -4, 41, -4); W(41, -4, 41, 13);
    W(32, 8, 39, 8); W(39, 8, 39, 15); W(39, 15, 41, 15);
  } else if (name === 'buck') {
    // DC-DC buck: 30 V in, IRLZ44N high-side switch at 50 kHz, gate driven by a floating PWM (like a bootstrap driver), 1N5819 freewheel diode,
    // 330 µH + 47 µF filter. No feedback: Vout ≈ duty × Vin (40 % → ≈ 11.8 V). Real modules (LM2596 / XL4015) add the feedback loop.
    c.tdiv = 0.002;
    const b = addPart(c, 'BAT', 0, 6, 1); b.name = 'VIN'; b.props.v = 30;
    const ci = addPart(c, 'C', 4, 6, 1); ci.name = 'CIN'; Object.assign(ci.props, { c: 100e-6, vmax: 50 });
    addPart(c, 'NMOS', 10, 2).props.model = 'IRLZ44N';
    const g = addPart(c, 'SIG', 8, 8, 1); g.name = 'PWM'; Object.assign(g.props, { wave: 'pwm', f: 50000, amp: 10, off: 0, duty: 40 });
    const rg = addPart(c, 'R', 8, 4, 1); rg.name = 'RG'; rg.props.r = 10;
    const d = addPart(c, 'D', 14, 8, 3); d.name = 'D1'; d.props.model = '1N5819';
    const l = addPart(c, 'L', 18, 6); l.name = 'L1'; Object.assign(l.props, { l: 330e-6, r: 0.05 });
    const co = addPart(c, 'C', 24, 8, 1); co.name = 'COUT'; Object.assign(co.props, { c: 47e-6, vmax: 35 });
    const rl = addPart(c, 'R', 28, 8, 1); rl.name = 'LOAD'; rl.props.r = 22;
    addPart(c, 'VM', 32, 8, 1).name = 'VOUT';
    addPart(c, 'SCOPE', 40, 10);
    addPart(c, 'GND', 0, 12);
    W(0, 4, 0, -2); W(0, -2, 11, -2); W(11, -2, 11, 0); W(4, 4, 4, -2);
    W(0, 8, 0, 12); W(4, 8, 4, 12); W(0, 12, 40, 12);
    W(11, 4, 11, 6); W(11, 6, 16, 6); W(8, 12 - 2, 11, 10); W(11, 10, 11, 6);
    W(14, 10, 14, 12);
    W(20, 6, 24, 6); W(24, 10, 24, 12); W(24, 6, 28, 6); W(28, 10, 28, 12); W(28, 6, 32, 6); W(32, 10, 32, 12);
    W(32, 6, 35, 6); W(35, 6, 35, 11); W(35, 11, 37, 11);
    W(13, 6, 13, -4); W(13, -4, 37, -4); W(37, -4, 37, 9);
  } else if (name === 'inverter') {
    // 12 V DC → 220 V AC push-pull inverter (square wave, "modified sine" style). Q1 / Q2 take turns pulling each half of the
    // center-tapped primary to ground at 50 Hz; Q3 makes Q2's gate the opposite of Q1's. Transformer 10 + 10 : 190 turns.
    c.tdiv = 0.01;
    const b = addPart(c, 'BAT', 4, 8, 1); b.name = 'BATT'; b.props.v = 12;
    const g = addPart(c, 'SIG', 2, 0, 1); g.name = 'OSC'; Object.assign(g.props, { wave: 'pwm', f: 50, amp: 10, off: 0, duty: 50 });
    const q1 = addPart(c, 'NMOS', 13, -2); q1.name = 'Q1'; q1.props.model = 'IRFZ44N';
    const q2 = addPart(c, 'NMOS', 13, 12); q2.name = 'Q2'; q2.props.model = 'IRFZ44N';
    const q3 = addPart(c, 'NPN', 6, 16); q3.name = 'Q3'; q3.props.model = '2N2222';
    const r1 = addPart(c, 'R', 8, -2); r1.name = 'R1'; r1.props.r = 100;
    const r3 = addPart(c, 'R', 0, 12, 1); r3.name = 'R3'; r3.props.r = 10000;
    const r4 = addPart(c, 'R', 9, 8, 1); r4.name = 'R4'; r4.props.r = 1000;
    const t = addPart(c, 'XFMR', 20, 6); t.name = 'TR1'; Object.assign(t.props, { n1: 10, n2: 10, ns: 190, lm: 0.3, r1: 0.02, r2: 0.02, rs: 2 });
    const lp = addPart(c, 'LAMP', 28, 6, 1); lp.name = 'LOAD'; Object.assign(lp.props, { vr: 220, wr: 60 });
    addPart(c, 'SCOPE', 36, 8);
    for (const [x, y] of [[2, 4], [4, 12], [14, 2], [14, 16], [7, 20], [28, 12], [36, 12]]) addPart(c, 'GND', x, y);
    W(2, 2, 2, 4); W(4, 10, 4, 12); W(4, 6, 9, 6); W(9, 6, 17, 6);
    W(2, -2, 6, -2); W(10, -2, 11, -2); W(14, 0, 14, 2);
    W(14, -4, 17, -4); W(17, -4, 17, 4); W(14, 10, 17, 10); W(17, 10, 17, 8); W(14, 14, 14, 16);
    W(2, -2, 0, -2); W(0, -2, 0, 10); W(0, 14, 0, 16); W(0, 16, 4, 16); W(7, 18, 7, 20);
    W(7, 14, 9, 14); W(9, 14, 9, 12); W(9, 12, 11, 12); W(9, 10, 9, 12);
    W(23, 4, 28, 4); W(23, 8, 28, 8); W(28, 8, 28, 12); W(36, 10, 36, 12);
    W(28, 4, 33, 4); W(33, 4, 33, 7); W(17, -4, 31, -4); W(31, -4, 31, 9); W(31, 9, 33, 9);
  } else if (name === 'smps') {
    // 220 V AC → 5 V DC flyback (how phone chargers work). Bridge + C1 make ≈ 310 V DC. Q1 switches the primary at 20 kHz:
    // ON stores energy in the transformer, OFF dumps it through D5 into the 5 V side. U1 + RAMP = the PWM controller (what a UC3842 does inside).
    // Feedback: above ≈ 5 V the opto LED lights (ZD1 3.3 V + LED 1.2 V + R7), its transistor pulls CTRL down → shorter pulses.
    c.tdiv = 0.005;
    const g = addPart(c, 'SIG', 6, 7); g.name = 'AC 220V'; Object.assign(g.props, { wave: 'sine', f: 50, amp: 311, off: 0, duty: 50 }); g.lbl = [-7, 3];
    [[4, 4, 'D1', -5], [4, 10, 'D2', -5], [8, 4, 'D3', 0], [8, 10, 'D4', 0]].forEach(([x, y, n, lx]) => { const d = addPart(c, 'D', x, y, 3); d.name = n; d.props.model = '1N4007'; if (lx) d.lbl = [lx, 0]; });
    const c1 = addPart(c, 'C', 10, 7, 1); c1.name = 'C1'; Object.assign(c1.props, { c: 47e-6, vmax: 400 });
    const t = addPart(c, 'XFMR', 20, 4); t.name = 'TR1'; Object.assign(t.props, { n1: 100, n2: 100, ns: 5, lm: 0.01, r1: 0.5, r2: 0.5, rs: 0.01 });
    const q = addPart(c, 'NMOS', 15, 8); q.name = 'Q1'; q.props.model = 'IRFBC40'; q.lbl = [3, 1];
    const r5 = addPart(c, 'R', 13, 14, 1); r5.name = 'R5'; r5.props.r = 10;
    const u = addPart(c, 'OPAMP', 10, 18); u.name = 'U1'; u.props.model = 'LM358';
    const vcc = addPart(c, 'BAT', 0, 20, 1); vcc.name = 'VCC 12V'; vcc.props.v = 12;
    const rp = addPart(c, 'SIG', 5, 19, 1); rp.name = 'RAMP'; Object.assign(rp.props, { wave: 'saw', f: 20000, amp: 5, off: 5, duty: 50 });
    const r6 = addPart(c, 'R', 2, 22, 1); r6.name = 'R6'; r6.props.r = 10000;
    const r8 = addPart(c, 'R', 16, 28, 1); r8.name = 'R8'; r8.props.r = 4700;
    const c4 = addPart(c, 'C', 12, 28, 1); c4.name = 'C4'; Object.assign(c4.props, { c: 10e-9, vmax: 50, polar: false });
    const d5 = addPart(c, 'D', 26, 6); d5.name = 'D5'; d5.props.model = '1N5819';
    const co = addPart(c, 'C', 30, 8, 1); co.name = 'C2'; Object.assign(co.props, { c: 470e-6, vmax: 16 });
    const rl = addPart(c, 'R', 34, 8, 1); rl.name = 'LOAD'; rl.props.r = 5;
    addPart(c, 'VM', 38, 8, 1).name = 'VOUT';
    const r7 = addPart(c, 'R', 29, 14, 1); r7.name = 'R7'; r7.props.r = 680;
    const o = addPart(c, 'OPTO', 28, 20, 1); o.name = 'U2';
    const z = addPart(c, 'ZD', 24, 18); z.name = 'ZD1'; z.props.vz = 3.3;
    addPart(c, 'SCOPE', 46, 14);
    for (const [x, y] of [[10, 12], [16, 12], [0, 22], [5, 22], [10, 22], [12, 30], [16, 30], [25, 2], [30, 10], [34, 10], [38, 10], [22, 18], [27, 24], [46, 16]]) addPart(c, 'GND', x, y);
    W(4, 6, 4, 8); W(8, 6, 8, 8); W(4, 2, 8, 2); W(8, 2, 10, 2); W(10, 2, 17, 2); W(4, 12, 8, 12); W(8, 12, 10, 12);
    W(10, 2, 10, 5); W(10, 9, 10, 12);
    W(16, 6, 16, 4); W(16, 4, 17, 4); W(16, 10, 16, 12);
    W(13, 8, 13, 12); W(13, 16, 13, 18);
    W(0, 18, 0, 15); W(0, 15, 10, 15); W(10, 15, 10, 16); W(10, 20, 10, 22); W(5, 17, 7, 17); W(5, 21, 5, 22);
    W(2, 20, 2, 15); W(2, 24, 2, 26); W(2, 26, 7, 26); W(7, 26, 7, 19);
    W(7, 26, 12, 26); W(12, 26, 16, 26); W(16, 26, 29, 26); W(29, 26, 29, 22);
    W(23, 2, 25, 2); W(23, 6, 24, 6); W(28, 6, 30, 6); W(30, 6, 34, 6); W(34, 6, 38, 6);
    W(32, 6, 32, 12); W(32, 12, 29, 12); W(29, 16, 29, 18); W(26, 18, 27, 18); W(27, 22, 27, 24);
    W(38, 6, 41, 6); W(41, 6, 41, 15); W(41, 15, 43, 15);
    W(16, 4, 16, -2); W(16, -2, 43, -2); W(43, -2, 43, 13);
  } else if (name === 'buckreg') {
    // regulated buck like an XL4015 / LM2596 module: 0–30 V in, 0–20 V out set by RV1. U1 compares the output (divided by ≈ 4.3, plus a small
    // ramp) with the RV1 reference: below → Q2 pulls Q1's gate down → Q1 (P-MOSFET) on. ZD1 keeps Q1's gate within 12 V.
    c.tdiv = 0.001;
    const b = addPart(c, 'BAT', -8, 6, 1); b.name = 'VIN'; Object.assign(b.props, { v: 24, rint: 0.5 });
    const pw = addPart(c, 'SW', -6, 0); pw.name = 'POWER'; pw.props.on = false;
    addPart(c, 'GND', -8, 14);
    const ci = addPart(c, 'C', 3, 4, 1); ci.name = 'CIN'; Object.assign(ci.props, { c: 100e-6, vmax: 50 });
    const q1 = addPart(c, 'PMOS', 12, 2); q1.name = 'Q1'; q1.props.model = 'IRF9540N';
    const rpu = addPart(c, 'R', 8, 2, 1); rpu.name = 'R1'; rpu.props.r = 2200;
    const z1 = addPart(c, 'ZD', 6, 2, 3); z1.name = 'ZD1'; z1.props.vz = 12;
    const rc = addPart(c, 'R', 10, 6, 1); rc.name = 'R2'; rc.props.r = 470;
    const q2 = addPart(c, 'NPN', 9, 10); q2.name = 'Q2'; q2.props.model = '2N2222';
    const d1 = addPart(c, 'D', 13, 8, 3); d1.name = 'D1'; d1.props.model = '1N5819';
    const l = addPart(c, 'L', 17, 4); l.name = 'L1'; Object.assign(l.props, { l: 100e-6, r: 0.05 });
    const co = addPart(c, 'C', 21, 8, 1); co.name = 'COUT'; Object.assign(co.props, { c: 220e-6, vmax: 35 });
    addPart(c, 'VM', 24, 8, 1).name = 'VOUT';
    const rl = addPart(c, 'R', 27, 8, 1); rl.name = 'LOAD'; rl.props.r = 22;
    const sw = addPart(c, 'SW', 31, 4); sw.name = 'LOAD2 ON'; sw.props.on = false;
    const rl2 = addPart(c, 'R', 35, 8, 1); rl2.name = 'LOAD2'; rl2.props.r = 10;
    const u = addPart(c, 'OPAMP', 12, 22, 2); u.name = 'U1'; u.props.model = 'LM358';
    const rb = addPart(c, 'R', 9, 17, 1); rb.name = 'R3'; rb.props.r = 4700;
    const rf1 = addPart(c, 'R', 22, 15, 1); rf1.name = 'RF1'; rf1.props.r = 30000;
    const rf2 = addPart(c, 'R', 22, 25, 1); rf2.name = 'RF2'; rf2.props.r = 10000;
    const ri = addPart(c, 'R', 24, 23); ri.name = 'R4'; ri.props.r = 100000;
    const rp = addPart(c, 'SIG', 26, 27, 1); rp.name = 'RAMP'; Object.assign(rp.props, { wave: 'saw', f: 50000, amp: 2.5, off: 0, duty: 50 });
    const rz = addPart(c, 'R', 35, 16); rz.name = 'R5'; rz.props.r = 2200;
    const z2 = addPart(c, 'ZD', 31, 14, 1); z2.name = 'ZD2'; z2.props.vz = 5.1;
    const pot = addPart(c, 'POT', 27, 16, 2); pot.name = 'RV1 SET'; Object.assign(pot.props, { r: 10000, pos: 45 });
    const css = addPart(c, 'C', 30, 20, 1); css.name = 'CSS'; Object.assign(css.props, { c: 1e-6, vmax: 16, polar: false });
    z1.lbl = [-5, -1]; rpu.lbl = [-1, -4]; q1.lbl = [3, -5]; co.lbl = [-5.5, 1.5]; rl.lbl = [0, 5.5]; rf1.lbl = [1, 1]; pot.lbl = [-2, 3.5]; z2.lbl = [1, -1.5]; rz.lbl = [0, 2]; ri.lbl = [0, -1.5]; rf2.lbl = [-5, 0]; d1.lbl = [0, 3.5];
    addPart(c, 'SCOPE', 30, -4);
    for (const [x, y] of [[22, 27], [26, 29], [30, -2], [30, 22]]) addPart(c, 'GND', x, y);
    W(-8, 4, -8, 0); W(-8, 8, -8, 14); W(-4, 0, 3, 0); W(3, 0, 6, 0); W(6, 0, 8, 0); W(8, 0, 13, 0); W(13, 0, 38, 0);
    W(3, 0, 3, 2); W(3, 6, 3, 12);
    W(-8, 12, 3, 12); W(3, 12, 35, 12);
    W(6, 4, 8, 4); W(8, 4, 10, 4); W(10, 4, 10, 2);
    W(13, 4, 13, 6); W(13, 10, 13, 12); W(13, 4, 15, 4);
    W(19, 4, 21, 4); W(21, 4, 21, 6); W(21, 10, 21, 12); W(21, 4, 22, 4); W(22, 4, 24, 4); W(24, 4, 24, 6); W(24, 10, 24, 12);
    W(24, 4, 27, 4); W(27, 4, 27, 6); W(27, 10, 27, 12); W(27, 4, 29, 4); W(33, 4, 35, 4); W(35, 4, 35, 6); W(35, 10, 35, 12);
    W(9, 22, 9, 19); W(9, 15, 9, 14); W(9, 14, 7, 14); W(7, 14, 7, 10);
    W(12, 20, 12, 12); W(-4, 0, -4, 28); W(-4, 28, 12, 28); W(12, 28, 12, 24);
    W(22, 4, 22, 13); W(22, 17, 22, 23); W(22, 23, 15, 23); W(26, 23, 26, 25);
    W(38, 0, 38, 16); W(37, 16, 38, 16); W(31, 16, 33, 16); W(29, 16, 31, 16); W(25, 16, 25, 12);
    W(27, 18, 27, 21); W(27, 21, 15, 21); W(27, 18, 30, 18);
    W(24, 4, 24, -3); W(24, -3, 27, -3); W(15, 4, 15, -5); W(15, -5, 27, -5);
  } else if (name === 'lcd') {
    // ESP32 + LCD 16×2 I2C (SDA = GPIO21, SCL = GPIO22) shows the pot voltage. The code runs by itself (💻 Code in the ESP32 panel).
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32';
    m.props.code = '#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\n\nLiquidCrystal_I2C lcd(0x27, 16, 2);   // address 0x27, 16 x 2\n\nvoid setup() {\n  lcd.init();\n  lcd.backlight();\n  lcd.setCursor(0, 0);\n  lcd.print("Fox9nertron");\n}\n\nvoid loop() {\n  int raw = analogRead(34);           // pot on GPIO34\n  float v = raw * 3.3 / 4095;\n  lcd.setCursor(0, 1);\n  lcd.print("Pot: ");\n  lcd.print(v, 2);\n  lcd.print(" V   ");\n  delay(200);\n}\n';
    m.props.run = true;
    const d = addPart(c, 'LCD', 17, -5); d.name = 'LCD1';
    const pot = addPart(c, 'POT', -10, -2); pot.name = 'RV1'; pot.props.pos = 60;
    addPart(c, 'GND', 9, -3); addPart(c, 'GND', -6, 6); addPart(c, 'GND', -12, -2);
    W(4, -6, 10, -6); W(4, -3, 7, -3); W(7, -3, 7, -5); W(7, -5, 10, -5);
    W(10, -3, 9, -3); W(10, -4, 8, -4); W(8, -4, 8, 9); W(8, 9, -4, 9); W(-4, 9, -4, 7); W(-4, 6, -6, 6);
    W(-10, -4, -4, -4); W(4, 7, 6, 7); W(6, 7, 6, 11); W(6, 11, -14, 11); W(-14, 11, -14, 0); W(-14, 0, -8, 0); W(-8, 0, -8, -2);
  } else if (name === 'oled') {
    // ESP32 + OLED 128×64 SSD1306 I2C (SDA = GPIO21, SCL = GPIO22): text, a bar and a moving graph of the pot voltage
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.oled; m.props.run = true;
    const d = addPart(c, 'OLED', 15, -5); d.name = 'OLED1'; d.props.color = 'yb';
    const pot = addPart(c, 'POT', -10, -2); pot.name = 'RV1'; pot.props.pos = 60;
    addPart(c, 'GND', 9, -3); addPart(c, 'GND', -6, 6); addPart(c, 'GND', -12, -2);
    W(4, -6, 10, -6); W(4, -3, 7, -3); W(7, -3, 7, -5); W(7, -5, 10, -5);
    W(10, -3, 9, -3); W(10, -4, 8, -4); W(8, -4, 8, 9); W(8, 9, -4, 9); W(-4, 9, -4, 7); W(-4, 6, -6, 6);
    W(-10, -4, -4, -4); W(4, 7, 6, 7); W(6, 7, 6, 11); W(6, 11, -14, 11); W(-14, 11, -14, 0); W(-14, 0, -8, 0); W(-8, 0, -8, -2);
  } else if (name === 'encoder') {
    // ESP32 + KY-040 rotary encoder (interrupt on CLK) + OLED menu + LED. Turn = move, push = choose
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.encoder; m.props.run = true;
    const d = addPart(c, 'OLED', 15, -5); d.name = 'OLED1'; d.props.color = 'yb';
    addPart(c, 'ENC', -12, 0).name = 'ENC1';
    const r = addPart(c, 'R', 7, -10); r.name = 'R1'; r.props.r = 330;
    addPart(c, 'LED', 12, -10).name = 'LED1';
    addPart(c, 'GND', 9, -3); addPart(c, 'GND', -6, 6); addPart(c, 'GND', -8, 2); addPart(c, 'GND', 15, -10);
    // OLED (same as the OLED example)
    W(4, -6, 10, -6); W(4, -3, 7, -3); W(7, -3, 7, -5); W(7, -5, 10, -5);
    W(10, -3, 9, -3); W(10, -4, 8, -4); W(8, -4, 8, 9); W(8, 9, -4, 9); W(-4, 9, -4, 7); W(-4, 6, -6, 6);
    // encoder: CLK → GPIO32, DT → GPIO33, SW → GPIO25, + → 3V3, GND
    W(-9, -2, -4, -2); W(-9, -1, -4, -1); W(-9, 0, -4, 0); W(-9, 2, -8, 2);
    W(-9, 1, -7, 1); W(-7, 1, -7, 11); W(-7, 11, 6, 11); W(6, 11, 6, 7); W(6, 7, 4, 7);
    // LED on GPIO23 through 330 Ω
    W(4, -7, 5, -7); W(5, -7, 5, -10); W(9, -10, 10, -10); W(14, -10, 15, -10);
  } else if (name === 'sr595sig') {
    // 74HC595 by hand: one signal generator is the DATA (SER), another the CLOCK (SRCLK). RCLK tied to SRCLK. 8 LEDs show QA … QH.
    const u = addPart(c, 'SR595', 0, 0); u.name = 'U1'; u.lbl = [4.5, 0];
    const clk = addPart(c, 'SIG', -12, 2, 1); clk.name = 'CLK'; Object.assign(clk.props, { wave: 'pwm', f: 2, amp: 5, off: 0, duty: 50 });
    const ser = addPart(c, 'SIG', -24, 2, 1); ser.name = 'SER'; Object.assign(ser.props, { wave: 'pwm', f: 0.3, amp: 5, off: 0, duty: 50 });
    const b = addPart(c, 'BAT', 8, -9); b.name = 'B1'; b.props.v = 5;
    addPart(c, 'SCOPE', -6, 12);
    addPart(c, 'GND', -12, 6); addPart(c, 'GND', 0, 7); addPart(c, 'GND', 2, 9); addPart(c, 'GND', 11, -9); addPart(c, 'GND', 8, 16); addPart(c, 'GND', -6, 14);
    // SER and CLK into the chip, RCLK joined to the clock
    W(-24, 0, -24, -4); W(-24, -4, -4, -4); W(-12, 0, -12, -3); W(-12, -3, -4, -3); W(-6, -3, -6, -2); W(-6, -2, -4, -2);
    W(-24, 4, -24, 6); W(-24, 6, -12, 6); W(-12, 4, -12, 6);
    // 5 V to VCC and SRCLR, OE to ground
    W(0, -6, 0, -9); W(0, -9, 6, -9); W(2, -6, 2, -8); W(2, -8, 0, -8); W(10, -9, 11, -9); W(2, 7, 2, 9);
    // QA … QH → 330 Ω → LED → ground
    for (let k = 0; k < 8; k++) {
      const x = 8 + 4 * k, y = -4 + k;
      W(4, y, x, y); W(x, y, x, 6);
      const r = addPart(c, 'R', x, 8, 1); r.name = 'R' + (k + 1); r.props.r = 330;
      const l = addPart(c, 'LED', x, 13, 1); l.name = 'Q' + 'ABCDEFGH'[k]; l.props.color = 'red';
      W(x, 10, x, 11); W(x, 15, x, 16); if (k < 7) W(x, 16, x + 4, 16);
    }
    // scope: CH1 = clock, CH2 = data
    W(-12, 0, -10, 0); W(-10, 0, -10, 11); W(-10, 11, -9, 11);
    W(-24, 0, -26, 0); W(-26, 0, -26, 13); W(-26, 13, -9, 13);
  } else if (name === 'relay10') {
    // ESP32 → two 74HCT595 in a chain → 10 relay modules (active LOW). Serial commands switch them (type in the Serial box).
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.relay10; m.props.run = true;
    const u1 = addPart(c, 'SR595', 12, 2); u1.name = 'U1'; u1.props.model = '74HCT595';
    const u2 = addPart(c, 'SR595', 12, 20); u2.name = 'U2'; u2.props.model = '74HCT595';
    const ps = addPart(c, 'BAT', 33, -15); ps.name = 'PSU'; ps.props.v = 5;
    for (let k = 0; k < 10; k++) addPart(c, 'RMOD', 36, -10 + 6 * k).name = 'RLY' + (k + 1);
    u1.lbl = [4.5, 0]; u2.lbl = [4.5, 0];
    addPart(c, 'GND', -6, 6); addPart(c, 'GND', 12, 9); addPart(c, 'GND', 12, 27); addPart(c, 'GND', 36, -15); addPart(c, 'GND', 32, 44);
    W(-4, 6, -6, 6);
    // ESP32 → U1: SER ← GPIO19, SRCLK ← GPIO18, RCLK ← GPIO5
    W(4, -2, 8, -2); W(4, -1, 8, -1); W(4, 0, 8, 0);
    // clock + latch to U2, U1 QH' → U2 SER (the cascade)
    W(6, -1, 6, 17); W(6, 17, 8, 17); W(5, 0, 5, 18); W(5, 18, 8, 18);
    W(16, 7, 17, 7); W(17, 7, 17, 11); W(17, 11, 7, 11); W(7, 11, 7, 16); W(7, 16, 8, 16);
    // chip power: VCC + SRCLR to 5 V, GND + OE to ground
    W(12, -4, 14, -4); W(12, -4, 12, -6); W(12, -6, 31, -6);
    W(12, 14, 14, 14); W(12, 14, 12, 12); W(12, 12, 31, 12);
    // OE (pin 13) of both chips ← GPIO4: HIGH while booting = every relay OFF (on the real board add 10 kΩ from OE to 3.3 V)
    W(4, 3, 7, 3); W(7, 3, 7, 10); W(7, 10, 19, 10); W(14, 9, 14, 10); W(19, 10, 19, 28); W(19, 28, 14, 28); W(14, 28, 14, 27);
    // 5 V supply rails for the relays
    W(31, -15, 31, 43); W(32, -10, 32, 44); W(35, -15, 36, -15);
    for (let k = 0; k < 10; k++) { const y = -10 + 6 * k; W(31, y - 1, 33, y - 1); W(32, y, 33, y); }
    // outputs → relay IN: U1 QA…QH = relays 1–8, U2 QA, QB = relays 9, 10
    const route = (yq, x, k) => { const yin = -9 + 6 * k; W(16, yq, x, yq); W(x, yq, x, yin); W(x, yin, 33, yin); };
    for (let k = 0; k < 8; k++) route(-2 + k, 30 - k, k);
    route(16, 22, 8); route(17, 21, 9);
  } else if (name === 'seg7') {
    // UNO counts 0 → 9 on a common-cathode 7-segment: a … dp on D2 … D9, one 330 Ω on the common pin
    const m = addPart(c, 'UNO', 0, 0); m.name = 'UNO';
    m.props.code = '// 7-segment, common cathode: a b c d e f g dp on D2 ... D9\nconst int SEG[8] = {2, 3, 4, 5, 6, 7, 8, 9};\n//                      0     1     2     3     4     5     6     7     8     9\nconst byte DIGITS[10] = {0x3F, 0x06, 0x5B, 0x4F, 0x66, 0x6D, 0x7D, 0x07, 0x7F, 0x6F};\n\nvoid setup() {\n  Serial.begin(9600);\n  for (int i = 0; i < 8; i++) pinMode(SEG[i], OUTPUT);\n}\n\nvoid show(int n) {\n  for (int i = 0; i < 7; i++) digitalWrite(SEG[i], (DIGITS[n] >> i) & 1);\n}\n\nvoid loop() {\n  for (int n = 0; n < 10; n++) {\n    show(n);\n    Serial.println(n);\n    delay(700);\n  }\n}\n';
    m.props.run = true;
    const d = addPart(c, 'SEG7', 16, -1); d.name = 'DS1';
    const r = addPart(c, 'R', 11, 5, 1); r.name = 'R1'; r.props.r = 330; r.lbl = [-6, 0];
    addPart(c, 'GND', 11, 7); addPart(c, 'GND', -6, -2);
    for (let k = 0; k < 8; k++) W(4, -5 + k, 13, -5 + k);
    W(13, 3, 11, 3); W(-4, -2, -6, -2);
  } else if (name === 'thermo') {
    // ESP32 + DHT22 on GPIO4: above 30 °C the FAN LED (GPIO23) turns on. Slide the DHT temperature in its panel.
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.thermo; m.props.run = true;
    const d = addPart(c, 'DHT', 12, 3); d.name = 'DHT1'; d.props.temp = 27;
    const r = addPart(c, 'R', 7, -7); r.name = 'R1'; r.props.r = 330;
    const l = addPart(c, 'LED', 12, -7); l.name = 'FAN'; l.props.color = 'blue';
    addPart(c, 'GND', 9, 4); addPart(c, 'GND', 14, -7); addPart(c, 'GND', -6, 6); W(-4, 6, -6, 6);
    W(4, 3, 9, 3); W(4, 7, 16, 7); W(16, 7, 16, 1); W(16, 1, 9, 1); W(9, 1, 9, 2);
    W(4, -7, 5, -7); W(9, -7, 10, -7);
  } else if (name === 'parking') {
    // UNO + HC-SR04 (TRIG D9, ECHO D10): LED on D13 when something is closer than 20 cm. Slide the distance in the sensor panel.
    const m = addPart(c, 'UNO', 0, 0); m.name = 'UNO'; m.props.code = SKETCH_EX.parking; m.props.run = true;
    const u = addPart(c, 'HCSR04', 14, 2); u.name = 'SONAR'; u.props.cm = 35;
    const r = addPart(c, 'R', 7, 6); r.name = 'R1'; r.props.r = 220;
    const l = addPart(c, 'LED', 12, 6); l.name = 'NEAR'; l.props.color = 'red';
    addPart(c, 'GND', 10, 4); addPart(c, 'GND', 14, 6); addPart(c, 'GND', -6, -2);
    W(4, 2, 10, 2); W(4, 3, 10, 3); W(-4, -5, -6, -5); W(-6, -5, -6, -9); W(-6, -9, 8, -9); W(8, -9, 8, 1); W(8, 1, 10, 1);
    W(4, 6, 5, 6); W(9, 6, 10, 6); W(-4, -2, -6, -2);
  } else if (name === 'autolight') {
    // UNO + LDR / 10 kΩ divider on A0: the darker it gets, the brighter the LED on D9 (PWM). Slide the light level in the LDR panel.
    const m = addPart(c, 'UNO', 0, 0); m.name = 'UNO'; m.props.code = SKETCH_EX.autolight; m.props.run = true;
    const ld = addPart(c, 'LDR', -8, -2, 1); ld.name = 'LDR1'; ld.props.lux = 50;
    const rd = addPart(c, 'R', -8, 2, 1); rd.name = 'R1'; rd.props.r = 10000;
    const r = addPart(c, 'R', 7, 2); r.name = 'R2'; r.props.r = 220;
    const l = addPart(c, 'LED', 12, 2); l.name = 'LAMP'; l.props.color = 'white';
    addPart(c, 'GND', -8, 4); addPart(c, 'GND', 14, 2); addPart(c, 'GND', -6, -2);
    W(-8, -4, -8, -5); W(-8, -5, -4, -5); W(-8, 0, -4, 0); W(-4, -2, -6, -2);
    W(4, 2, 5, 2); W(9, 2, 10, 2);
  } else if (name === 'doorlock') {
    // Keypad door lock: ESP32 + 4×4 keypad + LCD 16×2 I2C + buzzer + IRLZ44N switching a 12 V solenoid lock. PIN 1234 then #.
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32'; m.props.code = SKETCH_EX.doorlock; m.props.run = true;
    addPart(c, 'KEYPAD', 17, 1).name = 'KEYPAD';
    addPart(c, 'LCD', 22, -9).name = 'LCD1';
    addPart(c, 'BUZZER', 8, -13).name = 'BUZZER';
    const lk = addPart(c, 'LOCK', -13, 2, 1); lk.name = 'LOCK'; lk.lbl = [-1, -3.3];
    const d = addPart(c, 'D', -10, 2, 3); d.name = 'D1'; d.props.model = '1N5819'; d.lbl = [0.6, 1.2];
    const q = addPart(c, 'NMOS', -14, 8); q.name = 'Q1'; q.props.model = 'IRLZ44N'; q.lbl = [-4, 0.4];
    const rg = addPart(c, 'R', -9, 12); rg.name = 'R1'; rg.props.r = 100;
    const rp = addPart(c, 'R', -17, 14, 1); rp.name = 'R2'; rp.props.r = 10000;
    const b = addPart(c, 'BAT', -20, 3, 1); b.name = '12V'; b.props.v = 12;
    for (const [x, y] of [[15, -7], [10, -13], [6, 6], [-13, 10], [-17, 16], [-20, 5]]) addPart(c, 'GND', x, y);
    for (let y = -2; y <= 5; y++) W(4, y, 12, y);
    W(4, -6, 6, -6); W(6, -6, 6, -10); W(6, -10, 15, -10);
    W(4, -3, 8, -3); W(8, -3, 8, -9); W(8, -9, 15, -9);
    W(-4, 7, -4, 9); W(-4, 9, 24, 9); W(24, 9, 24, -5); W(24, -5, 13, -5); W(13, -5, 13, -8); W(13, -8, 15, -8);
    W(4, -7, 5, -7); W(5, -7, 5, -13); W(5, -13, 6, -13);
    W(4, 6, 6, 6);
    W(-4, 5, -6, 5); W(-6, 5, -6, 12); W(-6, 12, -7, 12); W(-11, 12, -17, 12); W(-17, 12, -17, 8); W(-17, 8, -16, 8);
    W(-13, 4, -13, 6); W(-10, 4, -10, 6); W(-10, 6, -13, 6); W(-13, 0, -10, 0);
    W(-20, 1, -20, 0); W(-20, 0, -13, 0);
  } else if (name === 'esp32io') {
    // ESP32 pins set by hand: D23 OUTPUT HIGH → 330 Ω → LED · D15 INPUT_PULLUP + button to GND · D34 analogRead of a 10 kΩ pot on 3.3 V
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32';
    m.props.pins = { D23: { mode: 'high' }, D15: { mode: 'pu' }, D34: { mode: 'adc' } };
    addPart(c, 'R', 7, -7).props.r = 330;
    const l = addPart(c, 'LED', 12, -7); l.props.color = 'red';
    const pb = addPart(c, 'PB', 10, 5); pb.name = 'BTN';
    const pot = addPart(c, 'POT', -10, 0, 1); pot.props.pos = 50;
    addPart(c, 'GND', 16, 10);
    W(4, -7, 5, -7); W(9, -7, 10, -7); W(14, -7, 16, -7); W(16, -7, 16, 10);
    W(4, 5, 8, 5); W(12, 5, 12, 10); W(4, 6, 6, 6); W(6, 6, 6, 10); W(6, 10, 16, 10);
    W(-8, 0, -6, 0); W(-6, 0, -6, -4); W(-6, -4, -4, -4);
    W(-10, 2, -10, 6); W(-10, 6, -4, 6);
    W(-10, -2, -12, -2); W(-12, -2, -12, 9); W(-12, 9, 4, 9); W(4, 9, 4, 7);
  } else if (name === 'unoio') {
    // Arduino UNO pins set by hand: D13 OUTPUT HIGH → 220 Ω → LED · D2 INPUT_PULLUP + button to GND · A0 analogRead of a 10 kΩ pot on 5 V
    const m = addPart(c, 'UNO', 0, 0); m.name = 'UNO';
    m.props.pins = { D13: { mode: 'high' }, D2: { mode: 'pu' }, A0: { mode: 'adc' } };
    addPart(c, 'R', 7, 6).props.r = 220;
    addPart(c, 'LED', 12, 6).props.color = 'red';
    const pb = addPart(c, 'PB', 10, -5); pb.name = 'BTN';
    const pot = addPart(c, 'POT', -10, 0, 1); pot.props.pos = 50; pot.lbl = [-1.5, 3.5];
    addPart(c, 'GND', 16, 10);
    W(4, 6, 5, 6); W(9, 6, 10, 6); W(14, 6, 16, 6); W(16, 6, 16, 10);
    W(4, -5, 8, -5); W(12, -5, 16, -5); W(16, -5, 16, 6);
    W(-4, -2, -6, -2); W(-6, -2, -6, 10); W(-10, 10, 16, 10);
    W(-8, 0, -4, 0); W(-10, -2, -10, -5); W(-10, -5, -4, -5); W(-10, 2, -10, 10);
  } else if (name === 'servo') {
    // ESP32 D18 PWM 50 Hz → servo signal. Duty 2.5 % (0.5 ms) = 0°, 7.5 % (1.5 ms) = 90°, 12.5 % (2.5 ms) = 180°. Servo power from VIN (USB 5 V)
    c.tdiv = 0.005;
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32';
    m.props.pins = { D18: { mode: 'pwm', f: 50, duty: 7.5 } };
    const sv = addPart(c, 'SERVO', 14, 0); sv.props.model = 'SG90'; sv.name = 'SERVO';
    addPart(c, 'GND', 8, 10);
    // D18 (4,-1) → SIG (11,-1); VIN (-4,7) → VCC (11,0); GND2 (4,6) → GND (11,1)
    W(4, -1, 11, -1); W(4, 6, 8, 6); W(8, 6, 8, 1); W(8, 1, 11, 1); W(8, 6, 8, 10);
    W(-4, 7, -6, 7); W(-6, 7, -6, 9); W(-6, 9, 9, 9); W(9, 9, 9, 0); W(9, 0, 11, 0);
  } else if (name === 'stepper') {
    // ESP32 D18 = STEP (PWM 200 Hz = 200 steps/s = 1 turn/s = 60 RPM), D5 = DIR. EN left open = on (pulled down inside). Motor power 12 V on VMOT
    c.tdiv = 0.002;
    const m = addPart(c, 'ESP32', 0, 0); m.name = 'ESP32';
    m.props.pins = { D18: { mode: 'pwm', f: 200, duty: 50 }, D5: { mode: 'high' } };
    const st = addPart(c, 'STEPPER', 14, 1); st.name = 'STEPPER';
    const b = addPart(c, 'BAT', 24, 8, 1); b.name = 'VMOT'; b.props.v = 12;
    addPart(c, 'GND', -6, 12);
    // stepper pins (10,-1) STEP, (10,0) DIR, (10,1) EN, (10,2) VDD, (10,3) GND, (10,4) VMOT
    W(4, -1, 10, -1); W(4, 0, 10, 0);
    W(10, 3, 8, 3); W(8, 3, 8, 12);
    W(10, 2, 7, 2); W(7, 2, 7, 7); W(7, 7, 4, 7);
    W(10, 4, 9, 4); W(9, 4, 9, 10); W(9, 10, 22, 10); W(22, 10, 22, 6); W(22, 6, 24, 6);
    W(-4, 6, -6, 6); W(-6, 6, -6, 12); W(-6, 12, 24, 12); W(24, 10, 24, 12);
  } else if (name === 'bridge') {
    const b = addPart(c, 'BAT', 0, 8, 1); b.props.v = 10;
    addPart(c, 'R', 6, 4, 1).props.r = 1000;   // R1 top-left
    addPart(c, 'R', 6, 12, 1).props.r = 2000;  // R2 bottom-left
    addPart(c, 'R', 16, 4, 1).props.r = 1500;  // R3 top-right
    addPart(c, 'R', 16, 12, 1).props.r = 2000; // R4 bottom-right
    addPart(c, 'VM', 11, 8);
    addPart(c, 'GND', 0, 16);
    W(0, 6, 0, 0); W(0, 0, 16, 0); W(6, 0, 6, 2); W(16, 0, 16, 2); W(6, 6, 6, 10); W(16, 6, 16, 10);
    W(6, 8, 9, 8); W(13, 8, 16, 8); W(6, 14, 6, 16); W(16, 14, 16, 16); W(0, 10, 0, 16); W(0, 16, 16, 16);
  }
  return c;
}
