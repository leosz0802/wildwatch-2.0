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
assert(artFiles.length === 1 && artFiles[0] === "chapter-1.jpg", "chapter transitions must reuse the first chapter illustration and change only the text");

const game = Object.create(Game.prototype);
game.state = createCharacter(null, "保护区卫士");
game.chapterArt = {};
game.chapterStoryQueue = [];
game.chapterStoryModal = null;
game.pendingMissionAfterChapter = false;
game.render = () => {};
game.maybeOpenMissionPush = () => false;
game.prepareChapterArt = () => {};

[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].forEach((chapterNumber) => {
  const start = game.buildChapterStory(chapterNumber, "start");
  const ending = game.buildChapterStory(chapterNumber, "end", { population: 100 + chapterNumber, daysManaged: chapterNumber * 7 });
  assert(start.level === chapterNumber && start.phase === "start", `chapter ${chapterNumber} start metadata is invalid`);
  assert(ending.level === chapterNumber && ending.phase === "end", `chapter ${chapterNumber} ending metadata is invalid`);
  assert(start.body && ending.body, `chapter ${chapterNumber} should have start and ending prose`);
  assert(start.speaker && start.quote && start.objective, `chapter ${chapterNumber} opening dialogue is incomplete`);
  assert(start.speciesLine.includes("本章出现") || start.speciesLine.includes("本章收束") || /首巡/.test(start.speciesLine), `chapter ${chapterNumber} species line missing`);
  assert(ending.speciesLine.includes(`${getUnlockedSpecies(Math.min(7, chapterNumber)).length} 种动物`), `chapter ${chapterNumber} ending species count is wrong`);
  if (!(chapterNumber === 1 && start.firstRun)) assert(/待结案|支线/.test(start.body), `chapter ${chapterNumber} start should acknowledge an unresolved preceding case`);
  assert(/未解证据/.test(ending.body), `chapter ${chapterNumber} ending should preserve unresolved case continuity`);
});

game.state.world.collection.cases.case_1.ending = { id: "resolved", name: "已经结案" };
const resolvedStart = game.buildChapterStory(2, "start");
assert(!/仍未结案/.test(resolvedStart.body) && /案件已结/.test(resolvedStart.speciesLine), "resolved case should remove the unresolved chapter branch");

const transition = {
  chapterTransition: { from: 2, to: 3, summary: { population: 188, daysManaged: 10 } }
};
assert(game.queueChapterStoriesForSettlement(transition), "level transition should queue chapter stories");
assert(game.chapterStoryModal.level === 3 && game.chapterStoryModal.phase === "start", "a transition should open the next chapter directly");
assert(game.chapterStoryQueue.length === 0 && game.chapterStoryModal.transitionFrom === 2, "chapter progression must use one shared-image text screen");
assert(game.chapterStoryModal.body.includes(game.buildChapterStory(2, "end").narrativeBeat.scene), "single transition screen must retain the previous chapter conclusion");
game.dismissChapterStory();
assert(game.chapterStorySeen(2, "end"), "combined transition should mark the previous ending as seen");
assert(game.chapterStorySeen(3, "start"), "chapter start watch record was not saved");
assert(!game.queueChapterStoriesForSettlement(transition), "watched chapter transition should not repeat");

const bootGame = Object.create(Game.prototype);
bootGame.state = createCharacter(null, "保护区卫士");
bootGame.screen = "home";
bootGame.chapterStoryModal = null;
bootGame.chapterStoryQueue = [];
bootGame.playablePrologueState = () => ({ active: false });
bootGame.openFirstReturnHook = () => false;
bootGame.openQueuedMissionPush = () => false;
bootGame.openPendingShareInvite = () => false;
bootGame.openOfflineBrief = () => false;
bootGame.openGuardianReturnLetter = () => false;
bootGame.openFirstOnboardingChoice = () => false;
bootGame.openPendingGuardianPromise = () => false;
bootGame.openAnimalLetterPrompt = () => false;
bootGame.maybeOpenMissionPush = () => false;
assert(bootGame.openPostFirstFrameExperience(), "post-frame startup should still run");
assert(!bootGame.chapterStoryModal, "startup should not auto-open a chapter story on resume");

game.state.ui = Object.assign({}, game.state.ui || {}, { chapterStoriesSeen: {} });
assert(game.queueChapterStoriesForSettlement({ finalChapterEnding: true }), "Lv20 final ending should queue after a valid action");
assert(game.chapterStoryModal.level === 20 && game.chapterStoryModal.phase === "end", "Lv20 final ending metadata is wrong");
game.dismissChapterStory();
assert(game.chapterStorySeen(20, "end"), "Lv20 final ending watch record missing");
assert(!game.queueChapterStoriesForSettlement({ finalChapterEnding: true }), "Lv20 final ending should not repeat");

console.log("chapter story check ok");
