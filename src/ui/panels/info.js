import { app } from '../../core/app.js';
import { el, rgbToHex, rgbToHsv } from '../../core/utils.js';

export function createInfoPanel() {
  const v = {};
  const cell = (key, label) => el('div', { class: 'info-cell' }, el('span', { class: 'info-label' }, label), (v[key] = el('span', { class: 'info-value' }, '—')));
  const swatch = el('span', { class: 'info-swatch' });
  const root = el(
    'div',
    { class: 'info-panel' },
    el('div', { class: 'info-block' }, el('div', { class: 'info-head' }, swatch, '颜色'), cell('r', 'R'), cell('g', 'G'), cell('b', 'B'), cell('a', 'A'), cell('hex', 'HEX'), cell('hsb', 'HSB')),
    el('div', { class: 'info-block' }, el('div', { class: 'info-head' }, '位置'), cell('x', 'X'), cell('y', 'Y'), cell('doc', '文档'), cell('sel', '选区')),
  );
  const clear = (keys) => keys.forEach((k) => (v[k].textContent = '—'));

  app.on('pointer', (p) => {
    const doc = app.doc;
    if (!p || !doc) {
      clear(['r', 'g', 'b', 'a', 'hex', 'hsb', 'x', 'y']);
      swatch.style.background = 'transparent';
      return;
    }
    const x = Math.floor(p.x), y = Math.floor(p.y);
    v.x.textContent = `${x} 像素`;
    v.y.textContent = `${y} 像素`;
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height || root.offsetParent === null) {
      if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) clear(['r', 'g', 'b', 'a', 'hex', 'hsb']);
      return;
    }
    const d = doc.getComposite().getContext('2d').getImageData(x, y, 1, 1).data;
    v.r.textContent = d[0];
    v.g.textContent = d[1];
    v.b.textContent = d[2];
    v.a.textContent = `${Math.round((d[3] / 255) * 100)}%`;
    v.hex.textContent = rgbToHex(d[0], d[1], d[2]).toUpperCase();
    const hsv = rgbToHsv(d[0], d[1], d[2]);
    v.hsb.textContent = `${Math.round(hsv.h)}° ${Math.round(hsv.s * 100)}% ${Math.round(hsv.v * 100)}%`;
    swatch.style.background = `rgba(${d[0]},${d[1]},${d[2]},${d[3] / 255})`;
  });
  const meta = () => {
    const doc = app.doc;
    v.doc.textContent = doc ? `${doc.width} × ${doc.height}` : '—';
    const b = doc?.selection?.bounds;
    v.sel.textContent = b ? `${b.w} × ${b.h}` : '—';
  };
  app.on('doc', meta);
  app.on('doc-meta', meta);
  app.on('selection', meta);
  app.on('history', meta);
  meta();
  return { el: root };
}
