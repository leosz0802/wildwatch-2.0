const assert = require("assert");
const { createInitialWorld, createReserveState } = require("../js/world");
const { normalizeReserve } = require("../js/storage");
const { buildReserveView } = require("../js/reserveView");
const { resolveGoals, buildGoalView, applyGoalProgress, CHAPTER_THEME_TASKS } = require("../js/goalSystem");
const { updateReserveEmergency, advanceIdleEmergency } = require("../js/simulator");
const { applyEventBusinessOutcome } = require("../js/eventEconomy");
const { chapterAnimalTotal } = require("../js/chapterTargets");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { REAL_NATURE_EVENTS } = require("../js/realNatureEventCatalog");
const {
  REAL_NATURE_EVENT_DEFINITIONS,
  REAL_NATURE_ARCHERY_THRESHOLD,
  REAL_NATURE_ENTRY_DELAY_SECONDS,
  realNatureEventForDate,
  realNatureTriggerType,
  realNatureTheme,
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
  lateChapterRealNatureChance,
  extraRealNatureAllowed,
  chapterThemePending
} = require("../js/worldEventSystem");

assert.strictEqual(REAL_NATURE_EVENTS.length, 135, "all reviewed real events must be available");
assert.strictEqual(new Set(REAL_NATURE_EVENTS.map((event) => event.id)).size, 135, "all real-event IDs must be unique");
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
for (const event of REAL_NATURE_EVENTS) {
  const definition = REAL_NATURE_EVENT_DEFINITIONS[`real_nature_${event.id}`];
  assert(definition.themeLabel && definition.relationshipLine && definition.animalLine, `${event.id} needs a visible ecology relationship narrative`);
  assert(definition.ecologicalMechanism && definition.playerQuestion, `${event.id} needs a visible cause-and-choice narrative`);
  assert(Array.isArray(definition.causeChain) && definition.causeChain.length === 3, `${event.id} needs a three-step cause chain`);
}
const diseaseEvent = REAL_NATURE_EVENTS.find((event) => /疾病|疫情|禽流感|病毒|病原|中毒|毒藻|搁浅|异常.*死亡|集中死亡|死亡调查|感染|病死|兽疫|疫/.test(Object.values(event).join(" ")));
assert(diseaseEvent, "catalog must contain a disease or poisoning event");
assert.strictEqual(realNatureTheme(diseaseEvent).visualKind, "disease-zone", "disease events need a disease map route");
assert(REAL_NATURE_EVENT_DEFINITIONS[`real_nature_${diseaseEvent.id}`].effectsFor === undefined, "theme effects must stay plain serializable fields");
assert(REAL_NATURE_EVENT_DEFINITIONS[`real_nature_${diseaseEvent.id}`].pressureEffects.disease > 0, "disease events must raise disease pressure while active");
const waterEvent = REAL_NATURE_EVENTS.find((event) => /污染|泄漏|水质|洪水|水源|水道|河流|湿地|水华|油膜/.test(Object.values(event).join(" ")));
assert(waterEvent, "catalog must contain a water event");
assert.strictEqual(realNatureTheme(waterEvent).visualKind, "contaminated-water", "water events need a contaminated-water map route");
assert(Object.prototype.hasOwnProperty.call(REAL_NATURE_EVENT_DEFINITIONS[`real_nature_${waterEvent.id}`].resolvedEffects, "water"), "water events must settle water");
const fireEvent = REAL_NATURE_EVENTS.find((event) => /山火|火点|火季|野火|森林火|高火险/.test(event.title || ""))
  || REAL_NATURE_EVENTS.find((event) => /山火|火灾|火点|火季|热浪|高温|干旱|干热|烟雾|烧毁|野火/.test(Object.values(event).join(" ")));
assert(fireEvent, "catalog must contain a fire or heat event");
assert.strictEqual(realNatureTheme(fireEvent).visualKind, "wildfire", "fire events need a wildfire map route");
assert(Object.prototype.hasOwnProperty.call(REAL_NATURE_EVENT_DEFINITIONS[`real_nature_${fireEvent.id}`].resolvedEffects, "grass"), "fire events must settle grass");
assert.strictEqual(futureTimelineText("2025-08-29"), "2030-08-29", "player-facing event dates must use the +5 year timeline");
assert.strictEqual(REAL_NATURE_EVENT_DEFINITIONS["real_nature_ocean-07"].date, "2030-08-29", "runtime definitions must shift dates without changing source data");
assert.strictEqual(REAL_NATURE_EVENTS.find((event) => event.id === "ocean-07").date, "2025-08-29", "audit catalog must keep the real source date");

