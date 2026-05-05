import type { PixelFxEntry } from './types.ts';

// Shared offscreen canvas — resized as needed, cleared before each use
let _offscreen: HTMLCanvasElement | null = null;
let _offCtx: CanvasRenderingContext2D | null = null;

function getOffscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  if (!_offscreen) {
    _offscreen = document.createElement('canvas');
    _offCtx = _offscreen.getContext('2d', { willReadFrequently: true })!;
  }
  if (_offscreen.width !== w || _offscreen.height !== h) {
    _offscreen.width = w;
    _offscreen.height = h;
  } else {
    _offCtx!.clearRect(0, 0, w, h);
  }
  return [_offscreen, _offCtx!];
}

// ── Pixel manipulation effects (operate on offscreen ImageData) ───────────────

function applyGrain(
  offCtx: CanvasRenderingContext2D,
  params: Record<string, number | string>,
  w: number, h: number,
): void {
  const intensity = Number(params.intensity ?? 0.3);
  const imageData = offCtx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 5) continue;
    const noise = (Math.random() * 2 - 1) * intensity * 255;
    data[i]     = Math.max(0, Math.min(255, data[i]     + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  offCtx.putImageData(imageData, 0, 0);
}

function applyPixelate(
  offCtx: CanvasRenderingContext2D,
  params: Record<string, number | string>,
  w: number, h: number,
): void {
  const block = Math.max(2, Math.round(Number(params.blockSize ?? 8)));
  const imageData = offCtx.getImageData(0, 0, w, h);
  const src = imageData.data;
  const out = new Uint8ClampedArray(src);

  for (let by = 0; by < h; by += block) {
    for (let bx = 0; bx < w; bx += block) {
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      const maxY = Math.min(by + block, h);
      const maxX = Math.min(bx + block, w);
      for (let py = by; py < maxY; py++) {
        for (let px = bx; px < maxX; px++) {
          const idx = (py * w + px) * 4;
          r += src[idx]; g += src[idx + 1]; b += src[idx + 2]; a += src[idx + 3];
          n++;
        }
      }
      if (n === 0) continue;
      const ar = r/n|0, ag = g/n|0, ab = b/n|0, aa = a/n|0;
      for (let py = by; py < maxY; py++) {
        for (let px = bx; px < maxX; px++) {
          const idx = (py * w + px) * 4;
          out[idx] = ar; out[idx + 1] = ag; out[idx + 2] = ab; out[idx + 3] = aa;
        }
      }
    }
  }
  offCtx.putImageData(new ImageData(out, w, h), 0, 0);
}

// ── Main compositor ───────────────────────────────────────────────────────────

/**
 * Draw a line to the offscreen canvas via `drawLine`, apply pixel effects,
 * then composite the result onto `mainCtx`.
 * `drawLine` should draw with the line's natural alpha baked in (no extra scaling needed).
 */
export function applyPixelFxToLine(
  mainCtx: CanvasRenderingContext2D,
  drawLine: (ctx: CanvasRenderingContext2D) => void,
  fxList: PixelFxEntry[],
  w: number, h: number,
): void {
  const active = fxList.filter(fx => fx.enabled);
  if (active.length === 0) return;

  const [offscreen, offCtx] = getOffscreen(w, h);
  drawLine(offCtx);

  // Pixel manipulation (operate in-place on offscreen)
  for (const fx of active) {
    if (fx.name === 'grain')    applyGrain(offCtx, fx.params, w, h);
    if (fx.name === 'pixelate') applyPixelate(offCtx, fx.params, w, h);
  }

  // Build CSS filter string (blur + glow via drop-shadow)
  const filterParts: string[] = [];
  for (const fx of active) {
    if (fx.name === 'blur') {
      filterParts.push(`blur(${fx.params.radius}px)`);
    }
    if (fx.name === 'glow') {
      const r = fx.params.radius;
      const c = fx.params.color as string ?? '#ffffff';
      filterParts.push(`drop-shadow(0 0 ${r}px ${c}) drop-shadow(0 0 ${Number(r) * 0.5}px ${c})`);
    }
  }
  const cssFilter = filterParts.length ? filterParts.join(' ') : '';

  // Chromatic aberration: composite 3 colour-shifted copies
  const caFx = active.find(fx => fx.name === 'chromaticAberration');
  if (caFx) {
    const offset = Number(caFx.params.offset ?? 4);

    // Red shifted left
    mainCtx.save();
    mainCtx.globalCompositeOperation = 'screen';
    mainCtx.globalAlpha = 0.75;
    mainCtx.filter = (cssFilter ? cssFilter + ' ' : '') + 'sepia(1) saturate(10) hue-rotate(-30deg)';
    mainCtx.drawImage(offscreen, -offset, 0);
    mainCtx.restore();

    // Green (centre)
    mainCtx.save();
    mainCtx.globalCompositeOperation = 'screen';
    mainCtx.globalAlpha = 0.75;
    mainCtx.filter = (cssFilter ? cssFilter + ' ' : '') + 'sepia(1) saturate(10) hue-rotate(80deg)';
    mainCtx.drawImage(offscreen, 0, 0);
    mainCtx.restore();

    // Blue shifted right
    mainCtx.save();
    mainCtx.globalCompositeOperation = 'screen';
    mainCtx.globalAlpha = 0.75;
    mainCtx.filter = (cssFilter ? cssFilter + ' ' : '') + 'sepia(1) saturate(10) hue-rotate(190deg)';
    mainCtx.drawImage(offscreen, offset, 0);
    mainCtx.restore();

    // Restore original at reduced opacity so the base text is still legible
    mainCtx.save();
    mainCtx.globalAlpha = 0.6;
    if (cssFilter) mainCtx.filter = cssFilter;
    mainCtx.drawImage(offscreen, 0, 0);
    mainCtx.restore();
  } else {
    mainCtx.save();
    if (cssFilter) mainCtx.filter = cssFilter;
    mainCtx.drawImage(offscreen, 0, 0);
    mainCtx.restore();
  }
}
