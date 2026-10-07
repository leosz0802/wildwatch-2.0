const { recordFundChange } = require("./fundLedger");
const { recordIncrease, recordDecrease } = require("./animalSourceLedger");
const { addPendingRecovered } = require("./resourceLedger");
const { applyChapterVisitorDelta, todayChapterContribution } = require("./chapterTargets");
const { isRealNatureEventType, realNatureImpactPair, applyCoreMetric, CORE_METRIC_AMOUNTS } = require("./realNatureEventSystem");
const EVENT_CATEGORIES = Object.freeze({
  nature: { label: "自然规则", mode: "观察风险 → 修复或救助", chain: "水草与种群 → 观赏体验 → 游客与基金" },
  social: { label: "游客与社会", mode: "疏导现场 → 恢复秩序", chain: "安全与口碑 → 游客留存 → 保护基金" },
  neighbor: { label: "相邻保护区", mode: "核验需求 → 协作或保留", chain: "共享资源与迁徙 → 游览吸引力 → 游客与基金" },
  realNature: { label: "真实事件", mode: "核对真实记录 → 保护区演练", chain: "真实案例 → 演练处置 → 两项核心数据" }
});
const SOCIAL_EVENTS = new Set(["poacher_ring", "snare_line", "community_blockade", "visitor_conflict", "visitor_litter", "visitor_queue", "water_contamination"]);
const n = (value) => Math.max(0, Math.round(Number(value) || 0));
function eventCategory(event = {}) {
  const type = event.type || event.id || "";
  const key = event.category || (isRealNatureEventType(type) ? "realNature"
    : event.source === "neighbor" || type.startsWith("neighbor_") ? "neighbor"
    : ["social", "visitor"].includes(event.source) || SOCIAL_EVENTS.has(type) ? "social" : "nature");
  return Object.assign({ id: key }, EVENT_CATEGORIES[key] || EVENT_CATEGORIES.nature);
}
function eventBusinessProfile(event = {}) {
  const opportunity = (event.type || event.id) === "neighbor_exchange";
  return { demand: opportunity ? 1 : .8, recoveryRate: opportunity ? .12 : .06, lossRate: opportunity ? 0 : .15,
    reason: opportunity ? "完成交换改善游览环境，吸引新客；未完成则维持现状。" : "风险压低新客流；处理后吸引回流，失控会让游客离场并退还贡献。" };
}
const NARRATIVE_BUSINESS_PROFILES = Object.freeze({
  predation: { rescue: [.95, .96, .95], observe: [1.02, 1.01, 1.02] },
  disease: { isolate: [.82, .90, .88], disperse: [.92, .95, .93] },
  overgrazing: { rest: [.90, .94, .92], corridor: [.98, 1, .98] },
  territorial: { buffer: [1.02, .99, 1.01], watch: [.98, .97, .97] },
  birth: { quiet_guard: [1.05, 1.02, 1.04], distance: [1.01, 1, 1.02] },
  migration: { corridor_guard: [1.06, 1.01, 1.05], observe_route: [.98, .97, .98] },
  juvenile_loss: { emergency_care: [.96, .96, .95], keep_distance: [1.03, 1.01, 1.03] },
  competition: { seasonal_zones: [1.03, 1, 1.02], natural_shift: [.95, .96, .95] },
  symbiosis: { preserve_process: [1.05, 1.01, 1.04], sanitary_clear: [.97, .98, .96] }
});
const ACTION_BUSINESS_PULSE = Object.freeze({
  houndScout: .025, antiPoacher: .045, intervention: .035, habitat: .04,
  exploreMaterials: .015, salvage: .02, patrol: .018, buySupplies: .01
});
function narrativeBusinessProfile(event = {}, choiceId = "", resolved = true) {
  const type = String(event.type || event.id || "");
  const pair = (NARRATIVE_BUSINESS_PROFILES[type] || {})[choiceId];
  if (pair) return { demand: pair[0], activity: pair[1], retention: pair[2] };
  const sentiment = Math.max(-1, Math.min(1, Number(event.businessSentiment) || 0));
  if (resolved && sentiment) {
    return { demand: 1 + sentiment * .08, activity: 1 + sentiment * .05, retention: 1 + sentiment * .06 };
  }
  return resolved
    ? { demand: 1, activity: 1, retention: 1 }
    : { demand: .90, activity: .95, retention: .93 };
}
function normalizedBusinessEffect(effect = {}) {
  if (!effect || Number(effect.remainingActions) <= 0) return null;
  return {
    demand: Math.max(.65, Math.min(1.15, Number(effect.demand) || 1)),
    activity: Math.max(.75, Math.min(1.1, Number(effect.activity) || 1)),
    retention: Math.max(.75, Math.min(1.1, Number(effect.retention) || 1))
  };
}
function eventBusinessFactors(reserve = {}) {
  const emergency = reserve.emergency || {};
  const effects = [];
  if (emergency.active) {
    const demand = eventBusinessProfile(emergency.active).demand;
    effects.push({ demand, activity: demand === 1 ? 1 : .94, retention: demand === 1 ? 1 : .94 });
  } else if (emergency.businessEffect && emergency.businessEffect.remainingActions > 0) {
    effects.push(emergency.businessEffect.resolved
      ? { demand: 1.06, activity: 1, retention: 1.03 }
      : { demand: .9, activity: 1, retention: .94 });
  }
  const storyEffect = normalizedBusinessEffect(reserve.storyBusinessEffect);
  if (storyEffect) effects.push(storyEffect);
  const actionEffect = normalizedBusinessEffect(reserve.actionBusinessEffect);
  if (actionEffect) effects.push(actionEffect);
  const animalInteractionEffect = normalizedBusinessEffect(reserve.animalInteractionBusinessEffect);
  if (animalInteractionEffect) effects.push(animalInteractionEffect);
  return effects.reduce((result, effect) => ({
    demand: Math.max(.55, Math.min(1.2, result.demand * effect.demand)),
    activity: Math.max(.65, Math.min(1.1, result.activity * effect.activity)),
    retention: Math.max(.65, Math.min(1.1, result.retention * effect.retention))
  }), { demand: 1, activity: 1, retention: 1 });
}
function visitorEngagement(reserve = {}, context = {}) {
  const eco = reserve.ecology || {};
  const safety = Math.min(100, n(reserve.safety));
  const water = Math.max(0, Math.min(100, n(eco.water)));
  const grass = Math.max(0, Math.min(100, n(eco.grass)));
  const disease = Math.max(0, Math.min(100, n(eco.disease)));
  const environment = Math.max(0, Math.min(100, water * .55 + grass * .45 - disease * .18));
  const species = [eco.predators, eco.herbivores, eco.birds].reduce((sum, group) => sum + Object.values(group || {}).filter((v) => v > 0).length, 0);
  const level = Math.max(1, Math.min(5, n((reserve.progression || {}).level)));
  const pressure = eventBusinessFactors(reserve);
  const diversity = Math.min(1, species / 12);
  const maturity = (level - 1) / 4;
  const weather = context.weather || (reserve.seasonState || {}).weather || "阴";
  const weatherFactor = ({ 晴: 1.03, 阴: 1, 小雨: .96, 雨: .9, 大雨: .8, 雾: .92 })[weather] || 1;
  const percent = (rate) => Math.max(10, Math.min(90, Math.round(rate * 100))) / 100;
  const conversion = (quality) => .1 + .8 * Math.pow(Math.max(0, Math.min(1, quality / .8)), .25);
  const activity = percent(conversion(safety * .0045 + environment * .0025 + diversity * .05 + maturity * .05) * pressure.activity * weatherFactor);
  const retention = percent(conversion(safety * .003 + environment * .002 + diversity * .2 + maturity * .1) * pressure.retention);
  return {
    activity, retention,
    environment, water, grass, disease,
    risk: disease >= 70 || water <= 35 || grass <= 35 ? "critical" : disease >= 40 || water < 50 || grass < 48 ? "warning" : "stable"
  };
}
function visitorContributionRate(reserve = {}) {
  const { activity, retention } = visitorEngagement(reserve);
  return { activity, retention, unit: Math.max(2, Math.min(6, 2 + n(reserve.business) * .03)), rate: Math.max(2, Math.min(6, 2 + n(reserve.business) * .03)) * activity * retention };
}
function todayVisitorLossRoom(reserve, crowd) {
  const contribution = todayChapterContribution(reserve);
  if (contribution === null) return crowd;
  return Math.min(crowd, contribution);
}
function applyVisitorFlow(reserve, delta, source = "visit") {
  const before = businessTodaySnapshot(reserve).visitors;
  let wanted = Math.round(Number(delta) || 0);
  if (wanted < 0) {
    wanted = -Math.min(todayVisitorLossRoom(reserve, before), Math.abs(wanted));
  }
  if (!wanted) return { before, after: before, delta: 0 };
  const applied = Math.round(Number(applyChapterVisitorDelta(reserve, wanted, source).applied) || 0);
  return { before, after: Math.max(0, before + applied), delta: applied };
}
function applyTodayIncome(reserve, incomeDelta, fundBefore, label, title, recordLedger) {
  const operations = ((reserve.development || {}).operations);
  const today = operations && operations.today;
  if (today && incomeDelta) {
    today.income = Math.max(0, n(today.income) + incomeDelta);
    today.recruitedIncome = Math.max(0, n(today.recruitedIncome) + incomeDelta);
    operations.totalIncome = Math.max(0, n(operations.totalIncome) + incomeDelta);
  }
  reserve.fund = Math.max(0, fundBefore + incomeDelta);
  if (recordLedger && reserve.fund !== fundBefore) {
    recordFundChange(reserve, fundBefore, reserve.fund, label, ((reserve.guardianCycle || {}).day) || 1, title);
  }
  return reserve.fund;
}
function applyRealNatureBusinessChange(reserve, active = {}, resolved = true, recordLedger = true) {
  const emergency = reserve.emergency || (reserve.emergency = {});
  if (emergency.pendingArcheryRoll !== undefined) delete emergency.pendingArcheryRoll;
  const sign = resolved ? 1 : -1;
  const fundBefore = n(reserve.fund);
  const crowdBefore = businessTodaySnapshot(reserve).visitors;
  const impactChanges = realNatureImpactPair(active).map((item) => {
    const amounts = CORE_METRIC_AMOUNTS[item.metric] || {};
    const amount = (amounts[item.weight] || amounts.中 || 1) * sign;
    if (item.metric === "fund") {
      const before = n(reserve.fund);
      const after = applyTodayIncome(reserve, Math.round(amount), before, "真实事件结算", active.title, recordLedger);
      return { metric: "fund", label: item.label, unit: item.unit, before, after, delta: after - before };
    }
    if (item.metric === "visitors") {
      const flow = applyVisitorFlow(reserve, amount, amount >= 0 ? "visit" : "loss");
      return { metric: "visitors", label: item.label, unit: item.unit, before: flow.before, after: flow.after, delta: flow.delta };
    }
    // A real-event adjudication is a chapter task outcome.  Keep its animal
    // delta in the chapter progress ledger so the chapter HUD reflects the
    // result after reopening the sandbox.  Generic migration/idle flows keep
    // their existing source bucket elsewhere.
    const animalOptions = item.metric === "animals"
      ? { inflow: resolved ? "tasked" : "died", outflow: "died" }
      : {};
    return Object.assign({ unit: item.unit }, applyCoreMetric(reserve, item.metric, amount, animalOptions));
  });
  const byMetric = (metric) => impactChanges.find((item) => item.metric === metric);
  const visitors = byMetric("visitors");
  const animals = byMetric("animals");
  return {
    visitorsBefore: visitors ? visitors.before : crowdBefore,
    visitorsAfter: visitors ? visitors.after : crowdBefore,
    visitorsDelta: visitors ? visitors.delta : 0,
    fundBefore,
    fundAfter: n(reserve.fund),
    fundDelta: n(reserve.fund) - fundBefore,
    animalsBefore: animals ? animals.before : 0,
    animalsAfter: animals ? animals.after : 0,
    animalsDelta: animals ? animals.delta : 0,
    impactChanges,
    chapterAnimalLedgerVersion: 1
  };
}
function backfillRealEventAnimalLedger(reserve = {}, change = {}) {
  if (!change || Number(change.chapterAnimalLedgerVersion) >= 1) return change;
  const animal = (change.impactChanges || []).find((item) => item && item.metric === "animals");
  const delta = Math.round(Number(animal && animal.delta) || 0);
  if (delta > 0) recordIncrease(reserve, "tasked", delta);
  if (delta < 0) recordDecrease(reserve, "died", -delta);
  change.chapterAnimalLedgerVersion = 1;
  return change;
}
function applyEventBusinessOutcome(reserve, active, resolved, recordLedger = true) {
  const emergency = reserve.emergency || (reserve.emergency = {});
  if (emergency.businessEffect && emergency.businessEffect.eventId === active.id) {
    const cached = emergency.businessEffect.change;
    if (isRealNatureEventType(active.type)) backfillRealEventAnimalLedger(reserve, cached);
    return cached;
  }
  if (isRealNatureEventType(active.type)) {
    const realChange = applyRealNatureBusinessChange(reserve, active, resolved, recordLedger);
    emergency.businessEffect = { eventId: active.id, resolved, remainingActions: 3, change: realChange };
    return realChange;
  }
  const operations = ((reserve.development || {}).operations);
  const today = operations && operations.today;
  const visitorsBefore = today ? n(today.visitors) + n(today.recruitedVisitors) : 0;
  const profile = eventBusinessProfile(active);
  const rawDelta = resolved ? visitorsBefore * profile.recoveryRate : -visitorsBefore * profile.lossRate;
  const lossRoom = todayVisitorLossRoom(reserve, visitorsBefore);
  const wanted = rawDelta > 0 ? Math.max(1, Math.round(rawDelta))
    : rawDelta < 0 && lossRoom > 0 ? -Math.min(lossRoom, Math.max(1, Math.ceil(-rawDelta))) : 0;
  const flow = today ? applyVisitorFlow(reserve, wanted, wanted >= 0 ? "visit" : "loss") : { before: visitorsBefore, after: visitorsBefore, delta: 0 };
  const delta = flow.delta;
  const fundBefore = n(reserve.fund);
  const incomeDelta = delta >= 0 ? Math.round(delta * visitorContributionRate(reserve).rate)
    : -Math.min(fundBefore, n(today && today.income), Math.round(n(today && today.income) * -delta / Math.max(1, visitorsBefore)));
  applyTodayIncome(reserve, incomeDelta, fundBefore, resolved ? "事件恢复客流" : "事件游客退款", active.title, recordLedger);
  const change = { visitorsBefore, visitorsAfter: visitorsBefore + delta, visitorsDelta: delta, fundBefore, fundAfter: reserve.fund, fundDelta: reserve.fund - fundBefore };
  emergency.businessEffect = { eventId: active.id, resolved, remainingActions: !resolved && profile.lossRate === 0 ? 0 : 3, change };
  return change;
}
const NEIGHBOR_EXCHANGE_SHARES = Object.freeze({
  self: Object.freeze({ grass: 6, sample: 3, visitorRate: .12, visitorFloor: 3, label: "我方更得利" }),
  fair: Object.freeze({ grass: 4, sample: 2, visitorRate: .08, visitorFloor: 2, label: "互惠交换" }),
  neighbor: Object.freeze({ grass: 2, sample: 1, visitorRate: .04, visitorFloor: 1, label: "邻区更得利" })
});
function neighborExchangeShareKey(roll) {
  const score = Math.max(1, Math.min(6, Math.round(Number(roll) || 0)));
  return score >= 5 ? "self" : score >= 3 ? "fair" : "neighbor";
}
function applyNeighborExchangeShare(reserve, active = {}, roll = 4, recordLedger = true) {
  const emergency = reserve.emergency || (reserve.emergency = {});
  if (emergency.businessEffect && emergency.businessEffect.eventId === active.id) return emergency.businessEffect.change;
  const key = neighborExchangeShareKey(roll);
  const share = NEIGHBOR_EXCHANGE_SHARES[key];
  const ecology = reserve.ecology || (reserve.ecology = {});
  const grassBefore = n(ecology.grass);
  ecology.grass = Math.max(0, Math.min(100, grassBefore + share.grass));
  const sampleDelta = addPendingRecovered(reserve, "researchSample", share.sample);
  const crowd = businessTodaySnapshot(reserve).visitors;
  const flow = applyVisitorFlow(reserve, Math.max(share.visitorFloor, Math.round(crowd * share.visitorRate)), "visit");
  const fundBefore = n(reserve.fund);
  const incomeDelta = Math.round(flow.delta * visitorContributionRate(reserve).rate);
  applyTodayIncome(reserve, incomeDelta, fundBefore, "邻区交换客流", active.title, recordLedger);
  const change = {
    exchangeShare: key,
    exchangeLabel: share.label,
    exchangeRoll: Math.max(1, Math.min(6, Math.round(Number(roll) || 4))),
    grassDelta: ecology.grass - grassBefore,
    sampleDelta,
    visitorsBefore: flow.before,
    visitorsAfter: flow.after,
    visitorsDelta: flow.delta,
    fundBefore,
    fundAfter: reserve.fund,
    fundDelta: reserve.fund - fundBefore
  };
  emergency.businessEffect = { eventId: active.id, resolved: true, remainingActions: 3, change };
  return change;
}
function businessTodaySnapshot(reserve = {}) {
  const operations = ((reserve.development || {}).operations) || {};
  const today = operations.today;
  return { operations, today, visitors: today ? n(today.visitors) + n(today.recruitedVisitors) : 0 };
}
function applyNarrativeBusinessChange(reserve = {}, profile = {}, event = {}, label = "剧情事件") {
  const { operations, today, visitors: visitorsBefore } = businessTodaySnapshot(reserve);
  const fundBefore = n(reserve.fund);
  const rawDelta = today && visitorsBefore ? visitorsBefore * (profile.demand - 1) : 0;
  const narrativeLossRoom = todayVisitorLossRoom(reserve, visitorsBefore);
  const wanted = rawDelta > 0 ? Math.max(1, Math.round(rawDelta))
    : rawDelta < 0 && narrativeLossRoom > 0 ? -Math.min(narrativeLossRoom, Math.max(1, Math.ceil(-rawDelta))) : 0;
  const delta = today ? applyVisitorFlow(reserve, wanted, wanted >= 0 ? "visit" : "loss").delta : 0;
  const rate = visitorContributionRate(reserve).rate;
  const incomeDelta = delta >= 0
    ? Math.round(delta * rate)
    : -Math.min(n(today && today.income), Math.round(n(today && today.income) * (-delta) / Math.max(1, visitorsBefore)));
  if (today && delta !== 0) {
    today.income = Math.max(0, n(today.income) + incomeDelta);
    today.recruitedIncome = Math.max(0, n(today.recruitedIncome) + incomeDelta);
    operations.totalIncome = Math.max(0, n(operations.totalIncome) + incomeDelta);
  }
  reserve.fund = Math.max(0, fundBefore + incomeDelta);
  const change = {
    visitorsBefore,
    visitorsAfter: visitorsBefore + delta,
    visitorsDelta: delta,
    fundBefore,
    fundAfter: reserve.fund,
    fundDelta: reserve.fund - fundBefore,
    demand: profile.demand,
    activity: profile.activity,
    retention: profile.retention,
    immediate: !!(today && visitorsBefore)
  };
  if (change.fundDelta) recordFundChange(reserve, fundBefore, reserve.fund, label, ((reserve.guardianCycle || {}).day) || 1, event.title || label);
  return change;
}
function applyNarrativeBusinessPressure(reserve = {}, event = {}) {
  if (!event || !event.id) return null;
  const current = reserve.storyBusinessEffect || {};
  if (current.eventId === event.id && current.phase === "pressure") return current.change || null;
  const profile = narrativeBusinessProfile(event, "", false);
  const change = applyNarrativeBusinessChange(reserve, profile, event, "剧情事件客流变化");
  reserve.storyBusinessEffect = {
    eventId: event.id,
    title: event.title || "生态剧情",
    phase: "pressure",
    resolved: false,
    remainingActions: 2,
    demand: profile.demand,
    activity: profile.activity,
    retention: profile.retention,
    change
  };
  return change;
}
function applyNarrativeBusinessOutcome(reserve = {}, event = {}, choiceId = "") {
  if (!event || !event.id) return null;
  const profile = narrativeBusinessProfile(event, choiceId, true);
  const previous = reserve.storyBusinessEffect && reserve.storyBusinessEffect.eventId === event.id && reserve.storyBusinessEffect.phase === "pressure"
    ? normalizedBusinessEffect(reserve.storyBusinessEffect)
    : null;
  const adjustment = previous
    ? { demand: profile.demand / previous.demand, activity: profile.activity / previous.activity, retention: profile.retention / previous.retention }
    : profile;
  const change = applyNarrativeBusinessChange(reserve, adjustment, event, "剧情选择客流变化");
  change.demand = profile.demand;
  change.activity = profile.activity;
  change.retention = profile.retention;
  reserve.storyBusinessEffect = {
    eventId: event.id,
    title: event.title || "生态剧情",
    phase: "resolved",
    resolved: true,
    remainingActions: 3,
    demand: profile.demand,
    activity: profile.activity,
    retention: profile.retention,
    change
  };
  return change;
}
function applyActionBusinessPulse(reserve = {}, action = "", actionOutcome = {}) {
  const base = ACTION_BUSINESS_PULSE[action];
  if (!base) return null;
  const succeeded = actionOutcome.success !== false && !actionOutcome.blocked;
  const demand = 1 + (succeeded ? base : -base * 1.4);
  const profile = { demand, activity: 1 + (succeeded ? base * .6 : -base), retention: 1 + (succeeded ? base * .8 : -base * 1.2) };
  const change = { visitorsDelta: 0, fundDelta: 0, demand: profile.demand, activity: profile.activity, retention: profile.retention, immediate: false };
  reserve.actionBusinessEffect = {
    action, phase: "action", resolved: succeeded, remainingActions: 1,
    demand: profile.demand, activity: profile.activity, retention: profile.retention, change
  };
  return change;
}
function advanceBusinessEffects(reserve = {}) {
  ["storyBusinessEffect", "actionBusinessEffect"].forEach((key) => {
    const effect = reserve[key];
    if (!effect || !Number.isFinite(Number(effect.remainingActions))) return;
    effect.remainingActions = Math.max(0, Math.round(Number(effect.remainingActions) - 1));
    if (!effect.remainingActions) delete reserve[key];
  });
  const animalEffect = reserve.animalInteractionBusinessEffect;
  if (animalEffect && Number.isFinite(Number(animalEffect.remainingActions))) {
    animalEffect.remainingActions = Math.max(0, Math.round(Number(animalEffect.remainingActions) - 1));
    if (!animalEffect.remainingActions) delete reserve.animalInteractionBusinessEffect;
  }
}
function eventBusinessSummary(change = {}) {
  const sign = (v) => v > 0 ? `↑${v}` : v < 0 ? `↓${-v}` : "→0";
  return `本事件：游客 ${sign(change.visitorsDelta || 0)} 人 · 保护基金 ${sign(change.fundDelta || 0)} 星币`;
}
module.exports = {
  EVENT_CATEGORIES, eventCategory, eventBusinessProfile, eventBusinessFactors, visitorEngagement,
  NEIGHBOR_EXCHANGE_SHARES, neighborExchangeShareKey, applyNeighborExchangeShare,
  visitorContributionRate, applyEventBusinessOutcome, applyNarrativeBusinessPressure,
  applyNarrativeBusinessOutcome, applyActionBusinessPulse, advanceBusinessEffects, narrativeBusinessProfile, eventBusinessSummary
};
