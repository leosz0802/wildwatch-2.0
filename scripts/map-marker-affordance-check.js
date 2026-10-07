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
const { CHAPTERS } = require("../js/animalWorld");
const { normalizeChapterRescue } = require("../js/chapterRescueSystem");
const game = new Game();
game.stopLoop();
game.render = () => {};
// iOS/微信首次音频解锁异常不得截断全局触摸链。
game.audio = {
  attachState() {},
  unlock() { throw new Error("simulated iOS audio unlock failure"); },
  playEffect() {}
};
game.hitAreas = [];
let audioFailureTapWorked = false;
game.addHit(100, 100, 120, 52, () => { audioFailureTapWorked = true; }, "tap");
touchHandlers.start({ touches: [{ clientX: 150, clientY: 120 }] });
touchHandlers.end();
assert(audioFailureTapWorked, "音频解锁异常时首页按钮仍必须响应");
game.hitAreas = [];
game.gesture = null;
let changedTouchesTapWorked = false;
game.addHit(90, 160, 150, 54, () => { changedTouchesTapWorked = true; }, "none");
touchHandlers.end({ changedTouches: [{ clientX: 150, clientY: 185 }] });
assert(changedTouchesTapWorked, "仅在 changedTouches 提供坐标时首页按钮仍必须响应");
const originalAdvancePlayablePrologue = game.advancePlayablePrologue;
let directPrologueEntryWorked = false;
game.screen = "choose";
game.renderedPlayablePrologue = {
  actionEnabled: true,
  actionBounds: { x: 96, y: 580, w: 183, h: 46, hidden: false }
};
game.advancePlayablePrologue = (force) => { directPrologueEntryWorked = force === true; return true; };
touchHandlers.start({ touches: [{ clientX: 180, clientY: 603 }] });
assert(directPrologueEntryWorked, "进入游戏按钮必须在 touchstart 走独立直达路径");
directPrologueEntryWorked = false;
game.screen = "choose";
game.renderedPlayablePrologue = {
  actionEnabled: true,
  actionBounds: { x: 96, y: 580, w: 183, h: 46, hidden: false }
};
touchHandlers.start({ touches: [{ clientX: 48, clientY: 140 }] });
assert(directPrologueEntryWorked, "按钮出现后点序章卡片也必须进入游戏");
game.advancePlayablePrologue = originalAdvancePlayablePrologue;
game.suppressNextTouchEndTap = false;
game.justEnteredPlayableGame = false;
game.enteringPlayableGame = false;
game.gesture = null;
game.screen = "home";
game.renderedPlayablePrologue = null;
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

// A gesture beginning on a tappable map marker remains owned by that marker.
// This keeps the stable click path intact; map panning starts from open map
// space, so a task tap cannot re-enter another action while moving.
game.infoDetailModal = null;
game.hitAreas = [];
game.mapCameraFrame = { x: 0, y: 0, w: 375, h: 667, worldW: 900, worldH: 900, worldSize: 900, scale: 1.2 };
game.mapCamera = { cx: 0.5, cy: 0.5 };
game.addMapRectHit(120, 260, 120, 100, () => {});
const beforeSwipeCamera = Object.assign({}, game.mapCamera);
touchHandlers.start({ touches: [{ clientX: 170, clientY: 300 }] });
touchHandlers.move({ touches: [{ clientX: 170, clientY: 390 }] });
touchHandlers.end();
assert(Math.abs(game.mapCamera.cy - beforeSwipeCamera.cy) < 0.001, "任务点手势不得抢占点击链推动沙盘");

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
  && visitorOverlay.markerStyle === "graphic"
  && visitorOverlay.features.some((feature) => feature.type === "visitor-zone")
  && visitorOverlay.features.some((feature) => feature.type === "visitor-ring")
  && visitorOverlay.features.some((feature) => feature.type === "visitor-crowd")
  && visitorOverlay.features.some((feature) => feature.type === "warning-flag")
  && !visitorOverlay.features.some((feature) => feature.type === "event-balloon"),
