// Command registry: every menu item / shortcut maps to a command here.
import { app } from './core/app.js';
import * as ops from './core/docops.js';
import { FILTERS } from './filters/defs.js';
import { runFilter, repeatLastFilter } from './ui/filterdialog.js';
import * as dialogs from './ui/dialogs.js';
import * as file from './io/file.js';
import { startFreeTransform, transformLayer } from './tools/transform.js';
import { cropDocument } from './tools/crop.js';
import { createCanvas, contentBounds, canvasToBlob } from './core/utils.js';

export const commands = {};

/** def: {label, keys: ['Ctrl+Z'], run, enabled, checked, icon} */
function cmd(id, def) {
  commands[id] = { id, ...def };
}

export function runCommand(id) {
  const c = commands[id];
  if (!c) return console.warn(`unknown command ${id}`);
  if (c.enabled && !c.enabled()) return;
  c.run();
}

const hasDoc = () => !!app.doc;
const hasSel = () => !!app.doc?.selection;
const hasLayer = () => !!app.doc?.activeLayer;

/* ------------------------------------------------------------------ file */

cmd('file.new', { label: '新建…', keys: ['Ctrl+N', 'Ctrl+Alt+N'], icon: 'file-plus', run: file.showNewDialog });
cmd('file.open', { label: '打开…', keys: ['Ctrl+O'], icon: 'folder-open', run: file.showOpenDialog });
cmd('file.place', { label: '置入嵌入对象…', icon: 'image-plus', enabled: hasDoc, run: file.showPlaceDialog });
cmd('file.close', { label: '关闭', keys: ['Ctrl+W', 'Ctrl+Alt+W'], enabled: hasDoc, run: () => file.closeDocument() });
cmd('file.closeAll', { label: '关闭全部', enabled: hasDoc, run: file.closeAll });
cmd('file.save', { label: '存储项目 (.psw)', keys: ['Ctrl+S'], icon: 'save', enabled: hasDoc, run: () => file.saveProject() });
cmd('file.export', { label: '导出为…', keys: ['Ctrl+Alt+Shift+W', 'Ctrl+Shift+S'], icon: 'download', enabled: hasDoc, run: file.showExportDialog });
cmd('file.quickPng', { label: '快速导出为 PNG', keys: ['Ctrl+Shift+Q'], enabled: hasDoc, run: () => file.quickExport('png') });
cmd('file.quickJpg', { label: '快速导出为 JPEG', enabled: hasDoc, run: () => file.quickExport('jpg') });

/* ------------------------------------------------------------------ edit */

cmd('edit.undo', {
  label: () => (app.doc?.history.canUndo ? `还原${app.doc.history.current.name}` : '还原'),
  keys: ['Ctrl+Z', 'Ctrl+Alt+Z'],
  icon: 'undo-2',
  enabled: () => !!app.doc && (app.doc.history.canUndo || !!app.transform),
  run: () => app.undo(),
});
cmd('edit.redo', {
  label: () => (app.doc?.history.canRedo ? `重做${app.doc.history.states[app.doc.history.index + 1].name}` : '重做'),
  keys: ['Ctrl+Shift+Z', 'Ctrl+Y'],
  icon: 'redo-2',
  enabled: () => !!app.doc?.history.canRedo,
  run: () => app.redo(),
});

// Clipboard: internal clipboard keeps the position; the system clipboard is used when
// the window lost focus since the last copy (the user may have copied elsewhere).
let blurredSinceCopy = true;
window.addEventListener('blur', () => (blurredSinceCopy = true));

async function copyToClipboard(merged) {
  const doc = app.doc;
  const src = merged ? doc.flatten() : doc.activeLayer?.canvas;
  if (!src) return false;
  const region = ops.canvasRegionCopy(src, doc);
  if (!region) {
    app.toast('所选区域为空');
    return false;
  }
  app.clipboard = region;
  blurredSinceCopy = false;
  try {
    const blob = await canvasToBlob(region.canvas);
    await navigator.clipboard?.write?.([new ClipboardItem({ 'image/png': blob })]);
  } catch {
    /* system clipboard not available; the internal clipboard still works */
  }
  return true;
}

export function pasteCanvas(source, { x, y, name = '粘贴' } = {}) {
  if (!app.doc) {
    const doc = file.newDocument({ name: undefined, width: source.width, height: source.height, background: 'transparent' });
    doc.layers[0].edit().drawImage(source, 0, 0);
    doc.history.states = [];
    doc.history.index = -1;
    doc.pushHistory('粘贴');
    app.changed();
    app.emit('history');
    return;
  }
  const doc = app.doc;
  const fits = x != null && x + source.width <= doc.width && y + source.height <= doc.height && x >= 0 && y >= 0;
  file.placeCanvasAsLayer(source, name === '粘贴' ? doc.newLayerName() : name, {
    transform: false,
    x: fits ? x : Math.round((doc.width - source.width) / 2),
    y: fits ? y : Math.round((doc.height - source.height) / 2),
  });
}

