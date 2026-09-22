const assert = require("node:assert/strict");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const {
  WILDERNESS_FIND_CATALOG,
  maxObtainableQualityScore,
  wildernessKnowledgeSummary,
  proposeAutoExchange,
  settleAutoExchange,
  applyWildernessTradeInbox
} = require("../js/wildernessKnowledge");
const {
  startInvestigation,
  resolveInvestigation,
  ensureCollectionDiceLead,
  grantNextCollectionFromExchange,
  nextCollectionDiceItem
} = require("../js/collectionSystem");

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

function characterAt(level, chapter) {
  const state = createCharacter(null, "获取路径");
  Object.assign(state.world.reserve.progression, {
    level,
    stage: chapter,
    displayChapter: chapter
  });
  state.world.reserve.eventChain = Object.assign({}, state.world.reserve.eventChain, {
    chapterLevel: chapter,
    step: 7
  });
  state.world.reserve.actionPoints = 6;
  state.world.reserve.safety = 20;
  state.world.reserve.poacherPressure = 80;
  Object.assign(state.world.reserve.ecology, { water: 20, grass: 20 });
  (state.world.knownCharacters || []).forEach((animal) => {
    animal.relation = Object.assign({}, animal.relation || {}, { trust: 40 });
  });
  return state;
}

{
  const state = characterAt(5, 9);
  WILDERNESS_FIND_CATALOG.forEach((item) => {
    assertOk(item.minQuality <= maxObtainableQualityScore(Math.max(item.minLevel, 5)), `${item.id} must be reachable by a natural 6`);
    if (item.minLevel > 5) return;
    const roll = simulateDay(`跟随动物探索森林，寻找自然遗留。目标:${item.id} 掷骰:6`, JSON.parse(JSON.stringify(state)));
    const found = roll.visual && roll.visual.materialExploration && roll.visual.materialExploration.survivalFind;
    assertOk(found && found.id === item.id, `${item.id} must be obtainable by targeted dice`);
    assertOk((roll.world.reserve.wildernessKnowledge.tradeStock[item.id] || 0) >= 1, `${item.id} dice must add exchange stock`);
  });
}

{
  const state = characterAt(5, 9);
  const generic = simulateDay("跟随动物探索森林，寻找自然遗留。目标:random 掷骰:6", state);
  const found = generic.visual && generic.visual.materialExploration && generic.visual.materialExploration.survivalFind;
  assertOk(found && found.id, "untargeted dice must still grant a story-ready survival item when metrics are poor");
}

{
  const state = characterAt(1, 1);
  state.world.reserve.wildernessKnowledge = Object.assign({}, state.world.reserve.wildernessKnowledge, {
    tradeStock: { resin_tinder: 2 },
    discoveries: { resin_tinder: { count: 1, firstDay: 1, lastDay: 1 } }
  });
  const proposal = proposeAutoExchange(state.world.reserve);
  assertOk(proposal && proposal.want && proposal.offer.id === "resin_tinder", "exchange must start from owned surplus");
  assertOk(proposal.want.minLevel <= 2, "auto exchange must not demand far-future materials");
  const settled = settleAutoExchange(state.world.reserve, proposal, { id: "npc_ache", name: "阿澈", simulated: true, channel: "friends" }, {
    day: 1,
    source: "sandbox",
    tradeId: "acquire_auto_1",
    createdAt: 10
  });
  assertOk(settled.ok, "auto exchange must complete with npc");
  const summary = wildernessKnowledgeSummary(state.world.reserve);
  assertOk((summary.state.tradeStock[proposal.want.id] || 0) >= 1, "exchange must deliver the wanted survival item");
  assertOk((summary.state.discoveries[proposal.want.id] || {}).count > 0, "exchange must unlock the survival catalog card");
}

{
  const state = characterAt(1, 1);
  const inbox = applyWildernessTradeInbox(state.world.reserve, [{
    tradeId: "inbox_unlock_1",
    itemId: "reed_cord",
    itemLabel: "芦苇纤维束",
    partnerName: "河湾好友",
    scope: "friends",
    mode: "barter_v1",
    requestedItemId: "resin_tinder"
  }]);
  assertOk(inbox.receivedAmount === 1, "inbox must add the received survival item");
  assertOk((wildernessKnowledgeSummary(state.world.reserve).state.discoveries.reed_cord || {}).count > 0, "inbox exchange must unlock catalog knowledge");
}

{
  const state = characterAt(1, 1);
  state.world.reserve.ecology.water = 52;
  state.world.reserve.safety = 55;
  const next = nextCollectionDiceItem(state);
  assertOk(next && next.id === "c1_footprint", "chapter 1 collection dice must start with the first case item");
  const lead = ensureCollectionDiceLead(state);
  assertOk(lead && lead.itemId === "c1_footprint", "survival archive must spawn a dice lead for the next collection item");
  state.world.collection.investigation.charges = 1;
  assertOk(startInvestigation(state, lead.id, "field").ok, "collection dice investigation must start");
  const rolled = resolveInvestigation(state, 6, () => 0);
  assertOk(rolled.success && rolled.item && rolled.item.id === "c1_footprint", "collection dice must grant the pinned next item");
}

{
  const state = characterAt(1, 1);
  state.world.reserve.ecology.water = 52;
  state.world.reserve.safety = 55;
  const gift = grantNextCollectionFromExchange(state, { partnerName: "阿澈" });
  assertOk(gift.ok && gift.item.id === "c1_footprint", "friend exchange must be able to grant the next collection fragment");
  assertOk(state.world.collection.items.c1_footprint, "exchanged collection item must enter the archive");
}

console.log("survival collection acquire check ok");
