"use strict";

const assert = require("node:assert/strict");
const { createCharacter, saveState, loadState } = require("../js/storage");
const { buildGoalView } = require("../js/goalSystem");
const { CHAPTERS } = require("../js/animalWorld");
const { worldEventDefinition, WORLD_EVENT_DEFINITIONS } = require("../js/worldEventSystem");
const {
  resolveEcologyNarrativeEvent,
  applyEcologyNarrativeDecision,
  normalizeEcologyNarrative
} = require("../js/ecologyNarrativeSystem");
const {
  normalizeStrategyState,
  strategicDilemmaById,
  STRATEGIC_DILEMMAS
} = require("../js/strategySystem");
const {
  normalizeAnimalInteractionState,
  advanceAnimalInteractionStories,
  resolveAnimalInteraction,
  ANIMAL_INTERACTION_STORIES
} = require("../js/animalInteractionStories");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { promiseByChapter } = require("../js/guardianPromises");

const stored = new Map();
const findings = [];

function note(kind, label, detail) {
  findings.push({ kind, label, detail });
}

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (key === "canvas") return { width: 375, height: 812 };
      if (!target[key]) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 812, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }),
  getStorageSync: (key) => stored.has(key) ? JSON.parse(JSON.stringify(stored.get(key))) : null,
  setStorageSync: (key, value) => stored.set(key, JSON.parse(JSON.stringify(value))),
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require("../js/game");

const DELETED_ECOLOGY_IDS = [
  "rescue", "disperse", "corridor", "watch", "distance",
  "observe_route", "keep_distance", "natural_shift", "sanitary_clear", "ride_it_out"
];
const ECOLOGY_TYPES = [
  "predation", "disease", "overgrazing", "territorial", "birth",
  "migration", "juvenile_loss", "competition", "symbiosis", "weather"
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeGame(label, options = {}) {
  stored.clear();
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, label);
  if (options.onboardingDone !== false) {
    game.state.ui = Object.assign({}, game.state.ui || {}, {
      onboarding: { version: 2, completed: true, recruitmentDone: true, firstActionDone: true, seen: {} }
    });
    game.state.world.reserve.progression.totalActions = Math.max(4, Number(game.state.world.reserve.progression.totalActions) || 0);
  }
  const reserve = game.state.world.reserve;
  const chapter = options.chapter || 2;
  Object.assign(reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    level: CHAPTERS[Math.max(0, chapter - 1)].level
  });
  reserve.guardianCycle = Object.assign({}, reserve.guardianCycle || {}, { day: options.day || 6 });
  reserve.fund = options.fund == null ? 1800 : options.fund;
  reserve.supplies = Object.assign({
    dogFood: 12, alarm: 8, fieldKit: 8, medicalKit: 6, tranquilizer: 8
  }, options.supplies || reserve.supplies || {});
  reserve.ecology.water = 62;
  reserve.ecology.grass = 58;
  reserve.safety = 74;
  reserve.poacherPressure = 28;
  game.width = 375;
  game.height = 812;
  game.dpr = 1;
  game.screen = "home";
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = game.playArcheryImpact = () => {};
  game.prepareLocalAssetsForScreen = () => {};
  game.toast = (message) => { game.lastToast = message; };
  game.archeryScoreFor = () => 5;
  game.lockArcheryAim = () => {};
  game.animateInlineDiceRoll = (_modal, _roll, _token, done) => { if (typeof done === "function") done(); };
  game.interstitialAds = null;
  game.openQueuedMissionPush = () => false;
  return game;
}

function closeLayers(game) {
  if (game.settlementModal && typeof game.finishSettlement === "function") {
    try { game.finishSettlement("home"); } catch (_error) { game.settlementModal = null; }
  }
  if (typeof game.dismissInfoDetailModal === "function") {
    try { game.dismissInfoDetailModal(); } catch (_error) { game.infoDetailModal = null; }
  }
  game.infoDetailModal = null;
  game.patrolTaskModal = null;
  game.settlementModal = null;
  game.activeTaskLock = null;
  game.chapterStoryModal = null;
}

