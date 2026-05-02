import type { LineState, IdleName } from './types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Timeline = any;

export function buildIdleTween(
  name: IdleName,
  line: LineState,
  tl: Timeline,
  at: number,
  duration: number,
): void {
  if (name === 'none') return;

  const chars = line.chars;
  const n = chars.length;

  switch (name) {
    case 'float': {
      const amp = 6;
      const period = 2.5;
      tl.to(line, {
        scaleY: 1.02,
        duration: period / 2,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: Math.ceil(duration / period),
      }, at);
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        tl.to(c, {
          y: c.baseY - amp,
          duration: period / 2,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: Math.ceil(duration / period),
        }, at + i * 0.05);
      }
      break;
    }

    case 'charJitter': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        const period = 0.12 + (i % 3) * 0.04;
        tl.to(c, {
          y: c.baseY - 3,
          duration: period,
          ease: 'none',
          yoyo: true,
          repeat: Math.ceil(duration / period),
        }, at + i * 0.02);
      }
      break;
    }

    case 'breathe': {
      const period = 2;
      tl.to(line, {
        scaleX: 1.04,
        scaleY: 1.04,
        duration: period / 2,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: Math.ceil(duration / period),
      }, at);
      break;
    }
  }
}
