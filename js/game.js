const { getRuntime } = require("./runtime");
const { animals } = require("./animals");
const { loadState, saveState, resetState, createCharacter } = require("./storage");
const { simulateDay, reserveProgressionFor } = require("./simulator");
const { habitatCapacitySnapshot, habitatMigrationAssessment, consistentMigrationSnapshot } = require("./ecologyConsistency");
const { reserveActionCatalog, reserveActionById, supplyPurchaseCatalog, supplyPurchaseById, supplyPurchaseForQuantity, supplyReplenishmentPlan } = require("./actions");
const { buildReserveView, actionLabel: reserveActionLabel } = require("./reserveView");
const { CHAPTERS, SPECIES_DB, getUnlockedSpecies, getSpeciesById, speciesPopulation, speciesStatus, speciesImportance, getSpeciesRelations, speciesDialogue, foodChainTiers, ECO_ROLES, RELATION_TYPES, MACRO_SENSITIVITY, getCurrentChapter, getNextChapter, getChapterProgress } = require("./animalWorld");
const { normalizeLifeMemory, advanceLifeMemory, prepareGuardianReturnLetter, markGuardianVisit, individualsForSpecies, bindStrategicIndividual, strategicAnimalOutcomePreview, applyStrategicAnimalConsequence, relationshipAxes, displayStatus: individualDisplayStatus } = require("./emotionSystem");
const { MYSTERY_RECOVERY_CATALOG, normalizeMysteryEvidence, mysteryEvidenceCount, mysteryRecoveryById } = require("./mysteryRecoveries");
const { STRATEGY_ROUTES, normalizeStrategyState, strategyRoute, strategicDilemmaById, effectPreview, adjustedEffectsFor, strategicResourceShortfall, strategicDicePreview, selectStrategicChoice, setPendingStrategicRoll, applyStrategicChoice } = require("./strategySystem");
const { explorationGoodById, previewMaterialExploration } = require("./materialExploration");
const { operationConfig, normalizeOperationPlan, encodeOperationPlan } = require("./actionOperations");
const { sharePayload, parseShareInvite, hasAssistedShare, applyShareAssistance, recordShareSent } = require("./shareSystem");
const { CASES: COLLECTION_CASES, CATALOG: COLLECTION_CATALOG, METHODS: COLLECTION_METHODS, ENDINGS: COLLECTION_ENDINGS, caseById: collectionCaseById, collectionItemById, itemsForCase: collectionItemsForCase, normalizeCollectionState, updateCollectionAfterAction, offerAnimalCollectionLead, startInvestigation, resolveInvestigation, submitCaseEnding, collectionSummary, collectStoryDiscovery, storyDiscoverySummary, discoveryStatusLabel } = require("./collectionSystem");
const { ROUTE_KITS, facilityById, facilityByCaseId, facilityStates, effectText: facilityEffectText, applyFacilityBuildStep, applyFacilitySpecialization } = require("./reserveFacilities");
const { recordOrdinaryMoment, latestOrdinaryMoment } = require("./ordinaryMoments");
const { AudioSystem, normalizeAudioSettings } = require("./audioSystem");
const { promiseByChapter, normalizeGuardianPromises, selectGuardianPromiseChoice, applyGuardianPromiseChoice, chosenPromiseChoices } = require("./guardianPromises");
const { FRAGMENT_CATALOG, normalizeEcologyEconomy, collectEcologyDrop, ecologyCompetitionReward } = require("./ecologyEconomy");
const { BALANCE_V2, chapterEconomy } = require("./balanceConfig");
const { buildGoalView, normalizeGoalState, resolveGoals, applyGoalProgress, goalDateKey, selectActiveGoal } = require("./goalSystem");
const { guardianContext, advanceGuardianCycle, awardMastery, masteryView, chooseMasteryBranch, recordSevenDayProgress } = require("./guardianCycle");
const { addPendingRecovered } = require("./resourceLedger");

const DESCRIPTION_TEXT_MIN = 10;
const MAX_CHAPTER_STORY_QUEUE = 2;
const MAX_PENDING_EMOTION_EVENTS = 6;

const ART_ATLAS = {
  src: "assets/art/core-sprites-atlas.png",
  mapSrc: "assets/art/core-map.jpg",
  devSrc: "assets/art/core-sprites-atlas.png",
  uiIconSources: {
    houndScout: "assets/art/ui-v3/icons/houndScout_v3.png",
    antiPoacher: "assets/art/ui-v3/icons/antiPoacher.png",
    habitat: "assets/art/ui-v3/icons/habitat_v3.png",
    salvage: "assets/art/ui-v3/icons/salvage.png",
    intervention: "assets/art/ui-v3/icons/intervention.png",
    buySupplies: "assets/art/ui-v3/icons/buySupplies.png",
    eye: "assets/art/ui-v3/icons/eye.png",
    signal: "assets/art/ui-v3/icons/signal.png",
    leaf: "assets/art/ui-v3/icons/leaf.png",
    claw: "assets/art/ui-v3/icons/claw.png",
    water: "assets/art/ui-v3/icons/water.png",
    berry: "assets/art/ui-v3/icons/leaf.png",
    trail: "assets/art/ui-v3/icons/trail.png",
    fund: "assets/art/ui-v3/icons/fund_v3.png",
    dogFood: "assets/art/ui-v3/icons/dogFood.png",
    tranquilizer: "assets/art/ui-v3/icons/tranquilizer.png",
    fieldKit: "assets/art/ui-v3/icons/buySupplies.png",
    salvageBadge: "assets/art/ui-v3/icons/salvage.png",
    migration: "assets/art/ui-v3/icons/migration.png",
    disease: "assets/art/ui-v3/icons/disease.png",
    action_points: "assets/art/ui-v3/icons/action_points.png",
    buy_single_supply: "assets/art/ui-v3/icons/buy_single_supply.png",
    collect_goods: "assets/art/ui-v3/icons/collect_goods.png",
    field_permit: "assets/art/ui-v3/icons/field_permit.png",
    hound_team: "assets/art/ui-v3/icons/hound_team.png",
    intel: "assets/art/ui-v3/icons/intel.png",
    nav_materials: "assets/art/ui-v3/icons/nav_materials.png",
    nav_patrol: "assets/art/ui-v3/icons/nav_patrol.png",
    nav_sandbox: "assets/art/ui-v3/icons/nav_sandbox.png",
    reserve_level: "assets/art/ui-v3/icons/reserve_level.png",
    reserve_prosperity: "assets/art/ui-v3/icons/reserve_prosperity.png",
    sell_goods: "assets/art/ui-v3/icons/sell_goods.png"
  },
  remote: {
    url: "",
    version: "savanna-v3-20260707",
    storageKey: "forest_kingdom_remote_art_atlas_v1",
    urlStorageKey: "forest_kingdom_remote_art_url",
    fileName: "forest-kingdom-art-atlas-savanna-v3.png"
  },
  frames: {
    map: { x: 0, y: 0, w: 1536, h: 864 },
    animals: { x: 0, y: 896, w: 1728, h: 576 },
    icon_eye: { x: 1760, y: 896, w: 64, h: 64 },
    icon_signal: { x: 1832, y: 896, w: 64, h: 64 },
    icon_leaf: { x: 1904, y: 896, w: 64, h: 64 },
    icon_claw: { x: 1760, y: 968, w: 64, h: 64 },
    icon_water: { x: 1832, y: 968, w: 64, h: 64 },
    icon_berry: { x: 1904, y: 968, w: 64, h: 64 },
    icon_trail: { x: 1760, y: 1040, w: 64, h: 64 },
    icon_fund: { x: 1832, y: 1040, w: 64, h: 64 },
    icon_dogFood: { x: 1904, y: 1040, w: 64, h: 64 },
    icon_tranquilizer: { x: 1760, y: 1112, w: 64, h: 64 },
    icon_fieldKit: { x: 1832, y: 1112, w: 64, h: 64 },
    icon_salvage: { x: 1904, y: 1112, w: 64, h: 64 }
  }
};

const CHAPTER_ART = {
  1: { start: "chapter-assets/chapter-1.jpg", end: "chapter-assets/chapter-1-summary.jpg" },
  2: { start: "chapter-assets/chapter-2-summary.jpg", end: "chapter-assets/chapter-2-summary.jpg" },
  3: { start: "chapter-assets/chapter-3.jpg", end: "chapter-assets/chapter-3.jpg" },
  4: { start: "chapter-assets/chapter-2.jpg", end: "chapter-assets/chapter-2.jpg" },
  5: { start: "chapter-assets/chapter-3.jpg", end: "chapter-assets/chapter-5-summary.jpg" }
};

const CHAPTER_ENDINGS = {
  1: "第一条气味线已经闭合。动物仍会观察你，但它们不再把每一次脚步都当成威胁。临时营地，终于站住了。",
  2: "巡护、回收和水草修复开始形成秩序。天空与浅滩愿意停留，保护站获得了第一份真正的信任。",
  3: "捕食者与食草动物都没有被你驯服，却在这里找到可以共存的距离。可信，来自持续而克制的选择。",
  4: "幼兽敢靠近水线，大型动物重新使用旧路线。这里不再只是一处安全点，而是一片真正的庇护地。",
  5: "五段旅程已经写进迁移线。季节仍会更替，危机仍会发生，但这片土地已经学会在你的守护下继续生长。"
};

const UI_THEME = {
  forest900: "#18352a",
  forest800: "#244a3a",
  forest700: "#356a53",
  forest600: "#648273",
  moss: "#8fa292",
  jade: "#8fb9a5",
  gold: "#c7a55f",
  goldDeep: "#8b6b32",
  ivory: "#fffdf7",
  parchment: "#f3f5f1",
  ink: "#1f2d27",
  muted: "#6b746f",
  danger: "#d35d57",
  good: "#4f8f6b",
  coral: "#cf756c",
  sky: "#92acb7",
  lavender: "#9696a5",
  surface: "rgba(255,255,255,.94)",
  surfaceStrong: "#fffefa",
  surfaceMuted: "rgba(246,248,245,.94)",
  separator: "rgba(60,60,67,.16)",
  tint: "#2f7d62",
  tintPressed: "#276b54",
  systemYellow: "#d99a2b"
};

// iOS-inspired system typography.  PingFang is the native Chinese face on
// iPhone; the fallbacks keep the same metrics in WeChat DevTools and Android.
const UI_FONT_STACK = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", sans-serif';

class Game {
  constructor() {
    this.runtime = getRuntime();
    this.info = this.runtime.getSystemInfoSync();
    this.menuButtonRect = this.resolveMenuButtonRect();
    this.dpr = this.info.pixelRatio || 1;
    this.canvas = this.runtime.createCanvas();
    this.canvas.width = this.info.windowWidth * this.dpr;
    this.canvas.height = this.info.windowHeight * this.dpr;
    this.ctx = this.canvas.getContext("2d");
    this.width = this.info.windowWidth;
    this.height = this.info.windowHeight;
    this.state = loadState();
    normalizeAudioSettings(this.state);
    this.audio = new AudioSystem(this.runtime, this.state);
    this.activePlayLastAt = Date.now();
    this.activePlayDirtySeconds = 0;
    const returnVisit = prepareGuardianReturnLetter(this.state.world || {});
    this.state.world.lifeMemory = returnVisit.state;
    this.pendingGuardianLetter = returnVisit.letter;
    saveState(this.state);
    const savedPrologue = (((this.state || {}).ui || {}).prologue) || {};
    const resumePlayablePrologue = !!(this.state.character && savedPrologue.version === 1 && !savedPrologue.completed);
    this.screen = this.state.character && !resumePlayablePrologue ? "home" : "choose";
    this.selectedAnimal = animals[0];
    this.selectedAnimalWorldSpecies = null;
    this.speciesPage = 0;
    this.animalSelectorScroll = 0;
    this.selectedTarget = this.state.world.knownCharacters[0];
    this.speakingAnimalId = (this.selectedTarget && this.selectedTarget.id) || null;
    this.selectedRivalId = this.defaultRivalId();
    this.leagueScope = "world";
    this.collectionCaseId = null;
    this.collectionPage = 0;
    this.collectionRollToken = null;
    this.command = "";
    this.selectedReserveAction = "houndScout";
    this.selectedPurchaseId = "";
    this.selectedPurchaseQuantity = 1;
    this.selectedRegionId = this.defaultRegionId();
    this.mapZoom = 1;
    this.mapCamera = { scale: 1, cx: 0.52, cy: 0.48 };
    this.artAtlas = ART_ATLAS;
    this.artDownload = { status: "local", progress: 0, source: "core" };
    this.art = {
      atlasMode: this.initialArtAtlasMode(),
      atlas: this.loadImageAsset(this.initialArtAtlasSrc()),
      map: this.loadImageAsset(this.initialMapSrc()),
      animalPortraits: this.loadImageAsset("assets/art/animal-portraits-atlas-v4.jpg"),
      animalMapSprites: this.loadImageAsset("assets/art/animal-map-sprites-atlas-v1.png"),
      facilities: this.loadImageAsset("assets/art/facility-sprites-atlas-v4.png"),
      facilityRouteKits: this.loadImageAsset("assets/art/facility-route-kits.png"),
      collectionItems: this.loadImageAsset("assets/art/collection/collection-items-atlas.png"),
      prologueFog: this.loadImageAsset("assets/art/prologue/prologue-fog-v1.jpg"),
      prologueTrail: this.loadImageAsset("assets/art/prologue/prologue-trail-v1.jpg"),
      uiIcons: this.loadUiIconAssets(this.artAtlas.uiIconSources || {})
    };
    this.chapterArt = {};
    this.chapterArtLoad = { status: "idle", progress: 0 };
    this.scrollY = 0;
    this.hitAreas = [];
    this.mapViewport = null;
    this.gesture = null;
    this.patrolTaskModal = null;
    this.patrolOperationPlan = null;
    this.infoDetailModal = null;
    this.settlementModal = null;
    this.chapterStoryModal = null;
    this.chapterStoryQueue = [];
    this.pendingEmotionEvent = null;
    this.pendingEmotionEvents = [];
    this.pendingGuardianLetter = null;
    this.pendingMissionAfterChapter = false;
    this.pendingMissionPush = ((this.state.ui || {}).pendingMissionPush)
      ? Object.assign({}, (this.state.ui || {}).pendingMissionPush)
      : null;
    this.deferQueuedMissionPush = false;
    this.pendingShareInvite = this.readShareInviteFromOptions();
    this.pendingShareWelcome = null;
    this.suppressNextHomeMission = false;
    this.pendingTaskOriginScreen = null;
    this.actionScreenOrigin = null;
    this.materialChangeNotice = null;
    this.dialogueCounter = 0;
    this.animalDialogueContexts = {};
    this.mapSpeakerFocus = null;
    this.mapSpeechSelection = null;
    this.mapSpeechHistory = {};
    this.animalMotionStates = {};
    this.ecologyVisualTiers = {};
    this.prologueRuntime = null;
    this.contentHeight = 0;
    this.anim = { t: 0, lastTs: 0, rafId: 0, paused: false, acc: 0 };
    this.tickBound = this.tick.bind(this);
    this.raf = typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : null;
    this.caf = typeof cancelAnimationFrame !== "undefined" ? cancelAnimationFrame : null;
    this.renderPending = false;
    this.numberAnimations = {};
    this.displayStats = this.initialDisplayStats();
    this.displayReserveStats = this.initialDisplayReserveStats();
    this.facilityBuildFlash = null;
    this.mapConsequencePulse = null;
    this.mapPatrolReplay = null;
    this.mapHarvestFlight = null;
    this.weeklyGuardianCelebration = null;
    this.screenChangedAt = -1000;
    this.dailyHeroExpanded = this.shouldShowDailyHero();
    this.dailyHeroCollapseAt = this.dailyHeroExpanded ? 2600 : 0;
    const weeklyGuardian = this.recordWeeklyGuardianVisit();
    if (weeklyGuardian && weeklyGuardian.pending) {
      this.weeklyGuardianCelebration = { startedAt: 0, activeDays: weeklyGuardian.streak || 7 };
    }
    this.configureSharing();
    this.prepareRemoteArtAtlas();
    this.bindEvents();
    this.render();
    const prologueActive = this.screen === "choose" && this.playablePrologueState().active;
    if (!prologueActive && !this.maybeOpenChapterStoryOnLogin() && !this.openQueuedMissionPush() && !this.openPendingShareInvite() && !this.openGuardianReturnLetter() && !this.openFirstOnboardingChoice() && !this.openPendingGuardianPromise()) this.maybeOpenMissionPush("login");
    if (this.raf && this.ctx) this.startLoop();
  }

  initialDisplayStats() {
    const c = this.state.character;
    if (!c) return { hunger: 0, thirst: 0, stamina: 0, health: 0 };
    return { hunger: c.hunger, thirst: c.thirst, stamina: c.stamina, health: c.health };
  }

  initialDisplayReserveStats() {
    const reserve = (this.state.world || {}).reserve || {};
    return this.reserveDynamicTargets(reserve);
  }

  startLoop() {
    if (!this.raf || !this.anim) return;
    if (this.anim.rafId) return;
    this.anim.paused = false;
    this.anim.lastTs = 0;
    this.scheduleNextFrame();
  }

  stopLoop() {
    if (!this.anim) return;
    this.anim.paused = true;
    if (this.anim.rafId && this.caf) {
      try { this.caf(this.anim.rafId); } catch (e) { /* ignore */ }
    }
    this.anim.rafId = 0;
  }

  scheduleNextFrame() {
    if (!this.raf || !this.anim || this.anim.paused) return;
    this.anim.rafId = this.raf(this.tickBound);
  }

  tick(ts) {
    if (!this.anim || this.anim.paused) return;
    const last = this.anim.lastTs || ts;
    let dt = ts - last;
    this.anim.lastTs = ts;
    if (dt < 0) dt = 0;
    if (dt > 64) dt = 64; // 限幅，防卡顿跳变
    this.anim.t += dt;
    this.anim.acc += dt;
    if (this.anim.acc < this.targetFrameMs()) {
      this.scheduleNextFrame();
      return;
    }
    const stepDt = this.anim.acc;
    this.anim.acc = 0;
    this.tweenDisplayStats(stepDt);
    this.tweenDisplayReserveStats(stepDt);
    this.updateDailyHeroAutoCollapse();
    this.render();
    this.scheduleNextFrame();
  }

  targetFrameMs() {
    if (this.gesture && this.gesture.mapPan) return 48;
    if (this.gesture) return 64;
    if (this.chapterStoryModal || this.settlementModal || this.patrolTaskModal || this.infoDetailModal) return 120;
    if (this.screen === "home") return 80;
    return 110;
  }

  tweenDisplayStats(dt) {
    const c = this.state.character;
    if (!c || !this.displayStats) return;
    const k = Math.min(1, dt * 0.006);
    ["hunger", "thirst", "stamina", "health"].forEach((key) => {
      this.displayStats[key] += (c[key] - this.displayStats[key]) * k;
    });
  }

  reserveDynamicTargets(reserve = (this.state.world || {}).reserve || {}) {
    const prosperity = this.reserveProsperitySummary(reserve || {});
    const team = this.houndTeamSummary(reserve || {});
    const ecology = reserve.ecology || {};
    const progression = reserve.progression || {};
    const run = reserve.guardianRun || {};
    const targets = {
      fund: reserve.fund || 0,
      valuation: prosperity.value || 0,
      animalTotal: prosperity.animalTotal || 0,
      speciesCount: prosperity.speciesCount || 0,
      safety: reserve.safety || 0,
      stability: reserve.stability || 0,
      ecologyScore: reserve.ecologyScore || 0,
      business: reserve.business || 0,
      water: ecology.water || 0,
      grass: ecology.grass || 0,
      disease: ecology.disease || 0,
      poacherPressure: reserve.poacherPressure || 0,
      migrationDelta: (reserve.migration && reserve.migration.delta) || 0,
      actionPoints: reserve.actionPoints || 0,
      intel: reserve.intel || 0,
      fieldPermits: reserve.fieldPermits || 0,
      guardianScore: run.score || 0,
      progressionScore: progression.score || 0,
      daysManaged: progression.daysManaged || 0,
      reserveLevel: progression.level || 1,
      houndXp: team.xp || 0,
      houndLevel: team.level || 1,
      houndNextXp: team.nextXp || 40,
      houndStamina: team.stamina || 0,
      houndCohesion: team.cohesion || 0,
      baseRating: (reserve.base && reserve.base.rating) || 0,
      baseShield: (reserve.base && reserve.base.shield) || 0,
      marketAntler: (reserve.market && reserve.market.antler) || 0,
      marketHide: (reserve.market && reserve.market.hideSalvage) || 0,
      marketResearch: (reserve.market && reserve.market.researchSample) || 0
    };
    Object.keys(reserve.supplies || {}).forEach((key) => { targets[`supply:${key}`] = reserve.supplies[key] || 0; });
    Object.keys(reserve.inventory || {}).forEach((key) => { targets[`inventory:${key}`] = reserve.inventory[key] || 0; });
    Object.keys(reserve.pendingRecovered || {}).forEach((key) => { targets[`pending:${key}`] = reserve.pendingRecovered[key] || 0; });
    Object.keys(SPECIES_DB).forEach((key) => { targets[`species:${key}`] = speciesPopulation(reserve, key); });
    return targets;
  }

  tweenDisplayReserveStats(dt) {
    if (!this.state.character) {
      this.displayReserveStats = this.initialDisplayReserveStats();
      return;
    }
    if (!this.displayReserveStats) this.displayReserveStats = this.initialDisplayReserveStats();
    if (!this.numberAnimations) this.numberAnimations = {};
    const targets = this.reserveDynamicTargets();
    Object.keys(targets).forEach((key) => {
      const target = Number(targets[key]) || 0;
      const current = typeof this.displayReserveStats[key] === "number" ? this.displayReserveStats[key] : target;
      let animation = this.numberAnimations[key];
      if (!animation || animation.target !== target) {
        animation = {
          from: current,
          target,
          delta: target - current,
          elapsed: 0,
          duration: 600,
          hold: 220
        };
        this.numberAnimations[key] = animation;
      }
      if (animation.elapsed < animation.duration) {
        animation.elapsed = Math.min(animation.duration, animation.elapsed + Math.max(0, dt || 0));
        const p = animation.duration ? animation.elapsed / animation.duration : 1;
        const eased = 1 - Math.pow(1 - p, 3);
        this.displayReserveStats[key] = animation.from + (animation.target - animation.from) * eased;
      } else {
        this.displayReserveStats[key] = animation.target;
        animation.elapsed += Math.max(0, dt || 0);
        if (animation.elapsed >= animation.duration + animation.hold) delete this.numberAnimations[key];
      }
    });
  }

  displayReserveNumber(key, target) {
    if (!this.displayReserveStats || typeof this.displayReserveStats[key] !== "number") return Math.round(target || 0);
    return Math.round(this.displayReserveStats[key]);
  }

  reserveDisplayDelta(key, target) {
    const animation = this.numberAnimations && this.numberAnimations[key];
    if (animation && animation.target === (Number(target) || 0) && animation.elapsed <= animation.duration + animation.hold) {
      return Math.round(animation.delta || 0);
    }
    if (!this.displayReserveStats || typeof this.displayReserveStats[key] !== "number") return 0;
    const delta = Math.round((target || 0) - this.displayReserveStats[key]);
    return Math.abs(delta) >= 1 ? delta : 0;
  }

  numberAnimationPulse(key) {
    const animation = this.numberAnimations && this.numberAnimations[key];
    if (!animation || !animation.delta || animation.elapsed > animation.duration + animation.hold) return 0;
    const p = Math.min(1, animation.elapsed / Math.max(1, animation.duration));
    return Math.sin(Math.PI * p);
  }

  drawChangeTag(ctx, x, y, delta, align = "left", options = {}) {
    if (!delta) return;
    const positive = options.inverse ? delta < 0 : delta > 0;
    const text = this.signed(delta);
    const w = Math.max(26, 12 + text.length * 7);
    const tx = align === "right" ? x - w : x;
    const pulse = options.key ? this.numberAnimationPulse(options.key) : 0;
    ctx.save();
    ctx.globalAlpha = 0.82 + pulse * 0.18;
    this.roundRect(ctx, tx, y, w, 16, 7, positive ? "rgba(92,184,122,0.22)" : "rgba(196,91,66,0.18)", positive ? "rgba(92,184,122,0.34)" : "rgba(196,91,66,0.32)");
    this.text(ctx, text, tx + w / 2, y + 12, 9, positive ? "#1f5a3f" : "#c45b42", "700", "center");
    ctx.restore();
  }

  markScreenChange() {
    if (this.anim) this.screenChangedAt = this.anim.t;
  }

  screenFade() {
    if (!this.anim) return 1;
    const dt = this.anim.t - this.screenChangedAt;
    if (dt >= 300) return 1;
    if (dt <= 0) return 0;
    return dt / 300;
  }

  initialArtAtlasSrc() {
    return this.isWechatRuntime() ? (this.artAtlas.src || ART_ATLAS.src) : (this.artAtlas.devSrc || this.artAtlas.src || ART_ATLAS.src);
  }

  initialArtAtlasMode() {
    return this.isWechatRuntime() ? "core" : "full";
  }

  initialMapSrc() {
    return this.artAtlas.mapSrc || ART_ATLAS.mapSrc;
  }

  isWechatRuntime() {
    return typeof wx !== "undefined" && this.runtime === wx;
  }

  loadImageAsset(src, options = {}) {
    const runtimeImage = this.runtime.createImage ? this.runtime.createImage() : null;
    const image = runtimeImage || (typeof Image !== "undefined" ? new Image() : null);
    if (!image) return null;
    image.loaded = false;
    image.onload = () => {
      image.loaded = true;
      if (options.onload) options.onload(image);
      this.requestRender();
    };
    image.onerror = () => {
      image.failed = true;
      if (options.onerror) options.onerror(image);
      this.requestRender();
    };
    image.src = src;
    return image;
  }

  prepareChapterArt() {
    if (this.chapterArtLoad && ["loading", "ready"].includes(this.chapterArtLoad.status)) return;
    if (!this.isWechatRuntime() || !this.runtime.loadSubpackage) {
      this.loadChapterArtAssets();
      return;
    }
    this.chapterArtLoad = { status: "loading", progress: 0 };
    const task = this.runtime.loadSubpackage({
      name: "chapters",
      success: () => this.loadChapterArtAssets(),
      fail: () => {
        this.chapterArtLoad = { status: "failed", progress: 0 };
        this.requestRender();
      }
    });
    if (task && task.onProgressUpdate) {
      task.onProgressUpdate((event) => {
        this.chapterArtLoad = { status: "loading", progress: Math.max(0, Math.min(100, event.progress || 0)) };
        this.requestRender();
      });
    }
  }

  loadChapterArtAssets() {
    this.chapterArtLoad = { status: "loading", progress: 0 };
    const uniquePaths = [...new Set(Object.values(CHAPTER_ART).flatMap((config) => [config.start, config.end]))];
    let pending = uniquePaths.length;
    let failed = 0;
    const done = (ok) => {
      pending -= 1;
      if (!ok) failed += 1;
      if (pending <= 0) {
        this.chapterArtLoad = { status: failed >= uniquePaths.length ? "failed" : "ready", progress: 100, failed };
        this.requestRender();
      }
    };
    const imageCache = {};
    uniquePaths.forEach((path) => {
      imageCache[path] = this.loadImageAsset(path, { onload: () => done(true), onerror: () => done(false) });
    });
    this.chapterArt = Object.keys(CHAPTER_ART).reduce((assets, level) => {
      const config = CHAPTER_ART[level];
      assets[level] = {
        start: imageCache[config.start],
        end: imageCache[config.end]
      };
      return assets;
    }, {});
  }

  loadUiIconAssets(sources) {
    const icons = {};
    Object.keys(sources || {}).forEach((key) => {
      icons[key] = this.loadImageAsset(sources[key]);
    });
    return icons;
  }

  prepareRemoteArtAtlas() {
    const remote = (this.artAtlas && this.artAtlas.remote) || {};
    const url = this.remoteArtUrl(remote);
    if (!url || !this.runtime.downloadFile) return;
    const cached = this.runtime.getStorageSync ? this.runtime.getStorageSync(remote.storageKey) : null;
    if (cached && cached.version === remote.version && cached.url === url && cached.path) {
      this.loadArtAtlasCandidate(cached.path, "cache");
      return;
    }
    this.downloadRemoteArtAtlas(url, remote);
  }

  remoteArtUrl(remote) {
    const stored = this.runtime.getStorageSync ? this.runtime.getStorageSync(remote.urlStorageKey) : "";
    if (stored) return stored;
    if (typeof globalThis !== "undefined" && globalThis.FOREST_ART_ATLAS_URL) return globalThis.FOREST_ART_ATLAS_URL;
    return remote.url || "";
  }

  downloadRemoteArtAtlas(url, remote) {
    this.artDownload = { status: "downloading", progress: 0, source: "remote" };
    const task = this.runtime.downloadFile({
      url,
      success: (res) => {
        const ok = !res.statusCode || (res.statusCode >= 200 && res.statusCode < 300);
        if (!ok || !res.tempFilePath) {
          this.artDownload = { status: "failed", progress: 0, source: "remote" };
          return;
        }
        this.saveRemoteArtAtlas(res.tempFilePath, url, remote);
      },
      fail: () => {
        this.artDownload = { status: "failed", progress: 0, source: "remote" };
      }
    });
    if (task && task.onProgressUpdate) {
      task.onProgressUpdate((event) => {
        this.artDownload = {
          status: "downloading",
          progress: Math.max(0, Math.min(100, event.progress || 0)),
          source: "remote"
        };
        this.requestRender();
      });
    }
  }

  saveRemoteArtAtlas(tempFilePath, url, remote) {
    const fs = this.runtime.getFileSystemManager ? this.runtime.getFileSystemManager() : null;
    if (!fs || !fs.saveFile) {
      this.loadArtAtlasCandidate(tempFilePath, "temp");
      return;
    }
    const userPath = (this.runtime.env && this.runtime.env.USER_DATA_PATH) || "";
    const options = {
      tempFilePath,
      success: (res) => {
        const savedPath = res.savedFilePath || options.filePath || tempFilePath;
        if (this.runtime.setStorageSync) {
          this.runtime.setStorageSync(remote.storageKey, {
            version: remote.version,
            url,
            path: savedPath,
            savedAt: Date.now()
          });
        }
        this.loadArtAtlasCandidate(savedPath, "cache");
      },
      fail: () => {
        this.loadArtAtlasCandidate(tempFilePath, "temp");
      }
    };
    if (userPath && remote.fileName) options.filePath = `${userPath}/${remote.fileName}`;
    fs.saveFile(options);
  }

  loadArtAtlasCandidate(src, source) {
    this.artDownload = { status: "loading", progress: 100, source };
    this.loadImageAsset(src, {
      onload: (image) => {
        this.art.atlas = image;
        this.art.atlasMode = "full";
        this.artDownload = { status: "ready", progress: 100, source };
        this.requestRender();
      },
      onerror: () => {
        this.artDownload = { status: "failed", progress: 0, source };
      }
    });
  }

  artFrame(name) {
    return this.artAtlas && this.artAtlas.frames ? this.artAtlas.frames[name] : null;
  }

  artReady(name) {
    if (name === "map") return !!this.mapImageSource();
    return !!(this.art && this.art.atlas && this.art.atlas.loaded && this.artFrame(name));
  }

  mapImageSource() {
    const map = this.art && this.art.map;
    if (map && map.loaded) {
      return {
        image: map,
        frame: { x: 0, y: 0, w: map.width || map.naturalWidth || 1536, h: map.height || map.naturalHeight || 864 }
      };
    }
    const fullAtlas = this.art && this.art.atlasMode === "full" && this.art.atlas && this.art.atlas.loaded && this.artFrame("map");
    if (fullAtlas) return { image: this.art.atlas, frame: this.artFrame("map") };
    return null;
  }

  drawAtlasIcon(ctx, kind, x, y, size, alpha = 1) {
    const frame = this.artFrame(`icon_${kind}`);
    const image = this.art && this.art.atlas;
    if (!frame || !image || !image.loaded || !ctx.drawImage) return false;
    ctx.save();
    ctx.globalAlpha = typeof ctx.globalAlpha === "number" ? ctx.globalAlpha * alpha : alpha;
    ctx.drawImage(image, frame.x, frame.y, frame.w, frame.h, x - size / 2, y - size / 2, size, size);
    ctx.restore();
    return true;
  }

  uiIconKey(kind) {
    const map = {
      alarm: "icon_signal",
      days: "icon_signal",
      disease: "icon_disease",
      migration: "icon_migration",
      fund: "icon_fund",
      houndScout: "icon_houndScout",
      antiPoacher: "icon_antiPoacher",
      habitat: "icon_habitat",
      salvage: "icon_salvage",
      intervention: "icon_intervention",
      buySupplies: "icon_buySupplies",
      dogFood: "icon_dogFood",
      tranquilizer: "icon_tranquilizer",
      fieldKit: "icon_fieldKit",
      salvageBadge: "icon_salvageBadge",
      actionPoints: "action_points",
      collectGoods: "collect_goods",
      fieldPermit: "field_permit",
      houndTeam: "hound_team",
      navSandbox: "nav_sandbox",
      navPatrol: "nav_patrol",
      navMaterials: "nav_materials",
      reserveLevel: "reserve_level",
      reserveProsperity: "reserve_prosperity",
      sellGoods: "sell_goods",
      buySingleSupply: "buy_single_supply"
    };
    const key = map[kind] || kind;
    return key.replace(/^icon_/, "");
  }

  uiIconFrame(kind) {
    const key = this.uiIconKey(kind);
    const sources = this.artAtlas && this.artAtlas.uiIconSources;
    return sources && sources[key] ? { key } : null;
  }

  drawUiIcon(ctx, kind, x, y, size, active = false, alpha = 1) {
    const frame = this.uiIconFrame(kind);
    const key = frame && frame.key;
    const image = key && this.art && this.art.uiIcons && this.art.uiIcons[key];
    if (!key || !image || !image.loaded || !ctx.drawImage) return false;
    ctx.save();
    ctx.globalAlpha = typeof ctx.globalAlpha === "number" ? ctx.globalAlpha * alpha : alpha;
    if (active) {
      ctx.strokeStyle = "rgba(201,170,106,.72)";
      ctx.lineWidth = Math.max(1.2, size * .055);
      ctx.beginPath();
      ctx.arc(x, y, size / 2 + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, 12, 12, 72, 72, x - size / 2, y - size / 2, size, size);
    ctx.restore();
    return true;
  }

  drawCollectionItemIcon(ctx, item, x, y, size) {
    const index = item && COLLECTION_CATALOG.findIndex((entry) => entry.id === item.id);
    const image = this.art && this.art.collectionItems;
    if (index >= 0 && image && image.loaded && ctx.drawImage) {
      const cell = Math.floor((image.width || image.naturalWidth || 864) / 9);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image, (index % 9) * cell, Math.floor(index / 9) * cell, cell, cell, x - size / 2, y - size / 2, size, size);
      ctx.restore();
      return true;
    }
    return !!(item && (this.drawUiIcon(ctx, item.icon, x, y, size, false) || this.drawSmallGlyph(ctx, item.icon, x, y, "#1c3325", .75)));
  }

  animalPortraitIndex(species) {
    const order = ["鹿", "羚羊", "野兔", "乌鸦", "狼", "斑马", "野猪", "鹰", "火烈鸟", "熊", "秃鹫", "狮子", "豹子", "长颈鹿", "猫头鹰", "大象", "河马", "鳄鱼", "野犬", "水貂", "狐狸"];
    return order.indexOf(species || "");
  }

  drawAnimalPortraitAsset(ctx, animal, x, y, size, active = false) {
    // V4 图集使用单环头像框。
    const index = this.animalPortraitIndex(animal && animal.species);
    const image = this.art && this.art.animalPortraits;
    if (index < 0 || !image || !image.loaded || !ctx.drawImage) return false;
    const cell = 128;
    const r = size / 2;
    ctx.save();
    ctx.fillStyle = "rgba(36,55,47,.20)";
    ctx.beginPath();
    ctx.arc(x, y + 2.5, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, r - 1), 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, (index % 7) * cell, Math.floor(index / 7) * cell, cell, cell, x - r, y - r, size, size);
    if (active) {
      const glow = ctx.createRadialGradient(x - r * .2, y - r * .2, 0, x, y, r);
      glow.addColorStop(0, "rgba(251,248,238,.14)");
      glow.addColorStop(1, "rgba(255,248,223,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - r, y - r, size, size);
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = active ? "rgba(152,118,63,.94)" : "rgba(251,248,238,.62)";
    ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, r - 1), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  drawUiIconBadge(ctx, kind, x, y, badgeSize = 62, iconSize = 52, active = false, alpha = 1) {
    const frame = this.uiIconFrame(kind);
    const key = frame && frame.key;
    const image = key && this.art && this.art.uiIcons && this.art.uiIcons[key];
    if (!key || !image || !image.loaded || !ctx.drawImage) return false;
    const displaySize = Math.min(badgeSize, iconSize);
    const ix = x - displaySize / 2;
    const iy = y - displaySize / 2;
    ctx.save();
    ctx.globalAlpha = typeof ctx.globalAlpha === "number" ? ctx.globalAlpha * alpha : alpha;
    ctx.fillStyle = active ? "rgba(242,233,210,.98)" : "rgba(251,248,238,.94)";
    ctx.strokeStyle = active ? "rgba(152,118,63,.62)" : "rgba(57,78,66,.24)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, displaySize / 2 + 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, displaySize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, 12, 12, 72, 72, ix, iy, displaySize, displaySize);
    ctx.restore();
    return true;
  }

  bindEvents() {
    this.runtime.onTouchStart((event) => {
      this.recordActivePlay();
      const touch = event.touches && event.touches[0];
      if (!touch) return;
      const point = this.touchPoint(touch);
      this.gesture = {
        startX: point.x,
        startY: point.y,
        lastX: point.x,
        lastY: point.y,
        moved: false,
        mapPan: this.isInsideMapViewport(point.x, point.y)
      };
    });
    if (this.runtime.onTouchMove) {
      this.runtime.onTouchMove((event) => {
        const touch = event.touches && event.touches[0];
        const point = touch ? this.touchPoint(touch) : null;
        if (!touch || !this.gesture || !point) {
          return;
        }
        const dx = point.x - this.gesture.lastX;
        const dy = point.y - this.gesture.lastY;
        const totalDx = point.x - this.gesture.startX;
        const totalDy = point.y - this.gesture.startY;
        const modalOpen = !!(this.chapterStoryModal || this.settlementModal || this.patrolTaskModal || this.infoDetailModal);
        const moveThreshold = modalOpen ? 18 : 6;
        if (Math.abs(totalDx) + Math.abs(totalDy) > moveThreshold) this.gesture.moved = true;
        this.gesture.lastX = point.x;
        this.gesture.lastY = point.y;
        if (modalOpen) return;
        if (this.gesture.mapPan) {
          this.panMapBy(dx, dy);
        } else if (this.screen === "animalworld") {
          this.animalSelectorScroll = Math.min(0, Math.max(-280, (this.animalSelectorScroll || 0) + dx));
        } else if (this.screen === "collection") {
        } else {
          this.scrollY = Math.max(0, Math.min(this.maxScroll(), this.scrollY - dy));
        }
        this.requestRender();
      });
    }
    if (this.runtime.onTouchEnd) {
      this.runtime.onTouchEnd(() => {
        if (this.gesture && this.gesture.moved && this.screen === "collection" && !this.infoDetailModal && !this.settlementModal && !this.patrolTaskModal && !this.chapterStoryModal) {
          const dx = this.gesture.lastX - this.gesture.startX;
          const dy = this.gesture.lastY - this.gesture.startY;
          if (Math.abs(dx) >= 42 && Math.abs(dx) > Math.abs(dy) * 1.15) {
            this.changeCollectionPage(dx < 0 ? 1 : -1);
            this.gesture = null;
            return;
          }
        }
        const shouldRefresh = !!(this.gesture && this.gesture.moved);
        if (this.gesture && !this.gesture.moved) {
          this.handleTap(this.gesture.startX, this.gesture.startY);
        }
        this.gesture = null;
        if (shouldRefresh) this.requestRender();
      });
    }
    if (this.runtime.onTouchCancel) {
      this.runtime.onTouchCancel(() => {
        this.gesture = null;
      });
    }
    if (this.runtime.onAppHide) {
      this.runtime.onAppHide(() => {
        this.state.world.lifeMemory = markGuardianVisit(this.state.world || {});
        saveState(this.state);
        this.stopLoop();
      });
    }
    if (this.runtime.onAppShow) {
      this.runtime.onAppShow((options) => {
        const invite = this.readShareInviteFromOptions(options);
        if (invite && !hasAssistedShare(this.state, invite.shareId)) this.pendingShareInvite = invite;
        const visit = prepareGuardianReturnLetter(this.state.world || {});
        this.state.world.lifeMemory = visit.state;
        if (visit.letter) this.pendingGuardianLetter = visit.letter;
        saveState(this.state);
        this.startLoop();
        if (this.audio) this.audio.attachState(this.state);
        if (!this.openPendingShareInvite()) this.openGuardianReturnLetter();
      });
    }
    if (this.runtime.onAppHide) {
      this.runtime.onAppHide(() => {
        this.recordActivePlay(Date.now(), true);
        this.activePlayLastAt = 0;
      });
    }
    if (this.runtime.onAppShow) {
      this.runtime.onAppShow(() => {
        this.activePlayLastAt = Date.now();
      });
    }
  }

  recordActivePlay(now = Date.now(), persist = false) {
    const stamp = Number(now) || Date.now();
    if (!this.state || !this.state.character) {
      this.activePlayLastAt = stamp;
      return 0;
    }
    const previous = Number(this.activePlayLastAt || stamp);
    const rawSeconds = Math.max(0, (stamp - previous) / 1000);
    const gained = rawSeconds <= 180 ? rawSeconds : 0;
    const reserve = (this.state.world || {}).reserve || {};
    reserve.progression = Object.assign({}, reserve.progression || {}, {
      activeSeconds: Math.max(0, Number(((reserve.progression || {}).activeSeconds) || 0) + gained)
    });
    this.activePlayLastAt = stamp;
    this.activePlayDirtySeconds = (this.activePlayDirtySeconds || 0) + gained;
    if (persist || this.activePlayDirtySeconds >= 20) {
      saveState(this.state);
      this.activePlayDirtySeconds = 0;
    }
    return gained;
  }

  touchPoint(touch) {
    const x = touch.clientX !== undefined ? touch.clientX : touch.x !== undefined ? touch.x : touch.pageX;
    const y = touch.clientY !== undefined ? touch.clientY : touch.y !== undefined ? touch.y : touch.pageY;
    return { x: x || 0, y: y || 0 };
  }

  isInsideMapViewport(x, y) {
    const viewport = this.mapViewport;
    return !this.chapterStoryModal && !this.settlementModal && !this.patrolTaskModal && !this.infoDetailModal && !!viewport && this.screen === "home" && x >= viewport.x && x <= viewport.x + viewport.w && y >= viewport.y && y <= viewport.y + viewport.h;
  }

  setScreen(screen) {
    const previousScreen = this.screen;
    if (screen === "action" && previousScreen && previousScreen !== "action") {
      this.actionScreenOrigin = previousScreen;
    }
    this.screen = screen;
    this.scrollY = 0;
    this.markScreenChange();
    this.render();
    if (screen === "home") {
      if (!this.deferQueuedMissionPush && this.openQueuedMissionPush()) this.suppressNextHomeMission = false;
      else if (this.suppressNextHomeMission) this.suppressNextHomeMission = false;
      else this.maybeOpenMissionPush("home");
    }
    if (screen === "animalworld") {
      const speciesIds = Object.keys(SPECIES_DB);
      this.selectedAnimalWorldSpecies = speciesIds[0] || null;
      const activeCount = getUnlockedSpecies(((((this.state.world || {}).reserve || {}).progression || {}).level) || 1).length;
      this.animalSelectorScroll = -(activeCount * 84 + 20);
    }
    if (previousScreen === "action" && screen !== "action") this.actionScreenOrigin = null;
  }

  maxScroll() {
    const hasBottomNav = this.screen !== "choose" && !!this.state.character;
    const viewportH = this.height - (hasBottomNav ? this.navHeight() : 0);
    return Math.max(0, (this.contentHeight || 0) - viewportH);
  }

  navHeight() {
    return 62;
  }

  bottomSafeInset() {
    return this.screen === "choose" || !this.state.character ? 12 : this.navHeight() + 22;
  }

  bottom(y) {
    this.contentHeight = Math.max(this.contentHeight || 0, y + this.bottomSafeInset());
  }

  clampScroll() {
    const max = this.maxScroll();
    if (this.scrollY > max) this.scrollY = max;
    if (this.scrollY < 0) this.scrollY = 0;
  }

  defaultRegionId() {
    const regions = (this.state.world && this.state.world.regions) || [];
    const character = this.state.character;
    const current = character && regions.find((region) => region.name === character.location);
    return (current || regions[0] || {}).id;
  }

  toast(title) {
    if (/不足|失败|不能|缺|先选择|暂无|未发现|失效|被拦截/.test(String(title || ""))) this.playSfx("warning");
    if (this.runtime.showToast) this.runtime.showToast({ title, icon: "none" });
  }

  playSfx(name) {
    if (!this.audio) return false;
    this.audio.attachState(this.state);
    return this.audio.playEffect(name);
  }

  playSettlementSfx(modal) {
    if (!modal) return;
    const meaningful = !!(modal.breakthrough || modal.goalDone || modal.commerce || modal.recoveredGoodsGain || modal.mysteryRecovery || (modal.materialExploration && modal.materialExploration.reward));
    if (!meaningful) return;
    setTimeout(() => {
      if (this.settlementModal === modal) this.playSfx("success");
    }, 120);
  }

  audioEnabled() {
    if (!this.audio) return true;
    this.audio.attachState(this.state);
    return this.audio.isEnabled();
  }

  toggleAudio() {
    if (!this.audio) return;
    this.audio.attachState(this.state);
    const enabled = this.audio.toggle();
    saveState(this.state);
    if (this.runtime.showToast) this.runtime.showToast({ title: enabled ? "声音已开启" : "声音已关闭", icon: "none" });
    this.render();
  }

  buttonSfx(label) {
    if (/骰/.test(String(label || ""))) return "dice";
    return /执行|结算|确认|接管|购买|出售|移交|提交|收取|进入|开始|完成|选择|调查|掷骰|修复|侦察|驱赶|干预|巡护|探索|记录|发送|升级|加固/.test(String(label || "")) ? "confirm" : "tap";
  }

  handleTap(x, y) {
    for (let i = this.hitAreas.length - 1; i >= 0; i -= 1) {
      const item = this.hitAreas[i];
      if (x >= item.x && x <= item.x + item.w && y >= item.y && y <= item.y + item.h) {
        if (this.audio) {
          this.audio.attachState(this.state);
          this.audio.unlock();
          if (item.sound !== "none") this.audio.playEffect(item.sound || "tap");
        }
        if (item.onTap) item.onTap();
        return;
      }
    }
  }

  addHit(x, y, w, h, onTap, sound = "tap") {
    this.hitAreas.push({ x, y, w, h, onTap, sound });
  }

  addMapHit(cx, cy, size, onTap) {
    const viewport = this.mapViewport;
    if (!viewport) return;
    const hitSize = Math.max(48, size || 0);
    const rawX = cx - hitSize / 2;
    const rawY = cy - hitSize / 2 - this.scrollY;
    const left = Math.max(viewport.x, Math.min(viewport.x + viewport.w - hitSize, rawX));
    const top = Math.max(viewport.y, Math.min(viewport.y + viewport.h - hitSize, rawY));
    this.addHit(left, top, Math.min(hitSize, viewport.w), Math.min(hitSize, viewport.h), onTap);
  }

  addMapRectHit(x, y, w, h, onTap) {
    const viewport = this.mapViewport;
    if (!viewport) return;
    const rawX = Number(x) || 0;
    const rawY = (Number(y) || 0) - this.scrollY;
    const rawW = Math.max(48, Number(w) || 0);
    const rawH = Math.max(48, Number(h) || 0);
    const left = Math.max(viewport.x, rawX);
    const top = Math.max(viewport.y, rawY);
    const right = Math.min(viewport.x + viewport.w, rawX + rawW);
    const bottom = Math.min(viewport.y + viewport.h, rawY + rawH);
    if (right <= left || bottom <= top) return;
    this.addHit(left, top, right - left, bottom - top, onTap);
  }

  clear() {
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.width, this.height);
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, UI_THEME.forest900);
    gradient.addColorStop(0.34, UI_THEME.forest700);
    gradient.addColorStop(0.66, "#d8d6b9");
    gradient.addColorStop(1, UI_THEME.parchment);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
    const glow = ctx.createRadialGradient(this.width * 0.5, 120, 20, this.width * 0.5, 120, this.width * 0.72);
    glow.addColorStop(0, "rgba(231, 199, 109, 0.26)");
    glow.addColorStop(1, "rgba(238, 210, 126, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, 280);
    this.drawSkyTint(ctx);
    this.drawFireflies(ctx);
    this.drawWeatherOverlay(ctx);
    this.drawGlobalArtTexture(ctx);
    ctx.restore();
  }

  drawGlobalArtTexture(ctx) {
    const t = this.animT();
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = "rgba(255,249,233,.34)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i += 1) {
      const y = 72 + i * 108 + Math.sin(i * 1.9) * 16;
      ctx.beginPath();
      ctx.moveTo(-20, y);
      ctx.bezierCurveTo(this.width * 0.28, y - 18, this.width * 0.64, y + 24, this.width + 20, y - 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.14;
    for (let i = 0; i < 18; i += 1) {
      const x = (i * 71 + 23) % Math.max(1, this.width);
      const y = (i * 113 + 47) % Math.max(1, this.height);
      const a = 0.45 + Math.sin(t * 0.0005 + i) * 0.18;
      ctx.fillStyle = `rgba(231,199,109,${Math.max(0.16, a)})`;
      ctx.beginPath();
      ctx.arc(x, y, i % 3 === 0 ? 1.4 : 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawPageBackdrop(ctx, variant = "field") {
    // Every primary tab now shares one calm system background.  A very light
    // section tint keeps orientation without turning each screen into a
    // different visual language.
    const accents = {
      field: "rgba(47,125,98,.08)",
      population: "rgba(79,143,107,.09)",
      archive: "rgba(89,126,151,.08)",
      supplies: "rgba(199,165,95,.09)",
      patrol: "rgba(80,142,151,.08)"
    };
    const accent = accents[variant] || accents.field;
    const g = ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, "#f7f9f6");
    g.addColorStop(0.52, "#f1f4ef");
    g.addColorStop(1, "#eaeee9");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.save();
    const glow = ctx.createRadialGradient(this.width * .18, 82, 12, this.width * .18, 82, this.width * .86);
    glow.addColorStop(0, accent);
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, Math.min(this.height, 520));

    // A single low-contrast terrain contour is enough to preserve the nature
    // identity while keeping cards and labels legible.
    ctx.strokeStyle = variant === "supplies" ? "rgba(139,107,50,.08)" : "rgba(47,125,98,.075)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-24, this.height * .58);
    ctx.bezierCurveTo(this.width * .24, this.height * .50, this.width * .58, this.height * .67, this.width + 24, this.height * .54);
    ctx.stroke();
    ctx.restore();
  }

  animT() {
    return this.anim ? this.anim.t : 0;
  }

  drawSkyTint(ctx) {
    const tint = this.skyTint();
    if (!tint || !tint.alpha) return;
    ctx.fillStyle = this.rgba(tint.color, tint.alpha);
    ctx.fillRect(0, 0, this.width, this.height);
  }

  skyTint() {
    const hour = (this.state.world && this.state.world.time && this.state.world.time.hour) || 12;
    if (hour >= 5 && hour < 8) return { color: "#e8b27a", alpha: 0.10 };
    if (hour >= 8 && hour < 17) return { color: "#9fd0e8", alpha: 0.05 };
    if (hour >= 17 && hour < 20) return { color: "#d97a4a", alpha: 0.11 };
    return { color: "#1a2a4a", alpha: 0.17 };
  }

  drawFireflies(ctx) {
    const t = this.animT();
    const count = this.gesture ? 6 : 10;
    for (let i = 0; i < count; i += 1) {
      const baseX = (i * 53) % this.width;
      const baseY = 40 + (i * 89) % (this.height - 100);
      const dx = Math.sin(t * 0.0006 + i * 1.7) * 14;
      const dy = Math.cos(t * 0.0005 + i * 2.3) * 10;
      const a = 0.16 + 0.18 * (0.5 + 0.5 * Math.sin(t * 0.002 + i));
      ctx.fillStyle = `rgba(238, 210, 126, ${a})`;
      ctx.beginPath();
      ctx.arc(baseX + dx, baseY + dy, 1.4 + (i % 3) * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawWeatherOverlay(ctx) {
    const weather = (this.state.world && this.state.world.weather) || "";
    const t = this.animT();
    if (weather === "小雨" || weather === "雨") {
      ctx.strokeStyle = "rgba(180, 200, 220, 0.22)";
      ctx.lineWidth = 1;
      const count = this.gesture ? 18 : 28;
      for (let i = 0; i < count; i += 1) {
        const x = ((i * 47 + t * 0.15) % (this.width + 40)) - 20;
        const y = ((i * 73 + t * 0.5) % (this.height + 40)) - 20;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y + 14);
        ctx.stroke();
      }
    } else if (weather === "雾") {
      const pulse = 0.10 + 0.04 * Math.sin(t * 0.0008);
      const g = ctx.createRadialGradient(this.width * 0.5, this.height * 0.4, 40, this.width * 0.5, this.height * 0.4, this.width * 0.85);
      g.addColorStop(0, `rgba(220, 224, 218, ${pulse})`);
      g.addColorStop(1, "rgba(220, 224, 218, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    } else if (weather === "晴") {
      const g = ctx.createRadialGradient(this.width * 0.82, 50, 10, this.width * 0.82, 50, this.width * 0.6);
      g.addColorStop(0, "rgba(255, 230, 160, 0.14)");
      g.addColorStop(1, "rgba(255, 230, 160, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  rgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  render() {
    if (!this.ctx) return;
    this.renderPending = false;
    this.hitAreas = [];
    this.mapViewport = null;
    this.contentHeight = 0;
    this.clear();
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(0, -this.scrollY);
    ctx.globalAlpha = this.screenFade();
    this.drawCurrentScreen(ctx);
    ctx.globalAlpha = 1;
    ctx.restore();
    this.clampScroll();
    if (this.chapterStoryModal) {
      this.drawChapterStoryModal();
      return;
    }
    this.drawBottomNav();
    this.drawMapHarvestFlight();
    this.drawPatrolTaskModal();
    this.drawInfoDetailModal();
    this.drawSettlementModal();
  }

  chapterStorySeen(level, phase) {
    const seen = (((this.state || {}).ui || {}).chapterStoriesSeen) || {};
    return !!seen[`${level}:${phase}`];
  }

  markChapterStorySeen(level, phase) {
    const ui = Object.assign({}, this.state.ui || {});
    ui.chapterStoriesSeen = Object.assign({}, ui.chapterStoriesSeen || {}, { [`${level}:${phase}`]: true });
    this.state.ui = ui;
    saveState(this.state);
  }

  chapterNarrativeStatus(level, phase = "start") {
    normalizeCollectionState(this.state);
    const anchorLevel = phase === "start" && level > 1 ? level - 1 : level;
    const caseId = `case_${Math.max(1, Math.min(5, anchorLevel))}`;
    const caseDef = collectionCaseById(caseId);
    const caseState = ((((this.state || {}).world || {}).collection || {}).cases || {})[caseId] || { itemIds: [] };
    const facility = facilityByCaseId(caseId);
    const resolved = !!caseState.ending;
    return {
      caseId,
      caseDef,
      caseState,
      facility,
      resolved,
      found: Array.from(new Set(caseState.itemIds || [])).length,
      total: 8
    };
  }

  buildChapterStory(level, phase = "start", metrics = null) {
    const chapter = CHAPTERS.find((item) => item.level === level) || CHAPTERS[0];
    const reserve = (this.state.world || {}).reserve || {};
    const progression = reserve.progression || {};
    const population = metrics && typeof metrics.population === "number"
      ? metrics.population
      : Object.keys(SPECIES_DB).reduce((sum, id) => sum + speciesPopulation(reserve, id), 0);
    const daysManaged = metrics && typeof metrics.daysManaged === "number" ? metrics.daysManaged : (progression.daysManaged || 0);
    const firstRun = level === 1 && phase === "start" && (progression.totalActions || 0) === 0;
    const anchor = this.chapterNarrativeStatus(level, phase);
    const anchorName = (anchor.caseDef && (anchor.caseDef.short || anchor.caseDef.title)) || "本章案件";
    const facilityName = (anchor.facility && anchor.facility.name) || "对应设施";
    let body = phase === "start" ? chapter.story : CHAPTER_ENDINGS[level];
    let anchorLine = "";
    if (!firstRun && !anchor.resolved) {
      body += phase === "start"
        ? ` “${anchorName}”待结案，${facilityName}待修复。`
        : ` “${anchorName}”仍有未解证据。`;
      anchorLine = `支线待续 ${anchor.found}/${anchor.total}`;
    } else if (!firstRun && anchor.resolved) {
      anchorLine = "案件已结 · 设施可建设";
    }
    const chapterRecordLine = phase === "start"
      ? `本章出现：${chapter.newSpeciesLabel}`
      : `阶段记录：${getUnlockedSpecies(level).length} 种动物 · ${population} 只 · 经营 ${daysManaged} 天`;
    return {
      level,
      phase,
      chapter,
      image: ((this.chapterArt[level] || {})[phase]) || null,
      kicker: phase === "start" ? `第${chapter.chapter}章 · ${chapter.subtitle}` : `第${chapter.chapter}章 · 守护总结`,
      title: firstRun ? "水边的第一声警报" : phase === "start" ? chapter.title : `${chapter.title} · 留下的改变`,
      body: firstRun ? "猎犬在水边停下：一边是陌生脚印，一边是正在变浅的水线。先做一个决定，森林会立刻回应你。" : body,
      speciesLine: firstRun ? "首巡：做选择，看结果" : `${chapterRecordLine}${anchorLine ? ` · ${anchorLine}` : ""}`,
      buttonLabel: firstRun ? "查看水边警报" : phase === "start" ? "进入章节" : (level < 5 ? "走向下一章" : "继续守护"),
      firstRun,
      storyAnchor: anchor
    };
  }

  openChapterStory(level, phase = "start", force = false) {
    if (!force && this.chapterStorySeen(level, phase)) return false;
    this.prepareChapterArt();
    this.chapterStoryModal = this.buildChapterStory(level, phase);
    this.render();
    return true;
  }

  maybeOpenChapterStoryOnLogin() {
    if (!this.state || !this.state.character) return false;
    const level = Math.max(1, Math.min(5, Math.round(((((this.state.world || {}).reserve || {}).progression || {}).level) || 1)));
    return this.openChapterStory(level, "start");
  }

  queueChapterStoriesForSettlement(modal = {}) {
    const queue = [];
    const transition = modal.chapterTransition;
    if (transition) {
      if (!this.chapterStorySeen(transition.from, "end")) queue.push(this.buildChapterStory(transition.from, "end", transition.summary));
      if (!this.chapterStorySeen(transition.to, "start")) queue.push(this.buildChapterStory(transition.to, "start"));
    } else if (modal.finalChapterEnding && !this.chapterStorySeen(5, "end")) {
      queue.push(this.buildChapterStory(5, "end"));
    }
    const unique = [];
    const seen = new Set();
    queue.forEach((story) => {
      if (!story) return;
      const key = `${story.level}:${story.phase}`;
      if (seen.has(key) || this.chapterStorySeen(story.level, story.phase)) return;
      seen.add(key);
      unique.push(story);
    });
    const bounded = unique.slice(0, MAX_CHAPTER_STORY_QUEUE);
    if (bounded.length) this.prepareChapterArt();
    this.chapterStoryQueue = bounded.slice(1);
    this.chapterStoryModal = bounded[0] || null;
    return !!this.chapterStoryModal;
  }

  emotionEventKey(event) {
    if (!event) return "";
    const individual = event.individual || {};
    return String(event.id || `${event.type || "memory"}:${individual.id || individual.name || "forest"}:${event.day || 0}`);
  }

  enqueueEmotionEvent(event) {
    if (!this.isMajorEmotionEvent(event)) return false;
    const key = this.emotionEventKey(event);
    const existing = [this.pendingEmotionEvent].concat(this.pendingEmotionEvents || [])
      .some((entry) => this.emotionEventKey(entry) === key);
    if (existing) return false;
    if (!this.pendingEmotionEvent) this.pendingEmotionEvent = event;
    else this.pendingEmotionEvents = (this.pendingEmotionEvents || []).concat(event).slice(0, MAX_PENDING_EMOTION_EVENTS);
    return true;
  }

  compactPendingEmotionEvents() {
    const unique = [];
    const seen = new Set();
    [this.pendingEmotionEvent].concat(this.pendingEmotionEvents || []).forEach((event) => {
      if (!this.isMajorEmotionEvent(event)) return;
      const key = this.emotionEventKey(event);
      if (!key || seen.has(key)) return;
      seen.add(key);
      unique.push(event);
    });
    this.pendingEmotionEvent = unique.shift() || null;
    this.pendingEmotionEvents = unique.slice(0, MAX_PENDING_EMOTION_EVENTS);
    return this.pendingEmotionEvent;
  }

  dismissChapterStory() {
    const modal = this.chapterStoryModal;
    if (!modal) return;
    this.markChapterStorySeen(modal.level, modal.phase);
    this.chapterStoryModal = this.chapterStoryQueue.shift() || null;
    if (!this.chapterStoryModal && this.openPendingShareInvite()) {
      this.render();
      return;
    }
    if (!this.chapterStoryModal && this.openPendingStrategicDilemma()) {
      this.render();
      return;
    }
    if (!this.chapterStoryModal && this.openPendingEmotionEvent()) {
      this.render();
      return;
    }
    if (!this.chapterStoryModal && this.openGuardianReturnLetter()) {
      this.render();
      return;
    }
    if (!this.chapterStoryModal && this.pendingMissionAfterChapter) {
      this.pendingMissionAfterChapter = false;
      if (!this.openFirstOnboardingChoice() && !this.openQueuedMissionPush()) this.maybeOpenMissionPush("chapter");
      this.render();
      return;
    }
    if (!this.chapterStoryModal && this.openQueuedMissionPush()) {
      this.render();
      return;
    }
    this.render();
  }

  drawCoverImage(ctx, image, x, y, w, h) {
    if (!image || !image.loaded || !ctx.drawImage) return false;
    const iw = image.width || image.naturalWidth || 1024;
    const ih = image.height || image.naturalHeight || 1536;
    const scale = Math.max(w / iw, h / ih);
    const sw = w / scale;
    const sh = h / scale;
    const sx = Math.max(0, (iw - sw) / 2);
    const sy = Math.max(0, (ih - sh) * 0.48);
    ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
    return true;
  }

  drawChapterStoryModal() {
    const modal = this.chapterStoryModal;
    if (!modal || !this.ctx) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    this.addHit(0, 0, this.width, this.height, () => {});
    const currentImage = (((this.chapterArt || {})[modal.level] || {})[modal.phase]) || modal.image;
    const painted = this.drawCoverImage(ctx, currentImage, 0, 0, this.width, this.height);
    if (!painted) {
      const fallback = ctx.createLinearGradient(0, 0, 0, this.height);
      fallback.addColorStop(0, "#172c20");
      fallback.addColorStop(1, "#6d713b");
      ctx.fillStyle = fallback;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    const shade = ctx.createLinearGradient(0, 0, 0, this.height);
    shade.addColorStop(0, "rgba(4,12,8,0.62)");
    shade.addColorStop(0.28, "rgba(4,12,8,0.06)");
    shade.addColorStop(0.58, "rgba(4,12,8,0.16)");
    shade.addColorStop(1, modal.phase === "end" ? "rgba(5,14,10,0.96)" : "rgba(5,14,10,0.90)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, this.width, this.height);

    const top = Math.max(28, this.systemTopInset() + 10);
    const kickerW = Math.min(this.width - 40, 250);
    const kickerX = (this.width - kickerW) / 2;
    this.roundRect(ctx, kickerX, top, kickerW, 30, 10, "rgba(12,31,22,0.74)", "rgba(240,211,118,0.44)");
    this.text(ctx, modal.kicker, this.width / 2, top + 20, 12, "#f0d376", "700", "center");

    const panelH = Math.min(260, Math.max(220, this.height * 0.27));
    const panelY = this.height - panelH - 8;
    const panelGradient = ctx.createLinearGradient(14, panelY, 14, this.height);
    panelGradient.addColorStop(0, "rgba(9,27,18,0.82)");
    panelGradient.addColorStop(1, "rgba(5,17,11,0.94)");
    this.roundRect(ctx, 14, panelY + 5, this.width - 28, panelH, 18, "rgba(0,0,0,0.28)");
    this.roundRect(ctx, 14, panelY, this.width - 28, panelH, 18, panelGradient, "rgba(240,211,118,0.34)");
    this.text(ctx, modal.phase === "start" ? "新的篇章" : "这一章结束了", 30, panelY + 25, 10, "#d8c27a", "700");
    this.wrapText(ctx, modal.title, 30, panelY + 54, this.width - 60, 22, 26, "#fff8df", 2);
    const buttonY = this.height - 52;
    const speciesY = buttonY - 13;
    const bodyY = panelY + 82;
    this.drawFittedTextBlock(ctx, modal.body, 30, bodyY, this.width - 60, Math.max(42, speciesY - bodyY - 14), {
      size: 11,
      minSize: 9,
      lineHeight: 16,
      color: "#e2e7dc"
    });
    this.text(ctx, this.truncateTextToWidth(ctx, modal.speciesLine, this.width - 60, 10, "700"), 30, speciesY, 10, "#e8d491", "700");
    if (!painted && this.chapterArtLoad && this.chapterArtLoad.status === "loading") {
      this.text(ctx, `插画加载中 ${this.chapterArtLoad.progress || 0}%`, this.width / 2, top + 48, 10, "#fff8df", "700", "center");
    }
    this.modalButton(ctx, 24, buttonY, this.width - 48, 38, modal.buttonLabel, "#d8c27a", () => this.dismissChapterStory(), "#173b2a", 13);
    ctx.restore();
  }

  requestRender() {
    if (!this.ctx) return;
    if (!this.raf) {
      this.render();
      return;
    }
    if (this.renderPending) return;
    this.renderPending = true;
    this.raf(() => this.render());
  }

  drawCurrentScreen(ctx) {
    if (this.screen === "choose") this.drawChoose(ctx);
    if (this.screen === "home") this.drawHome(ctx);
    if (this.screen === "action") this.drawAction(ctx);
    if (this.screen === "social") this.drawSocial(ctx);
    if (this.screen === "league") this.drawLeague(ctx);
    if (this.screen === "collection") this.drawCollection(ctx);
    if (this.screen === "role") this.drawRole(ctx);
    if (this.screen === "animalworld") this.drawAnimalWorld(ctx);
  }

  isVisible(y, h, margin = 80) {
    const top = this.scrollY - margin;
    const bottom = this.scrollY + this.height + margin;
    return y + h >= top && y <= bottom;
  }

  drawPatrolTaskModal() {
    const option = this.patrolTaskModal;
    if (!option || this.settlementModal || !this.ctx) return;
    const ctx = this.ctx;
    const reserve = this.state.world.reserve || {};
    const purchase = option.id === "buySupplies" ? this.currentSupplyPurchase(reserve, option) : null;
    const resourceStatus = this.actionResourceStatus(option.id, reserve, purchase || null);
    if (this.patrolOperationPlan && this.patrolOperationPlan.actionId === option.id) {
      this.drawPatrolOperationPlanner(option, resourceStatus);
      return;
    }
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = "rgba(12,18,15,.48)";
    ctx.fillRect(0, 0, this.width, this.height);
    this.addHit(0, 0, this.width, this.height, () => {});

    const x = 18;
    const w = this.width - 36;
    const h = Math.min(purchase ? 350 : 380, this.height - 78);
    const y = Math.max(38, Math.round((this.height - h) / 2) - 4);
    this.roundRect(ctx, x, y + 6, w, h, 24, "rgba(15,24,20,.18)");
    const g = ctx.createLinearGradient(x, y, x, y + h);
    const headerStop = Math.min(.42, 98 / h);
    g.addColorStop(0, UI_THEME.tint);
    g.addColorStop(headerStop, UI_THEME.tintPressed);
    g.addColorStop(Math.min(1, headerStop + .002), UI_THEME.surfaceStrong);
    g.addColorStop(1, UI_THEME.surfaceStrong);
    this.roundRect(ctx, x, y, w, h, 24, g, UI_THEME.separator);
    const headerIcon = { cx: x + 43, cy: y + 49, size: 48 };
    const materialOperation = ["buySupplies", "salvage"].includes(option.id);
    const showHeroPill = !materialOperation || !resourceStatus.canRun;
    const heroPill = showHeroPill ? { x: x + w - 100, y: y + 39, w: 82, h: 30 } : null;
    const headerTextX = x + 78;
    const headerTextRight = heroPill ? heroPill.x - 10 : x + w - 20;
    const headerTextW = Math.max(66, headerTextRight - headerTextX);
    this.drawModalHeaderIcon(ctx, { icon: (purchase && purchase.icon) || option.icon || "eye" }, headerIcon.cx, headerIcon.cy, headerIcon.size);
    const modalType = ["buySupplies", "salvage"].includes(option.id) ? "物资操作" : "巡护任务";
    const title = purchase ? `采购${purchase.itemLabel}` : option.label;
    const missingRoute = !resourceStatus.canRun ? this.missingResourceRoute(resourceStatus) : null;
    const kickerSize = this.fitTextSize(ctx, modalType, headerTextW, 12, 10, "700");
    const titleSize = this.fitTextSize(ctx, title, headerTextW, 23, 17, "700");
    this.text(ctx, modalType, headerTextX, y + 33, kickerSize, "rgba(255,255,255,.78)", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, title, headerTextW, titleSize, "700"), headerTextX, y + 65, titleSize, "#ffffff", "700");
    if (heroPill) this.drawPatrolTaskHeroPill(ctx, option.id, reserve, resourceStatus, heroPill.x, heroPill.y, heroPill.w, heroPill.h);
    if (missingRoute && heroPill) {
      this.addHit(x + w - 124, y + 36 - this.scrollY, 104, 44, () => this.openMissingResourceRoute(resourceStatus));
    }
    if (option.recommended || !resourceStatus.canRun) {
      this.roundRect(ctx, x + 90, y + 76, 66, 20, 10, resourceStatus.canRun ? "rgba(255,255,255,.92)" : UI_THEME.danger);
      this.text(ctx, resourceStatus.canRun ? "推荐行动" : "资源不足", x + 123, y + 90, 10, resourceStatus.canRun ? UI_THEME.tintPressed : "#ffffff", "700", "center");
    }

    this.roundRect(ctx, x + 18, y + 106, w - 36, 32, 10, "rgba(251,248,238,.96)", "rgba(57,78,66,.18)");
    this.statusPill(ctx, x + 28, y + 110, "用途", "#e7efd5", "#31533b", 40);
    const purposeText = purchase
      ? `${purchase.itemLabel}用于${purchase.use}`
      : (option.effect || this.patrolEffectText(option.id));
    this.text(ctx, this.truncateTextToWidth(ctx, purposeText, w - 104, 10, "400"), x + 76, y + 127, 10, "#536156", "400");

    const changeCards = this.patrolTaskChangeCards(option.id, reserve, resourceStatus);
    const primaryChange = this.primaryPatrolTaskChange(option.id, changeCards, resourceStatus);
    const focusLayout = this.patrolTaskFocusLayout(option.id, changeCards, resourceStatus);
    const metricLayouts = [];
    if (purchase) {
      metricLayouts.push(...this.drawPurchaseTaskResultStrip(ctx, purchase, reserve, x + 18, y + 148, w - 36, 82));
    } else if (focusLayout) {
      const focusCards = focusLayout.focusCards;
      const focusGap = 8;
      const focusW = (w - 52 - focusGap * 2) / 3;
      focusCards.forEach((item, index) => {
        const cx = x + 18 + index * (focusW + focusGap);
        metricLayouts.push(this.drawPatrolTaskFocusCard(ctx, item, cx, y + 148, focusW, 88));
      });
      this.drawPatrolTaskSecondaryChange(ctx, focusLayout.summary, x + 18, y + 244, w - 36, 30);
    } else {
      metricLayouts.push(this.drawPatrolTaskPrimaryChange(ctx, primaryChange, x + 18, y + 148, w - 36, 70));
      const chipGap = 8;
      const chipW = (w - 52 - chipGap * 2) / 3;
      changeCards.filter((item) => item !== primaryChange).slice(0, 3).forEach((item, index) => {
        const cx = x + 18 + index * (chipW + chipGap);
        metricLayouts.push(this.drawPatrolTaskChangeCard(ctx, item, cx, y + 226, chipW, 44));
      });
    }

    const interactivePatrol = !!operationConfig(option.id);
    const nextY = purchase ? y + 240 : y + 282;
    this.roundRect(ctx, x + 18, nextY, w - 36, 32, 10, "rgba(8,24,16,.78)", "rgba(240,211,118,.18)");
    this.text(ctx, "下一步", x + 30, nextY + 21, 10, "#f0d376", "700");
    const nextText = !resourceStatus.canRun
      ? (missingRoute ? missingRoute.nextText : `先补齐 ${(resourceStatus.missing || []).slice(0, 2).join("、") || "所需资源"}`)
      : interactivePatrol
        ? "选择两个路线节点：先主目标，再兼顾"
        : purchase
          ? "确认后立即入库"
          : "确认后立即结算";
    this.text(ctx, this.truncateTextToWidth(ctx, nextText, w - 104, 10, "700"), x + 78, nextY + 21, 10, resourceStatus.canRun ? "#fff8df" : "#ffb070", "700");
    this.renderedPatrolTask = {
      id: option.id,
      x, y, w, h,
      header: {
        icon: headerIcon,
        textX: headerTextX,
        textW: headerTextW,
        textRight: headerTextRight,
        titleSize,
        kickerSize,
        pill: heroPill,
        split: "horizontal",
        background: "horizontalBands"
      },
      purposeH: 32,
      metricLayouts,
      nextY,
      nextText,
      routeLabel: missingRoute ? missingRoute.label : "",
      interactive: interactivePatrol,
      blocked: !resourceStatus.canRun
    };

    const buttonY = y + h - 54;
    this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 40, "取消", "#e8ddbd", () => {
      this.patrolTaskModal = null;
      this.patrolOperationPlan = null;
      this.render();
    }, "#26352b");
    this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 40, resourceStatus.canRun ? (interactivePatrol ? "规划路线" : "执行结算") : (missingRoute ? missingRoute.label : this.actionBlockedToast(resourceStatus)), resourceStatus.canRun || missingRoute ? "#1c3325" : "#9aa093", () => {  // v3.0: 深林绿
      if (!resourceStatus.canRun) {
        if (missingRoute) {
          this.openMissingResourceRoute(resourceStatus);
          return;
        }
        this.toast(this.actionBlockedToast(resourceStatus));
        return;
      }
      if (interactivePatrol) {
        this.startPatrolOperation(option);
        return;
      }
      this.patrolTaskModal = null;
      this.submitCommand();
    });
    ctx.restore();
  }

  startPatrolOperation(option) {
    const selected = option || this.patrolTaskModal || this.selectedReserveActionOption();
    const config = operationConfig(selected && selected.id);
    if (!config) {
      this.submitCommand();
      return false;
    }
    const status = this.actionResourceStatus(selected.id, (this.state.world || {}).reserve || {});
    if (!status.canRun) {
      this.toast(this.actionBlockedToast(status));
      return false;
    }
    this.patrolOperationPlan = { actionId: selected.id, nodeIds: [] };
    this.render();
    return true;
  }

  togglePatrolOperationNode(nodeId) {
    const plan = this.patrolOperationPlan;
    const config = plan && operationConfig(plan.actionId);
    if (!plan || !config || !config.nodes.some((node) => node.id === nodeId)) return false;
    const selected = (plan.nodeIds || []).slice();
    const existing = selected.indexOf(nodeId);
    if (existing >= 0) selected.splice(existing, 1);
    else if (selected.length < 2) selected.push(nodeId);
    else selected[1] = nodeId;
    this.patrolOperationPlan = { actionId: plan.actionId, nodeIds: selected };
    this.render();
    return true;
  }

  confirmPatrolOperation() {
    const plan = this.patrolOperationPlan;
    const normalized = plan && normalizeOperationPlan(plan.actionId, plan.nodeIds);
    if (!normalized) {
      this.toast("请按顺序选择两个路线节点");
      return false;
    }
    const status = this.actionResourceStatus(plan.actionId, (this.state.world || {}).reserve || {});
    if (!status.canRun) {
      this.toast(this.actionBlockedToast(status));
      return false;
    }
    this.patrolOperationPlan = normalized;
    this.submitCommand();
    return true;
  }

  drawPatrolOperationPlanner(option, resourceStatus) {
    const ctx = this.ctx;
    const plan = this.patrolOperationPlan || { actionId: option.id, nodeIds: [] };
    const config = operationConfig(option.id);
    if (!ctx || !config) return;
    const selected = plan.nodeIds || [];
    const x = 18;
    const w = this.width - 36;
    const h = Math.min(430, this.height - 76);
    const y = Math.max(30, Math.round((this.height - h) / 2) - 2);
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = "rgba(5,12,8,0.78)";
    ctx.fillRect(0, 0, this.width, this.height);
    this.addHit(0, 0, this.width, this.height, () => {});
    this.roundRect(ctx, x, y + 6, w, h, 12, "rgba(0,0,0,0.28)");
    const background = ctx.createLinearGradient(x, y, x + w, y + h);
    background.addColorStop(0, "#153524");
    background.addColorStop(0.7, "#234a31");
    background.addColorStop(1, "#c9b66f");
    this.roundRect(ctx, x, y, w, h, 12, background, "rgba(240,211,118,0.52)");
    this.text(ctx, "亲手规划 · 约10秒", x + 18, y + 28, 11, "#e8d491", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, config.title, w - 118, 22, "700"), x + 18, y + 57, 22, "#fff8df", "700");
    this.roundRect(ctx, x + w - 92, y + 18, 72, 34, 10, "rgba(240,211,118,0.18)", "rgba(240,211,118,0.42)");
    this.text(ctx, `${selected.length}/2 节点`, x + w - 56, y + 40, 11, "#f0d376", "700", "center");
    this.wrapText(ctx, config.instruction, x + 18, y + 78, w - 36, 11, 14, "#d9dfce", 2);

    const boardX = x + 14;
    const boardY = y + 105;
    const boardW = w - 28;
    const boardH = 178;
    this.roundRect(ctx, boardX, boardY, boardW, boardH, 10, "rgba(8,24,16,0.72)", "rgba(240,211,118,0.20)");
    const nodeW = Math.min(88, Math.floor((boardW - 18) / 3));
    const nodeH = 74;
    const positions = [
      { x: boardX + 8, y: boardY + 14 },
      { x: boardX + boardW - nodeW - 8, y: boardY + 14 },
      { x: boardX + Math.round((boardW - nodeW) / 2), y: boardY + 96 }
    ];
    const centers = positions.map((position) => ({ x: position.x + nodeW / 2, y: position.y + nodeH / 2 }));
    ctx.save();
    ctx.strokeStyle = "rgba(232,212,145,0.26)";
    ctx.lineWidth = 2;
    if (ctx.setLineDash) ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(centers[0].x, centers[0].y);
    ctx.lineTo(centers[2].x, centers[2].y);
    ctx.lineTo(centers[1].x, centers[1].y);
    ctx.stroke();
    if (selected.length === 2) {
      const firstIndex = config.nodes.findIndex((node) => node.id === selected[0]);
      const secondIndex = config.nodes.findIndex((node) => node.id === selected[1]);
      if (firstIndex >= 0 && secondIndex >= 0) {
        if (ctx.setLineDash) ctx.setLineDash([]);
        ctx.strokeStyle = "#f0d376";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(centers[firstIndex].x, centers[firstIndex].y);
        ctx.lineTo(centers[secondIndex].x, centers[secondIndex].y);
        ctx.stroke();
      }
    }
    ctx.restore();
    this.renderedOperationNodes = [];
    config.nodes.forEach((node, index) => {
      const position = positions[index];
      const order = selected.indexOf(node.id);
      const active = order >= 0;
      this.drawPatrolOperationSceneNode(ctx, node, position.x, position.y, nodeW, nodeH, active, order);
      this.renderedOperationNodes.push({ id: node.id, icon: node.icon || "trail", x: position.x, y: position.y, w: nodeW, h: nodeH, iconSize: 30, graphical: true, active, order });
      this.addHit(position.x - 4, position.y - 4, nodeW + 8, nodeH + 8, () => this.togglePatrolOperationNode(node.id));
    });

    const selectedNodes = selected.map((id) => config.nodes.find((node) => node.id === id)).filter(Boolean);
    const routeY = y + 294;
    this.roundRect(ctx, x + 18, routeY, w - 36, 54, 9, "rgba(255,248,223,0.92)", "rgba(36,64,46,0.16)");
    this.text(ctx, selectedNodes[0] ? `① ${selectedNodes[0].label} · 100%` : "① 先选主目标 · 100%", x + 32, routeY + 20, 10, selectedNodes[0] ? "#c45b42" : "#6c746b", "700");
    this.text(ctx, selectedNodes[1] ? `② ${selectedNodes[1].label} · 60%` : "② 再选兼顾点 · 60%", x + 32, routeY + 40, 10, selectedNodes[1] ? "#2f7c8f" : "#6c746b", "700");
    this.text(ctx, selected.length === 2 ? "路线已闭合" : "点击地图节点", x + w - 32, routeY + 31, 10, selected.length === 2 ? "#1f7a52" : "#8b6f2a", "700", "right");

    const buttonY = y + h - 56;
    this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 40, "返回调整", "#e8ddbd", () => {
      this.patrolOperationPlan = null;
      this.render();
    }, "#26352b");
    this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 40, selected.length === 2 ? "按路线出发" : `还需选择 ${2 - selected.length}`, selected.length === 2 && resourceStatus.canRun ? "#1c3325" : "#778078", () => {
      if (selected.length !== 2) {
        this.toast("请按顺序选择两个路线节点");
        return;
      }
      this.confirmPatrolOperation();
    });
    ctx.restore();
  }

  drawPatrolOperationSceneNode(ctx, node, x, y, w, h, active, order) {
    const bg = active ? "#f5e5a8" : "#173b2f";
    const ink = active ? UI_THEME.forest900 : UI_THEME.ivory;
    const secondary = active ? UI_THEME.goldDeep : "#d7ddcf";
    this.roundRect(ctx, x, y + 4, w, h, 12, "rgba(0,0,0,0.24)");
    this.roundRect(ctx, x, y, w, h, 12, bg, active ? "#fff1b8" : "rgba(240,211,118,0.30)");
    ctx.save();
    ctx.globalAlpha = active ? .78 : .34;
    ctx.fillStyle = active ? "rgba(103,142,91,.30)" : "rgba(143,172,144,.22)";
    ctx.beginPath();
    ctx.moveTo(x + 5, y + 37);
    ctx.quadraticCurveTo(x + w * .30, y + 24, x + w * .54, y + 35);
    ctx.quadraticCurveTo(x + w * .78, y + 21, x + w - 5, y + 35);
    ctx.lineTo(x + w - 5, y + 42);
    ctx.lineTo(x + 5, y + 42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    const iconX = x + w / 2;
    const iconY = y + 21;
    this.drawUiIconBadge(ctx, node.icon || "trail", iconX, iconY, 32, 28, active)
      || this.drawSmallGlyph(ctx, node.icon || "trail", iconX, iconY, active ? UI_THEME.forest800 : UI_THEME.gold, .86);
    if (active) {
      this.roundRect(ctx, x + 5, y + 5, 20, 20, 7, order === 0 ? UI_THEME.danger : "#5f8390");
      this.text(ctx, `${order + 1}`, x + 15, y + 19, 10, UI_THEME.ivory, "700", "center");
    }
    this.text(ctx, this.truncateTextToWidth(ctx, node.label, w - 12, 12, "700"), x + w / 2, y + 50, 12, ink, "700", "center");
    this.text(ctx, this.truncateTextToWidth(ctx, node.short, w - 8, 9, "700"), x + w / 2, y + 67, 9, secondary, "700", "center");
  }

  patrolTaskChangeCards(id, reserve, status) {
    const supplies = (reserve && reserve.supplies) || {};
    const inventory = (reserve && reserve.inventory) || {};
    const team = this.houndTeamSummary(reserve || {});
    const blocked = status && !status.canRun;
    const missing = blocked ? (status.missing || []).join("、") : "";
    const purchase = (status && status.purchase) || this.currentSupplyPurchase(reserve);
    const socialRecovery = id === "houndScout" && /抢回回收物|共享回收点/.test(this.command || "");
    const poacher = reserve.poacherPressure || 0;
    const dogFood = supplies.dogFood || 0;
    const scoutMinDrop = dogFood > 0 ? 5 : 3;
    const scoutMaxDrop = dogFood > 0 ? 10 : 8;
    const poacherLow = Math.max(0, poacher - scoutMaxDrop);
    const poacherHigh = Math.max(0, poacher - scoutMinDrop);
    const houndXpGain = Math.max(2, Math.round(16 * (dogFood > 0 ? 1 : 0.45)));
    let houndLevelAfter = team.level;
    let houndXpAfter = (team.xp || 0) + houndXpGain;
    if (houndXpAfter >= (team.nextXp || 40)) {
      houndXpAfter -= (team.nextXp || 40);
      houndLevelAfter += 1;
    }
    const pendingRecovered = reserve.pendingRecovered || {};
    const pendingTotal = Object.keys(pendingRecovered).reduce((sum, key) => sum + (pendingRecovered[key] || 0), 0);
    const alarm = supplies.alarm || 0;
    const seasonState = reserve.seasonState || {};
    const antiPoacherBonus = (alarm > 0 ? 3 : 0)
      + (seasonState.name === "旱季" ? 3 : 0);
    const antiPoacherLow = Math.max(0, poacher - (10 + antiPoacherBonus));
    const antiPoacherHigh = Math.max(0, poacher - (4 + antiPoacherBonus));
    const grass = ((reserve.ecology || {}).grass) || 0;
    const interventionMinGain = supplies.tranquilizer > 0 ? 5 : 2;
    const interventionMaxGain = supplies.tranquilizer > 0 ? 10 : 4;
    const interventionGrassLow = Math.min(100, grass + interventionMinGain);
    const interventionGrassHigh = Math.min(100, grass + interventionMaxGain);
    const map = {
      houndScout: [
        { label: "消耗", value: blocked ? `缺${missing}` : `${dogFood}→${Math.max(0, dogFood - 1)}`, note: blocked ? "资源不足" : "狗粮 -1", tone: blocked ? "bad" : "cost" },
        { label: "发现", value: socialRecovery ? `${pendingTotal}→${pendingTotal + 2}` : "可能有回收物", note: socialRecovery ? "待收物 +2" : "搜查成功后带回", tone: "good" },
        { label: socialRecovery ? "待收" : "偷猎", value: socialRecovery ? `+2` : `${poacher}→${poacherLow}~${poacherHigh}`, note: socialRecovery ? "进入待收取区" : `预计减少 ${scoutMinDrop}~${scoutMaxDrop}`, tone: "good" },
        { label: "猎犬XP", value: houndLevelAfter > team.level ? `Lv.${team.level}→${houndLevelAfter}` : `${team.xp || 0}→${houndXpAfter}`, note: `经验 +${houndXpGain}`, tone: "gold" }
      ],
      antiPoacher: [
        { label: "消耗", value: blocked ? `缺${missing}` : `${alarm}→${Math.max(0, alarm - 1)}`, note: blocked ? "资源不足" : "警报器 -1", tone: blocked ? "bad" : "cost" },
        { label: "草场", value: "+0~1", note: "驱散干扰后恢复", tone: "good" },
        { label: "动物", value: "重新出现", note: "脚印逐渐消退", tone: "gold" },
        { label: "偷猎", value: `${poacher}→${antiPoacherLow}~${antiPoacherHigh}`, note: `预计减少 ${Math.max(0, poacher - antiPoacherHigh)}~${Math.max(0, poacher - antiPoacherLow)}`, tone: "good" },
      ],
      habitat: [
        { label: "消耗", value: blocked ? `缺${missing}` : `工具包 -1`, tone: blocked ? "bad" : "cost" },
        { label: "水源", value: "+2 / +5", tone: "good" },
        { label: "草场", value: "+2 / +6", tone: "good" },
        { label: "迁移", value: "更稳", tone: "gold" }
      ],
      salvage: [
        { label: "移交", value: this.recoveredGoodsCount(inventory) ? `库存 -${Math.min(3, this.recoveredGoodsCount(inventory))}` : "无库存", tone: this.recoveredGoodsCount(inventory) ? "cost" : "warn" },
        { label: "拨款", value: this.recoveredGoodsCount(inventory) ? "项目拨款+" : "无拨款", tone: this.recoveredGoodsCount(inventory) ? "good" : "warn" },
        { label: "研究需求", value: `指数 ${this.salvageEconomyPreview(reserve, 0).marketIndex}`, tone: "gold" },
        { label: "样本", value: "巡护发现", tone: "good" }
      ],
      intervention: [
        { label: "消耗", value: blocked ? `缺${missing}` : `${supplies.tranquilizer || 0}→${Math.max(0, (supplies.tranquilizer || 0) - 1)}`, note: blocked ? "资源不足" : "麻醉弹 -1", tone: blocked ? "bad" : "cost" },
        { label: "疾病", value: "-1~-5", note: "降低暴发风险", tone: "good" },
        { label: "草场", value: `${grass}→${Math.min(100, grass + 2)}~${Math.min(100, grass + 6)}`, note: "未成功/成功", tone: "good" },
      ],
      buySupplies: [
        { label: "消耗", value: blocked ? `缺${missing}` : `基金 -${purchase.cost}`, tone: blocked ? "bad" : "cost" },
        { label: "采购", value: purchase.batch ? `${purchase.items.length}项补齐` : `${purchase.itemLabel} +${purchase.amount}`, tone: "good" },
        { label: "库存", value: purchase.batch ? "全部达安全线" : `${(supplies[purchase.id] || 0) + purchase.amount}`, tone: "good" },
        { label: "用途", value: purchase.use, tone: "gold" }
      ]
    };
    return map[id] || [
      { label: "消耗", value: this.patrolCostLine(id, reserve), tone: blocked ? "bad" : "cost" },
      { label: "奖励", value: this.patrolRewardPreview(id, reserve), tone: "good" },
      { label: "安全", value: "变化", tone: "gold" },
      { label: "动物", value: "回应", tone: "good" }
    ];
  }

  drawPatrolTaskHeroPill(ctx, id, reserve, status, x, y, w, h) {
    const blocked = status && !status.canRun;
    const text = blocked ? `缺${(status.missing || [])[0] || "资源"}` : this.patrolTaskHeroText(id, reserve);
    const fill = blocked ? "#c45b42" : "rgba(240,211,118,0.92)";
    const color = blocked ? "#fff8df" : "#173b2a";
    this.roundRect(ctx, x, y + 3, w, h, 10, "rgba(0,0,0,0.18)");
    this.roundRect(ctx, x, y, w, h, 10, fill, "rgba(255,248,223,0.28)");
    this.text(ctx, this.truncateTextToWidth(ctx, text, w - 16, 12, "700"), x + w / 2, y + 20, 12, color, "700", "center");
  }

  patrolTaskHeroText(id, reserve) {
    if (id === "antiPoacher") return "安全上升";
    if (id === "houndScout") return /抢回回收物|共享回收点/.test(this.command || "") ? "物质 +2" : "偷猎 -5~-10";
    if (id === "habitat") return "水草恢复";
    if (id === "intervention") return "生态稳住";
    if (id === "salvage") return "专项拨款";
    if (id === "buySupplies") return "补给入库";
    return this.patrolRiskLine(id, reserve);
  }

  primaryPatrolTaskChange(id, cards, status) {
    if (status && !status.canRun) return cards[0] || {};
    const priority = {
      antiPoacher: ["偷猎", "安全"],
      houndScout: /抢回回收物|共享回收点/.test(this.command || "") ? ["物质", "去向"] : ["偷猎", "发现"],
      habitat: ["水源", "草场"],
      intervention: ["草场", "授权"],
      salvage: ["拨款", "研究需求"],
      buySupplies: ["采购", "库存"]
    }[id] || [];
    return priority.map((label) => cards.find((item) => item.label === label)).find(Boolean) || cards[0] || {};
  }

  patrolTaskFocusLayout(id, cards, status) {
    const list = cards || [];
    if (id === "houndScout" && (!status || status.canRun)) {
      const socialRecovery = /抢回回收物|共享回收点/.test(this.command || "");
      const labels = socialRecovery ? ["物质", "待收", "猎犬XP"] : ["偷猎", "发现", "猎犬XP"];
      return {
        focusCards: labels.map((label) => list.find((item) => item.label === label)).filter(Boolean),
        summary: list.find((item) => item.label === "消耗") || list[0] || {}
      };
    }
    if (id === "habitat" && (!status || status.canRun)) {
      return {
        focusCards: ["水源", "草场", "迁移"].map((label) => list.find((item) => item.label === label)).filter(Boolean),
        summary: list.find((item) => item.label === "消耗") || list[0] || {}
      };
    }
    if (["salvage", "buySupplies"].includes(id)) {
      const primary = this.primaryPatrolTaskChange(id, list, status);
      return {
        focusCards: list.filter((item) => item !== primary).slice(0, 3),
        summary: primary
      };
    }
    return null;
  }

  drawPatrolTaskPrimaryChange(ctx, item, x, y, w, h) {
    const tone = item.tone || "good";
    const accent = {
      good: "#5cb87a",
      cost: "#f0d376",
      warn: "#ffcf8a",
      bad: "#ffb070",
      gold: "#f0d376"
    }[tone] || "#f0d376";
    this.roundRect(ctx, x, y + 4, w, h, 12, "rgba(0,0,0,0.20)");
    this.roundRect(ctx, x, y, w, h, 12, "rgba(8, 24, 16, 0.92)", "rgba(240,211,118,0.22)");
    this.roundRect(ctx, x + 14, y + 16, 6, h - 32, 3, accent);
    this.text(ctx, "最关键变化", x + 30, y + 24, 11, "#e8d491", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, item.label || "变化", w - 154, 18, "700"), x + 30, y + 52, 18, "#fff8df", "700");
    this.roundRect(ctx, x + w - 118, y + 18, 94, 40, 12, "rgba(255,248,223,0.12)", "rgba(255,248,223,0.16)");
    const valueSize = this.fitTextSize(ctx, item.value || "结算", 76, 22, 14, "700");
    this.text(ctx, this.truncateTextToWidth(ctx, item.value || "结算", 76, valueSize, "700"), x + w - 71, y + 46, valueSize, accent, "700", "center");
    return { label: item.label || "变化", value: item.value || "结算", role: "primary", valueSize };
  }

  drawPatrolTaskChangeCard(ctx, item, x, y, w, h) {
    const tone = item.tone || "good";
    const colors = {
      good: ["rgba(120,185,142,0.20)", "#5cb87a"],
      cost: ["rgba(216,161,58,0.20)", "#f0d376"],
      warn: ["rgba(255,176,112,0.18)", "#ffcf8a"],
      bad: ["rgba(196,91,66,0.24)", "#ffb070"],
      gold: ["rgba(240,211,118,0.20)", "#f0d376"]
    }[tone] || ["rgba(255,248,223,0.12)", "#d9dfce"];
    this.roundRect(ctx, x, y + 3, w, h, 8, "rgba(0,0,0,0.16)");
    this.roundRect(ctx, x, y, w, h, 8, "rgba(12, 28, 19, 0.86)", "rgba(255, 248, 223, 0.16)");
    this.text(ctx, item.label, x + 10, y + 16, 10, "#d9dfce", "700");
    this.roundRect(ctx, x + 8, y + 20, w - 16, 20, 7, colors[0], "rgba(255,248,223,0.10)");
    const valueSize = this.fitTextSize(ctx, item.value || "—", w - 26, 12, 10, "700");
    this.text(ctx, this.truncateTextToWidth(ctx, item.value || "—", w - 26, valueSize, "700"), x + w / 2, y + 34, valueSize, colors[1], "700", "center");
    return { label: item.label || "变化", value: item.value || "—", role: "secondary", valueSize };
  }

  drawPatrolTaskFocusCard(ctx, item, x, y, w, h) {
    const tone = item.tone || "good";
    const palette = {
      good: ["#153c2b", "#69d18b"],
      cost: ["#3a321c", "#f0d376"],
      warn: ["#44341d", "#ffcf8a"],
      bad: ["#45251f", "#ffb070"],
      gold: ["#3b351e", "#f0d376"]
    }[tone] || ["#153022", "#fff8df"];
    const notes = {
      "移交": "本次样本去向",
      "研究需求": "决定项目拨款",
      "样本": "巡护发现后入库",
      "水源": "直接恢复水线",
      "草场": "改善承载能力",
      "迁移": "动物路线回应",
      "消耗": "本次实际支出",
      "库存": "执行后的数量",
      "用途": "能解锁的行动"
    };
    this.roundRect(ctx, x, y + 5, w, h, 10, "rgba(0,0,0,0.22)");
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, palette[0]);
    g.addColorStop(1, "#0c2118");
    this.roundRect(ctx, x, y, w, h, 10, g, this.rgba(palette[1], 0.52));
    this.roundRect(ctx, x + 8, y + 8, w - 16, 4, 2, palette[1]);
    this.text(ctx, item.label, x + 10, y + 29, 11, "#d9dfce", "700");
    const valueSize = this.fitTextSize(ctx, item.value || "—", w - 18, 20, 13, "700");
    this.text(ctx, this.truncateTextToWidth(ctx, item.value || "—", w - 18, valueSize, "700"), x + w / 2, y + 57, valueSize, palette[1], "700", "center");
    this.text(ctx, this.truncateTextToWidth(ctx, item.note || notes[item.label] || "影响本次结算", w - 18, 10, "400"), x + w / 2, y + 78, 10, "#d5ded2", "400", "center");
    return { label: item.label || "变化", value: item.value || "—", role: "focus", valueSize };
  }

  drawPurchaseTaskResultStrip(ctx, purchase, reserve, x, y, w, h) {
    const supplies = (reserve && reserve.supplies) || {};
    const fundBefore = Number((reserve && reserve.fund) || 0);
    const fundAfter = Math.max(0, fundBefore - Number(purchase.cost || 0));
    const stockBefore = purchase.batch ? purchase.items.length : Number(supplies[purchase.id] || 0);
    const stockAfter = purchase.batch ? 0 : stockBefore + Number(purchase.amount || 0);
    const mainW = Math.round(w * .31);
    const fundW = Math.round(w * .43);
    const stockW = w - mainW - fundW;
    const panel = ctx.createLinearGradient(x, y, x + w, y + h);
    panel.addColorStop(0, "#153c2b");
    panel.addColorStop(1, "#0d291f");
    this.roundRect(ctx, x, y + 5, w, h, 15, "rgba(0,0,0,.24)");
    this.roundRect(ctx, x, y, w, h, 15, panel, "rgba(105,209,139,.44)");

    const cells = [
      { x, w: mainW, label: purchase.batch ? "补齐缺口" : "补给入库", value: purchase.batch ? `${purchase.items.length}项` : `+${purchase.amount}`, note: purchase.batch ? `共 ${purchase.amount} 件` : `${stockBefore}→${stockAfter}`, color: "#69d18b", size: 20 },
      { x: x + mainW, w: fundW, label: "基金", value: `${fundBefore}→${fundAfter}`, note: `支出 -${purchase.cost}`, color: "#ffd65a", size: 15 },
      { x: x + mainW + fundW, w: stockW, label: "库存", value: purchase.batch ? "安全线" : `${stockBefore}→${stockAfter}`, note: purchase.batch ? "一次补齐" : `+${purchase.amount}`, color: "#69d18b", size: 16 }
    ];
    const layouts = [];
    cells.forEach((cell, index) => {
      if (index > 0) {
        ctx.fillStyle = "rgba(255,255,255,.16)";
        ctx.fillRect(cell.x, y + 14, 1, h - 28);
      }
      this.text(ctx, cell.label, cell.x + cell.w / 2, y + 22, 10, "#d9dfce", "700", "center");
      const valueSize = this.fitTextSize(ctx, cell.value, cell.w - 14, cell.size, 11, "700");
      this.text(ctx, this.truncateTextToWidth(ctx, cell.value, cell.w - 14, valueSize, "700"), cell.x + cell.w / 2, y + 51, valueSize, cell.color, "700", "center");
      this.text(ctx, this.truncateTextToWidth(ctx, cell.note, cell.w - 14, 9, "400"), cell.x + cell.w / 2, y + 72, 9, "#c7d7cd", "400", "center");
      layouts.push({ label: cell.label, value: cell.value, role: index === 0 ? "primary" : "focus", valueSize });
    });
    return layouts;
  }

  drawPatrolTaskSecondaryChange(ctx, item, x, y, w, h) {
    const tone = item.tone || "good";
    const color = tone === "good" ? "#69d18b" : tone === "bad" ? "#ffb070" : "#f0d376";
    this.roundRect(ctx, x, y, w, h, 8, "rgba(8,24,16,0.76)", "rgba(240,211,118,0.18)");
    this.text(ctx, item.label === "消耗" ? "代价" : "摘要", x + 12, y + 21, 10, "#d9dfce", "700");
    this.text(ctx, `${item.label || "变化"} · ${item.value || "结算时确认"}`, x + w - 12, y + 22, 11, color, "700", "right");
  }

  patrolRiskLine(id, reserve) {
    const ecology = (reserve && reserve.ecology) || {};
    if (id === "intervention") return "声誉可能下降";
    if (id === "salvage") return "安全略降";
    if (id === "buySupplies") return "基金支出";
    if (id === "habitat" && (ecology.water || 0) < 45) return "水源优先";
    if (id === "antiPoacher" && (reserve.poacherPressure || 0) > 55) return "高优先级";
    return "风险可控";
  }

  patrolRewardPreview(id, reserve) {
    const team = this.houndTeamSummary(reserve || {});
    const action = reserveActionById(id);
    if (id === "houndScout") return `发现回收物机会 · 猎犬经验+ · Lv.${team.level}`;
    if (action && action.rewardPreview) return action.rewardPreview;
    return "即时结算 · 奖励会波动";
  }

  infoDetailHeaderLayout(ctx, modal, x, y, w) {
    const close = { x: x + w - 54, y: y + 23, w: 36, h: 36 };
    const icon = { cx: x + 44, cy: y + 48, size: 50 };
    const textX = x + 82;
    const textRight = close.x - 10;
    const textW = Math.max(52, textRight - textX);
    const kicker = String((modal && modal.kicker) || "沙盘信息");
    const title = String((modal && modal.title) || "详情");
    return {
      close,
      closeHit: { x: close.x - 5, y: close.y - 5, w: 46, h: 46 },
      icon,
      textX,
      textW,
      kicker,
      kickerSize: this.fitTextSize(ctx, kicker, textW, 12, 10, "700"),
      title,
      titleSize: this.fitTextSize(ctx, title, textW, 21, 15, "700")
    };
  }

  drawModalHeaderIcon(ctx, modal, cx, cy, size = 50) {
    if (modal && modal.animal) {
      this.drawAnimalAvatar(ctx, modal.animal, cx, cy, size - 2, true);
      return;
    }
    if (modal && modal.collectionItem) {
      this.roundRect(ctx, cx - size / 2, cy - size / 2 + 3, size, size, 16, "rgba(18,61,52,.18)");
      this.roundRect(ctx, cx - size / 2, cy - size / 2, size, size, 16, "#fff7c7", "rgba(255,169,58,.52)");
      this.drawCollectionItemIcon(ctx, modal.collectionItem, cx, cy, size - 12);
      return;
    }
    const icon = (modal && modal.icon) || "eye";
    const frame = this.uiIconFrame(icon);
    const image = frame && this.art && this.art.uiIcons && this.art.uiIcons[frame.key];
    if (image && image.loaded && ctx.drawImage) {
      const r = size / 2;
      this.roundRect(ctx, cx - r, cy - r, size, size, r, UI_THEME.ivory, "rgba(201,170,106,.54)");
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, 12, 12, 72, 72, cx - r + 2, cy - r + 2, size - 4, size - 4);
      ctx.restore();
      return;
    }
    this.roundRect(ctx, cx - size / 2, cy - size / 2 + 3, size, size, 16, "rgba(18,61,52,.18)");
    this.roundRect(ctx, cx - size / 2, cy - size / 2, size, size, 16, UI_THEME.ivory, "rgba(201,170,106,.48)");
    this.drawLargeIcon(ctx, icon, cx, cy, UI_THEME.forest700, size - 10);
  }

  drawInfoDetailModal() {
    const modal = this.infoDetailModal;
    if (!modal || this.settlementModal || this.patrolTaskModal || !this.ctx) return;
    if (modal.revealAt && Date.now() < modal.revealAt) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.fillStyle = "rgba(12,18,15,.48)";
    ctx.fillRect(0, 0, this.width, this.height);
    this.addHit(0, 0, this.width, this.height, () => {});

    const x = 20;
    const w = this.width - 40;
    const inlineAnimalActions = modal.kind === "mapAnimalAction";
    const inlineAnimalCare = modal.kind === "animalComfort";
    const h = Math.min(modal.kind === "guardianPromise" ? 520 : inlineAnimalActions ? 560 : inlineAnimalCare ? 500 : 590, this.height - 34);
    const y = Math.max(12, Math.round((this.height - h) / 2) - 2);
    this.roundRect(ctx, x, y + 7, w, h, 24, "rgba(15,24,20,.18)");
    const g = ctx.createLinearGradient(x, y, x, y + h);
    const headerStop = Math.min(.34, 80 / h);
    g.addColorStop(0, UI_THEME.tint);
    g.addColorStop(headerStop, UI_THEME.tintPressed);
    g.addColorStop(Math.min(1, headerStop + .002), UI_THEME.surfaceStrong);
    g.addColorStop(1, UI_THEME.surfaceStrong);
    this.roundRect(ctx, x, y, w, h, 24, g, UI_THEME.separator);

    const header = this.infoDetailHeaderLayout(ctx, modal, x, y, w);
    this.drawModalHeaderIcon(ctx, modal, header.icon.cx, header.icon.cy, header.icon.size);
    this.text(ctx, this.truncateTextToWidth(ctx, header.kicker, header.textW, header.kickerSize, "700"), header.textX, y + 36, header.kickerSize, "rgba(255,255,255,.78)", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, header.title, header.textW, header.titleSize, "700"), header.textX, y + 65, header.titleSize, "#ffffff", "700");
    this.roundRect(ctx, header.close.x, header.close.y, header.close.w, header.close.h, header.close.w / 2, "rgba(255,255,255,.90)", "rgba(255,255,255,.40)");
    this.text(ctx, "×", header.close.x + header.close.w / 2, header.close.y + 25, 18, UI_THEME.ink, "600", "center");
    this.addHit(header.closeHit.x, header.closeHit.y, header.closeHit.w, header.closeHit.h, () => {
      this.infoDetailModal = null;
      this.render();
    });

    const bodyY = y + 88;
    const footerY = (inlineAnimalActions || inlineAnimalCare) ? y + h - 18 : y + h - 88;
    const buttonY = y + h - 46;
    const bodyH = footerY - bodyY - 10;
    const paper = ctx.createLinearGradient(x, bodyY, x, bodyY + bodyH);
    paper.addColorStop(0, "rgba(255,255,255,.99)");
    paper.addColorStop(1, "rgba(247,249,246,.99)");
    this.roundRect(ctx, x + 16, bodyY + 2, w - 32, bodyH, 18, "rgba(20,31,26,.08)");
    this.roundRect(ctx, x + 16, bodyY, w - 32, bodyH, 18, paper, UI_THEME.separator);
    if (modal.kind === "mapAnimalAction") {
      this.drawMapAnimalActionModalContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "animalComfort") {
      this.drawAnimalComfortContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "facilityConstruction") {
      this.drawFacilityConstructionModalContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "collectionItem") {
      this.drawCollectionItemDetailContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "collectionOverview") {
      this.drawCollectionOverviewModalContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "materialExploration") {
      this.drawMaterialExplorationModalContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "collectionInvestigation") {
      this.drawCollectionInvestigationModalContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "collectionDice") {
      this.drawCollectionDiceModalContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "collectionEnding") {
      this.drawCollectionEndingModalContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "strategicDilemma" || modal.kind === "guardianPromise") {
      this.drawStrategicDilemmaModalContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "strategicDice") {
      this.drawStrategicDiceModalContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "goalCenter" || (modal.kind === "missionPush" && modal.goals)) {
      this.drawGoalCenterContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "missionPush") {
      this.drawMissionPushContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "speciesProfile") {
      this.drawSpeciesProfileModalContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "recoveredChoice") {
      this.drawRecoveredChoiceContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.kind === "supplyQuantity") {
      this.drawSupplyQuantityContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.layout === "metricDashboard") {
      this.drawMetricDashboardDetailContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.prose) {
      const metaH = modal.meta ? 30 : 0;
      const proseH = bodyH - metaH - 38;
      this.roundRect(ctx, x + 28, bodyY + 18, w - 56, proseH, 7, "rgba(255, 250, 236, 0.78)", "rgba(36, 64, 46, 0.08)");
      const proseX = modal.animal ? x + 96 : x + 44;
      const proseW = modal.animal ? w - 140 : w - 88;
      if (modal.animal) {
        this.drawAnimalAvatar(ctx, modal.animal, x + 58, bodyY + 58, 56, true);
        this.text(ctx, this.animalDisplayName(modal.animal), x + 58, bodyY + 101, 10, "#49604e", "700", "center");
      }
      this.drawFittedTextBlock(ctx, modal.prose, proseX, bodyY + 44, proseW, proseH - 32, {
        size: 14,
        minSize: 10,
        lineHeight: 22,
        color: "#26352b"
      });
      if (modal.meta) {
        const metaY = bodyY + bodyH - 42;
        this.roundRect(ctx, x + 28, metaY, w - 56, 30, 7, "rgba(15, 33, 24, 0.08)", "rgba(36, 64, 46, 0.1)");
        this.drawFittedTextBlock(ctx, modal.meta, x + 42, metaY + 19, w - 84, 12, {
          size: 10,
          minSize: 10,
          lineHeight: 12,
          color: "#66715f"
        });
      }
    } else if (modal.layout === "materialSupply" && modal.items && modal.items.length) {
      this.drawMaterialSupplyDetailContent(ctx, modal, x, bodyY, w, bodyH);
    } else if (modal.items && modal.items.length) {
      const listX = x + 28;
      const listY = bodyY + 18;
      const listW = w - 56;
      const listH = bodyH - 30;
      this.roundRect(ctx, listX, listY, listW, listH, 7, "rgba(255, 250, 236, 0.78)", "rgba(36, 64, 46, 0.08)");
      const animalReady = !modal.animalRevealAt || Date.now() >= modal.animalRevealAt;
      const visibleItems = modal.items.filter((item) => animalReady || item.tag !== "永久后果").slice(0, 6);
      const itemGap = 8;
      const cardW = listW - 20;
      const availableCardsH = Math.max(0, listH - 20 - itemGap * Math.max(0, visibleItems.length - 1));
      const desiredHeights = visibleItems.map((item) => this.infoListItemNaturalHeight(ctx, item, cardW));
      const minimumHeights = visibleItems.map((item) => this.infoListItemMinimumHeight(ctx, item, cardW));
      const desiredTotal = desiredHeights.reduce((sum, value) => sum + value, 0);
      let itemHeights = desiredHeights.slice();
      if (desiredTotal > availableCardsH && visibleItems.length) {
        const minimumTotal = minimumHeights.reduce((sum, value) => sum + value, 0);
        const bases = minimumTotal <= availableCardsH
          ? minimumHeights
          : visibleItems.map(() => Math.max(48, Math.floor(availableCardsH / visibleItems.length)));
        const baseTotal = bases.reduce((sum, value) => sum + value, 0);
        const extraPool = Math.max(0, availableCardsH - baseTotal);
        const needs = desiredHeights.map((value, index) => Math.max(0, value - bases[index]));
        const totalNeed = needs.reduce((sum, value) => sum + value, 0) || 1;
        itemHeights = needs.map((need, index) => bases[index] + Math.floor(extraPool * need / totalNeed));
        const allocated = itemHeights.reduce((sum, value) => sum + value, 0);
        if (itemHeights.length) itemHeights[itemHeights.length - 1] += Math.max(0, availableCardsH - allocated);
      }
      let itemY = listY + 10;
      modal.renderedInfoItems = [];
      visibleItems.forEach((item, index) => {
        const itemH = itemHeights[index] || 56;
        const layout = this.infoListItem(ctx, item, listX + 10, itemY, cardW, itemH, index === 0);
        modal.renderedInfoItems.push({ item, x: listX + 10, y: itemY, w: cardW, h: itemH, layout });
        itemY += itemH + itemGap;
      });
    } else {
      this.roundRect(ctx, x + 28, bodyY + 18, w - 56, bodyH - 30, 7, "rgba(255, 250, 236, 0.78)", "rgba(36, 64, 46, 0.08)");
      this.drawFittedTextBlock(ctx, (modal.lines || []).join("\n"), x + 42, bodyY + 42, w - 84, bodyH - 62, {
        size: 12,
        minSize: 10,
        lineHeight: 17,
        color: "#26352b"
      });
    }
    const footerCopy = modal.kind === "mapAnimalAction" || modal.kind === "animalComfort"
      ? ""
      : modal.kind === "guardianPromise"
      ? (modal.selectedChoiceId ? "确认后生效" : "选择一项长期守则")
      : modal.kind === "strategicDilemma"
      ? (modal.selectedChoiceId ? "确认后结算" : "选择一项方案")
      : modal.footer;
    if (footerCopy) {
      this.roundRect(ctx, x + 18, footerY, w - 36, 28, 14, "rgba(24,93,77,.82)", "rgba(255,255,255,.28)");
      this.drawFittedTextBlock(ctx, footerCopy, x + 32, footerY + 18, w - 64, 12, {
        size: 10,
        minSize: 10,
        lineHeight: 12,
        color: "#d9dfce"
      });
    }
    if (modal.kind === "mapAnimalAction") {
    } else if (modal.kind === "animalComfort") {
    } else if (modal.kind === "facilityConstruction") {
      const facility = modal.facility || {};
      this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 36, "关闭", "#e8ddbd", () => { this.infoDetailModal = null; this.render(); }, "#26352b", 11);
      if ((facility.buildStage || 0) < 2) {
        this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, `投入建设 ${facility.nextBuildCost || 0}`, "#1c3325", () => this.investFacilityConstruction(facility.id), "#fff8df", 10);
      } else if ((facility.buildStage || 0) === 2) {
        this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, modal.selectedSpecializationId ? "确认永久专精" : "先选择专精", modal.selectedSpecializationId ? "#1c3325" : "#9aa093", () => {
          if (!modal.selectedSpecializationId) return this.toast("先选择一个设施专精");
          this.confirmFacilitySpecialization(facility.id, modal.selectedSpecializationId);
        }, "#fff8df", 10);
      } else {
        this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, "回沙盘看设施", "#1c3325", () => this.focusReserveFacility(facility.id), "#fff8df", 10);
      }
    } else if (modal.kind === "collectionInvestigation") {
      this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 36, "暂不调查", "#e8ddbd", () => { this.infoDetailModal = null; this.render(); }, "#26352b", 11);
      this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, "确认并掷骰", "#1c3325", () => this.confirmCollectionInvestigation(), "#fff8df", 11);
    } else if (modal.kind === "collectionEnding") {
      this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 36, "稍后决定", "#e8ddbd", () => { this.infoDetailModal = null; this.render(); }, "#26352b", 11);
      this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, modal.selectedChoiceId ? "永久结案" : "先选一个结局", modal.selectedChoiceId ? "#1c3325" : "#9aa093", () => this.confirmCollectionEnding(), "#fff8df", 11);
    } else if (modal.kind === "collectionDice") {
      this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 36, "稍后继续", "#e8ddbd", () => {
        if (modal.phase !== "rolling") { this.infoDetailModal = null; this.render(); }
      }, "#26352b", 11);
      this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, modal.phase === "rolling" ? "骰子滚动中" : "掷骰决定结果", modal.phase === "rolling" ? "#9aa093" : "#1c3325", () => {
        if (modal.phase !== "rolling" && modal.action) modal.action();
      }, "#fff8df", 11);
    } else if (modal.kind === "strategicDilemma" || modal.kind === "guardianPromise") {
      const selected = modal.selectedChoiceId;
      this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 36, modal.kind === "guardianPromise" ? "稍后决定" : "暂缓决定", "#e8ddbd", () => {
        this.dismissInfoDetailModal();
      }, "#26352b", 11);
      this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, selected ? (modal.kind === "guardianPromise" ? "确认守则" : "确认方案") : (modal.kind === "guardianPromise" ? "选择方案" : "先选一个方案"), selected ? "#1c3325" : "#9aa093", () => {
        if (!selected) {
          this.toast("先选择一个方案");
          return;
        }
        if (modal.kind === "guardianPromise") this.confirmGuardianPromise(modal.promise.chapter, selected);
        else this.confirmStrategicChoice(modal.dilemma.id, selected);
      }, "#fff8df", 11);
    } else if (modal.kind === "goalCenter" || (modal.kind === "missionPush" && modal.goals)) {
      const selectedGoal = this.selectedGoalFromModal(modal);
      const alternatives = (modal.goals || []).filter((goal) => goal.id !== modal.currentGoalId);
      const secondaryLabel = alternatives.length
        ? (modal.showAlternatives ? "收起备选" : `更换目标 ${alternatives.length}`)
        : "关闭";
      this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 36, secondaryLabel, "#e8ddbd", () => {
        if (!alternatives.length) return this.dismissInfoDetailModal();
        modal.showAlternatives = !modal.showAlternatives;
        this.playSfx("tap");
        this.render();
      }, "#26352b", 11);
      this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, selectedGoal ? (selectedGoal.buttonLabel || "去完成") : "选择目标", selectedGoal ? "#1c3325" : "#9aa093", () => {
        if (selectedGoal) this.executeGoalAction(selectedGoal);
      }, "#fff8df", 11);
    } else if (modal.kind === "recoveredChoice") {
      this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 36, "稍后处理", "#e8ddbd", () => { this.infoDetailModal = null; this.render(); }, "#26352b", 11);
      this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, "确认选择", "#1c3325", () => this.confirmRecoveredChoice(), "#fff8df", 11);
    } else if (modal.kind === "supplyQuantity") {
      this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 36, "取消", "#e8ddbd", () => { this.infoDetailModal = null; this.render(); }, "#26352b", 11);
      this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, "确认采购", "#1c3325", () => this.confirmSupplyQuantityPurchase(), "#fff8df", 11);
    } else if (modal.choices && modal.choices.length >= 2) {
      const leftChoice = modal.choices[0];
      const rightChoice = modal.choices[1];
      this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 36, leftChoice.label, "#e8ddbd", () => leftChoice.action(), "#26352b", 10);
      this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, rightChoice.label, "#1c3325", () => rightChoice.action(), "#fff8df", 10);
    } else if (modal.actionLabel && modal.action) {
      this.modalButton(ctx, x + 18, buttonY, (w - 48) / 2, 36, "关闭", "#e8ddbd", () => {
        this.dismissInfoDetailModal();
      }, "#26352b", 12);
      this.modalButton(ctx, x + 30 + (w - 48) / 2, buttonY, (w - 48) / 2, 36, modal.actionLabel, "#1c3325", () => modal.action(), "#fff8df", 12);
    } else {
      this.modalButton(ctx, x + 18, buttonY, w - 36, 36, "关闭", "#1c3325", () => {
        this.dismissInfoDetailModal();
      }, "#fff8df", 12);
    }
    ctx.restore();
  }

  drawCollectionItemDetailContent(ctx, modal, x, bodyY, w, bodyH) {
    const item = modal.item || modal.collectionItem || {};
    const entry = modal.entry || null;
    const caseDef = modal.caseDef || collectionCaseById(item.caseId) || { short: "剧情发现", color: "#2b8f77" };
    const discoveryState = (((((this.state.world || {}).collection || {}).discovery || {}).states || {})[item.id]) || null;
    const panelX = x + 28;
    const panelW = w - 56;
    const compact = bodyH < 360;
    const plateSize = compact ? 88 : 98;
    const artSize = compact ? 70 : 80;
    const topY = bodyY + 15;
    const artX = panelX + plateSize / 2;
    const artY = topY + plateSize / 2;
    const accent = caseDef.color || "#2b8f77";

    this.roundRect(ctx, panelX, topY + 6, plateSize, plateSize, 19, "rgba(18,61,52,.16)");
    const artFill = ctx.createLinearGradient(panelX, topY, panelX + plateSize, topY + plateSize);
    artFill.addColorStop(0, "#fffbe1");
    artFill.addColorStop(1, "#f5e6ae");
    this.roundRect(ctx, panelX, topY, plateSize, plateSize, 19, artFill, this.rgba(accent, .56));
    this.roundRect(ctx, panelX + 7, topY + 7, plateSize - 14, plateSize - 14, 14, "rgba(255,255,255,.28)", "rgba(255,255,255,.66)");
    if (entry) {
      this.drawCollectionItemIcon(ctx, item, artX, artY, artSize);
    } else {
      ctx.save();
      ctx.globalAlpha = .13;
      this.drawCollectionItemIcon(ctx, item, artX, artY, artSize);
      ctx.restore();
      this.roundRect(ctx, artX - 18, artY - 18, 36, 36, 12, "rgba(30,53,39,.78)", "rgba(255,255,255,.62)");
      this.text(ctx, "?", artX, artY + 12, 20, "#fff8df", "700", "center");
    }
    const infoX = panelX + plateSize + 12;
    const infoW = panelW - plateSize - 12;
    const rarityW = Math.min(62, Math.max(50, `${entry ? item.rarity : `第${item.slot || "?"}件`}`.length * 10 + 18));
    this.roundRect(ctx, infoX, topY, rarityW, 22, 11, this.rgba(accent, .14), this.rgba(accent, .34));
    this.text(ctx, entry ? item.rarity : `第${item.slot || "?"}件`, infoX + rarityW / 2, topY + 15, 9, accent, "700", "center");
    const statusW = 66;
    this.roundRect(ctx, infoX + infoW - statusW, topY, statusW, 22, 11, entry ? "rgba(75,203,139,.18)" : "rgba(98,111,102,.10)", entry ? "rgba(43,143,113,.40)" : "rgba(98,111,102,.24)");
    this.text(ctx, entry ? "已收录 ✓" : "等待发现", infoX + infoW - statusW / 2, topY + 15, 9, entry ? "#1f7a52" : "#69756d", "700", "center");

    const unlockType = item.condition && item.condition.finale ? "案件结局" : item.slot === 7 ? "特殊条件" : "动物线索";
    const meta = entry
      ? [
        { label: "发现日期", value: `第${entry.firstDay || "?"}日` },
        { label: "发现经过", value: ((entry.discovery || {}).action) || entry.methodName || "现场记录" }
      ]
      : [
        { label: "剧情位置", value: unlockType },
        { label: "发现进度", value: discoveryState ? discoveryStatusLabel(discoveryState.status) : `${item.slot || "?"}/${collectionItemsForCase(item.caseId).length || 8}` }
      ];
    meta.forEach((data, index) => {
      const rowY = topY + 29 + index * 29;
      this.roundRect(ctx, infoX, rowY, infoW, 25, 9, index ? "rgba(246,243,218,.90)" : "rgba(225,249,232,.92)", index ? "rgba(180,143,51,.20)" : "rgba(43,143,113,.22)");
      this.text(ctx, data.label, infoX + 9, rowY + 17, 9, "#6a756d", "700");
      this.text(ctx, this.truncateTextToWidth(ctx, data.value, infoW - 72, 11, "700"), infoX + infoW - 9, rowY + 18, 11, "#1d3a2b", "700", "right");
    });

    const flowH = 54;
    const flowY = bodyY + bodyH - flowH - 10;
    const storyY = topY + plateSize + 13;
    const storyH = Math.min(compact ? 104 : 118, Math.max(78, flowY - storyY - 14));
    this.roundRect(ctx, panelX, storyY + 3, panelW, storyH, 14, "rgba(18,61,52,.08)");
    this.roundRect(ctx, panelX, storyY, panelW, storyH, 14, "rgba(255,252,235,.94)", this.rgba(accent, .20));
    this.text(ctx, entry ? "这段故事" : "下一步", panelX + 12, storyY + 20, 10, accent, "700");
    let story = item.story || "这件藏品还没有留下记录。";
    if (entry && entry.discovery) {
      story = `${entry.discovery.who || "附近动物"}带你在${entry.discovery.where || "保护区"}发现它。${item.story || ""}`;
    } else if (!entry) {
      if (item.condition && item.condition.finale) story = "集齐本案前 7 件藏品，再做出一次永久选择。";
      else if (discoveryState && discoveryState.status === "located") story = `痕迹已在沙盘定位。返回沙盘，点击发光物件亲手收录「${item.name}」。`;
      else if (discoveryState && discoveryState.status === "hinted") story = `${(discoveryState.animal || {}).name || "动物"}发现了异常。完成“${discoveryState.actionLabel || item.discoveryActionLabel}”，把模糊迹象变成现场发现。`;
      else if (item.slot === 7) story = "满足本章的季节、保护区数据或动物关系条件。";
      else story = `在沙盘倾听动物。它们会根据章节、季节和关系，带你发现「${caseDef.short || caseDef.title}」的下一段故事。`;
    }
    const storyLayout = this.drawFittedTextBlock(ctx, story, panelX + 12, storyY + 39, panelW - 24, storyH - 45, {
      size: 12,
      minSize: 10,
      lineHeight: 17,
      maxLines: 3,
      color: "#32473a"
    });

    this.roundRect(ctx, panelX, flowY, panelW, flowH, 15, "rgba(27,77,61,.92)", "rgba(255,255,255,.28)");
    const labels = ["迹象", "守护", "现场", "收录"];
    const current = entry ? 3 : discoveryState && discoveryState.status === "located" ? 2 : discoveryState && discoveryState.status === "hinted" ? 0 : modal.pending ? 2 : modal.lead ? 1 : 0;
    const nodeW = panelW / labels.length;
    labels.forEach((label, index) => {
      const cx = panelX + nodeW * index + nodeW / 2;
      if (index) this.roundRect(ctx, cx - nodeW / 2 - 1, flowY + 17, nodeW - 14, 4, 2, index <= current ? UI_THEME.gold : "rgba(255,255,255,.22)");
      this.roundRect(ctx, cx - 10, flowY + 9, 20, 20, 10, index <= current ? UI_THEME.gold : "rgba(255,255,255,.20)", "rgba(255,255,255,.36)");
      this.text(ctx, index < current ? "✓" : `${index + 1}`, cx, flowY + 24, 10, index <= current ? "#1c5c49" : "#dbece6", "700", "center");
      this.text(ctx, label, cx, flowY + 45, 9, index <= current ? "#fff5af" : "#c7ded6", "700", "center");
    });
    modal.renderedCollectionItemDetail = {
      iconSize: artSize,
      plateSize,
      plateShape: "rounded-square",
      graphicalStages: labels.length,
      storySize: storyLayout.size || 12,
      storyH,
      metaLayout: "side",
      owned: !!entry,
      currentStage: current
    };
  }

  drawCollectionOverviewModalContent(ctx, modal, x, bodyY, w, bodyH) {
    const summary = modal.summary || collectionSummary(this.state);
    const collection = ((this.state.world || {}).collection || { items: {} });
    const panelX = x + 28;
    const panelW = w - 56;
    const heroH = 72;
    const hero = ctx.createLinearGradient(panelX, bodyY + 12, panelX + panelW, bodyY + heroH);
    hero.addColorStop(0, UI_THEME.ivory);
    hero.addColorStop(.58, UI_THEME.parchment);
    hero.addColorStop(1, "#e4e8df");
    this.roundRect(ctx, panelX, bodyY + 16, panelW, heroH, 17, "rgba(18,61,52,.10)");
    this.roundRect(ctx, panelX, bodyY + 12, panelW, heroH, 17, hero, "rgba(46,135,110,.26)");
    this.roundRect(ctx, panelX + 12, bodyY + 23, 50, 50, 16, "#fff9d9", "rgba(216,174,62,.42)");
    const newestId = Object.keys(collection.items || {}).slice(-1)[0];
    const heroItem = collectionItemById(newestId) || collectionItemById("c1_whistle");
    this.drawCollectionItemIcon(ctx, heroItem, panelX + 37, bodyY + 48, 44);
    this.text(ctx, "剧情发现总进度", panelX + 74, bodyY + 34, 10, "#647168", "700");
    this.text(ctx, `${summary.collected}/${summary.total}`, panelX + 74, bodyY + 59, 22, "#1c5c49", "700");
    this.roundRect(ctx, panelX + 74, bodyY + 66, panelW - 88, 8, 4, "rgba(36,64,46,.14)");
    this.roundRect(ctx, panelX + 74, bodyY + 66, Math.max(summary.collected ? 8 : 0, (panelW - 88) * summary.collected / Math.max(1, summary.total)), 8, 4, UI_THEME.gold);

    const gap = 6;
    const gridY = bodyY + 94;
    const cardW = (panelW - gap * 2) / 3;
    const remainingH = bodyY + bodyH - gridY - 10;
    const cardH = Math.max(80, Math.min(112, (remainingH - gap) / 2));
    const labels = {
      case_1: "巡护遗物", case_2: "水文遗珍", case_3: "边界证物",
      case_4: "迁徙记忆", case_5: "共同守护", hidden: "森林私藏"
    };
    modal.renderedCollectionOverview = [];
    (summary.folders || []).forEach((folder, index) => {
      const cx = panelX + (index % 3) * (cardW + gap);
      const cy = gridY + Math.floor(index / 3) * (cardH + gap);
      const items = collectionItemsForCase(folder.id);
      const owned = items.filter((item) => collection.items && collection.items[item.id]);
      const featured = owned[owned.length - 1] || items[0];
      const unlocked = folder.hidden || folder.chapter <= (((this.state.world.reserve || {}).progression || {}).level || 1);
      this.roundRect(ctx, cx, cy + 4, cardW, cardH, 16, "rgba(18,61,52,.10)");
      this.roundRect(ctx, cx, cy, cardW, cardH, 16, unlocked ? "rgba(255,253,241,.96)" : "rgba(233,237,229,.94)", this.rgba(folder.color, unlocked ? .46 : .20));
      const iconSize = Math.max(42, Math.min(52, cardW - 24, cardH - 46));
      const iconY = cy + 9 + iconSize / 2;
      ctx.save();
      ctx.globalAlpha = owned.length && unlocked ? 1 : .18;
      this.drawCollectionItemIcon(ctx, featured, cx + cardW / 2, iconY, iconSize);
      ctx.restore();
      if (!owned.length || !unlocked) {
        this.roundRect(ctx, cx + cardW / 2 - 12, iconY - 12, 24, 24, 12, "rgba(30,53,39,.72)");
        this.text(ctx, "?", cx + cardW / 2, iconY + 9, 14, "#fff8df", "700", "center");
      }
      this.text(ctx, this.truncateTextToWidth(ctx, labels[folder.id] || folder.short, cardW - 12, 10, "700"), cx + cardW / 2, cy + cardH - 24, 10, unlocked ? "#1c3325" : "#6b766e", "700", "center");
      this.text(ctx, unlocked ? `${folder.found}/${folder.total}` : `Lv.${folder.chapter}`, cx + cardW / 2, cy + cardH - 9, 10, folder.found ? folder.color : "#778179", "700", "center");
      if (folder.leads && unlocked) {
        this.roundRect(ctx, cx + cardW - 22, cy + 7, 15, 15, 8, "#f46773", "rgba(255,255,255,.72)");
        this.text(ctx, `${folder.leads}`, cx + cardW - 14.5, cy + 18, 8, "#ffffff", "700", "center");
      }
      this.addHit(cx, cy, cardW, cardH, () => {
        if (!unlocked) return this.toast(`第${folder.chapter}章后开放`);
        this.infoDetailModal = null;
        this.collectionCaseId = folder.id;
        this.collectionPage = 0;
        this.render();
      });
      modal.renderedCollectionOverview.push({ id: folder.id, x: cx, y: cy, w: cardW, h: cardH, iconSize, columns: 3, unlocked, found: folder.found });
    });
  }

  drawMaterialSupplyDetailContent(ctx, modal, x, bodyY, w, bodyH) {
    const items = modal.items || [];
    const purpose = items[0] || {};
    const stock = items[1] || {};
    const impact = items[2] || {};
    const after = items[3] || {};
    const advice = items[4] || {};
    const panelX = x + 28;
    const panelW = w - 56;
    const compact = bodyH < 350;
    const gap = compact ? 7 : 9;
    const heroY = bodyY + 16;
    const heroH = compact ? 68 : 76;

    const hero = ctx.createLinearGradient(panelX, heroY, panelX + panelW, heroY + heroH);
    hero.addColorStop(0, UI_THEME.ivory);
    hero.addColorStop(1, UI_THEME.parchment);
    this.roundRect(ctx, panelX, heroY + 4, panelW, heroH, 16, "rgba(18,61,52,.12)");
    this.roundRect(ctx, panelX, heroY, panelW, heroH, 16, hero, "rgba(255,169,58,.58)");
    this.statusPill(ctx, panelX + 12, heroY + 11, purpose.tag || "用途", "#ffe38a", "#31533b", 44);
    this.text(ctx, this.truncateTextToWidth(ctx, purpose.title || "补给用途", panelW - 84, 13, "700"), panelX + 68, heroY + 29, 13, "#173d34", "700");
    this.drawFittedTextBlock(ctx, purpose.body || "", panelX + 14, heroY + 51, panelW - 28, heroH - 47, {
      size: 10,
      minSize: 10,
      lineHeight: 13,
      color: "#4b594e"
    });

    const metricY = heroY + heroH + gap;
    const metricH = compact ? 78 : 86;
    const metricGap = 8;
    const metricW = (panelW - metricGap) / 2;
    this.drawMaterialSupplyMetricCard(ctx, stock, panelX, metricY, metricW, metricH, false);
    this.drawMaterialSupplyMetricCard(ctx, after, panelX + metricW + metricGap, metricY, metricW, metricH, true);

    const guideY = metricY + metricH + gap;
    const guideH = Math.max(82, bodyY + bodyH - 14 - guideY);
    this.roundRect(ctx, panelX, guideY + 4, panelW, guideH, 16, "rgba(18,61,52,.10)");
    this.roundRect(ctx, panelX, guideY, panelW, guideH, 16, "rgba(255,255,250,.92)", "rgba(46,135,110,.20)");
    const rowH = guideH / 2;
    this.drawMaterialSupplyGuideRow(ctx, impact, panelX + 10, guideY + 4, panelW - 20, rowH - 5, false);
    ctx.fillStyle = "rgba(46,135,110,.16)";
    ctx.fillRect(panelX + 16, guideY + rowH, panelW - 32, 1);
    this.drawMaterialSupplyGuideRow(ctx, advice, panelX + 10, guideY + rowH + 2, panelW - 20, rowH - 5, true);
  }

  drawMetricDashboardDetailContent(ctx, modal, x, bodyY, w, bodyH) {
    const panelX = x + 28;
    const panelW = w - 56;
    const metrics = (modal.heroMetrics || []).slice(0, 3);
    const metricGap = 7;
    const metricY = bodyY + 16;
    const metricH = bodyH < 380 ? 82 : 90;
    const metricW = (panelW - metricGap * Math.max(0, metrics.length - 1)) / Math.max(1, metrics.length);
    const palettes = [
      { top: "#fff2a6", bottom: "#ffd35c", stroke: "rgba(230,166,63,.52)", value: "#8b5c12" },
      { top: "#d8f7de", bottom: "#9ee7b8", stroke: "rgba(46,135,110,.42)", value: "#177255" },
      { top: "#dff6ff", bottom: "#9ddcf1", stroke: "rgba(48,142,174,.42)", value: "#237c98" }
    ];
    modal.renderedDashboardMetrics = [];
    metrics.forEach((metric, index) => {
      const mx = panelX + index * (metricW + metricGap);
      const palette = Object.assign({}, palettes[index] || palettes[1], metric.palette || {});
      this.roundRect(ctx, mx, metricY + 5, metricW, metricH, 17, "rgba(18,61,52,.14)");
      const card = ctx.createLinearGradient(mx, metricY, mx, metricY + metricH);
      card.addColorStop(0, palette.top);
      card.addColorStop(1, palette.bottom);
      this.roundRect(ctx, mx, metricY, metricW, metricH, 17, card, palette.stroke);
      this.roundRect(ctx, mx + 6, metricY + 6, metricW - 12, metricH - 12, 13, null, "rgba(255,255,255,.48)");
      this.text(ctx, metric.label || "状态", mx + metricW / 2, metricY + 24, 10, "#365344", "700", "center");
      const value = String(metric.value === undefined ? "—" : metric.value);
      const valueSize = this.fitTextSize(ctx, value, metricW - 16, 22, 14, "700");
      this.text(ctx, value, mx + metricW / 2, metricY + 52, valueSize, palette.value, "700", "center");
      if (metric.note) {
        this.text(ctx, this.truncateTextToWidth(ctx, metric.note, metricW - 14, 9, "700"), mx + metricW / 2, metricY + metricH - 10, 9, "#557063", "700", "center");
      }
      modal.renderedDashboardMetrics.push({ label: metric.label, value, x: mx, y: metricY, w: metricW, h: metricH, valueSize });
    });

    const items = (modal.items || []).slice(0, 3);
    const listY = metricY + metricH + 10;
    const listBottom = bodyY + bodyH - 14;
    const listH = Math.max(0, listBottom - listY);
    const itemGap = 7;
    const availableH = Math.max(0, listH - itemGap * Math.max(0, items.length - 1));
    const natural = items.map((item) => this.infoListItemNaturalHeight(ctx, item, panelW));
    const minimum = items.map(() => 58);
    const minimumTotal = minimum.reduce((sum, height) => sum + height, 0);
    const bases = minimumTotal <= availableH
      ? minimum
      : items.map(() => Math.max(44, Math.floor(availableH / Math.max(1, items.length))));
    const baseTotal = bases.reduce((sum, height) => sum + height, 0);
    const extraPool = Math.max(0, availableH - baseTotal);
    const needs = natural.map((height, index) => Math.max(1, height - bases[index]));
    const totalNeed = needs.reduce((sum, height) => sum + height, 0) || 1;
    let heights = needs.map((need, index) => bases[index] + Math.floor(extraPool * need / totalNeed));
    const allocated = heights.reduce((sum, height) => sum + height, 0);
    if (heights.length) heights[heights.length - 1] += availableH - allocated;
    let itemY = listY;
    modal.renderedInfoItems = [];
    items.forEach((item, index) => {
      const itemH = heights[index] || 64;
      const layout = this.infoListItem(ctx, item, panelX, itemY, panelW, itemH, index === 0);
      modal.renderedInfoItems.push({ item, x: panelX, y: itemY, w: panelW, h: itemH, layout });
      itemY += itemH + itemGap;
    });
  }

  drawMaterialSupplyMetricCard(ctx, item, x, y, w, h, primary) {
    const fill = primary ? "#e8f7d9" : "#f7fbef";
    const stroke = primary ? "rgba(46,135,110,.42)" : "rgba(46,135,110,.20)";
    this.roundRect(ctx, x, y + 4, w, h, 14, "rgba(18,61,52,.11)");
    this.roundRect(ctx, x, y, w, h, 14, fill, stroke);
    this.statusPill(ctx, x + 10, y + 9, item.tag || "状态", primary ? "#cceebf" : "#e3f1d7", "#31533b", 44);
    this.text(ctx, this.truncateTextToWidth(ctx, item.title || "—", w - 20, 12, "700"), x + 10, y + 47, 12, "#173d34", "700");
    this.wrapText(ctx, item.body || "", x + 10, y + 65, w - 20, 10, 12, "#5d6b62", Math.max(1, Math.floor((h - 56) / 12)));
  }

  drawMaterialSupplyGuideRow(ctx, item, x, y, w, h, primary) {
    this.statusPill(ctx, x, y + 8, item.tag || "说明", primary ? "#fff0b2" : "#e3f1d7", "#31533b", 44);
    this.text(ctx, this.truncateTextToWidth(ctx, item.title || "—", w - 62, 11, "700"), x + 56, y + 25, 11, "#173d34", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, item.body || "", w - 62, 10, "400"), x + 56, y + Math.min(h - 5, 43), 10, "#5d6b62", "400");
  }

  drawFacilityConstructionModalContent(ctx, modal, x, bodyY, w, bodyH) {
    const facility = modal.facility || {};
    const reserve = (this.state.world || {}).reserve || {};
    const innerX = x + 27;
    const innerW = w - 54;
    const stage = facility.buildStage || 1;
    const progress = stage >= 3 ? 3 : stage >= 2 ? 2 : 1 + Math.max(0, facility.buildSteps || 0) * .45;
    const stageNames = ["案件修复", "主体建成", "路线专精"];
    this.roundRect(ctx, innerX, bodyY + 12, innerW, 62, 14, "#fff7df", "rgba(216,174,62,.34)");
    this.text(ctx, "我的保护区建设", innerX + 12, bodyY + 32, 11, "#8b6f2a", "700");
    this.text(ctx, facility.stageLabel || "建设待推进", innerX + innerW - 12, bodyY + 32, 10, stage >= 3 ? "#1f7a52" : "#b07a16", "700", "right");
    const barX = innerX + 12;
    const barY = bodyY + 43;
    const barW = innerW - 24;
    this.roundRect(ctx, barX, barY, barW, 8, 4, "rgba(38,53,43,.13)");
    this.roundRect(ctx, barX, barY, barW * Math.max(.18, progress / 3), 8, 4, stage >= 3 ? "#4fa56e" : "#d2a33d");
    stageNames.forEach((name, index) => {
      this.text(ctx, name, barX + (barW * index / 2), bodyY + 68, 10, index < progress ? "#1f5a3f" : "#9a9d91", "700", index === 0 ? "left" : index === 2 ? "right" : "center");
    });

    if (stage < 2) {
      const cardY = bodyY + 84;
      const cardH = 150;
      this.roundRect(ctx, innerX, cardY + 5, innerW, cardH, 16, "rgba(18,61,52,.11)");
      this.roundRect(ctx, innerX, cardY, innerW, cardH, 16, "#fff9e8", "rgba(216,174,62,.34)");
      this.roundRect(ctx, innerX + 12, cardY + 12, 54, 24, 10, "#1c3325");
      this.text(ctx, `第${(facility.buildSteps || 0) + 1}/2步`, innerX + 39, cardY + 28, 10, "#fff8df", "700", "center");
      this.text(ctx, (facility.buildSteps || 0) === 0 ? "接通基础线路" : "安装运行设备", innerX + 78, cardY + 30, 14, "#1c3325", "700");
      const metricGap = 8;
      const metricW = (innerW - 32 - metricGap) / 2;
      const metricY = cardY + 47;
      const fundAfter = Math.max(0, (reserve.fund || 0) - (facility.nextBuildCost || 0));
      const metricData = [
        { label: "基金", value: `${reserve.fund || 0}→${fundAfter}`, fill: "#fff0b2", color: "#a76b12" },
        { label: "本步提升", value: facilityEffectText(facility.nextBuildEffect || {}) || "进度+1", fill: "#d9f3d8", color: "#1f7a52" }
      ];
      modal.renderedFacilityBuildMetrics = [];
      metricData.forEach((metric, index) => {
        const mx = innerX + 12 + index * (metricW + metricGap);
        this.roundRect(ctx, mx, metricY, metricW, 58, 13, metric.fill, "rgba(46,135,110,.22)");
        this.text(ctx, metric.label, mx + metricW / 2, metricY + 19, 10, "#53655a", "700", "center");
        const valueSize = this.fitTextSize(ctx, metric.value, metricW - 12, 17, 12, "700");
        this.text(ctx, metric.value, mx + metricW / 2, metricY + 45, valueSize, metric.color, "700", "center");
        modal.renderedFacilityBuildMetrics.push({ label: metric.label, value: metric.value, valueSize, x: mx, y: metricY, w: metricW, h: 58 });
      });
      const purposeLayout = this.drawFittedTextBlock(ctx, facility.purpose || "建设结果保留在沙盘", innerX + 14, cardY + 126, innerW - 28, 20, { size: 10, minSize: 10, lineHeight: 13, color: "#5d665c" });
      const noteY = cardY + cardH + 10;
      this.roundRect(ctx, innerX, noteY, innerW, Math.max(54, bodyY + bodyH - noteY - 10), 13, "#e8f6e4", "rgba(31,122,82,.24)");
      this.text(ctx, (facility.buildSteps || 0) === 0 ? "沙盘：出现施工架与木料" : "沙盘：灯光和道路恢复", innerX + 14, noteY + 25, 12, "#1f5a3f", "700");
      this.text(ctx, (facility.buildSteps || 0) === 0 ? "下一步继续投入建设" : "完成后可选择永久专精", innerX + 14, noteY + 47, 10, "#5b6b60", "700");
      modal.renderedFacilityBuildText = purposeLayout;
      return;
    }

    if (stage === 2) {
      const cardsY = bodyY + 82;
      const gap = 7;
      const routes = facility.routes || [];
      const selectedId = modal.selectedSpecializationId || "";
      const availableH = bodyH - 94;
      const naturalH = Math.max(70, Math.floor((availableH - gap * Math.max(0, routes.length - 1)) / Math.max(1, routes.length)));
      const expandedH = selectedId ? Math.min(142, availableH - 62 * Math.max(0, routes.length - 1) - gap * Math.max(0, routes.length - 1)) : naturalH;
      const collapsedH = selectedId && routes.length > 1
        ? Math.floor((availableH - expandedH - gap * (routes.length - 1)) / (routes.length - 1))
        : naturalH;
      let routeY = cardsY;
      modal.renderedFacilityRouteLayout = [];
      modal.renderedFacilityRouteText = [];
      routes.forEach((routeRef) => {
        const route = Object.assign({}, ROUTE_KITS[routeRef.id] || {}, routeRef);
        const cy = routeY;
        const selected = modal.selectedSpecializationId === route.id;
        const cardH = selectedId ? (selected ? expandedH : collapsedH) : naturalH;
        this.roundRect(ctx, innerX, cy + 4, innerW, cardH, 14, "rgba(18,61,52,.11)");
        this.roundRect(ctx, innerX, cy, innerW, cardH, 14, selected ? "#fff3b8" : "#fffaf0", selected ? route.color : "rgba(36,64,46,.15)");
        this.roundRect(ctx, innerX + 10, cy + 10, 46, 24, 9, route.color || "#1f7a52");
        this.text(ctx, selected ? `✓${route.short || route.label}` : (route.short || route.label), innerX + 33, cy + 27, 10, "#fff8df", "700", "center");
        const costW = 58;
        this.roundRect(ctx, innerX + innerW - costW - 10, cy + 9, costW, 26, 10, selected ? "#ffe08a" : "#f2ead4", "rgba(216,174,62,.28)");
        this.text(ctx, `基金-${facility.specializeCost || 0}`, innerX + innerW - 10 - costW / 2, cy + 27, 10, "#9b6817", "700", "center");
        const titleW = Math.max(42, innerW - 56 - costW - 28);
        const titleSize = this.fitTextSize(ctx, route.name, titleW, 14, 11, "700");
        this.text(ctx, route.name, innerX + 66, cy + 28, titleSize, "#1c3325", "700");
        this.text(ctx, `${facilityEffectText(route.effect || {})} · 路线+2`, innerX + 12, cy + 53, 12, "#1f7a52", "700");
        let noteLayout = null;
        if (selected) {
          noteLayout = this.drawFittedTextBlock(ctx, route.note, innerX + 12, cy + 74, innerW - 24, Math.max(20, cardH - 88), { size: 10, minSize: 10, lineHeight: 13, color: "#4b594e" });
          this.text(ctx, `${reserve.fund || 0}→${Math.max(0, (reserve.fund || 0) - (facility.specializeCost || 0))} · 永久生效`, innerX + innerW - 12, cy + cardH - 10, 10, "#b07a16", "700", "right");
        } else if (selectedId) {
          this.text(ctx, "点击替换专精 ›", innerX + innerW - 12, cy + cardH - 10, 10, "#7a857c", "700", "right");
        } else {
          this.text(ctx, "点击查看永久效果 ›", innerX + innerW - 12, cy + cardH - 10, 10, "#7a857c", "700", "right");
        }
        modal.renderedFacilityRouteLayout.push({ id: route.id, selected, x: innerX, y: cy, w: innerW, h: cardH, titleSize });
        if (noteLayout) modal.renderedFacilityRouteText.push({ id: route.id, field: "note", layout: noteLayout });
        this.addHit(innerX, cy, innerW, cardH, () => {
          this.selectFacilitySpecialization(facility.id, route.id);
        });
        routeY += cardH + gap;
      });
      return;
    }

    const specialization = facility.specialization || {};
    const route = ROUTE_KITS[specialization.id] || specialization;
    const cardY = bodyY + 84;
    const cardH = 162;
    const card = ctx.createLinearGradient(innerX, cardY, innerX + innerW, cardY + cardH);
    card.addColorStop(0, UI_THEME.ivory);
    card.addColorStop(1, "#e4e8df");
    this.roundRect(ctx, innerX, cardY + 5, innerW, cardH, 17, "rgba(18,61,52,.13)");
    this.roundRect(ctx, innerX, cardY, innerW, cardH, 17, card, route.color || "#4fa56e");
    this.roundRect(ctx, innerX + 14, cardY + 14, 66, 27, 10, route.color || "#4fa56e");
    this.text(ctx, `${route.short || "设施"}专精`, innerX + 47, cardY + 32, 10, "#fff8df", "700", "center");
    this.text(ctx, specialization.name || route.label || "永久设施", innerX + 92, cardY + 35, 18, "#1c3325", "700");
    const metricGap = 8;
    const metricW = (innerW - 36 - metricGap) / 2;
    [["永久收益", facilityEffectText(route.effect || {})], ["路线倾向", `${route.short || "设施"} +2`]].forEach((entry, index) => {
      const mx = innerX + 14 + index * (metricW + metricGap);
      this.roundRect(ctx, mx, cardY + 56, metricW, 58, 13, index ? "#dff2f8" : "#fff7d8", "rgba(46,135,110,.22)");
      this.text(ctx, entry[0], mx + metricW / 2, cardY + 75, 10, "#53655a", "700", "center");
      const valueSize = this.fitTextSize(ctx, entry[1], metricW - 12, 14, 11, "700");
      this.text(ctx, entry[1], mx + metricW / 2, cardY + 101, valueSize, index ? "#2f7c8f" : "#1f7a52", "700", "center");
    });
    const ownedNote = this.drawFittedTextBlock(ctx, specialization.note || facility.purpose, innerX + 16, cardY + 137, innerW - 32, 20, { size: 10, minSize: 10, lineHeight: 13, color: "#4b594e" });
    const ownedY = cardY + cardH + 10;
    this.roundRect(ctx, innerX, ownedY, innerW, Math.max(54, bodyY + bodyH - ownedY - 10), 13, "rgba(21,60,40,.10)", "rgba(31,122,82,.20)");
    this.text(ctx, "✓ 已建成 · 沙盘灯光与活动痕迹已保留", innerX + 14, ownedY + 28, 11, "#1f5a3f", "700");
    modal.renderedFacilityOwnedText = ownedNote;
  }

  drawCollectionInvestigationModalContent(ctx, modal, x, bodyY, w, bodyH) {
    const lead = modal.lead || {};
    const innerX = x + 26;
    const innerW = w - 52;
    this.roundRect(ctx, innerX, bodyY + 12, innerW, 62, 15, "rgba(255,250,236,.94)", "rgba(36,64,46,.14)");
    this.roundRect(ctx, innerX + 10, bodyY + 22, 42, 42, 14, "#fff2ac", "rgba(216,174,62,.45)");
    this.drawUiIcon(ctx, "trail", innerX + 31, bodyY + 43, 34, false)
      || this.drawSmallGlyph(ctx, "trail", innerX + 31, bodyY + 43, "#8b6f2a", .78);
    this.text(ctx, this.truncateTextToWidth(ctx, lead.title || "案件线索", innerW - 144, 12, "700"), innerX + 62, bodyY + 34, 12, "#1c3325", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, lead.clue || "线索仍待判断", innerW - 132, 10, "400"), innerX + 62, bodyY + 55, 10, "#59675e", "400");
    this.roundRect(ctx, innerX + innerW - 66, bodyY + 21, 54, 42, 13, "rgba(75,203,139,.16)", "rgba(43,143,113,.34)");
    this.text(ctx, "线索质量", innerX + innerW - 39, bodyY + 36, 9, "#47715e", "700", "center");
    this.text(ctx, `+${lead.quality || 0}`, innerX + innerW - 39, bodyY + 57, 17, "#1f7a52", "700", "center");

    const cardsY = bodyY + 84;
    const compact = bodyH < 380;
    const gap = compact ? 6 : 7;
    const methods = modal.methods || [];
    const selectedId = modal.selectedMethodId || "";
    const trust = Number((lead.animal || {}).trust == null ? ((lead.animal || {}).security || 0) : (lead.animal || {}).trust);
    const relationMod = trust >= 80 ? 2 : trust >= 55 ? 1 : 0;
    const values = {
      animal: { value: `关系 +${relationMod}`, cost: "不耗资源", note: `${(lead.animal || {}).name || "动物"}带路`, tone: "#42b989" },
      field: { value: "固定 +2", cost: "稳定路线", note: "现场勘验", tone: "#43b9d3" },
      risky: { value: "固定 +1", cost: "1–2点风险", note: "高点数补全", tone: "#f07868" }
    };
    modal.renderedMethodLayout = [];
    modal.renderedMethodText = [];
    let cardY = cardsY;
    methods.forEach((method, index) => {
      const selected = modal.selectedMethodId === method.id;
      const display = values[method.id] || { value: "+0", cost: method.cost || "无", note: "调查", tone: "#42b989" };
      const tileH = selected ? (compact ? 72 : 82) : (compact ? 54 : 62);
      this.roundRect(ctx, innerX, cardY + 4, innerW, tileH, 16, "rgba(18,61,52,.12)");
      const tileFill = ctx.createLinearGradient(innerX, cardY, innerX + innerW, cardY + tileH);
      tileFill.addColorStop(0, selected ? UI_THEME.ivory : "#f7f4ea");
      tileFill.addColorStop(1, selected ? "#e5eadf" : UI_THEME.parchment);
      this.roundRect(ctx, innerX, cardY, innerW, tileH, 16, tileFill, selected ? display.tone : "rgba(36,64,46,.16)");
      if (selected) this.roundRect(ctx, innerX + 3, cardY + 10, 5, tileH - 20, 3, display.tone);
      const iconSize = selected ? (compact ? 44 : 48) : (compact ? 36 : 40);
      const iconCX = innerX + 18 + iconSize / 2;
      const iconCY = cardY + tileH / 2;
      this.roundRect(ctx, iconCX - iconSize / 2 - 3, iconCY - iconSize / 2 + 3, iconSize + 6, iconSize + 6, 14, "rgba(18,61,52,.10)");
      this.roundRect(ctx, iconCX - iconSize / 2 - 3, iconCY - iconSize / 2, iconSize + 6, iconSize + 6, 14, selected ? "rgba(255,255,255,.88)" : "rgba(255,250,220,.90)", this.rgba(display.tone, .40));
      this.drawUiIcon(ctx, method.icon, iconCX, iconCY, iconSize, false)
        || this.drawSmallGlyph(ctx, method.icon, iconCX, iconCY, display.tone, .82);
      if (selected) {
        const checkX = iconCX + iconSize / 2 - 7;
        const checkY = iconCY - iconSize / 2 - 4;
        this.roundRect(ctx, checkX, checkY, 20, 20, 10, display.tone, "rgba(255,255,255,.86)");
        this.text(ctx, "✓", checkX + 10, checkY + 15, 11, "#ffffff", "700", "center");
      }

      const textX = iconCX + iconSize / 2 + 12;
      const rightW = compact ? 76 : 84;
      const rightX = innerX + innerW - rightW;
      this.text(ctx, method.name, textX, cardY + (selected ? 25 : 23), selected ? 13 : 12, "#1c3325", "700");
      const note = selected
        ? (modal.selectionChanged ? "当前选择 · 点击其他项可替换" : "默认选中 · 点击其他项可替换")
        : display.note;
      this.text(ctx, this.truncateTextToWidth(ctx, note, Math.max(50, rightX - textX - 8), 10, "700"), textX, cardY + (selected ? 48 : 43), 10, selected ? "#1f7a52" : "#66715f", "700");
      if (selected && !compact) {
        const basis = method.id === "animal" ? `信任 ${trust}` : method.id === "field" ? "稳定低风险" : "高点数补全";
        this.text(ctx, basis, textX, cardY + 68, 10, "#66715f", "700");
      }
      this.text(ctx, display.value, rightX + rightW / 2, cardY + (selected ? 42 : 26), selected ? 20 : 16, display.tone, "700", "center");
      const costW = Math.min(rightW - 6, Math.max(54, display.cost.length * 10 + 14));
      this.roundRect(ctx, rightX + (rightW - costW) / 2, cardY + tileH - 25, costW, 19, 9, method.id === "risky" ? "rgba(244,103,115,.11)" : "rgba(255,214,90,.18)", method.id === "risky" ? "rgba(244,103,115,.34)" : "rgba(180,143,51,.26)");
      this.text(ctx, display.cost, rightX + rightW / 2, cardY + tileH - 11, 10, method.id === "risky" ? "#c45b42" : "#7d692d", "700", "center");
      this.addHit(innerX, cardY, innerW, tileH, () => this.selectCollectionMethod(method.id));
      modal.renderedMethodLayout.push({ id: method.id, selected, x: innerX, y: cardY, w: innerW, h: tileH, iconSize, value: display.value, valueSize: selected ? 20 : 16, cost: display.cost, layout: "vertical", graphical: true });
      cardY += tileH + (index < methods.length - 1 ? gap : 0);
    });

    const selectedMethod = methods.find((method) => method.id === selectedId) || methods[0] || {};
    const selectedDisplay = values[selectedMethod.id] || { value: "+0", cost: selectedMethod.cost || "无", note: "调查", tone: "#42b989" };
    const detailY = cardY + 8;
    const detailH = Math.max(52, bodyY + bodyH - detailY - 10);
    this.roundRect(ctx, innerX, detailY + 3, innerW, detailH, 14, "rgba(18,61,52,.11)");
    this.roundRect(ctx, innerX, detailY, innerW, detailH, 14, "rgba(24,93,77,.92)", "rgba(255,255,255,.30)");
    this.text(ctx, "骰前修正", innerX + 14, detailY + 19, 10, "#f0d376", "700");
    const methodMod = selectedMethod.id === "field" ? 2 : selectedMethod.id === "risky" ? 1 : 0;
    const selectedRelationMod = selectedMethod.id === "animal" ? relationMod : 0;
    const preRoll = (lead.quality || 0) + methodMod + selectedRelationMod;
    const formula = `线索 +${lead.quality || 0} + ${selectedMethod.id === "animal" ? `关系 +${selectedRelationMod}` : `方法 +${methodMod}`} = +${preRoll}`;
    this.text(ctx, formula, innerX + innerW - 14, detailY + 21, 13, "#fff8df", "700", "right");
    const selectedExplanation = selectedMethod.id === "animal"
      ? `信任 ${trust}：达到55/80时，关系修正为 +1/+2。`
      : selectedMethod.id === "field"
        ? "现场勘验固定 +2，失败风险最低，但没有动物关系加成。"
        : "固定 +1；骰面1–2扩大风险，5–6补全故事。";
    const detailLayout = this.drawFittedTextBlock(ctx, selectedExplanation, innerX + 14, detailY + 42, innerW - 28, Math.max(14, detailH - 46), {
      size: 10, minSize: 10, lineHeight: 14, color: "#d9dfce"
    });
    modal.renderedMethodText.push({ id: selectedMethod.id, field: "selectedExplanation", layout: detailLayout });
    modal.renderedCollectionInvestigation = { graphicalTiles: methods.length, selectedId, leadQualitySize: 17, primaryValueSize: 20, detailH, layout: "vertical", preRoll };
  }

  drawCollectionDiceModalContent(ctx, modal, x, bodyY, w, bodyH) {
    const lead = modal.lead || {};
    const method = modal.method || {};
    const trust = (lead.animal || {}).trust || 0;
    const methodMod = method.id === "field" ? 2 : method.id === "risky" ? 1 : 0;
    const relationMod = method.id === "animal" ? (trust >= 80 ? 2 : trust >= 55 ? 1 : 0) : 0;
    const innerX = x + 28;
    const innerW = w - 56;
    const factorW = (innerW - 18) / 4;
    modal.renderedDiceFactors = [];
    [
      ["线索", `+${lead.quality || 0}`], ["方法", `+${methodMod}`], ["关系", `+${relationMod}`], ["六面骰", modal.phase === "ready" ? "?" : `${modal.displayRoll || 1}`]
    ].forEach((factor, index) => {
      const fx = innerX + index * (factorW + 6);
      this.roundRect(ctx, fx, bodyY + 14, factorW, 50, 8, index === 3 ? "rgba(240,211,118,.26)" : "rgba(36,64,46,.08)", "rgba(36,64,46,.14)");
      this.text(ctx, factor[0], fx + factorW / 2, bodyY + 31, 9, "#66715f", "700", "center");
      this.text(ctx, factor[1], fx + factorW / 2, bodyY + 54, 17, index === 3 ? "#b07a16" : "#1f5a3f", "700", "center");
      modal.renderedDiceFactors.push({ label: factor[0], value: factor[1], x: fx, y: bodyY + 14, w: factorW, h: 50, labelSize: 9, valueSize: 17 });
    });
    this.roundRect(ctx, innerX, bodyY + 74, innerW, 34, 8, "rgba(255,250,236,.82)", "rgba(139,111,42,.15)");
    this.text(ctx, `引路动物 · ${(lead.animal || {}).name || "附近动物"}`, innerX + 12, bodyY + 96, 10, "#26352b", "700");
    this.text(ctx, `失败保底 ${((this.state.world.collection || {}).investigation || {}).failedAttempts || 0}/3`, innerX + innerW - 12, bodyY + 96, 9, "#8b6f2a", "700", "right");
    const dieSize = Math.max(78, Math.min(112, bodyH - 190));
    const dieX = x + (w - dieSize) / 2;
    const dieY = bodyY + 124;
    this.drawSixSidedDie(ctx, dieX, dieY, dieSize, modal.phase === "ready" ? 1 : (modal.displayRoll || 1), modal.phase === "rolling", modal.phase === "ready");
    this.addHit(dieX - 18, dieY - 18, dieSize + 36, dieSize + 36, () => { if (modal.phase !== "rolling" && modal.action) modal.action(); }, "none");
    const formulaY = Math.min(bodyY + bodyH - 34, dieY + dieSize + 28);
    const rollText = modal.phase === "ready" ? "?" : `${modal.displayRoll || 1}`;
    const total = modal.phase === "ready" ? "?" : (modal.displayRoll || 1) + (lead.quality || 0) + methodMod + relationMod;
    this.text(ctx, `骰面${rollText} + 线索${lead.quality || 0} + 方法${methodMod} + 关系${relationMod} = ${total}`, x + w / 2, formulaY, 12, "#1c3325", "700", "center");
    this.text(ctx, modal.phase === "rolling" ? "骰子滚动中…" : "总点数5+形成发现，8+优先珍藏", x + w / 2, formulaY + 18, 10, "#755f45", "700", "center");
  }

  drawCollectionEndingModalContent(ctx, modal, x, bodyY, w, bodyH) {
    const innerX = x + 26;
    const innerW = w - 52;
    const selectedId = modal.selectedChoiceId || "";
    this.roundRect(ctx, innerX, bodyY + 12, innerW, 52, 8, "#fff7df", "rgba(216,174,62,.25)");
    this.text(ctx, "前7件调查物已经互相印证", innerX + 12, bodyY + 30, 10, "#8b6f2a", "700");
    this.drawFittedTextBlock(ctx, (modal.caseDef || {}).intro || "真相等待你的选择。", innerX + 12, bodyY + 48, innerW - 24, 20, {
      size: 10, minSize: 10, lineHeight: 13, color: "#3f5044"
    });
    const cardsY = bodyY + 72;
    const gap = 5;
    const choices = modal.endingChoices || [];
    const availableH = bodyH - 84;
    const naturalH = Math.max(72, Math.floor((availableH - gap * Math.max(0, choices.length - 1)) / Math.max(1, choices.length)));
    const collapsedMin = 48;
    const maxExpandedH = availableH - collapsedMin * Math.max(0, choices.length - 1) - gap * Math.max(0, choices.length - 1);
    const expandedH = selectedId ? Math.max(88, Math.min(188, maxExpandedH)) : naturalH;
    const collapsedH = selectedId && choices.length > 1
      ? Math.max(collapsedMin, Math.floor((availableH - expandedH - gap * (choices.length - 1)) / (choices.length - 1)))
      : naturalH;
    let choiceY = cardsY;
    modal.renderedChoiceLayout = [];
    modal.renderedChoiceText = [];
    choices.forEach((choice) => {
      const cy = choiceY;
      const selected = modal.selectedChoiceId === choice.id;
      const cardH = selectedId ? (selected ? expandedH : collapsedH) : naturalH;
      modal.renderedChoiceLayout.push({ id: choice.id, selected, x: innerX, y: cy, w: innerW, h: cardH });
      const route = STRATEGY_ROUTES[choice.route] || STRATEGY_ROUTES.balanced;
      this.roundRect(ctx, innerX, cy, innerW, cardH, 9, selected ? "#edf5e6" : "#fffaf0", selected ? route.color : "rgba(36,64,46,.14)");
      this.roundRect(ctx, innerX + 10, cy + 9, 44, 18, 6, route.color);
      this.text(ctx, selected ? `✓${route.shortLabel}` : route.shortLabel, innerX + 32, cy + 22, 9, "#fff8df", "700", "center");
      this.text(ctx, this.truncateTextToWidth(ctx, choice.name, innerW - 82, 12, "700"), innerX + 62, cy + 23, 12, "#1c3325", "700");
      const effectLabels = {
        safety: "动物安全感", stability: "生态稳定", reputation: "共护关系", enforcement: "边界控制",
        poacherPressure: "偷猎", business: "协作效率", water: "水源", grass: "草场",
        disease: "疾病", migrationDelta: "迁徙"
      };
      const effects = Object.keys(choice.effects || {}).filter((key) => key !== "intel").map((key) => {
        const value = choice.effects[key];
        if (key === "fund") {
          const units = Math.max(1, Math.ceil(Math.abs(value) / 100));
          return value > 0 ? `待收研究样本+${units}` : `巡护补给-${units}`;
        }
        return `${effectLabels[key] || key}${this.signed(value)}`;
      }).join(" · ");
      if (!selectedId || selected) {
        const effectLayout = this.drawFittedTextBlock(ctx, `结算 · ${effects}`, innerX + 10, cy + 42, innerW - 20, selected ? 28 : Math.max(22, cardH - 46), {
          size: 10, minSize: 10, lineHeight: 13,
          maxLines: 2, color: choice.route === "enforcement" ? "#a94b3b" : "#1f7a52", weight: "700"
        });
        modal.renderedChoiceText.push({ id: choice.id, field: "effects", layout: effectLayout });
        if (selected) {
          const outcomeLayout = this.drawFittedTextBlock(ctx, `后果 · ${choice.outcome}`, innerX + 10, cy + 72, innerW - 20, Math.max(24, cardH - 78), {
            size: 10, minSize: 9, lineHeight: 13, maxLines: 3, color: "#425448"
          });
          modal.renderedChoiceText.push({ id: choice.id, field: "outcome", layout: outcomeLayout });
        } else {
          this.text(ctx, "点击查看完整后果  ›", innerX + innerW - 10, cy + cardH - 10, 9, "#7a857c", "700", "right");
        }
      } else {
        this.text(ctx, "点击替换结局  ›", innerX + innerW - 10, cy + cardH - 10, 9, "#7a857c", "700", "right");
      }
      this.addHit(innerX, cy, innerW, cardH, () => this.selectCollectionEnding(choice.id));
      choiceY += cardH + gap;
    });
  }

  strategicChoicePrimarySummary(effects = {}, consequence = {}, shortfall = {}, risk = "safe") {
    const labels = {
      fund: "巡护补给", safety: "动物安全感", stability: "生态稳定", reputation: "共护关系", enforcement: "边界控制",
      poacherPressure: "偷猎", intel: "调查记录", business: "协作效率", water: "水源", grass: "草场",
      disease: "疾病", migrationDelta: "迁移"
    };
    const scales = {
      fund: 90, safety: 4, stability: 3, reputation: 3, enforcement: 4, poacherPressure: 4,
      intel: 1, business: 3, water: 4, grass: 4, disease: 4, migrationDelta: 2
    };
    const entries = Object.keys(effects || {}).filter((key) => key !== "intel").map((key, index) => {
      const value = Number(effects[key]) || 0;
      const inverse = key === "poacherPressure" || key === "disease";
      const benefit = inverse ? value < 0 : value > 0;
      return {
        key,
        value,
        benefit,
        score: Math.abs(value) / (scales[key] || 1) + (index * .0001),
        text: key === "fund"
          ? (value > 0 ? `待收研究样本 +${Math.max(1, Math.ceil(value / 100))}` : `巡护补给 -${Math.max(1, Math.ceil(Math.abs(value) / 100))}`)
          : `${labels[key] || key} ${value > 0 ? "+" : ""}${value}`
      };
    }).filter((entry) => entry.value !== 0);
    const pick = (benefit) => entries.filter((entry) => entry.benefit === benefit).sort((a, b) => b.score - a.score)[0];
    const benefit = pick(true);
    let cost = pick(false);
    if (!cost && consequence && consequence.modifiers) {
      const ongoing = Object.keys(consequence.modifiers).map((key) => ({ [key]: consequence.modifiers[key] }));
      for (let index = 0; index < ongoing.length && !cost; index += 1) {
        const summary = this.strategicChoicePrimarySummary(ongoing[index], {}, {}, risk);
        if (summary.cost && summary.cost !== "持续影响") cost = { text: summary.cost };
      }
    }
    const shortfallCost = (shortfall.fund || shortfall.intel)
      ? `资源不足 · 稳定-${shortfall.stabilityPenalty || 0}`
      : "";
    return {
      benefit: benefit ? benefit.text : "长期稳定",
      cost: shortfallCost || (cost ? cost.text : (risk === "risky" ? "失败会放大代价" : "持续影响"))
    };
  }

  drawStrategicSummaryChip(ctx, x, y, w, label, value, positive) {
    const fill = "rgba(35,88,65,.055)";
    const stroke = "rgba(35,88,65,.16)";
    const color = positive ? "#2f765c" : "#8a6936";
    this.roundRect(ctx, x, y, w, 27, 9, fill, stroke);
    this.text(ctx, label, x + 8, y + 11, 9, color, "700");
    const rendered = this.truncateTextToWidth(ctx, value, w - 16, 11, "700");
    this.text(ctx, rendered, x + 8, y + 23, 11, "#1c3325", "700");
    return { label, value, rendered, truncated: rendered !== value, labelSize: 9, valueSize: 11 };
  }

  drawStrategicDetailRow(ctx, x, y, w, h, label, value, positive) {
    const fill = "rgba(35,88,65,.055)";
    const stroke = "rgba(35,88,65,.16)";
    const badgeFill = positive ? "#3a8267" : "#98733a";
    this.roundRect(ctx, x, y, w, h, 8, fill, stroke);
    this.roundRect(ctx, x + 6, y + 6, 42, Math.max(16, h - 12), 6, badgeFill);
    this.text(ctx, label, x + 27, y + Math.round(h / 2) + 4, 9, "#ffffff", "700", "center");
    return this.drawFittedTextBlock(ctx, value, x + 56, y + 16, w - 64, h - 8, {
      size: 10,
      minSize: 10,
      lineHeight: 13,
      color: "#1c3325",
      weight: "700"
    });
  }

  drawGuardianPromiseModalContent(ctx, modal, x, bodyY, w, bodyH) {
    const promise = modal.dilemma || modal.promise || {};
    const cards = modal.choiceCards || [];
    const selectedId = modal.selectedChoiceId || "";
    const innerX = x + 26;
    const innerW = w - 52;
    const storyH = 40;
    const gap = 6;

    this.roundRect(ctx, innerX, bodyY + 12, innerW, storyH, 10, "rgba(255,250,236,0.84)", "rgba(36,64,46,0.12)");
    this.roundRect(ctx, innerX + 10, bodyY + 25, 7, 7, 4, "#2f765c");
    const storyLayout = this.drawFittedTextBlock(ctx, promise.story || "选择一条守护原则。", innerX + 24, bodyY + 36, innerW - 34, 16, {
      size: 11,
      minSize: 10,
      lineHeight: 14,
      color: "#425448",
      weight: "700"
    });

    const cardsY = bodyY + storyH + 20;
    const availableH = Math.max(0, bodyH - storyH - 28);
    const collapsedH = 48;
    const overviewH = Math.min(70, Math.floor((availableH - gap * Math.max(0, cards.length - 1)) / Math.max(1, cards.length)));
    const expandedH = Math.max(146, availableH - collapsedH * Math.max(0, cards.length - 1) - gap * Math.max(0, cards.length - 1));
    let cy = cardsY;

    modal.renderedPromiseMode = selectedId ? "focused" : "overview";
    modal.renderedPromiseStory = storyLayout;
    modal.renderedChoiceLayout = [];
    modal.renderedChoiceText = [];
    modal.renderedChoiceSummaries = [];

    cards.forEach((card) => {
      const selected = selectedId === card.id;
      const collapsed = !!selectedId && !selected;
      const cardH = selected ? expandedH : (collapsed ? collapsedH : overviewH);
      const route = STRATEGY_ROUTES[card.route] || STRATEGY_ROUTES.balanced;
      const riskLabel = card.risk === "risky" ? "高风险·掷骰" : card.risk === "balanced" ? "折中" : "稳妥";
      const layout = { id: card.id, selected, collapsed, x: innerX, y: cy, w: innerW, h: cardH, routeSize: 9, riskSize: 9 };
      modal.renderedChoiceLayout.push(layout);

      this.roundRect(ctx, innerX, cy + 3, innerW, cardH, 10, "rgba(20,16,8,0.10)");
      this.roundRect(ctx, innerX, cy, innerW, cardH, 10, selected ? "rgba(237,244,232,0.99)" : "rgba(255,250,236,0.96)", selected ? "#2f765c" : "rgba(36,64,46,0.14)");
      this.roundRect(ctx, innerX + 9, cy + 9, 44, 18, 6, "rgba(47,118,92,.12)", "rgba(47,118,92,.25)");
      this.text(ctx, route.shortLabel, innerX + 31, cy + 22, 9, "#2f765c", "700", "center");

      if (collapsed) {
        const labelW = innerW - 84;
        const labelSize = this.fitTextSize(ctx, card.label, labelW, 12, 10, "700");
        layout.labelSize = labelSize;
        this.text(ctx, this.truncateTextToWidth(ctx, card.label, labelW, labelSize, "700"), innerX + 62, cy + 23, labelSize, "#1c3325", "700");
        this.text(ctx, "›", innerX + innerW - 15, cy + 28, 18, "#2f765c", "700", "center");
      } else {
        const labelW = innerW - 138;
        const labelSize = this.fitTextSize(ctx, card.label, labelW, 12, 10, "700");
        layout.labelSize = labelSize;
        this.text(ctx, this.truncateTextToWidth(ctx, card.label, labelW, labelSize, "700"), innerX + 62, cy + 23, labelSize, "#1c3325", "700");
        this.text(ctx, riskLabel, innerX + innerW - 10, cy + 22, 9, card.risk === "risky" ? "#98733a" : "#788078", "700", "right");

        if (selected) {
          const rowH = 27;
          const benefitLayout = this.drawStrategicDetailRow(ctx, innerX + 9, cy + 34, innerW - 18, rowH, "收益", card.primaryBenefit || "长期稳定", true);
          const costLayout = this.drawStrategicDetailRow(ctx, innerX + 9, cy + 65, innerW - 18, rowH, "代价", card.primaryCost || "持续影响", false);
          const permanentH = Math.max(24, cardH - 101);
          const permanentLayout = this.drawFittedTextBlock(ctx, `持续  ${card.consequenceText || "长期生效"}`, innerX + 12, cy + 105, innerW - 38, permanentH, {
            size: 10,
            minSize: 9,
            lineHeight: 13,
            color: "#425448",
            weight: "700"
          });
          modal.renderedChoiceText.push({ id: card.id, field: "benefit", layout: benefitLayout });
          modal.renderedChoiceText.push({ id: card.id, field: "cost", layout: costLayout });
          modal.renderedChoiceText.push({ id: card.id, field: "permanent", layout: permanentLayout });
          this.roundRect(ctx, innerX + innerW - 30, cy + cardH - 22, 22, 16, 6, "#2f765c");
          this.text(ctx, "✓", innerX + innerW - 19, cy + cardH - 10, 10, "#fff8df", "700", "center");
        } else {
          const coreText = card.primaryBenefit || "长期稳定";
          this.roundRect(ctx, innerX + 10, cy + 39, 7, 7, 4, "#2f765c");
          const coreW = innerW - 52;
          const coreSize = this.fitTextSize(ctx, coreText, coreW, 11, 10, "700");
          const renderedCore = this.truncateTextToWidth(ctx, coreText, coreW, coreSize, "700");
          this.text(ctx, renderedCore, innerX + 24, cy + 49, coreSize, "#286b4e", "700");
          this.text(ctx, "›", innerX + innerW - 15, cy + 53, 18, "#2f765c", "700", "center");
          modal.renderedChoiceSummaries.push({ id: card.id, core: coreText, rendered: renderedCore, truncated: renderedCore !== coreText, costVisible: false });
        }
      }

      this.addHit(innerX, cy, innerW, cardH, () => this.selectGuardianPromise(modal.promise.chapter, card.id));
      cy += cardH + gap;
    });
  }

  drawStrategicDilemmaModalContent(ctx, modal, x, bodyY, w, bodyH) {
    if (modal.kind === "guardianPromise") {
      this.drawGuardianPromiseModalContent(ctx, modal, x, bodyY, w, bodyH);
      return;
    }
    const dilemma = modal.dilemma || {};
    const cards = modal.choiceCards || [];
    const innerX = x + 26;
    const innerW = w - 52;
    const selectedId = modal.selectedChoiceId || "";
    const storyH = cards.length >= 3 ? 46 : 50;
    this.roundRect(ctx, innerX, bodyY + 12, innerW, storyH, 8, "rgba(255,250,236,0.82)", "rgba(36,64,46,0.12)");
    const isPromise = false;
    this.text(ctx, dilemma.tier === "major" ? "重大选择" : "现场选择", innerX + 12, bodyY + 29, 9, "#98733a", "700");
    if (modal.namedIndividual) {
      const friend = modal.namedIndividual;
      this.text(ctx, `${friend.name}会记住这次选择`, innerX + innerW - 12, bodyY + 29, 9, "#66736a", "700", "right");
    }
    this.drawFittedTextBlock(ctx, dilemma.story || "保护区需要你做出选择。", innerX + 12, bodyY + 46, innerW - 24, storyH - 22, {
      size: 10, minSize: 10, lineHeight: 13, color: "#4b594e"
    });
    const gap = 5;
    const cardsY = bodyY + 18 + storyH;
    const availableH = bodyH - storyH - 30;
    const naturalH = Math.max(66, Math.floor((availableH - gap * Math.max(0, cards.length - 1)) / Math.max(1, cards.length)));
    const collapsedMin = 48;
    const maxExpandedH = availableH - collapsedMin * Math.max(0, cards.length - 1) - gap * Math.max(0, cards.length - 1);
    const expandedH = selectedId ? Math.max(116, Math.min(cards.length >= 3 ? 130 : 142, maxExpandedH)) : naturalH;
    const collapsedH = selectedId ? collapsedMin : naturalH;
    let cy = cardsY;
    modal.renderedChoiceLayout = [];
    modal.renderedChoiceText = [];
    modal.renderedChoiceSummaries = [];
    cards.forEach((card, index) => {
      const selected = modal.selectedChoiceId === card.id;
      const cardH = selectedId ? (selected ? expandedH : collapsedH) : naturalH;
      const renderedLayout = { id: card.id, selected, x: innerX, y: cy, w: innerW, h: cardH, routeSize: 9, riskSize: 9 };
      modal.renderedChoiceLayout.push(renderedLayout);
      const route = STRATEGY_ROUTES[card.route] || STRATEGY_ROUTES.balanced;
      this.roundRect(ctx, innerX, cy + 3, innerW, cardH, 9, "rgba(20,16,8,0.10)");
      this.roundRect(ctx, innerX, cy, innerW, cardH, 9, selected ? "rgba(237,244,232,0.98)" : "rgba(255,250,236,0.94)", selected ? "#2f765c" : "rgba(36,64,46,0.14)");
      this.roundRect(ctx, innerX + 8, cy + 8, 48, 17, 6, "rgba(47,118,92,.12)", "rgba(47,118,92,.25)");
      this.text(ctx, card.chainAligned ? `${route.shortLabel}·续` : route.shortLabel, innerX + 32, cy + 20, 9, "#2f765c", "700", "center");
      const riskLabel = card.risk === "risky" ? "高风险·掷骰" : card.risk === "balanced" ? "折中" : "稳妥";
      this.text(ctx, riskLabel, innerX + innerW - 10, cy + 20, 9, card.risk === "risky" ? "#98733a" : "#788078", "700", "right");
      const labelW = innerW - 126;
      const labelSize = this.fitTextSize(ctx, card.label, labelW, 12, 10, "700");
      renderedLayout.labelSize = labelSize;
      this.text(ctx, this.truncateTextToWidth(ctx, card.label, labelW, labelSize, "700"), innerX + 64, cy + 21, labelSize, "#1c3325", "700");
      if (selected) {
        const rowH = 28;
        const benefitLayout = this.drawStrategicDetailRow(ctx, innerX + 9, cy + 31, innerW - 18, rowH, "收益", card.primaryBenefit || "长期稳定", true);
        const costLayout = this.drawStrategicDetailRow(ctx, innerX + 9, cy + 63, innerW - 18, rowH, "代价", card.primaryCost || "持续影响", false);
        modal.renderedChoiceText.push({ id: card.id, field: "benefit", layout: benefitLayout });
        modal.renderedChoiceText.push({ id: card.id, field: "cost", layout: costLayout });
        const durationLayout = this.drawFittedTextBlock(ctx, `持续  ${card.consequenceText || "长期生效"}`, innerX + 12, cy + 108, innerW - 44, Math.max(18, cardH - 102), {
          size: 10,
          minSize: 10,
          lineHeight: 13,
          color: "#56665c",
          weight: "700"
        });
        modal.renderedChoiceText.push({ id: card.id, field: "duration", layout: durationLayout });
      } else if (selectedId) {
        this.text(ctx, "点击替换方案  ›", innerX + innerW - 10, cy + cardH - 10, 9, "#7a857c", "700", "right");
      } else {
        const benefitSummary = this.drawStrategicSummaryChip(ctx, innerX + 9, cy + 29, innerW - 18, "获得", card.primaryBenefit || "长期稳定", true);
        const costSummary = this.drawStrategicSummaryChip(ctx, innerX + 9, cy + 57, innerW - 18, "代价", card.primaryCost || "持续影响", false);
        modal.renderedChoiceSummaries.push({ id: card.id, benefit: benefitSummary, cost: costSummary });
      }
      if (selected) {
        this.roundRect(ctx, innerX + innerW - 30, cy + cardH - 22, 22, 16, 6, "#2f765c");
        this.text(ctx, "✓", innerX + innerW - 19, cy + cardH - 10, 10, "#fff8df", "700", "center");
      }
      this.addHit(innerX, cy, innerW, cardH, () => {
        if (isPromise) this.selectGuardianPromise(modal.promise.chapter, card.id);
        else this.selectStrategicDilemmaChoice(dilemma.id, card.id);
      });
      cy += cardH + gap;
    });
  }

  drawStrategicDiceModalContent(ctx, modal, x, bodyY, w, bodyH) {
    const preview = modal.dicePreview || {};
    const innerX = x + 28;
    const innerW = w - 56;
    const factorW = (innerW - 12) / 3;
    const factors = [
      { label: "路线修正", value: `+${preview.routeModifier || 0}` },
      { label: "资源修正", value: `+${preview.resourceModifier || 0}` },
      { label: "六面骰", value: modal.phase === "ready" ? "?" : `${modal.displayRoll || 1}` }
    ];
    modal.renderedDiceFactors = [];
    factors.forEach((factor, index) => {
      const fx = innerX + index * (factorW + 6);
      this.roundRect(ctx, fx, bodyY + 14, factorW, 50, 8, index === 2 ? "rgba(240,211,118,0.25)" : "rgba(36,64,46,0.08)", "rgba(36,64,46,0.14)");
      this.text(ctx, factor.label, fx + factorW / 2, bodyY + 31, 10, "#66715f", "700", "center");
      this.text(ctx, factor.value, fx + factorW / 2, bodyY + 54, 18, index === 2 ? "#b07a16" : "#1f5a3f", "700", "center");
      modal.renderedDiceFactors.push({ label: factor.label, value: factor.value, x: fx, y: bodyY + 14, w: factorW, h: 50, labelSize: 10, valueSize: 18 });
    });
    this.roundRect(ctx, innerX, bodyY + 74, innerW, 34, 8, "rgba(255,250,236,0.82)", "rgba(139,111,42,0.15)");
    this.text(ctx, "成功目标", innerX + 12, bodyY + 95, 9, "#c45b42", "700");
    const riskTarget = `${preview.threshold || 5}点${modal.namedIndividual ? ` · ${modal.namedIndividual.name}` : ""}`;
    this.text(ctx, this.truncateTextToWidth(ctx, riskTarget, innerW - 88, 11, "700"), innerX + innerW - 12, bodyY + 96, 11, "#26352b", "700", "right");
    const dieSize = Math.max(78, Math.min(112, bodyH - 190));
    const dieX = x + (w - dieSize) / 2;
    const dieY = bodyY + 124;
    this.drawSixSidedDie(ctx, dieX, dieY, dieSize, modal.phase === "ready" ? 1 : (modal.displayRoll || 1), modal.phase === "rolling", modal.phase === "ready");
    this.addHit(dieX - 12, dieY - 12, dieSize + 24, dieSize + 24, () => {
      if (modal.phase !== "rolling" && modal.action) modal.action();
    }, "none");
    const formulaY = Math.min(bodyY + bodyH - 36, dieY + dieSize + 28);
    const rollText = modal.phase === "ready" ? "?" : `${modal.displayRoll || 1}`;
    const total = modal.phase === "ready" ? "?" : (modal.displayRoll || 1) + (preview.routeModifier || 0) + (preview.resourceModifier || 0);
    this.text(ctx, `骰面 ${rollText} + 路线 ${preview.routeModifier || 0} + 资源 ${preview.resourceModifier || 0} = ${total}`, x + w / 2, formulaY, 13, "#1c3325", "700", "center");
    this.text(ctx, modal.phase === "rolling" ? "骰子滚动中…" : `总点数达到 ${preview.threshold || 5}，高风险方案完整成功`, x + w / 2, formulaY + 18, 10, "#755f45", "700", "center");
  }

  drawMaterialExplorationModalContent(ctx, modal, x, bodyY, w, bodyH) {
    const preview = modal.preview || {};
    const innerX = x + 28;
    const innerW = w - 56;
    const factorGap = 6;
    const factorW = (innerW - factorGap * 2) / 3;
    const factors = [
      { label: "等级修正", value: `+${preview.levelContribution || 0}`, note: `Lv.${preview.level || 1}` },
      { label: "关系修正", value: `+${preview.relationshipContribution || 0}`, note: `安全${(preview.relationship || {}).securityAverage || 0}/野性${(preview.relationship || {}).wildnessAverage || 0}` },
      { label: "六面骰", value: modal.phase === "ready" ? "?" : `${modal.displayRoll || 1}`, note: "1—6点" }
    ];
    modal.renderedDiceFactors = [];
    factors.forEach((factor, index) => {
      const fx = innerX + index * (factorW + factorGap);
      this.roundRect(ctx, fx, bodyY + 14, factorW, 54, 8, index === 2 ? "rgba(240,211,118,0.24)" : "rgba(36,64,46,0.08)", "rgba(36,64,46,0.14)");
      this.text(ctx, factor.label, fx + factorW / 2, bodyY + 30, 9, "#66715f", "700", "center");
      this.text(ctx, factor.value, fx + factorW / 2, bodyY + 52, 18, index === 2 ? "#b07a16" : "#1f5a3f", "700", "center");
      this.text(ctx, factor.note, fx + factorW / 2, bodyY + 64, 9, "#8b7355", "700", "center");
      modal.renderedDiceFactors.push({ label: factor.label, value: factor.value, note: factor.note, x: fx, y: bodyY + 14, w: factorW, h: 54, labelSize: 9, valueSize: 18, noteSize: 9 });
    });

    const target = modal.target || null;
    this.roundRect(ctx, innerX, bodyY + 76, innerW, 34, 8, "rgba(255,250,236,0.78)", "rgba(139,111,42,0.15)");
    this.text(ctx, "探索目标", innerX + 12, bodyY + 97, 9, "#8b6f2a", "700");
    this.text(ctx, target ? "定向追踪" : "随机发现", innerX + innerW - 12, bodyY + 98, 12, "#26352b", "700", "right");

    const dieSize = Math.max(76, Math.min(112, bodyH - 190));
    const dieX = x + (w - dieSize) / 2;
    const dieY = bodyY + 124;
    const face = modal.phase === "ready" ? 1 : (modal.displayRoll || 1);
    this.drawSixSidedDie(ctx, dieX, dieY, dieSize, face, modal.phase === "rolling", modal.phase === "ready");
    this.addHit(dieX - 12, dieY - 12, dieSize + 24, dieSize + 24, () => {
      if (modal.phase !== "rolling" && modal.action) modal.action();
    }, "none");

    const formulaY = Math.min(bodyY + bodyH - 34, dieY + dieSize + 30);
    const dieText = modal.phase === "ready" ? "骰子 ?" : `骰子 ${modal.displayRoll || 1}`;
    const total = modal.phase === "ready" ? "?" : (modal.displayRoll || 1) + (preview.levelContribution || 0) + (preview.relationshipContribution || 0);
    this.text(ctx, `${dieText} + 等级 ${preview.levelContribution || 0} + 关系 ${preview.relationshipContribution || 0} = ${total}`, x + w / 2, formulaY, 13, "#1c3325", "700", "center");
    this.text(ctx, modal.phase === "rolling" ? "骰子滚动中…" : `总点数达到 ${preview.requiredScore || 5} 即有收集结果 · 当前需掷 ${preview.requiredRoll || 1}+`, x + w / 2, formulaY + 18, 10, "#755f45", "700", "center");
  }

  drawSixSidedDie(ctx, x, y, size, face, rolling = false, hidden = false) {
    if (hidden) {
      const pulse = .18 + (Math.sin(this.animT() * .005) + 1) * .09;
      this.roundRect(ctx, x - 7, y - 7, size + 14, size + 14, 20, `rgba(231,199,109,${pulse})`, "rgba(176,122,22,.42)");
    }
    const shadow = rolling ? 8 : 5;
    this.roundRect(ctx, x, y + shadow, size, size, 16, "rgba(20,16,8,0.24)");
    const gradient = ctx.createLinearGradient(x, y, x, y + size);
    gradient.addColorStop(0, "#fffdf4");
    gradient.addColorStop(1, rolling ? "#f0d376" : "#eee3c4");
    this.roundRect(ctx, x, y, size, size, 16, gradient, rolling ? "#d29b26" : "rgba(36,64,46,0.30)");
    if (hidden) {
      this.text(ctx, "?", x + size / 2, y + size * 0.46, Math.round(size * 0.32), "#1c3325", "700", "center");
      const cueX = x + 8;
      const cueY = y + size - 34;
      this.roundRect(ctx, cueX, cueY, size - 16, 26, 10, "#1c3325", "rgba(231,199,109,.62)");
      this.text(ctx, "点击掷骰", x + size / 2, cueY + 18, size < 90 ? 9 : 10, "#fff8df", "700", "center");
      return;
    }
    const inset = size * 0.27;
    const center = size / 2;
    const positions = {
      tl: [x + inset, y + inset], tc: [x + center, y + inset], tr: [x + size - inset, y + inset],
      ml: [x + inset, y + center], mc: [x + center, y + center], mr: [x + size - inset, y + center],
      bl: [x + inset, y + size - inset], bc: [x + center, y + size - inset], br: [x + size - inset, y + size - inset]
    };
    const patterns = {
      1: ["mc"], 2: ["tl", "br"], 3: ["tl", "mc", "br"],
      4: ["tl", "tr", "bl", "br"], 5: ["tl", "tr", "mc", "bl", "br"],
      6: ["tl", "ml", "bl", "tr", "mr", "br"]
    };
    ctx.fillStyle = "#173b2a";
    (patterns[Math.max(1, Math.min(6, face))] || patterns[1]).forEach((key) => {
      const point = positions[key];
      ctx.beginPath();
      ctx.arc(point[0], point[1], Math.max(4, size * 0.065), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawSpeciesProfileModalContent(ctx, modal, x, bodyY, w, bodyH) {
    const profile = modal.profile || {};
    const sp = profile.species || {};
    const reserve = (this.state.world || {}).reserve || {};
    const populationKey = `species:${sp.id || ""}`;
    const pop = profile.population || 0;
    const status = profile.status || { trend: "→", status: "稳定" };
    const importance = profile.importance || { level: "稳定", score: 50 };
    const compact = bodyH < 350;
    const panelX = x + 26;
    const panelW = w - 52;
    const innerX = panelX + 12;
    const innerW = panelW - 24;
    const gap = compact ? 6 : 8;
    const summaryH = compact ? 46 : 52;
    const feedbackH = compact ? 48 : 56;
    const friendH = compact ? 50 : 58;
    const recentDialogues = (Array.isArray(profile.dialogues) ? profile.dialogues : [profile.dialogue])
      .filter(Boolean)
      .slice(0, 5);
    const dialoguesExpanded = !!modal.dialoguesExpanded;
    const dialogueH = dialoguesExpanded ? (compact ? 92 : 104) : (compact ? 48 : 52);
    const attitudeH = Math.max(38, bodyH - 20 - summaryH - feedbackH - friendH - dialogueH - gap * 4);
    let cy = bodyY + 10;

    this.roundRect(ctx, panelX, cy, panelW, summaryH, 9, "rgba(255,250,236,0.84)", "rgba(36,64,46,0.10)");
    const trendColor = status.trend === "↑" ? "#1f8a55" : status.trend === "↓" ? "#c44735" : status.trend === "⚠" ? "#d28718" : "#8b7355";
    this.text(ctx, "种群", innerX, cy + 16, 10, "#8b7355", "700");
    this.text(ctx, `${this.displayReserveNumber(populationKey, pop)}只 ${status.trend}`, innerX, cy + 36, 17, trendColor, "700");
    this.drawChangeTag(ctx, innerX + 84, cy + 21, this.reserveDisplayDelta(populationKey, pop), "left", { key: populationKey });
    this.text(ctx, "当前状态", panelX + panelW * 0.56, cy + 16, 10, "#8b7355", "700");
    this.text(ctx, status.status, panelX + panelW * 0.56, cy + 36, 14, trendColor, "700");
    this.roundRect(ctx, panelX + panelW - 66, cy + 8, 56, summaryH - 16, 8, "rgba(240,211,118,0.12)", "rgba(216,174,62,0.24)");
    this.text(ctx, "重要性", panelX + panelW - 38, cy + 21, 9, "#8b7355", "700", "center");
    this.text(ctx, importance.level, panelX + panelW - 38, cy + 38, 11, importance.score >= 70 ? "#c44735" : "#1f8a55", "700", "center");
    cy += summaryH + gap;

    this.roundRect(ctx, panelX, cy, panelW, feedbackH, 9, "#fff7df", "rgba(216,174,62,0.25)");
    this.text(ctx, "它们对保护区的感受", innerX, cy + 16, 10, "#8b6f2a", "700");
    this.drawFittedTextBlock(ctx, `“${profile.feedback || "它们仍在观察保护区的变化。"}”`, innerX, cy + 36, innerW, feedbackH - 24, {
      size: compact ? 10 : 11,
      minSize: 9,
      lineHeight: compact ? 13 : 15,
      color: "#3d2b1a"
    });
    cy += feedbackH + gap;

    this.text(ctx, "你认识的朋友", innerX, cy + 11, 10, "#66715f", "700");
    const friends = (profile.friends || []).slice(0, 2);
    const friendY = cy + 16;
    const friendCardH = friendH - 16;
    const friendW = (innerW - 8) / 2;
    if (!friends.length) {
      this.roundRect(ctx, innerX, friendY, innerW, friendCardH, 8, "rgba(36,64,46,0.06)", "rgba(36,64,46,0.10)");
      this.text(ctx, "继续守护，它们会逐渐记住你", innerX + 10, friendY + Math.min(22, friendCardH - 8), 10, "#66715f", "700");
    }
    friends.forEach((friend, index) => {
      const fx = innerX + index * (friendW + 8);
      const statusText = individualDisplayStatus(friend);
      const axes = relationshipAxes(friend);
      const statusColor = friend.status === "dead" || friend.status === "departed" || friend.health < 46 ? "#c45b42" : friend.status === "independent" ? "#2f7c8f" : friend.rarity ? "#b07a16" : "#1f7a52";
      this.roundRect(ctx, fx, friendY, friendW, friendCardH, 8, friend.rarity ? "#fff0c7" : "#f7f0dc", friend.rarity ? "rgba(216,174,62,0.52)" : "rgba(139,111,42,0.18)");
      this.text(ctx, this.truncateTextToWidth(ctx, friend.name, friendW - 50, 11, "700"), fx + 9, friendY + 15, 11, "#1c3325", "700");
      this.text(ctx, `安全${axes.security} · 野性${axes.wildness}`, fx + 9, friendY + 29, 9, "#66715f", "700");
      this.text(ctx, statusText, fx + friendW - 8, friendY + 21, 9, statusColor, "700", "right");
      this.addHit(fx, friendY, friendW, friendCardH, () => this.openNamedIndividual(friend));
    });
    cy += friendH + gap;

    this.roundRect(ctx, panelX, cy, panelW, dialogueH, 9, "rgba(36,64,46,0.06)", "rgba(36,64,46,0.10)");
    const visibleDialogues = (recentDialogues.length ? recentDialogues : ["林子里暂时没有新的回应。"])
      .slice(0, dialoguesExpanded ? 5 : 1);
    this.text(ctx, `近期对白 · ${recentDialogues.length || 1}句`, innerX, cy + 16, 10, "#66715f", "700");
    if (recentDialogues.length > 1) {
      const toggleLabel = dialoguesExpanded ? "收起 ︿" : `展开另外${recentDialogues.length - 1}句 ›`;
      this.text(ctx, toggleLabel, panelX + panelW - 12, cy + 16, 10, "#1f7a52", "700", "right");
    }
    visibleDialogues.forEach((line, index) => {
      const lineY = cy + 34 + index * (compact ? 12 : 14);
      this.text(ctx, this.truncateTextToWidth(ctx, `“${this.cleanGameText(line)}”`, innerW, compact ? 10 : 11, index === 0 ? "700" : "400"), innerX, lineY, compact ? 10 : 11, index === 0 ? "#1c3325" : "#49604e", index === 0 ? "700" : "400");
    });
    if (recentDialogues.length > 1) {
      this.addHit(panelX, cy, panelW, dialogueH, () => {
        if (!this.infoDetailModal || this.infoDetailModal.kind !== "speciesProfile") return;
        this.infoDetailModal.dialoguesExpanded = !this.infoDetailModal.dialoguesExpanded;
        this.render();
      });
    }
    modal.renderedSpeciesDialogue = {
      expanded: dialoguesExpanded,
      total: recentDialogues.length || 1,
      visible: visibleDialogues.length,
      x: panelX, y: cy, w: panelW, h: dialogueH
    };
    cy += dialogueH + gap;

    this.roundRect(ctx, panelX, cy, panelW, attitudeH, 9, "rgba(28,51,37,0.10)", "rgba(28,51,37,0.16)");
    this.text(ctx, "对你的态度", innerX, cy + 15, 10, "#1c3325", "700");
    this.drawFittedTextBlock(ctx, profile.attitude || "它们还在观察你的选择。", innerX, cy + 34, innerW, attitudeH - 20, {
      size: compact ? 10 : 11,
      minSize: 9,
      lineHeight: compact ? 13 : 15,
      color: "#3d2b1a"
    });
  }

  drawMissionPushContent(ctx, modal, x, bodyY, w, bodyH) {
    const mission = modal.mission || {};
    const panelX = x + 28;
    const panelY = bodyY + 16;
    const panelW = w - 56;
    const panelH = bodyH - 28;
    const compact = panelH < 330;
    this.roundRect(ctx, panelX, panelY, panelW, panelH, 8, "rgba(255, 250, 236, 0.82)", "rgba(36, 64, 46, 0.10)");

    const primaryY = panelY + 12;
    const primaryH = compact ? 106 : 120;
    const pg = ctx.createLinearGradient(panelX + 10, primaryY, panelX + panelW - 10, primaryY + primaryH);
    pg.addColorStop(0, UI_THEME.ivory);
    pg.addColorStop(0.56, "#f5f1e6");
    pg.addColorStop(1, UI_THEME.parchment);
    this.roundRect(ctx, panelX + 10, primaryY, panelW - 20, primaryH, 10, pg, "rgba(216, 174, 62, 0.46)");
    this.statusPill(ctx, panelX + 24, primaryY + 14, "推荐行动", "#e8ddbd", UI_THEME.forest800, 66);
    const iconCx = panelX + 55;
    const iconCy = primaryY + 66;
    this.drawUiIconBadge(ctx, modal.icon || "eye", iconCx, iconCy, 52, 44, true)
      || this.drawLargeIcon(ctx, modal.icon || "eye", iconCx, iconCy, "#1c3325", 34);
    const actionX = panelX + 96;
    this.text(ctx, mission.actionTitle || modal.actionLabel || "执行任务", actionX, primaryY + 36, 18, "#1c3325", "700");
    this.drawFittedTextBlock(ctx, mission.actionBody || "完成多次相关操作，满足数据条件后推进阶段事件。", actionX, primaryY + 61, panelW - 126, compact ? 30 : 42, {
      size: compact ? 10 : 11,
      minSize: 9,
      lineHeight: compact ? 13 : 15,
      color: "#4b594e"
    });
    if (!compact) {
      this.text(ctx, mission.focusLine || "先处理最会影响动物迁移的一件事", actionX, primaryY + primaryH - 14, 10, "#8b6f2a", "700");
    }

    const rewardY = primaryY + primaryH + 10;
    const rewardH = compact ? 68 : 76;
    const rewardGradient = ctx.createLinearGradient(panelX + 10, rewardY, panelX + panelW - 10, rewardY + rewardH);
    rewardGradient.addColorStop(0, "#f5f1e6");
    rewardGradient.addColorStop(.56, UI_THEME.ivory);
    rewardGradient.addColorStop(1, "#e4e8df");
    this.roundRect(ctx, panelX + 10, rewardY + 4, panelW - 20, rewardH, 12, "rgba(18,61,52,.12)");
    this.roundRect(ctx, panelX + 10, rewardY, panelW - 20, rewardH, 12, rewardGradient, "rgba(216,174,62,.52)");
    this.statusPill(ctx, panelX + 22, rewardY + 10, "完成奖励", "#e8ddbd", UI_THEME.forest800, 62);
    const progressText = mission.rewardBody || "达标后结算";
    const progressW = Math.min(112, Math.max(76, progressText.length * 9 + 18));
    this.roundRect(ctx, panelX + panelW - progressW - 20, rewardY + 9, progressW, 22, 11, "rgba(255,255,255,.68)", "rgba(46,135,110,.26)");
    this.text(ctx, this.truncateTextToWidth(ctx, progressText, progressW - 14, 10, "700"), panelX + panelW - progressW / 2 - 20, rewardY + 24, 10, "#47715e", "700", "center");
    const rewardTitle = mission.rewardTitle || "守护分与保护区状态提升";
    const rewardTitleSize = this.fitTextSize(ctx, rewardTitle, panelW - 48, 18, 12, "700");
    this.text(ctx, this.truncateTextToWidth(ctx, rewardTitle, panelW - 48, rewardTitleSize, "700"), panelX + 24, rewardY + rewardH - 15, rewardTitleSize, "#9a6419", "700");

    const storyY = rewardY + rewardH + 10;
    const storyH = Math.max(compact ? 58 : 68, panelY + panelH - storyY - 12);
    this.roundRect(ctx, panelX + 10, storyY, panelW - 20, storyH, 9, "rgba(18, 50, 34, 0.08)", "rgba(36,64,46,0.10)");
    this.statusPill(ctx, panelX + 24, storyY + 12, mission.secondaryTag || "刚发生", "#e7efd5", "#31533b", 56);
    this.text(ctx, mission.secondaryTitle || "森林正在给你信号", panelX + 90, storyY + 29, 12, "#1c3325", "700");
    this.drawFittedTextBlock(ctx, mission.secondaryBody || "动物、天气和边界压力都在变化，今天需要你做一个明确决定。", panelX + 24, storyY + 48, panelW - 48, Math.max(12, storyH - 54), {
      size: 10,
      minSize: 9,
      lineHeight: 13,
      color: "#4b594e"
    });
    modal.renderedMissionPush = {
      whyVisible: false,
      rewardProminent: true,
      rewardTitle,
      rewardTitleSize,
      rewardH,
      secondaryTag: mission.secondaryTag || "刚发生"
    };
  }

  drawGoalCenterContent(ctx, modal, x, bodyY, w, bodyH) {
    const allGoals = (modal.goals || []).slice(0, 3);
    const currentGoal = allGoals.find((goal) => goal.id === modal.currentGoalId)
      || allGoals.find((goal) => goal.id === modal.selectedGoalId)
      || allGoals[0];
    const goals = modal.showAlternatives ? allGoals : [currentGoal].filter(Boolean);
    const panelX = x + 28;
    const panelW = w - 56;
    const innerY = bodyY + 14;
    const daily = modal.daily || {};
    const progressH = 48;
    this.roundRect(ctx, panelX, innerY, panelW, progressH, 12, "rgba(236,244,224,.96)", "rgba(46,135,110,.24)");
    this.text(ctx, "今日经营循环", panelX + 14, innerY + 19, 11, "#1c3325", "700");
    this.text(ctx, `${daily.complete || 0}/${daily.total || 3}`, panelX + panelW - 14, innerY + 21, 16, "#1f7a52", "700", "right");
    const barX = panelX + 14;
    const barY = innerY + 32;
    const barW = panelW - 28;
    this.roundRect(ctx, barX, barY, barW, 7, 4, "rgba(28,51,37,.12)");
    this.roundRect(ctx, barX, barY, Math.max(8, barW * Math.min(1, (daily.complete || 0) / Math.max(1, daily.total || 3))), 7, 4, "#2e876e");

    const gap = 8;
    const available = bodyH - progressH - 36 - gap * Math.max(0, goals.length - 1);
    const cardH = Math.max(72, Math.min(94, Math.floor(available / Math.max(1, goals.length))));
    let cy = innerY + progressH + 10;
    modal.renderedGoalCards = [];
    goals.forEach((goal, index) => {
      const selected = goal.id === modal.selectedGoalId;
      const primary = goal.id === modal.currentGoalId;
      const bg = selected ? "rgba(255,243,188,.98)" : "rgba(255,250,236,.96)";
      const border = selected ? "rgba(210,155,38,.78)" : "rgba(36,64,46,.16)";
      this.roundRect(ctx, panelX, cy + 3, panelW, cardH, 12, "rgba(20,31,26,.10)");
      this.roundRect(ctx, panelX, cy, panelW, cardH, 12, bg, border);
      this.roundRect(ctx, panelX + 10, cy + 10, 48, 19, 9, primary ? "#1f7a52" : "#e8ddbd");
      this.text(ctx, this.goalTypeLabel(goal), panelX + 34, cy + 24, 9, primary ? "#fff8df" : "#6f654d", "700", "center");
      this.text(ctx, this.truncateTextToWidth(ctx, goal.title || "下一目标", panelW - 88, 13, "700"), panelX + 68, cy + 25, 13, "#1c3325", "700");
      const progress = `${goal.progress || 0}/${goal.target || 1}`;
      this.text(ctx, progress, panelX + panelW - 12, cy + 25, 11, selected ? "#9a6419" : "#66715f", "700", "right");
      this.drawFittedTextBlock(ctx, goal.body || goal.rewardText || "完成后继续生成下一目标。", panelX + 14, cy + 48, panelW - 28, Math.max(18, cardH - 55), {
        size: 10,
        minSize: 9,
        lineHeight: 13,
        color: "#4b594e",
        maxLines: 2
      });
      if (selected) {
        this.roundRect(ctx, panelX + panelW - 29, cy + cardH - 23, 19, 16, 7, "#d29b26");
        this.text(ctx, "✓", panelX + panelW - 19, cy + cardH - 11, 10, "#fff8df", "700", "center");
      }
      this.addHit(panelX, cy, panelW, cardH, () => {
        if (!this.infoDetailModal || !this.infoDetailModal.goals) return;
        if (goal.id === this.infoDetailModal.currentGoalId) return;
        this.selectGoalAsPrimary(goal.id);
      });
      modal.renderedGoalCards.push({ id: goal.id, selected, primary, x: panelX, y: cy, w: panelW, h: cardH });
      cy += cardH + gap;
    });
  }

  drawSettlementModal() {
    // v3.0 结算弹窗：评级、核心变化、奖励、动物反馈分层展示。
    const modal = this.settlementModal;
    if (!modal) return;
    if (modal.silent) {
      if (Date.now() >= (modal.autoFinishAt || 0)) this.finishSettlement(modal.returnScreen || "home");
      return;
    }
    if (modal.revealAt && Date.now() < modal.revealAt) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    // 与其他系统弹窗共用同一遮罩浓度，结果卡本身承担高光。
    ctx.fillStyle = "rgba(12,18,15,.48)";
    ctx.fillRect(0, 0, this.width, this.height);
    const compact = this.height < 620;
    const focusMode = this.settlementFocusMode(modal);
    const focusedExploration = focusMode === "exploration";
    const focusedOutcome = !!focusMode;
    const w = Math.min(this.width - 32, 360);
    const h = Math.min(this.height - 48, focusedOutcome ? (compact ? 346 : 356) : (compact ? 438 : 464));
    const x = (this.width - w) / 2;
    const y = Math.max(26, Math.round((this.height - h) / 2));
    const layout = this.settlementModalLayout(ctx, modal, x, y, w, h, compact);
    const crisisAction = this.settlementCrisisAction(modal);
    // 弹窗主体阴影
    this.roundRect(ctx, x, y + 7, w, h, 24, "rgba(15,24,20,.20)");
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, UI_THEME.tint);
    g.addColorStop(1, UI_THEME.tintPressed);
    this.roundRect(ctx, x, y, w, h, 24, g, "rgba(255,255,255,.26)");
    // 眉标：任务完成
    const breakthrough = modal.breakthrough || null;
    const kickerLabel = focusMode === "exploration" ? "探索发现"
      : focusMode === "commerce" ? "样本移交完成"
      : focusMode === "recovery" ? "回收完成"
      : focusMode === "mystery" ? "珍稀封存"
      : breakthrough ? (breakthrough.kicker || "重大突破") : "任务完成";
    const kickerW = focusedOutcome ? 88 : breakthrough ? 104 : 90;
    this.roundRect(ctx, x + 16, y + 16, kickerW, 24, 12, crisisAction ? "#f47b73" : "#fff0b2", crisisAction ? "rgba(255,255,255,.48)" : "rgba(216,174,62,.42)");
    this.text(ctx, kickerLabel, x + 16 + kickerW / 2, y + 32, 12, crisisAction ? "#ffffff" : "#6d5220", "700", "center");
    // 评级徽章（右上角）
    modal.renderedSettlementGradeBadge = this.drawSettlementGradeBadge(ctx, layout.badge.x, layout.badge.y, modal.grade || "C", modal.guardianScore || 0, modal.scoreDelta || 0);
    // 主标题
    ctx.font = `700 ${layout.title.size}px ${UI_FONT_STACK}`;
    layout.title.lines.forEach((line, index) => {
      this.text(ctx, line, layout.title.x, layout.title.y + index * layout.title.lineHeight, layout.title.size, "#fff8df", "700");
    });
    // 数据变化条（奶油白底板）
    const summaryY = layout.summary.y;
    const summaryH = layout.summary.h;
    this.roundRect(ctx, x + 14, summaryY + 3, w - 28, summaryH, 15, "rgba(18,61,52,.12)");
    this.roundRect(ctx, x + 14, summaryY, w - 28, summaryH, 15, "rgba(255,253,244,.98)", "rgba(46,135,110,.24)");
    if (focusedOutcome) this.drawFocusedOutcomeImpactStrip(ctx, modal, focusMode, x + 28, summaryY + 7, w - 56, compact, layout.title.size);
    else this.drawSettlementChangeStrip(ctx, modal, x + 28, summaryY + 7, w - 56, compact);
    // 结果区只保留浅色信息板，避免多块高饱和颜色争夺注意力。
    const rewardY = layout.reward.y;
    const rewardH = layout.reward.h;
    this.roundRect(ctx, x + 14, rewardY + 3, w - 28, rewardH, 15, "rgba(18,61,52,.10)");
    this.roundRect(ctx, x + 14, rewardY, w - 28, rewardH, 15, "rgba(255,250,236,.97)", "rgba(46,135,110,.20)");
    const rewardLines = this.settlementRewardDisplayLines(modal, compact);
    if (focusedOutcome) this.drawFocusedOutcomeSummary(ctx, modal, focusMode, x + 26, rewardY + 6, w - 52, rewardH - 12);
    else this.drawSettlementRewardRows(ctx, modal, rewardLines, x + 26, rewardY + 6, w - 52, rewardH - 12, compact);
    // 普通结算保留一条明日行动；探索结果已经完成闭环，不再增加第五个信息区。
    if (!focusedOutcome) {
      const nextY = layout.next.y;
      this.roundRect(ctx, x + 14, nextY, w - 28, layout.next.h, 9, "rgba(255,248,223,.94)", "rgba(216,174,62,.28)");
      const nextLabel = modal.goalDone ? "达成 ✓" : "明日";
      this.text(ctx, nextLabel, x + 30, nextY + 21, 11, modal.goalDone ? "#1f7a52" : "#8b6f2a", "700");
      const nextCopy = String(modal.nextHint || "回沙盘听动物，再决定下一步。")
        .replace(/^明日建议[:：]/, "")
        .replace(/^明日[:：]/, "")
        .replace(/局面不错[，,]?/, "")
        .replace(/回沙盘点动物再决定下一步。?/, "回沙盘听动物");
      const nextText = this.truncateTextToWidth(ctx, nextCopy, w - 104, 11, "700");
      this.text(ctx, nextText, x + 78, nextY + 21, 11, "#31533b", "700");
    }
    // 动物发言区（奶油白底板）
    const speechH = layout.speech.h;
    const speechY = layout.speech.y;
    this.roundRect(ctx, x + 14, speechY + 3, w - 28, speechH, 15, "rgba(18,61,52,.11)");
    this.roundRect(ctx, x + 14, speechY, w - 28, speechH, 15, "rgba(255,253,244,.98)", "rgba(46,135,110,.22)");
    // 动物头像
    if (modal.speakerAnimal) this.drawAnimalAvatar(ctx, modal.speakerAnimal, x + 42, speechY + speechH / 2, 36, true);
    else this.drawPlayerToken(ctx, x + 42, speechY + speechH / 2, modal.speakerBadge, "#1c3325");
    const animalReady = !modal.animalRevealAt || Date.now() >= modal.animalRevealAt;
    const echoLabel = animalReady ? `${modal.speaker || "动物"}` : "动物正在观察…";
    this.text(ctx, echoLabel, x + 70, speechY + 22, 13, animalReady && modal.emotionalEcho ? "#8b6f2a" : "#1c3325", "700");
    if (!focusedOutcome && animalReady && modal.emotionalEcho && modal.emotionalEcho.impact) {
      this.text(ctx, this.truncateTextToWidth(ctx, modal.emotionalEcho.impact, 92, 10, "700"), x + w - 18, speechY + 21, 10, "#1f7a52", "700", "right");
    }
    this.wrapText(ctx, animalReady ? modal.speech : "先让数字落定，它会用自己的行动回应你。", x + 70, speechY + 42, w - 104, compact ? 10 : 11, compact ? 14 : 15, "#4b594e", focusedOutcome ? 1 : compact ? 1 : 2);
    // 双按钮
    const buttonY = layout.buttons.y;
    const btnW = (w - 44) / 2;
    const returnScreen = modal.returnScreen || "action";
    const stayLabel = crisisAction ? "稍后处理" : returnScreen === "role" ? "留在物资" : returnScreen === "home" ? "留在沙盘" : "继续巡护";
    // 左按钮：留在当前页（金色）
    this.modalButton(ctx, x + 14, buttonY, btnW, layout.buttons.h, stayLabel, "#d8c27a", () => this.finishSettlement(returnScreen), "#26352b");
    // 右按钮：完成（深林绿）
    this.modalButton(
      ctx,
      x + 30 + btnW,
      buttonY,
      btnW,
      layout.buttons.h,
      crisisAction ? crisisAction.buttonLabel : modal.goalDone ? "查看新任务 →" : "完成 ✓",
      crisisAction ? "#0f5c48" : "#1c3325",
      () => crisisAction ? this.finishSettlementToCrisisAction(crisisAction.actionId) : this.finishSettlement(returnScreen),
      "#fff8df",
      crisisAction ? 11 : 12
    );
    modal.renderedSettlementStyle = {
      palette: ["forest", "cream", "status"],
      rewardRows: focusedOutcome ? 1 : rewardLines.length,
      compactCopy: true,
      repeatedGoalLabel: false,
      focusedExploration,
      focusedOutcome,
      focusMode,
      echoLabel,
      messageOrder: modal.goalDone ? ["操作结果", "新任务"] : ["操作结果"]
    };
    ctx.restore();
  }

  settlementCrisisAction(modal = {}) {
    const breakthrough = modal.breakthrough || {};
    const kind = String(breakthrough.kind || "");
    const isCrisis = /^emergency_(?:started|failed)$/.test(kind)
      || /事件失控|突发事件/.test(String(breakthrough.kicker || ""));
    if (!isCrisis) return null;
    const reasons = ((modal.causality || {}).reasons || []).filter(Boolean);
    const titleBody = `${breakthrough.title || modal.title || ""} ${breakthrough.body || modal.summary || ""}`;
    const matchingReason = reasons.find((reason) => this.isPatrolTaskAction(reason.action)) || {};
    let actionId = this.isPatrolTaskAction(matchingReason.action) ? matchingReason.action : "";
    if (!actionId) {
      if (/偷猎|套索|陷阱|陌生脚印/.test(titleBody)) actionId = "antiPoacher";
      else if (/疾病|病味|感染|病虫/.test(titleBody)) actionId = "houndScout";
      else if (/水源|草场|栖息|干旱|水线/.test(titleBody)) actionId = "habitat";
      else if (/过度取食|失衡|个体|迁移/.test(titleBody)) actionId = "intervention";
      else actionId = "houndScout";
    }
    const meta = {
      houndScout: { label: "猎犬侦察", buttonLabel: "去猎犬侦察", guidance: "查明病源与扩散路线" },
      antiPoacher: { label: "驱赶偷猎", buttonLabel: "去驱赶偷猎", guidance: "带警报器压住危险边界" },
      habitat: { label: "修复水草", buttonLabel: "去修复水草", guidance: "恢复水源与草场" },
      intervention: { label: "生态干预", buttonLabel: "去生态干预", guidance: "控制失衡并稳定种群" }
    }[actionId];
    if (!meta) return null;
    return Object.assign({
      actionId,
      reason: matchingReason.label || breakthrough.title || "危机仍在扩散"
    }, meta);
  }

  finishSettlementToCrisisAction(actionId) {
    const modal = this.settlementModal || {};
    this.settlementModal = null;
    this.enqueueEmotionEvent(modal.emotionEvent);
    this.suppressNextHomeMission = true;
    this.openReserveViewAction(actionId, "sandbox-task");
    this.toast("危机任务已定位");
  }

  finishSettlement(returnScreen) {
    const modal = this.settlementModal || {};
    this.settlementModal = null;
    this.enqueueEmotionEvent(modal.emotionEvent);
    if (modal.goalDone) this.queueMissionPush("settlement");
    this.queueChapterStoriesForSettlement(modal);
    this.suppressNextHomeMission = (returnScreen || "home") === "home";
    this.deferQueuedMissionPush = true;
    this.setScreen(returnScreen || "home");
    this.deferQueuedMissionPush = false;
    if (this.chapterStoryModal) return;
    if (this.infoDetailModal) return;
    const totalActions = (((((this.state.world || {}).reserve || {}).progression || {}).totalActions) || 0);
    if (modal.onboardingFirstAction && this.openOnboardingGuide("after_first", true)) return;
    if (totalActions === 2 && this.openOnboardingGuide("materials")) return;
    if (totalActions === 3 && this.openOnboardingGuide("population")) return;
    if (totalActions === 4 && this.openPendingStrategicDilemma()) return;
    if (this.openPendingGuardianPromise()) return;
    if (this.openPendingStrategicDilemma()) return;
    if (this.openPendingEmotionEvent()) return;
    if (this.openQueuedMissionPush()) return;
    this.maybeOpenMissionPush("home");
  }

  openPendingGuardianPromise() {
    if (!this.state.character || this.chapterStoryModal || this.settlementModal || this.infoDetailModal) return false;
    const reserve = (this.state.world || {}).reserve || {};
    const state = normalizeGuardianPromises(reserve.guardianPromises);
    const pending = state.pending;
    const promise = pending && promiseByChapter(pending.chapter);
    if (!promise) return false;
    reserve.guardianPromises = state;
    const selectedChoiceId = pending.selectedChoiceId || "";
    const choiceCards = promise.choices.map((choice) => {
      const relation = Object.keys(choice.relationship || {}).map((action) => {
        const shift = choice.relationship[action] || {};
        return `${action === "intervention" ? "救助" : action === "habitat" ? "修复" : action === "antiPoacher" ? "反偷猎" : action === "houndScout" ? "侦察" : "探索"}：安全${this.signed(shift.security || 0)} / 野性${this.signed(shift.wildness || 0)}`;
      }).join("；");
      return {
        id: choice.id,
        label: choice.label,
        route: choice.route,
        risk: choice.risk,
        primaryBenefit: choice.primaryBenefit,
        primaryCost: choice.primaryCost,
        effectText: effectPreview({ effects: choice.immediateEffects || {} }),
        consequenceText: choice.longTerm,
        animalText: relation
      };
    });
    this.markPopupQuiet(3);
    this.infoDetailModal = {
      kind: "guardianPromise",
      kicker: `第${promise.chapter}章 · 守护承诺`,
      title: promise.title,
      icon: "reserve_level",
      promise,
      dilemma: Object.assign({}, promise, { tier: "major" }),
      choiceCards,
      selectedChoiceId,
      footer: "永久守则"
    };
    this.render();
    return true;
  }

  selectGuardianPromise(chapter, choiceId) {
    const reserve = (this.state.world || {}).reserve || {};
    if (!selectGuardianPromiseChoice(reserve, chapter, choiceId)) {
      this.toast("这个承诺已经失效");
      return;
    }
    saveState(this.state);
    if (this.infoDetailModal && this.infoDetailModal.kind === "guardianPromise") {
      this.infoDetailModal.selectedChoiceId = choiceId;
      this.render();
    }
  }

  confirmGuardianPromise(chapter, choiceId) {
    const reserve = (this.state.world || {}).reserve || {};
    const result = applyGuardianPromiseChoice(reserve, chapter, choiceId, {
      day: (this.state.world || {}).day || 1,
      totalActions: ((reserve.progression || {}).totalActions) || 0
    });
    if (!result) {
      this.toast("这个承诺已经失效");
      this.infoDetailModal = null;
      this.render();
      return;
    }
    this.currentGoalView(true);
    saveState(this.state);
    const labels = { fund: "回收样本", researchSamples: "研究样本", supplyTotal: "巡护补给", safety: "安全", stability: "稳定", reputation: "声誉", enforcement: "执法", poacherPressure: "偷猎", water: "水源", grass: "草场", disease: "疾病", migrationDelta: "迁徙" };
    const changeItems = result.changes.slice(0, 3).map((item) => ({
      tag: labels[item.key] || item.key,
      title: `${item.before} → ${item.after}（${this.signed(item.delta)}）`,
      body: item.key === "poacherPressure" || item.key === "disease"
        ? (item.delta < 0 ? "风险下降，是承诺带来的即时收益。" : "风险上升，是这项承诺明确接受的代价。")
        : (item.delta > 0 ? "即时收益" : "即时代价")
    }));
    this.setScreen("home");
    this.setMapConsequencePulse(result.before, result.after, {
      title: result.choice.mapTag,
      reason: `守护承诺 · ${result.choice.label}`,
      tone: "promise"
    });
    this.infoDetailModal = {
      revealAt: Date.now() + 900,
      kicker: `第${chapter}章 · 守护承诺已写下`,
      title: result.choice.label,
      icon: "reserve_level",
      items: changeItems.concat([
        { tag: "永久规则", title: result.choice.primaryBenefit, body: `${result.choice.primaryCost}。${result.choice.longTerm}` },
        { tag: "沙盘变化", title: result.choice.mapTag, body: "承诺已经成为保护区的一处可见痕迹；之后相关行动都会读取这条规则。" }
      ]).slice(0, 5),
      actionLabel: "继续守护",
      action: () => {
        this.infoDetailModal = null;
        if (!this.openQueuedMissionPush()) this.render();
      },
      footer: "今后相关行动都会读取这条守则。"
    };
    this.playSfx("success");
    this.render();
  }

  openPendingStrategicDilemma() {
    if (!this.state.character || this.chapterStoryModal || this.settlementModal || this.infoDetailModal) return false;
    const reserve = (this.state.world || {}).reserve || {};
    const state = normalizeStrategyState(reserve.strategy);
    let pending = state.pendingDilemma;
    const dilemma = pending && strategicDilemmaById(pending.id);
    if (!dilemma) return false;
    this.markPopupQuiet(2);
    let namedIndividual = null;
    if (dilemma.tier === "major") {
      const binding = bindStrategicIndividual(this.state.world || {}, dilemma, pending);
      this.state.world.lifeMemory = binding.state;
      pending = binding.pending;
      namedIndividual = binding.individual;
      state.pendingDilemma = pending;
      reserve.strategy = state;
      saveState(this.state);
    }
    if (state.pendingRoll && state.pendingRoll.dilemmaId === dilemma.id) {
      const rolledChoice = dilemma.choices.find((choice) => choice.id === state.pendingRoll.choiceId);
      if (rolledChoice) {
        this.openStrategicDiceModal(dilemma, rolledChoice, state.pendingRoll.roll, "resolved");
        return true;
      }
    }
    const route = strategyRoute(reserve);
    const selectedChoiceId = state.pendingSelection && state.pendingSelection.dilemmaId === dilemma.id ? state.pendingSelection.choiceId : "";
    const choiceCards = dilemma.choices.map((choice) => {
      const adjusted = adjustedEffectsFor(reserve, dilemma, choice, choice.effects || {});
      const consequence = choice.consequence || {};
      const shortfall = strategicResourceShortfall(reserve, adjusted.effects);
      const primary = this.strategicChoicePrimarySummary(adjusted.effects, consequence, shortfall, choice.risk || "safe");
      const shortfallText = "";
      return {
        id: choice.id,
        label: choice.label,
        route: choice.route,
        chainAligned: pending.sourceRoute === choice.route,
        risk: choice.risk || "safe",
        primaryBenefit: primary.benefit,
        primaryCost: primary.cost,
        effectText: `${effectPreview({ effects: adjusted.effects })}${shortfallText}`,
        consequenceText: `${consequence.label || "即时结算"}${consequence.remainingActions ? ` · ${consequence.remainingActions}次` : ""}${adjusted.routeAligned ? " · 当前路线强化" : ""}`,
        animalText: namedIndividual ? strategicAnimalOutcomePreview(this.state.world || {}, dilemma, choice, pending.namedIndividual) : ""
      };
    });
    this.infoDetailModal = {
      kind: "strategicDilemma",
      kicker: `第${pending.chapter}章${namedIndividual ? ` · ${namedIndividual.name}` : ""}`,
      title: dilemma.title,
      icon: "trail",
      dilemma,
      pending,
      choiceCards,
      route,
      namedIndividual,
      selectedChoiceId,
      footer: namedIndividual ? `选择后展开${namedIndividual.name}的长期后果；高风险方案才需要掷骰。` : `当前方针：${route.label}。点选方案查看长期影响，再确认。`
    };
    this.render();
    return true;
  }

  selectStrategicDilemmaChoice(dilemmaId, choiceId) {
    const reserve = (this.state.world || {}).reserve || {};
    if (!selectStrategicChoice(reserve, dilemmaId, choiceId)) {
      this.toast("这个方案已经失效");
      return;
    }
    saveState(this.state);
    if (this.infoDetailModal && this.infoDetailModal.kind === "strategicDilemma") {
      this.infoDetailModal.selectedChoiceId = choiceId;
      this.render();
    }
  }

  confirmStrategicChoice(dilemmaId, choiceId) {
    const reserve = (this.state.world || {}).reserve || {};
    const dilemma = strategicDilemmaById(dilemmaId);
    const choice = dilemma && dilemma.choices.find((item) => item.id === choiceId);
    if (!choice) {
      this.toast("这个方案已经失效");
      return;
    }
    if (choice.dice) {
      this.openStrategicDiceModal(dilemma, choice);
      return;
    }
    this.resolveStrategicDilemma(dilemmaId, choiceId);
  }

  openStrategicDiceModal(dilemma, choice, restoredRoll = null, phase = "ready") {
    const reserve = (this.state.world || {}).reserve || {};
    const namedIndividual = ((((reserve.strategy || {}).pendingDilemma || {}).namedIndividual) || null);
    const dicePreview = strategicDicePreview(reserve, dilemma, choice);
    this.infoDetailModal = {
      kind: "strategicDice",
      phase,
      displayRoll: restoredRoll || 1,
      kicker: "高风险方案 · 六面骰",
      title: choice.label,
      icon: "trail",
      dilemma,
      choice,
      namedIndividual,
      dicePreview,
      footer: namedIndividual ? `目标 ${dicePreview.threshold} 点 · 失败：${namedIndividual.name}重伤` : `目标 ${dicePreview.threshold} 点 · 路线与资源提供修正`,
      actionLabel: phase === "resolved" ? `结算 ${restoredRoll} 点` : "掷骰决定",
      action: () => {
        const currentModal = this.infoDetailModal || {};
        if (currentModal.phase === "resolved") {
          this.resolveStrategicDilemma(dilemma.id, choice.id, { roll: currentModal.displayRoll || restoredRoll || 1, routeModifier: dicePreview.routeModifier, resourceModifier: dicePreview.resourceModifier });
          return;
        }
        this.rollStrategicDice(dilemma.id, choice.id);
      }
    };
    this.render();
  }

  rollStrategicDice(dilemmaId, choiceId) {
    const modal = this.infoDetailModal;
    if (!modal || modal.kind !== "strategicDice" || modal.phase === "rolling") return;
    this.playSfx("dice");
    const finalRoll = Math.floor(Math.random() * 6) + 1;
    const preview = modal.dicePreview || {};
    const reserve = (this.state.world || {}).reserve || {};
    setPendingStrategicRoll(reserve, {
      dilemmaId,
      choiceId,
      roll: finalRoll,
      routeModifier: preview.routeModifier || 0,
      resourceModifier: preview.resourceModifier || 0,
      phase: "resolved"
    });
    saveState(this.state);
    const token = `${Date.now()}_${dilemmaId}_${choiceId}_${finalRoll}`;
    this.strategicRollToken = token;
    modal.phase = "rolling";
    modal.actionLabel = "骰子滚动中";
    let frame = 0;
    const animate = () => {
      if (this.strategicRollToken !== token || this.infoDetailModal !== modal) return;
      frame += 1;
      modal.displayRoll = frame >= 8 ? finalRoll : ((finalRoll + frame * 2) % 6) + 1;
      this.render();
      if (frame < 8) {
        setTimeout(animate, 65);
        return;
      }
      modal.phase = "resolved";
      modal.actionLabel = `结算 ${finalRoll} 点`;
      this.render();
      setTimeout(() => {
        if (this.strategicRollToken !== token || this.infoDetailModal !== modal) return;
        this.strategicRollToken = null;
        this.resolveStrategicDilemma(dilemmaId, choiceId, { roll: finalRoll, routeModifier: preview.routeModifier || 0, resourceModifier: preview.resourceModifier || 0 });
      }, 260);
    };
    animate();
  }

  resolveStrategicDilemma(dilemmaId, choiceId, diceResult = null) {
    const reserve = (this.state.world || {}).reserve || {};
    const result = applyStrategicChoice(reserve, dilemmaId, choiceId, diceResult);
    if (result && result.requiresDice) {
      this.openStrategicDiceModal(result.dilemma, result.choice);
      return;
    }
    if (!result) {
      this.toast("这个抉择已经失效");
      this.infoDetailModal = null;
      this.render();
      return;
    }
    const animalOutcome = applyStrategicAnimalConsequence(this.state.world || {}, result);
    if (animalOutcome) {
      result.animalOutcome = animalOutcome;
      result.record.animalOutcome = Object.assign({}, animalOutcome.history);
    }
    reserve.progression = reserveProgressionFor(reserve);
    this.state.world.reserve = reserve;
    this.currentGoalView(true);
    saveState(this.state);
    const supplementalItems = [
      animalOutcome ? { tag: "永久后果", title: `${animalOutcome.individual.name}：安全感 ${relationshipAxes(animalOutcome.before).security}→${relationshipAxes(animalOutcome.individual).security} · 野性 ${relationshipAxes(animalOutcome.before).wildness}→${relationshipAxes(animalOutcome.individual).wildness}`, body: `${animalOutcome.history.trait} · ${animalOutcome.individual.status === "dead" ? "已故" : animalOutcome.individual.status === "independent" ? "重归野外" : animalOutcome.individual.status === "departed" ? "离开保护区" : animalOutcome.individual.health < 46 ? "带伤留下" : "仍在保护区"} · 健康 ${animalOutcome.before.health}→${animalOutcome.individual.health}` } : null,
      result.dice ? { tag: "六面骰", title: `${result.dice.roll} + 路线${result.dice.routeModifier} + 资源${result.dice.resourceModifier} = ${result.dice.total}`, body: `目标 ${result.dice.threshold} 点；${result.dice.success ? "高风险收益完整生效。" : "未达到目标，代价保留、收益缩减。"}` } : null,
      result.consequence
        ? {
          tag: "持续影响",
          title: `${result.consequence.label} · ${result.consequence.remainingActions}次`,
          body: `${result.record.outcome} · ${result.route.shortLabel || result.route.label}+${result.routeGain}`
        }
        : {
          tag: "路线",
          title: `${result.route.shortLabel || result.route.label} +${result.routeGain}`,
          body: `${result.record.outcome} · ${result.route.shortLabel || result.route.label}+${result.routeGain}`
        }
    ].filter(Boolean);
    const changeItems = result.changes.slice(0, Math.max(1, 5 - supplementalItems.length)).map((item) => ({
      tag: item.label,
      title: `${item.before} → ${item.after}（${this.signed(item.delta)}）`,
      body: item.key === "poacherPressure" || item.key === "disease"
        ? (item.delta < 0 ? "风险下降，这是正向变化。" : "风险上升，需要在后续行动中处理。")
        : (item.delta > 0 ? "本项获得提升。" : "这是本次选择付出的代价。")
    }));
    this.setScreen("home");
    this.setMapConsequencePulse(result.before, result.after, {
      title: result.choice.label,
      reason: result.record.outcome,
      tone: "strategy",
      animalOutcome
    });
    this.infoDetailModal = {
      revealAt: Date.now() + 900,
      animalRevealAt: animalOutcome ? Date.now() + 1500 : 0,
      kicker: animalOutcome
        ? `命名动物 · ${animalOutcome.individual.name}`
        : `${result.route.label} · ${result.dice ? (result.dice.success ? "掷骰成功" : "掷骰受挫") : "选择已生效"}`,
      title: result.choice.label,
      icon: result.route.id === "enforcement" ? "antiPoacher" : result.route.id === "ecology" ? "leaf" : result.route.id === "research" ? "eye" : "migration",
      items: changeItems.concat(supplementalItems).slice(0, 5),
      actionLabel: "继续",
      action: () => {
        this.infoDetailModal = null;
        if (!this.openQueuedMissionPush()) this.render();
      },
      footer: animalOutcome ? `${animalOutcome.individual.name}的经历已记录。` : "长期影响已写入保护区。"
    };
    this.playSfx(result.dice && !result.dice.success ? "warning" : "success");
    this.render();
  }

  openPendingEmotionEvent() {
    if (this.chapterStoryModal || this.settlementModal) return false;
    if (!this.compactPendingEmotionEvents()) return false;
    const event = this.pendingEmotionEvent;
    this.pendingEmotionEvent = this.pendingEmotionEvents.shift() || null;
    this.markPopupQuiet(2);
    this.infoDetailModal = this.buildEmotionEventDetail(event);
    this.render();
    return true;
  }

  buildEmotionEventDetail(event) {
    const labels = {
      rare: "罕见时刻",
      return: "归来事件",
      birth: "新生命",
      death: "生命纪念",
      injury: "需要你",
      departure: "暂时离开",
      independence: "最好的告别",
      wild_visit: "它不再需要你",
      old: "时间留下痕迹",
      recovery: "重新站稳"
    };
    const individual = event.individual || {};
    return {
      kicker: labels[event.type] || "保护区记忆",
      title: event.title || "森林发生了一件值得记住的事",
      icon: event.type === "rare" ? "reserve_prosperity" : event.type === "injury" ? "fieldKit" : "leaf",
      prose: event.body || "这件事已经写进保护区记忆。",
      animal: individual.species === "猎犬" ? null : individual,
      meta: `${individual.name || "森林居民"} · ${individual.species || "动物"} · 第${event.day || (this.state.world || {}).day || 1}日`,
      footer: event.type === "return" ? "朋友归来。" : event.type === "independence" || event.type === "wild_visit" ? "它已能独立生活。" : "可在种群记忆中回看。",
      actionLabel: ["rare", "return", "birth", "death", "injury", "departure", "independence", "wild_visit"].includes(event.type) ? "分享这一刻" : "",
      action: ["rare", "return", "birth", "death", "injury", "departure", "independence", "wild_visit"].includes(event.type) ? () => this.shareForestPostcard(event) : null
    };
  }

  isMajorEmotionEvent(event) {
    return !!(event && ["rare", "return", "birth", "death", "injury", "departure", "independence", "wild_visit"].includes(event.type));
  }

  markPopupQuiet(actionGap = 2) {
    const totalActions = (((((this.state.world || {}).reserve || {}).progression || {}).totalActions) || 0);
    this.state.ui = Object.assign({}, this.state.ui || {}, {
      quietUntilAction: Math.max(((this.state.ui || {}).quietUntilAction) || 0, totalActions + Math.max(1, actionGap))
    });
    saveState(this.state);
  }

  openGuardianReturnLetter() {
    if (!this.pendingGuardianLetter || !this.state.character || this.chapterStoryModal || this.settlementModal || this.infoDetailModal) return false;
    const letter = this.pendingGuardianLetter;
    this.pendingGuardianLetter = null;
    this.infoDetailModal = {
      kicker: `离开 ${letter.absentDays} 天`,
      title: `守护者的信 · ${letter.from}`,
      icon: "leaf",
      prose: `${letter.quote}\n\n${letter.body}`,
      meta: `${letter.from} · ${letter.species} · 它们没有忘记你的巡护气味`,
      footer: "回来后的第一件事不必完美。去沙盘听一听，再走一小段。"
    };
    this.render();
    return true;
  }

  settlementModalLayout(ctx, modal, x, y, w, h, compact = h < 620) {
    const focusMode = this.settlementFocusMode(modal);
    const focusedOutcome = !!focusMode;
    const badge = { x: x + w - 82, y: y + 18, w: 64, h: 72 };
    const titleText = this.settlementFocusedTitle(modal, focusMode) || modal.title || "巡护完成";
    const title = this.settlementTitleLayout(ctx, titleText, w - 124, compact, focusedOutcome);
    title.x = x + 20;
    title.y = y + 70;
    const titleBottom = title.y + Math.max(1, title.lines.length) * title.lineHeight - 4;
    const headerBottom = Math.max(y + 88, badge.y + badge.h, titleBottom);
    const summary = { y: headerBottom + (compact ? 12 : 14), h: focusedOutcome ? 50 : compact ? 72 : 76 };
    const scene = { y: summary.y + summary.h, h: 0 };
    const stats = {
      y: scene.y,
      h: 0,
      gap: 0
    };
    const reward = {
      y: summary.y + summary.h + (compact ? 10 : 12),
      h: focusedOutcome ? 36 : compact ? 72 : 76
    };
    const next = { y: reward.y + reward.h + (focusedOutcome ? 0 : 8), h: focusedOutcome ? 0 : 32 };
    const speech = {
      h: focusedOutcome ? 54 : compact ? 60 : 64,
      y: next.y + next.h + (focusedOutcome ? 10 : 8)
    };
    const buttons = { y: speech.y + speech.h + 10, h: 44 };
    return { badge, title, summary, scene, stats, reward, next, speech, buttons };
  }

  settlementTitleLayout(ctx, title, maxWidth, compact, emphasized = false) {
    const baseSize = emphasized ? (compact ? 22 : 24) : compact ? 18 : 20;
    const minSize = emphasized ? 18 : 15;
    let selected = { size: minSize, lineHeight: minSize + 4, lines: [String(title || "")] };
    for (let size = baseSize; size >= minSize; size -= 1) {
      const lines = this.wrapTextLines(ctx, title || "巡护完成", maxWidth, size);
      selected = { size, lineHeight: size + 4, lines };
      if (lines.length <= 2) break;
    }
    const lines = selected.lines.slice(0, 2);
    if (selected.lines.length > 2) lines[1] = this.truncateTextToWidth(ctx, `${lines[1]}…`, maxWidth, selected.size, "700");
    return { size: selected.size, lineHeight: selected.lineHeight, lines };
  }

  settlementFocusMode(modal = {}) {
    if (modal.materialExploration) return "exploration";
    if (modal.commerce && modal.commerce.count > 0) return "commerce";
    if (modal.recoveredGoodsGain && (modal.recoveredGoodsGain.items || []).length) return "recovery";
    if (modal.mysteryRecovery) return "mystery";
    return "";
  }

  settlementFocusedTitle(modal = {}, mode = this.settlementFocusMode(modal)) {
    if (mode === "exploration") {
      const reward = (modal.materialExploration || {}).reward;
      return reward ? `${reward.label} ×${reward.amount}` : "新线索 +1";
    }
    if (mode === "commerce") {
      const gain = Math.max(0, Number(modal.fundAfter) - Number(modal.fundBefore));
      return `${(modal.commerce || {}).fundingLabel || "研究补助"} +${gain}`;
    }
    if (mode === "recovery") {
      const items = (modal.recoveredGoodsGain || {}).items || [];
      const first = items[0];
      return first ? `${first.label} ×${first.amount}${items.length > 1 ? ` 等${items.length}件` : ""}` : "回收物待收取";
    }
    if (mode === "mystery") return (modal.mysteryRecovery || {}).name || "神秘证物";
    return "";
  }

  truncateTextToWidth(ctx, text, maxWidth, size, weight = "400") {
    let value = String(text || "");
    ctx.font = `${weight} ${size}px ${UI_FONT_STACK}`;
    while (value.length > 1 && ctx.measureText(value).width > maxWidth) {
      value = `${value.slice(0, -2)}…`;
    }
    return value;
  }

  drawSettlementGradeBadge(ctx, x, y, grade, score, delta) {
    const gradeColor = grade === "D" ? "#a43f39" : "#173d34";
    const badgeFill = ctx.createLinearGradient(x, y, x, y + 70);
    badgeFill.addColorStop(0, "#fffdf0");
    badgeFill.addColorStop(.62, "#fff3c7");
    badgeFill.addColorStop(1, "#e8d9a0");
    this.roundRect(ctx, x, y + 5, 64, 68, 18, "rgba(18,61,52,.30)");
    this.roundRect(ctx, x, y, 64, 68, 18, badgeFill, "rgba(255,255,255,.82)");
    this.roundRect(ctx, x + 8, y + 5, 48, 4, 2, "rgba(255,255,255,.72)");
    this.text(ctx, grade, x + 32, y + 28, 28, gradeColor, "700", "center");
    this.text(ctx, `守护 ${score}`, x + 32, y + 46, 11, "#173d34", "700", "center");
    const fill = delta >= 0 ? "rgba(26,126,82,0.18)" : "rgba(196,91,66,0.18)";
    const text = delta === 0 ? "持平" : this.signed(delta);
    this.roundRect(ctx, x + 9, y + 50, 46, 15, 7, fill, "rgba(23,61,52,0.14)");
    this.text(ctx, text, x + 32, y + 61, this.fitTextSize(ctx, text, 36, 11, 10, "700"), delta >= 0 ? "#176b58" : "#a43f39", "700", "center");
    return {
      grade,
      score,
      delta,
      gradeSize: 28,
      scoreSize: 11,
      gradeColor,
      scoreColor: "#173d34",
      fill: "cream-gold",
      w: 64,
      h: 68
    };
  }

  drawSettlementChangeStrip(ctx, modal, x, y, w, compact = false) {
    const display = this.settlementDisplayChanges(modal);
    const primary = display.primary;
    const progress = this.settlementChangeProgress(modal);
    modal.renderedSettlementChanges = [];
    if (!primary) {
      this.text(ctx, "本次状态稳定", x + 2, y + 24, 18, "#1c3325", "700");
      this.text(ctx, "没有关键数值越过变化线", x + 2, y + 47, 10, "#66715f", "700");
      return;
    }
    const primaryState = this.settlementAnimatedMetric(primary, progress);
    const tone = this.settlementChangeTone(primary);
    const pulse = Math.sin(Math.min(1, progress) * Math.PI);
    if (pulse > 0.02) this.roundRect(ctx, x - 4, y - 2, w + 8, 45, 13, `rgba(${tone.rgb},${(0.08 + pulse * 0.12).toFixed(3)})`);
    this.roundRect(ctx, x, y + 2, 5, 38, 3, tone.color);
    this.text(ctx, this.truncateTextToWidth(ctx, primary.label, w - 72, 11, "700"), x + 14, y + 15, 11, "#66715f", "700");

    const deltaText = primary.customValue
      ? (/封存/.test(primary.customValue) ? "珍藏" : `+${progress >= 1 ? primary.amount : Math.max(0, Math.round(primary.amount * progress))}`)
      : this.signed(primaryState.delta);
    const deltaW = Math.max(42, Math.min(58, 18 + ctx.measureText(deltaText).width));
    this.roundRect(ctx, x + w - deltaW, y + 17, deltaW, 24, 10, tone.pill, "rgba(255,255,255,.72)");
    this.text(ctx, deltaText, x + w - deltaW / 2, y + 34, 12, tone.color, "700", "center");

    const dataW = w - deltaW - 24;
    if (primary.customValue) {
      const value = this.settlementAnimatedCustomValue(primary, progress);
      const valueSize = this.fitTextSize(ctx, value, dataW, compact ? 23 : 25, 18, "700");
      this.text(ctx, value, x + 14 + dataW / 2, y + 39, valueSize, tone.color, "700", "center");
      modal.renderedSettlementChanges.push(Object.assign({}, primary, { role: "primary", beneficial: tone.beneficial, valueSize, shownValue: value, progress }));
    } else {
      const beforeText = `${Math.round(primary.before)}`;
      const afterText = `${Math.round(primaryState.after)}`;
      const beforeSize = compact ? 12 : 13;
      const afterSize = this.fitTextSize(ctx, afterText, Math.max(42, dataW * .46), compact ? 24 : 25, 18, "700");
      ctx.font = `700 ${beforeSize}px ${UI_FONT_STACK}`;
      const beforeW = ctx.measureText(beforeText).width;
      ctx.font = `700 12px ${UI_FONT_STACK}`;
      const arrowW = ctx.measureText("→").width;
      ctx.font = `700 ${afterSize}px ${UI_FONT_STACK}`;
      const afterW = ctx.measureText(afterText).width;
      const groupW = beforeW + arrowW + afterW + 14;
      let gx = x + 14 + Math.max(0, (dataW - groupW) / 2);
      this.text(ctx, beforeText, gx, y + 37, beforeSize, "#7a857e", "700");
      gx += beforeW + 6;
      this.text(ctx, "→", gx, y + 36, 12, tone.color, "700");
      gx += arrowW + 8;
      this.text(ctx, afterText, gx, y + 39, afterSize, tone.color, "700");
      modal.renderedSettlementChanges.push(Object.assign({}, primary, { role: "primary", beneficial: tone.beneficial, valueSize: afterSize, shownValue: primaryState.after, progress }));
    }

    const secondary = display.secondary.slice(0, 2);
    const gap = 7;
    const chipW = secondary.length === 1 ? w : (w - gap) / 2;
    secondary.forEach((item, index) => {
      const dx = x + index * (chipW + gap);
      const itemTone = this.settlementChangeTone(item);
      const itemState = this.settlementAnimatedMetric(item, progress);
      const text = item.customValue
        ? `${item.label} ${this.settlementAnimatedCustomValue(item, progress)}`
        : `${item.label} ${Math.round(item.before)}→${Math.round(itemState.after)} ${this.signed(itemState.delta)}`;
      this.roundRect(ctx, dx, y + 47, chipW, 18, 7, itemTone.soft, "rgba(36,64,46,.08)");
      const size = this.fitTextSize(ctx, text, chipW - 10, 10, 9, "700");
      this.text(ctx, text, dx + chipW / 2, y + 60, size, itemTone.color, "700", "center");
      modal.renderedSettlementChanges.push(Object.assign({}, item, { role: "secondary", beneficial: itemTone.beneficial, valueSize: size, shownValue: itemState.after, progress }));
    });
  }

  drawFocusedOutcomeImpactStrip(ctx, modal, mode, x, y, w, compact = false, heroSize = 24) {
    const display = this.settlementDisplayChanges(modal);
    const progress = this.settlementChangeProgress(modal);
    const primary = display.primary;
    const primaryValue = primary
      ? primary.customValue ? this.settlementAnimatedCustomValue(primary, progress) : this.settlementAnimatedMetric(primary, progress).after
      : "";
    modal.renderedSettlementChanges = primary ? [Object.assign({}, primary, {
      role: "primary",
      beneficial: true,
      valueSize: heroSize,
      shownValue: primaryValue,
      progress
    })] : [];
    const statusLabel = mode === "commerce" ? "已获拨款" : mode === "recovery" ? "待收取" : mode === "mystery" ? "永久封存" : "已入库";
    this.text(ctx, statusLabel, x + 2, y + 18, 11, "#1f7a52", "700");
    const secondary = display.secondary.slice(0, 2);
    if (!secondary.length) {
      this.text(ctx, "保护区状态稳定", x + w - 2, y + 18, 10, "#707970", "700", "right");
      return;
    }
    const impact = secondary.map((item) => {
      const state = this.settlementAnimatedMetric(item, progress);
      modal.renderedSettlementChanges.push(Object.assign({}, item, {
        role: "secondary",
        beneficial: this.settlementChangeTone(item).beneficial,
        valueSize: 10,
        shownValue: state.after,
        progress
      }));
      return `${item.label} ${this.signed(state.delta)}`;
    }).join(" · ");
    this.text(ctx, this.truncateTextToWidth(ctx, `影响  ${impact}`, w - 70, 10, "700"), x + w - 2, y + 18, 10, "#707970", "700", "right");
  }

  drawFocusedOutcomeSummary(ctx, modal, mode, x, y, w, h) {
    let tag = "去向";
    let summary = "结果已记录";
    if (mode === "exploration") {
      const exploration = modal.materialExploration || {};
      const roll = Number(exploration.roll) || 0;
      const level = Number(exploration.levelContribution) || 0;
      const relationship = Number(exploration.relationshipContribution) || 0;
      const total = Number(exploration.qualityScore) || roll + level + relationship;
      tag = "骰点";
      summary = `${roll} + ${level} + ${relationship} = ${total}`;
    } else if (mode === "commerce") {
      const commerce = modal.commerce || {};
      tag = "拨款";
      summary = `基准 ${commerce.baseValue || 0} · 等级 ×${Number(commerce.levelFactor || 1).toFixed(2)} · 联区 ×${Number(commerce.neighborFactor || 1).toFixed(2)}`;
    } else if (mode === "recovery") {
      summary = "待收取区 · 收取后进入库存";
    } else if (mode === "mystery") {
      tag = "规则";
      summary = "唯一证物 · 永久封存 · 不进入常规移交流程";
    }
    this.text(ctx, tag, x + 2, y + 17, 10, "#8b6f2a", "700");
    const summarySize = this.fitTextSize(ctx, summary, w - 44, 12, 10, "700");
    const rendered = this.truncateTextToWidth(ctx, summary, w - 44, summarySize, "700");
    this.text(ctx, rendered, x + 42, y + 17, summarySize, "#4b594e", "700");
    modal.renderedSettlementRewardRows = [{ tag, text: summary, rendered, size: summarySize, truncated: rendered !== summary }];
  }

  settlementDisplayChanges(modal = {}) {
    const stats = (modal.stats || []).filter((item) => Number.isFinite(item.delta) && item.delta !== 0).map((item) => Object.assign({}, item, {
      label: String(item.label || "变化").replace("指数", ""),
      inverse: item.inverse || /偷猎|疾病|风险|威胁|压力/.test(String(item.label || ""))
    }));
    const fundDelta = Number(modal.fundAfter) - Number(modal.fundBefore);
    const fund = Number.isFinite(fundDelta) && fundDelta !== 0
      ? { key: "fund", label: "基金", before: Number(modal.fundBefore), after: Number(modal.fundAfter), delta: fundDelta }
      : null;
    const scoreDelta = Number(modal.scoreDelta) || 0;
    const score = scoreDelta
      ? { key: "guardianScore", label: "守护分", before: Number(modal.guardianScore || 0) - scoreDelta, after: Number(modal.guardianScore || 0), delta: scoreDelta }
      : null;
    const rankedStats = stats.slice().sort((a, b) => this.settlementChangePriority(b) - this.settlementChangePriority(a));
    let primary = null;
    if (modal.materialExploration) {
      const reward = modal.materialExploration.reward;
      primary = reward
        ? { key: `explore:${reward.id || reward.label}`, label: reward.label, customValue: `×${reward.amount}`, amount: Number(reward.amount) || 1, delta: Number(reward.amount) || 1, beneficial: true }
        : { key: "explore:note", label: "调查记录", customValue: "已保存", amount: 1, delta: 1, beneficial: true };
    } else if (modal.recoveredGoodsGain && (modal.recoveredGoodsGain.items || []).length) {
      const item = modal.recoveredGoodsGain.items[0];
      primary = { key: `recovery:${item.id || item.label}`, label: item.label, customValue: `×${item.amount}`, amount: Number(item.amount) || 1, delta: Number(item.amount) || 1, beneficial: true };
    } else if (modal.mysteryRecovery) {
      primary = { key: `mystery:${modal.mysteryRecovery.id || modal.mysteryRecovery.name}`, label: modal.mysteryRecovery.name, customValue: "已封存", amount: 1, delta: 1, beneficial: true };
    } else if (modal.commerce && fund) {
      primary = fund;
    } else {
      primary = rankedStats[0] || fund || score;
    }
    const pool = rankedStats.concat(fund ? [fund] : [], score ? [score] : []);
    const seen = new Set(primary ? [primary.key || primary.label] : []);
    const secondary = [];
    pool.forEach((item) => {
      const key = item.key || item.label;
      if (seen.has(key) || secondary.length >= 2) return;
      seen.add(key);
      secondary.push(item);
    });
    return { primary, secondary };
  }

  settlementChangePriority(item = {}) {
    const label = String(item.label || "");
    const magnitude = Math.abs(Number(item.delta) || 0);
    const danger = /偷猎|疾病|风险|威胁|压力/.test(label) ? 14 : 0;
    const survival = /安全|水源|迁移/.test(label) ? 3 : 0;
    return magnitude + danger + survival;
  }

  settlementChangeTone(item = {}) {
    const inverse = item.inverse || /偷猎|疾病|风险|威胁|压力/.test(String(item.label || ""));
    const delta = Number(item.delta) || 0;
    const beneficial = item.beneficial == null ? (delta === 0 ? null : (inverse ? delta < 0 : delta > 0)) : !!item.beneficial;
    if (beneficial === true) return { beneficial, color: "#16895c", pill: "#e3f3df", soft: "#f5f2e5", rgb: "72,201,135" };
    if (beneficial === false) return { beneficial, color: "#cf5948", pill: "#f5ded6", soft: "#f5f2e5", rgb: "255,126,107" };
    return { beneficial, color: "#8b6f2a", pill: "#eee5c8", soft: "#f5f2e5", rgb: "216,174,62" };
  }

  settlementChangeProgress(modal = {}, now = Date.now()) {
    if (!Number.isFinite(modal.valueRevealAt)) return 1;
    const elapsed = Math.max(0, now - modal.valueRevealAt);
    const linear = Math.min(1, elapsed / 600);
    return 1 - Math.pow(1 - linear, 3);
  }

  settlementAnimatedMetric(item = {}, progress = 1) {
    const before = Number(item.before) || 0;
    const delta = Number(item.delta) || 0;
    const after = progress >= 1 ? Number(item.after) : Math.round(before + delta * Math.max(0, Math.min(1, progress)));
    return { before, after: Number.isFinite(after) ? after : before, delta: progress >= 1 ? delta : Math.round(delta * Math.max(0, Math.min(1, progress))) };
  }

  settlementAnimatedCustomValue(item = {}, progress = 1) {
    if (!item.customValue) return "";
    if (!Number.isFinite(item.amount) || /封存/.test(item.customValue)) return item.customValue;
    const amount = progress >= 1 ? item.amount : Math.max(0, Math.round(item.amount * Math.max(0, Math.min(1, progress))));
    return `${String(item.customValue).startsWith("+") ? "+" : "×"}${amount}`;
  }

  drawSettlementRewardRows(ctx, modal, lines, x, y, w, h, compact = false) {
    const rows = (lines || []).slice(0, 3).map((line, index) => {
      const value = String(line || "");
      const splitAt = value.search(/[:：]/);
      const fallback = index === 0 ? "获得" : index === 1 ? "依据" : "后续";
      return {
        tag: splitAt > 0 ? value.slice(0, splitAt).slice(0, 4) : fallback,
        text: splitAt > 0 ? value.slice(splitAt + 1).trim() : value
      };
    });
    const rowGap = rows.length >= 3 ? Math.max(14, Math.floor(h / 3)) : Math.max(16, Math.floor(h / Math.max(1, rows.length)));
    modal.renderedSettlementRewardRows = [];
    rows.forEach((row, index) => {
      const lineY = y + 10 + index * rowGap;
      const tagW = index === 0 ? 42 : 38;
      this.roundRect(ctx, x, lineY - 11, tagW, 16, 6, index === 0 ? "rgba(216,174,62,.18)" : "rgba(36,64,46,.07)");
      this.text(ctx, row.tag, x + tagW / 2, lineY + 1, 9, index === 0 ? "#8b6f2a" : "#66715f", "700", "center");
      const size = index === 0 ? (compact ? 10 : 11) : 10;
      const available = w - tagW - 7;
      const rendered = this.truncateTextToWidth(ctx, row.text, available, size, index === 0 ? "700" : "400");
      this.text(ctx, rendered, x + tagW + 7, lineY + 1, size, index === 0 ? "#1c3325" : "#4b594e", index === 0 ? "700" : "400");
      modal.renderedSettlementRewardRows.push({ tag: row.tag, text: row.text, rendered, size, truncated: rendered !== row.text });
    });
  }

  settlementRewardDisplayLines(modal, compact) {
    if (modal.materialExploration) {
      const exploration = modal.materialExploration;
      return [
        exploration.reward ? `入库：${exploration.reward.label} ×${exploration.reward.amount}` : "结果：未发现物资 · 调查记录已保存",
        `点数：${exploration.roll}+${exploration.levelContribution}+${exploration.relationshipContribution}=${exploration.qualityScore}`
      ];
    }
    if (modal.commerce && modal.commerce.count > 0) {
      const fundingLabel = modal.commerce.fundingLabel || "研究补助";
      return [
        `${fundingLabel}：基金 ${modal.fundBefore}→${modal.fundAfter}（${this.signed(modal.fundAfter - modal.fundBefore)}）`,
        `项目拨款：${modal.commerce.baseValue}×${modal.commerce.levelFactor.toFixed(2)}×${modal.commerce.neighborFactor.toFixed(2)}=${modal.commerce.value}`
      ];
    }
    if (modal.storyBeats && modal.storyBeats.length && !this.settlementCrisisAction(modal)) {
      const lines = modal.storyBeats.slice(0, 1);
      if (modal.neighborComparison && modal.neighborComparison.text) lines.push(`对比：${modal.neighborComparison.text}`);
      else if (modal.storyBeats[1]) lines.push(modal.storyBeats[1]);
      return lines.slice(0, 2);
    }
    if (modal.causality) {
      const crisisAction = this.settlementCrisisAction(modal);
      const reward = (modal.rewards || []).find((line) => line && !/^明日/.test(line));
      const rhythm = modal.strategyRhythm || {};
      if (crisisAction) {
        return [
          `处置：${crisisAction.label} · ${this.shortGameText(crisisAction.guidance, 14)}`,
          `原因：${this.shortGameText(crisisAction.reason, 20)}`
        ];
      }
      const impact = this.shortGameText(modal.causality.animalLine || modal.causality.statLine || "保护区状态已更新", 24);
      const second = reward
        ? `获得：${this.shortGameText(String(reward).replace(/^(?:收益|获得)[:：]/, ""), 22)}`
        : rhythm.penalty
          ? `节奏：重复操作衰减 ${rhythm.penalty} 级`
          : rhythm.varietyBonus
            ? "节奏：多种手段形成协同"
            : modal.quickFeedback
              ? `后续：${this.shortGameText(modal.quickFeedback, 22)}`
              : "";
      return [`影响：${impact}`, second].filter(Boolean).slice(0, 2);
    }
    const raw = modal.returnScreen === "role" ? (modal.materials || modal.rewards || []) : (modal.rewards || modal.materials || []);
    const lines = raw
      .filter((line) => line && !/^明日(?:影响|建议)?[:：]/.test(line))
      .map((line) => String(line).replace(/^获得[:：]/, "").replace(/^收益[:：]/, "").replace(/^消耗[:：]/, "消耗：").replace(/^代价[:：]/, "代价："));
    return lines.slice(0, 2).map((line, index) => `${index === 0 ? "结果" : "明细"}：${this.shortGameText(line, 24)}`);
  }

  signed(value) {
    const n = Math.round(value || 0);
    if (n > 0) return `+${n}`;
    return `${n}`;
  }

  resolveMenuButtonRect() {
    if (!this.runtime || typeof this.runtime.getMenuButtonBoundingClientRect !== "function") return null;
    try {
      const rect = this.runtime.getMenuButtonBoundingClientRect();
      if (!rect || typeof rect.left !== "number" || typeof rect.bottom !== "number") return null;
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      };
    } catch (e) {
      return null;
    }
  }

  systemTopInset() {
    const info = this.info || {};
    const safeTop = info.safeArea && typeof info.safeArea.top === "number" ? info.safeArea.top : 0;
    const statusTop = typeof info.statusBarHeight === "number" ? info.statusBarHeight : 0;
    const menuBottom = this.menuButtonRect && typeof this.menuButtonRect.bottom === "number" ? this.menuButtonRect.bottom + 8 : 0;
    return Math.max(0, safeTop, statusTop, menuBottom);
  }

  compactStageTop() {
    const info = this.info || {};
    const statusTop = typeof info.statusBarHeight === "number" ? info.statusBarHeight : 0;
    const menuTop = this.menuButtonRect && typeof this.menuButtonRect.top === "number" ? this.menuButtonRect.top : 0;
    if (menuTop > 0) return Math.max(4, menuTop - 4);
    return Math.max(8, statusTop);
  }

  homeHeroTop() {
    const inset = this.systemTopInset();
    if (!inset) return 16;
    return Math.max(16, Math.min(96, inset));
  }

  effectiveHeroHeight(y, h) {
    return h + Math.max(0, y - 16);
  }

  drawDailyLetterHero(ctx, eyebrow, letter, topY = this.homeHeroTop()) {
    const x = 12;
    const y = topY;
    const w = this.width - 24;
    const h = 164;
    this.roundRect(ctx, x, y + 6, w, h, 22, "rgba(18,61,52,.22)");
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, UI_THEME.forest700);
    g.addColorStop(0.62, UI_THEME.forest800);
    g.addColorStop(1, UI_THEME.forest900);
    this.roundRect(ctx, x, y, w, h, 22, g, "rgba(232,224,201,.34)");
    if (this.artReady("map")) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.globalAlpha = 0.48;
      this.drawCoverImage(ctx, this.art.map, x, y, w, h);
      ctx.restore();
      const overlay = ctx.createLinearGradient(x, y, x + w, y + h);
      overlay.addColorStop(0, "rgba(5,24,16,.76)");
      overlay.addColorStop(.55, "rgba(8,32,21,.48)");
      overlay.addColorStop(1, "rgba(73,63,31,.58)");
      this.roundRect(ctx, x, y, w, h, 12, overlay);
    }
    this.roundRect(ctx, x + 12, y + 12, w - 24, 24, 12, "rgba(251,248,238,.92)", "rgba(201,170,106,.42)");
    this.text(ctx, eyebrow, x + 22, y + 29, 11, UI_THEME.forest800, "700");

    const avatarSpace = letter.animal ? 88 : 0;
    const title = this.truncateTextToWidth(ctx, letter.title || "今日森林来信", w - 44 - avatarSpace, 24, "700");
    this.text(ctx, title, x + 20, y + 68, 24, "#fff8df", "700");
    if (letter.animal) {
      this.drawAnimalAvatar(ctx, letter.animal, x + w - 52, y + 70, 50, true);
    }

    this.roundRect(ctx, x + 18, y + 84, w - 36, 42, 8, "rgba(255, 248, 223, 0.16)", "rgba(240, 211, 118, 0.18)");
    this.drawFittedTextBlock(ctx, letter.quote || letter.body || "风向还没定，我先在边界听一会儿。", x + 32, y + 109, w - 64, 18, {
      size: 13,
      minSize: 10,
      lineHeight: 18,
      color: "#f3eddd"  // v3.0: 象牙白
    });

    const tagW = 68;
    const shareW = 72;
    const bottomY = y + h - 36;
    this.roundRect(ctx, x + 18, bottomY, tagW, 26, 7, "rgba(240, 211, 118, 0.20)", "rgba(240,211,118,0.28)");
    this.text(ctx, letter.tag || "动物心声", x + 18 + tagW / 2, bottomY + 17, 10, "#f0d376", "700", "center");
    this.text(ctx, this.truncateTextToWidth(ctx, letter.body || "", w - tagW - shareW - 76, 10, "700"), x + 96, bottomY + 17, 10, "#efe6c4", "700");
    this.roundRect(ctx, x + w - shareW - 18, bottomY, shareW, 26, 7, "rgba(255,248,223,0.14)", "rgba(240,211,118,0.26)");
    this.text(ctx, "明信片", x + w - shareW / 2 - 18, bottomY + 17, 10, "#f0d376", "700", "center");
    return h;
  }

  currentDateKey() {
    const d = new Date();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  recordWeeklyGuardianVisit() {
    if (!this.state || !this.state.character) return null;
    const today = this.currentDateKey();
    const ui = Object.assign({}, this.state.ui || {});
    const saved = Object.assign({ dates: [], activeDays: 0, streak: 0, lastVisitDate: "", lastCelebrated: 0, pending: false }, ui.weeklyGuardian || {});
    const dates = (saved.dates || []).filter((key, index, list) => /^\d{4}-\d{2}-\d{2}$/.test(key) && list.indexOf(key) === index).slice(-35);
    let streak = Math.max(0, saved.streak || 0);
    if (saved.lastVisitDate !== today) {
      const currentDay = Date.parse(`${today}T00:00:00`);
      const previousDay = saved.lastVisitDate ? Date.parse(`${saved.lastVisitDate}T00:00:00`) : NaN;
      const gap = Number.isFinite(previousDay) ? Math.round((currentDay - previousDay) / 86400000) : 0;
      streak = gap === 1 ? streak + 1 : 1;
    }
    if (dates.indexOf(today) < 0) dates.push(today);
    const activeDays = Math.max(saved.activeDays || 0, dates.length);
    const milestone = Math.floor(streak / 7) * 7;
    const pending = !!saved.pending || (milestone >= 7 && milestone > (saved.lastCelebrated || 0));
    ui.weeklyGuardian = Object.assign(saved, { dates: dates.slice(-35), activeDays, streak, lastVisitDate: today, pending });
    this.state.ui = ui;
    saveState(this.state);
    return ui.weeklyGuardian;
  }

  finishWeeklyGuardianCelebration() {
    const ui = Object.assign({}, this.state.ui || {});
    const weekly = Object.assign({}, ui.weeklyGuardian || {});
    weekly.pending = false;
    weekly.lastCelebrated = Math.floor((weekly.streak || 0) / 7) * 7;
    ui.weeklyGuardian = weekly;
    this.state.ui = ui;
    this.weeklyGuardianCelebration = null;
    saveState(this.state);
  }

  shouldShowDailyHero() {
    if (!this.state || !this.state.character) return false;
    const ui = this.state.ui || {};
    return ui.dailyHeroSeenDate !== this.currentDateKey();
  }

  markDailyHeroSeen() {
    this.state.ui = Object.assign({}, this.state.ui || {}, { dailyHeroSeenDate: this.currentDateKey() });
    saveState(this.state);
  }

  onboardingProgress() {
    const reserve = ((this.state.world || {}).reserve) || {};
    const totalActions = (((reserve.progression || {}).totalActions) || 0);
    const saved = Object.assign({ version: 2, firstChoice: "", completed: false, seen: {} }, ((this.state.ui || {}).onboarding) || {});
    if (totalActions >= 4) saved.completed = true;
    return Object.assign(saved, { totalActions, active: !!this.state.character && !saved.completed && totalActions < 4 });
  }

  saveOnboardingProgress(changes = {}) {
    const current = this.onboardingProgress();
    const next = Object.assign({}, current, changes, {
      version: 2,
      seen: Object.assign({}, current.seen || {}, changes.seen || {})
    });
    delete next.active;
    delete next.totalActions;
    this.state.ui = Object.assign({}, this.state.ui || {}, { onboarding: next });
    saveState(this.state);
    return next;
  }

  onboardingHomeGuide() {
    const progress = this.onboardingProgress();
    if (!progress.active) return null;
    if (progress.totalActions <= 0) {
      return { step: 1, title: "先完成第一次巡线", body: "水边有两件事，只选一件先处理。", label: "开始选择", stage: "first_choice" };
    }
    if (progress.totalActions === 1) {
      if (progress.stage === "second_action") {
        return { step: 2, title: "处理下一个红色风险", body: "从沙盘推荐行动继续，不必重新找入口。", label: "去巡护", stage: "second_action", direct: true };
      }
      return { step: 2, title: "读懂刚才的变化", body: "先看旧值、新值和动物回应。", label: "查看结果", stage: "after_first" };
    }
    if (progress.totalActions === 2) {
      if (progress.stage === "materials_action") {
        return { step: 3, title: "跟动物探索一次", body: "亲手掷六面骰，获得具体收集结果。", label: "去探索", stage: "materials_action", direct: true };
      }
      return { step: 3, title: "行动会消耗补给", body: "完成一次物资探索，接通补给循环。", label: "认识物资", stage: "materials" };
    }
    if (progress.stage === "final_action") {
      return { step: 4, title: "完成最后一次巡护", body: "完成后解锁第一项策略选择。", label: "完成引导", stage: "final_action", direct: true };
    }
    if (progress.stage === "population_view") {
      return { step: 4, title: "点开一张种群卡", body: "认识一个具体的动物朋友。", label: "去种群", stage: "population_view", direct: true };
    }
    return { step: 4, title: "动物关系会记住选择", body: "先认识一个种群，再回沙盘完成巡护。", label: "认识种群", stage: "population" };
  }

  activateOnboardingGuide(guide = this.onboardingHomeGuide()) {
    if (!guide) return false;
    if (guide.stage === "first_choice") return this.openFirstOnboardingChoice();
    if (guide.stage === "second_action" || guide.stage === "final_action") {
      this.openDailyTenMinuteAction();
      return true;
    }
    if (guide.stage === "materials_action") {
      this.setScreen("role");
      this.openMaterialExploration();
      return true;
    }
    if (guide.stage === "population_view") {
      this.setScreen("animalworld");
      this.toast("新任务：点开任意种群卡");
      return true;
    }
    return this.openOnboardingGuide(guide.stage, true);
  }

  openFirstOnboardingChoice() {
    const progress = this.onboardingProgress();
    if (!progress.active || progress.totalActions !== 0 || this.chapterStoryModal || this.settlementModal || this.patrolTaskModal || this.infoDetailModal) return false;
    this.saveOnboardingProgress({ startedAt: progress.startedAt || Date.now(), stage: "first_choice" });
    const reserve = (this.state.world || {}).reserve || {};
    const ecology = reserve.ecology || {};
    const supplies = reserve.supplies || {};
    const houndStatus = this.actionResourceStatus("houndScout", reserve);
    const houndCards = this.patrolTaskChangeCards("houndScout", reserve, houndStatus);
    const houndResult = houndCards.find((card) => card.label === "偷猎") || houndCards.find((card) => card.label === "发现") || {};
    const houndCost = houndCards.find((card) => card.label === "消耗") || {};
    const water = ecology.water || 0;
    const fund = reserve.fund || 0;
    this.infoDetailModal = {
      kind: "onboardingChoice",
      kicker: "第一次选择",
      title: "水边先处理哪一处？",
      icon: "trail",
      items: [
        { tag: "修复水源", title: `水源 ${water}→${Math.min(100, water + 4)}~${Math.min(100, water + 7)}`, body: `基金 ${fund}→${Math.max(0, fund - 60)} · 草场 +6` },
        { tag: "侦察脚印", title: `${houndResult.label || "偷猎"} ${houndResult.value || "预计下降"}`, body: `狗粮 ${houndCost.value || `${supplies.dogFood || 0}→${Math.max(0, (supplies.dogFood || 0) - 1)}`} · 可能发现回收物` }
      ],
      choices: [
        { label: "修复水源", action: () => this.executeOnboardingAction("habitat") },
        { label: "侦察脚印", action: () => this.executeOnboardingAction("houndScout") }
      ],
      footer: "选一项，立即看数字和动物回应。"
    };
    this.render();
    return true;
  }

  executeOnboardingAction(actionId) {
    const option = this.reserveActionOptions().find((item) => item.id === actionId);
    if (!option) return false;
    const resourceStatus = this.actionResourceStatus(option.id, (this.state.world || {}).reserve || {});
    if (!resourceStatus.canRun) {
      this.toast(this.actionBlockedToast(resourceStatus));
      return false;
    }
    this.infoDetailModal = null;
    this.selectedReserveAction = option.id;
    this.command = option.placeholder.replace("例如：", "");
    this.pendingTaskOriginScreen = "home";
    this.saveOnboardingProgress({ stage: "first_action", firstChoice: option.id });
    this.submitCommand();
    if (this.settlementModal) {
      this.settlementModal.onboardingFirstAction = true;
      this.settlementModal.breakthrough = { kicker: "第一次选择" };
      this.settlementModal.title = `你选择了 · ${option.shortLabel || option.label}`;
      this.saveOnboardingProgress({ stage: "first_result", firstActionDone: true });
      this.render();
    }
    return true;
  }

  onboardingGuideDetail(stage) {
    const details = {
      after_first: {
        title: "第一次选择已经改变森林",
        icon: "leaf",
        items: [
          { tag: "数字", title: "旧值 → 新值（±差值）", body: "绿色表示改善；偷猎和疾病下降也是改善" },
          { tag: "下一步", title: "先处理红色指标", body: "每次只解决一个重点" }
        ],
        actionLabel: "领取下一任务",
        action: () => {
          this.saveOnboardingProgress({ stage: "second_action" });
          this.infoDetailModal = null;
          this.setScreen("home");
          this.toast("新任务：处理下一个红色风险");
        }
      },
      materials: {
        title: "补给决定你能做什么",
        icon: "nav_materials",
        items: [
          { tag: "巡护", title: "猎犬消耗狗粮", body: "狗粮不足时不能侦察，警报器和麻醉弹也对应不同任务。" },
          { tag: "探索", title: "动物关系 + 等级 + 六面骰", body: "物资页可以跟随动物探索，结果会进入待收取区。" },
          { tag: "经营", title: "收取、移交、再投入", body: "守护样本可交给科研站或执法部门，获得研究补助或联合执法拨款。" }
        ],
        actionLabel: "领取探索任务",
        action: () => {
          this.saveOnboardingProgress({ stage: "materials_action" });
          this.infoDetailModal = null;
          this.setScreen("role");
          this.openMaterialExploration();
        }
      },
      population: {
        title: "种群数字背后是具体朋友",
        icon: "eye",
        items: [
          { tag: "种群", title: "数量变化有生态原因", body: "水草、疾病、偷猎和迁移共同决定动物增减。" },
          { tag: "关系", title: "不同动物有不同态度", body: "近期对白、命名个体和保护区记忆会随你的行动变化。" },
          { tag: "稍后解锁", title: "第4次有效操作开始出现策略事件", body: "二选一、三选一和骰子会逐步塑造你的长期路线。" }
        ],
        actionLabel: "去认识一个种群",
        action: () => {
          this.saveOnboardingProgress({ stage: "population_view" });
          this.infoDetailModal = null;
          this.setScreen("animalworld");
          this.toast("新任务：点开任意种群卡");
        }
      }
    };
    const detail = details[stage] || details.after_first;
    return Object.assign({
      kind: "onboardingGuide",
      stage,
      kicker: `上手 · ${Math.min(4, this.onboardingProgress().totalActions + 1)}/4`,
      footer: "完成第4次行动后，引导结束。"
    }, detail);
  }

  openOnboardingGuide(stage, force = false) {
    const progress = this.onboardingProgress();
    if ((!progress.active && !force) || !stage || (!force && (progress.seen || {})[stage])) return false;
    if (this.chapterStoryModal || this.settlementModal || this.patrolTaskModal || this.infoDetailModal) return false;
    this.saveOnboardingProgress({ stage, seen: { [stage]: true } });
    this.infoDetailModal = this.onboardingGuideDetail(stage);
    this.render();
    return true;
  }

  missionPushKey() {
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const view = this.currentGoalView();
    const primary = view.primary || {};
    return [
      ((reserve.progression || {}).level) || 1,
      primary.id || "goal",
      primary.recommendedAction || "",
      (((world.goals || {}).daily || {}).cycle) || 1,
      (reserve.eventChain || {}).step || 0
    ].join("|");
  }

  currentGoalView(forceRefresh = false) {
    const world = this.state.world || (this.state.world = {});
    const now = Date.now();
    const saved = world.goals;
    const totalActions = (((world.reserve || {}).progression || {}).totalActions) || 0;
    const needsRefresh = forceRefresh
      || !saved
      || saved.version !== 3
      || !saved.daily
      || saved.daily.dateKey !== goalDateKey(now)
      || !saved.active
      || !saved.active.primary
      || Number(saved.active.generatedAtAction || 0) !== Number(totalActions);
    if (needsRefresh) {
      const normalized = normalizeGoalState(saved, this.state, now);
      world.goals = resolveGoals(this.state, normalized, forceRefresh ? "explicit_refresh" : "state_refresh");
    }
    return buildGoalView(this.state, world.goals);
  }

  goalTypeLabel(goal = {}) {
    if (goal.storyAligned) return "主线";
    return {
      crisis: "紧急",
      recovery: "恢复",
      stage: "章节",
      daily: "今日",
      story: "发现",
      long: "成长",
      fallback: "观察"
    }[goal.kind] || "目标";
  }

  openGoalCenter(selectedGoalId = "") {
    let view = this.currentGoalView();
    let goals = [view.primary].concat(view.alternatives || []).filter(Boolean);
    if (!goals.length) return false;
    // 从地图、任务卡等入口直接打开某个备选目标时，先把它写成唯一
    // 当前目标，避免弹窗视觉上选中了它，首页却仍追踪旧目标。
    if (selectedGoalId && selectedGoalId !== ((view.primary || {}).id)) {
      const world = this.state.world || (this.state.world = {});
      world.goals = selectActiveGoal(world.goals, selectedGoalId);
      view = buildGoalView(this.state, world.goals);
      goals = [view.primary].concat(view.alternatives || []).filter(Boolean);
      saveState(this.state);
    }
    const selected = goals[0];
    const dailyProjection = (((this.state.world || {}).goals || {}).daily) || {};
    this.infoDetailModal = {
      kind: "missionPush",
      kicker: dailyProjection.chapter || `今日守护 ${view.daily.complete}/${view.daily.total}`,
      title: "当前目标",
      icon: selected.icon || "trail",
      goals,
      selectedGoalId: selected.id,
      currentGoalId: view.primary.id,
      showAlternatives: false,
      daily: view.daily,
      stage: view.stage,
      longTerm: view.longTerm,
      items: goals.map((goal, index) => ({
        tag: index === 0 ? "当前" : "可替换",
        title: goal.title,
        body: goal.body || goal.rewardText
      })).concat([{ tag: "奖励", title: selected.rewardText || "推进保护区", body: `今日 ${view.daily.complete}/${view.daily.required} · 完成后自动接棒下一目标` }]),
      mission: { actionTitle: selected.buttonLabel || "去完成" },
      actionLabel: selected.buttonLabel || "去完成",
      action: () => this.executeGoalAction(this.selectedGoalFromModal()),
      footer: `当前只追踪1个目标；需要时可主动更换 · 今日 ${view.daily.complete}/${view.daily.required}`
    };
    this.render();
    return true;
  }

  selectedGoalFromModal(modal = this.infoDetailModal) {
    const goals = (modal && modal.goals) || [];
    return goals.find((goal) => goal.id === modal.selectedGoalId) || goals[0] || null;
  }

  selectGoalAsPrimary(goalId) {
    const world = this.state.world || (this.state.world = {});
    if (!world.goals || !goalId) return false;
    world.goals = selectActiveGoal(world.goals, goalId);
    const view = buildGoalView(this.state, world.goals);
    if (this.infoDetailModal && this.infoDetailModal.goals) {
      const goals = [view.primary].concat(view.alternatives || []).filter(Boolean);
      this.infoDetailModal.goals = goals;
      this.infoDetailModal.currentGoalId = view.primary.id;
      this.infoDetailModal.selectedGoalId = view.primary.id;
      this.infoDetailModal.icon = view.primary.icon || "trail";
      this.infoDetailModal.showAlternatives = false;
      this.infoDetailModal.actionLabel = view.primary.buttonLabel || "去完成";
    }
    saveState(this.state);
    this.playSfx("tap");
    this.render();
    return true;
  }

  executeGoalAction(goal = this.selectedGoalFromModal()) {
    if (!goal) return false;
    // 先把玩家的选择写回唯一当前目标，再执行跳转。这样后续结算只推进
    // 这一个目标，旧主目标不会继续以“最优先”身份留在界面上。
    const world = this.state.world || (this.state.world = {});
    if (world.goals && ((world.goals.active || {}).primary || {}).id !== goal.id) {
      world.goals = selectActiveGoal(world.goals, goal.id);
      saveState(this.state);
    }
    const action = goal.recommendedAction || "houndScout";
    this.infoDetailModal = null;
    if (action === "collectionInvestigate") {
      normalizeCollectionState(this.state);
      const collection = ((this.state.world || {}).collection || {});
      const active = ((collection.discovery || {}).active) || null;
      const lead = (collection.leads || [])[0];
      if (active && active.status === "located") {
        this.setScreen("home");
        this.toast("点击沙盘上发光的物件完成收录");
      } else {
        this.setScreen("collection");
        if (lead) this.openCollectionInvestigation(lead.id);
      }
      return true;
    }
    if (action === "facilityBuild") {
      const reserve = (this.state.world || {}).reserve || {};
      const facility = facilityStates(this.state).find((item) => item.repaired && item.buildStage < 3 && (reserve.fund || 0) >= (item.nextBuildCost || item.specializeCost || Infinity));
      if (facility) this.openReserveFacilityDetail(facility.id);
      else this.setScreen("home");
      return true;
    }
    if (action === "exploreMaterials") {
      this.setScreen("role");
      this.openMaterialExploration();
      return true;
    }
    if (action === "animalCare") {
      this.setScreen("animalworld");
      this.toast("选择一只命名动物进行安抚");
      return true;
    }
    if (action === "shiftHandover") return this.handoverPatrolShift();
    if (action === "observeReserve") return this.completeFallbackObservation();
    this.openReserveViewAction(action, "sandbox-task", goal.purchaseId || null);
    return true;
  }

  completeFallbackObservation() {
    const beforeState = JSON.parse(JSON.stringify(this.state));
    const reserve = (this.state.world || {}).reserve || {};
    const accepted = addPendingRecovered(reserve, "researchSample", 1);
    reserve.progression = reserve.progression || {};
    reserve.progression.totalActions = (reserve.progression.totalActions || 0) + 1;
    const progress = applyGoalProgress(beforeState, this.state, { action: "observeReserve", now: Date.now() });
    this.state = progress.state;
    saveState(this.state);
    this.toast(accepted > 0
      ? "观察完成 · 研究样本待收 +1 · 已生成新的可执行目标"
      : "观察完成 · 待收区已满，请先收取样本");
    this.setScreen("home");
    return true;
  }

  mergeGoalResults(...results) {
    const valid = results.filter(Boolean);
    if (!valid.length) return null;
    const rewards = [];
    const completions = [];
    const rewardKeys = new Set();
    const completionKeys = new Set();
    valid.forEach((result) => {
      (result.rewards || []).forEach((item) => {
        const key = `${item.source || ""}:${item.type || ""}:${item.label || ""}:${item.amount || 0}`;
        if (!rewardKeys.has(key)) { rewardKeys.add(key); rewards.push(item); }
      });
      (result.completions || []).forEach((item) => {
        const key = item.id || `${item.type}:${item.title}`;
        if (!completionKeys.has(key)) { completionKeys.add(key); completions.push(item); }
      });
    });
    return { rewards, completions, primary: (valid[valid.length - 1] || {}).primary || valid[0].primary || null };
  }

  reconcileDerivedGoalProgress(beforeWorld, result, actionId) {
    const beforeState = Object.assign({}, this.state, { world: beforeWorld || {} });
    const progress = applyGoalProgress(beforeState, this.state, { action: actionId || "", derivedOnly: true, now: Date.now() });
    this.state = progress.state;
    if (result) {
      result.world = this.state.world;
      result.visual = Object.assign({}, result.visual || {}, {
        goalResult: this.mergeGoalResults((result.visual || {}).goalResult, progress),
        dailyGoalDone: !!((result.visual || {}).dailyGoalDone || progress.dailyGoalDone)
      });
    }
    return progress;
  }

  queueMissionPush(reason = "settlement") {
    const key = this.missionPushKey();
    if (this.pendingMissionPush && this.pendingMissionPush.key === key) return false;
    const reserve = (this.state.world || {}).reserve || {};
    this.pendingMissionPush = {
      key,
      reason,
      queuedAtAction: (((reserve.progression || {}).totalActions) || 0)
    };
    this.state.ui = Object.assign({}, this.state.ui || {}, {
      pendingMissionPush: Object.assign({}, this.pendingMissionPush)
    });
    saveState(this.state);
    return true;
  }

  openQueuedMissionPush() {
    const pending = this.pendingMissionPush;
    if (!pending || this.screen !== "home") return false;
    if (this.chapterStoryModal || this.settlementModal || this.patrolTaskModal || this.infoDetailModal) return false;
    this.pendingMissionPush = null;
    this.state.ui = Object.assign({}, this.state.ui || {});
    delete this.state.ui.pendingMissionPush;
    const opened = this.maybeOpenMissionPush(pending.reason || "settlement", { force: true });
    if (!opened) {
      this.pendingMissionPush = pending;
      this.state.ui.pendingMissionPush = Object.assign({}, pending);
      saveState(this.state);
    }
    return opened;
  }

  dismissInfoDetailModal() {
    this.infoDetailModal = null;
    if (!this.openQueuedMissionPush()) this.render();
  }

  markMissionPushSeen(key = this.missionPushKey(), actionCount = null) {
    const reserve = (this.state.world || {}).reserve || {};
    const totalActions = actionCount == null ? (((reserve.progression || {}).totalActions) || 0) : actionCount;
    this.state.ui = Object.assign({}, this.state.ui || {}, { missionPushSeenKey: key, lastMissionAutoAction: totalActions });
    saveState(this.state);
  }

  maybeOpenMissionPush(reason = "home", options = {}) {
    if (!this.state || !this.state.character || this.screen !== "home") return false;
    if (this.onboardingProgress().active && !options.force) return false;
    if (this.chapterStoryModal || this.settlementModal || this.patrolTaskModal || this.infoDetailModal) return false;
    const reserve = (this.state.world || {}).reserve || {};
    const daily = ((this.state.world || {}).goals || {}).daily || {};
    if (!daily.title && !daily.story && !daily.recommendedAction) return false;
    const key = this.missionPushKey();
    const ui = this.state.ui || {};
    if (!options.force && ui.missionPushSeenKey === key) return false;
    const progression = reserve.progression || {};
    const totalActions = progression.totalActions || 0;
    const level = Math.max(1, Math.min(5, progression.level || 1));
    const minActionGap = 7 + level * 2;
    const firstMission = totalActions === 0;
    const chapterIntro = reason === "chapter" || reason === "newbie";
    if (!options.force && !chapterIntro && totalActions < (ui.quietUntilAction || 0)) return false;
    if (!options.force && !firstMission && !chapterIntro && totalActions - (ui.lastMissionAutoAction || 0) < minActionGap) return false;
    this.markMissionPushSeen(key, totalActions);
    return this.openGoalCenter();
  }

  openMissionPush(reason = "manual") {
    return this.openGoalCenter();
  }

  buildMissionPushDetail(reason = "home") {
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const ecology = reserve.ecology || {};
    const daily = (world.goals || {}).daily || {};
    const baseOption = this.reserveActionOptions().find((item) => item.id === daily.recommendedAction)
      || this.reserveActionOptions().find((item) => item.id === this.recommendedPatrolAction(reserve))
      || this.selectedReserveActionOption();
    const socialRecovery = daily.buttonLabel === "抢回回收物";
    const option = socialRecovery ? Object.assign({}, baseOption, {
      label: "抢回回收物",
      placeholder: "例如：抢回回收物：派猎犬搜寻共享回收点",
      effect: "物质回收 +2，进入待收取区",
      hint: "完成后会明确列出研究样本与陷阱证据的增加数量。"
    }) : baseOption;
    const title = (daily.title || "今日目标：完成一次有效巡护").replace("今日目标：", "");
    const missionProgress = `${daily.progress || 0}/${daily.target || 3}`;
    const chain = reserve.eventChain || {};
    const pressureLine = this.reserveWarning(reserve);
    const social = reserve.social || {};
    const intro = reason === "login"
      ? `第 ${world.day || 1} 日，森林先把最急的事推给你。`
      : "新的巡护目标已经刷新，先看清楚再行动。";
    const items = [
      { tag: "发生了", title: intro, body: daily.story || "动物、天气和边界压力都在变化，今天需要你做一个明确决定。" },
      { tag: "要你做", title: `${daily.buttonLabel || option.label} · ${missionProgress}`, body: daily.description || option.hint || "完成多次相关操作，数据满足后才会推进阶段事件。" },
      { tag: "奖励", title: daily.reward || "推进阶段目标", body: daily.completedPrevious ? "上一目标已结算。" : `当前 ${missionProgress} · 达标后结算。` }
    ];
    if (social.log) {
      items.splice(1, 0, {
        tag: social.actorScope === "world" ? "世界" : "好友",
        title: social.title || "保护地联动",
        body: `${this.socialStoryLine(social)} ${this.socialImpactLine(social)}。可到保护地网络查看朋友/世界保护区，并选择边界巡查或加固防护网。`
      });
    }
    return {
      kind: "missionPush",
      kicker: daily.chapter || "今日剧情",
      title,
      icon: option.icon || "eye",
      items,
      mission: {
        actionTitle: daily.buttonLabel || option.label || "执行任务",
        actionBody: `${daily.description || option.hint || "按推荐操作执行。"} 当前 ${missionProgress}，需要多次认真操作。`,
        focusLine: daily.reward || "完成后进入结算，动物和沙盘都会回应。",
        reasonTitle: pressureLine,
        reasonBody: chain.current && chain.current.prompt ? chain.current.prompt : `安全 ${reserve.safety || 0}，水源 ${ecology.water || 0}，偷猎 ${reserve.poacherPressure || 0}，迁移 ${this.migrationLabel(reserve.migration || {})}。`,
        rewardTitle: daily.reward || "推进阶段目标",
        rewardBody: daily.completedPrevious ? "上一目标已结算。" : `当前 ${missionProgress} · 达标后刷新。`,
        secondaryTag: social.log ? (social.actorScope === "world" ? "世界" : "好友") : "刚发生",
        secondaryTitle: social.log ? (social.title || "保护地联动") : intro,
        secondaryBody: social.log
          ? `${this.socialStoryLine(social)} ${this.socialImpactLine(social)}。`
          : (daily.story || "动物、天气和边界压力都在变化，今天需要你做一个明确决定。")
      },
      footer: "巡护页可再次查看。",
      actionLabel: daily.buttonLabel || option.label || "执行任务",
      action: () => {
        this.infoDetailModal = null;
        this.selectedReserveAction = option.id;
        this.command = option.placeholder.replace("例如：", "");
        this.setScreen("action");
        this.openPatrolTaskModal(option);
      }
    };
  }

  updateDailyHeroAutoCollapse() {
    if (!this.dailyHeroExpanded || !this.dailyHeroCollapseAt || !this.anim) return;
    if (this.screen !== "home") return;
    if (this.anim.t < this.dailyHeroCollapseAt) return;
    this.dailyHeroExpanded = false;
    this.dailyHeroCollapseAt = 0;
    this.markDailyHeroSeen();
  }

  drawHomeHero(ctx, world, time) {
    const letter = this.dailyAnimalLetter();
    const eyebrow = `${world.name} · 第 ${world.day} 日 ${time.phase || ""}`;
    const title = this.state.character ? letter.title : "自然保护区卫士";
    const subtitle = this.state.character ? letter.body : (world.premise || "动物、天气、项目需求和偷猎压力会一起改变保护区。");
    const heroY = this.homeHeroTop();
    if (this.dailyHeroExpanded) {
      const heroH = this.drawDailyLetterHero(ctx, eyebrow, letter, heroY);
      this.addHit(12, heroY - this.scrollY, this.width - 24, heroH, () => {
        this.dailyHeroExpanded = false;
        this.dailyHeroCollapseAt = 0;
        this.markDailyHeroSeen();
        this.render();
      });
      this.addHit(this.width - 112, heroY + heroH - 46 - this.scrollY, 92, 42, () => this.openForestPostcard());
      return this.effectiveHeroHeight(heroY, heroH);
    }
    const x = 12;
    const y = heroY;
    const w = this.width - 24;
    const h = 62;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, UI_THEME.forest700);
    g.addColorStop(0.64, UI_THEME.forest800);
    g.addColorStop(1, UI_THEME.forest900);
    this.roundRect(ctx, x, y + 4, w, h, 18, "rgba(18,61,52,.20)");
    this.roundRect(ctx, x, y, w, h, 18, g, "rgba(255,255,255,.44)");
    if (this.artReady("map")) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.globalAlpha = 0.44;
      this.drawCoverImage(ctx, this.art.map, x, y, w, h);
      ctx.restore();
      const overlay = ctx.createLinearGradient(x, y, x + w, y + h);
      overlay.addColorStop(0, "rgba(5,24,16,.78)");
      overlay.addColorStop(1, "rgba(70,64,32,.54)");
      this.roundRect(ctx, x, y, w, h, 12, overlay);
    }
    this.text(ctx, title, x + 18, y + 25, 18, "#fff8df", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, subtitle, w - 148, 10, "700"), x + 18, y + 47, 10, "#e8d491", "700");
    this.roundRect(ctx, x + w - 128, y + 17, 54, 28, 14, UI_THEME.ivory, "rgba(201,170,106,.48)");
    this.text(ctx, "展开", x + w - 101, y + 36, 11, UI_THEME.forest800, "700", "center");
    this.roundRect(ctx, x + w - 68, y + 17, 52, 28, 14, "rgba(255,255,255,.26)", "rgba(255,255,255,.44)");
    this.text(ctx, "分享", x + w - 42, y + 36, 11, UI_THEME.ivory, "700", "center");
    this.addHit(x, y - this.scrollY, w, h, () => {
      this.dailyHeroExpanded = true;
      this.dailyHeroCollapseAt = 0;
      this.render();
    });
    this.addHit(x + w - 76, y + 10 - this.scrollY, 66, 44, () => this.openForestPostcard());
    return this.effectiveHeroHeight(y, h);
  }

  dailyAnimalLetter() {
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const animals = this.sandboxAnimalRoster(world);
    const fallback = {
      title: "今日森林来信",
      body: "动物还在观察你的保护区。完成一次巡护后，明天会有更具体的心声。",
      quote: "风向还没定，我先在边界听一会儿。",
      tag: "动物心声",
      animal: animals[0] || null,
      animalName: "森林居民"
    };
    if (!animals.length) return fallback;
    const seed = Math.abs(this.hashString(`${this.currentDateKey()}|${world.day || 1}|${reserve.safety || 0}|${(reserve.migration || {}).delta || 0}`));
    const animal = animals[seed % animals.length];
    const context = this.previewAnimalDialogueContext(animal, (seed % 5) + 1);
    const speech = this.shortGameText(this.animalSpeech(animal, context), 38);
    const action = this.shortGameText(this.animalNextMove(animal, context), 28);
    const status = this.animalStatusTag(animal, context);
    const name = this.animalDisplayName(animal);
    return {
      title: `${name}的来信`,
      body: `${speech} · ${action}`,
      quote: speech,
      tag: status,
      animal,
      animalName: name
    };
  }

  drawHome(ctx) {
    const world = this.state.world;
    const time = world.time || {};
    if (!this.state.character) {
      this.drawHomeHero(ctx, world, time);
      this.panel(ctx, 16, 200, this.width - 32, 180);
      this.text(ctx, "开局一队狗，繁荣全靠你", 32, 238, 18, "#1c3325", "700");
      this.wrapText(ctx, "点沙盘动物、派猎犬巡护、拿随机奖励，再把收益投回保护区。", 32, 266, this.width - 64, 14, 20, "#3b4a3e");
      this.button(ctx, 32, 316, this.width - 64, 48, "成为卫士", "#1c3325", () => this.setScreen("choose"));
      this.bottom(374);
      return;
    }
    const stageTop = this.compactStageTop();
    this.drawReserveIdentityPill(ctx, 12, stageTop + 4, this.width - 24, (this.state.world || {}).reserve || {});
    const infoDockH = this.sandboxInfoDockHeight();
    const menuBottom = this.menuButtonRect && typeof this.menuButtonRect.bottom === "number" ? this.menuButtonRect.bottom : 0;
    const infoY = Math.max(stageTop + 40, menuBottom + 8, 48);
    const mapY = infoY;
    const mapH = 930;
    const leagueY = mapY + mapH + 22;
    const leagueH = 106;
    if (this.isVisible(mapY, mapH)) this.drawReserveOverview(ctx, 3, mapY, this.width - 6, mapH, { immersive: true });
    if (this.isVisible(infoY, infoDockH)) this.drawSandboxInfoDock(ctx, 8, infoY + 8, this.width - 16);
    this.renderedHomeActionDock = null;
    if (this.isVisible(leagueY, leagueH)) this.drawLeagueTeaser(ctx, 16, leagueY, this.width - 32);
    let homeBottom = leagueY + leagueH;
    this.bottom(homeBottom + 10);
  }

  playablePrologueState() {
    const saved = Object.assign({ version: 1, stage: "fog", completed: false, revealStartedAt: 0 }, (((this.state || {}).ui || {}).prologue) || {});
    if (saved.completed) return Object.assign(saved, { stage: "complete", active: false });
    if (this.state.character && !((((this.state || {}).ui || {}).prologue) || {}).version) {
      return { version: 1, stage: "complete", completed: true, revealStartedAt: 0, active: false, legacy: true };
    }
    const validStages = ["fog", "trail", "reveal"];
    if (!validStages.includes(saved.stage)) saved.stage = "fog";
    return Object.assign(saved, { active: true });
  }

  savePlayablePrologue(changes = {}) {
    const current = this.playablePrologueState();
    const next = Object.assign({}, current, changes, { version: 1 });
    delete next.active;
    delete next.legacy;
    this.state.ui = Object.assign({}, this.state.ui || {}, { prologue: next });
    saveState(this.state);
    return next;
  }

  prologueRevealProgress(now = Date.now()) {
    const prologue = this.playablePrologueState();
    if (prologue.stage !== "reveal") return 0;
    return Math.max(0, Math.min(1, (now - Number(prologue.revealStartedAt || now)) / 3200));
  }

  prologueStageRuntime(stage) {
    const now = Date.now();
    if (!this.prologueRuntime || this.prologueRuntime.stage !== stage) {
      const prologue = this.playablePrologueState();
      const savedStart = stage === "reveal" ? Number(prologue.revealStartedAt || 0) : 0;
      this.prologueRuntime = {
        stage,
        startedAt: savedStart || now,
        touchFlashUntil: 0
      };
    }
    return Object.assign(this.prologueRuntime, { elapsed: Math.max(0, now - this.prologueRuntime.startedAt) });
  }

  prologueCanAdvance(stage, force = false) {
    if (force) return true;
    const elapsed = this.prologueStageRuntime(stage).elapsed;
    if (stage === "fog") return elapsed >= 1850;
    if (stage === "trail") return elapsed >= 2050;
    if (stage === "reveal") return this.prologueRevealProgress() >= .99 && elapsed >= 3800;
    return false;
  }

  ensurePlayablePrologueGuardian() {
    if (this.state.character) return this.state.character;
    const previousUi = Object.assign({}, this.state.ui || {});
    const sharedInvite = this.pendingShareInvite || previousUi.pendingShareInvite || null;
    const next = createCharacter(this.selectedAnimal, "保护区卫士");
    next.ui = Object.assign({}, next.ui || {}, previousUi, {
      onboarding: { version: 2, stage: "chapter", firstChoice: "", firstActionDone: false, completed: false, seen: {} },
      prologue: Object.assign({}, previousUi.prologue || {}, { version: 1, stage: "reveal", completed: false })
    });
    this.state = next;
    normalizeAudioSettings(this.state);
    if (this.audio) this.audio.attachState(this.state);
    this.selectedTarget = this.state.world.knownCharacters[0];
    this.speakingAnimalId = (this.selectedTarget && this.selectedTarget.id) || null;
    this.selectedRegionId = this.defaultRegionId();
    this.displayStats = this.initialDisplayStats();
    this.displayReserveStats = this.initialDisplayReserveStats();
    if (sharedInvite) {
      const assisted = this.acceptShareInvite(sharedInvite, true);
      this.pendingShareWelcome = null;
      if (assisted.applied) this.toast(`已为${sharedInvite.name}接力：共护声誉与动物信任提升`);
    }
    saveState(this.state);
    return this.state.character;
  }

  advancePlayablePrologue(force = false) {
    const prologue = this.playablePrologueState();
    if (!prologue.active) return false;
    if (prologue.stage === "fog") {
      if (!this.prologueCanAdvance("fog", force)) return false;
      this.savePlayablePrologue({ stage: "trail", firstDiscoveryAt: Date.now() });
      this.prologueRuntime = { stage: "trail", startedAt: Date.now(), touchFlashUntil: Date.now() + 520 };
      this.playSfx("confirm");
      this.render();
      return true;
    }
    if (prologue.stage === "trail") {
      if (!this.prologueCanAdvance("trail", force)) return false;
      this.ensurePlayablePrologueGuardian();
      this.savePlayablePrologue({ stage: "reveal", revealStartedAt: Date.now() });
      this.prologueRuntime = { stage: "reveal", startedAt: Date.now(), touchFlashUntil: Date.now() + 620 };
      this.playSfx("confirm");
      this.render();
      return true;
    }
    if (prologue.stage === "reveal" && this.prologueCanAdvance("reveal", force)) {
      return this.completePlayablePrologue(force);
    }
    return false;
  }

  completePlayablePrologue(force = false) {
    const prologue = this.playablePrologueState();
    if (!prologue.active || prologue.stage !== "reveal" || (!force && this.prologueRevealProgress() < .94)) return false;
    this.ensurePlayablePrologueGuardian();
    const ui = Object.assign({}, this.state.ui || {});
    ui.prologue = Object.assign({}, ui.prologue || {}, { version: 1, stage: "complete", completed: true, completedAt: Date.now() });
    ui.chapterStoriesSeen = Object.assign({}, ui.chapterStoriesSeen || {}, { "1:start": true });
    this.state.ui = ui;
    this.chapterStoryModal = null;
    this.chapterStoryQueue = [];
    this.pendingMissionAfterChapter = false;
    this.dailyHeroExpanded = false;
    this.dailyHeroCollapseAt = 0;
    saveState(this.state);
    this.playSfx("success");
    this.suppressNextHomeMission = true;
    this.setScreen("home");
    this.openFirstOnboardingChoice();
    return true;
  }

  drawProloguePawprints(ctx, fromX, fromY, toX, toY, count = 4) {
    const now = this.animT();
    for (let index = 0; index < count; index += 1) {
      const t = (index + 1) / (count + 1);
      const px = fromX + (toX - fromX) * t + (index % 2 ? 7 : -7);
      const py = fromY + (toY - fromY) * t;
      const pulse = .62 + (Math.sin(now * .006 - index * .8) + 1) * .14;
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = "#fff0a6";
      ctx.beginPath();
      ctx.ellipse(px, py, 5, 7, index % 2 ? .35 : -.35, 0, Math.PI * 2);
      ctx.fill();
      [[-4,-6],[0,-8],[4,-6]].forEach((dot) => {
        ctx.beginPath();
        ctx.arc(px + dot[0], py + dot[1], 1.8, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  }

  drawPlayablePrologueFog(ctx, stage, centerX, centerY, progress) {
    const diagonal = Math.sqrt(this.width * this.width + this.height * this.height);
    const pulse = (Math.sin(this.animT() * .0021) + 1) * 7;
    const revealEase = 1 - Math.pow(1 - Math.max(0, Math.min(1, progress)), 2);
    const radius = stage === "fog" ? 44 + pulse : stage === "trail" ? 138 + pulse : 86 + diagonal * 1.16 * revealEase;
    const outerAlpha = stage === "reveal" ? Math.max(0, .62 * Math.pow(1 - progress, 1.45)) : stage === "trail" ? .34 : .70;
    const innerAlpha = stage === "reveal" ? 0 : stage === "trail" ? .06 : .22;
    const fog = ctx.createRadialGradient(centerX, centerY, Math.max(12, radius * .20), centerX, centerY, radius);
    if (stage === "reveal") {
      fog.addColorStop(0, "rgba(220,237,226,0)");
      fog.addColorStop(.50, `rgba(205,228,217,${outerAlpha * .18})`);
      fog.addColorStop(.72, `rgba(132,170,153,${outerAlpha * .34})`);
      fog.addColorStop(1, `rgba(7,22,17,${outerAlpha})`);
    } else {
      fog.addColorStop(0, `rgba(7,24,18,${innerAlpha})`);
      fog.addColorStop(.48, `rgba(12,35,27,${Math.min(.88, innerAlpha + .12)})`);
      fog.addColorStop(1, `rgba(7,22,17,${outerAlpha})`);
    }
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, this.width, this.height);
    if (outerAlpha > .025) {
      const now = this.animT();
      const cloudCount = stage === "reveal" ? 7 : 4;
      ctx.save();
      ctx.shadowColor = `rgba(218,237,226,${stage === "reveal" ? outerAlpha * .22 : outerAlpha * .05})`;
      ctx.shadowBlur = stage === "reveal" ? 34 : 46;
      for (let index = 0; index < cloudCount; index += 1) {
        const baseX = this.width * (.08 + index * .15);
        const direction = index % 2 ? 1 : -1;
        const revealDrift = stage === "reveal" ? direction * this.width * revealEase * (.22 + index * .025) : 0;
        const ambientDrift = stage === "reveal" ? 0 : this.width * (((index * .17 + now * .000018) % 1) - .5);
        const driftX = baseX + revealDrift + ambientDrift;
        const driftY = this.height * (.12 + index * .125) - (stage === "reveal" ? this.height * revealEase * (.035 + index * .004) : 0);
        const mistAlpha = stage === "reveal" ? outerAlpha * (.075 + index * .008) : outerAlpha * (.012 + index * .003);
        ctx.fillStyle = `rgba(218,237,226,${mistAlpha})`;
        for (let lobe = 0; lobe < 3; lobe += 1) {
          ctx.beginPath();
          ctx.ellipse(driftX + (lobe - 1) * (32 + index * 2), driftY + (lobe % 2 ? -5 : 4), 62 + index * 8 + revealEase * 22, 20 + index * 3, direction * .06, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    return { radius, outerAlpha, revealEase, layeredMist: stage === "reveal" };
  }

  drawPrologueCinematicArt(ctx, stage, elapsed, revealProgress) {
    const panelOne = this.art && this.art.prologueFog;
    const panelTwo = (this.art && this.art.prologueTrail && this.art.prologueTrail.loaded) ? this.art.prologueTrail : panelOne;
    if (!panelOne || !panelOne.loaded || !ctx.drawImage) return false;
    const drift = Math.min(1, elapsed / 7000);
    const transition = this.prologueComicPanelTransition(stage, elapsed, revealProgress);
    const drawPanel = (image, offsetX, zoom, panX, panY, alpha = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(offsetX + this.width / 2 + panX, this.height / 2 + panY);
      ctx.scale(zoom, zoom);
      this.drawCoverImage(ctx, image, -this.width / 2, -this.height / 2, this.width, this.height);
      ctx.restore();
    };

    if (stage === "fog") {
      ctx.fillStyle = "#020b0a";
      ctx.fillRect(0, 0, this.width, this.height);
      const panelX = this.width * (1 - transition);
      ctx.save();
      ctx.beginPath();
      ctx.rect(Math.max(0, panelX - 2), 0, this.width - Math.max(0, panelX - 2), this.height);
      ctx.clip();
      drawPanel(panelOne, panelX, 1.10 - transition * .045 + drift * .01, -this.width * .012 * drift, this.height * (.014 - transition * .008), 1);
      ctx.restore();
      if (transition < 1) this.drawProloguePanelSeam(ctx, panelX, transition);
    } else if (stage === "trail" && transition < 1) {
      drawPanel(panelOne, -this.width * .10 * transition, 1.08 - transition * .045, 0, this.height * .012 * transition, 1);
      const panelX = this.width * (1 - transition);
      ctx.save();
      ctx.beginPath();
      ctx.rect(Math.max(0, panelX - 2), 0, this.width - Math.max(0, panelX - 2), this.height);
      ctx.clip();
      drawPanel(panelTwo, panelX, 1.085 - transition * .05, 0, -this.height * (.004 + transition * .004), 1);
      ctx.restore();
      this.drawProloguePanelSeam(ctx, panelX, transition);
    } else if (stage === "reveal" && transition < 1) {
      const panelX = this.width * (1 - transition);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, Math.min(this.width, panelX + 2), this.height);
      ctx.clip();
      drawPanel(panelTwo, -this.width * .10 * transition, 1.035 + transition * .012, this.width * .006 * transition, -this.height * .012 * transition, 1);
      ctx.restore();
      this.drawProloguePanelSeam(ctx, panelX, transition);
    } else {
      if (stage !== "reveal") drawPanel(panelTwo, 0, 1.035 - drift * .008, this.width * .008 * drift, -this.height * .008, 1);
    }

    const visibleGrade = stage === "reveal" ? Math.max(0, 1 - revealProgress) : 1;
    if (visibleGrade > .01) {
      const grade = ctx.createLinearGradient(0, 0, 0, this.height);
      grade.addColorStop(0, `rgba(3,15,17,${.30 * visibleGrade})`);
      grade.addColorStop(.44, `rgba(6,34,35,${.04 * visibleGrade})`);
      grade.addColorStop(1, `rgba(2,12,10,${.44 * visibleGrade})`);
      ctx.fillStyle = grade;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    return true;
  }

  prologueComicPanelTransition(stage, elapsed, revealProgress = 0) {
    const raw = stage === "reveal"
      ? Math.max(0, Math.min(1, (Number(revealProgress || 0) - .04) / .68))
      : Math.max(0, Math.min(1, Number(elapsed || 0) / 900));
    return .5 - Math.cos(raw * Math.PI) * .5;
  }

  drawProloguePanelSeam(ctx, x, progress) {
    const seamX = Math.max(0, Math.min(this.width, x));
    const alpha = .38 + Math.sin(Math.max(0, Math.min(1, progress)) * Math.PI) * .42;
    const edge = ctx.createLinearGradient(seamX - 18, 0, seamX + 18, 0);
    edge.addColorStop(0, "rgba(4,18,15,0)");
    edge.addColorStop(.35, `rgba(207,230,215,${alpha * .34})`);
    edge.addColorStop(.52, `rgba(255,236,168,${alpha})`);
    edge.addColorStop(.68, `rgba(220,239,226,${alpha * .42})`);
    edge.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = edge;
    ctx.fillRect(seamX - 18, 0, 36, this.height);
    ctx.save();
    ctx.fillStyle = `rgba(224,240,228,${alpha * .17})`;
    ctx.shadowColor = `rgba(229,244,233,${alpha * .36})`;
    ctx.shadowBlur = 18;
    for (let index = 0; index < 6; index += 1) {
      ctx.beginPath();
      ctx.ellipse(seamX + (index % 2 ? 5 : -5), this.height * (.10 + index * .17), 16 + index * 2, 42 + index * 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  prologueTypedLine(text, elapsed, delay = 0, msPerCharacter = 46) {
    const count = Math.max(0, Math.floor((elapsed - delay) / msPerCharacter));
    return String(text || "").slice(0, count);
  }

  drawPrologueCloudBubble(ctx, x, y, w, h, options = {}) {
    const fillTop = options.fillTop || "rgba(255,254,235,.98)";
    const fillBottom = options.fillBottom || options.fill || "rgba(232,249,229,.98)";
    const shadow = options.shadow || "rgba(0,0,0,.30)";
    const tailX = Number(options.tailX || (x + w * .5));
    const tailDirection = options.tailDirection || "down";
    const cloudPath = () => {
      ctx.beginPath();
      ctx.moveTo(x + w * .13, y + h * .92);
      ctx.bezierCurveTo(x + w * .05, y + h * .92, x + w * .015, y + h * .77, x + w * .055, y + h * .60);
      ctx.bezierCurveTo(x + w * .01, y + h * .42, x + w * .10, y + h * .25, x + w * .21, y + h * .29);
      ctx.bezierCurveTo(x + w * .21, y + h * .10, x + w * .35, y + h * .02, x + w * .45, y + h * .17);
      ctx.bezierCurveTo(x + w * .54, y - h * .02, x + w * .70, y + h * .02, x + w * .73, y + h * .23);
      ctx.bezierCurveTo(x + w * .84, y + h * .15, x + w * .94, y + h * .29, x + w * .91, y + h * .46);
      ctx.bezierCurveTo(x + w * 1.01, y + h * .50, x + w * 1.00, y + h * .72, x + w * .94, y + h * .80);
      ctx.bezierCurveTo(x + w * .91, y + h * .88, x + w * .86, y + h * .92, x + w * .78, y + h * .92);
      if (tailDirection === "down") {
        ctx.lineTo(tailX + 11, y + h * .92);
        ctx.quadraticCurveTo(tailX + 4, y + h * 1.03, tailX - 2, y + h + 13);
        ctx.quadraticCurveTo(tailX - 6, y + h * 1.01, tailX - 12, y + h * .92);
      } else if (tailDirection === "up") {
        ctx.lineTo(x + w * .23, y + h * .92);
        ctx.lineTo(tailX - 10, y + h * .92);
        ctx.quadraticCurveTo(tailX - 4, y + h * .79, tailX + 1, y + h * .72);
        ctx.quadraticCurveTo(tailX + 5, y + h * .82, tailX + 12, y + h * .92);
      }
      ctx.lineTo(x + w * .13, y + h * .92);
      ctx.closePath();
    };
    ctx.save();
    ctx.shadowColor = shadow;
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 7;
    cloudPath();
    const cloudFill = ctx.createLinearGradient(x, y, x, y + h);
    cloudFill.addColorStop(0, fillTop);
    cloudFill.addColorStop(1, fillBottom);
    ctx.fillStyle = cloudFill;
    ctx.fill();
    ctx.restore();
    ctx.save();
    cloudPath();
    ctx.strokeStyle = "rgba(255,255,255,.88)";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    cloudPath();
    ctx.strokeStyle = "rgba(37,111,87,.18)";
    ctx.lineWidth = 1.25;
    ctx.stroke();
    ctx.globalAlpha = .48;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x + w * .24, y + h * .23);
    ctx.bezierCurveTo(x + w * .34, y + h * .08, x + w * .43, y + h * .09, x + w * .49, y + h * .18);
    ctx.stroke();
    ctx.restore();
    return { x, y, w, h, tailX, tailDirection, cloud: true, singleSilhouette: true, layered: true };
  }

  drawPrologueDialogue(ctx, stage, runtime, revealProgress) {
    const elapsed = runtime.elapsed;
    let speaker = "犬铃";
    let line = "雾里，有什么停下了脚步。";
    let typedElapsed = elapsed;
    if (stage === "trail") {
      speaker = "砾灰";
      line = "水边有陌生的气味。跟着我。";
      typedElapsed = elapsed - 620;
    } else if (stage === "reveal") {
      speaker = "砾灰";
      line = "水边那道陌生气味——你来决定。";
      typedElapsed = elapsed - 2550;
    }
    const displayLine = this.prologueTypedLine(line, typedElapsed, stage === "fog" ? 1050 : 120, 42);
    const topSafe = Math.max(24, this.systemTopInset() + 8);
    const cardW = stage === "fog" ? Math.min(this.width - 76, 286) : stage === "trail" ? Math.min(this.width - 54, 312) : Math.min(this.width - 48, 322);
    const cardX = (this.width - cardW) / 2;
    const cardY = stage === "fog"
      ? Math.max(topSafe + 48, this.height * .16)
      : stage === "trail"
        ? Math.max(topSafe + 52, this.height * .145)
        : this.height - 158;
    const cardH = stage === "fog" ? 66 : stage === "trail" ? 76 : 74;
    const captionStart = stage === "fog" ? 620 : stage === "trail" ? 720 : 2820;
    const captionRaw = Math.max(0, Math.min(1, (elapsed - captionStart) / 420));
    const captionIn = .5 - Math.cos(captionRaw * Math.PI) * .5;
    const enterY = (1 - captionIn) * (stage === "trail" ? -10 : 8);
    let cloudVisual = null;
    ctx.save();
    ctx.globalAlpha = captionIn;
    ctx.translate(0, enterY);
    if (stage === "fog") {
      cloudVisual = this.drawPrologueCloudBubble(ctx, cardX, cardY, cardW, cardH, {
        fill: "rgba(226,249,236,.94)", tailX: cardX + cardW * .62, tailDirection: "down", shadow: "rgba(0,15,12,.36)"
      });
      this.text(ctx, "雾中犬铃", cardX + cardW / 2, cardY + 27, 9, "#8f6a18", "700", "center");
      const visible = displayLine || "……";
      this.text(ctx, visible, cardX + cardW / 2, cardY + 52, 14, "#173d34", "700", "center");
    } else if (stage === "trail") {
      cloudVisual = this.drawPrologueCloudBubble(ctx, cardX, cardY, cardW, cardH, {
        fill: "rgba(255,247,214,.97)", tailX: cardX + cardW * .54, tailDirection: "down", shadow: "rgba(0,12,10,.34)"
      });
      this.drawAnimalPortraitAsset(ctx, { species: "野犬", name: "砾灰" }, cardX + 34, cardY + 40, 40, true)
        || this.drawUiIcon(ctx, "hound_team", cardX + 34, cardY + 40, 29, true);
      this.text(ctx, speaker, cardX + 61, cardY + 30, 10, "#9a6b16", "700");
      this.wrapText(ctx, displayLine, cardX + 61, cardY + 55, cardW - 78, 14, 18, "#173d34", 2);
    } else {
      cloudVisual = this.drawPrologueCloudBubble(ctx, cardX, cardY, cardW, cardH, {
        fillBottom: "rgba(235,251,229,.98)", tailX: cardX + cardW * .28, tailDirection: "up", shadow: "rgba(0,15,12,.34)"
      });
      this.drawAnimalPortraitAsset(ctx, { species: "野犬", name: "砾灰" }, cardX + 34, cardY + 40, 40, true)
        || this.drawUiIcon(ctx, "hound_team", cardX + 34, cardY + 40, 29, true);
      this.text(ctx, speaker, cardX + 61, cardY + 30, 10, "#8f6a18", "700");
      this.wrapText(ctx, displayLine, cardX + 61, cardY + 55, cardW - 78, 14, 18, "#173d34", 2);
    }
    if (displayLine.length < line.length && displayLine.length > 0) {
      const caretAlpha = .35 + (Math.sin(this.animT() * .009) + 1) * .28;
      this.text(ctx, "▌", cardX + cardW - 18, cardY + cardH - 18, 11, `rgba(255,214,90,${caretAlpha})`, "700", "center");
    }
    ctx.restore();
    return { speaker, line, displayed: displayLine, x: cardX, y: cardY + enterY, w: cardW, h: cardH, style: "cloud-bubble", cloud: true, layeredCloud: !!(cloudVisual && cloudVisual.layered), entrance: captionIn };
  }

  drawPrologueActionGlyph(ctx, label, cx, cy, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    if (label.includes("犬铃")) {
      ctx.beginPath();
      ctx.arc(cx, cy - 2, 7, Math.PI, 0);
      ctx.lineTo(cx + 8, cy + 6);
      ctx.lineTo(cx - 8, cy + 6);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy + 9, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (label.includes("砾灰")) {
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, 6, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      [[-7,-5],[-2,-8],[4,-7],[8,-3]].forEach(([dx, dy]) => {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, 2.7, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.bezierCurveTo(cx + 8, cy - 1, cx + 8, cy + 7, cx, cy + 10);
      ctx.bezierCurveTo(cx - 8, cy + 7, cx - 8, cy - 1, cx, cy - 10);
      ctx.fill();
    }
    ctx.restore();
  }

  drawPrologueAction(ctx, label, enabled, onTap, entrance = 1) {
    const eased = .5 - Math.cos(Math.max(0, Math.min(1, entrance)) * Math.PI) * .5;
    const w = Math.min(this.width - 70, label.length >= 6 ? 184 : 166);
    const x = (this.width - w) / 2;
    const y = this.height - 72 + (1 - eased) * 28;
    const h = 46;
    const pulse = .35 + (Math.sin(this.animT() * .006) + 1) * .18;
    ctx.save();
    ctx.globalAlpha = .30 + eased * .70;
    this.roundRect(ctx, x, y + 7, w, h, 23, "rgba(0,0,0,.34)");
    const fill = ctx.createLinearGradient(x, y, x, y + h);
    if (enabled) {
      fill.addColorStop(0, "#fff089");
      fill.addColorStop(1, "#efb83d");
    } else {
      fill.addColorStop(0, "rgba(31,70,59,.88)");
      fill.addColorStop(1, "rgba(13,42,35,.88)");
    }
    this.roundRect(ctx, x, y, w, h, 23, fill, enabled ? `rgba(92,63,9,${.74 + pulse * .18})` : "rgba(255,255,255,.20)");
    this.roundRect(ctx, x + 8, y + 5, w - 16, 5, 3, enabled ? "rgba(255,255,255,.62)" : "rgba(255,255,255,.10)");
    this.roundRect(ctx, x + 10, y + 10, 28, 28, 14, enabled ? "rgba(23,61,52,.95)" : "rgba(59,78,69,.72)", "rgba(255,255,255,.44)");
    this.drawPrologueActionGlyph(ctx, label, x + 24, y + 24, enabled ? "#ffe978" : "#c7d7d0");
    this.text(ctx, label, x + 43 + (w - 49) / 2, y + 30, 13, enabled ? "#173d34" : "#c7d7d0", "700", "center");
    ctx.restore();
    if (enabled) {
      ctx.save();
      ctx.globalAlpha = eased;
      this.roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 25, null, `rgba(255,214,90,${pulse})`);
      ctx.restore();
      this.addHit(x, y, w, h, onTap, "none");
    }
    return { x, y, w, h, label, enabled, entrance: eased, compact: true, cartoon: true };
  }

  drawPrologueCinematicVignette(ctx, stage, runtime) {
    const topShade = ctx.createLinearGradient(0, 0, 0, Math.max(170, this.height * .28));
    topShade.addColorStop(0, "rgba(1,10,9,.70)");
    topShade.addColorStop(1, "rgba(1,10,9,0)");
    ctx.fillStyle = topShade;
    ctx.fillRect(0, 0, this.width, Math.max(170, this.height * .28));
    const bottomShade = ctx.createLinearGradient(0, this.height * .58, 0, this.height);
    bottomShade.addColorStop(0, "rgba(1,10,9,0)");
    bottomShade.addColorStop(1, "rgba(1,10,9,.72)");
    ctx.fillStyle = bottomShade;
    ctx.fillRect(0, this.height * .58, this.width, this.height * .42);
    if (runtime.touchFlashUntil > Date.now()) {
      const remaining = Math.max(0, Math.min(1, (runtime.touchFlashUntil - Date.now()) / 620));
      ctx.fillStyle = `rgba(255,232,156,${remaining * .20})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
    const top = Math.max(24, this.systemTopInset() + 8);
    const chapterReady = stage === "reveal" && this.prologueRevealProgress() >= .99;
    const chapterLabel = chapterReady ? "第1章 · 临时营地" : "野境守护 · 序章";
    const labelW = chapterReady ? 118 : 116;
    this.roundRect(ctx, 20, top, labelW, 25, 12, "rgba(3,20,17,.58)", "rgba(255,226,125,.34)");
    this.text(ctx, chapterLabel, 20 + labelW / 2, top + 17, 10, "#ffe27d", "700", "center");
    const panelLabel = stage === "fog" ? "1 / 3" : stage === "trail" ? "2 / 3" : "3 / 3";
    const panelW = 48;
    this.roundRect(ctx, this.width - panelW - 20, top, panelW, 25, 12, "rgba(3,20,17,.58)", "rgba(255,226,125,.34)");
    this.text(ctx, panelLabel, this.width - panelW / 2 - 20, top + 17, 10, "#ffe27d", "700", "center");
  }

  drawChoose(ctx) {
    const prologue = this.playablePrologueState();
    const stage = prologue.active ? prologue.stage : "reveal";
    const revealProgress = stage === "reveal" ? (prologue.active ? this.prologueRevealProgress() : 1) : 0;
    const runtime = this.prologueStageRuntime(stage);
    this.animalMotionStates = this.animalMotionStates || {};
    this.animalDialogueContexts = this.animalDialogueContexts || {};
    const savedHits = this.hitAreas.length;
    const savedViewport = this.mapViewport;
    this.drawAnimalConversationSand(ctx, -6, -6, this.width + 12, this.height + 12, { prologue: true });
    this.hitAreas.length = savedHits;
    this.mapViewport = savedViewport;

    const cinematicArtReady = this.drawPrologueCinematicArt(ctx, stage, runtime.elapsed, revealProgress);
    const panelTransition = this.prologueComicPanelTransition(stage, runtime.elapsed, revealProgress);
    const dogFromX = this.width * .43;
    const dogFromY = this.height * .61;
    const dogToX = this.width * .49;
    const dogToY = this.height * .53;
    const dogX = stage === "fog" ? dogFromX : dogToX;
    const dogY = stage === "fog" ? dogFromY : dogToY;
    const fogVisual = this.drawPlayablePrologueFog(ctx, stage, dogX, dogY, revealProgress);
    if (stage === "trail") this.drawProloguePawprints(ctx, this.width * .55, this.height * .82, dogToX, dogToY, 5);
    if (!cinematicArtReady && (stage !== "reveal" || revealProgress < .72)) {
      const dogAlpha = stage === "reveal" ? Math.max(0, 1 - revealProgress / .72) : stage === "fog" ? .74 : .94;
      ctx.save();
      ctx.shadowColor = "rgba(255,232,156,.44)";
      ctx.shadowBlur = 14;
      this.drawAnimalSticker(ctx, dogX, dogY, { id: "prologue_hound", species: "野犬", name: "砾灰" }, dogAlpha, 1.55, false);
      ctx.restore();
    }
    this.drawPrologueCinematicVignette(ctx, stage, runtime);
    if (stage === "fog" && runtime.elapsed >= 430 && runtime.elapsed < 2050) {
      const cueIn = Math.min(1, (runtime.elapsed - 430) / 420);
      const cueOut = runtime.elapsed > 1540 ? Math.max(0, 1 - (runtime.elapsed - 1540) / 510) : 1;
      const cueAlpha = cueIn * cueOut;
      const cueSize = 19 + Math.min(5, (runtime.elapsed - 430) / 260);
      ctx.save();
      ctx.shadowColor = "rgba(255,222,119,.65)";
      ctx.shadowBlur = 18;
      this.text(ctx, "叮——", this.width / 2, this.height * .32, cueSize, `rgba(255,242,188,${cueAlpha})`, "700", "center");
      ctx.restore();
    }
    const comicTransitioning = stage === "trail" && runtime.elapsed < 820;
    const revealTransitioning = stage === "reveal" && revealProgress < .88;
    const dialogue = (comicTransitioning || revealTransitioning)
      ? { speaker: "砾灰", line: stage === "trail" ? "水边有陌生的气味。跟着我。" : "水边那道陌生气味——你来决定。", displayed: "", hidden: true }
      : this.drawPrologueDialogue(ctx, stage, runtime, revealProgress);

    let actionLabel = "听……";
    let action = () => this.advancePlayablePrologue();
    let enabled = this.prologueCanAdvance(stage);
    if (stage === "fog") actionLabel = enabled ? "轻触犬铃" : "听……";
    else if (stage === "trail") actionLabel = enabled ? "跟上砾灰" : "它在等你";
    else if (stage === "reveal" && !enabled) {
      actionLabel = revealProgress < .48 ? "穿过雾" : "保护区正在苏醒";
      action = null;
      enabled = false;
    } else if (stage === "reveal") actionLabel = "去水边看看";
    const unlockAt = stage === "fog" ? 1850 : stage === "trail" ? 2050 : 3800;
    const actionEntrance = Math.max(0, Math.min(1, (runtime.elapsed - unlockAt) / 420));
    const actionHidden = comicTransitioning || !enabled || actionEntrance <= .02;
    const actionVisual = actionHidden
      ? { x: 26, y: this.height - 76, w: this.width - 52, h: 0, label: actionLabel, enabled: false, hidden: true }
      : this.drawPrologueAction(ctx, actionLabel, enabled, action, actionEntrance);
    if (enabled && (stage === "fog" || stage === "trail")) {
      this.addHit(dogX - 56, dogY - 56, 112, 112, () => this.advancePlayablePrologue(), "none");
    }
    this.renderedPlayablePrologue = {
      stage,
      dynamicMap: true,
      staticChapterArt: false,
      cinematicArt: cinematicArtReady,
      comicPanels: 3,
      panel: stage === "fog" ? 1 : stage === "trail" ? 2 : 3,
      panelTransition,
      panelOneReady: !!(this.art && this.art.prologueFog && this.art.prologueFog.loaded),
      panelTwoReady: !!(this.art && this.art.prologueTrail && this.art.prologueTrail.loaded),
      cinematicDurationMs: 3200,
      fogOpacity: fogVisual.outerAlpha,
      clearRadius: fogVisual.radius,
      layeredFog: !!fogVisual.layeredMist,
      fogRevealEase: fogVisual.revealEase || 0,
      imageEntryProgress: panelTransition,
      imageDissolveMode: "comic-mist-wipe",
      dogBounds: { x: dogX - 56, y: dogY - 56, w: 112, h: 112 },
      dialogue,
      soundCue: stage === "fog" ? "叮——" : "",
      beat: stage === "fog" ? "listen" : stage === "trail" ? "follow" : revealProgress < .94 ? "reveal" : "decide",
      stageElapsed: runtime.elapsed,
      actionLabel,
      actionEnabled: enabled,
      actionBounds: actionVisual,
      actionEntrance: actionVisual.entrance || 0,
      revealProgress,
      operationsBeforeReveal: 2
    };
    this.contentHeight = this.height - this.bottomSafeInset();
  }

  drawAction(ctx) {
    this.drawPageBackdrop(ctx, "patrol");
    const topInset = this.compactStageTop();
    if (topInset > 0) { ctx.fillStyle = UI_THEME.forest800; ctx.fillRect(0, 0, this.width, topInset); }
    const chapter = getCurrentChapter((this.state.world || {}).reserve || {});
    const progress = getChapterProgress((this.state.world || {}).reserve || {});
    this.drawStagePill(ctx, 12, topInset + 4, this.width - 24, chapter, progress);
    if (!this.state.character) {
      this.empty(ctx, "你还没有接管保护区。先成为卫士，再下达第一道巡护指令。", topInset + 80);
      this.button(ctx, 28, topInset + 200, this.width - 56, 46, "成为卫士", "#1c3325", () => this.setScreen("choose"));
      this.bottom(topInset + 260);
      return;
    }
    const reserve = this.state.world.reserve || {};
    let y = topInset + 40;
    const overviewH = this.drawPatrolThreatBoard(ctx, 12, y, this.width - 24, reserve);
    y += overviewH + 10;
    const executeH = this.drawPatrolExecuteBoard(ctx, 12, y, this.width - 24, reserve);
    this.bottom(y + executeH + 12);
  }

  drawPatrolExecuteBoard(ctx, x, y, w, reserve) {
    // 任务首屏直接展示核心预估；说明与消耗降为次级信息。
    const groups = this.patrolActionGroups(reserve);
    const rowH = 118;
    const rowGap = 8;
    const h = 52 + groups.length * (rowH + rowGap) + 16;
    this.renderedPatrolActionTiles = [];
    this.panel(ctx, x, y, w, h);
    // 这里只做一件事：让玩家选一项任务。路线与养成信息不再抢占决策首屏。
    this.text(ctx, "选择1项任务", x + 16, y + 28, 18, "#1c3325", "700");
    this.text(ctx, "点击卡片查看消耗与预计结果", x + w - 16, y + 27, 10, "#66715f", "600", "right");
    // 分隔线
    ctx.fillStyle = "rgba(36,64,46,0.10)";
    ctx.fillRect(x + 16, y + 40, w - 32, 1);
    // 各行动组
    const tileGap = 10;
    const tileW = (w - tileGap - 32) / 2;
    groups.forEach((group, index) => {
      const rowY = y + 52 + index * (rowH + rowGap);
      // 行标签（左侧竖条+文字）
      this.drawSectionMarker(ctx, x + 18, rowY + 14, group.color);
      this.text(ctx, group.label, x + 34, rowY + 18, 12, "#26352b", "700");
      // 两个动作按钮
      group.options.forEach((option, optionIndex) => {
        const tx = x + 16 + optionIndex * (tileW + tileGap);
        this.drawPatrolActionTile(ctx, option, tx, rowY + 28, tileW, rowH - 34, reserve);
      });
    });
    this.renderedPatrolExecuteBoard = {
      x, y, w, h,
      title: "选择1项任务",
      instruction: "点击卡片查看消耗与预计结果",
      advancedRouteHidden: true
    };
    return h;
  }
  drawPatrolActionTile(ctx, option, x, y, w, h, reserve) {
    // 玩具任务卡：左侧动作图标，右侧优先展示一项真实预估，消耗置底。
    const active = option.id === this.selectedReserveAction;
    const resourceStatus = this.actionResourceStatus(option.id, reserve);
    const blocked = !resourceStatus.canRun;
    const preview = this.patrolActionTilePreview(option.id, reserve, resourceStatus);
    // 背景色
    const fill = blocked
      ? "#ece6d7"
      : active
        ? "#1c3325"
        : option.recommended
          ? "rgba(255,240,202,0.95)"
          : "#f3eddd";
    // 描边色
    const stroke = blocked
      ? "rgba(196,91,66,0.42)"
      : active
        ? "#f0d376"
        : option.recommended
          ? "#d8b447"
          : "rgba(139,111,42,0.24)";
    // 阴影
    this.roundRect(ctx, x, y + 5, w, h, 12, "rgba(20, 16, 8, 0.18)");
    // 主体
    this.roundRect(ctx, x, y, w, h, 12, fill, stroke);
    // 选中内层发光
    if (active && !blocked) {
      this.roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 9, null, "rgba(240,211,118,0.28)");
      // 金色顶部高光条
      const glow = ctx.createLinearGradient(x, y, x, y + 20);
      glow.addColorStop(0, "rgba(240,211,118,0.22)");
      glow.addColorStop(1, "rgba(240,211,118,0)");
      this.roundRect(ctx, x + 4, y + 4, w - 8, 16, 8, glow);
    }
    const iconSize = Math.min(40, Math.max(34, h - 44));
    const iconX = x + 30;
    const iconY = y + 42;
    this.drawActionTileIcon(ctx, option.icon, iconX, iconY, blocked ? "#9aa093" : option.color, active && !blocked, iconSize);
    // 动作名与主变化
    const titleColor = active && !blocked ? "#fff8df" : blocked ? "#9aa093" : "#1c3325";
    const textX = x + 60;
    const textW = Math.max(38, w - 70);
    const titleSize = this.fitTextSize(ctx, option.shortLabel || option.label, textW - 28, 14, 11, "700");
    this.text(ctx, this.truncateTextToWidth(ctx, option.shortLabel || option.label, textW - 28, titleSize, "700"), textX, y + 21, titleSize, titleColor, "700");
    this.text(ctx, preview.label, textX, y + 38, 9, active && !blocked ? "#e8d491" : "#66715f", "700");
    const valueColor = blocked ? "#c45b42" : this.patrolActionToneColor(preview.tone, active);
    const valueSize = this.fitTextSize(ctx, preview.value, textW, 17, 12, "700");
    this.text(ctx, this.truncateTextToWidth(ctx, preview.value, textW, valueSize, "700"), textX, y + 58, valueSize, valueColor, "700");
    // 消耗胶囊只承担资源提示，不再抢占主结果。
    const costText = this.patrolButtonValue(option.id, reserve);
    const costX = textX;
    const costY = y + h - 18;
    const costW = Math.max(42, w - (costX - x) - 8);
    this.roundRect(ctx, costX, costY, costW, 15, 7,
      active && !blocked ? "rgba(240,211,118,0.18)" : "rgba(139,111,42,0.10)",
      active && !blocked ? "rgba(240,211,118,0.44)" : "rgba(139,111,42,0.24)");
    this.text(ctx, this.truncateTextToWidth(ctx, costText, costW - 10, 9, "700"), costX + costW / 2, costY + 11, 9,
      blocked ? "#c45b42" : active ? "#e8d491" : "#7d692d", "700", "center");
    // 推荐/缺货角标
    if (option.recommended && !blocked) {
      this.roundRect(ctx, x + w - 38, y + 8, 28, 17, 6, active ? "rgba(240,211,118,0.22)" : "#1c3325");
      this.text(ctx, "荐", x + w - 24, y + 20, 9, active ? "#f0d376" : "#fff8df", "700", "center");
    }
    this.renderedPatrolActionTiles = this.renderedPatrolActionTiles || [];
    this.renderedPatrolActionTiles.push({
      id: option.id, x, y, w, h,
      title: option.shortLabel || option.label,
      primaryLabel: preview.label,
      primaryValue: preview.value,
      valueSize,
      costText,
      blocked,
      recommended: !!option.recommended
    });
    this.addHit(x, y - this.scrollY, w, h, () => {
      this.selectedReserveAction = option.id;
      this.command = option.placeholder.replace("例如：", "");
      this.openPatrolTaskModal(option);
    });
  }

  patrolActionTilePreview(id, reserve, status) {
    if (status && !status.canRun) {
      return { label: "资源缺口", value: (status.missing || []).slice(0, 2).join("、") || "无法执行", tone: "bad" };
    }
    const cards = this.patrolTaskChangeCards(id, reserve, status);
    const priorities = {
      houndScout: ["偷猎", "发现"],
      antiPoacher: ["偷猎", "安全"],
      habitat: ["水源", "草场"],
      intervention: ["草场", "水源"]
    }[id] || [];
    const primary = priorities.map((label) => cards.find((item) => item.label === label)).find(Boolean) || cards[0] || {};
    return { label: primary.label || "预计变化", value: primary.value || "结算时确认", tone: primary.tone || "gold" };
  }

  patrolActionToneColor(tone, active = false) {
    if (active) {
      return tone === "bad" ? "#ffb070" : tone === "cost" ? "#f0d376" : "#8cf0a9";
    }
    return { good: "#1f7a52", bad: "#c45b42", cost: "#b07a16", warn: "#c47b28", gold: "#8b6f2a" }[tone] || "#1f7a52";
  }
  drawPatrolThreatBoard(ctx, x, y, w, reserve) {
    // 巡护说明只回答三个问题：这页做什么、现在最急什么、还剩多少行动资源。
    // 状态数据只读，真正的操作只发生在下方任务卡，避免同一页面出现两套入口。
    const base = reserve || {};
    const h = 154;
    const priority = this.patrolPriorityOverview(base);
    this.renderedPatrolThreatTiles = [];
    this.panel(ctx, x, y, w, h);
    this.drawSectionMarker(ctx, x + 17, y + 18, "#5cb87a");
    this.text(ctx, "本次巡护", x + 34, y + 22, 14, "#1c3325", "700");
    this.text(ctx, "选1项任务，结算后返回沙盘", x + 34, y + 42, 10, "#66715f", "600");
    const closeX = x + w - 44;
    this.roundRect(ctx, closeX, y + 12, 28, 28, 8, "#e8ddbd", "rgba(139,111,42,0.30)");
    this.text(ctx, "×", closeX + 14, y + 32, 18, "#26352b", "700", "center");
    this.addHit(closeX - 4, y + 8 - this.scrollY, 36, 36, () => this.closePatrolOperationScreen());

    const cardX = x + 14;
    const cardY = y + 52;
    const cardW = w - 28;
    const cardH = 54;
    this.roundRect(ctx, cardX, cardY + 3, cardW, cardH, 11, "rgba(20,16,8,.12)");
    this.roundRect(ctx, cardX, cardY, cardW, cardH, 11, priority.fill, priority.stroke);
    ctx.beginPath();
    ctx.arc(cardX + 17, cardY + 17, 6, 0, Math.PI * 2);
    ctx.fillStyle = priority.color;
    ctx.fill();
    this.text(ctx, "当前最急", cardX + 30, cardY + 19, 9, "#66715f", "700");
    this.text(ctx, `${priority.label} ${priority.valueText}`, cardX + 30, cardY + 40, 16, "#1c3325", "700");
    const badgeW = 58;
    this.roundRect(ctx, cardX + cardW - badgeW - 10, cardY + 12, badgeW, 28, 10, priority.badgeFill, priority.badgeStroke);
    this.text(ctx, priority.status, cardX + cardW - badgeW / 2 - 10, cardY + 31, 10, priority.color, "700", "center");
    const guideW = Math.max(90, cardW - 208);
    this.text(ctx, this.truncateTextToWidth(ctx, priority.guide, guideW, 9, "600"), cardX + 132, cardY + 39, 9, "#66715f", "600");

    const resources = [
      { icon: "fund", label: "基金", value: `${base.fund || 0}` },
      { icon: "water", label: "水源", value: `${(base.ecology || {}).water || 0}` },
      { icon: "leaf", label: "草场", value: `${(base.ecology || {}).grass || 0}` }
    ];
    const chipY = y + 116;
    const chipGap = 7;
    const chipW = (w - 28 - chipGap * 2) / 3;
    resources.forEach((item, index) => {
      const chipX = x + 14 + index * (chipW + chipGap);
      this.roundRect(ctx, chipX, chipY, chipW, 26, 9, "rgba(28,51,37,.07)", "rgba(36,64,46,.13)");
      this.drawUiIcon(ctx, item.icon, chipX + 14, chipY + 13, 12, false)
        || this.drawSmallGlyph(ctx, item.icon, chipX + 14, chipY + 13, "#1f7a52", .6);
      this.text(ctx, item.label, chipX + 25, chipY + 17, 9, "#66715f", "600");
      this.text(ctx, item.value, chipX + chipW - 9, chipY + 18, 12, "#1c3325", "700", "right");
    });

    const priorityTile = {
      type: priority.type,
      label: priority.label,
      value: priority.valueText,
      status: priority.status,
      guide: priority.guide,
      recommendedAction: priority.actionId,
      readOnly: true,
      clickable: false,
      x: cardX, y: cardY, w: cardW, h: cardH
    };
    this.renderedPatrolThreatTiles.push(priorityTile);
    this.renderedPatrolThreatBoard = {
      x, y, w, h,
      metrics: 1,
      readOnly: true,
      purpose: "选择1项巡护任务并结算",
      instruction: "选1项任务，结算后返回沙盘",
      priority: priorityTile,
      resources: resources.map((item) => `${item.label}${item.value}`),
      redundantSafetyBar: false
    };
    return h;
  }

  patrolPriorityOverview(reserve) {
    const base = reserve || {};
    const ecology = base.ecology || {};
    const migration = base.migration || {};
    const supplies = base.supplies || {};
    const candidates = [
      {
        type: "poacher", label: "偷猎压力", value: base.poacherPressure || 0,
        score: Math.max(0, (base.poacherPressure || 0) - 32) * 1.6,
        actionId: (supplies.alarm || 0) > 0 ? "antiPoacher" : "houndScout"
      },
      {
        type: "water", label: "水源", value: ecology.water || 0,
        score: Math.max(0, 58 - (ecology.water || 0)) * 1.4,
        actionId: "habitat"
      },
      {
        type: "grass", label: "草场", value: ecology.grass || 0,
        score: Math.max(0, 56 - (ecology.grass || 0)) * 1.35,
        actionId: "habitat"
      },
      {
        type: "disease", label: "疾病风险", value: ecology.disease || 0,
        score: Math.max(0, (ecology.disease || 0) - 22) * 1.25,
        actionId: (supplies.tranquilizer || 0) > 0 ? "intervention" : "houndScout"
      },
      {
        type: "safety", label: "安全", value: base.safety || base.stability || 0,
        score: Math.max(0, 62 - (base.safety || base.stability || 0)),
        actionId: "houndScout"
      },
      {
        type: "migration", label: "迁移", value: migration.delta || 0,
        score: Math.max(0, -(migration.delta || 0)) * 3,
        actionId: "houndScout"
      }
    ];
    const selected = candidates.sort((a, b) => b.score - a.score)[0];
    const stable = !selected || selected.score <= 0;
    const item = stable
      ? { type: "stable", label: "保护区状态", value: "稳定", valueText: "稳定", actionId: "houndScout", score: 0 }
      : Object.assign({}, selected, {
        valueText: selected.type === "migration" ? `${selected.value >= 0 ? "+" : ""}${selected.value}` : `${selected.value}`
      });
    const severe = item.score >= 28;
    const status = stable ? "稳定" : severe ? "高风险" : "需关注";
    const color = stable ? "#1f7a52" : severe ? "#c45b42" : "#a87618";
    const guides = {
      houndScout: item.type === "poacher" ? "先侦察寻找脚印" : "先侦察确认原因",
      antiPoacher: "建议驱赶，压低风险",
      habitat: item.type === "water" ? "建议修复水源" : "建议修复栖息地",
      intervention: "建议干预，控制疾病"
    };
    return Object.assign({}, item, {
      status,
      guide: stable ? "可自由巡护，寻找回收物" : guides[item.actionId],
      color,
      fill: stable ? "rgba(228,246,215,.66)" : severe ? "rgba(255,232,222,.74)" : "rgba(255,244,204,.72)",
      stroke: stable ? "rgba(46,135,110,.24)" : severe ? "rgba(196,91,66,.34)" : "rgba(168,118,24,.30)",
      badgeFill: stable ? "rgba(228,246,215,.92)" : severe ? "rgba(255,225,217,.94)" : "rgba(255,239,190,.94)",
      badgeStroke: stable ? "rgba(46,135,110,.26)" : severe ? "rgba(196,91,66,.34)" : "rgba(168,118,24,.28)"
    });
  }
  reserveMetricAction(type, reserve) {
    const base = reserve || (this.state.world && this.state.world.reserve) || {};
    const ecology = base.ecology || {};
    const migration = base.migration || {};
    const poacher = base.poacherPressure || 0;
    const water = ecology.water || 0;
    const grass = ecology.grass || 0;
    const disease = ecology.disease || 0;
    let actionId = "houndScout";
    if (type === "safety") {
      if (poacher > 45) actionId = "antiPoacher";
      else if (water < 55 || grass < 55) actionId = "habitat";
      else actionId = "houndScout";
    } else if (type === "poacher") {
      actionId = poacher > 45 ? "antiPoacher" : "houndScout";
    } else if (type === "water") {
      actionId = water < 62 ? "habitat" : "houndScout";
    } else if (type === "grass") {
      actionId = grass < 55 ? "habitat" : "intervention";
    } else if (type === "disease") {
      actionId = "houndScout";
    } else if (type === "migration") {
      if ((migration.delta || 0) < 0) actionId = poacher > 45 ? "antiPoacher" : (water < 55 || grass < 55 ? "habitat" : "houndScout");
      else actionId = water < 55 || grass < 55 ? "habitat" : "houndScout";
    }
    const option = this.reserveActionOptions().find((item) => item.id === actionId) || this.reserveActionOptions()[0];
    const shortMap = {
      houndScout: "侦察",
      antiPoacher: "驱赶",
      habitat: "修复",
      intervention: "干预",
      salvage: "移交",
      buySupplies: "采购"
    };
    return Object.assign({}, option, {
      shortLabel: shortMap[actionId] || option.label,
      actionLabel: option.label,
      ctaLabel: `执行${shortMap[actionId] || option.label}`
    });
  }

  patrolMissionOptions(reserve) {
    const options = this.reserveActionOptions().filter((option) => this.isPatrolTaskAction(option.id));
    const preferred = this.recommendedPatrolAction(reserve);
    return options.map((option) => Object.assign({}, option, {
      recommended: option.id === preferred,
      effect: this.patrolEffectText(option.id)
    }));
  }

  patrolActionGroups(reserve) {
    const options = this.patrolMissionOptions(reserve);
    const byId = {};
    options.forEach((option) => { byId[option.id] = option; });
    const decorate = (id, shortLabel, color) => Object.assign({}, byId[id], { shortLabel, color });
    return [
      {
        id: "defense",
        label: "防卫巡护",
        hint: "先保安全线",
        icon: "signal",
        color: "#d8a13a",
        fill: "rgba(255, 248, 223, 0.72)",
        options: [
          decorate("houndScout", "侦察", "#1c3325"),
          decorate("antiPoacher", "驱赶", "#d8a13a")
        ]
      },
      {
        id: "ecology",
        label: "生态调节",
        hint: "稳水草与种群",
        icon: "leaf",
        color: "#5f8f42",
        fill: "rgba(240, 247, 219, 0.68)",
        options: [
          decorate("habitat", "修复", "#5f8f42"),
          decorate("intervention", "干预", "#2f7c8f")
        ]
      }
    ].map((group) => Object.assign({}, group, { options: group.options.filter((option) => option && option.id) }));
  }

  patrolButtonValue(id, reserve) {
    const status = this.actionResourceStatus(id, reserve);
    if (!status.canRun) return `缺 ${status.missing[0]}`;
    if (status.warnings.length) return status.warnings[0].split("：")[0];
    const supplies = (reserve && reserve.supplies) || {};
    const ecology = (reserve && reserve.ecology) || {};
    const inventory = (reserve && reserve.inventory) || {};
    const map = {
      houndScout: `狗粮 ${supplies.dogFood || 0}`,
      antiPoacher: `警报 ${supplies.alarm || 0}`,
      habitat: `草场 ${ecology.grass || 0}`,
      intervention: `麻醉 ${supplies.tranquilizer || 0}`,
      salvage: `库存 ${this.recoveredGoodsCount(inventory)}`,
      buySupplies: (() => {
        const purchase = this.currentSupplyPurchase(reserve);
        return `基金 ${reserve.fund || 0}`;
      })()
    };
    return map[id] || "可执行";
  }

  recommendedPatrolAction(reserve) {
    const daily = ((this.state.world || {}).goals || {}).daily || {};
    const ecology = (reserve && reserve.ecology) || {};
    if ((reserve.poacherPressure || 0) > 50) return "antiPoacher";
    if ((ecology.water || 0) < 48 || (ecology.grass || 0) < 48) return "habitat";
    if ((ecology.disease || 0) > 32) return "houndScout";
    if ((reserve.safety || 0) < 52) return "houndScout";
    if (daily.recommendedAction && this.isPatrolTaskAction(daily.recommendedAction)) return daily.recommendedAction;
    return "houndScout";
  }

  isPatrolTaskAction(id) {
    return ["houndScout", "antiPoacher", "habitat", "intervention"].includes(id);
  }

  coercePatrolTaskAction(id) {
    return this.isPatrolTaskAction(id) ? id : "houndScout";
  }

  patrolEffectText(id) {
    const action = reserveActionById(id);
    return (action && action.effect) || "常规巡护";
  }

  patrolCostLine(id, reserve) {
    const status = this.actionResourceStatus(id, reserve);
    const cost = status.costs.length ? status.costs.join(" · ") : "免费查看";
    if (!status.canRun) return `缺 ${status.missing.join(" / ")} · ${cost}`;
    if (status.warnings.length) return `${cost} · ${status.warnings[0]}`;
    return cost === "免费查看" ? "直接执行" : `消耗 ${cost}`;
  }

  recoveredGoodsCount(inventory = {}) {
    return ["shedAntlerA", "shedAntlerB", "naturalHide", "researchSample", "recoveredTrap"]
      .reduce((sum, key) => sum + (inventory[key] || 0), 0);
  }

  salvageEconomyPreview(reserve, baseValue = 0) {
    const base = reserve || {};
    const market = base.market || {};
    const progression = base.progression || {};
    const level = Math.max(1, Math.min(10, Math.round(progression.level || 1)));
    const ownRating = (base.base && base.base.rating) || (1050 + level * 55);
    const rivals = (((base.league || {}).rivals || []).filter((rival) => !rival.mine));
    const neighborAvg = rivals.length
      ? Math.round(rivals.reduce((sum, rival) => sum + (rival.rating || 1100), 0) / rivals.length)
      : 1100;
    const levelFactor = Math.max(0.96, Math.min(1.5, 1 + (level - 1) * 0.07));
    const neighborFactor = Math.max(0.78, Math.min(1.16, 1 + (ownRating - neighborAvg) / 1600));
    const health = BALANCE_V2.fundHealth[Math.max(1, Math.min(5, level))];
    const liquidityFactor = (base.fund || 0) < health.danger ? 6.00
      : (base.fund || 0) < health.healthyMin ? 2.50 : 1;
    const marketIndex = Math.round(((((market.antler || 86) / 86) + ((market.hideSalvage || 124) / 124) + ((market.researchSample || 42) / 42)) / 3) * 100) / 100;
    const value = Math.max(0, Math.round(baseValue * levelFactor * neighborFactor * liquidityFactor));
    return { value, level, ownRating, neighborAvg, levelFactor, neighborFactor, liquidityFactor, marketIndex };
  }

  salvageBatchPreview(reserve, preferredId = "") {
    const base = reserve || {};
    const inventory = base.inventory || {};
    const market = base.market || {};
    const prices = {
      shedAntlerA: Math.max(130, Math.round((market.antler || 86) * 1.45)),
      shedAntlerB: Math.max(95, market.antler || 86),
      naturalHide: Math.max(145, market.hideSalvage || 124),
      researchSample: Math.max(60, market.researchSample || 42),
      recoveredTrap: 85
    };
    const labels = { shedAntlerA: "A级鹿角", shedAntlerB: "B级鹿角", naturalHide: "自然生命档案", researchSample: "研究样本", recoveredTrap: "陷阱证据" };
    const allKeys = Object.keys(prices);
    const order = preferredId && prices[preferredId] ? [preferredId] : allKeys;
    const counts = {};
    let remaining = 3;
    let baseValue = 0;
    order.forEach((key) => {
      const count = Math.min(remaining, inventory[key] || 0);
      if (!count) return;
      counts[key] = count;
      remaining -= count;
      baseValue += count * prices[key];
    });
    const economy = this.salvageEconomyPreview(base, baseValue);
    return Object.assign({
      count: 3 - remaining,
      counts,
      baseValue,
      description: Object.keys(counts).map((key) => `${labels[key]}×${counts[key]}`).join(" / "),
      labels,
      prices
    }, economy);
  }

  supplyPurchaseIdFromCommand(command = "") {
    const text = String(command || "");
    if (/狗粮|猎犬|侦察/.test(text)) return "dogFood";
    if (/警报|防偷|偷猎|边界/.test(text)) return "alarm";
    if (/麻醉|干预|转移/.test(text)) return "tranquilizer";
    if (/医疗|护理|救助|恢复|医/.test(text)) return "medicalKit";
    if (/工具|修复|栖息地/.test(text)) return "fieldKit";
    return "";
  }

  recommendedSupplyPurchaseId(reserve) {
    const base = reserve || (this.state.world && this.state.world.reserve) || {};
    const supplies = base.supplies || {};
    const options = supplyPurchaseCatalog(base);
    const sorted = options.slice().sort((a, b) => {
      const ar = (supplies[a.id] || 0) / Math.max(1, a.target || 1);
      const br = (supplies[b.id] || 0) / Math.max(1, b.target || 1);
      if (ar !== br) return ar - br;
      return a.cost - b.cost;
    });
    return (sorted[0] && sorted[0].id) || "dogFood";
  }

  currentSupplyPurchase(reserve, option = null) {
    const id = (option && option.purchaseId)
      || this.selectedPurchaseId
      || this.supplyPurchaseIdFromCommand(this.command)
      || this.recommendedSupplyPurchaseId(reserve);
    if (id === "all") return supplyReplenishmentPlan(reserve);
    const quantity = (option && option.purchaseAmount) || this.selectedPurchaseQuantity;
    return (quantity ? supplyPurchaseForQuantity(id, quantity, reserve) : null)
      || supplyPurchaseById(id, reserve)
      || supplyPurchaseById("dogFood", reserve)
      || supplyPurchaseCatalog(reserve)[0];
  }

  openSupplyQuantityPicker(id) {
    const reserve = (this.state.world || {}).reserve || {};
    const base = supplyPurchaseById(id, reserve);
    if (!base) return;
    const stock = (reserve.supplies || {})[id] || 0;
    const room = Math.max(0, (base.cap || 0) - stock);
    if (!room) {
      this.toast(`${base.itemLabel}库存已满`);
      return;
    }
    const missing = Math.max(1, Math.min(room, (base.target || 1) - stock));
    this.selectedPurchaseId = id;
    this.selectedPurchaseQuantity = missing;
    this.infoDetailModal = {
      kind: "supplyQuantity",
      kicker: "分项采购",
      title: `采购${base.itemLabel}`,
      icon: base.icon,
      supplyId: id,
      quantity: missing,
      footer: "点数量可直接输入；也可用 − / + 调整。"
    };
    this.render();
  }

  changeSupplyPurchaseQuantity(delta) {
    const modal = this.infoDetailModal;
    if (!modal || modal.kind !== "supplyQuantity") return;
    const reserve = (this.state.world || {}).reserve || {};
    const purchase = supplyPurchaseById(modal.supplyId, reserve);
    if (!purchase) return;
    const stock = (reserve.supplies || {})[modal.supplyId] || 0;
    const max = Math.max(1, (purchase.cap || 1) - stock);
    modal.quantity = Math.max(1, Math.min(max, (modal.quantity || 1) + delta));
    this.selectedPurchaseQuantity = modal.quantity;
    this.playSfx("tap");
    this.render();
  }

  promptSupplyPurchaseQuantity() {
    const modal = this.infoDetailModal;
    if (!modal || modal.kind !== "supplyQuantity") return;
    const reserve = (this.state.world || {}).reserve || {};
    const purchase = supplyPurchaseById(modal.supplyId, reserve);
    if (!purchase) return;
    const stock = (reserve.supplies || {})[modal.supplyId] || 0;
    const max = Math.max(1, (purchase.cap || 1) - stock);
    const runtime = getRuntime();
    if (!runtime.showModal) return;
    runtime.showModal({
      title: `输入采购数量（1–${max}）`,
      editable: true,
      placeholderText: `${modal.quantity || 1}`,
      confirmText: "确定",
      success: (res) => {
        if (!res || !res.confirm) return;
        const raw = String(res.content == null || res.content === "" ? modal.quantity : res.content).trim();
        if (!/^\d+$/.test(raw)) {
          this.toast("请输入整数数量");
          return;
        }
        modal.quantity = Math.max(1, Math.min(max, Number(raw)));
        this.selectedPurchaseQuantity = modal.quantity;
        this.render();
      }
    });
  }

  confirmSupplyQuantityPurchase() {
    const modal = this.infoDetailModal;
    if (!modal || modal.kind !== "supplyQuantity") return;
    const id = modal.supplyId;
    const quantity = modal.quantity || 1;
    this.infoDetailModal = null;
    this.useMaterialAction("buySupplies", id, quantity);
  }

  recoveredGoodsCollectionSignals(reserve) {
    const preview = previewMaterialExploration(reserve || {}, (this.state.world || {}).knownCharacters || [], (this.state.world || {}).lifeMemory || null);
    return [
      { label: "等级", value: `Lv.${preview.level}`, contribution: preview.levelContribution, note: "决定可探索区域和高品质发现上限" },
      { label: "关系", value: `${preview.relationship.securityAverage}/${preview.relationship.wildnessAverage}`, contribution: preview.relationshipContribution, note: "安全感让它愿意带路，野性让它仍认得自然线索" },
      { label: "随机", value: "?", contribution: null, note: "执行时揭晓，决定是否发现、品质和数量" }
    ];
  }

  recoveredGoodsCollectionBody(reserve) {
    return this.recoveredGoodsCollectionSignals(reserve).map((item) => {
      const contribution = typeof item.contribution === "number" ? `（修正+${item.contribution}）` : "";
      return `${item.label}${item.value}${contribution}：${item.note}`;
    }).join("；");
  }

  actionResourceStatus(id, reserve, purchaseId = null) {
    const base = reserve || (this.state.world && this.state.world.reserve) || {};
    const supplies = base.supplies || {};
    const inventory = base.inventory || {};
    const purchase = id === "buySupplies"
      ? (purchaseId && typeof purchaseId === "object"
        ? purchaseId
        : purchaseId === "all" ? supplyReplenishmentPlan(base) : (supplyPurchaseById(purchaseId, base) || this.currentSupplyPurchase(base)))
      : null;
    const costs = [];
    const missing = [];
    const warnings = [];
    const addSupply = (key, label) => {
      costs.push(`${label} 1`);
      if ((supplies[key] || 0) < 1) missing.push(label);
    };
    if (id === "houndScout") {
      addSupply("dogFood", "狗粮");
    } else if (id === "antiPoacher") {
      addSupply("alarm", "警报器");
    } else if (id === "habitat") {
      addSupply("fieldKit", "野外工具包");
    } else if (id === "salvage") {
      const goods = this.recoveredGoodsCount(inventory);
      costs.push(`库存 ${goods}`);
      if (goods < 1) warnings.push("无库存：先去探索");
    } else if (id === "intervention") {
      addSupply("tranquilizer", "麻醉弹");
    } else if (id === "buySupplies") {
      costs.push(`基金 ${purchase.cost}`);
      costs.push(purchase.batch ? `${purchase.items.length} 项补至安全线` : `${purchase.itemLabel} +${purchase.amount}`);
      if ((base.fund || 0) < purchase.cost) missing.push("基金");
      if (purchase.batch && !purchase.items.length) missing.push("补给已足");
      if (!purchase.batch && (supplies[purchase.id] || 0) >= purchase.cap) missing.push("库存已满");
    }
    return {
      canRun: missing.length === 0,
      missing,
      warnings,
      costs,
      purchase,
      short: missing.length ? `缺${missing[0]}` : (warnings[0] || costs.join(" "))
    };
  }

  actionBlockedToast(status) {
    if (!status || status.canRun) return "";
    return `缺${status.missing.join("、")}`;
  }

  canOpenMaterialsForMissing(status) {
    const materialLabels = ["狗粮", "麻醉弹", "警报器", "野外工具包", "医疗包", "基金"];
    return !!(status && status.missing && status.missing.some((item) => materialLabels.indexOf(item) >= 0));
  }

  missingResourceRoute(status) {
    const missing = (status && status.missing) || [];
    if (!missing.length) return null;
    const blocker = missing[0];
    if (this.canOpenMaterialsForMissing(status)) {
      return {
        kind: "materials",
        label: "去物资",
        nextText: `先补齐 ${blocker}`
      };
    }
    return null;
  }

  openMissingResourceRoute(status) {
    const route = this.missingResourceRoute(status);
    if (!route) {
      this.toast(this.actionBlockedToast(status));
      return;
    }
    this.patrolTaskModal = null;
    this.patrolOperationPlan = null;
    this.infoDetailModal = null;
    if (route.kind === "materials") {
      this.openMaterialsForMissing(status);
      return;
    }
    this.openActionResourceDetail(route.kind);
  }

  openMaterialsForMissing(status) {
    if (!this.canOpenMaterialsForMissing(status)) {
      this.toast(this.actionBlockedToast(status));
      return;
    }
    this.patrolTaskModal = null;
    this.patrolOperationPlan = null;
    this.infoDetailModal = null;
    this.setScreen("role");
    this.toast(`先补${status.missing[0]}，再回来执行`);
  }

  openPatrolTaskModal(option) {
    let selected = option || this.selectedReserveActionOption();
    this.patrolOperationPlan = null;
    this.selectedReserveAction = selected.id;
    if (selected.id === "buySupplies") {
      this.selectedPurchaseId = selected.purchaseId || this.selectedPurchaseId || this.recommendedSupplyPurchaseId((this.state.world || {}).reserve || {});
      if (selected.purchaseAmount) this.selectedPurchaseQuantity = selected.purchaseAmount;
      const purchase = this.currentSupplyPurchase((this.state.world || {}).reserve || {}, selected);
      selected = Object.assign({}, selected, {
        purchaseId: purchase.id,
        purchaseAmount: purchase.amount,
        label: `采购${purchase.itemLabel}`,
        icon: purchase.icon || selected.icon,
        placeholder: `例如：${purchase.command}`
      });
    } else {
      this.selectedPurchaseId = "";
      this.selectedPurchaseQuantity = 1;
    }
    if (!this.command) this.command = selected.placeholder.replace("例如：", "");
    this.pendingTaskOriginScreen = this.screen || "action";
    this.patrolTaskModal = selected;
    this.render();
  }

  reserveActionOptions() {
    return reserveActionCatalog();
  }

  selectedReserveActionOption() {
    return this.reserveActionOptions().find((option) => option.id === this.selectedReserveAction) || this.reserveActionOptions()[0];
  }

  drawSocial(ctx) {
    const topInset = this.compactStageTop();
    if (topInset > 0) { ctx.fillStyle = UI_THEME.forest800; ctx.fillRect(0, 0, this.width, topInset); }
    const chapter = getCurrentChapter((this.state.world || {}).reserve || {});
    const progress = getChapterProgress((this.state.world || {}).reserve || {});
    this.drawStagePill(ctx, 12, topInset + 4, this.width - 24, chapter, progress);
    if (!this.state.character) {
      this.empty(ctx, "你还没有接管保护区。成为卫士后才能记录动物动向。", topInset + 80);
      this.button(ctx, 28, topInset + 200, this.width - 56, 46, "成为卫士", "#1c3325", () => this.setScreen("choose"));
      this.bottom(topInset + 260);
      return;
    }
    let y = topInset + 44;
    this.sectionTitle(ctx, 18, y + 18, "动物 NPC", "点击动物查看实时心声");
    y += 34;
    this.state.world.knownCharacters.forEach((target) => {
      const active = this.selectedTarget && this.selectedTarget.id === target.id;
      const trustTier = this.animalTrustTier(target);
      const cardH = 142;
      this.roundRect(ctx, 18, y, this.width - 36, cardH, 8, active ? "#e5efd8" : "#fffaf0", active ? "#5cb87a" : "#d7ddc8");
      this.drawAnimalAvatar(ctx, target, 50, y + 44, 52, active);
      this.text(ctx, this.animalDisplayName(target), 86, y + 24, 15, "#1c3325", "700");
      this.statusPill(ctx, 86, y + 32, this.animalPersona(target).role, active ? "#1c3325" : "#e8ddbd", active ? "#fff8df" : "#26352b", 76);
      this.text(ctx, `${trustTier.title} ${this.relationValue(target, "trust")} / 警惕 ${this.relationValue(target, "threat")}`, this.width - 34, y + 24, 11, "#744d2d", "700", "right");
      this.roundRect(ctx, this.width - 132, y + 32, 98, 7, 4, "rgba(36,64,46,0.14)");
      this.roundRect(ctx, this.width - 132, y + 32, Math.max(8, 98 * Math.max(0, Math.min(1, trustTier.progress || 0))), 7, 4, active ? "#1c3325" : "#f0d376");  // v3.0
      this.wrapText(ctx, `${target.location} · ${(target.intent && target.intent.label) || target.publicState || "观察中"}`, 170, y + 48, this.width - 204, 10, 13, "#66715f", 1);
      this.roundRect(ctx, 86, y + 60, this.width - 120, 72, 7, active ? "rgba(31,90,63,0.12)" : "#f6f0df", "rgba(36,64,46,0.10)");
      this.animalRecentDialogues(target, 4).forEach((line, index) => {
        const weight = index === 0 ? "700" : "400";
        const quote = this.truncateTextToWidth(ctx, `“${line}”`, this.width - 132, 10, weight);
        this.text(ctx, quote, 98, y + 78 + index * 15, 10, index === 0 ? "#1c3325" : "#4b594e", weight);  // v3.0: 最新对白深林绿
      });
      this.addHit(18, y - this.scrollY, this.width - 36, cardH, () => {
        this.openAnimalThought(target);
      });
      y += cardH + 10;
    });
    const observationTarget = this.selectedTarget || this.state.world.knownCharacters[0];
    const observationLines = observationTarget ? this.animalRecentDialogues(observationTarget, 1) : [];
    const observation = observationLines[0]
      || (observationTarget && (observationTarget.publicState || (observationTarget.intent && observationTarget.intent.label)))
      || "保护区正在自动整理动物动向。";
    this.sectionTitle(ctx, 18, y + 24, "观察记录", "自动更新");
    this.panel(ctx, 18, y + 42, this.width - 36, 112);
    this.roundRect(ctx, 32, y + 58, 58, 26, 13, "#dff4df", "rgba(46,135,110,.34)");
    this.text(ctx, "只读记录", 61, y + 75, 11, "#216653", "700", "center");
    this.text(ctx, observationTarget ? `${this.animalDisplayName(observationTarget)} · 自动观察摘要` : "自动观察摘要", 100, y + 76, 13, "#173d34", "700");
    this.wrapText(ctx, `“${observation}”`, 34, y + 108, this.width - 68, 13, 19, "#4b594e", 2);
    this.text(ctx, "只读", 34, y + 144, 11, "#748078", "400");
    this.bottom(y + 166);
  }

  drawCollection(ctx) {
    normalizeCollectionState(this.state);
    const topInset = this.compactStageTop();
    this.drawPageBackdrop(ctx, "archive");
    if (topInset > 0) { ctx.fillStyle = UI_THEME.forest800; ctx.fillRect(0, 0, this.width, topInset); }
    const chapter = getCurrentChapter((this.state.world || {}).reserve || {});
    const progress = getChapterProgress((this.state.world || {}).reserve || {});
    this.drawStagePill(ctx, 12, topInset + 4, this.width - 24, chapter, progress);
    if (!this.state.character) {
      this.empty(ctx, "接管保护区后，才会开始记录你的长期收藏。", topInset + 80);
      this.button(ctx, 28, topInset + 200, this.width - 56, 46, "成为卫士", "#1c3325", () => this.setScreen("choose"));
      this.bottom(topInset + 260);
      return;
    }
    const summary = collectionSummary(this.state);
    const collection = this.state.world.collection;
    if (this.collectionCaseId && !collectionCaseById(this.collectionCaseId)) this.collectionCaseId = null;
    if (this.collectionCaseId) this.drawCollectionCase(ctx, topInset, summary, collection);
    else this.drawCollectionFolders(ctx, topInset, summary);
    this.contentHeight = this.height - this.navHeight();
  }

  drawCollectionFolders(ctx, topInset, summary) {
    const collection = (this.state.world || {}).collection || { items: {}, cases: {} };
    let y = topInset + 44;
    const heroH = 104;
    const hero = ctx.createLinearGradient(12, y, this.width - 12, y + heroH);
    hero.addColorStop(0, UI_THEME.forest700); hero.addColorStop(1, UI_THEME.forest900);
    this.roundRect(ctx, 12, y + 5, this.width - 24, heroH, 18, "rgba(20,31,26,.20)");
    this.roundRect(ctx, 12, y, this.width - 24, heroH, 18, hero, "rgba(232,224,201,.34)");
    const ownedIds = Object.keys(collection.items || {});
    const heroItem = collectionItemById(ownedIds[ownedIds.length - 1]) || collectionItemById("c1_whistle");
    this.roundRect(ctx, 23, y + 14, 54, 54, 16, "rgba(20,31,26,.18)");
    this.roundRect(ctx, 22, y + 11, 54, 54, 16, UI_THEME.ivory, "rgba(201,170,106,.46)");
    this.drawCollectionItemIcon(ctx, heroItem, 49, y + 38, 46);
    this.text(ctx, "剧情发现", 88, y + 25, 17, "#ffffff", "700");
    this.text(ctx, `${summary.collected}/${summary.total}`, this.width - 28, y + 27, 20, "#d8c28d", "700", "right");
    this.roundRect(ctx, 88, y + 36, this.width - 116, 7, 4, "rgba(255,255,255,.16)");
    this.roundRect(ctx, 88, y + 36, Math.max(8, (this.width - 116) * summary.collected / summary.total), 7, 4, UI_THEME.gold);
    const activeDiscovery = summary.activeDiscovery;
    const discoveryLine = activeDiscovery
      ? activeDiscovery.status === "located"
        ? `现场发现 · ${activeDiscovery.item.name} · 点地图收录`
        : `${activeDiscovery.animal.name}给出迹象 · ${activeDiscovery.actionLabel}`
      : "听动物说异常 · 做对应守护 · 在沙盘亲手发现";
    this.text(ctx, this.truncateTextToWidth(ctx, discoveryLine, this.width - 122, 10, "700"), 88, y + 59, 10, activeDiscovery ? "#fff27e" : "#d9dfd4", "700");
    this.text(ctx, activeDiscovery ? `${activeDiscovery.statusLabel} ›` : `旧档案 ${summary.legacyCount} ›`, this.width - 28, y + 80, 10, activeDiscovery ? "#fff27e" : "#d9dfd4", "700", "right");
    this.text(ctx, "主证据推动剧情 · 3/6/8件修复设施", 88, y + 82, 10, "#d9dfd4", "700");
    this.addHit(12, y - this.scrollY, this.width - 24, heroH, () => {
      if (activeDiscovery) {
        this.collectionCaseId = activeDiscovery.caseId;
        this.collectionPage = Math.floor((activeDiscovery.item.slot - 1) / 6);
        this.render();
      } else this.openCollectionOverview();
    });
    y += heroH + 8;
    const gap = 7;
    const cardW = (this.width - 24 - gap * 2) / 3;
    const available = this.height - this.navHeight() - y - 10;
    const cardH = Math.min(148, Math.floor((available - gap) / 2));
    const shelfNames = {
      case_1: "巡护遗物",
      case_2: "水文遗珍",
      case_3: "边界证物",
      case_4: "迁徙记忆",
      case_5: "共同守护",
      hidden: "森林私藏"
    };
    this.renderedCollectionFolders = [];
    summary.folders.forEach((folder, index) => {
      const x = 12 + (index % 3) * (cardW + gap);
      const cy = y + Math.floor(index / 3) * (cardH + gap);
      const unlocked = folder.hidden || folder.chapter <= (((this.state.world.reserve || {}).progression || {}).level || 1);
      const hasLead = folder.leads > 0;
      const active = unlocked && (folder.found > 0 || hasLead);
      const ownedItems = collectionItemsForCase(folder.id).filter((item) => collection.items && collection.items[item.id]);
      const featuredItem = folder.activeDiscovery
        ? collectionItemById(folder.activeDiscovery.itemId)
        : ownedItems.length ? ownedItems[ownedItems.length - 1] : collectionItemsForCase(folder.id)[0];
      this.roundRect(ctx, x, cy + 3, cardW, cardH, 18, "rgba(20,35,29,.10)");
      this.roundRect(ctx, x, cy, cardW, cardH, 18, unlocked ? UI_THEME.surface : "rgba(235,239,235,.94)", this.rgba(folder.color, unlocked ? (active ? .58 : .30) : .18));
      this.roundRect(ctx, x + 10, cy - 2, Math.min(48, cardW - 20), 7, 4, unlocked ? folder.color : this.rgba(folder.color, .45));
      this.text(ctx, folder.hidden ? "隐藏" : `第${folder.chapter}章`, x + 9, cy + 15, 9, unlocked ? folder.color : "#6c766f", "700");
      if (folder.activeDiscovery && unlocked) {
        this.roundRect(ctx, x + cardW - 24, cy + 7, 16, 16, 8, UI_THEME.danger, "rgba(255,255,255,.75)");
        this.text(ctx, folder.activeDiscovery.status === "located" ? "!" : "…", x + cardW - 16, cy + 19, 9, "#ffffff", "700", "center");
      } else if (folder.ending) {
        this.text(ctx, "✓", x + cardW - 12, cy + 18, 12, "#27815c", "700", "right");
      }
      const iconSize = Math.max(50, Math.min(62, cardH - 76, cardW - 28));
      const iconY = cy + 22 + iconSize / 2;
      ctx.save();
      ctx.globalAlpha = unlocked && ownedItems.length ? 1 : .24;
      // 图标图集自身已经有透明边缘与完整轮廓。这里不再叠加白色方底，
      // 避免小卡中出现“方框压标题”，也让物件轮廓成为真正的视觉主体。
      this.drawCollectionItemIcon(ctx, featuredItem, x + cardW / 2, iconY + 2, iconSize);
      ctx.restore();
      if (!unlocked || !ownedItems.length) {
        this.roundRect(ctx, x + cardW / 2 - 13, iconY - 8, 26, 26, 13, "rgba(28,51,37,.70)", "rgba(255,255,255,.66)");
        this.text(ctx, "?", x + cardW / 2, iconY + 11, 15, "#fff8df", "700", "center");
      }
      const titleY = cy + cardH - 48;
      this.text(ctx, this.truncateTextToWidth(ctx, shelfNames[folder.id] || folder.short, cardW - 14, 12, "700"), x + cardW / 2, titleY, 12, unlocked ? "#183326" : "#56635b", "700", "center");
      const featuredName = folder.activeDiscovery
        ? `${discoveryStatusLabel(folder.activeDiscovery.status)} · ${collectionItemById(folder.activeDiscovery.itemId).name}`
        : ownedItems.length ? featuredItem.name : unlocked ? "等待动物发现异常" : `Lv.${folder.chapter} 开放`;
      this.text(ctx, this.truncateTextToWidth(ctx, featuredName, cardW - 14, 10, "700"), x + cardW / 2, titleY + 18, 10, ownedItems.length ? folder.color : "#778179", "700", "center");
      this.roundRect(ctx, x + 10, cy + cardH - 16, cardW - 20, 6, 3, "rgba(38,72,54,.13)");
      this.roundRect(ctx, x + 10, cy + cardH - 16, Math.max(folder.found ? 7 : 0, (cardW - 20) * folder.found / Math.max(1, folder.total)), 6, 3, unlocked ? folder.color : "rgba(90,103,94,.28)");
      this.text(ctx, `${folder.found}/${folder.total}`, x + cardW - 9, cy + cardH - 20, 9, "#365143", "700", "right");
      this.renderedCollectionFolders.push({ id: folder.id, x, y: cy, w: cardW, h: cardH, iconSize, columns: 3, unlocked, found: folder.found, featuredName });
      this.addHit(x, cy - this.scrollY, cardW, cardH, () => {
        if (!unlocked) { this.toast(`第${folder.chapter}章后开放`); return; }
        this.collectionCaseId = folder.id; this.collectionPage = 0; this.render();
      });
    });
  }

  drawCollectionCase(ctx, topInset, summary, collection) {
    const caseDef = collectionCaseById(this.collectionCaseId);
    const folder = summary.folders.find((entry) => entry.id === caseDef.id);
    const caseState = collection.cases[caseDef.id];
    const items = collectionItemsForCase(caseDef.id);
    const pageCount = Math.max(1, Math.ceil(items.length / 6));
    this.collectionPage = Math.max(0, Math.min(pageCount - 1, this.collectionPage || 0));
    const pageItems = items.slice(this.collectionPage * 6, this.collectionPage * 6 + 6);
    const lead = collection.leads.find((entry) => entry.caseId === caseDef.id) || null;
    const activeDiscovery = collection.discovery && collection.discovery.active && collection.discovery.active.caseId === caseDef.id
      ? collection.discovery.active : null;
    const pending = collection.investigation.pending;
    const pendingLead = pending && collection.leads.find((entry) => entry.id === pending.leadId);
    let y = topInset + 44;
    const heroH = 78;
    this.roundRect(ctx, 12, y + 6, this.width - 24, heroH, 22, "rgba(18,61,52,.22)");
    const hero = ctx.createLinearGradient(12, y, this.width - 12, y + heroH);
    hero.addColorStop(0, UI_THEME.forest700);
    hero.addColorStop(.64, UI_THEME.forest800);
    hero.addColorStop(1, UI_THEME.forest900);
    this.roundRect(ctx, 12, y, this.width - 24, heroH, 22, hero, "rgba(232,224,201,.34)");
    if (this.art.map && this.art.map.complete) {
      ctx.save();
      this.roundRect(ctx, 12, y, this.width - 24, heroH, 22);
      ctx.clip();
      ctx.globalAlpha = .14;
      ctx.drawImage(this.art.map, this.width * .54, y, this.width * .44, heroH);
      ctx.restore();
    }
    this.roundRect(ctx, 18, y + 6, this.width - 36, heroH - 12, 17, null, "rgba(255,255,255,.20)");
    this.button(ctx, 20, y + 19, 36, 36, "‹", UI_THEME.ivory, () => { this.collectionCaseId = null; this.collectionPage = 0; this.render(); }, UI_THEME.forest800, 18);
    this.text(ctx, caseDef.hidden ? "隐藏记忆" : `第${caseDef.chapter}章发现`, 66, y + 18, 10, "#d8c28d", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, caseDef.title, this.width - 150, 14, "700"), 66, y + 41, 14, "#ffffff", "700");
    this.text(ctx, `${folder.found}/${folder.total}`, this.width - 28, y + 29, 20, "#e8ddbd", "700", "right");
    const stageLabels = ["迹象", "守护", "现场", "收录"];
    const currentStage = activeDiscovery
      ? activeDiscovery.status === "located" ? 2 : 1
      : folder.found ? 3 : 0;
    stageLabels.forEach((label, index) => {
      const sx = 67 + index * 42;
      if (index > 0) this.roundRect(ctx, sx - 12, y + 58, 14, 3, 2, index <= currentStage ? UI_THEME.gold : "rgba(255,255,255,.24)");
      this.roundRect(ctx, sx, y + 54, 11, 11, 6, index <= currentStage ? UI_THEME.gold : "rgba(255,255,255,.24)", "rgba(255,255,255,.32)");
      this.text(ctx, label, sx + 17, y + 64, 10, index <= currentStage ? UI_THEME.ivory : "#d9dfce", "700");
    });
    this.text(ctx, activeDiscovery ? discoveryStatusLabel(activeDiscovery.status) : "等待迹象", this.width - 28, y + 65, 11, activeDiscovery ? "#fff27e" : "#d9dfce", "700", "right");
    y += heroH + 8;
    const pagerY = this.height - this.navHeight() - 48;
    const gap = 7;
    const cardW = (this.width - 24 - gap * 2) / 3;
    const gridAreaH = pagerY - y - 6;
    const cardH = Math.min(150, Math.floor((gridAreaH - 7) / 2));
    this.renderedCollectionCards = [];
    pageItems.forEach((item, index) => {
      const x = 12 + (index % 3) * (cardW + gap);
      const cy = y + Math.floor(index / 3) * (cardH + gap);
      const entry = collection.items[item.id];
      const discoveryState = ((collection.discovery || {}).states || {})[item.id] || null;
      const unlocked = !!entry;
      this.roundRect(ctx, x, cy + 3, cardW, cardH, 17, "rgba(20,35,29,.10)");
      this.roundRect(ctx, x, cy, cardW, cardH, 17, unlocked ? UI_THEME.surface : "rgba(232,236,232,.94)", unlocked ? this.rgba(caseDef.color, .42) : UI_THEME.separator);
      const iconSize = Math.max(52, Math.min(60, cardW - 18, cardH - 74));
      const iconX = x + cardW / 2;
      const iconY = cy + 13 + iconSize / 2;
      this.roundRect(ctx, iconX - iconSize / 2 - 4, iconY - iconSize / 2, iconSize + 8, iconSize + 8, 17, unlocked ? "rgba(247,249,246,.96)" : "rgba(224,229,220,.94)", unlocked ? this.rgba(caseDef.color, .36) : "rgba(81,98,87,.18)");
      if (unlocked) this.drawCollectionItemIcon(ctx, item, iconX, iconY, iconSize);
      else {
        ctx.save(); ctx.globalAlpha = discoveryState ? .42 : .16;
        this.drawCollectionItemIcon(ctx, item, iconX, iconY, iconSize);
        ctx.restore();
        this.roundRect(ctx, iconX - 15, iconY - 15, 30, 30, 15, "rgba(33,55,42,.72)", "rgba(255,255,255,.60)");
        this.text(ctx, "?", iconX, iconY + 11, 18, "#fff9df", "700", "center");
      }
      const itemTitle = unlocked ? item.name : discoveryState ? item.name : item.condition.finale ? "结局藏品" : "尚未察觉";
      const itemStatus = unlocked ? "已收录" : discoveryState ? discoveryStatusLabel(discoveryState.status) : item.discoveryRole === "evidence" ? "主证据" : item.discoveryRole === "ecology" ? "生态记录" : item.discoveryRole === "memory" ? "动物记忆" : "案件结局";
      const iconVisualBottom = iconY + iconSize / 2 + 12;
      const titleY = iconVisualBottom + 18;
      this.drawFittedTextBlock(ctx, itemTitle, x + 7, titleY, cardW - 14, 29, {
        size: unlocked ? 12 : 11,
        minSize: 10,
        lineHeight: 14,
        maxLines: 2,
        color: unlocked ? "#183326" : "#526158",
        weight: "700",
        align: "center"
      });
      const statusColor = unlocked ? this.collectionRarityColor(item.rarity) : caseDef.color;
      const statusW = Math.min(cardW - 16, Math.max(40, itemStatus.length * 10 + 14));
      const statusY = cy + cardH - 24;
      this.roundRect(ctx, x + 8, statusY, statusW, 17, 8, this.rgba(statusColor, unlocked ? .15 : .07), this.rgba(statusColor, unlocked ? .38 : .20));
      this.text(ctx, itemStatus, x + 8 + statusW / 2, statusY + 12, 10, unlocked ? statusColor : "#657169", "700", "center");
      this.text(ctx, unlocked ? `第${entry.firstDay}日` : `${item.slot}/8`, x + cardW - 8, statusY + 12, 10, unlocked ? "#344a3d" : "#657169", "700", "right");
      this.renderedCollectionCards.push({
        id: item.id,
        x,
        y: cy,
        w: cardW,
        h: cardH,
        iconSize,
        iconVisualBottom,
        titleBaseline: titleY,
        titleSize: unlocked ? 12 : 11,
        statusY,
        columns: 3,
        unlocked,
        title: itemTitle,
        status: itemStatus
      });
      this.addHit(x, cy - this.scrollY, cardW, cardH, () => this.openCollectionItem(item.id));
    });
    this.button(ctx, 12, pagerY, 40, 40, "‹", this.collectionPage > 0 ? "#1c3325" : "#d5d5cb", () => this.changeCollectionPage(-1), this.collectionPage > 0 ? "#fff8df" : "#9aa093", 18);
    this.button(ctx, this.width - 52, pagerY, 40, 40, "›", this.collectionPage < pageCount - 1 ? "#1c3325" : "#d5d5cb", () => this.changeCollectionPage(1), this.collectionPage < pageCount - 1 ? "#fff8df" : "#9aa093", 18);
    const preFinalCount = caseState.itemIds.filter((id) => !(collectionItemById(id).condition || {}).finale).length;
    const caseLeadCount = collection.leads.filter((entry) => entry.caseId === caseDef.id).length;
    let label = "等待动物发现异常";
    let action = null;
    let ctaKind = "none";
    if (activeDiscovery && activeDiscovery.status === "located") {
      label = `现场发现 · 去沙盘收录`;
      action = () => { this.collectionCaseId = null; this.setScreen("home"); };
      ctaKind = "located";
    } else if (activeDiscovery) {
      label = `下一步 · ${activeDiscovery.actionLabel}`;
      action = () => this.openPatrolOperationScreen(activeDiscovery.actionId);
      ctaKind = "story";
    } else if (caseDef.hidden && pendingLead && pendingLead.caseId === caseDef.id) {
      label = "继续未完成调查";
      action = () => this.resumeCollectionInvestigation();
      ctaKind = "pending";
    } else if (preFinalCount >= 7 && !caseState.ending && !caseDef.hidden) {
      label = "线索齐全 · 决定结局";
      action = () => this.openCollectionEnding(caseDef.id);
      ctaKind = "ending";
    } else if (caseDef.hidden && lead) {
      label = `调查线索 ×${caseLeadCount}`;
      action = () => this.openCollectionInvestigation(lead.id);
      ctaKind = "lead";
    }
    if (action) {
      const pulse = .22 + (Math.sin(this.animT() * .004) + 1) * .10;
      this.roundRect(ctx, 57, pagerY - 3, this.width - 114, 46, 19, `rgba(255,214,90,${pulse + .12})`, "rgba(255,126,103,.58)");
    }
    this.button(ctx, 60, pagerY, this.width - 120, 40, label, action ? "#d8c27a" : "#cdd3cb", action, action ? "#1c3325" : "#8a938c", action ? 12 : 11);
    if (ctaKind === "lead") {
      this.roundRect(ctx, 68, pagerY + 8, 24, 24, 12, "#f46773", "rgba(255,248,223,.78)");
      this.text(ctx, `${caseLeadCount}`, 80, pagerY + 25, 13, "#ffffff", "700", "center");
    }
    this.renderedCollectionCaseCta = {
      kind: ctaKind,
      enabled: !!action,
      leadCount: caseLeadCount,
      label,
      bounds: { x: 60, y: pagerY - this.scrollY, w: this.width - 120, h: 40 }
    };
  }

  changeCollectionPage(delta) {
    if (!this.collectionCaseId) return;
    const pageCount = Math.max(1, Math.ceil(collectionItemsForCase(this.collectionCaseId).length / 6));
    const next = Math.max(0, Math.min(pageCount - 1, (this.collectionPage || 0) + delta));
    if (next === this.collectionPage) return;
    this.collectionPage = next;
    this.render();
  }

  openCollectionOverview() {
    const summary = collectionSummary(this.state);
    this.infoDetailModal = {
      kind: "collectionOverview",
      kicker: "剧情发现总览",
      title: `已收录 ${summary.collected}/${summary.total}`,
      icon: "reserve_prosperity",
      summary,
      footer: summary.activeDiscovery
        ? `${summary.activeDiscovery.statusLabel} · ${summary.activeDiscovery.actionLabel}`
        : `倾听动物 → 对应守护 → 沙盘收录 · 旧档案 ${summary.legacyCount}件`,
      actionLabel: summary.forestRemembers ? "查看最终纪念" : summary.legacyCount ? "查看旧版纪念" : "查看隐藏档案",
      action: () => summary.forestRemembers ? this.openForestRemembersIllustration() : summary.legacyCount ? this.openLegacyCollectionArchive() : (() => { this.infoDetailModal = null; this.collectionCaseId = "hidden"; this.render(); })()
    };
    this.render();
  }

  openLegacyCollectionArchive() {
    const legacy = ((this.state.world.collection || {}).legacyArchive) || { entries: {}, history: [] };
    const history = (legacy.history || []).slice(-5).reverse();
    this.infoDetailModal = {
      kicker: "只读纪念页", title: `旧版收藏 · ${legacy.count || 0}件`, icon: "reserve_level",
      items: history.length ? history.map((entry) => ({ tag: `第${entry.day || "?"}日`, title: entry.name || entry.id || "旧版收藏", body: entry.source || "旧版纪念档案" })) : [{ tag: "旧档案", title: `${Object.keys(legacy.entries || {}).length} 条历史记录`, body: "只读纪念" }],
      footer: "不计入当前剧情发现进度。"
    };
    this.render();
  }

  openForestRemembersIllustration() {
    this.infoDetailModal = null;
    this.prepareChapterArt();
    this.chapterStoryModal = {
      level: 5, phase: "collection_memory", image: ((this.chapterArt[5] || {}).end) || null,
      kicker: "隐藏档案完成", title: "森林记得你",
      body: "五件纪念放在一起。你认识过这里的生命，这里也记得你。",
      speciesLine: "最终纪念已解锁 · 分享时启用专属“森林记得你”文案",
      buttonLabel: "继续守护"
    };
    this.render();
  }

  collectionRarityColor(rarity) {
    if (/终章/.test(rarity)) return "#c45b42";
    if (/珍藏/.test(rarity)) return "#8b6f2a";
    return "#1f7a52";
  }

  openCollectionItem(id) {
    normalizeCollectionState(this.state);
    const item = collectionItemById(id);
    if (!item) return;
    const collection = ((this.state.world || {}).collection || {});
    const entry = (collection.items || {})[id] || null;
    const discoveryState = (((collection.discovery || {}).states || {})[id]) || null;
    const activeDiscovery = (collection.discovery || {}).active && collection.discovery.active.itemId === id
      ? collection.discovery.active : null;
    const caseDef = collectionCaseById(item.caseId) || { title: "剧情发现", short: "剧情发现", color: "#2b8f77" };
    const lead = (collection.leads || []).find((candidate) => candidate.caseId === item.caseId) || null;
    const pending = collection.investigation && collection.investigation.pending;
    const pendingLead = pending && (collection.leads || []).find((candidate) => candidate.id === pending.leadId && candidate.caseId === item.caseId);
    const caseState = (collection.cases || {})[item.caseId] || { itemIds: [] };
    const preFinalCount = (caseState.itemIds || []).filter((itemId) => {
      const ownedItem = collectionItemById(itemId);
      return ownedItem && !(ownedItem.condition || {}).finale;
    }).length;
    let actionLabel = "";
    let action = null;
    if (!entry && activeDiscovery && activeDiscovery.status === "located") {
      actionLabel = "去沙盘收录";
      action = () => { this.infoDetailModal = null; this.collectionCaseId = null; this.setScreen("home"); };
    } else if (!entry && activeDiscovery) {
      actionLabel = activeDiscovery.actionLabel;
      action = () => { this.infoDetailModal = null; this.openPatrolOperationScreen(activeDiscovery.actionId); };
    } else if (!entry && caseDef.hidden && pendingLead) {
      actionLabel = "继续掷骰";
      action = () => this.resumeCollectionInvestigation();
    } else if (!entry && item.condition && item.condition.finale && preFinalCount >= 7 && !caseState.ending && !caseDef.hidden) {
      actionLabel = "决定案件结局";
      action = () => this.openCollectionEnding(item.caseId);
    } else if (!entry && caseDef.hidden && lead) {
      actionLabel = "调查这条线索";
      action = () => this.openCollectionInvestigation(lead.id);
    } else if (!entry) {
      actionLabel = "去沙盘听动物";
      action = () => { this.infoDetailModal = null; this.setScreen("home"); };
    }
    this.infoDetailModal = {
      kind: "collectionItem",
      kicker: `${caseDef.short || caseDef.title} · ${entry ? "已收录" : discoveryState ? discoveryStatusLabel(discoveryState.status) : `第${item.slot}件`}`,
      title: entry || discoveryState ? item.name : item.condition && item.condition.finale ? "等待案件结局" : "尚未察觉",
      icon: item.icon,
      collectionItem: entry ? item : null,
      item,
      entry,
      caseDef,
      lead,
      pending: pendingLead || null,
      footer: entry
        ? `第${entry.firstDay || entry.day}日 · ${(entry.discovery || {}).who || ((entry.animal || {}).name) || "动物引路"} · 永久保留`
        : activeDiscovery
          ? activeDiscovery.status === "located" ? "物件已经出现在沙盘现场，点击它亲手收录。" : `动物已指出异常；完成“${activeDiscovery.actionLabel}”即可定位物件。`
          : caseDef.hidden && (lead || pendingLead) ? "隐藏发现仍可通过六面骰冒险调查。" : "先在沙盘倾听动物；它们会根据章节、季节与关系提出异常。",
      actionLabel,
      action
    };
    this.render();
  }

  openCollectionInvestigation(leadId) {
    normalizeCollectionState(this.state);
    const collection = this.state.world.collection;
    const lead = collection.leads.find((entry) => entry.id === leadId);
    if (!lead) { this.toast("这条线索已经失效"); return; }
    const caseDef = collectionCaseById(lead.caseId);
    const defaultMethodId = this.preferredCollectionMethodId(lead);
    this.infoDetailModal = {
      kind: "collectionInvestigation", kicker: "收藏定向调查", title: caseDef.title, icon: caseDef.icon,
      lead, methods: COLLECTION_METHODS, selectedMethodId: defaultMethodId, defaultMethodId, selectionChanged: false,
      footer: `调查机会 ${collection.investigation.charges}/3 · 线索质量 +${lead.quality} · 失败${collection.investigation.failedAttempts}/3`
    };
    this.render();
  }

  preferredCollectionMethodId(lead) {
    const leadAnimal = ((lead || {}).animal || {});
    const security = Number(leadAnimal.security == null ? (leadAnimal.trust || 0) : leadAnimal.security);
    const wildness = Number(leadAnimal.wildness == null ? 70 : leadAnimal.wildness);
    if (security >= 55 && wildness >= 55) return "animal";
    return "field";
  }

  selectCollectionMethod(methodId) {
    if (!this.infoDetailModal || this.infoDetailModal.kind !== "collectionInvestigation") return;
    if (!COLLECTION_METHODS.some((method) => method.id === methodId)) return;
    this.infoDetailModal.selectedMethodId = methodId;
    this.infoDetailModal.selectionChanged = methodId !== this.infoDetailModal.defaultMethodId;
    this.render();
  }

  confirmCollectionInvestigation() {
    const modal = this.infoDetailModal;
    if (!modal || modal.kind !== "collectionInvestigation" || !modal.selectedMethodId) { this.toast("先选择调查方式"); return; }
    const started = startInvestigation(this.state, modal.lead.id, modal.selectedMethodId);
    if (!started.ok) { this.toast(started.error); return; }
    saveState(this.state);
    this.openCollectionDice(modal.lead.id, modal.selectedMethodId);
  }

  openCollectionDice(leadId, methodId) {
    const collection = this.state.world.collection;
    const lead = collection.leads.find((entry) => entry.id === leadId);
    const method = COLLECTION_METHODS.find((entry) => entry.id === methodId);
    if (!lead || !method) { this.infoDetailModal = null; this.render(); return; }
    this.infoDetailModal = {
      kind: "collectionDice", kicker: "六面骰调查", title: method.name, icon: method.icon,
      lead, method, phase: "ready", displayRoll: 1,
      footer: `骰面 + 线索质量${lead.quality ? ` +${lead.quality}` : " +0"} + 方法/关系修正 = 调查总点数`,
      action: () => this.rollCollectionDice()
    };
    this.render();
  }

  resumeCollectionInvestigation() {
    const pending = ((this.state.world.collection || {}).investigation || {}).pending;
    if (!pending) { this.toast("没有待恢复调查"); return; }
    this.openCollectionDice(pending.leadId, pending.methodId);
  }

  rollCollectionDice() {
    const modal = this.infoDetailModal;
    if (!modal || modal.kind !== "collectionDice" || modal.phase === "rolling") return;
    this.playSfx("dice");
    const finalRoll = Math.floor(Math.random() * 6) + 1;
    const token = `${Date.now()}_${finalRoll}`;
    this.collectionRollToken = token;
    modal.phase = "rolling";
    let frame = 0;
    const animate = () => {
      if (this.collectionRollToken !== token || this.infoDetailModal !== modal) return;
      frame += 1;
      modal.displayRoll = frame >= 8 ? finalRoll : ((finalRoll + frame * 2) % 6) + 1;
      this.render();
      if (frame < 8) { setTimeout(animate, 65); return; }
      modal.phase = "resolved";
      this.render();
      setTimeout(() => {
        if (this.collectionRollToken !== token || this.infoDetailModal !== modal) return;
        this.collectionRollToken = null;
        this.finishCollectionInvestigation(finalRoll);
      }, 240);
    };
    animate();
  }

  finishCollectionInvestigation(roll) {
    const beforeState = JSON.parse(JSON.stringify(this.state));
    const result = resolveInvestigation(this.state, roll);
    if (!result.ok) { this.toast(result.error); this.infoDetailModal = null; this.render(); return; }
    if (result.success) recordSevenDayProgress(this.state.world.reserve, "collectionInvestigation");
    const goalProgress = applyGoalProgress(beforeState, this.state, { action: "collectionInvestigate", now: Date.now() });
    this.state = goalProgress.state;
    saveState(this.state);
    if (result.success) {
      this.infoDetailModal = {
        kicker: result.endingReady ? "案件关键物集齐" : "剧情新发现", title: result.item.name, icon: result.item.icon,
        collectionItem: result.item,
        items: [
          { tag: "点数", title: `${result.roll} + ${result.total - result.roll} = ${result.total}`, body: result.guaranteed ? "保底生效" : "达到发现条件" },
          { tag: "物件", title: result.item.rarity, body: result.item.story },
          goalProgress.rewards.length ? { tag: "目标", title: goalProgress.rewards.map((item) => item.label).join(" · "), body: "今日动物目标与长期收藏已同步。" } : null,
          { tag: "影响", title: result.extraInterpretation ? "额外解释 +1" : "已收入案件档案", body: Object.keys(result.riskChanges || {}).length ? "安全与偷猎压力已变化" : "藏品唯一 · 不占库存" }
        ].filter(Boolean),
        footer: result.endingReady ? "前7件已经集齐，可以完成本案三选一结局。" : "回沙盘倾听不同动物，可能发现新的案件线索。",
        actionLabel: result.endingReady ? "决定案件结局" : "返回案件",
        action: () => { this.infoDetailModal = null; result.endingReady ? this.openCollectionEnding(result.item.caseId) : this.render(); }
      };
    } else {
      this.infoDetailModal = {
        kicker: "调查笔记已保存", title: `本次总点数 ${result.total}`, icon: "intel",
        items: [
          { tag: "点数", title: `${result.roll} + ${result.total - result.roll} = ${result.total}`, body: "线索保留" },
          { tag: "保底", title: `${this.state.world.collection.investigation.failedAttempts}/3`, body: "满3次后，下次必得" },
          goalProgress.rewards.length ? { tag: "目标", title: goalProgress.rewards.map((item) => item.label).join(" · "), body: "调查行动已计入今日动物目标。" } : null,
          { tag: "发现", title: "线索仍在", body: result.note }
        ].filter(Boolean), footer: `剩余调查机会 ${this.state.world.collection.investigation.charges}/3`,
        actionLabel: this.state.world.collection.investigation.charges > 0 ? "重新选择方法" : "返回案件",
        action: () => { this.infoDetailModal = null; this.state.world.collection.investigation.charges > 0 ? this.openCollectionInvestigation(result.lead.id) : this.render(); }
      };
    }
    this.playSfx(result.success ? "success" : "warning");
    this.render();
  }

  openCollectionEnding(caseId) {
    const caseDef = collectionCaseById(caseId);
    const choices = COLLECTION_ENDINGS[caseId] || [];
    if (!caseDef || !choices.length) return;
    this.infoDetailModal = { kind: "collectionEnding", kicker: "案件终章·三选一", title: caseDef.title, icon: caseDef.icon, caseDef, endingChoices: choices, selectedChoiceId: null, footer: "影响路线、动物关系与世界状态。" };
    this.render();
  }

  selectCollectionEnding(choiceId) {
    if (!this.infoDetailModal || this.infoDetailModal.kind !== "collectionEnding") return;
    this.infoDetailModal.selectedChoiceId = choiceId;
    this.render();
  }

  confirmCollectionEnding() {
    const modal = this.infoDetailModal;
    if (!modal || modal.kind !== "collectionEnding" || !modal.selectedChoiceId) { this.toast("先选择案件结局"); return; }
    const beforeState = JSON.parse(JSON.stringify(this.state));
    const result = submitCaseEnding(this.state, modal.caseDef.id, modal.selectedChoiceId);
    if (!result.ok) { this.toast(result.error); return; }
    const goalProgress = applyGoalProgress(beforeState, this.state, { action: "collectionInvestigate", derivedOnly: true, now: Date.now() });
    this.state = goalProgress.state;
    const repairedFacility = facilityByCaseId(modal.caseDef.id);
    saveState(this.state);
    this.infoDetailModal = {
      kicker: "案件永久结案", title: result.finale.name, icon: result.finale.icon,
      collectionItem: result.finale,
      items: [
        { tag: "你的选择", title: result.choice.name, body: result.choice.outcome },
        { tag: "变化", title: result.changes.map((entry) => `${entry.before}→${entry.after}（${this.signed(entry.delta)}）`).join(" · "), body: `${result.choice.route}路线 +${result.routeDelta}` },
        repairedFacility ? { tag: "设施", title: `${repairedFacility.name}可建设`, body: "沙盘已出现施工标记" } : null,
        goalProgress.rewards.length ? { tag: "成长", title: goalProgress.rewards.map((item) => item.label).join(" · "), body: "森林收藏长期节点已同步。" } : null,
        { tag: "动物", title: `${result.animal.name}：安全${result.animal.security || 0} / 野性${result.animal.wildness || 0}`, body: "关系已变化" }
      ].filter(Boolean), footer: "其他案件仍可补完。"
    };
    this.playSfx("success");
    this.render();
  }

  drawLeague(ctx) {
    const scopeName = this.leagueScope === "friends" ? "好友" : "世界";
    const topInset = this.compactStageTop();
    if (topInset > 0) { ctx.fillStyle = UI_THEME.forest800; ctx.fillRect(0, 0, this.width, topInset); }
    const chapter = getCurrentChapter((this.state.world || {}).reserve || {});
    const progress = getChapterProgress((this.state.world || {}).reserve || {});
    this.drawStagePill(ctx, 12, topInset + 4, this.width - 24, chapter, progress);
    if (!this.state.character) {
      this.empty(ctx, "你还没有接管保护区。先成为卫士，再加入基地联赛。", topInset + 80);
      this.button(ctx, 28, topInset + 200, this.width - 56, 46, "成为卫士", "#1c3325", () => this.setScreen("choose"));
      this.bottom(topInset + 260);
      return;
    }
    const reserve = this.state.world.reserve || {};
    const base = reserve.base || {};
    const league = reserve.league || {};
    const rows = this.leagueRows(this.leagueScope);
    const hasFriends = this.hasFriendLeagueMembers();
    const myRank = this.leagueScope === "friends" && !hasFriends ? 0 : rows.findIndex((row) => row.mine) + 1;
    const friendRank = hasFriends ? this.leagueRankOfMine("friends") : 0;
    const worldRank = this.leagueRankOfMine("world");
    this.ensureSelectedRivalForScope(this.leagueScope);
    const rival = this.selectedRival();
    let y = topInset + 44;
    this.panel(ctx, 18, y, this.width - 36, 88);
    this.text(ctx, this.truncateTextToWidth(ctx, base.name || "我的基地", this.width - 174, 13, "700"), 34, y + 20, 13, "#1c3325", "700");
    this.text(ctx, `${scopeName}排名`, 34, y + 42, 10, "#66715f", "700");
    this.text(ctx, `#${myRank || "-"}`, 84, y + 45, 24, this.leagueScope === "world" ? "#2f7c8f" : "#1f7a52", "700");
    this.text(ctx, `评分 ${base.rating || 0}`, this.width - 34, y + 40, 14, "#8b6f2a", "700", "right");
    this.text(ctx, league.season || "保护区网络", this.width - 34, y + 20, 9, "#8b6f2a", "700", "right");
    this.button(ctx, 34, y + 54, (this.width - 80) / 2, 28, hasFriends ? `好友 #${friendRank}` : "邀请好友", this.leagueScope === "friends" ? "#1c3325" : "#e8ddbd", () => {
      this.openReserveNetwork("friends");
    }, this.leagueScope === "friends" ? "#fff8df" : "#26352b", 11);
    this.button(ctx, 46 + (this.width - 80) / 2, y + 54, (this.width - 80) / 2, 28, `世界 #${worldRank || "-"}`, this.leagueScope === "world" ? "#1c3325" : "#e8ddbd", () => {
      this.leagueScope = "world";
      this.ensureSelectedRivalForScope("world");
      this.render();
    }, this.leagueScope === "world" ? "#fff8df" : "#26352b", 11);
    this.renderedLeagueHeader = { x: 18, y, w: this.width - 36, h: 88, rank: myRank, rankSize: 24, scope: this.leagueScope };
    y += 94;

    if (this.leagueScope === "friends" && !hasFriends) {
      this.drawFriendLeagueInvite(ctx, 18, y, this.width - 36);
      this.bottom(y + 168);
      return;
    }

    if (rival) {
      this.drawLeagueBattleScene(ctx, 18, y, this.width - 36, 158, rival);
      y += 166;
    }

    this.text(ctx, `${scopeName}榜单`, 18, y + 18, 16, "#1c3325", "700");
    this.text(ctx, `点击目标 · 狗粮 ${(reserve.supplies || {}).dogFood || 0}`, this.width - 18, y + 18, 10, "#8b6f2a", "700", "right");
    y += 34;
    this.renderedLeagueRows = [];
    rows.slice(0, 6).forEach((row, index) => {
      const rank = index + 1;
      this.drawLeagueRankingRow(ctx, row, rank, 18, y, this.width - 36, 58);
      this.renderedLeagueRows.push({ id: row.id, rank, y, h: 58, mine: !!row.mine, simulated: !!row.simulated });
      y += 64;
    });

    if (this.leagueScope === "world") {
      this.drawEcologyCompetitionCard(ctx, 18, y, this.width - 36, reserve);
      y += 88;
    }

    this.drawReserveNetworkStory(ctx, 18, y, this.width - 36, 98, reserve, scopeName);
    y += 106;

    this.panel(ctx, 18, y, this.width - 36, 78);
    this.text(ctx, "最近战报", 34, y + 24, 14, "#1c3325", "700");
    (league.logs || []).slice(-2).reverse().forEach((log, index) => {
      this.text(ctx, this.truncateTextToWidth(ctx, `· ${log}`, this.width - 68, 10, "400"), 34, y + 45 + index * 16, 10, "#4b594e", "400");
    });
    this.bottom(y + 78);
  }

  drawReserveNetworkStory(ctx, x, y, w, h, reserve, scopeName) {
    const social = reserve.social || {};
    const scope = social.actorScope === "world" ? "世界保护地" : "好友保护地";
    const title = social.title || `${scopeName}保护地正在改变迁移线`;
    const body = social.log
      ? this.socialStoryLine(social)
      : "周边保护地的防护、样本移交和水源修复，会影响你的动物迁入、项目拨款和边界压力。";
    this.panel(ctx, x, y, w, h);
    this.text(ctx, "今日保护地联动", x + 16, y + 28, 16, "#1c3325", "700");
    this.statusPill(ctx, x + w - 102, y + 12, scope, social.actorScope === "world" ? "#2f7c8f" : "#1c3325", "#fff8df", 86);
    if (h <= 112) {
      this.text(ctx, this.truncateTextToWidth(ctx, `${title} · ${body}`, w - 32, 10, "400"), x + 16, y + 50, 10, "#4b594e", "400");
      const compactChipY = y + 66;
      const compactChipW = (w - 54) / 4;
      this.socialImpactChip(ctx, x + 14, compactChipY, compactChipW, "迁移", social.migrationDelta || 0, true);
      this.socialImpactChip(ctx, x + 22 + compactChipW, compactChipY, compactChipW, "拨款", social.marketDelta || 0, true);
      this.socialImpactChip(ctx, x + 30 + compactChipW * 2, compactChipY, compactChipW, "回收", social.salvageDelta || 0, true);
      this.socialImpactChip(ctx, x + 38 + compactChipW * 3, compactChipY, compactChipW, "风险", social.pressure || 0, false);
      this.addHit(x, y - this.scrollY, w, h, () => this.openSandboxInfo("world"));
      return;
    }
    this.roundRect(ctx, x + 14, y + 42, w - 28, 42, 8, "#f6f0df", "rgba(36,64,46,0.10)");
    this.text(ctx, this.truncateTextToWidth(ctx, title, w - 138, 12, "700"), x + 28, y + 59, 12, "#1c3325", "700");
    this.wrapText(ctx, body, x + 28, y + 76, w - 56, 10, 13, "#4b594e", 1);
    const chipY = y + 92;
    const chipW = (w - 130) / 4;
    this.socialImpactChip(ctx, x + 14, chipY, chipW, "迁移", social.migrationDelta || 0, true);
    this.socialImpactChip(ctx, x + 22 + chipW, chipY, chipW, "拨款", social.marketDelta || 0, true);
    this.socialImpactChip(ctx, x + 30 + chipW * 2, chipY, chipW, "回收", social.salvageDelta || 0, true);
    this.socialImpactChip(ctx, x + 38 + chipW * 3, chipY, chipW, "风险", social.pressure || 0, false);
    this.addHit(x, y - this.scrollY, w, h, () => this.openSandboxInfo("world"));
  }

  drawEcologyCompetitionCard(ctx, x, y, w, reserve) {
    const ecologyEconomy = normalizeEcologyEconomy(reserve.ecologyEconomy, reserve);
    const competition = ecologyEconomy.competition;
    const reward = ecologyCompetitionReward(competition.rank);
    this.roundRect(ctx, x, y + 4, w, 78, 18, "rgba(21,52,40,.18)");
    this.roundRect(ctx, x, y, w, 78, 18, "#fff9e8", "rgba(45,99,74,.28)");
    this.text(ctx, "区域共护季", x + 16, y + 22, 14, "#1c3325", "700");
    this.text(ctx, `Lv.${competition.bracket}同级组 · 第${competition.day}/${competition.length}日`, x + 16, y + 40, 10, "#68736a", "700");
    this.text(ctx, `#${competition.rank}`, x + w - 18, y + 27, 24, "#2f7c8f", "700", "right");
    this.text(ctx, `结算可得 ${reward} 枚`, x + w - 18, y + 44, 10, "#8b6f2a", "700", "right");
    const progress = Math.max(0, Math.min(1, (competition.contribution % (24 + competition.bracket * 7)) / (24 + competition.bracket * 7)));
    this.roundRect(ctx, x + 16, y + 53, w - 112, 9, 5, "#e4e8dc");
    if (progress > 0) this.roundRect(ctx, x + 16, y + 53, Math.max(8, (w - 112) * progress), 9, 5, "#54a980");
    this.text(ctx, `贡献 ${competition.contribution}`, x + 16, y + 73, 10, "#365448", "700");
    this.text(ctx, `共护徽片 ${ecologyEconomy.fragments.coGuardShard || 0}`, x + w - 16, y + 70, 10, "#a47616", "700", "right");
    this.addHit(x, y - this.scrollY, w, 78, () => this.openEcologyCompetitionDetail());
  }

  openEcologyCompetitionDetail() {
    const reserve = (this.state.world || {}).reserve || {};
    const ecologyEconomy = normalizeEcologyEconomy(reserve.ecologyEconomy, reserve);
    const competition = ecologyEconomy.competition;
    const reward = ecologyCompetitionReward(competition.rank);
    this.infoDetailModal = {
      kind: "generic",
      kicker: "同等级异步竞争",
      title: `区域共护季 · #${competition.rank}`,
      icon: "leaf",
      footer: "真实玩家不足时由系统保护区补位；不会抢走章节必需资源。",
      items: [
        { tag: "稀缺", title: `共护徽片 ${ecologyEconomy.fragments.coGuardShard || 0}`, body: "用于纪念地标、设施外观与赛季分享卡，不形成数值碾压。" },
        { tag: "排名", title: `贡献 ${competition.contribution} · 预计 ${reward} 枚`, body: "同等级匹配；修复、巡护、控制偷猎和稳定动物养护都会增加贡献。" },
        { tag: "超越", title: competition.lastRank > competition.rank ? `刚超过 ${competition.lastRank - competition.rank} 个保护区` : `历史最好 #${ecologyEconomy.achievements.bestRank}`, body: "先比较自己的历史最好，再比较同级保护区。" }
      ]
    };
    this.render();
  }

  drawLeagueBattleScene(ctx, x, y, w, h, rival) {
    const reserve = this.state.world.reserve || {};
    const base = reserve.base || {};
    const action = (reserve.league && reserve.league.lastAction) || {};
    this.roundRect(ctx, x, y + 5, w, h, 8, "rgba(10, 14, 10, 0.25)");
    const bg = ctx.createLinearGradient(x, y, x + w, y + h);
    bg.addColorStop(0, "#12271e");
    bg.addColorStop(0.54, "#24432c");
    bg.addColorStop(1, "#705b35");
    this.roundRect(ctx, x, y, w, h, 8, bg, "rgba(240, 211, 118, 0.32)");
    this.text(ctx, this.truncateTextToWidth(ctx, `目标：${rival.name}`, w - 178, 15, "700"), x + 16, y + 27, 15, "#fff8df", "700");
    this.text(ctx, `巡查率 ${this.raidChance(rival)}% · 狗粮 ${(reserve.supplies || {}).dogFood || 0}`, x + w - 16, y + 27, 10, "#f0d376", "700", "right");

    const baseX = x + 58;
    const rivalX = x + w - 58;
    const midY = y + (h <= 200 ? 62 : 86);
    this.drawBaseNode(ctx, baseX, midY, "我方", base.shield || 0, "#5cb87a");
    this.drawBaseNode(ctx, rivalX, midY, "对方", rival.shield || 0, "#c45b42");
    ctx.save();
    ctx.strokeStyle = action.type === "raid" || action.type === "borderPatrol" ? "#f0d376" : "rgba(255,248,223,0.28)";
    ctx.lineWidth = action.type === "raid" || action.type === "borderPatrol" ? 3 : 2;
    ctx.setLineDash(action.type === "fortify" ? [7, 6] : []);
    ctx.beginPath();
    ctx.moveTo(baseX + 34, midY);
    ctx.bezierCurveTo(x + w * 0.40, y + 48, x + w * 0.60, y + 122, rivalX - 34, midY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    const dogX = action.type === "raid" || action.type === "borderPatrol" ? x + w * 0.56 : x + w * 0.38;
    this.drawSmallGlyph(ctx, "eye", dogX, midY - 8, "#fff8df", 1.2);
    this.drawSelectionPulse(ctx, dogX, midY - 2, 14, action.type === "fortify" ? "#74d3df" : "#f0d376");

    if (h <= 200) {
      const impactItems = action.type === "exchange"
        ? [
          { label: "基金", value: action.fundDelta || 0 },
          { label: "水源", value: action.waterDelta || 0 },
          { label: "迁移", value: action.migrationDelta || 0 }
        ]
        : action.type === "raid" || action.type === "borderPatrol"
          ? [
            { label: "物资", value: action.materialDelta || 0 },
            { label: "防护", value: action.shieldDelta || 0 },
            { label: "评分", value: action.ratingDelta || 0 }
          ]
          : [];
      if (impactItems.length) {
        const impactGap = 5;
        const impactW = (w - 28 - impactGap * 2) / 3;
        impactItems.forEach((item, index) => {
          const ix = x + 14 + index * (impactW + impactGap);
          const color = item.value > 0 ? "#69d18b" : item.value < 0 ? "#ff8b84" : "#d9dfce";
          this.roundRect(ctx, ix, y + 97, impactW, 24, 7, "rgba(8,18,14,0.72)", "rgba(255,248,223,0.16)");
          this.text(ctx, item.label, ix + 8, y + 113, 8, "#b8c9bd", "700");
          this.text(ctx, this.signed(item.value), ix + impactW - 8, y + 114, 13, color, "700", "right");
        });
      } else {
        this.roundRect(ctx, x + 14, y + 97, w - 28, 24, 7, "rgba(8,18,14,0.72)", "rgba(255,248,223,0.16)");
        this.text(ctx, `巡查消耗 狗粮1 · 成功率 ${this.raidChance(rival)}%`, x + 26, y + 113, 10, "#d9dfce", "700");
      }
      const compactGap = 6;
      const compactW = (w - 32 - compactGap * 2) / 3;
      const compactY = y + h - 31;
      const patrolFill = ((reserve.supplies || {}).dogFood || 0) > 0 ? "#1c3325" : "#9aa093";
      this.button(ctx, x + 16, compactY, compactW, 27, "边界巡查", patrolFill, () => this.raidRival(), "#fff8df", 10);
      const socialAction = this.leagueScope === "friends" ? "好友协作" : "资源交换";
      const socialHandler = this.leagueScope === "friends" ? () => this.collaborateWithRival() : () => this.exchangeWithWorld();
      this.button(ctx, x + 16 + compactW + compactGap, compactY, compactW, 27, socialAction, "#2f7c8f", socialHandler, "#fff8df", 10);
      this.button(ctx, x + 16 + (compactW + compactGap) * 2, compactY, compactW, 27, "加固", "#d8c27a", () => this.upgradeShield(), "#26352b", 10);
      this.renderedLeagueBattle = {
        x, y, w, h,
        rivalId: rival.id,
        success: this.raidChance(rival),
        myShield: base.shield || 0,
        rivalShield: rival.shield || 0,
        metricSize: 16,
        actionSummary: impactItems.length ? impactItems.map((item) => `${item.label}${this.signed(item.value)}`).join(" / ") : `巡查消耗 狗粮1`,
        impacts: impactItems.map((item) => ({ label: item.label, value: item.value, valueSize: 13 })),
        buttons: 3
      };
      return;
    }

    this.roundRect(ctx, x + 14, y + 128, w - 28, 42, 7, "rgba(8, 18, 14, 0.72)", "rgba(255,248,223,0.16)");
    this.text(ctx, action.title || "等待指令", x + 26, y + 146, 12, "#fff8df", "700");
    this.wrapText(ctx, action.detail || `可影响：迁移线 ${rival.animals || 0} · 回收池 ${rival.material || 0}`, x + 26, y + 164, w - 52, 10, 13, "#d9dfce", 1);

    const chipY = y + 180;
    const chipGap = 8;
    const chipW = Math.min(82, (w - 44) / 3);
    if (action.type === "exchange") {
      this.drawLeagueExchangeImpact(ctx, x + 16, chipY, w - 32, action);
      this.text(ctx, this.truncateTextToWidth(ctx, action.resourceCost || "交换资源", w - 32, 9, "700"), x + 16, y + 216, 9, "#e8d491", "700");
    } else {
      this.leagueDeltaChip(ctx, x + 16, chipY, chipW, "物资", action.materialDelta || 0);
      this.leagueDeltaChip(ctx, x + 16 + chipW + chipGap, chipY, chipW, "防护", action.shieldDelta || 0);
      this.leagueDeltaChip(ctx, x + 16 + (chipW + chipGap) * 2, chipY, chipW, "评分", action.ratingDelta || 0);
      this.text(ctx, `巡查消耗：狗粮 1`, x + 16, y + 216, 9, "#e8d491", "700");
      this.text(ctx, `加固消耗：警报器 + 陷阱证据`, x + w - 16, y + 216, 9, "#e8d491", "700", "right");
    }
    const actionGap = 6;
    const actionW = (w - 32 - actionGap * 2) / 3;
    const patrolFill = ((reserve.supplies || {}).dogFood || 0) > 0 ? "#1c3325" : "#9aa093";
    this.button(ctx, x + 16, y + 226, actionW, 28, "边界巡查", patrolFill, () => this.raidRival(), "#fff8df", 10);
    const socialAction = this.leagueScope === "friends" ? "好友协作" : "资源交换";
    const socialFill = this.leagueScope === "friends" ? "#2f7c8f" : "#1c3325";
    const socialHandler = this.leagueScope === "friends" ? () => this.collaborateWithRival() : () => this.exchangeWithWorld();
    this.button(ctx, x + 16 + actionW + actionGap, y + 226, actionW, 28, socialAction, socialFill, socialHandler, "#fff8df", 10);
    this.button(ctx, x + 16 + (actionW + actionGap) * 2, y + 226, actionW, 28, "加固", "#d8c27a", () => this.upgradeShield(), "#26352b", 10);
  }

  drawLeagueExchangeImpact(ctx, x, y, w, action) {
    const values = [
      { label: "基金", value: action.fundDelta || 0, color: "#f0d376" },
      { label: "水源", value: action.waterDelta || 0, color: "#69d18b" },
      { label: "迁移", value: action.migrationDelta || 0, color: "#74d3df" }
    ];
    const gap = 8;
    const cardW = (w - gap * 2) / 3;
    values.forEach((item, index) => {
      const cx = x + index * (cardW + gap);
      this.roundRect(ctx, cx, y, cardW, 42, 8, "rgba(255,248,223,0.16)", "rgba(240,211,118,0.28)");
      this.text(ctx, item.label, cx + 10, y + 15, 9, "#d9dfce", "700");
      this.text(ctx, `${item.value >= 0 ? "+" : ""}${item.value}`, cx + 10, y + 34, 17, item.color, "700");
    });
  }

  drawBaseNode(ctx, x, y, label, shield, color) {
    this.roundRect(ctx, x - 34, y - 30, 68, 60, 8, "rgba(255, 248, 223, 0.10)", "rgba(255,248,223,0.22)");
    this.roundRect(ctx, x - 18, y - 14, 36, 28, 5, color, "rgba(255,248,223,0.42)");
    this.text(ctx, label, x, y + 30, 10, "#fff8df", "700", "center");
    this.text(ctx, `${shield}`, x, y + 5, this.fitTextSize(ctx, `${shield}`, 30, 16, 13, "700"), "#fff8df", "700", "center");
  }

  leagueDeltaChip(ctx, x, y, w, label, value) {
    const color = value < 0 ? "#ff9b67" : value > 0 ? "#69d18b" : "#d9dfce";
    this.roundRect(ctx, x, y, w, 26, 6, "rgba(255,248,223,0.10)", "rgba(255,248,223,0.16)");
    this.text(ctx, label, x + 8, y + 17, 9, "#d9dfce", "700");
    this.text(ctx, `${value > 0 ? "+" : ""}${value}`, x + w - 8, y + 18, 10, color, "700", "right");
  }

  drawLeagueRankingRow(ctx, row, rank, x, y, w, h) {
    const active = row.id === this.selectedRivalId && !row.mine;
    const medal = rank <= 3;
    const fill = row.mine ? "#e4efd8" : active ? "#fff1d1" : "#fffaf0";
    const stroke = row.mine ? "#5cb87a" : active ? "#d8c27a" : "#d7ddc8";
    this.roundRect(ctx, x, y + 3, w, h, 12, "rgba(18,61,52,.10)");
    this.roundRect(ctx, x, y, w, h, 12, fill, stroke);
    this.roundRect(ctx, x + 9, y + 10, 38, 38, 11, medal ? "#f0d376" : "#e8ddbd", "rgba(36,64,46,0.12)");
    this.text(ctx, `#${rank}`, x + 28, y + 35, 16, medal ? "#8b6f2a" : "#26352b", "700", "center");
    const rightReserve = 82;
    this.text(ctx, this.truncateTextToWidth(ctx, row.name, w - rightReserve - 58, 13, "700"), x + 56, y + 22, 13, "#1c3325", "700");
    const identity = row.mine
      ? `我的保护区 · 防护${row.shield || 0} · ${row.animals || this.leagueProtectedAnimalCount(row)}只`
      : `${row.simulated ? "系统守护者" : (row.owner || "匿名卫士")} · 防护${row.shield || 0} · 成功${this.raidChance(row)}%`;
    this.text(ctx, this.truncateTextToWidth(ctx, identity, w - rightReserve - 58, 10, "700"), x + 56, y + 42, 10, row.mine ? "#1f7a52" : "#66715f", "700");
    this.text(ctx, `${row.rating || 0}`, x + w - 14, y + 25, 18, row.mine ? "#1f7a52" : "#8b6f2a", "700", "right");
    this.text(ctx, row.mine ? "我的位置" : active ? "✓ 已选择" : "点击选择", x + w - 14, y + 44, 9, active ? "#1f7a52" : "#8b6f2a", "700", "right");
    if (!row.mine) {
      this.addHit(x, y - this.scrollY, w, h, () => {
        this.selectedRivalId = row.id;
        this.render();
      });
    }
  }

  leagueRows(scope = this.leagueScope) {
    const reserve = this.state.world.reserve || {};
    const base = reserve.base || {};
    const rivals = this.leagueOpponents(scope);
    return rivals.concat({
      id: "mine",
      name: base.name || "我的基地",
      owner: "我",
      rating: base.rating || 0,
      shield: base.shield || 0,
      animals: this.leagueProtectedAnimalCount(base),
      style: "自营",
      mine: true
    }).sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }

  leagueOpponents(scope = this.leagueScope) {
    const league = ((this.state.world.reserve || {}).league) || {};
    const saved = (league.rivals || []).map((rival) => Object.assign({}, rival, {
      scope: rival.scope || "world",
      simulated: typeof rival.simulated === "boolean" ? rival.simulated : !rival.scope,
      source: rival.source || ((typeof rival.simulated === "boolean" ? rival.simulated : !rival.scope) ? "system" : "player"),
      mine: false
    }));
    if (scope === "friends") {
      return saved.filter((rival) => rival.scope === "friends" && !rival.simulated);
    }
    const savedWorld = saved.filter((rival) => rival.scope === "world");
    const realWorld = savedWorld.filter((rival) => !rival.simulated);
    if (realWorld.length >= 12) return realWorld;
    const byId = {};
    savedWorld.forEach((rival) => { byId[rival.id] = rival; });
    this.seedWorldLeagueRows().forEach((rival) => {
      if (Object.keys(byId).length < 12 && !byId[rival.id]) byId[rival.id] = rival;
    });
    return Object.keys(byId).map((id) => Object.assign({}, byId[id], { mine: false, scope: "world" }));
  }

  seedWorldLeagueRows() {
    return [
      { id: "world_crown", name: "金合欢王冠保护区", owner: "阿澈", rating: 1420, shield: 72, animals: 58, material: 240, style: "高安全等级" },
      { id: "world_delta", name: "蓝河口保护区", owner: "南栀", rating: 1336, shield: 46, animals: 64, material: 220, style: "水源经营" },
      { id: "world_redsand", name: "赤沙北线保护区", owner: "卷石", rating: 1258, shield: 34, animals: 49, material: 185, style: "高迁入" },
      { id: "world_shade", name: "阴影林缘保护区", owner: "木眠", rating: 1168, shield: 61, animals: 38, material: 150, style: "防守反击" },
      { id: "world_spring", name: "泉眼洼地保护区", owner: "白昼", rating: 1096, shield: 28, animals: 44, material: 126, style: "资源恢复" },
      { id: "world_rock", name: "黑岩哨塔保护区", owner: "砾风", rating: 1032, shield: 68, animals: 32, material: 118, style: "重防护网" },
      { id: "world_bamboo", name: "青竹缓冲保护区", owner: "叶舟", rating: 978, shield: 39, animals: 47, material: 136, style: "社区共生" },
      { id: "world_moon", name: "月沼夜巡保护区", owner: "霁月", rating: 936, shield: 54, animals: 36, material: 104, style: "夜间巡护" },
      { id: "world_acacia", name: "南坡金合欢保护区", owner: "小榆", rating: 884, shield: 31, animals: 52, material: 144, style: "草场恢复" },
      { id: "world_lake", name: "候鸟浅湖保护区", owner: "听澜", rating: 842, shield: 27, animals: 56, material: 112, style: "水鸟监测" },
      { id: "world_pass", name: "象道关口保护区", owner: "川柏", rating: 798, shield: 45, animals: 41, material: 98, style: "迁徙通道" },
      { id: "world_seed", name: "晨种新生保护区", owner: "初晴", rating: 754, shield: 22, animals: 29, material: 82, style: "新站成长" }
    ].map((row) => Object.assign({}, row, { scope: "world", simulated: true, source: "system" }));
  }

  hasFriendLeagueMembers() {
    return this.leagueOpponents("friends").length > 0;
  }

  leagueRankOfMine(scope) {
    if (scope === "friends" && !this.hasFriendLeagueMembers()) return 0;
    return this.leagueRows(scope).findIndex((row) => row.mine) + 1;
  }

  leagueProtectedAnimalCount(row) {
    const protectedAnimals = row && row.protectedAnimals;
    if (!protectedAnimals) return row && row.animals ? row.animals : 0;
    return Object.keys(protectedAnimals).reduce((sum, key) => sum + (protectedAnimals[key] || 0), 0);
  }

  defaultRivalId() {
    const rivals = this.leagueOpponents(this.leagueScope || "world");
    return rivals[0] ? rivals[0].id : null;
  }

  ensureSelectedRivalForScope(scope = this.leagueScope) {
    const rivals = this.leagueOpponents(scope);
    if (!rivals.length) {
      this.selectedRivalId = null;
      return;
    }
    if (!rivals.find((rival) => rival.id === this.selectedRivalId)) {
      this.selectedRivalId = rivals[0].id;
    }
  }

  selectedRival() {
    const rivals = this.leagueOpponents(this.leagueScope);
    return rivals.find((rival) => rival.id === this.selectedRivalId) || rivals[0];
  }

  raidChance(rival) {
    const reserve = this.state.world.reserve || {};
    const team = this.houndTeamSummary(reserve);
    const power = team.tracking * 0.32 + team.pursuit * 0.24 + team.guard * 0.16 + team.cohesion * 0.16 + team.stamina * 0.12 + (team.level - 1) * 4;
    const shield = rival ? (rival.shield || 0) : 40;
    return Math.max(12, Math.min(82, Math.round(28 + power * 0.55 - shield * 0.45)));
  }

  raidRival() {
    const reserve = Object.assign({}, this.state.world.reserve || {});
    reserve.base = Object.assign({}, reserve.base || {});
    reserve.base.protectedAnimals = Object.assign({}, reserve.base.protectedAnimals || {});
    reserve.league = Object.assign({}, reserve.league || {});
    reserve.inventory = Object.assign({}, reserve.inventory || {});
    reserve.supplies = Object.assign({}, reserve.supplies || {});
    reserve.market = Object.assign({}, reserve.market || {});
    reserve.houndTeam = Object.assign({}, reserve.houndTeam || {});
    reserve.ecology = Object.assign({}, reserve.ecology || {}, {
      predators: Object.assign({}, reserve.ecology && reserve.ecology.predators || {}),
      herbivores: Object.assign({}, reserve.ecology && reserve.ecology.herbivores || {}),
      birds: Object.assign({}, reserve.ecology && reserve.ecology.birds || {})
    });
    reserve.hounds = (reserve.hounds || []).map((hound) => Object.assign({}, hound));
    reserve.league.rivals = (reserve.league.rivals || []).map((rival) => Object.assign({}, rival));
    reserve.league.logs = (reserve.league.logs || []).slice();
    const selected = this.selectedRival();
    let rivalIndex = reserve.league.rivals.findIndex((rival) => rival.id === this.selectedRivalId);
    if (rivalIndex < 0 && selected && !selected.mine) {
      reserve.league.rivals.push(Object.assign({}, selected, { scope: selected.scope || this.leagueScope || "friends" }));
      rivalIndex = reserve.league.rivals.length - 1;
    }
    if (rivalIndex < 0) {
      this.toast("先选择目标基地");
      return;
    }
    if (((reserve.supplies || {}).dogFood || 0) <= 0) {
      this.toast("缺狗粮");
      return;
    }
    const rival = reserve.league.rivals[rivalIndex];
    const chance = this.raidChance(rival);
    const blocked = (rival.shield || 0) > 55;
    const success = Math.random() * 100 < chance;
    reserve.supplies.dogFood = Math.max(0, (reserve.supplies.dogFood || 0) - 1);
    reserve.houndTeam.stamina = Math.max(0, (reserve.houndTeam.stamina || 70) - (success ? 10 : 14));
    reserve.houndTeam.cohesion = Math.min(100, (reserve.houndTeam.cohesion || 50) + 1);
    reserve.houndTeam.tracking = Math.min(100, (reserve.houndTeam.tracking || 50) + 1);
    reserve.houndTeam.lastReward = success ? "边界巡查成功，全队追踪经验提升。" : "巡查被防护网拦下，全队体能消耗较大。";
    let log;
    if (success) {
      const animals = Math.max(1, Math.min(2, Math.round(1 + chance / 70)));
      const material = Math.max(8, Math.round((rival.material || 80) * 0.06));
      reserve.inventory.researchSample = (reserve.inventory.researchSample || 0) + 1;
      reserve.inventory.recoveredTrap = (reserve.inventory.recoveredTrap || 0) + 1;
      reserve.market.antler = Math.max(45, Math.min(150, (reserve.market.antler || 86) - 2));
      reserve.market.researchSample = Math.max(24, Math.min(96, (reserve.market.researchSample || 42) + 2));
      reserve.base.rating = (reserve.base.rating || 1100) + 5;
      reserve.reputation = Math.max(0, Math.min(100, (reserve.reputation || 50) - 1));
      reserve.social = Object.assign({}, reserve.social || {}, {
        rival: Math.min(100, ((reserve.social && reserve.social.rival) || 30) + 8)
      });
      reserve.base.protectedAnimals.antelope = (reserve.base.protectedAnimals.antelope || 0) + animals;
      if (reserve.ecology && reserve.ecology.herbivores) {
        reserve.ecology.herbivores.antelope = (reserve.ecology.herbivores.antelope || 0) + animals;
        reserve.safety = Math.max(0, (reserve.safety || 55) + 1);
        reserve.migration = { trend: "in", delta: animals, reason: "边界巡查压住噪声，迁移线更偏向你的保护区" };
      }
      rival.animals = Math.max(0, (rival.animals || 0) - Math.max(0, animals - 1));
      rival.material = Math.max(0, (rival.material || 0) - material);
      rival.rating = Math.max(800, (rival.rating || 1000) - 5);
      log = `猎犬队完成${rival.name}边界巡查，迁移线向你方偏移 ${animals}，回收池优势 +${material}。`;
      reserve.social = {
        day: (this.state.world && this.state.world.day) || 1,
        title: `你巡查了${rival.name}边界`,
        actor: reserve.base.name || "我的基地",
        actorScope: this.leagueScope,
        action: "边界巡查",
        marketDelta: -4,
        migrationDelta: animals,
        salvageDelta: 1,
        pressure: 2,
        coop: (reserve.social && reserve.social.coop) || 40,
        rival: (reserve.social && reserve.social.rival) || 38,
        priceNote: "你带回样本后，可用研究样本增加，项目拨款小幅回落。",
        migrationNote: `有 ${animals} 条迁移线更偏向你的保护区，承载压力保持可控。`,
        salvageNote: "研究样本和陷阱证据库存增加。",
        log
      };
      reserve.league.lastAction = {
        type: "borderPatrol",
        title: "边界巡查成功",
        detail: `迁移线偏移 ${animals}，回收池优势 +${material}。`,
        materialDelta: material,
        shieldDelta: 0,
        ratingDelta: 5
      };
      this.toast("巡查成功");
    } else {
      const shieldText = blocked ? "，对方防护网抵消了主要攻势" : "";
      reserve.base.rating = Math.max(800, (reserve.base.rating || 1100) - 5);
      log = `巡查${rival.name}失败${shieldText}，猎犬体力下降。`;
      reserve.social = {
        day: (this.state.world && this.state.world.day) || 1,
        title: `巡查${rival.name}失败`,
        actor: rival.name,
        actorScope: this.leagueScope,
        action: "防护拦截",
        marketDelta: 0,
        migrationDelta: -1,
        salvageDelta: 0,
        pressure: 1,
        coop: (reserve.social && reserve.social.coop) || 40,
        rival: (reserve.social && reserve.social.rival) || 30,
        priceNote: "项目拨款暂时没有明显变化。",
        migrationNote: "失败的猎犬行动让边界变吵，胆小动物会短暂回避。",
        salvageNote: "没有带回回收物。",
        log
      };
      reserve.league.lastAction = {
        type: "borderPatrol",
        title: blocked ? "被防护网拦截" : "猎犬未找到突破口",
        detail: `巡查${rival.name}失败，猎犬体力下降。`,
        materialDelta: 0,
        shieldDelta: 0,
        ratingDelta: -5
      };
      this.toast("被防护网挡住");
    }
    reserve.league.rivals[rivalIndex] = rival;
    reserve.league.lastRaid = log;
    reserve.league.logs = reserve.league.logs.concat(log).slice(-8);
    this.state = Object.assign({}, this.state, { world: Object.assign({}, this.state.world, { reserve }) });
    saveState(this.state);
    this.render();
  }

  collaborateWithRival() {
    const reserve = Object.assign({}, this.state.world.reserve || {});
    const selected = this.selectedRival();
    reserve.supplies = Object.assign({}, reserve.supplies || {});
    if (!selected || selected.scope !== "friends") {
      this.toast("先选择好友保护区");
      return;
    }
    if ((reserve.supplies.dogFood || 0) < 1 || (reserve.supplies.alarm || 0) < 1) {
      this.toast("好友协作需要狗粮 1、警报器 1");
      return;
    }
    const beforeWater = ((reserve.ecology || {}).water) || 0;
    const beforeGrass = ((reserve.ecology || {}).grass) || 0;
    reserve.base = Object.assign({}, reserve.base || {}, { rating: (reserve.base && reserve.base.rating || 1100) + 4 });
    reserve.houndTeam = Object.assign({}, reserve.houndTeam || {}, {
      cohesion: Math.min(100, (reserve.houndTeam && reserve.houndTeam.cohesion || 50) + 2),
      stamina: Math.max(0, reserve.houndTeam && reserve.houndTeam.stamina || 70)
    });
    reserve.supplies.dogFood -= 1;
    reserve.supplies.alarm -= 1;
    reserve.ecology = Object.assign({}, reserve.ecology || {});
    reserve.ecology.water = Math.min(100, beforeWater + 2);
    reserve.ecology.grass = Math.min(100, beforeGrass + 1);
    reserve.migration = { trend: "in", delta: 2, reason: `与${selected.name}协作巡线，边界噪声降低，动物更愿意在两地之间迁移` };
    const social = reserve.social || {};
    const log = `你向${selected.name}发起协作援助：共同巡线，迁移线 +2，猎犬默契 +2。`;
    reserve.social = {
      day: (this.state.world && this.state.world.day) || 1,
      title: `与${selected.name}完成好友协作`,
      actor: selected.name,
      actorScope: "friends",
      action: "协作",
      marketDelta: 0,
      migrationDelta: 2,
      salvageDelta: 0,
      pressure: -1,
      coop: Math.min(100, (social.coop || 40) + 10),
      rival: Math.max(0, (social.rival || 30) - 2),
      priceNote: "好友共享巡护记录，项目拨款保持稳定。",
      migrationNote: `两地共同巡线，动物可以在${selected.name}与本保护区之间更安全地移动。`,
      salvageNote: "协作没有直接带来回收物，但降低了边界误判。",
      log
    };
    reserve.league = Object.assign({}, reserve.league || {}, {
      lastAction: { type: "cooperate", title: "好友协作完成", detail: log, materialDelta: -2, shieldDelta: 1, ratingDelta: 4, waterDelta: 2, grassDelta: 1 },
      logs: ((reserve.league && reserve.league.logs) || []).concat(log).slice(-8)
    });
    this.state = Object.assign({}, this.state, { world: Object.assign({}, this.state.world, { reserve }) });
    saveState(this.state);
    this.toast(`狗粮 -1 · 警报器 -1 · 水源 ${beforeWater}→${reserve.ecology.water} · 草场 ${beforeGrass}→${reserve.ecology.grass}`);
    this.render();
  }

  exchangeWithWorld() {
    const reserve = Object.assign({}, this.state.world.reserve || {});
    const selected = this.selectedRival();
    const inventory = Object.assign({}, reserve.inventory || {});
    const usedKey = (inventory.researchSample || 0) > 0 ? "researchSample" : (inventory.recoveredTrap || 0) > 0 ? "recoveredTrap" : "";
    const beforeFund = reserve.fund || 0;
    if (!selected || selected.scope !== "world") {
      this.toast("先选择世界保护区");
      return;
    }
    if (!usedKey) {
      this.toast("需要研究样本或陷阱证据");
      return;
    }
    const payment = `提交${usedKey === "researchSample" ? "研究样本" : "陷阱证据"}`;
    const fundGain = usedKey === "researchSample" ? 92 : usedKey === "recoveredTrap" ? 76 : 0;
    const fundDelta = fundGain;
    inventory[usedKey] = Math.max(0, inventory[usedKey] - 1);
    reserve.inventory = inventory;
    reserve.fund += fundGain;
    reserve.ecology = Object.assign({}, reserve.ecology || {});
    reserve.ecology.water = Math.min(100, (reserve.ecology.water || 0) + 1);
    reserve.market = Object.assign({}, reserve.market || {}, { researchSample: Math.min(96, (reserve.market && reserve.market.researchSample || 42) + 4) });
    const social = reserve.social || {};
    const log = `你与${selected.name}完成样本移交：${payment}，基金 ${this.signed(fundDelta)}、水源 +1、迁移 +1。`;
    reserve.social = {
      day: (this.state.world && this.state.world.day) || 1,
      title: `与${selected.name}完成世界资源交换`,
      actor: selected.name,
      actorScope: "world",
      action: "交换",
      marketDelta: 4,
      migrationDelta: 1,
      salvageDelta: 1,
      pressure: 0,
      coop: Math.min(100, (social.coop || 40) + 4),
      rival: social.rival || 30,
      priceNote: "世界保护区交换提高研究样本需求，相关项目拨款回升。",
      migrationNote: "联合水文记录让迁移路线更清楚，少量动物开始试探靠近。",
      salvageNote: "世界回收网络开放了新的证据交换窗口。",
      log
    };
    reserve.league = Object.assign({}, reserve.league || {}, {
      lastAction: {
        type: "exchange",
        title: "世界资源交换完成",
        detail: log,
        resourceCost: payment,
        fundDelta,
        waterDelta: 1,
        migrationDelta: 1,
        materialDelta: usedKey ? 0 : -60,
        shieldDelta: 0,
        ratingDelta: 2
      },
      logs: ((reserve.league && reserve.league.logs) || []).concat(log).slice(-8)
    });
    reserve.base = Object.assign({}, reserve.base || {}, { rating: (reserve.base && reserve.base.rating || 1100) + 2 });
    this.state = Object.assign({}, this.state, { world: Object.assign({}, this.state.world, { reserve }) });
    saveState(this.state);
    this.toast(`基金 ${beforeFund}→${reserve.fund}（${this.signed(reserve.fund - beforeFund)}）· 水源 +1`);
    this.render();
  }

  upgradeShield() {
    const reserve = Object.assign({}, this.state.world.reserve || {});
    reserve.base = Object.assign({}, reserve.base || {});
    reserve.league = Object.assign({}, reserve.league || {});
    reserve.inventory = Object.assign({}, reserve.inventory || {});
    reserve.league.logs = (reserve.league.logs || []).slice();
    reserve.supplies = Object.assign({}, reserve.supplies || {});
    if ((reserve.supplies.alarm || 0) < 1) {
      this.toast("加固需要警报器 1");
      return;
    }
    if ((reserve.inventory.recoveredTrap || 0) < 1) {
      this.toast("缺陷阱证据");
      return;
    }
    const beforeShield = reserve.base.shield || 0;
    reserve.supplies.alarm -= 1;
    reserve.inventory.recoveredTrap = Math.max(0, (reserve.inventory.recoveredTrap || 0) - 1);
    reserve.base.fence = (reserve.base.fence || 1) + 1;
    reserve.base.shield = Math.min(92, (reserve.base.shield || 35) + 12);
    reserve.base.rating = (reserve.base.rating || 1100) + 5;
    reserve.social = Object.assign({}, reserve.social || {}, {
      coop: Math.min(100, ((reserve.social && reserve.social.coop) || 40) + 5)
    });
    const log = `你投入 1 个警报器和 1 个陷阱证据升级防护网，基地防护提升到 ${reserve.base.shield}。`;
    reserve.social = {
      day: (this.state.world && this.state.world.day) || 1,
      title: "你加固了防护网",
      actor: reserve.base.name || "我的基地",
      actorScope: "friends",
      action: "加固",
      marketDelta: 0,
      migrationDelta: 2,
      salvageDelta: 0,
      pressure: 0,
      coop: (reserve.social && reserve.social.coop) || 45,
      rival: (reserve.social && reserve.social.rival) || 30,
      priceNote: "警报器与证据用于加固，项目拨款暂时稳定。",
      migrationNote: "防护线变厚，周边动物会更愿意试探靠近。",
      salvageNote: "回收物没有变化，但明天安全等级会更稳。",
      log
    };
    reserve.league.lastAction = {
      type: "fortify",
      title: "防护网加固完成",
      detail: `投入警报器和陷阱证据，防护等级提升到 ${reserve.base.shield}。`,
      materialDelta: -2,
      shieldDelta: 12,
      ratingDelta: 5
    };
    reserve.league.logs = reserve.league.logs.concat(log).slice(-8);
    this.state = Object.assign({}, this.state, { world: Object.assign({}, this.state.world, { reserve }) });
    saveState(this.state);
    this.toast(`警报器 -1 · 陷阱证据 -1 · 防护 ${beforeShield}→${reserve.base.shield}（+12）`);
    this.render();
  }

  drawRole(ctx) {
    const ctx2 = this.ctx;
    this.drawPageBackdrop(ctx2, "supplies");
    const topInset = this.compactStageTop();
    if (topInset > 0) { ctx2.fillStyle = "#fffdf5"; ctx2.fillRect(0, 0, this.width, topInset); }
    const chapter = getCurrentChapter((this.state.world || {}).reserve || {});
    const progress = getChapterProgress((this.state.world || {}).reserve || {});
    this.drawStagePill(ctx, 12, topInset + 4, this.width - 24, chapter, progress);
    if (!this.state.character) {
      this.empty(ctx, "你还没有接管保护区。先成为卫士，再管理物资。", topInset + 80);
      this.button(ctx, 28, topInset + 200, this.width - 56, 46, "成为卫士", "#1c3325", () => this.setScreen("choose"));
      this.bottom(topInset + 260);
      return;
    }
    const reserve = this.state.world.reserve || {};
    let y = topInset + 40;
    this.drawMaterialCompactHeader(ctx, 12, y, this.width - 24, reserve);
    y += 86;
    this.drawSupplyDepot(ctx, 12, y, this.width - 24, reserve);
    y += 382;
    this.drawRecoveredGoods(ctx, 12, y, this.width - 24, reserve);
    y += this.recoveredGoodsHeight(reserve);
    this.drawMysteryEvidence(ctx, 12, y, this.width - 24, reserve);
    y += 118;
    this.drawMarketPanel(ctx, 12, y, this.width - 24, reserve);
    y += 130;
    this.button(ctx, 24, y + 10, this.width - 48, 38, "重新开始", "#e8ddbd", () => this.resetGame(), "#26352b", 12);
    y += 58;
    this.bottom(y + 10);
  }
  drawMaterialCompactHeader(ctx, x, y, w, reserve) {
    const h = 78;
    const fundTarget = reserve.fund || 0;
    const fund = this.displayReserveNumber("fund", fundTarget);
    const supplies = reserve.supplies || {};
    const patrolDays = Math.max(0, Math.min(9, Math.floor((supplies.dogFood || 0)) + Math.floor((supplies.alarm || 0) / 2)));
    this.roundRect(ctx, x, y + 5, w, h, 15, "rgba(8,26,18,0.20)");
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#0d2519");
    g.addColorStop(0.64, "#1b4931");
    g.addColorStop(1, "#56603a");
    this.roundRect(ctx, x, y, w, h, 15, g, "rgba(231,199,109,0.48)");
    this.roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 12, null, "rgba(255,249,233,0.10)");
    if (this.art.map && this.art.map.complete) {
      ctx.save();
      this.roundRect(ctx, x, y, w, h, 15);
      ctx.clip();
      ctx.globalAlpha = 0.11;
      ctx.drawImage(this.art.map, x + w * 0.56, y, w * 0.44, h);
      ctx.restore();
    }
    this.roundRect(ctx, x + 10, y + 10, 28, 28, 11, "rgba(255,249,233,0.12)", "rgba(231,199,109,0.32)");
    this.drawUiIcon(ctx, "fund", x + 20, y + 22, 20, false)
      || this.drawSmallGlyph(ctx, "fund", x + 20, y + 22, "#f0d376", 0.72);
    this.text(ctx, "保护基金", x + 46, y + 16, 9, "#d8c27a", "700");
    this.text(ctx, fund >= 10000 ? `${(fund / 10000).toFixed(1)}万` : `${fund}`, x + 46, y + 37, 18, "#fff3b8", "700");
    this.text(ctx, "可巡护", x + w - 78, y + 16, 9, "#d8c27a", "700");
    this.text(ctx, `${patrolDays} 天`, x + w - 16, y + 36, 17, patrolDays < 3 ? "#ffb070" : "#f0d376", "700", "right");
    ctx.fillStyle = "rgba(255,248,223,0.14)";
    ctx.fillRect(x + 14, y + 44, w - 28, 1);
    const ecology = reserve.ecology || {};
    const resources = [
      { kind: "fund", label: "基金", value: reserve.fund || 0, suffix: "" },
      { kind: "water", label: "水源", value: ecology.water || 0, suffix: "" },
      { kind: "grass", label: "草场", value: ecology.grass || 0, suffix: "" }
    ];
    const colW = (w - 28) / 3;
    this.renderedActionResourceHeader = [];
    this.addHit(x, y - this.scrollY, w, h, () => this.openMaterialDetail("warehouse"));
    resources.forEach((item, index) => {
      const cx = x + 14 + index * colW;
      if (index > 0) {
        ctx.fillStyle = "rgba(255,248,223,0.12)";
        ctx.fillRect(cx, y + 51, 1, 18);
      }
      this.roundRect(ctx, cx + 4, y + 48, colW - 8, 24, 9, "rgba(255,248,223,.07)", "rgba(255,248,223,.10)");
      this.text(ctx, item.label, cx + 10, y + 64, 9, "#d9dfce", "700");
      this.text(ctx, `${item.value} ›`, cx + colW - 9, y + 64, 10, item.value ? "#fff8df" : "#ffb070", "700", "right");
      this.addHit(cx + 2, y + 45 - this.scrollY, colW - 4, 30, () => this.openReserveMetricDetail(item.kind));
      this.renderedActionResourceHeader.push({ kind: item.kind, label: item.label, value: item.value, x: cx + 2, y: y + 45, w: colW - 4, h: 30 });
    });
    this.drawChangeTag(ctx, x + w * 0.54, y + 15, this.reserveDisplayDelta("fund", fundTarget), "right", { key: "fund" });
  }
  recoveredGoodsHeight(reserve) {
    const rows = Math.ceil(5 / 3);
    return 78 + rows * 114 + 8;
  }
  drawMysteryEvidence(ctx, x, y, w, reserve) {
    const state = normalizeMysteryEvidence(reserve.mysteryEvidence);
    const count = mysteryEvidenceCount(reserve);
    const last = state.lastDiscovery;
    const h = 108;
    this.roundRect(ctx, x, y + 5, w, h, 12, "rgba(12,8,18,0.20)");
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#17271f");
    g.addColorStop(0.62, "#293322");
    g.addColorStop(1, "#5a4522");
    this.roundRect(ctx, x, y, w, h, 12, g, count ? "rgba(240,211,118,0.62)" : "rgba(139,111,42,0.34)");
    this.roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 9, null, "rgba(255,248,223,0.10)");
    this.drawSectionMarker(ctx, x + 18, y + 24, count ? "#f0d376" : "#8b7355");
    this.text(ctx, "神秘证物", x + 34, y + 28, 15, "#fff8df", "700");
    this.roundRect(ctx, x + w - 92, y + 12, 76, 23, 8, count ? "rgba(240,211,118,0.20)" : "rgba(255,248,223,0.08)", "rgba(240,211,118,0.26)");
    this.text(ctx, `超等级 ${count}/${MYSTERY_RECOVERY_CATALOG.length}`, x + w - 54, y + 28, 9, count ? "#f0d376" : "#b9b29b", "700", "center");
    this.roundRect(ctx, x + 16, y + 44, 52, 48, 12, "rgba(240,211,118,0.12)", "rgba(240,211,118,0.24)");
    this.drawUiIcon(ctx, (last && last.icon) || "intel", x + 42, y + 68, 34, false, count ? 1 : 0.46)
      || this.drawLargeIcon(ctx, (last && last.icon) || "eye", x + 42, y + 68, count ? "#f0d376" : "#8b7355", 28);
    const title = last ? last.name : "档案尚未解封";
    this.text(ctx, this.truncateTextToWidth(ctx, title, w - 116, 15, "700"), x + 82, y + 61, 15, last ? "#f0d376" : "#d9dfce", "700");
    const body = last
      ? `第${last.day}日追回 · 联合执法拨款 +${last.fundReward} · 已永久封存`
      : "剧情、风险数据与巡护选择同时满足后，可能追回物种表之外的证物。";
    this.drawFittedTextBlock(ctx, body, x + 82, y + 80, w - 110, 18, {
      size: 10,
      minSize: 9,
      lineHeight: 12,
      color: last ? "#e5dbbd" : "#aeb9ad"
    });
    this.text(ctx, "›", x + w - 18, y + 76, 22, "#f0d376", "700", "center");
    this.addHit(x, y - this.scrollY, w, h, () => this.openMysteryEvidenceDetail());
  }
  drawFundStack(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.scale(scale, scale);
    const sx = x / scale;
    const sy = y / scale;
    ctx.fillStyle = "#d8b447";
    ctx.strokeStyle = "#8b6f2a";
    ctx.lineWidth = 1.4;
    [-8, 0, 8].forEach((dx, index) => {
      ctx.beginPath();
      ctx.ellipse(sx + dx, sy + 7 - index * 5, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = index === 0 ? "#e4c45c" : "#d8b447";
    });
    ctx.fillStyle = "#1c3325";
    ctx.beginPath();
    ctx.ellipse(sx + 6, sy - 10, 7, 11, 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPatrolDayGauge(ctx, x, y, value, scale = 1) {
    const filled = Math.max(0, Math.min(9, value || 0));
    for (let i = 0; i < 9; i += 1) {
      const angle = -Math.PI * 0.85 + i * (Math.PI * 1.7 / 8);
      const px = x + Math.cos(angle) * 19 * scale;
      const py = y + Math.sin(angle) * 19 * scale;
      ctx.beginPath();
      ctx.arc(px, py, 3.2 * scale, 0, Math.PI * 2);
      ctx.fillStyle = i < filled ? (filled < 3 ? "#c45b42" : "#5cb87a") : "rgba(139, 111, 42, 0.28)";
      ctx.fill();
    }
    this.drawSmallGlyph(ctx, "signal", x, y + 4 * scale, filled < 3 ? "#c45b42" : "#7d692d", 1.15 * scale);
  }

  drawSectionActionButton(ctx, x, y, w, label, fill, onTap, disabled = false) {
    const h = 28;
    const buttonFill = disabled ? "#9aa093" : fill;
    const role = this.controlRole(buttonFill, disabled ? null : onTap);
    const style = this.controlStyle(role, buttonFill, buttonFill === "#d8c27a" ? UI_THEME.ink : "#ffffff");
    this.roundRect(ctx, x, y, w, h, 10, style.fill, style.stroke);
    this.text(ctx, label, x + w / 2, y + 19, 11, style.color, "700", "center");
    this.addHit(x, y - this.scrollY, w, h, () => {
      if (disabled) {
        this.toast("资源不足");
        return;
      }
      onTap();
    });
  }

  drawSupplyDepot(ctx, x, y, w, reserve) {
    // v3.1 巡护补给区：一键补齐全部缺口；单卡按数量采购。
    const supplies = reserve.supplies || {};
    const items = [
      { id: "dogFood",      name: "狗粮",   subName: "Dog Food",   value: supplies.dogFood || 0,      target: 6, icon: "dogFood",      use: "侦察" },
      { id: "tranquilizer", name: "麻醉弹", subName: "Tranquilizer", value: supplies.tranquilizer || 0, target: 3, icon: "tranquilizer", use: "干预" },
      { id: "alarm",        name: "警报器", subName: "Alarm",      value: supplies.alarm || 0,         target: 2, icon: "signal",       use: "防偷猎" },
      { id: "fieldKit",     name: "野外工具包", subName: "Field Kit", value: supplies.fieldKit || 0, target: 2, icon: "habitat", use: "修复" },
      { id: "medicalKit",   name: "医疗包", subName: "Medical Kit", value: supplies.medicalKit || 0, target: 2, icon: "fieldKit", use: "救助" }
    ];
    const lowCount = items.filter(item => item.value < item.target).length;
    const h = 378;
    // 面板背景：象牙白
    this.roundRect(ctx, x, y + 4, w, h, 12, "rgba(20,16,8,0.10)");
    this.roundRect(ctx, x, y, w, h, 12, "rgba(255,253,245,0.96)", "rgba(36,64,46,0.16)");
    // 标题行
    this.drawSectionMarker(ctx, x + 18, y + 24, lowCount ? "#c45b42" : "#5cb87a");
    this.text(ctx, "巡护补给", x + 34, y + 29, 16, "#1c3325", "700");
    // 采购按钮（右侧）
    const replenishPlan = supplyReplenishmentPlan(reserve);
    this.drawSectionActionButton(ctx, x + w - 88, y + 10, 76, replenishPlan.items.length ? "一键补齐" : "补给充足", "#1c3325",
      () => this.useMaterialAction("buySupplies", "all"),
      !replenishPlan.items.length);
    // 状态点
    this.drawSupplyStatusDots(ctx, x + w - 170, y + 13, lowCount);
    // 2×3 卡片；最后一格留白，避免把图标压缩成不可识别的小尺寸。
    const cardW = (w - 42) / 2;
    const notice = this.materialChangeNotice;
    items.forEach((item, index) => {
      const cx = x + 16 + (index % 2) * (cardW + 10);
      const cy = y + 52 + Math.floor(index / 2) * 96;
      item.animationKey = `supply:${item.id}`;
      item.displayValue = this.displayReserveNumber(item.animationKey, item.value);
      item.delta = (notice && notice.supplies && notice.supplies[item.id]) || 0;
      this.drawSupplyCard(ctx, item, cx, cy, cardW, 96);
      this.addHit(cx, cy - this.scrollY, cardW, 96, () => this.openSupplyQuantityPicker(item.id));
    });
  }

  drawSupplyQuantityContent(ctx, modal, x, bodyY, w, bodyH) {
    const reserve = (this.state.world || {}).reserve || {};
    const base = supplyPurchaseById(modal.supplyId, reserve);
    if (!base) return;
    const supplies = reserve.supplies || {};
    const stock = supplies[modal.supplyId] || 0;
    const room = Math.max(0, (base.cap || 0) - stock);
    const quantity = Math.max(1, Math.min(room || 1, modal.quantity || 1));
    const purchase = supplyPurchaseForQuantity(modal.supplyId, quantity, reserve);
    const enough = (reserve.fund || 0) >= (purchase.cost || 0);
    modal.quantity = quantity;
    const px = x + 30;
    const pw = w - 60;
    this.roundRect(ctx, px, bodyY + 18, pw, 78, 14, "rgba(239,246,231,.92)", "rgba(36,64,46,.15)");
    this.drawUiIcon(ctx, base.icon, px + 38, bodyY + 57, 50, false)
      || this.drawSupplySymbol(ctx, modal.supplyId, px + 38, bodyY + 57, "#1c3325", .9);
    this.text(ctx, base.itemLabel, px + 76, bodyY + 46, 16, "#1c3325", "700");
    this.text(ctx, `库存 ${stock} · 安全线 ${base.target} · 上限 ${base.cap}`, px + 76, bodyY + 70, 11, "#66715f", "600");

    const controlY = bodyY + 120;
    const buttonSize = 48;
    this.roundRect(ctx, px + 18, controlY, buttonSize, buttonSize, 16, "#eef1e9", "rgba(36,64,46,.18)");
    this.text(ctx, "−", px + 42, controlY + 33, 24, quantity <= 1 ? "#a6aca3" : "#1c3325", "600", "center");
    this.addHit(px + 18, controlY - this.scrollY, buttonSize, buttonSize, () => this.changeSupplyPurchaseQuantity(-1));
    const amountX = px + pw / 2 - 46;
    this.roundRect(ctx, amountX, controlY - 4, 92, 58, 18, "#fff7d8", "rgba(199,165,95,.58)");
    this.text(ctx, `${quantity}`, amountX + 46, controlY + 31, 25, "#1c3325", "700", "center");
    this.text(ctx, "点击输入", amountX + 46, controlY + 48, 9, "#8b6f2a", "700", "center");
    this.addHit(amountX, controlY - 4 - this.scrollY, 92, 58, () => this.promptSupplyPurchaseQuantity());
    this.roundRect(ctx, px + pw - 66, controlY, buttonSize, buttonSize, 16, "#1c3325", "rgba(36,64,46,.18)");
    this.text(ctx, "+", px + pw - 42, controlY + 33, 22, quantity >= room ? "#a8b2aa" : "#fff8df", "600", "center");
    this.addHit(px + pw - 66, controlY - this.scrollY, buttonSize, buttonSize, () => this.changeSupplyPurchaseQuantity(1));

    const summaryY = bodyY + 206;
    this.roundRect(ctx, px, summaryY, pw, 92, 14, enough ? "#173c2b" : "#4a2c25", enough ? "rgba(105,209,139,.45)" : "rgba(255,176,112,.45)");
    const after = stock + quantity;
    this.text(ctx, "采购后库存", px + 18, summaryY + 26, 10, "#d9dfce", "700");
    this.text(ctx, `${stock} → ${after}`, px + 18, summaryY + 57, 20, "#69d18b", "700");
    this.text(ctx, "保护基金", px + pw - 18, summaryY + 26, 10, "#d9dfce", "700", "right");
    this.text(ctx, `${reserve.fund || 0} → ${Math.max(0, (reserve.fund || 0) - purchase.cost)}`, px + pw - 18, summaryY + 57, 18, enough ? "#ffd65a" : "#ff9a84", "700", "right");
    this.text(ctx, enough ? `本次支出 ${purchase.cost}` : `还缺基金 ${purchase.cost - (reserve.fund || 0)}`, px + pw - 18, summaryY + 78, 10, enough ? "#d9dfce" : "#ffb070", "700", "right");
  }

  drawSupplyCard(ctx, item, x, y, w, h) {
    // v3.0 补给卡片 — 按效果图：左侧大图标 + 右侧名称+英文+数量 + LOW角标 + 进度条
    const displayValue = typeof item.displayValue === "number" ? item.displayValue : item.value;
    const ratio = Math.max(0, Math.min(1, displayValue / item.target));
    const low = displayValue < item.target;
    this.roundRect(ctx, x, y + 3, w, h, 14, "rgba(20,35,29,.10)");
    this.roundRect(ctx, x, y, w, h, 14, UI_THEME.surface, low ? "rgba(211,93,87,.38)" : UI_THEME.separator);
    // 图标资源本身已有完整玩具底座，不再额外叠加灰绿色圆形底板。
    const iconCx = x + 36;
    const iconCy = y + h / 2 - 4;
    this.drawUiIcon(ctx, item.icon || item.id, iconCx, iconCy, 50, false, low ? 0.86 : 1)
      || this.drawSupplySymbol(ctx, item.id, iconCx, iconCy, low ? "#c45b42" : "#1c3325", 0.86);
    // 右侧文字区
    const tx = x + 74;
    this.text(ctx, item.name, tx, y + 26, 15, "#1c3325", "700");
    this.text(ctx, `安全线 ${item.target}`, tx, y + 43, 11, low ? "#b34231" : "#66715f", "700");
    // 数量（右下角大字）
    const valStr = `${displayValue}`;
    this.text(ctx, valStr, x + w - 14, y + h - 22, this.fitTextSize(ctx, valStr, 36, 24, 18, "700"), low ? "#c45b42" : "#1c3325", "700", "right");
    // 进度条
    this.roundRect(ctx, x + 12, y + h - 12, w - 24, 6, 3, "rgba(139,111,42,0.18)");
    this.roundRect(ctx, x + 12, y + h - 12, Math.max(8, (w - 24) * ratio), 6, 3, low ? "#c45b42" : "#5cb87a");
    // 缺货作为系统状态胶囊呈现，不再使用与 iOS 卡片冲突的斜切角标。
    if (low) {
      this.roundRect(ctx, x + w - 42, y + 8, 32, 18, 9, "rgba(211,93,87,.12)");
      this.text(ctx, "短缺", x + w - 26, y + 21, 8, UI_THEME.danger, "700", "center");
    }
    // delta 角标
    const animatedDelta = item.animationKey ? this.reserveDisplayDelta(item.animationKey, item.value) : 0;
    const shownDelta = animatedDelta || item.delta;
    if (shownDelta) {
      const deltaText = this.signed(shownDelta);
      const badgeFill = shownDelta > 0 ? "#5cb87a" : "#c45b42";
      // 差值与右下角库存数字组成一组，避开名称、图标和右上 LOW 角标。
      this.roundRect(ctx, x + w - 68, y + h - 42, 28, 17, 6, badgeFill);
      this.text(ctx, deltaText, x + w - 54, y + h - 30, 9, "#fff8df", "700", "center");
    }
  }
  drawSupplyStatusDots(ctx, x, y, lowCount) {
    const label = lowCount ? "短缺" : "稳定";
    const color = lowCount ? "#c45b42" : "#1c3325";  // v3.0
    this.roundRect(ctx, x, y, 82, 22, 8, lowCount ? "#fff0e8" : "#e6f2dc", "rgba(36,64,46,0.10)");
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.arc(x + 11 + i * 9, y + 11, 3, 0, Math.PI * 2);
      ctx.fillStyle = i < lowCount ? "#c45b42" : "rgba(31, 90, 63, 0.35)";
      ctx.fill();
    }
    this.text(ctx, label, x + 73, y + 15, 10, color, "700", "right");
  }

  drawSupplySymbol(ctx, id, x, y, color, scale = 1) {
    if (this.drawUiIcon(ctx, id, x, y, 42 * scale, false)) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2 * scale;
    if (id === "dogFood") {
      ctx.beginPath();
      ctx.ellipse(x, y + 6 * scale, 15 * scale, 7 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      [x - 6 * scale, x, x + 6 * scale].forEach((px) => {
        ctx.beginPath();
        ctx.arc(px, y - 3 * scale, 3 * scale, 0, Math.PI * 2);
        ctx.fill();
      });
    } else if (id === "tranquilizer") {
      ctx.beginPath();
      ctx.moveTo(x - 15 * scale, y + 10 * scale);
      ctx.lineTo(x + 14 * scale, y - 9 * scale);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 12 * scale, y - 10 * scale);
      ctx.lineTo(x + 6 * scale, y - 12 * scale);
      ctx.lineTo(x + 10 * scale, y - 4 * scale);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - 15 * scale, y + 10 * scale);
      ctx.lineTo(x - 19 * scale, y + 3 * scale);
      ctx.moveTo(x - 15 * scale, y + 10 * scale);
      ctx.lineTo(x - 8 * scale, y + 12 * scale);
      ctx.stroke();
    } else if (id === "alarm") {
      this.drawSmallGlyph(ctx, "signal", x, y, color, 1.45 * scale);
    } else if (id === "fieldKit") {
      this.roundRect(ctx, x - 13 * scale, y - 12 * scale, 26 * scale, 24 * scale, 5 * scale, "rgba(31, 90, 63, 0.02)", color);
      ctx.beginPath();
      ctx.moveTo(x - 7 * scale, y);
      ctx.lineTo(x + 7 * scale, y);
      ctx.moveTo(x, y - 7 * scale);
      ctx.lineTo(x, y + 7 * scale);
      ctx.stroke();
    } else {
      this.drawSmallGlyph(ctx, "leaf", x, y, color, 1.3 * scale);
    }
    ctx.restore();
  }

  drawRecoveredGoods(ctx, x, y, w, reserve) {
    // 科研与执法样本区：固定展示 5 类，没库存也让玩家知道存在和来源。
    const inventory = reserve.inventory || {};
    const pending = reserve.pendingRecovered || {};
    const market = reserve.market || {};
    const goods = [
      { id: "shedAntlerA",    name: "A级鹿角", icon: "claw",         value: inventory.shedAntlerA || 0,    pending: pending.shedAntlerA || 0,    price: Math.round((market.antler || 86) * 1.45) },
      { id: "shedAntlerB",    name: "B级鹿角", icon: "claw",         value: inventory.shedAntlerB || 0,    pending: pending.shedAntlerB || 0,    price: market.antler || 86 },
      { id: "naturalHide",    name: "自然生命档案", icon: "trail",     value: inventory.naturalHide || 0,    pending: pending.naturalHide || 0,    price: market.hideSalvage || 124 },
      { id: "researchSample", name: "研究样本", icon: "eye",          value: inventory.researchSample || 0, pending: pending.researchSample || 0, price: market.researchSample || 42 },
      { id: "recoveredTrap",  name: "陷阱证据", icon: "antiPoacher",  value: inventory.recoveredTrap || 0,  pending: pending.recoveredTrap || 0,  price: 65 }
    ];
    goods.forEach((item) => {
      item.inventoryKey = `inventory:${item.id}`;
      item.pendingKey = `pending:${item.id}`;
      item.displayValue = this.displayReserveNumber(item.inventoryKey, item.value);
      item.displayPending = this.displayReserveNumber(item.pendingKey, item.pending);
    });
    const availableCount = goods.reduce((sum, item) => sum + item.value, 0);
    const pendingCount = goods.reduce((sum, item) => sum + item.pending, 0);
    const displayAvailableCount = goods.reduce((sum, item) => sum + item.displayValue, 0);
    const displayPendingCount = goods.reduce((sum, item) => sum + item.displayPending, 0);
    const batchPreview = this.salvageBatchPreview(reserve);
    const cols = 3;
    const cardW = (w - (cols - 1) * 8 - 28) / cols;
    const cardH = 106;
    const rows = Math.ceil(goods.length / cols);
    const panelH = 78 + rows * (cardH + 8) + 8;
    this.roundRect(ctx, x, y + 3, w, panelH, 12, "rgba(20,16,8,0.08)");
    this.roundRect(ctx, x, y, w, panelH, 12, "rgba(255,253,245,0.96)", "rgba(36,64,46,0.14)");
    // 标题
    this.drawSectionMarker(ctx, x + 18, y + 24, "#5cb87a");
    this.text(ctx, "科研与执法样本", x + 34, y + 29, 16, "#1c3325", "700");
    this.drawSectionActionButton(ctx, x + w - 96, y + 10, 80, "处理样本", "#d8c27a", () => this.openRecoveredChoice(), !availableCount);
    const summaryItems = [
      { label: "待收取", value: displayPendingCount, color: pendingCount ? "#1f7a52" : "#8b7355" },
      { label: "已入库", value: displayAvailableCount, color: availableCount ? "#1c3325" : "#8b7355" },
      { label: "预计拨款", value: `+${batchPreview.value}`, color: batchPreview.value ? "#b07a16" : "#8b7355" }
    ];
    const summaryW = (w - 40) / 3;
    summaryItems.forEach((summary, index) => {
      const sx = x + 14 + index * (summaryW + 6);
      this.roundRect(ctx, sx, y + 40, summaryW, 28, 7, "rgba(243,237,221,0.92)", "rgba(139,111,42,0.14)");
      this.text(ctx, summary.label, sx + 8, y + 57, 9, "#66715f", "700");
      this.text(ctx, `${summary.value}`, sx + summaryW - 8, y + 58, 11, summary.color, "700", "right");
    });
    // 卡片
    const notice = this.materialChangeNotice;
    goods.forEach((item, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const cx = x + 14 + col * (cardW + 8);
      const cy = y + 76 + row * (cardH + 8);
      item.delta = (notice && (((notice.inventory || {})[item.id]) || ((notice.pending || {})[item.id]))) || 0;
      item.estimate = this.salvageBatchPreview(reserve, item.id).value;
      this.addHit(cx, cy - this.scrollY, cardW, cardH, () => this.openMaterialDetail("goods", item.id));
      this.drawRecoveredGoodsTile(ctx, item, cx, cy, cardW, cardH);
    });
  }
  drawRecoveredGoodsTile(ctx, item, x, y, w, h) {
    const canCollect = (item.pending || 0) > 0;
    const canSell = item.value > 0;
    const active = canCollect || canSell;
    const statusText = canCollect ? `待收 ×${item.displayPending}` : canSell ? `库存 ×${item.displayValue}` : "未发现";
    // 阴影
    this.roundRect(ctx, x, y + 3, w, h, 10, "rgba(20,16,8,0.10)");
    // 背景
    this.roundRect(ctx, x, y, w, h, 10,
      canCollect ? "rgba(235,246,224,0.98)" : canSell ? "rgba(255,250,230,0.96)" : "rgba(240,236,220,0.80)",
      canCollect ? "rgba(31,122,82,0.38)" : canSell ? "rgba(36,64,46,0.18)" : "rgba(36,64,46,0.08)");
    // 图标文件已经包含彩色底座；不再在其下方放置第二块灰绿色方框。
    this.drawUiIcon(ctx, item.icon, x + 25, y + 26, 30, false, active ? 1 : 0.45)
      || this.drawSmallGlyph(ctx, item.icon, x + 25, y + 26, active ? "#1c3325" : "#9aa093", 0.9);
    this.text(ctx, this.truncateTextToWidth(ctx, item.name, w - 50, 12, "700"), x + 48, y + 24, 12, active ? "#24402e" : "#66715f", "700");
    this.text(ctx, statusText, x + w - 10, y + 48, this.fitTextSize(ctx, statusText, w - 54, 16, 10, "700"), canCollect ? "#1f7a52" : canSell ? "#1c3325" : "#9aa093", "700", "right");
    this.text(ctx, canSell ? `项目拨款 +${item.estimate}` : canCollect ? "收取后才能移交" : "探索后可能发现", x + 10, y + 66, 9, canSell ? "#b07a16" : "#8b7355", "700");
    const pendingDelta = this.reserveDisplayDelta(item.pendingKey, item.pending);
    const inventoryDelta = this.reserveDisplayDelta(item.inventoryKey, item.value);
    const animatedDelta = inventoryDelta || pendingDelta;
    const shownDelta = item.delta || animatedDelta;
    if (shownDelta) {
      this.roundRect(ctx, x + 42, y + 28, 28, 16, 6, shownDelta > 0 ? "#5cb87a" : "#c45b42");
      this.text(ctx, this.signed(shownDelta), x + 56, y + 39, 9, "#fff8df", "700", "center");
    }
    // 双按钮行
    const btnW = (w - 12) / 2;
    const btnY = y + h - 30;
    // 收取按钮
    this.roundRect(ctx, x + 4, btnY, btnW, 24, 7,
      canCollect ? "#1c3325" : "#9aa093",
      canCollect ? "rgba(240,211,118,0.32)" : "rgba(255,255,255,0.20)");
    this.text(ctx, canCollect ? "收取" : canSell ? "已入库" : "去探索", x + 4 + btnW / 2, btnY + 16, 10, "#fff8df", "700", "center");
    this.addHit(x + 4, btnY - this.scrollY, btnW, 24, () => {
      if (canCollect) { this.collectRecoveredGood(item.id); return; }
      if (canSell) { this.openMaterialDetail("goods", item.id); return; }
      this.openMaterialExploration(item.id);
    });
    // 移交按钮（金色）
    const sellX = x + 4 + btnW + 4;
    this.roundRect(ctx, sellX, btnY, btnW, 24, 7,
      canSell ? "#d8c27a" : "#9aa093",
      canSell ? "rgba(36,64,46,0.22)" : "rgba(255,255,255,0.20)");
    this.drawUiIcon(ctx, "sell_goods", sellX + 8, btnY + 12, 8, false)
      || this.drawSmallGlyph(ctx, "fund", sellX + 8, btnY + 12, canSell ? "#26352b" : "#fff8df", 0.5);
    this.text(ctx, canSell ? "移交" : canCollect ? "先收" : "无样本", sellX + btnW / 2 + 4, btnY + 16, 10, canSell ? "#26352b" : "#fff8df", "700", "center");
    this.addHit(sellX, btnY - this.scrollY, btnW, 24, () => {
      if (!canSell) { this.toast(canCollect ? "先收取入库" : "未发现回收物"); return; }
      this.openRecoveredChoice(item.id);
    });
  }

  openRecoveredChoice(preferredId = "") {
    const reserve = (this.state.world || {}).reserve || {};
    if (this.recoveredGoodsCount(reserve.inventory || {}) <= 0) {
      this.toast("当前没有可处理的回收物");
      return;
    }
    this.infoDetailModal = {
      kind: "recoveredChoice",
      kicker: "回收物去向",
      title: preferredId ? "这件样本要怎样使用？" : "选择本批样本的用途",
      icon: "salvage",
      preferredId,
      selectedMode: "immediate",
      footer: "立即周转、次日增值，或换取案件进度；三者不能同时获得。"
    };
    this.render();
  }

  drawRecoveredChoiceContent(ctx, modal, x, bodyY, w, bodyH) {
    const cards = [
      { id: "immediate", icon: "fund", title: "立即移交", value: "今日获得 1.00× 项目拨款", body: "适合基金不足、急需采购巡护补给。" },
      { id: "appraise", icon: "eye", title: "设施鉴定", value: "明日获得 1.25× 项目拨款", body: "今天没有基金收入，换取更高长期价值。" },
      { id: "case", icon: "trail", title: "留作任务样本", value: "案件 / 设施进度 +1～3", body: "不获得基金，用于推动收藏案件与设施修复。" }
    ];
    const panelX = x + 28;
    const cardW = w - 56;
    const gap = 9;
    const cardH = Math.min(92, Math.floor((bodyH - 42 - gap * 2) / 3));
    cards.forEach((card, index) => {
      const cy = bodyY + 16 + index * (cardH + gap);
      const selected = modal.selectedMode === card.id;
      this.roundRect(ctx, panelX, cy + 3, cardW, cardH, 13, "rgba(18,61,52,.12)");
      this.roundRect(ctx, panelX, cy, cardW, cardH, 13, selected ? "#eef6df" : "#fffaf0", selected ? "#2e876e" : "rgba(57,78,66,.18)");
      this.drawUiIcon(ctx, card.icon, panelX + 27, cy + cardH / 2, 34, false, selected ? 1 : .82)
        || this.drawSmallGlyph(ctx, card.icon, panelX + 27, cy + cardH / 2, "#1f5a3f", .8);
      this.text(ctx, card.title, panelX + 52, cy + 24, 13, "#1c3325", "700");
      this.text(ctx, card.value, panelX + 52, cy + 44, 11, selected ? "#1f7a52" : "#8b6f2a", "700");
      this.text(ctx, this.truncateTextToWidth(ctx, card.body, cardW - 70, 10, "400"), panelX + 52, cy + 64, 10, "#66715f", "400");
      if (selected) {
        this.roundRect(ctx, panelX + cardW - 34, cy + 13, 22, 22, 11, "#2e876e");
        this.text(ctx, "✓", panelX + cardW - 23, cy + 29, 12, "#fff", "700", "center");
      }
      this.addHit(panelX, cy, cardW, cardH, () => {
        if (!this.infoDetailModal || this.infoDetailModal.kind !== "recoveredChoice") return;
        this.infoDetailModal.selectedMode = card.id;
        this.render();
      });
    });
  }

  confirmRecoveredChoice() {
    const modal = this.infoDetailModal;
    if (!modal || modal.kind !== "recoveredChoice") return;
    const mode = modal.selectedMode || "immediate";
    const preferredId = modal.preferredId || "";
    this.infoDetailModal = null;
    const option = this.reserveActionOptions().find((item) => item.id === "salvage");
    if (!option) return;
    const labels = { shedAntlerA: "A级鹿角", shedAntlerB: "B级鹿角", naturalHide: "自然生命档案", researchSample: "研究样本", recoveredTrap: "陷阱证据" };
    const target = preferredId ? `只移交库存中的${labels[preferredId] || "样本"}` : "批量移交库存样本";
    const prefix = mode === "appraise" ? "设施鉴定" : mode === "case" ? "留作任务样本" : "立即移交";
    const selected = Object.assign({}, option, {
      label: prefix,
      placeholder: `例如：${prefix}：${target}`,
      effect: mode === "appraise" ? "次日获得 1.25× 项目拨款" : mode === "case" ? "推进案件与设施修复" : "当日获得项目拨款"
    });
    this.selectedReserveAction = "salvage";
    this.selectedPurchaseId = preferredId;
    this.command = selected.placeholder.replace("例如：", "");
    this.openPatrolTaskModal(selected);
  }
  drawMarketPanel(ctx, x, y, w, reserve) {
    // 今日项目拨款：3列需求卡。
    const market = reserve.market || {};
    const prices = [
      { id: "antler",         key: "marketAntler",  label: "鹿角研究热度", value: market.antler || 86, note: "项目拨款" },
      { id: "hideSalvage",    key: "marketHide", label: "生命档案热度", value: market.hideSalvage || 124, note: "自然记录" },
      { id: "researchSample", key: "marketResearch", label: "研究合同", value: market.researchSample || 42, note: "科研样本" }
    ];
    const h = 120;
    this.roundRect(ctx, x, y + 4, w, h, 12, "rgba(20,16,8,0.10)");
    this.roundRect(ctx, x, y, w, h, 12, "rgba(255,249,234,0.96)", "rgba(139,111,42,0.22)");
    this.drawSectionMarker(ctx, x + 18, y + 24, "#d8c27a");
    this.text(ctx, "今日项目拨款", x + 34, y + 29, 16, "#1c3325", "700");
    const cardW = (w - 44) / 3;
    prices.forEach((item, index) => {
      const cx = x + 16 + index * (cardW + 6);
      const cg = ctx.createLinearGradient(cx, y + 46, cx, y + 106);
      cg.addColorStop(0, "#fffaf0");
      cg.addColorStop(1, "#f0e6c4");
      this.roundRect(ctx, cx, y + 50, cardW, 54, 8, "rgba(32,25,12,0.08)");
      this.roundRect(ctx, cx, y + 48, cardW, 54, 8, cg, "rgba(139,111,42,0.18)");
      this.text(ctx, item.label, cx + 8, y + 66, 10, "#66715f", "700");
      const displayValue = this.displayReserveNumber(item.key, item.value);
      this.text(ctx, `${displayValue}`, cx + 8, y + 92, 22, "#1c3325", "700");
      this.text(ctx, item.note, cx + cardW - 8, y + 92, 10, "#755d25", "700", "right");
      this.drawChangeTag(ctx, cx + cardW - 5, y + 50, this.reserveDisplayDelta(item.key, item.value), "right", { key: item.key });
      this.addHit(cx, y + 48 - this.scrollY, cardW, 54, () => this.openMaterialDetail("market", item.id));
    });
  }
  openMysteryEvidenceDetail() {
    const reserve = (this.state.world || {}).reserve || {};
    const state = normalizeMysteryEvidence(reserve.mysteryEvidence);
    const discoveries = state.history.slice().reverse();
    const last = discoveries[0] || null;
    const count = mysteryEvidenceCount(reserve);
    const discoveredItems = discoveries.slice(0, 3).map((item) => ({
      tag: `第${item.day}日`,
      title: `${item.name} · ${item.rarity}`,
      body: `${item.story} 结果：专项拨款 +${item.fundReward}、声誉 +${item.reputationReward}、偷猎压力 -${item.poacherReduction}。`
    }));
    this.infoDetailModal = {
      kicker: "超等级 · 唯一档案",
      title: last ? `${last.name} · 已封存` : "未解封的神秘证物",
      icon: (last && last.icon) || "intel",
      items: discoveredItems.length ? discoveredItems.concat([
        { tag: "封存", title: `已发现 ${count}/${MYSTERY_RECOVERY_CATALOG.length}`, body: "唯一证物 · 永久封存" },
        { tag: "触发", title: last.trigger || "剧情与数据共同决定", body: "剧情阶段、偷猎压力、执法能力和巡护类型先决定是否进入抽取池，随后才进行低概率判定。" }
      ]).slice(0, 5) : [
        { tag: "未知", title: "物种表之外仍有暗线", body: "白犀牛角、象牙等跨区案件可能早于对应动物出现，因此被称为“超等级”证物。" },
        { tag: "剧情", title: "先推进阶段事件", body: "事件线越深入，能够接触到的跨区案件越复杂。" },
        { tag: "条件", title: "风险与巡护能力必须同时成立", body: "较高偷猎压力留下痕迹，猎犬能力和对应补给决定能否追回。" },
        { tag: "随机", title: "低概率 · 有保底", body: "不会重复" }
      ],
      footer: "奖励来自联合执法拨款。"
    };
    this.render();
  }
  openMaterialDetail(kind, id) {
    this.infoDetailModal = this.buildMaterialDetail(kind, id);
    this.render();
  }

  openMaterialExploration(targetId = "") {
    const reserve = (this.state.world || {}).reserve || {};
    const target = explorationGoodById(targetId);
    const preview = previewMaterialExploration(reserve, (this.state.world || {}).knownCharacters || [], (this.state.world || {}).lifeMemory || null);
    const helper = preview.relationship.helper;
    this.infoDetailModal = {
      kind: "materialExploration",
      phase: "ready",
      displayRoll: 1,
      targetId,
      target,
      preview,
      kicker: "动物引路 · 独立探索",
      title: `探索${target ? target.label : "自然遗留物"}`,
      icon: "eye",
      items: [
        { tag: "目标", title: target ? target.label : "随机线索", body: target ? `${target.story} 目标只提高寻找方向，不保证本次一定出现。` : "不指定目标时，会根据本次探索质量从可发现物中随机抽取。" },
        { tag: "等级", title: `Lv.${preview.level} · +${preview.levelContribution}`, body: "决定区域与品质上限" },
        { tag: "关系", title: `安全 ${preview.relationship.securityAverage} · 野性 ${preview.relationship.wildnessAverage} · +${preview.relationshipContribution}`, body: helper ? `${helper.name}（${helper.species}）带路` : "暂无动物带路" },
        { tag: "骰子", title: "六面骰 1—6点", body: "骰面 + 等级 + 关系 = 结果" }
      ],
      footer: `总点数达到 ${preview.requiredScore} 才有收集结果 · 当前需掷 ${preview.requiredRoll}+`,
      actionLabel: "掷骰探索",
      action: () => {
        this.rollMaterialExplorationDice(targetId);
      }
    };
    this.render();
  }

  rollMaterialExplorationDice(targetId = "") {
    const modal = this.infoDetailModal;
    if (!modal || modal.kind !== "materialExploration" || modal.phase === "rolling") return;
    this.playSfx("dice");
    const finalRoll = Math.floor(Math.random() * 6) + 1;
    const token = `${Date.now()}_${finalRoll}`;
    this.materialExplorationRollToken = token;
    modal.phase = "rolling";
    modal.actionLabel = "骰子滚动中";
    let frame = 0;
    const animate = () => {
      if (this.materialExplorationRollToken !== token || this.infoDetailModal !== modal) return;
      frame += 1;
      modal.displayRoll = frame >= 8 ? finalRoll : ((finalRoll + frame * 2) % 6) + 1;
      this.render();
      if (frame < 8) {
        setTimeout(animate, 65);
        return;
      }
      modal.phase = "resolved";
      modal.actionLabel = `掷出 ${finalRoll} 点`;
      this.render();
      setTimeout(() => {
        if (this.materialExplorationRollToken !== token || this.infoDetailModal !== modal) return;
        this.materialExplorationRollToken = null;
        this.executeMaterialExploration(targetId, finalRoll);
      }, 260);
    };
    animate();
  }

  executeMaterialExploration(targetId = "", diceRoll = null) {
    if (!this.state.character) {
      this.toast("先成为卫士");
      return;
    }
    const reserve = (this.state.world || {}).reserve || {};
    const safeRoll = diceRoll === null ? Math.floor(Math.random() * 6) + 1 : Math.max(1, Math.min(6, Math.round(diceRoll)));
    const command = `跟随动物探索森林，寻找自然遗留。目标:${targetId || "random"} 掷骰:${safeRoll}`;
    this.infoDetailModal = null;
    this.patrolTaskModal = null;
    this.patrolOperationPlan = null;
    this.selectedReserveAction = "exploreMaterials";
    this.recordActivePlay(Date.now(), true);
    const beforeWorldForEcho = this.state.world || {};
    const beforeReserve = this.reserveSnapshot(reserve);
    const result = simulateDay(command, this.state);
    const lifeUpdate = advanceLifeMemory(beforeWorldForEcho, result.world || {}, { command, actionId: "exploreMaterials" });
    result.world.lifeMemory = lifeUpdate.state;
    const echoVisual = Object.assign({}, result.visual || {}, { relationshipChange: lifeUpdate.relationshipChange });
    const guardianEcho = this.buildGuardianEcho(beforeWorldForEcho, result.world || {}, command, echoVisual);
    result.world.guardianEchoes = ((beforeWorldForEcho.guardianEchoes || []).concat(guardianEcho)).slice(-12);
    result.visual = Object.assign({}, result.visual || {}, { guardianEcho, relationshipChange: lifeUpdate.relationshipChange, emotionEvent: lifeUpdate.primaryEvent, emotionEvents: lifeUpdate.events });
    (result.reports || []).forEach((report) => {
      report.visual = Object.assign({}, report.visual || {}, { guardianEcho, relationshipChange: lifeUpdate.relationshipChange, emotionEvent: lifeUpdate.primaryEvent, emotionEvents: lifeUpdate.events });
    });
    const nextState = Object.assign({}, this.state, {
      world: result.world,
      character: result.character,
      reports: this.state.reports.concat(result.reports).slice(-12),
      lastCommand: command
    });
    const collectionUpdate = updateCollectionAfterAction(this.state, nextState, { actionId: "exploreMaterials", actionLabel: "动物引路探索" });
    this.state = collectionUpdate.state;
    const ordinaryUpdate = recordOrdinaryMoment(this.state, { actionId: "exploreMaterials", actionLabel: "动物引路探索" });
    result.visual = Object.assign({}, result.visual || {}, {
      collectionLead: collectionUpdate.lead,
      collectionChargeGained: collectionUpdate.chargeGained,
      storyDiscovery: collectionUpdate.discovery,
      storyDiscoveryItem: collectionUpdate.discoveryItem,
      storyDiscoveryAdvanced: !!collectionUpdate.discoveryAdvanced,
      ordinaryMoment: ordinaryUpdate.moment
    });
    this.reconcileDerivedGoalProgress(beforeWorldForEcho, result, "exploreMaterials");
    result.world = this.state.world;
    saveState(this.state);
    const afterReserve = this.reserveSnapshot((result.world || {}).reserve || {});
    this.materialChangeNotice = this.buildMaterialChangeNotice(beforeReserve, afterReserve);
    const patrolReplay = this.setMapPatrolReplay("exploreMaterials");
    this.setMapConsequencePulse(beforeReserve, afterReserve, {
      title: (result.visual && result.visual.materialExploration && result.visual.materialExploration.reward && result.visual.materialExploration.reward.label) || "动物引路探索",
      reason: (result.visual && result.visual.materialExploration && result.visual.materialExploration.summary) || "探索路线已经改变",
      tone: "explore",
      relationshipChange: lifeUpdate.relationshipChange,
      animalEconomy: result.visual && result.visual.animalEconomy,
      customValueText: (result.visual && result.visual.materialExploration && result.visual.materialExploration.reward)
        ? `${result.visual.materialExploration.reward.label} ×${result.visual.materialExploration.reward.amount} · 待收取`
        : "本次未发现物件 · 调查记录已保存",
      animalQuote: guardianEcho && `${guardianEcho.actorName}：${guardianEcho.quote}`,
      delayMs: patrolReplay ? 1200 : 0
    });
    this.settlementModal = this.buildPatrolSettlement(beforeReserve, afterReserve, result, command);
    this.settlementModal.storyReplay = !!patrolReplay;
    this.configureSettlementReveal(this.settlementModal, "role");
    this.playSettlementSfx(this.settlementModal);
    this.command = "";
    this.selectedPurchaseId = "";
    this.selectedPurchaseQuantity = 1;
    this.scrollY = 0;
    this.pendingTaskOriginScreen = null;
    this.setScreen("home");
  }

  buildMaterialDetail(kind, id) {
    const reserve = this.state.world.reserve || {};
    const supplies = reserve.supplies || {};
    const inventory = reserve.inventory || {};
    const market = reserve.market || {};
    const patrolDays = Math.max(0, Math.min(9, Math.floor((supplies.dogFood || 0) / 1) + Math.floor((supplies.alarm || 0) / 2)));
    const lowItems = [
      (supplies.dogFood || 0) < 3 ? "狗粮" : "",
      (supplies.tranquilizer || 0) < 2 ? "麻醉弹" : "",
      (supplies.alarm || 0) < 1 ? "警报器" : "",
      (supplies.fieldKit || 0) < 1 ? "野外工具包" : "",
      (supplies.medicalKit || 0) < 1 ? "医疗包" : ""
    ].filter(Boolean);
    const makeAction = (label, actionId, purchaseId = null) => ({
      actionLabel: label,
      action: () => {
        this.infoDetailModal = null;
        if (actionId === "openPatrol") {
          this.openPatrolOperationScreen(purchaseId || null);
          return;
        }
        if (actionId === "exploreMaterials") {
          this.openMaterialExploration(purchaseId || "");
          return;
        }
        this.useMaterialAction(actionId, purchaseId);
      }
    });
    const supplyConfigs = {
      dogFood: { title: "狗粮", value: supplies.dogFood || 0, risk: "低于 3 时，连续侦察会很快断档。" },
      tranquilizer: { title: "麻醉弹", value: supplies.tranquilizer || 0, risk: "转移或控制个体" },
      alarm: { title: "警报器", value: supplies.alarm || 0, risk: "为 0 时，边界偷猎风险很难快速压下去。" },
      fieldKit: { title: "野外工具包", value: supplies.fieldKit || 0, risk: "用于水源和草场修复" },
      medicalKit: { title: "医疗包", value: supplies.medicalKit || 0, risk: "用于受伤或患病动物的救助护理" }
    };
    const pendingRecovered = reserve.pendingRecovered || {};
    const goodsConfigs = {
      shedAntlerA: { title: "A级鹿角", value: inventory.shedAntlerA || 0, pending: pendingRecovered.shedAntlerA || 0, price: Math.max(130, Math.round((market.antler || 86) * 1.45)), source: "自然脱落，高等级研究样本", note: "稀少且研究需求较高，基金紧张时可优先移交。" },
      shedAntlerB: { title: "B级鹿角", value: inventory.shedAntlerB || 0, pending: pendingRecovered.shedAntlerB || 0, price: Math.max(95, market.antler || 86), source: "常规自然脱落", note: "可稳定获得研究补助，不会直接伤害动物。" },
      naturalHide: { title: "自然生命档案", value: inventory.naturalHide || 0, pending: pendingRecovered.naturalHide || 0, price: Math.max(145, market.hideSalvage || 124), source: "自然死亡个体的生命记录", note: "仅来自自然死亡后的合规记录，不能主动伤害动物获取。" },
      researchSample: { title: "研究样本", value: inventory.researchSample || 0, pending: pendingRecovered.researchSample || 0, price: Math.max(60, market.researchSample || 42), source: "巡护、救助或研究合同", note: "单价不高，但能支撑自然知识和生态报告。" },
      recoveredTrap: { title: "陷阱证据", value: inventory.recoveredTrap || 0, pending: pendingRecovered.recoveredTrap || 0, price: 85, source: "驱赶偷猎时追回", note: "移交执法部门可获得联合执法拨款，也能解释偷猎压力为何下降。" }
    };
    const goodsBaseTotal = Object.keys(goodsConfigs).reduce((sum, key) => sum + goodsConfigs[key].value * goodsConfigs[key].price, 0);
    const salvageEstimate = this.salvageEconomyPreview(reserve, goodsBaseTotal);
    const marketConfigs = {
      antler: { title: "鹿角研究热度", value: market.antler || 86, body: "影响 A/B 级自然脱落鹿角的项目拨款。研究热度高时移交更合适。" },
      hideSalvage: { title: "生命档案热度", value: market.hideSalvage || 124, body: "只对应自然死亡生命档案。热度越高，这类记录的研究价值越高。" },
      researchSample: { title: "研究项目", value: market.researchSample || 42, body: "科研样本的项目拨款基准，也会支撑自然知识研究。" }
    };
    if (kind === "supply" && supplyConfigs[id]) {
      const purchase = supplyPurchaseById(id) || this.currentSupplyPurchase(reserve);
      const item = Object.assign({}, supplyConfigs[id], {
        target: purchase.target,
        use: purchase.use,
        actionId: "buySupplies",
        actionLabel: `采购${purchase.itemLabel}`,
        purchase
      });
      const low = item.value < item.target;
      return Object.assign({
        kicker: "巡护补给",
        title: `${item.title} ×${item.value}`,
        icon: id === "alarm" ? "signal" : id === "tranquilizer" ? "tranquilizer" : id === "fieldKit" ? "habitat" : id === "medicalKit" ? "fieldKit" : "dogFood",
        layout: "materialSupply",
        footer: "库存决定可执行的巡护。",
        items: [
          { tag: "用途", title: item.use, body: item.risk },
          { tag: "库存", title: low ? `低于安全线 ${item.target}` : "库存充足", body: `当前 ${item.value} / 安全线 ${item.target}` },
          { tag: "影响", title: this.materialImpactLabel(id), body: this.materialImpactBody(id, reserve) },
          { tag: "执行后", title: `${purchase.itemLabel} +${purchase.amount} / 基金 -${purchase.cost}`, body: "仅此项变化" },
          { tag: "建议", title: item.actionLabel, body: low ? "建议先补齐" : "巡护页使用" }
        ]
      }, makeAction(item.actionLabel, item.actionId, purchase.id));
    }
    if (kind === "goods" && goodsConfigs[id]) {
      const item = goodsConfigs[id];
      const actionLabel = item.pending > 0 ? "收取入库" : item.value > 0 ? (id === "recoveredTrap" ? "移交执法部门" : "移交守护样本") : "去探索";
      const actionId = item.pending > 0 ? "collectGoods" : item.value > 0 ? "salvage" : "exploreMaterials";
      return Object.assign({
        kicker: "守护样本",
        title: `${item.title} · 待收${item.pending} / 库存${item.value}`,
        icon: id === "recoveredTrap" ? "signal" : id === "researchSample" ? "eye" : id === "naturalHide" ? "trail" : "salvage",
        footer: "探索 → 收取 → 移交",
        items: [
          { tag: "状态", title: item.pending > 0 ? `待收取 ${item.pending}` : item.value > 0 ? `已入库 ${item.value}` : "未发现", body: item.pending > 0 ? "先点收取，进入库存后才能移交。" : item.value > 0 ? "已入库的合规样本可移交科研或执法机构。" : `${item.source}。${item.note}` },
          { tag: "探索", title: "保护区等级 / 动物关系 / 随机性", body: this.recoveredGoodsCollectionBody(reserve) },
          { tag: "移交", title: `项目拨款 ${item.price} · 当前可移交 ${salvageEstimate.value}`, body: item.value > 0 ? `移交会消耗库存并获得研究补助或联合执法拨款，受研究热度 ${salvageEstimate.marketIndex} 影响。` : item.pending > 0 ? "这批还没入库，先收取再移交。" : "当前没有库存，直接开始探索；动物关系越好，越愿意带你接近真实遗留点。" },
          { tag: "倍率", title: `自家Lv.${salvageEstimate.level} × 邻区均分${salvageEstimate.neighborAvg}`, body: `等级×${salvageEstimate.levelFactor.toFixed(2)} · 邻区×${salvageEstimate.neighborFactor.toFixed(2)}${salvageEstimate.liquidityFactor > 1 ? ` · 恢复×${salvageEstimate.liquidityFactor.toFixed(2)}` : ""}` },
          { tag: "操作", title: actionLabel, body: item.pending > 0 ? "先收取，再移交" : item.value > 0 ? "移交后获得专项拨款" : "前往探索" }
        ]
      }, makeAction(actionLabel, actionId, id));
    }
    if (kind === "market" && marketConfigs[id]) {
      const item = marketConfigs[id];
      return Object.assign({
        kicker: "今日项目拨款",
        title: `${item.title} ${item.value}`,
        icon: id === "researchSample" ? "eye" : "berry",
        footer: "项目需求每日变化。",
        items: [
          { tag: "需求", title: `${item.title} ${item.value}`, body: item.body },
          { tag: "拨款", title: `拨款系数 ${salvageEstimate.marketIndex}`, body: `最终项目拨款还会乘以自家等级×${salvageEstimate.levelFactor.toFixed(2)}、联区协作×${salvageEstimate.neighborFactor.toFixed(2)}${salvageEstimate.liquidityFactor > 1 ? `和逆风恢复×${salvageEstimate.liquidityFactor.toFixed(2)}` : ""}。` },
          { tag: "策略", title: item.value >= 90 ? "需求偏高" : "需求普通", body: item.value >= 90 ? "可以考虑移交库存样本。" : "如果不急缺基金，可以先改善水源或草场。" },
          { tag: "风险", title: "移交会消耗库存", body: "先保证安全与迁徙" },
          { tag: "操作", title: "库存移交 / 空仓探索", body: "" }
        ]
      }, makeAction("移交守护样本", "salvage"));
    }
    if (kind === "fund") {
      return Object.assign({
        kicker: "仓库总览",
        title: `保护基金 ${reserve.fund || 0}`,
        icon: "fund",
        footer: "用于巡护、补给与建设。",
        items: [
          { tag: "当前", title: `${reserve.fund || 0} 基金`, body: lowItems.length ? `当前有 ${lowItems.join("、")} 短缺，基金需要优先补给。` : "补给稳定，可以把基金投入防护网或栖息地修复。" },
          { tag: "来源", title: "回收物移交", body: "收取自然遗留、研究样本和陷阱证据，入库后移交获得保护基金。" },
          { tag: "水源", title: `${(reserve.ecology || {}).water || 0}/100`, body: "水源影响动物饮水、健康、疾病和迁徙。" },
          { tag: "草场", title: `${(reserve.ecology || {}).grass || 0}/100`, body: "草场产能影响动物承载量、健康和迁入迁出。" },
          { tag: "操作", title: lowItems.length ? "先采购补给" : "按风险投入", body: lowItems.length ? "补齐后再做高风险巡护" : "优先修复最低指标" }
        ]
      }, makeAction(lowItems.length ? "一键补齐" : "移交守护样本", lowItems.length ? "buySupplies" : "salvage", lowItems.length ? "all" : null));
    }
    if (kind === "patrolDays") {
      return Object.assign({
        kicker: "仓库总览",
        title: `可持续巡护 ${patrolDays} 天`,
        icon: "signal",
        footer: "按狗粮和警报器估算。",
        items: [
          { tag: "算法", title: `狗粮 ${supplies.dogFood || 0} / 警报器 ${supplies.alarm || 0}`, body: "狗粮支撑猎犬侦察，警报器支撑边界驱赶；任何一项太低，巡护就会变窄。" },
          { tag: "状态", title: patrolDays < 3 ? "续航偏低" : "续航充足", body: `约 ${patrolDays} 天` },
          { tag: "影响", title: patrolDays < 3 ? "高风险任务受限" : "任务选择完整", body: "" },
          { tag: "操作", title: patrolDays < 3 ? "采购补给" : "执行推荐巡护", body: patrolDays < 3 ? "优先狗粮和警报器" : "处理今日威胁" }
        ]
      }, makeAction(patrolDays < 3 ? "一键补齐" : "去巡护", patrolDays < 3 ? "buySupplies" : "openPatrol", patrolDays < 3 ? "all" : this.recommendedPatrolAction(reserve)));
    }
    return Object.assign({
      kicker: "仓库总览",
      title: lowItems.length ? `${lowItems.length} 项短缺` : "补给稳定",
      icon: "eye",
      footer: "补给决定可执行的巡护。",
      items: [
        { tag: "基金", title: `${reserve.fund || 0}`, body: "采购 · 修复 · 建设" },
        { tag: "生态", title: `水源 ${(reserve.ecology || {}).water || 0} · 草场 ${(reserve.ecology || {}).grass || 0}`, body: "巡护和修复会改变水草，再影响动物。" },
        { tag: "续航", title: `${patrolDays} 天`, body: patrolDays < 3 ? "需要补给" : "库存充足" },
        { tag: "短缺", title: lowItems.length ? lowItems.join("、") : "无", body: lowItems.length ? "会限制巡护" : "可移交库存样本或修复栖息地" }
      ]
    }, makeAction(lowItems.length ? "一键补齐" : "移交守护样本", lowItems.length ? "buySupplies" : "salvage", lowItems.length ? "all" : null));
  }

  materialImpactLabel(id) {
    const map = {
      dogFood: "猎犬出动次数",
      tranquilizer: "许可内生态干预",
      alarm: "边界防偷猎",
      fieldKit: "栖息地修复能力",
      medicalKit: "动物救助能力"
    };
    return map[id] || "保护区行动";
  }

  materialImpactBody(id, reserve) {
    const poacher = reserve.poacherPressure || 0;
    const ecology = reserve.ecology || {};
    const map = {
      dogFood: "狗粮越稳，猎犬越能持续侦察脚印、气味和异常迁移。",
      tranquilizer: `草场 ${ecology.grass || 0}，食草动物过密或靠近水源时，麻醉弹能支持转移个体。`,
      alarm: poacher > 45 ? "当前偷猎压力偏高，警报器能快速封住边界入口。" : "偷猎压力不高时，警报器更像保险，防止突然爆点。",
      fieldKit: "野外工具包只用于修复水源与草场，不再和医疗库存混用。",
      medicalKit: "医疗包只用于救助受伤或患病动物。"
    };
    return map[id] || "影响下一次巡护。";
  }

  useMaterialAction(actionId, purchaseId = null, purchaseAmount = null) {
    if (actionId === "collectGoods") {
      this.collectRecoveredGood(purchaseId);
      return;
    }
    const option = this.reserveActionOptions().find((item) => item.id === actionId);
    if (!option) return;
    const selected = Object.assign({}, option);
    if (actionId === "buySupplies") {
      const reserve = (this.state.world || {}).reserve || {};
      const purchase = purchaseId === "all"
        ? supplyReplenishmentPlan(reserve)
        : (supplyPurchaseForQuantity(purchaseId, purchaseAmount || this.selectedPurchaseQuantity || 1, reserve) || this.currentSupplyPurchase(reserve));
      if (!purchase || purchase.amount <= 0) {
        this.toast("补给已达到安全线");
        return;
      }
      selected.purchaseId = purchase.id;
      selected.purchaseAmount = purchase.amount;
      selected.placeholder = `例如：${purchase.command}`;
      selected.label = purchase.batch ? "一键补齐全部短缺" : `采购${purchase.itemLabel} ×${purchase.amount}`;
      selected.icon = purchase.icon || selected.icon;
      this.selectedPurchaseId = purchase.id;
      this.selectedPurchaseQuantity = purchase.amount;
    } else if (actionId === "salvage" && purchaseId) {
      const labels = { shedAntlerA: "A级鹿角", shedAntlerB: "B级鹿角", naturalHide: "自然生命档案", researchSample: "研究样本", recoveredTrap: "陷阱证据" };
      selected.placeholder = `例如：只移交库存中的${labels[purchaseId] || "样本"}`;
      selected.label = purchaseId === "recoveredTrap" ? "移交执法部门" : `移交${labels[purchaseId] || "样本"}`;
      this.selectedPurchaseId = purchaseId;
    } else {
      this.selectedPurchaseId = "";
      this.selectedPurchaseQuantity = 1;
    }
    this.selectedReserveAction = actionId;
    this.command = selected.placeholder.replace("例如：", "");
    this.openPatrolTaskModal(selected);
  }

  openPatrolOperationScreen(preferredActionId = null) {
    const reserve = (this.state.world || {}).reserve || {};
    const actionId = this.coercePatrolTaskAction(preferredActionId || this.recommendedPatrolAction(reserve));
    const option = this.reserveActionOptions().find((item) => item.id === actionId) || this.selectedReserveActionOption();
    this.infoDetailModal = null;
    this.patrolTaskModal = null;
    this.patrolOperationPlan = null;
    this.selectedReserveAction = option.id;
    this.selectedPurchaseId = "";
    this.selectedPurchaseQuantity = 1;
    this.command = option.placeholder.replace("例如：", "");
    this.setScreen("action");
  }

  closePatrolOperationScreen() {
    const allowed = ["home", "role", "animalworld", "league"];
    const target = allowed.includes(this.actionScreenOrigin) ? this.actionScreenOrigin : "home";
    this.patrolTaskModal = null;
    this.patrolOperationPlan = null;
    this.infoDetailModal = null;
    this.command = "";
    this.selectedPurchaseId = "";
    this.selectedPurchaseQuantity = 1;
    this.scrollY = 0;
    this.setScreen(target);
  }

  collectRecoveredGood(id) {
    const reserve = (this.state.world || {}).reserve || {};
    const pending = reserve.pendingRecovered || {};
    const amount = pending[id] || 0;
    if (amount <= 0) {
      this.toast("暂无可收取");
      return;
    }
    reserve.inventory = reserve.inventory || {};
    reserve.pendingRecovered = pending;
    const inventoryTotal = Object.values(reserve.inventory).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    const accepted = Math.max(0, Math.min(amount, BALANCE_V2.caps.inventory - inventoryTotal));
    if (!accepted) {
      this.toast("库存已满 10/10，请先移交守护样本");
      return;
    }
    reserve.inventory[id] = (reserve.inventory[id] || 0) + accepted;
    reserve.pendingRecovered[id] = amount - accepted;
    const labels = { shedAntlerA: "A级鹿角", shedAntlerB: "B级鹿角", naturalHide: "自然生命档案", researchSample: "研究样本", recoveredTrap: "陷阱证据" };
    const label = labels[id] || "回收物";
    this.materialChangeNotice = { inventory: { [id]: accepted }, summary: `${label} +${accepted}，库存 ${reserve.inventory[id]}` };
    saveState(this.state);
    this.toast(`${label} +${accepted} · 库存${inventoryTotal + accepted}/10${accepted < amount ? " · 余下仍待收取" : ""}`);
    this.render();
  }

  drawReserveOverview(ctx, x, y, w, h, options = {}) {
    const reserve = this.state.world.reserve || {};
    if (options.immersive) {
      this.drawAnimalConversationSand(ctx, x, y, w, h);
      return;
    }
    this.roundRect(ctx, x, y + 8, w, h, 22, "rgba(18,61,52,.28)");
    const frame = ctx.createLinearGradient(x, y, x + w, y + h);
    frame.addColorStop(0, UI_THEME.forest700);
    frame.addColorStop(0.52, UI_THEME.forest800);
    frame.addColorStop(1, UI_THEME.forest900);
    this.roundRect(ctx, x, y, w, h, 22, frame, "rgba(232,224,201,.34)");
    this.roundRect(ctx, x + 8, y + 8, w - 16, h - 16, 17, "#174b3d", "rgba(255,255,255,.18)");

    this.drawReserveValueHeader(ctx, x + 14, y + 16, w - 28, reserve);

    this.drawAnimalConversationSand(ctx, x + 10, y + 58, w - 20, h - 70);
  }

  drawReserveValueHeader(ctx, x, y, w, reserve) {
    const prosperity = this.reserveProsperitySummary(reserve, this.state.world || {});
    const gap = 8;
    const cardW = (w - gap) / 2;
    const displayLevel = this.displayReserveNumber("reserveLevel", prosperity.level || 1);
    const displaySpecies = this.displayReserveNumber("speciesCount", prosperity.speciesCount || 0);
    const displayAnimals = this.displayReserveNumber("animalTotal", prosperity.animalTotal || 0);
    this.drawReserveValueCard(ctx, x, y, cardW, "保护区等级", `Lv.${displayLevel}`, prosperity.title, "reserve_level", "#fff27e", () => this.openChapterProgressDetail());
    this.drawReserveValueCard(ctx, x + cardW + gap, y, cardW, "保护区市值", `${this.displayReserveNumber("valuation", prosperity.value || 0)}`, `${displaySpecies}种 · ${displayAnimals}只`, "fund", "#fff27e", () => this.openReserveProsperityDetail());
  }

  drawReserveValueCard(ctx, x, y, w, label, value, subText, icon, color, onTap) {
    this.roundRect(ctx, x, y + 2, w, 36, 12, "rgba(8,34,28,.20)");
    this.roundRect(ctx, x, y, w, 36, 12, "rgba(255,255,255,.11)", "rgba(255,214,90,.48)");
    this.drawUiIcon(ctx, icon, x + 16, y + 18, 18, false, 0.9)
      || this.drawSmallGlyph(ctx, icon, x + 16, y + 18, color, 0.62);
    this.text(ctx, label, x + 32, y + 14, 9, "#d9dfce", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, value, w - 72, 16, "700"), x + 32, y + 31, 16, color, "700");
    this.text(ctx, this.truncateTextToWidth(ctx, subText || "", 58, 9, "700"), x + w - 18, y + 30, 9, "#f0d376", "700", "right");
    this.text(ctx, "›", x + w - 8, y + 26, 16, "#f0d376", "700", "right");
    this.addHit(x, y - this.scrollY, w, 36, onTap);
  }

  drawAnimalConversationSand(ctx, x, y, w, h, options = {}) {
    const world = this.state.world || {};
    const animals = this.visibleSandAnimals(world);
    const prologue = !!options.prologue;
    const active = prologue ? null : (animals.find((animal) => animal.id === this.speakingAnimalId) || animals[0]);
    const mapX = x + 3;
    const mapY = y + 3;
    const mapW = w - 6;
    const mapH = h - 6;
    const camera = this.mapCameraInfo(mapX, mapY, mapW, mapH);
    const fast = this.isFastMapRender();
    this.mapViewport = { x: mapX, y: mapY - this.scrollY, w: mapW, h: mapH };
    this.mapCameraFrame = camera;
    this.roundRect(ctx, x - 2, y + 6, w + 4, h, 15, "rgba(4,12,8,.36)");
    const frame = ctx.createLinearGradient(x, y, x + w, y + h);
    frame.addColorStop(0, "#213e2c");
    frame.addColorStop(.5, "#987a37");
    frame.addColorStop(1, "#183724");
    this.roundRect(ctx, x, y, w, h, 15, frame, "rgba(242,218,142,.55)");
    this.roundRect(ctx, x + 3, y + 3, w - 6, h - 6, 12, "#0d1b14", "rgba(255,248,223,.20)");
    this.drawMapStage(ctx, camera);

    ctx.save();
    ctx.beginPath();
    ctx.rect(mapX, mapY, mapW, mapH);
    ctx.clip();
    this.drawSimpleReserveMapBackdrop(ctx, camera, fast);
    this.drawSeasonMapDynamics(ctx, camera, fast);
    this.drawMapAmbientDynamics(ctx, camera, fast);
    this.drawMapPatrolReplay(ctx, camera);
    const mapMarkers = (this.reserveViewForDisplay().mapMarkers || []).slice(0, 4);
    const ecologyEconomy = normalizeEcologyEconomy(((world.reserve || {}).ecologyEconomy), world.reserve || {});
    const consequenceVisible = !!(this.mapConsequencePulse && Date.now() < this.mapConsequencePulse.expiresAt);
    const feedbackCycle = this.mapFeedbackCycle(mapMarkers, ecologyEconomy.mapDrops, this.animT());
    const dialogueVisible = !consequenceVisible && feedbackCycle.phase === "dialogue";
    this.renderedMapFeedbackCycle = feedbackCycle;
    this.renderedMapGroundMarkers = [];
    this.renderedMapResourceFlows = [];
    this.renderedRangerActors = [];
    this.renderedMapSpeechBubbles = [];
    this.renderedMapSpeechSuppressed = consequenceVisible || !dialogueVisible;
    const ordinaryMoment = latestOrdinaryMoment(this.state);
    const dialogueSlot = feedbackCycle.dialogueSlot;
    const animalGroupCounts = this.mapAnimalVisualGroupCounts(animals, world.reserve || {});
    this.renderedAnimalGroups = [];
    const placements = animals.map((animal, index) => {
      const habitat = this.animalMapLayoutPosition(animal, index, animals);
      const motion = this.movingAnimalPosition(animal, index, habitat, { fast });
      const point = this.mapPoint(motion.x, motion.y, camera);
      const ownsMoment = ordinaryMoment && !ordinaryMoment.facilityId && !animal.isMapSighting
        && (ordinaryMoment.animalId === animal.id || ordinaryMoment.species === animal.species);
      const dialogue = this.previewAnimalDialogueContext(animal, dialogueSlot + index);
      if (ownsMoment) dialogue.ordinaryMoment = ordinaryMoment;
      return {
        animal,
        index,
        motion,
        sx: point.x,
        sy: point.y,
        dialogue,
        ownsMoment,
        eventHighlight: !animal.isMapSighting && this.isAnimalEventHighlight(animal, world),
        mapPriority: this.mapAnimalPriority(animal, world, null),
        groupCount: animalGroupCounts[animal.id] || 1,
        showBubble: false
      };
    });
    // Motion paths may cross even when habitat anchors are different. Resolve
    // body overlap after every animal has advanced, then rebuild the screen
    // coordinates and depth order from the separated world positions.
    this.resolveAnimalMotionOverlaps(placements, camera);
    // Facilities are persistent landmarks, so an animal must never walk
    // through their body or name plate. Keep the moving group outside that
    // footprint before converting back to screen coordinates.
    this.resolveAnimalFacilityOverlaps(
      placements,
      camera,
      facilityStates(this.state).filter((facility) => !facility.concealed)
    );
    placements.forEach((placement) => {
      const point = this.mapPoint(placement.motion.x, placement.motion.y, camera);
      placement.sx = point.x;
      placement.sy = point.y;
    });
    placements.sort((a, b) => a.sy - b.sy);
    this.renderedAnimalOverlapCount = this.animalPlacementOverlapCount(placements, camera);
    this.pruneAnimalMotionStates(placements.map((placement) => placement.motion.key));

    const markerPlacements = mapMarkers.map((marker, index) => {
      const region = this.findRegion(marker.regionId);
      if (!region) return null;
      const point = this.mapPoint(region.x, region.y, camera);
      const px = point.x + ((index % 2) ? -18 : 18) * camera.scale;
      const py = point.y - (24 + index * 6) * camera.scale;
      return { marker, index, px, py, clearOfHud: prologue || py >= camera.y + 126 };
    }).filter(Boolean);
    const speechCandidates = [];
    if (dialogueVisible && !prologue && !fast) {
      placements.forEach((placement) => {
        if (placement.sy < camera.y + 132) return;
        const priority = placement.ownsMoment ? 430 : placement.eventHighlight ? 390 : placement.mapPriority >= 300 ? 300 : /^npc_/.test(placement.animal.id || "") ? 220 : 100;
        speechCandidates.push({ key: `animal:${placement.animal.id}`, kind: "animal", id: placement.animal.id, priority });
      });
      markerPlacements.forEach((placement) => {
        const marker = placement.marker;
        if (!placement.clearOfHud || marker.presentation === "resource-flow" || !marker.dialogue) return;
        speechCandidates.push({ key: `marker:${marker.id || placement.index}`, kind: "marker", id: marker.id || placement.index, priority: marker.kind === "exclamation" || marker.type === "event" ? 380 : 140 });
      });
      if (ordinaryMoment && ordinaryMoment.facilityId) {
        const facility = facilityStates(this.state).find((entry) => entry.id === ordinaryMoment.facilityId && !entry.concealed);
        if (facility) {
          const point = this.mapPoint(facility.x, facility.y, camera);
          if (point.y >= camera.y + 132) speechCandidates.push({ key: `facility:${facility.id}`, kind: "facility", id: facility.id, priority: 430 });
        }
      }
    }
    const speechCandidate = dialogueVisible ? this.selectMapSpeechCandidate(speechCandidates, feedbackCycle) : null;
    this.renderedMapSpeechCandidate = speechCandidate;

    this.drawReserveFacilities(ctx, camera, fast, { showDialogue: dialogueVisible, speechCandidate });
    const storyDiscovery = storyDiscoverySummary(this.state).active;
    if (storyDiscovery && storyDiscovery.status === "located") {
      this.drawStoryDiscoveryMarker(ctx, camera, storyDiscovery, fast);
    } else this.renderedStoryDiscoveryMarker = null;
    this.drawGuardianPromiseMarkers(ctx, camera, fast);
    this.drawAnimalEcologyDrops(ctx, camera, fast, prologue, !consequenceVisible && feedbackCycle.phase === "production");
    if (!fast) {
      markerPlacements.forEach((placement) => {
        const marker = placement.marker;
        const resourceFlow = marker.presentation === "resource-flow";
        const resourceVisible = !resourceFlow || (!consequenceVisible && this.mapResourceFlowPhase(marker) === feedbackCycle.phase);
        if (placement.clearOfHud) {
          if (resourceFlow) {
            if (resourceVisible) this.drawMapResourceFlow(ctx, marker, placement.px, placement.py, camera.scale * 0.9);
          } else {
            const markerLayout = this.drawGroundMapMarker(ctx, marker, placement.px, placement.py, camera.scale * 0.9);
            placement.hitRect = markerLayout && markerLayout.hitRect;
          }
          const rangerSpeaker = /^巡护员[：:]/.test(marker.dialogue || "");
          const speakerX = rangerSpeaker ? placement.px - 18 * camera.scale : placement.px;
          const ownsSpeech = speechCandidate && speechCandidate.key === `marker:${marker.id || placement.index}`;
          if (!resourceFlow && rangerSpeaker && ownsSpeech) this.drawRangerMapCharacter(ctx, speakerX, placement.py + 2 * camera.scale, camera.scale * .78);
          if (!resourceFlow && ownsSpeech && marker.dialogue) {
            this.drawMapMarkerDialogueBubble(ctx, marker, speakerX, placement.py, camera, placement.index);
            this.renderedMapSpeechBubbles.push({ key: speechCandidate.key, kind: "marker" });
          }
        }
        if (!prologue && resourceVisible) {
          if (placement.hitRect) {
            this.addMapRectHit(placement.hitRect.x, placement.hitRect.y, placement.hitRect.w, placement.hitRect.h, () => this.openMapMarkerDetail(marker));
          } else {
            this.addMapHit(placement.px, placement.py, Math.max(34, 44 * camera.scale), () => this.openMapMarkerDetail(marker));
          }
        }
      });
    }

    placements.forEach((placement) => {
      const animal = placement.animal;
      const sx = placement.sx;
      const motion = placement.motion || {};
      const groundY = placement.sy;
      const selected = active && active.id === animal.id;
      const closeView = this.isSandCloseView();
      placement.showBubble = !!(speechCandidate && speechCandidate.key === `animal:${animal.id}`);
      const metrics = this.drawGroundedAnimal(ctx, sx, groundY, animal, motion, selected, closeView, camera, fast, placement.dialogue, placement.showBubble, placement.groupCount);
      this.renderedAnimalGroups.push({ id: animal.id, species: animal.species, count: placement.groupCount });
      if (placement.showBubble) this.renderedMapSpeechBubbles.push({ key: speechCandidate.key, kind: "animal" });
      if (!prologue) this.addMapHit(sx, metrics.hitY, metrics.hitSize, () => this.openAnimalThought(animal));
    });
    // 行动结果是本次操作的最高优先级信息，必须最后绘制；设施、事件点、
    // 动物与对白都不能再覆盖它。
    this.drawWeeklyGuardianCelebration(ctx, camera, animals, consequenceVisible);
    this.drawMapConsequencePulse(ctx, camera);
    ctx.restore();
  }

  mapFeedbackCycle(markers = [], drops = [], now = this.animT()) {
    const resourceMarkers = (markers || []).filter((marker) => marker && marker.presentation === "resource-flow");
    const hasConsumption = resourceMarkers.some((marker) => this.mapResourceFlowPhase(marker) === "consumption");
    const hasProduction = (drops || []).length > 0 || resourceMarkers.some((marker) => this.mapResourceFlowPhase(marker) === "production");
    const segments = [];
    if (hasConsumption) segments.push({ phase: "consumption", duration: 3000 });
    segments.push({ phase: "dialogue", duration: 4800 });
    if (hasProduction) segments.push({ phase: "production", duration: 3000 });
    segments.push({ phase: "rest", duration: 1800 });
    const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);
    const safeNow = Math.max(0, Number(now) || 0);
    const cycleElapsed = safeNow % totalDuration;
    let cursor = 0;
    let index = 0;
    for (let i = 0; i < segments.length; i += 1) {
      if (cycleElapsed < cursor + segments[i].duration) {
        index = i;
        break;
      }
      cursor += segments[i].duration;
    }
    const active = segments[index];
    return {
      phase: active.phase,
      phases: segments.map((segment) => segment.phase),
      segments,
      index,
      duration: active.duration,
      totalDuration,
      phaseElapsed: cycleElapsed - cursor,
      phaseProgress: Math.max(0, Math.min(1, (cycleElapsed - cursor) / active.duration)),
      dialogueSlot: Math.floor(safeNow / totalDuration),
      label: { consumption: "资源消耗", dialogue: "动物回应", production: "资源产出", rest: "留白" }[active.phase]
    };
  }

  selectMapSpeechCandidate(candidates = [], feedbackCycle = {}) {
    const unique = [];
    const seen = {};
    (candidates || []).forEach((candidate) => {
      if (!candidate || !candidate.key || seen[candidate.key]) return;
      seen[candidate.key] = true;
      unique.push(candidate);
    });
    if (!unique.length || feedbackCycle.phase !== "dialogue") {
      this.mapSpeechSelection = null;
      return null;
    }
    const slot = Math.max(0, Number(feedbackCycle.dialogueSlot) || 0);
    const signature = unique.map((candidate) => candidate.key).sort().join("|");
    if (this.mapSpeechSelection && this.mapSpeechSelection.slot === slot && this.mapSpeechSelection.signature === signature) {
      return unique.find((candidate) => candidate.key === this.mapSpeechSelection.key) || null;
    }
    let selected = null;
    let focus = this.mapSpeakerFocus;
    if (focus && typeof focus.usedSlot === "number" && slot > focus.usedSlot) {
      this.mapSpeakerFocus = null;
      focus = null;
    }
    if (focus && slot <= Number(focus.expiresAfterSlot || slot)) {
      selected = unique.find((candidate) => candidate.kind === focus.kind && String(candidate.id) === String(focus.id)) || null;
      if (selected) focus.usedSlot = slot;
    }
    if (!selected) {
      const priorityCandidates = unique.filter((candidate) => {
        const cooldown = candidate.priority >= 380 ? 3 : candidate.priority >= 220 ? 2 : 1;
        const lastSlot = this.mapSpeechHistory[candidate.key];
        return candidate.priority > 100 && (typeof lastSlot !== "number" || slot - lastSlot >= cooldown);
      }).sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));
      selected = priorityCandidates[0] || unique[slot % unique.length];
    }
    const previousKey = this.mapSpeechSelection && this.mapSpeechSelection.key;
    if (selected && unique.length > 1 && previousKey === selected.key) {
      const alternate = unique.find((candidate) => candidate.key !== previousKey);
      if (alternate) selected = alternate;
    }
    if (selected) this.mapSpeechHistory[selected.key] = slot;
    this.mapSpeechSelection = selected ? { slot, signature, key: selected.key } : null;
    return selected;
  }

  mapResourceFlowPhase(marker = {}) {
    if (marker.flowKind === "production" || marker.flowKind === "consumption") return marker.flowKind;
    if ((Number(marker.delta) || 0) > 0 || marker.type === "recovery") return "production";
    return "consumption";
  }

  drawReserveFacilities(ctx, camera, fast = false, options = {}) {
    const moment = latestOrdinaryMoment(this.state);
    const showDialogue = options.showDialogue !== false;
    const speechCandidate = options.speechCandidate || null;
    this.renderedMapSpeechBubbles = this.renderedMapSpeechBubbles || [];
    this.renderedMapFacilityLabels = [];
    facilityStates(this.state).filter((facility) => !facility.concealed).forEach((facility) => {
      const point = this.mapPoint(facility.x, facility.y, camera);
      const labelMargin = 48;
      const mapLabelVisible = point.x >= camera.x + labelMargin
        && point.x <= camera.x + camera.w - labelMargin
        && point.y >= camera.y + 132
        && point.y <= camera.y + camera.h - 30;
      this.drawReserveFacility(ctx, point.x, point.y, Object.assign({}, facility, { mapLabelVisible }), camera.scale || 1, fast);
      if (!fast && showDialogue && !this.mapConsequencePulse && point.y >= camera.y + 132 && moment && moment.facilityId === facility.id
        && speechCandidate && speechCandidate.key === `facility:${facility.id}`) {
        this.drawAnimalMiniBubble(ctx, point.x, point.y - Math.max(28, 34 * (camera.scale || 1)), moment.text, true, camera.scale || 1);
        this.renderedMapSpeechBubbles.push({ key: speechCandidate.key, kind: "facility" });
      }
      this.addMapHit(point.x, point.y, Math.max(48, 52 * (camera.scale || 1)), () => this.openReserveFacilityDetail(facility.id));
    });
  }

  drawAnimalEcologyDrops(ctx, camera, fast = false, prologue = false, visible = true) {
    if (fast || prologue || !visible) return;
    const reserve = (this.state.world || {}).reserve || {};
    const economy = normalizeEcologyEconomy(reserve.ecologyEconomy, reserve);
    economy.mapDrops.forEach((drop, index) => {
      const catalog = FRAGMENT_CATALOG[drop.type] || FRAGMENT_CATALOG.fieldNote;
      const point = this.mapPoint(drop.x, drop.y, camera);
      if (point.y < camera.y + 128 || point.y > camera.y + camera.h - 24) return;
      const scale = Math.max(.78, Math.min(1.15, camera.scale || 1));
      const bob = Math.sin((Date.now() / 280) + index) * 2.2;
      const cx = point.x;
      const cy = point.y + bob;
      ctx.save();
      ctx.fillStyle = "rgba(16,44,32,.24)";
      ctx.beginPath();
      ctx.ellipse(cx, cy + 17 * scale, 18 * scale, 6 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = catalog.color;
      ctx.strokeStyle = "rgba(255,249,224,.94)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, 15 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#fff8df";
      if (catalog.rarity === "rare" || catalog.rarity === "scarce") {
        for (let arm = 0; arm < 4; arm += 1) {
          const angle = arm * Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * 3, cy + Math.sin(angle) * 3);
          ctx.lineTo(cx + Math.cos(angle) * 10 * scale, cy + Math.sin(angle) * 10 * scale);
          ctx.strokeStyle = "#fff8df";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(cx, cy, 4 * scale, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.beginPath();
        ctx.ellipse(cx, cy, 5 * scale, 9 * scale, -.65, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      const label = catalog.rarity === "rare" || catalog.rarity === "scarce" ? `稀有${catalog.short}` : `${drop.animalName || "动物"}留下的${catalog.short}`;
      const labelW = Math.min(116, Math.max(62, label.length * 10 + 18));
      this.roundRect(ctx, cx - labelW / 2, cy + 22 * scale, labelW, 22, 10, "rgba(255,249,232,.96)", "rgba(45,76,58,.30)");
      this.text(ctx, this.truncateTextToWidth(ctx, label, labelW - 14, 9, "700"), cx, cy + 37 * scale, 9, "#28483b", "700", "center");
      this.addMapHit(cx, cy + 8, Math.max(42, 48 * scale), () => this.collectAnimalEcologyDrop(drop.id, {
        x: cx,
        y: cy - this.scrollY,
        type: drop.type,
        amount: drop.amount || 1
      }));
    });
  }

  drawStoryDiscoveryMarker(ctx, camera, discovery, fast = false) {
    const item = discovery && discovery.item;
    const region = discovery && this.findRegion(discovery.regionId);
    if (!item || !region) { this.renderedStoryDiscoveryMarker = null; return; }
    const point = this.mapPoint(region.x, region.y, camera);
    const scale = Math.max(.72, Math.min(1.08, camera.scale || 1));
    const x = point.x + 24 * scale;
    const y = point.y - 18 * scale;
    const pulse = fast ? 0 : (Math.sin(this.animT() * .006) + 1) * .5;
    ctx.save();
    ctx.globalAlpha = .18 + pulse * .12;
    ctx.fillStyle = "#fff27e";
    ctx.beginPath();
    ctx.arc(x, y + 9 * scale, (34 + pulse * 5) * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    this.roundRect(ctx, x - 27 * scale, y - 27 * scale + 5, 54 * scale, 54 * scale, 18 * scale, "rgba(18,61,52,.28)");
    this.roundRect(ctx, x - 27 * scale, y - 27 * scale, 54 * scale, 54 * scale, 18 * scale, "#fff9df", "rgba(255,214,90,.92)");
    this.drawCollectionItemIcon(ctx, item, x, y, 46 * scale);
    const labelW = Math.min(124, Math.max(70, item.name.length * 13 + 18)) * scale;
    this.roundRect(ctx, x - labelW / 2, y + 31 * scale, labelW, 24 * scale, 12 * scale, "rgba(18,61,52,.92)", "rgba(255,248,223,.78)");
    this.text(ctx, `发现 · ${item.name}`, x, y + 47 * scale, 10 * scale, "#fff8df", "700", "center");
    this.renderedStoryDiscoveryMarker = { itemId: item.id, x, y, size: 66 * scale, label: item.name };
    this.addMapHit(x, y + 6 * scale, Math.max(50, 70 * scale), () => this.collectMapStoryDiscovery(item.id));
  }

  collectMapStoryDiscovery(itemId) {
    const beforeState = JSON.parse(JSON.stringify(this.state));
    const result = collectStoryDiscovery(this.state, itemId);
    if (!result.ok) { this.toast(result.error); this.render(); return; }
    this.state.world.reserve.progression = reserveProgressionFor(this.state.world.reserve);
    recordSevenDayProgress(this.state.world.reserve, "collectionInvestigation");
    const goalProgress = applyGoalProgress(beforeState, this.state, { action: "collectionInvestigate", now: Date.now() });
    this.state = goalProgress.state;
    saveState(this.state);
    this.playSfx("success");
    const discovery = result.entry.discovery || {};
    this.infoDetailModal = {
      kind: "collectionItem",
      kicker: result.endingReady ? "主证据齐全" : "剧情发现 · 已收录",
      title: result.item.name,
      icon: result.item.icon,
      collectionItem: result.item,
      item: result.item,
      entry: result.entry,
      caseDef: collectionCaseById(result.item.caseId),
      items: [
        { tag: "谁发现", title: discovery.who || "附近动物", body: discovery.when || "今天" },
        { tag: "在哪里", title: discovery.where || "保护区现场", body: `通过“${discovery.action || "守护行动"}”定位` },
        { tag: "故事", title: result.item.discoveryRole === "evidence" ? "主证据" : result.item.discoveryRole === "ecology" ? "生态记录" : "动物记忆", body: result.item.story },
        result.facilityMilestone ? { tag: "改变", title: result.facilityMilestone.stage === 1 ? "设施开始清理" : result.facilityMilestone.stage === 2 ? "设施恢复功能" : "设施完成修复", body: "这件物品已经让沙盘发生永久变化。" } : null
      ].filter(Boolean),
      footer: result.endingReady ? "前7件发现已经连成完整故事，可以决定案件结局。" : "动物提出疑问，守护行动验证痕迹，物件永久留在档案中。",
      actionLabel: result.endingReady ? "决定案件结局" : "查看案件",
      action: () => {
        this.infoDetailModal = null;
        this.collectionCaseId = result.item.caseId;
        this.collectionPage = Math.floor((result.item.slot - 1) / 6);
        result.endingReady ? this.openCollectionEnding(result.item.caseId) : this.setScreen("collection");
      }
    };
    this.render();
  }

  drawMapResourceFlow(ctx, marker = {}, x, y, scale = 1) {
    const s = Math.max(.78, Math.min(1.18, scale));
    const delta = Number(marker.delta) || 0;
    const beneficial = typeof marker.beneficial === "boolean" ? marker.beneficial : delta > 0;
    const positive = beneficial;
    const negative = !beneficial && delta < 0;
    const label = marker.metricLabel || marker.label || "资源";
    const valueText = delta ? this.signed(delta) : `${Math.round(Number(marker.value) || 0)}`;
    const text = `${label} ${valueText}`;
    const chipW = Math.max(66, Math.min(104, text.length * 10 + 34));
    const chipH = 30;
    const icon = marker.metric === "water" ? "water"
      : marker.metric === "grass" ? "leaf"
        : marker.metric === "fund" ? "fund"
          : marker.metric === "migration" ? "migration"
            : marker.metric === "poacher" ? "antiPoacher"
              : marker.metric === "safety" ? "signal" : this.mapMarkerVisualIcon(marker);
    const fill = positive ? "rgba(232,246,224,.96)" : negative ? "rgba(255,238,229,.96)" : "rgba(255,249,232,.95)";
    const stroke = positive ? "rgba(31,122,82,.46)" : negative ? "rgba(196,91,66,.42)" : "rgba(139,111,42,.32)";
    const color = positive ? "#1f7a52" : negative ? "#c45b42" : "#675a3d";
    const bob = Math.sin(this.animT() * .004 + x * .03) * 1.5;
    const bx = x - chipW / 2;
    const by = y - chipH / 2 + bob;
    this.roundRect(ctx, bx, by + 3, chipW, chipH, 14, "rgba(21,39,29,.16)");
    this.roundRect(ctx, bx, by, chipW, chipH, 14, fill, stroke);
    this.drawUiIcon(ctx, icon, bx + 16, by + chipH / 2, 18, false, .96)
      || this.drawSmallGlyph(ctx, icon, bx + 16, by + chipH / 2, color, .62);
    this.text(ctx, text, bx + 30, by + 20, 10, color, "700");
    this.renderedMapResourceFlows = this.renderedMapResourceFlows || [];
    this.renderedMapResourceFlows.push({
      id: marker.id,
      metric: marker.metric,
      label,
      delta,
      value: marker.value,
      style: "resource-flow-chip",
      dialogue: false,
      grounded: false,
      x: bx,
      y: by,
      w: chipW,
      h: chipH
    });
  }

  collectAnimalEcologyDrop(dropId, origin = null) {
    const reserve = (this.state.world || {}).reserve || {};
    const before = this.reserveSnapshot(reserve);
    const collected = collectEcologyDrop(reserve, dropId);
    if (!collected) return;
    const catalog = FRAGMENT_CATALOG[collected.type] || FRAGMENT_CATALOG.fieldNote;
    this.startMapHarvestFlight(collected, catalog, origin);
    saveState(this.state);
    this.setMapConsequencePulse(before, this.reserveSnapshot(reserve), {
      title: `收获 · ${catalog.name}`,
      reason: `${collected.animalName || "动物伙伴"}的活动留下了可记录的痕迹`,
      tone: "harvest",
      regionId: "center",
      customValueText: `${catalog.name} +${collected.amount} · 共${collected.total}`,
      animalQuote: `${collected.animalName || "动物伙伴"}：你发现了我留给这片土地的记号。`
    });
    this.playSfx("success");
    this.toast(`${catalog.name} +${collected.amount}`);
    this.render();
  }

  startMapHarvestFlight(collected = {}, catalog = {}, origin = null) {
    const viewport = this.mapViewport || { x: 0, y: 0, w: this.width, h: this.height - this.navHeight() };
    const startX = origin && Number.isFinite(origin.x) ? origin.x : viewport.x + viewport.w / 2;
    const startY = origin && Number.isFinite(origin.y) ? origin.y : viewport.y + viewport.h / 2;
    this.mapHarvestFlight = {
      id: collected.id || `harvest_${Date.now()}`,
      type: collected.type || (origin && origin.type) || "fieldNote",
      amount: Math.max(1, Math.round(collected.amount || (origin && origin.amount) || 1)),
      color: catalog.color || "#54a980",
      short: catalog.short || "物资",
      startedAt: Date.now(),
      duration: 760,
      impactDuration: 280,
      startX,
      startY
    };
    return this.mapHarvestFlight;
  }

  mapHarvestFlightFrame(now = Date.now(), flight = this.mapHarvestFlight) {
    if (!flight) return null;
    const elapsed = Math.max(0, Number(now) - flight.startedAt);
    const duration = Math.max(1, flight.duration || 760);
    const impactDuration = Math.max(1, flight.impactDuration || 280);
    if (elapsed >= duration + impactDuration) return null;
    const targetX = this.width * .875;
    const targetY = this.height - this.navHeight() + 19;
    const raw = Math.min(1, elapsed / duration);
    const progress = 1 - Math.pow(1 - raw, 3);
    const controlX = flight.startX + (targetX - flight.startX) * .48;
    const controlY = Math.min(flight.startY, targetY) - Math.max(54, Math.min(120, Math.abs(targetY - flight.startY) * .22 + 48));
    const oneMinus = 1 - progress;
    const x = oneMinus * oneMinus * flight.startX + 2 * oneMinus * progress * controlX + progress * progress * targetX;
    const y = oneMinus * oneMinus * flight.startY + 2 * oneMinus * progress * controlY + progress * progress * targetY;
    const impact = raw >= 1 ? Math.min(1, (elapsed - duration) / impactDuration) : 0;
    return {
      elapsed,
      progress: raw,
      eased: progress,
      impact,
      x: raw >= 1 ? targetX : x,
      y: raw >= 1 ? targetY : y,
      targetX,
      targetY,
      alpha: raw < 1 ? 1 : Math.max(0, 1 - impact),
      scale: raw < 1 ? 1 + Math.sin(Math.PI * raw) * .18 : 1 + Math.sin(Math.PI * impact) * .34
    };
  }

  drawHarvestFragmentToken(ctx, flight, x, y, size, alpha = 1) {
    const radius = size / 2;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = "rgba(24,48,36,.20)";
    ctx.beginPath();
    ctx.ellipse(x, y + radius * .72, radius * .72, radius * .24, 0, 0, Math.PI * 2);
    ctx.fill();
    const glow = ctx.createRadialGradient(x - radius * .25, y - radius * .3, 1, x, y, radius);
    glow.addColorStop(0, "#fff8df");
    glow.addColorStop(.34, flight.color || "#54a980");
    glow.addColorStop(1, "#285b46");
    ctx.fillStyle = glow;
    ctx.strokeStyle = "rgba(255,249,224,.98)";
    ctx.lineWidth = Math.max(2, size * .08);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,249,224,.94)";
    ctx.fillStyle = "rgba(255,249,224,.96)";
    ctx.lineWidth = Math.max(1.5, size * .055);
    if (flight.type === "migrationTrace") {
      ctx.beginPath();
      ctx.moveTo(x - radius * .42, y + radius * .18);
      ctx.quadraticCurveTo(x, y - radius * .42, x + radius * .38, y - radius * .05);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + radius * .16, y - radius * .18);
      ctx.lineTo(x + radius * .42, y - radius * .05);
      ctx.lineTo(x + radius * .24, y + radius * .14);
      ctx.stroke();
    } else if (flight.type === "forestGift" || flight.type === "coGuardShard") {
      for (let arm = 0; arm < 4; arm += 1) {
        const angle = arm * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(angle) * radius * .18, y + Math.sin(angle) * radius * .18);
        ctx.lineTo(x + Math.cos(angle) * radius * .62, y + Math.sin(angle) * radius * .62);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(x, y, radius * .18, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(x, y, radius * .25, radius * .48, -.65, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x - radius * .18, y + radius * .28);
      ctx.lineTo(x + radius * .26, y - radius * .3);
      ctx.strokeStyle = "rgba(38,84,62,.75)";
      ctx.stroke();
    }
    ctx.restore();
  }

  drawMapHarvestFlight() {
    const flight = this.mapHarvestFlight;
    const frame = this.mapHarvestFlightFrame(Date.now(), flight);
    if (!frame) {
      if (flight) this.mapHarvestFlight = null;
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    if (frame.progress < 1) {
      for (let index = 1; index <= 4; index += 1) {
        const trailFrame = this.mapHarvestFlightFrame(flight.startedAt + Math.max(0, frame.elapsed - index * 55), flight);
        if (!trailFrame) continue;
        ctx.fillStyle = `rgba(255,239,157,${Math.max(.08, .34 - index * .06)})`;
        ctx.beginPath();
        ctx.arc(trailFrame.x, trailFrame.y, Math.max(2, 5 - index * .7), 0, Math.PI * 2);
        ctx.fill();
      }
      this.drawHarvestFragmentToken(ctx, flight, frame.x, frame.y, 34 * frame.scale, frame.alpha);
      const chipW = 34 + String(flight.amount).length * 8;
      this.roundRect(ctx, frame.x + 13, frame.y - 24, chipW, 20, 10, "rgba(255,251,233,.96)", "rgba(51,91,68,.28)");
      this.text(ctx, `+${flight.amount}`, frame.x + 13 + chipW / 2, frame.y - 10, 10, "#287a58", "700", "center");
    } else {
      const ring = 18 + frame.impact * 25;
      ctx.strokeStyle = `rgba(232,191,73,${Math.max(0, .72 - frame.impact * .72)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(frame.targetX, frame.targetY, ring, 0, Math.PI * 2);
      ctx.stroke();
      this.drawHarvestFragmentToken(ctx, flight, frame.targetX, frame.targetY, 30 * frame.scale, frame.alpha);
    }
    ctx.restore();
  }

  mapCausalMetrics(source = {}) {
    const ecology = source.ecology || {};
    const migration = source.migration || {};
    return {
      fund: source.fund || 0,
      safety: source.safety || 0,
      stability: source.stability || 0,
      poacherPressure: source.poacherPressure || 0,
      water: source.water == null ? (ecology.water || 0) : source.water,
      grass: source.grass == null ? (ecology.grass || 0) : source.grass,
      disease: source.disease == null ? (ecology.disease || 0) : source.disease,
      migrationDelta: source.migrationDelta == null ? (migration.delta || 0) : source.migrationDelta
    };
  }

  configureSettlementReveal(modal, returnScreen = "home") {
    if (!modal) return null;
    const now = Date.now();
    const major = !!(modal.breakthrough || modal.chapterTransition || modal.finalChapterEnding || modal.mysteryRecovery || (modal.emotionEvent && modal.emotionEvent.isMajor));
    modal.returnScreen = returnScreen;
    const storyReplay = !!modal.storyReplay;
    if (major) {
      modal.silent = false;
      modal.revealAt = now + (storyReplay ? 5000 : 900);
      modal.valueRevealAt = modal.revealAt;
      modal.animalRevealAt = modal.revealAt + 600;
    } else {
      // 普通行动完全留在沙盘内反馈，不再用全屏结算打断节奏。
      modal.silent = true;
      modal.autoFinishAt = now + (storyReplay ? 5000 : 2600);
      modal.revealAt = 0;
      modal.animalRevealAt = 0;
    }
    return modal;
  }

  setMapPatrolReplay(actionId, context = {}) {
    if (!["houndScout", "antiPoacher", "habitat", "intervention", "exploreMaterials"].includes(actionId)) {
      this.mapPatrolReplay = null;
      return null;
    }
    const targets = {
      houndScout: [0.20, 0.37],
      antiPoacher: [0.13, 0.33],
      habitat: [0.72, 0.43],
      intervention: [0.58, 0.72],
      exploreMaterials: [0.36, 0.58]
    };
    const target = targets[actionId];
    const startedAt = Date.now() + 120;
    this.mapPatrolReplay = {
      actionId,
      startedAt,
      expiresAt: startedAt + 1180,
      points: [[0.48, 0.84], [0.43, 0.69], [target[0] * .55 + .22, target[1] * .55 + .24], target],
      label: context.label || ({ houndScout: "沿气味搜索", antiPoacher: "追向边界", habitat: "赶往水线", intervention: "接近种群", exploreMaterials: "跟随动物踪迹" }[actionId])
    };
    return this.mapPatrolReplay;
  }

  mapPatrolReplayPoint(points, progress, camera) {
    const safe = Math.max(0, Math.min(.9999, progress));
    const segmentProgress = safe * Math.max(1, points.length - 1);
    const index = Math.min(points.length - 2, Math.floor(segmentProgress));
    const local = segmentProgress - index;
    const start = this.mapPoint(points[index][0], points[index][1], camera);
    const end = this.mapPoint(points[index + 1][0], points[index + 1][1], camera);
    return { x: start.x + (end.x - start.x) * local, y: start.y + (end.y - start.y) * local };
  }

  drawMapPatrolReplay(ctx, camera) {
    const replay = this.mapPatrolReplay;
    if (!replay) return;
    const now = Date.now();
    if (now >= replay.expiresAt) {
      this.mapPatrolReplay = null;
      return;
    }
    if (now < replay.startedAt) return;
    const duration = Math.max(1, replay.expiresAt - replay.startedAt);
    const progress = Math.max(0, Math.min(1, (now - replay.startedAt) / duration));
    const mapped = replay.points.map((point) => this.mapPoint(point[0], point[1], camera));
    ctx.save();
    ctx.strokeStyle = "rgba(255,229,143,.72)";
    ctx.lineWidth = Math.max(2, 2.2 * (camera.scale || 1));
    ctx.setLineDash([7, 7]);
    ctx.beginPath();
    mapped.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.stroke();
    ctx.setLineDash([]);
    const current = this.mapPatrolReplayPoint(replay.points, progress, camera);
    const pulse = .5 + .5 * Math.sin(progress * Math.PI * 8);
    ctx.fillStyle = `rgba(255,232,145,${.20 + pulse * .20})`;
    ctx.beginPath();
    ctx.arc(current.x, current.y, 19 + pulse * 4, 0, Math.PI * 2);
    ctx.fill();
    this.drawUiIcon(ctx, "hound_team", current.x, current.y - 2, 34, true)
      || this.drawSmallGlyph(ctx, "houndScout", current.x, current.y - 2, "#173d34", 1);
    const labelW = Math.max(72, replay.label.length * 11 + 18);
    this.roundRect(ctx, current.x - labelW / 2, current.y + 19, labelW, 22, 10, "rgba(255,252,235,.94)", "rgba(93,72,31,.30)");
    this.text(ctx, replay.label, current.x, current.y + 34, 10, "#59451f", "700", "center");
    replay.rendered = { progress, current, routeVisible: true, actor: "hound-team" };
    ctx.restore();
  }

  drawWeeklyGuardianCelebration(ctx, camera, animals = [], consequenceVisible = false) {
    const celebration = this.weeklyGuardianCelebration;
    if (!celebration || consequenceVisible || this.mapPatrolReplay) return;
    if (!celebration.startedAt) celebration.startedAt = Date.now();
    const elapsed = Date.now() - celebration.startedAt;
    if (elapsed >= 3200) {
      this.finishWeeklyGuardianCelebration();
      return;
    }
    const center = this.mapPoint(.50, .56, camera);
    const reveal = Math.min(1, elapsed / 450);
    const fade = elapsed > 2700 ? Math.max(0, 1 - (elapsed - 2700) / 500) : 1;
    const alpha = reveal * fade;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let index = 0; index < 9; index += 1) {
      const angle = index / 9 * Math.PI * 2 + elapsed / 900;
      const radius = 46 + (index % 3) * 12;
      ctx.fillStyle = index % 2 ? "#fff0a8" : "#d8f3bd";
      ctx.beginPath();
      ctx.arc(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius * .45, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    (animals || []).slice(0, 5).forEach((animal, index) => {
      const offset = (index - 2) * 34 * (camera.scale || 1);
      this.drawAnimalAvatar(ctx, animal, center.x + offset, center.y + 18 + Math.abs(index - 2) * 3, 34, true);
    });
    const cardW = Math.min(280, camera.w - 32);
    this.roundRect(ctx, center.x - cardW / 2, center.y - 70, cardW, 54, 18, "rgba(255,252,232,.96)", "rgba(216,174,62,.65)");
    this.text(ctx, "一周守护者", center.x, center.y - 45, 16, "#1f6f50", "700", "center");
    this.text(ctx, `森林记住了 ${celebration.activeDays} 个清晨`, center.x, center.y - 27, 10, "#6d5a2d", "700", "center");
    celebration.rendered = { alpha, animalCount: Math.min(5, animals.length), duration: 3200 };
    ctx.restore();
  }

  setMapConsequencePulse(beforeSource, afterSource, context = {}) {
    const before = this.mapCausalMetrics(beforeSource || {});
    const after = this.mapCausalMetrics(afterSource || {});
    const labels = { fund: "基金", safety: "安全", stability: "稳定", poacherPressure: "偷猎", water: "水源", grass: "草场", disease: "疾病", migrationDelta: "迁徙" };
    const coords = {
      fund: [0.16, 0.18], safety: [0.34, 0.48], stability: [0.54, 0.56], poacherPressure: [0.18, 0.40],
      water: [0.72, 0.42], grass: [0.58, 0.73], disease: [0.43, 0.35], migrationDelta: [0.54, 0.50]
    };
    const priorities = context.tone === "habitat" ? ["water", "grass", "migrationDelta", "stability"]
      : context.tone === "antiPoacher" || context.tone === "houndScout" ? ["poacherPressure", "safety", "migrationDelta", "stability"]
        : context.tone === "intervention" ? ["migrationDelta", "grass", "stability", "disease"]
          : context.tone === "strategy" || context.tone === "promise" ? ["migrationDelta", "water", "poacherPressure", "safety", "grass", "fund"]
            : ["fund", "migrationDelta", "safety", "water", "grass", "poacherPressure"];
    const changed = priorities.map((key) => ({ key, before: before[key], after: after[key], delta: after[key] - before[key] })).filter((item) => item.delta !== 0);
    const fallbackChanged = Object.keys(after).map((key) => ({ key, before: before[key], after: after[key], delta: after[key] - before[key] })).filter((item) => item.delta !== 0);
    const primary = changed[0] || fallbackChanged[0] || null;
    const relationship = context.relationshipChange || null;
    const animalOutcome = context.animalOutcome || null;
    const relationText = relationship
      ? `${relationship.name}：安全${relationship.before.security}→${relationship.after.security} · 野性${relationship.before.wildness}→${relationship.after.wildness}`
      : animalOutcome
        ? `${animalOutcome.individual.name}：安全${relationshipAxes(animalOutcome.before).security}→${relationshipAxes(animalOutcome.individual).security} · 野性${relationshipAxes(animalOutcome.before).wildness}→${relationshipAxes(animalOutcome.individual).wildness}`
        : "";
    let point = primary ? coords[primary.key] : [0.52, 0.48];
    if (context.regionId) {
      const region = this.findRegion(context.regionId);
      if (region) point = [region.x, region.y];
    } else if (relationship) {
      const animal = ((this.state.world || {}).knownCharacters || []).find((item) => item.species === relationship.species);
      const region = animal && (this.state.world.regions || []).find((item) => item.name === animal.location);
      if (region) point = [region.x, region.y];
    }
    const positive = primary ? ((primary.key === "poacherPressure" || primary.key === "disease") ? primary.delta < 0 : primary.delta > 0) : true;
    const second = changed[1] || fallbackChanged.find((item) => !primary || item.key !== primary.key) || null;
    const metricText = (item) => item ? `${labels[item.key] || item.key} ${item.before}→${item.after}（${this.signed(item.delta)}）` : "";
    const startedAt = Date.now() + Math.max(0, context.delayMs || 0);
    this.mapConsequencePulse = {
      startedAt,
      expiresAt: startedAt + 3800,
      x: point[0],
      y: point[1],
      title: context.title || "保护区发生变化",
      valueText: context.customValueText || metricText(primary) || relationText || "永久规则已写入沙盘",
      secondaryValueText: context.animalEconomy
        ? `${context.animalEconomy.summary}${context.animalEconomy.produced && context.animalEconomy.produced.length ? ` · 地图产出 +${context.animalEconomy.produced.length}` : ""}`
        : metricText(second),
      relationText,
      responseText: context.animalQuote || relationText || "森林用路线和停留时间回应了你。",
      reason: context.reason || "",
      positive,
      tone: context.tone || "action"
    };
  }

  drawMapConsequencePulse(ctx, camera) {
    const pulse = this.mapConsequencePulse;
    if (!pulse || Date.now() >= pulse.expiresAt) {
      if (pulse) this.mapConsequencePulse = null;
      return;
    }
    if (Date.now() < pulse.startedAt) return;
    const point = this.mapPoint(pulse.x, pulse.y, camera);
    const elapsed = Date.now() - pulse.startedAt;
    const stage = this.mapConsequenceStage(pulse);
    const life = Math.max(0, Math.min(1, elapsed / Math.max(1, pulse.expiresAt - pulse.startedAt)));
    const color = pulse.positive ? "92,184,122" : "196,91,66";
    ctx.save();
    for (let index = 0; index < 2; index += 1) {
      ctx.strokeStyle = `rgba(${color},${Math.max(.08, .58 - life * .48 - index * .14)})`;
      ctx.lineWidth = 3 - index * .8;
      ctx.beginPath();
      ctx.arc(point.x, point.y, (18 + life * 34 + index * 13) * (camera.scale || 1), 0, Math.PI * 2);
      ctx.stroke();
    }
    const numberReady = stage !== "environment";
    const animalReady = stage === "animal";
    const cardW = Math.max(230, Math.min(304, camera.w - 18));
    const bx = camera.x + (camera.w - cardW) / 2;
    // Keep the result below the floating HUD. It should read like a clear
    // reward card, not a tiny map label attached to one facility.
    const by = Math.max(camera.y + 128, Math.min(camera.y + camera.h - 128, point.y - 70));
    const bubbleH = animalReady ? 100 : numberReady ? 70 : 52;
    const accent = pulse.positive ? "#27845f" : "#c75f50";
    this.roundRect(ctx, bx, by + 6, cardW, bubbleH, 17, "rgba(12,35,25,.24)");
    this.roundRect(ctx, bx, by, cardW, bubbleH, 17, "rgba(255,252,235,.97)", "rgba(57,83,63,.36)");

    // 一张卡只保留一个语义色。标题、次变化和动物回应都退回中性色，
    // 避免红、绿、黄三组胶囊在狭小地图上互相争抢。
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(bx + 19, by + 21, 5, 0, Math.PI * 2);
    ctx.fill();
    this.text(ctx, this.truncateTextToWidth(ctx, pulse.title, cardW - 48, 12, "700"), bx + 32, by + 26, 12, "#244337", "700");

    if (!numberReady) {
      this.text(ctx, this.truncateTextToWidth(ctx, pulse.reason || "保护区正在回应这次行动", cardW - 32, 10, "400"), bx + 16, by + 44, 10, "#68736a", "400");
    } else {
      ctx.strokeStyle = "rgba(60,83,67,.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx + 16, by + 34);
      ctx.lineTo(bx + cardW - 16, by + 34);
      ctx.stroke();
      this.text(ctx, this.truncateTextToWidth(ctx, pulse.valueText || "数值已经更新", cardW - 32, 14, "700"), bx + 16, by + 56, 14, accent, "700");
      if (pulse.secondaryValueText) {
        this.text(ctx, this.truncateTextToWidth(ctx, pulse.secondaryValueText, cardW - 32, 10, "700"), bx + 16, by + 68, 10, "#68736a", "700");
      }
    }
    if (animalReady) {
      this.text(ctx, this.truncateTextToWidth(ctx, pulse.responseText, cardW - 32, 10, "700"), bx + 16, by + 91, 10, "#526158", "700");
    }
    pulse.renderedCard = {
      x: bx,
      y: by,
      w: cardW,
      h: bubbleH,
      stage,
      valueSize: numberReady ? 14 : 0,
      hasAnimalResponse: animalReady,
      palette: "neutral-single-accent",
      coloredPanels: 0,
      layer: "map-foreground",
      suppressesMapSpeech: true
    };
    ctx.restore();
  }

  mapConsequenceStage(pulse = this.mapConsequencePulse, now = Date.now()) {
    if (!pulse) return "none";
    const elapsed = now - pulse.startedAt;
    if (elapsed < 550) return "environment";
    if (elapsed < 1350) return "numbers";
    return "animal";
  }

  drawGuardianPromiseMarkers(ctx, camera, fast = false) {
    const chosen = chosenPromiseChoices((this.state.world || {}).reserve || {});
    if (!chosen.length) return;
    const positions = [[0.36, 0.68], [0.76, 0.45], [0.22, 0.34], [0.56, 0.57], [0.70, 0.72]];
    const latestChapter = Math.max(...chosen.map((entry) => entry.promise.chapter));
    chosen.forEach(({ promise, choice }) => {
      const coord = positions[promise.chapter - 1] || positions[0];
      const point = this.mapPoint(coord[0], coord[1], camera);
      const scale = camera.scale || 1;
      ctx.save();
      ctx.fillStyle = "rgba(240,211,118,.96)";
      ctx.strokeStyle = "rgba(20,67,53,.92)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(point.x - 7 * scale, point.y + 11 * scale);
      ctx.lineTo(point.x - 7 * scale, point.y - 11 * scale);
      ctx.lineTo(point.x + 10 * scale, point.y - 5 * scale);
      ctx.lineTo(point.x - 7 * scale, point.y + 1 * scale);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (!fast && (camera.scale > 1.4 || promise.chapter === latestChapter)) {
        const text = choice.mapTag || choice.label;
        const width = Math.max(66, Math.min(118, text.length * 10 + 18));
        this.roundRect(ctx, point.x - width / 2, point.y + 12, width, 22, 8, "rgba(20,67,53,.90)", "rgba(240,211,118,.72)");
        this.text(ctx, this.truncateTextToWidth(ctx, text, width - 12, 9, "700"), point.x, point.y + 27, 9, "#fff8df", "700", "center");
      }
    });
  }

  ecologyVisualTier(key, value) {
    this.ecologyVisualTiers = this.ecologyVisualTiers || {};
    const thresholds = key === "water" ? [30, 60] : [40, 70];
    const raw = value < thresholds[0] ? "low" : value < thresholds[1] ? "normal" : "high";
    const previous = this.ecologyVisualTiers[key];
    if (!previous || previous === raw) {
      this.ecologyVisualTiers[key] = raw;
      return raw;
    }
    const margin = 2;
    if (previous === "low" && value < thresholds[0] + margin) return previous;
    if (previous === "normal" && raw === "low" && value >= thresholds[0] - margin) return previous;
    if (previous === "normal" && raw === "high" && value < thresholds[1] + margin) return previous;
    if (previous === "high" && value >= thresholds[1] - margin) return previous;
    this.ecologyVisualTiers[key] = raw;
    return raw;
  }

  drawSeasonMapDynamics(ctx, camera, fast = false) {
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const ecology = reserve.ecology || {};
    const dynamics = reserve.seasonDynamics || {};
    const season = dynamics.season || world.season || ((reserve.seasonState || {}).name) || "雨季";
    const water = Math.max(0, Math.min(100, ecology.water || 0));
    const grass = Math.max(0, Math.min(100, ecology.grass || 0));
    const poacher = Math.max(0, Math.min(100, reserve.poacherPressure || 0));
    const migration = (reserve.migration || {}).delta || 0;
    const scale = camera.scale || 1;
    const waterTier = this.ecologyVisualTier("water", water);
    const grassTier = this.ecologyVisualTier("grass", grass);
    this.renderedSeasonTerrain = { waterFeatures: [], migrationRoute: null, poacherTracks: [], waterTier, grassTier, vegetationPatches: [], poacherWarning: null };
    const allWaterPoints = [[0.24, 0.69], [0.53, 0.53], [0.72, 0.43], [0.35, 0.36]];
    const waterCount = waterTier === "low" ? 2 : waterTier === "normal" ? 3 : 4;
    const waterPoints = allWaterPoints.slice(0, waterCount);
    waterPoints.forEach((coord, index) => {
      const point = this.mapPoint(coord[0], coord[1], camera);
      const baseRadius = waterTier === "low" ? 7 : waterTier === "normal" ? 13 : 21;
      const seasonScale = season === "旱季" ? .78 : 1.08;
      const radius = Math.max(5, (baseRadius + (water % 10) * .16) * seasonScale * scale);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(-.10 + index * .025);
      // 水面不再是一枚高饱和蓝色按钮，而是压进地景里的浅水、反光和涟漪。
      const waterFill = ctx.createRadialGradient(-radius * .28, -radius * .12, 1, 0, 0, radius * 1.45);
      waterFill.addColorStop(0, waterTier === "low" ? "rgba(174,145,87,.22)" : season === "雨季" ? "rgba(177,224,215,.42)" : "rgba(172,205,176,.30)");
      waterFill.addColorStop(.62, waterTier === "high" ? "rgba(58,137,132,.32)" : waterTier === "normal" ? "rgba(74,143,126,.24)" : "rgba(125,102,65,.14)");
      waterFill.addColorStop(1, "rgba(44,92,73,0)");
      ctx.fillStyle = waterFill;
      ctx.beginPath();
      ctx.moveTo(-radius * 1.28, 0);
      ctx.bezierCurveTo(-radius * .84, -radius * .62, -radius * .18, -radius * .48, radius * .34, -radius * .38);
      ctx.bezierCurveTo(radius * .92, -radius * .28, radius * 1.38, -.04 * radius, radius * 1.18, radius * .25);
      ctx.bezierCurveTo(radius * .70, radius * .58, radius * .04, radius * .48, -radius * .54, radius * .40);
      ctx.bezierCurveTo(-radius * 1.06, radius * .32, -radius * 1.44, radius * .20, -radius * 1.28, 0);
      ctx.closePath();
      ctx.fill();
      if (waterTier === "low") {
        ctx.strokeStyle = "rgba(112,83,49,.34)";
        ctx.lineWidth = Math.max(.8, scale);
        [[-.42, -.08, -.18, .16], [.05, -.18, .24, .08], [.34, .02, .14, .22]].forEach((crack) => {
          ctx.beginPath();
          ctx.moveTo(crack[0] * radius, crack[1] * radius);
          ctx.lineTo(crack[2] * radius, crack[3] * radius);
          ctx.stroke();
        });
      }
      if (!fast) {
        ctx.strokeStyle = season === "雨季" ? "rgba(192,226,202,.30)" : "rgba(222,205,145,.26)";
        ctx.lineWidth = Math.max(.8, 1.05 * scale);
        ctx.lineCap = "round";
        [-.08, .17].forEach((offset, rippleIndex) => {
          ctx.beginPath();
          ctx.ellipse(radius * (-.12 + rippleIndex * .22), radius * offset, radius * (.58 - rippleIndex * .08), radius * (.17 - rippleIndex * .02), 0, Math.PI * .12, Math.PI * .88);
          ctx.stroke();
        });
      }
      ctx.restore();
      this.renderedSeasonTerrain.waterFeatures.push({
        index,
        x: point.x,
        y: point.y,
        radius,
        style: "ground-ripples",
        variant: waterTier === "low" ? "drying-basin" : waterTier === "high" ? "expanded-water" : "normal-water",
        labelVisible: false,
        season,
        tier: waterTier
      });
    });

    const patchCount = fast ? (grassTier === "high" ? 8 : 5) : grassTier === "low" ? 7 : grassTier === "normal" ? 13 : 20;
    for (let index = 0; index < patchCount; index += 1) {
      const nx = .18 + ((index * 37) % 68) / 100;
      const ny = .30 + ((index * 53) % 55) / 100;
      const point = this.mapPoint(nx, ny, camera);
      ctx.save();
      ctx.fillStyle = grassTier === "high" ? "rgba(52,137,68,.27)" : grassTier === "normal" ? "rgba(91,145,72,.17)" : "rgba(174,126,61,.20)";
      ctx.beginPath();
      const patchW = (grassTier === "high" ? 16 : 11) + index % 4 * 3;
      const patchH = (grassTier === "high" ? 8 : 5) + index % 3 * 2;
      ctx.ellipse(point.x, point.y, patchW * scale, patchH * scale, (index % 3 - 1) * .16, 0, Math.PI * 2);
      ctx.fill();
      if (!fast && grassTier === "high") {
        ctx.strokeStyle = "rgba(201,225,151,.30)";
        ctx.lineWidth = Math.max(.7, .8 * scale);
        [-.45, 0, .45].forEach((offset) => {
          ctx.beginPath();
          ctx.moveTo(point.x + patchW * offset * scale, point.y + 2 * scale);
          ctx.quadraticCurveTo(point.x + patchW * offset * scale + 2 * scale, point.y - 7 * scale, point.x + patchW * offset * scale + 1 * scale, point.y - 10 * scale);
          ctx.stroke();
        });
      }
      ctx.restore();
      this.renderedSeasonTerrain.vegetationPatches.push({ x: point.x, y: point.y, tier: grassTier, w: patchW * scale, h: patchH * scale });
    }

    if (!fast && Math.abs(migration) >= 2) {
      const route = migration > 0 ? [[0.10, 0.74], [0.34, 0.64], [0.56, 0.56], [0.82, 0.42]] : [[0.82, 0.42], [0.56, 0.56], [0.34, 0.64], [0.10, 0.74]];
      const routePoints = route.map((coord) => this.mapPoint(coord[0], coord[1], camera));
      const steps = [];
      for (let index = 0; index < routePoints.length - 1; index += 1) {
        const start = routePoints[index];
        const end = routePoints[index + 1];
        [0.22, 0.50, 0.78].forEach((amount, subIndex) => {
          const x = start.x + (end.x - start.x) * amount;
          const y = start.y + (end.y - start.y) * amount;
          const angle = Math.atan2(end.y - start.y, end.x - start.x);
          const alpha = Math.max(.12, .34 - (index * 3 + subIndex) * .022);
          this.drawGroundTrailStep(ctx, x, y, angle, scale, migration > 0 ? "migration" : "retreat", alpha);
          steps.push({ x, y, angle, alpha });
        });
      }
      this.renderedSeasonTerrain.migrationRoute = { style: "fading-tracks", dashed: false, direction: migration > 0 ? "in" : "out", steps };
    }

    if (!fast && poacher >= 55) {
      [[.13, .35], [.17, .39], [.21, .43]].forEach((coord, index) => {
        const point = this.mapPoint(coord[0], coord[1], camera);
        const angle = -.5 + index * .1;
        const alpha = Math.min(.54, .28 + (poacher - 55) * .004);
        this.drawGroundTrailStep(ctx, point.x, point.y, angle, scale, "poacher", alpha);
        this.renderedSeasonTerrain.poacherTracks.push({ x: point.x, y: point.y, angle, alpha });
      });
    }
    if (!fast && poacher >= 55) this.drawPoacherPressureVignette(ctx, camera, poacher);
  }

  drawPoacherPressureVignette(ctx, camera, poacher) {
    const x = camera.x;
    const y = camera.y;
    const w = camera.w;
    const h = camera.h;
    const alpha = Math.min(.28, .08 + (poacher - 55) * .0045);
    ctx.save();
    const edge = Math.max(34, Math.min(w, h) * .14);
    [[x, y, edge, h, x, y, x + edge, y], [x + w - edge, y, edge, h, x + w, y, x + w - edge, y]].forEach((item, index) => {
      const gradient = ctx.createLinearGradient(item[4], item[5], item[6], item[7]);
      gradient.addColorStop(0, `rgba(142,45,37,${alpha})`);
      gradient.addColorStop(1, "rgba(142,45,37,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(item[0], item[1], item[2], item[3]);
    });
    ctx.restore();
    this.renderedSeasonTerrain.poacherWarning = { visible: true, pressure: poacher, alpha, style: "edge-vignette" };
  }

  drawGroundTrailStep(ctx, x, y, angle, scale = 1, tone = "migration", alpha = .28) {
    const color = tone === "poacher" || tone === "retreat" ? "94,58,39" : "84,69,42";
    const s = Math.max(.72, Math.min(1.6, scale));
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = `rgba(${color},${alpha})`;
    [-1, 1].forEach((side) => {
      ctx.beginPath();
      ctx.ellipse(side * 2.6 * s, side * 1.9 * s, 1.7 * s, 3.2 * s, side * .22, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  drawMapAmbientDynamics(ctx, camera, fast = false) {
    if (fast) return;
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const season = ((reserve.seasonDynamics || {}).season) || world.season || "雨季";
    const x = camera.worldX;
    const y = camera.worldY;
    const w = (camera.worldW || camera.worldSize) * camera.scale;
    const h = (camera.worldH || camera.worldSize) * camera.scale;
    const now = this.animT();
    ctx.save();
    const light = ctx.createLinearGradient(x + w * .1, y, x + w * .66, y + h);
    light.addColorStop(0, "rgba(255,239,177,.10)");
    light.addColorStop(.55, "rgba(255,239,177,.025)");
    light.addColorStop(1, "rgba(255,239,177,0)");
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(x + w * .05, y);
    ctx.lineTo(x + w * .30, y);
    ctx.lineTo(x + w * .66, y + h);
    ctx.lineTo(x + w * .44, y + h);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 3; i += 1) {
      const drift = ((now * .000012 + i * .37) % 1);
      ctx.fillStyle = `rgba(7,31,20,${.035 + i * .012})`;
      ctx.beginPath();
      ctx.ellipse(x + w * drift, y + h * (.20 + i * .27), w * (.18 + i * .025), h * .07, -.15, 0, Math.PI * 2);
      ctx.fill();
    }

    if (season === "雨季") {
      ctx.strokeStyle = "rgba(185,236,226,.20)";
      ctx.lineWidth = Math.max(.7, camera.scale * .7);
      for (let i = 0; i < 14; i += 1) {
        const px = x + w * (((i * 73) % 97) / 100);
        const py = y + h * ((now * .00008 + ((i * 41) % 89) / 100) % 1);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - 3 * camera.scale, py + 8 * camera.scale);
        ctx.stroke();
      }
      const sparkles = [[.22,.57],[.39,.48],[.58,.52],[.76,.43],[.66,.33],[.28,.68]];
      sparkles.forEach((point, index) => {
        const alpha = .18 + (Math.sin(now * .004 + index) + 1) * .10;
        ctx.strokeStyle = `rgba(213,255,239,${alpha})`;
        ctx.lineWidth = 1;
        const px = x + w * point[0];
        const py = y + h * point[1];
        ctx.beginPath();
        ctx.moveTo(px - 4, py);
        ctx.lineTo(px + 4, py);
        ctx.moveTo(px, py - 2);
        ctx.lineTo(px, py + 2);
        ctx.stroke();
      });
    } else {
      for (let i = 0; i < 12; i += 1) {
        const px = x + w * ((now * .000018 + ((i * 67) % 101) / 100) % 1);
        const py = y + h * (.18 + ((i * 47) % 70) / 100);
        ctx.fillStyle = `rgba(239,207,132,${.10 + (i % 3) * .035})`;
        ctx.beginPath();
        ctx.arc(px, py + Math.sin(now * .002 + i) * 4, 1 + (i % 2) * .6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "rgba(255,229,168,.10)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i += 1) {
        const py = y + h * (.28 + i * .17);
        ctx.beginPath();
        ctx.moveTo(x + w * .12, py);
        ctx.bezierCurveTo(x + w * .34, py - 3, x + w * .58, py + 3, x + w * .86, py);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawReserveFacility(ctx, x, y, facility, scale = 1, fast = false) {
    const s = Math.max(0.72, Math.min(1.28, scale));
    const repaired = facility.status === "repaired";
    const operational = repaired && (facility.buildStage || 0) >= 2;
    const specialized = operational && (facility.buildStage || 0) >= 3 && facility.specialization;
    const locked = facility.status === "locked";
    const facilityOrder = ["old_patrol_post", "hydrology_station", "intel_room", "migration_watch", "governance_hall", "guardian_memorial"];
    const facilityIndex = facilityOrder.indexOf(facility.id);
    const facilityImage = this.art && this.art.facilities;
    if (facilityIndex >= 0 && facilityImage && facilityImage.loaded && ctx.drawImage) {
      const cell = 160;
      const spriteSize = Math.max(42, 50 * s);
      const groundY = y + 7 * s;
      ctx.save();
      ctx.fillStyle = operational ? "rgba(8,26,18,.27)" : locked ? "rgba(24,34,23,.30)" : "rgba(20,32,23,.28)";
      ctx.beginPath();
      ctx.ellipse(x, groundY + 1 * s, spriteSize * .40, spriteSize * .105, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(63,99,55,.36)";
      ctx.lineWidth = Math.max(.8, s);
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.moveTo(x + side * spriteSize * .31, groundY + 1 * s);
        ctx.quadraticCurveTo(x + side * spriteSize * .38, groundY - 7 * s, x + side * spriteSize * .43, groundY - 4 * s);
        ctx.stroke();
      });
      if (operational && !fast) {
        ctx.strokeStyle = "rgba(232,207,146,.58)";
        ctx.lineWidth = Math.max(2, 3 * s);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - spriteSize * .06, groundY - 1);
        ctx.bezierCurveTo(x + spriteSize * .18, groundY + 4 * s, x + spriteSize * .40, groundY + 6 * s, x + spriteSize * .58, groundY + 12 * s);
        ctx.stroke();
        [x - spriteSize * .34, x + spriteSize * .36].forEach((lampX, index) => {
          const lampY = groundY - spriteSize * (.22 + index * .03);
          ctx.fillStyle = "rgba(255,229,138,.18)";
          ctx.beginPath();
          ctx.arc(lampX, lampY, 8 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,229,138,.34)";
          ctx.beginPath();
          ctx.arc(lampX, lampY, 3.5 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#f5d780";
          ctx.fillRect(lampX - .8, lampY - 1.5, 1.6, 3);
        });
      }
      if (operational && !fast) {
        const pulse = .42 + Math.sin(this.animT() * .003 + facilityIndex) * .14;
        ctx.strokeStyle = specialized ? (facility.specialization.color || "#e7c76d") : "#e7c76d";
        ctx.globalAlpha = pulse;
        ctx.lineWidth = Math.max(1.4, 1.8 * s);
        ctx.beginPath();
        ctx.ellipse(x, groundY - 2 * s, spriteSize * .42, spriteSize * .18, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      // 建筑本体保持实色；锁定、待修复和建设状态由徽章与标签表达，
      // 不再通过整张素材降透明度，避免设施像浮在地图上的幽灵。
      ctx.globalAlpha = locked ? .94 : repaired && !operational ? .97 : 1;
      ctx.drawImage(
        facilityImage,
        (facilityIndex % 3) * cell,
        Math.floor(facilityIndex / 3) * cell,
        cell,
        cell,
        x - spriteSize / 2,
        groundY - spriteSize,
        spriteSize,
        spriteSize
      );
      ctx.globalAlpha = 1;
      if (!fast && repaired && !operational) {
        const scaffoldY = groundY - spriteSize * .56;
        ctx.strokeStyle = "rgba(245,197,83,.96)";
        ctx.lineWidth = Math.max(1.4, 1.8 * s);
        ctx.setLineDash([4 * s, 3 * s]);
        ctx.beginPath();
        ctx.moveTo(x - spriteSize * .38, groundY - spriteSize * .10);
        ctx.lineTo(x - spriteSize * .31, scaffoldY);
        ctx.lineTo(x + spriteSize * .34, scaffoldY + 3 * s);
        ctx.lineTo(x + spriteSize * .38, groundY - spriteSize * .08);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < 2; i += 1) {
          this.roundRect(ctx, x - spriteSize * .36 + i * 11 * s, groundY - 7 * s, 10 * s, 7 * s, 2 * s, i ? "#d7c49c" : "#4c7965", "rgba(23,57,45,.75)");
        }
        ctx.fillStyle = "#f5c34f";
        ctx.beginPath();
        ctx.moveTo(x + spriteSize * .26, groundY - 10 * s);
        ctx.lineTo(x + spriteSize * .34, groundY);
        ctx.lineTo(x + spriteSize * .18, groundY);
        ctx.closePath();
        ctx.fill();
        this.roundRect(ctx, x + spriteSize * .16, groundY - spriteSize * .88, 30, 19, 8, "rgba(169,121,40,.96)", "rgba(255,249,233,.58)");
        this.text(ctx, `${facility.buildSteps || 0}/2`, x + spriteSize * .16 + 15, groundY - spriteSize * .88 + 14, 10, "#fff9e9", "700", "center");
      } else if (!fast && !repaired) {
        const statusX = x + spriteSize * .25;
        const statusY = groundY - spriteSize * .76;
        ctx.fillStyle = locked ? "rgba(80,83,68,.86)" : "rgba(202,144,46,.92)";
        ctx.beginPath();
        ctx.arc(statusX, statusY, 7 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,249,233,.62)";
        ctx.lineWidth = 1;
        ctx.stroke();
        this.text(ctx, locked ? "?" : "!", statusX, statusY + 3 * s, Math.max(8, 8 * s), "#fff9e9", "700", "center");
      }
      if (specialized && this.art && this.art.facilityRouteKits && this.art.facilityRouteKits.loaded && ctx.drawImage) {
        const kitImage = this.art.facilityRouteKits;
        const routeIndex = Math.max(0, Math.min(3, Number(facility.specialization.atlasIndex) || 0));
        const sourceW = kitImage.width / 4;
        const kitW = Math.max(27, 34 * s);
        const kitH = kitW * (kitImage.height / sourceW);
        ctx.drawImage(kitImage, sourceW * routeIndex, 0, sourceW, kitImage.height, x + spriteSize * .08, groundY - kitH * .88, kitW, kitH);
      }
      if (!fast && this.facilityBuildFlash && this.facilityBuildFlash.id === facility.id) {
        const elapsed = this.animT() - this.facilityBuildFlash.startedAt;
        if (elapsed < 1600) {
          const p = Math.max(0, Math.min(1, elapsed / 1600));
          ctx.strokeStyle = `rgba(255,224,122,${.9 * (1 - p)})`;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.ellipse(x, groundY - spriteSize * .34, spriteSize * (.42 + p * .30), spriteSize * (.28 + p * .20), 0, 0, Math.PI * 2);
          ctx.stroke();
          for (let i = 0; i < 5; i += 1) {
            const angle = i * 1.256 + p * .8;
            ctx.fillStyle = `rgba(255,235,154,${.8 * (1 - p)})`;
            ctx.beginPath();
            ctx.arc(x + Math.cos(angle) * spriteSize * (.42 + p * .16), groundY - spriteSize * .42 + Math.sin(angle) * spriteSize * .22, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        } else this.facilityBuildFlash = null;
      }
      if (!fast && facility.mapLabelVisible !== false) {
        const label = facility.short;
        const labelW = Math.max(46, Math.min(84, label.length * 10 + 16));
        const labelX = x - labelW / 2;
        const labelY = groundY + 2;
        this.roundRect(ctx, labelX, labelY + 2, labelW, 20, 9, "rgba(28,35,24,.12)");
        this.roundRect(ctx, labelX, labelY, labelW, 20, 9, "rgba(255,250,225,.82)", specialized ? (facility.specialization.color || "rgba(143,111,42,.52)") : "rgba(83,91,67,.34)");
        this.text(ctx, label, x, labelY + 14, 10, "#2d4636", "700", "center");
        this.renderedMapFacilityLabels.push({ id: facility.id, label, x: labelX, y: labelY, w: labelW, h: 20, size: 10, status: specialized ? "specialized" : operational ? "operational" : repaired ? "building" : locked ? "locked" : "repairable", style: "grounded", spriteSize });
      }
      ctx.restore();
      return;
    }
    const bodyW = 30 * s;
    const bodyH = 18 * s;
    const bodyColor = repaired ? "#e8ddbd" : locked ? "#7e8176" : "#9c8259";
    const roofColor = repaired ? "#1f6f4c" : locked ? "#555b54" : "#6e4e38";
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(8,18,12,0.24)";
    ctx.beginPath();
    ctx.ellipse(x, y + 10 * s, bodyW * 0.72, 5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    if (repaired && !fast) {
      const pulse = 0.46 + Math.sin(this.animT() * 0.003) * 0.12;
      ctx.strokeStyle = `rgba(240,211,118,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y + 5 * s, bodyW * 0.78, 13 * s, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.roundRect(ctx, x - bodyW / 2, y - bodyH / 2, bodyW, bodyH, 3 * s, bodyColor, repaired ? "rgba(240,211,118,.78)" : "rgba(35,45,34,.52)");
    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.moveTo(x - bodyW * 0.62, y - bodyH * 0.42);
    ctx.lineTo(x, y - bodyH * 0.98);
    ctx.lineTo(x + bodyW * 0.62, y - bodyH * 0.42);
    ctx.closePath();
    ctx.fill();
    if (!repaired) {
      ctx.strokeStyle = locked ? "rgba(235,235,220,.34)" : "rgba(49,36,24,.72)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 7 * s, y - 4 * s);
      ctx.lineTo(x - 1 * s, y + 1 * s);
      ctx.lineTo(x - 5 * s, y + 7 * s);
      ctx.stroke();
    } else {
      this.drawUiIcon(ctx, facility.icon, x, y, Math.max(10, 12 * s), false, 0.95)
        || this.drawSmallGlyph(ctx, facility.icon, x, y, "#1f7a52", 0.42 * s);
      ctx.fillStyle = "#f0d376";
      ctx.fillRect(x + bodyW * 0.36, y - bodyH * 1.30, Math.max(1, s), 10 * s);
      ctx.beginPath();
      ctx.moveTo(x + bodyW * 0.38, y - bodyH * 1.30);
      ctx.lineTo(x + bodyW * 0.70, y - bodyH * 1.12);
      ctx.lineTo(x + bodyW * 0.38, y - bodyH * 0.94);
      ctx.closePath();
      ctx.fill();
    }
    if (!fast && facility.mapLabelVisible !== false) {
      const label = repaired ? `${facility.short}✓` : facility.short;
      const labelW = Math.max(46, Math.min(86, label.length * 10 + 16));
      const labelX = x - labelW / 2;
      const labelY = y + 12 * s;
      this.roundRect(ctx, labelX, labelY + 2, labelW, 20, 8, "rgba(28,35,24,.12)");
      this.roundRect(ctx, labelX, labelY, labelW, 20, 8, "rgba(255,250,225,.82)", repaired ? "rgba(80,126,83,.42)" : "rgba(83,91,67,.34)");
      this.text(ctx, label, x, labelY + 14, 10, "#2d4636", "700", "center");
      this.renderedMapFacilityLabels.push({ id: facility.id, label, x: labelX, y: labelY, w: labelW, h: 20, size: 10, status: repaired ? "repaired" : "locked", style: "grounded", spriteSize: bodyW });
    }
    ctx.restore();
  }

  openReserveFacilityDetail(facilityId) {
    normalizeCollectionState(this.state);
    const facility = facilityStates(this.state).find((entry) => entry.id === facilityId) || facilityById(facilityId);
    if (!facility || facility.concealed) return;
    const repaired = facility.status === "repaired";
    const locked = facility.status === "locked";
    const endingText = facility.ending && (facility.ending.outcome || facility.ending.name);
    if (repaired) {
      this.infoDetailModal = {
        kind: "facilityConstruction",
        kicker: facility.buildStage >= 3 ? "我的保护区 · 永久设施" : facility.buildStage >= 2 ? "我的保护区 · 选择专精" : "我的保护区 · 亲手建设",
        title: facility.buildStage >= 3 && facility.specialization ? `${facility.name} · ${facility.specialization.name}` : facility.name,
        icon: facility.icon,
        facility,
        selectedSpecializationId: null,
        footer: facility.buildStage >= 3 ? "专精已生效。" : facility.buildStage >= 2 ? "选择一条设施路线。" : "还需两次建设。"
      };
      this.render();
      return;
    }
    this.infoDetailModal = {
      kicker: locked ? "保护站设施 · 尚待发现" : "保护站设施 · 待修复",
      title: facility.name,
      icon: facility.icon,
      items: [
        { tag: "设施", title: locked ? `推进到第${facility.chapter}章后展开调查` : "废弃结构已经定位，等待案件结案", body: facility.purpose },
        { tag: "对应案件", title: `${facility.caseId === "hidden" ? "隐藏档案" : `第${facility.chapter}章`} · ${facility.found}/${facility.total}`, body: endingText || "发现剧情物件并完成案件结局，先让废墟具备建设条件。" },
        { tag: "建设", title: "修复 → 建设×2 → 专精", body: "沙盘同步变化" }
      ],
      actionLabel: locked ? "" : "前往剧情发现",
      action: locked ? null : () => {
        this.infoDetailModal = null;
        this.collectionCaseId = facility.caseId;
        this.collectionPage = 0;
        this.setScreen("collection");
      },
      footer: "已发现设施会保留在沙盘；隐藏设施只有在获得对应线索后才会现身。"
    };
    this.render();
  }

  facilityMetricLabel(key) {
    const labels = { fund: "基金", safety: "安全", poacherPressure: "偷猎", ecologyScore: "生态", water: "水源", intel: "情报", business: "经营", reputation: "声誉", stability: "稳定", enforcement: "执法", "route:enforcement": "执法路线", "route:ecology": "生态路线", "route:research": "科研路线", "route:community": "共生路线" };
    return labels[key] || key;
  }

  facilityChangesText(changes, includeFund = true) {
    return (changes || []).filter((change) => includeFund || change.key !== "fund").map((change) => `${this.facilityMetricLabel(change.key)} ${change.before}→${change.after}（${this.signed(change.delta)}）`).join(" · ");
  }

  showFacilityBuildResult(result, specialized = false) {
    const facility = facilityStates(this.state).find((entry) => entry.id === result.facility.id) || result.facility;
    const fundChange = (result.changes || []).find((change) => change.key === "fund");
    this.infoDetailModal = {
      kicker: specialized ? "建设完成 · 永久定型" : "建设完成 · 沙盘已变化",
      title: specialized ? `${facility.name} · ${result.specialization.name}` : `${facility.name} · ${result.buildSteps}/2`,
      icon: facility.icon,
      items: [
        fundChange ? { tag: "投入", title: `基金 ${fundChange.before} → ${fundChange.after}（${this.signed(fundChange.delta)}）`, body: "建设资金已从唯一保护区存档扣除。" } : null,
        { tag: "数值", title: this.facilityChangesText(result.changes, false) || "设施进度 +1", body: specialized ? `${result.specialization.label}路线 +2` : "" },
        result.goalResult && result.goalResult.rewards && result.goalResult.rewards.length
          ? { tag: "目标", title: result.goalResult.rewards.map((item) => item.label).join(" · "), body: "经营目标与设施复兴进度已同步。" }
          : null,
        { tag: "可见变化", title: specialized ? "路线附件、灯光和活动痕迹已经出现" : result.stage >= 2 ? "设施已亮灯并正式运转" : "施工架、木料和建设标记已经出现", body: "关闭弹窗后镜头会回到这座设施，建设闪光会标出刚刚发生的变化。" }
      ].filter(Boolean),
      actionLabel: "回沙盘看变化",
      action: () => this.focusReserveFacility(facility.id),
      footer: specialized ? "专精不可更改。" : "可继续建设。"
    };
    this.render();
  }

  investFacilityConstruction(facilityId) {
    const beforeState = JSON.parse(JSON.stringify(this.state));
    const result = applyFacilityBuildStep(this.state, facilityId);
    if (!result.ok) return this.toast(result.error);
    const goalProgress = applyGoalProgress(beforeState, this.state, { action: "facilityBuild", now: Date.now() });
    this.state = goalProgress.state;
    result.goalResult = goalProgress;
    saveState(this.state);
    this.facilityBuildFlash = { id: facilityId, startedAt: this.animT() };
    this.playSfx("success");
    this.showFacilityBuildResult(result, false);
  }

  selectFacilitySpecialization(facilityId, routeId) {
    const modal = this.infoDetailModal;
    const facility = modal && modal.facility;
    if (!modal || modal.kind !== "facilityConstruction" || !facility || facility.id !== facilityId || (facility.buildStage || 0) !== 2) return false;
    if (!(facility.routes || []).some((route) => route.id === routeId)) return false;
    modal.selectedSpecializationId = routeId;
    this.playSfx("tap");
    this.render();
    return true;
  }

  confirmFacilitySpecialization(facilityId, routeId) {
    const beforeState = JSON.parse(JSON.stringify(this.state));
    const result = applyFacilitySpecialization(this.state, facilityId, routeId);
    if (!result.ok) return this.toast(result.error);
    const goalProgress = applyGoalProgress(beforeState, this.state, { action: "facilityBuild", now: Date.now() });
    this.state = goalProgress.state;
    result.goalResult = goalProgress;
    saveState(this.state);
    this.facilityBuildFlash = { id: facilityId, startedAt: this.animT() };
    this.playSfx("success");
    this.showFacilityBuildResult(result, true);
  }

  focusReserveFacility(facilityId) {
    const facility = facilityById(facilityId);
    this.infoDetailModal = null;
    if (!facility) return this.render();
    this.suppressNextHomeMission = true;
    this.mapZoom = 2;
    this.mapCamera = { cx: facility.x, cy: facility.y };
    this.setScreen("home");
  }

  isFastMapRender() {
    return !!(this.gesture && this.gesture.mapPan);
  }

  isSandCloseView() {
    return this.mapZoom > 0;
  }

  visibleSandAnimals(world) {
    const pool = this.sandboxAnimalRoster(world);
    const selected = pool.find((animal) => animal.id === this.speakingAnimalId);
    const scored = pool.map((animal, index) => ({
      animal,
      index,
      score: this.mapAnimalPriority(animal, world, selected)
    }));
    scored.sort((a, b) => b.score - a.score || String(a.animal.id).localeCompare(String(b.animal.id)));
    return scored.map((entry) => entry.animal);
  }

  mapAnimalVisualGroupCounts(animals = [], reserve = {}) {
    const counts = {};
    const maxActors = Math.max(18, Math.min(28, 18 + Math.floor(animals.length / 2)));
    let extrasLeft = Math.max(0, maxActors - animals.length);
    const entries = animals.map((animal, index) => {
      const speciesEntry = Object.keys(SPECIES_DB).map((id) => SPECIES_DB[id]).find((entry) => entry && entry.name === animal.species);
      const population = speciesEntry ? speciesPopulation(reserve, speciesEntry.id) : 1;
      const desired = population >= 40 ? 3 : population >= 8 ? 2 : 1;
      const priority = this.mapAnimalPriority(animal, this.state.world || {}, null) + Math.min(200, population) - index;
      counts[animal.id] = 1;
      return { animal, population, desired, priority };
    }).sort((a, b) => b.priority - a.priority);
    [2, 3].forEach((targetCount) => {
      entries.forEach((entry) => {
        if (extrasLeft <= 0 || entry.desired < targetCount || counts[entry.animal.id] >= targetCount) return;
        counts[entry.animal.id] += 1;
        extrasLeft -= 1;
      });
    });
    return counts;
  }

  sandboxAnimalRoster(world = {}) {
    const reserve = world.reserve || {};
    const level = Math.max(1, Math.min(5, Math.round(((reserve.progression || {}).level) || 1)));
    const current = (world.knownCharacters || []).filter((animal) => animal && animal.species);
    return getUnlockedSpecies(level).map((species) => {
      const existing = current.find((animal) => animal.species === species.name);
      if (existing) return existing;
      const representative = species.representative || {};
      return {
        id: `sandbox_${species.id}`,
        name: `${representative.name || species.name}${species.name}`,
        shortName: representative.name || species.name,
        species: species.name,
        title: species.description,
        cartoonLook: species.description,
        location: "中央混交林",
        rank: species.tier || 1,
        publicState: representative.quote || "正在观察保护区变化",
        personality: species.description,
        wisdom: `${species.name}会根据保护区等级与生态环境决定是否出现。`,
        memory: [],
        intent: { type: "move", label: representative.quote || "观察保护区", targetRegionId: "center", certainty: "confirmed", stance: "open" },
        relation: { trust: 40, threat: Math.min(90, (species.tier || 1) * 14) }
      };
    });
  }

  isAnimalEventHighlight(animal, world) {
    const regionId = this.mapAnimalRegionId(animal, world);
    const events = this.activeSandboxMapEvents(world);
    return events.slice(-3).some((event) => event && event.regionId === regionId);
  }

  activeSandboxMapEvents(world = this.state.world || {}) {
    const reserve = world.reserve || {};
    const view = (world.reserveView && Array.isArray(world.reserveView.mapMarkers))
      ? world.reserveView
      : (reserve.reserveView && Array.isArray(reserve.reserveView.mapMarkers) ? reserve.reserveView : null);
    const currentDay = Math.max(1, Number(world.day) || 1);
    const lead = reserve.animalPatrolLead;
    const events = [];
    if (lead && currentDay <= Number(lead.expiresDay || currentDay)) events.push(lead);
    ((view && view.mapMarkers) || []).forEach((event) => {
      if (!event || events.some((entry) => entry.id && entry.id === event.id)) return;
      events.push(event);
    });
    return events.slice(0, 8);
  }

  mapAnimalPriority(animal, world, selected) {
    if (!animal) return -999;
    const reserve = (world && world.reserve) || {};
    const ecology = reserve.ecology || {};
    const latest = this.activeSandboxMapEvents(world).slice(-5);
    const regionId = this.mapAnimalRegionId(animal, world);
    const eventHit = latest.some((event) => event && event.regionId === regionId);
    const daily = world && world.goals && world.goals.daily;
    const dailyText = daily ? JSON.stringify(daily) : "";
    const storyHit = this.mapAnimalStoryMatch(animal, dailyText, latest);
    const waterLow = (ecology.water || 0) < 50;
    const poacherHigh = (reserve.poacherPressure || 0) > 45;
    const diseaseHigh = (ecology.disease || 0) > 26;
    const grassLow = (ecology.grass || 0) < 50;
    const waterSpecies = ["水貂", "河马", "鳄鱼", "火烈鸟"].indexOf(animal.species) >= 0;
    const poacherSpecies = ["鹿", "斑马", "羚羊", "乌鸦"].indexOf(animal.species) >= 0;
    const ecologyHit = (waterLow && waterSpecies) || (poacherHigh && poacherSpecies) || (diseaseHigh && ["鹿", "羚羊", "斑马"].indexOf(animal.species) >= 0) || (grassLow && this.isGrazerSpecies(animal.species));
    let score = 100 - (animal.isMapSighting ? 4 : 0) - (animal.id ? String(animal.id).length / 1000 : 0);
    if (selected && animal.id === selected.id) score += 10000;
    if (eventHit) score += 500;
    if (storyHit) score += 260;
    if (ecologyHit) score += 140;
    if (animal.intent && animal.intent.certainty === "confirmed") score += 22;
    return score;
  }

  mapAnimalStoryMatch(animal, dailyText, events) {
    const species = animal.species || "";
    const keywords = {
      鹿: ["鹿", "幼鹿", "水边", "脚印"],
      乌鸦: ["乌鸦", "树冠", "脚印", "情报"],
      水貂: ["水", "湖", "鱼", "浅滩"],
      河马: ["水", "河岸", "饮水"],
      鳄鱼: ["水", "河岸", "脚印"],
      火烈鸟: ["水", "湖", "水鸟"],
      斑马: ["斑马", "草场", "水源"],
      羚羊: ["羚羊", "草场", "队尾"],
      狼: ["狼", "猎犬", "鹿群", "追踪"],
      野犬: ["猎犬", "野犬", "脚印", "追踪"]
    }[species] || [species];
    const text = `${dailyText} ${(events || []).slice(-3).map((event) => `${event.label || ""} ${event.body || ""}`).join(" ")}`;
    return keywords.some((keyword) => keyword && text.indexOf(keyword) >= 0);
  }

  mapAnimalRegionId(animal, world) {
    const regions = (world && world.regions) || [];
    const target = animal && animal.intent && animal.intent.targetRegionId;
    if (target && regions.some((region) => region.id === target)) return target;
    const byName = regions.find((region) => region.name === (animal && animal.location));
    if (byName) return byName.id;
    const speciesRegion = {
      鹿: "meadow", 羚羊: "meadow", 野兔: "meadow", 斑马: "meadow", 野猪: "meadow",
      狼: "center", 乌鸦: "north", 熊: "rocks", 水貂: "lake", 河马: "river", 鳄鱼: "river", 火烈鸟: "lake",
      鹰: "river", 秃鹫: "rocks", 野犬: "meadow", 长颈鹿: "north", 大象: "river", 狮子: "meadow", 豹子: "center", 猫头鹰: "north", 狐狸: "center"
    };
    if (speciesRegion[animal && animal.species]) return speciesRegion[animal.species];
    return regions[0] && regions[0].id;
  }

  animalMapLayoutPosition(animal, index, animals) {
    let base = this.animalMapPosition(animal, index);
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const season = ((reserve.seasonDynamics || {}).season) || world.season || "雨季";
    if (season === "旱季") {
      const waterPoints = [[0.24, 0.69], [0.72, 0.43]];
      const target = waterPoints[Math.abs(this.hashString(`${animal.id || animal.species}|water`)) % waterPoints.length];
      const waterSpecies = ["水貂", "河马", "鳄鱼", "火烈鸟"].includes(animal.species);
      const weight = waterSpecies ? 0.72 : this.isGrazerSpecies(animal.species) ? 0.58 : this.isPredatorSpecies(animal.species) ? 0.40 : 0.22;
      base = { x: base.x * (1 - weight) + target[0] * weight, y: base.y * (1 - weight) + target[1] * weight };
    }
    const regionId = this.mapAnimalRegionId(animal, world);
    const group = (animals || []).filter((item) => this.mapAnimalRegionId(item, world) === regionId).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const rank = Math.max(0, group.findIndex((item) => item.id === animal.id));
    if (group.length <= 1 || rank < 0) return base;
    const ring = Math.floor(rank / 6);
    const slot = rank % 6;
    const angle = -Math.PI / 2 + (slot / 6) * Math.PI * 2 + (ring % 2) * 0.24;
    const kind = this.animalMotionProfile(animal.species).kind;
    const radiusX = 0.026 + ring * 0.014;
    const radiusY = 0.020 + ring * 0.010;
    const lift = kind === "air" ? -0.024 : kind === "water" ? 0.008 : 0;
    return {
      x: Math.max(0.055, Math.min(0.945, base.x + Math.cos(angle) * radiusX)),
      y: Math.max(0.075, Math.min(0.915, base.y + Math.sin(angle) * radiusY + lift))
    };
  }

  animalMapPosition(animal, index) {
    const regions = (this.state.world && this.state.world.regions) || [];
    const byId = (id) => regions.find((region) => region.id === id);
    const byName = (name) => regions.find((region) => region.name === name);
    const intentRegion = animal.intent && animal.intent.targetRegionId ? byId(animal.intent.targetRegionId) : null;
    const homeRegion = byName(animal.location);
    const savannaAnchors = {
      鹿: [0.23, 0.66],
      狼: [0.42, 0.55],
      乌鸦: [0.17, 0.34],
      熊: [0.31, 0.36],
      水貂: [0.24, 0.70],
      河马: [0.66, 0.48],
      狮子: [0.58, 0.84],
      豹子: [0.91, 0.57],
      鳄鱼: [0.69, 0.36],
      火烈鸟: [0.75, 0.42],
      鹰: [0.62, 0.25],
      秃鹫: [0.27, 0.30],
      野犬: [0.46, 0.43],
      斑马: [0.49, 0.72],
      羚羊: [0.35, 0.76],
      长颈鹿: [0.86, 0.25],
      大象: [0.62, 0.62],
      狐狸: [0.36, 0.50],
      野兔: [0.20, 0.80],
      野猪: [0.29, 0.72],
      猫头鹰: [0.14, 0.45],
      刺猬: [0.32, 0.34]
    };
    const savannaSightingAnchors = {
      鹿: [[0.23, 0.66], [0.34, 0.75], [0.52, 0.68]],
      斑马: [[0.49, 0.72], [0.61, 0.66], [0.42, 0.82]],
      羚羊: [[0.35, 0.76], [0.44, 0.62], [0.72, 0.73]],
      河马: [[0.66, 0.48], [0.79, 0.40]],
      鳄鱼: [[0.69, 0.36], [0.74, 0.48]],
      火烈鸟: [[0.75, 0.42], [0.82, 0.45]],
      鹰: [[0.62, 0.25], [0.50, 0.34]],
      秃鹫: [[0.27, 0.30], [0.34, 0.40]],
      野犬: [[0.46, 0.43], [0.39, 0.57]],
      狼: [[0.42, 0.55], [0.31, 0.46]],
      大象: [[0.62, 0.62], [0.56, 0.48]]
    };
    const sightingSet = savannaSightingAnchors[animal.species];
    const sightingIndex = animal.isMapSighting ? animal.mapSightingIndex || 1 : 0;
    const anchor = sightingSet ? sightingSet[sightingIndex % sightingSet.length] : savannaAnchors[animal.species];
    if (anchor) {
      const day = (this.state.world && this.state.world.day) || 1;
      const driftSeed = index + sightingIndex * 3.7;
      const driftX = Math.sin(day * 0.41 + driftSeed * 1.7) * 0.010;
      const driftY = Math.cos(day * 0.37 + driftSeed * 1.3) * 0.010;
      const target = intentRegion ? [intentRegion.x, intentRegion.y] : anchor;
      const intentWeight = animal.isMapSighting ? 0.08 : 0.18;
      const x = anchor[0] * (1 - intentWeight) + target[0] * intentWeight + driftX;
      const y = anchor[1] * (1 - intentWeight) + target[1] * intentWeight + driftY;
      return {
        x: Math.max(0.06, Math.min(0.94, x)),
        y: Math.max(0.08, Math.min(0.90, y))
      };
    }
    const speciesRegion = {
      鹿: byId("meadow"),
      狼: byId("center"),
      乌鸦: byId("north"),
      熊: byId("rocks"),
      水貂: byId("lake"),
      河马: byId("river"),
      狮子: byId("meadow"),
      豹子: byId("center"),
      鳄鱼: byId("river"),
      火烈鸟: byId("lake"),
      鹰: byId("river"),
      秃鹫: byId("rocks"),
      野犬: byId("meadow"),
      斑马: byId("meadow"),
      羚羊: byId("meadow"),
      长颈鹿: byId("north"),
      大象: byId("river"),
      狐狸: byId("center"),
      野兔: byId("meadow"),
      野猪: byId("meadow"),
      猫头鹰: byId("north"),
      刺猬: byId("rocks")
    }[animal.species];
    const region = intentRegion || speciesRegion || homeRegion || regions[index % Math.max(1, regions.length)] || { x: 0.5, y: 0.5 };
    const habits = {
      鹿: [0.02, 0.035],
      狼: [-0.035, 0.005],
      乌鸦: [-0.015, -0.045],
      熊: [-0.045, 0.02],
      水貂: [0.045, 0.02],
      河马: [0.015, 0.03],
      狮子: [-0.075, 0.018],
      豹子: [0.055, -0.045],
      鳄鱼: [0.035, 0.045],
      火烈鸟: [0.045, -0.015],
      鹰: [0.03, -0.08],
      秃鹫: [-0.02, -0.075],
      野犬: [-0.04, -0.03],
      斑马: [0.07, 0.025],
      羚羊: [0.035, -0.055],
      长颈鹿: [0.065, -0.02],
      大象: [-0.07, 0.035],
      狐狸: [0.035, -0.02],
      野兔: [-0.045, 0.045],
      野猪: [-0.025, 0.035],
      猫头鹰: [0.03, -0.05],
      刺猬: [0.02, 0.04]
    };
    const offset = habits[animal.species] || [((index % 3) - 1) * 0.028, (Math.floor(index / 3) - 0.5) * 0.028];
    const drift = Math.sin((this.state.world.day || 1) * 0.7 + index) * 0.012;
    return {
      x: Math.max(0.05, Math.min(0.95, region.x + offset[0] + drift)),
      y: Math.max(0.05, Math.min(0.95, region.y + offset[1] - drift * 0.6))
    };
  }

  movingAnimalPosition(animal, index, basePosition, options = {}) {
    const key = this.animalMotionKey(animal, index);
    const now = this.animT();
    const base = basePosition || this.animalMapPosition(animal, index);
    const rawProfile = this.animalMotionProfile(animal.species);
    const reserve = (this.state.world && this.state.world.reserve) || {};
    const range = ((reserve.seasonDynamics || {}).activityRange) || ((this.state.world || {}).season === "雨季" ? 1.35 : 0.62);
    const profile = Object.assign({}, rawProfile, { rx: rawProfile.rx * range, ry: rawProfile.ry * range });
    const paused = this.isAnimalMapMotionPaused(options);
    let state = this.animalMotionStates[key];
    if (!state) {
      const seed = this.hashString(`${key}|${animal.species || ""}|${animal.location || ""}`);
      state = {
        key,
        seed,
        x: base.x,
        y: base.y,
        targetX: base.x,
        targetY: base.y,
        dirX: 0,
        dirY: 0,
        facingX: this.animalSpriteFacesRight(animal.species) ? 1 : -1,
        wait: 0,
        step: 0,
        phase: Math.abs(seed % 628) / 100,
        lastT: now
      };
      this.animalMotionStates[key] = state;
      this.chooseAnimalMotionTarget(animal, index, base, profile, state);
    }

    const dt = state.lastT !== undefined ? Math.max(0, Math.min(0.32, (now - state.lastT) / 1000)) : 0;
    state.lastT = now;
    state.homeX = base.x;
    state.homeY = base.y;

    if (!paused && dt > 0) {
      if (profile.kind === "air") {
        this.updateAirAnimalMotion(animal, index, base, profile, state, dt);
      } else {
        this.updateWalkingAnimalMotion(animal, index, base, profile, state, dt);
      }
    }

    const bob = paused ? 0 : this.animalMotionBob(profile, state, now);
    return {
      key,
      kind: profile.kind,
      x: Math.max(0.04, Math.min(0.96, state.x)),
      y: Math.max(0.06, Math.min(0.92, state.y)),
      dirX: state.dirX || 0,
      dirY: state.dirY || 0,
      facingX: state.facingX || (this.animalSpriteFacesRight(animal.species) ? 1 : -1),
      bob
    };
  }

  animalMotionKey(animal, index) {
    return `${(animal && (animal.id || animal.sourceId || animal.species)) || "animal"}_${index}`;
  }

  isAnimalMapMotionPaused(options = {}) {
    return !!(
      options.fast ||
      this.screen !== "home" ||
      this.settlementModal ||
      this.patrolTaskModal ||
      this.infoDetailModal ||
      (this.gesture && this.gesture.mapPan)
    );
  }

  animalMotionProfile(species) {
    const profiles = {
      鹰: { kind: "air", rx: 0.085, ry: 0.045, speed: 0.95, bob: 1.8 },
      秃鹫: { kind: "air", rx: 0.075, ry: 0.040, speed: 0.72, bob: 1.4 },
      乌鸦: { kind: "air", rx: 0.060, ry: 0.038, speed: 0.82, bob: 1.5 },
      猫头鹰: { kind: "air", rx: 0.048, ry: 0.030, speed: 0.55, bob: 1.0 },
      火烈鸟: { kind: "water", rx: 0.022, ry: 0.010, speed: 0.008, bob: 0.45 },
      河马: { kind: "water", rx: 0.016, ry: 0.010, speed: 0.0038, bob: 0.25 },
      鳄鱼: { kind: "water", rx: 0.020, ry: 0.008, speed: 0.0034, bob: 0.18 },
      水貂: { kind: "water", rx: 0.030, ry: 0.014, speed: 0.008, bob: 0.45 },
      大象: { kind: "ground", rx: 0.040, ry: 0.026, speed: 0.0055, bob: 0.55 },
      长颈鹿: { kind: "ground", rx: 0.038, ry: 0.026, speed: 0.006, bob: 0.55 },
      狮子: { kind: "ground", rx: 0.048, ry: 0.032, speed: 0.008, bob: 0.8 },
      豹子: { kind: "ground", rx: 0.052, ry: 0.032, speed: 0.010, bob: 0.7 },
      狼: { kind: "ground", rx: 0.052, ry: 0.034, speed: 0.010, bob: 0.8 },
      野犬: { kind: "ground", rx: 0.058, ry: 0.035, speed: 0.013, bob: 0.9 },
      鹿: { kind: "ground", rx: 0.056, ry: 0.035, speed: 0.011, bob: 0.8 },
      斑马: { kind: "ground", rx: 0.060, ry: 0.035, speed: 0.010, bob: 0.8 },
      羚羊: { kind: "ground", rx: 0.066, ry: 0.038, speed: 0.014, bob: 1.0 }
    };
    return profiles[species] || { kind: "ground", rx: 0.046, ry: 0.030, speed: 0.009, bob: 0.7 };
  }

  updateAirAnimalMotion(animal, index, base, profile, state, dt) {
    const env = this.animalMotionEnvironment();
    const bias = this.animalMotionBias(animal, base, env, 0.65);
    const speed = profile.speed * (env.poachers > 55 ? 1.18 : 1);
    state.phase += dt * speed;
    const oldX = state.x;
    const oldY = state.y;
    const seed = state.seed + index * 11;
    const orbitX = Math.sin(state.phase + seed * 0.013) * profile.rx;
    const orbitY = Math.cos(state.phase * 0.78 + seed * 0.017) * profile.ry;
    const glideX = Math.sin(state.phase * 0.37 + seed * 0.019) * profile.rx * 0.22;
    const glideY = Math.cos(state.phase * 0.43 + seed * 0.023) * profile.ry * 0.18;
    state.x = this.clampAnimalWorldX(base.x + bias.x + orbitX + glideX);
    state.y = this.clampAnimalWorldY(base.y + bias.y + orbitY + glideY);
    state.dirX = state.x - oldX;
    state.dirY = state.y - oldY;
    this.updateAnimalFacing(state);
  }

  updateWalkingAnimalMotion(animal, index, base, profile, state, dt) {
    if (state.wait > 0) {
      state.wait = Math.max(0, state.wait - dt);
      // Waiting animals must stop stepping/bobbing instead of retaining the
      // previous frame vector and appearing to slide in place.
      state.dirX = 0;
      state.dirY = 0;
      return;
    }
    const dx = state.targetX - state.x;
    const dy = state.targetY - state.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.004) {
      state.x = state.targetX;
      state.y = state.targetY;
      state.wait = this.animalMotionWait(animal, profile, state);
      state.dirX = 0;
      state.dirY = 0;
      this.chooseAnimalMotionTarget(animal, index, base, profile, state);
      return;
    }
    const env = this.animalMotionEnvironment();
    const speed = profile.speed * (env.poachers > 55 ? 1.2 : 1) * ((env.migrationDelta || 0) < 0 ? 1.12 : 1);
    const step = Math.min(dist, speed * dt);
    const oldX = state.x;
    const oldY = state.y;
    state.x = this.clampAnimalWorldX(state.x + dx / dist * step);
    state.y = this.clampAnimalWorldY(state.y + dy / dist * step);
    state.dirX = state.x - oldX;
    state.dirY = state.y - oldY;
    this.updateAnimalFacing(state);
  }

  chooseAnimalMotionTarget(animal, index, base, profile, state) {
    const env = this.animalMotionEnvironment();
    const bias = this.animalMotionBias(animal, base, env, 1);
    const seed = state.seed + state.step * 37 + index * 13;
    const rx = (this.motionNoise(seed) * 2 - 1) * profile.rx;
    const ry = (this.motionNoise(seed + 17) * 2 - 1) * profile.ry;
    state.step += 1;
    state.targetX = this.clampAnimalWorldX(base.x + bias.x + rx);
    state.targetY = this.clampAnimalWorldY(base.y + bias.y + ry);
    const targetDx = state.targetX - state.x;
    // Select the new facing direction as soon as the destination changes, so
    // the first walking frame cannot briefly move backwards. Tiny vertical
    // moves retain the last stable direction to avoid left/right flicker.
    if (Math.abs(targetDx) >= 0.00001) state.facingX = targetDx > 0 ? 1 : -1;
  }

  updateAnimalFacing(state) {
    if (!state || Math.abs(Number(state.dirX) || 0) < 0.00001) return;
    state.facingX = state.dirX > 0 ? 1 : -1;
  }

  animalMotionCollisionSize(animal, camera, groupCount = 1) {
    const cameraScale = (camera && camera.scale) || 1;
    const closeView = this.isSandCloseView();
    const renderScale = cameraScale * (closeView ? 0.50 : 0.42);
    const bodySize = this.animalVisualSize((animal && animal.species) || "") * renderScale * 1.28;
    // Atlas cells contain transparent margins. These dimensions describe the
    // visible body rather than the full 128px cell, with a small comfort gap.
    const groupWidthScale = groupCount >= 2 ? 1.96 : 0.68;
    return {
      w: Math.max(28 * cameraScale, bodySize * groupWidthScale + 7 * cameraScale),
      h: Math.max(24 * cameraScale, bodySize * 0.56 + 6 * cameraScale)
    };
  }

  resolveAnimalMotionOverlaps(placements = [], camera = {}) {
    if (!Array.isArray(placements) || placements.length < 2) return placements;
    const worldW = Math.max(1, (camera.worldW || camera.worldSize || camera.w || 1) * (camera.scale || 1));
    const worldH = Math.max(1, (camera.worldH || camera.worldSize || camera.h || 1) * (camera.scale || 1));
    const sizes = placements.map((placement) => this.animalMotionCollisionSize(placement.animal, camera, placement.groupCount || 1));
    const epsilon = 0.8;

    // A small fixed iteration cap keeps rendering deterministic and cheap.
    // Separating on the least-overlapped screen axis produces natural lanes
    // instead of animals repelling each other across their habitats.
    for (let pass = 0; pass < 24; pass += 1) {
      let changed = false;
      for (let i = 0; i < placements.length; i += 1) {
        const a = placements[i];
        if (!a || !a.motion) continue;
        for (let j = i + 1; j < placements.length; j += 1) {
          const b = placements[j];
          if (!b || !b.motion) continue;
          const dx = (b.motion.x - a.motion.x) * worldW;
          const dy = (b.motion.y - a.motion.y) * worldH;
          const minX = (sizes[i].w + sizes[j].w) / 2;
          const minY = (sizes[i].h + sizes[j].h) / 2;
          const overlapX = minX - Math.abs(dx);
          const overlapY = minY - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;

          const separateX = overlapX / minX <= overlapY / minY;
          const tie = ((this.hashString(`${a.motion.key}|${b.motion.key}`) & 1) ? 1 : -1);
          if (separateX) {
            const direction = Math.abs(dx) > 0.01 ? Math.sign(dx) : tie;
            const delta = (overlapX / 2 + epsilon) / worldW;
            a.motion.x = this.clampAnimalWorldX(a.motion.x - direction * delta);
            b.motion.x = this.clampAnimalWorldX(b.motion.x + direction * delta);
            const stateA = this.animalMotionStates[a.motion.key];
            const stateB = this.animalMotionStates[b.motion.key];
            if (stateA && a.motion.kind !== "air") {
              stateA.targetX = this.clampAnimalWorldX(a.motion.x - direction * Math.max(0.008, delta));
              stateA.facingX = -direction;
              a.motion.facingX = stateA.facingX;
            }
            if (stateB && b.motion.kind !== "air") {
              stateB.targetX = this.clampAnimalWorldX(b.motion.x + direction * Math.max(0.008, delta));
              stateB.facingX = direction;
              b.motion.facingX = stateB.facingX;
            }
          } else {
            const direction = Math.abs(dy) > 0.01 ? Math.sign(dy) : tie;
            const delta = (overlapY / 2 + epsilon) / worldH;
            a.motion.y = this.clampAnimalWorldY(a.motion.y - direction * delta);
            b.motion.y = this.clampAnimalWorldY(b.motion.y + direction * delta);
            const stateA = this.animalMotionStates[a.motion.key];
            const stateB = this.animalMotionStates[b.motion.key];
            if (stateA && a.motion.kind !== "air") stateA.targetY = this.clampAnimalWorldY(a.motion.y - direction * Math.max(0.008, delta));
            if (stateB && b.motion.kind !== "air") stateB.targetY = this.clampAnimalWorldY(b.motion.y + direction * Math.max(0.008, delta));
          }
          const stateA = this.animalMotionStates[a.motion.key];
          const stateB = this.animalMotionStates[b.motion.key];
          if (stateA) { stateA.x = a.motion.x; stateA.y = a.motion.y; }
          if (stateB) { stateB.x = b.motion.x; stateB.y = b.motion.y; }
          a.motion.separated = true;
          b.motion.separated = true;
          changed = true;
        }
      }
      if (!changed) break;
    }
    return placements;
  }

  animalPlacementOverlapCount(placements = [], camera = {}) {
    if (!Array.isArray(placements) || placements.length < 2) return 0;
    const worldW = Math.max(1, (camera.worldW || camera.worldSize || camera.w || 1) * (camera.scale || 1));
    const worldH = Math.max(1, (camera.worldH || camera.worldSize || camera.h || 1) * (camera.scale || 1));
    const sizes = placements.map((placement) => this.animalMotionCollisionSize(placement.animal, camera, placement.groupCount || 1));
    let count = 0;
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        const a = placements[i] && placements[i].motion;
        const b = placements[j] && placements[j].motion;
        if (!a || !b) continue;
        const dx = Math.abs(b.x - a.x) * worldW;
        const dy = Math.abs(b.y - a.y) * worldH;
        if (dx < (sizes[i].w + sizes[j].w) / 2 - 0.25
          && dy < (sizes[i].h + sizes[j].h) / 2 - 0.25) count += 1;
      }
    }
    return count;
  }

  animalFacilityCollisionSize(camera = {}) {
    const scale = (camera && camera.scale) || 1;
    return { w: 62 * scale, h: 78 * scale };
  }

  resolveAnimalFacilityOverlaps(placements = [], camera = {}, facilities = []) {
    if (!Array.isArray(placements) || !placements.length || !Array.isArray(facilities) || !facilities.length) return placements;
    const scale = (camera && camera.scale) || 1;
    const worldW = Math.max(1, (camera.worldW || camera.worldSize || camera.w || 1) * scale);
    const worldH = Math.max(1, (camera.worldH || camera.worldSize || camera.h || 1) * scale);
    const obstacle = this.animalFacilityCollisionSize(camera);
    const sizes = placements.map((placement) => this.animalMotionCollisionSize(placement.animal, camera, placement.groupCount || 1));
    const epsilon = 2;

    placements.forEach((placement, index) => {
      if (!placement || !placement.motion) return;
      facilities.forEach((facility) => {
        if (!facility || !Number.isFinite(Number(facility.x)) || !Number.isFinite(Number(facility.y))) return;
        const dx = (placement.motion.x - Number(facility.x)) * worldW;
        const dy = (placement.motion.y - Number(facility.y)) * worldH;
        const minX = (sizes[index].w + obstacle.w) / 2;
        const minY = (sizes[index].h + obstacle.h) / 2;
        const overlapX = minX - Math.abs(dx);
        const overlapY = minY - Math.abs(dy);
        if (overlapX <= 0 || overlapY <= 0) return;

        const state = this.animalMotionStates[placement.motion.key];
        const tie = (this.hashString(`${placement.motion.key}|${facility.id || "facility"}`) & 1) ? 1 : -1;
        if (overlapX / minX <= overlapY / minY) {
          const direction = Math.abs(dx) > 0.01 ? Math.sign(dx) : tie;
          const delta = (overlapX + epsilon) / worldW;
          placement.motion.x = this.clampAnimalWorldX(placement.motion.x + direction * delta);
          if (placement.motion.kind !== "air") placement.motion.facingX = direction;
          if (state) {
            state.x = placement.motion.x;
            state.targetX = this.clampAnimalWorldX(placement.motion.x + direction * Math.max(0.012, delta * .35));
            if (placement.motion.kind !== "air") state.facingX = direction;
          }
        } else {
          const direction = Math.abs(dy) > 0.01 ? Math.sign(dy) : tie;
          const delta = (overlapY + epsilon) / worldH;
          placement.motion.y = this.clampAnimalWorldY(placement.motion.y + direction * delta);
          if (state) {
            state.y = placement.motion.y;
            state.targetY = this.clampAnimalWorldY(placement.motion.y + direction * Math.max(0.012, delta * .35));
          }
        }
        placement.motion.avoidedFacility = facility.id || true;
      });
    });
    return placements;
  }

  animalFacilityOverlapCount(placements = [], camera = {}, facilities = []) {
    if (!Array.isArray(placements) || !Array.isArray(facilities)) return 0;
    const scale = (camera && camera.scale) || 1;
    const worldW = Math.max(1, (camera.worldW || camera.worldSize || camera.w || 1) * scale);
    const worldH = Math.max(1, (camera.worldH || camera.worldSize || camera.h || 1) * scale);
    const obstacle = this.animalFacilityCollisionSize(camera);
    let count = 0;
    placements.forEach((placement) => {
      if (!placement || !placement.motion) return;
      const size = this.animalMotionCollisionSize(placement.animal, camera, placement.groupCount || 1);
      facilities.forEach((facility) => {
        if (!facility || !Number.isFinite(Number(facility.x)) || !Number.isFinite(Number(facility.y))) return;
        const dx = Math.abs(placement.motion.x - Number(facility.x)) * worldW;
        const dy = Math.abs(placement.motion.y - Number(facility.y)) * worldH;
        if (dx < (size.w + obstacle.w) / 2 - .25 && dy < (size.h + obstacle.h) / 2 - .25) count += 1;
      });
    });
    return count;
  }

  animalMotionBias(animal, base, env, weight) {
    const species = animal.species;
    let x = 0;
    let y = 0;
    if (env.poachers > 55) {
      x += (base.x < 0.5 ? -0.030 : 0.030) * weight;
      y += (base.y < 0.5 ? -0.018 : 0.018) * weight;
    }
    if (env.water < 45 && this.isGrazerSpecies(species)) {
      x += (0.70 - base.x) * 0.12 * weight;
      y += (0.48 - base.y) * 0.10 * weight;
    }
    if (env.water < 45 && (species === "河马" || species === "鳄鱼" || species === "水貂" || species === "火烈鸟")) {
      x += (0.72 - base.x) * 0.08 * weight;
      y += (0.43 - base.y) * 0.07 * weight;
    }
    if ((env.migrationDelta || 0) > 0 && this.isGrazerSpecies(species)) {
      x += (0.52 - base.x) * 0.08 * weight;
      y += (0.58 - base.y) * 0.08 * weight;
    }
    if ((env.migrationDelta || 0) < 0 && this.isGrazerSpecies(species)) {
      x += (base.x < 0.5 ? -0.036 : 0.036) * weight;
      y += (base.y < 0.5 ? -0.026 : 0.026) * weight;
    }
    return { x, y };
  }

  animalMotionEnvironment() {
    const reserve = (this.state.world && this.state.world.reserve) || {};
    const ecology = reserve.ecology || {};
    const migration = reserve.migration || {};
    return {
      water: ecology.water || 0,
      poachers: reserve.poacherPressure || 0,
      migrationDelta: migration.delta || 0
    };
  }

  animalMotionWait(animal, profile, state) {
    if (profile.kind === "water") return 0.45 + this.motionNoise(state.seed + state.step) * 1.2;
    if (this.isPredatorSpecies(animal.species)) return 0.7 + this.motionNoise(state.seed + state.step) * 1.6;
    return 0.25 + this.motionNoise(state.seed + state.step) * 0.9;
  }

  animalMotionBob(profile, state, now) {
    if (profile.kind === "air") return Math.sin(state.phase * 2.2) * profile.bob;
    const moving = Math.abs(state.dirX || 0) + Math.abs(state.dirY || 0) > 0.00008;
    if (!moving) return 0;
    return Math.sin(now * 0.018 + state.seed) * profile.bob;
  }

  motionNoise(seed) {
    const raw = Math.sin(seed * 12.9898) * 43758.5453;
    return raw - Math.floor(raw);
  }

  clampAnimalWorldX(x) {
    return Math.max(0.045, Math.min(0.955, x));
  }

  clampAnimalWorldY(y) {
    return Math.max(0.065, Math.min(0.915, y));
  }

  isGrazerSpecies(species) {
    return ["鹿", "斑马", "羚羊", "长颈鹿", "大象", "河马", "野兔", "野猪"].indexOf(species) >= 0;
  }

  isPredatorSpecies(species) {
    return ["狼", "狮子", "豹子", "鳄鱼", "野犬", "水貂"].indexOf(species) >= 0;
  }

  pruneAnimalMotionStates(activeKeys) {
    const active = {};
    (activeKeys || []).forEach((key) => { if (key) active[key] = true; });
    Object.keys(this.animalMotionStates || {}).forEach((key) => {
      if (!active[key]) delete this.animalMotionStates[key];
    });
  }

  drawGroundedAnimal(ctx, x, groundY, animal, motion, selected, closeView, camera, fast, dialogue, showBubble = false, groupCount = 1) {
    const cameraScale = camera.scale || 1;
    // 沙盘首先要让玩家一眼认出具体物种。无论远近都绘制完整动物，
    // 近景进一步放大；不再退化为小圆点、文字徽章或抽象线稿。
    const animalScale = cameraScale * (closeView ? 0.50 : 0.42);
    const metrics = this.groundedAnimalRenderMetrics(animal, motion, groundY, animalScale, cameraScale, closeView, fast);
    if (!fast) this.drawAnimalGroundCue(ctx, x, metrics.groundY, motion, animal, selected, cameraScale);
    if (!fast && selected) {
      const radius = closeView ? 17 * cameraScale : 11 * cameraScale;
      this.drawSelectionPulse(ctx, x, metrics.groundY - 12 * cameraScale, radius, "#f0d376");
    }
    if (!fast && groupCount > 1) {
      const companionScale = animalScale * .76;
      const bodySize = this.animalVisualSize(animal.species) * animalScale * 1.28;
      const companionGap = Math.max(27 * cameraScale, bodySize * .78);
      const offsets = this.animalGroupRenderOffsets(x, groupCount, companionGap, bodySize, cameraScale, camera);
      offsets.forEach((offset) => {
        ctx.save();
        ctx.globalAlpha = offset.alpha;
        this.drawAnimalSticker(ctx, x + offset.x, metrics.bodyY + offset.y, animal, 0.86, companionScale, false, {
          grounded: true,
          groundY: metrics.groundY,
          bodyY: metrics.bodyY + offset.y,
          facingX: motion && motion.facingX
        });
        ctx.restore();
      });
    }
    this.drawAnimalSticker(ctx, x, metrics.bodyY, animal, selected ? 1 : 0.94, animalScale, false, {
      grounded: true,
      groundY: metrics.groundY,
      bodyY: metrics.bodyY,
      facingX: motion && motion.facingX
    });
    if (!fast && showBubble) {
      this.drawAnimalMiniBubble(ctx, x, metrics.bubbleY, this.animalBubbleText(animal, dialogue), selected, cameraScale);
    }
    return metrics;
  }

  animalGroupRenderOffsets(x, groupCount, gap, bodySize, cameraScale = 1, camera = {}) {
    if (groupCount <= 1) return [];
    const companionHalf = Math.max(10 * cameraScale, bodySize * .34);
    const left = Number(camera.x) || 0;
    const right = left + (Number(camera.w) || Infinity);
    let xs = groupCount >= 3 ? [-gap, gap] : [-gap];
    const minX = x + Math.min(0, ...xs) - companionHalf;
    const maxX = x + Math.max(0, ...xs) + companionHalf;
    if (minX < left + 3) {
      xs = groupCount >= 3 ? [gap, gap * 2] : [gap];
    } else if (maxX > right - 3) {
      xs = groupCount >= 3 ? [-gap * 2, -gap] : [-gap];
    }
    return xs.map((offsetX, index) => ({
      x: offsetX,
      y: (index - (xs.length - 1) / 2) * 4 * cameraScale,
      alpha: Math.max(.68, .78 - index * .07)
    }));
  }

  groundedAnimalRenderMetrics(animal, motion, groundY, animalScale, cameraScale = 1, closeView = true, fast = false) {
    const species = (animal && animal.species) || "";
    const kind = motion && motion.kind ? motion.kind : this.animalMotionProfile(species).kind;
    const base = this.animalVisualSize(species) * animalScale * 1.28;
    const tokenSize = 28 * cameraScale * 0.28;
    const bodyOffset = closeView ? this.animalGroundCenterOffset(species, base) : tokenSize * 0.36;
    const lift = fast ? 0 : this.groundedAnimalBodyLift(kind, motion, cameraScale);
    const flight = kind === "air" ? (closeView ? 18 : 12) * cameraScale : 0;
    const bodyY = groundY - bodyOffset - flight + lift;
    const topOffset = closeView ? Math.max(24 * cameraScale, base * (kind === "air" ? 0.62 : 0.56)) : 20 * cameraScale;
    const hitSize = Math.max(48, closeView ? Math.max(58 * cameraScale, base * 1.05) : 48 * cameraScale);
    return {
      groundY,
      bodyY,
      bubbleY: bodyY - topOffset,
      hitY: (bodyY + groundY) / 2,
      hitSize,
      bodyLift: lift,
      flight,
      kind
    };
  }

  animalGroundCenterOffset(species, base) {
    if (["鳄鱼", "水貂"].indexOf(species) >= 0) return base * 0.16;
    if (["河马", "火烈鸟"].indexOf(species) >= 0) return base * 0.22;
    if (["乌鸦", "鹰", "秃鹫", "猫头鹰"].indexOf(species) >= 0) return base * 0.34;
    if (species === "长颈鹿") return base * 0.40;
    if (species === "大象") return base * 0.30;
    return base * 0.34;
  }

  groundedAnimalBodyLift(kind, motion, cameraScale) {
    const bob = (motion && motion.bob) || 0;
    if (kind === "air") return Math.max(-2.4, Math.min(2.4, bob)) * cameraScale * 0.34;
    if (kind === "water") return Math.max(-0.35, Math.min(0.35, bob * 0.12)) * cameraScale;
    return Math.max(-0.55, Math.min(0.55, bob * 0.18)) * cameraScale;
  }

  drawAnimalGroundCue(ctx, x, groundY, motion, animal, selected, scale = 1) {
    if (!motion) return;
    const dx = motion.dirX || 0;
    const dy = motion.dirY || 0;
    const moving = Math.abs(dx) + Math.abs(dy) > 0.00008;
    const kind = motion.kind || "ground";
    ctx.save();
    const shadowAlpha = selected ? 0.28 : 0.18;
    ctx.fillStyle = `rgba(26, 43, 26, ${kind === "air" ? shadowAlpha * 0.72 : shadowAlpha})`;
    ctx.beginPath();
    ctx.ellipse(x, groundY + 1 * scale, (kind === "air" ? 11 : 14) * scale, (kind === "air" ? 3.5 : 4.5) * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    if (kind === "air") {
      ctx.strokeStyle = "rgba(255, 248, 223, 0.18)";
      ctx.lineWidth = Math.max(1, 0.8 * scale);
      ctx.beginPath();
      ctx.arc(x - Math.sign(dx || 1) * 7 * scale, groundY + 1 * scale, 5 * scale, 0.1, Math.PI * 1.1);
      ctx.stroke();
      if (moving) {
        ctx.strokeStyle = "rgba(210,235,218,.13)";
        ctx.beginPath();
        ctx.moveTo(x - Math.sign(dx || 1) * 11 * scale, groundY - 9 * scale);
        ctx.quadraticCurveTo(x - Math.sign(dx || 1) * 18 * scale, groundY - 7 * scale, x - Math.sign(dx || 1) * 23 * scale, groundY - 4 * scale);
        ctx.stroke();
      }
    } else if (kind === "water") {
      ctx.strokeStyle = "rgba(138, 211, 211, 0.30)";
      ctx.lineWidth = Math.max(1, 0.8 * scale);
      ctx.beginPath();
      ctx.ellipse(x - Math.sign(dx || 1) * 4 * scale, groundY + 1 * scale, 10 * scale, 2.8 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(194,239,228,.16)";
      ctx.beginPath();
      ctx.ellipse(x - Math.sign(dx || 1) * 10 * scale, groundY + 1 * scale, 15 * scale, 4.2 * scale, 0, Math.PI * .12, Math.PI * 1.88);
      ctx.stroke();
    } else if (moving) {
      ctx.fillStyle = "rgba(108, 91, 54, 0.18)";
      [8, 15].forEach((distance, index) => {
        ctx.globalAlpha = index ? .55 : 1;
        ctx.beginPath();
        ctx.ellipse(x - Math.sign(dx || 1) * distance * scale, groundY + (index ? -1 : 2) * scale, 3.5 * scale, 1.5 * scale, -.15, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.restore();
  }

  drawAnimalMiniBubble(ctx, cx, y, text, selected, scale = 1) {
    const label = String(text || "...");
    const size = Math.max(8, Math.min(10, 9 * scale));
    const bubbleW = Math.max(42, Math.min(selected ? 88 : 72, label.length * size + 16));
    const bubbleH = selected ? 24 : 20;
    const viewport = this.mapViewport;
    const viewX = viewport ? viewport.x : -Infinity;
    const viewY = viewport ? viewport.y + (this.scrollY || 0) : -Infinity;
    const viewW = viewport ? viewport.w : Infinity;
    const viewH = viewport ? viewport.h : Infinity;
    const safeCx = Math.max(viewX + bubbleW / 2 + 2, Math.min(viewX + viewW - bubbleW / 2 - 2, cx));
    const safeY = Math.max(viewY + 2, Math.min(viewY + viewH - bubbleH - 8, y));
    const x = safeCx - bubbleW / 2;
    ctx.save();
    this.roundRect(ctx, x, safeY + 2, bubbleW, bubbleH, 8, "rgba(20,32,27,.16)");
    this.roundRect(ctx, x, safeY, bubbleW, bubbleH, 8, "rgba(255,255,255,.94)", selected ? "rgba(47,125,98,.56)" : UI_THEME.separator);
    this.text(ctx, this.truncateTextToWidth(ctx, label, bubbleW - 12, size, "700"), safeCx, safeY + (selected ? 16 : 14), size, "#26352b", "700", "center");
    ctx.fillStyle = "rgba(255,255,255,.94)";
    ctx.beginPath();
    ctx.moveTo(safeCx - 4, safeY + bubbleH - 1);
    ctx.lineTo(safeCx + 4, safeY + bubbleH - 1);
    ctx.lineTo(safeCx, safeY + bubbleH + 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  animalBubbleText(animal, context) {
    const dialogue = context || this.animalDialogueContexts[animal.id] || null;
    if (dialogue && dialogue.ordinaryMoment) {
      return this.shortGameText(dialogue.ordinaryMoment.text, 9) || "普通的一天";
    }
    const reserve = this.state.world.reserve || {};
    const ecology = reserve.ecology || {};
    const migration = reserve.migration || {};
    const water = ecology.water || 0;
    const grass = ecology.grass || 0;
    const disease = ecology.disease || 0;
    const predators = this.totalOf(ecology.predators || {});
    const herbivores = this.totalOf(ecology.herbivores || {});
    const safety = reserve.safety || reserve.stability || 0;
    const poachers = reserve.poacherPressure || 0;
    const migrationDelta = migration.delta || 0;
    const eventClue = migrationDelta >= 0 && poachers <= 50 ? this.animalEventBubbleClue(animal, dialogue) : "";
    if (eventClue) return eventClue;
    const weatherLine = dialogue && ((dialogue.click || 0) % 3 === 0)
      ? this.animalWeatherBubble(animal, dialogue)
      : "";
    if (weatherLine) return weatherLine;
    if (dialogue && dialogue.movement && dialogue.movement.label) {
      return this.shortGameText(dialogue.movement.label.replace(/^正在?/, ""), 8) || "路线在变";
    }
    if (animal.species === "鹿") {
      if ((migration.delta || 0) < 0) return dialogue ? this.dialoguePick(dialogue, "deer-b-loss", ["伙伴少了", "少了脚步声", "队伍变薄了"]) : "伙伴少了";
      if (poachers > 50) return dialogue ? this.dialoguePick(dialogue, "deer-b-poacher", ["刚逃过一回", "别踩直线脚印", "先躲进灌木"]) : "刚逃过一回";
      if (predators * 5 > herbivores) return dialogue ? this.dialoguePick(dialogue, "deer-b-pred", ["别走空地", "风里有狼味", "水边先等等"]) : "别走空地";
      if (disease > 28) return dialogue ? this.dialoguePick(dialogue, "deer-b-disease", ["幼鹿先慢点", "湿草少碰", "别挤太近"]) : "幼鹿先慢点";
      if (safety < 50) return dialogue ? this.dialoguePick(dialogue, "deer-b-safe", ["隔壁好安静", "边界在招手", "今晚想搬家"]) : "隔壁好安静";
      if (water < 45) return dialogue ? this.dialoguePick(dialogue, "deer-b-water", ["水边要排队", "两口就撤", "泥地太挤"]) : "水边要排队";
      if (grass < 48) return dialogue ? this.dialoguePick(dialogue, "deer-b-grass", ["草少省着吃", "别啃秃了", "幼鹿先吃"]) : "草少省着吃";
      if ((migration.delta || 0) > 0) return dialogue ? this.dialoguePick(dialogue, "deer-b-in", ["新邻居来了", "草场更热闹", "队伍变长了"]) : "新邻居来了";
      return dialogue ? this.dialoguePick(dialogue, "deer-b-calm", ["今天不硬刚", "低头吃草", "安静就好"]) : "今天不硬刚";
    }
    if (animal.species === "狼") {
      if ((migration.delta || 0) < 0) return dialogue ? this.dialoguePick(dialogue, "wolf-b-loss", ["猎物散了", "晚饭变难", "少跑冤枉路"]) : "猎物散了";
      if (disease > 28) return dialogue ? this.dialoguePick(dialogue, "wolf-b-disease", ["不吃怪味", "绕开病味", "鼻子说不行"]) : "不吃怪味";
      if (predators * 5 > herbivores) return dialogue ? this.dialoguePick(dialogue, "wolf-b-crowded", ["猎场别内卷", "脚印太多", "水线太挤"]) : "猎场别内卷";
      if (water < 45) return dialogue ? this.dialoguePick(dialogue, "wolf-b-water", ["水边太挤了", "埋伏点变少", "鹿会绕路"]) : "水边太挤了";
      if (safety > 70) return dialogue ? this.dialoguePick(dialogue, "wolf-b-safe", ["鹿没乱跑", "风向还行", "先压低身形"]) : "鹿没乱跑";
      return dialogue ? this.dialoguePick(dialogue, "wolf-b-normal", ["先闻再追", "风比我快", "别急着扑"]) : "先闻再追";
    }
    if (animal.species === "乌鸦") {
      if (poachers > 50) return dialogue ? this.dialoguePick(dialogue, "crow-b-poacher", ["这味道不对", "直线脚印", "坏消息上树"]) : "这味道不对";
      if ((migration.delta || 0) < 0) return dialogue ? this.dialoguePick(dialogue, "crow-b-loss", ["少了几声", "树冠变空", "回应少了"]) : "少了几声";
      if (disease > 28) return dialogue ? this.dialoguePick(dialogue, "crow-b-disease", ["坏消息上树", "别碰怪味", "我先喊一声"]) : "坏消息上树";
      if (reserve.league && reserve.league.lastRaid) return dialogue ? this.dialoguePick(dialogue, "crow-b-raid", ["战报我看了", "基地有动静", "树冠已阅"]) : "战报我看了";
      return dialogue ? this.dialoguePick(dialogue, "crow-b-normal", ["树冠有八卦", "风声变了", "下面还没懂"]) : "树冠有八卦";
    }
    if (animal.species === "熊") {
      if (poachers > 50) return dialogue ? this.dialoguePick(dialogue, "bear-b-poacher", ["洞外有人", "金属味来了", "先别出洞"]) : "洞外有人";
      if (safety < 48) return dialogue ? this.dialoguePick(dialogue, "bear-b-noisy", ["洞口别开会", "外面太吵", "少来洞边"]) : "洞口别开会";
      return dialogue ? this.dialoguePick(dialogue, "bear-b-normal", ["别吵我冬眠", "洞口还行", "矿盐点正常"]) : "别吵我冬眠";
    }
    if (animal.species === "水貂") {
      if (water < 45) return dialogue ? this.dialoguePick(dialogue, "mink-b-water", ["鱼少了", "浅滩缩水", "扑空两次"]) : "鱼少了";
      if (poachers > 50) return dialogue ? this.dialoguePick(dialogue, "mink-b-poacher", ["芦苇有脚印", "岸边不对", "贴水线躲"]) : "芦苇有脚印";
      return dialogue ? this.dialoguePick(dialogue, "mink-b-normal", ["浅滩还在线", "鱼影还在", "伏击点营业"]) : "浅滩还在线";
    }
    if (animal.species === "狮子") {
      if (poachers > 50) return dialogue ? this.dialoguePick(dialogue, "lion-b-poacher", ["鬃毛不爱枪味", "草里有人味", "狮群先卧倒"]) : "草里有人味";
      if ((migration.delta || 0) < 0) return dialogue ? this.dialoguePick(dialogue, "lion-b-loss", ["猎物队薄了", "别白跑", "黄昏再看"]) : "猎物队薄了";
      return dialogue ? this.dialoguePick(dialogue, "lion-b-normal", ["太阳归我", "先眯一会儿", "队尾有动静"]) : "太阳归我";
    }
    if (animal.species === "豹子") {
      if (poachers > 50) return dialogue ? this.dialoguePick(dialogue, "leopard-b-poacher", ["树影不干净", "尾巴先收好", "别踩干枝"]) : "树影不干净";
      return dialogue ? this.dialoguePick(dialogue, "leopard-b-normal", ["斑点在线", "等风停", "别看我尾巴"]) : "斑点在线";
    }
    if (animal.species === "鳄鱼") {
      if (water < 45) return dialogue ? this.dialoguePick(dialogue, "croc-b-water", ["水浅了", "眼睛露太多", "浅滩变窄"]) : "水浅了";
      return dialogue ? this.dialoguePick(dialogue, "croc-b-normal", ["只露眼睛", "我不急", "水面很懂我"]) : "只露眼睛";
    }
    if (animal.species === "野犬") {
      if ((migration.delta || 0) < 0) return dialogue ? this.dialoguePick(dialogue, "dog-b-loss", ["队尾散了", "少追冤路", "换条风线"]) : "队尾散了";
      return dialogue ? this.dialoguePick(dialogue, "dog-b-normal", ["小队集合", "耳朵开跑", "追风不追空"]) : "小队集合";
    }
    if (animal.species === "斑马") {
      if (poachers > 50) return dialogue ? this.dialoguePick(dialogue, "zebra-b-poacher", ["条纹别排直", "队形散开", "幼崽靠中间"]) : "队形散开";
      return dialogue ? this.dialoguePick(dialogue, "zebra-b-normal", ["条纹开会", "队尾看紧", "水边排队"]) : "条纹开会";
    }
    if (animal.species === "羚羊") {
      if (predators * 5 > herbivores) return dialogue ? this.dialoguePick(dialogue, "antelope-b-pred", ["先跳再想", "草高不妙", "眼角报警"]) : "先跳再想";
      return dialogue ? this.dialoguePick(dialogue, "antelope-b-normal", ["腿已预热", "风有点尖", "我先试跳"]) : "腿已预热";
    }
    if (animal.species === "长颈鹿") {
      return dialogue ? this.dialoguePick(dialogue, "giraffe-b-normal", ["我看得远", "树梢有消息", "尘土很直"]) : "我看得远";
    }
    if (animal.species === "大象") {
      if (water < 45) return dialogue ? this.dialoguePick(dialogue, "elephant-b-water", ["旧水路醒了吗", "幼象先喝", "记忆带路"]) : "记忆带路";
      return dialogue ? this.dialoguePick(dialogue, "elephant-b-normal", ["慢点也稳", "我记得水", "幼象跟紧"]) : "我记得水";
    }
    if (animal.species === "野兔") {
      if (poachers > 50 || predators * 5 > herbivores) return dialogue ? this.dialoguePick(dialogue, "hare-b-danger", ["洞口先等等", "鹰影压低了", "草动得太齐"]) : "洞口先等等";
      return dialogue ? this.dialoguePick(dialogue, "hare-b-normal", ["嫩草正合口", "耳朵轮班听", "再跳两步"]) : "嫩草正合口";
    }
    if (animal.species === "野猪") {
      if (poachers > 50) return dialogue ? this.dialoguePick(dialogue, "boar-b-danger", ["泥里有人味", "先拱乱脚印", "灌木别进去"]) : "泥里有人味";
      return dialogue ? this.dialoguePick(dialogue, "boar-b-normal", ["腐叶下面有货", "鼻子正在施工", "这块土能翻"]) : "鼻子正在施工";
    }
    if (animal.species === "鹰") {
      if (poachers > 50) return dialogue ? this.dialoguePick(dialogue, "eagle-b-danger", ["边界有直线", "高空看见人影", "先绕一圈"]) : "边界有直线";
      return dialogue ? this.dialoguePick(dialogue, "eagle-b-normal", ["上升气流正好", "野兔影子很清", "高处一切正常"]) : "上升气流正好";
    }
    if (animal.species === "火烈鸟") {
      if (water < 45 || disease > 28) return dialogue ? this.dialoguePick(dialogue, "flamingo-b-water", ["浅水线缩了", "今天不挤群", "脚下水太暖"]) : "浅水线缩了";
      return dialogue ? this.dialoguePick(dialogue, "flamingo-b-normal", ["浅水正好站", "小虾还在", "队形粉着呢"]) : "浅水正好站";
    }
    if (animal.species === "秃鹫") {
      if (disease > 28) return dialogue ? this.dialoguePick(dialogue, "vulture-b-disease", ["这具残骸不对", "先别落地", "病味飘上来了"]) : "先别落地";
      return dialogue ? this.dialoguePick(dialogue, "vulture-b-normal", ["高空巡检中", "残骸我来收尾", "地面很干净"]) : "高空巡检中";
    }
    if (animal.species === "猫头鹰") {
      if (poachers > 50) return dialogue ? this.dialoguePick(dialogue, "owl-b-danger", ["夜里有灯", "陌生脚步没睡", "树洞先关门"]) : "夜里有灯";
      return dialogue ? this.dialoguePick(dialogue, "owl-b-normal", ["今晚听得很清", "野兔刚经过", "树洞很安静"]) : "今晚听得很清";
    }
    if (animal.species === "河马") {
      if (water < 45) return dialogue ? this.dialoguePick(dialogue, "hippo-b-water", ["河湾挤不下", "泥水太浅", "鼻孔都藏不住"]) : "河湾挤不下";
      return dialogue ? this.dialoguePick(dialogue, "hippo-b-normal", ["泡泡位置正常", "河湾归我守", "夜里再吃草"]) : "泡泡位置正常";
    }
    if (animal.species === "狐狸") {
      if (poachers > 50) return dialogue ? this.dialoguePick(dialogue, "fox-b-danger", ["人味不划算", "尾巴先藏好", "换条边线"]) : "人味不划算";
      return dialogue ? this.dialoguePick(dialogue, "fox-b-normal", ["边缘有便宜捡", "野兔味刚路过", "我只借条路"]) : "边缘有便宜捡";
    }
    return poachers > 45 ? "先躲一躲" : "我在读空气";
  }

  animalWeatherBubble(animal, dialogue) {
    const world = (dialogue && dialogue.world) || this.state.world || {};
    const reserve = (dialogue && dialogue.reserve) || world.reserve || {};
    const ecology = reserve.ecology || {};
    const weather = world.weather || "阴";
    const season = world.season || ((reserve.seasonState || {}).name) || "雨季";
    const species = (animal && animal.species) || "动物";
    const waterSpecies = ["水貂", "鳄鱼", "河马", "火烈鸟"].includes(species);
    const herdSpecies = ["鹿", "斑马", "羚羊", "大象", "长颈鹿"].includes(species);
    const watcherSpecies = ["乌鸦", "鹰", "猫头鹰"].includes(species);
    if (season === "旱季") {
      if (waterSpecies) return this.dialoguePick(dialogue, `weather-dry-water-${species}`, ["水线又窄了", "深水边集合", "泥岸在发热"]);
      if (herdSpecies) return this.dialoguePick(dialogue, `weather-dry-herd-${species}`, ["跟着旧水路", "别挤同一口井", "盐地有脚印"]);
      return this.dialoguePick(dialogue, `weather-dry-${species}`, ["风里全是尘", "水点会很挤", "黄昏再移动"]);
    }
    if (/雨/.test(weather)) {
      if (watcherSpecies) return this.dialoguePick(dialogue, `weather-rain-watch-${species}`, ["雨把气味打散", "新河汊出现了", "低处水声变了"]);
      if (waterSpecies) return this.dialoguePick(dialogue, `weather-rain-water-${species}`, ["浅滩往外长", "新水路能走", "雨把河岸推远"]);
      return this.dialoguePick(dialogue, `weather-rain-${species}`, ["雨路变宽了", "幼崽别踩深泥", "水声盖住脚步"]);
    }
    if (weather === "雾") {
      if (watcherSpecies) return this.dialoguePick(dialogue, `weather-fog-watch-${species}`, ["雾下看不远", "先听再飞", "树影藏住路"]);
      return this.dialoguePick(dialogue, `weather-fog-${species}`, ["闻得到看不见", "别离队太远", "雾把边界抹了"]);
    }
    if (weather === "晴" && (ecology.water || 0) < 60) return "晴天会吃水";
    return "";
  }

  animalListenMoment(animal, dialogue) {
    const reserve = (dialogue && dialogue.reserve) || ((this.state.world || {}).reserve) || {};
    const ecology = reserve.ecology || {};
    const speech = this.cleanGameText(this.animalWeatherBubble(animal, dialogue) || this.animalBubbleText(animal, dialogue) || "我听见你来了");
    if ((reserve.poacherPressure || 0) > 45 || /脚印|人味|边界|枪|陷阱/.test(speech)) return { icon: "antiPoacher", text: speech, tone: "danger" };
    if ((ecology.water || 0) < 55 || /水|雨|浅滩|河|湖|泥岸/.test(speech)) return { icon: "water", text: speech, tone: "water" };
    if ((ecology.grass || 0) < 55 || /草|嫩叶|树梢/.test(speech)) return { icon: "leaf", text: speech, tone: "grass" };
    if (/路|迁|队|脚步/.test(speech)) return { icon: "migration", text: speech, tone: "migration" };
    return { icon: "eye", text: speech, tone: "calm" };
  }

  animalEventBubbleClue(animal, dialogue) {
    const event = dialogue && dialogue.relatedEvent;
    if (!event) return "";
    const text = `${event.label || ""} ${event.body || ""} ${event.impact || ""}`;
    if (/偷猎|脚印|陷阱|人影|枪|边界|警报/.test(text)) {
      return this.dialoguePick(dialogue, `map-clue-danger-${animal && animal.id}`, ["脚印近", "边界有味", "别走直线"]);
    }
    if (/水|水线|浅滩|河|湖|鱼|饮水/.test(text)) {
      return this.dialoguePick(dialogue, `map-clue-water-${animal && animal.id}`, ["水线紧", "浅滩退了", "去深水边"]);
    }
    if (/草|草场|牧场/.test(text)) {
      return this.dialoguePick(dialogue, `map-clue-grass-${animal && animal.id}`, ["草场变", "嫩草少了", "别踩新草"]);
    }
    if (/恢复|修复|回归|好转|安定/.test(text)) {
      return this.dialoguePick(dialogue, `map-clue-recovery-${animal && animal.id}`, ["回来了", "恢复点亮", "可以靠近"]);
    }
    if (/迁移|路线|移动|离开|归队/.test(text)) {
      return this.dialoguePick(dialogue, `map-clue-move-${animal && animal.id}`, ["路线变", "脚步往南", "别堵迁线"]);
    }
    const action = event.recommendAction || "";
    if (action === "houndScout" || action === "antiPoacher") return "边界要查";
    if (action === "habitat") return "水草要修";
    if (action === "intervention") return "群里不对";
    if (action === "exploreMaterials") return "这里有线索";
    return this.shortGameText(event.label || event.title || "路线有变化", 8);
  }

  shouldGuaranteeFirstCollectionLead() {
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const guardian = guardianContext(reserve);
    const collection = world.collection || {};
    return guardian.day === 6
      && !(((guardian.cycle.sevenDay || {}).completed || {})[6])
      && !((collection.discovery || {}).active)
      && !((collection.leads || []).length);
  }

  openAnimalThought(animal) {
    this.speakingAnimalId = animal.id;
    const cycle = this.mapFeedbackCycle([], [], this.animT());
    this.mapSpeakerFocus = { kind: "animal", id: animal.id, expiresAfterSlot: cycle.dialogueSlot + 2, usedSlot: null };
    this.selectedTarget = animal;
    const listenGain = this.collectAnimalIntel(animal);
    const context = this.createAnimalDialogueContext(animal);
    this.animalDialogueContexts[animal.id] = context;
    const clueUpdate = offerAnimalCollectionLead(this.state, animal, {
      season: (this.state.world || {}).season,
      weather: (this.state.world || {}).weather,
      story: ((this.state.world || {}).reserve || {}).eventChain,
      guaranteed: this.shouldGuaranteeFirstCollectionLead()
    });
    this.state = clueUpdate.state;
    this.infoDetailModal = this.buildAnimalThoughtDetail(animal, context);
    this.markAnimalPatrolLead(animal, this.infoDetailModal.linkedPatrolTask);
    this.infoDetailModal.listenGain = listenGain;
    this.infoDetailModal.collectionLead = clueUpdate.lead || null;
    if (clueUpdate.lead) {
      this.infoDetailModal.kicker = "剧情发现 · 有迹可循";
      this.infoDetailModal.footer = `${animal.shortName || animal.name || animal.species}发现了异常；下一步：${(clueUpdate.discovery || {}).actionLabel || "完成对应守护行动"}。`;
    }
    saveState(this.state);
    this.render();
  }

  markAnimalPatrolLead(animal, task = {}) {
    if (!animal || !task.id) return null;
    const world = this.state.world || (this.state.world = {});
    const reserve = world.reserve || (world.reserve = {});
    const region = this.animalCurrentRegion(animal) || this.findRegion("center") || {};
    const day = Math.max(1, Number(world.day) || 1);
    const animalName = this.animalDisplayName(animal);
    const marker = {
      id: `animal_task_${animal.id || animal.species}_${day}`,
      type: "event",
      kind: "exclamation",
      title: `${animalName}报告：${task.threatLabel || task.label || "附近有异常"}`,
      label: task.label || "巡护任务",
      impact: `${animalName}只负责指出迹象；请在沙盘任务点确认后再执行。`,
      unhandled: `尚未处理：${task.label || "巡护任务"}`,
      recommendAction: task.id,
      regionId: region.id || "center",
      dialogue: "",
      animalId: animal.id,
      animalName,
      createdDay: day,
      expiresDay: day + 1,
      source: "animal"
    };
    reserve.animalPatrolLead = marker;
    return marker;
  }

  collectAnimalIntel(animal) {
    const world = this.state.world || {};
    const reserve = Object.assign({}, world.reserve || {});
    const listenedIntel = Object.assign({}, reserve.listenedIntel || {});
    const key = animal && animal.id;
    const guardianDay = guardianContext(reserve).day;
    if (!key || listenedIntel[key] === guardianDay) return 0;
    listenedIntel[key] = guardianDay;
    reserve.listenedIntel = listenedIntel;
    this.state = Object.assign({}, this.state, {
      world: Object.assign({}, world, { reserve })
    });
    saveState(this.state);
    return 0;
  }

  buildAnimalThoughtDetail(animal, context) {
    const dialogue = context || this.createAnimalDialogueContext(animal);
    const relation = animal.relation || {};
    const memory = this.cleanGameText(((animal.memory || [])[animal.memory.length - 1]) || animal.insight || animal.wisdom || "正在重新判断路线");
    const status = this.animalStatusTag(animal, dialogue);
    const liveTime = this.compactForestTime(dialogue);
    const prose = this.animalLiveMonologue(animal, dialogue, { liveTime });
    const trustTier = this.animalTrustTier(animal);
    const careAction = this.recommendedAnimalAction(animal, dialogue);
    const patrolAction = this.recommendedAnimalPatrolAction(animal, dialogue);
    const careStatus = this.animalActionStatus(careAction.id);
    const exploration = previewMaterialExploration(
      (this.state.world || {}).reserve || {},
      (this.state.world || {}).knownCharacters || [],
      (this.state.world || {}).lifeMemory || null
    );
    const shortQuote = this.cleanGameText(this.animalSpeech(animal, dialogue) || prose);
    const modal = {
      kind: "mapAnimalAction",
      layout: "metricDashboard",
      kicker: `沙盘互动 · ${status}`,
      title: this.animalDisplayName(animal),
      icon: this.intentIcon((animal.intent && animal.intent.type) || "eye"),
      animal,
      dialogue,
      prose,
      quote: shortQuote,
      listenMoment: this.animalListenMoment(animal, dialogue),
      meta: `形象：${animal.cartoonLook || this.animalPersona(animal).look} / 关系：${trustTier.title} ${this.relationValue(animal, "trust")} / 警惕 ${this.relationValue(animal, "threat")}`,
      lines: [prose],
      heroMetrics: [
        { label: "信任", value: this.relationValue(animal, "trust"), note: trustTier.title },
        { label: "警惕", value: this.relationValue(animal, "threat"), note: this.relationValue(animal, "threat") >= 58 ? "保持距离" : "逐渐放松", palette: { top: "#ffe4dc", bottom: "#ffb4a5", stroke: "rgba(196,91,66,.42)", value: "#b94839" } },
        { label: "健康", value: Number.isFinite(animal.health) ? animal.health : 84, note: (Number.isFinite(animal.health) ? animal.health : 84) >= 80 ? "状态良好" : "需要关注" }
      ],
      items: [
        { tag: "此刻", title: `${status} · ${liveTime}`, body: prose },
        { tag: "线索", title: `${patrolAction.threatLabel} → 已标记沙盘任务`, body: memory }
      ],
      footer: `第 ${dialogue.click} 次倾听 · 线索已标记到沙盘 · 可在此${careAction.label}或探索踪迹`,
      linkedPatrolTask: {
        id: patrolAction.id,
        label: patrolAction.shortLabel || patrolAction.label,
        threatLabel: patrolAction.threatLabel,
        icon: patrolAction.icon || "eye"
      },
      mapActions: [
        {
          id: `care:${careAction.id}`,
          icon: careAction.id === "rescueCare" ? "medical" : careAction.id === "guideMigration" ? "migration" : "eye",
          label: careAction.label,
          value: careAction.id === "rescueCare" ? "疾病 -1 · 信任 +5" : careAction.id === "guideMigration" ? "迁移 +1 · 信任 +4" : "信任 +2",
          cost: careStatus.canRun ? careStatus.costs.slice(1).join(" · ") : `缺${careStatus.missing[0] || "资源"}`,
          tone: careStatus.canRun ? "care" : "blocked",
          action: () => this.openAnimalCareProcess(animal, careAction.id)
        },
        {
          id: "explore:materials",
          icon: "trail",
          label: "探索踪迹",
          value: `骰子 +${exploration.levelContribution + exploration.relationshipContribution}修正`,
          cost: "直接探索 · 掷骰决定结果",
          tone: "explore",
          action: () => this.openMaterialExploration()
        }
      ]
    };
    return modal;
  }

  drawMapAnimalActionModalContent(ctx, modal, x, bodyY, w, bodyH) {
    const animal = modal.animal || {};
    const relation = animal.relation || {};
    const innerX = x + 28;
    const innerW = w - 56;
    const compact = bodyH < 420;
    const heroH = compact ? 72 : 80;
    const portraitSize = compact ? 62 : 70;
    const heroY = bodyY + 12;

    const hero = ctx.createLinearGradient(innerX, heroY, innerX + innerW, heroY + heroH);
    hero.addColorStop(0, "#fff7bc");
    hero.addColorStop(1, "#d9f5d8");
    this.roundRect(ctx, innerX, heroY + 4, innerW, heroH, 17, "rgba(18,61,52,.12)");
    this.roundRect(ctx, innerX, heroY, innerW, heroH, 17, hero, "rgba(46,135,110,.30)");
    this.drawAnimalAvatar(ctx, animal, innerX + portraitSize / 2 + 7, heroY + heroH / 2, portraitSize, true);
    const copyX = innerX + portraitSize + 18;
    const copyW = innerW - portraitSize - 30;
    this.text(ctx, this.truncateTextToWidth(ctx, this.animalDisplayName(animal), copyW, compact ? 17 : 19, "700"), copyX, heroY + 27, compact ? 17 : 19, "#173d34", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, `${animal.species || "动物"} · ${this.animalTrustTier(animal).title}`, copyW, 10, "700"), copyX, heroY + 47, 10, "#567064", "700");
    this.roundRect(ctx, copyX, heroY + heroH - 23, Math.min(copyW, 88), 18, 9, "rgba(31,122,82,.13)", "rgba(31,122,82,.24)");
    this.text(ctx, this.truncateTextToWidth(ctx, this.animalStatusTag(animal, modal.dialogue || this.createAnimalDialogueContext(animal)), Math.min(copyW, 88) - 12, 9, "700"), copyX + Math.min(copyW, 88) / 2, heroY + heroH - 10, 9, "#1f7a52", "700", "center");

    const quoteY = heroY + heroH + 8;
    const quoteH = compact ? 58 : 64;
    this.roundRect(ctx, innerX, quoteY + 4, innerW, quoteH, 16, "rgba(18,61,52,.10)");
    this.roundRect(ctx, innerX, quoteY, innerW, quoteH, 16, "#fffdf2", "rgba(216,174,62,.28)");
    ctx.save();
    ctx.fillStyle = "#fffdf2";
    ctx.beginPath();
    ctx.moveTo(innerX + 32, quoteY);
    ctx.lineTo(innerX + 44, quoteY - 8);
    ctx.lineTo(innerX + 51, quoteY);
    ctx.fill();
    ctx.restore();
    const listenMoment = modal.listenMoment || this.animalListenMoment(animal, modal.dialogue || this.createAnimalDialogueContext(animal));
    const momentIconX = innerX + 29;
    this.drawUiIcon(ctx, listenMoment.icon || "eye", momentIconX, quoteY + quoteH / 2, 30, true)
      || this.drawSmallGlyph(ctx, listenMoment.icon || "eye", momentIconX, quoteY + quoteH / 2, "#1f7a52", .8);
    this.drawFittedTextBlock(ctx, `“${listenMoment.text || modal.quote || modal.prose || "我听见你来了。"}”`, innerX + 50, quoteY + 23, innerW - 64, quoteH - 18, {
      size: compact ? 13 : 14,
      minSize: 11,
      lineHeight: compact ? 17 : 19,
      color: "#26352b"
    });
    modal.renderedListenMoment = { icon: listenMoment.icon, text: listenMoment.text, tone: listenMoment.tone, iconSize: 30 };

    const metricY = quoteY + quoteH + 8;
    const metricH = 46;
    const metricGap = 6;
    const metricW = (innerW - metricGap * 2) / 3;
    const metrics = [
      { label: "信任", value: this.relationValue(animal, "trust"), color: "#17855b" },
      { label: "警惕", value: this.relationValue(animal, "threat"), color: this.relationValue(animal, "threat") >= 58 ? "#c85142" : "#8b6f2a" },
      { label: "健康", value: Number.isFinite(animal.health) ? animal.health : 84, color: (Number.isFinite(animal.health) ? animal.health : 84) < 72 ? "#c85142" : "#237c98" }
    ];
    modal.renderedDashboardMetrics = [];
    metrics.forEach((metric, index) => {
      const mx = innerX + index * (metricW + metricGap);
      this.roundRect(ctx, mx, metricY, metricW, metricH, 13, index === 1 ? "#fff6df" : "#eef9e8", "rgba(46,135,110,.20)");
      this.text(ctx, metric.label, mx + 9, metricY + 16, 9, "#617166", "700");
      this.text(ctx, `${metric.value}`, mx + metricW - 9, metricY + 33, 18, metric.color, "700", "right");
      modal.renderedDashboardMetrics.push({ label: metric.label, value: `${metric.value}`, x: mx, y: metricY, w: metricW, h: metricH, valueSize: 18 });
    });

    const task = modal.linkedPatrolTask || {};
    const taskY = metricY + metricH + 8;
    const taskH = 36;
    this.roundRect(ctx, innerX, taskY, innerW, taskH, 12, "rgba(239,244,238,.96)", "rgba(46,135,110,.22)");
    this.drawUiIcon(ctx, task.icon || "signal", innerX + 21, taskY + taskH / 2, 24, false)
      || this.drawSmallGlyph(ctx, task.icon || "signal", innerX + 21, taskY + taskH / 2, "#1f7a52", .68);
    this.text(ctx, "已标记沙盘任务", innerX + 40, taskY + 15, 9, "#66715f", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, `${task.threatLabel || "动物发现异常"} · ${task.label || "回沙盘处理"}`, innerW - 52, 11, "700"), innerX + 40, taskY + 30, 11, "#173d34", "700");
    modal.renderedLinkedPatrolTask = { id: task.id, readOnly: true, trigger: "sandbox-marker", x: innerX, y: taskY, w: innerW, h: taskH };

    const actions = (modal.mapActions || []).slice(0, 2);
    const actionY = taskY + taskH + 8;
    const actionGap = 7;
    const available = Math.max(0, bodyY + bodyH - 12 - actionY - actionGap * Math.max(0, actions.length - 1));
    const actionH = Math.min(62, Math.max(50, Math.floor(available / Math.max(1, actions.length))));
    modal.renderedAnimalActions = [];
    modal.renderedInfoItems = [];
    actions.forEach((action, index) => {
      const ay = actionY + index * (actionH + actionGap);
      const blocked = action.tone === "blocked";
      const primary = action.tone === "primary";
      const fill = blocked ? "#fff0ea" : primary ? "#fff1a8" : action.tone === "explore" ? "#e8f2ff" : "#e1f7df";
      const stroke = blocked ? "rgba(196,91,66,.42)" : primary ? "rgba(216,174,62,.62)" : "rgba(46,135,110,.30)";
      this.roundRect(ctx, innerX, ay + 4, innerW, actionH, 15, "rgba(18,61,52,.12)");
      this.roundRect(ctx, innerX, ay, innerW, actionH, 15, fill, stroke);
      this.drawUiIcon(ctx, action.icon || "eye", innerX + 27, ay + actionH / 2, 34, true)
        || this.drawSmallGlyph(ctx, action.icon || "eye", innerX + 27, ay + actionH / 2, "#1f7a52", .9);
      const textX = innerX + 50;
      const arrowW = 28;
      const textW = innerW - 50 - arrowW - 8;
      this.text(ctx, this.truncateTextToWidth(ctx, action.label, textW, 13, "700"), textX, ay + 21, 13, "#173d34", "700");
      this.text(ctx, this.truncateTextToWidth(ctx, action.value, textW, 12, "700"), textX, ay + 39, 12, blocked ? "#c85142" : primary ? "#9b6718" : "#1f7a52", "700");
      if (actionH >= 58) this.text(ctx, this.truncateTextToWidth(ctx, action.cost, textW, 9, "700"), textX, ay + 54, 9, blocked ? "#b05a4a" : "#66715f", "700");
      this.roundRect(ctx, innerX + innerW - 31, ay + actionH / 2 - 13, 26, 26, 10, blocked ? "#f38a7e" : primary ? "#e5ad2f" : "#2b9b7e", "rgba(255,255,255,.54)");
      this.text(ctx, "›", innerX + innerW - 18, ay + actionH / 2 + 7, 18, "#ffffff", "700", "center");
      this.addHit(innerX, ay, innerW, actionH, () => action.action());
      const rendered = { id: action.id, x: innerX, y: ay, w: innerW, h: actionH, label: action.label, value: action.value, cost: action.cost, blocked };
      modal.renderedAnimalActions.push(rendered);
      modal.renderedInfoItems.push({ item: action, x: innerX, y: ay, w: innerW, h: actionH, layout: { title: { truncated: false }, body: { truncated: false } } });
    });
  }

  animalCareProcessConfig(animal, actionId) {
    const name = this.animalDisplayName(animal);
    if (actionId === "rescueCare") {
      return {
        kicker: "温柔护理",
        title: `照顾${name}`,
        icon: "medical",
        steps: ["把药箱放低，动作慢一点，等它主动放松。", "护理完成，它愿意留下来休息。"],
        buttons: ["小心护理", "回到沙盘"]
      };
    }
    if (actionId === "guideMigration") {
      return {
        kicker: "温柔引导",
        title: `陪${name}找路`,
        icon: "migration",
        steps: ["让开正前方，沿安全方向放下一枚安静的路标。", "它自己迈出了第一步。"],
        buttons: ["轻声引导", "回到沙盘"]
      };
    }
    return {
      kicker: "温柔互动",
      title: `安抚${name}`,
      icon: "eye",
      steps: ["蹲下来，保持舒服的距离，轻声告诉它：这里很安全。", "它的耳朵放松了，也没有转身离开。"],
      buttons: ["轻声安抚", "回到沙盘"]
    };
  }

  openAnimalCareProcess(animal, actionId) {
    const status = this.animalActionStatus(actionId);
    if (!status.canRun) {
      this.toast(`缺${status.missing.join("、")}`);
      return false;
    }
    const config = this.animalCareProcessConfig(animal, actionId);
    this.infoDetailModal = {
      kind: "animalComfort",
      phase: "approach",
      step: 0,
      kicker: config.kicker,
      title: config.title,
      icon: config.icon,
      animal,
      actionId,
      config,
      costs: status.costs.slice(1)
    };
    this.playSfx("tap");
    this.render();
    return true;
  }

  advanceAnimalCareProcess() {
    const modal = this.infoDetailModal;
    if (!modal || modal.kind !== "animalComfort") return false;
    if (modal.phase === "result") {
      this.infoDetailModal = null;
      this.setScreen("home");
      return true;
    }
    return this.performAnimalAction(modal.animal, modal.actionId, { showCareResult: true });
  }

  drawAnimalComfortContent(ctx, modal, x, bodyY, w, bodyH) {
    const innerX = x + 28;
    const innerW = w - 56;
    const result = modal.phase === "result";
    const stage = result ? 1 : 0;
    const config = modal.config || this.animalCareProcessConfig(modal.animal || {}, modal.actionId);
    const sceneY = bodyY + 12;
    const sceneH = bodyH - 24;
    const scene = ctx.createLinearGradient(innerX, sceneY, innerX, sceneY + sceneH);
    const effectType = modal.actionId === "rescueCare" ? "healing" : modal.actionId === "guideMigration" ? "migration-route" : "trust-glow";
    if (effectType === "healing") {
      scene.addColorStop(0, "#f4fbef");
      scene.addColorStop(.55, "#def4e4");
      scene.addColorStop(1, "#dbeff2");
    } else if (effectType === "migration-route") {
      scene.addColorStop(0, "#fff5cf");
      scene.addColorStop(.55, "#e8f2db");
      scene.addColorStop(1, "#dcebf0");
    } else {
      scene.addColorStop(0, "#fff6c9");
      scene.addColorStop(.55, "#e8f7d9");
      scene.addColorStop(1, "#d8f1e3");
    }
    this.roundRect(ctx, innerX, sceneY + 5, innerW, sceneH, 22, "rgba(18,61,52,.12)");
    this.roundRect(ctx, innerX, sceneY, innerW, sceneH, 22, scene, "rgba(216,174,62,.34)");
    const effectNow = this.animT ? this.animT() : Date.now();
    if (effectType === "trust-glow") {
      const glow = .5 + .5 * Math.sin(effectNow / 260);
      ctx.save();
      ctx.strokeStyle = `rgba(73,185,124,${.28 + glow * .24})`;
      ctx.lineWidth = 5;
      this.roundRect(ctx, innerX + 5, sceneY + 5, innerW - 10, sceneH - 10, 18, null, ctx.strokeStyle);
      ctx.restore();
    }

    const stepY = sceneY + 18;
    const stepGap = 44;
    const stepStart = innerX + innerW / 2 - stepGap / 2;
    for (let index = 0; index < 2; index += 1) {
      if (index < 1) this.roundRect(ctx, stepStart + 8, stepY + 3, stepGap - 16, 3, 2, index < stage ? "#56b886" : "rgba(73,103,83,.18)");
      ctx.save();
      ctx.fillStyle = index <= stage ? (index === stage ? "#ffbd4d" : "#56b886") : "rgba(255,255,255,.72)";
      ctx.strokeStyle = index <= stage ? "rgba(31,122,82,.72)" : "rgba(73,103,83,.22)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(stepStart + index * stepGap, stepY + 4, index === stage ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    const portraitY = sceneY + 94;
    const pulse = .5 + .5 * Math.sin(effectNow / 260);
    if (effectType === "migration-route") {
      const routeY = portraitY + 48;
      const routeProgress = (effectNow % 1500) / 1500;
      ctx.save();
      ctx.strokeStyle = "rgba(55,137,123,.58)";
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(innerX + 34, routeY);
      ctx.bezierCurveTo(innerX + innerW * .34, routeY - 30, innerX + innerW * .66, routeY + 24, innerX + innerW - 34, routeY - 8);
      ctx.stroke();
      ctx.setLineDash([]);
      const px = innerX + 34 + (innerW - 68) * routeProgress;
      const py = routeY - Math.sin(routeProgress * Math.PI * 2) * 12;
      this.drawSmallGlyph(ctx, "migration", px, py, "#277c6d", .72);
      ctx.restore();
    }
    ctx.save();
    ctx.strokeStyle = `rgba(86,184,134,${.24 + pulse * .18})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(innerX + innerW / 2, portraitY, 58 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    this.drawAnimalAvatar(ctx, modal.animal || {}, innerX + innerW / 2, portraitY, 104, true);
    if (effectType === "healing") {
      const effectAge = result && modal.feedbackStartedAt ? Date.now() - modal.feedbackStartedAt : effectNow % 2000;
      const healProgress = Math.max(0, Math.min(1, effectAge / 2000));
      ctx.save();
      for (let index = 0; index < 8; index += 1) {
        const angle = index / 8 * Math.PI * 2 + healProgress * Math.PI;
        const radius = 38 + healProgress * 22 + (index % 2) * 6;
        const alpha = Math.max(.10, .85 - healProgress * .65);
        ctx.fillStyle = index % 2 ? `rgba(255,242,153,${alpha})` : `rgba(110,211,163,${alpha})`;
        ctx.beginPath();
        ctx.arc(innerX + innerW / 2 + Math.cos(angle) * radius, portraitY + Math.sin(angle) * radius, index % 2 ? 3 : 2, 0, Math.PI * 2);
        ctx.fill();
      }
      this.text(ctx, "+", innerX + innerW / 2 + 48, portraitY - 38, 18, "#42a773", "700", "center");
      ctx.restore();
    }
    if (stage >= 1) {
      this.text(ctx, "♥", innerX + innerW / 2 + 56, portraitY - 35, 18, "#ff8b84", "700", "center");
      this.text(ctx, "♥", innerX + innerW / 2 - 58, portraitY - 17, 13, "#ffb070", "700", "center");
    }

    const bubbleY = sceneY + 157;
    const bubbleH = 58;
    this.roundRect(ctx, innerX + 16, bubbleY + 4, innerW - 32, bubbleH, 18, "rgba(18,61,52,.10)");
    this.roundRect(ctx, innerX + 16, bubbleY, innerW - 32, bubbleH, 18, "rgba(255,255,248,.94)", "rgba(46,135,110,.26)");
    ctx.save();
    ctx.fillStyle = "rgba(255,255,248,.94)";
    ctx.beginPath();
    ctx.moveTo(innerX + innerW / 2 - 8, bubbleY);
    ctx.lineTo(innerX + innerW / 2, bubbleY - 9);
    ctx.lineTo(innerX + innerW / 2 + 8, bubbleY);
    ctx.fill();
    ctx.restore();
    this.drawFittedTextBlock(ctx, (config.steps || [])[stage] || "它正在观察你。", innerX + 30, bubbleY + 25, innerW - 60, bubbleH - 16, {
      size: 13,
      minSize: 11,
      lineHeight: 18,
      color: "#26352b",
      align: "center"
    });

    const changeY = bubbleY + bubbleH + 10;
    const changes = result ? (modal.resultChanges || []) : [
      { label: "动作", value: stage === 0 ? "保持距离" : "建立信任", tone: "good" },
      { label: "消耗", value: (modal.costs || ["每日一次"])[0] || "每日一次", tone: "warn" }
    ];
    const changeGap = 7;
    const changeW = (innerW - changeGap * Math.max(0, changes.length - 1)) / Math.max(1, changes.length);
    changes.slice(0, 3).forEach((item, index) => {
      const cx = innerX + index * (changeW + changeGap);
      const color = item.tone === "bad" ? "#c85142" : item.tone === "warn" ? "#9b7420" : "#17855b";
      this.roundRect(ctx, cx, changeY, changeW, 48, 13, item.tone === "bad" ? "#fff0ea" : item.tone === "warn" ? "#fff5d8" : "#eff9e8", `${color}44`);
      this.text(ctx, item.label, cx + changeW / 2, changeY + 16, 9, "#66715f", "700", "center");
      this.text(ctx, this.truncateTextToWidth(ctx, item.value, changeW - 12, 12, "700"), cx + changeW / 2, changeY + 36, 12, color, "700", "center");
    });

    const buttonW = Math.min(176, innerW - 40);
    const buttonX = innerX + (innerW - buttonW) / 2;
    const buttonY = sceneY + sceneH - 51;
    this.roundRect(ctx, buttonX, buttonY + 5, buttonW, 42, 18, "rgba(18,61,52,.18)");
    const button = ctx.createLinearGradient(buttonX, buttonY, buttonX, buttonY + 42);
    button.addColorStop(0, result ? "#57d5ad" : "#ffd966");
    button.addColorStop(1, result ? "#279574" : "#f2b53d");
    this.roundRect(ctx, buttonX, buttonY, buttonW, 42, 18, button, "rgba(255,255,255,.62)");
    this.text(ctx, (config.buttons || [])[stage] || "继续", buttonX + buttonW / 2, buttonY + 27, 13, result ? "#fffdf2" : "#5d431c", "700", "center");
    this.addHit(buttonX, buttonY, buttonW, 42, () => this.advanceAnimalCareProcess());
    modal.renderedComfort = { phase: modal.phase, stage, effectType, effectDuration: effectType === "healing" ? 2000 : 0, portraitSize: 104, changes, button: { x: buttonX, y: buttonY, w: buttonW, h: 42, label: (config.buttons || [])[stage] || "继续" } };
  }

  recommendedAnimalPatrolAction(animal, dialogue) {
    const type = this.animalThreatMetricType(animal, dialogue);
    const action = this.reserveMetricAction(type);
    const labels = {
      safety: "安全感",
      water: "水源",
      poacher: "偷猎",
      migration: "迁移"
    };
    return Object.assign({}, action, {
      threatType: type,
      threatLabel: labels[type] || "安全感"
    });
  }

  animalThreatMetricType(animal, dialogue) {
    const reserve = (this.state.world && this.state.world.reserve) || {};
    const ecology = reserve.ecology || {};
    const migration = reserve.migration || {};
    const text = [
      dialogue && dialogue.fact,
      dialogue && dialogue.mood,
      dialogue && dialogue.concern,
      animal && animal.publicState,
      animal && animal.insight
    ].filter(Boolean).join(" ");
    if ((reserve.poacherPressure || 0) > 45 || /偷猎|脚印|陷阱|陌生|人影|枪|直线/.test(text)) return "poacher";
    if ((ecology.water || 0) < 55 || /水|浅滩|河|湖|喝|鱼/.test(text)) return "water";
    if ((migration.delta || 0) < 0 || /迁移|离开|绕路|掉队|边缘/.test(text)) return "migration";
    if ((reserve.safety || reserve.stability || 0) < 62 || (ecology.disease || 0) > 26) return "safety";
    return "safety";
  }

  recommendedAnimalAction(animal, dialogue) {
    const reserve = (this.state.world && this.state.world.reserve) || {};
    const ecology = reserve.ecology || {};
    const migration = reserve.migration || {};
    if ((ecology.disease || 0) > 24 || (animal.health || 90) < 72 || /受伤|虚弱|病|掉队/.test(animal.publicState || "")) {
      return { id: "rescueCare", label: "救助护理" };
    }
    if ((migration.delta || 0) < 0 || (ecology.water || 0) < 50 || (ecology.grass || 0) < 50 || /迁移|离开|水/.test((dialogue && dialogue.fact) || "")) {
      return { id: "guideMigration", label: "引导迁移" };
    }
    return { id: "calmObserve", label: "安抚观察" };
  }

  animalActionStatus(actionId) {
    const world = this.state.world || {};
    const reserve = (this.state.world && this.state.world.reserve) || {};
    const supplies = reserve.supplies || {};
    const careLog = reserve.animalCareLog || {};
    const missing = [];
    const costs = ["每日轻互动"];
    const targetId = this.speakingAnimalId || (this.selectedTarget && this.selectedTarget.id);
    const guardianDay = guardianContext(reserve).day;
    if (targetId && careLog[targetId] === guardianDay) missing.push("今日已互动");
    if (actionId === "rescueCare") {
      costs.push("医疗包 1");
      if ((supplies.medicalKit || 0) < 1) missing.push("医疗包");
    } else if (actionId === "guideMigration") {
      costs.push("动物关系");
    } else {
      costs.push("轻互动");
    }
    return { canRun: missing.length === 0, missing, costs };
  }

  performAnimalAction(animal, actionId, options = {}) {
    const status = this.animalActionStatus(actionId);
    if (!status.canRun) {
      this.toast(`缺${status.missing.join("、")}`);
      return;
    }
    const beforeState = JSON.parse(JSON.stringify(this.state));
    const world = this.state.world || {};
    const beforeAnimal = (world.knownCharacters || []).find((target) => animal && target.id === animal.id) || animal || {};
    const beforeRelation = Object.assign({}, beforeAnimal.relation || {});
    const beforeReserve = this.reserveSnapshot(world.reserve || {});
    const reserve = Object.assign({}, world.reserve || {});
    reserve.animalCareLog = Object.assign({}, reserve.animalCareLog || {});
    reserve.supplies = Object.assign({}, reserve.supplies || {});
    reserve.ecology = Object.assign({}, reserve.ecology || {}, {
      predators: Object.assign({}, reserve.ecology && reserve.ecology.predators || {}),
      herbivores: Object.assign({}, reserve.ecology && reserve.ecology.herbivores || {}),
      birds: Object.assign({}, reserve.ecology && reserve.ecology.birds || {})
    });
    reserve.migration = Object.assign({ trend: "stable", delta: 0, reason: "" }, reserve.migration || {});
    const relationshipTrack = masteryView(reserve).find((entry) => entry.id === "relationship") || { branches: {} };
    const relationshipBranches = relationshipTrack.branches || {};
    reserve.animalCareLog[animal.id] = guardianContext(reserve).day;
    const lifeMemory = normalizeLifeMemory(world);
    const namedFriend = lifeMemory.individuals.filter((item) => item.species === animal.species && item.status === "active").sort((a, b) => relationshipAxes(a).security - relationshipAxes(b).security)[0] || null;
    let relationshipChange = null;
    if (namedFriend) {
      const beforeAxes = relationshipAxes(namedFriend);
      const shift = actionId === "rescueCare" ? { security: 6, wildness: -5, reason: "救助让它更安心，也增加了对人的依赖" }
        : actionId === "guideMigration" ? { security: 2, wildness: 4, reason: "你让它自己选择路线，安全感与野性一起恢复" }
          : { security: 2, wildness: 1, reason: "克制观察建立安全感，没有替它做决定" };
      namedFriend.security = Math.max(0, Math.min(100, beforeAxes.security + shift.security));
      namedFriend.wildness = Math.max(0, Math.min(100, beforeAxes.wildness + shift.wildness));
      namedFriend.bond = namedFriend.security;
      relationshipChange = {
        individualId: namedFriend.id,
        name: namedFriend.name,
        species: namedFriend.species,
        before: beforeAxes,
        after: relationshipAxes(namedFriend),
        securityDelta: namedFriend.security - beforeAxes.security,
        wildnessDelta: namedFriend.wildness - beforeAxes.wildness,
        reason: shift.reason
      };
    }
    const knownCharacters = (world.knownCharacters || []).map((target) => {
      if (!animal || target.id !== animal.id) return target;
      const relation = Object.assign({}, target.relation || {});
      const currentTrust = this.relationValue(target, "trust");
      const currentThreat = this.relationValue(target, "threat");
      const trustGain = actionId === "rescueCare" ? 5 : actionId === "guideMigration" ? 4 : 2;
      // Trust above 85 remains possible, but requires repeated direct care;
      // reserve management alone cannot finish the final relationship tier.
      relation.trust = Math.min(100, currentTrust + trustGain);
      relation.threat = Math.max(0, currentThreat - (actionId === "rescueCare" ? 3 : 1));
      const memoryLine = actionId === "rescueCare"
        ? "卫士靠近得很慢，药味不吓人，我把这次记成安全。"
        : actionId === "guideMigration"
          ? "卫士把嘈杂的路口绕开了，我愿意带队再试一次。"
          : "卫士没有急着命令我，只是听风和脚印，我的耳朵没那么紧了。";
      return Object.assign({}, target, {
        relation,
        health: actionId === "rescueCare"
          ? Math.min(100, (Number.isFinite(target.health) ? target.health : 84) + 8)
          : Number.isFinite(target.health) ? target.health : 84,
        conditionChange: {
          trust: relation.trust - currentTrust,
          threat: relation.threat - currentThreat,
          health: actionId === "rescueCare" ? Math.min(100, (Number.isFinite(target.health) ? target.health : 84) + 8) - (Number.isFinite(target.health) ? target.health : 84) : 0
        },
        conditionSummary: actionId === "rescueCare" ? "护理缓解了疾病与伤情" : actionId === "guideMigration" ? "安全路线降低了迁徙压力" : "克制观察让它逐渐放松",
        memory: ((target.memory || []).concat(memoryLine)).slice(-5)
      });
    });
    if (actionId === "rescueCare") {
      reserve.supplies.medicalKit = Math.max(0, (reserve.supplies.medicalKit || 0) - 1);
      reserve.ecology.disease = Math.max(0, (reserve.ecology.disease || 0) - 1);
      reserve.reputation = Math.min(100, (reserve.reputation || 50) + 1);
    } else if (actionId === "guideMigration") {
      const habitat = habitatMigrationAssessment(reserve);
      if (habitat.allowIn) {
        reserve.migration.delta = Math.max(1, (reserve.migration.delta || 0) + 1);
        reserve.migration.trend = "in";
        reserve.migration.reason = "水草仍有余量，你根据动物提醒打开了一条安全迁入路线";
      } else {
        // 低水草时“引导迁移”的价值是安全疏散，而不是继续把动物引进来。
        reserve.migration.delta = Math.min(-1, habitat.delta || -1);
        reserve.migration.trend = "out";
        reserve.migration.reason = habitat.grass <= 38
          ? "草场承载不足，你引导边缘动物安全迁往食物更充足的区域"
          : habitat.water <= 40
            ? "水点承载不足，你引导边缘动物安全迁往稳定水线"
            : "当前承载接近上限，你先疏散边缘种群，避免健康继续恶化";
      }
    } else {
      reserve.reputation = Math.min(100, (reserve.reputation || 50) + 1);
    }
    // 动物互动不消耗晨/午/暮阶段，但会同时推进关系、剧情发现与章节体验，
    // 因此属于“有效操作”。与策略计数同步，保证下一次经营结算不会覆盖它。
    reserve.progression = Object.assign({}, reserve.progression || {}, {
      totalMeaningfulActions: Math.max(0, Number((reserve.progression || {}).totalMeaningfulActions) || 0) + 1
    });
    reserve.strategy = Object.assign({}, reserve.strategy || {}, {
      totalMeaningfulActions: Math.max(0, Number((reserve.strategy || {}).totalMeaningfulActions) || 0) + 1
    });
    reserve.progression = reserveProgressionFor(reserve);
    this.state = Object.assign({}, this.state, {
      world: Object.assign({}, world, { reserve, knownCharacters, lifeMemory })
    });
    const actor = knownCharacters.find((target) => animal && target.id === animal.id) || animal;
    const clueUpdate = offerAnimalCollectionLead(this.state, actor, {
      trigger: "care",
      careAction: actionId,
      season: (this.state.world || {}).season,
      weather: (this.state.world || {}).weather,
      story: ((this.state.world || {}).reserve || {}).eventChain,
      guaranteed: this.shouldGuaranteeFirstCollectionLead()
        || (relationshipBranches[10] === "animal_guide" && (((actor || {}).relation || {}).trust || 0) >= 80)
    });
    this.state = clueUpdate.state;
    const relationshipMastery = awardMastery(this.state.world.reserve, "relationship", 5, "动物互动");
    let masteryEffect = "";
    if (actionId === "calmObserve" && relationshipBranches[5] === "observe") {
      masteryEffect = "观察专长：它向你展示了最近一次季节路线";
      actor.memory = ((actor.memory || []).concat(`第${guardianContext(reserve).day}日：它允许你看见${((actor.seasonRoute || {}).regionId) || "旧水线"}的路线记忆。`)).slice(-5);
    } else if (actionId === "rescueCare" && relationshipBranches[5] === "rescue") {
      masteryEffect = "救助专长：受伤动物主动靠近了救助点";
      reserve.masteryAnimalCue = { animalId: actor.id, kind: "rescue", guardianDay: guardianContext(reserve).day };
    }
    if (actionId === "rescueCare" && relationshipBranches[10] === "life_guardian" && namedFriend && (namedFriend.health || 0) <= 28) {
      namedFriend.health = Math.max(60, namedFriend.health || 0);
      namedFriend.guardianSaveUsed = true;
      masteryEffect = "生命守护：这次救助避免了永久离开";
    } else if (clueUpdate.lead && relationshipBranches[10] === "animal_guide") {
      masteryEffect = "动物引路：高信任伙伴直接指出珍稀收藏路线";
    }
    const goalProgress = applyGoalProgress(beforeState, this.state, { action: "animalCare", now: Date.now() });
    this.state = goalProgress.state;
    saveState(this.state);
    const afterRelation = Object.assign({}, (actor && actor.relation) || {});
    const trustNodes = [20, 40, 65, 85];
    const crossedTrustNode = trustNodes.find((node) => (beforeRelation.trust || 0) < node && (afterRelation.trust || 0) >= node) || null;
    if (crossedTrustNode) {
      actor.relation = Object.assign({}, actor.relation || {});
      actor.relation.storyNodesSeen = Array.from(new Set([].concat(actor.relation.storyNodesSeen || [], crossedTrustNode)));
    }
    const afterReserve = this.reserveSnapshot(reserve);
    const consequence = {
      title: `${this.animalDisplayName(actor)} · ${actionId === "rescueCare" ? "接受救助" : actionId === "guideMigration" ? "自己选择路线" : "允许你远远观察"}`,
      reason: relationshipChange ? relationshipChange.reason : "它记住了你的克制",
      tone: actionId === "rescueCare" ? "intervention" : actionId === "guideMigration" ? "habitat" : "observe",
      relationshipChange,
      customValueText: relationshipChange ? `安全 ${relationshipChange.before.security}→${relationshipChange.after.security} · 野性 ${relationshipChange.before.wildness}→${relationshipChange.after.wildness}` : "关系已经写入动物记忆",
      animalQuote: `${relationshipChange ? relationshipChange.name : this.animalDisplayName(actor)}：${(actor.memory || []).slice(-1)[0] || "我记住了你今天的距离。"}`
    };
    this.setMapConsequencePulse(beforeReserve, afterReserve, consequence);
    if (options.showCareResult) {
      const config = this.animalCareProcessConfig(actor, actionId);
      const resultChanges = [
        { label: "信任", value: `${Number.isFinite(beforeRelation.trust) ? beforeRelation.trust : 40}→${Number.isFinite(afterRelation.trust) ? afterRelation.trust : 40} ${this.signed((Number.isFinite(afterRelation.trust) ? afterRelation.trust : 40) - (Number.isFinite(beforeRelation.trust) ? beforeRelation.trust : 40))}`, tone: "good" },
        { label: "警惕", value: `${Number.isFinite(beforeRelation.threat) ? beforeRelation.threat : 40}→${Number.isFinite(afterRelation.threat) ? afterRelation.threat : 40} ${this.signed((Number.isFinite(afterRelation.threat) ? afterRelation.threat : 40) - (Number.isFinite(beforeRelation.threat) ? beforeRelation.threat : 40))}`, tone: "good" },
        actionId === "rescueCare"
          ? { label: "疾病", value: `${(beforeReserve.ecology || {}).disease || 0}→${(afterReserve.ecology || {}).disease || 0}`, tone: "good" }
          : actionId === "guideMigration"
            ? { label: "迁徙", value: `${(beforeReserve.migration || {}).delta || 0}→${(afterReserve.migration || {}).delta || 0}`, tone: "good" }
            : { label: "关系", value: `信任 +${Math.max(0, (afterRelation.trust || 0) - (beforeRelation.trust || 0))}`, tone: "good" }
      ];
      this.infoDetailModal = {
        kind: "animalComfort",
        phase: "result",
        step: 1,
        kicker: clueUpdate.lead ? "温柔回应 · 有迹可循" : "温柔回应",
        title: crossedTrustNode
          ? `${this.animalDisplayName(actor)}开始用新的方式看你`
          : clueUpdate.lead
          ? "它放松下来，带你找到一处痕迹"
          : actionId === "rescueCare" ? "它安心地接受了护理" : actionId === "guideMigration" ? "它自己迈出了第一步" : "它没有转身离开",
        icon: config.icon,
        animal: actor,
        actionId,
        config: masteryEffect ? Object.assign({}, config, { steps: [config.steps[0], masteryEffect] }) : config,
        feedbackStartedAt: Date.now(),
        resultChanges,
        goalRewards: goalProgress.rewards || [],
        masteryGain: relationshipMastery,
        masteryEffect,
        trustMilestone: crossedTrustNode,
        collectionLead: clueUpdate.lead || null,
        quote: crossedTrustNode
          ? `${this.animalDisplayName(actor)}：“我记住了你没有越过的距离。以后，我会让你看见更远的路。”`
          : consequence.animalQuote
      };
      this.playSfx("success");
      this.screen = "home";
      this.render();
      return true;
    }
    this.infoDetailModal = null;
    this.setScreen("home");
    this.render();
    return true;
  }

  ensureChinesePeriod(text) {
    const value = String(text || "").trim();
    if (!value) return "";
    return /[。！？!?]$/.test(value) ? "" : "。";
  }

  animalLiveMonologue(animal, dialogue, parts) {
    const voice = this.animalVoiceTexture(animal, dialogue);
    const mood = this.animalMicroMood(animal, dialogue);
    const action = this.animalMicroAction(animal, dialogue);
    const eventLead = this.animalEventLead(dialogue);
    const storyLead = eventLead || this.animalChapterLead(animal, dialogue) || this.animalSeasonLead(animal, dialogue);
    const eventText = storyLead ? `${storyLead}。` : "";
    return `${parts.liveTime}，${eventText}${voice.opening}。${mood}${this.ensureChinesePeriod(mood)}${action}${this.ensureChinesePeriod(action)}`;
  }

  animalChapterLead(animal, dialogue) {
    const chapter = dialogue.chapter || getCurrentChapter(dialogue.reserve || {});
    const chapterNo = chapter && chapter.chapter;
    const species = animal && animal.species;
    const reserve = dialogue.reserve || {};
    const ecology = dialogue.ecology || reserve.ecology || {};
    const water = Number(ecology.water) || 0;
    const migrationDelta = Number((reserve.migration || {}).delta) || 0;
    if (chapterNo === 1 && species === "乌鸦") return "我还在比较你和上一任的脚步";
    if (chapterNo === 2 && species === "熊") {
      const patrolPost = facilityStates(this.state).find((facility) => facility.id === "old_patrol_post");
      return patrolPost && patrolPost.buildStage > 0 ? "保护站的灯这次没有熄" : "保护站的灯还在等人重新点亮";
    }
    if (chapterNo === 3 && species === "狮子") return migrationDelta < 0 ? "猎物队形变薄，我暂不扩张" : "猎物队形还稳，我暂不扩张";
    if (chapterNo === 4 && species === "大象") return water >= 55 ? "旧水路在记忆里重新亮起" : "旧水路还在记忆里，水汽却没有接上";
    if (chapterNo === 5 && species === "水貂") return water >= 55 ? "浅滩回来了，鱼影也回来了" : "浅滩还没回来，鱼影留在深水";
    return "";
  }

  animalSeasonLead(animal, dialogue) {
    const season = ((dialogue.world || {}).season) || (((dialogue.reserve || {}).seasonState || {}).name) || "雨季";
    const species = (animal && animal.species) || "";
    const waterSpecies = ["火烈鸟", "河马", "鳄鱼", "水貂", "大象"];
    const grazerSpecies = ["鹿", "羚羊", "野兔", "斑马", "野猪", "长颈鹿"];
    const predatorSpecies = ["狼", "狮子", "豹子", "野犬", "狐狸"];
    if (season === "旱季") {
      if (waterSpecies.includes(species)) return "旱季把大家挤向少数水点";
      if (grazerSpecies.includes(species)) return "旱季正把脚步拉向旧水路";
      if (predatorSpecies.includes(species)) return "旱季让猎物聚在更窄水线";
      return "旱季的尘线暴露了更多动静";
    }
    if (waterSpecies.includes(species)) return "雨季重新铺开河道和浅滩";
    if (grazerSpecies.includes(species)) return "雨季把活动边界推得更远";
    if (predatorSpecies.includes(species)) return "雨水冲淡了昨夜的气味线";
    return "雨季让树冠和高空更忙了";
  }

  animalVoiceTexture(animal, dialogue) {
    const weather = ((dialogue.world || {}).weather) || "天气";
    const phase = ((dialogue.time || {}).phase) || "这会儿";
    const season = ((dialogue.world || {}).season) || "雨季";
    const reserve = dialogue.reserve || {};
    const ecology = dialogue.ecology || reserve.ecology || {};
    const migration = reserve.migration || {};
    const water = Number(ecology.water) || 0;
    const grass = Number(ecology.grass) || 0;
    const poachers = Number(reserve.poacherPressure) || 0;
    const disease = Number(ecology.disease) || 0;
    const migrationDelta = Number(migration.delta) || 0;
    const wet = season === "雨季" || /雨/.test(weather);
    const species = animal.species;
    if (species === "鹿") {
      return {
        opening: grass < 48
          ? "草尖短了，我的耳朵先替幼鹿听路"
          : wet ? "草尖沾着雨，我的耳朵先上班" : "草尖晒暖了，我的耳朵轮班听风"
      };
    }
    if (species === "狼") {
      return {
        opening: migrationDelta < 0
          ? `${phase}的风贴着泥走，鹿群的气味断了一截`
          : `${phase}的风贴着泥走，鹿群路线还连得上`
      };
    }
    if (species === "乌鸦") {
      return {
        opening: `我站在高枝上，${weather}让羽毛有点沉`
      };
    }
    if (species === "熊") {
      return {
        opening: poachers > 45
          ? "洞口混进了人味，我刚蹭过树皮留记号"
          : "洞口只有树脂味，我刚蹭过树皮"
      };
    }
    if (species === "水貂") {
      return {
        opening: water < 52
          ? "胡须碰到水面，浅滩比昨天短了点"
          : water > 72 ? "胡须碰到新水面，浅滩往外长了" : "胡须碰到水面，浅滩还在原来的位置"
      };
    }
    if (species === "狮子") return { opening: `${phase}的热气贴着鬃毛，我先听草浪` };
    if (species === "豹子") return { opening: `斑点藏进树影里，尾巴先稳住` };
    if (species === "鳄鱼") return { opening: `水面盖着我的背，只把眼睛借给世界` };
    if (species === "野犬") return { opening: `耳朵已经竖好，小队的脚步在等风` };
    if (species === "斑马") return { opening: poachers > 45 || disease > 28 ? "条纹挤在一起，队尾的蹄声有点乱" : "条纹排成松散队形，队尾蹄声还稳" };
    if (species === "羚羊") return { opening: `腿已经预热，草尖一抖我就知道` };
    if (species === "长颈鹿") return { opening: season === "旱季" ? "我从树梢上看过去，远处尘土排得太直" : "我从树梢上看过去，新河汊把草地分成几段" };
    if (species === "大象") return { opening: water < 52 ? "鼻尖卷不到水汽，记忆正把我带向旧水路" : "鼻尖卷到水汽，旧水路在记忆里亮了一下" };
    if (species === "野兔") return { opening: `两只耳朵轮班听风，后腿已经留好退路` };
    if (species === "野猪") return { opening: `鼻尖拱开腐叶，泥土把昨夜的脚印翻了出来` };
    if (species === "鹰") return { opening: `上升气流托住翅尖，边界的直线藏不住` };
    if (species === "火烈鸟") return { opening: water < 48 ? "长腿踩到暖泥，浅水和小虾都少了一圈" : "长腿踩进浅水，小虾和水温都写在脚边" };
    if (species === "秃鹫") return { opening: disease > 28 ? "我沿热气流盘旋，病味让我先不落地" : "我沿热气流盘旋，地面的残骸会把故事抬上来" };
    if (species === "猫头鹰") return { opening: `${phase}的树洞很静，最轻的草响也逃不过耳朵` };
    if (species === "河马") return { opening: `鼻孔刚浮出河湾，水深和陌生脚步都闻得到` };
    if (species === "狐狸") return { opening: `尾巴扫过林缘，野兔味和人味得分开算` };
    return {
      opening: `${phase}风里有新味道，我先停下来听听`
    };
  }

  compactForestTime(dialogue) {
    const world = dialogue.world || {};
    const time = dialogue.time || {};
    return `${world.day || 1}日${time.phase || "未知"}，${world.weather || "未知天气"}`;
  }

  animalMicroMood(animal, dialogue) {
    const reserve = dialogue.reserve || {};
    const ecology = dialogue.ecology || {};
    const migration = reserve.migration || {};
    const water = ecology.water || 0;
    const disease = ecology.disease || 0;
    const predators = this.totalOf(ecology.predators || {});
    const herbivores = this.totalOf(ecology.herbivores || {});
    const poachers = reserve.poacherPressure || 0;
    if (animal.species === "鹿") {
      if ((migration.delta || 0) < 0) return `队伍薄了 ${Math.abs(migration.delta)} 个脚步声，我把幼鹿塞进灌木影里`;
      if (poachers > 50) return "直线脚印不对劲，鹿的好奇心今天放假";
      if (predators * 5 > Math.max(1, herbivores)) return "风里狼味太浓，空地先让给勇敢的家伙";
      if (water < 45) return "水边太挤，我喝两口就撤";
      return "草还够嚼，我只想低头过个普通早晨";
    }
    if (animal.species === "狼") {
      if ((migration.delta || 0) < 0) return "鹿味散开了，晚饭突然变成脑力题";
      if (disease > 28) return "那股病味不对，我的鼻子先投反对票";
      if (predators * 5 > Math.max(1, herbivores)) return "猎场太挤，脚印都快排队了";
      return "鹿群还没乱，我先省点体力";
    }
    if (animal.species === "乌鸦") {
      if (poachers > 50) return "树下有直线脚印，动物可没这么自信";
      if ((migration.delta || 0) < 0) return "少了几声回应，树冠突然空了一块";
      return "下面还没懂，风向已经换台了";
    }
    if (animal.species === "熊") {
      if (poachers > 50) return "金属味到洞外了，我今天不展示体型优势";
      if ((reserve.safety || reserve.stability || 0) < 48) return "洞口太吵，连矿盐点都不香了";
      return "地盘还算安静，我批准这片安静继续存在";
    }
    if (animal.species === "水貂") {
      if (water < 45) return "鱼退到深处，我很专业地扑空了两次";
      if (poachers > 50) return "芦苇断得太重，我贴水线溜了";
      return "鱼影还在，伏击点今天能营业";
    }
    if (animal.species === "狮子") {
      if ((migration.delta || 0) < 0) return "猎物队形薄了，狮群今天不能乱花力气";
      if (poachers > 50) return "草里有人味，鬃毛都不想张扬";
      return "队尾有点慢，黄昏会告诉我答案";
    }
    if (animal.species === "豹子") {
      if (poachers > 50) return "树影里混进金属味，我把尾巴收得更紧";
      return "灌丛还够密，我的斑点暂时很满意";
    }
    if (animal.species === "鳄鱼") {
      if (water < 45) return "水浅了，我露出的笑容有点太多";
      return "饮水线还在，我不急，水会替我等";
    }
    if (animal.species === "野犬") {
      if ((migration.delta || 0) < 0) return "队尾散了，小队今天少跑冤枉路";
      return "风线不错，耳朵和脚都想开工";
    }
    if (animal.species === "斑马") {
      if (poachers > 50) return "条纹不能排太直，幼崽先进队伍中间";
      if (water < 45) return "水边队伍变窄，蹄子都不敢太响";
      return "队形还稳，我把条纹交给阳光打乱";
    }
    if (animal.species === "羚羊") {
      if (predators * 5 > Math.max(1, herbivores)) return "草里眼神太多，我的腿先替脑子报警";
      return "风尖尖的，我先跳一下试试安全感";
    }
    if (animal.species === "长颈鹿") {
      if (poachers > 50) return "远处尘土太直，我不喜欢这种人类速度";
      return "树梢上的叶子还安静，我先当一会儿望塔";
    }
    if (animal.species === "大象") {
      if (water < 45) return "旧水路在记忆里发亮，幼象需要先喝到水";
      return "水汽还在，我带幼象慢慢走，不急但不乱";
    }
    if (animal.species === "野兔") {
      if (poachers > 50) return "泥边有直线脚印，今天洞口只开一条缝";
      if (predators * 5 > Math.max(1, herbivores)) return "天空和草里都有眼神，嫩草也得分几口吃";
      return "嫩草刚长软，耳朵听完一圈才轮到嘴巴";
    }
    if (animal.species === "野猪") {
      if (poachers > 50) return "泥里的金属味压过了根茎味，我不往那边拱";
      return "腐叶下面还有根茎，翻土这件事今天值得做";
    }
    if (animal.species === "鹰") {
      if (poachers > 50) return "边界尘线走得太直，高空看得比地面更清楚";
      return "气流很稳，野兔影子和巡护路线都没有打结";
    }
    if (animal.species === "火烈鸟") {
      if (water < 45) return "浅水缩成窄边，长腿也不能把水位撑高";
      if (disease > 28) return "群里咳声不对，今天粉色队伍要站散一点";
      return "小虾还在浅水里，队伍可以慢慢滤食";
    }
    if (animal.species === "秃鹫") {
      if (disease > 28) return "残骸的味道不对，清理也得先懂得拒绝";
      return "地面没有积着坏消息，我只需继续盘旋";
    }
    if (animal.species === "猫头鹰") {
      if (poachers > 50) return "夜里多了一束不该有的灯，树洞今晚不打盹";
      return "草响很轻，野兔路线正常，夜色暂时可信";
    }
    if (animal.species === "河马") {
      if (water < 45) return "河湾浅得连鼻孔都藏不住，大家还往这里挤";
      return "深水够泡，夜里上岸吃草也有退路";
    }
    if (animal.species === "狐狸") {
      if (poachers > 50) return "林缘的人味不划算，聪明不是每条路都去试";
      return "边缘路线还有野兔味，今天可以安静地借道";
    }
    return "身体比脑子先觉得不对";
  }

  animalMicroAction(animal, dialogue) {
    const reserve = dialogue.reserve || {};
    const ecology = dialogue.ecology || {};
    const poachers = reserve.poacherPressure || 0;
    const water = ecology.water || 0;
    if (poachers > 55) {
      if (animal.species === "鹿") return "我带队贴灌木走，别把脚步交出去";
      if (animal.species === "狼") return "我绕开人味，猎场不能被它们记住";
      if (animal.species === "乌鸦") return "我飞高一点，先把坏消息喊出去";
      if (animal.species === "熊") return "我退回洞边，先让树皮替我说话";
      if (animal.species === "水貂") return "我贴着水线滑走，小命比好奇心贵";
      if (animal.species === "狮子") return "我压低狮群，让草先替我们藏住";
      if (animal.species === "豹子") return "我退进树影，今天不把斑点借给阳光";
      if (animal.species === "鳄鱼") return "我沉到水下，只留一条看路的缝";
      if (animal.species === "野犬") return "我把小队叫散，别让脚印排成线";
      if (animal.species === "斑马") return "我把幼崽夹进条纹里，队形先乱一点";
      if (animal.species === "羚羊") return "我先弹开，别让危险猜到落点";
      if (animal.species === "长颈鹿") return "我把消息从树梢传下去";
      if (animal.species === "大象") return "我带幼象绕旧路，脚步放轻";
      if (animal.species === "野兔") return "我缩回洞线，只让耳朵留在外面";
      if (animal.species === "野猪") return "我先把泥里直线拱乱，再退进灌木";
      if (animal.species === "鹰") return "我升高盘旋，把人影位置记下来";
      if (animal.species === "火烈鸟") return "我带队离开浅岸，长腿不和枪声比快";
      if (animal.species === "秃鹫") return "我不落地，先沿气流确认那股坏味";
      if (animal.species === "猫头鹰") return "我缩回树洞，等那束陌生灯先走";
      if (animal.species === "河马") return "我沉进深水，把幼崽挡在河湾里面";
      if (animal.species === "狐狸") return "我沿林缘折返，不让尾巴留下直线";
      return "我先贴边走，别把自己写进坏消息里";
    }
    if (water < 45) return "下一步靠近稳一点的水线，动作要轻";
    if (animal.species === "乌鸦") return "我飞高一点，顺便把消息喊出去";
    if (animal.species === "狼") return "我压低身形，先闻清楚再追";
    if (animal.species === "鹿") return "我带队走慢线，幼鹿排中间";
    if (animal.species === "熊") return "我守着洞口，谁吵谁尴尬";
    if (animal.species === "水貂") return "我沿芦苇滑过去，不浪费一滴水声";
    if (animal.species === "狮子") return "我等黄昏，太阳太亮时不急着赢";
    if (animal.species === "豹子") return "我沿树影换位，尾巴不出卖我";
    if (animal.species === "鳄鱼") return "我继续贴水等，耐心是我的牙";
    if (animal.species === "野犬") return "我叫小队绕半圈，追风也要排队";
    if (animal.species === "斑马") return "我让队尾靠拢，条纹多一点更安全";
    if (animal.species === "羚羊") return "我先短跳试探，再决定跑不跑";
    if (animal.species === "长颈鹿") return "我继续望远，尘土不会骗高个子";
    if (animal.species === "大象") return "我按记忆走水路，幼象跟在影子里";
    if (animal.species === "野兔") return "我沿草边短跳，洞口始终留在身后";
    if (animal.species === "野猪") return "我继续翻腐叶，顺便给土壤松口气";
    if (animal.species === "鹰") return "我借上升气流巡一圈边界";
    if (animal.species === "火烈鸟") return "我跟着浅水线慢慢换一块滤食地";
    if (animal.species === "秃鹫") return "我继续盘旋，等地面给出清理信号";
    if (animal.species === "猫头鹰") return "我守到夜深，听清每一处草响";
    if (animal.species === "河马") return "我白天守深水，夜里再沿草线走";
    if (animal.species === "狐狸") return "我贴着林缘借路，哪里热闹就绕哪里";
    return "我先绕开最吵的地方";
  }

  animalStatusTag(animal, dialogue) {
    const reserve = dialogue.reserve || {};
    const ecology = dialogue.ecology || {};
    const migration = reserve.migration || {};
    const poachers = reserve.poacherPressure || 0;
    const water = ecology.water || 0;
    const disease = ecology.disease || 0;
    if ((migration.delta || 0) < 0) return animal.species === "狼" ? "追踪断线" : "队伍变薄";
    if (poachers > 55) return "警戒拉满";
    if (water < 45) return animal.species === "水貂" ? "浅滩告急" : "水线紧张";
    if (disease > 28) return "避开病味";
    if (dialogue.mood && dialogue.mood.stress > 70) return "高度紧张";
    if (animal.species === "熊") return "守着洞口";
    if (animal.species === "乌鸦") return "树冠放哨";
    return "观察中";
  }

  cleanGameText(text) {
    return String(text || "")
      .replace(/^第\s*\d+\s*日[，,\s]*/g, "")
      .replace(/^今天发生了[:：]?/g, "")
      .replace(/^我现在想[:：]?/g, "")
      .replace(/^我在担心[:：]?/g, "")
      .replace(/^地图画面[:：]?/g, "")
      .replace(/。+/g, "。")
      .trim();
  }

  shortGameText(text, maxLen) {
    const clean = this.cleanGameText(text);
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, Math.max(8, maxLen - 1))}…`;
  }

  createAnimalDialogueContext(animal) {
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const ecology = reserve.ecology || {};
    const time = world.time || {};
    const region = this.animalCurrentRegion(animal);
    const relatedEvent = this.latestAnimalMapEvent(animal, region);
    const movement = ((world.npcMovements || []).find((item) => item.actorId === animal.id || item.actorId === animal.sourceId)) || null;
    const rumors = world.rumors || [];
    const forestDirector = world.aiForest || null;
    const mood = animal.aiMood || (forestDirector && forestDirector.animalMoods && forestDirector.animalMoods[animal.id]) || null;
    this.dialogueCounter = (this.dialogueCounter || 0) + 1;
    const click = this.dialogueCounter;
    const baseSeed = this.hashString([
      animal.id,
      world.day || 1,
      time.hour || 0,
      time.phase || "",
      world.weather || "",
      (relatedEvent && relatedEvent.id) || "",
      (movement && movement.label) || ""
    ].join("|"));
    const seed = baseSeed + click;
    return {
      world,
      reserve,
      ecology,
      time,
      click,
      baseSeed,
      seed,
      region,
      relatedEvent,
      movement,
      forestDirector,
      mood,
      chapter: getCurrentChapter(reserve),
      lastPlayerAction: world.lastPlayerAction || ((world.actionHistory || [])[Math.max(0, (world.actionHistory || []).length - 1)]) || null,
      actionHistory: world.actionHistory || [],
      rumor: rumors.length ? rumors[Math.abs(seed) % rumors.length] : "",
      knowledge: ((world.natureKnowledge || [])[Math.abs(seed + 3) % Math.max(1, (world.natureKnowledge || []).length)]) || "",
      timeLabel: `第 ${world.day || 1} 日 ${time.phase || "未知时段"} ${time.hour || "--"}:00 · ${world.season || "季节未知"}第 ${time.seasonDay || "?"} 天 · ${world.weather || "天气未知"} · ${time.moon || "月相未知"}`
    };
  }

  previewAnimalDialogueContext(animal, offset = 0) {
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const ecology = reserve.ecology || {};
    const time = world.time || {};
    const region = this.animalCurrentRegion(animal);
    const relatedEvent = this.latestAnimalMapEvent(animal, region);
    const movement = ((world.npcMovements || []).find((item) => item.actorId === animal.id || item.actorId === animal.sourceId)) || null;
    const rumors = world.rumors || [];
    const forestDirector = world.aiForest || null;
    const mood = animal.aiMood || (forestDirector && forestDirector.animalMoods && forestDirector.animalMoods[animal.id]) || null;
    const baseSeed = this.hashString([
      animal.id,
      world.day || 1,
      time.hour || 0,
      time.phase || "",
      world.weather || "",
      (relatedEvent && relatedEvent.id) || "",
      (movement && movement.label) || ""
    ].join("|"));
    const seed = baseSeed + offset;
    return {
      world,
      reserve,
      ecology,
      time,
      click: offset,
      baseSeed,
      seed,
      region,
      relatedEvent,
      movement,
      forestDirector,
      mood,
      chapter: getCurrentChapter(reserve),
      lastPlayerAction: world.lastPlayerAction || ((world.actionHistory || [])[Math.max(0, (world.actionHistory || []).length - 1)]) || null,
      actionHistory: world.actionHistory || [],
      rumor: rumors.length ? rumors[Math.abs(seed) % rumors.length] : "",
      knowledge: ((world.natureKnowledge || [])[Math.abs(seed + 3) % Math.max(1, (world.natureKnowledge || []).length)]) || "",
      timeLabel: `第 ${world.day || 1} 日 ${time.phase || "未知时段"} ${time.hour || "--"}:00 · ${world.season || "季节未知"}第 ${time.seasonDay || "?"} 天 · ${world.weather || "天气未知"} · ${time.moon || "月相未知"}`
    };
  }

  animalRecentDialogues(animal, count = 4) {
    const contexts = [1, 2, 3, 4, 5].map((offset) => this.previewAnimalDialogueContext(animal, offset));
    const playerMemory = this.animalPlayerMemoryLine(animal, contexts[0]);
    const raw = [
      this.animalTodayEvent(animal, contexts[0]),
      playerMemory,
      this.animalConcern(animal, contexts[1]),
      this.animalNextMove(animal, contexts[2]),
      this.animalSpeech(animal, contexts[3]),
      this.animalLiveMonologue(animal, contexts[4], { liveTime: this.compactForestTime(contexts[4]) })
    ];
    const lines = [];
    raw.forEach((line) => {
      const text = this.shortGameText(line, 28);
      if (text && !lines.includes(text)) lines.push(text);
    });
    return lines.slice(0, Math.max(3, Math.min(5, count)));
  }

  animalPlayerMemoryLine(animal, context) {
    const dialogue = context || {};
    const action = dialogue.lastPlayerAction;
    if (!action || !action.action) return "";
    const delta = action.delta || {};
    const species = (animal && animal.species) || "";
    const location = action.location || "保护区";
    if (action.action === "antiPoacher" || action.action === "houndScout") {
      if (species === "鹿") return `你昨天让猎犬压过${location}，今天幼鹿敢多低头吃两口。`;
      if (species === "乌鸦") return `你查过那条线，我少叫了两声，树冠暂时不用报警到破音。`;
      if (species === "狼") return `边界脚步少了，我追鹿时不用先绕三圈确认人味。`;
      return `你把边界气味清了一遍，我今天敢把路线往里挪一点。`;
    }
    if (action.action === "habitat") {
      if (species === "水貂" || species === "鳄鱼" || species === "河马") return `你修过水线，浅滩没那么抠门了，我的地盘终于像地盘。`;
      if (species === "鹿" || species === "斑马" || species === "羚羊") return `你补了水草，我闻到路线变软了，胃先替我表示认可。`;
      return `你修过栖息地，今天风里少了一点搬家的味道。`;
    }
    if (action.action === "salvage") {
      return `你做了合规回收，账本厚了一点；我只关心脚步别因此变多。`;
    }
    if (action.action === "buySupplies") {
      return `你把补给补上了，猎犬明天跑得动，坏脚印最好自己识相。`;
    }
    if (action.action === "intervention") {
      if (species === "鹿") return `那次麻醉味我记得。草场轻松些了，但我会先离你远一点。`;
      if (species === "狼") return `你动过鹿群路线，我闻得到变化。少点莽撞，多点风向。`;
      return `你干预过种群，我会记住那阵陌生气味，也会看结果。`;
    }
    return `你在${location}做过事，森林已经把这件事记进路线里。`;
  }

  animalCurrentRegion(animal) {
    const regions = (this.state.world && this.state.world.regions) || [];
    const targetId = animal.intent && animal.intent.targetRegionId;
    return regions.find((region) => region.id === targetId) || regions.find((region) => region.name === animal.location) || null;
  }

  latestAnimalMapEvent(animal, region) {
    const events = this.activeSandboxMapEvents(this.state.world || {}).slice().reverse()
      .filter((event) => this.animalMapEventRelevant(animal, event));
    if (!events.length) return null;
    if (region) {
      const local = events.find((event) => event.regionId === region.id);
      if (local) return local;
    }
    const targetId = animal.intent && animal.intent.targetRegionId;
    if (targetId) {
      const targeted = events.find((event) => event.regionId === targetId);
      if (targeted) return targeted;
    }
    return events[0] || null;
  }

  animalMapEventRelevant(animal, event = {}) {
    if (!animal || !event) return false;
    if (event.animalId && event.animalId === animal.id) return true;
    const species = animal.species || "";
    const text = `${event.title || ""} ${event.label || ""} ${event.body || ""} ${event.impact || ""}`;
    if (/基金|采购|补给|拨款|移交/.test(text)) return false;
    if (/偷猎|脚印|陷阱|人影|枪|边界|警报|疾病|病味/.test(text)) return true;
    if (/水|水线|浅滩|河|湖|鱼|饮水/.test(text)) {
      return ["水貂", "河马", "鳄鱼", "火烈鸟", "大象", "鹿", "羚羊", "斑马", "野兔", "长颈鹿"].includes(species);
    }
    if (/草|草场|牧场|食地/.test(text)) {
      return this.isGrazerSpecies(species) || ["狼", "狮子", "豹子", "野犬"].includes(species);
    }
    if (/迁移|迁徙|路线|移动|离开|归队|回流/.test(text)) {
      return this.isGrazerSpecies(species) || this.isPredatorSpecies(species) || ["鹰", "秃鹫", "乌鸦"].includes(species);
    }
    return false;
  }

  animalEventLead(dialogue) {
    const event = dialogue && dialogue.relatedEvent;
    if (!event) return "";
    const text = `${event.label || ""} ${event.body || ""} ${event.impact || ""}`;
    const region = (dialogue.region && dialogue.region.name) || "附近";
    if (/偷猎|脚印|陷阱|人影|枪|边界|警报/.test(text)) return `${region}有脚印`;
    if (/水|水线|浅滩|河|湖|鱼|饮水/.test(text)) return `${region}水线在变`;
    if (/恢复|修复|回归|好转|安定/.test(text)) return `${region}正在恢复`;
    if (/迁移|路线|移动|离开|归队/.test(text)) return `${region}路线变了`;
    return `${region}有新动静`;
  }

  dialoguePick(context, salt, options) {
    if (!options || !options.length) return "";
    const seed = (context && (context.baseSeed !== undefined ? context.baseSeed : context.seed)) || 0;
    const click = (context && context.click) || 0;
    const index = Math.abs(seed + this.hashString(String(salt || "")) + click) % options.length;
    return options[index];
  }

  hashString(value) {
    let hash = 0;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    return hash;
  }

  animalTodayEvent(animal, context) {
    const dialogue = context || this.animalDialogueContexts[animal.id] || this.createAnimalDialogueContext(animal);
    const world = dialogue.world || this.state.world || {};
    const reserve = dialogue.reserve || world.reserve || {};
    const ecology = dialogue.ecology || reserve.ecology || {};
    const migration = reserve.migration || {};
    const water = ecology.water || 0;
    const disease = ecology.disease || 0;
    const predators = this.totalOf(ecology.predators || {});
    const herbivores = this.totalOf(ecology.herbivores || {});
    const safety = reserve.safety || reserve.stability || 0;
    const poachers = reserve.poacherPressure || 0;
    const delta = migration.delta || 0;
    const eventText = dialogue.relatedEvent ? `${dialogue.relatedEvent.label || "异常"}出现在${(dialogue.region && dialogue.region.name) || "附近"}` : "";
    const movementText = dialogue.movement ? dialogue.movement.label : "";
    const timePrefix = `${dialogue.time.phase || "刚才"}`;
    const view = world.reserveView || reserve.reserveView || (dialogue.forestDirector && dialogue.forestDirector.reserveView) || null;
    const animalState = view && (view.outcome || (view.states || []).find((item) => item.id === "animal"));
    const marker = view && (view.mapMarkers || [])[Math.abs((dialogue.seed || 0) + (animal.id || "").length) % Math.max(1, (view.mapMarkers || []).length)];
    // A generic reserve summary must never hide an animal's lived condition.
    // Migration, water shortage and disease are more useful to the player than
    // a repeated "stable" sentence, so the summary is only used on quiet days.
    const hasLivedPressure = (migration.delta || 0) !== 0
      || poachers > 50
      || water < 45
      || disease > 28;
    if (animalState && !hasLivedPressure && dialogue.click % 2 === 1) {
      const speciesName = animal.shortName || animal.name || animal.species || "我";
      const reason = marker && marker.impact ? marker.impact : animalState.reason;
      const action = reserveActionLabel((marker && marker.recommendAction) || animalState.action || "houndScout");
      return `${speciesName}今天${animalState.value}：${reason}。建议${action}，别让明天更难。`;
    }
    if (dialogue.mood && dialogue.mood.livedEvent) {
      const moodLine = this.dialoguePick(dialogue, `mood-event-${animal.id}`, [
        dialogue.mood.livedEvent,
        `${timePrefix}，${dialogue.mood.livedEvent}`,
        `${dialogue.mood.regionName || "附近"}：${dialogue.mood.summary || dialogue.mood.livedEvent}`
      ]);
      if (moodLine) return moodLine;
    }
    if (animal.species === "鹿") {
      if (delta < 0) return this.dialoguePick(dialogue, "deer-loss", [
        `${timePrefix}鹿群少了 ${Math.abs(delta)} 个同伴，我把幼鹿带离了风口。`,
        `刚才点名时少了 ${Math.abs(delta)} 个熟悉的脚步声，它们往更安静的边界去了。`,
        `今天队伍薄了一截，幸好我跑得快，幼鹿还跟得上。${eventText}`
      ]);
      if (poachers > 50) return this.dialoguePick(dialogue, "deer-poacher", [
        `${timePrefix}有陌生人的味道靠近水线，我带着幼鹿绕了一大圈。`,
        `我听见不属于森林的脚步声，先跑了。跑得不优雅，但活下来比姿势重要。`,
        `刚才草丛断得太整齐，我没过去确认，幼鹿也不需要这种好奇心。`
      ]);
      if (predators * 5 > herbivores) return this.dialoguePick(dialogue, "deer-predator", [
        "水边捕食者太多，几只年轻鹿没敢下来喝水。",
        "风里狼味很重，我让队伍贴着灌木走，少走空地。",
        `${movementText || "捕食者在移动"}，我们今天不赌运气。`
      ]);
      if (water < 45) return this.dialoguePick(dialogue, "deer-water", [
        "饮水点变浅，队伍排得很长，幼鹿差点被挤散。",
        "水边泥地太窄，我喝了两口就让位，活着不能太贪杯。",
        `今天${world.weather || "天气"}，水线还是紧，我得重新安排路线。`
      ]);
      return this.dialoguePick(dialogue, "deer-calm", [
        "今天草甸还能吃，我把幼鹿带到风小的地方慢慢走。",
        `现在是${dialogue.time.phase || "某个时段"}，草还湿着，适合安静低头吃一会儿。`,
        `${dialogue.rumor || "林子里暂时没有太坏的消息"}，我先把这当作好消息。`
      ]);
    }
    if (animal.species === "狼") {
      if (delta < 0) return this.dialoguePick(dialogue, "wolf-loss", [
        "鹿群今天散得更开，我追到一半就放弃了，省体力比逞强重要。",
        `少了 ${Math.abs(delta)} 只可追的影子，晚饭开始变得有数学难度。`,
        "猎物一散，狼群也得少跑冤枉路，风向比情绪可靠。"
      ]);
      if (disease > 28) return this.dialoguePick(dialogue, "wolf-disease", [
        "我闻到一股不健康的气味，绕开了那片灌木。",
        "异常气味不值得逞强，病弱不等于安全食物。",
        `${dialogue.knowledge || "病虫害会改变动物路线"}，我的鼻子同意这句话。`
      ]);
      if (predators * 5 > herbivores) return this.dialoguePick(dialogue, "wolf-crowded", [
        "猎场里捕食者太密，连脚印都像在排队。",
        "大家都盯着同一条饮水线，鹿群不跑才奇怪。",
        `${dialogue.time.phase || "刚才"}我闻到太多同类压力，今晚不适合硬追。`
      ]);
      return this.dialoguePick(dialogue, "wolf-normal", [
        "我跟着鹿群边缘走，没有急着冲，风向比勇气更有用。",
        `${dialogue.time.phase || "现在"}气味还新，我先压低身形，别把猎物吓散。`,
        `${movementText || "我在巡边"}，不是为了打架，是为了知道鹿群下一步。`
      ]);
    }
    if (animal.species === "乌鸦") {
      if (poachers > 50) return this.dialoguePick(dialogue, "crow-poacher", [
        "我在树冠上看见直线脚印，动物不会那样走路。",
        "有金属味从林边冒上来，我已经把坏消息挂到树冠了。",
        `${eventText || "边界有异常"}，我不是紧张，我只是视力好。`
      ]);
      if (delta < 0) return this.dialoguePick(dialogue, "crow-loss", [
        `今天林子里少了 ${Math.abs(delta)} 份熟悉的叫声，迁移路线变冷了。`,
        "少了几声回应，树冠突然显得很空。",
        `${dialogue.time.phase || "刚才"}我喊了两遍，回声比同伴多。`
      ]);
      return this.dialoguePick(dialogue, "crow-normal", [
        "我从高处看见水线和草线都在变，消息够多，嗓子有点忙。",
        `${dialogue.rumor || "今天没有大坏消息"}，这句话我愿意多说一次。`,
        `${dialogue.relatedEvent ? dialogue.relatedEvent.label : "风向"}变了，下面的动物还没都反应过来。`
      ]);
    }
    if (animal.species === "熊") {
      if (poachers > 50) return this.dialoguePick(dialogue, "bear-poacher", [
        "洞外有陌生金属味，我没出去硬碰，先把边界重新蹭了一遍。",
        "今天洞口外的味道不对，我决定先不展示体型优势。",
        `${timePrefix}我听见干枝断得太齐，退回洞边是明智，不是胆小。`
      ]);
      if (safety < 48) return this.dialoguePick(dialogue, "bear-noisy", [
        "洞口附近太吵，我把白天活动时间压短了。",
        "今天外面动静太多，我连矿盐点都只看了一眼。",
        "安全低的时候，大块头也需要一点安静。"
      ]);
      return this.dialoguePick(dialogue, "bear-normal", [
        "今天洞域还算安静，我检查了矿盐点，没有发现太多新脚印。",
        `${dialogue.time.phase || "现在"}适合慢慢巡边，别把我的洞口变成集市。`,
        `${dialogue.rumor || "外面暂时没大事"}，我批准这片安静继续存在。`
      ]);
    }
    if (animal.species === "水貂") {
      if (water < 45) return this.dialoguePick(dialogue, "mink-water", [
        "浅滩水位低了，鱼退到深处，我今天扑空了两次。",
        "鱼少了不是心情问题，是水位问题。我很专业地饿着。",
        `${world.weather || "天气"}没把水补回来，我的伏击点缩水了。`
      ]);
      if (poachers > 50) return this.dialoguePick(dialogue, "mink-poacher", [
        "芦苇边有不属于动物的断枝，我贴着水线躲开了。",
        "岸边脚印太重，我没有过去闻第二次，水貂也懂珍惜小命。",
        `${eventText || "浅滩边有异常"}，我先把身体贴低，别问，问就是经验。`
      ]);
      return this.dialoguePick(dialogue, "mink-normal", [
        "湖岸还稳，鱼群没有大乱，我沿浅滩巡了一圈。",
        `${dialogue.time.phase || "现在"}水面还亮，鱼影能看见，我心情暂时合格。`,
        `${dialogue.relatedEvent ? dialogue.relatedEvent.label : "湖面波光"}还在，我的伏击点今天能营业。`
      ]);
    }
    return "我今天根据气味、脚印和同类动静调整了路线。";
  }

  animalConcern(animal, context) {
    const dialogue = context || this.animalDialogueContexts[animal.id] || this.createAnimalDialogueContext(animal);
    const reserve = dialogue.reserve || this.state.world.reserve || {};
    const ecology = dialogue.ecology || reserve.ecology || {};
    const water = ecology.water || 0;
    const grass = ecology.grass || 0;
    const disease = ecology.disease || 0;
    const predators = this.totalOf(ecology.predators || {});
    const herbivores = this.totalOf(ecology.herbivores || {});
    const safety = reserve.safety || reserve.stability || 0;
    const poachers = reserve.poacherPressure || 0;
    const migration = reserve.migration || {};
    if (dialogue.mood && dialogue.mood.concern) {
      return this.dialoguePick(dialogue, `mood-concern-${animal.id}`, [
        dialogue.mood.concern,
        `${dialogue.time.phase || "现在"}最让我紧张的是：${dialogue.mood.concern}`,
        `${dialogue.mood.summary || "森林状态变了"}，所以我担心${dialogue.mood.concern}`
      ]);
    }
    if ((migration.delta || 0) < 0) return this.dialoguePick(dialogue, "concern-loss", [
      "同伴变少不是数字变化，是路线记忆断了一截。",
      `第 ${dialogue.world.day || 1} 日少了熟悉动静，明天的路线会更保守。`,
      "队伍一薄，水边、草地和逃跑顺序都要重新算。"
    ]);
    if (poachers > 55) return this.dialoguePick(dialogue, "concern-poacher", [
      "陌生脚印太直，像人类在赶路，不像动物在找路。",
      `${dialogue.time.phase || "刚才"}的风把金属味吹进来了，我不想验证第二次。`,
      "偷猎压力高的时候，固定路线会变成危险习惯。"
    ]);
    if (disease > 28) return "病虫害会先让弱小个体掉队，群体会变得保守。";
    if (water < 45) return this.dialoguePick(dialogue, "concern-water", [
      "饮水点变少，大家会挤到同一条线上，冲突也会变多。",
      `${dialogue.world.weather || "天气"}之后水位仍低，水边会变成拥堵路口。`,
      "水少的时候，胆小和谨慎会突然变成同一种智慧。"
    ]);
    if (predators * 5 > Math.max(1, herbivores)) return "捕食者太密，食草动物会减少停留时间。";
    if (grass < 48) return "草场恢复慢，迁入越多，嘴巴越多，压力也越多。";
    if (safety < 52) return "保护区不够安静，迁移路线会开始试探边界。";
    return this.dialoguePick(dialogue, "concern-normal", [
      "今天最大的担心是你太用力管理。自然需要照看，也需要一点余地。",
      `${dialogue.relatedEvent ? dialogue.relatedEvent.label : "最新动静"}不算坏事，但我还要再观察一会儿。`,
      `${dialogue.time.phase || "现在"}风向还可以，我担心的是夜里会不会变。`
    ]);
  }

  animalNextMove(animal, context) {
    const dialogue = context || this.animalDialogueContexts[animal.id] || this.createAnimalDialogueContext(animal);
    const intent = animal.intent || {};
    const reserve = dialogue.reserve || this.state.world.reserve || {};
    const ecology = dialogue.ecology || reserve.ecology || {};
    const safety = reserve.safety || reserve.stability || 0;
    const poachers = reserve.poacherPressure || 0;
    const water = ecology.water || 0;
    const directedMove = (dialogue.mood && dialogue.mood.nextMove) || intent.label;
    if (directedMove) return this.dialoguePick(dialogue, "move-intent", [
      directedMove,
      `${dialogue.time.phase || "现在"}继续${directedMove}`,
      `${directedMove}，但会避开${dialogue.relatedEvent ? dialogue.relatedEvent.label : "最新异常"}`
    ]);
    if (poachers > 55) return "先退到树线后面，等猎犬把异常气味查清楚。";
    if (water < 45) return "缩短活动半径，优先靠近还稳定的水源。";
    if (safety > 70) return "继续在核心区活动，把这里当成可靠地盘。";
    if (animal.species === "乌鸦") return "飞高一点，把新的风险消息带给附近动物。";
    if (animal.species === "狼") return "绕开水边冲突，跟着鹿群边缘慢慢巡。";
    if (animal.species === "鹿") return "带着幼鹿走慢线，离开过吵的边界。";
    return "保持观察，等环境给出下一步信号。";
  }

  drawSelectionPulse(ctx, x, y, radius, color) {
    const t = this.animT() * 0.004;
    const pulse = 0.82 + Math.sin(t) * 0.12;
    ctx.save();
    ctx.strokeStyle = this.rgba(color, 0.82);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(x, y + 12, radius * 1.28 * pulse, radius * 0.52 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255, 248, 223, 0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(x, y + 12, radius * 0.78, radius * 0.32, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  animalSpeech(animal, context) {
    const dialogue = context || this.animalDialogueContexts[animal.id] || this.createAnimalDialogueContext(animal);
    const world = dialogue.world || this.state.world || {};
    const reserve = dialogue.reserve || world.reserve || {};
    const ecology = dialogue.ecology || reserve.ecology || {};
    const migration = reserve.migration || {};
    const water = ecology.water || 0;
    const grass = ecology.grass || 0;
    const disease = ecology.disease || 0;
    const predators = this.totalOf(ecology.predators || {});
    const herbivores = this.totalOf(ecology.herbivores || {});
    const safety = reserve.safety || reserve.stability || 0;
    const poachers = reserve.poacherPressure || 0;
    const lastRaid = reserve.league && reserve.league.lastRaid;
    const memory = ((animal.memory || [])[animal.memory.length - 1]) || animal.insight || animal.wisdom || "";
    const playerMemory = this.animalPlayerMemoryLine(animal, dialogue);
    const knowledge = ((world.natureKnowledge || [])[world.natureKnowledge.length - 1]) || "";
    const intent = animal.intent && animal.intent.label ? `我今天会${animal.intent.label}。` : "";
    if (playerMemory && (dialogue.click || 0) % 5 === 0) return playerMemory;
    if (animal.species === "鹿") {
      if ((migration.delta || 0) < 0) return this.dialoguePick(dialogue, "speech-deer-loss", [
        `今天我的伙伴又少了 ${Math.abs(migration.delta)} 个。幸好我及时带幼鹿钻进灌木，不然水边那阵骚动会把我们冲散。`,
        `第 ${world.day || 1} 日${dialogue.time.phase || ""}，队伍又薄了。少掉的不是数字，是我身后少了几次呼吸声。`,
        `刚才我回头数了一遍，少了 ${Math.abs(migration.delta)} 个熟悉影子。我不想逞强，先把幼鹿带到灌木后面。`
      ]);
      if (poachers > 50) return this.dialoguePick(dialogue, "speech-deer-poacher", [
        "我听见不属于森林的脚步声，先跑了。跑得不优雅，但活下来比姿势重要。",
        `${dialogue.time.phase || "刚才"}风里有金属味，我没有回头确认。鹿的好奇心太贵了。`,
        `今天${world.weather || "天气不明"}，气味断断续续。我只知道那不是狼，也不是同伴。`
      ]);
      if (disease > 28) return `我会让幼鹿少走湿草地，病虫害不是小麻烦。${memory || "群体会先保护弱小个体。"} ${intent}`;
      if (safety < 50) return this.dialoguePick(dialogue, "speech-deer-safety", [
        "边界外听起来更安静，这让我有点心动。安全再低一点，鹿群就会认真考虑搬家。",
        `${dialogue.time.phase || "现在"}核心区不够安静，我已经让队伍把耳朵朝边界转了。`,
        "安全感不是口号，是幼鹿敢不敢低头吃草。今天它们抬头太多次了。"
      ]);
      if ((migration.delta || 0) > 0) return this.dialoguePick(dialogue, "speech-deer-in", [
        "昨夜有同类回来了，我欢迎新邻居，但草场不是自助餐无限续盘。",
        `今天多了 ${migration.delta} 个新脚步，热闹是热闹，草也是真的会少。`,
        "新来的鹿闻起来很紧张。希望这里真的比它们来的地方安全。"
      ]);
      return this.dialoguePick(dialogue, "speech-deer-normal", [
        `水源 ${water}，草场 ${grass}。如果偷猎者少一点，我可以把今天安排成低压力散步。`,
        `${dialogue.time.phase || "现在"}的草还行，我想把今天过成普通的一天，普通很珍贵。`,
        `${dialogue.rumor || "没有新的坏消息"}。我先相信半句，另一半交给耳朵。`
      ]);
    }
    if (animal.species === "狼") {
      if ((migration.delta || 0) < 0) return this.dialoguePick(dialogue, "speech-wolf-loss", [
        "鹿群少了，我也不能装作没看见。猎物一散，狼群就得少跑冤枉路，不然晚饭和体力一起丢。",
        `今天少了 ${Math.abs(migration.delta)} 份鹿味，我追到一半停了。聪明的狼知道什么时候不追。`,
        `${dialogue.time.phase || "刚才"}的风把鹿味吹断了，晚饭计划需要重写。`
      ]);
      if (disease > 28) return this.dialoguePick(dialogue, "speech-wolf-disease", [
        `我会避开异常气味。聪明的捕食者不是逞强，是知道哪顿饭不该吃。${memory}`,
        "那股病味不对。我不是挑食，我是在保护狼群的肚子。",
        `${dialogue.knowledge || "病虫害会改变动物路线"}，鼻子已经提前签字。`
      ]);
      if (predators * 5 > herbivores) return this.dialoguePick(dialogue, "speech-wolf-crowded", [
        "猎场太紧了，大家都盯着同一条饮水线，这种内卷会把鹿群吓走。",
        "水边捕食者太密，连我都觉得拥挤。鹿群会把这叫作搬家理由。",
        `${dialogue.time.phase || "现在"}脚印太乱，我先等风把没用的信息吹走。`
      ]);
      return this.dialoguePick(dialogue, "speech-wolf-normal", [
        `我沿着鹿群气味巡边。别紧张，我不是乱杀，我是在读生态菜单。${memory || "安全等级越稳，猎物越不会散。"} `,
        `${dialogue.time.phase || "现在"}气味还新，我压低身形跟着边缘走。扑出去之前，先问风。`,
        `${dialogue.movement ? dialogue.movement.label : "我在巡边"}。森林不是赛跑，先读懂路线的人省体力。`
      ]);
    }
    if (animal.species === "乌鸦") {
      if (poachers > 50) return this.dialoguePick(dialogue, "speech-crow-poacher", [
        "林外有人的金属味，脚步还不懂得绕开枯枝。我会把这条消息传到树冠上。",
        `${dialogue.time.phase || "刚才"}我看见直线脚印。动物会犹豫，人类才走得那么自信。`,
        "边界那股味道不对，我已经叫了三声，第四声留给更坏的消息。"
      ]);
      if ((migration.delta || 0) < 0) return this.dialoguePick(dialogue, "speech-crow-loss", [
        `今天少了 ${Math.abs(migration.delta)} 份熟悉的动静。森林安静得太整齐，通常不是好事。`,
        `我喊了两遍，少了 ${Math.abs(migration.delta)} 个回应。树冠很高，但安静会爬上来。`,
        `${dialogue.time.phase || "现在"}下面少了几条路线，我会记住这个空白。`
      ]);
      if (lastRaid) return `我看见基地战报了：${lastRaid}`;
      return this.dialoguePick(dialogue, "speech-crow-normal", [
        `${knowledge || "从树冠看，迁移路线和水源亮度都变了。"} 这片林子不是静态地图，是每天都在改稿。`,
        `${dialogue.rumor || "今天消息不算少"}。我负责广播，至于谁听懂，那是地面部门的事。`,
        `${dialogue.relatedEvent ? dialogue.relatedEvent.label : "风向"}刚变，我先把消息挂到最高的树枝上。`
      ]);
    }
    if (animal.species === "熊") {
      if (poachers > 50) return this.dialoguePick(dialogue, "speech-bear-poacher", [
        "洞外那股金属味让我不舒服。我今天没硬顶，先退回阴影里，明天再看谁更有耐心。",
        `${dialogue.time.phase || "刚才"}洞口外有陌生味道。我体型大，不代表我要把自己送出去当靶子。`,
        "外面脚步太直，我先不出洞。耐心也是一种体重优势。"
      ]);
      if (safety < 48) return this.dialoguePick(dialogue, "speech-bear-safety", [
        "洞域外太吵。连我这种体型都想换个安静角落，说明安全等级真的该修了。",
        "我今天缩短了活动时间。不是懒，是外面的动静不值得。",
        `${dialogue.time.phase || "现在"}洞口不安静，我会把边界标得更重。`
      ]);
      return this.dialoguePick(dialogue, "speech-bear-normal", [
        `我不关心排名，我关心洞口有没有人乱晃。${memory || "防护网变强后，夜里少了很多脚步。"} `,
        `${dialogue.time.phase || "现在"}洞域还算稳，我允许这份安静继续存在。`,
        `${dialogue.relatedEvent ? dialogue.relatedEvent.label : "矿盐点"}没有闹大，今天可以少发一点脾气。`
      ]);
    }
    if (animal.species === "水貂") {
      if (water < 45) return this.dialoguePick(dialogue, "speech-mink-water", [
        "湖岸变浅，鱼也变少。今天扑空两次后我决定冷静一点，毕竟生气也不能把鱼骂回来。",
        `${dialogue.time.phase || "刚才"}浅滩少了一截，我的伏击点被水位偷走了。`,
        `水源 ${water}，鱼影往深处走。我不是焦虑，我只是很准确地饿。`
      ]);
      if (poachers > 50) return this.dialoguePick(dialogue, "speech-mink-poacher", [
        "芦苇被踩断的角度不对。我没有过去闻第二次，水貂也懂得珍惜小命。",
        `${dialogue.time.phase || "刚才"}岸边脚印太重，我贴着水线退开了。`,
        "那不是鱼，也不是鹿，是会带来麻烦的脚步声。"
      ]);
      return this.dialoguePick(dialogue, "speech-mink-normal", [
        `水边今天还稳。${memory || "只要伏击和偷猎少，饮水线就不会崩。"} 我先贴着浅滩巡一圈。`,
        `${dialogue.time.phase || "现在"}水面还亮，鱼影还在，我的心情暂时合格。`,
        `${dialogue.relatedEvent ? dialogue.relatedEvent.label : "湖面"}没有吵起来，我的伏击点今天能营业。`
      ]);
    }
    return `${animal.personality || "我能感觉到安全等级、水源和偷猎压力的变化"}，所以我的路线也会变。你看到的是图，我闻到的是明天。`;
  }

  migrationLabel(migration, reserve = ((this.state.world || {}).reserve || {})) {
    const consistent = consistentMigrationSnapshot(reserve, migration || reserve.migration || {});
    const delta = consistent.delta || 0;
    if (delta > 0) return `迁入 +${delta}`;
    if (delta < 0) return `迁出 ${Math.abs(delta)}`;
    return "观望";
  }

  sandboxInfoDockHeight() {
    return 112;
  }

  reserveProsperitySummary(reserve = (this.state.world || {}).reserve || {}, world = this.state.world || {}) {
    const ecology = (reserve && reserve.ecology) || {};
    const progression = this.reserveProgression(reserve || {});
    const speciesCount = getUnlockedSpecies(progression.level || 1).length;
    const animalTotal = this.totalOf(ecology.predators || {}) + this.totalOf(ecology.herbivores || {}) + this.totalOf(ecology.birds || {});
    const base = reserve.base || {};
    const protectedAnimals = this.totalOf(base.protectedAnimals || {});
    const rareAnimals = base.rareAnimals || 0;
    const business = typeof reserve.business === "number"
      ? reserve.business
      : Math.round(((reserve.enforcement || 48) * 0.35) + ((reserve.reputation || 50) * 0.28) + (Math.min(100, (reserve.fund || 0) / 14) * 0.22) + ((base.shield || 40) * 0.15));
    const ecologyScore = typeof reserve.ecologyScore === "number"
      ? reserve.ecologyScore
      : Math.round(((reserve.stability || 60) * 0.45) + ((ecology.water || 60) * 0.28) + ((ecology.grass || 60) * 0.22) + ((100 - (ecology.disease || 10)) * 0.05));
    const facilityValue = (base.fence || 0) * 120 + (base.watchtower || 0) * 160 + (base.kennel || 0) * 140;
    const trustAvg = this.averageAnimalTrust(world.knownCharacters || []);
    const prosperityScore = Math.max(0, Math.round(
      (progression.score || 0) * 0.44
      + Math.min(100, speciesCount * 5) * 0.18
      + Math.min(100, animalTotal / 4) * 0.18
      + trustAvg * 0.12
      + Math.min(100, (base.rating || 1000) / 18) * 0.08
    ));
    const value = Math.max(0, Math.round(
      1000
      + (reserve.safety || reserve.stability || 50) * 10
      + ecologyScore * 22
      + business * 8
      + protectedAnimals * 28
      + rareAnimals * 160
      + facilityValue
    ));
    const next = progression.nextTitle || "更高保护区";
    return {
      level: progression.level || 1,
      stage: progression.stage || (progression.level || 1) * 2 - 1,
      title: progression.title || "稳定保护站",
      score: prosperityScore,
      speciesCount,
      animalTotal,
      value,
      next,
      progress: Math.max(0, Math.min(1, progression.progress || prosperityScore / 100))
    };
  }

  averageAnimalTrust(animalsList) {
    const values = (animalsList || []).map((animal) => this.relationValue(animal || {}, "trust")).filter((value) => typeof value === "number");
    if (!values.length) return 0;
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  reserveDisplayName(reserve = (this.state.world || {}).reserve || {}) {
    const assigned = String(((reserve.base || {}).name) || "").trim();
    if (assigned) {
      if (/保护区$/.test(assigned)) return assigned;
      return `${assigned}保护区`;
    }
    const serial = String(((reserve.base || {}).serial) || "0000").replace(/\D/g, "").slice(-4).padStart(4, "0");
    const names = ["晨雾河湾保护区", "青竹缓冲保护区", "月沼夜巡保护区", "南坡金合欢保护区", "候鸟浅湖保护区", "象道关口保护区"];
    return names[Number(serial) % names.length];
  }

  reserveViewForDisplay() {
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const isCore3 = (view) => view && Array.isArray(view.states)
      && view.states.map((state) => state.id).join(",") === "fund,water,grass";
    if (isCore3(world.reserveView)) return this.normalizeReserveViewPresentation(world.reserveView);
    if (isCore3(reserve.reserveView)) return this.normalizeReserveViewPresentation(reserve.reserveView);
    return this.normalizeReserveViewPresentation(buildReserveView(reserve, reserve, {
      action: "view",
      day: world.day || 1,
      time: world.time || {},
      weather: world.weather || "",
      season: world.season || "夏季",
      location: (this.state.character && this.state.character.location) || "保护区",
      regionId: this.selectedRegionId || "center"
    }));
  }

  normalizeReserveViewPresentation(view = {}) {
    const states = view.states || [];
    const metrics = {};
    states.forEach((state) => {
      (state.subMetrics || []).forEach((metric) => { metrics[metric.id] = metric; });
    });
    const markers = (view.mapMarkers || []).filter((marker) => !/(?:^|_)daily_recovery(?:_|$)/.test(marker.id || "")).map((marker) => {
      if (marker.presentation === "resource-flow") return marker;
      const id = marker.id || "";
      let metricId = "";
      if (/(?:^|_)water(?:_|$)/.test(id)) metricId = "water";
      else if (/(?:^|_)grass(?:_|$)/.test(id)) metricId = "grass";
      else if (/(?:^|_)business(?:_|$)/.test(id)) metricId = "fund";
      else if (/(?:^|_)recovery_ecology(?:_|$)/.test(id)) {
        const water = metrics.water || {};
        const grass = metrics.grass || {};
        metricId = (water.delta || 0) >= (grass.delta || 0) ? "water" : "grass";
      }
      else if (/(?:^|_)migration_(?:in|out)(?:_|$)/.test(id)) metricId = "migration_line";
      else if (/(?:^|_)recovery_safety(?:_|$)/.test(id)) {
        const safety = metrics.safety_score || {};
        const poacher = metrics.poacher_pressure || {};
        metricId = Math.abs(safety.delta || 0) >= Math.abs(poacher.delta || 0) ? "safety_score" : "poacher_pressure";
      }
      if (!metricId) return marker.type === "recovery" ? Object.assign({}, marker, { dialogue: "" }) : marker;
      const metric = metrics[metricId] || {};
      const normalizedMetric = { migration_line: "migration", safety_score: "safety", poacher_pressure: "poacher" }[metricId] || metricId;
      const recovery = marker.type === "recovery";
      return Object.assign({}, marker, {
        presentation: "resource-flow",
        metric: normalizedMetric,
        metricLabel: metric.label || ({ water: "水源", grass: "草场", fund: "基金", migration: "迁徙", safety: "安全", poacher: "偷猎压力" }[normalizedMetric]),
        delta: typeof metric.delta === "number" ? metric.delta : 0,
        value: typeof metric.value === "number" ? metric.value : 0,
        flowKind: recovery ? "production" : "consumption",
        beneficial: recovery,
        dialogue: ""
      });
    });
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const animalTask = reserve.animalPatrolLead || null;
    const currentDay = Math.max(1, Number(world.day) || 1);
    const taskVisible = animalTask && currentDay <= Number(animalTask.expiresDay || currentDay);
    let mergedMarkers = taskVisible
      ? [animalTask].concat(markers.filter((marker) => marker.id !== animalTask.id))
      : markers;
    const focus = this.focusedReserveMetric;
    if (focus && Date.now() < Number(focus.expiresAt || 0) && ["water", "grass"].includes(focus.type)) {
      const actionLabel = focus.type === "water" ? "修复饮水点" : "恢复草场产能";
      const guideMarker = {
        id: `metric_focus_${focus.type}`,
        type: "event",
        kind: "exclamation",
        regionId: focus.type === "water" ? "river" : "meadow",
        title: actionLabel,
        label: actionLabel,
        dialogue: "",
        impact: focus.type === "water"
          ? "水源低于健康线；点击这里查看修复任务。"
          : "草场低于健康线；点击这里查看修复任务。",
        recommendAction: "habitat",
        recommendLabel: "修复栖息地",
        unhandled: focus.type === "water" ? "不处理：动物会集中到少数饮水点。" : "不处理：食草动物会继续扩大觅食范围。",
        intensity: 3,
        focused: true,
        metric: focus.type
      };
      mergedMarkers = [guideMarker].concat(mergedMarkers.filter((marker) => marker.id !== guideMarker.id));
    }
    return Object.assign({}, view, { mapMarkers: mergedMarkers.slice(0, 3) });
  }

  reserveStateColor(tone) {
    return {
      good: "#1f7a52",
      warn: "#d29b26",
      bad: "#c45b42",
      recovery: "#5cb87a",
      special: "#2f7c8f"
    }[tone] || "#7d692d";
  }

  reserveStateRisk(state = {}) {
    const tone = state.tone || "good";
    if (tone === "bad") return { label: "高风险", tone: "bad", color: "#c45b42" };
    if (tone === "warn") return { label: "需关注", tone: "warn", color: "#a86f12" };
    return { label: "稳定", tone: "good", color: "#1f7a52" };
  }

  drawStagePill(ctx, x, y, w, chapter, progress) {
    const pillH = 28;
    const menuLeft = this.menuButtonRect && typeof this.menuButtonRect.left === "number" ? this.menuButtonRect.left : this.width;
    const stageW = Math.max(190, Math.min(w, menuLeft - x - 10));
    this.roundRect(ctx, x, y + 2, stageW, pillH, 14, "rgba(20,35,29,.10)");
    this.roundRect(ctx, x, y, stageW, pillH, 14, "rgba(252,254,251,.94)", UI_THEME.separator);
    const chapterW = 92;
    this.roundRect(ctx, x + 4, y + 4, chapterW, 20, 9, "rgba(47,125,98,.11)");
    this.text(ctx, "第" + (progress.stage || chapter.chapter) + "章 · Lv." + progress.level, x + 4 + chapterW / 2, y + 17, 9, UI_THEME.tint, "700", "center");
    this.text(ctx, this.truncateTextToWidth(ctx, chapter.title, stageW - chapterW - 54, 11, "700"), x + chapterW + 14, y + 17, 11, UI_THEME.ink, "700");
    this.addHit(x, y - this.scrollY, stageW - 34, pillH, () => this.openChapterProgressDetail());
    this.drawAudioToggle(ctx, x + stageW - 27, y + 3, 22);
  }

  drawReserveIdentityPill(ctx, x, y, w, reserve = {}) {
    const pillH = 28;
    const menuLeft = this.menuButtonRect && typeof this.menuButtonRect.left === "number" ? this.menuButtonRect.left : this.width;
    const stageW = Math.max(190, Math.min(w, menuLeft - x - 10));
    const prosperity = this.reserveProsperitySummary(reserve, this.state.world || {});
    const displayName = this.reserveDisplayName(reserve);
    this.roundRect(ctx, x, y + 2, stageW, pillH, 14, "rgba(20,35,29,.10)");
    this.roundRect(ctx, x, y, stageW, pillH, 14, "rgba(252,254,251,.94)", UI_THEME.separator);
    this.text(ctx, this.truncateTextToWidth(ctx, `${displayName} · 估值${prosperity.value}`, stageW - 106, 11, "700"), x + 13, y + 18, 11, UI_THEME.ink, "700");
    this.text(ctx, "档案 ›", x + stageW - 35, y + 18, 9, UI_THEME.tint, "700", "right");
    this.addHit(x, y - this.scrollY, stageW - 34, pillH, () => this.openReserveProsperityDetail());
    this.drawAudioToggle(ctx, x + stageW - 27, y + 3, 22);
    this.renderedHomeIdentityPill = {
      mode: "reserve-identity",
      displayName,
      value: prosperity.value,
      clickable: true,
      affordance: "档案 ›"
    };
  }

  drawAudioToggle(ctx, x, y, size) {
    const enabled = this.audioEnabled();
    this.roundRect(ctx, x, y, size, size, size / 2, enabled ? "rgba(47,125,98,.12)" : "rgba(120,128,123,.10)", UI_THEME.separator);
    ctx.save();
    ctx.strokeStyle = enabled ? UI_THEME.tint : "#87958e";
    ctx.fillStyle = enabled ? "#176b58" : "#87958e";
    ctx.lineWidth = 1.4;
    ctx.lineCap = "round";
    const cy = y + size / 2;
    ctx.fillRect(x + 5, cy - 2.5, 3, 5);
    ctx.beginPath();
    ctx.moveTo(x + 8, cy - 3);
    ctx.lineTo(x + 12, cy - 6);
    ctx.lineTo(x + 12, cy + 6);
    ctx.lineTo(x + 8, cy + 3);
    ctx.closePath();
    ctx.fill();
    if (enabled) {
      ctx.beginPath();
      ctx.arc(x + 11.5, cy, 4.5, -0.82, 0.82);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 11.5, cy, 7.2, -0.72, 0.72);
      ctx.stroke();
    } else {
      ctx.strokeStyle = "#d17862";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 5);
      ctx.lineTo(x + size - 5, y + size - 5);
      ctx.stroke();
    }
    ctx.restore();
    this.addHit(x - 5, y - 5 - this.scrollY, size + 10, size + 10, () => this.toggleAudio(), "tap");
  }

  drawSandboxInfoDock(ctx, x, y, w) {
    const reserve = this.state.world.reserve || {};
    const reserveView = this.reserveViewForDisplay();
    const dockH = this.sandboxInfoDockHeight();
    this.roundRect(ctx, x, y + 4, w, dockH, 20, "rgba(18,32,26,.18)");
    this.roundRect(ctx, x, y, w, dockH, 20, "rgba(252,254,251,.94)", UI_THEME.separator);

    const chapter = getCurrentChapter(reserve);
    const progress = getChapterProgress(reserve);
    const titleBoxW = Math.max(168, w - 112);
    this.roundRect(ctx, x + 8, y + 5, titleBoxW, 18, 9, "rgba(47,125,98,.08)");
    const guardian = guardianContext(reserve);
    const chapterLabel = `第${guardian.day}日·${guardian.phase.label} ${guardian.cycle.actionIndex + 1}/3  |  第${chapter.chapter}章`;
    this.text(ctx, this.truncateTextToWidth(ctx, chapterLabel, titleBoxW - 54, 10, "700"), x + 14, y + 18, 10, UI_THEME.ink, "700");
    this.text(ctx, "进度 ›", x + 8 + titleBoxW - 8, y + 18, 9, UI_THEME.tint, "700", "right");
    const world = this.state.world || {};
    const seasonState = reserve.seasonState || {};
    const activeEmergency = reserve.emergency && reserve.emergency.active;
    const seasonText = `${seasonState.name || world.season || "雨季"}${seasonState.day ? ` ${seasonState.day}/12` : ""} · ${world.weather || ""}${activeEmergency ? " · ⚠" : ""}`;
    this.text(ctx, seasonText, x + w - 14, y + 19, 9, activeEmergency ? UI_THEME.danger : UI_THEME.muted, "700", "right");
    this.addHit(x + 8, y + 3 - this.scrollY, titleBoxW, 24, () => this.openChapterProgressDetail());
    this.addHit(x + w - 104, y + 3 - this.scrollY, 96, 24, () => this.openGuardianDayDetail());
    this.renderedSandboxInfoDock = {
      mode: "chapter-progress",
      chapter: chapter.chapter,
      level: progress.level,
      title: chapter.title,
      titleClickable: true,
      titleHitW: titleBoxW,
      affordance: "进度 ›",
      guardianDay: guardian.day,
      guardianPhase: guardian.phase.id,
      guardianActionIndex: guardian.cycle.actionIndex,
      stateMode: "read-only-risk",
      operationChannels: ["sandbox-info", "sandbox-task", "material-or-collection"]
    };

    const stateY = y + 25;
    const stateGap = 6;
    const stateW = (w - 28 - stateGap * 2) / 3;
    this.renderedSandboxStateTiles = [];
    (reserveView.states || []).slice(0, 3).forEach((state, index) => {
      this.renderedSandboxStateTiles.push(
        this.drawCompactReserveStateTile(ctx, state, x + 14 + index * (stateW + stateGap), stateY, stateW, 32)
      );
    });

    const daily = ((this.state.world || {}).goals || {}).daily || {};
    this.drawHomePrimaryGoalRow(ctx, x + 14, y + 63, w - 28, daily, reserve, { compact: true });
  }

  drawCompactReserveStateTile(ctx, state, x, y, w, h) {
    const color = this.reserveStateColor(state.tone);
    const risk = this.reserveStateRisk(state);
    const fill = state.tone === "bad" ? "rgba(255,226,216,.92)"
      : state.tone === "warn" ? "rgba(255,241,198,.92)"
        : "rgba(239,249,232,.92)";
    this.roundRect(ctx, x, y + 2, w, h, 11, "rgba(18,61,52,.10)");
    this.roundRect(ctx, x, y, w, h, 11, fill, `${color}55`);
    const animationKey = { fund: "fund", water: "water", grass: "grass" }[state.id] || "";
    const displayValue = animationKey ? this.displayReserveNumber(animationKey, state.value) : state.value;
    this.text(ctx, state.label, x + 8, y + 12, 9, "#66715f", "700");
    this.text(ctx, risk.label, x + w - 8, y + 12, 8, risk.color, "700", "right");
    this.text(ctx, `${displayValue}`, x + 8, y + 27, this.fitTextSize(ctx, `${displayValue}`, w - 34, 16, 13, "700"), color, "700");
    const delta = animationKey ? this.reserveDisplayDelta(animationKey, state.value) : 0;
    if (delta) this.text(ctx, this.signed(delta), x + w - 8, y + 27, 9, delta > 0 ? "#1f7a52" : "#c45b42", "700", "right");
    else if (risk.tone === "bad" || risk.tone === "warn") this.text(ctx, "改善 ›", x + w - 8, y + 27, 8, risk.color, "700", "right");
    else this.text(ctx, "›", x + w - 8, y + 27, 13, "#708077", "700", "right");
    this.addHit(x, y - this.scrollY, w, h, () => this.openReserveMetricDetail(state.id), "tap");
    return {
      id: state.id,
      label: state.label,
      value: displayValue,
      risk: risk.label,
      riskTone: risk.tone,
      readOnly: true,
      clickable: true,
      detailOnly: true,
      affordance: risk.tone === "bad" || risk.tone === "warn" ? "改善 ›" : "›"
    };
  }

  drawHomePrimaryGoalRow(ctx, x, y, w, daily, reserve, options = {}) {
    const goalView = this.currentGoalView();
    const goal = goalView.primary || daily || {};
    const guardian = guardianContext(reserve);
    const guardianBeat = !((reserve.emergency || {}).active) && guardian.sevenDayBeat && !(guardian.cycle.sevenDay.completed || {})[guardian.day]
      ? guardian.sevenDayBeat
      : null;
    const completedBeatActions = guardianBeat ? (((guardian.cycle.sevenDay.progress || {})[guardian.day]) || []) : [];
    const beatActionId = guardianBeat ? guardianBeat.actions.find((id) => !completedBeatActions.includes(id)) || guardianBeat.actions[0] : "";
    const action = this.reserveActionOptions().find((item) => item.id === (beatActionId || goal.recommendedAction));
    const onboarding = this.onboardingHomeGuide();
    const title = onboarding ? onboarding.title : guardianBeat ? guardianBeat.prompt : (goal.title || "完成一次有效巡护").replace("今日目标：", "");
    const actionLabel = onboarding ? `${onboarding.step}/4` : guardianBeat ? `第${guardian.day}日` : `${goal.progress || 0}/${goal.target || 1}`;
    const alternativeCount = (goalView.alternatives || []).length;
    const label = onboarding
      ? `新手 · ${onboarding.label}`
      : guardianBeat ? `七日样板 · ${guardianBeat.title}` : `${goal.kind === "crisis" ? "紧急目标" : "当前最重要"}${alternativeCount ? ` · 另${alternativeCount}项` : ""}`;
    const compact = !!options.compact;
    const h = compact ? 42 : 44;
    const radius = compact ? 13 : 15;
    this.roundRect(ctx, x, y + 2, w, h, radius, "rgba(18,61,52,.08)");
    this.roundRect(ctx, x, y, w, h, radius, goal.kind === "crisis" ? "rgba(255,241,239,.98)" : "rgba(247,249,246,.98)", goal.kind === "crisis" ? "rgba(211,93,87,.28)" : UI_THEME.separator);
    const iconSize = compact ? 18 : 20;
    const iconX = x + (compact ? 16 : 18);
    this.drawUiIcon(ctx, (action && action.icon) || goal.icon || "trail", iconX, y + h / 2, iconSize, false)
      || this.drawSmallGlyph(ctx, "trail", iconX, y + h / 2, "#8b6f2a", compact ? 0.62 : 0.68);
    const textX = x + (compact ? 31 : 36);
    this.text(ctx, label, textX, y + (compact ? 13 : 15), compact ? 9 : 10, goal.kind === "crisis" ? UI_THEME.danger : UI_THEME.muted, "700");
    this.text(ctx, this.truncateTextToWidth(ctx, title, w - (compact ? 94 : 108), compact ? 11 : 12, "700"), textX, y + (compact ? 32 : 34), compact ? 11 : 12, "#1c3325", "700");
    const chipW = compact ? 48 : 54;
    this.roundRect(ctx, x + w - chipW - 10, y + 5, chipW, compact ? 26 : 28, 13, goal.kind === "crisis" ? UI_THEME.danger : UI_THEME.tint);
    this.text(ctx, actionLabel, x + w - chipW / 2 - 10, y + (compact ? 23 : 25), compact ? 10 : 11, "#fff8df", "700", "center");
    this.addHit(x, y - this.scrollY, w, h, () => {
      if (!onboarding) {
        if (guardianBeat) {
          this.activateGuardianBeat(beatActionId);
          return;
        }
        this.openGoalCenter();
        return;
      }
      this.activateOnboardingGuide(onboarding);
    });
  }

  activateGuardianBeat(actionId) {
    if (["salvage", "buySupplies"].includes(actionId)) {
      this.setScreen("role");
      if (actionId === "buySupplies") this.toast("选择一种当前短缺的巡护补给。");
      else this.toast("选择回收物的去向：立即、鉴定或留作任务。 ");
      return;
    }
    if (actionId === "collectionInvestigation") {
      this.setScreen("league");
      this.toast("从动物带来的线索进入收藏调查。");
      return;
    }
    this.openReserveViewAction(actionId, "sandbox-task");
  }

  guardianGradeFromScore(score) {
    if (score >= 88) return "S";
    if (score >= 76) return "A";
    if (score >= 64) return "B";
    if (score >= 50) return "C";
    return "D";
  }

  buildRunGrowthDetail() {
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const run = reserve.guardianRun || {};
    const chain = reserve.eventChain || {};
    const daily = (world.goals && world.goals.daily) || {};
    const score = run.score || 0;
    return {
      kicker: "局内成长",
      title: `本轮守护 · ${run.lastGrade || this.guardianGradeFromScore(score)}段`,
      icon: "reserve_level",
      items: [
        { tag: "段位", title: `守护分 ${score} · ${run.lastGrade || this.guardianGradeFromScore(score)}段`, body: run.lastSummary || "每次有效行动都会改变本轮守护评价。" },
        { tag: "进度", title: `第 ${Math.min(run.length || 7, (run.completedDays || 0) + 1)}/${run.length || 7} 天 · 连续${run.streak || 0}`, body: `水源目标 ${run.targetWater || 65} · 草场目标 ${run.targetGrass || 62} · 基金 ${reserve.fund || 0}` },
        { tag: "路线", title: `${chain.branchTitle || "本轮守护"} · ${chain.step || 0}/${chain.length || 7}`, body: chain.advanced ? (chain.current && (chain.current.prompt || chain.current.summary)) : (chain.waitingText || "事件处于间隔期，等待数据条件成熟。") },
        { tag: "目标", title: `${(daily.title || "完成阶段经营目标").replace("今日目标：", "")} · ${daily.progress || 0}/${daily.target || 3}`, body: daily.description || "需要多次相关操作，达成后才会刷新目标并推进事件路线。" }
      ],
      footer: "水源、草场和基金形成每天的经营结果；任务与剧情决定下一步行动。",
      actionLabel: "查看目标",
      action: () => {
        // Release the current modal before opening the next one. Mission push
        // deliberately refuses to stack over an existing detail modal.
        this.infoDetailModal = null;
        return this.openMissionPush("home");
      }
    };
  }

  drawHomeProsperityStrip(ctx, x, y, w, h, reserve) {
    const prosperity = this.reserveProsperitySummary(reserve);
    const displayAnimalTotal = this.displayReserveNumber("animalTotal", prosperity.animalTotal || 0);
    const displayValue = this.displayReserveNumber("valuation", prosperity.value || 0);
    const displaySpeciesCount = this.displayReserveNumber("speciesCount", prosperity.speciesCount || 0);
    const bg = ctx.createLinearGradient(x, y, x + w, y + h);
    bg.addColorStop(0, "#eff6df");
    bg.addColorStop(0.58, "#fff8df");
    bg.addColorStop(1, "#f3df9d");
    this.roundRect(ctx, x, y + 4, w, h, 9, "rgba(32, 25, 12, 0.12)");
    this.roundRect(ctx, x, y, w, h, 9, bg, "rgba(139,111,42,0.20)");
    this.roundRect(ctx, x + 10, y + 12, 42, 42, 10, "rgba(31,90,63,0.12)", "rgba(31,90,63,0.14)");
    this.drawUiIcon(ctx, "reserve_prosperity", x + 31, y + 33, 30, false, 0.95)
      || this.drawSmallGlyph(ctx, "leaf", x + 31, y + 33, "#1c3325", 0.86);
    this.text(ctx, `繁荣 Lv.${prosperity.level}`, x + 62, y + 25, 15, "#1c3325", "700");
    const prosperityMeta = `${prosperity.title} · ${displaySpeciesCount}种`;
    this.text(ctx, this.truncateTextToWidth(ctx, prosperityMeta, w - 232, 11, "700"), x + 62, y + 44, 11, "#66715f", "700");
    this.text(ctx, `动物 ${displayAnimalTotal}只`, x + 62, y + 58, 10, "#1f5a3f", "700");
    this.drawChangeTag(ctx, x + 122, y + 45, this.reserveDisplayDelta("animalTotal", prosperity.animalTotal || 0), "left", { key: "animalTotal" });
    this.drawChangeTag(ctx, x + Math.min(w - 112, 174), y + 27, this.reserveDisplayDelta("speciesCount", prosperity.speciesCount || 0), "left", { key: "speciesCount" });
    this.text(ctx, "估值", x + w - 82, y + 22, 10, "#8b6f2a", "700", "right");
    this.text(ctx, `${displayValue}`, x + w - 32, y + 50, 22, "#7d692d", "700", "right");
    this.drawUiIcon(ctx, "fund", x + w - 18, y + 42, 24, false, 0.96)
      || this.drawFundStack(ctx, x + w - 18, y + 42, 0.48);
    this.drawChangeTag(ctx, x + w - 74, y + 52, this.reserveDisplayDelta("valuation", prosperity.value || 0), "right", { key: "valuation" });
    this.roundRect(ctx, x + 62, y + h - 9, Math.max(96, w - 166), 4, 2, "rgba(36,64,46,0.12)");
    this.roundRect(ctx, x + 62, y + h - 9, Math.max(14, Math.max(96, w - 166) * prosperity.progress), 4, 2, "#1f7a52");
    this.addHit(x, y - this.scrollY, w, h, () => this.openReserveProsperityDetail());
  }

  dailyCareSteps(reserve, daily = {}) {
    const recommended = this.reserveActionOptions().find((item) => item.id === this.coercePatrolTaskAction(daily.recommendedAction || this.recommendedPatrolAction(reserve)))
      || this.selectedReserveActionOption();
    const goods = this.recoveredGoodsCount((reserve && reserve.inventory) || {});
    return [
      {
        label: "听心声",
        icon: "eye",
        color: "#1c3325",
        action: () => {
          this.setScreen("home");
          this.toast("点地图上动物的小气泡，听它今天怎么想。");
        }
      },
      {
        label: this.dailyActionShortLabel(recommended),
        icon: recommended.icon || "houndScout",
        color: "#d29b26",
        action: () => this.openDailyTenMinuteAction()
      },
      {
        label: goods > 0 ? "卖库存" : "买补给",
        icon: goods > 0 ? "salvage" : "buySupplies",
        color: "#7d692d",
        action: () => this.setScreen("role")
      }
    ];
  }

  dailyActionShortLabel(option = {}) {
    const map = {
      houndScout: "派猎犬",
      antiPoacher: "驱偷猎",
      habitat: "修水草",
      intervention: "稳种群",
      salvage: "卖库存",
      buySupplies: "买补给"
    };
    return this.truncateLabel(map[option.id] || option.shortLabel || option.label || "巡护", 4);
  }

  truncateLabel(text, maxLen = 4) {
    const value = String(text || "");
    return value.length > maxLen ? value.slice(0, maxLen) : value;
  }

  openDailyTenMinuteAction() {
    const reserve = this.state.world.reserve || {};
    const daily = this.currentGoalView().primary || ((this.state.world || {}).goals || {}).daily || {};
    if (!["houndScout", "antiPoacher", "habitat", "intervention", "salvage", "buySupplies"].includes(daily.recommendedAction)) {
      return this.executeGoalAction(daily);
    }
    if (["salvage", "buySupplies"].includes(daily.recommendedAction)) {
      this.setScreen("role");
      return;
    }
    const baseOption = this.reserveActionOptions().find((item) => item.id === this.coercePatrolTaskAction(daily.recommendedAction || this.recommendedPatrolAction(reserve)))
      || this.selectedReserveActionOption();
    const socialRecovery = daily.buttonLabel === "抢回回收物";
    const option = socialRecovery ? Object.assign({}, baseOption, {
      label: "抢回回收物",
      placeholder: "例如：抢回回收物：派猎犬搜寻共享回收点",
      effect: "物质回收 +2，进入待收取区",
      hint: "完成后会明确列出研究样本与陷阱证据的增加数量。"
    }) : baseOption;
    this.selectedReserveAction = option.id;
    this.command = option.placeholder.replace("例如：", "");
    this.setScreen("action");
    this.openPatrolTaskModal(option);
  }

  infoTickerCards(reserve, ecology, latest, knowledge, aiForest) {
    const world = this.state.world || {};
    const social = (reserve && reserve.social) || {};
    const briefCount = Math.max(1, (this.state.reports || []).filter((report) => report.type === "private").length);
    const worldCount = Math.max(1, (world.rumors || []).length + (world.natureKnowledge || []).length + ((aiForest.facts || []).length) + (social.log ? 1 : 0));
    const chain = reserve.eventChain || {};
    return [
      {
        id: "brief",
        title: "简报",
        icon: "eye",
        value: `${briefCount} 条`,
        body: latest ? ((latest.visual && latest.visual.eventCard && latest.visual.eventCard.body) || latest.title) : "暂无巡护结算，先派出一次巡护。"
      },
      {
        id: "world",
        title: "世界",
        icon: "water",
        value: `${worldCount} 条`,
        body: social.log ? `${this.socialStoryLine(social)} ${this.socialImpactLine(social)}` : (chain.lastResult ? `阶段事件：${chain.lastResult}` : "") || aiForest.summary || knowledge || `动物保持观望，水源 ${ecology.water || 0}，偷猎 ${reserve.poacherPressure || 0}，安全 ${reserve.safety || 0}。`
      }
    ];
  }

  openChapterProgressDetail() {
    this.infoDetailModal = this.buildChapterProgressDetail();
    this.render();
  }

  openGuardianDayDetail() {
    const reserve = (this.state.world || {}).reserve || {};
    const guardian = guardianContext(reserve);
    const actions = guardian.cycle.actionsToday || [];
    const mastery = masteryView(reserve);
    const pendingMastery = mastery.find((entry) => entry.pendingChoice && entry.choices && entry.choices.length === 2);
    this.infoDetailModal = {
      kicker: `第${guardian.day}日 · ${guardian.season.name}${guardian.season.day}/12`,
      title: `${guardian.phase.label} · 今天还可行动 ${3 - guardian.cycle.actionIndex} 次`,
      icon: "reserve_level",
      items: [
        {
          tag: "今天",
          title: actions.length ? actions.map((entry) => `${entry.phaseLabel} ${this.reserveActionName(entry.action)}`).join(" · ") : "清晨规划尚未开始",
          body: guardian.sevenDayBeat ? guardian.sevenDayBeat.prompt : guardian.beat
        },
        {
          tag: "专长",
          title: mastery.map((entry) => `${entry.label} Lv.${entry.level}`).join(" · "),
          body: "关键行动+20经验；倾听、安抚、救助和迁移+5经验。"
        },
        {
          tag: "入夜",
          title: "统一回看地图变化和动物回应",
          body: guardian.cycle.actionIndex ? "可提前结束今天；未使用的行动不会结转，也没有惩罚。" : "先完成一次关键行动，再决定是否提前入夜。"
        }
      ],
      footer: guardian.cycle.tomorrowPreview,
      actionLabel: pendingMastery ? `选择${pendingMastery.label}专长` : guardian.cycle.actionIndex ? "提前入夜" : "继续守护",
      action: () => pendingMastery
        ? this.openMasteryChoice(pendingMastery.id)
        : guardian.cycle.actionIndex
          ? this.finishGuardianDayEarly()
          : (this.infoDetailModal = null, this.render())
    };
    this.render();
  }

  openMasteryChoice(trackId) {
    const reserve = (this.state.world || {}).reserve || {};
    const track = masteryView(reserve).find((entry) => entry.id === trackId);
    if (!track || !track.pendingChoice || !track.choices || track.choices.length !== 2) {
      this.toast("当前没有待选择的守护专长");
      return this.openGuardianDayDetail();
    }
    const choose = (branch) => {
      const result = chooseMasteryBranch(reserve, track.id, track.pendingChoice, branch.id);
      if (!result.ok) return this.toast(result.error || "专长选择失败");
      saveState(this.state);
      this.infoDetailModal = {
        kicker: `${track.label} · Lv.${track.pendingChoice}专长`,
        title: `${branch.label}已写入保护区`,
        icon: track.id === "patrol" ? "eye" : track.id === "habitat" ? "leaf" : "signal",
        items: [{ tag: "新能力", title: branch.label, body: branch.unlock }],
        footer: "专长会改变地图信息或可执行方式，不是单纯增加数值。",
        actionLabel: "继续守护",
        action: () => { this.infoDetailModal = null; this.render(); }
      };
      this.render();
    };
    this.infoDetailModal = {
      kicker: `${track.label} · Lv.${track.pendingChoice}分支`,
      title: "选择一种真正改变玩法的专长",
      icon: track.id === "patrol" ? "eye" : track.id === "habitat" ? "leaf" : "signal",
      items: track.choices.map((branch) => ({ tag: branch.label, title: branch.unlock, body: "选择后永久生效，本节点不能重复选择。" })),
      footer: "两个方向都能完成主线，只会改变你的守护方式。",
      choices: track.choices.map((branch) => ({ label: branch.label, action: () => choose(branch) }))
    };
    this.render();
  }

  reserveActionName(actionId) {
    const option = this.reserveActionOptions().find((item) => item.id === actionId);
    return option ? option.label : ({ salvage: "移交回收物", buySupplies: "采购补给", exploreMaterials: "调查收藏" }[actionId] || "守护行动");
  }

  finishGuardianDayEarly() {
    const reserve = (this.state.world || {}).reserve || {};
    const beforeWorld = JSON.parse(JSON.stringify(this.state.world || {}));
    const before = this.reserveSnapshot(reserve);
    const result = advanceGuardianCycle(reserve, "earlyRest", before, reserve, {
      earlyEnd: true,
      animalResponse: "暮色落下，动物沿着今天更安全的路线各自休息。",
      reward: "今日记录已写入保护区档案"
    });
    reserve.progression = Object.assign({}, reserve.progression || {}, {
      daysManaged: Math.max(0, Math.round((((reserve.progression || {}).daysManaged) || 0) + 1))
    });
    this.state.world.day = Math.max(1, Math.round((this.state.world.day || 1) + 1));
    this.state.world.season = ((reserve.seasonState || {}).name) || this.state.world.season;
    const lifeUpdate = advanceLifeMemory(beforeWorld, this.state.world, { actionId: "earlyRest", command: "提前入夜" });
    this.state.world.lifeMemory = lifeUpdate.state;
    saveState(this.state);
    this.infoDetailModal = {
      kicker: "入夜总结",
      title: result.night ? result.night.title : "今天结束了",
      icon: "reserve_level",
      items: (result.night && result.night.actions.length ? result.night.actions : [{ phaseLabel: "今天", change: "你选择保留体力", animalResponse: "保护区安静下来。" }]).map((entry) => ({
        tag: entry.phaseLabel,
        title: entry.change,
        body: entry.animalResponse
      })),
      footer: result.night ? result.night.tomorrow : reserve.guardianCycle.tomorrowPreview,
      actionLabel: "迎接明天",
      action: () => { this.infoDetailModal = null; this.render(); }
    };
    this.render();
  }

  buildChapterProgressDetail() {
    const reserve = (this.state.world || {}).reserve || {};
    const progression = this.reserveProgression(reserve);
    const objectives = progression.objectives || [];
    const mandatory = objectives.filter((item) => !item.optional);
    const paceGoal = objectives.find((item) => item.id === "expectedTime") || { label: "预计体验", current: 0, target: (progression.gate || {}).expectedMinutes || 10, unit: "分钟", complete: false };
    const milestones = objectives.filter((item) => item.optional && item.id !== "expectedTime");
    const formatGoal = (item) => `${Math.min(item.current || 0, item.target || 0)}/${item.target || 0}${item.unit || ""}`;
    const nearest = milestones.filter((item) => !item.complete).sort((a, b) => {
      const ap = (a.current || 0) / Math.max(1, a.target || 1);
      const bp = (b.current || 0) / Math.max(1, b.target || 1);
      return bp - ap;
    }).slice(0, 2);
    const chain = reserve.eventChain || {};
    const actionGoal = mandatory.find((item) => item.id === "actions") || { current: 0, target: 18, unit: "次", complete: false };
    const choiceGoal = mandatory.find((item) => item.id === "strategicChoices") || { current: 0, target: 1, unit: "次", complete: false };
    const majorChoiceGoal = mandatory.find((item) => item.id === "majorStrategicChoices") || { current: 0, target: 1, unit: "次", complete: false };
    const scoreGoal = mandatory.find((item) => item.id === "score") || { current: progression.score || 0, target: progression.nextScore || 58, unit: "", complete: false };
    return {
      kicker: `第${progression.stage || 1}章 · 晋级条件`,
      title: `Lv.${progression.level} ${progression.title} · ${Math.round((progression.progress || 0) * 100)}%`,
      icon: "reserve_level",
      items: [
        {
          tag: actionGoal.complete ? "已完成" : "进度",
          title: `经营 ${formatGoal(actionGoal)} · 策略 ${formatGoal(choiceGoal)}`,
          body: `重大 ${formatGoal(majorChoiceGoal)} · 预计体验 ${formatGoal(paceGoal)}（不作为硬门槛）`
        },
        { tag: scoreGoal.complete ? "已完成" : "评分", title: `综合保护 ${formatGoal(scoreGoal)}`, body: "安全 · 生态 · 经营 · 路线" },
        {
          tag: `里程碑 ${progression.milestoneDone || 0}/${progression.milestoneNeed || 0}`,
          title: milestones.filter((item) => item.complete).map((item) => item.label).join(" · ") || "等待首次突破",
          body: nearest.length ? nearest.map((item) => `${item.label} ${formatGoal(item)}`).join(" · ") : "本章里程碑已完成"
        }
      ],
      footer: chain.advanced
        ? `剧情 ${chain.step || 0}/${chain.length || 7} · ${chain.current && chain.current.title ? chain.current.title : "已推进"}`
        : (chain.waitingText || `完成必需指标与 ${progression.milestoneNeed || 0} 项里程碑后晋级。`),
      actionLabel: "进入世界保护区",
      action: () => {
        this.infoDetailModal = null;
        this.openReserveNetwork("world");
      }
    };
  }

  openSandboxInfo(type) {
    this.infoDetailModal = this.buildSandboxInfoDetail(type);
    this.render();
  }

  openReserveStateDetail(id) {
    const view = this.reserveViewForDisplay();
    const state = (view.states || []).find((item) => item.id === id) || (view.states || [])[0] || {};
    this.infoDetailModal = this.buildWatchClueDetail({ source: "state", state, view });
    this.render();
  }

  openReserveBroadcastDetail(row = {}) {
    const view = this.reserveViewForDisplay();
    this.infoDetailModal = this.buildWatchClueDetail({ source: "broadcast", row, view });
    this.render();
  }

  allowedOperationEntry(source) {
    return ["sandbox-info", "sandbox-task", "animal", "material", "collection"].includes(source);
  }

  openReserveViewAction(actionId, source = "", purchaseId = null) {
    if (!this.allowedOperationEntry(source)) {
      this.toast("请从沙盘信息、沙盘任务或具体物件进入操作");
      return false;
    }
    const requestedAction = actionId || "houndScout";
    this.infoDetailModal = null;
    if (requestedAction === "buySupplies") {
      this.setScreen("role");
      this.useMaterialAction("buySupplies", purchaseId || this.recommendedSupplyPurchaseId((this.state.world || {}).reserve || {}));
      return true;
    }
    if (requestedAction === "salvage") {
      this.setScreen("role");
      return true;
    }
    if (requestedAction === "exploreMaterials") {
      this.openMaterialExploration();
      return true;
    }
    const action = this.coercePatrolTaskAction(requestedAction);
    const option = this.reserveActionOptions().find((item) => item.id === action) || this.selectedReserveActionOption();
    this.selectedReserveAction = option.id;
    this.command = option.placeholder.replace("例如：", "");
    this.setScreen("action");
    this.openPatrolTaskModal(option);
    return true;
  }

  openMapMarkerDetail(marker = {}) {
    this.infoDetailModal = this.buildWatchClueDetail({ source: "marker", marker, view: this.reserveViewForDisplay() });
    this.render();
  }

  buildWatchClueDetail(input = {}) {
    const view = input.view || this.reserveViewForDisplay();
    const marker = input.marker || this.relatedWatchMarker(input, view);
    const state = input.state || this.relatedWatchState(input, view);
    const row = input.row || {};
    const actionId = (input.source === "state" && ["water", "grass"].includes(state.id) && state.outcome && state.outcome.action)
      || state.action || row.action || marker.recommendAction || (view.primaryReason && view.primaryReason.action) || "houndScout";
    const actionText = reserveActionLabel(actionId);
    const readOnlyState = input.source === "state";
    const regionName = marker.regionId ? ((this.findRegion(marker.regionId) || {}).name || "保护区") : "保护区";
    const happening = this.watchClueHappening(input, state, row, marker, view);
    const title = input.source === "state"
      ? `${state.label || "状态"} · ${state.status || state.value || "关注"}`
      : input.source === "marker"
        ? (marker.title || marker.label || "地图线索")
        : (row.title || "今日播报");
    const items = [];
    if (input.source === "state" && (state.subMetrics || []).length) {
      items.push({ tag: "总览", title: happening.title, body: happening.body });
      (state.subMetrics || []).slice(0, 3).forEach((metric) => {
        items.push(this.watchSubMetricItem(metric, { readOnly: true }));
      });
    } else {
      items.push(
        { tag: "发生", title: happening.title, body: happening.body },
        { tag: "影响", title: marker.title || state.reason || "保护区正在变化", body: `${regionName}：${marker.impact || row.body || state.reason || "动物会按水、草、危险和记忆重新选择路线。"}` }
      );
    }
    if (input.source === "state" && ["water", "grass"].includes(state.id) && state.outcome) {
      items.push({
        tag: "结果",
        title: `动物${state.outcome.value}`,
        body: state.outcome.reason || "生态状态会转化为动物迁入、繁殖、警觉或退走。"
      });
    }
    items.push({ tag: "风险", title: this.watchClueRiskLine(marker, view), body: "状态只负责呈现风险；请从沙盘信息、沙盘任务或具体物件发起操作。" });
    if (!readOnlyState) {
      items.push({ tag: "行动", title: actionText, body: actionId === "salvage" || actionId === "buySupplies" ? "打开物资页处理基金和补给循环。" : "打开巡护任务，直接处理这条线索。" });
    }
    const detail = {
      kind: "watchClue",
      kicker: input.source === "state" ? "守望状态" : input.source === "marker" ? this.mapMarkerKicker(marker) : this.broadcastKicker(row),
      title,
      icon: this.watchClueIcon(input, state, row, marker),
      footer: readOnlyState ? "数据 · 变化 · 风险" : "发生 · 影响 · 风险 · 行动",
      items,
      readOnly: readOnlyState,
      operationChannel: readOnlyState ? "" : "sandbox-info"
    };
    if (!readOnlyState) {
      detail.actionLabel = actionText;
      detail.action = () => this.openReserveViewAction(actionId, "sandbox-info");
    }
    return detail;
  }

  watchSubMetricItem(metric = {}, options = {}) {
    const value = metric.value === undefined || metric.value === null ? "未知" : `${metric.value}`;
    const delta = metric.delta ? `（${this.signed(metric.delta)}）` : "";
    const action = !options.readOnly && metric.action ? ` 建议：${reserveActionLabel(metric.action)}。` : "";
    return {
      tag: "指标",
      title: `${metric.label || "子指标"} ${value}${delta}`,
      body: `${metric.body || "这个子指标会影响主状态变化。"}${action}`
    };
  }

  relatedWatchMarker(input, view) {
    const markers = view.mapMarkers || [];
    if (input.state) {
      return markers.find((marker) => marker.recommendAction === input.state.action)
        || markers.find((marker) => marker.title === input.state.reason)
        || markers[0] || {};
    }
    if (input.row) {
      return markers.find((marker) => marker.recommendAction === input.row.action)
        || markers.find((marker) => marker.title === input.row.title)
        || markers[0] || {};
    }
    return markers[0] || {};
  }

  relatedWatchState(input, view) {
    const states = view.states || [];
    if (input.state) return input.state;
    const action = (input.marker && input.marker.recommendAction) || (input.row && input.row.action);
    return states.find((state) => state.action === action)
      || states.find((state) => state.id === "water")
      || states[0] || {};
  }

  watchClueHappening(input, state, row, marker, view) {
    if (input.source === "state") {
      const delta = state.delta ? `（${this.signed(state.delta)}）` : "";
      return {
        title: `${state.label || "状态"} ${state.value || ""}${delta}`,
        body: state.reason || (view.primaryReason && view.primaryReason.body) || "保护区暂时稳定。"
      };
    }
    if (input.source === "marker") {
      return {
        title: marker.title || marker.label || "地图出现线索",
        body: marker.dialogue || marker.impact || "地图上的标记提示有一条需要处理的暗线。"
      };
    }
    return {
      title: row.title || "今日播报",
      body: row.body || "保护区仍在变化。"
    };
  }

  watchClueRiskLine(marker, view) {
    if (marker.unhandled) return marker.unhandled;
    return (view.settlement && view.settlement.tomorrowRiskLine) || "明日风险：暗线仍在发酵，先处理推荐行动。";
  }

  watchClueIcon(input, state, row, marker) {
    if (input.source === "state") return state.id === "fund" ? "fund" : state.id === "water" ? "water" : state.id === "grass" ? "leaf" : "eye";
    if (input.source === "broadcast") return row.type === "weather" ? "water" : row.type === "animal" ? "eye" : "signal";
    return marker.kind || (marker.type === "recovery" ? "leaf" : "signal");
  }

  broadcastKicker(row = {}) {
    return row.type === "weather" ? "今日影响" : row.type === "animal" ? "动物提示" : "守望播报";
  }

  mapMarkerKicker(marker = {}) {
    return marker.type === "recovery" ? "恢复点" : marker.type === "crisis" ? "危机事件" : marker.type === "event" ? "保护区事件" : "可疑暗线";
  }

  openReserveProsperityDetail() {
    const reserve = (this.state.world || {}).reserve || {};
    const prosperity = this.reserveProsperitySummary(reserve);
    const migration = reserve.migration || {};
    const social = reserve.social || {};
    this.infoDetailModal = {
      layout: "metricDashboard",
      kicker: "我的保护区",
      title: `市值 ${prosperity.value} · ${prosperity.title}`,
      icon: "leaf",
      heroMetrics: [
        { label: "市值", value: prosperity.value, note: `Lv.${prosperity.level}` },
        { label: "物种", value: prosperity.speciesCount, note: "种" },
        { label: "动物", value: prosperity.animalTotal, note: "只" }
      ],
      footer: "安全、水草与信任共同决定动物是否留下。",
      items: [
        { tag: "繁荣", title: `Lv.${prosperity.level} · ${prosperity.score}/100`, body: `下一级 ${prosperity.next} · 时间 / 经营 / 评分 / 里程碑` },
        { tag: "迁移", title: this.migrationLabel(migration), body: social.log ? `${social.title || "区域联动"} · ${this.socialImpactLine(social)}` : "当前没有跨区异动" }
      ],
      actionLabel: "看好友/世界",
      action: () => {
        this.infoDetailModal = null;
        this.openReserveNetwork((reserve.social || {}).actorScope === "friends" ? "friends" : "world");
      }
    };
    this.render();
  }

  houndTeamSummary(reserve = (this.state.world || {}).reserve || {}) {
    const team = reserve.houndTeam || {};
    return {
      level: team.level || 1,
      xp: team.xp || 0,
      nextXp: team.nextXp || 40,
      title: team.title || ((team.level || 1) >= 3 ? "可靠猎犬队" : "新晋猎犬队"),
      tracking: team.tracking || 48,
      pursuit: team.pursuit || 45,
      guard: team.guard || 42,
      stamina: team.stamina || 86,
      cohesion: team.cohesion || 52,
      totalRuns: team.totalRuns || 0,
      lastReward: team.lastReward || "猎犬队待命，下一次巡护会带回新线索。"
    };
  }

  buildHoundTeamDetail() {
    const reserve = (this.state.world || {}).reserve || {};
    const team = this.houndTeamSummary(reserve);
    return {
      layout: "metricDashboard",
      kicker: "巡护搭档",
      title: `${team.title} · Lv.${team.level}`,
      icon: "houndScout",
      heroMetrics: [
        { label: "等级", value: `Lv.${team.level}`, note: `${team.xp}/${team.nextXp}` },
        { label: "体能", value: team.stamina, note: team.stamina < 40 ? "需要补给" : "可出勤" },
        { label: "默契", value: team.cohesion, note: `出勤${team.totalRuns}` }
      ],
      footer: "出勤消耗体能；行动会增长经验与队伍能力。",
      items: [
        { tag: "训练", title: `追踪 ${team.tracking} · 驱赶 ${team.pursuit} · 防护 ${team.guard}`, body: team.lastReward },
        { tag: "下一步", title: team.stamina < 40 ? "先补给，再出勤" : "派出猎犬侦察", body: team.stamina < 40 ? "采购狗粮可恢复连续行动能力" : "降低偷猎压力，并可能发现回收物或收藏线索" }
      ],
      actionLabel: "派猎犬",
      action: () => {
        this.infoDetailModal = null;
        const option = this.reserveActionOptions().find((item) => item.id === "houndScout") || this.selectedReserveActionOption();
        this.setScreen("action");
        this.openPatrolTaskModal(option);
      }
    };
  }

  actionResourceGuide(kind) {
    const metric = kind === "water" ? "water" : kind === "grass" ? "grass" : "fund";
    return this.buildReserveMetricDetail(metric);
  }

  openActionResourceDetail(kind = "fund") {
    const metric = kind === "water" ? "water" : kind === "grass" ? "grass" : "fund";
    this.openReserveMetricDetail(metric);
  }

  handoverPatrolShift() {
    this.infoDetailModal = null;
    this.setScreen("role");
    this.toast("缺补给时可在物资页采购");
    return true;
  }

  openForestPostcard() {
    this.infoDetailModal = this.buildForestPostcardDetail();
    this.render();
  }

  configureSharing() {
    const runtime = this.runtime || {};
    if (runtime.showShareMenu) {
      try {
        runtime.showShareMenu({ withShareTicket: true, menus: ["shareAppMessage"] });
      } catch (error) {
        // Older runtimes still support direct shareAppMessage.
      }
    }
    if (runtime.onShareAppMessage) {
      try {
        runtime.onShareAppMessage(() => {
          const postcard = this.buildForestPostcard();
          recordShareSent(this.state, postcard);
          saveState(this.state);
          return { title: postcard.shareTitle, imageUrl: postcard.imageUrl, query: postcard.query };
        });
      } catch (error) {
        // Menu sharing is optional; the visible postcard button remains available.
      }
    }
  }

  readShareInviteFromOptions(options = null) {
    const runtime = this.runtime || {};
    let launch = options;
    if (!launch && runtime.getLaunchOptionsSync) {
      try {
        launch = runtime.getLaunchOptionsSync();
      } catch (error) {
        launch = null;
      }
    }
    return parseShareInvite(launch || {});
  }

  buildShareInviteDetail(invite) {
    const already = hasAssistedShare(this.state, invite.shareId);
    const ready = !!this.state.character;
    return {
      kicker: "好友发来的森林接力",
      title: already ? `你已经为${invite.name}接过一次力` : `${invite.name}正在另一片保护区等回应`,
      icon: invite.kind === "rare" ? "reserve_prosperity" : invite.kind === "rescue" ? "fieldKit" : "leaf",
      items: [
        { tag: invite.kind === "rare" ? "罕见" : invite.kind === "rescue" ? "需要守护" : "朋友来信", title: `${invite.name} · ${invite.species} · 第${invite.day}日`, body: invite.kind === "rare" ? "好友邀请你见证一只罕见动物第一次出现。" : invite.kind === "rescue" ? "这只命名动物的故事遇到了转折，好友想请你留下一枚守护印记。" : "好友把保护区里一段真实发生的动物记忆分享给了你。" },
        { tag: "守护接力", title: already ? "同一份邀请只能接力一次" : "声誉 +1 · 对应动物信任 +1", body: "接力只奖励真正打开分享的玩家，不奖励反复发送，也不会制造无限资源。" },
        { tag: "记录", title: "援助会写入保护区记忆", body: `你的保护区会记住“曾为${invite.name}接力”，以后仍可在保护区记忆中翻到。` }
      ],
      footer: ready ? "这是好友入口带来的真实本地结算；同一 shareId 已做防重复。" : "先接管自己的保护区，这份接力会保留到第一章开场之后再结算。",
      actionLabel: already ? "知道了" : ready ? "留下守护接力" : "先接管保护区",
      action: () => {
        if (already) {
          this.pendingShareInvite = null;
          this.infoDetailModal = null;
          this.render();
          return;
        }
        if (!this.state.character) {
          this.state.ui = Object.assign({}, this.state.ui || {}, { pendingShareInvite: invite });
          saveState(this.state);
          this.pendingShareInvite = invite;
          this.infoDetailModal = null;
          this.setScreen("choose");
          this.toast("接管后会完成这次守护接力");
          return;
        }
        this.acceptShareInvite(invite);
      }
    };
  }

  buildShareAssistanceResult(result) {
    const invite = result.invite;
    if (!result.applied) {
      return {
        kicker: "守护接力",
        title: `你已经回应过${invite.name}`,
        icon: "leaf",
        items: [{ tag: "防重复", title: "没有再次领取数值", body: "同一份好友邀请只会结算一次，但这段守护记录不会消失。" }],
        footer: "分享的意义是让朋友参与故事，不是重复刷资源。"
      };
    }
    return {
      kicker: "好友互助 · 已写入存档",
      title: `你为${invite.name}留下了守护接力`,
      icon: "leaf",
      items: [
        { tag: "声誉", title: `${result.before.reputation} → ${result.after.reputation}（${this.signed(result.after.reputation - result.before.reputation)}）`, body: "跨保护区互助让守护行动被更多人看见。" },
        { tag: "动物回应", title: result.helpedAnimal ? `${result.helpedAnimal}信任 ${result.before.trust} → ${result.after.trust}` : `${invite.name}的故事已被记住`, body: result.helpedAnimal ? `${invite.species}能感受到这次互助不是一句口号。` : "当前保护区尚未出现同物种，守护印记仍会保留在记忆中。" }
      ],
      footer: "这次接力不会替好友自动解决事件，但它让同一个动物故事进入了两座保护区的记忆。"
    };
  }

  acceptShareInvite(invite, defer = false) {
    const result = applyShareAssistance(this.state, invite);
    this.pendingShareInvite = null;
    if (this.state.ui && this.state.ui.pendingShareInvite) delete this.state.ui.pendingShareInvite;
    saveState(this.state);
    const detail = this.buildShareAssistanceResult(result);
    if (defer) this.pendingShareWelcome = detail;
    else {
      this.infoDetailModal = detail;
      this.render();
    }
    return result;
  }

  openPendingShareInvite() {
    const invite = this.pendingShareInvite;
    if (!invite || this.chapterStoryModal || this.settlementModal || this.patrolTaskModal || this.infoDetailModal) return false;
    this.infoDetailModal = this.buildShareInviteDetail(invite);
    this.render();
    return true;
  }

  buildForestPostcard(event = null) {
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const ecology = reserve.ecology || {};
    const migration = reserve.migration || {};
    const letter = this.dailyAnimalLetter();
    const migrationText = this.migrationLabel(migration);
    const reason = migration.reason || (migration.delta > 0 ? "保护区更像安全区" : migration.delta < 0 ? "动物正在试探离开" : "动物还在观望");
    const statusLine = `基金 ${reserve.fund || 0} / 水源 ${ecology.water || 0} / 草场 ${ecology.grass || 0} / ${migrationText}`;
    const payload = sharePayload(world, event, letter);
    return Object.assign({}, payload, {
      letter,
      shareTitle: payload.title,
      text: `${payload.text}\n${statusLine}\n原因：${reason}`,
      statusLine,
      reason
    });
  }

  buildForestPostcardDetail(event = null) {
    const postcard = this.buildForestPostcard(event);
    const letter = postcard.letter;
    return {
      kicker: `${postcard.label} · 森林分享卡`,
      title: postcard.shareTitle,
      icon: postcard.kind === "rare" ? "reserve_prosperity" : postcard.kind === "rescue" ? "fieldKit" : "eye",
      animal: letter.animal,
      items: [
        { tag: postcard.label, title: postcard.callToAction, body: postcard.text },
        { tag: "实时状态", title: postcard.statusLine, body: postcard.reason },
        { tag: "分享图片", title: postcard.kind === "rare" ? "月夜白鹿卡" : postcard.kind === "rescue" ? "雨夜守护卡" : "晨光陪伴卡", body: "图片不写死名字；微信标题和好友入口会读取当前真实动物、事件与经营日。" },
        { tag: "好友接力", title: "打开后可留下守护印记", body: "同一份邀请只结算一次：声誉 +1、对应物种信任 +1。" }
      ],
      footer: "不奖励发送次数；真正从分享进入的好友才能完成接力，防止分享变成刷资源按钮。",
      actionLabel: "分享这一刻",
      action: () => this.shareForestPostcard(event)
    };
  }

  shareForestPostcard(event = null, overrides = null) {
    const runtime = this.runtime || {};
    const postcard = Object.assign({}, this.buildForestPostcard(event), overrides || {});
    if (runtime.shareAppMessage) {
      try {
        recordShareSent(this.state, postcard);
        saveState(this.state);
        runtime.shareAppMessage({
          title: postcard.shareTitle,
          imageUrl: postcard.imageUrl,
          query: postcard.query
        });
        this.toast("已唤起分享");
        return;
      } catch (e) {
        // Fall through to copy/modal feedback.
      }
    }
    if (runtime.setClipboardData) {
      try {
        runtime.setClipboardData({
          data: postcard.text,
          success: () => this.toast("明信片文案已复制")
        });
        return;
      } catch (e) {
        // Fall through to modal feedback.
      }
    }
    if (runtime.showModal) {
      runtime.showModal({
        title: "森林明信片",
        content: postcard.text,
        confirmText: "知道了"
      });
    } else {
      this.toast("已生成明信片");
    }
  }

  openReserveMetricDetail(type) {
    const reserve = ((this.state.world || {}).reserve) || {};
    const ecology = reserve.ecology || {};
    // 旧存档、旧地图标记可能仍传入 safety/ecology/business。玩家层已经
    // 收束为基金、水源、草场，旧入口只重定向到最相关的核心读数。
    const normalizedType = type === "business" ? "fund"
      : type === "safety" ? ((ecology.water || 0) <= (ecology.grass || 0) ? "water" : "grass")
        : type === "ecology" ? ((ecology.water || 0) <= (ecology.grass || 0) ? "water" : "grass")
          : type;
    this.infoDetailModal = this.buildReserveMetricDetail(normalizedType);
    this.render();
  }

  focusReserveMetricTask(type) {
    if (!["water", "grass"].includes(type)) return false;
    this.infoDetailModal = null;
    this.focusedReserveMetric = { type, expiresAt: Date.now() + 12000 };
    this.setScreen("action");
    this.scrollY = 0;
    this.toast(type === "water" ? "已标出饮水点任务，点击蓝色水滴" : "已标出草场任务，点击叶片标记");
    this.render();
    return true;
  }

  buildReserveMetricDetail(type) {
    const reserve = (this.state.world || {}).reserve || {};
    const ecology = reserve.ecology || {};
    const migration = consistentMigrationSnapshot(reserve, reserve.migration || {});
    const capacity = habitatCapacitySnapshot(reserve);
    const water = ecology.water || 0;
    const grass = ecology.grass || 0;
    const disease = ecology.disease || 0;
    const herbivores = this.totalOf(ecology.herbivores || {});
    const supplies = reserve.supplies || {};
    const metricRisk = (value, warn, bad, inverse = false) => {
      if (inverse) return value >= bad ? "高风险" : value >= warn ? "需关注" : "稳定";
      return value <= bad ? "高风险" : value <= warn ? "需关注" : "稳定";
    };
    const configs = {
      fund: {
        kicker: "核心数据 · 只读",
        title: `保护基金 ${reserve.fund || 0}`,
        icon: "fund",
        readOnly: true,
        footer: "基金来自回收物移交，只用于采购具体巡护补给。",
        items: [
          { tag: "来源", title: "收取回收物 → 移交", body: "动物与巡护会在沙盘留下回收物；收取后可在物资页移交获得基金。" },
          { tag: "用途", title: "购买巡护补给", body: "狗粮、警报器、麻醉弹与野外工具包分别支持不同任务。" },
          { tag: "当前", title: `${reserve.fund || 0}`, body: "这里仅展示数据，不直接发起操作。" }
        ]
      },
      water: {
        kicker: "核心数据 · 只读",
        title: `水源 ${water}`,
        icon: "water",
        readOnly: true,
        footer: water <= 60 ? "先回沙盘找到饮水点任务，再决定是否修复。" : "水源会随降雨、动物饮水与高水位外流动态变化。",
        items: [
          { tag: "状态", title: `${water}/100 · ${metricRisk(water, 60, 40)}`, body: water >= 75 ? "当前水位丰沛；雨水增益已衰减，入夜后河道会自然外流，不会长期堆到满值。" : "水位会直接改变沙盘水面和动物饮水路线。" },
          { tag: "健康", title: `疾病风险 ${disease}`, body: "水源紧张会让动物聚集，疾病更容易扩散。" },
          water <= 60
            ? { tag: "怎么改善", title: "沙盘 → 饮水点 → 修复栖息地", body: `${(supplies.fieldKit || 0) > 0 ? "已有野外工具包，可前往任务点。" : "缺野外工具包，先去物资页一键补齐。"} 一次成功修复通常恢复 2–5 点水源。` }
            : { tag: "迁徙", title: this.migrationLabel(migration), body: migration.reason || "水源充足时动物更愿意迁入。" }
        ]
      },
      grass: {
        kicker: "核心数据 · 只读",
        title: `草场 ${grass}`,
        icon: "leaf",
        readOnly: true,
        footer: grass <= 55 ? "先回沙盘找到草场任务，再决定修复或控制过度取食。" : "巡护、修复、季节与种群承载共同改变草场产能。",
        items: [
          { tag: "状态", title: `${grass}/100 · ${metricRisk(grass, 55, 38)}`, body: "草场决定食草动物数量、健康与幼体存活。" },
          { tag: "承载", title: `${herbivores} 只 / 当前约 ${capacity.effectiveHerbivoreCapacity} 只`, body: herbivores > capacity.effectiveHerbivoreCapacity ? "已超过当前草场承载，食草动物会消耗草场并逐步迁出。" : "当前食草动物仍在草场承载范围内。" },
          grass <= 55
            ? { tag: "怎么改善", title: "沙盘 → 草场任务 → 修复栖息地", body: `${(supplies.fieldKit || 0) > 0 ? "已有野外工具包，可前往任务点。" : "缺野外工具包，先去物资页一键补齐。"} 若疾病偏高，再从动物或沙盘任务进入生态干预。` }
            : { tag: "迁徙", title: this.migrationLabel(migration, reserve), body: migration.reason || "草场丰茂时动物更愿意留下。" }
        ]
      }
    };
    const config = configs[type] || configs.fund;
    const needsMapGuidance = (type === "water" && water <= 60) || (type === "grass" && grass <= 55);
    return Object.assign({}, config, {
      readOnly: true,
      actionLabel: needsMapGuidance ? "去沙盘找任务" : "",
      action: needsMapGuidance ? () => this.focusReserveMetricTask(type) : null,
      navigationOnly: needsMapGuidance
    });
  }

  buildSandboxInfoDetail(type) {
    const world = this.state.world || {};
    const reserve = world.reserve || {};
    const ecology = reserve.ecology || {};
    const latestPrivate = this.latestReport("private");
    const latestPublic = this.latestReport("public");
    const aiForest = world.aiForest || {};
    if (type === "brief") {
      const items = this.buildBriefInfoItems(latestPrivate, reserve);
      return {
        kicker: `简报 · ${items.length}条`,
        title: "保护区简报",
        icon: "eye",
        items,
        footer: "行动结算记录"
      };
    }
    const items = this.buildWorldInfoItems(world, reserve, ecology, aiForest, latestPublic);
    const worldTitle = aiForest.timeLabel || `${world.season || "夏季"} · ${world.weather || "天气未知"}`;
    return {
      kicker: "世界",
      title: `${worldTitle} · ${items.length} 条`,
      icon: "water",
      items,
      footer: "天气 · 动物 · 病虫害 · 传闻"
    };
  }

  buildBriefInfoItems(latestPrivate, reserve) {
    const reports = (this.state.reports || []).filter((report) => report.type === "private").slice(-5).reverse();
    const progression = this.reserveProgression(reserve);
    const chain = reserve.eventChain || {};
    const daily = ((this.state.world || {}).goals || {}).daily || {};
    const items = reports.map((report, index) => {
      const visual = report.visual || {};
      const card = visual.eventCard || {};
      return {
        tag: `D${report.day || "?"}`,
        title: card.title || report.title || `简报 ${index + 1}`,
        body: this.compactInfoText(card.body || report.body || "完成一次结算。")
      };
    });
    if (!items.length) {
      items.push({
        tag: "待办",
        title: "还没有巡护简报",
        body: "完成巡护后生成记录。"
      });
    }
    items.unshift({
      tag: `第${progression.stage || 1}章 · Lv.${progression.level}`,
      title: `${progression.title} · ${Math.round((progression.progress || 0) * 100)}%`,
      body: `操作 ${progression.chapterActions || 0}/${(progression.gate || {}).actions || 4} · 里程碑 ${progression.milestoneDone || 0}/${progression.milestoneNeed || 1} · 预计 ${(progression.gate || {}).expectedMinutes || 10} 分钟`
    });
    if (chain.current) {
      items.unshift({
        tag: chain.branchTitle ? `${chain.branchTitle} ${chain.cycle || 1}轮` : `${chain.step || 0}/${chain.length || 7}`,
        title: `${chain.step || 0}/${chain.length || 7} · ${chain.current.title || "阶段事件线"}`,
        body: chain.advanced ? (chain.lastResult || chain.current.summary) : (chain.waitingText || "事件暂歇，等待数据与操作共同满足条件。")
      });
    }
    items.unshift({
      tag: "当前",
      title: `基${reserve.fund || 0} · 水${((reserve.ecology || {}).water) || 0} · 草${((reserve.ecology || {}).grass) || 0}`,
      body: `${this.migrationLabel(reserve.migration || {})} · ${this.reserveWarning(reserve)}`
    });
    if (daily.title) {
      items.unshift({
        tag: "任务",
        title: (daily.title || "").replace("今日目标：", ""),
        body: `推荐：${daily.buttonLabel || daily.recommendedAction || "巡护"}`
      });
    }
    return items.slice(0, 4);
  }

  buildWorldInfoItems(world, reserve, ecology, aiForest, latestPublic) {
    const chain = reserve.eventChain || {};
    const social = reserve.social || {};
    const items = [];
    if (social.log) {
      items.push({
        tag: social.actorScope === "world" ? "世界" : "好友",
        title: social.title || "保护区联动",
        body: `${this.socialStoryLine(social)} ${this.socialImpactLine(social)}。${social.priceNote || ""} ${social.salvageNote || ""}`
      });
      items.push({
        tag: "去查看",
        title: "保护地网络",
        body: "查看迁徙、项目拨款与边界联动。"
      });
    }
    items.push({
      tag: "状态",
      title: `${world.weather || "天气未知"} · 水 ${ecology.water || 0} · 草 ${ecology.grass || 0}`,
      body: aiForest.summary || "动物保持观望，森林还在等下一次行动。"
    });
    if (chain.current) {
      items.push({
        tag: `${chain.step || 0}/${chain.length || 7}`,
        title: chain.current.title || "阶段事件线",
        body: `${chain.current.summary || chain.lastResult || "森林正在记住你的连续行动。"} 下一章：${(chain.next && chain.next.title) || "新一轮守护"}`
      });
    }
    (aiForest.facts || []).slice(0, 3).forEach((fact) => {
      items.push({
        tag: "事实",
        title: `${fact.label} ${fact.value}${fact.delta ? ` ${fact.delta > 0 ? "+" : ""}${fact.delta}` : ""}`,
        body: fact.evidence || "森林状态已更新。"
      });
    });
    (world.natureKnowledge || []).slice(-2).reverse().forEach((text) => {
      items.push({ tag: "知识", title: "自然知识", body: text });
    });
    (world.rumors || []).slice(-2).reverse().forEach((text) => {
      items.push({ tag: "传闻", title: "保护区传闻", body: text });
    });
    if (latestPublic) {
      items.push({ tag: `D${latestPublic.day || "?"}`, title: latestPublic.title || "公共报告", body: this.compactInfoText(latestPublic.body || "") });
    }
    items.push({
      tag: "种群",
      title: `食肉 ${this.totalOf(ecology.predators || {})} / 食草 ${this.totalOf(ecology.herbivores || {})}`,
      body: `疾病/虫害 ${ecology.disease || 0}，基金 ${reserve.fund || 0}，迁移 ${this.migrationLabel(reserve.migration || {})}。`
    });
    return items.slice(0, 6);
  }

  compactInfoText(text) {
    return String(text || "").replace(/\n+/g, " ").replace(/\s+/g, " ").slice(0, 120);
  }

  reserveWarning(reserve) {
    const ecology = (reserve && reserve.ecology) || {};
    const supplies = (reserve && reserve.supplies) || {};
    const predators = this.totalOf(ecology.predators || {});
    const herbivores = this.totalOf(ecology.herbivores || {});
    if ((ecology.water || 0) < 45) return "优先修复水源";
    if ((ecology.grass || 0) < 45) return "优先修复草场";
    if ((ecology.disease || 0) > 35) return "优先巡护采样";
    if (predators * 5 > herbivores) return "草场承载受压";
    if ((reserve.poacherPressure || 0) > 55) return "巡护风险偏高";
    if ((supplies.dogFood || 0) < 3) return "狗粮库存偏低";
    return "状态可控";
  }

  totalOf(group) {
    return Object.keys(group || {}).reduce((sum, key) => sum + ((group && group[key]) || 0), 0);
  }

  socialStoryLine(social = {}) {
    const text = social.log || social.migrationNote || "周边保护地正在观察你的保护区。";
    return this.compactInfoText(text).slice(0, 92);
  }

  socialImpactLine(social = {}) {
    const parts = [
      `迁移 ${this.signed(social.migrationDelta || 0)}`,
      `拨款 ${this.signed(social.marketDelta || 0)}`,
      `回收 ${this.signed(social.salvageDelta || 0)}`,
      `风险 ${this.signed(social.pressure || 0)}`
    ];
    return parts.join(" · ");
  }

  socialImpactChip(ctx, x, y, w, label, value, positiveGood = true) {
    const n = Math.round(value || 0);
    const good = n === 0 ? true : positiveGood ? n > 0 : n <= 0;
    const color = n === 0 ? "#66715f" : good ? "#1f7a52" : "#c45b42";
    const fill = n === 0 ? "#f3eddd" : good ? "#e6f2dc" : "#fff0e8";
    this.roundRect(ctx, x, y, w, 28, 7, fill, "rgba(36,64,46,0.10)");
    this.text(ctx, label, x + 8, y + 18, 9, "#66715f", "700");
    this.text(ctx, this.signed(n), x + w - 8, y + 18, 11, color, "700", "right");
  }

  openReserveNetwork(scope) {
    const targetScope = scope || (((this.state.world.reserve || {}).social || {}).actorScope === "world" ? "world" : "friends");
    if (targetScope === "friends" && !this.hasFriendLeagueMembers()) {
      this.shareFriendLeagueInvite();
      return;
    }
    this.leagueScope = targetScope;
    this.ensureSelectedRivalForScope(this.leagueScope);
    this.setScreen("league");
  }

  shareFriendLeagueInvite() {
    const reserve = (this.state.world || {}).reserve || {};
    const base = reserve.base || {};
    this.shareForestPostcard(null, {
      shareTitle: `来${base.name || "我的保护区"}，和我一起守护动物`,
      text: `我的好友榜还空着。来${base.name || "我的保护区"}留下第一枚守护印记，一起让动物安全回家。`
    });
  }

  drawFriendLeagueInvite(ctx, x, y, w) {
    this.panel(ctx, x, y, w, 156);
    this.roundRect(ctx, x + w / 2 - 27, y + 14, 54, 54, 17, "#e6f2dc", "rgba(31,122,82,0.28)");
    this.drawSmallGlyph(ctx, "eye", x + w / 2, y + 41, "#1f7a52", 1.04);
    this.text(ctx, "好友榜等待第一位守护者", x + w / 2, y + 87, 16, "#1c3325", "700", "center");
    this.text(ctx, "分享链接，好友进入后自动加入", x + w / 2, y + 107, 10, "#66715f", "700", "center");
    this.button(ctx, x + 20, y + 119, w - 40, 30, "邀请好友加入", "#1c3325", () => this.shareFriendLeagueInvite(), "#fff8df", 12);
  }

  drawLeagueTeaser(ctx, x, y, w) {
    const reserve = this.state.world.reserve || {};
    const base = reserve.base || {};
    const social = reserve.social || {};
    const hasFriends = this.hasFriendLeagueMembers();
    const friendRank = hasFriends ? this.leagueRankOfMine("friends") : 0;
    const worldRank = this.leagueRankOfMine("world");
    this.panel(ctx, x, y, w, 106);
    this.text(ctx, "保护地网络", x + 16, y + 24, 15, "#1c3325", "700");
    this.text(ctx, `评分 ${base.rating || 0} · 防护 ${base.shield || 0}`, x + w - 16, y + 24, 11, "#8b6f2a", "700", "right");
    const chipW = (w - 52) / 4;
    this.socialImpactChip(ctx, x + 14, y + 34, chipW, "迁移", social.migrationDelta || 0, true);
    this.socialImpactChip(ctx, x + 22 + chipW, y + 34, chipW, "拨款", social.marketDelta || 0, true);
    this.socialImpactChip(ctx, x + 30 + chipW * 2, y + 34, chipW, "回收", social.salvageDelta || 0, true);
    this.socialImpactChip(ctx, x + 38 + chipW * 3, y + 34, chipW, "风险", social.pressure || 0, false);
    this.addHit(x, y - this.scrollY, w, 66, () => this.openReserveNetwork(social.actorScope === "world" ? "world" : "friends"));
    this.button(ctx, x + 14, y + 70, (w - 36) / 2, 28, hasFriends ? `好友 #${friendRank}` : "邀请好友", "#e8ddbd", () => this.openReserveNetwork("friends"), "#26352b", 10);
    this.button(ctx, x + 22 + (w - 36) / 2, y + 70, (w - 36) / 2, 28, `世界 #${worldRank || "-"}`, "#1c3325", () => this.openReserveNetwork("world"), "#fff8df", 10);
    this.renderedLeagueTeaser = { x, y, w, h: 106, metrics: 4, buttons: 2 };
  }

  drawMapMarkerDialogueBubble(ctx, marker = {}, x, y, camera = {}, index = 0) {
    const text = this.truncateTextToWidth(ctx, marker.dialogue || marker.title || marker.label || "查看线索", 104, 10, "700");
    const w = Math.max(58, Math.min(122, text.length * 10 + 18));
    const h = 24;
    const frameX = camera.x || 0;
    const frameY = camera.y || 0;
    const frameW = camera.w || this.width;
    const frameH = camera.h || this.height;
    const preferRight = x < frameX + frameW * 0.58;
    const targetX = preferRight ? x + 17 : x - w - 17;
    const targetY = y - 36 - (index % 2) * 6;
    const bx = Math.max(frameX + 4, Math.min(frameX + frameW - w - 4, targetX));
    const by = Math.max(frameY + 4, Math.min(frameY + frameH - h - 4, targetY));
    const fill = "rgba(255,255,255,.94)";
    const stroke = marker.type === "recovery" ? "rgba(47,125,98,.42)" : marker.kind === "exclamation" ? "rgba(211,93,87,.36)" : UI_THEME.separator;
    this.roundRect(ctx, bx, by + 2, w, h, 8, "rgba(20,32,27,.16)");
    this.roundRect(ctx, bx, by, w, h, 8, fill, stroke);
    this.text(ctx, text, bx + w / 2, by + 16, 10, "#26352b", "700", "center");
  }

  drawRangerMapCharacter(ctx, x, groundY, scale = 1) {
    const s = Math.max(.68, Math.min(1.35, scale));
    ctx.save();
    ctx.fillStyle = "rgba(27,43,31,.24)";
    ctx.beginPath();
    ctx.ellipse(x, groundY + 2 * s, 13 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // 背包、身体和双腿使用实色体块，远看仍能识别为巡护员而非线稿。
    this.roundRect(ctx, x - 12 * s, groundY - 30 * s, 8 * s, 18 * s, 4 * s, "#8b6b43", "rgba(37,55,43,.45)");
    ctx.fillStyle = "#385c48";
    ctx.beginPath();
    ctx.moveTo(x - 9 * s, groundY - 29 * s);
    ctx.quadraticCurveTo(x, groundY - 35 * s, x + 9 * s, groundY - 29 * s);
    ctx.lineTo(x + 7 * s, groundY - 10 * s);
    ctx.lineTo(x - 7 * s, groundY - 10 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#d7c59b";
    ctx.fillRect(x - 7 * s, groundY - 10 * s, 5 * s, 11 * s);
    ctx.fillRect(x + 2 * s, groundY - 10 * s, 5 * s, 11 * s);
    ctx.fillStyle = "#4d493d";
    ctx.fillRect(x - 8 * s, groundY - 1 * s, 7 * s, 3 * s);
    ctx.fillRect(x + 1 * s, groundY - 1 * s, 7 * s, 3 * s);
    ctx.fillStyle = "#e7b98b";
    ctx.beginPath();
    ctx.arc(x, groundY - 39 * s, 9 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#375444";
    ctx.beginPath();
    ctx.ellipse(x, groundY - 47 * s, 12 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    this.roundRect(ctx, x - 8 * s, groundY - 53 * s, 16 * s, 8 * s, 4 * s, "#58765f", "rgba(25,50,39,.32)");
    ctx.fillStyle = "#293b32";
    ctx.beginPath(); ctx.arc(x - 3 * s, groundY - 40 * s, 1.1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 3 * s, groundY - 40 * s, 1.1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "rgba(90,60,43,.65)";
    ctx.lineWidth = Math.max(1, s);
    ctx.beginPath(); ctx.arc(x, groundY - 37 * s, 3 * s, .2, Math.PI - .2); ctx.stroke();
    ctx.restore();
    this.renderedRangerActors = this.renderedRangerActors || [];
    this.renderedRangerActors.push({ x, y: groundY, h: 55 * s, style: "filled-cartoon-ranger", concrete: true });
  }

  mapCameraInfo(x, y, w, h) {
    const scale = this.currentMapScale();
    const base = Math.max(w, h);
    const worldH = base * 1.24;
    const worldW = worldH * 1.75;
    const worldSize = worldH;
    const frame = { x, y, w, h, worldSize, worldW, worldH, scale };
    const camera = this.clampMapCamera((this.mapCamera || {}).cx || 0.52, (this.mapCamera || {}).cy || 0.48, scale, frame);
    const visualW = worldW * scale;
    const visualH = worldH * scale;
    return {
      x,
      y,
      w,
      h,
      worldX: x + w / 2 - camera.cx * visualW,
      worldY: y + h / 2 - camera.cy * visualH,
      worldSize,
      worldW,
      worldH,
      scale,
      cx: camera.cx,
      cy: camera.cy
    };
  }

  normalizedMapCamera(scale) {
    const camera = this.mapCamera || { cx: 0.52, cy: 0.48 };
    return this.clampMapCamera(camera.cx, camera.cy, scale, this.mapCameraFrame);
  }

  currentMapScale() {
    if (this.mapZoom >= 2) return 2.02;
    return this.mapZoom > 0 ? 1.72 : 1.12;
  }

  clampMapCamera(cx, cy, scale, frame) {
    const mapFrame = frame || this.mapCameraFrame;
    if (!mapFrame) {
      const half = 0.5 / scale;
      return {
        cx: Math.max(half, Math.min(1 - half, cx)),
        cy: Math.max(half, Math.min(1 - half, cy))
      };
    }
    const worldW = mapFrame.worldW || mapFrame.worldSize;
    const worldH = mapFrame.worldH || mapFrame.worldSize;
    const halfX = mapFrame.w / (2 * worldW * scale);
    const halfY = mapFrame.h / (2 * worldH * scale);
    const edgePad = 0;
    return {
      cx: Math.max(halfX - edgePad, Math.min(1 - halfX + edgePad, cx)),
      cy: Math.max(halfY - edgePad, Math.min(1 - halfY + edgePad, cy))
    };
  }

  panMapBy(dx, dy) {
    const frame = this.mapCameraFrame;
    if (!frame) return;
    const current = this.normalizedMapCamera(frame.scale);
    const next = this.clampMapCamera(
      current.cx - dx / ((frame.worldW || frame.worldSize) * frame.scale),
      current.cy - dy / ((frame.worldH || frame.worldSize) * frame.scale),
      frame.scale,
      frame
    );
    this.mapCamera = next;
  }

  mapPoint(nx, ny, camera) {
    return {
      x: camera.worldX + nx * (camera.worldW || camera.worldSize) * camera.scale,
      y: camera.worldY + ny * (camera.worldH || camera.worldSize) * camera.scale
    };
  }

  drawMapStage(ctx, camera) {
    this.roundRect(ctx, camera.x, camera.y, camera.w, camera.h, 8, "rgba(255, 248, 223, 0.06)", "rgba(31, 72, 44, 0.26)");
  }

  drawSimpleReserveMapBackdrop(ctx, camera, fast = false) {
    this.drawCartoonSavannaMap(ctx, camera, fast, true);
  }

  drawCartoonSavannaMap(ctx, camera, fast = false, quiet = false) {
    const x = camera.worldX;
    const y = camera.worldY;
    const w = (camera.worldW || camera.worldSize) * camera.scale;
    const h = (camera.worldH || camera.worldSize) * camera.scale;
    ctx.save();
    const mapSource = this.mapImageSource();
    if (mapSource) {
      this.drawSavannaReferenceMap(ctx, mapSource.image, x, y, w, h, fast, mapSource.frame);
      ctx.restore();
      return;
    }
    const ground = ctx.createLinearGradient(x, y, x, y + h);
    ground.addColorStop(0, "#f6c85b");
    ground.addColorStop(0.48, "#e9b74e");
    ground.addColorStop(1, "#d8953f");
    this.roundRect(ctx, x, y, w, h, 10, ground);

    this.drawSavannaSkyRim(ctx, x, y, w, h);
    this.drawSavannaSandBand(ctx, x + w * 0.46, y + h * 0.62, w * 0.88, h * 0.42, -0.05, "#f1ce65", "#c98935");
    this.drawSavannaSandBand(ctx, x + w * 0.22, y + h * 0.84, w * 0.72, h * 0.30, 0.04, "#efbd54", "#bc7833");
    this.drawSavannaSandBand(ctx, x + w * 0.82, y + h * 0.78, w * 0.56, h * 0.24, -0.08, "#e3a64a", "#b66f31");
    this.drawSavannaRiver(ctx, x, y, w, h, quiet);
    [
      [0.18, 0.66, 0.13, 0.065],
      [0.67, 0.32, 0.10, 0.052],
      [0.80, 0.71, 0.12, 0.058]
    ].forEach((hole) => {
      this.drawSimpleWaterHole(ctx, x + w * hole[0], y + h * hole[1], w * hole[2], h * hole[3]);
    });

    if (!fast) {
      this.drawSimpleMapTrail(ctx, x, y, w, h, [[0.08, 0.74], [0.24, 0.67], [0.42, 0.63], [0.58, 0.56], [0.76, 0.47]], "rgba(160, 105, 43, 0.24)", 9);
      this.drawSimpleMapTrail(ctx, x, y, w, h, [[0.30, 0.30], [0.44, 0.40], [0.55, 0.54], [0.72, 0.66]], "rgba(160, 105, 43, 0.17)", 6);
      this.drawSimpleContour(ctx, x + w * 0.26, y + h * 0.80, w * 0.22, h * 0.09, -0.08);
      this.drawSimpleContour(ctx, x + w * 0.76, y + h * 0.38, w * 0.24, h * 0.10, 0.18);
      this.drawSavannaRockCluster(ctx, x + w * 0.18, y + h * 0.38, w * 0.12, h * 0.07);
      this.drawSavannaRockCluster(ctx, x + w * 0.76, y + h * 0.56, w * 0.14, h * 0.08);
      this.drawSavannaRockCluster(ctx, x + w * 0.46, y + h * 0.83, w * 0.10, h * 0.06);
    }

    ctx.strokeStyle = "rgba(151, 109, 38, 0.25)";
    ctx.lineWidth = 1.5;
    const tuftCount = fast ? 14 : 42;
    for (let i = 0; i < tuftCount; i += 1) {
      const tx = x + w * (0.06 + ((i * 37) % 88) / 100);
      const ty = y + h * (0.30 + ((i * 53) % 64) / 100);
      this.drawSavannaGrassTuft(ctx, tx, ty, 5 + (i % 5));
    }

    if (!fast) {
      [
        [0.12, 0.47, 0.92],
        [0.34, 0.34, 0.64],
        [0.60, 0.45, 0.70],
        [0.82, 0.30, 0.76],
        [0.73, 0.82, 0.66],
        [0.22, 0.78, 0.58]
      ].forEach((tree) => this.drawAcaciaTree(ctx, x + w * tree[0], y + h * tree[1], Math.max(0.68, w / 500) * tree[2]));
    }
    ctx.restore();
  }

  drawSavannaReferenceMap(ctx, image, x, y, w, h, fast = false, sourceFrame = null) {
    ctx.save();
    this.roundRect(ctx, x, y, w, h, 10, "#eeba54");
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const frame = sourceFrame || { x: 0, y: 0, w: image.width || image.naturalWidth || 2048, h: image.height || image.naturalHeight || 1024 };
    const iw = frame.w;
    const ih = frame.h;
    const srcRatio = iw / ih;
    const targetRatio = w / h;
    let sx = 0;
    let sy = 0;
    let sw = iw;
    let sh = ih;
    if (srcRatio > targetRatio) {
      sw = ih * targetRatio;
      sx = (iw - sw) * 0.54;
    } else {
      sh = iw / targetRatio;
      sy = (ih - sh) * 0.48;
    }
    ctx.drawImage(image, frame.x + sx, frame.y + sy, sw, sh, x, y, w, h);
    const warmth = ctx.createLinearGradient(x, y, x, y + h);
    warmth.addColorStop(0, "rgba(255, 247, 196, 0.04)");
    warmth.addColorStop(0.58, "rgba(244, 176, 73, 0.08)");
    warmth.addColorStop(1, "rgba(110, 69, 27, 0.10)");
    ctx.fillStyle = warmth;
    ctx.fillRect(x, y, w, h);
    if (!fast) {
      this.drawSavannaMapVignette(ctx, x, y, w, h);
    }
    ctx.restore();
  }

  drawSavannaMapVignette(ctx, x, y, w, h) {
    ctx.save();
    const top = ctx.createLinearGradient(x, y, x, y + h * 0.26);
    top.addColorStop(0, "rgba(255, 255, 255, 0.08)");
    top.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = top;
    ctx.fillRect(x, y, w, h * 0.26);
    ctx.strokeStyle = "rgba(255, 248, 223, 0.18)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.restore();
  }

  drawSavannaSkyRim(ctx, x, y, w, h) {
    ctx.save();
    const sky = ctx.createLinearGradient(x, y, x, y + h * 0.34);
    sky.addColorStop(0, "rgba(95, 198, 244, 0.72)");
    sky.addColorStop(0.72, "rgba(142, 214, 240, 0.38)");
    sky.addColorStop(1, "rgba(246, 200, 91, 0)");
    ctx.fillStyle = sky;
    ctx.fillRect(x, y, w, h * 0.30);
    ctx.fillStyle = "rgba(137, 112, 177, 0.30)";
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.24);
    ctx.bezierCurveTo(x + w * 0.15, y + h * 0.16, x + w * 0.22, y + h * 0.30, x + w * 0.36, y + h * 0.22);
    ctx.bezierCurveTo(x + w * 0.50, y + h * 0.14, x + w * 0.60, y + h * 0.31, x + w * 0.74, y + h * 0.20);
    ctx.bezierCurveTo(x + w * 0.88, y + h * 0.12, x + w * 0.92, y + h * 0.28, x + w, y + h * 0.22);
    ctx.lineTo(x + w, y + h * 0.36);
    ctx.lineTo(x, y + h * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(168, 126, 80, 0.20)";
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.32);
    ctx.bezierCurveTo(x + w * 0.22, y + h * 0.28, x + w * 0.36, y + h * 0.37, x + w * 0.52, y + h * 0.31);
    ctx.bezierCurveTo(x + w * 0.72, y + h * 0.24, x + w * 0.84, y + h * 0.35, x + w, y + h * 0.30);
    ctx.lineTo(x + w, y + h * 0.42);
    ctx.lineTo(x, y + h * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawSavannaSandBand(ctx, cx, cy, w, h, rotation, fill, stroke) {
    ctx.save();
    const g = ctx.createRadialGradient(cx - w * 0.16, cy - h * 0.20, 3, cx, cy, Math.max(w, h) * 0.58);
    g.addColorStop(0, this.rgba(fill, 0.86));
    g.addColorStop(1, this.rgba(fill, 0.34));
    ctx.fillStyle = g;
    ctx.strokeStyle = this.rgba(stroke, 0.16);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.5, h * 0.42, rotation, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawSavannaRiver(ctx, x, y, w, h, quiet) {
    ctx.save();
    const river = ctx.createLinearGradient(x + w * 0.58, y + h * 0.20, x + w * 0.52, y + h);
    river.addColorStop(0, "#64c7ee");
    river.addColorStop(0.58, "#77d6f5");
    river.addColorStop(1, "#4fb9df");
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(178, 108, 36, 0.38)";
    ctx.lineWidth = Math.max(34, w * 0.070);
    ctx.beginPath();
    ctx.moveTo(x + w * 0.58, y + h * 0.27);
    ctx.bezierCurveTo(x + w * 0.48, y + h * 0.36, x + w * 0.66, y + h * 0.45, x + w * 0.50, y + h * 0.58);
    ctx.bezierCurveTo(x + w * 0.35, y + h * 0.70, x + w * 0.58, y + h * 0.78, x + w * 0.47, y + h * 0.98);
    ctx.stroke();
    ctx.strokeStyle = river;
    ctx.lineWidth = Math.max(25, w * 0.052);
    ctx.stroke();
    if (!quiet) {
      ctx.strokeStyle = "rgba(236, 254, 255, 0.44)";
      ctx.lineWidth = Math.max(2, w * 0.006);
      ctx.beginPath();
      ctx.moveTo(x + w * 0.58, y + h * 0.30);
      ctx.bezierCurveTo(x + w * 0.50, y + h * 0.39, x + w * 0.63, y + h * 0.47, x + w * 0.50, y + h * 0.58);
      ctx.bezierCurveTo(x + w * 0.40, y + h * 0.69, x + w * 0.54, y + h * 0.78, x + w * 0.48, y + h * 0.94);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSavannaGrassTuft(ctx, x, y, size) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - size, y + size * 0.6);
    ctx.quadraticCurveTo(x - size * 0.28, y - size * 0.8, x, y + size * 0.52);
    ctx.quadraticCurveTo(x + size * 0.22, y - size * 0.7, x + size, y + size * 0.55);
    ctx.stroke();
    ctx.restore();
  }

  drawSavannaRockCluster(ctx, cx, cy, w, h) {
    ctx.save();
    ctx.fillStyle = "#b4875e";
    ctx.strokeStyle = "rgba(117, 79, 48, 0.36)";
    ctx.lineWidth = 2;
    [
      [-0.18, 0.04, 0.26, 0.20],
      [0.10, -0.04, 0.30, 0.24],
      [0.28, 0.12, 0.16, 0.13],
      [-0.40, 0.16, 0.14, 0.10]
    ].forEach((rock) => {
      ctx.beginPath();
      ctx.ellipse(cx + w * rock[0], cy + h * rock[1], w * rock[2], h * rock[3], -0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  drawSimpleMapTrail(ctx, x, y, w, h, points, color, width) {
    const mapped = points.map((point) => ({ x: x + w * point[0], y: y + h * point[1] }));
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(255, 248, 223, 0.18)";
    ctx.lineWidth = width + 4;
    this.drawSmoothPath(ctx, mapped);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    this.drawSmoothPath(ctx, mapped);
    ctx.stroke();
    ctx.restore();
  }

  drawSmoothPath(ctx, points) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i += 1) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  drawSimpleContour(ctx, cx, cy, w, h, rotation) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 248, 223, 0.15)";
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i += 1) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, w * (0.72 + i * 0.14), h * (0.50 + i * 0.12), rotation, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawSimpleWaterHole(ctx, cx, cy, rx, ry) {
    ctx.save();
    const water = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
    water.addColorStop(0, "rgba(181, 231, 224, 0.88)");
    water.addColorStop(0.64, "rgba(95, 174, 174, 0.74)");
    water.addColorStop(1, "rgba(53, 105, 97, 0.18)");
    ctx.fillStyle = water;
    ctx.strokeStyle = "rgba(255, 248, 223, 0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, -0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawAcaciaTree(ctx, x, y, scale = 1) {
    ctx.save();
    ctx.strokeStyle = "rgba(84, 67, 38, 0.64)";
    ctx.lineWidth = 2.2 * scale;
    ctx.beginPath();
    ctx.moveTo(x, y + 15 * scale);
    ctx.lineTo(x + 4 * scale, y - 6 * scale);
    ctx.moveTo(x + 3 * scale, y + 2 * scale);
    ctx.lineTo(x - 9 * scale, y - 8 * scale);
    ctx.moveTo(x + 4 * scale, y - 3 * scale);
    ctx.lineTo(x + 16 * scale, y - 12 * scale);
    ctx.stroke();
    ctx.fillStyle = "rgba(67, 119, 64, 0.70)";
    ctx.strokeStyle = "rgba(33, 75, 45, 0.34)";
    ctx.lineWidth = 1.3 * scale;
    [
      [-8, -10, 16, 6],
      [7, -13, 22, 7],
      [0, -17, 24, 6]
    ].forEach((leaf) => {
      ctx.beginPath();
      ctx.ellipse(x + leaf[0] * scale, y + leaf[1] * scale, leaf[2] * scale, leaf[3] * scale, -0.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  cartoonAnimalPalette(species) {
    return {
      狼: { face: "#8f9790", dark: "#4d5a59", light: "#d8ddd2", accent: "#f0d376" },
      鹿: { face: "#b9844d", dark: "#6d4a31", light: "#f2d7a8", accent: "#8b5d35" },
      乌鸦: { face: "#273044", dark: "#111822", light: "#667187", accent: "#f0d376" },
      熊: { face: "#87623f", dark: "#553822", light: "#d8b889", accent: "#f0d376" },
      水貂: { face: "#6c746a", dark: "#38443f", light: "#d7dfd3", accent: "#b8d7d4" },
      狮子: { face: "#d2a04d", dark: "#8a5429", light: "#f6d28d", accent: "#b0692f" },
      豹子: { face: "#c98d43", dark: "#5f3a24", light: "#f1c77e", accent: "#2f271f" },
      鳄鱼: { face: "#688654", dark: "#304d33", light: "#c8d9a0", accent: "#dfead0" },
      野犬: { face: "#a56f45", dark: "#3e2b25", light: "#e4c797", accent: "#e2a84b" },
      斑马: { face: "#ece5d0", dark: "#303538", light: "#ffffff", accent: "#16191b" },
      羚羊: { face: "#c59655", dark: "#69452f", light: "#f1d6a1", accent: "#4d3325" },
      长颈鹿: { face: "#d2a456", dark: "#8a5a33", light: "#f0d69a", accent: "#6e442a" },
      大象: { face: "#858d88", dark: "#56605d", light: "#d9dfdc", accent: "#f0d376" }
    }[species] || { face: "#8d714d", dark: "#4e3a2a", light: "#f0d6a0", accent: "#f0d376" };
  }

  drawCartoonAnimalHead(ctx, animal, x, y, size) {
    const species = (animal && animal.species) || "";
    const p = this.cartoonAnimalPalette(species);
    const r = size / 2;
    ctx.save();
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.strokeStyle = "rgba(30, 41, 30, 0.42)";
    const drawEar = (ex, ey, ew, eh, rot = 0) => {
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(rot);
      ctx.fillStyle = p.face;
      ctx.beginPath();
      ctx.ellipse(0, 0, ew, eh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = this.rgba(p.light, 0.72);
      ctx.beginPath();
      ctx.ellipse(0, eh * 0.06, ew * 0.48, eh * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const drawEye = (ex, ey) => {
      ctx.fillStyle = "#16201d";
      ctx.beginPath();
      ctx.arc(ex, ey, Math.max(1.3, size * 0.045), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.82)";
      ctx.beginPath();
      ctx.arc(ex + size * 0.014, ey - size * 0.014, Math.max(0.7, size * 0.014), 0, Math.PI * 2);
      ctx.fill();
    };
    const drawMuzzle = (mw = 0.30, mh = 0.19) => {
      ctx.fillStyle = this.rgba(p.light, 0.86);
      ctx.beginPath();
      ctx.ellipse(x, y + size * 0.13, size * mw, size * mh, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.dark;
      ctx.beginPath();
      ctx.ellipse(x, y + size * 0.08, size * 0.055, size * 0.04, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = this.rgba(p.dark, 0.42);
      ctx.lineWidth = Math.max(1, size * 0.025);
      ctx.beginPath();
      ctx.moveTo(x, y + size * 0.11);
      ctx.quadraticCurveTo(x - size * 0.04, y + size * 0.18, x - size * 0.11, y + size * 0.17);
      ctx.moveTo(x, y + size * 0.11);
      ctx.quadraticCurveTo(x + size * 0.04, y + size * 0.18, x + size * 0.11, y + size * 0.17);
      ctx.stroke();
    };

    if (species === "乌鸦") {
      ctx.fillStyle = p.face;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.72, r * 0.86, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#d8a13a";
      ctx.beginPath();
      ctx.moveTo(x + size * 0.05, y + size * 0.04);
      ctx.lineTo(x + size * 0.35, y + size * 0.12);
      ctx.lineTo(x + size * 0.05, y + size * 0.20);
      ctx.closePath();
      ctx.fill();
      drawEye(x - size * 0.12, y - size * 0.08);
      drawEye(x + size * 0.10, y - size * 0.07);
      ctx.restore();
      return;
    }

    if (species === "鳄鱼") {
      ctx.fillStyle = p.face;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.92, r * 0.46, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.dark;
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.arc(x + i * size * 0.12, y - size * 0.25, size * 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
      drawEye(x - size * 0.20, y - size * 0.13);
      drawEye(x + size * 0.20, y - size * 0.13);
      ctx.strokeStyle = this.rgba(p.dark, 0.5);
      ctx.beginPath();
      ctx.moveTo(x - size * 0.34, y + size * 0.08);
      ctx.lineTo(x + size * 0.34, y + size * 0.08);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (species === "大象") {
      drawEar(x - size * 0.34, y - size * 0.03, size * 0.18, size * 0.27, -0.28);
      drawEar(x + size * 0.34, y - size * 0.03, size * 0.18, size * 0.27, 0.28);
    } else if (species === "长颈鹿") {
      drawEar(x - size * 0.22, y - size * 0.25, size * 0.10, size * 0.16, -0.26);
      drawEar(x + size * 0.22, y - size * 0.25, size * 0.10, size * 0.16, 0.26);
      ctx.strokeStyle = p.dark;
      ctx.beginPath();
      ctx.moveTo(x - size * 0.11, y - size * 0.30);
      ctx.lineTo(x - size * 0.10, y - size * 0.43);
      ctx.moveTo(x + size * 0.11, y - size * 0.30);
      ctx.lineTo(x + size * 0.10, y - size * 0.43);
      ctx.stroke();
      ctx.fillStyle = p.dark;
      ctx.beginPath();
      ctx.arc(x - size * 0.10, y - size * 0.44, size * 0.035, 0, Math.PI * 2);
      ctx.arc(x + size * 0.10, y - size * 0.44, size * 0.035, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawEar(x - size * 0.25, y - size * 0.18, size * 0.13, size * 0.18, -0.52);
      drawEar(x + size * 0.25, y - size * 0.18, size * 0.13, size * 0.18, 0.52);
    }

    if (species === "狮子") {
      ctx.fillStyle = p.dark;
      for (let i = 0; i < 12; i += 1) {
        const a = Math.PI * 2 * i / 12;
        ctx.beginPath();
        ctx.ellipse(x + Math.cos(a) * r * 0.34, y + Math.sin(a) * r * 0.24, r * 0.28, r * 0.18, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.fillStyle = p.face;
    ctx.strokeStyle = "rgba(30, 41, 30, 0.42)";
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.beginPath();
    ctx.ellipse(x, y, r * (species === "长颈鹿" ? 0.62 : 0.72), r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (species === "斑马") {
      ctx.strokeStyle = p.accent;
      ctx.lineWidth = Math.max(1, size * 0.045);
      for (let i = -2; i <= 2; i += 1) {
        ctx.beginPath();
        ctx.moveTo(x + i * size * 0.08, y - size * 0.30);
        ctx.lineTo(x + (i * 0.08 + 0.06) * size, y + size * 0.18);
        ctx.stroke();
      }
    }
    if (species === "豹子" || species === "长颈鹿") {
      ctx.fillStyle = this.rgba(p.accent, species === "豹子" ? 0.75 : 0.5);
      for (let i = 0; i < 7; i += 1) {
        ctx.beginPath();
        ctx.arc(x - size * 0.24 + (i % 4) * size * 0.15, y - size * 0.18 + Math.floor(i / 4) * size * 0.20, size * 0.025, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (species === "羚羊" || species === "鹿") {
      ctx.strokeStyle = p.dark;
      ctx.lineWidth = Math.max(1, size * 0.035);
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        ctx.moveTo(x + side * size * 0.12, y - size * 0.32);
        ctx.quadraticCurveTo(x + side * size * 0.18, y - size * 0.48, x + side * size * 0.10, y - size * 0.56);
        ctx.stroke();
      });
    }

    drawEye(x - size * 0.14, y - size * 0.07);
    drawEye(x + size * 0.14, y - size * 0.07);
    if (species === "大象") {
      ctx.fillStyle = p.face;
      ctx.strokeStyle = "rgba(30, 41, 30, 0.32)";
      ctx.beginPath();
      ctx.ellipse(x, y + size * 0.18, size * 0.12, size * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.light;
      ctx.beginPath();
      ctx.arc(x, y + size * 0.36, size * 0.035, 0, Math.PI * 2);
      ctx.fill();
    } else {
      drawMuzzle(species === "长颈鹿" ? 0.26 : 0.30, species === "水貂" ? 0.16 : 0.19);
    }
    if (species === "野犬") {
      ctx.fillStyle = p.dark;
      ctx.beginPath();
      ctx.ellipse(x - size * 0.17, y - size * 0.04, size * 0.10, size * 0.16, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  animalPersona(animal) {
    const map = {
      npc_wolf: { name: "沉牙狼", role: "灰围脖猎手", look: "银灰围脖、黄眼小狼，尾尖像一撮烟" },
      npc_deer: { name: "晨角鹿", role: "嫩角领路者", look: "浅棕大眼、嫩芽小角，耳朵永远先竖起来" },
      npc_crow: { name: "黑铃鸦", role: "树冠情报员", look: "黑羽亮眼、脖子挂小铃铛，专收森林八卦" },
      npc_bear: { name: "厚掌熊", role: "洞口大管家", look: "圆耳厚掌、胸前浅色月牙，走路像小山" },
      npc_mink: { name: "霜脊貂", role: "浅滩滑行客", look: "深褐长身、背上一道浅霜线，贴水滑行" },
      npc_lion: { name: "烈鬃狮", role: "草原狮群首领", look: "金色大鬃毛、半眯眼，像晒太阳的草原国王" },
      npc_leopard: { name: "影斑豹", role: "树影伏击者", look: "金黄斑点、长尾巴，喜欢把自己藏进树影" },
      npc_crocodile: { name: "裂吻鳄", role: "河岸伏击者", look: "扁宽脑袋、露齿大笑，只有眼睛浮在水面" },
      npc_wilddog: { name: "花耳犬", role: "追逐小队长", look: "一只耳朵黑一只耳朵黄，跑起来像彩色闪电" },
      npc_zebra: { name: "条纹斑马", role: "草原队列长", look: "黑白条纹像移动斑马线，眼神很认真" },
      npc_antelope: { name: "跳星羚", role: "草原预警员", look: "细腿弹跳、眼下有小白点，像随时准备起飞" },
      npc_giraffe: { name: "高枝鹿", role: "树梢瞭望者", look: "长脖子顶着小角，像一座会嚼叶子的望塔" },
      npc_elephant: { name: "云耳象", role: "水源记忆者", look: "大耳朵像两片云，鼻子会轻轻卷起水声" }
    };
    const bySpecies = {
      狼: { name: "沉牙狼", role: "灰围脖猎手", look: "银灰围脖、黄眼小狼，尾尖像一撮烟" },
      鹿: { name: "晨角鹿", role: "嫩角领路者", look: "浅棕大眼、嫩芽小角，耳朵永远先竖起来" },
      乌鸦: { name: "黑铃鸦", role: "树冠情报员", look: "黑羽亮眼、脖子挂小铃铛，专收森林八卦" },
      熊: { name: "厚掌熊", role: "洞口大管家", look: "圆耳厚掌、胸前浅色月牙，走路像小山" },
      水貂: { name: "霜脊貂", role: "浅滩滑行客", look: "深褐长身、背上一道浅霜线，贴水滑行" },
      狮子: { name: "烈鬃狮", role: "草原狮群首领", look: "金色大鬃毛、半眯眼，像晒太阳的草原国王" },
      豹子: { name: "影斑豹", role: "树影伏击者", look: "金黄斑点、长尾巴，喜欢把自己藏进树影" },
      鳄鱼: { name: "裂吻鳄", role: "河岸伏击者", look: "扁宽脑袋、露齿大笑，只有眼睛浮在水面" },
      野犬: { name: "花耳犬", role: "追逐小队长", look: "一只耳朵黑一只耳朵黄，跑起来像彩色闪电" },
      斑马: { name: "条纹斑马", role: "草原队列长", look: "黑白条纹像移动斑马线，眼神很认真" },
      羚羊: { name: "跳星羚", role: "草原预警员", look: "细腿弹跳、眼下有小白点，像随时准备起飞" },
      长颈鹿: { name: "高枝鹿", role: "树梢瞭望者", look: "长脖子顶着小角，像一座会嚼叶子的望塔" },
      大象: { name: "云耳象", role: "水源记忆者", look: "大耳朵像两片云，鼻子会轻轻卷起水声" }
    };
    return map[(animal && animal.id) || ""] || bySpecies[(animal && animal.species) || ""] || {
      name: (animal && (animal.animalName || animal.name || animal.species)) || "森林居民",
      role: "森林居民",
      look: "圆眼卡通动物，会根据森林变化做反应"
    };
  }

  animalDisplayName(animal) {
    return this.animalPersona(animal).name;
  }

  drawAnimalAvatar(ctx, animal, x, y, size = 48, active = false) {
    if (this.drawAnimalPortraitAsset(ctx, animal, x, y, size, active)) return;
    const persona = this.animalPersona(animal);
    ctx.save();
    const r = size / 2;
    const bg = {
      狼: "#415762",
      鹿: "#a67a42",
      乌鸦: "#293142",
      熊: "#75563a",
      水貂: "#4a5d66",
      狮子: "#b98438",
      豹子: "#b77b34",
      鳄鱼: "#506b45",
      野犬: "#8a5f3e",
      斑马: "#3f4751",
      羚羊: "#b58a4a",
      长颈鹿: "#b98d4c",
      大象: "#687276"
    }[(animal && animal.species) || ""] || "#55704a";
    this.roundRect(ctx, x - r, y - r, size, size, r, active ? "#fff3bf" : "#fff8df", active ? "rgba(240, 211, 118, 0.9)" : "rgba(36, 64, 46, 0.18)");
    ctx.beginPath();
    ctx.arc(x, y, r - 5, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = bg;
    ctx.fillRect(x - r, y - r, size, size);
    ctx.fillStyle = "rgba(255, 248, 223, 0.18)";
    ctx.beginPath();
    ctx.arc(x - r * 0.25, y - r * 0.28, r * 0.52, 0, Math.PI * 2);
    ctx.fill();
    this.drawCartoonAnimalHead(ctx, animal || { species: persona.name }, x, y + size * 0.03, size * 0.78);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = active ? "rgba(240, 211, 118, 0.9)" : "rgba(255, 248, 223, 0.6)";
    ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawPlayerToken(ctx, x, y, species, fill, alpha = 1, scale = 1) {
    const size = 28 * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    this.roundRect(ctx, x - size / 2, y - size / 2, size, size, size / 2, fill, "rgba(255,248,223,0.7)");
    this.text(ctx, this.speciesGlyph(species), x, y + 5 * scale, 15 * scale, "#fff8df", "700", "center");
    ctx.restore();
  }

  drawAnimalSticker(ctx, x, y, animal, alpha = 1, scale = 1, showName = false, options = {}) {
    const species = this.normalizeAnimalMapSpecies(animal && animal.species, animal);
    const spriteIndex = this.animalMapSpriteIndex(species);
    const image = this.art && this.art.animalMapSprites;
    const base = this.animalVisualSize(species) * scale * 1.28;
    const drawY = options && options.grounded && options.groundY !== undefined
      ? (options.bodyY !== undefined ? options.bodyY : options.groundY - this.animalGroundCenterOffset(species, base))
      : y;
    // 素材加载前宁可暂不绘制，也不闪回旧版羊形线稿占位。图集包含
    // 21 个等级物种，正常运行时每个地图实体都有唯一、准确的全身图像。
    if (spriteIndex < 0 || !image || !image.loaded || !ctx.drawImage) return false;
    const cell = 128;
    const w = base;
    const h = base;
    const mirror = this.animalSpriteMirrorForMotion(species, options && options.facingX);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, drawY);
    ctx.scale(mirror ? -1 : 1, 1);
    ctx.drawImage(image, (spriteIndex % 7) * cell, Math.floor(spriteIndex / 7) * cell, cell, cell, -w / 2, -h / 2, w, h);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    if (animal.id === "player_character") {
      ctx.strokeStyle = "rgba(240, 211, 118, 0.72)";
      ctx.lineWidth = 2 * Math.max(0.7, scale);
      ctx.beginPath();
      ctx.ellipse(x, drawY + h * 0.2, w * 0.42, h * 0.3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (showName) {
      const name = this.animalDisplayName(animal);
      const labelW = Math.max(34, Math.min(64, name.length * 12)) * scale;
      this.roundRect(ctx, x - labelW / 2, drawY + h * 0.36, labelW, 15 * scale, 6 * scale, "rgba(35, 58, 34, 0.52)");
      this.text(ctx, name, x, drawY + h * 0.36 + 11 * scale, 8 * scale, "#fff8df", "700", "center");
    }
    ctx.restore();
    return true;
  }

  animalSpriteFacesRight(species) {
    // The atlas contains hand-painted side views with mixed native directions.
    // Keep that source orientation explicit so map motion can always face the
    // actual travel direction instead of making an animal moonwalk backwards.
    return ["鹿", "羚羊", "乌鸦", "斑马", "野猪", "秃鹫", "水貂"].indexOf(species) >= 0;
  }

  animalSpriteMirrorForMotion(species, facingX) {
    if (!Number.isFinite(Number(facingX)) || Math.abs(Number(facingX)) < 0.000001) return false;
    const wantsRight = Number(facingX) > 0;
    return this.animalSpriteFacesRight(species) !== wantsRight;
  }

  normalizeAnimalMapSpecies(species, animal = {}) {
    const aliases = {
      兔子: "野兔",
      短耳兔: "野兔",
      猎犬: "野犬",
      犬: "野犬",
      狗: "野犬",
      非洲野犬: "野犬",
      花豹: "豹子",
      豹: "豹子",
      长颈鹿鹿: "长颈鹿"
    };
    const raw = String(species || "").trim();
    if (aliases[raw]) return aliases[raw];
    if (this.animalMapSpriteIndexRaw(raw) >= 0) return raw;
    const identity = `${animal.name || ""}${animal.shortName || ""}${animal.id || ""}`;
    if (/砾灰|猎犬|野犬|hound|dog/i.test(identity)) return "野犬";
    if (/野兔|短耳兔|兔/.test(identity)) return "野兔";
    if (/花豹|豹子|豹/.test(identity)) return "豹子";
    return raw;
  }

  animalMapSpriteIndex(species) {
    const normalized = this.normalizeAnimalMapSpecies(species);
    return this.animalMapSpriteIndexRaw(normalized);
  }

  animalMapSpriteIndexRaw(species) {
    const order = [
      "鹿", "羚羊", "野兔", "乌鸦", "狼", "斑马", "野猪",
      "鹰", "火烈鸟", "熊", "秃鹫", "狮子", "豹子", "长颈鹿",
      "猫头鹰", "大象", "河马", "鳄鱼", "野犬", "水貂", "狐狸"
    ];
    return order.indexOf(species || "");
  }

  animalVisualSize(species) {
    const map = {
      鹿: 52,
      羚羊: 42,
      野兔: 36,
      乌鸦: 38,
      狼: 50,
      斑马: 52,
      野猪: 52,
      鹰: 42,
      火烈鸟: 48,
      熊: 62,
      秃鹫: 44,
      狮子: 60,
      豹子: 50,
      长颈鹿: 72,
      猫头鹰: 40,
      大象: 72,
      河马: 66,
      鳄鱼: 60,
      野犬: 46,
      水貂: 40,
      狐狸: 44
    };
    return map[species] || 42;
  }

  speciesGlyph(species) {
    const map = { 狼: "狼", 鹿: "鹿", 狐狸: "狐", 熊: "熊", 兔子: "兔", 猫头鹰: "枭", 乌鸦: "鸦", 刺猬: "刺", 水貂: "貂", 貉: "貉", 狮子: "狮", 豹子: "豹", 鳄鱼: "鳄", 野犬: "犬", 斑马: "斑", 羚羊: "羚", 长颈鹿: "长", 大象: "象" };
    return map[species] || String(species || "?").slice(0, 1);
  }

  intentIcon(type) {
    const map = {
      hunt: "claw",
      patrol: "trail",
      listen: "eye",
      intel: "eye",
      contact: "signal",
      scout: "eye",
      move: "trail",
      hide: "leaf",
      drink: "water",
      guard: "claw",
      rest: "moon",
      forage: "berry"
    };
    return map[type] || "leaf";
  }

  relationValue(target, key) {
    return (target.relation && typeof target.relation[key] === "number") ? target.relation[key] : 40;
  }

  animalTrustTier(target) {
    const relation = (target && target.relation) || {};
    const value = this.relationValue(target || {}, "trust");
    if (relation.trustTitle) {
      return {
        id: relation.trustTier || "watching",
        title: relation.trustTitle,
        progress: Math.max(0, Math.min(1, relation.trustProgress || 0)),
        next: relation.trustNext || 100
      };
    }
    if (value >= 88) return { id: "soulmate", title: "托付", progress: 1, next: 100 };
    if (value >= 74) return { id: "trusted", title: "信任", progress: (value - 74) / 14, next: 88 };
    if (value >= 58) return { id: "familiar", title: "熟悉", progress: (value - 58) / 16, next: 74 };
    if (value >= 42) return { id: "watching", title: "观望", progress: (value - 42) / 16, next: 58 };
    return { id: "wary", title: "戒备", progress: value / 42, next: 42 };
  }

  reserveProgression(reserve) {
    return reserveProgressionFor(reserve || {});
  }

  drawGroundMapMarker(ctx, marker = {}, x, y, scale = 1) {
    const kind = marker.kind || marker.type || "question";
    const intensity = Math.max(1, marker.intensity || 1);
    const s = Math.max(.72, Math.min(1.48, scale));
    const icon = this.mapMarkerVisualIcon(marker);
    if (!this.renderedMapGroundMarkers) this.renderedMapGroundMarkers = [];
    ctx.save();
    if (marker.focused) {
      const pulse = 1 + (Math.sin(this.animT() * .008) + 1) * .12;
      ctx.strokeStyle = "rgba(196,91,66,.72)";
      ctx.lineWidth = Math.max(2, 2.4 * s);
      ctx.beginPath();
      ctx.arc(x, y - 18 * s, 24 * s * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(28,45,32,.22)";
    ctx.beginPath();
    ctx.ellipse(x, y + 5 * s, 17 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = kind === "recovery" ? "rgba(78,121,78,.72)" : kind === "exclamation" ? "rgba(177,83,70,.72)" : "rgba(116,101,67,.66)";
    ctx.lineWidth = Math.max(2, 2.2 * s);
    ctx.beginPath();
    ctx.moveTo(x, y + 3 * s);
    ctx.lineTo(x, y - 10 * s);
    ctx.stroke();
    const painted = this.drawUiIconBadge(ctx, icon, x, y - 18 * s, 34 * s, 29 * s, kind === "recovery", .96);
    if (!painted) {
      this.roundRect(ctx, x - 16 * s, y - 34 * s, 32 * s, 32 * s, 11 * s, kind === "recovery" ? "#edf3df" : "#fff4dc", "rgba(55,75,58,.42)");
      this.drawSmallGlyph(ctx, icon, x, y - 18 * s, kind === "exclamation" ? UI_THEME.danger : UI_THEME.forest700, .82 * s);
    }
    // A bare icon looked like an unexplained pickup. Map event points are one
    // of the game's three action channels, so keep the point but always show a
    // compact purpose label and interaction chevron.
    const rawLabel = marker.label || marker.recommendLabel || marker.title || "查看任务";
    const shortLabel = this.truncateTextToWidth(ctx, String(rawLabel).replace(/^[^：:]{1,8}[：:]/, ""), 82 * s, 10 * s, "700");
    ctx.font = `700 ${10 * s}px sans-serif`;
    const labelW = Math.max(50 * s, Math.min(100 * s, ctx.measureText(shortLabel).width + 28 * s));
    const labelY = y + 10 * s;
    this.roundRect(ctx, x - labelW / 2, labelY, labelW, 22 * s, 10 * s, "rgba(255,253,242,.96)", kind === "exclamation" ? "rgba(196,91,66,.58)" : "rgba(38,105,78,.42)");
    this.text(ctx, shortLabel, x - labelW / 2 + 9 * s, labelY + 15 * s, 10 * s, "#23473c", "700");
    this.text(ctx, "›", x + labelW / 2 - 9 * s, labelY + 16 * s, 14 * s, kind === "exclamation" ? "#c85142" : "#28795e", "700", "center");
    ctx.restore();
    const hitRect = {
      x: x - labelW / 2 - 4 * s,
      y: y - 38 * s,
      w: labelW + 8 * s,
      h: 74 * s
    };
    const renderedMarker = {
      id: marker.id,
      kind,
      icon,
      x,
      y,
      style: "field-event-icon",
      backingPlate: true,
      concreteIcon: true,
      label: shortLabel,
      labelVisible: true,
      actionAffordance: true,
      focused: !!marker.focused,
      hitSize: Math.max(52, 64 * scale),
      hitRect
    };
    this.renderedMapGroundMarkers.push(renderedMarker);
    return renderedMarker;
  }

  mapMarkerVisualIcon(marker = {}) {
    const identity = `${marker.id || ""} ${marker.title || ""} ${marker.label || ""}`;
    if (/病|disease/i.test(identity)) return "disease";
    if (/偷猎|脚印|安全|poacher/i.test(identity)) return "antiPoacher";
    if (/水|湖|河|water/i.test(identity)) return "water";
    if (/草|栖息|恢复|grass|recovery/i.test(identity)) return "habitat";
    if (/迁移|回流|migration/i.test(identity)) return "migration";
    if (/经营|基金|business|fund/i.test(identity)) return "fund";
    const actionIcons = { houndScout: "houndScout", antiPoacher: "antiPoacher", habitat: "habitat", intervention: "intervention", salvage: "salvage" };
    return actionIcons[marker.recommendAction] || "signal";
  }

  drawLargeIcon(ctx, kind, x, y, color, size = 72) {
    const iconSize = Math.max(24, Math.min(58, size - 10));
    if (this.drawUiIconBadge(ctx, kind, x, y, iconSize + 10, iconSize, false)) return;
    if (this.drawAtlasIcon(ctx, kind, x, y, size)) return;
    const scale = size / 72;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3 * scale;
    if (kind === "water") {
      ctx.beginPath();
      ctx.moveTo(x, y - 26 * scale);
      ctx.bezierCurveTo(x + 24 * scale, y + 2 * scale, x + 12 * scale, y + 28 * scale, x, y + 28 * scale);
      ctx.bezierCurveTo(x - 12 * scale, y + 28 * scale, x - 24 * scale, y + 2 * scale, x, y - 26 * scale);
      ctx.fill();
    } else if (kind === "claw") {
      [-16, 0, 16].forEach((dx) => {
        ctx.beginPath();
        ctx.moveTo(x + dx * scale, y - 22 * scale);
        ctx.lineTo(x + (dx - 8) * scale, y + 20 * scale);
        ctx.stroke();
      });
    } else if (kind === "eye") {
      ctx.beginPath();
      ctx.ellipse(x, y, 30 * scale, 16 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 7 * scale, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "signal") {
      [12, 22, 32].forEach((r) => {
        ctx.beginPath();
        ctx.arc(x, y + 16 * scale, r * scale, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.arc(x, y + 16 * scale, 4 * scale, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(x, y, 18 * scale, 30 * scale, 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#1f352b";
      ctx.beginPath();
      ctx.moveTo(x - 14 * scale, y + 18 * scale);
      ctx.lineTo(x + 15 * scale, y - 20 * scale);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawActionTileIcon(ctx, kind, x, y, color, active = false, size = 46) {
    ctx.save();
    ctx.shadowColor = active ? "rgba(240, 211, 118, 0.28)" : "rgba(36, 64, 46, 0.16)";
    ctx.shadowBlur = active ? 10 : 5;
    ctx.shadowOffsetY = 2;
    const iconSize = Math.max(22, Math.min(58, size));
    const badgeSize = iconSize >= 44 ? iconSize + 10 : iconSize;
    const drew = iconSize >= 36
      ? (this.drawUiIconBadge(ctx, kind, x, y, badgeSize, iconSize, active) || this.drawAtlasIcon(ctx, kind, x, y, iconSize))
      : (this.drawUiIcon(ctx, kind, x, y, iconSize, active) || this.drawAtlasIcon(ctx, kind, x, y, iconSize));
    ctx.restore();
    if (drew) return;
    this.roundRect(ctx, x - iconSize * 0.48, y - iconSize * 0.34, iconSize * 0.96, iconSize * 0.68, iconSize * 0.34, active ? "rgba(240, 211, 118, 0.14)" : "#f3eddd", "rgba(36, 64, 46, 0.08)");
    this.drawSmallGlyph(ctx, kind, x, y, active ? "#f0d376" : color, Math.max(1, iconSize / 28));
  }

  drawSectionMarker(ctx, x, y, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.26;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawSmallGlyph(ctx, kind, x, y, color, scale = 1) {
    const iconSize = Math.max(14, Math.min(26, 18 * scale));
    if (this.drawUiIcon(ctx, kind, x, y, iconSize, false)) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.6 * scale;
    if (kind === "question") {
      this.text(ctx, "?", x, y + 6 * scale, 17 * scale, color, "700", "center");
    } else if (kind === "exclamation") {
      this.text(ctx, "!", x, y + 6 * scale, 18 * scale, color, "700", "center");
    } else if (kind === "recovery") {
      this.text(ctx, "✓", x, y + 5 * scale, 15 * scale, color, "700", "center");
    } else if (kind === "water") {
      ctx.beginPath();
      ctx.arc(x, y + 2 * scale, 5 * scale, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "claw") {
      ctx.beginPath();
      ctx.moveTo(x - 5 * scale, y - 5 * scale);
      ctx.lineTo(x - 8 * scale, y + 6 * scale);
      ctx.moveTo(x, y - 6 * scale);
      ctx.lineTo(x, y + 7 * scale);
      ctx.moveTo(x + 5 * scale, y - 5 * scale);
      ctx.lineTo(x + 8 * scale, y + 6 * scale);
      ctx.stroke();
    } else if (kind === "eye") {
      ctx.beginPath();
      ctx.ellipse(x, y, 8 * scale, 5 * scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 2 * scale, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === "signal") {
      ctx.beginPath();
      ctx.arc(x, y + 5 * scale, 5 * scale, Math.PI * 1.15, Math.PI * 1.85);
      ctx.arc(x, y + 5 * scale, 10 * scale, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(x, y, 5 * scale, 8 * scale, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  findRegion(regionId) {
    return (this.state.world.regions || []).find((region) => region.id === regionId);
  }

  drawBottomNav() {
    if (this.screen === "choose" || !this.state.character) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    const navH = this.navHeight();
    const y = this.height - navH;
    // iOS tab bars are quiet and translucent: selection is expressed through
    // tint and type, not a second raised card competing with the content.
    this.roundRect(ctx, 0, y, this.width, navH, 0, "rgba(251,253,250,.96)", UI_THEME.separator);
    ctx.fillStyle = "rgba(60,60,67,.12)";
    ctx.fillRect(0, y, this.width, 1);
    const nav = [
      ["home", "沙盘", "nav_sandbox"],
      ["animalworld", "种群", "eye"],
      ["collection", "发现", "reserve_prosperity"],
      ["role", "物资", "nav_materials"]
    ];
    const w = this.width / nav.length;
    nav.forEach((item, i) => {
      const active = this.screen === item[0];
      const cx = i * w + w / 2;
      if (active) {
        this.roundRect(ctx, cx - 21, y + 6, 42, 29, 14, "rgba(47,125,98,.10)");
      }
      const iconAlpha = active ? 1 : .58;
      this.drawUiIcon(ctx, item[2], cx, y + 20, 24, false, iconAlpha)
        || this.drawSmallGlyph(ctx, item[2], cx, y + 20, active ? UI_THEME.tint : UI_THEME.muted, 0.92);
      this.text(ctx, item[1], cx, y + 50, 12, active ? UI_THEME.tint : UI_THEME.muted, active ? "700" : "600", "center");
      this.addHit(i * w, y, w, navH, () => {
        this.setScreen(item[0]);
      });
    });
    ctx.restore();
  }
  reserveSnapshot(reserve) {
    const base = reserve || {};
    const supplies = base.supplies || {};
    const inventory = base.inventory || {};
    const leagueBase = base.base || {};
    const ecology = base.ecology || {};
    return {
      fund: base.fund || 0,
      actionPoints: base.actionPoints || 0,
      intel: base.intel || 0,
      fieldPermits: base.fieldPermits || leagueBase.raidTickets || 0,
      safety: base.safety || base.stability || 0,
      stability: base.stability || 0,
      ecologyScore: base.ecologyScore || 0,
      business: base.business || 0,
      poacherPressure: base.poacherPressure || 0,
      shield: leagueBase.shield || 0,
      rating: leagueBase.rating || 0,
      migration: Object.assign({ delta: 0, reason: "" }, base.migration || {}),
      guardianRun: Object.assign({
        completedDays: 0,
        length: 7,
        score: 0,
        lastGrade: "C",
        lastSummary: ""
      }, base.guardianRun || {}),
      houndTeam: Object.assign({
        level: 1,
        xp: 0,
        nextXp: 40,
        totalRuns: 0,
        tracking: 48,
        pursuit: 45,
        guard: 42,
        stamina: 86,
        cohesion: 52,
        lastReward: "猎犬队待命。",
        title: "新晋猎犬队"
      }, base.houndTeam || {}),
      hounds: (base.hounds || []).map((hound) => Object.assign({}, hound)),
      progression: Object.assign({
        level: 1,
        title: "临时营地",
        score: 0,
        progress: 0,
        nextScore: 50,
        nextTitle: "稳定保护站"
      }, base.progression || {}),
      eventChain: JSON.parse(JSON.stringify(base.eventChain || {})),
      emergency: JSON.parse(JSON.stringify(base.emergency || {})),
      seasonState: JSON.parse(JSON.stringify(base.seasonState || {})),
      social: Object.assign({}, base.social || {}),
      ecology: {
        water: ecology.water || 0,
        grass: ecology.grass || 0,
        disease: ecology.disease || 0,
        predators: Object.assign({}, ecology.predators || {}),
        herbivores: Object.assign({}, ecology.herbivores || {}),
        birds: Object.assign({}, ecology.birds || {})
      },
      supplies: {
        dogFood: supplies.dogFood || 0,
        tranquilizer: supplies.tranquilizer || 0,
        alarm: supplies.alarm || 0,
        fieldKit: supplies.fieldKit || 0,
        medicalKit: supplies.medicalKit || 0
      },
      inventory: {
        shedAntlerA: inventory.shedAntlerA || 0,
        shedAntlerB: inventory.shedAntlerB || 0,
        naturalHide: inventory.naturalHide || 0,
        researchSample: inventory.researchSample || 0,
        recoveredTrap: inventory.recoveredTrap || 0
      },
      pendingRecovered: Object.assign({}, base.pendingRecovered || {}),
      ecologyEconomy: JSON.parse(JSON.stringify(normalizeEcologyEconomy(base.ecologyEconomy, base))),
      lastMaterialExploration: base.lastMaterialExploration ? JSON.parse(JSON.stringify(base.lastMaterialExploration)) : null,
      mysteryEvidence: normalizeMysteryEvidence(base.mysteryEvidence),
      strategy: normalizeStrategyState(base.strategy),
      market: Object.assign({}, base.market || {})
    };
  }

  buildGuardianEcho(beforeWorld, afterWorld, command, visual = {}) {
    const beforeReserve = (beforeWorld && beforeWorld.reserve) || {};
    const afterReserve = (afterWorld && afterWorld.reserve) || {};
    const actionId = this.reserveActionIdFromCommand(command);
    const preferredSpecies = {
      antiPoacher: ["鹿", "乌鸦"],
      habitat: ["水貂", "鹿", "河马"],
      houndScout: ["乌鸦", "狼", "鹿"],
      intervention: ["鹿", "狼", "羚羊"],
      exploreMaterials: ["鹿", "乌鸦", "野兔", "羚羊"],
      salvage: ["鹿", "乌鸦"],
      buySupplies: ["猎犬"]
    }[actionId] || ["鹿", "乌鸦"];
    const afterAnimals = (afterWorld && afterWorld.knownCharacters) || [];
    const beforeAnimals = (beforeWorld && beforeWorld.knownCharacters) || [];
    const relationshipChange = visual.relationshipChange || null;
    let actor = null;
    let kind = "animal";
    if (relationshipChange) {
      actor = { id: relationshipChange.individualId, name: relationshipChange.name, shortName: relationshipChange.name, species: relationshipChange.species };
      kind = "named";
    } else if (actionId === "buySupplies") {
      const hound = ((afterReserve.hounds || [])[0]) || {};
      actor = { id: hound.id || "hound_echo", name: hound.name || "砾灰", shortName: hound.name || "砾灰", species: "猎犬" };
      kind = "hound";
    } else {
      actor = preferredSpecies.map((species) => afterAnimals.find((animal) => animal.species === species)).find(Boolean) || afterAnimals[0] || { id: "forest", name: "森林居民", species: "动物" };
    }
    const beforeActor = beforeAnimals.find((animal) => animal.id === actor.id || (animal.species === actor.species && animal.name === actor.name));
    const beforeTrust = relationshipChange ? relationshipChange.before.security : kind === "hound" ? ((beforeReserve.houndTeam || {}).cohesion || 0) : this.relationValue(beforeActor || actor, "trust");
    const afterTrust = relationshipChange ? relationshipChange.after.security : kind === "hound" ? ((afterReserve.houndTeam || {}).cohesion || beforeTrust) : this.relationValue(actor, "trust");
    const beforeTier = relationshipChange ? { title: beforeTrust >= 75 ? "安心" : beforeTrust >= 55 ? "熟悉" : "观察" } : kind === "hound" ? { title: beforeTrust >= 74 ? "默契" : "相伴" } : this.animalTrustTier(beforeActor || actor);
    const afterTier = relationshipChange ? { title: afterTrust >= 75 ? "安心" : afterTrust >= 55 ? "熟悉" : "观察" } : kind === "hound" ? { title: afterTrust >= 74 ? "默契" : "相伴" } : this.animalTrustTier(actor);
    const milestone = afterTrust > beforeTrust && beforeTier.title !== afterTier.title;
    const day = (afterWorld && afterWorld.day) || 1;
    const actorName = kind === "hound" ? (actor.name || "猎犬队") : this.animalDisplayName(actor);
    const poacherDelta = (afterReserve.poacherPressure || 0) - (beforeReserve.poacherPressure || 0);
    const waterDelta = (((afterReserve.ecology || {}).water) || 0) - (((beforeReserve.ecology || {}).water) || 0);
    const migrationDelta = ((afterReserve.migration || {}).delta) || 0;
    const templates = {
      antiPoacher: {
        title: poacherDelta < 0 ? `${actorName}今晚敢睡得更沉了` : `${actorName}知道你来过边界`,
        quote: poacherDelta < 0 ? "“今晚我会让幼崽靠近水边一点。你的脚步，和坏脚印不一样。”" : "“边界还没安静，但至少这次不是我们独自躲。”"
      },
      habitat: {
        title: waterDelta > 0 ? `${actorName}第一个听见水回来了` : `${actorName}看见你在修补栖息地`,
        quote: "“水重新流过浅滩时，我第一个听见了。谢谢你没有催我们回来。”"
      },
      houndScout: {
        title: `${actorName}开始认得你的巡护路线`,
        quote: "“猎犬先替我们闻过路，我们才敢用脚投票。下一次，我会少绕一段。”"
      },
      intervention: {
        title: `${actorName}记住了你的克制`,
        quote: "“你没有把我们当数字搬动。你停下来看了很久——这件事我记住了。”"
      },
      exploreMaterials: {
        title: `${actorName}愿意把隐蔽路线告诉你`,
        quote: "“我带你去的地方，不是因为你找得快，而是因为我开始相信你不会掠夺。”"
      },
      salvage: {
        title: `${actorName}分得清回收与掠夺`,
        quote: "“你带走的是自然留下的东西，不是从我们身上夺走的。森林分得清。”"
      },
      buySupplies: {
        title: `${actorName}把补给声当成回家的声音`,
        quote: "“补给袋打开的声音，已经像回家的声音。明天我还愿意陪你巡线。”"
      }
    };
    const chosen = templates[actionId] || {
      title: `${actorName}记住了你今天的选择`,
      quote: "“森林不会立刻回答，但它会把每一次克制和坚持都留下来。”"
    };
    const patrolOperation = visual.patrolOperation || null;
    const witnessedQuote = patrolOperation && patrolOperation.steps && patrolOperation.steps.length === 2
      ? `${chosen.quote.replace(/”$/, "")} 我看见你先去${patrolOperation.steps[0].label}，再去${patrolOperation.steps[1].label}。”`
      : chosen.quote;
    const actionLabel = actionId === "exploreMaterials" ? "动物引路探索" : ((this.reserveActionOptions().find((item) => item.id === actionId) || {}).label || "这次行动");
    const impactParts = [];
    if (patrolOperation) impactParts.push(`路线 ${patrolOperation.summary}`);
    if (relationshipChange) {
      impactParts.push(`安全感 ${relationshipChange.before.security}→${relationshipChange.after.security} · 野性 ${relationshipChange.before.wildness}→${relationshipChange.after.wildness}`);
    } else if (afterTrust !== beforeTrust) impactParts.push(`${kind === "hound" ? "默契" : "熟悉"} ${beforeTrust}→${afterTrust}`);
    if (poacherDelta) impactParts.push(`偷猎 ${this.signed(poacherDelta)}`);
    if (waterDelta) impactParts.push(`水源 ${this.signed(waterDelta)}`);
    if (migrationDelta) impactParts.push(`迁移 ${this.signed(migrationDelta)}`);
    return {
      id: `echo_${day}_${actionId}_${actor.id || actor.species}`,
      day,
      actionId,
      actionLabel,
      actor: { id: actor.id, name: actor.name, shortName: actor.shortName, species: actor.species },
      actorName,
      kind,
      title: chosen.title,
      quote: witnessedQuote,
      body: `第${day}日，${actorName}把“${actionLabel}”写进了关于你的记忆。${patrolOperation ? `它也记住了你选择的顺序：${patrolOperation.summary}。` : ""}`,
      impact: impactParts.slice(0, 2).join(" · ") || `守护分 ${((afterReserve.guardianRun || {}).score) || 0}`,
      trustBefore: beforeTrust,
      trustAfter: afterTrust,
      wildnessBefore: relationshipChange ? relationshipChange.before.wildness : null,
      wildnessAfter: relationshipChange ? relationshipChange.after.wildness : null,
      relationshipReason: relationshipChange ? relationshipChange.reason : "",
      tier: afterTier.title,
      milestone
    };
  }

  buildPatrolSettlement(before, after, result, command) {
    const privateReport = (result.reports || []).find((report) => report.type === "private") || {};
    const visual = result.visual || privateReport.visual || {};
    const guardianCycleResult = visual.guardianCycle || null;
    const guardianNight = guardianCycleResult && guardianCycleResult.night;
    const card = visual.eventCard || {};
    const emotionalEcho = visual.guardianEcho || null;
    const emotionEvent = visual.emotionEvent || null;
    const target = (this.state.world.knownCharacters || []).find((animal) => animal.id === this.speakingAnimalId) || (this.state.world.knownCharacters || [])[0];
    const speaker = (emotionalEcho && emotionalEcho.actor) || target || { name: "晨角", species: "鹿" };
    const migrationDelta = (after.migration && after.migration.delta) || 0;
    const run = after.guardianRun || {};
    const beforeRun = before.guardianRun || {};
    const progression = this.reserveProgression(after);
    const beforeProgression = this.reserveProgression(before);
    const eventChain = after.eventChain || (visual && visual.eventChain) || {};
    const goalResult = visual.goalResult || null;
    const importantGoalCompletion = !!(goalResult && (goalResult.completions || []).some((item) => ["daily_core", "daily_full", "stage_complete", "long_term"].includes(item.type)));
    const goalDone = !!(visual.dailyGoalDone || importantGoalCompletion);
    const scoreDelta = (run.score || 0) - (beforeRun.score || 0);
    const reaction = this.animalReactionToPatrol(speaker, command, before, after, result);
    const houndGrowth = visual.houndGrowth || {};
    const variableReward = visual.variableReward || {};
    const patrolOperation = visual.patrolOperation || null;
    const waterAfter = (after.ecology && after.ecology.water) || 0;
    const waterBefore = (before.ecology && before.ecology.water) || 0;
    const reserveView = visual.reserveView || (result.world && result.world.reserveView) || after.reserveView || null;
    const causality = reserveView && reserveView.settlement ? reserveView.settlement : null;
    const actionId = this.reserveActionIdFromCommand(command);
    const storyEligible = ["houndScout", "antiPoacher", "habitat", "intervention", "exploreMaterials"].includes(actionId);
    const patrolStory = storyEligible ? this.patrolNarrativeStory(before, after, actionId, speaker, result) : null;
    const neighborComparison = storyEligible ? this.neighborSafetyComparison(after) : null;
    const emotionBreakthrough = emotionEvent && emotionEvent.isMajor ? {
      kind: `emotion_${emotionEvent.type}`,
      kicker: emotionEvent.type === "rare" ? "罕见时刻" : emotionEvent.type === "return" ? "朋友归来" : emotionEvent.type === "birth" ? "新生命" : "生命纪念",
      title: emotionEvent.title,
      body: emotionEvent.body
    } : null;
    const mysteryRecovery = visual.mysteryRecovery || null;
    const collectionLead = visual.collectionLead || null;
    const storyDiscovery = visual.storyDiscovery || null;
    const storyDiscoveryItem = visual.storyDiscoveryItem || null;
    const storyDiscoveryAdvanced = !!visual.storyDiscoveryAdvanced;
    const animalEconomy = visual.animalEconomy || null;
    const scarceDrop = animalEconomy && (animalEconomy.produced || []).find((drop) => drop.type === "forestGift");
    const ecologyBreakthrough = scarceDrop ? {
      kind: "scarce_fragment",
      kicker: "稀有产出",
      title: `${scarceDrop.animalName || "动物伙伴"}留下森林赠礼`,
      body: "这是动物信任与生态稳定共同产生的稀有赠礼。它已出现在沙盘上，需要你亲手收取。"
    } : null;
    const competitionBreakthrough = animalEconomy && animalEconomy.competitionReward > 0 ? {
      kind: "regional_season_reward",
      kicker: "区域赛季结算",
      title: `同级组第 #${animalEconomy.rankAfter} 名`,
      body: `你的保护区获得 ${animalEconomy.competitionReward} 枚共护徽片。它只用于荣誉地标、设施外观和纪念分享卡。`
    } : null;
    const mysteryBreakthrough = mysteryRecovery ? {
      kind: "mystery_recovery",
      kicker: "超等级·神秘证物",
      title: `追回${mysteryRecovery.name}`,
      body: `${mysteryRecovery.story} 已永久封存；联合执法拨款 +${mysteryRecovery.fundReward}。`
    } : null;
    const breakthrough = mysteryBreakthrough || competitionBreakthrough || ecologyBreakthrough || this.detectReserveBreakthrough(before, after) || emotionBreakthrough || (emotionalEcho && emotionalEcho.milestone ? {
      kind: "relationship",
      kicker: "关系突破",
      title: `${emotionalEcho.actorName}开始真正${emotionalEcho.tier}你`,
      body: `${emotionalEcho.quote} ${emotionalEcho.impact}`
    } : null);
    const salvageSale = visual.salvageEconomy || null;
    const recoveredGoodsGain = visual.recoveredGoodsGain || null;
    const materialExploration = visual.materialExploration || null;
    const facilityOperational = visual.facilityOperational || null;
    const guardianPromiseEffect = visual.guardianPromiseEffect || null;
    const saleLabels = { shedAntlerA: "A级鹿角", shedAntlerB: "B级鹿角", naturalHide: "自然生命档案", researchSample: "研究样本", recoveredTrap: "陷阱证据" };
    const soldCounts = {};
    (salvageSale && salvageSale.sold || []).forEach((key) => { soldCounts[key] = (soldCounts[key] || 0) + 1; });
    const commerce = salvageSale && salvageSale.sold && salvageSale.sold.length ? {
      count: salvageSale.sold.length,
      counts: soldCounts,
      description: Object.keys(soldCounts).map((key) => `${saleLabels[key] || key}×${soldCounts[key]}`).join(" / "),
      baseValue: salvageSale.baseValue || 0,
      value: salvageSale.value || 0,
      fundingLabel: salvageSale.fundingLabel || "研究补助",
      levelFactor: salvageSale.ownLevelFactor || 1,
      neighborFactor: salvageSale.neighborFactor || 1,
      marketIndex: salvageSale.marketIndex || 1
    } : null;
    const settlementLines = this.settlementRewardLines(before, after, goalDone, migrationDelta, command, progression, beforeProgression, eventChain, variableReward, houndGrowth, visual.authorization, patrolOperation);
    // 结算固定保持“获得 / 消耗 / 明日”三行；目标奖励已进入基金差值或“目标奖励”标签，避免重复信息挤压剧情节奏。
    const rewardLines = settlementLines;
    return {
      day: (guardianCycleResult && guardianCycleResult.context && guardianCycleResult.context.day) || (result.world && result.world.day) || this.state.world.day,
      title: storyDiscoveryAdvanced && storyDiscoveryItem ? `现场发现 · ${storyDiscoveryItem.name}` : materialExploration ? (materialExploration.reward ? `探索发现 · ${materialExploration.reward.label} ×${materialExploration.reward.amount}` : "探索结束 · 未发现物资") : breakthrough ? breakthrough.title : commerce ? `样本移交完成 · ${commerce.fundingLabel} +${commerce.value}` : recoveredGoodsGain ? `回收完成 · ${recoveredGoodsGain.items.map((item) => `${item.label} ×${item.amount}`).join("、")}` : guardianNight ? `第${guardianNight.day}日守护结束` : (patrolStory ? patrolStory.headline : card.title || privateReport.title || "巡护完成"),
      summary: storyDiscoveryAdvanced && storyDiscoveryItem ? `${storyDiscovery.locationText || "动物的迹象与这次守护行动吻合。"} 具体物件已经出现在沙盘，请回去亲手收录。` : materialExploration ? `${materialExploration.summary} 六面骰${materialExploration.roll} + 等级修正${materialExploration.levelContribution} + 关系修正${materialExploration.relationshipContribution} = 探索总点数${materialExploration.qualityScore}。` : breakthrough ? breakthrough.body : commerce ? `${commerce.description}已移交；拨款基准 ${commerce.baseValue}，获得${commerce.fundingLabel} ${commerce.value}。` : recoveredGoodsGain ? `${recoveredGoodsGain.items.map((item) => `${item.label} +${item.amount}`).join("、")}，已进入物资页的待收取区。` : guardianNight ? `${guardianNight.mapChange}。${guardianNight.animalResponse}` : ((causality && causality.statLine) || this.settlementImpactLine(before, after, card.body || privateReport.body || `你执行了：“${command}”。保护区已经完成一轮生态结算。`)),
      location: visual.location || (this.state.character && this.state.character.location) || "保护区",
      weather: (result.world && result.world.weather) || this.state.world.weather || "未知",
      actionIcon: visual.icon || "trail",
      grade: run.lastGrade || "C",
      guardianScore: run.score || 0,
      scoreDelta,
      fundBefore: before.fund || 0,
      fundAfter: after.fund || 0,
      guardianRun: run,
      progression,
      beforeProgression,
      eventChain,
      goalDone,
      goalResult,
      houndGrowth,
      variableReward,
      breakthrough,
      commerce,
      recoveredGoodsGain,
      materialExploration,
      patrolOperation,
      facilityOperational,
      guardianPromiseEffect,
      mysteryRecovery,
      collectionLead,
      storyDiscovery,
      storyDiscoveryItem,
      storyDiscoveryAdvanced,
      animalEconomy,
      guardianCycle: guardianCycleResult,
      guardianNight,
      strategyRhythm: visual.strategyRhythm || null,
      strategicDilemma: visual.strategicDilemma || null,
      emotionalEcho,
      emotionEvent,
      chapterTransition: progression.level > beforeProgression.level ? {
        from: beforeProgression.level,
        to: progression.level,
        summary: {
          population: this.reserveSpeciesTotal(before),
          daysManaged: beforeProgression.daysManaged || 0
        }
      } : null,
      finalChapterEnding: progression.level === 5 && beforeProgression.level === 5 && progression.chapterComplete && !beforeProgression.chapterComplete,
      causality,
      storyBeats: patrolStory ? patrolStory.beats : [],
      storyHeadline: patrolStory ? patrolStory.headline : "",
      neighborComparison,
      quickFeedback: visual.quickFeedback || "",
      stats: [
        { label: "保护基金", before: before.fund || 0, after: after.fund || 0, delta: (after.fund || 0) - (before.fund || 0) },
        { label: "水源", before: waterBefore, after: waterAfter, delta: waterAfter - waterBefore },
        { label: "草场", before: ((before.ecology || {}).grass) || 0, after: ((after.ecology || {}).grass) || 0, delta: (((after.ecology || {}).grass) || 0) - (((before.ecology || {}).grass) || 0) }
      ],
      materials: this.materialSettlementLines(before, after),
      rewards: rewardLines,
      nextHint: guardianNight ? guardianNight.tomorrow : this.reserveNextHint(after),
      speaker: this.animalDisplayName(speaker),
      speakerAnimal: emotionalEcho && emotionalEcho.kind === "hound" ? null : speaker,
      speakerBadge: (speaker.species || speaker.name || "兽").slice(0, 1),
      speech: (emotionalEcho && emotionalEcho.quote) || reaction || this.animalLiveMonologue(speaker, this.createAnimalDialogueContext(speaker), { liveTime: "巡护后" })
    };
  }

  reserveSpeciesTotal(reserve) {
    return Object.keys(SPECIES_DB).reduce((sum, speciesId) => sum + speciesPopulation(reserve || {}, speciesId), 0);
  }

  detectReserveBreakthrough(before, after) {
    const beforeOutcome = before && before.emergency && before.emergency.lastOutcome;
    const emergencyOutcome = after && after.emergency && after.emergency.lastOutcome;
    if (emergencyOutcome && (!beforeOutcome || beforeOutcome.id !== emergencyOutcome.id)) {
      const started = emergencyOutcome.kind === "started";
      const failed = emergencyOutcome.kind === "failed";
      return {
        kind: `emergency_${emergencyOutcome.kind}`,
        kicker: started ? "突发事件" : failed ? "事件失控" : "事件解除",
        title: emergencyOutcome.title,
        body: emergencyOutcome.body
      };
    }
    const beforeSeason = before && before.seasonState && before.seasonState.name;
    const afterSeason = after && after.seasonState && after.seasonState.name;
    if (beforeSeason && afterSeason && beforeSeason !== afterSeason) {
      return {
        kind: "season_change",
        kicker: "季节更替",
        title: `保护区进入${afterSeason}`,
        body: afterSeason === "旱季"
          ? "水源和草场将持续承压，动物向饮水点集中，偷猎风险同步上升。"
          : "水草恢复速度提高，但疾病和病虫害更容易集中爆发。"
      };
    }
    const beforeProgress = (before && before.progression) || {};
    const afterProgress = (after && after.progression) || {};
    if ((afterProgress.level || 1) > (beforeProgress.level || 1)) {
      const unlocked = Object.values(SPECIES_DB)
        .filter((sp) => sp.unlockLevel > (beforeProgress.level || 1) && sp.unlockLevel <= (afterProgress.level || 1))
        .map((sp) => sp.name);
      return {
        kind: "level_up",
        title: `保护区升至 Lv.${afterProgress.level} · ${afterProgress.title}`,
        body: unlocked.length
          ? `${unlocked.join("、")}正式迁入保护区，新的生态关系已经建立。`
          : "保护区跨过新的稳定线，更多生态能力已经开放。"
      };
    }
    const beforeObjectives = (beforeProgress.objectives || []).reduce((map, item) => {
      map[item.id] = item;
      return map;
    }, {});
    const newMilestone = (afterProgress.objectives || []).find((item) => item.optional && item.complete && !(beforeObjectives[item.id] && beforeObjectives[item.id].complete));
    if (newMilestone) {
      const descriptions = {
        population: "动物用迁移和繁衍投票，保护区的承载力跨过了新的数量线。",
        fundEarned: "持续经营已经形成稳定收入，不是一次随机奖励造成的短暂上涨。",
        migratedIn: "来自其他保护区的动物正在把这里写进迁移路线。",
        rareRecovered: "珍稀回收物已经进入保护区档案，它会成为这一章的重要记忆。"
      };
      return {
        kind: `chapter_milestone_${newMilestone.id}`,
        kicker: "章节里程碑",
        title: `${newMilestone.label}达到 ${newMilestone.target}${newMilestone.unit || ""}`,
        body: descriptions[newMilestone.id] || "一个新的章节目标已经完成。"
      };
    }
    const beforeChain = (before && before.eventChain) || {};
    const afterChain = (after && after.eventChain) || {};
    if (!beforeChain.completed && afterChain.completed) {
      return {
        kind: "guardian_complete",
        title: "本章事件线完成",
        body: "森林完成了这一章的阶段评议；接下来要继续完成时间、操作和里程碑指标。"
      };
    }
    const beforeRun = (before && before.guardianRun) || {};
    const afterRun = (after && after.guardianRun) || {};
    const highGrades = ["S", "A"];
    if (highGrades.includes(afterRun.lastGrade) && !highGrades.includes(beforeRun.lastGrade)) {
      return {
        kind: "high_grade",
        title: `首次达到 ${afterRun.lastGrade} 级守护评价`,
        body: `守护分达到 ${afterRun.score || 0}，水源、草场和行动执行首次同时越过高评价线。`
      };
    }
    if ((beforeRun.completedDays || 0) === 0 && (afterRun.completedDays || 0) === 1) {
      return {
        kind: "first_patrol",
        title: "首次有效巡护完成",
        body: "第一项行动完成：数量、风险、资源与关系已变化。"
      };
    }
    const beforeTotal = this.reserveSpeciesTotal(before);
    const afterTotal = this.reserveSpeciesTotal(after);
    const beforeMilestone = Math.floor(beforeTotal / 100);
    const afterMilestone = Math.floor(afterTotal / 100);
    if (afterMilestone > beforeMilestone && afterMilestone >= 2) {
      return {
        kind: "population",
        title: `动物总量突破 ${afterMilestone * 100} 只`,
        body: `保护区动物总量达到 ${afterTotal} 只，承载力与食物链将进入新的压力区间。`
      };
    }
    return null;
  }

  settlementImpactLine(before, after, fallback) {
    const safetyDelta = after.safety - before.safety;
    const poacherDelta = after.poacherPressure - before.poacherPressure;
    const migrationDelta = (after.migration && after.migration.delta) || 0;
    const text = String(fallback || "").split("\n")[0].trim();
    if (poacherDelta < -8) return `漂亮，偷猎压力被压下 ${Math.abs(poacherDelta)} 点。${migrationDelta > 0 ? `有 ${migrationDelta} 只动物愿意靠近保护区。` : "边界今晚会安静一点。"}`;
    if (safetyDelta > 4) return `保护区安全感上涨 ${safetyDelta} 点。动物会先用脚投票，明天看迁移线。`;
    if (migrationDelta > 0) return `迁移线带回 ${migrationDelta} 个脚步，动物愿意继续观察这片保护区。`;
    if (migrationDelta < 0) return `有 ${Math.abs(migrationDelta)} 只动物离开了边缘地带。不是崩盘，但明天要救安全线。`;
    if (after.fund > before.fund + 80) return `基金进账明显，但森林不只看账本，别让风险在边界攒起来。`;
    if (/^(基金|稳定|偷猎压力|安全|水源|迁移)[\s+\-0-9，,、。]/.test(text)) {
      return "本次行动已结算，关键变化看上方指数，奖励和消耗看下方。";
    }
    return text.slice(0, 72);
  }

  patrolNarrativeStory(before, after, actionId, speaker, result = {}) {
    const ecologyBefore = before.ecology || {};
    const ecologyAfter = after.ecology || {};
    const poacherDelta = (after.poacherPressure || 0) - (before.poacherPressure || 0);
    const waterDelta = (ecologyAfter.water || 0) - (ecologyBefore.water || 0);
    const grassDelta = (ecologyAfter.grass || 0) - (ecologyBefore.grass || 0);
    const migrationDelta = ((after.migration || {}).delta || 0) - ((before.migration || {}).delta || 0);
    const evidence = (((after.pendingRecovered || {}).recoveredTrap || 0) + ((after.inventory || {}).recoveredTrap || 0))
      - (((before.pendingRecovered || {}).recoveredTrap || 0) + ((before.inventory || {}).recoveredTrap || 0));
    let headline = "你完成了一次有效巡护";
    let discovery = "你看清了保护区今天真正发生的变化";
    if (actionId === "houndScout") {
      headline = evidence > 0 ? "你沿气味找到了陷阱证据" : "你沿气味排查了危险边界";
      discovery = evidence > 0 ? `你发现了 ${evidence} 处可追查的陷阱痕迹` : `你发现了偷猎路线最靠近水线的位置`;
    } else if (actionId === "antiPoacher") {
      headline = poacherDelta < 0 ? "你把偷猎者赶出了动物通道" : "你阻止了偷猎者继续靠近";
      discovery = `你阻止了边界压力继续扩散，危险${poacherDelta < 0 ? `下降 ${Math.abs(poacherDelta)} 点` : "被暂时压住"}`;
    } else if (actionId === "habitat") {
      headline = waterDelta >= grassDelta ? "你让断开的水路重新流动" : "你修复了动物依赖的栖息地";
      discovery = `你修复了水线与草场，水源${this.signed(waterDelta)}、草场${this.signed(grassDelta)}`;
    } else if (actionId === "intervention") {
      headline = "你让失衡的种群重新分散";
      discovery = `你调整了活动范围，迁徙${this.signed(migrationDelta)}`;
    } else if (actionId === "exploreMaterials") {
      headline = "你跟着动物走完了一条隐蔽路线";
      discovery = ((result.visual || {}).materialExploration || {}).reward
        ? `你发现了${result.visual.materialExploration.reward.label}`
        : "你排除了一条没有收获的路线";
    }
    const speakerName = this.animalDisplayName(speaker || {});
    const animalLine = this.animalReactionToPatrol(speaker, actionId, before, after, result);
    return {
      headline,
      beats: [
        `发现：${discovery}`,
        animalLine ? `回应：${speakerName}注意到了这次改变` : "回应：动物开始重新判断路线"
      ],
      animalLine
    };
  }

  neighborSafetyComparison(after = {}) {
    const rivals = this.leagueOpponents("world");
    if (!rivals.length) return null;
    const ownSafety = Math.max(0, Math.min(100, after.safety || 0));
    const rivalSafety = rivals.map((rival) => Math.max(0, Math.min(100, Number(rival.safety == null ? rival.shield : rival.safety) || 0)));
    const below = rivalSafety.filter((value) => ownSafety > value).length;
    const percentile = Math.max(1, Math.min(99, Math.round((below + .5) / rivals.length * 100)));
    const realCount = rivals.filter((rival) => !rival.simulated).length;
    const cohort = realCount >= 8 ? "邻区" : "同级保护区";
    return {
      percentile,
      cohort,
      simulated: realCount < 8,
      text: `你的保护区今天比 ${percentile}% 的${cohort}更安全`
    };
  }

  settlementRewardLines(before, after, goalDone, migrationDelta, command = "", progression = null, beforeProgression = null, eventChain = null, variableReward = null, houndGrowth = null, authorization = null, patrolOperation = null) {
    const lines = [];
    const fundDelta = after.fund - before.fund;
    const gains = [];
    const costs = [];
    const ecologyLedger = ((after.ecologyEconomy || {}).lastLedger) || null;
    if (patrolOperation && patrolOperation.summary) {
      const routeDeltas = (patrolOperation.changes || []).filter((item) => item.delta).slice(0, 2).map((item) => `${item.label}${this.signed(item.delta)}`).join(" / ");
      gains.unshift(`路线：${patrolOperation.summary}${routeDeltas ? ` · ${routeDeltas}` : ""}`);
    }
    if (ecologyLedger && ecologyLedger.produced && ecologyLedger.produced.length) {
      const rare = ecologyLedger.produced.some((drop) => drop.type === "coGuardShard");
      gains.push(`${rare ? "稀有" : "地图"}产出 +${ecologyLedger.produced.length}待收`);
    }
    if (ecologyLedger && ecologyLedger.competitionReward > 0) gains.push(`共护徽片 +${ecologyLedger.competitionReward}`);
    if (ecologyLedger && ecologyLedger.fundSpent > 0) costs.push(`动物养护 -${ecologyLedger.fundSpent}`);
    if (ecologyLedger && ecologyLedger.rankGain > 0) gains.push(`区域排名 ↑${ecologyLedger.rankGain}`);
    if (houndGrowth && houndGrowth.xpGain) {
      gains.push(houndGrowth.levelUp ? `猎犬队升到 Lv.${houndGrowth.level}` : `猎犬队 +${houndGrowth.xpGain}xp`);
    }
    if (variableReward && variableReward.label) {
      gains.push(`随机${variableReward.tier ? `·${variableReward.tier}` : ""} ${variableReward.label}`);
    }
    if (goalDone) gains.push("目标奖励");
    if (fundDelta > 0) gains.push(`基金 +${fundDelta}`);
    if (progression && beforeProgression && progression.level > beforeProgression.level) gains.unshift(`保护区升到 Lv.${progression.level}`);
    if (fundDelta < 0) costs.push(`基金 ${fundDelta}`);
    const materialGain = this.materialSettlementLines(before, after).filter((line) => !/无变化|无新增/.test(line));
    const actionId = this.reserveActionIdFromCommand(command);
    if (/dogFood|狗粮/.test(materialGain.join(" ")) || actionId === "houndScout") costs.push("狗粮消耗");
    if (actionId === "antiPoacher") costs.push("警报器消耗");
    if (actionId === "intervention") costs.push("麻醉弹消耗");
    const materialBenefit = materialGain.filter((line) => /^回收物/.test(line) || (/消耗\/补给/.test(line) && /\+\d/.test(line) && !/-\d/.test(line)));
    if (materialBenefit.length) gains.push(this.shortGameText(materialBenefit.join(" / "), 22));
    const chainText = eventChain && eventChain.current
      ? eventChain.advanced
        ? `剧情推进 ${eventChain.step || 0}/${eventChain.length || 7}：${eventChain.current.title}。`
        : `剧情暂歇：${eventChain.waitingText || "等待数据条件。"}`
      : "";
    const social = after.social || {};
    const socialText = social.log ? `社交：${this.shortGameText(social.title || social.log, 18)}。` : "";
    lines.push(`获得：${gains.length ? gains.slice(0, 4).join(" / ") : "森林保持稳定，没有坏消息就是好消息"}`);
    lines.push(`消耗：${costs.length ? costs.slice(0, 3).join(" / ") : "无明显物资消耗"}`);
    const authorizationText = authorization && authorization.reason ? `授权：${authorization.reason}` : "";
    lines.push(`明日：${authorizationText}${authorizationText ? " " : ""}${chainText}${socialText}${this.reserveNextHint(after).replace(/^明日建议[:：]/, "").trim()}`);
    return lines.slice(0, 3);
  }

  reserveActionIdFromCommand(command = "") {
    const text = String(command || "");
    if (/探索回收物|物资探索|探索森林|跟随动物探索|寻找自然遗留/.test(text)) return "exploreMaterials";
    if (/抢回回收物|追回回收物|共享回收点|回收物搜寻/.test(text)) return "houndScout";
    if (/驱赶偷猎|偷猎者|警报器/.test(text)) return "antiPoacher";
    if (/猎犬侦察|搜寻陷阱|陌生气味/.test(text)) return "houndScout";
    if (/修复水源|草场|栖息地/.test(text)) return "habitat";
    if (/出售|卖出|变现|移交|提交|项目拨款|研究补助|专项拨款|收益|鹿角|样本|回收/.test(text)) return "salvage";
    if (/生态干预|麻醉|转移|控制数量/.test(text)) return "intervention";
    if (/购买|买|采购|补给|狗粮|麻醉弹|警报器|医疗包|护理包/.test(text)) return "buySupplies";
    return this.selectedReserveAction || "houndScout";
  }

  animalReactionToPatrol(animal, command, before, after, result) {
    if (!animal) return "";
    const actionId = ["houndScout", "antiPoacher", "habitat", "salvage", "buySupplies", "intervention", "exploreMaterials"].includes(command)
      ? command
      : this.reserveActionIdFromCommand(command);
    const safetyDelta = after.safety - before.safety;
    const poacherDelta = after.poacherPressure - before.poacherPressure;
    const migrationDelta = (after.migration && after.migration.delta) || 0;
    const species = animal.species || "";
    if (actionId === "antiPoacher") {
      if (species === "鹿") return `巡护后，风里的人味淡了些。偷猎压力降了 ${Math.max(0, Math.abs(poacherDelta))} 点，我今晚敢带幼鹿离水边近一点。`;
      if (species === "乌鸦") return "你把边界敲了一遍，我在树冠上少喊两声。不是我偷懒，是坏脚印真的少了。";
      return `边界安静了点，安全 ${this.signed(safetyDelta)}。我会先靠近一点，但耳朵还开着。`;
    }
    if (actionId === "habitat") {
      if (species === "水貂" || species === "鳄鱼" || species === "河马") return "水线被你修顺了，我的浅滩终于不像漏气的碗。今天先给你一个不咬人的好评。";
      return `水草恢复了些，迁移线${migrationDelta > 0 ? `带回 ${migrationDelta} 个脚步` : "还在观察"}。肚子会比嘴更诚实。`;
    }
    if (actionId === "salvage") return "你移交得很合规，研究记录更完整了。别忘了，动物不看拨款，只看脚步有没有变危险。";
    if (actionId === "buySupplies") return "补给箱响了一下，猎犬明天能跑更远。坏脚印最好今晚就开始紧张。";
    if (actionId === "intervention") return "那阵麻醉气味我会记住。草场轻了一点，但我们会先隔着风观察你。";
    if (actionId === "exploreMaterials") return "这条隐蔽路线不是地图告诉你的，是我们愿意让你知道的。下一次能发现什么，还要看运气。";
    if (actionId === "houndScout") return "猎犬鼻子扫过的地方，消息会变清楚。今晚我先把路线往安全的草边挪一挪。";
    return (result && result.visual && result.visual.influenceNote) || "";
  }

  reserveNextHint(reserve) {
    const eco = (reserve && reserve.ecology) || {};
    const animalEconomy = normalizeEcologyEconomy((reserve && reserve.ecologyEconomy) || {}, reserve || {});
    const chain = (reserve && reserve.eventChain) || {};
    if ((animalEconomy.careDebt || 0) > 0) return `明日建议：先补 ${animalEconomy.careDebt} 点养护缺口，避免动物继续远离设施。`;
    if (chain.next && chain.next.prompt) return `明日建议：${chain.next.prompt}`;
    if ((reserve.poacherPressure || 0) > 50) return "明日建议：驱赶偷猎或猎犬侦察，把边界先压住。";
    if ((reserve.safety || 0) < 60) return "明日建议：优先补安全等级，动物会选择更安全的保护区。";
    if ((eco.water || 0) < 50 || (eco.grass || 0) < 50) return "明日建议：修复水源和草场，别让迁移线断掉。";
    if ((reserve.fund || 0) < 520) return this.recoveredGoodsCount(reserve.inventory || {}) > 0
      ? "明日建议：提交一批科研与执法样本，保护基金快见底了。"
      : "明日建议：去物资页探索自然遗留物，保护基金快见底了。";
    return "明日建议：局面不错，回沙盘点动物再决定下一步。";
  }

  materialSettlementLines(before, after) {
    const supplyLabels = {
      dogFood: "狗粮",
      tranquilizer: "麻醉弹",
      alarm: "警报器",
      fieldKit: "野外工具包",
      medicalKit: "医疗包"
    };
    const inventoryLabels = {
      shedAntlerA: "A级鹿角",
      shedAntlerB: "B级鹿角",
      naturalHide: "自然生命档案",
      researchSample: "研究样本",
      recoveredTrap: "追回陷阱"
    };
    const supplyChanges = Object.keys(supplyLabels).map((key) => {
      const delta = (after.supplies[key] || 0) - (before.supplies[key] || 0);
      return delta ? `${supplyLabels[key]} ${this.signed(delta)}` : "";
    }).filter(Boolean);
    const inventoryChanges = Object.keys(inventoryLabels).map((key) => {
      const delta = (after.inventory[key] || 0) - (before.inventory[key] || 0);
      return delta ? `${inventoryLabels[key]} ${this.signed(delta)}` : "";
    }).filter(Boolean);
    const pendingChanges = Object.keys(inventoryLabels).map((key) => {
      const delta = ((after.pendingRecovered || {})[key] || 0) - ((before.pendingRecovered || {})[key] || 0);
      return delta ? `${inventoryLabels[key]}待收 ${this.signed(delta)}` : "";
    }).filter(Boolean);
    const mysteryChanges = MYSTERY_RECOVERY_CATALOG.map((item) => {
      const delta = (((after.mysteryEvidence || {}).evidence || {})[item.id] || 0)
        - ((((before.mysteryEvidence || {}).evidence || {})[item.id]) || 0);
      return delta > 0 ? `${item.name} +${delta}（封存）` : "";
    }).filter(Boolean);
    const ecologyChanges = [
      { label: "水源", before: ((before.ecology || {}).water || 0), after: ((after.ecology || {}).water || 0) },
      { label: "草场", before: ((before.ecology || {}).grass || 0), after: ((after.ecology || {}).grass || 0) }
    ].map((item) => {
      const delta = item.after - item.before;
      return delta ? `${item.label} ${this.signed(delta)}` : "";
    }).filter(Boolean);
    return [
      `保护区：${ecologyChanges.length ? ecologyChanges.join(" / ") : "水草保持稳定"}`,
      `消耗/补给：${supplyChanges.length ? supplyChanges.join(" / ") : "无变化"}`,
      `回收物：${mysteryChanges.length ? mysteryChanges.join(" / ") : pendingChanges.length ? pendingChanges.join(" / ") : inventoryChanges.length ? inventoryChanges.join(" / ") : "无新增"}`
    ];
  }

  submitCommand() {
    if (!this.state.character) {
      this.toast("先成为卫士");
      return;
    }
    const option = this.selectedReserveActionOption();
    const resourceStatus = this.actionResourceStatus(option.id, (this.state.world || {}).reserve || {});
    if (!resourceStatus.canRun) {
      this.toast(this.actionBlockedToast(resourceStatus));
      this.patrolTaskModal = option;
      this.render();
      return;
    }
    const originScreen = this.pendingTaskOriginScreen || this.screen || "action";
    // 巡护指令完成后回到沙盘，让地图、播报和指标成为结算后的第一落点。
    // 物资页发起的采购仍留在物资页，方便连续补给。
    const returnScreen = originScreen === "action" ? "home" : originScreen;
    this.patrolTaskModal = null;
    const command = this.buildSubmittedCommand();
    this.patrolOperationPlan = null;
    this.recordActivePlay(Date.now(), true);
    const beforeWorldForEcho = this.state.world || {};
    const beforeReserve = this.reserveSnapshot((this.state.world || {}).reserve || {});
    const result = simulateDay(command, this.state);
    const lifeUpdate = advanceLifeMemory(beforeWorldForEcho, result.world || {}, { command, actionId: option.id });
    result.world.lifeMemory = lifeUpdate.state;
    const echoVisual = Object.assign({}, result.visual || {}, { relationshipChange: lifeUpdate.relationshipChange });
    const guardianEcho = this.buildGuardianEcho(beforeWorldForEcho, result.world || {}, command, echoVisual);
    result.world.guardianEchoes = ((beforeWorldForEcho.guardianEchoes || []).concat(guardianEcho)).slice(-12);
    result.visual = Object.assign({}, result.visual || {}, { guardianEcho, relationshipChange: lifeUpdate.relationshipChange, emotionEvent: lifeUpdate.primaryEvent, emotionEvents: lifeUpdate.events });
    (result.reports || []).forEach((report) => {
      report.visual = Object.assign({}, report.visual || {}, { guardianEcho, relationshipChange: lifeUpdate.relationshipChange, emotionEvent: lifeUpdate.primaryEvent, emotionEvents: lifeUpdate.events });
    });
    const nextState = Object.assign({}, this.state, {
      world: result.world,
      character: result.character,
      reports: this.state.reports.concat(result.reports).slice(-12),
      lastCommand: command
    });
    const collectionUpdate = updateCollectionAfterAction(this.state, nextState, { actionId: option.id, actionLabel: option.label || "经营行动" });
    this.state = collectionUpdate.state;
    const resolvedAnimalLead = (((this.state.world || {}).reserve || {}).animalPatrolLead) || null;
    if (resolvedAnimalLead && resolvedAnimalLead.recommendAction === option.id) {
      delete this.state.world.reserve.animalPatrolLead;
    }
    const ordinaryUpdate = recordOrdinaryMoment(this.state, { actionId: option.id, actionLabel: option.label || "经营行动" });
    result.visual = Object.assign({}, result.visual || {}, {
      collectionLead: collectionUpdate.lead,
      collectionChargeGained: collectionUpdate.chargeGained,
      storyDiscovery: collectionUpdate.discovery,
      storyDiscoveryItem: collectionUpdate.discoveryItem,
      storyDiscoveryAdvanced: !!collectionUpdate.discoveryAdvanced,
      ordinaryMoment: ordinaryUpdate.moment
    });
    this.reconcileDerivedGoalProgress(beforeWorldForEcho, result, option.id);
    result.world = this.state.world;
    saveState(this.state);
    const afterReserve = this.reserveSnapshot((result.world || {}).reserve || {});
    this.materialChangeNotice = returnScreen === "role" ? this.buildMaterialChangeNotice(beforeReserve, afterReserve) : null;
    const patrolReplay = this.setMapPatrolReplay(option.id, { label: option.shortLabel || option.label });
    this.setMapConsequencePulse(beforeReserve, afterReserve, {
      title: option.label || "守护行动",
      reason: ((result.visual || {}).guardianEcho || {}).title || "保护区已经回应了这次选择",
      tone: option.id,
      regionId: (result.visual || {}).regionId,
      relationshipChange: lifeUpdate.relationshipChange,
      animalEconomy: (result.visual || {}).animalEconomy,
      promiseEffect: (result.visual || {}).guardianPromiseEffect,
      animalQuote: guardianEcho && `${guardianEcho.actorName}：${guardianEcho.quote}`,
      delayMs: patrolReplay ? 1200 : 0
    });
    this.settlementModal = this.buildPatrolSettlement(beforeReserve, afterReserve, result, command);
    this.settlementModal.storyReplay = !!patrolReplay;
    this.configureSettlementReveal(this.settlementModal, returnScreen);
    this.playSettlementSfx(this.settlementModal);
    this.command = "";
    this.selectedPurchaseId = "";
    this.selectedPurchaseQuantity = 1;
    this.scrollY = 0;
    this.pendingTaskOriginScreen = null;
    this.setScreen("home");
  }

  buildMaterialChangeNotice(before, after) {
    const supplyLabels = {
      dogFood: "狗粮",
      tranquilizer: "麻醉弹",
      alarm: "警报器",
      fieldKit: "野外工具包",
      medicalKit: "医疗包"
    };
    const supplies = {};
    const parts = [];
    Object.keys(supplyLabels).forEach((key) => {
      const delta = ((after.supplies || {})[key] || 0) - ((before.supplies || {})[key] || 0);
      if (!delta) return;
      supplies[key] = delta;
      parts.push(`${supplyLabels[key]} ${this.signed(delta)}`);
    });
    const fundDelta = (after.fund || 0) - (before.fund || 0);
    if (fundDelta) parts.push(`基金 ${this.signed(fundDelta)}`);
    const pendingLabels = {
      shedAntlerA: "A级鹿角",
      shedAntlerB: "B级鹿角",
      naturalHide: "自然生命档案",
      researchSample: "研究样本",
      recoveredTrap: "陷阱证据"
    };
    const inventory = {};
    const pending = {};
    Object.keys(pendingLabels).forEach((key) => {
      const pendingDelta = ((after.pendingRecovered || {})[key] || 0) - ((before.pendingRecovered || {})[key] || 0);
      const inventoryDelta = ((after.inventory || {})[key] || 0) - ((before.inventory || {})[key] || 0);
      if (pendingDelta) {
        pending[key] = pendingDelta;
        parts.push(`${pendingLabels[key]}待收 ${this.signed(pendingDelta)}`);
      }
      if (inventoryDelta) {
        inventory[key] = inventoryDelta;
        parts.push(`${pendingLabels[key]}库存 ${this.signed(inventoryDelta)}`);
      }
    });
    const mystery = {};
    MYSTERY_RECOVERY_CATALOG.forEach((item) => {
      const delta = (((after.mysteryEvidence || {}).evidence || {})[item.id] || 0)
        - ((((before.mysteryEvidence || {}).evidence || {})[item.id]) || 0);
      if (delta <= 0) return;
      mystery[item.id] = delta;
      parts.push(`${item.name}封存 +${delta}`);
    });
    if (!parts.length) return null;
    return {
      supplies,
      inventory,
      pending,
      mystery,
      summary: parts.slice(0, 5).join(" / ")
    };
  }

  buildSubmittedCommand() {
    const typed = this.command.trim();
    if (!this.state.character || this.state.character.role !== "warden") return typed;
    const option = this.selectedReserveActionOption();
    let command = !typed
      ? option.placeholder.replace("例如：", "")
      : typed.indexOf(option.template) >= 0 || typed.indexOf(option.label) >= 0
        ? typed
        : `${option.template}：${typed}`;
    const operation = encodeOperationPlan(this.patrolOperationPlan);
    if (operation) command = `${command} ${operation}`;
    return command;
  }

  resetGame() {
    const runtime = this.runtime;
    const confirm = () => this.doReset();
    if (runtime.showModal) {
      runtime.showModal({
        title: "重新开始",
        content: "将清空当前进度并回到接管保护区。确定吗？",
        confirmText: "重新开始",
        cancelText: "取消",
        success: (res) => {
          if (res && res.confirm) confirm();
        }
      });
    } else {
      confirm();
    }
  }

  doReset() {
    resetState();
    this.state = loadState();
    this.chapterStoryModal = null;
    this.chapterStoryQueue = [];
    this.pendingEmotionEvent = null;
    this.pendingEmotionEvents = [];
    this.pendingGuardianLetter = null;
    this.pendingMissionAfterChapter = false;
    this.pendingMissionPush = null;
    this.deferQueuedMissionPush = false;
    this.pendingShareInvite = null;
    this.pendingShareWelcome = null;
    this.settlementModal = null;
    this.patrolTaskModal = null;
    this.patrolOperationPlan = null;
    this.infoDetailModal = null;
    this.materialChangeNotice = null;
    this.mapHarvestFlight = null;
    this.command = "";
    this.selectedPurchaseId = "";
    this.selectedPurchaseQuantity = 1;
    this.numberAnimations = {};
    this.displayReserveStats = this.initialDisplayReserveStats();
    this.selectedRegionId = this.defaultRegionId();
    this.selectedTarget = this.state.world.knownCharacters[0];
    this.speakingAnimalId = (this.selectedTarget && this.selectedTarget.id) || null;
    this.scrollY = 0;
    this.setScreen("choose");
    this.toast("已重置");
  }

  latestReport(type) {
    return [...this.state.reports].reverse().find((report) => report.type === type);
  }

  empty(ctx, text, y) {
    this.roundRect(ctx, 18, y + 5, this.width - 36, 96, 20, "rgba(18,61,52,.14)");
    this.roundRect(ctx, 18, y, this.width - 36, 96, 20, "rgba(255,253,244,.96)", "rgba(46,135,110,.34)");
    this.wrapText(ctx, text, 34, y + 34, this.width - 68, 14, 21, "#657260", 3);
  }

  panel(ctx, x, y, w, h) {
    this.roundRect(ctx, x, y + 3, w, h, 18, "rgba(22,34,28,.10)");
    this.roundRect(ctx, x, y, w, h, 18, UI_THEME.surface, UI_THEME.separator);
  }

  sectionTitle(ctx, x, y, title, meta = "") {
    // v3.0: 区块标题 16px Bold 深林绿，元信息 11px Bold 暗金色
    this.text(ctx, title, x, y, 16, "#1c3325", "700");
    if (meta) this.text(ctx, meta, this.width - 18, y, 11, "#8b6f2a", "700", "right");
  }

  statusPill(ctx, x, y, label, fill = "#e7efd5", color = "#26352b", w = 74) {
    this.roundRect(ctx, x, y, w, 24, 12, fill, UI_THEME.separator);
    const size = this.fitTextSize(ctx, label, w - 14, 10, 9, "700");
    this.text(ctx, label, x + w / 2, y + 16, size, color, "700", "center");
  }

  infoListItemNaturalHeight(ctx, item, w) {
    const delta = this.infoListItemDelta(item);
    if (delta) {
      const bodyLines = item.body ? Math.max(1, Math.min(2, this.wrapTextLines(ctx, item.body, w - 28, 11).length)) : 0;
      return Math.max(66, 69 + Math.max(0, bodyLines - 1) * 15);
    }
    const title = item.title || "记录";
    const body = item.body || "";
    const titleSize = String(title).length <= 18 ? 14 : 13;
    const titleLines = Math.max(1, Math.min(2, this.wrapTextLines(ctx, title, w - 78, titleSize, "700").length));
    const bodyLines = body ? Math.max(1, Math.min(3, this.wrapTextLines(ctx, body, w - 28, 11).length)) : 0;
    return Math.max(70, 71 + (titleLines - 1) * 17 + Math.max(0, bodyLines - 1) * 15);
  }

  infoListItemMinimumHeight(ctx, item, w) {
    const delta = this.infoListItemDelta(item);
    if (delta) {
      const bodyLines = item.body ? Math.max(1, Math.min(2, this.wrapTextLines(ctx, item.body, w - 28, 11).length)) : 0;
      return Math.max(58, 60 + Math.max(0, bodyLines - 1) * 14);
    }
    const title = item.title || "记录";
    const body = item.body || "";
    const titleSize = String(title).length <= 18 ? 14 : 13;
    const titleLines = Math.max(1, Math.min(2, this.wrapTextLines(ctx, title, w - 78, titleSize, "700").length));
    const bodyLines = body ? Math.max(1, Math.min(3, this.wrapTextLines(ctx, body, w - 28, 11).length)) : 0;
    return Math.max(58, 58 + (titleLines - 1) * 24 + Math.max(0, bodyLines - 1) * 15);
  }

  infoListItemDelta(item) {
    const title = String((item && item.title) || "").trim();
    const match = /^(-?\d+(?:\.\d+)?)\s*→\s*(-?\d+(?:\.\d+)?)\s*[（(]\s*([+-]?\d+(?:\.\d+)?)\s*[）)]$/.exec(title);
    if (!match) return null;
    const before = Number(match[1]);
    const after = Number(match[2]);
    const change = Number(match[3]);
    if (![before, after, change].every(Number.isFinite)) return null;
    const tag = String((item && item.tag) || "");
    const inverse = /偷猎|疾病|风险|威胁|压力/.test(tag);
    const beneficial = change === 0 ? null : (inverse ? change < 0 : change > 0);
    return {
      before: match[1],
      after: match[2],
      change,
      deltaText: `${change > 0 ? "+" : ""}${match[3].replace(/^\+/, "")}`,
      beneficial
    };
  }

  infoDeltaListItem(ctx, item, delta, x, y, w, h) {
    const positive = delta.beneficial === true;
    const negative = delta.beneficial === false;
    const palette = positive
      ? { fill: "#effbea", stroke: "#65c98d", bar: "#45c982", value: "#16895c", pill: "#48c987" }
      : negative
        ? { fill: "#fff2e8", stroke: "#f09a78", bar: "#ff826f", value: "#cf5948", pill: "#ef7668" }
        : { fill: "#fff8df", stroke: "#e5c66b", bar: "#f2c84b", value: "#9b7420", pill: "#d9ae35" };
    this.roundRect(ctx, x, y + 4, w, h, 16, "rgba(18,61,52,.10)");
    this.roundRect(ctx, x, y, w, h, 16, palette.fill, palette.stroke);
    this.roundRect(ctx, x + 12, y + 6, w - 24, 4, 2, palette.bar);
    this.statusPill(ctx, x + 10, y + 12, item.tag || "变化", positive ? "#d9f3d8" : negative ? "#ffe1d5" : "#fff0b8", palette.value, 48);

    const deltaW = 44;
    const deltaX = x + w - deltaW - 10;
    this.roundRect(ctx, deltaX, y + 12, deltaW, 24, 10, palette.pill, "rgba(255,255,255,.42)");
    this.text(ctx, delta.deltaText, deltaX + deltaW / 2, y + 29, 12, "#ffffff", "700", "center");

    const dataX = x + 64;
    const dataW = Math.max(52, deltaX - dataX - 8);
    const beforeSize = 13;
    const afterSize = 20;
    ctx.font = `700 ${beforeSize}px ${UI_FONT_STACK}`;
    const beforeW = ctx.measureText(delta.before).width;
    ctx.font = `700 12px ${UI_FONT_STACK}`;
    const arrowW = ctx.measureText("→").width;
    ctx.font = `700 ${afterSize}px ${UI_FONT_STACK}`;
    const afterW = ctx.measureText(delta.after).width;
    const groupW = beforeW + arrowW + afterW + 12;
    let gx = dataX + Math.max(0, (dataW - groupW) / 2);
    this.text(ctx, delta.before, gx, y + 30, beforeSize, "#728078", "700");
    gx += beforeW + 6;
    this.text(ctx, "→", gx, y + 29, 12, palette.value, "700");
    gx += arrowW + 6;
    this.text(ctx, delta.after, gx, y + 31, afterSize, palette.value, "700");

    const bodyY = y + Math.min(52, h - 11);
    const bodyLayout = item.body ? this.drawFittedTextBlock(ctx, item.body, x + 14, bodyY, w - 28, Math.max(14, h - (bodyY - y) - 4), {
      size: 11,
      minSize: 10,
      lineHeight: 14,
      color: "#607068"
    }) : null;
    return {
      title: { size: afterSize, lineHeight: 22, lineCount: 1, visibleCount: 1, truncated: false },
      body: bodyLayout,
      delta
    };
  }

  infoListItem(ctx, item, x, y, w, h, active = false) {
    const delta = this.infoListItemDelta(item);
    if (delta) return this.infoDeltaListItem(ctx, item, delta, x, y, w, h);
    this.roundRect(ctx, x, y + 4, w, h, 16, "rgba(18,61,52,.10)");
    this.roundRect(ctx, x, y, w, h, 16, active ? "#fff3b8" : "rgba(255,255,250,.90)", active ? "rgba(255,161,66,.62)" : "rgba(46,135,110,.18)");
    this.statusPill(ctx, x + 10, y + 10, item.tag || "记录", active ? "#ead38a" : "#e7efd5", active ? "#26352b" : "#31533b", 48);
    const title = item.title || "记录";
    const body = item.body || "";
    const titleSize = String(title).length <= 18 ? 14 : 13;
    const titleLineCount = Math.max(1, Math.min(h >= 82 ? 2 : 1, this.wrapTextLines(ctx, title, w - 78, titleSize, "700").length));
    const titleLayout = this.drawFittedTextBlock(ctx, title, x + 62, y + 26, w - 78, titleLineCount * 17, {
      size: titleSize,
      minSize: 12,
      lineHeight: 17,
      color: "#1c3325",
      weight: "700"
    });
    const bodyY = y + 48 + (titleLineCount - 1) * 17;
    const bodyLayout = body ? this.drawFittedTextBlock(ctx, body, x + 14, bodyY, w - 28, Math.max(14, h - (bodyY - y) - 8), {
      size: 11,
      minSize: 10,
      lineHeight: 15,
      color: "#4b594e"
    }) : null;
    return { title: titleLayout, body: bodyLayout };
  }

  button(ctx, x, y, w, h, label, fill, onTap, color = "#fff8df", size = 14) {
    const role = this.controlRole(fill, onTap);
    const style = this.controlStyle(role, fill, color);
    const radius = Math.min(12, h / 2);
    if (role === "primary" || role === "danger") {
      this.roundRect(ctx, x, y + 2, w, h, radius, "rgba(20,35,29,.13)");
    }
    this.roundRect(ctx, x, y, w, h, radius, style.fill, style.stroke);
    const fitted = this.fitTextSize(ctx, label, w - 16, size, 10, "700");
    this.text(ctx, label, x + w / 2, y + h / 2 + fitted / 2 - 3, fitted, style.color, "700", "center");
    if (typeof onTap === "function") this.addHit(x, y - this.scrollY, w, h, onTap);
  }

  modalButton(ctx, x, y, w, h, label, fill, onTap, color = "#fff8df", size = 14) {
    const role = this.controlRole(fill, onTap);
    const style = this.controlStyle(role, fill, color);
    const radius = Math.min(12, h / 2);
    if (role === "primary" || role === "danger") {
      this.roundRect(ctx, x, y + 2, w, h, radius, "rgba(20,35,29,.13)");
    }
    this.roundRect(ctx, x, y, w, h, radius, style.fill, style.stroke);
    const fitted = this.fitTextSize(ctx, label, w - 16, size, 10, "700");
    this.text(ctx, label, x + w / 2, y + h / 2 + fitted / 2 - 3, fitted, style.color, "700", "center");
    if (typeof onTap === "function") this.addHit(x, y, w, h, onTap, this.buttonSfx(label));
  }

  controlRole(fill, onTap) {
    const value = String(fill || "").toLowerCase();
    if (typeof onTap !== "function" || ["#9aa093", "#778078", "#cdd3cb", "#d5d5cb"].includes(value)) return "disabled";
    if (["#1c3325", UI_THEME.forest900, UI_THEME.forest800, UI_THEME.tint].map((item) => String(item).toLowerCase()).includes(value)) return "primary";
    if (["#e8ddbd", UI_THEME.ivory, UI_THEME.surfaceStrong].map((item) => String(item).toLowerCase()).includes(value)) return "secondary";
    if (["#c95f54", "#f46773", UI_THEME.danger].map((item) => String(item).toLowerCase()).includes(value)) return "danger";
    if (["#d8c27a", UI_THEME.gold].map((item) => String(item).toLowerCase()).includes(value)) return "accent";
    return "custom";
  }

  controlStyle(role, fill, color) {
    if (role === "primary") return { fill: UI_THEME.tint, stroke: "rgba(20,85,63,.32)", color: "#ffffff" };
    if (role === "secondary") return { fill: UI_THEME.surfaceStrong, stroke: UI_THEME.separator, color: UI_THEME.ink };
    if (role === "disabled") return { fill: "rgba(227,231,227,.96)", stroke: "rgba(60,60,67,.10)", color: "#929995" };
    if (role === "danger") return { fill: UI_THEME.danger, stroke: "rgba(143,44,41,.24)", color: "#ffffff" };
    if (role === "accent") return { fill: "#f3dfaa", stroke: "rgba(139,107,50,.22)", color: UI_THEME.ink };
    return { fill, stroke: UI_THEME.separator, color };
  }

  typographyScale() {
    return [28, 25, 24, 22, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8];
  }

  normalizeTypeSize(size, minSize = 8) {
    const numeric = Number(size) || minSize;
    const min = Math.max(8, Number(minSize) || 8);
    const allowed = this.typographyScale().filter((item) => item >= min);
    if (!allowed.length) return 8;
    for (const item of allowed) {
      if (item <= numeric) return item;
    }
    return allowed[allowed.length - 1];
  }

  typographyCandidates(size, minSize = 8) {
    const max = this.normalizeTypeSize(size, minSize);
    const min = Math.max(8, Number(minSize) || 8);
    return this.typographyScale().filter((item) => item <= max && item >= min);
  }

  toyPaletteColor(color) {
    if (typeof color !== "string") return color;
    const mapped = {
      "#1c3325": UI_THEME.ink,
      "#fff8df": UI_THEME.ivory,
      "#f0d376": UI_THEME.gold,
      "#8b6f2a": UI_THEME.goldDeep,
      "#c45b42": UI_THEME.danger,
      "#26352b": UI_THEME.forest800,
      "#66715f": UI_THEME.muted,
      "#1f7a52": UI_THEME.good,
      "#8b7355": "#817869",
      "#9aa093": "#9a9f98",
      "#5cb87a": "#6f9a7a",
      "#e8ddbd": "#eee6d4",
      "#d8c27a": UI_THEME.gold,
      "#d9dfce": "#e5e7dc",
      "#ffb070": "#c8846f",
      "#e8d491": "#d8c28d",
      "#7d692d": "#8c754c",
      "#2f7c8f": "#78969a",
      "#4b594e": "#59665e"
    };
    return mapped[color.toLowerCase()] || color;
  }

  roundRect(ctx, x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = this.toyPaletteColor(fill);
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = this.toyPaletteColor(stroke);
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  text(ctx, text, x, y, size, color, weight = "400", align = "left") {
    const typeSize = this.normalizeTypeSize(size, 8);
    ctx.fillStyle = this.toyPaletteColor(color);
    ctx.font = `${weight} ${typeSize}px ${UI_FONT_STACK}`;
    ctx.textAlign = align;
    ctx.textBaseline = "alphabetic";
    ctx.fillText(text, x, y);
  }

  fitTextSize(ctx, text, maxWidth, size, minSize = 9, weight = "400") {
    const candidates = this.typographyCandidates(size, minSize);
    for (const s of candidates) {
      ctx.font = `${weight} ${s}px ${UI_FONT_STACK}`;
      if (ctx.measureText(String(text || "")).width <= maxWidth) return s;
    }
    return this.normalizeTypeSize(minSize, 8);
  }

  wrapTextLines(ctx, text, maxWidth, size, weight = "400") {
    const typeSize = this.normalizeTypeSize(size, 8);
    ctx.font = `${weight} ${typeSize}px ${UI_FONT_STACK}`;
    const paragraphs = String(text || "").split("\n");
    const lines = [];
    paragraphs.forEach((paragraph, paragraphIndex) => {
      let line = "";
      for (let i = 0; i < paragraph.length; i += 1) {
        const test = line + paragraph[i];
        if (ctx.measureText(test).width > maxWidth && line) {
          // Closing punctuation must travel with the preceding Chinese phrase.
          // Let it overhang by one glyph instead of producing a lonely "。" or
          // comma at the start of the next line.
          if (/[，。；：！？、,.!?;:）》】”’]/.test(paragraph[i])) {
            line += paragraph[i];
            continue;
          }
          lines.push(line);
          line = paragraph[i];
        } else {
          line = test;
        }
      }
      lines.push(line);
      if (paragraphIndex < paragraphs.length - 1) lines.push("");
    });
    return lines;
  }

  drawFittedTextBlock(ctx, text, x, y, maxWidth, maxHeight, options = {}) {
    const requestedMin = Math.max(DESCRIPTION_TEXT_MIN, Number(options.minSize || DESCRIPTION_TEXT_MIN));
    const requestedBase = Math.max(requestedMin, Number(options.size || 12));
    const baseSize = this.normalizeTypeSize(requestedBase, requestedMin);
    const minSize = this.normalizeTypeSize(requestedMin, DESCRIPTION_TEXT_MIN);
    const baseLineHeight = Math.max(options.lineHeight || baseSize + 5, baseSize + 3);
    const color = options.color || "#26352b";
    const weight = options.weight || "400";
    let chosen = { size: baseSize, lineHeight: baseLineHeight, lines: [] };
    for (const size of this.typographyCandidates(baseSize, minSize)) {
      const ratio = size / baseSize;
      const lineHeight = Math.max(size + 3, Math.round(baseLineHeight * ratio));
      const lines = this.wrapTextLines(ctx, text, maxWidth, size, weight);
      chosen = { size, lineHeight, lines };
      if (lines.length * lineHeight <= maxHeight) break;
    }
    const lineHeight = chosen.lines.length * chosen.lineHeight > maxHeight && chosen.lines.length
      ? Math.max(chosen.size + 1, maxHeight / chosen.lines.length)
      : chosen.lineHeight;
    const safeLineHeight = Math.max(chosen.size + 1, lineHeight);
    const visibleCount = Math.max(1, Math.floor(maxHeight / safeLineHeight));
    const visibleLines = chosen.lines.slice(0, visibleCount);
    if (chosen.lines.length > visibleCount && visibleLines.length) {
      let last = visibleLines[visibleLines.length - 1];
      ctx.font = `${weight} ${chosen.size}px ${UI_FONT_STACK}`;
      while (last.length > 0 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
      visibleLines[visibleLines.length - 1] = `${last}…`;
    }
    ctx.fillStyle = color;
    ctx.font = `${weight} ${chosen.size}px ${UI_FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    visibleLines.forEach((line, index) => {
      if (line) ctx.fillText(line, x, y + index * safeLineHeight);
    });
    return {
      size: chosen.size,
      lineHeight: safeLineHeight,
      lineCount: chosen.lines.length,
      visibleCount,
      truncated: chosen.lines.length > visibleCount
    };
  }

  wrapText(ctx, text, x, y, maxWidth, size, lineHeight, color, maxLines = 4) {
    const typeSize = this.normalizeTypeSize(Math.max(DESCRIPTION_TEXT_MIN, Number(size || DESCRIPTION_TEXT_MIN)), DESCRIPTION_TEXT_MIN);
    const descriptionLineHeight = Math.max(Number(lineHeight || 0), typeSize + 3);
    ctx.fillStyle = color;
    ctx.font = `400 ${typeSize}px ${UI_FONT_STACK}`;
    ctx.textAlign = "left";
    const lines = this.wrapTextLines(ctx, text, maxWidth, typeSize);
    const drawCount = Math.min(lines.length, maxLines);
    const truncated = lines.length > maxLines;
    for (let i = 0; i < drawCount; i += 1) {
      let line = lines[i];
      if (truncated && i === drawCount - 1) {
        while (line.length > 0 && ctx.measureText(line + "…").width > maxWidth) {
          line = line.slice(0, -1);
        }
        line = line + "…";
      }
      ctx.fillText(line, x, y + i * descriptionLineHeight);
    }
  }

// ============================================================
  // 动物世界 UI v3 — 宏观→微观影响链路 + 分阶段解锁
  // ============================================================

  drawAnimalWorld(ctx) {
    this.drawPageBackdrop(ctx, "population");
    const reserve = this.state.world.reserve || {};
    const currentChapter = getCurrentChapter(reserve);
    const progress = getChapterProgress(reserve);
    const reserveLevel = progress.level;
    const unlocked = getUnlockedSpecies(reserveLevel);
    const allIds = Object.keys(SPECIES_DB);
    const lockedIds = allIds.filter(id => SPECIES_DB[id].unlockLevel > reserveLevel);
    const heroH = this.drawAnimalWorldChapterHero(ctx, currentChapter, progress);
    if (!this.state.character) {
      this.emptyAW(ctx, "你还没有接管保护区。先成为卫士，再认识这里的动物。", heroH + 30);
      this.button(ctx, 28, heroH + 100, this.width - 56, 46, "成为卫士", "#1c3325", () => this.setScreen("choose"));
      this.bottom(heroH + 160);
      return;
    }
    if (!this.selectedAnimalWorldSpecies || !SPECIES_DB[this.selectedAnimalWorldSpecies]) {
      this.selectedAnimalWorldSpecies = unlocked[0] ? unlocked[0].id : null;
    }
    let y = heroH + 4;

    y = this.drawLifeMemoryBar(ctx, 12, y, this.width - 24);

    // 物种选择器（单行，活跃+锁定）
    y = this.drawSpeciesSelector(ctx, 12, y, this.width - 24, unlocked, lockedIds, reserve, reserveLevel);

    // 食物链是二级解释，不再占用头像列表下方的一整块空间；入口已合并
    // 到种群总览标题行，避免小屏内容被固定导航遮挡。
    this.bottom(y + 10);
  }

  drawLifeMemoryBar(ctx, x, y, w) {
    const memory = normalizeLifeMemory(this.state.world || {});
    const active = memory.individuals.filter((item) => item.status === "active").length;
    const remembered = memory.memories.length;
    const rare = memory.rareMoments.length;
    const featured = memory.individuals.find((item) => item.status === "active") || memory.individuals[0];
    const h = 42;
    this.roundRect(ctx, x, y + 5, w, h, 14, "rgba(8,26,18,0.20)");
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, UI_THEME.forest700);
    g.addColorStop(0.62, UI_THEME.forest800);
    g.addColorStop(1, UI_THEME.forest900);
    this.roundRect(ctx, x, y, w, h, 17, g, "rgba(232,224,201,.34)");
    this.roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 11, null, "rgba(255,249,233,0.10)");
    if (this.art.map && this.art.map.complete) {
      ctx.save();
      this.roundRect(ctx, x, y, w, h, 14);
      ctx.clip();
      ctx.globalAlpha = 0.16;
      ctx.drawImage(this.art.map, x + w * 0.56, y, w * 0.44, h);
      ctx.restore();
    }
    if (featured) {
      this.roundRect(ctx, x + 8, y + 7, 28, 28, 14, "rgba(255,249,233,0.16)", "rgba(231,199,109,0.42)");
      this.drawAnimalAvatar(ctx, featured, x + 22, y + 21, 24, false);
    } else {
      this.drawUiIcon(ctx, "leaf", x + 22, y + 21, 20, false)
        || this.drawSmallGlyph(ctx, "leaf", x + 22, y + 21, "#f0d376", 0.72);
    }
    this.text(ctx, featured ? `${featured.name}与保护区记忆` : "保护区记忆", x + 44, y + 16, 11, "#fff9e9", "700");
    const memorySummary = `${active}位朋友 · ${remembered}段记忆 · ${rare}次罕见`;
    this.text(ctx, this.truncateTextToWidth(ctx, memorySummary, w - 116, 10, "700"), x + 44, y + 32, 10, "#fff3a5", "700");
    this.roundRect(ctx, x + w - 58, y + 9, 46, 24, 9, "rgba(8,26,18,0.56)", "rgba(231,199,109,0.34)");
    this.text(ctx, "翻开 ›", x + w - 35, y + 25, 9, "#fff9e9", "700", "center");
    this.addHit(x, y - this.scrollY, w, h, () => {
      this.infoDetailModal = this.buildLifeMemoryDetail();
      this.render();
    });
    return y + h + 6;
  }

  buildFoodChainDetail() {
    const reserve = (this.state.world || {}).reserve || {};
    const level = ((reserve.progression || {}).level) || 1;
    const tiers = foodChainTiers();
    return {
      kicker: "种群关系",
      title: "保护区食物链",
      icon: "claw",
      items: tiers.map((tier) => {
        const species = Object.values(SPECIES_DB).filter((sp) => sp.tier === tier.tier && sp.unlockLevel <= level && speciesPopulation(reserve, sp.id) > 0);
        const total = species.reduce((sum, sp) => sum + speciesPopulation(reserve, sp.id), 0);
        const speciesSummary = species.slice(0, 1).map((sp) => sp.name).join(" · ");
        const compactTierLabel = tier.label.split("/")[0].replace("顶级捕食者", "顶级捕食");
        return {
          tag: `T${tier.tier}`,
          title: `${compactTierLabel} · ${total}只`,
          body: species.length ? `${speciesSummary}${species.length > 1 ? ` 等${species.length}种` : ""}` : "本章尚未出现"
        };
      }),
      footer: "从生产者到顶级捕食者。"
    };
  }

  buildLifeMemoryDetail() {
    const memory = normalizeLifeMemory(this.state.world || {});
    const newest = memory.memories.slice(-3).reverse();
    const landmarks = memory.memories.filter((item) => ["rare", "return", "birth", "death", "independence", "wild_visit", "guardian_letter", "strategic_permanent"].includes(item.type)).reverse();
    const seen = new Set();
    const recent = newest.concat(landmarks).filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }).slice(0, 6);
    const alive = memory.individuals.filter((item) => item.status === "active").length;
    const departed = memory.individuals.filter((item) => item.status === "departed").length;
    const independent = memory.individuals.filter((item) => item.status === "independent").length;
    const dead = memory.individuals.filter((item) => item.status === "dead").length;
    return {
      kicker: "来过 · 活过 · 被记住",
      title: "保护区记忆",
      icon: "reserve_prosperity",
      items: recent.length ? recent.map((item) => ({
        tag: item.type === "rare" ? "罕见" : item.type === "return" ? "归来" : item.type === "strategic_permanent" ? "永久后果" : `第${item.day}日`,
        title: item.title,
        body: item.body
      })) : [{ tag: "第一页", title: "等待第一段共同记忆", body: "完成有效行动，认识的动物会出生、受伤、离开、归来，也会慢慢老去。" }],
      footer: `仍在保护区 ${alive} 位 · 重归野外 ${independent} 位 · 暂时离开 ${departed} 位 · 已故 ${dead} 位。离开也不会从记忆中删除。`
    };
  }

  openNamedIndividual(individual) {
    const memory = normalizeLifeMemory(this.state.world || {});
    const current = memory.individuals.find((item) => item.id === individual.id) || individual;
    const records = memory.memories.filter((item) => item.individualId === current.id).slice(-4).reverse();
    const permanent = (current.strategicHistory || []).slice(-1)[0];
    const axes = relationshipAxes(current);
    this.infoDetailModal = {
      kicker: `${current.species} · 你认识的朋友`,
      title: `${current.name}${current.rarity ? ` · ${current.rarity}` : ""}`,
      icon: current.rarity ? "reserve_prosperity" : "leaf",
      items: [
        { tag: "生命", title: `${current.lifeStage} · ${individualDisplayStatus(current)}`, body: `健康 ${current.health}/${current.healthCap || 100} · 安全感 ${axes.security} · 野性 ${axes.wildness} · 从第 ${current.bornDay} 日开始被记住。` },
        permanent ? { tag: "永久后果", title: permanent.trait, body: `${permanent.dilemmaTitle}中选择“${permanent.choiceLabel}”：健康 ${this.signed(permanent.healthDelta)}、安全感 ${this.signed(permanent.securityDelta == null ? permanent.bondDelta : permanent.securityDelta)}、野性 ${this.signed(permanent.wildnessDelta || 0)}${permanent.healthCapDelta ? `、健康上限 ${this.signed(permanent.healthCapDelta)}` : ""}。` } : null
      ].filter(Boolean).concat(records.map((item) => ({ tag: item.permanent ? "永久" : `第${item.day}日`, title: item.title, body: item.body }))).slice(0, 6),
      footer: current.status === "dead" ? "名字与经历留在保护区记忆里。" : current.status === "independent" ? "它已恢复独立生活。" : current.status === "departed" ? `最早第 ${current.returnBlockedUntilDay || "?"} 日后可能归来。` : permanent ? "重大选择已记录。" : "安全感决定停留，野性决定独立。"
    };
    this.render();
  }

  speciesProfileNarrative(sp, reserve) {
    const safety = reserve.safety || 50;
    const ecology = typeof reserve.ecologyScore === "number" ? reserve.ecologyScore : (reserve.stability || 50);
    const business = typeof reserve.business === "number" ? reserve.business : 50;
    const poachers = reserve.poacherPressure || 30;
    const sensitivity = MACRO_SENSITIVITY[sp.sensitivity] || MACRO_SENSITIVITY.balanced;
    const effectiveSafety = Math.max(0, safety - Math.max(0, poachers - 35) * 0.45);
    const trust = Math.round(
      effectiveSafety * sensitivity.safety
      + ecology * sensitivity.ecology
      + business * sensitivity.business
    );
    const pool = this.speciesStateDialoguePool(sp, reserve);
    const day = ((this.state.world || {}).day) || 1;
    const feedback = pool[Math.abs(this.hashString(`${sp.id}|feedback|${day}`)) % Math.max(1, pool.length)]
      || ((sp.representative || {}).quote)
      || "它们仍在观察保护区的变化。";
    return {
      feedback,
      attitude: this.speciesAttitudeLine(sp, trust),
      trust
    };
  }

  speciesStateDialoguePool(sp, reserve) {
    const dialogues = (sp && sp.dialogues) || {};
    const ecology = (reserve && reserve.ecology) || {};
    const safety = (reserve && reserve.safety) || 50;
    const poachers = (reserve && reserve.poacherPressure) || 30;
    const water = ecology.water || 60;
    const grass = ecology.grass || 60;
    const disease = ecology.disease || 10;
    let preferred = ["safety_ok", "calm", "ecology_ok"];
    if (poachers > 55) preferred = ["threat", "safety_low", "calm"];
    else if (safety < 48) preferred = ["safety_low", "threat", "calm"];
    else if (water < 48 || grass < 48 || disease > 28) preferred = ["ecology_low", "threat", "calm"];
    else if (safety > 70 && water > 55 && grass > 55) preferred = ["calm", "safety_ok", "ecology_ok"];
    const allKeys = ["safety_low", "safety_ok", "ecology_low", "ecology_ok", "threat", "calm"];
    const lines = [];
    preferred.concat(allKeys).forEach((key) => {
      (dialogues[key] || []).forEach((line) => {
        const text = this.cleanGameText(line);
        if (text && !lines.includes(text)) lines.push(text);
      });
    });
    return lines;
  }

  speciesRecentDialogueLines(sp, reserve, feedback = "") {
    const world = this.state.world || {};
    const day = world.day || 1;
    const animal = (world.knownCharacters || []).find((item) => item.species === sp.name);
    const lived = animal ? this.animalRecentDialogues(animal, 5) : [];
    const stateLines = this.speciesStateDialoguePool(sp, reserve);
    const representative = (sp.representative || {}).quote || "";
    const seed = Math.abs(this.hashString(`${sp.id}|recent|${day}|${(world.actionHistory || []).length}`));
    const rotated = stateLines.length
      ? stateLines.slice(seed % stateLines.length).concat(stateLines.slice(0, seed % stateLines.length))
      : [];
    const raw = [lived[0], rotated[0], lived[1], rotated[1], lived[2], representative]
      .concat(lived.slice(3), rotated.slice(2));
    const lines = [];
    raw.forEach((line) => {
      const text = this.shortGameText(line, 28).replace(/^[“"]|[”"]$/g, "");
      if (text && text !== feedback && !lines.includes(text)) lines.push(text);
    });
    const target = 3 + (seed % 3);
    return lines.slice(0, Math.max(3, Math.min(5, target)));
  }

  speciesAttitudeLine(sp, trust) {
    const voices = {
      deer: ["先把人味留在边界外，我才会让幼鹿靠近。", "我的耳朵还朝着你，但幼鹿没有立刻逃。", "你的脚步没吓散幼鹿，我愿意把队伍带近一些。"],
      antelope: ["我会先跳开，再决定要不要听你的。", "腿还绷着，不过我肯在原地多站一会儿。", "风里有你的气味，我不再立刻起跳。"],
      hare: ["洞口只开一条缝，你先别靠得太近。", "我敢露出鼻尖，但后腿还没放松。", "你经过时我没钻回洞里，这已经很信任了。"],
      crow: ["我会把你的脚步当成一条待核实的消息。", "树冠正在讨论你，目前还没有坏结论。", "你的好消息可以挂到最高那根树枝上了。"],
      wolf: ["我只信风里的结果，不信口头保证。", "你的巡线少了人味，我会继续闻一阵。", "猎场因你安静下来，狼群认可这条边界。"],
      zebra: ["队形会绕开你，幼崽仍放在最中间。", "队尾还看着你，但条纹没有散开。", "你靠近时队伍仍保持队形，这就是我们的认可。"],
      boar: ["我会躲进灌木，等你的脚步走远再翻土。", "你在附近时，我还肯继续拱两下。", "这片土可以放心翻，我把你算进安全气味里了。"],
      eagle: ["我会在更高处看你，不急着降低盘旋圈。", "你的路线还算规整，我愿意多盘旋一圈。", "从高空看，你已经是这片地形的一部分。"],
      flamingo: ["岸边一有你的动静，粉色队伍就会往湖心退。", "队伍没有起飞，只是把脚步往水里挪了挪。", "你站在岸边时，我们仍愿意安静滤食。"],
      bear: ["离我的洞口远一点，承诺不能当矿盐吃。", "洞口暂时容得下你的气味，别突然吵起来。", "我允许你的脚印留在洞域外圈，这评价很高。"],
      vulture: ["我先绕几圈，确认你不会制造新的坏消息。", "你不像危险源，但我还要再看一轮。", "天空没有因你集结，这就是清道夫的信任票。"],
      lion: ["狮群不会为一句保证浪费体力。", "我暂时不把你的脚步当成领地威胁。", "狮群在你巡过的草地上休息，这是最高评价。"],
      leopard: ["树影会替我看着你，我不会先露出尾巴。", "我还藏着，但没有换掉这棵树。", "你经过时我仍留在树影里，说明这里值得守。"],
      giraffe: ["我从远处看着，你的尘土还需要时间沉下去。", "树梢告诉我可以观望，不必立刻离开。", "我愿意把远处的动静先告诉你，再告诉队伍。"],
      owl: ["白天的承诺不算数，我会在夜里重新听一遍。", "夜里暂时没有需要躲你的声音。", "你的脚步经过树下，我仍能安静合上翅膀。"],
      elephant: ["记忆不会因为一次好事改道，幼象先跟紧我。", "我开始把你的脚步和安全水路放在一起记。", "幼象愿意沿你修过的路走，象群已经记住你。"],
      hippo: ["别靠近河湾，我的耐心和水位一样有限。", "我只露鼻孔看你，还没有沉到更深处。", "你在岸边时我仍肯冒泡，河湾接受你了。"],
      crocodile: ["我会沉下去等，时间比你的保证可靠。", "我只露眼睛观察，没有把水面让给你。", "你靠近饮水线时，水面仍然平静。"],
      wildDog: ["小队会散开看你，谁也不会单独相信。", "耳朵朝着你，脚还保留随时开跑的角度。", "小队愿意沿你的巡线集合，你被算作队友了。"],
      mink: ["我先贴着水线溜走，岸上的保证太响。", "胡须还在试探，但我没有放弃这片浅滩。", "你靠近时伏击点仍营业，我愿意分你一点信任。"],
      fox: ["我不会把退路交给任何人的承诺。", "你暂时值得合作，但机会窗口由我决定。", "我愿意把最好的一条暗路告诉你，别浪费它。"]
    };
    const tier = trust >= 70 ? 2 : trust >= 50 ? 1 : 0;
    const speaker = ((sp.representative || {}).name) || sp.name;
    const set = voices[sp.id] || ["我仍会保持距离。", "我会继续观察你的选择。", "你的行动已经被我记住。"];
    return `${speaker}：${set[tier]}`;
  }

  buildSpeciesProfileDetail(speciesId) {
    const reserve = (this.state.world || {}).reserve || {};
    const sp = getSpeciesById(speciesId);
    if (!sp) return null;
    const pop = speciesPopulation(reserve, speciesId);
    const status = speciesStatus(reserve, speciesId, reserve.migration || {});
    const importance = speciesImportance(speciesId, reserve);
    const ecoRole = ECO_ROLES[sp.ecoRole];
    const sensitivity = MACRO_SENSITIVITY[sp.sensitivity];
    const narrative = this.speciesProfileNarrative(sp, reserve);
    const recentDialogues = this.speciesRecentDialogueLines(sp, reserve, narrative.feedback);
    return {
      kind: "speciesProfile",
      kicker: `${ecoRole ? ecoRole.label : "保护区动物"} · ${sensitivity ? sensitivity.label : "生态成员"}`,
      title: sp.name,
      animal: { species: sp.name },
      profile: {
        species: sp,
        population: pop,
        status,
        importance,
        feedback: narrative.feedback,
        friends: individualsForSpecies(this.state.world || {}, sp.id).slice(0, 2),
        dialogues: recentDialogues,
        dialogue: recentDialogues[0] || "林子里暂时没有新的回应。",
        attitude: narrative.attitude
      },
      dialoguesExpanded: false,
      footer: "数量、健康和朋友的一生都会随你的巡护选择持续变化。"
    };
  }

  openSpeciesProfile(speciesId) {
    const detail = this.buildSpeciesProfileDetail(speciesId);
    if (!detail) return;
    const onboarding = this.onboardingProgress();
    if (onboarding.active && onboarding.totalActions === 3 && ["population", "population_view"].includes(onboarding.stage)) {
      this.saveOnboardingProgress({ stage: "final_action", seen: { populationSpecies: true } });
      detail.kicker = "认识种群 · 任务完成";
      detail.footer = "下一任务已生成：回沙盘完成最后一次巡护。";
      detail.actionLabel = "回沙盘接新任务";
      detail.action = () => {
        this.infoDetailModal = null;
        this.setScreen("home");
        this.toast("新任务：完成最后一次巡护");
      };
    }
    this.selectedAnimalWorldSpecies = speciesId;
    this.infoDetailModal = detail;
    this.render();
  }

  drawSpeciesAvatar(ctx, speciesId, x, y, size) {
    const species = getSpeciesById(speciesId);
    if (!species) return;
    this.drawAnimalAvatar(ctx, { species: species.name }, x, y, size, false);
  }

  drawSpeciesSelector(ctx, x, y, w, unlocked, lockedIds, reserve, reserveLevel) {
    const totalPop = unlocked.reduce((sum, sp) => sum + this.displayReserveNumber(`species:${sp.id}`, speciesPopulation(reserve, sp.id)), 0);
    // 头像是种群页的第一识别信息。使用两列大图卡，不再为了九宫格
    // 把动物压成小徽章；更多物种通过分页承载。
    const cols = 2;
    const gap = 8;
    const cardW = Math.floor((w - gap * (cols - 1)) / cols);
    const cardH = 82;
    const concernedSpecies = unlocked.filter((sp) => ["↓", "⚠"].includes(speciesStatus(reserve, sp.id, reserve.migration || {}).trend));
    const concernCount = concernedSpecies.length;
    const summaryH = 54;
    this.roundRect(ctx, x, y + 2, w, summaryH, 16, "rgba(20,35,29,.09)");
    this.roundRect(ctx, x, y, w, summaryH, 16, UI_THEME.surface, UI_THEME.separator);
    this.text(ctx, "种群总览", x + 14, y + 17, 11, "#1c3325", "700");
    this.text(ctx, "生态关系 ›", x + w - 12, y + 17, 10, "#8b6f2a", "700", "right");
    this.addHit(x + w - 102, y + 1 - this.scrollY, 96, 30, () => {
      this.infoDetailModal = this.buildFoodChainDetail();
      this.render();
    });
    const summaryItems = [
      { label: "物种", value: unlocked.length, color: "#1f7a52" },
      { label: "动物", value: totalPop, color: "#1c3325" },
      { label: "需关注", value: concernCount, color: concernCount ? "#c45b42" : "#1f7a52" }
    ];
    const summaryW = (w - 24) / 3;
    summaryItems.forEach((item, index) => {
      const sx = x + 12 + index * summaryW;
      if (index === 2 && concernCount) {
        this.roundRect(ctx, sx + 4, y + 23, summaryW - 8, 26, 10, "rgba(255,232,218,.92)", "rgba(196,71,53,.32)");
      }
      if (index) {
        ctx.fillStyle = "rgba(36,64,46,.12)";
        ctx.fillRect(sx, y + 25, 1, 20);
      }
      this.text(ctx, index === 2 && concernCount ? "需关注 ›" : item.label, sx + 10, y + 40, 9, index === 2 && concernCount ? "#a84232" : "#66715f", "700");
      const valueSize = this.fitTextSize(ctx, String(item.value), summaryW - 48, 17, 13, "700");
      this.text(ctx, String(item.value), sx + summaryW - 10, y + 44, valueSize, item.color, "700", "right");
    });
    const concernTarget = concernedSpecies[0] || null;
    if (concernTarget) {
      const concernX = x + 12 + summaryW * 2;
      this.addHit(concernX + 2, y + 20 - this.scrollY, summaryW - 4, 32, () => {
        const targetIndex = unlocked.findIndex((sp) => sp.id === concernTarget.id);
        this.speciesPage = Math.max(0, Math.floor(targetIndex / 6));
        this.openSpeciesProfile(concernTarget.id);
      });
    }
    this.renderedSpeciesSummary = {
      species: unlocked.length,
      animals: totalPop,
      concern: concernCount,
      valueSize: 17,
      h: summaryH,
      concernAction: !!concernTarget,
      concernTargetId: concernTarget && concernTarget.id,
      foodChainAction: true
    };
    y += summaryH + 8;

    const activeIds = unlocked.map(sp => sp.id);
    const pageSize = 6;
    const pageCount = Math.max(1, Math.ceil(activeIds.length / pageSize));
    this.speciesPage = Math.max(0, Math.min(pageCount - 1, this.speciesPage || 0));
    const visibleIds = activeIds.slice(this.speciesPage * pageSize, this.speciesPage * pageSize + pageSize);
    const rows = Math.ceil(visibleIds.length / cols);
    this.renderedSpeciesCards = [];
    visibleIds.forEach((id, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = x + col * (cardW + gap), cy = y + row * (cardH + gap);
      const sp = SPECIES_DB[id]; if (!sp) return;
      const active = id === this.selectedAnimalWorldSpecies;
      const pop = speciesPopulation(reserve, id);
      const displayPop = this.displayReserveNumber(`species:${id}`, pop);
      const st = speciesStatus(reserve, id, reserve.migration || {});
      const trendVisual = st.trend === "↑"
        ? { label: "↑", color: "#1f8a55", fill: "#e1f4e8" }
        : st.trend === "↓"
          ? { label: "↓", color: "#c44735", fill: "#fde7df" }
          : st.trend === "⚠"
            ? { label: "!", color: "#d28718", fill: "#fff0cf" }
            : { label: "→", color: "#8b7355", fill: "#eee8dc" };
      this.roundRect(ctx, cx, cy + 2, cardW, cardH, 14, "rgba(20,35,29,.09)");
      this.roundRect(ctx, cx, cy, cardW, cardH, 14, active ? "rgba(237,247,241,.98)" : UI_THEME.surface, active ? "rgba(47,125,98,.52)" : UI_THEME.separator);
      if (active) this.roundRect(ctx, cx + 10, cy + 2, cardW - 20, 3, 2, UI_THEME.tint);

      const avatarSize = Math.max(56, Math.min(70, Math.floor(cardW * .40)));
      const avatarR = avatarSize / 2;
      const avatarCX = cx + 10 + avatarR;
      const avatarCY = cy + cardH / 2;
      this.drawSpeciesAvatar(ctx, id, avatarCX, avatarCY, avatarSize);

      const textX = cx + 16 + avatarSize;
      const trendW = cardW < 150 ? 22 : 24;
      const trendX = cx + cardW - trendW - 7;
      const textW = Math.max(28, cardW - (textX - cx) - 8);
      const titleSize = this.fitTextSize(ctx, sp.name, textW, 14, 11, "700");
      this.text(ctx, this.truncateTextToWidth(ctx, sp.name, textW, titleSize, "700"), textX, cy + 29, titleSize, UI_THEME.ink, "700");
      const actualDelta = this.reserveDisplayDelta(`species:${id}`, pop);
      const trendText = actualDelta ? this.signed(actualDelta) : trendVisual.label;
      const popW = Math.max(22, trendX - textX - 4);
      const popSize = this.fitTextSize(ctx, String(displayPop), popW, 21, 14, "700");
      this.text(ctx, String(displayPop), textX, cy + 62, popSize, trendVisual.color, "700");
      const trendY = cy + 44;
      const trendSize = this.fitTextSize(ctx, trendText, trendW - 5, 12, 9, "700");
      this.roundRect(ctx, trendX, trendY, trendW, 24, 10, trendVisual.fill, "rgba(57,78,66,.14)");
      this.text(ctx, trendText, trendX + trendW / 2, trendY + 17, trendSize, trendVisual.color, "700", "center");
      this.renderedSpeciesCards.push({
        id,
        name: sp.name,
        population: displayPop,
        trend: trendText,
        trendTone: trendVisual.color,
        titleSize,
        valueSize: popSize,
        layout: "twoColumnPortrait",
        avatarSize,
        avatarBounds: { x: avatarCX - avatarR, y: avatarCY - avatarR, w: avatarSize, h: avatarSize },
        textX,
        populationBounds: { x: textX, y: cy + 42, w: popW, h: 24 },
        trendBounds: { x: trendX, y: trendY, w: trendW, h: 24 },
        x: cx,
        y: cy,
        w: cardW,
        h: cardH
      });

      this.addHit(cx, cy - this.scrollY, cardW, cardH, () => this.openSpeciesProfile(id));
    });
    y += rows * (cardH + gap) + 8;

    if (pageCount > 1) {
      const pagerH = 36;
      const previousEnabled = this.speciesPage > 0;
      const nextEnabled = this.speciesPage < pageCount - 1;
      const drawPagerButton = (px, label, enabled, onTap) => {
        this.roundRect(ctx, px, y, 40, 32, 12, enabled ? UI_THEME.tint : "rgba(227,231,227,.96)", UI_THEME.separator);
        this.text(ctx, label, px + 20, y + 22, 18, enabled ? "#fff8df" : "#9aa093", "700", "center");
        this.addHit(px - 2, y - 2 - this.scrollY, 44, 36, () => { if (enabled) onTap(); });
      };
      drawPagerButton(x, "‹", previousEnabled, () => this.changeSpeciesPage(-1));
      drawPagerButton(x + w - 40, "›", nextEnabled, () => this.changeSpeciesPage(1));
      this.roundRect(ctx, x + 48, y + 2, w - 96, 30, 13, UI_THEME.surface, UI_THEME.separator);
      this.text(ctx, `${this.speciesPage + 1}/${pageCount} · 共${activeIds.length}种`, x + w / 2, y + 21, 11, UI_THEME.ink, "700", "center");
      this.renderedSpeciesPagination = { page: this.speciesPage, pageCount, pageSize, visible: visibleIds.length, x, y, w, h: pagerH };
      y += pagerH + 6;
    } else {
      this.renderedSpeciesPagination = { page: 0, pageCount: 1, pageSize, visible: visibleIds.length, x, y, w, h: 0 };
    }

    if (lockedIds.length) {
      const nextLevel = Math.min(...lockedIds.map((id) => (SPECIES_DB[id] || {}).unlockLevel || 99));
      const nextSpecies = lockedIds.map((id) => SPECIES_DB[id]).filter((sp) => sp && sp.unlockLevel === nextLevel);
      const rowH = 46;
      this.roundRect(ctx, x, y + 3, w, rowH, 13, "rgba(8,26,18,.08)");
      this.roundRect(ctx, x, y, w, rowH, 13, "rgba(232,236,226,.94)", "rgba(100,114,103,.22)");
      this.roundRect(ctx, x + 10, y + 9, 28, 28, 10, "rgba(180,175,170,.20)");
      this.text(ctx, "?", x + 24, y + 29, 14, "#87938a", "700", "center");
      this.text(ctx, `Lv.${nextLevel} 将出现 ${nextSpecies.length} 种`, x + 48, y + 18, 11, "#526157", "700");
      const names = nextSpecies.map((sp) => sp.name).join("、");
      this.text(ctx, this.truncateTextToWidth(ctx, names, w - 126, 10, "400"), x + 48, y + 35, 10, "#7c867e", "400");
      this.text(ctx, `查看 ›`, x + w - 12, y + 28, 10, "#6d776f", "700", "right");
      const lockedHitY = y - this.scrollY;
      const contentViewportBottom = this.height - this.navHeight() - 4;
      // 小屏首帧可能只露出锁定预览的上沿；等用户滚动到完整可见后再
      // 启用点击，避免它与固定底部导航争夺触控区域。
      if (lockedHitY + rowH <= contentViewportBottom) {
        this.addHit(x, lockedHitY, w, rowH, () => this.openLockedSpeciesOverview(nextLevel, nextSpecies));
      }
      this.renderedLockedSpeciesSummary = { level: nextLevel, count: nextSpecies.length, remaining: lockedIds.length, x, y, w, h: rowH };
      y += rowH + 4;
    } else {
      this.renderedLockedSpeciesSummary = null;
    }
    return y + 4;
  }

  changeSpeciesPage(delta) {
    const reserve = (this.state.world || {}).reserve || {};
    const level = ((reserve.progression || {}).level) || 1;
    const count = getUnlockedSpecies(level).length;
    const pageCount = Math.max(1, Math.ceil(count / 6));
    const next = Math.max(0, Math.min(pageCount - 1, (this.speciesPage || 0) + delta));
    if (next === this.speciesPage) return false;
    this.speciesPage = next;
    this.render();
    return true;
  }

  openLockedSpeciesOverview(level, speciesList) {
    const list = (speciesList || []).filter(Boolean);
    this.infoDetailModal = {
      kicker: "下一章物种",
      title: `Lv.${level} 将出现 ${list.length} 种`,
      icon: "claw",
      items: list.slice(0, 6).map((sp) => {
        const role = ECO_ROLES[sp.ecoRole];
        const strength = this.shortGameText((sp.strengths || [])[0] || "生态适应", 12);
        return {
          tag: `T${sp.tier || "?"}`,
          title: sp.name,
          body: `${role ? role.label : "生态成员"} · ${strength}`
        };
      }),
      footer: "达到对应保护区等级后进入沙盘与种群统计。"
    };
    this.render();
  }

drawSpeciesProfileCard(ctx, x, y, w, sp, pop, status, importance, ecoRole, sensitivity, dialogue, reserve) {
    const cardH = 332;
    this.roundRect(ctx, x, y + 2, w, cardH, 10, "rgba(0,0,0,0.06)");
    this.roundRect(ctx, x, y, w, cardH, 10, "rgba(255,255,255,0.92)", "rgba(200,180,150,0.25)");
    const roleColor = ecoRole ? ecoRole.color : "#8b7355";
    const roleBg = ecoRole ? ecoRole.bg : "rgba(200,180,150,0.20)";

    // ── 头部：头像 + 名称 + 状态 ──
    this.roundRect(ctx, x + 14, y + 14, 48, 48, 12, roleBg, roleColor);
    this.drawUiIcon(ctx, ecoRole ? ecoRole.icon : "eye", x + 38, y + 38, 22, true, 0.85);
    this.text(ctx, sp.name, x + 74, y + 22, 20, "#1c3325", "700");
    this.text(ctx, (ecoRole ? ecoRole.label : "") + " · " + (sensitivity ? sensitivity.label : ""), x + 74, y + 40, 10, "#8b7355", "400");
    const trendColor = status.trend === "↑" ? "#27ae60" : status.trend === "↓" ? "#c0392b" : status.trend === "⚠" ? "#e67e22" : "#8b7355";
    const populationKey = `species:${sp.id}`;
    const displayPopulation = this.displayReserveNumber(populationKey, pop);
    this.text(ctx, displayPopulation + "只 " + status.trend + " " + status.status, x + 74, y + 58, 14, trendColor, "700");
    this.drawChangeTag(ctx, x + w - 14, y + 53, this.reserveDisplayDelta(populationKey, pop), "right", { key: populationKey });
    if (importance) {
      this.roundRect(ctx, x + w - 66, y + 14, 52, 38, 8, "rgba(240,211,118,0.10)", "rgba(240,211,118,0.22)");
      this.text(ctx, "重要性", x + w - 40, y + 26, 9, "#8b7355", "700", "center");
      this.text(ctx, importance.level, x + w - 40, y + 46, 14, importance.score >= 70 ? "#c0392b" : importance.score >= 50 ? "#e67e22" : "#27ae60", "700", "center");
    }

    // ── 保护区状态反馈 ──
    const safety = (reserve || {}).safety || 50;
    const ecology = typeof (reserve || {}).ecologyScore === "number" ? reserve.ecologyScore : ((reserve || {}).stability || 50);
    const business = typeof (reserve || {}).business === "number" ? reserve.business : 50;
    const poachers = (reserve || {}).poacherPressure || 30;
    const eco = (reserve || {}).ecology || {};
    const water = eco.water || 60; const grass = eco.grass || 60; const disease = eco.disease || 10;

    // 根据物种敏感型生成反馈
    const sens = MACRO_SENSITIVITY[sp.sensitivity] || {};
    let feedback = "";
    if (sp.sensitivity === "safety_sensitive") {
      feedback = poachers > 50 ? "边界不安全，我们不敢走固定路线" : safety < 50 ? "安全感不够，边缘的同伴在考虑搬家" : "安全还行，幼崽敢多低头吃两口了";
    } else if (sp.sensitivity === "ecology_sensitive") {
      feedback = water < 48 ? "水不够，每天都要多跑很远" : grass < 48 ? "草场吃紧，嫩草越来越难找" : disease > 28 ? "有生病的味道，我们绕开了" : "水草还够，今天过得去";
    } else if (sp.sensitivity === "intel_type") {
      feedback = poachers > 50 ? "坏消息在树冠上传得很快，你得接住" : safety < 50 ? "消息网变薄了，回应变少了" : "情报网还在，消息传得动";
    } else {
      feedback = safety < 50 ? "整体感觉不太安全" : "目前还算稳定";
    }

    this.roundRect(ctx, x + 14, y + 82, w - 28, 40, 8, "rgba(240,211,118,0.08)", "rgba(240,211,118,0.14)");
    this.text(ctx, "对保护区的反馈", x + 24, y + 96, 9, "#8b6f2a", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, "\"" + feedback + "\"", w - 48, 11, "400"), x + 24, y + 114, 11, "#5a4a3a", "400");

    // ── 你认识的朋友 ──
    const friends = individualsForSpecies(this.state.world || {}, sp.id).slice(0, 2);
    this.text(ctx, "你认识的朋友", x + 14, y + 138, 10, "#8b7355", "700");
    const friendW = (w - 36) / 2;
    friends.forEach((friend, index) => {
      const fx = x + 14 + index * (friendW + 8);
      const statusText = individualDisplayStatus(friend);
      const axes = relationshipAxes(friend);
      const statusColor = friend.status === "dead" || friend.status === "departed" || friend.health < 46 ? "#c45b42" : friend.status === "independent" ? "#2f7c8f" : friend.rarity ? "#b07a16" : "#1f7a52";
      this.roundRect(ctx, fx, y + 146, friendW, 36, 8, friend.rarity ? "#fff0c7" : "#f7f0dc", friend.rarity ? "rgba(216,174,62,0.52)" : "rgba(139,111,42,0.18)");
      this.text(ctx, this.truncateTextToWidth(ctx, friend.name, friendW - 58, 11, "700"), fx + 10, y + 162, 11, "#1c3325", "700");
      this.text(ctx, this.truncateTextToWidth(ctx, `安全${axes.security} · 野性${axes.wildness}`, friendW - 18, 9, "700"), fx + 10, y + 176, 9, "#66715f", "700");
      this.text(ctx, statusText, fx + friendW - 8, y + 169, 9, statusColor, "700", "right");
      this.addHit(fx, y + 146 - this.scrollY, friendW, 36, () => this.openNamedIndividual(friend));
    });

    // ── 最近对话 ──
    const dialogues = sp.dialogues || {};
    const allDlg = [...(dialogues.safety_low || []), ...(dialogues.safety_ok || []), ...(dialogues.ecology_low || []), ...(dialogues.ecology_ok || []), ...(dialogues.calm || []), ...(dialogues.threat || [])];
    const recent = allDlg.slice(0, 2);
    this.text(ctx, "最近对话", x + 14, y + 200, 10, "#8b7355", "700");
    recent.forEach((d, i) => {
      const dy = y + 208 + i * 28;
      this.roundRect(ctx, x + 14, dy, w - 28, 24, 6, "rgba(255,255,255,0.70)", "rgba(200,180,150,0.12)");
      this.text(ctx, this.truncateTextToWidth(ctx, "\"" + d + "\"", w - 48, 11, "400"), x + 22, dy + 17, 11, "#493b30", "400");
    });

    // ── 对守护者的态度 ──
    const rep = sp.representative || {};
    const trust = Math.round((safety + ecology + business) / 3);
    let attitude = "";
    if (trust >= 70) attitude = rep.name + "说：你做得不错，我们愿意留下来。";
    else if (trust >= 50) attitude = rep.name + "说：还在观察你，别让我们失望。";
    else attitude = rep.name + "说：上一个巡护员也说要保护我们...";

    const attY = y + 274;
    this.roundRect(ctx, x + 14, attY, w - 28, 34, 8, "rgba(28,51,37,0.06)", "rgba(28,51,37,0.12)");
    this.text(ctx, "对守护者的态度", x + 24, attY + 14, 9, "#1c3325", "700");
    this.text(ctx, this.truncateTextToWidth(ctx, attitude, w - 48, 10, "400"), x + 24, attY + 30, 10, "#3d2b1a", "400");

    return y + cardH + 6;
  }

  drawAnimalWorldChapterHero(ctx, chapter, progress) {
    const topInset = this.compactStageTop();
    const y = topInset;
    const h = 36;
    if (topInset > 0) {
      this.roundRect(ctx, 0, 0, this.width, topInset, 0, UI_THEME.forest800);
    }
    this.drawStagePill(ctx, 12, y + 4, this.width - 24, chapter, progress);
    return y + h;
  }

  emptyAW(ctx, text, y) {
    this.text(ctx, text, this.width / 2, y, 13, "#8b7355", "400", "center");
  }
}

module.exports = {
  Game
};
