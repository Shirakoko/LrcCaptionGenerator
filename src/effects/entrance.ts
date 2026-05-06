import type { CharState, EntranceName } from './types.ts';
import type { Prng } from '../random/prng.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Timeline = any;

type P = Record<string, number>;

export function buildEntrance(
  name: EntranceName,
  chars: CharState[],
  tl: Timeline,
  at: number,
  rng: Prng,
  params: P = {},
): void {
  const n = chars.length;
  if (n === 0) return;

  for (const c of chars) c.alpha = 0;

  switch (name) {
    case 'typewriter': {
      const charDur   = params.charDur   ?? 0.06;
      const charDelay = params.charDelay ?? 0.08;
      for (let i = 0; i < n; i++) {
        tl.to(chars[i], { alpha: 1, duration: charDur }, at + i * charDelay);
      }
      break;
    }

    case 'slideLeft': {
      const distance = params.distance ?? 80;
      const duration = params.duration ?? 0.55;
      const stagger  = params.stagger  ?? 0.04;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.x = c.baseX - distance;
        tl.to(c, { x: c.baseX, alpha: 1, duration, ease: 'power2.out' }, at + i * stagger);
      }
      break;
    }

    case 'slideRight': {
      const distance = params.distance ?? 80;
      const duration = params.duration ?? 0.55;
      const stagger  = params.stagger  ?? 0.04;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.x = c.baseX + distance;
        tl.to(c, { x: c.baseX, alpha: 1, duration, ease: 'power2.out' }, at + i * stagger);
      }
      break;
    }

    case 'slideUp': {
      const distance = params.distance ?? 60;
      const duration = params.duration ?? 0.55;
      const stagger  = params.stagger  ?? 0.04;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.y = c.baseY + distance;
        tl.to(c, { y: c.baseY, alpha: 1, duration, ease: 'power2.out' }, at + i * stagger);
      }
      break;
    }

    case 'slideDown': {
      const distance = params.distance ?? 60;
      const duration = params.duration ?? 0.55;
      const stagger  = params.stagger  ?? 0.04;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.y = c.baseY - distance;
        tl.to(c, { y: c.baseY, alpha: 1, duration, ease: 'power2.out' }, at + i * stagger);
      }
      break;
    }

    case 'scalePop': {
      const duration   = params.duration   ?? 0.55;
      const stagger    = params.stagger    ?? 0.05;
      const elasticity = params.elasticity ?? 1.0;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.scaleX = 0;
        c.scaleY = 0;
        tl.to(c, {
          scaleX: 1, scaleY: 1, alpha: 1,
          duration, ease: `elastic.out(${elasticity},0.5)`,
        }, at + i * stagger);
      }
      break;
    }

    case 'wave': {
      const waveHeight = params.waveHeight ?? 30;
      const duration   = params.duration   ?? 0.55;
      const stagger    = params.stagger    ?? 0.06;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.y = c.baseY - waveHeight;
        tl.to(c, { y: c.baseY, alpha: 1, duration, ease: 'sine.out' }, at + i * stagger);
      }
      break;
    }

    case 'fadeIn': {
      const duration = params.duration ?? 0.5;
      const stagger  = params.stagger  ?? 0.04;
      for (let i = 0; i < n; i++) {
        tl.to(chars[i], { alpha: 1, duration, ease: 'power1.out' }, at + i * stagger);
      }
      break;
    }

    case 'glitch': {
      const intensity  = params.intensity  ?? 30;
      const flashCount = Math.round(params.flashCount ?? 3);
      const flashDur   = params.flashDur   ?? 0.08;

      // Start all chars displaced and invisible
      for (const c of chars) {
        c.x = c.baseX + rng.range(-intensity, intensity);
        c.y = c.baseY + rng.range(-intensity * 0.5, intensity * 0.5);
        c.alpha = 0;
      }

      for (let flash = 0; flash < flashCount; flash++) {
        const t0 = at + flash * flashDur;
        const isLast = flash === flashCount - 1;

        if (isLast) {
          // Final flash: snap to correct position
          for (const c of chars) {
            tl.to(c, { x: c.baseX, y: c.baseY, alpha: 1, duration: flashDur, ease: 'power2.out' }, t0);
          }
        } else {
          // Intermediate: briefly visible at displaced position, then off
          for (const c of chars) {
            tl.to(c, { alpha: 1, duration: 0.02 }, t0);
            tl.to(c, { alpha: 0, duration: 0.02 }, t0 + flashDur * 0.4);
            // Relocate to new displacement for next flash
            tl.set(c, {
              x: c.baseX + rng.range(-intensity, intensity),
              y: c.baseY + rng.range(-intensity * 0.5, intensity * 0.5),
            }, t0 + flashDur * 0.5);
          }
        }
      }
      break;
    }

    case 'flipIn': {
      const duration   = params.duration   ?? 0.6;
      const stagger    = params.stagger    ?? 0.06;
      const elasticity = params.elasticity ?? 1.0;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.scaleY = 0;
        c.rotation = 90;
        tl.to(c, {
          scaleY: 1, rotation: 0, alpha: 1,
          duration, ease: `elastic.out(${elasticity},0.5)`,
        }, at + i * stagger);
      }
      break;
    }

    case 'converge': {
      const spreadX  = params.spreadX  ?? 200;
      const spreadY  = params.spreadY  ?? 150;
      const duration = params.duration ?? 0.6;
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.x      = c.baseX + rng.range(-spreadX, spreadX);
        c.y      = c.baseY + rng.range(-spreadY, spreadY);
        c.scaleX = rng.range(0.3, 2);
        c.scaleY = rng.range(0.3, 2);
        tl.to(c, {
          x: c.baseX, y: c.baseY, scaleX: 1, scaleY: 1, alpha: 1,
          duration, ease: 'power3.out',
        }, at + rng.range(0, 0.15));
      }
      break;
    }
  }
}
