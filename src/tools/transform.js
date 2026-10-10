// Free transform session (scale / rotate / move with handles) and the Move tool.
import { app } from '../core/app.js';
import { createCanvas, cloneCanvas, contentBounds, dist } from '../core/utils.js';
import { makeSelection } from '../core/selection.js';
import { renderTextLayer, textBounds } from '../core/text.js';
import { drawHandle } from './helpers.js';
import { drawInfoBubble } from './select.js';

const ROTATE_CURSOR =
  `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 12a7 7 0 1 1 7 7" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/><path d="M5 12a7 7 0 1 1 7 7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/><path d="M1.5 9.5 5 14l3.5-4.5z" fill="#fff" stroke="#000"/></svg>',
  )}") 12 12, crosshair`;
const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];

const HANDLES = [
  [-1, -1], [0, -1], [1, -1],
  [1, 0], [1, 1], [0, 1],
  [-1, 1], [-1, 0],
];

export class TransformSession {
  /**
   * @param {object} o
   * @param {boolean} o.register  attach as app.transform (interactive free transform)
   * @param {boolean} o.duplicate keep the original pixels in place (Alt+drag)
   */
  constructor(doc, layer, { register = false, duplicate = false, name = '自由变换' } = {}) {
    this.doc = doc;
    this.layer = layer;
    this.name = name;
    this.keepRatio = true;
    const sel = doc.selection;
    const W = doc.width, H = doc.height;

    let float = cloneCanvas(layer.canvas);
    let base = createCanvas(W, H);
    if (sel) {
      const fg = float.getContext('2d');
      fg.globalCompositeOperation = 'destination-in';
      fg.drawImage(sel.mask, 0, 0);
      base = cloneCanvas(layer.canvas);
      if (!duplicate) {
        const bg = base.getContext('2d');
        bg.globalCompositeOperation = 'destination-out';
        bg.drawImage(sel.mask, 0, 0);
      }
    } else if (duplicate) base = cloneCanvas(layer.canvas);

    const b = contentBounds(float);
    if (!b) {
      this.empty = true;
      return;
    }
    this.bounds = b;
    this.w = b.w;
    this.h = b.h;
    this.float = createCanvas(b.w, b.h);
    this.float.getContext('2d').drawImage(float, -b.x, -b.y);
    if (sel) {
      this.mask = createCanvas(b.w, b.h);
      this.mask.getContext('2d').drawImage(sel.mask, -b.x, -b.y);
    }
    this.base = base;
    this.t = { cx: b.x + b.w / 2, cy: b.y + b.h / 2, sx: 1, sy: 1, angle: 0 };
    this.drag = null;

    doc.preview = {
      layerId: layer.id,
      canvas: createCanvas(W, H),
      dirty: true,
      build: (c) => {
        const g = c.getContext('2d');
        g.globalCompositeOperation = 'copy';
        g.drawImage(this.base, 0, 0);
        g.globalCompositeOperation = 'source-over';
        this.drawFloat(g);
      },
    };
    app.viewport.hideSelection = !!sel;
    if (register) {
      app.transform = this;
      app.emit('transform', this);
    }
    app.requestRender();
  }

  get isIdentity() {
    const t = this.t;
    return t.sx === 1 && t.sy === 1 && t.angle === 0 && t.cx === this.bounds.x + this.w / 2 && t.cy === this.bounds.y + this.h / 2;
  }

  /** Keep 90°-multiple rotations and pure moves on whole pixels to stay crisp. */
  snap() {
    const t = this.t;
    const quarter = Math.abs(Math.round(t.angle / (Math.PI / 2)) * (Math.PI / 2) - t.angle) < 1e-9;
    if (!quarter || Math.abs(Math.abs(t.sx) - 1) > 1e-9 || Math.abs(Math.abs(t.sy) - 1) > 1e-9) return;
    const odd = Math.round(t.angle / (Math.PI / 2)) % 2 !== 0;
    const bw = odd ? this.h : this.w;
    const bh = odd ? this.w : this.h;
    t.cx = Math.round(t.cx - bw / 2) + bw / 2;
    t.cy = Math.round(t.cy - bh / 2) + bh / 2;
  }

