# 整体画面处理轨道（Screen FX Track）实现文档

## 一、功能概述

在现有媒体轨道、音频轨道、字幕轨道之外，新增一条 **Screen FX 轨道**。用户可以在时间轴上放置若干"处理块"（FxClip），每个处理块覆盖一段时间范围，并携带一组叠加效果。渲染时，当前时刻落在某个处理块内，该块的所有效果按顺序叠加应用到画面上。

**第一期支持的效果：**

| 效果 | 类型 | 作用层 |
|------|------|--------|
| `color_grade` | 亮度 / 对比度 / 饱和度调节 | 背景图像（CSS filter） |
| `particles` | 粒子飘舞 | Canvas 叠加层 |
| `shake` | 屏幕震动 | Canvas transform |

---

## 二、数据模型

### 2.1 新增类型（`src/ui/timeline.ts`）

```ts
// 单个效果的参数包
export interface FxEntry {
  type: string;                    // 效果 key，对应 FX_DEFS 注册表
  params: Record<string, number>;  // 效果参数，key 与 FX_DEFS 中的 ParamDef.key 对应
}

// 时间轴上的一个处理块
export interface FxClip {
  id: string;
  startTime: number;   // 秒
  duration: number;    // 秒
  effects: FxEntry[];  // 叠加效果列表，按顺序应用
}
```

`Timeline` 类新增：

```ts
fxClips: FxClip[] = [];

// 查询接口：返回当前时刻激活的所有处理块（可能同时有多个）
getFxAtTime(t: number): FxClip[] {
  return this.fxClips.filter(c => t >= c.startTime && t < c.startTime + c.duration);
}
```

### 2.2 效果注册表（`src/ui/timeline.ts`，与 `TRANSITION_DEFS` 同文件）

```ts
export interface FxParamDef {
  key: string;
  label: string;   // 中文
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
}

export interface FxDef {
  label: string;          // 中文名
  params: FxParamDef[];
}

export const FX_DEFS: Record<string, FxDef> = {
  color_grade: {
    label: '色彩调节',
    params: [
      { key: 'brightness', label: '亮度', min: 0,   max: 200, step: 1,   default: 100, unit: '%' },
      { key: 'contrast',   label: '对比度', min: 0, max: 200, step: 1,   default: 100, unit: '%' },
      { key: 'saturate',   label: '饱和度', min: 0, max: 200, step: 1,   default: 100, unit: '%' },
    ],
  },
  particles: {
    label: '粒子飘舞',
    params: [
      { key: 'count',   label: '数量',   min: 10,  max: 500, step: 10,  default: 80  },
      { key: 'size',    label: '粒子大小', min: 1,  max: 20,  step: 0.5, default: 4,  unit: 'px' },
      { key: 'speed',   label: '速度',   min: 10,  max: 300, step: 10,  default: 60, unit: 'px/s' },
      { key: 'opacity', label: '不透明度', min: 0.1, max: 1, step: 0.05, default: 0.6 },
    ],
  },
  shake: {
    label: '屏幕震动',
    params: [
      { key: 'amplitude', label: '幅度', min: 1,   max: 60,  step: 1,   default: 10, unit: 'px' },
      { key: 'frequency', label: '频率', min: 1,   max: 30,  step: 1,   default: 8,  unit: 'Hz' },
    ],
  },
};
```

### 2.3 RenderConfig 扩展（`src/renderer/canvasRenderer.ts`）

```ts
export interface RenderConfig {
  // ... 现有字段 ...

  // Screen FX（可选，由 SceneController._activeCfg() 注入）
  fxColorGrade?: { brightness: number; contrast: number; saturate: number };
  fxShake?: { offsetX: number; offsetY: number };  // 已计算好的像素偏移
  // 粒子系统状态由 ParticleSystem 自身维护，不经过 RenderConfig
}
```

---

## 三、渲染架构

### 3.1 效果分类与渲染时机

| 效果 | 渲染方式 | 渲染时机 |
|------|---------|---------|
| `color_grade` | 修改 `bgBrightness/bgContrast/bgSaturate`（与媒体素材的调节**叠加**，相乘归一化） | `_activeCfg()` 中注入 |
| `shake` | 在 `renderFrame()` 开头对 `ctx` 做 `translate(offsetX, offsetY)` | `renderFrame()` 开头 |
| `particles` | 独立的 `ParticleSystem` 类，在 `renderFrame()` 最后（字幕之后）绘制 | `renderFrame()` 结尾 |

### 3.2 `color_grade` 叠加规则

媒体素材本身有 `brightness/contrast/saturate`（用户在媒体轨道上设置），Screen FX 的 `color_grade` 在此基础上叠加：

```ts
// 在 _activeCfg() 中，应用 color_grade 后：
const grade = fxColorGrade ?? { brightness: 100, contrast: 100, saturate: 100 };
finalBrightness = (mediaBrightness / 100) * (grade.brightness / 100) * 100;
finalContrast   = (mediaContrast   / 100) * (grade.contrast   / 100) * 100;
finalSaturate   = (mediaSaturate   / 100) * (grade.saturate   / 100) * 100;
```

