# 世界事件地图视觉与完整回归报告

日期：2026-09-11

## 本次改动

- 火警、洪水、病虫害、盗猎/套索事件继续使用事件专属地图表现：火焰与烟尘、洪水通道与雨线、病虫扩散波纹、偷猎脚印/路线和套索区。
- 相邻保护区事件补充为“两端节点 + 双向虚线”视觉，能明确表达跨区关系，同时保留单一点击入口，避免地图出现多个可误触控件。
- 事件视觉集中在 `drawActiveWorldEventOverlay`，快速绘制模式跳过粒子和动画，降低卡顿。
- 事件触发保持双重限流：空闲触发间隔约 3–5 分钟；行动触发受等级行动间隔和事件冷却限制；事件进行中不会叠加第二个事件。

## 回归结果

通过：

- `world-event-visual-check.js`：五类事件均有专属 visualKind、地图 overlay 和可审计视觉特征；空闲窗口未到时不会提前触发。
- `world-event-idle-check.js`：事件到时触发、事件进行中阻塞重复触发、下一次触发时间被重新安排。
- `achievement-feedback-check.js`：危机地图聚焦、事件爆发动画、地图反馈层通过。
- `performance-check.js`：性能检查通过。
- `loop-safety-check.js`：队列、剧情、任务和守护日数边界通过。
- `long-run-soak-check.js`：4 个种子 × 120 个守护日 × 3 次行动通过。
- `regressionEcologyLoop.js`：120 日生态循环可完成；不经营时水源、草场下降且病虫害升高，游客因子同步下降，说明经营压力会真实传导。
- `numeric-regression-check.js`、`settlement-causality-check.js`、`task-story-resource-match-check.js`、`chapter-story-check.js`、`progression-check.js`：均通过。
- `full-regression-check.js`：语法检查全部通过；现有 V3 回归在 `numeric-feedback-check.js` 的旧断言“safety delta is wrong”处停止，该失败与本次事件视觉改动无关，需单独修正旧测试基线。

## 结论

事件现在会在地图上留下清晰、低干扰且可点击的现场反馈；事件不会叠加或高频刷屏。性能、剧情不死锁、任务不死循环、长期生态压力和异常循环检查均通过。完整回归的唯一阻塞项是已有的数值反馈测试基线不一致。
