# 荒野守望 / 野境保护区 最新代码交接说明

交接时间：2026-07-09

## 目标

这是一份给 Manus 继续优化的最新版微信小游戏代码快照。当前版本的方向是：

- 低门槛，类似 QQ 农场，每天十分钟。
- 玩家经营自己的保护区，让保护区越来越繁荣、动物越来越多、资产越来越值钱。
- 巡护班次、保护基金、补给、回收物形成清晰循环。
- AI 通过动物对白、动态事件和数据变化，让保护区像活着一样。

## 运行入口

- 微信小游戏入口：`game.js`
- 微信小游戏配置：`game.json`
- 微信开发工具配置：`project.config.json`
- 小程序 / 小游戏 AppID：`wx0ad30effd406ea13`

## 核心代码

- `js/game.js`
  - Canvas UI 主绘制层，绝大多数界面、按钮、弹窗、点击热区都在这里。
  - Manus 优化 UI 时优先改这里。
- `js/world.js`
  - 世界与保护区初始数据、物种、区域、玩家保护区参数。
- `js/simulator.js`
  - 每日生态模拟、天气、资源、迁移、偷猎、病虫害等。
- `js/actions.js`
  - 玩家操作、资源消耗、结算影响。
- `js/forestDirector.js`
  - AI 森林导演：把事实数据组织成动物视角、事件、对白。
- `js/animals.js`
  - 动物配置、动物身份、习性、头像与对白材料。
- `js/storage.js`
  - 存档、初始化、状态恢复。

## 当前 UI 资源

当前运行版默认使用独立图标文件，不再使用旧图集裁切。

- 当前图标目录：`assets/art/ui-v3/icons/`
- 当前地图与动物资源：
  - `assets/art/core-map.jpg`
  - `assets/art/core-sprites-atlas.png`

请不要继续使用：

- `assets/art/ui-v2/`
- `assets/art/ui-v2/icons-complete-sheet-640.png`
- 旧高清图集、高清源图或临时生成脚本
- 任何旧的 Manus 交接 zip 或 handoff 目录

## 最新 UI 重点

下一轮 Manus 建议优先处理：

- 巡护页保持“巡护指挥”面板：
  - 顶部主视觉更像指挥台。
  - 威胁态势 4 个大指标突出数值和操作按钮。
  - 执行任务只保留防御行动和生态行动；采购、出售、回收放到物资页。
- 物资页改成更清晰的“物资仓库”：
  - 顶部只看保护基金、可巡护天数、班次、情报、外勤证。
  - 巡护补给旁边是“补给购买”。
  - 回收物资旁边是“收取 / 出售”，清楚表达先收集、再出售。
- 所有按钮要遵守固定结构：
  - 图标区、标题区、数值区、按钮区互不遮挡。
  - 每张卡只突出一个当前库存数字，避免 0 和另一个数字并列造成误解。

## 字号规范

代码里的 `this.text(ctx, text, x, y, size, color, weight, align)` 应遵守当前字号系统：

- 主标题：24
- 关键数值：22
- 区块标题：18 / 16
- 按钮主文字：14 / 16
- 正文：13 / 12
- 标签与小信息：11 / 10 / 9 / 8

长文本必须使用：

- `fitTextSize(...)`
- `drawFittedTextBlock(...)`
- `truncateTextToWidth(...)`

不要硬塞长文本到按钮或卡片里。

## 回归检查

修改后建议至少运行：

```bash
node --check js/game.js
node scripts/screen-audit-check.js
node scripts/ui-layout-check.js
node scripts/ui-icon-layout-check.js
node scripts/numeric-regression-check.js
node scripts/full-regression-check.js
```

当前完整回归入口是：

```bash
node scripts/full-regression-check.js
```

## 打包说明

本交接包包含当前代码、运行配置、测试脚本、运行用美术资源和说明文档。

交接包刻意排除了旧 handoff 包、旧 zip、旧 UI v2 资源和缓存，避免 Manus 误用废弃资源。
