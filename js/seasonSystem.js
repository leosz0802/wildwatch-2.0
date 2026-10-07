const SEASON_PROFILES = {
  雨季: {
    name: "雨季",
    activityRange: 1.35,
    activeWaterPoints: ["北部高地湖泊", "东部河岸湿地", "中央季节河汊", "南部临时水洼"],
    waterPointCount: 4,
    diseasePressure: 2,
    birthCadence: 17,
    birthDiseaseLimit: 40,
    predatorConcentration: 0.72,
    poacherConcentration: 0.72,
    elephantMigrationWeight: 0.8,
    investigationTags: ["水文", "改道河汊", "漂流种荚"],
    summary: "河汊持续改道，动物活动范围扩大；潮湿提高疾病与幼崽出现频率。"
  },
  旱季: {
    name: "旱季",
    activityRange: 0.62,
    activeWaterPoints: ["北部高地湖泊", "东部河岸深水点"],
    waterPointCount: 2,
    diseasePressure: -2,
    birthCadence: 31,
    birthDiseaseLimit: 28,
    predatorConcentration: 1.45,
    poacherConcentration: 1.5,
    elephantMigrationWeight: 1.7,
    investigationTags: ["盐地", "旧井", "干河床"],
    summary: "动物集中到少数水点，捕食与偷猎路线重叠；象群沿旧水路扩大迁徙。"
  }
};
function seasonProfile(name = "雨季") {
  return SEASON_PROFILES[name] || SEASON_PROFILES.雨季;
}
function buildSeasonDynamics(seasonState = {}, previous = {}) {
  const profile = seasonProfile(seasonState.name);
  const day = Math.max(1, Math.round(seasonState.day || 1));
  const riverVariant = profile.name === "雨季" ? ((day - 1) % 3) + 1 : 0;
  return {
    season: profile.name,
    day,
    changed: !!seasonState.changed,
    riverVariant,
    riverChanged: profile.name === "雨季" && (seasonState.changed || riverVariant !== (previous.riverVariant || 0)),
    activityRange: profile.activityRange,
    activeWaterPoints: profile.activeWaterPoints.slice(),
    waterPointCount: profile.waterPointCount,
    diseasePressure: profile.diseasePressure,
    birthCadence: profile.birthCadence,
    birthDiseaseLimit: profile.birthDiseaseLimit,
    predatorConcentration: profile.predatorConcentration,
    poacherConcentration: profile.poacherConcentration,
    elephantMigrationWeight: profile.elephantMigrationWeight,
    investigationTags: profile.investigationTags.slice(),
    summary: profile.summary
  };
}
function applySeasonDynamics(reserve, seasonState) {
  if (!reserve) return buildSeasonDynamics(seasonState);
  reserve.seasonDynamics = buildSeasonDynamics(seasonState, reserve.seasonDynamics || {});
  return reserve.seasonDynamics;
}
function seasonLifeModifiers(name) {
  const profile = seasonProfile(name);
  return {
    birthCadence: profile.birthCadence,
    birthDiseaseLimit: profile.birthDiseaseLimit,
    diseaseInjuryThreshold: profile.name === "雨季" ? 42 : 56,
    diseaseRiskFaces: profile.name === "雨季" ? 2 : 1
  };
}
module.exports = { SEASON_PROFILES, seasonProfile, buildSeasonDynamics, applySeasonDynamics, seasonLifeModifiers };
