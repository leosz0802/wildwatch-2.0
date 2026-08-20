# 动物世界功能集成指南

## 概述

"动物世界"是一个新的底部导航栏目，展示保护区内所有动物的：
- 生态角色与重要性
- 关系网络（捕食、竞争、情报共享、水源共享、互利）
- 食物链层级
- 个体档案（优势、弱点、生态位）

## 需要修改的文件

### 1. game.js — 顶部引入

在第 6 行（`require("./reserveView")` 之后）添加：

```js
const { animalEcoProfile, getAnimalRelations, foodChainTiers, animalImportanceScore, buildRelationGraph, ECO_ROLES, RELATION_TYPES } = require("./animalWorld");
```

### 2. game.js — 构造函数中初始化

在 `constructor()` 中（约第 84 行附近，`this.screen` 初始化之后）添加：

```js
this.selectedAnimalWorldNpc = null;
this.animalSelectorScroll = 0;
```

### 3. game.js — setScreen 函数

在 `setScreen(screen)` 函数中添加对 "animalworld" 的处理：

```js
if (screen === "animalworld") {
  this.selectedAnimalWorldNpc = (this.state.world && this.state.world.knownCharacters && this.state.world.knownCharacters[0]) 
    ? this.state.world.knownCharacters[0].id 
    : null;
}
```

### 4. game.js — render 函数

在 render 函数的屏幕分支中（约第 811 行，`if (this.screen === "league")` 之后）添加：

```js
if (this.screen === "animalworld") this.drawAnimalWorld(ctx);
```

### 5. game.js — drawBottomNav 函数

将 nav 数组（约第 8832 行）从 3 个改为 4 个：

```js
const nav = [
  ["home", "沙盘", "nav_sandbox"],
  ["animalworld", "动物", "eye"],        // ← 新增：动物世界
  ["league", "排行", "signal"],          // ← 世界 → 排行（保护区联赛排名）
  ["role", "物资", "nav_materials"]
];
```

### 6. game.js — 触摸事件处理

在触摸事件处理中（约第 560 行附近），添加对 "animalworld" 屏幕的滚动处理：

```js
// 在现有的滚动处理中添加
if (this.screen === "animalworld" && this.gesture && this.gesture.pan) {
  this.animalSelectorScroll = (this.animalSelectorScroll || 0) + this.gesture.pan.dx;
  this.animalSelectorScroll = Math.min(0, Math.max(-200, this.animalSelectorScroll));
}
```

### 7. game.js — 添加所有 UI 渲染函数

将 `animalWorldUI.js` 中的所有函数（`drawAnimalWorld` 到 `empty`）复制到 Game 类中。

---

## 新增文件

| 文件 | 说明 |
|------|------|
| `js/animalWorld.js` | 数据模型：生态角色、关系网络、食物链、重要性评分 |
| `js/animalWorldUI.js` | UI 渲染：所有 draw 函数 |

---

## 界面布局

```
┌─────────────────────────────────┐
│  动物世界                        │  ← 标题区（深绿色）
│  了解每一只动物的生态角色...      │
├─────────────────────────────────┤
│  生态角色                        │
│ ┌────────┐ ┌────────┐ ┌───────┐ │
│ │顶级捕食者│ │中层捕食者│ │食草动物│ │  ← 6 个角色卡片
│ └────────┘ └────────┘ └───────┘ │
│ ┌────────┐ ┌────────┐ ┌───────┐ │
│ │小型食草  │ │清道夫    │ │水域守护 │ │
│ └────────┘ └────────┘ └───────┘ │
├─────────────────────────────────┤
│  保护区动物  17只                │
│ [沉牙] [黑铃] [晨角] [厚掌] ... │  ← 可滑动选择器
├─────────────────────────────────┤
│  ┌─────────────────────────────┐│
│  │ 沉牙狼 · 猎场首领     重要性 ││
│  │ 顶级捕食者   信任 34        ││  ← 选中动物档案
│  │ 生态位：高位捕食者           ││
│  │ 优势：追踪·围猎·威慑         ││
│  └─────────────────────────────┘│
├─────────────────────────────────┤
│  关系网络                        │
│  ●捕食 ○竞争 ○情报 ○水源 ○互利  │  ← 关系图例
│ ┌──────────────┐ ┌────────────┐│
│ │捕食 晨角鹿 ██│ │竞争 烈鬃狮 █││  ← 关系卡片
│ └──────────────┘ └────────────┘│
│ ┌──────────────┐ ┌────────────┐│
│ │领地 厚掌熊 ██│ │互利 黑铃鸦 █││
│ └──────────────┘ └────────────┘│
├─────────────────────────────────┤
│  食物链                          │
│ T5 顶级捕食者  狮子 熊 鳄鱼 河马  │
│ T4 高位捕食者  狼 豹子 野犬       │  ← 5 层食物链
│ T3 中层捕食者  水貂 狐狸 鹰       │
│ T2 大型食草    鹿 斑马 羚羊 ...   │
│ T1 小型食草    兔子 刺猬 貉       │
└─────────────────────────────────┘
[沙盘] [动物] [排行] [物资]        ← 底部导航（4个）
```

---

## 数据流

```
animalWorld.js (数据模型)
  ├── animalEcoProfile(npc) → 生态档案
  ├── getAnimalRelations(npcId) → 关系列表
  ├── animalImportanceScore(npc, reserve) → 重要性评分
  ├── buildRelationGraph(npcId) → 关系图数据
  └── foodChainTiers() → 食物链结构
         ↓
game.js (UI 渲染)
  ├── drawAnimalWorld() → 主入口
  ├── drawAnimalWorldHero() → 标题
  ├── drawEcoRoleOverview() → 生态角色
  ├── drawAnimalSelector() → 横向选择器
  ├── drawAnimalProfileCard() → 档案卡片
  ├── drawAnimalRelationMap() → 关系网络
  └── drawFoodChain() → 食物链
```