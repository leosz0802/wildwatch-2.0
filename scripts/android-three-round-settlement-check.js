'use strict';

const assert = require('node:assert/strict');

// Regression scenario for Android/Harmony compatibility layers:
// one uninterrupted session, three rescue archery shots and three collection
// dice rolls. Every round must stop at the visible confirmation page; only the
// user's confirm tap may commit the round and release the modal flow.
let stored = {};
const handlers = {};
const context = new Proxy({ font: '12px sans-serif', canvas: { width: 1125, height: 2001 } }, {
  get(target, key) {
    if (key === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return target[key] || (() => {});
  },
  set(target, key, value) { target[key] = value; return true; }
});

global.requestAnimationFrame = undefined;
global.cancelAnimationFrame = undefined;
global.wx = {
  getSystemInfoSync: () => ({ platform: 'android', brand: 'vivo', system: 'Android 14', windowWidth: 375, windowHeight: 667, pixelRatio: 3 }),
  createCanvas: () => ({ width: 1125, height: 2001, getContext: () => context }),
  onTouchStart(handler) { handlers.start = handler; },
  onTouchMove(handler) { handlers.move = handler; },
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel(handler) { handlers.cancel = handler; },
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {},
  getStorageSync: (key) => stored[key] && JSON.parse(JSON.stringify(stored[key])),
  setStorageSync: (key, value) => { stored[key] = JSON.parse(JSON.stringify(value)); }
};

const { Game } = require('../js/game');
const { createCharacter, saveState } = require('../js/storage');
const { nextRescueTask } = require('../js/chapterRescueSystem');

function quiet(game) {
  game.stopLoop();
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = game.toast = () => {};
  game.setScreen = (screen) => { game.screen = screen; };
  game.screen = 'home';
  game.width = 375;
  game.height = 667;
  game.dpr = 3;
  game.ctx = context;
  return game;
}

function drawModal(game) {
  game.hitAreas = [];
  game.drawInfoDetailModal();
  return game.infoDetailModal;
}

function tapHit(game, hit, label) {
  if (hit && typeof hit.onTap !== 'function') {
    hit = game.hitAreas.slice().reverse().find((candidate) => candidate && typeof candidate.onTap === 'function'
      && candidate.x < hit.x + hit.w && candidate.x + candidate.w > hit.x
      && candidate.y < hit.y + hit.h && candidate.y + candidate.h > hit.y);
  }
  assert(hit && typeof hit.onTap === 'function', `${label} must expose a tappable hit area`);
  const x = hit.x + hit.w / 2;
  const y = hit.y + hit.h / 2;
  handlers.start({ changedTouches: [{ clientX: x, clientY: y }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: x, clientY: y }] });
}

function hitByText(game, text) {
  return game.hitAreas.slice().reverse().find((hit) => hit && hit.hud && hit.label === text)
    || game.hitAreas.slice().reverse().find((hit) => hit && hit.hud && hit.onTap && hit.y > game.height * .45);
}

function confirmSettlementAndClose(game, label) {
  const modal = drawModal(game);
  assert.equal(game.waitingArcheryOrDiceConfirm(modal), true, `${label} must stop at confirmation`);
  assert.equal(modal.diceMotion, null, `${label} dice/arrow motion must stop before confirmation`);
  const confirm = modal.renderedArcheryFireButton || hitByText(game, '确认得分');
  tapHit(game, confirm, `${label} confirm`);
  assert.equal(game.waitingArcheryOrDiceConfirm(), false, `${label} confirm must leave confirmation phase`);
  assert.equal(game.pendingArcheryShot(), null, `${label} confirm must consume pending shot`);
  if (game.settlementModal) game.finishSettlement('home');
  assert.equal(game.settlementModal, null, `${label} must not leave a settlement overlay`);
  // A fresh Android account may receive the unrelated onboarding guide after
  // the first settlement. Dismiss that guide so the next round tests the same
  // task path instead of treating onboarding as a settlement lock.
  if (game.infoDetailModal && ['onboardingGuide', 'ecologyNarrativeDecision', 'guardianPromise'].includes(game.infoDetailModal.kind)) game.dismissInfoDetailModal();
  if (game.infoDetailModal && game.infoDetailModal.completionTask && typeof game.infoDetailModal.action === 'function') {
    game.infoDetailModal.action();
  }
  assert.equal(game.infoDetailModal, null, `${label} must release the input modal`);
}

