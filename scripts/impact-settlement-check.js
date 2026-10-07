const { Game } = require("../js/game");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = Object.create(Game.prototype);
game.screen = "home";
game.trackNarrative = () => {};
game.mapPatrolReplay = null;

const base = {
  fundBefore: 500,
  fundAfter: 500,
  scoreDelta: 0,
  stats: [
    { key: "water", label: "水源", before: 60, after: 61, delta: 1 },
    { key: "grass", label: "草场", before: 60, after: 61, delta: 1 },
    { key: "safety", label: "安全", before: 60, after: 61, delta: 1 },
    { key: "animalTotal", label: "动物数量", before: 20, after: 21, delta: 1 }
  ]
};

const quiet = game.configureSettlementReveal(Object.assign({}, base), "home");
assert(quiet.silent === true, "small settlement changes should stay silent");
assert(quiet.autoFinishAt === 0, "unpresented settlements must not wait on a hidden timer");

for (const actionType of ["houndScout", "antiPoacher", "habitat", "intervention"]) {
  for (const storyReplay of [false, true]) {
    game.settlementModal = Object.assign({}, base, { actionType, storyReplay, grade: "B" });
    game.activeTaskLock = { id: actionType };
    const result = game.configureSettlementReveal(game.settlementModal, "home");
    assert(!result.impactSummary.major, "fixture must exercise small changes, not a breakthrough");
    assert(result.silent === true, `${actionType}: B/C patrol results should stay silent`);
    assert(result.autoFinishAt === 0, `${actionType}: mid-grade results must not keep a waiting flow`);
    assert(game.settlementModal === null, `${actionType}: B/C must drop the settlement object`);
    assert(game.activeTaskLock === null, `${actionType}: B/C must release the task lock`);
    assert(game.settlementOccupiesFlow() === false, `${actionType}: B/C must not occupy later tasks`);
  }
}

const gradeA = game.configureSettlementReveal(Object.assign({}, base, { actionType: "houndScout", grade: "A" }), "home");
assert(gradeA.silent === true, "grade A patrol results should stay silent");
assert(gradeA.autoFinishAt === 0, "grade A patrol results must not wait for acknowledgement");
const gradeS = game.configureSettlementReveal(Object.assign({}, base, { actionType: "houndScout", grade: "S" }), "home");
assert(gradeS.silent === false, "grade S should still show the settlement card");
assert(gradeS.autoFinishAt === undefined, "grade S must wait for acknowledgement");

const nightQuiet = game.configureSettlementReveal(Object.assign({}, base, {
  actionType: "habitat",
  grade: "B",
  guardianNight: { day: 10, eventResult: { title: "浅滩回声" } },
  title: "第10日守护结束"
}), "home");
assert(nightQuiet.silent === true, "ordinary guardian-night B/C cards should not interrupt");

const nightAlert = game.configureSettlementReveal(Object.assign({}, base, {
  actionType: "habitat",
  grade: "A",
  guardianNight: { day: 10, eventResult: { title: "浅滩回声" } }
}), "home");
assert(nightAlert.silent === true, "ordinary guardian-night A cards should stay silent");

const ecologyQuiet = game.configureSettlementReveal(Object.assign({}, base, {
  actionType: "habitat",
  grade: "B",
  breakthrough: { kind: "ecology_weather", title: "寒雾", body: "浅滩回声" }
}), "home");
assert(ecologyQuiet.silent === true, "routine ecology beats should not force a B/C settlement card");

const thresholdCases = [
  Object.assign({}, base, { fundAfter: 580 }),
  Object.assign({}, base, { scoreDelta: 3 }),
  Object.assign({}, base, { stats: base.stats.map((item) => item.key === "water" ? Object.assign({}, item, { after: 64, delta: 4 }) : item) }),
  Object.assign({}, base, { stats: base.stats.map((item) => item.key === "animalTotal" ? Object.assign({}, item, { after: 24, delta: 3 }) : item) })
];
thresholdCases.forEach((modal, index) => {
  const result = game.configureSettlementReveal(Object.assign({}, modal, { grade: "B" }), "home");
  assert(result.silent === true, `mid-grade numeric case ${index} should stay silent`);
});

