const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");

function wardenState() {
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

const state = wardenState();
if (!state.world.goals.daily.story || !state.world.goals.daily.recommendedAction || !state.world.goals.daily.buttonLabel) {
  throw new Error("initial daily goal should include story, recommendation and button label");
}

state.world.reserve.poacherPressure = 64;
state.world.reserve.market.antler = 86;
state.world.reserve.market.hideSalvage = 124;
state.world.reserve.base.rating = 980;

const result = simulateDay("驱赶偷猎者：带白河去西部岩坡洞域排查可疑人影", state);
const reserve = result.world.reserve;
const daily = result.world.goals.daily;

if (!reserve.social || !reserve.social.log || typeof reserve.social.marketDelta !== "number") {
  throw new Error("reserve should keep a social pulse after simulation");
}
if (!/保护区|基地|告警|回收|防护/.test(reserve.social.log)) {
  throw new Error(`social pulse should read as another-player/world event, got: ${reserve.social.log}`);
}
if (reserve.market.antler === 86 && reserve.market.hideSalvage === 124) {
  throw new Error("social pulse should affect market prices");
}
if (!reserve.migration || !/保护区|世界|好友|基地|安全|迁移|回流|动物/.test(reserve.migration.reason || "")) {
  throw new Error(`migration reason should include social/ecology context, got: ${reserve.migration && reserve.migration.reason}`);
}
if (!daily.story || !daily.recommendedAction || !daily.buttonLabel || !daily.chapter) {
  throw new Error("next daily mission should remain guided and story-driven");
}
const privateReport = result.reports.find((report) => report.type === "private");
if (!privateReport || !privateReport.body || /undefined|NaN/.test(privateReport.body)) {
  throw new Error("patrol should retain a valid action report");
}
// Social feedback now has its own settlement data; the compact private report
// no longer repeats the retired literal “联动：” prefix.
if (!result.visual.social || result.visual.social.log !== reserve.social.log
  || result.visual.social.marketDelta !== reserve.social.marketDelta) {
  throw new Error("social outcome must reach settlement with the same narrative and value change");
}

console.log("task social check ok");
