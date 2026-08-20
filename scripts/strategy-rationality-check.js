const { createCharacter } = require("../js/storage");
const { CHAPTER_PROGRESSION_GATES } = require("../js/simulator");
const {
  STRATEGIC_DILEMMAS,
  normalizeStrategyState,
  strategyRoute,
  maybePrepareStrategicDilemma,
  strategicDilemmaById,
  strategicDicePreview,
  strategicChoiceExpectedValue,
  strategicResourceShortfall,
  applyStrategicChoice
} = require("../js/strategySystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function prepareHealthyReserve() {
  const reserve = createCharacter(null, "保护区卫士").world.reserve;
  reserve.fund = 5000;
  reserve.intel = 4;
  reserve.safety = 82;
  reserve.stability = 78;
  reserve.reputation = 78;
  reserve.enforcement = 70;
  reserve.poacherPressure = 50;
  reserve.ecology.water = 64;
  reserve.ecology.grass = 66;
  reserve.ecology.disease = 24;
  reserve.mysteryEvidence.evidence = { balance_test: { id: "balance_test" } };
  reserve.strategy = normalizeStrategyState(reserve.strategy);
  return reserve;
}

STRATEGIC_DILEMMAS.forEach((dilemma) => {
  const values = dilemma.choices.map(strategicChoiceExpectedValue);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  assert(Math.max(...values) - Math.min(...values) <= 8, `${dilemma.id} expected values drift too far: ${values.join("/")}`);
  if (dilemma.tier === "major") {
    assert(dilemma.choices.map((choice) => choice.risk).join(",") === "safe,risky,balanced", `${dilemma.id} should present safe, risky, balanced in a stable order`);
  }
  dilemma.choices.forEach((choice) => {
    assert(choice.balanceScore === Math.round(100 + choice.expectedValue - average), `${dilemma.id}.${choice.id} balance score must be derived from actual effects`);
  });
});

const reachedEvents = new Set();
for (let seed = 1; seed <= 40; seed += 1) {
  const random = seededRandom(8100 + seed * 97);
  const reserve = prepareHealthyReserve();
  let meaningfulActions = 0;
  let storyChoiceStart = 0;
  let storyMajorStart = 0;
  Object.values(CHAPTER_PROGRESSION_GATES).forEach((gate) => {
    reserve.progression.level = gate.storyLevel;
    reserve.progression.stage = gate.stage;
    if (gate.stage % 2 === 1) {
      storyChoiceStart = reserve.strategy.totalChoices;
      storyMajorStart = reserve.strategy.totalMajorChoices;
    }
    // Stage action targets are minimums. The five-action headroom mirrors the
    // normal 3-5-operation event cadence and proves the choice gate cannot
    // remain unavailable after the numeric target is reached.
    const actionBudget = gate.actions + 5;
    for (let chapterAction = 1; chapterAction <= actionBudget; chapterAction += 1) {
      meaningfulActions += 1;
      reserve.strategy.totalMeaningfulActions = meaningfulActions;
      reserve.progression.totalActions = meaningfulActions;
      reserve.progression.totalMeaningfulActions = meaningfulActions;
      reserve.seasonState.name = meaningfulActions % 20 < 10 ? "雨季" : "旱季";
      const pending = maybePrepareStrategicDilemma(reserve, { day: meaningfulActions, totalActions: meaningfulActions, meaningfulActions, animalTrust: 72, season: reserve.seasonState.name }, random);
      if (!pending) continue;
      const dilemma = strategicDilemmaById(pending.id);
      reachedEvents.add(dilemma.id);
      const selected = dilemma.choices[Math.floor(random() * dilemma.choices.length)];
      const dicePreview = selected.dice ? strategicDicePreview(reserve, dilemma, selected) : null;
      const dice = selected.dice ? {
        roll: 1 + Math.floor(random() * 6),
        routeModifier: dicePreview.routeModifier,
        resourceModifier: dicePreview.resourceModifier
      } : null;
      assert(applyStrategicChoice(reserve, dilemma.id, selected.id, dice), `${dilemma.id}.${selected.id} should resolve`);
    }
    const storyChoices = reserve.strategy.totalChoices - storyChoiceStart;
    const storyMajorChoices = reserve.strategy.totalMajorChoices - storyMajorStart;
    assert(storyChoices >= gate.strategicChoices, `seed ${seed} stage ${gate.stage} only produced ${storyChoices}/${gate.strategicChoices} story choices`);
    assert(storyMajorChoices >= gate.majorChoices, `seed ${seed} stage ${gate.stage} only produced ${storyMajorChoices}/${gate.majorChoices} story major choices`);
  });
}
STRATEGIC_DILEMMAS.filter((dilemma) => dilemma.routeRequirement).forEach((target) => {
  for (let sample = 0; sample < 100 && !reachedEvents.has(target.id); sample += 1) {
    const reserve = prepareHealthyReserve();
    const meaningfulActions = target.minActions + 8;
    reserve.progression.level = target.minChapter;
    reserve.strategy = normalizeStrategyState({
      dominantRoute: target.routeRequirement,
      routeScores: { [target.routeRequirement]: 14 },
      totalMeaningfulActions: meaningfulActions,
      lastMajorAction: meaningfulActions
    });
    const pending = maybePrepareStrategicDilemma(reserve, { day: meaningfulActions, totalActions: meaningfulActions, meaningfulActions }, () => sample / 100);
    if (pending) reachedEvents.add(pending.id);
  }
});
STRATEGIC_DILEMMAS.filter((dilemma) => !reachedEvents.has(dilemma.id)).forEach((target) => {
  for (let sample = 0; sample < 120 && !reachedEvents.has(target.id); sample += 1) {
    const reserve = prepareHealthyReserve();
    const meaningfulActions = target.minActions + 14;
    reserve.fund = 500;
    reserve.intel = 2;
    reserve.business = 48;
    reserve.seasonState.name = (target.seasons || ["雨季"])[0];
    reserve.progression.level = target.minChapter;
    const history = target.requiresDilemmaId ? [{
      dilemmaId: target.requiresDilemmaId,
      choiceId: "targeted_parent",
      route: target.routeRequirement || "ecology",
      tier: "major",
      chapter: Math.max(1, target.minChapter - 1),
      day: 1
    }] : [];
    reserve.strategy = normalizeStrategyState({
      dominantRoute: target.routeRequirement || "balanced",
      routeScores: target.routeRequirement ? { [target.routeRequirement]: 14 } : {},
      choiceHistory: history,
      totalMeaningfulActions: meaningfulActions,
      lastMajorAction: target.tier === "tactical" ? meaningfulActions : 0,
      lastTacticalAction: 0
    });
    const pending = maybePrepareStrategicDilemma(reserve, {
      day: meaningfulActions,
      totalActions: meaningfulActions,
      meaningfulActions,
      animalTrust: 72,
      season: reserve.seasonState.name
    }, () => sample / 120);
    if (pending) reachedEvents.add(pending.id);
  }
});
const missingEvents = STRATEGIC_DILEMMAS.filter((dilemma) => !reachedEvents.has(dilemma.id)).map((dilemma) => dilemma.id);
assert(reachedEvents.size === STRATEGIC_DILEMMAS.length, `multi-seed chapter runs should reach all events, got ${reachedEvents.size}/${STRATEGIC_DILEMMAS.length}; missing ${missingEvents.join(",")}`);

