import type { LineState } from '../effects/types.ts';

export interface RenderConfig {
  width: number;
  height: number;
  bgColor: string;
  bgImage: HTMLImageElement | null;
  bgBrightness: number;  // 0-200, 100 = 原始
  bgContrast: number;
  bgSaturate: number;
  fontFamily: string;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
}

export const DEFAULT_CONFIG: RenderConfig = {
  width: 1920,
  height: 1080,
  bgColor: '#000000',
  bgImage: null,
  bgBrightness: 100,
  bgContrast: 100,
  bgSaturate: 100,
  fontFamily: 'Noto Sans SC, sans-serif',
  fillColor: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 0,
};

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  lines: LineState[],
  cfg: RenderConfig,
  transparentBg = false,
): void {
  const { width, height, bgColor, fontFamily, fillColor, strokeColor, strokeWidth } = cfg;

  ctx.clearRect(0, 0, width, height);

  if (!transparentBg) {
    if (cfg.bgImage) {
      const { bgBrightness, bgContrast, bgSaturate } = cfg;
      const needsFilter = bgBrightness !== 100 || bgContrast !== 100 || bgSaturate !== 100;
      if (needsFilter) {
        ctx.filter = `brightness(${bgBrightness}%) contrast(${bgContrast}%) saturate(${bgSaturate}%)`;
      }
      const img = cfg.bgImage;
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const sw = img.naturalWidth * scale;
      const sh = img.naturalHeight * scale;
      ctx.drawImage(img, (width - sw) / 2, (height - sh) / 2, sw, sh);
      if (needsFilter) ctx.filter = 'none';
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }
  }

  for (const line of lines) {
    if (line.alpha <= 0) continue;

    const { layout, chars, alpha, scaleX, scaleY } = line;
    const { x, y, fontSize, rotation } = layout;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rotation * (Math.PI / 180));
    ctx.scale(scaleX, scaleY);

    ctx.font = `${fontSize}px "${fontFamily}"`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    for (const c of chars) {
      if (c.alpha <= 0) continue;

      ctx.save();
      ctx.globalAlpha = alpha * c.alpha;
      ctx.translate(c.x - x, c.y - y);
      ctx.rotate(c.rotation * (Math.PI / 180));
      ctx.scale(c.scaleX, c.scaleY);

      if (c.blur > 0) {
        ctx.filter = `blur(${c.blur.toFixed(1)}px)`;
      } else {
        ctx.filter = 'none';
      }

      const sw = strokeWidth + line.strokeWidth;
      if (sw > 0.1) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = sw;
        ctx.lineJoin = 'round';
        ctx.strokeText(c.char, 0, 0);
      }
      ctx.fillStyle = fillColor;
      ctx.fillText(c.char, 0, 0);

      ctx.restore();
    }

    ctx.restore();
  }
}
