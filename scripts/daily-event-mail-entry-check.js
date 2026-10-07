const assert = require('assert');
const { Game } = require('../js/game');
const { createCharacter, saveState, loadState } = require('../js/storage');
const { applyGoalProgress, normalizeGoalState } = require('../js/goalSystem');
const { normalizeChapterRescue } = require('../js/chapterRescueSystem');
const storage = new Map();
global.wx = {
  getStorageSync: key => storage.get(key),
  setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value)))
};
function makeGame() {
  const g = Object.create(Game.prototype);
  g.state = createCharacter(null, '每日事项测试');
  g.state.world.reserve.progression.stage = 2;
  g.state.world.reserve.progression.displayChapter = 2;
  normalizeChapterRescue(g.state.world.reserve, 2, { fresh: true });
  g.state.world.goals = normalizeGoalState(g.state.world.goals, g.state);
  g.render = g.toast = () => {};
  g.ensureDailyReserveReport = g.ensureDailyFriendLetters = () => {};
  g.roundRect = g.drawSmallGlyph = g.text = () => {};
  g.drawUiIcon = () => true;
  g.screen = 'home';
  g.animT = () => 0;
  g.addMapRectHit = (x,y,w,h,action) => { g.lastHit = action; };
  return g;
}
const camera = { x: 0, y: 0, w: 375, h: 600 };
const plan = { aggregateVisible: false, hidden: [] };
const g = makeGame();
g.drawSandboxOpportunityAggregate({}, camera, plan);
assert.equal(g.renderedMapOpportunityAggregate.mode, 'rescue', '待解救动物存在时主入口必须优先解救，避免误弹每日任务');
assert.match(g.renderedMapOpportunityAggregate.label, /^解救/, '待解救入口文案必须明确指向动物');
assert(g.openDailyEvents(), '今日每日仍可从任务入口打开清单');
assert.equal(g.infoDetailModal.kind, 'dailyEvents');
assert.equal(g.infoDetailModal.checklist.total, 2, '每日任务只展示游客和水草两项');
const objective = g.infoDetailModal.checklist.objectives.find(item => !item.complete);
let routed;
g.executeGoalAction = goal => { routed = goal; return true; };
g.executeDailyEvent(objective.id, g.infoDetailModal.checklist.dateKey);
assert.equal(routed.recommendedAction, objective.recommendedAction);
assert.notEqual(routed.recommendedAction, 'exploreMaterials', '每日入口不得再送去生存频道');
// 使用正式目标结算更新每日进度，重复打开入口不能提前完成目标。
for (const action of ['viewVisitors', 'habitat']) {
  const before = JSON.parse(JSON.stringify(g.state));
  g.state = applyGoalProgress(before, g.state, { action }).state;
}
assert.equal(g.dailyEventChecklist().remaining, 0);
assert(g.state.world.goals.daily.fullClaimed, '全部每日任务应领取额外奖励');
  assert((g.state.world.reserve.lastTaskReward || {}).fund >= 16, '两项任务奖励应累计进入保护基金');
g.drawSandboxOpportunityAggregate({}, camera, plan);
assert.equal(g.renderedMapOpportunityAggregate.mode, 'rescue');
const pendingChapterRescue = g.chapterRescueState().targets.find(target => target.status !== 'rescued');
assert(pendingChapterRescue
  ? g.renderedMapOpportunityAggregate.label.includes(`解救${pendingChapterRescue.speciesName}`)
  : g.renderedMapOpportunityAggregate.label.includes('更多线索'), '每日任务完成后，入口应展示仍待处理的独立解救或地图线索');
