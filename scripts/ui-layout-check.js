const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { getUnlockedSpecies } = require("../js/animalWorld");

function mockContext() {
  const gradient = { addColorStop() {} };
  return {
    save() {},
    restore() {},
    scale() {},
    translate() {},
    rotate() {},
    clearRect() {},
    fillRect() {},
    drawImage() {},
    beginPath() {},
    closePath() {},
    rect() {},
    clip() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    arc() {},
    arcTo() {},
    ellipse() {},
    fill() {},
    stroke() {},
    setLineDash() {},
    fillText() {},
    measureText(text) { return { width: String(text || "").length * 6 }; },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    set fillStyle(value) { this._fillStyle = value; },
    get fillStyle() { return this._fillStyle; },
    set strokeStyle(value) { this._strokeStyle = value; },
    get strokeStyle() { return this._strokeStyle; },
    set lineWidth(value) { this._lineWidth = value; },
    get lineWidth() { return this._lineWidth; },
    set font(value) { this._font = value; },
    get font() { return this._font || "12px sans-serif"; },
    set textAlign(value) { this._textAlign = value; },
    get textAlign() { return this._textAlign || "left"; },
    set textBaseline(value) { this._textBaseline = value; },
    get textBaseline() { return this._textBaseline || "alphabetic"; },
    set globalAlpha(value) { this._globalAlpha = value; },
    get globalAlpha() { return this._globalAlpha == null ? 1 : this._globalAlpha; }
  };
}

const game = new Game();
game.ctx = mockContext();
game.width = 375;
game.height = 667;

game.state = createCharacter(null, "保护区卫士");
game.selectedRegionId = game.defaultRegionId();
game.selectedTarget = game.state.world.knownCharacters[0];
game.speakingAnimalId = game.selectedTarget.id;

if (game.navHeight() !== 62) {
  throw new Error("bottom nav height changed unexpectedly");
}

game.contentHeight = 0;
game.screen = "home";
game.bottom(500);
if (game.contentHeight < 500 + game.navHeight() + 20) {
  throw new Error("bottom safe inset is not reserved");
}

