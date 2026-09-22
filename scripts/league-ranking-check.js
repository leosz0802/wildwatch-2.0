const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { top10Snapshot, compareTop10, formatTop10Broadcast, formatTop10List } = require("../js/worldLeaderboardBroadcast");
const { animalSourceSummary } = require("../js/animalSourceLedger");
const { chapterVisitorTotal } = require("../js/chapterTargets");

const game = Object.create(Game.prototype);
game.state = createCharacter(null, "保护区卫士");
game.state.world.reserve.progression.totalActions = 2;
game.leagueScope = "friends";
game.selectedRivalId = null;
game.toast = () => {};
game.render = () => {};

const friendRows = game.leagueRows("friends");
const worldRows = game.leagueRows("world");

if (!friendRows.find((row) => row.mine) || !worldRows.find((row) => row.mine)) {
  throw new Error("friend/world rankings should include my reserve");
}
if (friendRows.length !== 1 || game.hasFriendLeagueMembers() || game.leagueRankOfMine("friends") !== 0) {
  throw new Error("an empty friend ranking should contain only my reserve and wait for a real friend");
}
if (worldRows.length !== 1) {
  throw new Error("world ranking should show only my reserve until real server players arrive");
}
if (game.leagueOpponents("world").length !== 0) {
  throw new Error("world ranking must never fill empty seats with simulated guardians");
}

function assertSorted(rows, label) {
  rows.reduce((prev, row) => {
    const value = game.leagueRowValue(row);
    if (value > prev) throw new Error(`${label} ranking is not sorted by reserve valuation`);
    return value;
  }, Number.POSITIVE_INFINITY);
}

assertSorted(friendRows, "friend");
assertSorted(worldRows, "world");

const friendRank = game.leagueRankOfMine("friends");
const worldRank = game.leagueRankOfMine("world");
if (friendRank !== 0 || worldRank < 1) {
  throw new Error("an empty friend ranking should invite sharing rather than presenting a fake rank");
}

let shareCount = 0;
let screenCount = 0;
game.shareFriendLeagueInvite = () => { shareCount += 1; };
let lastScreen = "";
game.setScreen = (screen) => { screenCount += 1; lastScreen = screen; };
game.openReserveNetwork();
if (shareCount !== 0 || screenCount !== 1 || lastScreen !== "league" || game.leagueScope !== "friends") {
  throw new Error("opening the ranking without a scope should default to the friend page");
}

game.leagueScope = "world";
game.activateGuardianBeat("collectionInvestigation");
if (screenCount !== 2 || lastScreen !== "survival" || !game.survivalArchiveOpen || game.leagueScope !== "world") {
  throw new Error("collection investigation should enter the Survival archive without mutating the leaderboard scope");
}

game.openReserveNetwork("world");
if (screenCount !== 3 || lastScreen !== "league" || game.leagueScope !== "world") {
  throw new Error("the world ranking should remain available through an explicit world action");
}

const chapterEntry = game.buildChapterProgressDetail();
if (chapterEntry.actionLabel !== "查看游客等级") {
  throw new Error("the chapter detail should describe its tourism destination");
}
chapterEntry.action();
if (screenCount !== 3 || game.leagueScope !== "world" || !game.infoDetailModal) {
  throw new Error("chapter tourism detail should open without changing the leaderboard scope");
}

let chapterToast = "";
game.toast = (message) => { chapterToast = String(message || ""); };
game.state.ui = {};
game.infoDetailModal = null;
const chapterProgressLevel = Math.max(1, Math.round(game.reserveProgression(game.state.world.reserve).stage || 1));
if (!game.openChapterProgressDetail()) {
  throw new Error("the chapter progress detail should open once for the current chapter");
}
if (!game.infoDetailModal || game.state.ui.chapterProgressSeenLevel !== chapterProgressLevel) {
  throw new Error("the chapter progress detail should persist the chapter level it has shown");
}
game.infoDetailModal = null;
if (game.openChapterProgressDetail() !== false || !/看过/.test(chapterToast)) {
  throw new Error("the chapter progress detail should stay quiet after the same chapter has been viewed");
}
game.state.world.reserve.progression.stage = chapterProgressLevel + 1;
chapterToast = "";
if (!game.openChapterProgressDetail() || !game.infoDetailModal || game.state.ui.chapterProgressSeenLevel !== chapterProgressLevel + 1) {
  throw new Error("a new chapter should reopen the progress detail exactly once");
}

