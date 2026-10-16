const { Game, resolveRenderDpr } = require("../js/game");

if (resolveRenderDpr({ pixelRatio: 4, benchmarkLevel: 8 }) !== 1.5) {
  throw new Error("low-end high-DPR devices should cap canvas density at 1.5");
}
if (resolveRenderDpr({ pixelRatio: 3, benchmarkLevel: 20 }) !== 2) {
  throw new Error("normal high-DPR devices should cap canvas density at 2");
}
if (resolveRenderDpr({ pixelRatio: 1, benchmarkLevel: 5 }) !== 1) {
  throw new Error("canvas density should never upscale a 1x device");
}

const bootGame = Object.create(Game.prototype);
if (typeof bootGame.bootVisualAssetsReady === "function" || typeof bootGame.drawBootVisual === "function") {
  throw new Error("cold boot should not retain a blocking splash-screen path");
}

const game = new Game();

game.screen = "home";
game.gesture = null;
if (game.targetFrameMs() < 70) {
  throw new Error(`home idle frame interval is too aggressive: ${game.targetFrameMs()}ms`);
}

game.gesture = { mapPan: true };
if (!game.isFastMapRender()) {
  throw new Error("map drag should enable fast map rendering");
}
if (game.targetFrameMs() > 20) {
  throw new Error(`map drag should target near-60fps rendering: ${game.targetFrameMs()}ms`);
}
game.gesture = { pinch: true };
if (!game.isFastMapRender() || game.targetFrameMs() > 20) {
  throw new Error("map pinch should use the same near-60fps fast path as map drag");
}
if (game.isQuietSandboxPaint()) {
  throw new Error("map pinch must not use the idle particle skip");
}

game.gesture = null;
if (!game.isQuietSandboxPaint()) {
  throw new Error("idle sandbox should skip decorative map particles");
}

game.gesture = null;
game.screen = "collection";
game.screenChangedAt = -1000;
if (game.targetFrameMs() < 1000) {
  throw new Error(`static secondary screens should avoid wasteful idle redraws: ${game.targetFrameMs()}ms`);
}
game.screen = "home";
game.scrollY = 0;
if (!game.isVisible(420, 640)) {
  throw new Error("home map should be visible near the top of the page");
}
game.scrollY = 1220;
if (game.isVisible(420, 640)) {
  throw new Error("home map should be culled when far outside the viewport");
}

// The map should build one shared event snapshot, rather than rebuilding it
// for every animal while sorting the visible roster.
let eventReads = 0;
const originalEvents = game.activeSandboxMapEvents.bind(game);
game.activeSandboxMapEvents = (...args) => {
  eventReads += 1;
  return originalEvents(...args);
};
const roster = game.visibleSandAnimals(game.state.world);
if (eventReads !== 1) {
  throw new Error(`animal priority should share one event snapshot, got ${eventReads} reads`);
}
const cachedRoster = game.sandboxAnimalRoster(game.state.world);
if (cachedRoster !== game.sandboxAnimalRoster(game.state.world)) {
  throw new Error("stable animal state should reuse the sandbox roster");
}
game.frameMemoStore = {};
const frameEvents = game.activeSandboxMapEvents(game.state.world);
if (frameEvents !== game.activeSandboxMapEvents(game.state.world)) {
  throw new Error("map event normalization should be reused within one paint");
}
const frameContext = game.mapAnimalPriorityContext(game.state.world, frameEvents);
if (frameContext !== game.mapAnimalPriorityContext(game.state.world, frameEvents)) {
  throw new Error("map animal priority context should be reused within one paint");
}
game.frameMemoStore = {};
const visibleOnce = game.visibleSandAnimals(game.state.world);
if (visibleOnce !== game.visibleSandAnimals(game.state.world)) {
  throw new Error("visible sandbox animals should be reused within one paint");
}
game.frameMemoStore = {};
if (frameEvents === game.activeSandboxMapEvents(game.state.world)) {
  throw new Error("map event cache must be scoped to one paint");
}
let storyLabelReads = 0;
const storyEvent = { regionId: "meadow", body: "水边出现脚印" };
Object.defineProperty(storyEvent, "label", {
  get() {
    storyLabelReads += 1;
    return "巡护线索";
  }
});
const storyContext = game.mapAnimalPriorityContext(game.state.world, [storyEvent]);
const storyReadsAfterContext = storyLabelReads;
cachedRoster.forEach((animal) => game.mapAnimalPriority(animal, game.state.world, null, storyContext));
if (!storyContext.storyText || storyLabelReads !== storyReadsAfterContext) {
  throw new Error("animal priority should build story event text once per frame");
}
eventReads = 0;
const groupCounts = game.mapAnimalVisualGroupCounts(cachedRoster, game.state.world.reserve || {});
if (eventReads !== 0) {
  throw new Error(`single-herd group sizing must not rescan map events, got ${eventReads} reads`);
}
if (Object.values(groupCounts).some((count) => count !== 1)) {
  throw new Error("each sandbox species should be drawn as one animal");
}

