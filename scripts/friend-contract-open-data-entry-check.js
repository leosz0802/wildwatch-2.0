const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { friendMatchKey } = require("../open-data/worldIdentity");
const { Game } = require("../js/game");

const messages = [];
const drawnText = [];
const callbacks = [];
let onMessage;
const gradient = { addColorStop() {} };
const context = new Proxy({}, {
  get(target, key) {
    if (key === "measureText") return value => ({ width: String(value || "").length * 5 });
    if (key === "fillText") return value => drawnText.push(String(value));
    if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
    return target[key] || (() => {});
  }
});
const canvas = { width: 320, height: 320, getContext: () => context };
const user = {
  nickname: "Nicole.英",
  openid: "friend-open-id",
  KVDataList: [{
    key: "wild_guardian_rank_v1",
    value: JSON.stringify({
      name: "自然保护区",
      valuation: 15392,
      level: 4,
      animals: 624,
      friendMatchKey: friendMatchKey("friend-open-id")
    })
  }]
};

vm.runInNewContext(fs.readFileSync(require.resolve("../open-data/index"), "utf8"), {
  require: name => name === "./worldIdentity" ? require("../open-data/worldIdentity") : null,
  wx: {
    getSharedCanvas: () => canvas,
    onMessage: callback => { onMessage = callback; },
    postMessage: message => messages.push(message),
    getFriendCloudStorage: options => callbacks.push(options),
    createImage: () => ({})
  },
  module: { exports: {} }
});

onMessage({ type: "friend_rank_show", width: 320, height: 320 });
callbacks.pop().success({ data: [user] });
onMessage({ type: "friend_rank_pointer", phase: "start", x: 160, y: 60 });
onMessage({ type: "friend_rank_pointer", phase: "end", x: 160, y: 60 });
onMessage({ type: "friend_rank_pointer", phase: "start", x: 160, y: 280 });
onMessage({ type: "friend_rank_pointer", phase: "end", x: 160, y: 280 });

assert(drawnText.includes("发起好友合同"), "好友详情应显示发起好友合同按钮");
assert.equal(messages.length, 0, "开放数据域不应直接向主域发送合同消息");
drawnText.length = 0;
onMessage({
  type: "friend_nickname_sheet",
  width: 160,
  height: 28,
  rowHeight: 28,
  rowsJson: JSON.stringify([{ worldPlayerId: "", friendMatchKey: friendMatchKey("friend-open-id"), fallback: "溪望·7ABE", w: 140 }])
});
assert(drawnText.includes("Nicole.英"), "合同记录应使用微信昵称，而不是服务器代号");
drawnText.length = 0;
onMessage({
  type: "friend_nickname_sheet",
  width: 196,
  height: 30,
  rowHeight: 30,
  rowsJson: JSON.stringify([{
    worldPlayerId: "",
    friendMatchKey: friendMatchKey("friend-open-id"),
    fallback: "微信好友",
    w: 160,
    avatarSize: 30
  }])
});
assert(drawnText.includes("Nicole.英"), "世界榜昵称层仍应写出微信昵称");
assert(drawnText.includes("N"), "世界榜昵称层应同时画上已取到的好友头像");

const game = Object.create(Game.prototype);
let selectedPlayer = null;
let cancelled = false;
game.renderedWechatFriendRank = {
  rankReady: true,
  view: { w: 320, h: 320 },
  openDataView: "detail",
  openDataSelectedIndex: 0,
  openDataRows: [{ id: "cloud_friend", owner: "Nicole.英", name: "Nicole.英的自然" }]
};
game.wechatFriends = { pointer: phase => { if (phase === "cancel") cancelled = true; } };
game.openFriendContractForLeaguePlayer = player => { selectedPlayer = player; };
assert.equal(game.handleFriendRankOpenDataTap(160, 280), true, "主域应接管详情页合同按钮");
assert.equal(cancelled, true, "主域接管合同按钮前应清理开放数据手势");
assert.equal(selectedPlayer.id, "cloud_friend");

