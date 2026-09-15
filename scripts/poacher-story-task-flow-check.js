const assert = require('node:assert/strict');
let stored;
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ getContext: () => null }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {}, onKeyboardConfirm() {},
  getStorageSync: () => stored && JSON.parse(JSON.stringify(stored)),
  setStorageSync: (_key, value) => { stored = JSON.parse(JSON.stringify(value)); }
};
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { createPoacherRescue, nextPoacherRescue } = require('../js/chapterRescueSystem');

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, '盗猎剧情卡任务区回归');
game.render = game.requestRender = game.playSfx = game.playSettlementSfx = () => {};
game.screen = 'home';
const reserve = game.state.world.reserve;
const record = createPoacherRescue(reserve, 'deer', 1, 2);
assert(record, 'should create a poacher incident');
assert.equal(record.taskVisible, false, 'new incident starts as story-only');

assert.equal(game.openPendingPoacherRescueEvent(), true);
assert.equal(game.infoDetailModal.kind, 'poacherEventNotice');
game.infoDetailModal.action();
assert.equal(game.infoDetailModal.kind, 'poacherStoryCard', 'event notice must lead to story card first');
assert.equal(record.taskVisible, false, 'story card must not publish the task yet');
assert.equal(nextPoacherRescue(reserve), null, 'story-only incident must stay out of task area');

game.infoDetailModal.action();
assert.equal(game.infoDetailModal, null, 'joining task area closes story card');
assert.equal(record.taskVisible, true);
assert.equal(nextPoacherRescue(reserve).targetId, record.targetId);
assert.equal(reserve.poacherRescue.pendingEvent, null);

console.log('poacher story → task flow check ok: notice, story card, explicit task publication, restart-safe state');
