const TOURISM_TITLES = ["初探之地", "巡护看点", "自然驿站", "热门保护地", "口碑目的地", "区域名片", "明星保护区", "旅行圣地", "顶级圣地"];
const RESERVE_TITLES = ["临时营地", "稳定保护站", "可信保护区", "核心庇护地", "旗舰保护区", "跨区联防网", "区域生态共同体"];
const SEASON_LENGTH = 28;
const WEEK_LENGTH = 7;
const FINAL_CHAPTER = 11;
const CYCLE_LENGTH = SEASON_LENGTH;
const SEASON_THEMES = Object.freeze([
  { id: "wetland", name: "湿地回声", color: "#3c8f87", brief: "稳住水线，让迁徙和游客沿着同一条安全边界发生。" },
  { id: "grassland", name: "草原回路", color: "#7d9d48", brief: "把草场压力拆开，让动物和游客各有可以停留的空间。" },
  { id: "forest", name: "林缘守望", color: "#557b5d", brief: "降低边界风险，把巡护、观察和动物信任连成一线。" },
  { id: "river", name: "河谷共生", color: "#4585a0", brief: "让水源、设施和保护基金形成稳定的日常循环。" }
]);
const CONTRACT_ACTIONS = Object.freeze([
  { id: "patrol", title: "完成一次巡护", body: "完成一次猎犬侦察、驱赶偷猎或生态干预。", action: "houndScout", validActions: ["houndScout", "antiPoacher", "intervention"], icon: "houndScout" },
  { id: "habitat", title: "修复一处栖息地", body: "修复水源或草场，让今天的生态指标回到安全线。", action: "habitat", validActions: ["habitat"], icon: "habitat" },
  { id: "visitors", title: "接待一批游客", body: "完成一次观景接待，记录游客与保护基金的变化。", action: "visitorReception", validActions: ["visitorReception", "visitorAdjust"], icon: "community" },
  { id: "animal", title: "回应一位动物朋友", body: "安抚、观察或解救一位动物朋友。", action: "animalCare", validActions: ["animalCare", "rescueAnimal", "exploreMaterials"], icon: "paw" },
  { id: "salvage", title: "整理一批回收物", body: "处理回收物，把研究样本重新接入保护区循环。", action: "salvage", validActions: ["salvage", "exploreMaterials"], icon: "salvage" },
  { id: "auction", title: "参加本周拍卖", body: "为本周的动物档案或设施蓝图提交一次竞拍。", action: "endlessAuction", validActions: ["endlessAuction"], icon: "rare" }
]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
function playChapter(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(0, Math.round(Number(progression.displayChapter || progression.stage || 0)));
}
function isEndlessGuardReady(reserve = {}) {
  const progression = reserve.progression || {};
  const chapter = playChapter(reserve);
  if (chapter !== FINAL_CHAPTER && chapter !== 18 && chapter !== 20) return false;
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
function seasonTheme(seasonNo = 1) {
  return SEASON_THEMES[(Math.max(1, Number(seasonNo) || 1) - 1) % SEASON_THEMES.length];
}
function seasonDayOf(mode = {}) {
  const explicit = Number(mode.seasonDay);
  if (Number.isFinite(explicit) && explicit >= 1) return clamp(Math.round(explicit), 1, SEASON_LENGTH);
  return clamp(Math.round(Number(mode.cycleProgress || 0)) + 1, 1, SEASON_LENGTH);
}
function contractTemplateFor(seasonNo, day, index) {
  const offset = (Math.max(1, Number(seasonNo) || 1) - 1) * 3 + Math.max(0, Number(day) - 1);
  const template = CONTRACT_ACTIONS[(offset + index * 2) % CONTRACT_ACTIONS.length];
  return Object.assign({}, template, {
    id: `${seasonNo}:${day}:${template.id}:${index + 1}`,
    target: template.id === "patrol" ? 2 : 1,
    progress: 0,
    complete: false,
    seasonNo: Math.max(1, Number(seasonNo) || 1),
    day: Math.max(1, Number(day) || 1)
  });
}
function newDailyContracts(seasonNo, day) {
  return [0, 1, 2].map((index) => contractTemplateFor(seasonNo, day, index));
}
function weeklyLots(seasonNo, week) {
  const base = 90 + (Math.max(1, Number(week) || 1) - 1) * 20;
  const seed = (Math.max(1, Number(seasonNo) || 1) + Math.max(1, Number(week) || 1)) % 3;
  const lots = [
    { id: "animal_archive", title: "动物档案变种", body: "解锁一个可展示的动物档案变种，计入无限守护收藏。", rewardType: "archive", rewardAmount: 1 },
    { id: "habitat_blueprint", title: "栖息地蓝图", body: "获得一张后续赛季可使用的栖息地蓝图。", rewardType: "blueprint", rewardAmount: 1 },
    { id: "research_cache", title: "研究样本箱", body: "获得一箱赛季研究样本，转化为收藏进度。", rewardType: "research", rewardAmount: 3 }
  ];
  return lots.map((lot, index) => Object.assign({}, lot, {
    id: `${lot.id}_${seed}_${index}`,
    fundCost: base + index * 35
  }));
}
function weeklyAuctionFor(seasonNo, seasonDay, old = null) {
  const week = Math.floor((Math.max(1, Number(seasonDay) || 1) - 1) / WEEK_LENGTH) + 1;
  if (old && Number(old.seasonNo) === Number(seasonNo) && Number(old.week) === week && Array.isArray(old.lots) && old.lots.length) return old;
  return {
    seasonNo: Math.max(1, Number(seasonNo) || 1),
    week,
    status: "open",
    lots: weeklyLots(seasonNo, week),
    selectedLotId: "",
    submitted: false,
    settled: false,
    reward: null,
    openedDay: (week - 1) * WEEK_LENGTH + 1
  };
}
function endlessGuardView(r) {
  const m = r.endlessMode || {};
  const seasonNo = Math.max(1, Math.round(Number(m.seasonNo || m.cycle || 1)));
  const seasonDay = seasonDayOf(m);
  const s = tourismScore(r);
  const stars = clamp(Math.ceil(s / (100 / 9)), 1, 9);
  const rs = clamp(Math.round(Number(r.ecologyScore || 0) * .45 + Number(r.safety || 0) * .35 + Number(r.business || 0) * .2), 0, 100);
  const level = clamp(Math.ceil(rs / (100 / 7)), 1, 7);
  const theme = seasonTheme(seasonNo);
  const contracts = Array.isArray(m.dailyContracts) ? m.dailyContracts : [];
  const auction = weeklyAuctionFor(seasonNo, seasonDay, m.weeklyAuction || null);
  return {
    active: true,
    cycle: seasonNo,
    cycleProgress: seasonDay - 1,
    seasonNo,
    seasonId: theme.id,
    seasonName: theme.name,
    seasonBrief: theme.brief,
    seasonDay,
    seasonLength: SEASON_LENGTH,
    seasonWeek: auction.week,
    seasonScore: Math.max(0, Math.round(Number(m.seasonScore) || 0)),
    seasonHistory: Array.isArray(m.seasonHistory) ? m.seasonHistory.slice(-6) : [],
    dailyContracts: contracts,
    weeklyAuction: auction,
    tourismScore: s,
    tourismStars: stars,
    tourismTitle: TOURISM_TITLES[stars - 1],
    reserveScore: rs,
    reserveLevel: level,
    reserveTitle: RESERVE_TITLES[level - 1],
    pkLabel: `旅游圣地 ${stars}星 · 保护区 等级${level}`,
    rivalScore: Math.max(0, Math.round(m.rivalScore || 0)),
    lastSettlement: m.lastSettlement || null,
    lastChange: m.lastChange || "主线完成，进入无限守护"
  };
}
function normalizeEndlessMode(reserve, old = {}) {
  const seasonNo = Math.max(1, Math.round(Number(old.seasonNo || old.cycle || 1)));
  const seasonDay = seasonDayOf(old);
  const contracts = Array.isArray(old.dailyContracts) && old.dailyContracts.length
    && Number(old.dailyContracts[0].day) === seasonDay
    && Number(old.dailyContracts[0].seasonNo) === seasonNo
    ? old.dailyContracts
    : newDailyContracts(seasonNo, seasonDay);
  const weeklyAuction = weeklyAuctionFor(seasonNo, seasonDay, old.weeklyAuction || null);
  const view = endlessGuardView(Object.assign({}, reserve, {
    endlessMode: Object.assign({}, old, {
      seasonNo, seasonDay, cycle: seasonNo, cycleProgress: seasonDay - 1,
      dailyContracts: contracts, weeklyAuction
    })
  }));
  return Object.assign({}, old, view, {
    active: true,
    seasonNo,
    seasonDay,
    cycle: seasonNo,
    cycleProgress: seasonDay - 1,
    dailyContracts: contracts,
    weeklyAuction,
    seasonScore: Math.max(0, Math.round(Number(old.seasonScore) || 0)),
    seasonHistory: Array.isArray(old.seasonHistory) ? old.seasonHistory.slice(-6) : [],
    lastChange: old.lastChange || "主线完成，进入无限守护"
  });
}
function ensureEndlessGuardMode(reserve = {}) {
  if (!isEndlessGuardReady(reserve)) {
    if (reserve.endlessMode && reserve.endlessMode.active) {
      reserve.endlessMode = Object.assign({}, reserve.endlessMode, { active: false });
    }
    return null;
  }
  const old = reserve.endlessMode && typeof reserve.endlessMode === "object" ? reserve.endlessMode : {};
  reserve.endlessMode = normalizeEndlessMode(reserve, old);
  const progression = reserve.progression || (reserve.progression = {});
  progression.stage = FINAL_CHAPTER;
  progression.displayChapter = FINAL_CHAPTER;
  progression.chapterComplete = true;
  progression.stageComplete = true;
  return reserve.endlessMode;
}
function contractMatchesAction(contract, action) {
  if (!contract || contract.complete) return false;
  return action === contract.action || (Array.isArray(contract.validActions) && contract.validActions.includes(action));
}
function updateDailyContracts(mode, action) {
  let completed = null;
  const next = (mode.dailyContracts || []).map((contract) => {
    if (!contractMatchesAction(contract, action)) return contract;
    const progress = Math.min(Number(contract.target) || 1, (Number(contract.progress) || 0) + 1);
    const complete = progress >= (Number(contract.target) || 1);
    if (complete) completed = contract;
    return Object.assign({}, contract, { progress, complete });
  });
  mode.dailyContracts = next;
  return completed;
}
function settleWeeklyAuction(mode, force = false) {
  const auction = mode.weeklyAuction;
  if (!auction || auction.settled || (!force && auction.status === "open")) return null;
  const reward = auction.submitted && auction.selectedLotId
    ? Object.assign({ status: "won" }, (auction.lots || []).find((lot) => lot.id === auction.selectedLotId) || {})
    : { status: "expired", title: "本周未参拍", rewardType: "none", rewardAmount: 0 };
  mode.weeklyAuction = Object.assign({}, auction, { status: "settled", settled: true, reward });
  mode.collection = Object.assign({}, mode.collection || {});
  if (reward.status === "won") {
    const key = reward.rewardType === "archive" ? "animalArchives" : reward.rewardType === "blueprint" ? "habitatBlueprints" : "researchCaches";
    mode.collection[key] = Math.max(0, Number(mode.collection[key]) || 0) + Math.max(0, Number(reward.rewardAmount) || 0);
  }
  return reward;
}
function advanceEndlessGuardMode(r, o = {}) {
  if (!ensureEndlessGuardMode(r)) return null;
  const old = normalizeEndlessMode(r, r.endlessMode || {});
  const before = Number(old.tourismScore || tourismScore(r));
  const after = tourismScore(r);
  const d = after - before;
  const action = String(o.action || "");
  const completedContract = updateDailyContracts(old, action);
  const dayClosed = !!o.dayClosed;
  const scoreDelta = (completedContract ? 10 : 0) + Math.max(0, d);
  const scoreBeforeTick = Math.max(0, Math.round(Number(old.seasonScore) || 0));
  const scoreAfterTick = scoreBeforeTick + scoreDelta;
  let seasonNo = old.seasonNo;
  let seasonDay = old.seasonDay;
  let weeklyAuction = old.weeklyAuction;
  let lastSettlement = old.lastSettlement || null;
  let seasonRolled = false;
  if (dayClosed) {
    const weekEnded = seasonDay % WEEK_LENGTH === 0;
    const weeklySettlement = weekEnded ? settleWeeklyAuction(old, true) : null;
    if (seasonDay >= SEASON_LENGTH) {
      const settledAuction = weeklySettlement || settleWeeklyAuction(old, true);
      const history = (old.seasonHistory || []).concat([{
        seasonNo,
        seasonId: seasonTheme(seasonNo).id,
        seasonName: seasonTheme(seasonNo).name,
        score: scoreAfterTick,
        tourismScore: after,
        completedContracts: (old.dailyContracts || []).filter((item) => item.complete).length,
        weeklyAuction: settledAuction ? settledAuction.status : "open"
      }]).slice(-6);
      seasonNo += 1;
      seasonDay = 1;
      old.seasonHistory = history;
      old.collection = Object.assign({}, old.collection || {}, {
        seasonBadges: Math.max(0, Number((old.collection || {}).seasonBadges) || 0) + 1
      });
      old.lastSettlement = {
        seasonNo: seasonNo - 1,
        title: `${seasonTheme(seasonNo - 1).name}赛季结算`,
        score: history[history.length - 1].score,
        reward: "赛季徽章 +1",
        atDay: SEASON_LENGTH
      };
      old.seasonScore = 0;
      old.dailyContracts = newDailyContracts(seasonNo, seasonDay);
      weeklyAuction = weeklyAuctionFor(seasonNo, seasonDay, null);
      lastSettlement = old.lastSettlement;
      seasonRolled = true;
    } else {
      seasonDay += 1;
      old.dailyContracts = newDailyContracts(seasonNo, seasonDay);
      weeklyAuction = weeklyAuctionFor(seasonNo, seasonDay, weekEnded ? null : weeklyAuction);
    }
  }
  const seasonScore = seasonRolled ? 0 : scoreAfterTick;
  const cycle = seasonNo;
  const v = endlessGuardView(Object.assign({}, r, {
    endlessMode: Object.assign({}, old, { seasonNo, seasonDay, cycle, cycleProgress: seasonDay - 1, dailyContracts: old.dailyContracts, weeklyAuction, seasonScore, lastSettlement })
  }));
  r.endlessMode = Object.assign({}, old, v, {
    active: true,
    seasonNo,
    seasonDay,
    cycle,
    cycleProgress: seasonDay - 1,
    dailyContracts: old.dailyContracts,
    weeklyAuction,
    seasonScore,
    rivalScore: clamp(Math.round((old.rivalScore || 0) * .92 + after * .08), 0, 100),
    lastSettlement,
    lastChange: completedContract
      ? `每日合同完成 · ${completedContract.title}`
      : d === 0 ? "本轮经营保持平衡" : `旅游指数 ${d > 0 ? "上升" : "下降"} ${Math.abs(d)} 点`,
    lastDay: o.day || null,
    lastAction: action
  });
  return r.endlessMode;
}
function endlessDailyContract(reserve = {}) {
  if (!isEndlessGuardReady(reserve) || !reserve.endlessMode || !reserve.endlessMode.active) return null;
  const mode = normalizeEndlessMode(reserve, reserve.endlessMode);
  return (mode.dailyContracts || []).find((contract) => !contract.complete) || null;
}
function endlessAuctionView(reserve = {}) {
  if (!isEndlessGuardReady(reserve)) return null;
  const mode = ensureEndlessGuardMode(reserve);
  return mode ? mode.weeklyAuction : null;
}
function submitEndlessAuction(reserve = {}, lotId = "") {
  const mode = ensureEndlessGuardMode(reserve);
  if (!mode) return { ok: false, error: "无限守护尚未开启" };
  const auction = mode.weeklyAuction || {};
  if (auction.status !== "open" || auction.submitted || auction.settled) return { ok: false, error: "本周拍卖已结束" };
  const lot = (auction.lots || []).find((item) => item.id === lotId) || (auction.lots || [])[0];
  if (!lot) return { ok: false, error: "本周暂无拍卖品" };
  const fund = Math.max(0, Math.round(Number(reserve.fund) || 0));
  if (fund < lot.fundCost) return { ok: false, error: `至少需要${lot.fundCost}星币才能参拍`, lot };
  mode.weeklyAuction = Object.assign({}, auction, { selectedLotId: lot.id, submitted: true, status: "submitted" });
  return { ok: true, lot, cost: lot.fundCost, auction: mode.weeklyAuction };
}
module.exports = {
  TOURISM_TITLES,
  RESERVE_TITLES,
  SEASON_THEMES,
  SEASON_LENGTH,
  WEEK_LENGTH,
  FINAL_CHAPTER,
  CYCLE_LENGTH,
  tourismScore,
  endlessGuardView,
  endlessDailyContract,
  endlessAuctionView,
  isEndlessGuardReady,
  ensureEndlessGuardMode,
  advanceEndlessGuardMode,
  submitEndlessAuction
};
