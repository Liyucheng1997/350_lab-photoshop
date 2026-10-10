// Runs adjustments / filters on the active layer with a live-preview dialog.
import { app } from '../core/app.js';
import { FILTERS } from '../filters/defs.js';
import { histogram } from '../filters/filters.js';
import { el, cloneCanvas, createCanvas, debounce } from '../core/utils.js';
import { openDialog, rangeRow, selectInput, checkbox, formRow } from './dialog.js';
import { pickColor } from './colorpicker.js';
import { icon } from './icons.js';

/** Apply `def` to the layer pixels, respecting the selection. Returns a new canvas. */
function computeResult(layer, srcData, def, params, selection) {
  const img = new ImageData(new Uint8ClampedArray(srcData.data), srcData.width, srcData.height);
  def.apply(img, params);
  const filtered = createCanvas(img.width, img.height);
  filtered.getContext('2d').putImageData(img, 0, 0);
  if (!selection) return filtered;
  // out = original·(1−mask) + filtered·mask  (premultiplied "lighter" sum)
  const out = cloneCanvas(layer.canvas);
  const g = out.getContext('2d');
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(selection.mask, 0, 0);
  const fg = filtered.getContext('2d');
  fg.globalCompositeOperation = 'destination-in';
  fg.drawImage(selection.mask, 0, 0);
  g.globalCompositeOperation = 'lighter';
  g.drawImage(filtered, 0, 0);
  return out;
}

function defaults(def) {
  const p = {};
  for (const prm of def.params || []) if (prm.key && prm.type !== 'histogram') p[prm.key] = prm.default;
  return p;
}

function histogramCanvas(layer) {
  const c = el('canvas', { class: 'histogram', width: 256, height: 90 });
  const g = c.getContext('2d');
  const { l, r, g: gg, b } = histogram(layer.canvas.getContext('2d').getImageData(0, 0, layer.width, layer.height));
  const max = Math.max(1, ...l) * 1.05;
  const plot = (arr, color) => {
    g.fillStyle = color;
    for (let i = 0; i < 256; i++) {
      const h = (arr[i] / max) * 90;
      g.fillRect(i, 90 - h, 1, h);
    }
  };
  g.globalCompositeOperation = 'lighter';
  plot(r, 'rgba(255,70,70,0.35)');
  plot(gg, 'rgba(70,255,70,0.35)');
  plot(b, 'rgba(70,120,255,0.35)');
  g.globalCompositeOperation = 'source-over';
  plot(l, 'rgba(220,222,228,0.75)');
  return el('div', { class: 'histogram-wrap' }, c, el('div', { class: 'histogram-ramp' }));
}

export async function runFilter(id, { repeat = false } = {}) {
  const def = FILTERS[id];
  const doc = app.doc;
  if (!def || !doc) return;
  if (app.transform) app.transform.commit();
  const layer = await app.paintableLayer({ action: def.name });
  if (!layer) return;
  const selection = doc.selection;
  const srcData = layer.canvas.getContext('2d').getImageData(0, 0, layer.width, layer.height);

  const commit = (params) => {
    const result = computeResult(layer, srcData, def, params, selection);
    const g = layer.edit();
    g.save();
    g.globalCompositeOperation = 'copy';
    g.drawImage(result, 0, 0);
    g.restore();
    doc.preview = null;
    app.lastFilter = { id, params };
    app.commit(def.name, 'sliders-horizontal');
    app.emit('last-filter');
  };

  if (!def.params?.length) return commit({});
  if (repeat && app.lastFilter?.id === id) return commit(app.lastFilter.params);

  const params = app.lastFilter?.id === id ? { ...app.lastFilter.params } : defaults(def);
  let previewOn = true;
  const busy = el('div', { class: 'filter-busy' }, icon('loader', 14), '处理中…');

  const updatePreview = debounce(() => {
    if (!previewOn) {
      doc.preview = null;
      doc.invalidate();
      app.requestRender();
      return;
    }
    busy.classList.add('show');
    // let the "processing" badge paint before the (synchronous) filter runs
    setTimeout(() => {
      const result = computeResult(layer, srcData, def, params, selection);
      doc.preview = { layerId: layer.id, canvas: result, dirty: false };
      app.requestRender();
      busy.classList.remove('show');
    }, 16);
  }, 90);

  const controls = [];
  const body = el('div', { class: 'filter-dialog' });
  for (const prm of def.params) {
    if (prm.type === 'range') {
      const row = rangeRow({ label: prm.label, min: prm.min, max: prm.max, step: prm.step, value: params[prm.key], unit: prm.unit, onInput: (v) => ((params[prm.key] = v), updatePreview()) });
      controls.push(() => (row.value = params[prm.key]));
      body.append(row.el);
    } else if (prm.type === 'checkbox') {
      body.append(el('div', { class: 'form-check-row' }, checkbox(prm.label, params[prm.key], (v) => ((params[prm.key] = v), updatePreview()))));
    } else if (prm.type === 'select') {
      body.append(formRow(prm.label, selectInput(prm.options, params[prm.key], (v) => ((params[prm.key] = v), updatePreview()))));
    } else if (prm.type === 'color') {
      const sw = el('button', { class: 'color-swatch-btn', style: { background: params[prm.key] } });
      sw.addEventListener('click', async () => {
        const c = await pickColor(params[prm.key]);
        if (c) {
          params[prm.key] = c;
          sw.style.background = c;
          updatePreview();
        }
      });
      body.append(formRow(prm.label, sw));
    } else if (prm.type === 'histogram') {
      body.append(histogramCanvas(layer));
    }
  }

  const previewToggle = checkbox('预览', true, (v) => {
    previewOn = v;
    updatePreview();
  });
  const reset = el('button', { class: 'btn btn-ghost', onclick: () => {
    Object.assign(params, defaults(def));
    controls.forEach((f) => f());
    updatePreview();
  } }, '复位');

  updatePreview();
  const ok = await openDialog({
    title: def.name,
    body,
    width: 400,
    className: 'dialog-filter',
    side: el('div', { class: 'dialog-side' }, previewToggle, reset, busy),
  }).result;
  updatePreview.cancel();
  if (ok) commit(params);
  else {
    doc.preview = null;
    doc.invalidate();
    app.requestRender();
  }
}

export function repeatLastFilter() {
  if (app.lastFilter) runFilter(app.lastFilter.id, { repeat: true });
}
