const { Game } = require("../js/game");
const { knownCharacters } = require("../js/world");
const { SPECIES_DB } = require("../js/animalWorld");

const game = new Game();
const world = game.state.world;
const deer = world.knownCharacters.find((animal) => animal.species === "鹿");
const wolf = world.knownCharacters.find((animal) => animal.species === "狼");
const mink = knownCharacters.find((animal) => animal.species === "水貂");

if (!deer || !wolf || !mink) throw new Error("dialogue check needs deer, wolf and mink NPCs");

world.reserve.migration = { trend: "out", delta: -4, reason: "偷猎压力导致动物流失" };
world.reserve.poacherPressure = 63;
world.reserve.ecology.water = 40;

const deerContext1 = game.createAnimalDialogueContext(deer);
const deerContext2 = game.createAnimalDialogueContext(deer);
const deerBubble = game.animalBubbleText(deer, deerContext1);
const deerToday = game.animalTodayEvent(deer, deerContext1);
const deerSpeech = game.animalSpeech(deer, deerContext1);
const deerSpeech2 = game.animalSpeech(deer, deerContext2);
const deerDetail = game.buildAnimalThoughtDetail(deer, deerContext1);
const wolfContext = game.createAnimalDialogueContext(wolf);
const minkContext = game.createAnimalDialogueContext(mink);
const wolfSpeech = game.animalSpeech(wolf, wolfContext);
const minkToday = game.animalTodayEvent(mink, minkContext);

if (!/伙伴少了|少了脚步声|队伍变薄了/.test(deerBubble)) {
  throw new Error(`deer bubble should reflect lived danger, got: ${deerBubble}`);
}
if (!/少了|同伴|幼鹿|水边|鹿群|警觉|饮水窗口/.test(deerToday)) {
  throw new Error(`deer today event should describe lived state, got: ${deerToday}`);
}
if (!/伙伴|幸好|逃|活下来|队伍|呼吸声|熟悉影子/.test(deerSpeech)) {
  throw new Error(`deer speech should feel like lived experience, got: ${deerSpeech}`);
}
if (deerSpeech === deerSpeech2) {
  throw new Error("deer speech should change across repeated clicks");
}
if (!deerDetail.prose || !/^\d+日/.test(deerDetail.prose)) {
  throw new Error("animal detail should be one integrated live monologue");
}
if ((deerDetail.lines || []).length !== 1) {
  throw new Error("animal detail should not split the monologue into many categories");
}
if (deerDetail.prose.length > 100) {
  throw new Error(`animal monologue should stay concise and game-like, got ${deerDetail.prose.length} chars: ${deerDetail.prose}`);
}
if (!/耳朵|草尖|幼鹿|灌木|浅痕/.test(deerDetail.prose)) {
  throw new Error(`animal monologue should feel embodied and animal-like, got: ${deerDetail.prose}`);
}
if (/…/.test(deerDetail.prose)) {
  throw new Error(`animal monologue should render complete text without ellipsis, got: ${deerDetail.prose}`);
}
if (/森林事实|我现在想|我在担心|地图画面|现场时间|接下来我会|你在地图上能看到|^时段|^遭遇|^心声|^危机|^行动|^线索/.test(deerDetail.prose)) {
  throw new Error("animal detail should not read like a written report");
}
if (!/第 2 次倾听/.test(game.buildAnimalThoughtDetail(deer, deerContext2).footer)) {
  throw new Error("animal detail footer should reflect click refresh behavior");
}
if (!/鹿群|猎物|体力|晚饭|鹿味|不追|停了/.test(wolfSpeech)) {
  throw new Error(`wolf speech should react to prey state, got: ${wolfSpeech}`);
}
if (!/水位|鱼|浅滩|脚印|伏击点/.test(minkToday)) {
  throw new Error(`mink today event should react to wetland life, got: ${minkToday}`);
}

const allSandboxDialogues = knownCharacters.map((animal) => {
  const context = game.previewAnimalDialogueContext(animal, 1);
  return {
    species: animal.species,
    bubble: game.animalBubbleText(animal, context),
    voice: game.animalVoiceTexture(animal, context).opening,
    mood: game.animalMicroMood(animal, context),
    action: game.animalMicroAction(animal, context)
  };
});
allSandboxDialogues.forEach((entry) => {
  if (["我在读空气", "先躲一躲"].includes(entry.bubble)
    || /风里有新味道，我先停下来听听/.test(entry.voice)
    || entry.mood === "身体比脑子先觉得不对"
    || entry.action === "我先绕开最吵的地方") {
    throw new Error(`${entry.species} sandbox dialogue still falls back to a generic template: ${JSON.stringify(entry)}`);
  }
});
if (new Set(allSandboxDialogues.map((entry) => entry.bubble)).size !== knownCharacters.length) {
  throw new Error("all 33 sandbox species must show distinct live bubble language");
}

const plotChecks = [
  [1, "乌鸦", "上一任"], [2, "熊", "保护站"], [3, "狮子", "暂不扩张"], [4, "大象", "旧水路"], [5, "水貂", "浅滩"]
];
plotChecks.forEach(([level, species, phrase]) => {
  const animal = knownCharacters.find((entry) => entry.species === species);
  const context = game.previewAnimalDialogueContext(animal, 2);
  context.chapter = require("../js/animalWorld").CHAPTERS[level - 1];
  if (!game.animalChapterLead(animal, context).includes(phrase)) {
    throw new Error(`${species} must echo chapter ${level} plot in sandbox dialogue`);
  }
});

