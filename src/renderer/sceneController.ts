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
  staticMode?: boolean;
  overrides?: OverrideMap;
}

export type MediaResolver = (timeSec: number) => {
  element: HTMLImageElement;
  brightness: number;
  contrast: number;
  saturate: number;
} | null;

export type TransitionResolver = (timeSec: number) => {
  fromClip: { element: HTMLImageElement; brightness: number; contrast: number; saturate: number };
  toClip:   { element: HTMLImageElement; brightness: number; contrast: number; saturate: number };
  progress: number;
  type: string;
} | null;

export class SceneController {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cfg: RenderConfig;
  private masterTl: gsap.core.Timeline | null = null;
  private activeLines: LineState[] = [];
  private rafId = 0;
  private isPlaying = false;
  transparentBg = false;
  private mediaResolver: MediaResolver | null = null;
  private transitionResolver: TransitionResolver | null = null;

  // Stored state for rebuilding
  private lyrics: LyricLine[] = [];
  private seedVal: number = 0;
  private randomLayout: boolean = true;
  private isStatic: boolean = false;
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
    this.isStatic = opts.staticMode ?? false;
    this.overrideMap = opts.overrides ?? {};
    this._buildTimeline();
  }

  setMediaResolver(fn: MediaResolver | null): void {
    this.mediaResolver = fn;
  }

  setTransitionResolver(fn: TransitionResolver | null): void {
    this.transitionResolver = fn;
  }

  private _activeCfg(timeSec?: number): RenderConfig {
    const t = timeSec ?? this.currentTime;

    // Check transition first — overrides normal media resolver
    if (this.transitionResolver) {
      const trans = this.transitionResolver(t);
      if (trans) {
        return {
          ...this.cfg,
          bgImage:  trans.fromClip.element,
          bgBrightness: trans.fromClip.brightness,
          bgContrast:   trans.fromClip.contrast,
          bgSaturate:   trans.fromClip.saturate,
          bgImage2:  trans.toClip.element,
          bgImage2Brightness: trans.toClip.brightness,
          bgImage2Contrast:   trans.toClip.contrast,
          bgImage2Saturate:   trans.toClip.saturate,
          bgBlend: trans.progress,
          bgTransitionType: trans.type,
        };
      }
    }

    if (!this.mediaResolver) return this.cfg;
    const m = this.mediaResolver(t);
    if (!m) return { ...this.cfg, bgImage: null };
    return {
      ...this.cfg,
      bgImage: m.element,
      bgBrightness: m.brightness,
      bgContrast: m.contrast,
      bgSaturate: m.saturate,
    };
  }

  private _render = (): void => {
    renderFrame(this.ctx, this.activeLines, this._activeCfg(), this.transparentBg);
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

    const baseLayoutOpts = this.isStatic
      ? {
          align:               'center' as const,
          rotation:            0,
          fontSize:            Math.round(this.cfg.height / 15),
          yZone:               [0.85, 0.85] as [number, number],
          letterSpacingExtra:  0,
        }
      : this.randomLayout ? {} : { align: 'center' as const, rotation: 0 };

    for (let i = 0; i < this.lyrics.length; i++) {
      const lyric = this.lyrics[i];
      const rng = new Prng(this.seedVal ^ (i * 0x9e3779b9));
      const override = this.overrideMap[i];

      const lineState = buildLineState(
        override?.text ?? lyric.text,
        this.ctx,
        this.cfg,
        rng,
        baseLayoutOpts,
        override?.layout,
      );
      lineState.fillColor           = override?.fillColor;
      lineState.strokeColor         = override?.strokeColor;
      lineState.strokeWidthOverride = override?.strokeWidth;
      lineState.pixelFx             = override?.pixelFx ?? [];
      lineState.decoration          = override?.decoration;

      // Pre-generate per-character decoration size scales so they stay stable across frames
      if (lineState.decoration?.randomSize) {
        const r = lineState.decoration.randomRange;
        for (const c of lineState.chars) {
          c.decoSizeScale = c.char === ' ' ? 1 : 1 - r + Math.random() * r * 2;
        }
      }
      this.activeLines.push(lineState);

      const startSec = lyric.time / 1000;
      const durSec = lyric.duration / 1000;
      const exitSec = startSec + durSec - 0.5;

      const hasEffectOverride = !!(override?.effects?.entrance || override?.effects?.idle || override?.effects?.exit);
      const effects: EffectSet = (this.isStatic && !hasEffectOverride)
        ? { entrance: 'fadeIn', idle: 'none', exit: 'fadeOut' }
        : pickEffects(rng, override?.effects);

      const entranceParams = (this.isStatic && !hasEffectOverride) ? { duration: 0.15, stagger: 0 } : override?.effects?.entranceParams;
      const idleParams     = override?.effects?.idleParams;
      const exitParams     = (this.isStatic && !hasEffectOverride) ? { duration: 0.2 }              : override?.effects?.exitParams;

      this.lineParams.push({ layout: { ...lineState.layout }, effects });

      buildEntrance(effects.entrance, lineState.chars, masterTl, startSec, rng, entranceParams);

      const idleDur = Math.max(0, durSec - 0.6 - 0.5);
      if (idleDur > 0.3) {
        buildIdleTween(effects.idle, lineState, masterTl, startSec + 0.6, idleDur, idleParams);
      }

      buildExit(effects.exit, lineState, masterTl, exitSec, rng, exitParams);
    }

    masterTl.eventCallback('onComplete', () => {
      this.isPlaying = false;
      cancelAnimationFrame(this.rafId);
    });
  }

  /** 将指定样式应用到所有字幕行（保留各行已有的位置/特效覆盖） */
  applyStyleToAll(style: {
    fontFamily: string;
    align?: 'left' | 'center' | 'right';
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
  }): void {
    const prevTime = this.currentTime;
    for (let i = 0; i < this.lyrics.length; i++) {
      const existing = this.overrideMap[i] ?? {};
      this.overrideMap[i] = {
        ...existing,
        layout: { ...existing.layout, fontFamily: style.fontFamily, align: style.align },
        fillColor: style.fillColor,
        strokeColor: style.strokeColor,
        strokeWidth: style.strokeWidth,
      };
    }
    this._buildTimeline();
    this.seek(prevTime);
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

  getConfig(): RenderConfig {
    return this.cfg;
  }

  updateConfig(partial: Partial<RenderConfig>): void {
    this.cfg = { ...this.cfg, ...partial };
    renderFrame(this.ctx, this.activeLines, this._activeCfg(), this.transparentBg);
  }

  getLyrics(): LyricLine[] {
    return this.lyrics;
  }

  /** 仅更新歌词时间数据，不重建动画时间轴（用于时间轴拖拽同步） */
  updateLyrics(lyrics: LyricLine[]): void {
    this.lyrics = lyrics;
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
    renderFrame(this.ctx, this.activeLines, this._activeCfg(), this.transparentBg);
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
    this.masterTl?.seek(timeSec, true);
    renderFrame(this.ctx, this.activeLines, this._activeCfg(timeSec), this.transparentBg);
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
