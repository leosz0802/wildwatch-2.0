const MAX_FUND_LEDGER_ENTRIES = 500;
function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
function dayKey(value) {
  const number = Math.round(finite(value, NaN));
  return Number.isFinite(number) && number > 0 ? String(number) : String(value || "");
}
function normalizeFundEntry(entry = {}, fallbackDay = 0) {
  const rawAmount = Math.round(finite(entry.amount, 0));
  const type = entry.type === "expense" || rawAmount < 0 ? "expense" : "income";
  const amount = type === "expense" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
  const legacySource = String(entry.source || "其他收入");
  const source = legacySource === "游客招募收入" || legacySource === "游客招募" ? "游客消费贡献收入" : legacySource;
  return {
    id: String(entry.id || `fund_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    type,
    amount,
    source,
    day: Math.max(0, Math.round(finite(entry.day, fallbackDay))),
    balance: Number.isFinite(Number(entry.balance)) ? Math.round(Number(entry.balance)) : undefined,
    before: Number.isFinite(Number(entry.before)) ? Math.round(Number(entry.before)) : undefined,
    note: String(entry.note || ""),
    timestamp: Math.max(0, Math.round(finite(entry.timestamp, Date.now())))
  };
}
function ensureFundLedger(reserve = {}) {
  const current = Array.isArray(reserve.fundLedger) ? reserve.fundLedger : [];
  reserve.fundLedger = current
    .map((entry) => normalizeFundEntry(entry))
    .filter((entry) => entry.amount !== 0)
    .slice(-MAX_FUND_LEDGER_ENTRIES);
  return reserve.fundLedger;
}
function appendFundLedgerEntry(reserve = {}, entry = {}) {
  const normalized = normalizeFundEntry(entry, entry.day || ((reserve.guardianCycle || {}).day || 0));
  if (!normalized.amount) return null;
  const ledger = ensureFundLedger(reserve);
  ledger.push(normalized);
  reserve.fundLedger = ledger.slice(-MAX_FUND_LEDGER_ENTRIES);
  return normalized;
}
function recordFundChange(reserve = {}, before, after, source = "其他收入", day, note = "") {
  const previous = Math.round(finite(before, 0));
  const next = Math.round(finite(after, previous));
  const delta = next - previous;
  if (!delta) return null;
  return appendFundLedgerEntry(reserve, {
    type: delta < 0 ? "expense" : "income",
    amount: delta,
    source,
    day: day || ((reserve.guardianCycle || {}).day || 0),
    before: previous,
    balance: next,
    note
  });
}
function ledgerFromEconomy(reserve = {}) {
  const ledger = reserve.economyLedger || {};
  const sources = ledger.sources || {};
  const sinks = ledger.sinks || {};
  const sourceLabels = {
    eventIncome: "事件恢复客流",
    operatingIncome: "游客运营收入",
    salvage: "回收物 / 样本移交",
    taskReward: "任务奖励",
    actionReward: "行动奖励",
    other: "其他收入"
  };
  const sinkLabels = {
    eventRefund: "事件游客退款",
    baseMaintenance: "日常维护",
    supplyPurchase: "补给采购",
    actionCost: "巡护行动",
    other: "其他支出"
  };
  const result = [];
  const day = Math.max(0, Math.round(finite(ledger.day, ((reserve.guardianCycle || {}).day || 0))));
  Object.keys(sourceLabels).forEach((key) => {
    const amount = Math.max(0, Math.round(finite(sources[key], 0)));
    if (amount) result.push({ type: "income", amount, source: sourceLabels[key], day, note: "从历史结算汇总恢复" });
  });
  Object.keys(sinkLabels).forEach((key) => {
    const amount = Math.max(0, Math.round(finite(sinks[key], 0)));
    if (amount) result.push({ type: "expense", amount: -amount, source: sinkLabels[key], day, note: "从历史结算汇总恢复" });
  });
  return result;
}
function ensureRecoverableFundLedger(reserve = {}) {
  const ledger = ensureFundLedger(reserve);
  if (ledger.length || !reserve.economyLedger) return ledger;
  const recovered = ledgerFromEconomy(reserve);
  if (!recovered.length) return ledger;
  let running = Math.round(finite(reserve.fund, 0));
  const net = recovered.reduce((sum, item) => sum + item.amount, 0);
  let before = running - net;
  recovered.forEach((item) => {
    const amount = item.amount;
    const after = before + amount;
    appendFundLedgerEntry(reserve, Object.assign({}, item, { before, balance: after }));
    before = after;
  });
  return reserve.fundLedger;
}
function mergedFundLedgerView(reserve = {}, currentDay) {
  ensureRecoverableFundLedger(reserve);
  const day = dayKey(currentDay || ((reserve.guardianCycle || {}).day || 0));
  const source = ensureFundLedger(reserve).slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const today = source.filter((entry) => day && dayKey(entry.day) === day);
  const historical = source.filter((entry) => !day || dayKey(entry.day) !== day);
  const groups = new Map();
  historical.forEach((entry) => {
    const key = `${entry.type}|${entry.source}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, Object.assign({}, entry, {
        amount: entry.amount,
        note: entry.note ? `${entry.note} · 历史合并` : "历史同类收支已合并",
        count: 1,
        firstDay: entry.day,
        lastDay: entry.day
      }));
    } else {
      existing.amount += entry.amount;
      existing.count += 1;
      existing.firstDay = Math.min(existing.firstDay || entry.day, entry.day || existing.firstDay || 0);
      existing.lastDay = Math.max(existing.lastDay || entry.day, entry.day || existing.lastDay || 0);
      if (existing.amount === 0) existing.note = `${existing.note.replace(/ · 净变化为0$/, "")} · 净变化为0`;
      if ((entry.timestamp || 0) > (existing.timestamp || 0)) {
        existing.timestamp = entry.timestamp;
        existing.balance = entry.balance;
      }
    }
  });
  const merged = Array.from(groups.values());
  merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return {
    entries: today.concat(merged),
    todayCount: today.length,
    historicalCount: historical.length,
    mergedHistoricalCount: merged.length,
    rawCount: source.length
  };
}
module.exports = {
  MAX_FUND_LEDGER_ENTRIES,
  normalizeFundEntry,
  ensureFundLedger,
  appendFundLedgerEntry,
  recordFundChange,
  ensureRecoverableFundLedger,
  mergedFundLedgerView
};
