const { reserveValuationBreakdown, calculateReserveValuation } = require("../js/reserveValuation");
const { calculateReserveValuation: calculateServerValuation } = require("../server/wild-api/reserveValuation");

function assert(value, message) {
  if (!value) throw new Error(message);
}

const fixtures = [
  [1, 0, 1800],
  [1, 200, 5400],
  [1, 201, 5412],
  [3, 200, 9000],
  [5, 500, 16500],
  [7, 1020, 24860]
];

fixtures.forEach(([level, animals, expected]) => {
  assert(calculateReserveValuation(level, animals) === expected, `client valuation mismatch at Lv.${level}/${animals}`);
  assert(calculateServerValuation(level, animals) === expected, `server valuation mismatch at Lv.${level}/${animals}`);
});

const breakdown = reserveValuationBreakdown(3, 520);
assert(breakdown.levelBase === 5400 && breakdown.animalValue === 7360 && breakdown.total === 12760, "valuation breakdown must expose auditable level and animal components");
assert(calculateReserveValuation(0, -9) === 1800 && calculateReserveValuation(99, 0) === 13500, "valuation inputs must remain bounded");

console.log("reserve valuation check ok");
