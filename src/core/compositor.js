// Flattens a document's layers (blend modes, opacity, layer styles) into one canvas.
import { createCanvas } from './utils.js';

export const BLEND_MODES = [
  ['normal', '正常', 'source-over'],
  null,
  ['darken', '变暗', 'darken'],
  ['multiply', '正片叠底', 'multiply'],
  ['color-burn', '颜色加深', 'color-burn'],
  null,
  ['lighten', '变亮', 'lighten'],
  ['screen', '滤色', 'screen'],
  ['color-dodge', '颜色减淡', 'color-dodge'],
  ['lighter', '线性减淡（添加）', 'lighter'],
  null,
  ['overlay', '叠加', 'overlay'],
  ['soft-light', '柔光', 'soft-light'],
  ['hard-light', '强光', 'hard-light'],
  null,
  ['difference', '差值', 'difference'],
  ['exclusion', '排除', 'exclusion'],
  null,
  ['hue', '色相', 'hue'],
  ['saturation', '饱和度', 'saturation'],
  ['color', '颜色', 'color'],
  ['luminosity', '明度', 'luminosity'],
];

const OP = Object.fromEntries(BLEND_MODES.filter(Boolean).map(([k, , op]) => [k, op]));
export const blendOp = (mode) => OP[mode] || 'source-over';
export const blendLabel = (mode) => BLEND_MODES.find((m) => m && m[0] === mode)?.[1] || '正常';

/* ------------------------------------------------------------ layer style */

const effectCache = new WeakMap();
let scratch = null;

function getScratch(w, h) {
  if (!scratch || scratch.width !== w || scratch.height !== h) scratch = createCanvas(w, h);
  const g = scratch.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  return scratch;
}

/** Solid-colored silhouette of a canvas' alpha. */
function silhouette(src, color) {
  const c = getScratch(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function renderEffects(src, effects) {
  const { width: w, height: h } = src;
  const out = createCanvas(w, h);
  const g = out.getContext('2d');
  const { shadow, glow, stroke } = effects;
  // Shadows are drawn with the source pushed off-canvas so only the shadow lands.
  const far = w + h + 100;
  if (shadow?.enabled) {
    const rad = (shadow.angle * Math.PI) / 180;
    g.save();
    g.shadowColor = hexA(shadow.color, shadow.opacity);
    g.shadowBlur = shadow.size;
    g.shadowOffsetX = -Math.cos(rad) * shadow.distance + far;
    g.shadowOffsetY = Math.sin(rad) * shadow.distance;
    g.drawImage(src, -far, 0);
    g.restore();
  }
  if (glow?.enabled) {
    g.save();
    g.shadowColor = hexA(glow.color, glow.opacity);
    g.shadowBlur = glow.size;
    g.shadowOffsetX = far;
    g.drawImage(src, -far, 0);
    g.drawImage(src, -far, 0);
    g.restore();
  }
  if (stroke?.enabled && stroke.size > 0) {
    const sil = silhouette(src, stroke.color);
    const r = stroke.size;
    const steps = Math.min(72, Math.max(12, Math.ceil(r * 4)));
    for (let ring = r; ring > 0; ring -= Math.max(1, r / 3)) {
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        g.drawImage(sil, Math.cos(a) * ring, Math.sin(a) * ring);
      }
    }
  }
  g.drawImage(src, 0, 0);
  return out;
}

function layerSource(layer, src) {
  if (!layer.hasEffects) return src;
  // Live previews change every frame, so they are never cached.
  if (src !== layer.canvas) return renderEffects(src, layer.effects);
  const key = JSON.stringify(layer.effects);
  const cached = effectCache.get(layer);
  if (cached && cached.src === src && cached.key === key && cached.version === layer.version) return cached.out;
  const out = renderEffects(src, layer.effects);
  effectCache.set(layer, { src, key, out, version: layer.version });
  return out;
}

/**
 * Composite all visible layers into `target`.
 * `preview` ({layerId, canvas}) substitutes a layer's pixels while a tool is working.
 */
export function compositeLayers(doc, target, { preview = doc.preview, background = null } = {}) {
  const g = target.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, target.width, target.height);
  if (background) {
    g.fillStyle = background;
    g.fillRect(0, 0, target.width, target.height);
  }
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    let src = layer.canvas;
    if (preview && preview.layerId === layer.id) {
      if (preview.dirty && preview.build) {
        preview.build(preview.canvas);
        preview.dirty = false;
      }
      src = preview.canvas;
      if (preview.hidden) continue;
    }
    src = layerSource(layer, src);
    g.globalAlpha = layer.opacity;
    g.globalCompositeOperation = blendOp(layer.blendMode);
    g.drawImage(src, 0, 0);
  }
  // Extra content drawn above everything (e.g. a floating new layer preview).
  if (preview?.extra) {
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(preview.extra, 0, 0);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return target;
}
