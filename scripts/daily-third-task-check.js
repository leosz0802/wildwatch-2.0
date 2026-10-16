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

const game = makeGame();
assert.deepEqual(game.state.world.goals.daily.objectives, []);
assert.equal(game.state.world.goals.daily.required, 0);
assert.equal(game.openDailyEvents(), false);
assert.equal(game.infoDetailModal, null);
assert.equal(game.executeDailyEvent('daily_visitor', 'today'), false);
assert.equal(game.executeDailyEvent('daily_ecology', 'today'), false);
assert.notEqual(game.screen, 'survival');

delete global.wx;
console.log('daily third task check ok (daily tasks removed, no checklist, no survival route)');
