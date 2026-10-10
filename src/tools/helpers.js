// Shared helpers for tools.
import { app } from '../core/app.js';
import { createCanvas, cloneCanvas } from '../core/utils.js';
import { combineSelection, featherMask } from '../core/selection.js';

/** Selection mode from modifier keys (PS: Shift=add, Alt=subtract, both=intersect). */
export function selectionMode(p, fallback = 'new') {
  if (p.shift && p.alt) return 'intersect';
  if (p.shift) return 'add';
  if (p.alt) return 'subtract';
  return fallback;
}

export const MODE_LABEL = { new: '新选区', add: '添加到选区', subtract: '从选区减去', intersect: '与选区交叉' };

/** Commit a mask produced by a selection tool. */
export function applySelectionMask(mask, mode, feather, historyName) {
  const doc = app.doc;
  if (feather > 0) mask = featherMask(mask, feather);
  const sel = combineSelection(doc.selection, mask, mode);
  doc.setSelection(sel);
  app.commit(sel ? historyName : '取消选择');
}

/** `src` clipped to the active selection (returns src itself when there is none). */
export function clipToSelection(src, doc = app.doc) {
  if (!doc.selection) return src;
  const c = cloneCanvas(src);
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(doc.selection.mask, 0, 0);
  return c;
}

/**
 * Draws `src` (document-sized) onto `target` honouring the selection, opacity and
 * composite operation. Uses a reusable scratch canvas to avoid allocations
 * while previewing.
 */
let scratch = null;
export function drawClipped(target, src, { opacity = 1, op = 'source-over', doc = app.doc } = {}) {
  const g = target.getContext('2d');
  let s = src;
  if (doc.selection) {
    if (!scratch || scratch.width !== src.width || scratch.height !== src.height) scratch = createCanvas(src.width, src.height);
    const sg = scratch.getContext('2d');
    sg.globalCompositeOperation = 'copy';
    sg.drawImage(src, 0, 0);
    sg.globalCompositeOperation = 'destination-in';
    sg.drawImage(doc.selection.mask, 0, 0);
    sg.globalCompositeOperation = 'source-over';
    s = scratch;
  }
  g.save();
  g.globalAlpha = opacity;
  g.globalCompositeOperation = op;
  g.drawImage(s, 0, 0);
  g.restore();
}

/** Install a live preview for `layer`: build(canvas) draws what the layer would look like. */
export function setPreview(layer, build) {
  const doc = app.doc;
  const canvas = doc.preview?.layerId === layer.id ? doc.preview.canvas : createCanvas(doc.width, doc.height);
  doc.preview = {
    layerId: layer.id,
    canvas,
    dirty: true,
    build: (c) => {
      const g = c.getContext('2d');
      g.globalCompositeOperation = 'copy';
      g.globalAlpha = 1;
      g.drawImage(layer.canvas, 0, 0);
      g.globalCompositeOperation = 'source-over';
      build(c);
    },
  };
  app.requestRender();
  return doc.preview;
}

export function clearPreview() {
  const doc = app.doc;
  if (doc?.preview) {
    doc.preview = null;
    doc.invalidate();
    app.requestRender();
  }
}

/* ------------------------------------------------------------- overlays */

export function screenRect(vp, r) {
  const a = vp.docToScreen(r.x, r.y);
  const b = vp.docToScreen(r.x + r.w, r.y + r.h);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

export function dashedPath(ctx, drawPath, phase = 0) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = -phase;
  ctx.strokeStyle = '#fff';
  drawPath();
  ctx.stroke();
  ctx.lineDashOffset = -phase - 4;
  ctx.strokeStyle = '#000';
  ctx.stroke();
  ctx.restore();
}

export function drawHandle(ctx, x, y, size = 8) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#2f6fe8';
  ctx.lineWidth = 1;
  ctx.fillRect(Math.round(x - size / 2) + 0.5, Math.round(y - size / 2) + 0.5, size - 1, size - 1);
  ctx.strokeRect(Math.round(x - size / 2) + 0.5, Math.round(y - size / 2) + 0.5, size - 1, size - 1);
}

export function drawBrushCursor(ctx, vp, size) {
  const p = vp.pointer;
  if (!p || vp.space) return;
  const r = (size / 2) * vp.zoom;
  ctx.save();
  if (r >= 3) {
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, Math.max(0.5, r - 1), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
  }
  // tiny crosshair at the hot spot
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.moveTo(p.sx - 4, p.sy + 0.5);
  ctx.lineTo(p.sx + 5, p.sy + 0.5);
  ctx.moveTo(p.sx + 0.5, p.sy - 4);
  ctx.lineTo(p.sx + 0.5, p.sy + 5);
  ctx.stroke();
  ctx.restore();
}

/** Normalised rect from two points with optional square constraint / centre anchoring. */
export function dragRect(a, b, { square = false, fromCenter = false } = {}) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * m;
    dy = Math.sign(dy || 1) * m;
  }
  if (fromCenter) return { x: a.x - Math.abs(dx), y: a.y - Math.abs(dy), w: Math.abs(dx) * 2, h: Math.abs(dy) * 2 };
  return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), w: Math.abs(dx), h: Math.abs(dy) };
}

/** Snap angle to 45° increments for Shift-constrained lines. */
export function constrain45(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}

export function sampleSource(allLayers) {
  const doc = app.doc;
  return allLayers ? doc.flatten() : doc.activeLayer?.canvas || doc.flatten();
}
