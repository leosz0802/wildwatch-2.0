const fs = require("fs");
const path = require("path");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { getUnlockedSpecies } = require("../js/animalWorld");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "game.json"), "utf8"));
const chapterPackage = (config.subpackages || []).find((item) => item.name === "chapters");
assert(chapterPackage && chapterPackage.root === "chapter-assets", "chapter asset subpackage is missing");
const artFiles = fs.readdirSync(path.join(root, chapterPackage.root)).filter((file) => /\.jpg$/i.test(file));
assert(artFiles.length === 6, `expected five shared chapter illustrations plus the dedicated Lv.5 finale, got ${artFiles.length}`);
assert(artFiles.includes("chapter-5-summary.jpg"), "dedicated completed-reserve finale illustration is missing");

const game = Object.create(Game.prototype);
game.state = createCharacter(null, "保护区卫士");
game.chapterArt = {};
game.chapterStoryQueue = [];
game.chapterStoryModal = null;
game.pendingMissionAfterChapter = false;
game.render = () => {};
game.maybeOpenMissionPush = () => false;
game.prepareChapterArt = () => {};

[1, 2, 3, 4, 5].forEach((level) => {
  const start = game.buildChapterStory(level, "start");
  const ending = game.buildChapterStory(level, "end", { population: 100 + level, daysManaged: level * 7 });
  assert(start.level === level && start.phase === "start", `chapter ${level} start metadata is invalid`);
  assert(ending.level === level && ending.phase === "end", `chapter ${level} ending metadata is invalid`);
  assert(start.body && ending.body, `chapter ${level} should have start and ending prose`);
  assert(start.speciesLine.includes(`${getUnlockedSpecies(level).length}`) || /本章出现|首巡/.test(start.speciesLine), `chapter ${level} species line missing`);
  assert(ending.speciesLine.includes(`${getUnlockedSpecies(level).length} 种动物`), `chapter ${level} ending species count is wrong`);
  if (!(level === 1 && start.firstRun)) assert(/待结案|支线/.test(start.body), `chapter ${level} start should acknowledge an unresolved preceding case`);
  assert(/未解证据/.test(ending.body), `chapter ${level} ending should preserve unresolved case continuity`);
});

game.state.world.collection.cases.case_1.ending = { id: "resolved", name: "已经结案" };
const resolvedStart = game.buildChapterStory(2, "start");
assert(!/仍未结案/.test(resolvedStart.body) && /案件已结/.test(resolvedStart.speciesLine), "resolved case should remove the unresolved chapter branch");

const transition = {
  chapterTransition: { from: 2, to: 3, summary: { population: 188, daysManaged: 10 } }
};
assert(game.queueChapterStoriesForSettlement(transition), "level transition should queue chapter stories");
assert(game.chapterStoryModal.level === 2 && game.chapterStoryModal.phase === "end", "previous chapter ending should open first");
assert(game.chapterStoryQueue.length === 1 && game.chapterStoryQueue[0].level === 3 && game.chapterStoryQueue[0].phase === "start", "next chapter start should follow ending");
game.dismissChapterStory();
assert(game.chapterStorySeen(2, "end"), "chapter ending watch record was not saved");
assert(game.chapterStoryModal && game.chapterStoryModal.level === 3, "chapter queue did not advance");
game.dismissChapterStory();
assert(game.chapterStorySeen(3, "start"), "chapter start watch record was not saved");
assert(!game.queueChapterStoriesForSettlement(transition), "watched chapter transition should not repeat");

game.state.ui = Object.assign({}, game.state.ui || {}, { chapterStoriesSeen: {} });
assert(game.queueChapterStoriesForSettlement({ finalChapterEnding: true }), "Lv5 final ending should queue after a valid action");
assert(game.chapterStoryModal.level === 5 && game.chapterStoryModal.phase === "end", "Lv5 final ending metadata is wrong");
game.dismissChapterStory();
assert(game.chapterStorySeen(5, "end"), "Lv5 final ending watch record missing");
assert(!game.queueChapterStoriesForSettlement({ finalChapterEnding: true }), "Lv5 final ending should not repeat");

console.log("chapter story check ok");
