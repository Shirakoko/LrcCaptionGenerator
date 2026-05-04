import { parseLrc } from './parser/lrcParser.ts';
import type { RenderConfig } from './renderer/canvasRenderer.ts';
import { DEFAULT_CONFIG } from './renderer/canvasRenderer.ts';
import { SceneController } from './renderer/sceneController.ts';
import './style.css';
import { LineEditorUI } from './ui/lineEditor.ts';
import { CanvasDrag } from './ui/canvasDrag.ts';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const lrcInput = document.getElementById('lrc-input') as HTMLTextAreaElement;
const lrcUploadBtn = document.getElementById('lrc-upload-btn') as HTMLButtonElement;
const lrcFile = document.getElementById('lrc-file') as HTMLInputElement;
const seedInput = document.getElementById('seed-input') as HTMLInputElement;
const reseedBtn = document.getElementById('reseed-btn') as HTMLButtonElement;
const resolutionSelect = document.getElementById('resolution-select') as HTMLSelectElement;
const bgColor = document.getElementById('bg-color') as HTMLInputElement;
const fillColor = document.getElementById('fill-color') as HTMLInputElement;
const strokeWidthRange = document.getElementById('stroke-width') as HTMLInputElement;
const strokeWidthVal = document.getElementById('stroke-width-val') as HTMLSpanElement;
const strokeColor = document.getElementById('stroke-color') as HTMLInputElement;
const bgImgUploadBtn = document.getElementById('bg-img-upload-btn') as HTMLButtonElement;
const bgImgClearBtn = document.getElementById('bg-img-clear-btn') as HTMLButtonElement;
const bgImgFile = document.getElementById('bg-img-file') as HTMLInputElement;
const bgImgPreviewWrap = document.getElementById('bg-img-preview-wrap') as HTMLDivElement;
const bgImgPreview = document.getElementById('bg-img-preview') as HTMLImageElement;
const bgTabColor = document.getElementById('bg-tab-color') as HTMLButtonElement;
const bgTabImage = document.getElementById('bg-tab-image') as HTMLButtonElement;
const bgPanelColor = document.getElementById('bg-panel-color') as HTMLDivElement;
const bgPanelImage = document.getElementById('bg-panel-image') as HTMLDivElement;
const bgBrightnessInput = document.getElementById('bg-brightness') as HTMLInputElement;
const bgBrightnessVal = document.getElementById('bg-brightness-val') as HTMLSpanElement;
const bgContrastInput = document.getElementById('bg-contrast') as HTMLInputElement;
const bgContrastVal = document.getElementById('bg-contrast-val') as HTMLSpanElement;
const bgSaturateInput = document.getElementById('bg-saturate') as HTMLInputElement;
const bgSaturateVal = document.getElementById('bg-saturate-val') as HTMLSpanElement;
const bgAdjustReset = document.getElementById('bg-adjust-reset') as HTMLButtonElement;
const audioUploadBtn = document.getElementById('audio-upload-btn') as HTMLButtonElement;
const audioClearBtn = document.getElementById('audio-clear-btn') as HTMLButtonElement;
const audioFileInput = document.getElementById('audio-file') as HTMLInputElement;
const audioInfo = document.getElementById('audio-info') as HTMLDivElement;
const audioName = document.getElementById('audio-name') as HTMLSpanElement;
const buildBtn = document.getElementById('build-btn') as HTMLButtonElement;
const exportPngBtn = document.getElementById('export-png-btn') as HTMLButtonElement;
const exportWebmBtn = document.getElementById('export-webm-btn') as HTMLButtonElement;
const exportMovBtn = document.getElementById('export-mov-btn') as HTMLButtonElement;
const exportTransparent = document.getElementById('export-transparent') as HTMLInputElement;
const exportProgress = document.getElementById('export-progress') as HTMLDivElement;
const exportBar = document.getElementById('export-bar') as HTMLProgressElement;
const exportLabel = document.getElementById('export-label') as HTMLSpanElement;
const exportCancelBtn = document.getElementById('export-cancel-btn') as HTMLButtonElement;
const exportMovNote = document.getElementById('export-mov-note') as HTMLDivElement;
const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
const playPauseBtn = document.getElementById('play-pause-btn') as HTMLButtonElement;
const seekBar = document.getElementById('seek-bar') as HTMLInputElement;
const timeDisplay = document.getElementById('time-display') as HTMLSpanElement;
const rightPanel = document.getElementById('right-panel') as HTMLElement;
const rightPanelResize = document.getElementById('right-panel-resize') as HTMLElement;
const lineEditorList = document.getElementById('line-editor-list') as HTMLDivElement;
const leClearAllBtn = document.getElementById('le-clear-all-btn') as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────────
let scene: SceneController | null = null;
let lineEditor: LineEditorUI | null = null;
let canvasDrag: CanvasDrag | null = null;
let seekRafId = 0;
let bgImage: HTMLImageElement | null = null;
let bgMode: 'color' | 'image' = 'color';
let audioBlobUrl: string | null = null;
let isExporting = false;
let exportCancelled = false;
const audio = new Audio();
audio.preload = 'auto';

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
    bgImage: bgMode === 'image' ? bgImage : null,
    bgBrightness: parseInt(bgBrightnessInput.value, 10),
    bgContrast: parseInt(bgContrastInput.value, 10),
    bgSaturate: parseInt(bgSaturateInput.value, 10),
    fillColor: fillColor.value,
    strokeColor: strokeColor.value,
    strokeWidth: parseFloat(strokeWidthRange.value),
  };
}

