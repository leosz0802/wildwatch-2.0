const assert = require("node:assert/strict");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { friendContractStatus, startFriendContract } = require("../js/friendContractSystem");

const fallbackGame = Object.create(Game.prototype);
let fallbackPickerOpened = 0;
let fallbackCancelled = 0;
fallbackGame.renderedWechatFriendRank = {
  rankReady: true,
  view: { w: 320, h: 320 },
  openDataView: "list",
  openDataRows: []
};
fallbackGame.wechatFriends = {
  pointer(phase) {
    if (phase === "cancel") fallbackCancelled += 1;
  }
};
fallbackGame.openFriendContractFromRankSelection = () => {
  fallbackPickerOpened += 1;
  return true;
};
assert.equal(
  fallbackGame.handleFriendRankOpenDataTap(160, 280),
  true,
  "Android open-data detail CTA should work when the main domain has no mirrored rows"
);
assert.equal(fallbackPickerOpened, 1, "fallback CTA should open the real friend picker instead of contract history");
assert.equal(fallbackCancelled, 1, "fallback CTA should cancel the open-data gesture");

let staleListPlayer = null;
const staleListGame = Object.create(Game.prototype);
staleListGame.renderedWechatFriendRank = {
  rankReady: true,
  view: { w: 320, h: 320 },
  openDataView: "list",
  openDataSelectedIndex: 0,
  openDataRows: [{ id: "cloud_friend", owner: "Nicole.英", name: "Nicole.英的自然" }]
};
staleListGame.wechatFriends = { pointer() {} };
staleListGame.openFriendContractForLeaguePlayer = player => { staleListPlayer = player; };
assert.equal(
  staleListGame.handleFriendRankOpenDataTap(160, 280),
  true,
  "stale list mirror should still route the visible detail CTA"
);
assert.equal(staleListPlayer.id, "cloud_friend", "stale list mirror should keep the selected friend");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "好友合同直达入口测试");
game.cloudService = {
  friendRows: [],
  feature() { return true; }
};
game.wechatFriends = { friendRows: [] };
game.openFriendContractForLeaguePlayer({
  id: "cloud_friend",
  name: "Nicole.英的自然",
  owner: "Nicole.英",
  friend: true
});
assert.equal(game.infoDetailModal.kind, "friendContractStartConfirm", "详情 CTA should enter the contract confirmation directly");
assert.equal(game.infoDetailModal.partner.name, "Nicole.英", "合同对象应使用当前好友昵称，而不是保护区名称或旧缓存名称");
assert.equal(game.infoDetailModal.selectedSlotId.length > 0, true, "详情 CTA should bind the selected friend slot");
const slot = game.infoDetailModal.selectedSlotId;
assert.equal(game.state.world.reserve.friendContract.slots.some((item) => item.id === slot && !item.started), true, "详情 CTA should wait for confirmation before starting");
assert.equal(game.infoDetailModal.items.length, 1, "发起合同页只展示合同内容");
assert.equal(game.infoDetailModal.items[0].tag, "合同内容", "发起合同页应展示合同内容");
assert.equal(game.infoDetailModal.choices.length, 1, "发起合同页只保留一个确认按钮");
assert.equal(game.infoDetailModal.choices[0].label, "确定", "发起合同页确认按钮文案应为确定");
game.infoDetailModal.choices[0].action();
assert.equal(game.state.world.reserve.friendContract.slots.some((item) => item.id === slot && item.started), true, "确认后才开始选中的合同");

const fullSlotGame = new Game();
fullSlotGame.stopLoop();
fullSlotGame.render = () => {};
fullSlotGame.state = createCharacter(null, "好友合同满槽入口测试");
fullSlotGame.cloudService = {
  friendRows: Array.from({ length: 5 }, (_, index) => ({
    id: `friend_${index + 1}`,
    owner: `好友${index + 1}`,
    simulated: false
  }))
};
fullSlotGame.wechatFriends = { friendRows: [] };
let pickerOpened = false;
fullSlotGame.openFriendContractFriendPicker = () => {
  pickerOpened = true;
  return true;
};
// Five started contracts, rather than five merely visible friends, consume
// the simultaneous contract limit. Unstarted friend rows may be replaced by
// the profile the player explicitly selected.
const fullFriends = fullSlotGame.cloudService.friendRows;
const fullReserve = fullSlotGame.state.world.reserve;
const fullStatus = friendContractStatus(fullReserve, fullFriends, Date.now());
fullStatus.slots.forEach((item) => startFriendContract(fullReserve, fullFriends, Date.now(), item.id));
assert.equal(
  fullSlotGame.openFriendContractForLeaguePlayer({
    id: "friend_6",
    name: "好友6的自然",
    owner: "好友6",
    friend: true
  }),
  false,
  "已选好友无法加入满槽时应停留在当前入口"
);
assert.equal(pickerOpened, false, "已选好友失败时不能退回通用好友选择器");

const primaryHitGame = Object.create(Game.prototype);
primaryHitGame.hitAreas = [
  { x: 0, y: 0, w: 80, h: 40, modalAction: true, onTap() {} },
  { x: 0, y: 0, w: 80, h: 40, friendContractPrimary: true, onTap() {} }
];
primaryHitGame.modalHitFloorIndex = () => 0;
primaryHitGame.ensureArcheryConfirmationExclusive = () => {};
primaryHitGame.waitingArcheryOrDiceConfirm = () => false;
const primaryHit = primaryHitGame.hitAreaAt(40, 20);
assert.equal(primaryHit.friendContractPrimary, true, "好友合同主按钮必须优先于弹窗底层命中区");

console.log("friend contract button regression check ok");
