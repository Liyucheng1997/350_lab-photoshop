// Application dialogs: image/canvas size, fill, stroke, layer properties & style, selection modify, help.
import { app } from '../core/app.js';
import { el, createCanvas } from '../core/utils.js';
import { BLEND_MODES } from '../core/compositor.js';
import { DEFAULT_EFFECTS } from '../core/layer.js';
import { expandMask, contractMask, featherMask, borderMask, makeSelection } from '../core/selection.js';
import { resizeImage, resizeCanvas, fillWith } from '../core/docops.js';
import { drawClipped } from '../tools/helpers.js';
import { openDialog, formRow, numberInput, selectInput, checkbox, rangeRow, promptDialog } from './dialog.js';
import { pickColor } from './colorpicker.js';
import { icon } from './icons.js';

const blendOptions = () => BLEND_MODES.map((m) => (m ? [m[0], m[1]] : '-'));

function colorButton(value, onChange) {
  const b = el('button', { class: 'color-swatch-btn', style: { background: value } });
  b.addEventListener('click', async () => {
    const c = await pickColor(value);
    if (c) {
      value = c;
      b.style.background = c;
      onChange(c);
    }
  });
  return b;
}

/* ----------------------------------------------------------- image size */

export function imageSizeDialog() {
  const doc = app.doc;
  if (!doc) return;
  const s = { w: doc.width, h: doc.height, link: true, method: 'smooth' };
  const ratio = doc.width / doc.height;
  const pct = el('div', { class: 'form-hint' });
  const wIn = numberInput({ value: s.w, min: 1, max: 16000, width: 100, onInput: (v) => {
    s.w = Math.round(v);
    if (s.link) {
      s.h = Math.max(1, Math.round(s.w / ratio));
      hIn.value = s.h;
    }
    info();
  } });
  const hIn = numberInput({ value: s.h, min: 1, max: 16000, width: 100, onInput: (v) => {
    s.h = Math.round(v);
    if (s.link) {
      s.w = Math.max(1, Math.round(s.h * ratio));
      wIn.value = s.w;
    }
    info();
  } });
  const linkBtn = el('button', { class: 'icon-btn link-btn active', title: '约束比例', onclick: () => {
    s.link = !s.link;
    linkBtn.classList.toggle('active', s.link);
    linkBtn.replaceChildren(icon(s.link ? 'link' : 'unlink', 15));
  } }, icon('link', 15));
  const info = () => {
    pct.textContent = `原始：${doc.width} × ${doc.height} 像素　→　${Math.round((s.w / doc.width) * 100)}% × ${Math.round((s.h / doc.height) * 100)}%`;
  };
  info();
  const body = el(
    'div',
    { class: 'size-dialog' },
    el('div', { class: 'link-group' }, el('div', {}, formRow('宽度', wIn, el('span', { class: 'unit' }, '像素')), formRow('高度', hIn, el('span', { class: 'unit' }, '像素'))), linkBtn),
    formRow('重新采样', selectInput([['smooth', '两次立方（平滑渐变）'], ['nearest', '邻近（硬边缘）']], s.method, (v) => (s.method = v))),
    pct,
  );
  openDialog({ title: '图像大小', body, width: 440, onOk: () => {
    if (s.w === doc.width && s.h === doc.height) return;
    resizeImage(s.w, s.h, s.method);
  } });
}

/* ---------------------------------------------------------- canvas size */

export function canvasSizeDialog() {
  const doc = app.doc;
  if (!doc) return;
  const s = { w: doc.width, h: doc.height, anchor: [0.5, 0.5], fill: 'bg' };
  const grid = el('div', { class: 'anchor-grid' });
  const cells = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const c = el('button', { class: 'anchor-cell', onclick: () => {
        s.anchor = [x / 2, y / 2];
        paint();
      } });
      c._pos = [x / 2, y / 2];
      cells.push(c);
      grid.append(c);
    }
  }
  const paint = () => cells.forEach((c) => c.classList.toggle('active', c._pos[0] === s.anchor[0] && c._pos[1] === s.anchor[1]));
  paint();
  const body = el(
    'div',
    { class: 'size-dialog' },
    el('div', { class: 'form-hint' }, `当前大小：${doc.width} × ${doc.height} 像素`),
    formRow('宽度', numberInput({ value: s.w, min: 1, max: 16000, width: 100, onInput: (v) => (s.w = Math.round(v)) }), el('span', { class: 'unit' }, '像素')),
    formRow('高度', numberInput({ value: s.h, min: 1, max: 16000, width: 100, onInput: (v) => (s.h = Math.round(v)) }), el('span', { class: 'unit' }, '像素')),
    formRow('定位', grid),
    formRow('画布扩展颜色', selectInput([['bg', '背景'], ['fg', '前景'], ['white', '白色'], ['black', '黑色'], ['transparent', '透明']], s.fill, (v) => (s.fill = v))),
  );
  openDialog({ title: '画布大小', body, width: 420, onOk: () => {
    if (s.w === doc.width && s.h === doc.height) return;
    const fill = { bg: app.bg, fg: app.fg, white: '#ffffff', black: '#000000', transparent: null }[s.fill];
    resizeCanvas(s.w, s.h, s.anchor, fill);
  } });
}

