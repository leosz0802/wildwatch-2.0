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
  if (!canvas || canvas.__sizeLock) return false;
  canvas.__sizeLock = true;
  try {
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
  } finally {
    canvas.__sizeLock = false;
  }
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
    // Some Android WeChat builds dispatch open-data messages synchronously.
    // Keep one message in flight and collapse duplicate redraw requests so a
    // render -> postMessage -> render cycle cannot grow the native stack.
    this.openDataMessageInFlight = false;
    this.pendingOpenDataMessage = null;
    this.lastOpenDataMessageSignature = "";
    this.openDataMessageFlushScheduled = false;
    this.openDataMessageWindowStartedAt = 0;
    this.openDataMessageWindowCount = 0;
    this.androidOpenDataBridge = false;
    this.androidOpenDataQueue = [];
    this.androidOpenDataFlushScheduled = false;
    try {
      const systemInfo = typeof this.runtime.getSystemInfoSync === "function" ? this.runtime.getSystemInfoSync() || {} : {};
      const deviceInfo = typeof this.runtime.getDeviceInfo === "function" ? this.runtime.getDeviceInfo() || {} : {};
      const platform = `${systemInfo.platform || ""} ${deviceInfo.platform || ""}`;
      const system = `${systemInfo.system || ""} ${deviceInfo.system || ""}`;
      this.androidOpenDataBridge = /android/i.test(platform) &&
        !/(ohos|harmony|openharmony)/i.test(`${platform} ${system}`);
    } catch (error) {
      this.androidOpenDataBridge = false;
    }
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
      this.sendOpenDataMessage({ type: "friend_rank_hide" });
      this.surfaceMode = "";
      return true;
    } catch (error) {
      return false;
    }
  }
  isSharedCanvasOversized() {
    const canvas = this.sharedCanvas;
    if (!canvas) return false;
    return (Number(canvas.width) || 0) > 1 || (Number(canvas.height) || 0) > 1;
  }
  parkOverlay() {
    if (this.sharedCanvasBlocked) {
      this.overlayParked = true;
      return true;
    }
    // Cloud rank refresh can enlarge the shared canvas after the first park.
    // Android WeChat then leaves that native buffer on the sandbox as a
    // translucent card that swallows animal and building taps. Always shrink
    // an oversized leftover, even if the parked flag is already set.
    if (this.parking) return this.overlayParked === true;
    const now = this.now();
    if (this.overlayParked && !this.pendingResize && (now - (this.lastParkAt || 0) < 500)) return true;
    if (this.overlayParked && !this.isSharedCanvasOversized() && !this.pendingResize) return true;
    this.parking = true;
    this.parkScheduled = false;
    this.presentedThisFrame = false;
    this.pendingResize = null;
    this.pendingOpenDataPayload = null;
    const pendingType = String((this.pendingOpenDataMessage && this.pendingOpenDataMessage.payload && this.pendingOpenDataMessage.payload.type) || "");
    if (/_show$|nickname_sheet/.test(pendingType)) this.pendingOpenDataMessage = null;
    if (Array.isArray(this.androidOpenDataQueue) && this.androidOpenDataQueue.length) {
      this.androidOpenDataQueue = this.androidOpenDataQueue.filter((item) => {
        const type = String((item && item.payload && item.payload.type) || "");
        return type && !/^(friend_rank_show|world_rank_show|friend_nickname_sheet|world_avatar_show)$/.test(type);
      });
    }
    try {
      const shrunk = parkSharedCanvasOverlay(this.sharedCanvas, { shrink: true });
      this.postHideMessage();
      this.overlayParked = shrunk !== false;
      this.lastParkAt = this.now();
      this.scheduleOverlayReppark();
      return this.overlayParked;
    } catch (error) {
      this.lastError = String((error && error.message) || error || "");
      if (/Maximum call stack/i.test(this.lastError)) {
        this.sharedCanvasBlocked = true;
        this.overlayParked = true;
      }
      return false;
    } finally {
      this.parking = false;
    }
  }
  paintSharedCanvas(draw) {
    if (this.sharedCanvasBlocked || typeof draw !== "function") return false;
    try {
      draw();
      return true;
    } catch (error) {
      if (error && /Maximum call stack/i.test(String(error.message || error))) this.sharedCanvasBlocked = true;
      this.lastError = String((error && error.message) || error || "");
      return false;
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
    if (this.overlayParked && !this.presentedThisFrame) return false;
    return this.sendOpenDataMessage(payload);
  }
  clearOverlayReppark() {
    const timers = this.overlayRepparkTimers || [];
    this.overlayRepparkTimers = [];
    this.overlayRepparkAttempts = 0;
    timers.forEach((timer) => {
      if (timer && typeof clearTimeout === "function") clearTimeout(timer);
    });
  }
  scheduleOverlayReppark() {
    if (this.presentedThisFrame || this.sharedCanvasBlocked) return false;
    if (this.overlayRepparkTimers && this.overlayRepparkTimers.length) return false;
    if ((this.overlayRepparkAttempts || 0) >= 4) return false;
    this.overlayRepparkAttempts = (this.overlayRepparkAttempts || 0) + 1;
    this.overlayRepparkTimers = [];
    [80, 400].forEach((delay) => {
      const run = () => {
        this.overlayRepparkTimers = (this.overlayRepparkTimers || []).filter((timer) => timer !== handle);
        if (this.presentedThisFrame) return;
        if (this.pendingOpenDataPayload || this.isSharedCanvasOversized()) this.parkOverlay();
      };
      const handle = typeof setTimeout === "function" ? setTimeout(run, delay) : null;
      if (handle && typeof handle.unref === "function") handle.unref();
      if (handle) this.overlayRepparkTimers.push(handle);
      else run();
    });
    return true;
  }
  sendOpenDataMessage(payload, options = {}) {
    if (this.sharedCanvasBlocked) return false;
    if (!payload || !this.openDataContext || typeof this.openDataContext.postMessage !== "function") return false;
    // Changing the shared canvas, or posting while its size setter is running,
    // makes WeChat re-enter this bridge on the same stack until it overflows.
    if (this.sharedCanvas && this.sharedCanvas.__sizeLock) {
      this.pendingOpenDataMessage = { payload, options };
      this.scheduleOpenDataMessageFlush();
      return true;
    }
    const dedupe = options.dedupe !== false && payload.type !== "friend_rank_pointer";
    if (dedupe) {
      const now = Date.now();
      if (!this.openDataMessageWindowStartedAt || now - this.openDataMessageWindowStartedAt > 80) {
        this.openDataMessageWindowStartedAt = now;
        this.openDataMessageWindowCount = 0;
      }
      // A synchronous open-data bridge can bounce alternating show/hide
      // messages back into the main domain. Drop the cascade after a small
      // bounded burst; the next normal frame will publish the latest state.
      if (this.openDataMessageWindowCount >= 8) {
        this.pendingOpenDataMessage = null;
        this.openDataMessageFlushScheduled = false;
        return false;
      }
      this.openDataMessageWindowCount += 1;
    }
    let signature = "";
    if (dedupe) {
      try { signature = JSON.stringify(payload); } catch (error) { signature = String(payload.type || "message"); }
      if (signature && signature === this.lastOpenDataMessageSignature) return true;
    }
    if (this.openDataMessageInFlight) {
      this.pendingOpenDataMessage = { payload, options };
      this.scheduleOpenDataMessageFlush();
      return true;
    }
    if (signature) this.lastOpenDataMessageSignature = signature;
    if (this.androidOpenDataBridge || this.deferOpenDataBridge) {
      // Pointer move events can arrive faster than Android WeChat can flush
      // postMessage. Replaying every stale move makes the shared rank list
      // lag behind the finger and then jump after release. Keep the latest
      // move in the queue while preserving start/end and non-pointer messages.
      if (this.androidOpenDataBridge && payload.type === "friend_rank_pointer" && payload.phase === "move") {
        for (let index = this.androidOpenDataQueue.length - 1; index >= 0; index -= 1) {
          const queued = this.androidOpenDataQueue[index];
          if (!queued || !queued.payload || queued.payload.type !== "friend_rank_pointer") continue;
          if (queued.payload.phase === "move") {
            this.androidOpenDataQueue[index] = { payload, options };
            return true;
          }
          break;
        }
      }
      this.androidOpenDataQueue.push({ payload, options });
      if (this.androidOpenDataQueue.length > 32) this.androidOpenDataQueue.shift();
      this.scheduleAndroidOpenDataFlush();
      return true;
    }
    this.openDataMessageInFlight = true;
    try {
      this.openDataContext.postMessage(payload);
    } finally {
      this.openDataMessageInFlight = false;
    }
    // Never flush a reentrant message from this call frame. Android WeChat
    // may invoke the open-data handler synchronously; recursion here can grow
    // through alternating show/hide/layout messages until the native stack
    // overflows. The latest pending frame is sufficient and is flushed later.
    if (this.pendingOpenDataMessage) this.scheduleOpenDataMessageFlush();
    return true;
  }
  scheduleAndroidOpenDataFlush() {
    if (this.androidOpenDataFlushScheduled || (!this.androidOpenDataQueue.length && !this.pendingResize)) return false;
    this.androidOpenDataFlushScheduled = true;
    const flush = () => {
      this.androidOpenDataFlushScheduled = false;
      if (this.pendingResize) {
        const pending = this.pendingResize;
        this.pendingResize = null;
        this.applyResize(pending.pixelWidth, pending.pixelHeight);
      }
      const next = this.androidOpenDataQueue.shift();
      if (!next || !this.openDataContext || typeof this.openDataContext.postMessage !== "function") {
        if (this.androidOpenDataQueue.length || this.pendingResize) this.scheduleAndroidOpenDataFlush();
        return;
      }
      this.openDataMessageInFlight = true;
      try {
        this.openDataContext.postMessage(next.payload);
      } catch (error) {
        this.lastError = String((error && error.message) || error || "");
      } finally {
        this.openDataMessageInFlight = false;
      }
      if (this.pendingOpenDataMessage) this.scheduleOpenDataMessageFlush();
      if (this.androidOpenDataQueue.length) this.scheduleAndroidOpenDataFlush();
    };
    if (typeof setTimeout === "function") setTimeout(flush, 0);
    else if (typeof Promise === "function") Promise.resolve().then(flush);
    else flush();
    return true;
  }
  scheduleOpenDataMessageFlush() {
    if (this.openDataMessageFlushScheduled || !this.pendingOpenDataMessage) return false;
    this.openDataMessageFlushScheduled = true;
    const flush = () => {
      this.openDataMessageFlushScheduled = false;
      const pending = this.pendingOpenDataMessage;
      this.pendingOpenDataMessage = null;
      if (!pending) return;
      this.sendOpenDataMessage(pending.payload, pending.options);
    };
    if (typeof setTimeout === "function") setTimeout(flush, 0);
    else if (typeof Promise === "function") Promise.resolve().then(flush);
    else flush();
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
    return this.sendOpenDataMessage(payload);
  }
  resize(width, height) {
    if (!this.sharedCanvas) return;
    if (this.overlayParked && !this.presentedThisFrame) {
      this.pendingResize = null;
      return;
    }
    const pixelWidth = Math.max(1, Math.round(width * this.dpr));
    const pixelHeight = Math.max(1, Math.round(height * this.dpr));
    if (this.deferOpenDataBridge) {
      this.pendingResize = { pixelWidth, pixelHeight };
      this.scheduleAndroidOpenDataFlush();
      return;
    }
    this.applyResize(pixelWidth, pixelHeight);
  }
  applyResize(pixelWidth, pixelHeight) {
    if (this.overlayParked && !this.presentedThisFrame) {
      this.pendingResize = null;
      return;
    }
    const canvas = this.sharedCanvas;
    if (!canvas || canvas.__sizeLock) return;
    canvas.__sizeLock = true;
    try {
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    } catch (error) {
      this.lastError = "";
    } finally {
      canvas.__sizeLock = false;
    }
    parkSharedCanvasOverlay(canvas, { shrink: false });
  }
  contractFriendSignature() {
    const rows = (Array.isArray(this.contractFriendRows) ? this.contractFriendRows : []).map((row) => {
      const friendMatchKey = /^[a-f0-9]{64}$/.test(String(row && row.friendMatchKey || "")) ? String(row.friendMatchKey) : "";
      if (!friendMatchKey) return null;
      return {
        friendMatchKey,
        id: String(row.worldPlayerId || row.id || "").replace(/^cloud_/, "").slice(0, 32),
        valuation: Math.max(0, Math.round(Number(row && row.valuation != null ? row.valuation : row.rating) || 0)),
        level: Math.max(1, Math.min(7, Math.round(Number(row && row.level) || 1))),
        animals: Math.max(0, Math.round(Number(row && row.animals) || 0)),
        title: String(row && (row.name || row.owner) || "微信好友").slice(0, 40)
      };
    }).filter(Boolean).slice(0, 100);
    return JSON.stringify(rows);
  }
  refresh(width, height, options = {}) {
    if (!this.openDataContext || typeof this.openDataContext.postMessage !== "function") return false;
    this.clearOverlayReppark();
    this.overlayParked = false;
    const w = Math.max(1, Math.round(width || 300));
    const h = Math.max(1, Math.round(height || 260));
    this.surfaceMode = "rank";
    this.lastLayoutSignature = `${w}x${h}@${this.dpr}`;
    this.lastWorldRowsSignature = JSON.stringify(this.worldLeaderboardRows || []);
    this.lastContractSignature = this.contractFriendSignature();
    this.resize(w, h);
    const payload = {
      type: "friend_rank_show",
      width: w,
      height: h,
      pixelRatio: this.dpr,
      key: FRIEND_RANK_KEY,
      scoreKey: FRIEND_SCORE_KEY,
      worldRowsJson: this.lastWorldRowsSignature,
      contractFriendsJson: this.lastContractSignature
    };
    if (options.reload === true) payload.reload = true;
    return this.postRankMessage(payload);
  }
  setWorldLeaderboardRows(rows = []) {
    this.worldLeaderboardRows = Array.isArray(rows) ? rows : [];
    if (this.overlayParked && !this.presentedThisFrame) {
      this.pendingResize = null;
      return false;
    }
    if (this.surfaceMode !== "rank" || !this.lastLayoutSignature) return false;
    const parts = /^(\d+)x(\d+)@/.exec(this.lastLayoutSignature || "");
    return this.refresh(parts ? Number(parts[1]) : 300, parts ? Number(parts[2]) : 260);
  }
  pointer(phase, x, y) {
    if (!this.openDataContext || typeof this.openDataContext.postMessage !== "function") return false;
    // Android WeChat can synchronously re-enter the game while forwarding
    // open-data touch events. sendOpenDataMessage queues this bridge on the
    // next task, so ranking taps remain usable without re-entering the native
    // postMessage call frame.
    const pointerPhase = ["start", "move", "end", "cancel"].includes(phase) ? phase : "cancel";
    return this.sendOpenDataMessage({
      type: "friend_rank_pointer",
      phase: pointerPhase,
      x: Math.round(Number(x) || 0),
      y: Math.round(Number(y) || 0)
    }, { dedupe: false });
  }
  draw(ctx, x, y, width, height) {
    if (this.sharedCanvasBlocked || !ctx || !this.sharedCanvas) return false;
    this.presentedThisFrame = true;
    this.clearOverlayReppark();
    this.overlayParked = false;
    const layoutSignature = `${Math.round(width)}x${Math.round(height)}@${this.dpr}`;
    const worldRowsJson = JSON.stringify(this.worldLeaderboardRows || []);
    const contractSignature = this.contractFriendSignature();
    if (this.surfaceMode !== "rank" || layoutSignature !== this.lastLayoutSignature || worldRowsJson !== this.lastWorldRowsSignature || contractSignature !== this.lastContractSignature) {
      this.refresh(width, height);
    }
    if (this.pendingResize || this.surfaceMode !== "rank") return false;
    return this.paintSharedCanvas(() => ctx.drawImage(this.sharedCanvas, x, y, width, height));
  }
  drawWorldRows(ctx, x, y, width, height, rows, titleSize = 0, rowHeight = 44) {
    if (this.sharedCanvasBlocked || !ctx || !this.sharedCanvas || !this.openDataContext) return false;
    this.presentedThisFrame = true;
    this.clearOverlayReppark();
    this.overlayParked = false;
    const payload = rows.map(row => {
      const worldPlayerId = String(row.worldPlayerId || row.publicId || row.id || "").replace(/^cloud_/, "");
      return {
        id: row.id, publicId: worldPlayerId, worldPlayerId, friendMatchKey: row.friendMatchKey || "",
        title: row.name, valuation: row.valuation, rank: row.rank,
        level: row.level, animals: row.animals, profileComplete: row.profileComplete,
        friend: row.friend === true, mine: !!row.mine, avatarUrl: row.avatarUrl || ""
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
    return this.paintSharedCanvas(() => ctx.drawImage(this.sharedCanvas, x, y, width, height));
  }
  drawFriendNicknames(ctx, plates = []) {
    if (this.sharedCanvasBlocked || !ctx || !this.sharedCanvas || !this.openDataContext || !plates.length) return false;
    this.presentedThisFrame = true;
    this.clearOverlayReppark();
    this.overlayParked = false;
    const nameH = 18;
    const fontSize = 13;
    const avatarSize = Math.max(0, ...plates.map((plate) => Math.round(Number(plate.avatarSize) || 0)));
    const rowH = Math.max(nameH, avatarSize || nameH);
    const nameW = Math.max(48, ...plates.map((plate) => Math.round(Number(plate.w) || 0)));
    const avatarGutter = avatarSize > 0 ? avatarSize + 6 : 0;
    const width = Math.max(48, avatarGutter + nameW);
    const height = rowH * Math.min(12, plates.length);
    const payload = plates.slice(0, 12).map((plate) => ({
      worldPlayerId: String(plate.worldPlayerId || "").replace(/^cloud_/, "").slice(0, 32),
      friendMatchKey: /^[a-f0-9]{64}$/.test(String(plate.friendMatchKey || "")) ? String(plate.friendMatchKey) : "",
      fallback: String(plate.fallback || "微信好友").slice(0, 16),
      w: Math.max(24, Math.round(Number(plate.w) || nameW)),
      align: plate.align === "center" ? "center" : "left",
      avatarSize: Math.max(0, Math.round(Number(plate.avatarSize) || 0))
    }));
    const signature = `${width}x${height}@${this.dpr}|${fontSize}|${JSON.stringify(payload)}`;
    if (this.surfaceMode !== "nicknames" || this.lastNicknameSignature !== signature) {
      this.surfaceMode = "nicknames";
      this.lastNicknameSignature = signature;
      this.resize(width, height);
      this.postRankMessage({
        type: "friend_nickname_sheet",
        width,
        height,
        rowHeight: rowH,
        fontSize,
        pixelRatio: this.dpr,
        rowsJson: JSON.stringify(payload),
        key: FRIEND_RANK_KEY,
        scoreKey: FRIEND_SCORE_KEY
      });
    }
    payload.forEach((plate, index) => {
      const target = plates[index];
      if (!target) return;
      const destW = Math.max(24, Number(target.w) || plate.w || nameW);
      this.paintSharedCanvas(() => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(target.x, target.y, destW, nameH);
        ctx.clip();
        ctx.drawImage(this.sharedCanvas, target.x - avatarGutter, target.y - index * rowH, width, height);
        ctx.restore();
      });
      const destAvatar = Math.max(0, Math.round(Number(target.avatarSize) || plate.avatarSize || 0));
      if (destAvatar >= 16 && Number.isFinite(Number(target.avatarX)) && Number.isFinite(Number(target.avatarY))) {
        this.paintSharedCanvas(() => {
          ctx.save();
          ctx.beginPath();
          ctx.rect(target.avatarX, target.avatarY, destAvatar, destAvatar);
          ctx.clip();
          ctx.drawImage(this.sharedCanvas, target.avatarX, target.avatarY - index * rowH, width, height);
          ctx.restore();
        });
      }
    });
    return true;
  }
  drawWorldAvatar(ctx, x, y, size, row = {}) {
    if (this.sharedCanvasBlocked || !ctx || !this.sharedCanvas || !this.openDataContext) return false;
    this.presentedThisFrame = true;
    this.clearOverlayReppark();
    this.overlayParked = false;
    const worldPlayerId = String(row.worldPlayerId || row.publicId || row.id || "").replace(/^cloud_/, "");
    const payload = {
      id: row.id,
      publicId: worldPlayerId,
      worldPlayerId,
      friendMatchKey: row.friendMatchKey || "",
      title: row.name || row.title || "远方保护区",
      owner: row.owner || row.ownerName || "",
      reserveName: row.reserveName || "保护区",
      avatarUrl: row.avatarUrl || ""
    };
    const safeSize = Math.max(32, Math.round(Number(size) || 48));
    const signature = `${safeSize}@${this.dpr}|${JSON.stringify(payload)}`;
    if (this.surfaceMode !== "avatar" || this.lastAvatarSignature !== signature) {
      this.surfaceMode = "avatar";
      this.lastAvatarSignature = signature;
      this.resize(safeSize, safeSize);
      this.postRankMessage({
        type: "world_avatar_show",
        width: safeSize,
        height: safeSize,
        pixelRatio: this.dpr,
        rowJson: JSON.stringify(payload),
        key: FRIEND_RANK_KEY,
        scoreKey: FRIEND_SCORE_KEY
      });
    }
    const painted = this.paintSharedCanvas(() => ctx.drawImage(this.sharedCanvas, x, y, safeSize, safeSize));
    return painted ? { source: "wechat-open-data", x, y, size: safeSize } : false;
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
