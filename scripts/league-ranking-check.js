const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

const game = Object.create(Game.prototype);
game.state = createCharacter(null, "保护区卫士");
game.leagueScope = "world";
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
if (worldRows.length !== 13) {
  throw new Error("world ranking should use system guardians to maintain twelve opponents while real players are scarce");
}
if (!game.leagueOpponents("world").every((row) => row.scope === "world" && row.simulated === true && row.source === "system")) {
  throw new Error("early world ranking fillers should be transparently marked as system guardians");
}

function assertSorted(rows, label) {
  rows.reduce((prev, row) => {
    if ((row.rating || 0) > prev) throw new Error(`${label} ranking is not sorted by rating`);
    return row.rating || 0;
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
game.setScreen = () => { screenCount += 1; };
game.openReserveNetwork("friends");
if (shareCount !== 1 || screenCount !== 0) {
  throw new Error("opening an empty friend ranking should directly launch the share invite");
}

game.ensureSelectedRivalForScope("world");
const worldTarget = game.selectedRival();
if (!worldTarget || worldTarget.mine || worldTarget.scope !== "world") {
  throw new Error("world ranking should provide a selectable rival reserve");
}

const beforeWorldRivals = ((game.state.world.reserve.league || {}).rivals || []).filter((row) => row.scope === "world").length;
game.selectedRivalId = "world_crown";
const originalRandom = Math.random;
Math.random = () => 0;
game.raidRival();
Math.random = originalRandom;

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
if (screenCount !== 1) {
  throw new Error("friend ranking should open normally once a real friend exists");
}
game.ensureSelectedRivalForScope("friends");
game.state.world.reserve.fund = 500;
const beforeCoop = (game.state.world.reserve.social || {}).coop || 0;
game.collaborateWithRival();
if ((game.state.world.reserve.social || {}).action !== "协作" || (game.state.world.reserve.social || {}).coop <= beforeCoop) {
  throw new Error("friend reserve should support a direct cooperation interaction");
}

game.leagueScope = "world";
game.ensureSelectedRivalForScope("world");
game.state.world.reserve.inventory.researchSample = 1;
game.exchangeWithWorld();
if ((game.state.world.reserve.social || {}).action !== "交换" || (game.state.world.reserve.intel || 0) < 1) {
  throw new Error("world reserve should support a direct resource exchange interaction");
}

game.state.world.reserve.league.rivals = Array.from({ length: 12 }, (_, index) => ({
  id: `real_world_${index}`,
  name: `真实保护区${index + 1}`,
  owner: `玩家${index + 1}`,
  rating: 1500 - index * 20,
  shield: 50,
  animals: 40,
  material: 120,
  style: "真实经营",
  scope: "world",
  simulated: false,
  source: "player"
}));
const matureWorld = game.leagueOpponents("world");
if (matureWorld.length !== 12 || matureWorld.some((row) => row.simulated)) {
  throw new Error("system guardians should disappear after twelve real world players are available");
}

console.log("league ranking check ok");
