# Canvas 拖拽定位功能方案

## 一、功能目标

在预览画布上直接点击并拖动文本行，拖动结果实时回传至右侧逐行编辑面板的位置控件，同时在行列表中高亮当前选中行。

---

## 二、技术可行性结论

**完全可行。**

Canvas 上不存在 DOM 文字节点，浏览器无法原生选中 canvas 内的文字。本方案通过**包围盒命中检测（Bounding Box Hit Test）**模拟选中行为，这是 Figma、PixiJS 等所有 canvas 交互应用的标准做法。

命中逻辑本质：

```
鼠标按下
  → 将鼠标 CSS 像素坐标换算为 canvas 实际像素坐标
  → 遍历当前可见行（alpha > 0），检查坐标是否落在该行矩形区域内
  → 命中 → 该行被"选中"，进入拖拽模式
```

---

## 三、核心技术路径

### 3.1 坐标映射

Canvas 元素在页面上以缩放方式显示（`max-width / max-height: 100%`），鼠标坐标需从 CSS 像素转换为 canvas 实际像素：

```typescript
const rect = canvas.getBoundingClientRect();
const scaleX = canvas.width  / canvas.clientWidth;
const scaleY = canvas.height / canvas.clientHeight;

const canvasX = (event.clientX - rect.left) * scaleX;
const canvasY = (event.clientY - rect.top)  * scaleY;
```

### 3.2 命中检测

每行的命中区域由 `LineState.layout` 中已有的数据推算：

```
命中矩形：
  left   = layout.x - textTotalWidth / 2
  right  = layout.x + textTotalWidth / 2
  top    = layout.y - fontSize * 0.8   （近似上边距）
  bottom = layout.y + fontSize * 0.3   （近似下边距）
```

**旋转行处理**：将鼠标坐标相对行锚点做反向旋转后，再做矩形检测：

```typescript
const dx = canvasX - layout.x;
const dy = canvasY - layout.y;
const angle = -layout.rotation * Math.PI / 180;
const localX = dx * Math.cos(angle) - dy * Math.sin(angle);
const localY = dx * Math.sin(angle) + dy * Math.cos(angle);
// 再对 localX / localY 做矩形包含检测
```

**多行重叠**：优先命中索引最大（渲染层级最高）的行。

### 3.3 拖拽流程（三阶段）

```
pointerdown
  ├─ 命中检测，找到目标行索引
  ├─ 记录命中点相对行锚点的偏移量（grabOffsetX / grabOffsetY）
  ├─ 暂停 GSAP masterTl（防止动画覆写坐标）
  └─ 进入拖拽状态

pointermove（拖拽中）
  ├─ 计算新的行锚点坐标
  ├─ 直接修改 LineState.layout.x / layout.y
  ├─ 同步修改所有 CharState.baseX / baseY（字符基准位置）
  └─ 手动调用 renderFrame() 刷新画面     ← 不重建时间轴，60fps 流畅

pointerup（松手）
  ├─ 调用 scene.setOverride(index, { layout: { x, y } })  ← 写入 override 并重建时间轴
  ├─ 恢复 GSAP 到拖拽前的时间点
  └─ 通知 LineEditorUI 刷新 X/Y 滑块显示
```

> **关键设计**：拖动过程中绕过 `setOverride()`（重建时间轴开销大），直接操作 `LineState` 对象并调 `renderFrame()`；仅在松手时做一次性提交。

### 3.4 右侧面板双向联动

| 事件 | 行为 |
|------|------|
| 点击 / 开始拖拽 | `lineEditor.setSelected(index)` → 对应 `.le-item` 加高亮样式 + `scrollIntoView()` |
| 拖拽松手后 | `scene.setOverride()` → `lineEditor.refresh()` → X/Y 滑块自动更新为新坐标 |
| 在右侧列表点击某行 | 可选：画布上对应行也加选中高亮框 |

---

## 四、需要解决的难点

| 难点 | 方案 |
|------|------|
| **有旋转的行命中不准** | 对鼠标坐标做行级反向旋转变换后再判断矩形包含 |
| **入场/退场动画阶段字符偏离基准** | 命中盒基于 `layout.x / layout.y`（基准位置），视觉偏差在入场阶段存在但可接受；仅在暂停/定格帧时支持拖拽体验最佳 |
| **拖拽时 GSAP 干扰坐标** | 拖拽开始时 `masterTl.pause()`，松手后 `seek(prevTime)` 恢复 |
| **canvas 元素不接收高优先级指针事件** | 在 canvas 上叠加透明 `<div id="canvas-overlay">` 专门接收 `pointer*` 事件，与 canvas 本身解耦 |
| **多行重叠时误选** | 按索引从大到小遍历（最上层优先），找到第一个命中行即停止 |

---

## 五、需要新增 / 改造的模块

### 5.1 `SceneController` 新增方法

```typescript
// 返回当前可见行的索引和布局（供命中检测使用）
getVisibleLineLayouts(): Array<{ index: number; layout: LineLayout }>;

// 拖拽中直接更新行位置（不重建时间轴）
updateLinePositionLive(index: number, x: number, y: number): void;

// 同上述 setOverride，但用于拖拽提交（已有方法，可复用）
setOverride(index: number, override: LineOverride): void;
```

### 5.2 `LineEditorUI` 新增方法

```typescript
// 高亮选中行并滚动到可见区域
setSelected(index: number | null): void;
```

### 5.3 新增 `src/ui/canvasDrag.ts`

负责：
- 监听 `#canvas-overlay` 的 `pointerdown / pointermove / pointerup`
- 坐标映射
- 命中检测
- 拖拽状态管理
- 调用 `SceneController` 和 `LineEditorUI` 的接口

---

## 六、实现分阶段计划

### Phase 1：坐标映射 + 命中检测
- [ ] 在 canvas 上叠加透明 `#canvas-overlay`
- [ ] 实现 CSS → canvas 像素坐标转换
- [ ] 实现包围盒命中检测（含旋转反变换）
- [ ] `pointerdown` 时在控制台打印命中的行索引（验证阶段）

### Phase 2：拖拽移动 + 实时预览
- [ ] `SceneController.updateLinePositionLive()` 方法
- [ ] `pointermove` 中直接修改 `LineState` 并调 `renderFrame()`
- [ ] 拖拽时暂停 / 松手时恢复 GSAP

### Phase 3：提交 + 面板联动
- [ ] `pointerup` 时调 `setOverride()` 持久化位置
- [ ] `LineEditorUI.setSelected()` 高亮 + 滚动
- [ ] 右侧 X/Y 滑块自动同步新坐标

### Phase 4（可选）：拖拽视觉增强
- [ ] 拖拽时在选中行周围画虚线选中框
- [ ] 显示坐标 tooltip（实时显示 X / Y 数值）
- [ ] 光标在可命中行上方时变为 `move` 样式
