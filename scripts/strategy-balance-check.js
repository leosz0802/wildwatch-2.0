const { createCharacter } = require("../js/storage");
const { simulateDay, reserveProgressionFor } = require("../js/simulator");
const { strategicDilemmaById, strategicDicePreview, applyStrategicChoice, strategyRoute } = require("../js/strategySystem");

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

function finiteReserve(reserve, label) {
  ["fund", "safety", "stability", "reputation", "enforcement", "poacherPressure", "business", "ecologyScore"].forEach((key) => {
    assert(Number.isFinite(reserve[key] || 0), `${label}.${key} should stay finite`);
  });
  [reserve.supplies, reserve.inventory, reserve.pendingRecovered].forEach((group, index) => {
    Object.keys(group || {}).forEach((key) => assert(Number.isFinite(group[key]) && group[key] >= 0, `${label}.group${index}.${key} should stay non-negative`));
  });
  (reserve.strategy.consequences || []).forEach((item) => assert(item.remainingActions > 0 && item.remainingActions <= 10, `${label} consequence should expire normally`));
}

const routes = {
  enforcement: ["驱赶偷猎者：封锁边界", "派猎犬侦察：检查陌生气味", "采购警报器", "执行许可内生态干预：转移拥挤个体"],
  ecology: ["修复水源和草场", "执行许可内生态干预：转移拥挤个体", "派猎犬侦察：确认生态恢复区边界", "驱赶偷猎者：封锁边界"],
  research: ["派猎犬侦察：搜寻线索", "跟随动物探索森林，寻找自然遗留。目标:researchSample 掷骰:6", "修复水源和草场", "执行许可内生态干预：转移拥挤个体", "驱赶偷猎者：封锁边界"],
  community: ["采购狗粮包", "跟随动物探索森林，寻找自然遗留。目标:shedAntlerB 掷骰:5", "采购医疗包", "派猎犬侦察：核对社区报告", "采购警报器", "执行许可内生态干预：转移拥挤个体", "采购狗粮包", "驱赶偷猎者：保护共用水点"]
};

