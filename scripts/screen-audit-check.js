const { createCharacter } = require("../js/storage");
const { getUnlockedSpecies, reconcileSpeciesPopulations } = require("../js/animalWorld");

const viewports = [
  { name: "small", width: 320, height: 568 },
  { name: "base", width: 375, height: 667 },
  { name: "large", width: 430, height: 932 }
];

const allowedTypographySizes = new Set([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 25, 28]);

let activeViewport = viewports[1];
const failures = [];

function parseFontSize(font) {
  const match = /(\d+(?:\.\d+)?)px/.exec(String(font || ""));
  return match ? Number(match[1]) : 12;
}

function estimateTextWidth(text, size) {
  return String(text || "").split("").reduce((sum, ch) => {
    const code = ch.charCodeAt(0);
    if (/\s/.test(ch)) return sum + size * 0.35;
    return sum + (code > 255 ? size * 0.92 : size * 0.56);
  }, 0);
}

function createAuditContext(audit) {
  const gradient = { addColorStop() {} };
  const base = {
    tx: 0,
    ty: 0,
    font: "12px sans-serif",
    textAlign: "left",
    textBaseline: "alphabetic",
    fillStyle: "#000",
    strokeStyle: "#000",
    lineWidth: 1,
    globalAlpha: 1
  };
  const stack = [];
  const ctx = {
    canvas: { width: activeViewport.width, height: activeViewport.height },
    save() { stack.push(Object.assign({}, base)); },
    restore() {
      const prev = stack.pop();
      if (prev) Object.assign(base, prev);
    },
    scale() {},
    translate(x, y) {
      base.tx += x || 0;
      base.ty += y || 0;
    },
    rotate() {},
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    drawImage() {},
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
    measureText(text) {
      return { width: estimateTextWidth(text, parseFontSize(base.font)) };
    },
    fillText(text, x, y) {
      const size = parseFontSize(base.font);
      const value = String(text || "");
      const width = estimateTextWidth(value, size);
      const sx = (x || 0) + base.tx;
      const sy = (y || 0) + base.ty;
      let left = sx;
      if (base.textAlign === "center") left = sx - width / 2;
      if (base.textAlign === "right" || base.textAlign === "end") left = sx - width;
      audit.texts.push({
        text: value,
        x: left,
        y: sy - size,
        w: width,
        h: size + 3,
        size,
        align: base.textAlign,
        phase: audit.phase,
        screen: audit.screen,
        viewport: audit.viewport.name
      });
    },
    createLinearGradient() { return gradient; },
    createRadialGradient() { return gradient; },
    set fillStyle(value) { base.fillStyle = value; },
    get fillStyle() { return base.fillStyle; },
    set strokeStyle(value) { base.strokeStyle = value; },
    get strokeStyle() { return base.strokeStyle; },
    set lineWidth(value) { base.lineWidth = value; },
    get lineWidth() { return base.lineWidth; },
    set font(value) { base.font = value; },
    get font() { return base.font; },
    set textAlign(value) { base.textAlign = value; },
    get textAlign() { return base.textAlign; },
    set textBaseline(value) { base.textBaseline = value; },
    get textBaseline() { return base.textBaseline; },
    set globalAlpha(value) { base.globalAlpha = value; },
    get globalAlpha() { return base.globalAlpha; }
  };
  return ctx;
}

