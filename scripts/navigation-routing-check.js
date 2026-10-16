function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext() { return createFakeContext(); } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; this.loaded = true; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { WILDERNESS_FIND_CATALOG, recordWildernessFind } = require("../js/wildernessKnowledge");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeGame(screen = "home") {
  const game = new Game();
  game.stopLoop();
  game.deferredRuntimeServicesReady = true;
  game.render = () => {};
  game.state = createCharacter(null, "保护区卫士");
  game.state.world.reserve.progression.totalActions = 2;
  game.screen = screen;
  game.infoDetailModal = null;
  game.patrolTaskModal = null;
  game.settlementModal = null;
  return game;
}

const tabs = ["home", "survival", "collection", "role", "archive"];
const tabGame = makeGame();
tabs.forEach((screen) => {
  tabGame.infoDetailModal = { kind: "stale" };
  tabGame.setScreen(screen);
  assert(tabGame.screen === screen, `bottom navigation should enter ${screen}`);
  assert(!tabGame.infoDetailModal, `entering ${screen} should close the previous page modal`);
});
tabGame.setScreen("animalworld");
assert(tabGame.screen === "collection" && tabGame.discoveryTab === "population", "animal routes should enter Discovery / Population");

const collectionGame = makeGame("home");
collectionGame.activateGuardianBeat("collectionInvestigation");
assert(collectionGame.screen === "home", "station tasks open the patrol post on the sandbox, not Survival archery");
assert(collectionGame.infoDetailModal && collectionGame.infoDetailModal.kind === "facilityConstruction", "station task should open the patrol-post use card");
collectionGame.openSurvivalCollectionArchive();
assert(collectionGame.screen === "survival" && collectionGame.survivalArchiveOpen, "Survival archive remains available from Survival itself");
collectionGame.collectionCaseId = "case_1";
collectionGame.collectionPage = 1;
collectionGame.closeSurvivalCollectionArchive();
assert(collectionGame.screen === "survival" && !collectionGame.survivalArchiveOpen && !collectionGame.collectionCaseId && collectionGame.collectionPage === 0, "leaving a chapter collection must return to the Survival home");
collectionGame.openDiscoveryHome();
assert(collectionGame.screen === "collection" && collectionGame.discoveryTab === "visitors", "Discovery home must open on Visitor Operations so first-stage recruitment and ads stay visible");
collectionGame.drawCollection(createFakeContext());
assert(collectionGame.renderedDiscoveryNetworkEntry && collectionGame.renderedDiscoveryNetworkEntry.friends && collectionGame.renderedDiscoveryNetworkEntry.world, "Discovery header must pin friend and world ranking entry");
assert(collectionGame.renderedDiscoveryTabs && collectionGame.renderedDiscoveryTabs.y > collectionGame.renderedDiscoveryNetworkEntry.y, "Discovery friend and world ranking entry must sit above the two discovery tabs");
collectionGame.openReserveNetwork("friends");
assert(collectionGame.screen === "league" && collectionGame.leagueScope === "friends", "Discovery friend ranking entry should open the friend board");
collectionGame.openDiscoveryHome();
collectionGame.openReserveNetwork("world");
assert(collectionGame.screen === "league" && collectionGame.leagueScope === "world", "Discovery world ranking entry should open the world board");
collectionGame.openDiscoveryHome();
collectionGame.collectionCaseId = "case_1";
collectionGame.setScreen("home");
collectionGame.setScreen("collection");
assert(collectionGame.discoveryTab === "visitors" && !collectionGame.collectionCaseId, "returning to Discovery after leaving the tab must not reopen the old chapter collection");

const patrolGame = makeGame("survival");
patrolGame.openPatrolOperationScreen("houndScout");
assert(patrolGame.screen === "survival" && patrolGame.patrolTaskModal.id === "houndScout", "story patrol should open its requested task on Survival, not the patrol board");
patrolGame.closePatrolOperationScreen();
assert(patrolGame.screen === "survival", "closing patrol should stay on Survival");
patrolGame.setScreen("collection");
patrolGame.openPatrolOperationScreen("houndScout");
patrolGame.closePatrolOperationScreen();
assert(patrolGame.screen === "collection", "closing patrol should return to Discovery");