saveState(g.state);
g.state = loadState();
assert.equal(g.dailyEventChecklist().remaining, 0, '重载存档不能重复生成今日必做事项');
routed = null;
g.executeDailyEvent(objective.id, g.dailyEventChecklist().dateKey);
assert.equal(routed, null, '完成后的旧按钮不得再次执行');
const originalNow = Date.now;
let clock = originalNow();
Date.now = () => clock;
try {
  const yesterdayKey = g.dailyEventChecklist().dateKey;
  clock += 86400000;
assert.equal(g.dailyEventChecklist().remaining, 2, '下一自然日恢复两项每日事项');
  g.executeDailyEvent(objective.id, yesterdayKey);
  assert.equal(routed, null, '跨日的旧清单必须先刷新');

  const mail = makeGame();
  const reserve = mail.state.world.reserve;
  reserve.development.operations.letters = [{ id: 'a', day: 1, title: '游客来信', body: '参访记录', readAt: 0 }];
  mail.drawMapVisitorCountChip({}, camera);
  assert(mail.renderedMapVisitorCountChip.visible);
  mail.drawSandboxOpportunityAggregate({}, camera, plan);
  assert(!mail.renderedMapOpportunityAggregate.visible, '一个位置不能同时显示每日事件和邮件');
  mail.lastHit();
  assert(mail.infoDetailModal.unreadOnly);
  assert(mail.infoDetailModal.letters.every(item => !item.readAt));
  clock += 4999;
  mail.drawMapVisitorCountChip({}, camera);
  assert(mail.renderedMapVisitorCountChip.visible);
  clock += 1;
  mail.drawMapVisitorCountChip({}, camera);
  assert(!mail.renderedMapVisitorCountChip.visible, '未读邮件仍在也不能超过5秒常驻');
  mail.drawSandboxOpportunityAggregate({}, camera, plan);
  assert.equal(mail.renderedMapOpportunityAggregate.mode, 'rescue');

  // 邮箱满50封，加入一封且总数不变也要提醒。
  reserve.development.operations.letters = Array.from({ length: 50 }, (_, i) => ({ id: `v${i}`, day: i + 1, title: '游客来信', body: '记录', readAt: 0 }));
  mail.drawMapVisitorCountChip({}, camera);
  clock += 5001;
  mail.drawMapVisitorCountChip({}, camera);
  reserve.development.operations.letters.push({ id: 'replacement', day: 51, title: '新游客来信', body: '新的记录', readAt: 0 });
  mail.drawMapVisitorCountChip({}, camera);
  assert(mail.renderedMapVisitorCountChip.visible, '邮件数量不变时按ID识别新信');
  const expires = mail.mapSignalNotice.expiresAt;
  mail.openReserveLetterInbox({ unreadOnly: true });
  const parent = mail.infoDetailModal;
  mail.openVisitorLetterReader(parent.letters[0], parent);
  mail.dismissInfoDetailModal();
  assert(mail.infoDetailModal.unreadOnly && mail.infoDetailModal.letters.every(item => !item.readAt));
  assert(!mail.infoDetailModal.letters.some(item => item.id === 'replacement'));
  mail.drawMapVisitorCountChip({}, camera);
  assert.equal(mail.mapSignalNotice.expiresAt, expires, '阅读和返回不延长提醒');
  clock = expires;
  mail.drawMapVisitorCountChip({}, camera);
  assert(!mail.renderedMapVisitorCountChip.visible);
  saveState(mail.state);
  const reloaded = makeGame(); reloaded.state = loadState();
  reloaded.drawMapVisitorCountChip({}, camera);
  assert(!reloaded.renderedMapVisitorCountChip.visible, '重新打开游戏不重复提醒已经提示过的旧信');
  mail.openReserveLetterInbox();
  assert.equal(mail.infoDetailModal.letters.length, 50);
  assert(mail.infoDetailModal.letters.some(item => item.id === 'replacement' && item.readAt));
  assert(!mail.infoDetailModal.letters.some(item => item.id === 'v0'), '最近50封不能因未读旧信挤掉新信');

  reserve.league.broadcasts = [{ id: 'world', day: 60, title: '世界榜来信', body: '保护区新变化', readAt: 0 }];
  mail.drawMapVisitorCountChip({}, camera);
  clock += 5000;
  mail.drawMapVisitorCountChip({}, camera);
  assert(!mail.renderedMapVisitorCountChip.visible, '世界榜未读信同样只能提醒5秒');
  mail.dailyEventChecklist();
  mail.state.world.goals.daily.objectives.forEach(item => { item.progress = item.target; item.complete = true; });
  mail.drawSandboxOpportunityAggregate({}, camera, plan);
  assert.equal(mail.renderedMapOpportunityAggregate.mode, 'rescue', '已完成每日事项后，邮件过期应恢复待解救入口');

  storage.clear();
  const animal = makeGame();
  animal.state.world.lifeMemory.animalLetters = [{ id: 'animal_test', day: 1, dateKey: '2026-09-11', createdAt: clock, species: '鹿', animalName: '晨角', paragraphs: ['水边很安静。'], readAt: 0 }];
  animal.openReserveLetterInbox({ unreadOnly: true });
  animal.openVisitorLetterReader(animal.infoDetailModal.letters.find(item => item.sourceKind === "animal"), animal.infoDetailModal);
  assert.equal(animal.infoDetailModal.kind, 'animalLetterReader');
  animal.infoDetailModal.choices[0].action();
  assert(animal.infoDetailModal.unreadOnly);
  assert(!animal.infoDetailModal.letters.some(item => item.id === 'animal_test'), '动物信底部返回按钮也必须回到未读列表');

  const chapter1 = makeGame();
  chapter1.state.world.reserve.progression.stage = 1;
  chapter1.state.world.reserve.progression.displayChapter = 1;
  chapter1.state.world.goals = normalizeGoalState(null, chapter1.state);
  const primary = chapter1.currentGoalView().primary || {};
  assert(!chapter1.isTodaysDailyGoal(primary), '每日记录不得再占用第一章当前任务卡');
  chapter1.drawSandboxOpportunityAggregate({}, camera, plan);
  assert.equal(chapter1.renderedMapOpportunityAggregate.mode, 'rescue', '第一章有待解救动物时入口应优先解救');
  const seenKey = chapter1.missionPushKey();
  chapter1.markMissionPushSeen(seenKey);
  const beforeRecruit = JSON.parse(JSON.stringify(chapter1.state));
  chapter1.state = applyGoalProgress(beforeRecruit, chapter1.state, { action: 'viewVisitors' }).state;
  assert(chapter1.state.world.goals.daily.objectives.find((item) => item.kind === 'visitor').complete, '从当前目标招募应完成今日游客每日');
  chapter1.infoDetailModal = null;
  assert.equal(chapter1.maybeOpenMissionPush('settlement', { force: true }), false, '招募后不得再弹出同日每日');
  assert.equal(chapter1.missionPushKey(), seenKey, '同一章同一天每日弹窗键不得因下一项每日而变化');
  clock += 86400000;
  chapter1.currentGoalView(true);
  assert.equal(chapter1.dailyEventChecklist().remaining, 2, '隔日登录可以再次出现每日任务');
  assert.notEqual(chapter1.missionPushKey(), seenKey, '隔日登录应允许再次出现每日');

} finally { Date.now = originalNow; }

