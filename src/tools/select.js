// Selection tools: rectangular/elliptical marquee, lasso, polygonal lasso, magic wand.
import { app } from '../core/app.js';
import { rectMask, ellipseMask, polygonMask, maskFromBinary, translateMask, floodRegion, makeSelection } from '../core/selection.js';
import { selectionMode, applySelectionMask, dragRect, screenRect, dashedPath, constrain45 } from './helpers.js';
import { dist } from '../core/utils.js';

const modeOpt = { type: 'selmode', key: 'mode' };
const featherOpt = { type: 'number', key: 'feather', label: '羽化', min: 0, max: 250, unit: '像素' };

function insideSelection(p) {
  const sel = app.doc?.selection;
  return !!sel && sel.alphaAt(p.x, p.y) >= 128;
}

/** Shared "drag inside an existing selection to move its outline" behaviour. */
const moveOutline = {
  start(tool, p) {
    tool.drag = { moveSel: true, start: p, dx: 0, dy: 0 };
    app.viewport.hideSelection = true;
  },
  move(tool, p) {
    let dx = Math.round(p.x - tool.drag.start.x);
    let dy = Math.round(p.y - tool.drag.start.y);
    if (p.shift) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
    tool.drag.dx = dx;
    tool.drag.dy = dy;
  },
  end(tool) {
    const { dx, dy } = tool.drag;
    app.viewport.hideSelection = false;
    tool.drag = null;
    if (!dx && !dy) return;
    const doc = app.doc;
    doc.setSelection(makeSelection(translateMask(doc.selection.mask, dx, dy)));
    app.commit('移动选区');
  },
  draw(tool, ctx, vp) {
    const z = vp.zoom;
    ctx.save();
    ctx.translate(tool.drag.dx * z, tool.drag.dy * z);
    vp.drawAnts(app.doc.selection.path);
    ctx.restore();
  },
};

function makeMarquee(id, name, icon, shape) {
  return {
    id,
    name,
    icon,
    key: 'M',
    cursor: 'crosshair',
    hint: '拖动创建选区。Shift 添加 / Alt 减去；拖动时按 Shift 约束比例、Alt 从中心绘制',
    options: { mode: 'new', feather: 0 },
    schema: [modeOpt, '|', featherOpt],
    drag: null,

    getCursor(p) {
      if (p && !this.drag && this.options.mode === 'new' && !p.shift && !p.alt && insideSelection(p)) return 'move';
      return 'crosshair';
    },

    onDown(p) {
      const mode = selectionMode(p, this.options.mode);
      if (mode === 'new' && insideSelection(p)) return moveOutline.start(this, p);
      this.drag = { start: { x: p.x, y: p.y }, cur: p, mode, shiftAtDown: p.shift, altAtDown: p.alt };
    },

    onMove(p) {
      if (!this.drag) return;
      if (this.drag.moveSel) return moveOutline.move(this, p);
      this.drag.cur = p;
    },

    rect() {
      const d = this.drag;
      const p = d.cur;
      const r = dragRect(d.start, p, { square: p.shift && !d.shiftAtDown, fromCenter: p.alt && !d.altAtDown });
      const x = Math.round(r.x), y = Math.round(r.y);
      return { x, y, w: Math.round(r.x + r.w) - x, h: Math.round(r.y + r.h) - y };
    },

    onUp() {
      if (!this.drag) return;
      if (this.drag.moveSel) return moveOutline.end(this);
      const r = this.rect();
      const mode = this.drag.mode;
      this.drag = null;
      const doc = app.doc;
      if (r.w < 1 || r.h < 1) {
        if (mode === 'new' && doc.selection) {
          doc.setSelection(null);
          app.commit('取消选择');
        }
        return;
      }
      const mask = shape === 'rect' ? rectMask(doc.width, doc.height, r) : ellipseMask(doc.width, doc.height, r);
      applySelectionMask(mask, mode, this.options.feather, name.replace('工具', ''));
    },

    cancel() {
      if (!this.drag) return false;
      app.viewport.hideSelection = false;
      this.drag = null;
      return true;
    },

    drawOverlay(ctx, vp) {
      if (!this.drag) return;
      if (this.drag.moveSel) return moveOutline.draw(this, ctx, vp);
      const r = screenRect(vp, this.rect());
      dashedPath(ctx, () => {
        ctx.beginPath();
        if (shape === 'rect') ctx.rect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
        else ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      }, vp.antsPhase);
      const label = `宽: ${this.rect().w} 像素\n高: ${this.rect().h} 像素`;
      drawInfoBubble(ctx, vp.pointer.sx + 16, vp.pointer.sy + 16, label);
    },
  };
}