// A story click must open exactly its requested operation, never the selector.
for (const action of ["houndScout", "antiPoacher", "habitat", "intervention"]) {
  for (const origin of ["home", "survival", "collection"]) {
    const direct = makeGame(origin);
    direct.state.world.reserve.fund = 10000;
    direct.state.world.reserve.supplies = { dogFood: 10, alarm: 5, fieldKit: 5, medicalKit: 5, tranquilizer: 5 };
    direct.infoDetailModal = { kind: "story" };
    const before = JSON.stringify(direct.state.world.reserve);
    direct.executeGoalAction({ recommendedAction: action, kind: "stage" });
    if (action === "antiPoacher") {
      assert(!direct.patrolTaskModal, `${origin}/${action}: 驱赶偷猎不得停在中间页`);
      assert(JSON.stringify(direct.state.world.reserve) !== before, `${origin}/${action}: 驱赶偷猎应直接结算`);
      continue;
    }
    assert(direct.screen === origin && direct.screen !== "action" && direct.patrolTaskModal.id === action && !direct.infoDetailModal,
      `${origin}/${action}: story click should open the requested operation on the current screen`);
    assert(direct.pendingTaskOriginScreen === origin, "task should settle from the screen that opened it");
    assert(JSON.stringify(direct.state.world.reserve) === before, "opening the operation may record click timing but must not spend resources or advance a task");
    const task = direct.patrolTaskModal;
    assert(direct.openPatrolOperationScreen("houndScout") === false && direct.patrolTaskModal === task,
      "a second trigger must not replace an active task");
    const buttons = [];
    direct.modalButton = (_ctx, _x, _y, _w, _h, label, _fill, onTap) => buttons.push({ label, onTap });
    direct.drawPatrolTaskModal();
    assert(direct.renderedPatrolTask.id === action, "the visible modal must remain the requested operation");
    let confirmed = 0;
    direct.submitCommand = () => { confirmed += 1; assert(direct.patrolTaskModal.id === action, "confirmation must use the story action"); };
    buttons.find(button => button.label === (action === "habitat" ? "执行修复" : "执行结算")).onTap();
    assert(confirmed === 1, "one confirmation should execute exactly once");
    buttons.find(button => button.label === "取消").onTap();
    assert(!direct.patrolTaskModal && !direct.activeTaskLock, "cancel must release the task and its ownership");
    direct.closePatrolOperationScreen();
    assert(direct.screen === origin, "closing the task page must return to its original scene");
  }
}
const shortageRoute = makeGame("home");
shortageRoute.state.world.reserve.supplies.alarm = 0;
shortageRoute.openPatrolOperationScreen("antiPoacher");
assert(shortageRoute.screen === "role" && !shortageRoute.patrolTaskModal,
  "a shortage must send 驱赶偷猎 to materials instead of an intermediate page");