let reserve = game.state.world.reserve || {};
const scoutCards = game.patrolTaskChangeCards("houndScout", reserve, { canRun: true });
if ((game.primaryPatrolTaskChange("houndScout", scoutCards, { canRun: true }) || {}).label !== "偷猎") {
  throw new Error("hound scout modal should foreground poaching reduction instead of intel gain");
}
const scoutLayout = game.patrolTaskFocusLayout("houndScout", scoutCards, { canRun: true });
if (!scoutLayout || scoutLayout.focusCards.map((item) => item.label).join("/") !== "偷猎/发现/猎犬经验") {
  throw new Error("hound scout modal should foreground three numeric outcomes");
}
if (!scoutLayout.focusCards.filter((item) => item.label !== "发现").every((item) => /\d/.test(item.value) && (/→/.test(item.value) || /^\+\d/.test(item.value)))) {
  throw new Error("hound scout numeric outcomes should expose concrete before/after changes");
}
if (!scoutLayout.summary || scoutLayout.summary.label !== "消耗" || !/→/.test(scoutLayout.summary.value)) {
  throw new Error("hound scout modal should demote dog food consumption to a numeric cost summary");
}
const salvageCards = game.patrolTaskChangeCards("salvage", reserve, { canRun: true });
const salvagePrimary = game.primaryPatrolTaskChange("salvage", salvageCards, { canRun: true });
const salvageFocus = salvageCards.filter((item) => item !== salvagePrimary).map((item) => item.label);
if (!["移交", "研究需求", "样本"].every((label) => salvageFocus.includes(label))) {
  throw new Error("salvage modal should foreground transfer, research demand and sample-source facts");
}
const habitatCards = game.patrolTaskChangeCards("habitat", reserve, { canRun: true });
const habitatLayout = game.patrolTaskFocusLayout("habitat", habitatCards, { canRun: true });
if (!habitatLayout || habitatLayout.focusCards.map((item) => item.label).join("/") !== "水源/草场/迁移") {
  throw new Error("habitat modal should foreground water, grass and migration together");
}
if (!habitatLayout.summary || habitatLayout.summary.label !== "消耗") {
  throw new Error("habitat modal should demote fund consumption to the compact cost summary");
}
const antiPoacherCards = game.patrolTaskChangeCards("antiPoacher", reserve, { canRun: true });
const antiPoacherPrimary = game.primaryPatrolTaskChange("antiPoacher", antiPoacherCards, { canRun: true });
if (!antiPoacherPrimary || antiPoacherPrimary.label !== "偷猎" || !/\d+→\d+~\d+/.test(antiPoacherPrimary.value || "")) {
  throw new Error("anti-poacher modal should foreground a concrete poaching before/after range");
}
const interventionCards = game.patrolTaskChangeCards("intervention", reserve, { canRun: true });
const interventionPrimary = game.primaryPatrolTaskChange("intervention", interventionCards, { canRun: true });
if (!interventionPrimary || interventionPrimary.label !== "草场" || !/\d+→\d+~\d+/.test(interventionPrimary.value || "")) {
  throw new Error("intervention modal should foreground a concrete grass recovery range");
}
reserve.ecology.disease = 40;
const outbreakCards = game.patrolTaskChangeCards("intervention", reserve, { canRun: true });
if ((game.primaryPatrolTaskChange("intervention", outbreakCards, { canRun: true }) || {}).label !== "疾病") {
  throw new Error("intervention modal should foreground disease during an outbreak");
}
reserve.ecology.disease = 10;
if (!/保护区$/.test(game.reserveDisplayName(reserve)) || /\d{4}号/.test(game.reserveDisplayName(reserve))) {
  throw new Error("home info dock title should use a named reserve rather than a random serial");
}
reserve.base.name = "金合欢王冠保护区";
if (game.reserveDisplayName(reserve) !== "自然保护区") throw new Error("unauthorized players should see the generic reserve name");
game.state.userProfile = { nickName: "保护区卫士", authorized: true };
if (game.reserveDisplayName(reserve) !== "保护区卫士的自然保护区") throw new Error("authorized players should see nickname-based reserve name");
game.hitAreas = [];
game.infoDetailModal = null;
game.scrollY = 0;
const dockY = game.homeHeroTop(); game.drawSandboxInfoDock(game.ctx, 18, dockY, game.width - 36);
if (!game.renderedSandboxInfoDock || !game.renderedSandboxInfoDock.titleClickable || game.renderedSandboxInfoDock.affordance !== "进度 ›" || game.renderedSandboxInfoDock.mode !== "chapter-progress") {
  throw new Error("lower home HUD should expose chapter progress after reserve identity moves to the primary strip");
}
if (game.renderedSandboxInfoDock.stateMode !== "read-only-risk") {
  throw new Error("fund/water/grass should be rendered as a read-only risk dashboard");
}
if (game.renderedSandboxInfoDock.standaloneGoalRow !== false
  || game.renderedSandboxInfoDock.primaryGoalMergedInto !== "map-opportunity-aggregate") {
  throw new Error("home HUD should merge the primary goal into More Clues instead of rendering a third guidance row");
}
if (!Array.isArray(game.renderedSandboxStateTiles) || game.renderedSandboxStateTiles.length !== 6) {
  throw new Error("home HUD should render two rows of three state tiles");
}
if (game.renderedSandboxStateTiles.map((tile) => tile.label).join("/") !== "基金/水源/草场/游客/种群数量/动物总数"
  || game.renderedSandboxStateTiles.slice(0, 3).some((tile) => tile.percentage !== null)
  || game.renderedSandboxStateTiles.slice(3).some((tile) => typeof tile.percentage !== "number" || !tile.inline)) {
  throw new Error("home HUD metrics should use the two-row order and show chapter percentages on row two");
}
if (game.renderedSandboxStateTiles.map((tile) => tile.icon).join("/") !== "fund/water/grass/people/paw/paw") {
  throw new Error("home HUD should use a human icon for visitors and animal paw icons for the two animal metrics");
}
const animalTile = game.renderedSandboxStateTiles.find((tile) => tile.id === "animalTotal");
if (!animalTile
  || animalTile.value !== game.renderedSandboxInfoDock.coreMetrics.animals
  || animalTile.progressText !== `${game.renderedSandboxInfoDock.coreMetrics.animals}/${game.renderedSandboxInfoDock.coreGoals.animals}`
  || animalTile.animationKey !== "chapterAnimalTotal") {
  throw new Error("home animal card must display the chapter animal progress, not the whole living herd");
}
if (game.renderedSandboxStateTiles.some((tile) => !tile.readOnly || !tile.detailOnly || !tile.risk
  || !tile.clickable
  || tile.affordance !== (["warn", "bad"].includes(tile.riskTone) ? "改善 ›" : "查看 ›"))) {
  throw new Error("fund/water/grass state tiles should always open details while only abnormal states request improvement");
}
const dashboardStateBefore = { fund: reserve.fund, water: reserve.ecology.water, grass: reserve.ecology.grass };
[
  { x: 58, tileX: 32, state: { id: "fund", label: "基金", value: 0, tone: "bad" }, title: /保护基金/, prepare: () => { reserve.fund = 0; reserve.guardianCycle.day = 2; reserve.emergencyFundAd = {}; } },
  { x: 188, tileX: 138, state: { id: "water", label: "水源", value: 30, tone: "bad" }, title: /水源/, prepare: () => { reserve.ecology.water = 30; } },
  { x: 298, tileX: 244, state: { id: "grass", label: "草场", value: 30, tone: "bad" }, title: /草场/, prepare: () => { reserve.ecology.grass = 30; } }
].forEach((sample) => {
  game.infoDetailModal = null;
  game.hitAreas = [];
  sample.prepare();
  game.reserveViewRenderCache = null;
  game.drawCompactReserveStateTile(game.ctx, sample.state, sample.tileX, dockY + 25, 100, 32);
  game.handleTap(sample.x, dockY + 46);
  if (sample.state.id === "fund") {
    if (!game.infoDetailModal || !/保护基金/.test(game.infoDetailModal.title || "")) {
      throw new Error("fund tile should preserve the original fund detail interface");
    }
  } else if (!game.infoDetailModal || !sample.title.test(game.infoDetailModal.title || "")) {
    throw new Error("water/grass tiles should open their matching data details");
  } else if (!game.infoDetailModal.readOnly && typeof game.infoDetailModal.action !== "function") {
    throw new Error("abnormal water/grass details must explain the risk or expose a recovery action");
  }
  game.scrollY = 0;
});
reserve.ecology.water = 82;
reserve.ecology.grass = 84;
reserve.fund = 2400;
game.reserveViewRenderCache = null;
game.infoDetailModal = null;
game.hitAreas = [];
game.drawCompactReserveStateTile(game.ctx, { id: "water", label: "水源", value: 82, tone: "good" }, 138, dockY + 25, 100, 32);
game.handleTap(188, dockY + 46);
if (!game.infoDetailModal || !/水源/.test(game.infoDetailModal.title || "")) {
  throw new Error("stable dashboard metrics should remain clickable and open their matching detail");
}
game.infoDetailModal = null;
game.hitAreas = [];
game.drawCompactReserveStateTile(game.ctx, { id: "fund", label: "基金", value: 2400, tone: "good" }, 32, dockY + 25, 100, 32);
game.handleTap(58, dockY + 46);
if (!game.infoDetailModal || !/保护基金/.test(game.infoDetailModal.title || "")) {
  throw new Error("stable fund tile should remain clickable and open fund detail");
}
reserve.fund = dashboardStateBefore.fund;
reserve.ecology.water = dashboardStateBefore.water;
reserve.ecology.grass = dashboardStateBefore.grass;
game.reserveViewRenderCache = null;
game.infoDetailModal = null;
game.hitAreas = [];
game.handleTap(58, 438);
if (game.infoDetailModal && /天气|边界安全|安全变薄|水线变紧|饮水点会变成风险窗口/.test(`${game.infoDetailModal.title || ""} ${game.infoDetailModal.kicker || ""}`)) {
  throw new Error("removed redundant environment broadcast should not remain in the home detail stream");
}
const expectedDockHeight = 78;
if (game.sandboxInfoDockHeight() !== expectedDockHeight) {
  throw new Error("sandbox info dock should fit two rows of three inline metrics");
}
game.hitAreas = [];
game.drawReserveIdentityPill(game.ctx, 12, 12, game.width - 24, reserve);
if (!game.renderedHomeIdentityPill || game.renderedHomeIdentityPill.mode !== "reserve-identity" || game.renderedHomeIdentityPill.displayName !== "保护区卫士的自然保护区" || game.renderedHomeIdentityPill.affordance !== "好友榜 ›" || !game.renderedHomeIdentityPill.rankClickable || !game.renderedHomeIdentityPill.audioButton || game.renderedHomeIdentityPill.friendAudioGap < 6 || game.renderedHomeIdentityPill.rankButton.x >= game.renderedHomeIdentityPill.audioButton.x || !game.renderedHomeIdentityPill.avoidsSystemMenu) {
  throw new Error("primary home strip should place the friend ranking left of a visible audio toggle without overlapping the WeChat menu capsule");
}
const originalMenuButtonRect = game.menuButtonRect;
[
  { width: 320, menuLeft: 226 },
  { width: 375, menuLeft: 282 },
  { width: 430, menuLeft: 335 }
].forEach((viewport) => {
  game.width = viewport.width;
  game.menuButtonRect = { left: viewport.menuLeft, right: viewport.menuLeft + 82, top: 6, bottom: 38, width: 82, height: 32 };
  game.hitAreas = [];
  game.drawReserveIdentityPill(game.ctx, 12, 12, viewport.width - 24, reserve);
  const header = game.renderedHomeIdentityPill;
  if (!header.audioButton || header.rankButton.x + header.rankButton.w + 6 > header.audioButton.x
    || header.audioButton.x + header.audioButton.w > header.menuSafeLeft - 8
    || !game.hitAreas.some((hit) => hit.w >= 32 && hit.h >= 32 && hit.x <= header.audioButton.x && hit.x + hit.w >= header.audioButton.x + header.audioButton.w)) {
    throw new Error(`home header audio toggle is clipped or crowded at ${viewport.width}px`);
  }
});
game.width = 375;
game.menuButtonRect = originalMenuButtonRect;
game.screen = "league";
game.leagueScope = "friends";
game.scrollY = 20;
game.renderedWechatFriendRank = { rankReady: true, view: { x: 18, y: 100, w: 300, h: 236 } };
const friendRankPoint = game.wechatFriendRankTouchPoint(48, 110);
if (!friendRankPoint || friendRankPoint.x !== 30 || friendRankPoint.y !== 30 || game.wechatFriendRankTouchPoint(10, 110)) {
  throw new Error("friend ranking should convert only in-panel touches into open-data-local coordinates");
}
const originalHeight = game.height;
game.height = 568;
const compactFriendRankHeight = game.friendRankViewportHeight(112, true);
game.height = 844;
const tallFriendRankHeight = game.friendRankViewportHeight(112, true);
game.height = originalHeight;
if (compactFriendRankHeight !== 236 || tallFriendRankHeight <= compactFriendRankHeight || tallFriendRankHeight > 420) {
  throw new Error("friend ranking should keep the short-screen minimum and expand into unused tall-screen space");
}
const savedWechatFriends = game.wechatFriends;
const savedCloudService = game.cloudService;
const savedRender = game.render;
let requestedFriendRankSize = null;
game.wechatFriends = {
  isSupported() { return true; },
  syncReserve() { return true; },
  refresh(w, h) { requestedFriendRankSize = { w, h }; return true; }
};
game.cloudService = { feature() { return false; } };
game.render = () => {};
game.renderedWechatFriendRank = { view: { x: 30, y: 140, w: 315, h: 386 } };
game.requestWechatFriendAuthorization();
game.wechatFriends = savedWechatFriends;
game.cloudService = savedCloudService;
game.render = savedRender;
if (!requestedFriendRankSize || requestedFriendRankSize.w !== 315 || requestedFriendRankSize.h !== 386) {
  throw new Error("friend rank refresh should reuse the visible viewport instead of forcing and stretching a fixed-size canvas");
}
game.screen = "home";
game.scrollY = 0;
const cleanedView = game.normalizeReserveViewPresentation({
  states: [{ id: "ecology", subMetrics: [{ id: "water", label: "水源", value: 66, delta: -2 }] }],
  mapMarkers: [
    { id: "rv_2_water_0", title: "水线变紧", dialogue: "黑铃：这里好转了", type: "event" },
    { id: "rv_2_daily_recovery_1", title: "昨日恢复点", dialogue: "黑铃：这里好转了", type: "recovery" }
  ]
});
if (cleanedView.mapMarkers.length !== 1 || cleanedView.mapMarkers[0].presentation !== "resource-flow" || cleanedView.mapMarkers[0].dialogue || cleanedView.mapMarkers[0].delta !== -2) {
  throw new Error("legacy map resource markers should migrate to numeric, dialogue-free feedback without duplicate recovery points");
}
const cleanedMigration = game.normalizeReserveViewPresentation({
  states: [{ id: "safety", subMetrics: [{ id: "migration_line", label: "迁徙", value: 3, delta: 2 }] }],
  mapMarkers: [{ id: "rv_4_migration_in_0", title: "动物回流", dialogue: "黑铃：这里好转了", type: "recovery" }]
});
if (cleanedMigration.mapMarkers[0].metric !== "migration" || cleanedMigration.mapMarkers[0].presentation !== "resource-flow" || cleanedMigration.mapMarkers[0].dialogue || cleanedMigration.mapMarkers[0].flowKind !== "production") {
  throw new Error("migration recovery should render as a numeric flow instead of an elephant marker speaking as another animal");
}
game.renderedMapResourceFlows = [];
game.drawMapResourceFlow(game.ctx, cleanedView.mapMarkers[0], 120, 220, 1);
if (!game.renderedMapResourceFlows.length || game.renderedMapResourceFlows[0].grounded !== false || game.renderedMapResourceFlows[0].dialogue !== false) {
  throw new Error("map resource changes should render as lightweight numeric chips, not grounded animal actors");
}
const feedbackMarkers = [
  { presentation: "resource-flow", delta: -2, type: "event" },
  { presentation: "resource-flow", delta: 3, type: "recovery" }
];
const consumptionPhase = game.mapFeedbackCycle(feedbackMarkers, [{ id: "drop" }], 0);
const dialoguePhase = game.mapFeedbackCycle(feedbackMarkers, [{ id: "drop" }], 3000);
const productionPhase = game.mapFeedbackCycle(feedbackMarkers, [{ id: "drop" }], 8000);
const restPhase = game.mapFeedbackCycle(feedbackMarkers, [{ id: "drop" }], 11000);
if (consumptionPhase.phase !== "consumption" || dialoguePhase.phase !== "dialogue" || productionPhase.phase !== "production" || restPhase.phase !== "rest") {
  throw new Error("map feedback should rotate through consumption, animal response and production instead of stacking them");
}
game.infoDetailModal = null;