const stableNow = Date.UTC(2026, 8, 19, 5);
const reserve = createReserveState();
assert(realNatureEventForDate(reserve, stableNow).id === realNatureEventForDate(reserve, stableNow + 3600e3).id, "Beijing-date rotation must be stable within one date");
assert.strictEqual(realNatureTriggerType(reserve, stableNow), null, "real events must wait 20 active seconds after entering a chapter");
reserve.progression.activeSeconds = (reserve.progression.chapterStart.activeSeconds || 0) + REAL_NATURE_ENTRY_DELAY_SECONDS;
const selectedType = realNatureTriggerType(reserve, stableNow);
reserve.emergency.history = [{ type: selectedType, realEventId: realNatureEventForDate(reserve, stableNow).id }];
assert(realNatureTriggerType(reserve, stableNow) !== selectedType, "recently handled real events must not immediately repeat");

const chapterOne = createInitialWorld().reserve;
chapterOne.poacherPressure = 0;
chapterOne.social = { pressure: 0 };
chapterOne.development.operations.today = {};
assert.strictEqual(worldEventTriggerType(chapterOne, { name: "雨季", weather: "阴" }, () => .99), null, "chapter one must also keep the 20-second quiet window");
chapterOne.progression.activeSeconds = (chapterOne.progression.chapterStart.activeSeconds || 0) + REAL_NATURE_ENTRY_DELAY_SECONDS;
assert(chapterNeedsRequiredRealNature(chapterOne), "chapter one must still owe a real event after the quiet window");
chapterOne.poacherPressure = 72;
chapterOne.development.operations.today = { trouble: "游客越过标线", visitors: 20 };
const trigger = worldEventTriggerType(chapterOne, { name: "雨季", weather: "阴" }, () => .01);
assert(/^real_nature_/.test(trigger), "every chapter must latch its first real event after 20 seconds");
assert(/^real_nature_/.test(worldEventIdleTriggerType(chapterOne, { name: "雨季" }, () => .01)), "idle spawn must also latch the chapter real event");

for (let chapter = 1; chapter <= 20; chapter += 1) {
  const owed = createReserveState();
  owed.progression.stage = chapter;
  owed.progression.displayChapter = chapter;
  owed.progression.level = Math.min(7, Math.max(1, Math.ceil(chapter / 3)));
  owed.progression.activeSeconds = (owed.progression.chapterStart.activeSeconds || 0) + REAL_NATURE_ENTRY_DELAY_SECONDS;
  owed.poacherPressure = 72;
  owed.social = { pressure: 2 };
  owed.development.operations.today = { visitors: 90, recruitedVisitors: 20, trouble: "游客越过标线" };
  assert(chapterNeedsRequiredRealNature(owed), `chapter ${chapter} must still owe a real event`);
  assert(/^real_nature_/.test(worldEventTriggerType(owed, { name: "雨季" }, () => .99)), `chapter ${chapter} action spawn must be a real event`);
  assert(/^real_nature_/.test(worldEventIdleTriggerType(owed, { name: "雨季" }, () => .99)), `chapter ${chapter} idle spawn must be a real event`);
}

const idleLatch = createReserveState();
idleLatch.progression.activeSeconds = (idleLatch.progression.chapterStart.activeSeconds || 0) + REAL_NATURE_ENTRY_DELAY_SECONDS;
idleLatch.emergency = Object.assign({}, idleLatch.emergency, { active: null, cooldown: 4, idleNextAt: Date.now() + 240000 });
const idleOutcome = advanceIdleEmergency(idleLatch, { name: "雨季" }, Date.now(), () => 0.01);
assert(idleOutcome && /^real_nature_/.test(idleLatch.emergency.active && idleLatch.emergency.active.type), "required real event must ignore the 3–5 minute idle window");
assert.strictEqual(idleLatch.emergency.realNatureChapter, 1, "spawning the chapter real event must latch it");
assert.strictEqual(idleLatch.emergency.realNatureChapterCount, 1, "the first real event fills one of the two chapter slots");
assert(!chapterNeedsRequiredRealNature(idleLatch), "an active real event must not stack a second required event");
idleLatch.emergency.active = null;
assert(chapterNeedsRequiredRealNature(idleLatch), "the chapter still owes a second real event after the first one ends");
markChapterRealNatureSeen(idleLatch);
assert(!chapterNeedsRequiredRealNature(idleLatch), "two real events fill the chapter quota");

