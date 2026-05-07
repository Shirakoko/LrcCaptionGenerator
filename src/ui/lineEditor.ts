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
  private selectedIndex = -1;
  private onSeek: ((timeSec: number) => void) | undefined;
  private onLineSelectCb: ((index: number | null) => void) | undefined;

  onLineSelect(cb: (index: number | null) => void): void {
    this.onLineSelectCb = cb;
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
    propsPanel.addEventListener('input', () => this._autoApply());
    propsPanel.addEventListener('change', () => this._autoApply());
    propsPanel.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.le-align-btn')) {
        this._autoApply();
      }
    });

    this._render();
  }

  refresh(): void {
    this._render();
    if (this.selectedIndex >= 0) {
      const params = this.scene.getLineParams(this.selectedIndex);
      if (params) this._populateProps(this.selectedIndex, params);
    }
  }

  update(scene: SceneController, canvasWidth: number, canvasHeight: number): void {
    this.scene        = scene;
    this.canvasWidth  = canvasWidth;
    this.canvasHeight = canvasHeight;
    this.selectedIndex = -1;
    this.propsPanel.hidden = true;
    this._render();
  }

  setSelected(index: number | null): void {
    const newIdx = index ?? -1;
    this.selectedIndex = newIdx;
    this._render();
    if (this.selectedIndex >= 0) {
      const item = this.container.children[this.selectedIndex] as HTMLElement;
      item?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const params = this.scene.getLineParams(this.selectedIndex);
      if (params) this._populateProps(this.selectedIndex, params);
    } else {
      this.propsPanel.hidden = true;
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
    const isSelected = this.selectedIndex === index;

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
    header.addEventListener('click', () => {
      const wasSelected = this.selectedIndex === index;
      this.selectedIndex = wasSelected ? -1 : index;
      const timeSec = timeMs / 1000;
      this.scene.seek(timeSec);
      this.onSeek?.(timeSec);
      this.onLineSelectCb?.(this.selectedIndex >= 0 ? this.selectedIndex : null);
      this._render();
      if (this.selectedIndex >= 0) {
        const params = this.scene.getLineParams(this.selectedIndex);
        if (params) this._populateProps(this.selectedIndex, params);
      } else {
        this.propsPanel.hidden = true;
      }
    });

    item.appendChild(header);
    return item;
  }

  private _autoApply(): void {
    if (this.selectedIndex < 0) return;
    this.scene.setOverride(this.selectedIndex, this._collectOverride(this.propsPanel));
    this._updateListItemState(this.selectedIndex);
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
      this._sliderRow('位置 X',  'x',                 layout.x,             0, this.canvasWidth,  1,   'px'),
      this._sliderRow('位置 Y',  'y',                 layout.y,             0, this.canvasHeight, 1,   'px'),
      this._sliderRow('字号',    'fontSize',           layout.fontSize,      24, 200,              1,   'px'),
      this._sliderRow('字间距',  'letterSpacingExtra', layout.letterSpacing, -4, 16,               0.5, 'px'),
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

  // ── Effect group: dropdown + dynamic param sliders ──────────────────────────

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
