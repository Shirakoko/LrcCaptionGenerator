import type { EntranceName, IdleName, ExitName, PixelFxName } from './types.ts';

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  default: number;
}

export function getDefaultParams(defs: ParamDef[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of defs) out[d.key] = d.default;
  return out;
}

// ── Shared param groups ───────────────────────────────────────────────────────

const slideHParams: ParamDef[] = [
  { key: 'distance', label: '滑动距离', min: 20, max: 300, step: 10, unit: 'px', default: 80 },
  { key: 'duration', label: '动画时长', min: 0.2, max: 1.5, step: 0.05, unit: 's', default: 0.55 },
  { key: 'stagger', label: '字符错位', min: 0, max: 0.12, step: 0.01, unit: 's', default: 0.04 },
];

const slideVParams: ParamDef[] = [
  { key: 'distance', label: '滑动距离', min: 20, max: 200, step: 10, unit: 'px', default: 60 },
  { key: 'duration', label: '动画时长', min: 0.2, max: 1.5, step: 0.05, unit: 's', default: 0.55 },
  { key: 'stagger', label: '字符错位', min: 0, max: 0.12, step: 0.01, unit: 's', default: 0.04 },
];

// ── Pixel effects ─────────────────────────────────────────────────────────────

export const PIXEL_FX_ORDER: PixelFxName[] = [
  'blur', 'chromaticAberration', 'grain', 'pixelate', 'glow',
];

export const PIXEL_FX_LABELS: Record<PixelFxName, string> = {
  blur: '模糊',
  chromaticAberration: '色散',
  grain: '噪点',
  pixelate: '马赛克',
  glow: '发光',
};

export const PIXEL_FX_PARAMS: Record<PixelFxName, ParamDef[]> = {
  blur: [
    { key: 'radius',    label: '半径', min: 0, max: 20, step: 0.5, unit: 'px', default: 4 },
  ],
  chromaticAberration: [
    { key: 'offset',    label: '强度', min: 0, max: 12, step: 0.5, unit: 'px', default: 4 },
  ],
  grain: [
    { key: 'intensity', label: '强度', min: 0,   max: 1,  step: 0.05, unit: '',   default: 0.3 },
    { key: 'size',      label: '粒度', min: 1,   max: 4,  step: 1,    unit: 'px', default: 1   },
  ],
  pixelate: [
    { key: 'blockSize', label: '块大小', min: 2, max: 24, step: 1, unit: 'px', default: 8 },
  ],
  glow: [
    { key: 'radius',    label: '半径', min: 0, max: 30, step: 1, unit: 'px', default: 10 },
  ],
};

// Color params (non-numeric) for pixel effects
export const PIXEL_FX_COLOR_PARAMS: Partial<Record<PixelFxName, Array<{ key: string; label: string; default: string }>>> = {
  glow: [{ key: 'color', label: '颜色', default: '#7c6af7' }],
};


export const ENTRANCE_PARAMS: Record<EntranceName, ParamDef[]> = {
  typewriter: [
    { key: 'charDur',   label: '出现时长', min: 0.02, max: 0.15, step: 0.01, unit: 's', default: 0.06 },
    { key: 'charDelay', label: '字符间隔', min: 0.02, max: 0.20, step: 0.01, unit: 's', default: 0.08 },
  ],
  slideLeft:  slideHParams,
  slideRight: slideHParams,
  slideUp:    slideVParams,
  slideDown:  slideVParams,
  scalePop: [
    { key: 'duration',    label: '动画时长', min: 0.2, max: 1.5,  step: 0.05, unit: 's', default: 0.55 },
    { key: 'stagger',     label: '字符错位', min: 0,   max: 0.15, step: 0.01, unit: 's', default: 0.05 },
    { key: 'elasticity',  label: '弹性强度', min: 0.3, max: 3.0,  step: 0.1,  unit: '',  default: 1.0  },
  ],
  scatter: [
    { key: 'spreadX',  label: '水平散布', min: 50,  max: 400, step: 10,   unit: 'px', default: 200  },
    { key: 'spreadY',  label: '垂直散布', min: 50,  max: 300, step: 10,   unit: 'px', default: 150  },
    { key: 'duration', label: '动画时长', min: 0.2, max: 1.5, step: 0.05, unit: 's',  default: 0.55 },
  ],
  flipX: [
    { key: 'duration', label: '动画时长', min: 0.2, max: 1.5,  step: 0.05, unit: 's', default: 0.55 },
    { key: 'stagger',  label: '字符错位', min: 0,   max: 0.15, step: 0.01, unit: 's', default: 0.05 },
  ],
  blurFade: [
    { key: 'blurAmount', label: '模糊程度', min: 5,   max: 60,  step: 5,    unit: 'px', default: 20   },
    { key: 'duration',   label: '动画时长', min: 0.2, max: 1.5, step: 0.05, unit: 's',  default: 0.55 },
    { key: 'stagger',    label: '字符错位', min: 0,   max: 0.12, step: 0.01, unit: 's', default: 0.04 },
  ],
  wave: [
    { key: 'waveHeight', label: '波浪高度', min: 5,    max: 80,   step: 5,    unit: 'px', default: 30   },
    { key: 'duration',   label: '动画时长', min: 0.2,  max: 1.5,  step: 0.05, unit: 's',  default: 0.55 },
    { key: 'stagger',    label: '字符错位', min: 0.01, max: 0.15, step: 0.01, unit: 's',  default: 0.06 },
  ],
  fadeIn: [
    { key: 'duration', label: '淡入时长', min: 0.1, max: 1.5,  step: 0.05, unit: 's', default: 0.5  },
    { key: 'stagger',  label: '字符错位', min: 0,   max: 0.15, step: 0.01, unit: 's', default: 0.04 },
  ],
  glitch: [
    { key: 'intensity',  label: '偏移强度', min: 5,    max: 100, step: 5,    unit: 'px', default: 30   },
    { key: 'flashCount', label: '闪动次数', min: 1,    max: 8,   step: 1,    unit: '',   default: 3    },
    { key: 'flashDur',   label: '闪动时长', min: 0.03, max: 0.2, step: 0.01, unit: 's',  default: 0.08 },
  ],
};

