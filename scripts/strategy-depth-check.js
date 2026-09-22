const { createCharacter } = require("../js/storage");
const { reserveProgressionFor, CHAPTER_PROGRESSION_GATES } = require("../js/simulator");
const { Game } = require("../js/game");
const {
  STRATEGIC_DILEMMAS,
  normalizeStrategyState,
  strategyRoute,
  recordStrategicAction,
  maybePrepareStrategicDilemma,
  strategicDilemmaById,
  adjustedEffectsFor,
  strategicResourceShortfall,
  strategicChoiceExpectedValue,
  strategicDicePreview,
  selectStrategicChoice,
  setPendingStrategicRoll,
  applyStrategicChoice
} = require("../js/strategySystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isBenefit(key, value) {
  return ["poacherPressure", "disease"].includes(key) ? value < 0 : value > 0;
}

const tactical = STRATEGIC_DILEMMAS.filter((item) => item.tier === "tactical");
const major = STRATEGIC_DILEMMAS.filter((item) => item.tier === "major");
assert(STRATEGIC_DILEMMAS.length === 28, `expected 28 strategic decisions, got ${STRATEGIC_DILEMMAS.length}`);
assert(tactical.length === 16 && major.length === 12, `expected 16 tactical + 12 major, got ${tactical.length} + ${major.length}`);
tactical.forEach((dilemma) => assert(dilemma.choices.length === 1, `${dilemma.id} should be a single-choice decision`));
major.forEach((dilemma) => assert(dilemma.choices.length === 3, `${dilemma.id} should be a three-choice decision`));
STRATEGIC_DILEMMAS.forEach((dilemma) => {
  const expectedValues = dilemma.choices.map(strategicChoiceExpectedValue);
  if (dilemma.choices.length >= 2) {
    assert(Math.max(...expectedValues) - Math.min(...expectedValues) <= 8, `${dilemma.id} has a long-term fixed-best option (${expectedValues.join("/")})`);
  }
  dilemma.choices.forEach((choice) => {
    const effects = Object.entries(choice.effects || {});
    const delayed = Object.entries((choice.consequence && choice.consequence.modifiers) || {});
    const tradeoffs = effects.concat(delayed);
    assert(tradeoffs.some(([key, value]) => isBenefit(key, value)), `${dilemma.id}.${choice.id} needs a real benefit`);
    assert(tradeoffs.some(([key, value]) => !isBenefit(key, value)), `${dilemma.id}.${choice.id} needs a real cost`);
    assert(choice.consequence && choice.consequence.remainingActions >= 4 && choice.consequence.remainingActions <= 10, `${dilemma.id}.${choice.id} consequence must last 4-10 actions`);
    assert(choice.balanceScore >= 90 && choice.balanceScore <= 110, `${dilemma.id}.${choice.id} expected value should stay within 10%`);
  });
});
assert(major.filter((dilemma) => dilemma.requiresDilemmaId).length === 5, "five major decisions should continue earlier chains");
assert(major.every((dilemma) => dilemma.choices.some((choice) => choice.risk === "risky" && choice.dice && choice.dice.sides === 6)), "every major decision should contain a visible six-sided-die risk option");
const requiredTotalChoices = Object.values(CHAPTER_PROGRESSION_GATES).reduce((sum, gate) => sum + gate.strategicChoices, 0);
const requiredMajorChoices = Object.values(CHAPTER_PROGRESSION_GATES).reduce((sum, gate) => sum + gate.majorChoices, 0);
const totalCapacity = STRATEGIC_DILEMMAS.reduce((sum, dilemma) => sum + (dilemma.maxOccurrences || 1), 0);
assert(totalCapacity >= requiredTotalChoices && major.length >= requiredMajorChoices, "campaign event capacity must satisfy every chapter gate");

