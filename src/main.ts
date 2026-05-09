import { parseLrc } from './parser/lrcParser.ts';
import type { RenderConfig } from './renderer/canvasRenderer.ts';
import { DEFAULT_CONFIG } from './renderer/canvasRenderer.ts';
import { SceneController } from './renderer/sceneController.ts';
import './style.css';
import { LineEditorUI } from './ui/lineEditor.ts';
import { CanvasDrag } from './ui/canvasDrag.ts';
import { TimelineController } from './ui/timeline.ts';
import { FONTS, loadFonts } from './fonts.ts';

loadFonts();

// ── DOM refs ──────────────────────────────────────────────────────────────────
const lrcInput        = document.getElementById('lrc-input')         as HTMLTextAreaElement;
const lrcUploadBtn    = document.getElementById('lrc-upload-btn')    as HTMLButtonElement;
const lrcFile         = document.getElementById('lrc-file')          as HTMLInputElement;
const randomEnable    = document.getElementById('random-enable')     as HTMLInputElement;
const seedRow         = document.getElementById('seed-row')          as HTMLDivElement;
const seedInput       = document.getElementById('seed-input')        as HTMLInputElement;
const reseedBtn       = document.getElementById('reseed-btn')        as HTMLButtonElement;
const resolutionSelect = document.getElementById('resolution-select') as HTMLSelectElement;
const bgColor         = document.getElementById('bg-color')          as HTMLInputElement;
const fillColor       = document.getElementById('fill-color')        as HTMLInputElement;
const strokeWidthRange = document.getElementById('stroke-width')     as HTMLInputElement;
const strokeWidthVal  = document.getElementById('stroke-width-val')  as HTMLSpanElement;
const strokeColor     = document.getElementById('stroke-color')      as HTMLInputElement;
const buildBtn        = document.getElementById('build-btn')         as HTMLButtonElement;
const recBtn          = document.getElementById('rec-btn')            as HTMLButtonElement;
const recTimer        = document.getElementById('rec-timer')          as HTMLSpanElement;
const recIcon         = document.getElementById('rec-icon')           as HTMLSpanElement;
const recLabel        = document.getElementById('rec-label')          as HTMLSpanElement;
const mainCanvas      = document.getElementById('main-canvas')       as HTMLCanvasElement;
const playPauseBtn    = document.getElementById('play-pause-btn')    as HTMLButtonElement;
const seekBar         = document.getElementById('seek-bar')          as HTMLInputElement;
const timeDisplay     = document.getElementById('time-display')      as HTMLSpanElement;
const rightPanel      = document.getElementById('right-panel')       as HTMLElement;
const rightPanelResize = document.getElementById('right-panel-resize') as HTMLElement;
const lineEditorList  = document.getElementById('line-editor-list')  as HTMLDivElement;
const linePropsPanel  = document.getElementById('line-props-panel')  as HTMLDivElement;
const fontSelect      = document.getElementById('font-select')       as HTMLSelectElement;
const gspTab          = document.getElementById('gsp-tab')           as HTMLButtonElement;
const globalStylePanel = document.getElementById('global-style-panel') as HTMLDivElement;
const gspFont         = document.getElementById('gsp-font')          as HTMLSelectElement;
const gspFillColor    = document.getElementById('gsp-fill-color')    as HTMLInputElement;
const gspStrokeColor  = document.getElementById('gsp-stroke-color') as HTMLInputElement;
const gspStrokeWidth  = document.getElementById('gsp-stroke-width') as HTMLInputElement;
const gspStrokeWidthNum = document.getElementById('gsp-stroke-width-num') as HTMLInputElement;
const gspFontSize     = document.getElementById('gsp-font-size')     as HTMLInputElement;
const gspFontSizeNum  = document.getElementById('gsp-font-size-num') as HTMLInputElement;
const gspLetterSpacing    = document.getElementById('gsp-letter-spacing')     as HTMLInputElement;
const gspLetterSpacingNum = document.getElementById('gsp-letter-spacing-num') as HTMLInputElement;
const gspPosX         = document.getElementById('gsp-pos-x')         as HTMLInputElement;
const gspPosY         = document.getElementById('gsp-pos-y')         as HTMLInputElement;
const gspRotation     = document.getElementById('gsp-rotation')      as HTMLInputElement;
const gspRotationNum  = document.getElementById('gsp-rotation-num')  as HTMLInputElement;
const gspApplyBtn     = document.getElementById('gsp-apply-btn')     as HTMLButtonElement;
const gspAlignGroup   = document.getElementById('gsp-align-group')   as HTMLDivElement;
// Timeline
const timelineEl      = document.getElementById('timeline')          as HTMLDivElement;
const tlMediaAdd      = document.getElementById('tl-media-add')      as HTMLButtonElement;
const tlAudioAdd      = document.getElementById('tl-audio-add')      as HTMLButtonElement;
const tlCaptionAdd    = document.getElementById('tl-caption-add')    as HTMLButtonElement;
const tlMediaFile     = document.getElementById('tl-media-file')     as HTMLInputElement;
const tlAudioFile     = document.getElementById('tl-audio-file')     as HTMLInputElement;

