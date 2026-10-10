// Layers panel: list with thumbnails, visibility, drag-to-reorder, blend mode & opacity.
import { app } from '../../core/app.js';
import { el, clamp } from '../../core/utils.js';
import { BLEND_MODES } from '../../core/compositor.js';
import * as ops from '../../core/docops.js';
import { runCommand } from '../../commands.js';
import { icon } from '../icons.js';
import { openMenu, contextMenu } from '../menu.js';
import { layerStyleDialog, layerPropertiesDialog } from '../dialogs.js';
import { textTool } from '../../tools/text.js';
import { FILTERS } from '../../filters/defs.js';

const THUMB_W = 40, THUMB_H = 32;

export function createLayersPanel() {
  const blend = el(
    'select',
    { class: 'input select layers-blend', title: '设置图层的混合模式' },
    BLEND_MODES.map((m) => (m ? el('option', { value: m[0] }, m[1]) : el('option', { disabled: true }, '──────'))),
  );
  const opacity = el('input', { class: 'input input-number', type: 'number', min: 0, max: 100 });
  const opSlider = el('input', { type: 'range', class: 'slider', min: 0, max: 100 });
  const lockBtn = el('button', { class: 'icon-btn', title: '锁定全部' }, icon('lock', 14));
  const list = el('div', { class: 'layers-list' });
  const thumbs = new Map();

  const active = () => app.doc?.activeLayer;

  blend.addEventListener('change', () => {
    const l = active();
    if (!l) return;
    l.blendMode = blend.value;
    app.commit('混合模式更改', 'blend');
  });
  const setOpacity = (v, commit) => {
    const l = active();
    if (!l) return;
    l.opacity = clamp(v, 0, 100) / 100;
    opacity.value = String(Math.round(l.opacity * 100));
    opSlider.value = opacity.value;
    opSlider.style.setProperty('--fill', `${opSlider.value}%`);
    if (commit) app.commit('不透明度更改', 'sliders-horizontal');
    else app.changed({ layers: false });
  };
  opacity.addEventListener('change', () => setOpacity(parseFloat(opacity.value) || 0, true));
  opSlider.addEventListener('input', () => setOpacity(parseFloat(opSlider.value), false));
  opSlider.addEventListener('change', () => setOpacity(parseFloat(opSlider.value), true));
  lockBtn.addEventListener('click', () => runCommand('layer.lock'));

  function syncControls() {
    const l = active();
    const dis = !l;
    blend.disabled = opacity.disabled = opSlider.disabled = lockBtn.disabled = dis;
    if (!l) return;
    blend.value = l.blendMode;
    if (document.activeElement !== opacity) opacity.value = String(Math.round(l.opacity * 100));
    opSlider.value = String(Math.round(l.opacity * 100));
    opSlider.style.setProperty('--fill', `${opSlider.value}%`);
    lockBtn.classList.toggle('active', l.locked);
  }

  function drawThumb(layer, canvas) {
    const doc = app.doc;
    const g = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = THUMB_W * dpr;
    canvas.height = THUMB_H * dpr;
    g.scale(dpr, dpr);
    const s = Math.min(THUMB_W / doc.width, THUMB_H / doc.height);
    const w = doc.width * s, h = doc.height * s;
    const x = (THUMB_W - w) / 2, y = (THUMB_H - h) / 2;
    // checkerboard
    g.fillStyle = '#fff';
    g.fillRect(x, y, w, h);
    g.fillStyle = '#d6d8dc';
    for (let cy = 0; cy < h; cy += 4) for (let cx = (cy / 4) % 2 ? 4 : 0; cx < w; cx += 8) g.fillRect(x + cx, y + cy, Math.min(4, w - cx), Math.min(4, h - cy));
    g.imageSmoothingQuality = 'high';
    g.drawImage(layer.canvas, x, y, w, h);
  }

  let drag = null;

  function row(layer, index) {
    const doc = app.doc;
    const isActive = layer.id === doc.activeLayerId;
    const thumb = el('canvas', { class: 'layer-thumb', style: { width: `${THUMB_W}px`, height: `${THUMB_H}px` } });
    thumbs.set(layer.id, { canvas: thumb, layer });
    drawThumb(layer, thumb);
    const eye = el('button', { class: `layer-eye${layer.visible ? '' : ' off'}`, title: '切换图层可见性（Alt+单击：仅显示此图层）' }, icon(layer.visible ? 'eye' : 'eye-off', 14));
    eye.addEventListener('pointerdown', (e) => e.stopPropagation());
    eye.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.altKey) {
        const solo = doc.layers.every((l) => l === layer || !l.visible);
        doc.layers.forEach((l) => (l.visible = solo ? true : l === layer));
      } else layer.visible = !layer.visible;
      app.commit(layer.visible ? '显示图层' : '隐藏图层', 'eye');
    });
    const name = el('span', { class: 'layer-name', title: layer.name }, layer.name);
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(layer, name);
    });
    const thumbWrap = el('div', { class: 'layer-thumb-wrap', title: 'Ctrl+单击：载入选区　双击：编辑文字 / 图层样式' }, layer.isText ? el('div', { class: 'layer-thumb-text' }, icon('type', 16)) : thumb);
    thumbWrap.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.stopPropagation();
        ops.selectLayerPixels(layer);
      }
    });
    thumbWrap.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (layer.isText) {
        app.setTool('text');
        textTool.edit(layer);
      } else layerStyleDialog(layer);
    });
    const badges = el(
      'div',
      { class: 'layer-badges' },
      layer.effects && layer.hasEffects ? el('button', { class: 'layer-fx', title: '图层样式', onclick: (e) => {
        e.stopPropagation();
        layerStyleDialog(layer);
      } }, 'fx') : null,
      layer.locked ? el('span', { class: 'layer-lock', title: '已锁定' }, icon('lock', 12)) : null,
    );
    const r = el('div', { class: `layer-row${isActive ? ' active' : ''}${layer.visible ? '' : ' hidden-layer'}`, dataset: { id: layer.id, index } }, eye, thumbWrap, name, badges);
    r.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (doc.activeLayerId !== layer.id) {
        if (app.transform) app.transform.commit();
        textTool.commit();
        doc.activeLayerId = layer.id;
        app.emit('layers');
        app.emit('tool-options', app.tool);
      }
      drag = { id: layer.id, y0: e.clientY, active: false, pointerId: e.pointerId };
    });
    r.addEventListener('contextmenu', (e) => {
      doc.activeLayerId = layer.id;
      app.emit('layers');
      contextMenu(e, [
        { label: '图层属性…', run: () => layerPropertiesDialog(layer) },
        { label: '混合选项 / 图层样式…', icon: 'sparkles', run: () => layerStyleDialog(layer) },
        '-',
        { label: '复制图层', icon: 'copy', run: () => runCommand('layer.duplicate') },
        { label: '删除图层', icon: 'trash-2', enabled: doc.layers.length > 1, run: () => ops.deleteLayer(layer.id) },
        { label: '重命名图层', icon: 'pencil', run: () => startRename(layer, r.querySelector('.layer-name')) },
        '-',
        { label: '选择像素', run: () => ops.selectLayerPixels(layer) },
        { label: '栅格化图层', enabled: layer.isText || layer.hasEffects, run: () => ops.rasterizeLayer() },
        { label: layer.locked ? '解锁图层' : '锁定图层', icon: 'lock', run: () => runCommand('layer.lock') },
        '-',
        { label: '向下合并', enabled: index > 0, run: ops.mergeDown },
        { label: '合并可见图层', run: ops.mergeVisible },
        { label: '拼合图像', run: ops.flattenImage },
      ]);
    });
    return r;
  }

  function startRename(layer, nameEl) {
    const input = el('input', { class: 'input layer-rename', value: layer.name });
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (ok && v && v !== layer.name) {
        layer.name = v;
        app.commit('重命名图层', 'pencil');
      } else render();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  // drag to reorder
  const marker = el('div', { class: 'drop-marker' });
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.active && Math.abs(e.clientY - drag.y0) > 5) {
      drag.active = true;
      list.classList.add('dragging');
      list.append(marker);
    }
    if (!drag.active) return;
    const rows = [...list.querySelectorAll('.layer-row')];
    const lr = list.getBoundingClientRect();
    let slot = rows.length;
    for (let i = 0; i < rows.length; i++) {
      const rr = rows[i].getBoundingClientRect();
      if (e.clientY < rr.top + rr.height / 2) {
        slot = i;
        break;
      }
    }
    drag.slot = slot;
    const ref = rows[slot] ? rows[slot].getBoundingClientRect().top : rows[rows.length - 1].getBoundingClientRect().bottom;
    marker.style.top = `${ref - lr.top + list.scrollTop - 1}px`;
  });
  window.addEventListener('pointerup', () => {
    const d = drag;
    drag = null;
    if (!d?.active) return;
    list.classList.remove('dragging');
    marker.remove();
    const doc = app.doc;
    const n = doc.layers.length;
    // rows are displayed top layer first; slot k means "above display row k"
    const from = doc.indexOf(d.id);
    let to = n - d.slot; // index in bottom→top order, before removal
    if (to > from) to -= 1;
    to = clamp(to, 0, n - 1);
    if (to !== from) {
      doc.moveLayer(d.id, to);
      app.commit('图层顺序', 'layers');
    } else render();
  });

  function render() {
    const doc = app.doc;
    thumbs.clear();
    if (!doc) {
      list.replaceChildren(el('div', { class: 'empty-hint' }, '没有打开的文档'));
      syncControls();
      return;
    }
    const rows = [];
    for (let i = doc.layers.length - 1; i >= 0; i--) rows.push(row(doc.layers[i], i));
    list.replaceChildren(...rows);
    syncControls();
  }

  let thumbTimer = 0;
  function refreshThumbs() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => {
      if (!app.doc) return;
      for (const { canvas, layer } of thumbs.values()) if (!layer.isText) drawThumb(layer, canvas);
    }, 160);
  }

  app.on('layers', render);
  app.on('doc', render);
  app.on('content', refreshThumbs);
  render();

  const addMenu = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    openMenu(
      ['brightnessContrast', 'levels', 'hueSaturation', 'colorBalance', 'blackWhite', 'vibrance', 'exposure', 'invert', 'posterize', 'threshold', 'gradientMap'].map((id) => ({
        label: FILTERS[id].name,
        icon: FILTERS[id].icon,
        run: () => runCommand(`filter.${id}`),
      })),
      { x: r.left, y: r.top - 360 },
    );
  };

  const footer = el(
    'div',
    { class: 'layers-footer' },
    el('button', { class: 'icon-btn', title: '添加图层样式', onclick: () => runCommand('layer.style') }, el('span', { class: 'fx-text' }, 'fx')),
    el('button', { class: 'icon-btn', title: '创建调整', onclick: addMenu }, icon('sliders-horizontal', 15)),
    el('button', { class: 'icon-btn', title: '载入图层选区', onclick: () => runCommand('select.layerPixels') }, icon('square-dashed', 15)),
    el('div', { class: 'spacer' }),
    el('button', { class: 'icon-btn', title: '向下合并 (Ctrl+E)', onclick: () => runCommand('layer.mergeDown') }, icon('merge', 15)),
    el('button', { class: 'icon-btn', title: '复制图层 (Ctrl+J)', onclick: () => runCommand('layer.duplicate') }, icon('copy', 15)),
    el('button', { class: 'icon-btn', title: '创建新图层', onclick: () => runCommand('layer.new') }, icon('square-plus', 15)),
    el('button', { class: 'icon-btn', title: '删除图层', onclick: () => runCommand('layer.delete') }, icon('trash-2', 15)),
  );

  return {
    el: el(
      'div',
      { class: 'layers-panel' },
      el(
        'div',
        { class: 'layers-controls' },
        blend,
        el('div', { class: 'layers-opacity' }, el('span', { class: 'opt-label' }, '不透明度'), el('div', { class: 'opt-number-wrap' }, opacity, el('span', { class: 'opt-unit' }, '%'))),
      ),
      el('div', { class: 'layers-controls second' }, el('span', { class: 'opt-label' }, '锁定:'), lockBtn, opSlider),
      list,
      footer,
    ),
  };
}
