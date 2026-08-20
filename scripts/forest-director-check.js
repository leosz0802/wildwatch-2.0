const { createCharacter } = require("../js/storage");
const { animals } = require("../js/animals");
const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");

const wardenAnimal = animals[0];
const state = createCharacter(wardenAnimal, "测试卫士");
state.character.role = "warden";
state.world = createInitialWorld();
state.world.reserve.poacherPressure = 66;
state.world.reserve.ecology.water = 42;

if (!state.world.aiForest || !state.world.aiForest.facts || !state.world.aiForest.animalMoods) {
  throw new Error("initial world should include AI forest director output");
}

const result = simulateDay("派猎犬去东部河岸驱赶偷猎者，并检查水源", state);
const aiForest = result.world.aiForest;

if (!aiForest || aiForest.version !== "local-forest-director-v1") {
  throw new Error("simulateDay should attach forest director output");
}
if (!aiForest.facts || aiForest.facts.length < 6) {
  throw new Error("forest director should produce layered facts");
}
if (!aiForest.dataSummary || typeof aiForest.dataSummary.water !== "number" || typeof aiForest.dataSummary.poacherPressure !== "number") {
  throw new Error("forest director should expose data summary");
}
if (!aiForest.reserveView || (aiForest.reserveView.states || []).map((item) => item.label).join("/") !== "基金/水源/草场" || !aiForest.reserveView.outcome) {
  throw new Error("forest director should carry readable front-stage reserveView");
}
if (!aiForest.pictureCues || aiForest.pictureCues.length < 3) {
  throw new Error("forest director should produce picture cues");
}
const deer = result.world.knownCharacters.find((animal) => animal.species === "鹿");
const crow = result.world.knownCharacters.find((animal) => animal.species === "乌鸦");
if (!deer || !deer.aiMood || !deer.aiMood.livedEvent || !deer.aiMood.imageCue) {
  throw new Error("deer should receive AI mood, lived event and image cue");
}
if (!crow || !crow.aiMood || !/脚印|树冠|路线|消息/.test(crow.aiMood.livedEvent)) {
  throw new Error(`crow should translate facts into intelligence, got: ${crow && crow.aiMood && crow.aiMood.livedEvent}`);
}
if (!result.visual.aiForest || !result.visual.pictureCues) {
  throw new Error("settlement visual should carry forest director output");
}

console.log("forest director check ok");