function runArcheryRounds(game) {
  const rescue = nextRescueTask(game.state.world.reserve, 1);
  const itemId = rescue.requiredItems[0];
  const aims = [0.5, 0.1, 0.9]; // 6 + 2 + 2 = 10/12
  let total = 0;
  aims.forEach((aim, index) => {
    assert.equal(game.openChapterRescueTask(rescue.targetId), true, `archery round ${index + 1} task must open`);
    const task = game.infoDetailModal;
    const entry = (task.items || []).find((item) => String(item.title || '').includes(itemId)) || task.items[0];
    assert(entry && typeof entry.action === 'function', `archery round ${index + 1} item must be actionable`);
    entry.action();
    const modal = game.infoDetailModal;
    assert.equal(modal.kind, 'materialExploration', `archery round ${index + 1} must open archery`);
    modal.archeryAimValue = aim;
    const expected = game.archeryScoreFor(modal);
    drawModal(game);
    tapHit(game, modal.renderedArcheryFireButton, `archery round ${index + 1} fire`);
    // Fire resolves synchronously, but the test still goes through the real
    // draw-and-touch path for the confirmation button.
    confirmSettlementAndClose(game, `archery round ${index + 1}`);
    total = Math.min(12, total + expected);
    assert.equal(game.rescueRecordFor(rescue.targetId).pointProgress[itemId], total, `archery round ${index + 1} ledger`);
    assert.equal((game.state.world.reserve.archeryHistory || []).slice(-1)[0].score, expected, `archery round ${index + 1} history`);
  });
  assert.equal(game.state.world.reserve.lastRescueShot.totalScore, total, 'three archery rounds must keep cumulative total');
  assert.deepEqual((game.state.world.reserve.archeryHistory || []).slice(-3).map((item) => item.score), [6, 2, 2], 'three archery scores must remain distinct');
}

function runDiceRounds(game) {
  game.state.world.collection.investigation.charges = 3;
  game.state.world.collection.leads = [1, 2, 3].map((index) => ({
    id: `android_three_dice_${index}`,
    caseId: 'case_1',
    quality: 1,
    sourceAction: 'houndScout',
    sourceLabel: '猎犬侦察',
    animal: { id: 'npc_deer', name: '晨角', trust: 72 },
    title: `连续掷骰线索 ${index}`,
    clue: '水边出现一条待调查的旧路线。'
  }));
  const oldRandom = Math.random;
  Math.random = () => .999; // deterministic face 6, covering the reported 6-point freeze
  try {
    [1, 2, 3].forEach((index) => {
      const leadId = `android_three_dice_${index}`;
      game.openCollectionInvestigation(leadId);
      game.selectCollectionMethod('field');
      game.confirmCollectionInvestigation();
      assert.equal(game.infoDetailModal.kind, 'collectionDice', `dice round ${index} must open dice`);
      const modal = game.infoDetailModal;
      drawModal(game);
      tapHit(game, modal.renderedArcheryFireButton, `dice round ${index} fire`);
      confirmSettlementAndClose(game, `dice round ${index}`);
      const liveCollection = game.state.world.collection;
      assert.equal(liveCollection.investigation.pending, null, `dice round ${index} pending investigation must clear`);
      assert.equal(liveCollection.investigation.charges, 3 - index, `dice round ${index} charge must be consumed once`);
    });
  } finally {
    Math.random = oldRandom;
  }
  assert.equal(game.state.world.collection.investigation.pending, null, 'three dice rounds must not leave a stale pending investigation');
  assert.equal(game.infoDetailModal, null, 'third dice round must return to the sandbox flow');
}

stored = {};
const game = quiet(new Game());
game.state = createCharacter(null, 'Android 连续三轮结算');
saveState(game.state);
runArcheryRounds(game);
runDiceRounds(game);
saveState(game.state);

console.log('android three-round settlement check ok: 3 archery + 3 dice rounds, real touch handlers, no stale overlay/pending lock');
