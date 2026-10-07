const { BALANCE_V2, supplyPrice, supplyCapFor, fundHealth, levelOf } = require("./balanceConfig");
const SUPPLY_PURCHASES = [
  {
    id: "dogFood",
    label: "狗粮包",
    itemLabel: "狗粮",
    icon: "dogFood",
    amount: 4,
    cost: 50,
    target: 6,
    command: "采购狗粮包",
    use: "猎犬侦察",
    saleEnabled: true
  },
  {
    id: "alarm",
    label: "警报器",
    itemLabel: "警报器",
    icon: "signal",
    amount: 1,
    cost: 65,
    target: 2,
    command: "采购警报器",
    use: "驱赶偷猎",
    saleEnabled: true
  },
  {
    id: "tranquilizer",
    label: "阻滞弹",
    itemLabel: "阻滞弹",
    icon: "tranquilizer",
    amount: 2,
    cost: 75,
    target: 3,
    command: "采购阻滞弹",
    use: "生态干预",
    saleEnabled: true
  },
  {
    id: "fieldKit",
    label: "野外工具包",
    itemLabel: "野外工具包",
    icon: "fieldKit",
    amount: 1,
    cost: 45,
    target: 2,
    command: "采购野外工具包",
    use: "修复栖息地",
    saleEnabled: true
  },
  {
    id: "medicalKit",
    label: "医疗包",
    itemLabel: "医疗包",
    icon: "fieldKit",
    amount: 1,
    cost: 45,
    target: 2,
    command: "采购医疗包",
    use: "救助护理",
    saleEnabled: true
  },
  {
    id: "evidenceTrap",
    label: "诱迹机关",
    itemLabel: "诱迹机关",
    icon: "evidenceTrap",
    amount: 1,
    cost: 90,
    target: 2,
    command: "采购诱迹机关",
    use: "布设后固定偷猎证据",
    saleEnabled: true
  }
];
const RESERVE_ACTIONS = [
  {
    id: "houndScout",
    label: "猎犬侦察",
    icon: "houndScout",
    template: "派猎犬侦察",
    hint: "找陷阱、脚印和偷猎者线索。",
    placeholder: "例如：派猎犬队去中央混交林搜寻陷阱和陌生气味",
    effect: "消耗狗粮 / 搜查风险 / 发现回收物",
    rewardPreview: "偷猎压力- · 可能发现物资",
    cost: 0
  },
  {
    id: "antiPoacher",
    label: "驱赶偷猎",
    icon: "antiPoacher",
    template: "驱赶偷猎者",
    hint: "压低偷猎压力，保护边界。",
    placeholder: "例如：派巡护队去西部岩坡洞域排查可疑人影",
    effect: "消耗警报器 / 压低偷猎 / 保护草场",
    rewardPreview: "偷猎压力- · 草场更稳",
    cost: 0
  },
  {
    id: "habitat",
    label: "修复栖息地",
    icon: "habitat",
    template: "修复水源和草场",
    hint: "改善水源、草场和迁徙路线。",
    placeholder: "例如：去东部河岸湿地修复水源，观察鹿群迁移",
    effect: "消耗野外工具包 / 修复水源草场 / 拉回迁移",
    rewardPreview: "水草+ · 迁移更稳",
    cost: 0
  },
  {
    id: "salvage",
    label: "移交守护样本",
    icon: "salvage",
    template: "移交守护样本",
    hint: "把巡护中取得的样本交给科研站或执法部门，换回下一轮守护资源。",
    placeholder: "例如：移交仓库里的脱落岩角和研究样本",
    effect: "移交库存 / 获得保护基金 / 支持下一轮巡护",
    rewardPreview: "保护基金+",
    cost: 0
  },
  {
    id: "intervention",
    label: "生态干预",
    icon: "intervention",
    template: "执行许可内生态干预",
    hint: "控制数量或转移个体，避免生态失衡。",
    placeholder: "例如：阻滞转移过度靠近水源的鹿，避免草场被啃空",
    effect: "消耗阻滞弹 / 控制种群 / 稳草场",
    rewardPreview: "草场稳 · 信任波动",
    cost: 0
  },
  {
    id: "buySupplies",
    label: "采购补给",
    icon: "buySupplies",
    template: "分项采购保护物资",
    hint: "一键补齐全部短缺，或按数量采购单项补给。",
    placeholder: "例如：采购狗粮包",
    effect: "全部补齐或分项采购 / 消耗对应基金 / 扩大选择",
    rewardPreview: "指定补给+ · 猎犬体能",
    cost: 0
  },
  {
    id: "rareAuction",
    minChapter: 6,
    label: "珍稀幼崽竞拍",
    icon: "rare",
    template: "参与珍稀幼崽竞拍",
    hint: "第6章起每章一次。基础出价有上限，射箭得分决定最终出价。",
    placeholder: "例如：参与本章珍稀幼崽竞拍",
    effect: "冻结最高出价 · 守护日入夜公布，出价后最迟3个守护日一定获得",
    rewardPreview: "竞拍成功获得珍稀幼崽",
    cost: 0
  },
  {
    id: "rareAnimalCare",
    minChapter: 6,
    label: "照护珍稀幼崽",
    icon: "rare",
    template: "照护珍稀幼崽",
    hint: "每日一次，消耗水源2、草场2，维持健康和游客吸引力。",
    placeholder: "例如：去珍稀物种居所喂食并记录健康",
    effect: "水源-2 · 草场-2 · 健康+6",
    rewardPreview: "维持珍稀物种居住",
    cost: 0
  }
];
const ACTION_SUPPLY_IDS = {
  houndScout: "dogFood",
  antiPoacher: "alarm",
  habitat: "fieldKit",
  intervention: "tranquilizer"
};
function actionSupplyRequirement(action, reserve = {}) {
  const emergencyType = ((((reserve.emergency || {}).active) || {}).type) || "";
  const diseaseCare = action === "intervention" && (((reserve.ecology || {}).disease || 0) >= 28
    || ["disease_outbreak", "water_contamination", "wildfire"].includes(emergencyType));
  const id = diseaseCare ? "medicalKit" : ACTION_SUPPLY_IDS[action];
  const item = id && SUPPLY_PURCHASES.find((entry) => entry.id === id);
  return item ? { id, label: item.itemLabel, use: diseaseCare ? "隔离救治" : item.use } : null;
}
function reserveActionCatalog(chapter = 1) {
  const currentChapter = Math.max(1, Number(chapter) || 1);
  return RESERVE_ACTIONS
    .filter((action) => !action.minChapter || currentChapter >= action.minChapter)
    .map((action) => Object.assign({}, action));
}
function reserveActionById(id) {
  return RESERVE_ACTIONS.find((action) => action.id === id) || null;
}
function reserveActionMeta(id) {
  const action = reserveActionById(id);
  if (!action) return { label: "巡护", icon: "trail", cost: 1 };
  return {
    label: action.label,
    icon: action.icon,
    cost: action.cost
  };
}
function supplySaleEnabled(item, storeConfig = null) {
  if (!item || item.saleEnabled !== true) return false;
  const items = storeConfig && storeConfig.items && typeof storeConfig.items === "object" ? storeConfig.items : {};
  const override = items[item.id];
  if (override === false) return false;
  if (override && typeof override === "object" && override.saleEnabled === false) return false;
  return true;
}
function pricedSupply(item, reserveOrLevel, storeConfig = null) {
  if (!supplySaleEnabled(item, storeConfig)) return null;
  return Object.assign({}, item, {
    baseCost: item.cost,
    cost: supplyPrice(item.id, reserveOrLevel),
    cap: supplyCapFor(item.id, reserveOrLevel)
  });
}
function supplyPurchaseCatalog(reserveOrLevel, storeConfig = null) {
  return SUPPLY_PURCHASES.map((item) => pricedSupply(item, reserveOrLevel, storeConfig)).filter(Boolean);
}
function supplyPurchaseById(id, reserveOrLevel, storeConfig = null) {
  return pricedSupply(SUPPLY_PURCHASES.find((item) => item.id === id) || null, reserveOrLevel, storeConfig);
}
function roundPurchaseCost(value) {
  return Math.max(5, Math.round((Number(value) || 0) / 5) * 5);
}
function supplyPurchaseForQuantity(id, quantity, reserveOrLevel) {
  const purchase = supplyPurchaseById(id, reserveOrLevel);
  if (!purchase) return null;
  const stock = Math.max(0, Number(reserveOrLevel && reserveOrLevel.supplies && reserveOrLevel.supplies[id]) || 0);
  const room = Math.max(0, Number(purchase.cap || 0) - stock);
  const amount = Math.max(0, Math.min(room, Math.round(Number(quantity) || 0)));
  const cost = amount > 0 ? roundPurchaseCost((purchase.cost || 0) * amount / Math.max(1, purchase.amount || 1)) : 0;
  return Object.assign({}, purchase, {
    amount,
    cost,
    requestedAmount: Math.max(0, Math.round(Number(quantity) || 0)),
    command: `采购${purchase.itemLabel} 数量:${amount}`
  });
}
const SAFETY_REPLENISH_LIMIT = 2;
function supplyReplenishCount(reserve = {}) {
  const progression = (reserve && reserve.progression) || {};
  const stored = Number(progression.supplyReplenishCount);
  const ledgerCount = Array.isArray(reserve.fundLedger)
    ? reserve.fundLedger.filter((entry) => entry && entry.type === "expense"
      && entry.source === "补给采购" && Number(entry.amount) < 0).length
    : 0;
  if (Number.isFinite(stored) && stored >= 0) return Math.max(Math.round(stored), ledgerCount, 0);
  if (ledgerCount > 0) return ledgerCount;
  if (progression.supplyCapUnlocked === true) return SAFETY_REPLENISH_LIMIT;
  const last = reserve && reserve.lastPurchase;
  if (last && !last.blocked && Number(last.amount) > 0) return 1;
  return 0;
}
function supplyReplenishUsesSafetyLine(reserve = {}) {
  return supplyReplenishCount(reserve) < SAFETY_REPLENISH_LIMIT;
}
function supplyReplenishFundFloor(reserve = {}) {
  if (!supplyReplenishUsesSafetyLine(reserve)) return 0;
  const health = fundHealth(levelOf(reserve)) || {};
  const fund = Math.max(0, Number(reserve.fund) || 0);
  const healthyMin = Math.max(0, Number(health.healthyMin) || 0);
  const danger = Math.max(0, Number(health.danger) || 0);
  if (fund > healthyMin) return healthyMin;
  if (fund > danger) return danger;
  return 0;
}
function supplyFillLine(purchaseOrId, reserve = {}) {
  const purchase = typeof purchaseOrId === "string"
    ? supplyPurchaseById(purchaseOrId, reserve)
    : purchaseOrId;
  if (!purchase) return 0;
  const line = supplyReplenishUsesSafetyLine(reserve) ? purchase.target : purchase.cap;
  return Math.max(0, Number(line) || Number(purchase.cap) || 0);
}
function supplySafetyLineMet(reserve = {}) {
  const supplies = reserve.supplies || {};
  return supplyPurchaseCatalog(reserve).every((purchase) => {
    const stock = Math.max(0, Number(supplies[purchase.id]) || 0);
    const line = Math.max(0, Number(purchase.target) || 0);
    return stock >= line;
  });
}
function purchaseCostForAmount(id, amount, reserve) {
  if (amount <= 0) return 0;
  const priced = supplyPurchaseForQuantity(id, amount, reserve);
  return priced && priced.amount === amount ? priced.cost : Infinity;
}
function maxAffordableSupplyQuantity(id, reserve = {}, requested = Number.MAX_SAFE_INTEGER, availableFund = null) {
  const purchase = supplyPurchaseById(id, reserve);
  if (!purchase) return 0;
  const stock = Math.max(0, Number(reserve.supplies && reserve.supplies[id]) || 0);
  const room = Math.max(0, Number(purchase.cap || 0) - stock);
  const limit = Math.max(0, Math.min(room, Math.round(Number(requested) || 0)));
  const budget = availableFund == null
    ? Math.max(0, Number(reserve.fund) || 0)
    : Math.max(0, Number(availableFund) || 0);
  let affordable = 0;
  for (let quantity = 1; quantity <= limit; quantity += 1) {
    const cost = purchaseCostForAmount(id, quantity, reserve);
    if (!Number.isFinite(cost) || cost > budget) break;
    affordable = quantity;
  }
  return affordable;
}
function optimizeSupplyPlan(desired, reserve, fund) {
  const budgetUnits = Math.max(0, Math.floor((Number(fund) || 0) / 5));
  if (!desired.length || budgetUnits <= 0) return [];
  let states = new Map([[0, { amount: 0, counts: [] }]]);
  desired.forEach((item) => {
    const choices = [{ amount: 0, costUnits: 0 }];
    for (let quantity = 1; quantity <= item.missing; quantity += 1) {
      const cost = purchaseCostForAmount(item.purchase.id, quantity, reserve);
      if (!Number.isFinite(cost)) break;
      choices.push({ amount: quantity, costUnits: Math.max(0, Math.ceil(cost / 5)) });
    }
    const next = new Map();
    states.forEach((state, usedUnits) => {
      choices.forEach((choice) => {
        const totalCost = usedUnits + choice.costUnits;
        if (totalCost > budgetUnits) return;
        const candidate = {
          amount: state.amount + choice.amount,
          counts: state.counts.concat(choice.amount)
        };
        const previous = next.get(totalCost);
        if (!previous || candidate.amount > previous.amount) next.set(totalCost, candidate);
      });
    });
    states = next;
  });
  let best = null;
  states.forEach((state, usedUnits) => {
    if (!best || state.amount > best.amount || (state.amount === best.amount && usedUnits < best.usedUnits)) {
      best = Object.assign({}, state, { usedUnits });
    }
  });
  if (!best || !best.amount) return [];
  return desired.map((item, index) => supplyPurchaseForQuantity(
    item.purchase.id,
    best.counts[index] || 0,
    reserve
  )).filter((purchase) => purchase && purchase.amount > 0);
}
function parseSupplyReplenishList(command, reserve) {
  const match = String(command || "").match(/清单:([a-zA-Z0-9,=]+)/);
  if (!match || !match[1]) return null;
  const requestedItems = match[1].split(",").map((part) => {
    const [id, raw] = part.split("=");
    return supplyPurchaseForQuantity(String(id || "").trim(), Number(raw) || 0, reserve);
  }).filter((item) => item && item.amount > 0);
  if (!requestedItems.length) return null;
  const requestedCost = requestedItems.reduce((sum, item) => sum + item.cost, 0);
  const requestedAmount = requestedItems.reduce((sum, item) => sum + item.amount, 0);
  const spendable = Math.max(0, (Number(reserve && reserve.fund) || 0) - supplyReplenishFundFloor(reserve));
  const desired = requestedItems.map((purchase) => ({
    purchase,
    stock: Math.max(0, Number(reserve.supplies && reserve.supplies[purchase.id]) || 0),
    missing: purchase.amount
  }));
  const items = requestedCost <= spendable ? requestedItems : optimizeSupplyPlan(desired, reserve, spendable);
  const cost = items.reduce((sum, item) => sum + item.cost, 0);
  const amount = items.reduce((sum, item) => sum + item.amount, 0);
  return {
    id: "all",
    batch: true,
    fillToCap: !supplyReplenishUsesSafetyLine(reserve),
    label: "一键补齐",
    itemLabel: "全部短缺补给",
    icon: "buySupplies",
    amount,
    cost,
    target: items.length,
    cap: items.length,
    items,
    requestedAmount,
    requestedCost,
    maxAffordableAmount: amount,
    partial: amount > 0 && amount < requestedAmount,
    unaffordable: requestedAmount > 0 && amount === 0,
    command: String(command)
  };
}
function supplyReplenishmentPlan(reserveOrLevel) {
  const reserve = reserveOrLevel || {};
  const supplies = reserve.supplies || {};
  const fund = Math.max(0, Number(reserve.fund) || 0);
  const spendable = Math.max(0, fund - supplyReplenishFundFloor(reserve));
  const catalog = supplyPurchaseCatalog(reserve);
  const fillToCap = !supplyReplenishUsesSafetyLine(reserve);
  const desired = catalog.map((purchase) => {
    const stock = Math.max(0, Number(supplies[purchase.id]) || 0);
    const line = fillToCap
      ? Math.max(0, Number(purchase.cap) || 0)
      : Math.max(0, Number(purchase.target) || 0);
    const missing = Math.max(0, line - stock);
    return { purchase, stock, missing };
  }).filter((item) => item.missing > 0);
  const fullItems = desired
    .map((item) => supplyPurchaseForQuantity(item.purchase.id, item.missing, reserve))
    .filter((purchase) => purchase && purchase.amount > 0);
  const fullCost = fullItems.reduce((sum, purchase) => sum + purchase.cost, 0);
  const requestedAmount = desired.reduce((sum, item) => sum + item.missing, 0);
  let items = fullCost <= spendable ? fullItems : optimizeSupplyPlan(desired, reserve, spendable);
  items = items.map((purchase) => Object.assign({}, purchase, {
    target: Math.max(0, Number(supplies[purchase.id]) || 0) + Math.max(0, Number(purchase.amount) || 0)
  }));
  const cost = items.reduce((sum, purchase) => sum + purchase.cost, 0);
  const amount = items.reduce((sum, purchase) => sum + purchase.amount, 0);
  const list = items.map((purchase) => `${purchase.id}=${purchase.amount}`).join(",");
  return {
    id: "all",
    batch: true,
    fillToCap,
    label: "一键补齐",
    itemLabel: "全部短缺补给",
    icon: "buySupplies",
    amount,
    cost: items.length ? cost : Math.max(fullCost, 1),
    target: items.length,
    cap: items.length,
    items,
    requestedAmount,
    requestedCost: fullCost,
    maxAffordableAmount: amount,
    partial: amount > 0 && amount < requestedAmount,
    unaffordable: !!(desired.length && !items.length),
    command: `补齐全部短缺补给 清单:${list}`,
    use: fillToCap ? "按当前基金购买可负担的最大数量" : "按当前基金补到巡护安全线"
  };
}
module.exports = {
  reserveActionCatalog,
  reserveActionById,
  reserveActionMeta,
  supplyPurchaseCatalog,
  supplyPurchaseById,
  supplyPurchaseForQuantity,
  maxAffordableSupplyQuantity,
  supplyReplenishmentPlan,
  parseSupplyReplenishList,
  supplyReplenishCount,
  supplyReplenishUsesSafetyLine,
  supplyFillLine,
  supplySafetyLineMet,
  SAFETY_REPLENISH_LIMIT,
  supplySaleEnabled,
  actionSupplyRequirement
};
