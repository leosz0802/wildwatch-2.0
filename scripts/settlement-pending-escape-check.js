"use strict";

const assert = require("node:assert/strict");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { createReserveState } = require("../js/world");
const {
  buildReserveDevelopmentPlan,
  livingReserveFocusMetrics,
  reserveDevelopmentNodeView
} = require("../js/reserveDevelopment");

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ globalAlpha: 1, canvas: { width: 375, height: 667 } }, {
    get(target, property) {
      if (property === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (property === "createLinearGradient" || property === "createRadialGradient") return () => gradient;
      if (!target[property]) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
}

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, "结算逃生");
  game.screen = "home";
  game.ctx = fakeContext();
  game.width = 375;
  game.height = 667;
  game.requestRender = () => {};
  game.maybeShowInterstitialForSettlement = () => {};
  game.queueMissionPush = () => {};
  return game;
}

function pendingSettlement() {
  return {
    title: "采购完成",
    summary: "库存已更新。",
    returnScreen: "home",
    presentationScreen: "home",
    revealAt: Date.now() + 8000,
    speech: "先看库存。",
    speaker: "沉牙狼"
  };
}

function stockForBuild(reserve) {
  reserve.fund = 20000;
  reserve.supplies = Object.assign({
    dogFood: 10, alarm: 10, fieldKit: 10, evidenceTrap: 2
  }, reserve.supplies || {});
  reserve.wildernessKnowledge = reserve.wildernessKnowledge || {};
  reserve.wildernessKnowledge.tradeStock = Object.assign({
    reed_cord: 3,
    pinecone_humidity: 3,
    seedpod_alarm: 3,
    track_cast: 3,
    feather_wind_tag: 3
  }, reserve.wildernessKnowledge.tradeStock || {});
}

const game = makeGame();
let toast = "";
game.toast = (message) => { toast = String(message || ""); };

game.screen = "role";
game.settlementModal = pendingSettlement();
assert.equal(game.settlementOccupiesFlow(), true, "未展示结算仍占用流程");
assert.equal(game.settlementAwaitingPresentation(), true, "物资页上的结算只是待展示");
assert.equal(game.settlementBlocksCurrentScreen(), false, "待展示结算不能锁当前页");
assert.equal(game.overlayLocksBottomNav(), false, "待展示结算不能锁底栏");
assert.equal(game.sandboxTaskNavigationBlocked("home"), false, "待展示结算必须能回沙盘");
assert.equal(game.openPatrolOperationScreen("habitat"), false, "未看完结算不能开巡护");
assert.match(toast, /结算/, "拦截巡护必须提示结算");
assert.match(toast, /沙盘/, "拦截巡护必须指出回沙盘");
assert.equal(game.screen, "role", "提示后不能把人丢进空巡护页");
toast = "";
assert.equal(game.executeDailyEvent("any", "today"), false, "每日任务已删除，结算中也不能打开");
assert.equal(game.infoDetailModal, null);
toast = "";
assert.equal(game.openReserveViewAction("habitat", "sandbox-task"), false, "未看完结算不能开沙盘任务");
assert.match(toast, /结算/, "拦截沙盘任务必须提示结算");
assert.equal(game.setScreen("home"), true, "提示之后必须还能回沙盘");
assert.equal(game.screen, "home", "回沙盘后应停在沙盘");

game.screen = "home";
game.settlementModal = {
  title: "任务完成",
  presentationScreen: "home",
  speech: "看完再走。"
};
toast = "";
assert.equal(game.settlementPresentationActive(), true, "已亮出的结算应挡住当前沙盘");
assert.equal(game.overlayLocksBottomNav(), true, "已亮出的结算应锁底栏，避免关掉时点到页签");
assert.equal(game.setScreen("role"), false, "结算展示中不能切到物资");
assert.match(toast, /结算/, "离开沙盘必须提示先看完结算");
assert.equal(game.setScreen("home"), true, "结算展示中仍必须能留在沙盘");

