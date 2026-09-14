const assert = require("assert");
const { createCharacter } = require("../js/storage");
const {
  GOAL_BALANCE,
  goalDateKey,
  normalizeGoalState,
  resolveGoals,
  applyGoalProgress,
  buildGoalView,
  selectActiveGoal,
  actionExecutable
} = require("../js/goalSystem");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function advance(state, action) {
  const before = clone(state);
  const after = clone(state);
  after.world.reserve.progression.totalActions = (after.world.reserve.progression.totalActions || 0) + 1;
  return applyGoalProgress(before, after, { action, now: Date.parse("2026-07-17T04:30:00Z") });
}

assert.strictEqual(goalDateKey(Date.parse("2026-07-16T19:59:00Z")), "2026-07-16", "北京时间04:00前仍属于上一目标日");
assert.strictEqual(goalDateKey(Date.parse("2026-07-16T20:00:00Z")), "2026-07-17", "北京时间04:00必须刷新目标日");

const state = createCharacter(null, "目标闭环测试");
let goals = normalizeGoalState(state.world.goals, state, Date.parse("2026-07-17T04:30:00Z"));
assert.strictEqual(goals.version, 3);
assert.strictEqual(goals.daily.objectives.length, 4);
assert.deepStrictEqual(goals.daily.objectives.map((item) => item.kind), ["guard", "economy", "animal", "visitor"]);
assert.strictEqual(goals.daily.required, 4);
assert.strictEqual(goals.longTerm.tracks.length, 4);
assert.strictEqual(goals.longTerm.tracks.find((item) => item.id === "guardian_journey").current, 0, "初始存档不能误算为已完成第一章");

const legacy = normalizeGoalState({ daily: { id: "old" }, midTerm: [{ id: "old_mid" }], longTerm: { id: "old_long" } }, state);
assert.strictEqual(legacy.version, 3);
assert(legacy.legacyArchive && legacy.legacyArchive.daily.id === "old", "旧目标必须迁入只读历史");

state.world.goals = goals;
let view = buildGoalView(state);
assert(view.primary && view.primary.executable, "任意时刻必须存在可执行主目标");
assert(view.alternatives.length <= 2, "最多只能显示两个备选目标");
assert.strictEqual(view.primary.recommendedAction, "houndScout", "健康初始局面应先引导处理守护风险");
assert(!(view.primary.storyAligned && view.alternatives.some((goal) => goal.id === "story:animal")), "主线推进时不得再并列生成第二条剧情发现");

// 使用真实目标日验证手动改派，避免跨日刷新本身合法地重建日常目标。
const selectionState = createCharacter(null, "目标手动改派测试");
selectionState.world.goals = normalizeGoalState(selectionState.world.goals, selectionState, Date.now());
const selectionView = buildGoalView(selectionState, selectionState.world.goals);
if (selectionView.alternatives[0]) {
  const selectedId = selectionView.alternatives[0].id;
  let selectedGoals = selectActiveGoal(selectionState.world.goals, selectedId);
  assert.strictEqual(selectedGoals.active.primary.id, selectedId, "玩家选择备选后必须替换唯一当前目标");
  assert.strictEqual(selectedGoals.active.manualSelectedId, selectedId, "手动选择必须被记录");
  selectedGoals = resolveGoals(selectionState, selectedGoals, "manual_selection");
  assert.strictEqual(selectedGoals.active.primary.id, selectedId, "普通刷新不得把手动选择切回旧目标");
}

const zero = createCharacter(null, "零资源目标测试");
zero.world.reserve.fund = 0;
Object.keys(zero.world.reserve.supplies).forEach((key) => { zero.world.reserve.supplies[key] = 0; });
Object.keys(zero.world.reserve.inventory).forEach((key) => { zero.world.reserve.inventory[key] = 0; });
zero.world.goals = normalizeGoalState(zero.world.goals, zero);
const zeroView = buildGoalView(zero);
assert(["exploreMaterials", "salvage", "buySupplies"].includes(zeroView.primary.recommendedAction), "零资源必须直接指向基金与补给恢复链");
assert(actionExecutable(zero, zeroView.primary.recommendedAction), "恢复目标必须真实可执行");

