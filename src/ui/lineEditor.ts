import type { SceneController, LineParams } from '../renderer/sceneController.ts';
import type { EntranceName, IdleName, ExitName, LineOverride } from '../effects/types.ts';
import { ENTRANCES, IDLES, EXITS } from '../effects/types.ts';

function fmtTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const cs = Math.floor((ms % 1000) / 10);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const ENTRANCE_LABELS: Record<EntranceName, string> = {
  typewriter: '打字机', slideLeft: '左滑入', slideRight: '右滑入',
  slideUp: '下滑入', slideDown: '上滑入', scalePop: '弹出',
  scatter: '散落', flipX: '翻转', blurFade: '模糊淡入', wave: '波浪',
};
const IDLE_LABELS: Record<IdleName, string> = {
  float: '浮动', charJitter: '字符抖动', breathe: '呼吸', none: '无',
};
const EXIT_LABELS: Record<ExitName, string> = {
  fadeOut: '淡出', floatUp: '上飘', floatDown: '下落',
  explode: '爆炸', shrink: '收缩', afterimage: '残影',
};

export class LineEditorUI {
  private container: HTMLElement;
  private scene: SceneController;
  private canvasWidth: number;
  private canvasHeight: number;
  private expandedIndex = -1;
  private selectedIndex = -1;

  constructor(
    container: HTMLElement,
    scene: SceneController,
    canvasWidth: number,
    canvasHeight: number,
  ) {
    this.container = container;
    this.scene = scene;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this._render();
  }

  /** 在场景重建后重新渲染列表（保留当前展开行） */
  refresh(): void {
    this._render();
  }

  /** 切换新 scene（重新 build 后调用） */
  update(scene: SceneController, canvasWidth: number, canvasHeight: number): void {
    this.scene = scene;
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.expandedIndex = -1;
    this.selectedIndex = -1;
    this._render();
  }

  /** 高亮选中行并滚动到可见区域（直接 DOM 操作，不重建列表） */
  setSelected(index: number | null): void {
    const newIdx = index ?? -1;
    if (this.selectedIndex >= 0) {
      (this.container.children[this.selectedIndex] as HTMLElement)
        ?.classList.remove('le-item--selected');
    }
    this.selectedIndex = newIdx;
    if (this.selectedIndex >= 0) {
      const item = this.container.children[this.selectedIndex] as HTMLElement;
      item?.classList.add('le-item--selected');
      item?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  private _render(): void {
    this.container.innerHTML = '';
    const lyrics = this.scene.getLyrics();
    lyrics.forEach((lyric, i) => {
      this.container.appendChild(this._buildItem(i, lyric.time, lyric.text));
    });
  }

  private _buildItem(index: number, timeMs: number, text: string): HTMLElement {
    const isModified = this.scene.hasOverride(index);
    const isExpanded = this.expandedIndex === index;
    const isSelected = this.selectedIndex === index;

    const item = document.createElement('div');
    item.className = 'le-item'
      + (isModified ? ' le-item--modified' : '')
      + (isSelected ? ' le-item--selected' : '');

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'le-header';

    const dot = document.createElement('span');
    dot.className = 'le-dot' + (isModified ? ' le-dot--on' : '');

    const timeEl = document.createElement('span');
    timeEl.className = 'le-time';
    timeEl.textContent = fmtTime(timeMs);

    const textEl = document.createElement('span');
    textEl.className = 'le-text';
    textEl.textContent = text;
    textEl.title = text;

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'le-toggle-btn';
    toggleBtn.textContent = isExpanded ? '▲' : '▼';

    header.append(dot, timeEl, textEl, toggleBtn);
    header.addEventListener('click', () => {
      this.expandedIndex = this.expandedIndex === index ? -1 : index;
      this._render();
    });

    item.appendChild(header);

    if (isExpanded) {
      const params = this.scene.getLineParams(index);
      if (params) {
        item.appendChild(this._buildPanel(index, params));
      }
    }

    return item;
  }

  private _buildPanel(index: number, params: LineParams): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'le-panel';

    // Params already reflect current overrides (layout and effects applied by sceneController)
    const { layout, effects } = params;

    // ── 布局 section ─────────────────────────────────────────────────────────
    const layoutSec = this._section('布局', [
      this._alignRow(layout.align),
      this._sliderRow('位置 X', 'x', layout.x, 0, this.canvasWidth, 1, 'px'),
      this._sliderRow('位置 Y', 'y', layout.y, 0, this.canvasHeight, 1, 'px'),
      this._sliderRow('字号', 'fontSize', layout.fontSize, 24, 200, 1, 'px'),
      this._sliderRow('字间距', 'letterSpacingExtra', layout.letterSpacing, -4, 16, 0.5, 'px'),
      this._sliderRow('旋转', 'rotation', layout.rotation, -20, 20, 0.5, '°'),
    ]);

    // ── 特效 section ─────────────────────────────────────────────────────────
    const fxSec = this._section('特效', [
      this._selectRow('入场', 'entrance', effects.entrance, ENTRANCES, ENTRANCE_LABELS),
      this._selectRow('持续', 'idle', effects.idle, IDLES, IDLE_LABELS),
      this._selectRow('退场', 'exit', effects.exit, EXITS, EXIT_LABELS),
    ]);

    // ── Actions ──────────────────────────────────────────────────────────────
    const actions = document.createElement('div');
    actions.className = 'le-actions';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'le-apply-btn';
    applyBtn.textContent = '应用并预览';

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'le-reset-btn';
    resetBtn.textContent = '还原随机值';
    resetBtn.disabled = !this.scene.hasOverride(index);

    applyBtn.addEventListener('click', () => {
      this.scene.setOverride(index, this._collectOverride(panel));
      this.expandedIndex = index;
      this._render();
    });

    resetBtn.addEventListener('click', () => {
      this.scene.clearOverride(index);
      this.expandedIndex = index;
      this._render();
    });

    actions.append(applyBtn, resetBtn);
    panel.append(layoutSec, fxSec, actions);
    return panel;
  }

  private _section(title: string, rows: HTMLElement[]): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'le-section';
    const t = document.createElement('div');
    t.className = 'le-section-title';
    t.textContent = title;
    sec.appendChild(t);
    rows.forEach(r => sec.appendChild(r));
    return sec;
  }