function getSeed(): string | number {
  const v = seedInput.value.trim();
  return v === '' ? Date.now() : v;
}

function fmt(sec: number): string {
  return sec.toFixed(1);
}

function updateTransport(): void {
  if (!scene) return;
  const cur = scene.currentTime;
  const dur = scene.duration;
  timeDisplay.textContent = `${fmt(cur)} / ${fmt(dur)} s`;
  seekBar.value = dur > 0 ? String((cur / dur) * 100) : '0';
  playPauseBtn.textContent = scene.playing ? '⏸ 暂停' : '▶ 播放';
}

function startTransportLoop(): void {
  playPauseBtn.textContent = '⏸ 暂停';
  const loop = () => {
    updateTransport();
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
  reader.onload = (e) => {
    lrcInput.value = e.target?.result as string ?? '';
  };
  reader.readAsText(file, 'utf-8');
});

// ── Reseed ────────────────────────────────────────────────────────────────────
reseedBtn.addEventListener('click', () => {
  seedInput.value = String(Math.floor(Math.random() * 0xffffffff));
});

// ── Stroke width display ──────────────────────────────────────────────────────
strokeWidthRange.addEventListener('input', () => {
  strokeWidthVal.textContent = strokeWidthRange.value;
});

// ── Background tab switch ─────────────────────────────────────────────────────
function switchBgTab(mode: 'color' | 'image'): void {
  bgMode = mode;
  bgTabColor.classList.toggle('active', mode === 'color');
  bgTabImage.classList.toggle('active', mode === 'image');
  bgPanelColor.hidden = mode !== 'color';
  bgPanelImage.hidden = mode !== 'image';
}

bgTabColor.addEventListener('click', () => switchBgTab('color'));
bgTabImage.addEventListener('click', () => switchBgTab('image'));

// ── Background image ──────────────────────────────────────────────────────────
bgImgUploadBtn.addEventListener('click', () => bgImgFile.click());

bgImgFile.addEventListener('change', () => {
  const file = bgImgFile.files?.[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    bgImage = img;
    bgImgPreview.src = url;
    bgImgPreviewWrap.hidden = false;
  };
  img.src = url;
});

bgImgClearBtn.addEventListener('click', () => {
  bgImage = null;
  bgImgPreview.src = '';
  bgImgPreviewWrap.hidden = true;
  bgImgFile.value = '';
});

// ── Background image adjustments ──────────────────────────────────────────────
function syncSlider(input: HTMLInputElement, label: HTMLSpanElement): void {
  input.addEventListener('input', () => { label.textContent = `${input.value}%`; });
}
syncSlider(bgBrightnessInput, bgBrightnessVal);
syncSlider(bgContrastInput, bgContrastVal);
syncSlider(bgSaturateInput, bgSaturateVal);

bgAdjustReset.addEventListener('click', () => {
  bgBrightnessInput.value = '100'; bgBrightnessVal.textContent = '100%';
  bgContrastInput.value = '100';   bgContrastVal.textContent = '100%';
  bgSaturateInput.value = '100';   bgSaturateVal.textContent = '100%';
});

// ── Audio ─────────────────────────────────────────────────────────────────────
audioUploadBtn.addEventListener('click', () => audioFileInput.click());

audioFileInput.addEventListener('change', () => {
  const file = audioFileInput.files?.[0];
  if (!file) return;
  if (audioBlobUrl) URL.revokeObjectURL(audioBlobUrl);
  audioBlobUrl = URL.createObjectURL(file);
  audio.src = audioBlobUrl;
  audioName.textContent = file.name;
  audioInfo.hidden = false;
});

