const { PACE_ECONOMY, paceChapter, paceSellFundFreeBatches, paceSellFundFreeCap } = require("./balanceConfig");
const { addSupply } = require("./resourceLedger");
const RECOVERED_GOOD_ORDER = Object.freeze([
  "shedAntlerA",
  "shedAntlerB",
  "naturalHide",
  "researchSample",
  "recoveredTrap"
]);
const RECOVERED_GOOD_LABELS = Object.freeze({
  shedAntlerA: "A级岩角",
  shedAntlerB: "B级岩角",
  naturalHide: "自然生命档案",
  researchSample: "研究样本",
  recoveredTrap: "隐踪器"
});
const SUPPLY_LABELS = Object.freeze({
  dogFood: "犬粮",
  fieldKit: "野外工具包",
  medicalKit: "医疗包",
  alarm: "警报器",
  evidenceTrap: "诱迹机关",
  tranquilizer: "阻滞弹"
});
const SUPPLY_FROM_GOOD = Object.freeze({
  researchSample: Object.freeze([{ id: "dogFood", amount: 2 }, { id: "fieldKit", amount: 1 }]),
  shedAntlerB: Object.freeze([{ id: "fieldKit", amount: 1 }]),
  shedAntlerA: Object.freeze([{ id: "fieldKit", amount: 1 }, { id: "medicalKit", amount: 1 }]),
  naturalHide: Object.freeze([{ id: "medicalKit", amount: 1 }]),
  recoveredTrap: Object.freeze([{ id: "evidenceTrap", amount: 1 }, { id: "alarm", amount: 1 }])
});
function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function recoveredGoodBasePrice(id, market = {}) {
  if (id === "shedAntlerA") return Math.max(130, Math.round((market.antler || 86) * 1.45));
  if (id === "shedAntlerB") return Math.max(95, market.antler || 86);
  if (id === "naturalHide") return Math.max(145, market.hideSalvage || 124);
  if (id === "researchSample") return Math.max(60, market.researchSample || 42);
  if (id === "recoveredTrap") return 85;
  return 0;
}
function guardianDayOf(reserve = {}) {
  return Math.max(1, Math.round(safeNumber((reserve.guardianCycle || {}).day, 1)));
}
function emptyDailySellFund(day = 1, chapter = 1) {
  const freeBatches = paceSellFundFreeBatches();
  return {
    version: 1,
    lastGuardianDay: Math.max(1, Math.round(Number(day) || 1)),
    lastChapter: Math.max(1, Math.round(Number(chapter) || 1)),
    soldFund: 0,
    soldTimes: 0,
    unlockedBatches: freeBatches,
    unlockClaimCount: 0,
    unlockClaimCountToday: 0,
    lastUnlock: null
  };
}
function inferredSoldTimes(previous = {}, sameChapter = false) {
  if (!sameChapter) return 0;
  if (previous.soldTimes != null && Number.isFinite(Number(previous.soldTimes))) {
    return Math.max(0, Math.round(Number(previous.soldTimes)));
  }
  return Math.max(0, Math.round(safeNumber(previous.soldFund, 0))) > 0 ? 1 : 0;
}
function migrateUnlockedBatches(previous = {}, sameChapter = false, freeBatches = 2) {
  if (!sameChapter) return freeBatches;
  const raw = Math.max(0, Math.round(safeNumber(previous.unlockedBatches, freeBatches)));
  const watchedAd = Math.round(safeNumber(previous.unlockClaimCount, 0)) > 0 || !!previous.lastUnlock;
  if (!previous.lastChapter && !watchedAd && raw === 3) return freeBatches;
  return Math.max(freeBatches, raw);
}
function normalizeDailySellFund(reserve = {}) {
  const day = guardianDayOf(reserve);
  const chapter = paceChapter(reserve);
  const previous = (reserve && reserve.dailySellFund) || {};
  const previousChapter = Math.max(0, Math.round(safeNumber(previous.lastChapter, 0)));
  const sameChapter = previousChapter === 0 || previousChapter === chapter;
  const sameDay = Math.round(safeNumber(previous.lastGuardianDay, 0)) === day;
  const freeBatches = paceSellFundFreeBatches();
  reserve.dailySellFund = {
    version: 1,
    lastGuardianDay: day,
    lastChapter: chapter,
    soldFund: sameChapter ? Math.max(0, Math.round(safeNumber(previous.soldFund, 0))) : 0,
    soldTimes: inferredSoldTimes(previous, sameChapter),
    unlockedBatches: migrateUnlockedBatches(previous, sameChapter, freeBatches),
    unlockClaimCount: Math.max(0, Math.round(safeNumber(previous.unlockClaimCount, 0))),
    unlockClaimCountToday: sameDay ? Math.max(0, Math.round(safeNumber(previous.unlockClaimCountToday, 0))) : 0,
    lastUnlock: sameChapter ? previous.lastUnlock || null : null
  };
  return reserve.dailySellFund;
}
function inventoryHasRecoveredGoods(reserve = {}) {
  return RECOVERED_GOOD_ORDER.some((id) => Math.max(0, Math.round(safeNumber((reserve.inventory || {})[id], 0))) > 0);
}
function leftoverNeedsUnlock(reserve = {}, remainingTimes = 0) {
  return remainingTimes <= 0 && inventoryHasRecoveredGoods(reserve);
}
function sellFundCapStatus(reserve = {}) {
  const state = normalizeDailySellFund(reserve);
  const chapter = paceChapter(reserve);
  const cap = paceSellFundFreeCap(chapter);
  const freeBatches = paceSellFundFreeBatches();
  const batches = Math.max(freeBatches, Math.round(safeNumber(state.unlockedBatches, freeBatches)));
  const soldTimes = Math.max(0, Math.round(safeNumber(state.soldTimes, 0)));
  const remainingTimes = Math.max(0, batches - soldTimes);
  const soldFund = Math.max(0, Math.round(safeNumber(state.soldFund, 0)));
  const remaining = remainingTimes > 0 ? Number.MAX_SAFE_INTEGER : 0;
  const unlockDailyCap = Math.max(0, Math.round(safeNumber(PACE_ECONOMY.sellUnlockAdDailyCap, 0)));
  const unlockUsed = Math.max(0, Math.round(safeNumber(state.unlockClaimCountToday, 0)));
  const unlimitedUnlock = unlockDailyCap <= 0;
  const unlockRemaining = unlimitedUnlock ? Number.MAX_SAFE_INTEGER : Math.max(0, unlockDailyCap - unlockUsed);
  const firstDay = Math.max(1, Math.round(safeNumber(PACE_ECONOMY.sellUnlockAdFirstGuardianDay, 1)));
  const onboarding = state.lastGuardianDay < firstDay;
  const needsUnlock = leftoverNeedsUnlock(reserve, remainingTimes);
  return {
    day: state.lastGuardianDay,
    lastChapter: state.lastChapter,
    chapter,
    cap,
    freeBatches,
    batches,
    allowance: batches,
    soldFund,
    soldTimes,
    remaining,
    remainingTimes,
    freeSellsLeft: remainingTimes,
    unlockUsed,
    unlockRemaining,
    unlockDailyCap,
    unlimitedUnlock,
    onboarding,
    needsUnlock,
    reason: onboarding ? "onboarding" : !needsUnlock ? "allowance" : "",
    adEligible: !onboarding && needsUnlock
  };
}
function remainingSellFundAllowance(reserve) {
  if (!reserve || typeof reserve !== "object") return Number.MAX_SAFE_INTEGER;
  return sellFundCapStatus(reserve).remaining;
}
function recordSellFundGrant(reserve, amount) {
  if (!reserve || typeof reserve !== "object") return null;
  const granted = Math.max(0, Math.round(safeNumber(amount, 0)));
  if (!granted) return sellFundCapStatus(reserve);
  const state = normalizeDailySellFund(reserve);
  state.soldFund = Math.max(0, Math.round(safeNumber(state.soldFund, 0))) + granted;
  state.soldTimes = Math.max(0, Math.round(safeNumber(state.soldTimes, 0))) + 1;
  return sellFundCapStatus(reserve);
}
function applySellUnlockAd(reserve) {
  const status = sellFundCapStatus(reserve);
  if (status.onboarding) return { ok: false, reason: "onboarding", status };
  if (!status.needsUnlock) return { ok: false, reason: "allowance", status };
  const state = reserve.dailySellFund;
  const unlocked = Math.max(1, paceSellFundFreeBatches());
  state.unlockedBatches = Math.max(paceSellFundFreeBatches(), Math.round(safeNumber(state.unlockedBatches, paceSellFundFreeBatches()))) + unlocked;
  state.unlockClaimCount = Math.max(0, Math.round(safeNumber(state.unlockClaimCount, 0))) + 1;
  state.unlockClaimCountToday = Math.max(0, Math.round(safeNumber(state.unlockClaimCountToday, 0))) + 1;
  state.lastUnlock = { day: status.day, sells: unlocked };
  return { ok: true, unlocked, status: sellFundCapStatus(reserve) };
}
function saleDescription(counts = {}, labels = RECOVERED_GOOD_LABELS) {
  return Object.keys(counts)
    .filter((id) => (counts[id] || 0) > 0)
    .map((id) => `${labels[id] || id}×${counts[id]}`)
    .join(" / ");
}
function leftoverFromInventory(inventory = {}, soldCounts = {}) {
  const leftoverCounts = {};
  let leftover = 0;
  RECOVERED_GOOD_ORDER.forEach((id) => {
    const left = Math.max(0, Math.round(safeNumber((inventory || {})[id], 0)) - Math.max(0, Math.round(safeNumber(soldCounts[id], 0))));
    if (left > 0) {
      leftoverCounts[id] = left;
      leftover += left;
    }
  });
  return { leftoverCounts, leftover };
}
function planCappedRecoveredSale(inventory = {}, reserve = null, options = {}) {
  const limit = Number.isFinite(Number(options.limit))
    ? Math.max(0, Math.round(Number(options.limit)))
    : 3;
  const preferredId = options.preferredId || "";
  const market = (reserve && reserve.market) || options.market || {};
  const modifier = Number.isFinite(Number(options.modifier)) ? Number(options.modifier) : 1;
  const remainingStart = options.ignoreCap || !reserve
    ? Number.MAX_SAFE_INTEGER
    : remainingSellFundAllowance(reserve);
  const order = preferredId && RECOVERED_GOOD_ORDER.includes(preferredId)
    ? [preferredId]
    : RECOVERED_GOOD_ORDER.slice();
  const sold = [];
  const counts = {};
  let baseValue = 0;
  let value = 0;
  let remaining = remainingStart;
  let clipped = false;
  order.forEach((id) => {
    let stock = Math.max(0, Math.round(safeNumber((inventory || {})[id], 0)));
    while (stock > 0 && sold.length < limit && remaining > 0) {
      const itemBase = recoveredGoodBasePrice(id, market);
      if (itemBase <= 0 || itemBase > remaining) break;
      const raw = Math.max(0, Math.round(itemBase * modifier));
      const grant = Math.min(raw, remaining);
      stock -= 1;
      sold.push(id);
      counts[id] = (counts[id] || 0) + 1;
      baseValue += itemBase;
      value += grant;
      remaining -= grant;
      if (grant < raw) clipped = true;
    }
  });
  const leftover = leftoverFromInventory(inventory, counts);
  const timesLeft = reserve ? sellFundCapStatus(reserve).remainingTimes : 1;
  const blocked = timesLeft <= 0;
  return {
    sold,
    counts,
    leftoverCounts: blocked ? leftover.leftoverCounts : {},
    leftover: blocked ? leftover.leftover : 0,
    baseValue,
    value,
    remainingBefore: remainingStart,
    remainingAfter: remaining,
    clipped,
    description: saleDescription(counts),
    leftoverDescription: saleDescription(leftover.leftoverCounts)
  };
}
function applyCappedRecoveredSale(inventory, reserve, plan, recordCap = true) {
  if (!plan || !Array.isArray(plan.sold) || !plan.sold.length) return plan;
  const stock = inventory || {};
  plan.sold.forEach((id) => {
    stock[id] = Math.max(0, Math.round(safeNumber(stock[id], 0)) - 1);
  });
  if (recordCap && reserve && plan.value > 0) recordSellFundGrant(reserve, plan.value);
  return plan;
}
function tryConvertOneGood(reserve, goodId) {
  const recipes = SUPPLY_FROM_GOOD[goodId] || [];
  if (!recipes.length) return null;
  if (goodId === "shedAntlerA") {
    const grants = [];
    recipes.forEach((recipe) => {
      const amount = addSupply(reserve, recipe.id, recipe.amount);
      if (amount > 0) grants.push({ id: recipe.id, amount, label: SUPPLY_LABELS[recipe.id] || recipe.id });
    });
    return grants.length ? grants : null;
  }
  for (let index = 0; index < recipes.length; index += 1) {
    const recipe = recipes[index];
    const amount = addSupply(reserve, recipe.id, recipe.amount);
    if (amount > 0) return [{ id: recipe.id, amount, label: SUPPLY_LABELS[recipe.id] || recipe.id }];
  }
  return null;
}
function convertRecoveredGoodsToSupplies(reserve, options = {}) {
  if (!reserve || typeof reserve !== "object") {
    return { converted: [], grants: [], count: 0, blocked: 0 };
  }
  const inventory = reserve.inventory || (reserve.inventory = {});
  const preferredId = options.preferredId || "";
  const modifier = Number.isFinite(Number(options.modifier)) ? Number(options.modifier) : 1;
  const onlyLeftover = options.onlyLeftover !== false;
  const plan = options.plan || (onlyLeftover
    ? planCappedRecoveredSale(inventory, reserve, {
      limit: Number.MAX_SAFE_INTEGER,
      preferredId,
      modifier
    })
    : { counts: {} });
  const targets = preferredId && RECOVERED_GOOD_ORDER.includes(preferredId)
    ? [preferredId]
    : RECOVERED_GOOD_ORDER.slice();
  const converted = [];
  const grants = [];
  let blocked = 0;
  targets.forEach((id) => {
    const keep = onlyLeftover ? Math.max(0, Math.round(safeNumber((plan.counts || {})[id], 0))) : 0;
    let qty = Math.max(0, Math.round(safeNumber(inventory[id], 0)) - keep);
    while (qty > 0) {
      const itemGrants = tryConvertOneGood(reserve, id);
      if (!itemGrants) {
        blocked += qty;
        break;
      }
      inventory[id] = Math.max(0, Math.round(safeNumber(inventory[id], 0)) - 1);
      qty -= 1;
      converted.push(id);
      itemGrants.forEach((grant) => grants.push(grant));
    }
  });
  const grantCounts = {};
  grants.forEach((grant) => {
    grantCounts[grant.id] = (grantCounts[grant.id] || 0) + grant.amount;
  });
  const grantDescription = Object.keys(grantCounts)
    .map((id) => `${SUPPLY_LABELS[id] || id}+${grantCounts[id]}`)
    .join(" / ");
  return {
    converted,
    grants,
    count: converted.length,
    blocked,
    grantCounts,
    grantDescription,
    description: saleDescription(converted.reduce((counts, id) => {
      counts[id] = (counts[id] || 0) + 1;
      return counts;
    }, {}))
  };
}
module.exports = {
  RECOVERED_GOOD_ORDER,
  RECOVERED_GOOD_LABELS,
  SUPPLY_LABELS,
  recoveredGoodBasePrice,
  paceSellFundFreeBatches,
  paceSellFundFreeCap,
  emptyDailySellFund,
  normalizeDailySellFund,
  sellFundCapStatus,
  remainingSellFundAllowance,
  recordSellFundGrant,
  applySellUnlockAd,
  planCappedRecoveredSale,
  applyCappedRecoveredSale,
  convertRecoveredGoodsToSupplies
};
