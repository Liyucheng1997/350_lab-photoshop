import { app } from '../../core/app.js';
import { el } from '../../core/utils.js';
import { icon } from '../icons.js';

export function createHistoryPanel() {
  const list = el('div', { class: 'history-list' });
  const render = () => {
    const doc = app.doc;
    if (!doc) {
      list.replaceChildren(el('div', { class: 'empty-hint' }, '没有打开的文档'));
      return;
    }
    const h = doc.history;
    list.replaceChildren(
      ...h.states.map((s, i) =>
        el(
          'div',
          {
            class: `history-item${i === h.index ? ' active' : ''}${i > h.index ? ' future' : ''}${i === 0 ? ' origin' : ''}`,
            onclick: () => app.jumpHistory(i),
          },
          icon(i === 0 ? 'image' : s.icon || 'circle-dot', 14),
          el('span', {}, i === 0 ? `${doc.name}（${s.name}）` : s.name),
        ),
      ),
    );
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  };
  app.on('history', render);
  app.on('doc', render);
  render();
  return {
    el: el('div', { class: 'history-panel' }, list),
    onShow: render,
  };
}
