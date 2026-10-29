// fox9nerMator web — screen, buttons, dialogs, projects, undo. Port of MainActivity.kt.
import { Scene, BodyType, MK, P2, wrapPi } from './model.js';
import { Solver } from './solver.js';
import { MeasureCalc } from './measure.js';
import { Exporter } from './export.js';
import { Units, Calc } from './calc.js';
import { Help } from './help.js';
import { SimView, Tool, TOOLS } from './view.js';

export const VERSION = '1.2';
const PI = Math.PI;
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
};

// ---------- storage (localStorage, safe) ----------
const KEY = 'f9m.';
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(KEY + k); return v == null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(KEY + k, String(v)); } catch { /* full or blocked */ } },
  del(k) { try { localStorage.removeItem(KEY + k); } catch { } },
  num(k, d) { const v = parseFloat(this.get(k)); return isFinite(v) ? v : d; },
  bool(k, d) { const v = this.get(k); return v == null ? d : v === 'true'; },
};
const projects = {
  all() { try { return JSON.parse(store.get('projects', '{}')) || {}; } catch { return {}; } },
  saveAll(p) { store.set('projects', JSON.stringify(p)); },
  list() { return Object.entries(this.all()).sort((a, b) => (b[1].t || 0) - (a[1].t || 0)).map(e => e[0]); },
  read(n) { return this.all()[n]?.json ?? null; },
  write(n, json) { const p = this.all(); p[n] = { json, t: Date.now() }; this.saveAll(p); },
  exists(n) { return n in this.all(); },
  remove(n) { const p = this.all(); delete p[n]; this.saveAll(p); },
};

const nz = (t) => (/^-0\.?0*$/.test(t) ? t.slice(1) : t);
const fmt = (v, d = 1) => nz(Number(v).toFixed(d));
const fmtLen = (mm) => nz(Units.toUser(mm).toFixed(Units.inch ? 3 : 1));
const fmtTrim = (v) => { let t = Number(v).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''); return t === '-0' ? '0' : t; };
const num = (v) => (v === Math.floor(v) ? String(v) : String(v));
const cleanName = (n) => n.trim().replace(/[^A-Za-z0-9 _.()-]/g, '_').slice(0, 60);

// ---------- dialogs ----------
const Dialog = {
  stack: [],
  open({ title, titleEl, body, items, buttons, onItem, keepOpen }) {
    const back = el('div', { class: 'dlg-back' });
    const box = el('div', { class: 'dlg', role: 'dialog' });
    if (titleEl) box.append(titleEl);
    else if (title) box.append(el('div', { class: 'dlg-title', text: title }));
    const content = el('div', { class: 'dlg-body' });
    if (body) content.append(body);
    if (items) {
      const ul = el('div', { class: 'dlg-list' });
      items.forEach((t, i) => ul.append(el('button', { class: 'dlg-item', text: t, onclick: () => { close(); onItem?.(i); } })));
      content.append(ul);
    }
    box.append(content);
    const row = el('div', { class: 'dlg-buttons' });
    const close = () => { back.remove(); this.stack = this.stack.filter(x => x !== close); };
    for (const b of (buttons ?? [{ text: 'Close' }])) {
      row.append(el('button', {
        class: 'dlg-btn' + (b.primary ? ' primary' : ''), text: b.text,
        onclick: () => { const keep = b.keep || keepOpen; if (!keep) close(); b.on?.(); },
      }));
    }
    box.append(row);
    back.append(box);
    back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
    document.body.append(back);
    this.stack.push(close);
    const first = box.querySelector('input'); if (first) setTimeout(() => { first.focus(); first.select?.(); }, 30);
    return { close, box };
  },
  closeTop() { const c = this.stack[this.stack.length - 1]; if (c) { c(); return true; } return false; },
};
addEventListener('keydown', e => { if (e.key === 'Escape') Dialog.closeTop(); });

