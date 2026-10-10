// Application menu bar.
import { app } from '../core/app.js';
import { el } from '../core/utils.js';
import { commands, runCommand, shortcutLabel } from '../commands.js';
import { openMenu, closeMenus, isMenuOpen } from './menu.js';
import { icon } from './icons.js';
import { togglePanel, panelVisible, resetWorkspace, PANEL_LIST } from './panels/dock.js';

const c = (id, extra = {}) => ({ cmd: id, ...extra });

const MENUS = [
  ['文件', [
    c('file.new'), c('file.open'), '-', c('file.place'), '-', c('file.close'), c('file.closeAll'), '-',
    c('file.save'), c('file.export'), { label: '快速导出', submenu: [c('file.quickPng'), c('file.quickJpg')] },
  ]],
  ['编辑', [
    c('edit.undo'), c('edit.redo'), '-', c('edit.cut'), c('edit.copy'), c('edit.copyMerged'),
    { ...c('edit.paste'), shortcut: 'Ctrl+V' }, c('edit.clear'), '-', c('edit.fill'), c('edit.stroke'), '-',
    c('edit.freeTransform'),
    { label: '变换', submenu: [c('edit.rotate180'), c('edit.rotate90'), c('edit.rotate-90'), '-', c('edit.flipH'), c('edit.flipV')] },
    '-', c('help.shortcuts'),
  ]],
  ['图像', [
    { label: '调整', submenu: [
      c('filter.brightnessContrast'), c('filter.levels'), c('filter.exposure'), '-',
      c('filter.vibrance'), c('filter.hueSaturation'), c('filter.colorBalance'), c('filter.blackWhite'), c('filter.photoFilter'), '-',
      c('filter.invert'), c('filter.posterize'), c('filter.threshold'), c('filter.gradientMap'), '-',
      c('filter.desaturate'), c('filter.sepia'),
    ] },
    '-', c('filter.autoTone'), c('filter.autoContrast'), '-',
    c('image.size'), c('image.canvasSize'),
    { label: '图像旋转', submenu: [c('image.rotate180'), c('image.rotateCw'), c('image.rotateCcw'), '-', c('image.flipH'), c('image.flipV')] },
    c('image.crop'), c('image.trim'),
  ]],
  ['图层', [
    c('layer.new'), c('layer.duplicate'), c('layer.viaCut'), c('layer.delete'), '-',
    c('layer.properties'), c('layer.style'), c('layer.clearStyle'), '-', c('layer.rasterize'), c('layer.lock'), '-',
    { label: '排列', submenu: [c('layer.front'), c('layer.forward'), c('layer.backward'), c('layer.back')] },
    '-', c('layer.mergeDown'), c('layer.mergeVisible'), c('layer.flatten'),
  ]],
  ['选择', [
    c('select.all'), c('select.none'), c('select.reselect'), c('select.inverse'), '-',
    c('select.layerPixels'),
    { label: '修改', submenu: [c('select.border'), c('select.expand'), c('select.contract'), c('select.feather')] },
  ]],
  ['滤镜', [
    c('filter.last'), '-',
    { label: '模糊', submenu: [c('filter.gaussianBlur'), c('filter.motionBlur'), c('filter.radialBlur')] },
    { label: '锐化', submenu: [c('filter.sharpen'), c('filter.sharpenMore'), c('filter.unsharpMask')] },
    { label: '杂色', submenu: [c('filter.addNoise')] },
    { label: '像素化', submenu: [c('filter.pixelate')] },
    { label: '风格化', submenu: [c('filter.emboss'), c('filter.findEdges')] },
    { label: '渲染', submenu: [c('filter.vignette')] },
    { label: '其它', submenu: [c('filter.highPass')] },
  ]],
  ['视图', [
    c('view.zoomIn'), c('view.zoomOut'), c('view.fit'), c('view.actual'), c('view.fill'), '-',
    c('view.rulers'), c('view.pixelGrid'), '-', c('view.togglePanels'),
  ]],
  ['窗口', () => [
    ...PANEL_LIST.map((p) => ({ label: p.title, checked: () => panelVisible(p.id), run: () => togglePanel(p.id) })),
    '-',
    { label: '复位基本功能', run: resetWorkspace },
  ]],
  ['帮助', [c('help.shortcuts'), '-', c('help.about')]],
];

function toItems(list) {
  return (typeof list === 'function' ? list() : list).map((it) => {
    if (it === '-') return it;
    if (it.cmd) {
      const cm = commands[it.cmd];
      if (!cm) return null;
      return {
        label: cm.label,
        icon: cm.icon,
        shortcut: it.shortcut || shortcutLabel(it.cmd),
        enabled: cm.enabled || true,
        checked: cm.checked,
        run: () => runCommand(it.cmd),
      };
    }
    if (it.submenu) return { ...it, submenu: () => toItems(it.submenu) };
    return it;
  });
}

export function createMenubar() {
  const bar = el('div', { class: 'menubar' });
  const logo = el('div', { class: 'app-logo', title: 'PhotoStudio' }, 'Ps');
  bar.append(logo);
  let active = null;
  const titles = MENUS.map(([name, items]) => {
    const t = el('div', { class: 'menu-title' }, name);
    const open = () => {
      if (active === t) return;
      active?.classList.remove('open');
      active = t;
      t.classList.add('open');
      const r = t.getBoundingClientRect();
      openMenu(toItems(items), {
        x: r.left,
        y: r.bottom + 2,
        minWidth: 220,
        keepOpenOn: bar,
        onClose: () => {
          t.classList.remove('open');
          if (active === t) active = null;
        },
      });
    };
    t.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (active === t) closeMenus();
      else open();
    });
    t.addEventListener('pointerenter', () => {
      if (active && active !== t && isMenuOpen()) open();
    });
    return t;
  });
  bar.append(...titles);

  // quick actions on the right
  const undoBtn = el('button', { class: 'icon-btn', title: '还原 (Ctrl+Z)', onclick: () => runCommand('edit.undo') }, icon('undo-2', 16));
  const redoBtn = el('button', { class: 'icon-btn', title: '重做 (Ctrl+Shift+Z)', onclick: () => runCommand('edit.redo') }, icon('redo-2', 16));
  const refresh = () => {
    undoBtn.disabled = !commands['edit.undo'].enabled();
    redoBtn.disabled = !commands['edit.redo'].enabled();
  };
  app.on('history', refresh);
  app.on('doc', refresh);
  app.on('transform', refresh);
  refresh();
  bar.append(
    el('div', { class: 'spacer' }),
    el('div', { class: 'menubar-actions' }, undoBtn, redoBtn,
      el('div', { class: 'menubar-sep' }),
      el('button', { class: 'icon-btn', title: '键盘快捷键', onclick: () => runCommand('help.shortcuts') }, icon('keyboard', 16)),
      el('button', { class: 'btn btn-primary btn-sm', onclick: () => runCommand('file.export'), title: '导出为…' }, icon('share', 14), '导出'),
    ),
  );
  return bar;
}
