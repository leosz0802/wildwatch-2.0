const assert = require("assert");
const { createCharacter, normalizeReserve } = require("../js/storage");
const { createReserveState } = require("../js/world");
const { simulateDay } = require("../js/simulator");
const { appendFundLedgerEntry, mergedFundLedgerView } = require("../js/fundLedger");

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = previous;
  }
}

const initial = createCharacter(null, "基金流水持久化测试");
const reserve = initial.world.reserve;
reserve.fund = 2400;
reserve.supplies.dogFood = 0;
appendFundLedgerEntry(reserve, {
  id: "seed_fund_history",
  type: "income",
  amount: 800,
  source: "历史游客消费贡献收入",
  day: 1,
  before: 1600,
  balance: 2400,
  note: "跨行动保留"
});

const first = withRandom(.05, () => simulateDay("采购狗粮包", initial));
assert(first.world.reserve.fundLedger.some((entry) => entry.id === "seed_fund_history"), "模拟下一次行动不得擦除旧基金流水");
const afterFirstCount = first.world.reserve.fundLedger.length;

const secondState = {
  world: first.world,
  character: first.character,
  reports: first.reports
};
const second = withRandom(.05, () => simulateDay("采购狗粮包", secondState));
assert(second.world.reserve.fundLedger.some((entry) => entry.id === "seed_fund_history"), "连续行动后历史基金流水仍必须存在");
assert(second.world.reserve.fundLedger.length > afterFirstCount, "新行动必须追加流水，不得覆盖原有流水");

const restored = normalizeReserve(JSON.parse(JSON.stringify(second.world.reserve)), createReserveState());
assert(restored.fundLedger.some((entry) => entry.id === "seed_fund_history"), "读档归一化不得擦除基金流水");
const view = mergedFundLedgerView(restored, restored.guardianCycle.day);
assert(view.rawCount >= restored.fundLedger.length - 1, "流水视图应基于持久化原始记录构建");
assert(view.entries.some((entry) => entry.source === "历史游客消费贡献收入"), "历史合并视图必须保留旧收入来源");

console.log("fund ledger persistence check ok");
