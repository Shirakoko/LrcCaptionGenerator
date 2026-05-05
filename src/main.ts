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
const exportPngBtn    = document.getElementById('export-png-btn')    as HTMLButtonElement;
const exportWebmBtn   = document.getElementById('export-webm-btn')   as HTMLButtonElement;
const exportMovBtn    = document.getElementById('export-mov-btn')    as HTMLButtonElement;
const exportTransparent = document.getElementById('export-transparent') as HTMLInputElement;
const exportProgress  = document.getElementById('export-progress')   as HTMLDivElement;
const exportBar       = document.getElementById('export-bar')        as HTMLProgressElement;
const exportLabel     = document.getElementById('export-label')      as HTMLSpanElement;
const exportCancelBtn = document.getElementById('export-cancel-btn') as HTMLButtonElement;
const exportMovNote   = document.getElementById('export-mov-note')   as HTMLDivElement;
const mainCanvas      = document.getElementById('main-canvas')       as HTMLCanvasElement;
const playPauseBtn    = document.getElementById('play-pause-btn')    as HTMLButtonElement;
const seekBar         = document.getElementById('seek-bar')          as HTMLInputElement;
const timeDisplay     = document.getElementById('time-display')      as HTMLSpanElement;
const rightPanel      = document.getElementById('right-panel')       as HTMLElement;
const rightPanelResize = document.getElementById('right-panel-resize') as HTMLElement;
const lineEditorList  = document.getElementById('line-editor-list')  as HTMLDivElement;
const linePropsPanel  = document.getElementById('line-props-panel')  as HTMLDivElement;
const fontSelect      = document.getElementById('font-select')       as HTMLSelectElement;
const globalStylePanel = document.getElementById('global-style-panel') as HTMLDivElement;
const gspFont         = document.getElementById('gsp-font')          as HTMLSelectElement;
const gspFillColor    = document.getElementById('gsp-fill-color')    as HTMLInputElement;
const gspStrokeColor  = document.getElementById('gsp-stroke-color') as HTMLInputElement;
const gspStrokeWidth  = document.getElementById('gsp-stroke-width') as HTMLInputElement;
const gspStrokeWidthNum = document.getElementById('gsp-stroke-width-num') as HTMLInputElement;
const gspApplyBtn     = document.getElementById('gsp-apply-btn')     as HTMLButtonElement;
const gspAlignGroup   = document.getElementById('gsp-align-group')   as HTMLDivElement;
// Timeline
const timelineEl      = document.getElementById('timeline')          as HTMLDivElement;
const tlMediaAdd      = document.getElementById('tl-media-add')      as HTMLButtonElement;
const tlAudioAdd      = document.getElementById('tl-audio-add')      as HTMLButtonElement;
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
gspAlignGroup.addEventListener('click', e => {
  const btn = (e.target as HTMLElement).closest('.le-align-btn') as HTMLButtonElement | null;
  if (!btn) return;
  gspAlignGroup.querySelectorAll('.le-align-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
});

gspStrokeWidth.addEventListener('input', () => { gspStrokeWidthNum.value = gspStrokeWidth.value; });
gspStrokeWidthNum.addEventListener('input', () => {
  const v = Math.max(0, Math.min(16, parseFloat(gspStrokeWidthNum.value) || 0));
  gspStrokeWidth.value = String(v);
});

// ── State ─────────────────────────────────────────────────────────────────────
let scene: SceneController | null = null;
let lineEditor: LineEditorUI | null = null;
let canvasDrag: CanvasDrag | null = null;
let seekRafId = 0;
let isExporting = false;
let exportCancelled = false;

// ── Timeline ──────────────────────────────────────────────────────────────────
const timeline = new TimelineController(timelineEl);

timeline.onSeek(t => {
  if (!scene) return;
  scene.seek(t);
  timeline.seekAudio(t);
  timeline.syncPlayhead(t);
  updateTransport();
});

timeline.onCaptionClick((lineIdx, timeSec) => {
  if (!scene) return;
  scene.seek(timeSec);
  timeline.seekAudio(timeSec);
  timeline.syncPlayhead(timeSec);
  lineEditor?.setSelected(lineIdx);
  updateTransport();
});

timeline.onChange(() => {
  // When timeline clips change, update the scene's total duration ref via seek bar
  updateTransport();
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
  reader.onload = e => { lrcInput.value = e.target?.result as string ?? ''; };
  reader.readAsText(file, 'utf-8');
});

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
  if (isExporting) {
    const ok = confirm('当前正在渲染视频，是否中断并重新生成预览？');
    if (!ok) return;
    exportCancelled = true;
  }

  const raw = lrcInput.value.trim();
  if (!raw) { alert('请先输入或上传 LRC 歌词'); return; }

  const lyrics = parseLrc(raw);
  if (lyrics.length === 0) { alert('未能解析到任何歌词行，请检查 LRC 格式'); return; }

  const cfg = buildConfig();
  const prevOverrides = scene?.getOverrideMap() ?? {};
  scene?.stop();
  scene = new SceneController(mainCanvas, cfg);

  // Wire timeline media resolver
  scene.setMediaResolver(t => {
    const clip = timeline.getMediaAtTime(t);
    if (!clip) return null;
    return { element: clip.element, brightness: clip.brightness, contrast: clip.contrast, saturate: clip.saturate };
  });

  scene.build(lyrics, { seed: getSeed(), randomLayout: true, staticMode: !randomEnable.checked, overrides: prevOverrides });
  scene.seek(0);

  // Populate caption track
  timeline.setCaptionLyrics(lyrics);
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
  }

  // Global style panel
  globalStylePanel.hidden = false;
  gspFillColor.value = fillColor.value;
  gspStrokeColor.value = strokeColor.value;
  gspStrokeWidth.value = strokeWidthRange.value;
  gspStrokeWidthNum.value = strokeWidthRange.value;
  gspFont.value = fontSelect.value;

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

