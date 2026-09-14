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

game.gesture = null;
game.screen = "collection";
game.screenChangedAt = -1000;
if (game.targetFrameMs() < 150) {
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
game.mapAnimalVisualGroupCounts(cachedRoster, game.state.world.reserve || {});
if (eventReads !== 1) {
  throw new Error(`animal group sizing should share one event snapshot, got ${eventReads} reads`);
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
if (!/if \(!fast\) this\.resolveAnimalMotionOverlaps\(placements, camera\)/.test(gameSource)) {
  throw new Error("map drag still runs the multi-pass animal collision solver");
}
if (!/if \(!fastMapGesture && this\.wechatFriends/.test(gameSource) || !/if \(!fastMapGesture && this\.cloudService/.test(gameSource)) {
  throw new Error("map drag still performs cloud synchronization checks in the render path");
}

console.log("performance check ok");