  applyMatrix(g) {
    const t = this.t;
    g.translate(t.cx, t.cy);
    g.rotate(t.angle);
    g.scale(t.sx, t.sy);
    g.translate(-this.w / 2, -this.h / 2);
  }

  drawFloat(g, src = this.float) {
    g.save();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    this.applyMatrix(g);
    g.drawImage(src, 0, 0);
    g.restore();
  }

  update() {
    if (this.doc.preview) this.doc.preview.dirty = true;
    app.emit('transform-update', this);
    app.requestRender();
  }

  /** Document-space position of a local point (lx,ly relative to the box centre, unscaled). */
  toDoc(lx, ly) {
    const t = this.t;
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    const x = lx * t.sx, y = ly * t.sy;
    return { x: t.cx + x * c - y * s, y: t.cy + x * s + y * c };
  }

  toLocal(x, y) {
    const t = this.t;
    const dx = x - t.cx, dy = y - t.cy;
    const c = Math.cos(t.angle), s = Math.sin(t.angle);
    return { x: (dx * c + dy * s) / t.sx, y: (-dx * s + dy * c) / t.sy };
  }

  corners() {
    const w = this.w / 2, h = this.h / 2;
    return [this.toDoc(-w, -h), this.toDoc(w, -h), this.toDoc(w, h), this.toDoc(-w, h)];
  }

  hit(p, vp) {
    if (!p) return null;
    for (const [hx, hy] of HANDLES) {
      const d = this.toDoc((hx * this.w) / 2, (hy * this.h) / 2);
      const s = vp.docToScreen(d.x, d.y);
      if (dist(s.x, s.y, p.sx, p.sy) <= 7) return { kind: 'scale', hx, hy, s };
    }
    const l = this.toLocal(p.x, p.y);
    if (Math.abs(l.x) <= this.w / 2 && Math.abs(l.y) <= this.h / 2) return { kind: 'move' };
    return { kind: 'rotate' };
  }

  getCursor(p) {
    const vp = app.viewport;
    const h = this.drag || this.hit(p, vp);
    if (!h) return 'default';
    if (h.kind === 'move') return 'move';
    if (h.kind === 'rotate') return ROTATE_CURSOR;
    const c = vp.docToScreen(this.t.cx, this.t.cy);
    const hs = h.s || vp.docToScreen(...Object.values(this.toDoc((h.hx * this.w) / 2, (h.hy * this.h) / 2)));
    let a = (Math.atan2(hs.y - c.y, hs.x - c.x) * 180) / Math.PI;
    a = ((a % 180) + 180) % 180;
    return RESIZE_CURSORS[Math.round(a / 45) % 4];
  }

  onDown(p) {
    const h = this.hit(p, app.viewport);
    this.drag = { ...h, p0: { x: p.x, y: p.y }, t0: { ...this.t } };
  }

