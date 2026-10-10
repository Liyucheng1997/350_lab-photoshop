// Whole-document and layer-structure operations.
import { app } from './app.js';
import { Layer } from './layer.js';
import { createCanvas, cloneCanvas, contentBounds } from './utils.js';
import { renderTextLayer } from './text.js';
import { compositeLayers, blendOp, renderEffects } from './compositor.js';
import { makeSelection, maskFromLayer, invertSelection, selectAll } from './selection.js';
import { drawClipped } from '../tools/helpers.js';

/* ------------------------------------------------------------- resample */

export function resample(src, w, h, method = 'smooth') {
  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));
  let cur = src;
  if (method !== 'nearest') {
    // step down by halves for good-quality reductions
    while (cur.width / 2 >= w && cur.height / 2 >= h) {
      const half = createCanvas(Math.round(cur.width / 2), Math.round(cur.height / 2));
      const g = half.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(cur, 0, 0, half.width, half.height);
      cur = half;
    }
  }
  const out = createCanvas(w, h);
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = method !== 'nearest';
  g.imageSmoothingQuality = 'high';
  g.drawImage(cur, 0, 0, w, h);
  return out;
}

export function resizeImage(w, h, method) {
  const doc = app.doc;
  const sx = w / doc.width, sy = h / doc.height;
  for (const layer of doc.layers) {
    if (layer.isText) {
      layer.canvas = createCanvas(w, h);
      layer.text.x *= sx;
      layer.text.y *= sy;
      layer.text.size = Math.max(1, layer.text.size * Math.sqrt(sx * sy));
      renderTextLayer(layer);
    } else layer.canvas = resample(layer.canvas, w, h, method);
  }
  doc.width = Math.round(w);
  doc.height = Math.round(h);
  doc.setSelection(null);
  app.commit('图像大小', 'scaling');
  app.viewport.fit();
  app.emit('doc-meta');
}

/** anchor: [ax, ay] each in {0, 0.5, 1}; fill: colour for the extension of a "背景" layer or null. */
export function resizeCanvas(w, h, anchor, fill) {
  const doc = app.doc;
  const dx = Math.round((w - doc.width) * anchor[0]);
  const dy = Math.round((h - doc.height) * anchor[1]);
  doc.layers.forEach((layer, i) => {
    const c = createCanvas(w, h);
    const g = c.getContext('2d');
    if (i === 0 && fill && layer.name === '背景') {
      g.fillStyle = fill;
      g.fillRect(0, 0, w, h);
    }
    if (layer.isText) {
      layer.canvas = c;
      layer.text.x += dx;
      layer.text.y += dy;
      renderTextLayer(layer);
    } else {
      g.drawImage(layer.canvas, dx, dy);
      layer.canvas = c;
    }
  });
  doc.width = Math.round(w);
  doc.height = Math.round(h);
  doc.setSelection(null);
  app.commit('画布大小', 'frame');
  app.viewport.fit();
  app.emit('doc-meta');
}

/** kind: 'cw' | 'ccw' | '180' | 'flipH' | 'flipV' — rotates/flips every layer and the canvas. */
export function rotateCanvas(kind) {
  const doc = app.doc;
  const swap = kind === 'cw' || kind === 'ccw';
  const W = swap ? doc.height : doc.width;
  const H = swap ? doc.width : doc.height;
  for (const layer of doc.layers) {
    const c = createCanvas(W, H);
    const g = c.getContext('2d');
    if (kind === 'cw') g.setTransform(0, 1, -1, 0, W, 0);
    else if (kind === 'ccw') g.setTransform(0, -1, 1, 0, 0, H);
    else if (kind === '180') g.setTransform(-1, 0, 0, -1, W, H);
    else if (kind === 'flipH') g.setTransform(-1, 0, 0, 1, W, 0);
    else if (kind === 'flipV') g.setTransform(1, 0, 0, -1, 0, H);
    g.drawImage(layer.canvas, 0, 0);
    layer.canvas = c;
    if (layer.isText) {
      layer.type = 'raster';
      layer.text = null;
    }
  }
  doc.width = W;
  doc.height = H;
  doc.setSelection(null);
  const names = { cw: '旋转画布 90 度（顺时针）', ccw: '旋转画布 90 度（逆时针）', 180: '旋转画布 180 度', flipH: '水平翻转画布', flipV: '垂直翻转画布' };
  app.commit(names[kind], 'rotate-cw');
  if (swap) app.viewport.fit();
  app.emit('doc-meta');
}

