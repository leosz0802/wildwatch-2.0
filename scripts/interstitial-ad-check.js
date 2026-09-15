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
    onClose(handler) { closeHandler = handler; },
    onError(handler) { errorHandler = handler; },
    show() { showCount += 1; return Promise.resolve(); }
  };
  const runtime = {
    createInterstitialAd(options) { createOptions = options; return ad; },
    getStorageSync(key) { return storage[key]; },
    setStorageSync(key, value) { storage[key] = value; }
  };
  const controller = new InterstitialAdController(runtime, { now: () => now });

  assert.strictEqual(createOptions.adUnitId, "adunit-00c6bce833409f4f", "必须使用已开通的 lucky 插屏广告位");
  assert(INTERSTITIAL_AD_CONFIG.timeCooldownMs > 2 * 60 * 1000, "任务弹窗插屏两次曝光之间必须超过2分钟");
  assert.strictEqual(controller.shouldShow({ guardianNight: true, guardianDay: 1 }), true, "新手首个守护日应允许展示插屏");
  assert.strictEqual(controller.shouldShow({ settlement: true, guardianDay: 1, actionCount: 2, activeSeconds: 59 }), false, "新用户首分钟不得展示插屏");
  assert.strictEqual(controller.shouldShow({ settlement: true, guardianDay: 1, actionCount: 2 }), true, "普通行动结算也应进入插屏候选");
  assert.strictEqual(controller.shouldShow({ guardianNight: true, guardianDay: 2, majorMoment: true }), false, "重大剧情与突破不得被广告打断");
  assert.strictEqual(controller.shouldShow({ guardianNight: true, guardianDay: 2 }), true, "第二个普通守护日应允许首次展示");

  // Chapter 3+ patrols carry routine ecology narrative beats. They must not
  // disable the same ad cadence used in chapters 1-2.
  const routineEcology = new InterstitialAdController(runtime, { now: () => now });
  assert.strictEqual(routineEcology.shouldShow({ settlement: true, guardianDay: 3, actionCount: 2, breakthrough: { kind: "ecology_habitat" } }), true, "常规生态叙事不得关闭第3章插屏节奏");

  let resolved = false;
  const firstShow = controller.show({ guardianNight: true, guardianDay: 1 }).then((result) => {
    resolved = true;
    return result;
  });
  await flush();
  assert.strictEqual(showCount, 1, "合格场景应调用一次 show");
  assert.strictEqual(resolved, false, "广告关闭前不得抢先弹出后续游戏消息");
  closeHandler();
  const firstResult = await firstShow;
  assert.strictEqual(firstResult.shown, true, "关闭广告后应恢复游戏流程");
  assert.strictEqual(storage[INTERSTITIAL_AD_CONFIG.storageKey].lastGuardianDay, 1, "展示记录必须持久化，防止重启刷屏");
  assert.strictEqual(storage[INTERSTITIAL_AD_CONFIG.storageKey].lastActionCount, 0, "无行动计数的兼容调用不应写入虚假行动进度");

  const cadenceController = new InterstitialAdController(runtime, { now: () => now });
  assert.strictEqual(cadenceController.shouldShow({ settlement: true, guardianDay: 1, actionCount: 2 }), false, "时间冷却内不得连续展示");

  now += INTERSTITIAL_AD_CONFIG.timeCooldownMs + 1;
  assert.strictEqual(controller.shouldShow({ settlement: true, guardianDay: 2, actionCount: 3 }), true, "普通结算经过时间冷却后可展示一次");
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
  }, { now: () => cadenceNow, config: { timeCooldownMs: 0, minActionGap: 3, dailyCap: 2 } });
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

  const unsupported = new InterstitialAdController({}, { now: () => now });
  assert.strictEqual(unsupported.shouldShow({ guardianNight: true, guardianDay: 9 }), false, "不支持广告API的环境不得报错");
  assert.strictEqual(typeof errorHandler, "function", "应监听广告错误事件");
  console.log("interstitial ad check ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
