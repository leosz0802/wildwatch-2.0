const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function makeGame() {
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, "保护区卫士");
  game.state.world.day = 12;
  game.state.world.reserve.guardianCycle = { day: 12 };
  game.state.world.reserve.social = {};
  game.cloudService = { friendRows: [] };
  game.wechatFriends = { friendRows: [] };
  game.render = () => {};
  game.toast = () => {};
  return game;
}

const noFriend = makeGame();
assert.equal(noFriend.ensureDailyFriendLetters(), false, "没有好友时不应触发每日通信");
assert.equal(noFriend.allIncomingLetters().filter((letter) => /friend/.test(letter.sourceKind || "")).length, 0);

const game = makeGame();
game.cloudService.friendRows = [{
  id: "friend_1",
  owner: "林岚",
  reserveName: "雾谷保护区",
  animals: 31,
  valuation: 1260,
  scope: "friends",
  simulated: false
}];
assert.equal(game.ensureDailyFriendLetters(), true, "有好友时当天应生成通信");
assert.equal(game.ensureDailyFriendLetters(), false, "同一天重复检查不能重复生成");
let friendLetters = game.allIncomingLetters().filter((letter) => /friend/.test(letter.sourceKind || ""));
assert.equal(friendLetters.length, 2, "每天应有一封发给好友和一封好友来信");
assert(friendLetters.some((letter) => letter.sourceKind === "friendSent" && letter.sourceLabel === "给好友的信"));
assert(friendLetters.some((letter) => letter.sourceKind === "friendReceived" && !letter.readAt));

const inbox = game.buildVisitorLetterInbox();
assert.equal(inbox.letters.filter((letter) => /friend/.test(letter.sourceKind || "")).length, 2);
const received = inbox.letters.find((letter) => letter.sourceKind === "friendReceived");
assert(game.openVisitorLetterReader(received), "好友来信应能打开");
assert(game.infoDetailModal.meta === "好友保护区来信");
assert(game.state.world.reserve.social.friendLetters.received[0].readAt > 0, "好友来信打开后应标记已读");

game.state.world.day = 13;
game.state.world.reserve.guardianCycle.day = 13;
assert.equal(game.ensureDailyFriendLetters(), true, "跨日后应生成新通信");
friendLetters = game.allIncomingLetters().filter((letter) => /friend/.test(letter.sourceKind || ""));
assert.equal(friendLetters.length, 4, "两天应各生成一组通信");

const rows = Array.from({ length: 10 }, (_, index) => ({
  id: `world_${index}`,
  name: `保护区${index}`,
  rank: index + 1,
  animals: 20,
  valuation: 2000 - index
}));
game.state.world.reserve.progression.activeSeconds = 180;
game.updateWorldLeaderboardBroadcast(rows);
rows[9].animals += 1;
game.updateWorldLeaderboardBroadcast(rows);
rows[9].animals += 1;
game.updateWorldLeaderboardBroadcast(rows);
rows[9].animals += 1;
game.updateWorldLeaderboardBroadcast(rows);
const day13WorldLetters = game.state.world.reserve.league.broadcasts.filter((letter) => letter.day === 13);
assert(day13WorldLetters.length <= 2, "世界榜每天最多两封信");

console.log("friend letter check ok");
