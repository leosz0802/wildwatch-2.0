const assert = require("assert");

function context() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: context }),
  createImage: () => ({ loaded: true, width: 480, height: 320 }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { normalizeChapterRescue, findRecord } = require("../js/chapterRescueSystem");
const { rescuePointTarget } = require("../js/chapterRescueSystem");

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, "地图直接解救回归");
game.screen = "home";
game.width = 375;
game.height = 667;
game.ctx = context();
game.render = () => {};
game.requestRender = () => {};
game.setScreen = (screen) => { game.screen = screen; };
game.toast = () => {};
game.playSfx = () => {};
game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
game.scrollY = 0;

const reserve = game.state.world.reserve;
const rescue = normalizeChapterRescue(reserve, 1, { fresh: true });
const target = rescue.targets.find((record) => record.status !== "rescued");
assert(target, "chapter 1 must expose a pending rescue target");
const itemId = target.requiredItems[0];
const required = rescuePointTarget(target, itemId);

// Simulate a real multi-round arrow result persisted in the rescue record.
// Deliberately leave pointProgress/materialExplorationProgress and the global
// arrow history empty to cover the Android/Harmony save shape that previously
// reopened the prompt despite the score already being complete.
target.pointHistory = [{
  rescueTargetId: target.targetId,
  rescueItemId: itemId,
  itemId,
  totalScore: required,
  recordedAt: Date.now()
}];

game.drawChapterRescueMarkers(game.ctx, {
  x: 0, y: 0, w: 375, h: 600,
  worldX: 0, worldY: 0, worldW: 600, worldH: 600, worldSize: 600, scale: 1
});
const marker = game.renderedRescueMapMarkers.find((entry) => entry.targetId === target.targetId);
assert(marker, "ready rescue must render a map marker");
const hit = game.hitAreas.find((entry) => entry && entry.rescue
  && marker.x <= entry.x + entry.w && marker.x + marker.w >= entry.x
  && marker.y <= entry.y + entry.h && marker.y + marker.h >= entry.y);
assert(hit, "ready rescue marker must register a rescue hit area");

const tap = game.hitAreaAt(marker.x + marker.w / 2, marker.y + marker.h / 2);
assert(tap && tap.rescue, "clicking the ready rescue icon must resolve through its rescue hit");
tap.onTap();

const settled = findRecord(reserve.chapterRescue, target.targetId);
assert.strictEqual(settled.status, "rescued", "ready map click must complete rescue immediately");
assert(game.mapConsequencePulse && game.mapConsequencePulse.rescueSpeciesId === target.speciesId,
  "ready map click must start the release animation");
assert.strictEqual(game.infoDetailModal, null, "ready map click must not reopen the rescue information prompt");

const shortcutGame = new Game();
shortcutGame.stopLoop();
shortcutGame.state = createCharacter(null, "非地图入口直接解救回归");
shortcutGame.screen = "home";
shortcutGame.width = 375;
shortcutGame.height = 667;
shortcutGame.ctx = context();
shortcutGame.render = () => {};
shortcutGame.requestRender = () => {};
shortcutGame.setScreen = (screen) => { shortcutGame.screen = screen; };
shortcutGame.toast = () => {};
shortcutGame.playSfx = () => {};
const shortcutReserve = shortcutGame.state.world.reserve;
const shortcutRescue = normalizeChapterRescue(shortcutReserve, 1, { fresh: true });
const shortcutTarget = shortcutRescue.targets.find((record) => record.status !== "rescued");
const shortcutItem = shortcutTarget.requiredItems[0];
shortcutReserve.materialExplorationProgress = Object.assign({}, shortcutReserve.materialExplorationProgress, {
  [shortcutItem]: rescuePointTarget(shortcutTarget, shortcutItem)
});
assert(shortcutGame.openChapterRescueTask(shortcutTarget.targetId), "ready shortcut entry must be handled");
assert.strictEqual(findRecord(shortcutReserve.chapterRescue, shortcutTarget.targetId).status, "rescued",
  "ready shortcut entry must complete rescue immediately");
assert(shortcutGame.mapConsequencePulse && shortcutGame.mapConsequencePulse.rescueSpeciesId === shortcutTarget.speciesId,
  "ready shortcut entry must start the same release animation");
assert.strictEqual(shortcutGame.infoDetailModal, null,
  "ready shortcut entry must not reopen the information prompt");

console.log("rescue map direct release check ok");
