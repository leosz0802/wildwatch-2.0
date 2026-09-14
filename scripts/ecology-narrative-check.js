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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNarrativeDepth(event, type) {
  assert(event && event.type === type, `${type} event must be produced`);
  assert(event.scene.length >= 30 && event.cause.length >= 20 && event.stakes.length >= 20, `${type} must expose scene, ecological cause and moral stakes`);
  assert(event.choices.length === 2 && event.choices.every((choice) => choice.cost && choice.preview), `${type} must keep two costly choices`);
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

const reserve = createReserveState();
reserve.supplies.medicalKit = 3;
reserve.supplies.fieldKit = 3;

assert(predatorPreyCandidates(reserve).some((pair) => pair.predatorId === "wolf" && pair.preyId === "deer"), "live populations must derive wolf/deer predation candidate");
const beforePredation = clone(reserve);
const predation = resolveEcologyNarrativeEvent(reserve, beforePredation, { day: 1, dayClosed: true, forceType: "predation" });
assertNarrativeDepth(predation, "predation");
assert(predation.actors.length === 2 && predation.dialogues.length === 2, "predation must preserve both prey and predator voices");
assert.notStrictEqual(predation.dialogues[0].tone, predation.dialogues[1].tone, "opposing animals must not share one flattened stance");
assert.strictEqual(resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 2, dayClosed: true, forceType: "birth" }), null, "an unresolved ecology decision must block another interruption");
const observe = applyEcologyNarrativeDecision(reserve, predation.id, "observe");
assert(observe.ok && observe.outcome && reserve.ecologyNarrative.pendingDecision === null, "predation choice must resolve and persist");
assert(reserve.ecologyNarrative.artifacts[predation.artifact.id].archived, "event evidence must be archived after the decision");
assert(!applyEcologyNarrativeDecision(reserve, predation.id, "observe").ok, "the same event cannot settle twice");

reserve.ecology.disease = 48;
const disease = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 3, dayClosed: true, forceType: "disease" });
assertNarrativeDepth(disease, "disease");
const diseaseBefore = reserve.ecology.disease;
const isolate = applyEcologyNarrativeDecision(reserve, disease.id, "isolate");
assert(isolate.ok && reserve.ecology.disease < diseaseBefore, "disease isolation must consume stock and reduce real disease pressure");

reserve.ecology.grass = 34;
const overgrazing = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 5, dayClosed: true, forceType: "overgrazing" });
assertNarrativeDepth(overgrazing, "overgrazing");
const grassBefore = reserve.ecology.grass;
assert(applyEcologyNarrativeDecision(reserve, overgrazing.id, "rest").ok && reserve.ecology.grass > grassBefore, "grassland rest must change carrying habitat and migration together");

reserve.ecology.predators.bear = 2;
assert(territorialCandidates(reserve).some((pair) => pair.leftId === "bear" && pair.rightId === "wolf"), "populated territorial rivals must come from the relationship matrix");
const territorial = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 7, dayClosed: true, forceType: "territorial" });
assertNarrativeDepth(territorial, "territorial");
assert(territorial.dialogues.length === 2, "territorial event must preserve conflicting claims");
assert(applyEcologyNarrativeDecision(reserve, territorial.id, "watch").ok, "territorial observation must resolve without inventing a perfect truce");

reserve.ecology.water = 78;
reserve.ecology.grass = 72;
reserve.ecology.disease = 8;
const birth = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 9, dayClosed: true, forceType: "birth" });
assertNarrativeDepth(birth, "birth");
assert(/不属于保护区的成绩单/.test(birth.scene), "birth must retain animal autonomy instead of becoming a reward popup");
assert(applyEcologyNarrativeDecision(reserve, birth.id, "distance").ok, "distance choice must preserve natural risk");

reserve.migration = { trend: "out", delta: -4, reason: "水线收缩使队伍转向保护区外缘" };
const migration = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 11, dayClosed: true, forceType: "migration" });
assertNarrativeDepth(migration, "migration");
assert(applyEcologyNarrativeDecision(reserve, migration.id, "observe_route").ok, "migration must remain an animal choice when the player only observes");

reserve.ecology.disease = 32;
const juvenileLoss = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 13, dayClosed: true, forceType: "juvenile_loss" });
assertNarrativeDepth(juvenileLoss, "juvenile_loss");
assert(/不是忘记/.test(juvenileLoss.dialogues[0].text), "juvenile death must carry grief without turning loss into spectacle");
assert(applyEcologyNarrativeDecision(reserve, juvenileLoss.id, "emergency_care").ok, "limited medical intervention must consume stock and retain disturbance consequences");

assert(relationCandidates(reserve, "competition").length > 0, "populated species must derive resource competition from the relationship matrix");
const competition = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 15, dayClosed: true, forceType: "competition" });
assertNarrativeDepth(competition, "competition");
assert(competition.dialogues.length === 2 && applyEcologyNarrativeDecision(reserve, competition.id, "natural_shift").ok, "competition must preserve two incompatible group needs and natural displacement");

assert(relationCandidates(reserve, "symbiotic").length > 0, "populated species must derive conditional mutualism from the relationship matrix");
const symbiosis = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 17, dayClosed: true, forceType: "symbiosis" });
assertNarrativeDepth(symbiosis, "symbiosis");
assert(/别把这叫成友谊/.test(symbiosis.dialogues[1].text), "mutualism must not be flattened into a sentimental friendship story");
assert(applyEcologyNarrativeDecision(reserve, symbiosis.id, "preserve_process").ok, "preserving mutualism must retain a real safety tradeoff");

