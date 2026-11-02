// Schematic editor: place parts, draw wires, see every voltage / current / power live.
import { el, store, card, note } from '../ui.js';
import { si, plain, parse, pct, nearest, E12 } from '../num.js';
import * as S from '../sch-core.js';
import { wattName } from './basic.js';
import { pcbView } from './pcb.js';
import { createRuntime, EXAMPLES as SKETCHES } from '../sketch.js';
import { netlist, pinLabel } from '../pcb-core.js';
import qrcode from '../qr.js';
// what each LCD part shows right now: id → { lines, bl, on, powered, note }
const LCDV = new Map();
// what each OLED shows: id → { powered, d (the sketch's display object) | null, note }
const OLEDV = new Map(), OLEDCV = new Map();
const OLED_COL = { white: ['#EAF6FF', '#EAF6FF'], blue: ['#4FC3F7', '#4FC3F7'], yb: ['#FFD54F', '#4FC3F7'] };
// keypad: taps waiting for the sketch, and the key that flashes on the drawing
const KEYQ = new Map(), KEYFLASH = new Map();
// rotary encoders: id → { q: queued clicks (+1 / −1), cur: click in progress, push: press waiting, until: button released at, pos: clicks so far }
const ENCS = new Map(), ENC_PH = 0.005;     // each of the 4 contact phases of one click lasts 5 ms of circuit time
const encOf = (id) => ENCS.get(id) ?? ENCS.set(id, { q: [], cur: null, push: false, until: -1, pos: 0 }).get(id);
const KEYLAB = ['123A', '456B', '789C', '*0#D'];

const C = {
  bg: '#0F1317', dot: '#252D36', wire: '#8A97A6', part: '#E4E9EF', sel: '#4FC3F7', pin: '#FFC857', text: '#C9D3DD', dim: '#7E8A97',
  pos: [61, 220, 132], neg: [255, 107, 107], gnd: [138, 151, 166], cur: '#FFE16B',
};
const RATINGS = [0.125, 0.25, 0.5, 1, 2, 3, 5, 10];

