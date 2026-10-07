const { habitatMigrationAssessment } = require('./ecologyConsistency');
const { visitorRecruitmentFactors, visitorMigrationRatio } = require('./visitorRecruitment');
function survivalImpact(reserve = {}) {
  const migration = habitatMigrationAssessment(reserve);
  const visitors = visitorRecruitmentFactors(reserve);
  const ratio = Math.round(visitorMigrationRatio(reserve) * 100);
  return [
    { id: 'safety', title: `安全 ${visitors.safety}`, lines: [
      `动物回归：${visitors.safety < 45 ? '安全低于45，暂缓回归' : migration.delta > 0 ? '环境支持回归，仅限已有种群' : migration.delta < 0 ? '当前有外迁压力，先修复环境' : migration.allowIn ? '可以停留，暂无新的迁入' : '暂时观望，需改善水草或降低疾病'}`,
      `游客迁入占比：本次来访约 ${ratio}%（随水源、草场和安全变化）`,
      `偷猎压力：${visitors.poacherPressure}/100，越高越需处理威胁`
    ] }
  ];
}
module.exports = { survivalImpact };
