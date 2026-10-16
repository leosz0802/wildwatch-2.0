"use strict";

const assert = require("node:assert/strict");
const { Game, usesFragileCanvas, canvasPlatformId } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { chapterTargets, chapterVisitorTotal } = require("../js/chapterTargets");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");

function fakeContext() {
  const gradient = { addColorStop() {} };
  const target = {
    shadowBlur: 0,
    shadowColor: "#000",
    globalAlpha: 1,
    canvas: { width: 390, height: 844 }
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return obj.canvas;
      if (prop in obj) return obj[prop];
      if (!obj[prop]) obj[prop] = () => {};
      return obj[prop];
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    }
  });
}

function installWx(platform) {
  global.wx = {
    getSystemInfoSync() {
      return { windowWidth: 390, windowHeight: 844, pixelRatio: 2, platform };
    },
    createCanvas() {
      return { width: 390, height: 844, getContext() { return fakeContext(); } };
    },
    createImage() { return { loaded: true, set src(value) { this._src = value; }, get src() { return this._src; } }; },
    getStorageSync() { return null; },
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
}

function makeGame(platform) {
  installWx(platform);
  const game = new Game();
  if (game.stopLoop) game.stopLoop();
  game.render = () => {};
  game.info = { windowWidth: 390, windowHeight: 844, pixelRatio: 2, platform };
  game.canvasShadowsUnsafe = usesFragileCanvas(game.info);
  game.width = 390;
  game.height = 844;
  game.dpr = 1;
  game.ctx = fakeContext();
  game.lockUnsafeCanvasShadows(game.ctx);
  game.state = createCharacter(null, `三端-${platform}`);
  game.screen = "home";
  game.art = Object.assign({}, game.art, {
    map: { loaded: true, width: 1672, height: 941 }
  });
  return game;
}

const PLATFORMS = [
  { id: "ios", fade: "short", fragile: false, shadows: true },
  { id: "android", fade: "skip", fragile: true, shadows: false },
  { id: "ohos", fade: "skip", fragile: true, shadows: false }
];

PLATFORMS.forEach((spec) => {
  assert.equal(canvasPlatformId({ platform: spec.id }), spec.id, `${spec.id} platform id`);
  assert.equal(usesFragileCanvas({ platform: spec.id }), spec.fragile, `${spec.id} fragile canvas`);

  const game = makeGame(spec.id);
  game.markScreenChange();
  if (spec.fade === "skip") {
    assert.equal(game.skipsScreenFade(), true, `${spec.id} must skip whole-page fade`);
    assert.equal(game.screenFade(), 1, `${spec.id} first paint must stay fully opaque`);
  } else {
    assert.equal(game.skipsScreenFade(), false, `${spec.id} may keep a short fade`);
    assert.ok(game.screenFade() >= 0.72, `${spec.id} first fade must stay readable`);
  }
  assert.equal(game.allowsCanvasShadows(), spec.shadows, `${spec.id} shadow policy`);
  if (!spec.shadows) {
    game.ctx.shadowBlur = 40;
    assert.equal(game.ctx.shadowBlur, 0, `${spec.id} must lock shadowBlur off`);
  }

  game.hitAreas = [];
  assert.doesNotThrow(() => game.drawCurrentScreen(game.ctx), `${spec.id} home draw must not throw`);
  const mapHits = (game.hitAreas || []).filter((hit) => hit && hit.w > 8 && hit.h > 8);
  assert.ok(mapHits.length >= 3, `${spec.id} sandbox must expose tappable map/hud hits, got ${mapHits.length}`);

  const reserve = game.state.world.reserve;
  const hudAnimals = livingAnimalTotal(reserve);
  const hudVisitors = chapterVisitorTotal(reserve);
  const gate = chapterTargets(1);
  assert.ok(hudAnimals > 0, `${spec.id} animal HUD must have a live count`);
  assert.ok(hudVisitors >= 0, `${spec.id} visitor HUD must be chapter-scoped`);
  assert.equal(gate.animals, 12, `${spec.id} chapter 1 animal gate stays 12`);
  assert.equal(gate.visitors, 50, `${spec.id} chapter 1 visitor gate stays 50`);

  const diceKinds = ["collectionDice", "strategicDice"];
  diceKinds.forEach((kind) => {
    game.infoDetailModal = {
      kind,
      phase: "resolved",
      displayRoll: 4,
      explorationMode: "animalDice",
      title: "探索自然遗留物",
      kicker: "动物引路 · 物资与知识",
      icon: "eye",
      actionLabel: "点数已锁定",
      action() {},
      footer: "点数与结果同步 · 每次只结算一次",
      preview: { level: 1, levelContribution: 0, relationshipContribution: 1, requiredScore: 5, relationship: { securityAverage: 43, wildnessAverage: 84 } },
      lead: { quality: 2, animal: { name: "晨角", trust: 85 } },
      method: { id: "animal" },
      dicePreview: { routeModifier: 1, resourceModifier: 2, threshold: 5 }
    };
    game.hitAreas = [];
    assert.doesNotThrow(() => game.drawInfoDetailModal(), `${spec.id} ${kind} must draw`);
    const dice = game.infoDetailModal.renderedDiceStage;
    assert.ok(dice && dice.die, `${spec.id} ${kind} must render a die`);
    assert.ok(dice.die.x >= 0 && dice.die.x + dice.die.size <= game.width, `${spec.id} ${kind} die must stay on screen`);
    assert.equal(dice.drawing.face, 4, `${spec.id} ${kind} face must match the locked roll`);
  });

  game.infoDetailModal = {
    kind: "materialExploration",
    phase: "ready",
    explorationMode: "archery",
    displayRoll: 4,
    archeryAimStartedAt: Date.now(),
    title: "瞄准后射箭",
    kicker: "射箭判定",
    icon: "eye",
    actionLabel: "射箭",
    action() {},
    footer: "结果见结算页",
    preview: { level: 1, requiredScore: 3 },
    lead: { quality: 2, animal: { name: "晨角", trust: 85 } },
    method: { id: "animal" }
  };
  game.hitAreas = [];
  assert.doesNotThrow(() => game.drawInfoDetailModal(), `${spec.id} archery modal must draw`);
  const fire = game.infoDetailModal.renderedArcheryFireButton;
  assert.ok(fire && fire.w >= 80, `${spec.id} archery fire button must be present`);
  const stage = game.infoDetailModal.renderedDiceStage;
  assert.ok(stage && stage.target, `${spec.id} archery modal must render a target`);
});

console.log("platform matrix strict check ok (ios/android/ohos home, dice, archery, fade, shadows)");
