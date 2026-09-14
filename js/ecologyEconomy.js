const { getUnlockedSpecies, speciesPopulation } = require("./animalWorld");
const { BALANCE_V2, levelOf } = require("./balanceConfig");
const { wildernessStockReadiness } = require("./wildernessKnowledge");

const FRAGMENT_CATALOG = {
  fieldNote: { id: "fieldNote", name: "生态记录碎片", short: "记录", rarity: "common", color: "#54a980" },
  migrationTrace: { id: "migrationTrace", name: "迁徙轨迹碎片", short: "迁徙", rarity: "uncommon", color: "#4f95ad" },
  forestGift: { id: "forestGift", name: "森林赠礼碎片", short: "赠礼", rarity: "rare", color: "#8b72b8" },
  coGuardShard: { id: "coGuardShard", name: "共护徽片", short: "徽片", rarity: "scarce", color: "#d7a832" }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundNonNegative(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function animalPopulationTotal(reserve) {
  const level = levelOf(reserve);
  return getUnlockedSpecies(level).reduce((sum, species) => sum + speciesPopulation(reserve || {}, species.id), 0);
}

function weightedAnimalUnits(reserve) {
  const ecology = (reserve && reserve.ecology) || {};
  const total = (group, weight) => Object.keys(group || {}).reduce((sum, key) => sum + roundNonNegative(group[key]) * weight, 0);
  return Math.round(
    total(ecology.herbivores, 1) +
    total(ecology.predators, 1.75) +
    total(ecology.birds, 0.35)
  );
}

function populationYieldMultiplier(population, level) {
  const capacity = BALANCE_V2.population.carryingCapacity[level] || BALANCE_V2.population.carryingCapacity[7];
  const ratio = capacity > 0 ? population / capacity : 0;
  if (ratio < 0.60) return 0.75;
  if (ratio < 0.85) return 1;
  if (ratio <= 1) return 1.15;
  if (ratio <= 1.15) return 1.05;
  if (ratio <= 1.30) return 0.85;
  return 0.60;
}

function emptySeasonState() {
  return {
    id: "local-season-1",
    title: "区域共护季",
    bracket: 1,
    day: 1,
    length: 12,
    contribution: 0,
    rank: 12,
    poolRemaining: 30,
    claimed: 0,
    lastSettlementDay: 0,
    lastRank: 12,
    lastReward: null,
    rivals: []
  };
}

function normalizeEcologyEconomy(input, reserve) {
  const source = input || {};
  const fragments = Object.assign({ fieldNote: 0, migrationTrace: 0, forestGift: 0, coGuardShard: 0 }, source.fragments || {});
  Object.keys(fragments).forEach((key) => { fragments[key] = roundNonNegative(fragments[key]); });
  const season = Object.assign(emptySeasonState(), source.competition || {});
  season.bracket = clamp(Math.round(season.bracket || ((((reserve || {}).progression || {}).level) || 1)), 1, 7);
  season.day = clamp(roundNonNegative(season.day || 1), 1, roundNonNegative(season.length || 12) || 12);
  season.length = Math.max(7, roundNonNegative(season.length || 12));
  season.contribution = roundNonNegative(season.contribution);
  season.rank = Math.max(1, roundNonNegative(season.rank || 12));
  season.lastRank = Math.max(1, roundNonNegative(season.lastRank || season.rank));
  season.poolRemaining = roundNonNegative(season.poolRemaining);
  season.claimed = roundNonNegative(season.claimed);
  season.rivals = (season.rivals || []).slice(0, 12).map((rival, index) => Object.assign({
    id: `eco_rival_${index}`,
    name: `区域保护区${index + 1}`,
    contribution: 0,
    simulated: true
  }, rival));
  const drops = (source.mapDrops || []).slice(-3).map((drop, index) => Object.assign({
    id: `eco_drop_${Date.now()}_${index}`,
    type: "fieldNote",
    amount: 1,
    x: 0.5,
    y: 0.5,
    createdDay: 1,
    animalName: "动物伙伴"
  }, drop));
  return {
    version: 1,
    fragments,
    mapDrops: drops,
    productionMeter: Math.max(0, Number(source.productionMeter || 0)),
    rarePity: roundNonNegative(source.rarePity),
    careDebt: roundNonNegative(source.careDebt),
    totalProduced: roundNonNegative(source.totalProduced),
    totalCollected: roundNonNegative(source.totalCollected),
    lastLedger: source.lastLedger ? Object.assign({}, source.lastLedger) : null,
    competition: season,
    achievements: Object.assign({
      firstHarvest: false,
      balancedWeek: false,
      firstScarce: false,
      bestRank: 9999,
      personalBestContribution: 0,
      streak: 0
    }, source.achievements || {})
  };
}

function averageTrust(knownCharacters) {
  const values = (knownCharacters || [])
    .map((animal) => Number(((animal || {}).relation || {}).trust))
    .filter(Number.isFinite);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 45;
}

function namedAnimalForProduction(knownCharacters, day) {
  const animals = (knownCharacters || []).filter((animal) => animal && animal.name);
  if (!animals.length) return { name: "动物伙伴", species: "动物", id: "wildlife" };
  return animals[Math.abs(roundNonNegative(day)) % animals.length];
}

function dropPosition(type, day) {
  const positions = type === "migrationTrace"
    ? [[0.32, 0.68], [0.58, 0.58], [0.72, 0.43]]
    : type === "coGuardShard"
      ? [[0.48, 0.36], [0.66, 0.62], [0.36, 0.52]]
      : [[0.40, 0.72], [0.62, 0.47], [0.78, 0.67], [0.28, 0.42]];
  return positions[Math.abs(roundNonNegative(day)) % positions.length];
}

function contributionForAction(action, reserve, ledger) {
  const ecology = (reserve && reserve.ecology) || {};
  const actionVisitorWeights = {
    habitat: 8,
    antiPoacher: 9,
    houndScout: 6,
    intervention: 7,
    exploreMaterials: 5,
    salvage: 3,
    buySupplies: 2
  };
  let value = actionVisitorWeights[action] || 3;
  if ((reserve.safety || 0) >= 70) value += 2;
  if ((ecology.water || 0) >= 70 && (ecology.grass || 0) >= 65) value += 2;
  if ((reserve.poacherPressure || 0) <= 28) value += 2;
  if (ledger && ledger.shortfall > 0) value = Math.max(1, value - 3);
  return value;
}

function rankForContribution(contribution, level) {
  const step = 24 + level * 7;
  return clamp(12 - Math.floor(contribution / step), 1, 12);
}

function applyAnimalEcologyEconomy(reserve, knownCharacters, context = {}) {
  const day = Math.max(1, roundNonNegative(context.day || 1));
  const action = context.action || "patrol";
  const seasonName = context.season || (((reserve || {}).seasonState || {}).name) || "雨季";
  const state = normalizeEcologyEconomy(reserve.ecologyEconomy, reserve);
  const level = levelOf(reserve);
  const units = weightedAnimalUnits(reserve);
  const population = animalPopulationTotal(reserve);
  // 基金只用于采购巡护补给。动物承载压力直接由水源、草场和疾病体现，
  // 不在后台暗扣玩家无法预判的“动物养护费”。
  const ecology = reserve.ecology || {};
  const carryingPressure = Math.max(0, 55 - Math.min(ecology.water || 0, ecology.grass || 0));
  const survivalReadiness = wildernessStockReadiness(reserve);
  const effectiveCarryingPressure = Math.max(0, carryingPressure - survivalReadiness.careRelief);
  state.careDebt = effectiveCarryingPressure > 0
    ? Math.min(999, state.careDebt + Math.ceil(effectiveCarryingPressure / 8))
    : Math.max(0, state.careDebt - 2);

  const trust = averageTrust(knownCharacters);
  const ecologyScore = roundNonNegative(reserve.ecologyScore || reserve.stability || 50);
  const carryingMultiplier = populationYieldMultiplier(population, level);
  const productionGain = (0.45 + Math.min(0.7, population / 900) + trust / 240 + ecologyScore / 300) * carryingMultiplier;
  state.productionMeter += productionGain;
  const animal = namedAnimalForProduction(knownCharacters, day);
  const drops = [];
  if (state.productionMeter >= 1.65 && state.mapDrops.length < 3) {
    state.productionMeter -= 1.65;
    const migrationPositive = (((reserve || {}).migration || {}).delta || 0) > 0;
    const type = migrationPositive || action === "habitat" ? "migrationTrace" : "fieldNote";
    const position = dropPosition(type, day + state.totalProduced);
    drops.push({
      id: `eco_${day}_${state.totalProduced + 1}`,
      type,
      amount: 1,
      x: position[0],
      y: position[1],
      createdDay: day,
      animalId: animal.id,
      animalName: animal.name,
      species: animal.species,
      label: FRAGMENT_CATALOG[type].name
    });
  }

  state.rarePity += 1;
  const seasonalMatch = (seasonName === "雨季" && action === "habitat") || (seasonName === "旱季" && ["houndScout", "antiPoacher"].includes(action));
  const rareChance = Math.min(BALANCE_V2.rarity.maxChance,
    (BALANCE_V2.rarity.baseChance
      + (trust >= 65 ? BALANCE_V2.rarity.trustBonus : 0)
      + (ecologyScore >= 75 ? BALANCE_V2.rarity.ecologyBonus : 0)
      + (seasonalMatch ? BALANCE_V2.rarity.seasonBonus : 0)) * BALANCE_V2.tuning.rareDropScale);
  const rareReady = state.rarePity >= BALANCE_V2.rarity.pity || Math.random() < rareChance;
  if (rareReady && state.mapDrops.length + drops.length < 3) {
    const position = dropPosition("coGuardShard", day + state.totalProduced);
    drops.push({
      id: `scarce_${day}_${state.totalProduced + drops.length + 1}`,
      type: "forestGift",
      amount: 1,
      x: position[0],
      y: position[1],
      createdDay: day,
      animalId: animal.id,
      animalName: animal.name,
      species: animal.species,
      label: FRAGMENT_CATALOG.forestGift.name
    });
    state.rarePity = 0;
  }
  state.mapDrops = state.mapDrops.concat(drops).slice(-3);
  state.totalProduced += drops.length;

  const competition = state.competition;
  const cycle = Math.floor((day - 1) / competition.length);
  const seasonId = `local-season-${level}-${cycle}`;
  if (competition.bracket !== level || competition.id !== seasonId) {
    const lastReward = competition.lastReward || null;
    Object.assign(competition, emptySeasonState(), { bracket: level, id: seasonId, lastReward });
  }
  competition.lastRank = competition.rank;
  const contribution = contributionForAction(action, reserve, { shortfall: state.careDebt });
  competition.contribution += contribution;
  competition.rank = rankForContribution(competition.contribution, level);
  competition.day = ((day - 1) % competition.length) + 1;
  const rankGain = Math.max(0, competition.lastRank - competition.rank);
  let competitionReward = 0;
  if (competition.day === competition.length && competition.lastSettlementDay !== day) {
    competitionReward = Math.min(competition.poolRemaining, ecologyCompetitionReward(competition.rank));
    competition.poolRemaining = Math.max(0, competition.poolRemaining - competitionReward);
    competition.claimed += competitionReward;
    competition.lastSettlementDay = day;
    competition.lastReward = { day, rank: competition.rank, amount: competitionReward };
    state.fragments.coGuardShard += competitionReward;
  }

  const achievements = state.achievements;
  achievements.bestRank = Math.min(achievements.bestRank || 9999, competition.rank);
  achievements.personalBestContribution = Math.max(achievements.personalBestContribution || 0, competition.contribution);
  achievements.streak = state.careDebt === 0 ? (achievements.streak || 0) + 1 : 0;
  if (achievements.streak >= 7) achievements.balancedWeek = true;

  const ledger = {
    day,
    population,
    weightedUnits: units,
    season: seasonName,
    fundNeed: 0,
    fundSpent: 0,
    shortfall: 0,
    medicalSpent: 0,
    careDebt: state.careDebt,
    survivalSupport: survivalReadiness.support,
    survivalCareRelief: survivalReadiness.careRelief,
    populationYieldMultiplier: carryingMultiplier,
    rareChance,
    produced: drops.map((drop) => Object.assign({}, drop)),
    contribution,
    rankBefore: competition.lastRank,
    rankAfter: competition.rank,
    rankGain,
    competitionReward,
    trust,
    summary: `水草承载压力 ${state.careDebt} · 生存保障抵消 ${survivalReadiness.careRelief}`
  };
  state.lastLedger = ledger;
  reserve.ecologyEconomy = state;
  return ledger;
}

function collectEcologyDrop(reserve, dropId) {
  const state = normalizeEcologyEconomy(reserve.ecologyEconomy, reserve);
  const index = state.mapDrops.findIndex((drop) => drop.id === dropId);
  if (index < 0) return null;
  const drop = state.mapDrops[index];
  state.mapDrops.splice(index, 1);
  state.fragments[drop.type] = roundNonNegative(state.fragments[drop.type]) + roundNonNegative(drop.amount || 1);
  state.totalCollected += roundNonNegative(drop.amount || 1);
  state.achievements.firstHarvest = true;
  if (drop.type === "forestGift" || drop.type === "coGuardShard") state.achievements.firstScarce = true;
  reserve.ecologyEconomy = state;
  return Object.assign({}, drop, { total: state.fragments[drop.type] });
}

function ecologyCompetitionReward(rank) {
  if (rank <= 1) return 5;
  if (rank <= 3) return 4;
  if (rank <= 6) return 3;
  if (rank <= 9) return 2;
  return 1;
}

function exchangeFragments(reserve, fragmentId, choice = "dogFood") {
  if (!reserve) return { ok: false, error: "保护区数据不存在" };
  const state = normalizeEcologyEconomy(reserve.ecologyEconomy, reserve);
  const recipe = BALANCE_V2.fragmentExchange[fragmentId];
  if (!recipe || fragmentId === "coGuardShard") return { ok: false, error: "该碎片需在设施专精中使用" };
  reserve.resourceAging = reserve.resourceAging || { exchangeCooldowns: {} };
  reserve.resourceAging.exchangeCooldowns = reserve.resourceAging.exchangeCooldowns || {};
  if ((reserve.resourceAging.exchangeCooldowns[fragmentId] || 0) > 0) return { ok: false, error: `还需等待${reserve.resourceAging.exchangeCooldowns[fragmentId]}次操作` };
  if ((state.fragments[fragmentId] || 0) < recipe.amount) return { ok: false, error: `${FRAGMENT_CATALOG[fragmentId].name}不足` };
  reserve.supplies = reserve.supplies || {};
  const before = { fragments: state.fragments[fragmentId], supplies: Object.assign({}, reserve.supplies) };
  if (fragmentId === "fieldNote") {
    if ((reserve.supplies.fieldKit || 0) >= BALANCE_V2.supplyCaps.fieldKit) return { ok: false, error: "野外工具包已满" };
    reserve.supplies.fieldKit = Math.min(BALANCE_V2.supplyCaps.fieldKit, (reserve.supplies.fieldKit || 0) + 1);
  } else if (fragmentId === "migrationTrace") {
    if ((reserve.supplies.tranquilizer || 0) >= BALANCE_V2.supplyCaps.tranquilizer) return { ok: false, error: "麻醉弹已满" };
    reserve.supplies.tranquilizer = Math.min(BALANCE_V2.supplyCaps.tranquilizer, (reserve.supplies.tranquilizer || 0) + 1);
  } else if (fragmentId === "forestGift") {
    const rewards = { dogFood: 2, alarm: 1, tranquilizer: 1, fieldKit: 1 };
    if (!rewards[choice]) return { ok: false, error: "请选择有效补给" };
    reserve.supplies = reserve.supplies || {};
    if ((reserve.supplies[choice] || 0) >= BALANCE_V2.supplyCaps[choice]) return { ok: false, error: "该补给已满" };
    reserve.supplies[choice] = Math.min(BALANCE_V2.supplyCaps[choice], (reserve.supplies[choice] || 0) + rewards[choice]);
  }
  state.fragments[fragmentId] -= recipe.amount;
  reserve.resourceAging.exchangeCooldowns[fragmentId] = recipe.cooldown;
  reserve.ecologyEconomy = state;
  return { ok: true, fragmentId, choice, before, after: { fragments: state.fragments[fragmentId], supplies: Object.assign({}, reserve.supplies), supply: (reserve.supplies || {})[choice] || 0 } };
}

module.exports = {
  FRAGMENT_CATALOG,
  normalizeEcologyEconomy,
  applyAnimalEcologyEconomy,
  collectEcologyDrop,
  ecologyCompetitionReward,
  exchangeFragments,
  populationYieldMultiplier
};
