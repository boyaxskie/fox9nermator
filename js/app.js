// Fox9nertron: tabs, routing, help
import { el, store } from './ui.js';
import { ohmTab, dividerTab, powerTab } from './tabs/basic.js';
import { kirchhoffTab } from './tabs/kirchhoff.js';
import { rectifierTab } from './tabs/rectifier.js';
import { capacitorTab } from './tabs/capacitor.js';
import { inductorTab } from './tabs/inductor.js';
import { timingTab } from './tabs/timing.js';
import { partsTab } from './tabs/parts.js';
import { schematicTab } from './tabs/schematic.js';
import { calcTab } from './tabs/calc.js';
import { learnTab } from './tabs/learn.js';

export const VERSION = '2.3.2';
const TABS = [
  ['schematic', '⚡ Schematic', schematicTab], ['calc', '🧮 Calc', calcTab], ['learn', '📖 Learn', learnTab], ['ohm', 'Ohm', ohmTab], ['divider', 'Divider', dividerTab], ['power', 'Power', powerTab], ['kirchhoff', 'Kirchhoff', kirchhoffTab],
  ['rectifier', 'Rectifier', rectifierTab], ['capacitor', 'Capacitor', capacitorTab], ['inductor', 'Inductor', inductorTab],
  ['timing', 'Timing / PWM', timingTab], ['parts', 'Parts', partsTab],
];

const nav = el('nav', { class: 'tabs', 'aria-label': 'Calculators' });
const main = el('main', { id: 'main' });
const built = new Map();