const prosperity = game.reserveProsperitySummary(reserve, game.state.world);
if (!prosperity.value || !prosperity.speciesCount || !prosperity.animalTotal) {
  throw new Error("home prosperity strip should expose reserve value, species and population");
}
const goalView = game.currentGoalView(true);
if ((goalView.alternatives || []).length > 2) {
  throw new Error("home should keep no more than two alternatives and may stay empty without a real trigger");
}

const dailyLetter = game.dailyAnimalLetter();
if (!dailyLetter.title || !dailyLetter.title.includes("来信") || !dailyLetter.quote || !dailyLetter.body) {
  throw new Error("daily animal letter should expose a compact playable message");
}
if (dailyLetter.animal && !dailyLetter.animalName) {
  throw new Error("daily animal letter should keep the speaker identity");
}
const postcard = game.buildForestPostcard();
if (!postcard.shareTitle || !postcard.text || !postcard.text.includes("水源") || !postcard.text.includes("草场") || !postcard.text.includes(dailyLetter.quote)) {
  throw new Error("forest postcard should combine animal quote with reserve data");
}
const postcardDetail = game.buildForestPostcardDetail();
if (!/森林分享卡/.test(postcardDetail.kicker || "") || postcardDetail.actionLabel !== "分享这一刻" || typeof postcardDetail.action !== "function") {
  throw new Error("forest postcard detail should expose a share action");
}
if (!postcardDetail.items || postcardDetail.items.length < 4 || !postcardDetail.items.some((item) => item.tag === "好友接力")) {
  throw new Error("forest postcard detail should include moment, status, image, and friend assistance");
}
game.hitAreas = [];
game.scrollY = 0;
game.dailyHeroExpanded = true;
const heroHeight = game.drawHomeHero(game.ctx, game.state.world, game.state.world.time || {});
if (heroHeight < 150) {
  throw new Error("expanded daily letter hero should leave room for quote and share button");
}
const heroShareHit = game.hitAreas.find((hit) => hit.x >= game.width - 112 && hit.w >= 80 && hit.h >= 40);
if (!heroShareHit) {
  throw new Error("expanded daily letter hero share button should be clickable");
}
game.infoDetailModal = null;
if (typeof heroShareHit.onTap !== "function") {
  throw new Error("expanded daily letter hero share hit should have a tap handler");
}
heroShareHit.onTap();
if (!game.infoDetailModal || !/森林分享卡/.test(game.infoDetailModal.kicker || "")) {
  throw new Error("daily letter hero share button should open forest postcard detail");
}
game.infoDetailModal = null;
game.dailyHeroExpanded = false;

