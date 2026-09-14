'use strict';
const assert = require('node:assert/strict');
const gradient = { addColorStop() {} };
const ctx = new Proxy({}, { get(o, k) {
  if (k === 'measureText') return text => ({ width: String(text).length * 6 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient;
  return o[k] || (() => {});
}, set(o, k, v) { o[k] = v; return true; } });
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 1 }),
  createCanvas: () => ({ getContext: () => ctx }),
  getStorageSync: () => null, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {}, onKeyboardConfirm() {}, showToast() {}
};
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { createPoacherRescue, nextRescueTask, addRescueItem } = require('../js/chapterRescueSystem');
function make(width = 375) {
  const g = new Game(); g.stopLoop();
  g.state = createCharacter(null, '每日解救点击回归');
  g.width = width; g.height = 812; g.dpr = 1; g.screen = 'home'; g.scrollY = 0;
  g.audio = null; g.messages = []; g.toast = text => g.messages.push(text);
  g.playSfx = () => {};
  g.openNextSandboxEvent = g.openQueuedMissionPush = () => false;
  g.setScreen = screen => { g.screen = screen; return true; };
  g.setMapConsequencePulse = () => {};
  g.buttons = [];
  const button = g.modalButton;
  g.modalButton = function(c, x, y, w, h, label, ...args) {
    this.buttons.push({ x, y, w, h, label });
    return button.call(this, c, x, y, w, h, label, ...args);
  };
  g.render = function renderModalForTest() {
    this.hitAreas = []; this.buttons = [];
    this.addHit(0, 0, this.width, this.height, () => this.messages.push('BACKGROUND HIT'));
    this.drawInfoDetailModal();
  };
  const target = createPoacherRescue(g.state.world.reserve, 'deer', 1, 2);
  return { g, target };
}
function tapButton(g, label) {
  const b = g.buttons.find(item => item.label === label);
  assert(b, `missing rendered button: ${label}`);
  g.handleTap(b.x + b.w / 2, b.y + b.h / 2);
}
let failed = 0;
function check(name, run) {
  try { run(); console.log('PASS ' + name); }
  catch (err) { failed++; console.error('FAIL ' + name + ': ' + err.message); }
}
for (const width of [320, 375, 430]) {
  check(`recurring rescue primary button, width=${width}`, () => {
    const { g, target } = make(width);
    g.openChapterRescueTask(target.targetId);
    tapButton(g, '继续收集');
    assert.equal(g.infoDetailModal.kind, 'materialExploration');
    assert.equal(g.infoDetailModal.targetId, target.requiredItems[0]);
    assert.equal(g.activeTaskLock.targetId, target.targetId);
    assert.deepEqual(g.messages, []);
  });
  check(`recurring rescue material-card hit, width=${width}`, () => {
    const { g, target } = make(width);
    g.openChapterRescueTask(target.targetId);
    const card = g.hitAreas.find(h => h.h === 44 && h.w === width - 100);
    assert(card, 'real material card hit must exist');
    g.handleTap(card.x + card.w / 2, card.y + card.h / 2);
    assert.equal(g.infoDetailModal.kind, 'materialExploration');
    assert.deepEqual(g.messages, []);
  });
}
check('real goal-card tap reports successful open', () => {
  const { g, target } = make();
  g.sandboxGoalBarData = () => ({ chapter: 1, chapterTitle: '任务', title: '盗猎者困住鹿', progressText: '进行中', action: '前往沙盘解救', goal: { id: 'poacher-rescue:' + target.targetId, recommendedAction: 'rescueAnimal', animalId: target.targetId } });
  g.hitAreas = []; g.drawSandboxGoalBar(ctx, { x: 0, y: 100, w: 375, h: 640 });
  const hit = g.hitAreas[0]; g.handleTap(hit.x + hit.w / 2, hit.y + hit.h / 2);
  assert.equal(g.infoDetailModal.kind, 'chapterRescueTask');
  assert.deepEqual(g.messages, [], 'opening a task must not display target-updated error');
});
check('same task accepts canonical/species aliases; second task is blocked', () => {
  const { g, target } = make();
  assert.equal(g.openChapterRescueTask(target.targetId), true);
  assert.equal(g.openChapterRescueTask(target.speciesId), true);
  const chapter = nextRescueTask(g.state.world.reserve, 1);
  const current = g.infoDetailModal;
  assert.equal(g.openChapterRescueTask(chapter.targetId), false);
  assert.equal(g.infoDetailModal, current);
  assert.equal(g.activeTaskLock.targetId, target.targetId);
});
check('restart then continue recurring collection', () => {
  const { g, target } = make();
  g.state = JSON.parse(JSON.stringify(g.state)); g.activeTaskLock = null;
  g.openChapterRescueTask(target.targetId);
  tapButton(g, '继续收集');
  assert.equal(g.infoDetailModal.kind, 'materialExploration');
  assert.equal(g.activeTaskLock.targetId, target.targetId);
});
check('recurring completion accepts map species ID and settles once', () => {
  const { g, target } = make();
  target.requiredItems.forEach(id => addRescueItem(g.state.world.reserve, id));
  g.openChapterRescueTask(target.targetId);
  assert.equal(g.completeChapterRescue(target.speciesId), true);
  const after = JSON.stringify(g.state);
  assert.equal(g.completeChapterRescue(target.targetId), false);
  assert.equal(JSON.stringify(g.state), after);
});
process.exitCode = failed ? 1 : 0;
