// Pixel selections are stored as an alpha mask canvas (white, alpha = amount selected).
// Selection objects are immutable: every operation produces a new mask.
import { createCanvas, cloneCanvas, contentBounds } from './utils.js';
import { gaussianBlur } from '../filters/filters.js';

export class Selection {
  constructor(mask) {
    this.mask = mask;
    this.bounds = contentBounds(mask, 0);
    this._path = null;
  }

  get isEmpty() {
    return !this.bounds;
  }

  /** Marching-ants outline (Path2D in document pixels), computed lazily. */
  get path() {
    if (!this._path) this._path = computeOutline(this.mask, this.bounds);
    return this._path;
  }

  /** Alpha (0-255) of the mask at a document pixel. */
  alphaAt(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.mask.width || y >= this.mask.height) return 0;
    return this.mask.getContext('2d').getImageData(x, y, 1, 1).data[3];
  }
}

export function makeSelection(mask) {
  const s = new Selection(mask);
  return s.isEmpty ? null : s;
}

function computeOutline(mask, bounds) {
  const path = new Path2D();
  if (!bounds) return path;
  const W = mask.width;
  const H = mask.height;
  const x0 = Math.max(0, bounds.x - 1);
  const y0 = Math.max(0, bounds.y - 1);
  const x1 = Math.min(W, bounds.x + bounds.w + 1);
  const y1 = Math.min(H, bounds.y + bounds.h + 1);
  const w = x1 - x0;
  const h = y1 - y0;
  const data = mask.getContext('2d').getImageData(x0, y0, w, h).data;
  // sel has a 1px border of zeros around the region so edges at the borders are found.
  const sw = w + 2;
  const sel = new Uint8Array(sw * (h + 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) sel[(y + 1) * sw + x + 1] = data[(y * w + x) * 4 + 3] >= 128 ? 1 : 0;
  }
  // horizontal edges
  for (let y = 0; y <= h; y++) {
    let start = -1;
    const a = y * sw;
    const b = (y + 1) * sw;
    for (let x = 0; x <= w; x++) {
      const edge = x < w && sel[a + x + 1] !== sel[b + x + 1];
      if (edge && start < 0) start = x;
      else if (!edge && start >= 0) {
        path.moveTo(x0 + start, y0 + y);
        path.lineTo(x0 + x, y0 + y);
        start = -1;
      }
    }
  }
  // vertical edges
  for (let x = 0; x <= w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const edge = y < h && sel[(y + 1) * sw + x] !== sel[(y + 1) * sw + x + 1];
      if (edge && start < 0) start = y;
      else if (!edge && start >= 0) {
        path.moveTo(x0 + x, y0 + start);
        path.lineTo(x0 + x, y0 + y);
        start = -1;
      }
    }
  }
  return path;
}

/* ------------------------------------------------------------ mask shapes */

function shapeMask(w, h, draw) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  draw(g);
  g.fill();
  return c;
}

export function rectMask(w, h, r) {
  return shapeMask(w, h, (g) => g.rect(Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)));
}

export function ellipseMask(w, h, r) {
  return shapeMask(w, h, (g) => g.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.abs(r.w / 2), Math.abs(r.h / 2), 0, 0, Math.PI * 2));
}

export function polygonMask(w, h, pts) {
  return shapeMask(w, h, (g) => {
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
  });
}