const capacityRun = createCharacter(null, "保护区卫士").world.reserve;
capacityRun.progression.level = 5;
capacityRun.mysteryEvidence.evidence = { test: 1 };
capacityRun.safety = 82;
capacityRun.reputation = 82;
capacityRun.poacherPressure = 58;
capacityRun.ecology.water = 62;
capacityRun.ecology.disease = 25;
for (let actionIndex = 1; actionIndex <= 400; actionIndex += 1) {
  capacityRun.progression.totalActions = actionIndex;
  capacityRun.strategy.totalMeaningfulActions = actionIndex;
  const pending = maybePrepareStrategicDilemma(capacityRun, { day: actionIndex, totalActions: actionIndex, meaningfulActions: actionIndex }, () => 0);
  if (!pending) continue;
  const dilemma = strategicDilemmaById(pending.id);
  const selected = dilemma.choices[capacityRun.strategy.totalChoices % dilemma.choices.length];
  const dice = selected.dice ? { roll: 6, routeModifier: 1, resourceModifier: 1 } : null;
  assert(applyStrategicChoice(capacityRun, dilemma.id, selected.id, dice), `capacity decision ${dilemma.id} should resolve`);
}
const finalGate = CHAPTER_PROGRESSION_GATES[10];
assert(capacityRun.strategy.totalChoices >= finalGate.strategicChoices && capacityRun.strategy.totalMajorChoices >= finalGate.majorChoices, "the final chapter must not deadlock before its strategy gates are met");

const repeated = createCharacter(null, "保护区卫士").world.reserve;
const first = recordStrategicAction(repeated, "houndScout");
const second = recordStrategicAction(repeated, "houndScout");
const meaningfulBeforeThird = repeated.strategy.totalMeaningfulActions;
const third = recordStrategicAction(repeated, "houndScout");
assert(first.meaningful && second.meaningful, "first two repeated actions should remain meaningful");
assert(!third.meaningful && third.penalty === 1, "third identical action should diminish and stop counting");
assert(repeated.strategy.totalMeaningfulActions === meaningfulBeforeThird, "diminished action must not advance chapter operations");

const varied = createCharacter(null, "保护区卫士").world.reserve;
const fundBeforeVariety = varied.fund;
recordStrategicAction(varied, "houndScout");
recordStrategicAction(varied, "habitat");
const variety = recordStrategicAction(varied, "antiPoacher");
assert(variety.varietyBonus && varied.fund > fundBeforeVariety - 200, "three different actions should create a visible coordination bonus");

const ecologyPassive = createCharacter(null, "保护区卫士").world.reserve;
ecologyPassive.strategy = normalizeStrategyState({ dominantRoute: "ecology", routeScores: { enforcement: 0, ecology: 20, research: 0, community: 0 } });
ecologyPassive.ecology.disease = 20;
recordStrategicAction(ecologyPassive, "habitat");
assert(ecologyPassive.ecology.disease === 19, "ecology habitat work should relieve one point of disease pressure");
recordStrategicAction(ecologyPassive, "intervention");
assert(ecologyPassive.ecology.disease === 17, "ecology intervention should relieve two points of disease pressure");

const transition = createCharacter(null, "保护区卫士").world.reserve;
transition.strategy = normalizeStrategyState({ dominantRoute: "enforcement", routeScores: { enforcement: 30, ecology: 0, research: 0, community: 0 } });
for (let index = 0; index < 14; index += 1) recordStrategicAction(transition, index % 2 ? "intervention" : "habitat");
assert(strategyRoute(transition).id === "ecology", "continuous off-route play should transform a capped long-running route");
assert(Math.max(...Object.values(transition.strategy.routeScores)) <= 30, "route scores must remain bounded in long saves");

const repeatedCadence = createCharacter(null, "保护区卫士").world.reserve;
for (let index = 0; index < 20; index += 1) recordStrategicAction(repeatedCadence, "houndScout");
assert(repeatedCadence.strategy.totalMeaningfulActions === 2, "repeated farming should stop advancing meaningful actions");
assert(!maybePrepareStrategicDilemma(repeatedCadence, { day: 20, totalActions: 20, meaningfulActions: repeatedCadence.strategy.totalMeaningfulActions }, () => 0), "repeated non-meaningful actions must not farm strategy events");