"游客/社会事件应只保留图形化事件区，不得再叠一个文字气球");
assert(game.mapEventBalloonHit && !game.hitAreas.includes(game.mapEventBalloonHit),
  "游客图形现场必须使用独立点击层，不能进入全局按钮命中队列");
game.screen = "home";
game.infoDetailModal = null;
game.patrolTaskModal = null;
game.chapterStoryModal = null;
game.settlementModal = null;
game.activeTaskLock = null;
game.scrollY = 0;
game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
const visitorHit = game.mapEventBalloonHit;
assert(visitorHit && visitorHit.w > 0 && visitorHit.h > 0, "游客图形现场必须可点击");
const visitorTapX = visitorHit.x + visitorHit.w / 2;
const visitorTapY = visitorHit.y + visitorHit.h / 2;
touchHandlers.start({ touches: [{ clientX: visitorTapX, clientY: visitorTapY }] });
assert(game.gesture && game.gesture.actionHit && !game.gesture.mapPan, "按下游客图形现场不得被当成拖地图");
touchHandlers.end({ touches: [], changedTouches: [{ clientX: visitorTapX, clientY: visitorTapY }] });
assert.equal(game.infoDetailModal && game.infoDetailModal.kind, "visitorIncidentDice", "点击游客图形现场必须直接进入射箭判定");
game.infoDetailModal = null;