STRATEGIC_DILEMMAS.forEach((dilemma) => {
  dilemma.choices.forEach((choice) => {
    const reserve = prepareHealthyReserve();
    reserve.fund = 0;
    reserve.intel = 0;
    const shortfall = strategicResourceShortfall(reserve, choice.effects);
    if ((choice.effects.fund || 0) >= 0 && (choice.effects.intel || 0) >= 0) return;
    reserve.strategy.pendingDilemma = { id: dilemma.id, tier: dilemma.tier, day: 10, actionIndex: 10, chapter: dilemma.minChapter };
    const dicePreview = choice.dice ? strategicDicePreview(reserve, dilemma, choice) : null;
    const result = applyStrategicChoice(reserve, dilemma.id, choice.id, choice.dice ? { roll: 6, routeModifier: dicePreview.routeModifier, resourceModifier: dicePreview.resourceModifier } : null);
    assert(result && result.resourceShortfall, `${dilemma.id}.${choice.id} should report resource shortfall`);
    assert(result.resourceShortfall.fund === shortfall.fund && result.resourceShortfall.intel === shortfall.intel, `${dilemma.id}.${choice.id} shortfall preview must equal settlement`);
  });
});

const transition = prepareHealthyReserve();
transition.strategy = normalizeStrategyState({ dominantRoute: "enforcement", routeScores: { enforcement: 30, ecology: 0, research: 0, community: 0 } });
const ecologyChoices = STRATEGIC_DILEMMAS.flatMap((dilemma) => dilemma.choices.map((choice) => ({ dilemma, choice }))).filter((item) => item.choice.route === "ecology" && !item.choice.dice).slice(0, 8);
ecologyChoices.forEach(({ dilemma, choice }, index) => {
  transition.strategy.pendingDilemma = { id: dilemma.id, tier: dilemma.tier, day: index + 1, actionIndex: index + 1, chapter: dilemma.minChapter };
  applyStrategicChoice(transition, dilemma.id, choice.id);
});
assert(strategyRoute(transition).id === "ecology", "eight deliberate cross-route choices should transform an old maxed route");
assert(Math.max(...Object.values(transition.strategy.routeScores)) <= 30, "route scores should remain capped after transition");

console.log(`strategy rationality check ok (40 seeds × 5 chapters, ${reachedEvents.size} events, real balance values, shortfalls, route transition)`);
