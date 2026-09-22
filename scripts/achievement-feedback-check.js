function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext: createFakeContext }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { getChapterSandboxSpecies } = require("../js/animalWorld");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = new Game();
game.stopLoop();
game.state = createCharacter(null, "保护区卫士");
game.state.ui = Object.assign({}, game.state.ui || {}, { prologue: { version: 1, stage: "complete", completed: true } });
game.screen = "home";
game.render = () => {};

assert(game.ecologyVisualTier("water", 20) === "low", "water below 30 must render dry");
assert(game.ecologyVisualTier("water", 62) === "high", "water above 60 must render abundant");
assert(game.ecologyVisualTier("grass", 35) === "low", "grass below 40 must render sparse");
assert(game.ecologyVisualTier("grass", 74) === "high", "grass above 70 must render lush");

const roster = game.visibleSandAnimals(game.state.world);
const reserve = game.state.world.reserve;
const counts = game.mapAnimalVisualGroupCounts(roster, reserve);
assert(Object.keys(counts).length === roster.length, "every visible species needs a visual group count");
assert(Object.values(counts).every((count) => count >= 1 && count <= 2), "each sandbox herd may show at most two animals");
assert(roster.length <= 8, "the sandbox should keep at most eight herds on screen");
const speciesKeys = roster.map((animal) => game.sandboxSpeciesKey(animal)).filter(Boolean);
assert(speciesKeys.length === roster.length && new Set(speciesKeys).size === speciesKeys.length, "the sandbox must not place two herds of the same species");
assert(game.uniqueSandboxSpecies([
  { id: "npc_deer", species: "鹿" },
  { id: "sandbox_deer", species: "鹿" },
  { id: "npc_wolf", species: "狼" }
]).map((animal) => animal.id).join(",") === "npc_deer,npc_wolf", "duplicate species actors must collapse into one herd");
const chapterOneNames = roster.map((animal) => animal.species).sort();
assert(chapterOneNames.join(",") === ["鹿", "羚羊", "野兔", "乌鸦", "狼"].sort().join(","), "chapter 1 sandbox must show that chapter's animals plus wolf and crow");
assert(chapterOneNames.includes("狼") && chapterOneNames.includes("乌鸦"), "chapter 1 sandbox must keep wolf and crow visible");

function assertChapterSandbox(chapter, options = {}) {
  game.state.world.reserve.progression.displayChapter = chapter;
  game.state.world.reserve.progression.stage = chapter;
  game.sandboxAnimalRosterCache = null;
  if (options.lateReady) {
    game.art.animalMapSprites = Object.assign({}, game.art.animalMapSprites || {}, { loaded: true, failed: false, source: "remote" });
    if (!(game.remoteAssetCompleted instanceof Set)) game.remoteAssetCompleted = new Set();
    game.remoteAssetCompleted.add("animalMapSprites");
  }
  const allowed = new Set(getChapterSandboxSpecies(chapter).map((species) => species.name));
  const fullRoster = game.sandboxAnimalRoster(game.state.world).map((animal) => animal.species);
  const visible = game.visibleSandAnimals(game.state.world).map((animal) => animal.species);
  fullRoster.concat(visible).forEach((name) => {
    assert(allowed.has(name), `chapter ${chapter} sandbox must not show ${name}`);
  });
  assert(visible.length <= Math.min(14, Math.max(8, 6 + chapter)), `chapter ${chapter} sandbox must keep the herd cap`);
  return { allowed, fullRoster, visible };
}

const chapterFour = assertChapterSandbox(4);
assert(chapterFour.fullRoster.includes("乌鸦") && chapterFour.fullRoster.includes("狼"), "wolf and crow stay on the sandbox after chapter 1");
assert(chapterFour.fullRoster.includes("狮子") && chapterFour.fullRoster.includes("豹子"), "chapter 4 sandbox should include that chapter's animals");
assert(!chapterFour.fullRoster.includes("长颈鹿"), "chapter 4 sandbox must not show later-chapter animals");

const chapterFiveEarly = assertChapterSandbox(5);
assert(chapterFiveEarly.fullRoster.includes("乌鸦") && chapterFiveEarly.fullRoster.includes("狼"), "wolf and crow remain visible before the late atlas");
assert(chapterFiveEarly.fullRoster.includes("长颈鹿"), "chapter 5 giraffe must appear from the packaged local atlas");

