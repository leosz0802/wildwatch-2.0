const assert = require('assert');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

const storage = new Map();
global.wx = {
  getStorageSync: key => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value)))
};

function makeGame() {
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, '每日两项回归');
  game.state.world.reserve.progression.stage = 2;
  game.state.world.goals = require('../js/goalSystem').normalizeGoalState(game.state.world.goals, game.state);
  game.screen = 'home';
  game.render = game.toast = () => {};
  game.setScreen = screen => { game.screen = screen; };
  return game;
}

function completeObjective(game, id) {
  const objective = game.state.world.goals.daily.objectives.find(item => item.id === id);
  assert(objective, `缺少每日目标 ${id}`);
  objective.progress = objective.target;
  objective.complete = true;
}

const game = makeGame();
assert.deepEqual(game.state.world.goals.daily.objectives.map(item => item.kind), ['visitor', 'ecology']);
assert(game.openDailyEvents());
assert.equal(game.infoDetailModal.activeDailyId, 'daily_visitor');
assert.equal(game.infoDetailModal.checklist.total, 2);

let routed = null;
game.executeGoalAction = goal => {
  routed = goal;
  game.activeTaskLock = { id: goal.id, kind: 'daily', goal };
  return true;
};
const dateKey = game.infoDetailModal.checklist.dateKey;
assert(game.executeDailyEvent('daily_visitor', dateKey));
assert.equal(routed.recommendedAction, 'viewVisitors', '第一项必须是招募游客');
assert.notEqual(game.screen, 'survival', '招募游客不得送去生存频道');

completeObjective(game, 'daily_visitor');
assert(game.openDailyEvents());
assert.equal(game.infoDetailModal.activeDailyId, 'daily_ecology');
assert.equal(game.infoDetailModal.checklist.complete, 1);
assert.equal(game.infoDetailModal.checklist.remaining, 1);
assert(game.executeDailyEvent('daily_ecology', dateKey));
assert.equal(routed.recommendedAction, 'habitat', '第二项必须是水源或草场修复');
assert.notEqual(game.screen, 'survival', '水草任务不得送去生存频道');

completeObjective(game, 'daily_ecology');
assert(game.openDailyEvents());
assert.equal(game.infoDetailModal.activeDailyId, null);
assert.equal(game.infoDetailModal.checklist.remaining, 0);
assert.equal(game.infoDetailModal.checklist.total, 2);

delete global.wx;
console.log('daily third task check ok (visitor then habitat, no survival channel, two tasks complete)');
