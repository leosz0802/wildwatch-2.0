const { recordFundChange } = require("./fundLedger");

const INTERSTITIAL_AD_CONFIG = Object.freeze({
  placement: "lucky",
  adUnitId: "adunit-00c6bce833409f4f",
  firstGuardianDay: 1,
  // 插屏以有效行动结算为节奏，避免只依赖“守护夜”导致几乎没有曝光。
  // 125 秒 + 3 次有效行动的双重频控：任务弹窗刚关闭后不会很快再次打断，
  // 同时保留足够的正常曝光机会。
  guardianDayCooldown: 0,
  timeCooldownMs: 125 * 1000,
  minActionCount: 2,
  minActionGap: 3,
  dailyCap: 8,
  storageKey: "wild_reserve_interstitial_ad_v1"
});

const NATIVE_TEMPLATE_AD_CONFIG = Object.freeze({
  placement: "lucky2",
  adUnitId: "adunit-9f2f2442a85b3c2a",
  // Keep a real canvas rail on both sides of the native overlay. WeChat's
  // custom-ad layer owns its own gestures, so a near-full-width ad makes page
  // scrolling feel broken even when the canvas scroll handler is correct.
  maxWidth: 320,
  sideInset: 24,
  bottomInset: 70,
  estimatedHeight: 112,
  retryDelayMs: 30 * 1000
});

const REWARDED_SUPPLY_AD_CONFIG = Object.freeze({
  placement: "material_relief",
  adUnitId: "adunit-f552fdacc287baec",
  // 新玩家最容易在第一轮补给中耗尽物资；此时入口必须可用，
  // 不能先展示一个看似失效的广告位再要求等到第二天。
  firstGuardianDay: 1,
  safeCaps: Object.freeze({ dogFood: 4, alarm: 2, tranquilizer: 2, fieldKit: 2, medicalKit: 2 }),
  grants: Object.freeze({ dogFood: 2, alarm: 1, tranquilizer: 1, fieldKit: 1, medicalKit: 1 })
});

const REWARDED_FUND_AD_CONFIG = Object.freeze({
  placement: "fund_relief",
  // 与应急物资共用已经开通的激励视频广告位，避免重复创建广告实例。
  adUnitId: REWARDED_SUPPLY_AD_CONFIG.adUnitId,
  firstGuardianDay: 2,
  lowFundThreshold: 10000,
  reward: 1000,
  highFundRate: 0.1
});

const REWARDED_VISITOR_AD_CONFIG = Object.freeze({
  placement: "visitor_recruitment",
  adUnitId: "adunit-87d5ca86e895053e"
});

function emergencySupplyAdStatus(reserve, config = REWARDED_SUPPLY_AD_CONFIG) {
  const cycle = (reserve && reserve.guardianCycle) || {};
  const day = Math.max(1, safeNumber(cycle.day, 1));
  const state = (reserve && reserve.emergencySupplyAd) || {};
  const supplies = (reserve && reserve.supplies) || {};
  const shortages = Object.keys(config.safeCaps).filter((id) => (supplies[id] || 0) < config.safeCaps[id]);
  // 应急物资是“按缺口触发”的救援，不按天限次。只要玩家后来又消耗了物资，
  // 同一天再次看完广告即可补回缺口；库存满时入口自然消失。
  const claimed = safeNumber(state.lastGuardianDay) === day;
  return { day, shortages, claimed, eligible: day >= config.firstGuardianDay && shortages.length > 0 };
}

function applyEmergencySupplyReward(reserve, config = REWARDED_SUPPLY_AD_CONFIG) {
  const status = emergencySupplyAdStatus(reserve, config);
  if (!status.eligible) return { ok: false, reason: status.shortages.length ? "onboarding" : "full", status };
  const supplies = reserve.supplies || (reserve.supplies = {});
  const items = [];
  Object.keys(config.safeCaps).forEach((id) => {
    const before = supplies[id] || 0;
    // 一次完播把所有物资直接补到安全线，而不是只给一小份，避免看完广告仍显示短缺。
    const after = Math.max(before, config.safeCaps[id]);
    supplies[id] = after;
    if (after > before) items.push({ id, before, after, amount: after - before });
  });
  const previous = reserve.emergencySupplyAd || {};
  reserve.emergencySupplyAd = {
    version: 1,
    lastGuardianDay: status.day,
    claimCount: safeNumber(previous.claimCount) + 1,
    claimCountToday: safeNumber(previous.lastGuardianDay) === status.day
      ? safeNumber(previous.claimCountToday) + 1
      : 1,
    lastReward: { day: status.day, items }
  };
  return { ok: true, day: status.day, items, status };
}

