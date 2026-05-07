import type { PixelFxEntry } from './types.ts';
import { WebGLPipeline } from './webgl/WebGLPipeline.ts';

// ── Shared offscreen 2D canvas (for text rendering) ───────────────────────────

let _offscreen: HTMLCanvasElement | null = null;
let _offCtx: CanvasRenderingContext2D | null = null;

function getOffscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  if (!_offscreen) {
    _offscreen = document.createElement('canvas');
    _offCtx = _offscreen.getContext('2d')!;
  }
  if (_offscreen.width !== w || _offscreen.height !== h) {
    _offscreen.width  = w;
    _offscreen.height = h;
  } else {
    _offCtx!.clearRect(0, 0, w, h);
  }
  return [_offscreen, _offCtx!];
}

// ── Shared WebGL pipeline (lazy-initialised) ──────────────────────────────────

let _pipeline: WebGLPipeline | null = null;

function getPipeline(w: number, h: number): WebGLPipeline {
  if (!_pipeline) {
    _pipeline = new WebGLPipeline(w, h);
  } else {
    _pipeline.resize(w, h);
  }
  return _pipeline;
}

// ── Colour helper ─────────────────────────────────────────────────────────────

function hexToRgb01(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  const len = c.length;
  if (len === 3) {
    return [
      parseInt(c[0] + c[0], 16) / 255,
      parseInt(c[1] + c[1], 16) / 255,
      parseInt(c[2] + c[2], 16) / 255,
    ];
  }
  return [
    parseInt(c.slice(0, 2), 16) / 255,
    parseInt(c.slice(2, 4), 16) / 255,
    parseInt(c.slice(4, 6), 16) / 255,
  ];
}

// ── Main compositor ───────────────────────────────────────────────────────────

/**
 * Draw a line to an offscreen 2D canvas via `drawLine`, apply WebGL pixel
 * effects, then composite the result onto `mainCtx`.
 *
 * The external signature is identical to the old canvas-2D implementation so
 * canvasRenderer.ts requires no changes.
 */
export function applyPixelFxToLine(
  mainCtx: CanvasRenderingContext2D,
  drawLine: (ctx: CanvasRenderingContext2D) => void,
  fxList: PixelFxEntry[],
  w: number, h: number,
): void {
  const active = fxList.filter(fx => fx.enabled);
  if (active.length === 0) return;

  // 1. Draw text onto the 2D offscreen canvas
  const [offscreen, offCtx] = getOffscreen(w, h);
  drawLine(offCtx);

  // 2. Upload to WebGL
  const pipeline = getPipeline(w, h);
  pipeline.uploadSource(offscreen);

  const now = performance.now() / 1000;

  // 3. Execute passes in fixed order ─────────────────────────────────────────

  // grain
  const grainFx = active.find(fx => fx.name === 'grain');
  if (grainFx) {
    pipeline.runPass('grain', {
      u_intensity: Number(grainFx.params.intensity ?? 0.3),
      u_size:      Number(grainFx.params.size      ?? 1),
      u_time:      now,
    });
  }

  // pixelate
  const pixelateFx = active.find(fx => fx.name === 'pixelate');
  if (pixelateFx) {
    pipeline.runPass('pixelate', {
      u_blockSize: Math.max(2, Number(pixelateFx.params.blockSize ?? 8)),
    });
  }

  // blur (standalone — not part of glow)
  const blurFx = active.find(fx => fx.name === 'blur');
  if (blurFx) {
    const r = Number(blurFx.params.radius ?? 4);
    pipeline.runPass('blur', { u_radius: r, u_direction: [1, 0] });
    pipeline.runPass('blur', { u_radius: r, u_direction: [0, 1] });
  }

  // glow (blur + composite)
  const glowFx = active.find(fx => fx.name === 'glow');
  if (glowFx) {
    const r     = Number(glowFx.params.radius ?? 10);
    const color = hexToRgb01((glowFx.params.color as string | undefined) ?? '#ffffff');
    pipeline.saveGlowSnapshot();
    pipeline.runPass('blur', { u_radius: r, u_direction: [1, 0] });
    pipeline.runPass('blur', { u_radius: r, u_direction: [0, 1] });
    pipeline.runGlowComposite(color, 1.5);
  }

  // chromaticAberration
  const caFx = active.find(fx => fx.name === 'chromaticAberration');
  if (caFx) {
    pipeline.runPass('chromaticAberration', {
      u_offset: Number(caFx.params.offset ?? 4),
    });
  }

  // 4. Composite back onto the main 2D canvas
  pipeline.composite(mainCtx);
}
