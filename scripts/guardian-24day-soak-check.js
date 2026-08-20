const assert = require("assert");
const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");
const { guardianContext } = require("../js/guardianCycle");

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function makeState() {
  return {
    world: createInitialWorld(),
    character: { role: "warden", location: "中央混交林", stamina: 82, health: 92 },
    messages: []
  };
}

const commands = [
  "修复水源草场",
  "派猎犬侦察",
  "驱赶偷猎",
  "生态干预",
  "采购狗粮",
  "立即移交：批量移交库存中的研究样本"
];

const originalRandom = Math.random;
try {
  for (let seed = 1; seed <= 40; seed += 1) {
    Math.random = seeded(seed);
    let state = makeState();
    let lastGuardianDay = 1;
    let nightCount = 0;
    const seenSeasons = new Set();
    for (let actionIndex = 0; actionIndex < 24 * 3; actionIndex += 1) {
      const reserve = state.world.reserve;
      // 压力测试关注循环与唯一数据源；补足测试用补给，避免随机失败遮蔽跨日错误。
      reserve.supplies.dogFood = Math.max(4, reserve.supplies.dogFood || 0);
      reserve.supplies.alarm = Math.max(3, reserve.supplies.alarm || 0);
      reserve.supplies.tranquilizer = Math.max(3, reserve.supplies.tranquilizer || 0);
      reserve.supplies.fieldKit = Math.max(3, reserve.supplies.fieldKit || 0);
      reserve.inventory.researchSample = Math.max(2, reserve.inventory.researchSample || 0);
      const result = simulateDay(commands[actionIndex % commands.length], state);
      const nextReserve = result.world.reserve;
      const cycle = nextReserve.guardianCycle;
      assert(Number.isFinite(nextReserve.fund) && nextReserve.fund >= 0, `seed ${seed}: 基金异常`);
      assert(Number.isFinite(nextReserve.ecology.water) && nextReserve.ecology.water >= 0 && nextReserve.ecology.water <= 100, `seed ${seed}: 水源越界`);
      assert(Number.isFinite(nextReserve.ecology.grass) && nextReserve.ecology.grass >= 0 && nextReserve.ecology.grass <= 100, `seed ${seed}: 草场越界`);
      assert(cycle.day === lastGuardianDay || cycle.day === lastGuardianDay + 1, `seed ${seed}: 守护日跳跃`);
      if (result.visual.guardianCycle.night) nightCount += 1;
      lastGuardianDay = cycle.day;
      seenSeasons.add(result.world.season);
      const context = guardianContext(nextReserve);
      assert(context.beat && context.beat.length > 5, `seed ${seed}: 出现无目标守护日`);
      assert((result.visual.mastery || []).length === 3, `seed ${seed}: 专长状态丢失`);
      assert((nextReserve.recoveredProcessing.pending || []).length <= 12, `seed ${seed}: 鉴定队列无限增长`);
      state = Object.assign({}, state, { world: result.world, character: result.character });
    }
    assert.strictEqual(nightCount, 24, `seed ${seed}: 72次行动必须正好完成24个守护日`);
    assert.strictEqual(state.world.reserve.guardianCycle.day, 25, `seed ${seed}: 年度结束应进入第25日`);
    assert(seenSeasons.has("雨季") && seenSeasons.has("旱季"), `seed ${seed}: 两季没有完整轮换`);
    assert.strictEqual(state.world.reserve.guardianRun.completedDays, 7, `seed ${seed}: 七日挑战不能按操作三倍推进`);
  }
} finally {
  Math.random = originalRandom;
}

console.log("guardian 24-day soak check ok (40 seeds × 24 days)");
