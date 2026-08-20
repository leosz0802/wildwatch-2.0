const ACTION_OPERATION_CONFIG = {
  houndScout: {
    title: "猎犬侦察路线",
    instruction: "先确定主追踪点，再选择一处兼顾点。路线顺序会改变实际收益。",
    nodes: [
      { id: "scent", label: "气味线", short: "偷猎-2 草场+1", icon: "houndScout", effects: { poacherPressure: -2, grass: 1 } },
      { id: "herd", label: "兽群边缘", short: "稳定+2 声誉+1", icon: "claw", effects: { stability: 2, reputation: 1 } },
      { id: "ridge", label: "高地捷径", short: "偷猎-3 稳定-1", icon: "trail", effects: { poacherPressure: -3, stability: -1 } }
    ]
  },
  antiPoacher: {
    title: "反偷猎包抄路线",
    instruction: "证据、速度与封锁不能同时拉满。先手节点获得完整效果。",
    nodes: [
      { id: "evidence", label: "证据点", short: "执法+2 声誉+2", icon: "intel", effects: { enforcement: 2, reputation: 2 } },
      { id: "ambush", label: "伏击坡", short: "偷猎-4 稳定-2", icon: "antiPoacher", effects: { poacherPressure: -4, stability: -2 } },
      { id: "exit", label: "封锁出口", short: "稳定+3 草场-1", icon: "signal", effects: { stability: 3, grass: -1 } }
    ]
  },
  habitat: {
    title: "栖息地修复顺序",
    instruction: "选择先修位置和后续连接点。优先项恢复更快，也会挤占其他资源。",
    nodes: [
      { id: "spring", label: "暗泉", short: "水源+4 草场-1", icon: "water", effects: { water: 4, grass: -1 } },
      { id: "meadow", label: "草甸", short: "草场+5 水源-1", icon: "leaf", effects: { grass: 5, water: -1 } },
      { id: "corridor", label: "迁徙口", short: "稳定+3 偷猎+2", icon: "migration", effects: { stability: 3, poacherPressure: 2 } }
    ]
  },
  intervention: {
    title: "生态干预步骤",
    instruction: "先控制最紧急的问题，再选择补救步骤。每条路线都有生态或社会代价。",
    nodes: [
      { id: "isolate", label: "隔离病群", short: "疾病-5 声誉-2", icon: "disease", effects: { disease: -5, reputation: -2 } },
      { id: "relocate", label: "转移兽群", short: "草场+4 稳定-1", icon: "migration", effects: { grass: 4, stability: -1 } },
      { id: "observe", label: "观察标记", short: "疾病-2 水源+1", icon: "eye", effects: { disease: -2, water: 1 } }
    ]
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
  else if (key === "intel") reserve[key] = Math.max(0, Math.min(6, Math.round(value)));
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
  const summary = steps.map((step) => `${step.order === 0 ? "先" : "后"}到${step.label}`).join(" → ");
  const outcome = { actionId, title: config.title, nodeIds: normalized.nodeIds.slice(), steps, changes, summary };
  reserve.lastActionOperation = outcome;
  return outcome;
}

module.exports = {
  ACTION_OPERATION_CONFIG,
  operationConfig,
  normalizeOperationPlan,
  encodeOperationPlan,
  parseOperationPlan,
  applyOperationPlan,
  scaledDelta
};
