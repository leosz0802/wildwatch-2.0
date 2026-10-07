'use strict';

const assert = require('node:assert/strict');
const { createReserveState } = require('../js/world');
const { livingAnimalTotal } = require('../js/chapterRescueSystem');
const { chapterVisitorTotal, applyChapterVisitorDelta } = require('../js/chapterTargets');
const { addLivingAnimals } = require('../js/animalSourceLedger');
const {
  DISASTER_DRAIN_INTERVAL_MS,
  applySandboxTaskCadence,
  tickUntreatedDisasters
} = require('../js/sandboxTaskCadence');

function seededReserve() {
  const reserve = createReserveState();
  reserve.progression = Object.assign({}, reserve.progression, { stage: 6, displayChapter: 6, level: 3 });
  addLivingAnimals(reserve, 100, 'tasked');
  applyChapterVisitorDelta(reserve, 80, 'visit');
  return reserve;
}

const fire = seededReserve();
applySandboxTaskCadence(fire, [{
  id: 'wildfire',
  priority: 110,
  eventType: 'sandbox_wildfire',
  label: '火灾预警'
}], 1_000);
const animalsBefore = livingAnimalTotal(fire);
const visitorsBefore = chapterVisitorTotal(fire);
assert.ok(animalsBefore >= 80, '测试需要足够的在场动物');
assert.ok(visitorsBefore >= 40, '测试需要足够的本章游客');

const started = tickUntreatedDisasters(fire, 1_000, { foreground: true });
assert.equal(started, null, '灾害刚出现时只开始计时，不立刻扣减');

const tooSoon = tickUntreatedDisasters(fire, 1_000 + DISASTER_DRAIN_INTERVAL_MS - 1, { foreground: true });
assert.equal(tooSoon, null, '不足一分钟不得扣减');

const firstTick = tickUntreatedDisasters(fire, 1_000 + DISASTER_DRAIN_INTERVAL_MS, { foreground: true });
assert.ok(firstTick, '在线满一分钟必须扣减');
assert.equal(firstTick.kind, 'wildfire');
assert.ok(livingAnimalTotal(fire) < animalsBefore, '未处理火灾必须减少动物');
assert.ok(chapterVisitorTotal(fire) < visitorsBefore, '未处理火灾必须减少游客');
const animalLost = animalsBefore - livingAnimalTotal(fire);
const visitorLost = visitorsBefore - chapterVisitorTotal(fire);
assert.ok(animalLost >= Math.max(1, Math.round(animalsBefore * 0.01)), '动物损失约为1%且至少1');
assert.ok(visitorLost >= Math.max(1, Math.round(visitorsBefore * 0.01)), '游客损失约为1%且至少1');

tickUntreatedDisasters(fire, 1_000 + DISASTER_DRAIN_INTERVAL_MS + 10, { foreground: false });
const midAnimals = livingAnimalTotal(fire);
const midVisitors = chapterVisitorTotal(fire);
const paused = tickUntreatedDisasters(fire, 1_000 + DISASTER_DRAIN_INTERVAL_MS * 5, { foreground: false });
assert.equal(paused, null, '退出游戏后不得继续扣减');
assert.equal(livingAnimalTotal(fire), midAnimals, '退出后动物数量保持不变');
assert.equal(chapterVisitorTotal(fire), midVisitors, '退出后游客数量保持不变');

const resumed = tickUntreatedDisasters(fire, 1_000 + DISASTER_DRAIN_INTERVAL_MS * 5 + 20, { foreground: true });
assert.equal(resumed, null, '回到游戏只恢复计时，不补扣离线时间');
assert.equal(livingAnimalTotal(fire), midAnimals, '回到游戏瞬间不得补扣动物');
assert.equal(chapterVisitorTotal(fire), midVisitors, '回到游戏瞬间不得补扣游客');

const afterReturn = tickUntreatedDisasters(fire, 1_000 + DISASTER_DRAIN_INTERVAL_MS * 6 + 20, { foreground: true });
assert.ok(afterReturn, '回到游戏后再过一分钟才继续扣减');
assert.ok(livingAnimalTotal(fire) < midAnimals, '回到游戏后的在线分钟继续减少动物');

const flood = seededReserve();
flood.emergency = {
  active: { type: 'flash_flood', title: '水灾改道', id: 'flood_1' },
  cooldown: 0,
  history: []
};
tickUntreatedDisasters(flood, 8_000, { foreground: true });
const floodTick = tickUntreatedDisasters(flood, 8_000 + DISASTER_DRAIN_INTERVAL_MS, { foreground: true });
assert.ok(floodTick, '未处理的水灾紧急事件同样按分钟扣减');
assert.equal(floodTick.kind, 'flood');

console.log('disaster online drain check ok');
