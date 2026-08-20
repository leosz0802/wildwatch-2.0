const { getUnlockedSpecies } = require("./animalWorld");

const EXPLORATION_GOODS = [
  { id: "researchSample", label: "研究样本", minLevel: 1, minQuality: 5, story: "动物带你找到一处反复使用的蹭痕，留下了完整样本。" },
  { id: "shedAntlerB", label: "B级鹿角", minLevel: 1, minQuality: 6, story: "旧兽道旁的落叶下，露出一段自然脱落的鹿角。" },
  { id: "recoveredTrap", label: "陷阱证据", minLevel: 1, minQuality: 7, story: "动物刻意绕开一片草丛，你在那里发现了废弃陷阱。" },
  { id: "naturalHide", label: "自然生命档案", minLevel: 2, minQuality: 8, story: "动物把你领到安静的自然死亡点，一份完整的生命记录被保存下来。" },
  { id: "shedAntlerA", label: "A级鹿角", minLevel: 3, minQuality: 9, story: "熟悉你的鹿群没有避开旧角脱落地，一枚完整鹿角得以被合规回收。" }
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function explorationRelationship(knownCharacters, level, lifeMemory) {
  const unlockedNames = new Set(getUnlockedSpecies(level).map((species) => species.name));
  const namedCandidates = (((lifeMemory || {}).individuals) || []).filter((animal) => {
    return unlockedNames.has(animal.species) && animal.status === "active" && typeof animal.security === "number" && typeof animal.wildness === "number";
  });
  if (namedCandidates.length) {
    const ranked = namedCandidates.map((animal) => {
      const security = clamp(Math.round(animal.security), 0, 100);
      const wildness = clamp(Math.round(animal.wildness), 0, 100);
      // 探索需要动物既愿意靠近，也仍保有辨认自然路线的能力；单纯投喂堆高安全感不会成为最优解。
      const quality = Math.round(security * 0.6 + wildness * 0.4);
      return { animal, security, wildness, quality };
    }).sort((a, b) => b.quality - a.quality);
    const securityAverage = Math.round(ranked.reduce((sum, item) => sum + item.security, 0) / ranked.length);
    const wildnessAverage = Math.round(ranked.reduce((sum, item) => sum + item.wildness, 0) / ranked.length);
    const average = Math.round(securityAverage * 0.6 + wildnessAverage * 0.4);
    const helper = ranked[0];
    return {
      average,
      securityAverage,
      wildnessAverage,
      count: ranked.length,
      helper: {
        id: helper.animal.id,
        name: helper.animal.name || helper.animal.species,
        species: helper.animal.species,
        security: helper.security,
        wildness: helper.wildness,
        trust: helper.security
      }
    };
  }
  const candidates = (knownCharacters || []).filter((animal) => {
    const trust = animal && animal.relation && animal.relation.trust;
    return unlockedNames.has(animal.species) && typeof trust === "number";
  });
  const values = candidates.map((animal) => clamp(Math.round(animal.relation.trust), 0, 100));
  const average = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 40;
  const helper = candidates.slice().sort((a, b) => (b.relation.trust || 0) - (a.relation.trust || 0))[0] || null;
  return {
    average,
    securityAverage: average,
    wildnessAverage: 70,
    count: values.length,
    helper: helper ? { id: helper.id, name: helper.shortName || helper.name || helper.species, species: helper.species, security: helper.relation.trust || 0, wildness: 70, trust: helper.relation.trust || 0 } : null
  };
}

function previewMaterialExploration(reserve, knownCharacters, lifeMemory) {
  const level = clamp(Math.round((((reserve || {}).progression || {}).level) || 1), 1, 5);
  const relationship = explorationRelationship(knownCharacters, level, lifeMemory);
  const levelContribution = Math.floor(level / 2);
  const relationshipContribution = relationship.average >= 80 ? 2 : relationship.average >= 55 ? 1 : 0;
  const requiredScore = 5;
  const requiredRoll = clamp(requiredScore - levelContribution - relationshipContribution, 1, 6);
  const successChance = Math.round(((7 - requiredRoll) / 6) * 100);
  return {
    level,
    relationship,
    levelContribution,
    relationshipContribution,
    requiredScore,
    requiredRoll,
    successChance,
    actionCost: 1
  };
}

function explorationGoodById(id) {
  return EXPLORATION_GOODS.find((item) => item.id === id) || null;
}

function resolveMaterialExploration(reserve, knownCharacters, targetId = "", random = Math.random, forcedRoll = null, lifeMemory = null) {
  const preview = previewMaterialExploration(reserve, knownCharacters, lifeMemory);
  const roll = forcedRoll === null || typeof forcedRoll === "undefined"
    ? clamp(Math.floor(random() * 6) + 1, 1, 6)
    : clamp(Math.round(forcedRoll), 1, 6);
  const luck = roll;
  const qualityScore = roll + preview.levelContribution + preview.relationshipContribution;
  const success = qualityScore >= preview.requiredScore;
  const quality = qualityScore >= 9 ? "罕见" : qualityScore >= 7 ? "优良" : "常见";
  const target = explorationGoodById(targetId);
  const eligible = EXPLORATION_GOODS.filter((item) => item.minLevel <= preview.level && item.minQuality <= qualityScore);
  let reward = null;
  if (success && eligible.length) {
    const targetEligible = target && eligible.some((item) => item.id === target.id);
    const resultSeed = ((roll * 17 + preview.level * 13 + preview.relationship.average) % 100) / 100;
    if (targetEligible && resultSeed < 0.68) reward = target;
    if (!reward) reward = eligible[Math.min(eligible.length - 1, Math.floor(resultSeed * eligible.length))];
  }
  const amount = reward ? (qualityScore >= 10 ? 3 : qualityScore >= 8 ? 2 : 1) : 0;
  const helperName = preview.relationship.helper ? preview.relationship.helper.name : "附近动物";
  const summary = reward
    ? `${helperName}带你绕开危险路线，发现${reward.label} ×${amount}，已进入待收取区。`
    : `${helperName}提供了方向，但这次随机机遇没有形成可回收发现。`;
  return Object.assign({}, preview, {
    targetId: targetId || "",
    targetLabel: target ? target.label : "随机线索",
    roll,
    luck,
    success,
    quality,
    qualityScore,
    reward: reward ? { id: reward.id, label: reward.label, amount, story: reward.story } : null,
    items: reward ? [{ key: reward.id, label: reward.label, amount }] : [],
    total: amount,
    summary
  });
}

module.exports = {
  EXPLORATION_GOODS,
  explorationGoodById,
  previewMaterialExploration,
  resolveMaterialExploration
};
