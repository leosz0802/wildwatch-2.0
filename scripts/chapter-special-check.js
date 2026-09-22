const assert = require("assert");
const { createCharacter } = require("../js/storage");
const {
  CATALOG,
  UNLOCK_DELAY_MS,
  chapterSpecialStatus,
  applyChapterSpecialReward,
  skippedCardStories,
  chapterSpecialDef
} = require("../js/chapterSpecialSystem");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { ANIMAL_INTERACTION_STORIES } = require("../js/animalInteractionStories");
const { progressionGate } = require("../js/balanceConfig");
const { resolveGoals } = require("../js/goalSystem");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.strictEqual(CATALOG.length, 20, "二十章都必须有特别剧情和任务");
const storyNames = new Set();
const taskNames = new Set();
CATALOG.forEach((entry) => {
  assert(entry.storyTitle && entry.taskTitle && entry.storyTitle !== entry.taskTitle, `${entry.chapter} 剧情名和任务名必须不同`);
  assert.strictEqual(entry.mode, "archery", `第${entry.chapter}章特别任务必须先射箭`);
  assert(!/掷点|掷骰/.test(entry.taskBody), `第${entry.chapter}章任务说明不能在射箭前给出掷点结果`);
  assert.strictEqual(entry.metrics.length, 2, `${entry.chapter} 必须只影响两项关键数据`);
  entry.metrics.forEach((metric) => {
    assert(["visitors", "animals", "water", "grass", "fund"].includes(metric), `${entry.chapter} 指标非法`);
    assert(Number.isFinite(entry.success[metric]) && Number.isFinite(entry.fail[metric]), `${entry.chapter} 正负结算必须覆盖 ${metric}`);
  });
  assert(entry.skipCards.length >= 1 && entry.skipCards.length <= 2, `${entry.chapter} 应减去1-2张不紧要卡片剧情`);
  assert(!storyNames.has(entry.storyTitle), `剧情名重复 ${entry.storyTitle}`);
  assert(!taskNames.has(entry.taskTitle), `任务名重复 ${entry.taskTitle}`);
  storyNames.add(entry.storyTitle);
  taskNames.add(entry.taskTitle);
});

const fresh = createCharacter(null, "特别任务").world.reserve;
const t0 = Date.now();
fresh.chapterSpecial = { version: 1, chapter: 1, enteredAt: t0, unlocked: false, completed: false };
assert.strictEqual(chapterSpecialStatus(clone(fresh), t0).available, false, "进章立刻不能给出特别任务");
assert.strictEqual(chapterSpecialStatus(clone(fresh), t0 + UNLOCK_DELAY_MS - 1000).available, false, "未满约1分钟不能解锁");
assert.strictEqual(chapterSpecialStatus(clone(fresh), t0 + UNLOCK_DELAY_MS).available, true, "约1分钟后必须解锁");

const lockedGoals = resolveGoals({ world: { reserve: clone(fresh), goals: null } }, null, "locked");
assert(!(lockedGoals.active.primary && lockedGoals.active.primary.recommendedAction === "chapterSpecial"), "未到时间不得进入任务栏");

const readyReserve = clone(fresh);
readyReserve.chapterRescue = Object.assign({}, readyReserve.chapterRescue || {}, { enforceCompletion: false, animals: {}, targets: [] });
readyReserve.chapterSpecial = { version: 1, chapter: 1, enteredAt: t0 - UNLOCK_DELAY_MS, unlocked: true, completed: false };
const readyState = { world: { reserve: readyReserve, goals: null } };
const readyGoals = resolveGoals(readyState, null, "ready");
assert.strictEqual(readyGoals.active.primary.recommendedAction, "chapterSpecial", "解锁后特别任务应进入任务栏");
assert.strictEqual(readyGoals.active.primary.title, chapterSpecialDef(1).taskTitle, "任务栏必须用任务名而不是剧情名");

const waterBefore = readyReserve.ecology.water;
const animalsBefore = livingAnimalTotal(readyReserve);
const awarded = applyChapterSpecialReward(readyReserve, 6, t0);
assert(awarded.ok && awarded.success, "射箭高分必须成功");
assert.strictEqual(awarded.changes.length, 2, "结算只能改两项");
assert.strictEqual(livingAnimalTotal(readyReserve), animalsBefore + 8, "第1章成功必须直接增加动物");
assert.strictEqual(readyReserve.ecology.water, waterBefore + 3, "第1章成功必须直接增加水源");
assert.strictEqual(chapterSpecialStatus(readyReserve, t0).available, false, "完成后不得重复领取");

const failed = clone(fresh);
failed.chapterSpecial = { version: 1, chapter: 2, enteredAt: t0 - UNLOCK_DELAY_MS, unlocked: true, completed: false };
failed.progression = Object.assign({}, failed.progression, { stage: 2, displayChapter: 2 });
const grassBefore = failed.ecology.grass;
const water2 = failed.ecology.water;
const miss = applyChapterSpecialReward(failed, 2, t0);
assert(miss.ok && !miss.success, "射箭低点必须判定失败并仍改两项数据");
assert.strictEqual(failed.ecology.water, water2 - 4, "第2章失败必须直接降低水源");
assert.strictEqual(failed.ecology.grass, grassBefore - 3, "第2章失败必须直接降低草地");

