// 每章游客账目必须自持：
//   本章总数 = 上一章结束总数 ×10%（继承）+ 本章各来源 − 本章流失
// 除了章末的 10%，任何章内变化都不得影响其它章节，任何系统性重算也不得
// 改变本章总数。历史上这里出过三个同源故障，全部在本用例里锁死：
//   1. 构成里出现“待分类 N 人”（总数走生涯差值、来源走账本差值，两者不同步）
//   2. 闲置后游客连同继承的 10% 一起归零
//   3. 随后完成一个任务，总数又跳回原值，来回横跳
const assert = require("assert");
const {
  chapterVisitorTotal, chapterVisitorBreakdown, applyChapterVisitorDelta,
  beginChapterVisitorCheckpoint, chapterVisitorCarryover
} = require("../js/chapterTargets");
const { createReserveState } = require("../js/world");
const { normalizeReserveDevelopment } = require("../js/reserveDevelopment");
const { reserveProgressionFor } = require("../js/simulator");
const { visitorRecruitmentStatus } = require("../js/visitorRecruitment");

function chapterOneThenTwo() {
  const reserve = createReserveState();
  reserve.progression = Object.assign({}, reserve.progression, { stage: 1, displayChapter: 1, level: 1 });
  applyChapterVisitorDelta(reserve, 120, "recruit");
  assert.strictEqual(chapterVisitorTotal(reserve), 120, "第1章招募 120 后总数应为 120");
  reserve.progression.stage = 2;
  reserve.progression.displayChapter = 2;
  beginChapterVisitorCheckpoint(reserve, 2, 120);
  return reserve;
}

// 1. 切章只带入 10%，上一章的流水不得残留。
{
  const reserve = chapterOneThenTwo();
  assert.strictEqual(chapterVisitorTotal(reserve), 12, "第2章开局应只继承上一章的 10%");
  const b = chapterVisitorBreakdown(reserve);
  assert.strictEqual(b.inherited, 12, "继承应为 12");
  assert.strictEqual(b.recruited, 0, "上一章的招募不得带入第2章");
  assert.strictEqual(b.untracked, 0, "不得出现待分类");
}

// 2. 本章增减只影响本章，构成始终闭合。
{
  const reserve = chapterOneThenTwo();
  applyChapterVisitorDelta(reserve, 146, "recruit");
  applyChapterVisitorDelta(reserve, 10, "visit");
  applyChapterVisitorDelta(reserve, -8, "loss");
  const b = chapterVisitorBreakdown(reserve);
  assert.strictEqual(b.total, 12 + 146 + 10 - 8, "总数应等于 继承+招募+到访−流失");
  assert.strictEqual(b.inherited + b.recruited + b.migrated + b.facility + b.task + b.share - b.lost, b.total,
    "构成必须与总数闭合");
  assert.strictEqual(b.untracked, 0, "不得出现待分类");
}

// 3. 系统性重算/规范化不得改变本章总数（闲置归零与横跳的根因）。
{
  const reserve = chapterOneThenTwo();
  applyChapterVisitorDelta(reserve, 146, "recruit");
  const expected = chapterVisitorTotal(reserve);
  assert.strictEqual(expected, 158, "第2章应为 继承12 + 招募146 = 158");

  const passes = [
    ["normalizeReserveDevelopment", (r) => normalizeReserveDevelopment(r)],
    ["reserveProgressionFor", (r) => { r.progression = reserveProgressionFor(r); }],
    ["visitorRecruitmentStatus", (r) => visitorRecruitmentStatus(r, 5, Date.now())],
    ["存档 JSON 往返", () => {}]
  ];
  let current = reserve;
  passes.forEach(([label, fn]) => {
    fn(current);
    current = JSON.parse(JSON.stringify(current));
    assert.strictEqual(chapterVisitorTotal(current), expected, `${label} 之后游客总数不得变化`);
    assert.strictEqual(chapterVisitorBreakdown(current).inherited, 12, `${label} 之后继承的 10% 不得丢失`);
    assert.strictEqual(chapterVisitorBreakdown(current).untracked, 0, `${label} 之后不得出现待分类`);
  });

  // 反复来回，模拟“闲置归零 → 做任务跳回”的横跳场景。
  for (let i = 0; i < 5; i += 1) {
    current.progression = reserveProgressionFor(current);
    normalizeReserveDevelopment(current);
    current = JSON.parse(JSON.stringify(current));
    assert.strictEqual(chapterVisitorTotal(current), expected, `第${i + 1}轮重算后游客总数不得横跳`);
  }
}

// 4. 进度被 reserveProgressionFor 直接推到下一章时，也必须按 10% 结转而不是清零。
{
  const reserve = chapterOneThenTwo();
  applyChapterVisitorDelta(reserve, 146, "recruit");
  const before = chapterVisitorTotal(reserve);
  reserve.progression.stage = 3;
  reserve.progression.displayChapter = 3;
  const b = chapterVisitorBreakdown(reserve);
  assert.strictEqual(b.inherited, chapterVisitorCarryover(before, 3), "跨章应自动结转 10%");
  assert.strictEqual(b.total, chapterVisitorCarryover(before, 3), "新章开局总数应只有继承部分");
  assert.strictEqual(b.untracked, 0, "不得出现待分类");
}

// 5. 流失不得穿透到上一章（总数不会被扣成负数后倒灌）。
{
  const reserve = chapterOneThenTwo();
  applyChapterVisitorDelta(reserve, -500, "loss");
  assert.strictEqual(chapterVisitorTotal(reserve), 0, "流失最多把本章清空");
  applyChapterVisitorDelta(reserve, 30, "recruit");
  assert.strictEqual(chapterVisitorTotal(reserve), 30, "清空后新招募应正常累计");
}

// 6. 事件/剧情的负向影响只能吃掉“当日对本章的实际贡献”，不能啃本章存量。
{
  const { applyNarrativeBusinessPressure } = require("../js/eventEconomy");
  const pressure = (reserve, i) => {
    reserve.storyBusinessEffect = null;
    applyNarrativeBusinessPressure(reserve, { id: `story_${i}`, title: "剧情", type: "disease" });
  };
  const reserve = chapterOneThenTwo();
  applyChapterVisitorDelta(reserve, 146, "recruit");
  const stock = chapterVisitorTotal(reserve);
  assert.strictEqual(stock, 158, "第2章应为 继承12 + 招募146 = 158");

  reserve.development.operations.today = { day: 6, visitors: 40, recruitedVisitors: 0, income: 200, chapterGained: 0 };
  for (let i = 0; i < 20; i += 1) pressure(reserve, i);
  assert.strictEqual(chapterVisitorTotal(reserve), stock,
    "当日没有人计入本章时，剧情事件不得扣减本章存量");

  applyChapterVisitorDelta(reserve, 30, "visit");
  assert.strictEqual(chapterVisitorTotal(reserve), stock + 30, "到访 30 人应计入本章");
  for (let i = 100; i < 140; i += 1) pressure(reserve, i);
  assert.ok(chapterVisitorTotal(reserve) >= stock,
    `剧情事件最多吃掉当日贡献的 30 人，本章存量必须保留（实际 ${chapterVisitorTotal(reserve)}）`);
  assert.strictEqual(chapterVisitorBreakdown(reserve).untracked, 0, "不得出现待分类");
}

console.log("chapter visitor self-contained check ok (继承10% / 章内自持 / 重算不横跳 / 构成闭合无待分类 / 事件不啃存量)");
