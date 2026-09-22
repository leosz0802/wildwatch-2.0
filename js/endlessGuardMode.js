const TOURISM_TITLES = ["初探之地", "巡护看点", "自然驿站", "热门保护地", "口碑目的地", "区域名片", "明星保护区", "旅行圣地", "顶级圣地"];
const RESERVE_TITLES = ["临时营地", "稳定保护站", "可信保护区", "核心庇护地", "旗舰保护区", "跨区联防网", "区域生态共同体"];
const FINAL_CHAPTER = 20;
const CYCLE_LENGTH = 20;

const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));

function playChapter(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(0, Math.round(Number(progression.displayChapter || progression.stage || 0)));
}

function isEndlessGuardReady(reserve = {}) {
  const progression = reserve.progression || {};
  if (playChapter(reserve) < FINAL_CHAPTER) return false;
  return progression.chapterComplete === true || progression.stageComplete === true;
}

function tourismScore(r) {
  const e = r.ecology || {};
  const n = Number(r.visitors || r.visitorCount || 0);
  const s = Number(r.safety || 0);
  const w = Number(e.water || 0);
  const g = Number(e.grass || 0);
  const c = Object.keys(Object.assign({}, e.predators || {}, e.herbivores || {}, e.birds || {})).length;
  return clamp(Math.round(s * .32 + w * .18 + g * .18 + Math.min(100, c * 2.6) * .16 + Math.min(100, n / 4) * .16 + Number(r.reputation || 0) * .08), 0, 100);
}

function endlessGuardView(r) {
  const m = r.endlessMode || {};
  const s = tourismScore(r);
  const stars = clamp(Math.ceil(s / (100 / 9)), 1, 9);
  const rs = clamp(Math.round(Number(r.ecologyScore || 0) * .45 + Number(r.safety || 0) * .35 + Number(r.business || 0) * .2), 0, 100);
  const level = clamp(Math.ceil(rs / (100 / 7)), 1, 7);
  return {
    active: true,
    cycle: Math.max(1, Math.round(m.cycle || 1)),
    cycleProgress: clamp(m.cycleProgress || 0, 0, 99),
    tourismScore: s,
    tourismStars: stars,
    tourismTitle: TOURISM_TITLES[stars - 1],
    reserveScore: rs,
    reserveLevel: level,
    reserveTitle: RESERVE_TITLES[level - 1],
    pkLabel: `旅游圣地 ${stars}星 · 保护区 等级${level}`,
    rivalScore: Math.max(0, Math.round(m.rivalScore || 0)),
    lastChange: m.lastChange || "主线完成，进入无限守护"
  };
}

function ensureEndlessGuardMode(reserve = {}) {
  if (!isEndlessGuardReady(reserve)) {
    if (reserve.endlessMode && reserve.endlessMode.active) {
      reserve.endlessMode = Object.assign({}, reserve.endlessMode, { active: false });
    }
    return null;
  }
  const old = reserve.endlessMode && typeof reserve.endlessMode === "object" ? reserve.endlessMode : {};
  const cycle = Math.max(1, Math.round(Number(old.cycle || 1)));
  const cycleProgress = Math.max(0, Math.round(Number(old.cycleProgress || 0)));
  const view = endlessGuardView(Object.assign({}, reserve, {
    endlessMode: Object.assign({}, old, { cycle, cycleProgress })
  }));
  reserve.endlessMode = Object.assign({}, old, view, {
    active: true,
    cycle,
    cycleProgress: cycleProgress % CYCLE_LENGTH,
    lastChange: old.lastChange || "主线完成，进入无限守护"
  });
  const progression = reserve.progression || (reserve.progression = {});
  progression.chapterComplete = true;
  progression.stageComplete = true;
  return reserve.endlessMode;
}

function advanceEndlessGuardMode(r, o = {}) {
  if (!ensureEndlessGuardMode(r)) return null;
  const old = r.endlessMode || {};
  const before = Number(old.tourismScore || tourismScore(r));
  const after = tourismScore(r);
  const d = after - before;
  const cp = Math.max(0, Number(old.cycleProgress || 0) + 1);
  const cycle = Math.max(1, Number(old.cycle || 1) + Math.floor(cp / CYCLE_LENGTH));
  const v = endlessGuardView(Object.assign({}, r, {
    endlessMode: { cycle, cycleProgress: cp % CYCLE_LENGTH, tourismScore: after, rivalScore: old.rivalScore }
  }));
  r.endlessMode = Object.assign({}, v, {
    cycle,
    cycleProgress: cp % CYCLE_LENGTH,
    rivalScore: clamp(Math.round((old.rivalScore || 0) * .92 + after * .08), 0, 100),
    lastChange: d === 0 ? "本轮经营保持平衡" : `旅游指数 ${d > 0 ? "上升" : "下降"} ${Math.abs(d)} 点`,
    lastDay: o.day || null,
    lastAction: o.action || ""
  });
  return r.endlessMode;
}

module.exports = {
  TOURISM_TITLES,
  RESERVE_TITLES,
  FINAL_CHAPTER,
  tourismScore,
  endlessGuardView,
  isEndlessGuardReady,
  ensureEndlessGuardMode,
  advanceEndlessGuardMode
};
