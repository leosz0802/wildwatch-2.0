const { getUnlockedSpecies } = require("./animalWorld");
const { survivalFindForExploration, capCollectibleMinQuality, wildernessFindById } = require("./wildernessKnowledge");
const { RESCUE_ITEM_CATALOG, rescueTargetScore } = require("./chapterRescueSystem");
const { ARCHIVE_ITEMS } = require("./speciesArchiveBox");
const EXPLORATION_GOODS = [
  { id: "researchSample", label: "研究样本", minLevel: 1, minQuality: 5, story: "动物带你找到一处反复使用的蹭痕，留下了完整样本。" },
  { id: "shedAntlerB", label: "B级岩角", minLevel: 1, minQuality: 6, story: "旧兽道旁的落叶下，露出一段自然脱落的岩角。" },
  { id: "recoveredTrap", label: "隐踪器", minLevel: 1, minQuality: 7, story: "动物刻意绕开一片草丛，你在那里发现了废弃机关。" },
  { id: "naturalHide", label: "自然生命档案", minLevel: 2, minQuality: 8, story: "动物把你领到安静的自然死亡点，一份完整的生命记录被保存下来。" },
  { id: "shedAntlerA", label: "A级岩角", minLevel: 3, minQuality: 9, story: "熟悉你的鹿群没有避开旧角脱落地，一枚完整岩角得以被合规回收。" }
].map((item) => Object.assign({}, item, { minQuality: capCollectibleMinQuality(item.minLevel, item.minQuality) }));
// 物种档案线索复用动物引路探索的点数判定，但不进入回收物库存；结算时直接写入档案盒。
const ARCHIVE_EXPLORATION_GOODS = ARCHIVE_ITEMS.map((item) => Object.assign({}, item, {
  label: item.name,
  story: item.note,
  kind: "speciesArchive",
  // 章节 3～11 映射到现有 1～7 经营等级，避免第11章因为直接拿章节号
  // 作为等级而永远无法通过动物探索获得。
  minLevel: Math.max(1, Math.min(7, Math.ceil(item.chapter / 2))),
  minQuality: capCollectibleMinQuality(item.chapter, 5 + ((item.chapter + item.id.length) % 3))
}));
const RESCUE_GOODS = RESCUE_ITEM_CATALOG.map((item, index) => Object.assign({}, item, {
  kind: "rescue",
  minLevel: 1 + Math.floor(index / 3),
  minQuality: capCollectibleMinQuality(1 + Math.floor(index / 3), 5 + (index % 2)),
  story: item.story
}));
const POACHER_RESCUE_TARGET_SCORE = 10;
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
  const level = clamp(Math.round((((reserve || {}).progression || {}).level) || 1), 1, 7);
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
  return EXPLORATION_GOODS.concat(ARCHIVE_EXPLORATION_GOODS, RESCUE_GOODS).find((item) => item.id === id) || null;
}
function explorationTargetScore(target, options = {}) {
  if (!target || target.kind !== "rescue") return 0;
  const forcedScore = Number(options.requiredScore);
  if (Number.isFinite(forcedScore) && forcedScore > 0) {
    return forcedScore;
  }
  return rescueTargetScore(target.id);
}
function explorationProgressFor(reserve, targetId, options = {}) {
  const target = explorationGoodById(targetId);
  const map = (reserve && reserve.materialExplorationProgress) || {};
  const required = explorationTargetScore(target, options);
  const last = (reserve && reserve.lastMaterialExploration) || {};
  const saved = Object.prototype.hasOwnProperty.call(map, targetId) ? map[targetId]
    : last.targetId === targetId ? ((last.collectionProgress || {}).current || last.roll) : 0;
  const current = Math.max(0, Math.round(Number(saved) || 0));
  return { current: Math.min(current, required || current), required, completed: !!required && current >= required };
}
function resolveMaterialExploration(reserve, knownCharacters, targetId = "", random = Math.random, forcedRoll = null, lifeMemory = null, context = {}) {
  const preview = previewMaterialExploration(reserve, knownCharacters, lifeMemory);
  const roll = forcedRoll === null || typeof forcedRoll === "undefined"
    ? clamp(Math.floor(random() * 6) + 1, 1, 6)
    : clamp(Math.round(forcedRoll), 1, 6);
  const luck = roll;
  const qualityScore = roll + preview.levelContribution + preview.relationshipContribution;
  let success = qualityScore >= preview.requiredScore;
  const quality = qualityScore >= 9 ? "罕见" : qualityScore >= 7 ? "优良" : "常见";
  const target = explorationGoodById(targetId);
  const wildernessTarget = !target ? wildernessFindById(targetId) : null;
  const collectionProgress = explorationProgressFor(reserve, targetId, { requiredScore: Number(context.rescueRequiredScore) || 0 });
  const previouslyComplete = collectionProgress.completed;
  if (collectionProgress.required) {
    collectionProgress.before = collectionProgress.current;
    collectionProgress.current = Math.min(collectionProgress.required, collectionProgress.current + roll);
    collectionProgress.completed = collectionProgress.current >= collectionProgress.required;
    reserve.materialExplorationProgress = Object.assign({}, reserve.materialExplorationProgress, { [targetId]: collectionProgress.current });
    success = collectionProgress.completed;
  } else if (wildernessTarget) {
    success = qualityScore >= wildernessTarget.minQuality && wildernessTarget.minLevel <= preview.level;
  }
  const eligible = EXPLORATION_GOODS.concat(ARCHIVE_EXPLORATION_GOODS)
    .filter((item) => item.minLevel <= preview.level && item.minQuality <= qualityScore);
  const rescueTarget = target && target.kind === "rescue" ? target : null;
  if (rescueTarget && rescueTarget.minLevel <= preview.level && rescueTarget.minQuality <= qualityScore) eligible.push(rescueTarget);
  let reward = null;
  if (rescueTarget) {
    if (collectionProgress.completed && !previouslyComplete) reward = rescueTarget;
  } else if (wildernessTarget) {
    reward = null;
  } else if (target && target.kind !== "rescue") {
    if (eligible.some((item) => item.id === target.id)) reward = target;
  } else if (success && eligible.length && !target) {
    const resultSeed = ((roll * 17 + preview.level * 13 + preview.relationship.average) % 100) / 100;
    reward = eligible[Math.min(eligible.length - 1, Math.floor(resultSeed * eligible.length))];
  }
  const amount = reward ? (rescueTarget || reward.kind === "speciesArchive" ? 1 : qualityScore >= 10 ? 3 : qualityScore >= 8 ? 2 : 1) : 0;
  const helperName = preview.relationship.helper ? preview.relationship.helper.name : "附近动物";
  const survivalFind = survivalFindForExploration(Object.assign({}, preview, { success, qualityScore }), roll, targetId, Object.assign({ reserve }, context));
  const summary = collectionProgress.required
    ? `本次获得 ${roll} 点，累计 ${collectionProgress.current}/${collectionProgress.required} 点。${reward ? `${target.label}收集完成。` : collectionProgress.completed ? "物品已完成收集。" : "继续射箭即可累计收集。"}`
    : survivalFind && wildernessTarget
    ? `${helperName}带你找到了${wildernessTarget.label}。`
    : wildernessTarget
    ? `${helperName}指出了${wildernessTarget.label}的方向，但本次点数未达到 ${wildernessTarget.minQuality}。`
    : reward
    ? `${helperName}带你绕开危险路线，发现${reward.label} ×${amount}，${reward.kind === "speciesArchive" ? "已写入物种档案盒。" : "已进入待收取区。"}`
    : `${helperName}提供了方向，但本次点数不足，未形成可回收发现。`;
  return Object.assign({}, preview, {
    targetId: targetId || "",
    targetLabel: target ? target.label : wildernessTarget ? wildernessTarget.label : "随机线索",
    roll,
    luck,
    success: wildernessTarget ? !!survivalFind : success,
    quality,
    qualityScore,
    collectionProgress,
    reward: reward ? { id: reward.id, label: reward.label, amount, story: reward.story } : null,
    items: reward ? [{ key: reward.id, label: reward.label, amount }] : [],
    total: amount,
    survivalFind,
    summary
  });
}
module.exports = {
  EXPLORATION_GOODS,
  ARCHIVE_EXPLORATION_GOODS,
  RESCUE_GOODS,
  explorationGoodById,
  previewMaterialExploration,
  resolveMaterialExploration,
  POACHER_RESCUE_TARGET_SCORE,
  explorationTargetScore,
  explorationProgressFor
};
