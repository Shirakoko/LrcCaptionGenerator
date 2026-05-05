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
}

export type EntranceName =
  | 'typewriter'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'scalePop'
  | 'scatter'
  | 'flipX'
  | 'blurFade'
  | 'wave'
  | 'fadeIn'
  | 'glitch';

export type IdleName =
  | 'float'
  | 'charJitter'
  | 'breathe'
  | 'none';

export type ExitName =
  | 'fadeOut'
  | 'floatUp'
  | 'floatDown'
  | 'explode'
  | 'shrink'
  | 'afterimage'
  | 'blurOut';

export interface EffectSet {
  entrance: EntranceName;
  idle: IdleName;
  exit: ExitName;
}

export const ENTRANCES: EntranceName[] = [
  'typewriter', 'slideLeft', 'slideRight', 'slideUp', 'slideDown',
  'scalePop', 'scatter', 'flipX', 'blurFade', 'wave', 'fadeIn', 'glitch',
];
export const IDLES: IdleName[] = ['float', 'charJitter', 'breathe', 'none'];
export const EXITS: ExitName[] = ['fadeOut', 'floatUp', 'floatDown', 'explode', 'shrink', 'afterimage', 'blurOut'];

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
}

export type OverrideMap = Record<number, LineOverride>;

export function pickEffects(rng: Prng, override?: EffectOverride): EffectSet {
  return {
    entrance: override?.entrance ?? rng.pick(ENTRANCES),
    idle: override?.idle ?? rng.pick(IDLES),
    exit: override?.exit ?? rng.pick(EXITS),
  };
}

export function makeCharState(char: string, x: number, y: number): CharState {
  return { char, x, y, baseX: x, baseY: y, alpha: 1, scaleX: 1, scaleY: 1, rotation: 0, blur: 0 };
}
