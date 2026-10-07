"use strict";
const { animalSourceSummary, livingStock } = require("./animalSourceLedger");
function whole(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
}
function bounded(value, fallback = 0) {
  return Math.max(0, Math.min(100, whole(value, fallback)));
}
function ecologyOf(reserve = {}) {
  return reserve.ecology || (reserve.ecology = {});
}
function dayOf(reserve = {}, fallback = 1) {
  const cycle = reserve.guardianCycle || {};
  return Math.max(1, whole(cycle.day || reserve.seasonDay, fallback));
}
function emptyMetric(opening = 0) {
  return {
    opening: bounded(opening),
    in: 0,
    out: 0,
    untrackedIn: 0,
    untrackedOut: 0,
    ending: bounded(opening),
    expected: bounded(opening),
    closureDelta: 0,
    sources: {}
  };
}
function ensureEcologyFlowLedger(reserve = {}) {
  const current = reserve.ecologyFlowLedger && typeof reserve.ecologyFlowLedger === "object"
    ? reserve.ecologyFlowLedger
    : {};
  reserve.ecologyFlowLedger = current;
  current.version = 1;
  current.entries = Array.isArray(current.entries) ? current.entries.slice(-120) : [];
  if (!current.current || typeof current.current !== "object") current.current = null;
  return current;
}
function beginEcologyFlowLedger(reserve = {}, day = dayOf(reserve), opening = null) {
  const ledger = ensureEcologyFlowLedger(reserve);
  const ecology = ecologyOf(reserve);
  const source = opening && typeof opening === "object" ? opening : ecology;
  ledger.current = {
    version: 1,
    day: Math.max(1, whole(day, dayOf(reserve))),
    water: emptyMetric(source.water),
    grass: emptyMetric(source.grass),
    entries: []
  };
  return ledger.current;
}
function ensureCurrent(reserve = {}, day, metric, delta = 0) {
  const ledger = ensureEcologyFlowLedger(reserve);
  const wantedDay = Math.max(1, whole(day, dayOf(reserve)));
  if (!ledger.current || ledger.current.day !== wantedDay) {
    const ecology = ecologyOf(reserve);
    const opening = {};
    ["water", "grass"].forEach((key) => {
      opening[key] = bounded(ecology[key]);
      if (key === metric) opening[key] = bounded(opening[key] - whole(delta));
    });
    beginEcologyFlowLedger(reserve, wantedDay, opening);
  }
  return ledger.current;
}
function recordEcologyFlow(reserve = {}, metric, delta, source = "未标注", day) {
  if (!["water", "grass"].includes(metric)) return 0;
  const amount = whole(delta);
  if (!amount) return 0;
  const current = ensureCurrent(reserve, day, metric, amount);
  const row = current[metric];
  const key = String(source || "未标注").slice(0, 48);
  if (amount > 0) row.in += amount;
  else row.out += Math.abs(amount);
  row.sources[key] = whole(row.sources[key]) + amount;
  current.entries.push({ metric, delta: amount, source: key });
  const ledger = ensureEcologyFlowLedger(reserve);
  ledger.entries.push({ day: current.day, metric, delta: amount, source: key });
  ledger.entries = ledger.entries.slice(-120);
  return amount;
}
function applyEcologyFlow(reserve = {}, metric, delta, source = "未标注", day) {
  if (!["water", "grass"].includes(metric)) return { before: 0, after: 0, delta: 0 };
  const ecology = ecologyOf(reserve);
  const before = bounded(ecology[metric]);
  const after = bounded(before + whole(delta));
  ecology[metric] = after;
  recordEcologyFlow(reserve, metric, after - before, source, day);
  return { before, after, delta: after - before };
}
function reconcileEcologyFlow(reserve = {}, day, fallbackSource = "系统自动结算") {
  const current = ensureCurrent(reserve, day, "water", 0);
  const ecology = ecologyOf(reserve);
  const result = { day: current.day, water: null, grass: null, balanced: true };
  ["water", "grass"].forEach((metric) => {
    const row = current[metric];
    const ending = bounded(ecology[metric]);
    const expected = bounded(row.opening + row.in - row.out);
    const delta = ending - expected;
    if (delta > 0) {
      row.untrackedIn += delta;
      row.in += delta;
      row.sources[fallbackSource] = whole(row.sources[fallbackSource]) + delta;
    }
    if (delta < 0) {
      row.untrackedOut += Math.abs(delta);
      row.out += Math.abs(delta);
      row.sources[fallbackSource] = whole(row.sources[fallbackSource]) + delta;
    }
    row.ending = ending;
    row.expected = bounded(row.opening + row.in - row.out);
    row.closureDelta = ending - row.expected;
    result[metric] = Object.assign({}, row, {
      sources: Object.assign({}, row.sources),
      untracked: delta,
      unattributed: delta
    });
    if (row.closureDelta !== 0) result.balanced = false;
  });
  current.reconciledAt = Date.now();
  return result;
}
function sumEconomy(ledger = {}) {
  const sources = ledger.sources || {};
  const sinks = ledger.sinks || {};
  const income = Object.keys(sources).reduce((sum, key) => sum + Math.max(0, whole(sources[key])), 0);
  const expense = Object.keys(sinks).reduce((sum, key) => sum + Math.max(0, whole(sinks[key])), 0);
  return { income, expense, net: income - expense };
}
function sumFundEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .reduce((sum, entry) => sum + whole(entry && entry.amount), 0);
}
function fundLedgerDelta(beforeReserve = {}, reserve = {}) {
  const beforeEntries = Array.isArray(beforeReserve.fundLedger) ? beforeReserve.fundLedger : [];
  const afterEntries = Array.isArray(reserve.fundLedger) ? reserve.fundLedger : [];
  return {
    before: sumFundEntries(beforeEntries),
    after: sumFundEntries(afterEntries),
    delta: sumFundEntries(afterEntries) - sumFundEntries(beforeEntries),
    changed: afterEntries.length !== beforeEntries.length || sumFundEntries(afterEntries) !== sumFundEntries(beforeEntries)
  };
}
function visitorAudit(reserve = {}, beforeVisitors = 0) {
  let breakdown = null;
  try {
    breakdown = require("./chapterTargets").chapterVisitorBreakdown(reserve);
  } catch (_) {
    breakdown = { total: whole(beforeVisitors), inherited: 0, migrated: 0, recruited: 0, facility: 0, task: 0, share: 0, lost: 0 };
  }
  const expected = ["inherited", "migrated", "recruited", "facility", "task", "share"]
    .reduce((sum, key) => sum + whole(breakdown[key]), 0) - whole(breakdown.lost);
  return Object.assign({}, breakdown, {
    opening: whole(beforeVisitors),
    expected,
    ending: whole(breakdown.total),
    closureDelta: whole(breakdown.total) - expected,
    actionDelta: whole(breakdown.total) - whole(beforeVisitors),
    balanced: whole(breakdown.total) === expected
  });
}
function beginReserveLedgerAudit(reserve = {}, beforeReserve = {}, day) {
  const beforeEcology = ecologyOf(beforeReserve);
  const opening = {
    fund: Math.max(0, whole(beforeReserve.fund)),
    visitors: (() => {
      try { return whole(require("./chapterTargets").chapterVisitorTotal(beforeReserve)); } catch (_) { return 0; }
    })(),
    animals: livingStock(beforeReserve),
    water: bounded(beforeEcology.water),
    grass: bounded(beforeEcology.grass)
  };
  reserve._ledgerAuditContext = { day: Math.max(1, whole(day, dayOf(reserve))), opening };
  beginEcologyFlowLedger(reserve, reserve._ledgerAuditContext.day, beforeEcology);
  return reserve._ledgerAuditContext;
}
function finalizeReserveLedgerAudit(reserve = {}, beforeReserve = {}, options = {}) {
  const context = reserve._ledgerAuditContext || beginReserveLedgerAudit(reserve, beforeReserve, options.day);
  const economy = sumEconomy(reserve.economyLedger || {});
  const fundEnding = Math.max(0, whole(reserve.fund));
  const fundEntries = fundLedgerDelta(beforeReserve, reserve);
  const actualFundDelta = fundEnding - context.opening.fund;
  const fundSourceNet = fundEntries.changed ? fundEntries.delta : economy.net;
  const fundExpected = context.opening.fund + fundSourceNet;
  const animal = animalSourceSummary(reserve);
  const visitors = visitorAudit(reserve, context.opening.visitors);
  const ecology = reconcileEcologyFlow(reserve, context.day, options.source || "系统自动结算");
  const audit = {
    version: 1,
    day: context.day,
    fund: {
      opening: context.opening.fund,
      ending: fundEnding,
      income: economy.income,
      expense: economy.expense,
      ledgerNet: fundEntries.delta,
      economyNet: economy.net,
      economyClosureDelta: actualFundDelta - economy.net,
      expected: fundExpected,
      closureDelta: fundEnding - fundExpected,
      balanced: fundEnding === fundExpected,
      source: fundEntries.changed ? "基金流水" : "经济结算"
    },
    visitors,
    animals: Object.assign({}, animal, {
      openingAction: context.opening.animals,
      balanced: whole(animal.closureDelta) === 0,
      unattributedDelta: whole(animal.closureDelta)
    }),
    ecology,
    balanced: fundEnding === fundExpected && visitors.balanced && whole(animal.closureDelta) === 0 && ecology.balanced
  };
  reserve.ledgerAudit = audit;
  delete reserve._ledgerAuditContext;
  return audit;
}
module.exports = {
  ensureEcologyFlowLedger,
  beginEcologyFlowLedger,
  recordEcologyFlow,
  applyEcologyFlow,
  reconcileEcologyFlow,
  beginReserveLedgerAudit,
  finalizeReserveLedgerAudit,
  sumEconomy,
  fundLedgerDelta,
  visitorAudit
};
