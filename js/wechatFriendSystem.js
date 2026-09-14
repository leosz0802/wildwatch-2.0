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
    this.cloudSyncCheckIntervalMs = Math.max(250, Number(options.cloudSyncCheckIntervalMs) || 1000);
    this.now = typeof options.now === "function" ? options.now : () => Date.now();
    this.lastLayoutSignature = "";
    this.surfaceMode = "";
    this.lastSelfAvatarSignature = "";
    this.subscriptionStatus = "unknown";
    this.subscriptionResults = {};
    this.openDataContext = null;
    this.sharedCanvas = null;
    if (typeof this.runtime.getOpenDataContext !== "function") return;
    try {
      this.openDataContext = this.runtime.getOpenDataContext();
      this.sharedCanvas = this.openDataContext && this.openDataContext.canvas;
      // 好友榜只在开放数据域读取托管数据，不请求另一套同玩互动好友
      // 资料及其解密链路，避免给排行榜增加不必要的授权门槛。
      this.status = this.openDataContext ? "ready" : "unsupported";
      this.readSystemMessageSubscriptions();
    } catch (error) {
      this.lastError = String((error && error.errMsg) || (error && error.message) || error || "");
    }
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
    if (!force && this.lastCloudSyncCheckAt && now - this.lastCloudSyncCheckAt < this.cloudSyncCheckIntervalMs) return false;
    this.lastCloudSyncCheckAt = now;
    const record = buildFriendRankRecord(reserve, valuation);
    const signature = JSON.stringify(Object.assign({}, record, { updatedAt: 0 }));
    if (signature === this.lastCloudSignature) return false;
    this.lastCloudSignature = signature;
    this.cloudUploadStatus = "uploading";
    this.cloudUploadError = "";
    const value = JSON.stringify(record);
    const scoreValue = JSON.stringify({ wxgame: { score: record.valuation, update_time: Math.floor(record.updatedAt / 1000) } });
    this.runtime.setUserCloudStorage({
      KVDataList: [{ key: FRIEND_SCORE_KEY, value: scoreValue }, { key: FRIEND_RANK_KEY, value }],
      success: () => {
        this.cloudUploadStatus = "ready";
        this.notify();
      },
      fail: (error) => {
        this.lastCloudSignature = "";
        this.cloudUploadStatus = "error";
        this.cloudUploadError = String((error && error.errMsg) || "排行数据上传失败");
        this.notify();
      }
    });
    return true;
  }

  resize(width, height) {
    if (!this.sharedCanvas) return;
    const pixelWidth = Math.max(1, Math.round(width * this.dpr));
    const pixelHeight = Math.max(1, Math.round(height * this.dpr));
    if (this.sharedCanvas.width !== pixelWidth) this.sharedCanvas.width = pixelWidth;
    if (this.sharedCanvas.height !== pixelHeight) this.sharedCanvas.height = pixelHeight;
  }

  refresh(width, height) {
    if (!this.openDataContext || typeof this.openDataContext.postMessage !== "function") return false;
    const w = Math.max(1, Math.round(width || 300));
    const h = Math.max(1, Math.round(height || 260));
    this.surfaceMode = "rank";
    this.lastSelfAvatarSignature = "";
    // Explicit refreshes must become the controller's real layout state. Without
    // this, a fixed-size refresh can leave a short shared canvas stretched into
    // the previous tall viewport until the next unrelated resize.
    this.lastLayoutSignature = `${w}x${h}@${this.dpr}`;
    this.resize(w, h);
    this.openDataContext.postMessage({
      type: "friend_rank_show",
      width: w,
      height: h,
      pixelRatio: this.dpr,
      key: FRIEND_RANK_KEY,
      scoreKey: FRIEND_SCORE_KEY
    });
    return true;
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
    if (this.surfaceMode !== "rank" || layoutSignature !== this.lastLayoutSignature) {
      this.lastLayoutSignature = layoutSignature;
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

  drawSelfAvatar(ctx, x, y, size, reserve = {}, valuation) {
    if (!ctx || !this.sharedCanvas || !this.openDataContext || typeof this.openDataContext.postMessage !== "function") return false;
    const avatarSize = Math.max(1, Math.round(Number(size) || 40));
    const record = buildFriendRankRecord(reserve, valuation);
    const signature = `${avatarSize}@${this.dpr}|${record.name}|${record.valuation}|${record.level}|${record.animals}`;
    if (this.surfaceMode !== "self-avatar" || signature !== this.lastSelfAvatarSignature) {
      this.surfaceMode = "self-avatar";
      this.lastSelfAvatarSignature = signature;
      // Force the normal friend list to restore itself when the user switches
      // back from the compact self-avatar surface.
      this.lastLayoutSignature = "";
      this.resize(avatarSize, avatarSize);
      this.openDataContext.postMessage({
        type: "friend_self_avatar_show",
        width: avatarSize,
        height: avatarSize,
        pixelRatio: this.dpr,
        key: FRIEND_RANK_KEY,
        scoreKey: FRIEND_SCORE_KEY,
        reserveName: record.name,
        valuation: record.valuation,
        level: record.level,
        animals: record.animals
      });
    }
    try {
      ctx.drawImage(this.sharedCanvas, x, y, avatarSize, avatarSize);
      return true;
    } catch (error) {
      this.lastError = String((error && error.message) || error || "");
      return false;
    }
  }
}

module.exports = {
  FRIEND_RANK_KEY,
  FRIEND_SCORE_KEY,
  SYSTEM_MESSAGE_INTERACTIVE,
  SYSTEM_MESSAGE_RANK,
  SYSTEM_MESSAGE_TYPES,
  buildFriendRankRecord,
  WechatFriendController
};
