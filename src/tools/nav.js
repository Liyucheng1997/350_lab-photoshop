// Hand and zoom tools.
import { app } from '../core/app.js';

const viewButtons = [
  { type: 'button', label: '100%', command: 'view.actual' },
  { type: 'button', label: '适合屏幕', command: 'view.fit' },
  { type: 'button', label: '填充屏幕', command: 'view.fill' },
];

export const handTool = {
  id: 'hand',
  name: '抓手工具',
  icon: 'hand',
  key: 'H',
  cursor: 'grab',
  hint: '拖动以平移视图。任何工具下按住空格键都可临时使用抓手',
  options: {},
  schema: viewButtons,
};

export const zoomTool = {
  id: 'zoom',
  name: '缩放工具',
  icon: 'zoom-in',
  key: 'Z',
  hint: '单击放大，Alt+单击缩小，左右拖动进行细微缩放',
  options: { mode: 'in' },
  schema: [
    { type: 'segmented', key: 'mode', options: [['in', 'zoom-in', '放大'], ['out', 'zoom-out', '缩小']] },
    '|',
    ...viewButtons,
  ],
  drag: null,

  getCursor(p) {
    const out = (this.options.mode === 'out') !== !!p?.alt;
    return out ? 'zoom-out' : 'zoom-in';
  },
  onDown(p) {
    this.drag = { sx: p.sx, sy: p.sy, z0: app.viewport.zoom, moved: false };
  },
  onMove(p) {
    const d = this.drag;
    if (!d) return;
    const dx = p.sx - d.sx;
    if (Math.abs(dx) > 3) d.moved = true;
    if (d.moved) {
      const vp = app.viewport;
      const target = d.z0 * Math.exp(dx * 0.01);
      vp.setZoom(target, d.sx, d.sy);
    }
  },
  onUp(p) {
    const d = this.drag;
    this.drag = null;
    if (!d || d.moved) return;
    const out = (this.options.mode === 'out') !== p.alt;
    app.viewport.zoomStep(out ? -1 : 1, p.sx, p.sy);
  },
};
