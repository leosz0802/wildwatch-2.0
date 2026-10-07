const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");

function withRandom(value, fn) {
  const old = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = old;
  }
}

function makeSalvageState(config = {}) {
  const state = createCharacter(null, "保护区卫士");
  const reserve = state.world.reserve;
  state.world.day = 7;
  reserve.fund = 600;
  reserve.inventory = {
    shedAntlerA: 1,
    shedAntlerB: 0,
    naturalHide: 0,
    researchSample: 2,
    recoveredTrap: 0
  };
  reserve.progression = Object.assign({}, reserve.progression || {}, { level: config.level || 1 });
  reserve.base = Object.assign({}, reserve.base || {}, { rating: config.rating || 1120 });
  reserve.market = Object.assign({}, reserve.market || {}, config.market || {
    antler: 86,
    hideSalvage: 124,
    researchSample: 42
  });
  reserve.dailySellFund = {
    version: 1,
    lastGuardianDay: Math.max(1, Math.round(Number((reserve.guardianCycle || {}).day) || 1)),
    soldFund: 0,
    unlockedBatches: 8,
    unlockClaimCount: 0,
    unlockClaimCountToday: 0,
    lastUnlock: null
  };
  reserve.league = Object.assign({}, reserve.league || {}, {
    rivals: (config.rivals || [
      { id: "neighbor_a", name: "邻区A", rating: 1120, shield: 40, animals: 30, material: 120, scope: "friends" },
      { id: "neighbor_b", name: "邻区B", rating: 1120, shield: 40, animals: 30, material: 120, scope: "friends" }
    ]).map((rival) => Object.assign({}, rival))
  });
  return state;
}

function runSalvage(config) {
  const state = makeSalvageState(config);
  const result = withRandom(0.99, () => simulateDay("出售仓库里的脱落岩角和研究样本", state));
  const sale = result.visual && result.visual.salvageEconomy;
  if (!sale || sale.sold.length !== 3) {
    throw new Error(`salvage should expose a three-item economy sale, got ${JSON.stringify(sale)}`);
  }
  if (!sale.baseValue || !sale.value || !sale.note) {
    throw new Error("salvage economy should expose base value, final value and note");
  }
  return sale;
}

const lowOwn = runSalvage({ level: 1, rating: 1040 });
const highOwn = runSalvage({ level: 5, rating: 1320 });
if (highOwn.value <= lowOwn.value || highOwn.ownLevelFactor <= lowOwn.ownLevelFactor) {
  throw new Error(`higher own reserve level should improve salvage value: low ${lowOwn.value}, high ${highOwn.value}`);
}

const strongNeighbors = runSalvage({
  level: 3,
  rating: 1180,
  rivals: [
    { id: "strong_a", name: "强邻A", rating: 1500, shield: 70, animals: 60, material: 240, scope: "friends" },
    { id: "strong_b", name: "强邻B", rating: 1460, shield: 66, animals: 55, material: 220, scope: "friends" }
  ]
});
const weakNeighbors = runSalvage({
  level: 3,
  rating: 1180,
  rivals: [
    { id: "weak_a", name: "弱邻A", rating: 930, shield: 20, animals: 22, material: 80, scope: "friends" },
    { id: "weak_b", name: "弱邻B", rating: 960, shield: 24, animals: 24, material: 92, scope: "friends" }
  ]
});
if (weakNeighbors.value <= strongNeighbors.value || weakNeighbors.neighborFactor <= strongNeighbors.neighborFactor) {
  throw new Error(`weaker neighboring reserves should leave better salvage value: strong ${strongNeighbors.value}, weak ${weakNeighbors.value}`);
}

const lowMarket = runSalvage({ level: 3, rating: 1180, market: { antler: 60, hideSalvage: 90, researchSample: 28 } });
const highMarket = runSalvage({ level: 3, rating: 1180, market: { antler: 130, hideSalvage: 180, researchSample: 80 } });
if (highMarket.value <= lowMarket.value || highMarket.baseValue <= lowMarket.baseValue || highMarket.marketIndex <= lowMarket.marketIndex) {
  throw new Error(`higher market prices should improve salvage value: low ${lowMarket.value}, high ${highMarket.value}`);
}

const targetedState = makeSalvageState({ level: 2, rating: 1120 });
const targetedResult = withRandom(0.99, () => simulateDay("只出售库存中的研究样本", targetedState));
const targetedSale = targetedResult.visual && targetedResult.visual.salvageEconomy;
if (!targetedSale || targetedSale.sold.length !== 2 || targetedSale.sold.some((key) => key !== "researchSample")) {
  throw new Error(`targeted sale should only sell the selected good: ${JSON.stringify(targetedSale)}`);
}
if ((targetedResult.world.reserve.inventory.shedAntlerA || 0) !== 1) {
  throw new Error("targeted sale should not consume a different inventory item");
}

console.log("salvage economy check ok");
