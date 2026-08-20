# 当前版本说明

## 版本定位

当前版本是微信小游戏《野境守护》的保护区经营原型。核心不是旧版“认领动物”，而是玩家作为自然保护区卫士，维持生态平衡，并用合规收益反哺保护区。

## 核心体验

- 首页以动物视角沙盘为主，地图可拖动，动物会移动并可点击听心声。
- 首页信息台展示安全、生态、经营三项主状态；动物回归/警觉/安定作为生态结果呈现，并通过守望线索弹窗解释发生、影响、结果、风险和行动。
- 点击安全、生态、经营主指标后，可下钻查看对应子指标变化：安全包含安全等级、偷猎压力、迁移线；生态包含水源、草场、病虫害；经营包含基金、班次、情报、外勤证。
- 地图标记不再只显示问号/感叹号/恢复符号，会直接显示一句带说话人的线索对白。
- 班次、情报、外勤证合并为行动授权系统：班次决定行动预算，情报决定精准度，外勤证授权高危驱赶、生态干预和跨区边界事件。
- 底部主导航改为“沙盘 / 世界 / 物资”；巡护不再占主菜单位，而是由动物对白、地图线索、任务推送和物资指引打开。
- 巡护页新增剧情任务引导：每日目标包含章节、动物求助、推荐操作和奖励，玩家不用自己猜该点哪里。
- 巡护任务弹窗改为强重点结构：顶部突出任务和主收益，中部突出最关键变化，底部保留指令和执行。
- 巡护操作只保留防卫巡护和生态调节；出售、采购等经营动作统一放到物资页。
- 回收物资区区分“待收取 / 已入库 / 未发现”：巡护带回先进入待收取，收取后才可出售。
- 所有巡护任务通过弹窗确认，并通过结算弹窗反馈守护分、防护等级、偷猎压力、基金、物资和动物感受。
- 动物对白由森林事实驱动，表达天气、偷猎、水源、迁移、疾病和玩家行为带来的变化。
- 物资页聚焦保护基金、可巡护天数、补给短缺和合规回收物。
- 联赛页保留好友/世界保护区排名、派猎犬和防护网方向；其他保护区行为会影响迁移、回收物和价格。

## 当前美术

- 首包地图：`assets/art/core-map.jpg`
- 首包动物/兜底图集：`assets/art/core-sprites-atlas.png`
- 首包 UI icon：`assets/art/ui-v3/icons/`
- 稳定版已移除旧高清图集、高清源图和临时交接资源；后续高清美术从外部资源包重新接入。

## 当前检查基线

```text
full regression check ok (52 checks)
asset reference check ok
art atlas check ok
remote art check ok
smoke test ok
core loop check ok
task social check ok
mission push check ok
flow return check ok
threat action check ok
progression check ok
goal feedback check ok
dialogue check ok
forest director check ok
animal identity check ok
league ranking check ok
new content check ok
weather effect check ok
ambient loop check ok
npc realism check ok
map layout ok
map interaction ok
watch clue detail check ok
action system check ok
animal motion check ok
performance check ok
screen audit check ok
typography check ok
ui layout check ok
modal close check ok
bugfix check ok
lake art check ok
```
