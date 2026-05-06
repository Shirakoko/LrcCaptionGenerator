import type { LyricLine } from '../parser/lrcParser.ts';

// ── Data models ───────────────────────────────────────────────────────────────

export type TransitionType = string;

export interface TransitionParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}

export interface TransitionDef {
  label: string;
  // 'duration' key is special: it maps to MediaTransition.duration and gets clamped
  params: TransitionParamDef[];
}

// Registry of all transition effects. Add new entries here to extend.
export const TRANSITION_DEFS: Record<string, TransitionDef> = {
  none: {
    label: '无',
    params: [],
  },
  dissolve: {
    label: '混合淡化',
    params: [
      { key: 'duration', label: '时长', min: 0.1, max: 2.0, step: 0.1, default: 0.5, unit: 's' },
    ],
  },
  black_fade: {
    label: '黑幕过渡',
    params: [
      { key: 'duration', label: '时长', min: 0.1, max: 2.0, step: 0.1, default: 0.5, unit: 's' },
    ],
  },
  white_fade: {
    label: '白幕过渡',
    params: [
      { key: 'duration', label: '时长', min: 0.1, max: 2.0, step: 0.1, default: 0.5, unit: 's' },
    ],
  },
};

export interface MediaTransition {
  type: TransitionType;
  duration: number; // seconds, default 0.5
  params?: Record<string, number>; // extra effect-specific params
}

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
  transitionIn?: MediaTransition; // transition with the previous clip
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

export interface CaptionSegment {
  id: string;
  text: string;
  start: number; // seconds
  end: number;   // seconds
  source: 'lrc' | 'manual';
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_IMG_DUR = 5;
const ZOOM_LEVELS = [20, 40, 80, 160, 240]; // px per second
const DEFAULT_ZOOM_IDX = 1; // 40 px/s
const MIN_CAPTION_DUR = 0.1; // seconds

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── TimelineController ────────────────────────────────────────────────────────

export class TimelineController {
  mediaClips: MediaClip[] = [];
  audioClips: AudioClip[] = [];

  private captionSegments: CaptionSegment[] = [];
  private selectedCaptionId: string | null = null;
  private zoomIdx = DEFAULT_ZOOM_IDX;

  private onChangeCbs: Array<() => void> = [];
  private onSeekCb?: (t: number) => void;
  private onCaptionClickCbs: Array<(idx: number, t: number) => void> = [];
  private onCaptionSelectChangeCbs: Array<(idx: number | null) => void> = [];

  // Transition popover state
  private transPopoverEl: HTMLElement | null = null;
  private transPopoverClipId: string | null = null;

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
    this._setupKeyboard();
  }

  // ── Public getters ─────────────────────────────────────────────────────────

  get pxPerSec(): number { return ZOOM_LEVELS[this.zoomIdx]; }

  get totalDuration(): number {
    const m = this.mediaClips.length > 0
      ? Math.max(...this.mediaClips.map(c => c.startTime + c.duration)) : 0;
    const a = this.audioClips.length > 0
      ? Math.max(...this.audioClips.map(c => c.startTime + c.duration)) : 0;
    const c = this.captionSegments.length > 0 ? this.captionSegments.at(-1)!.end : 0;
    return Math.max(m, a, c, 1);
  }

  // ── Event registration ─────────────────────────────────────────────────────

