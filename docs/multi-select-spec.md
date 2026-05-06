# 多选字幕 — 功能规格文档

## 概述

允许用户在字幕列表和时间轴上同时选中多条字幕，并在属性面板中批量查看和编辑它们的属性。参考 Unreal Engine Details 面板的混合值呈现方式。

---

## 一、选中交互

### 1.1 字幕列表（右侧面板）

| 操作 | 行为 |
|------|------|
| 单击 | 单选，清除其他选中 |
| Ctrl + 单击 | 切换该条目的选中状态（加入或移出选集） |
| Shift + 单击 | 范围选中：从上一个选中项到当前项之间的所有条目 |
| Ctrl + A | 全选所有字幕 |
| Escape | 清除所有选中 |

### 1.2 时间轴

| 操作 | 行为 |
|------|------|
| 单击 clip | 单选，清除其他选中 |
| Ctrl + 单击 clip | 切换该 clip 的选中状态 |
| Shift + 单击 clip | 范围选中（按时间顺序） |
| 框选（拖拽空白区域） | 选中框内所有 clip |
| Ctrl + A | 全选 |
| Escape / 单击空白 | 清除所有选中 |

### 1.3 双向同步

列表和时间轴的选集保持同步：在任意一侧改变选集，另一侧立即更新高亮状态。

---

## 二、选集状态管理

当前 `selectedIndex: number | null` 替换为：

```ts
selectedIndices: Set<number>   // 当前选中的字幕索引集合
lastAnchorIndex: number | null // Shift 选择的起始锚点
```

相关方法：

```ts
setSelection(indices: number[])          // 替换整个选集
addToSelection(index: number)            // 追加单条
removeFromSelection(index: number)       // 移除单条
toggleSelection(index: number)           // 切换单条
selectRange(from: number, to: number)    // 范围选中
clearSelection()                         // 清空
```

---

## 三、属性面板 — 多选状态

### 3.1 整体行为

- 选中 **0 条**：面板隐藏（现有行为）
- 选中 **1 条**：现有行为不变
- 选中 **多条**：面板顶部显示"已选中 N 条字幕"，各属性字段进入混合值模式

### 3.2 混合值呈现规则

对每个属性字段，比较所有选中条目的当前值：

**值一致** → 正常显示该值，可直接编辑，修改应用到所有选中条目

**值不一致** → 呈现"多个值"占位状态：

| 控件类型 | 多个值时的表现 |
|----------|---------------|
| 文字输入框 | value 清空，placeholder 显示 `多个值` |
| 数字滑块 | 滑块置于中间，数字框显示 `—`，轨道灰色虚线样式 |
| 颜色选择器 | 显示棋盘格图案或灰色占位 |
| 下拉选择器 | 插入不可选的 `— 多个值 —` 选项并选中 |
| 复选框 | 显示不确定状态（`indeterminate`） |

**编辑混合值字段**：用户一旦开始输入或拖动，视为"覆盖"操作，新值批量写入所有选中条目。

### 3.3 不渲染的细节

以下子区域在多选时折叠隐藏，不展开参数：

- 特效参数（入场 / 持续 / 退场的具体参数 sliders）——只显示效果名称下拉框
- 像素特效的参数 sliders——只显示各效果的启用 checkbox
- 装饰的随机范围 slider（随机大小 checkbox 仍显示）

原因：这些参数在多选场景下意义模糊，且 UI 空间有限。

### 3.4 文字字段

多选时文字输入框隐藏，每条字幕文字独立，批量修改无意义。

---

## 四、批量应用逻辑

### 4.1 `_collectOverride` 的多选扩展

```ts
// 伪代码
function applyMultiEdit(field: string, value: unknown) {
  for (const idx of selectedIndices) {
    const override = getOverride(idx)
    setField(override, field, value)
    scene.setOverride(idx, override)
  }
}
```

每次用户修改一个字段，立即对所有选中条目调用 `scene.setOverride()`。

### 4.2 实时预览

多选编辑时实时预览与单选一致，所有选中条目同步更新渲染。

---

## 五、视觉标识

### 字幕列表

- 选中条目：高亮背景（现有单选样式扩展到多条）
- 多选时不显示"焦点"边框，所有选中项等权

### 时间轴

- 选中 clip：高亮边框（现有）
- 多选时每个选中 clip 都显示高亮边框
- 框选时显示半透明选框矩形

---

## 六、键盘快捷键

| 快捷键 | 行为 |
|--------|------|
| Ctrl + A | 全选 |
| Escape | 清除选集 |
| Delete / Backspace | 删除所有选中字幕（需二次确认） |

---

## 七、不在本版本范围内

- 多选拖拽移动时间轴位置
- 多选复制 / 粘贴
- 选集的撤销 / 重做
