function eventStepGuidance(reserve = {}, step = 1) {
  const eco = reserve.ecology || {};
  const supplies = reserve.supplies || {};
  const supplyTotal = Object.values(supplies).reduce((sum, value) => sum + (value || 0), 0);
  const riskAction = (reserve.poacherPressure || 0) > 35
    ? "antiPoacher"
    : (eco.disease || 0) > 28
      ? "intervention"
      : (eco.water || 0) < 65 || (eco.grass || 0) < 55
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
      recommendedAction: (eco.disease || 0) > 36 ? "intervention" : "habitat",
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
  const found = definitions[step] || {
    recommendedAction: riskAction,
    validActions: ["houndScout", "habitat", "antiPoacher", "intervention"]
  };
  return {
    recommendedAction: found.recommendedAction,
    validActions: found.validActions.slice()
  };
}

module.exports = { eventStepGuidance };
