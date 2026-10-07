const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

const game = Object.create(Game.prototype);
game.state = createCharacter(null, "保护区卫士");
game.leagueScope = "world";
game.render = () => {};
game.raidChance = () => 42;
game.cloudService = {
  feature: () => true,
  friendRows: [{
    id: "cloud_friend_1",
    name: "好友昵称的河湾哨站",
    owner: "好友昵称",
    reserveName: "河湾哨站",
    valuation: 8767,
    level: 2,
    animals: 323,
    shield: 48,
    profileComplete: true,
    friendMatchKey: "ab".repeat(32)
  }]
};

const worldRow = {
  id: "cloud_friend_1",
  worldPlayerId: "friend_1",
  friendMatchKey: "ab".repeat(32),
  name: "旧世界榜名称",
  owner: "旧名称",
  reserveName: "旧哨站",
  valuation: 8767,
  rank: 22,
  level: 2,
  animals: 323,
  shield: 48,
  profileComplete: true,
  friend: true,
  scope: "world"
};

game.openLeaguePlayerDetail(worldRow, 22);
const modal = game.infoDetailModal;
if (!modal || !modal.friendProfile || modal.title !== "好友昵称的河湾哨站") {
  throw new Error("world linked friend should resolve the same identity as the friend ranking");
}
if (modal.items.map((item) => item.tag).join(",") !== "市值,等级,动物") {
  throw new Error("world linked friend detail must expose the same three metrics as friend detail");
}
if (modal.friendProfileMetrics.map((item) => item.label).join(",") !== "市值,等级,动物"
  || modal.friendProfileMetrics[0].value !== 8767
  || modal.friendProfileMetrics[1].value !== "等级2"
  || modal.friendProfileMetrics[2].value !== "323只") {
  throw new Error("linked friend metrics should use the friend source values");
}
if (modal.worldRank !== 22 || modal.friendRank < 1 || !/微信好友保护区市值榜/.test(modal.kicker)) {
  throw new Error("linked friend detail should retain both world rank and friend rank context");
}
if (!modal.canStartWorldHoundPatrol || !modal.canStartFriendContract) {
  throw new Error("world linked friend detail must expose both hound patrol and friend contract");
}

game.openLeaguePlayerDetail(Object.assign({}, worldRow, { profileComplete: false, animals: 0, shield: 0 }), 22);
if (!game.infoDetailModal.canStartWorldHoundPatrol) {
  throw new Error("incomplete world friend profiles must still expose hound patrol");
}

game.drawPremiumParchmentPanel = () => {};
game.roundRect = () => {};
game.text = () => {};
game.fitTextSize = (_ctx, value) => Math.min(15, String(value || "").length ? 15 : 10);
game.truncateTextToWidth = (_ctx, value) => String(value || "");
game.drawLinkedFriendProfileContent({}, modal, 0, 0, 375, 300);
if (!modal.renderedInfoItems || modal.renderedInfoItems.length !== 3
  || modal.renderedInfoItems.map((item) => item.item.label).join(",") !== "市值,等级,动物") {
  throw new Error("linked friend profile renderer should keep the three metric cards visible");
}

const worldOnly = Object.create(Game.prototype);
worldOnly.state = createCharacter(null, "世界榜普通用户").world;
worldOnly.leagueScope = "world";
worldOnly.render = () => {};
worldOnly.cloudService = { friendRows: [], feature: () => true };
worldOnly.raidChance = () => 38;
worldOnly.openLeaguePlayerDetail({
  id: "world_only_17",
  name: "远方玩家的湿地保护区",
  owner: "远方玩家",
  reserveName: "湿地保护区",
  valuation: 12688,
  level: 3,
  animals: 511,
  shield: 66,
  profileComplete: true,
  rank: 17,
  scope: "world",
  mine: false
}, 17);
const worldOnlyModal = worldOnly.infoDetailModal;
if (!worldOnlyModal || !worldOnlyModal.friendProfile
  || worldOnlyModal.items.map((item) => item.tag).join(",") !== "市值,等级,动物"
  || worldOnlyModal.worldRank !== 17) {
  throw new Error("world-only detail should use the same three-metric friend profile card");
}
if (!worldOnlyModal.canStartWorldHoundPatrol) {
  throw new Error("world-only detail must still expose hound patrol");
}

console.log("world friend detail consistency check ok");