function finite(value, label) {
  assert(Number.isFinite(Number(value)), `${label} is not finite: ${value}`);
}

function assertHealthy(game, label) {
  const reserve = ((game.state || {}).world || {}).reserve;
  assert(reserve, `${label}: reserve disappeared`);
  finite(reserve.fund, `${label}.fund`);
  finite((reserve.ecology || {}).water, `${label}.water`);
  finite((reserve.ecology || {}).grass, `${label}.grass`);
  finite(reserve.safety, `${label}.safety`);
  assert(reserve.fund >= 0, `${label}: fund went negative`);
  assert((reserve.ecology.water || 0) >= 0, `${label}: water went negative`);
  assert((reserve.ecology.grass || 0) >= 0, `${label}: grass went negative`);
  finite(livingAnimalTotal(reserve), `${label}.livingAnimals`);
  JSON.stringify(game.state.world.reserve);
}

function seedWorldEvent(game, type) {
  const definition = worldEventDefinition(type);
  assert(definition, `missing event definition ${type}`);
  const reserve = game.state.world.reserve;
  reserve.emergency = reserve.emergency || {};
  reserve.emergency.active = Object.assign({
    id: `play_${type}`,
    type,
    progress: 0,
    daysRemaining: definition.days || 3
  }, definition, {
    responses: (definition.responses || []).map((item) => Object.assign({}, item))
  });
  return definition;
}

function realEventType() {
  return Object.keys(WORLD_EVENT_DEFINITIONS).find((type) => /^real_nature_/.test(type));
}

function seedEcology(game, type, extra = {}) {
  const reserve = game.state.world.reserve;
  reserve.ecologyNarrative = { pendingDecision: null, lastEvent: null, history: [], artifacts: {}, threads: {} };
  reserve.ecology.predators = Object.assign({ wolf: 4, bear: 2, lion: 2 }, reserve.ecology.predators || {});
  reserve.ecology.herbivores = Object.assign({ deer: 35, antelope: 24, zebra: 22, hare: 18, boar: 12 }, reserve.ecology.herbivores || {});
  reserve.ecology.birds = Object.assign({ crow: 5, vulture: 4 }, reserve.ecology.birds || {});
  if (type === "weather") {
    reserve.seasonState = Object.assign({}, reserve.seasonState || {}, { weather: extra.weather || "寒雾" });
  }
  if (type === "disease" || type === "juvenile_loss") reserve.ecology.disease = 32;
  const event = resolveEcologyNarrativeEvent(reserve, clone(reserve), Object.assign({
    day: extra.day || 6,
    dayClosed: true,
    forceType: type
  }, extra));
  assert(event, `ecology ${type} did not spawn`);
  return event;
}

function completeEcology(game, label) {
  closeLayers(game);
  assert(game.openPendingEcologyDecision(), `${label}: ecology decision did not open`);
  const modal = game.infoDetailModal;
  assert.equal(modal.kind, "ecologyNarrativeDecision", `${label}: wrong ecology modal`);
  assert.equal((modal.summaryItems || []).length, 2, `${label}: ecology decision should show two cards`);
  assert.equal((modal.choices || []).length, 1, `${label}: ecology is not single-choice`);
  const choice = modal.choices[0];
  choice.action();
  if (game.infoDetailModal && game.infoDetailModal.kind === "ecologyNarrativeDecision" && game.infoDetailModal.phase !== "result") {
    return { blocked: true, availability: game.infoDetailModal.availability, choiceId: choice.id };
  }
  assert.equal(game.infoDetailModal.kind, "ecologyNarrativeDecision", `${label}: outcome missing`);
  assert.equal(game.infoDetailModal.phase, "result", `${label}: outcome must stay on the same screen`);
  closeLayers(game);
  return { blocked: false, choiceId: choice.id };
}

function seedTactical(game, dilemmaId = "patrol_split") {
  const dilemma = strategicDilemmaById(dilemmaId);
  game.state.world.reserve.strategy = normalizeStrategyState({
    pendingDilemma: { id: dilemma.id, tier: dilemma.tier, day: 8, actionIndex: 8, chapter: 2 }
  });
  return dilemma;
}

