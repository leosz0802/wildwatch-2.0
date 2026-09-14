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
const { normalizeWildernessKnowledge } = require("./wildernessKnowledge");
const { normalizeEcologyNarrative } = require("./ecologyNarrativeSystem");
const { localDateKey, normalizeFirstReturnHook } = require("./firstReturnHook");
const { normalizeReserveDevelopment } = require("./reserveDevelopment");
const { normalizeChapterRescue, chapterDefinition, poacherRescueState } = require("./chapterRescueSystem");

const STORAGE_KEY = "forest_kingdom_wechat_game_state";
const MAX_STORED_REPORTS = 12;

function compactStoredText(value, limit) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function compactReportForStorage(report = {}) {
  const visual = report.visual || {};
  const eventCard = visual.eventCard || {};
  const compactVisual = {};
  ["actionType", "actionLabel", "location", "regionId", "icon", "influenceNote"].forEach((key) => {
    if (visual[key] !== undefined && visual[key] !== null && visual[key] !== "") compactVisual[key] = visual[key];
  });
  if (eventCard.title || eventCard.body || eventCard.tag) {
    compactVisual.eventCard = {
      tag: compactStoredText(eventCard.tag, 32),
      title: compactStoredText(eventCard.title, 120),
      body: compactStoredText(eventCard.body, 600)
    };
  }
  return {
    id: compactStoredText(report.id, 80),
    day: Math.max(0, Math.round(Number(report.day) || 0)),
    type: report.type === "public" ? "public" : "private",
    title: compactStoredText(report.title, 120),
    body: compactStoredText(report.body, 1200),
    visual: compactVisual
  };
}

function compactStateForStorage(state = {}) {
  return Object.assign({}, state, {
    reports: (Array.isArray(state.reports) ? state.reports : [])
      .slice(-MAX_STORED_REPORTS)
      .map(compactReportForStorage)
  });
}

function normalizeWeatherPulse(pulse) {
  if (!pulse || typeof pulse !== "object") return null;
  const type = String(pulse.type || "").trim();
  if (!type) return null;
  return {
    type,
    label: String(pulse.label || type),
    regionId: String(pulse.regionId || ""),
    startedAt: Math.max(0, Number(pulse.startedAt) || 0),
    expiresAt: Math.max(0, Number(pulse.expiresAt) || 0),
    remainingDays: Math.max(0, Math.round(Number(pulse.remainingDays) || 0)),
    intensity: Math.max(0, Math.min(1, Number(pulse.intensity) || 0))
  };
}