/* ----------------------------------------------------------------- fill */

export function fillDialog() {
  if (!app.doc) return;
  const s = { content: 'fg', color: app.fg, mode: 'normal', opacity: 100 };
  const colorRow = formRow('自定颜色', colorButton(s.color, (c) => (s.color = c)));
  colorRow.style.display = 'none';
  const body = el(
    'div',
    {},
    el('div', { class: 'section-title' }, '内容'),
    formRow('内容', selectInput([['fg', '前景色'], ['bg', '背景色'], ['color', '颜色…'], '-', ['black', '黑色'], ['gray', '50% 灰色'], ['white', '白色']], s.content, (v) => {
      s.content = v;
      colorRow.style.display = v === 'color' ? '' : 'none';
    })),
    colorRow,
    el('div', { class: 'section-title' }, '混合'),
    formRow('模式', selectInput(blendOptions(), s.mode, (v) => (s.mode = v))),
    rangeRow({ label: '不透明度', min: 1, max: 100, value: 100, unit: '%', onInput: (v) => (s.opacity = v) }).el,
  );
  openDialog({ title: '填充', body, width: 380, onOk: () => {
    const color = { fg: app.fg, bg: app.bg, color: s.color, black: '#000000', gray: '#808080', white: '#ffffff' }[s.content];
    fillWith(color, { opacity: s.opacity / 100, mode: s.mode });
  } });
}

/* --------------------------------------------------------------- stroke */

export function strokeDialog() {
  const doc = app.doc;
  if (!doc) return;
  if (!doc.selection) return app.toast('描边需要先建立选区');
  const s = { width: 4, color: app.fg, location: 'center', opacity: 100 };
  const body = el(
    'div',
    {},
    formRow('宽度', numberInput({ value: s.width, min: 1, max: 250, onInput: (v) => (s.width = v) }), el('span', { class: 'unit' }, '像素')),
    formRow('颜色', colorButton(s.color, (c) => (s.color = c))),
    formRow('位置', selectInput([['inside', '内部'], ['center', '居中'], ['outside', '居外']], s.location, (v) => (s.location = v))),
    rangeRow({ label: '不透明度', min: 1, max: 100, value: 100, unit: '%', onInput: (v) => (s.opacity = v) }).el,
  );
  openDialog({ title: '描边', body, width: 380, onOk: async () => {
    const layer = await app.paintableLayer({ action: '描边' });
    if (!layer) return;
    const mask = doc.selection.mask;
    let ring;
    if (s.location === 'center') ring = borderMask(mask, s.width);
    else if (s.location === 'inside') {
      ring = createCanvas(doc.width, doc.height);
      const g = ring.getContext('2d');
      g.drawImage(mask, 0, 0);
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(contractMask(mask, s.width), 0, 0);
    } else {
      ring = expandMask(mask, s.width);
      const g = ring.getContext('2d');
      g.globalCompositeOperation = 'destination-out';
      g.drawImage(mask, 0, 0);
    }
    const g = ring.getContext('2d');
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = s.color;
    g.fillRect(0, 0, doc.width, doc.height);
    layer.edit();
    const saved = doc.selection;
    doc.selection = null; // the stroke may extend outside the selection
    drawClipped(layer.canvas, ring, { opacity: s.opacity / 100 });
    doc.selection = saved;
    app.commit('描边', 'square');
  } });
}

/* ----------------------------------------------------- layer properties */

export function layerPropertiesDialog(layer = app.doc?.activeLayer) {
  if (!layer) return;
  const before = { name: layer.name, opacity: layer.opacity, blendMode: layer.blendMode };
  const nameIn = el('input', { class: 'input', value: layer.name, oninput: (e) => {
    layer.name = e.target.value;
    app.emit('layers');
  } });
  const body = el(
    'div',
    {},
    formRow('名称', nameIn),
    formRow('混合模式', selectInput(blendOptions(), layer.blendMode, (v) => {
      layer.blendMode = v;
      app.changed();
    })),
    rangeRow({ label: '不透明度', min: 0, max: 100, value: Math.round(layer.opacity * 100), unit: '%', onInput: (v) => {
      layer.opacity = v / 100;
      app.changed();
    } }).el,
  );
  openDialog({ title: '图层属性', body, width: 400, onOk: () => {
    layer.name = layer.name.trim() || before.name;
    app.commit('图层属性', 'sliders-horizontal');
  }, onCancel: () => {
    Object.assign(layer, before);
    app.changed();
  } });
}

