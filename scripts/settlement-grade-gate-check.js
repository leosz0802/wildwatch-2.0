const assert = require("node:assert/strict");
const { Game } = require("../js/game");

function explorationModal(grade) {
  return {
    materialExploration: { reward: { id: "quiet_mark", label: "安静水标", amount: 1 } },
    grade,
    presentationScreen: "home",
    returnScreen: "home",
    metricFocus: "",
    breakthrough: null,
    goalDone: false
  };
}

for (const grade of ["A", "S"]) {
  const game = Object.create(Game.prototype);
  game.screen = "home";
  game.pendingOnboardingFirstAction = false;
  game.settlementImpactSummary = () => ({ major: false });
  const modal = explorationModal(grade);
  game.settlementModal = modal;
  game.configureSettlementReveal(modal, "home");
  assert.equal(game.settlementModal, modal, `${grade} must keep the result popup`);
  assert.equal(modal.silent, false, `${grade} must be visible`);
  assert.ok(modal.revealAt > 0, `${grade} must have a reveal time`);
}

for (const grade of ["B", "C", "D"]) {
  const game = Object.create(Game.prototype);
  game.screen = "home";
  game.pendingOnboardingFirstAction = false;
  game.settlementImpactSummary = () => ({ major: false });
  const modal = explorationModal(grade);
  game.settlementModal = modal;
  game.activeTaskLock = { kind: "exploration", id: "exploreMaterials" };
  game.configureSettlementReveal(modal, "home");
  assert.equal(game.settlementModal, null, `${grade} must settle without a popup`);
  assert.equal(game.activeTaskLock, null, `${grade} must not leave a task lock behind`);
  assert.equal(modal.silent, true, `${grade} must be marked silent`);
}

const game = Object.create(Game.prototype);
assert.equal(game.settlementShouldPresent(explorationModal("B")), false);
assert.equal(game.settlementShouldPresent(explorationModal("C")), false);
assert.equal(game.settlementShouldPresent(explorationModal("D")), false);
assert.equal(game.settlementShouldPresent(explorationModal("A")), true);
assert.equal(game.settlementShouldPresent(explorationModal("S")), true);
console.log("settlement grade gate ok: only A/S exploration results interrupt; B/C/D settle in background");
