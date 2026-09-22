const assert = require("assert");
const fs = require("fs");
const { createInitialWorld, createReserveState } = require("../js/world");
const {
  DAILY_FREE_RECRUITS,
  DAILY_AD_WATCH_CAP,
  PLAYTIME_RECRUIT_RESTORE_SECONDS,
  visitorRecruitmentStatus,
  visitorRecruitmentFactors,
  visitorMigrationRatio,
  visitorWaterUseForCount,
  previewVisitorRecruitment,
  consumeVisitorRecruitment,
  grantVisitorRecruitmentAd
} = require("../js/visitorRecruitment");
const { survivalImpact } = require("../js/survivalImpact");
const { reserveOperationsSnapshot, buildReserveDevelopmentPlan, settleReserveDevelopmentDay } = require("../js/reserveDevelopment");

const state = createInitialWorld();
const reserve = state.reserve;
const dayOne = new Date(2026, 0, 1, 10, 0, 0).getTime();
const dayTwo = new Date(2026, 0, 2, 10, 0, 0).getTime();
let status = visitorRecruitmentStatus(reserve, 1, dayOne);
assert.strictEqual(status.freeRemaining, DAILY_FREE_RECRUITS);
assert.strictEqual(status.adCredits, 0);
assert.strictEqual(status.totalAvailable, DAILY_FREE_RECRUITS);
assert.strictEqual(status.canWatchAd, false, "free quota remains, ad entry must stay hidden");

const first = consumeVisitorRecruitment(reserve, 1, 0.5, dayOne);
assert(first.ok);
assert.strictEqual(reserve.development.operations.today.day, 1, "即时招募必须写入当天运营日期");
assert.strictEqual(reserve.development.operations.today.recruitedVisitors, first.visitors, "即时招募必须写入当天游客数");
assert.strictEqual(reserve.development.operations.today.income, first.income, "即时招募收入必须立即进入当天数据");
assert.strictEqual(visitorRecruitmentStatus(reserve, 1, dayOne).totalAvailable, DAILY_FREE_RECRUITS - 1, "首次发布后入口次数必须立即更新");
reserveOperationsSnapshot(reserve, 1);
assert.strictEqual(visitorRecruitmentStatus(reserve, 1, dayOne).totalAvailable, DAILY_FREE_RECRUITS - 1, "刷新游客运营页后机会数不能被日期归一化恢复");
const second = consumeVisitorRecruitment(reserve, 1, 0.5, dayOne);
assert(first.ok && second.ok);
assert(first.visitors >= 22 && first.visitors <= 34, "首次招募应落在22–34人");
assert(second.visitors >= 28 && second.visitors <= 44, "第二次招募应落在28–44人");
assert(second.visitors / first.visitors <= 1.6, "两次招募人数差不应到数倍");
assert(first.income > 0 && reserve.fund > 520, "recruited visitors must feed the protection fund");
assert.strictEqual(visitorRecruitmentStatus(reserve, 1, dayOne).totalAvailable, DAILY_FREE_RECRUITS - 2);
const third = consumeVisitorRecruitment(reserve, 1, 0.5, dayOne);
assert.strictEqual(third.ok, false, "default free recruits must stop after two attempts");
assert.strictEqual(visitorRecruitmentStatus(reserve, 1, dayOne).totalAvailable, 0);
assert.strictEqual(consumeVisitorRecruitment(reserve, 1, 0.5, dayOne).ok, false, "free quota must stop direct recruitment");

const firstAdReward = grantVisitorRecruitmentAd(reserve, 1, dayOne);
assert(firstAdReward.ok && firstAdReward.granted === 2, "广告完播后必须一次补充2次招募机会");
assert.strictEqual(visitorRecruitmentStatus(reserve, 1, dayOne).totalAvailable, 2, "广告完播后可用机会数必须恢复为2");
consumeVisitorRecruitment(reserve, 1, 0.5, dayOne);
consumeVisitorRecruitment(reserve, 1, 0.5, dayOne);
for (let index = 1; index < DAILY_AD_WATCH_CAP / 2; index += 1) {
  const reward = grantVisitorRecruitmentAd(reserve, 1, dayOne);
  assert(reward.ok, `ad grant ${index + 1} should be available`);
  consumeVisitorRecruitment(reserve, 1, 0.5, dayOne);
  consumeVisitorRecruitment(reserve, 1, 0.5, dayOne);
}
status = visitorRecruitmentStatus(reserve, 1, dayOne);
assert.strictEqual(status.adWatchedToday, DAILY_AD_WATCH_CAP);
assert.strictEqual(status.adCredits, 0);
assert.strictEqual(grantVisitorRecruitmentAd(reserve, 1, dayOne).ok, false, "daily ad cap must be enforced");

