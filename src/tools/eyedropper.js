import { app } from '../core/app.js';
import { rgbToHex } from '../core/utils.js';

/** Average colour around (x,y) from the composite or the active layer. */
export function pickColorAt(x, y, { allLayers = true, size = 1 } = {}) {
  const doc = app.doc;
  if (!doc) return null;
  const src = allLayers ? doc.getComposite() : doc.activeLayer?.canvas;
  if (!src) return null;
  const r = Math.floor(size / 2);
  const x0 = Math.floor(x) - r, y0 = Math.floor(y) - r;
  if (Math.floor(x) < 0 || Math.floor(y) < 0 || Math.floor(x) >= doc.width || Math.floor(y) >= doc.height) return null;
  const n = size;
  const data = src.getContext('2d').getImageData(x0, y0, n, n).data;
  let R = 0, G = 0, B = 0, A = 0;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    R += data[i] * a;
    G += data[i + 1] * a;
    B += data[i + 2] * a;
    A += a;
  }
  if (!A) return null;
  return rgbToHex(R / A, G / A, B / A);
}

export const eyedropperTool = {
  id: 'eyedropper',
  name: '吸管工具',
  icon: 'pipette',
  key: 'I',
  cursor: 'crosshair',
  hint: '单击以拾取前景色，按住 Alt 单击拾取背景色',
  options: { size: 1, sampleAll: true },
  schema: [
    { type: 'select', key: 'size', label: '取样大小', options: [[1, '取样点'], [3, '3×3 平均'], [5, '5×5 平均'], [11, '11×11 平均']] },
    { type: 'select', key: 'sampleAll', label: '样本', options: [[true, '所有图层'], [false, '当前图层']] },
  ],
  picking: null,

  pick(p) {
    const c = pickColorAt(p.x, p.y, { allLayers: this.options.sampleAll, size: Number(this.options.size) });
    if (!c) return;
    this.picking.color = c;
    if (this.picking.bg) app.setBg(c);
    else app.setFg(c);
  },

  onDown(p) {
    this.picking = { bg: p.alt, before: p.alt ? app.bg : app.fg, color: null };
    this.pick(p);
  },
  onMove(p) {
    if (this.picking) this.pick(p);
  },
  onUp() {
    if (this.picking?.color) app.pushRecentColor(this.picking.color);
    this.picking = null;
  },

  drawOverlay(ctx, vp) {
    if (!this.picking || !vp.pointer) return;
    const { sx, sy } = vp.pointer;
    const R = 46, w = 14;
    ctx.save();
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(sx, sy, R, Math.PI, 0);
    ctx.strokeStyle = this.picking.color || this.picking.before;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, R, 0, Math.PI);
    ctx.strokeStyle = this.picking.before;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.arc(sx, sy, R + w / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(sx, sy, R - w / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },
};
