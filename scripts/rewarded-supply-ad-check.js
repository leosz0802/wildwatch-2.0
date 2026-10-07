const assert = require("assert");
const { createReserveState } = require("../js/world");
const { Game } = require("../js/game");
const {
  REWARDED_SUPPLY_AD_CONFIG,
  REWARDED_FUND_AD_CONFIG,
  REWARDED_VISITOR_AD_CONFIG,
  REWARDED_ANIMAL_AD_CONFIG,
  RewardedSupplyAdController,
  describeRewardedAdFailure,
  emergencySupplyAdStatus,
  applyEmergencySupplyReward,
  emergencyFundAdStatus,
  applyEmergencyFundReward,
  animalTotalAdStatus,
  applyAnimalTotalAdReward
} = require("../js/adSystem");
const { sellFundCapStatus } = require("../js/sellFundCap");

async function main() {
  const reserve = createReserveState();
  reserve.guardianCycle.day = 1;
  reserve.supplies = { dogFood: 0, alarm: 0, tranquilizer: 0, fieldKit: 0, medicalKit: 0, evidenceTrap: 0 };
  assert(emergencySupplyAdStatus(reserve).eligible, "第一守护日物资短缺时就应开放应急包，不能展示失效入口");
  const reward = applyEmergencySupplyReward(reserve);
  assert(
    reward.ok
      && reserve.supplies.dogFood === 4
      && reserve.supplies.alarm === 2
      && reserve.supplies.tranquilizer === 2
      && reserve.supplies.fieldKit === 2
      && reserve.supplies.medicalKit === 2
      && reserve.supplies.evidenceTrap === 2,
    "应急包必须一次补齐全部六类物资"
  );
  assert(!emergencySupplyAdStatus(reserve).eligible, "库存补齐后应自动隐藏应急广告入口");
  reserve.supplies.dogFood = 0;
  reserve.supplies.alarm = 1;
  assert(emergencySupplyAdStatus(reserve).eligible, "同一天再次出现物资缺口时应允许再次观看广告");
  const repeatReward = applyEmergencySupplyReward(reserve);
  assert(repeatReward.ok && reserve.supplies.dogFood === 4 && reserve.supplies.alarm === 2, "再次观看广告也必须补齐缺口");
  assert.strictEqual(reserve.emergencySupplyAd.claimCount, 2, "应急物资广告应累计记录领取次数");

  const fundReserve = createReserveState();
  fundReserve.guardianCycle.day = 1;
  fundReserve.fund = 520;
  assert(!emergencyFundAdStatus(fundReserve).eligible, "第1守护日不能领取广告基金");
  fundReserve.guardianCycle.day = 2;
  assert(emergencyFundAdStatus(fundReserve).eligible, "第2守护日应开放广告基金");
  const fundReward = applyEmergencyFundReward(fundReserve);
  assert(fundReward.ok && fundReward.amount === 1000 && fundReserve.fund === 1520, "第1章完整观看后必须按章节补充至少1000星币");
  const secondFundReward = applyEmergencyFundReward(fundReserve);
  const thirdFundReward = applyEmergencyFundReward(fundReserve);
  const fourthFundReward = applyEmergencyFundReward(fundReserve);
  assert(secondFundReward.ok && secondFundReward.amount === 1000 && thirdFundReward.ok && thirdFundReward.amount === 1000, "同一天最多领取3次章节定额基金");
  assert(!fourthFundReward.ok && fourthFundReward.reason === "daily_cap", "第4次基金广告必须被挡住");
  assert.strictEqual(fundReserve.emergencyFundAd.claimCount, 3, "基金广告应累计记录领取次数");
  assert.strictEqual(fundReserve.emergencyFundAd.claimCountToday, 3, "基金广告应记录当日领取次数");
  assert.strictEqual(fundReserve.emergencyFundAd.lastReward.before, 2520, "最近一次奖励应记录发放前基金");
  assert.strictEqual(fundReserve.emergencyFundAd.lastReward.after, 3520, "最近一次奖励应记录发放后基金");

  [
    { chapter: 1, before: 520, expected: 1000 },
    { chapter: 1, before: 15000, expected: 1000 },
    { chapter: 5, before: 15000, expected: 1000 }
  ].forEach(({ chapter, before, expected }) => {
    const caseReserve = createReserveState();
    caseReserve.guardianCycle.day = 2;
    caseReserve.progression = Object.assign({}, caseReserve.progression || {}, { stage: chapter, displayChapter: chapter });
    caseReserve.fund = before;
    const status = emergencyFundAdStatus(caseReserve);
    assert.strictEqual(status.reward, expected, `第${chapter}章基金 ${before} 的广告预览奖励错误`);
    const reward = applyEmergencyFundReward(caseReserve);
    assert(reward.ok && reward.amount === expected && reward.before === before && reward.after === before + expected, `第${chapter}章基金 ${before} 的广告奖励计算错误`);
  });
  assert.strictEqual(REWARDED_FUND_AD_CONFIG.adUnitId, REWARDED_SUPPLY_AD_CONFIG.adUnitId, "基金与物资应共用已开通的激励视频广告位");
  assert(REWARDED_SUPPLY_AD_CONFIG.showTimeoutMs >= 90000, "基金与物资广告看门狗必须覆盖真机常见的35–60秒视频，不能10秒提前判失败");
  assert.strictEqual(REWARDED_VISITOR_AD_CONFIG.adUnitId, "adunit-87d5ca86e895053e", "游客招募必须使用指定的激励视频广告位");
  assert(REWARDED_VISITOR_AD_CONFIG.showTimeoutMs >= 90000, "游客招募广告看门狗必须覆盖真机常见的35–60秒视频，不能10秒提前判失败");
  assert.strictEqual(REWARDED_ANIMAL_AD_CONFIG.adUnitId, "adunit-a74d65c9384d70b7", "幸运迁入必须使用指定的激励视频广告位");
  assert(REWARDED_ANIMAL_AD_CONFIG.showTimeoutMs >= 90000, "幸运迁入广告看门狗必须覆盖真机常见的35–60秒视频，不能10秒提前判失败");
  assert(/真机体验版/.test(describeRewardedAdFailure({
    completed: false,
    reason: "no_fill",
    error: "广告加载失败 -13011 no point expt"
  })), "微信实验未命中必须提示真机体验版，不能伪装成游戏把广告关掉");
  assert.strictEqual(describeRewardedAdFailure({ reason: "closed_early" }), "", "中途关闭应由各入口自己说明，不走通用失败文案");

  const detailReserve = createReserveState();
  detailReserve.guardianCycle.day = 2;
  detailReserve.fund = 520;
  const detailGame = Object.create(Game.prototype);
  detailGame.state = { world: { reserve: detailReserve } };
  const detail = detailGame.buildReserveMetricDetail("fund");
  assert.strictEqual(detail.adPlacement, "fund_detail_footer", "广告入口应固定在保护基金详情底部操作区");
  assert.strictEqual(detail.adReward, 1000, "保护基金详情必须明确展示章节定额奖励");
  assert(/看广告/.test(detail.actionLabel) && /1000/.test(detail.actionLabel) && typeof detail.action === "function", "基金不足时详情底部必须出现可点击广告按钮");
  assert.deepStrictEqual(detail.items.map((item) => item.tag), ["来源", "用途", "明细"], "基金详情应提供可点击的收支明细入口");
  assert.strictEqual(typeof detail.items[2].action, "function", "收支明细入口必须绑定点击动作");
  const visibleDetailCopy = [detail.kicker, detail.title, detail.footer, detail.actionLabel]
    .concat(detail.items.flatMap((item) => [item.tag, item.title, item.body]))
    .join(" ");
  assert.strictEqual((visibleDetailCopy.match(/\+1000/g) || []).length, 1, "广告奖励额度在弹窗中只能出现一次");

  detailReserve.fund = 15000;
  const highFundDetail = detailGame.buildReserveMetricDetail("fund");
  assert.strictEqual(highFundDetail.adReward, 1000, "高基金详情必须仍按章节定额发奖，不能按余额抽成");
  assert(/看广告/.test(highFundDetail.actionLabel) && /1000/.test(highFundDetail.actionLabel), "高基金仍应显示限次广告入口和章节定额");
  assert(/每天最多3次/.test(highFundDetail.footer), "基金详情必须说明每天最多3次");

  const failedFundReserve = createReserveState();
  failedFundReserve.guardianCycle.day = 2;
  failedFundReserve.fund = 520;
  const failedFundGame = Object.create(Game.prototype);
  failedFundGame.state = { world: { reserve: failedFundReserve } };
  failedFundGame.rewardedSupplyAds = { show: () => Promise.resolve({ completed: false, reason: "closed_early" }) };
  failedFundGame.toast = () => {};
  failedFundGame.claimEmergencyFundAd();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(failedFundReserve.fund, 520, "广告未完整观看时不得增加保护基金");
  failedFundGame.rewardedSupplyAds = { show: () => Promise.resolve({ completed: false, reason: "error" }) };
  failedFundGame.claimEmergencyFundAd();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(failedFundReserve.fund, 520, "广告加载失败时不得增加保护基金");

  // Android 看广告时可能切后台，微信会用存档重建 state。物资和基金
  // 必须写入重建后的 reserve，不能沿用广告打开前的旧引用。
  const staleSupplyReserve = createReserveState();
  const reloadedSupplyReserve = createReserveState();
  staleSupplyReserve.guardianCycle.day = 1;
  reloadedSupplyReserve.guardianCycle.day = 1;
  staleSupplyReserve.supplies = { dogFood: 0, alarm: 0, tranquilizer: 0, fieldKit: 0, medicalKit: 0, evidenceTrap: 0 };
  reloadedSupplyReserve.supplies = { dogFood: 0, alarm: 0, tranquilizer: 0, fieldKit: 0, medicalKit: 0, evidenceTrap: 0 };
  const supplyGame = Object.create(Game.prototype);
  supplyGame.state = { world: { reserve: staleSupplyReserve } };
  supplyGame.rewardedSupplyAds = { show: () => Promise.resolve({ completed: true, reason: "completed" }) };
  supplyGame.toast = () => {};
  supplyGame.playSfx = () => {};
  supplyGame.render = () => {};
  supplyGame.claimEmergencySupplyAd();
  supplyGame.state = { world: { reserve: reloadedSupplyReserve } };
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(staleSupplyReserve.supplies.dogFood, 0, "切后台重建 state 后不得把物资奖励写入旧 reserve");
  assert.strictEqual(reloadedSupplyReserve.supplies.dogFood, 4, "应急物资广告必须补齐当前 state 的狗粮");
  assert.strictEqual(reloadedSupplyReserve.supplies.alarm, 2, "应急物资广告必须补齐当前 state 的警报器");
  assert.strictEqual(reloadedSupplyReserve.supplies.evidenceTrap, 2, "应急物资广告必须补齐当前 state 的诱迹机关");

  const staleFundReserve = createReserveState();
  const reloadedFundReserve = createReserveState();
  staleFundReserve.guardianCycle.day = 2;
  reloadedFundReserve.guardianCycle.day = 2;
  staleFundReserve.fund = 520;
  reloadedFundReserve.fund = 520;
  const fundGame = Object.create(Game.prototype);
  fundGame.state = { world: { reserve: staleFundReserve } };
  fundGame.rewardedSupplyAds = { show: () => Promise.resolve({ completed: true, reason: "completed" }) };
  fundGame.toast = () => {};
  fundGame.playSfx = () => {};
  fundGame.render = () => {};
  fundGame.infoDetailModal = null;
  fundGame.screen = "map";
  fundGame.claimEmergencyFundAd();
  fundGame.state = { world: { reserve: reloadedFundReserve } };
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(staleFundReserve.fund, 520, "切后台重建 state 后不得把基金奖励写入旧 reserve");
  assert.strictEqual(reloadedFundReserve.fund, 1520, "基金广告必须把奖励写入当前 state");

  const staleSellReserve = createReserveState();
  const reloadedSellReserve = createReserveState();
  [staleSellReserve, reloadedSellReserve].forEach((item) => {
    item.guardianCycle.day = 3;
    item.progression = Object.assign({}, item.progression || {}, { stage: 1, displayChapter: 1 });
    item.inventory = { researchSample: 1 };
    item.dailySellFund = {
      version: 1,
      lastGuardianDay: 3,
      lastChapter: 1,
      soldFund: 0,
      soldTimes: 2,
      unlockedBatches: 2,
      unlockClaimCount: 0,
      unlockClaimCountToday: 0,
      lastUnlock: null
    };
  });
  const sellGame = Object.create(Game.prototype);
  sellGame.state = { world: { reserve: staleSellReserve } };
  sellGame.infoDetailModal = { preferredId: "" };
  sellGame.rewardedSupplyAds = { show: () => Promise.resolve({ completed: true, reason: "completed" }) };
  sellGame.toast = () => {};
  sellGame.playSfx = () => {};
  sellGame.openRecoveredChoice = () => {};
  sellGame.render = () => {};
  sellGame.recoveredGoodsCount = (inventory) => Object.values(inventory || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  sellGame.claimSellUnlockAd();
  sellGame.state = { world: { reserve: reloadedSellReserve } };
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(staleSellReserve.dailySellFund.unlockedBatches, 2, "切后台重建 state 后不得把出售解锁写入旧 reserve");
  assert.strictEqual(sellFundCapStatus(reloadedSellReserve).batches, 4, "一次完播广告必须为当前 state 增加2次出售");
  assert.strictEqual(sellFundCapStatus(reloadedSellReserve).freeSellsLeft, 2, "出售解锁广告完成后应立即恢复2次可出售额度");

  let closeHandler;
  let errorHandler;
  let showCount = 0;
  const ad = {
    onClose(handler) { closeHandler = handler; }, offClose() {}, onError(handler) { errorHandler = handler; }, offError() {},
    show() { showCount += 1; return showCount === 1 ? Promise.reject(new Error("retry")) : Promise.resolve(); },
    load() { return Promise.resolve(); }
  };
  let options;
  const controller = new RewardedSupplyAdController({ createRewardedVideoAd(value) { options = value; return ad; } });
  assert(controller.available(), "已创建的激励视频广告位应报告为可用");
  assert.strictEqual(options.adUnitId, REWARDED_SUPPLY_AD_CONFIG.adUnitId);
  assert.strictEqual(typeof errorHandler, "function", "激励视频实例创建后必须立即绑定拉取异常处理");
  const completed = controller.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  closeHandler({ isEnded: true });
  assert((await completed).completed && showCount === 2, "广告应在加载后重试并仅在完播时成功");

  const early = controller.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  closeHandler({ isEnded: false });
  assert(!(await early).completed, "中途关闭不得发放物资");

  const missingCloseResult = controller.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  closeHandler();
  assert((await missingCloseResult).completed, "Android兼容层完播可能缺少 isEnded，不能因此吞掉奖励");

  const failed = controller.show();
  errorHandler({ errMsg: "mock preload error" });
  const failedResult = await failed;
  assert(!failedResult.completed && failedResult.reason === "error", "拉取异常必须结束展示流程且不得发放物资");

  let timeoutClose;
  const timeoutAd = {
    onClose(handler) { timeoutClose = handler; },
    offClose() {},
    onError() {},
    show() { return Promise.resolve(); }
  };
  const timeoutController = new RewardedSupplyAdController({
    createRewardedVideoAd() { return timeoutAd; }
  }, { config: { showTimeoutMs: 5 } });
  const timedOut = timeoutController.show();
  const timedOutResult = await timedOut;
  assert(!timedOutResult.completed && timedOutResult.reason === "timeout", "原生层不回调时必须自动解锁并判定未完播");
  assert.strictEqual(timeoutController.showing, false, "广告超时后不得继续锁定游戏输入");
  timeoutClose && timeoutClose({ isEnded: true });

  let teardownClose;
  let destroyCount = 0;
  const teardownAd = {
    onClose(handler) { teardownClose = handler; },
    offClose() {},
    onError() {},
    destroy() { destroyCount += 1; },
    show() { return Promise.resolve(); }
  };
  let createCount = 0;
  const teardownController = new RewardedSupplyAdController({
    createRewardedVideoAd() { createCount += 1; return teardownAd; }
  });
  const teardownShow = teardownController.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  teardownClose({ isEnded: true });
  assert((await teardownShow).completed, "微信关片报错前必须先按完播发奖");
  await new Promise((resolve) => setTimeout(resolve, 140));
  assert.strictEqual(destroyCount, 0, "正常完播不得拆掉激励视频实例，否则微信同一广告位第二次会显示广告不可用");
  assert(teardownController.instance, "完播后必须复用原实例");
  const replayShow = teardownController.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  teardownClose({ isEnded: true });
  assert((await replayShow).completed, "同一激励视频实例必须能连续完播发奖");
  assert.strictEqual(createCount, 1, "同一广告位只能创建一次激励视频实例");

  const iosCloseGame = Object.create(Game.prototype);
  iosCloseGame.info = { platform: "ios", system: "iOS 17.5" };
  iosCloseGame.nativeTemplateAds = { setVisible() {} };
  iosCloseGame.gameClub = { setVisible() {} };
  iosCloseGame.parkIdleOpenDataOverlay = () => true;
  iosCloseGame.scheduleIdleOpenDataPark = () => true;
  iosCloseGame.rewardedAdsByUnit = {};
  let iosDismissed = 0;
  let otherDismissed = 0;
  iosCloseGame.rewardedSupplyAds = {
    hideNativeSurface() {},
    dismissLeftoverSurface() { otherDismissed += 1; return true; }
  };
  iosCloseGame.afterRewardedVideoClose({
    hideNativeSurface() {},
    dismissLeftoverSurface() { iosDismissed += 1; return true; }
  });
  assert.strictEqual(iosDismissed, 0, "iOS 关片后不得销毁刚播完的激励视频，否则下一次报 video-ad has been destroyed");
  assert.strictEqual(otherDismissed, 0, "iOS 关片后不得销毁其他激励视频");

  const androidCloseGame = Object.create(Game.prototype);
  androidCloseGame.info = { platform: "android", system: "Android 14" };
  androidCloseGame.nativeTemplateAds = { setVisible() {} };
  androidCloseGame.gameClub = { setVisible() {} };
  androidCloseGame.parkIdleOpenDataOverlay = () => true;
  androidCloseGame.scheduleIdleOpenDataPark = () => true;
  androidCloseGame.rewardedAdsByUnit = {};
  let androidDismissed = 0;
  let androidHidden = 0;
  androidCloseGame.afterRewardedVideoClose({
    hideNativeSurface() { androidHidden += 1; return true; },
    dismissLeftoverSurface() { androidDismissed += 1; return true; }
  });
  assert.strictEqual(androidHidden, 0, "Android 关片后不得 hide 激励视频，否则会弹广告不可用并挡住射箭");
  assert.strictEqual(androidDismissed, 0, "Android 关片后必须保留激励视频实例以便第二次播放");

  let androidSiblingDismissed = 0;
  androidCloseGame.rewardedSupplyAds = {
    dismissLeftoverSurface() { androidSiblingDismissed += 1; return true; }
  };
  androidCloseGame.afterRewardedVideoClose({
    hideNativeSurface() { androidHidden += 1; return true; },
    dismissLeftoverSurface() { androidDismissed += 1; return true; }
  });
  assert.strictEqual(androidDismissed, 0, "Android 关片后仍不得拆刚播完的激励视频");
  assert.strictEqual(androidSiblingDismissed, 0, "Android 没有共享播放器故障，关片后不得拆其他激励视频");

  const androidRuntime = {
    getDeviceInfo() { return { platform: "android", system: "Android 14" }; },
    createRewardedVideoAd() { return androidPlacement; }
  };
  let androidLoads = 0;
  let androidShows = 0;
  let androidClose;
  const androidPlacement = {
    onClose(handler) { androidClose = handler; },
    offClose() {},
    onError() {},
    load() { androidLoads += 1; return Promise.resolve(); },
    show() { androidShows += 1; return Promise.resolve(); },
    destroy() { throw new Error("Android 不得销毁激励视频实例"); }
  };
  const androidController = new RewardedSupplyAdController(androidRuntime);
  assert(androidController.available() && androidController.instance, "Android 仍应提前创建并复用激励视频实例");
  const androidShow = androidController.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(androidLoads, 0, "Android 第一次播放不得先 load，避免打乱现有重试");
  assert.strictEqual(androidShows, 1, "Android 第一次播放应直接 show");
  androidClose({ isEnded: true });
  assert((await androidShow).completed, "Android 完播发奖逻辑保持不变");
  assert.strictEqual(androidController.instance, androidPlacement, "Android 完播后必须继续复用原实例");

  let echoedClose;
  let echoedShows = 0;
  const echoedController = new RewardedSupplyAdController({
    getDeviceInfo() { return { platform: "android", system: "Android 14" }; },
    createRewardedVideoAd() {
      return {
        onClose(handler) { echoedClose = handler; },
        offClose() {},
        onError() {},
        show() {
          echoedShows += 1;
          if (echoedClose) echoedClose({ isEnded: true });
          queueMicrotask(() => echoedClose({ isEnded: true }));
          return Promise.resolve();
        },
        destroy() { throw new Error("Android 不得销毁激励视频实例"); }
      };
    }
  }, { config: { adUnitId: "adunit-replay-close", showTimeoutMs: 3000 } });
  const echoedShow = echoedController.show();
  let echoedSettled = null;
  echoedShow.then((result) => { echoedSettled = result; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(echoedSettled, null, "show 瞬间回放的上一次完播不得当成这次观看");
  assert.strictEqual(echoedController.showing, true, "回放的完播不得提前结束这次播放");
  echoedClose({ isEnded: true });
  assert((await echoedShow).completed, "回放之后的真正完播仍然发奖");
  assert.strictEqual(echoedShows, 1, "回放完播不得触发第二次 show");

  function iosRuntime(create) {
    return {
      getDeviceInfo() { return { platform: "ios", system: "iOS 17.5" }; },
      createRewardedVideoAd: create
    };
  }
  let iosCreate = 0;
  const iosRuntimeProbe = iosRuntime(() => { iosCreate += 1; return { onError() {} }; });
  const iosProbe = new RewardedSupplyAdController(iosRuntimeProbe, { config: { adUnitId: "adunit-probe" } });
  assert(iosProbe.available(), "iOS 有激励视频接口时入口应保持可点");
  assert.strictEqual(iosProbe.instance, null, "iOS 不得在点击前创建实例，否则会占住共享播放器");
  assert.strictEqual(iosCreate, 0, "iOS available 不得提前 createRewardedVideoAd");

  let iosLoads = 0;
  let iosShows = 0;
  let iosClose;
  let iosErrors = [];
  let firstIosError = null;
  const iosAds = [];
  const iosController = new RewardedSupplyAdController(iosRuntime(() => {
    const ad = {
      onClose(handler) { iosClose = handler; },
      offClose() {},
      onError(handler) {
        iosErrors.push(handler);
        if (!firstIosError) firstIosError = handler;
      },
      load() {
        iosLoads += 1;
        if (iosClose) iosClose({ isEnded: false });
        return Promise.resolve();
      },
      show() { iosShows += 1; return Promise.resolve(); },
      destroy() { ad.destroyed = true; }
    };
    iosAds.push(ad);
    return ad;
  }), { config: { adUnitId: "adunit-ios-next", showTimeoutMs: 1000 } });
  const iosFirst = iosController.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(iosLoads, 1, "iOS 新实例必须先 load 再 show");
  assert.strictEqual(iosShows, 1, "iOS load 成功后应立刻 show");
  iosClose({ isEnded: true });
  assert((await iosFirst).completed, "iOS 预加载期间的假关闭不得吞掉随后的完播");
  iosController.dismissLeftoverSurface();
  assert(!iosAds[0].destroyed, "iOS 关片后不得 destroy，否则下一次报 video-ad has been destroyed");
  assert.strictEqual(iosController.instance, iosAds[0], "关片后必须保留原激励视频实例");
  const loadsAfterClose = iosLoads;
  const iosSecond = iosController.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  firstIosError({ errMsg: "operateVideoPlayer:fail:internal error" });
  firstIosError({ errMsg: "show:fail 广告不可用" });
  iosClose({ isEnded: true });
  assert((await iosSecond).completed, "上一条广告销毁后的报错不得让下一条激励视频不可用");
  assert.strictEqual(iosAds.length, 1, "下一条广告必须复用原实例，不能再 create 一个已销毁对象");
  assert(iosLoads > loadsAfterClose, "复用前必须重新 load");

  let phantomShows = 0;
  let phantomClose;
  const phantomController = new RewardedSupplyAdController(iosRuntime(() => ({
    onClose(handler) { phantomClose = handler; },
    offClose() {},
    onError() {},
    load() { return Promise.resolve(); },
    show() {
      phantomShows += 1;
      if (phantomShows === 1 && phantomClose) phantomClose({ isEnded: false });
      return Promise.resolve();
    },
    destroy() {}
  })), { config: { adUnitId: "adunit-phantom", showTimeoutMs: 3000 } });
  const phantomPromise = phantomController.show();
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert(phantomShows >= 2, "iOS 在 show 瞬间收到 isEnded:false 时必须重开，不能当成观众中途关闭");
  phantomClose({ isEnded: true });
  assert((await phantomPromise).completed, "iOS 重开后的完播必须发奖");

  let errorShows = 0;
  let errorClose;
  let iosErrorHandler;
  let errorSettled = null;
  const errorController = new RewardedSupplyAdController(iosRuntime(() => ({
    onClose(handler) { errorClose = handler; },
    offClose() {},
    onError(handler) { iosErrorHandler = handler; },
    load() { return Promise.resolve(); },
    show() {
      errorShows += 1;
      if (errorShows === 1 && iosErrorHandler) iosErrorHandler({ errMsg: "show:fail 广告不可用" });
      return Promise.resolve();
    },
    destroy() {}
  })), { config: { adUnitId: "adunit-ios-error", showTimeoutMs: 3000 } });
  const errorPromise = errorController.show();
  errorPromise.then((result) => { errorSettled = result; });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.strictEqual(errorSettled, null, "iOS 播放器报错不得立刻结束，否则下一条广告会显示不可用");
  await new Promise((resolve) => setTimeout(resolve, 500));
  errorClose({ isEnded: true });
  assert((await errorPromise).completed, "iOS 播放器报错后重开并完播必须发奖");

  let destroyedCreates = 0;
  let destroyedShows = 0;
  let destroyedDestroy = 0;
  let destroyedClose;
  const destroyedController = new RewardedSupplyAdController(iosRuntime(() => {
    destroyedCreates += 1;
    const generation = destroyedCreates;
    return {
      onClose(handler) { destroyedClose = handler; },
      offClose() {},
      onError() {},
      load() { return Promise.resolve(); },
      show() {
        destroyedShows += 1;
        if (generation === 1) return Promise.reject(new Error("video-ad has been destroyed"));
        return Promise.resolve();
      },
      destroy() { destroyedDestroy += 1; }
    };
  }), { config: { adUnitId: "adunit-destroyed", showTimeoutMs: 3000 } });
  const destroyedPromise = destroyedController.show();
  await new Promise((resolve) => setTimeout(resolve, 500));
  assert.strictEqual(destroyedDestroy, 0, "video-ad has been destroyed 时不得再调用 destroy");
  assert(destroyedCreates >= 2, "已销毁实例必须换成新的激励视频再播放");
  destroyedClose({ isEnded: true });
  assert((await destroyedPromise).completed, "换新实例并完播后必须发奖");

  let lateClose;
  let lateRejectShow;
  let lateShowCount = 0;
  let lateLoadCount = 0;
  const lateAd = {
    onClose(handler) { lateClose = handler; },
    offClose() {},
    onError() {},
    show() {
      lateShowCount += 1;
      return new Promise((_, reject) => { lateRejectShow = reject; });
    },
    load() { lateLoadCount += 1; return Promise.resolve(); }
  };
  const lateController = new RewardedSupplyAdController({
    createRewardedVideoAd() { return lateAd; }
  });
  const lateShow = lateController.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  lateClose({ isEnded: true });
  assert((await lateShow).completed, "Android 关片 Promise 拒掉前必须先按完播发奖");
  lateRejectShow(new Error("show:fail 广告不可用"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(lateShowCount, 1, "关片后不得再 show，否则微信会弹广告不可用并挡住射箭判定");
  assert.strictEqual(lateLoadCount, 0, "关片后的 show 失败不得立刻再 load+show");

  let playedShows = 0;
  let playedLoads = 0;
  let playedClose;
  let playedError;
  const playedController = new RewardedSupplyAdController({
    getDeviceInfo() { return { platform: "android", system: "Android 14" }; },
    createRewardedVideoAd() {
      return {
        onClose(handler) { playedClose = handler; },
        offClose() {},
        onError(handler) { playedError = handler; },
        load() { playedLoads += 1; return Promise.resolve(); },
        show() { playedShows += 1; return Promise.resolve(); },
        destroy() { throw new Error("Android 不得销毁激励视频实例"); }
      };
    }
  }, { config: { adUnitId: "adunit-played-teardown", showTimeoutMs: 5000 } });
  const playedShow = playedController.show();
  await new Promise((resolve) => setTimeout(resolve, 1600));
  playedError({ errMsg: "show:fail 广告不可用" });
  playedClose({ isEnded: true });
  assert((await playedShow).completed, "看完后的广告不可用不得当成未完播，否则会提示广告暂时不可用");
  assert.strictEqual(playedShows, 1, "看完后的广告不可用不得再打开一层激励视频");
  assert.strictEqual(playedLoads, 0, "看完后的广告不可用不得再 load");
  assert.strictEqual(playedController.showing, false, "看完后的报错必须放开界面，确认按钮才能继续点");

  let echoShows = 0;
  let echoLoads = 0;
  let echoClose;
  const echoController = new RewardedSupplyAdController({
    getDeviceInfo() { return { platform: "android", system: "Android 14" }; },
    createRewardedVideoAd() {
      return {
        onClose(handler) { echoClose = handler; },
        offClose() {},
        onError() {},
        load() { echoLoads += 1; return Promise.resolve(); },
        show() {
          echoShows += 1;
          if (echoShows > 1) {
            if (echoClose) echoClose({ isEnded: true });
            return Promise.reject(new Error("show:fail 广告不可用"));
          }
          return Promise.resolve();
        },
        destroy() { throw new Error("Android 不得销毁激励视频实例"); }
      };
    }
  }, { config: { adUnitId: "adunit-echo-unavailable", showTimeoutMs: 3000 } });
  const echoFirst = echoController.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  echoClose({ isEnded: true });
  assert((await echoFirst).completed, "第一次完播仍要发奖");
  const echoSecond = await echoController.show();
  assert.strictEqual(echoShows, 2, "失败的下一次点击不得在内部再 show 一次");
  assert.strictEqual(echoLoads, 0, "重放完播后的广告不可用不得再 load+show");
  assert.strictEqual(echoSecond.completed, false, "重放的上一次完播不得再记一次奖励");
  assert.strictEqual(echoSecond.reason, "closed_surface", "重放完播后的广告不可用不得提示广告暂时不可用");
  assert.strictEqual(echoController.showing, false, "这次失败必须立刻结束，不能把确认按钮盖住");
  assert.strictEqual(describeRewardedAdFailure(echoSecond), "", "重放完播的失败文案必须为空");

  const unavailableToasts = [];
  const unavailableGame = Object.create(Game.prototype);
  unavailableGame.toast = (message) => { unavailableToasts.push(String(message || "")); };
  unavailableGame.toastRewardedAdFailure({ completed: false, reason: "closed_surface", error: "show:fail 广告不可用" }, "完整观看后才能领取物资");
  unavailableGame.toastRewardedAdFailure({ completed: false, reason: "error", error: "show:fail 广告不可用" }, "完整观看后才能领取物资");
  assert.deepStrictEqual(unavailableToasts, ["广告暂时不可用，请稍后再试"], "只有真正没播出来时才提示广告暂时不可用");

  let surfaceClose;
  let surfaceError;
  let surfaceLoad = 0;
  let surfaceDestroy = 0;
  let surfaceCreate = 0;
  const surfaceAd = {
    onClose(handler) { surfaceClose = handler; },
    offClose() {},
    onError(handler) { surfaceError = handler; },
    load() { surfaceLoad += 1; return Promise.resolve(); },
    destroy() { surfaceDestroy += 1; },
    show() { return Promise.resolve(); }
  };
  const surfaceController = new RewardedSupplyAdController({
    createRewardedVideoAd() { surfaceCreate += 1; return surfaceAd; }
  });
  const surfaceShow = surfaceController.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  surfaceError({ errno: 102, errMsg: "getVolume:fail:access denied, appId=wx0ad30effd406ea13" });
  surfaceClose({ isEnded: true });
  assert((await surfaceShow).completed, "播放中 getVolume 被拒不得当成未完播");
  surfaceError({ errno: 4, errMsg: "operateVideoPlayer:fail:internal error" });
  await new Promise((resolve) => setTimeout(resolve, 140));
  assert.strictEqual(surfaceLoad, 0, "关片后不得再 load 同一播放器，避免 operateVideoPlayer 未处理 Promise");
  assert.strictEqual(surfaceDestroy, 0, "getVolume/operateVideoPlayer 不得拆掉激励视频，否则 Android 会弹广告不可用并挡住射箭");
  assert(surfaceController.instance, "完播后必须复用原实例");
  const surfaceReplay = surfaceController.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  surfaceClose({ isEnded: true });
  assert((await surfaceReplay).completed, "getVolume 噪音后同一实例必须还能再播");
  assert.strictEqual(surfaceCreate, 1, "同一广告位只能创建一次激励视频实例");

  let fillClose;
  let fillError;
  const fillController = new RewardedSupplyAdController({
    getDeviceInfo() { return { platform: "android", system: "Android 14" }; },
    createRewardedVideoAd() {
      return {
        onClose(handler) { fillClose = handler; },
        offClose() {},
        onError(handler) { fillError = handler; },
        load() { return Promise.resolve(); },
        show() { return Promise.resolve(); },
        destroy() { throw new Error("Android 不得销毁激励视频实例"); }
      };
    }
  }, { config: { adUnitId: "adunit-nofill-during-play", showTimeoutMs: 5000 } });
  const fillShow = fillController.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  fillError({ errCode: -13011, errMsg: "no point expt" });
  fillClose({ isEnded: true });
  const fillResult = await fillShow;
  assert(fillResult.completed, "播放中的 -13011 不得取消已经看完的奖励");
  assert.notStrictEqual(fillResult.reason, "no_fill", "播放中的 -13011 不得提示没有可播放的广告");

  const gameSource = require("fs").readFileSync(require.resolve("../js/game"), "utf8");
  assert(gameSource.includes("看广告再出售 2 次"), "出售解锁入口必须明确显示一次广告增加2次出售");
  assert(gameSource.includes("看广告解锁2次"), "出售弹窗主按钮必须明确显示一次广告增加2次出售");
  assert(gameSource.includes("afterRewardedVideoClose("), "激励视频关闭后必须清掉可能挡住沙盘的原生层");
  assert(gameSource.includes("flushBlockingNativeOverlays("), "关片和弹窗必须统一清掉挡住按钮的原生层");
  assert(!gameSource.includes("dismissLeftoverSurface("), "关片后不得销毁激励视频，否则 iOS 下一次报 video-ad has been destroyed");
  assert(gameSource.includes("video-ad has been destroyed"), "关片路径必须写明不得销毁激励视频");
  assert(!/hideNativeSurface\(/.test(gameSource), "关片和弹窗不得 hide 激励视频，否则 Android 会弹广告不可用并挡住射箭");
  assert(!/releaseVideoSurface\(\)/.test(gameSource), "关片后不得拆掉全部激励视频实例，否则第二次会显示广告不可用");
  assert(gameSource.includes("this.rewardedVideoBusy"), "关片点击不得再次拉起激励视频，否则播放器会盖住沙盘直到超时");
  assert(gameSource.includes("this.rewardedResumeUntil"), "激励视频返回后，播放器补发的 onHide 不得停掉主循环");
  assert(gameSource.includes("bindRewardedAdResult("), "激励视频结果必须接住微信关片 Promise，避免未处理警告");
  assert(gameSource.includes("this.bindRewardedAdResult(animalAd,"), "幸运迁入完播后必须走关片清理");
  assert(gameSource.includes("this.rewardedVisitorAds = this.rewardedAdFor(REWARDED_VISITOR_AD_CONFIG)"), "游客激励视频必须随延迟运行时服务提前初始化");
  assert(gameSource.includes("this.rewardedAnimalAds = this.rewardedAdFor(REWARDED_ANIMAL_AD_CONFIG)"), "动物总数激励视频必须随延迟运行时服务提前初始化");
  assert.strictEqual(REWARDED_ANIMAL_AD_CONFIG.adUnitId, "adunit-a74d65c9384d70b7", "动物总数必须使用指定的激励视频广告位");

  const animalReserve = createReserveState();
  const { livingAnimalTotal } = require("../js/chapterRescueSystem");
  const { chapterAnimalTotal } = require("../js/chapterTargets");
  const animalBefore = livingAnimalTotal(animalReserve);
  assert(animalTotalAdStatus(animalReserve).eligible, "动物总数广告进入章节时应可看");
  assert.strictEqual(animalTotalAdStatus(animalReserve).remaining, 4, "动物总数广告每章最多四次");
  const lowAnimal = applyAnimalTotalAdReward(animalReserve, () => 0);
  assert(lowAnimal.ok && lowAnimal.percent === 5, "完播后应按 5% 下限增加动物");
  assert.strictEqual(lowAnimal.amount, Math.max(1, Math.round(animalBefore * 0.05)), "5% 奖励数量必须按当前动物总数计算");
  assert.strictEqual(livingAnimalTotal(animalReserve), animalBefore + lowAnimal.amount, "完播后动物总数必须真实增加");
  assert.strictEqual(require("../js/animalSourceLedger").animalSourceSummary(animalReserve).advertised, lowAnimal.amount, "幸运迁入必须记入广告来源");
  assert.strictEqual(require("../js/animalSourceLedger").animalSourceSummary(animalReserve).returned, 0, "广告不得记入迁入/繁殖");
  assert.strictEqual(require("../js/animalSourceLedger").animalSourceSummary(animalReserve).growth, 0, "广告不得记入繁殖剩余");
  const highAnimalReserve = createReserveState();
  const highBefore = livingAnimalTotal(highAnimalReserve);
  const highAnimal = applyAnimalTotalAdReward(highAnimalReserve, () => 0.99);
  assert(highAnimal.ok && highAnimal.percent === 10, "完播后应按 10% 上限增加动物");
  assert.strictEqual(highAnimal.amount, Math.max(1, Math.round(highBefore * 0.10)), "10% 奖励数量必须按当前动物总数计算");
  const inflated = createReserveState();
  inflated.progression = Object.assign({}, inflated.progression || {}, { stage: 9, displayChapter: 9 });
  inflated.chapterAnimalCarryover = { stage: 9, fromTotal: 5000, inherited: 5000, strategyVersion: 2, legacyCompleteSeed: true };
  const inflatedLiving = livingAnimalTotal(inflated);
  const inflatedReward = applyAnimalTotalAdReward(inflated, () => 0.99);
  assert(inflatedReward.ok && inflatedReward.before === inflatedLiving, "幸运迁入必须按当前存栏，不得用章节继承总数");
  assert.ok(inflatedReward.amount <= Math.max(1, Math.floor(inflatedLiving * 0.10)), "幸运迁入不得超过当前存栏10%");
  assert.ok(chapterAnimalTotal(inflated) > inflatedLiving, "章节继承总数偏高时仍只能按存栏发奖");
  assert(applyAnimalTotalAdReward(animalReserve, () => 0.5).ok, "同一章应允许看第二次动物广告");
  assert(applyAnimalTotalAdReward(animalReserve, () => 0.5).ok, "同一章应允许看第三次动物广告");
  assert(applyAnimalTotalAdReward(animalReserve, () => 0.5).ok, "同一章应允许看第四次动物广告");
  const fifthWatch = applyAnimalTotalAdReward(animalReserve, () => 0.5);
  assert(!fifthWatch.ok && fifthWatch.reason === "chapter_cap", "同一章第五次不得发放动物奖励");
  assert.strictEqual(animalTotalAdStatus(animalReserve).remaining, 0, "四次之后本章次数应耗尽");
  animalReserve.progression = Object.assign({}, animalReserve.progression || {}, { stage: 9, displayChapter: 9 });
  assert.strictEqual(animalTotalAdStatus(animalReserve).remaining, 4, "进入下一章后幸运迁入次数必须重新计算");

  // 真机看广告期间可能切后台，运行时随后用存档重建 this.state。
  // 奖励必须写入重建后的 reserve，而不能写入打开广告时捕获的旧对象。
  const staleReserve = createReserveState();
  const reloadedReserve = createReserveState();
  const staleBefore = require("../js/chapterRescueSystem").livingAnimalTotal(staleReserve);
  const reloadedBefore = require("../js/chapterRescueSystem").livingAnimalTotal(reloadedReserve);
  const reloadedGame = Object.create(Game.prototype);
  reloadedGame.state = { world: { reserve: staleReserve } };
  reloadedGame.rewardedAnimalAds = { show: () => Promise.resolve({ completed: true, reason: "completed" }) };
  reloadedGame.toast = () => {};
  reloadedGame.playSfx = () => {};
  reloadedGame.openCoreMetricDetail = () => {};
  reloadedGame.commitReserveProgression = () => {};
  reloadedGame.claimAnimalTotalAd();
  reloadedGame.state = { world: { reserve: reloadedReserve } };
  await new Promise((resolve) => setTimeout(resolve, 0));
  const reloadedAfter = require("../js/chapterRescueSystem").livingAnimalTotal(reloadedReserve);
  assert.strictEqual(require("../js/chapterRescueSystem").livingAnimalTotal(staleReserve), staleBefore, "切后台重建 state 后不得把奖励写入旧 reserve");
  assert(reloadedAfter > reloadedBefore, "切后台重建 state 后幸运迁入必须增加当前动物总数");

  const animalDetailGame = Object.create(Game.prototype);
  animalDetailGame.state = { world: { reserve: createReserveState() } };
  const animalDetail = animalDetailGame.buildChapterProgressDetail().metricDetails.animals;
  const animalVisible = [animalDetail.actionLabel, animalDetail.footer]
    .concat((animalDetail.items || []).flatMap((item) => [item.tag, item.title, item.body]))
    .join(" ");
  assert.strictEqual(animalDetail.adPlacement, "animal_total_detail_footer", "动物总数详情必须提供幸运迁入入口");
  assert(/幸运获得/.test(animalDetail.actionLabel) && /迁入动物/.test(animalDetail.actionLabel), "动物总数详情底部必须出现幸运获得迁入动物");
  assert(animalDetail.items.some((item) => item.tag === "幸运" && typeof item.action === "function"), "动物总数详情必须有可点击的幸运迁入说明卡");
  const specificAnimalTask = animalDetail.items.find((item) => item.tag === "具体任务");
  assert(specificAnimalTask && typeof specificAnimalTask.action === "function", "动物总数不足时必须在幸运迁入之外提供一个可执行的具体任务");
  assert(/解救.+|巡护站短巡或安抚/.test(specificAnimalTask.title), "具体任务必须明确到解救或巡护站/安抚");
  assert(/还差 \d+ 只/.test(specificAnimalTask.body), "具体任务必须写出当前动物缺口");
  assert(!/广告|激励|5%|10%/.test(animalVisible), "动物总数详情不得向玩家展示广告或百分比规则");

  const failedAnimalReserve = createReserveState();
  const failedAnimalBefore = livingAnimalTotal(failedAnimalReserve);
  const failedAnimalGame = Object.create(Game.prototype);
  failedAnimalGame.state = { world: { reserve: failedAnimalReserve } };
  failedAnimalGame.rewardedAnimalAds = { show: () => Promise.resolve({ completed: false, reason: "closed_early" }) };
  failedAnimalGame.toast = () => {};
  failedAnimalGame.playSfx = () => {};
  failedAnimalGame.openCoreMetricDetail = () => {};
  failedAnimalGame.claimAnimalTotalAd();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(livingAnimalTotal(failedAnimalReserve), failedAnimalBefore, "广告未完整观看时不得增加动物总数");

  const loopGame = Object.create(Game.prototype);
  let scheduled = 0;
  loopGame.raf = () => { scheduled += 1; return scheduled; };
  loopGame.caf = () => {};
  loopGame.anim = { paused: false, rafId: 0, lastTs: 0, lastWallTs: 0, t: 0, acc: 0 };
  loopGame.nativeTemplateAds = { setVisible() {} };
  loopGame.gameClub = { setVisible() {} };
  loopGame.parkIdleOpenDataOverlay = () => true;
  loopGame.scheduleIdleOpenDataPark = () => true;
  loopGame.rewardedAdsByUnit = {};
  loopGame.stopLoop();
  assert(loopGame.anim.paused, "切后台后主循环应暂停");
  loopGame.afterRewardedVideoClose({ show() {} });
  assert(!loopGame.anim.paused, "激励视频关闭后必须恢复主循环，否则沙盘无法操作");
  assert(scheduled > 0, "恢复后必须重新排帧");
  assert(loopGame.shouldKeepLoopAfterRewardedReturn(), "刚看完广告时，播放器补发的 onHide 不得再停循环");
  loopGame.rewardedSupplyAds = { showing: true };
  assert(!loopGame.shouldKeepLoopAfterRewardedReturn(), "视频还在播放时必须允许暂停循环");
  loopGame.rewardedVideoBusy = true;
  assert(loopGame.rewardedVideoWatchBlocked(), "视频未结算前，关片点击不得再开一次");
  loopGame.rewardedVideoBusy = false;
  loopGame.rewardedVideoLockedUntil = Date.now() + 1200;
  assert.strictEqual(loopGame.claimAnimalTotalAd(), false, "关片后 1.2 秒内不得再次拉起激励视频");

  console.log("rewarded supply ad check ok");
}

main().catch((error) => { console.error(error); process.exit(1); });
