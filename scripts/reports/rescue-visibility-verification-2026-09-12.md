# 解救入口、存档与游客结果布局核查

项目：/Users/edy/Documents/Codex/2026-07-10/z/outputs/forest-kingdom-ui-polish-v1

开发者工具 2026-09-12-21-31-43-71.log 中记录的项目目录与以上路径一致。环境提示的 /Users/edy/Documents/Codex/2026-09-07/zai-x20 当前不存在，没有向该目录复制或写入代码。

## 本次修正

- 解救数据版本升级为 2；修复 v1 自动生成但没有 rescuedAt 的假完成记录。真正的已解救记录和已有库存保留。旧存档补齐当前章节待解救记录，并保存迁移结果。
- 第一章使用明确的存档章节，不再被种群分数推算覆盖。
- 探索指令解析支持数字和下划线，避免 rescue_quiet_water_tag 被截成 rescue 后变成随机普通探索。
- 物资页顶部独立展示动物解救物品分类、六种库存、当前需要物品和任务入口；动物卡片优先展示待解救动物；沙盘有被困动物标记及持续的解救入口。
- 解救与收集入口遵守当前任务锁。完成后再次加载不会重复解救。新存档中的被困种群不会被普通种群初始化提前释放。
- 游客维护准备页和结果页按实际文本测量卡片高度，完整展示所有条目；正文过长可在固定区域滚动，底部按钮固定。

## 已验证

- chapter-rescue-restart-check.js：新存档、已游玩老存档、v1 假完成迁移、真实完成保留、六种库存持久化、新章节生成、任务互斥；实际点击缺少物品 → executeMaterialExploration → 保存 → loadState → 解救 → 再次保存加载；三种宽度分类卡片和沙盘标记。
- chapter-rescue-system-check.js、material-exploration-check.js。
- visitor-routine-layout-check.js：320/375/430 宽度，280/362 正文高度，准备/普通结果/全清结果，共 18 组合；字体感知模拟与注册中文字体的真实 Canvas 均通过。
- ui-layout-check.js、modal-header-style-check.js、map-layout-check.js、progression-check.js、chapter-story-check.js、visitor-incident-check.js、animal-letter-system-check.js、core-loop-check.js。
- 修改的 JavaScript 语法检查通过。

## 限制与未解决项

- task-resource-pipeline-check.js:230 仍失败：补齐其余晋级条件后应进入后半章。本次不宣称全系统任务剧情回归通过。
- 用户提供的 32f355792262401098df23e81c320c32.mp4 路径当前不存在，未能读取视频。
- 微信开发者工具 cli auto 返回成功，仅表示自动化打开成功，不作为编译通过证据。
- wechatide 调试授权 pending，10 次查询后仍未完成。尚未取得编译后模拟器日志或截图；reports 中图片是本地代码 Canvas 渲染预览，不是模拟器截图。
- 待恢复授权：clientName Codex；taskId auth_3cb920faf9c363f25230fc88436374e7d7fab228553d5641；原操作 check_wechatide_status 派生 auth。恢复时先查询此 taskId，勿重新创建授权。
