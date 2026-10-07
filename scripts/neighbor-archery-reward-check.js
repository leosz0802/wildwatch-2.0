const assert = require("assert");
const { createReserveState } = require("../js/world");
const { Game } = require("../js/game");
const { WORLD_EVENT_DEFINITIONS } = require("../js/worldEventSystem");

function reserveWithNoVisitors(type) {
  const reserve = createReserveState();
  reserve.fund = 1000;
  reserve.ecology.water = 50;
  reserve.ecology.grass = 50;
  reserve.stability = 50;
  reserve.development.operations.today = {
    day: 1,
    visitors: 0,
    recruitedVisitors: 0,
    income: 0,
    recruitedIncome: 0
  };
  reserve.emergency.active = Object.assign({
    id: `neighbor_reward_${type}`,
    type,
    progress: 0,
    daysRemaining: 3
  }, WORLD_EVENT_DEFINITIONS[type]);
  return reserve;
}

for (const type of ["neighbor_water", "neighbor_migration", "neighbor_animal_dispute"]) {
  for (const score of [4, 5, 6]) {
    const game = Object.create(Game.prototype);
    game.state = { world: { reserve: reserveWithNoVisitors(type) } };
    game.render = () => {};
    game.playSfx = () => {};
    game.toast = () => {};
    game.dismissInfoDetailModal = function dismissInfoDetailModal() {
      this.infoDetailModal = null;
    };
    game.archeryScoreFor = () => score;
    assert(game.openWorldEventDetail({
      type: "crisis",
      eventType: type,
      title: WORLD_EVENT_DEFINITIONS[type].title
    }, WORLD_EVENT_DEFINITIONS[type]), `${type} must open event detail`);
    assert.strictEqual(game.infoDetailModal.action(), true, `${type} must open archery`);
    const result = game.resolveNeighborEventDice();
    assert(result && result.success, `${type} score ${score} must resolve successfully`);
    assert(result.businessChange, `${type} must return a business change`);
    assert.strictEqual(result.businessChange.fundDelta, 0, `${type} test intentionally has no visitor income`);
    assert(
      Array.isArray(result.impactChanges) && result.impactChanges.length > 0,
      `${type} score ${score} must expose ecological reward even when fund/visitor reward is 0`
    );
    assert(
      result.impactChanges.some((change) => change.delta > 0),
      `${type} score ${score} must contain a positive reward`
    );
    assert(
      result.businessChange.impactChanges === result.impactChanges,
      `${type} impact reward must be persisted with the event outcome`
    );
  }
}

console.log("neighbor archery reward check ok");