const chapterFive = assertChapterSandbox(5, { lateReady: true });
assert(chapterFive.fullRoster.includes("乌鸦") && chapterFive.fullRoster.includes("长颈鹿"), "chapter 5 sandbox should include crow and giraffe after the late atlas loads");
assert(chapterFive.fullRoster.includes("狼"), "wolf stays on the sandbox in later chapters");

const chapterFourteen = assertChapterSandbox(14, { lateReady: true });
assert(chapterFourteen.fullRoster.includes("狼"), "chapter 14 sandbox can show the wolf once that chapter is unlocked");
game.state.world.reserve.progression.level = 7;
game.state.world.reserve.progression.displayChapter = 20;
game.sandboxAnimalRosterCache = null;
const lateRoster = game.visibleSandAnimals(game.state.world);
assert(lateRoster.length <= 14, "late chapters must still cap sandbox herds so animals stay tappable");
assert(new Set(lateRoster.map((animal) => game.sandboxSpeciesKey(animal))).size === lateRoster.length, "late-chapter sandbox herds must stay unique");

const camera = game.mapCameraInfo(0, 0, 375, 500);
reserve.ecology.water = 78;
reserve.ecology.grass = 76;
reserve.poacherPressure = 72;
game.drawSeasonMapDynamics(game.ctx, camera, false);
assert(game.renderedSeasonTerrain.waterTier === "high" && game.renderedSeasonTerrain.grassTier === "high", "sandbox terrain must expose ecology tiers");
assert(game.renderedSeasonTerrain.waterFeatures.length === 4, "abundant water must visibly expand into four water features");
assert(game.renderedSeasonTerrain.vegetationPatches.length === 7, "lush grass should use seven broad accents without cluttering the clear map");
assert(game.renderedSeasonTerrain.poacherWarning && game.renderedSeasonTerrain.poacherWarning.style === "edge-vignette", "high poaching pressure must create an edge warning");

reserve.mastery.habitat.xp = 40;
reserve.mastery.patrol.xp = 40;
reserve.poacherPressure = 32;
reserve.facilityConstruction.sites.migration_watch = Object.assign({}, reserve.facilityConstruction.sites.migration_watch, { buildStage: 2, buildSteps: 2 });
game.drawPersistentSandboxConsequences(game.ctx, camera, false);
const persistentTypes = game.renderedPersistentSandbox.visibleTypes;
assert(!persistentTypes.includes("restored-water-channel") && persistentTypes.includes("meadow-flower-corridor"), "habitat work should leave a meadow trace without the redundant cyan water-channel line");
assert(persistentTypes.includes("cleared-snare-line"), "successful patrol pressure must leave a cleared border trace");
assert(persistentTypes.includes("facility-path") && persistentTypes.includes("migration-signal"), "operational facilities must connect to the sandbox with paths and working signals");
assert(game.renderedPersistentSandbox.features.every((feature) => feature.permanent), "sandbox consequence traces must be marked as persistent rather than transient particles");

const animal = game.state.world.knownCharacters[0];
const detail = game.buildAnimalThoughtDetail(animal, game.createAnimalDialogueContext(animal));
assert(detail.listenMoment && detail.listenMoment.icon && detail.listenMoment.text.length <= 20, "listening must use an icon plus a short animal line");
game.drawMapAnimalActionModalContent(game.ctx, detail, 8, 100, 359, 470);
assert(detail.renderedListenMoment && detail.renderedListenMoment.iconSize >= 30, "the listening moment icon must be visually prominent");

["calmObserve", "rescueCare", "guideMigration"].forEach((actionId) => {
  const modal = {
    kind: "animalComfort", phase: "result", actionId, animal,
    config: game.animalCareProcessConfig(animal, actionId), feedbackStartedAt: Date.now() - 400,
    resultChanges: [{ label: "信任", value: "+2", tone: "good" }]
  };
  game.drawAnimalComfortContent(game.ctx, modal, 8, 100, 359, 500);
  const expected = actionId === "calmObserve" ? "trust-glow" : actionId === "rescueCare" ? "healing" : "migration-route";
  assert(modal.renderedComfort.effectType === expected, `${actionId} must have a distinct visual feedback language`);
});

