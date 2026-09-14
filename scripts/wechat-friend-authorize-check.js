const {
  FRIEND_RANK_KEY,
  FRIEND_SCORE_KEY,
  buildFriendRankRecord,
  WechatFriendController
} = require("../js/wechatFriendSystem");
const { friendTitle, rankLayout, rowIndexAt, findSelfAvatarRow } = require("../open-data/index");
const fs = require("fs");
const path = require("path");

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function main() {
  const openDataSource = fs.readFileSync(path.join(__dirname, "../open-data/index.js"), "utf8");
  assert(/if \(\(!item \|\| !item\.value\) && \(!scoreItem \|\| !scoreItem\.value\)\) return null/.test(openDataSource), "open data ranking should retain friends who only have the official standard score key");
  assert(friendTitle("leo.liu", "苔原哨站保护区") === "leo.liu的苔原哨站", "friend row title should put nickname before the normalized reserve name");
  const fiveRows = rankLayout(236, 5, 999);
  const tenRows = rankLayout(236, 10, 999);
  const expandedFiveRows = rankLayout(420, 5, 999);
  assert(fiveRows.bottom === 233 && fiveRows.maxScroll > 0 && fiveRows.scrollY === fiveRows.maxScroll, "five friend rows should scroll to a clipped bottom-safe viewport");
  assert(tenRows.maxScroll > fiveRows.maxScroll && rowIndexAt(232, tenRows, 10) === 9, "ten friend rows should remain reachable at maximum scroll");
  assert(expandedFiveRows.maxScroll === 0 && expandedFiveRows.viewportHeight > fiveRows.viewportHeight, "tall screens should show five friends without unnecessary internal scrolling");
  const messages = [];
  const uploads = [];
  const canvas = { width: 1, height: 1 };
  let now = 10000;
  const runtime = {
    getOpenDataContext() {
      return { canvas, postMessage(message) { messages.push(message); } };
    },
    getSetting(options) { options.success({ authSetting: {} }); },
    setUserCloudStorage(options) { uploads.push(options.KVDataList); if (options.success) options.success({}); }
  };
  let changes = 0;
  const controller = new WechatFriendController(runtime, { dpr: 2, now: () => now, onChange: () => { changes += 1; } });
  assert(controller.isSupported() && controller.status === "ready", "open data friend ranking should be ready without an interacted-user authorization gate");

  const reserve = {
    base: { name: "苔原哨站保护区", rating: 1216, protectedAnimals: { deer: 12, hare: 8 } },
    progression: { level: 3 }
  };
  const record = buildFriendRankRecord(reserve, 6232);
  assert(record.name === "苔原哨站保护区" && record.valuation === 5760 && record.rating === 5760 && record.level === 3 && record.animals === 20, "friend rank must derive valuation from level and animals while retaining the legacy rating field");
  assert(controller.syncReserve(reserve, false, 6232) && !controller.syncReserve(reserve, false, 6232), "unchanged cloud rank should upload only once");
  assert(uploads.length === 1 && uploads[0][0].key === FRIEND_SCORE_KEY && uploads[0][1].key === FRIEND_RANK_KEY, "cloud rank must upload standard score and detailed record together");
  assert(!controller.syncReserve(reserve, false, 6233) && uploads.length === 1, "render-loop cloud checks should be throttled within one second");
  now += 1001;
  assert(!controller.syncReserve(reserve, false, 6233) && uploads.length === 1, "a forged caller valuation must not trigger another upload");
  reserve.base.protectedAnimals.hare += 1;
  now += 1001;
  assert(controller.syncReserve(reserve, false, 6233) && uploads.length === 2, "a real animal-count change should upload after the throttle window");
  const standard = JSON.parse(uploads[0][0].value);
  assert(standard.wxgame.score === 5760 && Number.isInteger(standard.wxgame.update_time) && standard.wxgame.update_time > 0, "standard rank value must contain the calculated integer valuation and second-level update_time");
  const selfAvatarRow = findSelfAvatarRow([
    { reserveName: "河湾哨站", valuation: 6400, level: 2, animals: 31, avatarUrl: "friend.jpg" },
    { reserveName: "苔原哨站保护区", valuation: 5760, level: 3, animals: 20, avatarUrl: "mine.jpg" }
  ], record);
  assert(selfAvatarRow && selfAvatarRow.avatarUrl === "mine.jpg", "the compact world-rank avatar surface should match the current reserve without exposing the friend list to the main domain");

  controller.refresh(300, 236);
  const message = messages[messages.length - 1];
  assert(message.type === "friend_rank_show" && message.scoreKey === FRIEND_SCORE_KEY && message.width === 300 && message.height === 236 && canvas.width === 600 && canvas.height === 472, "authorized ranking should size and message the open data canvas");
  assert(Object.values(message).every((value) => ["string", "number", "boolean"].includes(typeof value)), "open data messages must contain primitive values only");
  const drawContext = { drawImage() {} };
  controller.draw(drawContext, 0, 0, 300, 420);
  assert(canvas.width === 600 && canvas.height === 840 && messages[messages.length - 1].height === 420, "a tall rank viewport should own a matching shared-canvas size");
  controller.refresh(276, 236);
  assert(canvas.width === 552 && canvas.height === 472, "an explicit refresh may temporarily request a different canvas size");
  controller.draw(drawContext, 0, 0, 300, 420);
  const restoredLayout = messages[messages.length - 1];
  assert(restoredLayout.width === 300 && restoredLayout.height === 420 && canvas.width === 600 && canvas.height === 840, "the next draw must restore the actual viewport instead of stretching a fixed refresh canvas");
  assert(controller.drawSelfAvatar(drawContext, 8, 8, 40, reserve, 6232), "the world ranking should request the current user's real WeChat avatar surface");
  const avatarMessage = messages[messages.length - 1];
  assert(avatarMessage.type === "friend_self_avatar_show" && avatarMessage.reserveName === "苔原哨站保护区" && avatarMessage.valuation === 5778 && canvas.width === 80 && canvas.height === 80, "the self-avatar request should use the recalculated current valuation");
  assert(Object.values(avatarMessage).every((value) => ["string", "number", "boolean"].includes(typeof value)), "the self-avatar bridge must not expose objects or friend records to the main domain");
  controller.draw(drawContext, 0, 0, 300, 420);
  assert(messages[messages.length - 1].type === "friend_rank_show" && canvas.width === 600 && canvas.height === 840, "returning to the friend tab should restore the complete friend ranking surface");
  assert(controller.pointer("start", 80.4, 64.6) && controller.pointer("move", 80.4, 20.2) && controller.pointer("end", 80.4, 20.2), "main domain should forward friend-rank pointer phases");
  const pointerMessages = messages.slice(-3);
  assert(pointerMessages.map((item) => item.phase).join(",") === "start,move,end" && pointerMessages.every((item) => item.type === "friend_rank_pointer"), "pointer forwarding should use primitive open-data messages");

  const friendSource = fs.readFileSync(path.join(__dirname, "../js/wechatFriendSystem.js"), "utf8");
  assert(!/getRelationFriendList|scope\.interactedUserInfo|scope\.WxFriendInteraction/.test(friendSource), "friend ranking must not request the separate interacted-user friend-list permission");
  assert(changes > 0, "authorization state changes should notify the UI");
  console.log("wechat friend authorize check ok");
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