### 3.3 粒子系统（`src/renderer/particleSystem.ts`，新文件）

粒子系统是一个独立类，由 `SceneController` 持有，每帧调用 `update(dt)` + `draw(ctx, width, height)`。

```ts
export interface ParticleConfig {
  count: number;
  size: number;
  speed: number;    // px/s，向下飘落
  opacity: number;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private cfg: ParticleConfig | null = null;
  private lastTime = 0;

  // 每帧由 SceneController 调用，传入当前激活的粒子配置（null = 无粒子）
  setConfig(cfg: ParticleConfig | null): void { ... }

  // 更新粒子位置，dt 单位秒
  update(dt: number, width: number, height: number): void { ... }

  // 绘制到 ctx（在字幕层之后调用）
  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void { ... }
}
```

粒子行为：
- 初始化时随机分布在画面内
- 每帧向下移动 `speed * dt` 像素，同时有轻微的左右随机漂移
- 超出底部后从顶部随机位置重新出现
- 粒子形状：圆形，颜色白色，透明度由 `opacity` 控制

### 3.4 `shake` 偏移计算

震动偏移在 `_activeCfg()` 中计算，基于当前时间和参数：

```ts
// 在 _activeCfg() 中：
if (fxShake) {
  const { amplitude, frequency } = fxShake;
  const t = this.currentTime;
  const offsetX = amplitude * Math.sin(2 * Math.PI * frequency * t);
  const offsetY = amplitude * Math.cos(2 * Math.PI * frequency * t * 1.3); // 错频避免轴对称
  cfg.fxShake = { offsetX, offsetY };
}
```

在 `renderFrame()` 中：

```ts
export function renderFrame(...): void {
  ctx.clearRect(0, 0, width, height);

  if (cfg.fxShake) {
    ctx.save();
    ctx.translate(cfg.fxShake.offsetX, cfg.fxShake.offsetY);
  }

  // ... 绘制背景、字幕 ...

  if (cfg.fxShake) {
    ctx.restore();
  }

  // 粒子在 restore 之后绘制，不受 shake 影响（粒子本身不震动）
  particleSystem?.draw(ctx, width, height);
}
```

---

## 四、SceneController 修改

### 4.1 新增 resolver

```ts
export type FxResolver = (timeSec: number) => FxClip[];

// SceneController 新增：
private fxResolver: FxResolver | null = null;
private particleSystem = new ParticleSystem();
private lastRenderTime = performance.now();

setFxResolver(fn: FxResolver | null): void {
  this.fxResolver = fn;
}
```

### 4.2 `_activeCfg()` 修改

在现有逻辑末尾，注入 Screen FX 数据：

```ts
private _activeCfg(timeSec?: number): RenderConfig {
  const t = timeSec ?? this.currentTime;
  let cfg = /* ... 现有逻辑，得到基础 cfg ... */;

  if (!this.fxResolver) return cfg;

  const fxClips = this.fxResolver(t);
  if (fxClips.length === 0) return cfg;

  // 合并所有激活块的效果（同类型效果取最后一个块的值，或按需叠加）
  let colorGrade = { brightness: 100, contrast: 100, saturate: 100 };
  let shakeParams: { amplitude: number; frequency: number } | null = null;
  let particleCfg: ParticleConfig | null = null;

  for (const clip of fxClips) {
    for (const fx of clip.effects) {
      if (fx.type === 'color_grade') {
        colorGrade = {
          brightness: fx.params.brightness ?? 100,
          contrast:   fx.params.contrast   ?? 100,
          saturate:   fx.params.saturate   ?? 100,
        };
      } else if (fx.type === 'shake') {
        shakeParams = {
          amplitude: fx.params.amplitude ?? 10,
          frequency: fx.params.frequency ?? 8,
        };
      } else if (fx.type === 'particles') {
        particleCfg = {
          count:   fx.params.count   ?? 80,
          size:    fx.params.size    ?? 4,
          speed:   fx.params.speed   ?? 60,
          opacity: fx.params.opacity ?? 0.6,
        };
      }
    }
  }

  // 应用 color_grade（与媒体素材调节叠加）
  cfg = {
    ...cfg,
    bgBrightness: (cfg.bgBrightness / 100) * (colorGrade.brightness / 100) * 100,
    bgContrast:   (cfg.bgContrast   / 100) * (colorGrade.contrast   / 100) * 100,
    bgSaturate:   (cfg.bgSaturate   / 100) * (colorGrade.saturate   / 100) * 100,
  };

  // 应用 shake
  if (shakeParams) {
    const { amplitude, frequency } = shakeParams;
    cfg.fxShake = {
      offsetX: amplitude * Math.sin(2 * Math.PI * frequency * t),
      offsetY: amplitude * Math.cos(2 * Math.PI * frequency * t * 1.3),
    };
  }

  // 更新粒子系统配置
  this.particleSystem.setConfig(particleCfg);

  return cfg;
}
```

### 4.3 `_render()` 修改

