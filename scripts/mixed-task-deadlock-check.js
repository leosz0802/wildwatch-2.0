'use strict';
const assert = require('node:assert/strict');
let stored;
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ getContext: () => null }),
  getStorageSync: () => stored && JSON.parse(JSON.stringify(stored)),
  setStorageSync: (_key, value) => { stored = JSON.parse(JSON.stringify(value)); },
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {}, onKeyboardConfirm() {}
};
const { Game } = require('../js/game');
const { createCharacter, saveState, loadState } = require('../js/storage');
const { updateReserveEmergency } = require('../js/simulator');
const { worldEventDefinition } = require('../js/worldEventSystem');
const { realNatureTriggerType } = require('../js/realNatureEventSystem');
const { nextRescueTask, createPoacherRescue, findRecord, rescueItemCountFor } = require('../js/chapterRescueSystem');
const { explorationTargetScore, explorationGoodById } = require('../js/materialExploration');
const originalRandom = Math.random;
let randomState = 20260914;
Math.random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 0x100000000;
};

function make() {
  stored = null;
  const game = new Game(); game.stopLoop();
  game.state = createCharacter(null, '交叉任务死锁回归');
  game.state.world.reserve.fund = 10000;
  game.state.world.reserve.progression.activeSeconds = (((game.state.world.reserve.progression.chapterStart || {}).activeSeconds) || 0) + 30;
  game.screen = 'home';
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = () => {};
  game.setScreen = screen => { game.screen = screen; };
  game.openNextSandboxEvent = game.openQueuedMissionPush = () => false;
  // Skip only optional presentation/advertising after settlement, not lock
  // release, persistence, point calculation, inventory or task dispatch.
  game.continueAfterSettlement = () => game.setScreen('home');
  game.interstitialAds = null;
  game.animateInlineDiceRoll = (_modal, _roll, _token, done) => done();
  return game;
}
function record(game, id) {
  const reserve = game.state.world.reserve;
  return id.startsWith('poacher:')
    ? reserve.poacherRescue.active.find(item => item.targetId === id)
    : findRecord(reserve.chapterRescue, id);
}
function shot(game, id, roll) {
  assert(game.openChapterRescueTask(id));
  assert(!game.infoDetailModal.rescueReady, 'unfinished task must not steal another task\'s item');
  game.infoDetailModal.action();
  assert.equal(game.infoDetailModal.kind, 'materialExploration');
  game.executeMaterialExploration(game.infoDetailModal.targetId, roll);
  game.finishSettlement('home');
  assert.equal(game.activeTaskLock, null, 'closing settlement must release ownership');
}
function restart(game) {
  saveState(game.state); game.state = loadState();
}
function interruptWithEvent(game, type, index) {
  const reserve = game.state.world.reserve;
  const before = JSON.stringify([reserve.chapterRescue, reserve.poacherRescue]);
  const definition = type ? worldEventDefinition(type) : null;
  if (!definition || !Array.isArray(definition.responses) || !definition.responses.length) return;
  const id = `mixed_${type}_${index}`;
  reserve.emergency.active = Object.assign({}, definition, { id, type, progress: 0, daysRemaining: definition.days });
  if (type === 'visitor_conflict') {
    reserve.development.operations.today.trouble = '游客越线';
    assert(game.openVisitorIncidentDice({ type: 'visitorIncident', id }));
    game.archeryScoreFor = () => index % 2 ? 2 : 4;
    const outcome = game.resolveVisitorIncidentDice();
    assert(['resolved', 'failed'].includes(outcome.kind));
    game.dismissInfoDetailModal();
    assert(!game.openVisitorIncidentDice({ type: 'visitorIncident', id }), 'completed event must not reopen');
  } else {
    // Both response routes must terminate, including the slower alternative.
    const action = definition.responses[index % definition.responses.length].action;
    for (let attempt = 0; attempt < 6 && reserve.emergency.active && reserve.emergency.active.id === id; attempt++) {
      updateReserveEmergency(reserve, action, { name: type === 'wildfire' ? '旱季' : '雨季' });
    }
  }
  const after = game.state.world.reserve;
  assert(!after.emergency.active || after.emergency.active.id !== id, `${type} never terminated`);
  assert.equal(JSON.stringify([after.chapterRescue, after.poacherRescue]), before, `${type} changed rescue records`);
}

let shots = 0, interruptions = 0;
for (const order of [[0, 1], [1, 0]]) {
  for (const completedBeforeSwitch of [false, true]) {
    const game = make();
    const chapter = nextRescueTask(game.state.world.reserve, 1);
    const item = chapter.requiredItems[0];
    const chapterId = chapter.targetId;
    const required = explorationTargetScore(explorationGoodById(item));
    const initialShots = completedBeforeSwitch ? Math.ceil(required / 4) : 1;
    for (let i = 0; i < initialShots; i++) { shot(game, chapterId, 4); shots++; }
    const poacher = createPoacherRescue(game.state.world.reserve, 'deer', 1, 2);
    assert.equal(poacher.requiredItems[0], item, 'fixture must exercise the shared material');
    assert(game.openChapterRescueTask(poacher.targetId));
    assert.equal(game.infoDetailModal.rescueReady, false, 'fresh poacher task must start incomplete');
    assert(game.infoDetailModal.items[0].title.includes('点数 0/10'));
    game.dismissInfoDetailModal();
    const ids = [chapterId, poacher.targetId];
    for (const choice of order) {
      const id = ids[choice];
      for (let attempt = 0; attempt < 24 && !rescueItemCountFor(game.state.world.reserve, record(game, id), item); attempt++) {
        shot(game, id, [1, 4, 2, 6][attempt % 4]); shots++;
        const realEventType = realNatureTriggerType(game.state.world.reserve, Date.UTC(2026, 8, 19 + attempt));
        interruptWithEvent(game, ['visitor_conflict', realEventType, 'neighbor_water', realEventType][attempt % 4], attempt);
        interruptions++;
        restart(game);
      }
      assert(rescueItemCountFor(game.state.world.reserve, record(game, id), item), `${id} failed to finish within 24 shots`);
      assert(game.openChapterRescueTask(id));
      assert(game.infoDetailModal.rescueReady);
      assert(game.completeChapterRescue(id));
      assert(!game.completeChapterRescue(id), 'completed rescue must settle once');
      game.infoDetailModal = null;
      restart(game);
    }
    assert.equal(record(game, chapterId).status, 'rescued');
    assert.equal(game.state.world.reserve.poacherRescue.active.length, 0);
    assert.equal(game.state.world.reserve.poacherRescue.history.length, 1);
  }
}
// Recover the existing stuck save: points complete, shared item already spent
// by a different rescue. The player must not need to delete their save.
{
  const game = make();
  const target = nextRescueTask(game.state.world.reserve, 1);
  const item = target.requiredItems[0];
  target.pointProgress = { [item]: explorationTargetScore(explorationGoodById(item)) };
  game.state.world.reserve.inventory.rescueItems = {};
  restart(game);
  assert(game.openChapterRescueTask(target.targetId));
  assert(game.infoDetailModal.rescueReady, 'a verified completed record must recover from legacy inventory theft');
  assert(game.completeChapterRescue(target.targetId));
}
Math.random = originalRandom;
console.log(`mixed task deadlock check ok: 4 completion orders, ${shots} arrows, ${interruptions} visitor/disaster interruptions, restart after interruptions, independent materials, old-save recovery, bounded completion`);
