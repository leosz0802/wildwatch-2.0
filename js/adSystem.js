const { recordFundChange } = require("./fundLedger");
const { PACE_ECONOMY, paceFundAdReward } = require("./balanceConfig");
const INTERSTITIAL_AD_CONFIG = Object.freeze({
  placement: "lucky",
  adUnitId: "adunit-00c6bce833409f4f",
  firstGuardianDay: 1,
  guardianDayCooldown: 0,
  minActiveSeconds: 0,
  timeCooldownMs: 125 * 1000,
  minActionCount: 2,
  minActionGap: 3,
  dailyCap: 8,
  showTimeoutMs: 8000,
  storageKey: "wild_reserve_interstitial_ad_v1"
});
const NATIVE_TEMPLATE_AD_CONFIG = Object.freeze({
  placement: "lucky2",
  adUnitId: "adunit-9f2f2442a85b3c2a",
  maxWidth: 320,
  sideInset: 24,
  bottomInset: 70,
  estimatedHeight: 112,
  retryDelayMs: 30 * 1000
});
const REWARDED_SUPPLY_AD_CONFIG = Object.freeze({
  placement: "material_relief",
  adUnitId: "adunit-f552fdacc287baec",
  showTimeoutMs: 120 * 1000,
  firstGuardianDay: 1,
  // Keep this list in sync with the six visible patrol-supply cards.  The
  // evidence device was added to the warehouse and purchase catalog later;
  // omitting it here made the emergency-ad footer claim that the warehouse
  // was full while 诱迹机关 was still 0/2.
  safeCaps: Object.freeze({
    dogFood: 4,
    alarm: 2,
    tranquilizer: 2,
    fieldKit: 2,
    medicalKit: 2,
    evidenceTrap: 2
  }),
  grants: Object.freeze({
    dogFood: 2,
    alarm: 1,
    tranquilizer: 1,
    fieldKit: 1,
    medicalKit: 1,
    evidenceTrap: 1
  })
});
const REWARDED_FUND_AD_CONFIG = Object.freeze({
  placement: "fund_relief",
  adUnitId: REWARDED_SUPPLY_AD_CONFIG.adUnitId,
  firstGuardianDay: PACE_ECONOMY.fundAdFirstGuardianDay,
  rewardPerChapter: PACE_ECONOMY.fundAdPerChapter,
  dailyCap: PACE_ECONOMY.fundAdDailyCap
});
const REWARDED_VISITOR_AD_CONFIG = Object.freeze({
  placement: "visitor_recruitment",
  adUnitId: "adunit-87d5ca86e895053e",
  showTimeoutMs: 120 * 1000
});
const REWARDED_ANIMAL_AD_CONFIG = Object.freeze({
  placement: "animal_total_boost",
  adUnitId: "adunit-a74d65c9384d70b7",
  showTimeoutMs: 120 * 1000,
  chapterCap: PACE_ECONOMY.animalAdChapterCap,
  dailyCap: PACE_ECONOMY.animalAdChapterCap,
  minPercent: PACE_ECONOMY.animalAdMinPercent,
  maxPercent: PACE_ECONOMY.animalAdMaxPercent
});
const REWARDED_FACILITY_AD_CONFIG = Object.freeze({
  placement: "facility_use_boost",
  adUnitId: "adunit-a74d65c9384d70b7",
  showTimeoutMs: 120 * 1000
});
function emergencySupplyAdStatus(reserve, config = REWARDED_SUPPLY_AD_CONFIG) {
  const cycle = (reserve && reserve.guardianCycle) || {};
  const day = Math.max(1, safeNumber(cycle.day, 1));
  const state = (reserve && reserve.emergencySupplyAd) || {};
  const supplies = (reserve && reserve.supplies) || {};
  const shortages = Object.keys(config.safeCaps).filter((id) => (supplies[id] || 0) < config.safeCaps[id]);
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
function fundAdChapter(reserve = {}) {
  const progression = (reserve && reserve.progression) || {};
  return Math.max(1, Math.round(Number(progression.displayChapter || progression.stage || 1)));
}
function fundAdRewardFor(reserve = {}, config = REWARDED_FUND_AD_CONFIG) {
  const chapter = fundAdChapter(reserve);
  if (!config || config.rewardPerChapter == null || config.rewardPerChapter === PACE_ECONOMY.fundAdPerChapter) {
    return paceFundAdReward(chapter);
  }
  return Math.max(
    Math.round(Number(PACE_ECONOMY.fundAdMinReward) || 0),
    Math.round(safeNumber(config.rewardPerChapter, 200) * chapter)
  );
}
function emergencyFundAdStatus(reserve, config = REWARDED_FUND_AD_CONFIG) {
  const cycle = (reserve && reserve.guardianCycle) || {};
  const day = Math.max(1, safeNumber(cycle.day, 1));
  const state = (reserve && reserve.emergencyFundAd) || {};
  const fund = Math.max(0, safeNumber(reserve && reserve.fund));
  const claimedToday = safeNumber(state.lastGuardianDay) === day ? safeNumber(state.claimCountToday) : 0;
  const dailyCap = Math.max(0, safeNumber(config.dailyCap, 3));
  const remaining = Math.max(0, dailyCap - claimedToday);
  const reward = fundAdRewardFor(reserve, config);
  const onboarding = day < config.firstGuardianDay;
  return {
    day,
    chapter: fundAdChapter(reserve),
    fund,
    claimed: claimedToday > 0,
    claimedToday,
    remaining,
    dailyCap,
    reward,
    reason: onboarding ? "onboarding" : remaining <= 0 ? "daily_cap" : "",
    eligible: !onboarding && remaining > 0
  };
}
function animalAdChapter(reserve = {}) {
  const progression = (reserve && reserve.progression) || {};
  return Math.max(1, Math.round(Number(progression.displayChapter || progression.stage || 1)));
}
function animalTotalAdStatus(reserve, now = Date.now(), config = REWARDED_ANIMAL_AD_CONFIG) {
  const chapter = animalAdChapter(reserve);
  const state = (reserve && reserve.animalTotalAd) || {};
  const sameChapter = Math.round(Number(state.chapter) || 0) === chapter;
  const claimedChapter = sameChapter ? safeNumber(state.claimCountChapter) : 0;
  const chapterCap = Math.max(0, safeNumber(config.chapterCap, safeNumber(config.dailyCap, 4)));
  const remaining = Math.max(0, chapterCap - claimedChapter);
  return {
    chapter,
    claimedChapter,
    claimedToday: claimedChapter,
    remaining,
    chapterCap,
    dailyCap: chapterCap,
    minPercent: Math.max(1, safeNumber(config.minPercent, 5)),
    maxPercent: Math.max(safeNumber(config.minPercent, 5), safeNumber(config.maxPercent, 10)),
    reason: remaining > 0 ? "" : "chapter_cap",
    eligible: remaining > 0
  };
}
function applyAnimalTotalAdReward(reserve, random = Math.random, now = Date.now(), config = REWARDED_ANIMAL_AD_CONFIG) {
  const status = animalTotalAdStatus(reserve, now, config);
  if (!status.eligible) return { ok: false, reason: status.reason || "chapter_cap", status };
  const { livingAnimalTotal } = require("./chapterRescueSystem");
  const { addLivingAnimals } = require("./animalSourceLedger");
  const living = Math.max(0, Math.round(livingAnimalTotal(reserve) || 0));
  const before = living;
  const span = Math.max(0, status.maxPercent - status.minPercent);
  const roll = Math.max(0, Math.min(0.999999, Number(typeof random === "function" ? random() : random) || 0));
  const percent = status.minPercent + Math.floor(roll * (span + 1));
  const exactMax = before * status.maxPercent / 100;
  const exactMin = before * status.minPercent / 100;
  const maxGain = exactMax < 1 ? 1 : Math.floor(exactMax);
  const minGain = exactMax < 1 ? 1 : Math.max(1, Math.round(exactMin));
  const wanted = before > 0
    ? Math.max(minGain, Math.min(maxGain, Math.round(before * percent / 100)))
    : 0;
  if (!wanted) {
    return { ok: false, reason: "empty_stock", status, before, percent, amount: 0 };
  }
  const granted = addLivingAnimals(reserve, wanted, "advertised");
  if (!granted.added) {
    return { ok: false, reason: granted.reason || "no_candidates", status, before, percent, amount: 0 };
  }
  const after = Math.max(0, Math.round(livingAnimalTotal(reserve) || 0));
  const previous = reserve.animalTotalAd || {};
  reserve.animalTotalAd = {
    version: 2,
    chapter: status.chapter,
    claimCount: safeNumber(previous.claimCount) + 1,
    claimCountChapter: safeNumber(status.claimedChapter) + 1,
    lastReward: { chapter: status.chapter, percent, amount: granted.added, before, after }
  };
  return { ok: true, percent, amount: granted.added, before, after, status: animalTotalAdStatus(reserve, now, config) };
}
function applyEmergencyFundReward(reserve, config = REWARDED_FUND_AD_CONFIG) {
  const status = emergencyFundAdStatus(reserve, config);
  if (!status.eligible) {
    return {
      ok: false,
      reason: status.reason || "blocked",
      status
    };
  }
  const before = Math.max(0, safeNumber(reserve.fund));
  const amount = Math.max(0, Math.round(safeNumber(status.reward)));
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
function rewardedAdErrorText(error) {
  if (error == null) return "";
  if (typeof error === "string") return error;
  return [error.errCode, error.errMsg, error.message, error.reason]
    .filter((part) => part != null && String(part).trim())
    .join(" ");
}
function classifyRewardedAdFailureReason(error) {
  const text = rewardedAdErrorText(error);
  if (/-13011|-13903|no point expt|ERR_EXPT|ERR_UV|1004|1007|广告加载失败/i.test(text)) return "no_fill";
  return "error";
}
function isRewardedPlayerTeardownError(error) {
  return /operateVideoPlayer|getVolume|access denied|appServiceSDKScriptError|广告不可用|show:fail/i.test(rewardedAdErrorText(error));
}
function describeRewardedAdFailure(result) {
  const reason = result && result.reason;
  if (reason === "closed_early" || reason === "closed_surface") return "";
  if (reason === "busy") return "广告正在播放，请稍后再试";
  if (reason === "unsupported") return "当前环境不支持激励广告";
  if (reason === "timeout") return "广告加载超时，请稍后再试";
  const text = rewardedAdErrorText(result && (result.error || result.errMsg));
  if (reason === "no_fill" || /-13011|-13903|no point expt|ERR_EXPT|ERR_UV|1004|1007|广告加载失败/i.test(text)) {
    return "微信当前没有可播放的广告，请用真机体验版稍后再试";
  }
  return "广告暂时不可用，请稍后再试";
}
class RewardedSupplyAdController {
  constructor(runtime, options = {}) {
    this.runtime = runtime || {};
    this.config = Object.assign({}, REWARDED_SUPPLY_AD_CONFIG, options.config || {});
    this.instance = null;
    this.showing = false;
    this.activeFinish = null;
    this.lastError = "";
    this.showWatchdog = 0;
    this.releaseWatchdog = 0;
    this.showGeneration = 0;
    this.surfaceBroken = false;
    this.skipReload = false;
    this.loaded = false;
    this.iosRuntime = null;
  }
  isIosRuntime() {
    if (this.iosRuntime != null) return this.iosRuntime;
    let info = {};
    try {
      if (typeof this.runtime.getDeviceInfo === "function") info = this.runtime.getDeviceInfo() || {};
      else if (typeof this.runtime.getSystemInfoSync === "function") info = this.runtime.getSystemInfoSync() || {};
    } catch (error) {
      info = {};
    }
    const text = `${(info && info.platform) || ""} ${(info && info.system) || ""}`.toLowerCase();
    this.iosRuntime = /ios|iphone|ipad/.test(text);
    return this.iosRuntime;
  }
  isVideoSurfaceError(error) {
    const message = String((error && error.errMsg) || (error && error.message) || error || "");
    return /operateVideoPlayer|getVolume|access denied|appServiceSDKScriptError/i.test(message);
  }
  swallowAdPromise(result) {
    try {
      const pending = Promise.resolve(result);
      if (pending && typeof pending.catch === "function") pending.catch(() => {});
      return pending;
    } catch (error) {
      return Promise.resolve();
    }
  }
  noteSurfaceNoise(error) {
    if (!this.isVideoSurfaceError(error)) return false;
    this.skipReload = true;
    return true;
  }
  clearShowWatchdog() {
    if (!this.showWatchdog) return;
    if (typeof clearTimeout === "function") clearTimeout(this.showWatchdog);
    this.showWatchdog = 0;
  }
  clearReleaseWatchdog() {
    if (!this.releaseWatchdog) return;
    if (typeof clearTimeout === "function") clearTimeout(this.releaseWatchdog);
    this.releaseWatchdog = 0;
  }
  hideNativeSurface() {
    if (this.showing) return false;
    const ad = this.instance;
    if (!ad || typeof ad.hide !== "function") return false;
    try {
      const hidden = ad.hide();
      this.swallowAdPromise(hidden);
      return true;
    } catch (error) {
      return false;
    }
  }
  dismissLeftoverSurface() {
    // destroy() makes the next createRewardedVideoAd return a dead object.
    // iOS show() then fails with "video-ad has been destroyed".
    if (this.showing) return false;
    this.loaded = false;
    return true;
  }
  releaseVideoSurface() {
    this.clearReleaseWatchdog();
    this.loaded = false;
    const ad = this.instance;
    this.instance = null;
    this.activeFinish = null;
    if (!ad) return;
    try {
      if (typeof ad.hide === "function") this.swallowAdPromise(ad.hide());
    } catch (error) { /* ignore leftover operateVideoPlayer */ }
    try {
      if (typeof ad.destroy === "function") ad.destroy();
    } catch (error) { /* ignore */ }
  }
  scheduleReleaseVideoSurface(generation) {
    this.clearReleaseWatchdog();
    const release = () => {
      if (this.showGeneration !== generation || this.showing) return;
      this.releaseVideoSurface();
    };
    if (typeof setTimeout === "function") {
      this.releaseWatchdog = setTimeout(release, 80);
      return;
    }
    release();
  }
  scheduleReloadVideoAd(generation) {
    this.clearReleaseWatchdog();
    if (this.skipReload) return;
    const reload = () => {
      if (this.showGeneration !== generation || this.showing || this.skipReload) return;
      const ad = this.instance;
      if (!ad || typeof ad.load !== "function") return;
      try {
        Promise.resolve(ad.load()).catch((error) => { this.noteSurfaceNoise(error); });
      } catch (error) {
        this.noteSurfaceNoise(error);
      }
    };
    if (typeof setTimeout === "function") {
      // The native player is still tearing down at 120ms. load() then throws
      // operateVideoPlayer:fail:internal error and hitches the sandbox frame.
      this.releaseWatchdog = setTimeout(reload, 1800);
      return;
    }
    reload();
  }
  initialize() {
    if (this.instance || typeof this.runtime.createRewardedVideoAd !== "function") return !!this.instance;
    try {
      this.instance = this.runtime.createRewardedVideoAd({ adUnitId: this.config.adUnitId });
      this.loaded = false;
      const bound = this.instance;
      if (bound && typeof bound.onError === "function") {
        bound.onError((error) => {
          // Destroying one iOS rewarded video fires operateVideoPlayer / 广告不可用
          // on the instance we just dropped. That stale callback must not fail
          // the next placement's show().
          if (this.instance !== bound) return;
          if (this.noteSurfaceNoise(error)) return;
          this.lastError = rewardedAdErrorText(error) || "激励视频广告拉取失败";
          if (typeof this.failOrRebuild === "function") {
            this.failOrRebuild(error);
            return;
          }
          if (this.activeFinish) this.activeFinish(false, classifyRewardedAdFailureReason(error));
          else if (typeof console !== "undefined" && console.warn) {
            console.warn("激励视频广告预加载失败", this.lastError);
          }
        });
      }
      return !!this.instance;
    } catch (error) {
      this.instance = null;
      return false;
    }
  }
  available() {
    if (typeof this.runtime.createRewardedVideoAd !== "function") return false;
    // iOS can only keep one live rewarded-video player. Creating it here
    // would leave a second unit alive and make the next placement report
    // 广告暂时不可用 after the first watch. Create it inside show().
    if (this.isIosRuntime()) return true;
    return !!(this.instance || this.initialize());
  }
  show() {
    this.clearReleaseWatchdog();
    if (this.showing) return Promise.resolve({ completed: false, reason: "busy" });
    this.lastError = "";
    this.surfaceBroken = false;
    this.skipReload = false;
    this.iosRebuilt = false;
    this.failOrRebuild = null;
    if (!this.instance && !this.initialize()) return Promise.resolve({ completed: false, reason: "unsupported" });
    const ad = this.instance;
    this.showing = true;
    this.showGeneration += 1;
    const generation = this.showGeneration;
    return new Promise((resolve) => {
      let settled = false;
      // Ignore onClose until display() starts the video. Android replays the
      // previous close as soon as the handler is bound; counting it spends a
      // visitor-ad watch before the new video is on screen. iOS already waited.
      let acceptClose = false;
      let shownAt = 0;
      let showAccepted = false;
      let syncReplay = false;
      let replaySwallowed = false;
      let recoverStarted = false;
      let noiseWait = false;
      const finish = (completed, reason) => {
        if (settled || generation !== this.showGeneration) return;
        settled = true;
        this.clearShowWatchdog();
        this.showing = false;
        this.loaded = false;
        this.failOrRebuild = null;
        this.activeFinish = null;
        const current = this.instance;
        try {
          if (typeof ad.offClose === "function") ad.offClose(onClose);
        } catch (error) { /* ignore */ }
        try {
          if (current && current !== ad && typeof current.offClose === "function") current.offClose(onClose);
        } catch (error) { /* ignore */ }
        if (completed) this.rewardSettledAt = Date.now();
        resolve({ completed: !!completed, reason, error: this.lastError || null });
        if (!this.skipReload) this.scheduleReloadVideoAd(generation);
      };
      const onClose = (result) => {
        // iOS fires onClose({isEnded:false}) while the previous player is still
        // tearing down, before show() is called. Treating that as a user skip
        // skips the load retry and surfaces 广告暂时不可用.
        if (!acceptClose) return;
        const hasExplicitEnded = !!(result && Object.prototype.hasOwnProperty.call(result, "isEnded"));
        const completed = hasExplicitEnded ? result.isEnded === true : true;
        // Android replays the previous completed close inside show(), before
        // that call returns. Settling it spends a visitor watch with no new
        // video and drops the real close. Leave this show open.
        if (syncReplay && completed) {
          replaySwallowed = true;
          return;
        }
        // iOS often emits onClose({isEnded:false}) in the same moment show()
        // starts, before the video is on screen. That is the player tearing
        // down, not the viewer skipping. Replay once instead of ending the reward.
        if (!completed && this.isIosRuntime() && !recoverStarted && shownAt && Date.now() - shownAt < 1200) {
          beginRecover({ errMsg: "ios_phantom_close" });
          return;
        }
        if (!hasExplicitEnded && typeof console !== "undefined" && console.info) {
          console.info("[RewardedAd] onClose 缺少 isEnded，按兼容层完播处理");
        }
        finish(completed, completed ? "completed" : "closed_early");
      };
      this.activeFinish = finish;
      if (typeof ad.onClose === "function") ad.onClose(onClose);
      const timeoutMs = Math.max(1000, Number(this.config.showTimeoutMs) || 10000);
      if (typeof setTimeout === "function") {
        this.showWatchdog = setTimeout(() => finish(false, "timeout"), timeoutMs);
      }
      const display = (target = ad) => {
        acceptClose = true;
        shownAt = Date.now();
        syncReplay = true;
        let pending;
        try {
          pending = Promise.resolve(target.show());
        } catch (error) {
          pending = Promise.reject(error);
        }
        const releaseReplay = () => { syncReplay = false; };
        if (typeof queueMicrotask === "function") queueMicrotask(releaseReplay);
        else Promise.resolve().then(releaseReplay);
        const accepted = pending.then((value) => {
          showAccepted = true;
          return value;
        });
        return accepted.catch((error) => {
          // Android WeChat often rejects the original show() after onClose.
          // Retrying then toasts 广告不可用 and leaves a native layer over archery.
          if (settled) {
            this.noteSurfaceNoise(error);
            return undefined;
          }
          return Promise.reject(error);
        });
      };
      const loadThenShow = (target = ad) => {
        if (typeof target.load !== "function") return display(target);
        return Promise.resolve(target.load()).then(() => {
          if (settled) return undefined;
          this.loaded = true;
          return display(target);
        });
      };
      const start = () => {
        if (!this.isIosRuntime() || this.loaded) return display(ad);
        return loadThenShow(ad);
      };
      const adWasDestroyed = (error) => /destroyed/i.test(rewardedAdErrorText(error) || this.lastError || "");
      const rebuildAndShow = () => {
        const previous = this.instance;
        this.loaded = false;
        acceptClose = false;
        if (adWasDestroyed()) {
          // The native object is already dead. Calling destroy() again keeps
          // WeChat handing back the same object.
          this.instance = null;
          if (!this.initialize()) return Promise.reject(new Error(this.lastError || "destroyed"));
        } else if (!this.instance && !this.initialize()) {
          return Promise.reject(new Error("unsupported"));
        }
        const next = this.instance || previous;
        if (next && next !== previous && typeof next.onClose === "function") next.onClose(onClose);
        return loadThenShow(next);
      };
      const beginRecover = (error) => {
        if (settled) return;
        this.lastError = rewardedAdErrorText(error) || this.lastError;
        if (!this.isIosRuntime()) {
          // 第3章以前只按关片结果发奖。视频已经播起来之后，微信还会补
          // -13011 或「广告不可用」。这些不是没播成，也不能当成看完。
          const playbackNoise = showAccepted && acceptClose && shownAt
            && (classifyRewardedAdFailureReason(error) === "no_fill" || isRewardedPlayerTeardownError(error));
          if (playbackNoise) {
            this.skipReload = true;
            if (replaySwallowed) {
              finish(false, "closed_surface");
              return;
            }
            // 关片结果还没到。等到真正的 onClose 再发奖。一直不来就放开按钮，不补发。
            if (noiseWait) return;
            noiseWait = true;
            const releaseIfStillOpen = () => {
              if (settled || generation !== this.showGeneration) return;
              finish(false, "closed_surface");
            };
            if (typeof setTimeout === "function") setTimeout(releaseIfStillOpen, 2000);
            else releaseIfStillOpen();
            return;
          }
          // 刚发过奖，关片手势又拉起一次失败的 show。不要再提示广告暂时不可用。
          const recentReward = this.rewardSettledAt && Date.now() - this.rewardSettledAt < 4000;
          if (recentReward && isRewardedPlayerTeardownError(error) && !showAccepted) {
            this.skipReload = true;
            finish(false, "closed_surface");
            return;
          }
          if (replaySwallowed && isRewardedPlayerTeardownError(error)) {
            this.skipReload = true;
            finish(false, "closed_surface");
            return;
          }
          finish(false, classifyRewardedAdFailureReason(error) || "show_failed");
          return;
        }
        if (recoverStarted) return;
        recoverStarted = true;
        this.iosRebuilt = true;
        const wait = typeof setTimeout === "function"
          ? new Promise((retryResolve) => setTimeout(retryResolve, 200))
          : Promise.resolve();
        wait.then(() => {
          if (settled) return undefined;
          return rebuildAndShow();
        }).catch((retryError) => {
          if (settled) {
            this.noteSurfaceNoise(retryError);
            return;
          }
          this.lastError = rewardedAdErrorText(retryError) || this.lastError;
          finish(false, classifyRewardedAdFailureReason(retryError) || "show_failed");
        });
      };
      this.failOrRebuild = beginRecover;
      start().catch((error) => {
        if (settled || recoverStarted) {
          this.noteSurfaceNoise(error);
          return undefined;
        }
        if (/destroyed/i.test(rewardedAdErrorText(error))) return Promise.reject(error);
        if (!this.isIosRuntime() && isRewardedPlayerTeardownError(error)) {
          beginRecover(error);
          return undefined;
        }
        if (typeof ad.load !== "function") return Promise.reject(error || new Error("load unavailable"));
        this.loaded = false;
        return Promise.resolve(ad.load()).then(() => {
          if (settled) return undefined;
          this.loaded = true;
          return display(ad);
        });
      }).catch((error) => {
        if (settled || recoverStarted) {
          this.noteSurfaceNoise(error);
          return;
        }
        beginRecover(error);
      });
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
    this.awaitingClose = false;
    this.showWatchdog = 0;
    this.pendingResolve = null;
    this.adErrorPending = null;
    this.state = this.readState();
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
          if (this.showing) {
            this.adErrorPending = error || true;
            if (this.awaitingClose) this.finishPending(false, "error");
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
    return typeof this.runtime.createInterstitialAd === "function";
  }
  shouldShow(context = {}) {
    if (!this.available() || this.showing) return false;
    if (this.config.minActiveSeconds > 0
      && Number.isFinite(Number(context.activeSeconds))
      && Number(context.activeSeconds) < this.config.minActiveSeconds) return false;
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
    if (!this.instance && !this.initialize()) return Promise.resolve({ shown: false, reason: "unsupported" });
    this.showing = true;
    this.awaitingClose = false;
    this.adErrorPending = null;
    return new Promise((resolve) => {
      this.pendingResolve = resolve;
      this.armShowWatchdog();
      let showResult;
      try {
        showResult = this.instance.show();
      } catch (error) {
        showResult = Promise.reject(error);
      }
      Promise.resolve(showResult).catch((error) => {
        if (typeof this.instance.load !== "function") return Promise.reject(error);
        return Promise.resolve(this.instance.load()).then(() => this.instance.show());
      }).then(() => {
        if (!this.showing) return;
        if (this.adErrorPending) {
          this.finishPending(false, "error");
          return;
        }
        this.state.lastShownAt = this.now();
        this.state.lastGuardianDay = Math.max(0, safeNumber(context.guardianDay));
        const actionCount = safeNumber(context.actionCount, 0);
        if (actionCount > 0) this.state.lastActionCount = actionCount;
        this.state.shownCount += 1;
        const today = this.dateKey();
        this.state.shownCountToday = this.state.shownDate === today ? this.state.shownCountToday + 1 : 1;
        this.state.shownDate = today;
        this.persistState();
        this.awaitingClose = true;
        if (!this.instance || typeof this.instance.onClose !== "function") this.finishPending(true, "shown");
      }).catch((error) => {
        if (typeof console !== "undefined" && console.warn) console.warn("插屏广告显示失败", error);
        this.finishPending(false, "show_rejected");
      });
    });
  }
  armShowWatchdog() {
    this.clearShowWatchdog();
    const timeoutMs = Math.max(0, safeNumber(this.config.showTimeoutMs, 8000));
    if (!timeoutMs || typeof setTimeout !== "function") return;
    this.showWatchdog = setTimeout(() => this.finishPending(false, "timeout"), timeoutMs);
  }
  clearShowWatchdog() {
    if (!this.showWatchdog) return;
    if (typeof clearTimeout === "function") clearTimeout(this.showWatchdog);
    this.showWatchdog = 0;
  }
  finishPending(shown, reason) {
    if (!this.showing && !this.pendingResolve) return;
    this.clearShowWatchdog();
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    this.showing = false;
    this.awaitingClose = false;
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
    this.showGeneration = 0;
    this.onLayoutChange = typeof options.onLayoutChange === "function" ? options.onLayoutChange : null;
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
  offscreenTop() {
    const viewportHeight = Math.max(1, safeNumber(this.viewport.height, 667));
    const height = Math.max(1, safeNumber(this.measuredHeight, this.config.estimatedHeight));
    return viewportHeight + height + 16;
  }
  parkOffscreen() {
    if (!this.instance || !this.instance.style) return;
    this.instance.style.top = this.offscreenTop();
    // iOS WeChat still hit-tests custom ads that sit just below the canvas.
    // Park them fully off the left edge the same way Game Club buttons do.
    this.instance.style.left = -9999;
  }
  initialStyle() {
    const viewportWidth = Math.max(1, safeNumber(this.viewport.width, 375));
    const width = Math.max(1, Math.min(this.config.maxWidth, viewportWidth - this.config.sideInset * 2));
    return {
      left: Math.max(0, Math.round((viewportWidth - width) / 2)),
      top: this.offscreenTop(),
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
      this.parkOffscreen();
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
          this.retryAt = Date.now() + this.config.retryDelayMs;
          this.destroy();
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
    if (!this.requestedVisible) {
      this.parkOffscreen();
    } else {
      this.instance.style.top = Number.isFinite(this.slotTop)
        ? Math.max(0, Math.round(this.slotTop))
        : Math.max(0, Math.round(this.viewport.height - this.config.bottomInset - this.config.estimatedHeight));
    }
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
    if (!next) {
      if (!this.requestedVisible && !this.shown && !this.showing) return;
      this.requestedVisible = false;
      this.hide();
      return;
    }
    if (this.requestedVisible && (this.shown || this.showing)) return;
    this.requestedVisible = true;
    this.show();
  }
  show() {
    if (!this.requestedVisible || this.shown || this.showing) return Promise.resolve(false);
    if (Date.now() < this.retryAt) return Promise.resolve(false);
    if (!this.instance && !this.initialize()) return Promise.resolve(false);
    if (!this.instance || typeof this.instance.show !== "function") return Promise.resolve(false);
    this.position();
    this.showing = true;
    this.showGeneration += 1;
    const generation = this.showGeneration;
    let result;
    try {
      result = this.instance.show();
    } catch (error) {
      this.showing = false;
      this.retryAt = Date.now() + this.config.retryDelayMs;
      this.destroy();
      if (typeof console !== "undefined" && console.warn) console.warn("原生模板广告显示失败", error);
      return Promise.resolve(false);
    }
    return Promise.resolve(result).then(() => {
      if (generation !== this.showGeneration) return false;
      this.showing = false;
      if (!this.requestedVisible) {
        this.hide();
        return false;
      }
      this.shown = true;
      return true;
    }).catch((error) => {
      if (generation !== this.showGeneration) return false;
      this.showing = false;
      this.shown = false;
      this.retryAt = Date.now() + this.config.retryDelayMs;
      this.destroy();
      if (typeof console !== "undefined" && console.warn) console.warn("原生模板广告显示失败", error);
      return false;
    });
  }
  hide() {
    this.shown = false;
    this.showing = false;
    this.showGeneration += 1;
    if (!this.instance) return;
    if (typeof this.instance.hide === "function") {
      try { this.instance.hide(); } catch (error) { /* 广告隐藏失败不阻断游戏。 */ }
    }
    this.parkOffscreen();
  }
  destroy() {
    this.requestedVisible = false;
    this.showing = false;
    this.shown = false;
    this.showGeneration += 1;
    const instance = this.instance;
    this.instance = null;
    if (instance && typeof instance.hide === "function") {
      try { instance.hide(); } catch (error) { /* ignore */ }
    }
    if (instance && typeof instance.destroy === "function") {
      try { instance.destroy(); } catch (error) { /* ignore */ }
    }
  }
}
module.exports = {
  INTERSTITIAL_AD_CONFIG,
  NATIVE_TEMPLATE_AD_CONFIG,
  REWARDED_SUPPLY_AD_CONFIG,
  REWARDED_VISITOR_AD_CONFIG,
  REWARDED_FUND_AD_CONFIG,
  REWARDED_ANIMAL_AD_CONFIG,
  REWARDED_FACILITY_AD_CONFIG,
  InterstitialAdController,
  NativeTemplateAdController,
  RewardedSupplyAdController,
  describeRewardedAdFailure,
  classifyRewardedAdFailureReason,
  emergencySupplyAdStatus,
  applyEmergencySupplyReward,
  emergencyFundAdStatus,
  applyEmergencyFundReward,
  fundAdRewardFor,
  fundAdChapter,
  animalTotalAdStatus,
  applyAnimalTotalAdReward
};
