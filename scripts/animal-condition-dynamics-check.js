const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = previous; }
}

function apply(state, command, random = .1) {
  const result = withRandom(random, () => simulateDay(command, state));
  return Object.assign({}, state, result, { world: result.world, character: result.character });
}

function setAnimalBaseline(state, { trust = 70, threat = 36, health = 84 } = {}) {
  state.world.knownCharacters = state.world.knownCharacters.map((animal) => Object.assign({}, animal, {
    health,
    relation: Object.assign({}, animal.relation || {}, { trust, threat })
  }));
}

// Logistics is not an animal relationship action. Three purchases may close a
// guardian day, but must never make every animal trust the player more.
let state = createCharacter(null, "动物状态稳定测试");
state.world.reserve.fund = 5000;
Object.assign(state.world.reserve.ecology, { water: 72, grass: 70, disease: 10 });
state.world.reserve.poacherPressure = 24;
Object.assign(state.world.reserve.supplies, { dogFood: 0, alarm: 0, tranquilizer: 0, medicalKit: 0, fieldKit: 0 });
setAnimalBaseline(state);
const stableBefore = state.world.knownCharacters.map((animal) => ({ id: animal.id, trust: animal.relation.trust }));
state = apply(state, "采购狗粮 数量:1");
state = apply(state, "采购警报器 数量:1");
state = apply(state, "采购医疗包 数量:1");
stableBefore.forEach((before) => {
  const after = state.world.knownCharacters.find((animal) => animal.id === before.id);
  assert.strictEqual(after.relation.trust, before.trust, "采购补给不得被动提高动物信任");
  assert(Number.isFinite(after.health), "动物健康必须是真实持久化数值");
});

// Habitat repair should matter to water/grazing species, while unrelated
// species do not all receive the same relationship reward.
state = createCharacter(null, "栖息地关系测试");
state.world.reserve.fund = 5000;
state.world.reserve.supplies.fieldKit = 2;
Object.assign(state.world.reserve.ecology, { water: 46, grass: 43, disease: 20 });
setAnimalBaseline(state, { trust: 60, threat: 42, health: 78 });
const deerBefore = state.world.knownCharacters.find((animal) => animal.species === "鹿");
const wolfBefore = state.world.knownCharacters.find((animal) => animal.species === "狼");
state = apply(state, "修复水源和草场：去东部河岸湿地修复水源", .1);
const deerAfter = state.world.knownCharacters.find((animal) => animal.id === deerBefore.id);
const wolfAfter = state.world.knownCharacters.find((animal) => animal.id === wolfBefore.id);
assert(deerAfter.relation.trust > deerBefore.relation.trust, "食草动物应回应真实的水草修复");
assert.strictEqual(wolfAfter.relation.trust, wolfBefore.relation.trust, "栖息地行动不得给所有物种相同信任奖励");

// A neglected severe habitat closes the day with visible, species-sensitive
// consequences: health falls, vigilance rises, and reserve trust can decline.
state = createCharacter(null, "严重生态压力测试");
state.world.reserve.fund = 5000;
Object.assign(state.world.reserve.ecology, { water: 24, grass: 22, disease: 68 });
state.world.reserve.poacherPressure = 74;
Object.assign(state.world.reserve.supplies, { dogFood: 0, alarm: 0, tranquilizer: 0, medicalKit: 0, fieldKit: 0 });
setAnimalBaseline(state, { trust: 72, threat: 30, health: 82 });
const stressedBefore = state.world.knownCharacters.map((animal) => ({ id: animal.id, trust: animal.relation.trust, threat: animal.relation.threat, health: animal.health }));
state = apply(state, "采购狗粮 数量:1");
state = apply(state, "采购警报器 数量:1");
state = apply(state, "采购医疗包 数量:1");
const changed = stressedBefore.map((before) => {
  const after = state.world.knownCharacters.find((animal) => animal.id === before.id);
  return { before, after };
});
assert(changed.some(({ before, after }) => after.health < before.health), "严重水草/疾病压力必须降低动物健康");
assert(changed.some(({ before, after }) => after.relation.threat > before.threat), "严重边界风险必须提高动物警惕");
assert(changed.some(({ before, after }) => after.relation.trust < before.trust), "长期不处理危机必须影响动物对保护区的信任");
assert(changed.every(({ after }) => after.conditionSummary && after.conditionChange), "三项变化必须保留可解释原因");

console.log("animal condition dynamics check ok");
