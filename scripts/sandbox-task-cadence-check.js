const assert = require("assert");
const { createReserveState } = require("../js/world");
const { buildReserveView } = require("../js/reserveView");
const {
  SANDBOX_TASK_CAP,
  EARLY_CHAPTER_SAME_KIND_GAP_MS,
  SAME_KIND_GAP_MS,
  SYSTEM_TASK_CROSS_KIND_GAP_MS,
  IDLE_HIDE_MS,
  sandboxTaskKind,
  applySandboxTaskCadence,
  closeSandboxTasksForAction,
  closeSandboxTaskKinds
} = require("../js/sandboxTaskCadence");

assert.strictEqual(SYSTEM_TASK_CROSS_KIND_GAP_MS, 20_000, "跨类型生态任务间隔必须为20秒");
assert.strictEqual(EARLY_CHAPTER_SAME_KIND_GAP_MS, 20_000, "前两章同类生态任务间隔必须为20秒");
assert.strictEqual(SAME_KIND_GAP_MS, 20_000, "第3章起同类生态任务间隔必须为20秒");

const dry = createReserveState();
dry.seasonState = { name: "旱季", weather: "热浪", day: 4, cycleDay: 16 };
dry.ecology.grass = 40;
dry.ecology.water = 62;
dry.ecology.disease = 12;
const fireView = buildReserveView(dry, dry, { day: 4, season: "旱季", weather: "热浪", now: 1_000 });
assert(fireView.mapMarkers.some((item) => sandboxTaskKind(item) === "wildfire"), "旱季热浪必须能刷出火警");
assert(fireView.mapMarkers.some((item) => item.recommendAction === "harshNature"), "火灾预警必须走射箭伤害判定");

const wet = createReserveState();
wet.seasonState = { name: "雨季", weather: "暴雨", day: 2, cycleDay: 2 };
wet.ecology.water = 86;
wet.ecology.disease = 12;
const floodView = buildReserveView(wet, wet, { day: 2, season: "雨季", weather: "暴雨", now: 1_000 });
assert(floodView.mapMarkers.some((item) => sandboxTaskKind(item) === "flood"), "雨季暴雨必须能刷出水患");

function finishRiverShallows(reserve) {
  reserve.development = reserve.development || {};
  reserve.development.nodes = Object.assign({}, reserve.development.nodes, {
    river_shallows: { id: "river_shallows", phase: "operational", planId: "reed_refuge", buildingLevel: 1 }
  });
  return reserve;
}

const sick = createReserveState();
finishRiverShallows(sick);
sick.ecology.disease = 28;
const diseaseView = buildReserveView(sick, sick, { day: 3, season: "雨季", weather: "阴", now: 1_000 });
assert(diseaseView.mapMarkers.some((item) => sandboxTaskKind(item) === "disease"), "疾病升高后必须能刷出病味扩散");

const mildDry = createReserveState();
mildDry.seasonState = { name: "旱季", weather: "阴", day: 5, cycleDay: 17 };
mildDry.ecology.grass = 56;
mildDry.ecology.disease = 8;
const mildFire = buildReserveView(mildDry, mildDry, { day: 5, season: "旱季", weather: "阴", now: 3_000 });
assert(mildFire.mapMarkers.some((item) => sandboxTaskKind(item) === "wildfire"), "旱季草场刚低于恢复线也应刷出火警");

const mildWet = createReserveState();
mildWet.seasonState = { name: "雨季", weather: "阴", day: 3, cycleDay: 3 };
mildWet.ecology.water = 74;
mildWet.ecology.disease = 8;
const mildFlood = buildReserveView(mildWet, mildWet, { day: 3, season: "雨季", weather: "阴", now: 3_000 });
assert(mildFlood.mapMarkers.some((item) => sandboxTaskKind(item) === "flood"), "雨季水位偏高时也应刷出水患");

