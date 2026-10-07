"use strict";

const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { habitatCrisisLevel, habitatRecoveryGain } = require("../js/balanceConfig");
const { visitorWaterUseForCount } = require("../js/visitorRecruitment");
const { chapterTargets } = require("../js/chapterTargets");

function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
}

function animalTotal(reserve) {
  const eco = reserve.ecology || {};
  return [eco.herbivores, eco.predators, eco.birds].reduce((sum, group) => (
    sum + Object.values(group || {}).reduce((sub, value) => sub + (Number(value) || 0), 0)
  ), 0);
}

function scaleHerd(group, factor) {
  Object.keys(group || {}).forEach((id) => {
    group[id] = Math.max(1, Math.round((Number(group[id]) || 0) * factor));
  });
}

function makeChapterState(chapter, water = 24, grass = 40) {
  const state = createCharacter(null, `第${chapter}章水源回救`);
  const reserve = state.world.reserve;
  const target = chapterTargets(chapter);
  const openingHerd = Math.max(1, animalTotal(reserve));
  const factor = Math.max(1, target.animals / openingHerd);
  reserve.fund = 4000;
  reserve.supplies = { dogFood: 12, alarm: 6, tranquilizer: 8, fieldKit: 6, medicalKit: 7, evidenceTrap: 4 };
  reserve.progression = Object.assign({}, reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    level: Math.max(1, Math.min(7, Math.ceil(chapter / 2)))
  });
  reserve.guardianCycle = Object.assign({}, reserve.guardianCycle, { day: 16, actionIndex: 0, actionsToday: [] });
  reserve.ecology.water = water;
  reserve.ecology.grass = grass;
  reserve.ecology.disease = 18;
  reserve.poacherPressure = 36;
  scaleHerd(reserve.ecology.herbivores, factor);
  scaleHerd(reserve.ecology.predators, factor);
  scaleHerd(reserve.ecology.birds, Math.max(1, factor * 0.6));
  return state;
}

function run(state, command) {
  return withRandom(0.08, () => {
    const result = simulateDay(command, state);
    return Object.assign({}, state, { world: result.world, character: result.character });
  });
}

assert.equal(habitatCrisisLevel(24), "collapse");
assert.equal(habitatCrisisLevel(30), "critical");
assert.ok(habitatRecoveryGain(24, 5) >= 8, "崩溃水位修复应明显高于常态");
assert.equal(visitorWaterUseForCount(280, { ecology: { water: 24 } }), 0);

for (let chapter = 1; chapter <= 20; chapter += 1) {
  let state = makeChapterState(chapter, 24, 40);
  const label = `第${chapter}章`;
  state = run(state, "去东部河岸湿地清理饮水点，疏通水线并补充水源");
  assert.ok(state.world.reserve.ecology.water >= 35, `${label}一次修水必须拉出崩溃线，实际 ${state.world.reserve.ecology.water}`);

  state = run(state, "派猎犬侦察：检查水边路线");
  state = run(state, "派猎犬侦察：检查水边路线");
  assert.ok(state.world.reserve.ecology.water > 25, `${label}修水后入夜仍须高于25，实际 ${state.world.reserve.ecology.water}`);

  let idle = makeChapterState(chapter, 24, 22);
  for (let action = 0; action < 3; action += 1) idle = run(idle, "派猎犬侦察：检查水边路线");
  const idleWater = idle.world.reserve.ecology.water;
  const idleGrass = idle.world.reserve.ecology.grass;
  idle.world.reserve.supplies.fieldKit = 6;
  idle.world.reserve.fund = 4000;
  const rescuedWater = run(idle, "去东部河岸湿地清理饮水点，疏通水线并补充水源");
  assert.ok(rescuedWater.world.reserve.ecology.water > idleWater, `${label}手忙脚乱修水一次也必须立刻回水`);
  assert.ok(rescuedWater.world.reserve.ecology.water >= 30, `${label}崩溃后一次修水应回到危急线以上，实际 ${rescuedWater.world.reserve.ecology.water}`);

  idle.world.reserve.supplies.fieldKit = 6;
  idle.world.reserve.fund = 4000;
  const rescuedGrass = run(idle, "去南部草甸补播耐旱草，恢复草场承载能力");
  assert.ok(rescuedGrass.world.reserve.ecology.grass > idleGrass, `${label}手忙脚乱修草一次也必须立刻回草`);
}

console.log("chapter water recovery check ok");