// 直接检查清单与邮箱入口在三种手机宽度下的布局和点击范围。
for (const [width, height] of [[320,568], [375,667], [430,932]]) {
  const ui = makeGame(); ui.width = width; ui.height = height; ui.scrollY = 0;
  ui.hitAreas = [];
  ui.drawPremiumParchmentPanel = () => {};
  ui.truncateTextToWidth = (_ctx,text) => text;
  ui.openDailyEvents();
  const ctx = {
    font: '14px sans-serif', fillText() {},
    measureText(text) { return { width: Array.from(String(text)).reduce((sum, ch) => sum + (/[^\x00-\x7f]/.test(ch) ? 1 : .55), 0) * (parseFloat(this.font.match(/([\d.]+)px/)[1]) || 14) }; }
  };
  const buttons = [];
  ui.modalButton = (_ctx,x,y,w,h,label,fill,action) => { buttons.push({ x,y,w,h,label,action }); };
  const bodyH = Math.min(ui.infoDetailModalHeight(ui.infoDetailModal), height - 34) - 178;
  ui.drawDailyEventsContent(ctx, ui.infoDetailModal, 20, 112, width - 40, bodyH);
  const rows = ui.infoDetailModal.renderedDailyItems;
  assert.equal(rows.length, 2, "每日清单只展示游客和水草两项");
  assert.equal(rows.filter(row => row.button).length, 2, '未完成的每日事项都可以直接去做');
  for (let i = 0; i < rows.length; i++) {
    assert(rows[i].y + rows[i].h <= 112 + bodyH);
    assert(rows[i].description.size >= 13 && !rows[i].description.truncated, '描述字号可读且完整换行');
    assert(rows[i].reward.size >= 12 && !rows[i].reward.truncated, '奖励数字高亮且完整换行');
    if (rows[i].button) assert(rows[i].button.y >= rows[i].y + rows[i].h - 24, '按钮不能覆盖两行奖励');
    if (i) assert(rows[i].y >= rows[i-1].y + rows[i-1].h + 4);
  }
  let chosenId;
  ui.executeDailyEvent = id => { chosenId = id; };
  buttons.find(button => button.label.startsWith('去完成')).action();
  assert.equal(chosenId, rows[0].id, '任务按钮准确执行当前每日任务');
  if (ui.infoDetailModal.renderedDailyPagination.pageCount > 1) {
    buttons.find(button => button.label === '下一页').action();
    ui.drawDailyEventsContent(ctx, ui.infoDetailModal, 20, 112, width - 40, bodyH);
    assert.equal(ui.infoDetailModal.renderedDailyItems.length, 1);
    assert(ui.infoDetailModal.renderedDailyItems.every(row => !row.complete), '翻页后仍是未完成事项');
  }
  ui.hitAreas = [];
  ui.drawVisitorMailboxEntry({}, 200, []);
  assert(ui.renderedVisitorMailboxEntry.clickable, '没有邮件时入口也必须可用');
  assert.equal(ui.hitAreas.length, 1);
  ui.hitAreas[0].onTap();
  assert.equal(ui.infoDetailModal.unreadOnly, false, '游客频道打开完整邮箱');
}
delete global.wx;
console.log('daily event/mail entry check ok (daily completion/reset, single slot, 5s expiry, read return, full mailbox, retention, reload, 3 sizes)');