```ts
private _render = (): void => {
  const now = performance.now();
  const dt = Math.min((now - this.lastRenderTime) / 1000, 0.1); // 最大 0.1s 防跳帧
  this.lastRenderTime = now;

  const cfg = this._activeCfg();
  const { width, height } = cfg;

  // 更新粒子
  this.particleSystem.update(dt, width, height);

  // 渲染帧（renderFrame 内部处理 shake）
  renderFrame(this.ctx, this.activeLines, cfg, this.transparentBg, this.particleSystem);

  if (this.isPlaying) {
    this.rafId = requestAnimationFrame(this._render);
  }
};
```

`renderFrame` 签名扩展：

```ts
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  lines: LineState[],
  cfg: RenderConfig,
  transparentBg = false,
  particleSystem?: ParticleSystem,  // 新增可选参数
): void
```

---

## 五、main.ts 接入

```ts
// 在 scene 初始化后，设置 fxResolver
scene.setFxResolver(t => timeline.getFxAtTime(t));

// onChange 回调无需修改（fxClips 变化时 _notify() 已触发重渲染）
```

---

## 六、Timeline UI

### 6.1 轨道 DOM 结构

Screen FX 轨道插入在媒体轨道和音频轨道之间：

```
.tl-track-row  [标签: "画面特效"]
  .tl-track-label
  .tl-track-content
    .tl-fx-clip  (可拖拽、可调整宽度，与媒体 clip 样式一致)
      .tl-fx-clip__label  (显示效果名称列表，如 "色彩调节 + 粒子")
      .tl-resize-handle--left
      .tl-resize-handle--right
```

### 6.2 FxClip 编辑 Popover

点击 FxClip 弹出编辑面板（与转场 popover 风格一致）：

```
┌─────────────────────────────┐
│ 画面特效                     │
│                             │
│ [+ 添加效果]  ▼ 下拉选择     │
│                             │
│ ▼ 色彩调节              [×] │
│   亮度    [████░░] 120 %    │
│   对比度  [███░░░] 100 %    │
│   饱和度  [██░░░░]  80 %    │
│                             │
│ ▼ 粒子飘舞              [×] │
│   数量    [████░░]  80      │
│   粒子大小 [██░░░░]  4 px   │
│   速度    [███░░░]  60 px/s │
│   不透明度 [████░░] 0.6     │
└─────────────────────────────┘
```

- 每种效果可以添加多次（例如两个 `color_grade` 块叠加，后者覆盖前者）
- 点击 `[×]` 删除该效果
- 效果顺序可拖拽调整（可选，第一期可以不做）

### 6.3 FxClip 的增删操作

- **添加**：双击 Screen FX 轨道空白区域，在点击位置创建一个默认时长 2s 的空 FxClip
- **删除**：选中 FxClip 后按 Delete 键，或在 popover 中点击顶部删除按钮
- **移动 / 调整时长**：与媒体 clip 相同的拖拽逻辑（复用 `_makeDraggable` 和 resize handle 逻辑）

---

## 七、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/ui/timeline.ts` | 修改 | 新增 `FxClip`、`FxEntry`、`FxDef`、`FX_DEFS`；`Timeline` 类新增 `fxClips`、`getFxAtTime()`、`_renderFxTrack()`、FxClip 的增删改逻辑和 popover |
| `src/renderer/canvasRenderer.ts` | 修改 | `RenderConfig` 新增 `fxShake`；`renderFrame()` 新增 shake transform 和粒子绘制调用 |
| `src/renderer/sceneController.ts` | 修改 | 新增 `fxResolver`、`particleSystem`；修改 `_activeCfg()` 和 `_render()` |
| `src/renderer/particleSystem.ts` | 新建 | `ParticleSystem` 类 |
| `src/main.ts` | 修改 | `scene.setFxResolver(...)` 接入 |
| `src/style.css` | 修改 | `.tl-fx-clip` 样式（建议用紫色系区分媒体/音频/字幕轨道） |

---

## 八、实现顺序建议

1. **数据模型**：`FxClip`、`FxEntry`、`FX_DEFS` 类型定义（`timeline.ts`）
2. **粒子系统**：`particleSystem.ts`（独立模块，可单独测试）
3. **渲染层**：`RenderConfig` 扩展 + `renderFrame()` 修改 + `_activeCfg()` 修改
4. **main.ts 接入**：`setFxResolver` 连线
5. **Timeline UI**：轨道渲染 + FxClip 拖拽 + popover 编辑面板

每步完成后运行 `npx tsc --noEmit` 验证类型，最后 `npm run build` 确认整体构建。

---

## 九、后续可扩展的效果

注册表驱动的架构使得新增效果只需：
1. 在 `FX_DEFS` 加一条记录
2. 在 `_activeCfg()` 的合并循环里加一个 `else if` 分支
3. 在 `renderFrame()` 或独立系统里实现渲染逻辑

**候选效果：**
- `vignette`：暗角（Canvas radial gradient 叠加）
- `blur`：全屏模糊（CSS filter 或 offscreen canvas）
- `color_tint`：色调叠加（Canvas fillRect + globalCompositeOperation）
- `zoom_pulse`：缩放脉冲（ctx.scale + 中心 translate）
- `scanlines`：扫描线（Canvas 横线叠加）
