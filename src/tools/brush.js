// Painting tools: brush, pencil, eraser and clone stamp share one dab-based engine.
// Dabs accumulate in a stroke buffer which is composited onto the layer with the
// tool opacity, so overlapping dabs inside one stroke never exceed it (like PS).
import { app } from '../core/app.js';
import { createCanvas, hexToRgb, clamp, dist } from '../core/utils.js';
import { setPreview, clearPreview, drawClipped, drawBrushCursor } from './helpers.js';
import { pickColorAt } from './eyedropper.js';

function makeTip(size, hardness, color, aliased) {
  const d = Math.max(1, Math.ceil(size));
  const c = createCanvas(d, d);
  const g = c.getContext('2d');
  const { r, g: gg, b } = hexToRgb(color);
  if (aliased) {
    const img = g.createImageData(d, d);
    const rad = size / 2;
    for (let y = 0; y < d; y++) {
      for (let x = 0; x < d; x++) {
        const dx = x + 0.5 - d / 2, dy = y + 0.5 - d / 2;
        if (d <= 2 || dx * dx + dy * dy <= rad * rad + 0.25) {
          const j = (y * d + x) * 4;
          img.data[j] = r;
          img.data[j + 1] = gg;
          img.data[j + 2] = b;
          img.data[j + 3] = 255;
        }
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  const rad = size / 2;
  const grad = g.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, rad);
  const col = (a) => `rgba(${r},${gg},${b},${a})`;
  const h = clamp(hardness, 0, 0.98);
  grad.addColorStop(0, col(1));
  grad.addColorStop(h, col(1));
  if (h < 0.5) grad.addColorStop(h + (1 - h) * 0.5, col(0.35));
  grad.addColorStop(1, col(0));
  g.fillStyle = grad;
  g.beginPath();
  g.arc(d / 2, d / 2, rad, 0, Math.PI * 2);
  g.fill();
  return c;
}

function makePaintTool(cfg) {
  const tool = {
    ...cfg,
    cursor: 'crosshair',
    wantsCoalesced: true,
    stroke: null,
    lastPoint: null,
    cloneSource: null,
    cloneOffset: null,
    _tip: null,
    _tipKey: '',

    get aliased() {
      return cfg.id === 'pencil' || (cfg.id === 'eraser' && this.options.mode === 'pencil');
    },

    tip() {
      const o = this.options;
      const color = cfg.id === 'brush' || cfg.id === 'pencil' ? app.fg : '#000000';
      const hardness = this.aliased ? 1 : (o.hardness ?? 100) / 100;
      const key = `${o.size}|${hardness}|${color}|${this.aliased}`;
      if (key !== this._tipKey) {
        this._tip = makeTip(o.size, hardness, color, this.aliased);
        this._tipKey = key;
      }
      return this._tip;
    },

    get op() {
      return cfg.id === 'eraser' ? 'destination-out' : 'source-over';
    },

    dab(x, y, pressure) {
      const s = this.stroke;
      const o = this.options;
      const tip = this.tip();
      let size = o.size;
      if (o.pressure !== false && pressure < 1) size = Math.max(1, size * pressure);
      const g = s.ctx;
      g.globalAlpha = (o.flow ?? 100) / 100;
      if (this.aliased) {
        const d = Math.max(1, Math.round(size));
        g.drawImage(tip, Math.floor(x - d / 2 + 0.5), Math.floor(y - d / 2 + 0.5), d, d);
        return;
      }
      if (cfg.id === 'clone') {
        const d = Math.max(1, Math.ceil(size));
        const t = s.dabCanvas;
        const tg = t.getContext('2d');
        tg.globalCompositeOperation = 'copy';
        tg.drawImage(tip, 0, 0, d, d);
        tg.globalCompositeOperation = 'source-in';
        const sx = x + this.cloneOffset.dx - d / 2;
        const sy = y + this.cloneOffset.dy - d / 2;
        tg.drawImage(s.source, sx, sy, d, d, 0, 0, d, d);
        g.drawImage(t, 0, 0, d, d, x - d / 2, y - d / 2, d, d);
        return;
      }
      g.drawImage(tip, x - size / 2, y - size / 2, size, size);
    },

    lineTo(p) {
      const s = this.stroke;
      const o = this.options;
      const spacing = this.aliased ? 1 : Math.max(1, o.size * 0.18);
      const from = s.last;
      const len = dist(from.x, from.y, p.x, p.y);
      let t = s.residual;
      while (t <= len) {
        const k = len ? t / len : 0;
        const pr = from.pressure + (p.pressure - from.pressure) * k;
        this.dab(from.x + (p.x - from.x) * k, from.y + (p.y - from.y) * k, pr);
        t += spacing;
      }
      s.residual = t - len;
      s.last = { x: p.x, y: p.y, pressure: p.pressure };
      s.preview.dirty = true;
    },

    onDown(p) {
      const doc = app.doc;
      if (p.alt && (cfg.id === 'brush' || cfg.id === 'pencil')) {
        const c = pickColorAt(p.x, p.y, { allLayers: true });
        if (c) app.setFg(c);
        this.pickingColor = true;
        return;
      }
      if (cfg.id === 'clone' && p.alt) {
        this.cloneSource = { x: p.x, y: p.y };
        this.cloneOffset = null;
        app.toast('已设置仿制源');
        return;
      }
      if (cfg.id === 'clone' && !this.cloneSource) {
        app.toast('请先按住 Alt 键单击以定义仿制源');
        return;
      }
      const layer = app.checkPaintable(cfg.name);
      if (!layer) return;
      const canvas = createCanvas(doc.width, doc.height);
      this.stroke = { layer, canvas, ctx: canvas.getContext('2d'), last: null, residual: 0 };
      if (cfg.id === 'clone') {
        if (!this.options.aligned || !this.cloneOffset) {
          this.cloneOffset = { dx: this.cloneSource.x - p.x, dy: this.cloneSource.y - p.y };
        }
        this.stroke.source = this.options.sampleAll ? doc.flatten() : layer.canvas;
        this.stroke.dabCanvas = createCanvas(Math.ceil(this.options.size) + 2, Math.ceil(this.options.size) + 2);
      }
      const opacity = this.options.opacity / 100;
      this.stroke.preview = setPreview(layer, (c) => drawClipped(c, canvas, { opacity, op: this.op }));
      const start = p.shift && this.lastPoint ? this.lastPoint : p;
      this.stroke.last = { x: start.x, y: start.y, pressure: p.pressure };
      if (start === p) {
        this.dab(p.x, p.y, p.pressure);
        this.stroke.residual = Math.max(1, this.options.size * 0.18);
        this.stroke.preview.dirty = true;
      } else this.lineTo(p);
    },

    onMove(p) {
      if (this.pickingColor) {
        const c = pickColorAt(p.x, p.y, { allLayers: true });
        if (c) app.setFg(c);
        return;
      }
      if (!this.stroke) return;
      this.lineTo(p);
    },

    onUp() {
      if (this.pickingColor) {
        this.pickingColor = false;
        app.pushRecentColor(app.fg);
        return;
      }
      const s = this.stroke;
      if (!s) return;
      this.stroke = null;
      this.lastPoint = { ...s.last };
      s.layer.edit();
      drawClipped(s.layer.canvas, s.canvas, { opacity: this.options.opacity / 100, op: this.op });
      clearPreview();
      app.commit(cfg.name, cfg.icon);
    },

    cancel() {
      if (!this.stroke) return false;
      this.stroke = null;
      clearPreview();
      return true;
    },

    drawOverlay(ctx, vp) {
      drawBrushCursor(ctx, vp, this.options.size);
      if (cfg.id === 'clone' && vp.pointer && this.cloneSource) {
        let src = this.cloneSource;
        if (this.cloneOffset && (this.stroke || this.options.aligned)) {
          src = { x: vp.pointer.x + this.cloneOffset.dx, y: vp.pointer.y + this.cloneOffset.dy };
        }
        const s = vp.docToScreen(src.x, src.y);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(s.x, s.y, (this.options.size / 2) * vp.zoom, 0, Math.PI * 2);
        ctx.moveTo(s.x - 6, s.y);
        ctx.lineTo(s.x + 6, s.y);
        ctx.moveTo(s.x, s.y - 6);
        ctx.lineTo(s.x, s.y + 6);
        ctx.setLineDash([3, 3]);
        ctx.stroke();
      }
    },
  };
  return tool;
}

const sizeOpt = { type: 'range', key: 'size', label: '大小', min: 1, max: 1000, unit: 'px', curve: true };
const hardOpt = { type: 'range', key: 'hardness', label: '硬度', min: 0, max: 100, unit: '%' };
const opacityOpt = { type: 'range', key: 'opacity', label: '不透明度', min: 1, max: 100, unit: '%' };
const flowOpt = { type: 'range', key: 'flow', label: '流量', min: 1, max: 100, unit: '%' };
const pressureOpt = { type: 'toggle', key: 'pressure', icon: 'pen-tool', title: '使用压力控制大小（数位笔）' };

export const brushTool = makePaintTool({
  id: 'brush',
  name: '画笔工具',
  icon: 'brush',
  key: 'B',
  hint: '拖动以绘画。按住 Shift 绘制直线，Alt 临时吸取颜色，[ ] 调整大小',
  options: { size: 20, hardness: 80, opacity: 100, flow: 100, pressure: true },
  schema: [sizeOpt, hardOpt, '|', opacityOpt, flowOpt, pressureOpt],
});

export const pencilTool = makePaintTool({
  id: 'pencil',
  name: '铅笔工具',
  icon: 'pencil',
  key: 'B',
  hint: '绘制硬边像素线条。按住 Shift 绘制直线',
  options: { size: 1, opacity: 100, pressure: false },
  schema: [{ ...sizeOpt, max: 200 }, '|', opacityOpt],
});

export const eraserTool = makePaintTool({
  id: 'eraser',
  name: '橡皮擦工具',
  icon: 'eraser',
  key: 'E',
  hint: '将像素擦除为透明。按住 Shift 擦除直线',
  options: { size: 40, hardness: 60, opacity: 100, flow: 100, mode: 'brush', pressure: true },
  schema: [
    { type: 'select', key: 'mode', label: '模式', options: [['brush', '画笔'], ['pencil', '铅笔']] },
    sizeOpt, hardOpt, '|', opacityOpt, flowOpt,
  ],
});

export const cloneTool = makePaintTool({
  id: 'clone',
  name: '仿制图章工具',
  icon: 'stamp',
  key: 'S',
  hint: '按住 Alt 单击设置仿制源，然后在目标处涂抹',
  options: { size: 40, hardness: 50, opacity: 100, flow: 100, aligned: true, sampleAll: false, pressure: true },
  schema: [
    sizeOpt, hardOpt, '|', opacityOpt, flowOpt, '|',
    { type: 'checkbox', key: 'aligned', label: '对齐' },
    { type: 'checkbox', key: 'sampleAll', label: '对所有图层取样' },
  ],
});