// Reproduce the saved visitor title paired with an ecology action from the video.
for (const conflict of [false, true]) {
  const dailyGame = makeGame("home");
  dailyGame.state.world.reserve.progression.stage = 2;
  const { createGoalState } = require("../js/goalSystem");
  dailyGame.state.world.goals = createGoalState(dailyGame.state);
  const reserve = dailyGame.state.world.reserve;
  reserve.emergency.active = conflict ? { id: "visitor_test", type: "visitor_conflict", title: "游客越线", progress: 0, target: 1 } : null;
  reserve.development.operations.today.trouble = conflict ? "游客越线" : "尚无明显麻烦";
  assert(dailyGame.openDailyEvents() === false, "daily checklist must stay closed");
  assert(dailyGame.dailyEventChecklist().total === 0, "daily tasks must not be recreated");
  dailyGame.infoDetailModal = null;
  const openedVisitor = dailyGame.openVisitorIncidentDice({ type: "visitorIncident" });
  if (!conflict) {
    assert(openedVisitor === false && !dailyGame.patrolTaskModal, "no incident must not manufacture a visitor or patrol task");
    continue;
  }
  assert(dailyGame.screen === "home" && !dailyGame.patrolTaskModal
    && dailyGame.infoDetailModal.kind === "visitorIncidentDice",
    "independent visitor event must never route to habitat repair or the patrol selector");
  dailyGame.animateInlineDiceRoll = (_modal, _roll, _key, done) => done();
  dailyGame.infoDetailModal.action();
  assert(dailyGame.infoDetailModal.phase === "result" && dailyGame.dailyEventChecklist().total === 0,
    "visitor settlement must not regenerate daily tasks");
  const after = JSON.stringify(dailyGame.state);
  assert(dailyGame.resolveVisitorIncidentDice() === false && JSON.stringify(dailyGame.state) === after,
    "repeated confirmation must not duplicate income, progress or rewards");
}

const materialGame = makeGame("survival");
materialGame.openMaterialExploration();
assert(materialGame.infoDetailModal.originScreen === "survival", "exploration should remember its source tab");
// Navigation regression uses a deterministic S result. Lower grades are
// intentionally settled silently by the current S-only popup policy.
materialGame.materialExplorationSettlementGrade = () => "S";
materialGame.executeMaterialExploration("", 6);
assert(materialGame.screen === "home" && materialGame.settlementModal && materialGame.settlementModal.returnScreen === "survival", "exploration should reveal the sandbox result and then return to its source tab");

function cloudWithDeferredRefresh(deferred) {
  return {
    rows: [{ id: "world-1", name: "真实玩家的保护区", valuation: 9000, scope: "world" }],
    friendRows: [],
    feature(name) { return name === "socialTrade" || name === "reciprocalTrade" || name === "worldLeaderboard"; },
    track() {}, syncReserve() {}, refreshRelationFriends() { return Promise.resolve([]); },
    refreshLeaderboard() { return deferred || Promise.resolve(this.rows); }
  };
}

function flushPromises() { return new Promise((resolve) => setTimeout(resolve, 0)); }

async function checkAsyncRoutes() {
  const item = WILDERNESS_FIND_CATALOG[0];
  const tradeGame = makeGame("survival");
  recordWildernessFind(tradeGame.state.world.reserve, item, 2, {});
  tradeGame.cloudService = cloudWithDeferredRefresh();
  tradeGame.leagueScope = "friends";
  tradeGame.prepareWildernessTrade("world", item.id);
  await flushPromises();
  assert(tradeGame.screen === "survival", "world exchange should stay on the current tab");
  assert(tradeGame.leagueScope === "friends", "world exchange must not silently switch the leaderboard tab");
  assert(tradeGame.infoDetailModal && tradeGame.infoDetailModal.kind === "friendAidRequest", "world exchange should use the same auto request as sandbox and leaderboard");

  let release;
  const deferred = new Promise((resolve) => { release = resolve; });
  const staleGame = makeGame("survival");
  recordWildernessFind(staleGame.state.world.reserve, item, 2, {});
  staleGame.cloudService = cloudWithDeferredRefresh(deferred);
  staleGame.prepareWildernessTrade("world", item.id);
  staleGame.infoDetailModal = null;
  staleGame.setScreen("role");
  release(staleGame.cloudService.rows);
  await flushPromises();
  assert(staleGame.screen === "role" && !staleGame.infoDetailModal, "a completed background refresh must not open an exchange modal on another tab");

  staleGame.infoDetailModal = { kind: "rankingDetail" };
  staleGame.openReserveNetwork("world");
  assert(staleGame.screen === "league" && staleGame.leagueScope === "world" && !staleGame.infoDetailModal, "an explicit leaderboard route should enter the requested scope without retaining the old modal");
}

checkAsyncRoutes().then(() => console.log("navigation routing check ok")).catch((error) => {
  console.error(error);
  process.exit(1);
});
