'use strict';
const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { buildGoalView, normalizeGoalState, resolveGoals } = require('../js/goalSystem');
const { buildReserveView } = require('../js/reserveView');
const { CHAPTERS } = require('../js/animalWorld');

function isForcedTrapEvidenceCard(item) {
  const blob = `${item.id || ''} ${item.title || ''} ${item.body || ''} ${item.description || ''}`;
  return /storyEvidence|rareRecovered|story:collection/.test(item.id || '')
    || /找到案件主证据|陷阱证据|回收珍稀物品/.test(blob);
}

function visibleIds(state) {
  const view = buildGoalView(state, state.world.goals);
  return [view.primary].concat(view.alternatives || []).filter(Boolean);
}

const opening = createCharacter(null, '第一章任务收束');
opening.world.goals = normalizeGoalState(opening.world.goals, opening);
const dailies = opening.world.goals.daily.objectives.map((item) => item.kind);
assert.deepEqual(dailies, ['visitor', 'ecology']);
assert.equal(opening.world.goals.daily.required, 2);
assert.equal(opening.world.goals.daily.objectives[0].recommendedAction, 'viewVisitors');
assert.equal(opening.world.goals.daily.objectives[1].recommendedAction, 'habitat');

const cards = visibleIds(opening);
assert.ok(cards.length <= 2, '第一章最多两张任务卡');
assert.ok(cards.some((item) => item.recommendedAction === 'rescueAnimal' || /增加动物总数/.test(item.title || '')), '第一章动物总数未达标时必须给出动物数量任务');
assert.ok(cards.every((item) => !/channel:discovery|story:animal|development:.+:(build|upgrade)|facility:/.test(item.id)), '第一章不得出现发现/听动物/建设填空卡');
assert.ok(cards.every((item) => item.taskCategory), '第一章只有真实触发任务才允许显示');

const waterDip = JSON.parse(JSON.stringify(opening.world.reserve));
waterDip.ecology = Object.assign({}, waterDip.ecology, { water: 65, grass: 56 });
const healthyMarkers = buildReserveView(opening.world.reserve, waterDip, { day: 1 }).mapMarkers;
assert.ok(!healthyMarkers.some((marker) => marker.metric === 'water'), '水源仍高于预警线时不得刷无效水源卡');

const dry = JSON.parse(JSON.stringify(opening.world.reserve));
dry.ecology = Object.assign({}, dry.ecology, { water: 52, grass: 50 });
const dryMarkers = buildReserveView(opening.world.reserve, dry, { day: 2 }).mapMarkers;
assert.ok(dryMarkers.some((marker) => marker.metric === 'water' || marker.metric === 'grass'), '水草真正偏低时必须保留修复任务');

const leaving = JSON.parse(JSON.stringify(opening.world.reserve));
leaving.migration = { delta: -3, reason: '边缘动物开始离开' };
const leaveMarkers = buildReserveView(opening.world.reserve, leaving, { day: 3 }).mapMarkers;
assert.ok(leaveMarkers.some((marker) => marker.metric === 'migration'), '迁出必须保留任务点');

const later = createCharacter(null, '第二章任务对照');
later.world.reserve.progression.stage = 2;
later.world.reserve.progression.displayChapter = 2;
later.world.goals = normalizeGoalState(later.world.goals, later);
assert.deepEqual(later.world.goals.daily.objectives.map((item) => item.kind), ['visitor', 'ecology']);
assert.equal(later.world.goals.daily.required, 2);
assert.ok(later.world.goals.daily.objectives.every((item) => !['exploreMaterials', 'viewSurvival'].includes(item.recommendedAction)), '后续章节每日任务不得强制去生存频道');
const laterCards = visibleIds(later);
assert.ok(laterCards.length <= 2, '后续章节最多两张任务卡');
assert.ok(laterCards.some((item) => item.recommendedAction === 'rescueAnimal' || /增加动物总数/.test(item.title || '')), '后续章节动物总数未达标时必须给出动物数量任务');
assert.ok(laterCards.every((item) => !/channel:discovery|story:animal|development:.+:(build|upgrade)|facility:/.test(item.id)), '后续章节不得出现发现/听动物/建设填空卡');

const late = createCharacter(null, '第八章任务对照');
late.world.reserve.progression.stage = 8;
late.world.reserve.progression.displayChapter = 8;
late.world.goals = normalizeGoalState(late.world.goals, late);
assert.ok(late.world.goals.daily.objectives.every((item) => ['visitor', 'ecology'].includes(item.kind)), '后期章节每日任务也只保留游客和水草');
const lateCards = visibleIds(late);
assert.ok(lateCards.length <= 2, '后期章节最多两张任务卡');
assert.ok(lateCards.every((item) => !/channel:discovery|story:animal|development:.+:(build|upgrade)|facility:/.test(item.id)), '后期章节不得出现无关填空剧情卡');

for (let chapter = 1; chapter <= CHAPTERS.length; chapter += 1) {
  const state = createCharacter(null, `第${chapter}章证据卡对照`);
  state.world.reserve.progression.stage = chapter;
  state.world.reserve.progression.displayChapter = chapter;
  state.world.reserve.progression.level = CHAPTERS[chapter - 1].level;
  state.world.goals = resolveGoals(state, normalizeGoalState(state.world.goals, state), 'trap-evidence');
  const chapterCards = visibleIds(state);
  assert.ok(chapterCards.every((item) => !isForcedTrapEvidenceCard(item)), `第${chapter}章不得出现强制案件证据/陷阱证据卡片`);
}

const hinted = JSON.parse(JSON.stringify(opening));
hinted.world.collection = Object.assign({}, hinted.world.collection, {
  discovery: Object.assign({}, (hinted.world.collection || {}).discovery, {
    active: {
      id: 'discovery_snare',
      itemId: 'c1_snare',
      caseId: 'case_1',
      title: '废弃陷阱',
      status: 'hinted',
      actionId: 'habitat',
      actionLabel: '修复水源和草场'
    }
  })
});
hinted.world.goals = resolveGoals(hinted, normalizeGoalState(hinted.world.goals, hinted), 'hinted-trap');
const hintedCards = visibleIds(hinted);
assert.ok(hintedCards.every((item) => !isForcedTrapEvidenceCard(item)), '可执行的陷阱发现不得做成强制任务卡');
assert.ok(hintedCards.every((item) => !/discovery:c1_snare|story:collection/.test(item.id || '')), '可执行发现应留在沙盘，不得占用任务卡位');

console.log('chapter one goal focus check ok');
