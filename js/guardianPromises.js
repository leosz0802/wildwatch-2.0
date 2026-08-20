const { addPendingRecovered, consumeProjectPreparation } = require("./resourceLedger");

const GUARDIAN_PROMISES = [
  {
    chapter: 1,
    id: "contact_boundary",
    title: "动物开始靠近营地",
    story: "动物开始靠近营地。亲近便于救助，也可能形成依赖。",
    choices: [
      {
        id: "hands_off",
        label: "不以投喂换亲近",
        route: "ecology",
        risk: "safe",
        primaryBenefit: "野性更容易恢复",
        primaryCost: "直接救助建立安全感更慢",
        longTerm: "栖息地修复额外恢复草场；直接干预减少依赖，但关系升温更慢。",
        immediateEffects: { grass: 3, fund: -60 },
        actionEffects: { habitat: { grass: 2, fund: -15 } },
        relationship: { intervention: { security: -2, wildness: 4 }, habitat: { wildness: 1 } },
        mapTag: "无投喂核心区"
      },
      {
        id: "rescue_station",
        label: "保留应急投喂点",
        route: "community",
        risk: "risky",
        primaryBenefit: "受伤动物更快获得安全感",
        primaryCost: "野性下降且救助成本增加",
        longTerm: "直接干预更快压低疾病，但每次都要承担额外基金与依赖代价。",
        immediateEffects: { safety: 4, fund: -90 },
        actionEffects: { intervention: { disease: -2, fund: -30 } },
        relationship: { intervention: { security: 2, wildness: -2 } },
        mapTag: "应急救助点"
      },
      {
        id: "adaptive_contact",
        label: "只在必要时接触",
        route: "research",
        risk: "balanced",
        primaryBenefit: "现场判断更准确",
        primaryCost: "每次判断需要持续投入",
        longTerm: "侦察更容易发现关键痕迹；干预仍增加安全感，但会主动保留野性。",
        immediateEffects: { intel: 1, fund: -75 },
        actionEffects: { houndScout: { intel: 1, fund: -10 } },
        relationship: { intervention: { security: -1, wildness: 2 } },
        mapTag: "观察距离线"
      }
    ]
  },
  {
    chapter: 2,
    id: "water_covenant",
    title: "谁先使用有限的水",
    story: "水源越公开，动物路线越容易暴露。",
    choices: [
      {
        id: "shared_water",
        label: "与社区共享水源",
        route: "community",
        risk: "risky",
        primaryBenefit: "修复获得更多水量",
        primaryCost: "公开路线提高偷猎压力",
        longTerm: "每次修复水源增长更快，但人和动物的活动会集中到同一条水线。",
        immediateEffects: { water: 7, poacherPressure: 3 },
        actionEffects: { habitat: { water: 3, poacherPressure: 2 } },
        mapTag: "共享水井"
      },
      {
        id: "hidden_springs_promise",
        label: "封存动物暗泉",
        route: "enforcement",
        risk: "safe",
        primaryBenefit: "水点附近更安全",
        primaryCost: "维护费用长期增加",
        longTerm: "修复同时增加安全，但暗泉保密和巡查都需要持续基金。",
        immediateEffects: { safety: 5, fund: -100 },
        actionEffects: { habitat: { safety: 2, fund: -25 } },
        mapTag: "隐蔽暗泉"
      },
      {
        id: "rotating_water_promise",
        label: "按季节轮换水点",
        route: "ecology",
        risk: "balanced",
        primaryBenefit: "迁徙路线保持弹性",
        primaryCost: "轮换维护持续花费基金",
        longTerm: "修复同时改善迁徙和水量，但每次都要重新布置观察点。",
        immediateEffects: { migrationDelta: 3, fund: -80 },
        actionEffects: { habitat: { migrationDelta: 2, water: 1, fund: -20 } },
        mapTag: "轮换水线"
      }
    ]
  },
  {
    chapter: 3,
    id: "patrol_boundary",
    title: "边界要安静，还是要强硬",
    story: "强巡查压制偷猎，也会惊扰动物。",
    choices: [
      {
        id: "quiet_patrol",
        label: "坚持静默巡查",
        route: "ecology",
        risk: "safe",
        primaryBenefit: "压低偷猎且减少惊扰",
        primaryCost: "执法能力成长稍慢",
        longTerm: "反偷猎额外降低压力，执法成长稍慢。",
        immediateEffects: { poacherPressure: -5, enforcement: -2 },
        actionEffects: { antiPoacher: { poacherPressure: -2, enforcement: -1 } },
        relationship: { antiPoacher: { wildness: 2 } },
        mapTag: "静默巡护线"
      },
      {
        id: "hard_patrol",
        label: "建立高压封锁线",
        route: "enforcement",
        risk: "risky",
        primaryBenefit: "偷猎压力下降最快",
        primaryCost: "迁徙受阻、野性承压",
        longTerm: "强力行动有额外压制，但动物路线会绕开频繁出现的车辆和人声。",
        immediateEffects: { poacherPressure: -10, migrationDelta: -3 },
        actionEffects: { antiPoacher: { poacherPressure: -4, migrationDelta: -2 } },
        relationship: { antiPoacher: { security: 1, wildness: -2 } },
        mapTag: "高压封锁线"
      },
      {
        id: "intel_patrol",
        label: "先取证再行动",
        route: "research",
        risk: "balanced",
        primaryBenefit: "侦察额外发现痕迹",
        primaryCost: "证据链持续消耗基金",
        longTerm: "猎犬侦察提高后续判断质量，但每轮取证都要支付维护成本。",
        immediateEffects: { intel: 2, fund: -100 },
        actionEffects: { houndScout: { intel: 1, fund: -18 } },
        mapTag: "取证观察塔"
      }
    ]
  },
  {
    chapter: 4,
    id: "migration_oath",
    title: "它们是否有权离开",
    story: "安全不等于留下。动物也需要离开的路线。",
    choices: [
      {
        id: "open_corridor_promise",
        label: "永久开放迁徙通道",
        route: "ecology",
        risk: "risky",
        primaryBenefit: "迁徙与野性明显提升",
        primaryCost: "开放边界降低短期安全",
        longTerm: "栖息地修复会把通道重新接通；命名动物更容易独立离开。",
        immediateEffects: { migrationDelta: 5, safety: -3 },
        actionEffects: { habitat: { migrationDelta: 3, safety: -2 } },
        relationship: { habitat: { wildness: 2 } },
        independenceThreshold: -4,
        mapTag: "开放迁徙廊道"
      },
      {
        id: "refuge_first",
        label: "先建安全避难地",
        route: "enforcement",
        risk: "safe",
        primaryBenefit: "受伤个体更安全",
        primaryCost: "种群迁徙意愿下降",
        longTerm: "直接干预更能稳住安全，但动物会更晚尝试独立离开。",
        immediateEffects: { safety: 7, migrationDelta: -3 },
        actionEffects: { intervention: { safety: 3, migrationDelta: -2 } },
        relationship: { intervention: { security: 2, wildness: -1 } },
        independenceThreshold: 5,
        mapTag: "核心避难地"
      },
      {
        id: "seasonal_gate",
        label: "按季节开启通道",
        route: "research",
        risk: "balanced",
        primaryBenefit: "雨旱季使用不同路线",
        primaryCost: "监测与开闭需要基金",
        longTerm: "雨季优先迁徙，旱季优先保水；每次修复都需重新判断。",
        immediateEffects: { migrationDelta: 2, fund: -120 },
        seasonalActionEffects: {
          habitat: {
            "雨季": { migrationDelta: 2, fund: -20 },
            "旱季": { water: 2, fund: -20 }
          }
        },
        mapTag: "季节通道门"
      }
    ]
  },
  {
    chapter: 5,
    id: "final_guardianship",
    title: "保护区最终属于谁",
    story: "安全庇护、自由迁徙与区域协作无法兼得。",
    choices: [
      {
        id: "rewilding_first",
        label: "把重归野外写进目标",
        route: "ecology",
        risk: "risky",
        primaryBenefit: "独立、归来与繁衍更早发生",
        primaryCost: "短期基金投入增加",
        longTerm: "栖息地行动强化迁徙；离开不再被视为经营失败。",
        immediateEffects: { migrationDelta: 5, fund: -180 },
        actionEffects: { habitat: { migrationDelta: 2, fund: -20 } },
        relationship: { habitat: { wildness: 2 } },
        independenceThreshold: -5,
        wildVisitDelay: -2,
        mapTag: "重归野外区"
      },
      {
        id: "lifelong_sanctuary",
        label: "承诺终身庇护",
        route: "community",
        risk: "safe",
        primaryBenefit: "伤病救助效果更强",
        primaryCost: "费用更高、独立更晚",
        longTerm: "干预额外降低疾病并提高安全感，但容易推迟动物离开。",
        immediateEffects: { disease: -6, fund: -180 },
        actionEffects: { intervention: { disease: -2, fund: -35 } },
        relationship: { intervention: { security: 2, wildness: -2 } },
        independenceThreshold: 6,
        mapTag: "终身庇护站"
      },
      {
        id: "regional_network",
        label: "加入区域守护网络",
        route: "research",
        risk: "balanced",
        primaryBenefit: "探索与归来信息更完整",
        primaryCost: "共享档案持续消耗基金",
        longTerm: "动物引路探索提升声誉，离开的朋友也更快被区域网络重新发现。",
        immediateEffects: { reputation: 6, fund: -160 },
        actionEffects: { exploreMaterials: { reputation: 2, fund: -20 } },
        relationship: { exploreMaterials: { security: 1, wildness: 1 } },
        wildVisitDelay: -2,
        mapTag: "区域联络站"
      }
    ]
  }
];

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value || 0)));
}