export function schematicTab(root) {
  root.classList.add('sch-pane');
  // ---------- state ----------
  registerLib(myParts(), false);
  let c = load() ?? S.example('led');
  registerLib(c.lib, true);
  let sel = null;            // {kind:'part', id} | {kind:'wire', i}
  let mode = 'select';       // select | wire | delete | place
  let placeType = null;
  let wireStart = null, hover = null;
  let res = null;
  const view = { ox: 0, oy: 0, g: 22 };
  const hist = [JSON.stringify(c)]; let hi = 0;
  let showVolts = store.get('sch.volts', '1') === '1';
  let showDots = store.get('sch.dots', '1') === '1';
  let running = false; // always opens stopped: tap ▶ Run to simulate
  const STOPPED = 'Simulation stopped: no voltages or currents. Tap ▶ Run to start it again.';
  // time simulation (capacitors, coils, signal generator, scope)
  const TDIVS = [1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60];
  const VDIVS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const SAMPLES = 400;      // samples across one scope screen (10 divisions)
  const sim = { t: 0, state: new Map(), buf: [], paused: false, tdiv: +store.get('sch.tdiv', '0.005'), speed: store.get('sch.speed2', 'screen'), next: null,
    v1: store.get('sch.v1', 'auto'), v2: store.get('sch.v2', 'auto'), p1: +store.get('sch.p1', '0') || 0, p2: +store.get('sch.p2', '0') || 0 };
  const dtOf = () => sim.tdiv * 10 / SAMPLES;
  const timeMode = () => running && S.isDynamic(c);
  function solve() {
    if (!running) { res = { ok: false, stopped: true, error: STOPPED }; return; }
    res = timeMode() ? S.solveCircuit(c, { t: sim.t, dt: dtOf(), state: sim.state }) : S.solveCircuit(c);
  }
  // time 0 starts from the DC operating point (signals at their offset): amplifier coupling capacitors are already charged
  // ---------- Arduino sketch runner (boards with code switched on) ----------
  const sketches = new Map();      // board id → runtime
  function boardV(p, name) {
    if (!res?.ok) return null;
    const B = S.BOARDS[p.type], pts = S.pinsOf(p), i = B.pins.findIndex(q => q.n === name), gi = B.pins.findIndex(q => q.k === 'gnd');
    if (i < 0) return null;
    const v = res.vAt(...pts[i]), g = res.vAt(...pts[gi]) ?? 0;
    return v == null ? null : v - g;
  }
  function restartSketches() {
    sketches.clear();
    for (const p of c.parts) {
      if (!S.isBoard(p.type) || !p.props.run || !p.props.code) continue;
      p.props.pins = {};                         // a fresh boot: every pin is an input until the code says otherwise
      try { sketches.set(p.id, createRuntime(p, p.props.code, { t: () => sim.t, v: (n) => boardV(p, n), pins: p.props.pins, dht: (n) => dhtAt(p, n), echo: (n) => echoAt(p, n), keypad: (rows, cols) => keyAt(p, rows, cols) })); }
      catch (e) { sketches.set(p.id, { err: e.message, lines: [], step() { } }); }
    }
  }
  // which board drives which LCD: SDA and SCL nets must meet the board's I2C pins (ESP32 21 / 22, UNO A4 / A5)
  let lcdLinks = null, lcdKey = '';
  function updateLcds() {
    const key = JSON.stringify(c.wires) + c.parts.map(p => p.id + ':' + p.x + ',' + p.y + ',' + p.rot).join(';');
    if (key !== lcdKey) {
      lcdKey = key; lcdLinks = new Map();
      try {
        const nl = netlist(c), nets = (p) => nl.pinNet.get(p.id) ?? [];
        for (const d of c.parts.filter(p => p.type === 'LCD' || p.type === 'OLED')) {
          const nn = nets(d), [sda, scl] = d.type === 'OLED' ? [nn[3], nn[2]] : [nn[2], nn[3]];
          const b = c.parts.find(p => S.isBoard(p.type) && (() => { const B = S.BOARDS[p.type], n = nets(p), i = (nm) => B.pins.findIndex(q => q.n === nm); const [a1, a2] = p.type === 'ESP32' ? ['D21', 'D22'] : ['A4', 'A5']; return sda >= 0 && n[i(a1)] === sda && n[i(a2)] === scl; })());
          lcdLinks.set(d.id, b?.id ?? null);
        }
      } catch { }
    }
    for (const d of c.parts.filter(p => p.type === 'LCD')) {
      const r = res?.ok ? res.parts.get(d.id) : null, powered = !!r && r.v > 2.5, bid = lcdLinks.get(d.id), b = c.parts.find(p => p.id === bid);
      const rt = bid != null ? sketches.get(bid) : null, disp = rt?.displays?.find(x => x.addr === (d.props.addr ?? 0x27)) ?? null;
      const note = !b ? 'SDA / SCL not wired to a board\'s I2C pins (ESP32 GPIO21 / 22, UNO A4 / A5).' : !rt ? `Wired to ${b.name}. Run code on ${b.name} (💻 Code) to show text.` : !disp ? (rt.displays?.length ? `The code talks to address 0x${rt.displays[0].addr.toString(16).toUpperCase()}, this LCD is 0x${(d.props.addr ?? 0x27).toString(16).toUpperCase()}.` : 'The code has no LiquidCrystal_I2C lcd(...) for this display.') : `Driven by ${b.name} at 0x${disp.addr.toString(16).toUpperCase()}.`;
      LCDV.set(d.id, { powered, lines: disp && disp.on ? disp.buf : null, bl: disp ? disp.bl : false, on: disp?.on, note });
    }
    for (const d of c.parts.filter(p => p.type === 'OLED')) {
      const r = res?.ok ? res.parts.get(d.id) : null, powered = !!r && r.v > 2.8, bid = lcdLinks.get(d.id), b = c.parts.find(p => p.id === bid);
      const rt = bid != null ? sketches.get(bid) : null, addr = d.props.addr ?? 0x3C, disp = rt?.oleds?.find(x => x.addr === addr && x.shown) ?? null, hx = (a) => '0x' + a.toString(16).toUpperCase();
      const note = !b ? 'SDA / SCL not wired to a board\'s I2C pins (ESP32 GPIO21 / 22, UNO A4 / A5).' : !rt ? `Wired to ${b.name}. Run code on ${b.name} (💻 Code) to draw on it.` : !disp ? (rt.oleds?.some(x => x.shown) ? `The code talks to address ${hx(rt.oleds.find(x => x.shown).addr)}, this OLED is ${hx(addr)}.` : rt.oleds?.length ? 'display.begin(SSD1306_SWITCHCAPVCC, 0x3C) not called yet.' : 'The code has no Adafruit_SSD1306 display(...) for this OLED.') : `Driven by ${b.name} at ${hx(addr)}.`;
      OLEDV.set(d.id, { powered, d: disp, note });
    }
  }
  // sensors wired to a board pin (same net), powered
  let nlCache = null, nlKey = '';
  function nets() {
    const key = JSON.stringify(c.wires) + c.parts.map(p => p.id + ':' + p.x + ',' + p.y + ',' + p.rot).join(';');
    if (key !== nlKey) { nlKey = key; try { nlCache = netlist(c); } catch { nlCache = null; } }
    return nlCache;
  }
  const pinNetOf = (nl, p, i) => (nl?.pinNet.get(p.id) ?? [])[i];
  function boardNet(nl, b, name) { return pinNetOf(nl, b, S.BOARDS[b.type].pins.findIndex(q => q.n === name)); }
  function dhtAt(b, name) {
    const nl = nets(), bn = boardNet(nl, b, name); if (bn == null || bn < 0) return null;
    const d = c.parts.find(p => p.type === 'DHT' && pinNetOf(nl, p, 1) === bn); if (!d) return null;
    const r = res?.ok ? res.parts.get(d.id) : null; if (!r || r.v < 3) return null;
    return { t: d.props.temp, h: d.props.hum };
  }
  function echoAt(b, name) {
    const nl = nets(), bn = boardNet(nl, b, name); if (bn == null || bn < 0) return null;
    const u = c.parts.find(p => p.type === 'HCSR04' && pinNetOf(nl, p, 2) === bn); if (!u) return null;
    const r = res?.ok ? res.parts.get(u.id) : null; if (!r || r.v < 4.5) return null;     // HC-SR04 needs 5 V
    const tn = pinNetOf(nl, u, 1), trig = S.BOARDS[b.type].pins.find((q, i) => pinNetOf(nl, b, i) === tn && q.k === 'gpio')?.n;
    return trig ? { cm: u.props.cm, trig } : null;
  }
  function keyAt(b, rows, cols) {
    const nl = nets(); if (!nl) return null;
    const want = [...rows, ...cols].map(n => boardNet(nl, b, n));
    const kp = c.parts.find(p => p.type === 'KEYPAD' && want.every((nt, i) => nt != null && nt >= 0 && pinNetOf(nl, p, i) === nt));
    if (!kp) return null;
    const q = KEYQ.get(kp.id); return q?.length ? q.shift() : null;
  }
  function runSketches() { for (const rt of sketches.values()) rt.step(sim.t); }
  function resetSim() { restartSketches(); sim.prev = null; sim.t = 0; sim.buf = []; sim.next = null; let st = new Map(); try { const r = S.solveCircuit(c, null, { sigOff: true }); if (r.ok) st = r.next; } catch { } sim.state = st; }
  // run the circuit for `span` seconds of circuit time. The step is fine enough for the fastest signal (≥ 40 per period),
  // independent of the scope. The scope only takes samples every time/div × 10 ÷ 400.
  const MAX_STEPS = 600;
  function simDt() {
    const fs = S.fastestFreq(c), sd = dtOf();
    // real-time runs: step size from the fastest signal only (20 per period), so zooming the scope doesn't slow the motors
    if (sim.speed !== 'screen') return Math.max(1e-7, Math.min(fs > 0 ? 1 / fs / 40 : 0.002, 0.002));
    return Math.max(1e-7, Math.min(sd, fs > 0 ? 1 / fs / 40 : sd, 0.002));
  }
  // move each encoder's contacts through the quadrature phases of the click being turned (CW: CLK closes first, CCW: DT first)
  let encParts = [];
  function updateEncoders(t) {
    for (const p of encParts) {
      const s = encOf(p.id);
      if (s.cur && t < s.cur.t0) s.cur.t0 = t;
      if (!s.cur && s.q.length) s.cur = { d: s.q.shift(), t0: t };
      let a = false, b = false;
      if (s.cur) {
        const ph = Math.floor((t - s.cur.t0) / ENC_PH + 1e-9); s.prog = Math.min(1, (t - s.cur.t0) / (4 * ENC_PH));
        if (ph >= 4) { s.pos += s.cur.d; s.cur = null; }
        else { const lead = ph <= 1, lag = ph === 1 || ph === 2; if (s.cur.d > 0) { a = lead; b = lag; } else { b = lead; a = lag; } }
      }
      if (s.push) { s.until = t + 0.15; s.push = false; }
      if (s.until > t + 1) s.until = -1;
      p.props._a = a; p.props._b = b; p.props._sw = t < s.until;
    }
  }
  function encTurn(p, d) {
    const s = encOf(p.id); if (s.q.length < 24) s.q.push(d);
    if (!running) say('Knob turned. Tap ▶ Run so the circuit (and the sketch) sees it.');
    draw();
  }
  function encPush(p) { encOf(p.id).push = true; if (!running) say('Knob pushed. Tap ▶ Run so the circuit (and the sketch) sees it.'); draw(); }
  function stepSim(span) {
    encParts = c.parts.filter(p => p.type === 'ENC');
    const dt = simDt(), sd = dtOf(), scope = c.parts.find(p => p.type === 'SCOPE');
    let n = Math.max(1, Math.ceil(span / dt - 1e-9));
    let lag = n > MAX_STEPS; n = Math.min(n, MAX_STEPS);
    if (sim.next == null || sim.next < sim.t - sd) sim.next = sim.t;
    const t0 = performance.now();
    for (let k = 0; k < n; k++) {
      if (k > 0 && (k & 7) === 0 && performance.now() - t0 > 40) { lag = true; break; }   // keep the screen smooth on big circuits (SMPS)
      sim.t += dt;
      if (encParts.length) updateEncoders(sim.t);
      if (sketches.size) runSketches();
      const r = S.solveCircuit(c, { t: sim.t, dt, state: sim.state });
      res = r;
      if (!r.ok) return lag;
      sim.state = r.next;
      // scope samples fall between two solver steps when the step is longer than a sample: draw the straight line between them
      // (no stair-steps). The circuit result itself is unchanged.
      const sc = scope && r.parts.get(scope.id), y1 = sc ? sc.ch1 : NaN, y2 = sc ? sc.ch2 : NaN, pv = sim.prev && sim.prev[0] < sim.t ? sim.prev : null;
      while (sim.t + 1e-12 >= sim.next) {
        const f = pv ? Math.max(0, Math.min(1, (sim.next - pv[0]) / (sim.t - pv[0]))) : 1;
        sim.buf.push([sim.next, pv ? pv[1] + (y1 - pv[1]) * f : y1, pv ? pv[2] + (y2 - pv[2]) * f : y2]); sim.next += sd;
      }
      sim.prev = [sim.t, y1, y2];
    }
    if (sim.buf.length > SAMPLES * 3) sim.buf.splice(0, sim.buf.length - SAMPLES * 3);
    return lag;
  }
  let panelRefresh = null, lastPanel = 0, tipVals = [];

  // ---------- DOM ----------
  const btn = (text, on, cls = '') => el('button', { class: 'sb ' + cls, type: 'button', text, onclick: on });
  const modeBtns = {
    select: btn('↖ Select', () => setMode('select')),
    wire: btn('〰 Wire', () => setMode('wire')),
    delete: btn('🗑 Delete', () => { if (mode === 'select' && deleteSel()) return; setMode('delete'); }),
    meter: btn('🔍 Meter', () => setMode('meter')),
  };
  let probes = [], clip = null, placeRot = 0, lastPtr = null;        // multimeter: [red point, black point] in grid units
  const voltsBtn = btn('', () => { showVolts = !showVolts; store.set('sch.volts', showVolts ? '1' : '0'); syncTop(); draw(); });
  const dotsBtn = btn('', () => { showDots = !showDots; store.set('sch.dots', showDots ? '1' : '0'); syncTop(); draw(); });
  const toggleRun = () => { running = !running; store.set('sch.run', running ? '1' : '0'); syncTop(); commit(false); say(running ? 'Simulation running.' : 'Simulation stopped. Edit freely; tap ▶ Run to see the results.'); };
  const runBtn = btn('', toggleRun, 'run');
  const floatBtn = btn('🪟 Float', () => setFloat(!floating));
  const top = el('div', { class: 'sch-tools' },
    runBtn, modeBtns.select, modeBtns.wire, modeBtns.delete, modeBtns.meter,
    btn('↻', () => rotateSel(), 'icon'), btn('↶', () => undo(), 'icon'), btn('↷', () => redo(), 'icon'),
    btn('Fit', () => { fit(); draw(); }), voltsBtn, dotsBtn, floatBtn,
    btn('Projects', () => projects()), btn('📲 Share', () => share()), btn('Examples', () => examples()), btn('🟫 PCB', () => setView('pcb'), 'pcbbtn'));
  const tray = el('div', { class: 'sch-tray' });
  for (const t of S.PALETTE) {
    const cv = el('canvas', { width: 96, height: 56, class: 'ico' });
    const b = el('button', { class: 'tb', type: 'button', title: S.TYPES[t].label, onclick: () => { if (placeType !== t) placeRot = 0; placeType = t; setMode('place'); } }, cv, el('span', { text: shortName(t) }));
    b.dataset.type = t;
    tray.append(b);
    requestAnimationFrame(() => drawIcon(cv, t));
  }
  // mouse wheel scrolls the rows sideways (when they don't wrap)
  for (const row of [top, tray]) row.addEventListener('wheel', (e) => { if (row.scrollWidth > row.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  // mouse drag scrolls the rows too (a click without movement still works)
  for (const row of [top, tray]) {
    let dx0 = null, sl0 = 0, moved = false;
    row.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') return; dx0 = e.clientX; sl0 = row.scrollLeft; moved = false; });
    addEventListener('pointermove', (e) => { if (dx0 == null) return; const d = e.clientX - dx0; if (Math.abs(d) > 5) moved = true; if (moved) row.scrollLeft = sl0 - d; });
    addEventListener('pointerup', () => { dx0 = null; });
    row.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  }
  const canvas = el('canvas', { class: 'sch-canvas' });
  // view pad: move / zoom the drawing with buttons (no risk of dragging a part by accident). Hold to repeat.
  const padBtn = (txt, title, fn) => {
    const b = el('button', { class: 'vp-b', type: 'button', text: txt, title, 'aria-label': title });
    let t = 0; const stop = () => { clearInterval(t); t = 0; };
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(); draw(); stop(); t = setInterval(() => { fn(); draw(); }, 110); });
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
    return b;
  };
  const step = () => Math.max(40, H * 0.18);
  const viewPad = el('div', { class: 'view-pad' },
    padBtn('▲', 'Move the view up', () => { view.oy += step(); }), padBtn('▼', 'Move the view down', () => { view.oy -= step(); }),
    padBtn('◀', 'Move the view left', () => { view.ox += step(); }), padBtn('▶', 'Move the view right', () => { view.ox -= step(); }),
    padBtn('＋', 'Zoom in', () => zoomAt(1.18, W / 2, H / 2)), padBtn('－', 'Zoom out', () => zoomAt(1 / 1.18, W / 2, H / 2)));
  const wrap = el('div', { class: 'sch-wrap' }, canvas, viewPad);
  const status = el('div', { class: 'sch-status' });
  const panel = el('div', { class: 'sch-panel' });
  // floating settings: the part panel can float over the page (drag its bar) so you see the circuit while changing values
  let floating = store.get('sch.float', '0') === '1';
  const pTitle = el('b', { text: '⠿ Settings' });
  const pRun = btn('', toggleRun, 'run');
  // 📈 put the oscilloscope inside the floating window (under its title bar), so it stays in view beside the circuit
  let scopeFloat = store.get('sch.scopefloat', '0') === '1';
  const pScope = btn('📈', () => { scopeFloat = !scopeFloat; store.set('sch.scopefloat', scopeFloat ? '1' : '0'); placeScope(); say(scopeFloat ? 'Oscilloscope moved into the floating window (shows while a time simulation runs).' : 'Oscilloscope back under the circuit.'); });
  pScope.title = 'Oscilloscope in this window';
  const pMin = btn('–', () => { panel.hidden = !panel.hidden; pMin.textContent = panel.hidden ? '+' : '–'; panelBox.classList.toggle('mini', panel.hidden); keepIn(); }, 'icon');
  const pHead = el('div', { class: 'sch-phead', hidden: true }, pTitle, el('span', { class: 'sch-phbtn' }, pRun, pScope, btn('⟲ t = 0', () => { resetSim(); solve(); draw(); say('Time reset: clock back to 0, capacitors empty, coils without current, sketches restarted.'); }), pMin, btn('✕ Dock', () => setFloat(false))));
  const panelBox = el('div', { class: 'sch-pbox' }, pHead, panel);
  function keepIn() {
    if (!floating) return;
    const w = panelBox.offsetWidth, h = panelBox.offsetHeight;
    let x = parseFloat(panelBox.style.left) || 0, y = parseFloat(panelBox.style.top) || 0;
    x = Math.max(4, Math.min(innerWidth - w - 4, x)); y = Math.max(4, Math.min(innerHeight - Math.min(h, 60) - 4, y));
    panelBox.style.left = x + 'px'; panelBox.style.top = y + 'px';
  }
  function setFloat(v) {
    floating = v; store.set('sch.float', v ? '1' : '0');
    panelBox.classList.toggle('floating', v); pHead.hidden = !v; floatBtn.classList.toggle('on', v); placeScope();
    if (!v) { panel.hidden = false; pMin.textContent = '–'; panelBox.style.left = panelBox.style.top = panelBox.style.width = panelBox.style.height = ''; return; }
    // size: drag the bottom-right corner to resize; remembered
    const sz = (store.get('sch.floatsize', '') || '').split(',').map(Number);
    if (sz.length === 2 && sz.every(Number.isFinite)) { panelBox.style.width = Math.min(sz[0], innerWidth - 8) + 'px'; panelBox.style.height = Math.min(sz[1], innerHeight - 8) + 'px'; }
    else panelBox.style.height = Math.round(innerHeight * 0.45) + 'px';
    const pos = (store.get('sch.floatpos', '') || '').split(',').map(Number);
    if (pos.length === 2 && pos.every(Number.isFinite)) { panelBox.style.left = pos[0] + 'px'; panelBox.style.top = pos[1] + 'px'; }
    else { panelBox.style.left = (innerWidth - Math.min(340, innerWidth - 16) - 8) + 'px'; panelBox.style.top = Math.round(innerHeight * 0.5) + 'px'; }
    requestAnimationFrame(keepIn);
  }
  {
    let d0 = null;
    pHead.addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; d0 = { x: e.clientX, y: e.clientY, l: parseFloat(panelBox.style.left) || 0, t: parseFloat(panelBox.style.top) || 0 }; pHead.setPointerCapture(e.pointerId); e.preventDefault(); });
    pHead.addEventListener('pointermove', (e) => { if (!d0) return; panelBox.style.left = (d0.l + e.clientX - d0.x) + 'px'; panelBox.style.top = (d0.t + e.clientY - d0.y) + 'px'; keepIn(); });
    const up = () => { if (!d0) return; d0 = null; store.set('sch.floatpos', parseFloat(panelBox.style.left) + ',' + parseFloat(panelBox.style.top)); };
    pHead.addEventListener('pointerup', up); pHead.addEventListener('pointercancel', up);
    addEventListener('resize', keepIn);
    let szT = 0;
    if ('ResizeObserver' in globalThis) new ResizeObserver(() => { if (!floating || panel.hidden) return; clearTimeout(szT); szT = setTimeout(() => store.set('sch.floatsize', panelBox.offsetWidth + ',' + panelBox.offsetHeight), 300); }).observe(panelBox);
  }
  // oscilloscope + time controls (shown while a time simulation runs)
  const scv = el('canvas', { class: 'scope-cv' });
  const fmtT = (t) => si(t, 's', 3) + '/div', fmtV = (v) => si(v, 'V', 3) + '/div';
  const tSel = el('select', { class: 'sel sm', 'aria-label': 'Time per division' }, TDIVS.map(t => el('option', { value: t, text: fmtT(t) })));
  const v1Sel = el('select', { class: 'sel sm', 'aria-label': 'CH1 volts per division' }, el('option', { value: 'auto', text: 'CH1 auto' }), VDIVS.map(v => el('option', { value: v, text: 'CH1 ' + fmtV(v) })));
  const v2Sel = el('select', { class: 'sel sm', 'aria-label': 'CH2 volts per division' }, el('option', { value: 'auto', text: 'CH2 auto' }), VDIVS.map(v => el('option', { value: v, text: 'CH2 ' + fmtV(v) })));
  // speed: 'screen' = one scope screen every 2 s (good for fast signals), numbers = × real time
  const spSel = el('select', { class: 'sel sm', 'aria-label': 'Speed' }, [['screen', '📺 scope pace'], [1, 'real time 1×'], [2, '2×'], [10, '10× fast'], [60, '60× fast'], [0.5, '½× slow'], [0.1, '0.1× slow'], [0.01, '0.01× slow'], [0.001, '0.001× slow']].map(([v, t]) => el('option', { value: v, text: t })));
  tSel.value = String(sim.tdiv); if (tSel.value === '') { sim.tdiv = 0.005; tSel.value = '0.005'; }
  v1Sel.value = sim.v1; v2Sel.value = sim.v2; spSel.value = String(sim.speed);
  tSel.onchange = () => { sim.tdiv = +tSel.value; store.set('sch.tdiv', tSel.value); sim.buf = []; sim.next = null; };
  v1Sel.onchange = () => { sim.v1 = v1Sel.value; store.set('sch.v1', sim.v1); };
  v2Sel.onchange = () => { sim.v2 = v2Sel.value; store.set('sch.v2', sim.v2); };
  spSel.onchange = () => { sim.speed = spSel.value; store.set('sch.speed2', spSel.value); };
  const pauseBtn = el('button', { class: 'sb', type: 'button', text: '⏸ Pause', onclick: () => { sim.paused = !sim.paused; pauseBtn.textContent = sim.paused ? '▶ Resume' : '⏸ Pause'; } });
  const resetBtn = el('button', { class: 'sb', type: 'button', text: '⟲ t = 0', onclick: () => { resetSim(); solve(); draw(); say('Time reset: capacitors empty, coils without current.'); } });
  const autoBtn = el('button', { class: 'sb', type: 'button', text: 'Auto time', onclick: () => autoTime() });
  const tInfo = el('div', { class: 'scope-info' });
  // vertical position of each trace, in divisions (+ = up). Same speed + same amplitude? Move one up to see both.
  const posLbl = [el('span', { class: 'pos-v' }), el('span', { class: 'pos-v' })];
  const syncPos = () => { posLbl[0].textContent = (sim.p1 > 0 ? '+' : '') + sim.p1; posLbl[1].textContent = (sim.p2 > 0 ? '+' : '') + sim.p2; };
  const movePos = (k, d) => { const key = k ? 'p2' : 'p1'; sim[key] = d === 0 ? 0 : Math.max(-4, Math.min(4, Math.round((sim[key] + d) * 2) / 2)); store.set('sch.' + key, String(sim[key])); syncPos(); drawScope(); };
  const posCtl = (k, col) => el('span', { class: 'pos-ctl', style: `border-color:${col}` }, el('b', { text: `CH${k + 1}`, style: `color:${col}` }),
    btn('▲', () => movePos(k, 0.5), 'icon'), btn('▼', () => movePos(k, -0.5), 'icon'), posLbl[k], btn('0', () => movePos(k, 0), 'icon'));
  syncPos();
  const scopeBox = el('div', { class: 'scope-box' }, el('div', { class: 'scope-head' }, el('b', { text: '📈 Oscilloscope' }), tInfo),
    scv, el('div', { class: 'scope-ctl' }, pauseBtn, resetBtn, autoBtn, tSel, spSel, v1Sel, v2Sel), el('div', { class: 'scope-ctl' }, posCtl(0, '#FFE16B'), posCtl(1, '#4FC3F7')));
  scopeBox.hidden = true;
  // nudge arrows: move the selected part (wires follow), wire, or label one step
  let nudgeWhat = 'part';
  const whatSel = el('select', { class: 'sel sm', 'aria-label': 'What to move' }, el('option', { value: 'part', text: 'move part' }), el('option', { value: 'label', text: 'move label' }));
  whatSel.onchange = () => { nudgeWhat = whatSel.value; };
  const nudgeBar = el('div', { class: 'pcb-nudge', hidden: true }, el('span', { class: 'muted', text: 'Nudge' }),
    btn('◀', () => nudgeSch(-1, 0), 'icon'), btn('▲', () => nudgeSch(0, -1), 'icon'), btn('▼', () => nudgeSch(0, 1), 'icon'), btn('▶', () => nudgeSch(1, 0), 'icon'), whatSel, btn('⧉ Duplicate', () => duplicateSel()));
  const scopeHome = el('div', { class: 'scope-home' });
  root.append(el('div', { class: 'sch-sticky' }, top, tray), wrap, nudgeBar, status, scopeHome, panelBox);
  scopeHome.append(scopeBox);
  function placeScope() {
    const inF = scopeFloat && floating;
    if (inF && scopeBox.parentNode !== panelBox) panelBox.insertBefore(scopeBox, panel);
    if (!inF && scopeBox.parentNode !== scopeHome) scopeHome.append(scopeBox);
    scopeBox.classList.toggle('in-float', inF); pScope.classList.toggle('on', scopeFloat);
    panelBox.classList.toggle('has-scope', inF);
    if (inF && panelBox.offsetHeight && panelBox.offsetHeight < 520) {
      const nh = Math.min(600, innerHeight - 16); panelBox.style.height = nh + 'px';
      panelBox.style.top = Math.max(4, Math.min(parseFloat(panelBox.style.top) || 0, innerHeight - nh - 8)) + 'px';
    }
    requestAnimationFrame(() => { drawScope(); keepIn(); });
  }
  placeScope();
  setFloat(floating);
  // ---------- PCB view (same circuit, board layout + G-code) ----------
  let view2 = 'sch';
  const pcb = pcbView({ getC: () => c, commit: (push = true) => commit(push), undo: () => undo(), redo: () => redo(), say: (t) => say(t), shareFile: (n, t, m) => shareFile(n, t, m), toSchematic: () => setView('sch') });
  root.append(pcb.el);
  function setView(v) {
    view2 = v; store.set('sch.view', v);
    for (const e of [top, tray, wrap, status, panelBox]) e.hidden = v === 'pcb';
    if (v === 'pcb') nudgeBar.hidden = true; else syncNudgeSch();
    if (v === 'pcb') { scopeBox.hidden = true; pcb.show(); } else { pcb.hide(); resize(); commit(false); }
    scrollTo({ top: 0 });
  }
  function autoSpeed() { if (c.parts.some(p => S.isBoard(p.type) && p.props.run)) { sim.speed = '1'; spSel.value = '1'; store.set('sch.speed2', '1'); return; } if (c.speed) { sim.speed = String(c.speed); spSel.value = sim.speed; store.set('sch.speed2', sim.speed); return; } const slow = c.parts.some(p => ['SERVO', 'STEPPER', 'T555', 'RELAY'].includes(p.type)) && !c.parts.some(p => p.type === 'SIG'); sim.speed = slow ? '1' : 'screen'; spSel.value = sim.speed; store.set('sch.speed2', sim.speed); }
  function autoTimeQuiet() { if (c.tdiv) { sim.tdiv = TDIVS.find(t => t >= c.tdiv) ?? 60; tSel.value = String(sim.tdiv); sim.buf = []; return; } const g = c.parts.find(p => p.type === 'SIG'); if (g) { const want = 2.5 / g.props.f / 10; sim.tdiv = TDIVS.find(t => t >= want) ?? 1; tSel.value = String(sim.tdiv); sim.buf = []; } else if (c.parts.some(p => p.type === 'L')) { sim.tdiv = 0.005; tSel.value = '0.005'; sim.buf = []; } }
  function autoTime() {
    const g = c.parts.find(p => p.type === 'SIG');
    if (!g) { say('Auto time needs a signal generator. Pick a time/div by hand.'); return; }
    autoTimeQuiet(); store.set('sch.tdiv', tSel.value);
    say(`Time/div set to ${fmtT(sim.tdiv)} for the ${si(g.props.f, 'Hz')} signal.`);
  }
  let ctx = canvas.getContext('2d');
  let W = 0, H = 0;

  // ---------- helpers ----------
  function shortName(t) { return { LCD: 'LCD I2C', OLED: 'OLED I2C', ENC: 'Encoder', SR595: '74HC595', TL494: 'TL494 PWM', RMOD: 'Relay module', SEG7: '7-segment', DHT: 'DHT22', HCSR04: 'HC-SR04', LDR: 'LDR', PIR: 'PIR', KEYPAD: 'Keypad', BUZZER: 'Buzzer', LOCK: 'Door lock', XFMR: 'Transformer', R: 'Resistor', POT: 'Pot', BAT: 'Battery', LED: 'LED', D: 'Diode', SW: 'Switch', SPDT: 'SPDT', DPDT: 'DPDT', PB: 'Button', C: 'Capacitor', L: 'Inductor', SIG: 'Signal gen', SCOPE: 'Scope', OPTO: 'PC817', ZD: 'Zener', NPN: 'NPN', PNP: 'PNP', NMOS: 'N-MOSFET', PMOS: 'P-MOSFET', OPAMP: 'Op-amp', REG: 'Regulator', RELAY: 'Relay', T555: '555 timer', ESP32: 'ESP32', UNO: 'Arduino UNO', SERVO: 'Servo', STEPPER: 'Stepper', LAMP: 'Lamp', ISRC: 'I source', VM: 'Voltmeter', AM: 'Ammeter', GND: 'Ground' }[t]; }
  function load() { try { const j = JSON.parse(store.get('sch.cur', 'null')); return j && Array.isArray(j.parts) ? j : null; } catch { return null; } }
  const sx = (x) => view.ox + x * view.g, sy = (y) => view.oy + y * view.g;
  const wx = (px) => (px - view.ox) / view.g, wy = (py) => (py - view.oy) / view.g;
  const part = (id) => c.parts.find(p => p.id === id);
  const selPart = () => (sel?.kind === 'part' ? part(sel.id) : null);

  function setMode(m) {
    mode = m; wireStart = null;
    for (const [k, b] of Object.entries(modeBtns)) b.classList.toggle('on', k === m);
    syncNudgeSch();
    for (const b of tray.children) b.classList.toggle('on', m === 'place' && b.dataset.type === placeType);
    say({
      select: 'Tap a part to see its readings. Drag to move. Tap a switch to flip it, hold a button to press it.',
      wire: 'Tap a pin (yellow dot) or grid point to start, tap again to bend / finish. Ends automatically on a pin or wire.',
      delete: 'Tap a part or a wire to delete it.',
      meter: '🔍 Multimeter: tap a point for the RED probe, then a point for the BLACK probe. Reads red minus black. Tap again to move the red probe. Break parts with 🔧 Fault in their panel.',
      place: `Tap the grid to place a ${S.TYPES[placeType]?.label}. Keep tapping for more of the same; ↻ / R turns them; ↖ Select or Esc when done.`,
    }[m]);
    draw();
  }
  function say(t) { status.textContent = t; }
  function syncTop() { for (const b of [runBtn, pRun]) { b.textContent = running ? '■ Stop' : '▶ Run'; b.classList.toggle('on', running); } syncTop2(); }
  function syncTop2() { voltsBtn.textContent = showVolts ? 'Volts ●' : 'Volts ○'; voltsBtn.classList.toggle('on', showVolts); dotsBtn.textContent = showDots ? 'Flow ●' : 'Flow ○'; dotsBtn.classList.toggle('on', showDots); }

  function commit(push = true) {
    const lib = S.usedCustom(c); if (Object.keys(lib).length) c.lib = lib; else delete c.lib;
    solve();
    store.set('sch.cur', JSON.stringify(c));
    if (push) {
      const js = JSON.stringify(c);
      if (hist[hi] !== js) { hist.length = hi + 1; hist.push(js); if (hist.length > 80) hist.shift(); hi = hist.length - 1; }
    }
    renderPanel(); draw(); animate();
    if (view2 === 'pcb') pcb.refresh();
  }
  function undo() { if (hi <= 0) return say('Nothing to undo.'); hi--; c = JSON.parse(hist[hi]); sel = null; commit(false); say('Undone.'); }
  function redo() { if (hi >= hist.length - 1) return say('Nothing to redo.'); hi++; c = JSON.parse(hist[hi]); sel = null; commit(false); say('Redone.'); }

  // ---------- geometry ----------
  function partAt(x, y) {
    for (let k = c.parts.length - 1; k >= 0; k--) {
      const p = c.parts[k], [bx0, by0, bx1, by1] = S.TYPES[p.type].box;
      const [lx, ly] = S.rotPt([x - p.x, y - p.y], (4 - p.rot) & 3);
      if (lx >= bx0 - 0.3 && lx <= bx1 + 0.3 && ly >= by0 - 0.3 && ly <= by1 + 0.3) return p;
    }
    return null;
  }
  function wireAt(x, y, tol = 0.45) {
    let best = -1, bd = tol;
    c.wires.forEach((w, i) => {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (y - w.y1) * dy) / l2));
      const d = Math.hypot(x - (w.x1 + t * dx), y - (w.y1 + t * dy));
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  function snapPoint(x, y) {
    let best = null, bd = 0.7;
    for (const p of c.parts) for (const [px, py] of S.pinsOf(p)) { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = [px, py]; } }
    return best ?? [Math.round(x), Math.round(y)];
  }
  function isConnectPoint(x, y) {
    const k = S.key(x, y);
    for (const p of c.parts) for (const q of S.pinsOf(p)) if (S.key(...q) === k) return true;
    return c.wires.some(w => S.key(w.x1, w.y1) === k || S.key(w.x2, w.y2) === k || wireAt(x, y, 0.01) >= 0);
  }

  // ---------- drawing ----------
  function resize() {
    const dpr = devicePixelRatio || 1;
    wrap.style.height = Math.round(Math.max(300, Math.min(760, innerHeight * 0.64))) + 'px';
    const rr = wrap.getBoundingClientRect();
    const first = !W;
    W = Math.round(rr.width); H = Math.round(rr.height);
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (first) fit();
    draw();
  }

  function fit() {
    const xs = [], ys = [];
    for (const p of c.parts) { const [a, b, cc, d] = S.TYPES[p.type].box; for (const q of [[a, b], [cc, d], [a, d], [cc, b]]) { const [x, y] = S.rotPt(q, p.rot); xs.push(p.x + x); ys.push(p.y + y); } }
    for (const w of c.wires) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); }
    if (!xs.length || !W) { view.g = 22; view.ox = W / 2; view.oy = H / 2; return; }
    const x0 = Math.min(...xs) - 7, x1 = Math.max(...xs) + 5, y0 = Math.min(...ys) - 2, y1 = Math.max(...ys) + 3;
    view.g = Math.max(8, Math.min(48, Math.min(W / (x1 - x0), H / (y1 - y0))));
    view.ox = W / 2 - (x0 + x1) / 2 * view.g; view.oy = H / 2 - (y0 + y1) / 2 * view.g;
  }

  function vColor(v, alpha = 1) {
    if (!showVolts || !res?.ok || v == null) return C.wire;
    let mx = 0; for (const w of res.wires) mx = Math.max(mx, Math.abs(w.va), Math.abs(w.vb));
    const t = mx > 1e-9 ? Math.max(-1, Math.min(1, v / mx)) : 0;
    const [r, g, b] = t >= 0 ? C.pos : C.neg, a = Math.abs(t);
    const mix = (x, y) => Math.round(x * a + y * (1 - a));
    return `rgba(${mix(r, C.gnd[0])},${mix(g, C.gnd[1])},${mix(b, C.gnd[2])},${alpha})`;
  }

  let tAnim = 0;
  const labelBoxes = [];
  function draw() {
    if (!W) return;
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // grid dots
    if (view.g >= 9) {
      ctx.fillStyle = C.dot;
      const gx0 = Math.floor(wx(0)), gx1 = Math.ceil(wx(W)), gy0 = Math.floor(wy(0)), gy1 = Math.ceil(wy(H));
      const step = view.g < 14 ? 2 : 1;
      for (let x = gx0; x <= gx1; x++) { if (x % step) continue; for (let y = gy0; y <= gy1; y++) { if (y % step) continue; ctx.fillRect(sx(x) - 1, sy(y) - 1, 2, 2); } }
    }
    // wires
    const pieces = res?.ok ? res.wires : S.wirePieces(c).map(w => ({ ...w, va: null, vb: null, i: 0 }));
    ctx.lineCap = 'round';
    for (const w of pieces) {
      ctx.strokeStyle = vColor(w.va != null ? (w.va + w.vb) / 2 : null);
      const isSel = sel?.kind === 'wire' && sel.i === w.wi;
      ctx.lineWidth = isSel ? 4.5 : 2.6;
      if (isSel) ctx.strokeStyle = C.sel;
      ctx.beginPath(); ctx.moveTo(sx(w.x1), sy(w.y1)); ctx.lineTo(sx(w.x2), sy(w.y2)); ctx.stroke();
    }
    // buzzers: play a beep while any buzzer has voltage
    buzz(res?.ok && c.parts.some(p => p.type === 'BUZZER' && Math.abs(res.parts.get(p.id)?.v ?? 0) > 1.5));
    // parts (LCDs first get the text their sketch wrote)
    if (c.parts.some(p => p.type === 'LCD' || p.type === 'OLED')) updateLcds();
    for (const p of c.parts) drawPart(p);
    // junction dots
    ctx.fillStyle = C.part;
    for (const [x, y] of S.junctions(c)) { ctx.beginPath(); ctx.arc(sx(x), sy(y), 3.6, 0, 7); ctx.fill(); }
    // current dots
    if (showDots && res?.ok) drawDots(pieces);
    // labels
    labelBoxes.length = 0;
    for (const p of c.parts) drawLabel(p);
    // pins in wire / place mode
    if (mode === 'wire') {
      ctx.fillStyle = C.pin;
      for (const p of c.parts) for (const [x, y] of S.pinsOf(p)) { ctx.beginPath(); ctx.arc(sx(x), sy(y), 4, 0, 7); ctx.fill(); }
      if (wireStart && hover) {
        const [x0, y0] = wireStart, [x1, y1] = snapPoint(...hover);
        ctx.strokeStyle = C.sel; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx(x0), sy(y0)); ctx.lineTo(sx(x1), sy(y0)); ctx.lineTo(sx(x1), sy(y1)); ctx.stroke(); ctx.setLineDash([]);
      }
      if (wireStart) { ctx.strokeStyle = C.sel; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(wireStart[0]), sy(wireStart[1]), 7, 0, 7); ctx.stroke(); }
    }
    drawTip();
    drawProbes();
    if (mode === 'place' && hover) {
      const ghost = { id: -1, type: placeType, x: Math.round(hover[0]), y: Math.round(hover[1]), rot: placeRot, props: S.TYPES[placeType].props, name: '' };
      ctx.globalAlpha = 0.45; drawPart(ghost); ctx.globalAlpha = 1;
    }
  }

  // 🔊 one tiny oscillator for all buzzers (quiet, 2.5 kHz). Browsers allow sound after the first tap.
  let actx = null, osc = null;
  function buzz(on) {
    on = on && store.get('sch.sound', '1') === '1' && view2 !== 'pcb' && !root.hidden;
    try {
      if (on && !osc) { actx ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)(); osc = actx.createOscillator(); const gn = actx.createGain(); gn.gain.value = 0.04; osc.type = 'square'; osc.frequency.value = 2500; osc.connect(gn).connect(actx.destination); osc.start(); }
      else if (!on && osc) { osc.stop(); osc.disconnect(); osc = null; }
    } catch { osc = null; }
  }
  // multimeter probes + the meter reading
  function drawProbes() {
    if (mode !== 'meter' || !probes.length) return;
    const cols = ['#FF4D4D', '#E8EEF4'];
    probes.forEach(([x, y], k) => {
      const X = sx(x), Y = sy(y);
      ctx.strokeStyle = cols[k]; ctx.fillStyle = cols[k]; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + 14, Y - 26); ctx.stroke();
      ctx.beginPath(); ctx.arc(X, Y, 4.5, 0, 7); ctx.fill();
      ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = cols[k]; ctx.fillRect(X + 8, Y - 38, 14, 14); ctx.fillStyle = '#111'; ctx.fillText(k ? '−' : '+', X + 15, Y - 31);
    });
    if (!res?.ok) return;
    const va = res.vAt(...probes[0]), vb = probes[1] ? res.vAt(...probes[1]) : 0;
    const dv = va == null || vb == null ? null : va - vb, txt = dv == null ? '— —' : Math.abs(dv) < 5e-4 ? '0.000 V' : si(dv, 'V', 4);   // a real DMM shows 0.000 for µV
    const sub = probes[1] ? 'DC V  (red − black)' : 'DC V  (red to ground)';
    ctx.save(); ctx.font = '800 22px ui-monospace, monospace';
    const w = Math.max(150, ctx.measureText(txt).width + 30), h = 58, bx = W - w - 8, by = 8;
    ctx.globalAlpha = 0.95; ctx.fillStyle = '#1E2A1E'; ctx.strokeStyle = '#FFB020'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, w, h, 8) : ctx.rect(bx, by, w, h); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.fillStyle = '#B6F09C'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(txt, bx + w - 12, by + 24);
    ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#8B97A6'; ctx.textAlign = 'left'; ctx.fillText(sub, bx + 10, by + 48);
    ctx.restore();
  }

  // tip bubble: live readings next to the selected wire or part, so you don't have to scroll down to the panel
  function drawTip() {
    if (mode !== 'select' || !sel || !tipVals.length || !res?.ok || down?.drag) return;
    let ax, ay;
    if (sel.kind === 'wire') { const w = c.wires[sel.i]; if (!w) return; ax = sx((w.x1 + w.x2) / 2); ay = sy((w.y1 + w.y2) / 2); }
    else { const p = selPart(); if (!p || ['GND', 'KEYPAD', 'ENC', 'LCD', 'OLED', 'ESP32', 'UNO'].includes(p.type)) return; ax = sx(p.x); ay = sy(p.y); }
    ctx.save(); ctx.font = '600 12px system-ui, sans-serif';
    const rows = tipVals.map(([l, v]) => [l + ':', v]);
    const lw = Math.max(...rows.map(r => ctx.measureText(r[0]).width)), vw = Math.max(...rows.map(r => ctx.measureText(r[1]).width));
    const pad = 7, lh = 16, bw = lw + vw + pad * 3, bh = rows.length * lh + pad * 1.4;
    const gap = (sel.kind === 'wire' ? 0.8 : 2.6) * view.g;
    let bx = ax - bw / 2, by = ay - bh - gap;
    if (by < 4) by = ay + gap;
    bx = Math.max(4, Math.min(W - bw - 4, bx)); by = Math.max(4, Math.min(H - bh - 4, by));
    ctx.globalAlpha = 0.93; ctx.fillStyle = '#0B0F13'; ctx.strokeStyle = C.sel; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw, bh, 7) : ctx.rect(bx, by, bw, bh); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.textBaseline = 'middle';
    rows.forEach(([l, v], k) => { const y = by + pad * 0.7 + lh * (k + 0.5); ctx.fillStyle = '#8B97A6'; ctx.textAlign = 'left'; ctx.fillText(l, bx + pad, y); ctx.fillStyle = '#FFE16B'; ctx.textAlign = 'right'; ctx.fillText(v, bx + bw - pad, y); });
    ctx.restore();
  }

  function drawDots(pieces) {
    const t = tAnim / 1000;
    const dotsOn = (x1, y1, x2, y2, i) => {
      if (Math.abs(i) < 1e-7) return;
      const len = Math.hypot(x2 - x1, y2 - y1) * view.g; if (len < 1) return;
      const speed = Math.min(140, 18 * Math.max(0.6, Math.log10(Math.abs(i) / 1e-7)));
      const sp = 16, off = ((t * speed) % sp + sp) % sp;
      const dir = i > 0 ? 1 : -1;
      ctx.fillStyle = C.cur;
      for (let d = off; d < len; d += sp) {
        const f = dir > 0 ? d / len : 1 - d / len;
        ctx.beginPath(); ctx.arc(sx(x1 + (x2 - x1) * f), sy(y1 + (y2 - y1) * f), 2.2, 0, 7); ctx.fill();
      }
    };
    for (const w of pieces) dotsOn(w.x1, w.y1, w.x2, w.y2, w.i);
    for (const p of c.parts) {
      const r = res.parts.get(p.id); if (!r || p.type === 'GND' || p.type === 'POT' || p.type === 'SPDT' || p.type === 'DPDT' || p.type === 'SCOPE') continue;
      const pins = S.pinsOf(p);
      if (r.dots) { for (const [a, b, i] of r.dots) dotsOn(pins[a][0], pins[a][1], pins[b][0], pins[b][1], i); continue; }
      dotsOn(pins[0][0], pins[0][1], pins[1][0], pins[1][1], r.i);
    }
  }

  function drawPart(p) {
    const r = res?.ok ? res.parts.get(p.id) : null;
    const isSel = sel?.kind === 'part' && sel.id === p.id;
    ctx.save();
    ctx.translate(sx(p.x), sy(p.y)); ctx.rotate(p.rot * Math.PI / 2); ctx.scale(view.g, view.g);
    ctx.lineWidth = 2.2 / view.g; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (isSel) {
      const [a, b, cc, d] = S.TYPES[p.type].box;
      ctx.fillStyle = 'rgba(79,195,247,0.12)'; ctx.strokeStyle = C.sel; ctx.setLineDash([4 / view.g, 3 / view.g]);
      ctx.fillRect(a - 0.25, b - 0.25, cc - a + 0.5, d - b + 0.5); ctx.strokeRect(a - 0.25, b - 0.25, cc - a + 0.5, d - b + 0.5); ctx.setLineDash([]);
    }
    symbol(ctx, p, r, view.g);
    const fl = S.faultOf(p);
    if (fl) {
      const [a, b, cc] = S.TYPES[p.type].box;
      ctx.save(); ctx.translate((a + cc) / 2, b - 0.2); ctx.rotate(-p.rot * Math.PI / 2);
      ctx.fillStyle = fl === 'weak' ? '#FFB020' : '#FF4D4D'; ctx.beginPath(); ctx.arc(0, 0, 0.55, 0, 7); ctx.fill();
      ctx.fillStyle = '#111'; ctx.font = `800 ${0.75}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(fl === 'open' ? 'O' : fl === 'short' ? 'S' : 'W', 0, 0.04); ctx.restore();
    }
    if (S.isBoard(p.type) && isSel) {
      const k = S.BOARDS[p.type].pins.findIndex(x => x.n === boardPin(p)), pt = S.TYPES[p.type].pins[k];
      if (pt) { ctx.strokeStyle = C.sel; ctx.lineWidth = 2.5 / view.g; ctx.beginPath(); ctx.arc(pt[0], pt[1], 0.55, 0, 7); ctx.stroke(); }
    }
    ctx.restore();
  }

  function drawLabel(p) {
    if (p.type === 'GND') return;
    const r = res?.ok ? res.parts.get(p.id) : null;
    let [nx, ny] = S.rotPt([0, 1], p.rot);
    const vert = p.rot & 1;
    if (vert) { nx = 1; ny = 0; }          // vertical parts: label always on the right (never cut off at the left edge)
    const dist = Math.max(1.6, S.TYPES[p.type].box[3] + 0.9);
    // parts with a pin in the middle of the bottom edge: put the label beside that wire, not on it
    const side = !vert && { REG: 0.6, OPAMP: 0.6, SCOPE: 0.6, RELAY: 2.6 }[p.type];
    const off = p.lbl ?? [0, 0];         // label dragged by hand (grid units)
    const inside = p.type === 'TL494' && S.rotPt([0, -2.6], p.rot);       // big chip: name inside the body (its edges are full of pins)
    const x = inside ? sx(p.x + inside[0] + off[0]) : sx(p.x + nx * dist + (side ? (p.rot ? -side : side) : 0) + off[0]), y = inside ? sy(p.y + inside[1] + off[1]) : sy(p.y + ny * dist + off[1]);
    ctx.font = `600 ${Math.max(10, Math.min(13, view.g * 0.55))}px system-ui, sans-serif`;
    const align = inside ? 'center' : vert ? (nx < 0 ? 'right' : 'left') : side ? (p.rot ? 'right' : 'left') : 'center';
    ctx.textAlign = align; ctx.textBaseline = 'middle';
    const val = valueText(p);
    ctx.fillStyle = C.text;
    const lines = [p.name + (val ? '  ' + val : '')];
    if (r && (p.type === 'VM' || p.type === 'AM')) lines.push(p.type === 'VM' ? si(r.v, 'V') : si(r.i, 'A'));
    // hit box (screen px) so the label can be dragged
    const tw = Math.max(...lines.map(t => ctx.measureText(t).width)) + 6;
    const bx0 = align === 'left' ? x - 3 : align === 'right' ? x - tw + 3 : x - tw / 2;
    const by0 = y - (vert && lines.length > 1 ? 17 : 9), by1 = y + (lines.length > 1 ? (vert ? 17 : 23) : 9);
    labelBoxes.push({ p, x0: bx0, y0: by0, x1: bx0 + tw, y1: by1 });
    if ((sel?.kind === 'part' && sel.id === p.id) || down?.lab?.p === p) { ctx.save(); ctx.strokeStyle = 'rgba(79,195,247,0.45)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.strokeRect(bx0, by0, tw, by1 - by0); ctx.restore(); ctx.fillStyle = C.text; }
    if (vert) { ctx.fillText(lines[0], x, y - (lines.length > 1 ? 8 : 0)); if (lines[1]) { ctx.fillStyle = C.cur; ctx.fillText(lines[1], x, y + 9); } }
    else { ctx.fillText(lines[0], x, y); if (lines[1]) { ctx.fillStyle = C.cur; ctx.font = '700 13px ui-monospace, monospace'; ctx.fillText(lines[1], x, y + 15); } }
  }

  function capTxt(v) { return v >= 1e-6 && v < 1 ? plain(v * 1e6, 3) + ' µF' : si(v, 'F', 3); }
  function valueText(p) {
    const q = p.props;
    switch (p.type) {
      case 'R': return si(q.r, 'Ω', 3);
      case 'POT': return `${si(q.r, 'Ω', 3)} @${Math.round(q.pos)}%`;
      case 'BAT': return si(q.v, 'V', 3);
      case 'ISRC': return si(q.i, 'A', 3);
      case 'LED': return q.color;
      case 'D': return q.model;
      case 'LAMP': return `${si(q.vr, 'V', 3)} ${si(q.wr, 'W', 3)}`;
      case 'XFMR': return `${plain(q.n1)}+${plain(q.n2)} : ${plain(q.ns)} turns`;
      case 'SW': return q.on ? 'ON' : 'OFF';
      case 'SPDT': case 'DPDT': return q.on ? '▼ down' : '▲ up';
      case 'PB': return q.on ? 'pressed' : '';
      case 'C': return capTxt(q.c);
      case 'L': return si(q.l, 'H', 3);
      case 'SIG': return `${q.wave} ${si(q.f, 'Hz', 3)} ${si(q.amp, 'V', 3)}`;
      case 'OPTO': return 'PC817';
      case 'ZD': return S.ZENER_PARTS[q.model] ? `${q.model} ${si(S.ZENER_PARTS[q.model].vz, 'V', 3)}` : si(q.vz, 'V', 3);
      case 'NPN': case 'PNP': case 'NMOS': case 'PMOS': case 'OPAMP': return q.model;
      case 'RELAY': return S.getCustom('RELAY', q.relay) ? q.relay : `${q.vcoil} V coil`;
      case 'T555': return q.model;
      case 'ESP32': case 'UNO': return '';
      case 'DHT': return `${q.model} ${plain(q.temp)} °C ${plain(q.hum)} %`;
      case 'KEYPAD': return '4×4';
      case 'BUZZER': return '';
      case 'LOCK': return `${plain(q.v)} V`;
      case 'HCSR04': return `${plain(q.cm)} cm`;
      case 'LDR': return `${si(q.lux, 'lux', 2)}`;
      case 'PIR': return q.motion ? 'MOTION' : 'quiet';
      case 'LCD': return '0x' + (q.addr ?? 0x27).toString(16).toUpperCase();
      case 'OLED': return '0x' + (q.addr ?? 0x3C).toString(16).toUpperCase();
      case 'ENC': return 'click ' + (ENCS.get(p.id)?.pos ?? 0);
      case 'SR595': return q.model ?? '74HC595';
      case 'TL494': return q.model ?? 'TL494C';
      case 'RMOD': return q.trig === 'high' ? 'HIGH trig.' : '';
      case 'SEG7': return q.common === 'anode' ? 'common anode' : 'common cathode';
      case 'SERVO': return q.model;
      case 'STEPPER': return q.micro > 1 ? `1/${q.micro} step` : 'full step';
    }
    return '';
  }

  // ---------- animation ----------
  let raf = 0;
  let lastFrame = null;
  function animate() {
    if (raf) return;
    const loop = (t) => {
      raf = requestAnimationFrame(loop);
      tAnim = t;
      if (!root.isConnected || root.hidden || !W) return;
      const tm = timeMode();
      const tm2 = tm && view2 !== 'pcb'; if (scopeBox.hidden === tm2) scopeBox.hidden = !tm2;
      if (tm) {
        const fdt = Math.min(0.05, Math.max(0, (t - (lastFrame ?? t)) / 1000)); lastFrame = t;
        if (!sim.paused && !down?.drag) sim.lag = stepSim(sim.speed === 'screen' ? sim.tdiv * 10 / 120 : (+sim.speed) * (fdt || 1 / 60));
        draw(); drawScope();
        if (t - lastPanel > 250) { lastPanel = t; panelRefresh?.(); }
      } else if (showDots && res?.ok) draw();
    };
    raf = requestAnimationFrame(loop);
  }

  // ---------- oscilloscope screen ----------
  function drawScope() {
    const dpr = devicePixelRatio || 1, r = scv.getBoundingClientRect(), w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return;
    if (scv.width !== w * dpr || scv.height !== h * dpr) { scv.width = w * dpr; scv.height = h * dpr; }
    const x = scv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.fillStyle = '#07120C'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(80,140,100,0.25)'; x.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { const px = Math.round(i * w / 10) + 0.5; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); }
    for (let i = 0; i <= 8; i++) { const py = Math.round(i * h / 8) + 0.5; x.beginPath(); x.moveTo(0, py); x.lineTo(w, py); x.stroke(); }
    x.strokeStyle = 'rgba(120,200,140,0.45)'; x.beginPath(); x.moveTo(0, h / 2 + 0.5); x.lineTo(w, h / 2 + 0.5); x.stroke();
    const scope = c.parts.find(p => p.type === 'SCOPE');
    tInfo.textContent = `t = ${si(sim.t, 's', 4)}  ·  ${fmtT(sim.tdiv)}${sim.paused ? '  ·  paused' : ''}${sim.lag && !sim.paused ? '  ·  ⚠ slower than real time (circuit too fast)' : ''}`;
    if (!scope) { x.fillStyle = '#9AD7A8'; x.font = '13px system-ui, sans-serif'; x.textAlign = 'center'; x.fillText('Add a Scope part and wire CH1 / CH2 to see waveforms', w / 2, h / 2 - 10); return; }
    const b = sim.buf; if (b.length < 2) return;
    // trigger: last rising crossing of CH1 through its middle level that still has a full screen after it
    let start = Math.max(0, b.length - SAMPLES);
    let lo = Infinity, hi = -Infinity; for (let i = start; i < b.length; i++) { lo = Math.min(lo, b[i][1]); hi = Math.max(hi, b[i][1]); }
    const mid = (lo + hi) / 2;
    if (hi - lo > 1e-6) for (let i = b.length - SAMPLES - 1; i > 0; i--) { if (b[i - 1][1] < mid && b[i][1] >= mid) { start = i; break; } }
    const seg = b.slice(start, start + SAMPLES);
    const scale = (sel, k) => {
      if (sel !== 'auto') return +sel;
      let m = 0; for (const s of seg) if (isFinite(s[k])) m = Math.max(m, Math.abs(s[k]));
      return VDIVS.find(v => v * 3.8 >= m) ?? VDIVS[VDIVS.length - 1];
    };
    const d1 = scale(sim.v1, 1), d2 = scale(sim.v2, 2);
    const pinsSc = S.pinsOf(scope), wired = (k) => { const kk = S.key(...pinsSc[k]); return c.wires.some(w => S.key(w.x1, w.y1) === kk || S.key(w.x2, w.y2) === kk) || c.parts.some(q => q !== scope && S.pinsOf(q).some(pp => S.key(...pp) === kk)); };
    const on1 = wired(0), on2 = wired(1);
    const clampY = (py) => Math.max(-5, Math.min(h + 5, py));
    const plot = (k, vdiv, col) => {
      const off = k === 1 ? sim.p1 : sim.p2, y0 = h / 2 - off * (h / 8);
      x.fillStyle = col; x.beginPath(); x.moveTo(0, y0 - 5); x.lineTo(7, y0); x.lineTo(0, y0 + 5); x.fill();     // ◀ 0 V marker of this channel
      x.strokeStyle = col; x.lineWidth = 2; x.beginPath();
      seg.forEach((s, i) => { const px = i / (SAMPLES - 1) * w, py = clampY(y0 - s[k] / vdiv * (h / 8)); i ? x.lineTo(px, py) : x.moveTo(px, py); });
      x.stroke();
    };
    if (on2) plot(2, d2, '#4FC3F7'); if (on1) plot(1, d1, '#FFE16B');
    const meas = (k) => {
      let mn = Infinity, mx = -Infinity, sum = 0, sq = 0;
      for (const s of seg) { mn = Math.min(mn, s[k]); mx = Math.max(mx, s[k]); sum += s[k]; sq += s[k] * s[k]; }
      const lvl = (mn + mx) / 2, cross = [];
      seg.forEach((s, i) => { if (i && seg[i - 1][k] < lvl && s[k] >= lvl) cross.push(s[0]); });
      const f = cross.length >= 2 && mx - mn > 1e-6 ? (cross.length - 1) / (cross[cross.length - 1] - cross[0]) : null;
      return `${si(mx - mn, 'V', 3)}pp · avg ${si(sum / seg.length, 'V', 3)}${w > 520 ? ' · rms ' + si(Math.sqrt(sq / seg.length), 'V', 3) : ''}${f ? ' · ' + si(f, 'Hz', 3) : ''}`;
    };
    x.font = `600 ${w < 420 ? 10 : 11}px ui-monospace, monospace`; x.textAlign = 'left';
    x.fillStyle = '#FFE16B'; x.fillText(on1 ? `CH1 ${fmtV(d1)} ${meas(1)}` : 'CH1 not connected', 6, 14);
    x.fillStyle = '#4FC3F7'; x.fillText(on2 ? `CH2 ${fmtV(d2)} ${meas(2)}` : 'CH2 not connected', 6, h - 7);
  }

  // ---------- input ----------
  const ptrs = new Map();
  let down = null, pinch = 0;
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;            // right button: handled by 'contextmenu'
    canvas.setPointerCapture?.(e.pointerId);
    const [px, py] = pos(e); ptrs.set(e.pointerId, [px, py]);
    if (ptrs.size === 2) { const v = [...ptrs.values()]; pinch = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); down = { pinch: true, last: mid() }; return; }
    const x = wx(px), y = wy(py);
    down = { px, py, x, y, moved: false, last: [px, py], drag: null, pan: false };
    if (mode === 'select') {
      const lb = [...labelBoxes].reverse().find(b => px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1);
      const p = partAt(x, y);
      const wEnd = !p && !lb ? wireEndAt(x, y) : null;
      const wi = !p && !lb && !wEnd ? wireAt(x, y) : -1;
      if (lb) down.lab = { p: lb.p, ox: lb.p.lbl?.[0] ?? 0, oy: lb.p.lbl?.[1] ?? 0, ax: x, ay: y };
      else if (p) {
        down.drag = { p, ox: p.x, oy: p.y, ax: x, ay: y, ends: attachedEnds(p) };
        if (p.type === 'PB') { p.props.on = true; down.pb = p; commit(false); }
      } else if (wEnd) down.wend = { k: wEnd, orig: structuredClone(c.wires) };
      else if (wi >= 0) down.wdrag = { i: wi, orig: structuredClone(c.wires), ax: x, ay: y };
      else down.pan = true;
    } else down.pan = true;
  });
  canvas.addEventListener('pointermove', (e) => {
    const [px, py] = pos(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [px, py]);
    lastPtr = [wx(px), wy(py)];
    if (!down) { if (mode === 'wire' || mode === 'place') { hover = [wx(px), wy(py)]; draw(); } return; }
    if (down.pinch && ptrs.size >= 2) {
      const v = [...ptrs.values()], d = Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]), [mx, my] = mid();
      view.ox += mx - down.last[0]; view.oy += my - down.last[1];
      if (pinch > 0) zoomAt(d / pinch, mx, my);
      pinch = d; down.last = [mx, my]; draw(); return;
    }
    if (!down.moved && Math.hypot(px - down.px, py - down.py) > 6) down.moved = true;
    if (!down.moved) return;
    hover = [wx(px), wy(py)];
    if (down.lab) {
      const d = down.lab, q = (v) => Math.round(v * 4) / 4;
      d.p.lbl = [q(d.ox + wx(px) - d.ax), q(d.oy + wy(py) - d.ay)]; draw();
    } else if (down.wdrag) {
      const d = down.wdrag, dx = Math.round(wx(px) - d.ax), dy = Math.round(wy(py) - d.ay);
      if (dx !== d.dx || dy !== d.dy) { d.dx = dx; d.dy = dy; c.wires = moveWire(d.orig, d.i, dx, dy); sel = { kind: 'wire', i: d.i }; solve(); draw(); }
    } else if (down.wend) {
      const d = down.wend, [ox, oy] = d.k, nx = Math.round(wx(px)), ny = Math.round(wy(py));
      if (nx !== d.nx || ny !== d.ny) {
        d.nx = nx; d.ny = ny;
        c.wires = d.orig.map(w => { const o = { ...w }; for (const e of [1, 2]) if (o['x' + e] === ox && o['y' + e] === oy) { o['x' + e] = nx; o['y' + e] = ny; } return o; }).filter(w => w.x1 !== w.x2 || w.y1 !== w.y2);
        solve(); draw();
      }
    } else if (down.drag) {
      const d = down.drag, nx = Math.round(d.ox + wx(px) - d.ax), ny = Math.round(d.oy + wy(py) - d.ay);
      if (nx !== d.p.x || ny !== d.p.y) { d.p.x = nx; d.p.y = ny; followPins(d); solve(); renderPanel(); draw(); }
    } else if (down.pan) { view.ox += px - down.last[0]; view.oy += py - down.last[1]; down.last = [px, py]; draw(); }
  });
  const up = (e) => {
    ptrs.delete(e.pointerId);
    if (!down) return;
    if (down.pinch) { if (ptrs.size === 0) down = null; return; }
    const d = down; down = null;
    if (d.pb) { d.pb.props.on = false; commit(false); }
    if (d.drag && d.moved) { commit(); return; }
    if (d.lab && d.moved) { sel = { kind: 'part', id: d.lab.p.id }; commit(); say('Label moved. Reset it from the part panel.'); return; }
    if ((d.wdrag || d.wend) && d.moved) { if (d.wend) sel = null; commit(); say(d.wend ? 'Wire corner moved.' : 'Wire moved: connected wires stretch along.'); return; }
    if (!d.moved) { if (d.lab) { sel = { kind: 'part', id: d.lab.p.id }; renderPanel(); draw(); return; } tap(d.x, d.y, d); }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); if (down?.pb) { down.pb.props.on = false; commit(false); } down = null; });
  canvas.addEventListener('pointerleave', () => { if (!down && hover) { hover = null; draw(); } });
  // right-click: stop placing / stop a wire / let go of the selection (like most CAD programs)
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (mode === 'place') { setMode('select'); hover = null; say('Done placing. Tap a part in the tray to place more.'); }
    else if (mode === 'wire' && wireStart) { wireStart = null; draw(); say('Wire cancelled. Tap a pin to start a new one, or right-click again to leave Wire mode.'); }
    else if (mode !== 'select') setMode('select');
    else if (sel) { sel = null; renderPanel(); draw(); say('Nothing selected.'); }
  });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); const [px, py] = pos(e); zoomAt(Math.exp(-e.deltaY * 0.0015), px, py); draw(); }, { passive: false });
  function pos(e) { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function mid() { const v = [...ptrs.values()]; return [(v[0][0] + v[1][0]) / 2, (v[0][1] + v[1][1]) / 2]; }
  function zoomAt(k, fx, fy) { const ng = Math.max(6, Math.min(80, view.g * k)), kk = ng / view.g; view.ox = fx - (fx - view.ox) * kk; view.oy = fy - (fy - view.oy) * kk; view.g = ng; }

  // ---------- nudge (arrows) ----------
  function syncNudgeSch() {
    if (typeof nudgeBar === 'undefined') return;
    const on = view2 !== 'pcb' && mode === 'select' && (sel?.kind === 'wire' ? !!c.wires[sel.i] : !!selPart());
    nudgeBar.hidden = !on;
    whatSel.hidden = sel?.kind !== 'part';
    if (sel?.kind !== 'part') { nudgeWhat = 'part'; whatSel.value = 'part'; }
  }
  function nudgeSch(dx, dy) {
    if (sel?.kind === 'wire' && c.wires[sel.i]) {
      const w = c.wires[sel.i], horiz = w.y1 === w.y2, vert = w.x1 === w.x2;
      if ((horiz && !dy) || (vert && !dx)) return say('A straight wire slides sideways only: use ▲ ▼ for a flat wire, ◀ ▶ for a standing one.');
      const keep = { ...w, x1: w.x1 + dx, x2: w.x2 + dx, y1: w.y1 + dy, y2: w.y2 + dy };
      c.wires = moveWire(c.wires, sel.i, dx, dy);
      const ni = c.wires.findIndex(q => S.key(q.x1, q.y1) === S.key(keep.x1, keep.y1) && S.key(q.x2, q.y2) === S.key(keep.x2, keep.y2));
      sel = ni >= 0 ? { kind: 'wire', i: ni } : null;
      commit(); return;
    }
    const p = selPart(); if (!p) return;
    if (nudgeWhat === 'label') { const o = p.lbl ?? [0, 0]; p.lbl = [o[0] + dx * 0.5, o[1] + dy * 0.5]; commit(); return; }
    // wires on the pins: stretch them if they stay straight, otherwise add a short straight piece (no crooked wires)
    const old = S.pinsOf(p);
    const ends = attachedEnds(p);
    p.x += dx; p.y += dy;
    const now = S.pinsOf(p), add = [];
    for (const [i, end, k] of ends) {
      const w = c.wires[i]; if (!w) continue;
      const straight = (w.x1 === w.x2 && dx === 0) || (w.y1 === w.y2 && dy === 0);
      if (straight) { w['x' + end] = now[k][0]; w['y' + end] = now[k][1]; }
      else add.push({ x1: old[k][0], y1: old[k][1], x2: now[k][0], y2: now[k][1] });
    }
    c.wires.push(...add);
    c.wires = c.wires.filter(w => w.x1 !== w.x2 || w.y1 !== w.y2);
    commit();
  }
  // microcontroller boards: which pin the panel shows
  const boardPinSel = new Map();
  function boardPin(p) { const B = S.BOARDS[p.type]; const n = boardPinSel.get(p.id); return B.pins.some(x => x.n === n) ? n : (Object.keys(p.props.pins ?? {})[0] ?? B.pins.find(x => x.k === 'gpio').n); }
  const MODE_SHORT = { in: 'input', pu: 'pull-up', pd: 'pull-down', adc: 'ADC', high: 'HIGH', low: 'LOW', pwm: 'PWM', dac: 'DAC', pwr: 'power', en: 'reset', nc: '—' };
  // free wire corner / end (not on a part pin) close to the finger
  function wireEndAt(x, y) {
    const pinK = new Set(c.parts.flatMap(p => S.pinsOf(p).map(q => S.key(...q))));
    let best = null, bd = Math.max(0.35, 9 / view.g);
    for (const w of c.wires) for (const e of [1, 2]) {
      const ex = w['x' + e], ey = w['y' + e], d = Math.hypot(ex - x, ey - y);
      if (d < bd && !pinK.has(S.key(ex, ey))) { bd = d; best = [ex, ey]; }
    }
    return best;
  }
  // slide a wire: straight wires move sideways, neighbours stretch (or a new piece of wire is added so nothing breaks)
  function moveWire(orig, i, dx, dy) {
    const ws = orig.map(w => ({ ...w })), w0 = orig[i];
    if (w0.y1 === w0.y2) dx = 0; else if (w0.x1 === w0.x2) dy = 0;
    if (!dx && !dy) return ws;
    const pinK = new Set(c.parts.flatMap(p => S.pinsOf(p).map(q => S.key(...q))));
    const onInside = (o, x, y) => { const vx = o.x2 - o.x1, vy = o.y2 - o.y1, l2 = vx * vx + vy * vy; if (!l2) return false; const t = ((x - o.x1) * vx + (y - o.y1) * vy) / l2; return t > 1e-6 && t < 1 - 1e-6 && Math.abs((x - o.x1) * vy - (y - o.y1) * vx) < 1e-6; };
    const add = [];
    for (const end of [1, 2]) {
      const ex = w0['x' + end], ey = w0['y' + end], k = S.key(ex, ey);
      let conn = pinK.has(k);
      orig.forEach((o, j) => {
        if (j === i) return;
        for (const e2 of [1, 2]) if (S.key(o['x' + e2], o['y' + e2]) === k) {
          const keepsStraight = (o.x1 === o.x2 && dx === 0) || (o.y1 === o.y2 && dy === 0);
          if (keepsStraight) { ws[j]['x' + e2] += dx; ws[j]['y' + e2] += dy; } else conn = true;
        }
        if (onInside(o, ex, ey)) conn = true;
      });
      ws[i]['x' + end] += dx; ws[i]['y' + end] += dy;
      if (conn) {
        if (!dx || !dy) add.push({ x1: ex, y1: ey, x2: ex + dx, y2: ey + dy });
        else add.push({ x1: ex, y1: ey, x2: ex + dx, y2: ey }, { x1: ex + dx, y1: ey, x2: ex + dx, y2: ey + dy });
      }
    }
    return ws.concat(add).filter(w => w.x1 !== w.x2 || w.y1 !== w.y2);
  }
  // crooked (diagonal) wire → L shape
  function straighten(i, downFirst = false) {
    const w = c.wires[i]; if (!w || w.x1 === w.x2 || w.y1 === w.y2) return false;
    const cx = downFirst ? w.x1 : w.x2, cy = downFirst ? w.y2 : w.y1;
    c.wires.splice(i, 1, { x1: w.x1, y1: w.y1, x2: cx, y2: cy }, { x1: cx, y1: cy, x2: w.x2, y2: w.y2 });
    return true;
  }
  function straightenAll() { let n = 0; for (let i = c.wires.length - 1; i >= 0; i--) if (straighten(i)) n++; return n; }
  // wire ends touching a part's pins move with it (rubber band)
  function attachedEnds(p) {
    const pins = S.pinsOf(p).map(q => S.key(...q)), out = [];
    c.wires.forEach((w, i) => {
      const a = pins.indexOf(S.key(w.x1, w.y1)), b = pins.indexOf(S.key(w.x2, w.y2));
      if (a >= 0) out.push([i, 1, a]); if (b >= 0) out.push([i, 2, b]);
    });
    return out;
  }
  function followPins(d) {
    const pins = S.pinsOf(d.p);
    for (const [i, end, k] of d.ends) { const w = c.wires[i]; if (!w) continue; w['x' + end] = pins[k][0]; w['y' + end] = pins[k][1]; }
  }

  function tap(x, y) {
    if (mode === 'place') {
      const p = S.addPart(c, placeType, Math.round(x), Math.round(y));
      if (placeRot) { p.rot = placeRot; }
      sel = { kind: 'part', id: p.id };
      commit();     // stay in place mode: tap again for another one of the same part
      say(`${p.name} placed. Tap again for another ${shortName(placeType)}, ↻ / R turns the next ones, ↖ Select (or Esc) when done.`);
      return;
    }
    if (mode === 'delete') {
      const p = partAt(x, y);
      if (p) { c.parts = c.parts.filter(q => q !== p); sel = null; commit(); say(`${p.name} deleted.`); return; }
      const wi = wireAt(x, y);
      if (wi >= 0) { c.wires.splice(wi, 1); sel = null; commit(); say('Wire deleted.'); return; }
      say('Nothing here. Tap a part or a wire.'); return;
    }
    if (mode === 'meter') {
      const pt = snapPoint(x, y);
      if (!res?.ok || res.vAt(pt[0], pt[1]) == null) { say('Nothing connected here. Tap a wire, a pin or a junction.'); return; }
      probes = probes.length >= 2 || probes.length === 0 ? [pt] : [probes[0], pt];
      say(probes.length === 1 ? 'Red probe placed. Now tap where the black probe goes (tap ground for "voltage to ground").' : 'Measuring. Tap a new point to move the red probe.');
      draw(); return;
    }
    if (mode === 'wire') {
      const pt = snapPoint(x, y);
      if (!wireStart) { wireStart = pt; draw(); say('Now tap where the wire goes. It bends once (L-shape).'); return; }
      const [x0, y0] = wireStart, [x1, y1] = pt;
      if (x0 === x1 && y0 === y1) { wireStart = null; draw(); say('Wire finished. Tap a new start point.'); return; }
      const endsOnSomething = isConnectPoint(x1, y1);
      if (x0 !== x1) c.wires.push({ x1: x0, y1: y0, x2: x1, y2: y0 });
      if (y0 !== y1) c.wires.push({ x1: x1, y1: y0, x2: x1, y2: y1 });
      wireStart = endsOnSomething ? null : pt;
      commit();
      say(endsOnSomething ? 'Connected. Tap a new start point, or ↖ Select when done.' : 'Keep going: tap the next point (tap the same point twice to stop).');
      return;
    }
    // select mode
    const p = partAt(x, y);
    if (p) {
      if (p.type === 'KEYPAD') {
        const [lx, ly] = S.rotPt([x - p.x, y - p.y], (4 - (p.rot & 3)) & 3);
        const col = Math.floor((lx + 4.2) / 2), row = Math.floor((ly + 3.6) / 2.1);
        if (col >= 0 && col < 4 && row >= 0 && row < 4) {
          const q = KEYQ.get(p.id) ?? []; q.push({ r: row, c: col }); if (q.length > 16) q.shift(); KEYQ.set(p.id, q);
          KEYFLASH.set(p.id, { r: row, c: col, until: performance.now() + 220 }); sel = { kind: 'part', id: p.id }; draw(); setTimeout(draw, 240);
          say(`Key ${KEYLAB[row][col]} pressed.` + (sketches.size ? '' : ' (Run a sketch on the board with the Keypad library to read it.)')); return;
        }
      }
      if (p.type === 'ENC') {
        const [lx, ly] = S.rotPt([x - p.x, y - p.y], (4 - (p.rot & 3)) & 3);
        const was = sel?.kind === 'part' && sel.id === p.id; sel = { kind: 'part', id: p.id }; if (!was) renderPanel();
        if (Math.hypot(lx + 0.6, ly) < 0.7) { encPush(p); say(`${p.name}: pushed.`); }
        else { const d = lx < -0.6 ? -1 : 1; encTurn(p, d); say(`${p.name}: one click ${d > 0 ? 'right ⟳ (CLK first)' : 'left ⟲ (DT first)'}. Tap the left / right half of the knob to turn, the middle to push.`); }
        return;
      }
      if (p.type === 'PIR') { p.props.motion = !p.props.motion; sel = { kind: 'part', id: p.id }; commit(); say(`${p.name}: ${p.props.motion ? 'motion! OUT = 3.3 V' : 'quiet, OUT = 0 V'}. Tap again to toggle.`); return; }
      if (p.type === 'SW' || p.type === 'SPDT' || p.type === 'DPDT') { p.props.on = !p.props.on; sel = { kind: 'part', id: p.id }; commit(); say(`${p.name} ${p.props.on ? 'ON (closed)' : 'OFF (open)'}. Tap again to flip.`); return; }
      if (S.isBoard(p.type)) {
        // tap near a pin = select that pin
        const pts = S.pinsOf(p); let bi = -1, bd = 0.8;
        pts.forEach(([px, py], k) => { const d = Math.hypot(px - x, py - y); if (d < bd && S.BOARDS[p.type].pins[k].k !== 'gnd') { bd = d; bi = k; } });
        if (bi >= 0) boardPinSel.set(p.id, S.BOARDS[p.type].pins[bi].n);
      }
      sel = { kind: 'part', id: p.id }; renderPanel(); draw(); return;
    }
    const wi = wireAt(x, y);
    if (wi >= 0) { sel = { kind: 'wire', i: wi }; renderPanel(); draw(); return; }
    sel = null; renderPanel(); draw();
    // double tap / double click on empty space: zoom in ×1.8 there; when already zoomed in close, back to fit
    const now = performance.now();
    if (lastEmptyTap && now - lastEmptyTap.t < 350 && Math.hypot(x - lastEmptyTap.x, y - lastEmptyTap.y) < 1.5) {
      lastEmptyTap = null;
      if (view.g >= 44) { fit(); say('Zoomed out to fit. Double tap empty space to zoom in.'); }
      else { zoomAt(1.8, sx(x), sy(y)); say('Zoomed in. Double tap again for more, or until it fits back.'); }
      draw();
    } else lastEmptyTap = { t: now, x, y };
  }
  let lastEmptyTap = null;

  // ⧉ duplicate / copy / paste: same type, value, rotation and settings; a fresh name (R1 → R2 …)
  function placeCopy(src, at) {
    const q = S.addPart(c, src.type, at ? Math.round(at[0]) : src.x + 4, at ? Math.round(at[1]) : src.y, src.rot);
    q.props = structuredClone(src.props); delete q.props.run; delete q.props.fault; delete q.props.pinsManual;
    if (src.lbl) q.lbl = [...src.lbl];
    for (let k = 0; k < 40 && c.parts.some(o => o !== q && Math.abs(o.x - q.x) < 2 && Math.abs(o.y - q.y) < 2); k++) q.x += 4;   // don't drop it on top of another part
    sel = { kind: 'part', id: q.id }; if (mode !== 'select') setMode('select'); commit();
    say(`${q.name} added (copy of ${src.name ?? q.type}). Drag it into place. Ctrl+D / ⧉ again for more.`);
    return q;
  }
  function duplicateSel() { const p = selPart(); if (!p) return say('Select a part first, then ⧉ Duplicate.'); clip = structuredClone(p); placeCopy(p); }
  function copySel() { const p = selPart(); if (!p) return say('Select a part to copy.'); clip = structuredClone(p); say(`${p.name} copied. Ctrl+V pastes it where the mouse is (or next to it).`); }
  function pasteClip() { if (!clip) return say('Nothing copied yet: select a part and Ctrl+C (or ⧉).'); placeCopy(clip, lastPtr); }
  function rotateSel() {
    if (mode === 'place') { placeRot = (placeRot + 1) & 3; draw(); return say(`Next ${shortName(placeType)}s are turned ${placeRot * 90}°.`); }
    const p = selPart(); if (!p) return say('Select a part first, then ↻.');
    const d = { p, ends: attachedEnds(p) };
    p.rot = (p.rot + 1) & 3; followPins(d); commit();
  }

  // delete whatever is selected (toolbar 🗑, Delete key). Returns false when nothing is selected.
  function deleteSel() {
    if (sel?.kind === 'part') { const p = selPart(); if (!p) return false; c.parts = c.parts.filter(q => q !== p); sel = null; commit(); say(`${p.name} deleted. ↶ brings it back.`); return true; }
    if (sel?.kind === 'wire' && c.wires[sel.i]) { c.wires.splice(sel.i, 1); sel = null; commit(); say('Wire deleted. ↶ brings it back.'); return true; }
    return false;
  }
  // keyboard (PC)
  addEventListener('keydown', (e) => {
    if (root.hidden || !root.isConnected || view2 === 'pcb' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) return;
    const k = e.key.toLowerCase();
    if (k === 'r') rotateSel();
    else if (k === 'w') setMode('wire');
    else if (k === 'escape') { setMode('select'); sel = null; renderPanel(); }
    else if (k.startsWith('arrow') && mode === 'select' && sel) { e.preventDefault(); const m = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k]; nudgeSch(m[0], m[1]); }
    else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); } else if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); duplicateSel(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'c' && selPart()) { e.preventDefault(); copySel(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'v') { e.preventDefault(); pasteClip(); }
  });

  // ---------- properties + readings panel ----------
  function field(label, value, unit, onSet) {
    const inp = el('input', { class: 'num', value, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done' });
    const apply = () => { const v = parse(inp.value); if (v == null || !(v >= 0)) { inp.classList.add('badv'); return; } inp.classList.remove('badv'); onSet(v); commit(); };
    inp.addEventListener('change', apply); inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    return el('label', { class: 'field' }, el('span', { class: 'lab', text: label }), el('span', { class: 'box' }, inp, el('span', { class: 'unit', text: unit })));
  }
  // ---------- 💻 code editor + serial monitor for ESP32 / UNO ----------
  let syncSerial = null, syncRelays = null;
  // ---------- 🔌 relay control: for a running sketch with "const int NRELAYS = n" (the 74HC595 relay sketch) ----------
  const relayCount = (b) => +((b?.props.code ?? '').match(/const\s+int\s+NRELAYS\s*=\s*(\d+)/)?.[1] ?? 0);
  const relayBoard = () => c.parts.find(b => S.isBoard(b.type) && b.props.run && relayCount(b) > 0 && relayCount(b) <= 32);
  const relayPicks = new Map();     // board id → relays you ticked (kept while you switch panels)
  function relayControl(b) {
    const nr = relayCount(b), sel0 = relayPicks.get(b.id) ?? new Set(); relayPicks.set(b.id, sel0);
    const tx = (cmd) => { const rt = sketches.get(b.id); if (!b.props.run || !rt?.send) { say('Press ▶ Run first.'); return; } if (!running) { running = true; store.set('sch.run', '1'); syncTop(); } rt.send(cmd + '\n'); say(`Sent "${cmd}" to ${b.name}.`); };
    const btns = [], grid = el('div', { class: 'relay-grid' });
    for (let k = 0; k < nr; k++) {
      const bt = el('button', { class: 'btn relay-pick' + (sel0.has(k) ? ' on' : ''), type: 'button', text: String(k + 1), title: `Relay ${k + 1}`, onclick: () => { sel0.has(k) ? sel0.delete(k) : sel0.add(k); bt.classList.toggle('on', sel0.has(k)); } });
      btns.push(bt); grid.append(bt);
    }
    const mark = (all) => { sel0.clear(); if (all) for (let k = 0; k < nr; k++) sel0.add(k); btns.forEach((bt, k) => bt.classList.toggle('on', sel0.has(k))); };
    const pattern = () => btns.map((_, k) => (sel0.has(k) ? '1' : '0')).join('');
    const tIn = el('input', { class: 'num', type: 'number', min: '0', step: '0.5', value: b.props.relayReset ?? '0', style: 'width:5.5em' });
    const setT = () => { const v = Math.max(0, +tIn.value || 0); b.props.relayReset = v; tx('time ' + v); };
    tIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setT(); } });
    const status = el('div', { class: 'note' });
    syncRelays = () => {
      const rt = sketches.get(b.id), lines = rt?.lines ?? [];
      const m = [...lines].reverse().map(l => l.text.match(/Relays[^:]*:\s*([01]+)/)).find(Boolean), live = m?.[1] ?? '';
      btns.forEach((bt, k) => bt.classList.toggle('live', live[k] === '1'));
      const t = [...lines].reverse().map(l => l.text.match(/Reset time:\s*(.*)/)).find(Boolean);
      const txt = !b.props.run ? 'Press ▶ Run: the sketch must be running.' : `Red dot = relay really ON. ${live ? 'ON now: ' + ([...live].map((x, k) => (x === '1' ? k + 1 : 0)).filter(Boolean).join(', ') || 'none') + '. ' : ''}Reset time: ${t ? t[1] : 'off'}.`;
      if (status.textContent !== txt) status.textContent = txt;
    };
    syncRelays();
    return el('div', { class: 'relay-box' },
      el('b', { text: `🔌 Relays (${b.name}): tap numbers to select` }), grid,
      el('div', { class: 'row', style: 'display:flex;gap:6px;flex-wrap:wrap' },
        el('button', { class: 'btn primary', type: 'button', text: '⚡ ON selected', onclick: () => sel0.size ? tx('on ' + [...sel0].sort((x, y) => x - y).map(k => k + 1).join(',')) : say('Tap some relay numbers first.') }),
        el('button', { class: 'btn', type: 'button', text: 'OFF selected', onclick: () => sel0.size ? tx('off ' + [...sel0].sort((x, y) => x - y).map(k => k + 1).join(',')) : say('Tap some relay numbers first.') }),
        el('button', { class: 'btn', type: 'button', text: 'Only selected', title: 'Selected ON, all others OFF', onclick: () => tx(pattern()) })),
      el('div', { class: 'row', style: 'display:flex;gap:6px;flex-wrap:wrap' },
        el('button', { class: 'btn', type: 'button', text: 'Select all', onclick: () => mark(true) }),
        el('button', { class: 'btn', type: 'button', text: 'Clear', onclick: () => mark(false) }),
        el('button', { class: 'btn', type: 'button', text: 'All ON', onclick: () => tx('all on') }),
        el('button', { class: 'btn', type: 'button', text: 'All OFF', onclick: () => tx('all off') })),
      el('div', { class: 'row', style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' },
        el('span', { text: '⏱ Reset time' }), tIn, el('span', { text: 's' }),
        el('button', { class: 'btn', type: 'button', text: 'Set', onclick: setT })),
      el('div', { class: 'note', text: 'Reset time: each relay switches itself OFF that many seconds after it went ON. 0 = stays ON.' }),
      status);
  }
  function codeBox(p) {
    const q = p.props, esp = p.type === 'ESP32';
    const ta = el('textarea', { class: 'code-ed', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', rows: 14 });
    ta.value = q.code ?? SKETCHES.blink[esp ? 'esp' : 'uno'];
    let restartT = 0;
    ta.addEventListener('input', () => {
      q.code = ta.value;
      // running code restarts by itself ≈ 1 s after you stop typing (phones don't send 'change' until the keyboard closes)
      if (q.run) { clearTimeout(restartT); restartT = setTimeout(() => { if (!q.run) return; resetSim(); store.set('sch.cur', JSON.stringify(c)); say(sketches.get(p.id)?.err ? 'Code changed: it has an error, see below the editor.' : '🔄 Code changed: sketch restarted with your edit.'); }, 1200); }
    });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); const a = ta.selectionStart; ta.setRangeText('  ', a, ta.selectionEnd, 'end'); q.code = ta.value; } });
    ta.addEventListener('change', () => { clearTimeout(restartT); const was = q.code; q.code = ta.value; if (q.run && was !== undefined) { resetSim(); say('🔄 Code changed: sketch restarted with your edit.'); } commit(); });
    const ex = el('select', { class: 'sel sm', 'aria-label': 'Example sketch' }, el('option', { value: '', text: '📄 Example code…' }), Object.entries(SKETCHES).map(([k, v]) => el('option', { value: k, text: v.name })));
    ex.onchange = () => { if (!ex.value) return; ta.value = q.code = SKETCHES[ex.value][esp ? 'esp' : 'uno']; ex.value = ''; if (q.run) resetSim(); commit(); };
    const runB = el('button', { class: 'btn ' + (q.run ? '' : 'primary'), type: 'button', text: q.run ? '⏹ Stop code' : '▶ Run code', onclick: () => {
      if (q.run) { q.run = false; q.pins = q.pinsManual ?? {}; delete q.pinsManual; sketches.delete(p.id); resetSim(); commit(); say('Code stopped: pins are back to your hand settings.'); return; }
      q.code = ta.value; q.pinsManual = JSON.parse(JSON.stringify(q.pins ?? {})); q.run = true;
      if (!running) { running = true; store.set('sch.run', '1'); syncTop(); }
      resetSim(); autoSpeed(); commit(); say(sketches.get(p.id)?.err ? 'The code has an error: see below the editor.' : '▶ Code running in real time. Serial output shows below the editor.');
    } });
    const out = el('pre', { class: 'serial' });
    const saveB = el('button', { class: 'btn', type: 'button', text: '⬇ Save .ino + wiring', onclick: () => {
      const name = (p.name || 'sketch').replace(/[^\w-]+/g, '_');
      shareFile(`${name}.ino`, wiringHeader(p) + (q.code ?? ta.value), 'text/plain');
    } });
    const copyB = el('button', { class: 'btn', type: 'button', text: '📋 Copy', onclick: async () => { try { await navigator.clipboard.writeText(wiringHeader(p) + (q.code ?? ta.value)); say('Code + wiring copied: paste it in the Arduino IDE.'); } catch { ta.select(); say('Select all and copy by hand (clipboard blocked).'); } } });
    syncSerial = () => {
      const rt = sketches.get(p.id);
      if (!q.run || !rt) { out.textContent = 'Serial monitor: run the code to see Serial.print output here.'; out.classList.remove('bad'); return; }
      if (rt.err) { out.textContent = rt.err; out.classList.add('bad'); return; }
      out.classList.remove('bad');
      const txt = rt.lines.slice(-14).map(l => l.text).join('\n') || '(no Serial output yet)';
      if (out.textContent !== txt) { out.textContent = txt; out.scrollTop = out.scrollHeight; }
    };
    syncSerial();
    const sin = el('input', { class: 'num serial-in', type: 'text', placeholder: 'Send to Serial (e.g. 3, all on, 1000000001)', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false' });
    const send = () => { const rt = sketches.get(p.id); if (!q.run || !rt?.send) { say('Run the code first (▶ Run code), then send.'); return; } rt.send(sin.value + '\n'); say(`Sent "${sin.value}" to ${p.name}'s Serial.`); sin.value = ''; };
    sin.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
    const sendRow = el('div', { class: 'row', style: 'display:flex;gap:6px' }, sin, el('button', { class: 'btn primary', type: 'button', text: 'Send', onclick: send }));
    return el('div', { class: 'code-box' }, el('div', { class: 'row wrap' }, el('b', { text: '💻 Code (Arduino sketch)' }), runB, ex), ta, el('div', { class: 'row wrap' }, saveB, copyB), out, sendRow,
      note('Runs setup() once, then loop() forever, in circuit time: delay(500) really waits 0.5 s. Supported: pinMode, digitalWrite / Read, analogRead / Write, ' + (esp ? 'ledcAttach / ledcWrite, ' : '') + 'delay, millis, Serial.print / println, Servo, map, constrain, if / for / while, your own functions. Not: interrupts, WiFi, libraries other than Servo.'));
  }

  // wiring list for the top of a saved sketch: every board pin and what it connects to on the drawing
  function wiringHeader(b) {
    const nl = nets(); if (!nl) return '';
    const B = S.BOARDS[b.type], bn = nl.pinNet.get(b.id) ?? [], lines = [], gndLike = new Map();
    const others = (net) => {
      const out = [];
      for (const p of c.parts) {
        if (p === b || p.type === 'GND' || p.type === 'SCOPE' || p.type === 'VM' || p.type === 'AM') continue;
        (nl.pinNet.get(p.id) ?? []).forEach((n, i) => { if (n === net) out.push(`${p.name} ${S.TYPES[p.type].pins.length > 1 ? pinLabel(p, i) : ''}`.trim()); });
      }
      return out;
    };
    B.pins.forEach((q, i) => {
      const n = bn[i]; if (n == null || n < 0) return;
      const o = others(n); if (!o.length) return;
      const label = q.k === 'gpio' ? (b.type === 'ESP32' ? `GPIO${q.g}` : q.n) : q.n;
      if (q.k === 'gnd') { const prev = gndLike.get(n) ?? new Set(); o.forEach(x => prev.add(x)); gndLike.set(n, prev); return; }
      lines.push(`//   ${label.padEnd(7)} -> ${o.join(', ')}`);
    });
    for (const set of gndLike.values()) lines.push(`//   ${'GND'.padEnd(7)} -> ${[...set].join(', ')}`);
    const extra = c.parts.filter(p => p !== b && !['GND', 'SCOPE', 'VM', 'AM'].includes(p.type)).map(p => { const lab = S.TYPES[p.type].label.replace(/\s*\(.*?\)/g, ''), v = valueText(p); return `${p.name} = ${lab}${v && !lab.includes(v) ? ' ' + v : ''}`; });
    return `// ===== ${b.type === 'ESP32' ? 'ESP32 DevKit' : 'Arduino UNO'} wiring, made by Fox9nertron from your schematic =====\n` +
      (lines.length ? lines.join('\n') : '//   (nothing wired to the board yet)') + '\n' +
      (extra.length ? '// Parts: ' + extra.join(' · ').replace(/(.{1,110})(\s·\s|$)/g, '$1\n//        ').replace(/\n\/\/\s+$/, '') + '\n' : '') +
      '// =====================================================================\n\n';
  }

  // ---------- my parts (custom parts typed in from a datasheet) ----------
  function builtins(lib, filt = () => true) { return Object.entries(lib).filter(([, m]) => !m.custom && filt(m)).map(([k, m]) => [k, `${k}: ${m.note}`]); }
  function modelChoice(p, label, kind, value, opts, onPick) {
    const pol = { NPN: 'npn', PNP: 'pnp', NMOS: 'n', PMOS: 'p' }[p.type];
    const lib = { BJT: S.BJTS, FET: S.FETS, DIODE: S.DIODES, ZENER: S.ZENER_PARTS, LED: S.LED_COLORS, AMP: S.AMPS, REG: S.REGS, RELAY: S.RELAYS }[kind];
    const mine = Object.entries(lib).filter(([, m]) => m.custom && (!pol || m.pol === pol)).map(([k]) => [k, `★ ${k}`]);
    const wrap = el('div', { class: 'mp-row' }, choice(label, value, [...opts, ...mine, ['__new', '+ New part from datasheet…']], v => {
      if (v === '__new') { partForm(kind, p, null); return; }
      onPick(v);
      const m = S.getCustom(kind, v); if (m && kind === 'LED') p.props.imax = m.imax;
    }));
    if (S.getCustom(kind, value)) wrap.append(el('button', { class: 'btn', type: 'button', text: `✎ Edit ★ ${value}`, onclick: () => partForm(kind, p, value) }));
    return wrap;
  }
  function myParts() { try { return JSON.parse(store.get('sch.myparts', '{}')) || {}; } catch { return {}; } }
  function saveMyParts(a) { store.set('sch.myparts', JSON.stringify(a)); }
  // register a library (my parts, or the one inside a project file); project parts I don't have yet are added to my parts
  function registerLib(lib, addToMine) {
    if (!lib || typeof lib !== 'object') return 0;
    const my = myParts(); let added = 0;
    for (const [kind, o] of Object.entries(lib)) {
      if (!S.CUSTOM_KINDS[kind] || !o) continue;
      for (const [nm, d] of Object.entries(o)) {
        if (S.isBuiltIn(kind, nm)) continue;
        if (addToMine && !my[kind]?.[nm]) { (my[kind] ??= {})[nm] = d; added++; }
        S.registerCustom(kind, nm, d, d.pol);
      }
    }
    if (added) saveMyParts(my);
    return added;
  }
  function setPartModel(p, kind, nm) {
    const m = S.getCustom(kind, nm);
    if (kind === 'LED') { p.props.color = nm; p.props.imax = m.imax; } else if (kind === 'RELAY') p.props.relay = nm; else p.props.model = nm;
  }
  function partForm(kind, p, name) {
    const K = S.CUSTOM_KINDS[kind], pol = { NPN: 'npn', PNP: 'pnp', NMOS: 'n', PMOS: 'p' }[p.type];
    const old = name ? S.getCustom(kind, name)?.raw ?? {} : {};
    const nameIn = el('input', { class: 'num wide', value: name ?? '', placeholder: 'e.g. MRF510, 2SC5200, LM2940-5', maxlength: 30, autocapitalize: 'characters', spellcheck: 'false' });
    if (name) nameIn.disabled = true;
    const ins = {};
    const rows = K.fields.map(([k, label, unit, def, hint, opt]) => {
      let inp;
      if (k === 'glow') inp = el('select', { class: 'sel' }, Object.entries(S.LED_COLORS).filter(([, v]) => !v.custom).map(([c]) => el('option', { value: c, text: c })));
      else if (k === 'adj') inp = el('select', { class: 'sel' }, el('option', { value: '0', text: 'No (fixed, GND pin)' }), el('option', { value: '1', text: 'Yes (ADJ pin, like LM317)' }));
      else inp = el('input', { class: 'num', autocomplete: 'off', spellcheck: 'false', inputmode: 'decimal', placeholder: opt ? `optional (${plain(def)})` : '' });
      inp.value = old[k] != null ? String(old[k]) : opt ? '' : String(def);
      ins[k] = inp;
      return el('label', { class: 'field' }, el('span', { class: 'lab', text: label + (hint ? ` · ${hint}` : '') }),
        inp.tagName === 'SELECT' ? inp : el('span', { class: 'box' }, inp, el('span', { class: 'unit', text: unit })));
    });
    const err = el('div', { class: 'flag bad', hidden: true });
    const save = () => {
      const nm = (name ?? nameIn.value).trim().replace(/[★]/g, '');
      const bad = (t) => { err.textContent = t; err.hidden = false; };
      if (!nm) return bad('Type a name.');
      if (S.isBuiltIn(kind, nm)) return bad(`"${nm}" is already in the list.`);
      if (!name && S.getCustom(kind, nm)) return bad(`You already have ★ ${nm}. Pick it from the list and tap Edit.`);
      const raw = {};
      for (const [k, , , , , opt] of K.fields) {
        const t = ins[k].value.trim();
        if (k === 'glow' || k === 'adj') { raw[k] = t; continue; }
        if (!t) { if (opt) continue; return bad('Fill in every value (optional ones can stay empty).'); }
        const v = parse(t); if (v == null || !(v >= 0)) return bad(`"${t}" is not a number.`);
        raw[k] = v;
      }
      if (pol) raw.pol = pol;
      const my = myParts(); (my[kind] ??= {})[nm] = raw; saveMyParts(my);
      S.registerCustom(kind, nm, raw, pol);
      setPartModel(p, kind, nm);
      d.close(); commit(); say(`Saved ★ ${nm} to your parts. It's in the list for every ${K.title.toLowerCase()} now.`);
    };
    const del = () => {
      const my = myParts(); if (my[kind]) delete my[kind][name]; saveMyParts(my);
      S.unregisterCustom(kind, name);
      for (const q of c.parts) if (S.kindOfType(q.type) === kind && S.partModelKey(q) === name) {
        const def = S.TYPES[q.type].props; if (kind === 'LED') Object.assign(q.props, { color: def.color, imax: def.imax }); else if (kind === 'RELAY') delete q.props.relay; else q.props.model = def.model;
      }
      d.close(); commit(); say(`Deleted ★ ${name}. Parts using it went back to the default.`);
    };
    const d = el('dialog', { class: 'dlg' }, el('div', { class: 'dlg-title2', text: name ? `Edit ★ ${name}` : `New ${K.title.toLowerCase()}${pol ? ` (${{ npn: 'NPN', pnp: 'PNP', n: 'N-channel', p: 'P-channel' }[pol]})` : ''}` }),
      el('div', { class: 'dlg-pad mp-form' }, note('Type the values from the datasheet. Use the "typical" column; a rough value is fine.'),
        el('label', { class: 'field' }, el('span', { class: 'lab', text: 'Part name' }), nameIn), ...rows, err),
      el('div', { class: 'dlg-buttons mp-btns' }, name ? el('button', { class: 'btn danger', type: 'button', text: 'Delete', onclick: del }) : null,
        el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => d.close() }), el('button', { class: 'btn primary', type: 'button', text: 'Save', onclick: save })));
    document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal();
    if (!name) nameIn.focus();
  }
  function choice(label, value, options, onSet) {
    const s = el('select', { class: 'sel' }, options.map(([v, t]) => el('option', { value: v, text: t })));
    s.value = value; s.addEventListener('change', () => { onSet(s.value); commit(); });
    return el('label', { class: 'field' }, el('span', { class: 'lab', text: label }), s);
  }

  function renderPanel() {
    syncNudgeSch(); syncRelays = null;
    panel.innerHTML = '';
    panelRefresh = null; syncSerial = null;
    if (!res) solve();
    if (sel?.kind === 'wire') {
      const w = c.wires[sel.i]; if (!w) { sel = null; return renderPanel(); }
      const pcs = res.ok ? res.wires.filter(x => x.wi === sel.i) : [];
      const v = pcs.length ? pcs[0].va : null, i = pcs.length ? Math.max(...pcs.map(x => Math.abs(x.i))) : 0;
      panel.append(el('div', { class: 'sp-head' }, el('b', { text: 'Wire' }), el('span', { class: 'muted', text: '0 Ω' })),
        readings([['Voltage to ground', v == null ? '—' : si(v, 'V'), true], ['Current', si(i, 'A'), true]], [], []),
        el('div', { class: 'row wrap' },
          ...(w.x1 !== w.x2 && w.y1 !== w.y2 ? [el('button', { class: 'btn primary', type: 'button', text: '⌐ Straighten (across first)', onclick: () => { straighten(sel.i, false); sel = null; commit(); say('Crooked wire turned into an L.'); } }),
            el('button', { class: 'btn', type: 'button', text: '⌙ Straighten (down first)', onclick: () => { straighten(sel.i, true); sel = null; commit(); say('Crooked wire turned into an L.'); } })] : []),
          el('button', { class: 'btn', type: 'button', text: '🗑 Delete wire', onclick: () => { c.wires.splice(sel.i, 1); sel = null; commit(); } })),
        note('Drag a wire to slide it; connected wires stretch along. Drag a wire corner (not on a pin) to move it.'));
      panelRefresh = () => renderPanel();
      return;
    }
    const p = selPart();
    if (!p) { summary(); const again = () => { panel.innerHTML = ''; summary(); panelRefresh = again; }; panelRefresh = again; return; }
    const t = S.TYPES[p.type], q = p.props;
    const nameInp = el('input', { class: 'num nm', value: p.name, maxlength: 12 });
    nameInp.addEventListener('change', () => { p.name = nameInp.value.trim().slice(0, 12) || p.name; commit(); });
    panel.append(el('div', { class: 'sp-head' }, nameInp, el('span', { class: 'muted', text: t.label }),
      el('button', { class: 'btn', type: 'button', text: '↻', title: 'Rotate (R)', onclick: rotateSel }),
      el('button', { class: 'btn', type: 'button', text: '⧉', title: 'Duplicate (Ctrl+D): same part and value, next to it', onclick: duplicateSel }),
      el('button', { class: 'btn', type: 'button', text: '🗑', title: 'Delete', onclick: () => { c.parts = c.parts.filter(x => x !== p); sel = null; commit(); } }),
      p.lbl ? el('button', { class: 'btn', type: 'button', text: '⟲ Label', title: 'Put the label back', onclick: () => { delete p.lbl; commit(); } }) : null));
    const f = el('div', { class: 'fields' });
    switch (p.type) {
      case 'R': f.append(field('Resistance', plain(q.r), 'Ω', v => { q.r = Math.max(v, 1e-6); }), choice('Power rating', String(q.rating), RATINGS.map(x => [String(x), wattName(x)]), v => { q.rating = +v; })); break;
      case 'POT': {
        f.append(field('Total resistance', plain(q.r), 'Ω', v => { q.r = Math.max(v, 1); }));
        const rng = el('input', { type: 'range', min: 0, max: 100, step: 1, value: q.pos, class: 'rng' });
        const lab = el('span', { class: 'lab', text: `Wiper ${Math.round(q.pos)} %` });
        rng.addEventListener('input', () => { q.pos = +rng.value; lab.textContent = `Wiper ${q.pos} %`; solve(); draw(); updateReadings(); });
        rng.addEventListener('change', () => commit());
        f.append(el('label', { class: 'field' }, lab, rng));
        break;
      }
      case 'BAT': f.append(field('Voltage', plain(q.v), 'V', v => { q.v = v; }), field('Internal resistance', plain(q.rint), 'Ω', v => { q.rint = v; })); break;
      case 'ISRC': f.append(field('Current', plain(q.i), 'A', v => { q.i = v; })); break;
      case 'SW': f.append(el('button', { class: 'btn primary', type: 'button', text: q.on ? 'Switch OFF (open)' : 'Switch ON (close)', onclick: () => { q.on = !q.on; commit(); } })); break;
      case 'SPDT': case 'DPDT': f.append(el('button', { class: 'btn primary', type: 'button', text: q.on ? 'Flip to ▲ up' : 'Flip to ▼ down', onclick: () => { q.on = !q.on; commit(); } })); break;
      case 'PB': {
        const b = el('button', { class: 'btn primary hold', type: 'button', text: 'Hold to press' });
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.setPointerCapture?.(e.pointerId); q.on = true; solve(); draw(); updateReadings(); });
        const rel = () => { if (!q.on) return; q.on = false; solve(); draw(); updateReadings(); };
        b.addEventListener('pointerup', rel); b.addEventListener('pointercancel', rel); b.addEventListener('lostpointercapture', rel);
        f.append(b); break;
      }
      case 'LED': f.append(modelChoice(p, 'Color / part', 'LED', q.color, Object.entries(S.LED_COLORS).filter(([, v]) => !v.custom).map(([k, v]) => [k, `${k} (${v.vf} V)`]), v => { q.color = v; }), field('Max current', plain(q.imax), 'A', v => { q.imax = v; })); break;
      case 'D': f.append(modelChoice(p, 'Type', 'DIODE', q.model, builtins(S.DIODES), v => { q.model = v; })); break;
      case 'DHT': case 'HCSR04': case 'LDR': {
        const spec = { DHT: [['temp', 'Temperature', '°C', -20, 80, 0.5], ['hum', 'Humidity', '%', 0, 100, 1]], HCSR04: [['cm', 'Distance to the object', 'cm', 2, 400, 1]], LDR: [['lux', 'Light', 'lux', 0, 4.3, 0.05, true]] }[p.type];
        if (p.type === 'DHT') f.append(choice('Type', q.model, [['DHT22', 'DHT22 / AM2302 (0.1 °C)'], ['DHT11', 'DHT11 (whole degrees, 0–50 °C)']], v => { q.model = v; }));
        for (const [k, lab, unit, mn, mx, st, log] of spec) {
          const val = () => (log ? Math.pow(10, +rng.value) : +rng.value);
          const show = (v) => `${lab}: ${log ? si(v, '', 3).trim() : plain(v)} ${unit}`;
          const rng = el('input', { type: 'range', min: mn, max: mx, step: st, value: log ? Math.log10(Math.max(1, q[k])) : q[k], class: 'rng' });
          const lb = el('span', { class: 'lab', text: show(q[k]) });
          rng.addEventListener('input', () => { q[k] = log ? +val().toPrecision(2) : val(); lb.textContent = show(q[k]); solve(); draw(); updateReadings(); });
          rng.addEventListener('change', () => commit(false));
          f.append(el('label', { class: 'field' }, lb, rng));
        }
        f.append(note({ DHT: 'Pins VCC, DATA, GND. 3.3–5 V. Slide what the sensor "feels"; a sketch reads it with the DHT library (dht.readTemperature()).', HCSR04: 'Pins VCC (5 V!), TRIG, ECHO, GND. A sketch sends a 10 µs TRIG pulse and measures the ECHO pulse with pulseIn(): 58 µs per cm. ECHO is 5 V: use a divider (1 k / 2 k) into an ESP32.', LDR: 'Resistance drops with light: ≈ 1 MΩ dark, 10 kΩ at 10 lux (dim room), ≈ 1 kΩ in daylight. Use it with a 10 kΩ resistor as a divider into an analog pin.' }[p.type]));
        break;
      }
      case 'KEYPAD': {
        const g = el('div', { class: 'kp-grid' });
        KEYLAB.forEach((row, rr) => [...row].forEach((ch, cc) => g.append(el('button', { class: 'btn kp-key', type: 'button', text: ch, onclick: () => { const qq = KEYQ.get(p.id) ?? []; qq.push({ r: rr, c: cc }); KEYQ.set(p.id, qq); KEYFLASH.set(p.id, { r: rr, c: cc, until: performance.now() + 220 }); draw(); setTimeout(draw, 240); } }))));
        f.append(g, note('Tap a key here or on the drawing. Pins R1–R4 (rows), C1–C4 (columns) in order. A sketch reads keys with the Keypad library: keypad.getKey().')); break;
      }
      case 'LOCK': f.append(field('Rated voltage', plain(q.v), 'V', v => { q.v = v; }), field('Coil resistance', plain(q.r), 'Ω', v => { q.r = Math.max(v, 0.1); }),
        note('Never straight from a pin: 12 V 0.5 A needs a MOSFET (IRLZ44N) or relay, plus a diode across the coil. Opens when the current reaches ½ of rated.')); break;
      case 'BUZZER': f.append(el('label', { class: 'chk' }, Object.assign(el('input', { type: 'checkbox' }), { checked: store.get('sch.sound', '1') === '1', onchange: (e) => { store.set('sch.sound', e.target.checked ? '1' : '0'); buzz(false); } }), ' 🔊 Play the beep on this device'),
        note('Active buzzer: beeps at its own tone (≈ 2.5 kHz) whenever it gets 3–5 V. digitalWrite(pin, HIGH) = beep. About 12–20 mA: fine from an ESP32 / UNO pin.')); break;
      case 'PIR': f.append(el('button', { class: 'btn primary', type: 'button', text: q.motion ? '🚶 Motion → stop' : '🚶 Walk past it', onclick: () => { q.motion = !q.motion; commit(); } }),
        note('Pins VCC (5 V), OUT, GND. OUT is 3.3 V while it sees motion: digitalRead() it directly, ESP32 or UNO. Tap the sensor on the drawing to toggle motion.')); break;
      case 'SR595': f.append(choice('Chip', q.model ?? '74HC595', [['74HC595', '74HC595 (inputs need 0.7 × VCC: 3.5 V at 5 V)'], ['74HCT595', '74HCT595 (inputs need 2 V: OK from a 3.3 V ESP32 at 5 V)']], v => { q.model = v; }),
        note('Pins: 14 SER data in · 11 SRCLK shift clock · 12 RCLK latch · 10 SRCLR to VCC · 13 OE to GND · 9 QH\' → SER of the next chip (cascade) · 16 VCC · 8 GND. Code: digitalWrite(LATCH, LOW); shiftOut(DATA, CLOCK, MSBFIRST, byte); digitalWrite(LATCH, HIGH); — the last chip\'s byte first.')); break;
      case 'RMOD': { const rb = relayBoard(); if (rb) f.append(relayControl(rb)); }
        f.append(choice('Trigger', q.trig ?? 'low', [['low', 'LOW level trigger (most modules: IN LOW = relay ON)'], ['high', 'HIGH level trigger (jumper on H)']], v => { q.trig = v; }),
        note('VCC 5 V, GND, IN from the controller (≈ 3 mA). COM / NO / NC are the switch: NO closes when the relay is ON. Load side up to 10 A 250 VAC on the usual SRD-05VDC relay. Each relay coil takes ≈ 70 mA: 10 relays ≈ 0.7 A, so use a 5 V supply, not the board\'s pin.')); break;
      case 'ENC': {
        const row = el('div', { class: 'row', style: 'display:flex;gap:6px;flex-wrap:wrap' },
          el('button', { class: 'btn', type: 'button', text: '⟲ Left', onclick: () => encTurn(p, -1) }),
          el('button', { class: 'btn primary', type: 'button', text: '⏺ Push', onclick: () => encPush(p) }),
          el('button', { class: 'btn', type: 'button', text: 'Right ⟳', onclick: () => encTurn(p, 1) }));
        f.append(row, note('Pins CLK, DT, SW, +, GND. + to 3.3 V (ESP32) or 5 V (UNO). CLK and DT have 10 kΩ pull-ups on the module; SW has none: use INPUT_PULLUP. One click: CLK and DT both go LOW and back, CLK first when you turn right. Tap the knob on the drawing too: left half ⟲, right half ⟳, middle = push.')); break;
      }
      case 'OLED': f.append(choice('I2C address', String(q.addr ?? 0x3C), [['60', '0x3C (most 0.96" modules)'], ['61', '0x3D (address jumper moved)']], v => { q.addr = +v; }),
        choice('Color', q.color ?? 'white', [['white', 'white'], ['blue', 'blue'], ['yb', 'yellow top 16 rows + blue']], v => { q.color = v; }),
        note('Header GND, VCC, SCL, SDA (check the print on your module: some have VCC and GND swapped). 3.3 V or 5 V. ESP32: SDA = GPIO21, SCL = GPIO22. UNO: SDA = A4, SCL = A5. Pictures come from a running sketch (Adafruit_SSD1306 library), see 💻 Code on the board.')); break;
      case 'LCD': f.append(choice('I2C address', String(q.addr ?? 0x27), [['39', '0x27 (PCF8574, most common)'], ['63', '0x3F (PCF8574A)']], v => { q.addr = +v; }),
        note('Header GND, VCC, SDA, SCL. ESP32: SDA = GPIO21, SCL = GPIO22, VCC from VIN (5 V). UNO: SDA = A4, SCL = A5, VCC 5 V. Text comes from a running sketch (LiquidCrystal_I2C library), see 💻 Code on the board.')); break;
      case 'SEG7': f.append(choice('Type', q.common ?? 'cathode', [['cathode', 'common cathode (CC: COM to GND, HIGH lights)'], ['anode', 'common anode (CA: COM to +, LOW lights)']], v => { q.common = v; }),
        choice('Color', q.color ?? 'red', ['red', 'green', 'yellow', 'blue', 'white', 'orange'].map(x => [x, x]), v => { q.color = v; })); break;
      case 'XFMR': f.append(field('Turns P1–CT', plain(q.n1), 'turns', v => { q.n1 = Math.max(v, 1e-3); }), field('Turns CT–P2', plain(q.n2), 'turns', v => { q.n2 = v; }),
        field('Turns secondary', plain(q.ns), 'turns', v => { q.ns = v; }), field('Inductance P1–CT', plain(q.lm), 'H', v => { q.lm = Math.max(v, 1e-9); }),
        field('Resistance P1–CT', plain(q.r1), 'Ω', v => { q.r1 = v; }), field('Resistance CT–P2', plain(q.r2), 'Ω', v => { q.r2 = v; }), field('Resistance secondary', plain(q.rs), 'Ω', v => { q.rs = v; })); break;
      case 'LAMP': f.append(field('Rated voltage', plain(q.vr), 'V', v => { q.vr = v; }), field('Rated power', plain(q.wr), 'W', v => { q.wr = v; })); break;
      case 'C': f.append(field('Capacitance', plain(q.c), 'F', v => { q.c = Math.max(v, 1e-15); }), field('Voltage rating', plain(q.vmax), 'V', v => { q.vmax = v; }),
        choice('Type', q.polar ? 'e' : 'n', [['e', 'Electrolytic (has + and −)'], ['n', 'Ceramic / film (no polarity)']], v => { q.polar = v === 'e'; })); break;
      case 'L': f.append(field('Inductance', plain(q.l), 'H', v => { q.l = Math.max(v, 1e-12); }), field('Coil resistance', plain(q.r), 'Ω', v => { q.r = v; })); break;
      case 'SIG': f.append(choice('Wave', q.wave, [['sine', 'Sine'], ['square', 'Square (±)'], ['triangle', 'Triangle'], ['saw', 'Sawtooth'], ['pwm', 'PWM (0 to amplitude)']], v => { q.wave = v; }),
        field('Frequency', plain(q.f), 'Hz', v => { q.f = Math.max(v, 1e-3); }), field('Amplitude (peak)', plain(q.amp), 'V', v => { q.amp = v; }),
        field('DC offset', plain(q.off), 'V', v => { q.off = v; }), field('Duty (PWM)', plain(q.duty), '%', v => { q.duty = Math.min(100, v); })); break;
      case 'SCOPE': f.append(note('CH1 (yellow) and CH2 (blue) measure against the bottom pin (COM). Usually wire COM to ground. Settings are under the scope screen.'),
        el('button', { class: 'btn', type: 'button', text: 'Auto time/div', onclick: () => autoTime() })); break;
      case 'ZD': {
        f.append(modelChoice(p, 'Part', 'ZENER', q.model ?? '', [['', 'Generic (choose Vz below)']], v => { q.model = v || undefined; }));
        if (!S.ZENER_PARTS[q.model]) f.append(choice('Zener voltage', S.ZENERS.includes(q.vz) ? String(q.vz) : 'x', [...S.ZENERS.map(v => [String(v), `${v} V`]), ['x', 'custom']], v => { if (v !== 'x') q.vz = +v; }),
          field('Zener voltage (custom)', plain(q.vz), 'V', v => { q.vz = Math.max(0.5, v); }),
          choice('Power rating', String(q.pmax), [['0.5', '0.5 W (BZX55, small glass)'], ['1', '1 W (1N47xx)'], ['5', '5 W (1N53xx)']], v => { q.pmax = +v; }));
        f.append(note('The bar (cathode) goes to + . Always put a resistor in series.')); break;
      }
      case 'NPN': case 'PNP': f.append(modelChoice(p, 'Type', 'BJT', q.model, builtins(S.BJTS, m => m.pol === p.type.toLowerCase()), v => { q.model = v; }),
        note(p.type === 'NPN' ? 'Pins: B left, C top, E bottom. Low-side switch: E to ground, load between + and C.' : 'Pins: B left, E top, C bottom. High-side switch: E to +, load between C and ground. Base LOW = on.')); break;
      case 'NMOS': case 'PMOS': f.append(modelChoice(p, 'Type', 'FET', q.model, builtins(S.FETS, m => m.pol === (p.type === 'NMOS' ? 'n' : 'p')), v => { q.model = v; }),
        note(p.type === 'NMOS' ? 'Pins: G left, D top, S bottom. Low-side switch: S to ground, load between + and D. Add 100 Ω in the gate and 10 kΩ gate → ground.' : 'Pins: G left, S top, D bottom. High-side: S to +, load between D and ground. Gate LOW (below S) = on.')); break;
      case 'OPAMP': f.append(modelChoice(p, 'Type', 'AMP', q.model, builtins(S.AMPS), v => { q.model = v; }),
        note('Pins: − input top-left, + input bottom-left, output right, supply V+ top, V− bottom (to ground on a single supply).')); break;
      case 'REG': f.append(modelChoice(p, 'Type', 'REG', q.model, builtins(S.REGS), v => { q.model = v; }),
        note(S.REGS[q.model]?.adj ? 'Pins: IN left, OUT right, ADJ bottom. R1 (240 Ω) from OUT to ADJ, R2 from ADJ to ground: Vout = 1.25 × (1 + R2 ÷ R1).' : 'Pins: IN left, OUT right, GND bottom. Real circuit: 0.33 µF on IN and 0.1 µF on OUT, close to the pins.')); break;
      case 'SERVO': f.append(choice('Type', q.model, Object.entries(S.SERVOS).map(([k, m]) => [k, `${k}: ${m.note}`]), v => { q.model = v; }),
        note('Wires: SIG (orange / yellow), V+ (red), GND (brown / black). Signal: a pulse every 20 ms (50 Hz). 0.5 ms = 0°, 1.5 ms = 90°, 2.5 ms = 180° → PWM duty 2.5 %, 7.5 %, 12.5 %.')); break;
      case 'STEPPER': f.append(choice('Microstepping (MS1–MS3)', String(q.micro), [[1, 'Full step (all MS LOW)'], [2, '1/2 (MS1 HIGH)'], [4, '1/4 (MS2 HIGH)'], [8, '1/8 (MS1 + MS2 HIGH)'], [16, '1/16 (all MS HIGH)']].map(([v, t]) => [String(v), t]), v => { q.micro = +v; }),
        choice('Motor', String(q.steps), [['200', '1.8° / step (200 steps per turn, NEMA 17)'], ['400', '0.9° / step (400 steps per turn)'], ['2048', '28BYJ-48 geared (≈ 2048 steps per turn)']], v => { q.steps = +v; }),
        field('Current limit (set with the trimpot)', plain(q.ilim), 'A', v => { q.ilim = Math.max(0.05, Math.min(2, v)); }),
        note('A4988: each rising edge on STEP = one (micro)step. DIR picks the direction. EN LOW (or open) = driver on. VDD = logic 3–5.5 V, VMOT = motor 8–35 V with a 100 µF capacitor close by. Tie RST to SLP on the module.')); break;
      case 'ESP32': case 'UNO': {
        if (relayCount(p) > 0 && relayCount(p) <= 32) f.append(relayControl(p));
        const B = S.BOARDS[p.type]; q.pins ??= {};
        const cur = boardPin(p), pin = B.pins.find(x => x.n === cur);
        const label = (x) => { const m = x.k === 'gpio' ? (q.pins[x.n]?.mode ?? 'in') : x.k; return `${x.n}${x.label && x.label !== x.n ? ` (${x.label})` : ''} · ${MODE_SHORT[m]}`; };
        f.append(choice('Pin (or tap a pin on the drawing)', cur, B.pins.filter(x => x.k !== 'gnd').map(x => [x.n, label(x)]), v => { boardPinSel.set(p.id, v); }));
        if (pin.k === 'gpio') {
          const mode = q.pins[cur]?.mode ?? 'in';
          const hwPwm = p.type === 'ESP32' || pin.pwm;
          const mLabel = (m) => m === 'pwm' && !hwPwm ? 'Pulses (Servo library / timer code, NOT analogWrite)' : m === 'pwm' && p.type === 'UNO' ? 'PWM ~ (analogWrite, 490 Hz; D5 / D6 980 Hz)' : S.PIN_MODES[m];
          f.append(choice('Pin mode (what your code would do)', mode, S.pinModesFor(p.type, pin).map(m => [m, mLabel(m)]), v => {
            if (v === 'in') { delete q.pins[cur]; return; }
            const was = q.pins[cur]?.mode;
            q.pins[cur] = { ...(q.pins[cur] ?? {}), mode: v };
            if (v === 'pwm' && was !== 'pwm' && q.pins[cur].f == null) q.pins[cur].f = p.type === 'UNO' ? (hwPwm ? (/^D[56]$/.test(cur) ? 980 : 490) : 50) : 1000;
          }));
          if (mode === 'pwm') f.append(field('PWM frequency', plain(q.pins[cur].f ?? 1000), 'Hz', v => { q.pins[cur].f = Math.max(v, 0.1); }), field('Duty', plain(q.pins[cur].duty ?? 50), '%', v => { q.pins[cur].duty = Math.min(100, v); }));
          const caps = [pin.label, pin.inOnly ? 'input only' : 'in / out', pin.pwm || p.type === 'ESP32' ? (pin.inOnly ? null : (p.type === 'UNO' ? 'PWM ~' : 'PWM')) : (p.type === 'UNO' ? 'no analogWrite (pulses by code OK)' : null), pin.adc ? `${pin.adc} (analog in)` : null, pin.i2c ? `I²C ${pin.i2c}` : null].filter(Boolean).join(' · ');
          f.append(note(caps + (pin.strap ? ' · ⚠ boot strapping pin' : '') + (pin.serial ? ' · ⚠ USB serial pin' : '')));
        } else f.append(note(pin.k === 'pwr' ? `${pin.n}: ${pin.v} V out, ${pin.note}.` : pin.k === 'en' ? 'EN: reset. Pulled up to 3.3 V inside (10 kΩ). Pull it to GND = reset.' : `${pin.n}: ${pin.note ?? 'not connected inside'}.`));
        if (!q.run) f.append(note(`Pins set by hand, as if your code had already done it. Or write real code below (💻 Code). The board is powered from USB (${B.vcc} V logic).`));
        else f.append(note('💻 Your code is running: it sets the pins now (changes made by hand above get overwritten).'));
        f.append(codeBox(p));
        break;
      }
      case 'TL494': f.append(note('TL494 (also KA7500, KIA494): the PWM brain of PC power supplies, inverters and DC-DC converters. Pins: 1 1IN+ · 2 1IN− · 3 FEEDBACK · 4 DTC · 5 CT · 6 RT · 7 GND · 8 C1 · 9 E1 · 10 E2 · 11 C2 · 12 VCC (7–40 V) · 13 OUTPUT CTRL · 14 REF (5 V) · 15 2IN− · 16 2IN+.'),
        note('Frequency: f = 1 ÷ (RT × CT) (RT pin 6, CT pin 5, both to GND). Pin 13 to GND = both outputs together; pin 13 to REF = push-pull (Q1 / Q2 take turns, each at f ÷ 2). DTC (pin 4) sets the dead time: 0 V = max pulse, ≈ 3 V = off. Error amp not used: IN+ to GND, IN− to REF.')); break;
      case 'T555': f.append(choice('Type', q.model, Object.entries(S.TIMERS).map(([k, m]) => [k, `${k}: ${m.note}`]), v => { q.model = v; }),
        note('Pins: 1 GND · 2 TRIG · 3 OUT · 4 RESET · 5 CTRL · 6 THR · 7 DIS · 8 VCC. TRIG below ⅓ Vcc → output HIGH. THR above ⅔ Vcc → output LOW (and DIS shorts to ground). RESET to + for normal use. 10 nF from CTRL to ground keeps it steady.')); break;
      case 'RELAY': {
        const cust = S.getCustom('RELAY', q.relay);
        f.append(modelChoice(p, 'Coil', 'RELAY', cust ? q.relay : String(q.vcoil), Object.entries(S.RELAYS).filter(([, m]) => !m.custom).map(([v, m]) => [v, `${v} V coil (${m.rcoil} Ω)`]),
          v => { if (S.getCustom('RELAY', v)) q.relay = v; else { delete q.relay; q.vcoil = +v; Object.assign(q, { rcoil: S.RELAYS[v].rcoil, l: S.RELAYS[v].l }); } }));
        if (!cust) f.append(field('Coil resistance', plain(q.rcoil), 'Ω', v => { q.rcoil = Math.max(v, 1); }), field('Coil inductance', plain(q.l), 'H', v => { q.l = Math.max(v, 1e-6); }));
        f.append(note('Coil pins on the left. Contacts: COM (bottom) connects to NC when off, to NO when the coil pulls in (≥ 75 % of rated current).')); break;
      }
      case 'OPTO': f.append(choice('CTR (current transfer ratio)', String(q.ctr), [[50, '50 %'], [80, '80 %'], [100, '100 % (typical)'], [160, '160 %'], [200, '200 %'], [300, '300 %'], [600, '600 %']].map(([v, t]) => [String(v), t]), v => { q.ctr = +v; }),
        note('Pins: 1 anode, 2 cathode (LED, left) · 4 collector, 3 emitter (transistor, right). Ic = CTR × If until it saturates.')); break;
    }
    if (f.children.length) panel.append(f);
    const fopts = S.faultOptions(p.type);
    if (fopts.length) {
      const fc = choice('🔧 Fault (troubleshoot)', q.fault ?? 'ok', fopts, v => { if (v === 'ok') delete q.fault; else q.fault = v; say(v === 'ok' ? `${p.name} repaired.` : `${p.name} is now ${fopts.find(o => o[0] === v)[1]}. Measure it with 🔍 Meter.`); });
      fc.classList.add('fault-pick'); if (q.fault && q.fault !== 'ok') fc.classList.add('on');
      panel.append(fc);
    }
    const rd = el('div', { class: 'sp-read' }); panel.append(rd);
    updateReadings();
    panelRefresh = updateReadings;
    function updateReadings() {
      syncSerial?.(); syncRelays?.();
      const r = res.ok ? res.parts.get(p.id) : null;
      rd.innerHTML = '';
      if (!res.ok) { rd.append(el('p', { class: 'flag ' + (res.stopped ? 'warn' : 'bad'), text: res.error })); return; }
      if (!r) { rd.append(note('Ground: this point is 0 V. Every voltage is measured from here.')); return; }
      rd.append(partReadings(p, r));
    }
  }

  function readings(vals, lines, warn) {
    // the highlighted values also go into the little tip bubble drawn next to the selected wire / part
    const hi = vals.filter(v => v[2]); tipVals = (hi.length ? hi : vals).slice(0, 3).map(([l, v]) => [l, v]);
    return el('div', {},
      el('div', { class: 'readouts' }, vals.map(([l, v, hi]) => el('div', { class: 'ro' + (hi ? ' hi' : '') }, el('span', { class: 'rl', text: l }), el('span', { class: 'rv', text: v })))),
      warn.length ? el('div', { class: 'flags' }, warn.map(([lvl, t]) => el('div', { class: 'flag ' + lvl, text: t }))) : null,
      lines.length ? el('pre', { class: 'steps', text: lines.join('\n') }) : null);
  }

  function partReadings(p, r) {
    const c0 = (v) => (Math.abs(v) < 1e-9 ? 0 : v);
    const q = p.props, vals = [], L = [], warn = [];
    if (r.fault) {
      const txt = S.faultOptions(p.type).find(o => o[0] === r.fault)?.[1] ?? r.fault;
      vals.push(['Fault', txt, true], [r.fault === 'short' ? 'Volts across short' : 'Volts across', si(r.v, 'V'), true], ['Current', si(Math.abs(r.i), 'A'), true]);
      warn.push(['bad', r.fault === 'open' ? 'OPEN: no current flows through it. On the bench: the full voltage appears across it, and everything after it reads 0 V.' : 'SHORT: it acts like a wire. On the bench: ≈ 0 V across it, extra current, the part after it gets the full voltage (or a fuse blows).']);
      L.push('Set Fault back to OK to repair it.');
      return readings(vals, L, warn);
    }
    if (q.fault === 'weak') warn.push(['warn', 'Fault: ' + (S.faultOptions(p.type).find(o => o[0] === 'weak')?.[1] ?? 'weak') + '. Readings below include the fault.']);
    const I = Math.abs(r.i), Vab = r.v;
    switch (p.type) {
      case 'R': {
        vals.push(['Voltage drop', si(Math.abs(Vab), 'V'), true], ['Current', si(I, 'A'), true], ['Power', si(r.p, 'W'), true]);
        L.push(`I = V ÷ R = ${plain(Math.abs(Vab))} ÷ ${plain(q.r)} = ${si(I, 'A')}`, `P = I² × R = ${plain(I)}² × ${plain(q.r)} = ${si(r.p, 'W')}`);
        const load = r.p / q.rating;
        warn.push([load > 1 ? 'bad' : load > 0.5 ? 'warn' : 'ok', load > 1 ? `Over its ${wattName(q.rating)} rating (${pct(load, 0)}): it will burn. Use ${wattName(RATINGS.find(x => x >= r.p * 2) ?? 10)}.` : load > 0.5 ? `Runs hot: ${pct(load, 0)} of ${wattName(q.rating)}. Use a bigger rating for 2× margin.` : `Cool: ${pct(load, 0)} of its ${wattName(q.rating)} rating.`]);
        break;
      }
      case 'POT':
        vals.push(['Wiper voltage', si(r.vw, 'V'), true], ['Current', si(Math.abs(r.iaw), 'A')], ['Power', si(r.p, 'W')]);
        L.push(`Top part = ${si(q.r * q.pos / 100, 'Ω')}, bottom part = ${si(q.r * (1 - q.pos / 100), 'Ω')}`, `Wiper = ${si(r.vw, 'V')} (to ground)`);
        if (r.p > 0.25) warn.push(['warn', 'Most small pots are 0.1–0.25 W: use it as a divider, not to carry load current.']);
        break;
      case 'BAT': {
        const out = -r.i;
        vals.push(['Current out of +', si(out, 'A'), true], ['Power delivered', si(-r.p, 'W'), true], ['Terminal voltage', si(Vab, 'V')]);
        if (q.rint > 0) L.push(`Terminal V = EMF − I × r = ${plain(q.v)} − ${plain(out)} × ${plain(q.rint)} = ${si(Vab, 'V')}`);
        if (out < -1e-6) warn.push(['warn', `Current flows INTO ${p.name}: it is being charged (or another source is stronger).`]);
        if (Math.abs(out) > 50) warn.push(['bad', 'SHORT CIRCUIT! Add a resistor or a fuse.']);
        if (q.v > 0 && 9 === q.v && Math.abs(out) > 0.5) warn.push(['warn', 'A 9 V battery can only supply about 0.1–0.5 A for long.']);
        break;
      }
      case 'ISRC': vals.push(['Current', si(q.i, 'A'), true], ['Voltage across', si(Vab, 'V'), true]); break;
      case 'SPDT': case 'DPDT':
        vals.push(['Position', q.on ? '▼ down' : '▲ up', true], [p.type === 'DPDT' ? 'Pole 1 current' : 'Current', si(Math.abs(r.i1), 'A'), true]);
        if (p.type === 'DPDT') vals.push(['Pole 2 current', si(Math.abs(r.i2), 'A'), true]);
        L.push(p.type === 'DPDT' ? 'Two switches moved by one lever. Common pins on the left; each connects to the upper (▲) or lower (▼) pin on the right.\nClassic use: reverse a DC motor or solenoid (cross-wire the outer pins).' : 'Common pin on the left connects to the upper (▲) or lower (▼) pin.');
        break;
      case 'SW': case 'PB': vals.push(['State', q.on ? 'closed' : 'open', true], [q.on ? 'Current' : 'Voltage across', q.on ? si(I, 'A') : si(Math.abs(Vab), 'V'), true]);
        if (!q.on && Math.abs(Vab) > 1e-3) L.push(`Open switch: the full ${si(Math.abs(Vab), 'V')} appears across it.`);
        break;
      case 'LED': {
        const m = S.LED_COLORS[q.color] ?? S.LED_COLORS.red;
        vals.push(['Current', si(I, 'A'), true], ['Voltage', si(Math.abs(Vab), 'V'), true], ['Power', si(r.p, 'W')]);
        if (r.on) {
          L.push(`LED needs ≈ ${m.vf} V (${q.color}). The rest drops on the resistor in series.`);
          const pct20 = I / q.imax;
          warn.push([pct20 > 1.2 ? 'bad' : pct20 > 1 ? 'warn' : I < 0.001 ? 'warn' : 'ok', pct20 > 1.2 ? `Too much current (${si(I, 'A')} > ${si(q.imax, 'A')}): it will burn. Use a bigger series resistor.` : pct20 > 1 ? 'At its limit: a slightly bigger resistor makes it last longer.' : I < 0.001 ? 'Very dim (under 1 mA).' : `OK: ${pct(pct20, 0)} of max current.`]);
        } else warn.push(['warn', Vab < 0 ? 'Reversed: the LED blocks. Flip it (↻ twice): the long leg (+, anode) goes to +.' : `Off: not enough voltage (needs ${m.vf} V).`]);
        if (Vab < -5) warn.push(['bad', 'More than 5 V backwards can damage an LED.']);
        break;
      }
      case 'D': {
        const m = S.DIODES[q.model] ?? S.DIODES['1N4007'];
        vals.push(['Current', si(I, 'A'), true], ['Voltage', si(Vab, 'V'), true], ['Power', si(r.p, 'W')]);
        warn.push(r.on ? [I > m.imax ? 'bad' : 'ok', I > m.imax ? `Over ${si(m.imax, 'A')}: use a bigger diode.` : `Conducting (${m.vf} V drop).`] : ['ok', Vab < 0 ? `Blocking ${si(-Vab, 'V')} (rated ${m.piv} V).` : 'Not conducting.']);
        if (-Vab > m.piv) warn.push(['bad', `Reverse voltage over ${m.piv} V: it breaks down.`]);
        break;
      }
      case 'DHT': case 'HCSR04': case 'PIR': {
        const need = p.type === 'HCSR04' ? 4.5 : 3;
        vals.push(['Supply', si(r.v, 'V'), true], [p.type === 'DHT' ? 'DATA' : p.type === 'HCSR04' ? 'ECHO' : 'OUT', si(r.vout, 'V'), true]);
        if (p.type === 'DHT') vals.push(['Reads', `${plain(q.temp)} °C · ${plain(q.hum)} %`]);
        if (p.type === 'HCSR04') vals.push(['Echo pulse', `${Math.round(q.cm * 58.3)} µs`]);
        if (r.v < need) warn.push(['bad', r.v < 1 ? 'No power: wire VCC and GND.' : `${si(r.v, 'V')} is too low: it needs ${need === 3 ? '3.3–5 V' : '5 V'}.`]);
        break;
      }
      case 'LOCK': vals.push(['State', r.open ? '🔓 OPEN' : '🔒 LOCKED', true], ['Current', si(Math.abs(r.i), 'A'), true], ['Voltage', si(Math.abs(Vab), 'V')]);
        if (Math.abs(Vab) > 40) warn.push(['bad', `${si(Math.abs(Vab), 'V')} switch-off spike: add a diode across the lock.`]); break;
      case 'BUZZER': vals.push(['State', Math.abs(Vab) > 1.5 ? '🔊 BEEP' : 'quiet', true], ['Voltage', si(Math.abs(Vab), 'V'), true], ['Current', si(I, 'A')]); break;
      case 'KEYPAD': vals.push(['Keys waiting', String(KEYQ.get(p.id)?.length ?? 0), true]); break;
      case 'LDR': vals.push(['Resistance', si(S.ldrOhms(q.lux), 'Ω'), true], ['Voltage', si(Math.abs(Vab), 'V'), true], ['Current', si(I, 'A')]); break;
      case 'TL494': {
        const T = S.TL494, pc = (x) => (x * 100).toFixed(1) + ' %', out = r.f ? (r.pp ? r.f / 2 : r.f) : null;
        vals.push(['Outputs', `Q1 ${r.q[0] ? 'ON' : 'off'} · Q2 ${r.q[1] ? 'ON' : 'off'}`, true], ['Oscillator', r.f ? si(r.f, 'Hz') : 'measuring… (Run)', true],
          ['Each output', out ? si(out, 'Hz') : '—', true], ['Duty Q1 / Q2', r.duty ? `${pc(r.duty[0])} / ${pc(r.duty[1])}` : '—', true],
          ['Mode', r.pp ? 'push-pull (pin 13 HIGH)' : 'single-ended (pin 13 LOW)'], ['VCC', si(r.vcc, 'V')], ['REF', si(r.vref, 'V')], ['CT ramp', si(c0(r.vct), 'V')],
          ['DTC', si(c0(r.vdtc), 'V')], ['FEEDBACK', si(c0(r.vfb), 'V')], ['RT current', si(c0(r.irt), 'A')], ['Output current', `${si(c0(Math.abs(r.ic[0])), 'A')} / ${si(c0(Math.abs(r.ic[1])), 'A')}`]);
        if (r.irt > 1e-8) {
          const rt = r.peak / r.irt;
          L.push(`RT pin is held at ${si(r.peak, 'V')}: RT = ${si(r.peak, 'V')} ÷ ${si(r.irt, 'A')} = ${si(rt, 'Ω')}`);
          if (r.f) L.push(`CT = 1 ÷ (f × RT) = 1 ÷ (${si(r.f, 'Hz')} × ${si(rt, 'Ω')}) = ${si(1 / (r.f * rt), 'F')}`);
        }
        L.push('f = 1 ÷ (RT × CT). Push-pull: each output gets every 2nd ramp → f ÷ 2.', `Outputs run only while the CT ramp is above DTC + ${T.dtcOff} V and above FEEDBACK − ${T.pwmOff} V. DTC 0 V → ≈ 96 % max; DTC ≥ ${T.peak - T.dtcOff} V → off.`);
        if (!r.on) warn.push(['bad', `VCC ${si(r.vcc, 'V')}: needs 7–40 V. Outputs stay off.`]);
        if (r.vcc > T.vmax) warn.push(['bad', `VCC over ${T.vmax} V: the TL494 can be damaged.`]);
        if (r.on && r.irt < 1e-8) warn.push(['warn', 'No current from RT (pin 6): the oscillator is stopped. Put RT from pin 6 to GND.']);
        if (r.ic.some(x => Math.abs(x) > T.iout)) warn.push(['bad', `Output current over ${si(T.iout, 'A')}: drive a MOSFET / transistor, not the load.`]);
        if (r.iref > T.iref) warn.push(['warn', `REF gives ${si(r.iref, 'A')}: keep it under 10 mA.`]);
        if (r.f && r.f > 300e3) warn.push(['warn', 'Above ≈ 300 kHz the real TL494 cannot keep up.']);
        break;
      }
      case 'SR595': {
        const bits = (x) => [...Array(8)].map((_, k) => (x >> k) & 1).join('');
        vals.push(['Outputs QA…QH', r.en ? bits(r.q) : 'off (OE high or no power)', true], ['Shift register', bits(r.sr), true], ['VCC', si(r.v, 'V')], ['Inputs need', `HIGH ≥ ${si(r.hi, 'V')}, LOW ≤ ${si(r.lo, 'V')}`]);
        if (!r.pw) warn.push(['bad', 'No power: VCC (pin 16) and GND (pin 8).']);
        if (r.bad?.length) warn.push(['bad', `${r.bad.join(', ')}: voltage in the "don't know" zone between ${si(r.lo, 'V')} and ${si(r.hi, 'V')}. A 3.3 V board into a 74HC595 at 5 V does this: use a 74HCT595, or run the chip from 3.3 V.`]);
        if (r.pw && !r.mr) warn.push(['warn', 'SRCLR (pin 10) is LOW: the shift register is held cleared. Tie it to VCC.']);
        L.push('Bits go in at SER on every rising edge of SRCLK and march QA → QH → QH\' (into the next chip). Nothing changes on the outputs until RCLK rises: then all 8 (or 16, 24…) change together.');
        break;
      }
      case 'RMOD': {
        vals.push(['Relay', r.on ? '🔴 ON (COM–NO closed)' : 'OFF (COM–NC closed)', true], ['IN', si(r.vin, 'V'), true], ['Coil + LED current', si(r.i, 'A')], ['VCC', si(r.v, 'V')]);
        if (r.v < 4.2) warn.push([r.v < 3.5 ? 'bad' : 'warn', `VCC ${si(r.v, 'V')}: the 5 V relay needs ≈ 5 V (it may not pull in below ≈ 3.75 V).`]);
        if (q.trig !== 'high' && !r.on && r.vin > 2.6 && r.vin < r.v - 0.5) warn.push(['warn', `IN is ${si(r.vin, 'V')}: not LOW (relay ON) and not up at VCC either. A 3.3 V pin may not switch an active-LOW 5 V module OFF fully: drive it from a 5 V chip (74HCT595) or a transistor.`]);
        break;
      }
      case 'ENC': {
        vals.push(['Clicks', String(ENCS.get(p.id)?.pos ?? 0), true], ['CLK', si(r.vclk, 'V'), true], ['DT', si(r.vdt, 'V'), true], ['SW', si(r.vsw, 'V')], ['Supply', si(r.v, 'V')]);
        if (r.v < 2.5) warn.push(['bad', 'No power: connect + and GND (the CLK / DT pull-ups need it).']);
        L.push('Read it with an interrupt: attachInterrupt(digitalPinToInterrupt(CLK), isr, FALLING); in the ISR, DT HIGH = turned right, LOW = turned left.', 'UNO: only D2 and D3 have interrupts, so CLK goes on D2 (or D3).');
        break;
      }
      case 'OLED': {
        const ov = OLEDV.get(p.id) ?? {};
        vals.push(['Supply', si(r.v, 'V'), true], ['Current', si(r.i, 'A'), true], ['SDA', si(r.vsda, 'V')], ['SCL', si(r.vscl, 'V')]);
        if (r.v < 2.8) warn.push(['bad', 'No power: connect VCC (3.3 V or 5 V) and GND.']);
        else if (r.v > 5.5) warn.push(['bad', `${si(r.v, 'V')} is too much: 3.3–5 V only.`]);
        warn.push([ov.d ? 'ok' : 'warn', ov.note ?? 'No sketch is talking to this OLED.']);
        L.push('An OLED stays completely black until the sketch calls display.begin(...) and then display.display(). Nothing shows? Check the address (0x3C / 0x3D), SDA / SCL and that display() is called after drawing.', 'Each display() sends the whole 1 KB buffer: on a UNO keep it to a few per second; the ESP32 has room to spare.');
        break;
      }
      case 'LCD': {
        const lv = LCDV.get(p.id) ?? {};
        vals.push(['Supply', si(r.v, 'V'), true], ['Current', si(r.i, 'A'), true], ['SDA', si(r.vsda, 'V')], ['SCL', si(r.vscl, 'V')]);
        if (r.v < 4.0) warn.push([r.v < 2.5 ? 'bad' : 'warn', r.v < 2.5 ? 'No power: connect VCC and GND.' : `Only ${si(r.v, 'V')}: a 5 V LCD shows very faint text. Power it from 5 V (ESP32 VIN, UNO 5V).`]);
        warn.push([lv.lines ? 'ok' : 'warn', lv.note ?? 'No sketch is talking to this LCD.']);
        L.push('An LCD that only shows a row of boxes = powered but never initialised: wrong address, SDA / SCL swapped or not wired, or lcd.init() missing.', 'Text faint or invisible? Turn the blue contrast pot on the backpack.');
        break;
      }
      case 'SEG7': {
        const segs = r.segs ?? [], mx = Math.max(0, ...segs), on = segs.map((x, k) => x > 5e-4 ? 'abcdefg.'[k] : '').join('');
        vals.push(['Lit segments', on || '—', true], ['Max segment current', si(mx, 'A'), true], ['Total current', si(r.i, 'A')]);
        if (mx > 0.03) warn.push(['bad', `${si(mx, 'A')} in a segment: it burns out. Add 220–330 Ω per segment (or on the common pin).`]);
        else if (mx > 0.02) warn.push(['warn', 'Over 20 mA per segment: bright but hard on the display and the pins.']);
        L.push('Segments: a top, b top-right, c bottom-right, d bottom, e bottom-left, f top-left, g middle, dp dot.', 'One resistor on the common pin works, but the digit "1" (2 segments) is brighter than "8" (7 segments). One resistor per segment = even brightness.');
        break;
      }
      case 'XFMR': {
        vals.push(['Secondary', si(r.vs, 'V'), true], ['P1–CT', si(r.v1, 'V'), true], ['CT–P2', si(r.v2, 'V')], ['I secondary', si(r.is, 'A')], ['I P1', si(r.i1, 'A')], ['I P2', si(r.i2, 'A')],
          ['Magnetizing', si(r.im, 'A')], ['Power out', si(r.pout, 'W')]);
        L.push(`Volts follow turns: V secondary = V(P1–CT) × ${plain(q.ns)} ÷ ${plain(q.n1)} = × ${plain(+(q.ns / q.n1).toFixed(3))}`, 'Amps go the other way: the side with more turns carries less current (power in ≈ power out).',
          'A transformer only passes changing voltage (AC or switched DC). Steady DC just makes the magnetizing current climb: the core saturates and it overheats.', 'Dots: P1 and S1 go positive at the same moment.');
        if (Math.abs(r.im) > 5 * Math.max(0.1, Math.abs(r.i1) + Math.abs(r.i2))) warn.push(['warn', 'Magnetizing current is large compared to the load current: DC on the winding or the frequency is too low for this inductance.']);
        break;
      }
      case 'LAMP': {
        const b = r.p / q.wr;
        vals.push(['Brightness', pct(b, 0), true], ['Current', si(I, 'A'), true], ['Power', si(r.p, 'W')], ['Voltage', si(Math.abs(Vab), 'V')]);
        L.push(`Hot resistance = V² ÷ P = ${plain(q.vr)}² ÷ ${plain(q.wr)} = ${si(q.vr * q.vr / q.wr, 'Ω')}`);
        if (b > 1.2) warn.push(['bad', 'Over its rated voltage: it burns out quickly.']);
        break;
      }
      case 'VM': vals.push(['Reads', si(Vab, 'V'), true]); L.push('Voltmeter: + side (left pin) minus − side. 10 MΩ inside, like a real multimeter.'); break;
      case 'AM': vals.push(['Reads', si(r.i, 'A'), true]); L.push('Ammeter: current flowing in at the left pin. Put it IN the wire (in series), never across a battery.'); break;
      case 'C':
        vals.push(['Voltage', si(Vab, 'V'), true], ['Current', si(r.i, 'A'), true], ['Energy', si(r.energy, 'J')]);
        L.push(`Charge Q = C × V = ${si(q.c * Vab, 'C')}`, 'Current only flows while the voltage changes: i = C × dV/dt.');
        if (Math.abs(Vab) > q.vmax) warn.push(['bad', `Over its ${si(q.vmax, 'V')} rating: it can burst. Use a higher voltage capacitor (1.25× margin).`]);
        else if (Math.abs(Vab) > 0.8 * q.vmax) warn.push(['warn', `Close to its ${si(q.vmax, 'V')} rating.`]);
        if (q.polar && Vab < -0.5) warn.push(['bad', 'Electrolytic capacitor connected backwards (− side is higher): it heats up and can explode. Flip it.']);
        break;
      case 'L':
        vals.push(['Current', si(r.i, 'A'), true], ['Voltage', si(Vab, 'V'), true], ['Energy', si(r.energy, 'J')]);
        L.push(`Stored energy = ½ × L × I² = ${si(r.energy, 'J')}`, 'A coil fights changes in current. Switch it off suddenly and the voltage jumps (flyback spike): use a diode across it.');
        if (Math.abs(Vab) > 60) warn.push(['bad', `${si(Math.abs(Vab), 'V')} across the coil: a switch-off spike. It can kill transistors and MOSFETs. Add a flyback diode.`]);
        break;
      case 'SIG': {
        vals.push(['Output now', si(Vab, 'V'), true], ['Current', si(-r.i, 'A'), true], ['Frequency', si(q.f, 'Hz')], ['Period', si(1 / q.f, 's')]);
        if (q.wave === 'sine') L.push(`Sine: peak ${si(q.amp, 'V')}, peak-to-peak ${si(2 * q.amp, 'V')}, RMS = peak ÷ √2 = ${si(q.amp / Math.SQRT2, 'V')}`);
        if (q.wave === 'pwm') L.push(`PWM: ${q.duty} % high → average ${si(q.off + q.amp * q.duty / 100, 'V')}`);
        break;
      }
      case 'SCOPE': vals.push(['CH1 now', si(r.ch1, 'V'), true], ['CH2 now', si(r.ch2, 'V'), true]); break;
      case 'ZD': {
        const vz = -r.v, iz = -r.i, zq = S.zenerOf(q);
        if (r.state === 'rev') {
          vals.push(['Holds', si(vz, 'V'), true], ['Zener current', si(iz, 'A'), true], ['Power', si(c0(r.p), 'W'), true]);
          L.push(`P = Vz × Iz = ${plain(vz)} × ${plain(iz)} = ${si(c0(r.p), 'W')}`, 'The series resistor drops the rest: R = (Vin − Vz) ÷ (Iload + Iz).');
          warn.push(r.p > zq.pmax ? ['bad', `Over its ${zq.pmax} W rating: it will burn. Use a bigger series resistor or a ${zq.pmax < 1 ? '1 W' : '5 W'} zener.`] : iz < 0.002 ? ['warn', 'Under 2 mA: the voltage is soft (not well regulated). Aim for 5–20 mA.'] : r.p > 0.6 * zq.pmax ? ['warn', `Hot: ${pct(r.p / zq.pmax, 0)} of its rating.`] : ['ok', `Regulating at ${si(vz, 'V')}.`]);
        } else if (r.state === 'fwd') { vals.push(['Current', si(r.i, 'A'), true], ['Voltage', si(r.v, 'V'), true]); warn.push(['warn', 'Forward: it just acts like a normal diode (0.7 V). For regulation flip it: the bar (cathode) goes to +.']); }
        else { vals.push(['Voltage', si(vz, 'V'), true], ['Current', '0 A', true]); warn.push(['warn', vz > 0 ? `Below ${si(zq.vz, 'V')}: blocking, not regulating yet.` : 'Not conducting.']); }
        break;
      }
      case 'NPN': case 'PNP': {
        const m = S.BJTS[q.model] ?? S.BJTS[p.type === 'NPN' ? '2N2222' : '2N2907'], npn = p.type === 'NPN', st = { off: 'OFF', act: 'ACTIVE (partly on)', sat: 'SATURATED (fully on)', brk: 'BREAKDOWN' }[r.state];
        vals.push(['State', st, true], ['Base current', si(c0(r.ib), 'A'), true], ['Collector current', si(c0(r.ic), 'A'), true], [npn ? 'Vce' : 'Vec', si(c0(r.vce), 'V'), true], [npn ? 'Vbe' : 'Veb', si(c0(r.vbe), 'V')], ['Power (heat)', si(c0(r.p), 'W')]);
        L.push(`β (gain) ≈ ${m.beta}: Ic can be up to β × Ib = ${m.beta} × ${si(c0(r.ib), 'A')} = ${si(m.beta * r.ib, 'A')}`, `As a switch use Ib ≈ Ic ÷ 10 → base resistor ≈ (Vpin − ${m.vbe}) ÷ (Ic ÷ 10)`, `Heat = ${npn ? 'Vce' : 'Vec'} × Ic + ${npn ? 'Vbe' : 'Veb'} × Ib = ${si(c0(r.p), 'W')}`);
        if (r.state === 'off') warn.push(['ok', `OFF: no base current (needs ${npn ? 'B above E' : 'B below E'} by ${m.vbe} V).`]);
        if (r.state === 'sat') warn.push(['ok', `Fully ON: only ${si(c0(r.vce), 'V')} across it. Good switch.`]);
        if (r.state === 'act') { warn.push(['ok', `ACTIVE (amplifier mode): Vce ${si(c0(r.vce), 'V')}. Right for an amplifier; as a switch it would need more base current (smaller base resistor).`]); L.push(`Small signal: gm = Ic ÷ 26 mV = ${si(r.ic / 0.025852, 'S')}, input resistance at the base rπ = β ÷ gm = ${si(m.beta * 0.025852 / Math.max(r.ic, 1e-12), 'Ω')}`); }
        if (r.state === 'brk') warn.push(['bad', `BREAKDOWN: ${si(c0(r.vce), 'V')} is over its ${m.vmax} V rating. A coil switch-off spike? Add a flyback diode across the coil.`]);
        if (r.ic > m.imax) warn.push(['bad', `Collector current over ${si(m.imax, 'A')}: too much for a ${q.model}.`]);
        if (r.p > m.pmax) warn.push(['bad', `${si(c0(r.p), 'W')} heat: over ${m.pmax} W, it needs a heatsink or a bigger transistor.`]);
        if (r.ib > 0.012) warn.push(['warn', `Base current ${si(c0(r.ib), 'A')}: more than an MCU pin likes (ESP32 / Arduino ≈ 10–20 mA). Use a bigger base resistor or a Darlington / MOSFET.`]);
        break;
      }
      case 'NMOS': case 'PMOS': {
        const m = S.FETS[q.model] ?? S.FETS[p.type === 'NMOS' ? 'IRLZ44N' : 'AO3401'], nch = p.type === 'NMOS', st = { off: 'OFF', ohm: 'ON (fully on)', sat: 'PARTLY ON (gate too low)', brk: 'AVALANCHE' }[r.state];
        vals.push(['State', st, true], [nch ? 'Gate Vgs' : 'Gate Vsg', si(c0(r.vgs), 'V'), true], ['Drain current', si(c0(r.id), 'A'), true], [nch ? 'Vds' : 'Vsd', si(c0(r.vds), 'V'), true], ...(r.rds != null ? [['Rds(on)', si(r.rds, 'Ω')]] : []), ['Power (heat)', si(c0(r.p), 'W')]);
        L.push(`Threshold Vth ≈ ${m.vth} V (starts to turn on), fully on at ${m.vfull} V: Rds = ${si(m.rdson, 'Ω')}`);
        if (r.rds != null) L.push(`Heat = Id² × Rds = ${plain(r.id)}² × ${plain(r.rds)} = ${si(c0(r.id) * r.id * r.rds, 'W')}`);
        if (r.state === 'off') warn.push(['ok', `OFF: gate ${si(c0(r.vgs), 'V')} is below the ${m.vth} V threshold.`]);
        if (r.state === 'ohm') warn.push(r.vgs >= m.vfull * 0.9 ? ['ok', 'Fully ON. Good switch.'] : ['warn', `ON, but the gate is only ${si(c0(r.vgs), 'V')}: Rds ${si(r.rds, 'Ω')} instead of ${si(m.rdson, 'Ω')} (${m.vfull} V gate). ${m.logic ? 'OK for moderate current.' : 'Use a logic-level MOSFET (IRLZ44N, AO3400).'}`]);
        if (r.state === 'sat') warn.push(['bad', `NOT fully on: gate ${si(c0(r.vgs), 'V')} is too low for ${si(c0(r.id), 'A')}. It drops ${si(c0(r.vds), 'V')} and burns ${si(c0(r.p), 'W')}. Use a logic-level MOSFET or drive the gate with ${m.vfull} V.`]);
        if (r.state === 'brk') warn.push(['bad', `AVALANCHE: ${si(c0(r.vds), 'V')} is over its ${m.vmax} V rating (coil switch-off spike). Add a flyback diode across the coil.`]);
        if (r.body) warn.push(['warn', 'Body diode is conducting (current flowing backwards through the MOSFET).']);
        if (Math.abs(r.vgs) > 20) warn.push(['bad', 'Gate over ±20 V: it can punch through. Clamp it with a zener.']);
        if (r.id > m.imax) warn.push(['bad', `Drain current over ${si(m.imax, 'A')}.`]);
        if (r.p > m.pmax) warn.push(['bad', `${si(c0(r.p), 'W')} heat: needs a heatsink (about ${m.pmax} W without one).`]);
        break;
      }
      case 'OPAMP': {
        const m = S.AMPS[q.model] ?? S.AMPS.LM358, st = { lin: 'LINEAR', high: 'OUTPUT HIGH (at the top)', low: 'OUTPUT LOW (at the bottom)' }[r.state];
        vals.push(['Output', si(r.vout, 'V'), true], ['Input + minus −', si(c0(r.vdiff), 'V'), true], ['State', st, true], ['Supply', si(r.vsup, 'V')], ['Output current', si(c0(r.iout), 'A')]);
        L.push(`Vout = gain × (V+ − V−), gain ≈ ${si(m.a, '')}: a tiny difference swings the output to a rail.`, 'With negative feedback (output → − input) it keeps both inputs equal: amplifier.', 'Without feedback it is a comparator: + higher → output HIGH, − higher → output LOW.', `${q.model}: output reaches ${m.dl < 0.1 ? 'the bottom rail' : `${m.dl} V above the bottom`} and ${m.dh < 0.1 ? 'the top rail' : `${m.dh} V below the top`}.`);
        if (r.vsup < 3) warn.push(['bad', 'Not powered: wire V+ (top pin) to + and V− (bottom pin) to ground or the − supply.']);
        if (r.vsup > m.vmax) warn.push(['bad', `Supply ${si(r.vsup, 'V')} is over its ${m.vmax} V maximum.`]);
        if (Math.abs(r.iout) > m.iout) warn.push(['warn', `Output current ${si(Math.abs(r.iout), 'A')}: op-amps only drive a few mA. Add a transistor for loads.`]);
        break;
      }
      case 'REG': {
        const m = S.REGS[q.model] ?? S.REGS['7805'], st = { reg: 'REGULATING', drop: 'DROPOUT (input too low)', lim: 'CURRENT LIMIT', off: 'OFF' }[r.state];
        vals.push(['Output', si(r.vout, 'V'), true], ['Load current', si(c0(r.iout), 'A'), true], ['Heat', si(c0(r.p), 'W'), true], ['Input', si(r.vin, 'V')], ['State', st]);
        L.push(`Heat = (Vin − Vout) × I = ${plain(r.vio)} × ${plain(r.iout)} = ${si(c0(r.p), 'W')}  (a linear regulator burns the difference)`, `Needs Vin ≥ ${m.adj ? 'Vout' : si(m.vout, 'V')} + ${m.drop} V`);
        if (m.adj) L.push('Vout = 1.25 V × (1 + R2 ÷ R1) + 50 µA × R2');
        if (r.state === 'reg') warn.push(['ok', `Steady ${si(r.vout, 'V')}.`]);
        if (r.state === 'drop') warn.push(['bad', `Input too low: needs at least ${m.drop} V more than the output. Output sags to ${si(r.vout, 'V')}.`]);
        if (r.state === 'lim') warn.push(['bad', `Overload: current limit ${si(m.ilim, 'A')} (short or too heavy a load).`]);
        if (r.state === 'off') warn.push(['warn', 'Off: no input, or something else pushes the output higher.']);
        if (r.vin > m.vinmax) warn.push(['bad', `Input over ${m.vinmax} V maximum.`]);
        if (r.p > 15) warn.push(['bad', 'Way too much heat for a linear regulator: use a buck converter (LM2596, MP1584).']);
        else if (r.p > 1) warn.push(['warn', `${si(c0(r.p), 'W')} of heat: needs a heatsink (bare TO-220 handles ≈ 1 W). A buck converter wastes much less.`]);
        if (m.adj && r.iout < 0.0095) warn.push(['warn', 'LM317 needs ≥ 10 mA load or the output creeps up. Use R1 = 120–240 Ω.']);
        break;
      }
      case 'SERVO': {
        const m = S.SERVOS[q.model] ?? S.SERVOS.SG90;
        vals.push(['Angle', `${Math.round(r.ang)}°`, true], ['Pulse width', r.w ? si(r.w, 's') : '—', true], ['Target', `${Math.round(r.tgt)}°`], ['Supply', si(r.vcc, 'V')], ['Current now', si(c0(r.icc), 'A')]);
        L.push('Angle = (pulse − 0.5 ms) ÷ 2 ms × 180°', `${q.model}: about ${si(m.run, 'A')} while moving, up to ${si(m.stall, 'A')} when blocked (stall).`, 'Power it from 5 V (VIN / USB or a 5–6 V supply), not from the 3.3 V pin. Common GND with the board.');
        if (!r.w) warn.push(['warn', 'No valid pulse yet: give SIG a 50 Hz PWM with 2.5–12.5 % duty (0.5–2.5 ms).']);
        if (r.vcc < m.vmin) warn.push(['bad', `Supply ${si(r.vcc, 'V')} is too low (needs ${m.vmin}–${m.vmax} V): it jitters or doesn't move.`]);
        if (r.vcc > m.vmax) warn.push(['bad', `Supply over ${m.vmax} V: it can burn.`]);
        if (m.stall > 0.5) warn.push(['warn', `Stall current ${si(m.stall, 'A')}: use a separate 5–6 V supply that can give it, not the USB pin.`]);
        break;
      }
      case 'STEPPER': {
        vals.push(['Speed', `${Math.round(Math.abs(r.rpm))} RPM ${r.rpm < 0 ? '(reverse)' : ''}`, true], ['Steps counted', String(r.n), true], ['Shaft angle', `${r.ang.toFixed(1)}°`], ['Driver', r.en ? 'ON' : 'OFF'], ['VMOT', si(r.vmot, 'V')], ['Motor supply current', si(c0(r.imot), 'A')]);
        L.push(`Step angle = 360° ÷ ${q.steps} ÷ ${q.micro} = ${(360 / q.steps / q.micro).toFixed(3)}°`, `RPM = step rate × 60 ÷ (${q.steps} × ${q.micro})`, 'Current limit: Vref = I × 8 × Rsense (Rsense often 0.1 Ω → Vref = 0.8 × I). Measure Vref on the trimpot.');
        if (!r.en) warn.push(['warn', r.vdd < 3 ? 'No logic power on VDD (3–5.5 V).' : r.vmot < 8 ? 'VMOT below 8 V: the A4988 shuts down.' : 'EN is HIGH: driver off (motor free).']);
        if (r.vmot > 35) warn.push(['bad', 'VMOT over 35 V: the A4988 can be destroyed.']);
        if (q.ilim > 1.2) warn.push(['warn', 'Above about 1.2 A the A4988 needs a heatsink and a fan.']);
        if (Math.abs(r.rpm) > 600 / q.micro && q.micro <= 2) warn.push(['warn', 'Very fast for full / half step: a real motor may stall. Ramp the speed up.']);
        break;
      }
      case 'ESP32': case 'UNO': {
        const B = S.BOARDS[p.type], cur = boardPin(p), pin = B.pins.find(x => x.n === cur), pr0 = r.pins[cur] ?? { v: 0, i: 0, mode: 'in' };
        const ma = (v) => si(c0(v), 'A');
        if (pin.k === 'gpio') {
          const isIn = /in|pu|pd|adc/.test(pr0.mode);
          vals.push([`${cur} voltage`, si(c0(pr0.v), 'V'), true], [pr0.i >= 0 ? 'Current out' : 'Current in', ma(Math.abs(pr0.i)), true]);
          if (isIn) {
            const lv = pr0.v >= B.vih ? 'HIGH (1)' : pr0.v <= B.vil ? 'LOW (0)' : 'UNDEFINED';
            if (pr0.mode !== 'adc') vals.push(['digitalRead', lv, true]);
            if (pr0.mode === 'adc') { const full = 2 ** B.adcBits - 1, val = Math.round(Math.max(0, Math.min(1, pr0.v / B.adcRef)) * full); vals.push(['analogRead', `${val} / ${full}`, true]); L.push(`analogRead = V ÷ ${B.adcRef} V × ${full} = ${plain(pr0.v)} ÷ ${B.adcRef} × ${full} = ${val}`); if (p.type === 'ESP32') L.push('Real ESP32 ADC is not very linear near 0 V and above ≈ 3.1 V (11 dB attenuation).'); }
            if (lv === 'UNDEFINED' && pr0.mode !== 'adc') warn.push(['warn', `${plain(pr0.v)} V is between LOW (< ${B.vil} V) and HIGH (> ${B.vih} V): the reading can flicker.`]);
            if (pr0.mode === 'in' && Math.abs(pr0.v) < 1e-3 && Math.abs(pr0.i) < 1e-9) warn.push(['warn', 'Input with nothing driving it is "floating": it reads random values. Use INPUT_PULLUP or an external resistor.']);
          } else {
            const pmax = B.imax / 1000, prec = B.irec / 1000;
            L.push(`Output ${pr0.mode === 'pwm' ? 'PWM' : pr0.mode.toUpperCase()}: about ${B.rout} Ω inside, so the voltage sags with current: ${B.vcc} V − I × ${B.rout} Ω.`);
            if (Math.abs(pr0.i) > pmax) warn.push(['bad', `${ma(Math.abs(pr0.i))} is over the ${B.imax} mA absolute max: the pin can be damaged. Use a transistor / MOSFET.`]);
            else if (Math.abs(pr0.i) > prec) warn.push(['warn', `${ma(Math.abs(pr0.i))}: above the ${B.irec} mA recommended. OK for a moment, not for always.`]);
            else warn.push(['ok', `${ma(Math.abs(pr0.i))}: fine for a pin (≤ ${B.irec} mA).`]);
          }
          if (pr0.v > B.vcc + 0.3) warn.push(['bad', `${si(pr0.v, 'V')} on a ${B.vcc} V pin: this kills it. Use a voltage divider or a level shifter.`]);
          if (pr0.v < -0.3) warn.push(['bad', 'Negative voltage on a pin: it can be damaged.']);
          if (pin.strap && pr0.mode !== 'in') warn.push(['warn', `${pin.label} is a boot strapping pin: what is connected can stop the ESP32 from booting / flashing.${pin.g === 12 ? ' GPIO12 HIGH at boot = wrong flash voltage.' : pin.g === 0 ? ' GPIO0 LOW at boot = download mode.' : ''}`]);
          if (pin.serial) warn.push(['warn', 'Used by USB serial (upload / Serial.print): avoid for other things.']);
          if (pin.adc === 'ADC2' && pr0.mode === 'adc') warn.push(['warn', 'ADC2 pins can\'t read analog while WiFi is on: use ADC1 (GPIO32–39).']);
        } else if (pin.k === 'pwr') {
          vals.push([`${cur} voltage`, si(pr0.v, 'V'), true], ['Current out', ma(pr0.i), true], ['Max', si(pin.imax, 'A')]);
          if (pr0.i > pin.imax) warn.push(['bad', `Over ${si(pin.imax, 'A')} from ${cur}: use a separate supply for big loads.`]);
        } else vals.push([`${cur}`, si(c0(pr0.v), 'V'), true]);
        // all pins in use
        const used = B.pins.filter(x => x.k !== 'gnd' && x.k !== 'nc' && (x.k === 'pwr' ? Math.abs(r.pins[x.n].i) > 1e-6 : x.k === 'gpio' && ((q.pins?.[x.n]?.mode ?? 'in') !== 'in' || Math.abs(r.pins[x.n].v) > 0.01)));
        if (used.length) L.push('', 'Pins in use:', ...used.map(x => { const z = r.pins[x.n]; return `${x.n.padEnd(5)} ${(MODE_SHORT[z.mode] ?? z.mode).padEnd(9)} ${si(c0(z.v), 'V').padStart(9)}  ${si(c0(z.i), 'A').padStart(9)}`; }));
        break;
      }
      case 'T555': {
        const m = S.TIMERS[q.model] ?? S.TIMERS.NE555;
        vals.push(['Output', r.q ? `HIGH ${si(r.vout, 'V')}` : `LOW ${si(r.vout, 'V')}`, true], ['Supply Vcc', si(r.vcc, 'V'), true], ['TRIG (pin 2)', si(c0(r.vtrig), 'V')], ['THR (pin 6)', si(c0(r.vthr), 'V')], ['Output current', si(c0(r.iout), 'A')], ['Power', si(c0(r.p), 'W')]);
        L.push(`Switch points: ⅓ Vcc = ${si(r.vlo, 'V')} (TRIG) and ⅔ Vcc = ${si(r.vhi, 'V')} (THR)`, 'Monostable (one pulse): t = 1.1 × R × C', 'Astable (blinks): f = 1.44 ÷ ((R1 + 2·R2) × C), high time 0.693·(R1+R2)·C, low time 0.693·R2·C', 'Power-on delay: C from Vcc to TRIG+THR, R to ground → output goes HIGH after t ≈ 1.1 × R × C');
        if (r.vcc < m.vmin) warn.push(['warn', `Supply ${si(r.vcc, 'V')} is below the ${m.vmin} V minimum: not running.`]);
        if (r.vcc > m.vmax) warn.push(['bad', `Supply over ${m.vmax} V: the ${q.model} can be damaged.`]);
        if (Math.abs(r.iout) > m.iout) warn.push(['bad', `Output current ${si(Math.abs(r.iout), 'A')} is over ${si(m.iout, 'A')}: drive a transistor / MOSFET for bigger loads.`]);
        break;
      }
      case 'RELAY': {
        const rq = S.relayOf(q), inom = rq.vcoil / rq.rcoil;
        vals.push(['Contacts', r.on ? 'ON (COM → NO)' : 'OFF (COM → NC)', true], ['Coil current', si(Math.abs(r.icoil), 'A'), true], ['Coil voltage', si(Math.abs(r.v), 'V'), true], ['Contact current', si(Math.abs(r.icon), 'A')], ['Coil power', si(c0(r.p), 'W')]);
        L.push(`Rated coil current = ${rq.vcoil} V ÷ ${plain(rq.rcoil)} Ω = ${si(inom, 'A')}`, `Pulls in at ≥ ${si(0.75 * inom, 'A')} (75 %), lets go under ${si(0.3 * inom, 'A')} (30 %)`, 'Never drive a coil straight from an ESP32 / Arduino pin: use a transistor or MOSFET + flyback diode.');
        if (Math.abs(r.v) > 1.3 * rq.vcoil) warn.push(['bad', Math.abs(r.v) > 3 * rq.vcoil ? `${si(Math.abs(r.v), 'V')} across the coil: switch-off spike! Add a flyback diode across the coil.` : 'Coil over-voltage: it overheats.']);
        if (Math.abs(r.icon) > 10) warn.push(['bad', 'Contact current over 10 A (typical relay rating).']);
        if (!r.on && Math.abs(r.icoil) > 0.3 * inom) warn.push(['warn', 'Coil current too low to pull in: check the driver / supply voltage.']);
        break;
      }
      case 'OPTO': {
        const st = { off: 'OFF', act: 'ACTIVE (current-limited)', sat: 'SATURATED (fully on)' }[r.state];
        vals.push(['LED current If', si(r.ifw, 'A'), true], ['Collector Ic', si(r.ic, 'A'), true], ['Vce', si(r.vce, 'V'), true], ['State', st]);
        L.push(`Max Ic = CTR × If = ${q.ctr} % × ${si(r.ifw, 'A')} = ${si(r.ifw * q.ctr / 100, 'A')}`, 'LED side and transistor side are joined only by light: isolation up to 5 kV.');
        if (r.ifw > 0.05) warn.push(['bad', 'LED current over 50 mA: the PC817 LED burns. Use a bigger series resistor.']);
        else if (r.on && r.ifw < 0.001) warn.push(['warn', 'Weak drive (under 1 mA): the output may not switch fully. Aim for 5–10 mA.']);
        if (r.state === 'sat') warn.push(['ok', 'Saturated: the output is fully ON (good for switching).']);
        if (r.state === 'act') warn.push(['warn', 'Not saturated: the load wants more current than CTR × If. Increase If or use a bigger pull-up resistor.']);
        if (r.vce > 35) warn.push(['bad', 'Vce over 35 V: above the PC817 rating.']);
        break;
      }
    }
    return readings(vals, L, warn);
  }

  function summary() {
    const box = el('div');
    if (!res.ok) { box.append(el('p', { class: 'flag ' + (res.stopped ? 'warn' : 'bad'), text: res.error })); panel.append(box); return; }
    box.append(readings([[timeMode() ? 'Power now' : 'Power from sources', si(res.delivered, 'W'), true], ...(timeMode() ? [['Time', si(sim.t, 's', 4)]] : []), ['Parts', String(c.parts.length)], ['Wires', String(c.wires.length)]], [],
      res.notes.map(t => [/SHORT/.test(t) ? 'bad' : 'warn', t])));
    const crooked = c.wires.filter(w => w.x1 !== w.x2 && w.y1 !== w.y2).length;
    if (crooked) box.append(el('div', { class: 'row wrap' }, el('button', { class: 'btn primary', type: 'button', text: `⌐ Straighten ${crooked} crooked wire${crooked > 1 ? 's' : ''}`, onclick: () => { const n = straightenAll(); commit(); say(`${n} wire${n > 1 ? 's' : ''} turned into L shapes.`); } })));
    box.append(note('Tap a part or wire for its voltage, current and power. Drag a label or a wire to tidy up. Wire colors: <b style="color:#3DDC84">green = +</b>, grey = 0 V, <b style="color:#FF6B6B">red = −</b>. Yellow dots = current flow.'));
    panel.append(box);
  }

  // ---------- 📲 share: the whole project packed into a link (+ QR code). No server: the data is in the link itself ----------
  const b64u = (u8) => { let t = ''; for (let i = 0; i < u8.length; i += 0x8000) t += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = (t) => { const b = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
  async function packCircuit(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (globalThis.CompressionStream) { try { return 'z' + b64u(new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer())); } catch { } }
    return 'j' + b64u(raw);
  }
  async function unpackCircuit(t) {
    const u = unb64u(t.slice(1));
    const bytes = t[0] === 'z' ? new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()) : u;
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  async function share() {
    const data = await packCircuit(c), url = location.origin + location.pathname + '#schematic?c=' + data;
    let qrEl;
    try {
      const q = qrcode(0, 'L'); q.addData(url); q.make();
      const n = q.getModuleCount(), cell = Math.max(2, Math.floor(320 / (n + 8))), cv = el('canvas', { class: 'qr' });
      cv.width = cv.height = (n + 8) * cell;
      const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, cv.width, cv.height); x.fillStyle = '#000';
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect((k + 4) * cell, (r + 4) * cell, cell, cell);
      qrEl = el('div', { class: 'qr-box' }, cv, note(n > 120 ? 'Big circuit = dense QR: hold the phone close and steady.' : 'Scan with any phone camera.'));
    } catch { qrEl = note(`Too big for a QR code (${url.length} characters). Send the link instead.`); }
    const inp = el('input', { class: 'num', value: url, readonly: true, onfocus: (e) => e.target.select() });
    const copyB = el('button', { class: 'btn primary', type: 'button', text: '📋 Copy link', onclick: async () => { try { await navigator.clipboard.writeText(url); copyB.textContent = '✔ Copied'; } catch { inp.select(); } } });
    const shareB = navigator.share ? el('button', { class: 'btn', type: 'button', text: '📤 Send…', onclick: () => navigator.share({ title: `Fox9nertron: ${c.title ?? 'circuit'}`, url }).catch(() => { }) }) : null;
    const d = el('dialog', { class: 'dlg' }, el('div', { class: 'dlg-title2', text: '📲 Share this circuit' }),
      el('div', { class: 'share-box' }, qrEl, inp, el('div', { class: 'row wrap' }, copyB, shareB),
        note(`The link holds everything: circuit, sketch (💻 Code) and the PCB layout (${(url.length / 1024).toFixed(1)} KB). Nothing is uploaded. Whoever opens it gets their own copy; their current circuit is kept in Projects.`)),
      el('form', { method: 'dialog', class: 'dlg-buttons' }, el('button', { class: 'btn', text: 'Close' })));
    document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal();
  }
  async function openShared() {
    const m = /[?&]c=([A-Za-z0-9_-]+)/.exec(location.hash); if (!m) return;
    history.replaceState(null, '', location.pathname + location.search + '#schematic');
    let j; try { j = await unpackCircuit(m[1]); if (!j || !Array.isArray(j.parts)) throw new Error('no circuit'); } catch (e) { say('This share link is broken or cut off (' + e.message + ').'); return; }
    let kept = '';
    if (c.parts.length) { const a = projStore.all(), d0 = new Date(), nm = `Before shared link ${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, '0')}-${String(d0.getDate()).padStart(2, '0')} ${String(d0.getHours()).padStart(2, '0')}:${String(d0.getMinutes()).padStart(2, '0')}`; a[nm] = { json: JSON.stringify(c), t: Date.now() }; projStore.save(a); kept = ` Your previous circuit is saved in Projects as "${nm}".`; }
    if (view2 === 'pcb') setView('sch');
    loadCircuit(j, `📲 Opened a shared circuit${j.title ? ': ' + j.title : ''}.${kept}`);
  }

  // ---------- projects ----------
  const projStore = {
    all() { try { return JSON.parse(store.get('sch.projects', '{}')) || {}; } catch { return {}; } },
    save(all) { store.set('sch.projects', JSON.stringify(all)); },
  };
  function dialog(title, items, onPick, extra) {
    const d = el('dialog', { class: 'dlg' }, el('div', { class: 'dlg-title2', text: title }), extra ?? null,
      el('div', { class: 'dlg-items' }, items.map((t, i) => el('button', { class: 'dlg-it', type: 'button', text: t, onclick: () => { d.close(); onPick(i); } }))),
      el('form', { method: 'dialog', class: 'dlg-buttons' }, el('button', { class: 'btn', text: 'Close' })));
    document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal();
    return d;
  }
  globalThis.__schDbg = { c: () => c, res: () => res, sim, sketches };     // for automated tests
  function loadCircuit(j, msg) { const added = registerLib(j.lib, true); if (added) msg += ` Added ${added} part${added > 1 ? 's' : ''} from the file to your parts (★).`; c = j; resetSim(); sel = null; probes = []; if (S.isDynamic(c)) { autoTimeQuiet(); autoSpeed(); } if (!running) msg += ' Tap ▶ Run to simulate.'; hist.length = 0; hist.push(JSON.stringify(c)); hi = 0; fit(); commit(false); setMode('select'); say(msg); }
  function examples() {
    const ex = [['led', 'LED + resistor + switch (9 V)'], ['divider', 'Voltage divider with voltmeter'], ['bridge', 'Wheatstone bridge'], ['esp32', 'Solenoid coil + push button + flyback diode (12 V)'], ['dpdt', 'DPDT switch reversing a DC motor'], ['rc', '📈 RC filter: square wave charging a capacitor'], ['pwmled', '📈 PWM dimming an LED'], ['flyback', '📈 Coil switch-off spike + flyback diode (hold the button, let go)'], ['rectifier', '📈 Bridge rectifier + filter capacitor (ripple)'], ['opto', '📈 PC817: ESP32 PWM switching a 12 V line'], ['relay', '📈 ESP32 → 2N2222 → 12 V relay → lamp (flip GPIO)'], ['mosfet', '📈 ESP32 PWM → IRLZ44N MOSFET → 12 V solenoid'], ['reg7805', '7805 regulator: 12 V → 5 V (heat)'], ['lm317', 'LM317 adjustable regulator (5 V)'], ['zener', 'Zener diode 5.1 V reference'], ['preamp', '📈 Transistor audio preamp (BC547, gain ≈ 100)'], ['delay555', '📈 555 power-on delay (flip POWER, LED after ≈ 1.1 s)'], ['buck', '📈 DC-DC buck converter 30 V → 12 V (PWM duty sets Vout)'], ['buckreg', '📈 Regulated buck 0–30 V → 0–20 V (like XL4015 / LM2596, flip POWER)'], ['inverter', '📈 Inverter 12 V DC → 220 V AC (push-pull, 50 Hz)'], ['smps', '📈 Switching power supply 220 V AC → 5 V (flyback + opto feedback)'], ['fridge', '📈 Fridge / aircon guard: 4-min restart delay (flip MAINS)'], ['esp32io', 'ESP32 pins: LED output, button with pull-up, pot on the ADC'], ['lcd', '💻 ESP32 + LCD 16×2 I2C shows the pot voltage (code runs)'], ['oled', '💻 ESP32 + OLED 128×64 SSD1306: text, bar + live graph of the pot (code runs)'], ['encoder', '🎛 Rotary encoder menu: ESP32 interrupt + OLED + LED (turn + push the knob)'], ['sr595sig', '📈 74HC595 by hand: signal generators feed SER (data) + SRCLK (clock), 8 LEDs'], ['relay10', '🔌 10 relay modules on 3 wires: ESP32 + two 74HC595 in a chain (type commands in Serial)'], ['seg7', '💻 UNO counts 0–9 on a 7-segment display (code runs)'], ['thermo', '💻 ESP32 + DHT22 thermostat: fan LED above 30 °C (slide the temperature)'], ['parking', '💻 UNO + HC-SR04 parking sensor: LED under 20 cm (slide the distance)'], ['autolight', '💻 UNO + LDR auto light: darker = brighter LED (slide the light)'], ['doorlock', '🔐 Keypad door lock: ESP32 + keypad + LCD + buzzer + 12 V solenoid (PIN 1234 #)'], ['unoio', 'Arduino UNO pins: LED on D13, button on D2, pot on A0'], ['servo', '📈 Servo on ESP32 PWM (change D18 duty: 2.5–12.5 %)'], ['stepper', '📈 Stepper + A4988 from ESP32 (STEP / DIR)'], ['comparator', '📈 Op-amp comparator: triangle vs pot → PWM'], ['tl494pwm', '📈 TL494 PWM: 10 kHz lamp dimmer with a MOSFET (turn DUTY)'], ['tl494inv', '📈 TL494 push-pull inverter 12 V → 220 V AC 50 Hz (turn POWER)']];
    dialog('Examples', ex.map(e => e[1]), i => loadCircuit(S.example(ex[i][0]), `Loaded: ${ex[i][1]}.`));
  }
  function projects() {
    const all = projStore.all(), names = Object.keys(all).sort((a, b) => all[b].t - all[a].t);
    dialog('Schematic projects', ['Save as…', ...names.map(n => `Open: ${n}`), 'Delete a project…', 'New (empty)', 'Export file (backup)', 'Import file…', 'Save picture (PNG)'], i => {
      if (i === 0) {
        const name = prompt2('Name for this circuit', c.title ?? '', (n) => { n = n.trim().slice(0, 40); if (!n) return; c.title = n; const a = projStore.all(); a[n] = { json: JSON.stringify(c), t: Date.now() }; projStore.save(a); say(`Saved "${n}".`); });
        return name;
      }
      if (i <= names.length) { const n = names[i - 1]; loadCircuit(JSON.parse(all[n].json), `Opened "${n}".`); return; }
      const k = i - names.length;
      if (k === 1) { if (!names.length) return say('No saved projects.'); dialog('Delete which?', names, j => { const a = projStore.all(); delete a[names[j]]; projStore.save(a); say(`Deleted "${names[j]}".`); }); }
      else if (k === 2) loadCircuit(S.newCircuit(), 'Empty circuit. Add parts from the tray.');
      else if (k === 3) shareFile(`${c.title ?? 'circuit'}.f9t.json`, JSON.stringify(c), 'application/json');
      else if (k === 4) { const f = el('input', { type: 'file', accept: '.json,application/json' }); f.onchange = async () => { const file = f.files[0]; if (!file) return; try { const j = JSON.parse(await file.text()); if (!Array.isArray(j.parts)) throw 0; loadCircuit(j, `Imported ${file.name}.`); } catch { say("That file isn't a Fox9nertron circuit."); } }; f.click(); }
      else if (k === 5) savePng();
    });
  }
  function prompt2(title, value, onOk) {
    const inp = el('input', { class: 'num wide', value });
    const d = el('dialog', { class: 'dlg' }, el('div', { class: 'dlg-title2', text: title }), el('div', { class: 'dlg-pad' }, inp),
      el('div', { class: 'dlg-buttons' }, el('button', { class: 'btn', type: 'button', text: 'Cancel', onclick: () => d.close() }), el('button', { class: 'btn primary', type: 'button', text: 'Save', onclick: () => { d.close(); onOk(inp.value); } })));
    document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal(); inp.focus();
  }
  async function shareFile(name, text, mime) {
    const blob = text instanceof Blob ? text : new Blob([text], { type: mime });
    try { const file = new File([blob], name, { type: mime }); if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) { await navigator.share({ files: [file] }); return; } } catch (e) { if (e?.name === 'AbortError') return; }
    const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
    say(`Saved ${name}.`);
  }
  function savePng() {
    const keep = { ...view }, keepSel = sel, keepMode = mode, real = ctx, realW = W, realH = H;
    sel = null; mode = 'select';
    const dpr = 2, w = 1400, h = 1000;
    const oc = document.createElement('canvas'); oc.width = w * dpr; oc.height = h * dpr;
    ctx = oc.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = w; H = h; fit(); draw();
    ctx = real; W = realW; H = realH; Object.assign(view, keep); sel = keepSel; mode = keepMode; draw();
    oc.toBlob(b => shareFile(`${c.title ?? 'circuit'}.png`, b, 'image/png'), 'image/png');
  }

  // Learn tab: "Open in Schematic"
  addEventListener('f9t-example', (e) => { if (view2 === 'pcb') setView('sch'); loadCircuit(S.example(e.detail), 'Loaded from Learn: ' + e.detail + '.'); });
  // ---------- start ----------
  syncTop(); setMode('select');
  new ResizeObserver(() => resize()).observe(wrap);
  addEventListener('resize', () => resize());
  requestAnimationFrame(() => { resetSim(); resize(); commit(false); if (store.get('sch.view', 'sch') === 'pcb') setView('pcb'); openShared(); });
  addEventListener('hashchange', () => openShared());
}

