const { ECOLOGY_THRESHOLDS } = require("./balanceConfig");

const PATROL_ACTIONS = Object.freeze(["houndScout", "antiPoacher", "habitat", "intervention"]);

// These are automatic task thresholds. Explicit story steps and player
// actions remain available without manufacturing a routine patrol objective.
function criticalPatrolRisk(reserve = {}) {
  const ecology = reserve.ecology || {};
  const rows = [
    ["water", ecology.water, ECOLOGY_THRESHOLDS.criticalWater, "low", "habitat", "水源严重不足", "修复水点，阻止动物继续失去饮水来源。"],
    ["grass", ecology.grass, ECOLOGY_THRESHOLDS.criticalGrass, "low", "habitat", "草场严重不足", "恢复草场，减轻种群的取食压力。"],
    ["disease", ecology.disease, ECOLOGY_THRESHOLDS.criticalDisease, "high", "intervention", "疾病正在扩散", "执行生态干预，控制疾病扩散。"],
    ["poacher", reserve.poacherPressure, 65, "high", "antiPoacher", "边界偷猎风险过高", "驱赶靠近保护区的偷猎者。"],
    ["safety", reserve.safety, 30, "low", "houndScout", "保护区安全严重下降", "查明危险来源，再恢复动物的安全路线。"]
  ];
  return rows.filter(([, value]) => value != null && Number.isFinite(Number(value)))
    .map(([id, raw, threshold, direction, action, title, body]) => {
      const value = Number(raw);
      const deviation = direction === "low" ? threshold - value : value - threshold;
      return { id, value, score: deviation >= 0 ? deviation + 1 : 0, action, title, body };
    })
    .filter(risk => risk.score > 0)
    .sort((a, b) => b.score - a.score)[0] || null;
}

module.exports = { PATROL_ACTIONS, criticalPatrolRisk };
