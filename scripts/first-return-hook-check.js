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

let lastToast = "";
global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext() { return createFakeContext(); } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; this.loaded = true; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {},
  showToast(options) { lastToast = String((options || {}).title || ""); }
};

const {
  FIRST_RETURN_HOOK_COPY,
  scheduleFirstReturnHook,
  firstReturnHookDue,
  revealFirstReturnHook
} = require("../js/firstReturnHook");
const { createReserveState } = require("../js/world");
const { advanceGuardianCycle, SEVEN_DAY_BEATS } = require("../js/guardianCycle");
const { createCharacter } = require("../js/storage");
const { Game } = require("../js/game");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const firstDay = new Date(2026, 8, 2, 10, 0, 0);
const secondDay = new Date(2026, 8, 3, 8, 0, 0);
assert(!scheduleFirstReturnHook(null, null, firstDay), "hook must not be scheduled without the first guardian night");
const scheduled = scheduleFirstReturnHook(null, { day: 1 }, firstDay);
assert(scheduled && scheduled.status === "pending" && scheduled.availableDateKey === "2026-09-03", "first-night hook should become available on the next local date");
assert(!firstReturnHookDue(scheduled, firstDay), "the answer must not be revealed on the same date");
assert(firstReturnHookDue(scheduled, secondDay), "the exact question must be due on the next date");
const revealed = revealFirstReturnHook(scheduled, secondDay);
assert(revealed.status === "revealed" && !firstReturnHookDue(revealed, secondDay), "a revealed hook must not repeat");
assert(FIRST_RETURN_HOOK_COPY.closing === "晨角已经喝到水，但泥岸出现了一串逆行脚印。明天必须确认，它属于幼鹿，还是正在接近水源的陌生动物。", "the first-day closing copy must remain exact");
assert(/陌生独狼/.test(SEVEN_DAY_BEATS[2].prompt) && /为何靠近水源/.test(SEVEN_DAY_BEATS[2].prompt), "guardian day two must resolve the reverse-track question instead of selecting a random event");

const reserve = createReserveState();
let cycleResult = null;
for (let index = 0; index < 3; index += 1) {
  const before = JSON.parse(JSON.stringify(reserve));
  cycleResult = advanceGuardianCycle(reserve, index === 0 ? "habitat" : "houndScout", before, reserve);
}
assert(cycleResult.night && cycleResult.night.day === 1, "three key actions should close guardian day one");
assert(cycleResult.night.tomorrow === FIRST_RETURN_HOOK_COPY.closing, "day-one settlement must carry the exact next-day hook");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.ctx = createFakeContext();
game.state = createCharacter(null, "测试卫士");
game.screen = "home";
game.chapterStoryModal = null;
game.settlementModal = null;
game.patrolTaskModal = null;
game.infoDetailModal = null;
game.state.ui.firstSessionFocus.startedDateKey = game.currentDateKey();
game.state.ui.firstSessionFocus.activeSeconds = 20;
game.state.world.reserve.progression.totalActions = 0;

assert(game.firstSessionFocusStatus().active, "new players should begin inside the three-minute focus window");
lastToast = "";
assert(!game.firstSessionRestrictionsEnabled(), "temporary first-session feature restrictions should be disabled");
assert(game.openReserveNetwork("world") === true && game.screen === "league", "new players must be able to open the world leaderboard immediately");
assert(!lastToast, "open features must not emit a stale unlock-condition toast");
game.screen = "home";
lastToast = "";
assert(game.setScreen("collection") === true && game.screen === "collection", "new players must be able to enter Discovery immediately");
assert(!lastToast, "Discovery must not emit a stale first-session restriction toast");
game.drawLeagueTeaser(game.ctx, 16, 200, 343);
assert(!game.renderedLeagueTeaser.worldLeaderboardLocked, "world leaderboard must render as available during the focus window");

game.state.world.reserve.progression.totalActions = 2;
assert(!game.firstSessionFocusStatus().active, "two effective guardian actions should unlock the secondary systems");
assert(game.setScreen("collection") === true && game.screen === "collection", "collection should unlock after the first core loop is learned");

game.screen = "home";
game.infoDetailModal = null;
game.state.ui.firstReturnHook = scheduled;
assert(game.openFirstReturnHook(secondDay), "the next login should open the promised answer before other content");
assert(game.infoDetailModal && game.infoDetailModal.kind === "firstReturnHook", "the promised answer should use a dedicated deterministic modal");
assert(/不属于幼鹿/.test(game.infoDetailModal.prose) && /陌生的独狼/.test(game.infoDetailModal.prose), "the answer must explicitly resolve both sides of the prior question");
assert(game.infoDetailModal.actionLabel === "沿脚印出发", "the resolved question should point to an immediate follow-through action");

game.infoDetailModal = null;
delete game.state.ui.firstReturnHook;
assert(game.scheduleFirstReturnHookFromResult({ visual: { guardianCycle: { night: { day: 1 } } } }, firstDay), "the first night result should persist the return hook");
assert(game.state.ui.firstReturnHook.availableDateKey === "2026-09-03", "the persisted hook should retain its exact next-date availability");

console.log("first return hook check ok");