function overlaps(a, b) {
  return a.x < b.right && a.x + a.w > b.left && a.y < b.bottom && a.y + a.h > b.top;
}

const oldInfo = game.info;
const oldMenuRect = game.menuButtonRect;
game.info = Object.assign({}, game.info || {}, {
  statusBarHeight: 44,
  safeArea: { top: 44 }
});
game.menuButtonRect = { left: 280, right: 365, top: 48, bottom: 80, width: 85, height: 32 };
if (game.homeHeroTop() <= game.menuButtonRect.bottom) {
  throw new Error("home hero should start below the WeChat capsule area");
}
game.hitAreas = [];
game.dailyHeroExpanded = false;
const shiftedHeroHeight = game.drawHomeHero(game.ctx, game.state.world, game.state.world.time || {});
if (shiftedHeroHeight <= 70) {
  throw new Error("home hero should report the extra safe-area height to following sections");
}
const collapsedShareHit = game.hitAreas.find((hit) => hit.x >= game.width - 100 && hit.w >= 60 && hit.h >= 40);
if (!collapsedShareHit || overlaps(collapsedShareHit, game.menuButtonRect)) {
  throw new Error("collapsed home hero share hit should avoid the WeChat capsule");
}
game.info = oldInfo;
game.menuButtonRect = oldMenuRect;

