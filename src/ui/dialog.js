// Modal dialogs and form controls.
import { el, clamp } from '../core/utils.js';
import { icon } from './icons.js';

let openCount = 0;
export const isDialogOpen = () => openCount > 0;

/**
 * openDialog({title, body, buttons, width, onOk}) → {close, root, result: Promise}
 * buttons: [{label, value, primary, danger}] ; value true = OK (runs onOk which may veto by returning false)
 */
export function openDialog({ title, body, buttons, width = 420, onOk, onCancel, className = '', side = null }) {
  let resolveFn;
  const result = new Promise((r) => (resolveFn = r));
  const overlay = el('div', { class: 'dialog-overlay' });
  const header = el(
    'div',
    { class: 'dialog-header' },
    el('div', { class: 'dialog-title' }, title),
    el('button', { class: 'dialog-close', title: '关闭', onclick: () => close(false) }, icon('x', 16)),
  );
  buttons = buttons || [
    { label: '取消', value: false },
    { label: '确定', value: true, primary: true },
  ];
  const footer = el(
    'div',
    { class: 'dialog-footer' },
    side,
    el('div', { class: 'spacer' }),
    buttons.map((b) =>
      el('button', { class: `btn${b.primary ? ' btn-primary' : ''}${b.danger ? ' btn-danger' : ''}`, onclick: () => press(b.value) }, b.label),
    ),
  );
  const box = el('div', { class: `dialog ${className}`, style: { width: `${width}px` } }, header, el('div', { class: 'dialog-body' }, body), footer);
  overlay.append(box);
  document.body.append(overlay);
  openCount++;
  requestAnimationFrame(() => {
    overlay.classList.add('show');
    const first = box.querySelector('input:not([type=checkbox]):not([type=range]), select, textarea');
    if (first) {
      first.focus();
      first.select?.();
    } else box.querySelector('.btn-primary')?.focus();
  });

  async function press(value) {
    if (value === true && onOk) {
      const r = await onOk();
      if (r === false) return;
      if (r !== undefined && r !== true) return close(r);
    }
    close(value);
  }

  function close(value) {
    if (!overlay.isConnected) return;
    if (value === false) onCancel?.();
    overlay.remove();
    openCount--;
    document.removeEventListener('keydown', onKey, true);
    resolveFn(value);
  }

  function onKey(e) {
    if (!overlay.isConnected) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close(false);
    } else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      e.stopPropagation();
      const primary = buttons.find((b) => b.primary);
      if (primary) press(primary.value);
    }
  }
  document.addEventListener('keydown', onKey, true);

  // Drag by header
  header.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    const r = box.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    box.style.position = 'fixed';
    box.style.margin = '0';
    const move = (ev) => {
      box.style.left = `${clamp(ev.clientX - ox, 0, window.innerWidth - 80)}px`;
      box.style.top = `${clamp(ev.clientY - oy, 0, window.innerHeight - 40)}px`;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  });

  return { close, root: box, result };
}

export function confirmDialog({ title = '提示', message, okText = '确定', cancelText = '取消', danger = false }) {
  return openDialog({
    title,
    width: 400,
    body: el('div', { class: 'dialog-message' }, el('div', { class: 'dialog-message-icon' }, icon(danger ? 'triangle-alert' : 'info', 28)), el('p', {}, message)),
    buttons: [
      { label: cancelText, value: false },
      { label: okText, value: true, primary: true, danger },
    ],
  }).result;
}

/** Three-way: resolves 'save' | 'discard' | false */
export function saveChangesDialog(name) {
  return openDialog({
    title: '存储更改',
    width: 420,
    body: el('div', { class: 'dialog-message' }, el('div', { class: 'dialog-message-icon' }, icon('save', 28)), el('p', {}, `要在关闭之前存储对文档“${name}”的更改吗？`)),
    buttons: [
      { label: '不存储', value: 'discard' },
      { label: '取消', value: false },
      { label: '存储', value: 'save', primary: true },
    ],
  }).result;
}

export function promptDialog({ title, label, value = '' }) {
  const input = el('input', { type: 'text', class: 'input', value });
  return openDialog({
    title,
    width: 380,
    body: formRow(label, input),
    onOk: () => input.value,
  }).result.then((v) => (typeof v === 'string' ? v : null));
}

/* ------------------------------------------------------------- controls */

export function formRow(label, ...controls) {
  return el('label', { class: 'form-row' }, el('span', { class: 'form-label' }, label), el('div', { class: 'form-control' }, controls));
}

export function numberInput({ value, min = -Infinity, max = Infinity, step = 1, width = 80, onInput }) {
  const input = el('input', { type: 'number', class: 'input input-number', value: String(value), min, max, step, style: { width: `${width}px` } });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (!Number.isNaN(v)) onInput?.(clamp(v, min, max));
  });
  input.addEventListener('change', () => {
    let v = parseFloat(input.value);
    if (Number.isNaN(v)) v = value;
    v = clamp(v, min, max);
    input.value = String(v);
    onInput?.(v);
  });
  return input;
}

/** Labeled slider + number box, kept in sync. */
export function rangeRow({ label, min, max, step = 1, value, unit = '', onInput }) {
  const num = el('input', { type: 'number', class: 'input input-number', min, max, step, value: String(value) });
  const slider = el('input', { type: 'range', class: 'slider', min, max, step, value: String(value) });
  const paint = () => {
    const t = ((parseFloat(slider.value) - min) / (max - min)) * 100;
    slider.style.setProperty('--fill', `${t}%`);
  };
  paint();
  const set = (v, from) => {
    v = clamp(v, min, max);
    if (from !== num) num.value = String(+v.toFixed(3));
    if (from !== slider) slider.value = String(v);
    paint();
    onInput?.(v);
  };
  slider.addEventListener('input', () => set(parseFloat(slider.value), slider));
  num.addEventListener('input', () => {
    const v = parseFloat(num.value);
    if (!Number.isNaN(v)) set(v, num);
  });
  num.addEventListener('change', () => {
    const v = parseFloat(num.value);
    set(Number.isNaN(v) ? min : v);
  });
  const root = el(
    'div',
    { class: 'range-row' },
    el('div', { class: 'range-head' }, el('span', { class: 'range-label' }, label), el('span', { class: 'range-value' }, num, unit ? el('span', { class: 'unit' }, unit) : null)),
    slider,
  );
  return {
    el: root,
    get value() {
      return parseFloat(slider.value);
    },
    set value(v) {
      num.value = String(v);
      slider.value = String(v);
      paint();
    },
  };
}

export function selectInput(options, value, onChange, { width } = {}) {
  const s = el(
    'select',
    { class: 'input select', style: width ? { width: `${width}px` } : null },
    options.map((o) => (o === '-' ? el('option', { disabled: true }, '──────────') : el('option', { value: String(o[0]), selected: String(o[0]) === String(value) }, o[1]))),
  );
  s.addEventListener('change', () => {
    const opt = options.find((o) => o !== '-' && String(o[0]) === s.value);
    onChange?.(opt ? opt[0] : s.value);
  });
  return s;
}

export function checkbox(label, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange?.(input.checked));
  return el('label', { class: 'checkbox' }, input, el('span', { class: 'checkbox-box' }, icon('check', 11, 3)), el('span', {}, label));
}
