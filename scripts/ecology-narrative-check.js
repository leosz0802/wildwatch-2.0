const assert = require("assert");
const { createReserveState } = require("../js/world");
const {
  normalizeEcologyNarrative,
  resolveEcologyNarrativeEvent,
  applyEcologyNarrativeDecision,
  predatorPreyCandidates,
  territorialCandidates,
  relationCandidates
} = require("../js/ecologyNarrativeSystem");
const { eventBusinessFactors, applyNarrativeBusinessPressure, applyNarrativeBusinessOutcome, advanceBusinessEffects } = require("../js/eventEconomy");
const { animalSourceSummary } = require("../js/animalSourceLedger");
const { chapterVisitorTotal } = require("../js/chapterTargets");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNarrativeDepth(event, type) {
  assert(event && event.type === type, `${type} event must be produced`);
  assert(event.scene.length >= 30 && event.cause.length >= 20 && event.stakes.length >= 20, `${type} must expose scene, ecological cause and moral stakes`);
  assert(event.choices.length === 1 && event.choices.every((choice) => choice.cost && choice.preview), `${type} must keep a single costly choice`);
  assert(event.artifact && event.artifact.reality && event.artifact.story && event.artifact.easterEgg, `${type} artifact must include reality, story and foreshadow layers`);
  assert(event.foreshadow && event.threadId, `${type} must open a persistent narrative thread`);
}

// Story pressure must be visible to the visitor economy before and after a
// choice, including when a reserve already has guests in the current day.
const businessReserve = createReserveState();
businessReserve.fund = 500;
businessReserve.development.operations.today = { visitors: 100, recruitedVisitors: 0, recruitedIncome: 500, income: 500 };
const businessEvent = { id: "story_business_probe", type: "disease", title: "水点出现病征" };
const pressureChange = applyNarrativeBusinessPressure(businessReserve, businessEvent);
assert(pressureChange && pressureChange.visitorsDelta < 0, "unresolved story pressure must reduce current visitor demand");
assert(eventBusinessFactors(businessReserve).demand < 1, "unresolved story pressure must reach visitor factors");
const outcomeChange = applyNarrativeBusinessOutcome(businessReserve, { id: businessEvent.id, type: "disease", title: businessEvent.title }, "disperse");
assert(outcomeChange && outcomeChange.demand < 1 && outcomeChange.immediate, "resolving a story must expose an immediate visitor pulse");
assert(businessReserve.storyBusinessEffect.phase === "resolved" && eventBusinessFactors(businessReserve).demand < 1, "story choice must keep a short-lived business effect for the next wave");
advanceBusinessEffects(businessReserve);
assert(businessReserve.storyBusinessEffect.remainingActions === 2, "story business effects must decay instead of becoming permanent modifiers");

// A narrative must remain visible even at the smallest playable crowd. The
// old percentage rounding turned a 9-person story into a silent no-op.
const smallStoryReserve = createReserveState();
smallStoryReserve.fund = 500;
smallStoryReserve.development.operations.today = { visitors: 0, recruitedVisitors: 9, recruitedIncome: 36, income: 36 };
smallStoryReserve.development.operations.totalVisitors = 9;
const smallStoryPressure = applyNarrativeBusinessPressure(smallStoryReserve, { id: "small_story_pressure", type: "predation", title: "低客流捕食剧情" });
assert(smallStoryPressure && smallStoryPressure.visitorsDelta <= -1, "unresolved stories must visibly reduce a small crowd");
const smallStoryChoice = applyNarrativeBusinessOutcome(smallStoryReserve, { id: "small_story_pressure", type: "predation", title: "低客流捕食剧情" }, "observe");
assert(smallStoryChoice && smallStoryChoice.visitorsDelta >= 1, "a resolved story choice must visibly recover a small crowd");
assert.strictEqual(smallStoryReserve.development.operations.totalVisitors, smallStoryChoice.visitorsAfter, "story visitor changes must reconcile with aggregate visitors");

const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { chapterThemeView } = require("../js/goalSystem");

const retired = createReserveState();
retired.ecologyNarrative = {
  pendingDecision: { id: "old_nature_rule", title: "自然规则", choices: [{ id: "observe", label: "观察" }] }
};
assert.strictEqual(normalizeEcologyNarrative(retired.ecologyNarrative).pendingDecision, null, "已保存的自然规则任务必须清掉");
assert.strictEqual(resolveEcologyNarrativeEvent(retired, clone(retired), { day: 4, dayClosed: true, forceType: "predation" }), null, "自然规则任务不得再生成");
assert.strictEqual(retired.ecologyNarrative.pendingDecision, null, "生成入口不得留下待处理的自然规则任务");

const progressState = createCharacter(null, "自然规则已删除");
progressState.world.reserve.progression.stage = 3;
progressState.world.reserve.progression.displayChapter = 3;
progressState.world.reserve.fund = 5000;
progressState.world.reserve.supplies.fieldKit = 4;
const beforeActions = Math.max(0, Number(progressState.world.reserve.progression.totalActions) || 0);
const settled = simulateDay("修复水源和草场：去东部河岸湿地修复水源", progressState);
const afterReserve = settled.world.reserve;
assert(Number(afterReserve.progression.totalActions) > beforeActions, "删除自然规则任务后，普通任务仍要完成结算");
assert.strictEqual((afterReserve.ecologyNarrative || {}).pendingDecision || null, null, "结算不得再弹出自然规则任务");
const theme = chapterThemeView(settled);
assert(theme && Array.isArray(theme.tasks) && theme.tasks.length > 0, "章节目标仍在");
console.log("ecology narrative retired; chapter goals and day settlement still advance");
