function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext() { return createFakeContext(); } }; },
  createImage() { return { loaded: true, complete: true, set src(value) { this._src = value; this.loaded = true; this.complete = true; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { safeConfig } = require("../js/cloudService");
const {
  WILDERNESS_FIND_CATALOG,
  maxObtainableQualityScore,
  normalizeWildernessKnowledge,
  recordWildernessFind,
  wildernessKnowledgeSummary,
  wildernessTradeOffer,
  wildernessStockReadiness,
  wildernessTradeRecommendations,
  wildernessTradeDailyUsage,
  wildernessFindById,
  wildernessTradePreview,
  proposeAutoExchange,
  settleAutoExchange,
  settleWildernessTrade,
  applyWildernessTradeInbox
} = require("../js/wildernessKnowledge");
const { applyAnimalEcologyEconomy } = require("../js/ecologyEconomy");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(WILDERNESS_FIND_CATALOG.length >= 12, "survival catalog should contain enough varied discoveries");
WILDERNESS_FIND_CATALOG.forEach((item) => {
  ["material", "knowledge", "use", "safety"].forEach((key) => assert(String(item[key] || "").length >= 8, `${item.id} needs ${key}`));
  assert(String(item.storyHook || "").length >= 8, `${item.id} needs a story hook`);
  assert(item.reserveEffect && item.reserveEffect.label && Number.isFinite(item.reserveEffect.delta), `${item.id} needs a reserve effect`);
  assert(item.minQuality <= maxObtainableQualityScore(item.minLevel),
    `${item.id} needs ${item.minQuality} but a natural 6 at level ${item.minLevel} only reaches ${maxObtainableQualityScore(item.minLevel)}`);
});
const lastChapterFind = WILDERNESS_FIND_CATALOG.filter((item) => item.minLevel === 4).pop();
assert(lastChapterFind && lastChapterFind.minQuality <= 8, "chapter 4 last survival find must be obtainable with a 6 and no relationship bonus");

const reserve = { safety: 50, poacherPressure: 30, ecology: { water: 60, grass: 60, disease: 10 } };
const sample = WILDERNESS_FIND_CATALOG[0];
const first = recordWildernessFind(reserve, sample, 2, {
  chapter: 2,
  storyDiscovery: { title: "晨角发现异常", caseId: "case_2", itemId: "item_2", status: "hinted" }
});
const safetyAfterFirst = reserve.safety;
const second = recordWildernessFind(reserve, sample, 3, { chapter: 2 });
assert(first.isNew && !second.isNew, "only the first physical sample should unlock new knowledge");
assert(first.storyLink && first.storyLink.type === "active" && /晨角/.test(first.storyLink.title), "first discovery should bind to the active story");
assert(first.impact && first.impact.label === "安全" && first.impact.delta === 1, "first discovery should apply its reserve effect");
assert(safetyAfterFirst === 51 && reserve.safety === 51 && !second.impact, "duplicate materials must not farm reserve stats");
assert(reserve.wildernessKnowledge.discoveries[sample.id].count === 2, "repeat discoveries should remain counted");
assert(reserve.wildernessKnowledge.tradeStock[sample.id] === 2, "every physical sample should enter future friend-trade stock");
assert(wildernessKnowledgeSummary(reserve).unlocked === 1, "knowledge unlock count should not grow on duplicates");
assert(wildernessTradeOffer(reserve, sample.id, 1).ready, "trade payload should be ready for an owned sample");
assert(wildernessTradeOffer(reserve, sample.id, 99).amount === 2, "trade payload should never promise more than available stock");
const heldReadiness = wildernessStockReadiness(reserve);
assert(heldReadiness.support > 0 && heldReadiness.careRelief > 0, "owned survival stock should become ongoing reserve readiness");
const friendPreview = wildernessTradePreview(reserve, sample.id, "friends", { id: "friend_1", name: "好友保护区" });
const worldPreview = wildernessTradePreview(reserve, sample.id, "world", { id: "world_1", name: "世界保护区" });
assert(friendPreview.metricDelta > worldPreview.metricDelta && friendPreview.fundDelta === 0, "friend exchange should prioritize stronger ecological collaboration value");
assert(worldPreview.fundDelta > 0 && worldPreview.partnerCredit < friendPreview.partnerCredit, "world exchange should prioritize market funds at a lower relationship value");
const fundBeforeTrade = reserve.fund || 0;
const worldSettlement = settleWildernessTrade(reserve, worldPreview, { tradeId: "trade_world_1", clientTradeId: "client_world_1", day: 3 });
assert(worldSettlement.ok && reserve.fund > fundBeforeTrade && reserve.wildernessKnowledge.tradeStock[sample.id] === 1, "confirmed world exchange should consume exactly one item and settle fund value");
const incomingBefore = reserve.fund;
const pendingBeforeInbox = (reserve.wildernessKnowledge.exchangeIcon || {}).pendingKey || "";
const inbox = applyWildernessTradeInbox(reserve, [{ tradeId: "incoming_1", partnerCredit: 2, itemId: sample.id, itemLabel: sample.label, partnerName: "远方好友", scope: "friends" }]);
const duplicateInbox = applyWildernessTradeInbox(reserve, [{ tradeId: "incoming_1", partnerCredit: 2 }]);
assert(inbox.applied.length === 1 && reserve.fund > incomingBefore && duplicateInbox.applied.length === 0, "incoming trade receipts should reward the partner exactly once");
assert(inbox.receivedAmount === 1 && reserve.wildernessKnowledge.tradeStock[sample.id] === 2, "a claimed inbox receipt should add the real incoming material to exchange stock exactly once");
assert(((reserve.wildernessKnowledge.exchangeIcon || {}).pendingKey || "") === pendingBeforeInbox, "领取回执不得立刻再推沙盘交换");
assert(/无需额外物资/.test(inbox.applied[0].paymentLabel), "inbox accounting should state what the receiver paid instead of leaving the exchange ambiguous");
const barterChoices = wildernessTradeRecommendations(reserve, sample.id);
assert(barterChoices.length === 3 && new Set(barterChoices.map((item) => item.tradeKind)).size === 3, "the compact exchange flow should recommend one existing asset from each of the three trade categories");
const barterPreview = wildernessTradePreview(reserve, sample.id, "world", { id: "matching_pool", name: "等待真实玩家匹配" }, barterChoices[0].id);
const fundBeforeEscrow = reserve.fund;
const metricBeforeEscrow = reserve.safety;
const barterSettlement = settleWildernessTrade(reserve, barterPreview, { tradeId: "barter_open_1", clientTradeId: "barter_client_1", status: "open", day: 4 });
assert(barterSettlement.ok && barterSettlement.pending && reserve.fund === fundBeforeEscrow && reserve.safety === metricBeforeEscrow, "escrow must consume only the offered item and never grant direct fund or reserve-stat rewards");
assert(wildernessTradeDailyUsage(reserve, 4).used === 1, "daily exchange usage should count escrow deposits exactly once");
const autoProposal = proposeAutoExchange(reserve);
assert(autoProposal && autoProposal.offer && autoProposal.want && autoProposal.offer.id !== autoProposal.want.id, "auto exchange should pick owned surplus against a current shortage");
const autoStockBefore = reserve.wildernessKnowledge.tradeStock[autoProposal.offer.id];
const autoWantBefore = reserve.wildernessKnowledge.tradeStock[autoProposal.want.id] || 0;
const autoResult = settleAutoExchange(reserve, autoProposal, { id: "npc_ache", name: "阿澈", simulated: true, channel: "friends" }, { day: 4, source: "sandbox", tradeId: "auto_npc_1", createdAt: 40 });
assert(autoResult.ok && autoResult.partner.kind === "npc", "npc partners should complete the whole exchange when real players are missing");
assert(reserve.wildernessKnowledge.tradeStock[autoProposal.offer.id] === autoStockBefore - 1, "auto request should spend one owned item");
assert(reserve.wildernessKnowledge.tradeStock[autoProposal.want.id] === autoWantBefore + 1, "auto match should grant the requested shortage item");
assert(reserve.wildernessKnowledge.tradeHistory.some((entry) => entry.tradeId === "auto_npc_1"), "auto request must write the outbox");
assert(reserve.wildernessKnowledge.incomingHistory.some((entry) => entry.tradeId === "auto_npc_1_in"), "auto result must write the inbox");
const pressureReserve = { ecology: { water: 40, grass: 40 }, safety: 50, poacherPressure: 30, wildernessKnowledge: reserve.wildernessKnowledge };
const protectedLedger = applyAnimalEcologyEconomy(pressureReserve, [], { day: 4, action: "patrol" });
const unprotectedLedger = applyAnimalEcologyEconomy({ ecology: { water: 40, grass: 40 }, safety: 50, poacherPressure: 30 }, [], { day: 4, action: "patrol" });
assert(protectedLedger.survivalCareRelief > 0 && protectedLedger.careDebt <= unprotectedLedger.careDebt, "held survival stock should reduce daily water-and-grass care pressure");
const bounded = normalizeWildernessKnowledge({ discoveries: { [sample.id]: { count: 10000 } }, tradeStock: { [sample.id]: 10000 } });
assert(bounded.discoveries[sample.id].count === 999 && bounded.tradeStock[sample.id] === 99, "save growth should be bounded");

const character = createCharacter(null, "保护区卫士");
character.world.reserve.progression.level = 3;
character.world.reserve.actionPoints = 3;
(character.world.knownCharacters || []).forEach((animal) => {
  animal.relation = Object.assign({}, animal.relation || {}, { trust: 90 });
});
const result = simulateDay("跟随动物探索森林，寻找自然遗留。目标:researchSample 掷骰:6", character);
const exploration = result.visual && result.visual.materialExploration;
assert(exploration && exploration.survivalFind, "successful animal-guided exploration should produce a survival find");
assert(exploration.survivalFind.isNew === true, "first integrated discovery should unlock knowledge");
assert(exploration.survivalFind.impact && exploration.survivalFind.storyLink, "integrated discovery should persist reserve impact and story linkage");
assert((result.world.reserve.wildernessKnowledge.tradeStock[exploration.survivalFind.id] || 0) === 1, "integrated discovery should persist trade stock");
assert(/永久解锁/.test(exploration.summary) && /已关联/.test(exploration.summary), "settlement copy should explain knowledge unlock and story linkage");

{
  const targeted = createCharacter(null, "指定素材");
  targeted.world.reserve.progression.level = 5;
  targeted.world.reserve.progression.stage = 9;
  targeted.world.reserve.progression.displayChapter = 9;
  targeted.world.reserve.eventChain = Object.assign({}, targeted.world.reserve.eventChain, { chapterLevel: 9, step: 2 });
  targeted.world.reserve.actionPoints = 3;
  targeted.world.reserve.safety = 20;
  targeted.world.reserve.poacherPressure = 80;
  targeted.world.reserve.ecology = Object.assign({}, targeted.world.reserve.ecology, { water: 20 });
  (targeted.world.knownCharacters || []).forEach((animal) => {
    animal.relation = Object.assign({}, animal.relation || {}, { trust: 20 });
  });
  const bark = wildernessFindById("bark_route_tag");
  assert(bark && bark.minQuality <= maxObtainableQualityScore(5), "late survival item must remain reachable by a natural 6");
  const targetedResult = simulateDay("跟随动物探索森林，寻找自然遗留。目标:bark_route_tag 掷骰:6", targeted);
  const targetedFind = targetedResult.visual && targetedResult.visual.materialExploration;
  assert(targetedFind && targetedFind.survivalFind && targetedFind.survivalFind.id === "bark_route_tag", "指定生存素材必须能通过掷骰子取得，不能被随机抽成别的物件");
  assert((targetedResult.world.reserve.wildernessKnowledge.tradeStock.bark_route_tag || 0) === 1, "targeted dice must persist the requested survival stock");
  const missState = createCharacter(null, "指定素材不足");
  missState.world.reserve.progression.level = 5;
  missState.world.reserve.progression.stage = 9;
  missState.world.reserve.progression.displayChapter = 9;
  missState.world.reserve.eventChain = Object.assign({}, missState.world.reserve.eventChain, { chapterLevel: 9, step: 2 });
  missState.world.reserve.actionPoints = 3;
  const miss = simulateDay("跟随动物探索森林，寻找自然遗留。目标:bark_route_tag 掷骰:1", missState);
  assert(!(miss.visual && miss.visual.materialExploration && miss.visual.materialExploration.survivalFind), "点数不足时指定素材不得发放");
}

const secure = safeConfig({ assets: { artAtlas: { url: "https://wild.hubao.tv/assets/art-atlas-v2.png", version: "v2" } } });
const rejected = safeConfig({ assets: { artAtlas: { url: "https://evil.example/art.png", version: "v2" } } });
const premiumSecure = safeConfig({ assets: { premiumUiAtlas: { url: "https://wild.hubao.tv/assets/premium-ui-v1.jpg", version: "premium-v1" } } });
const premiumRejected = safeConfig({ assets: { premiumUiAtlas: { url: "https://evil.example/premium.jpg", version: "premium-v1" } } });
const wildernessSecure = safeConfig({ assets: { wildernessMaterialAtlas: { url: "https://wild.hubao.tv/assets/wilderness-materials-atlas-v1.webp", version: "wilderness-v1" } } });
const wildernessRejected = safeConfig({ assets: { wildernessMaterialAtlas: { url: "https://evil.example/materials.webp", version: "wilderness-v1" } } });
const portraitsSecure = safeConfig({ assets: { animalPortraitAtlas: { url: "https://wild.hubao.tv/assets/animal-portraits-atlas-v4.jpg", version: "portraits-v4" } } });
const portraitsRejected = safeConfig({ assets: { animalPortraitAtlas: { url: "https://evil.example/portraits.jpg", version: "portraits-v4" } } });
assert(secure.assets.artAtlas.url.includes("wild.hubao.tv"), "reviewed server asset URL should pass the whitelist");
assert(rejected.assets.artAtlas.url === "", "third-party dynamic asset hosts should be rejected");
assert(premiumSecure.assets.premiumUiAtlas.url.includes("wild.hubao.tv"), "reviewed premium UI URL should pass the whitelist");
assert(premiumRejected.assets.premiumUiAtlas.url === "", "third-party premium UI hosts should be rejected");
assert(wildernessSecure.assets.wildernessMaterialAtlas.url.includes("wild.hubao.tv"), "reviewed wilderness material URL should pass the whitelist");
assert(wildernessRejected.assets.wildernessMaterialAtlas.url === "", "third-party wilderness material hosts should be rejected");
assert(portraitsSecure.assets.animalPortraitAtlas.url.includes("wild.hubao.tv"), "reviewed animal portrait URL should pass the whitelist");
assert(portraitsRejected.assets.animalPortraitAtlas.url === "", "third-party animal portrait hosts should be rejected");

const game = new Game();
game.stopLoop();
// This fixture injects deterministic cloud/friend controllers below; prevent
// the post-first-frame production initializer from replacing them mid-check.
game.deferredRuntimeServicesReady = true;
game.ctx = createFakeContext();
game.width = 375;
game.height = 667;
game.render = () => {};
game.state = Object.assign({}, character, { world: result.world, character: result.character, reports: result.reports || [] });
game.state.world.reserve.progression.totalActions = 2;
game.state.world.reserve.wildernessKnowledge = normalizeWildernessKnowledge(Object.assign({}, game.state.world.reserve.wildernessKnowledge || {}, {
  tradeHistory: [{ tradeId: "mail_sent_1", itemId: sample.id, itemLabel: sample.label, partnerName: "河湾好友", scope: "friends", day: 3, rewardLabel: "安全 +1 · 共护 +8" }],
  incomingHistory: [{ tradeId: "mail_received_1", itemId: WILDERNESS_FIND_CATALOG[1].id, itemLabel: WILDERNESS_FIND_CATALOG[1].label, partnerName: "林缘好友", scope: "friends", day: 4, receivedAmount: 1, paymentLabel: "无需额外物资（对方主动发起）" }]
}));
game.cloudService = {
  tradeMailboxStatus: "ready",
  tradeMailbox: {
    sent: [
      { tradeId: "mail_sent_1", itemId: sample.id, itemLabel: sample.label, partnerName: "河湾好友", scope: "friends", createdAt: 20 },
      { tradeId: "legacy_remote_1", itemId: "reed_cord", itemLabel: "芦苇纤维束", partnerName: "旧版保护区", scope: "world", createdAt: 19 },
      { tradeId: "legacy_remote_2", itemId: "feather_wind_tag", itemLabel: "落羽风向签", partnerName: "旧版保护区", scope: "world", createdAt: 18 },
      { tradeId: "legacy_remote_3", itemId: "track_cast", itemLabel: "兽道泥印板", partnerName: "旧版保护区", scope: "world", createdAt: 17 }
    ],
    received: []
  },
  feature(name) { return name === "socialTrade" || name === "reciprocalTrade"; }
};
game.screen = "survival";
game.hitAreas = [];
game.drawSurvival(game.ctx);
const visibleMaterialLevel = Number(game.survivalMaterialLevel) || 1;
const visibleMaterials = WILDERNESS_FIND_CATALOG.filter((item) => Number(item.minLevel || 1) === visibleMaterialLevel);
assert(game.renderedSurvivalCards && game.renderedSurvivalCards.length === visibleMaterials.length, "survival should show the selected material-level catalog without a long vertical list");
assert(game.renderedSurvivalHero && game.renderedSurvivalHero.style === "green-achievement-progress-card", "survival should lead with the green achievement-style progress card");
assert(game.renderedSurvivalGroups && game.renderedSurvivalGroups.length === 1 && game.renderedSurvivalGroups.every((group) => group.style === "green-achievement-floor-card" && group.selected), "survival catalog should show only the selected horizontal-tab level group");
game.renderedSurvivalGroups.forEach((group) => {
  const firstCard = game.renderedSurvivalCards.find((card) => card.groupLevel === group.level);
  if (firstCard) assert(firstCard.y >= group.y + 74, `level ${group.level} cards must clear the 70px green header with a 4px gap`);
});
assert(!game.nativeTemplateAdSlot && !game.renderedNativeTemplateAdSlot, "survival catalog should not insert a native ad into the reading flow");
assert(game.renderedSurvivalCards.some((card) => card.unlocked && card.stock === 1), "standalone survival screen should surface owned exchange stock");
assert(game.renderedSurvivalCards.every((card) => card.imageDominant && card.imageSize >= 60 && card.summaryLines === 1 && card.disclosure === "detail-modal"), "survival cards should prioritize art and defer long copy to a detail modal");
assert(new Set(game.renderedSurvivalCards.map((card) => card.materialIconId)).size === visibleMaterials.length, "each visible survival material should keep a distinct icon identity");
assert(game.renderedSurvivalCards.every((card) => card.iconSource === "cartoon-vector"), "survival icons should use the unified cartoon vector style");
const cutoutPixels = new Uint8ClampedArray(16 * 12 * 4);
for (let pixel = 0; pixel < cutoutPixels.length; pixel += 4) {
  cutoutPixels[pixel] = 255;
  cutoutPixels[pixel + 1] = 246;
  cutoutPixels[pixel + 2] = 210;
  cutoutPixels[pixel + 3] = 255;
}
const objectPixel = (2 * 16 + 2) * 4;
cutoutPixels[objectPixel] = 82;
cutoutPixels[objectPixel + 1] = 55;
cutoutPixels[objectPixel + 2] = 28;
const downloadedAtlas = { loaded: true, width: 16, height: 12 };
game.runtime.createOffscreenCanvas = ({ width, height }) => ({
  width,
  height,
  getContext() {
    return {
      clearRect() {},
      drawImage() {},
      getImageData() { return { data: cutoutPixels }; },
      putImageData() {}
    };
  }
});
const cutoutAtlas = game.prepareWildernessMaterialCutoutAtlas(downloadedAtlas);
assert(cutoutAtlas && game.wildernessMaterialCutoutStatus === "ready", "downloaded wilderness art should be converted into a cached transparent atlas");
assert(cutoutPixels[3] === 0 && cutoutPixels[objectPixel + 3] === 255, "paper-colored atlas pixels should become transparent without erasing the material itself");
game.art.wildernessMaterials = downloadedAtlas;
game.drawSurvival(game.ctx);
assert(game.renderedSurvivalCards.every((card) => card.iconSource === "cartoon-vector"), "downloaded realistic art should not override the unified cartoon material style");
assert(game.renderedSurvivalCards.every((card) => card.transparentArtwork), "cartoon material artwork should render as clean shapes without a photo backdrop");
const lockedSurvivalCard = game.renderedSurvivalCards.find((card) => !card.unlocked);
assert(lockedSurvivalCard, "survival fixture should include a locked material card");
const lockedSurvivalHit = game.hitAreaAt(
  lockedSurvivalCard.cta.x + lockedSurvivalCard.cta.w / 2,
  lockedSurvivalCard.cta.y + lockedSurvivalCard.cta.h / 2 - game.scrollY
);
assert(lockedSurvivalHit && typeof lockedSurvivalHit.onTap === "function", "locked survival CTA must remain clickable");
lockedSurvivalHit.onTap();
assert(game.infoDetailModal && game.infoDetailModal.kind === "wildernessKnowledgeLockedItem", "locked survival CTA must explain its discovery conditions");
assert(typeof game.infoDetailModal.action === "function", "locked survival item must offer a dice exploration action");
game.infoDetailModal.action();
assert(game.infoDetailModal && game.infoDetailModal.kind === "materialExploration" && game.infoDetailModal.targetId === lockedSurvivalCard.id, "去探索必须带着指定生存素材进入掷骰");
game.infoDetailModal = null;
assert(!game.renderedSurvivalTradePanel, "survival catalog must not keep a separate exchange settings panel");
assert(game.renderedSurvivalMailbox && game.renderedSurvivalMailbox.inboxCount === 1 && game.renderedSurvivalMailbox.outboxCount === 1 && game.renderedSurvivalMailbox.progressiveDisclosure, "survival should expose compact inbox and outbox buttons without expanding history over the catalog");
assert(game.wildernessTradeMailboxRecords("outbox").length === 1, "server-only legacy receipts must not inflate the confirmed outgoing exchange count");
game.openWildernessTradeMailbox("inbox", false);
assert(game.infoDetailModal && game.infoDetailModal.kind === "wildernessTradeMailbox" && /交换收件箱/.test(game.infoDetailModal.title) && /我方付出/.test(JSON.stringify(game.infoDetailModal.items)), "the inbox should show received material, sender and receiver payment");
assert(/已领取入库/.test(JSON.stringify(game.infoDetailModal.items)), "claimed inbox materials should never remain marked as waiting");
game.infoDetailModal.choices[1].action();
assert(/交换发件箱/.test(game.infoDetailModal.title) && /送出/.test(JSON.stringify(game.infoDetailModal.items)) && /得到/.test(JSON.stringify(game.infoDetailModal.items)) && /共护/.test(JSON.stringify(game.infoDetailModal.items)), "the outbox should show sent material, recipient and concrete reward");
assert(/物资交换往来 · 1 条/.test(game.infoDetailModal.kicker) && !/旧版保护区/.test(JSON.stringify(game.infoDetailModal.items)), "one locally confirmed send should render exactly one outbox record even when the server returns older unmatched rows");
game.hitAreas = [];
game.drawInfoDetailModal();
const mailboxCards = game.infoDetailModal.renderedInfoItems || [];
assert(mailboxCards.length > 0 && mailboxCards.length <= 4, "mailbox should keep a readable number of records inside one phone viewport");
assert(mailboxCards.every((card) => card.layout && card.layout.stackedTag
  && card.layout.tagBounds.y + card.layout.tagBounds.h < card.layout.titleBounds.y
  && (!card.layout.bodyBounds || card.layout.titleBounds.y + card.layout.titleBounds.h < card.layout.bodyBounds.y)),
"mailbox record metadata, trade title and reward must occupy separate non-overlapping rows");
game.openWildernessKnowledgeItem(exploration.survivalFind.id);
assert(game.infoDetailModal && /安全边界/.test(JSON.stringify(game.infoDetailModal.items)), "survival knowledge detail should always show a safety boundary");
assert(game.infoDetailModal.expandableItems && game.infoDetailModal.items.length === 3 && /点击卡片查看更多/.test(game.infoDetailModal.footer), "survival detail should lead with three expandable summary cards");
assert(/物件故事/.test(JSON.stringify(game.infoDetailModal.items)) && /生态影响/.test(JSON.stringify(game.infoDetailModal.items)) && /未解线索/.test(JSON.stringify(game.infoDetailModal.items)), "survival detail should expose story, reserve consequence and foreshadow layers");
assert(game.infoDetailModal.actionLabel === "关闭" && /沙盘求援或排行榜/.test(JSON.stringify(game.infoDetailModal.items)), "owned material detail should point to sandbox and leaderboard exchange, not a third catalog entry");
const lockedItem = WILDERNESS_FIND_CATALOG.find((item) => item.id !== exploration.survivalFind.id);
game.openWildernessKnowledgeItem(lockedItem.id);
assert(game.infoDetailModal && game.infoDetailModal.kind === "wildernessKnowledgeLockedItem" && /剧情门槛/.test(JSON.stringify(game.infoDetailModal.items)) && /数值门槛/.test(JSON.stringify(game.infoDetailModal.items)), "locked survival cards should explain their story and reserve-value activation instead of a random condition");
game.setScreen("animalworld");
assert(game.screen === "collection" && game.discoveryTab === "population", "legacy population routes should enter the population tab inside Discovery");

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function checkWechatFriendTradeBridge() {
  const pendingFriend = {
    id: "cloud_pending-friend-id",
    name: "微信同玩好友 1",
    valuation: 0,
    rating: 0,
    registered: false,
    simulated: false,
    scope: "friends",
    source: "wechat"
  };
  const cloud = {
    friendStatus: "ready",
    friendRows: [pendingFriend],
    friendRelationCount: 1,
    friendMatchedCount: 0,
    friendPendingCount: 1,
    capabilityReady: false,
    feature(name) { return name === "socialTrade" || (name === "reciprocalTrade" && this.capabilityReady); },
    config() { return {}; },
    track() {},
    refreshConfig() { this.capabilityReady = true; return Promise.resolve({ version: 3 }); },
    claimTradeInbox() { return Promise.resolve([]); },
    refreshRelationFriends() { return Promise.resolve(this.friendRows); }
  };
  game.cloudService = cloud;
  game.wechatFriends = { status: "ready" };
  game.selectedRivalId = "";
  game.selectedRival = () => pendingFriend;
  game.screen = "league";
  game.openWildernessTradeCenter(exploration.survivalFind.id, "friends");
  assert(game.infoDetailModal && game.infoDetailModal.kind === "friendAidRequest", "leaderboard exchange should open the same auto request as the sandbox");
  assert(game.infoDetailModal.namedFriendExchange, "好友榜必须点名求援");
  assert(/我拥有/.test(JSON.stringify(game.infoDetailModal.items)), "the request must show owned surplus");
  assert((game.infoDetailModal.wantOptions || []).length >= 2, "好友榜必须给出可选缺口");
  assert(/微信同玩好友 1/.test(game.infoDetailModal.title), "好友榜必须点名当前选中的人");
  const stockBefore = wildernessKnowledgeSummary(game.state.world.reserve).state.tradeStock[exploration.survivalFind.id];
  const pickedWant = game.infoDetailModal.wantOptions[1] || game.infoDetailModal.wantOptions[0];
  assert(game.selectFriendExchangeWant(pickedWant.id));
  assert(game.confirmFriendAidRequest(), "named friend request should complete after a shortage is chosen");
  assert(game.state.world.reserve.friendAid.incoming.itemId === pickedWant.id, "named request must send the chosen shortage");
  assert(game.infoDetailModal && game.infoDetailModal.kind === "friendAidLetter" && /交换结果/.test(game.infoDetailModal.kicker), "matched exchange should show the result letter");
  assert(wildernessKnowledgeSummary(game.state.world.reserve).state.tradeStock[exploration.survivalFind.id] === stockBefore - 1, "auto request must spend one owned item");

  assert(game.confirmOpenFriendAidParcel(), "confirming the result should clear the received parcel");
  cloud.friendRows = [];
  cloud.friendRelationCount = 0;
  cloud.friendPendingCount = 0;
  game.selectedRival = () => null;
  game.screen = "home";
  const knowledge = game.state.world.reserve.wildernessKnowledge || (game.state.world.reserve.wildernessKnowledge = {});
  const npcGameStock = knowledge.tradeStock || (knowledge.tradeStock = {});
  npcGameStock.resin_tinder = Math.max(2, Number(npcGameStock.resin_tinder) || 0);
  game.openFriendAidRequestModal();
  assert(game.infoDetailModal && game.infoDetailModal.kind === "friendAidRequest", "sandbox request stays available when real players are missing");
  assert(/巡护员/.test(JSON.stringify(game.infoDetailModal.items)), "empty live match set should fall back to an npc ranger");
}

checkWechatFriendTradeBridge().then(() => {
  console.log("wilderness knowledge check ok");
}).catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