// ── Font selectors ────────────────────────────────────────────────────────────
FONTS.forEach(font => {
  const makeOpt = () => {
    const opt = document.createElement('option');
    opt.value = font.family;
    opt.textContent = font.name;
    opt.style.fontFamily = font.family;
    return opt;
  };
  fontSelect.appendChild(makeOpt());
  gspFont.appendChild(makeOpt());
});

// ── Global style panel ────────────────────────────────────────────────────────

// Tab toggle
gspTab.addEventListener('click', () => {
  const open = !globalStylePanel.hidden;
  globalStylePanel.hidden = open;
  gspTab.classList.toggle('active', !open);
});

// Close panel when clicking outside
document.addEventListener('click', e => {
  if (globalStylePanel.hidden) return;
  const wrap = document.getElementById('gsp-tab-wrap')!;
  if (!wrap.contains(e.target as Node)) {
    globalStylePanel.hidden = true;
    gspTab.classList.remove('active');
  }
});

gspAlignGroup.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest('.le-align-btn') as HTMLButtonElement | null;
  if (!btn) return;
  gspAlignGroup.querySelectorAll('.le-align-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
});

// Sync slider ↔ number pairs
function syncPair(slider: HTMLInputElement, num: HTMLInputElement, min: number, max: number) {
  slider.addEventListener('input', () => { num.value = slider.value; });
  num.addEventListener('input', () => {
    const v = Math.max(min, Math.min(max, parseFloat(num.value) || 0));
    slider.value = String(v);
  });
}
syncPair(gspStrokeWidth, gspStrokeWidthNum, 0, 16);
syncPair(gspFontSize, gspFontSizeNum, 24, 200);
syncPair(gspLetterSpacing, gspLetterSpacingNum, -4, 32);
syncPair(gspRotation, gspRotationNum, -180, 180);

// ── State ─────────────────────────────────────────────────────────────────────
let scene: SceneController | null = null;
let lineEditor: LineEditorUI | null = null;
let canvasDrag: CanvasDrag | null = null;
let seekRafId = 0;

// ── Recording state ───────────────────────────────────────────────────────────
let mediaRecorder: MediaRecorder | null = null;
let recChunks: Blob[] = [];
let recStream: MediaStream | null = null;
let recTimerInterval = 0;
let recStartTime = 0;

// Detect best supported codec once at startup
const _recMimeType = (() => {
  if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')) return 'video/mp4;codecs=avc1';
  if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) return 'video/webm;codecs=vp9';
  return 'video/webm';
})();
const _recExt = _recMimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

// ── Timeline ──────────────────────────────────────────────────────────────────
const timeline = new TimelineController(timelineEl);

timeline.onSeek(t => {
  if (!scene) return;
  scene.seek(t);
  timeline.seekAudio(t);
  timeline.syncPlayhead(t);
  updateTransport();
});

timeline.onCaptionClick((_lineIdx, timeSec) => {
  if (!scene) return;
  scene.seek(timeSec);
  timeline.seekAudio(timeSec);
  timeline.syncPlayhead(timeSec);
  updateTransport();
});

