// The document canvas: zoom/pan, rendering (composite, selection, overlays, rulers)
// and routing of pointer input to the active tool.
import { app } from '../core/app.js';
import { el, clamp, getCheckerPattern } from '../core/utils.js';

export const ZOOM_STEPS = [
  0.02, 0.03, 0.05, 0.0667, 0.0833, 0.125, 0.1667, 0.25, 0.3333, 0.5, 0.6667, 1,
  1.5, 2, 3, 4, 5, 6, 7, 8, 12, 16, 24, 32, 48, 64,
];
export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 64;
const RULER = 20;
const BG = '#1d1e21';

export class Viewport {
  constructor(host) {
    this.host = host;
    this.canvas = el('canvas', { class: 'view-canvas' });
    this.ctx = this.canvas.getContext('2d');
    this.rulerTop = el('canvas', { class: 'ruler ruler-top' });
    this.rulerLeft = el('canvas', { class: 'ruler ruler-left' });
    this.textEditor = el('textarea', { class: 'text-editor', spellcheck: false, autocomplete: 'off' });
    this.stage = el('div', { class: 'stage' }, this.canvas, this.textEditor);
    host.append(el('div', { class: 'ruler-corner' }), this.rulerTop, this.rulerLeft, this.stage);

    this.dpr = window.devicePixelRatio || 1;
    this.W = 0;
    this.H = 0;
    this.pointer = null;
    this.space = false;
    this.panning = null;
    this.antsPhase = 0;
    this._raf = 0;

    new ResizeObserver(() => this.resize()).observe(this.stage);
    this.bindInput();
    setInterval(() => {
      const doc = app.doc;
      if (doc?.selection || app.tool?.animated) {
        this.antsPhase = (this.antsPhase + 1) % 8;
        this.requestRender();
      }
    }, 110);

    app.on('view', () => this.requestRender());
    app.on('content', () => this.requestRender());
    app.on('selection', () => this.requestRender());
    this.applySettings();
  }

  get doc() {
    return app.doc;
  }

  applySettings() {
    this.host.classList.toggle('no-rulers', !app.settings.rulers);
    this.requestRender();
  }

