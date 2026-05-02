import type { CharState, EntranceName } from './types.ts';
import type { Prng } from '../random/prng.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Timeline = any;

const DUR = 0.55;

export function buildEntrance(
  name: EntranceName,
  chars: CharState[],
  tl: Timeline,
  at: number,
  rng: Prng,
): void {
  const n = chars.length;
  if (n === 0) return;

  // 先把所有字符设为不可见
  for (const c of chars) {
    c.alpha = 0;
  }

  switch (name) {
    case 'typewriter': {
      for (let i = 0; i < n; i++) {
        tl.to(chars[i], { alpha: 1, duration: 0.06 }, at + i * 0.08);
      }
      break;
    }

    case 'slideLeft': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.x = c.baseX - 80;
        tl.to(c, { x: c.baseX, alpha: 1, duration: DUR, ease: 'power2.out' }, at + i * 0.04);
      }
      break;
    }

    case 'slideRight': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.x = c.baseX + 80;
        tl.to(c, { x: c.baseX, alpha: 1, duration: DUR, ease: 'power2.out' }, at + i * 0.04);
      }
      break;
    }

    case 'slideUp': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.y = c.baseY + 60;
        tl.to(c, { y: c.baseY, alpha: 1, duration: DUR, ease: 'power2.out' }, at + i * 0.04);
      }
      break;
    }

    case 'slideDown': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.y = c.baseY - 60;
        tl.to(c, { y: c.baseY, alpha: 1, duration: DUR, ease: 'power2.out' }, at + i * 0.04);
      }
      break;
    }

    case 'scalePop': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.scaleX = 0;
        c.scaleY = 0;
        tl.to(c, { scaleX: 1, scaleY: 1, alpha: 1, duration: DUR, ease: 'elastic.out(1,0.5)' }, at + i * 0.05);
      }
      break;
    }

    case 'scatter': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.x = c.baseX + rng.range(-200, 200);
        c.y = c.baseY + rng.range(-150, 150);
        tl.to(c, { x: c.baseX, y: c.baseY, alpha: 1, duration: DUR, ease: 'power3.out' }, at + rng.range(0, 0.2));
      }
      break;
    }

    case 'flipX': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.scaleX = 0;
        tl.to(c, { scaleX: 1, alpha: 1, duration: DUR, ease: 'power2.out' }, at + i * 0.05);
      }
      break;
    }

    case 'blurFade': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.blur = 20;
        tl.to(c, { blur: 0, alpha: 1, duration: DUR, ease: 'power2.out' }, at + i * 0.04);
      }
      break;
    }

    case 'wave': {
      for (let i = 0; i < n; i++) {
        const c = chars[i];
        c.y = c.baseY - 30;
        tl.to(c, { y: c.baseY, alpha: 1, duration: DUR, ease: 'sine.out' }, at + i * 0.06);
      }
      break;
    }
  }
}
