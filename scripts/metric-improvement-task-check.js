'use strict';

const assert = require('node:assert/strict');

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, property) {
      if (property === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (!target[property]) target[property] = () => {};
      return target[property];
    }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }),
  getStorageSync: () => null,
  setStorageSync() {}, onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.render = () => {};
  game.state = createCharacter(null, '环境任务回归');
  game.state.world.reserve.fund = 10000;
  game.state.world.reserve.supplies = { dogFood: 10, alarm: 10, fieldKit: 10, tranquilizer: 10, medicalKit: 10, evidenceTrap: 2 };
  game.screen = 'home';
  return game;
}

for (const type of ['water', 'grass']) {
  const game = makeGame();
  const ecology = game.state.world.reserve.ecology;
  ecology.water = type === 'water' ? 35 : 70;
  ecology.grass = type === 'grass' ? 35 : 70;
  const detail = game.buildReserveMetricDetail(type);
  const task = detail.items.find((item) => item.tag === '可做任务');
  assert(task, `${type}: missing visible improvement task`);
  assert.equal(typeof task.action, 'function', `${type}: task card must be clickable`);
  assert.equal(typeof detail.action, 'function', `${type}: footer action must be clickable`);
  assert(detail.actionLabel, `${type}: missing footer action label`);

  detail.action();
  assert(game.patrolTaskModal, `${type}: did not open a task`);
  assert.equal(game.patrolTaskModal.id, 'habitat', `${type}: should use the habitat settlement rule`);
  assert.equal(game.patrolTaskModal.metricFocus, type, `${type}: lost its metric focus`);
  assert.match(game.patrolTaskModal.placeholder, type === 'water' ? /饮水点|水源/ : /草场|耐旱草/, `${type}: wrong task instruction`);
  game.drawPatrolTaskModal();
  assert.equal(game.renderedPatrolTask.sceneTheme, type === 'water' ? 'water-source' : 'grassland', `${type}: task scene should not reuse the other habitat picture`);
  assert.equal(game.renderedPatrolTask.style, type === 'water' ? 'habitat-water-v1' : 'habitat-repair-v1', `${type}: task frame style drifted`);
  if (type === 'water') {
    assert.doesNotMatch(JSON.stringify(game.renderedPatrolTask.metricLayouts || []), /草场/, 'water: grassland preview leaked into the water task');
  } else {
    assert.doesNotMatch(JSON.stringify(game.renderedPatrolTask.metricLayouts || []), /水源/, 'grass: water preview leaked into the grassland task');
  }

  const before = ecology[type];
  const otherKey = type === "grass" ? "water" : "grass";
  const otherBefore = ecology[otherKey];
  const oldRandom = Math.random;
  Math.random = () => 0;
  try {
    assert(game.confirmPatrolTask(game.patrolTaskModal), `${type}: task did not settle`);
  } finally {
    Math.random = oldRandom;
  }
  const after = game.state.world.reserve.ecology[type];
  const otherAfter = game.state.world.reserve.ecology[otherKey];
  assert(after > before, `${type}: task must increase the selected metric (${before} -> ${after})`);
  assert(otherAfter <= otherBefore, `${type}: must not raise the other habitat metric (${otherKey} ${otherBefore} -> ${otherAfter})`);
  if (!game.settlementModal) continue;
  assert(game.settlementModal.stats.some((item) => item.key === type), `${type}: settlement must include selected metric`);
  assert.equal(game.settlementModal.metricFocus, type, `${type}: settlement lost the selected metric focus`);
  const display = game.settlementDisplayChanges(game.settlementModal);
  assert.equal(display.primary && display.primary.key, type, `${type}: HUD/settlement animation must follow the selected metric, not the other habitat value`);
  if (type === "grass") {
    assert(!display.secondary.some((item) => item.key === "water"), "grass: settlement must not be driven by water change");
  }
  const settlementText = [
    ...(game.settlementModal.rewardLines || []),
    game.settlementModal.summary || "",
    game.settlementModal.guardianEcho && game.settlementModal.guardianEcho.quote || ""
  ].join(" ");
  if (type === 'grass') assert.doesNotMatch(settlementText, /水重新流过浅滩/, 'grass: water narrative leaked into settlement');
}

console.log('metric improvement task check ok: water and grass details open focused repair tasks and settle a real increase');
