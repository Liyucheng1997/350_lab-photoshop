// Pixel-level image algorithms. All functions take an ImageData, modify it in
// place and return it.
import { clamp, rgbToHsl, hslToRgb } from '../core/utils.js';

/* ---------------------------------------------------------------- helpers */

function applyLut(img, lr, lg = lr, lb = lr) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lr[d[i]];
    d[i + 1] = lg[d[i + 1]];
    d[i + 2] = lb[d[i + 2]];
  }
  return img;
}

function makeLut(fn) {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = fn(i);
  return lut;
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

function copyImage(img) {
  return new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
}

/* ------------------------------------------------------------------- blur */

function boxesForGauss(sigma, n) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2;
  const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  const m = Math.round(mIdeal);
  const sizes = [];
  for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}

function boxH(src, dst, w, h, r) {
  const inv = 1 / (r + r + 1);
  const last = w - 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[row + clamp(k, 0, last)];
    for (let x = 0; x < w; x++) {
      dst[row + x] = acc * inv;
      acc += src[row + Math.min(x + r + 1, last)] - src[row + Math.max(x - r, 0)];
    }
  }
}

function boxV(src, dst, w, h, r) {
  const inv = 1 / (r + r + 1);
  const last = h - 1;
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let k = -r; k <= r; k++) acc += src[clamp(k, 0, last) * w + x];
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = acc * inv;
      acc += src[Math.min(y + r + 1, last) * w + x] - src[Math.max(y - r, 0) * w + x];
    }
  }
}

/** Gaussian blur approximated by three box blurs, in premultiplied alpha. */
export function gaussianBlur(img, sigma) {
  if (!(sigma >= 0.3)) return img;
  const { width: w, height: h, data } = img;
  const n = w * h;
  const ch = [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const a = data[j + 3];
    const f = a / 255;
    ch[0][i] = data[j] * f;
    ch[1][i] = data[j + 1] * f;
    ch[2][i] = data[j + 2] * f;
    ch[3][i] = a;
  }
  const tmp = new Float32Array(n);
  const boxes = boxesForGauss(sigma, 3);
  for (const c of ch) {
    for (const b of boxes) {
      const r = (b - 1) >> 1;
      boxH(c, tmp, w, h, r);
      boxV(tmp, c, w, h, r);
    }
  }
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const a = ch[3][i];
    if (a <= 0.01) {
      data[j + 3] = 0;
      continue;
    }
    const f = 255 / a;
    data[j] = ch[0][i] * f;
    data[j + 1] = ch[1][i] * f;
    data[j + 2] = ch[2][i] * f;
    data[j + 3] = a;
  }
  return img;
}

export function motionBlur(img, { angle = 0, distance = 10 }) {
  const { width: w, height: h } = img;
  const src = copyImage(img).data;
  const d = img.data;
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = -Math.sin(rad);
  const steps = Math.max(1, Math.round(distance));
  const offs = [];
  for (let s = 0; s <= steps; s++) {
    const t = s - steps / 2;
    offs.push([Math.round(dx * t), Math.round(dy * t)]);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [ox, oy] of offs) {
        const sx = clamp(x + ox, 0, w - 1);
        const sy = clamp(y + oy, 0, h - 1);
        const j = (sy * w + sx) * 4;
        const al = src[j + 3];
        r += src[j] * al;
        g += src[j + 1] * al;
        b += src[j + 2] * al;
        a += al;
      }
      const j = (y * w + x) * 4;
      if (a > 0) {
        d[j] = r / a;
        d[j + 1] = g / a;
        d[j + 2] = b / a;
      }
      d[j + 3] = a / offs.length;
    }
  }
  return img;
}

export function radialBlur(img, { amount = 10 }) {
  const { width: w, height: h } = img;
  const src = copyImage(img).data;
  const d = img.data;
  const cx = w / 2, cy = h / 2;
  const samples = 12;
  const k = amount / 400;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let s = 0; s < samples; s++) {
        const t = 1 - (s / samples) * k;
        const sx = clamp(Math.round(cx + (x - cx) * t), 0, w - 1);
        const sy = clamp(Math.round(cy + (y - cy) * t), 0, h - 1);
        const j = (sy * w + sx) * 4;
        const al = src[j + 3];
        r += src[j] * al;
        g += src[j + 1] * al;
        b += src[j + 2] * al;
        a += al;
      }
      const j = (y * w + x) * 4;
      if (a > 0) {
        d[j] = r / a;
        d[j + 1] = g / a;
        d[j + 2] = b / a;
      }
      d[j + 3] = a / samples;
    }
  }
  return img;
}

