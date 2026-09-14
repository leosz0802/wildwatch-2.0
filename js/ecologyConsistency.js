const { BALANCE_V2, speciesVitalFor } = require("./balanceConfig");

function clampRange(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function totalAnimals(group) {
  return Object.keys(group || {}).reduce((sum, key) => sum + Math.max(0, Number(group[key]) || 0), 0);
}

function habitatCapacitySnapshot(reserve = {}) {
  const ecology = reserve.ecology || {};
  const water = clampRange(ecology.water, 0, 100);
  const grass = clampRange(ecology.grass, 0, 100);
  const disease = clampRange(ecology.disease, 0, 100);
  const herbivores = totalAnimals(ecology.herbivores);
  const predators = totalAnimals(ecology.predators);
  const birds = totalAnimals(ecology.birds);
  const totalPopulation = herbivores + predators + birds;
  const level = clampRange(Math.round(((reserve.progression || {}).level) || 1), 1, 7);
  const baseCapacity = BALANCE_V2.population.carryingCapacity[level] || BALANCE_V2.population.carryingCapacity[7];
  const limitingResource = Math.min(water, grass);
  // 60 点水草约等于章节基础承载；低于 40 时短板会快速压缩承载，
  // 高水源不能再抵消严重缺草，反之亦然。
  const resourceFactor = clampRange(0.62 + limitingResource * 0.0065 - Math.max(0, disease - 50) * 0.003, 0.42, 1.15);
  const effectiveCapacity = Math.max(1, Math.round(baseCapacity * resourceFactor));
  const herbivoreShare = totalPopulation > 0 ? herbivores / totalPopulation : 0.78;
  const effectiveHerbivoreCapacity = Math.max(1, Math.round(effectiveCapacity * clampRange(herbivoreShare, 0.68, 0.84)));
  return {
    level,
    water,
    grass,
    disease,
    herbivores,
    predators,
    birds,
    totalPopulation,
    baseCapacity,
    limitingResource,
    resourceFactor,
    effectiveCapacity,
    effectiveHerbivoreCapacity,
    loadRatio: totalPopulation / effectiveCapacity,
    herbivoreLoadRatio: herbivores / effectiveHerbivoreCapacity
  };
}

function habitatEcologyScore(snapshot) {
  return clampRange(Math.round(
    snapshot.water * 0.42
    + snapshot.grass * 0.42
    + (100 - snapshot.disease) * 0.16
  ), 0, 100);
}

function habitatMigrationAssessment(reserve = {}, beforeEcology) {
  const capacity = habitatCapacitySnapshot(reserve);
  const ecologyScore = habitatEcologyScore(capacity);
  const previousScore = Number.isFinite(Number(beforeEcology)) ? Number(beforeEcology) : ecologyScore;
  const criticalGrass = capacity.grass <= 35;
  const criticalWater = capacity.water <= 35;
  const criticalDisease = capacity.disease >= 70;
  const criticalLoad = capacity.loadRatio >= 1.25;
  const forced = criticalGrass || criticalWater || criticalDisease || criticalLoad;
  const speciesAtRisk = Object.entries(reserve.ecology || {}).reduce((sum, [group, members]) => {
    if (!members || typeof members !== "object" || ["predators", "herbivores", "birds"].indexOf(group) < 0) return sum;
    return sum + Object.entries(members).reduce((subtotal, [id, pop]) => subtotal + Math.max(0, Number(pop) || 0) * speciesVitalFor(id).migrationSensitivity, 0);
  }, 0);
  const migrationSensitivity = capacity.totalPopulation > 0 ? speciesAtRisk / capacity.totalPopulation : 0.65;
  let delta = 0;
  let reason = "水源、草场与种群承载暂时平衡，动物保持观望";

  if (forced) {
    const resourceDeficit = Math.max(0, 39 - capacity.grass, 41 - capacity.water);
    const diseasePressure = Math.max(0, capacity.disease - 54);
    const overloadPressure = Math.max(0, capacity.loadRatio - 1);
    delta = -clampRange(
      Math.round((2 + Math.ceil(resourceDeficit / 8) + Math.ceil(diseasePressure / 18) + Math.ceil(overloadPressure * 2)) * (0.75 + migrationSensitivity * 0.45)),
      2,
      8
    );
    if (criticalGrass) reason = `草场仅 ${capacity.grass}，约能承载 ${capacity.effectiveHerbivoreCapacity} 只食草动物；当前 ${capacity.herbivores} 只，边缘种群开始迁出`;
    else if (criticalWater) reason = `水源仅 ${capacity.water}，饮水点不足，动物开始向外寻找稳定水线`;
    else if (criticalDisease) reason = `疾病风险 ${capacity.disease}，动物主动避开聚集区域并开始外迁`;
    else reason = `当前约 ${capacity.totalPopulation} 只动物，超过水草有效承载 ${capacity.effectiveCapacity} 只，部分种群开始迁出`;
  } else if (capacity.loadRatio > 1.08) {
    delta = -clampRange(1 + Math.ceil((capacity.loadRatio - 1) * 5), 2, 5);
    reason = `种群已超过当前水草承载，部分动物向外围分散`;
  } else if (ecologyScore < 48 || capacity.limitingResource < 45 || capacity.disease > 45) {
    delta = -Math.max(1, Math.ceil((48 - Math.min(48, ecologyScore)) / 7));
    reason = capacity.grass <= capacity.water
      ? "草场产能偏低，食草动物减少停留并向外觅食"
      : "水源不足，动物向外寻找稳定饮水点";
  } else if (ecologyScore >= 72 && capacity.limitingResource >= 58 && capacity.disease <= 30 && capacity.loadRatio <= 0.95) {
    delta = clampRange(3 + Math.round((ecologyScore - 72) / 10), 3, 6);
    reason = capacity.water <= capacity.grass ? "水源稳定，周边动物沿饮水路线迁入" : "草场丰茂，周边动物开始迁入";
  } else if (ecologyScore >= previousScore + 5 && capacity.limitingResource >= 48 && capacity.disease <= 40 && capacity.loadRatio <= 1.02) {
    delta = 2;
    reason = "水草承载改善，少量动物开始回流";
  }

  return Object.assign({}, capacity, {
    ecologyScore,
    previousScore,
    migrationSensitivity: Math.round(migrationSensitivity * 100) / 100,
    forced,
    allowIn: !forced && capacity.limitingResource >= 48 && capacity.disease <= 40 && capacity.loadRatio <= 1.02,
    trend: delta > 0 ? "in" : delta < 0 ? "out" : "stable",
    delta,
    reason
  });
}

function consistentMigrationSnapshot(reserve = {}, storedMigration = (reserve || {}).migration, beforeEcology) {
  const assessment = habitatMigrationAssessment(reserve, beforeEcology);
  const stored = Object.assign({ trend: "stable", delta: 0, reason: "" }, storedMigration || {});
  const storedDelta = Math.round(Number(stored.delta) || 0);
  if (assessment.forced) return Object.assign({}, stored, assessment);
  if (assessment.delta < 0 && storedDelta >= 0) return Object.assign({}, stored, assessment);
  if (storedDelta > 0 && !assessment.allowIn) {
    if (assessment.delta < 0) return Object.assign({}, stored, assessment);
    return Object.assign({}, stored, assessment, {
      trend: "stable",
      delta: 0,
      reason: "水草尚未同时达到迁入条件，周边动物暂时观望"
    });
  }
  return Object.assign({}, assessment, stored, {
    delta: storedDelta,
    trend: storedDelta > 0 ? "in" : storedDelta < 0 ? "out" : "stable",
    reason: stored.reason || assessment.reason
  });
}

module.exports = {
  totalAnimals,
  habitatCapacitySnapshot,
  habitatMigrationAssessment,
  consistentMigrationSnapshot
};
