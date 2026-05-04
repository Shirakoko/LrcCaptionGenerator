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
  | 'wave';

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
  | 'afterimage';

export interface EffectSet {
  entrance: EntranceName;
  idle: IdleName;
  exit: ExitName;
}

export const ENTRANCES: EntranceName[] = [
  'typewriter', 'slideLeft', 'slideRight', 'slideUp', 'slideDown',
  'scalePop', 'scatter', 'flipX', 'blurFade', 'wave',
];
export const IDLES: IdleName[] = ['float', 'charJitter', 'breathe', 'none'];
export const EXITS: ExitName[] = ['fadeOut', 'floatUp', 'floatDown', 'explode', 'shrink', 'afterimage'];

// ── Override types ────────────────────────────────────────────────────────────

export interface LayoutOverride {
  x?: number;
  y?: number;
  fontSize?: number;
  align?: Align;
  letterSpacingExtra?: number;
  rotation?: number;
}

export interface EffectOverride {
  entrance?: EntranceName;
  idle?: IdleName;
  exit?: ExitName;
}

export interface LineOverride {
  layout?: LayoutOverride;
  effects?: EffectOverride;
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