const cadence = createCharacter(null, "保护区卫士").world.reserve;
cadence.progression.level = 1;
cadence.ecology.water = 60;
const triggerActions = [];
for (let actionIndex = 1; actionIndex <= 24; actionIndex += 1) {
  cadence.progression.totalActions = actionIndex;
  cadence.strategy.totalMeaningfulActions = actionIndex;
  const pending = maybePrepareStrategicDilemma(cadence, { day: actionIndex, totalActions: actionIndex, meaningfulActions: actionIndex }, () => 0);
  if (!pending) continue;
  triggerActions.push({ actionIndex, tier: pending.tier });
  const dilemma = strategicDilemmaById(pending.id);
  const choice = dilemma.choices[0];
  assert(applyStrategicChoice(cadence, dilemma.id, choice.id), `decision ${dilemma.id} should resolve`);
}
assert(triggerActions.some((item) => item.tier === "tactical" && item.actionIndex >= 3 && item.actionIndex <= 5), "first tactical decision should arrive after 3-5 actions");
assert(triggerActions.some((item) => item.tier === "major" && item.actionIndex >= 10 && item.actionIndex <= 14), "first major decision should arrive after 10-14 actions");
triggerActions.forEach((item, index) => {
  if (index) assert(item.actionIndex - triggerActions[index - 1].actionIndex >= 2, "strategy popups must leave normal operations between decisions");
});

const chainReserve = createCharacter(null, "保护区卫士").world.reserve;
chainReserve.progression.level = 3;
chainReserve.strategy = normalizeStrategyState({
  totalChoices: 1,
  totalMajorChoices: 1,
  choiceHistory: [{ dilemmaId: "water_access", choiceId: "open_water", route: "community", tier: "major", day: 10 }]
});
chainReserve.progression.totalActions = 20;
chainReserve.strategy.lastMajorAction = 5;
let chainPending = null;
for (let actionIndex = 20; actionIndex <= 35 && !chainPending; actionIndex += 1) {
  chainReserve.strategy.totalMeaningfulActions = actionIndex;
  chainPending = maybePrepareStrategicDilemma(chainReserve, { day: actionIndex, totalActions: actionIndex, meaningfulActions: actionIndex }, () => 0);
  if (chainPending && chainPending.tier !== "major") {
    const tacticalDecision = strategicDilemmaById(chainPending.id);
    applyStrategicChoice(chainReserve, tacticalDecision.id, tacticalDecision.choices[0].id);
    chainPending = null;
  }
}
assert(chainPending && chainPending.tier === "major", "eligible chained major decision should trigger");
if (chainPending.id === "water_governance") assert(chainPending.sourceChoiceId === "open_water" && chainPending.sourceRoute === "community", "follow-up should remember the previous branch");

const routeBase = createCharacter(null, "保护区卫士").world.reserve;
routeBase.strategy = normalizeStrategyState({ dominantRoute: "community", routeScores: { community: 14, enforcement: 2, ecology: 1, research: 0 } });
const waterDecision = strategicDilemmaById("water_access");
routeBase.strategy.pendingDilemma = { id: "water_access", tier: "major", day: 12, actionIndex: 12, chapter: 1 };
const communityChoice = waterDecision.choices.find((item) => item.route === "community");
const aligned = adjustedEffectsFor(routeBase, waterDecision, communityChoice, communityChoice.effects);
assert(aligned.routeAligned && aligned.effects.water > communityChoice.effects.water, "aligned route should strengthen benefits");
assert(aligned.effects.fund >= communityChoice.effects.fund, "aligned route should strengthen a positive fund effect");

