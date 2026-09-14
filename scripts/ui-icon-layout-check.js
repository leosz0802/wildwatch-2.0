const { createCharacter } = require("../js/storage");

const viewport = { width: 375, height: 667 };
let currentRecords = null;

function parseFontSize(font) {
  const match = /(\d+(?:\.\d+)?)px/.exec(String(font || ""));
  return match ? Number(match[1]) : 12;
}

function estimateTextWidth(text, size) {
  return String(text || "").split("").reduce((sum, ch) => {
    if (/\s/.test(ch)) return sum + size * 0.34;
    return sum + (ch.charCodeAt(0) > 255 ? size * 0.92 : size * 0.56);
  }, 0);
}

function createRecordContext(records) {
  const gradient = { addColorStop() {} };
  const state = {
    font: "12px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    globalAlpha: 1,
    tx: 0,
    ty: 0
  };
  const stack = [];
  return {
    save() { stack.push(Object.assign({}, state)); },
    restore() {
      const prev = stack.pop();
      if (prev) Object.assign(state, prev);
    },
    scale() {},
    translate(x, y) {
      state.tx += x || 0;
      state.ty += y || 0;
    },
    rotate() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    closePath() {},
    rect() {},
    clip() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    arc() {},
    arcTo() {},
    ellipse() {},
    fill() {},
    stroke() {},
    setLineDash() {},
    drawImage(image, ...args) {
      const src = image && image._src || "";
      let target = null;
      if (args.length === 4) target = { x: args[0], y: args[1], w: args[2], h: args[3] };
      if (args.length === 8) target = { sx: args[0], sy: args[1], sw: args[2], sh: args[3], x: args[4], y: args[5], w: args[6], h: args[7] };
      records.images.push({
        src,
        argCount: args.length + 1,
        x: target ? target.x + state.tx : NaN,
        y: target ? target.y + state.ty : NaN,
        w: target ? target.w : NaN,
        h: target ? target.h : NaN,
        sx: target && target.sx,
        sy: target && target.sy,
        sw: target && target.sw,
        sh: target && target.sh,
        phase: records.phase
      });
    },
    fillText(text, x, y) {
      const size = parseFontSize(state.font);
      const width = estimateTextWidth(text, size);
      let left = (x || 0) + state.tx;
      if (state.textAlign === "center") left -= width / 2;
      if (state.textAlign === "right" || state.textAlign === "end") left -= width;
      records.texts.push({
        text: String(text || ""),
        x: left,
        y: (y || 0) + state.ty - size,
        baseline: (y || 0) + state.ty,
        w: width,
        h: size + 3,
        size,
        phase: records.phase
      });
    },
    measureText(text) {
      return { width: estimateTextWidth(text, parseFontSize(state.font)) };
    },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    set fillStyle(value) { this._fillStyle = value; },
    get fillStyle() { return this._fillStyle; },
    set strokeStyle(value) { this._strokeStyle = value; },
    get strokeStyle() { return this._strokeStyle; },
    set lineWidth(value) { this._lineWidth = value; },
    get lineWidth() { return this._lineWidth || 1; },
    set font(value) { state.font = value; },
    get font() { return state.font; },
    set textAlign(value) { state.textAlign = value; },
    get textAlign() { return state.textAlign; },
    set textBaseline(value) { state.textBaseline = value; },
    get textBaseline() { return state.textBaseline; },
    set globalAlpha(value) { state.globalAlpha = value; },
    get globalAlpha() { return state.globalAlpha; },
    set shadowColor(value) { this._shadowColor = value; },
    get shadowColor() { return this._shadowColor; },
    set shadowBlur(value) { this._shadowBlur = value; },
    get shadowBlur() { return this._shadowBlur || 0; },
    set shadowOffsetY(value) { this._shadowOffsetY = value; },
    get shadowOffsetY() { return this._shadowOffsetY || 0; }
  };
}

