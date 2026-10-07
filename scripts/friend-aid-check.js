const assert = require("assert");

function fakeContext() {
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
  createCanvas() { return { width: 375, height: 667, getContext() { return fakeContext(); } }; },
  createImage() { return { loaded: true, complete: true }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { UNLOCK_DELAY_MS, chapterSpecialStatus } = require("../js/chapterSpecialSystem");
const { wildernessKnowledgeSummary, noteSandboxExchangeItem, EXCHANGE_ICON_GAP_MS } = require("../js/wildernessKnowledge");
const { chapterVisitorTotal } = require("../js/chapterTargets");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { animalSourceSummary } = require("../js/animalSourceLedger");
const {
  sendFriendAidRequest,
  openFriendAidParcel,
  applyFriendAidOnSpecial,
  settlePendingFriendAid,
  friendAidStatus,
  FRIEND_AID_FALLBACK_MS,
  namedAlly,
  friendAidMarkers
} = require("../js/friendAidSystem");

function seedStock(reserve, amount = 2, now = Date.now()) {
  reserve.wildernessKnowledge = Object.assign({}, reserve.wildernessKnowledge || {}, {
    tradeStock: Object.assign({}, (reserve.wildernessKnowledge || {}).tradeStock || {}, { resin_tinder: amount })
  });
  noteSandboxExchangeItem(reserve, "resin_tinder", now);
}

function makeGame() {
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, "求援测试");
  seedStock(game.state.world.reserve, 2);
  game.cloudService = { friendRows: [] };
  game.wechatFriends = { friendRows: [] };
  game.render = () => {};
  game.toast = () => {};
  game.playSfx = () => {};
  game.reserveViewRenderCache = null;
  game.screen = "home";
  game.selectedRival = () => null;
  return game;
}

assert.strictEqual(namedAlly([]).name, "阿澈", "没有微信好友时应匹配巡护员阿澈");
assert.strictEqual(namedAlly([{ id: "world_1", name: "世界保护区", simulated: true }]).name, "阿澈", "模拟世界玩家不得抢真实匹配");
assert.strictEqual(namedAlly([{ id: "friend_9", owner: "林岚", simulated: false }]).name, "林岚", "有真实玩家时必须匹配真实玩家");

function freezeLedgers(reserve) {
  return {
    visitors: chapterVisitorTotal(reserve),
    animals: livingAnimalTotal(reserve),
    breeding: animalSourceSummary(reserve).breeding,
    immigrated: animalSourceSummary(reserve).immigrated,
    advertised: animalSourceSummary(reserve).advertised,
    shared: animalSourceSummary(reserve).shared
  };
}

function assertLedgersUntouched(reserve, before, message) {
  const after = freezeLedgers(reserve);
  assert.deepEqual(after, before, message);
}

const game = makeGame();
assert(game.openFriendAidRequestModal(), "沙盘求援标记应打开发出需求弹窗");
assert.strictEqual(game.infoDetailModal.kind, "friendAidRequest");
assert(/发出交换需求/.test(game.infoDetailModal.kicker), "求援文案必须写成发出交换需求");
assert(/我拥有/.test(JSON.stringify(game.infoDetailModal.items)) && /我缺乏/.test(JSON.stringify(game.infoDetailModal.items)), "需求必须展示拥有和缺乏");
const matchCard = (game.infoDetailModal.items || []).find((item) => item.tag === "自动匹配");
assert(matchCard && matchCard.title === "阿澈" && !matchCard.body, "自动匹配只显示昵称");
assert(!/真实玩家/.test(JSON.stringify(matchCard)), "自动匹配不得附加真实玩家解释");
const offerId = game.infoDetailModal.items[0].title.split(" ")[0];
const sandboxLedgers = freezeLedgers(game.state.world.reserve);
assert(game.confirmFriendAidRequest(), "发出求援后应进入交换结果");
assertLedgersUntouched(game.state.world.reserve, sandboxLedgers, "沙盘自动交换不得改写游客或动物账本");
assert.strictEqual(game.infoDetailModal.kind, "friendAidLetter");
assert.strictEqual(game.infoDetailModal.kicker, "收到 · 交换结果");
assert.strictEqual(game.state.world.reserve.friendAid.incoming.status, "sealed");
assert.strictEqual(game.normalizeReserveViewPresentation({ mapMarkers: [] }).mapMarkers[0].type, "friendAidParcel");
assert(/交换结果/.test(game.normalizeReserveViewPresentation({ mapMarkers: [] }).mapMarkers[0].label));
const knowledge = wildernessKnowledgeSummary(game.state.world.reserve).state;
assert(knowledge.tradeHistory.length >= 1, "求援必须写入发件箱");
assert(knowledge.incomingHistory.length >= 1, "匹配结果必须写入收件箱");
assert(knowledge.tradeStock.resin_tinder === 1, "求援应拿出一份拥有的素材");
assert(game.confirmOpenFriendAidParcel(), "确认收到后沙盘结果标记消失");
assert.strictEqual(game.state.world.reserve.friendAid.incoming.status, "opened");
assert(!game.normalizeReserveViewPresentation({ mapMarkers: [] }).mapMarkers.some((marker) => marker.type === "friendAidParcel"), "确认后沙盘不再显示收到包裹");

game.screen = "survival";
game.openWildernessTradeMailbox("outbox", false);
assert(/求援/.test(JSON.stringify(game.infoDetailModal.items)), "发件箱应展示发出的求援需求");
game.openWildernessTradeMailbox("inbox", false);
assert(/交换结果/.test(JSON.stringify(game.infoDetailModal.items)), "收件箱应展示交换结果");

const reserve = game.state.world.reserve;
reserve.chapterSpecial = { version: 1, chapter: 1, enteredAt: Date.now() - UNLOCK_DELAY_MS, unlocked: true, completed: false };
assert(chapterSpecialStatus(reserve).available, "特别任务应仍可独立开启");
assert(game.openChapterSpecialTask(), "特别任务弹窗仍能打开");
assert(!game.infoDetailModal.aidCanUse, "自动交换结果不得变成特别任务好友物");
assert.strictEqual(applyFriendAidOnSpecial(reserve).ok, false, "新交换不得结算特别任务");

const named = makeGame();
named.cloudService.friendRows = [{ id: "friend_1", owner: "林岚", simulated: false }];
const sent = sendFriendAidRequest(named.state.world.reserve, named.friendAidAllies());
assert.strictEqual(sent.parcel.friendName, "林岚", "有好友时必须匹配真实玩家");
assert(openFriendAidParcel(named.state.world.reserve).ok);

const league = makeGame();
league.screen = "league";
league.leagueScope = "world";
league.pendingExchangeSource = "league";
league.pendingExchangeChannel = "world";
league.selectedRival = () => ({ id: "world_real", name: "北岸卫士", simulated: false, scope: "world", mine: false });
assert(league.exchangeWithWorld() !== false);
assert.strictEqual(league.infoDetailModal.kind, "friendAidRequest");
assert(/排行榜/.test(league.infoDetailModal.kicker), "排行榜入口必须走同一套求援逻辑");
assert(!league.infoDetailModal.namedFriendExchange, "世界榜必须保持自动成交");
const leagueMatch = (league.infoDetailModal.items || []).find((item) => item.tag === "自动匹配");
assert(leagueMatch && leagueMatch.title === "北岸卫士" && !leagueMatch.body, "排行榜自动匹配也只显示昵称");
assert(!/真实玩家/.test(JSON.stringify(leagueMatch)), "排行榜自动匹配不得附加真实玩家解释");
const worldLedgers = freezeLedgers(league.state.world.reserve);
assert(league.confirmFriendAidRequest());
assert.strictEqual(league.infoDetailModal.kind, "friendAidLetter");
assertLedgersUntouched(league.state.world.reserve, worldLedgers, "世界榜自动交换不得改写游客或动物账本");

const namedBoard = makeGame();
namedBoard.screen = "league";
namedBoard.leagueScope = "friends";
namedBoard.cloudService.friendRows = [{ id: "friend_1", owner: "林岚", simulated: false, scope: "friends" }];
namedBoard.selectedRival = () => ({ id: "friend_1", owner: "林岚", simulated: false, scope: "friends", mine: false });
assert(namedBoard.collaborateWithRival() !== false);
assert.strictEqual(namedBoard.infoDetailModal.kind, "friendAidRequest");
assert.equal(namedBoard.infoDetailModal.namedFriendExchange, true, "好友榜必须点名求援，不能自动成交");
assert(/点名求援/.test(namedBoard.infoDetailModal.kicker));
assert(/林岚/.test(namedBoard.infoDetailModal.title));
const wantRows = (namedBoard.infoDetailModal.items || []).filter((item) => /缺口/.test(item.tag));
assert.ok(wantRows.length >= 2 && wantRows.length <= 3, "好友榜必须列出可选缺口");
assert.ok((namedBoard.infoDetailModal.items || []).some((item) => item.tag === "求援对象" && item.title === "林岚"));
assert.ok(!(namedBoard.infoDetailModal.items || []).some((item) => item.tag === "自动匹配"), "好友榜不得显示自动匹配");
const defaultWant = namedBoard.infoDetailModal.selectedWantId;
const otherWant = (namedBoard.infoDetailModal.wantOptions || []).find((item) => item.id !== defaultWant);
assert(otherWant, "好友榜必须能换一个不同的缺口");
assert(namedBoard.selectFriendExchangeWant(otherWant.id));
assert.equal(namedBoard.infoDetailModal.selectedWantId, otherWant.id);
const friendLedgers = freezeLedgers(namedBoard.state.world.reserve);
assert(namedBoard.confirmFriendAidRequest());
assert.equal(namedBoard.state.world.reserve.friendAid.request.status, "pending", "好友榜点名求援应先进入等待确认");
assert.equal(namedBoard.state.world.reserve.friendAid.request.fallbackAt - namedBoard.state.world.reserve.friendAid.request.createdAt, FRIEND_AID_FALLBACK_MS, "好友无回应窗口必须是24小时");
assert.equal(namedBoard.state.world.reserve.friendAid.request.wantId, otherWant.id, "发出的求援必须保留玩家点选的缺口");
const pendingRequestId = namedBoard.state.world.reserve.friendAid.request.id;
const originalStage = Number(namedBoard.state.world.reserve.progression.stage) || 1;
const animalLedgerBeforeChapterSwitch = animalSourceSummary(namedBoard.state.world.reserve);
namedBoard.state.world.reserve.progression = Object.assign({}, namedBoard.state.world.reserve.progression, { stage: 8, displayChapter: 8 });
const crossChapterAid = friendAidStatus(namedBoard.state.world.reserve, Date.now());
assert.equal(crossChapterAid.request.id, pendingRequestId, "好友请求必须跨章节保留同一条请求");
assert.equal(crossChapterAid.request.status, "pending", "章节变化不能清掉等待中的好友请求");
const crossChapterAnimals = animalSourceSummary(namedBoard.state.world.reserve);
namedBoard.state.world.reserve.progression.stage = originalStage;
const comparableBefore = Object.assign({}, animalLedgerBeforeChapterSwitch);
const comparableAfter = Object.assign({}, crossChapterAnimals);
delete comparableBefore.chapter;
delete comparableAfter.chapter;
assert.deepEqual(comparableAfter, comparableBefore, "跨章节保留请求不得改写动物来源账本");
const fallbackAid = settlePendingFriendAid(namedBoard.state.world.reserve, namedBoard.friendAidAllies(), Date.now(), { forceFallback: true });
assert(fallbackAid.ok && fallbackAid.fallback, "好友未回应时必须允许巡护员兜底");
assert.equal(namedBoard.state.world.reserve.friendAid.incoming.itemId, otherWant.id, "兜底仍应交付玩家点选的缺口");
assert(/阿澈/.test(namedBoard.state.world.reserve.friendAid.incoming.friendName), "兜底收件人应标明巡护员");

assert.strictEqual(friendAidMarkers({ wildernessKnowledge: { tradeStock: {} } }).length, 0, "没有可交换素材时沙盘不显示求援");

const idle = createCharacter(null, "求援间隔").world.reserve;
idle.wildernessKnowledge = { tradeStock: { resin_tinder: 2 } };
assert.strictEqual(friendAidMarkers(idle, 1_000).length, 0, "只有库存、没有新物品出现时沙盘不显示交换图标");
noteSandboxExchangeItem(idle, "resin_tinder", 1_000);
assert.strictEqual(friendAidMarkers(idle, 1_000)[0].type, "friendAidRequest", "有一件物品出现后交换图标可以出现");
sendFriendAidRequest(idle, [], 1_000);
openFriendAidParcel(idle, 1_001);
assert(!friendAidMarkers(idle, 1_002).some((marker) => marker.type === "friendAidRequest"), "交换完成后图标必须先消失");
idle.wildernessKnowledge.tradeStock.resin_tinder = Math.max(2, Number(idle.wildernessKnowledge.tradeStock.resin_tinder) || 0);
noteSandboxExchangeItem(idle, "resin_tinder", 30_000);
assert(!friendAidMarkers(idle, 30_000).some((marker) => marker.type === "friendAidRequest"), "三分钟内即使再拿到溢出物资也不能再次出现");
idle.wildernessKnowledge.tradeStock.resin_tinder = Math.max(2, Number(idle.wildernessKnowledge.tradeStock.resin_tinder) || 0);
noteSandboxExchangeItem(idle, "resin_tinder", 1_000 + EXCHANGE_ICON_GAP_MS + 2);
assert.strictEqual(friendAidMarkers(idle, 1_000 + EXCHANGE_ICON_GAP_MS + 2)[0].type, "friendAidRequest", "间隔超过3分钟且有新的溢出物资时图标才能再次出现");

console.log("friend aid check ok");