const poorReserve = clone(routeBase);
poorReserve.fund = 0;
poorReserve.intel = 0;
poorReserve.supplies = { dogFood: 0, alarm: 0, tranquilizer: 0, medicalKit: 0, fieldKit: 0 };
poorReserve.strategy.pendingDilemma = { id: "water_access", tier: "major", day: 12, actionIndex: 12, chapter: 1 };
const costlyChoice = waterDecision.choices.find((item) => (item.effects.fund || 0) < 0);
const shortfall = strategicResourceShortfall(poorReserve, costlyChoice.effects);
const poorBefore = { fund: poorReserve.fund, grass: poorReserve.ecology.grass };
const poorResult = applyStrategicChoice(poorReserve, waterDecision.id, costlyChoice.id);
assert(shortfall.fund === 0 && poorResult.resourceShortfall.fund === 0, "legacy strategy costs must not restore a hidden fund gate");
assert(poorReserve.fund === poorBefore.fund && poorReserve.ecology.grass === poorBefore.grass, "legacy strategy cost must not silently deduct fund or grass when supplies are empty");
assert((poorReserve.resourceAging || {}).projectCostCarry === 20, "legacy project cost remainder must be preserved for proportional conversion");

const safeReserve = clone(routeBase);
const riskyReserveSuccess = clone(routeBase);
const riskyReserveFailure = clone(routeBase);
const safeChoice = waterDecision.choices[0];
const riskyChoice = waterDecision.choices[1];
safeReserve.strategy.pendingDilemma = { id: waterDecision.id, tier: "major", day: 12, actionIndex: 12, chapter: 1 };
riskyReserveSuccess.strategy.pendingDilemma = clone(safeReserve.strategy.pendingDilemma);
riskyReserveFailure.strategy.pendingDilemma = clone(safeReserve.strategy.pendingDilemma);
assert(applyStrategicChoice(safeReserve, waterDecision.id, safeChoice.id), "safe strategic choice should resolve deterministically");
const needsDice = applyStrategicChoice(riskyReserveSuccess, waterDecision.id, riskyChoice.id);
assert(needsDice && needsDice.requiresDice, "risky strategic choice should require player dice input");
const dicePreview = strategicDicePreview(riskyReserveSuccess, waterDecision, riskyChoice);
const success = applyStrategicChoice(riskyReserveSuccess, waterDecision.id, riskyChoice.id, { roll: 6, routeModifier: dicePreview.routeModifier, resourceModifier: dicePreview.resourceModifier });
const failure = applyStrategicChoice(riskyReserveFailure, waterDecision.id, riskyChoice.id, { roll: 1, routeModifier: 0, resourceModifier: 0 });
assert(success.dice.success && !failure.dice.success, "six-sided die should expose both success and failure branches");
assert(JSON.stringify(success.after) !== JSON.stringify(failure.after), "dice success and failure should change actual values differently");

const persisted = createCharacter(null, "保护区卫士").world.reserve;
persisted.strategy = normalizeStrategyState({ pendingDilemma: { id: "water_access", tier: "major", day: 8, actionIndex: 8, chapter: 1 } });
assert(selectStrategicChoice(persisted, "water_access", "open_water"), "selected option should persist before confirmation");
setPendingStrategicRoll(persisted, { dilemmaId: "water_access", choiceId: "open_water", roll: 4, phase: "resolved" });
const restored = normalizeStrategyState(clone(persisted.strategy));
assert(restored.pendingSelection.choiceId === "open_water" && restored.pendingRoll.roll === 4, "selection and pending die must survive save restoration");