export async function pasteFromSystemImage(blob) {
  const img = await createImageBitmap(blob);
  const c = createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  pasteCanvas(c);
}

/** Paste from a `paste` DOM event (Ctrl+V). */
export async function handlePasteEvent(e) {
  const items = [...(e.clipboardData?.items || [])];
  const imgItem = items.find((i) => i.type.startsWith('image/'));
  if (app.clipboard && (!blurredSinceCopy || !imgItem)) {
    const c = app.clipboard;
    return pasteCanvas(c.canvas, { x: c.x, y: c.y });
  }
  if (imgItem) return pasteFromSystemImage(imgItem.getAsFile());
  app.toast('剪贴板中没有图像');
}

async function pasteCommand() {
  if (app.clipboard && !blurredSinceCopy) return pasteCanvas(app.clipboard.canvas, { x: app.clipboard.x, y: app.clipboard.y });
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) return pasteFromSystemImage(await item.getType(type));
    }
  } catch {
    /* permission denied or unsupported */
  }
  if (app.clipboard) return pasteCanvas(app.clipboard.canvas, { x: app.clipboard.x, y: app.clipboard.y });
  app.toast('剪贴板中没有图像');
}

cmd('edit.cut', {
  label: '剪切',
  keys: ['Ctrl+X'],
  icon: 'scissors',
  enabled: hasLayer,
  run: async () => {
    const layer = await app.paintableLayer({ action: '剪切' });
    if (!layer || !(await copyToClipboard(false))) return;
    const doc = app.doc;
    const g = layer.edit();
    g.save();
    g.globalCompositeOperation = 'destination-out';
    if (doc.selection) g.drawImage(doc.selection.mask, 0, 0);
    else g.fillRect(0, 0, doc.width, doc.height);
    g.restore();
    app.commit('剪切', 'scissors');
  },
});
cmd('edit.copy', { label: '拷贝', keys: ['Ctrl+C'], icon: 'copy', enabled: hasLayer, run: () => copyToClipboard(false) });
cmd('edit.copyMerged', { label: '合并拷贝', keys: ['Ctrl+Shift+C'], enabled: hasDoc, run: () => copyToClipboard(true) });
cmd('edit.paste', { label: '粘贴', icon: 'clipboard', run: pasteCommand });
cmd('edit.clear', { label: '清除', keys: ['Delete', 'Backspace'], enabled: hasLayer, run: ops.clearSelection });
cmd('edit.fill', { label: '填充…', keys: ['Shift+F5', 'Shift+Backspace'], icon: 'paint-bucket', enabled: hasLayer, run: dialogs.fillDialog });
cmd('edit.fillFg', { label: '用前景色填充', keys: ['Alt+Backspace', 'Alt+Delete'], enabled: hasLayer, run: () => ops.fillWith(app.fg, { name: '填充前景色' }) });
cmd('edit.fillBg', { label: '用背景色填充', keys: ['Ctrl+Backspace', 'Ctrl+Delete'], enabled: hasLayer, run: () => ops.fillWith(app.bg, { name: '填充背景色' }) });
cmd('edit.stroke', { label: '描边…', enabled: hasSel, run: dialogs.strokeDialog });
cmd('edit.freeTransform', { label: '自由变换', keys: ['Ctrl+T', 'Ctrl+Alt+T'], icon: 'scaling', enabled: () => hasLayer() && !app.transform, run: startFreeTransform });
cmd('edit.rotate180', { label: '旋转 180 度', enabled: hasLayer, run: () => transformLayer('rotate180') });
cmd('edit.rotate90', { label: '顺时针旋转 90 度', enabled: hasLayer, run: () => transformLayer('rotate90') });
cmd('edit.rotate-90', { label: '逆时针旋转 90 度', enabled: hasLayer, run: () => transformLayer('rotate-90') });
cmd('edit.flipH', { label: '水平翻转', enabled: hasLayer, run: () => transformLayer('flipH') });
cmd('edit.flipV', { label: '垂直翻转', enabled: hasLayer, run: () => transformLayer('flipV') });

/* ----------------------------------------------------------------- image */