  onMove(p) {
    const d = this.drag;
    if (!d) return;
    const t = this.t;
    const t0 = d.t0;
    if (d.kind === 'move') {
      let dx = p.x - d.p0.x, dy = p.y - d.p0.y;
      if (p.shift) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
      t.cx = t0.cx + Math.round(dx);
      t.cy = t0.cy + Math.round(dy);
    } else if (d.kind === 'rotate') {
      const a0 = Math.atan2(d.p0.y - t0.cy, d.p0.x - t0.cx);
      const a1 = Math.atan2(p.y - t0.cy, p.x - t0.cx);
      let a = t0.angle + a1 - a0;
      if (p.shift) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
      t.angle = a;
    } else {
      const { hx, hy } = d;
      const c = Math.cos(t0.angle), s = Math.sin(t0.angle);
      const u = { x: c, y: s }, v = { x: -s, y: c };
      const W0 = this.w * t0.sx, H0 = this.h * t0.sy;
      const fromCenter = p.alt;
      const anchor = fromCenter
        ? { x: t0.cx, y: t0.cy }
        : {
            x: t0.cx - u.x * ((hx * W0) / 2) - v.x * ((hy * H0) / 2),
            y: t0.cy - u.y * ((hx * W0) / 2) - v.y * ((hy * H0) / 2),
          };
      const dx = p.x - anchor.x, dy = p.y - anchor.y;
      const f = fromCenter ? 2 : 1;
      const du = (dx * u.x + dy * u.y) * f;
      const dv = (dx * v.x + dy * v.y) * f;
      let W = hx ? du * hx : W0;
      let H = hy ? dv * hy : H0;
      const proportional = hx && hy && this.keepRatio !== p.shift;
      if (proportional) {
        const k = (du * hx * W0 + dv * hy * H0) / (W0 * W0 + H0 * H0);
        W = W0 * k;
        H = H0 * k;
      }
      if (Math.abs(W) < 1) W = W < 0 ? -1 : 1;
      if (Math.abs(H) < 1) H = H < 0 ? -1 : 1;
      t.sx = W / this.w;
      t.sy = H / this.h;
      if (fromCenter) {
        t.cx = t0.cx;
        t.cy = t0.cy;
      } else {
        t.cx = anchor.x + u.x * ((hx * W) / 2) + v.x * ((hy * H) / 2);
        t.cy = anchor.y + u.y * ((hx * W) / 2) + v.y * ((hy * H) / 2);
      }
    }
    this.update();
  }

  onUp() {
    this.drag = null;
  }

  onDoubleClick(p) {
    if (this.hit(p, app.viewport)?.kind === 'move') this.commit();
  }

  onKey(e) {
    if (e.key === 'Enter') this.commit();
    else if (e.key === 'Escape') this.cancel();
    else return false;
    return true;
  }

  commit(name = this.name) {
    if (this.empty) return;
    const { doc, layer } = this;
    this.snap();
    if (this.isIdentity && !this.forceCommit) return this.cancel();
    const g = layer.edit();
    g.save();
    g.globalCompositeOperation = 'copy';
    g.drawImage(this.base, 0, 0);
    g.restore();
    g.save();
    g.globalCompositeOperation = 'source-over';
    this.drawFloat(g);
    g.restore();
    if (this.mask) {
      const m = createCanvas(doc.width, doc.height);
      this.drawFloat(m.getContext('2d'), this.mask);
      doc.setSelection(makeSelection(m));
    }
    this.finish();
    app.commit(name, 'move');
  }

  cancel() {
    this.finish();
    app.changed();
  }

  finish() {
    this.doc.preview = null;
    this.doc.invalidate();
    app.viewport.hideSelection = false;
    if (app.transform === this) {
      app.transform = null;
      app.emit('transform', null);
    }
    app.requestRender();
  }

