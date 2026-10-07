const { performance } = require("perf_hooks");
const { createCharacter } = require("../js/storage");
const { simulateDay, reserveProgressionFor } = require("../js/simulator");
const { actionExecutable, applyGoalProgress, buildGoalView, normalizeGoalState, resolveGoals } = require("../js/goalSystem");
const { actionSupplyRequirement, supplyPurchaseById, supplyPurchaseForQuantity } = require("../js/actions");
const { collectStoryDiscovery, normalizeCollectionState, offerAnimalCollectionLead, updateCollectionAfterAction } = require("../js/collectionSystem");
const { strategicDilemmaById, applyStrategicChoice } = require("../js/strategySystem");
const { promiseByChapter, applyGuardianPromiseChoice } = require("../js/guardianPromises");
const { getUnlockedSpecies, SPECIES_DB, speciesPopulation, CHAPTERS } = require("../js/animalWorld");
const { BALANCE_V2, supplyCapFor } = require("../js/balanceConfig");
const {
  nextRescueTask,
  nextPoacherRescue,
  canRescueAnimal,
  rescueAnimal,
  rescuePoacherAnimal,
  recordRescueExploration,
  rescuePointTarget
} = require("../js/chapterRescueSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function numberArg(name, fallback) {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? Math.max(1, Math.round(Number(match.split("=")[1]) || fallback)) : fallback;
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function finite(value, label) {
  assert(Number.isFinite(value), `${label}不是有限数值：${value}`);
}

function total(group) {
  return Object.values(group || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

function inventoryTotal(reserve) {
  return total(reserve.inventory);
}

function collectPending(reserve) {
  reserve.inventory = reserve.inventory || {};
  reserve.pendingRecovered = reserve.pendingRecovered || {};
  let room = Math.max(0, BALANCE_V2.caps.inventory - inventoryTotal(reserve));
  Object.keys(reserve.pendingRecovered).forEach((id) => {
    if (!room) return;
    const amount = Math.max(0, Math.round(reserve.pendingRecovered[id] || 0));
    const accepted = Math.min(room, amount);
    if (!accepted) return;
    reserve.inventory[id] = (reserve.inventory[id] || 0) + accepted;
    reserve.pendingRecovered[id] = amount - accepted;
    room -= accepted;
  });
}

function restockVisibleGoalSupplies(state) {
  const reserve = (state.world || {}).reserve || {};
  const goals = buildGoalView(state, state.world.goals);
  const visible = [goals.primary].concat(goals.alternatives || []).filter(Boolean);
  visible.forEach((goal) => {
    if (!goal || actionExecutable(state, goal.recommendedAction)) return;
    const requirement = actionSupplyRequirement(goal.intendedAction || goal.recommendedAction, reserve);
    if (!requirement) return;
    const purchase = supplyPurchaseForQuantity(requirement.id, 1, reserve) || supplyPurchaseById(requirement.id, reserve);
    if (!purchase || purchase.amount < 1 || (reserve.fund || 0) < purchase.cost) return;
    reserve.fund = Math.max(0, Math.round(Number(reserve.fund) || 0) - purchase.cost);
    reserve.supplies = reserve.supplies || {};
    const cap = supplyCapFor(requirement.id, reserve);
    const before = Math.max(0, Math.round(Number(reserve.supplies[requirement.id]) || 0));
    reserve.supplies[requirement.id] = Math.min(cap, before + purchase.amount);
  });
  return state;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// 倾听、安抚和现场收录不占晨/午/暮关键行动。商业压力测试必须像真实
// 玩家一样完成这些轻互动，否则剧情证据永远为 0，会把“测试没操作”误报
// 成章节软锁。
function settleNonKeyGoal(state, rng, ambientAnimal = false) {
  normalizeCollectionState(state);
  const primary = (buildGoalView(state, state.world.goals).primary || {});
  const located = ((((state.world || {}).collection || {}).discovery || {}).active) || null;
  // “现场发现”是沙盘上的显式可点击物件，不应因为更高优先级的风险卡而
  // 永远留在地图。真实玩家看见后可直接收录，因此压力模型也先处理它。
  if (located && located.status === "located") {
    const before = clone(state);
    const collected = collectStoryDiscovery(state, located.itemId);
    assert(collected.ok, `剧情物件${located.itemId}无法收录`);
    collected.state.world.reserve.progression = reserveProgressionFor(collected.state.world.reserve);
    state = applyGoalProgress(before, collected.state, { action: "collectionInvestigate", now: Date.now() }).state;
    state.world.goals = resolveGoals(state, normalizeGoalState(state.world.goals, state), "collection_archived");
    return { state, progressed: true };
  }
  if (primary.recommendedAction === "animalCare" || ambientAnimal) {
    const animals = (state.world.knownCharacters || []).filter((animal) => animal && animal.id);
    if (!animals.length) return { state, progressed: false };
    const guardianDay = ((((state.world.reserve || {}).guardianCycle || {}).day) || 1);
    const actor = animals[(guardianDay + ((state.world.reserve.progression || {}).stage || 1)) % animals.length];
    const before = clone(state);
    actor.relation = Object.assign({}, actor.relation || {}, {
      trust: Math.min(100, ((actor.relation || {}).trust || 40) + 2),
      threat: Math.max(0, ((actor.relation || {}).threat || 40) - 1)
    });
    const offered = offerAnimalCollectionLead(state, actor, { trigger: "care" }, rng);
    state = offered.state;
    const reserve = state.world.reserve;
    reserve.progression.totalMeaningfulActions = Math.max(0, Number(reserve.progression.totalMeaningfulActions) || 0) + 1;
    reserve.strategy.totalMeaningfulActions = Math.max(0, Number(reserve.strategy.totalMeaningfulActions) || 0) + 1;
    reserve.progression = reserveProgressionFor(reserve);
    state = applyGoalProgress(before, state, { action: "animalCare", now: Date.now() }).state;
    state.world.goals = resolveGoals(state, normalizeGoalState(state.world.goals, state), "animal_care");
    return { state, progressed: true };
  }
  return { state, progressed: false };
}

const routePolicies = {
  enforcement: ["antiPoacher", "houndScout", "habitat"],
  ecology: ["habitat", "intervention", "houndScout"],
  research: ["exploreMaterials", "houndScout", "habitat"],
  community: ["exploreMaterials", "habitat", "antiPoacher"]
};

const supplyForAction = {
  houndScout: "dogFood",
  antiPoacher: "alarm",
  habitat: "fieldKit",
  intervention: "tranquilizer"
};

const purchaseCommand = {
  dogFood: "采购狗粮包",
  alarm: "采购警报器",
  fieldKit: "采购野外工具包",
  tranquilizer: "采购阻滞弹",
  medicalKit: "采购医疗包"
};

const actionCommands = {
  houndScout: "派猎犬侦察：检查水边脚印 [路线:scent>herd]",
  antiPoacher: "驱赶偷猎者：封锁危险入口 [路线:evidence>exit]",
  habitat: "修复水源和草场：恢复暗泉与草甸 [路线:spring>meadow]",
  intervention: "执行许可内生态干预：隔离病群并转移兽群 [路线:isolate>relocate]",
  exploreMaterials: "跟随动物探索森林，寻找自然遗留。目标:researchSample 掷骰:6",
  salvage: "移交守护样本：提交科研与执法样本"
};

function recoveryAction(reserve, intended) {
  collectPending(reserve);
  const needed = supplyForAction[intended];
  if (needed && (reserve.supplies[needed] || 0) <= 0) {
    if ((reserve.fund || 0) >= 45) return "buySupplies";
    if (inventoryTotal(reserve) > 0) return "salvage";
    return "exploreMaterials";
  }
  if (intended === "buySupplies" && (reserve.fund || 0) < 45) {
    return inventoryTotal(reserve) > 0 ? "salvage" : "exploreMaterials";
  }
  if (intended === "salvage" && inventoryTotal(reserve) <= 0) return "exploreMaterials";
  return intended;
}

function riskAction(reserve, waterFloor = 38) {
  const eco = reserve.ecology || {};
  if ((eco.water || 0) < waterFloor || (eco.grass || 0) < waterFloor) return "habitat";
  if ((eco.disease || 0) > 55) return "intervention";
  if ((reserve.poacherPressure || 0) > 65) return "antiPoacher";
  return "";
}

function activeRescueTask(state) {
  const reserve = (state.world || {}).reserve || {};
  const chapter = Math.max(1, Math.round(Number((reserve.progression || {}).stage || 1)));
  return nextRescueTask(reserve, chapter) || nextPoacherRescue(reserve) || null;
}

function rescueItemNeeded(task) {
  return ((task && task.requiredItems) || []).find((itemId) => {
    const current = Math.max(0, Math.round(Number(((task.pointProgress || {})[itemId]) || 0)));
    return current < rescuePointTarget(task, itemId);
  }) || "";
}

function settleChapterRescue(state) {
  const reserve = (state.world || {}).reserve || {};
  const task = activeRescueTask(state);
  if (!task) return state;
  const last = reserve.lastMaterialExploration || {};
  const itemId = String(last.targetId || "") || ((task.requiredItems || [])[0] || "");
  const progress = last.collectionProgress || {};
  if (itemId && (task.requiredItems || []).includes(itemId) && Number(progress.current) > 0) {
    task.pointProgress = Object.assign({}, task.pointProgress || {}, { [itemId]: Math.max(0, Math.round(Number(progress.current) || 0)) });
    if (progress.completed || (last.reward && last.reward.id === itemId)) {
      recordRescueExploration(reserve, task.targetId || task.speciesId, itemId, true);
      task.collectedItems = Object.assign({}, task.collectedItems || {}, { [itemId]: true });
    }
  }
  if (task.recurring) {
    if ((task.requiredItems || []).every((id) => (task.collectedItems || {})[id] || Number((task.pointProgress || {})[id]) >= rescuePointTarget(task, id))) {
      rescuePoacherAnimal(reserve, task.targetId);
    }
  } else if (canRescueAnimal(reserve, task.targetId || task.speciesId)) {
    rescueAnimal(reserve, task.targetId || task.speciesId);
  }
  return state;
}

function intendedAction(state, profile, route, actionIndex) {
  const reserve = state.world.reserve;
  const urgent = riskAction(reserve, profile === "goal" ? 55 : 38);
  if (profile === "goal") {
    const primary = (buildGoalView(state, state.world.goals).primary || {});
    const action = primary.recommendedAction;
    if (["buySupplies", "salvage"].includes(action) && !urgent) return action;
    if (urgent) return urgent;
    const rescue = activeRescueTask(state);
    const canPatrol = (reserve.fund || 0) >= 45 || Object.values(reserve.supplies || {}).some((value) => Math.max(0, Number(value) || 0) > 0);
    const blockingGoal = primary.kind === "crisis"
      || ["habitat", "intervention", "antiPoacher"].includes(action);
    if (rescue && rescueItemNeeded(rescue) && canPatrol && !blockingGoal) return "exploreMaterials";
    if (["houndScout", "antiPoacher", "habitat", "intervention", "exploreMaterials"].includes(action)) return action;
    if (["animalCare", "collectionInvestigate", "rescueAnimal"].includes(action)) return "exploreMaterials";
    if (action === "facilityBuild") return "habitat";
  }
  if (urgent) return urgent;
  if (profile === "casual") {
    const cycle = ["houndScout", "exploreMaterials", "habitat"];
    return cycle[actionIndex % cycle.length];
  }
  const policy = routePolicies[route];
  return policy[actionIndex % policy.length];
}

function commandFor(action, reserve, intended, state) {
  if (action === "exploreMaterials") {
    const rescue = activeRescueTask(state);
    const itemId = rescueItemNeeded(rescue);
    const canPatrol = (reserve.fund || 0) >= 45 || Object.values(reserve.supplies || {}).some((value) => Math.max(0, Number(value) || 0) > 0);
    if (itemId && canPatrol) {
      const score = rescuePointTarget(rescue, itemId);
      const kind = rescue.recurring ? "poacher" : "chapter";
      return `跟随动物探索森林，寻找自然遗留。目标:${itemId} 掷骰:6 rescueTask:${kind} rescueScore:${score}`;
    }
  }
  if (action !== "buySupplies") return actionCommands[action] || actionCommands.houndScout;
  const goalPurchaseId = ((((buildGoalView(state, state.world.goals) || {}).primary) || {}).purchaseId) || "";
  // 若本次采购是为了解锁一个明确的风险行动，必须优先采购该行动所需
  // 物资；不能让通用目标的默认补给覆盖它，形成“反复采购却仍不能修复”。
  const id = supplyForAction[intended] || goalPurchaseId
    || Object.keys(BALANCE_V2.supplyCaps).sort((a, b) => {
      const ar = (reserve.supplies[a] || 0) / Math.max(1, BALANCE_V2.supplyCaps[a]);
      const br = (reserve.supplies[b] || 0) / Math.max(1, BALANCE_V2.supplyCaps[b]);
      return ar - br;
    })[0];
  return purchaseCommand[id] || purchaseCommand.dogFood;
}

function resolvePending(reserve, route, rng, day) {
  const pendingStrategy = (reserve.strategy || {}).pendingDilemma;
  if (pendingStrategy) {
    const dilemma = strategicDilemmaById(pendingStrategy.id);
    const choice = dilemma && (dilemma.choices.find((item) => item.route === route) || dilemma.choices[day % dilemma.choices.length]);
    assert(choice, `第${day}日策略事件没有可选方案`);
    const dice = choice.dice ? { roll: 1 + Math.floor(rng() * 6), routeModifier: 0, resourceModifier: 0 } : null;
    const resolved = applyStrategicChoice(reserve, dilemma.id, choice.id, dice);
    assert(resolved, `第${day}日策略事件无法结算`);
    reserve.progression = reserveProgressionFor(reserve);
  }
  const pendingPromise = (reserve.guardianPromises || {}).pending;
  if (pendingPromise) {
    const promise = promiseByChapter(pendingPromise.chapter);
    const choice = promise && (promise.choices.find((item) => item.route === route) || promise.choices[0]);
    assert(choice && applyGuardianPromiseChoice(reserve, pendingPromise.chapter, choice.id, { day, totalActions: (reserve.progression || {}).totalActions || 0 }), `第${day}日守护承诺无法结算`);
  }
}

function objectiveSignature(reserve) {
  return `${(reserve.progression || {}).stage || 1}|${(reserve.eventChain || {}).step || 0}|${((reserve.progression || {}).objectives || []).map((item) => `${item.id}:${item.current}:${item.complete ? 1 : 0}`).join(",")}`;
}

function validateState(state, label, previousStage) {
  const reserve = state.world.reserve;
  [reserve.fund, reserve.ecology.water, reserve.ecology.grass, reserve.ecology.disease, reserve.poacherPressure].forEach((value, index) => finite(value, `${label}.核心值${index}`));
  assert(reserve.fund >= 0, `${label}.基金为负数`);
  ["water", "grass", "disease"].forEach((key) => assert(reserve.ecology[key] >= 0 && reserve.ecology[key] <= 100, `${label}.${key}越界`));
  ["actionPoints", "intel", "fieldPermits"].forEach((key) => assert(!Object.prototype.hasOwnProperty.call(reserve, key), `${label}.${key}旧资源重新影响游戏`));
  Object.keys(reserve.supplies || {}).forEach((key) => {
    finite(reserve.supplies[key], `${label}.supplies.${key}`);
    assert(reserve.supplies[key] >= 0, `${label}.supplies.${key}为负数`);
    assert(reserve.supplies[key] <= supplyCapFor(key, reserve), `${label}.supplies.${key}超过上限`);
  });
  [reserve.inventory, reserve.pendingRecovered].forEach((group, groupIndex) => Object.keys(group || {}).forEach((key) => {
    if (key === "rescueItems" && group[key] && typeof group[key] === "object") {
      Object.keys(group[key]).forEach((itemId) => {
        finite(group[key][itemId], `${label}.goods${groupIndex}.rescueItems.${itemId}`);
        assert(group[key][itemId] >= 0, `${label}.goods${groupIndex}.rescueItems.${itemId}为负数`);
      });
      return;
    }
    finite(group[key], `${label}.goods${groupIndex}.${key}`);
    assert(group[key] >= 0, `${label}.goods${groupIndex}.${key}为负数`);
  }));
  assert(inventoryTotal(reserve) <= BALANCE_V2.caps.inventory, `${label}.库存超过上限`);
  assert(total(reserve.pendingRecovered) <= 12, `${label}.待收取队列持续膨胀`);
  const stage = (reserve.progression || {}).stage || 1;
  assert(stage >= previousStage && stage <= previousStage + 1, `${label}.章节倒退或跳级 ${previousStage}->${stage}`);
  const unlocked = new Set(getUnlockedSpecies((reserve.progression || {}).level || 1, stage).map((item) => item.id));
  (CHAPTERS || []).forEach((chapter) => {
    if (chapter.chapter <= stage) (chapter.newSpecies || []).forEach((id) => unlocked.add(id));
  });
  Object.keys(SPECIES_DB).forEach((id) => {
    const population = speciesPopulation(reserve, id);
    finite(population, `${label}.species.${id}`);
    assert(population >= 0, `${label}.species.${id}为负数`);
    if (!unlocked.has(id)) assert(population === 0, `${label}.锁定物种${id}提前出现`);
  });
  const goals = buildGoalView(state, state.world.goals);
  const visible = [goals.primary].concat(goals.alternatives || []).filter(Boolean);
  assert(visible.length >= 1 && visible.length <= 3, `${label}.没有1-3个可见目标`);
  assert(visible.some((goal) => goal.executable && actionExecutable(state, goal.recommendedAction)), `${label}.没有可执行目标`);
  visible.forEach((goal) => {
    if (goal.executable && actionExecutable(state, goal.recommendedAction)) return;
    if (goal.kind === "crisis" && (actionExecutable(state, "buySupplies") || actionExecutable(state, "salvage"))) return;
    assert(goal.executable && actionExecutable(state, goal.recommendedAction), `${label}.目标${goal.id}不可执行`);
  });
  assert(((reserve.strategy || {}).choiceHistory || []).length <= 80, `${label}.策略历史越界`);
  assert(((reserve.strategy || {}).consequences || []).length <= 16, `${label}.持续后果队列越界`);
  assert(((reserve.emergency || {}).history || []).length <= 8, `${label}.危机历史越界`);
  return stage;
}

const seedCount = numberArg("seeds", 40);
const guardianDays = numberArg("days", 120);
const maxStepLimitMs = numberArg("max-step-ms", 100);
const routeGapLimitDays = numberArg("route-gap-days", NaN);
const completionMinDays = numberArg("completion-min-days", 27);
const completionMaxDays = numberArg("completion-max-days", 41);
const trace = process.argv.includes("--trace");
const details = process.argv.includes("--details");
const stringArg = (name, fallback) => {
  const match = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.split("=")[1] : fallback;
};
const requestedRoutes = stringArg("routes", "all").split(",").filter(Boolean);
const requestedProfiles = stringArg("profiles", "all").split(",").filter(Boolean);
const traceRoute = stringArg("trace-route", "enforcement");
const routes = requestedRoutes.includes("all") ? Object.keys(routePolicies) : Object.keys(routePolicies).filter((id) => requestedRoutes.includes(id));
const profiles = requestedProfiles.includes("all") ? ["casual", "goal", "route"] : ["casual", "goal", "route"].filter((id) => requestedProfiles.includes(id));
const stopOnComplete = process.argv.includes("--stop-on-complete");
const outcomes = [];
let maxStepMs = 0;
let maxStepLabel = "";
const stepTimes = [];
const originalRandom = Math.random;
const originalDateNow = Date.now;

try {
  routes.forEach((route, routeIndex) => profiles.forEach((profile, profileIndex) => {
    for (let seedIndex = 0; seedIndex < seedCount; seedIndex += 1) {
      // 路线平衡必须在完全相同的随机环境下横向比较；路线不能再参与
      // 随机种子，否则“路线差异”会混入四组天气/事件样本差异。
      // profile 也使用稳定编号，保证筛选单个 profile 时仍可复现全量矩阵。
      const profileSeedIndex = { casual: 0, goal: 1, route: 2 }[profile] || 0;
      const rng = seeded(9109 + profileSeedIndex * 1009 + seedIndex * 7919);
      Math.random = rng;
      let state = createCharacter(null, `商业回归-${route}-${profile}-${seedIndex}`);
      normalizeCollectionState(state);
      const initialReserve = state.world.reserve;
      if (seedIndex % 10 === 0) {
        initialReserve.fund = 0;
        Object.keys(initialReserve.supplies).forEach((key) => { initialReserve.supplies[key] = 0; });
        Object.keys(initialReserve.inventory).forEach((key) => { initialReserve.inventory[key] = 0; });
        Object.keys(initialReserve.pendingRecovered).forEach((key) => { initialReserve.pendingRecovered[key] = 0; });
      }
      if (seedIndex % 10 === 1) {
        initialReserve.ecology.water = 22;
        initialReserve.ecology.grass = 24;
        initialReserve.ecology.disease = 58;
      }
      let previousStage = (initialReserve.progression || {}).stage || 1;
      let unchanged = 0;
      let signature = objectiveSignature(initialReserve);
      let zeroRecoveryActions = null;
      let zeroRecoveredAt = -1;
      const stageReachedDay = { 1: 1 };
      const actionCounts = {};
      let completeDay = null;
      const totalActions = guardianDays * 3;
      for (let actionIndex = 0; actionIndex < totalActions; actionIndex += 1) {
        const guardianDay = Math.floor(actionIndex / 3) + 1;
        Date.now = () => 1784044800000 + (guardianDay - 1) * 86400000 + (actionIndex % 3) * 60000;
        // 最多消费一个轻互动目标，避免在关键行动前人为刷取无限进度。
        // 每个守护日先听取/安抚一只动物，符合当前核心循环“点动物听心声→
        // 再决定关键行动”。它不消耗晨午暮额度，但会真实参与目标和发现。
        const nonKey = settleNonKeyGoal(state, rng, actionIndex % 3 === 0);
        state = nonKey.state;
        const reserve = state.world.reserve;
        collectPending(reserve);
        const intended = intendedAction(state, profile, route, actionIndex);
        const action = recoveryAction(reserve, intended);
        actionCounts[action] = (actionCounts[action] || 0) + 1;
        const command = commandFor(action, reserve, intended, state);
        const beforeKeyAction = clone(state);
        const startedAt = performance.now();
        const result = simulateDay(command, state);
        const elapsed = performance.now() - startedAt;
        stepTimes.push(elapsed);
        if (elapsed > maxStepMs) {
          maxStepMs = elapsed;
          maxStepLabel = `${route}.${profile}.seed${seedIndex}.action${actionIndex + 1}.${action}`;
        }
        state = { world: result.world, character: result.character, reports: (state.reports || []).concat(result.reports || []).slice(-12), messages: [] };
        // Game.performReserveAction 会在模拟器结算后把匹配行动写入剧情发现。
        // 压力测试直接调用 simulateDay，必须显式复现这一层编排。
        state = updateCollectionAfterAction(beforeKeyAction, state, {
          actionId: action,
          actionLabel: actionCommands[action] || action
        }, rng).state;
        collectPending(state.world.reserve);
        resolvePending(state.world.reserve, route, rng, Math.floor(actionIndex / 3) + 1);
        settleChapterRescue(state);
        const lived = state.world.reserve.progression || {};
        lived.activeSeconds = Math.max(0, Number(lived.activeSeconds) || 0) + 60;
        state.world.reserve.progression = reserveProgressionFor(state.world.reserve);
        state.world.goals = resolveGoals(state, normalizeGoalState(state.world.goals, state), "external_settlement");
        restockVisibleGoalSupplies(state);
        state.world.goals = resolveGoals(state, normalizeGoalState(state.world.goals, state), "external_settlement");
        if (trace && route === traceRoute && profile === "goal" && seedIndex === 0 && (actionIndex < 20 || actionIndex % 15 === 14)) {
          const snapshot = state.world.reserve;
          const primary = buildGoalView(state, state.world.goals).primary || {};
          const progression = snapshot.progression || {};
          console.log(JSON.stringify({
            actionIndex: actionIndex + 1,
            action,
            primary: primary.id,
            next: primary.recommendedAction,
            fund: snapshot.fund,
            supplies: snapshot.supplies,
            water: snapshot.ecology.water,
            grass: snapshot.ecology.grass,
            disease: snapshot.ecology.disease,
            poacher: snapshot.poacherPressure,
            stage: progression.stage,
            story: (snapshot.eventChain || {}).step,
            discovery: (((state.world.collection || {}).discovery || {}).active || {}).status || "",
            discoveryAction: ((((state.world.collection || {}).discovery || {}).active || {}).actionId) || "",
            discoveryCase: ((((state.world.collection || {}).discovery || {}).active || {}).caseId) || "",
            collected: Object.keys((state.world.collection || {}).items || {}).length,
            required: (progression.objectives || []).filter((item) => !item.optional).map((item) => `${item.id}:${item.current}/${item.target}:${item.complete ? 1 : 0}`),
            milestones: (progression.objectives || []).filter((item) => item.optional && item.id !== "expectedTime").map((item) => `${item.id}:${item.current}/${item.target}:${item.complete ? 1 : 0}`)
          }));
        }
        const validatedStage = validateState(state, `${route}.${profile}.seed${seedIndex}.action${actionIndex + 1}`, previousStage);
        if (validatedStage > previousStage && !stageReachedDay[validatedStage]) stageReachedDay[validatedStage] = guardianDay;
        previousStage = validatedStage;
        if ((state.world.reserve.progression || {}).chapterComplete && completeDay == null) completeDay = guardianDay;
        const nextSignature = objectiveSignature(state.world.reserve);
        unchanged = nextSignature === signature ? unchanged + 1 : 0;
        assert(unchanged < 6, `${route}/${profile}/seed${seedIndex}连续6次关键操作没有目标或章节进展`);
        signature = nextSignature;
        if (seedIndex % 10 === 0 && zeroRecoveryActions == null) {
          const hasPath = (state.world.reserve.fund || 0) >= 45 || total(state.world.reserve.supplies) > 0;
          if (hasPath) {
            zeroRecoveryActions = actionIndex + 1;
            zeroRecoveredAt = actionIndex;
          }
        }
        if (stopOnComplete && completeDay != null) break;
      }
      if (seedIndex % 10 === 0) assert(zeroRecoveryActions != null && zeroRecoveredAt < 3, `${route}/${profile}/seed${seedIndex}零资源未在3次操作内恢复`);
      const reserve = state.world.reserve;
      outcomes.push({
        route,
        profile,
        seedIndex,
        stage: (reserve.progression || {}).stage || 1,
        complete: !!(reserve.progression || {}).chapterComplete,
        completeDay,
        stageReachedDay,
        actionCounts,
        fund: reserve.fund,
        totalFundEarned: (reserve.progression || {}).totalFundEarned || 0,
        water: reserve.ecology.water,
        grass: reserve.ecology.grass,
        disease: reserve.ecology.disease,
        poacher: reserve.poacherPressure,
        blockers: ((reserve.progression || {}).objectives || [])
          .filter((item) => !item.complete && item.id !== "expectedTime")
          .map((item) => `${item.id}:${item.current}/${item.target}`)
      });
    }
  }));
} finally {
  Math.random = originalRandom;
  Date.now = originalDateNow;
}

const guided = outcomes.filter((item) => item.profile === "goal");
const progressed = guided.filter((item) => item.stage >= 3).length / Math.max(1, guided.length);
const healthyGuided = guided.filter((item) => item.water >= 25 && item.grass >= 25 && item.disease <= 80 && item.poacher <= 90).length / Math.max(1, guided.length);
const completedGuided = guided.filter((item) => item.complete && Number.isFinite(item.completeDay));
const completionDays = completedGuided.map((item) => item.completeDay).sort((a, b) => a - b);
const completionMedian = completionDays.length ? completionDays[Math.floor(completionDays.length / 2)] : null;
if (completionMedian != null) {
  assert(completionMedian >= completionMinDays && completionMedian <= completionMaxDays, `十阶段完成日中位数${completionMedian}，未落入${completionMinDays}-${completionMaxDays}日目标`);
  const routeMedians = routes.map((route) => {
    const days = completedGuided.filter((item) => item.route === route).map((item) => item.completeDay).sort((a, b) => a - b);
    return days.length ? days[Math.floor(days.length / 2)] : null;
  }).filter(Number.isFinite);
  if (routeMedians.length > 1) {
    const allowedGap = Number.isFinite(routeGapLimitDays) ? routeGapLimitDays : Math.ceil(completionMedian * 0.10);
    assert(Math.max(...routeMedians) - Math.min(...routeMedians) <= allowedGap, `四路线完成日差异过大：${routeMedians.join("/")}`);
  }
}
const completedFundSafe = completedGuided.filter((item) => {
  const danger = BALANCE_V2.fundHealth[5].danger;
  return item.fund >= danger;
}).length / Math.max(1, completedGuided.length);
const completionFundByRoute = routes.reduce((result, route) => {
  const funds = completedGuided.filter((item) => item.route === route).map((item) => item.fund).sort((a, b) => a - b);
  const danger = BALANCE_V2.fundHealth[5].danger;
  result[route] = funds.length ? {
    runs: funds.length,
    safe: funds.filter((value) => value >= danger).length,
    min: funds[0],
    median: funds[Math.floor(funds.length / 2)]
  } : { runs: 0, safe: 0, min: null, median: null };
  return result;
}, {});
assert(!completedGuided.length || completedFundSafe >= 0.90, `完成主线时基金安全率仅${Math.round(completedFundSafe * 100)}%：${JSON.stringify(completionFundByRoute)}`);
if (guardianDays >= 120) {
  const progressByRoute = routes.reduce((result, route) => {
    const rows = guided.filter((item) => item.route === route);
    result[route] = rows.map((item) => ({ stage: item.stage, complete: item.complete, fund: item.fund }));
    return result;
  }, {});
  assert(progressed >= 0.95, `目标跟随存档120守护日可量化推进率仅${Math.round(progressed * 100)}%：${JSON.stringify(progressByRoute)}`);
  const unhealthyByRoute = routes.reduce((result, route) => {
    const rows = guided.filter((item) => item.route === route);
    result[route] = {
      healthy: rows.filter((item) => item.water >= 25 && item.grass >= 25 && item.disease <= 80 && item.poacher <= 90).length,
      runs: rows.length,
      water: [Math.min(...rows.map((item) => item.water)), Math.max(...rows.map((item) => item.water))],
      grass: [Math.min(...rows.map((item) => item.grass)), Math.max(...rows.map((item) => item.grass))],
      disease: [Math.min(...rows.map((item) => item.disease)), Math.max(...rows.map((item) => item.disease))],
      poacher: [Math.min(...rows.map((item) => item.poacher)), Math.max(...rows.map((item) => item.poacher))]
    };
    return result;
  }, {});
  assert(healthyGuided >= 0.95, `目标跟随存档长期可恢复率仅${Math.round(healthyGuided * 100)}%：${JSON.stringify(unhealthyByRoute)}`);
  const balancedHabitat = guided.filter((item) => item.water >= 45 && item.water <= 85 && item.grass >= 45 && item.grass <= 85).length / Math.max(1, guided.length);
  assert(balancedHabitat >= 0.90, `目标跟随存档水草长期平衡率仅${Math.round(balancedHabitat * 100)}%：${JSON.stringify(unhealthyByRoute)}`);
}
const sortedStepTimes = stepTimes.slice().sort((a, b) => a - b);
const p95StepMs = sortedStepTimes[Math.min(sortedStepTimes.length - 1, Math.floor(sortedStepTimes.length * 0.95))] || 0;
const p9999StepMs = sortedStepTimes[Math.min(sortedStepTimes.length - 1, Math.floor(sortedStepTimes.length * 0.9999))] || 0;
// 数十万步长跑中的单个 raw max 会混入 Node GC/系统调度暂停。以
// P99.99 约束稳定慢路径，同时继续输出 raw max 供人工审计；若某条业务
// 路径真实持续超过 100ms，它会反复出现并仍然触发该门禁。
assert(p9999StepMs < maxStepLimitMs, `单步模拟P99.99耗时${p9999StepMs.toFixed(1)}ms，超过${maxStepLimitMs}ms门禁（raw max ${maxStepMs.toFixed(1)}ms @ ${maxStepLabel}）`);
assert(p95StepMs < 30, `单步模拟P95耗时${p95StepMs.toFixed(1)}ms，超过30ms门禁`);

const summary = profiles.reduce((result, profile) => {
  const rows = outcomes.filter((item) => item.profile === profile);
  result[profile] = {
    runs: rows.length,
    stageMedian: rows.map((item) => item.stage).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
    completeRuns: rows.filter((item) => item.complete).length,
    completionDays: rows.filter((item) => item.completeDay != null).map((item) => item.completeDay).sort((a, b) => a - b),
    stageReachMedians: Array.from({ length: 10 }, (_, index) => index + 1).reduce((map, stage) => {
      const days = rows.map((item) => item.stageReachedDay && item.stageReachedDay[stage]).filter(Number.isFinite).sort((a, b) => a - b);
      map[stage] = days.length ? days[Math.floor(days.length / 2)] : null;
      return map;
    }, {}),
    water: [Math.min(...rows.map((item) => item.water)), Math.max(...rows.map((item) => item.water))],
    grass: [Math.min(...rows.map((item) => item.grass)), Math.max(...rows.map((item) => item.grass))],
    fundMedian: rows.map((item) => item.fund).sort((a, b) => a - b)[Math.floor(rows.length / 2)],
    earnedMedian: rows.map((item) => item.totalFundEarned).sort((a, b) => a - b)[Math.floor(rows.length / 2)]
  };
  return result;
}, {});
const routeSummary = routes.reduce((result, route) => {
  const rows = outcomes.filter((item) => item.profile === "goal" && item.route === route);
  const days = rows.filter((item) => item.completeDay != null).map((item) => item.completeDay).sort((a, b) => a - b);
  result[route] = {
    runs: rows.length,
    completeRuns: rows.filter((item) => item.complete).length,
    completionMedian: days.length ? days[Math.floor(days.length / 2)] : null,
    meanActions: rows.reduce((totals, item) => {
      Object.keys(item.actionCounts || {}).forEach((action) => {
        totals[action] = Math.round((((totals[action] || 0) + item.actionCounts[action] / Math.max(1, rows.length))) * 10) / 10;
      });
      return totals;
    }, {}),
    stageReachMedians: Array.from({ length: 10 }, (_, index) => index + 1).reduce((map, stage) => {
      const reached = rows.map((item) => item.stageReachedDay && item.stageReachedDay[stage]).filter(Number.isFinite).sort((a, b) => a - b);
      map[stage] = reached.length ? reached[Math.floor(reached.length / 2)] : null;
      return map;
    }, {})
  };
  return result;
}, {});

console.log(`commercial long-run check ok (${routes.length} routes × ${profiles.length} profiles × ${seedCount} seeds × ${guardianDays} guardian days × 3 actions, p95 ${p95StepMs.toFixed(1)}ms, p99.99 ${p9999StepMs.toFixed(1)}ms, raw max ${maxStepMs.toFixed(1)}ms @ ${maxStepLabel})`);
console.log(`commercial outcomes ${JSON.stringify(summary)}`);
if (profiles.includes("goal")) console.log(`commercial route outcomes ${JSON.stringify(routeSummary)}`);
if (details) console.log(`commercial details ${JSON.stringify(outcomes)}`);
