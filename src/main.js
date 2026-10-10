import './styles/main.css';
import { app } from './core/app.js';
import { el } from './core/utils.js';
import { Viewport } from './view/viewport.js';
import { registerTools } from './tools/index.js';
import { installKeyboard } from './keyboard.js';
import { handlePasteEvent } from './commands.js';
import { openFiles, placeCanvasAsLayer } from './io/file.js';
import { loadImageFromFile, stripExtension, isTyping } from './core/utils.js';
import { createMenubar } from './ui/menubar.js';
import { createToolbar } from './ui/toolbar.js';
import { createOptionsBar } from './ui/optionsbar.js';
import { createTabs } from './ui/tabs.js';
import { createStatusbar } from './ui/statusbar.js';
import { createDock } from './ui/panels/dock.js';
import { createWelcome } from './ui/welcome.js';
import { toast } from './ui/toast.js';
import { confirmDialog } from './ui/dialog.js';
import { icon } from './ui/icons.js';

app.toast = (msg, opts) => toast(msg, opts);
app.confirm = (opts) => confirmDialog(opts);

registerTools();

const workspace = el('div', { class: 'workspace' });
const dropHint = el('div', { class: 'drop-overlay' }, el('div', { class: 'drop-card' }, icon('image-down', 36, 1.5), el('div', {}, '松开鼠标以打开或置入图像')));
const center = el('div', { class: 'center' }, createTabs(), workspace);

const root = el(
  'div',
  { class: 'app' },
  createMenubar(),
  createOptionsBar(),
  el('div', { class: 'main' }, createToolbar(), center, createDock()),
  createStatusbar(),
);
document.getElementById('app').replaceWith(root);
document.body.append(dropHint);

app.viewport = new Viewport(workspace);
workspace.append(createWelcome());
app.setTool('move');
installKeyboard();

/* ------------------------------------------------------------ drag & drop */

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return;
  e.preventDefault();
  dragDepth++;
  dropHint.classList.add('show');
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropHint.classList.remove('show');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropHint.classList.remove('show');
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  // With a document open, a single dropped image is placed as a new layer (like PS "Place").
  const single = files.length === 1 && files[0].type.startsWith('image/');
  if (app.doc && single && !e.shiftKey) {
    try {
      const img = await loadImageFromFile(files[0]);
      placeCanvasAsLayer(img, stripExtension(files[0].name));
    } catch (err) {
      app.toast(err.message);
    }
  } else openFiles(files);
});

/* -------------------------------------------------------------- clipboard */

window.addEventListener('paste', (e) => {
  if (isTyping()) return;
  e.preventDefault();
  handlePasteEvent(e);
});

// Mouse-clicked buttons should not keep focus, otherwise Space (temporary hand tool)
// would re-trigger them.
document.addEventListener('click', (e) => {
  if (e.detail > 0) e.target.closest?.('button')?.blur();
});

window.addEventListener('beforeunload', (e) => {
  if (app.docs.some((d) => d.modified)) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Prevent the browser's pinch-zoom / ctrl+wheel page zoom over the app
window.addEventListener('wheel', (e) => e.ctrlKey && e.preventDefault(), { passive: false });
