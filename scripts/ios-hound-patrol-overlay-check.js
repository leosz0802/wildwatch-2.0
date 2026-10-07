"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

const handlers = {};
global.wx = {
  getSystemInfoSync() { return { platform: "ios", system: "iOS 17.5", windowWidth: 375, windowHeight: 667, pixelRatio: 2 }; },
  createCanvas() { return { width: 750, height: 1334, getContext: () => fakeContext() }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart(handler) { handlers.start = handler; },
  onTouchMove(handler) { handlers.move = handler; },
  onTouchEnd(handler) { handlers.end = handler; },
  onTouchCancel(handler) { handlers.cancel = handler; },
  onKeyboardConfirm() {},
  onAppHide() {},
  onAppShow() {},
  showToast() {}
};

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ globalAlpha: 1, canvas: { width: 750, height: 1334 } }, {
    get(target, property) {
      if (property === "measureText") return (value) => ({ width: String(value || "").length * 7 });
      if (property === "createLinearGradient" || property === "createRadialGradient") return () => gradient;
      if (!target[property]) target[property] = () => {};
      return target[property];
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
}

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, "iOS巡逻遮罩");
  game.state.world.reserve.fund = 800;
  game.screen = "league";
  game.leagueScope = "world";
  game.ctx = fakeContext();
  game.width = 375;
  game.height = 667;
  game.dpr = 1;
  game.toast = () => {};
  game.requestRender = () => {};
  let parks = 0;
  let stores = 0;
  const canvas = { width: 320, height: 240 };
  game.runtime = {
    getStorageSync() { return {}; },
    setStorageSync() { stores += 1; }
  };
  game.wechatFriends = {
    presentedThisFrame: true,
    overlayParked: false,
    surfaceMode: "nicknames",
    sharedCanvas: canvas,
    isSharedCanvasOversized() { return (Number(this.sharedCanvas.width) || 0) > 1 || (Number(this.sharedCanvas.height) || 0) > 1; },
    parkOverlay() {
      parks += 1;
      this.presentedThisFrame = false;
      this.overlayParked = true;
      this.surfaceMode = "";
      this.sharedCanvas.width = 1;
      this.sharedCanvas.height = 1;
      return true;
    },
    pointer() {},
    drawFriendNicknames() {
      this.presentedThisFrame = true;
      this.overlayParked = false;
      this.sharedCanvas.width = 320;
      this.sharedCanvas.height = 240;
      return true;
    }
  };
  game.cloudService = {
    supported: true,
    feature() { return true; },
    sessionReady() { return true; },
    session: { token: "signed-session-token", expiresAt: Date.now() + 3600000 },
    routeUnavailable() { return false; }
  };
  game.paintLeagueUnderlay = function paintLeagueUnderlay() {
    if (!this.shouldParkOpenDataForOverlay()) {
      this.overlayWorldFriendNicknames(this.ctx, [{
        x: 40, y: 90, w: 140, h: 18, worldPlayerId: "friend1234567890abcd", fallback: "微信好友"
      }]);
    }
  };
  game.render = function paintPatrolOverlay() {
    this.hitAreas = [];
    this.paintLeagueUnderlay();
    if (this.infoDetailModal) this.drawInfoDetailModal();
    this.parkIdleOpenDataOverlay();
  };
  return { game, counts: { parks: () => parks, stores: () => stores } };
}

function tapBackdrop(game) {
  const backdrop = game.hitAreas.find((hit) => game.isFullScreenBackdropHit(hit));
  assert.ok(backdrop, "patrol modal must keep a full-screen HUD backdrop");
  backdrop.onTap();
}

const source = fs.readFileSync(require.resolve("../js/game.js"), "utf8");
assert.match(source, /shouldParkOpenDataForOverlay\(\) && this\.wechatFriends/, "blocking patrol overlays must shrink the native open-data canvas");
assert.match(source, /if \(!this\.blockingOverlayOpen\(\)\) \{\n\s+this\.overlayWorldFriendNicknames/, "world rank nicknames must not present under a patrol dialog");
assert.match(source, /isWorldHoundPatrolModal\(modal\)/, "tapping the dimmed backdrop must dismiss a stuck patrol dialog");

const { game, counts } = makeGame();
game.paintLeagueUnderlay();
assert.equal(game.wechatFriends.presentedThisFrame, true, "world nicknames still present while the board is visible");
assert.equal(game.wechatFriends.isSharedCanvasOversized(), true, "iOS leftover ranking canvas starts oversized");

const opened = game.openWorldHoundPatrolForLeaguePlayer({
  id: "cloud_other",
  worldPlayerId: "other1234567890abcd",
  mine: false,
  profileComplete: true,
  name: "云岭·6474的湖岸哨站",
  owner: "云岭·6474",
  safety: 40,
  animals: 80,
  visitors: 120
});
assert.equal(opened, true, "world board should still open the patrol confirm");
assert.equal(game.infoDetailModal.kind, "worldHoundPatrolConfirm");
assert.equal(game.shouldParkOpenDataForOverlay(), true, "patrol confirm must park the ranking overlay");
assert.ok(counts.parks() >= 1, "opening patrol must shrink the iOS native overlay immediately");
assert.equal(game.wechatFriends.overlayParked, true);
assert.equal(game.wechatFriends.isSharedCanvasOversized(), false, "patrol confirm must not leave a touch-eating shared canvas");
assert.equal(game.overlayWorldFriendNicknames(game.ctx, [{
  x: 40, y: 90, w: 140, h: 18, worldPlayerId: "friend1234567890abcd", fallback: "微信好友"
}]), false, "patrol confirm must not republish world nicknames");

const storesBeforeRead = counts.stores();
game.worldHoundPatrolState(game.state.world.reserve);
assert.equal(counts.stores(), storesBeforeRead, "reading patrol state during render must not write wx storage");

game.render();
assert.equal(game.wechatFriends.presentedThisFrame, false, "a later league paint must not revive the overlay under the dialog");
assert.equal(game.wechatFriends.isSharedCanvasOversized(), false, "the parked ranking canvas stays 1px after the dialog paints");
assert.ok(game.hitAreas.some((hit) => game.isFullScreenBackdropHit(hit)), "patrol confirm keeps a dismissible backdrop");
tapBackdrop(game);
assert.equal(game.infoDetailModal, null, "tapping the dimmed field must close a stuck iOS patrol dialog");

const historyGame = makeGame();
historyGame.game.openWorldHoundPatrolHistory(false);
assert.equal(historyGame.game.infoDetailModal.kind, "worldHoundPatrolHistory");
assert.equal(historyGame.game.shouldParkOpenDataForOverlay(), true);
assert.ok(historyGame.counts.parks() >= 1, "patrol history on the ranking page must park the native overlay");
historyGame.game.render();
tapBackdrop(historyGame.game);
assert.equal(historyGame.game.infoDetailModal, null, "history backdrop must also recover a frozen iOS ranking page");

const resultGame = makeGame();
resultGame.game.screen = "home";
resultGame.game.pendingWorldHoundPatrolResults = [{
  noticeRole: "actor",
  targetName: "云岭哨站",
  appliedReward: { fund: 8, visitors: 2, animals: 1 }
}];
assert.equal(resultGame.game.openPendingWorldHoundPatrolResult(), true);
assert.equal(resultGame.game.infoDetailModal.kind, "worldHoundPatrolResult");
assert.ok(resultGame.counts.parks() >= 1, "sandbox patrol results must park any leftover ranking overlay");

console.log("ios hound patrol overlay check ok");