const actionLatch = createReserveState();
actionLatch.progression.stage = 2;
actionLatch.progression.displayChapter = 2;
actionLatch.progression.level = 1;
actionLatch.progression.totalActions = 3;
actionLatch.progression.totalMeaningfulActions = 3;
actionLatch.progression.chapterActions = 2;
actionLatch.progression.activeSeconds = (actionLatch.progression.chapterStart.activeSeconds || 0) + REAL_NATURE_ENTRY_DELAY_SECONDS;
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
lateReserve.progression.activeSeconds = (lateReserve.progression.chapterStart.activeSeconds || 0) + REAL_NATURE_ENTRY_DELAY_SECONDS;
lateReserve.poacherPressure = 72;
lateReserve.social = { pressure: 2 };
lateReserve.development.operations.today = { visitors: 90, recruitedVisitors: 20, trouble: "游客越过标线" };
markChapterRealNatureSeen(lateReserve);
markChapterRealNatureSeen(lateReserve);
// This fixture represents a late chapter that already completed its required
// extinction record; the next high-pressure roll should remain available for
// the poacher route.
lateReserve.emergency.realNatureExtinctionChapter = 8;
assert(lateChapterRealNatureChance(3) >= 0.18, "chapter 3+ must reserve a real-event slot");
assert(lateChapterRealNatureChance(8) >= 0.32, "chapter 7+ must reserve a real-event slot");
assert(/^real_nature_/.test(worldEventTriggerType(lateReserve, { name: "雨季" }, () => .12)), "late chapters must still start a real event under high poacher/visitor pressure");
assert.strictEqual(worldEventTriggerType(lateReserve, { name: "雨季" }, () => .99), "poacher_ring", "late-chapter reserved slot must not erase high-pressure poacher events");
let lateIdleHits = 0;
for (let i = 0; i < 400; i += 1) {
  if (String(worldEventIdleTriggerType(lateReserve, { name: "雨季" }, () => (i + 0.5) / 400)).startsWith("real_nature_")) lateIdleHits += 1;
}
assert(lateIdleHits >= 1, `late-chapter idle pool must keep at least one real event visible, got ${lateIdleHits}/400`);

const definition = WORLD_EVENT_DEFINITIONS[trigger];
chapterOne.emergency.active = Object.assign({
  id: `${trigger}_test`, progress: 0, daysRemaining: 3
}, definition, { responses: definition.responses.map((item) => Object.assign({}, item)) });
const view = buildReserveView(chapterOne, chapterOne, { day: 1, season: "雨季", weather: "阴" });
const marker = view.mapMarkers.find((item) => item.eventType === trigger);
assert(marker && marker.categoryLabel === "保护区野外实录", "map marker must identify the field-record category");
assert(marker.impact.includes(definition.date) && marker.impact.includes(definition.place) && marker.impact.includes(definition.sourceName), "map marker must show real date, place and source");

const state = { world: createInitialWorld() };
state.world.reserve = chapterOne;
state.world.goals = resolveGoals(state);
assert(state.world.goals.active.primary && state.world.goals.active.primary.body.includes("保护区野外实录"), "primary goal must identify the field-record category");
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

