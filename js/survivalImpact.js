const { habitatCapacitySnapshot, habitatMigrationAssessment } = require('./ecologyConsistency');
const { visitorRecruitmentFactors, visitorMigrationRatio } = require('./visitorRecruitment');

function survivalImpact(reserve = {}) {
  const capacity = habitatCapacitySnapshot(reserve);
  const migration = habitatMigrationAssessment(reserve);
  const visitors = visitorRecruitmentFactors(reserve);
  const ratio = Math.round(visitorMigrationRatio(reserve) * 100);
  const waterLow = capacity.water < 45;
  return [
    { id: 'water', title: `水源 ${capacity.water}`, lines: [
      `动物停留：${waterLow ? '不足，可能外迁' : '水线支持停留'}`,
      `动物增长：${waterLow ? '缺水会降低繁衍机会' : '仍受草场、疾病和密度影响'}`,
      `游客来访：${capacity.water < 50 ? '水源偏低，来访减少' : '水源支持来访，仍需关注安全'}`
    ] },
    { id: 'grass', title: `草场 ${capacity.grass}`, lines: [
      `动物承载：当前环境约 ${capacity.effectiveCapacity} 只`,
      `当前动物：${capacity.totalPopulation} 只，${capacity.loadRatio > 1 ? '已超承载，应先修复环境' : '仍需维持水草与健康'}`,
      '草场和水源取短板；只补一种资源不能无限增员'
    ] },
    { id: 'safety', title: `安全 ${visitors.safety}`, lines: [
      `动物回归：${visitors.safety < 45 ? '安全低于45，暂缓回归' : migration.delta > 0 ? '环境支持回归，仅限已有种群' : migration.delta < 0 ? '当前有外迁压力，先修复环境' : migration.allowIn ? '可以停留，暂无新的迁入' : '暂时观望，需改善水草或降低疾病'}`,
      `游客迁入占比：本次来访约 ${ratio}%（随水源、草场和安全变化）`,
      `偷猎压力：${visitors.poacherPressure}/100，越高越需处理威胁`
    ] }
  ];
}
module.exports = { survivalImpact };
