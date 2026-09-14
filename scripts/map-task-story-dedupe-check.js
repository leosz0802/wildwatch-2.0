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
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "地图去重测试员");
game.state.world.reserve.emergency = { active: null };

const duplicateView = {
  mapMarkers: [
    { id: "rv_8_reserve_network_0", type: "event", kind: "exclamation", regionId: "forest", title: "相邻保护区传来异动", recommendAction: "houndScout" },
    { id: "neighbor_migration_8", type: "crisis", kind: "exclamation", eventType: "neighbor_migration", visualKind: "neighbor-migration", regionId: "forest", title: "跨区迁徙口拥堵", recommendAction: "houndScout", intensity: 4 },
    { id: "generic_poacher_8", type: "event", kind: "exclamation", regionId: "meadow", title: "边界异常", recommendAction: "antiPoacher" },
    { id: "visitor_conflict_8", type: "crisis", kind: "exclamation", eventType: "visitor_conflict", regionId: "meadow", title: "游客现场需要处置", recommendAction: "antiPoacher", intensity: 4 }
  ]
};
const normalized = game.normalizeReserveViewPresentation(duplicateView).mapMarkers.map((marker) => marker.id);
assert.strictEqual(normalized.filter((id) => /reserve_network|neighbor_migration/.test(id)).length, 1,
  "相邻保护区同一事件只能保留一个地图入口");
assert.strictEqual(normalized.filter((id) => /generic_poacher|visitor_conflict/.test(id)).length, 1,
  "同区域同动作的旧任务与事件卡只能保留一个入口");
assert(normalized.includes("neighbor_migration_8"), "同一相邻事件应优先保留带事件类型的具体卡片");

game.reserveViewForDisplay = () => duplicateView;
const locatedStory = { status: "located", regionId: "meadow", actionId: "antiPoacher" };
const displayMarkers = game.mapTaskStoryMarkersForDisplay(game.state.world, locatedStory);
assert(!displayMarkers.some((marker) => marker.regionId === "meadow" && marker.recommendAction === "antiPoacher"
  && marker.type !== "crisis" && marker.type !== "visitorIncident"),
"剧情物件已定位时，不得再显示同地点同动作的泛化任务按钮");

game.state.world.reserve.emergency = {
  active: { id: "fire_8", type: "wildfire", regionId: "meadow", recommendedAction: "antiPoacher" }
};
const emergencyMarkers = game.mapTaskStoryMarkersForDisplay(game.state.world, null);
assert(!emergencyMarkers.some((marker) => marker.regionId === "meadow" && marker.recommendAction === "antiPoacher"
  && !marker.eventType && marker.type !== "animalInteraction"),
"活动事件已有独立现场入口时，不得再显示同地点泛化任务按钮");
game.state.world.reserve.emergency = { active: null };

const activeEvents = game.activeSandboxMapEvents({
  reserve: {},
  reserveView: duplicateView,
  day: 8
});
assert.strictEqual(activeEvents.filter((event) => event.regionId === "forest").length, 1,
  "动物对话事件队列也不得重复播报同一相邻事件");
assert.strictEqual(activeEvents.filter((event) => event.regionId === "meadow" && event.recommendAction === "antiPoacher").length, 1,
  "动物对话事件队列不得重复播报同地点同动作");

game.mapPoint = () => ({ x: 187, y: 300 });
game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
game.renderedMapGroundMarkers = [];
game.renderedStoryDiscoveryMarker = null;
const discovery = { status: "located", regionId: "meadow", item: { id: "c2_gauge", name: "干河床断面拓片", icon: "water" } };
game.drawStoryDiscoveryMarker(fakeContext(), { x: 0, y: 0, w: 375, h: 667, scale: 1 }, discovery, false, {
  showLabel: true,
  avoidRects: [{ x: 211, y: 282, w: 110, h: 76 }],
  bounds: { x: 42, y: 140, w: 291, h: 430 }
});
const storyMarker = game.renderedStoryDiscoveryMarker;
assert(storyMarker && storyMarker.visible, "剧情物件应继续保留可见入口");
assert(Math.abs(storyMarker.x - 211) >= (storyMarker.size + 110) / 2 || Math.abs(storyMarker.y - 282) >= (storyMarker.size + 76) / 2,
  "剧情物件标记不得与任务标记的占位框重叠");

console.log("map task/story dedupe check ok");
