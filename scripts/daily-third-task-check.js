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
  game.state = createCharacter(null, '每日第三项回归');
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
completeObjective(game, 'daily_guard');
completeObjective(game, 'daily_economy');

// 第三项仍是当前任务，点击入口必须把玩家带到动物互动流程。
assert(game.openDailyEvents());
assert.equal(game.infoDetailModal.activeDailyId, 'daily_animal');
let focusedAnimal = null;
game.focusCollectionAnimal = animal => { focusedAnimal = animal; return true; };
const thirdId = game.infoDetailModal.checklist.dateKey;
assert(game.executeDailyEvent('daily_animal', thirdId));
assert(game.activeTaskLock, '第三项启动后必须持有任务锁');
assert.equal(game.activeTaskLock.id, `daily:${thirdId}:daily_animal`);

// 模拟完成动物互动后进入结果页；结果页关闭是本次回归的关键路径。
completeObjective(game, 'daily_animal');
game.infoDetailModal = { kind: 'animalComfort', phase: 'result' };
assert(game.advanceAnimalCareProcess());
assert.equal(game.activeTaskLock, null, '关闭动物结果页后必须释放第三项任务锁');
assert.equal(game.infoDetailModal, null);
assert.equal(game.screen, 'home');
assert(focusedAnimal && focusedAnimal.id, '动物任务应已进入沙盘目标');

// 锁释放后，第四项应立即成为唯一可执行的每日任务，不能卡在第三项。
assert(game.openDailyEvents());
assert.equal(game.infoDetailModal.activeDailyId, 'daily_visitor');
assert.equal(game.infoDetailModal.checklist.remaining, 1);

delete global.wx;
console.log('daily third task check ok (animal route, result close releases lock, visitor advances)');