  drawOverlay(ctx, vp) {
    const pts = this.corners().map((p) => vp.docToScreen(p.x, p.y));
    ctx.save();
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#2f6fe8';
    ctx.stroke();
    for (const [hx, hy] of HANDLES) {
      const d = this.toDoc((hx * this.w) / 2, (hy * this.h) / 2);
      const s = vp.docToScreen(d.x, d.y);
      drawHandle(ctx, s.x, s.y);
    }
    const c = vp.docToScreen(this.t.cx, this.t.cy);
    ctx.beginPath();
    ctx.arc(c.x, c.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#2f6fe8';
    ctx.stroke();
    if (this.drag && vp.pointer) {
      const t = this.t;
      const label =
        this.drag.kind === 'rotate'
          ? `${((t.angle * 180) / Math.PI).toFixed(1)}°`
          : this.drag.kind === 'move'
            ? `X: ${Math.round(t.cx - this.bounds.x - this.w / 2)}  Y: ${Math.round(t.cy - this.bounds.y - this.h / 2)}`
            : `宽: ${Math.abs(Math.round(this.w * t.sx))} 像素\n高: ${Math.abs(Math.round(this.h * t.sy))} 像素`;
      drawInfoBubble(ctx, vp.pointer.sx + 18, vp.pointer.sy + 18, label);
    }
    ctx.restore();
  }
}

/* ---------------------------------------------------------------- commands */

export async function startFreeTransform() {
  const doc = app.doc;
  if (!doc || app.transform) return;
  const layer = await app.paintableLayer({ action: '自由变换' });
  if (!layer) return;
  const s = new TransformSession(doc, layer, { register: true });
  if (s.empty) app.toast('所选区域为空，没有可变换的像素');
}

/** One-shot transforms: 'rotate90', 'rotate-90', 'rotate180', 'flipH', 'flipV'. */
export async function transformLayer(kind) {
  const doc = app.doc;
  if (!doc) return;
  if (app.transform) {
    const t = app.transform.t;
    applyKind(t, kind);
    app.transform.update();
    return;
  }
  const layer = await app.paintableLayer({ action: '变换' });
  if (!layer) return;
  const s = new TransformSession(doc, layer);
  if (s.empty) return app.toast('没有可变换的像素');
  applyKind(s.t, kind);
  s.commit(LABELS[kind]);
}

const LABELS = { rotate90: '旋转 90 度（顺时针）', 'rotate-90': '旋转 90 度（逆时针）', rotate180: '旋转 180 度', flipH: '水平翻转', flipV: '垂直翻转' };

function applyKind(t, kind) {
  if (kind === 'rotate90') t.angle += Math.PI / 2;
  else if (kind === 'rotate-90') t.angle -= Math.PI / 2;
  else if (kind === 'rotate180') t.angle += Math.PI;
  else if (kind === 'flipH') t.sx *= -1;
  else if (kind === 'flipV') t.sy *= -1;
}

/* --------------------------------------------------------------- move tool */

function layerAt(doc, x, y) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return null;
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const l = doc.layers[i];
    if (!l.visible) continue;
    if (l.canvas.getContext('2d').getImageData(x, y, 1, 1).data[3] > 10) return l;
  }
  return null;
}

export const moveTool = {
  id: 'move',
  name: '移动工具',
  icon: 'move',
  key: 'V',
  cursor: 'move',
  hint: '拖动移动图层或选区内容。Alt+拖动复制，Ctrl+单击 自动选择图层，方向键微移',
  options: { autoSelect: false },
  schema: [
    { type: 'checkbox', key: 'autoSelect', label: '自动选择图层' },
    '|',
    { type: 'button', label: '自由变换', icon: 'scaling', command: 'edit.freeTransform', title: '自由变换 (Ctrl+T)' },
    '|',
    { type: 'iconbutton', icon: 'align-start-vertical', title: '左对齐', run: () => alignLayer('left') },
    { type: 'iconbutton', icon: 'align-center-vertical', title: '水平居中对齐', run: () => alignLayer('hcenter') },
    { type: 'iconbutton', icon: 'align-end-vertical', title: '右对齐', run: () => alignLayer('right') },
    { type: 'iconbutton', icon: 'align-start-horizontal', title: '顶对齐', run: () => alignLayer('top') },
    { type: 'iconbutton', icon: 'align-center-horizontal', title: '垂直居中对齐', run: () => alignLayer('vcenter') },
    { type: 'iconbutton', icon: 'align-end-horizontal', title: '底对齐', run: () => alignLayer('bottom') },
  ],
  drag: null,

  onDown(p) {
    const doc = app.doc;
    if (this.options.autoSelect !== p.ctrl) {
      const hit = layerAt(doc, p.x, p.y);
      if (hit && hit.id !== doc.activeLayerId) {
        doc.activeLayerId = hit.id;
        app.emit('layers');
      }
    }
    const layer = doc.activeLayer;
    if (!layer) return;
    if (layer.locked) return app.toast(`图层“${layer.name}”已锁定`);
    // Type layers always move as a whole (the selection does not apply to them).
    if (layer.isText) {
      this.drag = { text: true, layer, x0: layer.text.x, y0: layer.text.y, start: p, moved: false };
      return;
    }
    const session = new TransformSession(doc, layer, { duplicate: p.alt && !!doc.selection });
    if (session.empty) return app.toast('所选区域为空');
    this.drag = { session, start: p, t0: { ...session.t } };
  },

  onMove(p) {
    const d = this.drag;
    if (!d) return;
    let dx = Math.round(p.x - d.start.x), dy = Math.round(p.y - d.start.y);
    if (p.shift) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
    if (d.text) {
      d.layer.text.x = d.x0 + dx;
      d.layer.text.y = d.y0 + dy;
      d.moved = d.moved || dx !== 0 || dy !== 0;
      renderTextLayer(d.layer);
      app.changed({ layers: false });
      return;
    }
    d.session.t.cx = d.t0.cx + dx;
    d.session.t.cy = d.t0.cy + dy;
    d.dx = dx;
    d.dy = dy;
    d.session.update();
  },

  onUp() {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.text) {
      if (d.moved) app.commit('移动', 'move');
      return;
    }
    if (d.dx || d.dy) d.session.commit('移动');
    else d.session.cancel();
  },

  cancel() {
    if (!this.drag) return false;
    if (this.drag.session) this.drag.session.cancel();
    else {
      this.drag.layer.text.x = this.drag.x0;
      this.drag.layer.text.y = this.drag.y0;
      renderTextLayer(this.drag.layer);
      app.changed();
    }
    this.drag = null;
    return true;
  },

  drawOverlay(ctx, vp) {
    const d = this.drag;
    if (d?.session) {
      const z = vp.zoom;
      if (app.doc.selection) {
        ctx.save();
        ctx.translate((d.dx || 0) * z, (d.dy || 0) * z);
        vp.drawAnts(app.doc.selection.path);
        ctx.restore();
      }
      if (vp.pointer) drawInfoBubble(ctx, vp.pointer.sx + 18, vp.pointer.sy + 18, `ΔX: ${d.dx || 0}\nΔY: ${d.dy || 0}`);
    }
  },
};

