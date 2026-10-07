function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

let nativeShare = null;
global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  getLaunchOptionsSync() { return {}; },
  createCanvas() { return { width: 375, height: 667, getContext() { return fakeContext(); } }; },
  createImage() { return { set src(value) { this._src = value; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {},
  showShareMenu() {},
  onShareAppMessage() {},
  shareAppMessage(payload) { nativeShare = payload; }
};

const { Game } = require("../js/game");
const { parseShareInvite } = require("../js/shareSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = new Game();
game.stopLoop();
game.state.world.day = 12;
const modal = game.buildRealNatureSettlementNotice({
  key: "event:wetland",
  type: "real_nature_wetland",
  title: "湿地恢复记录",
  resultSummary: "巡护路线根据真实事件重新调整。"
});
assert(modal.kind === "realNatureSettlement", "real event should use settlement modal");
assert(typeof modal.shareAction === "function" && modal.shareActionLabel === "分享守护接力", "real event settlement should expose guardian relay action");
modal.shareAction();
assert(nativeShare && /share=guardian/.test(nativeShare.query), "guardian relay action should open a share payload");
const sent = (game.state.world.shareHistory || []).find((item) => item.relayKind === "real_event");
assert(sent, "guardian relay share should be recorded in sender history");
assert(parseShareInvite({ query: nativeShare.query }).shareId === sent.shareId, "receiver invite id should match sender history");

console.log("animal guardian relay UI check ok (real event action, share payload, sender history)");