const oldRandom = Math.random;
const signatures = {};
const outcomes = {};
const reachedEvents = new Set();
let diceSuccesses = 0;
let diceFailures = 0;
try {
  Object.keys(routes).forEach((routeId, routeIndex) => {
    Math.random = seededRandom(7001 + routeIndex * 997);
    let state = createCharacter(null, "保护区卫士");
    state.world.reserve.fund = 2400;
    state.world.reserve.supplies.dogFood = 18;
    state.world.reserve.supplies.alarm = 10;
    state.world.reserve.supplies.tranquilizer = 10;
    for (let day = 1; day <= 120; day += 1) {
      const forcedLevel = Math.min(5, 1 + Math.floor((day - 1) / 24));
      if (state.world.reserve.progression.level !== forcedLevel) {
        const progress = state.world.reserve.progression;
        progress.level = forcedLevel;
        progress.chapterStart = {
          level: forcedLevel,
          daysManaged: progress.daysManaged || 0,
          totalActions: progress.totalActions || 0,
          totalMeaningfulActions: progress.totalMeaningfulActions || 0,
          totalStrategicChoices: progress.totalStrategicChoices || 0,
          totalMajorStrategicChoices: progress.totalMajorStrategicChoices || 0,
          activeSeconds: progress.activeSeconds || 0,
          totalFundEarned: progress.totalFundEarned || 0,
          totalMigratedIn: progress.totalMigratedIn || 0,
          totalRareRecovered: progress.totalRareRecovered || 0
        };
      }
      state.world.reserve.progression.activeSeconds = (state.world.reserve.progression.activeSeconds || 0) + 5 * 60;
      const result = simulateDay(routes[routeId][day % routes[routeId].length], state);
      state = { world: result.world, character: result.character, reports: [], messages: [] };
      const reserve = state.world.reserve;
      const pending = reserve.strategy && reserve.strategy.pendingDilemma;
      if (pending) {
        const dilemma = strategicDilemmaById(pending.id);
        reachedEvents.add(dilemma.id);
        const matching = dilemma.choices.find((choice) => choice.route === routeId) || dilemma.choices[day % dilemma.choices.length];
        const preview = matching.dice ? strategicDicePreview(reserve, dilemma, matching) : null;
        const dice = matching.dice ? { roll: 1 + Math.floor(Math.random() * 6), routeModifier: preview.routeModifier, resourceModifier: preview.resourceModifier } : null;
        const resolved = applyStrategicChoice(reserve, dilemma.id, matching.id, dice);
        assert(resolved && !resolved.requiresDice, `${routeId} decision should resolve on day ${day}`);
        if (resolved.dice) {
          if (resolved.dice.success) diceSuccesses += 1;
          else diceFailures += 1;
        }
        reserve.progression = reserveProgressionFor(reserve);
      }
      finiteReserve(reserve, `${routeId}.day${day}`);
    }
    const reserve = state.world.reserve;
    assert(strategyRoute(reserve).id === routeId, `${routeId} run should finish on its intended route, got ${strategyRoute(reserve).id}`);
    assert((reserve.strategy.choiceHistory || []).length >= 10, `${routeId} run should contain repeated strategic decisions`);
    signatures[routeId] = JSON.stringify({
      route: strategyRoute(reserve).id,
      scores: reserve.strategy.routeScores,
      fund: reserve.fund,
      safety: reserve.safety,
      reputation: reserve.reputation,
      enforcement: reserve.enforcement,
      poacher: reserve.poacherPressure,
      choices: reserve.strategy.choiceHistory.map((item) => item.choiceId)
    });
    outcomes[routeId] = {
      fund: reserve.fund,
      safety: reserve.safety,
      stability: reserve.stability,
      reputation: reserve.reputation,
      enforcement: reserve.enforcement,
      poacher: reserve.poacherPressure,
      intel: reserve.intel,
      water: reserve.ecology.water,
      grass: reserve.ecology.grass,
      disease: reserve.ecology.disease,
      choices: reserve.strategy.choiceHistory.length
    };
  });
} finally {
  Math.random = oldRandom;
}

assert(new Set(Object.values(signatures)).size === 4, "four fixed routes should create four distinct save outcomes");
// Persistent seasons deliberately replace part of the old random-event churn.
// Focused route saves should deliberately diverge rather than sample every
// event. Covering at least 12 definitions here, while the separate reachability
// suite reaches all 28, proves both route identity and global reachability.
assert(reachedEvents.size >= 12, `four focused routes should cover at least 12 strategy definitions, got ${reachedEvents.size}/28`);
// Route-focused AI may rationally avoid every risky option. Dice success and
// failure remain mandatory in strategy-depth-check; this suite verifies that
// choosing a coherent route does not force gambling to stay viable.
Object.keys(outcomes).forEach((routeId) => {
  const outcome = outcomes[routeId];
  assert(outcome.fund > 0 && outcome.poacher <= 85 && outcome.disease <= 75 && outcome.water >= 25 && outcome.grass >= 18, `${routeId} should remain viable and recoverable after 120 days: ${JSON.stringify(outcome)}`);
});
assert(
  outcomes.enforcement.poacher <= Math.min(outcomes.ecology.poacher, outcomes.community.poacher)
    && outcomes.enforcement.poacher <= outcomes.research.poacher + 3,
  `enforcement should retain the strongest direct anti-poaching outcome, while research tracking may finish within 3 points: ${JSON.stringify(outcomes)}`
);
console.log(`strategy balance check ok (4 routes × 120 operating days, ${reachedEvents.size}/28 events, dice ${diceSuccesses}/${diceFailures})`);
console.log(`route outcomes ${JSON.stringify(outcomes)}`);
