import { Layer, freeze } from './layer.js';
import { History } from './history.js';
import { compositeLayers } from './compositor.js';
import { createCanvas, uid } from './utils.js';
import { Selection } from './selection.js';

let untitled = 1;
export const nextUntitled = () => `未标题-${untitled++}`;

export class PSDocument {
  constructor({ name, width, height }) {
    this.id = uid('doc');
    this.name = name || nextUntitled();
    this.width = Math.round(width);
    this.height = Math.round(height);
    this.layers = []; // bottom -> top
    this.activeLayerId = null;
    this.selection = null;
    this.lastSelection = null;
    this.history = new History();
    this.view = { zoom: 1, x: 0, y: 0, fitted: false };
    this.modified = false;
    this.preview = null;
    this._composite = null;
    this._dirty = true;
    this.counters = { layer: 1, text: 1, shape: 1 };
  }

  /** Builds a new document with a filled "背景" layer and the initial history state. */
  static create({ name, width, height, background = '#ffffff', historyName = '新建' }) {
    const doc = new PSDocument({ name, width, height });
    const layer = new Layer({ name: '背景', width: doc.width, height: doc.height });
    if (background && background !== 'transparent') {
      const g = layer.edit();
      g.fillStyle = background;
      g.fillRect(0, 0, doc.width, doc.height);
    } else {
      layer.name = '图层 0';
    }
    doc.layers.push(layer);
    doc.activeLayerId = layer.id;
    doc.pushHistory(historyName);
    doc.modified = false;
    return doc;
  }

  /* -------------------------------------------------------------- layers */

  get activeLayer() {
    return this.layers.find((l) => l.id === this.activeLayerId) || null;
  }

  getLayer(id) {
    return this.layers.find((l) => l.id === id) || null;
  }

  indexOf(id) {
    return this.layers.findIndex((l) => l.id === id);
  }

  newLayerName(kind = 'layer') {
    if (kind === 'text') return null;
    return `图层 ${this.counters.layer++}`;
  }

  createLayer(opts = {}) {
    return new Layer({ width: this.width, height: this.height, name: opts.name || this.newLayerName(), ...opts });
  }

  /** Insert above the active layer (or at `index`) and make it active. */
  addLayer(layer, index) {
    if (index == null) {
      const ai = this.indexOf(this.activeLayerId);
      index = ai < 0 ? this.layers.length : ai + 1;
    }
    this.layers.splice(index, 0, layer);
    this.activeLayerId = layer.id;
    this.invalidate();
    return layer;
  }

  removeLayer(id) {
    const i = this.indexOf(id);
    if (i < 0) return;
    this.layers.splice(i, 1);
    if (this.activeLayerId === id) {
      const next = this.layers[Math.min(i, this.layers.length - 1)] || this.layers[i - 1];
      this.activeLayerId = next ? next.id : null;
    }
    this.invalidate();
  }

  moveLayer(id, newIndex) {
    const i = this.indexOf(id);
    if (i < 0) return;
    newIndex = Math.max(0, Math.min(this.layers.length - 1, newIndex));
    if (newIndex === i) return;
    const [l] = this.layers.splice(i, 1);
    this.layers.splice(newIndex, 0, l);
    this.invalidate();
  }

  /* ----------------------------------------------------------- selection */

  setSelection(sel) {
    if (this.selection) this.lastSelection = this.selection;
    this.selection = sel && !sel.isEmpty ? sel : null;
  }

  /* ------------------------------------------------------------- history */

  snapshot() {
    if (this.selection) freeze(this.selection.mask);
    return {
      width: this.width,
      height: this.height,
      layers: this.layers.map((l) => l.snapshot()),
      activeLayerId: this.activeLayerId,
      selection: this.selection,
    };
  }

  restore(s) {
    this.width = s.width;
    this.height = s.height;
    this.layers = s.layers.map((l) => Layer.fromSnapshot(l));
    this.activeLayerId = s.activeLayerId;
    this.selection = s.selection;
    this.preview = null;
    this.invalidate();
  }

  pushHistory(name, icon) {
    this.history.push(name, this.snapshot(), icon);
    this.modified = true;
    this.invalidate();
  }

  undo() {
    const st = this.history.undo();
    if (st) this.restore(st.snapshot);
    return st;
  }

  redo() {
    const st = this.history.redo();
    if (st) this.restore(st.snapshot);
    return st;
  }

  jumpHistory(i) {
    const st = this.history.jump(i);
    if (st) this.restore(st.snapshot);
    return st;
  }

  /* ----------------------------------------------------------- rendering */

  invalidate() {
    this._dirty = true;
  }

  getComposite() {
    if (!this._composite || this._composite.width !== this.width || this._composite.height !== this.height) {
      this._composite = createCanvas(this.width, this.height);
      this._dirty = true;
    }
    if (this._dirty || this.preview) {
      compositeLayers(this, this._composite);
      this._dirty = false;
    }
    return this._composite;
  }

  /** A flattened copy (no preview), optionally on a solid background. */
  flatten(background = null) {
    const c = createCanvas(this.width, this.height);
    return compositeLayers(this, c, { preview: null, background });
  }
}

export { Selection };