export function drawInfoBubble(ctx, x, y, text) {
  const lines = text.split('\n');
  ctx.save();
  ctx.font = '11px "Segoe UI", "Microsoft YaHei", sans-serif';
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14;
  const h = lines.length * 15 + 8;
  ctx.fillStyle = 'rgba(30,31,34,0.92)';
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e8e9eb';
  lines.forEach((l, i) => ctx.fillText(l, x + 7, y + 15 + i * 15));
  ctx.restore();
}

export const rectMarqueeTool = makeMarquee('marquee-rect', '矩形选框工具', 'square-dashed', 'rect');
export const ellipseMarqueeTool = makeMarquee('marquee-ellipse', '椭圆选框工具', 'circle-dashed', 'ellipse');

/* ------------------------------------------------------------------ lasso */

export const lassoTool = {
  id: 'lasso',
  name: '套索工具',
  icon: 'lasso',
  key: 'L',
  cursor: 'crosshair',
  hint: '拖动绘制手绘选区。Shift 添加 / Alt 减去',
  options: { mode: 'new', feather: 0 },
  schema: [modeOpt, '|', featherOpt],
  drag: null,

  getCursor(p) {
    if (p && !this.drag && this.options.mode === 'new' && !p.shift && !p.alt && insideSelection(p)) return 'move';
    return 'crosshair';
  },
  onDown(p) {
    const mode = selectionMode(p, this.options.mode);
    if (mode === 'new' && insideSelection(p)) return moveOutline.start(this, p);
    this.drag = { mode, pts: [{ x: p.x, y: p.y }] };
  },
  onMove(p) {
    if (!this.drag) return;
    if (this.drag.moveSel) return moveOutline.move(this, p);
    const last = this.drag.pts[this.drag.pts.length - 1];
    if (dist(last.x, last.y, p.x, p.y) * app.viewport.zoom >= 2) this.drag.pts.push({ x: p.x, y: p.y });
  },
  onUp() {
    if (!this.drag) return;
    if (this.drag.moveSel) return moveOutline.end(this);
    const { pts, mode } = this.drag;
    this.drag = null;
    const doc = app.doc;
    if (pts.length < 3) {
      if (mode === 'new' && doc.selection) {
        doc.setSelection(null);
        app.commit('取消选择');
      }
      return;
    }
    applySelectionMask(polygonMask(doc.width, doc.height, pts), mode, this.options.feather, '套索');
  },
  cancel() {
    if (!this.drag) return false;
    app.viewport.hideSelection = false;
    this.drag = null;
    return true;
  },
  drawOverlay(ctx, vp) {
    if (!this.drag) return;
    if (this.drag.moveSel) return moveOutline.draw(this, ctx, vp);
    dashedPath(ctx, () => {
      ctx.beginPath();
      this.drag.pts.forEach((pt, i) => {
        const s = vp.docToScreen(pt.x, pt.y);
        i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
      });
    }, vp.antsPhase);
  },
};

