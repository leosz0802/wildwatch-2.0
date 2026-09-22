const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { animalLetterInbox } = require("../js/animalLetters");
const { SHARE_IMAGES } = require("../js/shareSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = Object.create(Game.prototype);
game.state = createCharacter(null, "保护区卫士");
game.state.world.reserve.development.operations.letters = [
  { id: "v1", day: 4, title: "游客的感谢", body: "谢谢你把这里照顾得这么好。", readAt: 0 }
];
game.state.world.lifeMemory = {
  version: 3,
  individuals: [],
  memories: [],
  permanentConsequences: [],
  rareMoments: [],
  guardianLetters: [
    { id: "g1", day: 7, from: "沉牙", species: "狼", title: "守护者回信", body: "这片边界我们还在守着。", quote: "“我们会继续听风。”", readAt: 0 }
  ],
  animalLetters: [
    {
      id: "a1",
      dateKey: "2026-09-05",
      day: 9,
      createdAt: 1,
      animalId: "deer_1",
      animalName: "晨角",
      species: "鹿",
      title: "水边的提醒",
      salutation: "写给今天回到保护区的你：",
      paragraphs: ["我把幼崽推到队伍内侧。", "昨晚的水线又退了一点。"],
      signoff: "—— 晨角",
      factLabel: "水源",
      factValue: 61,
      actionId: "habitat",
      actionLabel: "去修复水源",
      readAt: 0,
      sharedAt: 0
    }
  ],
  animalLetterDateKey: "2026-09-05",
  animalLetterPromptDateKey: "",
  lastSeenAt: Date.now(),
  lastLetterKey: ""
};
game.render = () => {};
game.toast = () => {};

const letters = game.allIncomingLetters();
assert(letters.length === 3, "the unified inbox should merge visitor, animal, and guardian letters");
assert(letters[0].sourceKind === "animal" && letters[1].sourceKind === "guardian" && letters[2].sourceKind === "visitor", "the inbox should keep source types and order");

const inbox = game.buildVisitorLetterInbox();
assert(inbox.title === "保护区邮箱" && inbox.kicker.includes("保护区来信"), "home entry should now behave like a protection-area inbox");
assert(inbox.letters.length >= 3, "the inbox modal should expose every incoming letter");

assert(game.openVisitorLetterReader(letters[0]), "animal letter should open from the unified inbox");
assert(game.infoDetailModal.prose && !/暂时没有内容/.test(game.infoDetailModal.prose), "animal letter details must render paragraphs even when the legacy entry has no body field");
assert(game.infoDetailModal.kind === "animalLetterReader", "animal letters opened from the unified inbox should use the illustrated reader");
assert((game.infoDetailModal.choices || []).some((choice) => /分享/.test(choice.label)), "animal letter reader should expose a share button");
assert(animalLetterInbox(game.state.world.lifeMemory).find((item) => item.id === "a1").readAt > 0, "animal letter should be marked read");
assert(game.openVisitorLetterReader(letters[1]), "guardian letter should open from the unified inbox");
assert((game.state.world.lifeMemory.guardianLetters[0] || {}).readAt > 0, "guardian letter should be marked read");
assert(game.openVisitorLetterReader(letters[2]), "visitor letter should open from the unified inbox");
assert((game.state.world.reserve.development.operations.letters[0] || {}).readAt > 0, "visitor letter should be marked read");
assert(/游客\+/.test(game.infoDetailModal.actionLabel || ""), "visitor letter sharing must preview a visitor reward");

let sharedPostcard = null;
game.shareForestPostcard = (_event, postcard) => { sharedPostcard = postcard; };
game.shareAnimalLetter(animalLetterInbox(game.state.world.lifeMemory).find((item) => item.id === "a1"));
assert(sharedPostcard && sharedPostcard.imageUrl === SHARE_IMAGES.warm, "animal letter sharing should use the bundled stable letter cover");
sharedPostcard = null;
game.shareVisitorLetter(letters[2]);
assert(sharedPostcard && sharedPostcard.rewardType === "visitors", "visitor letter sharing must carry a visitor reward type");

// 地图入口只有一个点击区域；没有变化时隐藏，变化发生后短暂出现。
const chipGame = Object.create(Game.prototype);
chipGame.state = game.state;
chipGame.drawUiIcon = () => true;
chipGame.drawSmallGlyph = () => {};
chipGame.roundRect = () => {};
chipGame.text = () => {};
chipGame.addMapRectHit = (x, y, w, h, action) => { chipGame.lastChipHit = { x, y, w, h, action }; };
chipGame.animT = () => 0;
chipGame.state.ui.mapNotifiedLetterKeys = chipGame.allIncomingLetters().map(letter => `${letter.sourceKind}:${letter.id}`);
chipGame.drawMapVisitorCountChip({}, { x: 0, y: 0, w: 300, h: 500 }, [], 1);
assert(chipGame.renderedMapVisitorCountChip.visible === false, "map chip should stay hidden until a visitor or letter change");
chipGame.state.world.reserve.development.operations.letters.push({ id: "fresh", day: 10, title: "新邮件", body: "新的参访记录", readAt: 0 });
chipGame.drawMapVisitorCountChip({}, { x: 0, y: 0, w: 300, h: 500 }, [], 1);
assert(chipGame.renderedMapVisitorCountChip.mode === "reserveLetters"
  && chipGame.renderedMapVisitorCountChip.label.includes("新邮件")
  && chipGame.lastChipHit, "a fresh letter change should briefly surface the unified letter inbox");

console.log("letter inbox check ok");