function spawnAnimalStory(game) {
  const reserve = game.state.world.reserve;
  reserve.ecology.predators = Object.assign({ wolf: 4, lion: 2 }, reserve.ecology.predators || {});
  reserve.ecology.herbivores = Object.assign({ deer: 35, antelope: 24, zebra: 22 }, reserve.ecology.herbivores || {});
  reserve.ecology.water = Math.min(reserve.ecology.water || 62, 60);
  reserve.safety = Math.min(reserve.safety || 74, 40);
  reserve.animalInteractions = { version: 1, active: null, history: [], ignoredCount: 0, lastSpawnDay: 0, nextEligibleDay: 1 };
  normalizeAnimalInteractionState(reserve);
  let spawned = null;
  for (let day = 1; day < 40 && !spawned; day += 1) {
    const result = advanceAnimalInteractionStories(reserve, {}, { day });
    if (result && result.kind === "spawn") spawned = result;
  }
  assert(spawned && reserve.animalInteractions.active, "animal relationship did not spawn");
  return reserve.animalInteractions.active;
}

function runLinear() {
  const game = makeGame("顺序执行", { onboardingDone: false, chapter: 1 });
  game.state.world.reserve.progression.totalActions = 0;
  game.state.ui.onboarding = { version: 2, completed: false, seen: {} };
  closeLayers(game);
  assert(game.openFirstOnboardingChoice(), "linear: onboarding did not open");
  assert.equal((game.infoDetailModal.choices || []).length, 1, "linear: onboarding is not single-choice");
  assert.equal(game.infoDetailModal.choices[0].label, "侦察脚印", "linear: first action drifted");
  note("ok", "linear-onboarding", "新手只剩侦察脚印");
  closeLayers(game);

  const eventType = realEventType();
  seedWorldEvent(game, eventType);
  assert(game.openWorldEventDetail({
    type: "crisis",
    eventType,
    title: "真实事件"
  }, worldEventDefinition(eventType)), "linear: event detail did not open");
  assert.equal(game.infoDetailModal.actionLabel, "处理任务", "linear: event is not a single 处理任务");
  assert.equal((game.infoDetailModal.choices || []).length, 0, "linear: event still exposes competing buttons");
  game.infoDetailModal.action();
  assert.equal(game.infoDetailModal.kind, "neighborEventDice", "linear: event did not enter archery");
  const eventResult = game.resolveNeighborEventDice();
  assert(eventResult && Number.isFinite(eventResult.roll), "linear: event archery did not settle");
  closeLayers(game);
  assert.equal(!!((((game.state.world.reserve || {}).emergency || {}).active)), false, "linear: event remained after success");
  note("ok", "linear-event", `${eventType} 详情→射箭→清除`);
  assertHealthy(game, "linear-after-event");

  const ecology = seedEcology(game, "predation");
  const ecologyResult = completeEcology(game, "linear-ecology");
  assert.equal(ecologyResult.blocked, false, "linear: free predation action was blocked");
  assert.equal(ecologyResult.choiceId, ecology.choices[0].id, "linear: ecology executed a hidden second route");
  note("ok", "linear-ecology", `捕食只执行 ${ecologyResult.choiceId}`);
  assertHealthy(game, "linear-after-ecology");

  const dilemma = seedTactical(game);
  assert.equal(dilemma.choices.length, 1, "linear: tactical catalog is not single-choice");
  assert(game.openPendingStrategicDilemma(), "linear: tactical did not open");
  assert.equal((game.infoDetailModal.choiceCards || []).length, 1, "linear: tactical UI is not single-choice");
  const tacticalId = game.infoDetailModal.choiceCards[0].id;
  game.selectStrategicDilemmaChoice(dilemma.id, tacticalId);
  game.confirmStrategicChoice(dilemma.id, tacticalId);
  closeLayers(game);
  note("ok", "linear-tactical", `战术抉择只确认 ${tacticalId}`);
  assertHealthy(game, "linear-after-tactical");

  const active = spawnAnimalStory(game);
  assert.equal((active.choices || []).length, 1, "linear: spawned animal story is not single-choice");
  closeLayers(game);
  game.infoDetailModal = game.buildAnimalInteractionModal(active);
  assert.equal(game.infoDetailModal.choices.length, 1, "linear: animal UI is not single-choice");
  assert(game.resolveAnimalInteractionStory(game.infoDetailModal.selectedChoiceId), "linear: animal story did not resolve");
  assert.equal(game.infoDetailModal.phase, "result", "linear: animal result missing");
  closeLayers(game);
  note("ok", "linear-animal", `动物关系只执行 ${active.choices[0].id}`);
  assertHealthy(game, "linear-after-animal");

  const promise = promiseByChapter(1);
  assert(promise && promise.choices.length >= 3, "linear: guardian promise must stay 3-choice");
  const major = STRATEGIC_DILEMMAS.find((item) => item.id === "water_access");
  assert(major && major.choices.length === 3, "linear: major strategy must stay 3-choice");
  note("ok", "linear-kept-branches", "守护承诺/重大战略仍保留多选");
}

