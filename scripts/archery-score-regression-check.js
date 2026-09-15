const assert = require('node:assert/strict');
let stored;
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ getContext: () => null }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {}, onKeyboardConfirm() {},
  getStorageSync: () => stored && JSON.parse(JSON.stringify(stored)),
  setStorageSync: (_key, state) => { stored = JSON.parse(JSON.stringify(state)); }
};
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { nextRescueTask } = require('../js/chapterRescueSystem');

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, '弓箭得分回归');
game.render = game.requestRender = game.playSfx = game.playSettlementSfx = () => {};
game.setScreen = (screen) => { game.screen = screen; };
game.screen = 'home';
const target = nextRescueTask(game.state.world.reserve, 1);
const itemId = target.requiredItems[0];
assert(game.openChapterRescueTask(target.targetId));
assert.equal(game.infoDetailModal.actionLabel, '继续收集');
game.infoDetailModal.action();

// Run the real modal action, but collapse animation timers so this regression
// test can exercise the complete button -> score -> simulator path quickly.
const originalTimeout = global.setTimeout;
global.setTimeout = (fn) => { fn(); return 0; };
try {
  for (let shot = 1; shot <= 3; shot += 1) {
    assert.equal(game.infoDetailModal.kind, 'materialExploration');
    game.infoDetailModal.archeryAimValue = shot === 1 ? 0.5 : shot === 2 ? 0.1 : 0.9;
    game.infoDetailModal.action();
    const result = game.state.world.reserve.lastMaterialExploration;
    assert(result && result.targetId === itemId, `shot ${shot}: result must identify the selected rescue item`);
    assert(Number(result.roll) >= 1 && Number(result.roll) <= 6, `shot ${shot}: arrow result must be a 1–6 score`);
    const progress = game.state.world.reserve.chapterRescue.animals[target.targetId].pointProgress[itemId];
    assert(progress > 0, `shot ${shot}: cumulative rescue points must advance`);
    if (shot < 3) game.openMaterialExploration(itemId);
  }
  const finalRecord = game.state.world.reserve.chapterRescue.animals[target.targetId];
  assert.equal(finalRecord.pointTarget, 15);
  assert(finalRecord.pointProgress[itemId] > 0 && finalRecord.pointProgress[itemId] <= 15);
} finally {
  global.setTimeout = originalTimeout;
}
console.log('archery score regression check ok: modal action resolves 1–6 score and advances the animal-owned ledger');