global.wx = {
  getSystemInfoSync() {
    return { windowWidth: activeViewport.width, windowHeight: activeViewport.height, pixelRatio: 1 };
  },
  createCanvas() {
    return {
      width: activeViewport.width,
      height: activeViewport.height,
      getContext() {
        return createAuditContext(currentAudit);
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

let currentAudit = {
  viewport: activeViewport,
  screen: "boot",
  phase: "screen",
  buttons: [],
  hits: [],
  texts: []
};

const { Game } = require("../js/game");

function newAudit(viewport, screen, phase = "screen") {
  return {
    viewport,
    screen,
    phase,
    scrollY: 0,
    maxScroll: 0,
    buttons: [],
    hits: [],
    texts: []
  };
}

function isFiniteRect(rect) {
  return [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite);
}

function rectVisible(rect, viewport) {
  return rect.x + rect.w > 0 && rect.x < viewport.width && rect.y + rect.h > 0 && rect.y < viewport.height;
}

function rectOverlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function installInstrumentation(game, audit) {
  const originalAddHit = game.addHit.bind(game);
  game.addHit = (x, y, w, h, onTap) => {
    audit.hits.push({ x, y, w, h, phase: audit.phase, screen: audit.screen, viewport: audit.viewport.name });
    return originalAddHit(x, y, w, h, onTap);
  };

  const originalButton = game.button.bind(game);
  game.button = (ctx, x, y, w, h, label, fill, onTap, color, size) => {
    audit.buttons.push({
      type: "button",
      label,
      x,
      y: y - game.scrollY,
      w,
      h,
      phase: audit.phase,
      screen: audit.screen,
      viewport: audit.viewport.name
    });
    return originalButton(ctx, x, y, w, h, label, fill, onTap, color, size);
  };

  const originalModalButton = game.modalButton.bind(game);
  game.modalButton = (ctx, x, y, w, h, label, fill, onTap, color, size) => {
    audit.buttons.push({
      type: "modalButton",
      label,
      x,
      y,
      w,
      h,
      phase: "modal",
      screen: audit.screen,
      viewport: audit.viewport.name
    });
    return originalModalButton(ctx, x, y, w, h, label, fill, onTap, color, size);
  };

  const wrapModalPhase = (name) => {
    const original = game[name].bind(game);
    game[name] = (...args) => {
      const old = audit.phase;
      audit.phase = "modal";
      try {
        return original(...args);
      } finally {
        audit.phase = old;
      }
    };
  };
  wrapModalPhase("drawPatrolTaskModal");
  wrapModalPhase("drawInfoDetailModal");
  wrapModalPhase("drawSettlementModal");
  wrapModalPhase("drawChapterStoryModal");
}

function createGame(viewport) {
  activeViewport = viewport;
  currentAudit = newAudit(viewport, "boot");
  const game = new Game();
  if (game.stopLoop) game.stopLoop();
  game.width = viewport.width;
  game.height = viewport.height;
  game.canvas.width = viewport.width;
  game.canvas.height = viewport.height;
  game.ctx = createAuditContext(currentAudit);
  game.state = createCharacter(null, "保护区卫士");
  game.selectedTarget = game.state.world.knownCharacters[0];
  game.speakingAnimalId = game.selectedTarget.id;
  game.selectedRegionId = game.defaultRegionId();
  if (game.art && game.art.atlas) game.art.atlas.loaded = true;
  if (game.art && game.art.map) game.art.map.loaded = true;
  installInstrumentation(game, currentAudit);
  return game;
}

function fail(context, message) {
  failures.push(`${context}: ${message}`);
  console.log(`FAIL: ${context}: ${message}`);
}

function checkPremiumSkin(game, expectedScreen, context) {
  const skin = game.renderedPremiumSkin || {};
  if (skin.screen !== expectedScreen || !skin.parchment || !skin.leather || !skin.brass || !skin.infoCards || !skin.dynamic
    || !["canvas", "remote"].includes(skin.textureMode) || skin.version !== 1) {
    fail(context, `${expectedScreen} has lost the shared dynamic parchment/leather/brass visual system`);
  }
  const friendHeader = expectedScreen === "home" ? game.renderedHomeIdentityPill : game.renderedStagePill;
  const rankButton = expectedScreen === "home" ? ((friendHeader || {}).rankButton) : ((friendHeader || {}).friendRankButton);
  if (!friendHeader || friendHeader.affordance !== "好友榜 ›" || friendHeader.rankScope !== "friends"
    || !rankButton || rankButton.w < 58 || rankButton.h < 20
    || (expectedScreen === "home" && (!friendHeader.audioButton || rankButton.x >= friendHeader.audioButton.x || friendHeader.friendAudioGap < 6))
    || !friendHeader.avoidsSystemMenu) {
    fail(context, `${expectedScreen} header has lost its safe, visible friend leaderboard button`);
  }
}

function checkText(audit, context) {
  audit.texts.forEach((item) => {
    if (!rectVisible(item, audit.viewport)) return;
    const content = String(item.text || "").trim();
    if (!allowedTypographySizes.has(item.size)) {
      fail(context, `字号不在规范表 ${item.size}px: ${item.text}`);
    }
    if (item.size < 8) {
      fail(context, `字号过小 ${item.size}px: ${item.text}`);
    }
    const tinyBadge = /^(?:[+\-]?\d+(?:\/\d+)?|Lv\.\d+|[A-S]|[!?…›✓×])$/.test(content);
    const mapDecoration = item.phase !== "modal"
      && (audit.screen === "home" || /^(?:漫流水线|集中水点)\d+$/.test(content))
      && content.length <= 6;
    if (item.size === 8 && !tinyBadge && !mapDecoration && content.length > 3) {
      fail(context, `8px 仅限短徽标或地图装饰: ${item.text}`);
    }
    if (item.size === 9 && content.length > 14 && !/^[\d+\-→·/\s]+$/.test(content)) {
      fail(context, `较长辅助文字低于 10px: ${item.text}`);
    }
    if (item.x < -6 || item.x + item.w > audit.viewport.width + 6) {
      const decorative = item.size <= 9 && (audit.screen === "home" || item.text.length <= 3);
      if (!decorative) fail(context, `文字越界: ${item.text}`);
    }
    if (/^[，。；：、）》】”’]+$/.test(String(item.text || "").trim())) {
      fail(context, `标点被错误拆成独立一行: ${item.text}`);
    }
  });
}

function textOverlapCandidate(item, viewport) {
  if (!rectVisible(item, viewport)) return false;
  if (item.y >= viewport.height - 66) return false;
  const text = String(item.text || "").trim();
  if (!text || text === "›" || text === "…" || text === "+" || text === "-") return false;
  if (item.size < 8.5 || item.w < 8 || item.h < 8) return false;
  return true;
}

function textIntersection(a, b) {
  const left = Math.max(a.x, b.x);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const top = Math.max(a.y, b.y);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  return {
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top)
  };
}

function checkTextOverlaps(audit, context, game) {
  const texts = audit.texts.filter((item) => textOverlapCandidate(item, audit.viewport));
  const sticky = game && game.renderedStickyTableHeader;
  const stickyRect = sticky ? { x: sticky.x, y: sticky.y, w: sticky.w, h: sticky.h } : null;
  const textInSticky = (item) => stickyRect && rectOverlaps(item, stickyRect);
  const homeDock = audit.screen === "home" && game && game.renderedHomeActionDock;
  const dockLabels = homeDock
    ? new Set([homeDock.title, homeDock.focus, homeDock.actionLabel, "新手下一步", "当前最重要"])
    : new Set();
  const prologueLine = audit.screen === "choose" && game && game.renderedPlayablePrologue
    ? String(((game.renderedPlayablePrologue.dialogue || {}).line) || "")
    : "";
  for (let i = 0; i < texts.length; i += 1) {
    const a = texts[i];
    for (let j = i + 1; j < texts.length; j += 1) {
      const b = texts[j];
      if (a.phase !== b.phase) continue;
      // The sticky table header is an opaque fixed layer drawn over the
      // translated list. Text from the scrolled row underneath is expected to
      // occupy the same coordinates and is intentionally occluded.
      if (textInSticky(a) || textInSticky(b)) continue;
      // The home action dock is an opaque floating layer over the live map.
      // Map dialogue underneath it is intentionally occluded, so do not
      // compare that hidden text with the dock's own title/action label.
      if (homeDock && (dockLabels.has(a.text) || dockLabels.has(b.text))) continue;
      // The live map is intentionally rendered behind an opaque cinematic
      // prologue panel. Its simulated dialogue must not be compared with the
      // foreground caption that visually covers it.
      if (prologueLine && (prologueLine.includes(a.text) || prologueLine.includes(b.text))) continue;
      const hit = textIntersection(a, b);
      if (!hit.w || !hit.h) continue;
      if (a.text === b.text && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1) continue;
      const minW = Math.min(a.w, b.w);
      const minH = Math.min(a.h, b.h);
      const sameShortRow = Math.abs((a.y + a.h / 2) - (b.y + b.h / 2)) < 2 && (a.text.length <= 3 || b.text.length <= 3);
      if (sameShortRow) continue;
      if (hit.w > minW * 0.36 && hit.h > minH * 0.42) {
        fail(context, `文字遮挡: "${a.text}"@${Math.round(a.x)},${Math.round(a.y)} / "${b.text}"@${Math.round(b.x)},${Math.round(b.y)} [${a.phase}]`);
      }
    }
  }
}

function checkButtons(audit, game, context) {
  const navTop = audit.viewport.height - game.navHeight();
  const stableScroll = audit.scrollY < 1 || Math.abs(audit.scrollY - audit.maxScroll) < 1;
  audit.buttons.forEach((button) => {
    if (!isFiniteRect(button)) fail(context, `按钮坐标异常: ${button.label}`);
    if (!rectVisible(button, audit.viewport)) return;
    const smallMapControl = button.label === "+" || button.label === "-";
    const minH = smallMapControl ? 20 : (button.type === "modalButton" ? 34 : 26);
    if (button.h < minH) fail(context, `按钮过矮 ${button.h}px: ${button.label}`);
    if (button.x < -1 || button.x + button.w > audit.viewport.width + 1) {
      fail(context, `按钮横向越界: ${button.label}`);
    }
    const visibleAboveNav = navTop - button.y;
    if (stableScroll && button.phase !== "modal" && visibleAboveNav >= 20 && button.y + button.h > navTop - 2) {
      fail(context, `按钮压到底部导航: ${button.label}`);
    }
    if (button.phase === "modal" && button.y + button.h > audit.viewport.height - 10) {
      fail(context, `弹窗按钮压屏幕底部: ${button.label}`);
    }
  });
}

function checkHits(audit, game, context) {
  const navRect = { x: 0, y: audit.viewport.height - game.navHeight(), w: audit.viewport.width, h: game.navHeight() };
  const stableScroll = audit.scrollY < 1 || Math.abs(audit.scrollY - audit.maxScroll) < 1;
  audit.hits.forEach((hit) => {
    if (!isFiniteRect(hit)) fail(context, "点击区坐标异常");
    if (!rectVisible(hit, audit.viewport)) return;
    const backdrop = hit.x <= 0 && hit.y <= 0 && hit.w >= audit.viewport.width && hit.h >= audit.viewport.height;
    const navHit = hit.y >= navRect.y - 1 && hit.h >= game.navHeight() - 1;
    if (backdrop || navHit) return;
    if (hit.w < 20 || hit.h < 20) {
      fail(context, `点击区过小 ${Math.round(hit.w)}x${Math.round(hit.h)}`);
    }
    const visibleAboveNav = navRect.y - hit.y;
    if (stableScroll && hit.phase !== "modal" && hit.h <= 48 && visibleAboveNav >= 20 && rectOverlaps(hit, navRect)) {
      fail(context, `普通点击区压到底部导航 ${Math.round(hit.x)},${Math.round(hit.y)},${Math.round(hit.w)}x${Math.round(hit.h)}`);
    }
  });
}

function runRenderAudit(game, viewport, screen, scrollY = 0, modalSetup = null) {
  const audit = newAudit(viewport, screen);
  currentAudit = audit;
  game.ctx = createAuditContext(audit);
  installInstrumentation(game, audit);
  game.screen = screen;
  game.prepareLocalAssetsForScreen(screen);
  game.scrollY = scrollY;
  game.patrolTaskModal = null;
  game.patrolOperationPlan = null;
  game.renderedPatrolTask = null;
  game.infoDetailModal = null;
  game.settlementModal = null;
  game.chapterStoryModal = null;
  game.chapterStoryQueue = [];
  if (screen === "collection") game.discoveryTab = "population";
  if (modalSetup) modalSetup(game);
  // Some setup helpers call render() themselves. Only audit the final state;
  // otherwise pre-selection and post-selection text can be compared as if it
  // occupied the same frame and create false overlap failures.
  audit.buttons = [];
  audit.hits = [];
  audit.texts = [];
  game.render();
  audit.scrollY = game.scrollY;
  audit.maxScroll = game.maxScroll();
  const context = `${viewport.name}/${screen}/scroll:${Math.round(scrollY)}${modalSetup ? "/modal" : ""}`;
  if (!Number.isFinite(game.contentHeight) || game.contentHeight <= 0) {
    fail(context, "内容高度异常");
  }
  checkText(audit, context);
  checkTextOverlaps(audit, context, game);
  checkButtons(audit, game, context);
  checkHits(audit, game, context);
  const infoItems = (game.infoDetailModal && game.infoDetailModal.renderedInfoItems) || [];
  const truncatedInfo = infoItems.filter((entry) => entry.layout && ((entry.layout.title && entry.layout.title.truncated) || (entry.layout.body && entry.layout.body.truncated)));
  if (truncatedInfo.length) {
    const detail = truncatedInfo.map((entry) => `${entry.item.tag || entry.item.title}[${Math.round(entry.w)}×${Math.round(entry.h)}:${entry.layout.title && entry.layout.title.truncated ? "标题" : ""}${entry.layout.body && entry.layout.body.truncated ? "正文" : ""}]`).join("、");
    fail(context, `${(game.infoDetailModal && game.infoDetailModal.title) || "结果卡"}文字被截断: ${detail}`);
  }
  return audit;
}

function checkMetricDashboard(game, audit, context, expectedLabels) {
  const modal = game.infoDetailModal || {};
  const metrics = modal.renderedDashboardMetrics || [];
  if (modal.layout !== "metricDashboard" || metrics.length !== expectedLabels.length) {
    fail(context, `数据仪表盘缺失或数量错误: ${metrics.length}/${expectedLabels.length}`);
    return;
  }
  expectedLabels.forEach((label) => {
    if (!metrics.some((metric) => metric.label === label)) fail(context, `数据仪表盘缺少 ${label}`);
  });
  if (metrics.some((metric) => metric.valueSize < 14 || metric.w < 60 || metric.h < 78)) {
    fail(context, "数据仪表盘主数字过小或卡片空间不足");
  }
  if (audit.texts.some((item) => /AI LIVE|开局一队狗|繁荣全靠你/.test(item.text))) {
    fail(context, "高频详情仍出现元说明或旧英文标签");
  }
  const cards = modal.renderedInfoItems || [];
  if (!cards.length || cards.some((entry) => entry.layout && ((entry.layout.title && entry.layout.title.truncated) || (entry.layout.body && entry.layout.body.truncated)))) {
    fail(context, "数据仪表盘下方状态卡缺失或文字被截断");
  }
}

function checkMapAnimalAction(game, audit, context) {
  const modal = game.infoDetailModal || {};
  const metrics = modal.renderedDashboardMetrics || [];
  const actions = modal.renderedAnimalActions || [];
  if (modal.kind !== "mapAnimalAction" || metrics.length !== 3 || actions.length !== 2) {
    fail(context, `沙盘动物操作层缺失: ${modal.kind || "none"}/${metrics.length}/${actions.length}`);
    return;
  }
  ["信任", "警惕", "健康"].forEach((label) => {
    if (!metrics.some((metric) => metric.label === label)) fail(context, `动物关键数字缺少 ${label}`);
  });
  if (metrics.some((metric) => metric.valueSize < 18 || metric.w < 50 || metric.h < 44)) {
    fail(context, "动物关键数字过小或卡片空间不足");
  }
  if (!modal.animal || !modal.quote || modal.quote.length > 80) {
    fail(context, "动物大头像或短对白缺失");
  }
  if (actions.some((action) => action.h < 50 || action.w < 200 || !action.label || !action.value
    || action.y < 0 || action.y + action.h > game.height)) {
    fail(context, "动物操作按钮尺寸、结果数字或可视范围异常");
  }
  if (actions.some((action) => action.id.startsWith("patrol:"))
    || !actions.some((action) => action.id.startsWith("care:"))
    || !actions.some((action) => action.id === "explore:materials")) {
    fail(context, "动物详情必须只保留关系互动和探索，不能直接执行巡护任务");
  }
  if (!modal.renderedLinkedPatrolTask || !modal.renderedLinkedPatrolTask.readOnly
    || modal.renderedLinkedPatrolTask.trigger !== "sandbox-marker") {
    fail(context, "动物发现没有形成只读沙盘任务提示");
  }
  const actionHits = audit.hits.filter((hit) => actions.some((action) => Math.abs(hit.x - action.x) < 1 && Math.abs(hit.y - action.y) < 1));
  if (actionHits.length !== 2) fail(context, `两项动物操作点击区不完整: ${actionHits.length}/2`);
}

function checkAnimalComfort(game, audit, context, phase) {
  const modal = game.infoDetailModal || {};
  const rendered = modal.renderedComfort || {};
  if (modal.kind !== "animalComfort" || rendered.phase !== phase) {
    fail(context, `温柔互动过程缺失: ${modal.kind || "none"}/${rendered.phase || "none"}`);
    return;
  }
  if ((modal.config?.steps || []).length !== 2 || (modal.config?.buttons || []).length !== 2) {
    fail(context, "安抚流程不是固定的两张画面");
  }
  if ((rendered.portraitSize || 0) < 96 || !rendered.button || rendered.button.w < 140 || rendered.button.h < 40) {
    fail(context, "安抚过程的动物主视觉或主操作按钮过小");
  }
  if (phase === "result" && (!Array.isArray(rendered.changes) || rendered.changes.length !== 3)) {
    fail(context, "安抚完成后没有清楚展示三项结果变化");
  }
  if (!audit.texts.some((item) => /蹲下来|轻声安抚|它没有转身离开|它的耳朵放松/.test(item.text))) {
    fail(context, "安抚过程缺少简短、温暖的动物反馈");
  }
}

function checkPatrolTaskModal(game, audit, context, options = {}) {
  const layout = game.renderedPatrolTask || {};
  const header = layout.header || {};
  const modalTexts = audit.texts.filter((item) => item.phase === "modal");
  const maxHeight = options.maxHeight || 380;
  if (!layout.id || layout.h > maxHeight || layout.purposeH !== 32 || !layout.nextText) {
    fail(context, `巡护确认层级或高度异常: ${layout.id || "none"}/${layout.h || 0}`);
  }
  if (header.split !== "horizontal" || header.background !== "leatherArchive"
    || layout.style !== "field-task-v2" || !Array.isArray(layout.materials)
    || !["leather", "parchment", "brass"].every((material) => layout.materials.includes(material))) {
    fail(context, "巡护任务没有使用统一的皮革档案材质");
  }
  const safeRight = header.pill ? header.pill.x - 8 : layout.x + layout.w - 18;
  if (!header.textW || header.textX + header.textW > safeRight) {
    fail(context, "弹窗标题与右上状态区发生侵占");
  }
  if (["buySupplies", "salvage"].includes(layout.id) && !layout.blocked && header.pill) {
    fail(context, "物资弹窗头部重复展示结算状态，挤压主标题");
  }
  const metrics = (layout.metricLayouts || []).filter(Boolean);
  if (metrics.length < 3 || metrics.some((metric) => metric.valueSize < 10)
    || !metrics.some((metric) => ["primary", "focus"].includes(metric.role) && metric.valueSize >= 16)) {
    fail(context, "核心数值没有形成至少三项清晰结果，或主数据字号过小");
  }
  if (modalTexts.some((item) => item.text === "指令" || item.text === "结算摘要")) {
    fail(context, "巡护确认仍保留重复的指令或结算摘要区");
  }
  if (!audit.buttons.some((button) => button.phase === "modal" && button.label === "取消")) {
    fail(context, "巡护确认缺少明确取消操作");
  }
  if (options.blocked) {
    const expectedRoute = options.routeLabel || "去物资";
    const hasClearNext = options.routeLabel
      ? !!layout.nextText && !/^先补齐\s*$/.test(layout.nextText)
      : layout.nextText.startsWith("先补齐");
    if (!layout.blocked || !hasClearNext || layout.routeLabel !== expectedRoute
      || !audit.buttons.some((button) => button.label === expectedRoute)) {
      fail(context, "缺资源状态没有明确缺口或直达物资入口");
    }
  } else if (layout.blocked) {
    fail(context, "可执行巡护被错误标记为缺资源");
  }
}

function settlementFixture(game) {
  const reserve = game.state.world.reserve || {};
  return {
    title: "驱赶偷猎者 · 西部岩坡洞域",
    summary: "漂亮，偷猎压力被压下 19 点。有 6 只动物愿意靠近保护区。",
    grade: "S",
    guardianScore: 91,
    scoreDelta: 36,
    day: 8,
    weather: "阴",
    location: "西部岩坡洞域",
    actionIcon: "signal",
    guardianRun: reserve.guardianRun || {},
    progression: game.reserveProgression(reserve),
    eventChain: reserve.eventChain || {},
    goalDone: true,
    causality: {
      statLine: "安全 +18，生态 +4；原因：边界恢复",
      animalLine: "动物从「受惊」变为「警觉」：坏脚印减少",
      tomorrowRiskLine: "明日风险：继续听动物确认路线"
    },
    stats: [
      { label: "安全指数", before: 62, after: 80, delta: 18 },
      { label: "水源指数", before: 64, after: 68, delta: 4 },
      { label: "偷猎压力", before: 31, after: 12, delta: -19, inverse: true },
      { label: "迁移指数", before: 0, after: 6, delta: 6 }
    ],
    rewards: ["收益：目标奖励 / 安全 +18 / 偷猎 -19 / 迁入 +6", "代价：警报器检查", "明日影响：局面不错，回沙盘点动物再决定下一步"],
    nextHint: "明日建议：局面不错，回沙盘点动物再决定下一步。",
    speaker: "沉牙狼",
    speakerAnimal: game.state.world.knownCharacters[0],
    speech: "“今晚我会让幼崽靠近水边一点。你的脚步，和坏脚印不一样。”",
    emotionalEcho: {
      title: "晨角今晚敢睡得更沉了",
      impact: "信任 57→58",
      quote: "“今晚我会让幼崽靠近水边一点。你的脚步，和坏脚印不一样。”"
    }
  };
}

function crisisSettlementFixture(game) {
  return Object.assign(settlementFixture(game), {
    title: "疾病扩散至多个区域",
    grade: "A",
    guardianScore: 79,
    scoreDelta: 1,
    breakthrough: {
      kind: "emergency_failed",
      kicker: "事件失控",
      title: "疾病扩散至多个区域",
      body: "疾病正在向水线和草场扩散。"
    },
    causality: {
      statLine: "偷猎压力 +7，生态 -4；原因：病味扩散",
      animalLine: "动物从「警觉」变为「生病」：幼体减少活动",
      tomorrowRiskLine: "明日风险：病味扩散，建议派猎犬侦察。",
      reasons: [{ label: "病味扩散", body: "幼体和老弱个体会先减少活动", action: "houndScout" }]
    },
    stats: [
      { label: "安全指数", before: 68, after: 66, delta: -2 },
      { label: "水源指数", before: 78, after: 74, delta: -4 },
      { label: "偷猎压力", before: 27, after: 34, delta: 7, inverse: true },
      { label: "迁移指数", before: 3, after: 0, delta: -3 }
    ],
    rewards: ["奖励：猎犬队升级", "补给：整理完成"],
    nextHint: "明日建议：修复草场或降低过度取食。",
    returnScreen: "role"
  });
}

viewports.forEach((viewport) => {
  const game = createGame(viewport);
  const screens = ["choose", "home", "action", "social", "league", "collection", "survival", "role", "animalworld"];
  screens.forEach((screen) => {
    runRenderAudit(game, viewport, screen, 0);
    const max = game.maxScroll();
    if (max > 10) {
      runRenderAudit(game, viewport, screen, max / 2);
      runRenderAudit(game, viewport, screen, max);
    }
  });
  const ecologyFullTextAudit = runRenderAudit(game, viewport, "role", 0, (g) => {
    const parent = { kind: "ecologyNarrativeDecision", title: "生态现场", icon: "eye", items: [] };
    g.openInfoListItemDetail(parent, {
      tag: "现场",
      title: "一方经过后留下可利用的食物与通道，另一方随即跟上。",
      body: ""
    }, 0);
  });
  if ((game.infoDetailModal || {}).meta
    || ecologyFullTextAudit.texts.some((item) => /任务生成器|完成结算|完整记录|返回后/.test(item.text))) {
    fail(`${viewport.name}/ecology-full-text`, "expanded ecology text still includes redundant implementation or navigation commentary");
  }
  runRenderAudit(game, viewport, "home", 0, (g) => {
    g.state.world.reserve.ecologyNarrative = {
      pendingDecision: { id: "retired_nature_rule", title: "自然规则", choices: [{ id: "observe", label: "观察" }] }
    };
    const realRender = g.render;
    g.render = () => {};
    g.openPendingEcologyDecision();
    g.render = realRender;
  });
  if ((game.infoDetailModal || {}).kind === "ecologyNarrativeDecision"
    || String((game.infoDetailModal || {}).kicker || "").includes("自然规则")) {
    fail(`${viewport.name}/ecology-retired`, "nature-rule tasks still open on the sandbox");
  }
  const letterHomeAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    g.state.world.lifeMemory.animalLetters = [];
    g.state.world.lifeMemory.animalLetterDateKey = "";
    g.ensureAnimalLettersForToday();
    // 游客数据和来信现在共用地图内的一个入口；没有变化时不长驻，
    // 以一次快照差异模拟新来信，验证只出现一个短暂入口。
    g.state.ui.mapNotifiedLetterKeys = [];
  });
  if (!game.renderedMapVisitorCountChip
    || game.renderedMapVisitorCountChip.mode !== "reserveLetters"
    || !(game.renderedMapVisitorCountChip.letters >= 2)
    || !letterHomeAudit.texts.some((item) => /新邮件/.test(item.text))) {
    fail(`${viewport.name}/animal-letter-home`, "home is missing the transient protection-area letter entrance");
  }
  runRenderAudit(game, viewport, "home", 0, (g) => g.openAnimalLetterInbox());
  if (!game.infoDetailModal || game.infoDetailModal.kind !== "animalLetterInbox"
    || !game.infoDetailModal.renderedLetterInbox || !game.infoDetailModal.renderedLetterInbox.showsAllHistory
    || !(game.infoDetailModal.renderedLetterItems || []).length) {
    fail(`${viewport.name}/animal-letter-inbox`, "animal-letter history or portrait rows are missing from the inbox");
  }
  const auditLetter = ((game.infoDetailModal || {}).letters || [])[0];
  runRenderAudit(game, viewport, "home", 0, (g) => g.openAnimalLetterReader(auditLetter));
  if (!game.infoDetailModal || game.infoDetailModal.kind !== "animalLetterReader"
    || !game.infoDetailModal.renderedAnimalLetter || !game.infoDetailModal.renderedAnimalLetter.portrait
    || !game.infoDetailModal.renderedAnimalLetter.fits) {
    fail(`${viewport.name}/animal-letter-reader`, "animal letter reader lost its portrait, complete copy, or narrow-screen layout");
  }
  const existingCharacter = game.state.character;
  const chooseAudit = runRenderAudit(game, viewport, "choose", 0, (g) => {
    g.state.character = null;
    g.state.ui = Object.assign({}, g.state.ui || {}, { prologue: { version: 1, stage: "fog", completed: false } });
    g.prologueRuntime = { stage: "fog", startedAt: Date.now() - 1150 };
  });
  if (chooseAudit.maxScroll !== 0 || game.maxScroll() !== 0) {
    fail(`${viewport.name}/choose`, "entry page should fit one screen without scrolling");
  }
  const prologueVisual = game.renderedPlayablePrologue || {};
  if (!chooseAudit.texts.some((item) => item.text === "进入游戏")
    || !chooseAudit.texts.some((item) => /解救 1 只动物/.test(item.text))
    || !chooseAudit.texts.some((item) => /招募 50 名游客/.test(item.text))
    || !chooseAudit.texts.some((item) => /扩大到 12 只/.test(item.text))
    || prologueVisual.stage !== "fog" || prologueVisual.dynamicMap || !prologueVisual.staticUnderlay || prologueVisual.staticChapterArt
    || !prologueVisual.cinematicArt || prologueVisual.beat !== "enter" || prologueVisual.soundCue !== "叮——"
    || prologueVisual.comicPanels !== 1 || prologueVisual.panel !== 1
    || !prologueVisual.panelOneReady || prologueVisual.panelTwoReady
    || !prologueVisual.dialogue || !prologueVisual.dialogue.layeredCloud
    || prologueVisual.dialogue.style !== "survival-manifesto" || prologueVisual.dialogue.cloud
    || prologueVisual.textPriority !== "primary" || !prologueVisual.backgroundMuted || !prologueVisual.businessSurvivalWorld
    || prologueVisual.imageTransitionMode !== "hold" || prologueVisual.transitionFlash !== false
    || !prologueVisual.geometryContinuous || !prologueVisual.lateLoadHold || !prologueVisual.avoidsDoubleExposure
    || prologueVisual.fogOpacity < .7 || prologueVisual.imagesBeforePlay !== 1 || prologueVisual.operationsBeforePlay !== 1
    || !prologueVisual.dogBounds || prologueVisual.dogBounds.w < 88) {
    fail(`${viewport.name}/choose`, "single-image prologue lost its art, enter-game button, layered dialogue, or interaction rhythm");
  }
  if (chooseAudit.texts.some((item) => /开始守护|从这些开始|合法回收 → 出售|开局一队狗/.test(item.text))) {
    fail(`${viewport.name}/choose`, "entry page still shows the old static start cards");
  }
  game.state.character = existingCharacter;
  game.state.ui = Object.assign({}, game.state.ui || {}, { prologue: { version: 1, stage: "complete", completed: true } });
  const missionPushAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    g.openGoalCenter();
  });
  const missionModal = game.infoDetailModal || {};
  const goalCards = missionModal.renderedGoalCards || [];
  if (missionModal.kind !== "missionPush" || goalCards.length !== 1
    || goalCards[0].id !== missionModal.currentGoalId
    || missionPushAudit.texts.some((item) => item.text === "为什么")) {
    fail(`${viewport.name}/mission-push`, "目标中心没有保持唯一当前目标，或仍展示旧版重复说明");
  }
  const expectedSpeciesCounts = { 1: 7, 2: 13, 3: 15, 4: 19, 5: 23, 6: 25, 7: 25 };
  const finalSpeciesLevel = 7;
  [1, 2, 3, 4, 5, 6, 7].forEach((level) => {
    const populationAudit = runRenderAudit(game, viewport, "animalworld", 0, (g) => {
      g.state.world.reserve.progression.level = level;
      reconcileSpeciesPopulations(g.state.world.reserve, { initializeUnlocked: true, removeLocked: true });
      g.selectedAnimalWorldSpecies = null;
      g.speciesPage = 0;
    });
    const expected = expectedSpeciesCounts[level];
    const expectedVisible = Math.min(6, expected);
    const expectedPages = Math.ceil(expected / 6);
    const summary = game.renderedSpeciesSummary || {};
    const cards = game.renderedSpeciesCards || [];
    const pagination = game.renderedSpeciesPagination || {};
    const columns = new Set(cards.map((card) => Math.round(card.x))).size;
    if (summary.species !== expected || summary.h > 54 || summary.valueSize < 17
      || cards.length !== expectedVisible || columns !== 2
      || cards.some((card) => card.layout !== "twoColumnPortrait" || card.h < 82 || card.titleSize < 11 || card.valueSize < 14 || !card.trend
        || !card.status || !card.role || !card.detailAction
        || card.avatarSize < 56 || card.avatarBounds.x + card.avatarBounds.w > card.textX
        || card.populationBounds.x + card.populationBounds.w > card.trendBounds.x)) {
      fail(`${viewport.name}/population-lv${level}`, "种群总览没有使用两列大头像卡，或名称/数量/趋势安全区不符合图形优先规则");
    }
    if (summary.concern > 0 && (!summary.concernAction || !summary.concernTargetId)) {
      fail(`${viewport.name}/population-lv${level}`, "需关注数字没有提供可点击的下降种群入口");
    }
    if (pagination.pageCount !== expectedPages || pagination.visible !== expectedVisible || pagination.pageSize !== 6) {
      fail(`${viewport.name}/population-lv${level}`, "种群分页没有保持每页六种的两列大头像结构");
    }
    if (populationAudit.texts.some((item) => item.text.includes("点击种群，查看数量") || item.text.startsWith("待解锁 "))) {
      fail(`${viewport.name}/population-lv${level}`, "种群页仍保留重复点击说明或展开全部锁定物种");
    }
    const locked = game.renderedLockedSpeciesSummary;
    if (level < finalSpeciesLevel && (!locked || locked.level !== level + 1 || locked.count !== getUnlockedSpecies(level + 1).length - expected)) {
      fail(`${viewport.name}/population-lv${level}`, "下一等级物种没有合并成单一预览入口");
    }
    if (level === finalSpeciesLevel && locked) fail(`${viewport.name}/population-lv7`, "满级种群仍显示不存在的锁定物种");
    if (level === finalSpeciesLevel && viewport.name === "base" && populationAudit.maxScroll > 80) {
      fail(`${viewport.name}/population-lv7`, `中屏种群滚动仍过长 ${populationAudit.maxScroll}px`);
    }
    if (level === finalSpeciesLevel && viewport.name === "large" && populationAudit.maxScroll !== 0) {
      fail(`${viewport.name}/population-lv7`, `大屏种群不应需要滚动 ${populationAudit.maxScroll}px`);
    }
    if (level === finalSpeciesLevel && viewport.name === "small" && populationAudit.maxScroll > 180) {
      fail(`${viewport.name}/population-lv7`, `小屏种群滚动仍过长 ${populationAudit.maxScroll}px`);
    }
    if (level === finalSpeciesLevel) {
      const firstPageIds = cards.map((card) => card.id);
      if (!game.changeSpeciesPage(1) || game.speciesPage !== 1 || (game.renderedSpeciesCards || []).length !== 6
        || (game.renderedSpeciesCards || []).some((card) => firstPageIds.includes(card.id))) {
        fail(`${viewport.name}/population-lv7`, "第二页物种不可达或与第一页重复");
      }
      if (!game.changeSpeciesPage(1) || game.speciesPage !== 2 || (game.renderedSpeciesCards || []).length !== 6) {
        fail(`${viewport.name}/population-lv7`, "第三页物种不可达");
      }
      if (!game.changeSpeciesPage(1) || game.speciesPage !== 3 || (game.renderedSpeciesCards || []).length !== 6) {
        fail(`${viewport.name}/population-lv7`, "第四页物种不可达");
      }
      if (!game.changeSpeciesPage(1) || game.speciesPage !== 4 || (game.renderedSpeciesCards || []).length !== 1
        || game.changeSpeciesPage(1) !== false) {
        fail(`${viewport.name}/population-lv7`, "最后一种物种不可达或分页越界");
      }
      game.speciesPage = 0;
    }
  });
  [1, 2, 3, 4].forEach((page) => {
    const pageAudit = runRenderAudit(game, viewport, "animalworld", 0, (g) => {
      g.state.world.reserve.progression.level = finalSpeciesLevel;
      reconcileSpeciesPopulations(g.state.world.reserve, { initializeUnlocked: true, removeLocked: true });
      g.speciesPage = page;
    });
    const expectedVisible = page === 4 ? 1 : 6;
    if ((game.renderedSpeciesCards || []).length !== expectedVisible
      || (game.renderedSpeciesCards || []).some((card) => card.titleSize < 11 || card.valueSize < 14 || card.avatarSize < 56)
      || pageAudit.texts.some((item) => item.text.includes("点击种群，查看数量"))) {
      fail(`${viewport.name}/population-page${page + 1}`, "后续物种页存在长名称压缩、数量过小或旧说明回流");
    }
  });
  const nextSpecies = getUnlockedSpecies(2).filter((sp) => sp.unlockLevel === 2);
  const lockedSpeciesAudit = runRenderAudit(game, viewport, "animalworld", 0, (g) => {
    g.state.world.reserve.progression.level = 1;
    reconcileSpeciesPopulations(g.state.world.reserve, { initializeUnlocked: true, removeLocked: true });
    g.openLockedSpeciesOverview(2, nextSpecies);
  });
  if (!nextSpecies.every((sp) => lockedSpeciesAudit.texts.some((item) => item.text === sp.name))) {
    fail(`${viewport.name}/population-locked-overview`, "下一章物种合并入口没有完整展示即将解锁的物种");
  }
  game.state.world.reserve.progression.level = 1;
  reconcileSpeciesPopulations(game.state.world.reserve, { initializeUnlocked: true, removeLocked: true });
  runRenderAudit(game, viewport, "home", 0, (g) => {
    g.state.world.reserve.progression.totalActions = 0;
    g.state.ui.onboarding = { version: 2, completed: false, seen: {} };
    g.openFirstOnboardingChoice();
  });
  const firstChoiceItems = (game.infoDetailModal && game.infoDetailModal.renderedInfoItems) || [];
  const firstChoiceTitle = String(((game.infoDetailModal || {}).items || [])[0] && game.infoDetailModal.items[0].title || "");
  if (!game.infoDetailModal || game.infoDetailModal.kind !== "onboardingChoice"
    || (game.infoDetailModal.choices || []).length !== 1
    || firstChoiceItems.length !== 1
    || firstChoiceItems.some((entry) => !entry.layout || (entry.layout.title && entry.layout.title.truncated) || (entry.layout.body && entry.layout.body.truncated))
    || !/偷猎 \d+→\d+~\d+/.test(firstChoiceTitle)) {
    fail(`${viewport.name}/onboarding-choice`, "first choice does not show a complete numeric cost/result preview");
  }
  const reserveForTerrain = game.state.world.reserve || {};
  reserveForTerrain.migration = reserveForTerrain.migration || {};
  const previousMigrationDelta = reserveForTerrain.migration.delta || 0;
  reserveForTerrain.migration.delta = 3;
  const homeAudit = runRenderAudit(game, viewport, "home", 0);
  checkPremiumSkin(game, "home", `${viewport.name}/home-premium-skin`);
  const stateTileLayout = game.renderedSandboxStateTiles || [];
  if (stateTileLayout.length === 6) {
    const firstColumn = stateTileLayout[0];
    const secondColumn = stateTileLayout[1];
    if (!(firstColumn.w < secondColumn.w && firstColumn.x + firstColumn.w <= secondColumn.x)) {
      fail(`${viewport.name}/home`, "基金信息栏没有为后两列让出文字安全宽度");
    }
  }
  const opportunity = game.renderedMapOpportunityAggregate || {};
  const goalBar = game.renderedSandboxGoalBar || {};
  if (opportunity.visible && goalBar.visible && opportunity.y < goalBar.y + goalBar.h + 6) {
    fail(`${viewport.name}/home`, "每日事件入口仍与主任务信息框重叠");
  }
  if (homeAudit.texts.some((item) => item.text === "展开" || item.text === "分享" || /的来信$/.test(item.text))) {
    fail(`${viewport.name}/home`, "sandbox home should not render daily letter hero");
  }
  if (homeAudit.texts.some((item) => item.text === "动物视角沙盘" || item.text === "AI LIVE")) {
    fail(`${viewport.name}/home`, "sandbox map should not render the old title row");
  }
  if (homeAudit.texts.some((item) => /^(雨季|旱季) · \d+\/12$/.test(item.text))) {
    fail(`${viewport.name}/home`, "sandbox map should not repeat the season progress already shown in the status dock");
  }
  const facilityLabels = game.renderedMapFacilityLabels || [];
  if (!facilityLabels.length || facilityLabels.some((entry) => entry.size < 10 || entry.h < 20 || entry.w < 46 || entry.style !== "grounded" || entry.spriteSize > 64)) {
    fail(`${viewport.name}/home`, "沙盘设施状态仍使用难以辨认的小字或过小标签");
  }
  const terrain = game.renderedSeasonTerrain || {};
  if (!(terrain.waterFeatures || []).length
    || terrain.waterFeatures.some((entry) => entry.style !== "ground-ripples" || entry.labelVisible !== false)
    || !terrain.migrationRoute
    || terrain.migrationRoute.style !== "fading-tracks"
    || terrain.migrationRoute.dashed !== false
    || (terrain.migrationRoute.steps || []).length < 6) {
    fail(`${viewport.name}/home`, "季节水面或迁徙路线仍是高饱和色块、常驻文字或长虚线");
  }
  const groundMarkers = game.renderedMapGroundMarkers || [];
  const resourceFlows = game.renderedMapResourceFlows || [];
  if (groundMarkers.some((entry) => entry.backingPlate !== true || entry.style !== "field-event-icon" || !entry.concreteIcon || !entry.icon)
    || resourceFlows.some((entry) => entry.style !== "resource-flow-chip" || entry.dialogue !== false || entry.grounded !== false || !entry.metric)) {
    fail(`${viewport.name}/home`, "沙盘事件仍使用脚印线稿，没有按疾病、水源、偷猎等语义显示具体图形");
  }
  const rangerMarkers = (((game.reserveViewForDisplay() || {}).mapMarkers) || []).filter((marker) => /^巡护员[：:]/.test(marker.dialogue || ""));
  const activeMapSpeaker = game.renderedMapSpeechCandidate || null;
  const activeRanger = activeMapSpeaker && activeMapSpeaker.kind === "marker"
    && rangerMarkers.some((marker) => String(marker.id) === String(activeMapSpeaker.id));
  if (activeRanger && (!(game.renderedRangerActors || []).length || game.renderedRangerActors.some((actor) => actor.style !== "filled-cartoon-ranger" || !actor.concrete))) {
    fail(`${viewport.name}/home`, "巡护员对白仍悬空，没有对应的卡通人物实体");
  }
  if ((game.renderedMapSpeechBubbles || []).length > 1) {
    fail(`${viewport.name}/home`, "沙盘同一帧出现了多个对白气泡");
  }
  const attention = game.renderedSandboxAttentionBudget || {};
  if (attention.contextualLimit !== 2
    || attention.guidanceChannels !== 2
    || !attention.primaryGoalMerged
    || attention.primaryActions !== 0
    || attention.visibleContextual > attention.contextualLimit
    || attention.repeatedVisibleActions > 0
    || (attention.hiddenContextual > 0 && !attention.aggregateVisible)) {
    fail(`${viewport.name}/home`, "沙盘没有收敛为“更多线索 + 地图操作”两种引导，或遗漏了线索聚合入口");
  }
  if (!game.renderedSandboxInfoDock || game.renderedSandboxInfoDock.standaloneGoalRow !== false
    || game.renderedSandboxInfoDock.primaryGoalMergedInto !== "map-opportunity-aggregate") {
    fail(`${viewport.name}/home`, "当前主任务仍作为第三种独立操作指引存在");
  }
  const visibleAnimalPrompts = (game.renderedAnimalFocusMarkers || []).filter((marker) => marker.labelVisible);
  if (visibleAnimalPrompts.length > 2) {
    fail(`${viewport.name}/home`, "沙盘动物仍同时显示过多文字按钮");
  }
  const stateTiles = game.renderedSandboxStateTiles || [];
  if (stateTiles.some((tile) => !tile.clickable
    || tile.affordance !== (["warn", "bad"].includes(tile.riskTone) ? "改善 ›" : "查看 ›"))) {
    fail(`${viewport.name}/home`, "基金/水源/草场缺少详情入口，或状态提示与风险不一致");
  }
  game.mapConsequencePulse = {
    startedAt: Date.now() - 1600,
    expiresAt: Date.now() + 2600,
    x: .52,
    y: .46,
    title: "生态干预",
    valueText: "疾病 34→27（-7）",
    secondaryValueText: "水源 74→76（+2）",
    responseText: "晨角：幼崽重新靠近水边。",
    reason: "病群已经隔离",
    positive: true,
    tone: "intervention"
  };
  runRenderAudit(game, viewport, "home", 0);
  const consequenceCard = game.mapConsequencePulse && game.mapConsequencePulse.renderedCard;
  const navTop = game.height - game.navHeight();
  const consequenceScreenY = consequenceCard ? consequenceCard.y - game.scrollY : Infinity;
  const dismissHit = consequenceCard
    ? game.hitAreaAt(consequenceCard.x + consequenceCard.w / 2, consequenceScreenY + consequenceCard.h / 2)
    : null;
  if (!game.renderedMapSpeechSuppressed || !consequenceCard
    || consequenceCard.layer !== "map-foreground"
    || !consequenceCard.suppressesMapSpeech) {
    fail(`${viewport.name}/home-result-layer`, "行动结果没有处于地图最上层，仍可能被动物或事件气泡遮挡");
  }
  if (!consequenceCard || !consequenceCard.dismissible || !dismissHit
    || consequenceScreenY < 0 || consequenceScreenY + consequenceCard.h > navTop - 6
    || !game.mapViewport || game.mapViewport.y + game.mapViewport.h > navTop - 4) {
    fail(`${viewport.name}/home-result-layer`, "行动结果卡被底部导航裁切、无法点击收起，或地图触控区伸入了导航栏");
  }
  if (dismissHit && typeof dismissHit.onTap === "function") dismissHit.onTap();
  if (game.mapConsequencePulse) {
    fail(`${viewport.name}/home-result-layer`, "点击行动结果卡后没有收起");
    game.mapConsequencePulse = null;
  }
  reserveForTerrain.migration.delta = previousMigrationDelta;
  const homeNetworkAudit = runRenderAudit(game, viewport, "home", game.maxScroll());
  const networkTeaser = game.renderedLeagueTeaser || {};
  if (networkTeaser.h > 106 || networkTeaser.metrics !== 4 || networkTeaser.buttons !== 2
    || !homeNetworkAudit.buttons.some((button) => button.label.startsWith("世界 #") || button.label === "世界榜 · 待开放")
    || (networkTeaser.worldLeaderboardLocked && !homeNetworkAudit.buttons.some((button) => button.label === "世界榜 · 待开放"))
    || homeNetworkAudit.texts.some((item) => item.text.includes("朋友/世界保护地正在影响迁移线"))) {
    fail(`${viewport.name}/home-network`, `保护地网络二级入口异常（${networkTeaser.h || 0}px/${networkTeaser.metrics || 0}项/${networkTeaser.buttons || 0}按钮；${homeNetworkAudit.buttons.map((button) => button.label).join("|")}）`);
  }
  const actionAudit = runRenderAudit(game, viewport, "action", 0);
  if (!actionAudit.texts.some((item) => item.text === "×")) {
    fail(`${viewport.name}/action`, "patrol operation screen should expose a visible close button");
  }
  const threatBoard = game.renderedPatrolThreatBoard || {};
  const threatTiles = game.renderedPatrolThreatTiles || [];
  const actionTiles = game.renderedPatrolActionTiles || [];
  if (threatBoard.h > 154 || threatBoard.metrics !== 1 || threatBoard.redundantSafetyBar !== false
    || !threatBoard.purpose || !threatBoard.instruction
    || threatTiles.length !== 1) {
    fail(`${viewport.name}/action`, "巡护首屏没有收敛为一个优先问题和明确任务说明");
  }
  const urgent = threatTiles[0] || {};
  if (urgent.recommendedAction && urgent.type !== "stable" && urgent.clickable === false) {
    fail(`${viewport.name}/action`, "当前最急风险必须可以点进对应巡护，不能是无效状态卡");
  }
  if (actionAudit.texts.some((item) => ["Safety", "Water", "Poacher", "Migration"].includes(item.text))) {
    fail(`${viewport.name}/action`, "威胁卡仍显示不参与决策的英文副标题");
  }
  if (actionTiles.length !== 1 || actionTiles.some((item) => !item.primaryLabel || !item.primaryValue || item.valueSize < 12 || !item.costText)) {
    fail(`${viewport.name}/action`, `巡护页必须只展示当前任务，并保留真实变化与资源消耗（任务卡 ${actionTiles.length}）`);
  }
  const missingActionResources = ["资金", "承载", "社区"].filter((label) => !actionAudit.texts.some((item) => item.text === label));
  if (missingActionResources.length
    || actionAudit.texts.some((item) => item.text === "巡护点" || /巡护节奏|现场/.test(item.text))) {
    fail(`${viewport.name}/action`, `巡护页未完整展示核心资源，或仍暴露旧资源（缺 ${missingActionResources.join("、") || "0"}）`);
  }
  game.leagueScope = "world";
  // The world leaderboard is intentionally gated during the first two
  // meaningful actions. Audit its full layout with an account that has met
  // that real unlock condition; the locked teaser is checked above.
  game.state.world.reserve.progression = Object.assign({}, game.state.world.reserve.progression || {}, { totalActions: 2 });
  game.state.ui = Object.assign({}, game.state.ui || {}, {
    firstSessionFocus: Object.assign({}, (game.state.ui || {}).firstSessionFocus || {}, { version: 1, completed: true })
  });
  game.leaguePageByScope = Object.assign({ friends: 0, world: 0 }, game.leaguePageByScope || {}, { world: 0 });
  game.state.world.reserve.league.rivals = (game.state.world.reserve.league.rivals || []).filter((row) => row.scope !== "world");
  game.state.world.reserve.league.rivals.push(...Array.from({ length: 120 }, (_, index) => ({
    id: `audit_world_${viewport.name}_${index}`,
    name: `真实玩家${index + 1}的苔原哨站`,
    owner: `真实玩家${index + 1}`,
    reserveName: "苔原哨站",
    valuation: 20000 - index * 100,
    rating: 20000 - index * 100,
    rank: index + 1,
    shield: 37 + index * 3,
    animals: 42 + index,
    material: 120,
    style: "真实经营",
    scope: "world",
    simulated: false,
    source: "cloud"
  })));
  game.ensureSelectedRivalForScope("world");
  const worldLeagueAudit = runRenderAudit(game, viewport, "league", 0);
  if (!worldLeagueAudit.texts.some((item) => item.text.includes("真实玩家"))
    || worldLeagueAudit.texts.some((item) => item.text.includes("系统守护者"))) {
    fail(`${viewport.name}/league-world`, "world ranking should contain only clearly identified real players");
  }
  const leagueHeader = game.renderedLeagueHeader || {};
  const leaguePatrol = game.renderedLeaguePatrolRecord || {};
  const leagueRows = game.renderedLeagueRows || [];
  const leaguePagination = game.renderedLeaguePagination || {};
  if (leagueHeader.h > 88 || leagueHeader.rankSize < 24 || !leagueHeader.rank
    || leaguePatrol.h > 96 || !leaguePatrol.body
    || leagueRows.length !== 10 || leagueRows[0].y - leagueHeader.y > 260
    || leaguePagination.total !== 100 || leaguePagination.pageCount !== 10 || leaguePagination.page !== 0) {
    fail(`${viewport.name}/league-world`, "世界页应展示巡逻记录和市值榜，且整页可滚动");
  }
  const worldLastPageAudit = runRenderAudit(game, viewport, "league", 0, (g) => {
    g.leagueScope = "world";
    g.leaguePageByScope = Object.assign({ friends: 0, world: 9 }, g.leaguePageByScope || {}, { world: 9 });
  });
  const lastPageRows = game.renderedLeagueRows || [];
  if (!game.renderedLeaguePagination || game.renderedLeaguePagination.page !== 9
    || lastPageRows.length !== 10 || lastPageRows[0].rank !== 91 || !lastPageRows.some((row) => row.mine)
    || worldLastPageAudit.texts.some((item) => /卫士[·・•.\-_:：]/.test(item.text))) {
    fail(`${viewport.name}/league-world`, "世界榜百人名单无法翻到末页，或仍显示旧的卫士前缀");
  }
  if (!worldLeagueAudit.buttons.some((button) => button.label === "查看记录")
    || ["边界巡查", "资源交换", "加固"].some((label) => worldLeagueAudit.buttons.some((button) => button.label === label))
    || worldLeagueAudit.texts.some((item) => item.text.startsWith("当前 #") || item.text === "世界保护区" || item.text === "我方" || item.text === "对方")) {
    fail(`${viewport.name}/league-world`, "世界页应只保留巡逻记录入口，不再显示边界巡查三操作");
  }
  const worldActionAudit = runRenderAudit(game, viewport, "league", 0, (g) => {
    g.leagueScope = "world";
    g.state.world.reserve.worldHoundPatrol = {
      pending: [],
      history: [{ status: "settled", targetName: "云岭湖岸哨站", actorReward: { fund: 80, visitors: 12, animals: 4 } }]
    };
  });
  if (!(game.renderedLeaguePatrolRecord && game.renderedLeaguePatrolRecord.hasRecord)
    || !worldActionAudit.texts.some((item) => String(item.text).includes("云岭湖岸哨站"))
    || !worldActionAudit.texts.some((item) => String(item.text).includes("基金 +80"))) {
    fail(`${viewport.name}/league-world-result`, "世界页巡逻记录卡必须显示最近一条巡逻结果");
  }
  game.leagueScope = "friends";
  const emptyFriendAudit = runRenderAudit(game, viewport, "league", 0);
  if (!emptyFriendAudit.buttons.some((button) => button.label === "微信内查看")
    || !emptyFriendAudit.buttons.some((button) => button.label === "邀请好友")
    || !emptyFriendAudit.texts.some((item) => item.text === "微信好友榜仅在微信环境可用")) {
    fail(`${viewport.name}/league-friends`, "friend ranking should explain WeChat authorization and retain a separate invite action");
  }
  if ((game.renderedLeagueHeader || {}).h > 88 || (game.renderedLeagueHeader || {}).rank !== 0
    || (game.renderedLeagueHeader || {}).rankLabel !== "微信好友榜"
    || !(game.renderedLeagueHeader || {}).noTitleTabOverlap
    || (game.renderedLeagueHeader || {}).labelBottom >= (game.renderedLeagueHeader || {}).tabTop
    || emptyFriendAudit.texts.some((item) => /好友 待邀请/.test(item.text) || item.text === "#1")) {
    fail(`${viewport.name}/league-friends`, "好友榜标题与页签仍有重叠，或空好友状态重复展示文字状态");
  }
  const realFriendAudit = runRenderAudit(game, viewport, "league", 0, (g) => {
    g.leagueScope = "friends";
    g.state.world.reserve.league.rivals.push({
      id: `audit_friend_${viewport.name}`,
      name: "好友的长河湿地保护区",
      owner: "真实好友",
      rating: 1190,
      shield: 44,
      animals: 36,
      material: 120,
      style: "共同巡护",
      scope: "friends",
      simulated: false,
      source: "player"
    });
    g.ensureSelectedRivalForScope("friends");
  });
  if (!realFriendAudit.buttons.some((button) => button.label === "查看记录")
    || realFriendAudit.buttons.some((button) => button.label === "好友交换")
    || !(game.renderedLeagueRows || []).some((row) => !row.mine && !row.simulated)
    || realFriendAudit.texts.some((item) => item.text.includes("系统守护者"))) {
    fail(`${viewport.name}/league-friends-real`, "真实好友加入后应显示巡逻记录，而不是好友交换");
  }
  game.leagueScope = "world";
  const collectionAudit = runRenderAudit(game, viewport, "collection", 0, (g) => {
    g.discoveryTab = "population";
  });
  checkPremiumSkin(game, "collection", `${viewport.name}/collection-premium-skin`);
  const discoveryTabs = game.renderedDiscoveryTabs || {};
  const discoveryNetwork = game.renderedDiscoveryNetworkEntry || {};
  if (!discoveryNetwork.friends || !discoveryNetwork.world || discoveryNetwork.h < 32
    || discoveryTabs.y <= discoveryNetwork.y) {
    fail(`${viewport.name}/collection-network`, "Discovery must pin friend and world ranking entry above the two tabs");
  }
  if (!Array.isArray(discoveryTabs.items) || discoveryTabs.items.length !== 2
    || !discoveryTabs.items.some((tab) => tab.id === "visitors")
    || !discoveryTabs.items.some((tab) => tab.id === "population")
    || discoveryTabs.h < 44 || discoveryTabs.gap < 6
    || discoveryTabs.items.some((tab) => !tab.buttonLike || !tab.stateLabel || tab.h < 44)) {
    fail(`${viewport.name}/collection`, "Discovery must expose Visitors and Population Observation as two primary tabs");
  }
  if (!game.renderedSpeciesCards || !game.renderedSpeciesCards.length) {
    fail(`${viewport.name}/collection-population`, "Population Observation did not render as the default Discovery page");
  }
  runRenderAudit(game, viewport, "collection", 0, (g) => {
    g.discoveryTab = "visitors";
  });
  const visitorTable = game.renderedVisitorTable || {};
  if (visitorTable.buildings !== 4 || !Number.isFinite(visitorTable.visitors)
    || !Number.isFinite(visitorTable.income) || !Number.isFinite(visitorTable.influence)
    || !Number.isFinite(visitorTable.letters) || !Number.isFinite(visitorTable.survivalIncome)) {
    fail(`${viewport.name}/collection-visitors`, "Visitor table must show buildings, visitors, economy, events, letters, and survival-program income");
  }

  const collectionShelfAudit = runRenderAudit(game, viewport, "survival", 0, (g) => {
    g.survivalArchiveOpen = true;
    g.collectionCaseId = null;
    ["c1_whistle", "c1_roster", "h_first_photo", "h_hound_tag"].forEach((id, itemIndex) => {
      g.state.world.collection.items[id] = { id, firstDay: itemIndex + 2, methodName: "现场勘验" };
    });
  });
  const collectionFolders = game.renderedCollectionFolders || [];
  if (collectionFolders.length !== 6
    || collectionFolders.some((folder) => folder.columns !== 3 || folder.iconSize < 44 || folder.w < 82)) {
    fail(`${viewport.name}/survival-collection`, "the merged Survival archive must retain six graphic collection folders");
  }
  ["半页值班表", "砾灰磨损的项圈牌"].forEach((name) => {
    if (!collectionShelfAudit.texts.some((item) => item.text === name)) {
      fail(`${viewport.name}/survival-collection`, `the merged archive does not visibly name owned item: ${name}`);
    }
  });
  game.collectionCaseId = "case_1";
  game.collectionPage = 0;
  game.changeCollectionPage(1);
  if (game.collectionPage !== 1) fail(`${viewport.name}/collection`, "next collection page is not reachable");
  game.changeCollectionPage(-1);
  if (game.collectionPage !== 0) fail(`${viewport.name}/collection`, "previous collection page is not reachable");
  const collectionCtaAudit = runRenderAudit(game, viewport, "survival", 0, (g) => {
    g.survivalArchiveOpen = true;
    g.collectionCaseId = "case_1";
    g.collectionPage = 0;
    const discovery = { id: "story_cta", itemId: "c1_footprint", caseId: "case_1", status: "hinted", actionId: "habitat", actionLabel: "修复附近环境", regionId: "river", animal: { id: "npc_deer", name: "晨角", trust: 72 } };
    g.state.world.collection.discovery.active = discovery;
    g.state.world.collection.discovery.states.c1_footprint = discovery;
  });
  const investigationCta = collectionCtaAudit.buttons.find((button) => button.label === "下一步 · 修复附近环境");
  const activeCtaState = game.renderedCollectionCaseCta || {};
  if (!investigationCta || investigationCta.h < 40 || activeCtaState.kind !== "story"
    || !activeCtaState.enabled) {
    fail(`${viewport.name}/collection`, "剧情发现没有明确展示下一步行动或可点击状态");
  }
  const emptyCollectionCtaAudit = runRenderAudit(game, viewport, "survival", 0, (g) => {
    g.survivalArchiveOpen = true;
    g.collectionCaseId = "case_1";
    g.collectionPage = 0;
    g.state.world.collection.leads = [];
    g.state.world.collection.investigation.pending = null;
    g.state.world.collection.discovery.active = null;
  });
  const emptyCtaState = game.renderedCollectionCaseCta || {};
  if (emptyCtaState.kind !== "none" || emptyCtaState.enabled || emptyCtaState.leadCount !== 0
    || !emptyCollectionCtaAudit.buttons.some((button) => button.label === "等待动物发现异常")
    || emptyCollectionCtaAudit.hits.some((hit) => rectOverlaps(hit, emptyCtaState.bounds || {}))) {
    fail(`${viewport.name}/collection`, "没有剧情迹象时按钮必须置灰、说明原因且不可点击");
  }
  const collectionCards = game.renderedCollectionCards || [];
  if (collectionCards.length !== 6
    || collectionCards.some((card) => card.columns !== 3 || card.iconSize < 48 || card.h < 112)) {
    fail(`${viewport.name}/collection`, "collection case must use a 3x2 large-art grid without text-heavy cards");
  }
  if (collectionCards.some((card) => card.visualStyle !== "archive-item-card-v2"
    || !card.paperBase || card.iconRatio < .42 || !card.stateStyle || !card.ctaLabel
    || (!card.unlocked && !card.lockBadge))) {
    fail(`${viewport.name}/collection`, "collection item cards must keep the shared paper, artwork, lock, and single-state-button treatment");
  }
  if (collectionCards.some((card) => card.titleSize < 11
    || card.titleBaseline - card.titleSize < card.iconVisualBottom + 5
    || card.titleBaseline + 14 > card.statusY - 5)) {
    fail(`${viewport.name}/collection`, "collection item title is too small or overlaps the toy icon/status area");
  }
  const collectedItemAudit = runRenderAudit(game, viewport, "survival", 0, (g) => {
    g.survivalArchiveOpen = true;
    g.collectionCaseId = "case_1";
    g.state.world.collection.items.c1_roster = {
      id: "c1_roster",
      firstDay: 2,
      discovery: { who: "短耳", where: "中央混交林", action: "现场记录" }
    };
    g.openCollectionItem("c1_roster");
  });
  const collectedDetail = (game.infoDetailModal || {}).renderedCollectionItemDetail || {};
  if (collectedDetail.iconSize < 68 || collectedDetail.iconSize > 82
    || collectedDetail.plateSize < 88 || collectedDetail.plateShape !== "rounded-square"
    || collectedDetail.metaLayout !== "side" || collectedDetail.storyH > 118
    || collectedDetail.graphicalStages !== 4 || !collectedDetail.owned
    || !collectedItemAudit.texts.some((item) => item.text === "故事")) {
    fail(`${viewport.name}/collection-item`, "已发现物详情必须使用清晰大图、简短故事和四段发现过程");
  }
  const lockedItemAudit = runRenderAudit(game, viewport, "survival", 0, (g) => {
    g.survivalArchiveOpen = true;
    g.collectionCaseId = "case_1";
    const discovery = { id: "story_locked", itemId: "c1_footprint", caseId: "case_1", status: "hinted", actionId: "habitat", actionLabel: "修复附近环境", regionId: "river", animal: { id: "npc_deer", name: "晨角", trust: 72 } };
    g.state.world.collection.discovery.active = discovery;
    g.state.world.collection.discovery.states.c1_footprint = discovery;
    g.openCollectionItem("c1_footprint");
  });
  const lockedDetail = (game.infoDetailModal || {}).renderedCollectionItemDetail || {};
  if (lockedDetail.iconSize < 68 || lockedDetail.iconSize > 82
    || lockedDetail.plateShape !== "rounded-square" || lockedDetail.metaLayout !== "side" || lockedDetail.owned
    || !lockedItemAudit.texts.some((item) => item.text === "下一步")
    || !lockedItemAudit.buttons.some((button) => button.label === "修复附近环境")) {
    fail(`${viewport.name}/collection-item-locked`, "未收录物详情必须展示清晰轮廓、简短迹象和直达守护行动");
  }
  runRenderAudit(game, viewport, "home", 0, (g) => {
    g.infoDetailModal = g.buildSandboxInfoDetail("brief");
  });
  const patrolTaskAudit = runRenderAudit(game, viewport, "action", 0, (g) => {
    g.state.world.reserve.actionPoints = 4;
    g.state.world.reserve.supplies.dogFood = 5;
    g.selectedReserveAction = "houndScout";
    g.command = "派猎犬侦察";
    g.patrolTaskModal = g.selectedReserveActionOption();
  });
  checkPatrolTaskModal(game, patrolTaskAudit, `${viewport.name}/patrol-task`);
  if (!patrolTaskAudit.buttons.some((button) => button.label === "执行结算")
    || patrolTaskAudit.buttons.some((button) => /规划路线|按路线出发/.test(button.label))) {
    fail(`${viewport.name}/patrol-task`, "巡护任务必须直接结算且不显示路线第二步");
  }
  const plannerAudit = runRenderAudit(game, viewport, "action", 0, (g) => {
    g.state.world.reserve.actionPoints = 4;
    g.state.world.reserve.supplies.dogFood = 5;
    g.selectedReserveAction = "houndScout";
    g.patrolTaskModal = g.selectedReserveActionOption();
    g.patrolOperationPlan = { actionId: "houndScout", nodeIds: ["scent", "ridge"] };
  });
  if (plannerAudit.buttons.some((button) => /返回调整|按路线出发|规划路线/.test(button.label))) {
    fail(`${viewport.name}/patrol-single-step`, "旧路线规划按钮仍然可见");
  }
  const directRouteAudit = runRenderAudit(game, viewport, "action", 0, (g) => {
    g.state.world.reserve.actionPoints = 4;
    g.state.world.reserve.supplies.dogFood = 5;
    g.selectedReserveAction = "houndScout";
    g.command = "派猎犬侦察";
    g.patrolTaskModal = g.selectedReserveActionOption();
    g.patrolOperationPlan = { actionId: "houndScout", nodeIds: ["scent", "ridge"] };
    g.confirmPatrolOperation();
  });
  if (directRouteAudit.buttons.some((button) => button.label === "稳住路线" || button.label === "追查异响")) {
    fail(`${viewport.name}/patrol-direct-settlement`, "路线确认后不应再次弹出稳住/追查的第二次选择");
  }
  const salvageTaskAudit = runRenderAudit(game, viewport, "role", 0, (g) => {
    g.state.world.reserve.actionPoints = 4;
    g.state.world.reserve.inventory.recoveredTrap = 3;
    g.selectedReserveAction = "salvage";
    g.command = "移交库存中的隐踪器";
    g.patrolTaskModal = g.reserveActionOptions().find((item) => item.id === "salvage");
  });
  checkPatrolTaskModal(game, salvageTaskAudit, `${viewport.name}/salvage-task`);
  const purchaseTaskAudit = runRenderAudit(game, viewport, "role", 0, (g) => {
    g.state.world.reserve.fund = Math.max(900, g.state.world.reserve.fund || 0);
    g.selectedReserveAction = "buySupplies";
    g.selectedPurchaseId = "dogFood";
    g.command = "采购狗粮包";
    g.patrolTaskModal = g.reserveActionOptions().find((item) => item.id === "buySupplies");
  });
  checkPatrolTaskModal(game, purchaseTaskAudit, `${viewport.name}/purchase-task`, { maxHeight: 350 });
  if (!purchaseTaskAudit.texts.some((item) => item.text === "补给入库")
    || !purchaseTaskAudit.texts.some((item) => /\d+→\d+/.test(item.text))
    || purchaseTaskAudit.texts.some((item) => item.text === "结算摘要" || /狗粮包\s*\+|确认后\s*狗粮包/.test(item.text))) {
    fail(`${viewport.name}/purchase-task`, "purchase task did not use the compact horizontal before/after result strip");
  }
  const blockedTaskAudit = runRenderAudit(game, viewport, "action", 0, (g) => {
    g.state.world.reserve.actionPoints = 4;
    g.state.world.reserve.fieldPermits = 3;
    g.state.world.reserve.supplies.alarm = 0;
    g.selectedReserveAction = "antiPoacher";
    g.command = "驱赶偷猎者";
    g.patrolTaskModal = g.selectedReserveActionOption();
  });
  checkPatrolTaskModal(game, blockedTaskAudit, `${viewport.name}/blocked-patrol-task`, { blocked: true });
  ["fund", "water", "grass"].forEach((type) => {
    const metricAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
      if (type === "fund") {
        g.state.world.reserve.fund = 520;
        g.state.world.reserve.guardianCycle.day = 2;
        g.state.world.reserve.emergencyFundAd = {};
      }
      g.infoDetailModal = g.buildReserveMetricDetail(type);
      if (type === "fund") {
        if (g.infoDetailModal.readOnly || typeof g.infoDetailModal.action !== "function" || !/\+1000/.test(g.infoDetailModal.actionLabel || "")) {
          fail(`${viewport.name}/fund-data`, "低基金详情必须提供章节定额激励视频入口");
        }
      } else if (!g.infoDetailModal.readOnly || g.infoDetailModal.action || g.infoDetailModal.actionLabel) {
        fail(`${viewport.name}/${type}-data`, "水源、草场详情必须只展示数据，不能带经营操作");
      }
    });
    if (type === "fund" && !metricAudit.buttons.some((button) => /看广告/.test(button.label) && /1000/.test(button.label))) {
      fail(`${viewport.name}/fund-data`, "保护基金详情底部没有渲染广告奖励按钮");
    }
  });
  runRenderAudit(game, viewport, "home", 0, (g) => {
    g.infoDetailModal = g.buildChapterProgressDetail();
  });
  const prosperityAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    g.openReserveProsperityDetail();
  });
  checkMetricDashboard(game, prosperityAudit, `${viewport.name}/prosperity-dashboard`, ["市值", "物种", "动物"]);
  const resourceHeaderAudit = runRenderAudit(game, viewport, "role", 0);
  checkPremiumSkin(game, "role", `${viewport.name}/role-premium-skin`);
  const resourceHeader = game.renderedActionResourceHeader || [];
  if (resourceHeader.length !== 3 || resourceHeader.map((item) => item.kind).join(",") !== "fund,supplies,reputation"
    || resourceHeader.some((item) => item.w < 44 || item.h < 28)) {
    fail(`${viewport.name}/role-resource-header`, "基金/补给/社区入口缺失、顺序错误或点击区过小");
  }
  if (!["基金", "补给", "社区"].every((label) => resourceHeaderAudit.texts.some((item) => item.text === label))
    || resourceHeaderAudit.texts.some((item) => /巡护节奏|现场/.test(item.text))) {
    fail(`${viewport.name}/role-resource-header`, "核心资源入口不清楚或仍显示废弃资源");
  }
  const supplyCards = game.renderedSupplyCards || [];
  if (supplyCards.length !== 6
    || supplyCards.some((card) => card.columns !== 3 || card.h < 120 || card.iconSize < 48
      || card.visualStyle !== "archive-item-card-v2" || !card.paperBase
      || card.iconRatio < .45 || !card.stateStyle || !card.ctaLabel)) {
    fail(`${viewport.name}/role-supply-cards`, "supply items must use six 3x2 large-art archive cards with one bottom state control");
  }
  if (resourceHeaderAudit.texts.some((item) => /^安全线\s*\d+/.test(item.text))) {
    fail(`${viewport.name}/role-supply-cards`, "supply cards should not repeat safety-line copy on the card face");
  }
  runRenderAudit(game, viewport, "survival", 0);
  checkPremiumSkin(game, "survival", `${viewport.name}/survival-premium-skin`);
  const survivalCards = game.renderedSurvivalCards || [];
  if (survivalCards.length < 12
    || survivalCards.some((card) => card.h < 140 || card.imageSize < 60 || !card.imageDominant
      || card.summaryLines !== 1 || card.disclosure !== "detail-modal"
      || !card.ctaLabel || !card.cta || card.cta.h < 22)) {
    fail(`${viewport.name}/survival-progressive-disclosure`, "survival catalog cards must be image-dominant, concise, and open detailed explanations on tap");
  }
  if (survivalCards.some((card) => card.visualStyle !== "archive-item-card-v2"
    || !card.paperBase || card.iconRatio < .35 || !card.stateStyle
    || (!card.unlocked && !card.lockBadge))) {
    fail(`${viewport.name}/survival-progressive-disclosure`, "survival items must share the parchment frame, large artwork, lock seal, and bottom state control");
  }
  const nativeAdState = { slot: null, visible: false };
  runRenderAudit(game, viewport, "role", 0, (g) => {
    g.nativeTemplateAds = {
      isSupported: () => true,
      layoutSize: () => ({ width: Math.min(320, viewport.width - 48), height: 90 }),
      setViewportSlot: (slot) => { nativeAdState.slot = slot; },
      setVisible: (visible) => { nativeAdState.visible = !!visible; }
    };
  });
  const initialAdSlot = game.renderedNativeTemplateAdSlot || {};
  if (!initialAdSlot.inline || initialAdSlot.reservedHeight < 120 || initialAdSlot.railWidth < 24
    || initialAdSlot.visualStyle !== "field-bulletin-v2"
    || !initialAdSlot.slot || game.maxScroll() <= 0
    || initialAdSlot.visible !== initialAdSlot.fullyInsideViewport
    || nativeAdState.visible !== initialAdSlot.fullyInsideViewport) {
    fail(`${viewport.name}/role-native-ad`, "原生广告必须占用页面内容高度、保留至少24px滑动通道，且仅在完整进入安全视口时显示");
  }
  const adScroll = initialAdSlot.slot
    ? Math.max(0, initialAdSlot.slot.y - (game.compactStageTop() + 52))
    : 0;
  game.screen = "role";
  game.scrollY = adScroll;
  game.infoDetailModal = null;
  game.patrolTaskModal = null;
  game.settlementModal = null;
  game.chapterStoryModal = null;
  game.render();
  const visibleAdSlot = game.renderedNativeTemplateAdSlot || {};
  if (!visibleAdSlot.visible || !visibleAdSlot.fullyInsideViewport || !visibleAdSlot.slot || !nativeAdState.visible || !nativeAdState.slot
    || nativeAdState.slot.top < visibleAdSlot.safeTop
    || nativeAdState.slot.top + visibleAdSlot.slot.h > visibleAdSlot.navTop - 8) {
    fail(`${viewport.name}/role-native-ad`, "原生广告槽完整进入安全视口后应随滚动定位，且不得覆盖顶部安全区或底部导航");
  }
  const animalDashboardAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    const animal = g.state.world.knownCharacters[0];
    g.infoDetailModal = g.buildAnimalThoughtDetail(animal, g.createAnimalDialogueContext(animal));
  });
  checkMapAnimalAction(game, animalDashboardAudit, `${viewport.name}/animal-dashboard`);
  const comfortAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    const animal = g.state.world.knownCharacters[0];
    g.openAnimalCareProcess(animal, "calmObserve");
  });
  checkAnimalComfort(game, comfortAudit, `${viewport.name}/animal-comfort`, "approach");
  const comfortResultAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    const animal = g.state.world.knownCharacters[0];
    const config = g.animalCareProcessConfig(animal, "calmObserve");
    g.infoDetailModal = {
      kind: "animalComfort",
      phase: "result",
      step: 1,
      kicker: "温柔回应",
      title: "它没有转身离开",
      icon: config.icon,
      animal,
      actionId: "calmObserve",
      config,
      resultChanges: [
        { label: "信任", value: "62→64（+2）", tone: "good" },
        { label: "警惕", value: "11→10（-1）", tone: "good" },
        { label: "基金", value: "620→615", tone: "warn" }
      ]
    };
  });
  checkAnimalComfort(game, comfortResultAudit, `${viewport.name}/animal-comfort-result`, "result");
  const warehouseDetailAudit = runRenderAudit(game, viewport, "role", 0, (g) => {
    g.infoDetailModal = g.openMaterialDetail("warehouse") || g.infoDetailModal;
  });
  const supplyDetailAudit = runRenderAudit(game, viewport, "role", 0, (g) => {
    g.infoDetailModal = g.buildMaterialDetail("supply", "tranquilizer");
  });
  ["用途", "库存", "执行后", "影响", "建议"].forEach((label) => {
    if (!supplyDetailAudit.texts.some((item) => item.text === label)) {
      fail(`${viewport.name}/supply-detail`, `horizontal supply summary lost section: ${label}`);
    }
  });
  const settlementAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    g.settlementModal = settlementFixture(g);
  });
  const settlementChanges = (game.settlementModal && game.settlementModal.renderedSettlementChanges) || [];
  const primarySettlementChange = settlementChanges.find((item) => item.role === "primary");
  const settlementRewardRows = (game.settlementModal && game.settlementModal.renderedSettlementRewardRows) || [];
  const settlementStyle = (game.settlementModal && game.settlementModal.renderedSettlementStyle) || {};
  if (!primarySettlementChange || primarySettlementChange.label !== "偷猎压力"
    || primarySettlementChange.valueSize < 23 || primarySettlementChange.beneficial !== true
    || primarySettlementChange.shownValue !== 12) {
    fail(`${viewport.name}/settlement`, "结算没有把最关键的逆向风险变化作为大号主数据展示");
  }
  if (settlementChanges.filter((item) => item.role === "secondary").length > 3
    || !settlementChanges.some((item) => item.label === "安全" && item.role === "secondary")) {
    fail(`${viewport.name}/settlement`, "结算的次要数据没有收束为最多三项清晰辅助变化");
  }
  if (!settlementRewardRows.length || settlementRewardRows.length > 3 || settlementRewardRows.some((item) => item.size < 10)) {
    fail(`${viewport.name}/settlement`, "结算明细仍然过密或字号过小");
  }
  if (!settlementStyle.compactCopy || settlementStyle.rewardRows > 2 || (settlementStyle.palette || []).length > 3
    || settlementStyle.repeatedGoalLabel !== false
    || settlementAudit.texts.some((item) => /结果与后续|结算明细|目标未达成|守护回声/.test(item.text))) {
    fail(`${viewport.name}/settlement`, "结算仍存在过多颜色层级或重复说明文字");
  }
  if (!settlementAudit.texts.some((item) => item.text === "12" && item.size >= 23)
    || settlementAudit.texts.some((item) => item.text === "因果与奖励")) {
    fail(`${viewport.name}/settlement`, "结算主数字不突出，或旧的同权重信息标题仍在显示");
  }
  const settlementButtons = settlementAudit.buttons.filter((button) => button.phase === "modal").map((button) => button.label);
  if (!settlementButtons.includes("关闭") || settlementButtons.includes("推荐这款游戏")
    || settlementStyle.secondaryAction !== "close") {
    fail(`${viewport.name}/settlement`, "结算左侧必须是关闭入口，不得再次插入游戏推荐");
  }
  const crisisSettlementAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    g.settlementModal = crisisSettlementFixture(g);
  });
  const crisisButtons = crisisSettlementAudit.buttons.filter((button) => button.phase === "modal").map((button) => button.label);
  if (!crisisButtons.includes("去猎犬侦察") || !crisisButtons.includes("关闭") || crisisButtons.includes("完成 ✓")) {
    fail(`${viewport.name}/settlement-crisis`, "失控事件没有给出可直达的具体处置按钮");
  }
  if (!crisisSettlementAudit.texts.some((item) => /猎犬侦察/.test(item.text) && item.size >= 10)) {
    fail(`${viewport.name}/settlement-crisis`, "失控事件没有把具体处置方式提升为主要信息");
  }
  const gradeBadge = (game.settlementModal && game.settlementModal.renderedSettlementGradeBadge) || {};
  if (gradeBadge.grade !== "A" || gradeBadge.gradeSize < 28 || gradeBadge.scoreSize < 11
    || gradeBadge.fill !== "cream-gold" || gradeBadge.gradeColor !== "#173d34" || gradeBadge.scoreColor !== "#173d34") {
    fail(`${viewport.name}/settlement-crisis`, "评级徽章字号、底色或文字对比度不足");
  }
  const commerceAudit = runRenderAudit(game, viewport, "role", 0, (g) => {
    g.settlementModal = Object.assign(settlementFixture(g), {
      causality: null,
      title: "样本移交完成 · 研究补助 +230",
      commerce: { count: 2, description: "A级岩角×1 / 研究样本×1", baseValue: 210, value: 230, fundingLabel: "研究补助", levelFactor: 1.05, neighborFactor: 1.04 },
      fundBefore: 1000,
      fundAfter: 1230,
      returnScreen: "role"
    });
  });
  const commercePrimary = ((game.settlementModal && game.settlementModal.renderedSettlementChanges) || []).find((item) => item.role === "primary");
  if (!commercePrimary || commercePrimary.label !== "基金" || commercePrimary.shownValue !== 1230 || commercePrimary.valueSize < 18) {
    fail(`${viewport.name}/settlement-commerce`, "样本移交结算没有把实际拨款作为核心大数字");
  }
  const commerceStyle = (game.settlementModal && game.settlementModal.renderedSettlementStyle) || {};
  if (!commerceStyle.focusedOutcome || commerceStyle.focusMode !== "commerce" || commerceStyle.rewardRows !== 1
    || commerceAudit.texts.filter((item) => item.phase === "modal" && item.text === "研究补助 +230").length !== 1
    || commerceAudit.texts.some((item) => item.phase === "modal" && item.text === "明日")) {
    fail(`${viewport.name}/settlement-commerce`, "样本移交结算仍重复拨款金额，或次要信息没有收束");
  }
  const explorationAudit = runRenderAudit(game, viewport, "role", 0, (g) => {
    g.settlementModal = Object.assign(settlementFixture(g), {
      causality: null,
      title: "探索发现 · 隐踪器 ×2",
      materialExploration: {
        reward: { id: "trap", label: "隐踪器", amount: 2 },
        roll: 5,
        levelContribution: 2,
        relationshipContribution: 1,
        qualityScore: 8,
        requiredScore: 6,
        relationship: { securityAverage: 64, wildnessAverage: 58, helper: { name: "晨角" } }
      },
      fundBefore: 1000,
      fundAfter: 1000,
      returnScreen: "role"
    });
  });
  const explorationPrimary = ((game.settlementModal && game.settlementModal.renderedSettlementChanges) || []).find((item) => item.role === "primary");
  if (!explorationPrimary || explorationPrimary.label !== "隐踪器" || explorationPrimary.shownValue !== "×2" || explorationPrimary.valueSize < 18) {
    fail(`${viewport.name}/settlement-exploration`, "探索结算没有突出具体收集物名称与数量");
  }
  const explorationStyle = (game.settlementModal && game.settlementModal.renderedSettlementStyle) || {};
  const explorationTitleCount = explorationAudit.texts.filter((item) => /隐踪器\s*×2/.test(item.text)).length;
  if (!explorationStyle.focusedExploration || explorationStyle.rewardRows !== 1 || explorationTitleCount !== 1) {
    fail(`${viewport.name}/settlement-exploration`, "探索结算重复展示收集物，或次要信息仍与主结果争夺视觉层级");
  }
  if (explorationAudit.texts.some((item) => item.text === "明日" || /^点数[:：]/.test(item.text))) {
    fail(`${viewport.name}/settlement-exploration`, "探索结算仍显示多余的明日信息区或旧版点数明细");
  }
  const recoveryAudit = runRenderAudit(game, viewport, "role", 0, (g) => {
    g.settlementModal = Object.assign(settlementFixture(g), {
      causality: null,
      title: "回收完成 · A级岩角 ×1",
      recoveredGoodsGain: { items: [{ id: "antler", label: "A级岩角", amount: 1 }] },
      fundBefore: 1000,
      fundAfter: 1000,
      returnScreen: "role"
    });
  });
  const recoveryPrimary = ((game.settlementModal && game.settlementModal.renderedSettlementChanges) || []).find((item) => item.role === "primary");
  if (!recoveryPrimary || recoveryPrimary.label !== "A级岩角" || recoveryPrimary.shownValue !== "×1") {
    fail(`${viewport.name}/settlement-recovery`, "回收结算没有突出具体回收物名称与数量");
  }
  const recoveryStyle = (game.settlementModal && game.settlementModal.renderedSettlementStyle) || {};
  if (!recoveryStyle.focusedOutcome || recoveryStyle.focusMode !== "recovery" || recoveryStyle.rewardRows !== 1
    || recoveryAudit.texts.filter((item) => item.phase === "modal" && /A级岩角\s*×1/.test(item.text)).length !== 1
    || recoveryAudit.texts.some((item) => item.phase === "modal" && item.text === "明日")) {
    fail(`${viewport.name}/settlement-recovery`, "回收结算仍重复物品名称，或次要信息没有收束");
  }
  const mysteryAudit = runRenderAudit(game, viewport, "role", 0, (g) => {
    g.settlementModal = Object.assign(settlementFixture(g), {
      causality: null,
      title: "追回白犀牛角证物",
      mysteryRecovery: { id: "white_rhino_horn", name: "白犀牛角证物", fundReward: 120 },
      breakthrough: { kind: "mystery_recovery", kicker: "超等级·神秘证物", title: "追回白犀牛角证物" },
      returnScreen: "role"
    });
  });
  const mysteryStyle = (game.settlementModal && game.settlementModal.renderedSettlementStyle) || {};
  if (!mysteryStyle.focusedOutcome || mysteryStyle.focusMode !== "mystery" || mysteryStyle.rewardRows !== 1
    || mysteryAudit.texts.filter((item) => item.phase === "modal" && item.text === "白犀牛角证物").length !== 1
    || mysteryAudit.texts.some((item) => item.phase === "modal" && item.text === "明日")) {
    fail(`${viewport.name}/settlement-mystery`, "神秘证物结算仍重复名称，或封存规则没有收束");
  }
  runRenderAudit(game, viewport, "animalworld", 0, (g) => {
    g.infoDetailModal = g.buildLifeMemoryDetail();
  });
  runRenderAudit(game, viewport, "animalworld", 0, (g) => {
    const species = require("../js/animalWorld").getUnlockedSpecies(1)[0];
    g.infoDetailModal = g.buildSpeciesProfileDetail(species.id);
  });
  runRenderAudit(game, viewport, "animalworld", 0, (g) => {
    g.infoDetailModal = g.buildFoodChainDetail();
  });
  runRenderAudit(game, viewport, "animalworld", 0, (g) => {
    const friend = require("../js/emotionSystem").normalizeLifeMemory(g.state.world).individuals[0];
    g.openNamedIndividual(friend);
  });
  const collectionEndingAudit = runRenderAudit(game, viewport, "collection", 0, (g) => {
    g.openCollectionItem("c1_whistle");
  });
  runRenderAudit(game, viewport, "collection", 0, (g) => {
    g.openCollectionItem("c3_ledger");
  });
  const investigationAudit = runRenderAudit(game, viewport, "collection", 0, (g) => {
    g.state.world.collection.leads = [{ id: "audit_lead", caseId: "case_1", quality: 1, sourceAction: "houndScout", sourceLabel: "猎犬侦察", animal: { id: "npc_deer", name: "晨角", trust: 72 }, title: "清晰线索", clue: "水边出现一条待调查的旧路线。" }];
    g.openCollectionInvestigation("audit_lead");
  });
  if (!game.infoDetailModal || game.infoDetailModal.selectedMethodId !== "animal") {
    fail(`${viewport.name}/collection-investigation`, "调查弹窗没有默认选择适合的调查方式");
  }
  if (!investigationAudit.texts.some((item) => item.text.includes("推荐 ·")) || !investigationAudit.texts.some((item) => item.text.includes("怎么完成")) || !investigationAudit.buttons.some((button) => button.label === "开始调查")) {
    fail(`${viewport.name}/collection-investigation`, "推荐方案、三步说明或开始调查按钮没有展示");
  }
  const methodLayout = (game.infoDetailModal && game.infoDetailModal.renderedMethodLayout) || [];
  const methodText = (game.infoDetailModal && game.infoDetailModal.renderedMethodText) || [];
  const investigationVisual = (game.infoDetailModal && game.infoDetailModal.renderedCollectionInvestigation) || {};
  if (methodLayout.length !== 3
    || methodLayout.some((item) => !item.graphical || item.layout !== "horizontal" || item.h < 54 || item.iconSize < 30 || item.valueSize < 13)
    || !methodLayout.some((item) => item.selected)
    || investigationVisual.graphicalTiles !== 3
    || investigationVisual.layout !== "simple"
    || investigationVisual.primaryValueSize < 13
    || investigationVisual.detailH < 48) {
    fail(`${viewport.name}/collection-investigation`, "调查方式没有形成清晰的方案选择与结算说明");
  }
  if (!methodText.length || methodText.some((item) => !item.layout || item.layout.truncated)) {
    fail(`${viewport.name}/collection-investigation`, "默认调查方式仍有核心说明被截断");
  }
  game.selectCollectionMethod("field");
  if (game.infoDetailModal.selectedMethodId !== "field" || !game.infoDetailModal.selectionChanged) {
    fail(`${viewport.name}/collection-investigation`, "玩家不能替换默认调查方式");
  }
  if (game.preferredCollectionMethodId({ animal: { trust: 20 } }) !== "field") {
    fail(`${viewport.name}/collection-investigation`, "隐藏档案关系不足时没有默认选择稳定的现场勘验");
  }
  const collectionDiceAudit = runRenderAudit(game, viewport, "collection", 0, (g) => {
    g.state.world.collection.investigation.charges = 2;
    g.state.world.collection.leads = [{ id: "audit_dice", caseId: "case_1", quality: 2, sourceAction: "houndScout", sourceLabel: "猎犬侦察", animal: { id: "npc_deer", name: "晨角", trust: 82 }, title: "关键线索", clue: "水边出现一条关键旧路线。" }];
    require("../js/collectionSystem").startInvestigation(g.state, "audit_dice", "animal");
    g.openCollectionDice("audit_dice", "animal");
  });
  if (!collectionDiceAudit.texts.some((item) => /第2步 \/ 2/.test(item.text)) || !collectionDiceAudit.buttons.some((button) => button.label === "发射并判定")) {
    fail(`${viewport.name}/collection-dice`, "点数调查缺少明确的第二步提示或底部判定按钮");
  }
  if (collectionDiceAudit.buttons.some((button) => button.label === "稍后继续" || /生成点数决定/.test(button.label))) {
    fail(`${viewport.name}/collection-dice`, "点数调查底部不应再保留稍后继续或生成点数决定");
  }
  const collectionDiceFactors = (game.infoDetailModal && game.infoDetailModal.renderedDiceFactors) || [];
  if (collectionDiceFactors.length !== 3 || collectionDiceFactors.some((item) => item.labelSize < 9 || item.valueSize < 17)) {
    fail(`${viewport.name}/collection-dice`, "调查骰子的线索、方案或随机点数数据过小");
  }
  if (collectionDiceAudit.texts.filter((item) => item.text === "动物引路").length > 1) {
    fail(`${viewport.name}/collection-dice`, "调查方式名称在标题和步骤正文中重复出现");
  }
  const materialDiceAudit = runRenderAudit(game, viewport, "role", 0, (g) => {
    g.state.world.reserve.actionPoints = 3;
    g.openMaterialExploration("shedAntlerA");
  });
  if (materialDiceAudit.texts.filter((item) => item.phase === "modal" && /A级岩角/.test(item.text)).length !== 1
    || !materialDiceAudit.texts.some((item) => item.text === "定向样本 + 生存素材")) {
    fail(`${viewport.name}/material-dice`, "物资探索目标在标题和骰子正文中重复出现");
  }
  const strategicDiceAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    const { strategicDilemmaById } = require("../js/strategySystem");
    const dilemma = strategicDilemmaById("water_access");
    const choice = dilemma && dilemma.choices.find((item) => item.dice);
    if (choice) g.openStrategicDiceModal(dilemma, choice);
  });
  const strategicDiceTitle = game.infoDetailModal && game.infoDetailModal.choice && game.infoDetailModal.choice.label;
  if (!strategicDiceTitle || strategicDiceAudit.texts.filter((item) => item.text === strategicDiceTitle).length !== 1
    || !strategicDiceAudit.texts.some((item) => item.text === "成功目标")) {
    fail(`${viewport.name}/strategy-dice`, "高风险方案名称在标题和骰子正文中重复出现");
  }
  runRenderAudit(game, viewport, "collection", 0, (g) => {
    const api = require("../js/collectionSystem");
    api.itemsForCase("case_1").slice(0, 7).forEach((item) => {
      g.state.world.collection.items[item.id] = { id: item.id, firstDay: 1 };
      if (!g.state.world.collection.cases.case_1.itemIds.includes(item.id)) g.state.world.collection.cases.case_1.itemIds.push(item.id);
    });
    g.openCollectionEnding("case_1");
  });
  runRenderAudit(game, viewport, "collection", 0, (g) => {
    const api = require("../js/collectionSystem");
    api.itemsForCase("case_1").slice(0, 7).forEach((item) => {
      g.state.world.collection.items[item.id] = { id: item.id, firstDay: 1 };
      if (!g.state.world.collection.cases.case_1.itemIds.includes(item.id)) g.state.world.collection.cases.case_1.itemIds.push(item.id);
    });
    const realRender = g.render;
    g.render = () => {};
    g.openCollectionEnding("case_1");
    const choice = g.infoDetailModal && g.infoDetailModal.endingChoices && g.infoDetailModal.endingChoices[0];
    if (choice) g.selectCollectionEnding(choice.id);
    g.render = realRender;
  });
  const collectionEndingText = (game.infoDetailModal && game.infoDetailModal.renderedChoiceText) || [];
  if (!collectionEndingText.length || collectionEndingText.some((item) => !item.layout || item.layout.truncated)) {
    fail(`${viewport.name}/collection-ending`, "案件结局的关键数值或完整后果仍被截断");
  }
  if (viewport.name === "small") {
    const { CASES, ENDINGS } = require("../js/collectionSystem");
    CASES.filter((caseDef) => !caseDef.hidden).forEach((caseDef) => {
      (ENDINGS[caseDef.id] || []).forEach((choice) => {
        runRenderAudit(game, viewport, "collection", 0, (g) => {
          g.infoDetailModal = {
            kind: "collectionEnding",
            kicker: "案件终章·三选一",
            title: caseDef.title,
            icon: caseDef.icon,
            caseDef,
            endingChoices: ENDINGS[caseDef.id],
            selectedChoiceId: choice.id,
            footer: "影响路线、动物关系与世界状态。"
          };
        });
        const endingLayout = (game.infoDetailModal && game.infoDetailModal.renderedChoiceLayout) || [];
        const endingText = (game.infoDetailModal && game.infoDetailModal.renderedChoiceText) || [];
        if (endingLayout.length !== 3 || endingText.some((item) => !item.layout || item.layout.truncated)) {
          fail(`small/collection-ending/${caseDef.id}/${choice.id}`, "结局卡在最小屏无法完整展开");
        }
      });
    });
  }
  const strategyChoiceAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    const { normalizeStrategyState, strategicDilemmaById } = require("../js/strategySystem");
    const dilemma = strategicDilemmaById("water_access");
    g.state.world.reserve.strategy = normalizeStrategyState({
      pendingDilemma: { id: dilemma.id, tier: dilemma.tier, day: 10, actionIndex: 10, chapter: 1 }
    });
    const realRender = g.render;
    g.render = () => {};
    g.openPendingStrategicDilemma();
    g.selectStrategicDilemmaChoice(dilemma.id, "open_water");
    g.render = realRender;
  });
  const strategyEllipses = strategyChoiceAudit.texts.filter((item) => /^(长期|数值|动物) · .*…$/.test(item.text));
  if (strategyEllipses.length) {
    fail(`${viewport.name}/strategy-choice`, `selected strategy still hides core copy: ${strategyEllipses.map((item) => item.text).join(" / ")}`);
  }
  const strategyResultAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    const { normalizeStrategyState, strategicDilemmaById } = require("../js/strategySystem");
    const dilemma = strategicDilemmaById("injured_herd");
    g.state.world.reserve.strategy = normalizeStrategyState({
      pendingDilemma: { id: dilemma.id, tier: dilemma.tier, day: 10, actionIndex: 10, chapter: 1 }
    });
    const realRender = g.render;
    g.render = () => {};
    g.openPendingStrategicDilemma();
    g.selectStrategicDilemmaChoice(dilemma.id, "track_deer");
    g.confirmStrategicChoice(dilemma.id, "track_deer");
    if (g.infoDetailModal) g.infoDetailModal.revealAt = 0;
    g.render = realRender;
  });
  const resultCards = (game.infoDetailModal && game.infoDetailModal.renderedInfoItems) || [];
  if (resultCards.length < 3 || resultCards.some((item) => !item.layout || !item.layout.title || item.layout.title.truncated || (item.layout.body && item.layout.body.truncated))) {
    const detail = resultCards.map((item) => `${item.item.tag}:${item.h}:标题${item.layout && item.layout.title && item.layout.title.truncated ? "截断" : "完整"}/正文${item.layout && item.layout.body && item.layout.body.truncated ? "截断" : "完整"}`).join(" | ");
    fail(`${viewport.name}/strategy-result`, `策略结果卡仍有标题越界、正文截断或错误换行（${resultCards.length}张：${detail}）`);
  }
  const numericResultCards = resultCards.filter((item) => item.layout && item.layout.delta);
  const negativeReputation = numericResultCards.find((item) => item.item.tag === "声誉");
  const negativeRelationship = numericResultCards.find((item) => item.item.tag === "共护关系");
  const positiveMigration = numericResultCards.find((item) => item.item.tag === "迁移");
  if (numericResultCards.length < 2 || numericResultCards.some((item) => item.layout.title.size < 20)
    || !(negativeReputation || negativeRelationship)
    || (negativeReputation || negativeRelationship).layout.delta.beneficial !== false
    || !positiveMigration || positiveMigration.layout.delta.beneficial !== true) {
    fail(`${viewport.name}/strategy-result`, "数值变化没有使用大号新值或正确的红绿语义");
  }
  if (!strategyResultAudit.texts.some((item) => item.size >= 20 && /^\d+$/.test(item.text))) {
    fail(`${viewport.name}/strategy-result`, "结算页缺少可见的大号结果数字");
  }
  const strategyResultTitle = strategyResultAudit.texts
    .filter((item) => item.text === "保持距离观察")
    .sort((a, b) => b.size - a.size)[0];
  const strategyOutcomeCard = resultCards.find((item) => item.item.tag === "持续影响");
  if (!strategyResultTitle || strategyResultTitle.size < 18) {
    fail(`${viewport.name}/strategy-result`, "重大选择主标题仍因路线说明而被缩小或截断");
  }
  if (!strategyOutcomeCard || !strategyOutcomeCard.layout || !strategyOutcomeCard.layout.body
    || strategyOutcomeCard.layout.body.size < 10 || strategyOutcomeCard.layout.body.truncated
    || !/^远距跟踪 · 4次$/.test(strategyOutcomeCard.item.title)
    || !/迁徙没有中断/.test(strategyOutcomeCard.item.body)) {
    fail(`${viewport.name}/strategy-result`, "长期后果仍把叙事长句挤在标题行，或正文换行不可读");
  }
  runRenderAudit(game, viewport, "home", 0, (g) => {
    const { maybePrepareGuardianPromise } = require("../js/guardianPromises");
    g.state.world.reserve.guardianPromises = { pending: { id: "contact_boundary", chapter: 1, selectedChoiceId: "" } };
    g.state.world.reserve.progression.level = 1;
    g.state.world.reserve.progression.totalActions = 3;
    maybePrepareGuardianPromise(g.state.world.reserve, { day: 3, totalActions: 3 });
    g.infoDetailModal = null;
    const realRender = g.render;
    g.render = () => {};
    g.openPendingGuardianPromise();
    g.render = realRender;
  });
  if ((game.infoDetailModal && game.infoDetailModal.kind === "guardianPromise")
    || (game.state.world.reserve.guardianPromises || {}).pending) {
    fail(`${viewport.name}/guardian-choice`, "守护承诺不得再弹出，也不得留在待处理队列");
  }
  runRenderAudit(game, viewport, "collection", 0, (g) => {
    g.state.world.collection.legacyArchive = { count: 2, entries: { old_a: {}, old_b: {} }, history: [{ id: "old_a", name: "旧版收藏", day: 8 }] };
    g.openLegacyCollectionArchive();
  });
  const facilityBuildAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    g.state.world.collection.cases.case_1.ending = { id: "audit", name: "旧巡线真相" };
    g.state.world.reserve.facilityConstruction = { version: 1, sites: { old_patrol_post: { buildStage: 1, buildSteps: 0, specialization: null, totalInvested: 0, lastBuiltDay: 0 } } };
    g.openReserveFacilityDetail("old_patrol_post");
  });
  const buildMetrics = (game.infoDetailModal && game.infoDetailModal.renderedFacilityBuildMetrics) || [];
  if (buildMetrics.length !== 2 || !buildMetrics.some((metric) => metric.label === "基金" && /\d+→\d+/.test(metric.value))
    || !buildMetrics.some((metric) => metric.label === "本步提升") || buildMetrics.some((metric) => metric.valueSize < 12)
    || !facilityBuildAudit.texts.some((item) => /沙盘：/.test(item.text))) {
    fail(`${viewport.name}/facility-build`, "facility build step does not foreground exact fund change, improvement and visible sandbox result");
  }
  const facilityRouteAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    g.state.world.collection.cases.case_1.ending = { id: "audit", name: "旧巡线真相" };
    g.state.world.reserve.facilityConstruction.sites.old_patrol_post = { buildStage: 2, buildSteps: 2, specialization: null, totalInvested: 170, lastBuiltDay: 8 };
    g.openReserveFacilityDetail("old_patrol_post");
  });
  const initialFacilityRoutes = (game.infoDetailModal && game.infoDetailModal.renderedFacilityRouteLayout) || [];
  if (initialFacilityRoutes.length !== 3 || initialFacilityRoutes.some((entry) => entry.titleSize < 11)
    || !facilityRouteAudit.texts.some((item) => /点击查看永久效果/.test(item.text))) {
    fail(`${viewport.name}/facility-routes`, "facility specialization does not begin with three readable compact choices");
  }
  const selectedFacilityRouteAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    g.state.world.collection.cases.case_1.ending = { id: "audit", name: "旧巡线真相" };
    g.state.world.reserve.facilityConstruction.sites.old_patrol_post = { buildStage: 2, buildSteps: 2, specialization: null, totalInvested: 170, lastBuiltDay: 8 };
    g.openReserveFacilityDetail("old_patrol_post");
    g.infoDetailModal.selectedSpecializationId = "enforcement";
  });
  const selectedFacilityRoutes = (game.infoDetailModal && game.infoDetailModal.renderedFacilityRouteLayout) || [];
  const selectedRoute = selectedFacilityRoutes.find((entry) => entry.selected);
  const collapsedRoutes = selectedFacilityRoutes.filter((entry) => !entry.selected);
  const selectedRouteText = (game.infoDetailModal && game.infoDetailModal.renderedFacilityRouteText) || [];
  if (!selectedRoute || collapsedRoutes.length !== 2 || selectedRoute.h - Math.max(...collapsedRoutes.map((entry) => entry.h)) < 40
    || !selectedRouteText.length || selectedRouteText.some((entry) => !entry.layout || entry.layout.truncated)
    || !selectedFacilityRouteAudit.texts.some((item) => /\d+→\d+ · 永久生效/.test(item.text))) {
    fail(`${viewport.name}/facility-routes-selected`, "selected permanent specialization does not expand with complete note and exact fund change");
  }
  const facilityOwnedAudit = runRenderAudit(game, viewport, "home", 0, (g) => {
    g.state.world.collection.cases.case_1.ending = { id: "audit", name: "旧巡线真相" };
    g.state.world.reserve.facilityConstruction.sites.old_patrol_post = { buildStage: 3, buildSteps: 2, specialization: "enforcement", totalInvested: 260, lastBuiltDay: 8 };
    g.openReserveFacilityDetail("old_patrol_post");
  });
  if (!facilityOwnedAudit.texts.some((item) => item.text === "永久收益")
    || !facilityOwnedAudit.texts.some((item) => item.text === "路线倾向")
    || !facilityOwnedAudit.texts.some((item) => /已建成 · 沙盘/.test(item.text))
    || (game.infoDetailModal && game.infoDetailModal.renderedFacilityOwnedText && game.infoDetailModal.renderedFacilityOwnedText.truncated)) {
    fail(`${viewport.name}/facility-owned`, "completed facility does not foreground permanent benefit and visible sandbox ownership");
  }
  if (viewport.name === "small") {
    const { FACILITIES } = require("../js/reserveFacilities");
    FACILITIES.forEach((facility) => {
      (facility.routes || []).forEach((route) => {
        runRenderAudit(game, viewport, "home", 0, (g) => {
          g.infoDetailModal = {
            kind: "facilityConstruction",
            kicker: "我的保护区 · 选择专精",
            title: facility.name,
            icon: facility.icon,
            facility: Object.assign({}, facility, { buildStage: 2, buildSteps: 2, stageLabel: "已启用 · 待专精" }),
            selectedSpecializationId: route.id,
            footer: "选择一条设施路线。"
          };
        });
        const layouts = (game.infoDetailModal && game.infoDetailModal.renderedFacilityRouteLayout) || [];
        const notes = (game.infoDetailModal && game.infoDetailModal.renderedFacilityRouteText) || [];
        if (layouts.length !== 3 || !layouts.some((entry) => entry.id === route.id && entry.selected && entry.h >= 108)
          || layouts.some((entry) => entry.titleSize < 11) || notes.some((entry) => !entry.layout || entry.layout.truncated)) {
          fail(`small/facility-route/${facility.id}/${route.id}`, "one of the 18 permanent facility choices is clipped or unreadable");
        }
      });
    });
  }
  [1, 2, 3, 4, 5].forEach((level) => {
    runRenderAudit(game, viewport, "home", 0, (g) => {
      g.chapterStoryModal = g.buildChapterStory(level, "start");
    });
  });
  runRenderAudit(game, viewport, "home", 0, (g) => {
    g.chapterStoryModal = g.buildChapterStory(5, "end");
  });
});

if (failures.length) throw new Error(`screen audit failed (${failures.length}): ${failures.slice(0, 6).join(" | ")}`);
console.log("screen audit check ok");
