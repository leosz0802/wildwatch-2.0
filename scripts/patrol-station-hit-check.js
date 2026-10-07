const assert = require("assert");

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (!target[prop]) target[prop] = () => {};
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
  createImage: () => ({ loaded: true, width: 480, height: 320 }),
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

const game = new Game();
game.stopLoop();
game.render = () => {};
game.scrollY = 0;
game.mapViewport = { x: 0, y: 0, w: 375, h: 667 };
game.hitAreas = [];

let facilityTapped = false;
let rescueTapped = false;
game.addMapHit(180, 300, 64, () => { facilityTapped = true; }, "tap", "facility");
game.addRescueMapRectHit(150, 270, 110, 88, () => { rescueTapped = true; });

const stationHit = game.hitAreaAt(180, 300);
assert(stationHit && stationHit.facility, "巡护站命中区必须标记为 facility");
assert(stationHit.map && !stationHit.hud, "巡护站命中区必须仍属于地图层");
stationHit.onTap();
assert(facilityTapped && !rescueTapped, "巡护站与解救标记重叠时应优先打开巡护站");

const rescueHit = game.hitAreaAt(240, 320);
assert(rescueHit && rescueHit.rescue, "点击解救标记独占区域仍应进入解救");
rescueHit.onTap();
assert(rescueTapped, "解救标记独占区域必须保持可点击");

const labels = [];
game.text = (value) => labels.push(String(value));
game.art = {
  facilities: { loaded: true, width: 480, height: 320 },
  facilityRouteKits: null
};
const patrol = {
  id: "old_patrol_post",
  short: "巡护站",
  status: "repaired",
  buildStage: 1,
  buildSteps: 0,
  level: 1,
  mapLabelVisible: false
};
game.drawReserveFacility(fakeContext(), 180, 300, patrol, 1, false);
assert(!labels.includes("0/2"), "巡护站地图图标不得再显示多余的 0/2 建设数字");

labels.length = 0;
game.drawReserveFacility(fakeContext(), 220, 300, {
  id: "hydrology_station",
  short: "水文站",
  status: "repaired",
  buildStage: 1,
  buildSteps: 0,
  level: 1,
  mapLabelVisible: false
}, 1, false);
assert(!labels.includes("0/2"), "水文站地图图标不得再显示多余的 0/2 建设数字");

labels.length = 0;
game.drawReserveFacility(fakeContext(), 260, 300, {
  id: "evidence_room",
  short: "线索室",
  status: "repaired",
  buildStage: 1,
  buildSteps: 0,
  level: 1,
  mapLabelVisible: false
}, 1, false);
assert(!labels.includes("0/2"), "线索室地图图标不得再显示多余的 0/2 建设数字");

labels.length = 0;
game.drawReserveFacility(fakeContext(), 300, 300, {
  id: "migration_watch",
  short: "观测站",
  status: "repaired",
  buildStage: 1,
  buildSteps: 0,
  level: 1,
  mapLabelVisible: false
}, 1, false);
assert(!labels.includes("0/2"), "观测站地图图标不得再显示多余的 0/2 建设数字");

labels.length = 0;
game.drawReserveFacility(fakeContext(), 340, 300, {
  id: "governance_hall",
  short: "治理厅",
  status: "repaired",
  buildStage: 1,
  buildSteps: 0,
  level: 1,
  mapLabelVisible: false
}, 1, false);
assert(!labels.includes("0/2"), "治理厅地图图标不得再显示多余的 0/2 建设数字");

game.hitAreas = [];
game.drawReserveFacilities(fakeContext(), {
  x: 0, y: 0, w: 375, h: 667, worldX: 0, worldY: 0,
  worldW: 375, worldH: 667, worldSize: 375, scale: 1
}, false, { facilities: [Object.assign({}, patrol, { x: 0.32, y: 0.32 })] });
assert(game.hitAreas.some((item) => item && item.facility), "巡护站实际绘制必须注册 facility 专属命中区");
const patrolLabel = game.renderedMapFacilityLabels.find((item) => item && item.id === "old_patrol_post");
assert(patrolLabel, "巡护站实际绘制必须记录文字标签坐标");
const patrolLabelHit = game.hitAreas.find((item) => item && item.facilityLabel && item.facilityId === "old_patrol_post");
assert(patrolLabelHit, "巡护站文字必须注册独立的 facilityLabel 命中区");
let openedFacility = "";
game.openReserveFacilityDetail = (facilityId) => { openedFacility = facilityId; };
// Simulate the nearby rescue card occupying the label edge. The visible
// facility label must still win, including on Android/Harmony touch padding.
game.info = { platform: "android", system: "Android" };
game.addRescueMapRectHit(
  patrolLabelHit.x - 2,
  patrolLabelHit.y - 2,
  patrolLabelHit.w + 4,
  patrolLabelHit.h + 4,
  () => { throw new Error("巡护站文字不应触发解救动物"); }
);
const patrolLabelTap = game.hitAreaAt(
  patrolLabel.x + patrolLabel.w / 2,
  patrolLabel.y + patrolLabel.h / 2
);
assert(patrolLabelTap && patrolLabelTap.facilityLabel, "点击巡护站文字必须优先命中设施文字");
patrolLabelTap.onTap();
assert.equal(openedFacility, "old_patrol_post", "点击巡护站文字必须打开巡护站，而不是解救任务");

// A Harmony/Android touch may provide a second coordinate candidate that
// lands on the HUD rescue chip.  A concrete facility hit must remain stable
// when that fallback candidate is present.
game.hitAreas = [patrolLabelHit];
let fallbackRescueTapped = false;
const previousTouchCandidates = game.touchHitAreaCandidates;
game.touchHitAreaCandidates = () => ({
  point: { x: 10, y: 10 },
  hit: {
    hud: true,
    map: false,
    onTap: () => { fallbackRescueTapped = true; }
  }
});
openedFacility = "";
game.handleTap(
  patrolLabel.x + patrolLabel.w / 2,
  patrolLabel.y + patrolLabel.h / 2,
  { clientX: 1, clientY: 1, x: 2, y: 2 }
);
game.touchHitAreaCandidates = previousTouchCandidates;
assert.equal(openedFacility, "old_patrol_post", "备用坐标命中解救入口时仍应打开巡护站");
assert(!fallbackRescueTapped, "备用坐标不得把巡护站文字改判为解救任务");

// Reproduce a backing-canvas/logical-coordinate split: the physical point is
// on the patrol label while the unscaled point is on the rescue card.
game.width = 375;
game.height = 667;
game.canvas = { width: 750, height: 1334 };
game.info = { platform: "ohos", system: "HarmonyOS" };
game.hitAreas = [
  Object.assign({}, patrolLabelHit, { x: 100, y: 200, w: 60, h: 30 }),
  { x: 200, y: 400, w: 90, h: 60, map: true, rescue: true, hud: false,
    onTap: () => { throw new Error("物理坐标巡护站命中时不应触发解救任务"); } }
];
const normalizedPatrolPoint = game.touchPoint({
  clientX: 200,
  clientY: 400,
  x: 200,
  y: 400
});
assert(Math.abs(normalizedPatrolPoint.x - 100) < 0.01 && Math.abs(normalizedPatrolPoint.y - 200) < 0.01,
  "物理坐标命中巡护站、逻辑坐标命中解救卡时必须选择巡护站坐标");

console.log("patrol station hit check ok");
