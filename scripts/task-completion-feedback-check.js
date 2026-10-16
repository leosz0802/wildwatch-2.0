const assert = require('node:assert/strict');
const handlers = {};
const saved = new Map();
function canvasContext() {
  let depth = 0;
  const gradient = { addColorStop() {} };
  return new Proxy({ font: '12px sans-serif', globalAlpha: 1 }, {
    get(target, key) {
      if (key === 'save') return () => { depth++; };
      if (key === 'restore') return () => { assert(depth > 0, 'unbalanced canvas restore'); depth--; };
      if (key === 'depth') return depth;
      if (key === 'measureText') return text => ({ width: Array.from(String(text)).length * 6 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      return key in target ? target[key] : () => {};
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 1 }),
  createCanvas: () => ({ getContext: () => canvasContext() }),
  getStorageSync: key => saved.has(key) ? JSON.parse(JSON.stringify(saved.get(key))) : null,
  setStorageSync: (key, value) => saved.set(key, JSON.parse(JSON.stringify(value))),
  onTouchStart: fn => { handlers.start = fn; }, onTouchMove: fn => { handlers.move = fn; },
  onTouchEnd: fn => { handlers.end = fn; }, onTouchCancel: fn => { handlers.cancel = fn; },
  onKeyboardConfirm() {}, showToast() {}
};
const { Game } = require('../js/game');
const { createCharacter, saveState, loadState } = require('../js/storage');
const { CHAPTERS } = require('../js/animalWorld');
const { normalizeChapterRescue, nextRescueTask } = require('../js/chapterRescueSystem');

const { applyGoalProgress } = require('../js/goalSystem');
const { chapterTargets, chapterVisitorTotal } = require('../js/chapterTargets');
const { COMPLETE_COLOR, metricProgress, completedTaskEntries, TaskCompletionFeedback } = require('../js/taskCompletionFeedback');
function make(width = 375, height = 812, chapter = 1) {
  saved.clear();
  const game = new Game(); game.stopLoop();
  game.state = createCharacter(null, '达标和完成提示回归');
  game.state.ui.onboarding = { completed: true, recruitmentDone: true, seen: {} };
  game.width = width; game.height = height; game.dpr = 1;
  game.screen = 'home'; game.scrollY = 0;
  Object.assign(game.state.world.reserve.progression, { stage: chapter, displayChapter: chapter, level: CHAPTERS[chapter - 1].level });
  game.state.world.goals = require('../js/goalSystem').normalizeGoalState(game.state.world.goals, game.state);
  normalizeChapterRescue(game.state.world.reserve, chapter, { fresh: true });
  game.resetTaskCompletionFeedback();
  return game;
}
function drain(game) {
  const titles = [];
  game.collectTaskCompletionFeedback();
  while (game.showNextTaskCompletionNotice()) {
    titles.push(game.infoDetailModal.prose);
    game.infoDetailModal = null;
  }
  return titles;
}
assert.equal(metricProgress(999, 1000).percentage, 99, 'rounding must not claim completion early');
assert.equal(metricProgress(999, 1000).complete, false);
assert.equal(metricProgress(1000, 1000).color, COMPLETE_COLOR);
assert.equal(metricProgress(1001, 1000).percentage, 100);
assert.equal(metricProgress(0, 0).complete, false);
for (let chapter = 1; chapter <= CHAPTERS.length; chapter++) {
  const game = make(375, 812, chapter), goals = chapterTargets(chapter);
  for (const [id, key] of [['visitors','visitors'],['speciesCount','species'],['animalTotal','animals']]) {
    for (const value of [goals[key] - 1, goals[key], goals[key] + 1]) {
      const result = game.drawCompactReserveStateTile(game.ctx, { id, label: key, value, target: goals[key], showProgress: true, tone: 'good' }, 20, 80, 105, 34);
      assert.equal(result.complete, value >= goals[key], `${chapter}: ${key}`);
      assert.equal(result.valueColor === COMPLETE_COLOR, value >= goals[key]);
      assert.equal(result.percentage === 100, value >= goals[key]);
    }
  }
  const detail = game.buildChapterProgressDetail();
  game.drawChapterProgressContent(game.ctx, detail, 20, 100, 335, 500);
  detail.renderedChapterProgress.metrics.forEach(metric => {
    const expected = metricProgress(detail.core[metric.id], detail.core.target[metric.id]);
    assert.equal(metric.valueColor, expected.color);
    assert.equal(metric.percentage, expected.percentage, 'overview and HUD must use the same chapter target');
  });
  const daily = (game.state.world.goals.daily.objectives || [])[0];
  assert.equal(daily, undefined, `chapter ${chapter}: daily tasks must not be generated`);
  const before = JSON.parse(JSON.stringify(game.state));
  game.state = applyGoalProgress(before, game.state, { action: 'viewVisitors' }).state;
  game.collectTaskCompletionFeedback();
  assert.equal(drain(game).length, 0, 'removed daily tasks must not announce completion');
  game.resetTaskCompletionFeedback();
  assert.equal(drain(game).length, 0, 'loading old completed history must not replay notifications');
}
// Rendering + the real close-button touch handler, on three phone sizes.
for (const [w,h] of [[320,568],[375,812],[430,932]]) {
  const game = make(w,h);
  game.state.world.goals.history.push({ type:'daily_objective', id:'test-complete', dateKey:'test', title:'记录今天的生态线索' });
  const snapshot = () => JSON.stringify({ fund:game.state.world.reserve.fund, inventory:game.state.world.reserve.inventory, goals:game.state.world.goals.history, ecology:game.state.world.reserve.ecology, visitors:game.state.world.reserve.development.operations.totalVisitors });
  const before = snapshot();
  game.render();
  const modal = game.infoDetailModal;
  assert.equal(modal.kind, 'taskCompletionNotice');
  assert.equal(modal.title, '本步完成');
  assert.equal(modal.prose, '记录今天的生态线索');
  const frame = modal.renderedInfoFrame;
  assert(frame && frame.y >= 0 && frame.y + frame.h <= h);
  const close = game.infoDetailHeaderLayout(game.ctx, modal, frame.x, frame.y, frame.w).close;
  handlers.start({ touches:[{ clientX:close.x + close.w / 2, clientY:close.y + close.h / 2 }] });
  handlers.end({ touches:[], changedTouches:[{ clientX:close.x + close.w / 2, clientY:close.y + close.h / 2 }] });
  assert.equal(game.infoDetailModal, null, 'close must release the canvas overlay');
  assert.equal(game.gesture, null);
  assert.equal(snapshot(), before, 'notification must not award/re-settle/change game state');
  assert.equal(game.ctx.depth, 0);
}
// Release animations, ad overlays, other result modals, and ongoing multi-shot
// rescues own the screen until they finish.
{
  const game = make();
  const record = nextRescueTask(game.state.world.reserve, 1);
  record.status = 'rescued'; record.rescuedAt = 1234;
  game.collectTaskCompletionFeedback();
  assert.equal(game.taskCompletionFeedback.pending.filter(item => item.title === `解救${record.speciesName}`).length, 1, 'alias records must not duplicate rescue feedback');
  for (const blocker of [
    { mapConsequencePulse: { expiresAt: Date.now() + 5000 } },
    { settlementModal: { title:'结果' } }, { chapterStoryModal: {} },
    { interstitialAds: { showing:true } }, { activeTaskLock: { kind:'chapterRescue' } },
    { gesture: {} }, { infoDetailModal: { kind:'materialExploration', phase:'rolling' } }
  ]) {
    const key = Object.keys(blocker)[0], previous = game[key];
    game[key] = blocker[key];
    assert.equal(game.showNextTaskCompletionNotice(), false, key);
    game[key] = previous;
  }
  assert(game.showNextTaskCompletionNotice());
  assert.equal(game.infoDetailModal.prose, `解救${record.speciesName}`);
}
{
  const game = make();
  game.infoDetailModal = {kind:'visitorIncidentDice', phase:'result', result:{success:false}};
  game.collectTaskCompletionFeedback();
  assert.equal(game.taskCompletionFeedback.pending.length, 0, 'failed shots must not count as task completion');
  game.infoDetailModal = null;
  game.settlementModal = {actionType:'exploreMaterials', materialExploration:{success:false, collectionProgress:{required:15,current:4,completed:false}}};
  game.collectTaskCompletionFeedback();
  assert.equal(game.taskCompletionFeedback.pending.length, 0, 'partial rescue shots must not count as completed rescue');
  game.settlementModal = {actionType:'habitat', patrolOperation:{success:true}};
  game.collectTaskCompletionFeedback(); game.collectTaskCompletionFeedback();
  assert.equal(game.taskCompletionFeedback.pending.length, 0, 'patrol settlement is the result popup');
  game.settlementModal = null;
  assert.equal(drain(game).length, 0, 'closing patrol settlement must not open a second completion notice');
}
{
  const game = make();
  const beforeDaily = JSON.parse(JSON.stringify(game.state));
  game.state = applyGoalProgress(beforeDaily, game.state, { action: 'viewVisitors' }).state;
  const lastResult = game.state.world.goals.lastResult || {};
  game.settlementModal = {
    actionType: 'houndScout',
    patrolOperation: { success: true },
    goalResult: { completions: lastResult.completions || [], dateKey: lastResult.dateKey }
  };
  game.collectTaskCompletionFeedback();
  assert.equal(game.taskCompletionFeedback.pending.length, 0, 'hound patrol must not queue a second 任务完成 notice');
  game.settlementModal = null;
  assert.equal(drain(game).length, 0, 'daily completion already shown in the patrol result must not repeat');
}
{
  const game = make();
  assert(game.openVisitorRecruitment());
  assert(game.publishVisitorRecruitment());
  const modal = game.infoDetailModal;
  assert.equal(modal.kind, 'visitorRecruitment');
  assert.equal(modal.phase, 'result');
  assert.equal(modal.title, '招募成功');
  assert(modal.result && modal.result.visitors > 0, 'one result popup must include recruited visitors');
  assert((modal.taskSummary.dailyTitles || []).includes('招揽游客来访') || (modal.footer || '').includes('招募'), 'recruitment success and visitor count share the same popup');
  game.collectTaskCompletionFeedback();
  assert.equal(game.taskCompletionFeedback.pending.length, 0, 'recruitment result must not queue a second 你完成了 popup');
  game.dismissInfoDetailModal();
  assert.notEqual(game.infoDetailModal && game.infoDetailModal.kind, 'taskCompletionNotice');
  assert.equal(drain(game).length, 0, 'closing recruitment result must not open another task result popup');
}
{
  const game = make();
  const beforeDaily = JSON.parse(JSON.stringify(game.state));
  game.state = applyGoalProgress(beforeDaily, game.state, { action: 'viewVisitors' }).state;
  const lastResult = game.state.world.goals.lastResult || {};
  game.infoDetailModal = {
    kind: 'visitorIncidentDice',
    phase: 'result',
    result: { success: true, id: 'visitor_conflict_adjust', kind: 'resolved' },
    goalResult: { completions: lastResult.completions || [], dateKey: lastResult.dateKey }
  };
  game.collectTaskCompletionFeedback();
  assert.equal(game.taskCompletionFeedback.pending.length, 0, 'visitor archery result must not queue a second 任务完成 notice');
  game.infoDetailModal = null;
  assert.equal(drain(game).length, 0, 'closing the visitor result must not open another popup for the same task');
}
// A new chapter uses a new goal identity; fluctuating metrics cannot repeatedly
// generate completion notices for an already achieved chapter goal.
{
  const game = make(), reserve = game.state.world.reserve;
  reserve.development.operations.totalVisitors = chapterTargets(1).visitors;
  const first = drain(game);
  assert(first.includes('第1章本章游客目标'));
  reserve.development.operations.totalVisitors = 0; drain(game);
  reserve.development.operations.totalVisitors = chapterTargets(1).visitors;
  assert.equal(drain(game).length, 0);
  Object.assign(reserve.progression, {stage:2,displayChapter:2});
  chapterVisitorTotal(reserve);
  const start = reserve.progression.chapterStart || {};
  reserve.development.operations.totalVisitors = Math.max(0, Math.round(Number(start.totalVisitors) || 0))
    + Math.max(0, chapterTargets(2).visitors - Math.max(0, Math.round(Number(start.inheritedVisitors) || 0)));
  assert(drain(game).includes('第2章本章游客目标'));
}

// Committed narrative/collection outcomes opt in explicitly; preview choices
// and dice animations never carry completion metadata.
{
  const game = make();
  for (const key of ['ecology:event1','strategy:event2:1','investigation:artifact1','case:case1']) {
    game.infoDetailModal = { completionTask: {key, title:'完成现场调查'} };
    game.collectTaskCompletionFeedback();
    assert.equal(game.showNextTaskCompletionNotice(), false, 'result still owns the screen');
    game.infoDetailModal = null;
    assert.equal(drain(game).length, 1);
    game.infoDetailModal = { completionTask: {key, title:'完成现场调查'} };
    game.collectTaskCompletionFeedback();
    game.infoDetailModal = null;
    assert.equal(drain(game).length, 0, 'reopening an outcome must not reannounce it');
  }
}
// Chapter task results keep the chapter-facing name even when a legacy
// history row still carries the old action label ("偷猎"). The white
// settlement title uses the same action vocabulary as the task modal.
{
  const game = Object.create(Game.prototype);
  const reserve = {
    progression: { stage: 1, displayChapter: 1 },
    chapterTheme: { chapter: 1, step: 3 }
  };
  const keyed = game.chapterThemeCompletionPresentation(reserve, {
    key: 'goal:test:chapter_theme:theme:1:first-protection',
    title: '偷猎'
  });
  assert.equal(keyed.completed.title, '完成首次保护');
  assert.equal(keyed.resultSummary, '首次保护已经落地，泥岸警报得到回应。');
  const legacy = game.chapterThemeCompletionPresentation(reserve, { title: '偷猎' });
  assert.equal(legacy.completed.title, '完成首次保护');
  assert.equal(game.patrolSettlementTitle('antiPoacher'), '边界驱赶');
  const flowGame = make(375, 812, 1);
  flowGame.state.world.reserve.chapterTheme = { chapter: 1, step: 3 };
  flowGame.state.world.goals.history.push({
    type: 'chapter_theme',
    id: 'theme:1:first-protection',
    dateKey: 'test',
    title: '偷猎'
  });
  assert(drain(flowGame).includes('完成首次保护'), 'legacy first-protection result must show the chapter task title');
}
delete global.wx;
console.log('task completion feedback ok: 20 chapters, 3 metrics, exact thresholds, real daily progress, popup render/touch on 3 phone sizes, rescue animation deferral, single result popup per task, patrol/recruitment/visitor result not duplicated, repeat/failure/partial-shot protection');
