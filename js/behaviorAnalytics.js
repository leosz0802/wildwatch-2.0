const ACTION_IDS = Object.freeze([
  "houndScout",
  "antiPoacher",
  "habitat",
  "salvage",
  "buySupplies",
  "intervention",
  "exploreMaterials"
]);

const ACTION_LABELS = Object.freeze({
  houndScout: "猎犬侦察",
  antiPoacher: "驱赶偷猎",
  habitat: "修复栖息地",
  salvage: "移交守护样本",
  buySupplies: "采购补给",
  intervention: "生态干预",
  exploreMaterials: "物种档案盒探索"
});

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function actionId(value) {
  const id = String(value || "").trim();
  return ACTION_IDS.includes(id) ? id : "patrol";
}

function metricSnapshot(reserve = {}) {
  const ecology = reserve.ecology || {};
  return {
    fund: number(reserve.fund),
    water: number(ecology.water),
    grass: number(ecology.grass),
    safety: number(reserve.safety),
    animals: number((((reserve.base || {}).protectedAnimals) || {}).total || reserve.base && reserve.base.animals)
  };
}

function recordActionAnalytics(beforeReserve = {}, afterReserve = {}, id = "", label = "", now = Date.now()) {
  const normalizedId = actionId(id);
  const beforeProgression = beforeReserve.progression || {};
  const progression = afterReserve.progression = afterReserve.progression || {};
  const actionCountBefore = Math.max(0, Math.round(number(beforeProgression.totalActions)));
  const storedAfter = Math.max(0, Math.round(number(progression.totalActions)));
  const actionCountAfter = Math.max(actionCountBefore + 1, storedAfter);
  const actionCountDelta = actionCountAfter - actionCountBefore;
  progression.totalActions = actionCountAfter;
  const before = metricSnapshot(beforeReserve);
  const after = metricSnapshot(afterReserve);
  const delta = Object.keys(before).reduce((result, key) => {
    result[key] = after[key] - before[key];
    return result;
  }, {});
  const event = {
    id: `action_${now}_${actionCountAfter}`,
    actionId: normalizedId,
    actionLabel: String(label || ACTION_LABELS[normalizedId] || "守护行动").slice(0, 40),
    actionCount: actionCountAfter,
    actionCountDelta,
    before,
    after,
    delta,
    recordedAt: now
  };
  const analytics = afterReserve.behaviorAnalytics || {};
  afterReserve.behaviorAnalytics = {
    version: 1,
    actionCount: actionCountAfter,
    actionCountDelta,
    lastAction: event,
    history: (Array.isArray(analytics.history) ? analytics.history : []).concat(event).slice(-80)
  };
  return event;
}

function applyActionAnalytics(result, beforeReserve = {}, actionIdValue = "", actionLabel = "", now = Date.now()) {
  if (!result || !result.world || !result.world.reserve) return null;
  const event = recordActionAnalytics(beforeReserve, result.world.reserve, actionIdValue, actionLabel, now);
  const impact = {
    label: "守护记录",
    before: event.actionCount - event.actionCountDelta,
    after: event.actionCount,
    delta: event.actionCountDelta,
    text: `守护记录 +${event.actionCountDelta}`
  };
  result.visual = Object.assign({}, result.visual || {}, {
    actionImpact: impact,
    actionCount: event.actionCount,
    actionCountDelta: event.actionCountDelta,
    behaviorEvent: event,
    quickFeedback: [result.visual && result.visual.quickFeedback, impact.text].filter(Boolean).join(" · ")
  });
  (result.reports || []).forEach((report) => {
    report.visual = Object.assign({}, report.visual || {}, {
      actionImpact: impact,
      actionCount: event.actionCount,
      actionCountDelta: event.actionCountDelta,
      behaviorEvent: event
    });
  });
  return event;
}

module.exports = {
  ACTION_IDS,
  ACTION_LABELS,
  recordActionAnalytics,
  applyActionAnalytics
};
