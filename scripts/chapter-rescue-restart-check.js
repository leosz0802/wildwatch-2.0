const assert = require('assert');
let stored = null;
global.wx = {
  getStorageSync: () => stored && JSON.parse(JSON.stringify(stored)),
  setStorageSync: (_key, value) => { stored = JSON.parse(JSON.stringify(value)); }
};
const { createCharacter, loadState, saveState, normalizeReserve } = require('../js/storage');
const { getCurrentChapter, reconcileSpeciesPopulations } = require('../js/animalWorld');
const { RESCUE_ITEM_CATALOG, nextRescueTask, addRescueItem, rescueItemCount, rescueAnimal, normalizeChapterRescue } = require('../js/chapterRescueSystem');
const { Game } = require('../js/game');
const fresh = createCharacter(null, '测试卫士');
assert.strictEqual(getCurrentChapter(fresh.world.reserve).chapter, 1);
let target = nextRescueTask(fresh.world.reserve, 1);
assert(target && target.status === 'captive');
RESCUE_ITEM_CATALOG.forEach((item, index) => addRescueItem(fresh.world.reserve, item.id, index + 1));
saveState(fresh);
let loaded = loadState();
RESCUE_ITEM_CATALOG.forEach((item, index) => assert.strictEqual(rescueItemCount(loaded.world.reserve, item.id), index + 1));
reconcileSpeciesPopulations(loaded.world.reserve, { removeLocked: true, initializeUnlocked: true });
assert(!loaded.world.reserve.ecology.herbivores[target.speciesId], 'reconciliation must not auto-release captive species');
assert(rescueAnimal(loaded.world.reserve, target.speciesId).ok);
saveState(loaded);
loaded = loadState();
assert.strictEqual(loaded.world.reserve.chapterRescue.animals[target.speciesId].status, 'rescued');
assert(!rescueAnimal(loaded.world.reserve, target.speciesId).ok, 'rescue must not repeat after restart');

// Reproduce the older build's erroneous completed flags, then load twice.
const broken = JSON.parse(JSON.stringify(loaded));
broken.world.reserve.chapterRescue.version = 1;
broken.world.reserve.progression.totalActions = 40;
const otherId = broken.world.reserve.chapterRescue.captive.find((id) => id !== target.speciesId);
broken.world.reserve.chapterRescue.animals[otherId].status = 'rescued';
delete broken.world.reserve.chapterRescue.animals[otherId].rescuedAt;
const inventoryBefore = JSON.stringify(broken.world.reserve.inventory);
stored = broken;
loaded = loadState();
assert.strictEqual(loaded.world.reserve.chapterRescue.animals[otherId].status, 'captive');
assert.strictEqual(loaded.world.reserve.chapterRescue.animals[target.speciesId].status, 'rescued');
assert.strictEqual(JSON.stringify(loaded.world.reserve.inventory), inventoryBefore);
saveState(loaded);
assert.strictEqual(loadState().world.reserve.chapterRescue.animals[otherId].status, 'captive');
const legacy = JSON.parse(JSON.stringify(loaded.world.reserve));
delete legacy.chapterRescue;
assert(nextRescueTask(normalizeReserve(legacy), 1), 'played legacy saves need pending rescues');
const next = normalizeChapterRescue(loaded.world.reserve, 2);
assert(next.captive.some(id => next.animals[id].status === 'captive'), 'new chapters must not default to rescued');

const game = Object.create(Game.prototype);
game.state = loaded;
game.render = () => {};
game.toast = () => {};
game.screen = 'role';
game.scrollY = 0;
game.activeTaskLock = { id: 'other', kind: 'patrol' };
game.openChapterRescueTask(otherId);
assert(!game.infoDetailModal, 'rescue cannot interrupt another task');
game.openMaterialExploration(RESCUE_ITEM_CATALOG[0].id);
assert(!game.infoDetailModal, 'item collection cannot interrupt another task');
game.activeTaskLock = null;
normalizeChapterRescue(loaded.world.reserve, 1);
game.openChapterRescueTask(otherId);
assert.strictEqual(game.infoDetailModal.kind, 'chapterRescueTask');
assert.strictEqual(game.activeTaskLock.animalId, otherId);
console.log('chapter rescue restart check ok: new/legacy/v1 saves, six inventories, real completion, chapter change, task exclusion');