  onChange(cb: () => void): void { this.onChangeCbs.push(cb); }
  onSeek(cb: (t: number) => void): void { this.onSeekCb = cb; }
  onCaptionClick(cb: (idx: number, t: number) => void): void {
    this.onCaptionClickCbs.push(cb);
  }
  onCaptionSelectionChange(cb: (idx: number | null) => void): void {
    this.onCaptionSelectChangeCbs.push(cb);
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

  getTransitionAtTime(t: number): {
    fromClip: MediaClip;
    toClip: MediaClip;
    progress: number;
    type: string;
  } | null {
    for (let i = 1; i < this.mediaClips.length; i++) {
      const prev = this.mediaClips[i - 1];
      const curr = this.mediaClips[i];
      if (!curr.transitionIn || curr.transitionIn.type === 'none') continue;
      // Only if clips are adjacent
      if (Math.abs(prev.startTime + prev.duration - curr.startTime) > 0.01) continue;

      const td = curr.transitionIn.duration;
      const tJoin = curr.startTime;
      const transStart = tJoin - td / 2;
      const transEnd = tJoin + td / 2;

      if (t >= transStart && t < transEnd) {
        const progress = (t - transStart) / td;
        return { fromClip: prev, toClip: curr, progress, type: curr.transitionIn.type };
      }
    }
    return null;
  }

  // ── Caption data API ───────────────────────────────────────────────────────

  hasCaptionData(): boolean {
    return this.captionSegments.length > 0;
  }

  setCaptionLyrics(lyrics: LyricLine[]): void {
    this.captionSegments = this._lyricsToSegments(lyrics);
    this.selectedCaptionId = null;
    this._renderCaptionTrack();
    this._renderRuler();
    this._updateInnerWidth();
    for (const cb of this.onCaptionSelectChangeCbs) cb(null);
  }

  clearCaptionSegments(): void {
    this.captionSegments = [];
    this.selectedCaptionId = null;
    this._renderCaptionTrack();
    this._renderRuler();
    this._updateInnerWidth();
    for (const cb of this.onCaptionSelectChangeCbs) cb(null);
  }

  getCaptionAsLyrics(): LyricLine[] {
    return this.captionSegments.map(s => ({
      time: Math.round(s.start * 1000),
      text: s.text,
      duration: Math.round((s.end - s.start) * 1000),
    }));
  }

  insertCaption(): void {
    const NEW_DUR = 1.0;

    if (this.captionSegments.length === 0) {
      // Empty track: insert at time 0
      const newSeg: CaptionSegment = { id: uid(), text: '新字幕', start: 0, end: NEW_DUR, source: 'manual' };
      this.captionSegments.push(newSeg);
      this.selectedCaptionId = newSeg.id;
      this._renderCaptionTrack();
      this._renderRuler();
      this._updateInnerWidth();
      for (const cb of this.onCaptionSelectChangeCbs) cb(0);
      for (const cb of this.onCaptionClickCbs) cb(0, 0);
      this._notify();
      return;
    }

    const selectedIdx = this.captionSegments.findIndex(s => s.id === this.selectedCaptionId);
    if (selectedIdx === -1) return; // No selection — button should be disabled

    const afterSeg = this.captionSegments[selectedIdx];
    const newStart = afterSeg.end;
    const newSeg: CaptionSegment = {
      id: uid(), text: '新字幕', start: newStart, end: newStart + NEW_DUR, source: 'manual',
    };

    // Shift subsequent segments by NEW_DUR
    for (let i = selectedIdx + 1; i < this.captionSegments.length; i++) {
      this.captionSegments[i].start += NEW_DUR;
      this.captionSegments[i].end += NEW_DUR;
    }

    this.captionSegments.splice(selectedIdx + 1, 0, newSeg);
    this.selectedCaptionId = newSeg.id;

    this._renderCaptionTrack();
    this._renderRuler();
    this._updateInnerWidth();

    const newIdx = selectedIdx + 1;
    for (const cb of this.onCaptionSelectChangeCbs) cb(newIdx);
    for (const cb of this.onCaptionClickCbs) cb(newIdx, newStart);
    this._notify();

    // Scroll new segment into view
    const x = this._timeToPx(newStart);
    const viewW = this.scrollAreaEl.clientWidth;
    if (x > this.scrollAreaEl.scrollLeft + viewW - 40 || x < this.scrollAreaEl.scrollLeft) {
      this.scrollAreaEl.scrollLeft = Math.max(0, x - 40);
    }
  }

  deleteSelectedCaption(): void {
    const idx = this.captionSegments.findIndex(s => s.id === this.selectedCaptionId);
    if (idx === -1) return;

    const deleted = this.captionSegments[idx];

    if (this.captionSegments.length === 1) {
      this.captionSegments = [];
      this.selectedCaptionId = null;
      for (const cb of this.onCaptionSelectChangeCbs) cb(null);
    } else if (idx === 0) {
      // First segment: next segment's start moves to fill
      this.captionSegments[1].start = deleted.start;
      this.captionSegments.splice(0, 1);
      this.selectedCaptionId = this.captionSegments[0].id;
      for (const cb of this.onCaptionSelectChangeCbs) cb(0);
      for (const cb of this.onCaptionClickCbs) cb(0, this.captionSegments[0].start);
    } else {
      // Non-first segment: previous segment's end extends to fill
      this.captionSegments[idx - 1].end = deleted.end;
      this.captionSegments.splice(idx, 1);
      const newIdx = idx - 1;
      this.selectedCaptionId = this.captionSegments[newIdx].id;
      for (const cb of this.onCaptionSelectChangeCbs) cb(newIdx);
      for (const cb of this.onCaptionClickCbs) cb(newIdx, this.captionSegments[newIdx].start);
    }

    this._renderCaptionTrack();
    this._renderRuler();
    this._updateInnerWidth();
    this._notify();
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
    // Add transition buttons between adjacent clips
    for (let i = 1; i < this.mediaClips.length; i++) {
      const prev = this.mediaClips[i - 1];
      const curr = this.mediaClips[i];
      if (Math.abs(prev.startTime + prev.duration - curr.startTime) < 0.01) {
        const prevW = Math.max(8, this._timeToPx(prev.duration));
        const currW = Math.max(8, this._timeToPx(curr.duration));
        // Only show button if there's enough room
        if (Math.min(prevW, currW) >= 16) {
          this.mediaContentEl.appendChild(this._makeTransitionBtn(i, curr));
        }
      }
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

  // ── Transition button ──────────────────────────────────────────────────────

  private _makeTransitionBtn(toIdx: number, toClip: MediaClip): HTMLElement {
    const x = this._timeToPx(toClip.startTime);
    const trans = toClip.transitionIn;
    const hasTransition = trans && trans.type !== 'none';

    const btn = document.createElement('button');
    btn.className = 'tl-transition-btn' + (hasTransition ? ' tl-transition-btn--active' : '');
    btn.style.left = x + 'px';

    const type = trans?.type ?? 'none';
    btn.title = TRANSITION_DEFS[type]?.label ?? type;
    btn.textContent = '⊕';

    btn.addEventListener('click', e => {
      e.stopPropagation();
      this._showTransPopover(btn, toIdx);
    });

    return btn;
  }

  private _ensureTransPopover(): HTMLElement {
    if (this.transPopoverEl) return this.transPopoverEl;

    const el = document.createElement('div');
    el.className = 'tl-transition-popover';

    // Build select options from registry
    const options = Object.entries(TRANSITION_DEFS)
      .map(([k, d]) => `<option value="${k}">${d.label}</option>`)
      .join('');

    el.innerHTML = `
      <div class="tl-trans-title">转场效果</div>
      <select class="tl-trans-select">${options}</select>
      <div class="tl-trans-params"></div>
      <div class="tl-trans-warn" hidden>时长已自动限制</div>
    `;

    el.querySelector<HTMLSelectElement>('.tl-trans-select')!.addEventListener('change', ev => {
      const type = (ev.target as HTMLSelectElement).value;
      this._applyTransType(type);
      this._renderTransParams(el, type);
    });

    // Close on outside click
    document.addEventListener('click', (ev) => {
      if (this.transPopoverEl?.style.display === 'block' && !el.contains(ev.target as Node)) {
        el.style.display = 'none';
      }
    }, true);

    el.style.display = 'none';
    document.body.appendChild(el);
    this.transPopoverEl = el;
    return el;
  }

  private _renderTransParams(popover: HTMLElement, type: string): void {
    const paramsEl = popover.querySelector<HTMLElement>('.tl-trans-params')!;
    const warnEl = popover.querySelector<HTMLElement>('.tl-trans-warn')!;
    const def = TRANSITION_DEFS[type];
    paramsEl.innerHTML = '';
    warnEl.hidden = true;

    if (!def || def.params.length === 0) return;

    const clip = this.mediaClips.find(c => c.id === this.transPopoverClipId);

    for (const p of def.params) {
      const currentVal = p.key === 'duration'
        ? (clip?.transitionIn?.duration ?? p.default)
        : (clip?.transitionIn?.params?.[p.key] ?? p.default);

      const row = document.createElement('div');
      row.className = 'tl-trans-param-row';
      row.innerHTML = `
        <span class="tl-trans-param-label">${p.label}${p.unit ? '（' + p.unit + '）' : ''}：</span>
        <input class="tl-trans-dur-input" type="number"
          min="${p.min}" max="${p.max}" step="${p.step}" value="${currentVal}"
          data-param-key="${p.key}">
      `;

      row.querySelector<HTMLInputElement>('input')!.addEventListener('change', ev => {
        const val = parseFloat((ev.target as HTMLInputElement).value) || p.default;
        if (p.key === 'duration') {
          this._applyTransDur(val);
        } else {
          this._applyTransParam(p.key, val);
        }
      });

      paramsEl.appendChild(row);
    }
  }

  private _showTransPopover(anchorEl: HTMLElement, toIdx: number): void {
    const popover = this._ensureTransPopover();
    const clip = this.mediaClips[toIdx];
    if (!clip) return;
    this.transPopoverClipId = clip.id;

    const type = clip.transitionIn?.type ?? 'none';
    popover.querySelector<HTMLSelectElement>('.tl-trans-select')!.value = type;
    popover.querySelector<HTMLElement>('.tl-trans-warn')!.hidden = true;
    this._renderTransParams(popover, type);

    const rect = anchorEl.getBoundingClientRect();
    popover.style.display = 'block';
    const popW = 200;
    const left = Math.min(Math.max(0, rect.left - popW / 2 + rect.width / 2), window.innerWidth - popW);
    popover.style.left = left + 'px';
    popover.style.top = (rect.bottom + 6) + 'px';
  }

  private _applyTransType(type: string): void {
    const clip = this.mediaClips.find(c => c.id === this.transPopoverClipId);
    if (!clip) return;

    if (type === 'none') {
      clip.transitionIn = undefined;
    } else {
      const def = TRANSITION_DEFS[type];
      const defaultDur = def?.params.find(p => p.key === 'duration')?.default ?? 0.5;
      clip.transitionIn = {
        type,
        duration: clip.transitionIn?.duration ?? defaultDur,
        params: clip.transitionIn?.params ?? {},
      };
    }

    this._renderMediaTrack();
    this._notify();
  }

  private _applyTransDur(dur: number): void {
    const clip = this.mediaClips.find(c => c.id === this.transPopoverClipId);
    if (!clip || !clip.transitionIn || clip.transitionIn.type === 'none') return;

    const idx = this.mediaClips.indexOf(clip);
    if (idx <= 0) return;
    const prevClip = this.mediaClips[idx - 1];

    // Clamp: duration ≤ min(prevDur, currDur) / 2
    const maxDur = Math.min(prevClip.duration, clip.duration) / 2;
    const clamped = Math.round(Math.min(maxDur, Math.max(0.1, dur)) * 10) / 10;

    const warnEl = this.transPopoverEl?.querySelector<HTMLElement>('.tl-trans-warn');
    if (warnEl) warnEl.hidden = clamped >= dur;

    clip.transitionIn.duration = clamped;
    const durInput = this.transPopoverEl?.querySelector<HTMLInputElement>(`[data-param-key="duration"]`);
    if (durInput) durInput.value = String(clamped);

    this._notify();
  }

  private _applyTransParam(key: string, val: number): void {
    const clip = this.mediaClips.find(c => c.id === this.transPopoverClipId);
    if (!clip || !clip.transitionIn) return;
    if (!clip.transitionIn.params) clip.transitionIn.params = {};
    clip.transitionIn.params[key] = val;
    this._notify();
  }

  // ── Caption track render ───────────────────────────────────────────────────

  private _renderCaptionTrack(): void {
    this.captionContentEl.innerHTML = '';

    for (let i = 0; i < this.captionSegments.length; i++) {
      const seg = this.captionSegments[i];
      const left = this._timeToPx(seg.start);
      const width = Math.max(8, this._timeToPx(seg.end - seg.start));

      const el = document.createElement('div');
      el.className = 'tl-clip tl-clip--caption';
      if (seg.id === this.selectedCaptionId) el.classList.add('selected');
      el.dataset.segId = seg.id;
      el.style.left = left + 'px';
      el.style.width = width + 'px';
      el.title = seg.text;

      const span = document.createElement('span');
      span.className = 'tl-clip-text';
      span.textContent = seg.text;
      el.appendChild(span);

      const idx = i; // capture for closures
      el.addEventListener('click', e => {
        e.stopPropagation();
        this._selectCaption(seg.id, idx);
      });

      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        this._selectCaption(seg.id, idx);
        if (confirm(`删除字幕 "${seg.text}"？`)) {
          this.deleteSelectedCaption();
        }
      });

      this.captionContentEl.appendChild(el);

      // Drag border between this and the next segment
      if (i < this.captionSegments.length - 1) {
        this.captionContentEl.appendChild(this._makeCaptionBorder(i, false));
      }
    }

    // Right-edge drag handle for the last segment
    if (this.captionSegments.length > 0) {
      this.captionContentEl.appendChild(
        this._makeCaptionBorder(this.captionSegments.length - 1, true)
      );
    }
  }

  private _makeCaptionBorder(leftIdx: number, isRightEdge: boolean): HTMLElement {
    const seg = this.captionSegments[leftIdx];
    const x = this._timeToPx(seg.end);

    const el = document.createElement('div');
    el.className = 'tl-caption-border' + (isRightEdge ? ' tl-caption-border--right-edge' : '');
    el.style.left = (x - 4) + 'px';

    el.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
      this._startBorderDrag(e, leftIdx, el, isRightEdge);
    });

