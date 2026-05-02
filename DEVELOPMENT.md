# 开发文档

面向新加入项目的开发者，介绍架构设计、模块职责和关键实现细节。

## 技术栈

| 技术 | 用途 |
|------|------|
| React + TypeScript | UI 框架与类型安全 |
| Vite | 构建工具与开发服务器 |
| GSAP | 动画时间轴编排 |
| Canvas 2D API | 逐帧文字渲染 |
| MediaRecorder API | WebM 视频录制 |
| ffmpeg.wasm | 浏览器内 MOV 转码（懒加载） |

## 项目结构

```
LrcCaptionGenerator/
├── src/
│   ├── main.ts                    # 入口：UI 事件绑定、导出流程
│   ├── style.css                  # 全局样式（暗色主题）
│   ├── parser/
│   │   └── lrcParser.ts           # LRC 文件解析
│   ├── random/
│   │   └── prng.ts                # 可复现的伪随机数生成器
│   ├── effects/
│   │   ├── types.ts               # 效果类型定义与随机选取
│   │   ├── entrance.ts            # 10 种入场动画
│   │   ├── idle.ts                # 3 种待机动画
│   │   └── exit.ts                # 6 种退场动画
│   └── renderer/
│       ├── layout.ts              # 文字排版与字符定位
│       ├── canvasRenderer.ts      # Canvas 2D 渲染
│       └── sceneController.ts     # GSAP 时间轴编排与播放控制
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 本地开发

```bash
npm install
npm run dev      # 启动开发服务器（含 CORS 头，ffmpeg.wasm 需要）
npm run build    # 类型检查 + 生产构建
npm run preview  # 预览生产构建
```

> Vite 配置中设置了 `Cross-Origin-Embedder-Policy: require-corp` 和 `Cross-Origin-Opener-Policy: same-origin`，这是 ffmpeg.wasm 使用 SharedArrayBuffer 的必要条件。如果本地开发时遇到 CORS 报错，检查 `vite.config.ts` 中的 headers 配置。

## 数据流

```
用户输入（LRC 文本 + 配置参数）
    │
    ▼
lrcParser.parseLrc()
    │  返回 LyricLine[]（time, text, duration）
    ▼
SceneController.build()
    │  对每句歌词：
    │  ├─ layout.buildLineState()   → 计算字符位置，生成 LineState
    │  ├─ effects.pickEffects()     → 随机选取入场/待机/退场效果
    │  ├─ buildEntrance()           → 注册 GSAP 入场 tween
    │  ├─ buildIdleTween()          → 注册 GSAP 待机 tween
    │  └─ buildExit()               → 注册 GSAP 退场 tween
    │  合并为主时间轴，绑定 onUpdate 回调
    ▼
用户点击播放 / 导出
    │
    ▼
GSAP 时间轴推进
    │  每帧触发 onUpdate
    ▼
canvasRenderer.renderFrame()
    │  将当前 LineState[] 渲染到 Canvas
    ▼
MediaRecorder 捕获 Canvas 流（导出时）
    │
    ▼
Blob → 下载（WebM）或 ffmpeg 转码（MOV）
```

## 模块详解

### `parser/lrcParser.ts`

解析标准 LRC 格式，返回 `LyricLine[]`：

```typescript
interface LyricLine {
  time: number;     // 开始时间（秒）
  text: string;     // 歌词文本
  duration: number; // 显示时长（秒），由下一行时间戳推算
}
```

- 元数据行（`[ti:]`、`[ar:]` 等）被忽略
- 最短时长 500ms，最后一行默认 3000ms
- `totalDuration(lines)` 返回整个视频的总时长

### `random/prng.ts`

基于 **mulberry32** 算法的可复现伪随机数生成器。相同种子产生完全相同的随机序列，这是动画效果可复现的核心机制。

```typescript
const rng = new SeededRandom(seed);
rng.next()           // [0, 1) 浮点数
rng.range(min, max)  // 指定范围浮点数
rng.int(min, max)    // 指定范围整数（含两端）
rng.pick(arr)        // 随机选取数组元素
rng.bool(prob)       // 以 prob 概率返回 true
```

`seedFromString(s)` 用 FNV-1a 哈希将字符串种子转为数字。

### `effects/types.ts`

定义动画状态的核心数据结构：

```typescript
interface CharState {
  x: number; y: number;       // 当前位置（相对于行基准点）
  alpha: number;               // 透明度 [0, 1]
  scale: number;               // 缩放比例
  rotation: number;            // 旋转角度（度）
  blur: number;                // 模糊半径（px）
}

