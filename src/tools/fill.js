// Paint bucket and gradient tools.
import { app } from '../core/app.js';
import { createCanvas, hexToRgb } from '../core/utils.js';
import { floodRegion, maskFromBinary } from '../core/selection.js';
import { drawClipped, setPreview, clearPreview, constrain45 } from './helpers.js';

export const paintBucketTool = {
  id: 'bucket',
  name: '油漆桶工具',
  icon: 'paint-bucket',
  key: 'G',
  cursor: 'crosshair',
  hint: '单击以前景色填充颜色相近的区域',
  options: { tolerance: 32, contiguous: true, sampleAll: false, opacity: 100 },
  schema: [
    { type: 'range', key: 'opacity', label: '不透明度', min: 1, max: 100, unit: '%' },
    { type: 'number', key: 'tolerance', label: '容差', min: 0, max: 255 },
    '|',
    { type: 'checkbox', key: 'contiguous', label: '连续的' },
    { type: 'checkbox', key: 'sampleAll', label: '所有图层' },
  ],
  onDown(p) {
    const doc = app.doc;
    if (p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height) return;
    const layer = app.checkPaintable('油漆桶');
    if (!layer) return;
    const src = this.options.sampleAll ? doc.flatten() : layer.canvas;
    const img = src.getContext('2d').getImageData(0, 0, doc.width, doc.height);
    const region = floodRegion(img, p.x, p.y, this.options.tolerance, this.options.contiguous);
    const fill = maskFromBinary(region, doc.width, doc.height);
    const g = fill.getContext('2d');
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = app.fg;
    g.fillRect(0, 0, doc.width, doc.height);
    layer.edit();
    drawClipped(layer.canvas, fill, { opacity: this.options.opacity / 100 });
    app.commit('油漆桶', 'paint-bucket');
  },
};

/* --------------------------------------------------------------- gradient */

const rgba = (hex, a = 1) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

export const GRADIENT_PRESETS = [
  { id: 'fg-bg', name: '前景色到背景色', stops: () => [[0, rgba(app.fg)], [1, rgba(app.bg)]] },
  { id: 'fg-clear', name: '前景色到透明', stops: () => [[0, rgba(app.fg)], [1, rgba(app.fg, 0)]] },
  { id: 'bw', name: '黑，白渐变', stops: () => [[0, '#000'], [1, '#fff']] },
  {
    id: 'rainbow',
    name: '色谱',
    stops: () => ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000'].map((c, i, a) => [i / (a.length - 1), c]),
  },
  { id: 'sunset', name: '日落', stops: () => [[0, '#2b1055'], [0.5, '#d53369'], [1, '#ffcb6b']] },
  { id: 'ocean', name: '海洋', stops: () => [[0, '#0f2027'], [0.5, '#2c5364'], [1, '#6dd5ed']] },
  { id: 'chrome', name: '铬黄', stops: () => [[0, '#2a2a2a'], [0.45, '#f5f5f5'], [0.5, '#5c4a2a'], [0.75, '#d9b96e'], [1, '#fffbe6']] },
];

export function gradientCss(id) {
  const p = GRADIENT_PRESETS.find((x) => x.id === id) || GRADIENT_PRESETS[0];
  const stops = p.stops().map(([t, c]) => `${c} ${Math.round(t * 100)}%`);
  return `linear-gradient(90deg, ${stops.join(', ')}), repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0 / 8px 8px`;
}

function buildGradient(g, type, a, b, stops) {
  const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  let grad;
  if (type === 'radial') grad = g.createRadialGradient(a.x, a.y, 0, a.x, a.y, len);
  else if (type === 'angle') grad = g.createConicGradient(Math.atan2(b.y - a.y, b.x - a.x), a.x, a.y);
  else if (type === 'reflected') {
    grad = g.createLinearGradient(2 * a.x - b.x, 2 * a.y - b.y, b.x, b.y);
    const mirrored = [];
    for (const [t, c] of stops) {
      mirrored.push([0.5 - t / 2, c]);
      mirrored.push([0.5 + t / 2, c]);
    }
    stops = mirrored.sort((x, y) => x[0] - y[0]);
  } else grad = g.createLinearGradient(a.x, a.y, b.x, b.y);
  for (const [t, c] of stops) grad.addColorStop(Math.min(1, Math.max(0, t)), c);
  return grad;
}

export const gradientTool = {
  id: 'gradient',
  name: '渐变工具',
  icon: 'blend',
  key: 'G',
  cursor: 'crosshair',
  hint: '拖动以绘制渐变。按住 Shift 约束为 45° 角',
  options: { preset: 'fg-bg', type: 'linear', opacity: 100, reverse: false },
  schema: [
    { type: 'gradient', key: 'preset' },
    {
      type: 'segmented',
      key: 'type',
      options: [
        ['linear', 'move-right', '线性渐变'],
        ['radial', 'circle-dot', '径向渐变'],
        ['angle', 'loader', '角度渐变'],
        ['reflected', 'move-horizontal', '对称渐变'],
      ],
    },
    '|',
    { type: 'range', key: 'opacity', label: '不透明度', min: 1, max: 100, unit: '%' },
    { type: 'checkbox', key: 'reverse', label: '反向' },
  ],
  drag: null,

  render() {
    const d = this.drag;
    const g = d.grad.getContext('2d');
    const preset = GRADIENT_PRESETS.find((x) => x.id === this.options.preset) || GRADIENT_PRESETS[0];
    let stops = preset.stops();
    if (this.options.reverse) stops = stops.map(([t, c]) => [1 - t, c]).reverse();
    g.clearRect(0, 0, d.grad.width, d.grad.height);
    g.fillStyle = buildGradient(g, this.options.type, d.a, d.b, stops);
    g.fillRect(0, 0, d.grad.width, d.grad.height);
    d.preview.dirty = true;
  },

  onDown(p) {
    const layer = app.checkPaintable('渐变工具');
    if (!layer) return;
    const doc = app.doc;
    const grad = createCanvas(doc.width, doc.height);
    const a = { x: p.x, y: p.y };
    this.drag = { layer, a, b: { ...a }, grad };
    this.drag.preview = setPreview(layer, (c) => drawClipped(c, grad, { opacity: this.options.opacity / 100 }));
    this.render();
  },

  onMove(p) {
    if (!this.drag) return;
    this.drag.b = p.shift ? constrain45(this.drag.a, p) : { x: p.x, y: p.y };
    this.render();
  },

  onUp() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    clearPreview();
    if (Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) < 1) return;
    d.layer.edit();
    drawClipped(d.layer.canvas, d.grad, { opacity: this.options.opacity / 100 });
    app.commit('渐变', 'blend');
  },

  cancel() {
    if (!this.drag) return false;
    this.drag = null;
    clearPreview();
    return true;
  },

  drawOverlay(ctx, vp) {
    if (!this.drag) return;
    const a = vp.docToScreen(this.drag.a.x, this.drag.a.y);
    const b = vp.docToScreen(this.drag.b.x, this.drag.b.y);
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    for (const pt of [a, b]) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.stroke();
    }
    ctx.restore();
  },
};