/* ---------------------------------------------------------------- sharpen */

export function unsharpMask(img, { amount = 100, radius = 1, threshold = 0 }) {
  const blurred = gaussianBlur(copyImage(img), radius).data;
  const d = img.data;
  const k = amount / 100;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const diff = d[i + c] - blurred[i + c];
      if (Math.abs(diff) >= threshold) d[i + c] = d[i + c] + diff * k;
    }
  }
  return img;
}

export function sharpen(img) {
  return unsharpMask(img, { amount: 60, radius: 1, threshold: 0 });
}

export function sharpenMore(img) {
  return unsharpMask(img, { amount: 140, radius: 1.2, threshold: 0 });
}

export function highPass(img, { radius = 10 }) {
  const blurred = gaussianBlur(copyImage(img), radius).data;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) d[i + c] = 128 + (d[i + c] - blurred[i + c]);
  }
  return img;
}

/* ------------------------------------------------------------- stylize */

export function emboss(img, { angle = 135, height = 2, amount = 100 }) {
  const { width: w, height: h } = img;
  const src = copyImage(img).data;
  const d = img.data;
  const rad = (angle * Math.PI) / 180;
  const ox = Math.round(Math.cos(rad) * height);
  const oy = Math.round(-Math.sin(rad) * height);
  const k = amount / 100;
  const lum = (x, y) => {
    const j = (clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)) * 4;
    return luma(src[j], src[j + 1], src[j + 2]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = 128 + (lum(x + ox, y + oy) - lum(x - ox, y - oy)) * k;
      const j = (y * w + x) * 4;
      d[j] = d[j + 1] = d[j + 2] = v;
    }
  }
  return img;
}

export function findEdges(img) {
  const { width: w, height: h } = img;
  const src = copyImage(img).data;
  const d = img.data;
  const px = (x, y, c) => src[(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)) * 4 + c];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const gx =
          -px(x - 1, y - 1, c) - 2 * px(x - 1, y, c) - px(x - 1, y + 1, c) +
          px(x + 1, y - 1, c) + 2 * px(x + 1, y, c) + px(x + 1, y + 1, c);
        const gy =
          -px(x - 1, y - 1, c) - 2 * px(x, y - 1, c) - px(x + 1, y - 1, c) +
          px(x - 1, y + 1, c) + 2 * px(x, y + 1, c) + px(x + 1, y + 1, c);
        d[j + c] = 255 - Math.min(255, Math.hypot(gx, gy) * 0.5);
      }
    }
  }
  return img;
}

export function pixelate(img, { size = 10 }) {
  const { width: w, height: h, data: d } = img;
  size = Math.max(1, Math.round(size));
  for (let by = 0; by < h; by += size) {
    for (let bx = 0; bx < w; bx += size) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const ey = Math.min(by + size, h), ex = Math.min(bx + size, w);
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const j = (y * w + x) * 4;
          const al = d[j + 3];
          r += d[j] * al;
          g += d[j + 1] * al;
          b += d[j + 2] * al;
          a += al;
          n++;
        }
      }
      const rr = a ? r / a : 0, gg = a ? g / a : 0, bb = a ? b / a : 0, aa = a / n;
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const j = (y * w + x) * 4;
          d[j] = rr;
          d[j + 1] = gg;
          d[j + 2] = bb;
          d[j + 3] = aa;
        }
      }
    }
  }
  return img;
}

export function addNoise(img, { amount = 12, mono = true }) {
  const d = img.data;
  const k = (amount / 100) * 255;
  for (let i = 0; i < d.length; i += 4) {
    if (mono) {
      const n = (Math.random() - 0.5) * 2 * k;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    } else {
      d[i] += (Math.random() - 0.5) * 2 * k;
      d[i + 1] += (Math.random() - 0.5) * 2 * k;
      d[i + 2] += (Math.random() - 0.5) * 2 * k;
    }
  }
  return img;
}

