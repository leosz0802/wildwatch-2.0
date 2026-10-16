'use strict';

const assert = require('node:assert/strict');

const gradient = { addColorStop() {} };
function fakeContext() {
  return new Proxy({}, {
    get(target, key) {
      if (key === 'measureText') return (text) => ({ width: String(text || '').length * 7 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (!(key in target)) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
}

let shareCalls = 0;
global.wx = {
  getSystemInfoSync: () => ({ platform: 'android', system: 'Android 14', windowWidth: 375, windowHeight: 667, pixelRatio: 3 }),
  createCanvas: () => ({ width: 1125, height: 2001, getContext: () => fakeContext() }),
  getStorageSync: () => null,
  setStorageSync: () => {},
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
  onTouchCancel: () => {},
  onKeyboardConfirm: () => {},
  onAppHide: () => {},
  onAppShow: () => {},
  showToast: () => {},
  shareAppMessage() { shareCalls += 1; }
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { normalizeGoalState, resolveGoals } = require('../js/goalSystem');

function refresh(game) {
  game.state.world.goals = resolveGoals(
    game.state,
    normalizeGoalState(game.state.world.goals, game.state),
    'chapter-11-share-once-check'
  );
  return game.state.world.goals.active.primary;
}

const game = new Game();
game.stopLoop();
game.render = () => {};
game.requestRender = () => {};
game.toast = () => {};
game.state = createCharacter(null, '第十一章野牛截图');

const reserve = game.state.world.reserve;
reserve.progression.stage = 11;
reserve.progression.displayChapter = 11;
reserve.progression.totalActions = 8;
reserve.fund = 10000;
reserve.ecology = Object.assign({}, reserve.ecology || {}, { water: 70, grass: 80 });
reserve.chapterTheme = {
  version: 1,
  chapter: 11,
  step: 1,
  lastAction: 'habitat',
  completedTaskIds: [],
  completed: false
};

assert.equal(refresh(game).id, 'theme:11:endless-bison-snapshot');
assert.equal(game.completeChapterScreenshotTask('sharePostcard'), true, '发起分享必须立刻完成截下守望里的野牛');
assert.equal(reserve.chapterTheme.completed, true, '分享是第11章唯一主题任务，完成后主题链结束');
assert.ok(reserve.chapterTheme.completedTaskIds.includes('endless-bison-snapshot'));
const afterShare = refresh(game);
assert.notEqual(afterShare && afterShare.title, '截下守望里的野牛');
assert.notEqual(afterShare && afterShare.title, '织上暗夜联防', '第11章界面操作任务已经删除');
assert.equal(game.completeChapterScreenshotTask('sharePostcard'), false, '同一截图任务不得重复推进');
assert.notEqual(refresh(game) && refresh(game).title, '截下守望里的野牛');

reserve.chapterTheme = {
  version: 1,
  chapter: 11,
  step: 1,
  lastAction: 'habitat',
  completedTaskIds: [],
  completed: false
};
refresh(game);
shareCalls = 0;
const started = game.shareForestPostcard(null, {
  rewardType: 'animals',
  sourceKind: 'animal',
  skipReward: true,
  themeShare: true,
  name: '风点',
  species: '野牛'
});
assert.notEqual(started, false, '主题分享必须能唤起');
assert.equal(shareCalls, 1, '必须真正唤起微信分享');
assert.equal(game.state.world.reserve.chapterTheme.completed, true, 'Android 分享回调不可靠时，发起分享也必须记一次完成');
assert.notEqual(refresh(game) && refresh(game).title, '截下守望里的野牛');
assert.notEqual(refresh(game) && refresh(game).title, '织上暗夜联防');

game.cancelPendingShareReward('fail');
assert.notEqual(refresh(game) && refresh(game).title, '截下守望里的野牛', '分享失败或取消不得把已完成的野牛截图任务拉回来');

console.log('chapter 11 share-once check ok');