const brief = game.buildSandboxInfoDetail("brief");
const world = game.buildSandboxInfoDetail("world");
if (!brief.items || !brief.items.length || !world.items || !world.items.length) {
  throw new Error("brief/world detail modals should use list items");
}
if ((brief.items.length > 6) || (world.items.length > 6)) {
  throw new Error("detail list should stay compact");
}

const savedDetailRender = game.render;
game.render = () => {};
game.leagueScope = "world";
game.openLeaguePlayerDetail({
  id: "cloud_layout_player",
  name: "一位名字很长的真实玩家的苔原哨站",
  owner: "一位名字很长的真实玩家",
  reserveName: "苔原哨站",
  valuation: 5900,
  level: 3,
  shield: 42,
  animals: 39,
  style: "自营",
  profileComplete: true
}, 27);
game.render = savedDetailRender;
game.hitAreas = [];
game.drawInfoDetailModal();
const leagueDetailItems = (game.infoDetailModal && game.infoDetailModal.renderedInfoItems) || [];
const leagueProfileCard = game.infoDetailModal && game.infoDetailModal.renderedProfileCard;
if (!game.infoDetailModal.renderedPlayerAvatar || !leagueProfileCard
  || leagueProfileCard.modal.h > 545
  || leagueProfileCard.duplicateRankLine !== false
  || leagueDetailItems.length !== 3
  || leagueDetailItems.map((entry) => entry.item.label).join(",") !== "市值,等级,动物"
  || leagueDetailItems.some((entry) => !entry.layout.noTagTitleOverlap)) {
  throw new Error("league player detail should use the compact friend-style profile card without duplicate ranking text");
}
game.infoDetailModal = null;

