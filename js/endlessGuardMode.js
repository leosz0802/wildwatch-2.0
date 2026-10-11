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
function weekDayOf(seasonDay) {
  return ((Math.max(1, Math.round(Number(seasonDay) || 1)) - 1) % WEEK_LENGTH) + 1;
}
function stampContract(template, seasonNo, day, role) {
  return Object.assign({}, template, {
    id: `${seasonNo}:${day}:${role}:${template.id}`,
    role,
    target: template.target || (template.id === "patrol" ? 2 : 1),
    progress: 0,
    complete: false,
    seasonNo: Math.max(1, Number(seasonNo) || 1),
    day: Math.max(1, Number(day) || 1)
  });
}
function seasonReserveTemplate(seasonNo, day) {
  const preferred = {
    wetland: "habitat",
    grassland: "animal",
    forest: "patrol",
    river: "visitors"
  }[seasonTheme(seasonNo).id] || "patrol";
  const pool = CONTRACT_ACTIONS.filter((item) => item.id !== "auction");
  const first = pool.find((item) => item.id === preferred) || pool[0];
  const ordered = [first].concat(pool.filter((item) => item.id !== first.id));
  return ordered[(Math.max(1, Number(day) || 1) - 1) % ordered.length];
}
function friendFlavor(seasonNo) {
  return {
    wetland: "这一季优先签水草维护。",
    grassland: "这一季优先签动物观察。",
    forest: "这一季优先签巡护或路线标记。",
    river: "这一季优先签资料整理。"
  }[seasonTheme(seasonNo).id] || "";
}
function interactionTemplate(seasonNo, seasonDay, auction) {
  const weekDay = weekDayOf(seasonDay);
  const submitted = !!(auction && (auction.submitted || auction.settled || auction.status === "submitted" || auction.status === "settled"));
  if (weekDay === 6 && submitted) return weeklySlotTemplate(auction);
  if (weekDay <= 2) {
    return {
      id: "friend",
      title: "和一位好友签合同",
      body: `打开好友榜，签下今天的合同。双方都完成后，这一条才算完成。${friendFlavor(seasonNo)}`,
      action: "friendContract",
      validActions: ["friendContract"],
      icon: "community"
    };
  }
  if (weekDay <= 5) {
    return {
      id: "patrol",
      title: "向世界榜派出猎犬",
      body: "从世界榜选一个保护区派出猎犬。5分钟后的结算报告完成这一条，并记下本周对照。",
      action: "worldHoundPatrol",
      validActions: ["worldHoundPatrol"],
      icon: "hound_team"
    };
  }
  if (weekDay === 6) {
    return {
      id: "auction",
      title: "参加本周拍卖",
      body: "为本周的动物档案、栖息地蓝图或研究样本箱出一次价。拍到的东西会在下一次好友或巡逻互动里被看见。",
      action: "endlessAuction",
      validActions: ["endlessAuction"],
      icon: "rare"
    };
  }
  return {
    id: "recap",
    title: "查看本周来回",
    body: "打开本周结算，看你巡逻了谁、谁巡逻了你、哪份好友合同双方完成。",
    action: "endlessRecap",
    validActions: ["endlessRecap", "endlessMirror"],
    icon: "leaf"
  };
}
function weeklySlotTemplate(auction) {
  const submitted = !!(auction && (auction.submitted || auction.settled || auction.status === "submitted" || auction.status === "settled"));
  if (!submitted) {
    return {
      id: "auction",
      title: "参加本周拍卖",
      body: "三件拍品不变。出价后，拍到的东西会挂到下一次好友合同或猎犬巡逻上。",
      action: "endlessAuction",
      validActions: ["endlessAuction"],
      icon: "rare"
    };
  }
  return {
    id: "mirror",
    title: "对照本周拍品",
    body: "本周已经出过价。下一次好友合同或猎犬巡逻报告里会看到拍品。",
    action: "endlessMirror",
    validActions: ["endlessMirror", "endlessRecap", "friendContract", "worldHoundPatrol"],
    icon: "rare"
  };
}
function newDailyContracts(seasonNo, day, auction) {
  return [
    stampContract(seasonReserveTemplate(seasonNo, day), seasonNo, day, "reserve"),
    stampContract(interactionTemplate(seasonNo, day, auction), seasonNo, day, "interaction"),
    stampContract(weeklySlotTemplate(auction), seasonNo, day, "weekly")
  ];
}
function contractsMatchDay(contracts, seasonNo, day) {
  return Array.isArray(contracts)
    && contracts.length === 3
    && contracts.every((item) => item && item.role && Number(item.day) === Number(day) && Number(item.seasonNo) === Number(seasonNo));
}
function emptyWeekLog(seasonNo, week) {
  return { seasonNo, week, sent: [], received: [], friends: [], mutual: 0, mutualNames: [] };
}
function weekLogFor(mode, seasonNo, week) {
  const current = mode.weekLog;
  if (current && Number(current.seasonNo) === Number(seasonNo) && Number(current.week) === Number(week)) return current;
  mode.weekLog = emptyWeekLog(seasonNo, week);
  return mode.weekLog;
}
function recordSocialBeat(mode, seasonNo, week, kind, entry = {}) {
  const log = weekLogFor(mode, seasonNo, week);
  const list = Array.isArray(log[kind]) ? log[kind] : [];
  log[kind] = list;
  const id = String(entry.id || "");
  const name = String(entry.name || "远方保护区");
  if ((id && list.some((item) => item.id === id)) || (!id && list.some((item) => item.name === name))) {
    return { added: false, mutual: false };
  }
  list.push({ id, name });
  if (list.length > 8) list.shift();
  const other = kind === "sent" ? log.received : kind === "received" ? log.sent : [];
  const paired = kind !== "friends" && (other || []).some((item) => (id && item.id === id) || item.name === name);
  if (!paired || (log.mutualNames || []).includes(name)) return { added: true, mutual: false };
  log.mutualNames = (log.mutualNames || []).concat(name);
  log.mutual = Math.max(0, Number(log.mutual) || 0) + 1;
  return { added: true, mutual: true };
}
function auctionEchoLine(mode = {}) {
  const echo = mode.auctionEcho;
  if (!echo || !echo.title || Math.max(0, Number(echo.daysLeft) || 0) <= 0) return "";
  if (echo.rewardType === "archive") return `动物档案「${echo.title}」会在这次互动里被看见。`;
  if (echo.rewardType === "blueprint") return `栖息地蓝图「${echo.title}」会在这次互动里被用上。`;
  if (echo.rewardType === "research") return "研究样本已入本季图鉴。";
  return "";
}
function weekSummary(log = {}) {
  return `你巡逻了 ${(log.sent || []).length} 人，${(log.received || []).length} 人巡逻了你，${(log.friends || []).length} 份好友合同双方完成`;
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
  const weekLog = m.weekLog && Number(m.weekLog.seasonNo) === seasonNo && Number(m.weekLog.week) === auction.week
    ? m.weekLog
    : emptyWeekLog(seasonNo, auction.week);
  const interaction = contracts.find((item) => item && item.role === "interaction") || null;
  const auctionOpen = auction.status === "open" && !auction.submitted && !auction.settled;
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
    weekLog,
    auctionEcho: m.auctionEcho || null,
    board: {
      today: interaction
        ? `${interaction.complete ? "今日互动已完成" : "今日互动"} · ${interaction.title}`
        : "今日互动会在赛季日内生成",
      auction: auctionOpen ? `本周拍卖 · 还没出价` : `本周拍卖 · ${auction.submitted || auction.status === "submitted" ? "已出价" : "已结算"}`,
      week: weekSummary(weekLog),
      echo: auctionEchoLine(m)
    },
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
  const weeklyAuction = weeklyAuctionFor(seasonNo, seasonDay, old.weeklyAuction || null);
  const contracts = contractsMatchDay(old.dailyContracts, seasonNo, seasonDay)
    ? old.dailyContracts
    : newDailyContracts(seasonNo, seasonDay, weeklyAuction);
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
    weekLog: weekLogFor(old, seasonNo, weeklyAuction.week),
    auctionEcho: old.auctionEcho || null,
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
    mode.auctionEcho = { title: reward.title || "本周拍品", rewardType: reward.rewardType || "", daysLeft: 7 };
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
  const socialWeek = (old.weeklyAuction || {}).week || 1;
  let mutualBonus = 0;
  if (action === "worldHoundPatrol" || action === "worldHoundPatrolIncoming" || action === "friendContract") {
    const kind = action === "worldHoundPatrol" ? "sent" : action === "worldHoundPatrolIncoming" ? "received" : "friends";
    const beat = recordSocialBeat(old, old.seasonNo, socialWeek, kind, { id: o.partnerId, name: o.partnerName });
    if (beat.mutual) mutualBonus = 5;
  }
  const dayClosed = !!o.dayClosed;
  const scoreDelta = (completedContract ? 10 : 0) + mutualBonus + Math.max(0, d);
  const scoreBeforeTick = Math.max(0, Math.round(Number(old.seasonScore) || 0));
  const scoreAfterTick = scoreBeforeTick + scoreDelta;
  let seasonNo = old.seasonNo;
  let seasonDay = old.seasonDay;
  let weeklyAuction = old.weeklyAuction;
  let lastSettlement = old.lastSettlement || null;
  let seasonRolled = false;
  if (dayClosed) {
    if (old.auctionEcho) {
      old.auctionEcho = Object.assign({}, old.auctionEcho, { daysLeft: Math.max(0, Number(old.auctionEcho.daysLeft) || 0) - 1 });
    }
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
      weeklyAuction = weeklyAuctionFor(seasonNo, seasonDay, null);
      old.weekLog = emptyWeekLog(seasonNo, weeklyAuction.week);
      old.dailyContracts = newDailyContracts(seasonNo, seasonDay, weeklyAuction);
      lastSettlement = old.lastSettlement;
      seasonRolled = true;
    } else {
      seasonDay += 1;
      weeklyAuction = weeklyAuctionFor(seasonNo, seasonDay, weekEnded ? null : weeklyAuction);
      if (!old.weekLog || Number(old.weekLog.week) !== Number(weeklyAuction.week) || Number(old.weekLog.seasonNo) !== Number(seasonNo)) {
        old.weekLog = emptyWeekLog(seasonNo, weeklyAuction.week);
      }
      old.dailyContracts = newDailyContracts(seasonNo, seasonDay, weeklyAuction);
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
  const open = (mode.dailyContracts || []).filter((contract) => contract && !contract.complete);
  return open.find((contract) => contract.role === "interaction")
    || open.find((contract) => contract.role === "weekly")
    || open[0]
    || null;
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
  submitEndlessAuction,
  auctionEchoLine,
  weekSummary
};
