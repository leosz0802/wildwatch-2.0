'use strict';

const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const {
  applyGoalProgress,
  normalizeGoalState,
  resolveGoals
} = require('../js/goalSystem');
const { completedTaskEntries } = require('../js/taskCompletionFeedback');
const { Game } = require('../js/game');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readyState(chapter, step = 0) {
  const state = createCharacter(null, `系统推荐去重第${chapter}章`);
  const reserve = state.world.reserve;
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
  reserve.progression.activeSeconds = 600;
  reserve.progression.totalActions = 0;
  reserve.fund = 10000;
  reserve.supplies = { dogFood: 10, fieldKit: 10, alarm: 10, medicalKit: 10, tranquilizer: 10 };
  reserve.ecology = Object.assign({}, reserve.ecology || {}, { water: 70, grass: 70 });
  reserve.chapterTheme = { chapter, step };
  state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
  state.world.goals = resolveGoals(state, normalizeGoalState(state.world.goals, state), 'dedup-check');
  return state;
}

// A chapter-theme action must create one presentation item. The old path
// emitted both `instant` and `chapter_theme`, which produced duplicate cards.
{
  const before = readyState(1, 0);
  const after = clone(before);
  after.world.reserve.progression.totalActions = 1;
  const result = applyGoalProgress(before, after, { action: 'houndScout', now: Date.now() });
  assert.deepEqual(
    result.completions.map((item) => `${item.type}:${item.id}`),
    ['chapter_theme:theme:1:observe-footprints'],
    'chapter theme completion must be presented once'
  );
  assert.equal(result.rewards.some((item) => item.source === 'instant'), true, 'deduplication must retain the instant reward');
}

{
  const state = readyState(1, 1);
  state.world.goals.history = [
    { dateKey: '2026-09-30', type: 'instant', id: 'theme:1:observe-footprints', title: '观察脚印' },
    { dateKey: '2026-09-30', type: 'chapter_theme', id: 'theme:1:observe-footprints', title: '观察脚印' }
  ];
  assert.deepEqual(
    completedTaskEntries(state).map((item) => item.key),
    ['goal:2026-09-30:chapter_theme:theme:1:observe-footprints'],
    'legacy duplicate theme history must render one completion card'
  );
}

// Supply replenishment is one of the explicit repeatable recovery routes.
// The chapter task itself remains one-shot, while a true shortage may still
// offer the purchase route again.
{
  const state = readyState(2, 0);
  state.world.reserve.supplies.fieldKit = 0;
  let goals = resolveGoals(state, normalizeGoalState(state.world.goals, state), 'dedup-check');
  assert.equal(goals.active.primary.recommendedAction, 'buySupplies');
  state.ui.chapterSystemAutoGuides = {
    'theme:2:restore-water': Date.now(),
    'chapter:2:goal:theme:2:restore-water': Date.now(),
    'chapter:2:action:buySupplies': Date.now(),
    'chapter:2:action:habitat': Date.now()
  };
  goals = resolveGoals(state, normalizeGoalState(goals, state), 'dedup-check');
  assert.equal(goals.active.primary && goals.active.primary.recommendedAction, 'buySupplies',
    'supply replenishment remains repeatable when stock is actually empty');
}

// A player-selected task remains available even if the same action was
// previously shown by the system. The one-shot rule is for unsolicited
// recommendations, not for a deliberate goal selection.
{
  const state = readyState(2, 0);
  state.ui.chapterSystemAutoGuides = {
    'theme:2:restore-water': Date.now(),
    'chapter:2:goal:theme:2:restore-water': Date.now(),
    'chapter:2:action:habitat': Date.now()
  };
  state.world.goals = normalizeGoalState(state.world.goals, state);
  state.world.goals.active = Object.assign({}, state.world.goals.active, {
    manualSelectedId: 'theme:2:restore-water'
  });
  const goals = resolveGoals(state, state.world.goals, 'manual-selection');
  assert.equal(goals.active.primary && goals.active.primary.id, 'theme:2:restore-water',
    'manual selection must override the automatic one-shot suppression');
}

// Event code may call from inside a paint frame while frameMemoStore still
// contains the previous goal. maybeOpenMissionPush must resolve the fresh
// chapter-2 goal and suppress the seen action on the next call.
{
  const game = Object.create(Game.prototype);
  game.state = readyState(2, 1);
  game.screen = 'home';
  game.painting = true;
  game.frameMemoStore = {
    goalView: { primary: { id: 'stale', title: '旧任务', recommendedAction: 'facilityUse' } }
  };
  let opened = [];
  const fresh = {
    primary: {
      id: 'theme:2:control-visitors',
      title: '控制游客压力',
      themeTask: true,
      themeChapter: 2,
      recommendedAction: 'visitorReception',
      validThemeActions: ['visitorAdjust', 'visitorReception', 'viewVisitors']
    }
  };
  game.currentGoalView = (force) => force ? fresh : game.frameMemoStore.goalView;
  game.openGoalCenter = (id) => {
    opened.push(id);
    return true;
  };
  game.onboardingProgress = () => ({ active: false });
  game.popupFlowQuiet = () => false;
  game.settlementOccupiesFlow = () => false;
  game.chapterStoryModal = null;
  game.patrolTaskModal = null;
  game.infoDetailModal = null;
  game.activeTaskLock = null;
  game.missionExperienceSeconds = () => 600;
  game.renderedMapOpportunityAggregate = null;
  game.renderedRescueMapMarkers = [];
  game.sandboxLedMode = () => false;
  game.currentDailyMatchesGoal = () => false;
  game.remainingDailyObjective = () => null;
  game.todaysDailyAlreadyPresented = () => false;
  game.markMissionPushSeen = () => {};
  game.markChapterSystemAutoGuideSeen = Game.prototype.markChapterSystemAutoGuideSeen.bind(game);
  game.state.world.goals.daily = { title: '今日任务', story: '任务', recommendedAction: 'visitorReception' };
  assert.equal(game.maybeOpenMissionPush('home', { force: true }), true);
  assert.deepEqual(opened, ['theme:2:control-visitors'], 'system push must open the fresh goal, not the stale frame goal');
  game.infoDetailModal = null;
  game.state.ui.lastMissionAutoPushAt = 0;
  game.state.ui.lastSystemTaskTriggerAt = 0;
  game.state.ui.lastUserTaskTriggerAt = 0;
  game.state.world.reserve.progression.totalActions = 20;
  assert.equal(game.maybeOpenMissionPush('home'), false, 'the same chapter-2 visitor action must not repeat');
}

console.log('system recommendation dedup check ok: one completion card, fresh goal, chapter-2 visitor suppression');