export async function renameLayer(layer) {
  const name = await promptDialog({ title: '重命名图层', label: '名称', value: layer.name });
  if (name && name.trim() && name !== layer.name) {
    layer.name = name.trim();
    app.commit('重命名图层', 'pencil');
  }
}

/* ---------------------------------------------------------- layer style */

export function layerStyleDialog(layer = app.doc?.activeLayer, focus = 'shadow') {
  if (!layer) return;
  const before = layer.effects ? structuredClone(layer.effects) : null;
  const fx = structuredClone({ ...DEFAULT_EFFECTS, ...(layer.effects || {}) });
  for (const k of Object.keys(DEFAULT_EFFECTS)) fx[k] = { ...DEFAULT_EFFECTS[k], ...(fx[k] || {}) };
  layer.effects = fx;
  const live = () => app.changed();

  const sections = {
    shadow: {
      name: '投影',
      build: () => [
        formRow('颜色', colorButton(fx.shadow.color, (c) => ((fx.shadow.color = c), live()))),
        rangeRow({ label: '不透明度', min: 0, max: 100, value: Math.round(fx.shadow.opacity * 100), unit: '%', onInput: (v) => ((fx.shadow.opacity = v / 100), live()) }).el,
        rangeRow({ label: '角度', min: -180, max: 180, value: fx.shadow.angle, unit: '°', onInput: (v) => ((fx.shadow.angle = v), live()) }).el,
        rangeRow({ label: '距离', min: 0, max: 200, value: fx.shadow.distance, unit: '像素', onInput: (v) => ((fx.shadow.distance = v), live()) }).el,
        rangeRow({ label: '大小', min: 0, max: 150, value: fx.shadow.size, unit: '像素', onInput: (v) => ((fx.shadow.size = v), live()) }).el,
      ],
    },
    glow: {
      name: '外发光',
      build: () => [
        formRow('颜色', colorButton(fx.glow.color, (c) => ((fx.glow.color = c), live()))),
        rangeRow({ label: '不透明度', min: 0, max: 100, value: Math.round(fx.glow.opacity * 100), unit: '%', onInput: (v) => ((fx.glow.opacity = v / 100), live()) }).el,
        rangeRow({ label: '大小', min: 1, max: 150, value: fx.glow.size, unit: '像素', onInput: (v) => ((fx.glow.size = v), live()) }).el,
      ],
    },
    stroke: {
      name: '描边',
      build: () => [
        formRow('颜色', colorButton(fx.stroke.color, (c) => ((fx.stroke.color = c), live()))),
        rangeRow({ label: '大小', min: 1, max: 50, value: fx.stroke.size, unit: '像素', onInput: (v) => ((fx.stroke.size = v), live()) }).el,
      ],
    },
  };

  const pane = el('div', { class: 'style-pane' });
  const nav = el('div', { class: 'style-nav' });
  let current = focus;
  const show = (key) => {
    current = key;
    nav.querySelectorAll('.style-nav-item').forEach((n) => n.classList.toggle('active', n.dataset.key === key));
    pane.replaceChildren(el('div', { class: 'section-title' }, sections[key].name), ...sections[key].build());
  };
  for (const [key, sec] of Object.entries(sections)) {
    const cb = el('input', { type: 'checkbox', checked: fx[key].enabled });
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => {
      fx[key].enabled = cb.checked;
      live();
    });
    nav.append(
      el('div', { class: 'style-nav-item', dataset: { key }, onclick: () => {
        if (!fx[key].enabled) {
          fx[key].enabled = true;
          cb.checked = true;
          live();
        }
        show(key);
      } }, el('label', { class: 'checkbox' }, cb, el('span', { class: 'checkbox-box' }, icon('check', 11, 3))), el('span', {}, sec.name)),
    );
  }
  show(current);
  live();
  openDialog({
    title: `图层样式 — ${layer.name}`,
    body: el('div', { class: 'style-dialog' }, nav, pane),
    width: 560,
    onOk: () => {
      if (!layer.hasEffects) layer.effects = null;
      app.commit('图层样式', 'sparkles');
    },
    onCancel: () => {
      layer.effects = before;
      app.changed();
    },
  });
}

/* ----------------------------------------------------- selection modify */

