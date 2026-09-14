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

const touchHandlers = {};
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart(handler) { touchHandlers.start = handler; },
  onTouchMove(handler) { touchHandlers.move = handler; },
  onTouchEnd(handler) { touchHandlers.end = handler; },
  onTouchCancel(handler) { touchHandlers.cancel = handler; },
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { buildReserveView } = require("../js/reserveView");
const { createInitialWorld } = require("../js/world");
const { createCharacter } = require("../js/storage");
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

// 微信真机的轻触也可能带 1-3px touchmove。任务点必须锁定为点击，不能
// 进入快速地图拖动渲染后丢掉命中区。
game.infoDetailModal = null;
game.hitAreas = [];
game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
game.screen = "home";
game.addMapRectHit(scoutRendered.hitRect.x, scoutRendered.hitRect.y, scoutRendered.hitRect.w, scoutRendered.hitRect.h, () => game.openMapMarkerDetail(scoutMarker));
const tapX = scoutRendered.hitRect.x + scoutRendered.hitRect.w / 2;
const tapY = scoutRendered.hitRect.y + scoutRendered.hitRect.h / 2;
touchHandlers.start({ touches: [{ clientX: tapX, clientY: tapY }] });
touchHandlers.move({ touches: [{ clientX: tapX + 2, clientY: tapY + 1 }] });
assert(game.gesture && game.gesture.actionHit && !game.gesture.mapPan && !game.gesture.moved, "任务点轻微手抖不得切换为地图拖动");
touchHandlers.end();
assert(game.infoDetailModal && /侦察/.test(game.infoDetailModal.actionLabel || ""), "真机轻触侦察按钮必须打开任务详情");

game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
game.renderedAnimalFocusMarkers = [];
game.drawAnimalFocusMarker(fakeContext(), 180, {
  bodyY: 270,
  groundY: 300,
  bubbleY: 230,
  hitSize: 56
}, "event", 1, { id: "deer_clue", species: "鹿" }, false);
const animalClue = game.renderedAnimalFocusMarkers[0];
assert(animalClue && animalClue.label === "听线索" && animalClue.displayLabel.includes("›"), "事件动物必须说明点击后是听线索，不能只写泛化的“任务”");
assert(animalClue.actionAffordance && animalClue.purpose === "tap-animal-for-clue", "事件动物高亮必须暴露真实点击用途");

const iconOnly = game.drawGroundMapMarker(fakeContext(), {
  id: "queued_trace",
  kind: "exclamation",
  label: "排队处理",
  recommendAction: "antiPoacher"
}, 180, 300, 1, { showLabel: false });
assert(iconOnly && !iconOnly.labelVisible && !iconOnly.actionAffordance && iconOnly.hitRect.w >= iconOnly.hitSize,
  "超出注意力预算的事件应保留可点击图标，但不能继续堆叠文字按钮");

const attention = game.sandboxMapAttentionPlan({
  camera: { x: 0, y: 0, w: 375, h: 667, scale: 1 },
  placements: [
    { animal: { id: "a1" }, focusKind: "event", sx: 90, sy: 240, mapPriority: 380 },
    { animal: { id: "a2" }, focusKind: "event", sx: 150, sy: 280, mapPriority: 360 },
    { animal: { id: "a3" }, focusKind: "moment", sx: 220, sy: 320, mapPriority: 320 },
    { animal: { id: "a4" }, focusKind: "selected", sx: 280, sy: 360, mapPriority: 280 }
  ],
  markerPlacements: [
    { marker: { id: "m1", kind: "exclamation", type: "event", recommendAction: "antiPoacher", label: "边界异常" }, index: 0, px: 120, py: 210, clearOfHud: true },
    { marker: { id: "m2", kind: "question", type: "event", recommendAction: "habitat", label: "修复水草" }, index: 1, px: 260, py: 230, clearOfHud: true }
  ]
});
assert(attention.visible.length <= 2 && attention.hidden.length > 0 && attention.aggregateVisible,
  "沙盘同帧最多只能展示两个情境按钮，其余必须聚合");
assert(new Set(attention.visible.map((item) => item.actionKey)).size === attention.visible.length,
  "同类情境按钮不得在同一帧重复出现");
const gestureAttention = game.sandboxMapAttentionPlan({
  camera: { x: 0, y: 0, w: 375, h: 667, scale: 1 },
  fast: true,
  placements: [
    { animal: { id: "drag_a1" }, focusKind: "event", sx: 120, sy: 240, mapPriority: 380 },
    { animal: { id: "drag_a2" }, focusKind: "moment", sx: 240, sy: 320, mapPriority: 360 }
  ]
});
assert(gestureAttention.visible.length === 0 && !gestureAttention.aggregateVisible
  && gestureAttention.audit.labelsSuppressedDuringGesture,
"拖动地图时必须暂时收起文字入口，避免按钮抢手势");

