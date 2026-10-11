const { friendMatchKey, matchWorldFriend } = require("./worldIdentity");
const sharedCanvas = typeof wx !== "undefined" && wx.getSharedCanvas ? wx.getSharedCanvas() : null;
const ctx = sharedCanvas && sharedCanvas.getContext("2d");
const avatars = {};
const state = {
  width: 320,
  height: 260,
  pixelRatio: 1,
  key: "wild_guardian_rank_v1",
  scoreKey: "wild_guardian_score_v1",
  phase: "idle",
  rows: [],
  friendSourceRows: [],
  error: "",
  scrollY: 0,
  selectedIndex: -1,
  view: "list",
  surface: "idle",
  worldRows: [],
  worldLeaderboardRows: [],
  contractFriendOrder: [],
  avatarRow: null,
  requestId: 0,
  friendLoading: false,
  pendingFriendReload: false,
  touch: null
};

const LIST_TOP = 38;
const LIST_BOTTOM_GAP = 3;
const ROW_HEIGHT = 48;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeReserveName(value) {
  const raw = String(value || "保护区").trim().replace(/保护区$/, "").trim();
  return raw || "保护区";
}

function friendTitle(nickname, reserveName) {
  return `${String(nickname || "微信好友").trim() || "微信好友"}的${normalizeReserveName(reserveName)}`;
}

function rankLayout(height, rowCount, scrollY) {
  const bottom = Math.max(LIST_TOP + 1, (Number(height) || 0) - LIST_BOTTOM_GAP);
  const viewportHeight = Math.max(1, bottom - LIST_TOP);
  const contentHeight = Math.max(0, Math.round(Number(rowCount) || 0)) * ROW_HEIGHT;
  const maxScroll = Math.max(0, contentHeight - viewportHeight);
  return {
    top: LIST_TOP,
    bottom,
    rowHeight: ROW_HEIGHT,
    viewportHeight,
    contentHeight,
    maxScroll,
    scrollY: clamp(scrollY, 0, maxScroll)
  };
}

function rowIndexAt(localY, layout, rowCount) {
  if (!layout || localY < layout.top || localY >= layout.bottom) return -1;
  const index = Math.floor((localY - layout.top + layout.scrollY) / layout.rowHeight);
  return index >= 0 && index < rowCount ? index : -1;
}

