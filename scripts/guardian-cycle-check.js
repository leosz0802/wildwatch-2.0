const assert = require("assert");
const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");
const { guardianSeason, seasonBeat, recordSevenDayProgress } = require("../js/guardianCycle");

function state() {
  return {
    world: createInitialWorld(),
    character: { role: "warden", location: "中央混交林", stamina: 82, health: 92 },
    messages: []
  };
}

let current = state();
const commands = ["修复水源草场", "派猎犬侦察", "驱赶偷猎"];
commands.forEach((command, index) => {
  const result = simulateDay(command, current);
  current = Object.assign({}, current, { world: result.world, character: result.character });
  const cycle = result.world.reserve.guardianCycle;
  if (index < 2) {
    assert.strictEqual(cycle.day, 1, "三次行动结束前不能提前跨日");
    assert.strictEqual(cycle.actionIndex, index + 1, "上午、下午、黄昏必须顺序推进");
    assert.strictEqual(result.visual.guardianCycle.night, null, "前两次行动不能生成入夜总结");
  } else {
    assert.strictEqual(cycle.day, 2, "第三次关键行动后应进入次日");
    assert.strictEqual(cycle.actionIndex, 0, "次日应回到上午阶段");
    assert(result.visual.guardianCycle.night, "第三次行动必须生成入夜叙事");
    assert.strictEqual(result.world.reserve.progression.daysManaged, 1, "经营日只在入夜时累计一次");
  }
});

assert.deepStrictEqual(guardianSeason(1), { name: "雨季", day: 1, cycleDay: 1, year: 1, changed: true });
assert.strictEqual(guardianSeason(12).name, "雨季");
assert.strictEqual(guardianSeason(13).name, "旱季");
assert.strictEqual(guardianSeason(24).day, 12);
assert.strictEqual(guardianSeason(25).year, 2);
assert(/调查/.test(seasonBeat(6)), "每季第6天必须提供可预测调查窗口");
assert(/命名动物/.test(seasonBeat(9)), "每季第9天必须提供命名动物剧情预告");
assert(/季末/.test(seasonBeat(12)), "每季第12天必须提供季末总结");

const collectionDay = state();
collectionDay.world.reserve.guardianCycle.day = 6;
const collectionProgress = recordSevenDayProgress(collectionDay.world.reserve, "facilityUse");
assert(collectionProgress.completed, "第6日应由巡护站使用完成，而不是现场勘验");
assert.strictEqual(collectionDay.world.reserve.guardianCycle.sevenDay.completed[6], true);

console.log("guardian cycle check ok");
