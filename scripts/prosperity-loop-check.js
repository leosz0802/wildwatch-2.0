const { createInitialWorld } = require("../js/world");
const { Game } = require("../js/game");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const world = createInitialWorld();
const game = Object.create(Game.prototype);
game.state = { world };
game.command = "";
game.selectedPurchaseId = "";
game.selectedReserveAction = "houndScout";

const reserve = world.reserve;
const before = game.reserveProsperitySummary(reserve, world);

const upgradedWorld = clone(world);
const upgradedReserve = upgradedWorld.reserve;
upgradedReserve.fund += 420;
upgradedReserve.houndTeam.xp = (upgradedReserve.houndTeam.xp || 0) + 18;
upgradedReserve.base.rating += 260;
upgradedReserve.safety = Math.min(100, upgradedReserve.safety + 12);
upgradedReserve.guardianRun.score = Math.min(100, upgradedReserve.guardianRun.score + 14);
upgradedReserve.progression = {
  level: Math.max(2, (reserve.progression && reserve.progression.level || 1) + 1),
  title: "繁荣保护区",
  score: 84,
  progress: 0.7,
  nextScore: 90,
  nextTitle: "明星保护区"
};
upgradedReserve.ecology.herbivores.gazelle = (upgradedReserve.ecology.herbivores.gazelle || 0) + 28;
upgradedReserve.ecology.birds.flamingo = (upgradedReserve.ecology.birds.flamingo || 0) + 12;
upgradedWorld.knownCharacters.push({
  id: "test_hippo",
  name: "泥湾河马",
  species: "河马",
  relation: { trust: 66 }
});

const after = game.reserveProsperitySummary(upgradedReserve, upgradedWorld);
if (before.speciesCount !== 7 || before.animalTotal <= 0 || before.value <= 0) {
  throw new Error("prosperity summary should expose species, population and reserve value");
}
if (after.speciesCount <= before.speciesCount) {
  throw new Error("new animal species should increase prosperity species count");
}
if (after.animalTotal <= before.animalTotal) {
  throw new Error("larger animal populations should increase prosperity population");
}
if (after.value <= before.value || after.score < before.score) {
  throw new Error("stronger reserve should not reduce prosperity value or score");
}

const steps = game.dailyCareSteps(reserve, world.goals.daily);
if (steps.length !== 3 || !steps.every((step) => step.label && step.icon && typeof step.action === "function")) {
  throw new Error("daily ten-minute loop should expose three actionable steps");
}
const stepText = steps.map((step) => `${step.label || ""}${step.short || ""}`).join(" ");
if (!/听/.test(stepText) || !/库存|物资|卖|采购|补给/.test(stepText)) {
  throw new Error("daily loop should include animal listening and material handling");
}

const animatedGame = Object.create(Game.prototype);
animatedGame.state = { world: clone(world), character: { role: "warden" } };
animatedGame.displayReserveStats = animatedGame.reserveDynamicTargets(animatedGame.state.world.reserve);
const startDisplay = Object.assign({}, animatedGame.displayReserveStats);
animatedGame.state.world = upgradedWorld;
animatedGame.tweenDisplayReserveStats(160);
if (!(animatedGame.displayReserveStats.fund > startDisplay.fund)) {
  throw new Error("fund display should animate toward changed fund");
}
if (!(animatedGame.displayReserveStats.valuation > startDisplay.valuation)) {
  throw new Error("reserve value display should animate toward changed valuation");
}
if (!(animatedGame.displayReserveStats.animalTotal > startDisplay.animalTotal)) {
  throw new Error("animal total display should animate toward changed population");
}
if (!(animatedGame.displayReserveStats.houndXp > startDisplay.houndXp)) {
  throw new Error("hound XP display should animate toward changed XP");
}

console.log("prosperity loop check ok");
