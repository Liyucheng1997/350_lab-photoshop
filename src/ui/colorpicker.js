// HSB colour picker (used by the Color panel and the colour picker dialog).
import { el, clamp, hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, isValidHex, normalizeHex } from '../core/utils.js';
import { openDialog } from './dialog.js';

function drag(target, onPos) {
  target.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    target.setPointerCapture(e.pointerId);
    const r = () => target.getBoundingClientRect();
    const emit = (ev) => {
      const b = r();
      onPos(clamp((ev.clientX - b.left) / b.width, 0, 1), clamp((ev.clientY - b.top) / b.height, 0, 1));
    };
    emit(e);
    const move = (ev) => emit(ev);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      target.dispatchEvent(new CustomEvent('dragend'));
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  });
}

export class ColorPicker {
  /** layout: 'panel' (horizontal hue bar) or 'dialog' (vertical hue bar + numeric fields) */
  constructor({ color = '#000000', onChange, onCommit, layout = 'panel' }) {
    this.onChange = onChange;
    this.onCommit = onCommit;
    this.layout = layout;
    const { r, g, b } = hexToRgb(color);
    this.hsv = rgbToHsv(r, g, b);

    this.svThumb = el('div', { class: 'cp-thumb' });
    this.sv = el('div', { class: 'cp-sv' }, el('div', { class: 'cp-sv-white' }), el('div', { class: 'cp-sv-black' }), this.svThumb);
    this.hueThumb = el('div', { class: 'cp-hue-thumb' });
    this.hue = el('div', { class: `cp-hue ${layout === 'dialog' ? 'vertical' : 'horizontal'}` }, this.hueThumb);

    drag(this.sv, (x, y) => {
      this.hsv.s = x;
      this.hsv.v = 1 - y;
      this.update(true);
    });
    drag(this.hue, (x, y) => {
      this.hsv.h = (layout === 'dialog' ? y : x) * 359.9;
      this.update(true);
    });
    this.sv.addEventListener('dragend', () => this.onCommit?.(this.hex));
    this.hue.addEventListener('dragend', () => this.onCommit?.(this.hex));

    this.fields = {};
    const field = (key, label, max, unit = '') => {
      const input = el('input', { class: 'input input-number', type: 'number', min: 0, max });
      input.addEventListener('change', () => this.fromField(key, input.value));
      this.fields[key] = input;
      return el('label', { class: 'cp-field' }, el('span', {}, label), input, el('span', { class: 'unit' }, unit));
    };
    this.hexInput = el('input', { class: 'input cp-hex', maxlength: 7, spellcheck: false });
    this.hexInput.addEventListener('change', () => {
      if (isValidHex(this.hexInput.value)) this.setColor(normalizeHex(this.hexInput.value.startsWith('#') ? this.hexInput.value : `#${this.hexInput.value}`), false);
      else this.update(false);
      this.onCommit?.(this.hex);
    });

    if (layout === 'dialog') {
      this.swNew = el('div', { class: 'cp-sw' });
      this.swOld = el('div', { class: 'cp-sw', style: { background: color }, title: '单击以恢复', onclick: () => this.setColor(color, false) });
      this.el = el(
        'div',
        { class: 'cp cp-dialog' },
        this.sv,
        this.hue,
        el(
          'div',
          { class: 'cp-side' },
          el('div', { class: 'cp-compare' }, el('span', {}, '新的'), this.swNew, this.swOld, el('span', {}, '当前')),
          el('div', { class: 'cp-fields' }, field('h', 'H', 360, '°'), field('s', 'S', 100, '%'), field('b', 'B', 100, '%'), el('div', { class: 'cp-gap' }), field('r', 'R', 255), field('g', 'G', 255), field('bl', 'B', 255)),
          el('label', { class: 'cp-field cp-hexrow' }, el('span', {}, '#'), this.hexInput),
        ),
      );
    } else {
      this.el = el(
        'div',
        { class: 'cp cp-panel' },
        this.sv,
        this.hue,
        el('div', { class: 'cp-row' }, el('label', { class: 'cp-field cp-hexrow' }, el('span', {}, '#'), this.hexInput), field('r', 'R', 255), field('g', 'G', 255), field('bl', 'B', 255)),
      );
    }
    this.update(false);
  }

  get hex() {
    const { r, g, b } = hsvToRgb(this.hsv.h, this.hsv.s, this.hsv.v);
    return rgbToHex(r, g, b);
  }

  setColor(hex, silent = true) {
    if (!silent || hex !== this.hex) {
      const { r, g, b } = hexToRgb(hex);
      const hsv = rgbToHsv(r, g, b);
      // keep hue when colour is grey so the picker doesn't jump
      if (hsv.s === 0 || hsv.v === 0) hsv.h = this.hsv.h;
      this.hsv = hsv;
    }
    this.update(!silent);
  }

  fromField(key, value) {
    const v = parseFloat(value) || 0;
    if (key === 'h') this.hsv.h = clamp(v, 0, 359.9);
    else if (key === 's') this.hsv.s = clamp(v / 100, 0, 1);
    else if (key === 'b') this.hsv.v = clamp(v / 100, 0, 1);
    else {
      const rgb = hexToRgb(this.hex);
      rgb[key === 'bl' ? 'b' : key] = clamp(v, 0, 255);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      if (hsv.s === 0) hsv.h = this.hsv.h;
      this.hsv = hsv;
    }
    this.update(true);
    this.onCommit?.(this.hex);
  }

  update(notify) {
    const { h, s, v } = this.hsv;
    const hueColor = rgbToHex(hsvToRgb(h, 1, 1));
    this.sv.style.background = hueColor;
    this.svThumb.style.left = `${s * 100}%`;
    this.svThumb.style.top = `${(1 - v) * 100}%`;
    const hex = this.hex;
    this.svThumb.style.background = hex;
    if (this.layout === 'dialog') this.hueThumb.style.top = `${(h / 360) * 100}%`;
    else this.hueThumb.style.left = `${(h / 360) * 100}%`;
    this.hueThumb.style.background = hueColor;
    const { r, g, b } = hexToRgb(hex);
    const set = (k, val) => {
      const f = this.fields[k];
      if (f && document.activeElement !== f) f.value = String(Math.round(val));
    };
    set('h', h);
    set('s', s * 100);
    set('b', v * 100);
    set('r', r);
    set('g', g);
    set('bl', b);
    if (document.activeElement !== this.hexInput) this.hexInput.value = hex.slice(1).toUpperCase();
    if (this.swNew) this.swNew.style.background = hex;
    if (notify) this.onChange?.(hex);
  }
}

/** Modal colour picker. Resolves with the chosen hex or null. */
export function pickColor(initial, { title = '拾色器', onLive } = {}) {
  const picker = new ColorPicker({ color: initial, layout: 'dialog', onChange: (c) => onLive?.(c) });
  return openDialog({ title, body: picker.el, width: 520, onOk: () => picker.hex }).result.then((v) => {
    if (typeof v === 'string') return v;
    onLive?.(initial);
    return null;
  });
}