function promiseByChapter(chapter) {
  return GUARDIAN_PROMISES.find((item) => item.chapter === Number(chapter)) || null;
}

function promiseChoice(chapter, choiceId) {
  const promise = promiseByChapter(chapter);
  return promise && promise.choices.find((choice) => choice.id === choiceId) || null;
}

function normalizeGuardianPromises(saved) {
  const source = saved || {};
  const choices = {};
  Object.keys(source.choices || {}).forEach((key) => {
    const record = source.choices[key] || {};
    const chapter = clamp(Number(key), 1, 5);
    if (!promiseChoice(chapter, record.choiceId)) return;
    choices[chapter] = Object.assign({}, record, { chapter });
  });
  const pendingPromise = source.pending && promiseByChapter(source.pending.chapter);
  const pending = pendingPromise && !choices[pendingPromise.chapter]
    ? Object.assign({}, source.pending, {
      id: pendingPromise.id,
      chapter: pendingPromise.chapter,
      selectedChoiceId: promiseChoice(pendingPromise.chapter, source.pending.selectedChoiceId) ? source.pending.selectedChoiceId : ""
    })
    : null;
  return {
    version: 1,
    choices,
    pending,
    history: (source.history || []).filter((item) => item && promiseChoice(item.chapter, item.choiceId)).slice(-8),
    lastPromptAction: Math.max(0, Math.round(source.lastPromptAction || 0)),
    lastActionEffects: (source.lastActionEffects || []).slice(-5)
  };
}

