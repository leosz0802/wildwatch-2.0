'use strict';

const assert = require('node:assert/strict');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { supplyReplenishmentPlan } = require('../js/actions');
const { nextRescueTask } = require('../js/chapterRescueSystem');

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === 'measureText') return (value) => ({ width: String(value || '').length * 7 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (!target[key]) target[key] = () => {};
      return target[key];
    }
  });
}

function makeGame(name) {
  const game = new Game();
  game.stopLoop();
  game.render = game.requestRender = game.playSfx = game.playSettlementSfx = game.toast = () => {};
  game.setScreen = (screen) => { game.screen = screen; };
  game.state = createCharacter(null, name);
  game.screen = 'home';
  game.width = 375;
  game.height = 667;
  game.dpr = 1;
  game.ctx = fakeContext();
  return game;
}

const archery = makeGame('确认得分');
const rescue = nextRescueTask(archery.state.world.reserve, 1);
const itemId = rescue.requiredItems[0];
archery.activeTaskLock = { kind: 'chapterRescue', targetId: rescue.targetId };
assert.equal(archery.openMaterialExploration(itemId), true);
archery.infoDetailModal.phase = 'resolved';
archery.infoDetailModal.resultScore = 4;
archery.infoDetailModal.displayRoll = 4;
archery.infoDetailModal.archerySettleToken = 'five-1';
archery.queuePendingArcheryShot({
  token: 'five-1',
  kind: 'materialExploration',
  targetId: itemId,
  rescueTargetId: rescue.targetId,
  rescueItemId: itemId,
  score: 4
});
archery.applyPendingArcheryScoreToLedger();
archery.settlementModal = { silent: false, grade: 'A', presentationScreen: 'home', title: '过期结算' };
archery.interstitialAds = { showing: true };
assert.equal(archery.waitingArcheryOrDiceConfirm(), true);
archery.hitAreas = [];
archery.drawInfoDetailModal();
assert.ok(archery.hitAreas.some((hit) => hit.hud && typeof hit.onTap === 'function'), '确认得分必须画得出来');
assert.equal(archery.interstitialAds.showing, false, '确认得分必须清掉卡住的插屏');
assert.equal(archery.shouldAutoLeaveResolvedArchery(), false);
assert.equal(archery.flushPendingArcheryShot(Date.now(), true), false, '确认页还在时不能自动提交');
assert.equal(archery.confirmArcheryScore(), true);
assert.ok(archery.settlementModal && archery.isArcherySettlement(), '按下确认后才出现射箭结算');
archery.finishSettlement('home');

const habitat = makeGame('水源草地');
habitat.state.world.reserve.supplies.fieldKit = 3;
habitat.settlementModal = { silent: false, grade: 'A', presentationScreen: 'home', title: '过期结算' };
assert.equal(habitat.openMetricImprovementTask('water'), true, '残留结算不能挡住水源任务');
assert.equal(habitat.patrolTaskModal.id, 'habitat');
assert.equal(habitat.confirmPatrolTask(habitat.patrolTaskModal), true, '水源执行必须有结算');
assert.ok(habitat.settlementOccupiesFlow() || habitat.settlementModal === null, '水源任务必须给出结算或明确收尾');
habitat.finishSettlement && habitat.settlementModal && habitat.finishSettlement('home');

const grass = makeGame('草场');
grass.state.world.reserve.supplies.fieldKit = 3;
grass.settlementModal = { silent: false, grade: 'B', presentationScreen: 'home', title: '过期结算' };
assert.equal(grass.openMetricImprovementTask('grass'), true, '残留结算不能挡住草场任务');
assert.equal(grass.confirmPatrolTask(grass.patrolTaskModal), true, '草场执行必须有反馈');

const poacher = makeGame('驱赶偷猎');
poacher.state.world.reserve.supplies.alarm = 3;
const beforeAlarm = poacher.state.world.reserve.supplies.alarm;
assert.equal(poacher.openPatrolOperationScreen('antiPoacher'), true);
assert.equal(poacher.patrolTaskModal, null, '驱赶偷猎不得停在中间页');
assert.ok(poacher.settlementOccupiesFlow() || poacher.state.world.reserve.supplies.alarm < beforeAlarm, '驱赶偷猎必须直接结算');

const shortage = makeGame('驱赶缺料');
shortage.state.world.reserve.supplies.alarm = 0;
assert.equal(shortage.openPatrolTaskModal(shortage.reserveActionOptions().find((item) => item.id === 'antiPoacher')), true);
assert.equal(shortage.screen, 'role', '缺警报器时应去物资页，而不是卡在中间页');
assert.equal(shortage.patrolTaskModal, null);

const purchase = makeGame('采购短缺');
purchase.screen = 'home';
purchase.state.world.reserve.fund = 1303;
purchase.settlementModal = { silent: false, grade: 'A', presentationScreen: 'home', title: '过期结算' };
purchase.interstitialAds = { showing: true };
purchase.openMaterialsForMissing({ id: 'habitat', missing: ['野外工具包'] });
assert.equal(purchase.screen, 'role', '采购短缺必须能从沙盘进物资页');
assert.equal(purchase.interstitialAds.showing, false, '采购短缺不得被卡住的插屏锁死');
const plan = supplyReplenishmentPlan(purchase.state.world.reserve);
assert.equal(plan.fillToCap, false, '采购短缺前两次只能补到安全线');
assert.ok(plan.cost <= 1303 - 500, `1303 不得一次扣到个位数，实际 ${plan.cost}`);
purchase.interstitialAds.showing = true;
purchase.useMaterialAction('buySupplies', 'all');
assert.equal(purchase.patrolTaskModal && purchase.patrolTaskModal.purchaseId, 'all');
purchase.hitAreas = [];
purchase.drawPatrolTaskModal();
assert.ok(purchase.hitAreas.some((hit) => hit.hud && typeof hit.onTap === 'function'), '插屏残留时执行结算仍必须可点');
assert.equal(purchase.confirmPatrolTask(purchase.patrolTaskModal), true, '采购短缺执行结算必须有效');
assert.ok(purchase.state.world.reserve.fund >= 500, `采购后基金应留下余额，实际 ${purchase.state.world.reserve.fund}`);
assert.ok(purchase.state.world.reserve.fund < 1303, '采购必须扣基金');
purchase.interstitialAds.showing = true;
purchase.settlementModal = { silent: false, grade: 'B', presentationScreen: 'role', title: '过期结算' };
purchase.useMaterialAction('buySupplies', 'dogFood', 1);
assert.ok(purchase.patrolTaskModal || purchase.infoDetailModal, '第一次采购后补充物资仍可继续');
assert.equal(purchase.confirmPatrolTask(purchase.patrolTaskModal), true, '第二单执行结算不得被残留结算锁死');

console.log('today five issues check ok: confirm stays, habitat feedback, anti-poacher settles, purchase leftover unlocked');
