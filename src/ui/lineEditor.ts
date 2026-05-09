import type { SceneController, LineParams } from '../renderer/sceneController.ts';
import type { EntranceName, IdleName, ExitName, LineOverride, PixelFxEntry, PixelFxName, CharDecoration } from '../effects/types.ts';
import { ENTRANCES, IDLES, EXITS } from '../effects/types.ts';
import {
  ENTRANCE_PARAMS, IDLE_PARAMS, EXIT_PARAMS,
  PIXEL_FX_ORDER, PIXEL_FX_LABELS, PIXEL_FX_PARAMS, PIXEL_FX_COLOR_PARAMS,
  type ParamDef,
} from '../effects/paramSchemas.ts';
import { FONTS } from '../fonts.ts';

function fmtTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const cs  = Math.floor((ms % 1000) / 10);
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

const ENTRANCE_LABELS: Record<EntranceName, string> = {
  none: '无',
  typewriter: '打字机', slideLeft: '左滑入', slideRight: '右滑入',
  slideUp: '下滑入', slideDown: '上滑入', scalePop: '弹出',
  wave: '波浪', fadeIn: '淡入', glitch: '故障闪烁',
  flipIn: '垂直翻转', converge: '四面飞来',
  elasticBounce: '弹性入场', staggerDrop: '错落布局',
};
const IDLE_LABELS: Record<IdleName, string> = {
  none: '无',
  float: '浮动', charJitter: '字符抖动', breathe: '呼吸', altFloat: '交错浮动',
  ripple: '水波纹', flicker: '明暗闪烁', invertFlicker: '反色闪烁', sway: '左右摇晃',
};
const EXIT_LABELS: Record<ExitName, string> = {
  none: '无',
  fadeOut: '淡出', floatUp: '上飘', floatDown: '下落',
  explode: '爆炸', shrink: '收缩', afterimage: '残影', blurOut: '模糊淡出',
  squash: '压扁消失', particleFall: '下落粒子',
};

export class LineEditorUI {
  private container: HTMLElement;
  private propsPanel: HTMLElement;
  private scene: SceneController;
  private canvasWidth: number;
  private canvasHeight: number;
  private selectedIndices: Set<number> = new Set();
  private lastAnchorIndex: number | null = null;
  private onSeek: ((timeSec: number) => void) | undefined;
  private onLineSelectCb: ((indices: number[]) => void) | undefined;

  onLineSelect(cb: (indices: number[]) => void): void {
    this.onLineSelectCb = cb;
  }

  getSelectedIndices(): number[] {
    return [...this.selectedIndices].sort((a, b) => a - b);
  }

  /** 替换整个选集（外部调用，如 timeline 同步过来，不触发回调避免循环） */
  setSelection(indices: number[]): void {
    this.selectedIndices = new Set(indices);
    if (indices.length > 0) this.lastAnchorIndex = indices[indices.length - 1];
    this._onSelectionChanged(false);
  }

