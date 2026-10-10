import { el } from '../core/utils.js';
import { icon } from './icons.js';

let host = null;

export function toast(message, { type = 'info', duration = 2600 } = {}) {
  if (!host) {
    host = el('div', { class: 'toast-host' });
    document.body.append(host);
  }
  const ico = type === 'error' ? 'circle-alert' : type === 'success' ? 'circle-check' : 'info';
  const t = el('div', { class: `toast toast-${type}` }, icon(ico, 16), el('span', {}, message));
  host.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, duration);
}