const empty = makeGame();
empty.recommendedPatrolAction = () => null;
empty.selectedReserveAction = "";
empty.screen = "action";
empty.actionScreenOrigin = "home";
empty.hitAreas = [];
empty.drawPatrolExecuteBoard(empty.ctx, 12, 80, empty.width - 24, empty.state.world.reserve);
assert.equal(empty.renderedPatrolExecuteBoard.sandboxEscape, true, "空巡护板必须标出回沙盘出口");
const escape = empty.hitAreas.find((hit) => hit.hud && hit.w > 200 && hit.y > 80);
assert.ok(escape, "空巡护板的返回沙盘必须是 HUD 命中");
escape.onTap();
assert.equal(empty.screen, "home", "空巡护板必须能回到沙盘");

const stanceCases = [
  { node: "river_shallows", visitor: "visitor_boardwalk", animal: "reed_refuge", economy: "community_waterpoint", ecology: "水源" },
  { node: "meadow_edge", visitor: "meadow_story_trail", animal: "native_grass_refuge", economy: "community_seed_field", ecology: "草场" },
  { node: "border_pass", visitor: "guided_border_hide", animal: "open_migration_gate", economy: "shared_patrol_post", ecology: "安全" },
  { node: "forest_watch", visitor: "forest_listening_deck", animal: "canopy_quiet_zone", economy: "research_waystation", ecology: "疾病" }
];