const chapterMink = knownCharacters.find((animal) => animal.species === "水貂");
const lowWaterChapter = game.previewAnimalDialogueContext(chapterMink, 21);
lowWaterChapter.chapter = require("../js/animalWorld").CHAPTERS[4];
lowWaterChapter.ecology = Object.assign({}, lowWaterChapter.ecology, { water: 34 });
lowWaterChapter.reserve = Object.assign({}, lowWaterChapter.reserve, { ecology: lowWaterChapter.ecology });
if (/浅滩回来了|鱼影也回来了/.test(game.animalChapterLead(chapterMink, lowWaterChapter))) {
  throw new Error("chapter identity must not make a low-water animal claim that the shallows have recovered");
}
const seasonAnimal = knownCharacters.find((animal) => animal.species === "大象");
const seasonContext = game.previewAnimalDialogueContext(seasonAnimal, 3);
seasonContext.world = Object.assign({}, seasonContext.world, { season: "旱季" });
if (!/旱季|水点/.test(game.animalSeasonLead(seasonAnimal, seasonContext))) {
  throw new Error("sandbox dialogue must react to dry/rain season context");
}

// Voice texture must describe the live ecology rather than repeat a fixed
// negative sentence after the water line has already recovered.
const liveMink = world.knownCharacters.find((animal) => animal.species === "水貂") || mink;
world.weather = "小雨";
world.season = "雨季";
world.reserve.ecology.water = 82;
let liveContext = game.previewAnimalDialogueContext(liveMink, 7);
if (/短了|缩水|少了/.test(game.animalVoiceTexture(liveMink, liveContext).opening)) {
  throw new Error("healthy rainy-season mink voice must not claim that the shallows are shrinking");
}
world.weather = "晴";
world.season = "旱季";
world.reserve.ecology.water = 38;
liveContext = game.previewAnimalDialogueContext(liveMink, 8);
if (!/短了|少了|旧水路/.test(game.animalVoiceTexture(liveMink, liveContext).opening)) {
  throw new Error("dry low-water mink voice must acknowledge the shrinking shallows");
}
const genericEventContext = game.previewAnimalDialogueContext(liveMink, 9);
genericEventContext.relatedEvent = { id: "generic", label: "异常芦苇倒伏", recommendAction: "exploreMaterials" };
const genericEventBubble = game.animalEventBubbleClue(liveMink, genericEventContext);
if (!/线索|芦苇/.test(genericEventBubble) || /有动静|附近有事/.test(genericEventBubble)) {
  throw new Error(`uncategorized live events must still produce an actionable, specific bubble: ${genericEventBubble}`);
}

const profiles = Object.keys(SPECIES_DB).map((speciesId) => game.buildSpeciesProfileDetail(speciesId));
profiles.forEach((profile) => {
  const lines = (profile.profile && profile.profile.dialogues) || [];
  if (profile.dialoguesExpanded !== false) {
    throw new Error(`${profile.title} recent dialogue should start collapsed`);
  }
  if (lines.length < 3 || lines.length > 5) {
    throw new Error(`${profile.title} should expose 3-5 recent dialogue lines, got ${lines.length}`);
  }
  if (new Set(lines).size !== lines.length) {
    throw new Error(`${profile.title} recent dialogue should not repeat itself: ${lines.join(" / ")}`);
  }
  if (!profile.profile.attitude || /你做得不错|还在观察你，别让我们失望|上一个巡护员也说/.test(profile.profile.attitude)) {
    throw new Error(`${profile.title} should use a species-specific attitude, got: ${profile.profile.attitude}`);
  }
});
const attitudeBodies = profiles.map((profile) => profile.profile.attitude.replace(/^[^：]+：/, ""));
if (new Set(attitudeBodies).size < Object.keys(SPECIES_DB).length) {
  throw new Error("all species should have visibly different attitude language");
}
const dialogueSignatures = profiles.map((profile) => profile.profile.dialogues.join("|"));
if (new Set(dialogueSignatures).size < Object.keys(SPECIES_DB).length) {
  throw new Error("all species should expose distinct recent dialogue sets");
}
profiles.forEach((profile) => {
  const lines = (profile.profile && profile.profile.dialogues) || [];
  if (lines.some((line) => game.isAnimalContextLine(line))) {
    throw new Error(`${profile.title} recent dialogue should not include chapter/status metadata`);
  }
});

function mockContext() {
  const gradient = { addColorStop() {} };
  const text = [];
  const target = {
    _text: text,
    measureText(value) { return { width: String(value || "").length * 6 }; },
    fillText(value) { text.push(String(value || "")); },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; }
  };
  return new Proxy(target, {
    get(object, property) {
      if (property in object) return object[property];
      return () => {};
    },
    set(object, property, value) {
      object[property] = value;
      return true;
    }
  });
}

const renderContext = mockContext();
game.ctx = renderContext;
game.width = 375;
game.height = 667;
game.hitAreas = [];
game.drawSpeciesProfileModalContent(renderContext, profiles[0], 0, 0, 375, 460);
game.drawSpeciesProfileCard(
  renderContext,
  0,
  0,
  320,
  profiles[0].profile.species,
  profiles[0].profile.population,
  profiles[0].profile.status,
  profiles[0].profile.importance,
  null,
  null,
  profiles[0].profile.dialogue,
  world.reserve
);
if (renderContext._text.some((line) => /近期对白|最近对话/.test(line))) {
  throw new Error("species dialogue panels should not show a synthetic dialogue heading");
}
if (renderContext._text.some((line) => game.isAnimalContextLine(line))) {
  throw new Error("species dialogue panels should not render chapter/status metadata as dialogue");
}

console.log("dialogue check ok");
