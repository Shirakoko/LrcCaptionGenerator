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
  // 'none': line stays fully visible until it's removed from the scene
  if (name === 'none') return;

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

    case 'squash': {
      const duration = params.duration ?? 0.35;
      // Squash: compress scaleY to 0, slightly widen scaleX, then snap alpha to 0
      tl.to(line, {
        scaleY: 0,
        scaleX: 1.3,
        duration,
        ease: 'power3.in',
      }, at);
      tl.to(line, { alpha: 0, duration: 0.05 }, at + duration);
      break;
    }

    case 'particleFall': {
      // Each character becomes a "particle": falls down, rotates, shrinks, and fades out
      const fallDistance = params.fallDistance ?? 120;
      const duration     = params.duration     ?? 0.6;
      const spread       = params.spread       ?? 40;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        const dir = rng.range(-1, 1); // left or right drift
        tl.to(c, {
          y: c.baseY + fallDistance + rng.range(0, fallDistance * 0.5),
          x: c.baseX + dir * spread,
          rotation: dir * rng.range(90, 270),
          scaleX: rng.range(0.1, 0.4),
          scaleY: rng.range(0.1, 0.4),
          alpha: 0,
          duration: duration + rng.range(0, 0.2),
          ease: 'power2.in',
        }, at + rng.range(0, 0.15));
      }
      break;
    }
  }
}
