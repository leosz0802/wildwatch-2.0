const assert = require("assert");

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

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true }),
  getStorageSync: () => null,
  setStorageSync() {}, onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { buildReserveView } = require("../js/reserveView");
const { createInitialWorld } = require("../js/world");
const game = new Game();
game.stopLoop();
game.render = () => {};
game.renderedMapGroundMarkers = [];
const rendered = game.drawGroundMapMarker(fakeContext(), {
  id: "poacher_trace",
  kind: "exclamation",
  title: "边界出现陌生脚印",
  label: "驱赶偷猎",
  recommendAction: "antiPoacher"
}, 180, 300, 1);
const marker = game.renderedMapGroundMarkers[0];
assert(marker && marker.icon === "antiPoacher", "偷猎任务点应使用明确的巡护图标");
assert(marker.labelVisible && marker.label.includes("驱赶偷猎"), "沙盘任务点不得只显示无说明图标");
assert(marker.actionAffordance && marker.hitSize >= 52, "沙盘任务点应明确可点击并扩大命中区");
assert(rendered.hitRect && rendered.hitRect.w >= marker.hitSize && rendered.hitRect.h > marker.hitSize, "任务点命中区必须覆盖图标和完整文字按钮");
game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
game.scrollY = 0;
let tapped = false;
game.addMapRectHit(rendered.hitRect.x, rendered.hitRect.y, rendered.hitRect.w, rendered.hitRect.h, () => { tapped = true; });
game.handleTap(rendered.hitRect.x + rendered.hitRect.w - 3, rendered.hitRect.y + rendered.hitRect.h - 3);
assert(tapped, "点击任务按钮右下边缘也必须触发操作");

game.hitAreas = [];
const scoutMarker = {
  id: "scout_trace",
  kind: "question",
  type: "event",
  title: "侦察水边足迹",
  label: "侦察",
  impact: "水边出现陌生脚印。",
  recommendAction: "houndScout"
};
const scoutRendered = game.drawGroundMapMarker(fakeContext(), scoutMarker, 180, 300, 1);
game.addMapRectHit(scoutRendered.hitRect.x, scoutRendered.hitRect.y, scoutRendered.hitRect.w, scoutRendered.hitRect.h, () => game.openMapMarkerDetail(scoutMarker));
game.handleTap(scoutRendered.hitRect.x + scoutRendered.hitRect.w - 3, scoutRendered.hitRect.y + scoutRendered.hitRect.h - 3);
assert(game.infoDetailModal && /侦察/.test(game.infoDetailModal.actionLabel || ""), "侦察任务点必须打开可执行的猎犬侦察入口");

let openedExploration = 0;
game.openMaterialExploration = () => { openedExploration += 1; };
assert(game.openReserveViewAction("exploreMaterials", "sandbox-info"), "季节调查任务应允许从沙盘任务入口执行");
assert.strictEqual(openedExploration, 1, "跟随动物线索必须进入剧情发现/探索，不得被降级成猎犬侦察");

const stableReserve = createInitialWorld().reserve;
const stableView = buildReserveView(stableReserve, stableReserve, { action: "buySupplies", day: 1, regionId: "center" });
assert.strictEqual(stableView.mapMarkers.length, 0, "没有实际风险或变化时不得强制生成水滴/铃铛任务点");
const riskyReserve = JSON.parse(JSON.stringify(stableReserve));
riskyReserve.poacherPressure = 72;
const riskyView = buildReserveView(stableReserve, riskyReserve, { action: "buySupplies", day: 1, regionId: "center" });
assert(riskyView.mapMarkers.some((item) => item.recommendAction === "antiPoacher" && /脚印|偷猎/.test(item.label)), "真实偷猎风险应保留带用途的可操作任务点");
console.log("map marker affordance check ok");
