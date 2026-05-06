import type { LineState } from '../effects/types.ts';
import { applyPixelFxToLine } from '../effects/pixelFx.ts';

export interface RenderConfig {
  width: number;
  height: number;
  bgColor: string;
  bgImage: HTMLImageElement | null;
  bgBrightness: number;
  bgContrast: number;
  bgSaturate: number;
  fontFamily: string;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  // Transition blending (optional)
  bgTransitionType?: 'dissolve' | 'black_fade';
  bgBlend?: number;              // 0–1 progress into the transition
  bgImage2?: HTMLImageElement | null;
  bgImage2Brightness?: number;
  bgImage2Contrast?: number;
  bgImage2Saturate?: number;
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

// Draw all characters of a single line onto any 2D context.
function drawLineChars(
  ctx: CanvasRenderingContext2D,
  line: LineState,
  fontFamily: string,
  fillColor: string,
  strokeColor: string,
  strokeWidth: number,
): void {
  const { layout, chars, alpha, scaleX, scaleY } = line;
  const { x, y, fontSize, rotation } = layout;
  const lineFontFamily  = line.fontFamily  ?? fontFamily;
  const lineFillColor   = line.fillColor   ?? fillColor;
  const lineStrokeColor = line.strokeColor ?? strokeColor;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation * (Math.PI / 180));
  ctx.scale(scaleX, scaleY);
  ctx.font = `${fontSize}px "${lineFontFamily}"`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // ── Draw background decorations (behind text) ────────────────────────────
  const dec = line.decoration;
  if (dec?.enabled) {
    ctx.save();
    ctx.fillStyle = dec.color;
    for (const c of chars) {
      if (c.alpha <= 0) continue;
      if (c.char.trim() === '') continue;
      const cx = c.x - x;
      const cy = c.y - y;
      const s = dec.randomSize
        ? dec.size * c.decoSizeScale
        : dec.size;
      if (dec.shape === 'rect') {
        ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
      } else if (dec.shape === 'diamond') {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  for (const c of chars) {
    if (c.alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = alpha * c.alpha;
    ctx.translate(c.x - x, c.y - y);
    ctx.rotate(c.rotation * (Math.PI / 180));
    ctx.scale(c.scaleX, c.scaleY);
    ctx.filter = c.blur > 0 ? `blur(${c.blur.toFixed(1)}px)` : 'none';

    const sw = (line.strokeWidthOverride ?? strokeWidth) + line.strokeWidth;
    if (sw > 0.1) {
      ctx.strokeStyle = lineStrokeColor;
      ctx.lineWidth = sw;
      ctx.lineJoin = 'round';
      ctx.strokeText(c.char, 0, 0);
    }
    ctx.fillStyle = lineFillColor;
    ctx.fillText(c.char, 0, 0);
    ctx.restore();
  }

  ctx.restore();
}

function _drawBgImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  brightness: number,
  contrast: number,
  saturate: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  const needsFilter = brightness !== 100 || contrast !== 100 || saturate !== 100;
  if (needsFilter) {
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`;
  }
  const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
  const sw = img.naturalWidth * scale;
  const sh = img.naturalHeight * scale;
  ctx.drawImage(img, (width - sw) / 2, (height - sh) / 2, sw, sh);
  if (needsFilter) ctx.filter = 'none';
  ctx.restore();
}

function _drawTransitionBg(
  ctx: CanvasRenderingContext2D,
  cfg: RenderConfig,
  progress: number,
): void {
  const { width, height, bgColor } = cfg;
  const b2 = cfg.bgImage2Brightness ?? 100;
  const c2 = cfg.bgImage2Contrast ?? 100;
  const s2 = cfg.bgImage2Saturate ?? 100;

  if (cfg.bgTransitionType === 'black_fade') {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
    if (progress < 0.5) {
      if (cfg.bgImage) {
        _drawBgImage(ctx, cfg.bgImage, width, height,
          cfg.bgBrightness, cfg.bgContrast, cfg.bgSaturate, 1 - progress * 2);
      }
    } else {
      if (cfg.bgImage2) {
        _drawBgImage(ctx, cfg.bgImage2, width, height, b2, c2, s2, (progress - 0.5) * 2);
      }
    }
  } else {
    // dissolve: draw A fully, then B at alpha=progress on top
    if (cfg.bgImage) {
      _drawBgImage(ctx, cfg.bgImage, width, height,
        cfg.bgBrightness, cfg.bgContrast, cfg.bgSaturate, 1);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }
    if (cfg.bgImage2) {
      _drawBgImage(ctx, cfg.bgImage2, width, height, b2, c2, s2, progress);
    }
  }
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  lines: LineState[],
  cfg: RenderConfig,
  transparentBg = false,
): void {
  const { width, height, bgColor, fontFamily, fillColor, strokeColor, strokeWidth } = cfg;

  ctx.clearRect(0, 0, width, height);

  if (!transparentBg) {
    if (cfg.bgTransitionType && cfg.bgBlend !== undefined && cfg.bgImage2 != null) {
      _drawTransitionBg(ctx, cfg, cfg.bgBlend);
    } else if (cfg.bgImage) {
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

    const activePixelFx = line.pixelFx.filter(fx => fx.enabled);

    if (activePixelFx.length === 0) {
      // Fast path — draw directly to main canvas
      drawLineChars(ctx, line, fontFamily, fillColor, strokeColor, strokeWidth);
    } else {
      // Pixel-effects path — draw to offscreen then composite with effects
      applyPixelFxToLine(
        ctx,
        (offCtx) => drawLineChars(offCtx, line, fontFamily, fillColor, strokeColor, strokeWidth),
        activePixelFx,
        width, height,
      );
    }
  }
}
