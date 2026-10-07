"use strict";

const assert = require("assert");
const { livingAnimalTotal } = require("../js/chapterRescueSystem");
const { chapterVisitorTotal } = require("../js/chapterTargets");

const toasts = [];
const guides = [];
let menuFavorite = null;
let addedToMiniProgram = false;

function mockContext() {
  const gradient = { addColorStop() {} };
  const rendered = [];
  const ctx = {
    rendered,
    save() {}, restore() {}, scale() {}, translate() {}, rotate() {},
    clearRect() {}, fillRect() {}, drawImage() {}, beginPath() {}, closePath() {},
    rect() {}, clip() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {},
    bezierCurveTo() {}, arc() {}, arcTo() {}, ellipse() {}, fill() {}, stroke() {},
    setLineDash() {},
    fillText(value) { rendered.push(String(value)); },
    measureText(text) { return { width: String(text || "").length * 12 }; },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; }
  };
  return ctx;
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 812, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 812, getContext: () => mockContext() }; },
  createImage() { return {}; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {},
  showShareMenu() {},
  onShareAppMessage() {},
  showToast(options) { toasts.push(options && options.title); },
  checkIsAddedToMyMiniProgram(options) {
    if (options && options.success) options.success({ added: addedToMiniProgram });
  },
  showFavoriteGuide(options) { guides.push(options); },
  onAddToFavorites(listener) { menuFavorite = listener; }
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.ctx = mockContext();
game.width = 375;
game.height = 812;
game.screen = "home";
game.scrollY = 0;
game.state = createCharacter(null, "保护区卫士");
const reserve = game.state.world.reserve;

function snapshot() {
  return {
    fund: reserve.fund,
    visitors: chapterVisitorTotal(reserve),
    animals: livingAnimalTotal(reserve)
  };
}

function drawAt(width, menuLeft) {
  game.width = width;
  game.menuButtonRect = { left: menuLeft, right: menuLeft + 82, top: 6, bottom: 38, width: 82, height: 32 };
  game.hitAreas = [];
  game.ctx = mockContext();
  game.drawReserveIdentityPill(game.ctx, 12, 12, width - 24, reserve);
  const header = game.renderedHomeIdentityPill;
  const favorite = header.favoriteButton;
  assert(favorite && favorite.label === "收藏", "沙盘顶栏必须有收藏按钮");
  assert(game.ctx.rendered.includes("收藏"), "收藏按钮要画出来");
  assert(favorite.x + favorite.w + 6 <= header.rankButton.x, "收藏必须紧挨在好友榜左侧");
  assert(header.rankButton.x + header.rankButton.w + 6 <= header.audioButton.x, "好友榜和声音按钮的间距保持不变");
  assert(header.audioButton.x + header.audioButton.w <= header.menuSafeLeft - 8, "收藏不能把顶栏推进微信胶囊");
  assert(header.affordance === "好友榜 ›" && header.avoidsSystemMenu);
  const favoriteHit = game.hitAreas.find((hit) => hit.x === favorite.x && hit.w === favorite.w);
  assert(favoriteHit && favoriteHit.h >= 24, "收藏点击区要够大");
  return favoriteHit;
}

[
  { width: 320, menuLeft: 226 },
  { width: 375, menuLeft: 282 },
  { width: 430, menuLeft: 335 }
].forEach((viewport) => drawAt(viewport.width, viewport.menuLeft));

const before = snapshot();
const favoriteHit = drawAt(375, 282);
delete game.runtime.showFavoriteGuide;
game.infoDetailModal = null;
  favoriteHit.onTap();
assert(game.infoDetailModal && game.infoDetailModal.kind === "miniGameFavorite", "微信里点击收藏要说明添加到我的小程序");
assert(game.infoDetailModal.items[0].body.includes("添加到我的小程序"));
assert.deepStrictEqual(snapshot(), before, "收藏引导不得改变基金、游客或动物");

game.runtime.showFavoriteGuide = (options) => { guides.push(options); };
game.infoDetailModal = null;
guides.length = 0;
  favoriteHit.onTap();
assert(guides.length === 1 && guides[0].content === "添加到我的小程序", "支持官方收藏引导时直接调起");
assert.strictEqual(game.infoDetailModal, null);
assert.deepStrictEqual(snapshot(), before);

addedToMiniProgram = true;
game.miniGameFavorite.refresh();
assert.strictEqual(game.miniGameFavorite.added, true);
toasts.length = 0;
  favoriteHit.onTap();
assert(toasts.includes("已在我的小程序里"));
assert.deepStrictEqual(snapshot(), before, "已收藏状态也不得发奖");

const menuPayload = menuFavorite();
assert(menuPayload && /继续守护/.test(menuPayload.title), "右上角菜单收藏要带上保护区标题");

const { recordMiniGameFavoriteLogin, miniGameFavoriteButtonVisible, MINI_GAME_FAVORITE_LOGIN_LIMIT } = require("../js/wechatFavorite");
const loginStore = {};
const loginRuntime = {
  getStorageSync(key) { return loginStore[key]; },
  setStorageSync(key, value) { loginStore[key] = value; }
};
const loginCounts = [];
for (let turn = 0; turn < 6; turn += 1) loginCounts.push(recordMiniGameFavoriteLogin(loginRuntime));
assert.deepStrictEqual(loginCounts, [1, 2, 3, 4, 5, 6]);
assert.equal(MINI_GAME_FAVORITE_LOGIN_LIMIT, 5);
assert.equal(miniGameFavoriteButtonVisible(5), true);
assert.equal(miniGameFavoriteButtonVisible(6), false);

const drawnBefore = game.miniGameFavoriteLoginCount;
drawAt(375, 282);
assert.equal(game.miniGameFavoriteLoginCount, drawnBefore, "反复打开沙盘不能把一次登录算成多次");

game.miniGameFavoriteLoginCount = 5;
const fifth = drawAt(375, 282);
assert(fifth, "第5次登录仍显示收藏");

game.miniGameFavoriteLoginCount = 6;
game.hitAreas = [];
game.ctx = mockContext();
game.drawReserveIdentityPill(game.ctx, 12, 12, 351, reserve);
assert.equal(game.renderedHomeIdentityPill.favoriteButton, null);
assert.equal(game.ctx.rendered.includes("收藏"), false, "第6次登录起收藏按钮永远不再出现");
assert.equal(game.hitAreas.some((hit) => hit.w === 46), false);
assert(game.ctx.rendered.includes("好友榜 ›"));

console.log("minigame favorite check ok");
