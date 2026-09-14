function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => {
        const size = Number((String(target.font || "12px").match(/([\d.]+)px/) || [])[1]) || 12;
        return { width: Array.from(String(text || "")).reduce((sum, char) => sum + size * (char.charCodeAt(0) > 255 ? 1 : .6), 0) };
      };
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
  if (!header || header.split !== "horizontal" || header.background !== "leatherArchive") throw new Error(`${viewport.width}: patrol header did not use the shared leather archive`);
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
    const title = actionHeader.titleBounds;
    const pill = actionHeader.pill;
    if (!title || ![title.x, title.y, title.w, title.h, actionHeader.titleSize].every(Number.isFinite)) throw new Error(`${viewport.width}/${item.id}: title geometry missing`);
    if (title.x < actionHeader.icon.cx + actionHeader.icon.size / 2 + 8 || title.x + title.w > game.renderedPatrolTask.x + game.renderedPatrolTask.w - 18) throw new Error(`${viewport.width}/${item.id}: title leaves its safe area`);
    if (!(title.y >= pill.y + pill.h + 4 || title.x + title.w <= pill.x - 8)) throw new Error(`${viewport.width}/${item.id}: title overlaps state pill`);
    const bottomGap = game.renderedPatrolTask.buttonY - game.renderedPatrolTask.contentBottom;
    if (!Number.isFinite(bottomGap) || bottomGap < 8 || bottomGap > 24) throw new Error(`${viewport.width}/${item.id}: excessive or overlapping footer gap ${bottomGap}`);
    if (actionHeader.pill.x + actionHeader.pill.w > game.renderedPatrolTask.x + game.renderedPatrolTask.w - 12) throw new Error(`${viewport.width}/${item.id}: state pill exceeds safe area`);
  });

  game.patrolTaskModal = null;
  game.infoDetailModal = {
    kind: "genericInfo",
    kicker: "保护区档案 · 现场记录",
    title: "边界巡查详情",
    icon: "leaf",
    items: [{ tag: "迹象", title: "泥岸留下新脚印", body: "沿水线继续确认来源。" }],
    footer: "记录来自当前保护区状态。"
  };
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const infoFrame = game.infoDetailModal.renderedInfoFrame;
  if (!infoFrame || infoFrame.style !== "field-archive-v2") throw new Error(`${viewport.width}: generic information modal missed the shared archive frame`);
  if (infoFrame.y < 0 || infoFrame.y + infoFrame.h > viewport.height) throw new Error(`${viewport.width}: premium information modal exceeds the viewport`);
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
if (!source.includes('style: "field-task-v2"') || !source.includes('background: "leatherArchive"')) throw new Error("task modal visual audit metadata is missing");
if (!source.includes('ctx.fillStyle = "rgba(12,18,15,.48)"')) throw new Error("task modal does not use the standardized system veil");
if (!source.includes("this.drawPremiumLeatherPanel(ctx, x, y, w, h, 24, { rivets: true })")) throw new Error("info modal does not use the shared leather archive frame");
if (!source.includes("this.drawPremiumBrassPlate(ctx, header.close.x, header.close.y, header.close.w, header.close.h")) throw new Error("info modal close control does not use the shared brass treatment");
if (!source.includes('style: "field-archive-v2"') || !source.includes('materials: ["leather", "parchment", "brass"]')) throw new Error("info modal visual audit metadata is missing");
if (!(game.infoDetailModalHeight({ kind: "animalLetterInbox", letters: [{}, {}] }) < game.infoDetailModalHeight({ kind: "animalLetterReader" }))) throw new Error("short inboxes should not retain the generic full-height modal");
if (source.includes("addColorStop(.341") || source.includes("addColorStop(.241")) throw new Error("a diagonal modal header split remains");
if (!source.includes("compact ? 10 : 11")) throw new Error("compact species dialogue did not receive readable typography");
if (source.includes("compact ? 8 : 9")) throw new Error("8px compact species dialogue returned");

delete global.wx;
console.log("modal header style check ok");
