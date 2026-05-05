import type { LyricLine } from '../parser/lrcParser.ts';

// ── Data models ───────────────────────────────────────────────────────────────

export interface MediaClip {
  id: string;
  type: 'image';
  file: File;
  element: HTMLImageElement;
  startTime: number;  // seconds
  duration: number;   // seconds
  brightness: number; // 0-200, 100 = normal
  contrast: number;
  saturate: number;
  thumbnail: string;  // data URL
}

export interface AudioClip {
  id: string;
  file: File;
  audioEl: HTMLAudioElement;
  blobUrl: string;
  startTime: number;
  duration: number;
  name: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_IMG_DUR = 5;
const ZOOM_LEVELS = [20, 40, 80, 160, 240]; // px per second
const DEFAULT_ZOOM_IDX = 1; // 40 px/s

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── TimelineController ────────────────────────────────────────────────────────

export class TimelineController {
  mediaClips: MediaClip[] = [];
  audioClips: AudioClip[] = [];

  private captionLyrics: LyricLine[] = [];
  private zoomIdx = DEFAULT_ZOOM_IDX;

  private onChangeCbs: Array<() => void> = [];
  private onSeekCb?: (t: number) => void;
  private onCaptionClickCbs: Array<(idx: number, t: number) => void> = [];

  // DOM refs
  private scrollAreaEl: HTMLElement;
  private innerEl: HTMLElement;
  private rulerEl: HTMLElement;
  private mediaContentEl: HTMLElement;
  private captionContentEl: HTMLElement;
  private audioContentEl: HTMLElement;
  private playheadEl: HTMLElement;

  constructor(timelineEl: HTMLElement) {
    this.scrollAreaEl     = timelineEl.querySelector<HTMLElement>('#tl-content-area')!;
    this.innerEl          = timelineEl.querySelector<HTMLElement>('#tl-inner')!;
    this.rulerEl          = timelineEl.querySelector<HTMLElement>('#tl-ruler')!;
    this.mediaContentEl   = timelineEl.querySelector<HTMLElement>('#tl-media-content')!;
    this.captionContentEl = timelineEl.querySelector<HTMLElement>('#tl-caption-content')!;
    this.audioContentEl   = timelineEl.querySelector<HTMLElement>('#tl-audio-content')!;
    this.playheadEl       = timelineEl.querySelector<HTMLElement>('#tl-playhead')!;

    this._setupZoom();
    this._setupRulerClick();
    this._setupPlayheadDrag();
  }

  // ── Public getters ─────────────────────────────────────────────────────────

  get pxPerSec(): number { return ZOOM_LEVELS[this.zoomIdx]; }

  get totalDuration(): number {
    const m = this.mediaClips.length > 0
      ? Math.max(...this.mediaClips.map(c => c.startTime + c.duration)) : 0;
    const a = this.audioClips.length > 0
      ? Math.max(...this.audioClips.map(c => c.startTime + c.duration)) : 0;
    const c = this.captionLyrics.length > 0
      ? (this.captionLyrics.at(-1)!.time + this.captionLyrics.at(-1)!.duration) / 1000 : 0;
    return Math.max(m, a, c, 1);
  }

  // ── Event registration ─────────────────────────────────────────────────────

  onChange(cb: () => void): void { this.onChangeCbs.push(cb); }
  onSeek(cb: (t: number) => void): void { this.onSeekCb = cb; }
  onCaptionClick(cb: (idx: number, t: number) => void): void {
    this.onCaptionClickCbs.push(cb);
  }

  private _notify(): void { for (const cb of this.onChangeCbs) cb(); }
  private _seek(t: number): void { this.onSeekCb?.(t); }

  // ── Coordinate helpers ─────────────────────────────────────────────────────

  private _timeToPx(t: number): number { return t * this.pxPerSec; }
  private _pxToTime(px: number): number { return px / this.pxPerSec; }

  private _totalWidthPx(): number {
    return Math.max(this._timeToPx(this.totalDuration + 10) + 100, 400);
  }

  // ── Query helpers ──────────────────────────────────────────────────────────

  getMediaAtTime(t: number): MediaClip | null {
    for (const c of this.mediaClips) {
      if (t >= c.startTime && t < c.startTime + c.duration) return c;
    }
    return null;
  }

