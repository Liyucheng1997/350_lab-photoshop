// Context-sensitive tool options bar, generated from each tool's `schema`.
import { app } from '../core/app.js';
import { el, clamp } from '../core/utils.js';
import { runCommand } from '../commands.js';
import { icon } from './icons.js';
import { openMenu } from './menu.js';
import { pickColor } from './colorpicker.js';
import { GRADIENT_PRESETS, gradientCss } from '../tools/fill.js';

let selfUpdate = false;
function setOpt(key, value) {
  selfUpdate = true;
  app.setToolOption(key, value);
  selfUpdate = false;
}

/** Drag horizontally on a label to change a numeric value (Photoshop "scrubby" labels). */
function scrubbable(label, get, set, { min, max, step = 1 }) {
  label.classList.add('scrub');
  label.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    label.setPointerCapture(e.pointerId);
    const x0 = e.clientX, v0 = get();
    const move = (ev) => {
      const k = ev.shiftKey ? 10 : 1;
      const v = clamp(Math.round((v0 + ((ev.clientX - x0) / 2) * step * k) / step) * step, min, max);
      set(v);
    };
    const up = () => {
      label.removeEventListener('pointermove', move);
      label.removeEventListener('pointerup', up);
    };
    label.addEventListener('pointermove', move);
    label.addEventListener('pointerup', up);
  });
}

function numberControl(spec, tool, { slider = false } = {}) {
  const { key, min = 0, max = 100, unit = '', step = 1, curve = false } = spec;
  const input = el('input', { class: 'input input-number opt-number', type: 'number', min, max, step, value: String(tool.options[key]) });
  const apply = (v, from) => {
    v = clamp(Math.round(v / step) * step, min, max);
    if (from !== input) input.value = String(v);
    if (sliderEl && from !== sliderEl) sliderEl.value = String(toSlider(v));
    setOpt(key, v);
  };
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    apply(Number.isNaN(v) ? tool.options[key] : v);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
  });
  // non-linear slider for large ranges (brush size)
  const toSlider = (v) => (curve ? Math.sqrt((v - min) / (max - min)) * 1000 : v);
  const fromSlider = (t) => (curve ? min + Math.pow(t / 1000, 2) * (max - min) : t);
  let sliderEl = null;
  const parts = [];
  const label = spec.icon ? el('span', { class: 'opt-label', title: spec.title || spec.label }, icon(spec.icon, 15)) : spec.label ? el('span', { class: 'opt-label' }, `${spec.label}:`) : null;
  if (label) {
    scrubbable(label, () => tool.options[key], (v) => apply(v), { min, max, step });
    parts.push(label);
  }
  const wrap = el('div', { class: 'opt-number-wrap' }, input, unit ? el('span', { class: 'opt-unit' }, unit) : null);
  if (slider) {
    const caret = el('button', { class: 'opt-caret', title: '显示滑块' }, icon('chevron-down', 12));
    caret.addEventListener('click', () => {
      const pop = el('div', { class: 'popover' });
      sliderEl = el('input', { type: 'range', class: 'slider', min: curve ? 0 : min, max: curve ? 1000 : max, step: curve ? 1 : step, value: String(toSlider(tool.options[key])) });
      sliderEl.addEventListener('input', () => apply(fromSlider(parseFloat(sliderEl.value)), sliderEl));
      pop.append(sliderEl);
      showPopover(pop, caret, () => (sliderEl = null));
    });
    wrap.append(caret);
  }
  parts.push(wrap);
  return el('div', { class: 'opt-group', title: spec.title || '' }, parts);
}

