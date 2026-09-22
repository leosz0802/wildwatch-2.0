const { BALANCE_V2, supplyCapFor } = require("./balanceConfig");

function amountTotal(group) {
  return Object.values(group || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
}

function addPendingRecovered(reserve, key, amount = 1) {
  if (!reserve || !key || amount <= 0) return 0;
  reserve.pendingRecovered = reserve.pendingRecovered || {};
  const room = Math.max(0, BALANCE_V2.caps.pendingRecovered - amountTotal(reserve.pendingRecovered));
  const accepted = Math.max(0, Math.min(room, Math.round(Number(amount) || 0)));
  reserve.pendingRecovered[key] = Math.max(0, Number(reserve.pendingRecovered[key]) || 0) + accepted;
  return accepted;
}

function addSupply(reserve, key, amount = 1) {
  if (!reserve || !key || amount <= 0) return 0;
  reserve.supplies = reserve.supplies || {};
  const cap = supplyCapFor(key, reserve);
  if (!Number.isFinite(cap)) return 0;
  const before = Math.max(0, Number(reserve.supplies[key]) || 0);
  const accepted = Math.max(0, Math.min(cap - before, Math.round(Number(amount) || 0)));
  reserve.supplies[key] = before + accepted;
  return accepted;
}

// 旧策略配置中的 fund 负值表示项目后勤投入，而不是玩家可见基金扣款。
// 旧实现对每个 -8/-15/-20 都向上取整为 1 份补给，持续后果会把很小的
// 周期成本放大数倍。这里改为累计满 100 才消耗 1 份现有补给；库存不足
// 时不再暗扣草场，避免玩家无法解释的生态下降。
function consumeProjectPreparation(reserve, amount = 0) {
  if (!reserve || Number(amount) >= 0) return { requested: 0, consumed: 0, carry: 0 };
  reserve.resourceAging = reserve.resourceAging || {};
  const previousCarry = Math.max(0, Math.min(99, Math.round(Number(reserve.resourceAging.projectCostCarry) || 0)));
  const total = previousCarry + Math.max(0, Math.round(Math.abs(Number(amount) || 0)));
  const requested = Math.min(2, Math.floor(total / 100));
  reserve.resourceAging.projectCostCarry = total % 100;
  reserve.supplies = reserve.supplies || {};
  let remaining = requested;
  let consumed = 0;
  ["dogFood", "alarm", "fieldKit", "medicalKit", "tranquilizer"]
    .sort((a, b) => (reserve.supplies[b] || 0) - (reserve.supplies[a] || 0))
    .forEach((id) => {
      if (remaining <= 0) return;
      const used = Math.min(remaining, Math.max(0, Number(reserve.supplies[id]) || 0));
      reserve.supplies[id] = Math.max(0, (reserve.supplies[id] || 0) - used);
      remaining -= used;
      consumed += used;
    });
  return { requested, consumed, carry: reserve.resourceAging.projectCostCarry };
}

module.exports = {
  amountTotal,
  addPendingRecovered,
  addSupply,
  consumeProjectPreparation
};