// ── Export helpers ────────────────────────────────────────────────────────────
function isTransparent(): boolean { return exportTransparent.checked; }

async function renderToWebmBlob(fps: number): Promise<Blob> {
  const dur = scene!.duration;
  const totalFrames = Math.ceil(dur * fps);
  const frameInterval = 1 / fps;

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const chunks: Blob[] = [];
  const stream = mainCanvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });

  const prevTransparent = scene!.transparentBg;
  scene!.transparentBg = isTransparent();

  recorder.start();
  for (let i = 0; i <= totalFrames; i++) {
    if (exportCancelled) break;
    const t = Math.min(i * frameInterval, dur);
    scene!.seek(t);
    await new Promise<void>(r => requestAnimationFrame(() => r()));
    const pct = Math.round((i / totalFrames) * 100);
    exportBar.value = pct;
    exportLabel.textContent = `${pct}%`;
  }
  recorder.stop();
  await done;

  scene!.transparentBg = prevTransparent;
  scene!.seek(scene!.currentTime);
  return new Blob(chunks, { type: mimeType });
}

function setExportBusy(busy: boolean): void {
  isExporting = busy;
  if (!busy) exportCancelled = false;
  exportProgress.hidden = !busy;
  exportWebmBtn.disabled = busy;
  exportMovBtn.disabled = busy;
  exportPngBtn.disabled = busy;
  seekBar.disabled = busy;
  playPauseBtn.disabled = busy;
}

// ── Export PNG ────────────────────────────────────────────────────────────────
exportPngBtn.addEventListener('click', () => {
  if (!scene) { alert('请先生成预览'); return; }
  const prev = scene.transparentBg;
  scene.transparentBg = isTransparent();
  scene.seek(scene.currentTime);
  const url = scene.exportFramePng();
  scene.transparentBg = prev;
  scene.seek(scene.currentTime);
  const a = document.createElement('a');
  a.href = url;
  a.download = `caption_${Date.now()}.png`;
  a.click();
});

// ── Export WebM ───────────────────────────────────────────────────────────────
exportWebmBtn.addEventListener('click', async () => {
  if (!scene) { alert('请先生成预览'); return; }
  if (scene.duration <= 0) { alert('时长为 0，无法导出'); return; }

  setExportBusy(true);
  try {
    const blob = await renderToWebmBlob(30);
    if (exportCancelled) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caption_${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    setExportBusy(false);
  }
});

// ── Export MOV ────────────────────────────────────────────────────────────────
exportMovBtn.addEventListener('click', async () => {
  if (!scene) { alert('请先生成预览'); return; }
  if (scene.duration <= 0) { alert('时长为 0，无法导出'); return; }

  setExportBusy(true);
  exportMovNote.hidden = false;
  exportLabel.textContent = '加载 ffmpeg…';

  try {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg');
    const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

    const ffmpeg = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    exportMovNote.hidden = true;
    exportLabel.textContent = '渲染帧…';

    const webmBlob = await renderToWebmBlob(30);
    if (exportCancelled) return;
    const webmData = await fetchFile(webmBlob);
    await ffmpeg.writeFile('input.webm', webmData);

    exportLabel.textContent = '转换 MOV…';
    exportBar.value = 99;

    await ffmpeg.exec([
      '-i', 'input.webm',
      '-c:v', 'prores_ks',
      '-profile:v', '4444',
      '-pix_fmt', 'yuva444p10le',
      '-vendor', 'apl0',
      'output.mov',
    ]);

    const movData = await ffmpeg.readFile('output.mov');
    const movBytes = movData instanceof Uint8Array
      ? movData.buffer.slice(0) as ArrayBuffer
      : (movData as unknown as ArrayBuffer);
    const movBlob = new Blob([movBytes], { type: 'video/quicktime' });
    const url = URL.createObjectURL(movBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `caption_${Date.now()}.mov`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    if (!exportCancelled) {
      alert('MOV 导出失败，请查看控制台。\n提示：部分浏览器需要 HTTPS 才能使用 ffmpeg.wasm。');
    }
  } finally {
    setExportBusy(false);
    exportMovNote.hidden = true;
  }
});

// ── Export cancel ─────────────────────────────────────────────────────────────
exportCancelBtn.addEventListener('click', () => { exportCancelled = true; });

// ── Global style apply ────────────────────────────────────────────────────────
gspApplyBtn.addEventListener('click', () => {
  if (!scene) return;
  const activeAlignBtn = gspAlignGroup.querySelector<HTMLButtonElement>('.le-align-btn.active');
  const align = (activeAlignBtn?.dataset.val ?? 'center') as 'left' | 'center' | 'right';
  scene.applyStyleToAll({
    fontFamily: gspFont.value,
    align,
    fillColor: gspFillColor.value,
    strokeColor: gspStrokeColor.value,
    strokeWidth: parseFloat(gspStrokeWidth.value),
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
