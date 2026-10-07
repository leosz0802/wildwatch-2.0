const assert = require("assert");

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!(prop in target)) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart() {},
  onTouchMove() {},
  onTouchEnd() {},
  onTouchCancel() {},
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

const { Game } = require("../js/game");
const { createReserveState } = require("../js/world");
const { createCharacter } = require("../js/storage");
const { normalizeChapterRescue } = require("../js/chapterRescueSystem");

function visitorMarker(id = "visitor-stale", extra = {}) {
  return Object.assign({
    id,
    type: "visitorIncident",
    title: "游客现场需要处置",
    label: "游客现场",
    recommendAction: "visitorAdjust",
    visualKind: "visitor-conflict"
  }, extra);
}

function normalizeWithMarkers(markers, configure = () => {}) {
  const reserve = createReserveState();
  configure(reserve);
  const game = Object.create(Game.prototype);
  game.state = { world: { day: 1, reserve } };
  return game.normalizeReserveViewPresentation({ states: [], mapMarkers: markers });
}

const stale = normalizeWithMarkers([visitorMarker()]);
assert.strictEqual(stale.mapMarkers.length, 0, "已恢复游客现场的旧入口必须从沙盘视图移除");

const staleLegacyPhrase = normalizeWithMarkers([visitorMarker()], (reserve) => {
  reserve.development.operations.today = { trouble: "游客现场已经恢复，无需重复处理" };
});
assert.strictEqual(staleLegacyPhrase.mapMarkers.length, 0, "旧存档的“已经恢复”文案也不得重生游客入口");

const active = normalizeWithMarkers([visitorMarker()], (reserve) => {
  reserve.emergency.active = {
    id: "visitor_live",
    type: "visitor_conflict",
    title: "游客与动物路线冲突",
    visualKind: "visitor-conflict",
    recommendedAction: "visitorAdjust"
  };
});
assert.strictEqual(active.mapMarkers.length, 1, "仍在处理中的游客现场必须保留入口");

const legacy = normalizeWithMarkers([visitorMarker()], (reserve) => {
  reserve.development.operations.today = { trouble: "入口拥挤，出现排队与遗留物" };
});
assert.strictEqual(legacy.mapMarkers.length, 1, "旧存档仍有真实游客麻烦时必须保留入口");

const daily = normalizeWithMarkers([visitorMarker("visitor-daily", { dailyTask: true })]);
assert.strictEqual(daily.mapMarkers.length, 1, "每日游客维护任务不能被旧现场过滤误删");

const modalReserve = createReserveState();
const modalGame = Object.create(Game.prototype);
modalGame.state = { world: { reserve: modalReserve } };
modalGame.infoDetailModal = { kind: "chapterRescueTask", title: "解救野猪" };
modalGame.render = () => {};
modalGame.toast = () => { throw new Error("旧游客回调不得覆盖解救弹窗"); };
assert.strictEqual(modalGame.openVisitorIncidentDice({ type: "visitorIncident" }), false, "无效游客回调必须被消费");
assert.strictEqual(modalGame.infoDetailModal.kind, "chapterRescueTask", "无效游客回调不得关闭解救弹窗");

const rescueGame = new Game();
rescueGame.stopLoop();
rescueGame.render = () => {};
rescueGame.state = createCharacter(null, "解救命中区");
Object.assign(rescueGame.state.world.reserve.progression, { stage: 3, displayChapter: 3 });
normalizeChapterRescue(rescueGame.state.world.reserve, 3, { fresh: true });
const target = (rescueGame.chapterRescueState().targets || []).find((item) => item.status !== "rescued");
assert(target, "测试必须存在待解救动物");
target.map = { x: 0.42, y: 0.52 };
rescueGame.mapViewport = { x: 0, y: 0, w: 375, h: 600 };
rescueGame.scrollY = 0;
rescueGame.mapCameraFrame = { x: 0, y: 0, w: 375, h: 600, worldW: 900, worldH: 900, worldSize: 900, scale: 1 };
rescueGame.mapCamera = { cx: 0.5, cy: 0.5 };
rescueGame.hitAreas = [];
rescueGame.drawChapterRescueMarkers(fakeContext(), rescueGame.mapCameraInfo(0, 0, 375, 600));
const rendered = rescueGame.renderedRescueMapMarkers[0];
const rescueHit = rescueGame.hitAreas.find((item) => item.rescue);
assert(rendered && rescueHit, "解救动物必须仍然有可点击命中区");
assert(rescueHit.x > rendered.x && rescueHit.y > rendered.y, "解救命中区必须收进可见卡片内部");
assert(rescueHit.w < rendered.w && rescueHit.h < rendered.h, "解救命中区不得覆盖整块透明外沿");

console.log("visitor rescue overlap check ok: stale visitor entries filtered, cross-modal toast suppressed, rescue hit core narrowed");
