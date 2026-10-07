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
assert(!stillCooling.mapMarkers.some((item) => sandboxTaskKind(item) === "disease"), "前两章同类任务间隔必须超过加长后的窗口");
const afterGap = buildReserveView(crowded, crowded, { day: 6, season: "雨季", weather: "暴雨", now: 50_001 + EARLY_CHAPTER_SAME_KIND_GAP_MS });
assert(afterGap.mapMarkers.some((item) => sandboxTaskKind(item) === "disease") || afterGap.mapMarkers.filter((item) => item.presentation !== "resource-flow").length === 1, "前两章超过加长间隔后疾病任务可以再次出现或让位给更高优先级");

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
  const stillGap = applySandboxTaskCadence(sequential, [flood], 8_000 + SYSTEM_TASK_CROSS_KIND_GAP_MS);
  assert.strictEqual(stillGap.length, 0, "结束后仍需额外间隔才推下一个系统任务");
  const ready = applySandboxTaskCadence(sequential, [flood], 8_001 + SYSTEM_TASK_CROSS_KIND_GAP_MS);
  assert.strictEqual(ready.some((item) => sandboxTaskKind(item) === "flood"), true, "间隔过后才能推下一个系统任务");
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
assert.strictEqual(lateStillCooling.length, 0, "第3章起同类任务仍需间隔3分钟");
const lateReady = applySandboxTaskCadence(late, [{ id: "disease", priority: 96, eventType: "sandbox_disease", label: "病味扩散" }], 20_001 + SAME_KIND_GAP_MS);
assert.strictEqual(lateReady.length, 1, "第3章起超过3分钟后同类任务可以再出现");

const idle = createReserveState();
idle.ecology.disease = 30;
const first = applySandboxTaskCadence(idle, [{ id: "disease", priority: 96, label: "病味扩散" }], 10_000);
assert.strictEqual(first.length, 1);
const stillVisible = applySandboxTaskCadence(idle, [{ id: "disease", priority: 96, label: "病味扩散" }], 10_000 + IDLE_HIDE_MS);
assert.strictEqual(stillVisible.length, 1, "不处理的火灾/水灾/病害不得在30秒后自动消失");

console.log("sandbox task cadence check ok");
