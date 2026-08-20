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
assert(Object.values(counts).every((count) => count >= 1 && count <= 3), "visual groups must stay readable at one to three animals");
assert(Object.values(counts).some((count) => count > 1), "a populated reserve must show at least one visible animal group");

const camera = game.mapCameraInfo(0, 0, 375, 500);
reserve.ecology.water = 78;
reserve.ecology.grass = 76;
reserve.poacherPressure = 72;
game.drawSeasonMapDynamics(game.ctx, camera, false);
assert(game.renderedSeasonTerrain.waterTier === "high" && game.renderedSeasonTerrain.grassTier === "high", "sandbox terrain must expose ecology tiers");
assert(game.renderedSeasonTerrain.waterFeatures.length === 4, "abundant water must visibly expand into four water features");
assert(game.renderedSeasonTerrain.vegetationPatches.length >= 18, "lush grass must visibly increase vegetation density");
assert(game.renderedSeasonTerrain.poacherWarning && game.renderedSeasonTerrain.poacherWarning.style === "edge-vignette", "high poaching pressure must create an edge warning");

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
const comparison = game.neighborSafetyComparison(after);
assert(comparison && /%/.test(comparison.text) && /保护区/.test(comparison.text), "patrol settlement must include a labeled safety comparison");

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

console.log("achievement feedback check ok");