const ADJ_KEYS = { levels: ['Ctrl+L'], hueSaturation: ['Ctrl+U'], colorBalance: ['Ctrl+B'], invert: ['Ctrl+I'], desaturate: ['Ctrl+Shift+U'], autoTone: ['Ctrl+Shift+L'], autoContrast: ['Ctrl+Alt+Shift+L'], blackWhite: ['Ctrl+Alt+Shift+B'] };
for (const [id, def] of Object.entries(FILTERS)) {
  cmd(`filter.${id}`, { label: def.params?.length ? `${def.name}…` : def.name, keys: ADJ_KEYS[id], icon: def.icon, enabled: hasLayer, run: () => runFilter(id) });
}
cmd('filter.last', {
  label: () => (app.lastFilter ? `上次滤镜操作（${FILTERS[app.lastFilter.id].name}）` : '上次滤镜操作'),
  keys: ['Ctrl+Alt+F'],
  enabled: () => hasLayer() && !!app.lastFilter,
  run: repeatLastFilter,
});

cmd('image.size', { label: '图像大小…', keys: ['Ctrl+Alt+I'], enabled: hasDoc, run: dialogs.imageSizeDialog });
cmd('image.canvasSize', { label: '画布大小…', keys: ['Ctrl+Alt+C'], enabled: hasDoc, run: dialogs.canvasSizeDialog });
cmd('image.rotate180', { label: '180 度', enabled: hasDoc, run: () => ops.rotateCanvas('180') });
cmd('image.rotateCw', { label: '顺时针 90 度', enabled: hasDoc, run: () => ops.rotateCanvas('cw') });
cmd('image.rotateCcw', { label: '逆时针 90 度', enabled: hasDoc, run: () => ops.rotateCanvas('ccw') });
cmd('image.flipH', { label: '水平翻转画布', enabled: hasDoc, run: () => ops.rotateCanvas('flipH') });
cmd('image.flipV', { label: '垂直翻转画布', enabled: hasDoc, run: () => ops.rotateCanvas('flipV') });
cmd('image.crop', { label: '裁剪', icon: 'crop', enabled: hasSel, run: () => cropDocument(app.doc.selection.bounds) });
cmd('image.trim', {
  label: '裁切透明像素',
  enabled: hasDoc,
  run: () => {
    const b = contentBounds(app.doc.flatten());
    if (!b) return app.toast('图像完全透明');
    cropDocument(b);
  },
});

/* ----------------------------------------------------------------- layer */

cmd('layer.new', { label: '新建图层', keys: ['Ctrl+Shift+N', 'Ctrl+Alt+Shift+N'], icon: 'plus', enabled: hasDoc, run: ops.newLayer });
cmd('layer.duplicate', { label: () => (app.doc?.selection ? '通过拷贝的图层' : '复制图层'), keys: ['Ctrl+J'], icon: 'copy', enabled: hasLayer, run: ops.duplicateLayer });
cmd('layer.viaCut', { label: '通过剪切的图层', keys: ['Ctrl+Shift+J'], enabled: hasSel, run: () => ops.layerVia(true) });
cmd('layer.delete', { label: '删除图层', icon: 'trash-2', enabled: () => (app.doc?.layers.length || 0) > 1, run: () => ops.deleteLayer() });
cmd('layer.properties', { label: '图层属性…', enabled: hasLayer, run: () => dialogs.layerPropertiesDialog() });
cmd('layer.style', { label: '图层样式…', icon: 'sparkles', enabled: hasLayer, run: () => dialogs.layerStyleDialog() });
cmd('layer.clearStyle', {
  label: '清除图层样式',
  enabled: () => !!app.doc?.activeLayer?.effects,
  run: () => {
    app.doc.activeLayer.effects = null;
    app.commit('清除图层样式', 'sparkles');
  },
});
cmd('layer.rasterize', { label: '栅格化图层', enabled: () => !!(app.doc?.activeLayer?.isText || app.doc?.activeLayer?.hasEffects), run: ops.rasterizeLayer });
cmd('layer.front', { label: '置为顶层', keys: ['Ctrl+Shift+]'], enabled: hasLayer, run: () => ops.arrangeLayer('front') });
cmd('layer.forward', { label: '前移一层', keys: ['Ctrl+]'], enabled: hasLayer, run: () => ops.arrangeLayer('forward') });
cmd('layer.backward', { label: '后移一层', keys: ['Ctrl+['], enabled: hasLayer, run: () => ops.arrangeLayer('backward') });
cmd('layer.back', { label: '置为底层', keys: ['Ctrl+Shift+['], enabled: hasLayer, run: () => ops.arrangeLayer('back') });
cmd('layer.mergeDown', { label: '向下合并', keys: ['Ctrl+E'], icon: 'merge', enabled: () => (app.doc?.indexOf(app.doc.activeLayerId) || 0) > 0, run: ops.mergeDown });
cmd('layer.mergeVisible', { label: '合并可见图层', keys: ['Ctrl+Shift+E'], enabled: () => (app.doc?.layers.length || 0) > 1, run: ops.mergeVisible });
cmd('layer.flatten', { label: '拼合图像', enabled: hasDoc, run: ops.flattenImage });
cmd('layer.lock', {
  label: () => (app.doc?.activeLayer?.locked ? '解锁图层' : '锁定图层'),
  keys: ['Ctrl+/'],
  enabled: hasLayer,
  run: () => {
    const l = app.doc.activeLayer;
    l.locked = !l.locked;
    app.commit(l.locked ? '锁定图层' : '解锁图层', 'lock');
  },
});