// Real-event animal gains must survive the chapter HUD ledger.  Previously
// applyAnimalImpact recorded them as migration, so the live herd changed but
// reopening Chapter 1 still showed 0/58.
const chapterEventReserve = createReserveState();
const chapterEventBefore = chapterAnimalTotal(chapterEventReserve);
const liveAnimalBefore = livingAnimalTotal(chapterEventReserve);
const chapterEvent = Object.assign({}, coral, {
  type: `real_nature_${coral.id}`,
  id: `real_nature_${coral.id}`
});
const chapterEventChange = applyEventBusinessOutcome(chapterEventReserve, chapterEvent, true, false);
const chapterAnimalChange = (chapterEventChange.impactChanges || []).find((item) => item.metric === "animals");
assert(chapterAnimalChange && chapterAnimalChange.delta > 0, "a positive real event must return an animal gain");
assert.strictEqual(
  chapterAnimalTotal(chapterEventReserve),
  chapterEventBefore + chapterAnimalChange.delta,
  "positive real-event animals must be included in the current chapter HUD"
);
assert.strictEqual(
  livingAnimalTotal(chapterEventReserve),
  liveAnimalBefore + chapterAnimalChange.delta,
  "positive real-event animals must also reach the live herd used by the HUD total"
);

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
const narrativeDefinition = REAL_NATURE_EVENT_DEFINITIONS[`real_nature_${fireEvent.id}`];
assert(settleGame.openWorldEventDetail({ eventType: narrativeDefinition.type, title: narrativeDefinition.title }, narrativeDefinition), "real-event detail should open");
assert(settleGame.infoDetailModal.items.some((item) => item.tag === "生态关系"), "real-event detail must explain human-animal relationship");
assert(settleGame.infoDetailModal.items.some((item) => item.body.includes(narrativeDefinition.ecologicalMechanism)), "real-event detail must explain the ecological mechanism");
assert.strictEqual(settleGame.infoDetailModal.items.length, 2, "real-event detail should keep only event detail and ecological relationship");
assert(!settleGame.infoDetailModal.items.some((item) => item.tag === "结算影响"), "real-event detail must not duplicate the settlement impact card");
settleGame.infoDetailModal = { kind: "neighborEventDice", phase: "ready", definition };
let nestedSettle = null;
const originalLock = settleGame.lockArcheryAim.bind(settleGame);
settleGame.lockArcheryAim = function lockArcheryAim(modal) {
  nestedSettle = this.resolveNeighborEventDice();
  return originalLock(modal);
};
const settled = settleGame.resolveNeighborEventDice();
settleGame.lockArcheryAim = originalLock;
assert.strictEqual(nestedSettle, false, "the same tap stack must not settle a real event twice");
assert(settled && settled.success, "real-event archery at 4 must settle positive");
assert.strictEqual(settleGame.resolveNeighborEventDice(), false, "a second fire after lock must not pay out again");
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
assert(settleGame.infoDetailModal.prose.includes("主题："), "real-event settlement must retain the event ecology theme");
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
assert.strictEqual(settleGame.infoDetailModalHeight({ kind: "taskCompletionNotice" }), 420, "completion card must leave room for the result and next-step rows");

const themeBusy = createReserveState();
themeBusy.progression.stage = 17;
themeBusy.progression.displayChapter = 17;
themeBusy.progression.level = 7;
themeBusy.progression.activeSeconds = (themeBusy.progression.chapterStart.activeSeconds || 0) + 120;
themeBusy.poacherPressure = 72;
themeBusy.social = { pressure: 2 };
themeBusy.development.operations.today = { visitors: 90, recruitedVisitors: 20, trouble: "游客越过标线" };
themeBusy.chapterTheme = { version: 1, chapter: 17, step: 0, completed: false, completedTaskIds: [] };
markChapterRealNatureSeen(themeBusy);
markChapterRealNatureSeen(themeBusy);
assert.equal(extraRealNatureAllowed(themeBusy), false, "unfinished chapter 17 theme must stop extra real-nature spawns");
assert(!String(worldEventTriggerType(themeBusy, { name: "雨季" }, () => .12) || "").startsWith("real_nature_"), "late extras must not steal an unfinished chapter theme");
let themeBusyIdleHits = 0;
for (let i = 0; i < 200; i += 1) {
  if (String(worldEventIdleTriggerType(themeBusy, { name: "雨季" }, () => (i + 0.5) / 200)).startsWith("real_nature_")) themeBusyIdleHits += 1;
}
assert.equal(themeBusyIdleHits, 0, `unfinished chapter theme must keep extra idle droughts at 0, got ${themeBusyIdleHits}`);

const leftoverTheme = createReserveState();
leftoverTheme.progression.stage = 17;
leftoverTheme.progression.displayChapter = 17;
leftoverTheme.progression.level = 7;
leftoverTheme.progression.activeSeconds = (leftoverTheme.progression.chapterStart.activeSeconds || 0) + 120;
leftoverTheme.chapterTheme = { version: 1, chapter: 16, step: 3, completed: true, completedTaskIds: ["stabilize-water"] };
markChapterRealNatureSeen(leftoverTheme);
markChapterRealNatureSeen(leftoverTheme);
assert.equal(chapterThemePending(leftoverTheme), true, "entering chapter 17 with a finished chapter 16 ledger still counts as theme pending");
assert.equal(extraRealNatureAllowed(leftoverTheme), false, "a leftover previous-chapter theme ledger must not unlock extra droughts");
assert(!String(worldEventTriggerType(leftoverTheme, { name: "雨季" }, () => .12) || "").startsWith("real_nature_"), "chapter 17 extras must wait until this chapter theme starts");

