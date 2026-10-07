const { habitatRecoveryGain } = require("./balanceConfig");
const MIN_OFFLINE_MS = 30 * 60 * 1000;
const MAX_OFFLINE_MS = 30 * 24 * 60 * 60 * 1000;
function number(value) {
  return Math.round(Number(value) || 0);
}
function sum(group = {}) {
  return Object.keys(group || {}).reduce((total, key) => total + number(group[key]), 0);
}
function offlineSnapshot(state = {}, capturedAt = Date.now()) {
  const world = state.world || {};
  const reserve = world.reserve || {};
  const ecology = reserve.ecology || {};
  const reports = Array.isArray(state.reports) ? state.reports : [];
  return {
    capturedAt: Math.max(0, Number(capturedAt) || Date.now()),
    guardianDay: number(((reserve.guardianCycle || {}).day) || world.day || 1),
    level: number((reserve.progression || {}).level || 1),
    territory: {
      water: number(ecology.water),
      grass: number(ecology.grass),
      disease: number(ecology.disease),
      poacherPressure: number(reserve.poacherPressure),
      migration: number((reserve.migration || {}).delta),
      animals: sum(ecology.predators) + sum(ecology.herbivores) + sum(ecology.birds)
    },
    resources: {
      fund: number(reserve.fund),
      supplies: sum(reserve.supplies),
      samples: sum(reserve.inventory),
      pending: sum(reserve.pendingRecovered)
    },
    reportCount: reports.length,
    latestReportDay: number((reports[reports.length - 1] || {}).day)
  };
}
function signed(value) {
  const delta = number(value);
  return delta > 0 ? `+${delta}` : `${delta}`;
}
function elapsedLabel(elapsedMs) {
  const hours = Math.max(1, Math.floor(elapsedMs / 3600000));
  if (hours < 24) return `${hours}小时`;
  const days = Math.floor(hours / 24);
  const remainder = hours % 24;
  return remainder ? `${days}天${remainder}小时` : `${days}天`;
}
function eventSummary(state, previous) {
  const reports = Array.isArray(state.reports) ? state.reports : [];
  const fresh = reports.slice(Math.max(0, number(previous.reportCount))).slice(-3);
  if (fresh.length) {
    return fresh.map((report) => report.title || (((report.visual || {}).eventCard || {}).title) || "一条巡护记录已归档").join("；");
  }
  const reserve = ((state.world || {}).reserve) || {};
  const ecology = reserve.ecology || {};
  if ((reserve.poacherPressure || 0) >= 55) return "边界仍有可疑脚印，回来后建议先检查反偷猎任务。";
  if ((ecology.water || 0) < 50 || (ecology.grass || 0) < 50) return "水草压力仍在，离线期间没有替你自动消耗补给。";
  return "巡护队维持了日常观察，没有替你自动执行关键选择。";
}
function applyOfflineAutonomy(state, elapsedMs) {
  const reserve = (((state || {}).world || {}).reserve) || {};
  const ecology = reserve.ecology || (reserve.ecology = {});
  const days = Math.max(1, Math.min(7, Math.floor(elapsedMs / 86400000)));
  const activeFacilities = Object.values(((reserve.development || {}).nodes) || {})
    .filter((node) => Number(node.level || 0) > 0).length;
  const waterBase = Math.min(3, Math.max(1, Math.ceil(days * (activeFacilities ? 0.7 : 0.35))));
  const grassBase = Math.min(3, Math.max(1, Math.ceil(days * (activeFacilities ? 0.55 : 0.25))));
  const waterRecovery = habitatRecoveryGain(ecology.water, waterBase);
  const grassRecovery = habitatRecoveryGain(ecology.grass, grassBase);
  ecology.water = Math.max(0, Math.min(100, number(ecology.water) + waterRecovery));
  ecology.grass = Math.max(0, Math.min(100, number(ecology.grass) + grassRecovery));
  ecology.disease = Math.max(0, Math.min(100, number(ecology.disease) - Math.min(2, Math.max(1, Math.floor(days / 2)))));
  reserve.poacherPressure = Math.max(0, Math.min(100, number(reserve.poacherPressure) - Math.min(2, Math.max(1, Math.floor(days / 2)))));
  reserve.safety = Math.max(0, Math.min(100, number(reserve.safety) + (activeFacilities ? 1 : 0)));
  const visitors = Math.max(0, Math.round(days * (activeFacilities ? 2 : 1)));
  reserve.fund = Math.max(0, number(reserve.fund) + visitors);
  reserve.offlineAutonomy = Object.assign({}, reserve.offlineAutonomy || {}, {
    lastDays: days, lastVisitors: visitors, lastAt: Date.now(),
    note: "离线期间由巡护队、游客和自然恢复维持基础运转"
  });
}
function prepareOfflineBrief(state, now = Date.now()) {
  if (!state || !state.character || !state.world) return { brief: null, state };
  state.ui = Object.assign({}, state.ui || {});
  const current = offlineSnapshot(state, now);
  const saved = state.ui.offlineCheckpoint;
  const lifeLastSeen = Number((((state.world || {}).lifeMemory || {}).lastSeenAt) || 0);
  const previousAt = Math.max(0, Number((saved || {}).capturedAt) || lifeLastSeen || now);
  const elapsedMs = Math.max(0, Math.min(MAX_OFFLINE_MS, now - previousAt));
  const previous = saved && saved.territory && saved.resources ? saved : offlineSnapshot(state, previousAt);
  state.ui.offlineCheckpoint = current;
  if (elapsedMs < MIN_OFFLINE_MS) return { brief: null, state };
  const unchangedSinceCheckpoint = JSON.stringify(current.territory) === JSON.stringify(previous.territory)
    && JSON.stringify(current.resources) === JSON.stringify(previous.resources);
  if (unchangedSinceCheckpoint) {
    applyOfflineAutonomy(state, elapsedMs);
  }
  const settled = offlineSnapshot(state, now);
  const territory = settled.territory;
  const oldTerritory = previous.territory || {};
  const resources = settled.resources;
  const oldResources = previous.resources || {};
  return {
    state,
    brief: {
      id: `offline_${Math.floor(previousAt / 60000)}_${Math.floor(now / 60000)}`,
      elapsedMs,
      elapsedLabel: elapsedLabel(elapsedMs),
      title: "欢迎回来，巡护员",
      territoryLine: `水源 ${oldTerritory.water || 0}→${territory.water} · 草场 ${oldTerritory.grass || 0}→${territory.grass} · 动物 ${oldTerritory.animals || 0}→${territory.animals}`,
      riskLine: `偷猎 ${signed(territory.poacherPressure - (oldTerritory.poacherPressure || 0))} · 疾病 ${signed(territory.disease - (oldTerritory.disease || 0))} · 迁移 ${signed(territory.migration - (oldTerritory.migration || 0))}`,
      resourceLine: `保护基金 ${signed(resources.fund - (oldResources.fund || 0))} · 补给 ${signed(resources.supplies - (oldResources.supplies || 0))} · 样本 ${signed(resources.samples - (oldResources.samples || 0))} · 待收 ${signed(resources.pending - (oldResources.pending || 0))}`,
      eventLine: eventSummary(state, previous),
      day: settled.guardianDay,
      level: settled.level
    }
  };
}
function markOfflineCheckpoint(state, now = Date.now()) {
  if (!state || !state.character || !state.world) return state;
  state.ui = Object.assign({}, state.ui || {}, { offlineCheckpoint: offlineSnapshot(state, now) });
  return state;
}
module.exports = {
  MIN_OFFLINE_MS,
  offlineSnapshot,
  prepareOfflineBrief,
  markOfflineCheckpoint
};
