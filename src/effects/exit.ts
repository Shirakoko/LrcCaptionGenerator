import type { LineState, ExitName } from './types.ts';
import type { Prng } from '../random/prng.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Timeline = any;

type P = Record<string, number>;

export function buildExit(
  name: ExitName,
  line: LineState,
  tl: Timeline,
  at: number,
  rng: Prng,
  params: P = {},
): void {
  const chars = line.chars;
  const n = chars.length;

  switch (name) {
    case 'fadeOut': {
      const duration = params.duration ?? 0.45;
      tl.to(line, { alpha: 0, duration, ease: 'power1.in' }, at);
      break;
    }

    case 'floatUp': {
      const distance = params.distance ?? 60;
      const duration = params.duration ?? 0.45;
      const stagger  = params.stagger  ?? 0.03;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, { y: c.baseY - distance, alpha: 0, duration, ease: 'power2.in' }, at + i * stagger);
      }
      break;
    }

    case 'floatDown': {
      const distance = params.distance ?? 60;
      const duration = params.duration ?? 0.45;
      const stagger  = params.stagger  ?? 0.03;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, { y: c.baseY + distance, alpha: 0, duration, ease: 'power2.in' }, at + i * stagger);
      }
      break;
    }

    case 'explode': {
      const spreadX  = params.spreadX  ?? 200;
      const spreadY  = params.spreadY  ?? 150;
      const duration = params.duration ?? 0.45;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, {
          x: c.baseX + rng.range(-spreadX, spreadX),
          y: c.baseY + rng.range(-spreadY, spreadY),
          alpha: 0,
          scaleX: rng.range(0.5, 2),
          scaleY: rng.range(0.5, 2),
          duration,
          ease: 'power2.in',
        }, at + rng.range(0, 0.1));
      }
      break;
    }

    case 'shrink': {
      const duration = params.duration ?? 0.45;
      const stagger  = params.stagger  ?? 0.04;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, { scaleX: 0, scaleY: 0, alpha: 0, duration, ease: 'power2.in' }, at + i * stagger);
      }
      break;
    }

    case 'afterimage': {
      const trailDistance = params.trailDistance ?? 20;
      const duration      = params.duration      ?? 0.45;
      tl.to(line, { alpha: 0, duration: duration * 0.6, ease: 'power3.in' }, at);
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, { x: c.baseX + trailDistance, duration, ease: 'power1.in' }, at);
      }
      break;
    }

    case 'blurOut': {
      const blurAmount = params.blurAmount ?? 20;
      const duration   = params.duration   ?? 0.45;
      const stagger    = params.stagger    ?? 0.03;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, { blur: blurAmount, alpha: 0, duration, ease: 'power2.in' }, at + i * stagger);
      }
      break;
    }
  }
}
