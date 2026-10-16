'use strict';
const assert = require('node:assert/strict');
const stored = new Map();
function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'measureText') return (text) => ({ width: String(text || '').length * 7 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'canvas') return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: fakeContext }),
  getStorageSync: key => stored.has(key) ? JSON.parse(JSON.stringify(stored.get(key))) : null,
  setStorageSync: (key, value) => stored.set(key, JSON.parse(JSON.stringify(value))),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, showToast() {}
};
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { simulateDay } = require('../js/simulator');
const { buildGoalView, normalizeGoalState, resolveGoals, actionExecutable, applyGoalProgress } = require('../js/goalSystem');
const { CHAPTERS } = require('../js/animalWorld');
const {
  livingAnimalTotal,
  nextRescueTask,
  nextPoacherRescue,
  rescueAnimal,
  rescuePoacherAnimal
} = require('../js/chapterRescueSystem');

const COMMANDS = {
  exploreMaterials: '跟随动物探索物资 掷骰:6',
  habitat: '修复水源和草场',
  intervention: '执行许可内生态干预：阻滞转移过密鹿群',
  houndScout: '派猎犬侦察：确认边界脚印',
  antiPoacher: '驱赶偷猎者：封锁可疑路线',
  salvage: '出售研究样本',
  buySupplies: '采购狗粮包'
};

function fixture(chapter) {
  const state = createCharacter(null, `章节推进${chapter}`);
  Object.assign(state.world.reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    level: CHAPTERS[Math.max(0, chapter - 1)].level
  });
  const reserve = state.world.reserve;
  reserve.fund = 12000;
  reserve.supplies = { dogFood: 12, alarm: 6, fieldKit: 5, medicalKit: 5, tranquilizer: 8 };
  reserve.inventory = Object.assign({}, reserve.inventory, { researchSample: 4, recoveredTrap: 2 });
  reserve.safety = 78;
  reserve.poacherPressure = 22;
  state.world.goals = resolveGoals(state, normalizeGoalState(state.world.goals, state), 'chapter-progress');
  return state;
}

function cards(state) {
  const view = buildGoalView(state, state.world.goals);
  return [view.primary].concat(view.alternatives || []).filter(Boolean);
}

function withRandom(value, fn) {
  const previous = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = previous; }
}

function makeGame(state) {
  stored.clear();
  const game = new Game();
  game.stopLoop();
  game.state = state;
  game.screen = 'home';
  game.width = 375;
  game.height = 667;
  game.render = game.requestRender = game.playSfx = () => {};
  game.prepareLocalAssetsForScreen = () => {};
  return game;
}

let days = 0;
for (let chapter = 1; chapter <= CHAPTERS.length; chapter++) {
  let state = fixture(chapter);
  const visible = cards(state);
  assert(visible.length <= 3, `chapter ${chapter}: must keep at most 3 triggered task cards`);
  assert(visible.every(item => item && item.executable && actionExecutable(state, item.recommendedAction)), `chapter ${chapter}: visible cards must be executable`);
  assert(visible.every(item => !/channel:discovery|story:animal|development:.+:(build|upgrade)|facility:/.test(item.id || '')), `chapter ${chapter}: filler cards returned`);
  assert(visible.every(item => !/storyEvidence|rareRecovered|story:collection/.test(item.id || '') && !/找到案件主证据|隐踪器|回收珍稀物品/.test(`${item.title || ''}${item.body || ''}`)), `chapter ${chapter}: trap-evidence cards must not be forced`);
  if (!visible.length) continue;

  const game = makeGame(state);
  const toasts = [];
  game.toast = message => { toasts.push(String(message || '')); };
  assert(game.executeGoalAction(visible[0]) !== false, `chapter ${chapter}: primary card must route`);
  assert(!toasts.some(text => /请先完成或关闭当前任务/.test(text)), `chapter ${chapter}: opening the primary card must not deadlock`);
  if (visible[0].recommendedAction === 'viewVisitors') {
    assert.equal(game.state.world.goals.daily.objectives.length, 0, `chapter ${chapter}: opening recruitment must not create a daily task`);
    assert.equal(game.infoDetailModal && game.infoDetailModal.kind, 'visitorRecruitment', `chapter ${chapter}: visitor goal must open recruitment`);
    assert(game.publishVisitorRecruitment(), `chapter ${chapter}: recruitment publish must succeed`);
    assert.equal(game.state.world.goals.daily.objectives.length, 0, `chapter ${chapter}: publishing recruitment must not complete a daily task`);
  }
  if (game.activeTaskLock && !game.taskLockAllowsMaterialGathering()) {
    game.dismissInfoDetailModal();
    game.patrolTaskModal = null;
    game.settlementModal = null;
    game.activeTaskLock = null;
  }

  state = game.state;
  let stuck = 0;
  let lastId = '';
  for (let day = 0; day < 8; day++) {
    const view = buildGoalView(state, state.world.goals);
    assert(view.primary && view.primary.executable, `chapter ${chapter} day ${day}: lost executable primary`);
    const action = view.primary.recommendedAction;
    const command = COMMANDS[action];
    const beforeId = view.primary.id;
    const beforeAnimals = livingAnimalTotal(state.world.reserve);
    if (command) {
      const result = withRandom(0.08, () => simulateDay(command, state));
      state = Object.assign({}, state, { world: result.world, character: result.character });
      days += 1;
    } else if (action === 'rescueAnimal') {
      const reserve = state.world.reserve;
      const task = nextPoacherRescue(reserve) || nextRescueTask(reserve, chapter);
      if (task) {
        task.pointProgress = Object.assign({}, task.pointProgress || {});
        task.collectedItems = Object.assign({}, task.collectedItems || {});
        (task.requiredItems || []).forEach((itemId) => {
          task.pointProgress[itemId] = 15;
          task.collectedItems[itemId] = true;
        });
        if (task.recurring || String(task.targetId || '').startsWith('poacher:')) {
          rescuePoacherAnimal(reserve, task.targetId);
        } else {
          rescueAnimal(reserve, task.targetId || task.speciesId);
        }
      }
      const after = JSON.parse(JSON.stringify(state));
      after.world.reserve.progression.totalActions = (after.world.reserve.progression.totalActions || 0) + 1;
      state = applyGoalProgress(state, after, { action }).state;
    } else {
      const after = JSON.parse(JSON.stringify(state));
      after.world.reserve.progression.totalActions = (after.world.reserve.progression.totalActions || 0) + 1;
      state = applyGoalProgress(state, after, { action }).state;
    }
    const next = buildGoalView(state, state.world.goals);
    assert(next.primary, `chapter ${chapter} day ${day}: primary disappeared after ${action}`);
    assert(next.primary.executable, `chapter ${chapter} day ${day}: primary became unexecutable after ${action}`);
    if (next.primary.id === beforeId && next.primary.id === lastId) {
      if (livingAnimalTotal(state.world.reserve) > beforeAnimals) stuck = 0;
      else stuck += 1;
    } else stuck = 0;
    lastId = next.primary.id;
    assert(stuck < 6, `chapter ${chapter}: task ${lastId} froze for 6 days`);
  }
}

const gathering = makeGame(fixture(1));
gathering.activeTaskLock = { id: 'goal:facility', kind: 'goal', goal: { recommendedAction: 'facilityBuild' } };
assert.equal(gathering.taskLockAllowsMaterialGathering(), true, 'facility lock must still allow survival gathering');
assert(gathering.openMaterialExploration('reed'), 'facility shortage must still open exploration');

console.log(`chapter goal progress check ok (${CHAPTERS.length} chapters, ${days} simulated days, no deadlock)`);