function chapterReserveWithMapCycle(chapter) {
  const reserve = createReserveState();
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
  reserve.progression.level = Math.max(1, Math.ceil(chapter / 2));
  reserve.fund = 500;
  reserve.ecology.water = 80;
  reserve.ecology.grass = 62;
  reserve.ecology.disease = 4;
  reserve.supplies = { dogFood: 6, alarm: 4, tranquilizer: 4, fieldKit: 4, medicalKit: 2, evidenceTrap: 2 };
  reserve.emergency = {
    active: Object.assign({ id: `real_nature_climate-02_ch${chapter}`, progress: 0, daysRemaining: 3 }, climateDefinition, {
      responses: climateDefinition.responses.map((item) => Object.assign({}, item))
    }),
    history: []
  };
  reserve.reserveView = { mapMarkers: [{ id: "back-edge", reserve }] };
  return reserve;
}

const climateDefinition = REAL_NATURE_EVENT_DEFINITIONS["real_nature_climate-02"];
for (const chapter of [9, 10]) {
  const reserve = chapterReserveWithMapCycle(chapter);
  const world = createInitialWorld();
  world.reserve = reserve;
  world.mapEvents = reserve.reserveView.mapMarkers;
  world.goals = null;
  const game = new Game();
  game.state = { world, character: { name: `chapter-${chapter}` }, ui: {} };
  game.state.world.goals = resolveGoals(game.state, null, "check");
  const blocked = buildGoalView(game.state, game.state.world.goals);
  assert.strictEqual(blocked.primary.title, "强热带气旋奇多", `chapter ${chapter} real event must hold the task bar until it settles`);
  assert.throws(() => JSON.stringify(game.state.world), /circular|Converting circular/i, `chapter ${chapter} played world must be the circular case`);
  const cloned = game.cloneStateForGoalProgress();
  assert.strictEqual(cloned.world.reserve.progression.displayChapter, chapter, "goal snapshot must keep the chapter");
  assert.strictEqual(cloned.world.reserve.reserveView, undefined, "goal snapshot must drop the map back-edge");
  const toasts = [];
  game.resetTaskCompletionFeedback();
  game.infoDetailModal = { kind: "neighborEventDice", phase: "ready", definition: climateDefinition, threshold: REAL_NATURE_ARCHERY_THRESHOLD };
  game.archeryAimValueFor = () => 0.5;
  game.lockArcheryAim = () => {};
  game.archeryScoreFor = () => 4;
  game.animateInlineDiceRoll = (_modal, _roll, _token, done) => done();
  game.playSfx = () => {};
  game.playArcheryImpact = () => {};
  game.render = () => {};
  game.saveState = () => {};
  game.toast = (message) => toasts.push(message);
  const settledChapter = game.resolveNeighborEventDice();
  assert(settledChapter && settledChapter.success, `chapter ${chapter} real event must settle on a circular world`);
  assert.strictEqual(reserve.emergency.active, null, `chapter ${chapter} real event must leave the task bar`);
  assert(!toasts.includes("结算没有完成，可以再试一次"), `chapter ${chapter} must not stick on a failed settlement`);
  game.state.world.goals = resolveGoals(game.state, null, "check");
  const opened = buildGoalView(game.state, game.state.world.goals);
  const expectedTitle = chapter === 9 ? "截下水貂夜行" : "截下白犀牛泥坑";
  assert.strictEqual(opened.primary && opened.primary.title, expectedTitle, `chapter ${chapter} theme must become the current task`);
}

const chapterTen = new Game();
const chapterTenReserve = chapterReserveWithMapCycle(10);
chapterTenReserve.emergency.active = null;
chapterTen.state = { world: { reserve: chapterTenReserve, goals: null }, character: { name: "chapter-10" }, ui: {} };
chapterTen.state.world.goals = resolveGoals(chapterTen.state, null, "check");
const themeBefore = Number((chapterTenReserve.chapterTheme || {}).step) || 0;
const themeProgress = applyGoalProgress(chapterTen.state, chapterTen.state, { action: "antiPoacher", advanceChapterTheme: true, now: Date.now() });
chapterTen.state = themeProgress.state;
const themeAfter = chapterTen.state.world.reserve.chapterTheme || {};
assert.strictEqual(themeAfter.step, themeBefore, "chapter 10 patrol action must not consume the share task");
assert.strictEqual(!(themeAfter.completedTaskIds || []).includes("flagship-border"), true, "chapter 10 border patrol task is deleted");
assert.strictEqual((CHAPTER_THEME_TASKS[10] || []).some((task) => task && task.id === "flagship-border"), false);

console.log("real nature event check ok");
