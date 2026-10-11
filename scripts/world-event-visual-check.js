const assert = require("assert");
const { Game } = require("../js/game");
const { createInitialWorld } = require("../js/world");
const { worldEventDefinition } = require("../js/worldEventSystem");
const { REAL_NATURE_EVENT_DEFINITIONS } = require("../js/realNatureEventSystem");

function context() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, { get(target, key) {
    if (key === "createRadialGradient" || key === "createLinearGradient") return () => gradient;
    if (key === "measureText") return (value) => ({ width: String(value || "").length * 7 });
    if (!(key in target)) target[key] = () => {};
    return target[key];
  }});
}

const game = Object.create(Game.prototype);
const world = createInitialWorld();
game.state = { world };
game.ctx = context();
game.animT = () => 1200;
game.findRegion = (id) => ({ id, x: .5, y: .5 });
game.mapPoint = (x, y) => ({ x: 180 + x * 20, y: 260 + y * 20 });
game.addMapRectHit = () => {};
game.roundRect = () => {};
game.text = () => {};
game.drawGroundTrailStep = () => {};
game.drawRangerMapCharacter = () => {};
game.drawTouristMapCharacter = () => {};
game.width = 375;

const realTypes = Object.keys(REAL_NATURE_EVENT_DEFINITIONS).slice(0, 5);
for (const type of realTypes.concat(["poacher_ring", "neighbor_animal_dispute"])) {
  const definition = worldEventDefinition(type);
  assert(definition && definition.visualKind, `${type} must define a map visual`);
  world.reserve.emergency.active = Object.assign({ id: `${type}_test`, type }, definition, { progress: 0, target: 3, daysRemaining: 3 });
  game.drawActiveWorldEventOverlay(game.ctx, { scale: 1 }, false);
  assert(game.renderedWorldEventOverlay && game.renderedWorldEventOverlay.visualKind === definition.visualKind, `${type} overlay should render`);
  assert(game.renderedWorldEventOverlay.features.length > 0, `${type} overlay should expose visual features`);
  assert(game.renderedWorldEventOverlay.markerStyle === "balloon"
    && game.renderedWorldEventOverlay.features.some((feature) => feature.type === "event-balloon"), `${type} must use the compact balloon task marker`);
  assert(game.renderedWorldEventOverlay.grounded && game.renderedWorldEventOverlay.hitCoversRegion, `${type} must sit on a clearing and expose the halo as a hit`);
  const regionHit = game.renderedWorldEventOverlay.regionHit;
  const halo = game.renderedWorldEventOverlay.features.find((feature) => feature.type === "risk-zone")
    || game.renderedWorldEventOverlay.features.find((feature) => feature.x != null);
  assert(regionHit && regionHit.w >= 90 && regionHit.h >= 70, `${type} region hit must cover the halo, not just the balloon`);
  assert(halo && regionHit.x <= halo.x && regionHit.x + regionHit.w >= halo.x && regionHit.y <= halo.y && regionHit.y + regionHit.h >= halo.y, `${type} halo must stay inside the tappable region`);
  assert(game.mapEventBalloonHit && game.mapEventBalloonHit.w >= regionHit.w - 1 && game.mapEventBalloonHit.h >= regionHit.h - 1, `${type} map hit must use the whole region`);
  (game.mapEventGraphicHits || []).forEach((hit) => {
    assert(hit.w <= 180 && hit.h <= 150, `${type} task hit must stay on the mark or the balloon, not the gap between them`);
  });
}

// The emergency task balloon is a tappable prompt, so its anchor must remain
// fixed while the warning artwork continues to animate underneath it.
const anchoredType = realTypes[0];
world.reserve.emergency.active = Object.assign({ id: "anchored_prompt", type: anchoredType }, worldEventDefinition(anchoredType), { progress: 0, target: 3, daysRemaining: 3 });
game.animT = () => 1200;
game.drawActiveWorldEventOverlay(game.ctx, { scale: 1 }, false);
const firstBalloon = game.renderedWorldEventOverlay.features.find((feature) => feature.type === "event-balloon");
game.animT = () => 2200;
game.drawActiveWorldEventOverlay(game.ctx, { scale: 1 }, false);
const secondBalloon = game.renderedWorldEventOverlay.features.find((feature) => feature.type === "event-balloon");
assert(firstBalloon && secondBalloon, "anchored emergency prompt must render a balloon");
assert.strictEqual(secondBalloon.x, firstBalloon.x, "emergency prompt must keep a stable x anchor");
assert.strictEqual(secondBalloon.y, firstBalloon.y, "emergency prompt must keep a stable y anchor");

game.mapViewport = { x: 0, y: 0, w: 375, h: 600 };
game.scrollY = 0;
game.mapTaskPromptRects = [];
world.reserve.emergency.active = Object.assign({ id: "neighbor_gap", type: "neighbor_animal_dispute" }, worldEventDefinition("neighbor_animal_dispute"), { progress: 0, target: 3, daysRemaining: 3 });
game.drawActiveWorldEventOverlay(game.ctx, { scale: 1 }, false);
const gapHits = game.mapEventGraphicHits || [];
assert(gapHits.length >= 2, "邻区事件必须分别点中地面标记和气泡");
const covers = (x, y) => gapHits.some((hit) => x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h);
const mark = gapHits[0];
const bubble = gapHits[1];
if (Math.abs((mark.y + mark.h / 2) - (bubble.y + bubble.h / 2)) > 80) {
  const gapY = (mark.y + mark.h + bubble.y) / 2;
  assert(!covers(mark.x + mark.w / 2, gapY), "地面标记和气泡之间的动物不能被任务点选区盖住");
}

for (const type of ["visitor_conflict", "visitor_litter", "visitor_queue"]) {
  const definition = worldEventDefinition(type);
  assert(definition && definition.visualKind, `${type} must define a map visual`);
  world.reserve.emergency.active = Object.assign({ id: `${type}_graphic`, type }, definition, { progress: 0, target: 1, daysRemaining: 1 });
  game.drawActiveWorldEventOverlay(game.ctx, { scale: 1 }, false);
  assert(game.renderedWorldEventOverlay && game.renderedWorldEventOverlay.markerStyle === "graphic", `${type} must keep the graphic sandbox reminder`);
  assert(game.renderedWorldEventOverlay.features.some((feature) => feature.type === "visitor-zone"), `${type} must expose the visitor event zone`);
  assert(!game.renderedWorldEventOverlay.features.some((feature) => feature.type === "event-balloon"), `${type} must not add a second text balloon`);
  assert(game.mapEventBalloonHit && game.mapEventBalloonHit.w > 0, `${type} graphic zone must be tappable`);
}

world.reserve.emergency.active = null;
world.reserve.emergency.cooldown = 0;
world.reserve.emergency.lastTriggerAction = 100;
world.reserve.progression.level = 3;
world.reserve.progression.totalActions = 100;
const { advanceIdleEmergency } = require("../js/simulator");
const blocked = advanceIdleEmergency(world.reserve, { name: "雨季" }, Date.now(), () => 0.01);
assert(blocked === null, "event scheduler must not start an event before its idle window");

console.log("world event visual/frequency check ok");
