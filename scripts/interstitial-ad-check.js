const assert = require("assert");
const { INTERSTITIAL_AD_CONFIG, InterstitialAdController } = require("../js/adSystem");

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function main() {
  let now = 1_000_000;
  let closeHandler = null;
  let errorHandler = null;
  let createOptions = null;
  let showCount = 0;
  const storage = {};
  const ad = {
    onClose(handler) {
      const previous = closeHandler;
      closeHandler = () => {
        if (previous) previous();
        handler();
      };
    },
    onError(handler) { errorHandler = handler; },
    show() { showCount += 1; return Promise.resolve(); }
  };
  const runtime = {
    createInterstitialAd(options) { createOptions = options; return ad; },
    getStorageSync(key) { return storage[key]; },
    setStorageSync(key, value) { storage[key] = value; }
  };
  const controller = new InterstitialAdController(runtime, { now: () => now });

  assert.strictEqual(createOptions, null, "构造插屏控制器时不得立刻拉广告");
  assert.strictEqual(controller.shouldShow({ guardianNight: true, guardianDay: 1 }), true, "首个普通守护日应允许展示插屏");
  assert.strictEqual(createOptions, null, "探测插屏资格不得创建广告实例");
  assert.strictEqual(INTERSTITIAL_AD_CONFIG.timeCooldownMs, 125 * 1000, "任务弹窗插屏两次曝光之间必须间隔125秒");
  assert.strictEqual(INTERSTITIAL_AD_CONFIG.dailyCap, 8, "同一自然日最多8次插屏");
  assert.strictEqual(INTERSTITIAL_AD_CONFIG.minActionCount, 2, "第2次有效行动即可进入曝光");
  assert.strictEqual(INTERSTITIAL_AD_CONFIG.minActionGap, 3, "两次插屏之间至少间隔3次有效行动");
  assert.strictEqual(INTERSTITIAL_AD_CONFIG.firstGuardianDay, 1, "第1个守护日就应允许插屏");
  assert.strictEqual(INTERSTITIAL_AD_CONFIG.guardianDayCooldown, 0, "不得按守护日再额外限次");
  assert.strictEqual(controller.shouldShow({ settlement: true, guardianDay: 1, actionCount: 2, activeSeconds: 30 }), true, "前三分钟只要达到行动门槛就应进入候选");
  assert.strictEqual(controller.shouldShow({ settlement: true, guardianDay: 1, actionCount: 1 }), false, "第1次有效行动不得立刻插屏");
  assert.strictEqual(controller.shouldShow({ settlement: true, guardianDay: 2, actionCount: 5 }), true, "达到行动门槛的普通结算应进入插屏候选");
  assert.strictEqual(controller.shouldShow({ guardianNight: true, guardianDay: 2, majorMoment: true }), false, "重大剧情与突破不得被广告打断");
  assert.strictEqual(controller.shouldShow({ guardianNight: true, guardianDay: 2 }), true, "后续普通守护日仍允许展示");

  // Chapter 3+ patrols carry routine ecology narrative beats. They must not
  // disable the same ad cadence used in chapters 1-2.
  const routineEcology = new InterstitialAdController(runtime, { now: () => now });
  assert.strictEqual(routineEcology.shouldShow({ settlement: true, guardianDay: 3, actionCount: 5, breakthrough: { kind: "ecology_habitat" } }), true, "常规生态叙事不得关闭第3章插屏节奏");

  let resolved = false;
  const firstShow = controller.show({ guardianNight: true, guardianDay: 2 }).then((result) => {
    resolved = true;
    return result;
  });
  await flush();
  assert.strictEqual(createOptions && createOptions.adUnitId, "adunit-00c6bce833409f4f", "必须使用已开通的 lucky 插屏广告位");
  assert.strictEqual(showCount, 1, "合格场景应调用一次 show");
  assert.strictEqual(resolved, false, "广告关闭前不得抢先弹出后续游戏消息");
  closeHandler();
  const firstResult = await firstShow;
  assert.strictEqual(firstResult.shown, true, "关闭广告后应恢复游戏流程");
  assert.strictEqual(storage[INTERSTITIAL_AD_CONFIG.storageKey].lastGuardianDay, 2, "展示记录必须持久化，防止重启刷屏");
  assert.strictEqual(storage[INTERSTITIAL_AD_CONFIG.storageKey].lastActionCount, 0, "无行动计数的兼容调用不应写入虚假行动进度");

  const cadenceController = new InterstitialAdController(runtime, { now: () => now });
  assert.strictEqual(cadenceController.shouldShow({ settlement: true, guardianDay: 2, actionCount: 5 }), false, "时间冷却内不得连续展示");

  now += INTERSTITIAL_AD_CONFIG.timeCooldownMs + 1;
  assert.strictEqual(controller.shouldShow({ settlement: true, guardianDay: 3, actionCount: 6 }), true, "经过125秒冷却后可再次展示");
  assert.strictEqual(controller.shouldShow({ guardianNight: true, guardianDay: 2, majorMoment: true }), false, "重大剧情仍不得被广告打断");

  let cadenceNow = 2_000_000_000;
  let cadenceClose = null;
  let cadenceShows = 0;
  const cadenceAd = {
    onClose(handler) { cadenceClose = handler; },
    onError() {},
    show() { cadenceShows += 1; return Promise.resolve(); }
  };
  const cadence = new InterstitialAdController({
    createInterstitialAd() { return cadenceAd; },
    getStorageSync() { return null; },
    setStorageSync() {}
  }, { now: () => cadenceNow, config: { firstGuardianDay: 1, guardianDayCooldown: 0, minActiveSeconds: 0, timeCooldownMs: 0, minActionCount: 2, minActionGap: 3, dailyCap: 2 } });
  const showCadence = async (actionCount) => {
    const pending = cadence.show({ settlement: true, guardianDay: 1, actionCount });
    await flush();
    cadenceClose();
    return pending;
  };
  assert.strictEqual(cadence.shouldShow({ settlement: true, guardianDay: 1, actionCount: 2 }), true, "第2次有效行动可进入曝光节奏");
  await showCadence(2);
  assert.strictEqual(cadence.shouldShow({ settlement: true, guardianDay: 1, actionCount: 4 }), false, "两次行动间隔不足时不重复弹出");
  assert.strictEqual(cadence.shouldShow({ settlement: true, guardianDay: 1, actionCount: 5 }), true, "达到行动间隔后应再次进入候选");
  await showCadence(5);
  assert.strictEqual(cadenceShows, 2, "同一自然日最多展示到配置上限，不会无限刷屏");
  assert.strictEqual(cadence.shouldShow({ settlement: true, guardianDay: 1, actionCount: 8 }), false, "达到每日上限后停止展示");

  let retryClose = null;
  let retryShows = 0;
  let retryLoads = 0;
  const retryAd = {
    onClose(handler) { retryClose = handler; },
    onError() {},
    show() {
      retryShows += 1;
      return retryShows === 1 ? Promise.reject(new Error("not loaded")) : Promise.resolve();
    },
    load() { retryLoads += 1; return Promise.resolve(); }
  };
  const retryController = new InterstitialAdController({
    createInterstitialAd() { return retryAd; },
    getStorageSync() { return null; },
    setStorageSync() {}
  }, { now: () => now });
  const retryPending = retryController.show({ settlement: true, guardianDay: 1, actionCount: 2 });
  await flush();
  retryClose();
  const retryResult = await retryPending;
  assert.strictEqual(retryResult.shown, true, "首次拉取失败时应自动 load 后重试一次");
  assert.strictEqual(retryLoads, 1, "插屏失败只补一次 load，避免重复请求");

  const failingAd = {
    onClose() {},
    onError(handler) { errorHandler = handler; },
    show() { return Promise.reject(new Error("mock failure")); }
  };
  const failureController = new InterstitialAdController({
    createInterstitialAd() { return failingAd; },
    getStorageSync() { return null; },
    setStorageSync() {}
  }, { now: () => now });
  const failure = await failureController.show({ guardianNight: true, guardianDay: 1 });
  assert.strictEqual(failure.shown, false, "广告失败必须无阻断降级");

  let postShowError = null;
  const errorAfterShowAd = {
    onClose() {},
    onError(handler) { postShowError = handler; },
    show() { return Promise.resolve(); }
  };
  const errorAfterController = new InterstitialAdController({
    createInterstitialAd() { return errorAfterShowAd; },
    getStorageSync() { return null; },
    setStorageSync() {}
  }, { now: () => now + 10_000_000 });
  const errorAfterPending = errorAfterController.show({ guardianNight: true, guardianDay: 1 });
  await flush();
  assert.strictEqual(errorAfterController.showing, true, "show 成功后应进入等待关闭");
  postShowError({ errMsg: "no fill" });
  const errorAfterResult = await errorAfterPending;
  assert.strictEqual(errorAfterResult.shown, false, "展示后报错必须立刻放行，不能把按钮锁死");
  assert.strictEqual(errorAfterResult.reason, "error");
  assert.strictEqual(errorAfterController.showing, false, "报错后 showing 必须清掉");

  const timeoutAd = {
    onClose() {},
    onError() {},
    show() { return Promise.resolve(); }
  };
  const timeoutController = new InterstitialAdController({
    createInterstitialAd() { return timeoutAd; },
    getStorageSync() { return null; },
    setStorageSync() {}
  }, { now: () => now + 20_000_000, config: { showTimeoutMs: 20, timeCooldownMs: 0, minActionCount: 0, firstGuardianDay: 1, guardianDayCooldown: 0, minActiveSeconds: 0 } });
  const timeoutPending = timeoutController.show({ guardianNight: true, guardianDay: 1 });
  await flush();
  assert.strictEqual(timeoutController.showing, true, "无关闭回调时应先保持 showing");
  const timeoutResult = await timeoutPending;
  assert.strictEqual(timeoutResult.shown, false, "超时必须无阻断降级");
  assert.strictEqual(timeoutResult.reason, "timeout");
  assert.strictEqual(timeoutController.showing, false, "超时后必须恢复点击");
  assert.strictEqual(INTERSTITIAL_AD_CONFIG.showTimeoutMs, 8000, "插屏展示超时必须足够短，避免物资页假死");

  const unsupported = new InterstitialAdController({}, { now: () => now });
  assert.strictEqual(unsupported.shouldShow({ guardianNight: true, guardianDay: 9 }), false, "不支持广告API的环境不得报错");
  assert.strictEqual(typeof errorHandler, "function", "应监听广告错误事件");
  console.log("interstitial ad check ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
