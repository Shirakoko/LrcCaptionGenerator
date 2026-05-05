import type { LineLayout, LineState, Align, LayoutOverride } from '../effects/types.ts';
import { makeCharState } from '../effects/types.ts';
import type { Prng } from '../random/prng.ts';
import type { RenderConfig } from './canvasRenderer.ts';

export interface LayoutOptions {
  fontSize?: number;
  align?: Align;
  yZone?: [number, number];
  letterSpacingExtra?: number;
  rotation?: number;
}

export function buildLineState(
  text: string,
  ctx: CanvasRenderingContext2D,
  cfg: RenderConfig,
  rng: Prng,
  baseOpts: LayoutOptions = {},
  override?: LayoutOverride,
): LineState {
  const { width, height, fontFamily: cfgFont } = cfg;
  const effectiveFontFamily = override?.fontFamily ?? cfgFont;

  // Override > baseOpts > random
  const fontSize = override?.fontSize ?? baseOpts.fontSize ?? rng.range(52, 96);
  const align: Align = override?.align ?? baseOpts.align ?? rng.pick(['left', 'center', 'right'] as Align[]);
  const letterSpacingExtra = override?.letterSpacingExtra ?? baseOpts.letterSpacingExtra ?? rng.range(-2, 8);
  const rotation = override?.rotation ?? baseOpts.rotation ?? (rng.bool(0.3) ? rng.range(-4, 4) : 0);

  ctx.font = `${fontSize}px "${effectiveFontFamily}"`;

  const chars = [...text];
  const charWidths = chars.map(ch => ctx.measureText(ch).width + letterSpacingExtra);
  const totalWidth = charWidths.reduce((s, w) => s + w, 0);

  const margin = Math.max(width * 0.1, fontSize * 1.2);
  const maxTextWidth = width - margin * 2;
  const scaledFontSize = totalWidth > maxTextWidth
    ? fontSize * (maxTextWidth / totalWidth)
    : fontSize;

  const scaledCharWidths = totalWidth > maxTextWidth
    ? charWidths.map(w => w * (maxTextWidth / totalWidth))
    : charWidths;
  const scaledTotalWidth = scaledCharWidths.reduce((s, w) => s + w, 0);

  let startX: number;
  if (override?.x !== undefined) {
    // override.x is the center anchor X; derive startX from it
    startX = override.x - scaledTotalWidth / 2;
  } else if (align === 'center') {
    startX = (width - scaledTotalWidth) / 2;
  } else if (align === 'right') {
    startX = width - margin - scaledTotalWidth;
  } else {
    startX = margin;
  }

  const [yMin, yMax] = baseOpts.yZone ?? [0.25, 0.78];
  const lineY = override?.y ?? height * rng.range(yMin, yMax);

  const layout: LineLayout = {
    x: startX + scaledTotalWidth / 2,
    y: lineY,
    align,
    fontSize: scaledFontSize,
    letterSpacing: letterSpacingExtra,
    rotation,
  };

  let curX = startX;
  const charStates = chars.map((ch, i) => {
    const cx = curX + scaledCharWidths[i] / 2;
    curX += scaledCharWidths[i];
    return makeCharState(ch, cx, lineY);
  });

  return {
    chars: charStates,
    layout,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    strokeWidth: 0,
    fontFamily: effectiveFontFamily,
    pixelFx: [],
  };
}
