const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");

const allowedTypes = new Set(["question", "event", "crisis", "recovery", "season"]);
const allowedKinds = new Set(["question", "exclamation", "recovery", "season"]);

function makeState() {
  return {
    world: createInitialWorld(),
    character: {
      id: "warden",
      role: "warden",
      species: "卫士",
      animalName: "保护区卫士",
      location: "中央混交林",
      stamina: 82,
      health: 92,
      status: "alive"
    },
    reports: [],
    messages: []
  };
}

function checkMarkers(markers, label, options = {}) {
  const min = options.allowEmpty ? 0 : 1;
  if (!Array.isArray(markers) || markers.length < min || markers.length > 3) {
    throw new Error(`${label} should have ${min}-3 map markers`);
  }
  markers.forEach((marker) => {
    if (!allowedTypes.has(marker.type)) throw new Error(`${label} invalid marker type ${marker.type}`);
    if (!allowedKinds.has(marker.kind)) throw new Error(`${label} invalid marker kind ${marker.kind}`);
    if (!marker.title || !marker.impact || !marker.recommendAction || !marker.unhandled) {
      throw new Error(`${label} marker should carry title/impact/recommendAction/unhandled`);
    }
    if (marker.presentation === "resource-flow") {
      if (!marker.metric || !marker.metricLabel || marker.dialogue) {
        throw new Error(`${label} resource flow should expose a metric without pretending to be animal dialogue`);
      }
    } else if (marker.type === "recovery" || marker.type === "season") {
      if (marker.dialogue) throw new Error(`${label} recovery marker should not impersonate an animal speaker`);
    } else if (!/[：:]/.test(marker.dialogue || "")) {
      throw new Error(`${label} marker dialogue should include speaker: ${marker.dialogue}`);
    }
  });
}

const initial = createInitialWorld();
checkMarkers(initial.reserveView.mapMarkers, "initial reserveView", { allowEmpty: true });
checkMarkers(initial.mapEvents, "initial world map events", { allowEmpty: true });
if (initial.reserveView.mapMarkers.length || initial.mapEvents.length) {
  throw new Error("a stable initial reserve must not fabricate an unexplained pickup or task marker");
}

const result = simulateDay("驱赶偷猎者，检查河岸直线脚印", makeState());
checkMarkers(result.world.reserveView.mapMarkers, "simulated reserveView");
checkMarkers(result.world.mapEvents.slice(-3), "simulated world map events");

console.log("map marker check ok");