const crisis = clone(state);
crisis.world.reserve.emergency = { active: { id: "outbreak", title: "疾病扩散", recommendedAction: "intervention", daysRemaining: 2 } };
crisis.world.reserve.supplies.tranquilizer = 3;
crisis.world.reserve.fund = 1200;
crisis.world.goals = resolveGoals(crisis, crisis.world.goals, "crisis");
assert.strictEqual(crisis.world.goals.active.primary.kind, "crisis", "活跃危机必须压过所有普通目标");

const discoveryShortage = createCharacter(null, "剧情发现补给改派测试");
discoveryShortage.world.reserve.fund = 1600;
discoveryShortage.world.reserve.supplies.tranquilizer = 0;
discoveryShortage.world.collection.discovery = Object.assign({}, discoveryShortage.world.collection.discovery || {}, {
  active: {
    id: "discovery_injured_herd",
    itemId: "c1_footprint",
    caseId: "case_1",
    title: "病弱种群留下的痕迹",
    status: "hinted",
    actionId: "intervention",
    actionLabel: "生态干预"
  }
});
discoveryShortage.world.goals = resolveGoals(discoveryShortage, discoveryShortage.world.goals, "discovery_shortage");
const discoveryGoals = [discoveryShortage.world.goals.active.primary].concat(discoveryShortage.world.goals.active.alternatives || []);
const discoveryFollowup = discoveryGoals.find((goal) => goal && goal.storyAligned && goal.evidenceAligned);
assert(discoveryFollowup, "附加收藏降级后仍必须保留剧情发现的因果上下文");
assert.notStrictEqual(discoveryShortage.world.goals.active.primary.kind, "collection", "附加收藏不得压过保护区主要经营目标");
assert.strictEqual(discoveryFollowup.recommendedAction, "buySupplies", "缺麻醉弹的剧情发现应指向采购，不得改成无关观察");
assert.strictEqual(discoveryFollowup.purchaseId, "tranquilizer", "剧情采购必须精确指出所缺补给");
assert.strictEqual(discoveryFollowup.intendedAction, "intervention", "补齐后必须能接回原剧情行动");

const futureAttempt = advance(state, "visitorAdjust");
assert(futureAttempt.goals.daily.objectives.every((item) => !item.complete), "未来任务操作不得提前完成其他每日任务");
assert(!futureAttempt.rewards.some((item) => item.source === "daily_objective"), "未解锁任务不应领取每日奖励");

let current = state;
let result = advance(current, "houndScout");
current = result.state;
assert.strictEqual(current.world.goals.daily.objectives[0].progress, 1);
assert(!current.world.goals.daily.coreClaimed, "未完成全部每日任务不能领取全清奖励");
result = advance(current, "houndScout");
current = result.state;
assert(current.world.goals.daily.objectives[0].complete, "守护目标需要两次有效行动完成");
assert(!current.world.goals.daily.coreClaimed, "只完成守护任务时不能领取全清奖励");
const samplesBefore = ((current.world.reserve.pendingRecovered || {}).researchSample) || 0;
result = advance(current, "buySupplies");
current = result.state;
assert(!current.world.goals.daily.coreClaimed, "完成部分任务不能提前领取全清奖励");
const samplesAfterCore = ((current.world.reserve.pendingRecovered || {}).researchSample) || 0;
assert(samplesAfterCore >= samplesBefore + 1, "每项每日任务奖励应进入研究样本待收区");
const fundAfterCore = current.world.reserve.fund;
const claimsAfterCore = Object.keys(current.world.goals.claims).length;
result = advance(current, "buySupplies");
current = result.state;
assert(!result.completions.some((item) => item.type === "daily_core"), "全清奖励不得重复领取");
assert(Object.keys(current.world.goals.claims).length >= claimsAfterCore);
assert(current.world.reserve.fund - fundAfterCore <= GOAL_BALANCE.instantRewardBudget[1], "重复操作不得再次发放核心基金");