const mildSick = createReserveState();
finishRiverShallows(mildSick);
mildSick.ecology.disease = 20;
const mildDisease = buildReserveView(mildSick, mildSick, { day: 4, season: "雨季", weather: "阴", now: 3_000 });
assert(mildDisease.mapMarkers.some((item) => sandboxTaskKind(item) === "disease"), "疾病刚进入预警前也应刷出病味扩散");

const openBank = createReserveState();
openBank.seasonState = { name: "旱季", weather: "阴", day: 2, cycleDay: 2 };
openBank.ecology.grass = 70;
openBank.ecology.water = 55;
openBank.ecology.disease = 8;
openBank.poacherPressure = 0;
const hazard = buildReserveView(openBank, openBank, { day: 2, season: "旱季", weather: "阴", now: 4_000 });
assert(hazard.mapMarkers.some((item) => item.label === "水灾隐患"), "浅滩未建成时水灾隐患必须出现");
finishRiverShallows(openBank);
const settledBank = buildReserveView(openBank, openBank, { day: 2, season: "旱季", weather: "阴", now: 5_000 });
assert(!settledBank.mapMarkers.some((item) => item.label === "水灾隐患" || item.eventType === "sandbox_flood"), "浅滩建成后，没有暴雨时水灾隐患必须停止");

const crowded = createReserveState();
crowded.poacherPressure = 72;
crowded.ecology.disease = 42;
crowded.ecology.water = 86;
crowded.seasonState = { name: "雨季", weather: "暴雨", day: 6, cycleDay: 6 };
const crowdedView = buildReserveView(crowded, crowded, { day: 6, season: "雨季", weather: "暴雨", now: 2_000 });
assert.strictEqual(crowdedView.mapMarkers.filter((item) => item.presentation !== "resource-flow").length <= SANDBOX_TASK_CAP, true, "系统推送的沙盘任务同时最多1个");
assert.strictEqual(crowdedView.mapMarkers.filter((item) => ["wildfire", "flood", "disease", "poacher"].includes(sandboxTaskKind(item))).length, 1, "火警和水灾不能叠在一起");

const againSoon = buildReserveView(crowded, crowded, { day: 6, season: "雨季", weather: "暴雨", now: 2_000 + SAME_KIND_GAP_MS });
const kinds = againSoon.mapMarkers.filter((item) => item.presentation !== "resource-flow").map((item) => sandboxTaskKind(item));
assert.strictEqual(new Set(kinds).size, kinds.length, "同一时刻不能出现两个同类沙盘任务");
assert.strictEqual(kinds.length <= 1, true, "前一个系统任务未结束前不能再推第二个");

closeSandboxTasksForAction(crowded, "harshNature", 50_000);
const stillCooling = buildReserveView(crowded, crowded, { day: 6, season: "雨季", weather: "暴雨", now: 50_000 + EARLY_CHAPTER_SAME_KIND_GAP_MS });
assert(!stillCooling.mapMarkers.some((item) => sandboxTaskKind(item) === "disease"), "前两章同类任务在20秒边界仍需等待");
const afterGap = buildReserveView(crowded, crowded, { day: 6, season: "雨季", weather: "暴雨", now: 50_001 + EARLY_CHAPTER_SAME_KIND_GAP_MS });
assert(afterGap.mapMarkers.some((item) => sandboxTaskKind(item) === "disease") || afterGap.mapMarkers.filter((item) => item.presentation !== "resource-flow").length === 1, "前两章超过20秒后疾病任务可以再次出现或让位给更高优先级");

