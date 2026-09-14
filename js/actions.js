const { BALANCE_V2, supplyPrice } = require("./balanceConfig");

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
    label: "麻醉弹",
    itemLabel: "麻醉弹",
    icon: "tranquilizer",
    amount: 2,
    cost: 75,
    target: 3,
    command: "采购麻醉弹",
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
    label: "证据陷阱",
    itemLabel: "证据陷阱",
    icon: "eye",
    amount: 1,
    cost: 90,
    target: 2,
    command: "采购证据陷阱",
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
    placeholder: "例如：移交仓库里的脱落鹿角和研究样本",
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
    placeholder: "例如：麻醉转移过度靠近水源的鹿，避免草场被啃空",
    effect: "消耗麻醉弹 / 控制种群 / 稳草场",
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

function reserveActionCatalog() {
  return RESERVE_ACTIONS.map((action) => Object.assign({}, action));
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
    cap: BALANCE_V2.supplyCaps[item.id]
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

function supplyReplenishmentPlan(reserveOrLevel) {
  const reserve = reserveOrLevel || {};
  const supplies = reserve.supplies || {};
  const items = supplyPurchaseCatalog(reserve).map((purchase) => {
    const missing = Math.max(0, Math.min(purchase.cap || purchase.target, purchase.target - (supplies[purchase.id] || 0)));
    return supplyPurchaseForQuantity(purchase.id, missing, reserve);
  }).filter((purchase) => purchase && purchase.amount > 0);
  const cost = items.reduce((sum, purchase) => sum + purchase.cost, 0);
  const amount = items.reduce((sum, purchase) => sum + purchase.amount, 0);
  const list = items.map((purchase) => `${purchase.id}=${purchase.amount}`).join(",");
  return {
    id: "all",
    batch: true,
    label: "一键补齐",
    itemLabel: "全部短缺补给",
    icon: "buySupplies",
    amount,
    cost,
    target: items.length,
    cap: items.length,
    items,
    command: `补齐全部短缺补给 清单:${list}`,
    use: "把所有补给补到安全线"
  };
}

module.exports = {
  reserveActionCatalog,
  reserveActionById,
  reserveActionMeta,
  supplyPurchaseCatalog,
  supplyPurchaseById,
  supplyPurchaseForQuantity,
  supplyReplenishmentPlan,
  supplySaleEnabled,
  actionSupplyRequirement
};