reserve.fund = 520;
reserve.guardianCycle.day = 2;
reserve.emergencyFundAd = {};
const fundDetail = game.buildReserveMetricDetail("fund");
if (!fundDetail || fundDetail.readOnly || typeof fundDetail.action !== "function" || !/\+1000/.test(fundDetail.actionLabel || "")
  || !fundDetail.items || fundDetail.items.length !== 3 || fundDetail.items.some((item) => item.tag === "广告")) {
  throw new Error("fund detail should keep three useful data cards and one contextual chapter-scaled fund ad action");
}
["water", "grass"].forEach((type) => {
  const detail = game.buildReserveMetricDetail(type);
  if (!detail || !detail.readOnly || !detail.items || detail.items.length < 3) {
    throw new Error(`${type} reserve metric detail should expose useful list items`);
  }
});
game.hitAreas = [];
game.infoDetailModal = null;
game.scrollY = 0;
reserve.poacherPressure = 61;
reserve.ecology.water = 42;
reserve.ecology.grass = 41;
reserve.migration = { delta: 6, reason: "安全等级较高，周边动物迁入保护区" };
game.drawPatrolThreatBoard(game.ctx, 18, 176, game.width - 36, reserve);
if (game.hitAreas.length < 2 || game.renderedPatrolThreatBoard.readOnly || game.renderedPatrolThreatBoard.metrics !== 1) {
  throw new Error("patrol overview should expose close and the current urgent task");
}
if (!game.renderedPatrolThreatTiles[0] || game.renderedPatrolThreatTiles[0].clickable !== true) {
  throw new Error("high poacher pressure must be a real patrol entry, not a dead status card");
}
const alarmBeforeUrgent = reserve.supplies.alarm || 0;
game.handleTap(50, 240);
if (game.patrolTaskModal) {
  throw new Error("tapping the urgent poacher card must settle immediately, not open an intermediate page");
}
if ((reserve.supplies.alarm || 0) >= alarmBeforeUrgent && !game.settlementModal) {
  throw new Error("tapping the urgent poacher card must start drive-off settlement");
}
game.patrolTaskModal = null;
reserve = game.state.world.reserve || reserve;

game.hitAreas = [];
game.drawMaterialCompactHeader(game.ctx, 18, 520, game.width - 36, reserve);
if (game.hitAreas.length < 4) {
  throw new Error("material header should expose fund, supplies and community data cards");
}
game.handleTap(50, 580);
if (!game.infoDetailModal || game.infoDetailModal.title.indexOf("保护基金") < 0) {
  throw new Error("fund header card should open fund detail");
}
game.infoDetailModal = null;
game.hitAreas = [];
game.drawMaterialCompactHeader(game.ctx, 18, 520, game.width - 36, reserve);
game.handleTap(170, 580);
if (!game.infoDetailModal || game.infoDetailModal.title.indexOf("补给") < 0) {
  throw new Error("supply header card should open supply detail");
}
game.infoDetailModal = null;

