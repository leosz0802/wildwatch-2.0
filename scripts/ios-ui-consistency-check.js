const fs = require("fs");
const path = require("path");

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({ fonts: [] }, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 6.4 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "font") return target._font || "12px system-ui";
      if (prop === "canvas") return { width: 430, height: 932 };
      if (!(prop in target)) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      if (prop === "font") {
        target._font = value;
        target.fonts.push(value);
      } else target[prop] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  getMenuButtonBoundingClientRect() { return { left: 306, top: 12, width: 54, height: 30, right: 360, bottom: 42 }; },
  createCanvas() { return { width: 375, height: 667, getContext: () => fakeContext() }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onAppHide() {}, onAppShow() {}, showToast() {}
};

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function requireSource(fragment, message) {
  if (!source.includes(fragment)) throw new Error(message);
}

[
  "surface: \"rgba(255,255,255,.94)\"",
  "separator: \"rgba(60,60,67,.16)\"",
  "tint: \"#2f7d62\"",
  "brass: \"#d2ad58\"",
  "leather: \"#173c2e\"",
  "paper: \"#f6efdd\"",
  "const UI_FONT_STACK",
  "const UI_TEXT = Object.freeze",
  "const UI_METRICS = Object.freeze",
  "const UI_PILL = Object.freeze",
  "label: 11",
  "auxiliary: 10",
  "modalButtonHeight: 44",
  '["materialWarehouse", "fundRelief", "environmentMetric", "sandboxBrief", "friendContract", "friendContractPicker", "friendContractInbox", "friendContractHistoryDetail"].includes(modal.kind)',
  "const hiddenGlyphSize = this.normalizeTypeSize",
  'this.text(ctx, row.mine ? "我的市值 ›" : "市值 ›", x + w - 16, y + rowH * 0.76, 10',
  "controlRole(fill, onTap)",
  "controlStyle(role, fill, color)",
  "drawPremiumParchmentPanel(ctx, x, y, w, h",
  "drawPremiumLeatherPanel(ctx, x, y, w, h",
  "drawPremiumBrassPlate(ctx, x, y, w, h",
  "drawPremiumInfoCard(ctx, x, y, w, h"
].forEach((fragment) => requireSource(fragment, `missing iOS design token: ${fragment}`));

[
  "#9adfc4", "#88d18b", "#78c7b3", "#f2ad79", "#82c9dc",
  "ctx.font = `700 ${layout.title.size}px sans-serif`",
  "px sans-serif`",
  'y + rowH * 0.76, 8, "#7a847e"',
  "Math.round(size * .30)}px",
  "activeFill.addColorStop",
  "header.close.h, 12, \"#b76b63\""
].forEach((fragment) => {
  if (source.includes(fragment)) throw new Error(`legacy mixed UI style remains: ${fragment}`);
});

requireSource('this.roundRect(ctx, 2, y, this.width - 4, navH + 8, 18, "#f5ecd7"', "bottom tab bar is not using the premium parchment frame");
requireSource('ctx.fillStyle = "rgba(12,18,15,.48)"', "modal veil is not standardized");
requireSource('this.drawPremiumParchmentPanel(ctx, x, y, w, dockH, 18, { rivets: true })', "map information dock is not using the premium parchment surface");
requireSource('this.roundRect(ctx, x, safeY, bubbleW, bubbleH, 8, "rgba(255,255,255,.94)"', "map dialogue bubbles are not standardized");
requireSource('this.text(ctx, "待开放", cx + 19, y + 16, 9', "bottom navigation locked label is below the readable minimum");
requireSource('const bodyInset = this.width <= 340 ? 12 : 16', "compact modal does not reclaim horizontal reading space");

const game = new Game();
if (game.stopLoop) game.stopLoop();
game.state = createCharacter(null, "保护区卫士");
game.dpr = 1;
game.scrollY = 0;

