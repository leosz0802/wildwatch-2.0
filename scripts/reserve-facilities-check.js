const { createCharacter } = require("../js/storage");
const { Game } = require("../js/game");
const { simulateDay } = require("../js/simulator");
const { normalizeCollectionState, CATALOG, ENDINGS, submitCaseEnding } = require("../js/collectionSystem");
const { FACILITIES, ROUTE_KITS, facilityStates, facilityByCaseId, normalizeFacilityConstruction, applyFacilityBuildStep, applyFacilitySpecialization, applyFacilityOperationalEffects } = require("../js/reserveFacilities");

if (FACILITIES.length !== 6 || new Set(FACILITIES.map((item) => item.id)).size !== 6) {
  throw new Error("reserve map must define exactly six unique facilities");
}
FACILITIES.forEach((facility) => {
  if (!(facility.x > 0.08 && facility.x < 0.92 && facility.y > 0.08 && facility.y < 0.9)) throw new Error(`facility outside safe map area: ${facility.id}`);
  if (!facilityByCaseId(facility.caseId)) throw new Error(`facility is not bound to a collection case: ${facility.id}`);
  if (!Array.isArray(facility.buildCosts) || facility.buildCosts.length !== 2 || facility.buildCosts.some((cost) => cost <= 0)) throw new Error(`facility needs two valid construction costs: ${facility.id}`);
  if (!Array.isArray(facility.routes) || facility.routes.length !== 3 || new Set(facility.routes.map((route) => route.id)).size !== 3) throw new Error(`facility needs three distinct specializations: ${facility.id}`);
  facility.routes.forEach((route) => {
    if (!ROUTE_KITS[route.id] || !route.name || !route.note) throw new Error(`invalid facility route: ${facility.id}/${route.id}`);
  });
});

const state = createCharacter(null, "设施测试员");
normalizeCollectionState(state);
let states = facilityStates(state);
if (states.some((facility) => facility.repaired)) throw new Error("new save should show six facilities but none repaired");
const hiddenAtStart = states.find((facility) => facility.caseId === "hidden");
if (!hiddenAtStart.concealed || hiddenAtStart.available || hiddenAtStart.status !== "hidden") throw new Error("guardian memorial must remain concealed until a hidden lead is found");
state.world.collection.leads.push({ id: "hidden_lead_test", caseId: "hidden" });
if (facilityStates(state).find((facility) => facility.caseId === "hidden").concealed) throw new Error("a hidden archive lead should reveal the guardian memorial");
state.world.collection.leads = state.world.collection.leads.filter((lead) => lead.id !== "hidden_lead_test");

const caseId = "case_1";
const caseState = state.world.collection.cases[caseId];
CATALOG.filter((item) => item.caseId === caseId && !item.condition.finale).forEach((item) => {
  state.world.collection.items[item.id] = { itemId: item.id, firstDay: 1, methodName: "测试" };
  caseState.itemIds.push(item.id);
});
const ending = ENDINGS[caseId][0];
const result = submitCaseEnding(state, caseId, ending.id);
if (!result.ok) throw new Error(`case ending should repair facility: ${result.error}`);
states = facilityStates(state);
if (!states.find((facility) => facility.caseId === caseId).repaired) throw new Error("case_1 ending did not repair old patrol post");
if (states.filter((facility) => facility.repaired).length !== 1) throw new Error("one case ending must not repair unrelated facilities");
let patrol = states.find((facility) => facility.caseId === caseId);
if (patrol.collectionStage !== 3 || patrol.buildStage !== 0 || !/待建设/.test(patrol.stageLabel)) throw new Error("case ending should unlock, but not auto-complete, the linked facility");
if (!applyFacilityBuildStep(state, patrol.id).ok || !applyFacilityBuildStep(state, patrol.id).ok) throw new Error("unlocked facility should accept two explicit construction investments");
patrol = facilityStates(state).find((facility) => facility.caseId === caseId);
if (patrol.buildStage !== 2 || !applyFacilitySpecialization(state, patrol.id, "enforcement").ok) throw new Error("completed facility body should allow one permanent route specialization");
state.world.reserve.poacherPressure = 50;
const operational = applyFacilityOperationalEffects(state.world.reserve, "antiPoacher", "旱季");
if (!operational.changes.some((change) => change.key === "poacherPressure" && change.delta < 0) || state.world.reserve.poacherPressure >= 50) throw new Error("restored patrol post must keep improving matching future patrol actions");
state.world.reserve.poacherPressure = 50;
state.world.reserve.supplies.alarm = Math.max(1, state.world.reserve.supplies.alarm || 0);
const simulated = simulateDay("驱赶偷猎者：让巡护灯网协助封锁边界", state);
const persistedSite = (((simulated.world.reserve.facilityConstruction || {}).sites || {}).old_patrol_post) || {};
if (persistedSite.collectionStage !== 3 || persistedSite.buildStage !== 3 || persistedSite.specialization !== "enforcement") throw new Error("collection and player-built facility stages must survive normal operating-day cloning");
if (!simulated.visual.facilityOperational || !simulated.visual.facilityOperational.changes.some((change) => change.key === "poacherPressure" && change.delta < 0)) throw new Error("matching settlement must expose the ongoing facility effect");

const poorState = createCharacter(null, "贫困设施测试员");
normalizeCollectionState(poorState);
poorState.world.collection.cases.case_1.ending = { id: "test", name: "测试结案" };
poorState.world.reserve.fund = 0;
if (applyFacilityBuildStep(poorState, "old_patrol_post").ok) throw new Error("unfinished collection must not bypass its case milestone");

state.world.collection.worldFlags.forest_remembers = true;
if (!facilityStates(state).find((facility) => facility.caseId === "hidden").repaired) throw new Error("hidden archive should repair guardian memorial");

const uiGame = new Game();
if (uiGame.stopLoop) uiGame.stopLoop();
uiGame.state = JSON.parse(JSON.stringify(state));
uiGame.render = () => {};
uiGame.openReserveFacilityDetail("old_patrol_post");
if (!uiGame.infoDetailModal || uiGame.infoDetailModal.facility.buildStage !== 3) throw new Error("facility UI should show the player's permanent specialization");

console.log("reserve facilities check ok");