function emergencyFundAdStatus(reserve, config = REWARDED_FUND_AD_CONFIG) {
  const cycle = (reserve && reserve.guardianCycle) || {};
  const day = Math.max(1, safeNumber(cycle.day, 1));
  const state = (reserve && reserve.emergencyFundAd) || {};
  const fund = Math.max(0, safeNumber(reserve && reserve.fund));
  const claimed = safeNumber(state.lastGuardianDay) === day;
  const low = fund < config.lowFundThreshold;
  const reward = low
    ? Math.max(0, Math.round(safeNumber(config.reward)))
    : Math.max(0, Math.round(fund * safeNumber(config.highFundRate)));
  return {
    day,
    fund,
    low,
    claimed,
    reward,
    eligible: day >= config.firstGuardianDay
  };
}

function applyEmergencyFundReward(reserve, config = REWARDED_FUND_AD_CONFIG) {
  const status = emergencyFundAdStatus(reserve, config);
  if (!status.eligible) {
    return {
      ok: false,
      reason: "onboarding",
      status
    };
  }
  const before = Math.max(0, safeNumber(reserve.fund));
  const amount = status.low
    ? Math.max(0, Math.round(safeNumber(config.reward)))
    : Math.max(0, Math.round(before * safeNumber(config.highFundRate)));
  reserve.fund = before + amount;
  recordFundChange(reserve, before, reserve.fund, "应急广告奖励", status.day, "完整观看广告");
  const previous = reserve.emergencyFundAd || {};
  const claimCount = safeNumber(previous.claimCount) + 1;
  const claimCountToday = safeNumber(previous.lastGuardianDay) === status.day
    ? safeNumber(previous.claimCountToday) + 1
    : 1;
  reserve.emergencyFundAd = {
    version: 1,
    lastGuardianDay: status.day,
    claimCount,
    claimCountToday,
    lastReward: { day: status.day, amount, before, after: reserve.fund }
  };
  return { ok: true, day: status.day, amount, before, after: reserve.fund, status };
}

class RewardedSupplyAdController {
  constructor(runtime, options = {}) {
    this.runtime = runtime || {};
    this.config = Object.assign({}, REWARDED_SUPPLY_AD_CONFIG, options.config || {});
    this.instance = null;
    this.showing = false;
    this.activeFinish = null;
    this.lastError = "";
    this.initialize();
  }

  initialize() {
    if (this.instance || typeof this.runtime.createRewardedVideoAd !== "function") return !!this.instance;
    try {
      this.instance = this.runtime.createRewardedVideoAd({ adUnitId: this.config.adUnitId });
      if (this.instance && typeof this.instance.onError === "function") {
        this.instance.onError((error) => {
          this.lastError = String((error && error.errMsg) || (error && error.message) || "激励视频广告拉取失败");
          if (this.activeFinish) this.activeFinish(false, "error");
          else if (typeof console !== "undefined" && console.warn) console.warn("激励视频广告预加载失败", this.lastError);
        });
      }
      return !!this.instance;
    } catch (error) {
      this.instance = null;
      return false;
    }
  }

  available() {
    return !!(this.instance || this.initialize());
  }

  show() {
    if (this.showing || (!this.instance && !this.initialize())) return Promise.resolve({ completed: false, reason: "unsupported" });
    const ad = this.instance;
    this.showing = true;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (completed, reason) => {
        if (settled) return;
        settled = true;
        this.showing = false;
        this.activeFinish = null;
        if (typeof ad.offClose === "function") ad.offClose(onClose);
        resolve({ completed: !!completed, reason });
      };
      // 旧版微信基础库关闭回调不带参数；官方约定这种情况等同完播。
      const onClose = (result) => {
        const completed = result == null || result.isEnded === true;
        finish(completed, completed ? "completed" : "closed_early");
      };
      this.activeFinish = finish;
      if (typeof ad.onClose === "function") ad.onClose(onClose);
      const display = () => Promise.resolve(ad.show());
      display().catch(() => typeof ad.load === "function" ? Promise.resolve(ad.load()).then(display) : Promise.reject(new Error("load unavailable")))
        .catch(() => finish(false, "show_failed"));
    });
  }
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

class InterstitialAdController {
  constructor(runtime, options = {}) {
    this.runtime = runtime || {};
    this.config = Object.assign({}, INTERSTITIAL_AD_CONFIG, options.config || {});
    this.now = typeof options.now === "function" ? options.now : () => Date.now();
    this.instance = null;
    this.showing = false;
    this.pendingResolve = null;
    this.adErrorPending = null;
    this.state = this.readState();
    this.initialize();
  }