// Cached regional grouping must be pixel-equivalent to the original layout.
const layout = game.animalMapLayoutContext(roster, game.state.world);
roster.forEach((animal, index) => {
  const baseline = game.animalMapLayoutPosition(animal, index, roster);
  const optimized = game.animalMapLayoutPosition(animal, index, roster, layout);
  if (Math.abs(baseline.x - optimized.x) > 0.000001 || Math.abs(baseline.y - optimized.y) > 0.000001) {
    throw new Error(`cached layout changed ${animal.species} position`);
  }
});

// Reserve number targets are expensive to aggregate but only need a refresh
// every 160ms; interpolation still advances on every rendered frame.
let targetBuilds = 0;
const originalTargets = game.reserveDynamicTargets.bind(game);
game.reserveDynamicTargets = (...args) => {
  targetBuilds += 1;
  return originalTargets(...args);
};
game.reserveDisplayTargetCache = null;
game.reserveDisplayTargetRefreshLeft = 0;
for (let frame = 0; frame < 4; frame += 1) game.tweenDisplayReserveStats(40);
if (targetBuilds !== 1) {
  throw new Error(`display targets should be shared for 160ms, got ${targetBuilds} builds`);
}

// A touch-driven requestRender may already own the next RAF. The animation
// tick must not paint the same state a second time in that frame.
const tickGame = Object.create(Game.prototype);
tickGame.anim = { paused: false, lastTs: 1, t: 1, acc: 999, rafId: 1 };
tickGame.renderPending = true;
tickGame.tickBound = () => {};
tickGame.raf = () => 2;
tickGame.targetFrameMs = () => 40;
tickGame.tweenDisplayStats = () => {};
tickGame.tweenDisplayReserveStats = () => {};
tickGame.updateDailyHeroAutoCollapse = () => {};
let duplicatePaints = 0;
tickGame.render = () => { duplicatePaints += 1; };
tickGame.tick(42);
if (duplicatePaints !== 0) {
  throw new Error("animation tick should not duplicate an already queued touch render");
}

