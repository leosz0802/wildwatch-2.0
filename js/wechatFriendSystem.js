const { reserveAnimalTotal } = require("./cloudService");
const { calculateReserveValuation } = require("./reserveValuation");

const FRIEND_RANK_KEY = "wild_guardian_rank_v1";
const FRIEND_SCORE_KEY = "wild_guardian_score_v1";
const SYSTEM_MESSAGE_INTERACTIVE = "SYS_MSG_TYPE_INTERACTIVE";
const SYSTEM_MESSAGE_RANK = "SYS_MSG_TYPE_RANK";
const SYSTEM_MESSAGE_TYPES = Object.freeze([SYSTEM_MESSAGE_INTERACTIVE, SYSTEM_MESSAGE_RANK]);

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value) || 0)));
}

function buildFriendRankRecord(reserve = {}, valuation) {
  const base = reserve.base || {};
  const progression = reserve.progression || {};
  const level = clampInt(progression.level || 1, 1, 7);
  const animals = clampInt(reserveAnimalTotal(reserve), 0, 99999);
  const marketValue = calculateReserveValuation(level, animals);
  return {
    v: 2,
    name: String(base.name || "未命名保护区").slice(0, 18),
    valuation: marketValue,
    rating: marketValue,
    level,
    animals,
    updatedAt: Date.now()
  };
}

function parkSharedCanvasOverlay(canvas, options = {}) {
  if (!canvas) return false;
  // 微信只要 game.json 写了 openDataContext，启动就会把开放域 canvas
  // 做成顶层原生层。默认经常是全屏，安卓上即使完全透明也会吞掉
  // 「进入游戏」。主域只通过 drawImage 合成，原生层必须一直藏在屏外。
  if (options.shrink !== false) {
    try {
      if (canvas.width !== 1) canvas.width = 1;
      if (canvas.height !== 1) canvas.height = 1;
    } catch (error) {}
  }
  try {
    if (canvas.style) {
      canvas.style.left = "-9999px";
      canvas.style.top = "-9999px";
      canvas.style.width = "1px";
      canvas.style.height = "1px";
    }
  } catch (error) {}
  return true;
}

function parkOpenDataOverlay(runtime, options = {}) {
  if (!runtime || typeof runtime.getOpenDataContext !== "function") return null;
  try {
    const context = runtime.getOpenDataContext();
    parkSharedCanvasOverlay(context && context.canvas, options);
    return context;
  } catch (error) {
    return null;
  }
}

class WechatFriendController {
  constructor(runtime, options = {}) {
    this.runtime = runtime || {};
    this.onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    this.dpr = Math.max(1, Number(options.dpr) || 1);
    this.status = "unsupported";
    this.lastError = "";
    this.lastCloudSignature = "";
    this.lastCloudSyncCheckAt = 0;
    this.cloudUploadStatus = "idle";
    this.cloudUploadError = "";
    this.lastCloudErrorAt = 0;
    this.cloudSyncCheckIntervalMs = Math.max(250, Number(options.cloudSyncCheckIntervalMs) || 1000);
    this.cloudErrorBackoffMs = Math.max(1000, Number(options.cloudErrorBackoffMs) || 3000);
    this.now = typeof options.now === "function" ? options.now : () => Date.now();
    this.lastLayoutSignature = "";
    this.surfaceMode = "";
    this.subscriptionStatus = "unknown";
    this.subscriptionResults = {};
    this.openDataContext = null;
    this.sharedCanvas = null;
    this.pendingOpenDataPayload = null;
    this.uploadStartedAt = 0;
    this.friendMatchKey = "";
    if (typeof this.runtime.getOpenDataContext !== "function") return;
    try {
      this.openDataContext = this.runtime.getOpenDataContext();
      this.sharedCanvas = this.openDataContext && this.openDataContext.canvas;
      this.status = this.openDataContext ? "ready" : "unsupported";
      this.parkOverlay();
      this.readSystemMessageSubscriptions();
    } catch (error) {
      this.lastError = String((error && error.errMsg) || (error && error.message) || error || "");
    }
  }

  postHideMessage() {
    if (!this.openDataContext || typeof this.openDataContext.postMessage !== "function") return false;
    try {
      this.openDataContext.postMessage({ type: "friend_rank_hide" });
      this.surfaceMode = "";
      return true;
    } catch (error) {
      return false;
    }
  }

  parkOverlay() {
    this.postHideMessage();
    return parkSharedCanvasOverlay(this.sharedCanvas, { shrink: true });
  }

  isSystemMessageSupported() {
    return typeof this.runtime.requestSubscribeSystemMessage === "function";
  }