function context() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, { get(obj, key) {
    if (key === 'measureText') return value => ({ width: String(value).length * 7 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
    return obj[key] || (() => {});
  }, set(obj, key, value) { obj[key] = value; return true; } });
}
Object.assign(global.wx, {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: context }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onAppShow() {}, onAppHide() {}, onKeyboardConfirm() {}, showToast() {}
});
stored = null;
const integration = new Game();
integration.state = createCharacter(null, '解救流程测试');
integration.render = () => {};
integration.requestRender = () => {};
integration.playSfx = () => {};
integration.playSettlementSfx = () => {};
integration.setScreen = (screen) => { integration.screen = screen; };
integration.screen = 'role';
const first = nextRescueTask(integration.state.world.reserve, 1);
integration.openChapterRescueTask(first.speciesId);
integration.infoDetailModal.action();
assert.strictEqual(integration.infoDetailModal.targetId, first.requiredItems[0], 'primary action must open missing item exploration');
integration.executeMaterialExploration(first.requiredItems[0], 6);
assert.strictEqual(rescueItemCount(integration.state.world.reserve, first.requiredItems[0]), 0, 'one arrow must not bypass cumulative collection');
while (!rescueItemCount(integration.state.world.reserve, first.requiredItems[0])) {
  const score = integration.state.world.reserve.materialExplorationProgress[first.requiredItems[0]];
  integration.executeMaterialExploration(first.requiredItems[0], 6);
  assert(integration.state.world.reserve.materialExplorationProgress[first.requiredItems[0]] > score, 'each arrow must advance collection');
}
assert(rescueItemCount(integration.state.world.reserve, first.requiredItems[0]) > 0, 'actual exploration handler must credit rescue inventory');
const restarted = loadState();
assert(rescueItemCount(restarted.world.reserve, first.requiredItems[0]) > 0, 'actual exploration reward must survive restart');
integration.state = restarted;
integration.settlementModal = null;
integration.activeTaskLock = null;
integration.openChapterRescueTask(first.speciesId);
assert(integration.infoDetailModal.rescueReady);
integration.infoDetailModal.action();
assert.strictEqual(integration.infoDetailModal, null, '解救确认后应直接回到沙盘');
assert.strictEqual(integration.screen, 'home', '解救确认后应进入沙盘');
assert(integration.mapConsequencePulse, '解救确认后应显示沙盘动画');
assert(loadState().world.reserve.chapterRescue.animals[first.speciesId].rescuedAt > 0);
for (const width of [320, 375, 430]) {
  integration.width = width;
  integration.hitAreas = [];
  integration.drawRescueSupplies(context(), 12, 126, width - 24, restarted.world.reserve);
  const panel = integration.renderedRescueSupplies;
  // 完成当前章节后，解救物资引导卡应消失；未完成时继续检查六张物品卡。
  if (!panel) continue;
  assert.strictEqual(panel.cards.length, 6);
  for (const card of panel.cards) {
    assert(card.x >= panel.x && card.x + card.w <= panel.x + panel.w);
    assert(card.y + card.h <= panel.y + panel.h);
  }
  assert.strictEqual(integration.hitAreas.length, 7, 'six full item cards and one rescue entry');
}
integration.width=375;
integration.scrollY=0;
integration.mapViewport={x:0,y:0,w:375,h:600};
integration.drawChapterRescueMarkers(context(), {x:0,y:0,w:375,h:600,worldX:0,worldY:0,worldW:375,worldH:600,scale:1});
assert.strictEqual(integration.renderedRescueMapMarkers.length, 0, 'completed chapter 1 target must disappear; legacy captive metadata must not create another task');
integration.state.world.reserve.progression.stage = 2;
integration.state.world.reserve.progression.displayChapter = 2;
const nextTarget = nextRescueTask(integration.state.world.reserve, 2);
assert(nextTarget, 'the next chapter must expose a new rescue target');
nextTarget.map = { x: .5, y: .5 };
integration.drawChapterRescueMarkers(context(), {x:0,y:0,w:375,h:600,worldX:0,worldY:0,worldW:375,worldH:600,scale:1});
assert(integration.renderedRescueMapMarkers.some(marker => marker.targetId === nextTarget.targetId), 'next chapter captive animal must be drawn on sandbox');
console.log('chapter rescue integration check ok: click missing item → real exploration → restart → rescue → persistent completion; visible category and sandbox marker');
