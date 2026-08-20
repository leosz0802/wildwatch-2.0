const { normalizeLifeMemory } = require("./emotionSystem");

const SHARE_IMAGES = {
  warm: "assets/art/share/share-warm.jpg",
  rescue: "assets/art/share/share-rescue.jpg",
  rare: "assets/art/share/share-rare.jpg"
};

const SHARE_EVENT_TYPES = new Set(["rare", "injury", "departure", "return", "birth", "death", "strategic_permanent"]);

function clean(value, max = 48) {
  return String(value || "").replace(/[\r\n&=?#]/g, " ").trim().slice(0, max);
}

function shareMoment(world, event = null, dailyLetter = null) {
  const day = (world && world.day) || 1;
  const forestRemembers = !!((((world || {}).collection || {}).worldFlags || {}).forest_remembers);
  const memory = normalizeLifeMemory(world || {});
  let source = event && SHARE_EVENT_TYPES.has(event.type) ? event : null;
  if (!source) {
    source = memory.memories.slice().reverse().find((item) => SHARE_EVENT_TYPES.has(item.type) && day - (item.day || day) <= 3) || null;
  }
  if (!source) {
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
  const individualId = clean((source && (source.individualId || (source.individual || {}).id)) || "forest", 36);
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
  const query = options.query || options || {};
  if (query.share !== "guardian") return null;
  const shareId = clean(query.sid, 64).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!shareId) return null;
  return {
    shareId,
    kind: clean(query.kind || "daily", 16),
    type: clean(query.type || "daily", 24),
    name: clean(query.name || "森林居民", 16),
    species: clean(query.species || "动物", 12),
    day: Math.max(1, Math.min(99999, Math.round(Number(query.day) || 1)))
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

function recordShareSent(state, payload) {
  if (!state || !payload) return state;
  state.ui = Object.assign({}, state.ui || {});
  state.ui.shareStats = Object.assign({}, state.ui.shareStats || {}, { sent: ((state.ui.shareStats || {}).sent || 0) + 1 });
  const record = { direction: "sent", shareId: payload.shareId, day: (state.world && state.world.day) || 1, name: payload.name, species: payload.species, kind: payload.kind };
  state.world.shareHistory = ((state.world.shareHistory || []).concat(record)).slice(-20);
  return state;
}

module.exports = {
  SHARE_IMAGES,
  shareMoment,
  sharePayload,
  parseShareInvite,
  hasAssistedShare,
  applyShareAssistance,
  recordShareSent
};
