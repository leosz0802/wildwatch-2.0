const assert = require("assert");
const { createInitialWorld, createReserveState } = require("../js/world");
const { normalizeReserve } = require("../js/storage");
const { buildReserveView } = require("../js/reserveView");
const { resolveGoals } = require("../js/goalSystem");
const { updateReserveEmergency, advanceIdleEmergency } = require("../js/simulator");
const { REAL_NATURE_EVENTS } = require("../js/realNatureEventCatalog");
const {
  REAL_NATURE_EVENT_DEFINITIONS,
  REAL_NATURE_ARCHERY_THRESHOLD,
  realNatureEventForDate,
  realNatureTriggerType,
  realNatureImpactPair,
  applyRealNatureOutcome,
  futureTimelineText,
  chapterNeedsRequiredRealNature,
  markChapterRealNatureSeen
} = require("../js/realNatureEventSystem");
const {
  WORLD_EVENT_DEFINITIONS,
  OBSOLETE_GENERIC_NATURE_TYPES,
  worldEventTriggerType,
  worldEventIdleTriggerType,
  lateChapterRealNatureChance
} = require("../js/worldEventSystem");

assert.strictEqual(REAL_NATURE_EVENTS.length, 100, "exactly 100 reviewed real events must be available");
assert.strictEqual(new Set(REAL_NATURE_EVENTS.map((event) => event.id)).size, 100, "all real-event IDs must be unique");
for (const event of REAL_NATURE_EVENTS) {
  for (const key of ["id", "category", "title", "date", "dateKind", "place", "summary", "source", "url", "impact", "polarity", "drill", "metrics"]) {
    assert(String(event[key] || "").trim(), `${event.id || "event"} is missing ${key}`);
  }
  assert(/^https?:\/\//.test(event.url), `${event.id} needs a complete source URL`);
}

for (const type of OBSOLETE_GENERIC_NATURE_TYPES) {
  assert(!WORLD_EVENT_DEFINITIONS[type], `${type} must not remain in runtime definitions`);
}
assert(Object.keys(REAL_NATURE_EVENT_DEFINITIONS).length === REAL_NATURE_EVENTS.length, "every catalog item needs a runtime definition");
assert.strictEqual(futureTimelineText("2025-08-29"), "2030-08-29", "player-facing event dates must use the +5 year timeline");
assert.strictEqual(REAL_NATURE_EVENT_DEFINITIONS["real_nature_ocean-07"].date, "2030-08-29", "runtime definitions must shift dates without changing source data");
assert.strictEqual(REAL_NATURE_EVENTS.find((event) => event.id === "ocean-07").date, "2025-08-29", "audit catalog must keep the real source date");

const stableNow = Date.UTC(2026, 8, 19, 5);
const reserve = createReserveState();
assert(realNatureEventForDate(reserve, stableNow).id === realNatureEventForDate(reserve, stableNow + 3600e3).id, "Beijing-date rotation must be stable within one date");
assert.strictEqual(realNatureTriggerType(reserve, stableNow), null, "real events must wait 30 active seconds after entering a chapter");
reserve.progression.activeSeconds = (reserve.progression.chapterStart.activeSeconds || 0) + 30;
const selectedType = realNatureTriggerType(reserve, stableNow);
reserve.emergency.history = [{ type: selectedType, realEventId: realNatureEventForDate(reserve, stableNow).id }];
assert(realNatureTriggerType(reserve, stableNow) !== selectedType, "recently handled real events must not immediately repeat");

const chapterOne = createInitialWorld().reserve;
chapterOne.poacherPressure = 0;
chapterOne.social = { pressure: 0 };
chapterOne.development.operations.today = {};
assert.strictEqual(worldEventTriggerType(chapterOne, { name: "雨季", weather: "阴" }, () => .99), null, "chapter one must also keep the 30-second quiet window");
chapterOne.progression.activeSeconds = (chapterOne.progression.chapterStart.activeSeconds || 0) + 30;
assert(chapterNeedsRequiredRealNature(chapterOne), "chapter one must still owe a real event after the quiet window");
chapterOne.poacherPressure = 72;
chapterOne.development.operations.today = { trouble: "游客越过标线", visitors: 20 };
const trigger = worldEventTriggerType(chapterOne, { name: "雨季", weather: "阴" }, () => .01);
assert(/^real_nature_/.test(trigger), "every chapter must latch its first real event after 30 seconds");
assert(/^real_nature_/.test(worldEventIdleTriggerType(chapterOne, { name: "雨季" }, () => .01)), "idle spawn must also latch the chapter real event");

for (let chapter = 1; chapter <= 20; chapter += 1) {
  const owed = createReserveState();
  owed.progression.stage = chapter;
  owed.progression.displayChapter = chapter;
  owed.progression.level = Math.min(7, Math.max(1, Math.ceil(chapter / 3)));
  owed.progression.activeSeconds = (owed.progression.chapterStart.activeSeconds || 0) + 30;
  owed.poacherPressure = 72;
  owed.social = { pressure: 2 };
  owed.development.operations.today = { visitors: 90, recruitedVisitors: 20, trouble: "游客越过标线" };
  assert(chapterNeedsRequiredRealNature(owed), `chapter ${chapter} must still owe a real event`);
  assert(/^real_nature_/.test(worldEventTriggerType(owed, { name: "雨季" }, () => .99)), `chapter ${chapter} action spawn must be a real event`);
  assert(/^real_nature_/.test(worldEventIdleTriggerType(owed, { name: "雨季" }, () => .99)), `chapter ${chapter} idle spawn must be a real event`);
}

const idleLatch = createReserveState();
idleLatch.progression.activeSeconds = (idleLatch.progression.chapterStart.activeSeconds || 0) + 30;
idleLatch.emergency = Object.assign({}, idleLatch.emergency, { active: null, cooldown: 4, idleNextAt: Date.now() + 240000 });
const idleOutcome = advanceIdleEmergency(idleLatch, { name: "雨季" }, Date.now(), () => 0.01);
assert(idleOutcome && /^real_nature_/.test(idleLatch.emergency.active && idleLatch.emergency.active.type), "required real event must ignore the 3–5 minute idle window");
assert.strictEqual(idleLatch.emergency.realNatureChapter, 1, "spawning the chapter real event must latch it");
assert(!chapterNeedsRequiredRealNature(idleLatch), "the same chapter must not keep owing a second required real event");

const actionLatch = createReserveState();
actionLatch.progression.stage = 2;
actionLatch.progression.displayChapter = 2;
actionLatch.progression.level = 1;
actionLatch.progression.totalActions = 3;
actionLatch.progression.totalMeaningfulActions = 3;
actionLatch.progression.chapterActions = 2;
actionLatch.progression.activeSeconds = (actionLatch.progression.chapterStart.activeSeconds || 0) + 30;
actionLatch.development.operations.recruitment = { totalRecruited: 12 };
actionLatch.development.operations.today = { recruitedVisitors: 12, visitors: 2, trouble: "游客越过标线" };
actionLatch.emergency = { active: null, cooldown: 3, visitorCooldown: 0, neighborCooldown: 0, history: [], lastOutcome: null, lastTriggerAction: 3 };
const startedRequired = updateReserveEmergency(actionLatch, "habitat", { name: "雨季" });
assert(startedRequired && /^real_nature_/.test(startedRequired.type), "chapter 2 must not let the stage-one visitor force steal the required real event");

chapterOne.poacherPressure = 0;
chapterOne.development.operations.today = {};

const lateReserve = createReserveState();
lateReserve.progression.stage = 8;
lateReserve.progression.displayChapter = 8;
lateReserve.progression.level = 7;
lateReserve.progression.activeSeconds = (lateReserve.progression.chapterStart.activeSeconds || 0) + 30;
lateReserve.poacherPressure = 72;
lateReserve.social = { pressure: 2 };
lateReserve.development.operations.today = { visitors: 90, recruitedVisitors: 20, trouble: "游客越过标线" };
markChapterRealNatureSeen(lateReserve);
assert(lateChapterRealNatureChance(3) >= 0.18, "chapter 3+ must reserve a real-event slot");
assert(lateChapterRealNatureChance(8) >= 0.32, "chapter 7+ must reserve a real-event slot");
assert(/^real_nature_/.test(worldEventTriggerType(lateReserve, { name: "雨季" }, () => .12)), "late chapters must still start a real event under high poacher/visitor pressure");
assert.strictEqual(worldEventTriggerType(lateReserve, { name: "雨季" }, () => .99), "poacher_ring", "late-chapter reserved slot must not erase high-pressure poacher events");
let lateIdleHits = 0;
for (let i = 0; i < 400; i += 1) {
  if (String(worldEventIdleTriggerType(lateReserve, { name: "雨季" }, () => (i + 0.5) / 400)).startsWith("real_nature_")) lateIdleHits += 1;
}
assert(lateIdleHits >= 80, `late-chapter idle pool must keep real events visible, got ${lateIdleHits}/400`);

const definition = WORLD_EVENT_DEFINITIONS[trigger];
chapterOne.emergency.active = Object.assign({
  id: `${trigger}_test`, progress: 0, daysRemaining: 3
}, definition, { responses: definition.responses.map((item) => Object.assign({}, item)) });
const view = buildReserveView(chapterOne, chapterOne, { day: 1, season: "雨季", weather: "阴" });
const marker = view.mapMarkers.find((item) => item.eventType === trigger);
assert(marker && marker.categoryLabel === "真实事件", "map marker must identify the real-event category");
assert(marker.impact.includes(definition.date) && marker.impact.includes(definition.place) && marker.impact.includes(definition.sourceName), "map marker must show real date, place and source");

const state = { world: createInitialWorld() };
state.world.reserve = chapterOne;
state.world.goals = resolveGoals(state);
assert(state.world.goals.active.primary && state.world.goals.active.primary.body.includes("真实事件"), "primary goal must identify the real-event category");
assert.strictEqual(state.world.goals.active.primary.recommendedAction, "realEvent", "real events must route to their detail instead of a supply-gated patrol");
assert(!/当前缺|巡护物资/.test(state.world.goals.active.primary.body), "real-event goals must not report a false patrol-supply shortage");

for (const legacyType of OBSOLETE_GENERIC_NATURE_TYPES) {
  const saved = createReserveState();
  saved.emergency.active = { type: legacyType, title: "旧自然规则任务" };
  const normalized = normalizeReserve(saved, createReserveState());
  assert(normalized.emergency.active === null, `${legacyType} must be cleared while loading`);

  const runtime = createReserveState();
  runtime.progression.totalActions = 0;
  runtime.emergency.active = { type: legacyType, title: "旧自然规则任务" };
  updateReserveEmergency(runtime, "patrol", { name: "雨季" }, true, false);
  assert(runtime.emergency.active === null, `${legacyType} must be cleared at runtime`);
}

assert.strictEqual(REAL_NATURE_ARCHERY_THRESHOLD, 3, "real events settle at 3 points");
for (const event of REAL_NATURE_EVENTS) {
  const pair = realNatureImpactPair(event);
  assert.strictEqual(pair.length, 2, `${event.id} must affect exactly two core metrics`);
  assert.strictEqual(new Set(pair.map((item) => item.metric)).size, 2, `${event.id} must combine two different metrics`);
  assert(pair.every((item) => ["fund", "visitors", "animals"].includes(item.metric)), `${event.id} may only write fund, visitors or animals`);
}

const coral = REAL_NATURE_EVENTS.find((event) => event.id === "ocean-01");
const coralPair = realNatureImpactPair(coral);
assert(coralPair.some((item) => item.metric === "animals"), "coral bleaching must include animals");
const spill = REAL_NATURE_EVENTS.find((event) => event.id === "ocean-02");
const spillPair = realNatureImpactPair(spill);
assert(spillPair.some((item) => item.metric === "animals") && spillPair.some((item) => item.metric === "fund"), "oil spill must combine animals and fund");

const winReserve = createReserveState();
winReserve.fund = 800;
winReserve.development.operations.today = { visitors: 40, recruitedVisitors: 0, income: 200 };
const win = applyRealNatureOutcome(winReserve, coral, 3);
assert(win.success, "score 3 must be positive");
assert.strictEqual(win.changes.length, 2);
assert(win.changes.every((item) => item.delta > 0), "score >= 3 must raise both settlement metrics");
assert(win.changes.some((item) => item.metric === "animals") ? winReserve.ecology.herbivores.deer >= 24 : true);

const loseReserve = createReserveState();
loseReserve.fund = 800;
loseReserve.development.operations.today = { visitors: 40, recruitedVisitors: 0, income: 200 };
const lose = applyRealNatureOutcome(loseReserve, coral, 2);
assert(!lose.success, "score below 3 must be negative");
assert(lose.changes.every((item) => item.delta < 0), "score < 3 must lower both settlement metrics");

const { Game } = require("../js/game");
const settleGame = new Game();
settleGame.state = { world: createInitialWorld() };
settleGame.state.world.reserve = Object.assign(createReserveState(), {
  fund: 900,
  emergency: {
    active: Object.assign({ id: "real_settle_test", progress: 0, daysRemaining: 3 }, definition, {
      responses: definition.responses.map((item) => Object.assign({}, item))
    })
  }
});
settleGame.state.character = { name: "结算" };
settleGame.state.world.reserve.development.operations.today = { visitors: 36, recruitedVisitors: 4, income: 180 };
settleGame.resetTaskCompletionFeedback();
settleGame.infoDetailModal = { kind: "neighborEventDice", phase: "ready", definition, threshold: REAL_NATURE_ARCHERY_THRESHOLD };
settleGame.archeryAimValueFor = () => 0.5;
settleGame.lockArcheryAim = () => {};
settleGame.archeryScoreFor = () => 4;
settleGame.animateInlineDiceRoll = (_modal, _roll, _token, done) => done();
settleGame.playSfx = () => {};
settleGame.playArcheryImpact = () => {};
settleGame.render = () => {};
settleGame.toast = () => {};
const settled = settleGame.resolveNeighborEventDice();
assert(settled && settled.success, "real-event archery at 4 must settle positive");
assert.strictEqual((settled.impactChanges || []).length, 2, "settlement must show exactly two metric cards");
assert(settled.impactChanges.every((item) => item.delta > 0 && item.label && Number.isFinite(item.before) && Number.isFinite(item.after)));

settleGame.width = 375; settleGame.height = 667;
const gradient = { addColorStop() {} };
const drawn = [];
settleGame.ctx = new Proxy({}, {
  get(target, key) {
    if (key === "measureText") return (value) => ({ width: String(value).length * 6.4 });
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
    return target[key] || (() => {});
  },
  set(target, key, value) { target[key] = value; return true; }
});
const originalText = settleGame.text.bind(settleGame);
settleGame.text = (_ctx, value, ...rest) => {
  drawn.push(String(value || ""));
  return originalText(_ctx, value, ...rest);
};
settleGame.infoDetailModal.phase = "result";
settleGame.infoDetailModal.result = settled;
settleGame.infoDetailModal.impactPair = settled.impactChanges;
settleGame.drawNeighborEventDiceModalContent(settleGame.ctx, settleGame.infoDetailModal, 16, 80, 343, 420);
assert(settled.impactChanges.every((item) => drawn.some((value) => value.includes(item.label))), "settlement page must name both affected metrics");
assert(settled.impactChanges.every((item) => drawn.some((value) => value.includes(`${item.before} → ${item.after}`))), "settlement cards must show before → after");
assert(settled.impactChanges.every((item) => drawn.some((value) => value.includes(`+${item.delta}`))), "settlement cards must show signed deltas");
assert(!drawn.some((value) => /两项经营数据已写入/.test(value)), "real-event result must not repeat the settlement-page status line");

settleGame.collectTaskCompletionFeedback();
settleGame.infoDetailModal = null;
assert(settleGame.showNextTaskCompletionNotice(), "real events must open their dedicated settlement card");
assert.strictEqual(settleGame.infoDetailModal.kind, "realNatureSettlement", "real events must not reuse the generic 你完成了 card");
assert.strictEqual((settleGame.infoDetailModal.impactChanges || []).length, 2);
assert.strictEqual(settleGame.infoDetailModal.statusText, "", "dedicated settlement must not keep a status-line caption");
drawn.length = 0;
const colored = [];
settleGame.text = (_ctx, value, _x, _y, _size, color, ...rest) => {
  const text = String(value || "");
  drawn.push(text);
  colored.push({ value: text, color });
  return originalText(_ctx, value, _x, _y, _size, color, ...rest);
};
settleGame.drawRealNatureSettlementContent(settleGame.ctx, settleGame.infoDetailModal, 16, 80, 343, 280);
assert(settled.impactChanges.every((item) => drawn.some((value) => value.includes(item.label))), "dedicated settlement must name both metrics");
assert(settled.impactChanges.every((item) => drawn.some((value) => value.includes(`${item.before} → ${item.after}`))), "dedicated settlement must show before → after");
assert(settled.impactChanges.every((item) => drawn.some((value) => value.includes(`+${item.delta}`))), "dedicated settlement must show signed deltas");
assert(!drawn.some((value) => /经营数据已写入/.test(value)), "dedicated settlement must not show the written-to-ops caption");
assert(colored.filter((item) => item.value === "↑").every((item) => item.color === "#c44735"), "growth arrows must be red");
settleGame.drawCoreImpactChangeCards(settleGame.ctx, [
  { label: "下降样例", before: 10, after: 6, delta: -4, unit: "只" }
], 16, 80, 200, 82);
assert(colored.filter((item) => item.value === "↓").every((item) => item.color === "#1f8a55"), "decline arrows must be green");
assert.strictEqual(settleGame.infoDetailModalHeight({ kind: "taskCompletionNotice" }), 300, "generic completion card height must stay unchanged");

console.log("real nature event check ok");
