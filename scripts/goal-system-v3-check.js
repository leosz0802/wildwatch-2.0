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
assert.deepStrictEqual(goals.daily.objectives.map((item) => item.kind), ["visitor", "ecology"]);
assert.strictEqual(goals.daily.required, 2);
assert.strictEqual(goals.daily.objectives[0].recommendedAction, "viewVisitors");
assert.strictEqual(goals.daily.objectives[1].recommendedAction, "habitat");
assert.strictEqual(goals.longTerm.tracks.length, 4);
assert.strictEqual(goals.longTerm.tracks.find((item) => item.id === "guardian_journey").current, 0, "初始存档不能误算为已完成第一章");

const legacy = normalizeGoalState({ daily: { id: "old" }, midTerm: [{ id: "old_mid" }], longTerm: { id: "old_long" } }, state);
assert.strictEqual(legacy.version, 3);
assert(legacy.legacyArchive && legacy.legacyArchive.daily.id === "old", "旧目标必须迁入只读历史");

state.world.goals = goals;
let view = buildGoalView(state);
assert(view.primary, "动物总数未达标时必须给出可执行的动物数量任务");
assert.ok(["rescueAnimal", "habitat", "animalCare"].includes(view.primary.recommendedAction), "动物缺口任务必须指向解救、栖息地或安抚");
assert.ok(/动物/.test(`${view.primary.title || ""}${view.primary.body || ""}`), "动物缺口任务文案必须点明动物总数");
assert(view.alternatives.length <= 1, "第一章最多显示一张备选卡片");
const chapterOneIds = [view.primary].concat(view.alternatives || []).filter(Boolean).map((goal) => goal.id);
assert(!chapterOneIds.some((id) => /channel:discovery|story:animal|storyEvidence|rareRecovered|story:collection|development:.+:(build|upgrade)|facility:/.test(id)), "第一章不得塞入发现频道、听动物、案件证据或建设填空卡");
assert(!(view.primary && view.primary.storyAligned && view.alternatives.some((goal) => goal.id === "story:animal")), "主线推进时不得再并列生成第二条剧情发现");

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
assert(["viewVisitors", "salvage", "buySupplies", "habitat"].includes(zeroView.primary.recommendedAction), "零资源必须直接指向游客招募、样本或补给恢复链");
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
assert.ok(["collection", "stage"].includes(discoveryShortage.world.goals.active.primary.kind), "真实剧情发现或缺动物数量任务都可以成为当前任务");
assert.ok(discoveryGoals.some((goal) => goal && goal.kind === "collection" && goal.recommendedAction === "buySupplies"), "缺麻醉弹的剧情发现必须仍在任务位上");
assert.strictEqual(discoveryFollowup.recommendedAction, "buySupplies", "缺麻醉弹的剧情发现应指向采购，不得改成无关观察");
assert.strictEqual(discoveryFollowup.purchaseId, "tranquilizer", "剧情采购必须精确指出所缺补给");
assert.strictEqual(discoveryFollowup.intendedAction, "intervention", "补齐后必须能接回原剧情行动");

const executableDiscovery = createCharacter(null, "可执行发现不得占卡");
executableDiscovery.world.collection.discovery = Object.assign({}, executableDiscovery.world.collection.discovery || {}, {
  active: {
    id: "discovery_trap_loop",
    itemId: "c3_snare",
    caseId: "case_3",
    title: "废弃陷阱",
    status: "hinted",
    actionId: "habitat",
    actionLabel: "修复水源和草场"
  }
});
executableDiscovery.world.goals = resolveGoals(executableDiscovery, executableDiscovery.world.goals, "executable_discovery");
const executableDiscoveryCards = [executableDiscovery.world.goals.active.primary].concat(executableDiscovery.world.goals.active.alternatives || []).filter(Boolean);
assert(executableDiscoveryCards.every((goal) => !/storyEvidence|rareRecovered|story:collection|discovery:c3_snare/.test(goal.id || "")), "可执行的陷阱发现不得做成强制卡片");
assert(executableDiscoveryCards.every((goal) => !/找到案件主证据|陷阱证据/.test(`${goal.title || ""}${goal.body || ""}`)), "任务卡文案不得再循环案件主证据");

