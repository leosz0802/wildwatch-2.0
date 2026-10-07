const TOURISM_THRESHOLDS = Object.freeze([0, 12, 18, 23, 28, 32, 35, 38, 40]);
const TOURISM_SCORE_CAP = 48;
const BUILDING_MAX_LEVEL = 9;
const BUILDING_LEVEL_CHAPTER = Object.freeze([0, 1, 2, 3, 4, 5, 7, 9, 10, 11]);
function buildingLevelChapter(level = 1) {
  const tier = Math.max(1, Math.min(BUILDING_MAX_LEVEL, whole(level, 1)));
  return BUILDING_LEVEL_CHAPTER[tier] || tier;
}
function whole(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}
function reserveProgressionLevel(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, Math.min(11, Math.max(whole(progression.displayChapter, 1), whole(progression.stage, 1), whole(progression.level, 1))));
}
function visitorProgressionLevel(reserve = {}) {
  const operations = ((reserve.development || {}).operations) || {};
  const today = operations.today || {};
  const score = Math.max(0, Number(
    today.tourismScore != null ? today.tourismScore
      : operations.tourismScore != null ? operations.tourismScore
        : reserve.tourismScore
  ) || 0);
  let level = 1;
  for (let index = 1; index < TOURISM_THRESHOLDS.length; index += 1) {
    if (score >= TOURISM_THRESHOLDS[index]) level = index + 1;
    else break;
  }
  return Math.min(BUILDING_MAX_LEVEL, level);
}
function visitorProgressionSnapshot(reserve = {}) {
  const operations = ((reserve.development || {}).operations) || {};
  const today = operations.today || {};
  const score = Math.max(0, Number(today.tourismScore != null ? today.tourismScore : operations.tourismScore != null ? operations.tourismScore : reserve.tourismScore) || 0);
  const level = visitorProgressionLevel(reserve);
  const nextScore = level >= TOURISM_THRESHOLDS.length ? null : TOURISM_THRESHOLDS[level];
  return { score, level, nextScore, gap: nextScore == null ? 0 : Math.max(0, nextScore - score) };
}
function upgradeProgressionGate(reserve = {}, targetLevel = 1) {
  const tier = Math.max(1, Math.min(BUILDING_MAX_LEVEL, whole(targetLevel, 1)));
  const chapterRequired = buildingLevelChapter(tier);
  const visitorRequired = tier;
  const chapter = reserveProgressionLevel(reserve);
  const visitorLevel = visitorProgressionLevel(reserve);
  const visitor = visitorProgressionSnapshot(reserve);
  const missing = [];
  if (chapter < chapterRequired) missing.push(`第${chapterRequired}章（当前第${chapter}章）`);
  if (visitorLevel < visitorRequired) missing.push(`游客等级${visitorRequired}（当前${visitorLevel}级）`);
  const nextSteps = [];
  if (chapter < chapterRequired) nextSteps.push(`章节：完成本章种群、动物总数和游客（第${chapter}章/${chapterRequired}章）`);
  if (visitorLevel < visitorRequired) nextSteps.push(`游客等级：提升游客运营评分并完成游客运营（${visitorLevel}/${visitorRequired}）`);
  return {
    targetLevel: tier,
    chapterRequired,
    visitorRequired,
    reserveLevel: chapter,
    chapter,
    visitorLevel,
    visitorScore: visitor.score,
    visitorNextScore: visitor.nextScore,
    visitorGap: visitor.gap,
    available: missing.length === 0,
    missing,
    label: `第${chapterRequired}章 · 游客等级${visitorRequired}`,
    nextSteps
  };
}
module.exports = {
  TOURISM_THRESHOLDS,
  TOURISM_SCORE_CAP,
  BUILDING_MAX_LEVEL,
  BUILDING_LEVEL_CHAPTER,
  buildingLevelChapter,
  reserveProgressionLevel,
  visitorProgressionLevel,
  visitorProgressionSnapshot,
  upgradeProgressionGate
};
