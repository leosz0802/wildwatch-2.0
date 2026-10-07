function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext: createFakeContext }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const assert = require("node:assert/strict");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { getChapterSandboxSpecies } = require("../js/animalWorld");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "沙盘轮换");
game.state.ui = Object.assign({}, game.state.ui || {}, { prologue: { version: 1, stage: "complete", completed: true } });
game.screen = "home";
game.art.animalMapSprites = Object.assign({}, game.art.animalMapSprites || {}, { loaded: true, failed: false, source: "remote" });
if (!(game.remoteAssetCompleted instanceof Set)) game.remoteAssetCompleted = new Set();
game.remoteAssetCompleted.add("animalMapSprites");

function visibleAt(chapter, now = 0) {
  game.state.world.reserve.progression.displayChapter = chapter;
  game.state.world.reserve.progression.stage = chapter;
  game.state.world.reserve.progression.level = 7;
  game.sandboxNowOverride = now;
  game.sandboxAnimalRosterCache = null;
  game.frameMemoStore = {};
  const roster = game.sandboxAnimalRoster(game.state.world);
  const visible = game.visibleSandAnimals(game.state.world);
  return {
    roster,
    visible,
    cap: game.sandboxVisibleHerdCap(roster.length, chapter)
  };
}

assert.equal(game.sandboxMapBudgetChapter(), 8);
assert.equal(game.sandboxLateHerdStartChapter(), 12);
assert.equal(game.sandboxLateHerdRatio(), 0.7);

[8, 10, 11].forEach((chapter) => {
  const shot = visibleAt(chapter, 0);
  assert.ok(shot.roster.length > 8, `chapter ${chapter} unlocks more species than the map budget`);
  assert.equal(shot.cap, 8, `chapter ${chapter} keeps at most 8 species on screen`);
  assert.equal(shot.visible.length, 8, `chapter ${chapter} paints the budgeted herd`);
});
game.gesture = { mapPan: true };
assert.equal(game.sandboxVisibleHerdCap(18, 8), 8, "chapter 8 stays at 8 species while the map is moving");
assert.ok(game.sandboxVisibleHerdCap(16, 7) > 8, "chapters before 8 can still show a larger herd while moving");
game.gesture = null;

const early = visibleAt(11, 0);
assert.equal(early.visible.length, Math.min(early.roster.length, early.cap), "before chapter 12 the budgeted herd cap still applies");
game.frameMemoStore = {};
game.sandboxNowOverride = 120000;
const earlyLater = game.visibleSandAnimals(game.state.world);
assert.deepEqual(
  earlyLater.map((animal) => animal.species).sort(),
  early.visible.map((animal) => animal.species).sort(),
  "chapters before 12 must not rotate herds by wall clock"
);

[12, 14, 18].forEach((chapter) => {
  const first = visibleAt(chapter, 0);
  const ratioCap = Math.max(1, Math.ceil(first.roster.length * 0.7));
  const expected = Math.min(8, ratioCap);
  assert.ok(ratioCap > expected, `chapter ${chapter} 70% roster is larger than the on-screen budget`);
  assert.equal(first.cap, expected, `chapter ${chapter} herd cap stays at 8 once the roster exceeds the budget`);
  assert.equal(first.visible.length, expected, `chapter ${chapter} paints 8 species and rotates the rest`);
  assert.equal(new Set(first.visible.map((animal) => game.sandboxSpeciesKey(animal))).size, first.visible.length,
    `chapter ${chapter} sandbox herds must stay unique`);
  const allowed = new Set(getChapterSandboxSpecies(chapter).map((species) => species.name));
  first.visible.forEach((animal) => {
    assert.ok(allowed.has(animal.species), `chapter ${chapter} must not paint ${animal.species}`);
  });

  const union = new Set();
  const snapshots = [];
  for (let slot = 0; slot < 8; slot += 1) {
    const shot = visibleAt(chapter, slot * game.sandboxHerdRotationMs());
    assert.equal(shot.visible.length, expected, `chapter ${chapter} slot ${slot} must keep the budgeted herd visible`);
    snapshots.push(shot.visible.map((animal) => animal.species).sort().join(","));
    shot.visible.forEach((animal) => union.add(animal.species));
  }
  assert.ok(new Set(snapshots).size > 1, `chapter ${chapter} must rotate which species appear inside the budget`);
  assert.ok(union.size > expected, `chapter ${chapter} rotation must reveal more species over time`);
  assert.ok(union.size <= first.roster.length, `chapter ${chapter} rotation must stay inside unlocked populations`);
});

delete global.wx;
console.log("sandbox late herd rotation ok: chapter 8+ keeps 8 species on screen, chapter 12+ rotates the rest");