  readSystemMessageSubscriptions() {
    if (typeof this.runtime.getSetting !== "function") return;
    this.runtime.getSetting({
      withSubscriptions: true,
      success: (result) => {
        const subscriptions = result.subscriptionsSetting || {};
        const settings = subscriptions.itemSettings || subscriptions;
        const values = SYSTEM_MESSAGE_TYPES.map((type) => settings[type]).filter(Boolean);
        if (values.length) {
          SYSTEM_MESSAGE_TYPES.forEach((type) => {
            if (settings[type]) this.subscriptionResults[type] = settings[type];
          });
          this.subscriptionStatus = values.every((value) => value === "accept") ? "accepted" : values.some((value) => value === "accept") ? "partial" : "rejected";
          this.notify();
        }
      },
      fail: () => {}
    });
  }

  requestSystemMessageSubscriptions() {
    if (!this.isSystemMessageSupported()) {
      this.subscriptionStatus = "unsupported";
      this.notify();
      return Promise.resolve({ supported: false, accepted: 0 });
    }
    this.subscriptionStatus = "requesting";
    this.notify();
    return new Promise((resolve) => {
      this.runtime.requestSubscribeSystemMessage({
        msgTypeList: SYSTEM_MESSAGE_TYPES.slice(),
        success: (result = {}) => {
          SYSTEM_MESSAGE_TYPES.forEach((type) => {
            this.subscriptionResults[type] = result[type] || "unknown";
          });
          const accepted = SYSTEM_MESSAGE_TYPES.filter((type) => this.subscriptionResults[type] === "accept").length;
          this.subscriptionStatus = accepted === SYSTEM_MESSAGE_TYPES.length ? "accepted" : accepted > 0 ? "partial" : "rejected";
          this.notify();
          resolve({ supported: true, accepted, results: Object.assign({}, this.subscriptionResults) });
        },
        fail: (error) => {
          this.lastError = String((error && error.errMsg) || "订阅未完成");
          this.subscriptionStatus = "failed";
          this.notify();
          resolve({ supported: true, accepted: 0, error: this.lastError });
        }
      });
    });
  }

  isSupported() {
    return !!this.openDataContext;
  }

  notify() {
    try { this.onChange(this.status); } catch (error) { /* UI callback must not break authorization */ }
  }

  syncReserve(reserve = {}, force = false, valuation) {
    if (typeof this.runtime.setUserCloudStorage !== "function") return false;
    const now = this.now();
    if (this.cloudUploadStatus === "uploading") return false;
    if (this.cloudUploadStatus === "error" && this.lastCloudErrorAt && now - this.lastCloudErrorAt < this.cloudErrorBackoffMs) return false;
    if (!force && this.lastCloudSyncCheckAt && now - this.lastCloudSyncCheckAt < this.cloudSyncCheckIntervalMs) return false;
    this.lastCloudSyncCheckAt = now;
    const record = buildFriendRankRecord(reserve, valuation);
    if (this.worldPlayerId) record.worldPlayerId = String(this.worldPlayerId).slice(0, 32);
    if (/^[a-f0-9]{64}$/.test(this.friendMatchKey || "")) record.friendMatchKey = this.friendMatchKey;
    const signature = JSON.stringify(Object.assign({}, record, { updatedAt: 0 }));
    if (signature === this.lastCloudSignature) return false;
    this.lastCloudSignature = signature;
    this.cloudUploadStatus = "uploading";
    this.uploadStartedAt = now;
    this.cloudUploadError = "";
    const score = Math.max(0, Math.round(Number(record.valuation) || 0));
    this.runtime.setUserCloudStorage({
      KVDataList: [
        { key: FRIEND_SCORE_KEY, value: JSON.stringify({ wxgame: { score, update_time: Math.floor(record.updatedAt / 1000) } }) },
        { key: FRIEND_RANK_KEY, value: JSON.stringify(record) }
      ],
      success: () => {
        this.cloudUploadStatus = "ready";
        this.cloudUploadError = "";
        this.flushPendingOpenData();
        this.notify();
      },
      fail: (error) => {
        this.lastCloudSignature = "";
        this.lastCloudErrorAt = this.now();
        this.cloudUploadStatus = "error";
        this.cloudUploadError = String((error && error.errMsg) || "排行数据上传失败");
        this.flushPendingOpenData();
        this.notify();
      }
    });
    return true;
  }

  flushPendingOpenData() {
    const payload = this.pendingOpenDataPayload;
    if (!payload || !this.openDataContext || typeof this.openDataContext.postMessage !== "function") return false;
    this.pendingOpenDataPayload = null;
    this.openDataContext.postMessage(payload);
    return true;
  }

  postRankMessage(payload) {
    if (!this.openDataContext || typeof this.openDataContext.postMessage !== "function") return false;
    const uploading = this.cloudUploadStatus === "uploading";
    const waitedTooLong = this.uploadStartedAt && this.now() - this.uploadStartedAt > 2500;
    if (uploading && !waitedTooLong) {
      this.pendingOpenDataPayload = payload;
      return true;
    }
    this.pendingOpenDataPayload = null;
    this.openDataContext.postMessage(payload);
    return true;
  }

