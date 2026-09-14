const { Game } = require("../js/game");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = Object.create(Game.prototype);
game.screen = "home";
game.trackNarrative = () => {};
game.mapPatrolReplay = null;

const base = {
  fundBefore: 500,
  fundAfter: 500,
  scoreDelta: 0,
  stats: [
    { key: "water", label: "水源", before: 60, after: 61, delta: 1 },
    { key: "grass", label: "草场", before: 60, after: 61, delta: 1 },
    { key: "safety", label: "安全", before: 60, after: 61, delta: 1 },
    { key: "animalTotal", label: "动物数量", before: 20, after: 21, delta: 1 }
  ]
};

const quiet = game.configureSettlementReveal(Object.assign({}, base), "home");
assert(quiet.silent === true, "small settlement changes should stay silent");

const thresholdCases = [
  Object.assign({}, base, { fundAfter: 580 }),
  Object.assign({}, base, { scoreDelta: 3 }),
  Object.assign({}, base, { stats: base.stats.map((item) => item.key === "water" ? Object.assign({}, item, { after: 64, delta: 4 }) : item) }),
  Object.assign({}, base, { stats: base.stats.map((item) => item.key === "animalTotal" ? Object.assign({}, item, { after: 24, delta: 3 }) : item) }),
  Object.assign({}, base, { goalDone: true }),
  Object.assign({}, base, { breakthrough: { kind: "emergency_started", title: "洪水", body: "河岸上涨" } })
];
thresholdCases.forEach((modal, index) => {
  const result = game.configureSettlementReveal(modal, "home");
  assert(result.silent === false && result.impactSummary && result.impactSummary.major, `threshold case ${index} should show the impact card`);
});

const changes = game.settlementDisplayChanges({
  fundBefore: 100,
  fundAfter: 200,
  scoreDelta: 4,
  guardianScore: 44,
  stats: [
    { key: "fund", label: "保护基金", before: 100, after: 200, delta: 100 },
    { key: "water", label: "水源", before: 60, after: 64, delta: 4 },
    { key: "grass", label: "草场", before: 60, after: 65, delta: 5 },
    { key: "safety", label: "安全", before: 60, after: 66, delta: 6 },
    { key: "animalTotal", label: "动物数量", before: 20, after: 25, delta: 5 }
  ]
});
assert(changes.secondary.length === 3, "impact card should keep at most three secondary changes");

console.log("impact settlement check ok");
