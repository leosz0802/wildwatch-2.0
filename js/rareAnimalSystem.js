"use strict";
const { recordIncrease, recordDecrease } = require("./animalSourceLedger");
const { speciesPopulationGroup } = require("./animalWorld");
const { recordFundChange } = require("./fundLedger");
const { recordEcologyFlow } = require("./ledgerConsistency");
const RARE_AUCTION_START_CHAPTER = 6;
const RARE_AUCTION_MAX_WINNERS = 30;
const RARE_AUCTION_MAX_WAIT_DAYS = 3;
const RARE_BID_FUND_DIVISOR = 6;
// A low archery result may discount the purchase, but the rare-animal
// auction must still consume a meaningful share of the frozen budget.
// Scores 1–4 therefore settle at the 4/6 tier; scores 5–6 keep their
// full score-based price.
const RARE_AUCTION_MIN_BILLED_SCORE = 4;
const RARE_AUCTION_RIVAL_NAMES = ["林溪", "北岸", "石渠", "暮河", "青屿", "白滩", "南风", "岩桥"];
const PASSPORT_LOCATION = "西部岩坡洞域";
const RARE_SPECIES_ID = "pangolin";
const RARE_SPECIES_NAME = "穿山甲";
const RARE_VARIANT_NAME = "鳞芽";
const RESIDENCE_REGION_ID = "rocks";
const DEFAULT_HEALTH = 72;
function number(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
}
function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, number(value)));
}
function currentChapter(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, number(
    progression.stage || progression.displayChapter || progression.storyChapter,
    1
  ));
}
function guardianDay(reserve = {}) {
  return Math.max(1, number(
    (reserve.guardianCycle || {}).day || reserve.seasonDay || 1,
    1
  ));
}
function defaultRareAnimalState() {
  return {
    version: 1,
    speciesId: RARE_SPECIES_ID,
    speciesName: RARE_SPECIES_NAME,
    variantName: RARE_VARIANT_NAME,
    status: "unowned",
    health: 0,
    residence: { regionId: RESIDENCE_REGION_ID, fixed: true },
    care: {
      lastGuardianDay: 0,
      consecutiveMisses: 0,
      totalFeeds: 0,
      totalGrassSpent: 0,
      totalWaterSpent: 0
    },
    auction: {
      id: "",
      chapter: 0,
      status: "closed",
      baseBid: 0,
      finalBid: 0,
      arrowScore: 0,
      frozenFund: 0,
      submittedAt: 0,
      submittedDay: 0,
      settleDay: 0,
      deadlineDay: 0,
      rank: 0,
      winner: false,
      entrants: 0,
      settledAt: 0,
      result: ""
    },
    history: [],
    lastEffect: null,
    lastLetter: null,
    auctionNotice: null
  };
}
function normalizeAuctionNotice(notice) {
  if (!notice || typeof notice !== "object") return null;
  const winners = (Array.isArray(notice.winners) ? notice.winners : []).slice(0, 8).map((entry) => ({
    rank: Math.max(1, number(entry && entry.rank, 1)),
    name: String((entry && entry.name) || "守护者"),
    mine: !!(entry && entry.mine),
    fundDeducted: Math.max(0, number(entry && entry.fundDeducted))
  }));
  return {
    id: String(notice.id || "rare_auction_result"),
    seen: !!notice.seen,
    dismissed: !!notice.dismissed,
    winner: !!notice.winner,
    rank: Math.max(1, number(notice.rank, 1)),
    entrants: Math.max(1, number(notice.entrants, 1)),
    finalBid: Math.max(0, number(notice.finalBid)),
    refund: Math.max(0, number(notice.refund)),
    frozen: Math.max(0, number(notice.frozen)),
    deducted: Math.max(0, number(notice.deducted)),
    variantName: String(notice.variantName || RARE_VARIANT_NAME),
    speciesName: String(notice.speciesName || RARE_SPECIES_NAME),
    result: String(notice.result || ""),
    location: PASSPORT_LOCATION,
    winners
  };
}
function auctionWinnerBoard(auction = {}, playerName = "你", winner = false) {
  const slots = Math.min(RARE_AUCTION_MAX_WINNERS, Math.max(1, number(auction.entrants, 1)));
  const rank = Math.max(1, number(auction.rank, 1));
  const shown = Math.min(6, slots);
  const seed = number(auction.chapter, 1) * 17 + number(auction.finalBid);
  const board = [];
  for (let place = 1; place <= shown; place += 1) {
    board.push({
      rank: place,
      name: RARE_AUCTION_RIVAL_NAMES[(seed + place) % RARE_AUCTION_RIVAL_NAMES.length],
      mine: false,
      fundDeducted: 0
    });
  }
  if (winner) {
    const mine = {
      rank,
      name: playerName || "你",
      mine: true,
      fundDeducted: number(auction.finalBid)
    };
    const index = board.findIndex((entry) => entry.rank === rank);
    if (index >= 0) board[index] = mine;
    else board.push(mine);
  }
  return board.sort((left, right) => left.rank - right.rank);
}
function normalizeRareAnimalState(reserve = {}) {
  const defaults = defaultRareAnimalState();
  const raw = reserve.rareAnimal && typeof reserve.rareAnimal === "object"
    ? reserve.rareAnimal
    : {};
  const state = reserve.rareAnimal = raw;
  Object.keys(defaults).forEach((key) => {
    if (state[key] === undefined) state[key] = defaults[key];
  });
  state.version = 1;
  state.speciesId = RARE_SPECIES_ID;
  state.speciesName = RARE_SPECIES_NAME;
  state.variantName = RARE_VARIANT_NAME;
  state.status = ["unowned", "resident", "migrating", "stolen", "emigrated"].includes(state.status)
    ? state.status
    : "unowned";
  state.health = state.status === "unowned" ? 0 : clamp(state.health || DEFAULT_HEALTH);
  state.residence = Object.assign({}, defaults.residence, state.residence || {}, {
    regionId: RESIDENCE_REGION_ID,
    fixed: true
  });
  state.care = Object.assign({}, defaults.care, state.care || {});
  ["lastGuardianDay", "consecutiveMisses", "totalFeeds", "totalGrassSpent", "totalWaterSpent"]
    .forEach((key) => { state.care[key] = Math.max(0, number(state.care[key])); });
  const auctionObject = state.auction && typeof state.auction === "object"
    ? state.auction
    : {};
  const auctionValues = Object.assign({}, defaults.auction, auctionObject);
  state.auction = auctionObject;
  Object.assign(auctionObject, auctionValues);
  state.auction.chapter = Math.max(0, number(state.auction.chapter));
  state.auction.status = ["closed", "open", "submitted", "settled"].includes(state.auction.status)
    ? state.auction.status
    : "closed";
  ["baseBid", "finalBid", "arrowScore", "frozenFund", "submittedAt", "submittedDay", "settleDay", "deadlineDay", "rank", "entrants", "settledAt"]
    .forEach((key) => { state.auction[key] = Math.max(0, number(state.auction[key])); });
  if (state.auction.status === "submitted" && state.auction.baseBid > 0 && state.auction.arrowScore > 0) {
    state.auction.finalBid = rareAuctionFinalBid(state.auction.baseBid, state.auction.arrowScore);
  }
  state.auction.winner = !!state.auction.winner;
  state.auction.result = String(state.auction.result || "");
  state.history = Array.isArray(state.history) ? state.history.filter(Boolean).slice(-30) : [];
  state.lastEffect = state.lastEffect && typeof state.lastEffect === "object" ? state.lastEffect : null;
  state.lastLetter = state.lastLetter && typeof state.lastLetter === "object" ? state.lastLetter : null;
  state.auctionNotice = normalizeAuctionNotice(state.auctionNotice);
  return state;
}
function auctionResultNotice(reserve = {}) {
  const state = normalizeRareAnimalState(reserve);
  if (state.auctionNotice) return state.auctionNotice;
  const auction = state.auction || {};
  if (auction.status !== "settled") return null;
  state.auctionNotice = normalizeAuctionNotice({
    id: `${auction.id || "rare"}_result_${number(auction.settledAt, number(auction.settleDay, 1))}`,
    seen: false,
    dismissed: false,
    winner: !!auction.winner,
    rank: auction.rank,
    entrants: auction.entrants,
    finalBid: auction.finalBid,
    refund: auction.winner ? Math.max(0, number(auction.frozenFund) - number(auction.finalBid)) : number(auction.frozenFund),
    frozen: auction.frozenFund,
    deducted: auction.winner ? number(auction.finalBid) : 0,
    variantName: state.variantName,
    speciesName: state.speciesName,
    result: auction.result,
    winners: auctionWinnerBoard(auction, "你", !!auction.winner)
  });
  return state.auctionNotice;
}
function isAuctionNoticeUnseen(notice) {
  return !!(notice && !notice.dismissed);
}
function acknowledgeAuctionNotice(reserve = {}) {
  const notice = auctionResultNotice(reserve);
  if (!notice) return false;
  notice.seen = true;
  notice.dismissed = true;
  return true;
}
function hasResidentRareAnimal(reserve = {}) {
  const state = normalizeRareAnimalState(reserve);
  return state.status === "resident" && state.health > 0;
}
function availableFund(reserve = {}) {
  return Math.max(0, number(reserve.fund));
}
function rareAuctionHoldAmount(baseBid = 0) {
  return Math.max(0, number(baseBid)) * RARE_BID_FUND_DIVISOR;
}
function maxBaseBid(reserve = {}) {
  return Math.floor(availableFund(reserve) / RARE_BID_FUND_DIVISOR);
}
function rareAuctionFinalBid(baseBid = 0, arrowScore = 1) {
  const base = Math.max(0, number(baseBid));
  const score = Math.max(1, Math.min(RARE_BID_FUND_DIVISOR, number(arrowScore, 1)));
  return base * Math.max(RARE_AUCTION_MIN_BILLED_SCORE, score);
}
function auctionForChapter(reserve = {}, chapter = currentChapter(reserve)) {
  const state = normalizeRareAnimalState(reserve);
  const targetChapter = Math.max(RARE_AUCTION_START_CHAPTER, number(chapter, currentChapter(reserve)));
  const auction = state.auction;
  if (hasResidentRareAnimal(reserve)) return null;
  if (auction.status === "submitted") return auction;
  if (auction.chapter !== targetChapter || auction.status === "closed") {
    auction.id = `rare_${targetChapter}`;
    auction.chapter = targetChapter;
    auction.status = "open";
    auction.baseBid = 0;
    auction.finalBid = 0;
    auction.arrowScore = 0;
    auction.frozenFund = 0;
    auction.submittedAt = 0;
    auction.submittedDay = 0;
    auction.settleDay = 0;
    auction.deadlineDay = 0;
    auction.rank = 0;
    auction.winner = false;
    auction.entrants = 0;
    auction.settledAt = 0;
    auction.result = "等待本章出价";
  }
  return auction;
}
function rareAuctionView(reserve = {}, chapter = currentChapter(reserve)) {
  const state = normalizeRareAnimalState(reserve);
  const auction = chapter >= RARE_AUCTION_START_CHAPTER ? auctionForChapter(reserve, chapter) : null;
  return {
    available: !!auction,
    chapter,
    id: auction ? auction.id : "",
    speciesName: state.speciesName,
    variantName: state.variantName,
    status: auction ? auction.status : "locked",
    baseBid: auction ? auction.baseBid : 0,
    finalBid: auction ? auction.finalBid : 0,
    arrowScore: auction ? auction.arrowScore : 0,
    maxBaseBid: maxBaseBid(reserve),
    frozenFund: auction ? auction.frozenFund : 0,
    settleDay: auction ? auction.settleDay : 0,
    result: auction ? auction.result : `第${RARE_AUCTION_START_CHAPTER}章开放`
  };
}
function appendHistory(state, item) {
  state.history = (state.history || []).concat(Object.assign({
    at: Date.now(),
    chapter: state.auction.chapter
  }, item)).slice(-30);
}
function createRareLetter(state, day, occasion = "care") {
  const safeDay = Math.max(1, number(day, 1));
  const id = `rare_letter_${state.auction.chapter || RARE_AUCTION_START_CHAPTER}_${safeDay}_${occasion}`;
  const existing = state.lastLetter && state.lastLetter.id;
  if (existing === id) return state.lastLetter;
  const body = occasion === "won"
    ? "岩坡的风把我带到这里。别急着把我变成一项成绩，先让我把夜里的蚁路记熟。"
    : occasion === "risk"
      ? "今晚有陌生脚步靠近洞口。我会先退到暗处，等你把水草和边界稳住。"
      : "今天的水草刚好够用。我把一段安静的夜路写给你，明天还会回来。";
  state.lastLetter = {
    id,
    day: safeDay,
    title: occasion === "won" ? "鳞芽的第一封信" : "鳞芽的夜间来信",
    salutation: "给守望者：",
    paragraphs: [body],
    signoff: "——鳞芽",
    occasion,
    readAt: 0,
    sharedAt: 0
  };
  return state.lastLetter;
}
function submitRareAuctionBid(reserve = {}, options = {}) {
  const chapter = currentChapter(reserve);
  if (chapter < RARE_AUCTION_START_CHAPTER) {
    return { ok: false, error: "第6章开始开放珍稀物种拍卖" };
  }
  if (hasResidentRareAnimal(reserve)) {
    return { ok: false, error: "当前已有珍稀物种居住，无需重复竞拍" };
  }
  const state = normalizeRareAnimalState(reserve);
  const auction = auctionForChapter(reserve, chapter);
  if (auction && auction.status === "submitted") {
    return {
      ok: true,
      already: true,
      auction: Object.assign({}, auction),
      availableFund: availableFund(reserve),
      maxBaseBid: maxBaseBid(reserve)
    };
  }
  if (!auction || auction.status !== "open") {
    return { ok: false, error: "本章竞拍已提交或结算" };
  }
  const limit = maxBaseBid(reserve);
  const requestedBid = Math.max(0, number(options.baseBid));
  const baseBid = Math.max(1, requestedBid || limit);
  const arrowScore = Math.max(1, Math.min(6, number(options.arrowScore, 1)));
  if (baseBid > limit) {
    return { ok: false, error: `出价不能超过当前基金的1/6（最多${limit}）`, maxBaseBid: limit };
  }
  const frozenFund = rareAuctionHoldAmount(baseBid);
  if (number(reserve.fund) < frozenFund) {
    return { ok: false, error: "保护基金不足以冻结本次最高出价" };
  }
  const before = number(reserve.fund);
  reserve.fund = before - frozenFund;
  const submittedDay = Math.max(1, number(options.submittedDay, guardianDay(reserve)));
  const deadlineDay = submittedDay + RARE_AUCTION_MAX_WAIT_DAYS;
  recordFundChange(reserve, before, reserve.fund, "珍稀幼崽竞拍冻结", submittedDay, `本章最高出价 ${frozenFund}`);
  Object.assign(auction, {
    status: "submitted",
    baseBid,
    finalBid: rareAuctionFinalBid(baseBid, arrowScore),
    arrowScore,
    frozenFund,
    submittedAt: Date.now(),
    submittedDay,
    settleDay: submittedDay + 1,
    deadlineDay,
    rank: 0,
    winner: false,
    entrants: Math.max(1, number(options.entrants, 1)),
    result: `已提交。按守护日计算，下一次入夜公布，最迟第${deadlineDay}个守护日一定获得`
  });
  appendHistory(state, { type: "bid", baseBid, arrowScore, finalBid: auction.finalBid, frozenFund });
  return {
    ok: true,
    auction: Object.assign({}, auction),
    availableFund: availableFund(reserve),
    maxBaseBid: maxBaseBid(reserve)
  };
}
function addRareAnimalToPopulation(reserve = {}, amount = 1) {
  const group = speciesPopulationGroup(RARE_SPECIES_ID);
  reserve.ecology = reserve.ecology || {};
  reserve.ecology[group] = reserve.ecology[group] || {};
  const before = Math.max(0, number(reserve.ecology[group][RARE_SPECIES_ID]));
  reserve.ecology[group][RARE_SPECIES_ID] = before + Math.max(0, number(amount));
  return reserve.ecology[group][RARE_SPECIES_ID] - before;
}
function withAuctionChapterLedger(reserve = {}, chapter, action) {
  const progression = reserve.progression || (reserve.progression = {});
  const target = Math.max(1, number(chapter, currentChapter(reserve)));
  const previous = {
    stage: progression.stage,
    displayChapter: progression.displayChapter,
    storyChapter: progression.storyChapter
  };
  progression.stage = target;
  progression.displayChapter = target;
  progression.storyChapter = target;
  try {
    return action();
  } finally {
    if (previous.stage === undefined) delete progression.stage;
    else progression.stage = previous.stage;
    if (previous.displayChapter === undefined) delete progression.displayChapter;
    else progression.displayChapter = previous.displayChapter;
    if (previous.storyChapter === undefined) delete progression.storyChapter;
    else progression.storyChapter = previous.storyChapter;
  }
}
function recordRareAuctionLedger(reserve = {}, chapter, amount = 1) {
  return withAuctionChapterLedger(reserve, chapter, () => recordIncrease(
    reserve,
    "rareAuction",
    amount,
    { speciesId: RARE_SPECIES_ID }
  ));
}
function removeRareAnimalFromPopulation(reserve = {}, amount = 1) {
  const group = speciesPopulationGroup(RARE_SPECIES_ID);
  reserve.ecology = reserve.ecology || {};
  reserve.ecology[group] = reserve.ecology[group] || {};
  const before = Math.max(0, number(reserve.ecology[group][RARE_SPECIES_ID]));
  const removed = Math.min(before, Math.max(0, number(amount)));
  reserve.ecology[group][RARE_SPECIES_ID] = before - removed;
  return removed;
}
function ensureRareAnimalPopulation(reserve = {}) {
  const state = normalizeRareAnimalState(reserve);
  if (!["resident", "migrating"].includes(state.status)) return 0;
  const group = speciesPopulationGroup(RARE_SPECIES_ID);
  reserve.ecology = reserve.ecology || {};
  reserve.ecology[group] = reserve.ecology[group] || {};
  const current = Math.max(0, number(reserve.ecology[group][RARE_SPECIES_ID]));
  if (current >= 1) return 0;
  reserve.ecology[group][RARE_SPECIES_ID] = 1;
  return 1;
}
function rareAuctionDeadline(auction = {}, day = 1) {
  const submittedDay = Math.max(1, number(auction.submittedDay) || Math.max(1, number(auction.settleDay) - 1 || day));
  return Math.max(submittedDay + 1, number(auction.deadlineDay) || submittedDay + RARE_AUCTION_MAX_WAIT_DAYS);
}
function settleRareAuction(reserve = {}, options = {}) {
  const state = normalizeRareAnimalState(reserve);
  const auction = state.auction;
  if (auction.status !== "submitted") return { ok: false, error: "没有待结算的竞拍" };
  const day = guardianDay(reserve);
  const deadline = rareAuctionDeadline(auction, day);
  const settleDay = Math.max(1, number(auction.settleDay) || number(auction.submittedDay) + 1 || day + 1);
  if (!options.force && day < settleDay && day < deadline) {
    return { ok: false, error: `下一次入夜公布，最迟第${deadline}个守护日`, pending: true, deadlineDay: deadline };
  }
  const rank = Math.max(1, number(options.rank, 1));
  const entrants = Math.max(1, number(options.entrants, auction.entrants || 1));
  const winner = options.winner === undefined ? rank <= RARE_AUCTION_MAX_WINNERS : !!options.winner;
  const playerName = String(options.playerName || "你");
  const before = number(reserve.fund);
  const frozen = Math.max(0, number(auction.frozenFund));
  const finalBid = Math.max(0, number(auction.finalBid));
  const refund = winner ? Math.max(0, frozen - finalBid) : frozen;
  reserve.fund = before + refund;
  if (refund) recordFundChange(reserve, before, reserve.fund, winner ? "珍稀幼崽竞拍差额退回" : "珍稀幼崽竞拍未中退款", day, winner ? `最终出价 ${finalBid}` : "未进入前30");
  Object.assign(auction, {
    status: "settled",
    rank,
    entrants,
    winner,
    settledAt: Date.now(),
    result: winner ? `竞拍成功，世界排名第${rank}，获得${state.variantName}` : `竞拍未中，世界排名第${rank}，基金已退回`
  });
  if (winner) {
    state.status = "resident";
    state.health = DEFAULT_HEALTH;
    state.care.lastGuardianDay = day;
    createRareLetter(state, day, "won");
    addRareAnimalToPopulation(reserve, 1);
    recordRareAuctionLedger(reserve, auction.chapter || currentChapter(reserve), 1);
    state.lastEffect = { source: "rareAuction", animalDelta: 1, visitorMultiplier: 1 };
    appendHistory(state, { type: "won", rank, entrants, finalBid, animalDelta: 1 });
  } else {
    appendHistory(state, { type: "lost", rank, entrants, finalBid, animalDelta: 0 });
  }
  state.auctionNotice = normalizeAuctionNotice({
    id: `${auction.id || "rare"}_result_${number(auction.settledAt, day)}`,
    seen: false,
    dismissed: false,
    winner,
    rank,
    entrants,
    finalBid,
    refund,
    frozen,
    deducted: winner ? finalBid : 0,
    variantName: state.variantName,
    speciesName: state.speciesName,
    result: auction.result,
    location: PASSPORT_LOCATION,
    winners: auctionWinnerBoard(Object.assign({}, auction, { entrants, rank, finalBid }), playerName, winner)
  });
  return {
    ok: true,
    winner,
    rank,
    entrants,
    finalBid,
    refund,
    notice: state.auctionNotice,
    auction: Object.assign({}, auction),
    state: Object.assign({}, state)
  };
}
function settleRareAuctionForProgression(reserve = {}, options = {}) {
  const state = normalizeRareAnimalState(reserve);
  const auction = state.auction || {};
  const playerName = String(options.playerName || "你");
  if (auction.status === "submitted") {
    const result = withAuctionChapterLedger(
      reserve,
      auction.chapter || currentChapter(reserve),
      () => settleRareAuction(reserve, {
        force: true,
        playerName,
        rank: options.rank,
        entrants: options.entrants
      })
    );
    return Object.assign({ changed: true, reason: "submitted" }, result);
  }
  const winnerSettled = auction.status === "settled" && auction.winner;
  const residentState = state.status === "resident" || state.status === "migrating";
  if (!winnerSettled && !residentState) {
    return { ok: false, changed: false, state: Object.assign({}, state), auction: Object.assign({}, auction) };
  }
  const beforeStatus = state.status;
  if (winnerSettled && state.status === "unowned") {
    state.status = "resident";
    state.health = DEFAULT_HEALTH;
  }
  const populationAdded = ensureRareAnimalPopulation(reserve);
  let ledgerRepaired = 0;
  const auctionChapter = auction.chapter || currentChapter(reserve);
  const auctionLedger = (((reserve.animalSourceLedger || {}).chapters || {})[auctionChapter]) || {};
  if (winnerSettled
      && Math.max(0, number(auctionLedger.rareAuction)) <= 0) {
    auction.chapter = auctionChapter;
    ledgerRepaired = recordRareAuctionLedger(
      reserve,
      auctionChapter,
      Math.max(1, populationAdded)
    );
  }
  return {
    ok: true,
    changed: beforeStatus !== state.status || populationAdded > 0 || ledgerRepaired > 0,
    reason: winnerSettled ? "settled" : "resident",
    populationAdded,
    ledgerRepaired,
    state: Object.assign({}, state),
    auction: Object.assign({}, auction)
  };
}
function careRareAnimal(reserve = {}, options = {}) {
  const state = normalizeRareAnimalState(reserve);
  if (state.status !== "resident") return { ok: false, error: "当前没有需要照护的珍稀幼崽" };
  const day = guardianDay(reserve);
  if (state.care.lastGuardianDay === day) return { ok: false, error: "今天已经完成照护", state: Object.assign({}, state) };
  const ecology = reserve.ecology || (reserve.ecology = {});
  const water = Math.max(0, number(ecology.water));
  const grass = Math.max(0, number(ecology.grass));
  const enough = water >= 2 && grass >= 2;
  if (enough) {
    ecology.water = water - 2;
    ecology.grass = grass - 2;
    recordEcologyFlow(reserve, "water", -2, "珍稀动物照护", day);
    recordEcologyFlow(reserve, "grass", -2, "珍稀动物照护", day);
    state.health = clamp(state.health + 6);
    state.care.consecutiveMisses = 0;
    state.care.totalFeeds += 1;
    state.care.totalWaterSpent += 2;
    state.care.totalGrassSpent += 2;
  } else {
    state.health = clamp(state.health - 4);
    state.care.consecutiveMisses += 1;
  }
  state.care.lastGuardianDay = day;
  state.lastEffect = {
    source: "rareCare",
    waterDelta: enough ? -2 : 0,
    grassDelta: enough ? -2 : 0,
    healthDelta: enough ? 6 : -4,
    status: enough ? "fed" : "shortage"
  };
  appendHistory(state, { type: "care", day, enough, health: state.health });
  if (enough && day % 3 === 0) createRareLetter(state, day, "care");
  return { ok: true, enough, health: state.health, state: Object.assign({}, state), effect: state.lastEffect };
}
function advanceRareAnimalDay(reserve = {}, context = {}) {
  const state = normalizeRareAnimalState(reserve);
  if (state.status !== "resident") return null;
  const day = Math.max(1, number(context.day, guardianDay(reserve)));
  if (state.care.lastGuardianDay >= day) return null;
  const missed = state.care.consecutiveMisses > 0 ? 12 : 8;
  state.health = clamp(state.health - missed);
  state.care.consecutiveMisses += 1;
  state.care.lastGuardianDay = day;
  const ecology = reserve.ecology || {};
  if (number(ecology.water) < 20 || number(ecology.grass) < 20) state.health = clamp(state.health - 4);
  const pressure = number(reserve.poacherPressure);
  const safety = number(reserve.safety || reserve.stability);
  if (pressure >= 70 && safety < 45 && state.health < 45) {
    state.status = "migrating";
    state.lastEffect = { source: "rareRisk", status: "migrating", health: state.health };
    createRareLetter(state, day, "risk");
  }
  appendHistory(state, { type: "missedCare", day, health: state.health, status: state.status });
  return Object.assign({}, state.lastEffect || {}, { status: state.status, health: state.health, day });
}
function resolveRareAnimalRisk(reserve = {}, options = {}) {
  const state = normalizeRareAnimalState(reserve);
  if (!["resident", "migrating"].includes(state.status)) return null;
  const pressure = number(reserve.poacherPressure);
  const safety = number(reserve.safety || reserve.stability);
  const action = String(options.action || "");
  if (state.status === "migrating" && ["habitat", "rareAnimalCare", "intervention"].includes(action)) {
    state.status = "resident";
    state.health = clamp(state.health + 8);
    state.care.consecutiveMisses = 0;
    state.lastEffect = { source: "rareRecovery", status: "resident", health: state.health };
    appendHistory(state, { type: "recovered", day: guardianDay(reserve), health: state.health });
    return state.lastEffect;
  }
  if (pressure >= 82 && safety < 38 && state.status === "migrating") {
    state.status = "stolen";
    const removed = removeRareAnimalFromPopulation(reserve, 1);
    if (removed) recordDecrease(reserve, "rareStolen", removed, { speciesId: RARE_SPECIES_ID });
    state.lastEffect = { source: "rareTheft", status: "stolen", animalDelta: -removed };
    appendHistory(state, { type: "stolen", day: guardianDay(reserve), animalDelta: -removed });
    return state.lastEffect;
  }
  if (state.status === "migrating" && state.care.consecutiveMisses >= 3) {
    state.status = "emigrated";
    const removed = removeRareAnimalFromPopulation(reserve, 1);
    if (removed) recordDecrease(reserve, "rareMigrated", removed, { speciesId: RARE_SPECIES_ID });
    state.lastEffect = { source: "rareMigration", status: "emigrated", animalDelta: -removed };
    appendHistory(state, { type: "migrated", day: guardianDay(reserve), animalDelta: -removed });
    return state.lastEffect;
  }
  return null;
}
function rareAnimalVisitorMultiplier(reserve = {}) {
  const state = normalizeRareAnimalState(reserve);
  if (!hasResidentRareAnimal(reserve)) return 1;
  if (state.health >= 80) return 1.05;
  if (state.health < 40) return 0.95;
  return 1;
}
function rareAnimalRetentionBonus(reserve = {}) {
  const state = normalizeRareAnimalState(reserve);
  if (!hasResidentRareAnimal(reserve)) return 0;
  if (state.health >= 80) return 0.02;
  if (state.health < 40) return -0.02;
  return 0;
}
function rareAnimalBreedingCondition(reserve = {}) {
  const state = normalizeRareAnimalState(reserve);
  if (!hasResidentRareAnimal(reserve)) return 0;
  if (state.health >= 80) return 1;
  if (state.health < 40) return 0;
  return 0;
}
function rareAnimalMapMarker(reserve = {}, context = {}) {
  const chapter = currentChapter(reserve);
  const view = rareAuctionView(reserve, chapter);
  const state = normalizeRareAnimalState(reserve);
  const notice = auctionResultNotice(reserve);
  if (isAuctionNoticeUnseen(notice)) {
    return {
      id: `rare_auction_result_${chapter}`,
      regionId: RESIDENCE_REGION_ID,
      kind: "rareAuction",
      type: "rareAuction",
      title: notice.winner ? `你获得了${notice.variantName}` : "这次没有获得幼崽",
      label: "拍卖结果",
      dialogue: notice.winner
        ? `世界排名第${notice.rank}，${notice.variantName}的护照已经写好。`
        : `世界排名第${notice.rank}，冻结基金已退回。`,
      impact: notice.result || "入夜后公布的幼崽拍卖结果还没有看完。",
      recommendAction: "rareAuction",
      recommendLabel: "查看结果",
      auction: view,
      auctionNotice: notice,
      intensity: 3
    };
  }
  if (view.available) {
    return {
      id: `rare_auction_${chapter}`,
      regionId: RESIDENCE_REGION_ID,
      kind: "rareAuction",
      type: "rareAuction",
      title: `${state.speciesName}幼崽拍卖`,
      label: `第${chapter}章 · 幼崽拍卖`,
      dialogue: `巡护员：本章只开放一次，基础出价最多 ${view.maxBaseBid}。`,
      impact: `基础出价最多${view.maxBaseBid}，射箭得分会决定最终出价。`,
      recommendAction: "rareAuction",
      recommendLabel: "查看竞拍",
      auction: view,
      intensity: 2
    };
  }
  if (state.status === "resident" || state.status === "migrating") {
    return {
      id: "rare_animal_passport",
      regionId: RESIDENCE_REGION_ID,
      kind: "rarePassport",
      type: "rarePassport",
      title: `${state.variantName}的护照`,
      label: "珍稀护照",
      dialogue: `${state.variantName}的护照固定在${PASSPORT_LOCATION}。`,
      impact: state.status === "migrating"
        ? "护照仍在岩坡。幼崽准备离开，先稳住水草。"
        : `健康${state.health}/100 · 点开护照查看这只珍稀动物`,
      recommendAction: "rareAnimalPassport",
      recommendLabel: "查看护照",
      rareAnimal: {
        status: state.status,
        health: state.health,
        speciesName: state.speciesName,
        variantName: state.variantName,
        location: PASSPORT_LOCATION
      },
      intensity: state.status === "migrating" ? 3 : 1
    };
  }
  return null;
}
function rareAnimalChapterGate(reserve = {}, chapter = currentChapter(reserve)) {
  if (number(chapter) < 10) return { required: false, met: true, label: "" };
  const met = hasResidentRareAnimal(reserve);
  return {
    required: true,
    met,
    label: met ? "已拥有1只在住珍稀物种" : "必须拥有1只在住珍稀物种"
  };
}
module.exports = {
  RARE_AUCTION_START_CHAPTER,
  RARE_AUCTION_MAX_WINNERS,
  RARE_AUCTION_MAX_WAIT_DAYS,
  PASSPORT_LOCATION,
  normalizeAuctionNotice,
  auctionResultNotice,
  isAuctionNoticeUnseen,
  acknowledgeAuctionNotice,
  auctionWinnerBoard,
  RARE_BID_FUND_DIVISOR,
  RARE_SPECIES_ID,
  RARE_SPECIES_NAME,
  RARE_VARIANT_NAME,
  defaultRareAnimalState,
  normalizeRareAnimalState,
  currentChapter,
  guardianDay,
  hasResidentRareAnimal,
  availableFund,
  rareAuctionHoldAmount,
  maxBaseBid,
  RARE_AUCTION_MIN_BILLED_SCORE,
  rareAuctionFinalBid,
  auctionForChapter,
  rareAuctionView,
  submitRareAuctionBid,
  ensureRareAnimalPopulation,
  settleRareAuction,
  settleRareAuctionForProgression,
  careRareAnimal,
  advanceRareAnimalDay,
  resolveRareAnimalRisk,
  rareAnimalVisitorMultiplier,
  rareAnimalRetentionBonus,
  rareAnimalBreedingCondition,
  rareAnimalMapMarker,
  rareAnimalChapterGate
};
