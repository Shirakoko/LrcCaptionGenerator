import gsap from 'gsap';
import type { LyricLine } from '../parser/lrcParser.ts';
import type { LineState, OverrideMap, EffectSet, LineLayout, LineOverride } from '../effects/types.ts';
import { pickEffects } from '../effects/types.ts';
import { buildEntrance } from '../effects/entrance.ts';
import { buildIdleTween } from '../effects/idle.ts';
import { buildExit } from '../effects/exit.ts';
import { buildLineState } from './layout.ts';
import { renderFrame } from './canvasRenderer.ts';
import type { RenderConfig } from './canvasRenderer.ts';
import { Prng, seedFromString } from '../random/prng.ts';

export interface LineParams {
  layout: LineLayout;
  effects: EffectSet;
}

export interface SceneOptions {
  seed?: number | string;
  randomLayout?: boolean;
  overrides?: OverrideMap;
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

  // Stored state for rebuilding
  private lyrics: LyricLine[] = [];
  private seedVal: number = 0;
  private randomLayout: boolean = true;
  private overrideMap: OverrideMap = {};
  private lineParams: LineParams[] = [];

  constructor(canvas: HTMLCanvasElement, cfg: RenderConfig) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.cfg = cfg;
    canvas.width = cfg.width;
    canvas.height = cfg.height;
  }

  build(lyrics: LyricLine[], opts: SceneOptions = {}): void {
    this.lyrics = lyrics;
    this.seedVal = typeof opts.seed === 'string'
      ? seedFromString(opts.seed)
      : (opts.seed ?? Date.now());
    this.randomLayout = opts.randomLayout !== false;
    this.overrideMap = opts.overrides ?? {};
    this._buildTimeline();
  }

  private _render = (): void => {
    renderFrame(this.ctx, this.activeLines, this.cfg, this.transparentBg);
    if (this.isPlaying) {
      this.rafId = requestAnimationFrame(this._render);
    }
  };

  private _buildTimeline(): void {
    this.stop();
    this.activeLines = [];
    this.lineParams = [];

    const masterTl = gsap.timeline({ paused: true });
    this.masterTl = masterTl;

    const baseLayoutOpts = this.randomLayout ? {} : { align: 'center' as const, rotation: 0 };

    for (let i = 0; i < this.lyrics.length; i++) {
      const lyric = this.lyrics[i];
      const rng = new Prng(this.seedVal ^ (i * 0x9e3779b9));
      const override = this.overrideMap[i];

      const lineState = buildLineState(
        lyric.text,
        this.ctx,
        this.cfg,
        rng,
        baseLayoutOpts,
        override?.layout,
      );
      this.activeLines.push(lineState);

      const startSec = lyric.time / 1000;
      const durSec = lyric.duration / 1000;
      const exitSec = startSec + durSec - 0.5;

      const effects = pickEffects(rng, override?.effects);
      this.lineParams.push({ layout: { ...lineState.layout }, effects });

      buildEntrance(effects.entrance, lineState.chars, masterTl, startSec, rng, override?.effects?.entranceParams);

      const idleDur = Math.max(0, durSec - 0.6 - 0.5);
      if (idleDur > 0.3) {
        buildIdleTween(effects.idle, lineState, masterTl, startSec + 0.6, idleDur, override?.effects?.idleParams);
      }

      buildExit(effects.exit, lineState, masterTl, exitSec, rng, override?.effects?.exitParams);
    }

    masterTl.eventCallback('onComplete', () => {
      this.isPlaying = false;
      cancelAnimationFrame(this.rafId);
    });
  }

  /** 为指定行设置覆盖参数并立即重建时间轴 */
  setOverride(index: number, override: LineOverride): void {
    const prevTime = this.currentTime;
    this.overrideMap[index] = override;
    this._buildTimeline();
    this.seek(prevTime);
  }

  /** 清除所有覆盖并重建（一次性，避免逐行重建） */
  clearAllOverrides(): void {
    const prevTime = this.currentTime;
    this.overrideMap = {};
    this._buildTimeline();
    this.seek(prevTime);
  }

  /** 清除指定行的覆盖，恢复随机生成值 */
  clearOverride(index: number): void {
    const prevTime = this.currentTime;
    delete this.overrideMap[index];
    this._buildTimeline();
    this.seek(prevTime);
  }

  /** 读取指定行实际生效的布局和特效参数（已含 override） */
  getLineParams(index: number): LineParams | null {
    return this.lineParams[index] ?? null;
  }

  hasOverride(index: number): boolean {
    return index in this.overrideMap;
  }

  getOverride(index: number): LineOverride | undefined {
    return this.overrideMap[index];
  }

  getLyrics(): LyricLine[] {
    return this.lyrics;
  }

  /** 返回覆盖表的浅拷贝，用于跨 build 保留 */
  getOverrideMap(): OverrideMap {
    return { ...this.overrideMap };
  }

  get lineCount(): number {
    return this.lyrics.length;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  get lines(): readonly LineState[] {
    return this.activeLines;
  }

  updateLinePositionLive(index: number, x: number, y: number): void {
    const line = this.activeLines[index];
    if (!line) return;
    const dx = x - line.layout.x;
    const dy = y - line.layout.y;
    line.layout.x = x;
    line.layout.y = y;
    for (const c of line.chars) {
      c.x += dx; c.y += dy;
      c.baseX += dx; c.baseY += dy;
    }
    renderFrame(this.ctx, this.activeLines, this.cfg, this.transparentBg);
  }

  play(): void {
    this.isPlaying = true;
    this.masterTl?.play();
    cancelAnimationFrame(this.rafId);
    this.rafId = requestAnimationFrame(this._render);
  }

  pause(): void {
    this.masterTl?.pause();
    this.isPlaying = false;
    cancelAnimationFrame(this.rafId);
  }

  seek(timeSec: number): void {
    this.masterTl?.seek(timeSec, true); // suppressEvents=true，避免触发 onStart/onComplete 污染 isPlaying
    renderFrame(this.ctx, this.activeLines, this.cfg, this.transparentBg);
  }

  stop(): void {
    this.masterTl?.kill();
    this.masterTl = null;
    this.isPlaying = false;
    cancelAnimationFrame(this.rafId);
  }

  exportFramePng(): string {
    return this.canvas.toDataURL('image/png');
  }

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
