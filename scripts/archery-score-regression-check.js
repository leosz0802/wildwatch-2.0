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
  let previous = 0;
  for (let shot = 1; shot <= 3; shot += 1) {
    assert.equal(game.infoDetailModal.kind, 'materialExploration');
    game.infoDetailModal.archeryAimValue = shot === 1 ? 0.5 : shot === 2 ? 0.1 : 0.9;
    const expectedRoll = game.archeryScoreFor(game.infoDetailModal);
    game.infoDetailModal.action();
    const result = game.state.world.reserve.lastMaterialExploration;
    assert(result && result.targetId === itemId, `shot ${shot}: result must identify the selected rescue item`);
    assert.equal(Number(result.roll), expectedRoll, `shot ${shot}: simulator must record the same 1–6 score the player just shot`);
    const record = game.state.world.reserve.chapterRescue.animals[target.targetId];
    const progress = record.pointProgress[itemId];
    const expectedTotal = Math.min(12, previous + expectedRoll);
    assert.equal(progress, expectedTotal, `shot ${shot}: animal ledger ${progress} must equal capped sum ${expectedTotal}`);
    assert.equal(game.state.world.reserve.materialExplorationProgress[itemId], expectedTotal, `shot ${shot}: mirrored progress map drifted`);
    const lastShot = (record.pointHistory || []).slice(-1)[0];
    assert(lastShot, `shot ${shot}: point history must be written`);
    assert.equal(lastShot.shotScore, expectedRoll, `shot ${shot}: history shotScore must match the live roll`);
    assert.equal(lastShot.totalScore, expectedTotal, `shot ${shot}: history totalScore must match the ledger`);
    previous = progress;
    if (shot < 3) game.openMaterialExploration(itemId);
  }
  const finalRecord = game.state.world.reserve.chapterRescue.animals[target.targetId];
  assert.equal(finalRecord.pointTarget, 12);
  assert.equal(finalRecord.pointProgress[itemId], previous);
  assert(finalRecord.pointProgress[itemId] > 0 && finalRecord.pointProgress[itemId] <= 12);
} finally {
  global.setTimeout = originalTimeout;
}
console.log('archery score regression check ok: modal action resolves 1–6 score and advances the animal-owned ledger');
