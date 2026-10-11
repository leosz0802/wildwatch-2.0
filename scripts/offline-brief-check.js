const assert = require("assert");
const { createCharacter } = require("../js/storage");
const { MIN_OFFLINE_MS, offlineSnapshot, prepareOfflineBrief, markOfflineCheckpoint } = require("../js/offlineBrief");

const baseAt = Date.UTC(2026, 7, 20, 8, 0, 0);
const state = createCharacter(null, "离线简报测试");
markOfflineCheckpoint(state, baseAt);
const before = offlineSnapshot(state, baseAt);

state.world.reserve.fund += 80;
state.world.reserve.supplies.dogFood += 2;
state.world.reserve.ecology.water -= 3;
state.world.reserve.ecology.herbivores.deer += 2;
state.world.reserve.poacherPressure += 4;
state.reports.push({ day: 9, title: "夜间巡护发现新的边界脚印" });

const result = prepareOfflineBrief(state, baseAt + 2 * 24 * 60 * 60 * 1000);
assert(result.brief && result.brief.title === "欢迎回来，巡护员", "returning player should receive a welcome brief");
assert(/水源.*（.*→.*）/.test(result.brief.territoryLine) && /动物.*（.*→.*）/.test(result.brief.territoryLine), "brief should compare territory values");
assert(/基金\+80/.test(result.brief.resourceLine) && /补给\+2/.test(result.brief.resourceLine), "brief should report real resource deltas");
assert(result.brief.territoryTitle && result.brief.riskTitle && result.brief.nextStep, "brief should lead with a conclusion and next step");
assert(/边界脚印/.test(result.brief.eventLine), "brief should summarize reports created during the absence");
assert(result.state.ui.offlineCheckpoint.capturedAt > before.capturedAt, "brief generation should consume the checkpoint exactly once");
assert(!prepareOfflineBrief(result.state, baseAt + 2 * 24 * 60 * 60 * 1000 + MIN_OFFLINE_MS - 1).brief, "same return session must not show a duplicate brief");

const shortState = createCharacter(null, "短离线测试");
markOfflineCheckpoint(shortState, baseAt);
assert(!prepareOfflineBrief(shortState, baseAt + MIN_OFFLINE_MS - 1).brief, "short background switches must not spam the welcome brief");

console.log("offline brief check ok (welcome, territory, resources, events, one-time checkpoint)");