// Update caption "+" button state when selection changes
timeline.onCaptionSelectionChange(indices => {
  const hasData = timeline.hasCaptionData();
  tlCaptionAdd.disabled = indices.length === 0 && hasData;
  tlCaptionAdd.title = indices.length === 0 && hasData ? '请先选中一条字幕' : '在选中字幕后插入';
  // Sync right panel selection (without triggering timeline callback again)
  if (lineEditor) lineEditor.setSelection(indices);
});

timeline.onChange(() => {
  updateTransport();
  if (scene && lineEditor) {
    scene.updateLyrics(timeline.getCaptionAsLyrics());
    lineEditor.refresh();
  }
});

// Media file input
tlMediaAdd.addEventListener('click', () => tlMediaFile.click());
tlMediaFile.addEventListener('change', async () => {
  if (!tlMediaFile.files?.length) return;
  await timeline.addMediaFiles(tlMediaFile.files);
  tlMediaFile.value = '';
});

// Audio file input
tlAudioAdd.addEventListener('click', () => tlAudioFile.click());
tlAudioFile.addEventListener('change', async () => {
  if (!tlAudioFile.files?.length) return;
  await timeline.addAudioFiles(tlAudioFile.files);
  tlAudioFile.value = '';
});

// Caption insert button
tlCaptionAdd.addEventListener('click', () => {
  timeline.insertCaption();
  updateTransport();
});

// Drag-drop setup
timeline.setupDragDrop(
  async files => { await timeline.addMediaFiles(files); },
  async files => { await timeline.addAudioFiles(files); },
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function getResolution(): { width: number; height: number } {
  const [w, h] = resolutionSelect.value.split('x').map(Number);
  return { width: w, height: h };
}

function buildConfig(): RenderConfig {
  const { width, height } = getResolution();
  return {
    ...DEFAULT_CONFIG,
    width,
    height,
    bgColor: bgColor.value,
    fillColor: fillColor.value,
    strokeColor: strokeColor.value,
    strokeWidth: parseFloat(strokeWidthRange.value),
    fontFamily: fontSelect.value || DEFAULT_CONFIG.fontFamily,
  };
}

function getSeed(): string | number {
  const v = seedInput.value.trim();
  return v === '' ? Date.now() : v;
}

function fmt(sec: number): string { return sec.toFixed(1); }

function updateTransport(): void {
  if (!scene) return;
  const cur = scene.currentTime;
  const dur = Math.max(scene.duration, timeline.totalDuration);
  timeDisplay.textContent = `${fmt(cur)} / ${fmt(dur)} s`;
  seekBar.value = dur > 0 ? String((cur / dur) * 100) : '0';
  playPauseBtn.textContent = scene.playing ? '⏸ 暂停' : '▶ 播放';
  timeline.syncPlayhead(cur, scene.playing);
}

function startTransportLoop(): void {
  playPauseBtn.textContent = '⏸ 暂停';
  const loop = () => {
    updateTransport();
    timeline.syncAudio(scene!.currentTime, true);
    seekRafId = requestAnimationFrame(loop);
  };
  seekRafId = requestAnimationFrame(loop);
}

function stopTransportLoop(): void {
  cancelAnimationFrame(seekRafId);
  playPauseBtn.textContent = '▶ 播放';
}

// ── LRC upload ────────────────────────────────────────────────────────────────
lrcUploadBtn.addEventListener('click', () => lrcFile.click());
lrcFile.addEventListener('change', () => {
  const file = lrcFile.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    lrcInput.value = e.target?.result as string ?? '';
    // Clear timeline captions so next build re-parses from LRC
    timeline.clearCaptionSegments();
  };
  reader.readAsText(file, 'utf-8');
});

// Clear timeline captions when LRC text is manually edited
lrcInput.addEventListener('input', () => timeline.clearCaptionSegments());

// ── Random enable toggle ──────────────────────────────────────────────────────
function syncSeedRowVisibility(): void { seedRow.hidden = !randomEnable.checked; }
randomEnable.addEventListener('change', syncSeedRowVisibility);
syncSeedRowVisibility();

// ── Reseed ────────────────────────────────────────────────────────────────────
reseedBtn.addEventListener('click', () => {
  seedInput.value = String(Math.floor(Math.random() * 0xffffffff));
});

