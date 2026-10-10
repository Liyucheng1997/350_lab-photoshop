import { el } from '../../core/utils.js';
import { ADJUSTMENT_PANEL, FILTERS } from '../../filters/defs.js';
import { runCommand } from '../../commands.js';
import { icon } from '../icons.js';

export function createAdjustPanel() {
  const grid = el(
    'div',
    { class: 'adjust-grid' },
    ADJUSTMENT_PANEL.map((id) =>
      el('button', { class: 'adjust-btn', title: FILTERS[id].name, onclick: () => runCommand(`filter.${id}`) }, icon(FILTERS[id].icon, 18), el('span', {}, FILTERS[id].name)),
    ),
  );
  return { el: el('div', {}, el('div', { class: 'panel-subtitle' }, '添加调整（作用于当前图层 / 选区）'), grid) };
}