const sameRealDate = visitorRecruitmentStatus(reserve, 2, dayOne);
assert.strictEqual(sameRealDate.freeRemaining, 0, "游戏内守护日变化不能重置真实日期招募次数");
assert.strictEqual(sameRealDate.adWatchedToday, DAILY_AD_WATCH_CAP, "同一真实日广告次数不能被游戏日刷新");

const nextDay = visitorRecruitmentStatus(reserve, 2, dayTwo);
assert.strictEqual(nextDay.freeRemaining, DAILY_FREE_RECRUITS, "free quota resets at a new real calendar day");
assert.strictEqual(nextDay.adWatchedToday, 0, "daily ad watch count resets at a new real calendar day");
assert.strictEqual(nextDay.adCredits, 0, "ad credits do not carry into the next real calendar day");
assert.strictEqual(reserve.development.operations.today.visitors, 0, "游客当日数据在真实日期切换时清零");

const normal = previewVisitorRecruitment(reserve, 2, 0.5, dayTwo);
const lowSafety = Object.assign({}, reserve, { safety: 15 });
const low = previewVisitorRecruitment(lowSafety, 2, 0.5, dayTwo);
assert(low.visitors < normal.visitors, "low safety must reduce recruitment output");
assert(low.factors.lowSafety, "low safety warning must be exposed");
assert(normal.visitors >= 20 && normal.visitors <= 600, "recruitment output must stay bounded");
const factors = visitorRecruitmentFactors(reserve);
assert(Number.isFinite(factors.populationFactor) && Number.isFinite(factors.safetyFactor));

