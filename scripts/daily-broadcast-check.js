const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");

function state() {
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

function check(view, label) {
  if (!view.todayImpact || !Array.isArray(view.todayImpact.effects)) throw new Error(`${label} missing today impact`);
  if (view.todayImpact.effects.length < 1 || view.todayImpact.effects.length > 3) {
    throw new Error(`${label} today impact should have 1-3 effects`);
  }
  if (!Array.isArray(view.broadcasts) || view.broadcasts.length !== 3) {
    throw new Error(`${label} should produce exactly 3 broadcasts`);
  }
  const types = view.broadcasts.map((item) => item.type).join("/");
  if (types !== "weather/change/animal") throw new Error(`${label} broadcasts should be weather/change/animal, got ${types}`);
  view.broadcasts.forEach((item) => {
    if (!item.title || !item.body || !item.action) throw new Error(`${label} broadcast missing title/body/action`);
  });
}

check(createInitialWorld().reserveView, "initial");
check(simulateDay("修复东部河岸湿地的水源和草场", state()).world.reserveView, "after action");

console.log("daily broadcast check ok");