{
  const sequential = createReserveState();
  const fire = { id: "wildfire", priority: 110, eventType: "sandbox_wildfire", label: "火灾预警" };
  const flood = { id: "flood", priority: 108, eventType: "sandbox_flood", label: "水灾改道" };
  const rescue = { id: "deer_1", type: "poacherRescue", kind: "rescue", priority: 90, label: "解救梅花鹿", rescueTargetId: "deer_1" };
  const first = applySandboxTaskCadence(sequential, [fire, flood, rescue], 1_000);
  assert.strictEqual(first.filter((item) => sandboxTaskKind(item) === "wildfire").length, 1, "系统先推最高优先级");
  assert.strictEqual(first.filter((item) => sandboxTaskKind(item) === "flood").length, 0, "火警未结束前不得再推水灾");
  assert.strictEqual(first.some((item) => item.type === "poacherRescue"), true, "用户主动解救不受系统间隔约束");
  const tooSoon = applySandboxTaskCadence(sequential, [flood], 1_000 + SYSTEM_TASK_CROSS_KIND_GAP_MS);
  assert.strictEqual(tooSoon.filter((item) => sandboxTaskKind(item) === "flood").length, 0, "火警仍在时跨类任务也不能插入");
  closeSandboxTaskKinds(sequential, ["wildfire"], 8_000);
  const floodHeld = createReserveState();
  applySandboxTaskCadence(floodHeld, [flood], 1_000);
  const fireTakesSlot = applySandboxTaskCadence(floodHeld, [fire, flood], 1_000 + SYSTEM_TASK_CROSS_KIND_GAP_MS + 1);
  assert.strictEqual(fireTakesSlot.filter((item) => sandboxTaskKind(item) === "wildfire").length, 1, "水灾占着地图时，更高优先级的火灾预警必须能出现");
  assert.strictEqual(fireTakesSlot.filter((item) => sandboxTaskKind(item) === "flood").length, 0, "火灾出现后地图上只保留这一条灾害");
  const stillGap = applySandboxTaskCadence(sequential, [flood], 28_001);
  assert.strictEqual(stillGap.some((item) => sandboxTaskKind(item) === "flood"), true, "跨类间隔结束后可以推送尚未出现的水灾主题");
  closeSandboxTaskKinds(sequential, ["flood"], 8_000 + SYSTEM_TASK_CROSS_KIND_GAP_MS);
  const ready = applySandboxTaskCadence(sequential, [flood], 8_001 + SYSTEM_TASK_CROSS_KIND_GAP_MS);
  assert.strictEqual(ready.some((item) => sandboxTaskKind(item) === "flood"), false, "同章节同一灾害主题处理后不得再次出现");
  const realHeld = createReserveState();
  applySandboxTaskCadence(realHeld, [flood], 2_000);
  const realEvent = { id: "real_nature_climate-02", priority: 120, eventType: "real_nature_climate-02", category: "realNature", label: "强热带气旋奇多" };
  const realTakesSlot = applySandboxTaskCadence(realHeld, [realEvent, flood], 2_001);
  assert.strictEqual(realTakesSlot.filter((item) => sandboxTaskKind(item) === "realNature").length, 1, "本章真实事件必须能从水灾隐患手里拿回地图任务");
  assert.strictEqual(realTakesSlot.filter((item) => sandboxTaskKind(item) === "flood").length, 0, "真实事件出现后地图上只保留这一条任务");
  const floodCannotReturn = applySandboxTaskCadence(realHeld, [realEvent, flood], 2_002);
  assert.strictEqual(floodCannotReturn.filter((item) => sandboxTaskKind(item) === "flood").length, 0, "真实事件未完成时水灾不能把地图任务抢回去");
}

const late = createReserveState();
late.progression = Object.assign({}, late.progression || {}, { stage: 8, displayChapter: 8, level: 4 });
late.ecology.disease = 42;
applySandboxTaskCadence(late, [{ id: "disease", priority: 96, eventType: "sandbox_disease", label: "病味扩散" }], 20_000);
closeSandboxTasksForAction(late, "harshNature", 20_000);
const lateStillCooling = applySandboxTaskCadence(late, [{ id: "disease", priority: 96, eventType: "sandbox_disease", label: "病味扩散" }], 20_000 + EARLY_CHAPTER_SAME_KIND_GAP_MS);
assert.strictEqual(lateStillCooling.length, 0, "第3章起同类任务在20秒边界仍需等待");
const lateReady = applySandboxTaskCadence(late, [{ id: "disease", priority: 96, eventType: "sandbox_disease", label: "病味扩散" }], 20_001 + SAME_KIND_GAP_MS);
assert.strictEqual(lateReady.length, 0, "第3章起同章节同一灾害主题不因冷却结束重复出现");

