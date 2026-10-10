// Left tool column with grouped flyouts and foreground/background colour swatches.
import { app } from '../core/app.js';
import { el } from '../core/utils.js';
import { TOOL_GROUPS, currentInGroup } from '../tools/index.js';
import { openMenu } from './menu.js';
import { icon } from './icons.js';
import { pickColor } from './colorpicker.js';

export function createToolbar() {
  const bar = el('div', { class: 'toolbar' });
  const slots = [];

  for (const group of TOOL_GROUPS) {
    if (group === '-') {
      bar.append(el('div', { class: 'toolbar-sep' }));
      continue;
    }
    const btn = el('button', { class: `tool-btn${group.length > 1 ? ' has-group' : ''}` });
    const render = () => {
      const t = group.includes(app.tool) ? app.tool : currentInGroup(group);
      btn.replaceChildren(...[icon(t.icon, 18), group.length > 1 && el('span', { class: 'tool-corner' })].filter(Boolean));
      btn.title = `${t.name} (${t.key})`;
      btn.dataset.tool = t.id;
      btn.classList.toggle('active', group.includes(app.tool));
    };
    const flyout = () => {
      const r = btn.getBoundingClientRect();
      openMenu(
        group.map((t) => ({
          label: t.name,
          icon: t.icon,
          shortcut: t.key,
          checked: () => false,
          run: () => app.setTool(t.id),
        })),
        { x: r.right + 4, y: r.top },
      );
    };
    let holdTimer = 0;
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || group.length < 2) return;
      holdTimer = setTimeout(() => {
        holdTimer = -1;
        flyout();
      }, 380);
    });
    btn.addEventListener('pointerup', () => clearTimeout(holdTimer));
    btn.addEventListener('pointerleave', () => holdTimer > 0 && clearTimeout(holdTimer));
    btn.addEventListener('click', () => {
      if (holdTimer === -1) {
        holdTimer = 0;
        return;
      }
      app.setTool(btn.dataset.tool);
    });
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (group.length > 1) flyout();
    });
    slots.push(render);
    bar.append(btn);
  }

  // colour swatches
  const fgSw = el('button', { class: 'swatch swatch-fg', title: '设置前景色' });
  const bgSw = el('button', { class: 'swatch swatch-bg', title: '设置背景色' });
  fgSw.addEventListener('click', async () => {
    const c = await pickColor(app.fg, { title: '拾色器（前景色）' });
    if (c) {
      app.setFg(c);
      app.pushRecentColor(c);
    }
  });
  bgSw.addEventListener('click', async () => {
    const c = await pickColor(app.bg, { title: '拾色器（背景色）' });
    if (c) {
      app.setBg(c);
      app.pushRecentColor(c);
    }
  });
  const colors = el(
    'div',
    { class: 'tool-colors' },
    bgSw,
    fgSw,
    el('button', { class: 'swatch-mini swap', title: '切换前景色和背景色 (X)', onclick: () => app.swapColors() }, icon('arrow-left-right', 11, 2)),
    el('button', { class: 'swatch-mini reset', title: '默认前景色和背景色 (D)', onclick: () => app.resetColors() }, el('span', { class: 'mini-fg' }), el('span', { class: 'mini-bg' })),
  );
  bar.append(el('div', { class: 'toolbar-sep' }), colors);

  const paintColors = () => {
    fgSw.style.background = app.fg;
    bgSw.style.background = app.bg;
  };
  app.on('color', paintColors);
  paintColors();
  const renderAll = () => slots.forEach((r) => r());
  app.on('tool', renderAll);
  renderAll();
  return bar;
}