const gameSource = fs.readFileSync(require.resolve("../js/game"), "utf8");
assert(gameSource.includes('if (modal && modal.kind === "visitorRecruitment" && modal.phase === "result")'), "招募结果页再次点击不得消耗次数");
assert((gameSource.match(/consumeVisitorRecruitment\(/g) || []).length === 1, "游戏内只能有一处真正消耗招募次数");
assert(!gameSource.includes('? "继续招募"'), "招募结果页不得显示连续招募按钮");
assert(gameSource.includes("看广告招募"), "免费发布次数耗尽后必须切换为广告招募入口");
assert(gameSource.includes("游玩${PLAYTIME_RECRUIT_RESTORE_MINUTES}分钟") || gameSource.includes("游玩6分钟"), "次数用完后必须提示按游戏时长恢复");
assert(!gameSource.includes("查看广告-招募"), "广告招募入口不得再使用生硬的查看广告-招募文案");
assert(!gameSource.includes('免费 ${status.freeRemaining} · 广告次数 ${status.adCredits}'), "招募弹窗不应再显示冗余的免费/广告计数");
assert(!gameSource.includes('["累计影响力", `${operations.influence || 0}`]'), "游客运营页不应再显示冗余累计影响力");
assert(gameSource.includes('y = this.drawVisitorMailboxEntry(ctx, y, letters);'), "游客来信区域必须可点击打开收件箱");
assert(gameSource.includes('kind: "visitorLetterInbox"'), "游客来信需要独立收件箱弹窗");
assert(gameSource.includes('showsAllHistory: !modal.unreadOnly'), "游客收件箱必须保留并展示多封历史来信");
assert(gameSource.includes("动物迁移动态"), "日报迁入迁出必须标明是动物迁移");
assert(gameSource.includes("到访"), "章节游客构成必须单列到访");
assert(
  gameSource.includes("上一章只把结束时游客总数的${Math.round(chapterVisitorCarryoverRatio() * 100)}%带入")
    || gameSource.includes("上一章只把结束时游客总数的10%带入"),
  "章节说明必须写清只有10%继承"
);
assert(gameSource.includes("主动招募显示几人，本章游客就增加几人"), "招募人数必须整笔计入本章");
assert(gameSource.includes("会计入本章迁入或到访"), "事件和建筑客流必须按本章重新计算");

const balanced = { safety: 50, poacherPressure: 20, ecology: { water: 50, grass: 50, disease: 12, predators: {}, herbivores: {}, birds: {} } };
assert.strictEqual(Math.round(visitorMigrationRatio(balanced) * 100), 40, "水源草场安全各50时迁入占比应对齐4:6");
const lush = Object.assign({}, balanced, { ecology: Object.assign({}, balanced.ecology, { water: 90, grass: 90 }) });
const safer = Object.assign({}, balanced, { safety: 90 });
assert(visitorMigrationRatio(lush) > visitorMigrationRatio(balanced) + 0.04, "提升水草必须提高迁入占比");
assert(visitorMigrationRatio(safer) > visitorMigrationRatio(balanced) + 0.04, "提升安全必须提高迁入占比");
assert.notEqual(survivalImpact(lush)[2].lines[1], survivalImpact(balanced)[2].lines[1], "生存影响文案必须随水草改变迁入占比");

const opening = createInitialWorld().reserve;
const openingRatio = Math.round(visitorMigrationRatio(opening) * 100);
assert(openingRatio > 40 && openingRatio <= 60, `开局迁入占比应高于平衡4:6并显示真实值，当前 ${openingRatio}%`);

const crisis = createInitialWorld().reserve;
crisis.progression = Object.assign({}, crisis.progression, { stage: 2 });
crisis.ecology.water = 30;
crisis.ecology.grass = 30;
crisis.ecology.disease = 75;
const crisisPreview = previewVisitorRecruitment(crisis, 2, 0.5, dayTwo);
assert.strictEqual(crisisPreview.factors.reason, "疾病风险过高，游客暂缓进入");
assert(crisisPreview.visitors <= 12, `疾病高峰时一波应缓入，实际 ${crisisPreview.visitors} 人`);
assert(crisisPreview.visitors < 20);

const watered = createInitialWorld();
watered.reserve.progression.stage = 2;
watered.reserve.development.operations.recruitment = {
  version: 2, day: 2, dateKey: "2026-01-02", freeRemaining: 2, adCredits: 0, adWatchedToday: 0, totalRecruited: 40, lastResult: null
};
const waterBefore = watered.reserve.ecology.water;
const recruited = consumeVisitorRecruitment(watered.reserve, 2, 0.5, dayTwo);
assert(recruited.ok);
assert(recruited.visitors >= 20, "过了首轮后招募应能形成常规客流");
assert.strictEqual(recruited.visitorWaterUse, visitorWaterUseForCount(recruited.visitors));
assert(recruited.visitorWaterUse >= 1, "主动招募必须扣水");
assert.strictEqual(watered.reserve.ecology.water, waterBefore - recruited.visitorWaterUse);
assert.strictEqual(visitorWaterUseForCount(240), 2);
assert.strictEqual(visitorWaterUseForCount(900), 8);
const flow = watered.reserve.development.operations.visitorLedger;
assert.strictEqual(flow.recruitedVisitors, recruited.visitors, "招募显示几人就必须全部计入本章招募");
assert.strictEqual(flow.migratedVisitors, 0, "招募不得记成迁入");
assert.strictEqual(flow.facilityVisitors, 0, "招募不得记成设施到访");
assert.strictEqual(watered.reserve.development.operations.today.recruitmentWaterUse, recruited.visitorWaterUse);

const facilityReserve = createReserveState();
assert(buildReserveDevelopmentPlan(facilityReserve, "river_shallows", "visitor_boardwalk", 1).ok);
const beforeFacility = normalizeVisitorFlowLedgerSnapshot(facilityReserve);
const settlement = settleReserveDevelopmentDay(facilityReserve, 2, { weather: "阴" });
assert(settlement && settlement.visitors > 0);
assert.strictEqual(facilityReserve.development.operations.visitorLedger.facilityVisitors, settlement.visitors, "设施自然到访必须记入设施账本");
assert.strictEqual(facilityReserve.development.operations.visitorLedger.migratedVisitors, beforeFacility.migratedVisitors, "设施客流不得记入迁入");
assert.strictEqual(facilityReserve.development.operations.visitorLedger.recruitedVisitors, 0);

function normalizeVisitorFlowLedgerSnapshot(reserve) {
  const ledger = ((reserve.development || {}).operations || {}).visitorLedger || {};
  return {
    migratedVisitors: Math.max(0, Math.round(Number(ledger.migratedVisitors) || 0)),
    recruitedVisitors: Math.max(0, Math.round(Number(ledger.recruitedVisitors) || 0)),
    facilityVisitors: Math.max(0, Math.round(Number(ledger.facilityVisitors) || 0))
  };
}

const playtime = createInitialWorld().reserve;
playtime.progression = Object.assign({}, playtime.progression, { activeSeconds: 0 });
const playDay = new Date(2026, 2, 3, 10, 0, 0).getTime();
assert(consumeVisitorRecruitment(playtime, 1, 0.5, playDay).ok);
assert(consumeVisitorRecruitment(playtime, 1, 0.5, playDay).ok);
let playStatus = visitorRecruitmentStatus(playtime, 1, playDay);
assert.strictEqual(playStatus.freeRemaining, 0);
assert.strictEqual(playStatus.playtimeRestoreStarted, true, "默认2次用完后必须开始按游戏时长恢复");
assert.strictEqual(playStatus.nextRestoreSeconds, PLAYTIME_RECRUIT_RESTORE_SECONDS);

playtime.progression.activeSeconds = PLAYTIME_RECRUIT_RESTORE_SECONDS - 1;
playStatus = visitorRecruitmentStatus(playtime, 1, playDay);
assert.strictEqual(playStatus.freeRemaining, 0, "不满6分钟不得恢复招募次数");

const recruitedBeforeRestore = Number(playtime.development.operations.visitorLedger.recruitedVisitors) || 0;
const publishBeforeRestore = Number(playtime.development.operations.recruitment.publishCount) || 0;
const visitorsBeforeRestore = Number(playtime.development.operations.totalVisitors) || 0;
playtime.progression.activeSeconds = PLAYTIME_RECRUIT_RESTORE_SECONDS;
playStatus = visitorRecruitmentStatus(playtime, 1, playDay);
assert.strictEqual(playStatus.freeRemaining, 1, "游玩6分钟应恢复1次");
assert.strictEqual(playStatus.playtimeRestoreStarted, true, "恢复到1次后应继续计时直到2次");
assert.strictEqual(Number(playtime.development.operations.recruitment.publishCount) || 0, publishBeforeRestore, "次数恢复不得自动消耗招募");
assert.strictEqual(Number(playtime.development.operations.visitorLedger.recruitedVisitors) || 0, recruitedBeforeRestore, "次数恢复不得自动增加招募游客");
assert.strictEqual(Number(playtime.development.operations.totalVisitors) || 0, visitorsBeforeRestore, "次数恢复不得自动改写游客总数");

playtime.progression.activeSeconds = PLAYTIME_RECRUIT_RESTORE_SECONDS * 2 - 1;
playStatus = visitorRecruitmentStatus(playtime, 1, playDay);
assert.strictEqual(playStatus.freeRemaining, 1, "第二段不满6分钟不得再恢复");

playtime.progression.activeSeconds = PLAYTIME_RECRUIT_RESTORE_SECONDS * 2;
playStatus = visitorRecruitmentStatus(playtime, 1, playDay);
assert.strictEqual(playStatus.freeRemaining, 2, "再游玩6分钟应恢复满2次");
assert.strictEqual(playStatus.playtimeRestoreStarted, false, "恢复满2次后必须停止计时");

playtime.progression.activeSeconds = PLAYTIME_RECRUIT_RESTORE_SECONDS * 3;
playStatus = visitorRecruitmentStatus(playtime, 1, playDay);
assert.strictEqual(playStatus.freeRemaining, 2, "满2次后不再继续恢复");

assert(consumeVisitorRecruitment(playtime, 1, 0.5, playDay).ok);
playStatus = visitorRecruitmentStatus(playtime, 1, playDay);
assert.strictEqual(playStatus.freeRemaining, 1);
assert.strictEqual(playStatus.playtimeRestoreStarted, false, "没用到0之前不应开始恢复");

assert(consumeVisitorRecruitment(playtime, 1, 0.5, playDay).ok);
assert.strictEqual(consumeVisitorRecruitment(playtime, 1, 0.5, playDay).ok, false, "第二次用完后第三次仍不能直接招募");
playStatus = visitorRecruitmentStatus(playtime, 1, playDay);
assert.strictEqual(playStatus.freeRemaining, 0);
assert.strictEqual(playStatus.playtimeRestoreStarted, true);
const afterZero = Number(playtime.progression.activeSeconds);
playtime.progression.activeSeconds = afterZero + PLAYTIME_RECRUIT_RESTORE_SECONDS;
playStatus = visitorRecruitmentStatus(playtime, 1, playDay);
assert.strictEqual(playStatus.freeRemaining, 1, "再次用到0后应按新的6分钟恢复");

const catchup = createInitialWorld().reserve;
const catchDay = new Date(2026, 2, 4, 10, 0, 0).getTime();
catchup.progression = Object.assign({}, catchup.progression, { activeSeconds: 100 });
assert(consumeVisitorRecruitment(catchup, 1, 0.5, catchDay).ok);
assert(consumeVisitorRecruitment(catchup, 1, 0.5, catchDay).ok);
catchup.progression.activeSeconds = 100 + PLAYTIME_RECRUIT_RESTORE_SECONDS * 2;
playStatus = visitorRecruitmentStatus(catchup, 1, catchDay);
assert.strictEqual(playStatus.freeRemaining, 2, "一次结算应补满跳过的恢复");
assert.strictEqual(playStatus.playtimeRestoreStarted, false);

console.log("visitor recruitment check ok");
