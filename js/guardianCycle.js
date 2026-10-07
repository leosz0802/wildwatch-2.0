const { FIRST_RETURN_HOOK_COPY } = require("./firstReturnHook");
const PHASES = [
  { id: "morning", label: "上午", short: "晨", time: "08:20" },
  { id: "afternoon", label: "下午", short: "午", time: "13:40" },
  { id: "dusk", label: "黄昏", short: "暮", time: "18:10" }
];
const SEASON_LENGTH = 12;
const YEAR_LENGTH = 24;
const MASTERY_THRESHOLDS = [0, 60, 150, 280, 450, 700, 1000, 1400, 1900, 2500];
const MASTERY_DEFS = {
  patrol: {
    id: "patrol",
    label: "巡护",
    actions: ["houndScout", "antiPoacher", "patrol"],
    branches: {
      5: [{ id: "tracking", label: "追踪", unlock: "沙盘会标出最近的可疑痕迹" }, { id: "guard", label: "防护", unlock: "危机恢复窗口延长一次行动" }],
      10: [{ id: "regional_warning", label: "区域预警", unlock: "提前一天预告高风险区域" }, { id: "joint_enforcement", label: "联合执法", unlock: "驱赶成功时额外清除一处脚印" }]
    }
  },
  habitat: {
    id: "habitat",
    label: "栖息地",
    actions: ["habitat", "intervention"],
    branches: {
      5: [{ id: "hydrology", label: "水文", unlock: "修复后显示次日水位趋势" }, { id: "grassland", label: "草场", unlock: "草场恢复会吸引一小群食草动物" }],
      10: [{ id: "wetland_network", label: "湿地网络", unlock: "丰水区域形成永久湿地连接" }, { id: "eco_corridor", label: "生态走廊", unlock: "迁徙动物会沿可见路线进入保护区" }]
    }
  },
  relationship: {
    id: "relationship",
    label: "动物关系",
    actions: ["listen", "comfort", "rescue", "guide"],
    branches: {
      5: [{ id: "rescue", label: "救助", unlock: "受伤动物会主动靠近救助点" }, { id: "observe", label: "观察", unlock: "倾听时显示动物最近的路线记忆" }],
      10: [{ id: "life_guardian", label: "生命守护", unlock: "关键救助可避免一次永久离开" }, { id: "animal_guide", label: "动物引路", unlock: "高信任动物会直接提供珍稀收藏路线" }]
    }
  }
};
const SEVEN_DAY_BEATS = {
  1: { title: "干涸水点", prompt: "跟随晨角鹿，修复第一处水点。", actions: ["habitat"], highlight: "水面扩大，晨角鹿第一次回应。" },
  2: { title: "逆行脚印", prompt: "脚印属于陌生独狼，派猎犬确认它为何靠近水源。", actions: ["houndScout", "antiPoacher"], highlight: "独狼的来路被确认，泥岸留下第一件回收物。" },
  3: { title: "第一次周转", prompt: "移交回收物，再为巡护采购补给。", actions: ["salvage", "buySupplies"], highlight: "基金开始真正支撑巡护。" },
  4: { title: "水草取舍", prompt: "在修水源和保草场之间做出选择。", actions: ["habitat", "intervention"], highlight: "你的选择改变了动物路线。" },
  5: { title: "沉牙的危机", prompt: "找到沉牙，回应它正在面对的风险。", actions: ["houndScout", "antiPoacher", "intervention"], highlight: "沉牙记住了这次守护。" },
  6: { title: "巡护站启用", prompt: "去巡护站派出一次短巡。消耗狗粮和基金，立刻找回动物。", actions: ["facilityUse"], highlight: "巡护站开始工作。" },
  7: { title: "七日回望", prompt: "完成本周最后一次守护行动。", actions: ["houndScout", "habitat", "antiPoacher", "intervention"], highlight: "设施点亮，动物在沙盘中央重聚。" }
};
const MAIN_CAST = [
  { id: "npc_deer", chapter: 1, name: "晨角", rainRegion: "meadow", dryRegion: "river", arc: "第一次带鹿群靠近营地" },
  { id: "npc_wolf", chapter: 1, name: "沉牙", rainRegion: "center", dryRegion: "meadow", arc: "判断新巡护员是否值得信任" },
  { id: "npc_crow", chapter: 2, name: "黑铃", rainRegion: "north", dryRegion: "river", arc: "记住每一条异常边界" },
  { id: "npc_bear", chapter: 2, name: "厚掌", rainRegion: "rocks", dryRegion: "lake", arc: "在缺水季寻找安全矿盐地" },
  { id: "npc_lion", chapter: 3, name: "烈鬃", rainRegion: "meadow", dryRegion: "river", arc: "克制捕食与守住领地之间的选择" },
  { id: "npc_leopard", chapter: 3, name: "影斑", rainRegion: "center", dryRegion: "rocks", arc: "追踪没有名字的运输线" },
  { id: "npc_elephant", chapter: 4, name: "云耳", rainRegion: "river", dryRegion: "lake", arc: "带象群重走被遗忘的水路" },
  { id: "npc_zebra", chapter: 4, name: "条纹", rainRegion: "meadow", dryRegion: "river", arc: "让幼崽学会新的迁徙路线" },
  { id: "npc_mink", chapter: 5, name: "霜脊", rainRegion: "lake", dryRegion: "river", arc: "见证浅滩属于谁" },
  { id: "npc_eagle", chapter: 5, name: "高旋", rainRegion: "north", dryRegion: "rocks", arc: "从高空看见共同守护的边界" }
];
function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}
function guardianSeason(day) {
  const safeDay = Math.max(1, Math.round(Number(day) || 1));
  const cycleDay = ((safeDay - 1) % YEAR_LENGTH) + 1;
  const rainy = cycleDay <= SEASON_LENGTH;
  return {
    name: rainy ? "雨季" : "旱季",
    day: rainy ? cycleDay : cycleDay - SEASON_LENGTH,
    cycleDay,
    year: Math.floor((safeDay - 1) / YEAR_LENGTH) + 1,
    changed: cycleDay === 1 || cycleDay === SEASON_LENGTH + 1
  };
}
function seasonBeat(day) {
  const season = guardianSeason(day);
  const beats = {
    1: "季节更替：查看水草预测",
    3: "动物时刻：留意沙盘上的新动静",
    6: "调查窗口：动物更容易提供季节线索",
    9: "命名动物剧情即将发生",
    12: "季末总结：保护区将记录本季变化"
  };
  return beats[season.day] || "普通守护日：按当前风险自由安排三次行动";
}
function createMasteryState() {
  return {
    version: 1,
    patrol: { xp: 0, level: 1, branches: {}, pendingChoice: null, lastGain: null },
    habitat: { xp: 0, level: 1, branches: {}, pendingChoice: null, lastGain: null },
    relationship: { xp: 0, level: 1, branches: {}, pendingChoice: null, lastGain: null }
  };
}
function masteryLevel(xp) {
  let level = 1;
  MASTERY_THRESHOLDS.forEach((threshold, index) => {
    if (xp >= threshold) level = index + 1;
  });
  return Math.min(10, level);
}
function normalizeMastery(saved) {
  const base = createMasteryState();
  const source = saved || {};
  Object.keys(MASTERY_DEFS).forEach((id) => {
    const old = source[id] || {};
    const xp = Math.max(0, Math.round(Number(old.xp) || 0));
    const level = masteryLevel(xp);
    base[id] = {
      xp,
      level,
      branches: Object.assign({}, old.branches || {}),
      pendingChoice: old.pendingChoice || ((level >= 10 && !(old.branches || {})[10]) ? 10 : (level >= 5 && !(old.branches || {})[5]) ? 5 : null),
      lastGain: old.lastGain || null
    };
  });
  return base;
}
function createGuardianCycle() {
  return {
    version: 1,
    day: 1,
    actionIndex: 0,
    actionsToday: [],
    completedDays: 0,
    totalKeyActions: 0,
    lastNight: null,
    tomorrowPreview: "雨季的第一束光会照到干涸水点。",
    sevenDay: { completed: {}, progress: {}, highlights: [] }
  };
}
function normalizeGuardianCycle(saved, totalActions = 0) {
  const source = Object.assign(createGuardianCycle(), saved || {});
  const inferredCompleted = Math.floor(Math.max(0, Number(totalActions) || 0) / 3);
  source.completedDays = Math.max(0, Math.round(Number(source.completedDays) || inferredCompleted));
  source.day = Math.max(1, Math.round(Number(source.day) || source.completedDays + 1));
  source.actionIndex = clampInt(source.actionIndex, 0, 2, Math.max(0, (Number(totalActions) || 0) % 3));
  source.totalKeyActions = Math.max(Number(totalActions) || 0, Math.round(Number(source.totalKeyActions) || 0));
  source.actionsToday = Array.isArray(source.actionsToday) ? source.actionsToday.slice(-source.actionIndex) : [];
  source.sevenDay = Object.assign({ completed: {}, progress: {}, highlights: [] }, source.sevenDay || {});
  source.sevenDay.completed = Object.assign({}, source.sevenDay.completed || {});
  source.sevenDay.progress = Object.assign({}, source.sevenDay.progress || {});
  source.sevenDay.highlights = Array.isArray(source.sevenDay.highlights) ? source.sevenDay.highlights.slice(-7) : [];
  return source;
}
function guardianContext(reserve) {
  const totalActions = (((reserve || {}).progression || {}).totalActions) || 0;
  const cycle = normalizeGuardianCycle((reserve || {}).guardianCycle, totalActions);
  if (cycle.day === 3 && !cycle.sevenDay.completed[3]) {
    const soldToday = ((reserve || {}).fundLedger || []).some((entry) =>
      Number(entry.day) === 3 && entry.source === "样本出售收入" && Number(entry.amount) > 0);
    if (soldToday) {
      const done = Array.from(new Set((cycle.sevenDay.progress[3] || []).concat("salvage")));
      cycle.sevenDay.progress[3] = done;
      cycle.sevenDay.completed[3] = done.includes("buySupplies");
      const highlight = SEVEN_DAY_BEATS[3].highlight;
      if (cycle.sevenDay.completed[3] && !cycle.sevenDay.highlights.includes(highlight)) cycle.sevenDay.highlights.push(highlight);
    }
  }
  const phase = PHASES[cycle.actionIndex] || PHASES[0];
  return {
    cycle,
    day: cycle.day,
    phase,
    season: guardianSeason(cycle.day),
    completesDay: cycle.actionIndex >= 2,
    beat: seasonBeat(cycle.day),
    sevenDayBeat: SEVEN_DAY_BEATS[cycle.day] || null
  };
}
function deltaSummary(before, after) {
  const beforeEco = (before && before.ecology) || {};
  const afterEco = (after && after.ecology) || {};
  const candidates = [
    { label: "水源", value: (afterEco.water || 0) - (beforeEco.water || 0) },
    { label: "草场", value: (afterEco.grass || 0) - (beforeEco.grass || 0) },
    { label: "基金", value: ((after && after.fund) || 0) - ((before && before.fund) || 0) },
    { label: "偷猎", value: ((after && after.poacherPressure) || 0) - ((before && before.poacherPressure) || 0), inverse: true }
  ].filter((item) => item.value !== 0);
  if (!candidates.length) return "保护区维持住了今天的平衡";
  return candidates.slice(0, 2).map((item) => `${item.label}${item.value > 0 ? "+" : ""}${item.value}`).join(" · ");
}
function animalResponseFor(action, after) {
  const water = (((after || {}).ecology || {}).water) || 0;
  const grass = (((after || {}).ecology || {}).grass) || 0;
  const responses = {
    habitat: water >= grass ? "晨角鹿沿着新水线走近了。" : "短耳兔开始在恢复的草场边觅食。",
    houndScout: "沉牙抬起头，陌生气味正在远去。",
    antiPoacher: "黑铃鸦飞回低枝，动物重新从林缘出现。",
    intervention: "云耳停在草场边，观察你留下的安全距离。",
    salvage: "动物没有被打扰，巡护物证被妥善移交。",
    buySupplies: "猎犬队听见补给箱落地，重新围到巡护站前。",
    exploreMaterials: "一只动物在你离开前回头，像是在确认你记住了路线。"
  };
  return responses[action] || "林间的动静渐渐恢复。";
}
function tomorrowText(nextDay) {
  const season = guardianSeason(nextDay);
  const beat = seasonBeat(nextDay);
  return `第${nextDay}日 · ${season.name}${season.day}/12：${beat}`;
}
function recordSevenDayProgress(reserve, action) {
  const cycle = (reserve && reserve.guardianCycle) || guardianContext(reserve).cycle;
  cycle.sevenDay = Object.assign({ completed: {}, progress: {}, highlights: [] }, cycle.sevenDay || {});
  cycle.sevenDay.completed = Object.assign({}, cycle.sevenDay.completed || {});
  cycle.sevenDay.progress = Object.assign({}, cycle.sevenDay.progress || {});
  cycle.sevenDay.highlights = Array.isArray(cycle.sevenDay.highlights) ? cycle.sevenDay.highlights : [];
  const beat = SEVEN_DAY_BEATS[cycle.day];
  if (!beat || !beat.actions.includes(action)) {
    reserve.guardianCycle = cycle;
    return { matched: false, completed: false, day: cycle.day, highlight: "" };
  }
  const done = Array.from(new Set((cycle.sevenDay.progress[cycle.day] || []).concat(action)));
  cycle.sevenDay.progress[cycle.day] = done;
  const required = cycle.day === 3 ? ["salvage", "buySupplies"] : [];
  const completed = required.length ? required.every((requiredAction) => done.includes(requiredAction)) : true;
  cycle.sevenDay.completed[cycle.day] = completed;
  if (completed && !cycle.sevenDay.highlights.includes(beat.highlight)) cycle.sevenDay.highlights.push(beat.highlight);
  reserve.guardianCycle = cycle;
  return { matched: true, completed, day: cycle.day, highlight: completed ? beat.highlight : "" };
}
function advanceGuardianCycle(reserve, action, before, after, options = {}) {
  const context = guardianContext(reserve);
  const cycle = context.cycle;
  const actionRecord = {
    action,
    phase: context.phase.id,
    phaseLabel: context.phase.label,
    change: deltaSummary(before, after),
    animalResponse: options.animalResponse || animalResponseFor(action, after)
  };
  cycle.actionsToday = cycle.actionsToday.concat(actionRecord).slice(-3);
  cycle.totalKeyActions += 1;
  reserve.guardianCycle = cycle;
  recordSevenDayProgress(reserve, action);
  let night = null;
  if (context.completesDay || options.earlyEnd) {
    night = {
      day: cycle.day,
      title: `第${cycle.day}日 · 入夜`,
      actions: cycle.actionsToday.slice(),
      did: cycle.actionsToday.map((entry) => entry.phaseLabel + "：" + entry.change),
      mapChange: options.mapChange || cycle.actionsToday.map((entry) => entry.change).filter(Boolean).join("；") || deltaSummary(before, after),
      animalResponse: actionRecord.animalResponse,
      reward: options.reward || "今日守护记录已写入保护区档案",
      tomorrow: cycle.day === 1 ? FIRST_RETURN_HOOK_COPY.closing : tomorrowText(cycle.day + 1)
    };
    cycle.lastNight = night;
    cycle.completedDays += 1;
    cycle.day += 1;
    cycle.actionIndex = 0;
    cycle.actionsToday = [];
    cycle.tomorrowPreview = night.tomorrow;
  } else {
    cycle.actionIndex += 1;
    cycle.tomorrowPreview = `${PHASES[cycle.actionIndex].label}仍可安排一次关键行动`;
  }
  reserve.guardianCycle = cycle;
  reserve.seasonState = guardianSeason(cycle.day);
  reserve.seasonDay = reserve.seasonState.day;
  return { context, cycle, night, actionRecord, next: guardianContext(reserve) };
}
function masteryTrackForAction(action) {
  return Object.keys(MASTERY_DEFS).find((id) => MASTERY_DEFS[id].actions.includes(action)) || null;
}
function awardMastery(reserve, trackId, amount, reason) {
  if (!MASTERY_DEFS[trackId] || !amount) return null;
  reserve.mastery = normalizeMastery(reserve.mastery);
  const track = reserve.mastery[trackId];
  const beforeLevel = track.level;
  const beforeXp = track.xp;
  track.xp = Math.max(0, Math.min(MASTERY_THRESHOLDS[9], track.xp + Math.round(amount)));
  track.level = masteryLevel(track.xp);
  const levelUp = track.level > beforeLevel;
  if (levelUp) {
    if (track.level >= 10 && !track.branches[10]) track.pendingChoice = 10;
    else if (track.level >= 5 && !track.branches[5]) track.pendingChoice = 5;
  }
  track.lastGain = { amount: track.xp - beforeXp, reason, beforeLevel, level: track.level, levelUp };
  return Object.assign({ trackId, label: MASTERY_DEFS[trackId].label }, track.lastGain);
}
function awardKeyActionMastery(reserve, action) {
  const trackId = masteryTrackForAction(action);
  return trackId ? awardMastery(reserve, trackId, 20, "关键行动") : null;
}
function chooseMasteryBranch(reserve, trackId, level, branchId) {
  const def = MASTERY_DEFS[trackId];
  const milestone = Number(level);
  if (!def || ![5, 10].includes(milestone)) return { ok: false, error: "专长节点不存在" };
  reserve.mastery = normalizeMastery(reserve.mastery);
  const track = reserve.mastery[trackId];
  if (track.level < milestone) return { ok: false, error: `达到等级${milestone}后解锁` };
  if (track.branches[milestone]) return { ok: false, error: "这个节点已经选择" };
  const branch = def.branches[milestone].find((entry) => entry.id === branchId);
  if (!branch) return { ok: false, error: "分支不存在" };
  track.branches[milestone] = branch.id;
  track.pendingChoice = track.level >= 10 && !track.branches[10] ? 10 : track.level >= 5 && !track.branches[5] ? 5 : null;
  return { ok: true, trackId, level: milestone, branch };
}
function masteryView(reserve) {
  const mastery = normalizeMastery((reserve || {}).mastery);
  return Object.keys(MASTERY_DEFS).map((id) => {
    const track = mastery[id];
    const next = MASTERY_THRESHOLDS[Math.min(9, track.level)] || MASTERY_THRESHOLDS[9];
    const currentFloor = MASTERY_THRESHOLDS[Math.max(0, track.level - 1)] || 0;
    return {
      id,
      label: MASTERY_DEFS[id].label,
      xp: track.xp,
      level: track.level,
      nextXp: next,
      progress: track.level >= 10 ? 1 : Math.max(0, Math.min(1, (track.xp - currentFloor) / Math.max(1, next - currentFloor))),
      pendingChoice: track.pendingChoice,
      choices: track.pendingChoice ? MASTERY_DEFS[id].branches[track.pendingChoice] : [],
      branches: Object.assign({}, track.branches)
    };
  });
}
function applyNamedAnimalSchedule(animals, reserve) {
  const context = guardianContext(reserve || {});
  const chapter = Math.max(1, Math.min(7, Math.ceil(((((reserve || {}).progression || {}).stage) || 1) / 2)));
  const castById = {};
  MAIN_CAST.forEach((entry) => { castById[entry.id] = entry; });
  return (animals || []).map((animal) => {
    const cast = castById[animal.id];
    if (!cast) return animal;
    const active = cast.chapter === chapter;
    const targetRegionId = context.season.name === "雨季" ? cast.rainRegion : cast.dryRegion;
    const relation = Object.assign({}, animal.relation || {});
    relation.storyNodesSeen = Array.from(new Set(relation.storyNodesSeen || []));
    return Object.assign({}, animal, {
      mainStory: { chapter: cast.chapter, active, arc: cast.arc, relationshipNodes: [20, 40, 65, 85] },
      seasonRoute: { season: context.season.name, guardianDay: context.day, regionId: targetRegionId },
      intent: active ? Object.assign({}, animal.intent || {}, {
        targetRegionId,
        label: cast.arc,
        publicState: `${context.season.name}路线 · ${cast.arc}`
      }) : animal.intent,
      relation
    });
  });
}
module.exports = {
  PHASES,
  SEASON_LENGTH,
  YEAR_LENGTH,
  MASTERY_THRESHOLDS,
  MASTERY_DEFS,
  SEVEN_DAY_BEATS,
  MAIN_CAST,
  guardianSeason,
  seasonBeat,
  createGuardianCycle,
  normalizeGuardianCycle,
  guardianContext,
  advanceGuardianCycle,
  createMasteryState,
  normalizeMastery,
  awardMastery,
  awardKeyActionMastery,
  chooseMasteryBranch,
  masteryView,
  applyNamedAnimalSchedule,
  recordSevenDayProgress
};
