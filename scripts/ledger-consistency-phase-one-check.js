const assert = require("node:assert/strict");
const { createCharacter, normalizeReserve } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const {
  beginEcologyFlowLedger,
  recordEcologyFlow,
  reconcileEcologyFlow,
  beginReserveLedgerAudit,
  finalizeReserveLedgerAudit,
  visitorAudit,
  sumEconomy
} = require("../js/ledgerConsistency");
const { applyChapterVisitorDelta, chapterVisitorTotal } = require("../js/chapterTargets");
const { applyBreedingIncrease, animalSourceSummary } = require("../js/animalSourceLedger");

// A tagged water/grass write must close exactly.
const tagged = createCharacter(null, "账本闭合测试").world.reserve;
beginEcologyFlowLedger(tagged, 1, { water: 60, grass: 60 });
tagged.ecology.water = 63;
recordEcologyFlow(tagged, "water", 3, "测试补水", 1);
tagged.ecology.grass = 57;
recordEcologyFlow(tagged, "grass", -3, "测试取食", 1);
const taggedResult = reconcileEcologyFlow(tagged, 1);
assert.equal(taggedResult.balanced, true, "tagged ecology changes must close");
assert.equal(taggedResult.water.closureDelta, 0);
assert.equal(taggedResult.grass.closureDelta, 0);

// Legacy direct writes are still closed, but remain visible as an explicit
// unattributed/system bucket for the next source-specific pass.
const legacy = createCharacter(null, "旧路径审计").world.reserve;
beginEcologyFlowLedger(legacy, 1, { water: 60, grass: 60 });
legacy.ecology.water = 58;
const legacyResult = reconcileEcologyFlow(legacy, 1, "行动：旧结算");
assert.equal(legacyResult.balanced, true, "legacy direct ecology writes must not leave a dangling delta");
assert.equal(legacyResult.water.unattributed, -2);
assert.equal(legacyResult.water.sources["行动：旧结算"], -2);

// Visitor ledger: inherited/current sources minus loss equals the visible
// chapter total.
const visitorReserve = createCharacter(null, "游客账本").world.reserve;
applyChapterVisitorDelta(visitorReserve, 12, "recruit");
applyChapterVisitorDelta(visitorReserve, 3, "share");
applyChapterVisitorDelta(visitorReserve, -2, "loss");
const visitorResult = visitorAudit(visitorReserve, 0);
assert.equal(visitorResult.total, chapterVisitorTotal(visitorReserve));
assert.equal(visitorResult.closureDelta, 0);
assert.equal(visitorResult.balanced, true);

// Animal source ledger keeps breeding as a real population source and closes
// against the current living stock.
const animalReserve = createCharacter(null, "动物账本").world.reserve;
animalReserve.ecology.water = 80;
animalReserve.ecology.grass = 74;
const breeding = applyBreedingIncrease(animalReserve, "deer");
assert.equal(breeding, 1);
assert.equal(animalSourceSummary(animalReserve).closureDelta, 0);

// End-to-end daily audit: fund, visitor, animal and ecology audits are exposed
// with the simulation result and remain balanced after a real action.
let state = createCharacter(null, "日结算账本");
state.character.role = "warden";
const output = simulateDay("修复水源", state);
const reserve = output.world.reserve;
assert.ok(reserve.ledgerAudit, "daily settlement must expose ledgerAudit");
assert.equal(reserve.ledgerAudit.balanced, true);
assert.equal(output.visual.ledgerAudit.balanced, true);
assert.equal(reserve.ledgerAudit.fund.closureDelta, 0);
assert.equal(reserve.ledgerAudit.visitors.closureDelta, 0);
assert.equal(reserve.ledgerAudit.animals.closureDelta, 0);
assert.equal(reserve.ledgerAudit.ecology.water.closureDelta, 0);
assert.equal(reserve.ledgerAudit.ecology.grass.closureDelta, 0);

const restored = normalizeReserve(JSON.parse(JSON.stringify(reserve)));
assert.ok(restored.ledgerAudit && restored.ecologyFlowLedger, "ledger audit must survive save normalization");

const economy = sumEconomy({ sources: { a: 120, b: 5 }, sinks: { c: 30 } });
assert.deepEqual(economy, { income: 125, expense: 30, net: 95 });

console.log("ledger consistency phase one check ok");
