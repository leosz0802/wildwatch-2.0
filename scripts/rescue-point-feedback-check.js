const assert = require('node:assert/strict');
let stored;
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ getContext: () => null }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {},
  getStorageSync: () => stored && JSON.parse(JSON.stringify(stored)),
  setStorageSync: (_key, state) => { stored = JSON.parse(JSON.stringify(state)); }
};
const { Game } = require('../js/game');
const { createCharacter, saveState, loadState, normalizeReserve } = require('../js/storage');
const { simulateDay } = require('../js/simulator');
const { RESCUE_ITEM_CATALOG, rescueItemCount, nextRescueTask, createPoacherRescue, rescuePoacherAnimal } = require('../js/chapterRescueSystem');
const { explorationProgressFor, explorationTargetScore, explorationGoodById } = require('../js/materialExploration');

function make() {
  stored = null;
  const game = new Game(); game.stopLoop();
  game.state = createCharacter(null, '累计点数回归');
  game.state.world.reserve.fund = 10000;
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = () => {};
  game.setScreen = screen => { game.screen = screen; };
  game.screen = 'home';
  return game;
}
for (const item of RESCUE_ITEM_CATALOG) {
  const game = make();
  const required = explorationTargetScore(explorationGoodById(item.id));
  game.executeMaterialExploration(item.id, 4);
  assert.equal(explorationProgressFor(game.state.world.reserve, item.id).current, 4);
  assert.equal(rescueItemCount(game.state.world.reserve, item.id), 0, 'one successful arrow must not grant a rescue item');
  const now = Date.now; let time = 10000;
  Date.now = () => time;
  try {
    assert.equal(game.animatedRescuePoints(item.id, 4), 0);
    time += 500; assert.equal(game.animatedRescuePoints(item.id, 4), 2);
    time += 500; assert.equal(game.animatedRescuePoints(item.id, 4), 4);
    time += 500; assert.equal(game.animatedRescuePoints(item.id, 4), 4, 'animation must not replay');
  } finally { Date.now = now; }
  saveState(game.state); game.state = loadState();
  assert.equal(explorationProgressFor(game.state.world.reserve, item.id).current, 4, 'restart must retain points');
  const unrelated = simulateDay('修复水源和草场', game.state);
  game.state = Object.assign({}, game.state, { world: unrelated.world, character: unrelated.character });
  assert.equal(explorationProgressFor(game.state.world.reserve, item.id).current, 4, 'another task must not erase points');
  for (let shot = 0; shot < 4; shot++) game.executeMaterialExploration(item.id, 1);
  assert.equal(explorationProgressFor(game.state.world.reserve, item.id).current, 8);
  assert.equal(rescueItemCount(game.state.world.reserve, item.id), 0, 'failure guarantee must not bypass points');
  game.state.world.reserve.materialExplorationProgress[item.id] = required - 1;
  game.executeMaterialExploration(item.id, 1);
  assert.equal(explorationProgressFor(game.state.world.reserve, item.id).current, required);
  assert.equal(rescueItemCount(game.state.world.reserve, item.id), 1, 'threshold reached with one point must grant exactly one item');
  game.executeMaterialExploration(item.id, 6);
  assert.equal(rescueItemCount(game.state.world.reserve, item.id), 1, 'completed progress must not grant duplicate items');
}

for (const recurring of [false, true]) {
  const game = make(); const reserve = game.state.world.reserve;
  const target = recurring ? createPoacherRescue(reserve, 'deer', 1, 2) : nextRescueTask(reserve, 1);
  const itemId = target.requiredItems[0];
  game.openChapterRescueTask(target.targetId); game.infoDetailModal.action();
  game.executeMaterialExploration(itemId, 4);
  assert.equal(explorationProgressFor(game.state.world.reserve, itemId).current, 4);
  assert.equal(rescueItemCount(game.state.world.reserve, itemId), 0);
  for (let shot = 0; shot < 8 && !rescueItemCount(game.state.world.reserve, itemId); shot++) game.executeMaterialExploration(itemId, 4);
  assert.equal(rescueItemCount(game.state.world.reserve, itemId), 1, 'locked rescue flow must settle only once');
  if (recurring) {
    assert(rescuePoacherAnimal(game.state.world.reserve, target.targetId).ok);
    assert.equal(explorationProgressFor(game.state.world.reserve, itemId).current, 0, 'consumed item starts a new collection cycle');
  }
}
const legacy = createCharacter(null, '旧版本进度').world.reserve;
delete legacy.materialExplorationProgress;
legacy.lastMaterialExploration = { targetId: 'rescue_reed_cord', roll: 4 };
assert.equal(normalizeReserve(legacy).materialExplorationProgress.rescue_reed_cord, 4, 'recover a verifiable last shot from old saves');
console.log('rescue point feedback check ok: six items, 0→4 animation, restart, unrelated tasks, cumulative threshold, no duplicate grant, chapter/daily rescue');