const skipped = skippedCardStories(1);
assert.strictEqual(skipped.length, 2, "第1章应减去两张不紧要卡片");
skipped.forEach((id) => assert(ANIMAL_INTERACTION_STORIES.some((item) => item.id === id), `减去的卡片必须是已有卡片剧情 ${id}`));

assert.strictEqual(progressionGate(2).storyBeats, 5, "偶数章事件链应减少不紧要卡片");
assert.strictEqual(progressionGate(1).storyBeats, 2, "第1章前半段仍保留两段必要剧情");

// The task must not settle metrics or expose a verdict until the arrow
// animation reports that it has landed.
{
  const flowGame = Object.create(require("../js/game").Game.prototype);
  flowGame.state = createCharacter(null, "特别任务先射箭");
  const reserve = flowGame.state.world.reserve;
  reserve.progression = Object.assign({}, reserve.progression, { stage: 2, displayChapter: 2 });
  reserve.chapterSpecial = { version: 1, chapter: 2, enteredAt: t0 - UNLOCK_DELAY_MS, unlocked: true, completed: false };
  const def = chapterSpecialDef(2);
  const waterBeforeShot = reserve.ecology.water;
  flowGame.infoDetailModal = {
    kind: "chapterSpecialTask",
    phase: "ready",
    def,
    displayRoll: 0,
    actionLabel: "射箭判定"
  };
  flowGame.render = flowGame.playSfx = flowGame.playArcheryImpact = flowGame.toast = () => {};
  flowGame.lockArcheryAim = () => .5;
  flowGame.archeryScoreFor = () => 5;
  let arrowLanded = null;
  flowGame.animateInlineDiceRoll = (modal, roll, tokenKey, onDone) => {
    assert.strictEqual(modal.phase, "rolling", "必须先进入箭矢飞行阶段");
    assert.strictEqual(modal.result, null, "箭矢飞行时不能先出现判定结果");
    assert.strictEqual(reserve.ecology.water, waterBeforeShot, "箭矢落靶前不能提前结算数值");
    modal.displayRoll = roll;
    arrowLanded = onDone;
  };
  assert.strictEqual(flowGame.resolveChapterSpecialTask(), true);
  assert.strictEqual(flowGame.infoDetailModal.phase, "rolling");
  assert.strictEqual(reserve.chapterSpecial.completed, false, "射箭动画结束前任务不能完成");
  arrowLanded();
  assert.strictEqual(flowGame.infoDetailModal.phase, "result", "箭矢落靶后才显示判定结果");
  assert.strictEqual(flowGame.infoDetailModal.result.roll, 5, "判定必须使用刚刚射出的点数");
  assert.strictEqual(reserve.chapterSpecial.completed, true);
}

const { sendFriendAidRequest, openFriendAidParcel, friendAidMarkers } = require("../js/friendAidSystem");
const { noteSandboxExchangeItem } = require("../js/wildernessKnowledge");
const aidReserve = clone(fresh);
aidReserve.wildernessKnowledge = { tradeStock: { resin_tinder: 2 } };
noteSandboxExchangeItem(aidReserve, "resin_tinder", t0);
aidReserve.chapterSpecial = { version: 1, chapter: 1, enteredAt: t0 - UNLOCK_DELAY_MS, unlocked: true, completed: false };
assert.strictEqual(friendAidMarkers(aidReserve, t0).length, 1, "新物品出现后应有沙盘交换标记");
assert.strictEqual(friendAidMarkers(aidReserve)[0].type, "friendAidRequest");
assert(/发出交换/.test(friendAidMarkers(aidReserve)[0].label), "求援标记必须写成发出交换");
const sent = sendFriendAidRequest(aidReserve, []);
assert(sent.ok && /阿澈/.test(sent.parcel.friendName) && sent.parcel.status === "sealed", "无好友时由巡护员完成交换");
assert.strictEqual(friendAidMarkers(aidReserve)[0].type, "friendAidParcel", "匹配后应变为交换结果标记");
assert(/交换结果/.test(friendAidMarkers(aidReserve)[0].label), "收到标记必须写成交换结果");
assert(openFriendAidParcel(aidReserve).ok, "必须能确认收到的交换结果");
assert(!friendAidMarkers(aidReserve).some((marker) => marker.type === "friendAidParcel"), "确认后沙盘不再留收到包裹");
const specialBefore = chapterSpecialStatus(aidReserve, t0).available;
assert.strictEqual(chapterSpecialStatus(aidReserve, t0).available, specialBefore, "物资交换不得挡住特别任务");
const afterAid = applyChapterSpecialReward(aidReserve, 6, t0);
assert(afterAid.ok && afterAid.success, "物资交换后特别任务仍能独立过关");

console.log("chapter special check ok");
