# 剧情与任务死循环专项回归 · 2026-09-14

实际修改目录：`/Users/edy/Documents/Codex/2026-07-10/z/outputs/forest-kingdom-ui-polish-v1`。

## 结论

最终 **48/48 项专项测试通过，0 超时**。本轮自动化覆盖的顺序、跳跃、交叉任务、重启恢复与章节晋级场景中，未再复现死循环。每个测试进程设置 45 秒上限，防止无限等待被误判为完成。

全量回归另被 `ios-ui-consistency-check.js` 的旧界面样式断言阻断：`map information dock is not using the premium parchment surface`。因此本报告只声明剧情/任务专项通过，**不声明项目全量回归通过**。

## 实际发现并修复

1. **共享解救物品造成永久等待**：先收满章节解救物品，再打开需要同一物品的盗猎任务，新任务错误显示已备齐；被消耗后，章节任务点数已经满额，继续射箭也无法再次发物品。现按动物解救记录计算物品归属，其他任务不能使用已经归属本任务的物品。已满额的独立点数也作为旧存档的完成凭据，恢复“满分但物品已被误消耗”的任务。未归属任务的旧库存仍可使用。
2. **新游戏误带章节绕过标志**：默认存档设置了 `legacyGateBypass = true`，第一章可以跳过解救条件。现新游戏默认关闭该兼容绕过；全部必要条件完成后才晋级。
3. **缺物资时的任务卡没有补给出口**：驱赶偷猎、修复栖息地两种新版卡片只提示资源不足。现复用已有“去物资”路线，关闭被阻断的操作卡并进入补给。已检查 320、375、430 宽度下的实际按钮回调。
4. **邮件与任务入口点击区域重叠**：存在待解救目标时，两者会同时绘制在同一位置。现新邮件提示的 5 秒期间暂让出共用入口，提示结束后恢复任务入口，防止点击被另一个入口截走。

物品目标点数的计算集中到解救模块，章节、盗猎和探索使用一致的目标值。任务卡及探索弹窗读取自己的点数，不再用其他动物的共享进度作为新任务初值。

## 关键覆盖范围

| 范围 | 验证内容 |
|---|---|
| 跳跃式任务 | 4 种顺序 × 32 次模拟行动，任务标识有效、无重复、章节不倒退 |
| 新增交叉测试 | 4 种完成顺序，40 次射箭，28 次游客/山火/洪水/疾病事件穿插，每次穿插后保存并重载 |
| 解救物品独立性 | 相同物品供不同任务使用；先部分收集/先全部收集；章节先救/盗猎先救；满额旧存档恢复；重复结算拒绝 |
| 全章节门槛 | 20 章 × 正序/逆序解救：未完成前不晋级，完成全部条件后进入下一章，第 20 章正常完成 |
| 解救点击与动画 | 43 个章节解救目标，野猪地图点击、严格模式缓存、剪绳/淡出/离开阶段与一次性结算 |
| 连续运行 | 4 个随机种子 × 120 守护日 × 3 次行动，共 1440 次；数值有效、普通任务持续可执行 |
| 守护日流程 | 40 个随机种子 × 24 天 |
| 收集剧情 | 40 个随机种子，45/45 个收集目标可达，无重复领取及死锁 |
| 关闭与重入 | 进行中任务关闭、完成后残留锁、嵌套详情返回、不同入口重入、游客事件成功与失败 |
| 地图节奏 | 卡片推送节流、空闲事件触发、活动事件防重复、事件清除、邮件提示到期与跨日恢复 |

全章节门槛测试会构造已满足的数值/剧情条件来独立验证晋级状态机，不等同于真实玩家逐章游玩。1440 次长跑刻意忽略解救时，应停在解救门槛前，测试同时要求无关任务仍能继续，不能把这种合法等待误判为死锁。

## 测试基线校正

核对当前实现后，更新了过时测试前提，未通过放宽业务规则来消除失败：第一章只有一个正式解救目标；完成引导不等于已跨章；章节显示字段需与测试阶段一致；新手招募收入按现行游客消费公式计算；巡护操作位于任务页并保留来源页；被困种群卡进入自己的解救任务；每日完成后可展示仍未完成的章节解救入口。补给及导航测试验证实际按钮回调、取消释放锁和返回目的地。