// ── Stroke width display ──────────────────────────────────────────────────────
strokeWidthRange.addEventListener('input', () => {
  strokeWidthVal.textContent = strokeWidthRange.value;
});

// ── Live background color preview ─────────────────────────────────────────────
bgColor.addEventListener('input', () => {
  scene?.updateConfig({ bgColor: bgColor.value });
});

// ── Build ─────────────────────────────────────────────────────────────────────
buildBtn.addEventListener('click', () => {
  // If currently recording, stop first
  if (mediaRecorder?.state === 'recording') {
    const ok = confirm('当前正在录制视频，是否停止录制并重新生成预览？');
    if (!ok) return;
    stopRecording();
  }

  const raw = lrcInput.value.trim();
  if (!raw) { alert('请先输入或上传 LRC 歌词'); return; }

  // If a previous build exists, ask whether to overwrite edits or keep them.
  let resetEdits = false;
  if (timeline.hasCaptionData()) {
    const ok = confirm(
      '已有编辑中的字幕数据。\n\n' +
      '点击「确定」将重新解析 LRC，覆盖时间轴和属性编辑。\n' +
      '点击「取消」保留现有编辑，仅重新生成特效随机值。'
    );
    resetEdits = ok;
  }

  // Parse lyrics: fresh from LRC when overwriting, otherwise keep timeline data.
  let lyrics = (!resetEdits && timeline.hasCaptionData())
    ? timeline.getCaptionAsLyrics()
    : parseLrc(raw);

  if (lyrics.length === 0) { alert('未能解析到任何歌词行，请检查 LRC 格式'); return; }

  const cfg = buildConfig();
  // Carry over property overrides only when not resetting edits.
  const prevOverrides = resetEdits ? {} : (scene?.getOverrideMap() ?? {});
  scene?.stop();
  scene = new SceneController(mainCanvas, cfg);

  // Wire timeline media resolver
  scene.setMediaResolver(t => {
    const clip = timeline.getMediaAtTime(t);
    if (!clip) return null;
    return { element: clip.element, brightness: clip.brightness, contrast: clip.contrast, saturate: clip.saturate };
  });

  // Wire timeline transition resolver
  scene.setTransitionResolver(t => {
    const trans = timeline.getTransitionAtTime(t);
    if (!trans) return null;
    return {
      fromClip: {
        element: trans.fromClip.element,
        brightness: trans.fromClip.brightness,
        contrast: trans.fromClip.contrast,
        saturate: trans.fromClip.saturate,
      },
      toClip: {
        element: trans.toClip.element,
        brightness: trans.toClip.brightness,
        contrast: trans.toClip.contrast,
        saturate: trans.toClip.saturate,
      },
      progress: trans.progress,
      type: trans.type,
    };
  });

  scene.build(lyrics, { seed: getSeed(), randomLayout: true, staticMode: !randomEnable.checked, overrides: prevOverrides });
  scene.seek(0);

  // Populate caption track: always write when resetting, only on first build otherwise.
  if (resetEdits || !timeline.hasCaptionData()) {
    timeline.setCaptionLyrics(lyrics);
  }
  timeline.syncPlayhead(0);

  updateTransport();

  // Line editor
  rightPanel.hidden = false;
  if (lineEditor) {
    lineEditor.update(scene, cfg.width, cfg.height);
  } else {
    lineEditor = new LineEditorUI(lineEditorList, linePropsPanel, scene, cfg.width, cfg.height, t => {
      timeline.seekAudio(t);
      timeline.syncPlayhead(t);
      updateTransport();
    });
    // Sync timeline selection when lyrics are selected in the right panel
    lineEditor.onLineSelect((indices: number[]) => {
      if (indices.length === 1) {
        timeline.selectCaption(indices[0]);
      } else {
        timeline.setSelectedCaptions(indices);
      }
    });
  }

  // Global style panel — sync initial values from left panel, enable tab
  gspFillColor.value = fillColor.value;
  gspStrokeColor.value = strokeColor.value;
  gspStrokeWidth.value = strokeWidthRange.value;
  gspStrokeWidthNum.value = strokeWidthRange.value;
  gspFont.value = fontSelect.value;
  gspTab.disabled = false;
  recBtn.disabled = false;
  recBtn.disabled = false;

  // Canvas drag
  if (!canvasDrag) canvasDrag = new CanvasDrag(mainCanvas);
  canvasDrag.update(scene, lineEditor);
});

