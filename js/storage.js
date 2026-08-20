const { getRuntime } = require("./runtime");
const { createInitialWorld, createReserveState, syncKnownCharactersForReserve } = require("./world");
const { normalizeFacilityConstruction } = require("./reserveFacilities");
const { reconcileSpeciesPopulations } = require("./animalWorld");
const { normalizeMysteryEvidence } = require("./mysteryRecoveries");
const { normalizeStrategyState } = require("./strategySystem");
const { normalizeCollectionState } = require("./collectionSystem");
const { normalizeEcologyEconomy } = require("./ecologyEconomy");
const { normalizeGuardianPromises } = require("./guardianPromises");
const { normalizeGoalState } = require("./goalSystem");
const { normalizeGuardianCycle, normalizeMastery } = require("./guardianCycle");
const { consistentMigrationSnapshot } = require("./ecologyConsistency");

const STORAGE_KEY = "forest_kingdom_wechat_game_state";

function defaultState() {
  return {
    world: createInitialWorld(),
    character: null,
    reports: [],
    messages: [],
    lastCommand: ""
  };
}

function loadState() {
  const runtime = getRuntime();
  try {
    const saved = runtime.getStorageSync(STORAGE_KEY);
    if (saved && saved.world) {
      const hadReserveSerial = !!(saved.world.reserve && saved.world.reserve.base && saved.world.reserve.base.serial);
      const normalized = normalizeState(saved);
      if (!hadReserveSerial && normalized.world && normalized.world.reserve && normalized.world.reserve.base && normalized.world.reserve.base.serial) {
        runtime.setStorageSync(STORAGE_KEY, normalized);
      }
      return normalized;
    }
  } catch (error) {
    console.warn("读取本地状态失败", error);
  }
  return defaultState();
}

function normalizeState(saved) {
  const fresh = defaultState();
  const savedKnownCharacters = ((saved && saved.world && saved.world.knownCharacters) || []).slice();
  const state = Object.assign({}, fresh, saved);
  state.world = Object.assign({}, fresh.world, saved.world || {});
  state.world.regions = fresh.world.regions.map((region) => {
    const old = (state.world.regions || []).find((item) => item.id === region.id || item.name === region.name);
    return Object.assign({}, old || {}, region);
  });
  state.world.knownCharacters = fresh.world.knownCharacters.map((character) => {
    const old = (state.world.knownCharacters || []).find((item) => item.id === character.id || item.name === character.name);
    return Object.assign({}, character, old || {}, {
      name: character.name,
      shortName: character.shortName,
      cartoonLook: character.cartoonLook,
      title: character.title,
      publicState: (old && old.publicState) || character.publicState,
      intent: (old && old.intent) || character.intent,
      relation: Object.assign({}, character.relation || {}, (old && old.relation) || {}),
      personality: (old && old.personality) || character.personality,
      wisdom: (old && old.wisdom) || character.wisdom,
      memory: ((old && old.memory) || character.memory || []).slice(-5),
      insight: (old && old.insight) || "",
      aiMood: (old && old.aiMood) || character.aiMood || null,
      ally: (old && old.ally) || false
    });
  });
  state.world.hierarchy = state.world.hierarchy || fresh.world.hierarchy;
  state.world.time = state.world.time || fresh.world.time;
  state.world.mapEvents = state.world.mapEvents || fresh.world.mapEvents;
  state.world.rumors = state.world.rumors || fresh.world.rumors;
  state.world.natureKnowledge = (state.world.natureKnowledge || fresh.world.natureKnowledge || []).slice(-6);
  state.world.aiForest = state.world.aiForest || fresh.world.aiForest || null;
  state.world.premise = state.world.premise || fresh.world.premise;
  state.world.biome = state.world.biome || fresh.world.biome;
  if (["深林第一王国", "森灵纪"].includes(state.world.name)) state.world.name = fresh.world.name;
  state.world.goals = state.world.goals || fresh.world.goals;
  if (!state.world.goals.longTerm) state.world.goals.longTerm = fresh.world.goals.longTerm;
  if (!state.world.goals.midTerm) state.world.goals.midTerm = fresh.world.goals.midTerm;
  if (!state.world.goals.daily) state.world.goals.daily = fresh.world.goals.daily;
  state.world.reserve = normalizeReserve(state.world.reserve, fresh.world.reserve);
  state.world.knownCharacters = syncKnownCharactersForReserve(savedKnownCharacters, state.world.reserve);
  state.character = normalizeCharacter(state.character);
  state.reports = state.reports || [];
  // 自由文本入口已移除；升级旧存档时同时清除历史玩家文本，避免继续保存 UGC。
  state.messages = [];
  delete state.contentSecurity;
  state.ui = Object.assign({}, (saved && saved.ui) || {});
  normalizeCollectionState(state);
  state.world.goals = normalizeGoalState(state.world.goals, state);
  return state;
}

