const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");

function makeState() {
  return {
    world: createInitialWorld(),
    character: {
      id: "warden",
      role: "warden",
      animalId: "warden",
      species: "卫士",
      animalName: "保护区卫士",
      location: "中央混交林",
      stamina: 82,
      health: 92,
      status: "alive",
      statusText: "正常"
    },
    reports: [],
    messages: []
  };
}

function checkView(view, label) {
  if (!view || view.version !== "reserve-view-v2-core3") throw new Error(`${label} missing core-three reserveView`);
  const names = (view.states || []).map((item) => item.label).join("/");
  if (names !== "基金/水源/草场") throw new Error(`${label} should expose fund/water/grass only, got ${names}`);
  const water = (view.states || []).find((item) => item.id === "water");
  const grass = (view.states || []).find((item) => item.id === "grass");
  if (!view.outcome || !view.outcome.value || !view.outcome.action || !view.outcome.reason) {
    throw new Error(`${label} should expose animal return as ecology outcome`);
  }
  if (!water || !grass || water.outcome !== view.outcome || grass.outcome !== view.outcome) {
    throw new Error(`${label} water and grass should carry the animal outcome reference`);
  }
  if ((view.states || []).some((item) => /安全|生态|经营|班次|情报|外勤/.test(item.label))) {
    throw new Error(`${label} should not expose deprecated player resources`);
  }
  (view.states || []).forEach((state) => {
    if (!state.reason || !state.action) throw new Error(`${label} state ${state.label} missing reason/action`);
    if (state.delta && !state.reason) throw new Error(`${label} changed state ${state.label} missing reason`);
    const minimum = state.id === "fund" ? 1 : 3;
    if (!Array.isArray(state.subMetrics) || state.subMetrics.length < minimum) {
      throw new Error(`${label} state ${state.label} should expose core drill-down metrics`);
    }
    state.subMetrics.forEach((metric) => {
      if (!metric.label || metric.value === undefined || !metric.body || !metric.action) {
        throw new Error(`${label} sub metric for ${state.label} missing label/value/body/action`);
      }
    });
  });
}

const initial = createInitialWorld();
checkView(initial.reserveView, "initial world");

const result = simulateDay("派猎犬侦察中央混交林的陌生脚印", makeState());
checkView(result.world.reserveView, "simulated world");
if (!result.visual.reserveView || result.visual.reserveView !== result.world.reserveView) {
  throw new Error("visual should carry the same reserveView as world");
}

console.log("reserve presentation check ok");
