import type { Prng } from '../random/prng.ts';

export type Align = 'left' | 'center' | 'right';

export interface LineLayout {
  x: number;
  y: number;
  align: Align;
  fontSize: number;
  letterSpacing: number;
  rotation: number;
}

// 每个字符的渲染状态，GSAP 直接 tween 这些属性
export interface CharState {
  char: string;
  x: number;
  y: number;
  alpha: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  blur: number;
  // 基准位置（不被 tween 修改）
  baseX: number;
  baseY: number;
  /** Per-character size multiplier for decoration randomisation (generated once at init) */
  decoSizeScale: number;
}

// ── Char decoration (background shape behind each character) ──────────────────

export interface CharDecoration {
  enabled: boolean;
  shape: 'rect' | 'circle' | 'diamond';
  /** Half-side for rect/diamond, radius for circle, in px */
  size: number;
  color: string;
  /** If true, each character's shape size is randomised per-frame */
  randomSize: boolean;
  /** Fraction of size to vary: actual size ∈ [size*(1-r), size*(1+r)] */
  randomRange: number;
}

// ── Pixel effects ─────────────────────────────────────────────────────────────

export type PixelFxName =
  | 'blur'
  | 'chromaticAberration'
  | 'grain'
  | 'pixelate'
  | 'glow';

export interface PixelFxEntry {
  name: PixelFxName;
  params: Record<string, number | string>;
  enabled: boolean;
}

export interface LineState {
  chars: CharState[];
  layout: LineLayout;
  alpha: number;
  scaleX: number;
  scaleY: number;
  strokeWidth: number;
  strokeWidthOverride?: number;
  fontFamily?: string;
  fillColor?: string;
  strokeColor?: string;
  pixelFx: PixelFxEntry[];
  decoration?: CharDecoration;
}

export type EntranceName =
  | 'none'
  | 'typewriter'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'scalePop'
  | 'wave'
  | 'fadeIn'
  | 'glitch'
  | 'flipIn'
  | 'converge'
  | 'elasticBounce'
  | 'staggerDrop';

export type IdleName =
  | 'float'
  | 'charJitter'
  | 'breathe'
  | 'altFloat'
  | 'ripple'
  | 'flicker'
  | 'invertFlicker'
  | 'sway'
  | 'none';

export type ExitName =
  | 'none'
  | 'fadeOut'
  | 'floatUp'
  | 'floatDown'
  | 'explode'
  | 'shrink'
  | 'afterimage'
  | 'blurOut'
  | 'squash'
  | 'particleFall';

export interface EffectSet {
  entrance: EntranceName;
  idle: IdleName;
  exit: ExitName;
}

// All entrance names in UI order (none first)
export const ENTRANCES: EntranceName[] = [
  'none',
  'typewriter', 'slideLeft', 'slideRight', 'slideUp', 'slideDown',
  'scalePop', 'wave', 'fadeIn', 'glitch',
  'flipIn', 'converge', 'elasticBounce', 'staggerDrop',
];
export const IDLES: IdleName[] = ['none', 'float', 'charJitter', 'breathe', 'altFloat', 'ripple', 'flicker', 'invertFlicker', 'sway'];
export const EXITS: ExitName[] = [
  'none',
  'fadeOut', 'floatUp', 'floatDown', 'explode', 'shrink', 'afterimage', 'blurOut', 'squash', 'particleFall',
];

// Pools used by random picker — exclude 'none' so random builds always have visible effects
const _ENTRANCES_RAND: EntranceName[] = ENTRANCES.filter(e => e !== 'none');
const _IDLES_RAND: IdleName[]         = IDLES.filter(e => e !== 'none');
const _EXITS_RAND: ExitName[]         = EXITS.filter(e => e !== 'none');

// ── Override types ────────────────────────────────────────────────────────────

export interface LayoutOverride {
  x?: number;
  y?: number;
  fontSize?: number;
  align?: Align;
  letterSpacingExtra?: number;
  rotation?: number;
  fontFamily?: string;
}

export interface EffectOverride {
  entrance?: EntranceName;
  entranceParams?: Record<string, number>;
  idle?: IdleName;
  idleParams?: Record<string, number>;
  exit?: ExitName;
  exitParams?: Record<string, number>;
}

export interface LineOverride {
  text?: string;
  layout?: LayoutOverride;
  effects?: EffectOverride;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  pixelFx?: PixelFxEntry[];
  decoration?: CharDecoration;
}

export type OverrideMap = Record<number, LineOverride>;

export function pickEffects(rng: Prng, override?: EffectOverride): EffectSet {
  return {
    entrance: override?.entrance ?? rng.pick(_ENTRANCES_RAND),
    idle: override?.idle ?? rng.pick(_IDLES_RAND),
    exit: override?.exit ?? rng.pick(_EXITS_RAND),
  };
}

export function makeCharState(char: string, x: number, y: number): CharState {
  return { char, x, y, baseX: x, baseY: y, alpha: 1, scaleX: 1, scaleY: 1, rotation: 0, blur: 0, decoSizeScale: 1 };
}