function normalizeReserve(saved, fallback) {
  const base = Object.assign({}, createReserveState(), fallback || {});
  const reserve = Object.assign({}, base, saved || {});
  const finiteOr = (value, fallbackValue = 0) => Number.isFinite(Number(value)) ? Number(value) : fallbackValue;
  const bounded = (value, fallbackValue = 0, min = 0, max = 100) => Math.max(min, Math.min(max, finiteOr(value, fallbackValue)));
  reserve.ecology = {
    predators: Object.assign({}, base.ecology.predators, (saved && saved.ecology && saved.ecology.predators) || {}),
    herbivores: Object.assign({}, base.ecology.herbivores, (saved && saved.ecology && saved.ecology.herbivores) || {}),
    birds: Object.assign({}, base.ecology.birds, (saved && saved.ecology && saved.ecology.birds) || {}),
    water: ((saved && saved.ecology && saved.ecology.water) || base.ecology.water),
    grass: ((saved && saved.ecology && saved.ecology.grass) || base.ecology.grass),
    disease: ((saved && saved.ecology && saved.ecology.disease) || base.ecology.disease)
  };
  reserve.inventory = Object.assign({}, base.inventory, (saved && saved.inventory) || {});
  reserve.pendingRecovered = Object.assign({}, base.pendingRecovered || {}, (saved && saved.pendingRecovered) || {});
  reserve.ecologyEconomy = normalizeEcologyEconomy((saved && saved.ecologyEconomy) || base.ecologyEconomy, reserve);
  reserve.lastMaterialExploration = saved && saved.lastMaterialExploration
    ? JSON.parse(JSON.stringify(saved.lastMaterialExploration))
    : null;
  reserve.mysteryEvidence = normalizeMysteryEvidence((saved && saved.mysteryEvidence) || base.mysteryEvidence);
  reserve.strategy = normalizeStrategyState((saved && saved.strategy) || base.strategy);
  reserve.guardianPromises = normalizeGuardianPromises((saved && saved.guardianPromises) || base.guardianPromises);
  reserve.facilityConstruction = Object.assign({}, base.facilityConstruction || {}, (saved && saved.facilityConstruction) || {});
  normalizeFacilityConstruction(reserve);
  reserve.supplies = Object.assign({}, base.supplies, (saved && saved.supplies) || {});
  // V3.1 将历史上同时承担修复/救助的 fieldKit 拆成两种库存。
  // 旧存档保留原工具包，并给予安全线内的医疗包，避免升级后动物救助突然软锁。
  if (!(saved && saved.supplies && Object.prototype.hasOwnProperty.call(saved.supplies, "medicalKit"))) {
    reserve.supplies.medicalKit = Math.min(2, Math.max(0, Number(reserve.supplies.fieldKit) || 0));
  }
  reserve.market = Object.assign({}, base.market, (saved && saved.market) || {});
  reserve.listenedIntel = Object.assign({}, base.listenedIntel || {}, (saved && saved.listenedIntel) || {});
  reserve.animalCareLog = Object.assign({}, base.animalCareLog || {}, (saved && saved.animalCareLog) || {});
  reserve.social = Object.assign({}, base.social, (saved && saved.social) || {});
  reserve.safety = ((saved && typeof saved.safety === "number") ? saved.safety : base.safety);
  reserve.migration = Object.assign({}, base.migration, (saved && saved.migration) || {});
  if (reserve.migration.reason === "保护区安全等级稳定") {
    reserve.migration.reason = "水源与草场暂时稳定";
  }
  reserve.guardianRun = Object.assign({}, base.guardianRun, (saved && saved.guardianRun) || {});
  reserve.guardianRun.completedDays = Math.max(0, Math.min(reserve.guardianRun.length || 7, reserve.guardianRun.completedDays || 0));
  reserve.guardianRun.score = Math.max(0, Math.min(100, reserve.guardianRun.score || base.guardianRun.score || 55));
  reserve.guardianRun.streak = Math.max(0, reserve.guardianRun.streak || 0);
  reserve.progression = Object.assign({}, base.progression, (saved && saved.progression) || {});
  reserve.progression.level = Math.max(1, Math.min(5, Math.round(finiteOr(reserve.progression.level, 1))));
  const savedHadStage = !!(saved && saved.progression && Number.isFinite(Number(saved.progression.stage)));
  reserve.progression.stage = Math.max(1, Math.min(10, Math.round(savedHadStage ? finiteOr(saved.progression.stage, 1) : reserve.progression.level * 2 - 1)));
  reserve.progression.displayChapter = reserve.progression.stage;
  reserve.progression.daysManaged = Math.max(0, Math.round(finiteOr(reserve.progression.daysManaged, 0)));
  reserve.progression.totalActions = Math.max(0, Math.round(finiteOr(reserve.progression.totalActions, reserve.progression.daysManaged)));
  reserve.progression.totalMeaningfulActions = Math.max(0, Math.round(finiteOr(reserve.progression.totalMeaningfulActions, reserve.strategy.totalMeaningfulActions || 0)));
  reserve.progression.totalStrategicChoices = Math.max(0, Math.round(finiteOr(reserve.progression.totalStrategicChoices, reserve.strategy.totalChoices || 0)));
  reserve.progression.totalMajorStrategicChoices = Math.max(0, Math.round(finiteOr(reserve.progression.totalMajorStrategicChoices, reserve.strategy.totalMajorChoices || 0)));
  reserve.progression.activeSeconds = Math.max(0, finiteOr(reserve.progression.activeSeconds, 0));
  reserve.progression.totalFundEarned = Math.max(0, Math.round(finiteOr(reserve.progression.totalFundEarned, 0)));
  reserve.progression.totalMigratedIn = Math.max(0, Math.round(finiteOr(reserve.progression.totalMigratedIn, 0)));
  reserve.progression.totalRareRecovered = Math.max(0, Math.round(finiteOr(reserve.progression.totalRareRecovered, 0)));
  reserve.progression.totalMysteryRecovered = Math.max(0, Math.round(finiteOr(reserve.progression.totalMysteryRecovered, 0)));
  reserve.guardianCycle = normalizeGuardianCycle((saved && saved.guardianCycle) || base.guardianCycle, reserve.progression.totalActions);
  reserve.mastery = normalizeMastery((saved && saved.mastery) || base.mastery);
  const processing = (saved && saved.recoveredProcessing) || base.recoveredProcessing || {};
  reserve.recoveredProcessing = {
    version: 1,
    pending: Array.isArray(processing.pending) ? processing.pending.filter((item) => item && Number.isFinite(Number(item.dueDay))).slice(-12) : [],
    history: Array.isArray(processing.history) ? processing.history.slice(-20) : [],
    lastSettlement: processing.lastSettlement || null
  };
  const savedChapterStart = saved && saved.progression && (saved.progression.stageStart || saved.progression.chapterStart);
  reserve.progression.chapterStart = Object.assign({}, base.progression.chapterStart || {}, savedChapterStart || {});
  if (!savedChapterStart || reserve.progression.chapterStart.stage !== reserve.progression.stage) {
    reserve.progression.chapterStart = {
      stage: reserve.progression.stage,
      level: reserve.progression.level,
      daysManaged: reserve.progression.daysManaged,
      totalActions: reserve.progression.totalActions,
      totalMeaningfulActions: reserve.progression.totalMeaningfulActions,
      totalStrategicChoices: reserve.progression.totalStrategicChoices,
      totalMajorStrategicChoices: reserve.progression.totalMajorStrategicChoices,
      activeSeconds: reserve.progression.activeSeconds,
      totalFundEarned: reserve.progression.totalFundEarned,
      totalMigratedIn: reserve.progression.totalMigratedIn,
      totalRareRecovered: reserve.progression.totalRareRecovered
    };
  }
  reserve.progression.stageStart = Object.assign({}, reserve.progression.chapterStart);
  reserve.progression.fundEarningMode = "compliant_gross_v2";
  reserve.balanceVersion = 2;
  reserve.actionRepeat = Object.assign({ lastAction: null, count: 0, multiplier: 1 }, (saved && saved.actionRepeat) || {});
  const savedAging = (saved && saved.resourceAging) || {};
  reserve.resourceAging = {
    intelIdleActions: Math.max(0, Math.round(finiteOr(savedAging.intelIdleActions, 0))),
    pendingAges: Object.assign({}, savedAging.pendingAges || {}),
    recoveryCooldown: Math.max(0, Math.round(finiteOr(savedAging.recoveryCooldown, 0))),
    highFundActions: Math.max(0, Math.round(finiteOr(savedAging.highFundActions, 0))),
    projectCostCarry: Math.max(0, Math.min(99, Math.round(finiteOr(savedAging.projectCostCarry, 0)))),
    exchangeCooldowns: Object.assign({ fieldNote: 0, migrationTrace: 0, forestGift: 0 }, savedAging.exchangeCooldowns || {})
  };
  reserve.highStockProject = Object.assign({ unlocked: false, active: false, cost: 0, durationActions: 8 }, (saved && saved.highStockProject) || {});
  reserve.facilityDiscounts = Object.assign({}, (saved && saved.facilityDiscounts) || {});
  reserve.economyLedger = saved && saved.economyLedger ? JSON.parse(JSON.stringify(saved.economyLedger)) : null;
  reserve.speciesChanges = Object.assign({}, base.speciesChanges || {}, (saved && saved.speciesChanges) || {});
  reserve.seasonState = Object.assign({}, base.seasonState || { name: "雨季", day: 1, cycleDay: 1, changed: false }, (saved && saved.seasonState) || {});
  reserve.emergency = Object.assign({}, base.emergency || { active: null, cooldown: 0, history: [], lastOutcome: null }, (saved && saved.emergency) || {});
  reserve.emergency.active = saved && saved.emergency && saved.emergency.active ? Object.assign({}, saved.emergency.active) : null;
  reserve.emergency.history = ((saved && saved.emergency && saved.emergency.history) || []).slice(-8);
  reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });
  reserve.houndTeam = Object.assign({}, base.houndTeam, (saved && saved.houndTeam) || {});
  reserve.houndTeam.level = Math.max(1, Math.min(30, Math.round(reserve.houndTeam.level || 1)));
  reserve.houndTeam.xp = Math.max(0, Math.round(reserve.houndTeam.xp || 0));
  reserve.houndTeam.nextXp = Math.max(30, Math.round(reserve.houndTeam.nextXp || (reserve.houndTeam.level * 30 + 10)));
  reserve.houndTeam.totalRuns = Math.max(0, Math.round(reserve.houndTeam.totalRuns || 0));
  ["tracking", "pursuit", "guard", "stamina", "cohesion"].forEach((key) => {
    reserve.houndTeam[key] = Math.max(0, Math.min(100, Math.round(reserve.houndTeam[key] || base.houndTeam[key] || 50)));
  });
  reserve.houndTeam.title = reserve.houndTeam.title || (reserve.houndTeam.level >= 6 ? "熟练猎犬队" : reserve.houndTeam.level >= 3 ? "可靠猎犬队" : "新晋猎犬队");
  reserve.houndTeam.lastReward = reserve.houndTeam.lastReward || "猎犬队待命，下一次巡护会带回新线索。";
  reserve.eventChain = Object.assign({}, base.eventChain, (saved && saved.eventChain) || {});
  reserve.eventChain.current = Object.assign({}, base.eventChain.current, (saved && saved.eventChain && saved.eventChain.current) || {});
  reserve.eventChain.next = Object.assign({}, base.eventChain.next, (saved && saved.eventChain && saved.eventChain.next) || {});
  reserve.base = Object.assign({}, base.base, (saved && saved.base) || {});
  reserve.base.serial = normalizeReserveSerial(reserve.base.serial);
  reserve.base.protectedAnimals = Object.assign({}, base.base.protectedAnimals, (saved && saved.base && saved.base.protectedAnimals) || {});
  reserve.league = Object.assign({}, base.league, (saved && saved.league) || {});
  reserve.league.lastAction = Object.assign({}, base.league.lastAction, (saved && saved.league && saved.league.lastAction) || {});
  reserve.league.rivals = ((saved && saved.league && saved.league.rivals) || base.league.rivals).map((rival, index) => {
    const defaults = base.league.rivals[index] || base.league.rivals[0];
    const next = Object.assign({}, defaults, rival || {});
    const hadExplicitScope = Boolean(rival && rival.scope);
    next.scope = hadExplicitScope ? rival.scope : "world";
    next.simulated = typeof (rival && rival.simulated) === "boolean"
      ? rival.simulated
      : !hadExplicitScope || next.source === "system";
    next.source = next.simulated ? (next.source || "system") : (next.source || "player");
    return next;
  });
  reserve.league.logs = ((saved && saved.league && saved.league.logs) || base.league.logs).slice(-8);
  reserve.hounds = ((saved && saved.hounds) || base.hounds).map((hound, index) => {
    const defaults = base.hounds[index] || base.hounds[0];
    const next = Object.assign({}, defaults, hound || {});
    next.level = Math.max(1, Math.min(20, Math.round(next.level || 1)));
    next.xp = Math.max(0, Math.round(next.xp || 0));
    next.bond = Math.max(0, Math.min(100, Math.round(next.bond || defaults.bond || 50)));
    next.stamina = Math.max(0, Math.min(100, Math.round(next.stamina || defaults.stamina || 80)));
    return next;
  });
  reserve.fund = Math.max(0, Math.round(finiteOr(reserve.fund, base.fund || 0)));
  ["safety", "stability", "business", "reputation", "enforcement", "ecologyScore", "poacherPressure"].forEach((key) => {
    reserve[key] = bounded(reserve[key], base[key] || 0);
  });
  ["water", "grass", "disease"].forEach((key) => {
    reserve.ecology[key] = bounded(reserve.ecology[key], base.ecology[key] || 0);
  });
  [reserve.supplies, reserve.inventory, reserve.pendingRecovered].forEach((group) => {
    Object.keys(group || {}).forEach((key) => { group[key] = Math.max(0, Math.round(finiteOr(group[key], 0))); });
  });
  // Deprecated rhythm currencies remain as zero-valued compatibility fields
  // so old saves load safely, but they can no longer gate or reward actions.
  reserve.actionPoints = 0;
  reserve.intel = 0;
  reserve.fieldPermits = 0;
  reserve.base.raidTickets = 0;
  // 修复旧存档中“草场/水源高风险却仍显示迁入”的历史矛盾。
  // 这里只校正迁徙方向和解释，不追扣旧存档动物数量。
  reserve.migration = consistentMigrationSnapshot(reserve, reserve.migration || {});
  return reserve;
}

