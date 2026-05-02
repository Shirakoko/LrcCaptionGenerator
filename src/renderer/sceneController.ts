import gsap from 'gsap';
import type { LyricLine } from '../parser/lrcParser.ts';
import type { LineState } from '../effects/types.ts';
import { pickEffects } from '../effects/types.ts';
import { buildEntrance } from '../effects/entrance.ts';
import { buildIdleTween } from '../effects/idle.ts';
import { buildExit } from '../effects/exit.ts';
import { buildLineState } from './layout.ts';
import { renderFrame } from './canvasRenderer.ts';
import type { RenderConfig } from './canvasRenderer.ts';
import { Prng, seedFromString } from '../random/prng.ts';

export interface SceneOptions {
  seed?: number | string;
  randomLayout?: boolean;
}

export class SceneController {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cfg: RenderConfig;
  private masterTl: gsap.core.Timeline | null = null;
  private activeLines: LineState[] = [];
  private rafId = 0;
  private isPlaying = false;
  transparentBg = false;

  constructor(canvas: HTMLCanvasElement, cfg: RenderConfig) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.cfg = cfg;
    canvas.width = cfg.width;
    canvas.height = cfg.height;
  }

  build(lyrics: LyricLine[], opts: SceneOptions = {}): void {
    this.stop();
    this.activeLines = [];

    const seedVal = typeof opts.seed === 'string'
      ? seedFromString(opts.seed)
      : (opts.seed ?? Date.now());

    const masterTl = gsap.timeline({ paused: true });
    this.masterTl = masterTl;

    for (let i = 0; i < lyrics.length; i++) {
      const lyric = lyrics[i];
      const rng = new Prng(seedVal ^ (i * 0x9e3779b9));

      const lineState = buildLineState(
        lyric.text,
        this.ctx,
        this.cfg,
        rng,
        opts.randomLayout !== false ? {} : { align: 'center', rotation: 0 },
      );
      this.activeLines.push(lineState);

      const startSec = lyric.time / 1000;
      const durSec = lyric.duration / 1000;
      const exitSec = startSec + durSec - 0.5;

      const effects = pickEffects(rng);

      buildEntrance(effects.entrance, lineState.chars, masterTl, startSec, rng);

      const idleDur = Math.max(0, durSec - 0.6 - 0.5);
      if (idleDur > 0.3) {
        buildIdleTween(effects.idle, lineState, masterTl, startSec + 0.6, idleDur);
      }

      buildExit(effects.exit, lineState, masterTl, exitSec, rng);
    }

    const render = () => {
      renderFrame(this.ctx, this.activeLines, this.cfg, this.transparentBg);
      if (this.isPlaying) {
        this.rafId = requestAnimationFrame(render);
      }
    };

    masterTl.eventCallback('onStart', () => {
      this.isPlaying = true;
      render();
    });
    masterTl.eventCallback('onComplete', () => {
      this.isPlaying = false;
      cancelAnimationFrame(this.rafId);
    });
  }

  play(): void {
    this.masterTl?.play();
  }

  pause(): void {
    this.masterTl?.pause();
    this.isPlaying = false;
    cancelAnimationFrame(this.rafId);
  }

  seek(timeSec: number): void {
    this.masterTl?.seek(timeSec, false);
    renderFrame(this.ctx, this.activeLines, this.cfg, this.transparentBg);
  }

  stop(): void {
    this.masterTl?.kill();
    this.masterTl = null;
    this.isPlaying = false;
    cancelAnimationFrame(this.rafId);
  }

  /** 导出当前帧为 PNG DataURL */
  exportFramePng(): string {
    return this.canvas.toDataURL('image/png');
  }

  /** 跳到指定时间并导出 PNG */
  exportFrameAt(timeSec: number): string {
    this.seek(timeSec);
    return this.exportFramePng();
  }

  get duration(): number {
    return this.masterTl?.duration() ?? 0;
  }

  get currentTime(): number {
    return this.masterTl?.time() ?? 0;
  }
}