## 验证边界

本轮主要使用 Node 自动化及模拟微信运行环境。没有在微信开发者工具或手机上完成整轮手动实机游玩，因此不对所有输入组合、动画视觉效果或设备差异作绝对保证。全量套件的界面样式失败保留在日志中，没有删除失败断言。

新增两个组合测试已加入 `scripts/full-regression-check.js`，以后全量运行会执行它们。

## 最终测试清单

- 通过：`nonlinear-task-routing-check.js`（2.57 秒）
- 通过：`task-lock-recovery-check.js`（0.45 秒）
- 通过：`recurring-rescue-task-routing-check.js`（0.56 秒）
- 通过：`rescue-point-feedback-check.js`（2.73 秒）
- 通过：`chapter-rescue-strict-cache-check.js`（0.50 秒）
- 通过：`chapter-rescue-restart-check.js`（1.21 秒）
- 通过：`chapter-rescue-system-check.js`（0.25 秒）
- 通过：`loop-safety-check.js`（0.99 秒）
- 通过：`story-system-consistency-check.js`（1.17 秒）
- 通过：`chapter-story-check.js`（0.43 秒）
- 通过：`story-activation-check.js`（0.46 秒）
- 通过：`task-story-alignment-check.js`（0.89 秒）
- 通过：`task-story-resource-match-check.js`（0.50 秒）
- 通过：`map-task-story-dedupe-check.js`（0.45 秒）
- 通过：`mission-push-check.js`（0.60 秒）
- 通过：`world-event-system-check.js`（0.37 秒）
- 通过：`world-event-idle-check.js`（0.40 秒）
- 通过：`world-event-visual-check.js`（0.37 秒）
- 通过：`visitor-incident-check.js`（1.32 秒）
- 通过：`event-business-loop-check.js`（1.43 秒）
- 通过：`progression-check.js`（0.83 秒）
- 通过：`stage1-regression-check.js`（0.71 秒）
- 通过：`first-stage-reduction-check.js`（0.52 秒）
- 通过：`long-run-soak-check.js`（16.37 秒）
- 通过：`numeric-regression-check.js`（0.66 秒）
- 通过：`task-resource-pipeline-check.js`（1.78 秒）
- 通过：`resource-loop-check.js`（0.85 秒）
- 通过：`sandbox-task-sync-check.js`（0.59 秒）
- 通过：`sandbox-task-navigation-check.js`（0.38 秒）
- 通过：`modal-close-check.js`（0.53 秒）
- 通过：`mixed-task-deadlock-check.js`（2.52 秒）
- 通过：`chapter-gate-order-check.js`（0.40 秒）
- 通过：`guardian-24day-soak-check.js`（27.03 秒）
- 通过：`collection-v2-soak-check.js`（0.88 秒）
- 通过：`guardian-turnover-loop-check.js`（0.71 秒）
- 通过：`goal-system-v3-check.js`（0.42 秒）
- 通过：`goal-ui-check.js`（0.74 秒）
- 通过：`flow-return-check.js`（0.90 秒）
- 通过：`navigation-routing-check.js`（1.08 秒）
- 通过：`ledger-story-task-check.js`（0.27 秒）
- 通过：`endless-chapter-check.js`（0.42 秒）
- 通过：`collection-system-check.js`（0.53 秒）
- 通过：`core-resource-system-check.js`（2.60 秒）
- 通过：`ecology-consistency-check.js`（0.36 秒）
- 通过：`daily-event-mail-entry-check.js`（0.54 秒）
- 通过：`visitor-routine-layout-check.js`（0.51 秒）
- 通过：`animal-interaction-check.js`（0.16 秒）
- 通过：`population-interaction-check.js`（0.43 秒）

[最终机器可读结果](/Users/edy/Documents/Codex/2026-07-10/z/outputs/forest-kingdom-ui-polish-v1/scripts/reports/deadlock-regression-2026-09-14/verified-results.json) · [全量套件阻断日志](/Users/edy/Documents/Codex/2026-07-10/z/outputs/forest-kingdom-ui-polish-v1/scripts/reports/deadlock-regression-2026-09-14/full-regression.log)
