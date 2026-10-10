// Shape tools: rectangle, ellipse, polygon/star and line. Each shape is drawn on a new layer.
import { app } from '../core/app.js';
import { dragRect, constrain45 } from './helpers.js';
import { drawInfoBubble } from './select.js';

function resolvePaint(v) {
  if (v === 'none' || !v) return null;
  if (v === 'fg') return app.fg;
  if (v === 'bg') return app.bg;
  return v;
}

function polygonPoints(r, sides, star, inset) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const rx = r.w / 2, ry = r.h / 2;
  const n = Math.max(3, Math.round(sides));
  const pts = [];
  const total = star ? n * 2 : n;
  for (let i = 0; i < total; i++) {
    const a = -Math.PI / 2 + (i / total) * Math.PI * 2;
    const k = star && i % 2 ? 1 - inset / 100 : 1;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return pts;
}

/** Draw a shape into a context set up in document coordinates. */
export function drawShape(g, kind, geom, o) {
  const fill = resolvePaint(o.fill);
  const stroke = resolvePaint(o.stroke);
  const sw = o.strokeWidth || 0;
  g.save();
  g.beginPath();
  if (kind === 'line') {
    const { a, b } = geom;
    const color = fill || stroke || app.fg;
    const w = Math.max(1, o.weight);
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = w;
    g.lineCap = 'round';
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(10, w * 4);
    const end = o.arrow ? { x: b.x - Math.cos(ang) * head * 0.8, y: b.y - Math.sin(ang) * head * 0.8 } : b;
    g.moveTo(a.x, a.y);
    g.lineTo(end.x, end.y);
    g.stroke();
    if (o.arrow) {
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - Math.cos(ang - 0.45) * head, b.y - Math.sin(ang - 0.45) * head);
      g.lineTo(b.x - Math.cos(ang + 0.45) * head, b.y - Math.sin(ang + 0.45) * head);
      g.closePath();
      g.fill();
    }
    g.restore();
    return;
  }
  const r = geom;
  if (kind === 'rect') {
    const rad = Math.min(o.radius || 0, r.w / 2, r.h / 2);
    if (rad > 0) g.roundRect(r.x, r.y, r.w, r.h, rad);
    else g.rect(r.x, r.y, r.w, r.h);
  } else if (kind === 'ellipse') {
    g.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
  } else if (kind === 'polygon') {
    polygonPoints(r, o.sides, o.star, o.inset).forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
  }
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke && sw > 0) {
    g.strokeStyle = stroke;
    g.lineWidth = sw;
    g.lineJoin = 'round';
    g.stroke();
  }
  g.restore();
}

const NAMES = { rect: '矩形', ellipse: '椭圆', polygon: '多边形', line: '直线' };

function makeShapeTool(kind, id, name, icon, extraOpts, extraSchema) {
  const isLine = kind === 'line';
  const tool = {
    id,
    name,
    icon,
    key: 'U',
    cursor: 'crosshair',
    hint: isLine ? '拖动绘制直线，Shift 约束为 45°' : '拖动绘制形状。Shift 约束比例，Alt 从中心绘制',
    options: isLine
      ? { fill: 'fg', weight: 4, arrow: false, ...extraOpts }
      : { fill: 'fg', stroke: 'none', strokeWidth: 3, ...extraOpts },
    schema: isLine
      ? [{ type: 'paint', key: 'fill', label: '颜色' }, { type: 'number', key: 'weight', label: '粗细', min: 1, max: 200, unit: '像素' }, { type: 'checkbox', key: 'arrow', label: '箭头' }]
      : [
          { type: 'paint', key: 'fill', label: '填充' },
          { type: 'paint', key: 'stroke', label: '描边' },
          { type: 'number', key: 'strokeWidth', label: '', min: 0, max: 200, unit: '像素', title: '描边宽度' },
          ...(extraSchema.length ? ['|', ...extraSchema] : []),
        ],
    drag: null,

    geom() {
      const d = this.drag;
      const p = d.cur;
      if (isLine) return { a: d.start, b: p.shift ? constrain45(d.start, p) : { x: p.x, y: p.y } };
      return dragRect(d.start, p, { square: p.shift, fromCenter: p.alt });
    },

    onDown(p) {
      this.drag = { start: { x: p.x, y: p.y }, cur: p };
    },
    onMove(p) {
      if (this.drag) this.drag.cur = p;
    },
    onUp() {
      const d = this.drag;
      if (!d) return;
      const geom = this.geom();
      this.drag = null;
      const size = isLine ? Math.hypot(geom.b.x - geom.a.x, geom.b.y - geom.a.y) : Math.min(geom.w, geom.h);
      if (size < 1) return;
      const doc = app.doc;
      const layer = doc.createLayer({ name: `${NAMES[kind]} ${doc.counters.shape++}` });
      drawShape(layer.edit(), kind, geom, this.options);
      doc.addLayer(layer);
      app.commit(`${NAMES[kind]}工具`, icon);
    },
    cancel() {
      if (!this.drag) return false;
      this.drag = null;
      return true;
    },
    drawOverlay(ctx, vp) {
      if (!this.drag) return;
      const v = app.doc.view;
      const geom = this.geom();
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.scale(v.zoom, v.zoom);
      drawShape(ctx, kind, geom, this.options);
      ctx.restore();
      if (vp.pointer) {
        const label = isLine
          ? `长度: ${Math.round(Math.hypot(geom.b.x - geom.a.x, geom.b.y - geom.a.y))} 像素`
          : `宽: ${Math.round(geom.w)} 像素\n高: ${Math.round(geom.h)} 像素`;
        drawInfoBubble(ctx, vp.pointer.sx + 18, vp.pointer.sy + 18, label);
      }
    },
  };
  return tool;
}

export const rectShapeTool = makeShapeTool('rect', 'shape-rect', '矩形工具', 'square', { radius: 0 }, [
  { type: 'number', key: 'radius', label: '圆角', min: 0, max: 1000, unit: '像素', icon: 'square-round-corner' },
]);
export const ellipseShapeTool = makeShapeTool('ellipse', 'shape-ellipse', '椭圆工具', 'circle', {}, []);
export const polygonShapeTool = makeShapeTool('polygon', 'shape-polygon', '多边形工具', 'pentagon', { sides: 5, star: false, inset: 50 }, [
  { type: 'number', key: 'sides', label: '边', min: 3, max: 64 },
  { type: 'checkbox', key: 'star', label: '星形' },
  { type: 'number', key: 'inset', label: '缩进', min: 1, max: 99, unit: '%' },
]);
export const lineShapeTool = makeShapeTool('line', 'shape-line', '直线工具', 'slash', {}, []);