  constructor(
    container: HTMLElement,
    propsPanel: HTMLElement,
    scene: SceneController,
    canvasWidth: number,
    canvasHeight: number,
    onSeek?: (timeSec: number) => void,
  ) {
    this.container    = container;
    this.propsPanel   = propsPanel;
    this.scene        = scene;
    this.canvasWidth  = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.onSeek       = onSeek;

    // Wire auto-apply once on the shared panel
    propsPanel.addEventListener('input', (e) => {
      // Remove mixed marker when user starts editing
      const target = e.target as HTMLElement;
      target.removeAttribute('data-mixed');
      this._autoApply();
    });
    propsPanel.addEventListener('change', (e) => {
      const target = e.target as HTMLElement;
      target.removeAttribute('data-mixed');
      this._autoApply();
    });
    propsPanel.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.le-align-btn')) {
        this._autoApply();
      }
    });

    // Keyboard shortcuts on the list container
    container.setAttribute('tabindex', '0');
    container.addEventListener('keydown', (e) => {
      const total = this.scene.getLyrics().length;
      if (total === 0) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        this._setSelection([...Array(total).keys()]);
        this.lastAnchorIndex = total - 1;
        this._onSelectionChanged(true);
      } else if (e.key === 'Escape') {
        this._clearSelection();
        this._onSelectionChanged(true);
      }
    });

    this._render();
  }

  refresh(): void {
    this._render();
    const indices = this.getSelectedIndices();
    if (indices.length > 0) {
      this._updatePropsPanel(indices);
    }
  }

  update(scene: SceneController, canvasWidth: number, canvasHeight: number): void {
    this.scene        = scene;
    this.canvasWidth  = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.selectedIndices.clear();
    this.lastAnchorIndex = null;
    this.propsPanel.hidden = true;
    this._render();
  }

  /** 向后兼容：单选（外部调用，如 canvasDrag） */
  setSelected(index: number | null): void {
    if (index === null) {
      this._clearSelection();
    } else {
      this._setSelection([index]);
      this.lastAnchorIndex = index;
    }
    this._onSelectionChanged(false);
  }

  // ── Internal selection helpers ───────────────────────────────────────────────

  private _setSelection(indices: number[]): void {
    this.selectedIndices = new Set(indices);
  }

  private _toggleSelection(index: number): void {
    if (this.selectedIndices.has(index)) {
      this.selectedIndices.delete(index);
    } else {
      this.selectedIndices.add(index);
    }
  }

  private _selectRange(from: number, to: number): void {
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    this.selectedIndices.clear();
    for (let i = lo; i <= hi; i++) this.selectedIndices.add(i);
  }

  private _clearSelection(): void {
    this.selectedIndices.clear();
    this.lastAnchorIndex = null;
  }

  /**
   * 选集变化后统一处理：重新渲染列表、更新属性面板、触发回调
   * @param fireCallback 是否触发 onLineSelectCb（外部同步时传 false 避免循环）
   */
  private _onSelectionChanged(fireCallback: boolean): void {
    this._render();
    const indices = this.getSelectedIndices();
    if (indices.length > 0) {
      // Scroll first selected item into view
      const firstEl = this.container.children[indices[0]] as HTMLElement;
      firstEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      this._updatePropsPanel(indices);
    } else {
      this.propsPanel.hidden = true;
    }
    if (fireCallback) {
      this.onLineSelectCb?.(indices);
    }
  }

  private _render(): void {
    this.container.innerHTML = '';
    const lyrics = this.scene.getLyrics();
    lyrics.forEach((lyric, i) => {
      const effectiveText = this.scene.getOverride(i)?.text ?? lyric.text;
      this.container.appendChild(this._buildItem(i, lyric.time, effectiveText));
    });
  }

  private _buildItem(index: number, timeMs: number, text: string): HTMLElement {
    const isSelected = this.selectedIndices.has(index);

    const item = document.createElement('div');
    item.className = 'le-item' + (isSelected ? ' le-item--selected' : '');

    const header = document.createElement('div');
    header.className = 'le-header';

    const timeEl = document.createElement('span');
    timeEl.className = 'le-time';
    timeEl.textContent = fmtTime(timeMs);

    const textEl = document.createElement('span');
    textEl.className = 'le-text';
    textEl.textContent = text;
    textEl.title = text;

    header.append(timeEl, textEl);
    header.addEventListener('click', (e) => {
      const timeSec = timeMs / 1000;
      this.scene.seek(timeSec);
      this.onSeek?.(timeSec);

      if (e.ctrlKey || e.metaKey) {
        this._toggleSelection(index);
        this.lastAnchorIndex = index;
      } else if (e.shiftKey && this.lastAnchorIndex !== null) {
        this._selectRange(this.lastAnchorIndex, index);
      } else {
        // Plain click: toggle off if already sole selection, else single-select
        if (this.selectedIndices.size === 1 && this.selectedIndices.has(index)) {
          this._clearSelection();
        } else {
          this._setSelection([index]);
          this.lastAnchorIndex = index;
        }
      }
      this._onSelectionChanged(true);
    });

    item.appendChild(header);
    return item;
  }

  private _autoApply(): void {
    const indices = this.getSelectedIndices();
    if (indices.length === 0) return;
    const override = this._collectOverride(this.propsPanel);
    for (const idx of indices) {
      const merged = this._mergeOverride(idx, override);
      this.scene.setOverride(idx, merged);
      this._updateListItemState(idx);
    }
  }

  /**
   * 将 partial override 合并到该行已有的 override 上。
   * 跳过 text 字段（多选时不批量修改文字）。
   * 跳过仍带 data-mixed="true" 的控件对应字段（用户未修改的混合值）。
   */
  private _mergeOverride(idx: number, partial: ReturnType<typeof this._collectOverride>): ReturnType<typeof this._collectOverride> {
    const existing = this.scene.getOverride(idx) ?? {};
    const panel = this.propsPanel;
    const isMulti = this.selectedIndices.size > 1;

    // Helper: check if a control is still in mixed state
    const isMixed = (key: string): boolean => {
      if (!isMulti) return false;
      const el = panel.querySelector(`[data-key="${key}"][data-mixed="true"]`);
      return el !== null;
    };

    const result: ReturnType<typeof this._collectOverride> = { ...existing };

    // text: only apply in single-select
    if (!isMulti && partial.text !== undefined) {
      result.text = partial.text;
    }

    // layout fields
    if (partial.layout) {
      const existingLayout = existing.layout ?? {};
      result.layout = { ...existingLayout };
      const layoutKeys = ['x', 'y', 'fontSize', 'letterSpacingExtra', 'rotation', 'fontFamily', 'align'] as const;
      for (const k of layoutKeys) {
        if (!isMixed(k) && partial.layout[k] !== undefined) {
          (result.layout as Record<string, unknown>)[k] = partial.layout[k];
        }
      }
    }

    // colors
    if (!isMixed('fillColor') && partial.fillColor !== undefined) result.fillColor = partial.fillColor;
    if (!isMixed('strokeColor') && partial.strokeColor !== undefined) result.strokeColor = partial.strokeColor;
    if (!isMixed('strokeWidth') && partial.strokeWidth !== undefined) result.strokeWidth = partial.strokeWidth;

    // effects
    if (partial.effects) {
      const existingFx = existing.effects ?? {};
      result.effects = { ...existingFx };
      if (!isMixed('entrance') && partial.effects.entrance) {
        result.effects.entrance = partial.effects.entrance;
        result.effects.entranceParams = partial.effects.entranceParams;
      }
      if (!isMixed('idle') && partial.effects.idle) {
        result.effects.idle = partial.effects.idle;
        result.effects.idleParams = partial.effects.idleParams;
      }
      if (!isMixed('exit') && partial.effects.exit) {
        result.effects.exit = partial.effects.exit;
        result.effects.exitParams = partial.effects.exitParams;
      }
    }

    // pixelFx and decoration: always apply (checkboxes handle their own mixed state)
    if (partial.pixelFx !== undefined) result.pixelFx = partial.pixelFx;
    if (partial.decoration !== undefined) result.decoration = partial.decoration;

    return result;
  }

  private _updateListItemState(index: number): void {
    const item = this.container.children[index] as HTMLElement;
    if (!item) return;
    const textEl = item.querySelector<HTMLElement>('.le-text');
    if (textEl) {
      const effectiveText = this.scene.getOverride(index)?.text
        ?? this.scene.getLyrics()[index]?.text ?? '';
      textEl.textContent = effectiveText;
      textEl.title = effectiveText;
    }
  }

  /** 根据选中索引数量决定渲染单选面板还是多选面板 */
  private _updatePropsPanel(indices: number[]): void {
    if (indices.length === 1) {
      const params = this.scene.getLineParams(indices[0]);
      if (params) this._populateProps(indices[0], params);
    } else {
      this._populateMultiProps(indices);
    }
  }

  private _populateProps(index: number, params: LineParams): void {
    this.propsPanel.innerHTML = '';
    this.propsPanel.hidden = false;

    const { layout, effects } = params;
    const savedOverride = this.scene.getOverride(index);
    const cfg = this.scene.getConfig();
    const lyrics = this.scene.getLyrics();
    const lyric = lyrics[index];

    // ── Editable text ─────────────────────────────────────────────────────────
    const textRow = document.createElement('div');
    textRow.className = 'le-row lp-text-row';

    const textLabel = document.createElement('label');
    textLabel.className = 'le-label';
    textLabel.textContent = '文字';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.className = 'lp-text-input';
    textInput.dataset.key = 'lyric-text';
    textInput.value = savedOverride?.text ?? (lyric?.text ?? '');

    textRow.append(textLabel, textInput);
    this.propsPanel.appendChild(textRow);

    // ── Layout section ────────────────────────────────────────────────────────
    const layoutSec = this._section('布局', [
      this._fontRow(savedOverride?.layout?.fontFamily ?? cfg.fontFamily),
      this._alignRow(layout.align),
      this._sliderRow('字号',    'fontSize',           layout.fontSize,      24, 200,              1,   'px'),
      this._sliderRow('字间距',  'letterSpacingExtra', layout.letterSpacing, -4, 16,               0.5, 'px'),
      this._posRow(layout.x, layout.y, this.canvasWidth, this.canvasHeight),
      this._sliderRow('旋转',    'rotation',           layout.rotation,     -20, 20,               0.5, '°'),
    ]);
    this.propsPanel.appendChild(layoutSec);

    // ── Color section ─────────────────────────────────────────────────────────
    const colorSec = this._section('颜色', [
      this._fillStrokeColorRow(
        savedOverride?.fillColor   ?? cfg.fillColor,
        savedOverride?.strokeColor ?? cfg.strokeColor,
      ),
      this._sliderRow('描边粗细', 'strokeWidth', savedOverride?.strokeWidth ?? cfg.strokeWidth, 0, 16, 0.5, 'px'),
    ]);
    this.propsPanel.appendChild(colorSec);

    // ── Effects section ───────────────────────────────────────────────────────
    const fxSec = document.createElement('div');
    fxSec.className = 'le-section';
    const fxTitle = document.createElement('div');
    fxTitle.className = 'le-section-title';
    fxTitle.textContent = '特效';
    fxSec.appendChild(fxTitle);

    fxSec.appendChild(this._buildEffectGroup(
      'entrance', '入场',
      ENTRANCES as unknown as string[], ENTRANCE_LABELS as Record<string, string>,
      effects.entrance,
      ENTRANCE_PARAMS as Record<string, ParamDef[]>,
      savedOverride?.effects?.entranceParams,
    ));
    fxSec.appendChild(this._buildEffectGroup(
      'idle', '持续',
      IDLES as unknown as string[], IDLE_LABELS as Record<string, string>,
      effects.idle,
      IDLE_PARAMS as Record<string, ParamDef[]>,
      savedOverride?.effects?.idleParams,
    ));
    fxSec.appendChild(this._buildEffectGroup(
      'exit', '退场',
      EXITS as unknown as string[], EXIT_LABELS as Record<string, string>,
      effects.exit,
      EXIT_PARAMS as Record<string, ParamDef[]>,
      savedOverride?.effects?.exitParams,
    ));

    this.propsPanel.appendChild(fxSec);

    // ── Pixel effects section ─────────────────────────────────────────────────
    const pixelSec = this._buildPixelFxSection(savedOverride?.pixelFx ?? []);
    this.propsPanel.appendChild(pixelSec);

    // ── Decoration section ────────────────────────────────────────────────────
    const decoSec = this._buildDecorationSection(savedOverride?.decoration);
    this.propsPanel.appendChild(decoSec);
  }

  // ── Multi-select properties panel ────────────────────────────────────────────

  private _populateMultiProps(indices: number[]): void {
    this.propsPanel.innerHTML = '';
    this.propsPanel.hidden = false;

    const cfg = this.scene.getConfig();

    // Helper: get a field value from all selected lines, return mixed result
    const getValues = <T>(getter: (idx: number) => T): { mixed: false; value: T } | { mixed: true } => {
      const vals = indices.map(getter);
      const first = vals[0];
      return vals.every(v => v === first) ? { mixed: false, value: first } : { mixed: true };
    };

    // ── Header ────────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'le-multi-header';
    header.textContent = `已选中 ${indices.length} 条字幕`;
    this.propsPanel.appendChild(header);

    // ── Layout section ────────────────────────────────────────────────────────
    const getLayout = (idx: number) => this.scene.getLineParams(idx)?.layout;

    const fontResult = getValues(idx => this.scene.getOverride(idx)?.layout?.fontFamily ?? cfg.fontFamily);
    const alignResult = getValues(idx => getLayout(idx)?.align ?? 'center');
    const fontSizeResult = getValues(idx => getLayout(idx)?.fontSize ?? 60);
    const letterResult = getValues(idx => getLayout(idx)?.letterSpacing ?? 0);
    const rotResult = getValues(idx => getLayout(idx)?.rotation ?? 0);
    const xResult = getValues(idx => getLayout(idx)?.x ?? 0);
    const yResult = getValues(idx => getLayout(idx)?.y ?? 0);

    const layoutSec = this._section('布局', [
      this._fontRowMixed(fontResult.mixed ? null : fontResult.value, fontResult.mixed),
      this._alignRowMixed(alignResult.mixed ? null : alignResult.value as 'left' | 'center' | 'right', alignResult.mixed),
      this._sliderRowMixed('字号',   'fontSize',           fontSizeResult.mixed ? null : fontSizeResult.value, 24, 200, 1, 'px', fontSizeResult.mixed),
      this._sliderRowMixed('字间距', 'letterSpacingExtra', letterResult.mixed ? null : letterResult.value, -4, 16, 0.5, 'px', letterResult.mixed),
      this._posRowMixed(xResult.mixed ? null : xResult.value, yResult.mixed ? null : yResult.value, this.canvasWidth, this.canvasHeight, xResult.mixed, yResult.mixed),
      this._sliderRowMixed('旋转',   'rotation',           rotResult.mixed ? null : rotResult.value, -20, 20, 0.5, '°', rotResult.mixed),
    ]);
    this.propsPanel.appendChild(layoutSec);

    // ── Color section ─────────────────────────────────────────────────────────
    const fillResult   = getValues(idx => this.scene.getOverride(idx)?.fillColor   ?? cfg.fillColor);
    const strokeResult = getValues(idx => this.scene.getOverride(idx)?.strokeColor ?? cfg.strokeColor);
    const strokeWResult = getValues(idx => this.scene.getOverride(idx)?.strokeWidth ?? cfg.strokeWidth);

    const colorSec = this._section('颜色', [
      this._fillStrokeColorRowMixed(
        fillResult.mixed   ? null : fillResult.value,   fillResult.mixed,
        strokeResult.mixed ? null : strokeResult.value, strokeResult.mixed,
      ),
      this._sliderRowMixed('描边粗细', 'strokeWidth', strokeWResult.mixed ? null : strokeWResult.value, 0, 16, 0.5, 'px', strokeWResult.mixed),
    ]);
    this.propsPanel.appendChild(colorSec);

    // ── Effects section (only dropdowns, no param sliders) ────────────────────
    const fxSec = document.createElement('div');
    fxSec.className = 'le-section';
    const fxTitle = document.createElement('div');
    fxTitle.className = 'le-section-title';
    fxTitle.textContent = '特效';
    fxSec.appendChild(fxTitle);

    const entranceResult = getValues(idx => this.scene.getLineParams(idx)?.effects.entrance ?? 'none');
    const idleResult     = getValues(idx => this.scene.getLineParams(idx)?.effects.idle     ?? 'none');
    const exitResult     = getValues(idx => this.scene.getLineParams(idx)?.effects.exit     ?? 'none');

    fxSec.appendChild(this._effectDropdownMixed('entrance', '入场', ENTRANCES as unknown as string[], ENTRANCE_LABELS as Record<string, string>, entranceResult.mixed ? null : entranceResult.value, entranceResult.mixed));
    fxSec.appendChild(this._effectDropdownMixed('idle',     '持续', IDLES     as unknown as string[], IDLE_LABELS     as Record<string, string>, idleResult.mixed     ? null : idleResult.value,     idleResult.mixed));
    fxSec.appendChild(this._effectDropdownMixed('exit',     '退场', EXITS     as unknown as string[], EXIT_LABELS     as Record<string, string>, exitResult.mixed     ? null : exitResult.value,     exitResult.mixed));
    this.propsPanel.appendChild(fxSec);

    // ── Pixel effects (only checkboxes, no param sliders) ─────────────────────
    const pixelSec = this._buildPixelFxSectionMulti(indices);
    this.propsPanel.appendChild(pixelSec);

    // ── Decoration (no random-range slider) ───────────────────────────────────
    const decoSec = this._buildDecorationSectionMulti(indices);
    this.propsPanel.appendChild(decoSec);
  }

  /** Effect dropdown with params for multi-select — shows params after user picks an effect */
  private _effectDropdownMixed(
    category: string, labelText: string,
    options: string[], labels: Record<string, string>,
    currentEffect: string | null, mixed: boolean,
  ): HTMLElement {
    const container = document.createElement('div');
    container.className = 'le-effect-group';

    const row = document.createElement('div');
    row.className = 'le-row';

    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = labelText;

    const sel = document.createElement('select');
    sel.className = 'le-select';
    sel.dataset.key = category;

    if (mixed) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '— 多个值 —';
      placeholder.disabled = true;
      placeholder.selected = true;
      sel.appendChild(placeholder);
      sel.dataset.mixed = 'true';
    }

    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = labels[opt] ?? opt;
      if (!mixed && opt === currentEffect) o.selected = true;
      sel.appendChild(o);
    });

    row.append(lbl, sel);
    container.appendChild(row);

    // Params area — rendered when user picks an effect
    const paramsDiv = document.createElement('div');
    paramsDiv.className = 'le-effect-params';
    paramsDiv.dataset.paramsFor = category;
    container.appendChild(paramsDiv);

    const schemas = category === 'entrance' ? ENTRANCE_PARAMS as Record<string, ParamDef[]>
      : category === 'idle' ? IDLE_PARAMS as Record<string, ParamDef[]>
      : EXIT_PARAMS as Record<string, ParamDef[]>;

    const renderParams = (effectName: string) => {
      paramsDiv.innerHTML = '';
      const defs = schemas[effectName] ?? [];
      for (const def of defs) {
        paramsDiv.appendChild(
          this._sliderRow(def.label, `${category}-${def.key}`, def.default, def.min, def.max, def.step, def.unit),
        );
      }
    };

    // Show params for the current consistent effect on initial render
    if (!mixed && currentEffect) renderParams(currentEffect);

    sel.addEventListener('change', () => {
      sel.removeAttribute('data-mixed');
      renderParams(sel.value);
    });

    return container;
  }

  /** Pixel effects section with checkboxes and params for multi-select */
  private _buildPixelFxSectionMulti(indices: number[]): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'le-section';
    const title = document.createElement('div');
    title.className = 'le-section-title';
    title.textContent = '像素特效';
    sec.appendChild(title);

    for (const fxName of PIXEL_FX_ORDER) {
      const enabledValues = indices.map(idx => {
        const fx = this.scene.getOverride(idx)?.pixelFx ?? [];
        return fx.find(e => e.name === fxName)?.enabled ?? false;
      });
      const allSame = enabledValues.every(v => v === enabledValues[0]);
      const allEnabled = allSame && enabledValues[0];

      const row = document.createElement('div');
      row.className = 'le-row le-pfx-row';
      row.dataset.pixelFx = fxName;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'le-pfx-cb';
      if (allSame) {
        cb.checked = enabledValues[0];
      } else {
        cb.indeterminate = true;
        cb.dataset.mixed = 'true';
      }

      const lbl = document.createElement('label');
      lbl.className = 'le-pfx-label';
      lbl.textContent = PIXEL_FX_LABELS[fxName as PixelFxName];

      row.append(cb, lbl);
      sec.appendChild(row);

      // Params area — shown when all selected are enabled
      const paramsDiv = document.createElement('div');
      paramsDiv.className = 'le-pfx-params';
      paramsDiv.hidden = !allEnabled;

      const numDefs = PIXEL_FX_PARAMS[fxName as PixelFxName] ?? [];
      for (const def of numDefs) {
        // Use the first selected line's saved value as initial, fall back to default
        const firstSaved = this.scene.getOverride(indices[0])?.pixelFx?.find(e => e.name === fxName);
        const val = typeof firstSaved?.params[def.key] === 'number'
          ? firstSaved!.params[def.key] as number
          : def.default;
        const paramRow = this._sliderRow(def.label, `pfx-${fxName}-${def.key}`, val, def.min, def.max, def.step, def.unit);
        paramRow.querySelectorAll('input[type="range"]').forEach(el => {
          (el as HTMLInputElement).dataset.fxParam = def.key;
        });
        paramsDiv.appendChild(paramRow);
      }

      const colorDefs = PIXEL_FX_COLOR_PARAMS[fxName as PixelFxName] ?? [];
      for (const cd of colorDefs) {
        const firstSaved = this.scene.getOverride(indices[0])?.pixelFx?.find(e => e.name === fxName);
        const val = (firstSaved?.params[cd.key] as string) ?? cd.default;
        paramsDiv.appendChild(this._colorRow(cd.label, `pfx-${fxName}-${cd.key}`, val, cd.key));
      }

      sec.appendChild(paramsDiv);

      cb.addEventListener('change', () => {
        cb.removeAttribute('data-mixed');
        paramsDiv.hidden = !cb.checked;
      });
    }

    return sec;
  }

  /** Decoration section without random-range slider */
  private _buildDecorationSectionMulti(indices: number[]): HTMLElement {
    const enabledValues = indices.map(idx => this.scene.getOverride(idx)?.decoration?.enabled ?? false);
    const allSame = enabledValues.every(v => v === enabledValues[0]);
    const allEnabled = allSame && enabledValues[0];

    const sec = document.createElement('div');
    sec.className = 'le-section';
    const title = document.createElement('div');
    title.className = 'le-section-title';
    title.textContent = '字符装饰';
    sec.appendChild(title);

    const toggleRow = document.createElement('div');
    toggleRow.className = 'le-row le-deco-toggle-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'le-pfx-cb';
    cb.dataset.key = 'deco-enabled';
    if (allSame) {
      cb.checked = enabledValues[0];
    } else {
      cb.indeterminate = true;
      cb.dataset.mixed = 'true';
    }
    const lbl = document.createElement('label');
    lbl.className = 'le-pfx-label';
    lbl.textContent = '启用背景形状';
    toggleRow.append(cb, lbl);
    sec.appendChild(toggleRow);

    // Params area — only shown when ALL selected lines have decoration enabled
    const paramsDiv = document.createElement('div');
    paramsDiv.className = 'le-pfx-params le-deco-params';
    paramsDiv.hidden = !allEnabled;

    const shapeValues = indices.map(idx => this.scene.getOverride(idx)?.decoration?.shape ?? 'rect');
    const shapeMixed = !shapeValues.every(v => v === shapeValues[0]);
    const shapeRow = document.createElement('div');
    shapeRow.className = 'le-row';
    const shapeLbl = document.createElement('label');
    shapeLbl.className = 'le-label';
    shapeLbl.textContent = '形状';
    const shapeSel = document.createElement('select');
    shapeSel.className = 'le-select';
    shapeSel.dataset.key = 'deco-shape';
    if (shapeMixed) {
      const ph = document.createElement('option');
      ph.value = ''; ph.textContent = '— 多个值 —'; ph.disabled = true; ph.selected = true;
      shapeSel.appendChild(ph);
      shapeSel.dataset.mixed = 'true';
    }
    (['rect', 'circle', 'diamond'] as const).forEach((v) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v === 'rect' ? '方形' : v === 'circle' ? '圆形' : '菱形';
      if (!shapeMixed && v === shapeValues[0]) opt.selected = true;
      shapeSel.appendChild(opt);
    });
    shapeRow.append(shapeLbl, shapeSel);
    paramsDiv.appendChild(shapeRow);

    const sizeValues = indices.map(idx => this.scene.getOverride(idx)?.decoration?.size ?? 30);
    const sizeMixed = !sizeValues.every(v => v === sizeValues[0]);
    paramsDiv.appendChild(this._sliderRowMixed('半边长', 'deco-size', sizeMixed ? null : sizeValues[0], 4, 200, 1, 'px', sizeMixed));

    // Random size checkbox only (no range slider)
    const randValues = indices.map(idx => this.scene.getOverride(idx)?.decoration?.randomSize ?? false);
    const randMixed = !randValues.every(v => v === randValues[0]);
    const randRow = document.createElement('div');
    randRow.className = 'le-row';
    const randCb = document.createElement('input');
    randCb.type = 'checkbox';
    randCb.className = 'le-pfx-cb';
    randCb.dataset.key = 'deco-random-size';
    if (randMixed) { randCb.indeterminate = true; randCb.dataset.mixed = 'true'; }
    else randCb.checked = randValues[0];
    const randLbl = document.createElement('label');
    randLbl.className = 'le-pfx-label';
    randLbl.textContent = '随机大小';
    randRow.append(randCb, randLbl);
    paramsDiv.appendChild(randRow);

    const colorValues = indices.map(idx => this.scene.getOverride(idx)?.decoration?.color ?? '#ffffff');
    const colorMixed = !colorValues.every(v => v === colorValues[0]);
    paramsDiv.appendChild(this._colorRowMixed('颜色', 'deco-color', colorMixed ? null : colorValues[0], colorMixed));

    sec.appendChild(paramsDiv);
    cb.addEventListener('change', () => { paramsDiv.hidden = !cb.checked; });

    return sec;
  }

  private _buildEffectGroup(
    category: string,
    labelText: string,
    options: string[],
    labels: Record<string, string>,
    currentEffect: string,
    schemas: Record<string, ParamDef[]>,
    savedParams?: Record<string, number>,
  ): HTMLElement {
    const container = document.createElement('div');
    container.className = 'le-effect-group';

    const selectRow = document.createElement('div');
    selectRow.className = 'le-row';

    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = labelText;

    const sel = document.createElement('select');
    sel.className = 'le-select';
    sel.dataset.key = category;
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = labels[opt] ?? opt;
      if (opt === currentEffect) o.selected = true;
      sel.appendChild(o);
    });

    selectRow.append(lbl, sel);
    container.appendChild(selectRow);

    const paramsDiv = document.createElement('div');
    paramsDiv.className = 'le-effect-params';
    paramsDiv.dataset.paramsFor = category;
    container.appendChild(paramsDiv);

    const renderParams = (effectName: string, prevParams?: Record<string, number>) => {
      paramsDiv.innerHTML = '';
      const defs = schemas[effectName] ?? [];
      if (defs.length === 0) return;
      for (const def of defs) {
        const value = prevParams?.[def.key] ?? def.default;
        paramsDiv.appendChild(
          this._sliderRow(def.label, `${category}-${def.key}`, value, def.min, def.max, def.step, def.unit),
        );
      }
    };

    renderParams(currentEffect, savedParams);

    // Re-render params with defaults when effect changes; auto-apply fires via bubbled change event
    sel.addEventListener('change', () => renderParams(sel.value));

    return container;
  }

  // ── Font row ────────────────────────────────────────────────────────────────

  private _fontRow(currentFamily: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'le-row';

    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = '字体';

    const sel = document.createElement('select');
    sel.className = 'le-select';
    sel.dataset.key = 'fontFamily';

    FONTS.forEach(font => {
      const opt = document.createElement('option');
      opt.value = font.family;
      opt.textContent = font.name;
      opt.style.fontFamily = font.family;
      if (font.family === currentFamily) opt.selected = true;
      sel.appendChild(opt);
    });

    row.append(lbl, sel);
    return row;
  }

  private _fillStrokeColorRow(fillVal: string, strokeVal: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'le-row';

    const fillLbl = document.createElement('label');
    fillLbl.className = 'le-label';
    fillLbl.textContent = '字色';

    const fillInput = document.createElement('input');
    fillInput.type = 'color';
    fillInput.className = 'le-color';
    fillInput.dataset.key = 'fillColor';
    fillInput.value = fillVal;

    const strokeLbl = document.createElement('label');
    strokeLbl.className = 'le-label';
    strokeLbl.textContent = '描边色';

    const strokeInput = document.createElement('input');
    strokeInput.type = 'color';
    strokeInput.className = 'le-color';
    strokeInput.dataset.key = 'strokeColor';
    strokeInput.value = strokeVal;

    row.append(fillLbl, fillInput, strokeLbl, strokeInput);
    return row;
  }

  // ── Color row ───────────────────────────────────────────────────────────────

  private _colorRow(label: string, key: string, value: string, fxParam?: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'le-row';

    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = label;

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'le-color';
    colorInput.dataset.key = key;
    if (fxParam) colorInput.dataset.fxParam = fxParam;
    colorInput.value = value;

    row.append(lbl, colorInput);
    return row;
  }

  // ── Generic slider row ──────────────────────────────────────────────────────

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
    slider.min   = String(min);
    slider.max   = String(max);
    slider.step  = String(step);
    slider.value = String(clamped);

    const num = document.createElement('input');
    num.type = 'number';
    num.className = 'le-num';
    num.min   = String(min);
    num.max   = String(max);
    num.step  = String(step);
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

  // ── Position row (X and Y on one line) ──────────────────────────────────────

  private _posRow(xVal: number, yVal: number, maxX: number, maxY: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'le-row';

    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = '位置';

    const xLbl = document.createElement('label');
    xLbl.className = 'le-label-sm';
    xLbl.textContent = 'X';

    const xNum = document.createElement('input');
    xNum.type = 'number';
    xNum.className = 'le-num le-num--wide';
    xNum.dataset.key = 'x';
    xNum.min = '0';
    xNum.max = String(maxX);
    xNum.step = '1';
    xNum.value = String(Math.round(xVal));

    // hidden range slider so _collectOverride can still read it via input[type="range"][data-key="x"]
    const xSlider = document.createElement('input');
    xSlider.type = 'range';
    xSlider.className = 'le-slider';
    xSlider.dataset.key = 'x';
    xSlider.min = '0';
    xSlider.max = String(maxX);
    xSlider.step = '1';
    xSlider.value = String(Math.round(xVal));
    xSlider.style.display = 'none';

    const yLbl = document.createElement('label');
    yLbl.className = 'le-label-sm';
    yLbl.style.marginLeft = '6px';
    yLbl.textContent = 'Y';

    const yNum = document.createElement('input');
    yNum.type = 'number';
    yNum.className = 'le-num le-num--wide';
    yNum.dataset.key = 'y';
    yNum.min = '0';
    yNum.max = String(maxY);
    yNum.step = '1';
    yNum.value = String(Math.round(yVal));

    const ySlider = document.createElement('input');
    ySlider.type = 'range';
    ySlider.className = 'le-slider';
    ySlider.dataset.key = 'y';
    ySlider.min = '0';
    ySlider.max = String(maxY);
    ySlider.step = '1';
    ySlider.value = String(Math.round(yVal));
    ySlider.style.display = 'none';

    // keep hidden sliders in sync so _collectOverride reads correct values
    xNum.addEventListener('input', () => { xSlider.value = xNum.value; });
    yNum.addEventListener('input', () => { ySlider.value = yNum.value; });

    row.append(lbl, xLbl, xNum, xSlider, yLbl, yNum, ySlider);
    return row;
  }

  // ── Collect override from panel DOM ─────────────────────────────────────────

  private _collectOverride(panel: HTMLElement): LineOverride {
    const sliderVal = (key: string): number => {
      const el = panel.querySelector<HTMLInputElement>(`input[type="range"][data-key="${key}"]`);
      return parseFloat(el?.value ?? '0');
    };
    const selectVal = (key: string): string => {
      const el = panel.querySelector<HTMLSelectElement>(`select[data-key="${key}"]`);
      return el?.value ?? '';
    };
    const activeAlign = (): 'left' | 'center' | 'right' => {
      const btn = panel.querySelector<HTMLButtonElement>('.le-align-btn.active');
      return (btn?.dataset.val ?? 'center') as 'left' | 'center' | 'right';
    };
    const collectEffectParams = (category: string): Record<string, number> => {
      const result: Record<string, number> = {};
      const prefix = `${category}-`;
      panel.querySelectorAll<HTMLInputElement>(`input[type="range"][data-key^="${prefix}"]`).forEach(el => {
        const key = (el.dataset.key ?? '').slice(prefix.length);
        if (key) result[key] = parseFloat(el.value) || 0;
      });
      return result;
    };

    const textEl = panel.querySelector<HTMLInputElement>('input[data-key="lyric-text"]');
    const fontFamily = selectVal('fontFamily') || undefined;

    const fillColorEl   = panel.querySelector<HTMLInputElement>('input[type="color"][data-key="fillColor"]');
    const strokeColorEl = panel.querySelector<HTMLInputElement>('input[type="color"][data-key="strokeColor"]');
    const strokeWidthEl = panel.querySelector<HTMLInputElement>('input[type="range"][data-key="strokeWidth"]');

    const entrance = selectVal('entrance') as EntranceName;
    const idle     = selectVal('idle')     as IdleName;
    const exit     = selectVal('exit')     as ExitName;

    return {
      text: textEl?.value,
      layout: {
        x:                  sliderVal('x'),
        y:                  sliderVal('y'),
        fontSize:           sliderVal('fontSize'),
        align:              activeAlign(),
        letterSpacingExtra: sliderVal('letterSpacingExtra'),
        rotation:           sliderVal('rotation'),
        fontFamily,
      },
      effects: {
        entrance,
        entranceParams: collectEffectParams('entrance'),
        idle,
        idleParams:     collectEffectParams('idle'),
        exit,
        exitParams:     collectEffectParams('exit'),
      },
      fillColor:   fillColorEl?.value,
      strokeColor: strokeColorEl?.value,
      strokeWidth: strokeWidthEl ? parseFloat(strokeWidthEl.value) : undefined,
      pixelFx:     this._collectPixelFx(panel),
      decoration:  this._collectDecoration(panel),
    };
  }

  private _collectPixelFx(panel: HTMLElement): PixelFxEntry[] {
    const entries: PixelFxEntry[] = [];
    panel.querySelectorAll<HTMLElement>('[data-pixel-fx]').forEach(rowEl => {
      const name = rowEl.dataset.pixelFx as PixelFxName;
      const cb = rowEl.querySelector<HTMLInputElement>('input[type="checkbox"]');
      const enabled = cb?.checked ?? false;

      const params: Record<string, number | string> = {};
      // Numeric params are in the sibling paramsDiv (next element after row)
      const paramsDiv = rowEl.nextElementSibling as HTMLElement | null;
      if (paramsDiv?.classList.contains('le-pfx-params')) {
        paramsDiv.querySelectorAll<HTMLInputElement>('input[type="range"][data-fx-param]').forEach(el => {
          params[el.dataset.fxParam!] = parseFloat(el.value);
        });
        paramsDiv.querySelectorAll<HTMLInputElement>('input[type="color"][data-fx-param]').forEach(el => {
          params[el.dataset.fxParam!] = el.value;
        });
      }

      entries.push({ name, params, enabled });
    });
    return entries;
  }

  // ── Pixel effects section ────────────────────────────────────────────────────

  private _buildPixelFxSection(savedFx: PixelFxEntry[]): HTMLElement {
    const sec = document.createElement('div');
    sec.className = 'le-section';
    const title = document.createElement('div');
    title.className = 'le-section-title';
    title.textContent = '像素特效';
    sec.appendChild(title);

    const savedMap = new Map(savedFx.map(e => [e.name, e]));

    for (const fxName of PIXEL_FX_ORDER) {
      const saved = savedMap.get(fxName);
      const enabled = saved?.enabled ?? false;

      // Header row: checkbox + label
      const row = document.createElement('div');
      row.className = 'le-row le-pfx-row';
      row.dataset.pixelFx = fxName;

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'le-pfx-cb';
      cb.checked = enabled;

      const lbl = document.createElement('label');
      lbl.className = 'le-pfx-label';
      lbl.textContent = PIXEL_FX_LABELS[fxName as PixelFxName];

      row.append(cb, lbl);
      sec.appendChild(row);

      // Params area (shown when checked)
      const paramsDiv = document.createElement('div');
      paramsDiv.className = 'le-pfx-params';
      paramsDiv.hidden = !enabled;

      const numDefs = PIXEL_FX_PARAMS[fxName as PixelFxName] ?? [];
      for (const def of numDefs) {
        const val = typeof saved?.params[def.key] === 'number'
          ? saved!.params[def.key] as number
          : def.default;
        const paramRow = this._sliderRow(def.label, `pfx-${fxName}-${def.key}`, val, def.min, def.max, def.step, def.unit);
        // tag sliders so _collectPixelFx can find them
        paramRow.querySelectorAll('input[type="range"]').forEach(el => {
          (el as HTMLInputElement).dataset.fxParam = def.key;
        });
        paramsDiv.appendChild(paramRow);
      }

      const colorDefs = PIXEL_FX_COLOR_PARAMS[fxName as PixelFxName] ?? [];
      for (const cd of colorDefs) {
        const val = (saved?.params[cd.key] as string) ?? cd.default;
        paramsDiv.appendChild(this._colorRow(cd.label, `pfx-${fxName}-${cd.key}`, val, cd.key));
      }

      sec.appendChild(paramsDiv);

      // Toggle visibility on checkbox change (auto-apply fires separately via bubbling)
      cb.addEventListener('change', () => { paramsDiv.hidden = !cb.checked; });
    }

    return sec;
  }

  // ── Mixed-value variants for multi-select ────────────────────────────────────

  private _fontRowMixed(currentFamily: string | null, mixed: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'le-row';
    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = '字体';
    const sel = document.createElement('select');
    sel.className = 'le-select';
    sel.dataset.key = 'fontFamily';
    if (mixed) {
      const ph = document.createElement('option');
      ph.value = ''; ph.textContent = '— 多个值 —'; ph.disabled = true; ph.selected = true;
      sel.appendChild(ph);
      sel.dataset.mixed = 'true';
    }
    FONTS.forEach(font => {
      const opt = document.createElement('option');
      opt.value = font.family;
      opt.textContent = font.name;
      opt.style.fontFamily = font.family;
      if (!mixed && font.family === currentFamily) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener('change', () => sel.removeAttribute('data-mixed'));
    row.append(lbl, sel);
    return row;
  }

  private _alignRowMixed(current: 'left' | 'center' | 'right' | null, mixed: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'le-row';
    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = '对齐';
    const group = document.createElement('div');
    group.className = 'le-align-group';
    group.dataset.key = 'align';
    if (mixed) group.dataset.mixed = 'true';
    const opts: Array<['left' | 'center' | 'right', string]> = [
      ['left', '左'], ['center', '中'], ['right', '右'],
    ];
    opts.forEach(([val, txt]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'le-align-btn' + (!mixed && val === current ? ' active' : '');
      btn.dataset.val = val;
      btn.textContent = txt;
      btn.addEventListener('click', () => {
        group.removeAttribute('data-mixed');
        group.querySelectorAll('.le-align-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      group.appendChild(btn);
    });
    row.append(lbl, group);
    return row;
  }

  private _sliderRowMixed(
    label: string, key: string, value: number | null,
    min: number, max: number, step: number, unit: string, mixed: boolean,
  ): HTMLElement {
    const midVal = Math.round((min + max) / 2 / step) * step;
    const displayVal = value !== null ? value : midVal;
    const clamped = Math.max(min, Math.min(max, displayVal));

    const row = document.createElement('div');
    row.className = 'le-row';
    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = label;

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'le-slider' + (mixed ? ' le-slider--mixed' : '');
    slider.dataset.key = key;
    slider.min = String(min); slider.max = String(max); slider.step = String(step);
    slider.value = String(clamped);
    if (mixed) slider.dataset.mixed = 'true';

    const num = document.createElement('input');
    num.type = 'number';
    num.className = 'le-num';
    num.min = String(min); num.max = String(max); num.step = String(step);
    if (mixed) {
      num.value = '';
      num.placeholder = '—';
      num.dataset.mixed = 'true';
    } else {
      num.value = String(clamped);
    }

    const unitEl = document.createElement('span');
    unitEl.className = 'le-unit';
    unitEl.textContent = unit;

    slider.addEventListener('input', () => {
      num.value = slider.value;
      slider.removeAttribute('data-mixed');
      num.removeAttribute('data-mixed');
      num.placeholder = '';
    });
    num.addEventListener('input', () => {
      const v = Math.max(min, Math.min(max, parseFloat(num.value) || 0));
      slider.value = String(v);
      slider.removeAttribute('data-mixed');
      num.removeAttribute('data-mixed');
    });

    row.append(lbl, slider, num, unitEl);
    return row;
  }

  private _posRowMixed(
    xVal: number | null, yVal: number | null,
    maxX: number, maxY: number,
    xMixed: boolean, yMixed: boolean,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'le-row';
    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = '位置';

    const makeNumAndSlider = (
      key: string, val: number | null, max: number, mixed: boolean,
    ) => {
      const num = document.createElement('input');
      num.type = 'number';
      num.className = 'le-num le-num--wide';
      num.dataset.key = key;
      num.min = '0'; num.max = String(max); num.step = '1';
      if (mixed) { num.value = ''; num.placeholder = '—'; num.dataset.mixed = 'true'; }
      else num.value = String(Math.round(val!));

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'le-slider';
      slider.dataset.key = key;
      slider.min = '0'; slider.max = String(max); slider.step = '1';
      slider.value = String(val !== null ? Math.round(val) : Math.round(max / 2));
      slider.style.display = 'none';
      if (mixed) slider.dataset.mixed = 'true';

      num.addEventListener('input', () => {
        slider.value = num.value;
        num.removeAttribute('data-mixed');
        slider.removeAttribute('data-mixed');
      });
      return { num, slider };
    };

    const xLbl = document.createElement('label');
    xLbl.className = 'le-label-sm';
    xLbl.textContent = 'X';
    const { num: xNum, slider: xSlider } = makeNumAndSlider('x', xVal, maxX, xMixed);

    const yLbl = document.createElement('label');
    yLbl.className = 'le-label-sm';
    yLbl.style.marginLeft = '6px';
    yLbl.textContent = 'Y';
    const { num: yNum, slider: ySlider } = makeNumAndSlider('y', yVal, maxY, yMixed);

    row.append(lbl, xLbl, xNum, xSlider, yLbl, yNum, ySlider);
    return row;
  }

  private _fillStrokeColorRowMixed(
    fillVal: string | null, fillMixed: boolean,
    strokeVal: string | null, strokeMixed: boolean,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'le-row';

    const fillLbl = document.createElement('label');
    fillLbl.className = 'le-label';
    fillLbl.textContent = '字色';
    const fillWrap = document.createElement('div');
    fillWrap.className = 'le-color-wrap' + (fillMixed ? ' le-color-wrap--mixed' : '');
    const fillInput = document.createElement('input');
    fillInput.type = 'color';
    fillInput.className = 'le-color';
    fillInput.dataset.key = 'fillColor';
    fillInput.value = fillVal ?? '#ffffff';
    if (fillMixed) fillInput.dataset.mixed = 'true';
    fillInput.addEventListener('input', () => {
      fillInput.removeAttribute('data-mixed');
      fillWrap.classList.remove('le-color-wrap--mixed');
    });
    fillWrap.appendChild(fillInput);

    const strokeLbl = document.createElement('label');
    strokeLbl.className = 'le-label';
    strokeLbl.textContent = '描边色';
    const strokeWrap = document.createElement('div');
    strokeWrap.className = 'le-color-wrap' + (strokeMixed ? ' le-color-wrap--mixed' : '');
    const strokeInput = document.createElement('input');
    strokeInput.type = 'color';
    strokeInput.className = 'le-color';
    strokeInput.dataset.key = 'strokeColor';
    strokeInput.value = strokeVal ?? '#ffffff';
    if (strokeMixed) strokeInput.dataset.mixed = 'true';
    strokeInput.addEventListener('input', () => {
      strokeInput.removeAttribute('data-mixed');
      strokeWrap.classList.remove('le-color-wrap--mixed');
    });
    strokeWrap.appendChild(strokeInput);

    row.append(fillLbl, fillWrap, strokeLbl, strokeWrap);
    return row;
  }

  private _colorRowMixed(label: string, key: string, value: string | null, mixed: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'le-row';
    const lbl = document.createElement('label');
    lbl.className = 'le-label';
    lbl.textContent = label;
    const wrap = document.createElement('div');
    wrap.className = 'le-color-wrap' + (mixed ? ' le-color-wrap--mixed' : '');
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'le-color';
    colorInput.dataset.key = key;
    colorInput.value = value ?? '#ffffff';
    if (mixed) colorInput.dataset.mixed = 'true';
    colorInput.addEventListener('input', () => {
      colorInput.removeAttribute('data-mixed');
      wrap.classList.remove('le-color-wrap--mixed');
    });
    wrap.appendChild(colorInput);
    row.append(lbl, wrap);
    return row;
  }

  // ── Section wrapper ──────────────────────────────────────────────────────────

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

  // ── Decoration section ────────────────────────────────────────────────────────

  private _buildDecorationSection(saved?: CharDecoration): HTMLElement {
    const enabled     = saved?.enabled     ?? false;
    const shape       = saved?.shape       ?? 'rect';
    const size        = saved?.size        ?? 30;
    const color       = saved?.color       ?? '#ffffff';
    const randomSize  = saved?.randomSize  ?? false;
    const randomRange = saved?.randomRange ?? 0.3;

    const sec = document.createElement('div');
    sec.className = 'le-section';

    const title = document.createElement('div');
    title.className = 'le-section-title';
    title.textContent = '字符装饰';
    sec.appendChild(title);

    // Enable toggle row
    const toggleRow = document.createElement('div');
    toggleRow.className = 'le-row le-deco-toggle-row';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'le-pfx-cb';
    cb.dataset.key = 'deco-enabled';
    cb.checked = enabled;
    const lbl = document.createElement('label');
    lbl.className = 'le-pfx-label';
    lbl.textContent = '启用背景形状';
    toggleRow.append(cb, lbl);
    sec.appendChild(toggleRow);

    // Params area
    const paramsDiv = document.createElement('div');
    paramsDiv.className = 'le-pfx-params le-deco-params';
    paramsDiv.hidden = !enabled;

    // Shape selector
    const shapeRow = document.createElement('div');
    shapeRow.className = 'le-row';
    const shapeLbl = document.createElement('label');
    shapeLbl.className = 'le-label';
    shapeLbl.textContent = '形状';
    const shapeSel = document.createElement('select');
    shapeSel.className = 'le-select';
    shapeSel.dataset.key = 'deco-shape';
    const shapeOptions: Array<['rect' | 'circle' | 'diamond', string]> = [
      ['rect',    '方形'],
      ['circle',  '圆形'],
      ['diamond', '菱形'],
    ];
    shapeOptions.forEach(([v, label]) => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = label;
      if (v === shape) opt.selected = true;
      shapeSel.appendChild(opt);
    });
    shapeRow.append(shapeLbl, shapeSel);
    paramsDiv.appendChild(shapeRow);

    // Size slider — label depends on shape
    const sizeLabelText = (s: string) => s === 'circle' ? '半径' : '半边长';
    const sizeRow = this._sliderRow(sizeLabelText(shape), 'deco-size', size, 4, 200, 1, 'px');
    paramsDiv.appendChild(sizeRow);

    // Update size label when shape changes
    shapeSel.addEventListener('change', () => {
      const l = sizeRow.querySelector<HTMLElement>('.le-label');
      if (l) l.textContent = sizeLabelText(shapeSel.value);
    });

    // Random size toggle + range slider on the same row
    const randToggleRow = document.createElement('div');
    randToggleRow.className = 'le-row';
    const randCb = document.createElement('input');
    randCb.type = 'checkbox';
    randCb.className = 'le-pfx-cb';
    randCb.dataset.key = 'deco-random-size';
    randCb.checked = randomSize;
    const randLbl = document.createElement('label');
    randLbl.className = 'le-pfx-label';
    randLbl.textContent = '随机大小';

    // Inline range slider (hidden until checkbox is checked)
    const randSlider = document.createElement('input');
    randSlider.type = 'range';
    randSlider.className = 'le-slider';
    randSlider.dataset.key = 'deco-random-range';
    randSlider.min = '0'; randSlider.max = '1'; randSlider.step = '0.05';
    randSlider.value = String(randomRange);
    randSlider.hidden = !randomSize;

    const randNum = document.createElement('input');
    randNum.type = 'number';
    randNum.className = 'le-num';
    randNum.min = '0'; randNum.max = '1'; randNum.step = '0.05';
    randNum.value = String(randomRange);
    randNum.hidden = !randomSize;

    randSlider.addEventListener('input', () => { randNum.value = randSlider.value; });
    randNum.addEventListener('input', () => {
      const v = Math.max(0, Math.min(1, parseFloat(randNum.value) || 0));
      randSlider.value = String(v);
    });

    randCb.addEventListener('change', () => {
      randSlider.hidden = !randCb.checked;
      randNum.hidden    = !randCb.checked;
    });

    randToggleRow.append(randCb, randLbl, randSlider, randNum);
    paramsDiv.appendChild(randToggleRow);

    // Color picker
    paramsDiv.appendChild(this._colorRow('颜色', 'deco-color', color));

    sec.appendChild(paramsDiv);
    cb.addEventListener('change', () => { paramsDiv.hidden = !cb.checked; });

    return sec;
  }

  private _collectDecoration(panel: HTMLElement): CharDecoration | undefined {
    const cb = panel.querySelector<HTMLInputElement>('input[data-key="deco-enabled"]');
    if (!cb) return undefined;

    const shapeSel   = panel.querySelector<HTMLSelectElement>('select[data-key="deco-shape"]');
    const sizeEl     = panel.querySelector<HTMLInputElement>('input[type="range"][data-key="deco-size"]');
    const colorEl    = panel.querySelector<HTMLInputElement>('input[type="color"][data-key="deco-color"]');
    const randCbEl   = panel.querySelector<HTMLInputElement>('input[data-key="deco-random-size"]');
    const randRangeEl = panel.querySelector<HTMLInputElement>('input[type="range"][data-key="deco-random-range"]');

    return {
      enabled:     cb.checked,
      shape:       (shapeSel?.value ?? 'rect') as 'rect' | 'circle' | 'diamond',
      size:        parseFloat(sizeEl?.value ?? '30'),
      color:       colorEl?.value ?? '#ffffff',
      randomSize:  randCbEl?.checked ?? false,
      randomRange: parseFloat(randRangeEl?.value ?? '0.3'),
    };
  }
}