const normalized = normalizeEcologyNarrative(reserve.ecologyNarrative);
assert(normalized.history.length === 9 && Object.keys(normalized.artifacts).length === 9, "all dynamic event classes and three-layer evidence must survive save normalization");
assert(Object.values(normalized.threads).every((thread) => thread.status === "watching"), "resolved events must remain open as long-term observation threads");
assert.strictEqual(resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 10, dayClosed: false, forceType: "birth" }), null, "living-world events only settle at the nightly ecological boundary");

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "生态测试员");
game.screen = "home";
const uiReserve = game.state.world.reserve;
const uiEvent = resolveEcologyNarrativeEvent(uiReserve, clone(uiReserve), { day: 1, dayClosed: true, forceType: "predation" });
assert(uiEvent && game.openPendingEcologyDecision(), "nightly event must open a player decision after settlement");
assert(game.infoDetailModal.kind === "ecologyNarrativeDecision" && game.infoDetailModal.choices.length === 2, "ecology decision UI must expose two clear actions");
const decisionCopy = JSON.stringify(game.infoDetailModal.items);
assert(/现场/.test(decisionCopy) && /真实原因/.test(decisionCopy) && /两方立场/.test(decisionCopy) && /生态物证/.test(decisionCopy), "decision UI must explain scene, causality, conflicting voices and evidence");
const decisionModal = game.infoDetailModal;
assert(decisionModal.expandableItems, "ecology summaries should advertise that every row opens its full text");
assert(decisionModal.items.every((item) => !item.body), "ecology summary rows should keep explanations behind the view action");
assert.deepStrictEqual(decisionModal.choices.map((choice) => choice.label), ["保持观察", "救助伤者"], "ecology decision buttons should name concrete actions instead of repeating long plan titles");
assert(!/保护区无法取消自然法则|两个方案都能成立/.test(decisionCopy), "ecology summary and detail copy should remove repeated generic explanations");
const comparisonItem = decisionModal.items.find((item) => item.tag === "方案对比");
assert(comparisonItem && /代价：/.test(comparisonItem.detailBody) && !/（.+）\s*\//.test(comparisonItem.title), "choice costs should remain available in one compact comparison detail");
game.openInfoListItemDetail(decisionModal, decisionModal.items[0], 0);
assert(game.infoDetailModal.kind === "infoListItemDetail" && game.infoDetailModal.prose.includes(uiEvent.scene), "tapping an ecology summary should show its complete untruncated text");
assert(!game.infoDetailModal.meta && !/任务生成器|完成结算|完整记录|返回后/.test(game.infoDetailModal.prose), "expanded ecology text must not append redundant system or navigation explanations");
game.dismissInfoDetailModal();
assert.strictEqual(game.infoDetailModal, decisionModal, "returning from full text must preserve the pending decision and both choices");
game.infoDetailModal.choices[0].action();
assert(game.infoDetailModal.kind === "ecologyNarrativeChoiceConfirm", "selecting a compact ecology action must open a detailed second confirmation instead of settling immediately");
assert(game.infoDetailModal.details.immediate && game.infoDetailModal.details.delayed, "ecology confirmation must explain immediate effect and delayed debt");
assert(game.infoDetailModal.availability.available, "a no-cost ecology action should remain operable");
game.confirmEcologyNarrativeChoice();
assert(game.infoDetailModal.kind === "ecologyNarrativeOutcome" && /长期线/.test(JSON.stringify(game.infoDetailModal.items)), "choice UI must show the persisted consequence and long thread");
assert(!/同一份存档|后续生态事件会读取|记录用于理解/.test(JSON.stringify(game.infoDetailModal.items)), "ecology outcome must not expose implementation commentary as player-facing story");

const blockedGame = new Game();
blockedGame.stopLoop();
blockedGame.render = () => {};
blockedGame.state = createCharacter(null, "资源测试员");
blockedGame.screen = "home";
blockedGame.state.world.reserve.fund = 0;
blockedGame.state.world.reserve.migration = { trend: "out", delta: -4, reason: "水线收缩" };
const blockedMigration = resolveEcologyNarrativeEvent(blockedGame.state.world.reserve, clone(blockedGame.state.world.reserve), { day: 2, dayClosed: true, forceType: "migration" });
assert(blockedMigration && blockedGame.openPendingEcologyDecision(), "migration decision must still open when the costly option is unaffordable");
const guardButton = blockedGame.infoDetailModal.choices.find((choice) => choice.id === "corridor_guard");
assert(guardButton && guardButton.label === "护送过通道", "migration action should use a clear compact label");
guardButton.action();
assert(blockedGame.infoDetailModal.kind === "ecologyNarrativeChoiceConfirm" && !blockedGame.infoDetailModal.availability.available, "an unaffordable action must open an explanation instead of looking unresponsive");
assert(blockedGame.infoDetailModal.availability.missingLabel === "保护基金 0/30" && blockedGame.infoDetailModal.availability.routeLabel === "去获得基金", "the blocked action must show the exact shortfall and a usable recovery route");

console.log("ecology narrative check ok (population causality, multi-animal voices, moral choices, artifacts, long threads)");
