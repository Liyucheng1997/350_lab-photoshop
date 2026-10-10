// Horizontal type tool: creates and edits live text layers in place.
import { app } from '../core/app.js';
import { DEFAULT_TEXT } from '../core/layer.js';
import { renderTextLayer, textBounds, fontString, FONT_FAMILIES } from '../core/text.js';

export const textTool = {
  id: 'text',
  name: '横排文字工具',
  icon: 'type',
  key: 'T',
  cursor: 'text',
  hint: '单击画布创建文字，单击已有文字进行编辑。Ctrl+Enter 或 Esc 提交',
  options: { font: 'Microsoft YaHei', size: 48, bold: false, italic: false, align: 'left' },
  schema: [
    { type: 'select', key: 'font', label: '', width: 150, options: FONT_FAMILIES.map((f) => [f, f]), fontPreview: true },
    { type: 'number', key: 'size', label: '', min: 1, max: 1000, unit: '像素', icon: 'a-large-small' },
    { type: 'toggle', key: 'bold', icon: 'bold', title: '仿粗体' },
    { type: 'toggle', key: 'italic', icon: 'italic', title: '仿斜体' },
    '|',
    {
      type: 'segmented',
      key: 'align',
      options: [['left', 'align-left', '左对齐文本'], ['center', 'align-center', '居中对齐文本'], ['right', 'align-right', '右对齐文本']],
    },
    '|',
    { type: 'fgcolor', title: '设置文本颜色（前景色）' },
    'spacer',
    { type: 'iconbutton', icon: 'x', title: '取消所有当前编辑', run: () => textTool.cancel(), visible: () => !!textTool.editing },
    { type: 'iconbutton', icon: 'check', title: '提交所有当前编辑 (Ctrl+Enter)', run: () => textTool.commit(), visible: () => !!textTool.editing, primary: true },
  ],
  editing: null,
  _bound: false,

  bind() {
    if (this._bound) return;
    this._bound = true;
    const ta = app.viewport.textEditor;
    ta.addEventListener('input', () => {
      const e = this.editing;
      if (!e) return;
      e.layer.text.content = ta.value;
      renderTextLayer(e.layer);
      app.changed({ layers: false });
      this.layout();
    });
    ta.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) {
        ev.preventDefault();
        this.commit();
      }
    });
    app.on('view', () => this.layout());
    app.on('color', () => {
      const e = this.editing;
      if (!e) return;
      e.layer.text.color = app.fg;
      renderTextLayer(e.layer);
      app.changed({ layers: false });
      this.layout();
    });
  },

  findTextLayer(p) {
    const doc = app.doc;
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const l = doc.layers[i];
      if (!l.isText || !l.visible || l.locked) continue;
      const b = textBounds(l);
      const pad = 4 / app.viewport.zoom;
      if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad) return l;
    }
    return null;
  },

  getCursor(p) {
    if (p && !this.editing && this.findTextLayer(p)) return 'text';
    return 'text';
  },

  onDown(p) {
    this.bind();
    if (this.editing) {
      this.commit();
      return;
    }
    const hit = this.findTextLayer(p);
    if (hit) return this.edit(hit);
    const doc = app.doc;
    const o = this.options;
    const text = {
      ...DEFAULT_TEXT,
      font: o.font,
      size: o.size,
      bold: o.bold,
      italic: o.italic,
      align: o.align,
      color: app.fg,
      x: Math.round(p.x),
      y: Math.round(p.y - o.size * 0.9),
      content: '',
    };
    const layer = doc.createLayer({ type: 'text', text, name: '文字' });
    doc.addLayer(layer);
    app.emit('layers');
    this.edit(layer, true);
  },

  edit(layer, isNew = false) {
    this.bind();
    const doc = app.doc;
    doc.activeLayerId = layer.id;
    Object.assign(this.options, {
      font: layer.text.font,
      size: layer.text.size,
      bold: layer.text.bold,
      italic: layer.text.italic,
      align: layer.text.align,
    });
    this.editing = { layer, isNew, before: { ...layer.text }, doc };
    if (!isNew) app.setFg(layer.text.color);
    const ta = app.viewport.textEditor;
    ta.value = layer.text.content;
    ta.classList.add('active');
    this.layout();
    ta.focus();
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    app.emit('layers');
    app.emit('tool-options', this);
    app.requestRender();
  },

  layout() {
    const e = this.editing;
    const ta = app.viewport.textEditor;
    if (!e || app.doc !== e.doc) {
      ta.classList.remove('active');
      return;
    }
    const vp = app.viewport;
    const t = e.layer.text;
    const z = vp.zoom;
    const b = textBounds(e.layer);
    const pad = t.size * z;
    const bw = b.w * z;
    const anchor = vp.docToScreen(t.x, t.y);
    let left = anchor.x, width = bw + pad;
    if (t.align === 'center') {
      width = bw + pad * 2;
      left = anchor.x - width / 2;
    } else if (t.align === 'right') {
      left = anchor.x - width;
    }
    Object.assign(ta.style, {
      left: `${left}px`,
      top: `${anchor.y}px`,
      width: `${width}px`,
      height: `${b.h * z + 2}px`,
      font: fontString(t, z),
      lineHeight: `${t.size * t.lineHeight * z}px`,
      textAlign: t.align,
      caretColor: t.color,
    });
  },

  onOptionChange(key, value) {
    const layer = this.editing?.layer || (app.doc?.activeLayer?.isText ? app.doc.activeLayer : null);
    if (!layer || layer.locked) return;
    layer.text[key] = value;
    renderTextLayer(layer);
    if (this.editing) {
      app.changed({ layers: false });
      this.layout();
    } else app.commit('更改文字属性', 'type');
  },

  commit() {
    const e = this.editing;
    if (!e) return;
    this.editing = null;
    const ta = app.viewport.textEditor;
    ta.classList.remove('active');
    ta.blur();
    const { layer, isNew, doc } = e;
    if (doc !== app.doc) return;
    if (!layer.text.content.trim()) {
      doc.removeLayer(layer.id);
      if (isNew) app.changed();
      else app.commit('删除图层');
    } else {
      const changed = JSON.stringify(layer.text) !== JSON.stringify(e.before);
      if (isNew || (changed && (layer.name === e.before.content.split('\n')[0].slice(0, 30) || layer.name === '文字'))) {
        layer.name = layer.text.content.split('\n')[0].slice(0, 30);
      }
      if (isNew) app.commit('文字图层', 'type');
      else if (changed) app.commit('编辑文字', 'type');
    }
    app.emit('tool-options', this);
    app.emit('layers');
  },

  cancel() {
    const e = this.editing;
    if (!e) return false;
    this.editing = null;
    const ta = app.viewport.textEditor;
    ta.classList.remove('active');
    ta.blur();
    if (e.doc === app.doc) {
      if (e.isNew) e.doc.removeLayer(e.layer.id);
      else {
        e.layer.text = { ...e.before };
        renderTextLayer(e.layer);
      }
      app.changed();
    }
    app.emit('tool-options', this);
    return true;
  },

  deactivate() {
    this.commit();
  },

  drawOverlay(ctx, vp) {
    const e = this.editing;
    if (!e) return;
    const b = textBounds(e.layer);
    const a = vp.docToScreen(b.x, b.y);
    const z = vp.zoom;
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(79,140,255,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(a.x - 4) + 0.5, Math.round(a.y - 2) + 0.5, Math.round(b.w * z + 8), Math.round(b.h * z + 4));
    ctx.restore();
  },
};