  readState() {
    try {
      const saved = this.runtime.getStorageSync && this.runtime.getStorageSync(this.config.storageKey);
      return {
        lastShownAt: Math.max(0, safeNumber(saved && saved.lastShownAt)),
        lastGuardianDay: Math.max(0, safeNumber(saved && saved.lastGuardianDay)),
        shownCount: Math.max(0, safeNumber(saved && saved.shownCount)),
        lastActionCount: Math.max(0, safeNumber(saved && saved.lastActionCount)),
        shownDate: String((saved && saved.shownDate) || ""),
        shownCountToday: Math.max(0, safeNumber(saved && saved.shownCountToday))
      };
    } catch (error) {
      return { lastShownAt: 0, lastGuardianDay: 0, shownCount: 0, lastActionCount: 0, shownDate: "", shownCountToday: 0 };
    }
  }

  dateKey() {
    const value = new Date(this.now());
    if (Number.isNaN(value.getTime())) return "";
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  persistState() {
    try {
      if (this.runtime.setStorageSync) this.runtime.setStorageSync(this.config.storageKey, Object.assign({}, this.state));
    } catch (error) {
      // 广告频控写入失败不能阻断游戏，只保留本次运行内的频控状态。
    }
  }

  initialize() {
    if (this.instance || typeof this.runtime.createInterstitialAd !== "function") return !!this.instance;
    try {
      const instance = this.runtime.createInterstitialAd({ adUnitId: this.config.adUnitId });
      if (!instance) return false;
      this.instance = instance;
      if (typeof instance.onError === "function") {
        instance.onError((error) => {
          if (typeof console !== "undefined" && console.warn) console.warn("插屏广告加载失败", error);
          // show() 的 Promise 会负责 load + show 重试；不要在 onError
          // 事件先到时提前放行，否则重试成功后广告会盖到下一页。
          if (this.showing) {
            this.adErrorPending = error || true;
            return;
          }
          this.finishPending(false, "error");
        });
      }
      if (typeof instance.onClose === "function") {
        instance.onClose(() => this.finishPending(true, "closed"));
      }
      return true;
    } catch (error) {
      if (typeof console !== "undefined" && console.warn) console.warn("插屏广告初始化失败", error);
      this.instance = null;
      return false;
    }
  }

  available() {
    return !!(this.instance || this.initialize());
  }

  shouldShow(context = {}) {
    if (!this.available() || this.showing) return false;
    // 新用户首分钟只完成必要引导，不打断首次操作。
    if (Number.isFinite(Number(context.activeSeconds)) && Number(context.activeSeconds) < 60) return false;
    // guardianNight 仍兼容旧调用；普通结算通过 settlement/eligible 进入。
    const eligibleContext = context.eligible !== false && (context.guardianNight || context.settlement || context.actionCount != null);
    if (!eligibleContext || context.majorMoment || context.onboarding || context.emergency) return false;
    const guardianDay = Math.max(1, safeNumber(context.guardianDay, 1));
    if (guardianDay < this.config.firstGuardianDay) return false;
    if (this.state.lastGuardianDay && guardianDay - this.state.lastGuardianDay < this.config.guardianDayCooldown) return false;
    if (this.state.lastShownAt && this.now() - this.state.lastShownAt < this.config.timeCooldownMs) return false;
    const actionCount = safeNumber(context.actionCount, 0);
    if (actionCount > 0) {
      if (actionCount < this.config.minActionCount) return false;
      if (this.state.lastActionCount && actionCount - this.state.lastActionCount < this.config.minActionGap) return false;
    }
    const today = this.dateKey();
    const shownToday = this.state.shownDate === today ? this.state.shownCountToday : 0;
    if (shownToday >= this.config.dailyCap) return false;
    return true;
  }

  show(context = {}) {
    if (!this.shouldShow(context)) return Promise.resolve({ shown: false, reason: "ineligible" });
    this.showing = true;
    this.adErrorPending = null;
    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      let showResult;
      try {
        showResult = this.instance.show();
      } catch (error) {
        showResult = Promise.reject(error);
      }
      // 插屏实例刚创建或上一轮刚关闭时，首个 show 可能因为尚未完成
      // 拉取而 reject；补一次 load + show，避免“有触发但用户看不到”。
      Promise.resolve(showResult).catch((error) => {
        if (typeof this.instance.load !== "function") return Promise.reject(error);
        return Promise.resolve(this.instance.load()).then(() => this.instance.show());
      }).then(() => {
        this.state.lastShownAt = this.now();
        this.state.lastGuardianDay = Math.max(0, safeNumber(context.guardianDay));
        const actionCount = safeNumber(context.actionCount, 0);
        if (actionCount > 0) this.state.lastActionCount = actionCount;
        this.state.shownCount += 1;
        const today = this.dateKey();
        this.state.shownCountToday = this.state.shownDate === today ? this.state.shownCountToday + 1 : 1;
        this.state.shownDate = today;
        this.persistState();
        // 微信实例通过 onClose 结束流程；极简测试或兼容运行时没有回调时直接放行。
        if (!this.instance || typeof this.instance.onClose !== "function") this.finishPending(true, "shown");
      }).catch((error) => {
        if (typeof console !== "undefined" && console.warn) console.warn("插屏广告显示失败", error);
        this.finishPending(false, "show_rejected");
      });
    });
  }

  finishPending(shown, reason) {
    if (!this.showing && !this.pendingResolve) return;
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.showing = false;
    this.adErrorPending = null;
    if (resolve) resolve({ shown: !!shown, reason, placement: this.config.placement });
  }
}

