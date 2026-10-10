// New / open / place / save project / export.
import { app } from '../core/app.js';
import { PSDocument, nextUntitled } from '../core/document.js';
import { Layer } from '../core/layer.js';
import { renderTextLayer } from '../core/text.js';
import { el, loadImageFromFile, loadImage, downloadBlob, canvasToBlob, stripExtension, pickFiles, formatBytes, debounce, createCanvas } from '../core/utils.js';
import { openDialog, formRow, numberInput, selectInput, rangeRow, saveChangesDialog } from '../ui/dialog.js';
import { icon } from '../ui/icons.js';
import { startFreeTransform } from '../tools/transform.js';

const PROJECT_EXT = '.psw';

/* ---------------------------------------------------------------- new */

export const PRESETS = [
  { name: '默认', w: 1920, h: 1080, icon: 'monitor' },
  { name: '方形社交', w: 1080, h: 1080, icon: 'square' },
  { name: '手机竖屏', w: 1080, h: 1920, icon: 'smartphone' },
  { name: '4K 超高清', w: 3840, h: 2160, icon: 'tv' },
  { name: 'A4 (150ppi)', w: 1240, h: 1754, icon: 'file-text' },
  { name: '网页横幅', w: 1200, h: 628, icon: 'panel-top' },
  { name: '图标', w: 512, h: 512, icon: 'app-window' },
  { name: '小画布', w: 800, h: 600, icon: 'image' },
];

export function newDocument({ name, width, height, background }) {
  const doc = PSDocument.create({ name, width, height, background });
  app.addDoc(doc);
  return doc;
}

export function showNewDialog() {
  const state = { name: nextUntitledPreview(), width: 1920, height: 1080, background: 'white' };
  const wIn = numberInput({ value: state.width, min: 1, max: 12000, width: 110, onInput: (v) => ((state.width = Math.round(v)), syncPreset()) });
  const hIn = numberInput({ value: state.height, min: 1, max: 12000, width: 110, onInput: (v) => ((state.height = Math.round(v)), syncPreset()) });
  const nameIn = el('input', { class: 'input', value: state.name, oninput: (e) => (state.name = e.target.value) });
  const bgSel = selectInput(
    [['white', '白色'], ['black', '黑色'], ['bg', '背景色'], ['transparent', '透明']],
    state.background,
    (v) => (state.background = v),
  );
  const cards = PRESETS.map((p) => {
    const ratio = p.w / p.h;
    const pw = ratio >= 1 ? 34 : 34 * ratio, ph = ratio >= 1 ? 34 / ratio : 34;
    const card = el(
      'button',
      { class: 'preset-card', onclick: () => pick(p) },
      el('div', { class: 'preset-thumb' }, el('div', { class: 'preset-shape', style: { width: `${pw}px`, height: `${ph}px` } })),
      el('div', { class: 'preset-name' }, p.name),
      el('div', { class: 'preset-size' }, `${p.w} × ${p.h}`),
    );
    card._preset = p;
    return card;
  });
  const swap = el('button', { class: 'icon-btn', title: '交换宽高', onclick: () => {
    [state.width, state.height] = [state.height, state.width];
    wIn.value = state.width;
    hIn.value = state.height;
    syncPreset();
  } }, icon('arrow-left-right', 15));

  function pick(p) {
    state.width = p.w;
    state.height = p.h;
    wIn.value = p.w;
    hIn.value = p.h;
    syncPreset();
  }
  function syncPreset() {
    cards.forEach((c) => c.classList.toggle('active', c._preset.w === state.width && c._preset.h === state.height));
  }
  syncPreset();

  const body = el(
    'div',
    { class: 'new-doc' },
    el('div', { class: 'preset-grid' }, cards),
    el(
      'div',
      { class: 'new-doc-form' },
      el('div', { class: 'section-title' }, '预设详细信息'),
      formRow('名称', nameIn),
      formRow('宽度', wIn, el('span', { class: 'unit' }, '像素')),
      formRow('高度', hIn, el('span', { class: 'unit' }, '像素'), swap),
      formRow('背景内容', bgSel),
    ),
  );
  openDialog({
    title: '新建文档',
    body,
    width: 720,
    buttons: [
      { label: '取消', value: false },
      { label: '创建', value: true, primary: true },
    ],
    onOk: () => {
      const bg = { white: '#ffffff', black: '#000000', bg: app.bg, transparent: 'transparent' }[state.background];
      newDocument({ name: state.name.trim() || nextUntitled(), width: state.width, height: state.height, background: bg });
    },
  });
}

