const assert = require("node:assert/strict");
const { mergeDailyLogins, chinaDay, resolveStoryChapters } = require("../server/wild-analytics/server.js");

const today = chinaDay(0);
const yesterday = chinaDay(1);

function player(id, nickname, fund, animals, days = [today]) {
  return { id, nickname, chapter: 1, fund, animalTotal: animals, days: new Set(days) };
}

function client(nickname, fund, animals, screen = "home") {
  return { nickname, chapter: 1, fund, screen, animalTotal: animals, water: 11, grass: null, safety: null, disease: null };
}

const servers = new Map();
for (let index = 0; index < 23; index += 1) {
  const fund = index < 4 ? 1000 : 1200 + index;
  const animals = index < 4 ? 81 : 90 + index;
  servers.set(`server-${index}`, player(`server-${index}`, `哨站${index}`, fund, animals));
}
const clients = [
  client("未命名", 6135, 903, "survival"),
  client("未命名", 1006, 82, "home"),
  client("未命名", 913, 108, "home"),
  client("未命名", 0, 87, "home"),
  client("未命名", 283, 154, "survival"),
  client("未命名", 2344, 1243, "home"),
  client("白石·9094的河湾哨站", 1750, 200, "home"),
  client("河声·9485的杉谷哨站", 1000, 81, "choose"),
  client("未命名", 1000, 81, "home")
];
const summary = mergeDailyLogins({
  users: 31,
  daily: [{ day: today, users: 31 }],
  dailyLogins: [{ day: today, users: clients }]
}, servers);
const todayUsers = summary.dailyLogins.find((day) => day.day === today).users;

assert.equal(todayUsers.length, 23);
assert.equal(todayUsers.filter((user) => user.nickname === "未命名").length, 0);
assert.equal(todayUsers.some((user) => user.nickname === "白石·9094的河湾哨站"), false);
assert.equal(todayUsers.some((user) => user.nickname === "河声·9485的杉谷哨站"), false);
const enriched = todayUsers.find((user) => user.nickname === "哨站0");
assert.equal(enriched.fund, 1000);
assert.equal(enriched.animalTotal, 81);
assert.equal(enriched.screen, "home");
assert.equal(enriched.water, 11);
assert.equal(todayUsers.filter((user) => user.fund === 1000 && user.animalTotal === 81).length, 4);

const named = new Map([["bai", player("bai", "白石·9094的河湾哨站", 2200, 40)]]);
const namedSummary = mergeDailyLogins({
  users: 1,
  daily: [],
  dailyLogins: [{ day: today, users: [client("白石·9094的河湾哨站", 1750, 200, "choose")] }]
}, named);
const namedRow = namedSummary.dailyLogins.find((day) => day.day === today).users;
assert.equal(namedRow.length, 1);
assert.equal(namedRow[0].fund, 2200);
assert.equal(namedRow[0].screen, "choose");

const clientOnly = mergeDailyLogins({
  users: 2,
  daily: [],
  dailyLogins: [{ day: yesterday, users: [client("未命名", 10, 1), client("未命名", 20, 2)] }]
}, new Map());
const yesterdayUsers = clientOnly.dailyLogins.find((day) => day.day === yesterday).users;
assert.equal(yesterdayUsers.length, 2);

const progressed = resolveStoryChapters([
  { pid: "player", chapter: 1, at: 10 },
  { pid: "player", chapter: 5, at: 20 }
], []);
assert.equal(progressed.get("player"), 5);

const leftEarlierChapter = resolveStoryChapters([
  { pid: "player", chapter: 6, at: 10 },
  { pid: "player", chapter: 4, at: 30 }
], [
  { pid: "player", chapter: 4, at: 40 }
]);
assert.equal(leftEarlierChapter.get("player"), 4);

const leaveWins = resolveStoryChapters([
  { pid: "player", chapter: 2, at: 10 },
  { pid: "player", chapter: 7, at: 50 }
], [
  { pid: "player", chapter: 5, at: 40 }
]);
assert.equal(leaveWins.get("player"), 5);

console.log("daily-login-dedup-check passed");
