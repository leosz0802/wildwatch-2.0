const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { applyGoalProgress, normalizeGoalState } = require("../js/goalSystem");

function makeGame() {
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, "每日单项回归");
  game.state.world.reserve.progression.stage = 2;
  game.state.world.reserve.progression.displayChapter = 2;
  game.state.world.goals = normalizeGoalState(game.state.world.goals, game.state);
  game.state.ui = { onboarding: { version: 2, completed: true, recruitmentDone: true, seen: {} } };
  game.screen = "home";
  game.render = game.toast = () => {};
  game.setScreen = (screen) => { game.screen = screen; };
  game.playSfx = () => {};
  return game;
}

function kinds(game) {
  return ((game.state.world.goals.daily || {}).objectives || []).map((item) => item.kind);
}

function completeByAction(game, action) {
  const before = JSON.parse(JSON.stringify(game.state));
  const result = applyGoalProgress(before, game.state, { action, now: Date.now() });
  game.state = result.state;
  return result;
}

const visitorFirst = makeGame();
assert.deepEqual(kinds(visitorFirst), ["visitor", "ecology"]);
const visitorOnly = completeByAction(visitorFirst, "viewVisitors");
assert(visitorOnly.completions.some((item) => item.type === "daily_objective" && item.id === "daily_visitor"));
assert(!visitorOnly.completions.some((item) => item.type === "daily_core" || item.type === "daily_full"), "只完成招募不得发放全清");
assert.equal(visitorFirst.dailyEventChecklist().complete, 1);
assert.equal(visitorFirst.dailyEventChecklist().remaining, 1);
assert.equal(visitorFirst.dailyPartialCompletionLine(visitorOnly), "招揽游客来访已完成");
visitorFirst.markDailyPresentationSeen();
visitorFirst.infoDetailModal = null;
assert.equal(visitorFirst.maybeOpenMissionPush("settlement", { force: true }), false, "完成一项后不得再自动弹出每日");
assert.equal(visitorFirst.maybeOpenMissionPush("home"), false, "完成一项后主页也不得再弹出每日");

const ecologyFirst = makeGame();
const ecologyOnly = completeByAction(ecologyFirst, "habitat");
assert(ecologyOnly.completions.some((item) => item.type === "daily_objective" && item.id === "daily_ecology"));
assert(!ecologyOnly.completions.some((item) => item.type === "daily_core" || item.type === "daily_full"), "只完成水草不得发放全清");
assert.equal(ecologyFirst.dailyEventChecklist().complete, 1);
assert.equal(ecologyFirst.dailyEventChecklist().remaining, 1);
ecologyFirst.markDailyPresentationSeen();
ecologyFirst.infoDetailModal = null;
assert.equal(ecologyFirst.maybeOpenMissionPush("settlement", { force: true }), false, "先做水草后也不得再自动弹出每日");

const both = makeGame();
completeByAction(both, "viewVisitors");
const second = completeByAction(both, "habitat");
assert(second.completions.some((item) => item.type === "daily_objective" && item.id === "daily_ecology"));
assert(second.completions.some((item) => item.type === "daily_core"), "两项都完成后才结算全部完成");
assert(second.completions.some((item) => item.type === "daily_full"));
assert.equal(both.dailyEventChecklist().remaining, 0);

const staleRequired = makeGame();
staleRequired.state.world.goals.daily.required = 1;
const stale = completeByAction(staleRequired, "viewVisitors");
assert(!stale.completions.some((item) => item.type === "daily_core" || item.type === "daily_full"), "旧存档 required=1 也不能把单项当成全清");
assert.equal(staleRequired.state.world.goals.daily.required, 2);

const list = makeGame();
let routed = null;
list.executeGoalAction = (goal) => {
  routed = goal;
  return true;
};
assert(list.openDailyEvents());
assert.equal(list.infoDetailModal.checklist.total, 2);
assert(list.executeDailyEvent("daily_ecology", list.infoDetailModal.checklist.dateKey), "未完成招募时也可以先做水草");
assert.equal(routed.recommendedAction, "habitat");
assert.equal(list.infoDetailModal, null);

console.log("daily partial complete check ok (one item is not full clear, remaining daily does not auto-popup)");
