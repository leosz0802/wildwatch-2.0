const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");
const { Game } = require("../js/game");

const state = {
  world: createInitialWorld(),
  character: {
    id: "warden",
    role: "warden",
    animalId: "warden",
    species: "卫士",
    animalName: "保护区卫士",
    location: "中央混交林",
    stamina: 82,
    health: 92,
    status: "alive",
    statusText: "正常"
  },
  reports: [],
  messages: []
};

const before = JSON.parse(JSON.stringify(state.world.reserve));
const result = simulateDay("带猎犬队驱赶西部岩坡洞域的偷猎者", state);
const after = result.world.reserve;
const settlement = result.world.reserveView && result.world.reserveView.settlement;

if (!settlement || !settlement.statLine || !settlement.animalLine || !settlement.tomorrowRiskLine) {
  throw new Error("reserveView settlement should expose three causality lines");
}
if (/水源指数|偷猎压力|迁移指数/.test([settlement.statLine, settlement.animalLine, settlement.tomorrowRiskLine].join(" "))) {
  throw new Error("settlement causality should not use old backend metric labels");
}

const game = Object.create(Game.prototype);
game.state = { world: result.world, character: result.character, reports: result.reports, messages: [] };
game.speakingAnimalId = (result.world.knownCharacters[0] || {}).id;
const modal = game.buildPatrolSettlement(before, after, result, "驱赶偷猎者");

if (!modal.causality || modal.causality.statLine !== settlement.statLine) {
  throw new Error("settlement modal should use reserveView causality");
}

const display = game.settlementDisplayChanges({
  causality: modal.causality,
  guardianScore: 91,
  scoreDelta: 36,
  fundBefore: 900,
  fundAfter: 940,
  stats: [
    { label: "安全指数", before: 62, after: 80, delta: 18 },
    { label: "偷猎压力", before: 31, after: 12, delta: -19, inverse: true },
    { label: "水源指数", before: 64, after: 68, delta: 4 }
  ]
});
if (!display.primary || display.primary.key !== "fund" || display.secondary.length !== 3) {
  throw new Error("settlement should promote the core fund change and keep ecology as its supporting causes");
}
if (game.settlementChangeTone(display.secondary.find((item) => item.label === "偷猎压力")).beneficial !== true) {
  throw new Error("falling poacher pressure must use positive semantics");
}

const crisisFixtures = [
  { title: "疾病扩散至多个区域", reason: { label: "病味扩散", action: "houndScout" }, expected: "houndScout", button: "去猎犬侦察" },
  { title: "偷猎团伙突破边界", reason: { label: "陌生脚印升级", action: "antiPoacher" }, expected: "antiPoacher", button: "去驱赶偷猎" },
  { title: "旱季水线断裂", reason: { label: "水线变紧", action: "habitat" }, expected: "habitat", button: "去修复水草" },
  { title: "种群取食失衡", reason: { label: "种群失衡", action: "intervention" }, expected: "intervention", button: "去生态干预" }
];
crisisFixtures.forEach((fixture) => {
  const crisis = game.settlementCrisisAction({
    title: fixture.title,
    breakthrough: { kind: "emergency_failed", kicker: "事件失控", title: fixture.title },
    causality: { reasons: [fixture.reason] }
  });
  if (!crisis || crisis.actionId !== fixture.expected || crisis.buttonLabel !== fixture.button) {
    throw new Error(`crisis settlement should route ${fixture.title} to ${fixture.button}`);
  }
});

let routedAction = "";
const crisisRouteGame = Object.create(Game.prototype);
crisisRouteGame.settlementModal = {
  breakthrough: { kind: "emergency_failed", kicker: "事件失控", title: "疾病扩散至多个区域" }
};
crisisRouteGame.pendingEmotionEvent = null;
crisisRouteGame.pendingEmotionEvents = [];
crisisRouteGame.openReserveViewAction = (actionId) => { routedAction = actionId; };
crisisRouteGame.toast = () => {};
crisisRouteGame.finishSettlementToCrisisAction("houndScout");
if (routedAction !== "houndScout" || crisisRouteGame.settlementModal !== null) {
  throw new Error("crisis primary button should close the result and open the real patrol task");
}

const commerce = game.settlementDisplayChanges({ commerce: { count: 2 }, fundBefore: 1000, fundAfter: 1230, guardianScore: 70, scoreDelta: 2, stats: [] });
if (!commerce.primary || commerce.primary.label !== "保护基金" || commerce.primary.delta !== 230) {
  throw new Error("sale settlement should promote the exact fund change");
}
const exploration = game.settlementDisplayChanges({ materialExploration: { reward: { id: "trap", label: "陷阱证据", amount: 2 } }, fundBefore: 1000, fundAfter: 1000, stats: [] });
if (!exploration.primary || exploration.primary.label !== "陷阱证据" || exploration.primary.customValue !== "×2") {
  throw new Error("exploration settlement should name the concrete collected item");
}
const recovery = game.settlementDisplayChanges({ recoveredGoodsGain: { items: [{ id: "antler", label: "A级鹿角", amount: 1 }] }, fundBefore: 1000, fundAfter: 1000, stats: [] });
if (!recovery.primary || recovery.primary.label !== "A级鹿角" || recovery.primary.customValue !== "×1") {
  throw new Error("recovery settlement should promote the exact recovered item");
}

const animationStart = game.settlementChangeProgress({ valueRevealAt: 1000 }, 1000);
const animationMiddle = game.settlementChangeProgress({ valueRevealAt: 1000 }, 1300);
const animationEnd = game.settlementChangeProgress({ valueRevealAt: 1000 }, 1600);
const middleMetric = game.settlementAnimatedMetric({ before: 31, after: 12, delta: -19 }, animationMiddle);
const endMetric = game.settlementAnimatedMetric({ before: 31, after: 12, delta: -19 }, animationEnd);
if (animationStart !== 0 || !(animationMiddle > 0 && animationMiddle < 1) || animationEnd !== 1 || !(middleMetric.after < 31 && middleMetric.after > 12) || endMetric.after !== 12 || endMetric.delta !== -19) {
  throw new Error("settlement number animation must have a real middle frame and land exactly on stored values at 600ms");
}

console.log("settlement causality check ok");
