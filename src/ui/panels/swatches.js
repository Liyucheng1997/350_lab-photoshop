import { app } from '../../core/app.js';
import { el } from '../../core/utils.js';
import { icon } from '../icons.js';
import { contextMenu } from '../menu.js';

const KEY = 'photostudio.swatches';
const DEFAULTS = [
  '#000000', '#3a3a3a', '#6b6b6b', '#9c9c9c', '#cfcfcf', '#ffffff',
  '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#30b0c7',
  '#007aff', '#5856d6', '#af52de', '#ff2d55', '#a2845e', '#8e8e93',
  '#7f1d1d', '#b45309', '#3f6212', '#065f46', '#1e3a8a', '#581c87',
  '#fecaca', '#fed7aa', '#fef08a', '#bbf7d0', '#bfdbfe', '#e9d5ff',
];

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [...DEFAULTS];
  } catch {
    return [...DEFAULTS];
  }
}

export function createSwatchesPanel() {
  let swatches = load();
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(swatches));
    } catch {
      /* ignore */
    }
  };
  const recent = el('div', { class: 'swatch-grid recent' });
  const grid = el('div', { class: 'swatch-grid' });
  const cell = (c, removable) =>
    el('button', {
      class: 'swatch-cell',
      style: { background: c },
      title: `${c.toUpperCase()}\n单击：设为前景色　Alt+单击：设为背景色`,
      onclick: (e) => (e.altKey ? app.setBg(c) : app.setFg(c)),
      oncontextmenu: removable
        ? (e) =>
            contextMenu(e, [
              { label: '设为前景色', run: () => app.setFg(c) },
              { label: '设为背景色', run: () => app.setBg(c) },
              '-',
              { label: '删除色板', icon: 'trash-2', run: () => {
                swatches = swatches.filter((x) => x !== c);
                save();
                render();
              } },
            ])
        : (e) => e.preventDefault(),
    });
  const render = () => {
    recent.replaceChildren(...(app.recentColors.length ? app.recentColors.map((c) => cell(c)) : [el('span', { class: 'muted small' }, '最近使用的颜色会显示在这里')]));
    grid.replaceChildren(
      ...swatches.map((c) => cell(c, true)),
      el('button', { class: 'swatch-cell add', title: '用前景色创建新色板', onclick: () => {
        if (!swatches.includes(app.fg)) swatches.push(app.fg);
        save();
        render();
      } }, icon('plus', 14)),
    );
  };
  app.on('recent-colors', render);
  render();
  return {
    el: el('div', { class: 'swatches' }, el('div', { class: 'panel-subtitle' }, '最近使用'), recent, el('div', { class: 'panel-subtitle' }, '色板'), grid),
  };
}
