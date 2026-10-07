const { ECOLOGY_THRESHOLDS } = require("./balanceConfig");
function habitatFocus(reserve = {}) {
  const eco = reserve.ecology || {};
  const water = Number(eco.water) || 0;
  const grass = Number(eco.grass) || 0;
  const waterGap = Math.max(0, ECOLOGY_THRESHOLDS.earlyWater - water);
  const grassGap = Math.max(0, ECOLOGY_THRESHOLDS.earlyGrass - grass);
  if (waterGap <= 0 && grassGap <= 0) return "";
  if (waterGap === grassGap) return water <= grass ? "water" : "grass";
  return waterGap > grassGap ? "water" : "grass";
}
function focusedHabitatGuidance(reserve = {}, focus = "water") {
  const eco = reserve.ecology || {};
  const value = Math.round(focus === "water" ? Number(eco.water) || 0 : Number(eco.grass) || 0);
  const name = focus === "water" ? "水源" : "草场";
  const actionLabel = focus === "water" ? "修复饮水点" : "恢复草场";
  return {
    recommendedAction: "habitat",
    validActions: ["habitat"],
    metricFocus: focus,
    prompt: `${name}降到 ${value}，先${actionLabel}。`
  };
}
function eventStepGuidance(reserve = {}, step = 1, branch = "") {
  const eco = reserve.ecology || {};
  const supplies = reserve.supplies || {};
  const supplyTotal = Object.values(supplies).reduce((sum, value) => sum + (value || 0), 0);
  const riskAction = (reserve.poacherPressure || 0) > 35
    ? "antiPoacher"
    : (eco.disease || 0) >= ECOLOGY_THRESHOLDS.warningDisease
      ? "intervention"
    : (eco.water || 0) < ECOLOGY_THRESHOLDS.earlyWater || (eco.grass || 0) < ECOLOGY_THRESHOLDS.earlyGrass
        ? "habitat"
        : "houndScout";
  const definitions = {
    1: {
      recommendedAction: "houndScout",
      validActions: ["houndScout", "habitat", "antiPoacher", "intervention", "buySupplies", "salvage", "exploreMaterials"]
    },
    2: { recommendedAction: "habitat", validActions: ["habitat"] },
    3: { recommendedAction: "antiPoacher", validActions: ["antiPoacher", "houndScout"] },
    4: {
      recommendedAction: (eco.disease || 0) >= ECOLOGY_THRESHOLDS.criticalDisease ? "intervention" : "habitat",
      validActions: ["habitat", "intervention"]
    },
    5: {
      recommendedAction: (reserve.safety || 0) < 60 ? "antiPoacher" : "habitat",
      validActions: ["houndScout", "habitat", "antiPoacher", "intervention", "buySupplies", "salvage", "exploreMaterials"]
    },
    6: {
      recommendedAction: supplyTotal < 5 ? "buySupplies" : (reserve.safety || 0) < 64 ? "antiPoacher" : "houndScout",
      validActions: ["buySupplies", "antiPoacher", "houndScout"]
    },
    7: {
      recommendedAction: riskAction,
      validActions: ["houndScout", "habitat", "antiPoacher", "intervention", "buySupplies", "salvage", "exploreMaterials"]
    }
  };
  const branchOverrides = {
    ledger: {
      1: { recommendedAction: "buySupplies", validActions: ["buySupplies", "salvage", "exploreMaterials"] },
      2: { recommendedAction: "buySupplies", validActions: ["buySupplies", "salvage", "exploreMaterials"] },
      3: { recommendedAction: "buySupplies", validActions: ["buySupplies", "salvage", "exploreMaterials"] },
      4: { recommendedAction: "buySupplies", validActions: ["buySupplies", "salvage", "exploreMaterials"] },
      5: { recommendedAction: "salvage", validActions: ["salvage"] },
      6: { recommendedAction: "buySupplies", validActions: ["buySupplies", "salvage", "exploreMaterials"] },
      7: { recommendedAction: "salvage", validActions: ["salvage", "buySupplies"] }
    }
  };
  const source = (branchOverrides[branch] && branchOverrides[branch][step]) || definitions[step] || {
    recommendedAction: riskAction,
    validActions: ["houndScout", "habitat", "antiPoacher", "intervention"]
  };
  const found = {
    recommendedAction: source.recommendedAction,
    validActions: (source.validActions || []).slice(),
    metricFocus: ""
  };
  if (branch === "ledger") {
    return {
      recommendedAction: found.recommendedAction,
      validActions: found.validActions
    };
  }
  const stepNumber = Math.max(1, Math.round(Number(step) || 1));
  const focus = habitatFocus(reserve);
  if (focus && stepNumber >= 2) return focusedHabitatGuidance(reserve, focus);
  if (stepNumber === 5 || stepNumber === 7) {
    const related = found.recommendedAction === "antiPoacher"
      ? ["antiPoacher", "houndScout"]
      : found.recommendedAction === "intervention"
        ? ["intervention", "habitat"]
        : [found.recommendedAction];
    found.validActions = related.filter((action, index, all) => action && all.indexOf(action) === index);
  }
  if (found.recommendedAction === "habitat") {
    found.metricFocus = (Number(eco.water) || 0) <= (Number(eco.grass) || 0) ? "water" : "grass";
  }
  return {
    recommendedAction: found.recommendedAction,
    validActions: found.validActions,
    metricFocus: found.metricFocus
  };
}
module.exports = { eventStepGuidance };
