'use strict';

const assert = require('node:assert/strict');

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === 'measureText') return (text) => ({ width: String(text || '').length * 7 });
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
      if (!(key in target)) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  getStorageSync: () => null,
  setStorageSync: () => {},
  onTouchStart: () => {},
  onTouchMove: () => {},
  onTouchEnd: () => {},
  onTouchCancel: () => {},
  onKeyboardConfirm: () => {},
  onAppHide: () => {},
  onAppShow: () => {},
  showToast: () => {}
};

const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');
const { normalizeGoalState, resolveGoals } = require('../js/goalSystem');

function baseState(chapter, step = 0) {
  const state = createCharacter(null, `系统推荐去重第${chapter}章`);
  const reserve = state.world.reserve;
  reserve.progression.stage = chapter;
  reserve.progression.displayChapter = chapter;
  reserve.progression.totalActions = 0;
  reserve.progression.activeSeconds = 600;
  reserve.fund = 10000;
  reserve.supplies = {
    dogFood: 10,
    fieldKit: 10,
    alarm: 10,
    medicalKit: 10,
    tranquilizer: 10
  };
  reserve.ecology = Object.assign({}, reserve.ecology || {}, { water: 70, grass: 70 });
  reserve.chapterTheme = { chapter, step };
  state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
  return state;
}

function refresh(state, trigger = 'system-recommendation-check') {
  state.world.goals = resolveGoals(
    state,
    normalizeGoalState(state.world.goals, state),
    trigger
  );
  return state.world.goals.active.primary || null;
}

{
  const state = baseState(1, 1);
  const first = refresh(state);
  assert.equal(first.recommendedAction, 'facilityUse', 'chapter 1 patrol line should initially recommend the patrol station');
  state.ui.chapterSystemAutoGuides = { 'chapter:1:action:facilityUse': Date.now() };
  const afterSeen = refresh(state);
  assert.notEqual(afterSeen && afterSeen.recommendedAction, 'facilityUse', 'seen patrol station recommendation must not return in the same chapter');
}

{
  const state = baseState(1, 2);
  const first = refresh(state);
  assert.equal(first.recommendedAction, 'antiPoacher', 'chapter 1 first protection should initially recommend anti-poacher action');
  state.ui.chapterSystemAutoGuides = { 'chapter:1:action:antiPoacher': Date.now() };
  const afterSeen = refresh(state);
  assert.notEqual(afterSeen && afterSeen.recommendedAction, 'antiPoacher', 'seen anti-poacher recommendation must not return in the same chapter');
}

{
  const state = baseState(2, 0);
  const first = refresh(state);
  assert.equal(first.recommendedAction, 'habitat', 'chapter 2 should initially recommend water recovery');
  state.ui.chapterSystemAutoGuides = { 'chapter:2:action:habitat': Date.now() };
  const healthyAfterSeen = refresh(state);
  assert.notEqual(healthyAfterSeen && healthyAfterSeen.recommendedAction, 'habitat', 'seen water recovery must not return in the same chapter');
  state.world.reserve.ecology.water = 45;
  const lowWater = refresh(state);
  assert.notEqual(lowWater && lowWater.recommendedAction, 'habitat', 'low water must not resurrect a seen recovery task');
}

{
  const state = baseState(3, 0);
  state.ui.chapterSystemAutoGuides = { 'chapter:3:action:habitat': Date.now() };
  state.world.reserve.ecology.grass = 20;
  const lowGrass = refresh(state);
  assert.notEqual(lowGrass && lowGrass.recommendedAction, 'habitat', 'low grass must not resurrect a seen habitat task');
}

{
  const state = baseState(4, 0);
  state.ui.chapterSystemAutoGuides = { 'chapter:4:action:houndScout': Date.now() };
  state.world.reserve.safety = 20;
  const lowSafety = refresh(state);
  assert.notEqual(lowSafety && lowSafety.recommendedAction, 'houndScout', 'low safety must not resurrect a seen hound task');
}

{
  const state = baseState(5, 0);
  state.ui.chapterSystemAutoGuides = { 'chapter:5:action:antiPoacher': Date.now() };
  state.world.reserve.poacherPressure = 90;
  const highPoacherRisk = refresh(state);
  assert.notEqual(highPoacherRisk && highPoacherRisk.recommendedAction, 'antiPoacher', 'high poacher risk must not resurrect a seen anti-poacher task');
}

