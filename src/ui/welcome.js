// Start screen shown when no document is open.
import { app } from '../core/app.js';
import { el } from '../core/utils.js';
import { icon } from './icons.js';
import { runCommand } from '../commands.js';
import { PRESETS, newDocument } from '../io/file.js';
import { createDemoDocument } from '../io/demo.js';

export function createWelcome() {
  const quick = PRESETS.slice(0, 6).map((p) => {
    const ratio = p.w / p.h;
    const pw = ratio >= 1 ? 46 : 46 * ratio, ph = ratio >= 1 ? 46 / ratio : 46;
    return el(
      'button',
      { class: 'welcome-preset', onclick: () => newDocument({ width: p.w, height: p.h, background: '#ffffff' }) },
      el('div', { class: 'preset-thumb' }, el('div', { class: 'preset-shape', style: { width: `${pw}px`, height: `${ph}px` } })),
      el('div', { class: 'preset-name' }, p.name),
      el('div', { class: 'preset-size' }, `${p.w} × ${p.h}`),
    );
  });

  const root = el(
    'div',
    { class: 'welcome' },
    el(
      'div',
      { class: 'welcome-inner' },
      el(
        'div',
        { class: 'welcome-hero' },
        el('div', { class: 'welcome-logo' }, 'Ps'),
        el('div', {}, el('h1', {}, '欢迎使用 PhotoStudio'), el('p', {}, '专业级的浏览器图像编辑器 —— 图层、选区、画笔、文字、变换、调整与滤镜，一应俱全。')),
      ),
      el(
        'div',
        { class: 'welcome-actions' },
        el('button', { class: 'btn btn-primary btn-lg', onclick: () => runCommand('file.new') }, icon('file-plus', 18), '新建文件'),
        el('button', { class: 'btn btn-lg', onclick: () => runCommand('file.open') }, icon('folder-open', 18), '打开…'),
        el('button', { class: 'btn btn-lg btn-ghost', onclick: () => createDemoDocument() }, icon('sparkles', 18), '打开示例作品'),
      ),
      el('div', { class: 'section-title' }, '快速新建'),
      el('div', { class: 'welcome-presets' }, quick),
      el(
        'div',
        { class: 'welcome-drop' },
        icon('image-up', 28, 1.5),
        el('div', {}, el('strong', {}, '拖放图像到此处打开'), el('span', {}, '支持 PNG、JPEG、WebP、GIF、SVG 以及 .psw 项目文件；也可以直接 Ctrl+V 粘贴截图')),
      ),
    ),
  );
  const sync = () => root.classList.toggle('hidden', !!app.doc);
  app.on('doc', sync);
  sync();
  return root;
}
