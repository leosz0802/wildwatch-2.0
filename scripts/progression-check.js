const { createInitialWorld } = require("../js/world");
const { simulateDay, animalTrustTierFor, reserveProgressionFor } = require("../js/simulator");
const { Game } = require("../js/game");

let state = {
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
    statusText: "正常",
    skills: {},
    inventory: {}
  },
  reports: [],
  messages: []
};

const commands = [
  "猎犬侦察：让砾灰沿中央混交林闻一圈，重点找坏脚印",
  "修复水源和草场：把浅滩边的烂泥和枯草处理掉",
  "驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影"
];

const before = JSON.parse(JSON.stringify(state.world.reserve));
let latest = null;
commands.forEach((command) => {
  latest = simulateDay(command, state);
  state = {
    world: latest.world,
    character: latest.character,
    reports: state.reports.concat(latest.reports).slice(-12),
    messages: []
  };
});

const reserve = state.world.reserve;
if (!reserve.progression || !reserve.progression.title || reserve.progression.level < 1) {
  throw new Error("保护区等级没有生成");
}

const recomputed = reserveProgressionFor(reserve);
if (!recomputed.title || recomputed.level < 1) {
  throw new Error("保护区等级计算器异常");
}

const gated = createInitialWorld().reserve;
// This fixture isolates numeric/story progression. Rescue completion is covered
// by the chapter-rescue suites; keep the legacy gate bypass explicit here so
// the test does not accidentally depend on the starter rescue target.
gated.chapterRescue = Object.assign({}, gated.chapterRescue || {}, { enforceCompletion: false });
const stage = 2;
gated.safety = 100;
gated.stability = 100;
gated.reputation = 100;
gated.poacherPressure = 0;
gated.ecology.water = 100;
gated.ecology.grass = 100;
gated.progression = Object.assign({}, gated.progression || {}, {
  level: 1,
  stage,
  activeSeconds: 0,
  totalActions: 100,
  totalMeaningfulActions: 100,
  totalStrategicChoices: 20,
  totalMajorStrategicChoices: 10,
  totalFundEarned: 10000,
  totalMigratedIn: 1000,
  totalRareRecovered: 100,
  stageStart: { stage, level: 1, activeSeconds: 0, totalActions: 0, totalMeaningfulActions: 0, totalStrategicChoices: 0, totalMajorStrategicChoices: 0, totalFundEarned: 0, totalMigratedIn: 0, totalRareRecovered: 0 }
});
gated.eventChain = { chapterLevel: 1, step: 6, length: 7, completed: false };
if (reserveProgressionFor(gated).stage !== 2) throw new Error("second stage must not upgrade before all seven story beats are complete");
gated.eventChain = { chapterLevel: 1, step: 7, length: 7, completed: true };
if (reserveProgressionFor(gated).stage !== 2) throw new Error("legacy stage 2 must also respect the five-minute first-play gate");
gated.progression.activeSeconds = 300;

if (reserveProgressionFor(gated).stage !== 3 || reserveProgressionFor(gated).level !== 2) throw new Error("completed story chain and numeric goals should enter the next story chapter together");

// Both the full-goal route and the introductory shortcut require 300 seconds.
const firstStage = JSON.parse(JSON.stringify(gated));
// Bypass only the rescue requirement. enforceCompletion:false deliberately
// bypasses the legacy first-stage time gate too, so it cannot test that gate.
firstStage.chapterRescue.enforceCompletion = true;
firstStage.chapterRescue.legacyGateBypass = true;
firstStage.progression.stage = 1;
firstStage.progression.stageStart.stage = 1;
for (const seconds of [0, 179, 180, 240, 299, 299.99, 300, 301]) {
  firstStage.progression.activeSeconds = seconds;
  const result = reserveProgressionFor(firstStage);
  if (result.stage !== (seconds < 300 ? 1 : 2)) throw new Error(`full-goal first-stage gate failed at ${seconds}s`);
  if (seconds < 300 && !result.objectives.some(item => item.id === "expectedTime" && !item.optional && !item.complete)) throw new Error("time gate should be visible and required");
}
firstStage.progression.totalMeaningfulActions = 2;
firstStage.progression.totalActions = 2;
firstStage.progression.totalStrategicChoices = 1;
firstStage.progression.totalMajorStrategicChoices = 0;
firstStage.strategy = {};
firstStage.eventChain = { chapterLevel: 1, step: 1, length: 7, completed: false };
for (const seconds of [180, 299, 300]) {
  firstStage.progression.activeSeconds = seconds;
  if (reserveProgressionFor(firstStage).stage !== (seconds < 300 ? 1 : 2)) throw new Error(`intro shortcut gate failed at ${seconds}s`);
}

const completedFinal = JSON.parse(JSON.stringify(gated));
completedFinal.progression = Object.assign({}, completedFinal.progression, { stage: 14, level: 7, chapterComplete: true });
completedFinal.ecology.water = 5;
completedFinal.ecology.grass = 5;
completedFinal.ecology.disease = 95;
if (!reserveProgressionFor(completedFinal).chapterComplete) throw new Error("final completion must remain permanent after later ecology fluctuation");

if (!reserve.eventChain || reserve.eventChain.step !== 1 || !reserve.eventChain.current || !reserve.eventChain.lastResult) {
  throw new Error("阶段事件线应在首次有效行动后进入第一步，并在后续行动间保留停顿");
}
if (reserve.eventChain.advanced || !/事件暂歇|至少再完成|数据/.test(reserve.eventChain.waitingText || "")) {
  throw new Error("事件线没有给玩家留下操作间隔和数据等待期");
}

const npc = (state.world.knownCharacters || []).find((item) => item.relation && item.relation.trustTitle);
if (!npc) {
  throw new Error("动物信任等级没有写入 NPC 关系");
}

const tier = animalTrustTierFor((npc.relation && npc.relation.trust) || 40);
if (!tier.title || tier.progress < 0 || tier.progress > 1) {
  throw new Error("动物信任等级计算异常");
}

const game = Object.create(Game.prototype);
game.state = state;
game.speakingAnimalId = npc.id;

const timerGame = Object.create(Game.prototype);
timerGame.state = state;
timerGame.activePlayLastAt = 1000;
timerGame.activePlayDirtySeconds = -1000;
const activeBefore = timerGame.state.world.reserve.progression.activeSeconds || 0;
timerGame.recordActivePlay(61000, false);
if (Math.round((timerGame.state.world.reserve.progression.activeSeconds || 0) - activeBefore) !== 60) {
  throw new Error("active play timer should count engaged foreground time");
}
timerGame.recordActivePlay(361000, false);
if (Math.round((timerGame.state.world.reserve.progression.activeSeconds || 0) - activeBefore) !== 60) {
  throw new Error("idle gaps longer than three minutes must not count as active play time");
}

const afterSnapshot = game.reserveSnapshot(reserve);
const beforeSnapshot = game.reserveSnapshot(before);
const modal = game.buildPatrolSettlement(beforeSnapshot, afterSnapshot, latest, commands[commands.length - 1]);

if (!modal.progression || !modal.eventChain || !modal.rewards.some((line) => /剧情暂歇|剧情推进/.test(line))) {
  throw new Error("结算弹窗缺少章节指标或事件间隔反馈");
}

const trustUi = game.animalTrustTier(npc);
if (!trustUi.title) {
  throw new Error("动物信任等级 UI 缺少标题");
}

console.log("progression check ok");