// Chapter 2 regression: after the system has recommended and completed the
// water and visitor steps, several player-led sandbox actions and a later
// metric drop must not bring either chapter task back. The next chapter step
// may remain visible, but the two completed system recommendations are retired
// for the rest of this chapter.
{
  const state = baseState(2, 0);
  const water = refresh(state);
  assert.equal(water.id, 'theme:2:restore-water');
  state.ui.chapterSystemAutoGuides = {
    'theme:2:restore-water': Date.now(),
    'chapter:2:goal:theme:2:restore-water': Date.now(),
    'chapter:2:action:habitat': Date.now()
  };
  state.world.reserve.chapterTheme.step = 1;
  state.world.reserve.progression.totalActions = 1;
  const visitors = refresh(state);
  assert.equal(visitors.id, 'theme:2:control-visitors');
  Object.assign(state.ui.chapterSystemAutoGuides, {
    'theme:2:control-visitors': Date.now(),
    'chapter:2:goal:theme:2:control-visitors': Date.now(),
    'chapter:2:action:visitorAdjust': Date.now(),
    'chapter:2:action:visitorReception': Date.now(),
    'chapter:2:action:viewVisitors': Date.now()
  });
  state.world.reserve.chapterTheme.step = 2;
  for (let index = 0; index < 4; index += 1) {
    state.world.reserve.progression.totalActions += 1;
    const current = refresh(state);
    assert.notEqual(current && current.id, 'theme:2:restore-water', 'completed water task must stay retired after sandbox actions');
    assert.notEqual(current && current.id, 'theme:2:control-visitors', 'completed visitor task must stay retired after sandbox actions');
  }
  state.world.reserve.ecology.water = 45;
  state.world.reserve.progression.totalActions += 1;
  const afterMetricDrop = refresh(state);
  assert.notEqual(afterMetricDrop && afterMetricDrop.id, 'theme:2:restore-water', 'metric risk must not resurrect the completed water task');
  assert.notEqual(afterMetricDrop && afterMetricDrop.id, 'theme:2:control-visitors', 'metric risk must not resurrect the completed visitor task');
}

// The real patrol settlement uses the derived-progress path so rewards are not
// duplicated. That path must still advance the chapter-theme chain.
{
  const game = new Game();
  game.stopLoop();
  game.state = baseState(2, 0);
  const firstWorld = JSON.parse(JSON.stringify(game.state.world));
  game.reconcileDerivedGoalProgress(firstWorld, { world: game.state.world, visual: {} }, 'habitat', { advanceChapterTheme: true });
  assert.equal(game.state.world.reserve.chapterTheme.step, 1, 'water settlement must advance the chapter theme step');
  const secondWorld = JSON.parse(JSON.stringify(game.state.world));
  game.reconcileDerivedGoalProgress(secondWorld, { world: game.state.world, visual: {} }, 'visitorReception', { advanceChapterTheme: true });
  assert.equal(game.state.world.reserve.chapterTheme.step, 2, 'visitor settlement must advance the chapter theme step');
}

for (const chapter of Array.from({ length: 20 }, (_, index) => index + 1)) {
  const game = new Game();
  game.stopLoop();
  game.screen = 'home';
  game.state = baseState(chapter, 0);
  game.currentGoalView = () => ({
    primary: {
      id: `stage:${chapter}:patrol-line`,
      kind: 'stage',
      themeChapter: chapter,
      title: '打开巡护站',
      recommendedAction: 'facilityUse',
      buttonLabel: '打开巡护站'
    }
  });
  let opened = 0;
  game.openGoalCenter = () => {
    assert.equal(
      game.state.ui.chapterSystemAutoGuides && game.state.ui.chapterSystemAutoGuides[`chapter:${chapter}:action:facilityUse`],
      undefined,
      `chapter ${chapter} must open the first card before recording it as seen`
    );
    opened += 1;
    return true;
  };
  assert.equal(game.maybeOpenMissionPush('home', { force: true }), true, `chapter ${chapter} should allow the first system recommendation`);
  game.infoDetailModal = null;
  game.state.ui.missionPushSeenKey = '';
  game.state.ui.lastMissionAutoPushAt = 0;
  game.state.ui.lastSystemTaskTriggerAt = 0;
  game.state.ui.lastUserTaskTriggerAt = 0;
  game.state.world.reserve.progression.totalActions = 20;
  assert.equal(game.maybeOpenMissionPush('home'), false, `chapter ${chapter} must not repeat the same system recommendation`);
  assert.equal(opened, 1, `chapter ${chapter} should only open one system recommendation`);
}

{
  const game = new Game();
  game.stopLoop();
  game.render = () => {};
  game.requestRender = () => {};
  game.screen = 'home';
  game.state = baseState(1, 0);
  game.currentGoalView(true);
  const expected = game.currentGoalView().primary.id;
  assert.equal(game.maybeOpenMissionPush('home', { force: true }), true, 'the real goal center should open');
  assert.equal(game.infoDetailModal.selectedGoalId, expected, 'the first system card must show the goal that triggered it');
  game.infoDetailModal = null;
  assert.notEqual(game.currentGoalView(true).primary && game.currentGoalView().primary.id, expected, 'after dismissal the seen system goal must leave the current target');
  assert.equal(game.maybeOpenMissionPush('home'), false, 'after dismissal the same system goal must not open another automatic popup');
}

{
  const game = new Game();
  game.stopLoop();
  game.screen = 'home';
  game.state = baseState(2, 0);
  game.state.world.reserve.progression.totalActions = 20;
  game.state.world.reserve.ecology.water = 45;
  game.state.ui.chapterSystemAutoGuides = { 'chapter:2:action:habitat': Date.now() };
  game.currentGoalView = () => ({
    primary: {
      id: 'theme:2:restore-water',
      kind: 'stage',
      themeTask: true,
      themeChapter: 2,
      metricFocus: 'water',
      recommendedAction: 'habitat',
      buttonLabel: '修复水源'
    }
  });
  let opened = 0;
  game.openGoalCenter = () => {
    opened += 1;
    return true;
  };
  assert.equal(game.maybeOpenMissionPush('home'), false, 'low water must not resurrect a previously seen chapter recovery recommendation');
  assert.equal(opened, 0);
}

console.log('system recommendation once check ok: all chapters, current target suppression, strict one-shot chapter ledger');
