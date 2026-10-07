const assert = require("assert");
const {
  ensureEndlessGuardMode,
  advanceEndlessGuardMode,
  endlessGuardView,
  endlessDailyContract,
  endlessAuctionView,
  submitEndlessAuction,
  isEndlessGuardReady
} = require("../js/endlessGuardMode");
const { resolveGoals, createGoalState } = require("../js/goalSystem");

function reserveAtChapter(chapter) {
  return {
    fund: 2000,
    visitors: 120,
    safety: 72,
    ecologyScore: 68,
    business: 64,
    ecology: { water: 75, grass: 70, predators: { wolf: 1 }, herbivores: { deer: 1 }, birds: { egret: 1 } },
    progression: { stage: chapter, displayChapter: chapter, chapterComplete: chapter === 20, stageComplete: chapter === 20 },
    supplies: { dogFood: 10, alarm: 10, tranquilizer: 10, fieldKit: 10, medicalKit: 10 },
    guardianCycle: { day: 1 }
  };
}

const before = reserveAtChapter(19);
assert.strictEqual(isEndlessGuardReady(before), false, "第19章不应开启无限守护");
assert.strictEqual(ensureEndlessGuardMode(before), null, "第19章不应初始化赛季状态");

const reserve = reserveAtChapter(20);
const mode = ensureEndlessGuardMode(reserve);
assert(mode && mode.active, "第20章完成后应开启无限守护");
assert.strictEqual(mode.seasonDay, 1, "新赛季从第1日开始");
assert.strictEqual(mode.seasonLength, 28, "赛季长度应为28天");
assert.strictEqual(mode.dailyContracts.length, 3, "每天生成3个合同");
assert.strictEqual(mode.weeklyAuction.week, 1, "第1天应开放第1周拍卖");

const contract = endlessDailyContract(reserve);
assert(contract && !contract.complete, "应存在未完成的每日合同");
const beforeDay = reserve.endlessMode.seasonDay;
advanceEndlessGuardMode(reserve, { day: 1, action: contract.action, dayClosed: false });
assert.strictEqual(reserve.endlessMode.seasonDay, beforeDay, "同一天的多次操作不应推进赛季日");
assert((reserve.endlessMode.dailyContracts || []).some((item) => item.progress > 0), "合同动作应累计进度");

const auction = endlessAuctionView(reserve);
const bid = submitEndlessAuction(reserve, auction.lots[0].id);
assert.strictEqual(bid.ok, true, "基金充足时应可提交周拍卖");
assert.strictEqual(reserve.endlessMode.weeklyAuction.status, "submitted", "提交后应进入待结算状态");

for (let day = 1; day <= 27; day += 1) {
  advanceEndlessGuardMode(reserve, { day, action: "visitorReception", dayClosed: true });
}
assert.strictEqual(reserve.endlessMode.seasonNo, 1, "第27日结束前不应轮换赛季");
assert.strictEqual(reserve.endlessMode.seasonDay, 28, "应推进到第28日");
assert.strictEqual(reserve.endlessMode.weeklyAuction.week, 4, "第22日起应进入第4周拍卖");

advanceEndlessGuardMode(reserve, { day: 28, action: "visitorReception", dayClosed: true });
assert.strictEqual(reserve.endlessMode.seasonNo, 2, "第28日结算后应进入第2赛季");
assert.strictEqual(reserve.endlessMode.seasonDay, 1, "新赛季应从第1日重新开始");
assert.strictEqual(reserve.endlessMode.seasonHistory.length, 1, "应保留上一赛季结算记录");
assert.strictEqual(reserve.endlessMode.weeklyAuction.week, 1, "新赛季应刷新第1周拍卖");
assert(reserve.endlessMode.collection && reserve.endlessMode.collection.animalArchives >= 1, "已提交拍卖的奖励应进入无限守护收藏");
assert.strictEqual(reserve.endlessMode.collection.seasonBadges, 1, "赛季结算应发放赛季徽章");

const state20 = { world: { reserve: reserveAtChapter(20), knownCharacters: [], day: 1 } };
ensureEndlessGuardMode(state20.world.reserve);
state20.world.goals = createGoalState(state20);
const goals20 = resolveGoals(state20, state20.world.goals, "test");
const endlessGoal = [goals20.active.primary].concat(goals20.active.alternatives || []).find((item) => item && item.endlessContract);
assert(endlessGoal, "第20章每日合同应进入可执行目标");

const state19 = { world: { reserve: reserveAtChapter(19), knownCharacters: [], day: 1 } };
state19.world.goals = createGoalState(state19);
const goals19 = resolveGoals(state19, state19.world.goals, "test");
const unexpected = [goals19.active.primary].concat(goals19.active.alternatives || []).find((item) => item && item.endlessContract);
assert.strictEqual(unexpected, undefined, "前19章不应出现无限守护合同");

console.log("endless guard lifecycle checks passed");