// ---------- symbols (local grid units, pin a at left) ----------
function symbol(ctx, p, r, g) {
  const q = p.props;
  const L = (...pts) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); };
  const T = (txt, x, y, size = 0.75, col = C.part) => { ctx.save(); ctx.translate(x, y); ctx.rotate(-(p.rot || 0) * Math.PI / 2); ctx.scale(1 / g, 1 / g); ctx.fillStyle = col; ctx.font = `700 ${size * g}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 0); ctx.restore(); };
  ctx.strokeStyle = C.part; ctx.fillStyle = C.part;
  switch (p.type) {
    case 'R': L(-2, 0, -1.2, 0, -1, -0.45, -0.6, 0.45, -0.2, -0.45, 0.2, 0.45, 0.6, -0.45, 1, 0.45, 1.2, 0, 2, 0);
      if (r && q.rating && r.p > q.rating) { ctx.strokeStyle = '#FF6B6B'; L(-1.2, 0, -1, -0.45, -0.6, 0.45, -0.2, -0.45, 0.2, 0.45, 0.6, -0.45, 1, 0.45, 1.2, 0); }
      break;
    case 'POT': L(-2, 0, -1.2, 0, -1, -0.45, -0.6, 0.45, -0.2, -0.45, 0.2, 0.45, 0.6, -0.45, 1, 0.45, 1.2, 0, 2, 0);
      { const x = -1.2 + 2.4 * q.pos / 100; L(0, -2, 0, -1.3, x, -1.3, x, -0.65); ctx.beginPath(); ctx.moveTo(x, -0.5); ctx.lineTo(x - 0.25, -0.85); ctx.lineTo(x + 0.25, -0.85); ctx.closePath(); ctx.fill(); }
      break;
    case 'BAT': L(-2, 0, -0.25, 0); L(0.25, 0, 2, 0); ctx.lineWidth *= 1.4; L(-0.25, -0.9, -0.25, 0.9); ctx.lineWidth *= 1.6; L(0.25, -0.45, 0.25, 0.45);
      T('+', -0.9, -0.65, 0.8, '#3DDC84'); T('−', 0.9, -0.65, 0.8, '#FF6B6B'); break;
    case 'ISRC': L(-2, 0, -0.85, 0); L(0.85, 0, 2, 0); ctx.beginPath(); ctx.arc(0, 0, 0.85, 0, 7); ctx.stroke(); L(-0.5, 0, 0.45, 0); L(0.15, -0.3, 0.5, 0, 0.15, 0.3); break;
    case 'SW': L(-2, 0, -1, 0); L(1, 0, 2, 0); ctx.beginPath(); ctx.arc(-1, 0, 0.14, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(1, 0, 0.14, 0, 7); ctx.fill();
      if (q.on) L(-1, 0, 1, -0.05); else L(-1, 0, 0.85, -0.85); break;
    case 'SPDT': case 'DPDT': {
      const pole = (cy) => {
        L(-2, cy, -1, cy); L(1, cy - 1, 2, cy - 1); L(1, cy + 1, 2, cy + 1);
        for (const [x, y] of [[-1, cy], [1, cy - 1], [1, cy + 1]]) { ctx.beginPath(); ctx.arc(x, y, 0.14, 0, 7); ctx.fill(); }
        L(-1, cy, 0.95, q.on ? cy + 0.92 : cy - 0.92);
      };
      if (p.type === 'SPDT') pole(0);
      else { pole(-2); pole(2); ctx.save(); ctx.setLineDash([0.18, 0.18]); L(0, q.on ? -1.5 : -2.5, 0, q.on ? 2.5 : 1.5); ctx.restore(); }
      break;
    }
    case 'PB': L(-2, 0, -1, 0); L(1, 0, 2, 0); ctx.beginPath(); ctx.arc(-1, 0, 0.14, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(1, 0, 0.14, 0, 7); ctx.fill();
      { const y = q.on ? -0.12 : -0.55; L(-1.05, y, 1.05, y); L(0, y, 0, -1.2); L(-0.35, -1.2, 0.35, -1.2); } break;
    case 'LED': case 'D': {
      const lit = p.type === 'LED' && r?.on && Math.abs(r.i) > 1e-4;
      const col = p.type === 'LED' ? (S.LED_COLORS[q.color]?.hex ?? '#FF3B30') : C.part;
      if (lit) { const a = Math.min(1, 0.35 + Math.abs(r.i) / q.imax * 0.65); const gr = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 1.6); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); ctx.globalAlpha *= a; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, 7); ctx.fill(); ctx.globalAlpha /= a; }
      L(-2, 0, -0.55, 0); L(0.55, 0, 2, 0);
      ctx.beginPath(); ctx.moveTo(-0.55, -0.6); ctx.lineTo(0.55, 0); ctx.lineTo(-0.55, 0.6); ctx.closePath();
      ctx.fillStyle = p.type === 'LED' ? col : 'transparent'; if (p.type === 'LED') { ctx.globalAlpha *= lit ? 1 : 0.35; ctx.fill(); ctx.globalAlpha /= lit ? 1 : 0.35; }
      ctx.strokeStyle = C.part; ctx.stroke(); L(0.55, -0.6, 0.55, 0.6);
      if (p.type === 'LED') { ctx.strokeStyle = lit ? col : C.dim; L(0.1, -0.75, 0.55, -1.2); L(0.4, -1.2, 0.55, -1.2, 0.55, -1.05); L(-0.35, -0.85, 0.1, -1.3); L(-0.05, -1.3, 0.1, -1.3, 0.1, -1.15); }
      break;
    }
    case 'KEYPAD': {
      ctx.fillStyle = '#1E2329'; ctx.fillRect(-4.6, -3.9, 8.4, 9); ctx.strokeRect(-4.6, -3.9, 8.4, 9);
      const fl = KEYFLASH.get(p.id), now = performance.now();
      for (let rr = 0; rr < 4; rr++) for (let cc = 0; cc < 4; cc++) {
        const x0 = -4.2 + cc * 2, y0 = -3.6 + rr * 2.1, hot = fl && fl.until > now && fl.r === rr && fl.c === cc, ch = KEYLAB[rr][cc];
        ctx.fillStyle = hot ? '#FFE16B' : /[A-D]/.test(ch) ? '#C62828' : /[*#]/.test(ch) ? '#1565C0' : '#ECEFF1';
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x0, y0, 1.7, 1.75, 0.3) : ctx.rect(x0, y0, 1.7, 1.75); ctx.fill();
        T(ch, x0 + 0.85, y0 + 0.9, 0.9, hot || !/[A-D*#]/.test(ch) ? '#111' : '#fff');
      }
      ['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'].forEach((n, k) => { L(-5, -3 + k, -4.6, -3 + k); });
      break;
    }
    case 'BUZZER': {
      const on = r && Math.abs(r.v) > 1.5;
      L(-2, 0, -1.1, 0); L(1.1, 0, 2, 0); ctx.fillStyle = '#212121'; ctx.beginPath(); ctx.arc(0, 0, 1.1, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#555'; ctx.beginPath(); ctx.arc(0, 0, 0.25, 0, 7); ctx.fill(); T('+', -1.5, -0.6, 0.5, '#3DDC84');
      if (on) { ctx.strokeStyle = '#FFE16B'; for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 1.1 + i * 0.35, -0.6, 0.6); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 1.1 + i * 0.35, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke(); } ctx.strokeStyle = C.part; }
      break;
    }
    case 'LOCK': {
      const open = r?.open;
      L(-2, 0, -1.4, 0); L(1.4, 0, 2, 0);
      ctx.fillStyle = open ? '#2E7D32' : '#455A64'; ctx.fillRect(-1.4, -0.5, 2.8, 1.8); ctx.strokeRect(-1.4, -0.5, 2.8, 1.8);
      ctx.beginPath(); ctx.arc(open ? 0.6 : 0, -0.5, 0.75, Math.PI, 0); ctx.stroke(); if (open) L(1.35, -0.5, 1.35, -0.1);
      T(open ? 'OPEN' : 'LOCKED', 0, 0.45, 0.48, '#fff');
      break;
    }
    case 'DHT': {
      ctx.fillStyle = '#E8EEF2'; ctx.fillRect(-2.2, -2, 4.6, 4.2); ctx.strokeRect(-2.2, -2, 4.6, 4.2);
      ctx.fillStyle = '#9AA7B3'; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) ctx.fillRect(-1.6 + j * 1.25, -1.5 + i * 0.85, 0.85, 0.5);
      ['+', 'D', '−'].forEach((n, k) => { L(-3, -1 + k, -2.2, -1 + k); T(n, -2.65, -1.35 + k, 0.4, C.dim); });
      T(q.model === 'DHT11' ? 'DHT11' : 'DHT22', 0.1, 1.75, 0.45, '#30404E');
      break;
    }
    case 'HCSR04': {
      ctx.fillStyle = '#1565C0'; ctx.fillRect(-3.4, -2.3, 7.4, 4.6); ctx.strokeRect(-3.4, -2.3, 7.4, 4.6);
      for (const cx of [-1.4, 2]) { ctx.fillStyle = '#B0BEC5'; ctx.beginPath(); ctx.arc(cx, 0, 1.45, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#37474F'; ctx.beginPath(); ctx.arc(cx, 0, 0.9, 0, 7); ctx.fill(); }
      ['VCC', 'TRIG', 'ECHO', 'GND'].forEach((n, k) => { L(-4, -1 + k, -3.4, -1 + k); });
      T(`${plain(q.cm)} cm`, 0.3, 2.65, 0.5, '#FFE16B');
      ctx.strokeStyle = 'rgba(255,225,107,0.5)'; for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(0.3, -2.3, i * 0.45, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
      ctx.strokeStyle = C.part;
      break;
    }
    case 'LDR': {
      L(-2, 0, -1.1, 0); L(1.1, 0, 2, 0); ctx.beginPath(); ctx.arc(0, 0, 1.05, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.8, -0.25); for (let i = 0; i < 5; i++) ctx.lineTo(-0.8 + (i + 0.5) * 0.32, i % 2 ? -0.25 : 0.25); ctx.lineTo(0.8, 0); ctx.stroke();
      const lit = Math.min(1, Math.log10(Math.max(1, q.lux)) / 4);
      ctx.strokeStyle = `rgba(255,225,107,${0.3 + 0.7 * lit})`; L(-1.2, -2, -0.5, -1.2); L(-0.75, -1.25, -0.5, -1.2, -0.55, -1.45); L(-0.2, -2.1, 0.5, -1.3); L(0.25, -1.35, 0.5, -1.3, 0.45, -1.55);
      ctx.strokeStyle = C.part;
      break;
    }
    case 'PIR': {
      ctx.fillStyle = '#2E7D32'; ctx.fillRect(-2.3, -1.8, 4.6, 3.8); ctx.strokeRect(-2.3, -1.8, 4.6, 3.8);
      ctx.fillStyle = q.motion ? '#FFF59D' : '#ECEFF1'; ctx.beginPath(); ctx.arc(0.2, 0.1, 1.45, 0, 7); ctx.fill(); ctx.stroke();
      ['+', 'O', '−'].forEach((n, k) => { L(-3, -1 + k, -2.3, -1 + k); T(n, -2.7, -1.35 + k, 0.4, C.dim); });
      if (q.motion) T('🚶', 0.2, 0.15, 1.1, '#000');
      break;
    }
    case 'TL494': {
      const q1 = !!r?.q?.[0], q2 = !!r?.q?.[1];
      ctx.fillStyle = '#1E1E24'; ctx.fillRect(-4, -6, 8, 12); ctx.strokeRect(-4, -6, 8, 12);
      ctx.beginPath(); ctx.arc(0, -6, 0.5, 0, Math.PI); ctx.stroke();
      for (const y of [-5, -4, -2, 0, 2, 4]) L(-5, y, -4, y);
      for (const y of [-5, -4, -2, 0]) L(4, y, 5, y);
      for (const x of [-2, 2]) L(x, -7, x, -6);
      for (const x of [-3, -1, 1, 3]) L(x, 6, x, 7);
      if (p.id == null) T('TL494', 0.3, -2.6, 0.62, C.part);          // tray icon (on the sheet the label sits here)
      // little sawtooth = the oscillator
      L(-0.9, 1.3, 0.3, 0.5, 0.3, 1.3, 1.5, 0.5, 1.5, 1.3);
      [['1IN−', -5], ['1IN+', -4], ['FB', -2], ['2IN+', 0], ['2IN−', 2], ['DTC', 4]].forEach(([n, y]) => T(n, -2.95, y, 0.36, C.dim));
      [['C1', -5], ['C2', -4], ['E1', -2], ['E2', 0]].forEach(([n, y]) => T(n, 3.35, y, 0.36, C.dim));
      T('REF', -2, -5.4, 0.34, C.dim); T('VCC', 2, -5.4, 0.34, C.dim);
      [['CT', -3], ['RT', -1], ['GND', 1], ['OC', 3]].forEach(([n, x]) => T(n, x, 5.4, 0.34, C.dim));
      for (const [on, y] of [[q1, -2], [q2, 0]]) if (on) { ctx.fillStyle = '#3DDC84'; ctx.beginPath(); ctx.arc(2.45, y, 0.2, 0, 7); ctx.fill(); }
      if (r) T(r.pp ? 'push-pull' : 'single', 0.3, 3.3, 0.4, r.pp ? '#4FC3F7' : C.dim);
      break;
    }
    case 'SR595': {
      ctx.fillStyle = '#1E1E24'; ctx.fillRect(-3, -5, 6, 11); ctx.strokeRect(-3, -5, 6, 11);
      ctx.beginPath(); ctx.arc(0, -5, 0.5, 0, Math.PI); ctx.stroke();
      L(-4, -4, -3, -4); L(-4, -3, -3, -3); L(-4, -2, -3, -2); L(0, -6, 0, -5); L(2, -6, 2, -5); L(0, 6, 0, 7); L(2, 6, 2, 7);
      for (let k = -4; k <= 3; k++) L(3, k, 4, k); L(3, 5, 4, 5);
      T(q.model === '74HCT595' ? 'HCT595' : 'HC595', 0, 0.6, 0.55, C.part);
      ['SER', 'SRCLK', 'RCLK'].forEach((n, k) => T(n, -1.9, -4 + k, 0.36, C.dim));
      T('VCC', 0, -4.4, 0.34, C.dim); T('CLR', 2, -4.4, 0.32, C.dim); T('GND', 0, 5.4, 0.34, C.dim); T('OE', 2, 5.4, 0.34, C.dim);
      const sr = r?.q ?? 0, on = r?.en;
      ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'].forEach((n, k) => { T(n, 1.9, -4 + k, 0.36, C.dim); if (on && (sr >> k) & 1) { ctx.fillStyle = '#FF5252'; ctx.beginPath(); ctx.arc(2.75, -4 + k, 0.17, 0, 7); ctx.fill(); } });
      T("QH'", 1.9, 5, 0.36, C.dim);
      break;
    }
    case 'RMOD': {
      const on = !!r?.on;
      ctx.fillStyle = '#0D47A1'; ctx.fillRect(-3, -2, 6, 4); ctx.strokeRect(-3, -2, 6, 4);
      ctx.fillStyle = '#1565C0'; ctx.fillRect(-1.2, -1.6, 2.6, 3.2); ctx.strokeRect(-1.2, -1.6, 2.6, 3.2);
      T('SRD', 0.1, -0.6, 0.42, '#E3F2FD'); T('05V', 0.1, 0.1, 0.36, '#BBDEFB');
      ctx.fillStyle = on ? '#FF1744' : '#4A1F24'; ctx.beginPath(); ctx.arc(-1.9, -1.35, 0.26, 0, 7); ctx.fill();
      if (on) { ctx.fillStyle = 'rgba(255,23,68,0.35)'; ctx.beginPath(); ctx.arc(-1.9, -1.35, 0.6, 0, 7); ctx.fill(); }
      ['VCC', 'GND', 'IN'].forEach((n, k) => T(n, -2.2, -1 + k, 0.32, '#BBDEFB'));
      ['NO', 'COM', 'NC'].forEach((n, k) => T(n, 2.15, -1 + k, 0.32, '#BBDEFB'));
      const lw = ctx.lineWidth; ctx.lineWidth = 0.14; ctx.strokeStyle = '#FFD54F'; L(1.55, 0, on ? 1.55 : 1.55, on ? -0.9 : 0.9); ctx.lineWidth = lw; ctx.strokeStyle = C.part;
      break;
    }
    case 'ENC': {
      const s = ENCS.get(p.id), prog = s?.cur ? (s.prog ?? 0) * s.cur.d : 0, ang = ((s?.pos ?? 0) + prog) * Math.PI / 10;
      ctx.fillStyle = '#1B1F24'; ctx.fillRect(-3.4, -2.6, 6.4, 5.2); ctx.strokeRect(-3.4, -2.6, 6.4, 5.2);
      ctx.fillStyle = '#5D6670'; ctx.beginPath(); ctx.arc(-0.6, 0, 1.9, 0, 7); ctx.fill();
      ctx.fillStyle = q._sw ? '#2E7D32' : '#3A4149'; ctx.beginPath(); ctx.arc(-0.6, 0, 1.5, 0, 7); ctx.fill(); ctx.stroke();
      for (let k = 0; k < 20; k++) { const a = k * Math.PI / 10; L(-0.6 + 1.5 * Math.sin(a), -1.5 * Math.cos(a), -0.6 + 1.7 * Math.sin(a), -1.7 * Math.cos(a)); }
      const lw = ctx.lineWidth; ctx.lineWidth = 0.22; ctx.strokeStyle = '#FFD54F'; L(-0.6 + 0.35 * Math.sin(ang), -0.35 * Math.cos(ang), -0.6 + 1.25 * Math.sin(ang), -1.25 * Math.cos(ang)); ctx.lineWidth = lw; ctx.strokeStyle = C.part;
      ['CLK', 'DT', 'SW', '+', 'GND'].forEach((n, k) => T(n, 2.15, -2 + k, 0.34, C.dim));
      if (q._a || q._b) T((q._a ? 'A' : '') + (q._b ? 'B' : ''), -0.6, 2.25, 0.36, '#FFD54F');
      break;
    }
    case 'OLED': {
      const v = OLEDV.get(p.id) ?? {}, d = v.powered ? v.d : null, cols = OLED_COL[q.color] ?? OLED_COL.white;
      ctx.fillStyle = '#0D3B66'; ctx.fillRect(-5, -2.3, 10, 5.6); ctx.strokeStyle = C.part; ctx.strokeRect(-5, -2.3, 10, 5.6);
      ctx.fillStyle = '#0A0D10'; ctx.fillRect(-3.4, -1.6, 8.1, 4.3);
      if (d && d.on && d.shown) {
        let cv = OLEDCV.get(p.id);
        const key = d.ver + ':' + (q.color ?? 'white') + ':' + d.inv + ':' + d.W + 'x' + d.H;
        if (!cv || cv.key !== key) {
          if (!cv) { const el = document.createElement('canvas'); cv = { el, key: '' }; OLEDCV.set(p.id, cv); }
          cv.el.width = d.W; cv.el.height = d.H; const g2 = cv.el.getContext('2d'), img = g2.createImageData(d.W, d.H), hexRgb = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
          const top = hexRgb(cols[0]), bot = hexRgb(cols[1]);
          for (let y = 0; y < d.H; y++) for (let x = 0; x < d.W; x++) { const on = d.shown[y * d.W + x] ^ (d.inv ? 1 : 0), k = (y * d.W + x) * 4, rgb = y < 16 ? top : bot; if (on) { img.data[k] = rgb[0]; img.data[k + 1] = rgb[1]; img.data[k + 2] = rgb[2]; } else { img.data[k] = 6; img.data[k + 1] = 8; img.data[k + 2] = 10; } img.data[k + 3] = 255; }
          g2.putImageData(img, 0, 0); cv.key = key;
        }
        const sh = d.H === 32 ? 2.0 : 4.0;
        ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(cv.el, -3.3, -1.5 + (4.1 - sh) / 2, 7.9, sh); ctx.restore();
      }
      ['SCL', 'SDA', 'VCC', 'GND'].forEach((n, k) => T(n, -4.25, -1 + k, 0.34, '#B3D4F5'));
      break;
    }
    case 'LCD': {
      const v = LCDV.get(p.id) ?? {}, cols = 16, rows = 2;
      ctx.fillStyle = '#1B5E20'; ctx.fillRect(-7, -2.3, 14, 5.1); ctx.strokeStyle = C.part; ctx.strokeRect(-7, -2.3, 14, 5.1);
      ctx.fillStyle = '#263238'; ctx.fillRect(-6.4, -1.75, 12.8, 3.9);
      const lit = v.powered && v.bl, on = v.powered;
      ctx.fillStyle = !on ? '#3A4A3A' : lit ? '#9CCC65' : '#4E6B2E'; ctx.fillRect(-6.1, -1.45, 12.2, 3.3);
      const cw = 12.2 / cols, ch = 3.3 / rows;
      ctx.save(); ctx.translate(-6.1, -1.45);
      for (let rr = 0; rr < rows; rr++) for (let k = 0; k < cols; k++) {
        const x0 = k * cw + 0.04, y0 = rr * ch + 0.12;
        const txt = v.lines?.[rr]?.[k];
        if (on && !v.lines && rr === 0) { ctx.fillStyle = 'rgba(20,40,20,0.55)'; ctx.fillRect(x0, y0, cw - 0.08, ch - 0.24); continue; }   // powered, no init: first row of boxes
        if (on && v.on !== false && txt && txt !== ' ') { ctx.save(); ctx.translate(x0 + cw / 2, y0 + ch / 2 + 0.02); ctx.rotate(-(p.rot || 0) * Math.PI / 2); ctx.scale(1 / g, 1 / g); ctx.fillStyle = lit ? '#1B2B12' : '#203018'; ctx.font = `700 ${ch * 0.8 * g}px ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, 0, 0); ctx.restore(); }
      }
      ctx.restore();
      ['SCL', 'SDA', 'VCC', 'GND'].forEach((n, k) => T(n, -7.9 - (n.length > 2 ? 0.1 : 0), -1.25 + k, 0.36, C.dim));
      break;
    }
    case 'SEG7': {
      const col = (S.LED_COLORS[q.color] ?? S.LED_COLORS.red).hex, segs = r?.segs ?? [];
      ctx.fillStyle = '#15191E'; ctx.fillRect(-2.3, -4.5, 4.7, 9); ctx.strokeRect(-2.3, -4.5, 4.7, 9);
      const S7 = [[-0.9, -3.3, 0.9, -3.3], [1.1, -3.1, 1.1, -0.2], [1.1, 0.2, 1.1, 3.1], [-0.9, 3.3, 0.9, 3.3], [-1.1, 0.2, -1.1, 3.1], [-1.1, -3.1, -1.1, -0.2], [-0.9, 0, 0.9, 0]];
      ctx.lineCap = 'round'; const lw = ctx.lineWidth;
      S7.forEach(([x1, y1, x2, y2], k) => { const b = Math.min(1, (segs[k] ?? 0) / 0.004); ctx.lineWidth = 0.42; ctx.strokeStyle = b > 0.03 ? col : 'rgba(255,255,255,0.08)'; ctx.globalAlpha = b > 0.03 ? 0.35 + 0.65 * b : 1; L(x1, y1, x2, y2); ctx.globalAlpha = 1; });
      const bdp = Math.min(1, (segs[7] ?? 0) / 0.004); ctx.fillStyle = bdp > 0.03 ? col : 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(1.75, 3.5, 0.24, 0, 7); ctx.fill();
      ctx.lineWidth = lw; ctx.strokeStyle = C.part;
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp', q.common === 'anode' ? 'CA' : 'CC'].forEach((n, k) => { L(-3, -4 + k, -2.3, -4 + k); T(n, -2.75, -4.35 + k, 0.36, C.dim); });
      break;
    }
    case 'LAMP': {
      const b = r ? Math.min(1, r.p / Math.max(q.wr, 1e-9)) : 0;
      if (b > 0.02) { const gr = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 1.7); gr.addColorStop(0, `rgba(255,225,107,${0.25 + 0.75 * b})`); gr.addColorStop(1, 'rgba(255,225,107,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 1.7, 0, 7); ctx.fill(); }
      L(-2, 0, -0.85, 0); L(0.85, 0, 2, 0); ctx.strokeStyle = C.part; ctx.beginPath(); ctx.arc(0, 0, 0.85, 0, 7); ctx.stroke(); L(-0.6, -0.6, 0.6, 0.6); L(-0.6, 0.6, 0.6, -0.6); break;
    }
    case 'XFMR': {
      L(-3, -2, -1.2, -2); L(-3, 0, -1.2, 0); L(-3, 2, -1.2, 2); L(1.2, -2, 3, -2); L(1.2, 2, 3, 2);
      ctx.beginPath(); for (let k = 0; k < 4; k++) { const cy = -1.5 + k; ctx.moveTo(-1.2, cy - 0.5); ctx.arc(-1.2, cy, 0.5, -Math.PI / 2, Math.PI / 2); } ctx.stroke();
      ctx.beginPath(); for (let k = 0; k < 4; k++) { const cy = -1.5 + k; ctx.moveTo(1.2, cy - 0.5); ctx.arc(1.2, cy, 0.5, -Math.PI / 2, Math.PI / 2, true); } ctx.stroke();
      L(-0.22, -2.3, -0.22, 2.3); L(0.22, -2.3, 0.22, 2.3);
      ctx.fillStyle = C.part; for (const x of [-1.7, 1.7]) { ctx.beginPath(); ctx.arc(x, -2.35, 0.17, 0, 7); ctx.fill(); }
      T('CT', -2.4, -0.45, 0.45, C.dim);
      break;
    }
    case 'GND': L(0, 0, 0, 0.8); L(-0.75, 0.8, 0.75, 0.8); L(-0.5, 1.1, 0.5, 1.1); L(-0.25, 1.4, 0.25, 1.4); break;
    case 'C': {
      L(-2, 0, -0.25, 0); L(0.25, 0, 2, 0); ctx.lineWidth *= 1.5;
      L(-0.25, -0.85, -0.25, 0.85);
      if (q.polar) { ctx.beginPath(); ctx.arc(1.0, 0, 0.95, Math.PI * 0.72, Math.PI * 1.28); ctx.stroke(); T('+', -0.75, -0.75, 0.7, '#3DDC84'); }
      else L(0.25, -0.85, 0.25, 0.85);
      if (r && q.vmax && Math.abs(r.v) > q.vmax) { ctx.strokeStyle = '#FF6B6B'; L(-0.25, -0.85, -0.25, 0.85); }
      break;
    }
    case 'L': {
      L(-2, 0, -1.6, 0); L(1.6, 0, 2, 0);
      ctx.beginPath(); for (let k = 0; k < 4; k++) { const cx = -1.2 + k * 0.8; ctx.moveTo(cx - 0.4, 0); ctx.arc(cx, 0, 0.4, Math.PI, 0); } ctx.stroke();
      break;
    }
    case 'SIG': {
      L(-2, 0, -0.95, 0); L(0.95, 0, 2, 0); ctx.strokeStyle = C.sel; ctx.beginPath(); ctx.arc(0, 0, 0.95, 0, 7); ctx.stroke();
      ctx.save(); ctx.rotate(-(p.rot || 0) * Math.PI / 2); ctx.strokeStyle = C.part; ctx.lineWidth *= 0.9; ctx.beginPath();
      const w = q.wave;
      for (let i = 0; i <= 24; i++) {
        const u = i / 24, xx = -0.55 + 1.1 * u, ph = u * 1.5 % 1;
        const yv = w === 'square' ? (ph < 0.5 ? -1 : 1) : w === 'triangle' ? (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph) : w === 'saw' ? 2 * ph - 1 : w === 'pwm' ? (ph < 0.3 ? -1 : 1) : Math.sin(u * 3 * Math.PI);
        i ? ctx.lineTo(xx, yv * 0.35 * -1) : ctx.moveTo(xx, yv * 0.35 * -1);
      }
      ctx.stroke(); ctx.restore();
      T('+', -1.35, -0.6, 0.7, '#3DDC84');
      break;
    }
    case 'SCOPE': {
      L(-3, -1, -2.1, -1); L(-3, 1, -2.1, 1); L(0, 2, 0, 1.55);
      ctx.fillStyle = '#07120C'; ctx.fillRect(-2.1, -1.55, 4.2, 3.1); ctx.strokeStyle = C.part; ctx.strokeRect(-2.1, -1.55, 4.2, 3.1);
      ctx.strokeStyle = '#FFE16B'; ctx.beginPath(); for (let i = 0; i <= 30; i++) { const u = i / 30; const xx = -1.2 + 3 * u, yy = -0.35 + Math.sin(u * 4 * Math.PI) * 0.45; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke();
      ctx.strokeStyle = '#4FC3F7'; ctx.beginPath(); for (let i = 0; i <= 30; i++) { const u = i / 30; const xx = -1.2 + 3 * u, yy = 0.65 + ((u * 2) % 1 < 0.5 ? -0.3 : 0.3); i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke();
      T('1', -1.75, -1, 0.55, '#FFE16B'); T('2', -1.75, 1, 0.55, '#4FC3F7'); T('⏚', 0, 1.15, 0.6, C.dim);
      break;
    }
    case 'OPTO': {
      const lit = r?.on && r.ifw > 1e-4;
      ctx.setLineDash([0.25, 0.18]); ctx.strokeStyle = C.dim; ctx.strokeRect(-1.4, -1.75, 2.8, 3.5); ctx.setLineDash([]); ctx.strokeStyle = C.part;
      if (lit) { const gr = ctx.createRadialGradient(-0.8, 0, 0.05, -0.8, 0, 1.1); gr.addColorStop(0, 'rgba(255,90,60,0.9)'); gr.addColorStop(1, 'rgba(255,90,60,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(-0.8, 0, 1.1, 0, 7); ctx.fill(); }
      L(-2, -1, -0.8, -1, -0.8, -0.4); L(-0.8, 0.35, -0.8, 1, -2, 1);
      ctx.beginPath(); ctx.moveTo(-1.2, -0.4); ctx.lineTo(-0.4, -0.4); ctx.lineTo(-0.8, 0.35); ctx.closePath(); ctx.fillStyle = lit ? '#FF5A3C' : 'rgba(255,90,60,0.25)'; ctx.fill(); ctx.stroke();
      L(-1.2, 0.35, -0.4, 0.35);
      ctx.strokeStyle = lit ? '#FFB199' : C.dim; L(-0.2, -0.35, 0.25, -0.1); L(0.1, -0.08, 0.25, -0.1, 0.18, -0.25); L(-0.2, 0.15, 0.25, 0.4); L(0.1, 0.42, 0.25, 0.4, 0.18, 0.25);
      ctx.strokeStyle = C.part; ctx.lineWidth *= 1.4; L(0.55, -0.65, 0.55, 0.65); ctx.lineWidth /= 1.4;
      L(0.55, -0.25, 1.2, -0.8, 1.2, -1, 2, -1); L(0.55, 0.25, 1.2, 0.8, 1.2, 1, 2, 1);
      ctx.beginPath(); ctx.moveTo(1.2, 0.8); ctx.lineTo(0.9, 0.75); ctx.lineTo(1.08, 0.55); ctx.closePath(); ctx.fillStyle = C.part; ctx.fill();
      T('1', -1.7, -1.4, 0.5, C.dim); T('2', -1.7, 1.4, 0.5, C.dim); T('4', 1.7, -1.4, 0.5, C.dim); T('3', 1.7, 1.4, 0.5, C.dim);
      break;
    }
    case 'ZD': {
      const on = r?.state === 'rev';
      L(-2, 0, -0.55, 0); L(0.55, 0, 2, 0);
      ctx.beginPath(); ctx.moveTo(-0.55, -0.6); ctx.lineTo(0.55, 0); ctx.lineTo(-0.55, 0.6); ctx.closePath();
      ctx.fillStyle = on ? 'rgba(61,220,132,0.35)' : 'transparent'; ctx.fill(); ctx.stroke();
      L(0.3, -0.85, 0.55, -0.6, 0.55, 0.6, 0.8, 0.85);
      break;
    }
    case 'NPN': case 'PNP': {
      const npn = p.type === 'NPN', s = r?.state, ce = s === 'sat' ? '#3DDC84' : s === 'act' ? '#FFC857' : s === 'brk' ? '#FF6B6B' : C.part;
      ctx.beginPath(); ctx.arc(0.25, 0, 1.3, 0, 7); ctx.stroke();
      L(-2, 0, -0.45, 0); ctx.lineWidth *= 1.6; L(-0.45, -0.8, -0.45, 0.8); ctx.lineWidth /= 1.6;
      ctx.strokeStyle = ce; ctx.fillStyle = ce;
      L(-0.45, -0.35, 1, -1.05, 1, -2); L(-0.45, 0.35, 1, 1.05, 1, 2);
      if (npn) arrowHead(ctx, -0.45, 0.35, 1, 1.05, 0.8); else arrowHead(ctx, 1, -1.05, -0.45, -0.35, 0.75);
      T(npn ? 'C' : 'E', 1.5, -1.6, 0.5, C.dim); T(npn ? 'E' : 'C', 1.5, 1.6, 0.5, C.dim); T('B', -1.5, -0.45, 0.5, C.dim);
      break;
    }
    case 'NMOS': case 'PMOS': {
      const nch = p.type === 'NMOS', s = r?.state, ch = s === 'ohm' ? '#3DDC84' : s === 'sat' ? '#FFC857' : s === 'brk' ? '#FF6B6B' : C.part;
      L(-2, 0, -0.75, 0); ctx.lineWidth *= 1.3; L(-0.75, -0.9, -0.75, 0.9); ctx.lineWidth /= 1.3;
      ctx.strokeStyle = ch; ctx.fillStyle = ch; ctx.lineWidth *= 1.5;
      L(-0.35, -1, -0.35, -0.5); L(-0.35, -0.25, -0.35, 0.25); L(-0.35, 0.5, -0.35, 1); ctx.lineWidth /= 1.5;
      L(-0.35, -0.75, 1, -0.75, 1, -2); L(-0.35, 0.75, 1, 0.75, 1, 2);
      // body connects to the source (bottom for N, top for P)
      if (nch) { L(-0.35, 0, 1, 0, 1, 0.75); arrowHead(ctx, 0.6, 0, -0.3, 0, 1); } else { L(-0.35, 0, 1, 0, 1, -0.75); arrowHead(ctx, -0.25, 0, 0.6, 0, 1); }
      // body diode (cathode up)
      ctx.strokeStyle = r?.body ? '#FFC857' : C.dim; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth *= 0.7;
      L(1, -1.35, 1.6, -1.35, 1.6, 1.35, 1, 1.35);
      ctx.beginPath(); ctx.moveTo(1.38, 0.2); ctx.lineTo(1.82, 0.2); ctx.lineTo(1.6, -0.2); ctx.closePath(); ctx.fill(); L(1.38, -0.2, 1.82, -0.2); ctx.lineWidth /= 0.7;
      T('G', -1.5, -0.45, 0.5, C.dim); T(nch ? 'D' : 'S', 0.55, -1.55, 0.5, C.dim); T(nch ? 'S' : 'D', 0.55, 1.55, 0.5, C.dim);
      break;
    }
    case 'OPAMP': {
      const s = r?.state;
      ctx.beginPath(); ctx.moveTo(-2, -1.8); ctx.lineTo(2, 0); ctx.lineTo(-2, 1.8); ctx.closePath();
      ctx.fillStyle = s === 'high' ? 'rgba(61,220,132,0.18)' : s === 'low' ? 'rgba(255,107,107,0.12)' : 'rgba(79,195,247,0.08)'; ctx.fill(); ctx.stroke();
      L(-3, 1, -2, 1); L(-3, -1, -2, -1); L(2, 0, 3, 0); L(0, -2, 0, -0.9); L(0, 2, 0, 0.9);
      T('−', -1.45, -1, 0.9, '#FF6B6B'); T('+', -1.45, 1, 0.9, '#3DDC84');
      T('V+', 0.55, -1.6, 0.45, C.dim); T('V−', 0.55, 1.6, 0.45, C.dim);
      break;
    }
    case 'REG': {
      const m = S.REGS[q.model] ?? S.REGS['7805'];
      L(-3, 0, -2, 0); L(2, 0, 3, 0); L(0, 2, 0, 1.1);
      ctx.fillStyle = '#161C22'; ctx.fillRect(-2, -1.1, 4, 2.2); ctx.strokeStyle = r?.state && r.state !== 'reg' ? '#FF6B6B' : C.part; ctx.strokeRect(-2, -1.1, 4, 2.2);
      T(q.model.replace('AMS', ''), 0, -0.2, q.model.length > 6 ? 0.5 : 0.62, C.part);
      T('IN', -1.45, 0.55, 0.42, C.dim); T('OUT', 1.35, 0.55, 0.42, C.dim); T(m.adj ? 'ADJ' : 'GND', 0, 0.7, 0.42, C.dim);
      break;
    }
    case 'SERVO': {
      const ang = r?.ang ?? 90;
      L(-3, -1, -2, -1); L(-3, 0, -2, 0); L(-3, 1, -2, 1);
      ctx.fillStyle = '#1E2A36'; ctx.fillRect(-2, -1.6, 4.6, 3.2); ctx.strokeStyle = C.part; ctx.strokeRect(-2, -1.6, 4.6, 3.2);
      T('SIG', -1.35, -1, 0.38, '#FFC857'); T('V+', -1.35, 0, 0.38, '#FF6B6B'); T('GND', -1.35, 1, 0.38, C.dim);
      // horn: 0° points left, 180° right (seen from the top)
      ctx.save(); ctx.translate(1.1, 0); ctx.rotate(-(p.rot || 0) * Math.PI / 2);
      const a = Math.PI - ang * Math.PI / 180;
      ctx.strokeStyle = '#E8EDF2'; ctx.lineWidth *= 2.4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 1.4, -Math.sin(a) * 1.4); ctx.stroke(); ctx.lineWidth /= 2.4;
      ctx.fillStyle = '#E8EDF2'; ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, 7); ctx.fill();
      ctx.restore();
      if (r) T(`${Math.round(ang)}°`, 1.1, 1.25, 0.45, '#4FC3F7');
      break;
    }
    case 'STEPPER': {
      L(-4, -2, -3, -2); L(-4, -1, -3, -1); L(-4, 0, -3, 0); L(-4, 1, -3, 1); L(-4, 2, -3, 2); L(-4, 3, -3, 3);
      ctx.fillStyle = '#0E3A2A'; ctx.fillRect(-3, -2.8, 3.2, 6.4); ctx.strokeStyle = C.part; ctx.strokeRect(-3, -2.8, 3.2, 6.4);
      T('A4988', -1.4, -2.35, 0.42, '#3DDC84');
      for (const [t, y] of [['STEP', -2], ['DIR', -1], ['EN', 0], ['VDD', 1], ['GND', 2], ['VMOT', 3]]) T(t, -2.15, y, 0.36, t === 'VMOT' ? '#FF9F43' : C.dim);
      // motor
      L(0.2, -0.5, 1.2, -0.5); L(0.2, 0.5, 1.2, 0.5);
      ctx.fillStyle = '#1E2A36'; ctx.fillRect(1.2, -1.6, 3.2, 3.2); ctx.strokeStyle = C.part; ctx.strokeRect(1.2, -1.6, 3.2, 3.2);
      ctx.beginPath(); ctx.arc(2.8, 0, 1.15, 0, 7); ctx.stroke();
      ctx.save(); ctx.translate(2.8, 0); ctx.rotate(-(p.rot || 0) * Math.PI / 2 + (r?.ang ?? 0) * Math.PI / 180);
      ctx.strokeStyle = r?.en ? '#3DDC84' : C.dim; ctx.lineWidth *= 2.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -1); ctx.stroke(); ctx.lineWidth /= 2.2; ctx.restore();
      ctx.fillStyle = '#E8EDF2'; ctx.beginPath(); ctx.arc(2.8, 0, 0.22, 0, 7); ctx.fill();
      if (r) T(`${Math.round(r.rpm)} RPM`, 2.8, 2.25, 0.45, '#4FC3F7');
      break;
    }
    case 'ESP32': case 'UNO': {
      const B = S.BOARDS[p.type], P = S.TYPES[p.type].pins, cfg = q.pins ?? {};
      ctx.fillStyle = p.type === 'ESP32' ? '#121C26' : '#0B2533'; ctx.fillRect(-3, -8.6, 6, 17.2); ctx.strokeStyle = C.part; ctx.strokeRect(-3, -8.6, 6, 17.2);
      T(p.type === 'ESP32' ? 'ESP32' : 'UNO', 0, -8.0, 0.6, p.type === 'ESP32' ? '#E8EDF2' : '#4FC3F7');
      const col = { high: '#3DDC84', low: '#FF6B6B', pwm: '#FFC857', adc: '#C084FC', pu: '#4FC3F7', pd: '#4FC3F7' };
      B.pins.forEach((pin, k) => {
        const [x, y] = P[k], sx2 = x > 0 ? 3 : -3;
        ctx.strokeStyle = C.part; L(x, y, sx2, y);
        const m = pin.k === 'gpio' ? (cfg[pin.n]?.mode ?? 'in') : pin.k;
        T(pin.n, x > 0 ? 2.05 : -2.05, y, 0.42, pin.k === 'gnd' ? C.dim : pin.k === 'pwr' ? '#FF9F43' : col[m] ?? C.text);
        if (col[m]) { ctx.fillStyle = col[m]; ctx.beginPath(); ctx.arc(x > 0 ? 3.5 : -3.5, y, 0.17, 0, 7); ctx.fill(); }
        // live readings next to input pins: analogRead value or digitalRead H / L
        const rp = r?.pins?.[pin.n];
        if (rp && pin.k === 'gpio' && /adc|in|pu|pd/.test(m) && (m !== 'in' || Math.abs(rp.v) > 0.01)) {
          const txt = m === 'adc' ? String(Math.round(Math.max(0, Math.min(1, rp.v / B.adcRef)) * (2 ** B.adcBits - 1))) : rp.v >= B.vih ? 'H' : rp.v <= B.vil ? 'L' : '?';
          const tw = txt.length * 0.32 + 0.4, cx = x > 0 ? x + 0.6 + tw / 2 : x - 0.6 - tw / 2;
          ctx.fillStyle = 'rgba(15,19,23,0.85)'; ctx.fillRect(cx - tw / 2, y - 0.38, tw, 0.76);
          T(txt, cx, y + 0.02, 0.52, m === 'adc' ? '#C084FC' : txt === 'H' ? '#3DDC84' : txt === 'L' ? '#FF6B6B' : '#FFC857');
        }
      });
      break;
    }
    case 'T555': {
      const on = !!r?.q;
      ctx.fillStyle = '#161C22'; ctx.fillRect(-3, -3, 6, 6); ctx.strokeStyle = on ? '#3DDC84' : C.part; ctx.strokeRect(-3, -3, 6, 6); ctx.strokeStyle = C.part;
      L(0, 3, 0, 4); L(-4, 2, -3, 2); L(3, 0, 4, 0); L(1, -4, 1, -3); L(2, 3, 2, 4); L(-4, 0, -3, 0); L(-4, -2, -3, -2); L(-1, -4, -1, -3);
      T(q.model === 'NE555' ? '555' : q.model, 0, 0.1, 0.95, C.part);
      for (const [t, x, y] of [['DIS', -2.15, -2], ['THR', -2.15, 0], ['TRIG', -2.05, 2], ['OUT', 2.15, 0], ['VCC', -1, -2.45], ['RST', 1, -2.45], ['GND', 0, 2.45], ['CV', 2, 2.45]]) T(t, x, y, 0.42, C.dim);
      if (r) T(on ? 'HIGH' : 'LOW', 2.1, -1.1, 0.45, on ? '#3DDC84' : '#FF6B6B');
      break;
    }
    case 'RELAY': {
      const on = !!r?.on;
      L(-3, -2, -3, -1); L(-3, 1, -3, 2);
      if (on) { ctx.fillStyle = 'rgba(255,200,87,0.25)'; ctx.fillRect(-3.55, -1, 1.1, 2); }
      ctx.strokeRect(-3.55, -1, 1.1, 2); L(-3.55, 1, -2.45, -1);
      L(0, 2, 0, 1); L(0, -2, 0, -1.45, -0.6, -1.45, -0.6, -1.05); L(2, -2, 2, -1.45, 1.1, -1.45, 1.1, -1.05);
      for (const [x, y] of [[0, 1], [-0.6, -1.05], [1.1, -1.05]]) { ctx.beginPath(); ctx.arc(x, y, 0.13, 0, 7); ctx.fill(); }
      ctx.strokeStyle = on ? '#3DDC84' : C.part; L(0, 1, on ? 1.05 : -0.55, -0.95);
      ctx.strokeStyle = C.dim; ctx.setLineDash([0.18, 0.15]); L(-2.45, 0, on ? 0.5 : -0.27, 0); ctx.setLineDash([]);
      T('NC', -0.75, -1.85, 0.4, C.dim); T('NO', 1.45, -1.85, 0.4, C.dim); T('COM', 0.75, 1.6, 0.4, C.dim);
      break;
    }
    case 'VM': case 'AM': L(-2, 0, -1, 0); L(1, 0, 2, 0); ctx.beginPath(); ctx.arc(0, 0, 1, 0, 7); ctx.stroke(); T(p.type === 'VM' ? 'V' : 'A', 0, 0.05, 1.0, C.sel); T('+', -1.45, -0.55, 0.7, '#3DDC84'); break;
  }
}