  resize() {
    const r = this.stage.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    const fresh = !this.W;
    this.W = r.width;
    this.H = r.height;
    for (const [c, w, h] of [
      [this.canvas, r.width, r.height],
      [this.rulerTop, r.width, RULER],
      [this.rulerLeft, RULER, r.height],
    ]) {
      c.width = Math.max(1, Math.round(w * this.dpr));
      c.height = Math.max(1, Math.round(h * this.dpr));
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    if (fresh && this.doc) this.fit();
    this.render();
  }

  /* ------------------------------------------------------------ geometry */

  docToScreen(x, y) {
    const v = this.doc.view;
    return { x: x * v.zoom + v.x, y: y * v.zoom + v.y };
  }

  screenToDoc(sx, sy) {
    const v = this.doc.view;
    return { x: (sx - v.x) / v.zoom, y: (sy - v.y) / v.zoom };
  }

  get zoom() {
    return this.doc?.view.zoom || 1;
  }

  fit(allowUpscale = false) {
    const doc = this.doc;
    if (!doc || !this.W) return;
    const pad = 48;
    let z = Math.min((this.W - pad * 2) / doc.width, (this.H - pad * 2) / doc.height);
    if (!allowUpscale) z = Math.min(1, z);
    z = clamp(z, MIN_ZOOM, MAX_ZOOM);
    doc.view.zoom = z;
    this.center();
  }

  center() {
    const doc = this.doc;
    if (!doc) return;
    const v = doc.view;
    v.x = Math.round((this.W - doc.width * v.zoom) / 2);
    v.y = Math.round((this.H - doc.height * v.zoom) / 2);
    app.emit('view');
  }

  setZoom(z, sx = this.W / 2, sy = this.H / 2) {
    const doc = this.doc;
    if (!doc) return;
    z = clamp(z, MIN_ZOOM, MAX_ZOOM);
    const v = doc.view;
    const p = this.screenToDoc(sx, sy);
    v.zoom = z;
    v.x = Math.round(sx - p.x * z);
    v.y = Math.round(sy - p.y * z);
    this.clampPan();
    app.emit('view');
  }

  zoomStep(dir, sx, sy) {
    const z = this.zoom;
    let next;
    if (dir > 0) next = ZOOM_STEPS.find((s) => s > z * 1.001) ?? MAX_ZOOM;
    else next = [...ZOOM_STEPS].reverse().find((s) => s < z / 1.001) ?? MIN_ZOOM;
    this.setZoom(next, sx, sy);
  }

  pan(dx, dy) {
    const v = this.doc?.view;
    if (!v) return;
    v.x = Math.round(v.x + dx);
    v.y = Math.round(v.y + dy);
    this.clampPan();
    app.emit('view');
  }

  clampPan() {
    const doc = this.doc;
    const v = doc.view;
    const m = 64;
    v.x = clamp(v.x, m - doc.width * v.zoom, this.W - m);
    v.y = clamp(v.y, m - doc.height * v.zoom, this.H - m);
  }

  /* ------------------------------------------------------------- render */

  requestRender() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => this.render());
  }

  render() {
    cancelAnimationFrame(this._raf);
    this._raf = 0;
    const { ctx, dpr, W, H } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    const doc = this.doc;
    if (doc) {
      const { zoom: z, x: ox, y: oy } = doc.view;
      const dw = doc.width * z;
      const dh = doc.height * z;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 6;
      ctx.fillStyle = '#fff';
      ctx.fillRect(ox, oy, dw, dh);
      ctx.restore();

      ctx.save();
      ctx.translate(ox, oy);
      ctx.fillStyle = getCheckerPattern(ctx);
      ctx.fillRect(0, 0, dw, dh);
      ctx.restore();

      const comp = doc.getComposite();
      ctx.imageSmoothingEnabled = z < 1;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(comp, ox, oy, dw, dh);
      ctx.imageSmoothingEnabled = true;

      if (z >= 8 && app.settings.pixelGrid) this.drawPixelGrid(doc);

      if (doc.selection && !this.hideSelection) this.drawAnts(doc.selection.path);

      ctx.save();
      if (app.transform) app.transform.drawOverlay(ctx, this);
      else app.tool?.drawOverlay?.(ctx, this);
      ctx.restore();
    }
    if (app.settings.rulers) this.drawRulers();
  }

  drawPixelGrid(doc) {
    const { ctx } = this;
    const { zoom: z, x: ox, y: oy } = doc.view;
    const x0 = Math.max(0, Math.floor(-ox / z));
    const x1 = Math.min(doc.width, Math.ceil((this.W - ox) / z));
    const y0 = Math.max(0, Math.floor(-oy / z));
    const y1 = Math.min(doc.height, Math.ceil((this.H - oy) / z));
    ctx.beginPath();
    for (let x = x0; x <= x1; x++) {
      const sx = Math.round(ox + x * z) + 0.5;
      ctx.moveTo(sx, oy + y0 * z);
      ctx.lineTo(sx, oy + y1 * z);
    }
    for (let y = y0; y <= y1; y++) {
      const sy = Math.round(oy + y * z) + 0.5;
      ctx.moveTo(ox + x0 * z, sy);
      ctx.lineTo(ox + x1 * z, sy);
    }
    ctx.strokeStyle = 'rgba(140,140,140,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** Stroke a document-space path as animated marching ants. */
  drawAnts(path, phase = this.antsPhase) {
    const { ctx } = this;
    const { zoom: z, x: ox, y: oy } = this.doc.view;
    ctx.save();
    ctx.translate(ox + 0.5, oy + 0.5);
    ctx.scale(z, z);
    ctx.lineWidth = 1 / z;
    ctx.setLineDash([4 / z, 4 / z]);
    ctx.lineDashOffset = -phase / z;
    ctx.strokeStyle = '#fff';
    ctx.stroke(path);
    ctx.lineDashOffset = -(phase + 4) / z;
    ctx.strokeStyle = '#000';
    ctx.stroke(path);
    ctx.restore();
  }

  drawRulers() {
    const doc = this.doc;
    const dpr = this.dpr;
    for (const horizontal of [true, false]) {
      const c = horizontal ? this.rulerTop : this.rulerLeft;
      const g = c.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const len = horizontal ? this.W : this.H;
      g.fillStyle = '#26272b';
      g.fillRect(0, 0, horizontal ? len : RULER, horizontal ? RULER : len);
      g.fillStyle = '#3a3c42';
      if (horizontal) g.fillRect(0, RULER - 1, len, 1);
      else g.fillRect(RULER - 1, 0, 1, len);
      if (!doc) continue;
      const z = doc.view.zoom;
      const off = horizontal ? doc.view.x : doc.view.y;
      const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
      const major = steps.find((s) => s * z >= 64) || 10000;
      const minorDiv = major % 10 === 0 || major === 1 ? 10 : 5;
      const minor = major / minorDiv;
      const start = Math.floor(-off / z / major) * major;
      const end = (len - off) / z;
      g.strokeStyle = '#7d8088';
      g.fillStyle = '#a3a6ad';
      g.font = '9px "Segoe UI", sans-serif';
      g.lineWidth = 1;
      g.beginPath();
      for (let v = start; v <= end; v += minor) {
        const p = Math.round(off + v * z) + 0.5;
        if (p < 0) continue;
        const idx = Math.round((v - start) / minor);
        const isMajor = idx % minorDiv === 0;
        const isHalf = !isMajor && minorDiv === 10 && idx % 5 === 0;
        const t = isMajor ? RULER : isHalf ? 7 : 4;
        if (horizontal) {
          g.moveTo(p, RULER);
          g.lineTo(p, RULER - t);
          if (isMajor) g.fillText(String(Math.round(v)), p + 3, 9);
        } else {
          g.moveTo(RULER, p);
          g.lineTo(RULER - t, p);
          if (isMajor) {
            g.save();
            g.translate(9, p + 3);
            g.rotate(-Math.PI / 2);
            g.textAlign = 'right';
            g.fillText(String(Math.round(v)), 0, 0);
            g.restore();
          }
        }
      }
      g.stroke();
      if (this.pointer) {
        const p = (horizontal ? this.pointer.sx : this.pointer.sy) + 0.5;
        g.strokeStyle = '#4f8cff';
        g.beginPath();
        if (horizontal) {
          g.moveTo(p, 0);
          g.lineTo(p, RULER);
        } else {
          g.moveTo(0, p);
          g.lineTo(RULER, p);
        }
        g.stroke();
      }
    }
  }

  /* -------------------------------------------------------------- input */

  eventPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const d = this.doc ? this.screenToDoc(sx, sy) : { x: 0, y: 0 };
    return {
      x: d.x,
      y: d.y,
      sx,
      sy,
      e,
      shift: e.shiftKey,
      alt: e.altKey,
      ctrl: e.ctrlKey || e.metaKey,
      pressure: e.pointerType === 'pen' ? e.pressure || 0.5 : 1,
      button: e.button,
    };
  }

  bindInput() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e));
    c.addEventListener('pointercancel', (e) => this.onUp(e));
    c.addEventListener('dblclick', (e) => {
      if (!this.doc) return;
      const p = this.eventPoint(e);
      if (app.transform) app.transform.onDoubleClick?.(p);
      else app.tool?.onDoubleClick?.(p);
    });
    c.addEventListener('pointerleave', () => {
      if (this.activePointer != null) return;
      this.pointer = null;
      app.emit('pointer', null);
      this.requestRender();
    });
    c.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
  }

  onDown(e) {
    if (!this.doc) return;
    if (this.activePointer != null && e.pointerId !== this.activePointer) return;
    if (e.button === 2) return;
    // Suppress compatibility mouse events so focus changes stay under our control
    // (e.g. the text tool focusing its editor during pointerdown).
    e.preventDefault();
    document.activeElement?.blur?.();
    const p = this.eventPoint(e);
    this.pointer = p;
    this.activePointer = e.pointerId;
    this.canvas.setPointerCapture(e.pointerId);
    if (e.button === 1 || this.space || (app.toolId === 'hand' && !app.transform)) {
      this.panning = { sx: p.sx, sy: p.sy, x: this.doc.view.x, y: this.doc.view.y };
      this.updateCursor();
      return;
    }
    if (app.transform) app.transform.onDown(p);
    else app.tool?.onDown?.(p);
    this.updateCursor();
  }

  onMove(e) {
    const p = this.eventPoint(e);
    this.pointer = p;
    app.emit('pointer', this.doc ? p : null);
    if (this.panning) {
      const v = this.doc.view;
      v.x = Math.round(this.panning.x + p.sx - this.panning.sx);
      v.y = Math.round(this.panning.y + p.sy - this.panning.sy);
      this.clampPan();
      app.emit('view');
      return;
    }
    if (!this.doc) return;
    const dragging = this.activePointer === e.pointerId;
    if (app.transform) {
      if (dragging) app.transform.onMove(p);
    } else if (dragging) {
      // Coalesced events give smoother brush strokes on fast movements.
      const events = e.getCoalescedEvents?.() || [];
      if (app.tool?.wantsCoalesced && events.length > 1) {
        for (const ce of events) app.tool.onMove?.(this.eventPoint(ce));
      } else app.tool?.onMove?.(p);
    } else app.tool?.onHover?.(p);
    this.updateCursor();
    this.requestRender();
  }

  onUp(e) {
    if (this.activePointer !== e.pointerId) return;
    this.activePointer = null;
    const p = this.eventPoint(e);
    if (this.panning) {
      this.panning = null;
    } else if (this.doc) {
      if (app.transform) app.transform.onUp(p);
      else app.tool?.onUp?.(p);
    }
    this.updateCursor();
    this.requestRender();
  }

  get isDragging() {
    return this.activePointer != null;
  }

  onWheel(e) {
    e.preventDefault();
    if (!this.doc) return;
    const p = this.eventPoint(e);
    if (e.ctrlKey || e.altKey || e.metaKey) {
      const k = Math.pow(1.0018, -e.deltaY * (e.deltaMode === 1 ? 30 : 1));
      this.setZoom(this.zoom * k, p.sx, p.sy);
    } else {
      const unit = e.deltaMode === 1 ? 30 : 1;
      if (e.shiftKey) this.pan(-(e.deltaY || e.deltaX) * unit, 0);
      else this.pan(-e.deltaX * unit, -e.deltaY * unit);
    }
  }

  setSpace(down) {
    if (this.space === down) return;
    this.space = down;
    this.updateCursor();
  }

  updateCursor() {
    let cur = 'default';
    if (this.panning) cur = 'grabbing';
    else if (this.space) cur = 'grab';
    else if (!this.doc) cur = 'default';
    else if (app.transform) cur = app.transform.getCursor(this.pointer) || 'default';
    else {
      const t = app.tool;
      cur = (t?.getCursor ? t.getCursor(this.pointer) : t?.cursor) || 'default';
    }
    if (this.canvas.style.cursor !== cur) this.canvas.style.cursor = cur;
  }
}