  getAudioAtTime(t: number): AudioClip | null {
    for (const c of this.audioClips) {
      if (t >= c.startTime && t < c.startTime + c.duration) return c;
    }
    return null;
  }

  // ── Media track ────────────────────────────────────────────────────────────

  async addMediaFiles(files: FileList | File[]): Promise<void> {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    for (const file of arr) await this._addImageFile(file);
    this.renderAll();
    this._notify();
  }

  private async _addImageFile(file: File): Promise<void> {
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>(res => { img.onload = () => res(); img.src = url; });

    const thumb = document.createElement('canvas');
    thumb.width = 120; thumb.height = 68;
    thumb.getContext('2d')!.drawImage(img, 0, 0, 120, 68);

    const startTime = this.mediaClips.length > 0
      ? Math.max(...this.mediaClips.map(c => c.startTime + c.duration)) : 0;

    this.mediaClips.push({
      id: uid(), type: 'image', file, element: img, startTime,
      duration: DEFAULT_IMG_DUR,
      brightness: 100, contrast: 100, saturate: 100,
      thumbnail: thumb.toDataURL('image/jpeg', 0.7),
    });
  }

  removeMediaClip(id: string): void {
    this.mediaClips = this.mediaClips.filter(c => c.id !== id);
    this._repackMedia();
    this.renderAll();
    this._notify();
  }

  private _repackMedia(): void {
    let t = 0;
    for (const c of this.mediaClips) { c.startTime = t; t += c.duration; }
  }

  // ── Audio track ────────────────────────────────────────────────────────────

  async addAudioFiles(files: FileList | File[]): Promise<void> {
    const arr = Array.from(files).filter(f => f.type.startsWith('audio/'));
    for (const file of arr) await this._addAudioFile(file);
    this.renderAll();
    this._notify();
  }

  private async _addAudioFile(file: File): Promise<void> {
    const blobUrl = URL.createObjectURL(file);
    const audioEl = new Audio(blobUrl);
    audioEl.preload = 'metadata';
    await new Promise<void>(res => {
      audioEl.addEventListener('loadedmetadata', () => res(), { once: true });
      setTimeout(res, 3000);
    });

    const startTime = this.audioClips.length > 0
      ? Math.max(...this.audioClips.map(c => c.startTime + c.duration)) : 0;

    this.audioClips.push({
      id: uid(), file, audioEl, blobUrl, startTime,
      duration: isFinite(audioEl.duration) && audioEl.duration > 0 ? audioEl.duration : 60,
      name: file.name,
    });
  }

  removeAudioClip(id: string): void {
    const clip = this.audioClips.find(c => c.id === id);
    if (clip) URL.revokeObjectURL(clip.blobUrl);
    this.audioClips = this.audioClips.filter(c => c.id !== id);
    this._repackAudio();
    this.renderAll();
    this._notify();
  }

  private _repackAudio(): void {
    let t = 0;
    for (const c of this.audioClips) { c.startTime = t; t += c.duration; }
  }

  // ── Caption track ──────────────────────────────────────────────────────────

