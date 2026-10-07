const assert = require("assert");
const { createCharacter } = require("../js/storage");
const {
  CONTRACT_EXPIRY_MS,
  CONTRACTS,
  friendContractStatus,
  startFriendContract,
  completeFriendContractSide,
  expireFriendContract,
  friendContractHistory
} = require("../js/friendContractSystem");

const friend = [{ id: "friend_1", owner: "林岚", simulated: false }];
const state = createCharacter(null, "好友合同测试");
const reserve = state.world.reserve;
const dayOne = new Date(2026, 9, 3, 10, 0, 0).getTime();
const nextDay = dayOne + 24 * 60 * 60 * 1000;
const ledgerBefore = {
  fund: reserve.fund,
  supplies: JSON.stringify(reserve.inventory || {}),
  pendingRecovered: JSON.stringify(reserve.pendingRecovered || {})
};

let status = friendContractStatus(reserve, [], dayOne);
assert.equal(status.slots.length, 0, "没有选择真实好友时不得创建系统/NPC合同");
assert.equal(status.partner, null, "没有真实好友时不得注入系统好友");
assert.equal(status.canCompletePlayer, false, "没有真实好友时不能直接完成合同");
assert.equal(CONTRACTS.length >= 6, true, "合同主题需要至少六种轮换内容");

status = friendContractStatus(reserve, friend, dayOne);
assert.equal(status.slots.length, 1, "选择真实好友后应创建一个合同槽位");
assert.equal(status.partner.kind, "player", "合同对象必须是真实好友");
assert.equal(status.selectedSlot.started, false, "合同必须等待明确发起");

let started = startFriendContract(reserve, friend, dayOne + 1000, status.selectedSlot.id);
assert(started.ok && started.started, "选择好友后应能发起合同");
assert.equal(started.slot.expiresAt, dayOne + 1000 + CONTRACT_EXPIRY_MS, "合同有效期必须从发起时间起算48小时");

let playerDone = completeFriendContractSide(reserve, friend, "player", "巡护操作", dayOne + 2000, started.slot.id);
assert.equal(playerDone.ok, false, "发起人确认后不应再出现第二个本地操作步骤");
assert.equal(started.slot.status, "awaiting_partner", "发起后应等待好友执行");
assert.equal(started.slot.player.completed, true, "发起确认应记录发起人的贡献");
assert.equal(reserve.fund, ledgerBefore.fund, "单方完成不能发放基金");

const beforeExpiry = dayOne + 1000 + CONTRACT_EXPIRY_MS - 1;
const waiting = expireFriendContract(reserve, friend, beforeExpiry, false, started.slot.id);
assert.equal(waiting.ok, false, "48小时未到不能作废合同");
const expired = expireFriendContract(reserve, friend, dayOne + 1000 + CONTRACT_EXPIRY_MS, false, started.slot.id);
assert(expired.ok && expired.expired, "48小时后合同必须作废");
assert.equal(expired.slot.status, "expired");
assert.equal(expired.slot.rewardClaimed, false, "作废合同不得发放奖励");
assert.equal(reserve.fund, ledgerBefore.fund, "作废合同不得发放基金");
assert.equal(JSON.stringify(reserve.inventory || {}), ledgerBefore.supplies, "作废合同不得发放物资");
assert.equal(JSON.stringify(reserve.pendingRecovered || {}), ledgerBefore.pendingRecovered, "作废合同不得发放收藏物资");
assert(friendContractHistory(reserve).some((entry) => entry.type === "expired"), "合同历史必须记录作废");

// A later natural day can start a new contract with the same friend.
status = friendContractStatus(reserve, friend, nextDay);
started = startFriendContract(reserve, friend, nextDay + 1000, status.selectedSlot.id);
assert(started.ok && started.started, "作废后下一自然日仍可发起新合同");
let partnerDone = completeFriendContractSide(reserve, friend, "partner", "好友执行", nextDay + 2000, started.slot.id);
assert(partnerDone.ok && partnerDone.slot.status === "completed", "好友执行后合同立即结算");
playerDone = partnerDone;
assert.equal(playerDone.slot.rewardClaimed, true, "好友执行后应记录奖励");
assert(reserve.fund > ledgerBefore.fund, "双方完成后应发放基金奖励");

// The five-friend limit remains, but no slot may be an NPC fallback.
const multi = createCharacter(null, "好友合同五人测试").world.reserve;
const multiNow = new Date(2026, 9, 6, 9, 0, 0).getTime();
const fiveFriends = Array.from({ length: 7 }, (_, index) => ({
  id: `friend_${index + 1}`,
  owner: `好友${index + 1}`,
  simulated: false
}));
const multiStatus = friendContractStatus(multi, fiveFriends, multiNow);
assert.equal(multiStatus.slots.length, 5, "好友合同最多同时支持5个好友");
assert(multiStatus.slots.every((slot) => slot.partner && slot.partner.kind === "player"), "五个槽位都必须是真实好友");
assert.equal(friendContractStatus(createCharacter(null, "无好友合同").world.reserve, [], multiNow).slots.length, 0, "无好友时合同列表应为空");

console.log("friend contract check ok: real friend only, 48h expiry, no NPC fallback, both-side completion");
