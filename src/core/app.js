// Global application state and the glue between documents, tools and UI.
import { Emitter } from './emitter.js';
import { normalizeHex } from './utils.js';

const PREFS_KEY = 'photostudio.prefs';

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

class App extends Emitter {
  constructor() {
    super();
    this.docs = [];
    this.doc = null;
    this.tools = {};
    this.toolId = 'move';
    this.fg = '#000000';
    this.bg = '#ffffff';
    this.recentColors = [];
    this.viewport = null;
    this.transform = null; // active free-transform session
    this.clipboard = null; // {canvas, x, y}
    this.lastFilter = null;
    const prefs = loadPrefs();
    this.settings = {
      rulers: true,
      pixelGrid: true,
      ...prefs.settings,
    };
    this.toolOptions = prefs.toolOptions || {};
    // UI hooks, installed by the UI layer
    this.toast = (msg) => console.log(msg);
    this.confirm = async () => true;
  }

  savePrefs() {
    try {
      const toolOptions = {};
      for (const [id, t] of Object.entries(this.tools)) if (t.options) toolOptions[id] = t.options;
      localStorage.setItem(PREFS_KEY, JSON.stringify({ settings: this.settings, toolOptions }));
    } catch {
      /* storage unavailable: preferences simply are not remembered */
    }
  }

  /* --------------------------------------------------------------- tools */

  registerTool(tool) {
    this.tools[tool.id] = tool;
    const saved = this.toolOptions[tool.id];
    if (saved && tool.options) Object.assign(tool.options, saved);
  }

  get tool() {
    return this.tools[this.toolId];
  }

  setTool(id) {
    if (!this.tools[id]) return;
    if (this.transform && id !== this.toolId) this.transform.commit();
    const prev = this.tool;
    if (prev && prev.id !== id) prev.deactivate?.();
    this.toolId = id;
    this.tool.activate?.();
    this.emit('tool', this.tool);
    this.requestRender();
  }

  setToolOption(key, value) {
    const t = this.tool;
    t.options[key] = value;
    t.onOptionChange?.(key, value);
    this.emit('tool-options', t);
    this.requestRender();
    this.savePrefs();
  }

  /* -------------------------------------------------------------- colors */

  setFg(color) {
    this.fg = normalizeHex(color);
    this.emit('color');
  }

  setBg(color) {
    this.bg = normalizeHex(color);
    this.emit('color');
  }

  swapColors() {
    [this.fg, this.bg] = [this.bg, this.fg];
    this.emit('color');
  }

  resetColors() {
    this.fg = '#000000';
    this.bg = '#ffffff';
    this.emit('color');
  }

  pushRecentColor(c) {
    c = normalizeHex(c);
    this.recentColors = [c, ...this.recentColors.filter((x) => x !== c)].slice(0, 12);
    this.emit('recent-colors');
  }

  /* ----------------------------------------------------------- documents */

  addDoc(doc) {
    this.docs.push(doc);
    this.setDoc(doc);
    this.viewport?.fit();
  }

  setDoc(doc) {
    if (this.doc === doc) return;
    if (this.transform) this.transform.commit();
    // Finish in-progress text edits; abandon other half-finished gestures.
    if (this.tool?.editing) this.tool.commit();
    else this.tool?.cancel?.();
    this.doc = doc;
    this.emit('doc', doc);
    this.emit('layers');
    this.emit('history');
    this.emit('selection');
    this.emit('view');
    this.requestRender();
  }

  removeDoc(doc) {
    const i = this.docs.indexOf(doc);
    if (i < 0) return;
    if (this.doc === doc) {
      this.transform?.cancel();
      this.tool?.cancel?.();
    }
    this.docs.splice(i, 1);
    if (this.doc === doc) {
      this.doc = undefined; // forces setDoc to run even when switching to "no document"
      this.setDoc(this.docs[Math.min(i, this.docs.length - 1)] || null);
    } else {
      this.emit('doc', this.doc);
    }
  }

  /* -------------------------------------------------------------- update */

  requestRender() {
    this.viewport?.requestRender();
  }

  /** Content changed (pixels/layers) without a history step. */
  changed({ layers = true } = {}) {
    if (!this.doc) return;
    this.doc.invalidate();
    if (layers) this.emit('layers');
    this.emit('content');
    this.requestRender();
  }

  /** Record a history step for the active document and refresh everything. */
  commit(name, icon) {
    const doc = this.doc;
    if (!doc) return;
    doc.pushHistory(name, icon);
    this.emit('history');
    this.emit('layers');
    this.emit('selection');
    this.emit('content');
    this.emit('doc-meta');
    this.requestRender();
  }

  afterHistoryMove() {
    this.transform?.cancel(true);
    this.tool?.cancel?.();
    this.emit('history');
    this.emit('layers');
    this.emit('selection');
    this.emit('content');
    this.emit('view');
    this.requestRender();
  }

  undo() {
    if (this.transform) return this.transform.cancel();
    if (this.tool?.cancel?.() === true) return;
    if (this.doc?.undo()) this.afterHistoryMove();
  }

  redo() {
    if (this.doc?.redo()) this.afterHistoryMove();
  }

  jumpHistory(i) {
    if (this.transform) this.transform.cancel(true);
    if (this.doc?.jumpHistory(i)) this.afterHistoryMove();
  }

  /**
   * Resolve the layer a pixel tool should draw on. Returns null (with feedback)
   * when the layer is hidden, locked, or is a text layer that the user chose
   * not to rasterize.
   */
  async paintableLayer({ action = '此操作' } = {}) {
    const doc = this.doc;
    const layer = doc?.activeLayer;
    if (!layer) {
      this.toast('没有可编辑的图层');
      return null;
    }
    if (layer.locked) {
      this.toast(`图层“${layer.name}”已锁定`);
      return null;
    }
    if (!layer.visible) {
      this.toast(`无法在隐藏的图层上使用${action}`);
      return null;
    }
    if (layer.isText) {
      const ok = await this.confirm({
        title: '栅格化文字',
        message: `必须先栅格化文字图层“${layer.name}”才能继续。栅格化后将无法再编辑文字。`,
        okText: '栅格化',
      });
      if (!ok) return null;
      layer.type = 'raster';
      layer.text = null;
      this.commit('栅格化文字');
      return null;
    }
    return layer;
  }

  /** Synchronous check used inside pointer handlers that cannot await. */
  checkPaintable(action) {
    const layer = this.doc?.activeLayer;
    if (!layer || layer.locked || !layer.visible || layer.isText) {
      this.paintableLayer({ action });
      return null;
    }
    return layer;
  }
}

export const app = new App();
window.__app = app;
