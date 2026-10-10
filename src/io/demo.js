// A procedurally generated sample document with several layers to explore.
import { app } from '../core/app.js';
import { PSDocument } from '../core/document.js';
import { Layer, DEFAULT_TEXT, DEFAULT_EFFECTS } from '../core/layer.js';
import { renderTextLayer } from '../core/text.js';

function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}

function mountains(g, W, H, base, amp, color, seed) {
  const r = rng(seed);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, H);
  let y = base;
  for (let x = 0; x <= W; x += 40) {
    y += (r() - 0.5) * amp;
    y = Math.max(base - amp * 2.2, Math.min(base + amp, y));
    g.lineTo(x, y);
  }
  g.lineTo(W, H);
  g.closePath();
  g.fill();
}

export function createDemoDocument() {
  const W = 1600, H = 1000;
  const doc = new PSDocument({ name: '示例-日落', width: W, height: H });
  const add = (name, draw, opts = {}) => {
    const l = new Layer({ name, width: W, height: H, ...opts });
    if (draw) draw(l.edit());
    doc.layers.push(l);
    return l;
  };

  add('背景', (g) => {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0b1026');
    sky.addColorStop(0.45, '#3b2a6b');
    sky.addColorStop(0.72, '#c4527a');
    sky.addColorStop(1, '#f6a55a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    const r = rng(7);
    for (let i = 0; i < 260; i++) {
      const y = Math.pow(r(), 2) * H * 0.55;
      g.globalAlpha = 0.3 + r() * 0.7 * (1 - y / (H * 0.55));
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(r() * W, y, r() * 1.4 + 0.3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  });

  const sun = add('太阳', (g) => {
    const grad = g.createRadialGradient(1100, 640, 0, 1100, 640, 150);
    grad.addColorStop(0, '#fff6d5');
    grad.addColorStop(0.6, '#ffd36e');
    grad.addColorStop(1, '#ff9a4d');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(1100, 640, 150, 0, Math.PI * 2);
    g.fill();
  });
  sun.effects = structuredClone(DEFAULT_EFFECTS);
  sun.effects.glow = { enabled: true, color: '#ffb36b', opacity: 0.85, size: 80 };

  add('远山', (g) => mountains(g, W, H, 720, 60, '#5b3a78', 11), { opacity: 0.85 });
  add('近山', (g) => mountains(g, W, H, 830, 70, '#2a1b3d', 23));
  add('湖面', (g) => {
    const grad = g.createLinearGradient(0, 900, 0, H);
    grad.addColorStop(0, 'rgba(255,170,110,0.35)');
    grad.addColorStop(1, 'rgba(20,10,40,0.9)');
    g.fillStyle = grad;
    g.fillRect(0, 900, W, H - 900);
  }, { blendMode: 'overlay' });

  const title = new Layer({
    name: 'PhotoStudio',
    width: W,
    height: H,
    type: 'text',
    text: { ...DEFAULT_TEXT, content: 'PhotoStudio', x: 120, y: 150, size: 132, bold: true, color: '#ffffff', font: 'Segoe UI' },
  });
  title.effects = structuredClone(DEFAULT_EFFECTS);
  title.effects.shadow = { enabled: true, color: '#120a2a', opacity: 0.7, angle: 120, distance: 10, size: 24 };
  renderTextLayer(title);
  doc.layers.push(title);

  const sub = new Layer({
    name: '在浏览器中自由创作',
    width: W,
    height: H,
    type: 'text',
    opacity: 0.9,
    text: { ...DEFAULT_TEXT, content: '在浏览器中自由创作 · 图层 · 滤镜 · 变换', x: 128, y: 315, size: 40, color: '#ffe3c2' },
  });
  renderTextLayer(sub);
  doc.layers.push(sub);

  const paint = new Layer({ name: '图层 1', width: W, height: H });
  doc.layers.push(paint);
  doc.activeLayerId = paint.id;
  doc.counters.layer = 2;
  doc.pushHistory('打开');
  doc.modified = false;
  app.addDoc(doc);
  return doc;
}
