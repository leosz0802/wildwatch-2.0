const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

readJson("project.config.json");
readJson("game.json");

const { animals } = require("../js/animals");
const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");

const animal = animals[0];
const state = {
  world: createInitialWorld(),
  character: {
    id: "p",
    animalId: animal.id,
    species: animal.species,
    animalName: animal.defaultName,
    location: animal.startLocation,
    hunger: animal.base.hunger,
    thirst: animal.base.thirst,
    stamina: animal.base.stamina,
    health: animal.base.health,
    status: "alive",
    statusText: "正常",
    traits: animal.traits,
    tier: animal.tier,
    niche: animal.niche,
    pursuit: animal.pursuit,
    cost: animal.cost,
    influence: animal.influence,
    cannotChange: animal.cannotChange,
    speciesGoal: animal.speciesGoal,
    ecologyFit: animal.ecologyFit,
    rank: animal.species === "熊" ? 5 : animal.tier === "apex" ? 4 : 1,
    rule: animal.rule
  },
  reports: [],
  messages: []
};

const result = simulateDay("去东部河岸喝水，但尽量避开狼", state);

if (result.world.day !== 8) {
  throw new Error("day did not advance");
}

if (result.reports.length !== 2) {
  throw new Error("reports were not generated");
}

if (result.character.thirst >= state.character.thirst) {
  throw new Error("drink command did not reduce thirst");
}

if (!result.visual || result.visual.actionType !== "drink" || !result.visual.eventCard) {
  throw new Error("structured visual result was not generated");
}

if (!result.visual.influenceNote || result.character.tier !== "apex") {
  throw new Error("ecology tradeoff result was not generated");
}

if (!result.world.time || !result.visual.time || !result.visual.territory) {
  throw new Error("time and territory result was not generated");
}

if (!result.world.mapEvents.length || !result.world.rumors.length) {
  throw new Error("world visual events were not updated");
}

if (!result.world.goals || !result.world.goals.longTerm || !result.world.goals.daily) {
  throw new Error("goals were not generated");
}

if (result.world.goals.version !== 3 || !Array.isArray(result.world.goals.daily.objectives) || result.world.goals.daily.objectives.length !== 0) {
  throw new Error("daily tasks must stay removed after an action");
}

if (!result.world.npcMovements || result.world.npcMovements.length < 4) {
  throw new Error("npc movements were not generated");
}

if (!result.world.knownCharacters[0].intent || !result.world.knownCharacters[0].relation) {
  throw new Error("known character public intent was not updated");
}

const publicReport = result.reports.find((report) => report.type === "public");
if (!publicReport || !publicReport.visual || !publicReport.visual.npcMovements) {
  throw new Error("public report did not include npc movements");
}

console.log("smoke test ok");