stanceCases.forEach((entry) => {
  [
    ["visitor", entry.visitor, ["游客", "收入", "惊扰"], /游客\d+人 · 收入\+/, /升级后游客\+/, /游客：“/],
    ["animal", entry.animal, ["动物", entry.ecology, "惊扰"], /动物(停留|避开) · /, /低扰路线更稳/, /游客：“/],
    ["economy", entry.economy, ["经营收入", "协作到访", entry.ecology], /经营收入\+\d+ · 协作到访/, /升级后收入\+/, /游客：“/]
  ].forEach(([route, choiceId, labels, listPattern, supportPattern, touristQuote]) => {
    const reserve = createReserveState();
    stockForBuild(reserve);
    const built = buildReserveDevelopmentPlan(reserve, entry.node, choiceId, 1);
    assert.equal(built.ok, true, `${entry.node}/${choiceId} 应能建成`);
    const view = reserveDevelopmentNodeView(reserve, entry.node, 1);
    const focus = livingReserveFocusMetrics(view, reserve);
    assert.equal(focus.route, route, `${choiceId} 必须落到 ${route} 数据`);
    assert.deepEqual(focus.cards.map((card) => card.label), labels, `${choiceId} 卡片必须对应 ${route}`);
    assert.match(focus.listLine, listPattern, `${choiceId} 列表行必须对应 ${route}`);
    assert.match(focus.supportLine, supportPattern, `${choiceId} 维护行必须对应 ${route}`);
    if (route === "visitor") assert.match(focus.spoken, touristQuote, `${choiceId} 游客站位应保留游客口述`);
    else assert.doesNotMatch(focus.spoken, touristQuote, `${choiceId} ${route} 站位不得再套游客口述`);
    const painter = makeGame();
    painter.state.world.reserve = reserve;
    painter.openReserveDevelopmentNode(entry.node);
    painter.hitAreas = [];
    painter.drawInfoDetailModal();
    assert.equal(painter.screen, "home", `${choiceId} 落地必须留在沙盘`);
    assert.notEqual(painter.screen, "action", `${choiceId} 不得掉进本次巡护`);
    assert.equal(painter.infoDetailModal.kind, "livingReserveNode", `${choiceId} 应停在活地图节点`);
    assert.equal(painter.infoDetailModal.renderedVisitorStats.route, route, `${choiceId} 界面必须画 ${route} 数据`);
    assert.deepEqual(
      (painter.infoDetailModal.renderedVisitorStats.cards || []).map((card) => card.label),
      labels,
      `${choiceId} 界面卡片必须对应 ${route}`
    );
    assert.match(painter.infoDetailModal.renderedVisitorStats.spoken, route === "visitor" ? touristQuote : /./, `${choiceId} 现场摘要必须按站位书写`);
    if (route !== "visitor") {
      assert.doesNotMatch(painter.infoDetailModal.renderedVisitorStats.spoken, touristQuote, `${choiceId} 现场摘要不得再套游客口述`);
    }
    painter.hitAreas = [];
    painter.drawDiscoveryVisitors(painter.ctx, 80);
    const card = (painter.renderedVisitorTable.buildingCards || []).find((item) => item.id === entry.node);
    assert.ok(card, `${choiceId} 发现页必须画出建筑卡`);
    assert.equal(card.route, route, `${choiceId} 发现页必须落到 ${route}`);
    assert.match(card.listLine, listPattern, `${choiceId} 发现页数据必须对应 ${route}`);
    assert.match(card.supportLine, supportPattern, `${choiceId} 发现页维护行必须对应 ${route}`);
    painter.openDevelopmentBuildingUpgrade(entry.node);
    painter.hitAreas = [];
    painter.drawInfoDetailModal();
    const upgradeRow = (painter.infoDetailModal.renderedBuildingRows || [])[0] || {};
    assert.equal(upgradeRow.label, focus.upgradeCapacityLabel, `${choiceId} 升级卡必须对应 ${route}`);
    assert.match(String(upgradeRow.text || ""), route === "animal" ? /低扰/ : route === "economy" ? /协作/ : /接待/, `${choiceId} 升级正文必须对应 ${route}`);
    painter.openDevelopmentBuildingStory(entry.node);
    painter.hitAreas = [];
    painter.drawInfoDetailModal();
    const storyRow = (painter.infoDetailModal.renderedBuildingRows || []).find((row) => row.label === focus.storyRewardLabel);
    assert.ok(storyRow, `${choiceId} 运营卡必须出现 ${focus.storyRewardLabel}`);
    assert.match(String(storyRow.text || ""), route === "animal" ? /水源|草场|安全|疾病|栖息/ : route === "economy" ? /经营收入|协作到访/ : /本章游客/, `${choiceId} 运营收益必须对应 ${route}`);
    const placements = painter.mapVisitorPlacements(view);
    if (route === "animal" && view.animalUse) {
      assert.equal(placements.length, 0, `${choiceId} 动物停留时地图不得再堆游客`);
    } else if (route === "animal") {
      assert.ok(placements.length <= 2, `${choiceId} 动物站位游客精灵必须收束`);
    }
  });
});

const repair = makeGame();
repair.state.world.reserve.ecology.water = 20;
stockForBuild(repair.state.world.reserve);
assert.equal(buildReserveDevelopmentPlan(repair.state.world.reserve, "river_shallows", "visitor_boardwalk", 1).ok, true);
assert.equal(reserveDevelopmentNodeView(repair.state.world.reserve, "river_shallows", 1).condition, "damaged");
assert.equal(repair.openLivingReserveRepair("river_shallows"), true, "受损浅滩应就地打开修复");
assert.equal(repair.screen, "home", "修复不能把人丢进本次巡护");
assert.ok(repair.patrolTaskModal, "受损修复应打开栖息地任务卡");
assert.notEqual(repair.infoDetailModal && repair.infoDetailModal.kind, "livingReserveNode");

const blockedRepair = makeGame();
blockedRepair.settlementModal = pendingSettlement();
toast = "";
blockedRepair.toast = (message) => { toast = String(message || ""); };
assert.equal(blockedRepair.openLivingReserveRepair("river_shallows"), false, "未看完结算不能修建设施");
assert.match(toast, /结算/, "设施修复被拦截时必须提示结算");
assert.equal(blockedRepair.setScreen("home"), true, "设施修复被拦截后仍必须能回沙盘");

console.log("settlement pending escape check ok");