  resize(width, height) {
    if (!this.sharedCanvas) return;
    const pixelWidth = Math.max(1, Math.round(width * this.dpr));
    const pixelHeight = Math.max(1, Math.round(height * this.dpr));
    try {
      if (this.sharedCanvas.width !== pixelWidth) this.sharedCanvas.width = pixelWidth;
      if (this.sharedCanvas.height !== pixelHeight) this.sharedCanvas.height = pixelHeight;
    } catch (error) {
      this.lastError = "";
    }
    parkSharedCanvasOverlay(this.sharedCanvas, { shrink: false });
  }

  refresh(width, height, options = {}) {
    if (!this.openDataContext || typeof this.openDataContext.postMessage !== "function") return false;
    const w = Math.max(1, Math.round(width || 300));
    const h = Math.max(1, Math.round(height || 260));
    this.surfaceMode = "rank";
    this.lastLayoutSignature = `${w}x${h}@${this.dpr}`;
    this.lastWorldRowsSignature = JSON.stringify(this.worldLeaderboardRows || []);
    this.resize(w, h);
    const payload = {
      type: "friend_rank_show",
      width: w,
      height: h,
      pixelRatio: this.dpr,
      key: FRIEND_RANK_KEY,
      scoreKey: FRIEND_SCORE_KEY,
      worldRowsJson: this.lastWorldRowsSignature
    };
    if (options.reload === true) payload.reload = true;
    return this.postRankMessage(payload);
  }

  setWorldLeaderboardRows(rows = []) {
    this.worldLeaderboardRows = Array.isArray(rows) ? rows : [];
    if (this.surfaceMode !== "rank" || !this.lastLayoutSignature) return false;
    const parts = /^(\d+)x(\d+)@/.exec(this.lastLayoutSignature || "");
    return this.refresh(parts ? Number(parts[1]) : 300, parts ? Number(parts[2]) : 260);
  }

  pointer(phase, x, y) {
    if (!this.openDataContext || typeof this.openDataContext.postMessage !== "function") return false;
    const pointerPhase = ["start", "move", "end", "cancel"].includes(phase) ? phase : "cancel";
    this.openDataContext.postMessage({
      type: "friend_rank_pointer",
      phase: pointerPhase,
      x: Math.round(Number(x) || 0),
      y: Math.round(Number(y) || 0)
    });
    return true;
  }

  draw(ctx, x, y, width, height) {
    if (!ctx || !this.sharedCanvas) return false;
    const layoutSignature = `${Math.round(width)}x${Math.round(height)}@${this.dpr}`;
    const worldRowsJson = JSON.stringify(this.worldLeaderboardRows || []);
    if (this.surfaceMode !== "rank" || layoutSignature !== this.lastLayoutSignature || worldRowsJson !== this.lastWorldRowsSignature) {
      this.refresh(width, height);
    }
    try {
      ctx.drawImage(this.sharedCanvas, x, y, width, height);
      return true;
    } catch (error) {
      this.lastError = String((error && error.message) || error || "");
      return false;
    }
  }

  drawWorldRows(ctx, x, y, width, height, rows, titleSize = 0, rowHeight = 44) {
    if (!ctx || !this.sharedCanvas || !this.openDataContext) return false;
    const payload = rows.map(row => {
      const worldPlayerId = String(row.worldPlayerId || row.publicId || row.id || "").replace(/^cloud_/, "");
      return {
        id: row.id, publicId: worldPlayerId, worldPlayerId, friendMatchKey: row.friendMatchKey || "",
        title: row.name, valuation: row.valuation, rank: row.rank,
        level: row.level, animals: row.animals, profileComplete: row.profileComplete, mine: !!row.mine
      };
    });
    const rowsJson = JSON.stringify(payload);
    const safeRowHeight = Math.max(36, Math.round(Number(rowHeight) || 44));
    const signature = `${width}x${height}@${this.dpr}|${titleSize}|${safeRowHeight}|${rowsJson}`;
    if (this.surfaceMode !== "world" || this.lastWorldSignature !== signature) {
      this.surfaceMode = "world";
      this.lastWorldSignature = signature;
      this.resize(width, height);
      this.postRankMessage({ type: "world_rank_show", width, height,
        pixelRatio: this.dpr, rowsJson, titleSize, rowHeight: safeRowHeight, key: FRIEND_RANK_KEY, scoreKey: FRIEND_SCORE_KEY });
    }
    try { ctx.drawImage(this.sharedCanvas, x, y, width, height); return true; }
    catch (error) { return false; }
  }


}

module.exports = {
  FRIEND_RANK_KEY,
  FRIEND_SCORE_KEY,
  SYSTEM_MESSAGE_INTERACTIVE,
  SYSTEM_MESSAGE_RANK,
  SYSTEM_MESSAGE_TYPES,
  buildFriendRankRecord,
  parkSharedCanvasOverlay,
  parkOpenDataOverlay,
  WechatFriendController
};