  setCaptionLyrics(lyrics: LyricLine[]): void {
    this.captionLyrics = lyrics;
    this._renderCaptionTrack();
    this._renderRuler();
    this._updateInnerWidth();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  renderAll(): void {
    this._updateInnerWidth();
    this._renderRuler();
    this._renderMediaTrack();
    this._renderCaptionTrack();
    this._renderAudioTrack();
  }

  private _updateInnerWidth(): void {
    const w = this._totalWidthPx();
    this.innerEl.style.minWidth = w + 'px';
  }

  // ── Ruler ──────────────────────────────────────────────────────────────────

  private _renderRuler(): void {
    this.rulerEl.innerHTML = '';
    const dur = this.totalDuration + 10;
    const pps = this.pxPerSec;

    let tickSec = 1;
    if (pps < 20) tickSec = 10;
    else if (pps < 40) tickSec = 5;
    else if (pps < 80) tickSec = 2;
    else if (pps >= 160) tickSec = 0.5;

    const n = Math.ceil(dur / tickSec);
    for (let i = 0; i <= n; i++) {
      const t = i * tickSec;
      const major = Math.abs(t % 1) < 0.01;

      const tick = document.createElement('div');
      tick.className = 'tl-tick' + (major ? ' tl-tick--major' : '');
      tick.style.left = this._timeToPx(t) + 'px';

      if (major) {
        const lbl = document.createElement('span');
        lbl.textContent = `${t}s`;
        tick.appendChild(lbl);
      }
      this.rulerEl.appendChild(tick);
    }
  }

  // ── Media track render ─────────────────────────────────────────────────────

  private _renderMediaTrack(): void {
    this.mediaContentEl.innerHTML = '';
    for (const clip of this.mediaClips) {
      this.mediaContentEl.appendChild(this._makeMediaClipEl(clip));
    }
  }

  private _makeMediaClipEl(clip: MediaClip): HTMLElement {
    const el = document.createElement('div');
    el.className = 'tl-clip tl-clip--media';
    el.dataset.clipId = clip.id;
    el.style.left = this._timeToPx(clip.startTime) + 'px';
    el.style.width = Math.max(8, this._timeToPx(clip.duration)) + 'px';

    const thumb = document.createElement('img');
    thumb.className = 'tl-clip-thumb';
    thumb.src = clip.thumbnail;

    const name = document.createElement('span');
    name.className = 'tl-clip-name';
    name.textContent = clip.file.name;

    const dur = document.createElement('span');
    dur.className = 'tl-clip-dur';
    dur.textContent = clip.duration.toFixed(1) + 's';

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'tl-clip-resize';

    el.append(thumb, name, dur, resizeHandle);

    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (confirm(`删除 "${clip.file.name}"？`)) this.removeMediaClip(clip.id);
    });

    resizeHandle.addEventListener('mousedown', e => {
      e.stopPropagation();
      const startX = e.clientX;
      const startDur = clip.duration;
      document.body.style.cursor = 'ew-resize';

      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        clip.duration = Math.max(0.5, Math.round((startDur + dx / this.pxPerSec) * 10) / 10);
        this._repackMedia();
        this._renderMediaTrack();
        this._renderRuler();
        this._updateInnerWidth();
        this._notify();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });

    return el;
  }

  // ── Caption track render ───────────────────────────────────────────────────

  private _renderCaptionTrack(): void {
    this.captionContentEl.innerHTML = '';
    for (let i = 0; i < this.captionLyrics.length; i++) {
      const lyric = this.captionLyrics[i];
      const startSec = lyric.time / 1000;
      const durSec   = lyric.duration / 1000;

      const el = document.createElement('div');
      el.className = 'tl-clip tl-clip--caption';
      el.dataset.lineIdx = String(i);
      el.style.left  = this._timeToPx(startSec) + 'px';
      el.style.width = Math.max(8, this._timeToPx(durSec)) + 'px';
      el.title = lyric.text;

      const span = document.createElement('span');
      span.className = 'tl-clip-text';
      span.textContent = lyric.text;
      el.appendChild(span);

      el.addEventListener('click', () => {
        for (const cb of this.onCaptionClickCbs) cb(i, startSec);
      });

      this.captionContentEl.appendChild(el);
    }
  }

  // ── Audio track render ─────────────────────────────────────────────────────

  private _renderAudioTrack(): void {
    this.audioContentEl.innerHTML = '';
    for (const clip of this.audioClips) {
      const el = document.createElement('div');
      el.className = 'tl-clip tl-clip--audio';
      el.dataset.clipId = clip.id;
      el.style.left  = this._timeToPx(clip.startTime) + 'px';
      el.style.width = Math.max(8, this._timeToPx(clip.duration)) + 'px';

      const name = document.createElement('span');
      name.className = 'tl-clip-name';
      name.textContent = clip.name;

      const dur = document.createElement('span');
      dur.className = 'tl-clip-dur';
      dur.textContent = clip.duration.toFixed(1) + 's';

      const closeBtn = document.createElement('button');
      closeBtn.className = 'tl-clip-close';
      closeBtn.textContent = '✕';
      closeBtn.title = '删除';
      closeBtn.addEventListener('click', e => {
        e.stopPropagation();
        this.removeAudioClip(clip.id);
      });

      el.append(name, dur, closeBtn);
      this.audioContentEl.appendChild(el);
    }
  }

