import { createElement } from 'lucide';
import * as registry from './icon-registry.js';

const toPascal = (name) =>
  name
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join('');

/** Lucide icon as an SVG element. Unknown names render an empty placeholder. */
export function icon(name, size = 16, strokeWidth = 1.75) {
  const node = registry[toPascal(name)];
  if (!node) {
    console.warn(`[icons] missing icon "${name}"`);
    const span = document.createElement('span');
    span.className = 'icon icon-missing';
    span.style.width = span.style.height = `${size}px`;
    return span;
  }
  const svg = createElement(node);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('stroke-width', strokeWidth);
  svg.classList.add('icon');
  return svg;
}
