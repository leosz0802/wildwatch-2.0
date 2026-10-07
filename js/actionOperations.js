const ACTION_OPERATION_CONFIG = {
  houndScout: {
    title: "猎犬侦察路线",
    instruction: "三种两点组合代表不同策略；顺序决定主收益，组合决定额外风险与回报。",
    nodes: [
      { id: "scent", label: "气味线", role: "追踪", short: "偷猎-2 草场+1", icon: "houndScout", effects: { poacherPressure: -2, grass: 1 } },
      { id: "herd", label: "兽群边缘", role: "护群", short: "稳定+2 声誉+1", icon: "claw", effects: { stability: 2, reputation: 1 } },
      { id: "ridge", label: "高地捷径", role: "追击", short: "偷猎-3 稳定-1", icon: "trail", effects: { poacherPressure: -3, stability: -1 } }
    ],
    profiles: {
      "herd+scent": { id: "steady_patrol", label: "稳健巡线", risk: "低风险", promise: "兼顾压低偷猎与兽群稳定", chanceBonus: 4, effects: { stability: 1, reputation: 1 } },
      "ridge+scent": { id: "pursuit", label: "强攻追踪", risk: "高风险", promise: "最大化压制，接受稳定代价", chanceBonus: -3, effects: { poacherPressure: -2, stability: -1 } },
      "herd+ridge": { id: "herd_intercept", label: "护群截击", risk: "中风险", promise: "先护住兽群，再截断路线", chanceBonus: 1, effects: { poacherPressure: -1, grass: 1 } }
    }
  },
  antiPoacher: {
    title: "反偷猎包抄路线",
    instruction: "证据、速度与封锁不能同时拉满。先手节点获得完整效果。",
    nodes: [
      { id: "evidence", label: "证据点", role: "取证", short: "陷阱-1 执法+2", icon: "eye", effects: { enforcement: 2, reputation: 2 } },
      { id: "ambush", label: "伏击坡", role: "抓捕", short: "偷猎-4 稳定-2", icon: "antiPoacher", effects: { poacherPressure: -4, stability: -2 } },
      { id: "exit", label: "封锁出口", role: "封锁", short: "稳定+3 草场-1", icon: "signal", effects: { stability: 3, grass: -1 } }
    ],
    profiles: {
      "evidence+exit": { id: "evidence_lock", label: "证据封锁", risk: "低风险", promise: "稳住出口并保全执法证据", chanceBonus: 4, effects: { stability: 1, reputation: 1 } },
      "ambush+evidence": { id: "targeted_arrest", label: "定点抓捕", risk: "中风险", promise: "用完整证据换取更强压制", chanceBonus: 0, effects: { poacherPressure: -2, enforcement: 1 } },
      "ambush+exit": { id: "hard_blockade", label: "强硬围堵", risk: "高风险", promise: "快速围堵，但更容易扰乱保护区", chanceBonus: -4, effects: { poacherPressure: -2, stability: -1 } }
    }
  },
  habitat: {
    title: "栖息地修复顺序",
    instruction: "选择先修位置和后续连接点。优先项恢复更快，也会挤占其他资源。",
    nodes: [
      { id: "spring", label: "暗泉", role: "保水", short: "水源+4 草场-1", icon: "water", effects: { water: 4, grass: -1 } },
      { id: "meadow", label: "草甸", role: "复草", short: "草场+5 水源-1", icon: "leaf", effects: { grass: 5, water: -1 } },
      { id: "corridor", label: "迁徙口", role: "通迁", short: "稳定+3 偷猎+2", icon: "migration", effects: { stability: 3, poacherPressure: 2 } }
    ],
    profiles: {
      "meadow+spring": { id: "water_grass_recovery", label: "水草复苏", risk: "低风险", promise: "同步修复水草，收益稳定", chanceBonus: 3, effects: { water: 1, grass: 1 } },
      "corridor+spring": { id: "watering_corridor", label: "饮水通道", risk: "中风险", promise: "打通饮水路径，也会暴露活动踪迹", chanceBonus: 1, effects: { water: 1, stability: 1, poacherPressure: 1 } },
      "corridor+meadow": { id: "migration_meadow", label: "迁徙草廊", risk: "高风险", promise: "草场恢复最快，但额外消耗水源", chanceBonus: -2, effects: { grass: 2, stability: 1, water: -1 } }
    }
  },
  intervention: {
    title: "生态干预步骤",
    instruction: "先控制最紧急的问题，再选择补救步骤。每条路线都有生态或社会代价。",
    nodes: [
      { id: "isolate", label: "隔离病群", role: "控疫", short: "疾病-5 声誉-2", icon: "disease", effects: { disease: -5, reputation: -2 } },
      { id: "relocate", label: "转移兽群", role: "分流", short: "草场+4 稳定-1", icon: "migration", effects: { grass: 4, stability: -1 } },
      { id: "observe", label: "观察标记", role: "观察", short: "疾病-2 水源+1", icon: "eye", effects: { disease: -2, water: 1 } }
    ],
    profiles: {
      "isolate+observe": { id: "medical_watch", label: "医学监测", risk: "低风险", promise: "持续监测并降低疾病扩散", chanceBonus: 4, effects: { disease: -1, reputation: 1 } },
      "isolate+relocate": { id: "emergency_response", label: "紧急处置", risk: "高风险", promise: "迅速控疫，但会扰动兽群秩序", chanceBonus: -3, effects: { disease: -2, stability: -1 } },
      "observe+relocate": { id: "light_touch_diversion", label: "低干预分流", risk: "中风险", promise: "保留自然过程并改善水草", chanceBonus: 1, effects: { grass: 1, water: 1 } }
    }
  }
};
const EFFECT_LABELS = {
  poacherPressure: "偷猎",
  stability: "稳定",
  reputation: "声誉",
  safety: "安全",
  enforcement: "执法",
  fund: "基金",
  water: "水源",
  grass: "草场",
  disease: "疾病"
};
function operationConfig(actionId) {
  return ACTION_OPERATION_CONFIG[actionId] || null;
}
function operationPairKey(nodeIds) {
  return (nodeIds || []).slice(0, 2).sort().join("+");
}
function operationRouteProfile(actionId, nodeIds) {
  const config = operationConfig(actionId);
  if (!config || !config.profiles || (nodeIds || []).length !== 2) return null;
  const pairKey = operationPairKey(nodeIds);
  const profile = config.profiles[pairKey];
  return profile ? Object.assign({ pairKey }, profile) : null;
}
function operationProfiles(actionId) {
  const config = operationConfig(actionId);
  if (!config || !config.profiles) return [];
  return Object.keys(config.profiles).map((pairKey) => Object.assign({ pairKey, nodeIds: pairKey.split("+") }, config.profiles[pairKey]));
}
function normalizeOperationPlan(actionId, nodeIds) {
  const config = operationConfig(actionId);
  if (!config) return null;
  const allowed = new Set(config.nodes.map((node) => node.id));
  const selected = [];
  (nodeIds || []).forEach((id) => {
    if (allowed.has(id) && !selected.includes(id) && selected.length < 2) selected.push(id);
  });
  if (selected.length !== 2) return null;
  return { actionId, nodeIds: selected };
}
function encodeOperationPlan(plan) {
  const normalized = plan && normalizeOperationPlan(plan.actionId, plan.nodeIds);
  return normalized ? `[路线:${normalized.nodeIds.join(">")}]` : "";
}
function parseOperationPlan(command, actionId) {
  const match = String(command || "").match(/\[路线:([a-z]+)>([a-z]+)\]/i);
  return match ? normalizeOperationPlan(actionId, [match[1], match[2]]) : null;
}
function scaledDelta(value, order) {
  if (!value) return 0;
  if (order === 0) return value;
  return Math.sign(value) * Math.max(1, Math.round(Math.abs(value) * 0.6));
}
function operationPlanPreview(actionId, nodeIds) {
  const normalized = normalizeOperationPlan(actionId, nodeIds);
  const config = operationConfig(actionId);
  if (!normalized || !config) return null;
  const totals = {};
  const nodesById = {};
  config.nodes.forEach((node) => { nodesById[node.id] = node; });
  normalized.nodeIds.forEach((id, order) => {
    const node = nodesById[id];
    Object.keys((node && node.effects) || {}).forEach((key) => {
      totals[key] = (totals[key] || 0) + scaledDelta(node.effects[key], order);
    });
  });
  const profile = operationRouteProfile(actionId, normalized.nodeIds);
  Object.keys((profile && profile.effects) || {}).forEach((key) => {
    totals[key] = (totals[key] || 0) + profile.effects[key];
  });
  const deltas = Object.keys(totals).filter((key) => totals[key] !== 0).map((key) => ({ key, label: EFFECT_LABELS[key] || key, delta: totals[key] }));
  const deltaText = deltas.map((item) => `${item.label}${item.delta > 0 ? "+" : ""}${item.delta}`).join(" · ");
  return { actionId, nodeIds: normalized.nodeIds.slice(), profile, deltas, deltaText };
}
function readMetric(reserve, key) {
  if (["water", "grass", "disease"].includes(key)) return ((reserve.ecology || {})[key]) || 0;
  return reserve[key] || 0;
}
function writeMetric(reserve, key, value) {
  if (["water", "grass", "disease"].includes(key)) {
    reserve.ecology = reserve.ecology || {};
    reserve.ecology[key] = Math.max(0, Math.min(100, Math.round(value)));
    return;
  }
  if (key === "fund") reserve[key] = Math.max(0, Math.round(value));
  else reserve[key] = Math.max(0, Math.min(100, Math.round(value)));
}
function applyOperationPlan(reserve, actionId, plan) {
  const normalized = plan && normalizeOperationPlan(actionId, plan.nodeIds);
  const config = operationConfig(actionId);
  if (!normalized || !config || !reserve) return null;
  const nodesById = {};
  config.nodes.forEach((node) => { nodesById[node.id] = node; });
  const changes = [];
  const steps = normalized.nodeIds.map((id, order) => {
    const node = nodesById[id];
    const stepChanges = [];
    Object.keys(node.effects || {}).forEach((key) => {
      const before = readMetric(reserve, key);
      const requestedDelta = scaledDelta(node.effects[key], order);
      writeMetric(reserve, key, before + requestedDelta);
      const after = readMetric(reserve, key);
      const change = { key, label: EFFECT_LABELS[key] || key, before, after, delta: after - before, order };
      changes.push(change);
      stepChanges.push(change);
    });
    return { id: node.id, label: node.label, short: node.short, order, strength: order === 0 ? 100 : 60, changes: stepChanges };
  });
  const strategy = operationRouteProfile(actionId, normalized.nodeIds);
  Object.keys((strategy && strategy.effects) || {}).forEach((key) => {
    const before = readMetric(reserve, key);
    writeMetric(reserve, key, before + strategy.effects[key]);
    const after = readMetric(reserve, key);
    changes.push({ key, label: EFFECT_LABELS[key] || key, before, after, delta: after - before, order: 2, source: "strategy" });
  });
  const summary = steps.map((step) => `${step.order === 0 ? "先" : "后"}到${step.label}`).join(" → ");
  const outcome = {
    actionId,
    title: config.title,
    nodeIds: normalized.nodeIds.slice(),
    steps,
    changes,
    summary,
    strategy: strategy ? { id: strategy.id, label: strategy.label, risk: strategy.risk, promise: strategy.promise, chanceBonus: strategy.chanceBonus, pairKey: strategy.pairKey } : null,
    strategyLabel: strategy ? strategy.label : ""
  };
  reserve.lastActionOperation = outcome;
  return outcome;
}
module.exports = {
  ACTION_OPERATION_CONFIG,
  operationConfig,
  operationPairKey,
  operationRouteProfile,
  operationProfiles,
  operationPlanPreview,
  normalizeOperationPlan,
  encodeOperationPlan,
  parseOperationPlan,
  applyOperationPlan,
  scaledDelta
};
