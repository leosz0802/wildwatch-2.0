function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 430, height: 932 };
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
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext: () => createFakeContext() }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onAppHide() {}, onAppShow() {}, showToast() {}
};

const fs = require("fs");
const path = require("path");
const { Game } = require("../js/game");
const source = fs.readFileSync(path.resolve(__dirname, "../js/game.js"), "utf8");
const game = new Game();
if (game.stopLoop) game.stopLoop();

[
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 430, height: 932 }
].forEach((viewport) => {
  game.width = viewport.width;
  game.height = viewport.height;
  const x = 20;
  const y = 24;
  const w = viewport.width - 40;
  const layout = game.infoDetailHeaderLayout(game.ctx, {
    kicker: "大型食草动物 · 安全敏感型",
    title: "跨区域联合巡护警报器补给"
  }, x, y, w);
  const iconLeft = layout.icon.cx - layout.icon.size / 2;
  const iconRight = layout.icon.cx + layout.icon.size / 2;
  if (iconLeft < x + 12 || iconRight > layout.textX - 10) throw new Error(`${viewport.width}: header icon is not on a safe grid`);
  if (layout.textX + layout.textW > layout.close.x - 8) throw new Error(`${viewport.width}: title safe area overlaps close button`);
  if (layout.close.x + layout.close.w > x + w - 12) throw new Error(`${viewport.width}: close button exceeds modal safe area`);
  if (layout.closeHit.w < 44 || layout.closeHit.h < 44) throw new Error(`${viewport.width}: close hit area is too small`);
  if (layout.titleSize < 15 || layout.kickerSize < 10) throw new Error(`${viewport.width}: header text became unreadably small`);

  game.width = viewport.width;
  game.height = viewport.height;
  game.settlementModal = null;
  game.infoDetailModal = null;
  game.selectedPurchaseId = "fieldKit";
  const purchaseOption = Object.assign({}, game.reserveActionOptions().find((item) => item.id === "buySupplies"), {
    purchaseId: "fieldKit"
  });
  game.patrolTaskModal = purchaseOption;
  game.hitAreas = [];
  game.drawPatrolTaskModal();
  const header = (game.renderedPatrolTask || {}).header;
  if (!header || header.split !== "horizontal" || header.background !== "horizontalBands") throw new Error(`${viewport.width}: patrol header did not use horizontal safe bands`);
  const patrolIconRight = header.icon.cx + header.icon.size / 2;
  if (patrolIconRight > header.textX - 8) throw new Error(`${viewport.width}: patrol header icon overlaps title area`);
  if (header.pill) throw new Error(`${viewport.width}: purchase header repeats its result in a hero pill`);
  if (header.textX + header.textW > game.renderedPatrolTask.x + game.renderedPatrolTask.w - 18) throw new Error(`${viewport.width}: purchase title exceeds modal safe area`);
  if (header.titleSize < 17 || header.kickerSize < 10) throw new Error(`${viewport.width}: patrol header text became unreadably small`);

  // Patrol actions retain a meaningful state pill, but it must never enter the
  // title safe area. Exercise every action family at all supported widths.
  game.reserveActionOptions().filter((item) => !["buySupplies", "salvage"].includes(item.id)).forEach((item) => {
    game.patrolTaskModal = item;
    game.patrolOperationPlan = null;
    game.hitAreas = [];
    game.drawPatrolTaskModal();
    const actionHeader = (game.renderedPatrolTask || {}).header;
    if (!actionHeader || !actionHeader.pill) throw new Error(`${viewport.width}/${item.id}: patrol state pill missing`);
    if (actionHeader.textX + actionHeader.textW > actionHeader.pill.x - 8) throw new Error(`${viewport.width}/${item.id}: title overlaps state pill`);
    if (actionHeader.pill.x + actionHeader.pill.w > game.renderedPatrolTask.x + game.renderedPatrolTask.w - 12) throw new Error(`${viewport.width}/${item.id}: state pill exceeds safe area`);
  });
});

if (source.includes("this.roundRect(ctx, x + 18, y + 20, 52, 52")) throw new Error("legacy info-modal frame-in-frame icon remains");
if (source.includes("this.roundRect(ctx, x + 18, y + 18, 64, 64")) throw new Error("legacy patrol-modal frame-in-frame icon remains");
const headerIconStart = source.indexOf("\n  drawModalHeaderIcon(ctx");
const headerIconEnd = source.indexOf("\n  drawInfoDetailModal()", headerIconStart);
const headerIconSource = source.slice(headerIconStart, headerIconEnd);
if (!headerIconSource.includes("ctx.drawImage(image, 12, 12, 72, 72")) throw new Error("modal header should crop the icon to its central circular artwork");
if (headerIconSource.includes("this.drawUiIconBadge(ctx")) throw new Error("modal header still adds a second badge shadow below the icon");
if (!source.includes('layout: "materialSupply"') || !source.includes("drawMaterialSupplyMetricCard")) throw new Error("supply detail did not switch to the horizontal summary layout");
if (!source.includes("drawPurchaseTaskResultStrip") || !source.includes("purchase ? 350 : 380")
  || !source.includes("purposeH: 32") || !source.includes("metricLayouts") || !source.includes('this.text(ctx, "下一步"')) {
  throw new Error("task modal did not keep the compact result-first hierarchy");
}
if (!source.includes('ctx.fillStyle = "rgba(12,18,15,.48)"')) throw new Error("task modal does not use the standardized system veil");
if (!source.includes('header.close.h, header.close.w / 2, "rgba(255,255,255,.90)"')) throw new Error("info modal close control is not a neutral circular system control");
if (source.includes("addColorStop(.341") || source.includes("addColorStop(.241")) throw new Error("a diagonal modal header split remains");
if (!source.includes("compact ? 10 : 11")) throw new Error("compact species dialogue did not receive readable typography");
if (source.includes("compact ? 8 : 9")) throw new Error("8px compact species dialogue returned");

delete global.wx;
console.log("modal header style check ok");
