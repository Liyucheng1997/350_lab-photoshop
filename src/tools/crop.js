// Crop tool: adjustable crop box with handles, aspect presets, rule-of-thirds guides.
import { app } from '../core/app.js';
import { createCanvas, dist } from '../core/utils.js';
import { renderTextLayer } from '../core/text.js';
import { dragRect, drawHandle, screenRect } from './helpers.js';
import { drawInfoBubble } from './select.js';

const HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const CURSORS = { '-1,-1': 'nwse-resize', '1,1': 'nwse-resize', '1,-1': 'nesw-resize', '-1,1': 'nesw-resize', '0,-1': 'ns-resize', '0,1': 'ns-resize', '-1,0': 'ew-resize', '1,0': 'ew-resize' };

export function cropDocument(r) {
  const doc = app.doc;
  r = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
  if (r.w < 1 || r.h < 1) return;
  for (const layer of doc.layers) {
    const c = createCanvas(r.w, r.h);
    c.getContext('2d').drawImage(layer.canvas, -r.x, -r.y);
    layer.canvas = c;
    if (layer.isText) {
      layer.text.x -= r.x;
      layer.text.y -= r.y;
      renderTextLayer(layer);
    }
  }
  doc.width = r.w;
  doc.height = r.h;
  doc.setSelection(null);
  app.commit('裁剪', 'crop');
  app.viewport.fit();
  app.emit('doc-meta');
}