game.leagueScope = "world";
game.ensureSelectedRivalForScope("world");
if (game.selectedRival() || game.selectedRivalId) {
  throw new Error("an empty real-player world ranking should not invent a selectable target");
}
game.cloudService = {
  feature(name) { return name === "worldLeaderboard" || name === "socialTrade"; },
  myRank: 4,
  friendRows: [{ id: "cloud_legacy_friend", name: "好友昵称的河湾哨站", valuation: 8538, level: 1, animals: 65, registered: true }],
  rows: [{
    id: "cloud_real_world_1",
    name: "leo.liu的苔原哨站",
    owner: "leo.liu",
    reserveName: "苔原哨站",
    valuation: 8538,
    rating: 8538,
    rank: 3,
    shield: 37,
    animals: 65,
    style: "真实经营",
    scope: "world",
    simulated: false,
    source: "cloud",
    updatedAt: Date.now()
  }]
};
const matchedWorldFriend = game.leagueOpponents("world").find((row) => row.friend);
if (matchedWorldFriend) throw new Error("equal score, level and animal count must not identify a different account as a friend");
game.cloudService.friendRows[0].id = "cloud_real_world_1";
if (!game.leagueOpponents("world")[0].friend) throw new Error("stable account id must identify linked friends");
const pureBefore = top10Snapshot([{ id: "a", name: "甲保护区", rank: 1, animals: 20, valuation: 900 }, { id: "b", name: "乙保护区", rank: 2, animals: 8, valuation: 800 }]);
const pureAfter = top10Snapshot([{ id: "b", name: "乙保护区", rank: 1, animals: 11, valuation: 920 }, { id: "c", name: "丙保护区", rank: 2, animals: 4, valuation: 810 }]);
const pureDiff = compareTop10(pureBefore, pureAfter);
if (!pureDiff.changed || pureDiff.entered[0].name !== "丙保护区" || pureDiff.exited[0].name !== "甲保护区" || pureDiff.animalChanges[0].delta !== 3 || !/进榜/.test(formatTop10Broadcast(pureDiff))) {
  throw new Error("Top 10 diff should report entrants, exits and integer animal changes");
}
if (!/^#1 乙保护区 · 动物11只 · 市值920/.test(formatTop10List(pureAfter)) || formatTop10List(pureAfter).split("\n").length !== 2) {
  throw new Error("Top 10 letters should list the latest ranking instead of a change log");
}
let broadcastToast = "";
game.toast = (message) => { broadcastToast = String(message || ""); };
game.state.reports = [];
const seededBroadcast = game.updateWorldLeaderboardBroadcast();
if (seededBroadcast || !game.state.world.reserve.league.top10Snapshot) {
  throw new Error("the first Top 10 sync should seed a silent snapshot");
}
game.state.world.reserve.league.top10Snapshot.push({ id: "old_world", name: "旧榜保护区", rank: 2, animals: 12, valuation: 8000 });
game.cloudService.rows = [
  { id: "cloud_real_world_2", name: "nova的雨林哨站", owner: "nova", reserveName: "雨林哨站", valuation: 9800, rating: 9800, rank: 1, shield: 55, animals: 77, scope: "world", simulated: false, source: "cloud" },
  { id: "cloud_real_world_1", name: "leo.liu的苔原哨站", owner: "leo.liu", reserveName: "苔原哨站", valuation: 8538, rating: 8538, rank: 2, shield: 37, animals: 68, scope: "world", simulated: false, source: "cloud" }
];
game.state.world.reserve.progression = Object.assign({}, game.state.world.reserve.progression, { activeSeconds: 180 });
const changedBroadcast = game.updateWorldLeaderboardBroadcast();
if (!changedBroadcast || !/#1 nova的雨林哨站/.test(changedBroadcast.body) || !/#2 leo.liu的苔原哨站/.test(changedBroadcast.body) || !/动物77只/.test(changedBroadcast.body) || !/市值9800/.test(changedBroadcast.body) || /进榜|出榜/.test(changedBroadcast.body) || broadcastToast) {
  throw new Error("a changed Top 10 should create one readable broadcast of the latest ranking without an on-screen toast");
}
if (changedBroadcast.id !== `world_top10_${game.state.world.day}` || changedBroadcast.title !== "世界榜 Top 10" || changedBroadcast.openTarget !== "world") {
  throw new Error("the daily Top 10 letter should keep a stable id and open the world ranking");
}
if (changedBroadcast.sourceKind !== "leaderboard" || changedBroadcast.sourceLabel !== "世界榜播报" || changedBroadcast.readAt) {
  throw new Error("a changed Top 10 should be persisted as an unread protection-area letter");
}
const leaderboardInbox = game.buildReserveLetterInbox();
const leaderboardLetter = leaderboardInbox.letters.find((letter) => letter.id === changedBroadcast.id);
if (!leaderboardLetter || leaderboardLetter.sourceKind !== "leaderboard" || leaderboardLetter.body !== changedBroadcast.body || !/保护区来信 · 未读 [1-9]\d*$/.test(leaderboardInbox.kicker)) {
  throw new Error("the Top 10 broadcast should appear in the protection-area inbox with unread state");
}
const chipGame = Object.create(Game.prototype);
chipGame.state = game.state;
chipGame.drawUiIcon = () => true;
chipGame.drawSmallGlyph = () => {};
chipGame.roundRect = () => {};
chipGame.text = () => {};
chipGame.addMapRectHit = (_x, _y, _w, _h, action) => { chipGame.lastChipAction = action; };
chipGame.animT = () => 0;
chipGame.displayReserveNumber = (_kind, value) => value;
chipGame.numberAnimationPulse = () => 0;
chipGame.mapSignalSnapshot = { signature: "0|0|0|0", count: 0, letters: 0, unread: 0, at: 0 };
chipGame.drawMapVisitorCountChip({}, { x: 0, y: 0, w: 300, h: 500 }, [], 1);
if (chipGame.renderedMapVisitorCountChip.mode !== "reserveLetters" || !chipGame.renderedMapVisitorCountChip.unreadLeaderboard || !chipGame.lastChipAction) {
  throw new Error("an unread Top 10 broadcast should keep the map inbox entry visible until opened");
}
game.setScreen = Game.prototype.setScreen;
if (!game.openVisitorLetterReader(leaderboardLetter) || game.screen !== "league" || game.leagueScope !== "world" || game.infoDetailModal) {
  throw new Error("the Top 10 inbox item should open the world leaderboard");
}
game.setScreen = (screen) => { screenCount += 1; lastScreen = screen; };
if (!game.state.world.reserve.league.broadcasts.find((letter) => letter.id === changedBroadcast.id).readAt) {
  throw new Error("opening a Top 10 inbox item should mark it read");
}
const duplicateBroadcast = game.updateWorldLeaderboardBroadcast();
if (duplicateBroadcast || game.state.world.reserve.league.broadcasts.length !== 1) {
  throw new Error("re-rendering the same Top 10 must not duplicate the broadcast");
}
game.cloudService.rows = [
  { id: "cloud_real_world_2", name: "nova的雨林哨站", owner: "nova", reserveName: "雨林哨站", valuation: 9900, rating: 9900, rank: 1, shield: 55, animals: 80, scope: "world", simulated: false, source: "cloud" },
  { id: "cloud_real_world_1", name: "leo.liu的苔原哨站", owner: "leo.liu", reserveName: "苔原哨站", valuation: 8538, rating: 8538, rank: 2, shield: 37, animals: 68, scope: "world", simulated: false, source: "cloud" }
];
const replacedBroadcast = game.updateWorldLeaderboardBroadcast();
if (!replacedBroadcast || replacedBroadcast.id !== changedBroadcast.id || game.state.world.reserve.league.broadcasts.length !== 1) {
  throw new Error("a later same-day Top 10 change must replace the existing letter");
}
if (!/#1 nova的雨林哨站/.test(replacedBroadcast.body) || !/动物80只/.test(replacedBroadcast.body) || !/市值9900/.test(replacedBroadcast.body) || replacedBroadcast.readAt) {
  throw new Error("the replaced daily letter should show the latest Top 10 and become unread again");
}
game.cloudService.rows = [{
  id: "cloud_real_world_1",
  name: "leo.liu的苔原哨站",
  owner: "leo.liu",
  reserveName: "苔原哨站",
  valuation: 8538,
  rating: 8538,
  rank: 3,
  shield: 37,
  animals: 65,
  style: "真实经营",
  scope: "world",
  simulated: false,
  source: "cloud",
  updatedAt: Date.now()
}];
game.ensureSelectedRivalForScope("world");
const worldTarget = game.selectedRival();
if (!worldTarget || worldTarget.mine || worldTarget.scope !== "world") {
  throw new Error("world ranking should select the first real server player");
}
if (!worldTarget.friend) {
  throw new Error("an exact linked account must stay marked in the world list");
}
// The fixture below tests the separately persisted friend-rival flow.
// Clear this one-off relationship-match fixture before entering that flow.
game.cloudService.friendRows = [];
game.cloudService.feature = (name) => name === "worldLeaderboard";
const worldRowCalls = [];
const worldRowGame = Object.create(Game.prototype);
worldRowGame.leagueScope = "world";
worldRowGame.selectedRivalId = null;
worldRowGame.scrollY = 0;
worldRowGame.roundRect = (...args) => worldRowCalls.push(["roundRect", ...args]);
worldRowGame.text = (...args) => worldRowCalls.push(["text", ...args]);
worldRowGame.addHit = () => {};
worldRowGame.drawLeaguePlayerAvatar = () => ({ generated: true });
worldRowGame.leaguePlayerTitle = () => "远方玩家的河湾哨站";
worldRowGame.leagueRowValue = () => 13140;
worldRowGame.truncateTextToWidth = (_ctx, value) => value;
worldRowGame.openLeaguePlayerDetail = () => {};
const compactWorldLayout = worldRowGame.drawLeagueRankingRow({}, { id: "world_friend", level: 4, animals: 395, shield: 60, profileComplete: true, friend: true }, 1, 18, 100, 339, 42);
if (compactWorldLayout.layout !== "friend-list" || compactWorldLayout.rowH > 42 || !worldRowCalls.some((call) => call[0] === "text" && call[2] === "13140")
  || !worldRowCalls.some((call) => call[0] === "text" && String(call[2]).includes("微信好友"))) {
  throw new Error("world leaderboard rows should use the compact friend-list layout and retain friend identity");
}
game.openLeaguePlayerDetail(worldTarget, worldTarget.rank);
if (!game.infoDetailModal || game.infoDetailModal.title !== "leo.liu的苔原哨站" || !/真实玩家/.test(game.infoDetailModal.kicker) || game.infoDetailModal.player !== worldTarget) {
  throw new Error("clicking a real world player should open the full player and reserve detail");
}
const incompleteTarget = Object.assign({}, worldTarget, { animals: 31, shield: 48, profileComplete: false });
game.openLeaguePlayerDetail(incompleteTarget, incompleteTarget.rank);
const incompleteCopy = JSON.stringify(game.infoDetailModal.items);
if (!/动物数据待同步/.test(incompleteCopy) || /31 只动物/.test(incompleteCopy) || /真实玩家完整数据/.test(incompleteCopy)) {
  throw new Error("legacy score-only profiles must not expose a generated or zero animal count as real data");
}
const avatarA = game.leaguePlayerAvatarStyle(worldTarget);
const avatarB = game.leaguePlayerAvatarStyle(Object.assign({}, worldTarget, { id: "cloud_real_world_2", owner: "Nicole.英" }));
if (!avatarA.generated || !avatarA.initial || (avatarA.start === avatarB.start && avatarA.initial === avatarB.initial)) {
  throw new Error("world players should receive stable, visually distinct privacy-safe avatars");
}
const beforeWorldRivals = ((game.state.world.reserve.league || {}).rivals || []).filter((row) => row.scope === "world").length;
const raidVisitors = chapterVisitorTotal(game.state.world.reserve);
const raidSources = animalSourceSummary(game.state.world.reserve);
game.selectedRivalId = "cloud_real_world_1";
const originalRandom = Math.random;
Math.random = () => 0;
game.raidRival();
Math.random = originalRandom;
if (animalSourceSummary(game.state.world.reserve).immigrated <= raidSources.immigrated) {
  throw new Error("border patrol animal arrivals must write immigration, not breeding remainder");
}
if (animalSourceSummary(game.state.world.reserve).breeding !== raidSources.breeding) {
  throw new Error("border patrol must not pollute breeding remainder");
}
if (chapterVisitorTotal(game.state.world.reserve) !== raidVisitors) {
  throw new Error("border patrol must not rewrite chapter visitors");
}

