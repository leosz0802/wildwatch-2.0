'use strict';

const assert = require('node:assert/strict');

function fakeContext() {
  const gradient = { addColorStop() {} };
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

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }),
  getStorageSync: () => null,
  setStorageSync: () => {},
  onTouchStart: () => {}, onTouchMove: () => {}, onTouchEnd: () => {},
  onTouchCancel: () => {}, onKeyboardConfirm: () => {}, onAppHide: () => {},
  onAppShow: () => {}, showToast: () => {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function make(chapter, goal) {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, `主题引导第${chapter}章`);
  game.screen = 'home';
  game.state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
  game.state.world.reserve.progression.stage = chapter;
  game.state.world.reserve.progression.displayChapter = chapter;
  game.state.world.reserve.progression.totalActions = 0;
  game.state.world.reserve.progression.activeSeconds = 0;
  game.currentGoalView = () => ({ primary: goal });
  const counter = { value: 0 };
  game.openGoalCenter = () => {
    counter.value += 1;
    return true;
  };
  return { game, counter };
}

for (const [chapter, id, title, action] of [
  [1, 'observe-footprints', '观察脚印', 'houndScout'],
  [1, 'first-patrol-line', '建立第一条巡护线', 'facilityUse'],
  [1, 'first-protection', '完成首次保护', 'antiPoacher'],
  [2, 'restore-water', '修复水源', 'habitat'],
  [2, 'control-visitors', '控制游客压力', 'visitorReception'],
  [2, 'keep-animal-corridor', '保留动物通道', 'facilityUse']
]) {
  const goal = {
    id: `theme:${chapter}:${id}`,
    title,
    themeTask: true,
    themeChapter: chapter,
    recommendedAction: action,
    buttonLabel: title
  };
  const { game, counter } = make(chapter, goal);
  assert.equal(game.maybeOpenMissionPush('home'), true, `${title} should auto-guide once`);
  assert.equal(counter.value, 1);
  game.infoDetailModal = null;
  game.state.ui.missionPushSeenKey = '';
  game.state.ui.lastMissionAutoPushAt = 0;
  game.state.ui.lastSystemTaskTriggerAt = 0;
  game.state.ui.lastUserTaskTriggerAt = 0;
  game.state.world.reserve.progression.totalActions = 20;
  assert.equal(game.maybeOpenMissionPush('home'), false, `${title} must not auto-guide twice`);
  assert.equal(counter.value, 1);
  assert.equal(game.chapterThemeAutoGuideSeen(goal), true);

  // A legacy/core task with the same action must not create a second
  // unsolicited card in the same chapter.
  game.currentGoalView = () => ({
    primary: {
      id: `pass:${chapter}:legacy:${id}`,
      title: `旧任务 · ${title}`,
      kind: 'stage',
      recommendedAction: action
    }
  });
  game.state.ui.missionPushSeenKey = '';
  game.state.ui.lastMissionAutoPushAt = 0;
  game.state.ui.lastSystemTaskTriggerAt = 0;
  assert.equal(game.maybeOpenMissionPush('home'), false, `${title} legacy action must not auto-repeat`);

  // Manual entry is separate from the automatic ledger and remains available.
  game.openGoalCenter = () => {
    counter.value += 1;
    return true;
  };
  assert.equal(game.openGoalCenter(), true, `${title} manual entry must remain available`);
  assert.equal(counter.value, 2);
}

// A non-theme/core task that reuses a chapter action is also a system
// recommendation and must be shown at most once. A manual entry does not
// consume that allowance.
{
  const goal = {
    id: 'stage:chapter-1:legacy-hound',
    kind: 'stage',
    title: '旧版巡护提示',
    recommendedAction: 'houndScout'
  };
  const { game, counter } = make(1, goal);
  assert.equal(game.openGoalCenter(), true, 'manual task-center entry should remain available');
  assert.deepEqual(game.state.ui.chapterSystemAutoGuides || {}, {}, 'manual entry must not mark a system task');
  assert.equal(game.maybeOpenMissionPush('home'), true, 'legacy chapter task should auto-guide once');
  assert.equal(counter.value, 2);
  game.infoDetailModal = null;
  game.state.ui.missionPushSeenKey = '';
  game.state.ui.lastMissionAutoPushAt = 0;
  game.state.ui.lastSystemTaskTriggerAt = 0;
  game.state.world.reserve.progression.totalActions = 20;
  assert.equal(game.maybeOpenMissionPush('home'), false, 'legacy chapter action must not auto-repeat');
  assert.equal(game.chapterSystemAutoGuideSeen(goal, 1), true);
}

console.log('chapter theme auto-guide once check ok (chapters 1 and 2, six steps)');