function input(value = '', hint = '') {
  return el('input', { type: 'text', class: 'dlg-input', value, placeholder: hint, autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', inputmode: 'text' });
}
function fieldRow(label, inp) { return el('label', { class: 'dlg-row' }, el('span', { text: label }), inp); }

// ---------- download / file pick ----------
function download(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function shareOrDownload(name, text, mime) {
  // On phones the share sheet lets you save to Files / send it; elsewhere a normal download.
  try {
    const file = new File([text], name, { type: mime });
    if (navigator.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (e) { if (e?.name === 'AbortError') return false; }
  download(name, text, mime);
  return true;
}
function pickFile(accept, cb) {
  const i = el('input', { type: 'file', accept });
  i.style.display = 'none';
  i.addEventListener('change', async () => { const f = i.files?.[0]; i.remove(); if (f) cb(await f.text(), f.name); });
  document.body.append(i); i.click();
}

// ================= the app =================
class App {
  constructor() {
    this.s = new Scene();
    this.history = []; this.histIdx = -1; this.histTimer = 0;
    this.angStep = 1; this.mmStep = 1; this.inStep = 0.1;
    this.projectName = null;
    this.toolBtns = new Map();

    // Safe start: if the last start never finished, keep that design as "Recovered" and open empty.
    const saved = store.get('scene');
    const lastFailed = store.bool('starting', false);
    let recovered = null;
    if (lastFailed && saved) {
      const d = new Date(), p2 = n => String(n).padStart(2, '0');
      recovered = `Recovered ${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
      projects.write(recovered, saved);
      store.del('scene');
    } else if (!saved || !this.s.loadJson(saved)) this.s.buildDemo();
    store.set('starting', true);
    Solver.solve(this.s, null);

    this.buildUi();
    const v = this.view = new SimView($('#sim'), this.s);

    v.onStatus = t => { this.status.textContent = t; };
    v.onEditDistance = m => this.editDistance(m);
    v.onMeasures = txt => { this.calcText.textContent = txt; this.calcText.hidden = txt === ''; };
    v.onSelect = () => this.syncSel();
    v.onChanged = () => this.syncSel();
    v.onCommit = () => { this.save(); this.queueHistory(); };
    v.onConfirm = (msg, yes) => this.confirm(msg, yes);
    v.onToolChanged = t => this.markTool(t);
    v.onChoose = (title, items, pick) => Dialog.open({ title, items, onItem: pick, buttons: [{ text: 'Cancel' }] });
    v.onMotor = on => { this.playBtn.textContent = on ? '■ Stop' : '▶ Play'; this.playBtn.classList.toggle('on', on); };

    v.cleanAlways = store.bool('clean', false);
    v.gravity = store.num('gravity', 0) | 0;
    v.playOnce = store.bool('playOnce', false);
    v.playDir = store.num('playDir', 1) < 0 ? -1 : 1;
    v.degPerSec = store.num('degPerSec', 45);
    v.mmPerSec = store.num('mmPerSec', 20);
    v.collide = store.bool('collide', true);
    this.mmStep = store.num('mmStep', 1); this.inStep = store.num('inStep', 0.1); this.angStep = store.num('angStep', 1);
    Units.inch = store.bool('inch', false);
    this.projectName = store.get('projectName');
    this.solHold = store.bool('solHold', false);

    setTimeout(() => store.set('starting', false), 1500);
    if (recovered) {
      this.projectName = null;
      setTimeout(() => { this.status.textContent = `The app froze last time, so it opened empty. Your design is saved as "${recovered}" in Projects → Open.`; }, 50);
    }
    this.history.push(this.s.toJson()); this.histIdx = 0;
    // keep undo history across closing / reopening the app
    try {
      const h = JSON.parse(store.get('hist', 'null'));
      if (h && Array.isArray(h.list) && h.list[h.idx] === this.history[0]) { this.history = h.list; this.histIdx = h.idx; }
    } catch { }

    this.syncPlay(); this.syncTitle(); this.syncSteps(); this.syncCollide(); this.syncUnits(); this.syncClean(); this.syncGravity();
    this.setTool(Tool.MOVE);
    this.syncSel();
    v.ensureSprings();

    // save when the page is hidden / closed (iPhone kills background tabs)
    document.addEventListener('visibilitychange', () => { if (document.hidden) { v.stopMotor(); this.save(); } });
    addEventListener('pagehide', () => this.save());
    addEventListener('keydown', e => this.key(e));
  }

  // ---------- layout ----------
  buildUi() {
    const B = (text, on, cls = '') => el('button', { class: 'b ' + cls, text, onclick: on });
    this.titleBar = el('div', { id: 'title', onclick: () => this.showProjects() });
    this.calcText = el('pre', { id: 'calc' }); this.calcText.hidden = true;
    this.status = el('div', { id: 'status' });

    // selected-part rows
    this.playBtn = B('▶ Play', () => { const v = this.view; if (v.motorBody) v.stopMotor(); else { const b = this.selected(); if (b) v.startMotor(b); } }, 'accent');
    this.solBtn = this.solenoidButton();
    this.solModeBtn = B('', () => {
      this.solHold = !this.solHold; store.set('solHold', this.solHold); this.syncSel();
      this.say(this.solHold ? 'Solenoid button: HOLD. Press and hold ⚡ = ON, let go = OFF (like a push button).' : 'Solenoid button: SWITCH. Tap ⚡ once = ON, tap again = OFF.');
    });
    this.modeBtn = B('', () => { this.view.playOnce = !this.view.playOnce; store.set('playOnce', this.view.playOnce); this.syncPlay(); });
    this.dirBtn = B('', () => { this.view.playDir = -this.view.playDir; store.set('playDir', this.view.playDir); this.syncPlay(); });
    this.fallsBtn = B('Falls: NO', () => this.toggleFalls());
    this.strongBtn = B('Strong: OFF', () => this.withSel(b => {
      const nv = !b.strong; this.s.weldGroupOf(b).forEach(m => { m.strong = nv; });
      this.view.commitEdit(); this.syncSel();
      this.say(nv ? `${b.name} is strong: it holds its position and can't be pushed back.` : `${b.name} is normal: other parts can push it.`);
    }));
    this.lockBtn = B('Lock', () => this.withSel(b => { b.fixed = !b.fixed; this.view.commitEdit(); this.syncSel(); }));
    this.selName = el('div', { id: 'selname' });
    const selBtns = el('div', { class: 'scroll' },
      this.playBtn, this.solBtn, this.solModeBtn, this.modeBtn, this.dirBtn,
      B('Speed', () => this.withSel(b => this.askSpeed(b))),
      B('Spring', () => this.withSel(b => this.askSpring(b))),
      this.fallsBtn, this.strongBtn,
      B('Front', () => this.withSel(b => { this.s.toFront(b); this.view.commitEdit(); this.say(`${b.name} is in front.`); })),
      B('Back', () => this.withSel(b => { this.s.toBack(b); this.view.commitEdit(); this.say(`${b.name} is at the back.`); })),
      B('Size', () => this.withSel(b => this.showSize(b))),
      B('🎨 Color', () => this.withSel(b => this.askColor(b))),
      B('✏️ Name', () => this.withSel(b => this.askName(b))),
      this.lockBtn);

    this.edX = this.numEdit(v => this.withSel(b => this.view.setPose(b, Units.fromUser(v), null, null)));
    this.edY = this.numEdit(v => this.withSel(b => this.view.setPose(b, null, Units.fromUser(v), null)));
    this.edA = this.numEdit(v => this.withSel(b => this.view.setPose(b, null, null, v)));
    const stepMm = () => Units.inch ? this.inStep * 25.4 : this.mmStep;
    const nud = (dx, dy, da) => () => this.withSel(b => this.view.nudge(b, dx(), dy(), da()));
    const z = () => 0;
    this.mmStepBtn = B('', () => {
      if (Units.inch) this.askStep('Move step (inch)', this.inStep, [0.001, 0.01, 0.0625, 0.1, 0.25, 1], v => { this.inStep = v; this.saveSteps(); });
      else this.askStep('Move step (mm)', this.mmStep, undefined, v => { this.mmStep = v; this.saveSteps(); });
    });
    this.angStepBtn = B('', () => this.askStep('Rotate step (°)', this.angStep, undefined, v => { this.angStep = v; this.saveSteps(); }));
    const rowXY = el('div', { class: 'row' },
      el('span', { class: 'lbl', text: 'X' }), this.edX,
      this.repeatBtn('◀', nud(() => -stepMm(), z, z)), this.repeatBtn('▶', nud(stepMm, z, z)),
      el('span', { class: 'lbl', text: 'Y' }), this.edY,
      this.repeatBtn('▼', nud(z, () => -stepMm(), z)), this.repeatBtn('▲', nud(z, stepMm, z)));
    const rowA = el('div', { class: 'row' },
      el('span', { class: 'lbl', text: '∠' }), this.edA,
      this.repeatBtn('↻', nud(z, z, () => -this.angStep)), this.repeatBtn('↺', nud(z, z, () => this.angStep)),
      this.mmStepBtn, this.angStepBtn);
    this.selBox = el('div', { id: 'selbox' }, el('div', { class: 'row' }, this.selName, selBtns), rowXY, rowA);

    // tools row
    this.cleanBtn = B('', () => {
      const v = this.view; v.cleanAlways = !v.cleanAlways; if (v.cleanAlways) v.select(null);
      store.set('clean', v.cleanAlways); this.syncClean();
    });
    const tools = el('div', { class: 'scroll' }, this.cleanBtn, B('↶ Undo', () => this.undo()), B('↷ Redo', () => this.redo()));
    for (const t of TOOLS) {
      const b = B(t.label, () => (t === Tool.MEASURE ? this.askMeasure() : this.setTool(t)), 'tool');
      this.toolBtns.set(t, b); tools.append(b);
    }

    // add parts + misc row
    this.unitsBtn = B('', () => { Units.inch = !Units.inch; store.set('inch', Units.inch); this.syncUnits(); });
    this.gravityBtn = B('', () => this.setGravity((this.view.gravity + 1) % 5));
    this.collideBtn = B('', () => { this.view.collide = !this.view.collide; store.set('collide', this.view.collide); this.syncCollide(); });
    const adds = el('div', { class: 'scroll' },
      B('? Help', () => this.showHelp()), B('Projects', () => this.showProjects()), B('CNC Export', () => this.showCncExport()),
      B('+ Rect', () => this.addPart(BodyType.RECT)), B('+ Gear', () => this.addPart(BodyType.GEAR)),
      B('+ Rail', () => this.addPart(BodyType.RAIL)), B('+ Tube', () => this.addPart(BodyType.TUBE)),
      B('+ Pulley', () => this.addPart(BodyType.PULLEY)), B('+ Disc', () => this.addPart(BodyType.DISC)), B('+ Circle', () => this.addCircle()),
      B('+ Solenoid', () => this.addSolenoid()), B('+ Rack', () => this.addPart(BodyType.RACK)),
      this.unitsBtn, this.gravityBtn, this.collideBtn,
      B('Fit', () => this.view.fit()),
      B('Clear trace', () => { this.s.trace.length = 0; this.s.recordTrace(); this.view.refresh(); }),
      B('New', () => this.confirm('Clear everything?', () => { this.s.clear(); this.view.select(null); this.view.commitEdit(); this.view.fit(); this.forgetProjectName(); })),
      B('Demo', () => this.confirm('Replace with the demo?', () => { this.s.buildDemo(); this.view.select(null); this.view.commitEdit(); this.view.fit(); this.forgetProjectName(); })));

    const panel = el('div', { id: 'panel' }, this.calcText, this.status, this.selBox, tools, adds);
    const app = $('#app');
    app.append(this.titleBar, el('div', { id: 'stage' }, el('canvas', { id: 'sim' }), this.zoomButtons()), panel);
  }

  zoomButtons() {
    const z = (t, k) => el('button', { class: 'zb', text: t, onclick: () => this.view.zoomBy(k) });
    return el('div', { id: 'zoom' }, z('+', 1.4), z('−', 1 / 1.4));
  }

  key(e) {
    if (Dialog.stack.length || /INPUT|TEXTAREA/.test(document.activeElement?.tagName ?? '')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
    else if (e.key === 'Escape') { this.setTool(Tool.MOVE); this.view.select(null); }
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      const b = this.selected(); if (!b) return;
      this.confirm(`Delete ${b.name} and its joints?`, () => { this.s.remove(b); this.view.select(null); this.view.commitEdit(); this.say(`${b.name} deleted. Undo brings it back.`); });
    } else if (e.key === ' ') { e.preventDefault(); this.playBtn.click(); }
  }

  // ---------- helpers ----------
  say(t) { this.status.textContent = t; }
  selected() { const b = this.view?.selected; return b && this.s.bodies.includes(b) ? b : null; }
  withSel(fn) { const b = this.selected(); if (b) fn(b); }
  confirm(msg, yes) { Dialog.open({ body: el('div', { class: 'dlg-msg', text: msg }), buttons: [{ text: 'No' }, { text: 'Yes', primary: true, on: yes }] }); }

  numEdit(onCommit) {
    const e = el('input', { type: 'text', class: 'num', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done' });
    const commit = () => { const v = Calc.eval(e.value); e.blur(); if (v != null) onCommit(v); else this.syncSel(); };
    e.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    e.addEventListener('focus', () => setTimeout(() => e.select(), 0));
    e.addEventListener('blur', () => setTimeout(() => this.syncSel(), 0));
    return e;
  }

  // runs once on press, then repeats while held
  repeatBtn(text, action) {
    const b = el('button', { class: 'b rep', text });
    (this.repBtns ??= []).push(b);
    let t1 = 0, t2 = 0;
    const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = 0; b.classList.remove('down'); this.view.stepping = false; };
    b.addEventListener('pointerdown', e => {
      e.preventDefault(); b.setPointerCapture?.(e.pointerId); b.classList.add('down');
      this.view.stepping = true; action();
      t1 = setTimeout(() => { t2 = setInterval(action, 70); }, 400);
    });
    b.addEventListener('pointerup', stop); b.addEventListener('pointercancel', stop); b.addEventListener('lostpointercapture', stop);
    b.addEventListener('contextmenu', e => e.preventDefault());
    return b;
  }

  askStep(title, cur, quick = [0.1, 0.5, 1, 5, 10], set) {
    const inp = input(num(cur), 'e.g. 10/4');
    const apply = () => { const v = Calc.eval(inp.value); if (v != null && v > 0) set(v); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { d.close(); apply(); } });
    const d = Dialog.open({ title, body: inp, items: quick.map(num), onItem: i => set(quick[i]), buttons: [{ text: 'Cancel' }, { text: 'Set', primary: true, on: apply }] });
  }

  // ---------- syncs ----------
  syncCollide() { this.collideBtn.textContent = this.view.collide ? 'Block: ON' : 'Block: OFF'; this.collideBtn.classList.toggle('on', this.view.collide); }
  syncPlay() { this.modeBtn.textContent = this.view.playOnce ? 'Once' : 'Loop'; this.dirBtn.textContent = this.view.playDir > 0 ? 'Dir ↺ →' : 'Dir ↻ ←'; }
  setGravity(g) { this.view.gravity = g; store.set('gravity', g); this.syncGravity(); this.syncSel(); }
  syncGravity() {
    this.gravityBtn.textContent = ['Gravity: OFF', 'Gravity ↓', 'Gravity ←', 'Gravity →', 'Gravity ↑'][this.view.gravity] ?? 'Gravity: OFF';
    this.gravityBtn.classList.toggle('on', this.view.gravity !== 0);
  }
  syncClean() { this.cleanBtn.textContent = this.view.cleanAlways ? '👁 View: clean' : '👁 View'; this.cleanBtn.classList.toggle('on', this.view.cleanAlways); }
  syncUnits() { this.unitsBtn.textContent = Units.inch ? 'Units: inch' : 'Units: mm'; this.syncSteps(); this.syncSel(); this.view.refresh(); }
  syncSteps() {
    this.mmStepBtn.textContent = `Step ${fmtTrim(Units.inch ? this.inStep : this.mmStep)} ${Units.label}`;
    this.angStepBtn.textContent = `Step ${num(this.angStep)}°`;
  }
  saveSteps() { store.set('mmStep', this.mmStep); store.set('inStep', this.inStep); store.set('angStep', this.angStep); this.syncSteps(); }
  syncTitle() {
    this.titleBar.innerHTML = '';
    this.titleBar.append(el('span', { class: 'app', text: 'fox9nerMator' }), el('span', { class: 'ver', text: ` v${VERSION}` }), el('span', { class: 'proj', text: `  ·  ${this.projectName ?? 'Untitled'}` }));
    document.title = `${this.projectName ?? 'Untitled'} · fox9nerMator`;
  }
  forgetProjectName() { this.projectName = null; store.del('projectName'); this.syncTitle(); }
  setTool(t) { this.view.tool = t; this.markTool(t); }
  markTool(t) { for (const [k, b] of this.toolBtns) b.classList.toggle('on', k === t); }

  syncSel() {
    const b = this.selected();
    if (!b) { this.selBox.hidden = true; return; }
    this.selBox.hidden = false;
    this.selName.textContent = b.name + (b.fixed ? '  (locked)' : '');
    this.lockBtn.textContent = b.fixed ? 'Unlock' : 'Lock';
    const locked = this.view.isLocked(b);
    for (const e of [this.edX, this.edY, this.edA, ...(this.repBtns ?? [])]) e.disabled = locked;
    this.selBox.classList.toggle('locked', locked);
    this.strongBtn.textContent = b.strong ? 'Strong: ON' : 'Strong: OFF';
    this.strongBtn.classList.toggle('on', !!b.strong);
    const sj = this.s.solenoidOf(b);
    this.solBtn.textContent = !sj ? '⚡ Solenoid' : sj.sol === 2 ? '⚡ ON' : '⚡ OFF';
    this.solBtn.classList.toggle('warn', sj?.sol === 2);
    this.solModeBtn.hidden = !sj;
    this.solModeBtn.textContent = this.solHold ? 'Button: Hold' : 'Button: Switch';
    this.fallsBtn.textContent = b.noGravity ? 'Falls: NO' : this.view.gravity === 0 ? 'Falls: YES (Gravity OFF)' : 'Falls: YES';
    const a = document.activeElement;
    if (a !== this.edX) this.edX.value = fmtLen(b.x);
    if (a !== this.edY) this.edY.value = fmtLen(b.y);
    if (a !== this.edA) this.edA.value = fmt(wrapPi(b.a) * 180 / PI);
  }

  // ---------- part actions ----------
  addPart(type) {
    const c = this.view.centerWorld();
    const b = this.s.add(type, c.x, c.y);
    this.setTool(Tool.MOVE); this.view.select(b); this.view.commitEdit();
    this.say(`${b.name} added. Drag it into place, then use Pin / Slide / Mesh.`);
  }
  addCircle() {
    const c = this.view.centerWorld();
    const b = this.s.add(BodyType.DISC, c.x, c.y);
    b.plain = true; b.w = 60; b.h = 60;
    this.setTool(Tool.MOVE); this.view.select(b); this.view.commitEdit();
    this.say(`${b.name} added (plain disc, ⌀ ${fmtLen(60)} ${Units.label}). Change it with Size. Pin it in the center to make a wheel or cam.`);
  }
  addSolenoid() {
    Dialog.open({
      title: 'Solenoid type', items: ['Pull: plunger pulls IN when ON', 'Push: plunger pushes OUT when ON'], buttons: [{ text: 'Cancel' }],
      onItem: i => {
        const c = this.view.centerWorld();
        const coil = this.s.addSolenoid(c.x, c.y, i === 1);
        this.setTool(Tool.MOVE); this.view.select(coil); this.view.commitEdit();
        this.say(`${coil.name} added (locked, stroke ${fmtLen(coil.stroke)} ${Units.label}). Pin or weld its plunger to your latch, then tap ⚡ to switch it.`);
      },
    });
  }
  // ⚡ button: SWITCH = tap toggles; HOLD = ON while pressed, OFF on release
  solenoidButton() {
    const b = el('button', { class: 'b', text: '⚡ Solenoid' });
    let held = false;
    const release = () => { if (!held) return; held = false; b.classList.remove('down'); this.setSol(false); };
    b.addEventListener('pointerdown', e => {
      if (!this.solHold) return;
      e.preventDefault(); b.setPointerCapture?.(e.pointerId);
      const sel = this.selected(); if (!sel || !this.s.solenoidOf(sel)) { this.toggleSolenoid(); return; }
      held = true; b.classList.add('down'); this.setSol(true);
    });
    b.addEventListener('pointerup', release); b.addEventListener('pointercancel', release); b.addEventListener('lostpointercapture', release);
    b.addEventListener('contextmenu', e => e.preventDefault());
    b.addEventListener('click', () => { if (!this.solHold) this.toggleSolenoid(); });
    return b;
  }
  setSol(on) {
    const b = this.selected(); if (!b) return;
    const j = this.s.solenoidOf(b); if (!j) return;
    if ((j.sol === 2) === on) return;
    this.s.setSolenoid(j, on); this.view.commitEdit(); this.syncSel();
    this.say(on ? '⚡ ON (holding): the coil drives the plunger.' : 'Released: OFF, the spring returns the plunger.');
  }
  toggleSolenoid() {
    const b = this.selected(); if (!b) return;
    const j = this.s.solenoidOf(b);
    if (!j) { this.say(`${b.name} isn't a solenoid. Add one with + Solenoid.`); return; }
    const on = j.sol !== 2;
    this.s.setSolenoid(j, on); this.view.commitEdit(); this.syncSel();
    this.say(on ? '⚡ ON: the coil drives the plunger.' : 'OFF: the spring returns the plunger.');
  }
  toggleFalls() {
    this.withSel(b => {
      if (!b.noGravity && this.view.gravity === 0) { this.setGravity(1); this.say(`Gravity ON (↓): ${b.name} falls.`); this.syncSel(); return; }
      const nv = !b.noGravity;
      this.s.weldGroupOf(b).forEach(m => { m.noGravity = nv; });
      if (!nv && this.view.gravity === 0) this.setGravity(1);
      this.view.commitEdit(); this.syncSel();
      this.say(nv ? `${b.name} floats (no weight).` : `${b.name} falls with gravity.`);
    });
  }
  askSpring(b) {
    const j = this.view.springSlideOf(b);
    if (!j) {
      const p = this.view.pinOf(b);
      if (!p) { this.say(`A spring needs a Slide or a Pin. Slide or pin ${b.name} first.`); return; }
      this.askTorsion(b, p); return;
    }
    Dialog.open({
      title: `Spring on ${b.name}` + (j.spring === 1 ? ' (has one)' : ''), buttons: [{ text: 'Cancel' }],
      items: ['Push → (toward the + end)', 'Pull ← (toward the − end)', 'Return here (rest = where it is now)', 'Remove spring'],
      onItem: i => {
        const mode = [1, 2, 3, 0][i];
        this.s.setSpring(j, mode); this.view.commitEdit();
        this.say(['Spring removed.', `Spring pushes ${b.name} toward the + end. Move it and let go.`,
          `Spring pulls ${b.name} toward the − end. Move it and let go.`, `Spring returns ${b.name} to this spot. Move it and let go.`][mode]);
      },
    });
  }
  askTorsion(b, j) {
    Dialog.open({
      title: `Torsion spring on ${b.name}` + (j.spring === 1 ? ' (has one)' : ''), buttons: [{ text: 'Cancel' }],
      items: ['Turn ↺ (counter-clockwise)', 'Turn ↻ (clockwise)', 'Return to this angle', 'Remove spring'],
      onItem: i => {
        const mode = [1, 2, 3, 0][i];
        this.s.setTorsion(j, mode); this.view.commitEdit();
        this.say(['Spring removed.', `Spring turns ${b.name} ↺ until it's blocked (max half a turn). Rotate it and let go.`,
          `Spring turns ${b.name} ↻ until it's blocked (max half a turn). Rotate it and let go.`, `Spring swings ${b.name} back to this angle. Rotate it and let go.`][mode]);
      },
    });
  }
  askSpeed(b) {
    const v = this.view;
    if (v.slideOf(b)) {
      const quick = Units.inch ? [0.25, 0.5, 1, 2, 4] : [5, 10, 20, 50, 100];
      this.askStep(`Slide speed (${Units.label} per second)`, +Units.toUser(v.mmPerSec).toFixed(4), quick, x => { v.mmPerSec = Units.fromUser(x); store.set('mmPerSec', v.mmPerSec); });
    } else this.askStep('Spin speed (degrees per second)', v.degPerSec, [10, 30, 45, 90, 180], x => { v.degPerSec = x; store.set('degPerSec', x); });
  }

  askColor(b) {
    const COLS = [['#E53935', 'Red'], ['#FB8C00', 'Orange'], ['#FDD835', 'Yellow'], ['#7CB342', 'Lime'], ['#2E9D57', 'Green'], ['#00ACC1', 'Teal'],
      ['#1E88E5', 'Blue'], ['#5C6BC0', 'Indigo'], ['#8E24AA', 'Purple'], ['#D81B60', 'Pink'], ['#8D6E63', 'Brown'], ['#ECEFF1', 'White'], ['#90A4AE', 'Grey'], ['#455A64', 'Slate']];
    const g = this.s.weldGroupOf(b);
    const apply = (c) => { g.forEach(m => { m.color = c; }); this.view.commitEdit(); this.say(c ? `${b.name}${g.length > 1 ? ' (+ welded parts)' : ''} colored.` : `${b.name} back to its normal color.`); };
    const grid = el('div', { class: 'swatches' }, ...COLS.map(([c, n]) => el('button', { class: 'sw' + (b.color === c ? ' on' : ''), style: `background:${c}`, title: n, 'aria-label': n, onclick: () => { d.close(); apply(c); } })));
    const d = Dialog.open({ title: `Color for ${b.name}`, body: grid, buttons: [{ text: 'Default color', on: () => apply(null) }, { text: 'Cancel' }] });
  }
  askName(b) {
    const inp = input(b.label, b.autoName);
    inp.maxLength = 40;
    const go = () => { const old = b.name; b.label = inp.value.trim().slice(0, 40); this.view.commitEdit(); this.syncSel(); this.say(b.label ? `${old} is now called "${b.label}".` : `${b.name}: automatic name again.`); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { d.close(); go(); } });
    const d = Dialog.open({ title: `Name for ${b.autoName}`, body: el('div', {}, inp, el('div', { class: 'dlg-note', text: 'e.g. Bolt, Latch, Base plate. Empty = automatic name. The name shows on the part and in the CNC export.' })),
      buttons: [{ text: 'Cancel' }, { text: 'Save', primary: true, on: go }] });
  }
  showSize(b) {
    const len = (label, mm, set) => [`${label} (${Units.label})`, Units.toUser(mm), v => set(Units.fromUser(v))];
    const T = BodyType;
    const fields = {
      [T.DISC]: () => [len('Diameter', b.w, v => { b.w = v; b.h = v; })],
      [T.PULLEY]: () => [len('Diameter', b.w, v => { b.w = v; b.h = v; })],
      [T.SOLENOID]: () => [len('Coil length', b.w, v => { b.w = v; }), len('Coil width', b.h, v => { b.h = v; }), len('Stroke', b.stroke, v => { b.stroke = v; })],
      [T.TUBE]: () => [len('Length', b.w, v => { b.w = v; }), len('Outer width', b.h, v => { b.h = v; }), len('Wall thickness', b.wall, v => { b.wall = v; })],
      [T.RECT]: () => [len('Length', b.w, v => { b.w = v; }), len('Width', b.h, v => { b.h = v; })],
      [T.GEAR]: () => [['Teeth', b.teeth, v => { b.teeth = Math.max(6, Math.round(v)); }], ['Module (mm)', b.module, v => { b.module = v; }]],
      [T.RAIL]: () => [len('Length', b.w, v => { b.w = v; }), len('Diameter', b.h, v => { b.h = v; })],
      [T.RACK]: () => [len('Length', b.w, v => { b.w = v; }), len('Height', b.h, v => { b.h = v; }), ['Module (mm)', b.module, v => { b.module = v; }]],
    }[b.type]();
    const box = el('div');
    const inputs = fields.map(([name, value]) => { const i = input(name === 'Teeth' ? String(Math.round(value)) : fmtTrim(value)); box.append(fieldRow(name, i)); return i; });
    if (b.type === T.GEAR) box.append(el('div', { class: 'dlg-note', text: 'Pitch radius = module × teeth ÷ 2' }));
    const apply = () => {
      fields.forEach((f, i) => { const v = Calc.eval(inputs[i].value); if (v != null && v > 0) f[2](v); });
      this.s.rebuildJointsOf(b); this.view.commitEdit(); this.syncSel();
    };
    inputs.forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { d.close(); apply(); } }));
    const d = Dialog.open({ title: `${b.name} size`, body: box, buttons: [{ text: 'Cancel' }, { text: 'Apply', primary: true, on: apply }] });
  }

  // ---------- help ----------
  helpHeader() {
    return el('div', { class: 'help-head' },
      el('img', { src: 'icons/icon-192.png', alt: '' }),
      el('div', {},
        el('div', { class: 'h1', text: 'fox9nerMator' }),
        el('div', { class: 'h2', text: `Version ${VERSION}  ·  by Fox9ner` }),
        el('div', { class: 'h3', text: 'Design it. Move it. Cut it.' })));
  }
  showHelp() {
    Dialog.open({ titleEl: this.helpHeader(), items: Help.sections.map(s => s[0]), onItem: i => this.showHelpSection(i), buttons: [{ text: 'Close' }] });
  }
  showHelpSection(i) {
    const [title, html] = Help.sections[i];
    const buttons = [{ text: 'All topics', on: () => this.showHelp() }, { text: 'Close' }];
    if (i + 1 < Help.sections.length) buttons.push({ text: 'Next', primary: true, on: () => this.showHelpSection(i + 1) });
    Dialog.open({ title, body: el('div', { class: 'help-text', html: html.trim() }), buttons });
  }

  // ---------- CNC export ----------
  showCncExport() {
    const sel = this.selected();
    Dialog.open({
      title: 'Export for cutting: which parts?', buttons: [{ text: 'Cancel' }],
      items: ['All parts', sel ? `Selected: ${sel.name} (+ parts welded to it)` : 'Selected part (tap a part first)'],
      onItem: i => {
        if (i === 1 && !sel) { this.say('Tap a part first, then CNC Export.'); return; }
        this.askHole(i === 0 ? [...this.s.bodies] : [sel]);
      },
    });
  }
  askHole(parts) {
    const sizes = [3.4, 4.5, 5.5, 6.6, 8.2];
    Dialog.open({
      title: 'Pin hole size', buttons: [{ text: 'Cancel' }],
      items: ['M3 bolt → 3.4 mm hole', 'M4 bolt → 4.5 mm hole', 'M5 bolt → 5.5 mm hole', 'M6 bolt → 6.6 mm hole', '8 mm shaft → 8.2 mm hole', 'Other size…'],
      onItem: i => {
        if (i < sizes.length) this.askCncFormat(parts, sizes[i]);
        else this.askStep(`Hole diameter (${Units.label})`, +Units.toUser(5.5).toFixed(4), Units.inch ? [0.125, 0.1875, 0.25, 0.3125] : [3, 4, 5, 6, 8], v => this.askCncFormat(parts, Units.fromUser(v)));
      },
    });
  }
  askCncFormat(parts, holeMm) {
    Dialog.open({
      title: 'File type', items: ['DXF (CAM software / CNC)', 'SVG (Inkscape / laser)'], buttons: [{ text: 'Cancel' }],
      onItem: async i => {
        const r = Exporter.build(this.s, parts, holeMm);
        if (!r.pieces.length) { this.say('Nothing to cut: rails and tubes are bought stock.'); return; }
        const dxf = i === 0;
        const text = dxf ? Exporter.toDxf(r) : Exporter.toSvg(r);
        const summary = `${r.pieces.length} piece(s), ${r.width.toFixed(0)} × ${r.height.toFixed(0)} mm, holes ${holeMm.toFixed(1)} mm.` + (r.notes.length ? '\n\n' + r.notes.join('\n\n') : '');
        const name = `${this.projectName ?? 'parts'}.${dxf ? 'dxf' : 'svg'}`;
        const ok = await shareOrDownload(name, text, dxf ? 'application/dxf' : 'image/svg+xml');
        if (!ok) return;
        this.say('Exported for cutting.');
        const body = el('div', {}, el('div', { class: 'dlg-msg', text: summary }));
        if (!dxf) { const img = el('img', { class: 'preview', alt: 'preview', src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(text) }); body.prepend(img); }
        Dialog.open({ title: 'Exported', body, buttons: [{ text: 'OK', primary: true }] });
      },
    });
  }

  // ---------- projects ----------
  showProjects() {
    const cur = this.projectName, items = [], acts = [];
    if (cur) { items.push(`Save "${cur}"`); acts.push(() => this.writeProject(cur)); }
    items.push('Save as new…'); acts.push(() => this.saveAs());
    items.push('Open…'); acts.push(() => this.openProject());
    items.push('Delete a project…'); acts.push(() => this.deleteProject());
    items.push('Export to file (backup / share)…'); acts.push(() => this.exportFile());
    items.push('Import from file…'); acts.push(() => this.importFile());
    Dialog.open({ title: cur ? `Projects — now: ${cur}` : 'Projects', items, onItem: i => acts[i](), buttons: [{ text: 'Close' }] });
  }
  writeProject(name) {
    try {
      projects.write(name, this.s.toJson());
      this.projectName = name; store.set('projectName', name);
      this.say(`Saved "${name}".`); this.syncTitle();
    } catch (e) { this.say(`Couldn't save: ${e.message}`); }
  }
  saveAs() {
    const inp = input(this.projectName ?? '', 'Door lock v1');
    const go = () => {
      const name = cleanName(inp.value);
      if (!name) { this.say('Type a name first.'); return; }
      if (projects.exists(name) && name !== this.projectName) this.confirm(`"${name}" already exists. Replace it?`, () => this.writeProject(name));
      else this.writeProject(name);
    };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { d.close(); go(); } });
    const d = Dialog.open({ title: 'Save project as', body: inp, buttons: [{ text: 'Cancel' }, { text: 'Save', primary: true, on: go }] });
  }
  openProject() {
    const names = projects.list();
    if (!names.length) { this.say('No saved projects yet. Use Save as new.'); return; }
    Dialog.open({
      title: 'Open project', items: names, buttons: [{ text: 'Cancel' }],
      onItem: i => this.confirm(`Open "${names[i]}"? The design on screen will be replaced (save it first if you need it).`, () => this.loadProject(projects.read(names[i]), names[i])),
    });
  }
  deleteProject() {
    const names = projects.list();
    if (!names.length) { this.say('No saved projects.'); return; }
    Dialog.open({
      title: 'Delete project', items: names, buttons: [{ text: 'Cancel' }],
      onItem: i => this.confirm(`Delete "${names[i]}" for good? This can't be undone.`, () => {
        projects.remove(names[i]);
        if (this.projectName === names[i]) { this.projectName = null; store.del('projectName'); }
        this.say(`Deleted "${names[i]}".`); this.syncTitle();
      }),
    });
  }
  loadProject(json, name) {
    if (!json || !this.s.loadJson(json)) { this.say("That file isn't a fox9nerMator project."); return; }
    this.view.afterReload(-1); this.view.fit();
    this.history = [this.s.toJson()]; this.histIdx = 0; this.saveHist();
    this.save();
    this.projectName = name;
    if (name) store.set('projectName', name); else store.del('projectName');
    this.syncSel();
    this.say(name ? `Opened "${name}".` : 'Imported.');
    this.syncTitle();
    this.view.ensureSprings();
  }
  async exportFile() {
    const ok = await shareOrDownload(`${this.projectName ?? 'design'}.f9m.json`, this.s.toJson(), 'application/json');
    if (ok) this.say('Exported. Keep the file as a backup or send it to another phone.');
  }
  importFile() {
    pickFile('.json,.f9m,application/json,text/plain', (text, fname) => {
      this.confirm('Import this file? The design on screen will be replaced.', () => {
        const base = fname.replace(/\.json$/i, '').replace(/\.f9m$/i, '');
        this.loadProject(text, cleanName(base) || 'imported');
      });
    });
  }

  // ---------- undo / redo ----------
  queueHistory() { clearTimeout(this.histTimer); this.histTimer = setTimeout(() => this.pushHistory(), 400); }
  pushHistory() {
    clearTimeout(this.histTimer);
    const js = this.s.toJson();
    if (this.histIdx >= 0 && this.history[this.histIdx] === js) return;
    this.history.length = this.histIdx + 1;
    this.history.push(js);
    if (this.history.length > 60) this.history.shift();
    this.histIdx = this.history.length - 1;
    this.saveHist();
  }
  saveHist() {
    clearTimeout(this.histSaveT);
    this.histSaveT = setTimeout(() => {
      // newest 30 steps, and not more than ~1.5 MB
      let from = Math.max(0, this.history.length - 30), size = 0;
      for (let i = this.history.length - 1; i >= from; i--) { size += this.history[i].length; if (size > 1.5e6) { from = i + 1; break; } }
      const list = this.history.slice(from), idx = this.histIdx - from;
      if (idx < 0) return;
      store.set('hist', JSON.stringify({ list, idx }));
    }, 500);
  }
  restoreHist(idx) {
    const sel = this.view.selected?.id ?? -1;
    if (!this.s.loadJson(this.history[idx])) return;
    this.histIdx = idx;
    this.view.afterReload(sel); this.save(); this.syncSel(); this.view.ensureSprings(); this.saveHist();
  }
  undo() { this.pushHistory(); if (this.histIdx <= 0) { this.say('Nothing to undo.'); return; } this.restoreHist(this.histIdx - 1); this.say('Undone.'); }
  redo() { if (this.histIdx >= this.history.length - 1) { this.say('Nothing to redo.'); return; } this.restoreHist(this.histIdx + 1); this.say('Redone.'); }
  save() { store.set('scene', this.s.toJson()); }

  // ---------- measure ----------
  askMeasure() {
    Dialog.open({
      title: 'Measure', buttons: [{ text: 'Cancel' }],
      items: ['📏 Distance  (Pythagoras: a, b → c)', '∠ Angle  (3 points)', '➰ Travel: how far a point moves  (path, straight, arc s = r × θ)',
        '✖ Where 2 distance lines cross', '〰 Where the trace path crosses a line', '↔ Smallest gap between 2 parts',
        '🧮 Pythagoras calculator (type your own values)', 'Reset travel and smallest gap (start counting again)',
        'Delete the last measurement', 'Clear all measurements'],
      onItem: i => {
        if (i <= 5) { this.setTool(Tool.MEASURE); this.view.measureKind = [MK.DIST, MK.ANGLE, MK.TRAVEL, MK.CROSS, MK.TRACECROSS, MK.GAP][i]; }
        else if (i === 6) this.showPythagoras();
        else if (i === 7) { this.view.resetMeasures(); this.say('Travel and smallest gap reset.'); }
        else if (i === 8) { this.s.measures.pop(); this.view.commitEdit(); this.say('Last measurement deleted.'); }
        else this.confirm('Delete all measurements?', () => { this.s.measures.length = 0; this.view.commitEdit(); this.say('Measurements cleared.'); });
      },
    });
  }

  editDistance(m) {
    const pq = MeasureCalc.distPts(this.s, m); if (!pq) return;
    const [p, q] = pq;
    const a0 = Math.abs(q.x - p.x), b0 = Math.abs(q.y - p.y), c0 = Math.hypot(a0, b0);
    const f = v => Units.toUser(v).toFixed(Units.inch ? 3 : 1);
    const ea = input(f(a0)), eb = input(f(b0)), ec = input(f(c0));
    const box = el('div', {}, el('div', { class: 'dlg-note', text: `Change ONE value, then Apply. The point moves to match (${Units.label}).` }),
      fieldRow('a  (across)', ea), fieldRow('b  (up / down)', eb), fieldRow('c  (straight)', ec));
    const apply = () => {
      const g = e => { const v = Calc.eval(e.value); return v == null ? null : Units.fromUser(v); };
      const na = g(ea), nb = g(eb), nc = g(ec);
      const tol = Units.inch ? 0.0006 * 25.4 : 0.06;
      const dx = q.x - p.x, dy = q.y - p.y, sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
      let nd = null;
      if (na != null && Math.abs(na - a0) > tol) nd = new P2(sx * na, dy);
      else if (nb != null && Math.abs(nb - b0) > tol) nd = new P2(dx, sy * nb);
      else if (nc != null && Math.abs(nc - c0) > tol && c0 > 1e-9) nd = new P2(dx / c0 * nc, dy / c0 * nc);
      if (!nd) { this.say('Nothing changed.'); return; }
      const v = this.view;
      const ok = v.canMoveEnd(m, 1) ? v.setMeasureEnd(m, 1, new P2(p.x + nd.x, p.y + nd.y))
        : v.canMoveEnd(m, 0) ? v.setMeasureEnd(m, 0, new P2(q.x - nd.x, q.y - nd.y)) : false;
      if (!ok) { this.say(`Both ends are on locked parts. Unlock one to change ${m.name}.`); return; }
      const now = MeasureCalc.distPts(this.s, m);
      if (now) {
        const ra = Math.abs(now[1].x - now[0].x), rb = Math.abs(now[1].y - now[0].y), rc = Math.hypot(ra, rb), want = Math.hypot(nd.x, nd.y);
        this.say(`${m.name} now: a = ${f(ra)}, b = ${f(rb)}, c = ${f(rc)} ${Units.label}` +
          (Math.abs(rc - want) > 0.5 || Math.abs(ra - Math.abs(nd.x)) > 0.5 ? '  (joints or a part stopped it from reaching your value)' : ''));
      }
    };
    [ea, eb, ec].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') { d.close(); apply(); } }));
    const d = Dialog.open({ title: `${m.name}  a² + b² = c²`, body: box, buttons: [{ text: 'Calculator', on: () => this.showPythagoras() }, { text: 'Cancel' }, { text: 'Apply', primary: true, on: apply }] });
  }

  showPythagoras() {
    const u = Units.label;
    const cv = el('canvas', { class: 'tri' });
    const tri = { a: 4, b: 3, known: '' };
    const drawTri = () => {
      const r = cv.getBoundingClientRect(), dpr = devicePixelRatio || 1;
      const w = r.width || 280, h = r.height || 160;
      cv.width = w * dpr; cv.height = h * dpr;
      const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      const pad = 34, k = Math.min((w - 2 * pad) / tri.a, (h - 2 * pad) / tri.b);
      const x0 = (w - tri.a * k) / 2, y0 = (h + tri.b * k) / 2, x1 = x0 + tri.a * k, y1 = y0 - tri.b * k;
      const L = (a, b, cc, d, col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(a, b); c.lineTo(cc, d); c.stroke(); };
      L(x0, y0, x1, y0, '#FFD54F', 3); L(x1, y0, x1, y1, '#FFD54F', 3); L(x0, y0, x1, y1, '#3DDC84', 3);
      L(x1 - 14, y0, x1 - 14, y0 - 14, '#9AA4B0', 2); L(x1 - 14, y0 - 14, x1, y0 - 14, '#9AA4B0', 2);
      c.font = 'bold 14px system-ui, sans-serif';
      c.fillStyle = '#FFD54F';
      c.fillText('a' + (tri.known.includes('a') ? '' : ' ?'), (x0 + x1) / 2 - 8, y0 + 18);
      c.fillText('b' + (tri.known.includes('b') ? '' : ' ?'), x1 + 8, (y0 + y1) / 2);
      c.fillStyle = '#3DDC84'; c.fillText('c' + (tri.known.includes('c') ? '' : ' ?'), (x0 + x1) / 2 - 24, (y0 + y1) / 2 - 6);
      c.fillStyle = '#E6EAF0'; c.font = '14px system-ui, sans-serif'; c.fillText('θ', x0 + 22, y0 - 6);
    };
    const ea = input('', '?'), eb = input('', '?'), ec = input('', '?');
    const out = el('pre', { class: 'pyth-out' });
    const box = el('div', {}, cv, el('div', { class: 'dlg-note', text: `Type any 2 sides, leave the unknown one empty (${u}):` }),
      fieldRow('a  (across)', ea), fieldRow('b  (up / down)', eb), fieldRow('c  (slanted, longest)', ec), out);
    const f = v => v.toFixed(Units.inch ? 3 : 2);
    const deg = r => (r * 180 / PI).toFixed(2) + '°';
    const calc = () => {
      document.activeElement?.blur?.();
      const a = Calc.eval(ea.value), b = Calc.eval(eb.value), c = Calc.eval(ec.value);
      let A = a, Bv = b, t = '';
      if (a != null && b != null && a > 0 && b > 0) {
        const r = Math.sqrt(a * a + b * b);
        t = `c = √(a² + b²)\n  = √(${f(a)}² + ${f(b)}²)\n  = √(${f(a * a)} + ${f(b * b)})\n  = √${f(a * a + b * b)}\n  = ${f(r)} ${u}`;
        if (c == null) ec.value = f(r); tri.known = 'a b';
      } else if (c != null && a != null && c > 0 && a > 0) {
        if (a >= c) { out.textContent = 'c must be longer than a (c is always the longest side).'; return; }
        const r = Math.sqrt(c * c - a * a); Bv = r;
        t = `b = √(c² − a²)\n  = √(${f(c)}² − ${f(a)}²)\n  = √(${f(c * c)} − ${f(a * a)})\n  = √${f(c * c - a * a)}\n  = ${f(r)} ${u}`;
        eb.value = f(r); tri.known = 'a c';
      } else if (c != null && b != null && c > 0 && b > 0) {
        if (b >= c) { out.textContent = 'c must be longer than b (c is always the longest side).'; return; }
        const r = Math.sqrt(c * c - b * b); A = r;
        t = `a = √(c² − b²)\n  = √(${f(c)}² − ${f(b)}²)\n  = √(${f(c * c)} − ${f(b * b)})\n  = √${f(c * c - b * b)}\n  = ${f(r)} ${u}`;
        ea.value = f(r); tri.known = 'b c';
      } else { out.textContent = 'Type 2 of the 3 sides (bigger than 0). Math works, e.g. 20/2.'; return; }
      if (A != null && Bv != null) {
        const th = Math.atan2(Bv, A);
        t += `\n\nθ (at the left corner) = atan(b ÷ a) = ${deg(th)}\nother corner = 90° − θ = ${deg(PI / 2 - th)}`;
        tri.a = A; tri.b = Bv;
      }
      out.textContent = t; drawTri();
    };
    [ea, eb, ec].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') calc(); }));
    Dialog.open({
      title: 'Pythagoras  a² + b² = c²', body: box,
      buttons: [{ text: 'Clear', keep: true, on: () => { ea.value = eb.value = ec.value = ''; out.textContent = ''; tri.a = 4; tri.b = 3; tri.known = ''; drawTri(); } },
        { text: 'Close' }, { text: 'Calculate', primary: true, keep: true, on: calc }],
    });
    requestAnimationFrame(drawTri);
  }
}

// ---------- start ----------
function start() {
  try { window.app = new App(); }
  catch (e) {
    console.error(e);
    document.body.innerHTML = `<div style="padding:20px;color:#fff;font:14px system-ui">fox9nerMator couldn't start: ${String(e.message || e)}<br><br><button id="reset" style="padding:10px">Start empty (keeps a copy in Projects)</button></div>`;
    document.getElementById('reset').onclick = () => { store.set('starting', true); location.reload(); };
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
}
start();