game.state = createCharacter(null, "线索合并测试员");
const previousActiveEmergency = game.state.world.reserve.emergency && game.state.world.reserve.emergency.active;
game.state.world.reserve.emergency.active = {
  id: "visitor_overlay_check",
  type: "visitorIncident",
  visualKind: "visitor-conflict",
  regionId: "meadow",
  title: "游客与动物接触",
  recommendedAction: "visitorGuide",
  impact: "游客路线需要调整。"
};
game.drawActiveWorldEventOverlay(fakeContext(), {
  x: 0, y: 0, w: 375, h: 667,
  worldX: 0, worldY: 0, worldW: 375, worldH: 667, scale: 1
}, false);
const visitorOverlay = game.renderedWorldEventOverlay;
assert(visitorOverlay && visitorOverlay.visualKind === "visitor-conflict"
  && visitorOverlay.features.some((feature) => feature.type === "visitor-zone")
  && visitorOverlay.features.some((feature) => feature.type === "visitor-ring")
  && visitorOverlay.features.some((feature) => feature.type === "visitor-crowd")
  && visitorOverlay.features.some((feature) => feature.type === "warning-flag"),
"游客/社会事件应绘制独立事件区、发光处理环、人群和警示旗");
game.state.world.reserve.emergency.active = previousActiveEmergency;
const mergedGuidance = game.sandboxMapAttentionPlan({
  camera: { x: 0, y: 0, w: 375, h: 667, scale: 1 },
  placements: [],
  markerPlacements: [],
  drops: []
});
assert(mergedGuidance.visible.length === 0
  && mergedGuidance.hidden.length === 1
  && mergedGuidance.hidden[0].kind === "goal"
  && mergedGuidance.aggregateVisible
  && mergedGuidance.audit.primaryGoalMerged
  && mergedGuidance.audit.guidanceChannels === 2,
"当前主任务必须只进入“更多线索”，不能再形成第三种独立指引");
let openedMergedGuidance = 0;
game.activateSandboxPrimaryGuidance = () => { openedMergedGuidance += 1; return true; };
assert(game.openNextSandboxOpportunity(mergedGuidance.hidden) && openedMergedGuidance === 1,
  "更多线索必须能继续打开合并后的当前主任务");
game.hitAreas = [];
game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
game.drawSandboxOpportunityAggregate(fakeContext(), attention.camera || { x: 0, y: 0, w: 375, h: 667 }, attention);
assert(game.renderedMapOpportunityAggregate && game.renderedMapOpportunityAggregate.visible
  && game.renderedMapOpportunityAggregate.count === attention.hidden.length
  && /每日事件/.test(game.renderedMapOpportunityAggregate.label)
  && game.hitAreas.length === 1,
"聚合入口必须清晰显示待处理数量并保持可点击");

game.state.world.reserve.mastery = Object.assign({}, game.state.world.reserve.mastery, { habitat: { xp: 40 } });
game.drawPersistentSandboxConsequences(fakeContext(), {
  x: 0, y: 0, w: 375, h: 667,
  worldX: 0, worldY: 0, worldSize: 667,
  cx: 0.5, cy: 0.5, scale: 1
}, false, []);
assert(!(game.renderedPersistentSandbox.features || []).some((feature) => feature.type === "restored-water-channel"), "沙盘不得重新绘制无操作意义的青色水渠连线");

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

const rabbit = (game.state.world.knownCharacters || []).find((animal) => animal.name === "短耳兔" || animal.species === "野兔") || { id: "hare", name: "短耳兔", species: "野兔" };
let ecologyAvatar = null;
const drawAnimalAvatar = game.drawAnimalAvatar;
game.drawAnimalAvatar = (ctx, animal, x, y, size) => {
  ecologyAvatar = { animal, x, y, size };
};
game.drawAnimalEcologyDrops(fakeContext(), {
  x: 0, y: 0, w: 375, h: 667,
  worldX: 0, worldY: 0, worldW: 375, worldH: 667,
  scale: 1
}, false, false, true, {
  mapDrops: [{ id: "rabbit_migration", type: "migrationTrace", amount: 1, x: .52, y: .50, animalId: rabbit.id, animalName: "短耳兔", species: "野兔" }]
});
game.drawAnimalAvatar = drawAnimalAvatar;
const ecologyDrop = game.renderedAnimalEcologyDrops[0];
assert(ecologyAvatar && ecologyAvatar.animal.species === "野兔", "动物产出的沙盘标记应直接显示对应动物头像");
assert(ecologyDrop && ecologyDrop.visual === "animal-portrait-with-type-badge" && !ecologyDrop.genericOval,
  "生态产出不得继续使用无法辨认的空心椭圆占位图标");
assert(ecologyDrop.label === "短耳兔的迁徙痕迹", "迁徙产出应使用简短、对象明确的说明");
console.log("map marker affordance check ok");