export function vignette(img, { amount = 50, size = 50 }) {
  const { width: w, height: h, data: d } = img;
  const cx = w / 2, cy = h / 2;
  const maxR = Math.hypot(cx, cy);
  const inner = (size / 100) * 0.9;
  const k = amount / 100;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = Math.hypot(x - cx, y - cy) / maxR;
      let f = t <= inner ? 0 : (t - inner) / (1 - inner);
      f = f * f * (3 - 2 * f);
      const j = (y * w + x) * 4;
      if (k >= 0) {
        const m = 1 - f * k;
        d[j] *= m;
        d[j + 1] *= m;
        d[j + 2] *= m;
      } else {
        const m = -f * k;
        d[j] += (255 - d[j]) * m;
        d[j + 1] += (255 - d[j + 1]) * m;
        d[j + 2] += (255 - d[j + 2]) * m;
      }
    }
  }
  return img;
}

/* ---------------------------------------------------------- adjustments */

export function invert(img) {
  return applyLut(img, makeLut((v) => 255 - v));
}

export function desaturate(img) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = luma(d[i], d[i + 1], d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = l;
  }
  return img;
}

export function blackWhite(img, { reds = 40, yellows = 60, greens = 40, cyans = 60, blues = 20, magentas = 80 }) {
  // Hue-weighted grayscale conversion, similar to Photoshop's Black & White.
  const d = img.data;
  const weights = [reds, yellows, greens, cyans, blues, magentas].map((v) => v / 100);
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const [hh, s, l] = rgbToHsl(r, g, b);
    const pos = hh / 60;
    const i0 = Math.floor(pos) % 6;
    const i1 = (i0 + 1) % 6;
    const t = pos - Math.floor(pos);
    const wgt = weights[i0] * (1 - t) + weights[i1] * t;
    const base = luma(d[i], d[i + 1], d[i + 2]);
    const v = base + (wgt - 0.5) * s * 255 * 0.9 * (1 - Math.abs(2 * l - 1));
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return img;
}

export function sepia(img, { amount = 100 } = {}) {
  const d = img.data;
  const k = amount / 100;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    d[i] = r + (Math.min(255, r * 0.393 + g * 0.769 + b * 0.189) - r) * k;
    d[i + 1] = g + (Math.min(255, r * 0.349 + g * 0.686 + b * 0.168) - g) * k;
    d[i + 2] = b + (Math.min(255, r * 0.272 + g * 0.534 + b * 0.131) - b) * k;
  }
  return img;
}

export function threshold(img, { level = 128 }) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = luma(d[i], d[i + 1], d[i + 2]) >= level ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  return img;
}

export function posterize(img, { levels = 4 }) {
  const n = Math.max(2, Math.round(levels));
  const step = 255 / (n - 1);
  return applyLut(img, makeLut((v) => Math.round(Math.round(v / step) * step)));
}

export function brightnessContrast(img, { brightness = 0, contrast = 0 }) {
  const c = clamp(contrast, -100, 100) * 2.55;
  const f = (259 * (c + 255)) / (255 * (259 - c));
  const b = brightness;
  return applyLut(img, makeLut((v) => f * (v + b - 128) + 128));
}

export function exposure(img, { exposure: ev = 0, offset = 0, gamma = 1 }) {
  const mul = Math.pow(2, ev);
  return applyLut(
    img,
    makeLut((v) => {
      let x = (v / 255) * mul + offset;
      x = Math.max(0, x);
      return Math.pow(x, 1 / gamma) * 255;
    }),
  );
}

export function levels(img, { inBlack = 0, inWhite = 255, gamma = 1, outBlack = 0, outWhite = 255 }) {
  const range = Math.max(1, inWhite - inBlack);
  return applyLut(
    img,
    makeLut((v) => {
      let x = clamp((v - inBlack) / range, 0, 1);
      x = Math.pow(x, 1 / gamma);
      return outBlack + x * (outWhite - outBlack);
    }),
  );
}

function channelClip(hist, total, clipFrac) {
  const clip = total * clipFrac;
  let lo = 0, hi = 255, acc = 0;
  for (; lo < 255; lo++) {
    acc += hist[lo];
    if (acc > clip) break;
  }
  acc = 0;
  for (; hi > 0; hi--) {
    acc += hist[hi];
    if (acc > clip) break;
  }
  return [lo, Math.max(hi, lo + 1)];
}

export function autoTone(img) {
  const d = img.data;
  const hists = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    hists[0][d[i]]++;
    hists[1][d[i + 1]]++;
    hists[2][d[i + 2]]++;
    total++;
  }
  if (!total) return img;
  const luts = hists.map((h) => {
    const [lo, hi] = channelClip(h, total, 0.001);
    return makeLut((v) => ((v - lo) / (hi - lo)) * 255);
  });
  return applyLut(img, luts[0], luts[1], luts[2]);
}

