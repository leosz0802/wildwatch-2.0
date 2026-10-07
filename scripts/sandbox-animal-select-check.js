"use strict";

const assert = require("assert");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { CHAPTERS } = require("../js/animalWorld");

const gradient = { addColorStop() {} };
function context() {
  return new Proxy({ globalAlpha: 1 }, {
    get(target, key) {
      if (key === "measureText") return (value) => ({ width: Array.from(String(value || "")).length * 7 });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (!(key in target)) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: context }),
  createImage: () => ({
    loaded: true,
    width: 1536,
    height: 864,
    set src(value) { this._src = value; if (this.onload) this.onload(); },
    get src() { return this._src; }
  }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

function makeGame(chapter) {
  const game = new Game();
  game.stopLoop();
  game.render = Game.prototype.render;
  game.state = createCharacter(null, `沙盘动物点选-${chapter}`);
  game.state.ui.onboarding = { version: 2, completed: true, recruitmentDone: true, seen: {} };
  game.width = 375;
  game.height = 667;
  game.ctx = context();
  game.screen = "home";
  game.scrollY = 0;
  game.gesture = null;
  game.infoDetailModal = null;
  game.sandboxMapSpriteReady = () => true;
  game.lateAnimalMapSpritesReady = () => true;
  Object.assign(game.state.world.reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    level: (CHAPTERS[chapter - 1] || CHAPTERS[0]).level
  });
  return game;
}

function paintHome(game, keepGesture = false) {
  game.hitAreas = [];
  game.screen = "home";
  if (!keepGesture) game.gesture = null;
  game.requestRender = () => {};
  game.toast = () => {};
  game.render();
}

function animalHitsOf(game) {
  return (game.hitAreas || []).filter((hit) => hit && hit.animal);
}

function tapAnimal(game, hit) {
  let opened = null;
  const previous = game.openAnimalThought;
  game.openAnimalThought = (animal) => { opened = animal; };
  game.handleTap(hit.x + hit.w / 2, hit.y + hit.h / 2);
  game.openAnimalThought = previous;
  return opened;
}

[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].forEach((chapter) => {
  const game = makeGame(chapter);
  assert.strictEqual(game.isFastMapRender(), false, `第${chapter}章空闲沙盘不得走手势加速`);
  assert(game.isQuietSandboxPaint(), `第${chapter}章空闲沙盘应走轻量绘制`);
  paintHome(game);
  const viewport = game.mapViewport || { x: 0, y: 0, w: game.width, h: game.height };
  const animalHits = animalHitsOf(game);
  const zoom = game.renderedMapZoomControls;
  assert(animalHits.length > 0, `第${chapter}章空闲沙盘必须能点选动物`);
  assert(animalHits.every((hit) => hit.x + hit.w > viewport.x && hit.x < viewport.x + viewport.w
    && hit.y + hit.h > viewport.y && hit.y < viewport.y + viewport.h), `第${chapter}章动物命中区必须落在可见沙盘内`);
  animalHits.forEach((hit) => {
    const picked = game.hitAreaAt(hit.x + hit.w / 2, hit.y + hit.h / 2);
    assert(picked && picked.animal, `第${chapter}章点到动物身体时必须命中动物`);
  });
  const opened = tapAnimal(game, animalHits[0]);
  assert(opened && opened.id, `第${chapter}章点击沙盘动物必须打开该动物`);
  assert(zoom && zoom.size > 0, `第${chapter}章空闲沙盘必须画出缩放键`);
  assert(typeof zoom.minusY === "number", `第${chapter}章必须能用减号把地图拉回全景`);
  const plusHit = (game.hitAreas || []).find((hit) => hit && hit.hud && Math.abs(hit.y - zoom.y) < 1);
  assert(plusHit, `第${chapter}章加号键在全景时必须可点`);
  const groups = game.renderedAnimalGroups || [];
  assert(groups.length > 0, `第${chapter}章必须画出沙盘动物`);
  const speciesKeys = groups.map((group) => String(group.species || group.id || ""));
  assert.strictEqual(new Set(speciesKeys).size, speciesKeys.length, `第${chapter}章每种动物只应出现一个绘制组`);
  if (chapter >= 10) {
    assert(groups.every((group) => Number(group.count) === 1), `第${chapter}章每种动物在地图上只能出现1只`);
  } else {
    assert(groups.every((group) => Number(group.count) >= 1 && Number(group.count) <= 2), `第${chapter}章同种动物最多画一对`);
  }

  game.gesture = { mapPan: true, moved: true };
  paintHome(game, true);
  assert(game.isFastMapRender(), `第${chapter}章拖动中才应走加速绘制`);
  assert.strictEqual(animalHitsOf(game).length, 0, `第${chapter}章拖动中不得注册动物点选`);
  game.gesture = null;
  game.tapActionDepth = 0;
  paintHome(game);
  const afterPan = animalHitsOf(game);
  assert(afterPan.length > 0, `第${chapter}章松手后必须恢复动物点选`);
  assert(tapAnimal(game, afterPan[0]), `第${chapter}章松手后必须能再次点开动物`);

  game.setMapZoom(1.4, 180, 250, false);
  assert(game.mapZoom > 1, `第${chapter}章缩放键必须能放大`);
  paintHome(game);
  const zoomed = game.renderedMapZoomControls;
  const minusHit = zoomed && (game.hitAreas || []).find((hit) => hit && hit.hud && Math.abs(hit.y - zoomed.minusY) < 1);
  assert(minusHit, `第${chapter}章放大后减号键必须可点`);
  game.restoreSandboxOverviewCamera();
  assert.strictEqual(game.mapZoom, 0, `第${chapter}章必须能把地图恢复到全景`);
  assert.strictEqual(game.mapCamera.cx, 0.52, `第${chapter}章复位后镜头X必须回到全景`);
  assert.strictEqual(game.mapCamera.cy, 0.48, `第${chapter}章复位后镜头Y必须回到全景`);
  paintHome(game);
  const afterRestore = animalHitsOf(game);
  assert(afterRestore.length > 0, `第${chapter}章复位后再画必须仍能点选动物`);
  assert(tapAnimal(game, afterRestore[0]), `第${chapter}章复位后点击动物必须仍然有效`);
});

const early = makeGame(3);
const late = makeGame(10);
const deer = { id: "deer_1", species: "鹿", speciesId: "deer" };
early.state.world.reserve.ecology = early.state.world.reserve.ecology || {};
early.state.world.reserve.ecology.herbivores = Object.assign({}, (early.state.world.reserve.ecology || {}).herbivores, { deer: 24 });
late.state.world.reserve.ecology = late.state.world.reserve.ecology || {};
late.state.world.reserve.ecology.herbivores = Object.assign({}, (late.state.world.reserve.ecology || {}).herbivores, { deer: 24 });
assert.strictEqual(early.mapAnimalVisualGroupCounts([deer], early.state.world.reserve)[deer.id], 2, "前9章种群足够时仍可画一对同种动物");
assert.strictEqual(late.mapAnimalVisualGroupCounts([deer], late.state.world.reserve)[deer.id], 1, "第10章起每种动物只画1只");

const tapGame = makeGame(1);
tapGame.hitAreas = [];
tapGame.addHit(40, 200, 80, 36, () => {}, "tap", "facility", { facilityLabel: true, facilityId: "old_patrol_post" });
tapGame.addHit(20, 180, 120, 80, () => {}, "tap", "facility");
tapGame.addHit(60, 190, 56, 56, () => {}, "cue:animal", "map", { animal: true });
const facilityLabel = tapGame.hitAreaAt(80, 218);
assert(facilityLabel && facilityLabel.facilityLabel, "设施文字仍须优先于动物");
const animalBody = tapGame.hitAreaAt(88, 218);
assert(animalBody && animalBody.animal, "点在动物身体中心时必须选中动物，即使设施文字热区叠在身上");
const animalOverFacility = tapGame.hitAreaAt(88, 195);
assert(animalOverFacility && animalOverFacility.animal, "点到动物身体时必须选中动物，不能被建筑热区吃掉");

const stuck = makeGame(10);
stuck.gesture = { mapPan: true, moved: true };
stuck.mapZoom = 1.85;
stuck.mapCamera = { cx: 0.18, cy: 0.22 };
assert(stuck.isFastMapRender(), "拖动手势才应开启加速绘制");
stuck.gesture = null;
stuck.tapActionDepth = 0;
stuck.restoreSandboxOverviewCamera();
assert.strictEqual(stuck.isFastMapRender(), false, "松手后第10章也必须恢复可点选");
assert.strictEqual(stuck.mapZoom, 0, "广告返回或复位后地图必须回到全景");
assert.strictEqual(stuck.mapCamera.cx, 0.52, "广告返回后镜头X必须回到全景");
assert.strictEqual(stuck.mapCamera.cy, 0.48, "广告返回后镜头Y必须回到全景");
paintHome(stuck);
const stuckHits = animalHitsOf(stuck);
assert(stuckHits.length > 0, "第10章从卡住状态复位后必须能点选动物");
assert(tapAnimal(stuck, stuckHits[0]), "第10章从卡住状态复位后必须能打开动物");
assert((stuck.renderedAnimalGroups || []).every((group) => Number(group.count) === 1), "第10章复位后每种动物仍只出现1只");

function actorShift(before, after) {
  return Object.keys(before || {}).reduce((max, key) => {
    const start = before[key];
    const end = (after || {})[key];
    if (!start || !end) return max;
    return Math.max(max, Math.hypot((start.x || 0) - (end.x || 0), (start.y || 0) - (end.y || 0)));
  }, 0);
}

[8, 12, 16, 20].forEach((chapter) => {
  const game = makeGame(chapter);
  game.anim.t = 0;
  paintHome(game);
  const animalStart = JSON.parse(JSON.stringify(game.animalMotionStates || {}));
  assert(Object.keys(animalStart).length > 0, `第${chapter}章必须有可走动的动物`);
  for (let frame = 1; frame <= 40; frame += 1) {
    game.anim.t = frame * 200;
    paintHome(game);
  }
  assert(actorShift(animalStart, game.animalMotionStates) > 0.004, `第${chapter}章动物必须在沙盘上走动`);
  const movingHits = animalHitsOf(game);
  assert(movingHits.length > 0, `第${chapter}章动物走动后仍必须注册点选`);
  movingHits.forEach((hit) => {
    const picked = game.hitAreaAt(hit.x + hit.w / 2, hit.y + hit.h / 2);
    assert(picked && picked.animal, `第${chapter}章动物走动后点在身体上必须仍选中动物`);
  });
  assert(tapAnimal(game, movingHits[0]), `第${chapter}章动物走动后必须能点开`);

  const visitorView = {
    visitors: 6,
    node: { id: "river_shallows" },
    choice: { id: "visitor_boardwalk", routeKey: "visitor" }
  };
  game.visitorMotionStates = {};
  game.anim.t = 0;
  const visitorStart = game.mapVisitorPlacements(visitorView, { fast: false })
    .reduce((states, placement) => {
      states[placement.motion.key] = { x: placement.motion.x, y: placement.motion.y };
      return states;
    }, {});
  assert(Object.keys(visitorStart).length > 0, `第${chapter}章必须有可走动的游客`);
  for (let frame = 1; frame <= 40; frame += 1) {
    game.anim.t = frame * 200;
    game.mapVisitorPlacements(visitorView, { fast: false });
  }
  assert(actorShift(visitorStart, game.visitorMotionStates) > 0.004, `第${chapter}章游客必须在沙盘上走动`);

  const heldAnimals = JSON.parse(JSON.stringify(game.animalMotionStates));
  const heldVisitors = JSON.parse(JSON.stringify(game.visitorMotionStates));
  game.gesture = { mapPan: true, moved: true };
  for (let frame = 41; frame <= 48; frame += 1) {
    game.anim.t = 8000 + frame * 200;
    game.mapVisitorPlacements(visitorView, { fast: true });
  }
  assert(actorShift(heldVisitors, game.visitorMotionStates) < 0.00001, `第${chapter}章拖动时游客应停在原地`);
  for (let frame = 41; frame <= 48; frame += 1) {
    game.anim.t = 8000 + frame * 200;
    paintHome(game, true);
  }
  assert(actorShift(heldAnimals, game.animalMotionStates) < 0.00001, `第${chapter}章拖动时动物应停在原地，松手后再走`);
  game.gesture = null;
  paintHome(game);
  const afterHold = animalHitsOf(game);
  assert(afterHold.length > 0 && tapAnimal(game, afterHold[0]), `第${chapter}章松手后走动的动物必须还能点开`);
});

console.log("sandbox animal select check ok");