function normalizeReserveSerial(value) {
  const text = String(value || "").replace(/\D/g, "").slice(-4);
  if (text.length === 4) return text;
  return `${Math.floor(Math.random() * 10000)}`.padStart(4, "0");
}

function normalizeCharacter(character) {
  if (!character) return null;
  if (character.role !== "warden") return null;
  return Object.assign({
    id: "player_character",
    animalId: "warden",
    role: "warden",
    species: "卫士",
    animalName: "保护区卫士",
    location: "中央混交林",
    hunger: 10,
    thirst: 10,
    stamina: 82,
    health: 92,
    status: "alive",
    statusText: "正常",
    traits: ["巡护", "猎犬队", "生态干预"],
    tier: "warden",
    niche: "保护区管理者",
    pursuit: "维持生态平衡，并用合法收益反哺保护区",
    cost: "每次行动都会消耗人力、物资和公众信任",
    influence: "能调度猎犬、驱赶偷猎者、回收自然遗留物、执行许可内生态干预",
    cannotChange: "不能让生态瞬间稳定，也不能把保护变成无约束捕杀",
    rank: 3
  }, character);
}

function saveState(state) {
  normalizeCollectionState(state);
  getRuntime().setStorageSync(STORAGE_KEY, state);
  return state;
}

function resetState() {
  const state = defaultState();
  return saveState(state);
}