function maybePrepareGuardianPromise(reserve, context = {}) {
  const state = normalizeGuardianPromises(reserve.guardianPromises);
  if (state.pending) {
    reserve.guardianPromises = state;
    return state.pending;
  }
  const level = clamp((((reserve || {}).progression || {}).level) || 1, 1, 5);
  const totalActions = Math.max(0, Math.round(context.totalActions == null ? (((reserve || {}).progression || {}).totalActions || 0) : context.totalActions));
  const eligible = GUARDIAN_PROMISES.find((promise) => {
    if (promise.chapter > level || state.choices[promise.chapter]) return false;
    if (promise.chapter === 1) return totalActions >= 3;
    return true;
  });
  if (!eligible) {
    reserve.guardianPromises = state;
    return null;
  }
  state.pending = {
    id: eligible.id,
    chapter: eligible.chapter,
    day: Math.max(1, Math.round(context.day || 1)),
    actionIndex: totalActions,
    selectedChoiceId: ""
  };
  state.lastPromptAction = totalActions;
  reserve.guardianPromises = state;
  return state.pending;
}

function selectGuardianPromiseChoice(reserve, chapter, choiceId) {
  const state = normalizeGuardianPromises(reserve.guardianPromises);
  if (!state.pending || Number(state.pending.chapter) !== Number(chapter) || !promiseChoice(chapter, choiceId)) return null;
  state.pending.selectedChoiceId = choiceId;
  reserve.guardianPromises = state;
  return state.pending;
}

function addMetric(reserve, key, amount) {
  if (!amount) return;
  if (key === "intel") return;
  if (["water", "grass", "disease"].includes(key)) {
    reserve.ecology = reserve.ecology || {};
    reserve.ecology[key] = clamp((reserve.ecology[key] || 0) + amount);
    return;
  }
  if (key === "migrationDelta") {
    reserve.migration = Object.assign({}, reserve.migration || {});
    reserve.migration.delta = Math.round((reserve.migration.delta || 0) + amount);
    reserve.migration.trend = reserve.migration.delta > 0 ? "in" : reserve.migration.delta < 0 ? "out" : "stable";
    return;
  }
  if (key === "fund") {
    if (amount > 0) {
      addPendingRecovered(reserve, "researchSample", Math.max(1, Math.ceil(amount / 100)));
      return;
    }
    consumeProjectPreparation(reserve, amount);
    return;
  }
  const max = key === "intel" ? 6 : 100;
  reserve[key] = clamp((reserve[key] || 0) + amount, 0, max);
}

