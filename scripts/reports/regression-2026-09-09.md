# 荒野守望回归报告 · 2026-09-09

工作目录：`/Users/edy/Documents/Codex/2026-07-10/z/outputs/forest-kingdom-ui-polish-v1`

## 结论

主回归通过；扩展界面审计仍有 22 条失败记录，不能视为界面全部验收通过。修改已写入上述本地目录，本轮没有发布服务器或微信体验版。

## 验证结果

- `node scripts/full-regression-check.js`：通过。50 个运行脚本语法检查、34 项基础检查、61 项补充检查、本地 API 测试、微信发布预检。
- `scripts/recent-ui-regression-check.js`：已纳入主回归。验证 320×568、375×667、430×932 下正文分页、建筑卡片边界、广告关闭触摸保护、首分钟禁插屏、榜单首三分钟静默、雨天最多两次和第十名数据变化。
- 长期运行：4 组随机种子 × 120 个守护日 × 每日 3 次行动，通过。此结果来自模拟器，不能替代真机帧率测试。
- 启动与性能检查、第一阶段流程、资源不足处理、剧情任务与游客/基金关联、重复地图入口检查均通过。
- 扩展 `screen-audit-check.js`：初次 304 条告警，修复后剩余 22 条（包含不同屏幕尺寸的重复项）。
- 广告 SDK 使用模拟测试；微信真实广告的关闭事件、触摸穿透与实际位置仍需真机验证。发布预检中的广告审核材料提示仍需按发布流程核实。

## 本轮修复

1. 删除补给区隐藏按钮遗留的点击区域，验证上方可见按钮仍可补给。
2. 榜单只按当前天气识别雨天，不再扫描整份存档；修复历史信件达到 30 封后频控失效、后排变化被截短 ID 去重的问题。
3. 榜单与动物信正文改为完整分页阅读，保持增大的字号，历史榜单文案也逐条分行。
4. 建筑升级弹窗增加有效内容高度，缩短标题/等级文案，避免底部遮挡。
5. 第一阶段引导改为两行，缩放按钮移到信息栏下方；地图建筑标签缩短并限制在地图内。
6. 广告显示期间及关闭后阻断穿透点击，缓冲结束后恢复任务操作。撤回此前误改物资页原生广告备用坐标的无关改动；该坐标不能移动微信插屏广告。
7. 修复第一阶段游客事件限制被错误延用到后续阶段、导致游客问题无法正常触发事件的逻辑。
8. 更新已过期的测试预期：栖息地配置成本、远程分享封面、WebP 图标、新手引导行和补给唯一入口；保留成本结算、资源格式与交互验证。

## 未通过的扩展界面项

以下保留审计原始结果，部分是实际空间/文字问题，部分是旧版视觉预期不一致，尚未逐一完成修复与验收。

- small/choose: two-image prologue lost its art, layered dialogue, compact transition, or interaction rhythm
- small/population-lv6: 下一等级物种没有合并成单一预览入口
- small/population-lv7: 小屏种群滚动仍过长 268px
- small/home-network: 保护地网络二级入口仍占用过多高度，或重复展示说明文字
- small/home/scroll:0/modal: 保护区等级 6级 · 区域样板 · 58%文字被截断: 进度[204×68:标题正文]、晋级路径[204×68:标题正文]、里程碑 1/1[204×70:正文]
- small/prosperity-dashboard: 数据仪表盘主数字过小或卡片空间不足
- small/settlement-commerce: 样本移交结算没有把实际拨款作为核心大数字
- small/home/scroll:0/modal: 保持距离观察文字被截断: 游客与基金[204×69:标题正文]、持续影响[204×69:正文]
- small/strategy-result: 策略结果卡仍有标题越界、正文截断或错误换行（4张：共护关系:68:标题完整/正文完整 | 迁移:68:标题完整/正文完整 | 游客与基金:69:标题截断/正文截断 | 持续影响:69:标题完整/正文截断）
- small/strategy-result: 长期后果仍把叙事长句挤在标题行，或正文换行不可读
- base/choose: two-image prologue lost its art, layered dialogue, compact transition, or interaction rhythm
- base/population-lv6: 下一等级物种没有合并成单一预览入口
- base/population-lv7: 中屏种群滚动仍过长 169px
- base/home-network: 保护地网络二级入口仍占用过多高度，或重复展示说明文字
- base/collection/scroll:0/modal: 普通点击区压到底部导航 259,584,92x26
- base/prosperity-dashboard: 数据仪表盘主数字过小或卡片空间不足
- base/settlement-commerce: 样本移交结算没有把实际拨款作为核心大数字
- large/choose: two-image prologue lost its art, layered dialogue, compact transition, or interaction rhythm
- large/population-lv6: 下一等级物种没有合并成单一预览入口
- large/home-network: 保护地网络二级入口仍占用过多高度，或重复展示说明文字
- large/prosperity-dashboard: 数据仪表盘主数字过小或卡片空间不足
- large/settlement-commerce: 样本移交结算没有把实际拨款作为核心大数字

## 复现

```sh
node scripts/full-regression-check.js
node scripts/screen-audit-check.js
```
