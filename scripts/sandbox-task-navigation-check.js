const context = new Proxy({}, {
  get(target, prop) {
    if (prop === "measureText") return () => ({ width: 10 });
    if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => ({ addColorStop() {} });
    if (!target[prop]) target[prop] = () => {};
    return target[prop];
  },
  set(target, prop, value) { target[prop] = value; return true; }
});

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext() { return context; } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "保护区卫士");
game.screen = "action";
game.patrolTaskModal = { id: "houndScout", label: "猎犬侦察" };
let toast = "";
game.toast = (message) => { toast = message; };

assert(game.setScreen("collection") === false, "频道切换应被巡护任务弹窗拦截");
assert(game.screen === "action" && game.patrolTaskModal, "拦截后不得清掉当前巡护任务");
assert(/当前有巡护任务/.test(toast) && /返回沙盘/.test(toast), "拦截时应提示先完成任务再返回沙盘");

game.patrolTaskModal = null;
game.screen = "home";
game.settlementModal = { presentationScreen: "home" };
toast = "";
assert(game.setScreen("role") === false, "沙盘结算弹窗期间不应进入物资频道");
assert(game.screen === "home" && game.settlementModal, "结算弹窗拦截后应保持在沙盘");
assert(/结算/.test(toast) && /再继续/.test(toast), "结算弹窗拦截应提示先看完结算");
assert(game.setScreen("home") === true, "结算展示中仍必须能留在沙盘");

console.log("sandbox task navigation check ok");
