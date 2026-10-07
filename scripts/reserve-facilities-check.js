const { createCharacter } = require("../js/storage");
const { Game } = require("../js/game");
const { simulateDay } = require("../js/simulator");
const { normalizeCollectionState } = require("../js/collectionSystem");
const {
  FACILITIES,
  FACILITY_USE_PROFILES,
  facilityStates,
  facilityByCaseId,
  applyFacilityUse,
  facilityUsePreview
} = require("../js/reserveFacilities");

if (FACILITIES.length !== 6 || new Set(FACILITIES.map((item) => item.id)).size !== 6) {
  throw new Error("reserve map must define exactly six unique facilities");
}
FACILITIES.forEach((facility) => {
  if (!(facility.x > 0.08 && facility.x < 0.92 && facility.y > 0.08 && facility.y < 0.9)) throw new Error(`facility outside safe map area: ${facility.id}`);
  if (!facilityByCaseId(facility.caseId)) throw new Error(`facility is not bound to a collection case: ${facility.id}`);
  if (!FACILITY_USE_PROFILES[facility.id]) throw new Error(`facility needs a same-day use profile: ${facility.id}`);
});

const state = createCharacter(null, "设施测试员");
normalizeCollectionState(state);
state.world.reserve.fund = 2000;
state.world.reserve.supplies = Object.assign({}, state.world.reserve.supplies || {}, {
  dogFood: 6,
  fieldKit: 6,
  alarm: 6,
  medicalKit: 6
});
let states = facilityStates(state);
const patrol = states.find((facility) => facility.id === "old_patrol_post");
const hall = states.find((facility) => facility.id === "governance_hall");
const hiddenAtStart = states.find((facility) => facility.caseId === "hidden");
if (!patrol || !patrol.available || patrol.status !== "repaired") throw new Error("chapter 1 patrol post should be usable without construction");
if (hall && hall.available) throw new Error("governance hall should stay locked until chapter 5");
if (states.filter((facility) => facility.available && facility.id !== "old_patrol_post").length) {
  throw new Error("chapter 1 should only unlock the patrol post among the six stations");
}
if (!hiddenAtStart.concealed || hiddenAtStart.available || hiddenAtStart.status !== "hidden") throw new Error("guardian memorial must remain concealed until a hidden lead is found");
state.world.collection.leads.push({ id: "hidden_lead_test", caseId: "hidden" });
if (facilityStates(state).find((facility) => facility.caseId === "hidden").concealed) throw new Error("a hidden archive lead should reveal the guardian memorial");
state.world.collection.leads = state.world.collection.leads.filter((lead) => lead.id !== "hidden_lead_test");

const preview = facilityUsePreview(state, "old_patrol_post");
if (!preview.ready || preview.fund !== 20 || preview.animals !== 1) throw new Error("chapter 1 patrol use should cost 20 fund and add 1 animal");
const used = applyFacilityUse(state, "old_patrol_post");
if (!used.ok) throw new Error(used.error || "unlocked patrol post should accept a same-day use");
if (used.preview.remaining !== 2) throw new Error("first patrol use should leave 2 free uses this chapter");

const simulated = simulateDay("驱赶偷猎者：让巡护灯网协助封锁边界", state);
const persistedSite = (((simulated.world.reserve.facilityConstruction || {}).sites || {}).old_patrol_post) || {};
if (Number(persistedSite.usedCount) !== 1) throw new Error("same-day station use must survive normal operating-day cloning");

state.world.collection.worldFlags.forest_remembers = true;
if (facilityStates(state).find((facility) => facility.caseId === "hidden").concealed) throw new Error("hidden archive should reveal guardian memorial");

const uiGame = new Game();
if (uiGame.stopLoop) uiGame.stopLoop();
uiGame.state = JSON.parse(JSON.stringify(state));
uiGame.render = () => {};
uiGame.openReserveFacilityDetail("old_patrol_post");
if (!uiGame.infoDetailModal || uiGame.infoDetailModal.kind !== "facilityConstruction") throw new Error("facility UI should open the same-day use panel");
if (!uiGame.infoDetailModal.use || uiGame.infoDetailModal.use.action !== "派出短巡") throw new Error("facility UI should show the current chapter use, not a build or specialization path");

console.log("reserve facilities check ok");
