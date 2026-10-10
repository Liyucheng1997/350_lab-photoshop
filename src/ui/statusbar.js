import { app } from '../core/app.js';
import { el, formatBytes } from '../core/utils.js';
import { icon } from './icons.js';

export function createStatusbar() {
  const zoom = el('input', { class: 'status-zoom', type: 'text', title: '缩放比例' });
  const size = el('span', { class: 'status-item' });
  const pos = el('span', { class: 'status-item status-pos' });
  const hint = el('span', { class: 'status-hint' });
  const layers = el('span', { class: 'status-item' });

  zoom.addEventListener('change', () => {
    const v = parseFloat(zoom.value);
    if (app.doc && v > 0) app.viewport.setZoom(v / 100);
    zoom.blur();
  });
  zoom.addEventListener('keydown', (e) => e.key === 'Enter' && zoom.blur());

  const meta = () => {
    const doc = app.doc;
    zoom.disabled = !doc;
    if (!doc) {
      zoom.value = '';
      size.textContent = '';
      layers.textContent = '';
      return;
    }
    if (document.activeElement !== zoom) zoom.value = `${+(doc.view.zoom * 100).toFixed(2)}%`;
    size.replaceChildren(icon('image', 12), ` ${doc.width} × ${doc.height} 像素 · 约 ${formatBytes(doc.width * doc.height * 4 * doc.layers.length)}`);
    layers.replaceChildren(icon('layers', 12), ` ${doc.layers.length} 个图层`);
  };
  const tool = () => {
    hint.textContent = app.transform ? '自由变换：拖动控制点缩放，在框外拖动旋转，Enter 提交，Esc 取消' : app.tool?.hint || '';
  };
  app.on('pointer', (p) => {
    pos.replaceChildren(icon('crosshair', 12), p ? ` X: ${Math.floor(p.x)}  Y: ${Math.floor(p.y)}` : '');
  });
  for (const ev of ['doc', 'doc-meta', 'view', 'layers', 'history']) app.on(ev, meta);
  app.on('tool', tool);
  app.on('transform', tool);
  meta();
  tool();
  return el('div', { class: 'statusbar' }, zoom, el('span', { class: 'status-sep' }), size, el('span', { class: 'status-sep' }), layers, el('span', { class: 'status-sep' }), hint, el('div', { class: 'spacer' }), pos);
}
