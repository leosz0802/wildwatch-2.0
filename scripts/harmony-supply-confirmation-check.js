'use strict';

const assert = require('node:assert/strict');

const handlers = {};
const gradient = { addColorStop() {} };
function fakeContext() {
  return new Proxy({ canvas: { width: 750, height: 1334 }, globalAlpha: 1 }, {
    get(target, property) {
      if (property === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
      if (property === 'createLinearGradient' || property === 'createRadialGradient') return () => gradient;
      if (!target[property]) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) { target[property] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ platform: 'android', system: 'HarmonyOS 4.2.0.121', windowWidth: 375, windowHeight: 667, pixelRatio: 2 }),
  getDeviceInfo: () => ({ platform: 'android', system: 'HarmonyOS 4.2.0.121', brand: 'Huawei' }),
  createCanvas: () => ({
    width: 750, height: 1334,
    getContext: () => fakeContext(),
    addEventListener() {}
  }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart(handler) { handlers.start = handler; },
  onTouchMove(handler) { handlers.move = handler; },
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel(handler) { handlers.cancel = handler; },
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function makeGame(name) {
  const game = new Game();
  game.stopLoop();
  game.render = game.requestRender = () => {};
  game.toast = () => {};
  game.state = createCharacter(null, name);
  game.screen = 'role';
  game.width = 375;
  game.height = 667;
  game.dpr = 2;
  game.canvas.width = 750;
  game.canvas.height = 1334;
  game.state.world.reserve.fund = 20000;
  game.state.world.reserve.supplies = Object.assign({}, game.state.world.reserve.supplies, {
    fieldKit: 0, dogFood: 0, alarm: 0, tranquilizer: 0, medicalKit: 0, evidenceTrap: 0
  });
  return game;
}

function drawQuantity(game, id = 'fieldKit') {
  game.infoDetailModal = {
    kind: 'supplyQuantity',
    kicker: '分项采购',
    title: '采购野外工具包',
    icon: 'habitat',
    supplyId: id,
    quantity: 1
  };
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const hit = game.hitAreas.slice().reverse().find((item) => item.hud && !game.isFullScreenBackdropHit(item));
  assert(hit, '单项采购确认按钮必须注册');
  return hit;
}

function tapHarmonyPhysicalOnly(game, hit) {
  // 非纯血鸿蒙常把 clientX/clientY 当 backing-canvas 像素，touchPoint
  // 的首选结果会落在按钮上方；候选命中必须回到原始 client 坐标。
  const x = hit.x + hit.w / 2;
  const y = hit.y + hit.h / 2;
  handlers.start({ changedTouches: [{ clientX: x, clientY: y }] });
}

const single = makeGame('鸿蒙分项采购');
let quantityHit = drawQuantity(single);
const singleFund = single.state.world.reserve.fund;
tapHarmonyPhysicalOnly(single, quantityHit);
assert.equal(single.infoDetailModal, null, '单项采购确认不能被遮罩吞掉');
assert(single.state.world.reserve.fund < singleFund, '单项采购确认后必须立即扣减基金');
assert.equal(single.patrolTaskModal, null, '单项采购确认后不得再打开第二层结算弹窗');

const batch = makeGame('鸿蒙自动补充');
// 物资页顶部的“补充物资”是非 HUD 命中区，也必须走同一套候选坐标兜底。
batch.ctx = fakeContext();
batch.hitAreas = [];
batch.drawSupplyDepot(batch.ctx, 20, 20, 335, batch.state.world.reserve);
const replenishHit = batch.hitAreas.find((item) => item.w === 100 && item.h === 27);
assert(replenishHit, '自动补充入口必须注册');
assert.equal(replenishHit.hud, false, '补充物资在滚动页上不能是按下即走的 HUD，否则滑动会连开采购');
assert.equal(batch.isPressImmediateHudHit(replenishHit), false, '补充物资按下不能立刻采购');
const batchFund = batch.state.world.reserve.fund;
const batchKit = batch.state.world.reserve.supplies.fieldKit || 0;
tapHarmonyPhysicalOnly(batch, replenishHit);
assert.equal(batch.patrolTaskModal, null, '按下补充物资不能立刻采购');
assert.equal(batch.state.world.reserve.fund, batchFund, '按下补充物资不能立刻扣基金');
handlers.end({ touches: [], changedTouches: [{ clientX: replenishHit.x + replenishHit.w / 2, clientY: replenishHit.y + replenishHit.h / 2 }] });
assert.ok(batch.state.world.reserve.fund < batchFund, '抬手后补充物资必须直接用基金入库');
assert.ok((batch.state.world.reserve.supplies.fieldKit || 0) > batchKit, '抬手后补充物资必须写入库存');
assert.equal(batch.patrolTaskModal, null, '补充物资不得再留下第二层确认');

console.log('harmony supply confirmation check ok: single and batch settlement survive physical-only touch reports');
