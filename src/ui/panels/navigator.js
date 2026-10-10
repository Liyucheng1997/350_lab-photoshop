import { app } from '../../core/app.js';
import { el, clamp } from '../../core/utils.js';
import { icon } from '../icons.js';
import { MIN_ZOOM, MAX_ZOOM } from '../../view/viewport.js';

export function createNavigatorPanel() {
  const canvas = el('canvas', { class: 'nav-canvas' });
  const box = el('div', { class: 'nav-view' }, canvas);
  const zoomIn = el('input', { class: 'input input-number nav-zoom', type: 'number' });
  const slider = el('input', { type: 'range', class: 'slider', min: 0, max: 1000 });
  let thumbScale = 1, offX = 0, offY = 0;
  let thumb = null;
  let visible = false;

  const toSlider = (z) => (Math.log(z / MIN_ZOOM) / Math.log(MAX_ZOOM / MIN_ZOOM)) * 1000;
  const fromSlider = (t) => MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, t / 1000);

  function drawThumb() {
    const doc = app.doc;
    const W = box.clientWidth || 260, H = 150;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    if (!doc) {
      thumb = null;
      return drawRect();
    }
    thumbScale = Math.min((W - 16) / doc.width, (H - 16) / doc.height);
    const tw = doc.width * thumbScale, th = doc.height * thumbScale;
    offX = (W - tw) / 2;
    offY = (H - th) / 2;
    thumb = document.createElement('canvas');
    thumb.width = Math.max(1, Math.round(tw * dpr));
    thumb.height = Math.max(1, Math.round(th * dpr));
    const g = thumb.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.fillStyle = '#fff';
    g.fillRect(0, 0, thumb.width, thumb.height);
    g.drawImage(doc.getComposite(), 0, 0, thumb.width, thumb.height);
    drawRect();
  }

  function drawRect() {
    const g = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    const doc = app.doc;
    if (!doc || !thumb) return;
    g.drawImage(thumb, offX, offY, thumb.width / dpr, thumb.height / dpr);
    const vp = app.viewport;
    const a = vp.screenToDoc(0, 0), b = vp.screenToDoc(vp.W, vp.H);
    const x0 = clamp(a.x, 0, doc.width), y0 = clamp(a.y, 0, doc.height);
    const x1 = clamp(b.x, 0, doc.width), y1 = clamp(b.y, 0, doc.height);
    g.strokeStyle = '#ff4d4f';
    g.lineWidth = 2;
    g.strokeRect(offX + x0 * thumbScale, offY + y0 * thumbScale, (x1 - x0) * thumbScale, (y1 - y0) * thumbScale);
    zoomIn.value = String(Math.round(doc.view.zoom * 1000) / 10);
    slider.value = String(toSlider(doc.view.zoom));
    slider.style.setProperty('--fill', `${slider.value / 10}%`);
  }

  let timer = 0;
  const scheduleThumb = () => {
    if (!visible) return;
    clearTimeout(timer);
    timer = setTimeout(drawThumb, 200);
  };
  app.on('content', scheduleThumb);
  app.on('doc', () => visible && drawThumb());
  app.on('view', () => visible && drawRect());

  canvas.addEventListener('pointerdown', (e) => {
    const doc = app.doc;
    if (!doc) return;
    canvas.setPointerCapture(e.pointerId);
    const go = (ev) => {
      const r = canvas.getBoundingClientRect();
      const dx = (ev.clientX - r.left - offX) / thumbScale;
      const dy = (ev.clientY - r.top - offY) / thumbScale;
      const vp = app.viewport;
      doc.view.x = Math.round(vp.W / 2 - dx * doc.view.zoom);
      doc.view.y = Math.round(vp.H / 2 - dy * doc.view.zoom);
      vp.clampPan();
      app.emit('view');
    };
    go(e);
    const up = () => {
      canvas.removeEventListener('pointermove', go);
      canvas.removeEventListener('pointerup', up);
    };
    canvas.addEventListener('pointermove', go);
    canvas.addEventListener('pointerup', up);
  });
  slider.addEventListener('input', () => app.doc && app.viewport.setZoom(fromSlider(parseFloat(slider.value))));
  zoomIn.addEventListener('change', () => {
    const v = parseFloat(zoomIn.value);
    if (app.doc && v > 0) app.viewport.setZoom(v / 100);
  });

  const root = el(
    'div',
    { class: 'navigator' },
    box,
    el(
      'div',
      { class: 'nav-controls' },
      el('div', { class: 'opt-number-wrap' }, zoomIn, el('span', { class: 'opt-unit' }, '%')),
      el('button', { class: 'icon-btn', title: '缩小', onclick: () => app.doc && app.viewport.zoomStep(-1) }, icon('zoom-out', 14)),
      slider,
      el('button', { class: 'icon-btn', title: '放大', onclick: () => app.doc && app.viewport.zoomStep(1) }, icon('zoom-in', 14)),
    ),
  );
  return {
    el: root,
    onShow: () => {
      visible = true;
      requestAnimationFrame(drawThumb);
    },
  };
}
