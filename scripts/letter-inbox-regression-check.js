const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter, saveState, loadState } = require("../js/storage");

const storage = new Map();
global.wx = {
  getStorageSync: (key) => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value)))
};
function makeGame() {
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, "收件箱回归");
  game.render = () => {};
  game.ensureDailyReserveReport = () => {};
  game.ensureDailyFriendLetters = () => {};
  return game;
}
const game = makeGame();
game.state.world.reserve.development.operations.letters = Array.from({ length: 59 }, (_, index) => ({
  id: `visitor_${index}`, day: index + 1, title: "游客来信", body: `参访记录 ${index}`,
  readAt: index < 20 ? 0 : 100
}));
game.state.world.reserve.league.broadcasts = [{
  id: "world_new", day: 20, title: "世界保护区来信", body: "水源恢复了。", createdAt: 200, readAt: 0
}];
let letters = game.allIncomingLetters();
assert.equal(letters.length, 50, "统一收件箱最多显示50封");
assert.equal(letters.filter(letter => !letter.readAt).length, 11, "只统计最近50封里的未读信");
assert(letters.slice(0, 11).every(letter => !letter.readAt), "未读信必须在已读历史之前");
assert.equal(letters[0].id, "world_new", "同一天按创建时间倒序");
assert.equal(letters[1].id, "visitor_19", "未读信按日期倒序");
assert.equal(letters[11].id, "visitor_58", "已读历史按日期倒序");
const parent = game.buildReserveLetterInbox();
parent.letterScrollY = 76;
game.openVisitorLetterReader(letters[0], parent);
assert.equal(game.infoDetailModal.prose, "水源恢复了。");
const readAt = game.state.world.reserve.league.broadcasts[0].readAt;
assert(readAt > 0);
game.dismissInfoDetailModal();
assert.equal(game.infoDetailModal.letters.filter(letter => !letter.readAt).length, 10, "返回后刷新未读数");
assert.equal(game.infoDetailModal.letters[0].id, "visitor_19", "返回后刷新排序");
assert.equal(game.infoDetailModal.letterScrollY, 76, "返回后保留滚动位置");
game.openVisitorLetterReader(letters[0], game.infoDetailModal);
assert.equal(game.state.world.reserve.league.broadcasts[0].readAt, readAt, "重复阅读不更改已读时间");

const history = makeGame();
history.state.world.reserve.development.operations.letters = Array.from({ length: 50 }, (_, index) => ({
  id: `history_${index}`, day: index + 1, title: "历史来信", body: `记录 ${index}`, readAt: 100
}));
saveState(history.state);
history.state = loadState();
assert.equal(history.allIncomingLetters().length, 50, "重新登录必须保留50封历史，不能被旧30封上限截断");

const mixed = makeGame();
mixed.state.world.reserve.development.operations.letters = [{ id: "v", day: 2, title: "游客信", body: "游客记录", readAt: 0 }];
mixed.state.world.reserve.league.broadcasts = [{ id: "w", day: 2, title: "世界榜信", body: "榜单记录", readAt: 0 }];
mixed.state.world.lifeMemory.animalLetters = [
  { id: "a_old", day: 2, dateKey: "2026-09-11", createdAt: 100, species: "鹿", animalName: "晨角", paragraphs: ["较早的心声"], readAt: 0 },
  { id: "a_new", day: 2, dateKey: "2026-09-11", createdAt: 200, species: "鹿", animalName: "晨角", paragraphs: ["较新的心声"], readAt: 0 }
];
letters = mixed.allIncomingLetters();
assert.deepEqual(letters.slice(0, 2).map(letter => letter.id), ["a_new", "a_old"], "动物信预排序后不能再被反转");
assert.deepEqual([...new Set(letters.map(letter => letter.sourceKind))].sort(), ["animal", "leaderboard", "visitor"]);
for (const letter of letters) {
  const inbox = mixed.buildReserveLetterInbox();
  mixed.openVisitorLetterReader(letter, inbox);
  mixed.dismissInfoDetailModal();
}
saveState(mixed.state);
mixed.state = loadState();
assert.equal(mixed.allIncomingLetters().length, 4);
assert(mixed.allIncomingLetters().every(letter => letter.readAt > 0), "三类来信已读状态必须经过真实存档加载仍然保留");
console.log("letter inbox regression ok (ordering, 50-letter retention, back navigation, source readers, save/reload)");
