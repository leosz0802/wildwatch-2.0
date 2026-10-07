'use strict';

const assert = require('node:assert/strict');

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ globalAlpha: 1, canvas: { width: 750, height: 1334 } }, {
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
  setStorageSync() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.render = () => {};
  game.state = createCharacter(null, '水草任务统一回归');
  game.screen = 'home';
  const reserve = game.state.world.reserve;
  reserve.fund = 10000;
  reserve.supplies = {
    dogFood: 10, alarm: 10, fieldKit: 2, tranquilizer: 10, medicalKit: 10, evidenceTrap: 2
  };
  reserve.ecology.water = 70;
  reserve.ecology.grass = 30;
  return game;
}

// 1. 沙盘通用“修复栖息地”入口必须自动绑定到当前较低指标。
{
  const game = makeGame();
  const raw = {
    id: 'habitat',
    label: '修复栖息地',
    placeholder: '例如：去沙盘修复水源和草场'
  };
  assert.equal(game.beginPatrolTaskFromBoard(raw), true);
  assert(game.patrolTaskModal, '通用沙盘入口未打开任务卡');
  assert.equal(game.patrolTaskModal.metricFocus, 'grass', '通用入口没有绑定当前较低的草场指标');
  assert.match(game.patrolTaskModal.placeholder, /草场|耐旱草/, '通用入口没有生成明确的草场指令');
  assert.equal(game.confirmPatrolTask(game.patrolTaskModal), true, '通用草场任务无法结算');
  assert(game.settlementModal, '通用草场任务没有生成结算');
  assert.equal(game.settlementModal.metricFocus, 'grass', '通用入口结算焦点丢失');
}

// 2. 旧任务卡即使没有 metricFocus，也要按文案恢复水/草焦点。
for (const [focus, placeholder, pattern] of [
  ['water', '例如：修复饮水点并疏通水线', /饮水点|水源/],
  ['grass', '例如：补播耐旱草恢复草场', /草场|耐旱草/]
]) {
  const game = makeGame();
  game.state.world.reserve.ecology.water = focus === 'water' ? 30 : 80;
  game.state.world.reserve.ecology.grass = focus === 'grass' ? 30 : 80;
  game.openPatrolTaskModal({ id: 'habitat', label: '修复栖息地', placeholder });
  assert.equal(game.patrolTaskModal.metricFocus, focus, `${focus}: 旧任务卡没有恢复焦点`);
  assert.match(game.patrolTaskModal.placeholder, pattern, `${focus}: 旧任务卡文案不明确`);
  assert.equal(game.confirmPatrolTask(game.patrolTaskModal), true, `${focus}: 旧任务卡无法结算`);
  assert.equal(game.settlementModal.metricFocus, focus, `${focus}: 旧任务卡结算焦点错误`);
}

// 3. 资源短缺 → 物资页 → 返回任务，必须保留同一个水草目标。
{
  const game = makeGame();
  game.state.world.reserve.supplies.fieldKit = 0;
  assert.equal(game.openMetricImprovementTask('grass'), true, '草场短缺任务未打开');
  assert(game.patrolTaskModal, '资源不足时应保留任务卡并明确显示缺口');
  assert.equal(game.confirmPatrolTask(game.patrolTaskModal), true, '资源不足时应转入缺口处理，而不是停在卡死任务页');
  assert(game.infoDetailModal && game.infoDetailModal.kind === 'resourceShortfall', '资源不足未显示缺口页');
  assert.equal(game.infoDetailModal.returnPatrolTask.metricFocus, 'grass', '缺口页没有保存草场焦点');

  game.state.world.reserve.supplies.fieldKit = 1;
  game.dismissInfoDetailModal();
  assert(game.patrolTaskModal, '补齐资源后没有恢复任务卡');
  assert.equal(game.patrolTaskModal.metricFocus, 'grass', '补齐资源后草场焦点丢失');
  assert.equal(game.confirmPatrolTask(game.patrolTaskModal), true, '补齐资源后任务无法结算');
  assert(game.settlementModal, '补齐资源后没有生成结算');
}

// 4. A settlement that has not appeared must not freeze 执行修复.
{
  const game = makeGame();
  game.state.world.reserve.progression = Object.assign({}, game.state.world.reserve.progression, {
    stage: 11, displayChapter: 11, level: 6
  });
  game.openPatrolTaskModal({
    id: 'habitat',
    label: '修复饮水点',
    metricFocus: 'water',
    placeholder: '例如：去东部河岸湿地清理饮水点，疏通水线并补充水源'
  });
  game.drawPatrolTaskModal();
  const card = game.renderedPatrolTask;
  assert.equal(card.style, 'habitat-water-v1');
  game.settlementModal = {
    silent: false,
    presentationScreen: 'home',
    revealAt: Date.now() + 8000
  };
  game.hitAreas = [{ x: 0, y: 0, w: 48, h: 48, animal: true, onTap() { throw new Error('sandbox animal swallowed the repair button'); } }];
  const buttonW = (card.w - 48) / 2;
  const hit = game.hitAreaAt(card.x + 30 + buttonW + buttonW / 2, card.buttonY + 16);
  assert(hit && hit.modalAction, '执行修复 must stay tappable while the sandbox hit layer is stale');
  const before = game.state.world.reserve.ecology.water;
  assert.equal(hit.onTap(), true, '未显示的结算不得卡住修复饮水点');
  assert(game.state.world.reserve.ecology.water > before, '修复饮水点必须提高水源');
  assert(!game.patrolTaskModal, '执行后任务卡必须关闭');
}

console.log('habitat task unified check ok: generic, legacy and resource-shortfall routes share one water/grass settlement path');
