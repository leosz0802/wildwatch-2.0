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
  "const UI_FONT_STACK",
  "controlRole(fill, onTap)",
  "controlStyle(role, fill, color)"
].forEach((fragment) => requireSource(fragment, `missing iOS design token: ${fragment}`));

[
  "#9adfc4", "#88d18b", "#78c7b3", "#f2ad79", "#82c9dc",
  "ctx.font = `700 ${layout.title.size}px sans-serif`",
  "activeFill.addColorStop",
  "header.close.h, 12, \"#b76b63\""
].forEach((fragment) => {
  if (source.includes(fragment)) throw new Error(`legacy mixed UI style remains: ${fragment}`);
});

requireSource('this.roundRect(ctx, 0, y, this.width, navH, 0, "rgba(251,253,250,.96)"', "bottom tab bar is not using the shared translucent surface");
requireSource('ctx.fillStyle = "rgba(12,18,15,.48)"', "modal veil is not standardized");
requireSource('this.roundRect(ctx, x, y, w, dockH, 20, "rgba(252,254,251,.94)"', "map information dock is not using the shared surface");
requireSource('this.roundRect(ctx, x, safeY, bubbleW, bubbleH, 8, "rgba(255,255,255,.94)"', "map dialogue bubbles are not standardized");

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

  if (!game.renderedSandboxStateTiles || game.renderedSandboxStateTiles.length !== 3) {
    throw new Error(`${width}x${height}: map dock lost its three read-only metrics`);
  }
  if (!ctx.fonts.length || ctx.fonts.some((font) => !String(font).includes("PingFang SC"))) {
    throw new Error(`${width}x${height}: a rendered label did not use the shared system font stack`);
  }
  const closeHit = game.hitAreas.find((area) => area.w >= 44 && area.h >= 44 && area.x > width * .68);
  if (!closeHit) throw new Error(`${width}x${height}: modal close target is smaller than the iOS 44pt target`);
  game.infoDetailModal = null;
});

delete global.wx;
console.log("ios ui consistency check ok (3 viewports, 5 page variants)");