export function maskFromBinary(bin, w, h) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  for (let i = 0, n = w * h; i < n; i++) {
    if (bin[i]) {
      const j = i * 4;
      d[j] = d[j + 1] = d[j + 2] = d[j + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function maskFromLayer(canvas) {
  const c = cloneCanvas(canvas);
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/* ------------------------------------------------------------- operations */

/** mode: 'new' | 'add' | 'subtract' | 'intersect' */
export function combineSelection(current, mask, mode) {
  if (mode === 'new' || !current) {
    if (!current && (mode === 'subtract' || mode === 'intersect')) return null;
    return makeSelection(mask);
  }
  const c = cloneCanvas(current.mask);
  const g = c.getContext('2d');
  g.globalCompositeOperation = mode === 'add' ? 'source-over' : mode === 'subtract' ? 'destination-out' : 'destination-in';
  g.drawImage(mask, 0, 0);
  return makeSelection(c);
}

export function selectAll(w, h) {
  return makeSelection(rectMask(w, h, { x: 0, y: 0, w, h }));
}

export function invertSelection(sel, w, h) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, w, h);
  if (sel) {
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(sel.mask, 0, 0);
  }
  return makeSelection(c);
}

export function translateMask(mask, dx, dy) {
  const c = createCanvas(mask.width, mask.height);
  c.getContext('2d').drawImage(mask, Math.round(dx), Math.round(dy));
  return c;
}

export function featherMask(mask, radius) {
  if (radius <= 0) return mask;
  const g = mask.getContext('2d');
  const img = g.getImageData(0, 0, mask.width, mask.height);
  gaussianBlur(img, radius);
  const c = createCanvas(mask.width, mask.height);
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

/* Exact Euclidean distance transform (Felzenszwalb & Huttenlocher). */
const INF = 1e20;
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Squared distance from every pixel to the nearest pixel where bin[i] is truthy. */
function distanceTransform(bin, w, h) {
  const out = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = bin[i] ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = out[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = out[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[y * w + x] = d[x];
  }
  return out;
}

function binaryOf(mask) {
  const { width: w, height: h } = mask;
  const data = mask.getContext('2d').getImageData(0, 0, w, h).data;
  const bin = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) bin[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
  return bin;
}

export function expandMask(mask, r) {
  const { width: w, height: h } = mask;
  const bin = binaryOf(mask);
  const d2 = distanceTransform(bin, w, h);
  const out = new Uint8Array(w * h);
  const r2 = r * r;
  for (let i = 0; i < w * h; i++) out[i] = d2[i] <= r2 ? 1 : 0;
  return maskFromBinary(out, w, h);
}

export function contractMask(mask, r) {
  const { width: w, height: h } = mask;
  const bin = binaryOf(mask);
  const inv = bin.map((b) => (b ? 0 : 1));
  // Treat the canvas border as unselected so selections touching the edge shrink too.
  const W = w + 2, H = h + 2;
  const padded = new Uint8Array(W * H).fill(1);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) padded[(y + 1) * W + x + 1] = inv[y * w + x];
  const d2 = distanceTransform(padded, W, H);
  const out = new Uint8Array(w * h);
  const r2 = r * r;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = bin[y * w + x] && d2[(y + 1) * W + x + 1] > r2 ? 1 : 0;
  return maskFromBinary(out, w, h);
}

export function borderMask(mask, r) {
  const outer = expandMask(mask, r / 2);
  const inner = contractMask(mask, r / 2);
  const g = outer.getContext('2d');
  g.globalCompositeOperation = 'destination-out';
  g.drawImage(inner, 0, 0);
  return outer;
}

/* ------------------------------------------------------------ flood fill */

/**
 * Region of pixels similar to (x,y). Returns Uint8Array (1 = in region).
 * tolerance: 0-255 compared against the max per-channel difference (incl. alpha).
 */
export function floodRegion(imageData, sx, sy, tolerance, contiguous = true) {
  const { width: w, height: h, data } = imageData;
  sx = Math.floor(sx);
  sy = Math.floor(sy);
  const out = new Uint8Array(w * h);
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return out;
  const i0 = (sy * w + sx) * 4;
  const r0 = data[i0], g0 = data[i0 + 1], b0 = data[i0 + 2], a0 = data[i0 + 3];
  const match = (i) => {
    const j = i * 4;
    const a = data[j + 3];
    // fully transparent pixels compare only by alpha
    if (a0 === 0 && a === 0) return true;
    return (
      Math.abs(data[j] - r0) <= tolerance &&
      Math.abs(data[j + 1] - g0) <= tolerance &&
      Math.abs(data[j + 2] - b0) <= tolerance &&
      Math.abs(a - a0) <= tolerance
    );
  };
  if (!contiguous) {
    for (let i = 0; i < w * h; i++) if (match(i)) out[i] = 1;
    return out;
  }
  const seen = new Uint8Array(w * h);
  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop();
    let x = stack.pop();
    let i = y * w + x;
    while (x > 0 && !seen[i - 1] && match(i - 1)) {
      x--;
      i--;
    }
    let up = false, down = false;
    for (; x < w; x++, i++) {
      if (seen[i] || !match(i)) break;
      seen[i] = 1;
      out[i] = 1;
      if (y > 0) {
        const ui = i - w;
        if (!seen[ui] && match(ui)) {
          if (!up) {
            stack.push(x, y - 1);
            up = true;
          }
        } else up = false;
      }
      if (y < h - 1) {
        const di = i + w;
        if (!seen[di] && match(di)) {
          if (!down) {
            stack.push(x, y + 1);
            down = true;
          }
        } else down = false;
      }
    }
  }
  return out;
}
