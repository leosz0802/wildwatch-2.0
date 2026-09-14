const storage = require("../js/storage");
const simulator = require("../js/simulator");

const state = storage.createCharacter(null, "保护区卫士");
const normalized = storage.normalizeReserve({ ecology: { water: 73, grass: 99, disease: 12 } }, state.world.reserve);
if (normalized.ecology.grass !== 74) throw new Error("旧存档草场应回到紧平衡上沿");

const reserve = { ecology: { water: 70, grass: 99, disease: 10 }, migration: { delta: 0 }, poacherPressure: 20 };
const settled = simulator.normalizeGrassBalance(reserve, { name: "旱季" });
if (reserve.ecology.grass > 74 || settled.after >= settled.before || settled.target !== 64) {
  throw new Error("草场过高时应产生承载压力并回到紧平衡区间");
}

const balanced = { ecology: { water: 70, grass: 64, disease: 10 }, migration: { delta: 0 }, poacherPressure: 20 };
const stable = simulator.normalizeGrassBalance(balanced, { name: "雨季" });
if (stable.after !== 64 || stable.excessPressure !== 0) throw new Error("紧平衡区间不应被额外扣减");

console.log("grass balance check ok");