function runJump() {
  const game = makeGame("跳跃执行", { chapter: 3 });
  seedEcology(game, "competition");
  closeLayers(game);
  assert(game.openPendingEcologyDecision(), "jump: ecology did not open");
  const pendingId = normalizeEcologyNarrative(game.state.world.reserve.ecologyNarrative).pendingDecision.id;
  closeLayers(game);
  const option = (game.reserveActionOptions() || []).find((item) => item.id === "habitat");
  if (option) {
    game.openPatrolTaskModal(option);
    closeLayers(game);
  }
  game.setScreen("role");
  game.setScreen("home");
  const pendingAfterDetour = normalizeEcologyNarrative(game.state.world.reserve.ecologyNarrative).pendingDecision;
  assert(pendingAfterDetour && pendingAfterDetour.id === pendingId, "jump: ecology pending was lost after a patrol detour");
  if (!(game.infoDetailModal && game.infoDetailModal.kind === "ecologyNarrativeDecision")) {
    closeLayers(game);
    assert(game.openPendingEcologyDecision(), "jump: ecology pending survived but could not reopen");
  }
  assert.equal((game.infoDetailModal.choices || []).length, 1, "jump: ecology grew extra choices after detour");
  completeEcology(game, "jump-ecology-resume");
  note("ok", "jump-ecology-detour", "先关生态、去做巡护，回来仍能单选完成");
  assertHealthy(game, "jump-after-ecology");

  const eventType = realEventType();
  seedWorldEvent(game, eventType);
  assert(game.openWorldEventDetail({ type: "crisis", eventType, title: "紧急！！" }, worldEventDefinition(eventType)));
  closeLayers(game);
  assert(((((game.state.world.reserve || {}).emergency || {}).active) || {}).type === eventType, "jump: closing event detail completed it");
  const view = buildGoalView(game.state, game.state.world.goals);
  const crisis = [view.primary].concat(view.alternatives || []).filter(Boolean).find((item) => item.kind === "crisis" || item.recommendedAction === "realEvent");
  if (crisis) {
    closeLayers(game);
    assert(game.executeGoalAction(crisis), "jump: current goal could not reopen the same event");
  } else {
    closeLayers(game);
    assert(game.openActiveWorldEventFromMap(), "jump: balloon/map could not reopen the same event");
  }
  game.infoDetailModal.action();
  game.resolveNeighborEventDice();
  closeLayers(game);
  assert.equal(game.openActiveWorldEventFromMap(), false, "jump: resolved event reopened");
  note("ok", "jump-event-reentry", "详情关掉后可从当前目标/地图再进，结算后不能重复打");
  assertHealthy(game, "jump-after-event");

  seedTactical(game, "patrol_split");
  assert(game.openPendingStrategicDilemma(), "jump: tactical did not open");
  assert.equal(game.openPendingEcologyDecision(), false, "jump: a second decision opened on top of tactical");
  closeLayers(game);
  seedEcology(game, "symbiosis");
  assert(game.openPendingEcologyDecision(), "jump: ecology after dismissing tactical failed");
  completeEcology(game, "jump-after-tactical");
  note("ok", "jump-modal-mutex", "未确认的战术抉择会挡住生态，关掉后才能继续");
  assertHealthy(game, "jump-after-mutex");

  const active = spawnAnimalStory(game);
  closeLayers(game);
  game.infoDetailModal = game.buildAnimalInteractionModal(active);
  closeLayers(game);
  assert(game.state.world.reserve.animalInteractions.active, "jump: closing animal modal auto-resolved it");
  const expired = advanceAnimalInteractionStories(game.state.world.reserve, {}, {
    day: (active.expiresDay || 3) + 1
  });
  assert.equal(expired.kind, "auto", "jump: ignored animal story did not auto-worsen");
  note("ok", "jump-animal-ignore", "关掉动物关系不结算；过期后自动恶化");
  assertHealthy(game, "jump-after-animal-ignore");
}