/* --------------------------------------------------------------- layers */

export function newLayer() {
  const doc = app.doc;
  if (!doc) return;
  doc.addLayer(doc.createLayer());
  app.commit('新建图层', 'plus');
}

export function duplicateLayer() {
  const doc = app.doc;
  const layer = doc?.activeLayer;
  if (!layer) return;
  if (doc.selection && !layer.isText) return layerVia(false);
  const copy = layer.duplicate();
  doc.addLayer(copy, doc.indexOf(layer.id) + 1);
  app.commit('复制图层', 'copy');
}

/** Ctrl+J with a selection (layer via copy) / Shift+Ctrl+J (layer via cut). */
export async function layerVia(cut) {
  const doc = app.doc;
  const src = await app.paintableLayer({ action: cut ? '通过剪切的图层' : '通过拷贝的图层' });
  if (!src) return;
  if (!doc.selection) return cut ? null : duplicateLayer();
  const c = cloneCanvas(src.canvas);
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(doc.selection.mask, 0, 0);
  if (!contentBounds(c)) return app.toast('所选区域为空');
  if (cut) {
    const sg = src.edit();
    sg.save();
    sg.globalCompositeOperation = 'destination-out';
    sg.drawImage(doc.selection.mask, 0, 0);
    sg.restore();
  }
  const layer = new Layer({ name: doc.newLayerName(), canvas: c });
  doc.addLayer(layer, doc.indexOf(src.id) + 1);
  app.commit(cut ? '通过剪切的图层' : '通过拷贝的图层', 'copy');
}

export function deleteLayer(id = app.doc?.activeLayerId) {
  const doc = app.doc;
  if (!doc || !id) return;
  if (doc.layers.length <= 1) return app.toast('文档至少需要保留一个图层');
  doc.removeLayer(id);
  app.commit('删除图层', 'trash-2');
}

export function arrangeLayer(how) {
  const doc = app.doc;
  const layer = doc?.activeLayer;
  if (!layer) return;
  const i = doc.indexOf(layer.id);
  const target = { front: doc.layers.length - 1, forward: i + 1, backward: i - 1, back: 0 }[how];
  if (target < 0 || target >= doc.layers.length || target === i) return;
  doc.moveLayer(layer.id, target);
  app.commit('图层顺序', 'layers');
}

function drawLayerInto(g, layer) {
  const src = layer.hasEffects ? renderEffects(layer.canvas, layer.effects) : layer.canvas;
  g.save();
  g.globalAlpha = layer.opacity;
  g.globalCompositeOperation = blendOp(layer.blendMode);
  g.drawImage(src, 0, 0);
  g.restore();
}

export function mergeDown() {
  const doc = app.doc;
  const layer = doc?.activeLayer;
  const i = doc ? doc.indexOf(layer?.id) : -1;
  if (i <= 0) return app.toast('下方没有可合并的图层');
  const below = doc.layers[i - 1];
  if (below.locked) return app.toast(`图层“${below.name}”已锁定`);
  if (layer.visible) {
    // Bake the lower layer's own opacity/effects before drawing the upper one onto it.
    const base = createCanvas(doc.width, doc.height);
    const bg = base.getContext('2d');
    drawLayerInto(bg, { ...below, opacity: below.visible ? below.opacity : 0, blendMode: 'normal', hasEffects: below.hasEffects, effects: below.effects, canvas: below.canvas });
    drawLayerInto(bg, layer);
    below.canvas = base;
    below.opacity = 1;
    below.effects = null;
    below.visible = true;
  }
  if (below.isText) {
    below.type = 'raster';
    below.text = null;
  }
  doc.removeLayer(layer.id);
  doc.activeLayerId = below.id;
  app.commit('向下合并', 'merge');
}

