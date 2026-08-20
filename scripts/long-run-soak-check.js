const { createCharacter } = require("../js/storage");
const { simulateDay, reserveProgressionFor } = require("../js/simulator");
const { strategicDilemmaById, applyStrategicChoice } = require("../js/strategySystem");
const { Game } = require("../js/game");
const { SPECIES_DB, getUnlockedSpecies, speciesPopulation } = require("../js/animalWorld");

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

function checkFinite(value, label) {
  assert(Number.isFinite(value), `${label} is not finite: ${value}`);
}

function checkNonNegativeObject(value, label) {
  Object.entries(value || {}).forEach(([key, amount]) => {
    checkFinite(amount, `${label}.${key}`);
    assert(amount >= 0, `${label}.${key} is negative: ${amount}`);
  });
}

const commands = [
  "派猎犬侦察：检查陌生气味与陷阱",
  "驱赶偷猎者：封锁边界可疑脚印",
  "修复水源和草场：补水并恢复隐蔽带",
  "采购狗粮包",
  "执行许可内生态干预：转移拥挤个体",
  "派猎犬侦察：搜寻共享回收点",
  "出售仓库里的回收物",
  "采购警报器",
  "修复栖息地：控制疾病并恢复草场"
];

const oldRandom = Math.random;
const seeds = [7, 2024, 65537, 987654321];
try {
  seeds.forEach((seed) => {
    Math.random = seededRandom(seed);
    let state = createCharacter(null, "保护区卫士");
    state.world.reserve.supplies.dogFood = 12;
    state.world.reserve.supplies.alarm = 6;
    state.world.reserve.supplies.tranquilizer = 6;
    let priorLevel = 1;
    for (let step = 1; step <= 120 * 3; step += 1) {
      const day = Math.ceil(step / 3);
      const priorEventChain = JSON.parse(JSON.stringify(state.world.reserve.eventChain || {}));
      // 当前守护日由晨、午、暮三次关键操作组成。旧测试把一次操作当成
      // 一整天，会把剧情间隔和章节动作门槛放大三倍，产生伪软锁。
      state.world.reserve.progression.activeSeconds = (state.world.reserve.progression.activeSeconds || 0) + 200;
      const result = simulateDay(commands[(step + seed) % commands.length], state);
      state = {
        world: result.world,
        character: result.character,
        reports: (state.reports || []).concat(result.reports || []).slice(-12),
        messages: []
      };
      const pending = state.world.reserve.strategy && state.world.reserve.strategy.pendingDilemma;
      if (pending) {
        const dilemma = strategicDilemmaById(pending.id);
        const choice = dilemma && dilemma.choices[(step + seed) % dilemma.choices.length];
        const diceResult = choice && choice.dice ? { roll: ((step + seed) % 6) + 1, routeModifier: 0, resourceModifier: 0 } : null;
        assert(choice && applyStrategicChoice(state.world.reserve, dilemma.id, choice.id, diceResult), `seed ${seed} should resolve strategic dilemma on day ${day}`);
        state.world.reserve.progression = reserveProgressionFor(state.world.reserve);
      }
      const reserve = state.world.reserve;
      ["fund", "safety", "stability", "business", "ecologyScore", "poacherPressure", "actionPoints", "intel", "fieldPermits"].forEach((key) => checkFinite(reserve[key] || 0, `seed${seed}.day${day}.${key}`));
      [reserve.supplies, reserve.inventory, reserve.pendingRecovered, reserve.ecology.predators, reserve.ecology.herbivores, reserve.ecology.birds].forEach((group, index) => checkNonNegativeObject(group, `seed${seed}.day${day}.group${index}`));
      const level = reserve.progression.level;
      assert(level >= priorLevel, `seed ${seed} level regressed on day ${day}`);
      assert(level <= priorLevel + 1, `seed ${seed} level skipped on day ${day}`);
      if (level > priorLevel) {
        const completedAtTransition = (reserve.eventChain && reserve.eventChain.completed && reserve.eventChain.chapterLevel === priorLevel)
          || (priorEventChain.completed && priorEventChain.chapterLevel === priorLevel);
        assert(completedAtTransition, `seed ${seed} upgraded before chapter ${priorLevel} story completed on day ${day}`);
      }
      priorLevel = level;
      const allowed = getUnlockedSpecies(level);
      const allowedIds = new Set(allowed.map((species) => species.id));
      Object.keys(SPECIES_DB).forEach((id) => {
        const population = speciesPopulation(reserve, id);
        checkFinite(population, `seed${seed}.day${day}.species.${id}`);
        assert(population >= 0, `seed ${seed} ${id} population is negative on day ${day}`);
        if (!allowedIds.has(id)) assert(population === 0, `seed ${seed} locked species ${id} appeared on day ${day}`);
      });
      const sandboxNames = state.world.knownCharacters.map((animal) => animal.species).sort();
      const allowedNames = allowed.map((species) => species.name).sort();
      assert(JSON.stringify(sandboxNames) === JSON.stringify(allowedNames), `seed ${seed} sandbox species mismatch on day ${day}`);
      const game = Object.create(Game.prototype);
      game.state = state;
      const prosperity = game.reserveProsperitySummary(reserve, state.world);
      const expectedTotal = allowed.reduce((sum, species) => sum + speciesPopulation(reserve, species.id), 0);
      assert(prosperity.speciesCount === allowed.length, `seed ${seed} species count mismatch on day ${day}`);
      assert(prosperity.animalTotal === expectedTotal, `seed ${seed} animal total mismatch on day ${day}: ${prosperity.animalTotal}/${expectedTotal}`);
      assert(["旱季", "雨季"].includes((reserve.seasonState || {}).name), `seed ${seed} invalid season on day ${day}`);
      if (reserve.emergency && reserve.emergency.active) {
        assert(["poacher_ring", "disease_outbreak"].includes(reserve.emergency.active.type), `seed ${seed} invalid emergency on day ${day}`);
      }
    }
    // This suite deliberately rotates unrelated actions and never follows the
    // active collection/story target. It is an invariant/soft-crash soak, not
    // a chapter pacing oracle. Realistic progress is gated by
    // commercial-long-run-check, whose goal profile follows the live target.
    assert(priorLevel >= 2, `seed ${seed} should at least clear the onboarding chapter without a hard lock, got Lv.${priorLevel}`);
    assert(state.world.reserve.fund <= 15000, `seed ${seed} fund should not inflate beyond meaningful facility and supply costs after 120 days: ${state.world.reserve.fund}`);
  });
} finally {
  Math.random = oldRandom;
}

console.log(`long run soak check ok (${seeds.length} seeds × 120 guardian days × 3 actions)`);
