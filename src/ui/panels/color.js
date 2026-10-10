import { app } from '../../core/app.js';
import { el } from '../../core/utils.js';
import { ColorPicker } from '../colorpicker.js';

export function createColorPanel() {
  let target = 'fg';
  const fg = el('button', { class: 'cp-target fg active', title: '前景色' });
  const bg = el('button', { class: 'cp-target bg', title: '背景色' });
  const picker = new ColorPicker({
    color: app.fg,
    layout: 'panel',
    onChange: (c) => {
      muted = true;
      if (target === 'fg') app.setFg(c);
      else app.setBg(c);
      muted = false;
    },
    onCommit: (c) => app.pushRecentColor(c),
  });
  let muted = false;
  const select = (t) => {
    target = t;
    fg.classList.toggle('active', t === 'fg');
    bg.classList.toggle('active', t === 'bg');
    picker.setColor(t === 'fg' ? app.fg : app.bg);
  };
  fg.addEventListener('click', () => select('fg'));
  bg.addEventListener('click', () => select('bg'));
  const paint = () => {
    fg.style.background = app.fg;
    bg.style.background = app.bg;
    if (!muted) picker.setColor(target === 'fg' ? app.fg : app.bg);
  };
  app.on('color', paint);
  paint();
  const root = el('div', {}, el('div', { class: 'cp-head' }, el('div', { class: 'cp-targets' }, bg, fg), picker.el));
  return { el: root };
}