  // ── Playhead ───────────────────────────────────────────────────────────────

  syncPlayhead(timeSec: number, autoScroll = false): void {
    const x = this._timeToPx(timeSec);
    this.playheadEl.style.left = x + 'px';

    if (autoScroll) {
      const viewW = this.scrollAreaEl.clientWidth;
      const scrollL = this.scrollAreaEl.scrollLeft;
      if (x > scrollL + viewW - 40) {
        this.scrollAreaEl.scrollLeft = x - 40;
      } else if (x < scrollL) {
        this.scrollAreaEl.scrollLeft = Math.max(0, x - 40);
      }
    }
  }

  // ── Audio playback ─────────────────────────────────────────────────────────

  private _activeAudioId: string | null = null;

  syncAudio(timeSec: number, playing: boolean): void {
    if (!playing) { this._pauseAllAudio(); return; }

    const clip = this.getAudioAtTime(timeSec);
    if (!clip) { this._pauseAllAudio(); return; }

    if (clip.id !== this._activeAudioId) {
      this._pauseAllAudio();
      this._activeAudioId = clip.id;
      clip.audioEl.currentTime = timeSec - clip.startTime;
      clip.audioEl.play().catch(() => {});
      return;
    }

    const expected = timeSec - clip.startTime;
    if (Math.abs(clip.audioEl.currentTime - expected) > 0.5) {
      clip.audioEl.currentTime = expected;
    }
    if (clip.audioEl.paused) clip.audioEl.play().catch(() => {});
  }

  seekAudio(timeSec: number): void {
    this._pauseAllAudio();
    this._activeAudioId = null;
    const clip = this.getAudioAtTime(timeSec);
    if (clip) clip.audioEl.currentTime = timeSec - clip.startTime;
  }

  private _pauseAllAudio(): void {
    for (const c of this.audioClips) {
      if (!c.audioEl.paused) c.audioEl.pause();
    }
  }

  stopAllAudio(): void { this._pauseAllAudio(); this._activeAudioId = null; }

  // ── Drag-drop ──────────────────────────────────────────────────────────────

  setupDragDrop(
    onMedia: (files: File[]) => void,
    onAudio: (files: File[]) => void,
  ): void {
    const attach = (el: HTMLElement, handler: (files: File[]) => void) => {
      el.addEventListener('dragover', e => {
        e.preventDefault();
        el.classList.add('tl-drop-active');
      });
      el.addEventListener('dragleave', () => el.classList.remove('tl-drop-active'));
      el.addEventListener('drop', e => {
        e.preventDefault();
        el.classList.remove('tl-drop-active');
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length) handler(files);
      });
    };
    attach(this.mediaContentEl, onMedia);
    attach(this.audioContentEl, onAudio);
  }

  // ── Ruler click + playhead drag ────────────────────────────────────────────

  private _setupRulerClick(): void {
    this.rulerEl.addEventListener('click', e => {
      const rect = this.rulerEl.getBoundingClientRect();
      const x = e.clientX - rect.left + this.scrollAreaEl.scrollLeft;
      this._seek(Math.max(0, this._pxToTime(x)));
    });
  }

  private _setupPlayheadDrag(): void {
    this.playheadEl.addEventListener('mousedown', e => {
      document.body.style.cursor = 'ew-resize';
      const onMove = (ev: MouseEvent) => {
        const rect = this.scrollAreaEl.getBoundingClientRect();
        const x = ev.clientX - rect.left + this.scrollAreaEl.scrollLeft;
        const t = Math.max(0, this._pxToTime(x));
        this.syncPlayhead(t);
        this._seek(t);
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    });
  }

  // ── Zoom ───────────────────────────────────────────────────────────────────

  private _setupZoom(): void {
    this.scrollAreaEl.addEventListener('wheel', e => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0 && this.zoomIdx < ZOOM_LEVELS.length - 1) this.zoomIdx++;
        else if (e.deltaY > 0 && this.zoomIdx > 0) this.zoomIdx--;
        this.renderAll();
      }
    }, { passive: false });
  }
}