audioClearBtn.addEventListener('click', () => {
  audio.pause();
  audio.src = '';
  if (audioBlobUrl) { URL.revokeObjectURL(audioBlobUrl); audioBlobUrl = null; }
  audioInfo.hidden = true;
  audioFileInput.value = '';
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

  // 保留已有的手动编辑，跨 build 传递给新 scene
  const prevOverrides = scene?.getOverrideMap() ?? {};
  scene?.stop();
  scene = new SceneController(mainCanvas, cfg);
  scene.build(lyrics, { seed: getSeed(), randomLayout: true, overrides: prevOverrides });
  scene.seek(0);
  updateTransport();

  // 显示并（重）初始化行编辑器
  rightPanel.hidden = false;
  if (lineEditor) {
    lineEditor.update(scene, cfg.width, cfg.height);
  } else {
    lineEditor = new LineEditorUI(lineEditorList, scene, cfg.width, cfg.height, (t) => {
      if (audio.src) audio.currentTime = t;
      updateTransport();
    });
  }

  // 初始化 / 更新 canvas 拖拽
  if (!canvasDrag) {
    canvasDrag = new CanvasDrag(mainCanvas);
  }
  canvasDrag.update(scene, lineEditor);
});

// ── Transport ─────────────────────────────────────────────────────────────────
playPauseBtn.addEventListener('click', () => {
  if (!scene) return;
  if (scene.playing) {
    scene.pause();
    audio.pause();
    stopTransportLoop();
    updateTransport();
  } else {
    scene.play();
    if (audio.src) {
      audio.currentTime = scene.currentTime;
      audio.play().catch(() => {/* 用户未交互时忽略 */});
    }
    startTransportLoop();
  }
});

seekBar.addEventListener('input', () => {
  if (!scene) return;
  const pct = parseFloat(seekBar.value) / 100;
  const t = pct * scene.duration;
  scene.seek(t);
  if (audio.src) audio.currentTime = t;
  updateTransport();
});

// 音频自然结束时同步暂停动画
audio.addEventListener('ended', () => {
  scene?.pause();
  stopTransportLoop();
});

// ── Export helpers ────────────────────────────────────────────────────────────
function isTransparent(): boolean {
  return exportTransparent.checked;
}

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
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  const done = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

  // 导出时切换到透明模式
  const prevTransparent = scene!.transparentBg;
  scene!.transparentBg = isTransparent();

  recorder.start();
  for (let i = 0; i <= totalFrames; i++) {
    if (exportCancelled) break;
    const t = Math.min(i * frameInterval, dur);
    scene!.seek(t);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const pct = Math.round((i / totalFrames) * 100);
    exportBar.value = pct;
    exportLabel.textContent = `${pct}%`;
  }
  recorder.stop();
  await done;

  scene!.transparentBg = prevTransparent;
  scene!.seek(scene!.currentTime); // 恢复预览画面

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

// ── Export MOV (ProRes 4444 via ffmpeg.wasm) ──────────────────────────────────
exportMovBtn.addEventListener('click', async () => {
  if (!scene) { alert('请先生成预览'); return; }
  if (scene.duration <= 0) { alert('时长为 0，无法导出'); return; }

  setExportBusy(true);
  exportMovNote.hidden = false;
  exportLabel.textContent = '加载 ffmpeg…';

  try {
    // 懒加载 ffmpeg.wasm
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

    // 先渲染成 WebM
    const webmBlob = await renderToWebmBlob(30);
    if (exportCancelled) return;
    const webmData = await fetchFile(webmBlob);
    await ffmpeg.writeFile('input.webm', webmData);

    exportLabel.textContent = '转换 MOV…';
    exportBar.value = 99;

    // 转换为 ProRes 4444（保留 Alpha）
    await ffmpeg.exec([
      '-i', 'input.webm',
      '-c:v', 'prores_ks',
      '-profile:v', '4444',
      '-pix_fmt', 'yuva444p10le',
      '-vendor', 'apl0',
      'output.mov',
    ]);

    const movData = await ffmpeg.readFile('output.mov');
    // FileData 可能是 Uint8Array<SharedArrayBuffer>，需要复制到普通 ArrayBuffer
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
exportCancelBtn.addEventListener('click', () => {
  exportCancelled = true;
});

// ── Line editor: clear all overrides ─────────────────────────────────────────
leClearAllBtn.addEventListener('click', () => {
  if (!scene) return;
  scene.clearAllOverrides();
  lineEditor?.refresh();
});

// ── Right panel resize ────────────────────────────────────────────────────────
rightPanelResize.addEventListener('mousedown', (e) => {
  const startX = e.clientX;
  const startWidth = rightPanel.offsetWidth;

  rightPanelResize.classList.add('is-resizing');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  const onMove = (ev: MouseEvent) => {
    const dx = startX - ev.clientX;           // 向左拖 → 面板变宽
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
