const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "好友合同入口测试");
game.cloudService = {
  friendRows: [
    { id: "friend_1", owner: "林岚", simulated: false },
    { id: "friend_2", owner: "河湾", simulated: false }
  ]
};
game.wechatFriends = { friendRows: [] };

assert.deepEqual(game.friendAidAllies().map((row) => row.id), ["friend_1", "friend_2"], "好友合同入口应合并可用好友列表");
game.openFriendContractModal();
assert.equal(game.screen, "league", "无好友对象时应跳转好友列表，而不是打开第二个选择弹窗");
game.openFriendContractForLeaguePlayer({ id: "friend_1", owner: "林岚", name: "林岚的自然", friend: true });
assert.equal(game.infoDetailModal.kind, "friendContractStartConfirm", "好友详情应直接进入合同确认");
assert.equal(game.infoDetailModal.selectedSlotId.length > 0, true, "发起合同前应锁定当前好友槽位");
assert.equal(game.infoDetailModal.items.length, 1, "合同确认页只展示合同内容");
assert.equal(game.infoDetailModal.choices.length, 1, "合同确认页只展示确定按钮");
game.infoDetailModal.choices[0].action();
assert.equal(
  game.state.world.reserve.friendContract.slots.some((slot) => slot.id === game.infoDetailModal.selectedSlotId && slot.started),
  true,
  "确认后应标记合同已发起"
);
game.openFriendContractInboxModal();
assert.equal(game.infoDetailModal.kind, "friendContractInbox", "合同记录应打开收件箱");
const started = game.infoDetailModal.items.find((item) => item.contractEntry && item.contractEntry.type === "started");
assert(started, "已发起的合同应单独列出");
assert.equal(started.title, "林岚", "真实好友昵称应显示在合同记录上");
assert.equal(started.listRow, true, "合同记录应使用单行列表");
assert(String(started.listStatus || started.body).includes("待好友执行"), "合同记录应显示状态，而不是截断成省略号");
game.openInfoListItemDetail(game.infoDetailModal, started, 0);
assert.equal(game.infoDetailModal.kind, "friendContractHistoryDetail", "点开合同记录应进入详情");
assert(String(game.infoDetailModal.prose || "").length > 4, "未执行合同应直接展示合同内容");
assert(!/付出|收益/.test(String(game.infoDetailModal.prose || "")), "未执行合同只显示合同内容，不显示付出和收益");
assert.deepEqual((game.infoDetailModal.items || []).map((item) => item.tag), ["合同内容"], "未执行合同详情只显示合同内容一段");
game.openFriendContractHistoryDetail({
  type: "completed",
  status: "completed",
  partnerName: "林岚",
  objective: "community_archive",
  dateKey: "2026-10-05",
  rewardText: "基金 +35 · 狗粮 +1"
});
assert(/付出/.test(String(game.infoDetailModal.prose || "")) && /收益/.test(String(game.infoDetailModal.prose || "")), "执行完的合同应同时展示合同内容、付出和收益");
assert(/基金 \+35/.test(String(game.infoDetailModal.prose || "")), "执行完的合同应写出具体收益");
assert.deepEqual((game.infoDetailModal.items || []).map((item) => item.tag), ["合同内容", "付出", "收益"], "完成合同详情应分成合同内容、付出、收益三段");
assert(/基金 \+35/.test(String((game.infoDetailModal.items[2] || {}).title || "")), "收益段应写出具体收益");
const coded = game.friendContractHistoryView({ partnerId: "cloud_ab12", partnerName: "溪望·7ABE的雨林", objective: "patrol_note", type: "started", dateKey: "2026-10-04" }, [
  { id: "cloud_ab12", owner: "溪望·7ABE", name: "溪望·7ABE的雨林", friendMatchKey: "a".repeat(64) }
]);
assert.equal(coded.name, "微信好友", "服务器代号和保护区标题不能当作微信昵称");
assert.equal(coded.needsNickname, true, "代号好友必须改用开放数据域里的微信昵称");
assert.equal(coded.identity.friendMatchKey, "a".repeat(64), "合同记录要用好友匹配键去对齐微信昵称");
assert.equal(coded.identity.worldPlayerId, "ab12", "合同详情仍保留好友标识，用来匹配微信昵称");
game.renderedWechatFriendRank = {
  rankReady: true,
  view: { w: 300, h: 260 },
  openDataView: "detail",
  openDataSelectedIndex: 0
};
game.friendRankOpenDataState = game.renderedWechatFriendRank;
game.wechatFriends = {
  surfaceMode: "nicknames",
  lastNicknameSignature: "stale",
  refresh(width, height) { this.refreshed = `${width}x${height}`; this.surfaceMode = "rank"; }
};
game.closeFriendContractInboxModal();
assert.equal(game.infoDetailModal, null, "关闭合同历史应回到好友榜，而不是残留详情层");
assert.equal(game.renderedWechatFriendRank.openDataView, "list", "关闭合同历史应把开放数据域切回好友列表");
assert.equal(game.wechatFriends.surfaceMode, "rank", "关闭合同历史后不能继续占用昵称层画布");
assert.equal(game.wechatFriends.refreshed, "300x260", "关闭合同历史应重新拉取好友榜");
console.log("friend contract UI selection check ok");
