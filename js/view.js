// fox9nerMator web — the drawing canvas: draws parts, handles touch / mouse, runs Play, springs, gravity.
// Port of SimView.kt. World units are mm, world Y points up. Screen units are CSS pixels.

import { P2, BodyType, JointKind, MK, wrapPi } from './model.js';
import { Drive, Solver } from './solver.js';
import { Collision } from './collision.js';
import { MeasureCalc } from './measure.js';
import { Units } from './calc.js';

const PI = Math.PI;
const { abs, atan2, cos, sin, floor, hypot, max, min, sqrt } = Math;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmt = (v, d) => Number(v).toFixed(d);

export const Tool = Object.freeze({
  MOVE: { name: 'MOVE', label: 'Move' }, PIN: { name: 'PIN', label: 'Pin' }, SLIDE: { name: 'SLIDE', label: 'Slide' },
  SLOT: { name: 'SLOT', label: 'Slot' }, MESH: { name: 'MESH', label: 'Mesh' }, BELT: { name: 'BELT', label: 'Belt' },
  WELD: { name: 'WELD', label: 'Weld' }, CUT: { name: 'CUT', label: 'Cut' }, LOCK: { name: 'LOCK', label: 'Lock' }, TRACE: { name: 'TRACE', label: 'Trace' },
  MEASURE: { name: 'MEASURE', label: 'Measure' }, DELETE: { name: 'DELETE', label: 'Delete' },
});
export const TOOLS = [Tool.MOVE, Tool.PIN, Tool.SLIDE, Tool.SLOT, Tool.MESH, Tool.BELT, Tool.WELD, Tool.CUT, Tool.LOCK, Tool.TRACE, Tool.MEASURE, Tool.DELETE];

const Drag = { NONE: 0, BODY: 1, FIXED: 2, ROTATE: 3, PAN: 4, ZOOM: 5 };

const C = {
  bg: '#14171C', minor: '#1E232A', major: '#2B323B', axis: '#46505C', gridText: '#6B7683',
  edge: '#000000', sel: '#FFFFFF', pending: '#FF4FD8', line: 'rgba(0,0,0,0.33)', hole: '#14171C',
  pin: '#FFFFFF', pinFill: '#14171C', ground: '#9AA3AD', slide: '#4FC3F7', mesh: '#FF4FD8', weld: '#FFB300',
  trace: '#3DDC84', handle: '#3DDC84', label: '#FFFFFF', lock: '#FFD54F',
  rect: '#E08A2E', gear: '#C9A227', rail: '#A7B0BA', rack: '#2BB3A3', tube: '#8FA3B8', pulley: '#B8C2CC',
  disc: '#7F8C99', plain: '#5E9ED6', steel: '#B4B2A9', copper: '#B87333', copperOn: '#FF9A3C', glow: '#FFD54F', groove: '#5F6873',
  tubeIn: '#262C34', block: '#4A525C', meas: '#FFD54F', measBg: 'rgba(20,23,28,0.8)', measPath: 'rgba(255,213,79,0.5)',
  belt: '#2C2C2A', chain: '#5F6873', link: '#B4B2A9', beltMark: '#888780', spring: '#D3D1C7',
};

export class SimView {
  constructor(canvas, scene) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.s = scene;
    this.dp = 1;

    // callbacks (same names as the Android app)
    this.onSelect = null; this.onStatus = null; this.onChanged = null; this.onCommit = null;
    this.onConfirm = null; this.onChoose = null; this.onMeasures = null; this.onToolChanged = null;
    this.onEditDistance = null; this.onMotor = null;

    this._measureKind = MK.DIST;
    this.mPending = []; this.mRefs = []; this.lastMeasureText = '';
    this._cleanAlways = false;
    this._stepping = false;
    this.selected = null;
    this.pending = null; this.pendingPt = null;
    this.collide = true;
    this.ignore = new Set();
    this._tool = Tool.MOVE;

    this.scale = 2; this.ox = 0; this.oy = 0; this.fitted = false;
    this.width = 0; this.height = 0;

    this.drag = Drag.NONE; this.grabLx = 0; this.grabLy = 0; this.rotOff = 0;
    this.downX = 0; this.downY = 0; this.lastX = 0; this.lastY = 0; this.moved = false;
    this.pointers = new Map(); this.pinchDist = 0; this.lastTapT = 0; this.lastTapX = 0; this.lastTapY = 0;

    this.lastStatus = ''; this.tapActionDone = false;
    this.gearCache = new Map();

    // motor
    this.degPerSec = 45; this.mmPerSec = 20; this.motorBody = null; this.motorDir = 1; this.lastT = 0;
    this.playOnce = false; this.playDir = 1; this.travelled = 0; this.motorRaf = 0;

    // springs + gravity
    this.springK = 80; this.springC = 12;
    this.springVel = new Map(); this.springWaitUntil = new Map();
    this.springRunning = false; this.springMoving = false; this.springLastT = 0; this.springRaf = 0;
    this._gravity = 0; this.gVel = new Map(); this.gIdleUntil = 0;
    this.G = 9810; this.WORLD = 1e6; this.subSteps = 3;

