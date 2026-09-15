'use strict';
const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { simulateDay, reserveProgressionFor } = require('../js/simulator');
const { buildGoalView, resolveGoals } = require('../js/goalSystem');
const { createPoacherRescue } = require('../js/chapterRescueSystem');

const JUMP_ACTIONS = [
  '采购狗粮包',
  '修复水源和草场：把浅滩边的烂泥和枯草处理掉',
  '驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影',
  '派猎犬侦察：让砾灰沿中央混交林闻一圈，重点找坏脚印',
  '出售仓库里的脱落鹿角和研究样本',
  '修复水源和草场',
  '驱赶偷猎者：封锁可疑路线',
  '派猎犬侦察：确认边界脚印'
];
function withRandom(value, fn) {
  const old = Math.random; Math.random = () => value;
  try { return fn(); } finally { Math.random = old; }
}
function prepare(name) {
  const state = createCharacter(null, name);
  const r = state.world.reserve;
  r.fund = 12000;
  r.base.raidTickets = 20;
  r.supplies = { dogFood: 20, alarm: 20, tranquilizer: 20, fieldKit: 20 };
  r.inventory = Object.assign({}, r.inventory, { recoveredTrap: 10, researchSample: 10 });
  r.ecology.water = 70; r.ecology.grass = 70; r.ecology.disease = 8;
  r.safety = 82; r.stability = 82; r.reputation = 75; r.poacherPressure = 24;
  return state;
}
function run(state, command, day) {
  const result = withRandom(.99, () => simulateDay(command, state));
  assert(result && result.world && result.world.reserve, `day ${day} returned no world`);
  return Object.assign({}, state, {
    world: result.world,
    character: result.character,
    reports: (state.reports || []).concat(result.reports || []).slice(-20)
  });
}
function assertHealthy(state, label) {
  const reserve = state.world.reserve;
  const view = buildGoalView(state, state.world.goals);
  assert(view && view.primary, `${label}: no primary task after jump`);
  assert(Array.isArray(view.alternatives), `${label}: alternatives disappeared`);
  const ids = [view.primary].concat(view.alternatives).filter(Boolean).map(item => item.id);
  assert.equal(new Set(ids).size, ids.length, `${label}: duplicate task cards`);
  const again = resolveGoals(state, null, `nonlinear-${label}`);
  assert(again && again.active && again.active.primary, `${label}: goal resolver lost the active task`);
  const refreshed = [again.active.primary].concat(again.active.alternatives || []).filter(Boolean);
  assert(refreshed.every(item => typeof item.id === 'string' && item.id.length > 0), `${label}: resolver returned an invalid task card`);
  assert.equal(new Set(refreshed.map(item => item.id)).size, refreshed.length, `${label}: resolver duplicated task cards after refresh`);
  const p = reserveProgressionFor(reserve);
  assert(p.stage >= 1 && p.level >= 1, `${label}: progression regressed`);
  assert(Number.isFinite(p.progress), `${label}: progression became NaN`);
  return { id: view.primary.id, action: view.primary.recommendedAction, stage: p.stage };
}

const orders = [
  [0, 1, 2, 3, 4, 5, 6, 7],
  [2, 4, 1, 6, 0, 3, 7, 5],
  [4, 0, 7, 2, 5, 1, 3, 6],
  [1, 3, 5, 7, 2, 0, 6, 4]
];
for (const [round, order] of orders.entries()) {
  let state = prepare(`非线性任务-${round}`);
  const first = assertHealthy(state, `round-${round}-start`);
  const seen = new Set([first.id]);
  let lastStage = first.stage;
  for (let day = 0; day < 32; day += 1) {
    const command = JUMP_ACTIONS[order[day % order.length]];
    state = run(state, command, day + 1);
    const result = assertHealthy(state, `round-${round}-day-${day + 1}`);
    seen.add(result.id);
    assert(result.stage >= lastStage, `round-${round}: chapter stage regressed`);
    lastStage = result.stage;
  }
  assert(seen.size >= 3, `round-${round}: actions never escaped the first task (${seen.size} task ids)`);
}

// Explicitly complete the numeric/story side first. Rescue remains the only
// chapter gate, while the resolver still returns ordinary tasks before that.
{
  const state = prepare('解救独立门槛');
  const reserve = state.world.reserve;
  reserve.progression.stage = 2;
  reserve.progression.level = 1;
  reserve.progression.totalActions = 40;
  reserve.progression.totalMeaningfulActions = 40;
  reserve.progression.totalStrategicChoices = 10;
  reserve.progression.totalMajorStrategicChoices = 4;
  reserve.progression.activeSeconds = 900;
  reserve.progression.totalFundEarned = 8000;
  reserve.progression.totalMigratedIn = 100;
  reserve.progression.totalRareRecovered = 20;
  reserve.eventChain = { chapterLevel: 1, step: 7, length: 7, completed: true };
  const recurring = createPoacherRescue(reserve, 'deer', 2, 99);
  assert(recurring, 'rescue gate setup could not create an independent rescue task');
  // A newly created poacher incident is story-only until the player confirms
  // the story card. Publish it here so this resolver test exercises the
  // independent-task route rather than the pre-publication state.
  recurring.taskVisible = true;
  const before = resolveGoals(state, null, 'before-rescue');
  assert(before.active.primary, 'rescue gate setup lost all tasks');
  const first = before.active.primary;
  // The rescue route can be selected directly even if it is not the current
  // primary card; no unrelated task completion is required to open it.
  const rescueAlternative = [first].concat(before.active.alternatives || []).find(item => item && item.recommendedAction === 'rescueAnimal');
  assert(rescueAlternative || /解救/.test(first.title || ''), 'chapter rescue is not exposed as an independent route');
}
console.log('nonlinear task routing check ok (4 permutations × 32 days, stable resolver, stage monotonicity, independent rescue gate)');