{
  const pool = createReserveState();
  pool.progression = Object.assign({}, pool.progression || {}, { stage: 9, displayChapter: 9 });
  const poolReasons = [
    { id: "flood", priority: 108, eventType: "sandbox_flood", label: "水灾改道" },
    { id: "river_watch_9", priority: 88, eventType: "sandbox_river_watch", label: "巡查新水线", action: "houndScout" },
    { id: "migration_trace_9", priority: 86, eventType: "sandbox_migration_trace", label: "记录迁徙路线", action: "habitat" },
    { id: "species_observation_9", priority: 84, eventType: "sandbox_species_observation", label: "观察物种踪迹", action: "houndScout" }
  ];
  const first = applySandboxTaskCadence(pool, poolReasons, 30_000);
  assert.equal(first[0].id, "flood", "第9章高风险水灾先展示");
  closeSandboxTasksForAction(pool, "harshNature", 30_000);
  const second = applySandboxTaskCadence(pool, poolReasons, 400_000);
  assert.ok(["river_watch_9", "migration_trace_9", "species_observation_9"].includes(second[0].id), "水灾处理后切换到其他候选任务");
  closeSandboxTaskKinds(pool, [sandboxTaskKind(second[0])], 400_000);
  const third = applySandboxTaskCadence(pool, poolReasons, 800_000);
  assert.notEqual(third[0].id, "flood", "候选池轮换不会回到同一水灾主题");
  assert.notEqual(third[0].id, second[0].id, "同章节同一观察任务不会重复");
  pool.progression.stage = 10;
  pool.progression.displayChapter = 10;
  const nextChapter = applySandboxTaskCadence(pool, poolReasons.map((item) => Object.assign({}, item, { id: `${item.id}_10` })), 900_000);
  assert.ok(nextChapter.length, "进入新章节后候选池重新开放");
}

// The 20-second cadence is shared by every chapter, including late chapters.
// Use two different field-record candidates so this verifies rotation without
// weakening the chapter-level no-repeat rule.
for (let chapter = 1; chapter <= 11; chapter += 1) {
  const reserve = createReserveState();
  reserve.progression = Object.assign({}, reserve.progression || {}, { stage: chapter, displayChapter: chapter });
  const first = { id: `river_watch_${chapter}`, eventType: "sandbox_river_watch", priority: 86, label: "巡查新水线" };
  const second = { id: `migration_trace_${chapter}`, eventType: "sandbox_migration_trace", priority: 85, label: "记录迁徙路线" };
  assert.strictEqual(applySandboxTaskCadence(reserve, [first], 1_000).length, 1, `第${chapter}章首个生态任务应出现`);
  closeSandboxTaskKinds(reserve, [sandboxTaskKind(first)], 1_000);
  assert.strictEqual(applySandboxTaskCadence(reserve, [second], 21_000).length, 0, `第${chapter}章20秒边界仍需等待`);
  assert.strictEqual(applySandboxTaskCadence(reserve, [second], 21_001).length, 1, `第${chapter}章超过20秒后应轮换下一任务`);
}

const idle = createReserveState();
idle.ecology.disease = 30;
const first = applySandboxTaskCadence(idle, [{ id: "disease", priority: 96, label: "病味扩散" }], 10_000);
assert.strictEqual(first.length, 1);
const stillVisible = applySandboxTaskCadence(idle, [{ id: "disease", priority: 96, label: "病味扩散" }], 10_000 + IDLE_HIDE_MS);
assert.strictEqual(stillVisible.length, 1, "不处理的火灾/水灾/病害不得在30秒后自动消失");

console.log("sandbox task cadence check ok");