export function mergeVisible() {
  const doc = app.doc;
  if (!doc) return;
  const visible = doc.layers.filter((l) => l.visible);
  if (visible.length < 2) return app.toast('至少需要两个可见图层');
  const c = createCanvas(doc.width, doc.height);
  compositeLayers({ layers: visible }, c, { preview: null });
  const first = visible[0];
  const merged = new Layer({ name: first.name, canvas: c });
  const idx = doc.indexOf(first.id);
  doc.layers = doc.layers.filter((l) => !l.visible);
  doc.layers.splice(Math.min(idx, doc.layers.length), 0, merged);
  doc.activeLayerId = merged.id;
  doc.invalidate();
  app.commit('合并可见图层', 'merge');
}

export function flattenImage() {
  const doc = app.doc;
  if (!doc) return;
  const flat = doc.flatten('#ffffff');
  const layer = new Layer({ name: '背景', canvas: flat });
  doc.layers = [layer];
  doc.activeLayerId = layer.id;
  doc.invalidate();
  app.commit('拼合图像', 'layers');
}

export function rasterizeLayer() {
  const layer = app.doc?.activeLayer;
  if (!layer) return;
  if (layer.isText) {
    layer.type = 'raster';
    layer.text = null;
    app.commit('栅格化文字', 'type');
  } else if (layer.hasEffects) {
    layer.canvas = renderEffects(layer.canvas, layer.effects);
    layer.effects = null;
    app.commit('栅格化图层样式', 'sparkles');
  } else app.toast('该图层无需栅格化');
}

export function setLayerProp(layer, key, value, historyName) {
  layer[key] = value;
  if (historyName) app.commit(historyName);
  else app.changed();
}

/* ------------------------------------------------------------ selection */

export function selectAllCmd() {
  const doc = app.doc;
  doc.setSelection(selectAll(doc.width, doc.height));
  app.commit('全选', 'square-dashed');
}

export function deselect() {
  const doc = app.doc;
  if (!doc?.selection) return;
  doc.setSelection(null);
  app.commit('取消选择', 'square-dashed');
}

export function reselect() {
  const doc = app.doc;
  if (!doc?.lastSelection) return;
  doc.setSelection(doc.lastSelection);
  app.commit('重新选择', 'square-dashed');
}

export function inverseSelection() {
  const doc = app.doc;
  if (!doc) return;
  doc.setSelection(invertSelection(doc.selection, doc.width, doc.height));
  app.commit('选择反向', 'square-dashed');
}

export function selectLayerPixels(layer = app.doc?.activeLayer) {
  const doc = app.doc;
  if (!layer) return;
  const sel = makeSelection(maskFromLayer(layer.canvas));
  if (!sel) return app.toast('该图层没有像素');
  doc.setSelection(sel);
  app.commit('载入选区', 'square-dashed');
}

/* -------------------------------------------------------- pixel editing */

export async function clearSelection() {
  const doc = app.doc;
  if (!doc) return;
  if (!doc.selection) return deleteLayer();
  const layer = await app.paintableLayer({ action: '清除' });
  if (!layer) return;
  const g = layer.edit();
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(doc.selection.mask, 0, 0);
  g.restore();
  app.commit('清除', 'eraser');
}

export async function fillWith(color, { opacity = 1, mode = 'normal', name = '填充' } = {}) {
  const doc = app.doc;
  const layer = await app.paintableLayer({ action: '填充' });
  if (!layer) return;
  const c = createCanvas(doc.width, doc.height);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  layer.edit();
  drawClipped(layer.canvas, c, { opacity, op: blendOp(mode) });
  app.commit(name, 'paint-bucket');
}

export function canvasRegionCopy(src, doc) {
  const sel = doc.selection;
  let c = src;
  if (sel) {
    c = cloneCanvas(src);
    const g = c.getContext('2d');
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(sel.mask, 0, 0);
  }
  const b = contentBounds(c);
  if (!b) return null;
  const out = createCanvas(b.w, b.h);
  out.getContext('2d').drawImage(c, -b.x, -b.y);
  return { canvas: out, x: b.x, y: b.y };
}
