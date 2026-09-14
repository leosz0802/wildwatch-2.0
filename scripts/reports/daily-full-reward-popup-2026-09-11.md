# 每日任务全清结算弹窗（2026-09-11）

## 需求
每日 4 项任务全部完成后，弹窗必须明确显示所有逐项奖励、全清额外奖励，以及保护区经营数值的前后变化。

## 实现
- `buildPatrolSettlement` 识别 `daily_full` 完成事件，写入 `dailyFullClear` 与 `dailyFullRewards`。
- 全清弹窗标题改为“每日任务全部完成”，摘要明确说明 4 项任务和奖励已到账。
- 奖励区显示：4 项任务的单项奖励汇总、每日全清/核心额外奖励、到账确认。
- 数值区显示基金、游客、水源、草场、安全、动物数量 6 项前后值及增减。
- 普通巡护结算仍沿用原来的奖励和数值布局。

## 验证
- `node --check js/game.js`
- `node scripts/navigation-routing-check.js`
- `node scripts/goal-system-v3-check.js`
- `node scripts/visitor-incident-check.js`
- `node scripts/daily-event-mail-entry-check.js`
- `node scripts/smoke-test.js`
- 额外校验 `settlementRewardDisplayLines` 能汇总 4 项逐项奖励与全清奖励。

未进行真实微信开发者工具设备点击验证；当前验证覆盖源码、状态流转与弹窗数据渲染输入。