export async function modifySelection(kind) {
  const doc = app.doc;
  if (!doc?.selection) return app.toast('没有选区');
  const titles = { expand: ['扩展选区', '扩展量'], contract: ['收缩选区', '收缩量'], feather: ['羽化选区', '羽化半径'], border: ['边界选区', '宽度'] };
  const [title, label] = titles[kind];
  let value = kind === 'feather' ? 5 : 4;
  const ok = await openDialog({
    title,
    width: 340,
    body: formRow(label, numberInput({ value, min: kind === 'feather' ? 0.1 : 1, max: 500, step: kind === 'feather' ? 0.1 : 1, onInput: (v) => (value = v) }), el('span', { class: 'unit' }, '像素')),
  }).result;
  if (!ok) return;
  const m = doc.selection.mask;
  const out = kind === 'expand' ? expandMask(m, value) : kind === 'contract' ? contractMask(m, value) : kind === 'feather' ? featherMask(m, value) : borderMask(m, value);
  doc.setSelection(makeSelection(out));
  app.commit(title, 'square-dashed');
}

/* ----------------------------------------------------------------- help */

const SHORTCUTS = [
  ['工具', [
    ['V', '移动工具'], ['M', '选框工具'], ['L', '套索工具'], ['W', '魔棒工具'], ['C', '裁剪工具'], ['I', '吸管工具'],
    ['B', '画笔 / 铅笔'], ['S', '仿制图章'], ['E', '橡皮擦'], ['G', '渐变 / 油漆桶'], ['T', '文字工具'], ['U', '形状工具'],
    ['H', '抓手工具'], ['Z', '缩放工具'], ['Shift + 字母', '切换同组工具'], ['空格（按住）', '临时抓手'],
  ]],
  ['绘画', [
    ['[ / ]', '减小 / 增大画笔'], ['Shift + [ / ]', '减小 / 增大硬度'], ['1 … 0', '设置工具不透明度'], ['X', '交换前景/背景色'], ['D', '默认颜色'],
    ['Alt（画笔）', '临时吸管'], ['Shift + 单击', '绘制直线'],
  ]],
  ['编辑', [
    ['Ctrl + Z', '还原'], ['Ctrl + Shift + Z', '重做'], ['Ctrl + X / C / V', '剪切 / 拷贝 / 粘贴'], ['Ctrl + Shift + C', '合并拷贝'],
    ['Delete', '清除选区内容'], ['Alt + Delete', '填充前景色'], ['Ctrl + Delete', '填充背景色'], ['Ctrl + T', '自由变换'], ['Enter / Esc', '提交 / 取消变换'],
  ]],
  ['图层与选区', [
    ['Ctrl + Shift + Alt + N', '新建图层'], ['Ctrl + J', '复制图层 / 通过拷贝的图层'], ['Ctrl + E', '向下合并'], ['Ctrl + Shift + E', '合并可见图层'],
    ['Ctrl + ] / [', '图层前移 / 后移'], ['Ctrl + A', '全选'], ['Ctrl + D', '取消选择'], ['Ctrl + Shift + I', '反选'], ['Ctrl + 单击缩览图', '载入图层选区'],
  ]],
  ['视图与调整', [
    ['Ctrl + + / -', '放大 / 缩小'], ['Ctrl + 0', '按屏幕大小缩放'], ['Ctrl + 1', '100%'], ['Ctrl + 滚轮 / Alt + 滚轮', '缩放'], ['Ctrl + R', '标尺'], ['Tab', '隐藏面板'],
    ['Ctrl + L', '色阶'], ['Ctrl + U', '色相/饱和度'], ['Ctrl + I', '反相'], ['Ctrl + Shift + U', '去色'], ['Ctrl + Alt + F', '重复上次滤镜'],
  ]],
];

export function shortcutsDialog() {
  const body = el(
    'div',
    { class: 'shortcuts' },
    SHORTCUTS.map(([group, items]) =>
      el('div', { class: 'shortcut-group' }, el('div', { class: 'section-title' }, group), items.map(([k, d]) => el('div', { class: 'shortcut-row' }, el('span', {}, d), el('kbd', {}, k)))),
    ),
    el('p', { class: 'form-hint' }, '提示：浏览器会占用部分快捷键（如 Ctrl+N / Ctrl+T / Ctrl+W），可通过菜单或工具选项栏使用对应功能。'),
  );
  openDialog({ title: '键盘快捷键', body, width: 820, buttons: [{ label: '关闭', value: true, primary: true }] });
}

export function aboutDialog() {
  openDialog({
    title: '关于 PhotoStudio',
    width: 420,
    body: el(
      'div',
      { class: 'about' },
      el('div', { class: 'about-logo' }, 'Ps'),
      el('h2', {}, 'PhotoStudio Web'),
      el('p', {}, '一个运行在浏览器中的图像编辑器：图层、混合模式、图层样式、选区、画笔、仿制图章、渐变、文字、形状、自由变换、调整与滤镜、无限画布缩放……'),
      el('p', { class: 'form-hint' }, '所有处理都在本地浏览器中完成，图像不会上传到任何服务器。'),
    ),
    buttons: [{ label: '好', value: true, primary: true }],
  });
}
