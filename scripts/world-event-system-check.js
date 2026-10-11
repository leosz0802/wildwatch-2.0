const { createInitialWorld } = require("../js/world");
const { buildReserveView } = require("../js/reserveView");
const { Game } = require("../js/game");
const { WORLD_EVENT_DEFINITIONS, worldEventDefinition, worldEventTriggerType, EVENT_TRIGGER_GAP_MS } = require("../js/worldEventSystem");

function assert(value, message) {
  if (!value) throw new Error(message);
}

const types = Object.keys(WORLD_EVENT_DEFINITIONS);
assert(types.length >= 7, "the reserve should contain a meaningful mix of poaching, natural and community events");
types.forEach((type) => {
  const definition = worldEventDefinition(type);
  assert(definition.title && definition.regionId && definition.visualKind && definition.impact, `${type} needs a complete map presentation`);
  assert(definition.responses.length === 1, `${type} should offer a single executable response`);
  assert(definition.responses.every((response) => response.action && response.label && response.preview), `${type} response routes need executable actions and clear tradeoffs`);
});

const base = createInitialWorld().reserve;
assert(EVENT_TRIGGER_GAP_MS === 20 * 1000, "chapter event rotation gap must be 20 seconds");
base.progression = Object.assign({}, base.progression || {}, {
  activeSeconds: ((((base.progression || {}).chapterStart || {}).activeSeconds) || 0) + 20
});
function afterChapterRealEvent(reserve) {
  return Object.assign({}, reserve, {
    emergency: Object.assign({}, reserve.emergency || {}, { realNatureChapter: 1, realNatureChapterCount: 2 })
  });
}
assert(/^real_nature_/.test(worldEventTriggerType(Object.assign({}, base, { poacherPressure: 70 }), { name: "雨季" }, () => .99)), "chapter one must latch a real event even under poacher pressure");
assert(worldEventTriggerType(afterChapterRealEvent(Object.assign({}, base, { poacherPressure: 70 })), { name: "雨季" }, () => .99) === "poacher_ring", "high poaching pressure should deterministically trigger a border event");
const realType = worldEventTriggerType(Object.assign({}, base, { poacherPressure: 5, social: { pressure: 0 } }), { name: "雨季" }, () => .99);
assert(/^real_nature_/.test(realType), "generic nature pressure should be replaced by a reviewed real event");
assert(worldEventDefinition(realType).categoryLabel === "保护区野外实录" && worldEventDefinition(realType).responses.length === 1, "real events need the field-record category and a single response route");
assert(worldEventTriggerType(afterChapterRealEvent(Object.assign({}, base, { poacherPressure: 5, ecology: Object.assign({}, base.ecology, { water: 48, disease: 28 }) })), { name: "雨季" }, () => .01) === "water_contamination", "low usable water plus disease should be able to trigger contamination");
assert(worldEventTriggerType(afterChapterRealEvent(Object.assign({}, base, { poacherPressure: 52, ecology: Object.assign({}, base.ecology, { disease: 5 }) })), { name: "雨季" }, () => .01) === "snare_line", "moderate poaching pressure should be able to surface a snare field before a full border breach");
assert(worldEventTriggerType(afterChapterRealEvent(Object.assign({}, base, { poacherPressure: 5, coreResources: Object.assign({}, base.coreResources, { community: 20 }) })), { name: "雨季" }, () => .01) === "community_blockade", "low community support should be able to create a non-animal social event");
const visitorPressure = afterChapterRealEvent(Object.assign({}, base, { poacherPressure: 5, ecology: Object.assign({}, base.ecology, { disease: 5 }), development: { operations: { today: { trouble: "游客越过标线" } } } }));
assert(worldEventTriggerType(visitorPressure, { name: "雨季" }, () => .01) === "visitor_conflict", "visitor trouble must be able to create a visitor narrative event");
assert(worldEventDefinition("visitor_conflict").source === "visitor", "visitor events must retain their narrative source");
const neighborPressure = afterChapterRealEvent(Object.assign({}, base, { poacherPressure: 5, ecology: Object.assign({}, base.ecology, { disease: 5 }), social: { pressure: 2 } }));
assert(worldEventTriggerType(neighborPressure, { name: "雨季" }, () => .01) === "neighbor_animal_dispute", "other reserves must be able to create a neighboring-reserve narrative event");
assert(worldEventDefinition("neighbor_animal_dispute").source === "neighbor", "neighbor events must retain their narrative source");

const wildfire = worldEventDefinition(realType);
const reserve = createInitialWorld().reserve;
reserve.emergency.active = Object.assign({ id: "real_event_test", type: realType, progress: 1, daysRemaining: 2 }, wildfire, {
  responses: wildfire.responses.map((item) => Object.assign({}, item))
});
const view = buildReserveView(reserve, reserve, { day: 9, season: "旱季", weather: "晴" });
const marker = view.mapMarkers.find((item) => item.type === "crisis");
assert(marker && marker.visualKind === wildfire.visualKind && marker.responseOptions.length === 1, "active world events should reach the map marker with visual and response metadata");

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
assert(game.renderedWorldEventOverlay && game.renderedWorldEventOverlay.visualKind === wildfire.visualKind, "real events should render as a physical map overlay");
assert(game.renderedWorldEventOverlay.features.length > 0, "real-event overlay should contain visible features rather than text only");
const detail = game.buildWatchClueDetail({ source: "marker", marker, view });
assert(detail.actionLabel && typeof detail.action === "function" && !(detail.choices && detail.choices.length), "opening an event marker should expose a single playable action");
assert(detail.items.some((item) => item.tag === "方案"), "event detail should explain the remaining action before the player acts");

console.log("world event system check ok");