export const cropTool = {
  id: 'crop',
  name: '裁剪工具',
  icon: 'crop',
  key: 'C',
  cursor: 'crosshair',
  hint: '拖动调整裁剪框，按 Enter 或双击确认，Esc 复位',
  options: { ratio: 'free' },
  schema: [
    {
      type: 'select',
      key: 'ratio',
      label: '比例',
      options: [['free', '不受约束'], ['orig', '原始比例'], ['1:1', '1 : 1（方形）'], ['4:3', '4 : 3'], ['3:2', '3 : 2'], ['16:9', '16 : 9'], ['9:16', '9 : 16'], ['3:4', '3 : 4']],
    },
    { type: 'info', text: () => (cropTool.box ? `${Math.round(cropTool.box.w)} × ${Math.round(cropTool.box.h)} 像素` : '') },
    'spacer',
    { type: 'iconbutton', icon: 'rotate-ccw', title: '复位', run: () => cropTool.reset() },
    { type: 'iconbutton', icon: 'x', title: '取消', run: () => cropTool.reset() },
    { type: 'iconbutton', icon: 'check', title: '提交当前裁剪操作 (Enter)', run: () => cropTool.apply(), primary: true },
  ],
  box: null,
  drag: null,

  activate() {
    this.reset();
  },
  deactivate() {
    this.box = null;
    this.drag = null;
  },
  reset() {
    const doc = app.doc;
    this.box = doc ? { x: 0, y: 0, w: doc.width, h: doc.height } : null;
    this.drag = null;
    app.emit('tool-options', this);
    app.requestRender();
  },
  cancel() {
    this.reset();
    return false;
  },

  ratio() {
    const r = this.options.ratio;
    if (r === 'free') return 0;
    if (r === 'orig') return app.doc.width / app.doc.height;
    const [a, b] = r.split(':').map(Number);
    return a / b;
  },

  onOptionChange(key) {
    if (key === 'ratio' && this.box) {
      const k = this.ratio();
      if (k) {
        const b = this.box;
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        let w = b.w, h = w / k;
        if (h > b.h) {
          h = b.h;
          w = h * k;
        }
        this.box = { x: cx - w / 2, y: cy - h / 2, w, h };
      }
    }
  },

  hit(p, vp) {
    const b = this.box;
    if (!b) return { kind: 'new' };
    for (const [hx, hy] of HANDLES) {
      const s = vp.docToScreen(b.x + ((hx + 1) / 2) * b.w, b.y + ((hy + 1) / 2) * b.h);
      if (dist(s.x, s.y, p.sx, p.sy) <= 8) return { kind: 'handle', hx, hy };
    }
    if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return { kind: 'move' };
    return { kind: 'new' };
  },

  getCursor(p) {
    if (!p) return 'crosshair';
    const h = this.drag || this.hit(p, app.viewport);
    if (h.kind === 'handle') return CURSORS[`${h.hx},${h.hy}`];
    if (h.kind === 'move') return 'move';
    return 'crosshair';
  },

  onDown(p) {
    const h = this.hit(p, app.viewport);
    this.drag = { ...h, start: { x: p.x, y: p.y }, box0: this.box && { ...this.box } };
  },

  onMove(p) {
    const d = this.drag;
    if (!d) return;
    const k = this.ratio();
    if (d.kind === 'new') {
      let r = dragRect(d.start, p, { square: p.shift });
      if (k) {
        const sx = Math.sign(p.x - d.start.x) || 1, sy = Math.sign(p.y - d.start.y) || 1;
        const w = r.w, h = w / k;
        r = { x: sx > 0 ? d.start.x : d.start.x - w, y: sy > 0 ? d.start.y : d.start.y - h, w, h };
      }
      this.box = r;
    } else if (d.kind === 'move') {
      const b = d.box0;
      this.box = { ...b, x: Math.round(b.x + p.x - d.start.x), y: Math.round(b.y + p.y - d.start.y) };
    } else {
      const b = d.box0;
      let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (d.hx < 0) x0 += dx;
      if (d.hx > 0) x1 += dx;
      if (d.hy < 0) y0 += dy;
      if (d.hy > 0) y1 += dy;
      let r = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
      if (k) {
        if (d.hx !== 0) {
          const h = r.w / k;
          if (d.hy < 0) r.y = r.y + r.h - h;
          else if (d.hy === 0) r.y = b.y + b.h / 2 - h / 2;
          r.h = h;
        } else {
          const w = r.h * k;
          r.x = b.x + b.w / 2 - w / 2;
          r.w = w;
        }
      }
      this.box = r;
    }
    app.emit('tool-options', this);
  },

  onUp() {
    const d = this.drag;
    this.drag = null;
    if (d?.kind === 'new' && (!this.box || this.box.w < 2 || this.box.h < 2)) this.box = d.box0;
    app.emit('tool-options', this);
  },

  onDoubleClick(p) {
    if (this.hit(p, app.viewport).kind === 'move') this.apply();
  },

  onKey(e) {
    if (e.key === 'Enter') this.apply();
    else if (e.key === 'Escape') this.reset();
    else return false;
    return true;
  },

  apply() {
    const doc = app.doc;
    const b = this.box;
    if (!doc || !b) return;
    if (Math.round(b.x) === 0 && Math.round(b.y) === 0 && Math.round(b.w) === doc.width && Math.round(b.h) === doc.height) return;
    cropDocument(b);
    this.reset();
  },

  drawOverlay(ctx, vp) {
    const b = this.box;
    if (!b) return;
    const r = screenRect(vp, b);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, vp.W, vp.H);
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fill('evenodd');
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      const x = Math.round(r.x + (r.w * i) / 3) + 0.5;
      const y = Math.round(r.y + (r.h * i) / 3) + 0.5;
      ctx.moveTo(x, r.y);
      ctx.lineTo(x, r.y + r.h);
      ctx.moveTo(r.x, y);
      ctx.lineTo(r.x + r.w, y);
    }
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
    // corner brackets
    ctx.lineWidth = 3;
    const L = Math.min(18, r.w / 3, r.h / 3);
    ctx.beginPath();
    for (const [cx, cy, sx, sy] of [[r.x, r.y, 1, 1], [r.x + r.w, r.y, -1, 1], [r.x + r.w, r.y + r.h, -1, -1], [r.x, r.y + r.h, 1, -1]]) {
      ctx.moveTo(cx + sx * L, cy - sy * 1.5);
      ctx.lineTo(cx - sx * 1.5, cy - sy * 1.5);
      ctx.lineTo(cx - sx * 1.5, cy + sy * L);
    }
    ctx.stroke();
    for (const [hx, hy] of HANDLES) if (hx === 0 || hy === 0) drawHandle(ctx, r.x + ((hx + 1) / 2) * r.w, r.y + ((hy + 1) / 2) * r.h, 7);
    if (this.drag && vp.pointer) drawInfoBubble(ctx, vp.pointer.sx + 18, vp.pointer.sy + 18, `宽: ${Math.round(b.w)} 像素\n高: ${Math.round(b.h)} 像素`);
    ctx.restore();
  },
};
