const { createInitialWorld } = require("../js/world");
const { buildReserveView } = require("../js/reserveView");
const { Game } = require("../js/game");
const { WORLD_EVENT_DEFINITIONS, worldEventDefinition, worldEventTriggerType, responseGain } = require("../js/worldEventSystem");

function assert(value, message) {
  if (!value) throw new Error(message);
}

const types = Object.keys(WORLD_EVENT_DEFINITIONS);
assert(types.length >= 7, "the reserve should contain a meaningful mix of poaching, natural and community events");
types.forEach((type) => {
  const definition = worldEventDefinition(type);
  assert(definition.title && definition.regionId && definition.visualKind && definition.impact, `${type} needs a complete map presentation`);
  assert(type === "visitor_conflict" ? definition.responses.length === 1 : definition.responses.length === 2, `${type} should offer the configured response routes`);
  assert(definition.responses.every((response) => response.action && response.label && response.preview), `${type} response routes need executable actions and clear tradeoffs`);
  if (definition.responses.length > 1) assert(responseGain({ type }, definition.responses[0].action) >= responseGain({ type }, definition.responses[1].action), `${type} primary response should be at least as effective as its alternative`);
});

const base = createInitialWorld().reserve;
assert(worldEventTriggerType(Object.assign({}, base, { poacherPressure: 70 }), { name: "雨季" }, () => .99) === "poacher_ring", "high poaching pressure should deterministically trigger a border event");
assert(worldEventTriggerType(Object.assign({}, base, { poacherPressure: 5, ecology: Object.assign({}, base.ecology, { disease: 45 }) }), { name: "雨季" }, () => .99) === "disease_outbreak", "high disease should deterministically trigger an outbreak");
assert(worldEventTriggerType(Object.assign({}, base, { poacherPressure: 5, ecology: Object.assign({}, base.ecology, { water: 32, grass: 42, disease: 5 }) }), { name: "旱季" }, () => .01) === "wildfire", "dry water and grass conditions should be able to trigger wildfire");
assert(worldEventTriggerType(Object.assign({}, base, { poacherPressure: 5, ecology: Object.assign({}, base.ecology, { water: 92, disease: 5 }) }), { name: "雨季" }, () => .01) === "flash_flood", "very high rainy-season water should be able to trigger flash flood");
assert(worldEventTriggerType(Object.assign({}, base, { poacherPressure: 5, ecology: Object.assign({}, base.ecology, { water: 48, disease: 28 }) }), { name: "雨季" }, () => .01) === "water_contamination", "low usable water plus disease should be able to trigger contamination");
assert(worldEventTriggerType(Object.assign({}, base, { poacherPressure: 52, ecology: Object.assign({}, base.ecology, { disease: 5 }) }), { name: "雨季" }, () => .01) === "snare_line", "moderate poaching pressure should be able to surface a snare field before a full border breach");
assert(worldEventTriggerType(Object.assign({}, base, { poacherPressure: 5, coreResources: Object.assign({}, base.coreResources, { community: 20 }) }), { name: "雨季" }, () => .01) === "community_blockade", "low community support should be able to create a non-animal social event");
const visitorPressure = Object.assign({}, base, { poacherPressure: 5, ecology: Object.assign({}, base.ecology, { disease: 5 }), development: { operations: { today: { trouble: "游客越过标线" } } } });
assert(worldEventTriggerType(visitorPressure, { name: "雨季" }, () => .01) === "visitor_conflict", "visitor trouble must be able to create a visitor narrative event");
assert(worldEventDefinition("visitor_conflict").source === "visitor", "visitor events must retain their narrative source");
const neighborPressure = Object.assign({}, base, { poacherPressure: 5, ecology: Object.assign({}, base.ecology, { disease: 5 }), social: { pressure: 2 } });
assert(worldEventTriggerType(neighborPressure, { name: "雨季" }, () => .01) === "neighbor_animal_dispute", "other reserves must be able to create a neighboring-reserve narrative event");
assert(worldEventDefinition("neighbor_animal_dispute").source === "neighbor", "neighbor events must retain their narrative source");

const wildfire = worldEventDefinition("wildfire");
const reserve = createInitialWorld().reserve;
reserve.emergency.active = Object.assign({ id: "wildfire_test", type: "wildfire", progress: 1, daysRemaining: 2 }, wildfire, {
  responses: wildfire.responses.map((item) => Object.assign({}, item))
});
const view = buildReserveView(reserve, reserve, { day: 9, season: "旱季", weather: "晴" });
const marker = view.mapMarkers.find((item) => item.type === "crisis");
assert(marker && marker.visualKind === "wildfire" && marker.responseOptions.length === 2, "active world events should reach the map marker with visual and response metadata");

const game = new Game();
game.state.world.reserve = reserve;
const gradient = { addColorStop() {} };
const drawingContext = new Proxy({
  createRadialGradient() { return gradient; }
}, {
  get(target, property) {
    if (property in target) return target[property];
    return () => {};
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  }
});
game.drawActiveWorldEventOverlay(drawingContext, { worldX: 0, worldY: 0, worldW: 320, worldH: 480, worldSize: 480, scale: 1 }, false);
assert(game.renderedWorldEventOverlay && game.renderedWorldEventOverlay.visualKind === "wildfire", "wildfire should render as a physical map overlay");
assert(game.renderedWorldEventOverlay.features.some((feature) => feature.type === "flame"), "wildfire overlay should contain visible fire features rather than text only");
const detail = game.buildWatchClueDetail({ source: "marker", marker, view });
assert(detail.choices && detail.choices.length === 2, "opening an event marker should expose two playable response buttons");
assert(detail.items.some((item) => item.tag === "快速方案") && detail.items.some((item) => item.tag === "稳妥方案"), "event detail should explain route tradeoffs before the player acts");

console.log("world event system check ok");
