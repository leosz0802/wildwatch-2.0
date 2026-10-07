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
assert(applyEcologyNarrativeDecision(reserve, territorial.id, "buffer").ok, "territorial buffer must resolve without inventing a perfect truce");

reserve.ecology.water = 78;
reserve.ecology.grass = 72;
reserve.ecology.disease = 8;
const birth = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 9, dayClosed: true, forceType: "birth" });
assertNarrativeDepth(birth, "birth");
assert(/不属于保护区的成绩单/.test(birth.scene), "birth must retain animal autonomy instead of becoming a reward popup");
const birthVisitors = chapterVisitorTotal(reserve);
const birthBreeding = animalSourceSummary(reserve).breeding;
const birthTasked = animalSourceSummary(reserve).tasked;
assert(applyEcologyNarrativeDecision(reserve, birth.id, "quiet_guard").ok, "quiet-guard choice must preserve natural risk");
assert.equal(animalSourceSummary(reserve).breeding, birthBreeding, "narrative birth must not steal breeding remainder");
assert.equal(animalSourceSummary(reserve).tasked, birthTasked + 1);
assert.equal(chapterVisitorTotal(reserve), birthVisitors, "narrative animal change must not rewrite visitors");

reserve.migration = { trend: "out", delta: -4, reason: "水线收缩使队伍转向保护区外缘" };
const migration = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 11, dayClosed: true, forceType: "migration" });
assertNarrativeDepth(migration, "migration");
assert(applyEcologyNarrativeDecision(reserve, migration.id, "corridor_guard").ok, "migration must remain an animal choice when the player holds the corridor");

reserve.ecology.disease = 32;
const juvenileLoss = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 13, dayClosed: true, forceType: "juvenile_loss" });
assertNarrativeDepth(juvenileLoss, "juvenile_loss");
assert(/不是忘记/.test(juvenileLoss.dialogues[0].text), "juvenile death must carry grief without turning loss into spectacle");
assert(applyEcologyNarrativeDecision(reserve, juvenileLoss.id, "emergency_care").ok, "limited medical intervention must consume stock and retain disturbance consequences");

assert(relationCandidates(reserve, "competition").length > 0, "populated species must derive resource competition from the relationship matrix");
const competition = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 15, dayClosed: true, forceType: "competition" });
assertNarrativeDepth(competition, "competition");
assert(competition.dialogues.length === 2 && applyEcologyNarrativeDecision(reserve, competition.id, "seasonal_zones").ok, "competition must preserve two incompatible group needs and a remaining seasonal-zone action");

assert(relationCandidates(reserve, "symbiotic").length > 0, "populated species must derive conditional mutualism from the relationship matrix");
const symbiosis = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 17, dayClosed: true, forceType: "symbiosis" });
assertNarrativeDepth(symbiosis, "symbiosis");
assert(/别把这叫成友谊/.test(symbiosis.dialogues[1].text), "mutualism must not be flattened into a sentimental friendship story");
assert(applyEcologyNarrativeDecision(reserve, symbiosis.id, "preserve_process").ok, "preserving mutualism must retain a real safety tradeoff");

reserve.seasonState = Object.assign({}, reserve.seasonState || {}, { name: "旱季", weather: "热浪" });
const weatherEvent = resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 19, dayClosed: true, forceType: "weather" });
assertNarrativeDepth(weatherEvent, "weather");
assert(/热浪|暴雨|沙尘|寒雾|天气/.test(`${weatherEvent.title}${weatherEvent.scene}`), "weather narrative must describe the abnormal climate");
assert(applyEcologyNarrativeDecision(reserve, weatherEvent.id, "open_shelter").ok, "weather observation must resolve without requiring a perfect shelter");

