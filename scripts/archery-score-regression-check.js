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
    if (game.waitingArcheryOrDiceConfirm()) game.confirmArcheryScore();
    const result = game.state.world.reserve.lastMaterialExploration;
    assert(result && result.targetId === itemId, `shot ${shot}: result must identify the selected rescue item`);
    assert.equal(Number(result.roll), expectedRoll, `shot ${shot}: simulator must record the same 1–6 score the player just shot`);
    const shotLedger = game.state.world.reserve.lastArcheryShot;
    assert(shotLedger && shotLedger.targetId === itemId, `shot ${shot}: explicit archery ledger must identify the selected item`);
    assert.equal(shotLedger.score, expectedRoll, `shot ${shot}: explicit archery ledger must keep the landed score`);
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
    if (shot < 3) {
      if (game.settlementModal) game.finishSettlement('home');
      game.openMaterialExploration(itemId);
    }
  }
  const finalRecord = game.state.world.reserve.chapterRescue.animals[target.targetId];
  assert.equal(finalRecord.pointTarget, 12);
  assert.equal(finalRecord.pointProgress[itemId], previous);
  assert(finalRecord.pointProgress[itemId] > 0 && finalRecord.pointProgress[itemId] <= 12);
} finally {
  global.setTimeout = originalTimeout;
}
{
  const live = new Game();
  live.stopLoop();
  live.state = createCharacter(null, '发射即入账');
  live.render = live.requestRender = live.playSfx = live.playSettlementSfx = () => {};
  live.setScreen = (screen) => { live.screen = screen; };
  live.screen = 'home';
  const rescue = nextRescueTask(live.state.world.reserve, 1);
  const item = rescue.requiredItems[0];
  live.activeTaskLock = { kind: 'chapterRescue', targetId: rescue.targetId };
  live.openMaterialExploration(item);
  live.infoDetailModal.archeryAimValue = 0.5;
  const expected = live.archeryScoreFor(live.infoDetailModal);
  const originalTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  try {
    live.rollMaterialExplorationDice(item);
    assert.equal(live.infoDetailModal.resultScore, expected, 'the fired score must stay on the modal');
    assert.equal(live.rescueRecordFor(rescue.targetId).pointProgress[item] || 0, 0, 'animation must not write the ledger before settlement');
    live.recoverStuckMaterialExploration(Date.now(), true);
    assert.equal(live.waitingArcheryOrDiceConfirm(), true, 'stuck flight must land on 确认得分');
    assert.equal(live.infoDetailModal.resultScore, expected, 'stuck flight must keep the landed score');
    assert.equal(live.confirmArcheryScore(), true, '确认得分 must commit the stuck flight');
    assert.equal(live.rescueRecordFor(rescue.targetId).pointProgress[item], expected, 'stuck flight must settle the same 1–6 score');
    assert.equal(live.state.world.reserve.lastArcheryShot.score, expected, 'stuck flight must still persist the landed score');
  } finally {
    global.setTimeout = originalTimeout;
  }
}

console.log('archery score regression check ok: modal action resolves 1–6 score and advances the animal-owned ledger');
