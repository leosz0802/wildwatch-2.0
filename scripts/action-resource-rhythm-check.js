const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = previous;
  }
}

function quietGoal(state) {
  state.world.goals.daily = Object.assign({}, state.world.goals.daily, {
    id: "daily_patrol",
    progress: 0,
    target: 99
  });
}

const scoutState = createCharacter(null, "节奏测试");
quietGoal(scoutState);
scoutState.world.reserve.supplies.dogFood = 3;
scoutState.world.reserve.poacherPressure = 48;
const scout = withRandom(.05, () => simulateDay("派猎犬侦察：确认边界脚印", scoutState));
["actionPoints", "intel", "fieldPermits"].forEach((key) => assert(!Object.prototype.hasOwnProperty.call(scout.world.reserve, key), `废弃字段${key}不得重新进入核心循环`));
assert.strictEqual(scout.world.reserve.supplies.dogFood, 2, "侦察应消耗玩家能理解的具体狗粮");
assert(scout.world.reserve.poacherPressure < 48, "侦察应直接改变保护区风险");

const purchaseState = Object.assign({}, scoutState, {
  world: Object.assign({}, scout.world, {
    goals: JSON.parse(JSON.stringify(scout.world.goals))
  }),
  character: scout.character
});
quietGoal(purchaseState);
purchaseState.world.reserve.fund = 1000;
purchaseState.world.reserve.supplies.dogFood = 0;
const purchase = withRandom(.05, () => simulateDay("采购狗粮包", purchaseState));
["actionPoints", "intel", "fieldPermits"].forEach((key) => assert(!Object.prototype.hasOwnProperty.call(purchase.world.reserve, key), `废弃字段${key}不得重新进入核心循环`));
assert(purchase.world.reserve.fund < 1000, "采购应消耗基金");
assert(purchase.world.reserve.supplies.dogFood > 0, "采购应补入具体物资");

const goalState = createCharacter(null, "目标测试");
goalState.world.reserve.supplies.dogFood = 3;
const guardOne = withRandom(.05, () => simulateDay("派猎犬侦察：推进今日守护", goalState));
const guardTwo = withRandom(.05, () => simulateDay("派猎犬侦察：完成守护目标", Object.assign({}, goalState, {
  world: guardOne.world,
  character: guardOne.character,
  reports: guardOne.reports
})));
guardTwo.world.reserve.inventory.researchSample = 1;
const goal = withRandom(.05, () => simulateDay("出售研究样本：接通经营循环", Object.assign({}, goalState, {
  world: guardTwo.world,
  character: guardTwo.character,
  reports: guardTwo.reports
})));
["actionPoints", "intel", "fieldPermits"].forEach((key) => assert(!Object.prototype.hasOwnProperty.call(goal.world.reserve, key), `废弃字段${key}不得重新进入核心循环`));
assert(((goal.visual.goalResult || {}).completions || []).some((item) => item.type === "daily_core"), "今日2/3奖励必须进入统一目标结算数据");

const zeroState = createCharacter(null, "零资源测试");
quietGoal(zeroState);
zeroState.world.reserve.fund = 0;
Object.keys(zeroState.world.reserve.inventory || {}).forEach((key) => {
  zeroState.world.reserve.inventory[key] = 0;
});
const firstRecovery = withRandom(.05, () => simulateDay("出售仓库里的回收物", zeroState));
assert(
  Object.values(firstRecovery.world.reserve.pendingRecovered || {}).some((value) => value > 0)
    || (firstRecovery.world.reserve.fund || 0) > 0
    || Object.values(firstRecovery.world.reserve.supplies || {}).some((value) => value > 0),
  "零基金、零库存时仍需保留一条经营恢复路径"
);
["actionPoints", "intel", "fieldPermits"].forEach((key) => assert(!Object.prototype.hasOwnProperty.call(firstRecovery.world.reserve, key), `废弃字段${key}不得重新进入核心循环`));

console.log("action resource rhythm check ok");
