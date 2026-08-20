# 野境守护微信小游戏

Canvas 单入口微信小游戏。当前版本聚焦“自然保护区卫士”：玩家维护保护区安全、水源、草场、补给和动物信任，通过巡护结算、动物对白、沙盘状态和物资运营感知一座会变化的森林。

当前玩法加入了剧情任务引导和保护区社交联动：每日任务会给出动物求助、推荐操作和奖励；好友/世界保护区的加固、回收、告警和水源修复会影响动物迁移、回收物供给与市场价格。

## 打开方式

1. 打开微信开发者工具。
2. 选择“小游戏”导入本目录。
3. AppID 使用 `wx0ad30effd406ea13`。
4. 编译后从首页点击“接管保护区”。

详细说明见 `WECHAT_DEVTOOL_SETUP.md`。

## 当前结构

- `game.js`：小游戏入口。
- `js/game.js`：Canvas UI、沙盘、弹窗、点击和动画。
- `js/simulator.js`：每日巡护结算与保护区数值变化。
- `js/forestDirector.js`：本地 AI 森林导演，把事实数据转成动物视角。
- `js/world.js`：保护区、动物 NPC、联赛和初始世界。
- `assets/art/core-map.jpg`：首包正式地图。
- `assets/art/core-sprites-atlas.png`：首包动物与兜底图集。
- `assets/art/ui-v3/icons/`：Manus v3 独立 UI icon，首包运行使用。

## 资源策略

首包必须是完整游戏效果，不使用占位图：

- 首包保留 `core-map.jpg`、`core-sprites-atlas.png` 和 `ui-v3/icons/`。
- 稳定版工程不再保留高清源图、旧大图集和临时交接包。
- 如果后续要接动态高清美术，请从外部 Manus/美术源包重新生成并上传远程资源，不要把源图重新塞回小游戏工程。

## 回归检查

在项目目录执行：

```bash
node scripts/full-regression-check.js
```

该入口会分组执行语法、UI 遮挡/字号、数值循环、地图动物、AI 对白、社交联赛、素材引用和性能检查。需要定位单项问题时，再单独运行 `scripts/` 下对应检查脚本。
