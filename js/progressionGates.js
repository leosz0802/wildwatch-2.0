// Shared progression gates for every player-built upgrade.  Resource costs
// answer “can the player pay now?”; these gates answer “has the reserve earned
// the right to operate at this tier?”.
const TOURISM_THRESHOLDS = Object.freeze([0, 12, 18, 23, 28, 32, 35, 38, 40]);

function whole(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

function reserveProgressionLevel(reserve = {}) {
  // Compatibility alias: the visible progression is the chapter.  Existing
  // saves still carry progression.level, but it no longer creates a second
  // player-facing ladder.
  const progression = reserve.progression || {};
  // Older saves sometimes only persisted `level`; use the highest persisted
  // value for upgrade availability while the chapter UI itself remains based
  // on stage/displayChapter.
  return Math.max(1, Math.min(20, Math.max(whole(progression.displayChapter, 1), whole(progression.stage, 1), whole(progression.level, 1))));
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
  return Math.min(9, level);
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
  const tier = Math.max(1, Math.min(5, whole(targetLevel, 1)));
  const chapter = reserveProgressionLevel(reserve);
  const visitorLevel = visitorProgressionLevel(reserve);
  const visitor = visitorProgressionSnapshot(reserve);
  const missing = [];
  if (chapter < tier) missing.push(`第${tier}章（当前第${chapter}章）`);
  if (visitorLevel < tier) missing.push(`游客等级${tier}（当前${visitorLevel}级）`);
  const nextSteps = [];
  if (chapter < tier) nextSteps.push(`章节：完成本章数值条件、剧情和动物解救（第${chapter}章/${tier}章）`);
  if (visitorLevel < tier) nextSteps.push(`游客等级：提升游客运营评分并完成游客运营（${visitorLevel}/${tier}）`);
  return {
    targetLevel: tier,
    reserveLevel: chapter,
    chapter,
    visitorLevel,
    visitorScore: visitor.score,
    visitorNextScore: visitor.nextScore,
    visitorGap: visitor.gap,
    available: missing.length === 0,
    missing,
    label: `第${tier}章 · 游客等级${tier}`,
    nextSteps
  };
}

module.exports = { TOURISM_THRESHOLDS, reserveProgressionLevel, visitorProgressionLevel, visitorProgressionSnapshot, upgradeProgressionGate };
