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
  error: "",
  scrollY: 0,
  selectedIndex: -1,
  view: "list",
  surface: "rank",
  selfAvatar: null,
  selfTarget: null,
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

function text(value, x, y, size, color, align, weight) {
  if (!ctx) return;
  setFont(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align || "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(value), x, y);
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

function findSelfAvatarRow(rows, target = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const reserveName = normalizeReserveName(target.reserveName || target.name);
  const valuation = Math.max(0, Math.round(Number(target.valuation || target.rating) || 0));
  const level = Math.max(1, Math.round(Number(target.level) || 1));
  const animals = Math.max(0, Math.round(Number(target.animals) || 0));
  const sameReserve = list.filter((row) => normalizeReserveName(row.reserveName) === reserveName);
  const exact = sameReserve.find((row) => row.valuation === valuation);
  if (exact) return exact;
  if (sameReserve.length === 1) return sameReserve[0];
  const sameProfile = list.filter((row) => row.valuation === valuation && row.level === level && row.animals === animals);
  return sameProfile.length === 1 ? sameProfile[0] : null;
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
  text("微信好友保护区详情", state.width / 2, 139, 9, "#6b746f", "center", 400);
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
  text("资料仅在微信开放数据域内展示", state.width / 2, Math.min(state.height - 12, 220), 9, "#7a847e", "center", 400);
}

function drawSelfAvatarSurface() {
  if (state.phase !== "ready" || !state.selfAvatar) return;
  const size = Math.max(1, Math.min(state.width, state.height));
  drawAvatar(state.selfAvatar, (state.width - size) / 2, (state.height - size) / 2, size);
}

function render() {
  if (!ctx || !sharedCanvas) return;
  const dpr = Math.max(1, state.pixelRatio || 1);
  const pw = Math.max(1, Math.round(state.width * dpr));
  const ph = Math.max(1, Math.round(state.height * dpr));
  const resized = sharedCanvas.width !== pw || sharedCanvas.height !== ph;
  if (sharedCanvas.width !== pw) sharedCanvas.width = pw;
  if (sharedCanvas.height !== ph) sharedCanvas.height = ph;
  if (ctx.setTransform) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  else if (ctx.resetTransform) {
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
  } else {
    // Legacy open-data canvases may not expose setTransform/resetTransform.
    // Reassigning the physical size resets an accumulated scale before redraw.
    if (!resized) {
      sharedCanvas.width = pw;
      sharedCanvas.height = ph;
    }
    ctx.scale(dpr, dpr);
  }
  ctx.clearRect(0, 0, state.width, state.height);
  if (state.surface === "self-avatar") {
    drawSelfAvatarSurface();
    return;
  }
  roundRect(0.5, 0.5, state.width - 1, state.height - 1, 14, "#fffefa", "rgba(60,60,67,.16)");

  if (state.phase === "loading") {
    text("正在读取好友保护区…", state.width / 2, state.height / 2, 12, "#6b746f", "center", 600);
    return;
  }
  if (state.phase === "error") {
    text("好友榜暂时无法读取", state.width / 2, state.height / 2 - 8, 13, "#1f2d27", "center", 700);
    text("可返回主界面重新刷新", state.width / 2, state.height / 2 + 16, 10, "#6b746f", "center", 400);
    return;
  }
  if (!state.rows.length) { drawEmpty(); return; }
  if (state.view === "detail") drawDetail();
  else drawList();
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

function requestFriendRank() {
  if (typeof wx.getFriendCloudStorage !== "function") {
    state.phase = "error";
    state.error = "unsupported";
    render();
    return;
  }
  state.phase = "loading";
  state.surface = "rank";
  state.selfAvatar = null;
  render();
  wx.getFriendCloudStorage({
    keyList: [state.scoreKey, state.key],
    success(result) {
      state.rows = (result.data || []).map(parseRow).filter(Boolean).sort((a, b) => b.valuation - a.valuation);
      state.phase = "ready";
      state.scrollY = 0;
      state.selectedIndex = -1;
      state.view = "list";
      render();
    },
    fail(error) {
      state.error = String((error && error.errMsg) || "load failed");
      state.phase = "error";
      render();
    }
  });
}

function requestSelfAvatar() {
  if (typeof wx.getFriendCloudStorage !== "function") {
    state.phase = "error";
    state.selfAvatar = null;
    render();
    return;
  }
  state.phase = "loading";
  state.selfAvatar = null;
  render();
  wx.getFriendCloudStorage({
    keyList: [state.scoreKey, state.key],
    success(result) {
      state.rows = (result.data || []).map(parseRow).filter(Boolean);
      state.selfAvatar = findSelfAvatarRow(state.rows, state.selfTarget || {});
      state.phase = "ready";
      render();
    },
    fail(error) {
      state.error = String((error && error.errMsg) || "load failed");
      state.selfAvatar = null;
      state.phase = "error";
      render();
    }
  });
}

if (typeof wx !== "undefined" && wx.onMessage) {
  wx.onMessage((message) => {
    if (!message) return;
    if (message.type === "friend_rank_pointer") {
      handlePointer(message);
      return;
    }
    if (message.type === "friend_self_avatar_show") {
      state.surface = "self-avatar";
      state.width = Math.max(1, Number(message.width) || 40);
      state.height = Math.max(1, Number(message.height) || 40);
      state.pixelRatio = Math.max(1, Number(message.pixelRatio) || 1);
      state.key = String(message.key || state.key);
      state.scoreKey = String(message.scoreKey || state.scoreKey);
      state.selfTarget = {
        reserveName: String(message.reserveName || "保护区"),
        valuation: Math.max(0, Math.round(Number(message.valuation) || 0)),
        level: Math.max(1, Math.round(Number(message.level) || 1)),
        animals: Math.max(0, Math.round(Number(message.animals) || 0))
      };
      requestSelfAvatar();
      return;
    }
    if (message.type !== "friend_rank_show") return;
    state.surface = "rank";
    state.width = Math.max(240, Number(message.width) || state.width);
    state.height = Math.max(180, Number(message.height) || state.height);
    state.pixelRatio = Math.max(1, Number(message.pixelRatio) || 1);
    state.key = String(message.key || state.key);
    state.scoreKey = String(message.scoreKey || state.scoreKey);
    requestFriendRank();
  });
}

if (typeof module !== "undefined") {
  module.exports = { normalizeReserveName, friendTitle, rankLayout, rowIndexAt, findSelfAvatarRow };
}

render();
