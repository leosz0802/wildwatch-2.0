'use strict';

const assert = require('node:assert/strict');

// Keep the inline animation on its deterministic headless path. This covers
// the same callback ordering used by the runtime when a Harmony/Android
// adapter finishes the arrow without a stable RAF callback.
global.wx = {
  getSystemInfoSync: () => ({ platform: 'ohos', windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => null }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { worldEventDefinition } = require('../js/worldEventSystem');

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.render = game.requestRender = game.playSfx = game.playArcheryImpact = game.toast = () => {};
  game.state = createCharacter(null, '非解救射箭结算');
  game.screen = 'home';
  game.infoDetailModal = null;
  return game;
}

function assertStableResult(game, label) {
  assert.equal(game.infoDetailModal.phase, 'resolved', `${label}必须停在确认得分`);
  assert.ok(game.infoDetailModal.result, `${label}必须保留结算结果`);
  assert.equal(game.waitingArcheryOrDiceConfirm(), true, `${label}必须等待按下确认`);
  assert.equal(game.shouldAbsorbArcheryFollowup(Date.now()), false, `${label}确认按钮不能被落靶吸收锁死`);
  assert.equal(game.confirmResolvedArcheryOrDice(), true, `${label}确认得分必须有效`);
  if (game.infoDetailModal && typeof game.infoDetailModal.action === 'function') {
    game.infoDetailModal.action();
  }
  assert.equal(game.infoDetailModal, null, `${label}确认后可以关闭`);
}

// 恶劣自然事件：非解救射箭直接更新生态伤害并展示结果卡。
const harsh = makeGame();
harsh.openHarshNatureArchery({
  id: 'non_rescue_wildfire', eventType: 'wildfire', type: 'crisis',
  title: '林缘火情', label: '林缘火情', recommendAction: 'harshNature'
});
harsh.infoDetailModal.archeryAimValue = 0.5;
const harshBefore = harsh.state.world.reserve.ecology.grass;
harsh.resolveHarshNatureArchery();
assertStableResult(harsh, '恶劣自然射箭');
assert.ok(harsh.state.world.reserve.ecology.grass < harshBefore, '恶劣自然射箭必须先完成生态结算');

// 邻区事件：非解救射箭也必须经过同一结果锁，不得因重复 touch 直接回地图。
const neighbor = makeGame();
const reserve = neighbor.state.world.reserve;
const definition = worldEventDefinition('neighbor_exchange');
reserve.emergency.active = {
  id: 'non_rescue_neighbor', type: 'neighbor_exchange', title: definition.title,
  regionId: 'center', visualKind: 'neighbor-exchange', recommendedAction: 'neighborExchange',
  progress: 0, target: 1, daysRemaining: 1, responses: definition.responses
};
neighbor.openNeighborEventDice({ eventType: 'neighbor_exchange', recommendAction: 'neighborExchange' });
neighbor.infoDetailModal.archeryAimValue = 0.5;
neighbor.resolveNeighborEventDice();
assertStableResult(neighbor, '邻区射箭');
assert.equal(reserve.emergency.active, null, '邻区射箭结果必须清除已处理事件');

console.log('non-rescue archery result check ok: result cards stay visible and settle once');