export const polyLassoTool = {
  id: 'poly-lasso',
  name: '多边形套索工具',
  icon: 'lasso-select',
  key: 'L',
  cursor: 'crosshair',
  hint: '单击添加锚点，双击或单击起点闭合；Enter 完成，Esc 取消，Backspace 删除上一点',
  options: { mode: 'new', feather: 0 },
  schema: [modeOpt, '|', featherOpt],
  state: null,

  get animated() {
    return !!this.state;
  },
  onDown(p) {
    const vp = app.viewport;
    if (!this.state) {
      this.state = { mode: selectionMode(p, this.options.mode), pts: [{ x: p.x, y: p.y }] };
      return;
    }
    const pts = this.state.pts;
    const first = vp.docToScreen(pts[0].x, pts[0].y);
    if (pts.length >= 3 && dist(first.x, first.y, p.sx, p.sy) < 8) return this.finish();
    const last = pts[pts.length - 1];
    pts.push(p.shift ? constrain45(last, p) : { x: p.x, y: p.y });
  },
  onDoubleClick() {
    this.finish();
  },
  finish() {
    if (!this.state) return;
    const { pts, mode } = this.state;
    this.state = null;
    // dblclick adds duplicate points; drop consecutive duplicates
    const clean = pts.filter((p, i) => !i || dist(p.x, p.y, pts[i - 1].x, pts[i - 1].y) > 0.5);
    if (clean.length < 3) return app.requestRender();
    const doc = app.doc;
    applySelectionMask(polygonMask(doc.width, doc.height, clean), mode, this.options.feather, '多边形套索');
  },
  onKey(e) {
    if (!this.state) return false;
    if (e.key === 'Enter') this.finish();
    else if (e.key === 'Escape') this.state = null;
    else if (e.key === 'Backspace' || e.key === 'Delete') {
      this.state.pts.pop();
      if (!this.state.pts.length) this.state = null;
    } else return false;
    app.requestRender();
    return true;
  },
  cancel() {
    if (!this.state) return false;
    this.state = null;
    return true;
  },
  deactivate() {
    this.state = null;
  },
  drawOverlay(ctx, vp) {
    if (!this.state) return;
    const pts = this.state.pts;
    const p = vp.pointer;
    dashedPath(ctx, () => {
      ctx.beginPath();
      pts.forEach((pt, i) => {
        const s = vp.docToScreen(pt.x, pt.y);
        i ? ctx.lineTo(s.x, s.y) : ctx.moveTo(s.x, s.y);
      });
      if (p) {
        const t = p.shift ? vp.docToScreen(...Object.values(constrain45(pts[pts.length - 1], p))) : { x: p.sx, y: p.sy };
        ctx.lineTo(t.x, t.y);
      }
    }, vp.antsPhase);
    const f = vp.docToScreen(pts[0].x, pts[0].y);
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = p && pts.length >= 3 && dist(f.x, f.y, p.sx, p.sy) < 8 ? '#4f8cff' : '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.stroke();
  },
};

/* ------------------------------------------------------------- magic wand */

export const magicWandTool = {
  id: 'wand',
  name: '魔棒工具',
  icon: 'wand-sparkles',
  key: 'W',
  cursor: 'crosshair',
  hint: '单击选择颜色相近的区域。Shift 添加 / Alt 减去',
  options: { mode: 'new', tolerance: 32, contiguous: true, sampleAll: false },
  schema: [
    modeOpt, '|',
    { type: 'number', key: 'tolerance', label: '容差', min: 0, max: 255 },
    { type: 'checkbox', key: 'contiguous', label: '连续' },
    { type: 'checkbox', key: 'sampleAll', label: '对所有图层取样' },
  ],
  onDown(p) {
    const doc = app.doc;
    if (p.x < 0 || p.y < 0 || p.x >= doc.width || p.y >= doc.height) return;
    const src = this.options.sampleAll ? doc.flatten() : doc.activeLayer.canvas;
    const img = src.getContext('2d').getImageData(0, 0, doc.width, doc.height);
    const region = floodRegion(img, p.x, p.y, this.options.tolerance, this.options.contiguous);
    applySelectionMask(maskFromBinary(region, doc.width, doc.height), selectionMode(p, this.options.mode), 0, '魔棒');
  },
};
