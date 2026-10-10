// Dropdown / context menus with submenus.
import { el } from '../core/utils.js';
import { icon } from './icons.js';

let openStack = [];
let outsideHandler = null;

const resolve = (v) => (typeof v === 'function' ? v() : v);

function buildList(items, depth, close) {
  const list = el('div', { class: 'menu', role: 'menu' });
  let subTimer = 0;
  for (const item of items) {
    if (!item) continue;
    if (item === '-') {
      list.append(el('div', { class: 'menu-sep' }));
      continue;
    }
    if (resolve(item.hidden)) continue;
    const enabled = item.enabled === undefined ? true : !!resolve(item.enabled);
    const checked = resolve(item.checked);
    const row = el(
      'div',
      { class: `menu-item${enabled ? '' : ' disabled'}${item.submenu ? ' has-sub' : ''}`, role: 'menuitem' },
      el('span', { class: 'menu-check' }, checked ? icon('check', 13, 2.2) : item.icon ? icon(item.icon, 14) : null),
      el('span', { class: 'menu-label' }, resolve(item.label)),
      item.submenu ? el('span', { class: 'menu-arrow' }, icon('chevron-right', 13)) : el('span', { class: 'menu-shortcut' }, item.shortcut || ''),
    );
    if (item.swatch) row.querySelector('.menu-check').append(el('span', { class: 'menu-swatch', style: { background: resolve(item.swatch) } }));
    row.addEventListener('pointerenter', () => {
      clearTimeout(subTimer);
      list.querySelectorAll(':scope > .menu-item.open').forEach((r) => r !== row && r.classList.remove('open'));
      closeFrom(depth + 1);
      if (item.submenu && enabled) {
        subTimer = setTimeout(() => {
          row.classList.add('open');
          const r = row.getBoundingClientRect();
          const sub = resolve(item.submenu);
          showList(sub, { x: r.right - 2, y: r.top - 5, depth: depth + 1, flipX: r.left }, close);
        }, 60);
      }
    });
    row.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!enabled || item.submenu) return;
      close();
      item.run?.();
    });
    list.append(row);
  }
  return list;
}

function closeFrom(depth) {
  while (openStack.length > depth) openStack.pop().remove();
}

function showList(items, { x, y, depth = 0, flipX = null, minWidth = 0 }, close) {
  const list = buildList(items, depth, close);
  list.style.minWidth = `${minWidth}px`;
  document.body.append(list);
  const r = list.getBoundingClientRect();
  let left = x, top = y;
  if (left + r.width > window.innerWidth - 4) left = flipX != null ? flipX - r.width + 2 : window.innerWidth - r.width - 4;
  if (top + r.height > window.innerHeight - 4) top = Math.max(4, window.innerHeight - r.height - 4);
  list.style.left = `${Math.max(4, left)}px`;
  list.style.top = `${Math.max(4, top)}px`;
  openStack.push(list);
  return list;
}

export function closeMenus() {
  closeFrom(0);
  if (outsideHandler) {
    document.removeEventListener('pointerdown', outsideHandler, true);
    window.removeEventListener('blur', outsideHandler);
    document.removeEventListener('keydown', escHandler, true);
    outsideHandler = null;
  }
  const cb = onCloseCb;
  onCloseCb = null;
  cb?.();
}

let onCloseCb = null;
function escHandler(e) {
  if (e.key === 'Escape') {
    e.stopPropagation();
    closeMenus();
  }
}

/** Opens a menu at (x,y). Returns a close function. */
export function openMenu(items, { x, y, minWidth = 0, onClose = null, keepOpenOn = null } = {}) {
  closeMenus();
  onCloseCb = onClose;
  showList(items, { x, y, minWidth }, closeMenus);
  outsideHandler = (e) => {
    if (e.type === 'blur') return closeMenus();
    if (openStack.some((m) => m.contains(e.target))) return;
    if (keepOpenOn && keepOpenOn.contains(e.target)) return;
    closeMenus();
  };
  setTimeout(() => {
    document.addEventListener('pointerdown', outsideHandler, true);
    window.addEventListener('blur', outsideHandler);
  });
  document.addEventListener('keydown', escHandler, true);
  return closeMenus;
}

export function isMenuOpen() {
  return openStack.length > 0;
}

export function contextMenu(e, items) {
  e.preventDefault();
  e.stopPropagation();
  openMenu(items, { x: e.clientX, y: e.clientY });
}