export async function nudge(dx, dy) {
  const doc = app.doc;
  const layer = doc?.activeLayer;
  if (!layer) return;
  if (layer.locked) return app.toast(`图层“${layer.name}”已锁定`);
  if (layer.isText) {
    layer.text.x += dx;
    layer.text.y += dy;
    renderTextLayer(layer);
    app.commit('微移', 'move');
    return;
  }
  const l = await app.paintableLayer({ action: '移动' });
  if (!l) return;
  const s = new TransformSession(doc, l);
  if (s.empty) return;
  s.t.cx += dx;
  s.t.cy += dy;
  s.commit('微移');
}

export async function alignLayer(how) {
  const doc = app.doc;
  const layer = doc?.activeLayer;
  if (!layer) return;
  const ref = doc.selection ? doc.selection.bounds : { x: 0, y: 0, w: doc.width, h: doc.height };
  const b = layer.isText ? null : contentBounds(layer.canvas);
  if (layer.isText) {
    const tb = textBounds(layer);
    const [dx, dy] = alignDelta(how, tb, ref);
    layer.text.x += Math.round(dx);
    layer.text.y += Math.round(dy);
    renderTextLayer(layer);
    app.commit('对齐', 'move');
    return;
  }
  if (!b) return;
  const [dx, dy] = alignDelta(how, b, ref);
  if (!Math.round(dx) && !Math.round(dy)) return;
  const saved = doc.selection;
  doc.selection = null; // align moves the whole layer
  const s = new TransformSession(doc, layer);
  doc.selection = saved;
  app.viewport.hideSelection = false;
  s.t.cx += Math.round(dx);
  s.t.cy += Math.round(dy);
  s.commit('对齐');
}

function alignDelta(how, b, ref) {
  switch (how) {
    case 'left': return [ref.x - b.x, 0];
    case 'right': return [ref.x + ref.w - (b.x + b.w), 0];
    case 'hcenter': return [ref.x + ref.w / 2 - (b.x + b.w / 2), 0];
    case 'top': return [0, ref.y - b.y];
    case 'bottom': return [0, ref.y + ref.h - (b.y + b.h)];
    case 'vcenter': return [0, ref.y + ref.h / 2 - (b.y + b.h / 2)];
  }
  return [0, 0];
}
