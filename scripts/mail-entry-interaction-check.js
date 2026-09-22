const assert = require('node:assert/strict');
const handlers = {};
const saved = new Map();
function canvasContext() {
  let depth = 0;
  const gradient = { addColorStop() {} };
  return new Proxy({ font: '12px sans-serif', globalAlpha: 1 }, {
    get(target, key) {
      if (key === 'save') return () => { depth++; };
      if (key === 'restore') return () => { assert(depth > 0, 'unbalanced canvas restore'); depth--; };
      if (key === 'depth') return depth;
      if (key === 'measureText') return text => ({ width: Array.from(String(text)).length * 6 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      return key in target ? target[key] : () => {};
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 1 }),
  createCanvas: () => ({ getContext: () => canvasContext() }),
  getStorageSync: key => saved.has(key) ? JSON.parse(JSON.stringify(saved.get(key))) : null,
  setStorageSync: (key, value) => saved.set(key, JSON.parse(JSON.stringify(value))),
  onTouchStart: fn => { handlers.start = fn; }, onTouchMove: fn => { handlers.move = fn; },
  onTouchEnd: fn => { handlers.end = fn; }, onTouchCancel: fn => { handlers.cancel = fn; },
  onKeyboardConfirm() {}, showToast() {}
};
const { Game } = require('../js/game');
const { createCharacter, saveState, loadState } = require('../js/storage');
const { CHAPTERS } = require('../js/animalWorld');
const { normalizeChapterRescue } = require('../js/chapterRescueSystem');
function make(width = 375, height = 812, chapter = 3) {
  const game = new Game(); game.stopLoop();
  game.state = createCharacter(null, '邮件点击回归');
  game.state.ui.onboarding = { completed: true, recruitmentDone: true, seen: {} };
  game.width = width; game.height = height; game.dpr = 1;
  game.screen = 'home'; game.scrollY = 0;
  Object.assign(game.state.world.reserve.progression, { stage: chapter, displayChapter: chapter, level: CHAPTERS[chapter - 1].level });
  normalizeChapterRescue(game.state.world.reserve, chapter, { fresh: true });
  game.state.world.reserve.development.operations.letters = Array.from({ length: 50 }, (_, i) => ({
    id: `mail_${i}`, day: i + 10, title: `保护区记录 ${i}`, body: '水边传来动物的叫声，巡护员记下了今天的变化。', readAt: 0
  }));
  return game;
}
function tap(game, x, y) {
  handlers.start({ touches: [{ clientX: x, clientY: y }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: x, clientY: y }] });
  assert.equal(game.gesture, null, 'tap must release gesture');
}
function close(game) {
  const modal = game.infoDetailModal, frame = modal.renderedInfoFrame;
  assert(frame, 'mail overlay must be rendered, never invisibly block map input');
  const bounds = game.infoDetailHeaderLayout(game.ctx, modal, frame.x, frame.y, frame.w).close;
  tap(game, bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
}
for (const [width, height] of [[320,568], [375,812], [430,932]]) {
  saved.clear();
  const game = make(width, height);
  const target = game.chapterRescueState().targets[0];
  assert.equal(target.speciesId, 'flamingo');
  target.pointProgress[target.requiredItems[0]] = 6;
  const rescueBefore = JSON.stringify(target);
  game.render();
  const chip = game.renderedMapVisitorCountChip;
  assert(chip.visible);
  tap(game, chip.x + 30, chip.y + 12);
  assert.equal(game.infoDetailModal.kind, 'visitorLetterInbox');
  assert(game.infoDetailModal.renderedInfoFrame);
  const inbox = game.infoDetailModal, view = inbox.renderedMemoryViewport;
  const x = view.x + 30, y = view.y + Math.min(70, view.h - 12);
  const camera = JSON.stringify(game.mapCamera);
  handlers.start({ touches: [{ clientX: x, clientY: y }] });
  assert(game.gesture.memoryTimeline, 'unified mailbox must capture its scroll gesture');
  handlers.move({ touches: [{ clientX: x, clientY: y - 55 }] });
  handlers.end({ touches: [], changedTouches: [{ clientX: x, clientY: y - 55 }] });
  assert.equal(inbox.letterScrollY, 55);
  assert.equal(JSON.stringify(game.mapCamera), camera, 'mail scroll must not pan sandbox');
  const row = inbox.renderedLetterItems.find(item => item.y >= view.y && item.y + item.h <= view.y + view.h);
  assert(row, 'a readable mail row must be reachable');
  tap(game, row.x + 30, row.y + 30);
  assert.equal(game.infoDetailModal.kind, 'visitorLetterReader');
  close(game);
  assert.equal(game.infoDetailModal.kind, 'visitorLetterInbox');
  assert(!game.infoDetailModal.letters.some(letter => letter.id === row.id), 'read mail leaves unread list');
  close(game);
  assert.equal(game.infoDetailModal, null);
  assert(game.isInsideMapViewport(width / 2, height / 2));
  assert.equal(JSON.stringify(target), rescueBefore, 'reading mail must not modify flamingo rescue points');
  for (let i = 0; i < 3; i++) { game.openReserveLetterInbox({ unreadOnly: true }); close(game); }
  game.openChapterRescueTask(target.targetId);
  assert.equal(game.infoDetailModal.kind, 'chapterRescueTask', 'rescue must still open after reading mail');
  close(game);
  saveState(game.state); game.state = loadState();
  game.openReserveLetterInbox({ unreadOnly: true });
  assert(!game.infoDetailModal.letters.some(letter => letter.id === row.id));
  close(game);
  assert.equal(game.ctx.depth, 0);
}
// Reproduce the invisible-overlay bug: a result belongs to another screen.
// Keep the result intact, but it must not suppress mail or sandbox input here.
for (let chapter = 1; chapter <= 20; chapter++) {
  saved.clear();
  const game = make(375, 812, chapter);
  const pending = { presentationScreen: 'survival', silent: false, revealAt: 0 };
  game.settlementModal = pending;
  game.render();
  const chip = game.renderedMapVisitorCountChip;
  assert(chip.visible);
  tap(game, chip.x + 25, chip.y + 12);
  assert(game.infoDetailModal.renderedInfoFrame, `chapter ${chapter}: invisible inbox`);
  close(game);
  assert.equal(game.settlementModal, pending, 'mail must not consume a pending task result');
  assert(game.isInsideMapViewport(180, 410), `chapter ${chapter}: map remains blocked after mail close`);
  assert.equal(game.ctx.depth, 0);
}
const busy = make();
busy.settlementModal = { presentationScreen: 'home', silent: true };
assert.equal(busy.openReserveLetterInbox({ unreadOnly: true }), true, 'silent B/C must not occupy mail');
busy.infoDetailModal = null;
const visibleResult = { presentationScreen: 'home', silent: false, revealAt: 0 };
busy.settlementModal = visibleResult;
assert.equal(busy.openReserveLetterInbox({ unreadOnly: true }), false, 'a visible A/D result must still own the screen');
assert.equal(busy.infoDetailModal, null);
assert.equal(busy.settlementModal, visibleResult);
busy.infoDetailModal = { kind: 'visitorLetterInbox' };
assert.equal(busy.openReserveLetterInbox({ unreadOnly: true }), true, 'an already-open inbox must not rebuild over itself');
assert.equal(busy.infoDetailModal.kind, 'visitorLetterInbox');
busy.infoDetailModal = null;
busy.settlementModal = null; busy.patrolTaskModal = { id: 'habitat' };
assert.equal(busy.openReserveLetterInbox(), false);
assert.equal(busy.infoDetailModal, null);
delete global.wx;
console.log('mail entry interaction ok: actual render/touch, flamingo rescue retained, read/back/close/restart, 3 screen sizes, 20 chapters, foreign/current settlement ownership');
