// Document tabs above the canvas.
import { app } from '../core/app.js';
import { el } from '../core/utils.js';
import { closeDocument } from '../io/file.js';
import { icon } from './icons.js';

export function createTabs() {
  const bar = el('div', { class: 'doc-tabs' });
  const render = () => {
    bar.replaceChildren(
      ...app.docs.map((doc) => {
        const close = el('button', { class: 'doc-tab-close', title: '关闭', onclick: (e) => {
          e.stopPropagation();
          closeDocument(doc);
        } }, icon('x', 12));
        const tab = el(
          'div',
          { class: `doc-tab${doc === app.doc ? ' active' : ''}`, title: `${doc.name}  ${doc.width}×${doc.height}` },
          el('span', { class: 'doc-tab-name' }, doc.name),
          el('span', { class: 'doc-tab-meta' }, `@ ${Math.round(doc.view.zoom * 100)}%`),
          doc.modified ? el('span', { class: 'doc-tab-dot', title: '有未存储的更改' }) : null,
          close,
        );
        tab.addEventListener('pointerdown', (e) => {
          if (e.button === 1) {
            e.preventDefault();
            closeDocument(doc);
          } else if (e.button === 0 && !e.target.closest('.doc-tab-close')) app.setDoc(doc);
        });
        return tab;
      }),
    );
  };
  for (const ev of ['doc', 'doc-meta', 'history']) app.on(ev, render);
  let t = 0;
  app.on('view', () => {
    clearTimeout(t);
    t = setTimeout(render, 80);
  });
  render();
  return bar;
}
