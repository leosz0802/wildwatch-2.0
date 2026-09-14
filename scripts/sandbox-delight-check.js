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
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext: createFakeContext }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, "保护区卫士");
  game.state.ui = Object.assign({}, game.state.ui || {}, { prologue: { version: 1, stage: "complete", completed: true } });
  game.screen = "home";
  game.render = () => {};
  return game;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = makeGame();
const animal = game.state.world.knownCharacters[0];
game.openAnimalThought(animal);
const first = game.infoDetailModal;
assert(first && first.kind === "mapAnimalAction", "tapping a sandbox animal must open the direct action card");
assert(first.listenGain === 0, "listening must no longer expose the removed intel resource");
assert(first.animal === animal && first.quote && first.quote.length <= 80, "animal response must use a large portrait and a short spoken line");
assert((first.mapActions || []).length === 2, "animal card must only offer the two animal-facing verbs");
assert(!first.mapActions.some((item) => item.id.startsWith("patrol:"))
  && first.mapActions.some((item) => item.id.startsWith("care:"))
  && first.mapActions.some((item) => item.id === "explore:materials"), "animal card must keep only relationship and exploration actions");
assert(first.mapActions.every((item) => item.label && item.value && item.action), "every sandbox action needs a verb, an exact result preview and a tap handler");
assert(first.linkedPatrolTask && first.linkedPatrolTask.id, "animal discovery must create a linked sandbox task instead of a direct patrol button");
const taskMarker = game.reserveViewForDisplay().mapMarkers.find((marker) => marker.id === game.state.world.reserve.animalPatrolLead.id);
assert(taskMarker && taskMarker.recommendAction === first.linkedPatrolTask.id, "the linked patrol task must be visible on the sandbox map");

const firstQuote = first.quote;
game.infoDetailModal = null;
game.openAnimalThought(animal);
const second = game.infoDetailModal;
assert(second.listenGain === 0, "repeated listening must not create a hidden resource reward");
assert(second.quote && second.quote !== firstQuote, "repeat taps should continue the animal conversation instead of repeating one line");

assert(!second.mapActions.some((item) => item.id.startsWith("patrol:")), "the animal modal must never execute patrol directly");
game.openMapMarkerDetail(taskMarker);
assert(game.infoDetailModal && game.infoDetailModal.kind === "watchClue" && game.infoDetailModal.action, "the sandbox task marker must explain the clue before execution");
game.infoDetailModal.action();
assert(game.patrolTaskModal && game.patrolTaskModal.id === taskMarker.recommendAction, "only the sandbox task marker may open the strategic patrol flow");

const leadId = game.state.world.reserve.animalPatrolLead.id;
game.submitCommand();
assert(!game.state.world.reserve.animalPatrolLead, "a completed patrol action must clear the matching animal-reported sandbox task");
assert(!game.reserveViewForDisplay().mapMarkers.some((marker) => marker.id === leadId), "resolved animal task marker must disappear from the sandbox");

game.patrolTaskModal = null;
game.settlementModal = null;
game.infoDetailModal = game.buildAnimalThoughtDetail(animal, game.createAnimalDialogueContext(animal));
const care = game.infoDetailModal.mapActions.find((item) => item.id.startsWith("care:"));
const trustBefore = ((game.state.world.knownCharacters.find((item) => item.id === animal.id) || {}).relation || {}).trust || 0;
care.action();
assert(game.infoDetailModal && game.infoDetailModal.kind === "animalComfort" && game.infoDetailModal.phase === "approach", "relationship verb must open a warm care process before changing values");
assert((game.infoDetailModal.config.steps || []).length === 2
  && (game.infoDetailModal.config.buttons || []).length === 2, "animal care must stay a two-frame interaction");
assert((((game.state.world.knownCharacters.find((item) => item.id === animal.id) || {}).relation || {}).trust || 0) === trustBefore, "opening the first care frame must not commit values before the player acts");
game.advanceAnimalCareProcess();
const trustAfter = ((game.state.world.knownCharacters.find((item) => item.id === animal.id) || {}).relation || {}).trust || 0;
assert(trustAfter > trustBefore, "finishing the care process must change the animal relationship");
assert(game.infoDetailModal && game.infoDetailModal.kind === "animalComfort" && game.infoDetailModal.phase === "result" && game.infoDetailModal.step === 1
  && (game.infoDetailModal.resultChanges || []).length === 3, "care process must end with a readable three-part result instead of disappearing immediately");
assert(game.screen === "home" && game.mapConsequencePulse, "relationship result must return to the live sandbox instead of a dead-end page");
assert(/\d+→\d+|[+-]\d+/.test(game.mapConsequencePulse.valueText || ""), "sandbox result must expose an exact numeric change");
assert(/：/.test(game.mapConsequencePulse.responseText || "")
  && !/森林用路线和停留时间回应了你/.test(game.mapConsequencePulse.responseText || ""), "a named animal must answer after the numeric result to add emotional value");
const start = game.mapConsequencePulse.startedAt;
assert(game.mapConsequenceStage(game.mapConsequencePulse, start + 200) === "environment"
  && game.mapConsequenceStage(game.mapConsequencePulse, start + 800) === "numbers"
  && game.mapConsequenceStage(game.mapConsequencePulse, start + 1700) === "animal", "feedback rhythm must be picture, number, then animal response");
game.mapConsequencePulse.startedAt = Date.now() - 1700;
game.mapConsequencePulse.expiresAt = Date.now() + 2000;
game.drawMapConsequencePulse(game.ctx, game.mapCameraInfo(0, 0, 375, 500));
assert(game.mapConsequencePulse.renderedCard && game.mapConsequencePulse.renderedCard.w >= 230
  && game.mapConsequencePulse.renderedCard.h >= 100
  && game.mapConsequencePulse.renderedCard.valueSize >= 13
  && game.mapConsequencePulse.renderedCard.hasAnimalResponse
  && game.mapConsequencePulse.renderedCard.palette === "neutral-single-accent"
  && game.mapConsequencePulse.renderedCard.coloredPanels === 0, "sandbox result must use a prominent, restrained card with one semantic accent and the animal reply");

game.openAnimalThought(animal);
const explore = game.infoDetailModal.mapActions.find((item) => item.id === "explore:materials");
assert(/点数/.test(explore.value) && /直接探索/.test(explore.cost) && /物资|线索/.test(explore.cost), "exploration preview must explain the tap, point result and immediate outcome");
explore.action();
assert(game.infoDetailModal && game.infoDetailModal.kind === "materialExploration", "sandbox exploration verb must enter the playable six-sided-die flow");
assert(/总点数|六面点数/.test(`${game.infoDetailModal.footer} ${(game.infoDetailModal.items || []).map((item) => item.title).join(" ")}`), "exploration must preserve the clear point formula");

game.infoDetailModal = game.buildAnimalThoughtDetail(animal, game.createAnimalDialogueContext(animal));
assert(game.infoDetailModal.mapActions[0].id === "explore:materials" && game.infoDetailModal.mapActions[0].recommended, "when today's care is complete, exploration must move into the first recommended position");
assert(/今日互动已完成/.test(game.infoDetailModal.nextStepGuide) && /立即/.test(game.infoDetailModal.nextStepGuide), "blocked animal cards must explicitly explain the next available step and its result timing");

console.log("sandbox delight check ok");
