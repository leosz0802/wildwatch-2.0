# 稳定版说明 2026-07-09

## 定位

这是《荒野守望》微信小游戏的新 UI 稳定交付版。玩法、数值、动物 AI、社交联赛和资源循环沿用当前版本，本次只做交付整理与稳定性校验。

## 导入

- 微信小游戏 AppID：`wx0ad30effd406ea13`
- 微信开发者工具导入目录：`outputs/forest-kingdom-wechat-stable-v3-ui-20260709`
- 小游戏入口：`game.js`

## 资源

- 首包地图：`assets/art/core-map.jpg`
- 首包动物与兜底图集：`assets/art/core-sprites-atlas.png`
- 首包 UI 图标：`assets/art/ui-v3/icons/`
- 废弃 UI v2 与旧 Manus 交接包不进入稳定版目录。

## 回归

稳定版目录已通过完整回归：

```text
full regression check ok (52 checks)
```

覆盖范围包括语法、UI 字号规范、守望线索详情、行动授权系统、遮挡、按钮热区、弹窗关闭、地图拖动、动物移动、数值循环、资源流、巡护结算、采购出售、社交排名、素材引用和性能。
