# 像素处理特效 功能方案文档

---

## 一、背景与目标

当前特效系统控制的是**文字如何运动**（进场动画、持续动画、退场动画），统称"动画效果"更准确。

新增的"像素处理特效"是另一个维度——控制**文字渲染成什么视觉质感**。二者正交、可叠加，共同描述一条字幕的完整视觉表现。

**设计原则：**
- 像素特效在字幕整个生命周期内持续生效（不受进/出场时间影响）
- 多个像素特效可同时开启并按顺序叠加
- 参数实时预览，与现有动画特效 UI 风格一致

---

## 二、概念重命名

| 旧名称 | 新名称 |
|--------|--------|
| 特效（进场/持续/退场） | 动画效果 |
| —— | 像素特效（新增） |

UI 中"特效"section 标题改为"动画效果"，其下新增"像素特效"section。

---

## 三、像素特效清单

### 3.1 模糊（Blur）
文字整体高斯模糊，可做"虚焦"感。

| 参数 | 范围 | 默认 |
|------|------|------|
| 模糊半径 `radius` | 0 – 20 px | 4 |

### 3.2 色散（Chromatic Aberration）
将 RGB 三通道分别横向错位，产生赛博朋克色散感。

| 参数 | 范围 | 默认 |
|------|------|------|
| 错位强度 `offset` | 0 – 12 px | 4 |

### 3.3 噪点（Grain）
在文字区域叠加随机胶片颗粒，每帧重新生成噪点（动态）。

| 参数 | 范围 | 默认 |
|------|------|------|
| 强度 `intensity` | 0 – 1 | 0.3 |
| 粒度 `size` | 1 – 4 px | 1 |

### 3.4 马赛克（Pixelate）
将文字区域像素化，产生低分辨率方块感。

| 参数 | 范围 | 默认 |
|------|------|------|
| 块大小 `blockSize` | 2 – 24 px | 8 |

### 3.5 发光（Glow）
在文字轮廓外扩散彩色光晕，可做霓虹灯效果。

| 参数 | 范围 | 默认 |
|------|------|------|
| 光晕半径 `radius` | 0 – 30 px | 10 |
| 光晕颜色 `color` | color picker | #7c6af7 |

### 3.6 扫描线（Scanlines）
叠加水平扫描线条纹，模拟 CRT 显示器/监控画面质感。

| 参数 | 范围 | 默认 |
|------|------|------|
| 行间距 `spacing` | 2 – 8 px | 3 |
| 不透明度 `opacity` | 0 – 1 | 0.4 |

---

## 四、技术方案

### 4.1 数据模型扩展

```typescript
// effects/types.ts 新增
export type PixelFxName = 'blur' | 'chromaticAberration' | 'grain' | 'pixelate' | 'glow' | 'scanlines';

export interface PixelFxEntry {
  name: PixelFxName;
  params: Record<string, number | string>;
  enabled: boolean;
}

// LineOverride 新增字段
export interface LineOverride {
  // ...现有字段
  pixelFx?: PixelFxEntry[];
}

// LineState 新增字段
export interface LineState {
  // ...现有字段
  pixelFx: PixelFxEntry[];
}
```

### 4.2 渲染流程变更

**现有流程：**
```
renderFrame → 遍历 LineState → 直接绘制字符到主 canvas
```

**新流程：**
```
renderFrame → 遍历 LineState
  → 有像素特效？
      是 → 绘制字符到 offscreen canvas
           → 按序应用像素特效
           → compositeToMain(offscreen)
      否 → 直接绘制到主 canvas（零开销）
```

offscreen canvas 按需创建，复用同一个实例（resize 到包围盒大小）即可。

### 4.3 各特效实现思路

| 特效 | 核心 API / 算法 |
|------|----------------|
| 模糊 | `ctx.filter = 'blur(Xpx)'`，绘前设置 |
| 色散 | 绘制 3 次文字，分别用 `globalCompositeOperation` 的 R/G/B 通道 + 横向偏移合成 |
| 噪点 | `getImageData` → 随机扰动像素 Alpha 通道 → `putImageData` |
| 马赛克 | `getImageData` → 按块取平均色 → `putImageData` |
| 发光 | `ctx.shadowBlur` + `ctx.shadowColor` 多次叠绘 |
| 扫描线 | 在 offscreen 上绘制半透明横条，`globalCompositeOperation: 'multiply'` 叠加 |

### 4.4 性能策略

- **无特效行零开销**：不创建 offscreen canvas，走现有路径
- **噪点**：只对文字包围盒区域做 `getImageData`，不处理全画布
- **马赛克**：同上，缩小处理范围
- **色散**：可缓存文字 path，避免重复 layout 计算

---

## 五、UI 变更

### 5.1 逐行编辑面板

在现有"动画效果"section 下方新增"像素特效"section：

```
像素特效
  ┌─────────────────────────────────┐
  │ ☐ 模糊        [radius slider]   │
  │ ☐ 色散        [offset slider]   │
  │ ☐ 噪点        [intensity][size] │
  │ ☐ 马赛克      [blockSize slider]│
  │ ☐ 发光        [radius][color]   │
  │ ☐ 扫描线      [spacing][opacity]│
  └─────────────────────────────────┘
```

- checkbox 控制开/关；勾选后下方展开该特效的参数行
- 多个同时勾选 = 叠加生效
- `_autoApply` 触发方式与现有动画参数相同

### 5.2 全局样式面板

"应用于所有字幕"功能同步支持像素特效：新增一组相同的 checkbox + 参数控件，点击按钮时把像素特效配置写入所有行 override。

---

## 六、实现步骤

| 阶段 | 内容 |
|------|------|
| **P0** | 数据模型扩展（`PixelFxEntry`、`LineOverride`、`LineState`） |
| **P0** | 渲染流程分支（offscreen canvas 路径） |
| **P1** | 实现模糊、发光（最简单，`ctx.filter` / `shadowBlur`） |
| **P1** | 逐行编辑 UI（checkbox + 参数展开） |
| **P2** | 实现色散、马赛克、噪点、扫描线 |
| **P2** | 全局样式面板集成 |
| **P3** | 性能测试 & 包围盒优化 |

---

## 七、暂不纳入的方向（留备忘）

- **像素特效随时间变化**（如色散强度随进场淡入）——会引入与动画系统的耦合，可在 v2 再议
- **自定义叠加顺序**——drag to reorder，交互成本较高
- **WebGL 加速**——当前 canvas 2D 对预计的特效量足够，暂不引入
