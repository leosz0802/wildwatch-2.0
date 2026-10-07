const assert = require('assert');
const fs = require('fs');
const path = require('path');
let stored;
global.wx = { getStorageSync: () => stored, setStorageSync: (_, value) => { stored = value; } };
const { createReserveState } = require('../js/world');
const { normalizeReserve } = require('../js/storage');
const { Game } = require('../js/game');
const {
  buildReserveDevelopmentPlan, developmentBuildingView, completeDevelopmentBuildingStory,
  unlockDevelopmentBuildingStory, grantDevelopmentBuildingStoryAd, BUILDING_OPERATION_UNLOCK_COST,
  BUILDING_AD_OPERATION_GRANT
} = require('../js/reserveDevelopment');
const plans = { river_shallows: 'visitor_boardwalk', meadow_edge: 'meadow_story_trail', border_pass: 'guided_border_hide', forest_watch: 'forest_listening_deck' };
function fixture(id) {
  const reserve = createReserveState();
  reserve.fund = 10000;
  assert(buildReserveDevelopmentPlan(reserve, id, plans[id], 1).ok);
  assert(completeDevelopmentBuildingStory(reserve, id, 5).ok);
  return reserve;
}
for (const id of Object.keys(plans)) {
  const reserve = fixture(id);
  const task = developmentBuildingView(reserve, id, 5).story;
  assert.strictEqual(task.remainingDays, ['river_shallows', 'meadow_edge'].includes(id) ? 2 : 3);
  assert.strictEqual(task.nextAvailableDay, 5 + task.cooldown);
  assert(task.canUnlock && !task.ready);
  const other = JSON.parse(JSON.stringify(reserve));
  const fund = other.fund;
  assert(developmentBuildingView(other, id, task.nextAvailableDay).story.ready);
  assert(!unlockDevelopmentBuildingStory(other, id, task.nextAvailableDay).ok);
  assert.strictEqual(other.fund, fund, '自然到期不能收费');
  assert(!completeDevelopmentBuildingStory(reserve, id, 5).ok);
  reserve.fund = 999;
  const progress = reserve.development.nodes[id].storyProgress;
  assert(!unlockDevelopmentBuildingStory(reserve, id, 5).ok);
  assert.strictEqual(reserve.fund, 999);
  reserve.fund = 1000;
  const totalIncome = reserve.development.operations.totalIncome;
  const totalVisitors = reserve.development.operations.totalVisitors;
  assert(unlockDevelopmentBuildingStory(reserve, id, 5).ok);
  assert.strictEqual(reserve.fund, 0);
  assert.strictEqual(reserve.development.operations.totalIncome, totalIncome, '提前开放不得发放奖励');
  assert.strictEqual(reserve.development.operations.totalVisitors, totalVisitors);
  assert.strictEqual(reserve.development.nodes[id].storyProgress, progress);
  assert(!unlockDevelopmentBuildingStory(reserve, id, 5).ok, '重复扣费被阻止');
  assert.strictEqual(reserve.fund, 0);
  const restarted = normalizeReserve(JSON.parse(JSON.stringify(reserve)));
  assert(developmentBuildingView(restarted, id, 5).story.ready, '提前开放跨重启保留');
  assert(completeDevelopmentBuildingStory(restarted, id, 5).ok);
  assert(!restarted.development.nodes[id].storyWindowUnlocked);
  assert(!developmentBuildingView(restarted, id, 5).story.ready, '运营后恢复冷却');
  const afterFund = restarted.fund;
  assert(!completeDevelopmentBuildingStory(restarted, id, 5).ok);
  assert.strictEqual(restarted.fund, afterFund, '重复结算不发奖励');
  assert.strictEqual(restarted.fundLedger.filter(e => e.source === '提前开放建筑运营').length, 1);
  assert.strictEqual(restarted.fundLedger.find(e => e.source === '提前开放建筑运营').amount, -BUILDING_OPERATION_UNLOCK_COST);
}
const adReserve = fixture('river_shallows');
const adFund = adReserve.fund;
const adGrant = grantDevelopmentBuildingStoryAd(adReserve, 'river_shallows', 5);
assert(adGrant.ok, '完整观看广告后应能提前恢复建筑运营');
assert.strictEqual(adGrant.granted, BUILDING_AD_OPERATION_GRANT, '看广告后默认恢复3次运营');
assert.strictEqual(adReserve.fund, adFund, '广告恢复运营不得扣除基金');
assert.strictEqual(developmentBuildingView(adReserve, 'river_shallows', 5).story.adUsesRemaining, BUILDING_AD_OPERATION_GRANT);
for (let use = 1; use <= BUILDING_AD_OPERATION_GRANT; use += 1) {
  assert(developmentBuildingView(adReserve, 'river_shallows', 5).story.ready, `广告恢复后第${use}次运营必须可用`);
  assert(completeDevelopmentBuildingStory(adReserve, 'river_shallows', 5).ok, `广告恢复后第${use}次运营必须能完成`);
}
assert.strictEqual(adReserve.development.nodes.river_shallows.storyAdUsesRemaining, 0);
assert(!developmentBuildingView(adReserve, 'river_shallows', 5).story.ready, '3次广告运营用完后恢复冷却');
assert(!completeDevelopmentBuildingStory(adReserve, 'river_shallows', 5).ok, '第4次不得再结算');
assert.strictEqual(adReserve.development.nodes.river_shallows.storyAdGrantCount, 1);
const unbuilt = createReserveState();
unbuilt.fund = 2000;
assert(!unlockDevelopmentBuildingStory(unbuilt, 'river_shallows', 5).ok);
assert(!unlockDevelopmentBuildingStory(unbuilt, 'unknown', 5).ok);
assert.strictEqual(unbuilt.fund, 2000);
const game = Object.create(Game.prototype);
game.state = { world: { day: 5, reserve: fixture('meadow_edge') } };
game.state.world.reserve.guardianCycle.day = 5;
game.render = () => {};
game.toast = () => {};
game.openDevelopmentBuildingStory('meadow_edge');
assert(game.infoDetailModal.task.statusText.includes('第7日'));
assert(game.infoDetailModal.footer.includes('并非现实天数'));
game.openDevelopmentOperationUnlock('meadow_edge');
const confirmation = game.infoDetailModal;
const balance = game.state.world.reserve.fund;
assert(confirmation.items.some(i => i.title.includes('1000')));
assert.strictEqual(balance, game.state.world.reserve.fund, '打开确认页不能扣费');
confirmation.action();
assert(game.infoDetailModal.task.ready);
assert.strictEqual(game.state.world.reserve.fund, balance - 1000);
confirmation.action();
assert.strictEqual(game.state.world.reserve.fund, balance - 1000, '旧确认回调不可重复扣费');
console.log('building operation cooldown check ok: 4 buildings, natural expiry, payment, insufficient funds, restart, single reward and UI confirmation');