const explorationB = Object.assign({}, base, {
  grade: "B",
  materialExploration: { reward: { id: "quiet_mark", label: "安静水标", amount: 1 } }
});
game.settlementModal = explorationB;
game.activeTaskLock = { id: "exploreMaterials" };
game.configureSettlementReveal(explorationB, "home");
assert(explorationB.silent === true, "B-grade exploration finds must stay silent");
assert(game.settlementModal === null, "B-grade exploration must drop the settlement flow, not hide a waiting card");
assert(game.activeTaskLock === null, "B-grade exploration must release the task lock immediately");
assert(game.settlementOccupiesFlow() === false, "B-grade exploration must not occupy later tasks");
game.state = { character: { id: "warden" } };
game.chapterStoryModal = null;
game.patrolTaskModal = null;
game.infoDetailModal = null;
assert(game.canPresentSandboxEvent() === true, "after a silent B/C find, other sandbox tasks must be able to start");

const explorationA = game.configureSettlementReveal(Object.assign({}, base, {
  grade: "A",
  materialExploration: { reward: { id: "quiet_mark", label: "安静水标", amount: 1 } }
}), "home");
assert(explorationA.silent === true, "exploration grade A must stay silent");
const explorationS = game.configureSettlementReveal(Object.assign({}, base, {
  grade: "S",
  materialExploration: { reward: { id: "quiet_mark", label: "安静水标", amount: 1 } }
}), "home");
assert(explorationS.silent === false, "exploration grade S should still show the settlement card");

const screenshotLikeExploration = { roll: 5, qualityScore: 6, quality: "常见", reward: { id: "quiet_mark", label: "安静水标", amount: 1 } };
assert(game.materialExplorationSettlementGrade(screenshotLikeExploration, "C") === "A", "roll 5 / total 6 exploration should still be graded A");
const screenshotLikeModal = Object.assign({}, base, {
  grade: game.materialExplorationSettlementGrade(screenshotLikeExploration, "C"),
  materialExploration: screenshotLikeExploration
});
const screenshotLikeResult = game.configureSettlementReveal(screenshotLikeModal, "home");
assert(screenshotLikeResult.silent === true, "A-grade exploration like the screenshot must not show a popup");
const sRankExploration = { roll: 6, qualityScore: 10, quality: "罕见", reward: { id: "rare_mark", label: "稀有水标", amount: 3 } };
assert(game.materialExplorationSettlementGrade(sRankExploration, "C") === "S", "quality score 10 exploration should be graded S");
const sRankResult = game.configureSettlementReveal(Object.assign({}, base, {
  grade: game.materialExplorationSettlementGrade(sRankExploration, "C"),
  materialExploration: sRankExploration
}), "home");
assert(sRankResult.silent === false, "S-grade exploration should still show the popup");

const explorationD = Object.assign({}, base, {
  grade: "D",
  materialExploration: { reward: { id: "quiet_mark", label: "安静水标", amount: 1 } }
});
game.settlementModal = explorationD;
game.activeTaskLock = { id: "exploreMaterials" };
game.configureSettlementReveal(explorationD, "home");
assert(explorationD.silent === true, "D-grade exploration must settle silently");
assert(game.settlementModal === null, "D-grade exploration must not leave a hidden card");
assert(game.activeTaskLock === null, "D-grade exploration must release the task lock");

const commerceB = game.configureSettlementReveal(Object.assign({}, base, {
  grade: "C",
  commerce: { count: 1, value: 80, fundingLabel: "研究补助" }
}), "home");
assert(commerceB.silent === true, "B/C commerce cards must stay silent");

const presentCases = [
  Object.assign({}, base, { goalDone: true, grade: "B" }),
  Object.assign({}, base, { breakthrough: { kind: "emergency_started", title: "洪水", body: "河岸上涨" }, grade: "B" }),
  Object.assign({}, base, { dailyFullClear: true, grade: "C" }),
  Object.assign({}, base, { chapterTransition: { from: 1, to: 2 }, grade: "C" })
];
presentCases.forEach((modal, index) => {
  const result = game.configureSettlementReveal(modal, "home");
  assert(result.silent === false, `important case ${index} should still show the impact card`);
});

const changes = game.settlementDisplayChanges({
  fundBefore: 100,
  fundAfter: 200,
  scoreDelta: 4,
  guardianScore: 44,
  stats: [
    { key: "fund", label: "保护基金", before: 100, after: 200, delta: 100 },
    { key: "water", label: "水源", before: 60, after: 64, delta: 4 },
    { key: "grass", label: "草场", before: 60, after: 65, delta: 5 },
    { key: "safety", label: "安全", before: 60, after: 66, delta: 6 },
    { key: "animalTotal", label: "动物数量", before: 20, after: 25, delta: 5 }
  ]
});
assert(changes.secondary.length === 3, "impact card should keep at most three secondary changes");

console.log("impact settlement check ok");