const before = game.reserveSnapshot(reserve);
const after = JSON.parse(JSON.stringify(before));
after.poacherPressure = Math.max(0, before.poacherPressure - 9);
after.safety = Math.min(100, before.safety + 4);
after.pendingRecovered.recoveredTrap = (after.pendingRecovered.recoveredTrap || 0) + 1;
const story = game.patrolNarrativeStory(before, after, "antiPoacher", animal, {});
assert(/^你/.test(story.headline) && /阻止|发现/.test(story.beats.join(" ")), "patrol settlement must describe what the player changed");
reserve.league.rivals = Array.from({ length: 8 }, (_, index) => ({
  id: `real_neighbor_${index}`,
  name: `玩家${index + 1}的邻区哨站`,
  owner: `玩家${index + 1}`,
  valuation: 1800 - index * 30,
  shield: 34 + index * 4,
  scope: "world",
  simulated: false,
  source: "player"
}));
const comparison = game.neighborSafetyComparison(after);
assert(comparison && !comparison.simulated && /%/.test(comparison.text) && /保护区/.test(comparison.text), "patrol settlement must compare only against enough real player protection zones");

const replay = game.setMapPatrolReplay("antiPoacher");
assert(replay && replay.points.length >= 4, "field patrol must create a route replay");
replay.startedAt = Date.now() - 500;
replay.expiresAt = Date.now() + 600;
game.drawMapPatrolReplay(game.ctx, camera);
assert(replay.rendered && replay.rendered.routeVisible && replay.rendered.actor === "hound-team", "route replay must visibly move the hound team");

game.setMapConsequencePulse(before, after, { tone: "antiPoacher", delayMs: 1200 });
assert(game.mapConsequencePulse.startedAt > Date.now() + 1000, "numeric result must wait until route replay finishes");

const yesterday = new Date(Date.now() - 86400000);
const yesterdayKey = `${yesterday.getFullYear()}-${`${yesterday.getMonth() + 1}`.padStart(2, "0")}-${`${yesterday.getDate()}`.padStart(2, "0")}`;
game.state.ui.weeklyGuardian = { dates: [], activeDays: 6, streak: 6, lastVisitDate: yesterdayKey, lastCelebrated: 0, pending: false };
const weekly = game.recordWeeklyGuardianVisit();
assert(weekly.streak === 7 && weekly.pending, "the seventh consecutive visit must schedule a guardian celebration");

const revealModal = { breakthrough: { kind: "test" }, storyReplay: true };
const revealStart = Date.now();
game.configureSettlementReveal(revealModal, "home");
assert(revealModal.revealAt >= revealStart + 4900, "major settlement must wait until route and map feedback have finished");

game.mapPatrolReplay = { expiresAt: Date.now() + 180 };
game.mapConsequencePulse = { startedAt: Date.now(), expiresAt: Date.now() + 3800 };
const crisisModal = { breakthrough: { kind: "emergency_started", title: "偷猎团伙越界", body: "多组脚印越过边界。" }, storyReplay: true };
game.configureSettlementReveal(crisisModal, "home");
assert(crisisModal.crisisBurst && game.mapCrisisBurst && game.mapCrisisBurst.region === "西部边界", "a new crisis must schedule a region-specific sandbox burst");
assert(game.mapConsequencePulse === null && crisisModal.revealAt > game.mapCrisisBurst.expiresAt, "the crisis burst must own the map layer before its decision card appears");
game.mapCrisisBurst.startedAt = Date.now() - 500;
game.mapCrisisBurst.expiresAt = Date.now() + 900;
const crisisCamera = game.mapCrisisCameraInfo(camera);
assert(crisisCamera.crisisFocus > 0 && crisisCamera.scale > camera.scale, "crisis presentation must focus and slightly tighten the sandbox camera");
game.drawMapCrisisBurst(game.ctx, crisisCamera);
assert(game.mapCrisisBurst.rendered && game.mapCrisisBurst.rendered.mapDimmed
  && game.mapCrisisBurst.rendered.targetRing
  && game.mapCrisisBurst.rendered.titleCard
  && game.mapCrisisBurst.rendered.duration >= 1400, "crisis burst must combine map tone, target ring and short title card");
assert(game.mapZoom === 0, "crisis presentation must not leave the sandbox on a closer persistent scale");

console.log("achievement feedback check ok");