const adFlow = Object.create(Game.prototype);
adFlow.state = { world: { day: 5, reserve: fixture('river_shallows') } };
adFlow.state.world.reserve.guardianCycle.day = 5;
adFlow.render = () => {};
adFlow.toast = () => {};
adFlow.playSfx = () => {};
assert(grantDevelopmentBuildingStoryAd(adFlow.state.world.reserve, 'river_shallows', 5).ok);
adFlow.buildingOperationTapLockedUntil = Date.now() + 5000;
assert.strictEqual(adFlow.completeDevelopmentBuildingStoryTask('river_shallows'), false, '广告关闭时的误触不能扣掉运营次数');
assert.strictEqual(adFlow.state.world.reserve.development.nodes.river_shallows.storyAdUsesRemaining, 3);
adFlow.buildingOperationTapLockedUntil = 0;
for (let left = 2; left >= 1; left -= 1) {
  assert.strictEqual(adFlow.completeDevelopmentBuildingStoryTask('river_shallows'), true);
  assert.strictEqual(adFlow.infoDetailModal.phase, 'ready', '广告次数没用完时必须留在可运营界面');
  assert.strictEqual(adFlow.infoDetailModal.task.ready, true);
  assert.strictEqual(adFlow.infoDetailModal.task.adUsesRemaining, left);
}
assert.strictEqual(adFlow.completeDevelopmentBuildingStoryTask('river_shallows'), true);
assert.strictEqual(adFlow.infoDetailModal.phase, 'result');
assert.strictEqual(adFlow.state.world.reserve.development.nodes.river_shallows.storyAdUsesRemaining, 0);
assert(fs.readFileSync(path.join(__dirname, '../js/game.js'), 'utf8').includes('this.buildingOperationAdShowing'), '建筑广告不能在关闭点击时再开一次');

// Exercise the real text fitting code at phone widths; no truncated cooldown copy.
for (const width of [320, 375, 430]) {
  game.state.world.reserve = fixture('meadow_edge');
  game.state.world.reserve.guardianCycle.day = 5;
  game.openDevelopmentBuildingStory('meadow_edge');
  game.width = width;
  game.drawPremiumInfoCard = () => {};
  game.roundRect = () => {};
  game.text = () => {};
  const ctx = { font: '12px sans-serif', fillText() {}, measureText(text) {
    const size = Number((this.font.match(/([\d.]+)px/) || [])[1]) || 12;
    return { width: Array.from(String(text)).reduce((sum, char) => sum + (char.charCodeAt(0) > 255 ? size : size * .6), 0) };
  }};
  const fits = [];
  game.drawFittedTextBlock = (...args) => { const fit = Game.prototype.drawFittedTextBlock.call(game, ...args); fits.push({ text: args[1], y: args[3], fit }); return fit; };
  game.drawDevelopmentBuildingModalContent(ctx, game.infoDetailModal, 20, 122, width - 40, 280);
  const status = fits.find(row => row.text.includes('还需'));
  assert(status && !status.fit.truncated, `${width}: cooldown status must be fully visible`);
  const row = game.infoDetailModal.renderedBuildingRows.find((item) => /还需/.test(item.text)) || game.infoDetailModal.renderedBuildingRows[0];
  assert(status.y + (status.fit.lineCount - 1) * status.fit.lineHeight < row.y + row.h - 4, `${width}: status text must stay within the card`);
}
console.log('building operation cooldown layout check ok: 320/375/430');
