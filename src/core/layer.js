import { createCanvas, cloneCanvas, uid } from './utils.js';

/*
 * Copy-on-write pixel storage.
 *
 * History snapshots keep references to layer canvases instead of copying them.
 * Once a canvas has been captured by a snapshot it is "frozen" and must never be
 * drawn on again; Layer#edit() transparently swaps in a private copy the first
 * time a frozen canvas is modified. Only layers that actually change cost memory.
 */
const frozen = new WeakSet();
export const freeze = (canvas) => {
  if (canvas) frozen.add(canvas);
};
export const isFrozen = (canvas) => frozen.has(canvas);

export const DEFAULT_TEXT = {
  content: '',
  x: 0,
  y: 0,
  font: 'Microsoft YaHei',
  size: 48,
  color: '#000000',
  bold: false,
  italic: false,
  align: 'left',
  lineHeight: 1.25,
};

export const DEFAULT_EFFECTS = {
  shadow: { enabled: false, color: '#000000', opacity: 0.6, angle: 135, distance: 8, size: 12 },
  glow: { enabled: false, color: '#ffe68a', opacity: 0.8, size: 18 },
  stroke: { enabled: false, color: '#000000', size: 3 },
};

export class Layer {
  constructor(opts = {}) {
    this.id = opts.id || uid('layer');
    this.name = opts.name || '图层';
    this.canvas = opts.canvas || createCanvas(opts.width || 1, opts.height || 1);
    this.visible = opts.visible ?? true;
    this.opacity = opts.opacity ?? 1;
    this.blendMode = opts.blendMode || 'normal';
    this.locked = opts.locked || false;
    this.type = opts.type || 'raster';
    this.text = opts.text ? { ...opts.text } : null;
    this.effects = opts.effects ? structuredClone(opts.effects) : null;
    this.version = 0;
  }

  get width() {
    return this.canvas.width;
  }

  get height() {
    return this.canvas.height;
  }

  get isText() {
    return this.type === 'text';
  }

  get hasEffects() {
    const e = this.effects;
    return !!e && (e.shadow?.enabled || e.glow?.enabled || e.stroke?.enabled);
  }

  /** Returns a 2D context that is safe to draw into (copy-on-write). */
  edit() {
    if (frozen.has(this.canvas)) this.canvas = cloneCanvas(this.canvas);
    this.version++;
    return this.canvas.getContext('2d');
  }

  /** Read-only context. Never draw through this. */
  get ctx() {
    return this.canvas.getContext('2d');
  }

  snapshot() {
    freeze(this.canvas);
    return {
      id: this.id,
      name: this.name,
      canvas: this.canvas,
      visible: this.visible,
      opacity: this.opacity,
      blendMode: this.blendMode,
      locked: this.locked,
      type: this.type,
      text: this.text ? { ...this.text } : null,
      effects: this.effects ? structuredClone(this.effects) : null,
    };
  }

  static fromSnapshot(s) {
    return new Layer(s);
  }

  duplicate(name) {
    const s = this.snapshot();
    return new Layer({ ...s, id: undefined, name: name || `${this.name} 拷贝`, canvas: cloneCanvas(this.canvas) });
  }
}