// filled arrow head on the segment (x1,y1)→(x2,y2), tip at fraction f
function arrowHead(ctx, x1, y1, x2, y2, f) {
  const dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const tx = x1 + dx * f, ty = y1 + dy * f, s = 0.36;
  ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - ux * s - uy * s * 0.6, ty - uy * s + ux * s * 0.6); ctx.lineTo(tx - ux * s + uy * s * 0.6, ty - uy * s - ux * s * 0.6); ctx.closePath(); ctx.fill();
}

function drawIcon(cv, type) {
  const x = cv.getContext('2d'), w = cv.width, h = cv.height, g = type === 'GND' ? 22 : 20;
  x.clearRect(0, 0, w, h); x.save(); const gg = { DPDT: 7, SPDT: 14, SCOPE: 11, OPTO: 12, NPN: 12, PNP: 12, NMOS: 12, PMOS: 12, OPAMP: 9, REG: 9, RELAY: 9, T555: 6, ESP32: 3, UNO: 3, SERVO: 8, STEPPER: 6, XFMR: 8, LCD: 4.5, OLED: 6, ENC: 7, SR595: 4.5, TL494: 4, RMOD: 7, SEG7: 7, DHT: 10, HCSR04: 7, PIR: 10, KEYPAD: 5.5, BUZZER: 14, LOCK: 14 }[type] ?? g; x.translate(w / 2 + (type === 'RELAY' ? 6 : 0), type === 'GND' ? 10 : h / 2 + (type === 'POT' ? 10 : 0)); x.scale(gg, gg); x.lineWidth = 2.6 / gg; x.lineCap = 'round'; x.lineJoin = 'round';
  symbol(x, { type, props: S.TYPES[type].props, rot: 0 }, null, gg); x.restore();
}