function nextUntitledPreview() {
  return nextUntitled();
}

/* --------------------------------------------------------------- open */

export function docFromImage(img, name) {
  const doc = new PSDocument({ name, width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
  const layer = new Layer({ name: '背景', width: doc.width, height: doc.height });
  layer.edit().drawImage(img, 0, 0);
  doc.layers.push(layer);
  doc.activeLayerId = layer.id;
  doc.pushHistory('打开');
  doc.modified = false;
  return doc;
}

export async function openFiles(files) {
  for (const file of files) {
    try {
      if (file.name.toLowerCase().endsWith(PROJECT_EXT) || file.type === 'application/json') {
        const doc = await loadProject(file);
        app.addDoc(doc);
      } else if (file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(file.name)) {
        const img = await loadImageFromFile(file);
        app.addDoc(docFromImage(img, stripExtension(file.name)));
      } else {
        app.toast(`不支持的文件类型：${file.name}`);
      }
    } catch (err) {
      console.error(err);
      app.toast(`无法打开 ${file.name}：${err.message}`);
    }
  }
}

export async function showOpenDialog() {
  const files = await pickFiles({ accept: `image/*,${PROJECT_EXT}`, multiple: true });
  if (files.length) openFiles(files);
}

/* -------------------------------------------------------------- place */

export function placeCanvasAsLayer(source, name, { transform = true, x, y } = {}) {
  const doc = app.doc;
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  let w = sw, h = sh;
  const fit = Math.min(1, (doc.width * 0.9) / w, (doc.height * 0.9) / h);
  if (x == null) {
    w = Math.round(w * fit);
    h = Math.round(h * fit);
  }
  const layer = doc.createLayer({ name });
  const g = layer.edit();
  g.imageSmoothingQuality = 'high';
  const px = x ?? Math.round((doc.width - w) / 2);
  const py = y ?? Math.round((doc.height - h) / 2);
  g.drawImage(source, px, py, w, h);
  doc.setSelection(null);
  doc.addLayer(layer);
  app.commit(transform ? '置入' : '粘贴', 'image-plus');
  if (transform) startFreeTransform();
  return layer;
}

export async function showPlaceDialog() {
  if (!app.doc) return showOpenDialog();
  const [file] = await pickFiles({ accept: 'image/*' });
  if (!file) return;
  try {
    const img = await loadImageFromFile(file);
    placeCanvasAsLayer(img, stripExtension(file.name));
  } catch (err) {
    app.toast(err.message);
  }
}

/* ------------------------------------------------------------ project */

export async function saveProject(doc = app.doc) {
  if (!doc) return;
  const data = {
    app: 'PhotoStudio',
    version: 1,
    name: doc.name,
    width: doc.width,
    height: doc.height,
    activeIndex: doc.indexOf(doc.activeLayerId),
    layers: doc.layers.map((l) => ({
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      blendMode: l.blendMode,
      locked: l.locked,
      type: l.type,
      text: l.text,
      effects: l.effects,
      data: l.isText ? null : l.canvas.toDataURL('image/png'),
    })),
  };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  downloadBlob(blob, `${doc.name}${PROJECT_EXT}`);
  doc.modified = false;
  app.emit('doc-meta');
  app.toast(`已存储项目 ${doc.name}${PROJECT_EXT}（${formatBytes(blob.size)}）`, { type: 'success' });
  return true;
}

export async function loadProject(file) {
  const data = JSON.parse(await file.text());
  if (!data || !Array.isArray(data.layers) || !data.width) throw new Error('项目文件已损坏');
  const doc = new PSDocument({ name: data.name || stripExtension(file.name), width: data.width, height: data.height });
  for (const ld of data.layers) {
    const layer = new Layer({ ...ld, width: doc.width, height: doc.height, canvas: undefined });
    if (layer.isText) renderTextLayer(layer);
    else if (ld.data) layer.edit().drawImage(await loadImage(ld.data), 0, 0);
    doc.layers.push(layer);
  }
  const active = doc.layers[data.activeIndex] || doc.layers[doc.layers.length - 1];
  doc.activeLayerId = active?.id || null;
  doc.counters.layer = doc.layers.length + 1;
  doc.pushHistory('打开');
  doc.modified = false;
  return doc;
}

/* ------------------------------------------------------------- export */

const FORMATS = {
  png: { mime: 'image/png', ext: 'png', label: 'PNG', lossy: false },
  jpg: { mime: 'image/jpeg', ext: 'jpg', label: 'JPEG', lossy: true },
  webp: { mime: 'image/webp', ext: 'webp', label: 'WebP', lossy: true },
};

function renderExport(doc, format, scale) {
  const bg = format === 'jpg' ? '#ffffff' : null;
  const flat = doc.flatten(bg);
  if (scale === 1) return flat;
  const c = createCanvas(Math.max(1, Math.round(doc.width * scale)), Math.max(1, Math.round(doc.height * scale)));
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(flat, 0, 0, c.width, c.height);
  return c;
}

export async function quickExport(format = 'png') {
  const doc = app.doc;
  if (!doc) return;
  const f = FORMATS[format];
  const blob = await canvasToBlob(renderExport(doc, format, 1), f.mime, 0.92);
  downloadBlob(blob, `${doc.name}.${f.ext}`);
  app.toast(`已导出 ${doc.name}.${f.ext}（${formatBytes(blob.size)}）`, { type: 'success' });
}

export function showExportDialog() {
  const doc = app.doc;
  if (!doc) return;
  const state = { format: 'png', quality: 90, scale: 100, name: doc.name };
  const preview = el('img', { class: 'export-preview-img' });
  const info = el('div', { class: 'export-info' }, '正在计算…');
  const qualityRow = rangeRow({ label: '品质', min: 1, max: 100, value: state.quality, unit: '%', onInput: (v) => ((state.quality = v), refresh()) });
  const update = () => {
    qualityRow.el.style.display = FORMATS[state.format].lossy ? '' : 'none';
    refresh();
  };
  let lastUrl = null;
  const refresh = debounce(async () => {
    const f = FORMATS[state.format];
    const c = renderExport(doc, state.format, state.scale / 100);
    const blob = await canvasToBlob(c, f.mime, state.quality / 100);
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    preview.src = lastUrl;
    info.textContent = `${c.width} × ${c.height} 像素 · ${f.label} · 约 ${formatBytes(blob.size)}`;
  }, 150);

  const body = el(
    'div',
    { class: 'export-dialog' },
    el('div', { class: 'export-preview checker' }, preview),
    el(
      'div',
      { class: 'export-form' },
      formRow('文件名', el('input', { class: 'input', value: state.name, oninput: (e) => (state.name = e.target.value) })),
      formRow('格式', selectInput(Object.entries(FORMATS).map(([k, f]) => [k, f.label]), state.format, (v) => ((state.format = v), update()))),
      qualityRow.el,
      rangeRow({ label: '缩放', min: 5, max: 400, value: 100, unit: '%', onInput: (v) => ((state.scale = v), refresh()) }).el,
      info,
    ),
  );
  update();
  openDialog({
    title: '导出为',
    body,
    width: 760,
    buttons: [
      { label: '取消', value: false },
      { label: '导出', value: true, primary: true },
    ],
    onOk: async () => {
      const f = FORMATS[state.format];
      const blob = await canvasToBlob(renderExport(doc, state.format, state.scale / 100), f.mime, state.quality / 100);
      downloadBlob(blob, `${state.name || doc.name}.${f.ext}`);
      app.toast(`已导出 ${state.name}.${f.ext}`, { type: 'success' });
    },
  }).result.then(() => lastUrl && URL.revokeObjectURL(lastUrl));
}

/* -------------------------------------------------------------- close */

export async function closeDocument(doc = app.doc) {
  if (!doc) return true;
  if (app.transform) app.transform.commit();
  if (doc.modified) {
    app.setDoc(doc);
    const r = await saveChangesDialog(doc.name);
    if (!r) return false;
    if (r === 'save') await saveProject(doc);
  }
  app.removeDoc(doc);
  return true;
}

export async function closeAll() {
  for (const d of [...app.docs]) if (!(await closeDocument(d))) return;
}