function show(id) {
  const t = TABS.find(x => x[0] === id) ?? TABS[0];
  for (const b of nav.children) { const on = b.dataset.id === t[0]; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  for (const [k, pane] of built) pane.hidden = k !== t[0];
  main.classList.toggle('wide', t[0] === 'schematic');     // the schematic / PCB uses the whole screen width
  if (!built.has(t[0])) {
    const pane = el('div', { class: 'pane' });
    main.append(pane); built.set(t[0], pane);
    try { t[2](pane); } catch (e) { console.error(e); pane.append(el('p', { class: 'flag bad', text: 'This tab hit an error: ' + e.message })); }
  }
  store.set('tab', t[0]);
  document.title = `${t[1]} · Fox9nertron`;
}

function help() {
  const d = el('dialog', { class: 'dlg' },
    el('div', { class: 'help-head' }, el('img', { src: 'icons/icon-192.png', alt: '' }),
      el('div', {}, el('div', { class: 'h1', text: 'Fox9nertron' }), el('div', { class: 'h2', text: `Version ${VERSION} · by Fox9ner` }), el('div', { class: 'h3', text: 'Measure it. Solve it. Build it.' }))),
    el('div', { class: 'help-text', html: `
<p><b>Typing values</b>: <code>4k7</code> = 4700, <code>2M2</code> = 2.2 M, <code>4R7</code> = 4.7, <code>100n</code> = 100 nano, <code>10u</code> = 10 micro, <code>20m</code> = 20 milli (small m = milli, big M = mega). Units are ignored: <code>12V</code>, <code>100nF</code>, <code>60Hz</code> all work. Math works too: <code>220*1.414</code>, <code>12-0.7</code>, <code>√2</code>.</p>
<p><b>Empty boxes</b> are calculated: the answer shows greyed inside the box and in the green result.</p>
<p><b>⚡ Schematic</b>: tap a part in the tray, tap the grid to place it. <b>↖ Select</b>: drag parts, tap one for its voltage, current and power. <b>↻</b> rotates (key R). <b>〰 Wire</b>: tap a yellow pin, then the next point; wires bend once (L-shape) and stop on a pin. Tap a switch to flip it, hold a push button. Wire colors show voltage (green +, grey 0 V, red −) and yellow dots show the current flowing. Pinch or mouse wheel to zoom, drag empty space to move. Projects: save, open, export, and save a PNG picture.</p>
<p><b>📈 Time simulation</b>: add a Capacitor, Inductor, Signal generator or Scope and ▶ Run moves through time. The oscilloscope under the drawing shows CH1 (yellow) and CH2 (blue) against the scope's bottom pin (COM, usually ground), with p-p, average and frequency. Time/div only zooms the scope. Speed: <b>real time 1×</b> (motors, servos, 555 timers start in real time), slow motion (½× … 0.001×) or <b>📺 scope pace</b> (one screen every 2 s, for fast audio / PWM signals). ⏸ pause and ⟲ t = 0 to start again with empty capacitors. Examples marked 📈 show RC charging, PWM, the coil flyback spike, rectifier ripple and the PC817 optocoupler.</p>
<p><b>🔌 Active parts</b>: NPN / PNP transistors (2N2222, BC547, TIP120…), N / P MOSFETs (IRLZ44N, AO3400, IRF540N…), zener diodes, op-amps (LM358, MCP6002…), regulators (7805, AMS1117, LM317) and relays. Tap one to see if it is OFF, fully ON or only partly on (hot), its heat, and spikes over its rating. Try the examples: relay driver, MOSFET solenoid, 7805, LM317, zener and the op-amp comparator.</p>
<p><b>★ Your own parts</b>: part not in the list? Tap the part, open its Type list, pick <b>+ New part from datasheet…</b> and type the main values (typical column). It is saved and shows as ★ in the list from then on; ✎ Edit or delete it the same way. Projects carry their ★ parts, so a shared file opens right on another phone.</p>
<p><b>📟 LCD 16×2 I2C + 🔢 7-segment</b>: wire the LCD's SDA / SCL to the board (ESP32 21 / 22, UNO A4 / A5) and print to it from a sketch with LiquidCrystal_I2C: the text shows on the drawing. 7-segment segments light from the real current.</p>
<p><b>🌡 Sensors</b>: DHT22 / DHT11 (temperature + humidity), HC-SR04 (distance), LDR (light), PIR (motion). Slide what they sense in their panel (tap a PIR to toggle motion). Sketches read them with the DHT library, pulseIn(), analogRead(), digitalRead().</p>
<p><b>🔐 Keypad, buzzer, door lock</b>: tap keypad keys on the drawing (or in its panel); sketches read them with the Keypad library. The buzzer really beeps (🔊 switch in its panel). The solenoid lock shows LOCKED / OPEN from its coil current.</p>
<p><b>⧉ Many of the same part</b>: tap a part in the tray, then keep tapping the grid: one each tap (↻ / R turns the next ones, right-click or Esc when done). Right-click also cancels a wire and lets go of the selection. Or select a part and ⧉ Duplicate (Ctrl+D): same value, new name. Ctrl+C / Ctrl+V pastes where the mouse is.</p>
<p><b>📲 Share</b> (Schematic toolbar): packs the whole project (circuit, sketch, PCB) into one link + QR code. Nothing is uploaded; opening the link loads a copy and keeps your own circuit in Projects.</p>
<p><b>🔍 Meter + 🔧 Fault</b> (troubleshoot): 🔍 Meter puts a red and a black probe on any two points and reads the volts between them. In any part's panel, 🔧 Fault breaks it on purpose (open, shorted, weak) so you can practise finding bad parts. A red O / S badge marks broken parts.</p>
<p><b>🔌 ESP32 / Arduino UNO</b>: board parts with real pin names. Either tap a pin and set it by hand (OUTPUT HIGH/LOW, PWM, INPUT, INPUT_PULLUP, analogRead), or open <b>💻 Code</b> in the board's panel, type an Arduino sketch (or pick an example) and ▶ Run code: setup() / loop(), digitalWrite, analogRead, delay, Serial, Servo… run in real time against the circuit, with a serial monitor. The panel shows the voltage, current, digitalRead / analogRead value and warns about too much current, 5 V on a 3.3 V pin and ESP32 boot pins. The PCB has the DevKit / UNO shield footprints.</p>
<p><b>🟫 PCB</b> (button at the end of the Schematic toolbar): turns the same circuit into a single-sided board for a CNC 3018. Parts get footprints (tap one to change it or the transistor pin order), drag them into place, then <b>⚡ Autoroute</b> (it adds a blue jumper wire when a trace can't cross) or <b>✏ Route</b> by hand. Yellow dashed = not connected yet, red circle = too close / short. <b>🛠 G-code</b> makes 3 GRBL files: 1 isolation (V-bit), 2 drilling (pauses for bit changes), 3 cutout with tabs — mirrored for bottom copper. X0 Y0 = lower-left corner of the blank, Z0 = copper surface. Also a 1:1 copper SVG for toner transfer. <b>📤 Gerber + drill</b> saves bottom copper (.GBL), drill (.DRL) and outline (.GKO) like Proteus does, to load into the Fox9ner web app.</p>
<p><b>Kirchhoff</b>: number every junction (0 = ground). Each part goes From one node To another. Example: a 9 V battery with + on node 1 and − on ground is <i>V src, From 1, To 0, 9</i>.</p>
<p><b>Colours</b>: green = safe, yellow = check it, red = it will fail or it's dangerous.</p>
<p><b>Install</b>: iPhone Safari → Share → Add to Home Screen. Android Chrome → menu → Install app. Works offline after that. Your inputs are remembered on this device.</p>
<p><b>Safety</b>: anything on 220 V mains can kill. Calculators give ideal numbers; real parts have tolerances (resistors 1–5 %, electrolytic capacitors −20 % … +20 %, AL values ±25 %). Leave margin and measure.</p>
<p class="fine">© 2026 Yaxboom (Fox9ner). All rights reserved. No copying, modifying or redistributing without written permission.</p>` }),
    el('form', { method: 'dialog', class: 'dlg-buttons' }, el('button', { class: 'btn primary', text: 'Close' })));
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
}

const COPY = '© 2026 Yaxboom (Fox9ner). All rights reserved.';
function about() {
  const d = el('dialog', { class: 'dlg' },
    el('div', { class: 'help-head' }, el('img', { src: 'icons/icon-192.png', alt: '' }),
      el('div', {}, el('div', { class: 'h1', text: 'Fox9nertron' }), el('div', { class: 'h2', text: `Version ${VERSION}` }), el('div', { class: 'h3', text: 'Measure it. Solve it. Build it.' }))),
    el('div', { class: 'help-text', html: `
<p>Electronics circuit solver, schematic simulator and single-sided PCB maker for the CNC 3018.</p>
<p><b>Author</b>: Yaxboom (Fox9ner), Cagayan de Oro, Philippines</p>
<p><b>Copyright</b>: ${COPY}</p>
<p><b>License</b>: free to use at <code>boyaxskie.github.io/fox9nertron</code> for personal use. Copying, modifying, redistributing, hosting elsewhere or selling this app or its source code, in whole or in part, is not allowed without written permission from the author. The source code being visible does not grant any license.</p>
<p class="fine">Includes QR Code Generator © 2009 Kazuhiko Arase (MIT license). "QR Code" is a registered trademark of DENSO WAVE.</p>
<p class="fine">Provided "as is", without warranty. Results are approximate; mains voltage can kill.</p>` }),
    el('form', { method: 'dialog', class: 'dlg-buttons' }, el('button', { class: 'btn primary', text: 'Close' })));
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
}

function start() {
  const header = el('header', { class: 'top' },
    el('div', { class: 'brand' }, el('img', { src: 'icons/icon-192.png', alt: '', class: 'logo' }), el('span', { class: 'name', text: 'Fox9nertron' }), el('span', { class: 'ver', text: 'v' + VERSION })),
    el('div', { class: 'top-btns' }, el('button', { class: 'btn ghost help info', type: 'button', text: 'ⓘ', title: 'About', 'aria-label': 'About', onclick: about }), el('button', { class: 'btn ghost help', type: 'button', text: '? Help', onclick: help })));
  for (const [id, label] of TABS) nav.append(el('a', { href: '#' + id, class: 'tab', 'data-id': id, text: label }));
  const bar = el('div', { class: 'appbar' }, header, nav);
  const foot = el('footer', { class: 'foot' }, el('span', { text: COPY + ' ' }), el('a', { href: '#', text: 'About', onclick: (e) => { e.preventDefault(); about(); } }));
  document.getElementById('app').append(bar, main, foot);
  // second-layer toolbars stick right under the app bar, whatever its real height
  const setH = () => document.documentElement.style.setProperty('--appbar-h', bar.offsetHeight + 'px');
  setH(); if ('ResizeObserver' in globalThis) new ResizeObserver(setH).observe(bar); else addEventListener('resize', setH);
  const route = () => show(location.hash.slice(1).split('?')[0] || store.get('tab', 'ohm'));   // #schematic?c=… = a shared circuit
  addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
}
start();
