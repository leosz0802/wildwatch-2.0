const { SPECIES_DB, getUnlockedSpecies, speciesPopulation } = require("./animalWorld");
const { applyNamedSpeciesBirth } = require("./animalSourceLedger");
const { seasonLifeModifiers } = require("./seasonSystem");
const { relationshipModifierFor, lifeCycleModifiers } = require("./guardianPromises");
const DAY_MS = 24 * 60 * 60 * 1000;
const RARE_MOMENTS = [
  { id: "white_deer", speciesId: "deer", name: "月白", title: "白鹿踏进晨雾", level: 2, safety: 70, ecology: 64, rarity: "白鹿" },
  { id: "black_wolf", speciesId: "wolf", name: "玄夜", title: "黑狼站上旧界碑", level: 3, safety: 74, ecology: 70, rarity: "黑狼" },
  { id: "gold_elephant", speciesId: "elephant", name: "鎏光", title: "金象带着幼象归来", level: 4, safety: 82, ecology: 78, rarity: "金象" }
];
function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}
function hash(text) {
  let value = 2166136261;
  String(text || "").split("").forEach((char) => {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  });
  return Math.abs(value >>> 0);
}
function ecologyScore(reserve) {
  const ecology = (reserve && reserve.ecology) || {};
  if (typeof reserve.ecologyScore === "number") return reserve.ecologyScore;
  return Math.round(((reserve.stability || 50) * 0.42) + ((ecology.water || 50) * 0.29) + ((ecology.grass || 50) * 0.21) + ((100 - (ecology.disease || 0)) * 0.08));
}
function lifeStage(individual) {
  const ratio = (individual.ageDays || 0) / Math.max(1, individual.lifespanDays || 120);
  if (ratio < 0.18) return "幼年";
  if (ratio >= 0.78) return "老年";
  return "成年";
}
function displayStatus(individual) {
  if (individual.status === "independent") return "重归野外";
  if (individual.status === "departed") return "离开";
  if (individual.status === "dead") return "已故";
  if (individual.health < 46) return "受伤";
  if (individual.rarity) return individual.rarity;
  return lifeStage(individual) === "老年" ? "年老" : "健康";
}
function relationshipAxes(individual = {}) {
  const security = clamp(individual.security == null ? (individual.bond == null ? 40 : individual.bond) : individual.security);
  const wildness = clamp(individual.wildness == null ? 76 : individual.wildness);
  return { security, wildness };
}
function baseIndividual(species, day, index = 0) {
  const seed = hash(`${species.id}|${index}`);
  const lifespanDays = 105 + (species.tier || 1) * 24 + seed % 50;
  const ageDays = index === 0 ? Math.round(lifespanDays * (0.22 + (seed % 34) / 100)) : 0;
  const representative = species.representative || {};
  return {
    id: `friend_${species.id}_${index + 1}`,
    speciesId: species.id,
    species: species.name,
    name: index === 0 ? (representative.name || `${species.name}朋友`) : index === 1 ? `${representative.name || species.name}的幼崽` : `${representative.name || species.name}·${index + 1}代`,
    bornDay: Math.max(1, day - ageDays),
    ageDays,
    lifespanDays,
    lifeStage: "成年",
    health: 88 + seed % 10,
    healthCap: 100,
    status: "active",
    bond: 40,
    security: 40,
    wildness: 76 + seed % 9,
    strategicBond: 0,
    permanentFlags: [],
    strategicHistory: [],
    rarity: "",
    lastEventDay: day,
    oldNoted: false
  };
}
function normalizeLifeMemory(world, now = Date.now()) {
  const reserve = (world && world.reserve) || {};
  const progression = reserve.progression || {};
  const day = (world && world.day) || 1;
  const saved = (world && world.lifeMemory) || {};
  const state = {
    version: 3,
    individuals: (saved.individuals || []).map((item) => Object.assign({}, item)),
    memories: (saved.memories || []).slice(-240),
    permanentConsequences: (saved.permanentConsequences || []).slice(-80),
    rareMoments: (saved.rareMoments || []).slice(),
    guardianLetters: (saved.guardianLetters || []).slice(-12),
    animalLetters: (saved.animalLetters || []).slice(),
    animalLetterDateKey: saved.animalLetterDateKey || "",
    animalLetterPromptDateKey: saved.animalLetterPromptDateKey || "",
    lastSeenAt: saved.lastSeenAt || now,
    lastLetterKey: saved.lastLetterKey || ""
  };
  const existingIds = new Set(state.individuals.map((item) => item.id));
  const newlyMet = [];
  getUnlockedSpecies(progression.level || 1, progression.stage || progression.level || 1).forEach((species) => {
    if (!state.individuals.some((item) => item.speciesId === species.id)) {
      const individual = baseIndividual(species, day, 0);
      state.individuals.push(individual);
      if (!existingIds.has(individual.id)) newlyMet.push(individual);
    }
  });
  newlyMet.forEach((individual) => {
    const id = `memory_met_${individual.id}`;
    if (state.memories.some((item) => item.id === id)) return;
    state.memories.push({
      id,
      day,
      type: "met",
      individualId: individual.id,
      speciesId: individual.speciesId,
      name: individual.name,
      title: `第一次认识${individual.name}`,
      body: `${individual.name}没有立刻信任你。它只是把你的气味、脚步和停留的位置记了下来——一段关系从这里开始。`,
      tone: "warm"
    });
  });
  state.memories = state.memories.slice(-240);
  const npcBySpecies = {};
  ((world && world.knownCharacters) || []).forEach((animal) => { npcBySpecies[animal.species] = animal; });
  state.individuals = state.individuals.map((individual) => {
    const npc = npcBySpecies[individual.species];
    const relation = (npc && npc.relation) || {};
    const next = Object.assign({ health: 90, healthCap: 100, status: "active", bond: 40, security: null, wildness: 76, strategicBond: 0, permanentFlags: [], strategicHistory: [], lastEventDay: day }, individual);
    next.healthCap = clamp(next.healthCap == null ? 100 : next.healthCap, 55, 100);
    next.strategicBond = Math.max(-30, Math.min(30, Math.round(next.strategicBond || 0)));
    next.permanentFlags = (next.permanentFlags || []).slice(-8);
    next.strategicHistory = (next.strategicHistory || []).slice(-12);
    if (next.security == null) next.security = typeof relation.trust === "number" ? clamp(relation.trust + next.strategicBond) : clamp(next.bond);
    next.security = clamp(next.security);
    next.wildness = clamp(next.wildness == null ? 76 : next.wildness);
    next.bond = next.security;
    next.health = clamp(next.health, 0, next.healthCap);
    next.lifeStage = lifeStage(next);
    return next;
  });
  return state;
}
function memoryFor(event) {
  return {
    id: `memory_${event.id}`,
    day: event.day,
    type: event.type,
    individualId: event.individual && event.individual.id,
    speciesId: event.individual && event.individual.speciesId,
    name: event.individual && event.individual.name,
    title: event.title,
    body: event.body,
    tone: event.tone || "warm"
  };
}
function makeEvent(type, day, individual, title, body, tone = "warm") {
  return {
    id: `${type}_${day}_${individual.id}`,
    type,
    day,
    individual: Object.assign({}, individual),
    title,
    body,
    tone,
    isMajor: ["rare", "return", "death", "birth", "independence", "wild_visit"].includes(type)
  };
}
function relationshipShiftForAction(actionId, reserve = {}) {
  const shifts = {
    habitat: { security: 2, wildness: 3, reason: "修复栖息地让它更安心，也更能靠自己生活" },
    intervention: { security: 5, wildness: -6, reason: "直接救助换来安全感，也让它更依赖人的靠近" },
    antiPoacher: { security: 3, wildness: -2, reason: "强力巡护压低威胁，也带来短暂惊扰" },
    houndScout: { security: 2, wildness: 1, reason: "克制侦察让边界更可靠，没有替动物做选择" },
    exploreMaterials: { security: 2, wildness: 0, reason: "它主动带路，说明这段关系经受住了一次试探" },
    salvage: { security: 1, wildness: 1, reason: "合规回收没有侵入动物生活，森林记住了克制" }
  };
  const shift = Object.assign({ security: 0, wildness: 0, reason: "" }, shifts[actionId] || {});
  if (actionId === "antiPoacher" && (reserve.poacherPressure || 0) >= 65) shift.wildness -= 1;
  if (actionId === "habitat" && ((reserve.ecology || {}).water || 0) >= 65 && ((reserve.ecology || {}).grass || 0) >= 65) shift.wildness += 1;
  const promiseModifier = relationshipModifierFor(reserve, actionId);
  shift.security += promiseModifier.security || 0;
  shift.wildness += promiseModifier.wildness || 0;
  if (promiseModifier.reasons.length) shift.reason = `${shift.reason}；承诺“${promiseModifier.reasons.join("、")}”生效`;
  return shift;
}
function applyActionRelationshipShift(state, beforeWorld, afterWorld, context = {}) {
  const actionId = context.actionId || "";
  const reserve = (afterWorld && afterWorld.reserve) || {};
  const shift = relationshipShiftForAction(actionId, reserve);
  if (!shift.security && !shift.wildness) return null;
  const candidates = state.individuals.filter((item) => item.status === "active");
  if (!candidates.length) return null;
  if (actionId === "intervention") candidates.sort((a, b) => (a.health || 0) - (b.health || 0) || relationshipAxes(b).security - relationshipAxes(a).security);
  else if (actionId === "habitat") candidates.sort((a, b) => relationshipAxes(a).wildness - relationshipAxes(b).wildness || (a.health || 0) - (b.health || 0));
  else if (actionId === "exploreMaterials") candidates.sort((a, b) => relationshipAxes(b).security - relationshipAxes(a).security);
  else candidates.sort((a, b) => relationshipAxes(a).security - relationshipAxes(b).security);
  const selected = candidates.slice(0, Math.min(3, candidates.length));
  const day = (afterWorld && afterWorld.day) || 1;
  const individual = selected[hash(`${actionId}|${day}`) % selected.length];
  const before = relationshipAxes(individual);
  individual.security = clamp(before.security + shift.security);
  individual.wildness = clamp(before.wildness + shift.wildness);
  individual.bond = individual.security;
  const actual = { security: individual.security - before.security, wildness: individual.wildness - before.wildness };
  return {
    individualId: individual.id,
    name: individual.name,
    species: individual.species,
    actionId,
    before,
    after: relationshipAxes(individual),
    securityDelta: actual.security,
    wildnessDelta: actual.wildness,
    reason: shift.reason
  };
}
function advanceLifeMemory(beforeWorld, afterWorld, context = {}) {
  const reserve = (afterWorld && afterWorld.reserve) || {};
  const beforeReserve = (beforeWorld && beforeWorld.reserve) || {};
  const afterCycle = reserve.guardianCycle || {};
  const beforeCycle = beforeReserve.guardianCycle || {};
  const usesGuardianDay = Number.isFinite(Number(afterCycle.day)) && Number.isFinite(Number(beforeCycle.day));
  const day = usesGuardianDay ? Math.max(1, Number(afterCycle.day) || 1) : ((afterWorld && afterWorld.day) || 1);
  const beforeDay = usesGuardianDay ? Math.max(1, Number(beforeCycle.day) || 1) : ((beforeWorld && beforeWorld.day) || Math.max(1, day - 1));
  const elapsedDays = Math.max(0, Math.min(1, day - beforeDay));
  const safety = reserve.safety || 0;
  const ecology = ecologyScore(reserve);
  const disease = ((reserve.ecology || {}).disease) || 0;
  const migration = (reserve.migration || {}).delta || 0;
  const progression = reserve.progression || {};
  const level = progression.level || 1;
  const season = (afterWorld && afterWorld.season) || ((reserve.seasonState || {}).name) || "雨季";
  const seasonalLife = seasonLifeModifiers(season);
  const promiseLife = lifeCycleModifiers(reserve);
  const state = normalizeLifeMemory(Object.assign({}, afterWorld, { lifeMemory: (beforeWorld && beforeWorld.lifeMemory) || afterWorld.lifeMemory }));
  const events = [];
  const relationshipChange = applyActionRelationshipShift(state, beforeWorld, afterWorld, context);
  state.individuals = state.individuals.map((raw) => {
    const individual = Object.assign({}, raw);
    if (individual.status === "dead") return individual;
    individual.ageDays = (individual.ageDays || 0) + elapsedDays;
    individual.lifeStage = lifeStage(individual);
    const healthAtStart = individual.health || 0;
    const eventGap = day - (individual.lastEventDay || 0);
    const riskRoll = hash(`${individual.id}|${day}`) % 7;
    const axes = relationshipAxes(individual);
    if (usesGuardianDay && elapsedDays === 0) return individual;
    if (individual.status === "independent") {
      const visitDelay = Math.max(4, Math.min(14, 8 + promiseLife.wildVisitDelay));
      const readyForVisit = !individual.wildVisitNoted && day - (individual.independenceDay || day) >= visitDelay && season === "雨季" && safety >= 72 && ecology >= 70;
      if (readyForVisit) {
        individual.wildVisitNoted = true;
        individual.lastEventDay = day;
        events.push(makeEvent("wild_visit", day, individual, `${individual.name}带着幼崽经过旧水线`, "它认得你，却没有靠近救助站。", "joy"));
      }
      return individual;
    }
    if (individual.status === "departed") {
      if (eventGap >= 2 && day >= (individual.returnBlockedUntilDay || 0) && safety >= 68 && ecology >= 60 && migration >= 0) {
        individual.status = "active";
        individual.health = Math.max(64, individual.health || 60);
        individual.lastEventDay = day;
      events.push(makeEvent("return", day, individual, `${individual.name}回来了`, "它在边界确认巡护气味后，沿旧路回来了。", "joy"));
      }
      return individual;
    }
    const independenceWildness = Math.max(72, Math.min(92, 82 + promiseLife.independenceThreshold));
    const healthyDistance = individual.status === "active"
      && individual.lifeStage !== "幼年"
      && individual.health >= 76
      && axes.security >= 64
      && axes.wildness >= independenceWildness
      && safety >= 68
      && ecology >= 68
      && disease < 32
      && migration >= 0
      && eventGap >= 5;
    if (healthyDistance && (day + hash(individual.id)) % 7 === 0) {
      individual.status = "independent";
      individual.independenceDay = day;
      individual.lastEventDay = day;
      events.push(makeEvent("independence", day, individual, `${individual.name}不再需要保护站了`, "它已能独立取水、避险和迁徙。离开，是守护成功。", "resolve"));
      return individual;
    }
    if (individual.health < 46 && eventGap >= 2 && disease < 36 && safety >= 58) {
      individual.health = Math.min(78, individual.health + 24);
      individual.lastEventDay = day;
      events.push(makeEvent("recovery", day, individual, `${individual.name}重新站稳了`, `伤口正在恢复。它没有立刻跑远，只在看见巡护队时慢慢放下了警惕。`, "warm"));
    } else if (individual.health >= 46 && eventGap >= 3 && ((disease > seasonalLife.diseaseInjuryThreshold && riskRoll < seasonalLife.diseaseRiskFaces) || (safety < 38 && riskRoll <= 1))) {
      individual.health = Math.min(44, Math.max(24, individual.health - (disease > seasonalLife.diseaseInjuryThreshold ? 34 : 24)));
      individual.lastEventDay = day;
      events.push(makeEvent("injury", day, individual, `${individual.name}受伤了`, disease > 55 ? "湿草边缘出现病弱迹象。先控制疾病、稳定水草。" : "边界惊扰让它带伤退回核心区。", "sad"));
    }
    if (individual.status === "active" && eventGap >= 3 && safety < 32 && migration < 0 && riskRoll === 2) {
      individual.status = "departed";
      individual.lastEventDay = day;
      events.push(makeEvent("departure", day, individual, `${individual.name}离开了保护区`, "记忆簿保留它的名字。环境恢复后，它可能沿旧路归来。", "sad"));
      return individual;
    }
    if (!individual.oldNoted && individual.lifeStage === "老年") {
      individual.oldNoted = true;
      individual.lastEventDay = day;
      events.push(makeEvent("old", day, individual, `${individual.name}老了`, "它走得更慢，仍会停在熟悉的巡护线上。", "memory"));
    }
    if (individual.ageDays >= individual.lifespanDays || (healthAtStart <= 24 && eventGap >= 2)) {
      individual.status = "dead";
      individual.health = 0;
      individual.lastEventDay = day;
      events.push(makeEvent("death", day, individual, `${individual.name}走完了一生`, "它的名字留在保护区记忆里。", "memory"));
    }
    return individual;
  });
  getUnlockedSpecies(level, progression.stage || level).forEach((species) => {
    const friends = state.individuals.filter((item) => item.speciesId === species.id && item.status === "active");
    const allFriends = state.individuals.filter((item) => item.speciesId === species.id);
    const population = speciesPopulation(reserve, species.id);
    const healthyHabitat = safety >= 70 && ecology >= 68 && disease < seasonalLife.birthDiseaseLimit;
    if ((!usesGuardianDay || elapsedDays > 0) && friends.length < 2 && population >= Math.max(2, species.initialPop || 1) && healthyHabitat && (day + hash(species.id)) % seasonalLife.birthCadence === 0) {
      const newborn = baseIndividual(species, day, allFriends.length);
      newborn.lifeStage = "幼年";
      newborn.health = 96;
      newborn.security = Math.max(34, relationshipAxes(friends[0]).security - 8);
      newborn.wildness = Math.max(86, relationshipAxes(friends[0]).wildness + 2);
      newborn.bond = newborn.security;
      newborn.lastEventDay = day;
      applyNamedSpeciesBirth(reserve, species.id);
      state.individuals.push(newborn);
      events.push(makeEvent("birth", day, newborn, `${newborn.name}出生了`, `${friends[0].name}第一次把幼崽带到你巡过的路线上。保护区够安全，生命才会把明天交给这里。`, "joy"));
    }
  });
  const rare = RARE_MOMENTS.find((candidate) => {
    if (usesGuardianDay && elapsedDays === 0) return false;
    const discovered = state.rareMoments.some((item) => item.id === candidate.id);
    if (discovered || level < candidate.level || safety < candidate.safety || ecology < candidate.ecology) return false;
    const species = SPECIES_DB[candidate.speciesId];
    return !!(species && speciesPopulation(reserve, candidate.speciesId) > 0);
  });
  if (rare) {
    const species = SPECIES_DB[rare.speciesId];
    const individual = Object.assign(baseIndividual(species, day, 1), {
      id: `rare_${rare.id}`,
      name: rare.name,
      rarity: rare.rarity,
      health: 100,
      bond: 52,
      security: 52,
      wildness: 94,
      lastEventDay: day
    });
    state.individuals.push(individual);
    state.rareMoments.push({ id: rare.id, day, title: rare.title, individualId: individual.id });
    events.push(makeEvent("rare", day, individual, rare.title, `现身条件：安全 ${rare.safety}+ · 生态 ${rare.ecology}+。`, "surprise"));
  }
  state.individuals = state.individuals.map((individual) => {
    const axes = relationshipAxes(individual);
    return Object.assign({}, individual, {
      lifeStage: lifeStage(individual),
      health: clamp(individual.health, 0, individual.healthCap || 100),
      security: axes.security,
      wildness: axes.wildness,
      bond: axes.security
    });
  });
  state.memories = state.memories.concat(events.map(memoryFor)).slice(-240);
  state.lastSeenAt = Date.now();
  const priority = { independence: 10, wild_visit: 9, rare: 8, return: 7, birth: 6, death: 5, injury: 4, departure: 3, old: 2, recovery: 1 };
  const primaryEvent = events.slice().sort((a, b) => (priority[b.type] || 0) - (priority[a.type] || 0))[0] || null;
  return { state, events, primaryEvent, relationshipChange };
}
const STRATEGIC_SPECIES_THEMES = {
  water_access: ["deer", "antelope", "zebra", "mink", "hippo"],
  water_governance: ["deer", "antelope", "zebra", "mink", "hippo"],
  informant_or_blockade: ["deer", "crow", "wolf"],
  poacher_network: ["deer", "crow", "wolf", "rhino", "elephant"],
  disease_response: ["deer", "antelope", "zebra", "boar", "hare"],
  disease_corridor: ["deer", "antelope", "zebra", "boar"],
  rare_route: ["deer", "wolf", "elephant"],
  rare_guardians: ["deer", "wolf", "elephant"],
  community_boundary: ["antelope", "zebra", "elephant", "deer"],
  community_charter: ["antelope", "zebra", "elephant", "deer"],
  evidence_destination: ["crow", "deer", "wolf", "rhino"],
  reserve_funding_crisis: []
};
const DEPARTURE_FAILURE_CHOICES = new Set(["publish_route", "build_fence", "corridor_open", "rare_live", "charter_fence"]);
const DELAYED_RETURN_CHOICES = new Set(["strict_quarantine", "corridor_delay"]);
const LETHAL_RISK_DILEMMAS = new Set(["disease_response", "disease_corridor", "poacher_network", "rare_guardians"]);
function strategicIndividualSnapshot(individual) {
  if (!individual) return null;
  const axes = relationshipAxes(individual);
  return {
    id: individual.id,
    speciesId: individual.speciesId,
    species: individual.species,
    name: individual.name,
    rarity: individual.rarity || "",
    health: individual.health,
    healthCap: individual.healthCap || 100,
    bond: axes.security,
    security: axes.security,
    wildness: axes.wildness,
    status: individual.status
  };
}
function strategicIndividualFor(world, dilemma, pending = {}) {
  const state = normalizeLifeMemory(world);
  const existingId = (pending.namedIndividual || {}).id;
  if (existingId) {
    const existing = state.individuals.find((item) => item.id === existingId);
    if (existing) return { state, individual: existing };
  }
  if (dilemma && dilemma.requiresDilemmaId) {
    const parent = (((world.reserve || {}).strategy || {}).choiceHistory || []).slice().reverse().find((record) => record.dilemmaId === dilemma.requiresDilemmaId && record.namedIndividual && record.namedIndividual.id);
    if (parent) {
      const sameFriend = state.individuals.find((item) => item.id === parent.namedIndividual.id);
      if (sameFriend) return { state, individual: sameFriend };
    }
  }
  const themes = STRATEGIC_SPECIES_THEMES[(dilemma && dilemma.id) || ""] || [];
  let candidates = state.individuals.filter((item) => item.status === "active");
  const themed = themes.length ? candidates.filter((item) => themes.includes(item.speciesId)) : [];
  if (themed.length) candidates = themed;
  if (!candidates.length) candidates = state.individuals.filter((item) => item.status !== "dead");
  if (!candidates.length) return { state, individual: null };
  if ((dilemma && dilemma.id || "").includes("disease")) candidates.sort((a, b) => (a.health || 0) - (b.health || 0) || relationshipAxes(b).security - relationshipAxes(a).security);
  else if ((dilemma && dilemma.id || "").includes("rare")) candidates.sort((a, b) => Number(!!b.rarity) - Number(!!a.rarity) || relationshipAxes(b).security - relationshipAxes(a).security);
  else candidates.sort((a, b) => relationshipAxes(b).security - relationshipAxes(a).security || a.id.localeCompare(b.id));
  const top = candidates.slice(0, Math.min(3, candidates.length));
  const index = hash(`${(dilemma && dilemma.id) || "major"}|${pending.day || (world && world.day) || 1}|${pending.occurrence || 1}`) % top.length;
  return { state, individual: top[index] };
}
function bindStrategicIndividual(world, dilemma, pending = {}) {
  const selected = strategicIndividualFor(world, dilemma, pending);
  const nextPending = Object.assign({}, pending, { namedIndividual: strategicIndividualSnapshot(selected.individual) });
  return { state: selected.state, individual: selected.individual, pending: nextPending };
}
function strategicAnimalTrait(dilemma, choice, success) {
  if (!success) return `${choice.label}留下的长期阴影`;
  const routeTraits = {
    enforcement: "记住了被守住的边界",
    ecology: "拥有一段恢复后的栖息路线",
    research: "成为长期追踪档案的一员",
    community: "成为共生协议中的具体名字"
  };
  return routeTraits[choice.route] || `${choice.label}留下的生命印记`;
}
function strategicAxisDeltas(dilemma, choice, success) {
  const routeBase = {
    enforcement: { security: 4, wildness: -3 },
    ecology: { security: 3, wildness: 5 },
    research: { security: 2, wildness: 2 },
    community: { security: 6, wildness: -2 }
  }[choice.route] || { security: 3, wildness: 1 };
  const overrides = {
    rescue_deer: { security: 8, wildness: -8 },
    track_deer: { security: 2, wildness: 6 },
    drive_predator: { security: 3, wildness: -7 },
    guide_predator: { security: 2, wildness: 5 },
    open_water: { security: 7, wildness: -6 },
    hide_springs: { security: 2, wildness: 6 },
    rotating_water: { security: 4, wildness: 4 },
    field_clinics: { security: 8, wildness: -5 },
    mobile_screening: { security: 4, wildness: 2 },
    strict_quarantine: { security: 1, wildness: 3 },
    secret_archive: { security: 3, wildness: 6 },
    publish_route: { security: 4, wildness: -8 },
    limited_release: { security: 3, wildness: 2 },
    rare_closed: { security: 3, wildness: 6 },
    rare_live: { security: 5, wildness: -9 },
    rare_research: { security: 3, wildness: 1 },
    corridor_open: { security: 2, wildness: 7 },
    corridor_delay: { security: 5, wildness: -2 },
    corridor_zones: { security: 4, wildness: 4 }
  };
  const base = Object.assign({}, overrides[choice.id] || routeBase);
  if (!success) {
    base.security = Math.min(-3, -Math.abs(base.security || 3));
    base.wildness = Math.min(-2, (base.wildness || 0) - 4);
  }
  return base;
}
function strategicAnimalOutcomePreview(world, dilemma, choice, namedIndividual) {
  const selected = namedIndividual && namedIndividual.id
    ? normalizeLifeMemory(world).individuals.find((item) => item.id === namedIndividual.id) || namedIndividual
    : strategicIndividualFor(world, dilemma, {}).individual;
  if (!selected) return "永久 · 影响一只命名动物";
  const name = selected.name;
  if (selected.status === "dead") return `永久 · ${name}已离世：影响后续保护行动`;
  if (selected.status === "independent") return `永久 · ${name}已重归野外：影响季节归来`;
  if (selected.status === "departed") return `永久 · ${name}仍在保护区外：影响归来机会与关系`;
  const successAxes = strategicAxisDeltas(dilemma, choice, true);
  if (choice.risk === "risky") {
    const lethal = (selected.health || 0) <= 35 && LETHAL_RISK_DILEMMAS.has(dilemma.id);
    const failedAxes = strategicAxisDeltas(dilemma, choice, false);
    return `永久 · ${name}：成功 安全感${successAxes.security >= 0 ? "+" : ""}${successAxes.security}/野性${successAxes.wildness >= 0 ? "+" : ""}${successAxes.wildness}；失败 安全感${failedAxes.security}/野性${failedAxes.wildness}${lethal ? "，死亡风险" : ""}`;
  }
  if (DELAYED_RETURN_CHOICES.has(choice.id)) return `永久 · ${name}：风险下降，暂时离开`;
  return `永久 · ${name}：安全感${successAxes.security >= 0 ? "+" : ""}${successAxes.security}/野性${successAxes.wildness >= 0 ? "+" : ""}${successAxes.wildness}`;
}
function applyStrategicAnimalConsequence(world, strategicResult) {
  const dilemma = strategicResult && strategicResult.dilemma;
  const choice = strategicResult && strategicResult.choice;
  const named = strategicResult && strategicResult.record && strategicResult.record.namedIndividual;
  if (!world || !dilemma || !choice || !named || !named.id) return null;
  const state = normalizeLifeMemory(world);
  const index = state.individuals.findIndex((item) => item.id === named.id);
  if (index < 0) return null;
  const day = (world && world.day) || (strategicResult.record && strategicResult.record.day) || 1;
  const before = Object.assign({}, state.individuals[index]);
  const individual = Object.assign({ healthCap: 100, security: null, wildness: 76, strategicBond: 0, permanentFlags: [], strategicHistory: [] }, before);
  const beforeAxes = relationshipAxes(before);
  const diceSuccess = !choice.dice || !!(strategicResult.dice && strategicResult.dice.success);
  const routeHealth = choice.route === "ecology" ? 3 : choice.route === "enforcement" ? 1 : choice.route === "community" ? 2 : 0;
  const axisDelta = strategicAxisDeltas(dilemma, choice, diceSuccess);
  let healthDelta = choice.risk === "risky" ? (diceSuccess ? 8 : -28) : choice.risk === "balanced" ? 4 : 3;
  let securityDelta = axisDelta.security;
  let wildnessDelta = axisDelta.wildness;
  let healthCapDelta = choice.risk === "risky" && !diceSuccess ? -12 : 0;
  healthDelta += routeHealth;
  const previousStrategic = (individual.strategicHistory || []).slice(-1)[0];
  if (previousStrategic && dilemma.requiresDilemmaId && previousStrategic.dilemmaId === dilemma.requiresDilemmaId && diceSuccess && choice.risk !== "risky") {
    healthDelta += 4;
    securityDelta += 2;
    wildnessDelta += 2;
    healthCapDelta += 4;
  }
  if (["field_clinics", "mobile_screening", "corridor_zones"].includes(choice.id)) healthDelta += 5;
  if (["compensate", "water_committee", "charter_local"].includes(choice.id)) securityDelta += 3;
  if (["strict_quarantine", "corridor_delay"].includes(choice.id)) securityDelta -= 2;
  const statusBefore = individual.status;
  if (statusBefore === "dead" || statusBefore === "independent") {
    healthDelta = 0;
    securityDelta = 0;
    wildnessDelta = 0;
    healthCapDelta = 0;
  }
  let statusAfter = statusBefore;
  if (statusBefore === "dead") statusAfter = "dead";
  else if (statusBefore === "independent") statusAfter = "independent";
  else if (!diceSuccess && choice.risk === "risky" && LETHAL_RISK_DILEMMAS.has(dilemma.id) && (before.health || 0) <= 35) statusAfter = "dead";
  else if ((!diceSuccess && DEPARTURE_FAILURE_CHOICES.has(choice.id)) || DELAYED_RETURN_CHOICES.has(choice.id)) statusAfter = "departed";
  individual.healthCap = clamp((individual.healthCap || 100) + healthCapDelta, 55, 100);
  individual.health = statusAfter === "dead" ? 0 : clamp((individual.health || 0) + healthDelta, 8, individual.healthCap);
  const groupTrustDelta = Math.round(securityDelta / 2);
  individual.strategicBond = Math.max(-30, Math.min(30, Math.round((individual.strategicBond || 0) + securityDelta - groupTrustDelta)));
  individual.security = clamp(beforeAxes.security + securityDelta);
  individual.wildness = clamp(beforeAxes.wildness + wildnessDelta);
  individual.bond = individual.security;
  individual.status = statusAfter;
  individual.lastEventDay = day;
  if (statusAfter === "departed") individual.returnBlockedUntilDay = Math.max(individual.returnBlockedUntilDay || 0, day + (DELAYED_RETURN_CHOICES.has(choice.id) ? 8 : 12));
  const trait = statusBefore === "dead"
    ? `以${individual.name}的名字延续了“${choice.label}”`
    : strategicAnimalTrait(dilemma, choice, diceSuccess);
  individual.permanentFlags = Array.from(new Set((individual.permanentFlags || []).concat(trait))).slice(-8);
  const consequenceId = `strategy_${dilemma.id}_${choice.id}_${day}_${individual.id}`;
  const statusText = statusBefore === "dead" ? "仍被以名字纪念" : statusAfter === "independent" ? "继续自由生活" : statusAfter === "dead" ? "死亡" : statusAfter === "departed" ? "离开保护区" : individual.health < 46 ? "带伤留下" : "继续留在保护区";
  const history = {
    id: consequenceId,
    day,
    dilemmaId: dilemma.id,
    dilemmaTitle: dilemma.title,
    choiceId: choice.id,
    choiceLabel: choice.label,
    success: diceSuccess,
    permanent: true,
    healthDelta: individual.health - (before.health || 0),
    bondDelta: securityDelta,
    securityDelta,
    wildnessDelta,
    healthCapDelta: individual.healthCap - (before.healthCap || 100),
    statusBefore,
    statusAfter,
    trait
  };
  individual.strategicHistory = (individual.strategicHistory || []).concat(history).slice(-12);
  state.individuals[index] = individual;
  const title = statusBefore === "dead" ? `${individual.name}的名字仍在改变保护区` : diceSuccess ? `${individual.name}与你一起承担了这次选择` : `${individual.name}为这次选择付出了代价`;
  const body = statusBefore === "dead"
    ? `${individual.name}已离世。${choice.label}留下：${trait}。`
    : `${individual.name}${statusText}：健康 ${before.health || 0}→${individual.health}，安全感 ${beforeAxes.security}→${individual.security}，野性 ${beforeAxes.wildness}→${individual.wildness}${history.healthCapDelta ? `，健康上限 ${before.healthCap || 100}→${individual.healthCap}` : ""}。`;
  const memory = {
    id: `memory_${consequenceId}`,
    day,
    type: "strategic_permanent",
    individualId: individual.id,
    speciesId: individual.speciesId,
    name: individual.name,
    title,
    body,
    tone: diceSuccess ? "resolve" : "sad",
    permanent: true,
    dilemmaId: dilemma.id,
    choiceId: choice.id
  };
  state.memories = state.memories.concat(memory).slice(-240);
  state.permanentConsequences = state.permanentConsequences.concat(Object.assign({ individualId: individual.id, name: individual.name, speciesId: individual.speciesId }, history)).slice(-80);
  world.lifeMemory = state;
  world.knownCharacters = (world.knownCharacters || []).map((animal) => {
    if (animal.species !== individual.species) return animal;
    const relation = Object.assign({}, animal.relation || {}, { trust: clamp(((animal.relation || {}).trust || 40) + groupTrustDelta) });
    const memoryLines = (animal.memory || []).concat(`${day}日：${individual.name}${diceSuccess ? "记住了你的选择" : "承担了选择的代价"}——${trait}。`).slice(-5);
    return Object.assign({}, animal, { relation, memory: memoryLines });
  });
  const event = makeEvent("strategic_consequence", day, individual, title, body, diceSuccess ? "resolve" : "sad");
  event.isMajor = true;
  event.permanent = true;
  event.history = history;
  return { state, individual, before, memory, event, history };
}
function prepareGuardianReturnLetter(world, now = Date.now()) {
  const state = normalizeLifeMemory(world, now);
  const previous = state.lastSeenAt || now;
  const absentDays = Math.floor(Math.max(0, now - previous) / DAY_MS);
  state.lastSeenAt = now;
  if (absentDays < 2) return { state, letter: null };
  const key = `${Math.floor(previous / DAY_MS)}:${Math.floor(now / DAY_MS)}`;
  if (state.lastLetterKey === key) return { state, letter: null };
  const active = state.individuals.filter((item) => item.status === "active").sort((a, b) => (b.bond || 0) - (a.bond || 0));
  const friend = active[0] || state.individuals[0];
  if (!friend) return { state, letter: null };
  const letter = {
    id: `letter_${key}`,
    day: (world && world.day) || 1,
    absentDays,
    from: friend.name,
    species: friend.species,
    title: absentDays >= 7 ? `${friend.name}一直替你听着边界` : `${friend.name}发现你回来了`,
    body: absentDays >= 7
      ? `你离开了 ${absentDays} 天。巡护线变淡过，但没有谁把你的营地占走。你回来就好——今天先别急着证明什么，陪我们走一小段。`
      : `这 ${absentDays} 天里，动物还是会经过你巡过的路。刚才我听见熟悉的脚步了。你回来就好。`,
    quote: "“你回来就好。”"
  };
  state.guardianLetters.push(letter);
  state.lastLetterKey = key;
  state.memories.push({ id: `memory_${letter.id}`, day: letter.day, type: "guardian_letter", name: friend.name, species: friend.species, title: letter.title, body: letter.body, tone: "warm" });
  state.memories = state.memories.slice(-240);
  return { state, letter };
}
function markGuardianVisit(world, now = Date.now()) {
  const state = normalizeLifeMemory(world, now);
  state.lastSeenAt = now;
  return state;
}
function individualsForSpecies(world, speciesId) {
  return normalizeLifeMemory(world).individuals.filter((item) => item.speciesId === speciesId);
}
module.exports = {
  RARE_MOMENTS,
  normalizeLifeMemory,
  advanceLifeMemory,
  prepareGuardianReturnLetter,
  markGuardianVisit,
  individualsForSpecies,
  bindStrategicIndividual,
  strategicAnimalOutcomePreview,
  applyStrategicAnimalConsequence,
  relationshipAxes,
  lifeStage,
  displayStatus
};