  private _sliderRow(
    label: string, key: string, value: number,
    min: number, max: number, step: number, unit: string,
  ): HTMLElement {
    const rounded = Math.round(value / step) * step;
    const clamped = Math.max(min, Math.min(max, rounded));

    const row = document.createElement('div');
    row.className = 'le-row';

    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = label;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'le-slider';
    slider.dataset.key = key;
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(clamped);

    const num = document.createElement('input');
    num.type = 'number';
    num.className = 'le-num';
    num.dataset.key = `${key}-num`;
    num.min = String(min);
    num.max = String(max);
    num.step = String(step);
    num.value = String(clamped);

    const unitEl = document.createElement('span');
    unitEl.className = 'le-unit';
    unitEl.textContent = unit;

    slider.addEventListener('input', () => { num.value = slider.value; });
    num.addEventListener('input', () => {
      const v = Math.max(min, Math.min(max, parseFloat(num.value) || 0));
      slider.value = String(v);
    });

    row.append(lbl, slider, num, unitEl);
    return row;
  }

  private _alignRow(current: 'left' | 'center' | 'right'): HTMLElement {
    const row = document.createElement('div');
    row.className = 'le-row';

    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = '对齐';

    const group = document.createElement('div');
    group.className = 'le-align-group';
    group.dataset.key = 'align';

    const opts: Array<['left' | 'center' | 'right', string]> = [
      ['left', '左'], ['center', '中'], ['right', '右'],
    ];
    opts.forEach(([val, txt]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'le-align-btn' + (val === current ? ' active' : '');
      btn.dataset.val = val;
      btn.textContent = txt;
      btn.addEventListener('click', () => {
        group.querySelectorAll('.le-align-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      group.appendChild(btn);
    });

    row.append(lbl, group);
    return row;
  }

  private _selectRow<T extends string>(
    label: string, key: string, current: T,
    options: T[], labels: Record<T, string>,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'le-row';

    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = label;

    const sel = document.createElement('select');
    sel.className = 'le-select';
    sel.dataset.key = key;
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = labels[opt];
      if (opt === current) o.selected = true;
      sel.appendChild(o);
    });

    row.append(lbl, sel);
    return row;
  }

  private _collectOverride(panel: HTMLElement): LineOverride {
    const sliderVal = (key: string): number => {
      const el = panel.querySelector<HTMLInputElement>(`[data-key="${key}"]`);
      return parseFloat(el?.value ?? '0');
    };
    const selectVal = (key: string): string => {
      const el = panel.querySelector<HTMLSelectElement>(`[data-key="${key}"]`);
      return el?.value ?? '';
    };
    const activeAlign = (): 'left' | 'center' | 'right' => {
      const btn = panel.querySelector<HTMLButtonElement>('.le-align-btn.active');
      return (btn?.dataset.val ?? 'center') as 'left' | 'center' | 'right';
    };

    return {
      layout: {
        x: sliderVal('x'),
        y: sliderVal('y'),
        fontSize: sliderVal('fontSize'),
        align: activeAlign(),
        letterSpacingExtra: sliderVal('letterSpacingExtra'),
        rotation: sliderVal('rotation'),
      },
      effects: {
        entrance: selectVal('entrance') as EntranceName,
        idle: selectVal('idle') as IdleName,
        exit: selectVal('exit') as ExitName,
      },
    };
  }
}