let popoverClose = null;
function showPopover(pop, anchor, onClose) {
  popoverClose?.();
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.max(4, r.right - 200)}px`;
  pop.style.top = `${r.bottom + 6}px`;
  document.body.append(pop);
  const outside = (e) => {
    if (!pop.contains(e.target) && !anchor.contains(e.target)) close();
  };
  const close = () => {
    pop.remove();
    document.removeEventListener('pointerdown', outside, true);
    popoverClose = null;
    onClose?.();
  };
  setTimeout(() => document.addEventListener('pointerdown', outside, true));
  popoverClose = close;
}

const SEL_MODES = [
  ['new', 'square', '新选区'],
  ['add', 'squares-unite', '添加到选区 (Shift)'],
  ['subtract', 'squares-subtract', '从选区减去 (Alt)'],
  ['intersect', 'squares-intersect', '与选区交叉 (Shift+Alt)'],
];

function segmented(options, value, onPick) {
  const g = el('div', { class: 'segmented' });
  for (const [v, ic, title] of options) {
    g.append(el('button', { class: `seg-btn${v === value ? ' active' : ''}`, title, onclick: () => {
      g.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('active'));
      g.children[options.findIndex((o) => o[0] === v)].classList.add('active');
      onPick(v);
    } }, icon(ic, 15)));
  }
  return g;
}

function paintSwatch(value) {
  if (value === 'none') return el('span', { class: 'paint-none' });
  const color = value === 'fg' ? app.fg : value === 'bg' ? app.bg : value;
  return el('span', { class: 'paint-color', style: { background: color } });
}

function buildControl(spec, tool) {
  if (spec === '|') return el('div', { class: 'opt-sep' });
  if (spec === 'spacer') return el('div', { class: 'spacer' });
  if (spec.visible && !spec.visible()) return null;
  const o = tool.options;
  switch (spec.type) {
    case 'range':
      return numberControl(spec, tool, { slider: true });
    case 'number':
      return numberControl(spec, tool);
    case 'checkbox': {
      const input = el('input', { type: 'checkbox', checked: !!o[spec.key] });
      input.addEventListener('change', () => setOpt(spec.key, input.checked));
      return el('label', { class: 'checkbox opt-check' }, input, el('span', { class: 'checkbox-box' }, icon('check', 11, 3)), el('span', {}, spec.label));
    }
    case 'toggle': {
      const b = el('button', { class: `icon-btn opt-toggle${o[spec.key] ? ' active' : ''}`, title: spec.title }, icon(spec.icon, 15));
      b.addEventListener('click', () => {
        setOpt(spec.key, !tool.options[spec.key]);
        b.classList.toggle('active', !!tool.options[spec.key]);
      });
      return b;
    }
    case 'select': {
      const s = el(
        'select',
        { class: 'input select opt-select', style: spec.width ? { width: `${spec.width}px` } : null },
        spec.options.map(([v, l]) => el('option', { value: String(v), selected: String(v) === String(o[spec.key]), style: spec.fontPreview ? { fontFamily: v } : null }, l)),
      );
      if (spec.fontPreview) s.style.fontFamily = o[spec.key];
      s.addEventListener('change', () => {
        const opt = spec.options.find(([v]) => String(v) === s.value);
        if (spec.fontPreview) s.style.fontFamily = s.value;
        setOpt(spec.key, opt ? opt[0] : s.value);
        s.blur();
      });
      return el('div', { class: 'opt-group' }, spec.label ? el('span', { class: 'opt-label' }, `${spec.label}:`) : null, s);
    }
    case 'segmented':
      return segmented(spec.options, o[spec.key], (v) => setOpt(spec.key, v));
    case 'selmode':
      return segmented(SEL_MODES, o[spec.key], (v) => setOpt(spec.key, v));
    case 'button':
      return el('button', { class: 'btn btn-sm', title: spec.title || '', onclick: () => (spec.command ? runCommand(spec.command) : spec.run?.()) }, spec.icon ? icon(spec.icon, 14) : null, spec.label);
    case 'iconbutton':
      return el('button', { class: `icon-btn${spec.primary ? ' icon-btn-primary' : ''}`, title: spec.title, onclick: () => spec.run() }, icon(spec.icon, 16));
    case 'info':
      return el('span', { class: 'opt-info' }, spec.text());
    case 'fgcolor': {
      const b = el('button', { class: 'opt-color', title: spec.title, style: { background: app.fg } });
      b.addEventListener('click', async () => {
        const c = await pickColor(app.fg);
        if (c) app.setFg(c);
      });
      return b;
    }
    case 'gradient': {
      const b = el('button', { class: 'opt-gradient', title: '单击选择渐变预设' }, el('span', { class: 'grad-bar', style: { background: gradientCss(o[spec.key]) } }), icon('chevron-down', 12));
      b.addEventListener('click', () => {
        const r = b.getBoundingClientRect();
        openMenu(
          GRADIENT_PRESETS.map((p) => ({ label: p.name, swatch: gradientCss(p.id), checked: () => tool.options[spec.key] === p.id, run: () => {
            setOpt(spec.key, p.id);
            render();
          } })),
          { x: r.left, y: r.bottom + 4, minWidth: 200 },
        );
      });
      return b;
    }
    case 'paint': {
      const b = el('button', { class: 'opt-paint', title: `${spec.label}类型` }, el('span', { class: 'opt-label' }, `${spec.label}:`), paintSwatch(o[spec.key]));
      b.addEventListener('click', () => {
        const r = b.getBoundingClientRect();
        const set = (v) => {
          setOpt(spec.key, v);
          render();
        };
        openMenu(
          [
            { label: '无颜色', checked: () => tool.options[spec.key] === 'none', run: () => set('none') },
            { label: '前景色', swatch: app.fg, checked: () => tool.options[spec.key] === 'fg', run: () => set('fg') },
            { label: '背景色', swatch: app.bg, checked: () => tool.options[spec.key] === 'bg', run: () => set('bg') },
            '-',
            { label: '拾色器…', icon: 'palette', run: async () => {
              const cur = tool.options[spec.key];
              const c = await pickColor(cur.startsWith('#') ? cur : app.fg);
              if (c) set(c);
            } },
          ],
          { x: r.left, y: r.bottom + 4, minWidth: 160 },
        );
      });
      return b;
    }
  }
  return null;
}

/* ------------------------------------------------------ transform options */

function transformControls(s) {
  const fields = {};
  const field = (key, label, unit, get, set, step = 1) => {
    const input = el('input', { class: 'input input-number opt-number', type: 'number', step });
    input.addEventListener('change', () => {
      const v = parseFloat(input.value);
      if (!Number.isNaN(v)) set(v);
      s.update();
    });
    fields[key] = { input, get };
    const lab = el('span', { class: 'opt-label' }, label);
    return el('div', { class: 'opt-group' }, lab, el('div', { class: 'opt-number-wrap' }, input, el('span', { class: 'opt-unit' }, unit)));
  };
  const t = s.t;
  const refresh = () => {
    for (const f of Object.values(fields)) if (document.activeElement !== f.input) f.input.value = String(+f.get().toFixed(1));
  };
  const link = el('button', { class: `icon-btn opt-toggle${s.keepRatio ? ' active' : ''}`, title: '保持长宽比' }, icon('link', 15));
  link.addEventListener('click', () => {
    s.keepRatio = !s.keepRatio;
    link.classList.toggle('active', s.keepRatio);
  });
  const parts = [
    field('x', 'X:', '像素', () => t.cx, (v) => (t.cx = v)),
    field('y', 'Y:', '像素', () => t.cy, (v) => (t.cy = v)),
    el('div', { class: 'opt-sep' }),
    field('w', 'W:', '%', () => t.sx * 100, (v) => {
      const k = v / 100 / t.sx;
      t.sx = v / 100;
      if (s.keepRatio) t.sy *= k;
    }),
    link,
    field('h', 'H:', '%', () => t.sy * 100, (v) => {
      const k = v / 100 / t.sy;
      t.sy = v / 100;
      if (s.keepRatio) t.sx *= k;
    }),
    el('div', { class: 'opt-sep' }),
    field('a', icon('rotate-cw', 14), '°', () => (t.angle * 180) / Math.PI, (v) => (t.angle = (v * Math.PI) / 180)),
    el('div', { class: 'spacer' }),
    el('span', { class: 'opt-info' }, 'Enter 提交 · Esc 取消 · Shift 切换等比 · Alt 以中心缩放'),
    el('button', { class: 'icon-btn', title: '取消变换 (Esc)', onclick: () => s.cancel() }, icon('x', 16)),
    el('button', { class: 'icon-btn icon-btn-primary', title: '提交变换 (Enter)', onclick: () => s.commit() }, icon('check', 16)),
  ];
  refresh();
  return { parts, refresh };
}

/* ----------------------------------------------------------------- bar */

let host = null;
let transformUI = null;

function render() {
  const tool = app.tool;
  if (!host || !tool) return;
  host.replaceChildren();
  const chip = el('div', { class: 'opt-tool', title: tool.name }, icon(app.transform ? 'scaling' : tool.icon, 18));
  host.append(chip, el('div', { class: 'opt-sep' }));
  if (app.transform) {
    transformUI = transformControls(app.transform);
    host.append(...transformUI.parts);
    return;
  }
  transformUI = null;
  for (const spec of tool.schema || []) {
    const c = buildControl(spec, tool);
    if (c) host.append(c);
  }
}

export function createOptionsBar() {
  host = el('div', { class: 'optionsbar' });
  app.on('tool', render);
  app.on('tool-options', () => !selfUpdate && render());
  app.on('transform', render);
  app.on('transform-update', () => transformUI?.refresh());
  app.on('color', () => {
    host.querySelectorAll('.opt-color').forEach((b) => (b.style.background = app.fg));
  });
  render();
  return host;
}