const afterWorldRivals = ((game.state.world.reserve.league || {}).rivals || []).filter((row) => row.scope === "world").length;
if (afterWorldRivals <= beforeWorldRivals) {
  throw new Error("raiding a world ranking target should persist that target in league rivals");
}
if (game.leagueRankOfMine("world") < 1) {
  throw new Error("world rank should still be available after raid");
}

game.leagueScope = "friends";
game.state.world.reserve.league.rivals.push({
  id: "friend_real_1",
  name: "好友的河湾保护区",
  owner: "真实好友",
  valuation: 6190,
  rating: 1190,
  shield: 44,
  animals: 36,
  material: 120,
  style: "共同巡护",
  scope: "friends",
  simulated: false,
  source: "player"
});
if (!game.hasFriendLeagueMembers() || game.leagueRows("friends").length !== 2 || game.leagueRankOfMine("friends") < 1) {
  throw new Error("an explicit real friend should replace the share-only empty state");
}
game.openReserveNetwork("friends");
if (screenCount !== 4) {
  throw new Error("friend ranking should open normally once a real friend exists");
}
game.ensureSelectedRivalForScope("friends");
if (!game.selectedRival() || game.selectedRival().id !== "friend_real_1") {
  throw new Error("friend page should select the first available friend as the current target");
}
game.state.world.reserve.fund = 500;
game.state.world.reserve.supplies.dogFood = 5;
game.state.world.reserve.supplies.alarm = 5;
game.state.world.reserve.inventory.recoveredTrap = 3;
Math.random = () => 0;
game.raidRival();
Math.random = originalRandom;
if ((game.state.world.reserve.social || {}).actorScope !== "friends" || (game.state.world.reserve.social || {}).actor !== "好友的河湾保护区") {
  throw new Error("border patrol should keep the current friend as its target");
}
const beforeCoop = (game.state.world.reserve.social || {}).coop || 0;
const tradeEntries = [];
game.openAutoExchangeModal = (source, scope) => { tradeEntries.push({ itemId: "", scope, source, target: game.selectedRival() }); return true; };
game.collaborateWithRival();
if (tradeEntries.length !== 1 || tradeEntries[0].scope !== "friends" || tradeEntries[0].source !== "league" || tradeEntries[0].target.id !== "friend_real_1" || ((game.state.world.reserve.social || {}).coop || 0) !== beforeCoop) {
  throw new Error("friend exchange should open the same auto exchange as sandbox for the current friend");
}
game.upgradeShield();
if ((game.state.world.reserve.social || {}).action !== "加固" || (game.state.world.reserve.social || {}).actor !== "好友的河湾保护区") {
  throw new Error("fortify should keep the current friend as its target");
}