const { REAL_NATURE_EVENT_DEFINITIONS } = require("../js/realNatureEventSystem");
const realNatureType = Object.keys(REAL_NATURE_EVENT_DEFINITIONS)[0];
const realNatureDef = REAL_NATURE_EVENT_DEFINITIONS[realNatureType];
game.screen = "home";
game.infoDetailModal = null;
game.patrolTaskModal = null;
game.chapterStoryModal = null;
game.settlementModal = null;
game.activeTaskLock = null;
game.scrollY = 0;
game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
game.hitAreas = [];
game.state.world.reserve.emergency.active = Object.assign({
  id: "real_balloon_tap",
  type: realNatureType,
  recommendedAction: "realEvent",
  progress: 0,
  target: 3,
  daysRemaining: 3
}, realNatureDef);
game.currentGoalView(true);
game.drawActiveWorldEventOverlay(fakeContext(), {
  x: 0, y: 0, w: 375, h: 667,
  worldX: 0, worldY: 0, worldW: 375, worldH: 667, scale: 1
}, false);
const realBalloon = game.mapEventBalloonHit;
assert(realBalloon && realBalloon.w > 0 && realBalloon.h > 0, "紧急事件气球必须有独立点击区域");
let overlappingMapTap = 0;
game.addHit(realBalloon.x, realBalloon.y, realBalloon.w, realBalloon.h, () => { overlappingMapTap += 1; }, "tap", "map");
const balloonX = realBalloon.x + realBalloon.w / 2;
const balloonY = realBalloon.y + Math.min(18, realBalloon.h / 2);
touchHandlers.start({ touches: [{ clientX: balloonX, clientY: balloonY }] });
assert(game.gesture && game.gesture.actionHit && !game.gesture.mapPan, "按下紧急气球不得被当成拖地图");
touchHandlers.end({ touches: [], changedTouches: [{ clientX: balloonX, clientY: balloonY }] });
assert.equal(overlappingMapTap, 0, "紧急气球必须压过脚下的地图标记点击");
assert.equal(game.infoDetailModal && game.infoDetailModal.kind, "worldEventDetail", "点击紧急气球必须进入与当前目标相同的事件详情");

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
game.renderedMapVisitorCountChip = { visible: false, count: 0 };
game.drawSandboxOpportunityAggregate(fakeContext(), attention.camera || { x: 0, y: 0, w: 375, h: 667 }, attention);
assert(game.renderedMapOpportunityAggregate && game.renderedMapOpportunityAggregate.visible
  && game.renderedMapOpportunityAggregate.count === attention.hidden.length
  && /每日事件|解救|更多线索|探索沙盘/.test(game.renderedMapOpportunityAggregate.label)
  && game.hitAreas.length >= 1,
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
riskyReserve.progression = Object.assign({}, riskyReserve.progression, { stage: 2 });
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

const chapter3 = new Game();
chapter3.stopLoop();
chapter3.render = () => {};
chapter3.state = createCharacter(null, "第三章锁住动物地图");
Object.assign(chapter3.state.world.reserve.progression, {
  stage: 3,
  displayChapter: 3,
  level: CHAPTERS[2].level
});
normalizeChapterRescue(chapter3.state.world.reserve, 3, { fresh: true });
const locked = (chapter3.chapterRescueState().targets || []).find((target) => target.status !== "rescued");
assert(locked, "第三章必须有被锁住的章节动物");
locked.map = { x: 0.38, y: 0.62 };
chapter3.mapCameraFrame = { x: 0, y: 0, w: 375, h: 500, worldW: 900, worldH: 900, worldSize: 900, scale: 1.2 };
chapter3.mapCamera = { cx: 0.52, cy: 0.48 };
chapter3.mapZoom = 1.12;
chapter3.focusRescueTargetOnMap(locked.speciesId);
chapter3.applyFocusedRescueCamera(0, 0, 375, 500);
const afterFocus = Object.assign({}, chapter3.mapCamera);
chapter3.applyFocusedRescueCamera(0, 0, 375, 500);
assert.strictEqual(chapter3.mapCamera.cx, afterFocus.cx, "解救定位只能对准一次，不能每帧重钉镜头");
const frameBefore = chapter3.mapCameraInfo(0, 0, 375, 500);
chapter3.drawChapterRescueMarkers(fakeContext(), frameBefore);
const rescueBeforePan = (chapter3.renderedRescueMapMarkers || []).map((marker) => ({
  id: marker.targetId, x: marker.x, y: marker.y, w: marker.w, worldX: marker.worldX, worldY: marker.worldY
}));
const planted = rescueBeforePan.find((marker) => marker.id === locked.targetId);
assert(planted && Math.abs(planted.worldX - 0.38) < 0.0001 && Math.abs(planted.worldY - 0.62) < 0.0001,
  "被指定种植的困住动物必须停在出现时的沙盘坐标");
chapter3.panMapBy(120, 80);
assert(
  Math.abs(chapter3.mapCamera.cx - afterFocus.cx) > 0.001 || Math.abs(chapter3.mapCamera.cy - afterFocus.cy) > 0.001,
  "第三章动物被锁住后，沙盘仍必须能拖动"
);
const frameAfter = chapter3.mapCameraInfo(0, 0, 375, 500);
chapter3.drawChapterRescueMarkers(fakeContext(), frameAfter);
rescueBeforePan.forEach((before) => {
  const after = (chapter3.renderedRescueMapMarkers || []).find((marker) => marker.targetId === before.id);
  assert(after, "困住的动物拖图后仍须留在沙盘上");
  assert(Math.abs(after.worldX - before.worldX) < 0.0001 && Math.abs(after.worldY - before.worldY) < 0.0001, "困住的动物必须固定在出现时的沙盘坐标");
  assert(Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1, "困住的动物应随沙盘地形一起平移，不能钉在屏幕上");
  const expected = chapter3.mapPoint(before.worldX, before.worldY, frameAfter);
  assert(Math.abs((after.x + after.w / 2) - expected.x) < 1 && Math.abs((after.y + 36) - expected.y) < 1, "困住的动物屏幕位置必须跟着种植点走");
});
const afterPan = Object.assign({}, chapter3.mapCamera);
chapter3.applyFocusedRescueCamera(0, 0, 375, 500);
assert.strictEqual(chapter3.mapCamera.cx, afterPan.cx, "拖动后不得把镜头弹回笼子");
assert.strictEqual(chapter3.mapCamera.cy, afterPan.cy, "拖动后不得把镜头弹回笼子");

console.log("map marker affordance check ok");
