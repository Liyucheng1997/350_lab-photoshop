// Declarative definitions of adjustments and filters. Dialogs are generated from `params`.
import * as F from './filters.js';

const range = (key, label, min, max, def, extra = {}) => ({ type: 'range', key, label, min, max, default: def, step: 1, ...extra });
const check = (key, label, def = false) => ({ type: 'checkbox', key, label, default: def });
const color = (key, label, def) => ({ type: 'color', key, label, default: def });
const select = (key, label, options, def) => ({ type: 'select', key, label, options, default: def });

export const FILTERS = {
  /* --------------------------------------------------------- adjustments */
  brightnessContrast: {
    name: '亮度/对比度',
    icon: 'sun-medium',
    params: [range('brightness', '亮度', -150, 150, 0), range('contrast', '对比度', -50, 100, 0)],
    apply: F.brightnessContrast,
  },
  levels: {
    name: '色阶',
    icon: 'chart-column',
    params: [
      { type: 'histogram', key: '_hist' },
      range('inBlack', '输入黑场', 0, 253, 0),
      range('gamma', '中间调 (γ)', 0.1, 4, 1, { step: 0.01 }),
      range('inWhite', '输入白场', 2, 255, 255),
      range('outBlack', '输出黑场', 0, 255, 0),
      range('outWhite', '输出白场', 0, 255, 255),
    ],
    apply: F.levels,
  },
  exposure: {
    name: '曝光度',
    icon: 'aperture',
    params: [
      range('exposure', '曝光度', -5, 5, 0, { step: 0.01 }),
      range('offset', '位移', -0.5, 0.5, 0, { step: 0.001 }),
      range('gamma', '灰度系数校正', 0.1, 4, 1, { step: 0.01 }),
    ],
    apply: F.exposure,
  },
  vibrance: {
    name: '自然饱和度',
    icon: 'droplets',
    params: [range('vibrance', '自然饱和度', -100, 100, 0), range('saturation', '饱和度', -100, 100, 0)],
    apply: F.vibrance,
  },
  hueSaturation: {
    name: '色相/饱和度',
    icon: 'rainbow',
    params: [
      range('hue', '色相', -180, 180, 0),
      range('saturation', '饱和度', -100, 100, 0),
      range('lightness', '明度', -100, 100, 0),
      check('colorize', '着色'),
    ],
    apply: F.hueSaturation,
  },
  colorBalance: {
    name: '色彩平衡',
    icon: 'scale',
    params: [
      select('tone', '色调', [['shadows', '阴影'], ['midtones', '中间调'], ['highlights', '高光']], 'midtones'),
      range('cyanRed', '青色 ⟷ 红色', -100, 100, 0),
      range('magentaGreen', '洋红 ⟷ 绿色', -100, 100, 0),
      range('yellowBlue', '黄色 ⟷ 蓝色', -100, 100, 0),
      check('preserveLuminosity', '保持明度', true),
    ],
    apply: F.colorBalance,
  },
  blackWhite: {
    name: '黑白',
    icon: 'contrast',
    params: [
      range('reds', '红色', -200, 300, 40),
      range('yellows', '黄色', -200, 300, 60),
      range('greens', '绿色', -200, 300, 40),
      range('cyans', '青色', -200, 300, 60),
      range('blues', '蓝色', -200, 300, 20),
      range('magentas', '洋红', -200, 300, 80),
    ],
    apply: F.blackWhite,
  },
  photoFilter: {
    name: '照片滤镜',
    icon: 'camera',
    params: [color('color', '滤镜颜色', '#ec8a00'), range('density', '浓度', 1, 100, 25)],
    apply: F.photoFilter,
  },
  gradientMap: {
    name: '渐变映射',
    icon: 'blend',
    params: [color('from', '暗部颜色', '#1b1464'), color('to', '亮部颜色', '#ffd27a')],
    apply: F.gradientMap,
  },
  sepia: {
    name: '怀旧',
    icon: 'coffee',
    params: [range('amount', '数量', 0, 100, 100)],
    apply: F.sepia,
  },
  threshold: {
    name: '阈值',
    icon: 'eclipse',
    params: [range('level', '阈值色阶', 1, 255, 128)],
    apply: F.threshold,
  },
  posterize: {
    name: '色调分离',
    icon: 'layers-2',
    params: [range('levels', '色阶', 2, 32, 4)],
    apply: F.posterize,
  },
  invert: { name: '反相', icon: 'flip-vertical', apply: F.invert },
  desaturate: { name: '去色', icon: 'droplet-off', apply: F.desaturate },
  autoTone: { name: '自动色调', icon: 'wand-sparkles', apply: F.autoTone },
  autoContrast: { name: '自动对比度', icon: 'sparkles', apply: F.autoContrast },

  /* ------------------------------------------------------------- filters */
  gaussianBlur: {
    name: '高斯模糊',
    params: [range('radius', '半径', 0.1, 120, 4, { step: 0.1, unit: '像素' })],
    apply: (img, p) => F.gaussianBlur(img, p.radius),
  },
  motionBlur: {
    name: '动感模糊',
    params: [range('angle', '角度', -90, 90, 0, { unit: '°' }), range('distance', '距离', 1, 200, 20, { unit: '像素' })],
    apply: F.motionBlur,
  },
  radialBlur: {
    name: '径向模糊（缩放）',
    params: [range('amount', '数量', 1, 100, 15)],
    apply: F.radialBlur,
  },
  sharpen: { name: '锐化', apply: F.sharpen },
  sharpenMore: { name: '进一步锐化', apply: F.sharpenMore },
  unsharpMask: {
    name: 'USM 锐化',
    params: [
      range('amount', '数量', 1, 500, 120, { unit: '%' }),
      range('radius', '半径', 0.1, 50, 1.5, { step: 0.1, unit: '像素' }),
      range('threshold', '阈值', 0, 255, 0, { unit: '色阶' }),
    ],
    apply: F.unsharpMask,
  },
  highPass: {
    name: '高反差保留',
    params: [range('radius', '半径', 0.1, 100, 8, { step: 0.1, unit: '像素' })],
    apply: F.highPass,
  },
  addNoise: {
    name: '添加杂色',
    params: [range('amount', '数量', 0, 100, 12, { unit: '%' }), check('mono', '单色', true)],
    apply: F.addNoise,
  },
  pixelate: {
    name: '马赛克',
    params: [range('size', '单元格大小', 2, 200, 12, { unit: '方形' })],
    apply: F.pixelate,
  },
  emboss: {
    name: '浮雕效果',
    params: [range('angle', '角度', -180, 180, 135, { unit: '°' }), range('height', '高度', 1, 10, 3, { unit: '像素' }), range('amount', '数量', 1, 500, 120, { unit: '%' })],
    apply: F.emboss,
  },
  findEdges: { name: '查找边缘', apply: F.findEdges },
  vignette: {
    name: '晕影',
    params: [range('amount', '数量', -100, 100, 60), range('size', '中点', 0, 100, 45)],
    apply: F.vignette,
  },
};

export const ADJUSTMENT_PANEL = [
  'brightnessContrast', 'levels', 'exposure', 'vibrance',
  'hueSaturation', 'colorBalance', 'blackWhite', 'photoFilter',
  'invert', 'posterize', 'threshold', 'gradientMap',
];
