// Global keyboard handling: commands, tool shortcuts, brush size, opacity digits, space-to-pan.
import { app } from './core/app.js';
import { isTyping } from './core/utils.js';
import { isDialogOpen } from './ui/dialog.js';
import { isMenuOpen } from './ui/menu.js';
import { commandForCombo, runCommand, buildKeyIndex } from './commands.js';
import { toolForKey } from './tools/index.js';
import { nudge } from './tools/transform.js';

const CODE_MAP = {
  BracketLeft: '[', BracketRight: ']', Equal: '=', Minus: '-', NumpadAdd: '=', NumpadSubtract: '-',
  Escape: 'Esc', NumpadEnter: 'Enter', Quote: "'", Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
};

export function keyName(e) {
  const c = e.code || '';
  if (c.startsWith('Key')) return c.slice(3);
  if (c.startsWith('Digit')) return c.slice(5);
  if (/^Numpad\d$/.test(c)) return c.slice(6);
  return CODE_MAP[c] || c || e.key;
}

export function comboOf(e) {
  return [(e.ctrlKey || e.metaKey) && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', keyName(e)].filter(Boolean).join('+');
}

function stepSize(size, dir) {
  const step = size < 10 ? 1 : size < 50 ? 5 : size < 100 ? 10 : size < 300 ? 25 : 50;
  return Math.max(1, Math.min(1000, dir > 0 ? size + step : size - step));
}

function onKeyDown(e) {
  if (isDialogOpen() || isMenuOpen()) return;
  if (isTyping()) return;
  const key = keyName(e);
  const mod = e.ctrlKey || e.metaKey;

  if (key === 'Space' && !mod) {
    e.preventDefault();
    if (!e.repeat) app.viewport?.setSpace(true);
    return;
  }
  if (e.key === 'Alt') e.preventDefault();

  if (app.doc) {
    if (app.transform?.onKey?.(e)) return e.preventDefault();
    if (app.tool?.onKey?.(e)) return e.preventDefault();
  }

  const id = commandForCombo(comboOf(e));
  if (id) {
    e.preventDefault();
    runCommand(id);
    return;
  }
  if (mod || e.altKey) return;

  const tool = app.tool;
  const opts = tool?.options || {};
  if (/^[A-Z]$/.test(key)) {
    if (key === 'X') return app.swapColors();
    if (key === 'D') return app.resetColors();
    const t = toolForKey(key, e.shiftKey);
    if (t) {
      e.preventDefault();
      app.setTool(t.id);
    }
    return;
  }
  if (key === '[' || key === ']') {
    const dir = key === ']' ? 1 : -1;
    if (e.shiftKey && 'hardness' in opts) app.setToolOption('hardness', Math.max(0, Math.min(100, opts.hardness + dir * 25)));
    else if ('size' in opts && typeof opts.size === 'number' && tool.id !== 'eyedropper') app.setToolOption('size', stepSize(opts.size, dir));
    else if (tool.id === 'text') app.setToolOption('size', stepSize(opts.size, dir));
    return;
  }
  if (/^\d$/.test(key) && 'opacity' in opts) {
    app.setToolOption('opacity', key === '0' ? 100 : Number(key) * 10);
    app.toast(`${tool.name}不透明度：${opts.opacity}%`);
    return;
  }
  if (key.startsWith('Arrow') && app.doc && tool?.id === 'move') {
    e.preventDefault();
    const d = e.shiftKey ? 10 : 1;
    const v = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[key];
    nudge(...v);
    return;
  }
  if (key === 'Esc') {
    if (app.tool?.cancel?.()) app.requestRender();
  }
}

function onKeyUp(e) {
  if (keyName(e) === 'Space') app.viewport?.setSpace(false);
}

export function installKeyboard() {
  buildKeyIndex();
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => app.viewport?.setSpace(false));
}
