const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { createReserveState } = require("../js/world");
const { normalizeCollectionState } = require("../js/collectionSystem");
const { chapterVisitorTotal } = require("../js/chapterTargets");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { animalSourceSummary } = require("../js/animalSourceLedger");
const {
  FACILITY_USE_PROFILES,
  FACILITIES,
  FACILITY_USE_LIMIT,
  facilityStates,
  facilityUsePreview,
  applyFacilityUseAd,
  applyFacilityUse,
  nextFacilityUseTarget,
  applyFacilityDailyEffects
} = require("../js/reserveFacilities");

function makeState(chapter = 1) {
  const state = createCharacter(null, "站务检查");
  const reserve = Object.assign(createReserveState(), state.world.reserve || {});
  reserve.progression = Object.assign({}, reserve.progression || {}, {
    stage: chapter,
    displayChapter: chapter,
    level: Math.min(5, chapter)
  });
  reserve.guardianCycle = Object.assign({}, reserve.guardianCycle || {}, { day: 6 });
  reserve.supplies = Object.assign({}, reserve.supplies || {}, {
    dogFood: 8,
    fieldKit: 8,
    alarm: 8,
    medicalKit: 8
  });
  reserve.fund = Math.max(400, Number(reserve.fund) || 0);
  reserve.safety = 50;
  reserve.poacherPressure = 30;
  reserve.reputation = 20;
  reserve.ecology = Object.assign({
    predators: { wolf: 4 },
    herbivores: { deer: 24, antelope: 1, hare: 30 },
    birds: { crow: 8 },
    water: 40,
    grass: 40,
    disease: 10
  }, reserve.ecology || {});
  state.world.reserve = reserve;
  return state;
}

const profiles = Object.keys(FACILITY_USE_PROFILES);
assert.strictEqual(profiles.length, 6, "六座站都应有当日使用");
assert.strictEqual(FACILITY_USE_PROFILES.old_patrol_post.animals, 1, "巡护站用动物替代安全");
assert(!FACILITY_USE_PROFILES.guardian_memorial.animals, "纪念墙不另开动物来源");

const ch1 = makeState(1);
const ch1States = facilityStates(ch1);
const patrol = ch1States.find((item) => item.id === "old_patrol_post");
const hall = ch1States.find((item) => item.id === "governance_hall");
assert(patrol.available && patrol.status === "repaired", "第1章巡护站应可直接使用，不必先做现场勘验");
assert(!hall.available, "治理厅应到第5章才解锁");
assert.strictEqual(patrol.statusLabel, "可使用");

const preview = facilityUsePreview(ch1, "old_patrol_post");
assert.strictEqual(preview.action, "派出短巡");
assert.strictEqual(preview.costLabel, "狗粮×1 · 基金20");
assert.strictEqual(preview.fund, 20, "第1章巡护站基金应等于20×章节");
assert.strictEqual(preview.animals, 1);
assert(preview.ready, "有狗粮和基金时应可派出短巡");

const safetyBefore = ch1.world.reserve.safety;
const poacherBefore = ch1.world.reserve.poacherPressure;
const dogBefore = ch1.world.reserve.supplies.dogFood;
const patrolFundBefore = Number(ch1.world.reserve.fund) || 0;
const animalsBefore = livingAnimalTotal(ch1.world.reserve);
const taskedBefore = animalSourceSummary(ch1.world.reserve).tasked;
const first = applyFacilityUse(ch1, "old_patrol_post");
assert(first.ok, first.error || "第一次使用应成功");
assert.strictEqual(ch1.world.reserve.supplies.dogFood, dogBefore - 1);
assert.strictEqual(ch1.world.reserve.fund, patrolFundBefore - 20, "第1章巡护站应扣除基金20");
assert.strictEqual(ch1.world.reserve.safety, safetyBefore, "巡护站不得改安全");
assert.strictEqual(ch1.world.reserve.poacherPressure, poacherBefore - 1);
assert.strictEqual(livingAnimalTotal(ch1.world.reserve), animalsBefore + 1, "第1章巡护站应增加1只动物");
assert.strictEqual(animalSourceSummary(ch1.world.reserve).tasked, taskedBefore + 1, "动物必须记入任务台账");
assert.strictEqual(first.preview.remaining, 2, "第一次用完后还应剩2次");
const second = applyFacilityUse(ch1, "old_patrol_post");
assert(second.ok, second.error || "同一天应能再用");
assert.strictEqual(livingAnimalTotal(ch1.world.reserve), animalsBefore + 2, "第二次仍按章节加动物");
const third = applyFacilityUse(ch1, "old_patrol_post");
assert(third.ok, third.error || "第三次免费使用应成功");
assert.strictEqual(third.preview.remaining, 0, "第三次用完免费额度后应剩0次");
assert(third.preview.adEligible, "免费3次用完后应开放一次广告加次");
const fourthBeforeAd = applyFacilityUse(ch1, "old_patrol_post");
assert(!fourthBeforeAd.ok && fourthBeforeAd.usedToday, "免费额度用完后应先看广告");
const adStatus = require("../js/reserveFacilities").facilityUseAdStatus(ch1, "old_patrol_post");
assert(adStatus.eligible, "免费额度用完后广告应可领取");
const adGrant = applyFacilityUseAd(ch1, "old_patrol_post");
assert(adGrant.ok && adGrant.granted === 3, "一次广告应追加3次使用");
assert.strictEqual(facilityUsePreview(ch1, "old_patrol_post").remaining, 3, "广告后应恢复3次可用额度");
for (let index = 0; index < 3; index += 1) {
  const extra = applyFacilityUse(ch1, "old_patrol_post");
  assert(extra.ok, extra.error || `广告追加后的第${index + 4}次应成功`);
}
const seventh = applyFacilityUse(ch1, "old_patrol_post");
assert(!seventh.ok && seventh.usedToday, "免费3次+广告3次后应停止");