game.leagueScope = "world";
game.ensureSelectedRivalForScope("world");
game.state.world.reserve.inventory.researchSample = 1;
game.exchangeWithWorld();
if (tradeEntries.length !== 2 || tradeEntries[1].scope !== "world" || tradeEntries[1].source !== "league" || tradeEntries[1].target.scope !== "world") {
  throw new Error("world reserve should open the same auto exchange as sandbox for the current world player");
}

game.state.world.reserve.league.rivals = Array.from({ length: 120 }, (_, index) => ({
  id: `real_world_${index}`,
  name: `真实保护区${index + 1}`,
  owner: `玩家${index + 1}`,
  rating: 20000 - index * 100,
  shield: 50,
  animals: 40,
  material: 120,
  style: "真实经营",
  scope: "world",
  simulated: false,
  source: "player"
}));
game.cloudService = null;
const matureWorld = game.leagueOpponents("world");
if (matureWorld.length !== 100 || matureWorld.some((row) => row.simulated)) {
  throw new Error("world ranking should contain at most one hundred real players");
}
const cappedRows = game.leagueRows("world");
if (cappedRows.length !== 100 || !cappedRows.some((row) => row.mine)) {
  throw new Error("the visible one-hundred-row ranking should keep the player's own reserve");
}
game.leaguePageByScope = { friends: 0, world: 9 };
const lastPage = game.leaguePagination("world", cappedRows.length);
if (lastPage.pageCount !== 10 || lastPage.page !== 9 || lastPage.start !== 90 || lastPage.end !== 100) {
  throw new Error("one hundred ranking rows should be reachable through ten stable pages");
}
if (game.leaguePlayerTitle({ name: "卫士·YXNY的苔原哨站", owner: "卫士·YXNY", reserveName: "苔原哨站" }) !== "YXNY的苔原哨站") {
  throw new Error("legacy guardian prefixes should not appear in world ranking titles");
}

console.log("league ranking check ok");