const hitAreas = [];
const renderedGame = Object.create(Game.prototype);
renderedGame.height = 640;
renderedGame.width = 360;
renderedGame.scrollY = 0;
renderedGame.navHeight = () => 64;
renderedGame.friendRankViewportHeight = () => 320;
renderedGame.wechatFriends = {
  status: "ready",
  isSupported: () => true,
  draw() {},
  subscriptionStatus: "unknown"
};
renderedGame.cloudService = { friendRows: [] };
renderedGame.state = { character: {}, world: { reserve: {} } };
renderedGame.renderedWechatFriendRank = {
  rankReady: true,
  view: { w: 300, h: 320 },
  openDataView: "detail",
  openDataSelectedIndex: 0,
  openDataRows: [{ id: "cloud_friend", owner: "Nicole.英", name: "Nicole.英的自然" }]
};
renderedGame.friendRankOpenDataRows = () => (
  renderedGame.friendRankOpenDataState || renderedGame.renderedWechatFriendRank
).openDataRows;
renderedGame.panel = () => {};
renderedGame.text = () => {};
renderedGame.statusPill = () => {};
renderedGame.button = () => {};
renderedGame.addHit = (x, y, w, h, onTap, sound, scope, options) => hitAreas.push({ x, y, w, h, onTap, sound, scope, options });
renderedGame.openFriendContractForLeaguePlayer = player => { selectedPlayer = player; };
Game.prototype.drawWechatFriendRankCard.call(renderedGame, {}, 18, 120, 324);
const contractHit = hitAreas.find(hit => hit.options && hit.options.friendRankContract);
assert(contractHit, "主画布应注册好友详情合同按钮命中区");
contractHit.onTap();
assert.equal(selectedPlayer.id, "cloud_friend", "主画布命中区应进入当前好友合同流程");
renderedGame.renderedWechatFriendRank = null;
hitAreas.length = 0;
Game.prototype.drawWechatFriendRankCard.call(renderedGame, {}, 18, 120, 324);
assert(
  hitAreas.some(hit => hit.options && hit.options.friendRankContract),
  "重绘后仍应保留开放数据详情页的合同按钮命中区"
);

const synced = [];
const toasts = [];
const emptyRankGame = Object.create(Game.prototype);
emptyRankGame.toast = message => toasts.push(message);
emptyRankGame.render = () => {};
emptyRankGame.navigateToFriendList = () => { throw new Error("不应离开当前好友详情"); };
emptyRankGame.openFriendContractForLeaguePlayer = player => { synced.push(player); };
emptyRankGame.renderedWechatFriendRank = {
  rankReady: true,
  view: { w: 320, h: 360 },
  openDataView: "list",
  openDataSelectedIndex: -1,
  openDataRows: [],
  openDataScrollY: 0
};
assert.equal(emptyRankGame.handleFriendRankOpenDataTap(40, 140), false, "点开第3行应继续交给开放数据域");
assert.equal(emptyRankGame.renderedWechatFriendRank.openDataView, "detail");
assert.equal(emptyRankGame.renderedWechatFriendRank.openDataSelectedIndex, 2, "主域好友列表为空时也要记下点开的第3行");
emptyRankGame.cloudService = {
  refreshRelationFriends: () => Promise.resolve([
    { id: "cloud_low", valuation: 100, owner: "低市值" },
    { id: "cloud_liu", valuation: 12204, owner: "刘亦肥" },
    { id: "cloud_mid", valuation: 4000, owner: "中市值" }
  ])
};
emptyRankGame.renderedWechatFriendRank.openDataRows = [];
assert.equal(emptyRankGame.openFriendContractFromRankSelection(emptyRankGame.renderedWechatFriendRank), true);
Promise.resolve().then(() => {
  assert.equal(synced.length, 1, "刷新后应按点开的名次发起合同");
  assert.equal(synced[0].id, "cloud_low", "第3名应是市值排序后的第三位，不能改成第一位");
  assert.equal(toasts.includes("好友资料尚未同步，请刷新好友列表后再发起合同"), false);
  console.log("friend contract open-data entry check ok");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
