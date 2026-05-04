import type { SceneController } from '../renderer/sceneController.ts';
import type { LineEditorUI } from './lineEditor.ts';

export class CanvasDrag {
  private canvas: HTMLCanvasElement;
  private scene: SceneController | null = null;
  private lineEditor: LineEditorUI | null = null;

  private dragging = false;
  private dragIndex = -1;
  private grabOffsetX = 0;
  private grabOffsetY = 0;
  private hasMoved = false;
  private wasPlaying = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._onPointerUp);
    canvas.addEventListener('pointercancel', this._onPointerUp);
  }

  update(scene: SceneController, lineEditor: LineEditorUI): void {
    this.scene = scene;
    this.lineEditor = lineEditor;
  }

  private _canvasCoords(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (this.canvas.width / rect.width),
      y: (e.clientY - rect.top) * (this.canvas.height / rect.height),
    };
  }

  private _hitTest(cx: number, cy: number): number {
    if (!this.scene) return -1;
    const lines = this.scene.lines;
    const lyrics = this.scene.getLyrics();
    const tMs = this.scene.currentTime * 1000;

    for (let i = lines.length - 1; i >= 0; i--) {
      const lyric = lyrics[i];
      // Only hit-test lines whose time window covers the current playhead
      if (tMs < lyric.time || tMs > lyric.time + lyric.duration) continue;

      const line = lines[i];
      if (line.chars.length === 0) continue;

      const { x: ax, y: ay, fontSize, rotation } = line.layout;
      const angle = -(rotation * Math.PI) / 180;
      const dx = cx - ax;
      const dy = cy - ay;
      const lx = dx * Math.cos(angle) - dy * Math.sin(angle);
      const ly = dx * Math.sin(angle) + dy * Math.cos(angle);

      const first = line.chars[0];
      const last = line.chars[line.chars.length - 1];
      const halfW = (last.baseX - first.baseX) / 2 + fontSize * 0.6;

      if (lx >= -halfW && lx <= halfW && ly >= -fontSize * 0.9 && ly <= fontSize * 0.35) {
        return i;
      }
    }
    return -1;
  }

  private _onPointerDown = (e: PointerEvent): void => {
    if (!this.scene || !this.lineEditor) return;
    const { x, y } = this._canvasCoords(e);
    const idx = this._hitTest(x, y);

    if (idx < 0) {
      this.lineEditor.setSelected(null);
      return;
    }

    this.dragging = true;
    this.dragIndex = idx;
    this.hasMoved = false;
    this.wasPlaying = this.scene.playing;

    const anchor = this.scene.lines[idx].layout;
    this.grabOffsetX = x - anchor.x;
    this.grabOffsetY = y - anchor.y;

    if (this.wasPlaying) this.scene.pause();
    this.lineEditor.setSelected(idx);
    this.canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  private _onPointerMove = (e: PointerEvent): void => {
    if (!this.scene) return;
    const { x, y } = this._canvasCoords(e);

    if (!this.dragging) {
      this.canvas.style.cursor = this._hitTest(x, y) >= 0 ? 'move' : 'default';
      return;
    }

    this.hasMoved = true;
    this.scene.updateLinePositionLive(
      this.dragIndex,
      x - this.grabOffsetX,
      y - this.grabOffsetY,
    );
    e.preventDefault();
  };

  private _onPointerUp = (_e: PointerEvent): void => {
    if (!this.dragging || !this.scene || !this.lineEditor) return;

    if (this.hasMoved) {
      const { x, y } = this.scene.lines[this.dragIndex].layout;
      const existing = this.scene.getOverride(this.dragIndex) ?? {};
      this.scene.setOverride(this.dragIndex, {
        ...existing,
        layout: { ...existing.layout, x: Math.round(x), y: Math.round(y) },
      });
      this.lineEditor.refresh();
    }

    if (this.wasPlaying) this.scene.play();

    this.dragging = false;
    this.dragIndex = -1;
    this.hasMoved = false;
    this.wasPlaying = false;
    this.canvas.style.cursor = 'default';
  };
}