global.wx = {
  getSystemInfoSync() {
    return { windowWidth: viewport.width, windowHeight: viewport.height, pixelRatio: 1 };
  },
  createCanvas() {
    return {
      width: viewport.width,
      height: viewport.height,
      getContext() {
        return createRecordContext(currentRecords);
      }
    };
  },
  createImage() {
    return {
      loaded: true,
      set src(value) {
        this._src = value;
        this.loaded = true;
        if (this.onload) this.onload();
      },
      get src() {
        return this._src;
      }
    };
  },
  getStorageSync() {
    return null;
  },
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

currentRecords = { phase: "boot", images: [], texts: [] };
const { Game } = require("../js/game");
const game = new Game();
if (game.stopLoop) game.stopLoop();
game.width = viewport.width;
game.height = viewport.height;
game.canvas.width = viewport.width;
game.canvas.height = viewport.height;
game.state = createCharacter(null, "保护区卫士");
game.selectedTarget = game.state.world.knownCharacters[0];
game.speakingAnimalId = game.selectedTarget.id;
game.selectedRegionId = game.defaultRegionId();

function resetRecords(phase) {
  currentRecords = { phase, images: [], texts: [] };
  game.ctx = createRecordContext(currentRecords);
  return currentRecords;
}

function uiImages(records) {
  return records.images.filter((image) => image.src.includes("assets/art/ui-v"));
}

function fail(message) {
  throw new Error(message);
}

function checkUiImageBasics(records, context) {
  uiImages(records).forEach((image) => {
    if (image.src.includes("icons-complete-sheet-640.png") || image.src.includes("assets/art/ui-v2/")) {
      fail(`${context}: runtime drew the deprecated ui icon sheet`);
    }
    if (!image.src.includes("assets/art/ui-v3/icons/")) {
      fail(`${context}: ui image should come from independent icon files: ${image.src}`);
    }
    const centeredCrop = image.argCount === 9 && image.sx === 12 && image.sy === 12 && image.sw === 72 && image.sh === 72;
    if (image.argCount !== 5 && !centeredCrop) {
      fail(`${context}: ui icon used an unsupported drawImage crop (${image.argCount}) for ${image.src}`);
    }
    if (image.w > 60 || image.h > 60) {
      fail(`${context}: ui icon too large ${Math.round(image.w)}x${Math.round(image.h)} from ${image.src}`);
    }
    if (!Number.isFinite(image.x) || !Number.isFinite(image.y) || !Number.isFinite(image.w) || !Number.isFinite(image.h)) {
      fail(`${context}: ui icon target rect is invalid`);
    }
  });
}

function checkPatrolTiles() {
  game.prepareLocalAssetsForScreen("action");
  const reserve = game.state.world.reserve || {};
  const groups = game.patrolActionGroups(reserve);
  const tileGap = 10;
  const groupW = viewport.width - 24;
  const tileW = (groupW - tileGap - 32) / 2;
  groups.forEach((group, groupIndex) => {
    group.options.forEach((option, optionIndex) => {
      const buttonValue = game.patrolButtonValue(option.id, reserve);
      const numericTokens = (buttonValue.match(/-?\d+/g) || []);
      if (numericTokens.length > 1) {
        fail(`patrol tile ${option.id}: button value should expose one current stock number, got ${buttonValue}`);
      }
      const x = 28 + optionIndex * (tileW + tileGap);
      const y = 20 + groupIndex * 118;
      const h = 84;
      const records = resetRecords(`patrol:${option.id}`);
      game.drawPatrolActionTile(game.ctx, option, x, y, tileW, h, reserve);
      checkUiImageBasics(records, `patrol tile ${option.id}`);
      const icons = uiImages(records);
      if (!icons.length) fail(`patrol tile ${option.id}: missing ui icon`);
      const icon = icons[0];
      if (icon.x < x + 8 || icon.x + icon.w > x + tileW - 8) {
        fail(`patrol tile ${option.id}: icon exceeds horizontal safe area`);
      }
      if (icon.y < y + 8 || icon.y + icon.h > y + h - 12) {
        fail(`patrol tile ${option.id}: icon exceeds its left visual band`);
      }
      const title = records.texts.find((item) => item.text === (option.shortLabel || option.label));
      if (!title) fail(`patrol tile ${option.id}: title was not drawn`);
      if (icon.x + icon.w > title.x - 6) {
        fail(`patrol tile ${option.id}: left icon overlaps the result text column`);
      }
      const preview = game.patrolActionTilePreview(option.id, reserve, game.actionResourceStatus(option.id, reserve));
      const primary = records.texts.find((item) => item.text === preview.value);
      if (!primary || primary.size < 12 || primary.baseline <= title.baseline + 18) {
        fail(`patrol tile ${option.id}: core predicted change is missing or not prominent`);
      }
      const cost = records.texts.find((item) => item.text === buttonValue);
      if (!cost) fail(`patrol tile ${option.id}: cost line was not drawn`);
      if (cost.baseline <= primary.baseline + 10 || cost.baseline > y + h - 4) {
        fail(`patrol tile ${option.id}: cost line is outside its safe band`);
      }
    });
  });
}

function checkMaterialPage() {
  game.prepareLocalAssetsForScreen("role");
  const records = resetRecords("role-screen");
  game.screen = "role";
  game.scrollY = 0;
  game.render();
  checkUiImageBasics(records, "material screen");
  const navTop = viewport.height - game.navHeight();
  const navIcons = uiImages(records).filter((image) => image.y >= navTop && image.y < viewport.height).slice(-4);
  if (navIcons.length < 4) fail("bottom nav: missing nav icons");
  navIcons.forEach((image) => {
    if (image.w < 24 || image.w > 26 || image.h < 24 || image.h > 26) fail("bottom nav: icon should be enlarged to 24-26px");
    if (image.y + image.h > viewport.height - 25) fail("bottom nav: icon overlaps label/safe area");
  });
  const navLabels = records.texts.filter((item) => ["沙盘", "生存", "发现", "物资"].includes(item.text) && item.baseline >= navTop);
  if (navLabels.length < 4) fail("bottom nav: missing nav labels");
  if (records.texts.some((item) => item.text === "巡护" && item.baseline >= navTop)) {
    fail("bottom nav: patrol should be event-driven, not a primary nav item");
  }
  navLabels.forEach((label) => {
    if (label.size !== 12) fail(`bottom nav: ${label.text} label should use the compact 12px iOS tab-bar scale`);
    if (label.baseline > viewport.height - 8) fail(`bottom nav: ${label.text} label is too close to safe area`);
    if (label.baseline < navTop + 44) fail(`bottom nav: ${label.text} label is too high`);
    const icon = navIcons.reduce((best, item) => {
      const distance = Math.abs((item.x + item.w / 2) - (label.x + label.w / 2));
      return !best || distance < best.distance ? { item, distance } : best;
    }, null);
    if (!icon || icon.item.y + icon.item.h > label.y + 2) fail(`bottom nav: ${label.text} icon overlaps label`);
  });
  if (records.texts.some((item) => ["SANDBOX", "PATROL", "SUPPLIES"].includes(item.text))) {
    fail("bottom nav: English subtitles should not be rendered");
  }
  const bodyIcons = uiImages(records).filter((image) => image.y < navTop);
  if (!bodyIcons.some((image) => image.w >= 48 && image.w <= 60)) {
    fail("material screen: supply item art should render at 48-60px");
  }
  const goodsRecords = resetRecords("recovered-goods-module");
  game.scrollY = 0;
  game.drawRecoveredGoods(game.ctx, 18, 20, viewport.width - 36, game.state.world.reserve || {});
  checkUiImageBasics(goodsRecords, "recovered goods module");
  if (!uiImages(goodsRecords).some((image) => image.w >= 26 && image.w <= 30)) {
    fail("material screen: recovered goods icons should render at 26-30px");
  }
}

function checkActionPage() {
  game.prepareLocalAssetsForScreen("action");
  const records = resetRecords("action-screen");
  game.screen = "action";
  game.scrollY = 0;
  game.render();
  checkUiImageBasics(records, "action screen");
  const patrolIcons = uiImages(records).filter((image) => image.w >= 38 && image.w <= 42);
  if (patrolIcons.length < 4) fail("action screen: four compact patrol buttons should have 38-42px icons");
  const labels = records.texts.map((item) => item.text);
  ["本次巡护", "选择1项任务"].forEach((label) => {
    if (!labels.includes(label)) fail(`action screen: missing ${label} section`);
  });
  if (labels.includes("动物线索") || labels.includes("任务引导") || labels.includes("选择巡护任务") || labels.includes("经营补给") || labels.includes("出售") || labels.includes("采购")) {
    fail("action screen: duplicated guidance sections should not return");
  }
}

function checkLargeIconsPreferUiV3() {
  const kinds = ["houndScout", "antiPoacher", "habitat", "salvage", "intervention", "water", "fund"];
  game.ensureUiIconAssets(kinds);
  kinds.forEach((kind) => {
    const records = resetRecords(`large-icon:${kind}`);
    game.drawLargeIcon(game.ctx, kind, 80, 80, "#f0d376", 72);
    checkUiImageBasics(records, `large icon ${kind}`);
    const icons = uiImages(records);
    if (!icons.length) fail(`large icon ${kind}: should render from ui-v3 independent icon`);
    if (records.images.some((image) => image.src.includes("core-sprites-atlas.png"))) {
      fail(`large icon ${kind}: should not fall back to old core atlas`);
    }
  });
}

checkPatrolTiles();
checkMaterialPage();
checkActionPage();
checkLargeIconsPreferUiV3();

console.log("ui icon layout check ok");
