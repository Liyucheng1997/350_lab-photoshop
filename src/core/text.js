// Rendering of editable text layers.

export const FONT_FAMILIES = [
  'Microsoft YaHei',
  'PingFang SC',
  'SimSun',
  'SimHei',
  'KaiTi',
  'FangSong',
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Impact',
  'Trebuchet MS',
  'Comic Sans MS',
];

export function fontString(t, scale = 1) {
  return `${t.italic ? 'italic ' : ''}${t.bold ? 'bold ' : ''}${t.size * scale}px "${t.font}", "Microsoft YaHei", sans-serif`;
}

/** Layout lines; returns {lines:[{text,x,y,w}], bounds:{x,y,w,h}} in document coords. */
export function layoutText(t, ctx) {
  ctx.font = fontString(t);
  const lineH = t.size * t.lineHeight;
  const raw = (t.content || '').split('\n');
  const lines = raw.map((text, i) => {
    const w = ctx.measureText(text).width;
    let x = t.x;
    if (t.align === 'center') x = t.x - w / 2;
    else if (t.align === 'right') x = t.x - w;
    return { text, x, y: t.y + i * lineH, w };
  });
  const maxW = Math.max(t.size * 0.3, ...lines.map((l) => l.w));
  let bx = t.x;
  if (t.align === 'center') bx = t.x - maxW / 2;
  else if (t.align === 'right') bx = t.x - maxW;
  return { lines, bounds: { x: bx, y: t.y, w: maxW, h: Math.max(1, raw.length) * lineH } };
}

/** Re-render a text layer's pixels from its text properties. */
export function renderTextLayer(layer) {
  const t = layer.text;
  const ctx = layer.edit();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, layer.width, layer.height);
  const { lines } = layoutText(t, ctx);
  ctx.font = fontString(t);
  ctx.fillStyle = t.color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  const lineH = t.size * t.lineHeight;
  const pad = (lineH - t.size) / 2;
  for (const l of lines) ctx.fillText(l.text, l.x, l.y + pad);
  ctx.restore();
}

export function textBounds(layer) {
  return layoutText(layer.text, layer.ctx).bounds;
}
