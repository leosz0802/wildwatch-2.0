const assert = require('node:assert/strict');
let stored;
const context = new Proxy({}, {
  get(target, key) {
    if (key === 'measureText') return text => ({ width: String(text).length * 7 });
    if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({ addColorStop() {} });
    return target[key] || (() => {});
  },
  set(target, key, value) { target[key] = value; return true; }
});
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ getContext: () => context }),
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {},
  getStorageSync: () => stored && JSON.parse(JSON.stringify(stored)),
  setStorageSync: (_key, state) => { stored = JSON.parse(JSON.stringify(state)); }
};
const { Game } = require('../js/game');
const { createCharacter, saveState, loadState, normalizeReserve } = require('../js/storage');
const { simulateDay } = require('../js/simulator');
const { RESCUE_ITEM_CATALOG, rescueItemCount, nextRescueTask, createPoacherRescue, rescuePoacherAnimal, addRescueItem } = require('../js/chapterRescueSystem');
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

// The rescue score snapshot must always carry one unambiguous identity. This
// catches regressions where chapter 7 falls back to the shared material mirror
// and renders a zero score for every arrow.
{
  const game = make();
  const reserve = game.state.world.reserve;
  reserve.progression.stage = 7;
  reserve.progression.displayChapter = 7;
  reserve.progression.level = 4;
  const { normalizeChapterRescue } = require('../js/chapterRescueSystem');
  normalizeChapterRescue(reserve, 7, { fresh: true });
  const record = reserve.chapterRescue.targets[0];
  record.pointProgress[record.requiredItems[0]] = 6;
  const score = game.rescueArcheryContext(reserve, record.targetId, 4);
  assert.equal(score.speciesName, record.speciesName);
  assert.equal(score.chapter, 7);
  assert.equal(score.populationType, 'herbivores');
  assert.equal(score.populationTypeLabel, '食草种群');
  assert.equal(score.rescueType, 'chapter');
  assert.equal(score.rescueTypeLabel, '章节关卡解救');
  assert.equal(score.rescueIndex, 1);
  assert.equal(score.totalScore, 10);
  assert.equal(score.shotScore, 4);
  assert.equal(score.targetScore, 12);
  const second = game.rescueArcheryContext(reserve, record.targetId, 2, score.totalScore);
  assert.equal(second.totalScore, 12, 'next shot must accumulate from the prior score');
  assert.equal(second.shotScore, 2);
}
// A task modal may survive while simulation replaces the reserve with a clone.
// Rendering must re-resolve its targetId instead of reading the stale object.
{
  const game = make();
  const reserve = game.state.world.reserve;
  Object.assign(reserve.progression, { stage: 7, displayChapter: 7, level: 4 });
  require('../js/chapterRescueSystem').normalizeChapterRescue(reserve, 7, { fresh: true });
  const record = reserve.chapterRescue.targets[0], item = record.requiredItems[0];
  const modal = { kind: 'chapterRescueTask', rescueTargetId: record.targetId, rescueRecord: record, prose: '' };
  const nextReserve = normalizeReserve(JSON.parse(JSON.stringify(reserve)));
  require('../js/chapterRescueSystem').normalizeChapterRescue(nextReserve, 7);
  game.rescueRecordFor(record.targetId, nextReserve).pointProgress[item] = 8;
  game.state.world.reserve = nextReserve;
  game.drawChapterRescueContent(game.ctx, modal, 20, 100, 335, 420);
  assert.equal(modal.renderedRescuePoints[item].current, 8, 'open task must read live points after state replacement');
  assert.equal(modal.renderedRescuePoints[item].displayed, 8, 'task card must show the latest committed arrow score without lagging one shot');
  assert.equal(modal.renderedRescuePoints[item].chapter, 7);
  assert.equal(modal.renderedRescuePoints[item].rescueType, 'chapter');
}
// Exercise the close button after impact, rather than only direct settlement.
{
  const game = make();
  const reserve = game.state.world.reserve;
  Object.assign(reserve.progression, { stage: 7, displayChapter: 7, level: 4 });
  require('../js/chapterRescueSystem').normalizeChapterRescue(reserve, 7, { fresh: true });
  const record = reserve.chapterRescue.targets[0], item = record.requiredItems[0];
  game.activeTaskLock = { kind: 'chapterRescue', targetId: record.targetId };
  game.openMaterialExploration(item);
  game.archeryScoreFor = () => 6;
  game.rollMaterialExplorationDice(item);
  assert.equal(game.infoDetailModal.rescueScore.shotScore, 6);
  assert.equal(game.rescueRecordFor(record.targetId).pointProgress[item] || 0, 0, '确认前不能写入解救进度');
  assert.equal((game.rescueRecordFor(record.targetId).pointHistory || []).length, 0, '确认前不能写入解救历史');
  assert.equal(game.waitingArcheryOrDiceConfirm(), true, '发射后必须停在确认得分');
  game.confirmArcheryScore();
  assert.equal(game.rescueRecordFor(record.targetId).pointProgress[item], 6, '手动确认后才结算');
  assert.equal(game.rescueRecordFor(record.targetId).pointHistory.length, 1);
}
// A previous animal's finished total, or a shared material counter, must not
// be adopted as this arrow. One shot below the target must leave the animal captive.
{
  const game = make();
  const reserve = game.state.world.reserve;
  Object.assign(reserve.progression, { stage: 1, displayChapter: 1, level: 1 });
  require('../js/chapterRescueSystem').normalizeChapterRescue(reserve, 1, { fresh: true });
  const record = reserve.chapterRescue.targets[0];
  const item = record.requiredItems[0];
  const required = require('../js/chapterRescueSystem').rescuePointTarget(record, item);
  reserve.lastRescueShot = {
    rescueTargetId: 'chapter:1:rescue:other',
    itemId: item,
    shotScore: 6,
    totalScore: required,
    recordedAt: 1
  };
  reserve.materialExplorationProgress = { [item]: required };
  reserve.lastArcheryShot = {
    token: 'previous-animal',
    targetId: item,
    rescueTargetId: 'chapter:1:rescue:other',
    rescueItemId: item,
    score: 6,
    totalScore: required,
    recordedAt: 1
  };
  game.activeTaskLock = { kind: 'chapterRescue', targetId: record.targetId, animalId: record.speciesId };
  game.openMaterialExploration(item);
  game.infoDetailModal.phase = 'resolved';
  game.infoDetailModal.displayRoll = 1;
  game.infoDetailModal.resultScore = 1;
  game.confirmArcheryScore();
  const live = game.rescueRecordFor(record.targetId);
  assert.equal(live.pointProgress[item], 1, '一箭只能记入这一箭的点数');
  assert.equal(live.status, 'captive', '点数不够时不能解救');
  game.infoDetailModal = null;
  game.settlementModal = null;
  game.activateRescueMapMarker(record.targetId);
  assert.equal(game.rescueRecordFor(record.targetId).status, 'captive', '点数不够时点击沙盘也不能解救');
}
// All chapter records, including later chapters sharing the same material,
// must retain their own points through a save/load and subsequent arrow.
for (let chapter = 1; chapter <= require('../js/animalWorld').CHAPTERS.length; chapter++) {
  const game = make();
  const { CHAPTERS } = require('../js/animalWorld');
  const { normalizeChapterRescue } = require('../js/chapterRescueSystem');
  Object.assign(game.state.world.reserve.progression, { stage: chapter, displayChapter: chapter, level: CHAPTERS[chapter - 1].level });
  normalizeChapterRescue(game.state.world.reserve, chapter, { fresh: true });
  const records = game.state.world.reserve.chapterRescue.targets.map(r => ({ id: r.targetId, item: r.requiredItems[0] }));
  for (const record of records) {
    game.activeTaskLock = { kind: 'chapterRescue', targetId: record.id };
    game.openMaterialExploration(record.item);
    assert.equal(game.infoDetailModal.collectionProgress.current, 0, 'another rescue must not donate points');
    // 只有尚未发射的 ready 卡片可以取消；箭一旦进入飞行阶段，关闭会结算本次得分。
    game.infoDetailModal.phase = 'ready';
    game.dismissInfoDetailModal();
    assert.equal(game.infoDetailModal, null, 'ready rescue shot can be closed without scoring');
    assert.equal(game.rescueRecordFor(record.id, game.state.world.reserve).pointProgress[record.item] || 0, 0, 'cancel before firing does not commit');
    game.activeTaskLock = { kind: 'chapterRescue', targetId: record.id };
    game.openMaterialExploration(record.item);
    game.infoDetailModal.phase = 'resolved'; game.infoDetailModal.displayRoll = 4; game.infoDetailModal.resultScore = 4;
    game.dismissInfoDetailModal();
    let current = game.rescueRecordFor(record.id, game.state.world.reserve);
    assert.equal(current.pointProgress[record.item] || 0, 0, `chapter ${chapter}: close must not auto-commit impact`);
    assert.equal(game.waitingArcheryOrDiceConfirm(), true, `chapter ${chapter}: close must keep confirm page`);
    game.confirmArcheryScore();
    current = game.rescueRecordFor(record.id, game.state.world.reserve);
    assert.equal(current.pointProgress[record.item], 4, `chapter ${chapter}: confirm must commit impact`);
    assert.equal(current.pointHistory.at(-1).shotScore, 4);
    if (game.settlementModal) game.finishSettlement('home');
    saveState(game.state); game.state = loadState();
    game.activeTaskLock = { kind: 'chapterRescue', targetId: record.id };
    game.openMaterialExploration(record.item);
    assert.ok(game.infoDetailModal, `reopen chapter ${chapter}: ${JSON.stringify(game.activeRescueRecord())}`);
    assert.equal(game.infoDetailModal.collectionProgress.current, 4);
    game.infoDetailModal.phase = 'resolved'; game.infoDetailModal.displayRoll = 3; game.infoDetailModal.resultScore = 3;
    game.dismissInfoDetailModal();
    current = game.rescueRecordFor(record.id, game.state.world.reserve);
    assert.equal(current.pointProgress[record.item], 4, '第二轮关闭不能自动增加点数');
    assert.equal(game.waitingArcheryOrDiceConfirm(), true);
    game.confirmArcheryScore();
    current = game.rescueRecordFor(record.id, game.state.world.reserve);
    assert.equal(current.pointProgress[record.item], 7);
    assert.equal(current.pointHistory.at(-1).totalScore, 7);
    assert.equal(current.pointHistory.at(-1).chapter, chapter);
    if (game.settlementModal) game.finishSettlement('home');
    game.dismissInfoDetailModal();
    assert.equal(current.pointHistory.length, 2, 'close again must not score twice');
  }
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
{
  const game = make(), reserve = game.state.world.reserve;
  const first = createPoacherRescue(reserve, 'deer', 7, 2);
  first.pointProgress[first.requiredItems[0]] = 10;
  addRescueItem(reserve, first.requiredItems[0]);
  assert(rescuePoacherAnimal(reserve, first.targetId).ok);
  const second = createPoacherRescue(reserve, 'deer', 7, 5);
  const score = game.rescueArcheryContext(reserve, second.targetId, 4);
  assert.equal(score.chapter, 7);
  assert.equal(score.populationType, 'herbivores');
  assert.equal(score.rescueType, 'poacher');
  assert.equal(score.rescueTypeLabel, '盗猎解救');
  assert.equal(score.rescueIndex, 2, 'poacher ordinal must be scoped to the current chapter');
}
const legacy = createCharacter(null, '旧版本进度').world.reserve;
delete legacy.materialExplorationProgress;
legacy.lastMaterialExploration = { targetId: 'rescue_reed_cord', roll: 4 };
assert.equal(normalizeReserve(legacy).materialExplorationProgress.rescue_reed_cord, 4, 'recover a verifiable last shot from old saves');
console.log('rescue point feedback check ok: six items, 0→4 animation, restart, unrelated tasks, cumulative threshold, no duplicate grant, chapter/daily rescue');
