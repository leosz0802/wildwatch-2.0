"use strict";

const assert = require("node:assert/strict");
const { chapterPatrolNeed, settlePatrolRecord, calculatePatrolOutcome } = require("../js/worldHoundPatrol");
const { houndPatrolVolleyPayout } = require("../js/poacherVolley");

function expectDrive(chapter, cost) {
  const need = chapterPatrolNeed(chapter);
  const base = chapterPatrolNeed(1);
  const stake = Math.max(1, Math.round(cost) / 100);
  return {
    fund: Math.max(1, Math.round(100 * need.fund / base.fund * stake)),
    animals: Math.max(1, Math.round(2 * need.animals / base.animals * stake)),
    loss: Math.max(1, Math.round(60 * need.fund / base.fund * stake))
  };
}

const chapters = [1, 2, 3, 6, 11];
const drives = chapters.map((chapter) => houndPatrolVolleyPayout("drive", 100, chapter));
drives.forEach((payout, index) => {
  const chapter = chapters[index];
  const expected = expectDrive(chapter, 100);
  assert.equal(payout.chapter, chapterPatrolNeed(chapter).chapter, `第${chapter}章齐射要记在这一章`);
  assert.equal(payout.fund, expected.fund, `第${chapter}章驱离基金要按该章基金需要缩放`);
  assert.equal(payout.animals, expected.animals, `第${chapter}章驱离动物要按该章动物目标缩放`);
  assert.equal(payout.poacher, -8, "偷猎压力仍按0到100的刻度，不随章节放大");
});

assert.notEqual(drives[0].fund, drives[2].fund, "第1章和第3章的驱离基金必须不同");
assert.notEqual(drives[2].fund, drives[4].fund, "第3章和第11章的驱离基金必须不同");
assert.equal(drives[0].fund, 100, "第1章投入100时，驱离基金仍是100");
assert.equal(drives[0].animals, 2, "第1章投入100时，驱离动物仍是2");

const chapter3Loss = houndPatrolVolleyPayout("breach", 100, 3);
const chapter1Loss = houndPatrolVolleyPayout("breach", 100, 1);
assert.equal(chapter1Loss.fund, -60, "第1章投入100时，被突破基金仍是-60");
assert.equal(chapter3Loss.fund, -expectDrive(3, 100).loss, "第3章被突破基金按第3章基金需要缩放");
assert.ok(chapter3Loss.fund < chapter1Loss.fund, "章节基金需要更高时，惩罚也更大");
assert.equal(chapter3Loss.animals, -expectDrive(3, 100).animals, "第3章被突破动物与该章驱离动物数量相反");

const hold = houndPatrolVolleyPayout("hold", 1000, 11);
assert.equal(hold.fund, 0, "僵持不奖不罚基金");
assert.equal(hold.animals, 0, "僵持不奖不罚动物");
assert.equal(hold.poacher, -3, "僵持仍只降低3点偷猎压力");

const fullStake = houndPatrolVolleyPayout("drive", 1000, 6);
assert.equal(fullStake.fund, expectDrive(6, 1000).fund, "同一章投入1000时，基金按10倍章节数值");
assert.ok(fullStake.fund > houndPatrolVolleyPayout("drive", 100, 6).fund, "同一章投入更高，奖励更高");

const volley = houndPatrolVolleyPayout("drive", 100, 3);
const formula = calculatePatrolOutcome({ cost: 100, safety: 0, chapter: 3, fund: 5000, visitors: 1000, animals: 1000 });
const settled = settlePatrolRecord({
  status: "pending",
  settleAt: 0,
  volley,
  rewardApplied: true,
  actorReward: formula.actorReward,
  cost: 100,
  chapter: 3,
  targetSnapshot: { safety: 0, fund: 5000, visitors: 1000, animals: 1000 }
}, Date.now());
assert.equal(settled.actorReward.fund, volley.fund, "齐射记录在5分钟后仍保留章节齐射基金，不再改成巡逻公式");
assert.equal(settled.actorReward.animals, volley.animals, "齐射记录在5分钟后仍保留章节齐射动物");
assert.notEqual(settled.actorReward.fund, formula.actorReward.fund, "齐射基金不要被旧的巡逻公式覆盖");

const plain = settlePatrolRecord({
  status: "pending",
  settleAt: 0,
  cost: 1000,
  chapter: 3,
  targetSnapshot: { safety: 0, fund: 5000, visitors: 1000, animals: 1000 }
}, Date.now());
assert.equal(plain.actorReward.fund, formula.actorReward.fund === chapterPatrolNeed(3).fund ? chapterPatrolNeed(3).fund : plain.actorReward.fund, "没有齐射的巡逻仍走原来的章节公式");
assert.equal(plain.actorReward.fund, calculatePatrolOutcome({ cost: 1000, safety: 0, chapter: 3, fund: 5000, visitors: 1000, animals: 1000 }).actorReward.fund, "没有齐射标记时，结算仍使用巡逻公式");

console.log("hound patrol volley chapter payouts ok");