const target = nextFacilityUseTarget(ch1);
assert(!target || target.id !== "old_patrol_post", "用满6次后巡护站不再作为任务目标");

const archivePreview = facilityUsePreview(ch1, "hydrology_station");
assert(archivePreview.locked, "第1章不应打开水文站");

const daily = applyFacilityDailyEffects(ch1.world.reserve, 6);
assert.strictEqual(livingAnimalTotal(ch1.world.reserve), animalsBefore + 6, "日结算不得再加动物");

FACILITIES.forEach((facility) => {
  const state = createCharacter(null, `建筑次数-${facility.id}`);
  normalizeCollectionState(state);
  const reserve = state.world.reserve;
  const chapter = Math.max(1, Number(facility.chapter) || 1);
  reserve.progression = Object.assign({}, reserve.progression || {}, {
    stage: chapter,
    displayChapter: chapter,
    level: Math.min(7, Math.ceil(chapter / 2))
  });
  reserve.fund = 100000;
  reserve.supplies = Object.assign({}, reserve.supplies || {}, {
    dogFood: 20,
    fieldKit: 20,
    alarm: 20,
    medicalKit: 20
  });
  if (facility.caseId === "hidden") {
    state.world.collection.leads.push({ id: `${facility.id}_lead`, caseId: "hidden" });
  }
  const firstPreview = facilityUsePreview(state, facility.id);
  assert(firstPreview.ready, `${facility.id} should be ready at its chapter`);
  for (let count = 0; count < FACILITY_USE_LIMIT; count += 1) {
    assert(applyFacilityUse(state, facility.id).ok, `${facility.id} free use ${count + 1} should succeed`);
  }
  assert(facilityUsePreview(state, facility.id).adEligible, `${facility.id} should offer the reward ad after 3 uses`);
  assert(applyFacilityUseAd(state, facility.id).ok, `${facility.id} reward ad should grant 3 uses`);
  for (let count = 0; count < 3; count += 1) {
    assert(applyFacilityUse(state, facility.id).ok, `${facility.id} ad use ${count + 1} should succeed`);
  }
  const exhausted = facilityUsePreview(state, facility.id);
  assert(exhausted.usedToday && exhausted.remaining === 0, `${facility.id} should exhaust at 6 uses`);
});

const ch5 = makeState(5);
const latePreview = facilityUsePreview(ch5, "old_patrol_post");
assert.strictEqual(latePreview.animals, 7, "第5章巡护站每次带回章节+2只动物");
assert.strictEqual(latePreview.fund, 175, "第5章巡护站基金应等于20×5×1.75");
assert.strictEqual(latePreview.costLabel, "狗粮×1 · 基金175");
const hallPreview = facilityUsePreview(ch5, "governance_hall");
assert(hallPreview.ready, "第5章治理厅应用基金发布公告");
assert.strictEqual(hallPreview.costLabel, "基金350");
assert.strictEqual(hallPreview.fund, 350, "第5章治理厅基金应等于40×5×1.75");
assert.strictEqual(hallPreview.visitors, 0, "治理厅从一开始就不再增长游客");
assert.strictEqual(hallPreview.animals, 5, "第5章治理厅动物应等于章节5");
const visitorsBefore = chapterVisitorTotal(ch5.world.reserve);
const fundBefore = Number(ch5.world.reserve.fund) || 0;
const hallAnimalsBefore = livingAnimalTotal(ch5.world.reserve);
const hallTaskedBefore = animalSourceSummary(ch5.world.reserve).tasked;
const hallUse = applyFacilityUse(ch5, "governance_hall");
assert(hallUse.ok, hallUse.error || "治理厅使用应成功");
assert.strictEqual(chapterVisitorTotal(ch5.world.reserve), visitorsBefore, "治理厅不得增加本章游客");
assert.strictEqual(ch5.world.reserve.fund, fundBefore - 350, "治理厅应扣除基金350");
assert.strictEqual(livingAnimalTotal(ch5.world.reserve), hallAnimalsBefore + 5, "治理厅每次应留下章节数量的动物");
assert.strictEqual(animalSourceSummary(ch5.world.reserve).tasked, hallTaskedBefore + 5, "治理厅动物应记入任务来源");

console.log("station facility use check ok");
