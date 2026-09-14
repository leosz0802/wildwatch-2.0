const assert = require("assert");
const fs = require("fs");
const { createInitialWorld } = require("../js/world");
const {
  DAILY_FREE_RECRUITS,
  DAILY_AD_WATCH_CAP,
  visitorRecruitmentStatus,
  visitorRecruitmentFactors,
  previewVisitorRecruitment,
  consumeVisitorRecruitment,
  grantVisitorRecruitmentAd
} = require("../js/visitorRecruitment");
const { reserveOperationsSnapshot } = require("../js/reserveDevelopment");

const state = createInitialWorld();
const reserve = state.reserve;
const dayOne = new Date(2026, 0, 1, 10, 0, 0).getTime();
const dayTwo = new Date(2026, 0, 2, 10, 0, 0).getTime();
let status = visitorRecruitmentStatus(reserve, 1, dayOne);
assert.strictEqual(status.freeRemaining, DAILY_FREE_RECRUITS);
assert.strictEqual(status.adCredits, 0);
assert.strictEqual(status.totalAvailable, 2);
assert.strictEqual(status.canWatchAd, false, "free quota remains, ad entry must stay hidden");

const first = consumeVisitorRecruitment(reserve, 1, 0.5, dayOne);
assert(first.ok);
assert.strictEqual(reserve.development.operations.today.day, 1, "即时招募必须写入当天运营日期");
assert.strictEqual(reserve.development.operations.today.recruitedVisitors, first.visitors, "即时招募必须写入当天游客数");
assert.strictEqual(reserve.development.operations.today.income, first.income, "即时招募收入必须立即进入当天数据");
assert.strictEqual(visitorRecruitmentStatus(reserve, 1, dayOne).totalAvailable, 1, "首次发布后入口次数必须立即从2更新为1");
reserveOperationsSnapshot(reserve, 1);
assert.strictEqual(visitorRecruitmentStatus(reserve, 1, dayOne).totalAvailable, 1, "刷新游客运营页后机会数不能被日期归一化恢复为2");
const second = consumeVisitorRecruitment(reserve, 1, 0.5, dayOne);
assert(first.ok && second.ok);
assert(first.income > 0 && reserve.fund > 520, "recruited visitors must feed the protection fund");
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
assert(gameSource.includes('if (modal.phase === "result") return this.dismissInfoDetailModal();'), "招募结果页不得再次触发招募");
assert(!gameSource.includes('? "继续招募"'), "招募结果页不得显示连续招募按钮");
assert(gameSource.includes('hasCredits ? "发布招募" : status.canWatchAd ? "查看广告-招募" : "今日次数用完"'), "游客页入口必须只保留简化按钮文案");
assert(gameSource.includes('status.canWatchAd ? "查看广告-招募"'), "免费发布次数耗尽后必须切换为广告招募入口");
assert(!gameSource.includes('免费 ${status.freeRemaining} · 广告次数 ${status.adCredits}'), "招募弹窗不应再显示冗余的免费/广告计数");
assert(!gameSource.includes('["累计影响力", `${operations.influence || 0}`]'), "游客运营页不应再显示冗余累计影响力");
assert(gameSource.includes('y = this.drawVisitorMailboxEntry(ctx, y, letters);'), "游客来信区域必须可点击打开收件箱");
assert(gameSource.includes('kind: "visitorLetterInbox"'), "游客来信需要独立收件箱弹窗");
assert(gameSource.includes('showsAllHistory: !modal.unreadOnly'), "游客收件箱必须保留并展示多封历史来信");

console.log("visitor recruitment check ok");
