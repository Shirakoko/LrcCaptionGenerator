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

const ENTRANCES: EntranceName[] = [
  'typewriter', 'slideLeft', 'slideRight', 'slideUp', 'slideDown',
  'scalePop', 'scatter', 'flipX', 'blurFade', 'wave',
];
const IDLES: IdleName[] = ['float', 'charJitter', 'breathe', 'none'];
const EXITS: ExitName[] = ['fadeOut', 'floatUp', 'floatDown', 'explode', 'shrink', 'afterimage'];

export function pickEffects(rng: Prng): EffectSet {
  return {
    entrance: rng.pick(ENTRANCES),
    idle: rng.pick(IDLES),
    exit: rng.pick(EXITS),
  };
}

export function makeCharState(char: string, x: number, y: number): CharState {
  return { char, x, y, baseX: x, baseY: y, alpha: 1, scaleX: 1, scaleY: 1, rotation: 0, blur: 0 };
}