class NativeTemplateAdController {
  constructor(runtime, options = {}) {
    this.runtime = runtime || {};
    this.config = Object.assign({}, NATIVE_TEMPLATE_AD_CONFIG, options.config || {});
    this.viewport = Object.assign({}, this.systemViewport(), options.viewport || {});
    this.instance = null;
    this.requestedVisible = false;
    this.shown = false;
    this.showing = false;
    this.retryAt = 0;
    this.slotTop = null;
    this.measuredWidth = 0;
    this.measuredHeight = 0;
    this.onLayoutChange = typeof options.onLayoutChange === "function" ? options.onLayoutChange : null;
    this.initialize();
  }

  systemViewport() {
    try {
      const info = this.runtime.getSystemInfoSync ? this.runtime.getSystemInfoSync() : {};
      return {
        width: Math.max(0, safeNumber(info.windowWidth)),
        height: Math.max(0, safeNumber(info.windowHeight))
      };
    } catch (error) {
      return { width: 375, height: 667 };
    }
  }

  initialStyle() {
    const viewportWidth = Math.max(1, safeNumber(this.viewport.width, 375));
    const viewportHeight = Math.max(1, safeNumber(this.viewport.height, 667));
    const width = Math.max(1, Math.min(this.config.maxWidth, viewportWidth - this.config.sideInset * 2));
    return {
      left: Math.max(0, Math.round((viewportWidth - width) / 2)),
      top: Math.max(0, Math.round(viewportHeight - this.config.bottomInset - this.config.estimatedHeight)),
      width
    };
  }

  initialize() {
    if (this.instance || typeof this.runtime.createCustomAd !== "function") return !!this.instance;
    try {
      const instance = this.runtime.createCustomAd({
        adUnitId: this.config.adUnitId,
        style: this.initialStyle()
      });
      if (!instance) return false;
      this.instance = instance;
      if (typeof instance.onLoad === "function") {
        instance.onLoad(() => {
          if (this.requestedVisible && !this.shown) this.show();
        });
      }
      if (typeof instance.onResize === "function") {
        instance.onResize((size) => this.position(size, true));
      }
      if (typeof instance.onError === "function") {
        instance.onError((error) => {
          this.showing = false;
          this.shown = false;
          // A failed native ad can leave its platform-owned touch surface
          // mounted even though it is no longer visually shown. Always hide
          // and park it outside the viewport so the materials page buttons
          // remain tappable when inventory ads have no fill.
          this.hide();
          this.retryAt = Date.now() + this.config.retryDelayMs;
          if (typeof console !== "undefined" && console.warn) console.warn("原生模板广告加载失败", error && (error.errMsg || error));
        });
      }
      return true;
    } catch (error) {
      if (typeof console !== "undefined" && console.warn) console.warn("原生模板广告初始化失败", error);
      this.instance = null;
      return false;
    }
  }

