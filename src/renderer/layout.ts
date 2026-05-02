import type { LineLayout, LineState, Align } from '../effects/types.ts';
import { makeCharState } from '../effects/types.ts';
import type { Prng } from '../random/prng.ts';
import type { RenderConfig } from './canvasRenderer.ts';

export interface LayoutOptions {
  fontSize?: number;
  align?: Align;
  yZone?: [number, number]; // y 范围 [min, max]，相对于 canvas 高度的比例
  letterSpacingExtra?: number;
  rotation?: number;
}

export function buildLineState(
  text: string,
  ctx: CanvasRenderingContext2D,
  cfg: RenderConfig,
  rng: Prng,
  opts: LayoutOptions = {},
): LineState {
  const { width, height, fontFamily } = cfg;

  const fontSize = opts.fontSize ?? rng.range(52, 96);
  const align: Align = opts.align ?? rng.pick(['left', 'center', 'right'] as Align[]);
  const letterSpacingExtra = opts.letterSpacingExtra ?? rng.range(-2, 8);
  const rotation = opts.rotation ?? (rng.bool(0.3) ? rng.range(-4, 4) : 0);

  ctx.font = `${fontSize}px "${fontFamily}"`;

  // 测量每个字符宽度
  const chars = [...text];
  const charWidths = chars.map(ch => ctx.measureText(ch).width + letterSpacingExtra);
  const totalWidth = charWidths.reduce((s, w) => s + w, 0);

  // 安全边距：留出足够空间防止动效（弹性过冲）贴边
  const margin = Math.max(width * 0.1, fontSize * 1.2);

  // 如果文本超出安全区，缩小字号重新计算
  const maxTextWidth = width - margin * 2;
  const scaledFontSize = totalWidth > maxTextWidth
    ? fontSize * (maxTextWidth / totalWidth)
    : fontSize;

  const scaledCharWidths = totalWidth > maxTextWidth
    ? charWidths.map(w => w * (maxTextWidth / totalWidth))
    : charWidths;
  const scaledTotalWidth = scaledCharWidths.reduce((s, w) => s + w, 0);

  // 计算行起始 x
  let startX: number;
  if (align === 'center') {
    startX = (width - scaledTotalWidth) / 2;
  } else if (align === 'right') {
    startX = width - margin - scaledTotalWidth;
  } else {
    startX = margin;
  }

  // 计算行 y（随机在 yZone 内，同样留安全边距）
  const [yMin, yMax] = opts.yZone ?? [0.25, 0.78];
  const lineY = height * rng.range(yMin, yMax);

  const layout: LineLayout = {
    x: startX + scaledTotalWidth / 2,
    y: lineY,
    align,
    fontSize: scaledFontSize,
    letterSpacing: letterSpacingExtra,
    rotation,
  };

  // 构建字符状态
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
  };
}
