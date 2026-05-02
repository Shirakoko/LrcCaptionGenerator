import type { LineState, ExitName } from './types.ts';
import type { Prng } from '../random/prng.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Timeline = any;

const DUR = 0.45;

export function buildExit(
  name: ExitName,
  line: LineState,
  tl: Timeline,
  at: number,
  rng: Prng,
): void {
  const chars = line.chars;
  const n = chars.length;

  switch (name) {
    case 'fadeOut': {
      tl.to(line, { alpha: 0, duration: DUR, ease: 'power1.in' }, at);
      break;
    }

    case 'floatUp': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, { y: c.baseY - 60, alpha: 0, duration: DUR, ease: 'power2.in' }, at + i * 0.03);
      }
      break;
    }

    case 'floatDown': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, { y: c.baseY + 60, alpha: 0, duration: DUR, ease: 'power2.in' }, at + i * 0.03);
      }
      break;
    }

    case 'explode': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, {
          x: c.baseX + rng.range(-200, 200),
          y: c.baseY + rng.range(-150, 150),
          alpha: 0,
          scaleX: rng.range(0.5, 2),
          scaleY: rng.range(0.5, 2),
          duration: DUR,
          ease: 'power2.in',
        }, at + rng.range(0, 0.1));
      }
      break;
    }

    case 'shrink': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, { scaleX: 0, scaleY: 0, alpha: 0, duration: DUR, ease: 'power2.in' }, at + i * 0.04);
      }
      break;
    }

    case 'afterimage': {
      // 快速淡出 + 轻微右移残影
      tl.to(line, { alpha: 0, duration: DUR * 0.6, ease: 'power3.in' }, at);
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, { x: c.baseX + 20, duration: DUR, ease: 'power1.in' }, at);
      }
      break;
    }
  }
}