    return el;
  }

  private _startBorderDrag(
    e: MouseEvent,
    leftIdx: number,
    borderEl: HTMLElement,
    isRightEdge: boolean,
  ): void {
    const leftSeg = this.captionSegments[leftIdx];
    const rightSeg = isRightEdge ? null : this.captionSegments[leftIdx + 1];
    const startX = e.clientX;
    const startEnd = leftSeg.end;

    document.body.style.cursor = 'col-resize';
    borderEl.classList.add('dragging');

    // Grab DOM refs for in-place update during drag
    const leftClipEl = this.captionContentEl.querySelector<HTMLElement>(
      `[data-seg-id="${leftSeg.id}"]`
    );
    const rightClipEl = rightSeg
      ? this.captionContentEl.querySelector<HTMLElement>(`[data-seg-id="${rightSeg.id}"]`)
      : null;

    const onMove = (ev: MouseEvent) => {
      const dt = (ev.clientX - startX) / this.pxPerSec;
      const minEnd = leftSeg.start + MIN_CAPTION_DUR;
      const maxEnd = isRightEdge
        ? Infinity
        : Math.max(minEnd + MIN_CAPTION_DUR, rightSeg!.end - MIN_CAPTION_DUR);
      const newEnd = Math.min(maxEnd, Math.max(minEnd, startEnd + dt));

      leftSeg.end = newEnd;
      if (!isRightEdge && rightSeg) rightSeg.start = newEnd;

      // Update DOM in place (avoid full re-render during drag for smoothness)
      if (leftClipEl) {
        leftClipEl.style.width = Math.max(8, this._timeToPx(newEnd - leftSeg.start)) + 'px';
      }
      if (rightClipEl && rightSeg) {
        rightClipEl.style.left = this._timeToPx(newEnd) + 'px';
        rightClipEl.style.width = Math.max(8, this._timeToPx(rightSeg.end - newEnd)) + 'px';
      }
      borderEl.style.left = (this._timeToPx(newEnd) - 4) + 'px';

      this._updateInnerWidth();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      borderEl.classList.remove('dragging');
      // Full re-render on release to sync all borders
      this._renderCaptionTrack();
      this._renderRuler();
      this._updateInnerWidth();
      this._notify();
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  private _selectCaption(id: string, idx: number): void {
    this.selectedCaptionId = id;
    this._updateCaptionSelectionStyles();
    const seg = this.captionSegments[idx];
    for (const cb of this.onCaptionClickCbs) cb(idx, seg.start);
    for (const cb of this.onCaptionSelectChangeCbs) cb(idx);
  }

  /** Programmatically select a caption by index and scroll it into view. Does NOT fire onCaptionClick callbacks. */
  selectCaption(idx: number): void {
    const seg = this.captionSegments[idx];
    if (!seg) return;
    this.selectedCaptionId = seg.id;
    this._updateCaptionSelectionStyles();
    for (const cb of this.onCaptionSelectChangeCbs) cb(idx);
    // Scroll the clip into view
    const x = this._timeToPx(seg.start);
    const viewW = this.scrollAreaEl.clientWidth;
    if (x < this.scrollAreaEl.scrollLeft || x > this.scrollAreaEl.scrollLeft + viewW - 40) {
      this.scrollAreaEl.scrollLeft = Math.max(0, x - viewW / 3);
    }
  }

  private _updateCaptionSelectionStyles(): void {
    this.captionContentEl.querySelectorAll<HTMLElement>('.tl-clip--caption').forEach(el => {
      el.classList.toggle('selected', el.dataset.segId === this.selectedCaptionId);
    });
  }

  // ── Caption data helpers ───────────────────────────────────────────────────

  private _lyricsToSegments(lyrics: LyricLine[]): CaptionSegment[] {
    const segs: CaptionSegment[] = [];
    for (let i = 0; i < lyrics.length; i++) {
      const start = lyrics[i].time / 1000;
      const naturalEnd = (lyrics[i].time + lyrics[i].duration) / 1000;
      // Seamless mode: extend end to next lyric's start (fills any LRC gap)
      const end = i + 1 < lyrics.length ? lyrics[i + 1].time / 1000 : naturalEnd;
      segs.push({ id: uid(), text: lyrics[i].text, start, end, source: 'lrc' });
    }
    return segs;
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
      const rect = this.scrollAreaEl.getBoundingClientRect();
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

  // ── Keyboard ───────────────────────────────────────────────────────────────

  private _setupKeyboard(): void {
    document.addEventListener('keydown', e => {
      // Skip if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'Delete' && this.selectedCaptionId) {
        e.preventDefault();
        this.deleteSelectedCaption();
      }
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