const normalized = normalizeEcologyNarrative(reserve.ecologyNarrative);
assert(normalized.history.length === 10 && Object.keys(normalized.artifacts).length === 10, "all dynamic event classes and three-layer evidence must survive save normalization");
assert(Object.values(normalized.threads).every((thread) => thread.status === "watching"), "resolved events must remain open as long-term observation threads");
assert.strictEqual(resolveEcologyNarrativeEvent(reserve, clone(reserve), { day: 10, dayClosed: false, forceType: "birth" }), null, "living-world events only settle at the nightly ecological boundary");

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "生态测试员");
game.screen = "home";
const uiReserve = game.state.world.reserve;
const uiEvent = resolveEcologyNarrativeEvent(uiReserve, clone(uiReserve), { day: 1, dayClosed: true, forceType: "predation" });
assert(uiEvent && game.openPendingEcologyDecision(), "nightly event must open a player decision after settlement");
assert(game.infoDetailModal.kind === "ecologyNarrativeDecision" && game.infoDetailModal.choices.length === 1, "ecology decision UI must expose a single clear action");
const decisionCopy = JSON.stringify(game.infoDetailModal.items);
assert(/现场/.test(decisionCopy) && /真实原因/.test(decisionCopy) && /两方立场/.test(decisionCopy) && /生态物证/.test(decisionCopy), "decision UI must explain scene, causality, conflicting voices and evidence");
const decisionModal = game.infoDetailModal;
assert(decisionModal.expandableItems, "ecology summaries should advertise that every row opens its full text");
assert(decisionModal.items.every((item) => !item.body), "ecology summary rows should keep explanations behind the view action");
assert.deepStrictEqual(decisionModal.choices.map((choice) => choice.label), ["保持观察"], "ecology decision buttons should name a concrete action instead of repeating a long plan title");
assert(!/保护区无法取消自然法则|两个方案都能成立/.test(decisionCopy), "ecology summary and detail copy should remove repeated generic explanations");
const comparisonItem = decisionModal.items.find((item) => item.tag === "方案");
assert(comparisonItem && /代价：/.test(comparisonItem.detailBody) && !/（.+）\s*\//.test(comparisonItem.title), "choice costs should remain available in one compact comparison detail");
game.openInfoListItemDetail(decisionModal, decisionModal.items[0], 0);
assert(game.infoDetailModal.kind === "infoListItemDetail" && game.infoDetailModal.prose.includes(uiEvent.scene), "tapping an ecology summary should show its complete untruncated text");
assert(!game.infoDetailModal.meta && !/任务生成器|完成结算|完整记录|返回后/.test(game.infoDetailModal.prose), "expanded ecology text must not append redundant system or navigation explanations");
game.dismissInfoDetailModal();
assert.strictEqual(game.infoDetailModal, decisionModal, "returning from full text must preserve the pending decision");
const dilemmaCard = (decisionModal.summaryItems || []).find((item) => item.tag === "两难");
assert(dilemmaCard && /代价：/.test(dilemmaCard.detailBody || ""), "the dilemma card must fold the remaining action cost into the first screen");
assert(decisionModal.availability && decisionModal.availability.available, "a no-cost ecology action should remain operable");
game.infoDetailModal.choices[0].action();
assert(game.infoDetailModal.kind === "ecologyNarrativeDecision" && game.infoDetailModal.phase === "result", "selecting a compact ecology action must settle on the same screen");
assert(game.infoDetailModal.kind === "ecologyNarrativeDecision" && /长期线/.test(JSON.stringify(game.infoDetailModal.items)), "choice UI must show the persisted consequence and long thread");
assert(!/同一份存档|后续生态事件会读取|记录用于理解/.test(JSON.stringify(game.infoDetailModal.items)), "ecology outcome must not expose implementation commentary as player-facing story");

const blockedGame = new Game();
blockedGame.stopLoop();
blockedGame.render = () => {};
blockedGame.state = createCharacter(null, "资源测试员");
blockedGame.screen = "home";
blockedGame.state.world.reserve.fund = 0;
blockedGame.state.world.reserve.supplies = Object.assign({}, blockedGame.state.world.reserve.supplies || {}, { medicalKit: 0 });
blockedGame.state.world.reserve.ecology = Object.assign({}, blockedGame.state.world.reserve.ecology || {}, { disease: 28 });
const blockedDisease = resolveEcologyNarrativeEvent(blockedGame.state.world.reserve, clone(blockedGame.state.world.reserve), { day: 2, dayClosed: true, forceType: "disease" });
assert(blockedDisease && blockedGame.openPendingEcologyDecision(), "disease decision must still open when the remaining action is unaffordable");
const isolateButton = blockedGame.infoDetailModal.choices.find((choice) => choice.id === "isolate");
assert(isolateButton && isolateButton.label === "隔离水点", "disease action should use a clear compact label");
isolateButton.action();
assert(blockedGame.infoDetailModal.kind === "ecologyNarrativeDecision" && !blockedGame.infoDetailModal.availability.available, "an unaffordable action must stay on the decision screen and explain the shortfall");
assert(blockedGame.infoDetailModal.availability.missingLabel === "医疗包 0/1" && blockedGame.infoDetailModal.availability.routeLabel === "去找医疗包", "the blocked action must show the exact shortfall and a usable recovery route");

function assertCompactEcologyCards(modal, choiceId) {
  assert(modal && modal.kind === "ecologyNarrativeDecision", "ecology decision UI must stay on the single-choice screen");
  assert.equal((modal.summaryItems || []).length, 2, "ecology decision must show two summary cards");
  assert((modal.summaryItems || []).some((item) => item.tag === "游客影响"), "ecology decision must keep the visitor impact card");
  assert.equal((modal.choices || []).length, 1, "ecology decision must keep one compact action button");
  const dilemma = (modal.summaryItems || []).find((item) => item.tag === "两难");
  assert(dilemma && dilemma.title.length <= 12 && !/却会把/.test(dilemma.title), "dilemma card titles must be shortened before wrapping");
  assert(dilemma.detailBody && dilemma.detailBody.length > dilemma.title.length, "full dilemma copy must remain behind the view action");
  const picked = (modal.choices || []).find((choice) => choice.id === choiceId);
  assert(picked, `${choiceId} must remain the remaining action`);
  picked.action();
}

const competitionGame = new Game();
competitionGame.stopLoop();
competitionGame.render = () => {};
competitionGame.state = createCharacter(null, "竞争界面");
competitionGame.screen = "home";
const competitionReserve = competitionGame.state.world.reserve;
competitionReserve.ecology = competitionReserve.ecology || {};
competitionReserve.ecology.herbivores = Object.assign({}, competitionReserve.ecology.herbivores, { zebra: 22, antelope: 24, hare: 18 });
const competitionUi = resolveEcologyNarrativeEvent(competitionReserve, clone(competitionReserve), { day: 2, dayClosed: true, forceType: "competition" });
assert(competitionUi && competitionGame.openPendingEcologyDecision(), "competition event must open the compact single-choice UI");
assertCompactEcologyCards(competitionGame.infoDetailModal, "seasonal_zones");
assert.equal(competitionGame.infoDetailModal.kind, "ecologyNarrativeDecision");
assert.equal(competitionGame.infoDetailModal.phase, "result");
assert.equal(competitionGame.infoDetailModal.title, competitionUi.title);
assert.equal((competitionGame.infoDetailModal.summaryItems || []).length, 2, "ecology result must keep two cards");
assert((competitionGame.infoDetailModal.summaryItems || []).some((item) => item.tag === "游客影响"), "ecology result must keep visitor impact");
assert((competitionGame.infoDetailModal.summaryItems || []).every((item) => String(item.title || "").length <= 12), "ecology result card titles must stay short enough to wrap");

const fogGame = new Game();
fogGame.stopLoop();
fogGame.render = () => {};
fogGame.state = createCharacter(null, "寒雾界面");
fogGame.screen = "home";
const fogReserve = fogGame.state.world.reserve;
fogReserve.ecology = fogReserve.ecology || {};
fogReserve.ecology.herbivores = Object.assign({}, fogReserve.ecology.herbivores, { hare: 40, deer: 8 });
fogReserve.seasonState = Object.assign({}, fogReserve.seasonState || {}, { weather: "寒雾" });
const fogEvent = resolveEcologyNarrativeEvent(fogReserve, clone(fogReserve), { day: 2, dayClosed: true, forceType: "weather", weather: "寒雾" });
assert(fogEvent && /寒雾/.test(fogEvent.title) && fogGame.openPendingEcologyDecision(), "cold-fog hare event must open");
assertCompactEcologyCards(fogGame.infoDetailModal, "open_shelter");
assert.equal(fogGame.infoDetailModal.kind, "ecologyNarrativeDecision");
assert.equal(fogGame.infoDetailModal.phase, "result");
assert.equal(fogGame.infoDetailModal.title, fogEvent.title);
assert.equal((fogGame.infoDetailModal.summaryItems || []).length, 2, "open-shelter result must keep two cards");
assert((fogGame.infoDetailModal.summaryItems || []).some((item) => item.tag === "游客影响"), "open-shelter result must keep visitor impact");
assert((fogGame.infoDetailModal.summaryItems || []).every((item) => String(item.title || "").length <= 12), "open-shelter result titles must be compact");

const rotateReserve = createReserveState();
rotateReserve.ecology.grass = 30;
rotateReserve.ecology.herbivores = { hare: 90, deer: 40, zebra: 25, antelope: 20 };
const firstGraze = resolveEcologyNarrativeEvent(rotateReserve, clone(rotateReserve), { day: 21, dayClosed: true, forceType: "overgrazing" });
assert(firstGraze && applyEcologyNarrativeDecision(rotateReserve, firstGraze.id, "rest").ok, "first overgrazing must settle");
const secondGraze = resolveEcologyNarrativeEvent(rotateReserve, clone(rotateReserve), { day: 25, dayClosed: true, forceType: "overgrazing" });
assert(secondGraze, "second overgrazing must appear after cadence");
assert.notEqual((secondGraze.actors[0] || {}).id, (firstGraze.actors[0] || {}).id, "透支草场不能连续绑定同一食草动物");
assert.notEqual(secondGraze.title, firstGraze.title, "透支草场标题必须换种群");

const grazeGame = new Game();
grazeGame.stopLoop();
grazeGame.render = () => {};
grazeGame.state = createCharacter(null, "草场数字");
grazeGame.screen = "home";
const grazeReserve = grazeGame.state.world.reserve;
grazeReserve.ecology.grass = 32;
grazeReserve.ecology.herbivores = Object.assign({}, grazeReserve.ecology.herbivores, { hare: 80, deer: 36, zebra: 22 });
const grazeEvent = resolveEcologyNarrativeEvent(grazeReserve, clone(grazeReserve), { day: 6, dayClosed: true, forceType: "overgrazing" });
assert(grazeEvent && grazeGame.openPendingEcologyDecision(), "overgrazing result must open");
grazeGame.infoDetailModal.choices[0].action();
assert.equal(grazeGame.infoDetailModal.phase, "result");
const grazeVisitor = (grazeGame.infoDetailModal.summaryItems || []).find((item) => item.tag === "游客影响");
assert(grazeVisitor, "overgrazing result must keep visitor impact");
assert.equal(grazeVisitor.title, "游客未变", "没有入场游客时不能写成游客0再配一条158→161");
assert(!/\d+→\d+人/.test(String(grazeVisitor.body || "")), "结果卡不能把下次招募预报伪装成本次游客变化");
assert(/需求/.test(String(grazeVisitor.body || grazeVisitor.detailBody || "")), "无即时客流变化时应展示需求升降");

console.log("ecology narrative check ok (population causality, multi-animal voices, moral choices, artifacts, long threads)");
