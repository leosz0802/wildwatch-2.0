const assert = require("assert");

function fakeContext(width = 375, height = 667) {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width, height };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext: () => fakeContext() }; },
  createImage() { return { loaded: true }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { createReserveState } = require("../js/world");
const { normalizeReserve } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const {
  RESERVE_DEVELOPMENT_NODES,
  RESERVE_DEVELOPMENT_CHOICES,
  RIVER_SHALLOWS_NODE,
  reserveDevelopmentNodeView,
  reserveDevelopmentViews,
  reserveDevelopmentAnimalTarget,
  buildReserveDevelopmentPlan,
  riverShallowsView,
  riverShallowsAnimalTarget,
  selectRiverShallowsPlan,
  buildRiverShallowsPlan,
  completeRiverShallowsConstruction,
  settleReserveDevelopmentDay
} = require("../js/reserveDevelopment");
const { Game } = require("../js/game");

const reserve = createReserveState();
const initialFund = reserve.fund;
const available = riverShallowsView(reserve, 1);
assert.strictEqual(available.phase, "available", "新保护区应显示可选择的河岸浅滩节点");
assert.strictEqual(available.availability.length, 4, "浅滩首版应提供动物、游客、经济与非建设四种选择");
assert(available.availability.some((row) => row.choice.id === "night_water_patrol" && row.available), "玩家必须能不建设而继续现有巡护玩法");

const selected = buildRiverShallowsPlan(reserve, "visitor_boardwalk", 1);
assert(selected.ok && selected.phase === "operational", "游客友好路线应一次确认后直接投入运行");
assert.strictEqual(reserve.fund, initialFund - 360, "高架步道的基金只能扣除一次");
assert.strictEqual(riverShallowsView(reserve, 1).visualStage, "operational", "建设确认后地图应立即显示正式设施");
const fundAfterBuild = reserve.fund;
const duplicateBuild = buildRiverShallowsPlan(reserve, "visitor_boardwalk", 1);
assert.strictEqual(duplicateBuild.ok, false, "同一节点不得重复建设");
assert.strictEqual(reserve.fund, fundAfterBuild, "重复点击不得再次扣除基金");
const operating = riverShallowsView(reserve, 2);
assert(operating.visitors >= 7 && operating.income > 0, "运行中的游客设施应产生现场游客与收入");
assert(operating.disturbance > 0 && operating.trouble !== "", "游客收益必须同时暴露惊扰和具体麻烦");
assert.strictEqual(riverShallowsAnimalTarget("鹿", reserve, 2).state, operating.animalUse ? "using" : "avoiding", "鹿群路线必须读取同一份浅滩状态");

const fundBeforeSettlement = reserve.fund;
const firstSettlement = settleReserveDevelopmentDay(reserve, 2);
assert(firstSettlement && firstSettlement.income > 0, "每日首次行动应结算一次游客收入");
assert(firstSettlement.grossIncome > firstSettlement.income && firstSettlement.upkeep > 0, "游客设施必须扣除日维护后再形成净收入");
assert.strictEqual(reserve.fund, fundBeforeSettlement + firstSettlement.income, "游客收入应进入保护基金");
assert.strictEqual(settleReserveDevelopmentDay(reserve, 2), null, "同一保护区日不得重复结算游客收入");
assert.strictEqual(reserve.development.nodes.river_shallows.visitorLedger.totalVisitors, firstSettlement.visitors, "游客人数应写入累计账本");

const restored = normalizeReserve(JSON.parse(JSON.stringify(reserve)), createReserveState());
const restoredView = riverShallowsView(restored, 2);
assert.strictEqual(restoredView.choice.id, "visitor_boardwalk", "读档不得丢失玩家选择的保护区路线");
assert.strictEqual(restoredView.ledger.totalIncome, firstSettlement.income, "读档不得丢失游客收入历史");

const legacyReserve = createReserveState();
const legacyFund = legacyReserve.fund;
const legacySelected = selectRiverShallowsPlan(legacyReserve, "community_waterpoint", 1);
assert(legacySelected.ok && legacySelected.phase === "construction", "应能构造旧版本半施工存档");
const legacyAfterCost = legacyReserve.fund;
const legacyRecovered = completeRiverShallowsConstruction(legacyReserve, 1);
assert(legacyRecovered.ok && legacyRecovered.phase === "operational", "旧版本半施工状态应可直接恢复为运行态");
assert.strictEqual(legacyAfterCost, legacyFund - 280, "旧施工状态只应包含首次建设扣费");
assert.strictEqual(legacyReserve.fund, legacyAfterCost, "恢复旧施工状态不得再次扣费");
assert.strictEqual(completeRiverShallowsConstruction(legacyReserve, 1).ok, false, "旧施工状态恢复只能执行一次");

const patrolReserve = createReserveState();
const patrolBuild = buildRiverShallowsPlan(patrolReserve, "community_waterpoint", 1);
assert(patrolBuild.ok && patrolBuild.phase === "operational", "巡护回归前设施应已建成");
const patrolState = {
  character: { role: "warden", location: "东部河岸", stamina: 82, health: 92 },
  world: { day: 1, time: "上午", weather: "阴", season: "雨季", reserve: patrolReserve, knownCharacters: [], goals: {}, actionHistory: [], mapEvents: [], rumors: [], natureKnowledge: [] },
  messages: [],
  reports: []
};
const patrolResult = simulateDay("修复水源和草场", patrolState);
const patrolView = riverShallowsView(patrolResult.world.reserve, 1);
assert.strictEqual(patrolView.phase, "operational", "完成巡护结算后设施不得退回待治理态");
assert.strictEqual(patrolView.choice.id, "community_waterpoint", "巡护结算必须保留玩家选择的建设路线");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state.world.reserve = restored;
game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
game.hitAreas = [];
const camera = {
  x: 0, y: 0, w: 375, h: 667,
  worldX: 0, worldY: 0, worldW: 375, worldH: 667,
  worldSize: 667, scale: 1
};
game.drawLivingReserveNode(fakeContext(), camera, false, { view: restoredView, interactive: true, showDialogue: true });
assert(game.renderedLivingReserveNode && game.renderedLivingReserveNode.planId === "visitor_boardwalk", "地图应绘制玩家选择的真实设施形态");
assert.strictEqual(game.renderedLivingReserveNode.buildingLevel, restoredView.building.level, "地图建筑应同步显示当前升级等级");
assert(/Lv\.\d+|未启用|施工|待建/.test(game.renderedLivingReserveNode.buildingLabel), "地图建筑应同步显示等级阶段标签");
assert.strictEqual(game.renderedLivingReserveNode.mapLabelMode, "compact", "地图建筑默认只显示短标签");
assert(!/[·]|未启用|待治理|建设中|稳定|受损/.test(game.renderedLivingReserveNode.mapLabel), "地图建筑短标签不应常驻展示完整状态");
assert(game.renderedLivingReserveNode.visitors > 0, "游客应作为地图角色出现");
assert(game.renderedLivingReserveNode.visitorPositions.length >= 1 && game.renderedLivingReserveNode.visitorPositions.length <= 3, "地图应按客流绘制有限数量的独立游客角色");
assert(game.hitAreas.length > 0, "浅滩节点应可点击查看经营数据");
let nodeDetailRoutes = 0;
let visitorTableRoutes = 0;
const openReserveDevelopmentNode = game.openReserveDevelopmentNode;
game.openReserveDevelopmentNode = (nodeId) => { nodeDetailRoutes += 1; return nodeId; };
game.openVisitorTable = () => { visitorTableRoutes += 1; return true; };
game.hitAreas[0].onTap();
assert.strictEqual(nodeDetailRoutes, 1, "点击地图建筑本体必须先打开建筑等级与状态详情");
assert.strictEqual(visitorTableRoutes, 0, "游客主表应由地图上的游客角色入口打开，不能遮蔽建筑详情");
game.openReserveDevelopmentNode = openReserveDevelopmentNode;

game.screen = "home";
game.settlementModal = null;
game.patrolTaskModal = null;
game.infoDetailModal = null;
game.gesture = null;
const visitorStart = game.mapVisitorPlacements(restoredView).map((placement) => ({ x: placement.motion.x, y: placement.motion.y }));
let visitorMoved = false;
let visitorFrames = [];
for (let frame = 0; frame < 90; frame += 1) {
  game.anim.t += 160;
  visitorFrames = game.mapVisitorPlacements(restoredView);
  visitorFrames.forEach((placement, index) => {
    const start = visitorStart[index];
    if (start && Math.hypot(placement.motion.x - start.x, placement.motion.y - start.y) > .01) visitorMoved = true;
  });
}
assert(visitorMoved, "游客不能固定站在设施旁，应沿地图路径持续移动");
assert(visitorFrames.every((placement) => placement.motion.onWalkableRoute
  && placement.motion.x >= .04 && placement.motion.x <= .96
  && placement.motion.y >= .06 && placement.motion.y <= .98), "游客移动必须保持在地图可通行范围内");
const pausedVisitor = visitorFrames[0].motion;
game.infoDetailModal = { kind: "test" };
game.anim.t += 1200;
const pausedFrame = game.mapVisitorPlacements(restoredView)[0].motion;
assert.strictEqual(pausedFrame.x, pausedVisitor.x, "打开弹窗时游客移动应暂停，避免背景继续争夺注意力");
assert.strictEqual(pausedFrame.y, pausedVisitor.y, "打开弹窗时游客移动应暂停，避免背景继续争夺注意力");
game.infoDetailModal = null;
assert.notStrictEqual(game.visitorMapDialogue(restoredView, { nodeIndex: 0 }), game.visitorMapDialogue(restoredView, { nodeIndex: 7 }), "游客对白应随所在地图区域变化");

const uiBuildReserve = createReserveState();
const uiBuildFund = uiBuildReserve.fund;
game.state.world.reserve = uiBuildReserve;
game.width = 375;
game.height = 667;
game.ctx = fakeContext(375, 667);
game.openRiverShallowsDetail();
game.hitAreas = [];
game.drawInfoDetailModal();
assert.strictEqual(game.infoDetailModal.renderedLivingChoices.length, 3, "浅滩首层只能显示三个简明建设方向");
assert(game.infoDetailModal.renderedLivingChoices.every((choice) => choice.opensConfirmation), "点击首层方案必须先进入详情确认，而不能直接扣费");
assert(!game.infoDetailModal.renderedLivingChoices.some((choice) => choice.id === "night_water_patrol"), "临时巡护不应占用建设方案卡位");
assert.strictEqual(uiBuildReserve.fund, uiBuildFund, "打开和选择方案详情前不得扣除基金");
assert(game.openRiverShallowsChoiceConfirm("community_waterpoint"), "点击建设方向应打开二次确认弹窗");
assert.strictEqual(game.infoDetailModal.kind, "livingReserveChoiceConfirm", "建设详情必须使用独立确认层");
game.hitAreas = [];
game.drawInfoDetailModal();
assert.strictEqual(game.infoDetailModal.renderedChoiceConfirmRows.length, 5, "二次确认应解释方式、等级条件、变化、长期影响和资源");
assert(game.infoDetailModal.renderedChoiceConfirmRows.every((row) => row.text.length <= 44), "二次确认文案应保持精简，避免长段落挤压卡片");
assert.strictEqual(uiBuildReserve.fund, uiBuildFund, "阅读二次确认详情仍不得扣费");
game.confirmRiverShallowsPlan("community_waterpoint");
assert.strictEqual(riverShallowsView(uiBuildReserve, 1).phase, "operational", "界面建设入口不得停留在半施工态");
assert.strictEqual(uiBuildReserve.fund, uiBuildFund - 280, "界面建设入口只能扣费一次");


// Regression:活地图建设必须由具体沙盘任务弹窗推进，且成功建设后写入目标进度。
const taskDrivenReserve = createReserveState();
taskDrivenReserve.fund = 1200;
taskDrivenReserve.wildernessKnowledge = taskDrivenReserve.wildernessKnowledge || {};
taskDrivenReserve.wildernessKnowledge.tradeStock = Object.assign({}, taskDrivenReserve.wildernessKnowledge.tradeStock || {}, { reed_cord: 1, pinecone_humidity: 1 });
game.state.world.reserve = taskDrivenReserve;
game.state.world.goals = null;
game.screen = "collection";
game.infoDetailModal = null;
assert(game.executeGoalAction({ id: "development:river_shallows:build", recommendedAction: "facilityBuild", nodeId: "river_shallows", developmentTask: "build" }), "建设目标必须能路由到具体活地图节点");
assert.strictEqual(game.screen, "home", "建设目标应先回到沙盘");
assert.strictEqual(game.infoDetailModal.kind, "livingReserveNode", "活地图建设必须通过节点任务弹窗展开");
assert.strictEqual(game.infoDetailModal.nodeId, "river_shallows", "任务弹窗必须绑定具体地图节点");
const beforeGoalProgress = (((game.state.world.goals || {}).daily || {}).objectives || []).find((item) => item.kind === "economy");
assert(game.openRiverShallowsChoiceConfirm("community_waterpoint"), "节点任务弹窗应继续进入二次确认");
assert(game.confirmRiverShallowsPlan("community_waterpoint"), "确认建设应返回成功，避免按钮无反馈");
const afterGoalProgress = (((game.state.world.goals || {}).daily || {}).objectives || []).find((item) => item.kind === "economy");
assert(afterGoalProgress && afterGoalProgress.progress > ((beforeGoalProgress || {}).progress || 0), "活地图建成后必须推进目标系统，避免资源充足时再次循环同一任务");
assert.strictEqual(riverShallowsView(taskDrivenReserve, 1).phase, "operational", "任务驱动建设后节点必须进入运行态");


const listRouteReserve = createReserveState();
listRouteReserve.fund = 1200;
game.state.world.reserve = listRouteReserve;
game.width = 375;
game.height = 667;
game.ctx = fakeContext(375, 667);
game.hitAreas = [];
const oldFocusReserveDevelopmentNode = game.focusReserveDevelopmentNode.bind(game);
const oldOpenDevelopmentBuildingUpgrade = game.openDevelopmentBuildingUpgrade.bind(game);
let listFocusCount = 0;
let listDirectModalCount = 0;
game.focusReserveDevelopmentNode = (nodeId, openTask) => { listFocusCount += 1; assert.strictEqual(openTask, false, "游客建筑列表只能定位沙盘，不能直接打开建设弹窗"); return nodeId; };
game.openReserveDevelopmentNode = () => { listDirectModalCount += 1; return true; };
game.openDevelopmentBuildingUpgrade = () => { throw new Error("游客建筑列表不得直接打开升级弹窗"); };
game.drawDiscoveryVisitors(fakeContext(375, 667), 20);
assert(game.renderedVisitorTable.buildingCards.length > 0, "游客建筑列表必须保留建筑状态展示");
assert(game.renderedVisitorTable.buildingCards.every((card) => card.routeMode === "sandbox-task-location" && card.directBuild === false), "游客建筑列表必须标记为沙盘任务定位入口");
assert(game.renderedVisitorTable.buildingCards.every((card) => !/[建设升级]/.test(`${card.primaryLabel}${card.secondaryLabel}`)), "游客建筑列表不得再显示直接建设/升级按钮");
const beforeHits = game.hitAreas.slice();
const mailboxBottom = game.renderedVisitorMailboxEntry.y + game.renderedVisitorMailboxEntry.h - (game.scrollY || 0);
const buildingHit = beforeHits.find((hit) => hit.y >= mailboxBottom && hit.w > 70 && hit.h >= 24);
assert(buildingHit, "邮箱下方应保留游客建筑入口");
buildingHit.onTap();
assert(listFocusCount >= 1, "点击游客建筑列表应定位沙盘任务");
assert.strictEqual(listDirectModalCount, 0, "点击游客建筑列表不得绕过沙盘直接打开建设详情");
game.focusReserveDevelopmentNode = oldFocusReserveDevelopmentNode;
game.openReserveDevelopmentNode = openReserveDevelopmentNode;
game.openDevelopmentBuildingUpgrade = oldOpenDevelopmentBuildingUpgrade;

const uiLegacyReserve = createReserveState();
selectRiverShallowsPlan(uiLegacyReserve, "community_waterpoint", 1);
const uiLegacyFund = uiLegacyReserve.fund;
game.state.world.reserve = uiLegacyReserve;
game.openRiverShallowsDetail();
assert.strictEqual(riverShallowsView(uiLegacyReserve, 1).phase, "operational", "打开旧版半施工节点时应自动恢复完成态");
assert.strictEqual(uiLegacyReserve.fund, uiLegacyFund, "界面恢复旧施工不得再次扣费");

game.state.world.reserve = restored;

[320, 375, 430].forEach((width) => {
  const height = width === 320 ? 568 : width === 375 ? 667 : 932;
  game.width = width;
  game.height = height;
  game.ctx = fakeContext(width, height);
  game.infoDetailModal = null;
  game.openRiverShallowsDetail();
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const frame = game.infoDetailModal.renderedInfoFrame;
  assert(frame && frame.y >= 0 && frame.y + frame.h <= height, `${width}: 游客数据面板不得超出屏幕`);
  assert(game.infoDetailModal.renderedVisitorStats, `${width}: 运行态必须显示游客、收入、惊扰和麻烦数据`);
});

const temporaryReserve = createReserveState();
const temporary = selectRiverShallowsPlan(temporaryReserve, "night_water_patrol", 1);
assert(temporary.ok && temporary.phase === "managed", "非建设方案应直接进入临时治理态");
assert.strictEqual(temporaryReserve.supplies.fieldKit, 0, "临时巡护应消耗现有野外工具包");
assert.strictEqual(riverShallowsView(temporaryReserve, 2).phase, "available", "临时巡护次日必须结束，不能永久锁住建设选择");

const personalReserve = createReserveState();
assert.strictEqual(RESERVE_DEVELOPMENT_NODES.length, 4, "活地图首版应包含浅滩、草场、边界和高地四个建设节点");
assert(RESERVE_DEVELOPMENT_NODES.every((node) => (RESERVE_DEVELOPMENT_CHOICES[node.id] || []).filter((choice) => choice.kind === "building").length === 3), "每个节点都应提供动物、游客、经营三条互斥建设路线");
const meadowFund = personalReserve.fund;
const meadowBuilt = buildReserveDevelopmentPlan(personalReserve, "meadow_edge", "community_seed_field", 2);
assert(meadowBuilt.ok && meadowBuilt.phase === "operational", "草场经营路线应一次确认后建成");
assert.strictEqual(personalReserve.fund, meadowFund - 260, "草场建设只能扣除一次基金");
assert.strictEqual(reserveDevelopmentNodeView(personalReserve, "river_shallows", 2).phase, "available", "建设草场不得替玩家同时决定浅滩路线");
assert.strictEqual(reserveDevelopmentNodeView(personalReserve, "meadow_edge", 2).choice.id, "community_seed_field", "每个节点必须独立保存玩家选择");
assert.strictEqual(buildReserveDevelopmentPlan(personalReserve, "meadow_edge", "native_grass_refuge", 2).ok, false, "同一节点只能保留一个长期方向");
personalReserve.wildernessKnowledge.tradeStock.track_cast = 1;
personalReserve.wildernessKnowledge.tradeStock.feather_wind_tag = 1;
assert(buildReserveDevelopmentPlan(personalReserve, "border_pass", "open_migration_gate", 2).ok, "生存材料应能直接转化为边界建设");
assert.strictEqual(personalReserve.wildernessKnowledge.tradeStock.track_cast, 0, "建设应消耗对应生存材料");
const wolfTarget = reserveDevelopmentAnimalTarget("狼", personalReserve, 2);
assert(wolfTarget && wolfTarget.nodeId === "border_pass", "边界建设应改变狼的地图活动目标");
const personalizedViews = reserveDevelopmentViews(personalReserve, 2);
assert.strictEqual(personalizedViews.filter((view) => view.phase === "operational").length, 2, "保护区应能同时运行不同路线的多个节点");
const personalizedFund = personalReserve.fund;
const personalizedSettlement = settleReserveDevelopmentDay(personalReserve, 3);
assert(personalizedSettlement && personalizedSettlement.byNode.length === 2, "每日游客结算应分别记录每个已运行节点");
assert.strictEqual(personalReserve.fund, personalizedFund + personalizedSettlement.income, "多节点游客收入应汇总且只入账一次");

game.state.world.reserve = personalReserve;
game.renderedLivingReserveNodes = [];
game.hitAreas = [];
personalizedViews.forEach((view) => game.drawLivingReserveNode(fakeContext(), camera, false, { view, interactive: true, visitorPlacements: [] }));
assert.strictEqual(game.renderedLivingReserveNodes.length, 4, "地图必须绘制四个独立建设节点");
assert.strictEqual(new Set(game.renderedLivingReserveNodes.map((node) => node.id)).size, 4, "多节点绘制不得互相覆盖状态标识");
assert(game.hitAreas.length >= 4, "每个活地图节点都应可点击查看与建设");

game.openReserveDevelopmentNode("forest_watch");
game.hitAreas = [];
game.drawInfoDetailModal();
assert.strictEqual(game.infoDetailModal.nodeId, "forest_watch", "节点详情必须保持当前高地身份");
assert.strictEqual(game.infoDetailModal.renderedLivingChoices.length, 3, "高地同样只显示三个清晰的长期方向");
assert(game.openReserveDevelopmentChoiceConfirm("forest_watch", "forest_listening_deck"), "高地方案应进入独立二次确认层");
assert.strictEqual(game.infoDetailModal.nodeId, "forest_watch", "二次确认不得错误回到河岸节点");

// 四个建筑拥有与巡护分开的升级和剧情任务层：升级扣维护基金，专属任务不消耗巡护次数。
const buildingReserve = createReserveState();
assert(buildReserveDevelopmentPlan(buildingReserve, "river_shallows", "community_waterpoint", 1).ok, "建筑经营测试应先完成一个长期建设方案");
const buildingFund = buildingReserve.fund;
const buildingBefore = require("../js/reserveDevelopment").developmentBuildingView(buildingReserve, "river_shallows", 1);
assert.strictEqual(buildingBefore.level, 0, "首次建成不应偷偷跳过建筑升级层");
const upgraded = require("../js/reserveDevelopment").upgradeDevelopmentBuilding(buildingReserve, "river_shallows", 1);
assert(upgraded.ok && upgraded.node.buildingLevel === 1, "建筑应能独立升级至 Lv.1");
assert.strictEqual(buildingReserve.fund, buildingFund - 220, "建筑升级应只扣除明确的升级基金");
assert(upgraded.building.maintenance > 0 && upgraded.building.visitorCapacity > 0, "升级后应显示维护成本和游客容量");
buildingReserve.development.nodes.river_shallows.buildingLevel = 1;
buildingReserve.progression.level = 1;
buildingReserve.development.operations.today.tourismScore = 0;
const blockedUpgrade = require("../js/reserveDevelopment").upgradeDevelopmentBuilding(buildingReserve, "river_shallows", 1);
assert(!blockedUpgrade.ok && blockedUpgrade.missing.length === 2, "下一阶升级必须同时提示保护区等级和游客等级门槛");
buildingReserve.progression.level = 2;
buildingReserve.development.operations.today.tourismScore = 12;
buildingReserve.fund = 1000;
const secondUpgrade = require("../js/reserveDevelopment").upgradeDevelopmentBuilding(buildingReserve, "river_shallows", 1);
assert(secondUpgrade.ok && secondUpgrade.node.buildingLevel === 2, "达到两项等级后才能进入下一阶升级");
const story = require("../js/reserveDevelopment").developmentBuildingStoryTask(buildingReserve, "river_shallows", 1);
assert(story.ready && story.independent && story.kind === "facilityStory", "建筑剧情应是独立任务而非巡护任务");
const storyDone = require("../js/reserveDevelopment").completeDevelopmentBuildingStory(buildingReserve, "river_shallows", 1);
assert(storyDone.ok && storyDone.businessChange.visitors > 0, "完成建筑剧情应提升游客贡献");
assert(storyDone.businessChange.fundDelta > 0 && storyDone.businessChange.operation === "调节水线", "建筑运营应把独立收益即时写入保护基金");
assert.strictEqual(buildingReserve.development.operations.today.recruitedVisitors, storyDone.businessChange.visitors, "建筑运营游客应即时进入今日客流");
const buildingSnap = require("../js/reserveDevelopment").reserveOperationsSnapshot(buildingReserve, 2);
assert(buildingSnap.buildingVisitors > 0 && buildingSnap.buildingIncome > 0 && buildingSnap.buildingMaintenance > 0, "建筑经营应同时暴露游客增量、收入和维护消耗");
game.state.world.reserve = buildingReserve;
game.openDevelopmentBuildingStory("river_shallows");
assert.strictEqual(game.infoDetailModal.kind, "developmentBuildingStory", "建筑剧情必须使用独立弹窗");
game.hitAreas = [];
game.drawInfoDetailModal();
assert(game.infoDetailModal.renderedBuildingRows.length === 4, "建筑剧情弹窗应把现场、任务、游客影响和状态分开呈现");
assert(game.infoDetailModal.kicker.includes("调节水线") && game.infoDetailModal.task.taskMode === "facilityOperation", "建筑弹窗应显示专属运营方式，不得回落到巡护任务模板");
game.openDevelopmentBuildingUpgrade("river_shallows");
assert.strictEqual(game.infoDetailModal.kind, "developmentBuildingUpgrade", "建筑升级必须使用独立弹窗");

const facilityOperations = RESERVE_DEVELOPMENT_NODES.map((config) => require("../js/reserveDevelopment").developmentBuildingStoryTask(buildingReserve, config.id, 1));
assert.strictEqual(new Set(facilityOperations.map((task) => task.operation)).size, 4, "四个建筑必须拥有四种不同的运营任务");
assert(facilityOperations.every((task) => task.taskMode === "facilityOperation" && !/巡护|守护/.test(task.operation)), "建筑运营任务不得复用巡护或守护流程");

delete global.wx;
console.log(`reserve development check ok (${RESERVE_DEVELOPMENT_NODES.length} living nodes, visitors, ledger, animal routes, responsive modal)`);
