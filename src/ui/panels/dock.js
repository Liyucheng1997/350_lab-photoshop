// Right-hand panel dock: tabbed, collapsible panel groups (like Photoshop's Essentials workspace).
import { el } from '../../core/utils.js';
import { icon } from '../icons.js';
import { createColorPanel } from './color.js';
import { createSwatchesPanel } from './swatches.js';
import { createAdjustPanel } from './adjust.js';
import { createNavigatorPanel } from './navigator.js';
import { createInfoPanel } from './info.js';
import { createHistoryPanel } from './history.js';
import { createLayersPanel } from './layers.js';

export const PANEL_LIST = [
  { id: 'color', title: '颜色', icon: 'palette', group: 0, create: createColorPanel },
  { id: 'swatches', title: '色板', icon: 'swatch-book', group: 0, create: createSwatchesPanel },
  { id: 'adjust', title: '调整', icon: 'sliders-horizontal', group: 1, create: createAdjustPanel },
  { id: 'navigator', title: '导航器', icon: 'compass', group: 1, create: createNavigatorPanel },
  { id: 'history', title: '历史记录', icon: 'history', group: 1, create: createHistoryPanel },
  { id: 'info', title: '信息', icon: 'info', group: 1, create: createInfoPanel },
  { id: 'layers', title: '图层', icon: 'layers', group: 2, create: createLayersPanel },
];

const KEY = 'photostudio.dock';
const DEFAULT_STATE = { hidden: [], active: { 0: 'color', 1: 'adjust', 2: 'layers' }, collapsed: {} };
let state = loadState();
const groups = [];
const panels = {};

function loadState() {
  try {
    return { ...structuredClone(DEFAULT_STATE), ...JSON.parse(localStorage.getItem(KEY)) };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function panelVisible(id) {
  return !state.hidden.includes(id);
}

export function togglePanel(id) {
  if (panelVisible(id)) state.hidden.push(id);
  else {
    state.hidden = state.hidden.filter((x) => x !== id);
    const p = PANEL_LIST.find((x) => x.id === id);
    state.active[p.group] = id;
    state.collapsed[p.group] = false;
  }
  save();
  renderAll();
}

export function resetWorkspace() {
  state = structuredClone(DEFAULT_STATE);
  save();
  renderAll();
}

function renderGroup(gi) {
  const g = groups[gi];
  const visible = PANEL_LIST.filter((p) => p.group === gi && panelVisible(p.id));
  g.root.style.display = visible.length ? '' : 'none';
  if (!visible.length) return;
  if (!visible.some((p) => p.id === state.active[gi])) state.active[gi] = visible[0].id;
  const collapsed = !!state.collapsed[gi];
  g.root.classList.toggle('collapsed', collapsed);
  g.tabs.replaceChildren(
    ...visible.map((p) =>
      el('button', {
        class: `panel-tab${p.id === state.active[gi] ? ' active' : ''}`,
        onclick: () => {
          if (p.id === state.active[gi]) state.collapsed[gi] = !state.collapsed[gi];
          else {
            state.active[gi] = p.id;
            state.collapsed[gi] = false;
          }
          save();
          renderGroup(gi);
        },
      }, p.title),
    ),
  );
  g.toggle.replaceChildren(icon(collapsed ? 'chevron-down' : 'chevron-up', 14));
  for (const p of PANEL_LIST.filter((x) => x.group === gi)) {
    const inst = panels[p.id];
    const show = p.id === state.active[gi] && panelVisible(p.id);
    inst.el.style.display = show ? '' : 'none';
    if (show && !collapsed) inst.onShow?.();
  }
}

function renderAll() {
  groups.forEach((_, i) => renderGroup(i));
}

export function createDock() {
  const dock = el('div', { class: 'dock' });
  for (let gi = 0; gi < 3; gi++) {
    const tabs = el('div', { class: 'panel-tabs' });
    const toggle = el('button', { class: 'panel-collapse', title: '折叠/展开', onclick: () => {
      state.collapsed[gi] = !state.collapsed[gi];
      save();
      renderGroup(gi);
    } });
    const body = el('div', { class: 'panel-body' });
    const root = el('section', { class: `panel-group group-${gi}` }, el('header', { class: 'panel-header' }, tabs, toggle), body);
    groups.push({ root, tabs, toggle, body });
    for (const p of PANEL_LIST.filter((x) => x.group === gi)) {
      const inst = p.create();
      inst.el.classList.add('panel', `panel-${p.id}`);
      panels[p.id] = inst;
      body.append(inst.el);
    }
    dock.append(root);
  }
  renderAll();
  return dock;
}