// ── Transport ─────────────────────────────────────────────────────────────────
playPauseBtn.addEventListener('click', () => {
  if (!scene) return;
  if (scene.playing) {
    scene.pause();
    timeline.stopAllAudio();
    stopTransportLoop();
    updateTransport();
  } else {
    scene.play();
    timeline.syncAudio(scene.currentTime, true);
    startTransportLoop();
  }
});

seekBar.addEventListener('input', () => {
  if (!scene) return;
  const pct = parseFloat(seekBar.value) / 100;
  const dur = Math.max(scene.duration, timeline.totalDuration);
  const t = pct * dur;
  scene.seek(t);
  timeline.seekAudio(t);
  timeline.syncPlayhead(t);
  updateTransport();
});

// ── Recording ─────────────────────────────────────────────────────────────────

function _updateRecTimer(): void {
  const elapsed = Math.floor((Date.now() - recStartTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  recTimer.textContent = `${m}:${s}`;
}

function startRecording(): void {
  if (!scene) return;
  recChunks = [];
  recStream = mainCanvas.captureStream(30);
  mediaRecorder = new MediaRecorder(recStream, {
    mimeType: _recMimeType,
    videoBitsPerSecond: 8_000_000,
  });
  mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recChunks.push(e.data); };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recChunks, { type: _recMimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caption_${Date.now()}.${_recExt}`;
    a.click();
    URL.revokeObjectURL(url);
    recChunks = [];
  };
  mediaRecorder.start(100);

  recIcon.textContent = '⏹';
  recLabel.textContent = ' 停止录制';
  recBtn.classList.add('recording');
  recTimer.hidden = false;
  recStartTime = Date.now();
  recTimerInterval = window.setInterval(_updateRecTimer, 500);
}

function stopRecording(): void {
  mediaRecorder?.stop();
  recStream?.getTracks().forEach(t => t.stop());
  recStream = null;
  mediaRecorder = null;
  clearInterval(recTimerInterval);

  recIcon.textContent = '⏺';
  recLabel.textContent = ' 开始录制';
  recBtn.classList.remove('recording');
  recTimer.hidden = true;
}

recBtn.addEventListener('click', () => {
  if (mediaRecorder?.state === 'recording') {
    stopRecording();
  } else {
    startRecording();
  }
});

// ── Global style apply ────────────────────────────────────────────────────────
gspApplyBtn.addEventListener('click', () => {
  if (!scene) return;
  const activeAlignBtn = gspAlignGroup.querySelector<HTMLButtonElement>('.le-align-btn.active');
  const align = (activeAlignBtn?.dataset.val ?? 'center') as 'left' | 'center' | 'right';

  const posXRaw = gspPosX.value.trim();
  const posYRaw = gspPosY.value.trim();
  const x = posXRaw !== '' ? parseFloat(posXRaw) : undefined;
  const y = posYRaw !== '' ? parseFloat(posYRaw) : undefined;

  scene.applyStyleToAll({
    fontFamily: gspFont.value,
    align,
    fillColor: gspFillColor.value,
    strokeColor: gspStrokeColor.value,
    strokeWidth: parseFloat(gspStrokeWidth.value),
    fontSize: parseFloat(gspFontSize.value),
    letterSpacingExtra: parseFloat(gspLetterSpacing.value),
    x,
    y,
    rotation: parseFloat(gspRotation.value),
  });
  lineEditor?.refresh();
});

// ── Right panel resize ────────────────────────────────────────────────────────
rightPanelResize.addEventListener('mousedown', e => {
  const startX = e.clientX;
  const startWidth = rightPanel.offsetWidth;

  rightPanelResize.classList.add('is-resizing');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMove = (ev: MouseEvent) => {
    const dx = startX - ev.clientX;
    const newWidth = Math.max(300, Math.min(600, startWidth + dx));
    rightPanel.style.width = `${newWidth}px`;
  };

  const onUp = () => {
    rightPanelResize.classList.remove('is-resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  e.preventDefault();
});