  position(size = {}, notify = false) {
    if (!this.instance || !this.instance.style) return;
    const fallback = this.initialStyle();
    const viewportWidth = Math.max(1, safeNumber(this.viewport.width, 375));
    const widthLimit = Math.max(1, Math.min(this.config.maxWidth, viewportWidth - this.config.sideInset * 2));
    const width = Math.max(1, Math.min(widthLimit, safeNumber(size.width, this.instance.style.width || fallback.width)));
    const height = Math.max(1, safeNumber(size.height, this.config.estimatedHeight));
    const previousWidth = this.measuredWidth;
    const previousHeight = this.measuredHeight;
    this.measuredWidth = width;
    this.measuredHeight = height;
    this.instance.style.width = width;
    this.instance.style.left = Math.max(0, Math.round((viewportWidth - width) / 2));
    this.instance.style.top = Number.isFinite(this.slotTop)
      ? Math.max(0, Math.round(this.slotTop))
      : fallback.top;
    if (notify && this.onLayoutChange && (width !== previousWidth || height !== previousHeight)) {
      this.onLayoutChange({ width, height });
    }
  }

  isSupported() {
    return typeof this.runtime.createCustomAd === "function";
  }

  layoutSize() {
    const fallback = this.initialStyle();
    return {
      width: Math.max(1, safeNumber(this.measuredWidth || fallback.width, fallback.width)),
      height: Math.max(1, safeNumber(this.measuredHeight || this.config.estimatedHeight, this.config.estimatedHeight))
    };
  }

  setViewportSlot(slot = null) {
    if (!slot) {
      this.slotTop = null;
      return;
    }
    if (Number.isFinite(slot.viewportWidth)) this.viewport.width = Math.max(1, slot.viewportWidth);
    if (Number.isFinite(slot.viewportHeight)) this.viewport.height = Math.max(1, slot.viewportHeight);
    this.slotTop = Number.isFinite(slot.top) ? slot.top : null;
    this.position();
  }

  setVisible(visible) {
    const next = !!visible;
    if (next === this.requestedVisible && (next ? (this.shown || this.showing) : !this.shown)) return;
    this.requestedVisible = next;
    if (next) this.show();
    else this.hide();
  }

  show() {
    if (!this.requestedVisible || this.shown || this.showing) return Promise.resolve(false);
    if (Date.now() < this.retryAt) return Promise.resolve(false);
    if (!this.instance && !this.initialize()) return Promise.resolve(false);
    if (!this.instance || typeof this.instance.show !== "function") return Promise.resolve(false);
    // A hidden WeChat custom-ad is parked outside the viewport so its native
    // layer cannot intercept later canvas taps. Restore its saved slot first.
    this.position();
    this.showing = true;
    let result;
    try {
      result = this.instance.show();
    } catch (error) {
      this.showing = false;
      this.hide();
      this.retryAt = Date.now() + this.config.retryDelayMs;
      if (typeof console !== "undefined" && console.warn) console.warn("原生模板广告显示失败", error);
      return Promise.resolve(false);
    }
    return Promise.resolve(result).then(() => {
      this.showing = false;
      if (!this.requestedVisible) {
        this.hide();
        return false;
      }
      this.shown = true;
      return true;
    }).catch((error) => {
      this.showing = false;
      this.shown = false;
      this.hide();
      this.retryAt = Date.now() + this.config.retryDelayMs;
      if (typeof console !== "undefined" && console.warn) console.warn("原生模板广告显示失败", error);
      return false;
    });
  }

  hide() {
    this.shown = false;
    if (!this.instance) return;
    if (typeof this.instance.hide === "function") {
      try { this.instance.hide(); } catch (error) { /* 广告隐藏失败不阻断游戏。 */ }
    }
    // Some base-library versions briefly leave the native touch surface alive
    // after hide(). Moving it away prevents invisible click interception.
    if (this.instance.style) {
      const viewportHeight = Math.max(1, safeNumber(this.viewport.height, 667));
      const height = Math.max(1, safeNumber(this.measuredHeight, this.config.estimatedHeight));
      this.instance.style.top = viewportHeight + height + 16;
    }
  }

  destroy() {
    this.requestedVisible = false;
    this.hide();
    if (this.instance && typeof this.instance.destroy === "function") {
      try { this.instance.destroy(); } catch (error) { /* ignore */ }
    }
    this.instance = null;
  }
}

module.exports = {
  INTERSTITIAL_AD_CONFIG,
  NATIVE_TEMPLATE_AD_CONFIG,
  REWARDED_SUPPLY_AD_CONFIG,
  REWARDED_VISITOR_AD_CONFIG,
  REWARDED_FUND_AD_CONFIG,
  InterstitialAdController,
  NativeTemplateAdController,
  RewardedSupplyAdController,
  emergencySupplyAdStatus,
  applyEmergencySupplyReward,
  emergencyFundAdStatus,
  applyEmergencyFundReward
};