export function autoContrast(img) {
  const d = img.data;
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    hist[Math.round(luma(d[i], d[i + 1], d[i + 2]))]++;
    total++;
  }
  if (!total) return img;
  const [lo, hi] = channelClip(hist, total, 0.001);
  return applyLut(img, makeLut((v) => ((v - lo) / (hi - lo)) * 255));
}

export function hueSaturation(img, { hue = 0, saturation = 0, lightness = 0, colorize = false }) {
  const d = img.data;
  const sat = saturation / 100;
  const lig = lightness / 100;
  for (let i = 0; i < d.length; i += 4) {
    let [h, s, l] = rgbToHsl(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
    if (colorize) {
      h = (hue + 360) % 360;
      s = clamp((saturation + 100) / 200, 0, 1);
    } else {
      h += hue;
      s = sat >= 0 ? s + (1 - s) * sat * s : s * (1 + sat);
    }
    l = lig >= 0 ? l + (1 - l) * lig : l * (1 + lig);
    const [r, g, b] = hslToRgb(h, clamp(s, 0, 1), clamp(l, 0, 1));
    d[i] = r * 255;
    d[i + 1] = g * 255;
    d[i + 2] = b * 255;
  }
  return img;
}

export function vibrance(img, { vibrance: vib = 0, saturation = 0 }) {
  const d = img.data;
  const v = vib / 100;
  const s = saturation / 100;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b);
    const avg = (r + g + b) / 3;
    const amt = (((Math.abs(max - avg) * 2) / 255) * -v + v) + s;
    d[i] = r + (r - avg) * amt;
    d[i + 1] = g + (g - avg) * amt;
    d[i + 2] = b + (b - avg) * amt;
  }
  return img;
}

export function colorBalance(img, { cyanRed = 0, magentaGreen = 0, yellowBlue = 0, tone = 'midtones', preserveLuminosity = true }) {
  const d = img.data;
  const weight = (l) => {
    if (tone === 'shadows') return clamp(1 - l / 0.5, 0, 1);
    if (tone === 'highlights') return clamp((l - 0.5) / 0.5, 0, 1);
    return 1 - Math.abs(l - 0.5) * 2;
  };
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const l0 = luma(r, g, b);
    const w = weight(l0 / 255) * 0.6;
    let nr = r + cyanRed * w * 1.28;
    let ng = g + magentaGreen * w * 1.28;
    let nb = b + yellowBlue * w * 1.28;
    if (preserveLuminosity) {
      const l1 = luma(nr, ng, nb);
      const diff = l0 - l1;
      nr += diff;
      ng += diff;
      nb += diff;
    }
    d[i] = nr;
    d[i + 1] = ng;
    d[i + 2] = nb;
  }
  return img;
}

export function photoFilter(img, { color = '#ec8a00', density = 25 }) {
  const n = parseInt(color.slice(1), 16);
  const cr = (n >> 16) & 255, cg = (n >> 8) & 255, cb = n & 255;
  const k = density / 100;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l0 = luma(d[i], d[i + 1], d[i + 2]);
    let r = d[i] * (1 - k) + ((d[i] * cr) / 255) * k;
    let g = d[i + 1] * (1 - k) + ((d[i + 1] * cg) / 255) * k;
    let b = d[i + 2] * (1 - k) + ((d[i + 2] * cb) / 255) * k;
    const diff = l0 - luma(r, g, b);
    d[i] = r + diff;
    d[i + 1] = g + diff;
    d[i + 2] = b + diff;
  }
  return img;
}

export function gradientMap(img, { from = '#000000', to = '#ffffff' }) {
  const a = parseInt(from.slice(1), 16), b = parseInt(to.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const t = luma(d[i], d[i + 1], d[i + 2]) / 255;
    d[i] = ar + (br - ar) * t;
    d[i + 1] = ag + (bg - ag) * t;
    d[i + 2] = ab + (bb - ab) * t;
  }
  return img;
}

export function histogram(img) {
  const d = img.data;
  const r = new Uint32Array(256), g = new Uint32Array(256), b = new Uint32Array(256), l = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    r[d[i]]++;
    g[d[i + 1]]++;
    b[d[i + 2]]++;
    l[Math.round(luma(d[i], d[i + 1], d[i + 2]))]++;
  }
  return { r, g, b, l };
}