interface LineState {
  chars: CharState[];          // 每个字符的状态
  baseX: number; baseY: number; // 行基准位置
  alpha: number;               // 行整体透明度
  scale: number;               // 行整体缩放
  // ... 字体、颜色、描边等样式属性
}
```

GSAP 直接修改这些对象的属性，`renderFrame` 读取它们来绘制每一帧。这是整个动画系统的核心约定。

`pickEffects(rng)` 随机返回一组 `{ entrance, idle, exit }` 效果名称。

### `effects/entrance.ts` / `idle.ts` / `exit.ts`

每个效果是一个函数，签名统一：

```typescript
// 入场
function buildEntrance(
  tl: gsap.core.Timeline,
  line: LineState,
  startTime: number,   // 在主时间轴上的开始时间（秒）
  duration: number     // 动画时长
): void

// 待机（循环动画）
function buildIdleTween(
  tl: gsap.core.Timeline,
  line: LineState,
  startTime: number,
  duration: number     // 待机总时长
): void

// 退场
function buildExit(
  tl: gsap.core.Timeline,
  line: LineState,
  startTime: number,
  duration: number
): void
```

**添加新效果的步骤：**
1. 在对应文件中实现函数
2. 在 `effects/types.ts` 的联合类型（`EntranceName` / `IdleName` / `ExitName`）中添加名称
3. 在 `sceneController.ts` 的 `switch` 语句中注册调用

### `renderer/layout.ts`

`buildLineState(text, ctx, cfg, rng, opts)` 负责：

1. 用 Canvas `measureText` 测量文字尺寸
2. 随机决定字体大小（52–96px）、对齐方式、字间距、旋转角度
3. 如果文字超出安全区（画布宽度 × 90% - 1.2 × 字体大小），自动缩小字体
4. 计算每个字符的 `baseX`/`baseY`，填充初始 `CharState`（alpha=0，等待入场动画激活）

### `renderer/canvasRenderer.ts`

`renderFrame(ctx, lines, cfg, transparentBg)` 每帧执行：

1. 清空画布（透明背景模式）或绘制背景色/背景图
2. 对每个 `LineState`，应用行级 `alpha` 和 `scale`
3. 对每个 `CharState`，应用 `translate` + `rotate` + `scale`，设置 `filter: blur()`，绘制文字描边和填充

背景图片的亮度/对比度/饱和度通过 CSS filter 字符串实现，在绘制图片前设置 `ctx.filter`。

### `renderer/sceneController.ts`

核心类 `SceneController` 管理整个播放生命周期：

**时间轴结构（每句歌词）：**
```
歌词开始时间
    │
    ├─ 入场动画（0.6s）
    │
    ├─ 待机动画（歌词时长 - 1.1s，最小为 0）
    │
    └─ 退场动画（0.5s，从下一句开始前 0.5s 启动）
```

**关键方法：**
- `build(lyrics, opts)` — 构建时间轴，内部调用 layout 和 effects 模块
- `play()` / `pause()` — 控制 GSAP 时间轴与 rAF 循环
- `seek(timeSec)` — 跳转到指定时间，同步更新 Canvas
- `exportFramePng()` — 返回当前帧的 DataURL

## 导出流程

### WebM 导出

```
canvas.captureStream(30)          // 获取 30fps Canvas 流
MediaRecorder(stream, {           // VP9 编码，保留 Alpha
  mimeType: 'video/webm;codecs=vp9'
})
→ 逐帧推进时间轴（每帧 1/30s）
→ 收集 Blob chunks
→ 合并为完整 WebM 文件下载
```

### MOV 导出

```
懒加载 ffmpeg.wasm（首次约 30MB）
→ 先完成 WebM 导出流程，得到 WebM Blob
→ ffmpeg -i input.webm -c:v prores_ks -profile:v 4 
         -pix_fmt yuva444p10le output.mov
→ 下载 MOV 文件
```

ProRes 4444（`yuva444p10le`）保留完整 Alpha 通道，与 Final Cut Pro、Premiere Pro 等专业软件兼容性最好。

## 常见开发问题

**ffmpeg.wasm 在开发环境加载失败**
检查 `vite.config.ts` 是否正确设置了 COEP/COOP 响应头，以及 ffmpeg 相关包是否在 `optimizeDeps.exclude` 中。

**动画效果不符合预期**
在 `sceneController.ts` 的 `build()` 方法中打印 `startTime` 和 `duration`，确认时间轴参数正确。GSAP 时间轴可以用 `tl.getById()` 检查具体 tween。

**Canvas 导出帧不透明**
确认 `renderFrame` 调用时 `transparentBg` 参数为 `true`，且 Canvas 在每帧开始时执行了 `ctx.clearRect()`。

**新增效果后随机选取不生效**
检查 `effects/types.ts` 中的联合类型是否已添加新名称，以及 `pickEffects` 函数中的候选数组是否包含新效果。
