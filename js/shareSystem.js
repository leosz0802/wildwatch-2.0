const { normalizeLifeMemory } = require("./emotionSystem");
const { applyChapterVisitorDelta, chapterVisitorTotal } = require("./chapterTargets");
const { SPECIES_DB, speciesPopulationGroup } = require("./animalWorld");
const { livingAnimalTotal, chapterCaptiveSpeciesSet } = require("./chapterRescueSystem");
const { recordIncrease } = require("./animalSourceLedger");

// Keep share artwork in the uploaded game package. WeChat can render a
// package-local image immediately, while a remote-only URL can leave the card
// with a blank placeholder when the download domain is unavailable.
const SHARE_IMAGES = {
  warm: "assets/art/share/share-warm.jpg",
  rescue: "assets/art/share/share-rescue.jpg",
  rare: "assets/art/share/share-rare.jpg"
};

const SHARE_EVENT_TYPES = new Set(["rare", "injury", "departure", "return", "birth", "death", "strategic_permanent"]);

function clean(value, max = 48) {
  return String(value || "").replace(/[\r\n&=?#]/g, " ").trim().slice(0, max);
}

function decodeShareValue(value) {
  let decoded = String(value == null ? "" : value).replace(/\+/g, " ");
  // Launch options differ between DevTools, QR preview and a real share entry:
  // some provide decoded values, some keep one layer, and old forwarded links
  // may contain two layers. Decode only while a valid percent escape remains.
  for (let index = 0; index < 2 && /%[0-9a-fA-F]{2}/.test(decoded); index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch (error) {
      break;
    }
  }
  return decoded;
}

function normalizeShareQuery(options = {}) {
  const source = options && Object.prototype.hasOwnProperty.call(options, "query") ? options.query : options;
  if (!source) return {};
  if (typeof source !== "string") return source;
  return source.split("&").reduce((result, part) => {
    const separator = part.indexOf("=");
    const key = separator >= 0 ? part.slice(0, separator) : part;
    const value = separator >= 0 ? part.slice(separator + 1) : "";
    if (key) result[decodeShareValue(key)] = decodeShareValue(value);
    return result;
  }, {});
}

function shareMoment(world, event = null, dailyLetter = null) {
  const day = (world && world.day) || 1;
  const forceDaily = !!(dailyLetter && dailyLetter.forceDaily);
  const forestRemembers = !!((((world || {}).collection || {}).worldFlags || {}).forest_remembers);
  const memory = normalizeLifeMemory(world || {});
  let source = !forceDaily && event && SHARE_EVENT_TYPES.has(event.type) ? event : null;
  if (!source && !forceDaily) {
    source = memory.memories.slice().reverse().find((item) => SHARE_EVENT_TYPES.has(item.type) && day - (item.day || day) <= 3) || null;
  }
  if (!source && !forceDaily) {
    const urgent = memory.individuals
      .filter((item) => item.status === "departed" || (item.status === "active" && item.health < 46))
      .sort((a, b) => (a.health || 100) - (b.health || 100))[0];
    if (urgent) {
      source = {
        type: urgent.status === "departed" ? "departure" : "injury",
        day,
        individualId: urgent.id,
        name: urgent.name,
        speciesId: urgent.speciesId,
        species: urgent.species,
        title: urgent.status === "departed" ? `${urgent.name}还没有回来` : `${urgent.name}需要休息`,
        body: urgent.status === "departed" ? "它离开了保护区，但旧路线仍然保留着回家的气味。" : `它的健康降到 ${urgent.health}/${urgent.healthCap || 100}，保护区正在等下一次正确行动。`
      };
    }
  }
  const individualId = clean((source && (source.individualId || (source.individual || {}).id)) || (dailyLetter && (dailyLetter.id || (dailyLetter.animal || {}).id)) || "forest", 36);
  const individual = memory.individuals.find((item) => item.id === individualId) || (source && source.individual) || null;
  const name = clean((source && source.name) || (individual && individual.name) || (dailyLetter && dailyLetter.animalName) || "森林居民", 16);
  const species = clean((source && source.species) || (individual && individual.species) || (dailyLetter && dailyLetter.animal && dailyLetter.animal.species) || "动物", 12);
  const type = (source && source.type) || "daily";
  const quote = clean((dailyLetter && dailyLetter.quote) || "你做过的每一次守护，森林都记得。", 72);
  const body = clean((source && source.body) || quote, 96);
  const status = individual ? individual.status : "active";
  const moment = { type, day: (source && source.day) || day, individualId, name, species, body, status };
  if (forestRemembers && !source) {
    return Object.assign(moment, {
      kind: "collection_memory",
      label: "森林记得你",
      title: "我收齐了森林写给守护者的五件纪念",
      text: `第${day}日，第一张照片、砾灰的项圈牌、守护者回信、第100日压花页和动物名字册终于放在一起。这里没有数值奖励，只有森林真的记得我来过。`,
      imageUrl: SHARE_IMAGES.warm,
      callToAction: "来看看森林留下的纪念"
    });
  }
  if (type === "rare") {
    return Object.assign(moment, {
      kind: "rare",
      label: "罕见时刻",
      title: `我保护的森林里，${name}终于出现了`,
      text: `第${moment.day}日，${name}第一次走进保护区。它不是抽到的奖励，而是安全和生态一起变好后才愿意现身。来替我见证这一刻。`,
      imageUrl: SHARE_IMAGES.rare,
      callToAction: "来见证它第一次出现"
    });
  }
  if (["injury", "departure"].includes(type) || (type === "strategic_permanent" && ["departed", "dead"].includes(status))) {
    const departed = type === "departure" || status === "departed";
    const dead = status === "dead" || type === "death";
    return Object.assign(moment, {
      kind: "rescue",
      label: dead ? "永久记忆" : departed ? "等待归来" : "需要守护",
      title: dead ? `我把${name}的名字留在了保护区` : departed ? `${name}离开了，我还在为它留路` : `${name}受伤了，它还在等我回去`,
      text: dead
        ? `第${moment.day}日，${name}走完了它的一生。它不会从保护区记忆里消失。愿意来替它留下一枚守护印记吗？`
        : departed
          ? `第${moment.day}日，${name}离开了保护区。我没有把它当作“迁移-1”，还在守着那条回来的路。愿意替它留一枚守护印记吗？`
          : `第${moment.day}日，${name}的状态变差了。它不是一条数字，而是我认识的朋友。愿意来替它守一段路吗？`,
      imageUrl: SHARE_IMAGES.rescue,
      callToAction: dead ? "为它留下守护印记" : "来替它守一段路"
    });
  }
  if (type === "death") {
    return Object.assign(moment, {
      kind: "memory",
      label: "生命纪念",
      title: `我把${name}的名字留在了保护区`,
      text: `第${moment.day}日，${name}走完了它的一生。陪伴没有失败，它的名字和共同经历会一直留在保护区记忆里。`,
      imageUrl: SHARE_IMAGES.warm,
      callToAction: "为它留下守护印记"
    });
  }
  if (type === "return") {
    return Object.assign(moment, {
      kind: "return",
      label: "朋友归来",
      title: `${name}回来了，它还记得回家的路`,
      text: `第${moment.day}日，离开的${name}重新沿着旧气味回到保护区。归来不是“迁入+1”，是一个认识你的朋友回家了。`,
      imageUrl: SHARE_IMAGES.warm,
      callToAction: "来看看它回家的这一天"
    });
  }
  if (type === "birth") {
    return Object.assign(moment, {
      kind: "birth",
      label: "新生命",
      title: `${name}在我的保护区出生了`,
      text: `第${moment.day}日，${name}第一次睁眼看见这片森林。只有环境足够安全，生命才会把明天交给这里。`,
      imageUrl: SHARE_IMAGES.warm,
      callToAction: "来认识这位新朋友"
    });
  }
  return Object.assign(moment, {
    kind: "daily",
    label: "森林来信",
    title: `${name}今天给我的保护区写了封信`,
    text: `第${day}日，${name}说：“${quote}” 这里的动物会记住每一次巡护，也会在你离开后等你回来。`,
    imageUrl: SHARE_IMAGES.warm,
    callToAction: "来听听它今天想说什么"
  });
}

function sharePayload(world, event = null, dailyLetter = null) {
  const moment = shareMoment(world, event, dailyLetter);
  const serial = clean((((world || {}).reserve || {}).base || {}).serial || "0000", 8);
  const shareId = `${serial}_${moment.day}_${moment.type}_${moment.individualId}`.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  const params = {
    share: "guardian",
    sid: shareId,
    kind: moment.kind,
    type: moment.type,
    name: moment.name,
    species: moment.species,
    day: `${moment.day}`
  };
  const query = Object.keys(params).map((key) => `${key}=${encodeURIComponent(params[key])}`).join("&");
  return Object.assign({}, moment, { shareId, query });
}

function parseShareInvite(options = {}) {
  const query = normalizeShareQuery(options);
  if (decodeShareValue(query.share) !== "guardian") return null;
  const shareId = clean(decodeShareValue(query.sid), 64).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!shareId) return null;
  return {
    shareId,
    kind: clean(decodeShareValue(query.kind || "daily"), 16),
    type: clean(decodeShareValue(query.type || "daily"), 24),
    name: clean(decodeShareValue(query.name || "森林居民"), 16),
    species: clean(decodeShareValue(query.species || "动物"), 12),
    day: Math.max(1, Math.min(99999, Math.round(Number(decodeShareValue(query.day)) || 1)))
  };
}

function hasAssistedShare(state, shareId) {
  return ((((state || {}).ui || {}).shareAssistances) || []).some((item) => item.shareId === shareId);
}

function applyShareAssistance(state, invite) {
  if (!state || !state.character || !invite || !invite.shareId) return { applied: false, reason: "not_ready" };
  state.ui = Object.assign({}, state.ui || {});
  state.ui.shareAssistances = (state.ui.shareAssistances || []).slice(-39);
  if (hasAssistedShare(state, invite.shareId)) return { applied: false, reason: "duplicate", invite };
  const reserve = state.world.reserve || {};
  const before = { reputation: reserve.reputation || 0, trust: 0 };
  reserve.reputation = Math.min(100, before.reputation + 1);
  let helpedAnimal = null;
  state.world.knownCharacters = (state.world.knownCharacters || []).map((animal) => {
    if (helpedAnimal || animal.species !== invite.species) return animal;
    const relation = Object.assign({}, animal.relation || {});
    before.trust = relation.trust || 40;
    relation.trust = Math.min(100, before.trust + 1);
    helpedAnimal = animal.name || animal.shortName || invite.name;
    return Object.assign({}, animal, { relation, memory: (animal.memory || []).concat(`第${state.world.day || 1}日：一位好友为${invite.name}留下了守护接力。`).slice(-5) });
  });
  const record = { shareId: invite.shareId, day: state.world.day || 1, sourceDay: invite.day, name: invite.name, species: invite.species, kind: invite.kind };
  state.ui.shareAssistances.push(record);
  state.ui.shareStats = Object.assign({}, state.ui.shareStats || {}, { received: ((state.ui.shareStats || {}).received || 0) + 1 });
  state.world.shareHistory = ((state.world.shareHistory || []).concat(Object.assign({ direction: "received" }, record))).slice(-20);
  const lifeMemory = normalizeLifeMemory(state.world);
  lifeMemory.memories.push({
    id: `memory_share_${invite.shareId}`,
    day: state.world.day || 1,
    type: "friend_assist",
    name: invite.name,
    species: invite.species,
    title: `好友为${invite.name}留下守护接力`,
    body: `这次接力让共护关系提升 ${reserve.reputation - before.reputation}${helpedAnimal ? `，也让${helpedAnimal}更愿意相信人类` : ""}。`,
    tone: "warm"
  });
  lifeMemory.memories = lifeMemory.memories.slice(-240);
  state.world.lifeMemory = lifeMemory;
  return {
    applied: true,
    invite,
    helpedAnimal,
    before,
    after: { reputation: reserve.reputation, trust: helpedAnimal ? before.trust + 1 : 0 }
  };
}

const SHARE_REWARD_LIMIT_PER_TYPE = 2;
const SHARE_REWARD_LIMIT_PER_CHAPTER = SHARE_REWARD_LIMIT_PER_TYPE * 2;
const SHARE_REWARD_RATES = [2, 3];

function wholeCount(value, fallback = 0) {
  return Math.max(0, Math.round(Number(value) || fallback));
}

function normalizeChapterShareCounts(saved) {
  if (saved && typeof saved === "object" && !Array.isArray(saved)) {
    return {
      visitors: Math.min(SHARE_REWARD_LIMIT_PER_TYPE, wholeCount(saved.visitors)),
      animals: Math.min(SHARE_REWARD_LIMIT_PER_TYPE, wholeCount(saved.animals))
    };
  }
  const legacy = Math.min(SHARE_REWARD_LIMIT_PER_CHAPTER, wholeCount(saved));
  return {
    visitors: Math.min(SHARE_REWARD_LIMIT_PER_TYPE, legacy),
    animals: Math.min(SHARE_REWARD_LIMIT_PER_TYPE, legacy)
  };
}

function rewardState(input, payload = {}) {
  const state = input && input.world ? input : null;
  const reserve = state ? ((state.world || {}).reserve || {}) : (input || {});
  const chapter = Math.max(1, Math.round(Number((reserve.progression || {}).stage || (reserve.progression || {}).displayChapter || 1)));
  const chapterCounts = state && state.ui && state.ui.shareRewardChapters || {};
  const counts = normalizeChapterShareCounts(chapterCounts[chapter]);
  const rewardType = isAnimalShare(payload) ? "animals" : "visitors";
  const used = counts[rewardType];
  return {
    state,
    reserve,
    chapter,
    rewardType,
    counts,
    used,
    remaining: Math.max(0, SHARE_REWARD_LIMIT_PER_TYPE - used),
    limit: SHARE_REWARD_LIMIT_PER_TYPE,
    totalUsed: counts.visitors + counts.animals,
    totalRemaining: Math.max(0, SHARE_REWARD_LIMIT_PER_CHAPTER - counts.visitors - counts.animals)
  };
}

function animalTotal(reserve = {}) {
  return Math.max(0, Math.round(Number(livingAnimalTotal(reserve)) || 0));
}

function isAnimalShare(payload = {}) {
  // 奖励类型只跟发起入口走：游客入口永远加游客，动物入口永远加动物。
  // 邮件主动分享先随机盖章 rewardType，再走这里；不能靠 species/kind 猜测。
  if (payload.rewardType === "animals" || payload.sourceKind === "animal") return true;
  if (payload.rewardType === "visitors" || payload.sourceKind === "visitor") return false;
  return ["rare", "rescue", "return", "birth", "death", "injury", "departure", "memory"].includes(payload.kind);
}

function pickActiveShareRewardType(input, random = Math.random) {
  const animal = shareRewardPreview(input, { rewardType: "animals", sourceKind: "animal" });
  const visitor = shareRewardPreview(input, { rewardType: "visitors", sourceKind: "visitor" });
  const options = [];
  if (animal.eligible) options.push("animals");
  if (visitor.eligible) options.push("visitors");
  if (!options.length) return visitor.remaining >= animal.remaining ? "visitors" : "animals";
  if (options.length === 1) return options[0];
  if (animal.remaining !== visitor.remaining) {
    return animal.remaining > visitor.remaining ? "animals" : "visitors";
  }
  return options[Number(random()) < 0.5 ? 0 : 1];
}

function shareRewardPreview(input, payload = {}) {
  const context = rewardState(input, payload);
  const rewardType = context.rewardType;
  const base = rewardType === "animals" ? animalTotal(context.reserve) : chapterVisitorTotal(context.reserve);
  const percent = SHARE_REWARD_RATES[Math.min(context.used, SHARE_REWARD_RATES.length - 1)];
  const amount = Math.max(1, Math.round(base * percent / 100));
  const unit = rewardType === "animals" ? "只" : "人";
  const otherType = rewardType === "animals" ? "visitors" : "animals";
  return {
    rewardType,
    base,
    percent,
    amount,
    unit,
    label: rewardType === "animals" ? "动物" : "游客",
    otherLabel: otherType === "animals" ? "动物" : "游客",
    chapter: context.chapter,
    used: context.used,
    remaining: context.remaining,
    eligible: context.remaining > 0,
    limit: SHARE_REWARD_LIMIT_PER_TYPE,
    totalUsed: context.totalUsed,
    totalRemaining: context.totalRemaining,
    totalLimit: SHARE_REWARD_LIMIT_PER_CHAPTER,
    otherRemaining: Math.max(0, SHARE_REWARD_LIMIT_PER_TYPE - context.counts[otherType])
  };
}

function addAnimalShareReward(reserve, amount) {
  const ecology = reserve.ecology || (reserve.ecology = {});
  const captive = chapterCaptiveSpeciesSet(reserve);
  ["predators", "herbivores", "birds"].forEach((group) => { ecology[group] = ecology[group] || {}; });
  const candidates = Object.keys(SPECIES_DB).map((id) => {
    const species = SPECIES_DB[id] || {};
    const group = speciesPopulationGroup(id);
    const current = Math.max(0, Math.round(Number(ecology[group][id]) || 0));
    const max = Math.max(current, Math.round(Number(species.maxPop) || current + amount));
    return { id, group, current, max, unlocked: !(species.unlockChapter && species.unlockChapter > Number((reserve.progression || {}).stage || 1)) };
  }).filter((item) => item.unlocked && !captive.has(item.id) && item.current > 0 && item.current < item.max)
    .sort((a, b) => (b.current - a.current) || a.id.localeCompare(b.id));
  if (!candidates.length) return { added: 0, before: animalTotal(reserve), after: animalTotal(reserve) };
  const target = candidates[0];
  const before = animalTotal(reserve);
  const added = Math.min(Math.max(0, Math.round(Number(amount) || 0)), target.max - target.current);
  ecology[target.group][target.id] = target.current + added;
  if (added > 0) recordIncrease(reserve, "shared", added);
  return { added, before, after: animalTotal(reserve), speciesId: target.id };
}

function applyShareReward(state, payload = {}) {
  if (!state || !state.world || !payload) return { applied: false, reason: "not_ready" };
  state.ui = Object.assign({}, state.ui || {});
  const now = Date.now();
  const context = rewardState(state, payload);
  const rewards = Array.isArray(state.ui.shareRewards) ? state.ui.shareRewards : [];
  const duplicate = payload.shareId && rewards.find((item) => item.shareId === payload.shareId && now - (Number(item.recordedAt) || 0) < 10000);
  if (duplicate) return { applied: false, reason: "duplicate", reward: duplicate };
  if (context.used >= SHARE_REWARD_LIMIT_PER_TYPE) return { applied: false, reason: "chapter_limit", reward: null, preview: shareRewardPreview(state, payload) };
  const preview = shareRewardPreview(state, payload);
  const reserve = context.reserve;
  const result = preview.rewardType === "visitors"
    ? applyChapterVisitorDelta(reserve, preview.amount, "share")
    : addAnimalShareReward(reserve, preview.amount);
  const appliedAmount = preview.rewardType === "visitors" ? Math.max(0, Number(result.applied) || 0) : Math.max(0, Number(result.added) || 0);
  if (appliedAmount <= 0) return { applied: false, reason: "capacity", reward: null, preview };
  const nextCounts = Object.assign({}, context.counts, {
    [preview.rewardType]: context.used + 1
  });
  state.ui.shareRewardChapters = Object.assign({}, state.ui.shareRewardChapters || {}, {
    [context.chapter]: nextCounts
  });
  const reward = Object.assign({}, preview, {
    amount: appliedAmount,
    recordedAt: now,
    shareId: payload.shareId,
    before: result.before,
    after: result.after
  });
  state.ui.shareRewards = rewards.concat(reward).slice(-50);
  state.ui.shareStats = Object.assign({}, state.ui.shareStats || {}, {
    rewardCount: Math.max(0, Math.round(Number((state.ui.shareStats || {}).rewardCount) || 0)) + 1,
    lastReward: reward
  });
  return { applied: true, reward };
}

function recordShareSent(state, payload) {
  if (!state || !payload) return { applied: false, reason: "not_ready" };
  state.ui = Object.assign({}, state.ui || {});
  const history = (state.world && state.world.shareHistory) || [];
  const now = Date.now();
  const duplicate = !!payload.shareId && history.some((item) => item.direction === "sent" && item.shareId === payload.shareId && now - (Number(item.recordedAt) || 0) < 10000);
  const shareStats = state.ui.shareStats || {};
  state.ui.shareStats = Object.assign({}, shareStats, { sent: Math.max(0, Math.round(Number(shareStats.sent) || 0)) + (duplicate ? 0 : 1) });
  const rewardResult = applyShareReward(state, payload);
  const record = { direction: "sent", shareId: payload.shareId, day: (state.world && state.world.day) || 1, name: payload.name, species: payload.species, kind: payload.kind, recordedAt: now, reward: rewardResult.reward || null };
  state.world.shareHistory = ((state.world.shareHistory || []).concat(record)).slice(-20);
  return Object.assign({ applied: true }, rewardResult);
}

module.exports = {
  SHARE_IMAGES,
  decodeShareValue,
  normalizeShareQuery,
  shareMoment,
  sharePayload,
  parseShareInvite,
  hasAssistedShare,
  applyShareAssistance,
  recordShareSent,
  shareRewardPreview,
  pickActiveShareRewardType,
  applyShareReward,
  SHARE_REWARD_LIMIT_PER_TYPE,
  SHARE_REWARD_LIMIT_PER_CHAPTER
};