function runDisruptive() {
  const game = makeGame("破坏式执行", { chapter: 4 });

  ECOLOGY_TYPES.forEach((type) => {
    const fresh = makeGame(`破坏-生态-${type}`, { chapter: 4 });
    const event = seedEcology(fresh, type, { weather: "寒雾" });
    assert.equal(event.choices.length, 1, `disrupt: ${type} still has two ecology routes`);
    DELETED_ECOLOGY_IDS.forEach((choiceId) => {
      const result = applyEcologyNarrativeDecision(fresh.state.world.reserve, event.id, choiceId);
      assert.equal(result.ok, false, `disrupt: deleted ecology ${type}/${choiceId} still settled`);
    });
    const remaining = event.choices[0].id;
    const applied = applyEcologyNarrativeDecision(fresh.state.world.reserve, event.id, remaining);
    assert.equal(applied.ok, true, `disrupt: remaining ecology ${type}/${remaining} failed with stocked resources`);
    const again = applyEcologyNarrativeDecision(fresh.state.world.reserve, event.id, remaining);
    assert.equal(again.ok, false, `disrupt: ecology ${type} settled twice`);
  });
  note("ok", "disrupt-deleted-ecology", "已删除的第二条生态路线全部失效，剩下的一条只能结算一次");

  seedTactical(game, "patrol_split");
  closeLayers(game);
  assert(game.openPendingStrategicDilemma(), "disrupt: tactical did not open");
  game.confirmStrategicChoice("patrol_split", "patrol_meadow");
  assert.equal(game.infoDetailModal.kind, "strategicDilemma", "disrupt: deleted tactical route still confirmed");
  assert(game.state.world.reserve.strategy.pendingDilemma, "disrupt: failed tactical confirm cleared the pending card");
  game.confirmStrategicChoice("patrol_split", "patrol_river");
  closeLayers(game);
  note("ok", "disrupt-deleted-tactical", "已删除的草场幼兽路线失效，原第一条仍可完成");
  assertHealthy(game, "disrupt-after-tactical");

  const active = spawnAnimalStory(game);
  const secondId = (ANIMAL_INTERACTION_STORIES.find((story) => story.id === active.storyId).choices || [])
    .map((choice) => choice.id)
    .find((id) => id !== active.choices[0].id);
  closeLayers(game);
  game.infoDetailModal = game.buildAnimalInteractionModal(active);
  const leaked = game.resolveAnimalInteractionStory(secondId);
  assert.equal(leaked, false, "disrupt: catalog second animal choice still resolved");
  assert(game.state.world.reserve.animalInteractions.active, "disrupt: leaked animal choice cleared the pending story");
  assert(game.resolveAnimalInteractionStory(active.choices[0].id), "disrupt: remaining animal choice failed");
  closeLayers(game);
  note("ok", "disrupt-deleted-animal", "目录里的第二条动物方案不能再被点出来");
  assertHealthy(game, "disrupt-after-animal");

  const weatherGame = makeGame("破坏-无工具包天气", { chapter: 2, supplies: { fieldKit: 0, medicalKit: 6, dogFood: 8 } });
  seedEcology(weatherGame, "weather", { weather: "热浪" });
  closeLayers(weatherGame);
  assert(weatherGame.openPendingEcologyDecision(), "disrupt: weather did not open");
  weatherGame.infoDetailModal.choices[0].action();
  const weatherAvailability = weatherGame.ecologyChoiceAvailability((weatherGame.infoDetailModal.choices || [])[0].id);
  assert.equal(weatherAvailability.available, false, "disrupt: weather shelter still looks free without a field kit");
  assert.equal(weatherGame.confirmEcologyNarrativeChoice(), false, "disrupt: weather confirmed without a field kit");
  assert.equal(weatherGame.infoDetailModal.kind, "ecologyNarrativeDecision", "disrupt: failed weather confirm closed the task");
  note("ok", "disrupt-weather-cost", "打开避险点缺工具包时不能偷偷结算");
  assertHealthy(weatherGame, "disrupt-weather-empty-kit");

  const broke = makeGame("破坏-零基金", { chapter: 3, fund: 0 });
  seedEcology(broke, "territorial");
  closeLayers(broke);
  assert(broke.openPendingEcologyDecision(), "disrupt: territorial did not open");
  broke.infoDetailModal.choices[0].action();
  assert.equal(broke.confirmEcologyNarrativeChoice(), false, "disrupt: buffer confirmed with 0 fund");
  closeLayers(broke);
  const option = (broke.reserveActionOptions() || []).find((item) => item.id === "houndScout");
  if (option) {
    broke.openPatrolTaskModal(option);
    closeLayers(broke);
  }
  assertHealthy(broke, "disrupt-zero-fund-still-playable");
  note("ok", "disrupt-zero-fund", "零基金挡下高成本单选后，仍能去巡护，不会把存档打穿");

  const spam = makeGame("破坏-连点事件", { chapter: 2 });
  const eventType = realEventType();
  seedWorldEvent(spam, eventType);
  assert(spam.openWorldEventDetail({ type: "crisis", eventType, title: "紧急！！" }, worldEventDefinition(eventType)));
  spam.infoDetailModal.action();
  const first = spam.resolveNeighborEventDice();
  const second = spam.resolveNeighborEventDice();
  assert(first && Number.isFinite(first.roll), "disrupt: first archery did not settle");
  assert.equal(second, false, "disrupt: double archery still paid out");
  closeLayers(spam);
  note("ok", "disrupt-double-archery", "同一事件连点射箭不会发两次奖");
  assertHealthy(spam, "disrupt-after-double-archery");

  const sticky = makeGame("破坏-过期按钮", { chapter: 2 });
  const stickyEvent = seedEcology(sticky, "predation");
  closeLayers(sticky);
  assert(sticky.openPendingEcologyDecision());
  const staleAction = sticky.infoDetailModal.choices[0].action;
  staleAction();
  assert.equal(sticky.infoDetailModal.kind, "ecologyNarrativeDecision", "disrupt: first ecology tap did not settle");
  assert.equal(sticky.infoDetailModal.phase, "result", "disrupt: ecology result left the original screen");
  const after = sticky.confirmEcologyNarrativeChoice();
  assert.equal(after, false, "disrupt: outcome screen accepted a second confirm");
  staleAction();
  assert.notEqual(sticky.infoDetailModal && sticky.infoDetailModal.kind, "ecologyNarrativeChoiceConfirm", "disrupt: stale ecology button rebuilt a live confirm");
  const staleApply = applyEcologyNarrativeDecision(sticky.state.world.reserve, stickyEvent.id, stickyEvent.choices[0].id);
  assert.equal(staleApply.ok, false, "disrupt: stale ecology id still wrote a second outcome");
  closeLayers(sticky);
  note("ok", "disrupt-stale-button", "结算后的旧按钮不能再写一次结果");
  assertHealthy(sticky, "disrupt-after-stale");

  const persist = makeGame("破坏-中途存档", { chapter: 2 });
  seedEcology(persist, "birth");
  closeLayers(persist);
  assert(persist.openPendingEcologyDecision());
  saveState(persist.state);
  const restored = loadState();
  persist.state = restored;
  closeLayers(persist);
  const restoredEvent = normalizeEcologyNarrative(persist.state.world.reserve.ecologyNarrative).pendingDecision;
  assert(restoredEvent && restoredEvent.choices.length === 1, "disrupt: save/load restored two ecology routes");
  completeEcology(persist, "disrupt-after-reload");
  note("ok", "disrupt-saveload", "确认前存档，读档后仍是单选且能完成");
  assertHealthy(persist, "disrupt-after-saveload");

  const poison = makeGame("破坏-脏数据", { chapter: 2 });
  poison.state.world.reserve.fund = Number.NaN;
  poison.state.world.reserve.ecology.water = Number.NaN;
  try {
    seedEcology(poison, "overgrazing");
    closeLayers(poison);
    poison.openPendingEcologyDecision();
    if (poison.infoDetailModal && poison.infoDetailModal.choices && poison.infoDetailModal.choices[0]) {
      poison.infoDetailModal.choices[0].action();
      poison.confirmEcologyNarrativeChoice();
    }
  } catch (error) {
    assert.fail(`disrupt: NaN reserve crashed ecology (${error.message})`);
  }
  poison.state.world.reserve.fund = 800;
  poison.state.world.reserve.ecology.water = 60;
  assertHealthy(poison, "disrupt-after-nan-repair");
  note("ok", "disrupt-nan", "脏数值没有把生态单选打崩，修好后还能继续玩");
}