function createCharacter(_animal, name) {
  const state = loadState();
  const animalName = name || "保护区卫士";
  state.character = {
    id: "player_character",
    animalId: "warden",
    role: "warden",
    species: "卫士",
    animalName,
    location: "中央混交林",
    hunger: 10,
    thirst: 10,
    stamina: 82,
    health: 92,
    status: "alive",
    statusText: "正常",
    traits: ["巡护", "猎犬队", "合法回收"],
    tier: "warden",
    niche: "保护区管理者",
    pursuit: "保持森林动态平衡，让收益反哺保护区",
    cost: "行动点、物资和公众信任都有限",
    influence: "能派猎犬收集信息、驱赶偷猎者、回收自然遗留物、执行许可内生态干预",
    cannotChange: "不能绕过保护规则直接逐利，也不能让所有动物停止自主行动",
    speciesGoal: "让保护区在生态、资金、执法压力之间保持可持续",
    ecologyFit: "依赖动物线索、物资和季节变化",
    rank: 3,
    rule: { hungerRate: 0, thirstRate: 0, staminaCost: 6, socialGain: 2 },
    createdAt: Date.now()
  };
  state.world.reserve = normalizeReserve(state.world.reserve, createReserveState());
  state.reports = [
    {
      id: "welcome_private",
      day: state.world.day,
      type: "private",
      title: "你接管了保护区",
      body: `${animalName}，你成为${state.world.name}的自然保护区卫士。开局一队狗，繁荣全靠你：点沙盘动物听心声，派猎犬巡护，把随机收益重新投入保护区。`
    },
    {
      id: "welcome_public",
      day: state.world.day,
      type: "public",
      title: `第 ${state.world.day} 日世界报告`,
      body: "保护区记录：小雨提高了河岸湿地水源权重。中央混交林出现鹿群迁移迹象，西部岩坡洞域发现疑似陷阱气味，猎犬队待命。"
    }
  ];
  return saveState(state);
}

module.exports = {
  loadState,
  saveState,
  resetState,
  createCharacter,
  normalizeReserve
};