[
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 430, height: 932 }
].forEach(({ width, height }) => {
  const ctx = fakeContext();
  game.ctx = ctx;
  game.width = width;
  game.height = height;
  game.info = { windowWidth: width, windowHeight: height, pixelRatio: 1, safeArea: { top: 0, bottom: height } };
  game.hitAreas = [];

  ["field", "population", "archive", "supplies", "patrol"].forEach((variant) => game.drawPageBackdrop(ctx, variant));
  game.drawStagePill(ctx, 12, 8, width - 24, { chapter: 2, title: "守护水路" }, { stage: 2, level: 1 });
  game.drawSandboxInfoDock(ctx, 8, 48, width - 16);
  game.screen = "home";
  game.drawBottomNav();
  game.infoDetailModal = { kicker: "保护区数据", title: "水源变化", icon: "water", lines: ["只展示数据与风险。"] };
  game.drawInfoDetailModal();

  if (!game.renderedSandboxStateTiles || game.renderedSandboxStateTiles.length !== 6) {
    throw new Error(`${width}x${height}: map dock lost its six two-row metrics`);
  }
  if (!ctx.fonts.length || ctx.fonts.some((font) => !String(font).includes("PingFang SC"))) {
    throw new Error(`${width}x${height}: a rendered label did not use the shared system font stack`);
  }
  const closeHit = game.hitAreas.find((area) => area.w >= 44 && area.h >= 44 && area.x > width * .68);
  if (!closeHit) throw new Error(`${width}x${height}: modal close target is smaller than the iOS 44pt target`);
  game.hitAreas = [];
  game.modalButton(ctx, 20, 200, width - 40, 36, "确认行动", "#1c3325", () => {});
  const ctaHit = game.hitAreas.find((area) => area.w === width - 40 && area.h >= 44);
  if (!ctaHit) throw new Error(`${width}x${height}: modal CTA is smaller than the shared 44pt control baseline`);
  game.infoDetailModal = null;
});

const iphone12 = {
  platform: "ios",
  system: "iOS 15.4",
  model: "iPhone 12",
  windowWidth: 390,
  windowHeight: 844,
  screenHeight: 844,
  pixelRatio: 3,
  statusBarHeight: 0,
  safeArea: { top: 0, bottom: 810 }
};
game.info = iphone12;
game.menuButtonRect = null;
game.menuButtonRectRetryAt = Date.now() + 60000;
if (game.compactStageTop() < 80) {
  throw new Error("iPhone 12 with an empty capsule rect still paints the chapter row under the status band");
}
game.menuButtonRect = { left: 296, right: 383, top: 48, bottom: 80, width: 87, height: 32 };
const belowCapsule = game.compactStageTop();
if (belowCapsule < 84) {
  throw new Error(`iPhone 12 chapter navigation must start below the capsule, got ${belowCapsule}`);
}
game.info = Object.assign({}, iphone12, { model: "iPhone 14", statusBarHeight: 47, safeArea: { top: 47, bottom: 810 } });
const otherIphone = game.compactStageTop();
if (otherIphone > 60) {
  throw new Error(`other iPhones should keep the chapter row on the capsule line, got ${otherIphone}`);
}
game.dpr = 2;
game.runtime.getMenuButtonBoundingClientRect = () => ({ left: 888, right: 1149, top: 144, bottom: 240, width: 261, height: 96 });
game.menuButtonRect = null;
game.menuButtonRectRetryAt = 0;
const scaled = game.refreshMenuButtonRectIfNeeded();
if (!scaled || Math.abs(scaled.top - 48) > 1 || Math.abs(scaled.bottom - 80) > 1) {
  throw new Error(`iPhone 12 physical capsule rect was not converted to points: ${JSON.stringify(scaled)}`);
}
game.info = iphone12;
if (game.compactStageTop() < 84) throw new Error("scaled iPhone 12 capsule still covers the chapter row");
game.width = 390;
game.height = 844;
game.screen = "home";
game.info = iphone12;
game.menuButtonRect = { left: 296, right: 383, top: 48, bottom: 80, width: 87, height: 32 };
const iphone12MapY = game.compactStageTop() + 32;
const iphone12MapH = game.homeSandboxMapHeight(iphone12MapY);
if (iphone12MapY + iphone12MapH > game.height - game.navHeight() + 1) {
  throw new Error(`iPhone 12 map runs behind the tab bar: bottom ${iphone12MapY + iphone12MapH}`);
}
game.height = 932;
game.info = Object.assign({}, iphone12, { model: "iPhone 14 Pro Max", windowHeight: 932, screenHeight: 932, statusBarHeight: 54, safeArea: { top: 59, bottom: 912 } });
const iphone14MapY = game.compactStageTop() + 32;
const iphone14MapH = game.homeSandboxMapHeight(iphone14MapY);
if (iphone14MapY + iphone14MapH > game.height - game.navHeight() + 1) {
  throw new Error(`iPhone 14 map runs behind the tab bar: bottom ${iphone14MapY + iphone14MapH}`);
}
const iphone12Visible = iphone12MapH / 844;
const iphone14Visible = iphone14MapH / 932;
if (Math.abs(iphone12Visible - iphone14Visible) > 0.08) {
  throw new Error(`map should fill a similar share of each phone, got ${iphone12Visible.toFixed(2)} vs ${iphone14Visible.toFixed(2)}`);
}

delete global.wx;
console.log("ios ui consistency check ok (3 viewports, 5 page variants)");
