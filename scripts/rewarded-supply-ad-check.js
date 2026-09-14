const assert = require("assert");
const { createReserveState } = require("../js/world");
const { Game } = require("../js/game");
const {
  REWARDED_SUPPLY_AD_CONFIG,
  REWARDED_FUND_AD_CONFIG,
  REWARDED_VISITOR_AD_CONFIG,
  RewardedSupplyAdController,
  emergencySupplyAdStatus,
  applyEmergencySupplyReward,
  emergencyFundAdStatus,
  applyEmergencyFundReward
} = require("../js/adSystem");

async function main() {
  const reserve = createReserveState();
  reserve.guardianCycle.day = 1;
  reserve.supplies = { dogFood: 0, alarm: 0, tranquilizer: 0, fieldKit: 0, medicalKit: 0 };
  assert(emergencySupplyAdStatus(reserve).eligible, "第一守护日物资短缺时就应开放应急包，不能展示失效入口");
  const reward = applyEmergencySupplyReward(reserve);
  assert(reward.ok && reserve.supplies.dogFood === 4 && reserve.supplies.alarm === 2 && reserve.supplies.tranquilizer === 2 && reserve.supplies.fieldKit === 2 && reserve.supplies.medicalKit === 2, "应急包必须一次补齐全部物资");
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
  assert(fundReward.ok && fundReward.amount === 1000 && fundReserve.fund === 1520, "完整观看后必须准确补充1000星币");
  const secondFundReward = applyEmergencyFundReward(fundReserve);
  const thirdFundReward = applyEmergencyFundReward(fundReserve);
  assert(secondFundReward.ok && secondFundReward.amount === 1000 && thirdFundReward.ok && thirdFundReward.amount === 1000, "同一天应允许不限次数领取低基金广告奖励");
  assert.strictEqual(fundReserve.emergencyFundAd.claimCount, 3, "基金广告应累计记录领取次数");
  assert.strictEqual(fundReserve.emergencyFundAd.claimCountToday, 3, "基金广告应记录当日领取次数");
  assert.strictEqual(fundReserve.emergencyFundAd.lastReward.before, 2520, "最近一次奖励应记录发放前基金");
  assert.strictEqual(fundReserve.emergencyFundAd.lastReward.after, 3520, "最近一次奖励应记录发放后基金");

  [
    { before: 9999, expected: 1000 },
    { before: 10000, expected: 1000 },
    { before: 15000, expected: 1500 }
  ].forEach(({ before, expected }) => {
    const caseReserve = createReserveState();
    caseReserve.guardianCycle.day = 2;
    caseReserve.fund = before;
    const status = emergencyFundAdStatus(caseReserve);
    assert.strictEqual(status.reward, expected, `基金 ${before} 的广告预览奖励错误`);
    const reward = applyEmergencyFundReward(caseReserve);
    assert(reward.ok && reward.amount === expected && reward.before === before && reward.after === before + expected, `基金 ${before} 的广告奖励计算错误`);
  });
  assert.strictEqual(REWARDED_FUND_AD_CONFIG.adUnitId, REWARDED_SUPPLY_AD_CONFIG.adUnitId, "基金与物资应共用已开通的激励视频广告位");
  assert.strictEqual(REWARDED_VISITOR_AD_CONFIG.adUnitId, "adunit-87d5ca86e895053e", "游客招募必须使用指定的激励视频广告位");

  const detailReserve = createReserveState();
  detailReserve.guardianCycle.day = 2;
  detailReserve.fund = 520;
  const detailGame = Object.create(Game.prototype);
  detailGame.state = { world: { reserve: detailReserve } };
  const detail = detailGame.buildReserveMetricDetail("fund");
  assert.strictEqual(detail.adPlacement, "fund_detail_footer", "广告入口应固定在保护基金详情底部操作区");
  assert.strictEqual(detail.adReward, 1000, "保护基金详情必须明确展示1000星币奖励");
  assert(/看广告/.test(detail.actionLabel) && /1000/.test(detail.actionLabel) && typeof detail.action === "function", "基金不足时详情底部必须出现可点击广告按钮");
  assert.deepStrictEqual(detail.items.map((item) => item.tag), ["来源", "用途", "明细"], "基金详情应提供可点击的收支明细入口");
  assert.strictEqual(typeof detail.items[2].action, "function", "收支明细入口必须绑定点击动作");
  const visibleDetailCopy = [detail.kicker, detail.title, detail.footer, detail.actionLabel]
    .concat(detail.items.flatMap((item) => [item.tag, item.title, item.body]))
    .join(" ");
  assert.strictEqual((visibleDetailCopy.match(/\+1000/g) || []).length, 1, "广告奖励额度在弹窗中只能出现一次");

  detailReserve.fund = 15000;
  const highFundDetail = detailGame.buildReserveMetricDetail("fund");
  assert.strictEqual(highFundDetail.adReward, 1500, "高基金详情必须展示当前余额10%的广告奖励");
  assert(/看广告/.test(highFundDetail.actionLabel) && /1500/.test(highFundDetail.actionLabel), "高基金仍应显示不限次数广告入口和动态奖励");
  assert(/每天不限次数/.test(highFundDetail.footer), "基金详情必须说明每天不限次数");

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

  const legacyCompleted = controller.show();
  await new Promise((resolve) => setTimeout(resolve, 0));
  closeHandler();
  assert((await legacyCompleted).completed, "旧版微信关闭回调不带参数时应按完整观看处理");

  const failed = controller.show();
  errorHandler({ errMsg: "mock preload error" });
  const failedResult = await failed;
  assert(!failedResult.completed && failedResult.reason === "error", "拉取异常必须结束展示流程且不得发放物资");

  const gameSource = require("fs").readFileSync(require.resolve("../js/game"), "utf8");
  assert(gameSource.includes("this.rewardedVisitorAds = new RewardedSupplyAdController(this.runtime, { config: REWARDED_VISITOR_AD_CONFIG });"), "游客激励视频必须随延迟运行时服务提前初始化");
  console.log("rewarded supply ad check ok");
}

main().catch((error) => { console.error(error); process.exit(1); });
