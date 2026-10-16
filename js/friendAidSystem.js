"use strict";
const { proposeAutoExchange, proposalWithWant, settleAutoExchange, wildernessTradeDailyUsage, wildernessFindById, wildernessTradePreview, sandboxExchangeIconReady, consumeSandboxExchangeIcon } = require("./packBridge").wildernessKnowledge;
const { chapterSpecialDef, applySpecialMetric, METRIC_LABELS, changeSummary } = require("./chapterSpecialSystem");
const AID_FRACTION = 1 / 3;
const FRIEND_AID_FALLBACK_MS = 24 * 60 * 60 * 1000;
const LOCAL_ALLY = Object.freeze({ id: "npc_ache", name: "阿澈", simulated: true });
const NPC_PARTNERS = Object.freeze([
  LOCAL_ALLY,
  Object.freeze({ id: "npc_linchuan", name: "林川", simulated: true }),
  Object.freeze({ id: "npc_qingtai", name: "青苔", simulated: true })
]);
const ITEM_BY_METRIC = Object.freeze({
  water: "wax_seal",
  grass: "pinecone_humidity",
  animals: "down_insulation",
  visitors: "quartz_signal",
  fund: "gourd_container"
});
function n(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}
function chapterOf(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, Math.min(18, n(progression.stage || progression.displayChapter || 1)));
}
function emptyState(chapter) {
  return {
    version: 3,
    chapter: Math.max(1, Math.min(18, n(chapter) || 1)),
    request: null,
    incoming: null,
    used: false,
    history: []
  };
}
function namedAlly(friends = [], now = Date.now()) {
  return matchExchangePartner(friends, now);
}
function matchExchangePartner(friends = [], now = Date.now(), preferred = null) {
  if (preferred && preferred.id && preferred.simulated !== true && !preferred.mine) {
    return {
      id: String(preferred.id || preferred.openId).slice(0, 48),
      name: String(preferred.owner || preferred.nickName || preferred.nickname || preferred.name || "真实玩家").trim().slice(0, 16) || "真实玩家",
      simulated: false,
      channel: preferred.scope === "world" ? "world" : "friends"
    };
  }
  const real = (friends || []).filter((item) => item && item.simulated !== true && item.mine !== true
    && (item.id || item.openId || item.owner || item.nickName || item.nickname || item.name)
    && !/^world_/i.test(String(item.id || "")));
  if (real.length) {
    const pick = real[Math.abs(n(now)) % real.length];
    return {
      id: String(pick.id || pick.openId || `friend_${real.length}`).slice(0, 48),
      name: String(pick.owner || pick.nickName || pick.nickname || pick.name || "真实玩家").trim().slice(0, 16) || "真实玩家",
      simulated: false,
      channel: pick.scope === "world" ? "world" : "friends"
    };
  }
  const npc = NPC_PARTNERS[0];
  return Object.assign({ channel: "friends" }, npc);
}
function itemForMetric(metric) {
  const id = ITEM_BY_METRIC[metric] || "resin_tinder";
  const item = wildernessFindById(id);
  return { id, label: (item && item.label) || "求援包裹" };
}
function aidAmount(def, metric) {
  const success = Math.abs(n((def.success || {})[metric]));
  return Math.max(1, Math.round(success * AID_FRACTION));
}
function normalizeParcel(entry, chapter) {
  if (!entry || typeof entry !== "object") return null;
  const status = ["sealed", "opened", "used"].includes(entry.status) ? entry.status : "sealed";
  const kind = entry.kind === "incoming" ? "incoming" : "exchange";
  const metric = ["visitors", "animals", "water", "grass", "fund"].includes(entry.metric) ? entry.metric : "";
  const item = metric ? itemForMetric(metric) : { id: entry.itemId || "", label: entry.itemLabel || "交换结果" };
  return {
    id: String(entry.id || `aid_in_${chapter}`).slice(0, 80),
    kind,
    status,
    friendId: String(entry.friendId || LOCAL_ALLY.id).slice(0, 48),
    friendName: String(entry.friendName || LOCAL_ALLY.name).slice(0, 16),
    partnerKind: entry.partnerKind === "npc" || entry.simulated === true ? "npc" : "player",
    itemId: String(entry.itemId || item.id).slice(0, 40),
    itemLabel: String(entry.itemLabel || item.label).slice(0, 24),
    offerId: String(entry.offerId || "").slice(0, 40),
    offerLabel: String(entry.offerLabel || "").slice(0, 24),
    chapter: Math.max(1, Math.min(18, n(entry.chapter) || chapter)),
    metric: metric || "",
    reason: String(entry.reason || "").slice(0, 180),
    createdAt: n(entry.createdAt) || Date.now(),
    openedAt: n(entry.openedAt) || 0,
    usedAt: n(entry.usedAt) || 0,
    source: ["sandbox", "league"].includes(entry.source) ? entry.source : "sandbox"
  };
}
function normalizeFriendAid(reserve = {}) {
  const chapter = chapterOf(reserve);
  const previous = reserve.friendAid || {};
  const pendingRequest = !!(previous.request && typeof previous.request === "object"
    && previous.request.status === "pending");
  const exchangeInbox = !!(previous.incoming && typeof previous.incoming === "object"
    && previous.incoming.kind === "exchange"
    && ["sealed", "opened"].includes(previous.incoming.status));
  const sameChapter = n(previous.chapter) === chapter;
  const keepAcrossChapter = pendingRequest || exchangeInbox;
  const state = (sameChapter || keepAcrossChapter)
    ? Object.assign(emptyState(chapter), previous, { chapter })
    : emptyState(chapter);
  state.used = !!state.used;
  const incomingOriginalChapter = n((state.incoming || {}).chapter) || chapter;
  state.incoming = normalizeParcel(state.incoming, exchangeInbox ? incomingOriginalChapter : chapter);
  if (state.incoming && state.incoming.chapter !== chapter && state.incoming.kind !== "exchange") state.incoming = null;
  if (state.request && typeof state.request === "object") {
    state.request = {
      id: String(state.request.id || `aid_req_${chapter}`).slice(0, 80),
      status: ["pending", "sent", "accepted", "fallback", "completed", "waiting"].includes(state.request.status)
        ? state.request.status : "waiting",
      regionId: String(state.request.regionId || "meadow").slice(0, 24),
      friendId: String(state.request.friendId || "").slice(0, 48),
      friendName: String(state.request.friendName || "").slice(0, 16),
      partnerKind: state.request.partnerKind === "npc" ? "npc" : "player",
      offerId: String(state.request.offerId || "").slice(0, 40),
      offerLabel: String(state.request.offerLabel || "").slice(0, 24),
      wantId: String(state.request.wantId || "").slice(0, 40),
      wantLabel: String(state.request.wantLabel || "").slice(0, 24),
      createdAt: n(state.request.createdAt) || Date.now(),
      sentAt: n(state.request.sentAt) || 0,
      fallbackAt: n(state.request.fallbackAt) || 0,
      expiresAt: n(state.request.expiresAt) || 0,
      resolvedAt: n(state.request.resolvedAt) || 0,
      resolution: String(state.request.resolution || "").slice(0, 24)
    };
  } else {
    state.request = null;
  }
  state.history = (Array.isArray(state.history) ? state.history : [])
    .filter((entry) => entry && typeof entry === "object")
    .slice(-24);
  if (state.used && state.incoming) state.incoming.status = "used";
  reserve.friendAid = state;
  return state;
}
function ensureFriendAid(reserve = {}, now = Date.now()) {
  const state = normalizeFriendAid(reserve);
  reserve.friendAid = state;
  return state;
}
function friendAidStatus(reserve = {}, now = Date.now()) {
  const state = ensureFriendAid(reserve, now);
  const incoming = state.incoming;
  const proposal = proposeAutoExchange(reserve);
  const day = n(((reserve.guardianCycle || {}).day) || 1) || 1;
  const usage = wildernessTradeDailyUsage(reserve, day);
  const waitingResult = !!(incoming && incoming.status === "sealed");
  const specialParcel = !!(incoming && incoming.kind !== "exchange" && incoming.metric);
  const waitingResponse = !!(state.request && state.request.status === "pending");
  const fallbackReady = waitingResponse && (
    !state.request.fallbackAt || Number(now) >= state.request.fallbackAt
  );
  return {
    state,
    chapter: state.chapter,
    used: !!state.used,
    proposal,
    usage,
    canRequest: !waitingResult && !waitingResponse && !!proposal && usage.remaining > 0,
    canOpen: waitingResult,
    canUse: !state.used && !!(incoming && incoming.status === "opened" && specialParcel),
    incoming,
    request: state.request,
    waitingResponse,
    fallbackReady
  };
}
function friendAidRequestReadiness(reserve = {}, proposal = null, partner = {}, day = 1) {
  if (!proposal || !proposal.offer || !proposal.want) {
    return { ok: false, reason: "no_proposal", message: "还没有可用的交换方案，请先探索一份可交换素材。" };
  }
  const usage = wildernessTradeDailyUsage(reserve, day);
  if (usage.remaining <= 0) {
    return { ok: false, reason: "limit", message: "今日交换次数已用完，明天再发出求援。" };
  }
  const preview = wildernessTradePreview(reserve, proposal.offer.id, partner.channel === "world" ? "world" : "friends", partner, proposal.want.id);
  if (preview.ready) return { ok: true, reason: "ready", preview };
  const offer = preview.offer || {};
  if (!offer.ready) {
    const stock = Math.max(0, Number(offer.stock) || 0);
    const available = Math.max(0, Number(offer.available) || 0);
    return {
      ok: false,
      reason: available > 0 || stock > 0 ? "reserved" : "out_of_stock",
      message: available > 0 || stock > 0
        ? `这份${proposal.offer.label}还被建设占用，只有真正溢出的库存才能交换。`
        : `${proposal.offer.label}已经没有可交换库存，请先重新探索。`
    };
  }
  if (preview.wantedItem && Math.abs(Number(proposal.offer.tradeValue) - Number(proposal.want.tradeValue)) > 1) {
    return {
      ok: false,
      reason: "unequal_value",
      message: `${proposal.offer.label}与${proposal.want.label}的交换价值不匹配，请换一份同价值缺口物资。`
    };
  }
  if (!preview.partnerId) return { ok: false, reason: "no_partner", message: "暂时没有可匹配的保护区，请稍后再试。" };
  return { ok: false, reason: "not_ready", message: "交换条件刚刚发生变化，请关闭后重新打开求援。" };
}
function sendFriendAidRequest(reserve = {}, friends = [], now = Date.now(), options = {}) {
  const status = friendAidStatus(reserve, now);
  if (status.canOpen) return { ok: false, reason: "incoming", status };
  const proposal = options.wantId
    ? proposalWithWant(reserve, options.wantId)
    : (status.proposal || proposeAutoExchange(reserve));
  if (!proposal) return { ok: false, reason: options.wantId ? "no_want" : "no_stock", status };
  if (status.usage.remaining <= 0) return { ok: false, reason: "limit", status };
  const stamp = Number(now) || Date.now();
  const day = n(((reserve.guardianCycle || {}).day) || options.day || 1) || 1;
  const partner = matchExchangePartner(friends, stamp, options.partner || null);
  if (options.channel === "world" || options.channel === "friends") partner.channel = options.channel;
  const readiness = friendAidRequestReadiness(reserve, proposal, partner, day);
  if (!readiness.ok) return Object.assign({ ok: false, status, proposal, partner }, readiness);
  const state = status.state;
  /*
   * A named real friend is a real request now. Keep the offered item in the
   * sender's stock until the friend confirms. The UI can fall back to a
   * patrol NPC after the short timeout so a missing response never blocks
   * the player.
   */
  if (options.deferRealFriend && partner.simulated !== true) {
    const request = {
      id: `aid_req_${state.chapter}_${stamp}`,
      status: "pending",
      regionId: "meadow",
      friendId: partner.id,
      friendName: partner.name,
      partnerKind: "player",
      offerId: proposal.offer.id,
      offerLabel: proposal.offer.label,
      wantId: proposal.want.id,
      wantLabel: proposal.want.label,
      createdAt: stamp,
      sentAt: stamp,
      fallbackAt: stamp + FRIEND_AID_FALLBACK_MS,
      expiresAt: stamp + FRIEND_AID_FALLBACK_MS,
      resolvedAt: 0,
      resolution: ""
    };
    state.request = request;
    state.incoming = null;
    state.used = false;
    state.history = (state.history || []).concat({
      type: "request",
      status: "pending",
      id: request.id,
      friendId: partner.id,
      friendName: partner.name,
      offerId: proposal.offer.id,
      wantId: proposal.want.id,
      createdAt: stamp
    }).slice(-24);
    reserve.friendAid = state;
    return {
      ok: true,
      pending: true,
      proposal,
      partner: Object.assign({}, partner, { kind: "player", label: partner.name }),
      request,
      summary: `已发给${partner.name}，等待对方确认`,
      status: friendAidStatus(reserve, stamp)
    };
  }
  const settled = settleAutoExchange(reserve, proposal, partner, {
    day,
    createdAt: stamp,
    source: options.source === "league" ? "league" : "sandbox"
  });
  if (!settled.ok) return { ok: false, reason: settled.reason || "settle", status };
  consumeSandboxExchangeIcon(reserve, stamp);
  state.request = {
    id: `aid_req_${state.chapter}_${stamp}`,
    status: "sent",
    regionId: "meadow",
    friendId: partner.id,
    friendName: settled.partner.label,
    partnerKind: settled.partner.kind,
    offerId: proposal.offer.id,
    offerLabel: proposal.offer.label,
    wantId: proposal.want.id,
    wantLabel: proposal.want.label,
    createdAt: stamp,
    sentAt: stamp,
    fallbackAt: 0,
    expiresAt: 0,
    resolvedAt: stamp,
    resolution: partner.simulated === true ? "npc" : "immediate"
  };
  state.history = (state.history || []).concat({
    type: "settlement",
    status: "completed",
    id: state.request.id,
    friendId: partner.id,
    friendName: settled.partner.label,
    partnerKind: partner.simulated === true ? "npc" : "player",
    createdAt: stamp,
    resolvedAt: stamp,
    resolution: partner.simulated === true ? "npc" : "immediate"
  }).slice(-24);
  state.incoming = {
    id: settled.tradeId,
    kind: "exchange",
    status: "sealed",
    friendId: partner.id,
    friendName: settled.partner.label,
    partnerKind: settled.partner.kind,
    itemId: proposal.want.id,
    itemLabel: proposal.want.label,
    offerId: proposal.offer.id,
    offerLabel: proposal.offer.label,
    chapter: state.chapter,
    metric: "",
    reason: `${settled.partner.label}用${proposal.want.label}换走了你的${proposal.offer.label}。`,
    createdAt: stamp,
    openedAt: 0,
    usedAt: 0,
    source: options.source === "league" ? "league" : "sandbox"
  };
  state.used = false;
  reserve.friendAid = state;
  return {
    ok: true,
    proposal,
    partner: settled.partner,
    parcel: state.incoming,
    summary: settled.summary,
    status: friendAidStatus(reserve, stamp)
  };
}
function settlePendingFriendAid(reserve = {}, friends = [], now = Date.now(), options = {}) {
  const status = friendAidStatus(reserve, now);
  const request = status.request;
  if (!request || request.status !== "pending") {
    return { ok: false, reason: request ? "resolved" : "missing", status };
  }
  const stamp = Number(now) || Date.now();
  const expired = !!options.forceFallback
    || (request.fallbackAt && stamp >= request.fallbackAt)
    || (request.expiresAt && stamp >= request.expiresAt);
  if (!expired && options.accept !== true) {
    return { ok: false, reason: "waiting", request, status };
  }
  const realPartner = !options.forceFallback && options.accept === true
    ? matchExchangePartner(friends, stamp, { id: request.friendId, name: request.friendName, simulated: false })
    : null;
  const partner = realPartner || Object.assign({}, LOCAL_ALLY, { channel: "friends" });
  const proposal = proposalWithWant(reserve, request.wantId);
  if (!proposal || proposal.offer.id !== request.offerId) {
    return { ok: false, reason: "stock_changed", request, status };
  }
  const day = n(((reserve.guardianCycle || {}).day) || 1) || 1;
  const settled = settleAutoExchange(reserve, proposal, partner, {
    day,
    createdAt: stamp,
    source: "league"
  });
  if (!settled.ok) return { ok: false, reason: settled.reason || "settle", request, status };
  consumeSandboxExchangeIcon(reserve, stamp);
  const state = status.state;
  request.status = realPartner ? "accepted" : "fallback";
  request.partnerKind = realPartner ? "player" : "npc";
  request.resolvedAt = stamp;
  request.resolution = realPartner ? "friend_confirmed" : "npc_fallback";
  state.request = request;
  state.history = (state.history || []).concat({
    type: "settlement",
    status: request.status,
    id: request.id,
    friendId: request.friendId,
    friendName: request.friendName,
    partnerKind: request.partnerKind,
    createdAt: request.createdAt,
    resolvedAt: stamp,
    resolution: request.resolution
  }).slice(-24);
  state.incoming = {
    id: settled.tradeId,
    kind: "exchange",
    status: "sealed",
    friendId: request.friendId,
    friendName: realPartner ? request.friendName : `${LOCAL_ALLY.name}（巡护员）`,
    partnerKind: realPartner ? "player" : "npc",
    itemId: proposal.want.id,
    itemLabel: proposal.want.label,
    offerId: proposal.offer.id,
    offerLabel: proposal.offer.label,
    chapter: state.chapter,
    metric: "",
    reason: realPartner
      ? `${request.friendName}确认了这次交换。`
      : `好友暂未回应，${LOCAL_ALLY.name}先代为完成这次交换。`,
    createdAt: stamp,
    openedAt: 0,
    usedAt: 0,
    source: "league"
  };
  state.used = false;
  reserve.friendAid = state;
  return {
    ok: true,
    fallback: !realPartner,
    accepted: !!realPartner,
    proposal,
    partner: settled.partner,
    parcel: state.incoming,
    summary: settled.summary,
    status: friendAidStatus(reserve, stamp)
  };
}
function openFriendAidParcel(reserve = {}, now = Date.now()) {
  const status = friendAidStatus(reserve, now);
  const parcel = status.incoming;
  if (!parcel || parcel.status !== "sealed") return { ok: false, reason: parcel ? parcel.status : "missing", status };
  parcel.status = "opened";
  parcel.openedAt = Number(now) || Date.now();
  reserve.friendAid = status.state;
  return { ok: true, parcel, letter: parcelLetter(parcel), status: friendAidStatus(reserve, now) };
}
function parcelLetter(parcel = {}) {
  const name = parcel.friendName || LOCAL_ALLY.name;
  const got = parcel.itemLabel || "交换素材";
  const gave = parcel.offerLabel || "你拿出的素材";
  if (parcel.kind === "exchange" || parcel.offerLabel) {
    return {
      title: `收到：${got}已到账`,
      kicker: "交换结果",
      body: `${name}完成了这次交换。\n\n你发出的求援是：用${gave}换${got}。\n系统已自动匹配${parcel.partnerKind === "npc" ? "巡护员" : "真实玩家"}，${got}已经进入生存库存。\n\n可在生存频道的收件箱查看结果，发件箱查看你发出的需求。`
    };
  }
  const metricLabel = METRIC_LABELS[parcel.metric] || parcel.metric || "关键数据";
  const item = parcel.itemLabel || "求援包裹";
  return {
    title: `${name}的求援包裹`,
    kicker: "拆包信",
    body: `${name}写来：\n\n你在沙盘上求援之后，我把${item}封进布包送过去。\n它帮不上整章过关，但特别任务里如果缺一口气，可以拿来补一截${metricLabel}。\n\n拆开后先收着。用不用，等特别任务自己决定。`
  };
}
function applyFriendAidOnSpecial(reserve = {}, now = Date.now()) {
  const status = friendAidStatus(reserve, now);
  if (status.used) return { ok: false, reason: "used", status };
  const parcel = status.incoming;
  if (!parcel || parcel.kind === "exchange" || !parcel.metric) return { ok: false, reason: "exchange", status };
  if (parcel.status !== "opened") return { ok: false, reason: parcel ? "sealed" : "missing", status };
  const def = chapterSpecialDef(status.chapter);
  const metric = def.metrics.includes(parcel.metric) ? parcel.metric : def.metrics[0];
  const amount = aidAmount(def, metric);
  const change = applySpecialMetric(reserve, metric, amount);
  const completedBefore = !!(reserve.chapterSpecial && reserve.chapterSpecial.completed);
  parcel.status = "used";
  parcel.usedAt = Number(now) || Date.now();
  status.state.used = true;
  status.state.incoming = parcel;
  reserve.friendAid = status.state;
  const completedAfter = !!(reserve.chapterSpecial && reserve.chapterSpecial.completed);
  return {
    ok: true,
    parcel,
    metric,
    amount,
    change,
    summary: changeSummary([change]),
    specialCompleted: completedAfter,
    gatedSpecial: completedBefore !== completedAfter,
    status: friendAidStatus(reserve, now)
  };
}
function friendAidMarkers(reserve = {}, now = Date.now()) {
  const status = friendAidStatus(reserve, now);
  if (status.canOpen && status.incoming) {
    const got = status.incoming.itemLabel || "交换素材";
    const name = status.incoming.friendName || "对方";
    return [{
      id: status.incoming.id,
      type: "friendAidParcel",
      kind: "friendAid",
      regionId: "center",
      title: `收到：${got}已到账`,
      label: "交换结果",
      impact: `${name}已完成交换，点开查看拿出与换回的物资。`,
      recommendAction: "openFriendAid",
      recommendLabel: "查看结果",
      intensity: 2,
      focused: false,
      visualKind: "friend-aid"
    }];
  }
  if (status.waitingResponse && status.request) {
    const request = status.request;
    const ready = status.fallbackReady;
    return [{
      id: request.id,
      type: "friendAidRequest",
      kind: "friendAid",
      regionId: request.regionId || "meadow",
      title: ready ? `好友未回应 · 可由${LOCAL_ALLY.name}接手` : `等待${request.friendName || "好友"}确认`,
      label: ready ? "转巡护员接手" : "等待好友确认",
      impact: ready
        ? "好友没有回应也不会卡住，点击后由巡护员完成并放入收件箱。"
        : "请求已发出。对方确认后会进入收件箱；24小时后可转由巡护员接手。",
      recommendAction: "pendingFriendAid",
      recommendLabel: ready ? "转巡护员接手" : "查看请求",
      intensity: ready ? 2 : 1,
      focused: false,
      visualKind: "friend-aid"
    }];
  }
  if (status.canRequest && status.proposal && sandboxExchangeIconReady(reserve, now)) {
    const offer = status.proposal.offer.label;
    const want = status.proposal.want.label;
    return [{
      id: (status.request && status.request.id) || `aid_req_${status.chapter}`,
      type: "friendAidRequest",
      kind: "friendAid",
      regionId: (status.request && status.request.regionId) || "meadow",
      title: `求援：用${offer}换${want}`,
      label: "发出交换",
      impact: `系统按你现有的${offer}和缺少的${want}自动发出需求。`,
      recommendAction: "requestFriendAid",
      recommendLabel: "发出需求",
      intensity: 1,
      focused: false,
      visualKind: "friend-aid"
    }];
  }
  return [];
}
module.exports = {
  AID_FRACTION,
  LOCAL_ALLY,
  NPC_PARTNERS,
  namedAlly,
  matchExchangePartner,
  aidAmount,
  FRIEND_AID_FALLBACK_MS,
  normalizeFriendAid,
  ensureFriendAid,
  friendAidStatus,
  sendFriendAidRequest,
  openFriendAidParcel,
  parcelLetter,
  applyFriendAidOnSpecial,
  friendAidMarkers,
  friendAidRequestReadiness,
  settlePendingFriendAid
};