function metricSnapshot(reserve) {
  const eco = reserve.ecology || {};
  const supplies = reserve.supplies || {};
  return {
    fund: reserve.fund || 0,
    safety: reserve.safety || 0,
    stability: reserve.stability || 0,
    reputation: reserve.reputation || 0,
    enforcement: reserve.enforcement || 0,
    poacherPressure: reserve.poacherPressure || 0,
    intel: reserve.intel || 0,
    water: eco.water || 0,
    grass: eco.grass || 0,
    disease: eco.disease || 0,
    migrationDelta: (reserve.migration || {}).delta || 0,
    researchSamples: ((reserve.pendingRecovered || {}).researchSample) || 0,
    supplyTotal: Object.keys(supplies).reduce((sum, id) => sum + (supplies[id] || 0), 0)
  };
}

function applyEffects(reserve, effects) {
  Object.keys(effects || {}).forEach((key) => addMetric(reserve, key, effects[key]));
}

function changesBetween(before, after) {
  return Object.keys(after).map((key) => ({ key, before: before[key], after: after[key], delta: after[key] - before[key] })).filter((item) => item.delta !== 0);
}

function applyGuardianPromiseChoice(reserve, chapter, choiceId, context = {}) {
  const state = normalizeGuardianPromises(reserve.guardianPromises);
  const promise = promiseByChapter(chapter);
  const choice = promiseChoice(chapter, choiceId);
  if (!promise || !choice || state.choices[chapter]) return null;
  if (state.pending && Number(state.pending.chapter) !== Number(chapter)) return null;
  const before = metricSnapshot(reserve);
  applyEffects(reserve, choice.immediateEffects || {});
  const after = metricSnapshot(reserve);
  const record = {
    chapter: Number(chapter),
    promiseId: promise.id,
    choiceId: choice.id,
    label: choice.label,
    mapTag: choice.mapTag,
    day: Math.max(1, Math.round(context.day || 1)),
    actionIndex: Math.max(0, Math.round(context.totalActions || 0)),
    permanent: true
  };
  state.choices[chapter] = record;
  state.history = state.history.concat(record).slice(-8);
  state.pending = null;
  reserve.guardianPromises = state;
  return { promise, choice, record, before, after, changes: changesBetween(before, after) };
}

function chosenPromiseChoices(reserve) {
  const state = normalizeGuardianPromises((reserve || {}).guardianPromises);
  return Object.keys(state.choices).sort((a, b) => Number(a) - Number(b)).map((chapter) => {
    const record = state.choices[chapter];
    return { promise: promiseByChapter(chapter), choice: promiseChoice(chapter, record.choiceId), record };
  }).filter((item) => item.promise && item.choice);
}

function actionEffectsForChoice(choice, action, season) {
  const fixed = Object.assign({}, ((choice.actionEffects || {})[action]) || {});
  const seasonal = ((((choice.seasonalActionEffects || {})[action]) || {})[season]) || {};
  return Object.assign(fixed, seasonal);
}

function applyGuardianPromiseAction(reserve, action, context = {}) {
  const before = metricSnapshot(reserve);
  const applied = [];
  chosenPromiseChoices(reserve).forEach(({ promise, choice }) => {
    const effects = actionEffectsForChoice(choice, action, context.season || ((reserve.seasonState || {}).name));
    if (!Object.keys(effects).length) return;
    applyEffects(reserve, effects);
    applied.push({ chapter: promise.chapter, promiseId: promise.id, choiceId: choice.id, label: choice.label, mapTag: choice.mapTag, effects });
  });
  const after = metricSnapshot(reserve);
  const changes = changesBetween(before, after);
  const state = normalizeGuardianPromises(reserve.guardianPromises);
  state.lastActionEffects = applied.slice(-5);
  reserve.guardianPromises = state;
  return { applied, before, after, changes };
}

function relationshipModifierFor(reserve, action) {
  const result = { security: 0, wildness: 0, reasons: [] };
  chosenPromiseChoices(reserve).forEach(({ choice }) => {
    const modifier = ((choice.relationship || {})[action]) || null;
    if (!modifier) return;
    result.security += modifier.security || 0;
    result.wildness += modifier.wildness || 0;
    result.reasons.push(choice.label);
  });
  return result;
}

function lifeCycleModifiers(reserve) {
  return chosenPromiseChoices(reserve).reduce((result, { choice }) => {
    result.independenceThreshold += choice.independenceThreshold || 0;
    result.wildVisitDelay += choice.wildVisitDelay || 0;
    return result;
  }, { independenceThreshold: 0, wildVisitDelay: 0 });
}

module.exports = {
  GUARDIAN_PROMISES,
  promiseByChapter,
  normalizeGuardianPromises,
  maybePrepareGuardianPromise,
  selectGuardianPromiseChoice,
  applyGuardianPromiseChoice,
  applyGuardianPromiseAction,
  chosenPromiseChoices,
  relationshipModifierFor,
  lifeCycleModifiers,
  metricSnapshot
};