game.hitAreas = [];
reserve.supplies.dogFood = 0;
reserve.supplies.alarm = 0;
reserve.fund = 5000;
game.scrollY = 0;
const layoutRender = game.render;
game.render = () => {};
game.drawSupplyDepot(game.ctx, 18, 700, game.width - 36, reserve);
const depotFund = reserve.fund;
game.handleTap(300, 720);
if (game.patrolTaskModal || !(reserve.fund < depotFund)) {
  throw new Error("supply depot header should spend fund and restock shortages");
}
reserve.supplies.dogFood = 0;
reserve.supplies.alarm = 0;
reserve.fund = 5000;
game.hitAreas = [];
game.drawStickySuppliesHeader(game.ctx, 18, 100, game.width - 36, 66);
const stickyFund = reserve.fund;
game.handleTap(300, 120);
if (game.patrolTaskModal || !(reserve.fund < stickyFund)) {
  throw new Error("supply depot action should spend fund and restock shortages");
}
reserve.supplies.dogFood = 0;
reserve.supplies.alarm = 0;
reserve.fund = 5000;
game.infoDetailModal = null;
game.hitAreas = [];
game.drawSupplyDepot(game.ctx, 18, 700, game.width - 36, reserve);
game.handleTap(50, 770);
if (game.infoDetailModal || !(reserve.supplies.dogFood > 0) || !(reserve.fund < 5000)) {
  throw new Error("dog food supply card should buy with fund");
}
reserve.supplies.alarm = 0;
reserve.fund = 5000;
game.infoDetailModal = null;
game.hitAreas = [];
game.drawSupplyDepot(game.ctx, 18, 700, game.width - 36, reserve);
game.handleTap(270, 770);
if (game.infoDetailModal || !(reserve.supplies.alarm > 0)) {
  throw new Error("alarm supply card should buy with fund");
}
game.render = layoutRender;

game.hitAreas = [];
game.drawRecoveredGoods(game.ctx, 18, 960, game.width - 36, reserve);
if (!game.renderedRecoveredGoodsPanel || game.renderedRecoveredGoodsPanel.actionLabel !== "出售") {
  throw new Error("recovered goods header action should use the clear commerce label 出售");
}
game.handleTap(300, 972);
if (!game.infoDetailModal || game.infoDetailModal.kind !== "recoveredChoice") {
  throw new Error("recovered goods action should first ask for immediate transfer, appraisal or case use");
}
game.infoDetailModal = null;
game.hitAreas = [];
game.drawRecoveredGoods(game.ctx, 18, 960, game.width - 36, reserve);
game.handleTap(50, 1080);
if (!game.infoDetailModal || game.infoDetailModal.kicker !== "守护样本") {
  throw new Error("recovered goods row should open material detail");
}
const goodsDetailText = JSON.stringify(game.infoDetailModal.items || []);
if (!/探索/.test(goodsDetailText) || !/出售/.test(goodsDetailText) || /"tag":"操作"/.test(goodsDetailText)) {
  throw new Error("recovered goods detail should keep exploration and sale, without a redundant action row");
}
game.infoDetailModal = null;
game.hitAreas = [];
game.drawMarketPanel(game.ctx, 18, 1180, game.width - 36, reserve);
game.handleTap(50, 1240);
if (!game.infoDetailModal || game.infoDetailModal.kicker !== "今日项目拨款") {
  throw new Error("project funding card should open material detail");
}
game.infoDetailModal = null;
game.state.world.knownCharacters.slice(0, 5).forEach((animal) => {
  const lines = game.animalRecentDialogues(animal, 4);
  if (lines.length < 3 || lines.length > 5) {
    throw new Error("animal recent dialogues should show 3-5 lines");
  }
  if (lines.some((line) => !line || line.length > 29)) {
    throw new Error("animal recent dialogue line should stay compact");
  }
});
game.state.world.knownCharacters.forEach((animal, index) => {
  game.drawAnimalAvatar(game.ctx, animal, 40 + (index % 4) * 60, 40 + Math.floor(index / 4) * 60, 48, index === 0);
});
game.hitAreas = [];
game.infoDetailModal = null;
game.scrollY = 0;
game.drawReserveOverview(game.ctx, 12, 420, game.width - 24, 620);
const valueHits = game.hitAreas.filter((hit) => hit.y >= 430 && hit.y <= 466 && hit.h === 36);
if (valueHits.length !== 2) {
  throw new Error(`reserve overview should expose exactly level/value cards, got ${valueHits.length}`);
}
game.handleTap(40, 440);
if (!game.infoDetailModal || game.infoDetailModal.kind !== "chapterProgress"
  || !game.infoDetailModal.core || !game.infoDetailModal.core.target) {
  throw new Error("reserve overview chapter card should open the current chapter targets");
}
game.infoDetailModal = null;
game.hitAreas = [];
game.drawReserveOverview(game.ctx, 12, 420, game.width - 24, 620);
game.handleTap(230, 440);
if (!game.infoDetailModal || game.infoDetailModal.layout !== "metricDashboard"
  || !(game.infoDetailModal.heroMetrics || []).some((metric) => metric.label === "市值" && Number(metric.value) > 0)
  || !(game.infoDetailModal.heroMetrics || []).some((metric) => metric.label === "物种")
  || !(game.infoDetailModal.heroMetrics || []).some((metric) => metric.label === "动物")) {
  throw new Error("reserve overview value card should expose valuation, species and animal totals as primary metrics");
}