Object.values(CHAPTER_PROGRESSION_GATES).forEach((gate) => {
  assert(gate.strategicChoices >= 1 && gate.strategicChoices <= 11, `stage ${gate.stage} should require a bounded number of strategic choices`);
  assert(gate.majorChoices >= 0 && gate.majorChoices <= 3, `stage ${gate.stage} major-choice gate should remain achievable`);
});
assert([2, 4, 6, 8, 10].map((stage) => CHAPTER_PROGRESSION_GATES[stage].strategicChoices).join(",") === "3,4,5,5,4", "story-chapter decision totals should fit the 27-41 day campaign");
assert([2, 4, 6, 8, 10].map((stage) => CHAPTER_PROGRESSION_GATES[stage].majorChoices).join(",") === "1,1,2,2,1", "story-chapter major decisions should stay weighty without stalling the campaign");
const gate = CHAPTER_PROGRESSION_GATES[2];
const gated = createCharacter(null, "保护区卫士").world.reserve;
gated.safety = 100;
gated.stability = 100;
gated.reputation = 100;
gated.poacherPressure = 0;
gated.ecology.water = 100;
gated.ecology.grass = 100;
gated.ecology.herbivores.deer = 120;
gated.ecology.herbivores.antelope = 150;
gated.ecology.herbivores.hare = 200;
gated.guardianRun.score = 100;
gated.progression = Object.assign({}, gated.progression, {
  level: 1, stage: 2, totalActions: gate.actions, totalMeaningfulActions: gate.actions,
  totalStrategicChoices: gate.strategicChoices, totalMajorStrategicChoices: 0,
  activeSeconds: 0, totalFundEarned: gate.fundEarned,
  totalMigratedIn: gate.migratedIn, totalRareRecovered: gate.rareRecovered,
  stageStart: { stage: 2, level: 1, totalActions: 0, totalMeaningfulActions: 0, totalStrategicChoices: 0, totalMajorStrategicChoices: 0, activeSeconds: 0, totalFundEarned: 0, totalMigratedIn: 0, totalRareRecovered: 0 }
});
gated.strategy = normalizeStrategyState({ totalMeaningfulActions: gate.actions, totalChoices: gate.strategicChoices, totalMajorChoices: 0 });
gated.eventChain = { chapterLevel: 1, step: gate.storyBeats, length: 7, completed: true };
gated.chapterRescue = Object.assign({}, gated.chapterRescue || {}, { enforceCompletion: false, legacyGateBypass: true });
gated.development = gated.development || {};
gated.development.operations = Object.assign({}, gated.development.operations || {}, { totalVisitors: 1000 });
gated.development.operations.visitorLedger = { totalVisitors: 1000 };
["wolf", "fox", "owl", "crow"].forEach((id, index) => {
  const group = index < 2 ? "predators" : "birds";
  gated.ecology[group][id] = Math.max(1, Number(gated.ecology[group][id]) || 0);
});
assert(reserveProgressionFor(gated).stage === 3 && reserveProgressionFor(gated).level === 2, "live core metrics must advance without a hidden major-decision gate");
gated.progression.totalMajorStrategicChoices = gate.majorChoices;
gated.strategy.totalMajorChoices = gate.majorChoices;
assert(reserveProgressionFor(gated).stage === 3 && reserveProgressionFor(gated).level === 2, "stage should remain in the next story level after total and major choices pass");

const uiGame = new Game();
uiGame.stopLoop();
uiGame.render = () => {};
uiGame.state = createCharacter(null, "保护区卫士");
uiGame.screen = "home";
uiGame.state.world.reserve.strategy = normalizeStrategyState({ pendingDilemma: { id: "water_access", tier: "major", day: 8, actionIndex: 8, chapter: 1 } });
uiGame.infoDetailModal = null;
assert(uiGame.openPendingStrategicDilemma(), "pending major decision should open a player-facing popup");
assert(uiGame.infoDetailModal.choiceCards.length === 3, "major popup should expose all three option cards without truncation");
uiGame.selectStrategicDilemmaChoice("water_access", "hide_springs");
assert(uiGame.infoDetailModal.selectedChoiceId === "hide_springs", "first tap should select, not immediately settle, the option");
uiGame.confirmStrategicChoice("water_access", "hide_springs");
assert(uiGame.infoDetailModal && uiGame.infoDetailModal.items.some((item) => /→/.test(item.title)), "confirmed deterministic choice should show exact before-to-after values");

console.log("strategy depth check ok (28 decisions, layered cadence, routes, chains, dice, persistence, UI)");