result = advance(current, "exploreMaterials");
current = result.state;
assert(!current.world.goals.daily.fullClaimed, "仍有游客任务时不能发放全清奖励");
result = advance(current, "visitorAdjust");
current = result.state;
assert(current.world.goals.daily.fullClaimed, "完成4/4必须发放补给和动物关系奖励");
assert(result.completions.some((item) => item.type === "daily_full"));

const stale = clone(state);
stale.world.goals.noProgressActions = GOAL_BALANCE.rerouteAfterNoProgress;
stale.world.goals.active.primary = Object.assign({}, buildGoalView(stale).primary);
const staleAction = stale.world.goals.active.primary.recommendedAction;
const rerouted = resolveGoals(stale, stale.world.goals, "no_progress");
assert(rerouted.active.primary.recommendedAction !== staleAction || rerouted.active.primary.kind === "crisis", "连续两次无推进必须改派可替代目标");

const beforeCheckpoint = createCharacter(null, "长线节点测试");
beforeCheckpoint.world.reserve.progression.stage = 8;
beforeCheckpoint.world.reserve.progression.chapterComplete = false;
beforeCheckpoint.world.goals = normalizeGoalState(beforeCheckpoint.world.goals, beforeCheckpoint);
const afterCheckpoint = clone(beforeCheckpoint);
afterCheckpoint.world.reserve.progression.stage = 9;
const checkpointResult = applyGoalProgress(beforeCheckpoint, afterCheckpoint, { action: "houndScout", now: Date.parse("2026-07-17T04:30:00Z") });
assert.strictEqual(checkpointResult.state.world.goals.claims["long:guardian_journey:3"], "checkpoint", "8/10只应点亮叙事节点，不能提前发放终奖");
assert(!checkpointResult.state.world.goals.longTerm.unlocks.guardian_journey, "8/10不能提前解锁长线终奖");

const beforeFinal = createCharacter(null, "长线终奖测试");
beforeFinal.world.reserve.progression.stage = 10;
beforeFinal.world.reserve.progression.chapterComplete = false;
beforeFinal.world.goals = normalizeGoalState(beforeFinal.world.goals, beforeFinal);
beforeFinal.world.goals.daily.dateKey = "2026-07-17";
beforeFinal.world.goals.daily.objectives.forEach((item) => { item.progress = item.target; item.complete = true; });
beforeFinal.world.goals.daily.coreClaimed = true;
beforeFinal.world.goals.daily.fullClaimed = true;
const afterFinal = clone(beforeFinal);
afterFinal.world.reserve.progression.chapterComplete = true;
const finalResult = applyGoalProgress(beforeFinal, afterFinal, { action: "houndScout", now: Date.parse("2026-07-17T04:30:00Z") });
const guardianUnlock = finalResult.state.world.goals.longTerm.unlocks.guardian_journey;
assert(finalResult.state.world.reserve.fund - beforeFinal.world.reserve.fund === GOAL_BALANCE.chapterFundReward[10], "终章联合项目拨款必须完整且只结算一次");
assert(GOAL_BALANCE.chapterFundReward[10] >= 1200, "终章拨款必须保证零基金玩家回到Lv.5安全线");
assert(guardianUnlock && guardianUnlock.appearance && guardianUnlock.title && guardianUnlock.shareCard, "长线100%必须真正解锁外观、称号和分享卡");
assert.strictEqual(finalResult.state.world.goals.claims["long:guardian_journey:4"], "cosmetic", "10/10才解锁长线终奖");

console.log("goal system v3 check ok");