const fs = require("fs");
const path = require("path");
const gameSource = fs.readFileSync(path.join(__dirname, "../js/game.js"), "utf8");
if (!/if \(!lightPaint\) \{\s*this\.resolveAnimalMotionOverlaps\(placements, camera\)/.test(gameSource)
  && !/if \(!lightPaint\) this\.resolveAnimalMotionOverlaps\(placements, camera\)/.test(gameSource)) {
  throw new Error("map drag still runs the multi-pass animal collision solver");
}
if (!/const rankingSyncScreen = this\.screen === "league" \|\| this\.screen === "social"/.test(gameSource)
  || !/if \(!this\.openDataFrozen && !fastMapGesture && rankingSyncScreen && this\.wechatFriends/.test(gameSource)
  || !/if \(!fastMapGesture && rankingSyncScreen && this\.cloudService/.test(gameSource)) {
  throw new Error("render path still performs ranking synchronization without a screen gate");
}

if (!/if \(!fastMapGesture && this\.screen !== "home"\)/.test(gameSource)) {
  throw new Error("idle home still paints fireflies and page weather under the map");
}
if (!/this\.drawMapAmbientDynamics\(ctx, camera, lightPaint \|\| this\.isQuietSandboxPaint\(\)\)/.test(gameSource)) {
  throw new Error("idle sandbox still paints extra map weather particles every frame");
}
if (/movingAnimalPosition\(animal, index, habitat, \{ fast: lightPaint \}/.test(gameSource)
  || /mapVisitorPlacements\(livingReserveView, \{ fast: lightPaint \}/.test(gameSource)) {
  throw new Error("chapter 8 light paint must not freeze animals or visitors");
}
if (!/movingAnimalPosition\(animal, index, habitat, \{ fast \}/.test(gameSource)
  || !/mapVisitorPlacements\(livingReserveView, \{ fast \}/.test(gameSource)) {
  throw new Error("sandbox actors must keep moving after chapter 8 unless the map is being dragged");
}
if (/drawActiveWorldEventOverlay\(ctx, camera, lightPaint\)/.test(gameSource)
  || !/drawActiveWorldEventOverlay\(ctx, camera, fast\)/.test(gameSource)) {
  throw new Error("chapter 8 light paint must not hide fire, flood, or disease on the map");
}
if (!/cloneStateForGoalProgress/.test(gameSource) || /JSON\.parse\(JSON\.stringify\(this\.state\)\)/.test(gameSource)) {
  throw new Error("goal progress still deep-clones the full live save including reports");
}
if (!/else if \(this\.screen === "home"\)/.test(gameSource)) {
  throw new Error("drawCurrentScreen still evaluates every screen branch");
}
if (!/nativeOverlayFlushToken/.test(gameSource)
  || !/if \(modal\) this\.flushBlockingNativeOverlays\(\)/.test(gameSource)
  || !/if \(option\) this\.flushBlockingNativeOverlays\(\)/.test(gameSource)
  || !/if \(modal\) this\.flushBlockingNativeOverlays\(\);\s*if \(!modal\) return;/.test(gameSource)) {
  throw new Error("idle sandbox or archery aiming still flushes native overlays every frame");
}
if (/drawAnimalConversationSand\([\s\S]{0,180}?parkIdleOpenDataOverlay/.test(gameSource)) {
  throw new Error("home sandbox still parks the open-data overlay on every animal paint");
}

const friendSource = fs.readFileSync(path.join(__dirname, "../js/wechatFriendSystem.js"), "utf8");
if (!/\(now - \(this\.lastParkAt \|\| 0\) < 500\)/.test(friendSource)) {
  throw new Error("open-data park still reshrinks the shared canvas every frame");
}

const idleFlush = Object.create(Game.prototype);
idleFlush.infoDetailModal = null;
idleFlush.patrolTaskModal = null;
idleFlush.chapterStoryModal = null;
idleFlush.settlementModal = null;
let idleNativeIpc = 0;
idleFlush.nativeTemplateAds = { setVisible() { idleNativeIpc += 1; } };
idleFlush.gameClub = { setVisible() { idleNativeIpc += 1; } };
idleFlush.parkIdleOpenDataOverlay = () => { idleNativeIpc += 1; return true; };
idleFlush.scheduleIdleOpenDataPark = () => { idleNativeIpc += 1; return true; };
idleFlush.abandonStuckInterstitialOverlay = () => {};
idleFlush.isIosWechatClient = () => false;
idleFlush.waitingArcheryOrDiceConfirm = () => false;
idleFlush.materialOperationIgnoresOffscreenSettlement = () => false;
idleFlush.patrolFlowBlocked = () => true;
idleFlush.isScoreInputModal = () => false;
Game.prototype.drawInfoDetailModal.call(idleFlush);
Game.prototype.drawPatrolTaskModal.call(idleFlush);
Game.prototype.drawSettlementModal.call(idleFlush);
if (idleNativeIpc !== 0) {
  throw new Error("idle chapter-11 sandbox still talks to native overlays every paint");
}

const archeryFlush = Object.create(Game.prototype);
const archeryModal = { kind: "visitorIncidentDice", phase: "aiming" };
archeryFlush.infoDetailModal = archeryModal;
archeryFlush.patrolTaskModal = null;
archeryFlush.chapterStoryModal = null;
archeryFlush.settlementModal = null;
let archeryVisible = 0;
let archeryParks = 0;
archeryFlush.nativeTemplateAds = { setVisible() { archeryVisible += 1; } };
archeryFlush.gameClub = { setVisible() { archeryVisible += 1; } };
archeryFlush.parkIdleOpenDataOverlay = () => { archeryParks += 1; return true; };
archeryFlush.scheduleIdleOpenDataPark = () => { archeryParks += 1; return true; };
archeryFlush.abandonStuckInterstitialOverlay = () => {};
archeryFlush.isIosWechatClient = () => false;
archeryFlush.flushBlockingNativeOverlays();
if (archeryVisible < 1 || archeryParks < 1) {
  throw new Error("first archery frame must still park leftover native overlays");
}
const firstVisible = archeryVisible;
const firstParks = archeryParks;
archeryFlush.flushBlockingNativeOverlays();
archeryFlush.flushBlockingNativeOverlays();
if (archeryVisible !== firstVisible) {
  throw new Error("chapter-11 visitor archery still hides native ads on every aiming frame");
}
if (archeryParks <= firstParks) {
  throw new Error("same archery modal must still cheap-park an oversized open-data leftover");
}

const { tickUntreatedDisasters } = require("../js/sandboxTaskCadence");
const idleDrain = { disasterDrain: { lastTickAt: 0, pausedAt: 0 }, sandboxTaskRhythm: { visible: {} } };
tickUntreatedDisasters(idleDrain, 1000, { foreground: true });
tickUntreatedDisasters(idleDrain, 2500, { foreground: true });
if (idleDrain.disasterDrain.lastTickAt) {
  throw new Error("idle disaster drain should not keep rewriting lastTickAt");
}

console.log("performance check ok");