// ── Idle params ───────────────────────────────────────────────────────────────

export const IDLE_PARAMS: Record<IdleName, ParamDef[]> = {
  float: [
    { key: 'amplitude', label: '浮动幅度', min: 2, max: 20, step: 1,   unit: 'px', default: 6   },
    { key: 'period',    label: '周期',     min: 1, max: 6,  step: 0.5, unit: 's',  default: 2.5 },
  ],
  charJitter: [
    { key: 'amplitude', label: '抖动幅度', min: 1,    max: 10,  step: 0.5, unit: 'px', default: 3    },
    { key: 'speed',     label: '抖动速度', min: 0.05, max: 0.3, step: 0.01, unit: 's', default: 0.12 },
  ],
  breathe: [
    { key: 'scale',  label: '缩放量', min: 1.01, max: 1.15, step: 0.01, unit: 'x', default: 1.04 },
    { key: 'period', label: '周期',   min: 0.5,  max: 5,    step: 0.5,  unit: 's', default: 2    },
  ],
  none: [],
};

// ── Exit params ───────────────────────────────────────────────────────────────

export const EXIT_PARAMS: Record<ExitName, ParamDef[]> = {
  fadeOut: [
    { key: 'duration', label: '淡出时长', min: 0.1, max: 1.5, step: 0.05, unit: 's', default: 0.45 },
  ],
  floatUp: [
    { key: 'distance', label: '飘动距离', min: 20,  max: 200,  step: 10,   unit: 'px', default: 60   },
    { key: 'duration', label: '动画时长', min: 0.2, max: 1.5,  step: 0.05, unit: 's',  default: 0.45 },
    { key: 'stagger',  label: '字符错位', min: 0,   max: 0.12, step: 0.01, unit: 's',  default: 0.03 },
  ],
  floatDown: [
    { key: 'distance', label: '飘动距离', min: 20,  max: 200,  step: 10,   unit: 'px', default: 60   },
    { key: 'duration', label: '动画时长', min: 0.2, max: 1.5,  step: 0.05, unit: 's',  default: 0.45 },
    { key: 'stagger',  label: '字符错位', min: 0,   max: 0.12, step: 0.01, unit: 's',  default: 0.03 },
  ],
  explode: [
    { key: 'spreadX',  label: '水平散布', min: 50,  max: 400, step: 10,   unit: 'px', default: 200  },
    { key: 'spreadY',  label: '垂直散布', min: 50,  max: 300, step: 10,   unit: 'px', default: 150  },
    { key: 'duration', label: '动画时长', min: 0.2, max: 1.5, step: 0.05, unit: 's',  default: 0.45 },
  ],
  shrink: [
    { key: 'duration', label: '动画时长', min: 0.2, max: 1.5,  step: 0.05, unit: 's', default: 0.45 },
    { key: 'stagger',  label: '字符错位', min: 0,   max: 0.12, step: 0.01, unit: 's', default: 0.04 },
  ],
  afterimage: [
    { key: 'trailDistance', label: '残影距离', min: 5,   max: 60,  step: 5,    unit: 'px', default: 20   },
    { key: 'duration',      label: '持续时长', min: 0.2, max: 1.0, step: 0.05, unit: 's',  default: 0.45 },
  ],
  blurOut: [
    { key: 'blurAmount', label: '模糊程度', min: 5,   max: 60,   step: 5,    unit: 'px', default: 20   },
    { key: 'duration',   label: '动画时长', min: 0.2, max: 1.5,  step: 0.05, unit: 's',  default: 0.45 },
    { key: 'stagger',    label: '字符错位', min: 0,   max: 0.12, step: 0.01, unit: 's',  default: 0.03 },
  ],
};