function roundRect(x, y, w, h, r, fill, stroke) {
  if (!ctx) return;
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

function setFont(size, weight) {
  if (!ctx) return;
  ctx.font = `${weight || 400} ${size}px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
}

function normalizeDisplayNumericText(value) {
  return String(value == null ? "" : value).replace(/\d+\.\d+/g, (raw) => {
    const rounded = Math.round((Number(raw) + Number.EPSILON) * 10) / 10;
    return String(Object.is(rounded, -0) ? 0 : rounded);
  });
}

function text(value, x, y, size, color, align, weight) {
  if (!ctx) return;
  setFont(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(normalizeDisplayNumericText(value), x, y);
}

function fitText(value, maxWidth, size, weight) {
  const raw = String(value || "");
  if (!ctx || maxWidth <= 0) return "";
  setFont(size, weight);
  if (ctx.measureText(raw).width <= maxWidth) return raw;
  const ellipsis = "…";
  let low = 0;
  let high = raw.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (ctx.measureText(raw.slice(0, middle) + ellipsis).width <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return `${raw.slice(0, low)}${ellipsis}`;
}

function runningInDevtools() {
  try {
    return typeof wx !== "undefined" && wx.getSystemInfoSync && wx.getSystemInfoSync().platform === "devtools";
  } catch (error) {
    return false;
  }
}

function worldAsFriendRow(world, index) {
  const title = String(world.title || world.name || "远方保护区").slice(0, 40);
  const owner = String(world.owner || world.ownerName || "").slice(0, 20);
  return {
    nickname: owner || title.replace(/的.*$/, "") || `远方玩家${index + 1}`,
    friendMatchKey: String(world.friendMatchKey || ""),
    worldPlayerId: String(world.worldPlayerId || world.publicId || world.id || "").replace(/^cloud_/, "").slice(0, 32),
    avatarUrl: "",
    reserveName: String(world.reserveName || "保护区").slice(0, 24),
    title,
    valuation: Math.max(0, Math.round(Number(world.valuation || world.rating) || 0)),
    rating: Math.max(0, Math.round(Number(world.valuation || world.rating) || 0)),
    level: Math.max(1, Math.min(7, Math.round(Number(world.level) || 1))),
    animals: Math.max(0, Math.round(Number(world.animals) || 0)),
    updatedAt: 0,
    fromWorld: true
  };
}

function decorateFriendRows(sourceRows) {
  const rows = (sourceRows || []).slice();
  if (!runningInDevtools() || rows.length > 1 || !state.worldLeaderboardRows.length) return rows;
  const seen = new Set(rows.map((row) => String(row.worldPlayerId || row.title || "")));
  state.worldLeaderboardRows.forEach((world, index) => {
    const extra = worldAsFriendRow(world, index);
    const key = extra.worldPlayerId || extra.title;
    if (!key || seen.has(key) || extra.valuation <= 0) return;
    if (rows.some((row) => row.title === extra.title)) return;
    seen.add(key);
    rows.push(extra);
  });
  return rows;
}

function parseRow(user) {
  const item = (user.KVDataList || []).find((entry) => entry.key === state.key);
  const scoreItem = (user.KVDataList || []).find((entry) => entry.key === state.scoreKey);
  if ((!item || !item.value) && (!scoreItem || !scoreItem.value)) return null;
  let record = {};
  let standardScore = 0;
  try {
    if (item && item.value) record = JSON.parse(item.value) || {};
  } catch (error) { record = {}; }
  try {
    standardScore = Math.max(0, Math.round(Number((JSON.parse((scoreItem || {}).value || "{}").wxgame || {}).score) || 0));
  } catch (error) { standardScore = 0; }
  const detailedScore = Math.max(0, Math.round(Number(record.valuation || record.rating) || 0));
  if (!standardScore && !detailedScore) return null;
  const nickname = String(user.nickname || "微信好友").slice(0, 20);
  const reserveName = String(record.name || "保护区").slice(0, 24);
  const valuation = standardScore || detailedScore;
  return {
    nickname,
    friendMatchKey: /^[a-f0-9]{64}$/.test(String(record.friendMatchKey || ""))
      ? String(record.friendMatchKey)
      : friendMatchKey(user.openid || user.openId || user.OpenId),
    worldPlayerId: String(record.worldPlayerId || ""),
    avatarUrl: user.avatarUrl || "",
    reserveName,
    title: friendTitle(nickname, reserveName),
    valuation,
    rating: valuation,
    level: Math.max(1, Math.min(7, Math.round(Number(record.level) || 1))),
    animals: Math.max(0, Math.round(Number(record.animals) || 0)),
    updatedAt: Math.max(0, Number(record.updatedAt) || 0)
  };
}

function loadAvatar(url) {
  if (!url || avatars[url] || typeof wx.createImage !== "function") return;
  const image = wx.createImage();
  avatars[url] = { image, ready: false };
  image.onload = () => { avatars[url].ready = true; render(); };
  image.onerror = () => { avatars[url].failed = true; };
  image.src = url;
}

function drawAvatar(row, x, y, size) {
  const cached = avatars[row.avatarUrl];
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#dce9df";
  ctx.fillRect(x, y, size, size);
  if (cached && cached.ready) ctx.drawImage(cached.image, x, y, size, size);
  else text((row.nickname || "友").slice(0, 1), x + size / 2, y + size * 0.69, size * 0.48, "#2f7d62", "center", 700);
  ctx.restore();
  ctx.strokeStyle = "rgba(47,125,98,.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.stroke();
  loadAvatar(row.avatarUrl);
}

function drawEmpty() {
  const symbolY = Math.max(52, state.height * 0.36);
  ctx.fillStyle = "#e6f1e8";
  ctx.beginPath(); ctx.arc(state.width / 2 - 14, symbolY, 18, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(state.width / 2 + 14, symbolY, 18, 0, Math.PI * 2); ctx.fill();
  text("好友榜还没有记录", state.width / 2, symbolY + 48, 15, "#1f2d27", "center", 700);
  text("邀请好友进入游戏后，排名会自动出现", state.width / 2, symbolY + 69, 10, "#6b746f", "center", 400);
}

function drawList() {
  const layout = rankLayout(state.height, state.rows.length, state.scrollY);
  state.scrollY = layout.scrollY;
  text("好友保护区市值榜", 14, 25, 13, "#1f2d27", "left", 700);
  text(layout.maxScroll > 0 ? "上下滑动 · 点好友" : "点好友看详情", state.width - 14, 25, 9, "#2f7d62", "right", 600);
  ctx.fillStyle = "rgba(60,60,67,.12)";
  ctx.fillRect(14, 35, state.width - 28, 1);

  ctx.save();
  ctx.beginPath();
  ctx.rect(1, layout.top, state.width - 2, layout.viewportHeight);
  ctx.clip();
  const first = Math.max(0, Math.floor(layout.scrollY / layout.rowHeight));
  const last = Math.min(state.rows.length - 1, Math.ceil((layout.scrollY + layout.viewportHeight) / layout.rowHeight));
  for (let index = first; index <= last; index += 1) {
    const row = state.rows[index];
    const y = layout.top + index * layout.rowHeight - layout.scrollY;
    if (index > 0) {
      ctx.fillStyle = "rgba(60,60,67,.10)";
      ctx.fillRect(54, y, state.width - 68, 1);
    }
    text(index + 1, 18, y + 29, index < 3 ? 14 : 11, index < 3 ? "#c08a27" : "#6b746f", "center", 700);
    drawAvatar(row, 30, y + 8, 32);
    const scoreReserve = 68;
    const titleWidth = Math.max(48, state.width - 70 - scoreReserve);
    text(fitText(row.title, titleWidth, 10.5, 700), 70, y + 20, 10.5, "#1f2d27", "left", 700);
    text(`等级${row.level} · ${row.animals}只动物`, 70, y + 37, 9, "#6b746f", "left", 400);
    text(row.valuation, state.width - 16, y + 22, 14, "#2f7d62", "right", 700);
    text("市值  ›", state.width - 16, y + 38, 8, "#7a847e", "right", 600);
  }
  ctx.restore();

  if (layout.maxScroll > 0) {
    const trackH = Math.max(28, layout.viewportHeight - 12);
    const thumbH = Math.max(22, trackH * (layout.viewportHeight / Math.max(layout.viewportHeight, layout.contentHeight)));
    const thumbY = layout.top + 6 + (trackH - thumbH) * (layout.scrollY / layout.maxScroll);
    roundRect(state.width - 5, layout.top + 6, 2, trackH, 1, "rgba(47,125,98,.10)");
    roundRect(state.width - 6, thumbY, 4, thumbH, 2, "rgba(47,125,98,.42)");
  }
}

function worldMatchFriends() {
  if (state.friendSourceRows.length) return state.friendSourceRows;
  return (state.rows || []).filter((row) => row && row.fromWorld !== true);
}

function drawWorldRows() {
  const friends = worldMatchFriends();
  if (state.worldTitleSize) {
    const world = state.worldRows[0] || {};
    const friend = matchWorldFriend(world, friends);
    text(fitText(friend ? friend.title : world.title, state.width, state.worldTitleSize, 700), 0, state.worldTitleSize, state.worldTitleSize, "#fff9e9", "left", 700);
    return;
  }
  const rowH = Math.max(36, Number(state.worldRowHeight) || 44);
  roundRect(.5, .5, state.width - 1, state.height - 1, 14, "#fffefa", "rgba(60,60,67,.16)");
  state.worldRows.forEach((world, index) => {
    const row = matchWorldFriend(world, friends) || worldAsFriendRow(world, index);
    const y = index * rowH;
    if (index) { ctx.fillStyle = "rgba(60,60,67,.10)"; ctx.fillRect(48, y, state.width - 62, 1); }
    text(world.rank, 16, y + rowH * 0.62, world.rank <= 3 ? 13 : 11, world.rank <= 3 ? "#c08a27" : "#6b746f", "center", 700);
    const avatarSize = Math.min(28, Math.max(24, rowH - 12));
    drawAvatar(row || { nickname: world.title || "玩", avatarUrl: "" }, 34, y + (rowH - avatarSize) / 2, avatarSize);
    text(fitText(row ? row.title : world.title, state.width - 140, 11, 700), 68, y + rowH * 0.38, 11, "#1f2d27", "left", 700);
    const detail = world.profileComplete === false ? "动物数据待同步" : `等级${world.level || 1} · ${world.animals || 0}只动物`;
    text(fitText(detail, state.width - 140, 9, 400), 68, y + rowH * 0.76, 9, "#6b746f", "left", 400);
    text(world.valuation, state.width - 14, y + rowH * 0.40, 15, "#2f7d62", "right", 700);
    text(row && !world.mine ? "微信好友 ›" : "市值 ›", state.width - 14, y + rowH * 0.76, 8, "#7a847e", "right", 600);
  });
}

function drawNicknameSheet() {
  const rows = Array.isArray(state.nicknameRows) ? state.nicknameRows : [];
  const rowH = Math.max(16, Number(state.nicknameRowHeight) || 18);
  const fontSize = Math.max(11, Math.min(13, Number(state.nicknameFontSize) || 13));
  const nameH = 18;
  rows.forEach((row, index) => {
    const friend = matchWorldFriend(row || {}, state.friendSourceRows);
    const nickname = String(friend && friend.nickname || "").trim();
    const codedName = /[·・•‧.\-—_][0-9A-Fa-f]{4}/.test(nickname)
      || /^(晨岚|远川|林迹|白石|溪望|松影|霜原|雨岸|青屿|星渡|云岭|河声)[0-9A-Fa-f]{4}$/.test(nickname);
    const usableNick = nickname && !codedName && nickname !== "微信好友" && nickname !== "我";
    const fallback = String(row && row.fallback || "").trim();
    const usableFallback = fallback && !/[·・•‧.\-—_][0-9A-Fa-f]{4}/.test(fallback) ? fallback : "微信好友";
    const label = String(usableNick ? nickname : usableFallback).slice(0, 20);
    const y = index * rowH;
    const avatarSize = Math.max(0, Math.min(rowH, Number(row && row.avatarSize) || 0));
    const nameX = avatarSize > 0 ? avatarSize + 6 : 0;
    const rowWidth = Math.max(24, Math.min(Math.max(0, state.width - nameX), Number(row && row.w) || state.width));
    const align = row && row.align === "center" ? "center" : "left";
    if (avatarSize >= 16) {
      drawAvatar(friend || { nickname: label, avatarUrl: "" }, 0, y, avatarSize);
    }
    ctx.fillStyle = "#fffefa";
    ctx.fillRect(nameX, y, rowWidth, nameH);
    text(fitText(label, rowWidth - 8, fontSize, 700), align === "center" ? nameX + rowWidth / 2 : nameX + 2, y + nameH - 4, fontSize, "#1c3325", align, 700);
  });
}

function drawWorldAvatar() {
  const world = state.avatarRow || {};
  const row = matchWorldFriend(world, state.friendSourceRows) || worldAsFriendRow(world, 0);
  drawAvatar(row, 0, 0, Math.min(state.width, state.height));
}

function detailContractButtonBounds() {
  const h = 32;
  const w = Math.min(state.width - 28, 220);
  return {
    x: (state.width - w) / 2,
    y: Math.max(198, state.height - h - 10),
    w,
    h
  };
}

function drawDetail() {
  const row = state.rows[state.selectedIndex];
  if (!row) {
    state.view = "list";
    state.selectedIndex = -1;
    drawList();
    return;
  }
  roundRect(10, 7, 82, 26, 13, "#e6f2dc", "rgba(47,125,98,.25)");
  text("‹ 返回好友榜", 51, 25, 10, "#1f6f54", "center", 700);
  text(`#${state.selectedIndex + 1}`, state.width - 14, 25, 12, state.selectedIndex < 3 ? "#c08a27" : "#6b746f", "right", 700);
  drawAvatar(row, state.width / 2 - 29, 42, 58);
  text(fitText(row.title, state.width - 28, 14, 700), state.width / 2, 121, 14, "#1f2d27", "center", 700);
  const world = state.worldLeaderboardRows.find(entry => matchWorldFriend(entry, [row]));
  const worldStatus = world ? `世界第${world.rank}名 · 市值${world.valuation}` : "世界排名待同步，或暂未进入前100名";
  text(worldStatus, state.width / 2, 139, 9, "#6b746f", "center", 400);
  const gap = 7;
  const cardW = (state.width - 28 - gap * 2) / 3;
  [
    { label: "市值", value: row.valuation },
    { label: "等级", value: `等级${row.level}` },
    { label: "动物", value: `${row.animals}只` }
  ].forEach((item, index) => {
    const x = 14 + index * (cardW + gap);
    roundRect(x, 151, cardW, 43, 10, index === 0 ? "#e6f2dc" : "#f5f1e5", "rgba(47,125,98,.16)");
    text(item.label, x + cardW / 2, 167, 8, "#6b746f", "center", 600);
    text(item.value, x + cardW / 2, 187, 14, index === 0 ? "#2f7d62" : "#1f2d27", "center", 700);
  });
  const contractButton = detailContractButtonBounds();
  const compact = state.height < 270;
  if (!compact) {
    text("资料仅在微信开放数据域内展示", state.width / 2, Math.min(contractButton.y - 14, 220), 9, "#7a847e", "center", 400);
  }
  roundRect(contractButton.x, contractButton.y, contractButton.w, contractButton.h, 12, "#1c5f46", "rgba(47,125,98,.22)");
  text("发起好友合同", state.width / 2, contractButton.y + 21, 11, "#fffaf0", "center", 700);
  state.detailContractButton = contractButton;
}

function applyCanvasTransform() {
  const scale = Math.max(1, Number(state.pixelRatio) || 1);
  const scaleX = scale;
  const scaleY = scale;
  if (ctx.setTransform) {
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    return () => {};
  }
  if (ctx.resetTransform) {
    ctx.resetTransform();
    ctx.scale(scaleX, scaleY);
    return () => {};
  }
  if (ctx.save && ctx.restore) {
    ctx.save();
    ctx.scale(scaleX, scaleY);
    return () => ctx.restore();
  }
  ctx.scale(scaleX, scaleY);
  return () => {};
}

function hideSurface() {
  if (state.hiding) return;
  state.hiding = true;
  try {
    state.surface = "idle";
    state.phase = "idle";
    state.view = "list";
    state.rows = [];
    state.worldRows = [];
    state.pendingFriendReload = false;
    if (!ctx || !sharedCanvas) return;
    try { ctx.setTransform(1, 0, 0, 1, 0, 0); } catch (error) {}
    try { ctx.globalAlpha = 1; } catch (error) {}
    try { ctx.clearRect(0, 0, 4096, 4096); } catch (error) {}
  } finally {
    state.hiding = false;
  }
}

function render() {
  if (!ctx || !sharedCanvas) return;
  if (state.rendering) {
    state.renderQueued = true;
    return;
  }
  if (state.surface === "idle") return;
  state.rendering = true;
  state.renderQueued = false;
  const restore = applyCanvasTransform();
  try {
    ctx.clearRect(0, 0, state.width, state.height);
    if (state.surface === "world") {
      drawWorldRows();
    } else if (state.surface === "avatar") {
      drawWorldAvatar();
    } else if (state.surface === "nicknames") {
      drawNicknameSheet();
    } else {
      roundRect(0.5, 0.5, state.width - 1, state.height - 1, 14, "#fffefa", "rgba(60,60,67,.16)");
      if (state.phase === "loading") {
        text("正在读取好友保护区…", state.width / 2, state.height / 2, 12, "#6b746f", "center", 600);
      } else if (state.phase === "error") {
        text("好友榜暂时无法读取", state.width / 2, state.height / 2 - 8, 13, "#1f2d27", "center", 700);
        text("可返回主界面重新刷新", state.width / 2, state.height / 2 + 16, 10, "#6b746f", "center", 400);
      } else if (!state.rows.length) {
        drawEmpty();
      } else if (state.view === "detail") {
        drawDetail();
      } else {
        drawList();
      }
    }
  } finally {
    restore();
    state.rendering = false;
    if (state.renderQueued) {
      state.renderQueued = false;
      render();
    }
  }
}

function handlePointer(message) {
  if (state.surface !== "rank") return;
  const phase = String(message.phase || "");
  const x = Number(message.x) || 0;
  const y = Number(message.y) || 0;
  if (phase === "start") {
    state.touch = { startX: x, startY: y, lastY: y, startScroll: state.scrollY, moved: false };
    return;
  }
  if (!state.touch) return;
  if (phase === "move") {
    const delta = state.touch.startY - y;
    if (Math.abs(delta) > 5) state.touch.moved = true;
    state.touch.lastY = y;
    if (state.view === "list") {
      const layout = rankLayout(state.height, state.rows.length, state.touch.startScroll + delta);
      state.scrollY = layout.scrollY;
      render();
    }
    return;
  }
  if (phase === "cancel") {
    state.touch = null;
    return;
  }
  if (phase !== "end") return;
  const touch = state.touch;
  state.touch = null;
  if (touch.moved) { render(); return; }
  if (state.view === "detail") {
    if (y <= 42) {
      state.view = "list";
      state.selectedIndex = -1;
      render();
    } else {
      const button = state.detailContractButton || detailContractButtonBounds();
      if (x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h) {
        // The shared canvas is input-transparent to the main game. The main
        // domain mirrors this detail state and handles the contract action so
        // the open-data domain remains one-way and Android-safe.
      }
    }
    return;
  }
  const layout = rankLayout(state.height, state.rows.length, state.scrollY);
  const index = rowIndexAt(y, layout, state.rows.length);
  if (index >= 0) {
    state.selectedIndex = index;
    state.view = "detail";
    render();
  }
}

function applyFriendRows(data) {
  const rows = (data || []).map((user) => {
    try { return parseRow(user); } catch (error) { return null; }
  }).filter(Boolean);
  // An empty hosted read, or a self-only fallback after hide/resize, must
  // not wipe friends already loaded. iPhone WeChat often fails
  // getFriendCloudStorage when the shared canvas is parked to 1px.
  if (!rows.length && state.friendSourceRows.length) {
    publishFriendRows(state.surface === "rank");
    return;
  }
  if (rows.length === 1 && String(rows[0].nickname || "") === "我"
    && state.friendSourceRows.some((row) => row && row.nickname && row.nickname !== "我")) {
    publishFriendRows(state.surface === "rank");
    return;
  }
  state.friendSourceRows = rows;
  publishFriendRows(true);
}

function contractPlaceholder(item) {
  const title = String(item && item.title || "微信好友").slice(0, 40);
  const nickname = title.includes("的") ? title.slice(0, title.indexOf("的")) : title;
  const valuation = Math.max(0, Math.round(Number(item && item.valuation) || 0));
  return {
    nickname: nickname || "微信好友",
    friendMatchKey: String(item && item.friendMatchKey || ""),
    worldPlayerId: String(item && item.id || "").replace(/^cloud_/, "").slice(0, 32),
    avatarUrl: "",
    reserveName: "保护区",
    title: title || "微信好友",
    valuation,
    rating: valuation,
    level: Math.max(1, Math.min(7, Math.round(Number(item && item.level) || 1))),
    animals: Math.max(0, Math.round(Number(item && item.animals) || 0)),
    updatedAt: 0,
    contractPlaceholder: true
  };
}

function contractOrderedRows(sourceRows) {
  const order = (Array.isArray(state.contractFriendOrder) ? state.contractFriendOrder : [])
    .filter((item) => item && /^[a-f0-9]{64}$/.test(String(item.friendMatchKey || "")));
  if (!order.length) {
    const rows = decorateFriendRows(sourceRows);
    rows.sort((a, b) => b.valuation - a.valuation);
    return rows;
  }
  // The main domain can only start a contract by list position. Show the
  // server friend order exactly, including a placeholder when WeChat storage
  // has not arrived yet, so the tapped row is the same person.
  const byKey = new Map();
  (sourceRows || []).forEach((row) => {
    if (!row || row.fromWorld === true) return;
    const key = String(row.friendMatchKey || "");
    if (key && !byKey.has(key)) byKey.set(key, row);
  });
  const ordered = order.map((item) => byKey.get(String(item.friendMatchKey)) || contractPlaceholder(item));
  const orderedKeys = new Set(order.map((item) => String(item.friendMatchKey)));
  // Contract ordering only covers friends with a stable match key. Keep all
  // remaining real friends in the ranking after that ordered prefix instead
  // of dropping them from the visible WeChat friend list.
  const remainder = (sourceRows || [])
    .filter((row) => row && !orderedKeys.has(String(row.friendMatchKey || "")))
    .slice()
    .sort((a, b) => (Number(b.valuation) || 0) - (Number(a.valuation) || 0));
  return ordered.concat(remainder);
}

function publishFriendRows(resetView = false) {
  const rows = state.surface === "rank"
    ? contractOrderedRows(state.friendSourceRows)
    : decorateFriendRows(state.friendSourceRows);
  if (state.surface === "rank") {
    state.phase = "ready";
    if (resetView) {
      state.scrollY = 0;
      state.selectedIndex = -1;
      state.view = "list";
    }
  }
  state.rows = rows;
  render();
}

function showFriendRankError(error) {
  if (state.rows.length) {
    if (state.surface === "rank") state.phase = "ready";
    render();
    return;
  }
  if (state.surface !== "rank") return;
  state.error = String((error && error.errMsg) || error || "load failed");
  state.phase = "error";
  render();
}

function finishFriendRankFailure(requestId, error) {
  if (requestId !== state.requestId) return;
  if (state.pendingFriendReload) {
    state.pendingFriendReload = false;
    if (state.surface !== "idle") {
      requestFriendRank({ force: true });
      return;
    }
  }
  if (state.surface === "idle") return;
  if (state.friendSourceRows.length) {
    publishFriendRows(state.surface === "rank");
    return;
  }
  if (state.surface === "world") {
    render();
    return;
  }
  if (state.worldLeaderboardRows.length) {
    publishFriendRows(false);
    return;
  }
  showFriendRankError(error);
}

function applySelfCloudStorage(requestId, profile, kvList) {
  if (requestId !== state.requestId) return;
  const user = Object.assign({
    nickname: "我",
    avatarUrl: "",
    openid: ""
  }, profile || {}, {
    KVDataList: kvList || []
  });
  applyFriendRows([user]);
}

function requestSelfRankFallback(requestId, error) {
  if (state.surface === "idle" || state.friendSourceRows.some((row) => row && row.nickname && row.nickname !== "我")) {
    finishFriendRankFailure(requestId, error);
    return;
  }
  const failOut = () => finishFriendRankFailure(requestId, error);
  const withProfile = (profile) => {
    if (typeof wx.getUserCloudStorage !== "function") {
      if (profile && (profile.nickname || profile.avatarUrl)) applySelfCloudStorage(requestId, profile, []);
      else failOut();
      return;
    }
    wx.getUserCloudStorage({
      keyList: [state.scoreKey, state.key],
      success(result) {
        applySelfCloudStorage(requestId, profile, result.KVDataList || []);
      },
      fail: failOut
    });
  };
  if (typeof wx.getUserInfo !== "function") {
    withProfile(null);
    return;
  }
  wx.getUserInfo({
    openIdList: ["selfOpenId"],
    success(result) {
      const profile = Array.isArray(result.data) ? result.data[0] : null;
      withProfile(profile);
    },
    fail: () => withProfile(null)
  });
}

function requestFriendRank(options = {}) {
  const force = options.force === true;
  const attempt = Math.max(0, Math.round(Number(options.attempt) || 0));
  if (typeof wx.getFriendCloudStorage !== "function") {
    requestSelfRankFallback(++state.requestId, "unsupported");
    return;
  }
  if (state.friendLoading) {
    if (force) state.pendingFriendReload = true;
    if (state.surface === "rank" && state.phase !== "ready" && !state.rows.length) state.phase = "loading";
    render();
    return;
  }
  const worldNeedsIdentity = state.surface === "world"
    && !state.friendSourceRows.some((row) => row && (row.friendMatchKey || row.worldPlayerId));
  if (state.rows.length && !force && !worldNeedsIdentity) {
    state.requestId += 1;
    if (state.surface === "rank") publishFriendRows();
    else render();
    return;
  }
  const requestId = ++state.requestId;
  state.friendLoading = true;
  if (state.surface === "rank" && !state.rows.length) {
    state.phase = "loading";
    render();
  }
  wx.getFriendCloudStorage({
    keyList: [state.scoreKey, state.key],
    success(result) {
      if (requestId !== state.requestId) return;
      state.friendLoading = false;
      const incoming = result.data || [];
      if (!incoming.length && state.friendSourceRows.length && state.surface !== "rank") { render(); return; }
      applyFriendRows(incoming);
      if (state.pendingFriendReload) {
        state.pendingFriendReload = false;
        requestFriendRank({ force: true });
      }
    },
    fail(error) {
      if (requestId !== state.requestId) return;
      state.friendLoading = false;
      if (attempt < 3 && state.surface !== "idle") {
        const retry = () => requestFriendRank({ force: true, attempt: attempt + 1 });
        if (typeof setTimeout === "function") setTimeout(retry, 360 * (attempt + 1));
        else retry();
        return;
      }
      requestSelfRankFallback(requestId, error);
    }
  });
}

if (typeof wx !== "undefined" && wx.onMessage) {
  let handlingOpenDataMessage = false;
  let queuedOpenDataMessage = null;
  const handleOpenDataMessage = (message) => {
    if (!message) return;
    if (message.type === "world_rank_show") {
      const needsFriendIdentity = !state.friendSourceRows.length
        || !state.friendSourceRows.some((row) => row && (row.friendMatchKey || row.worldPlayerId));
      state.worldTitleSize = Number(message.titleSize) || 0;
      state.worldRowHeight = Math.max(36, Number(message.rowHeight) || 44);
      state.surface = "world";
      state.width = Math.max(1, Number(message.width) || 320);
      state.height = Math.max(1, Number(message.height) || 640);
      state.pixelRatio = Math.max(1, Number(message.pixelRatio) || 1);
      if (message.key) state.key = String(message.key);
      if (message.scoreKey) state.scoreKey = String(message.scoreKey);
      try { state.worldRows = JSON.parse(message.rowsJson || "[]").slice(0, 10); }
      catch (error) { state.worldRows = []; }
      render();
      if (needsFriendIdentity) requestFriendRank();
      else {
        state.requestId += 1;
        state.friendLoading = false;
      }
      return;
    }
    if (message.type === "friend_rank_pointer") {
      handlePointer(message);
      return;
    }
    if (message.type === "friend_nickname_sheet") {
      state.surface = "nicknames";
      state.width = Math.max(48, Number(message.width) || 180);
      state.height = Math.max(18, Number(message.height) || 28);
      state.pixelRatio = Math.max(1, Number(message.pixelRatio) || 1);
      state.nicknameRowHeight = Math.max(16, Number(message.rowHeight) || 18);
      state.nicknameFontSize = Math.max(11, Math.min(13, Number(message.fontSize) || 13));
      if (message.key) state.key = String(message.key);
      if (message.scoreKey) state.scoreKey = String(message.scoreKey);
      try { state.nicknameRows = JSON.parse(message.rowsJson || "[]").slice(0, 12); }
      catch (error) { state.nicknameRows = []; }
      render();
      if (!state.friendSourceRows.length) requestFriendRank({ force: false });
      return;
    }
    if (message.type === "world_avatar_show") {
      state.surface = "avatar";
      state.width = Math.max(32, Number(message.width) || 48);
      state.height = Math.max(32, Number(message.height) || 48);
      state.pixelRatio = Math.max(1, Number(message.pixelRatio) || 1);
      if (message.key) state.key = String(message.key);
      if (message.scoreKey) state.scoreKey = String(message.scoreKey);
      try { state.avatarRow = JSON.parse(message.rowJson || "{}") || {}; }
      catch (error) { state.avatarRow = {}; }
      render();
      if (!state.friendSourceRows.length) requestFriendRank({ force: false });
      return;
    }
    if (message.type === "friend_rank_hide") {
      queuedOpenDataMessage = null;
      hideSurface();
      return;
    }
    if (message.type !== "friend_rank_show") return;
    try { state.worldLeaderboardRows = JSON.parse(message.worldRowsJson || "[]"); }
    catch (error) { state.worldLeaderboardRows = []; }
    let orderChanged = false;
    if (typeof message.contractFriendsJson === "string") {
      let nextOrder = [];
      try { nextOrder = JSON.parse(message.contractFriendsJson || "[]"); }
      catch (error) { nextOrder = []; }
      if (!Array.isArray(nextOrder)) nextOrder = [];
      nextOrder = nextOrder
        .filter((item) => item && /^[a-f0-9]{64}$/.test(String(item.friendMatchKey || "")))
        .slice(0, 100);
      const previousOrder = JSON.stringify(state.contractFriendOrder || []);
      orderChanged = previousOrder !== JSON.stringify(nextOrder);
      state.contractFriendOrder = nextOrder;
    }
    state.surface = "rank";
    state.width = Math.max(240, Number(message.width) || state.width);
    state.height = Math.max(180, Number(message.height) || state.height);
    state.pixelRatio = Math.max(1, Number(message.pixelRatio) || 1);
    state.key = String(message.key || state.key);
    state.scoreKey = String(message.scoreKey || state.scoreKey);
    if (state.friendSourceRows.length && message.reload !== true) publishFriendRows(orderChanged);
    else requestFriendRank({ force: message.reload === true });
  };
  wx.onMessage((message) => {
    if (!message) return;
    if (handlingOpenDataMessage) {
      queuedOpenDataMessage = message;
      return;
    }
    handlingOpenDataMessage = true;
    try {
      handleOpenDataMessage(message);
    } finally {
      handlingOpenDataMessage = false;
    }
    const queued = queuedOpenDataMessage;
    queuedOpenDataMessage = null;
    if (queued && typeof setTimeout === "function") setTimeout(() => handleOpenDataMessage(queued), 0);
  });
}

if (typeof module !== "undefined") {
  module.exports = { normalizeReserveName, friendTitle, rankLayout, rowIndexAt, detailContractButtonBounds };
}
