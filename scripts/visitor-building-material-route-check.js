function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 7 });
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
  createImage() { return { loaded: true, complete: true, set src(value) { this._src = value; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { createReserveState } = require("../js/world");
const { wildernessFindById } = require("../js/wildernessKnowledge");
const { choiceAvailability, choiceById } = require("../js/reserveDevelopment");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function prepareGame() {
  const game = new Game();
  game.stopLoop();
  game.deferredRuntimeServicesReady = true;
  game.ctx = createFakeContext();
  game.width = 375;
  game.height = 667;
  game.state = createCharacter(null, "建筑材料跳转");
  game.state.world.reserve = Object.assign(createReserveState(), game.state.world.reserve || {});
  game.state.world.reserve.fund = 80;
  game.state.world.reserve.wildernessKnowledge = game.state.world.reserve.wildernessKnowledge || {};
  game.state.world.reserve.wildernessKnowledge.tradeStock = {};
  game.toast = () => {};
  game.prepareLocalAssetsForScreen = () => {};
  game.render = function renderSurvival() {
    if (this.screen !== "survival") return;
    this.hitAreas = [];
    this.contentHeight = 0;
    this.drawSurvival(this.ctx);
    this.clampScroll();
  };
  return game;
}

function assertLandedOnMaterialTable(game, materialId, message) {
  const item = wildernessFindById(materialId);
  assert(item, `${materialId} must exist in the survival catalog`);
  assert(game.screen === "survival", `${message}: screen is ${game.screen}`);
  assert(!(game.infoDetailModal && game.infoDetailModal.kind === "materialExploration"), `${message}: opened the exploration modal instead of the collection table`);
  assert(Number(game.survivalExploreFocusUntil || 0) <= Date.now(), `${message}: large Survival explore box is still focused`);
  assert(Number(game.survivalMaterialLevel) === Number(item.minLevel), `${message}: expected level ${item.minLevel} table, got ${game.survivalMaterialLevel}`);
  assert(game.survivalFocusMaterialId === materialId, `${message}: expected focus ${materialId}, got ${game.survivalFocusMaterialId}`);
  const group = (game.renderedSurvivalGroups || []).find((entry) => entry.selected);
  const card = (game.renderedSurvivalCards || []).find((entry) => entry.id === materialId);
  assert(group, `${message}: missing selected material table`);
  assert(card && card.focused, `${message}: missing focused collection card for ${item.label}`);
  assert(card.groupLevel === item.minLevel, `${message}: card is not on its collection table`);
  const visibleY = group.y - game.scrollY;
  assert(visibleY >= game.compactStageTop() - 8, `${message}: table scrolled above the page`);
  assert(visibleY < game.height * 0.62, `${message}: still parked on the large explore hero instead of the table`);
  assert(!(game.renderedSurvivalHero && game.renderedSurvivalHero.exploreFocused), `${message}: explore hero must not pulse`);
}

{
  const game = prepareGame();
  const reed = choiceById("reed_refuge", "river_shallows");
  const availability = choiceAvailability(game.state.world.reserve, reed);
  assert(!availability.available && availability.missing.some((item) => /芦苇/.test(item)), "reed refuge must report a wilderness material shortage");
  game.infoDetailModal = { kind: "livingReserveChoiceConfirm", choice: reed, availability };
  game.routeReserveDevelopmentResources(availability);
  assertLandedOnMaterialTable(game, "reed_cord", "visitor-table building shortage");
}

{
  const game = prepareGame();
  game.routeReserveDevelopmentResources({ missing: ["荚果警报器 0/1"] });
  assertLandedOnMaterialTable(game, "seedpod_alarm", "seedpod shortage");
}

{
  const game = prepareGame();
  game.routeReserveDevelopmentResources({ missing: ["松果湿度标×1"] });
  assertLandedOnMaterialTable(game, "pinecone_humidity", "pinecone shortage");
}

{
  const game = prepareGame();
  game.state.world.reserve.wildernessKnowledge.tradeStock = { reed_cord: 1 };
  const reed = choiceById("reed_refuge", "river_shallows");
  const availability = choiceAvailability(game.state.world.reserve, reed);
  assert(availability.missing.some((item) => /松果/.test(item)) && !availability.missing.some((item) => /芦苇/.test(item)), "owned reed stock should leave only pinecone missing");
  game.routeReserveDevelopmentResources(availability);
  assertLandedOnMaterialTable(game, "pinecone_humidity", "partial material shortage");
}

{
  const game = prepareGame();
  game.screen = "collection";
  game.openReserveDevelopmentNode("river_shallows");
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const reedChoice = (game.infoDetailModal.renderedLivingChoices || []).find((item) => item.id === "reed_refuge");
  assert(reedChoice, "shallow node must show the reed refuge card");
  const materialHit = game.hitAreaAt(reedChoice.x + 24, reedChoice.y + 64);
  assert(materialHit && typeof materialHit.onTap === "function", "missing-material copy must be tappable");
  materialHit.onTap();
  assertLandedOnMaterialTable(game, "reed_cord", "tapping the material line");
}

{
  const game = prepareGame();
  game.screen = "collection";
  assert(game.openReserveDevelopmentChoiceConfirm("river_shallows", "reed_refuge"), "shortage confirm must open");
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const resourceHit = game.hitAreas[game.hitAreas.length - 1];
  assert(resourceHit && typeof resourceHit.onTap === "function", "shortage confirmation must expose a resource route");
  resourceHit.onTap();
  assertLandedOnMaterialTable(game, "reed_cord", "confirm-page resource route");
}

{
  const game = prepareGame();
  let fundRouted = false;
  game.openFundSamples = (status) => {
    fundRouted = true;
    game.fundSampleTarget = Number((status.purchase || {}).cost) || 0;
    game.screen = "role";
    return true;
  };
  game.routeReserveDevelopmentResources({ missing: ["基金还差600"] });
  assert(fundRouted && game.screen === "role", "fund-only visitor buildings must still go to fund samples");
  assert(Number(game.survivalExploreFocusUntil || 0) === 0, "fund shortage must not highlight the Survival explore box");
}

console.log("visitor building material route check ok (table focus, level tabs, no explore hero)");
