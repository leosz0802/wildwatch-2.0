const assert = require("assert");
const { Game } = require("../js/game");
const { createInitialWorld } = require("../js/world");
const { worldEventDefinition } = require("../js/worldEventSystem");

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

for (const type of ["wildfire", "flash_flood", "disease_outbreak", "poacher_ring", "neighbor_animal_dispute"]) {
  const definition = worldEventDefinition(type);
  assert(definition && definition.visualKind, `${type} must define a map visual`);
  world.reserve.emergency.active = Object.assign({ id: `${type}_test`, type }, definition, { progress: 0, target: 3, daysRemaining: 3 });
  game.drawActiveWorldEventOverlay(game.ctx, { scale: 1 }, false);
  assert(game.renderedWorldEventOverlay && game.renderedWorldEventOverlay.visualKind === definition.visualKind, `${type} overlay should render`);
  assert(game.renderedWorldEventOverlay.features.length > 0, `${type} overlay should expose visual features`);
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