    this._drawQueued = false;
    this._bindInput();
    new ResizeObserver(() => this._resize()).observe(canvas);
    this._resize();
  }

  // ---------- properties ----------
  get measureKind() { return this._measureKind; }
  set measureKind(v) { this._measureKind = v; this.mPending = []; this.mRefs = []; this.onStatus?.(this.prompt()); this.invalidate(); }
  get cleanAlways() { return this._cleanAlways; }
  set cleanAlways(v) { this._cleanAlways = v; this.invalidate(); }
  get stepping() { return this._stepping; }
  set stepping(v) { this._stepping = v; this.invalidate(); }
  get tool() { return this._tool; }
  set tool(v) { this._tool = v; this.pending = null; this.onStatus?.(this.prompt()); this.invalidate(); }
  get gravity() { return this._gravity; }
  set gravity(v) { this._gravity = v; this.gVel.clear(); this.gIdleUntil = 0; this.ensureSprings(); }
  get clean() {
    return this._cleanAlways || this.motorBody != null || this._stepping ||
      (this.moved && (this.drag === Drag.BODY || this.drag === Drag.ROTATE || this.drag === Drag.FIXED));
  }
  get userDragging() { return this.moved && (this.drag === Drag.BODY || this.drag === Drag.ROTATE || this.drag === Drag.FIXED); }

  // ---------- plumbing ----------
  invalidate() {
    if (this._drawQueued) return;
    this._drawQueued = true;
    requestAnimationFrame(() => { this._drawQueued = false; this.draw(); });
  }
  post(fn) { setTimeout(fn, 0); }
  _resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (w === this.width && h === this.height && this.canvas.width === Math.round(w * dpr)) return;
    const oldW = this.width, oldH = this.height;
    this.width = w; this.height = h;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.fitted) { this.fitted = true; this.fit(); }
    else { this.ox += (w - oldW) / 2; this.oy += (h - oldH) / 2; }
    this.invalidate();
  }

  // ---------- transforms ----------
  sx(x) { return this.ox + x * this.scale; }
  sy(y) { return this.oy - y * this.scale; }
  world(px, py) { return new P2((px - this.ox) / this.scale, (this.oy - py) / this.scale); }
  enterLocal(c, b) { c.save(); c.translate(this.sx(b.x), this.sy(b.y)); c.rotate(-b.a); c.scale(this.scale, -this.scale); }
  px(v) { return v * this.dp / this.scale; }

  // ---------- public ----------
  select(b) { this.selected = b; this.onSelect?.(b); this.invalidate(); }
  refresh() { this.invalidate(); }
  centerWorld() { return this.world(this.width / 2, this.height / 2); }

  fit() {
    const W = this.width, H = this.height;
    if (!W || !H) return;
    if (this.s.bodies.length === 0) { this.scale = 2; this.ox = W / 2; this.oy = H / 2; this.invalidate(); return; }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const b of this.s.bodies) {
      const r = b.boundR();
      if (!isFinite(b.x) || !isFinite(b.y) || !isFinite(r) || abs(b.x) > this.WORLD || abs(b.y) > this.WORLD) continue;
      minX = min(minX, b.x - r); maxX = max(maxX, b.x + r); minY = min(minY, b.y - r); maxY = max(maxY, b.y + r);
    }
    if (minX > maxX) { this.scale = 2; this.ox = W / 2; this.oy = H / 2; this.invalidate(); return; }
    const pad = 15; minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    this.scale = min(W / (maxX - minX), H / (maxY - minY)) * 0.95;
    this.ox = W / 2 - (minX + maxX) / 2 * this.scale;
    this.oy = H / 2 + (minY + maxY) / 2 * this.scale;
    this.invalidate();
  }

  zoomBy(k, fx = this.width / 2, fy = this.height / 2) {
    const ns = clamp(this.scale * k, 0.05, 300); const kk = ns / this.scale;
    this.ox = fx - (fx - this.ox) * kk; this.oy = fy - (fy - this.oy) * kk; this.scale = ns; this.invalidate();
  }

  prompt() {
    const p = this.pending;
    switch (this._tool) {
      case Tool.MOVE: return 'Drag parts. Selected part: drag the green dot to rotate it.';
      case Tool.PIN: return 'Tap where 2 parts overlap to pin them. Tap 1 part to pin it to the ground.';
      case Tool.SLIDE: return p == null ? 'Tap the part that will slide.' : `Now tap the rail (or a rectangle) for ${p.name}.`;
      case Tool.SLOT: return p == null ? 'Tap the END (or point) of the part that should ride along a surface.' : 'Now tap the surface it rides on (tap near the top or bottom edge).';
      case Tool.BELT: return p == null ? 'Tap a gear (sprocket), pulley or disc.' : 'Now tap the other wheel for the belt/chain.';
      case Tool.MESH: return p == null ? 'Tap a gear.' : 'Now tap the other gear or a rack.';
      case Tool.LOCK: return 'Tap a part to lock / unlock it in place.';
      case Tool.TRACE: return 'Tap a point on a part to draw its path. Tap empty space to remove.';
      case Tool.WELD: return p == null ? 'Place the parts how you want them joined, then tap the first part.' : `Now tap the part to weld ${p.name} to.`;
      case Tool.CUT: return p == null ? 'Put the hole shape (Circle, Rect…) on the part, then tap the HOLE shape.' : `Now tap the part to cut ${p.name} out of.`;
      case Tool.MEASURE:
        switch (this._measureKind) {
          case MK.DIST: return this.mPending.length === 0 ? 'Distance: tap the 1st point (snaps to holes and corners).' : 'Tap the 2nd point.';
          case MK.ANGLE: return ['Angle: tap the 1st point.', 'Tap the corner point (where the angle is).', 'Tap the 3rd point.'][min(this.mPending.length, 2)];
          case MK.TRAVEL: return 'Travel: tap the point on a part you want to follow (like a lever tip).';
          case MK.CROSS: return this.mRefs.length === 0 ? 'Crossing: tap the 1st distance line.' : 'Tap the 2nd distance line.';
          case MK.TRACECROSS: return 'Trace crossing: tap a distance line.';
          default: return this.mRefs.length === 0 ? 'Gap: tap the 1st part.' : 'Tap the 2nd part.';
        }
      case Tool.DELETE: return 'Tap a joint or a part to delete it.';
    }
    return '';
  }

  // ---------- drawing ----------
  draw() {
    const c = this.ctx, W = this.width, H = this.height;
    c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
    this.drawGrid(c);
    const clean = this.clean;
    if (clean) { c.fillStyle = 'rgba(20,23,28,0.59)'; c.fillRect(0, 0, W, H); }
    const s = this.s;

    if (s.trace.length >= 2 && !this._cleanAlways) {
      c.strokeStyle = C.trace; c.lineWidth = 1.5; c.setLineDash([]);
      c.beginPath(); c.moveTo(this.sx(s.trace[0].x), this.sy(s.trace[0].y));
      for (let k = 1; k < s.trace.length; k++) c.lineTo(this.sx(s.trace[k].x), this.sy(s.trace[k].y));
      c.stroke();
    }

    const groups = this.weldGroups();
    for (const b of s.bodies) {
      const g = groups.get(b.id);
      if (!g) this.drawBody(c, b);
      else if (b === (g.anchor ??= ([...g].reverse().find(m => !m.cut) ?? g[g.length - 1]))) this.drawGroup(c, g);   // holes don't lift the piece to the front
    }
    for (const j of s.joints) if (j.spring === 1 && j.kind === JointKind.SLIDE && j.sol === 0) this.drawSpring(c, j);
    for (const j of s.joints) if (j.spring === 1 && j.kind === JointKind.PIN) this.drawTorsion(c, j);
    for (const j of s.joints) if (j.kind === JointKind.BELT) this.drawBelt(c, j);
    for (const j of s.joints) if (j.kind !== JointKind.BELT) this.drawJoint(c, j);
    this.drawLabels(c);
    if (this._cleanAlways) {
      MeasureCalc.update(s);
      if (this.lastMeasureText !== '') { this.lastMeasureText = ''; this.post(() => this.onMeasures?.('')); }
    } else this.drawMeasures(c);
    if (clean) return;

    const tb = s.byId(s.traceBody);
    if (tb) {
      const p = tb.toWorld(s.traceLx, s.traceLy);
      c.strokeStyle = C.handle; c.lineWidth = 2; c.setLineDash([]);
      c.beginPath(); c.arc(this.sx(p.x), this.sy(p.y), 4, 0, 2 * PI); c.stroke();
    }
    const sel = this.selected;
    if (sel && this._tool === Tool.MOVE && !sel.fixed && s.bodies.includes(sel)) {
      const h = this.handleWorld(sel);
      c.strokeStyle = C.handle; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(this.sx(sel.x), this.sy(sel.y)); c.lineTo(this.sx(h.x), this.sy(h.y)); c.stroke();
      c.fillStyle = C.handle; c.beginPath(); c.arc(this.sx(h.x), this.sy(h.y), 11, 0, 2 * PI); c.fill();
    }
  }

  num(v) { const r = Math.round(v * 1000) / 1000; return r === floor(r) ? String(Math.round(r)) : String(r); }

  drawGrid(c) {
    const f = Units.inch ? 25.4 : 1.0;
    const steps = Units.inch ? [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 50] : [1, 5, 10, 50, 100, 500, 1000];
    if (!isFinite(this.scale) || this.scale <= 0 || !isFinite(this.ox) || !isFinite(this.oy)) { this.scale = 2; this.ox = this.width / 2; this.oy = this.height / 2; }
    let stepU = steps.find(v => v * f * this.scale >= 8) ?? steps[steps.length - 1];
    while ((this.width + this.height) / (stepU * f * this.scale) > 300) stepU *= 10;
    const minor = stepU * f, w = this.width, h = this.height;
    const tl = this.world(0, 0), br = this.world(w, h);
    const unit = Units.inch ? 'in' : '';
    c.setLineDash([]); c.font = '10px system-ui, sans-serif'; c.fillStyle = C.gridText;
    const line = (x1, y1, x2, y2, col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
    for (let i = floor(tl.x / minor); i * minor <= br.x; i++) {
      const x = Math.round(this.sx(i * minor)) + 0.5;
      line(x, 0, x, h, i === 0 ? C.axis : (i % 10 === 0 ? C.major : C.minor), i === 0 ? 1.5 : 1);
      if (i % 10 === 0) c.fillText(this.num(i * stepU) + unit, x + 3, h - 4);
    }
    for (let j = floor(br.y / minor); j * minor <= tl.y; j++) {
      const y = Math.round(this.sy(j * minor)) + 0.5;
      line(0, y, w, y, j === 0 ? C.axis : (j % 10 === 0 ? C.major : C.minor), j === 0 ? 1.5 : 1);
      if (j % 10 === 0 && j !== 0) c.fillText(this.num(j * stepU) + unit, 3, y - 3);
    }
  }

  // local-space outline of a part (Path2D in mm)
  outlineOf(b) {
    const p = new Path2D();
    switch (b.type) {
      case BodyType.RECT: roundRect(p, -b.w / 2, -b.h / 2, b.w, b.h, this.px(3)); return p;
      case BodyType.TUBE: case BodyType.SOLENOID: p.rect(-b.w / 2, -b.h / 2, b.w, b.h); return p;
      case BodyType.GEAR: return this.gearPath(b.teeth, b.module);
      case BodyType.PULLEY: case BodyType.DISC: p.arc(0, 0, b.w / 2, 0, 2 * PI); return p;
      case BodyType.RAIL: { const hw = b.w / 2, bh = b.railBlockH() / 2; p.rect(-hw - 15, -bh, b.w + 30, 2 * bh); return p; }
      case BodyType.RACK: return this.rackPath(b);
    }
    return p;
  }

  drawBody(c, b, merged = false, tint = null) {
    const s = this.s;
    const guides = !this.clean;
    if (b.cut && !merged) { this.drawLooseCutter(c, b); return; }
    tint = tint ?? b.color;
    const isSel = b === this.selected && guides && !merged;
    const isPend = b === this.pending;
    this.enterLocal(c, b);
    const edge = () => { c.strokeStyle = C.edge; c.lineWidth = this.px(1.2); c.setLineDash([]); };
    const dashLine = (x1, y1, x2, y2) => {
      if (!guides) return;
      c.save(); c.strokeStyle = C.line; c.lineWidth = this.px(1); c.setLineDash([this.px(6), this.px(4)]);
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.restore();
    };
    const fill = (col) => { c.fillStyle = col; };
    let outline;
    switch (b.type) {
      case BodyType.RECT: {
        outline = this.outlineOf(b);
        fill(tint ?? (s.solenoidOf(b)?.a === b.id ? C.steel : C.rect)); c.fill(outline);
        if (!merged) { edge(); c.stroke(outline); }
        const e = b.w / 2 - b.h / 2;
        if (e > 0) dashLine(-e, 0, e, 0); else if (e < 0) dashLine(0, e, 0, -e);
        break;
      }
      case BodyType.TUBE: {
        const hw = b.w / 2, hh = b.h / 2, t = clamp(b.wall, 0.1, b.h / 2);
        outline = this.outlineOf(b);
        fill(C.tubeIn); c.fillRect(-hw, -hh + t, b.w, b.h - 2 * t);
        fill(tint ?? C.tube); c.fillRect(-hw, hh - t, b.w, t); c.fillRect(-hw, -hh, b.w, t);
        if (!merged) { edge(); c.strokeRect(-hw, hh - t, b.w, t); c.strokeRect(-hw, -hh, b.w, t); }
        dashLine(-hw, -hh + t, -hw, hh - t); dashLine(hw, -hh + t, hw, hh - t);
        break;
      }
      case BodyType.GEAR: {
        outline = this.gearPath(b.teeth, b.module);
        fill(tint ?? C.gear); c.fill(outline);
        if (!merged) { edge(); c.stroke(outline); }
        const r = b.pitchR();
        if (guides) { c.save(); c.strokeStyle = C.line; c.lineWidth = this.px(1); c.setLineDash([this.px(6), this.px(4)]); c.beginPath(); c.arc(0, 0, r, 0, 2 * PI); c.stroke(); c.restore(); }
        if (guides) { edge(); c.lineWidth = this.px(1.5); c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 0.8, 0); c.stroke(); }
        fill(C.hole); c.beginPath(); c.arc(0, 0, max(r * 0.12, this.px(3)), 0, 2 * PI); c.fill();
        break;
      }
      case BodyType.SOLENOID: {
        const hw = b.w / 2, hh = b.h / 2;
        outline = this.outlineOf(b);
        const on = s.solenoidOf(b)?.sol === 2;
        fill(tint ?? C.block); c.fillRect(-hw, -hh, b.w, b.h);
        const m = min(b.h * 0.12, 2.0);
        fill(on ? C.copperOn : C.copper); c.fillRect(-hw + m, -hh + m, b.w - 2 * m, b.h - 2 * m);
        edge(); c.lineWidth = this.px(0.8);
        c.beginPath(); for (let x = -hw + m + 1.2; x < hw - m; x += 1.6) { c.moveTo(x, -hh + m); c.lineTo(x, hh - m); } c.stroke();
        const bore = b.h * 0.22;
        fill(C.tubeIn); c.fillRect(-hw, -bore, b.w, 2 * bore);
        edge(); if (!merged) c.strokeRect(-hw, -hh, b.w, b.h);
        if (on) { c.strokeStyle = C.glow; c.lineWidth = this.px(3); c.strokeRect(-hw - this.px(2), -hh - this.px(2), b.w + this.px(4), b.h + this.px(4)); }
        break;
      }
      case BodyType.DISC: {
        const r = b.w / 2;
        outline = this.outlineOf(b);
        if (b.plain) {
          fill(tint ?? C.plain); c.beginPath(); c.arc(0, 0, r, 0, 2 * PI); c.fill();
          if (!merged) { edge(); c.beginPath(); c.arc(0, 0, r, 0, 2 * PI); c.stroke(); }
          if (guides) { edge(); c.lineWidth = this.px(1.5); c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 0.8, 0); c.stroke(); }
          fill(C.hole); c.beginPath(); c.arc(0, 0, max(r * 0.08, this.px(2)), 0, 2 * PI); c.fill();
          break;
        }
        fill(tint ?? C.disc); c.beginPath(); c.arc(0, 0, r, 0, 2 * PI); c.fill();
        fill(C.tubeIn); c.beginPath(); c.arc(0, 0, r * 0.74, 0, 2 * PI); c.fill();
        fill(tint ?? C.disc);
        c.beginPath();
        for (let k = 0; k < 5; k++) {
          const t = k * 2 * PI / 5, wdt = 0.09;
          c.moveTo(r * 0.2 * cos(t - wdt * 1.6), r * 0.2 * sin(t - wdt * 1.6));
          c.lineTo(r * 0.76 * cos(t - wdt), r * 0.76 * sin(t - wdt));
          c.lineTo(r * 0.76 * cos(t + wdt), r * 0.76 * sin(t + wdt));
          c.lineTo(r * 0.2 * cos(t + wdt * 1.6), r * 0.2 * sin(t + wdt * 1.6));
          c.closePath();
        }
        c.fill();
        c.beginPath(); c.arc(0, 0, r * 0.26, 0, 2 * PI); c.fill();
        edge(); c.beginPath(); c.arc(0, 0, r * 0.74, 0, 2 * PI); c.stroke();
        if (!merged) { c.beginPath(); c.arc(0, 0, r, 0, 2 * PI); c.stroke(); }
        fill(C.hole); c.beginPath(); c.arc(0, 0, max(r * 0.08, this.px(2)), 0, 2 * PI); c.fill();
        break;
      }
      case BodyType.PULLEY: {
        const r = b.w / 2;
        outline = this.outlineOf(b);
        fill(tint ?? C.pulley); c.beginPath(); c.arc(0, 0, r, 0, 2 * PI); c.fill();
        edge(); if (!merged) { c.beginPath(); c.arc(0, 0, r, 0, 2 * PI); c.stroke(); }
        c.beginPath(); c.arc(0, 0, r * 0.82, 0, 2 * PI); c.stroke();
        c.lineWidth = max(this.px(1.5), r * 0.06);
        c.beginPath();
        for (let k = 0; k < 3; k++) { const t = k * 2 * PI / 3; c.moveTo(r * 0.2 * cos(t), r * 0.2 * sin(t)); c.lineTo(r * 0.78 * cos(t), r * 0.78 * sin(t)); }
        c.stroke();
        fill(C.groove); c.beginPath(); c.arc(0, 0, r * 0.2, 0, 2 * PI); c.fill();
        fill(C.hole); c.beginPath(); c.arc(0, 0, max(r * 0.08, this.px(2)), 0, 2 * PI); c.fill();
        break;
      }
      case BodyType.RAIL: {
        const hw = b.w / 2, hh = b.h / 2, bh = b.railBlockH() / 2;
        outline = this.outlineOf(b);
        fill(C.block); c.fillRect(-hw - 15, -bh, 15, 2 * bh); c.fillRect(hw, -bh, 15, 2 * bh);
        fill(tint ?? C.rail); c.fillRect(-hw, -hh, b.w, b.h);
        if (!merged) { edge(); c.strokeRect(-hw, -hh, b.w, b.h); }
        dashLine(-hw, 0, hw, 0);
        break;
      }
      case BodyType.RACK: {
        outline = this.rackPath(b);
        fill(tint ?? C.rack); c.fill(outline);
        if (!merged) { edge(); c.stroke(outline); }
        dashLine(-b.w / 2, b.h / 2, b.w / 2, b.h / 2);
        break;
      }
    }
    c.setLineDash([]);
    if (isSel && outline) { c.strokeStyle = C.sel; c.lineWidth = this.px(2.5); c.stroke(outline); }
    if (isPend && outline) { c.strokeStyle = C.pending; c.lineWidth = this.px(3); c.stroke(outline); }
    c.restore();

    if (b.fixed && guides) {
      const x = this.sx(b.x), y = this.sy(b.y);
      c.strokeStyle = C.lock; c.lineWidth = 2; c.setLineDash([]);
      c.strokeRect(x - 5, y - 3, 10, 8);
      c.beginPath(); c.arc(x, y - 5, 3, PI, 2 * PI); c.stroke();
    }
  }

  gearPath(n, m) {
    const key = n + '/' + m;
    const hit = this.gearCache.get(key); if (hit) return hit;
    const R = m * n / 2, rr = max(R - 1.25 * m, m * 0.5), ra = R + m, p = 2 * PI / n;
    const path = new Path2D();
    let first = true;
    const pt = (r, t) => { const x = r * cos(t), y = r * sin(t); if (first) { path.moveTo(x, y); first = false; } else path.lineTo(x, y); };
    for (let k = 0; k < n; k++) {
      const t = k * p;
      pt(rr, t - 0.5 * p); pt(rr, t - 0.27 * p); pt(ra, t - 0.12 * p); pt(ra, t + 0.12 * p); pt(rr, t + 0.27 * p);
    }
    path.closePath();
    this.gearCache.set(key, path);
    return path;
  }

  rackPath(b) {
    const m = b.module, p = PI * m, hw = b.w / 2, y0 = b.h / 2 - 1.25 * m, y1 = b.h / 2 + m;
    const path = new Path2D();
    path.moveTo(-hw, -b.h / 2); path.lineTo(hw, -b.h / 2); path.lineTo(hw, y0);
    const count = floor(b.w / p);
    for (let k = count - 1; k >= 0; k--) {
      const u = -hw + p / 2 + k * p;
      path.lineTo(u + 0.27 * p, y0); path.lineTo(u + 0.12 * p, y1); path.lineTo(u - 0.12 * p, y1); path.lineTo(u - 0.27 * p, y0);
    }
    path.lineTo(-hw, y0); path.closePath();
    return path;
  }

  thickness(b) {
    switch (b.type) {
      case BodyType.GEAR: return b.pitchR() * 0.5;
      case BodyType.PULLEY: case BodyType.DISC: return b.w * 0.25;
      case BodyType.RAIL: return b.h;
      default: return min(b.w, b.h);
    }
  }
  pinRadiusMm(j) {
    const A = this.s.byId(j.a), B = j.b >= 0 ? this.s.byId(j.b) : null;
    const ts = [A, B].filter(Boolean).map(x => this.thickness(x));
    return (ts.length ? min(...ts) : 10) * 0.3;
  }
  pinRadiusPx(j) { return max(this.pinRadiusMm(j) * this.scale, 2.5); }

  circle(c, x, y, r, fillCol, strokeCol, lw) {
    c.beginPath(); c.arc(x, y, r, 0, 2 * PI);
    if (fillCol) { c.fillStyle = fillCol; c.fill(); }
    if (strokeCol) { c.strokeStyle = strokeCol; c.lineWidth = lw; c.stroke(); }
  }
  seg(c, x1, y1, x2, y2, col, lw) { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }

  drawJoint(c, j) {
    const s = this.s;
    const p = s.jointWorldPoint(j); if (!p) return;
    const x = this.sx(p.x), y = this.sy(p.y);
    c.setLineDash([]);
    if (this.clean) {
      if (j.kind === JointKind.PIN || j.kind === JointKind.SLOT) {
        const r = this.pinRadiusPx(j);
        this.circle(c, x, y, r, C.pinFill, C.pin, min(2, r * 0.4));
      }
      return;
    }
    switch (j.kind) {
      case JointKind.PIN: {
        const r = this.pinRadiusPx(j);
        this.circle(c, x, y, r, C.pinFill, C.pin, min(2, r * 0.4));
        if (j.b < 0) {
          const g = max(r, 4), lw = min(2, g * 0.35);
          this.seg(c, x, y + r, x - g * 1.4, y + r + g * 1.8, C.ground, lw);
          this.seg(c, x, y + r, x + g * 1.4, y + r + g * 1.8, C.ground, lw);
          this.seg(c, x - g * 2, y + r + g * 1.8, x + g * 2, y + r + g * 1.8, C.ground, lw);
        }
        break;
      }
      case JointKind.SLIDE: {
        const rail = s.byId(j.b); if (!rail) return;
        const a = rail.toWorld(j.lo, j.ay), b = rail.toWorld(j.hi, j.ay);
        this.seg(c, this.sx(a.x), this.sy(a.y), this.sx(b.x), this.sy(b.y), C.slide, 3);
        this.circle(c, this.sx(a.x), this.sy(a.y), 3, null, C.slide, 3);
        this.circle(c, this.sx(b.x), this.sy(b.y), 3, null, C.slide, 3);
        c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 6, y); c.lineTo(x, y + 6); c.lineTo(x - 6, y); c.closePath();
        c.strokeStyle = C.slide; c.lineWidth = 3; c.stroke();
        break;
      }
      case JointKind.SLOT: {
        const g = s.byId(j.b); if (!g) return;
        const a = g.toWorld(j.lo, j.by), b = g.toWorld(j.hi, j.by);
        this.seg(c, this.sx(a.x), this.sy(a.y), this.sx(b.x), this.sy(b.y), C.slide, 2);
        const r = this.pinRadiusPx(j);
        this.circle(c, x, y, r, C.pinFill, C.slide, min(2, r * 0.4));
        break;
      }
      case JointKind.WELD:
        if (this._tool === Tool.WELD || this._tool === Tool.DELETE) {
          const r = this.pinRadiusPx(j), lw = min(2, r * 0.4);
          c.fillStyle = C.pinFill; c.fillRect(x - r, y - r, 2 * r, 2 * r);
          c.strokeStyle = C.weld; c.lineWidth = lw; c.strokeRect(x - r, y - r, 2 * r, 2 * r);
          this.seg(c, x - r, y - r, x + r, y + r, C.weld, lw); this.seg(c, x - r, y + r, x + r, y - r, C.weld, lw);
        }
        break;
      case JointKind.GEAR: case JointKind.RACK: this.circle(c, x, y, 3.5, C.mesh); break;
    }
  }

  // ---------- measure tool ----------
  measureSnap(w) {
    let best = null, bestD = 16 / this.scale;
    for (const b of this.s.bodies) {
      const pts = [...b.snapPoints()];
      if ([BodyType.RECT, BodyType.TUBE, BodyType.SOLENOID, BodyType.RACK].includes(b.type))
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) pts.push(new P2(sx * b.w / 2, sy * b.h / 2));
      for (const lp of pts) {
        const p = b.toWorld(lp.x, lp.y), d = hypot(p.x - w.x, p.y - w.y);
        if (d < bestD) { bestD = d; best = [b, p]; }
      }
    }
    return best;
  }
  anchorFor(w, hits) {
    const sn = this.measureSnap(w);
    if (sn) return this.s.anchorAt(sn[0], sn[1]);
    return this.s.anchorAt(hits[0] ?? null, w);
  }
  distLineNear(px, py, maxD = 22) {
    let best = null, bestD = maxD;
    for (const m of this.s.measures) {
      if (m.kind !== MK.DIST) continue;
      const ab = MeasureCalc.distPts(this.s, m); if (!ab) continue;
      const d = this.segDist(px, py, ab[0], ab[1]);
      if (d < bestD) { bestD = d; best = m; }
    }
    return best;
  }

  measureTap(px, py, w, hits) {
    const s = this.s;
    switch (this._measureKind) {
      case MK.DIST: case MK.ANGLE: {
        this.mPending.push(this.anchorFor(w, hits));
        const need = this._measureKind === MK.DIST ? 2 : 3;
        if (this.mPending.length >= need) {
          const m = s.addMeasure(this._measureKind, [...this.mPending]); this.mPending = [];
          this.status(`${m.name} added. The calculation is shown below the drawing.`); this.done();
        } else { this.status(this.prompt()); this.invalidate(); }
        break;
      }
      case MK.TRAVEL: {
        const b = hits[0]; if (!b) { this.status('Tap on a part.'); return; }
        const sn = this.measureSnap(w);
        const p = sn && sn[0] === b ? sn[1] : w;
        const m = s.addMeasure(MK.TRAVEL, [s.anchorAt(b, p)]);
        this.status(`${m.name}: now move or Play it. Path, straight line and arc are calculated live.`); this.done();
        break;
      }
      case MK.CROSS: {
        const l = this.distLineNear(px, py); if (!l) { this.status('Tap on a distance line (make two with Distance first).'); return; }
        if (this.mRefs.includes(l.num)) return;
        this.mRefs.push(l.num);
        if (this.mRefs.length >= 2) {
          const m = s.addMeasure(MK.CROSS, [], this.mRefs[0], this.mRefs[1]); this.mRefs = [];
          this.status(`${m.name}: crossing point shown live.`); this.done();
        } else { this.status(this.prompt()); this.invalidate(); }
        break;
      }
      case MK.TRACECROSS: {
        const l = this.distLineNear(px, py); if (!l) { this.status('Tap on a distance line (make one with Distance first).'); return; }
        const m = s.addMeasure(MK.TRACECROSS, [], l.num);
        this.status(`${m.name}: crossings of the trace path with ${l.name}.`); this.done();
        break;
      }
      case MK.GAP: {
        const b = hits[0]; if (!b) { this.status('Tap on a part.'); return; }
        if (this.mRefs.includes(b.id)) return;
        this.mRefs.push(b.id);
        if (this.mRefs.length >= 2) {
          const m = s.addMeasure(MK.GAP, [], this.mRefs[0], this.mRefs[1]); this.mRefs = [];
          this.status(`${m.name}: move or Play; the smallest gap is remembered.`); this.done();
        } else { this.status(this.prompt()); this.invalidate(); }
        break;
      }
    }
  }

  setMeasureEnd(m, end, target) {
    const a = m.pts[end];
    if (a.body < 0) { a.lx = target.x; a.ly = target.y; this.done(); return true; }
    const b = this.s.byId(a.body); if (!b || b.fixed) return false;
    this.ignore = Collision.overlappingPairs(this.s);
    this.movePoint(b, a.lx, a.ly, target.x, target.y, 80);
    this.done();
    return true;
  }
  canMoveEnd(m, end) { const a = m.pts[end]; return a.body < 0 || this.s.byId(a.body)?.fixed === false; }
  resetMeasures() { this.s.measures.forEach(m => m.reset()); this.invalidate(); }

  label(c, text, x, y) {
    c.font = 'bold 11px system-ui, sans-serif';
    const w = c.measureText(text).width;
    c.fillStyle = C.measBg; c.beginPath(); roundRect(c, x - 3, y - 12, w + 6, 16, 3); c.fill();
    c.fillStyle = C.meas; c.fillText(text, x, y);
  }
  nn(v) { return fmt(Units.toUser(v), Units.inch ? 3 : 1); }

  drawMeasures(c) {
    const s = this.s;
    MeasureCalc.update(s);
    const solid = () => { c.strokeStyle = C.meas; c.lineWidth = 1.6; c.setLineDash([]); };
    const dash = () => { c.strokeStyle = C.meas; c.lineWidth = 1.2; c.setLineDash([5, 4]); };
    const faint = () => { c.strokeStyle = C.measPath; c.lineWidth = 1.2; c.setLineDash([]); };
    const L = (x1, y1, x2, y2) => { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); };
    const O = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 2 * PI); c.stroke(); };
    for (const m of s.measures) {
      switch (m.kind) {
        case MK.DIST: {
          const pq = MeasureCalc.distPts(s, m); if (!pq) break;
          const [p, q] = pq; const k = new P2(q.x, p.y);
          dash(); L(this.sx(p.x), this.sy(p.y), this.sx(k.x), this.sy(k.y)); L(this.sx(k.x), this.sy(k.y), this.sx(q.x), this.sy(q.y));
          solid(); L(this.sx(p.x), this.sy(p.y), this.sx(q.x), this.sy(q.y));
          const r = 8, dxs = p.x < q.x ? -r : r, dys = q.y > p.y ? r : -r;
          if (abs(q.x - p.x) * this.scale > 2 * r && abs(q.y - p.y) * this.scale > 2 * r) {
            dash(); L(this.sx(k.x) + dxs, this.sy(k.y), this.sx(k.x) + dxs, this.sy(k.y) - dys); L(this.sx(k.x) + dxs, this.sy(k.y) - dys, this.sx(k.x), this.sy(k.y) - dys);
          }
          solid(); O(this.sx(p.x), this.sy(p.y), 3); O(this.sx(q.x), this.sy(q.y), 3);
          c.setLineDash([]);
          if (abs(q.x - p.x) > 1e-6) this.label(c, `a ${this.nn(abs(q.x - p.x))}`, (this.sx(p.x) + this.sx(k.x)) / 2, this.sy(k.y) + 16);
          if (abs(q.y - p.y) > 1e-6) this.label(c, `b ${this.nn(abs(q.y - p.y))}`, this.sx(k.x) + 6, (this.sy(k.y) + this.sy(q.y)) / 2);
          this.label(c, `${m.name}  c ${this.nn(hypot(q.x - p.x, q.y - p.y))}`, (this.sx(p.x) + this.sx(q.x)) / 2 - 20, (this.sy(p.y) + this.sy(q.y)) / 2 - 8);
          break;
        }
        case MK.ANGLE: {
          const a = s.anchorWorld(m.pts[0]), v = s.anchorWorld(m.pts[1]), b = s.anchorWorld(m.pts[2]);
          if (!a || !v || !b) break;
          solid(); L(this.sx(v.x), this.sy(v.y), this.sx(a.x), this.sy(a.y)); L(this.sx(v.x), this.sy(v.y), this.sx(b.x), this.sy(b.y));
          const a1 = atan2(a.y - v.y, a.x - v.x), d = wrapPi(atan2(b.y - v.y, b.x - v.x) - a1), rr = 26;
          dash(); c.beginPath();
          for (let i = 0; i <= 30; i++) { const t = a1 + d * i / 30; const x = this.sx(v.x) + rr * cos(t), y = this.sy(v.y) - rr * sin(t); i ? c.lineTo(x, y) : c.moveTo(x, y); }
          c.stroke(); c.setLineDash([]);
          const mid = a1 + d / 2;
          this.label(c, `${m.name} ${fmt(abs(d) * 180 / PI, 1)}°`, this.sx(v.x) + (rr + 6) * cos(mid), this.sy(v.y) - (rr + 6) * sin(mid));
          break;
        }
        case MK.TRAVEL: {
          const p = s.anchorWorld(m.pts[0]); const st = m.start; if (!p || !st) break;
          if (m.pathPts.length >= 2) {
            faint(); c.beginPath();
            m.pathPts.forEach((q, i) => i ? c.lineTo(this.sx(q.x), this.sy(q.y)) : c.moveTo(this.sx(q.x), this.sy(q.y)));
            c.lineTo(this.sx(p.x), this.sy(p.y)); c.stroke();
          }
          dash(); L(this.sx(st.x), this.sy(st.y), this.sx(p.x), this.sy(p.y));
          const x0 = this.sx(st.x), y0 = this.sy(st.y);
          solid(); L(x0 - 5, y0 - 5, x0 + 5, y0 + 5); L(x0 - 5, y0 + 5, x0 + 5, y0 - 5); O(this.sx(p.x), this.sy(p.y), 4);
          this.label(c, `${m.name} ${this.nn(m.path)}`, this.sx(p.x) + 8, this.sy(p.y) - 8);
          break;
        }
        case MK.CROSS: {
          const m1 = s.measureByNum(m.refA), m2 = s.measureByNum(m.refB);
          const l1 = m1 && MeasureCalc.distPts(s, m1), l2 = m2 && MeasureCalc.distPts(s, m2);
          if (!l1 || !l2) break;
          const x = MeasureCalc.lineCross(l1[0], l1[1], l2[0], l2[1]); if (!x) break;
          const cx = this.sx(x[0]), cy = this.sy(x[1]);
          faint();
          for (const [ln, t] of [[l1, x[2]], [l2, x[3]]]) if (t < 0 || t > 1) { const e = t < 0 ? ln[0] : ln[1]; L(this.sx(e.x), this.sy(e.y), cx, cy); }
          solid(); L(cx - 8, cy, cx + 8, cy); L(cx, cy - 8, cx, cy + 8); O(cx, cy, 5);
          this.label(c, `${m.name} (${this.nn(x[0])}, ${this.nn(x[1])})`, cx + 8, cy - 8);
          break;
        }
        case MK.TRACECROSS: {
          const l = s.measureByNum(m.refA); if (!l) break;
          solid();
          MeasureCalc.traceCrossings(s, l).forEach((q, i) => { O(this.sx(q.x), this.sy(q.y), 5); if (i < 4) this.label(c, `${m.name}.${i + 1}`, this.sx(q.x) + 7, this.sy(q.y) - 7); solid(); });
          break;
        }
        case MK.GAP: {
          const a = s.byId(m.refA), b = s.byId(m.refB); if (!a || !b) break;
          const g = Collision.closest(a, b);
          solid(); L(this.sx(g[0]), this.sy(g[1]), this.sx(g[2]), this.sy(g[3])); O(this.sx(g[0]), this.sy(g[1]), 2.5); O(this.sx(g[2]), this.sy(g[3]), 2.5);
          this.label(c, `${m.name} ${this.nn(g[4])}`, (this.sx(g[0]) + this.sx(g[2])) / 2 + 6, (this.sy(g[1]) + this.sy(g[3])) / 2 - 6);
          break;
        }
      }
    }
    solid();
    for (const a of this.mPending) { const w = s.anchorWorld(a); if (w) O(this.sx(w.x), this.sy(w.y), 5); }
    const txt = MeasureCalc.text(s);
    if (txt !== this.lastMeasureText) { this.lastMeasureText = txt; this.post(() => this.onMeasures?.(txt)); }
  }

  // ---------- weld groups: drawn as one solid piece ----------
  weldGroups() {
    const out = new Map();
    for (const b of this.s.bodies) {
      if (out.has(b.id)) continue;
      const g = this.s.weldGroupOf(b);
      if (g.length >= 2) for (const m of g) out.set(m.id, g);
    }
    return out;
  }
  baseColor(b) {
    switch (b.type) {
      case BodyType.RECT: return C.rect; case BodyType.TUBE: return C.tube; case BodyType.GEAR: return C.gear;
      case BodyType.PULLEY: return C.pulley; case BodyType.DISC: return b.plain ? C.plain : C.disc; case BodyType.RAIL: return C.rail;
      case BodyType.RACK: return C.rack; case BodyType.SOLENOID: return C.block;
    }
    return C.rect;
  }
  // screen-space path of a part's outline
  screenPath(m) {
    const p = new Path2D();
    const mx = new DOMMatrix().translate(this.sx(m.x), this.sy(m.y)).rotate(-m.a * 180 / PI).scale(this.scale, -this.scale);
    p.addPath(this.outlineOf(m), mx);
    return p;
  }
  // a cutter that is not welded to anything yet: dashed outline only
  drawLooseCutter(c, b) {
    const p = this.screenPath(b);
    c.save();
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill(p);
    c.strokeStyle = b === this.selected ? C.sel : b === this.pending ? C.pending : '#9AA3AD';
    c.lineWidth = b === this.selected || b === this.pending ? 2.5 : 1.5; c.setLineDash([6, 4]); c.stroke(p);
    c.restore();
  }
  // One outline around the whole piece: stroke every member's outline first, then fill them all on top,
  // so only the outer edge stays visible (no lines where they join). Through holes are clipped out,
  // pockets are drawn darker.
  drawGroup(c, g) {
    const solids = g.filter((m) => !m.cut), holes = g.filter((m) => m.cut === 1), pockets = g.filter((m) => m.cut === 2);
    if (!solids.length) { g.forEach((m) => this.drawLooseCutter(c, m)); return; }
    let main = solids[0]; for (const m of solids) if (m.boundR() > main.boundR()) main = m;
    const tint = main.color ?? this.baseColor(main);
    const selected = !this.clean && g.some(m => m === this.selected);
    c.save();
    if (holes.length) {
      const clip = new Path2D();
      clip.rect(-10, -10, this.width + 20, this.height + 20);
      for (const h of holes) clip.addPath(this.screenPath(h));
      c.clip(clip, 'evenodd');
    }
    c.setLineDash([]);
    for (const pass of selected ? ['sel', 'edge'] : ['edge']) {
      for (const m of solids) {
        this.enterLocal(c, m);
        c.strokeStyle = pass === 'sel' ? C.sel : C.edge;
        c.lineWidth = this.px(pass === 'sel' ? 5 : 2.4);
        c.lineJoin = 'round';
        c.stroke(this.outlineOf(m));
        c.restore();
      }
    }
    for (const m of solids) this.drawBody(c, m, true, tint);
    if (pockets.length) {
      // pocket = darker floor, only where there is material
      c.save();
      const mat = new Path2D(); for (const m of solids) mat.addPath(this.screenPath(m));
      c.clip(mat);
      for (const pk of pockets) {
        const p = this.screenPath(pk);
        c.fillStyle = 'rgba(0,0,0,0.38)'; c.fill(p);
        c.strokeStyle = 'rgba(0,0,0,0.75)'; c.lineWidth = 1.2; c.setLineDash([5, 3]); c.stroke(p);
      }
      c.restore();
    }
    c.restore();
    // hole walls: only where there is material (a hole over the edge makes a notch, no line outside the part)
    if (holes.length) {
      c.save(); c.setLineDash([]);
      const mat = new Path2D(); for (const m of solids) mat.addPath(this.screenPath(m));
      c.clip(mat);
      for (const h of holes) {
        const p = this.screenPath(h), sel = h === this.selected && !this.clean;
        c.strokeStyle = sel ? C.sel : C.edge; c.lineWidth = sel ? 5 : 3.2; c.stroke(p);   // double width: half is clipped away
      }
      c.restore();
    }
  }

  // custom names written on the parts
  drawLabels(c) {
    if (this.clean) return;
    c.save();
    c.font = '600 11px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const b of this.s.bodies) {
      if (!b.label) continue;
      const x = this.sx(b.x), y = this.sy(b.y), w = c.measureText(b.label).width;
      c.fillStyle = 'rgba(20,23,28,0.72)'; c.beginPath(); roundRect(c, x - w / 2 - 4, y - 8, w + 8, 16, 4); c.fill();
      c.fillStyle = '#FFFFFF'; c.fillText(b.label, x, y + 0.5);
    }
    c.restore();
  }

  // ---------- belt / chain ----------
  isChain(A, B) { return A.type === BodyType.GEAR && B.type === BodyType.GEAR; }
  beltPath(g, A, B, crossed) {
    const path = new Path2D(); let first = true;
    const pt = (p) => { const x = this.sx(p.x), y = this.sy(p.y); if (first) { path.moveTo(x, y); first = false; } else path.lineTo(x, y); };
    const arc = (b, a0, sweep, reverse) => {
      const r = b.wheelR(), n = max(8, Math.trunc(abs(sweep) * 24));
      for (let k = 0; k <= n; k++) { const f = reverse ? (n - k) / n : k / n; const t = a0 + sweep * f; pt(new P2(b.x + r * cos(t), b.y + r * sin(t))); }
    };
    pt(g.spans[0]); pt(g.spans[1]);
    arc(B, g.arc2[0], g.arc2[1], !crossed);
    pt(g.spans[2]);
    arc(A, g.arc1[0], g.arc1[1], true);
    path.closePath();
    return path;
  }
  beltPhase(A, period) { const v = A.wheelR() * A.a * this.scale; return ((v % period) + period) % period; }
  drawBelt(c, j) {
    const s = this.s, A = s.byId(j.a), B = s.byId(j.b); if (!A || !B) return;
    const g = s.beltGeom(j, A, B); if (!g) return;
    const path = this.beltPath(g, A, B, j.bx === 1.0);
    c.lineCap = 'butt';
    if (this.isChain(A, B)) {
      const pitch = PI * min(A.module, B.module);
      c.setLineDash([]); c.strokeStyle = C.chain; c.lineWidth = max(pitch * 0.55 * this.scale, 2); c.stroke(path);
      const on = max(pitch * 0.55 * this.scale, 2), off = max(pitch * 0.45 * this.scale, 2);
      c.setLineDash([on, off]); c.lineDashOffset = this.beltPhase(A, on + off);
      c.strokeStyle = C.link; c.lineWidth = max(pitch * 0.3 * this.scale, 1); c.stroke(path);
    } else {
      const t = clamp(min(A.wheelR(), B.wheelR()) * 0.18, 2, 10);
      c.setLineDash([]); c.strokeStyle = C.belt; c.lineWidth = max(t * this.scale, 2); c.stroke(path);
      const mark = max(1.5 * this.scale, 1.5), gap = max(6.5 * this.scale, 4);
      c.setLineDash([mark, gap]); c.lineDashOffset = this.beltPhase(A, mark + gap);
      c.strokeStyle = C.beltMark; c.lineWidth = max(t * 0.6 * this.scale, 1); c.stroke(path);
    }
    c.setLineDash([]); c.lineDashOffset = 0;
  }
  beltInfo(j) {
    const s = this.s, A = s.byId(j.a), B = s.byId(j.b); if (!A || !B) return '';
    const g = s.beltGeom(j, A, B); if (!g) return "Belt can't fit: the wheels overlap. Move them apart.";
    const L = g.length, ratio = A.wheelR() / B.wheelR(), dir = j.bx === 1.0 ? 'opposite' : 'same';
    const lenTxt = Units.inch ? `${fmt(Units.toUser(L), 3)} in` : `${fmt(L, 1)} mm`;
    let out;
    if (this.isChain(A, B)) {
      const pitch = PI * min(A.module, B.module);
      let links = Math.ceil(L / pitch); if (links % 2 === 1) links++;
      out = `Chain ${A.name}→${B.name}: length ${lenTxt}, about ${links} links (pitch ${fmt(pitch, 2)} mm). `;
    } else out = `Belt ${A.name}→${B.name}: length ${lenTxt} (GT2 timing belt ≈ ${Math.round(L / 2)} teeth). `;
    return out + `${B.name} turns ${fmt(ratio, 2)}× ${A.name}, ${dir} direction.`;
  }
  segDist(px, py, a, b) {
    const ax = this.sx(a.x), ay = this.sy(a.y), bx = this.sx(b.x), by = this.sy(b.y);
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
    const t = l2 < 1e-6 ? 0 : clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1);
    return hypot(px - (ax + t * vx), py - (ay + t * vy));
  }
  beltNear(px, py) {
    for (const j of this.s.joints) {
      if (j.kind !== JointKind.BELT) continue;
      const A = this.s.byId(j.a), B = this.s.byId(j.b); if (!A || !B) continue;
      const g = this.s.beltGeom(j, A, B); if (!g) continue;
      if (this.segDist(px, py, g.spans[0], g.spans[1]) < 16 || this.segDist(px, py, g.spans[2], g.spans[3]) < 16) return j;
    }
    return null;
  }

  handleWorld(b) { return b.toWorld(b.halfLen() + 26 / this.scale, 0); }

  // ---------- hit testing ----------
  tol() { return 8 / this.scale; }
  hitAll(w, solidOnly = false) {
    const all = [...this.s.bodies].reverse().filter(b => b.contains(w.x, w.y, this.tol()));
    if (!solidOnly) return all;
    // skip cutters, and parts whose through hole is right under the finger
    return all.filter(b => !b.cut && !this.s.weldGroupOf(b).some(h => h.cut === 1 && h.contains(w.x, w.y, 0)));
  }
  isLocked(b) { return b.fixed || this.s.weldGroupOf(b).some(m => m.fixed); }
  lockedMsg(b) { const f = b.fixed ? b : this.s.weldGroupOf(b).find(m => m.fixed); return f === b ? `${b.name} is locked. Tap Unlock to move it.` : `${b.name} is welded to ${f.name}, which is locked. Unlock ${f.name} to move it.`; }
  snap(w, cands) {
    let best = w, bestD = 16 / this.scale;
    for (const b of cands) for (const sp of b.snapPoints()) {
      const p = b.toWorld(sp.x, sp.y), d = hypot(p.x - w.x, p.y - w.y);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
  nearestSnap(w, b, maxD) {
    let best = null, bestD = maxD;
    for (const sp of b.snapPoints()) { const p = b.toWorld(sp.x, sp.y), d = hypot(p.x - w.x, p.y - w.y); if (d < bestD) { bestD = d; best = p; } }
    return best;
  }
  snapTogether(w, top, under) {
    const reach = 40 / this.scale;
    const su = this.nearestSnap(w, under, reach), st = this.nearestSnap(w, top, reach);
    if (su && st) {
      if (!top.fixed) { top.x += su.x - st.x; top.y += su.y - st.y; return su; }
      if (!under.fixed) { under.x += st.x - su.x; under.y += st.y - su.y; return st; }
    }
    return this.snap(w, [top, under]);
  }
  jointNear(px, py) {
    let best = null, bestD = 18;
    for (const j of this.s.joints) {
      const p = this.s.jointWorldPoint(j); if (!p) continue;
      const d = hypot(this.sx(p.x) - px, this.sy(p.y) - py);
      if (d < bestD) { bestD = d; best = j; }
    }
    return best;
  }

  // ---------- input (touch, pen, mouse) ----------
  _bindInput() {
    const cv = this.canvas;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', e => this._down(e));
    cv.addEventListener('pointermove', e => this._move(e));
    cv.addEventListener('pointerup', e => this._up(e));
    cv.addEventListener('pointercancel', e => this._cancel(e));
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      this.zoomBy(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
  }
  _pos(e) { const r = this.canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  _avg() { let x = 0, y = 0; for (const p of this.pointers.values()) { x += p[0]; y += p[1]; } const n = this.pointers.size; return [x / n, y / n]; }
  _spread() { const v = [...this.pointers.values()]; return v.length < 2 ? 0 : hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]); }

  _down(e) {
    this.canvas.setPointerCapture?.(e.pointerId);
    const [x, y] = this._pos(e);
    this.pointers.set(e.pointerId, [x, y]);
    if (this.pointers.size >= 2) {
      // second finger: pinch zoom + two-finger pan
      this.drag = Drag.ZOOM; this.moved = true;
      [this.lastX, this.lastY] = this._avg(); this.pinchDist = this._spread();
      this.invalidate(); return;
    }
    this.downX = x; this.downY = y; this.lastX = x; this.lastY = y; this.moved = false;
    const w = this.world(x, y);
    this.drag = Drag.PAN;
    // right / middle mouse button always pans
    if (e.pointerType === 'mouse' && e.button !== 0) { this.invalidate(); return; }
    if (this._tool === Tool.MOVE) {
      const sel = this.selected, h = sel ? this.handleWorld(sel) : null;
      if (sel && h && !sel.fixed && hypot(this.sx(h.x) - x, this.sy(h.y) - y) < 26) {
        this.stopMotor();
        this.drag = Drag.ROTATE;
        this.rotOff = atan2(w.y - sel.y, w.x - sel.x) - sel.a;
        this.ignore = Collision.overlappingPairs(this.s);
      } else {
        const b = this.hitAll(w)[0];
        if (b) {
          this.stopMotor();
          if (b !== this.selected) this.select(b);
          this.ignore = Collision.overlappingPairs(this.s);
          if (this.isLocked(b)) this.drag = Drag.PAN;    // locked = really locked: a drag only moves the view
          else { this.drag = Drag.BODY; const l = b.toLocal(w.x, w.y); this.grabLx = l.x; this.grabLy = l.y; }
        }
      }
    }
    this.invalidate();
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const [x, y] = this._pos(e);
    this.pointers.set(e.pointerId, [x, y]);
    if (this.drag === Drag.ZOOM) {
      const [fx, fy] = this._avg(); const d = this._spread();
      this.ox += fx - this.lastX; this.oy += fy - this.lastY;
      if (this.pinchDist > 0 && d > 0) this.zoomBy(d / this.pinchDist, fx, fy);
      this.pinchDist = d; this.lastX = fx; this.lastY = fy; this.invalidate(); return;
    }
    if (!this.moved && hypot(x - this.downX, y - this.downY) > 8) this.moved = true;
    if (!this.moved) return;
    const w = this.world(x, y), sel = this.selected;
    switch (this.drag) {
      case Drag.BODY: if (sel) { this.movePoint(sel, this.grabLx, this.grabLy, w.x, w.y, 12); this.liveChange(); } break;
      case Drag.ROTATE: if (sel) { const raw = atan2(w.y - sel.y, w.x - sel.x) - this.rotOff; this.moveAngle(sel, sel.a + wrapPi(raw - sel.a), 12); this.liveChange(); } break;
      case Drag.FIXED: if (sel) {
        const pw = this.world(this.lastX, this.lastY);
        sel.x += w.x - pw.x; sel.y += w.y - pw.y; this.lastX = x; this.lastY = y;
        Solver.solve(this.s, null); this.liveChange();
      } break;
      case Drag.PAN: this.ox += x - this.lastX; this.oy += y - this.lastY; this.lastX = x; this.lastY = y; this.invalidate(); break;
    }
  }

  _up(e) {
    if (!this.pointers.has(e.pointerId)) return;
    const [x, y] = this._pos(e);
    this.pointers.delete(e.pointerId);
    if (this.drag === Drag.ZOOM) {
      if (this.pointers.size === 0) { this.drag = Drag.NONE; this.moved = false; this.invalidate(); }
      else { [this.lastX, this.lastY] = this._avg(); this.pinchDist = this._spread(); if (this.pointers.size < 2) this.pinchDist = 0; }
      return;
    }
    const was = this.drag;
    this.drag = Drag.NONE;
    if (!this.moved && was !== Drag.NONE) {
      // double tap on empty space = fit
      const now = performance.now();
      const dbl = now - this.lastTapT < 320 && hypot(x - this.lastTapX, y - this.lastTapY) < 30;
      this.lastTapT = now; this.lastTapX = x; this.lastTapY = y;
      if (dbl && this.hitAll(this.world(x, y)).length === 0 && this._tool === Tool.MOVE) { this.fit(); this.lastTapT = 0; }
      else this.onTap(x, y, was);
    }
    if (this.moved && (was === Drag.BODY || was === Drag.ROTATE || was === Drag.FIXED)) this.onCommit?.();
    this.moved = false;
    this.invalidate();
    this.ensureSprings();
  }
  _cancel(e) { this.pointers.delete(e.pointerId); if (this.pointers.size === 0) { this.drag = Drag.NONE; this.moved = false; } }

  liveChange() { this.invalidate(); this.onChanged?.(); }

  status(t) { this.lastStatus = t; this.onStatus?.(t); }

  finishTool() {
    if (this._tool === Tool.MOVE) return;
    const msg = this.lastStatus;
    this.tool = Tool.MOVE;
    this.onToolChanged?.(Tool.MOVE);
    this.status(msg ? `${msg}  → back to Move.` : 'Back to Move.');
  }

  done() {
    this.tapActionDone = true;
    Solver.solve(this.s, null);
    this.invalidate();
    this.onChanged?.();
    this.onCommit?.();
    this.ensureSprings();
  }

  onTap(px, py, was) {
    this.tapActionDone = false;
    this.onTapInner(px, py, was);
    if (this.tapActionDone) this.finishTool();
  }

  onTapInner(px, py, was) {
    const s = this.s, w = this.world(px, py);
    const solidTools = [Tool.PIN, Tool.SLIDE, Tool.SLOT, Tool.MESH, Tool.BELT, Tool.TRACE, Tool.WELD, Tool.MEASURE];
    const hits = this.hitAll(w, solidTools.includes(this._tool));
    switch (this._tool) {
      case Tool.MOVE: {
        const ml = this.distLineNear(px, py, hits.length === 0 ? 22 : 10);
        if (ml) this.onEditDistance?.(ml);
        else if (was === Drag.PAN && hits[0] && this.isLocked(hits[0])) this.status(this.lockedMsg(hits[0]));
        else if (was === Drag.PAN && hits.length === 0) {
          const bj = this.beltNear(px, py);
          if (bj) this.status(this.beltInfo(bj)); else this.select(null);
        }
        break;
      }
      case Tool.BELT: {
        const first = this.pending;
        if (!first) {
          const w1 = hits.find(b => b.isWheel()); if (!w1) { this.status('Tap a gear, pulley or disc.'); return; }
          this.pending = w1; this.status(this.prompt()); this.invalidate();
        } else {
          const w2 = hits.find(b => b !== first && b.isWheel()); if (!w2) { this.status('Tap another gear, pulley or disc.'); return; }
          this.pending = null; this.invalidate();
          const make = (crossed) => { const j = s.belt(first, w2, crossed); this.status(this.beltInfo(j)); this.done(); this.finishTool(); };
          if (!this.onChoose) make(false);
          else this.onChoose('Belt type', ['Open (same direction)', 'Crossed (opposite direction)'], i => make(i === 1));
        }
        break;
      }
      case Tool.PIN: {
        if (hits.length === 0) { this.status('Nothing here. Tap on a part.'); return; }
        const top = hits[0], under = hits[1] ?? null;
        const p = under ? this.snapTogether(w, top, under) : this.snap(w, [top]);
        s.pin(p, top, under);
        this.status(under ? `Pinned ${top.name} + ${under.name}.` : `Pinned ${top.name} to the ground.`);
        this.done();
        break;
      }
      case Tool.SLIDE: {
        const first = this.pending;
        if (!first) {
          const b = hits.find(x => !x.fixed && x.type !== BodyType.RAIL) ?? hits[0];
          if (!b) { this.status('Tap on a part.'); return; }
          if (b.type === BodyType.RAIL) { this.status("That's the rail. First tap the part that slides."); return; }
          if (b.fixed) { this.status(`${b.name} is locked. First tap the part that MOVES.`); return; }
          const tube = s.bodies.find(t => t !== b && t.type === BodyType.TUBE && (() => { const l = t.toLocal(b.x, b.y); return abs(l.y) < t.h / 2 && abs(l.x) < t.w / 2; })());
          if (tube) {
            s.removeGuideJoints(b, tube); s.slide(b, tube);
            const tight = b.type !== BodyType.GEAR && b.h > tube.h - 2 * tube.wall + 1e-6;
            this.status(`${b.name} now slides INSIDE ${tube.name}.` + (tight ? " Warning: it's wider than the tube's inside." : ''));
            this.done(); return;
          }
          this.pending = b; this.status(this.prompt()); this.invalidate();
        } else {
          const rail = hits.find(x => x !== first && (x.type === BodyType.RAIL || x.type === BodyType.RECT || x.type === BodyType.TUBE));
          if (!rail) { this.status(`Tap a rail (or a rectangle) for ${first.name}.`); return; }
          s.removeGuideJoints(first, rail);
          const j = s.slide(first, rail);
          this.pending = null;
          this.status(j.bx === 1.0 ? `${first.name} now slides INSIDE ${rail.name} (telescopic).` : `${first.name} now slides on ${rail.name}'s surface.`);
          this.done();
        }
        break;
      }
      case Tool.SLOT: {
        const first = this.pending;
        if (!first) {
          const b = hits[0]; if (!b) { this.status('Tap on a part.'); return; }
          if (b.fixed) { this.status(`${b.name} is locked. First tap the part that MOVES.`); return; }
          this.pending = b; this.pendingPt = this.snap(w, [b]); this.status(this.prompt()); this.invalidate();
        } else {
          const g = hits.find(x => x !== first); if (!g) { this.status(`Tap the surface (another part) for ${first.name}.`); return; }
          s.removeGuideJoints(first, g);
          s.slot(this.pendingPt ?? new P2(first.x, first.y), first, g);
          this.pending = null; this.pendingPt = null;
          this.status(`${first.name} now rides along ${g.name} and can still turn.`);
          this.done();
        }
        break;
      }
      case Tool.WELD: {
        const first = this.pending;
        if (!first) {
          const b = hits[0]; if (!b) { this.status('Tap on a part.'); return; }
          this.pending = b; this.pendingPt = w; this.status(this.prompt()); this.invalidate();
        } else {
          const other = hits.find(x => x !== first); if (!other) { this.status(`Tap another part to weld ${first.name} to.`); return; }
          const p = (other.contains(w.x, w.y, 0) && first.contains(w.x, w.y, 0)) ? w : (this.pendingPt ?? w);
          s.weld(p, first, other);
          this.pending = null; this.pendingPt = null;
          this.status(`${first.name} welded to ${other.name}. They now move as one part.`);
          this.done();
        }
        break;
      }
      case Tool.MESH: {
        const first = this.pending;
        if (!first) {
          const g = hits.find(x => x.type === BodyType.GEAR); if (!g) { this.status('Tap a gear.'); return; }
          this.pending = g; this.status(this.prompt()); this.invalidate();
        } else {
          const other = hits.find(x => x !== first && (x.type === BodyType.GEAR || x.type === BodyType.RACK));
          if (!other) { this.status('Tap another gear or a rack.'); return; }
          const err = other.type === BodyType.GEAR ? s.meshGears(first, other) : s.meshRack(first, other);
          this.pending = null;
          if (err) { this.status(err); this.invalidate(); return; }
          this.status(`${first.name} meshed with ${other.name}.`);
          this.done();
        }
        break;
      }
      case Tool.CUT: {
        const first = this.pending;
        if (!first) {
          const b = hits[0]; if (!b) { this.status('Tap the shape that will become the hole.'); return; }
          if (b.cut && s.weldGroupOf(b).some(m => !m.cut)) {
            // tapping an existing hole: change it or turn it back into a part
            const host = s.weldGroupOf(b).find(m => !m.cut);
            this.onChoose?.(`${b.name}: ${b.cut === 1 ? 'through hole' : 'pocket'} in ${host.name}`, ['Make it a through hole', 'Make it a pocket', 'Turn it back into a normal part'], i => {
              if (i < 2) { b.cut = i + 1; this.status(`${b.name} is now a ${i ? 'pocket' : 'through hole'}.`); }
              else { b.cut = 0; s.joints.splice(0, s.joints.length, ...s.joints.filter(j => !(j.kind === JointKind.WELD && (j.a === b.id || j.b === b.id)))); this.status(`${b.name} is a normal part again (unwelded).`); }
              this.done(); this.finishTool();
            });
            return;
          }
          this.pending = b; this.status(this.prompt()); this.invalidate();
        } else {
          const target = hits.find(x => x !== first && !x.cut);
          if (!target) { this.status(`Tap the part to cut ${first.name} out of.`); return; }
          const overlaps = Collision.overlap(Collision.shapesOf(first.cut ? Object.assign(Object.create(Object.getPrototypeOf(first)), first, { cut: 0 }) : first), Collision.shapesOf(target));
          const make = (mode) => {
            s.cutInto(first, target, mode);
            this.pending = null;
            this.status(`${first.name} is now a ${mode === 1 ? 'through hole' : 'pocket'} in ${target.name}. It moves with it. Tap the hole with Cut again to change it.` + (overlaps ? '' : ' (It doesn\'t touch the part yet: move the hole onto it.)'));
            this.done(); this.finishTool();
          };
          this.pending = null; this.invalidate();
          if (!this.onChoose) make(1);
          else this.onChoose('Cut type', ['Through hole (cut all the way)', 'Pocket (cut part depth, CNC sets the depth)'], i => make(i + 1));
        }
        break;
      }
      case Tool.LOCK: {
        const b = hits[0]; if (!b) { this.status('Tap on a part.'); return; }
        b.fixed = !b.fixed;
        this.status(b.fixed ? `${b.name} locked.` : `${b.name} unlocked.`);
        if (b === this.selected) this.onSelect?.(b);
        this.done();
        break;
      }
      case Tool.TRACE: {
        const b = hits[0];
        if (!b) { s.clearTracer(); this.status('Trace removed.'); }
        else { s.setTracer(b, this.snap(w, [b])); this.status(`Tracing a point on ${b.name}. Move things to draw its path.`); }
        this.done();
        break;
      }
      case Tool.MEASURE: this.measureTap(px, py, w, hits); break;
      case Tool.DELETE: {
        const j = this.jointNear(px, py) ?? this.beltNear(px, py);
        if (j) { s.joints.splice(s.joints.indexOf(j), 1); this.status('Joint deleted.'); this.done(); return; }
        const b = hits[0]; if (!b) { this.status('Tap a joint or a part.'); return; }
        const kill = () => {
          s.remove(b);
          if (b === this.selected) this.select(null);
          this.status(`${b.name} deleted. Undo brings it back.`);
          this.done(); this.finishTool();
        };
        if (this.onConfirm) this.onConfirm(`Delete ${b.name} and its joints?`, kill); else kill();
        break;
      }
    }
  }

  commitEdit() { this.done(); }

  // ---------- motor (Play) ----------
  slideOf(b) { return this.s.joints.find(j => j.kind === JointKind.SLIDE && j.a === b.id) ?? null; }
  isSpring(j) { return j.spring === 1 && (j.kind === JointKind.SLIDE || j.kind === JointKind.PIN); }
  pinOf(b) {
    const ids = new Set(this.s.weldGroupOf(b).map(x => x.id));
    const pins = this.s.joints.filter(j => j.kind === JointKind.PIN && (ids.has(j.a) || ids.has(j.b)));
    return pins.find(j => j.b < 0)
      ?? pins.find(j => { const o = ids.has(j.a) ? j.b : j.a; return this.s.byId(o)?.fixed === true; })
      ?? pins[0] ?? null;
  }
  springSlideOf(b) {
    const ids = new Set(this.s.weldGroupOf(b).map(x => x.id));
    return this.s.joints.find(j => j.kind === JointKind.SLIDE && ids.has(j.a)) ?? null;
  }

  startMotor(b) {
    if (b.fixed) { this.status(`${b.name} is locked. Unlock it to play.`); return; }
    this.haltMotor();
    this.motorBody = b; this.motorDir = this.playDir; this.travelled = 0; this.lastT = 0;
    this.ignore = Collision.overlappingPairs(this.s);
    this.onMotor?.(true);
    const sliding = this.slideOf(b) != null;
    this.status(this.playOnce && sliding ? `Playing once: ${b.name} slides to the end of its track.`
      : this.playOnce ? `Playing once: ${b.name} makes one full turn.`
      : sliding ? `Looping: ${b.name} slides back and forth.` : `Looping: ${b.name} spins. Reverses if it gets stuck.`);
    this.motorRaf = requestAnimationFrame(() => this._tick());
  }
  finishOnce(why) { this.stopMotor(); this.status(why); }
  stopMotor() { if (this.motorBody == null) return; this.haltMotor(); this.status('Stopped.'); this.done(); }
  haltMotor() {
    this.motorBody = null;
    if (this.motorRaf) cancelAnimationFrame(this.motorRaf); this.motorRaf = 0;
    this.onMotor?.(false);
    this.ensureSprings();
  }
  _tick() {
    const b = this.motorBody; if (!b) return;
    if (!this.s.bodies.includes(b) || b.fixed) { this.stopMotor(); return; }
    const now = performance.now();
    const dt = this.lastT === 0 ? 0.016 : clamp((now - this.lastT) / 1000, 0, 0.05);
    this.lastT = now;
    this.motorStep(b, dt);
    this.invalidate(); this.onChanged?.();
    if (this.motorBody) this.motorRaf = requestAnimationFrame(() => this._tick());
  }
  motorStep(b, dt) {
    const sj = this.slideOf(b), g = sj ? this.s.byId(sj.b) : null;
    if (sj && g) {
      const u0 = g.toLocal(b.x, b.y).x;
      let u1 = u0 + this.motorDir * this.mmPerSec * dt, atEnd = false;
      if (u1 >= sj.hi) { u1 = sj.hi; atEnd = true; }
      if (u1 <= sj.lo) { u1 = sj.lo; atEnd = true; }
      const t = g.toWorld(u1, sj.ay);
      this.movePoint(b, 0, 0, t.x, t.y, 12);
      const want = abs(u1 - u0);
      const stuck = want > 1e-6 && abs(g.toLocal(b.x, b.y).x - u0) < want * 0.2;
      if (this.playOnce) {
        if (atEnd) { this.finishOnce(`Done: ${b.name} reached the end of its track.`); return; }
        if (stuck) { this.finishOnce(`Stopped: ${b.name} is blocked.`); return; }
      } else {
        if (atEnd) this.motorDir = u1 >= sj.hi ? -1 : 1;
        else if (stuck) this.motorDir = -this.motorDir;
      }
    } else {
      let step = this.degPerSec * dt * PI / 180;
      if (this.playOnce) step = min(step, 2 * PI - this.travelled);
      const want = this.motorDir * step, a0 = b.a;
      this.moveAngle(b, a0 + want, 12);
      const got = abs(b.a - a0);
      this.travelled += got;
      const stuck = step > 1e-9 && got < step * 0.2;
      if (this.playOnce) {
        if (this.travelled >= 2 * PI - 1e-6) { this.finishOnce(`Done: ${b.name} made one full turn.`); return; }
        if (stuck) { this.finishOnce(`Stopped: ${b.name} can't turn further (blocked or at its limit).`); return; }
      } else if (stuck) this.motorDir = -this.motorDir;
    }
  }

  // ---------- springs + gravity loop ----------
  ensureSprings() {
    if (this.springRunning || (this._gravity === 0 && !this.s.joints.some(j => this.isSpring(j)))) return;
    this.springRunning = true; this.springLastT = 0;
    this.springRaf = requestAnimationFrame(() => this._springTick());
  }
  _springTick() {
    const springs = this.s.joints.filter(j => this.isSpring(j));
    if (springs.length === 0 && this._gravity === 0) { this.springRunning = false; this.springMoving = false; return; }
    const now = performance.now();
    const dt = this.springLastT === 0 ? 0.016 : clamp((now - this.springLastT) / 1000, 0, 0.05);
    this.springLastT = now;
    let anyMoving = false;
    if (this.userDragging) { this.springVel.clear(); this.gVel.clear(); }
    else {
      this.ignore = Collision.overlappingPairs(this.s);
      for (const j of springs) if (j.kind === JointKind.PIN ? this.torsionStep(j, dt, now) : this.springStep(j, dt, now)) anyMoving = true;
      if (this.gravityStep(dt, now)) anyMoving = true;
    }
    if (anyMoving) { this.invalidate(); this.onChanged?.(); }
    if (this.springMoving && !anyMoving) this.onCommit?.();
    this.springMoving = anyMoving;
    this.springRaf = requestAnimationFrame(() => this._springTick());
  }

  area(b) {
    if (b.cut) return 0;
    switch (b.type) {
      case BodyType.GEAR: return PI * b.pitchR() * b.pitchR();
      case BodyType.PULLEY: case BodyType.DISC: return PI * b.w * b.w / 4;
      default: return b.w * b.h;
    }
  }
  mechanisms() {
    const seen = new Set(), out = [], jointed = new Set();
    for (const j of this.s.joints) { jointed.add(j.a); if (j.b >= 0) jointed.add(j.b); }
    for (const b of this.s.bodies) {
      if (seen.has(b.id) || !jointed.has(b.id)) continue;
      const ids = this.mechanismIds(b);
      ids.forEach(i => seen.add(i));
      out.push(this.s.bodies.filter(x => ids.has(x.id)));
    }
    return out;
  }
  gravityStep(dt, now) {
    if (this._gravity === 0 || now < this.gIdleUntil) return false;
    const G = this.G, gv = this._gravity;
    const gx = gv === 2 ? -G : gv === 3 ? G : 0, gy = gv === 1 ? -G : gv === 4 ? G : 0;
    let moved = false;
    for (const mech of this.mechanisms()) {
      const free = mech.filter(b => !b.fixed);
      if (!free.some(b => !b.noGravity)) continue;
      const mb = this.motorBody;
      if (mb && mech.includes(mb)) continue;
      const loose = free.filter(b => !b.strong);
      if (!loose.some(b => !b.noGravity)) continue;
      for (let k = 0; k < this.subSteps; k++) if (this.holdStrong(new Set(), () => this.fallStep(loose, gx, gy, dt / this.subSteps))) moved = true;
    }
    if (!moved) this.gIdleUntil = now + 120;
    return moved;
  }
  fallStep(free, gx, gy, h) {
    const s = this.s;
    const heavy = free.filter(b => !b.noGravity);
    const maxW = max(1e-9, ...heavy.map(b => sqrt(this.area(b))));
    const old = new Map(free.map(b => [b.id, [b.x, b.y, b.a]]));
    const tx = [], ty = [];
    heavy.forEach((b, i) => {
      let v = this.gVel.get(b.id); if (!v) { v = [0, 0]; this.gVel.set(b.id, v); }
      v[0] += gx * h; v[1] += gy * h;
      tx[i] = b.x + v[0] * h; ty[i] = b.y + v[1] * h;
    });
    const drivesAt = f => heavy.map((b, i) => { const o = old.get(b.id); return Drive.gravity(b, o[0] + (tx[i] - o[0]) * f, o[1] + (ty[i] - o[1]) * f, sqrt(this.area(b)) / maxW); });
    if (!this.collide) Solver.solveMulti(s, drivesAt(1), 10);
    else {
      const start = this.snapshot();
      const before = new Map(s.bodies.map(b => [b.id, [b.x, b.y, b.a]]));
      Solver.solveMulti(s, drivesAt(1), 10);
      if (Collision.hasNew(s, this.ignore) && !this.pushFree(null, before)) {
        let lo = 0, hi = 1, good = start;
        for (let k = 0; k < 7; k++) {
          const mid = (lo + hi) / 2;
          this.restore(start);
          Solver.solveMulti(s, drivesAt(mid), 10);
          if (Collision.hasNew(s, this.ignore)) hi = mid; else { lo = mid; good = this.snapshot(); }
        }
        this.restore(good);
      }
    }
    let moved = false;
    for (const b of free) {
      const o = old.get(b.id), dx = b.x - o[0], dy = b.y - o[1];
      if (!b.noGravity) this.gVel.set(b.id, [dx / h * 0.999, dy / h * 0.999]);
      if (abs(b.x) > 20000 || abs(b.y) > 20000) {
        s.weldGroupOf(b).forEach(m => { m.noGravity = true; this.gVel.delete(m.id); });
        this.post(() => this.status(`${b.name} fell more than 20 m (nothing holds it up). Its gravity is now OFF; tap Fit to find it.`));
      }
      if (hypot(dx, dy) > 0.002 || abs(b.a - o[2]) * b.boundR() > 0.002) moved = true;
    }
    return moved;
  }

  springStep(j, dt, now) {
    const s = this.s, car = s.byId(j.a), g = s.byId(j.b); if (!car || !g) return false;
    if (car.fixed || car === this.motorBody) { this.springVel.set(j, 0); return false; }
    const u = g.toLocal(car.x, car.y).x;
    const rest = clamp(j.rest, j.lo, j.hi);
    let v = this.springVel.get(j) ?? 0;
    const err = rest - u;
    if (abs(err) < 0.05 && abs(v) < 1.0) { this.springVel.set(j, 0); return false; }
    const wait = this.springWaitUntil.get(j);
    if (wait != null && now < wait) return false;
    const k = j.sol > 0 ? 600 : this.springK, cd = j.sol > 0 ? 35 : this.springC;
    v += (k * err - cd * v) * dt;
    v = clamp(v, -3000, 3000);
    let u1 = u + v * dt;
    if (u1 > j.hi) { u1 = j.hi; v = 0; }
    if (u1 < j.lo) { u1 = j.lo; v = 0; }
    const t = g.toWorld(u1, j.ay);
    this.movePoint(car, 0, 0, t.x, t.y, 12);
    const got = g.toLocal(car.x, car.y).x - u, want = u1 - u;
    if (abs(want) > 1e-4 && abs(got) < abs(want) * 0.3) {
      this.springVel.set(j, 0); this.springWaitUntil.set(j, now + 150);
      return abs(got) > 1e-3;
    }
    this.springWaitUntil.delete(j);
    this.springVel.set(j, v);
    return true;
  }

  torsionStep(j, dt, now) {
    const s = this.s, A = s.byId(j.a), B = j.b >= 0 ? s.byId(j.b) : null; if (!A) return false;
    const moveA = !A.fixed && A !== this.motorBody;
    const moveB = B != null && !B.fixed && B !== this.motorBody;
    if (!moveA && !moveB) { this.springVel.set(j, 0); return false; }
    const t = s.relAngle(j);
    let w = this.springVel.get(j) ?? 0;
    const err = j.rest - t;
    if (abs(err) < 0.0005 && abs(w) < 0.01) { this.springVel.set(j, 0); return false; }
    const wait = this.springWaitUntil.get(j);
    if (wait != null && now < wait) return false;
    w += (this.springK * err - this.springC * w) * dt;
    w = clamp(w, -40, 40);
    const want = w * dt;
    if (moveA) this.moveAngle(A, A.a + want, 12); else this.moveAngle(B, B.a - want, 12);
    const got = s.relAngle(j) - t;
    if (abs(want) > 1e-6 && abs(got) < abs(want) * 0.3) {
      this.springVel.set(j, 0); this.springWaitUntil.set(j, now + 150);
      return abs(got) > 1e-5;
    }
    this.springWaitUntil.delete(j);
    this.springVel.set(j, w);
    return true;
  }

  drawTorsion(c, j) {
    const s = this.s, A = s.byId(j.a); if (!A) return;
    const p = A.toWorld(j.ax, j.ay);
    const ri = this.pinRadiusMm(j) * 1.5, ro = ri * 2.6;
    const base = j.b >= 0 ? (s.byId(j.b)?.a ?? 0) : 0;
    const twist = s.relAngle(j) - j.rest;
    const turns = max(2.5 * 2 * PI + twist * 0.5, PI);
    c.beginPath();
    const n = 90;
    for (let k = 0; k <= n; k++) {
      const f = k / n, ang = base + f * turns, r = ri + (ro - ri) * f;
      const x = this.sx(p.x + r * cos(ang)), y = this.sy(p.y + r * sin(ang));
      k ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    const legEnd = A.toWorld(j.ax + ro * 1.5, j.ay);
    c.lineTo(this.sx(legEnd.x), this.sy(legEnd.y));
    c.setLineDash([]); c.strokeStyle = C.spring; c.lineJoin = 'round'; c.lineCap = 'round';
    c.lineWidth = max(ri * 0.22 * this.scale, 1.5); c.stroke();
  }

  drawSpring(c, j) {
    const s = this.s, car = s.byId(j.a), g = s.byId(j.b); if (!car || !g) return;
    const u = g.toLocal(car.x, car.y).x;
    const x0 = -g.w / 2, x1 = u - car.halfLen();
    if (x1 - x0 < 1) return;
    const amp = clamp(car.sideHalf() * 0.5, 1.5, 6), coils = 10, lead = (x1 - x0) * 0.06;
    c.beginPath();
    const at = (x, y, first = false) => { const p = g.toWorld(x, j.ay + y); first ? c.moveTo(this.sx(p.x), this.sy(p.y)) : c.lineTo(this.sx(p.x), this.sy(p.y)); };
    at(x0, 0, true); at(x0 + lead, 0);
    const span = (x1 - x0) - 2 * lead;
    for (let k = 1; k <= coils * 2; k++) at(x0 + lead + span * (k - 0.5) / (coils * 2), k % 2 === 1 ? amp : -amp);
    at(x1 - lead, 0); at(x1, 0);
    c.setLineDash([]); c.strokeStyle = C.spring; c.lineJoin = 'round'; c.lineCap = 'round';
    const lw = max(min(amp, 3) * 0.35 * this.scale, 1.5);
    c.lineWidth = lw; c.stroke();
    const a = g.toWorld(x0, j.ay - amp * 1.3), b = g.toWorld(x0, j.ay + amp * 1.3);
    this.seg(c, this.sx(a.x), this.sy(a.y), this.sx(b.x), this.sy(b.y), C.spring, max(lw * 1.6, 2));
  }

  afterReload(selId) {
    this.haltMotor(); this.gVel.clear();
    this.pending = null; this.pendingPt = null;
    this.selected = this.s.byId(selId) ?? null;
    this.onSelect?.(this.selected);
    this.invalidate();
  }

  setPose(b, x, y, angDeg) {
    if (this.isLocked(b)) { this.status(this.lockedMsg(b)); this.onSelect?.(b); return; }
    this.ignore = Collision.overlappingPairs(this.s);
    if (x != null || y != null) this.movePoint(b, 0, 0, x ?? b.x, y ?? b.y, 60);
    if (angDeg != null) this.moveAngle(b, b.a + wrapPi(angDeg * PI / 180 - b.a), 60);
    this.done();
  }

  nudge(b, dx, dy, dDeg) {
    if (this.isLocked(b)) { this.status(this.lockedMsg(b)); return; }
    this.ignore = Collision.overlappingPairs(this.s);
    if (dx !== 0 || dy !== 0) this.movePoint(b, 0, 0, b.x + dx, b.y + dy, 60);
    if (dDeg !== 0) this.moveAngle(b, b.a + dDeg * PI / 180, 60);
    this.done();
  }

  // ---------- blocked motion ----------
  snapshot() {
    const s = this.s;
    return { pose: s.bodies.map(b => [b.x, b.y, b.a]), phi: s.joints.map(j => j.phi), traceN: s.trace.length };
  }
  restore(sn) {
    const s = this.s;
    s.bodies.forEach((b, i) => { const p = sn.pose[i]; if (p) { b.x = p[0]; b.y = p[1]; b.a = p[2]; } });
    s.joints.forEach((j, i) => { if (i < sn.phi.length) j.phi = sn.phi[i]; });
    if (s.trace.length > sn.traceN) s.trace.length = sn.traceN;
  }
  holdStrong(free, block) {
    const held = this.s.bodies.filter(b => b.strong && !b.fixed && !free.has(b.id));
    held.forEach(b => { b.fixed = true; });
    try { return block(); } finally { held.forEach(b => { b.fixed = false; }); }
  }
  mechanismIds(b) {
    const ids = new Set([b.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const j of this.s.joints) if (j.b >= 0) {
        if (ids.has(j.a) && !ids.has(j.b)) { ids.add(j.b); grew = true; }
        if (ids.has(j.b) && !ids.has(j.a)) { ids.add(j.a); grew = true; }
      }
    }
    return ids;
  }
  blocked(iters, driveAt) {
    const driven = driveAt(1).body;
    this.holdStrong(this.mechanismIds(driven), () => this.blockedInner(iters, driveAt));
  }
  blockedInner(iters, driveAt) {
    const s = this.s;
    if (!this.collide) { Solver.solve(s, driveAt(1), iters); return; }
    const start = this.snapshot();
    const before = new Map(s.bodies.map(b => [b.id, [b.x, b.y, b.a]]));
    const drive = driveAt(1);
    Solver.solve(s, drive, iters);
    if (!Collision.hasNew(s, this.ignore)) return;
    if (this.pushFree(drive.body, before)) { s.recordTrace(); return; }
    this.restore(start);
    let lo = 0, hi = 1, good = start;
    for (let k = 0; k < 8; k++) {
      const mid = (lo + hi) / 2;
      this.restore(start);
      Solver.solve(s, driveAt(mid), iters);
      if (Collision.hasNew(s, this.ignore)) hi = mid; else { lo = mid; good = this.snapshot(); }
    }
    this.restore(good);
    s.recordTrace();
  }
  pushFree(driven, before) {
    const s = this.s;
    const movedBy = b => { const o = before.get(b.id); return o ? hypot(b.x - o[0], b.y - o[1]) + abs(b.a - o[2]) * b.boundR() : 0; };
    for (let k = 0; k < 8; k++) {
      const cs = Collision.newContacts(s, this.ignore);
      if (cs.length === 0) return true;
      let c = cs[0]; for (const x of cs) if (x.depth > c.depth) c = x;
      const pushed = c.a === driven ? c.b : c.b === driven ? c.a : movedBy(c.a) >= movedBy(c.b) ? c.b : c.a;
      if (pushed.fixed) return false;
      const dir = pushed === c.b ? 1 : -1;
      const lp = pushed.toLocal(c.px, c.py), d = c.depth + 0.05;
      Solver.solve(s, Drive.point(pushed, lp.x, lp.y, c.px + c.nx * dir * d, c.py + c.ny * dir * d), 20);
    }
    return !Collision.hasNew(s, this.ignore);
  }
  movePoint(b, lx, ly, tx, ty, iters) {
    const p0 = b.toWorld(lx, ly);
    this.blocked(iters, t => Drive.point(b, lx, ly, p0.x + (tx - p0.x) * t, p0.y + (ty - p0.y) * t));
  }
  moveAngle(b, target, iters) {
    const a0 = b.a;
    this.blocked(iters, t => Drive.angle(b, a0 + (target - a0) * t));
  }
}

// rounded rectangle helper that works for both Path2D and the canvas context
function roundRect(p, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y); p.arcTo(x + w, y, x + w, y + r, r);
  p.lineTo(x + w, y + h - r); p.arcTo(x + w, y + h, x + w - r, y + h, r);
  p.lineTo(x + r, y + h); p.arcTo(x, y + h, x, y + h - r, r);
  p.lineTo(x, y + r); p.arcTo(x, y, x + r, y, r);
  p.closePath();
}