/* ---------------------------------------------------------------- select */

cmd('select.all', { label: '全部', keys: ['Ctrl+A'], enabled: hasDoc, run: ops.selectAllCmd });
cmd('select.none', { label: '取消选择', keys: ['Ctrl+D'], enabled: hasSel, run: ops.deselect });
cmd('select.reselect', { label: '重新选择', keys: ['Ctrl+Shift+D'], enabled: () => !!app.doc?.lastSelection, run: ops.reselect });
cmd('select.inverse', { label: '反选', keys: ['Ctrl+Shift+I'], enabled: hasDoc, run: ops.inverseSelection });
cmd('select.layerPixels', { label: '载入图层选区', enabled: hasLayer, run: () => ops.selectLayerPixels() });
cmd('select.expand', { label: '扩展…', enabled: hasSel, run: () => dialogs.modifySelection('expand') });
cmd('select.contract', { label: '收缩…', enabled: hasSel, run: () => dialogs.modifySelection('contract') });
cmd('select.feather', { label: '羽化…', keys: ['Shift+F6'], enabled: hasSel, run: () => dialogs.modifySelection('feather') });
cmd('select.border', { label: '边界…', enabled: hasSel, run: () => dialogs.modifySelection('border') });

/* ------------------------------------------------------------------ view */

const vp = () => app.viewport;
cmd('view.zoomIn', { label: '放大', keys: ['Ctrl+=', 'Ctrl+Shift+='], icon: 'zoom-in', enabled: hasDoc, run: () => vp().zoomStep(1) });
cmd('view.zoomOut', { label: '缩小', keys: ['Ctrl+-'], icon: 'zoom-out', enabled: hasDoc, run: () => vp().zoomStep(-1) });
cmd('view.fit', { label: '按屏幕大小缩放', keys: ['Ctrl+0'], icon: 'maximize', enabled: hasDoc, run: () => vp().fit(true) });
cmd('view.actual', { label: '100%', keys: ['Ctrl+1', 'Ctrl+Alt+0'], enabled: hasDoc, run: () => {
  vp().setZoom(1);
  vp().center();
} });
cmd('view.fill', {
  label: '填充屏幕',
  enabled: hasDoc,
  run: () => {
    const d = app.doc;
    vp().doc.view.zoom = Math.max(vp().W / d.width, vp().H / d.height);
    vp().center();
  },
});
cmd('view.rulers', {
  label: '标尺',
  keys: ['Ctrl+R'],
  checked: () => app.settings.rulers,
  run: () => {
    app.settings.rulers = !app.settings.rulers;
    app.savePrefs();
    vp().applySettings();
  },
});
cmd('view.pixelGrid', {
  label: '像素网格',
  checked: () => app.settings.pixelGrid,
  run: () => {
    app.settings.pixelGrid = !app.settings.pixelGrid;
    app.savePrefs();
    app.requestRender();
  },
});
cmd('view.togglePanels', { label: '显示/隐藏面板', keys: ['Tab'], run: () => document.body.classList.toggle('panels-hidden') });

/* ------------------------------------------------------------------ help */

cmd('help.shortcuts', { label: '键盘快捷键…', keys: ['Ctrl+Alt+Shift+K', 'F1'], icon: 'keyboard', run: dialogs.shortcutsDialog });
cmd('help.about', { label: '关于 PhotoStudio', icon: 'info', run: dialogs.aboutDialog });

/* ------------------------------------------------------------- shortcuts */

export function shortcutLabel(id) {
  const k = commands[id]?.keys?.[0];
  return k ? k.replace(/\+/g, '+').replace('Delete', 'Del') : '';
}

const keyIndex = new Map();
export function buildKeyIndex() {
  keyIndex.clear();
  for (const c of Object.values(commands)) for (const k of c.keys || []) keyIndex.set(k, c.id);
}

export function commandForCombo(combo) {
  return keyIndex.get(combo);
}