const firstSpecies = getUnlockedSpecies(1)[0];
game.openSpeciesProfile(firstSpecies.id);
if (!game.infoDetailModal || game.infoDetailModal.kind !== "speciesProfile") {
  throw new Error("animal list should open species details in a modal");
}
if (game.infoDetailModal.title !== firstSpecies.name || !game.infoDetailModal.profile || !Array.isArray(game.infoDetailModal.profile.friends)) {
  throw new Error("species modal should keep live population, narrative and named friends together");
}
game.infoDetailModal = null;

const settlementModal = {
  title: "驱赶偷猎者 · 西部岩坡洞域",
  summary: "漂亮，偷猎压力被压下 19 点。有 6 只动物愿意靠近保护区。",
  grade: "S",
  guardianScore: 91,
  scoreDelta: 36,
  day: 8,
  weather: "阴",
  location: "西部岩坡洞域",
  stats: [
    { label: "安全指数", after: 80, delta: 18 },
    { label: "水源指数", after: 68, delta: 4 },
    { label: "偷猎压力", after: 12, delta: -19, inverse: true },
    { label: "迁移指数", after: 6, delta: 6 }
  ],
  rewards: ["今日目标完成：守护分奖励已结算", "动物迁入 +6：保护区吸引力提升", "消耗/补给：警报器 -1 / 回收物：追回机关 +1"],
  nextHint: "明日建议：局面不错，回沙盘点动物再决定下一步。",
  speaker: "沉牙狼",
  speech: "巡护后，风贴着泥走。我先省点体力，再闻一遍边界。"
};
const modalX = 18;
const modalY = 24;
const modalW = game.width - 36;
const modalH = Math.min(610, game.height - 52);
const settlementLayout = game.settlementModalLayout(game.ctx, settlementModal, modalX, modalY, modalW, modalH, modalH < 620);
const compactRewardLines = game.settlementRewardDisplayLines(Object.assign({}, settlementModal, {
  returnScreen: "action",
  rewards: [
    "收益：目标奖励 / 安全 +18 / 偷猎 -19 / 迁入 +6",
    "代价：警报器检查",
    "明日影响：这是一条非常长的建议，会挤压奖励框并遮挡下一行内容"
  ]
}), true);
if (compactRewardLines.length > 2 || compactRewardLines.some((line) => /^明日影响/.test(line))) {
  throw new Error("compact settlement reward panel should keep tomorrow hint out of reward card");
}
const titleBottom = settlementLayout.title.y + settlementLayout.title.lines.length * settlementLayout.title.lineHeight - 4;
if (settlementLayout.badge.y + settlementLayout.badge.h > settlementLayout.summary.y) {
  throw new Error("settlement badge overlaps summary card");
}
if (titleBottom > settlementLayout.summary.y) {
  throw new Error("settlement title overlaps summary card");
}
[
  ["summary", settlementLayout.summary],
  ["scene", settlementLayout.scene],
  ["stats", { y: settlementLayout.stats.y, h: settlementLayout.stats.gap + settlementLayout.stats.h }],
  ["reward", settlementLayout.reward],
  ["next", settlementLayout.next],
  ["speech", settlementLayout.speech],
  ["buttons", settlementLayout.buttons]
].reduce((prev, current) => {
  if (prev && prev[1].y + prev[1].h > current[1].y) {
    throw new Error(`settlement ${prev[0]} overlaps ${current[0]}`);
  }
  return current;
}, null);

["home", "action", "social", "league", "role"].forEach((screen) => {
  game.screen = screen;
  game.scrollY = 0;
  game.render();
  if (game.contentHeight < game.height - game.navHeight()) {
    throw new Error(`${screen} content height did not reserve navigation space`);
  }
});

console.log("ui layout check ok");