const futureAttempt = advance(state, "antiPoacher");
assert(futureAttempt.goals.daily.objectives.every((item) => !item.complete), "未来任务操作不得提前完成其他每日任务");
assert(!futureAttempt.rewards.some((item) => item.source === "daily_objective"), "未解锁任务不应领取每日奖励");

const later = createCharacter(null, "第二章每日闭环测试");
later.world.reserve.progression.stage = 2;
later.world.goals = normalizeGoalState(later.world.goals, later, Date.parse("2026-07-17T04:30:00Z"));
assert.deepStrictEqual(later.world.goals.daily.objectives.map((item) => item.kind), ["visitor", "ecology"]);
assert.strictEqual(later.world.goals.daily.required, 2);
const laterView = buildGoalView(later);
assert(laterView.primary, "后续章节动物总数未达标时必须给出动物数量任务");
assert.ok(["rescueAnimal", "habitat", "animalCare"].includes(laterView.primary.recommendedAction), "健康局面不得改成游客或无关填充卡");
assert.notEqual(laterView.primary.recommendedAction, "viewVisitors", "健康局面不应自动生成游客填充卡");
assert(later.world.goals.daily.objectives.every((item) => item.recommendedAction !== "exploreMaterials" && item.targetScreen !== "survival"));

let current = later;
let result = advance(current, "viewVisitors");
current = result.state;
assert.strictEqual(current.world.goals.daily.objectives[0].progress, 1);
assert(current.world.goals.daily.objectives[0].complete, "招募游客一次即可完成当日游客任务");
assert(!current.world.goals.daily.coreClaimed, "只完成游客任务时不能领取全清奖励");
const samplesBefore = ((current.world.reserve.pendingRecovered || {}).researchSample) || 0;
result = advance(current, "habitat");
current = result.state;
assert(current.world.goals.daily.objectives[1].complete, "栖息地修复应完成水草任务");
assert(current.world.goals.daily.coreClaimed, "完成全部每日任务应领取核心奖励");
const samplesAfterCore = ((current.world.reserve.pendingRecovered || {}).researchSample) || 0;
assert(samplesAfterCore >= samplesBefore + 1, "每项每日任务奖励应进入研究样本待收区");
const fundAfterCore = current.world.reserve.fund;
const claimsAfterCore = Object.keys(current.world.goals.claims).length;
result = advance(current, "habitat");
current = result.state;
assert(!result.completions.some((item) => item.type === "daily_core"), "全清奖励不得重复领取");
assert(Object.keys(current.world.goals.claims).length >= claimsAfterCore);
assert(current.world.reserve.fund - fundAfterCore <= GOAL_BALANCE.instantRewardBudget[1], "重复操作不得再次发放核心基金");

assert(current.world.goals.daily.fullClaimed, "完成2/2必须发放补给和动物关系奖励");
result = advance(current, "visitorAdjust");
assert(!result.completions.some((item) => item.type === "daily_full"), "已移除的额外每日项不得重复发放奖励");

const stale = createCharacter(null, "无推进改派测试");
stale.world.reserve.progression.stage = 2;
stale.world.goals = normalizeGoalState(stale.world.goals, stale);
stale.world.goals.noProgressActions = GOAL_BALANCE.rerouteAfterNoProgress;
stale.world.reserve.ecology.water = 10;
stale.world.goals = resolveGoals(stale, stale.world.goals, "metric_trigger");
stale.world.goals.active.primary = Object.assign({}, buildGoalView(stale).primary);
const staleAction = stale.world.goals.active.primary.recommendedAction;
const rerouted = resolveGoals(stale, stale.world.goals, "no_progress");
const rerouteActions = [rerouted.active.primary].concat(rerouted.active.alternatives || []).filter(Boolean).map((item) => item.recommendedAction);
if (new Set([staleAction].concat(rerouteActions)).size > 1) {
  assert(rerouted.active.primary.recommendedAction !== staleAction || ["crisis", "recovery"].includes(rerouted.active.primary.kind), "连续两次无推进必须改派可替代目标");
}

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
