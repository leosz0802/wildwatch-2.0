const { Game } = require("../js/game");
const { createInitialWorld, knownCharacters } = require("../js/world");
const { getUnlockedSpecies } = require("../js/animalWorld");

const world = createInitialWorld();
const names = knownCharacters.map((animal) => animal.name);
[
  "沉牙狼",
  "晨角鹿",
  "黑铃鸦",
  "厚掌熊",
  "霜脊貂",
  "烈鬃狮",
  "影斑豹",
  "裂吻鳄",
  "花耳犬",
  "条纹斑马",
  "跳星羚",
  "高枝鹿",
  "云耳象"
].forEach((name) => {
  if (!names.includes(name)) throw new Error(`missing cartoon animal name: ${name}`);
});

if (knownCharacters.length !== 21) {
  throw new Error(`expected one NPC template for all 21 species, got: ${knownCharacters.length}`);
}

knownCharacters.forEach((animal) => {
  if (!animal.cartoonLook) throw new Error(`${animal.name} should have cartoon look`);
});
const initialSpecies = world.knownCharacters.map((animal) => animal.species).sort();
const levelOneSpecies = getUnlockedSpecies(1).map((species) => species.name).sort();
if (JSON.stringify(initialSpecies) !== JSON.stringify(levelOneSpecies)) {
  throw new Error(`initial sandbox should show only Lv1 animals: ${initialSpecies.join(",")}`);
}

const game = new Game();
const portraitIndices = knownCharacters.map((animal) => game.animalPortraitIndex(animal.species));
if (portraitIndices.some((index) => index < 0) || new Set(portraitIndices).size !== 21) {
  throw new Error(`sandbox portraits must map all 21 species to unique new artwork: ${portraitIndices.join(",")}`);
}
if (!/drawAnimalSticker/.test(Game.prototype.drawGroundedAnimal.toString())
  || /drawAnimalPortraitAsset/.test(Game.prototype.drawGroundedAnimal.toString())) {
  throw new Error("sandbox animals must use grounded full-body sprites; portrait medallions belong only in lists and detail panels");
}
[
  ["兔子", "野兔"],
  ["短耳兔", "野兔"],
  ["猎犬", "野犬"],
  ["狗", "野犬"],
  ["非洲野犬", "野犬"],
  ["花豹", "豹子"]
].forEach(([alias, expected]) => {
  const aliasIndex = game.animalMapSpriteIndex(alias);
  const expectedIndex = game.animalMapSpriteIndex(expected);
  if (aliasIndex < 0 || aliasIndex !== expectedIndex) {
    throw new Error(`legacy species alias must resolve to a concrete map sprite: ${alias} -> ${expected}`);
  }
});
const deer = game.state.world.knownCharacters.find((animal) => animal.id === "npc_deer" || animal.species === "鹿");
if (!deer) throw new Error("deer npc missing");
if (game.animalDisplayName(deer) !== "晨角鹿") {
  throw new Error(`display name should survive old saves, got: ${game.animalDisplayName(deer)}`);
}
const detail = game.buildAnimalThoughtDetail(deer, game.createAnimalDialogueContext(deer));
if (!detail.animal || !/晨角鹿/.test(detail.title)) {
  throw new Error("animal thought modal should carry animal avatar data and cartoon name");
}
if (!/形象：/.test(detail.meta)) {
  throw new Error("animal modal meta should describe cartoon look");
}

console.log("animal identity check ok");
