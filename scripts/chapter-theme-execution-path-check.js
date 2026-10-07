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

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  getStorageSync: () => null,
  setStorageSync: () => {},
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
  onTouchCancel: () => {},
  onKeyboardConfirm: () => {},
  onAppHide: () => {},
  onAppShow: () => {},
  showToast: () => {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { normalizeGoalState, resolveGoals } = require('../js/goalSystem');

function refresh(game) {
  game.state.world.goals = resolveGoals(
    game.state,
    normalizeGoalState(game.state.world.goals, game.state),
    'chapter-theme-execution-path-check'
  );
  return game.state.world.goals.active.primary;
}

const game = new Game();
game.stopLoop();
game.render = () => {};
game.requestRender = () => {};
game.toast = () => {};
game.state = createCharacter(null, '第二章真实执行链');

const reserve = game.state.world.reserve;
reserve.progression.stage = 2;
reserve.progression.displayChapter = 2;
reserve.progression.totalActions = 0;
reserve.fund = 10000;
reserve.supplies = {
  dogFood: 10,
  fieldKit: 10,
  alarm: 10,
  medicalKit: 10,
  tranquilizer: 10,
  evidenceTrap: 10
};
reserve.ecology = Object.assign({}, reserve.ecology || {}, { water: 60, grass: 70 });
reserve.chapterTheme = { chapter: 2, step: 0, completedTaskIds: [] };

assert.equal(refresh(game).id, 'theme:2:restore-water');
game.patrolTaskModal = {
  id: 'habitat',
  metricFocus: 'water',
  label: '修复饮水点',
  shortLabel: '修复饮水点',
  placeholder: '去东部河岸湿地清理饮水点，疏通水线并补充水源'
};
game.submitCommand('去东部河岸湿地清理饮水点，疏通水线并补充水源', 'water');
assert.equal(game.state.world.reserve.chapterTheme.step, 1, '真实水源结算必须退休修复水源任务');
assert.equal(refresh(game).id, 'theme:2:control-visitors');

game.openVisitorReception();
assert.equal(game.infoDetailModal.kind, 'visitorReception');
assert.equal(game.performVisitorReception(), true, '真实游客接待必须完成');
assert.equal(game.state.world.reserve.chapterTheme.step, 2, '真实游客接待必须退休控制游客压力任务');
assert.equal(refresh(game).id, 'theme:2:keep-animal-corridor');

// Later sandbox activity and a water warning must not resurrect either task.
game.openVisitorReception();
assert.equal(game.performVisitorReception(), true, '后续手动接待仍可执行');
assert.equal(refresh(game).id, 'theme:2:keep-animal-corridor', '第二次手动接待不能把控制游客压力任务重新生成');
game.state.world.reserve.ecology.water = 45;
refresh(game);
assert.notEqual(game.state.world.goals.active.primary.id, 'theme:2:restore-water');
assert.notEqual(game.state.world.goals.active.primary.id, 'theme:2:control-visitors');

console.log('chapter theme execution path check ok (real water settlement + visitor reception)');
