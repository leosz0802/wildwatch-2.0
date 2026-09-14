const { ECOLOGY_THRESHOLDS } = require("./balanceConfig");
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
    // The ledger branch is about supplies and sample handover. Its fifth
    // beat must never fall back to the generic poacher-risk recommendation:
    // the player completes it by selling/handing over the recovered sample.
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
  const found = (branchOverrides[branch] && branchOverrides[branch][step]) || definitions[step] || {
    recommendedAction: riskAction,
    validActions: ["houndScout", "habitat", "antiPoacher", "intervention"]
  };
  return {
    recommendedAction: found.recommendedAction,
    validActions: found.validActions.slice()
  };
}

module.exports = { eventStepGuidance };