function runInterleave() {
  const game = makeGame("穿插执行", { chapter: 3 });
  seedEcology(game, "migration");
  seedTactical(game, "water_pump");
  const eventType = realEventType();
  seedWorldEvent(game, eventType);
  spawnAnimalStory(game);

  closeLayers(game);
  assert(game.openWorldEventDetail({ type: "crisis", eventType, title: "紧急！！" }, worldEventDefinition(eventType)));
  assert.equal(game.openPendingEcologyDecision(), false, "interleave: ecology opened over a live event");
  assert.equal(game.openPendingStrategicDilemma(), false, "interleave: tactical opened over a live event");
  game.infoDetailModal.action();
  game.resolveNeighborEventDice();
  closeLayers(game);

  assert(game.openPendingEcologyDecision() || game.openPendingStrategicDilemma() || game.openPendingAnimalInteraction({ force: true }), "interleave: no pending work remained after the event");
  closeLayers(game);
  if (normalizeEcologyNarrative(game.state.world.reserve.ecologyNarrative).pendingDecision) {
    completeEcology(game, "interleave-ecology");
  }
  if ((game.state.world.reserve.strategy || {}).pendingDilemma) {
    closeLayers(game);
    assert(game.openPendingStrategicDilemma(), "interleave: leftover tactical did not reopen");
    const card = game.infoDetailModal.choiceCards[0];
    game.confirmStrategicChoice(game.infoDetailModal.dilemma.id, card.id);
    closeLayers(game);
  }
  if (game.state.world.reserve.animalInteractions && game.state.world.reserve.animalInteractions.active) {
    closeLayers(game);
    game.infoDetailModal = game.buildAnimalInteractionModal(game.state.world.reserve.animalInteractions.active);
    game.resolveAnimalInteractionStory(game.infoDetailModal.selectedChoiceId);
    closeLayers(game);
  }
  note("ok", "interleave-stack", "事件、生态、战术、动物关系叠在一起时，一次只打一张，打完还能把剩下的清掉");
  assertHealthy(game, "interleave-end");
}

runLinear();
runJump();
runDisruptive();
runInterleave();

const okCount = findings.filter((item) => item.kind === "ok").length;
console.log(`single-choice play path check ok (${okCount} outcomes)`);
findings.forEach((item) => {
  console.log(`- ${item.label}: ${item.detail}`);
});
