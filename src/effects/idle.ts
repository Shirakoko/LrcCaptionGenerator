import type { LineState, IdleName } from './types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Timeline = any;

type P = Record<string, number>;

export function buildIdleTween(
  name: IdleName,
  line: LineState,
  tl: Timeline,
  at: number,
  duration: number,
  params: P = {},
): void {
  if (name === 'none') return;

  const chars = line.chars;
  const n = chars.length;

  switch (name) {
    case 'float': {
      const amp    = params.amplitude ?? 6;
      const period = params.period    ?? 2.5;
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
      const amp   = params.amplitude ?? 3;
      const speed = params.speed     ?? 0.12;
      for (let i = 0; i < n; i++) {
        const c      = chars[i];
        const period = speed + (i % 3) * 0.04;
        tl.to(c, {
          y: c.baseY - amp,
          duration: period,
          ease: 'none',
          yoyo: true,
          repeat: Math.ceil(duration / period),
        }, at + i * 0.02);
      }
      break;
    }

    case 'altFloat': {
      const amp    = params.amplitude ?? 8;
      const period = params.period    ?? 2;
      for (let i = 0; i < n; i++) {
        const c   = chars[i];
        const dir = i % 2 === 0 ? -1 : 1; // even index → up, odd index → down
        tl.to(c, {
          y: c.baseY + dir * amp,
          duration: period / 2,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: Math.ceil(duration / period),
        }, at);
      }
      break;
    }

    case 'breathe': {
      const scale  = params.scale  ?? 1.04;
      const period = params.period ?? 2;
      tl.to(line, {
        scaleX: scale,
        scaleY: scale,
        duration: period / 2,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: Math.ceil(duration / period),
      }, at);
      break;
    }
  }
}