function defaultState() {
  const world = createInitialWorld();
  const reserve = world.reserve || {};
  const rescueState = normalizeChapterRescue(reserve, 1, { fresh: true });
  // A new game must complete its chapter rescue before promotion. Legacy
  // compatibility flags belong to loaded saves, never the default template.
  rescueState.legacyGateBypass = false;
  reserve.inventory = reserve.inventory || {};
  delete reserve.inventory.rescueItems;
  chapterDefinition(1).captive.forEach((speciesId) => {
    const group = require("./animalWorld").speciesPopulationGroup(speciesId);
    if (reserve.ecology && reserve.ecology[group]) delete reserve.ecology[group][speciesId];
  });
  return {
    world,
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
      const rescueVersion = Number((((saved.world || {}).reserve || {}).chapterRescue || {}).version) || 0;
      const normalized = normalizeState(saved);
      if (rescueVersion < 3 || !hadReserveSerial && normalized.world && normalized.world.reserve && normalized.world.reserve.base && normalized.world.reserve.base.serial) {
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
  if (["深林第一王国", "森灵纪", "野境守护"].includes(state.world.name)) state.world.name = fresh.world.name;
  state.world.goals = state.world.goals || fresh.world.goals;
  if (!state.world.goals.longTerm) state.world.goals.longTerm = fresh.world.goals.longTerm;
  if (!state.world.goals.midTerm) state.world.goals.midTerm = fresh.world.goals.midTerm;
  if (!state.world.goals.daily) state.world.goals.daily = fresh.world.goals.daily;
  state.world.reserve = normalizeReserve(state.world.reserve, fresh.world.reserve);
  state.world.knownCharacters = syncKnownCharactersForReserve(savedKnownCharacters, state.world.reserve);
  state.character = normalizeCharacter(state.character);
  state.reports = (Array.isArray(state.reports) ? state.reports : [])
    .slice(-MAX_STORED_REPORTS)
    .map(compactReportForStorage);
  // 自由文本入口已移除；升级旧存档时同时清除历史玩家文本，避免继续保存 UGC。
  state.messages = [];
  delete state.contentSecurity;
  state.ui = Object.assign({}, (saved && saved.ui) || {});
  const firstReturnHook = normalizeFirstReturnHook(state.ui.firstReturnHook);
  if (firstReturnHook) state.ui.firstReturnHook = firstReturnHook;
  else delete state.ui.firstReturnHook;
  if (state.ui.firstSessionFocus && state.ui.firstSessionFocus.version === 1) {
    const focus = state.ui.firstSessionFocus;
    state.ui.firstSessionFocus = {
      version: 1,
      startedAt: Math.max(0, Number(focus.startedAt) || 0),
      startedDateKey: String(focus.startedDateKey || ""),
      activeSeconds: Math.max(0, Math.min(180, Number(focus.activeSeconds) || 0)),
      completed: !!focus.completed,
      endedReason: String(focus.endedReason || "")
    };
  }
  normalizeCollectionState(state);
  state.world.goals = normalizeGoalState(state.world.goals, state);
  return state;
}

function normalizeReserve(saved, fallback) {
  const base = Object.assign({}, createReserveState(), fallback || {});
  const reserve = Object.assign({}, base, saved || {});
  reserve.base = Object.assign({}, base.base || {}, (saved && saved.base) || {});
  if (["苔原哨站", "远方哨站", "我的基地"].includes(String(reserve.base.name || "").trim())) reserve.base.name = "自然保护区";
  const finiteOr = (value, fallbackValue = 0) => Number.isFinite(Number(value)) ? Number(value) : fallbackValue;
  const bounded = (value, fallbackValue = 0, min = 0, max = 100) => Math.max(min, Math.min(max, finiteOr(value, fallbackValue)));
  const legacyStarCoins = Math.max(0, Math.round(finiteOr(saved && saved.starCoins, 0)));
  if (legacyStarCoins > 0) reserve.fund = Math.max(0, Math.round(finiteOr(reserve.fund, 0))) + legacyStarCoins;
  delete reserve.starCoins;
  reserve.ecology = {
    predators: Object.assign({}, base.ecology.predators, (saved && saved.ecology && saved.ecology.predators) || {}),
    herbivores: Object.assign({}, base.ecology.herbivores, (saved && saved.ecology && saved.ecology.herbivores) || {}),
    birds: Object.assign({}, base.ecology.birds, (saved && saved.ecology && saved.ecology.birds) || {}),
    water: ((saved && saved.ecology && saved.ecology.water) || base.ecology.water),
    grass: ((saved && saved.ecology && saved.ecology.grass) || base.ecology.grass),
    disease: ((saved && saved.ecology && saved.ecology.disease) || base.ecology.disease)
  };
  reserve.ecologyNarrative = normalizeEcologyNarrative((saved && saved.ecologyNarrative) || base.ecologyNarrative || {});
  reserve.inventory = Object.assign({}, base.inventory, (saved && saved.inventory) || {});
  reserve.pendingRecovered = Object.assign({}, base.pendingRecovered || {}, (saved && saved.pendingRecovered) || {});
  reserve.ecologyEconomy = normalizeEcologyEconomy((saved && saved.ecologyEconomy) || base.ecologyEconomy, reserve);
  reserve.lastMaterialExploration = saved && saved.lastMaterialExploration
    ? JSON.parse(JSON.stringify(saved.lastMaterialExploration))
    : null;
  reserve.materialExplorationProgress = Object.assign({}, (saved && saved.materialExplorationProgress) || {});
  const lastShot = reserve.lastMaterialExploration;
  if (lastShot && !Object.prototype.hasOwnProperty.call(reserve.materialExplorationProgress, lastShot.targetId)) {
    reserve.materialExplorationProgress[lastShot.targetId] = Math.max(0, Number((lastShot.collectionProgress || {}).current) || Number(lastShot.roll) || 0);
  }
  reserve.wildernessKnowledge = normalizeWildernessKnowledge((saved && saved.wildernessKnowledge) || base.wildernessKnowledge || {});
  reserve.mysteryEvidence = normalizeMysteryEvidence((saved && saved.mysteryEvidence) || base.mysteryEvidence);
  reserve.strategy = normalizeStrategyState((saved && saved.strategy) || base.strategy);
  reserve.guardianPromises = normalizeGuardianPromises((saved && saved.guardianPromises) || base.guardianPromises);
  reserve.facilityConstruction = Object.assign({}, base.facilityConstruction || {}, (saved && saved.facilityConstruction) || {});
  normalizeFacilityConstruction(reserve);
  reserve.development = Object.assign({}, base.development || {}, (saved && saved.development) || {});
  normalizeReserveDevelopment(reserve);
  reserve.supplies = Object.assign({}, base.supplies, (saved && saved.supplies) || {});
  reserve.emergencySupplyAd = Object.assign(
    {},
    base.emergencySupplyAd || { version: 1, lastGuardianDay: 0, claimCount: 0, claimCountToday: 0, lastReward: null },
    (saved && saved.emergencySupplyAd) || {}
  );
  reserve.emergencySupplyAd.lastGuardianDay = Math.max(0, Math.round(finiteOr(reserve.emergencySupplyAd.lastGuardianDay, 0)));
  reserve.emergencySupplyAd.claimCount = Math.max(0, Math.round(finiteOr(reserve.emergencySupplyAd.claimCount, 0)));
  reserve.emergencySupplyAd.claimCountToday = Math.max(0, Math.round(finiteOr(reserve.emergencySupplyAd.claimCountToday, 0)));
  // V3.1 将历史上同时承担修复/救助的 fieldKit 拆成两种库存。
  // 旧存档保留原工具包，并给予安全线内的医疗包，避免升级后动物救助突然软锁。
  if (!(saved && saved.supplies && Object.prototype.hasOwnProperty.call(saved.supplies, "medicalKit"))) {
    reserve.supplies.medicalKit = Math.min(2, Math.max(0, Number(reserve.supplies.fieldKit) || 0));
  }
  reserve.market = Object.assign({}, base.market, (saved && saved.market) || {});
  reserve.listenedIntel = Object.assign({}, base.listenedIntel || {}, (saved && saved.listenedIntel) || {});
  reserve.animalCareLog = Object.assign({}, base.animalCareLog || {}, (saved && saved.animalCareLog) || {});
  reserve.social = Object.assign({}, base.social, (saved && saved.social) || {});
  // 好友通信按自然日持久化，避免重复渲染或重新进入游戏时重复发信。
  const savedFriendLetters = saved && saved.social && saved.social.friendLetters;
  const friendLetters = (savedFriendLetters && typeof savedFriendLetters === "object") ? savedFriendLetters : {};
  reserve.social.friendLetters = {
    version: 1,
    lastGeneratedDay: Math.max(0, Math.round(finiteOr(friendLetters.lastGeneratedDay, 0))),
    sent: Array.isArray(friendLetters.sent) ? friendLetters.sent.filter((letter) => letter && letter.id).slice(-50) : [],
    received: Array.isArray(friendLetters.received) ? friendLetters.received.filter((letter) => letter && letter.id).slice(-50) : []
  };
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
  reserve.progression.level = Math.max(1, Math.min(7, Math.round(finiteOr(reserve.progression.level, 1))));
  const savedHadStage = !!(saved && saved.progression && Number.isFinite(Number(saved.progression.stage)));
  reserve.progression.stage = Math.max(1, Math.min(14, Math.round(savedHadStage ? finiteOr(saved.progression.stage, 1) : reserve.progression.level * 2 - 1)));
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
    clueIdleActions: Math.max(0, Math.round(finiteOr(savedAging.clueIdleActions, 0))),
    pendingAges: Object.assign({}, savedAging.pendingAges || {}),
    recoveryCooldown: Math.max(0, Math.round(finiteOr(savedAging.recoveryCooldown, 0))),
    highFundActions: Math.max(0, Math.round(finiteOr(savedAging.highFundActions, 0))),
    projectCostCarry: Math.max(0, Math.min(99, Math.round(finiteOr(savedAging.projectCostCarry, 0)))),
    exchangeCooldowns: Object.assign({ fieldNote: 0, migrationTrace: 0, forestGift: 0 }, savedAging.exchangeCooldowns || {})
  };
  reserve.highStockProject = Object.assign({ unlocked: false, active: false, cost: 0, durationActions: 8 }, (saved && saved.highStockProject) || {});
  reserve.facilityDiscounts = Object.assign({}, (saved && saved.facilityDiscounts) || {});
  reserve.economyLedger = saved && saved.economyLedger ? JSON.parse(JSON.stringify(saved.economyLedger)) : null;
  reserve.fundLedger = Array.isArray(saved && saved.fundLedger)
    ? saved.fundLedger.slice(-500).map((entry) => Object.assign({}, entry))
    : Array.isArray(base.fundLedger) ? base.fundLedger.slice(-500) : [];
  reserve.speciesChanges = Object.assign({}, base.speciesChanges || {}, (saved && saved.speciesChanges) || {});
  reserve.seasonState = Object.assign({}, base.seasonState || { name: "雨季", day: 1, cycleDay: 1, changed: false }, (saved && saved.seasonState) || {});
  reserve.emergency = Object.assign({}, base.emergency || { active: null, cooldown: 0, history: [], lastOutcome: null }, (saved && saved.emergency) || {});
  reserve.emergency.active = saved && saved.emergency && saved.emergency.active ? Object.assign({}, saved.emergency.active) : null;
  reserve.emergency.history = ((saved && saved.emergency && saved.emergency.history) || []).slice(-8);
  reserve.weatherPulse = normalizeWeatherPulse((saved && saved.weatherPulse) || base.weatherPulse || null);
  reserve.chapterRescue = saved && saved.chapterRescue ? JSON.parse(JSON.stringify(saved.chapterRescue)) : null;
  reserve.poacherRescue = JSON.parse(JSON.stringify((saved && saved.poacherRescue) || {}));
  // Recover the animal deducted by an obsolete duplicate before ecology fills
  // empty populations, otherwise a last captive animal could become a new herd.
  poacherRescueState(reserve);
  reconcileSpeciesPopulations(reserve, { removeLocked: true, initializeUnlocked: true });
  // 新存档只直接获得 starter；旧存档补齐待解救记录，同时保留已有种群。
  const rescueChapter = Math.max(1, Math.round(reserve.progression.displayChapter || reserve.progression.stage || 1));
  const rescueFresh = !saved || (!saved.chapterRescue && Math.max(0, Number(reserve.progression.totalActions) || 0) === 0);
  const rescueState = normalizeChapterRescue(reserve, rescueChapter, { fresh: rescueFresh });
  if (rescueFresh) {
    const definition = chapterDefinition(rescueChapter);
    definition.captive.forEach((speciesId) => {
      const group = require("./animalWorld").speciesPopulationGroup(speciesId);
      if (reserve.ecology[group]) delete reserve.ecology[group][speciesId];
    });
  }
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
  reserve.league.broadcastPolicy = Object.assign(
    { day: 0, screenCount: 0, reportCount: 0, dailyLetterCount: 0 },
    (saved && saved.league && saved.league.broadcastPolicy) || {}
  );
  ["day", "screenCount", "reportCount", "dailyLetterCount"].forEach((key) => {
    reserve.league.broadcastPolicy[key] = Math.max(0, Math.round(finiteOr(reserve.league.broadcastPolicy[key], 0)));
  });
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
  const savedBroadcasts = saved && saved.league && saved.league.broadcasts;
  const baseBroadcasts = base.league && base.league.broadcasts;
  reserve.league.broadcasts = (Array.isArray(savedBroadcasts) ? savedBroadcasts : Array.isArray(baseBroadcasts) ? baseBroadcasts : [])
    .filter((report) => report && report.id)
    .slice(-30)
    .map((report) => Object.assign({}, report, {
      readAt: Math.max(0, Number(report.readAt) || 0),
      body: String(report.body || report.prose || "世界榜已有新的变化。")
    }));
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
  reserve.coreResources = Object.assign({}, base.coreResources || {}, reserve.coreResources || {}, { fund: reserve.fund });
  ["safety", "stability", "business", "reputation", "enforcement", "ecologyScore", "poacherPressure"].forEach((key) => {
    reserve[key] = bounded(reserve[key], base[key] || 0);
  });
  ["water", "disease"].forEach((key) => {
    reserve.ecology[key] = bounded(reserve.ecology[key], base.ecology[key] || 0);
  });
  // 草场采用紧平衡上沿：旧存档中长期堆到 90–100 的值会在载入时回到
  // 可恢复区间，后续再由动物取食、季节和修复共同拉扯，避免顶部指标长期满格。
  reserve.ecology.grass = bounded(reserve.ecology.grass, base.ecology.grass || 56, 0, 74);
  [reserve.inventory, reserve.supplies, reserve.pendingRecovered].forEach((group) => {
    Object.keys(group || {}).filter((key) => key !== "rescueItems").forEach((key) => { group[key] = Math.max(0, Math.round(finiteOr(group[key], 0))); });
  });
  const rescueItems = ((saved && saved.inventory && saved.inventory.rescueItems) || (reserve.inventory && reserve.inventory.rescueItems) || {});
  reserve.inventory = reserve.inventory || {};
  const normalizedRescueItems = Object.keys(rescueItems).reduce((map, key) => {
    map[key] = Math.max(0, Math.round(finiteOr(rescueItems[key], 0)));
    return map;
  }, {});
  if (Object.keys(normalizedRescueItems).length) reserve.inventory.rescueItems = normalizedRescueItems;
  else delete reserve.inventory.rescueItems;
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
  getRuntime().setStorageSync(STORAGE_KEY, compactStateForStorage(state));
  return state;
}

function resetState() {
  const state = defaultState();
  return saveState(state);
}

function createCharacter(_animal, name) {
  const state = loadState();
  const animalName = name || "保护区卫士";
  const createdAt = Date.now();
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
    cost: "物资、基金和公众信任都有限",
    influence: "能派猎犬收集信息、驱赶偷猎者、回收自然遗留物、执行许可内生态干预",
    cannotChange: "不能绕过保护规则直接逐利，也不能让所有动物停止自主行动",
    speciesGoal: "让保护区在生态、资金、执法压力之间保持可持续",
    ecologyFit: "依赖动物线索、物资和季节变化",
    rank: 3,
    rule: { hungerRate: 0, thirstRate: 0, staminaCost: 6, socialGain: 2 },
    createdAt
  };
  state.ui = Object.assign({}, state.ui || {}, {
    firstSessionFocus: {
      version: 1,
      startedAt: createdAt,
      startedDateKey: localDateKey(createdAt),
      activeSeconds: 0,
      completed: false,
      endedReason: ""
    }
  });
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
  normalizeReserve,
  compactReportForStorage,
  compactStateForStorage
};
