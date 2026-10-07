'use strict';

const assert = require('node:assert/strict');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

function setupGame(name) {
  const game = Object.create(Game.prototype);
  game.state = createCharacter(null, name);
  game.render = () => {};
  game.toast = () => {};
  game.runtime = { shareAppMessage() {} };
  return game;
}

const game = setupGame('分享来源路由');
const visitorEvent = {
  id: 'visitor_event_1',
  sourceKind: 'visitor',
  kind: 'visitor',
  title: '游客参访记录',
  body: '游客在保护区留下了新的参访记录。'
};
const visitorPostcard = game.buildForestPostcard(visitorEvent);
assert.equal(visitorPostcard.rewardType, 'visitors', 'visitor-originated postcard must be typed as visitors');
const visitorDetail = game.buildForestPostcardDetail(visitorEvent);
const visitorShareRow = visitorDetail.items.find((item) => String(item.title || '').startsWith('获得游客'));
const animalShareRow = visitorDetail.items.find((item) => String(item.title || '').startsWith('获得动物'));
assert.match(visitorShareRow.title, /获得游客 · \+\d+人/, 'visitor postcard detail must preview the visitor increase');
assert.match(animalShareRow.title, /获得动物 · \+\d+只/, 'share board must preview the animal increase');
const { recordShareSent } = require('../js/shareSystem');
recordShareSent(game.state, { shareId: 'route_animals_1', rewardType: 'animals', kind: 'birth' });
recordShareSent(game.state, { shareId: 'route_animals_2', rewardType: 'animals', kind: 'birth' });
const exhaustedAnimalDetail = game.buildForestPostcardDetail(visitorEvent);
assert.equal(exhaustedAnimalDetail.items.some((item) => String(item.title || '').startsWith('获得动物')), false, 'used-up 获得动物 text must leave the share board');
const visitorLeft = exhaustedAnimalDetail.items.find((item) => String(item.title || '').startsWith('获得游客'));
assert.match(visitorLeft.title, /获得游客 · \+\d+人/, 'a remaining visitor share must show the real increase');
recordShareSent(game.state, { shareId: 'route_visitors_1', rewardType: 'visitors', kind: 'daily' });
recordShareSent(game.state, { shareId: 'route_visitors_2', rewardType: 'visitors', kind: 'daily' });
const exhaustedBoth = game.buildForestPostcardDetail(visitorEvent);
assert.equal(exhaustedBoth.items.some((item) => /获得动物|获得游客/.test(String(item.title || ''))), false, 'used-up visitor and animal rewards must both leave the share board');
const exhaustedProgress = game.buildChapterProgressDetail();
assert.equal((exhaustedProgress.metricDetails.animals.items || []).some((item) => item.tag === '分享任务'), false, 'used-up animal share task is not baked into the animal card');
game.render = () => {};
game.openCoreMetricDetail('animals');
game.openCoreMetricDetail('visitors');
assert.equal(game.infoDetailModal.kind, 'visitorMetricDetail', 'visitor total dropdown is the visitor card');
assert.equal(game.infoDetailModal.items.some((item) => item.tag === '分享任务'), false, 'used-up visitor share task is removed from the visitor dropdown');
game.openCoreMetricDetail('animals');
assert.equal(game.infoDetailModal.kind, 'animalMetricDetail', 'animal total dropdown is the animal card');
assert.equal(game.infoDetailModal.items.some((item) => item.tag === '分享任务'), false, 'used-up animal share task is removed from the animal dropdown');
const freshGame = setupGame('分享任务还在');
freshGame.openCoreMetricDetail('animals');
const freshShareTask = freshGame.infoDetailModal.items.find((item) => item.tag === '分享任务');
assert.match(freshShareTask.title, /获得动物 · \+\d+只/, 'an available animal share shows the increase on the total card');
freshGame.openCoreMetricDetail('visitors');
const freshVisitorTask = freshGame.infoDetailModal.items.find((item) => item.tag === '分享任务');
assert.match(freshVisitorTask.title, /获得游客 · \+\d+人/, 'an available visitor share shows the increase on the total card');

const animalEvent = {
  id: 'animal_event_1',
  sourceKind: 'animal',
  kind: 'birth',
  species: '鹿',
  title: '新生命',
  body: '一只幼鹿出生了。'
};
const animalPostcard = game.buildForestPostcard(animalEvent);
assert.equal(animalPostcard.rewardType, 'animals', 'animal-originated postcard must remain typed as animals');

// The WeChat global share callback must reuse the source-specific postcard
// that the player just shared; it must not rebuild the daily animal postcard.
const callbackGame = setupGame('微信分享回调来源路由');
let onShareAppMessage = null;
callbackGame.runtime = {
  onShareAppMessage(handler) { onShareAppMessage = handler; },
  shareAppMessage() {}
};
callbackGame.configureSharing();
assert.equal(typeof onShareAppMessage, 'function', 'global share callback should be registered');
const visitorLetter = { id: 'visitor_letter_1', day: 1, title: '游客来信', body: '感谢你的守护。', sourceKind: 'visitor' };
callbackGame.shareVisitorLetter(visitorLetter);
assert.equal((callbackGame.state.ui.shareRewards || []).length, 0, 'tapping share must not grant a reward before the share action completes');
const settledVisitor = callbackGame.settlePendingShareReward('success');
assert.equal(settledVisitor.reward.rewardType, 'visitors', 'visitor letter sharing must settle a visitor reward after the share completes');
const visitorReward = callbackGame.state.ui.shareRewards.at(-1);
assert.equal(visitorReward.rewardType, 'visitors', 'completed visitor share must add visitors');
const callbackVisitorPostcard = onShareAppMessage();
assert.match(callbackVisitorPostcard.title, /游客|保护区/, 'visitor callback should keep the visitor share title');
assert.equal(callbackGame.state.ui.shareRewards.length, 1, 'callback must not settle a second reward');

const { consumeVisitorRecruitment } = require('../js/visitorRecruitment');
const { shareRewardPreview, pickActiveShareRewardType } = require('../js/shareSystem');
const recruited = setupGame('招募后游客分享仍加游客');
consumeVisitorRecruitment(recruited.state.world.reserve, 1, 0.5, Date.now());
const recruitedOps = recruited.state.world.reserve.development.operations;
recruitedOps.letters = (recruitedOps.letters || []).concat({
  id: 'visitor_letter_recruit_flow',
  day: 1,
  title: '招募后来信',
  body: '新游客到了。',
  readAt: 0
});
recruited.state.world.lifeMemory = Object.assign({}, recruited.state.world.lifeMemory || {}, {
  animalLetters: [{
    id: 'animal_letter_after_recruit',
    day: 1,
    species: '鹿',
    animalName: '晨角',
    title: '泥岸上的信',
    paragraphs: ['我看见新的脚印。'],
    readAt: 0
  }]
});
assert.equal(
  shareRewardPreview(recruited.state, { rewardType: 'visitors', species: '鹿', kind: 'birth' }).rewardType,
  'visitors',
  'visitor share preview must ignore leftover animal species/kind'
);
recruited.openVisitorShareFlow();
assert.equal(recruited.infoDetailModal.shareRewardType, 'visitors', 'visitor share flow must stamp a visitor reward source');
assert.ok(
  (recruited.infoDetailModal.letters || []).every((letter) => letter.sourceKind !== 'animal'),
  'visitor share inbox must not mix animal letters into the reward path'
);
const afterRecruitLetter = { id: 'visitor_letter_after_recruit', day: 1, title: '招募后来信', body: '新游客到了。', sourceKind: 'visitor' };
recruited.shareVisitorLetter(afterRecruitLetter);
assert.equal((recruited.state.ui.shareRewards || []).length, 0, 'visitor share tap after recruitment must still wait for the completed share');
recruited.settlePendingShareReward('success');
assert.equal(recruited.state.ui.shareRewards.at(-1).rewardType, 'visitors', 'sharing from visitors after recruitment must still add visitors');

// The visitor discovery page must not open the unified inbox after recruitment:
// a newly generated unread animal letter must never become the visitor share action.
const visitorMailbox = setupGame('游客页邮箱来源锁定');
visitorMailbox.state.world.reserve.development.operations.letters = [{
  id: 'visitor_mailbox_letter', day: 1, title: '游客来信', body: '游客参访记录', readAt: 0
}];
visitorMailbox.state.world.lifeMemory = Object.assign({}, visitorMailbox.state.world.lifeMemory || {}, {
  animalLetters: [{ id: 'animal_mailbox_letter', day: 2, title: '动物来信', species: '鹿', animalName: '晨角', paragraphs: ['新的脚印。'], readAt: 0 }]
});
visitorMailbox.drawPremiumParchmentPanel = () => {};
visitorMailbox.drawUiIcon = () => true;
visitorMailbox.drawSmallGlyph = () => {};
visitorMailbox.text = () => {};
visitorMailbox.addHit = (_x, _y, _w, _h, action) => { visitorMailbox.mailboxAction = action; };
visitorMailbox.drawVisitorMailboxEntry({}, 0, visitorMailbox.allIncomingLetters());
visitorMailbox.mailboxAction();
assert.equal(visitorMailbox.infoDetailModal.shareRewardType, 'visitors', 'visitor page mailbox must lock the visitor reward source');
assert.ok((visitorMailbox.infoDetailModal.letters || []).every((letter) => letter.sourceKind !== 'animal'), 'visitor page mailbox must exclude animal letters from visitor sharing');

const animalShare = setupGame('动物入口只加动物');
animalShare.shareAnimalLetter({
  id: 'animal_share_letter',
  day: 1,
  species: '鹿',
  animalName: '晨角',
  title: '动物来信',
  paragraphs: ['今天还在这里。']
});
assert.equal((animalShare.state.ui.shareRewards || []).length, 0, 'animal share tap must not grant before the share completes');
animalShare.settlePendingShareReward('success');
assert.equal(animalShare.state.ui.shareRewards.at(-1).rewardType, 'animals', 'sharing from animals must add animals');

const staleMenu = setupGame('过期菜单分享不得改奖励类型');
staleMenu.runtime = {
  onShareAppMessage(handler) { onShareAppMessage = handler; },
  shareAppMessage() {}
};
staleMenu.configureSharing();
staleMenu.shareVisitorLetter(visitorLetter);
staleMenu.settlePendingShareReward('success');
staleMenu.pendingSharePostcard = {
  postcard: staleMenu.buildForestPostcard(visitorEvent),
  createdAt: Date.now() - 20000,
  awaitingReward: true,
  hiddenAt: 0
};
onShareAppMessage();
assert.equal(staleMenu.state.ui.shareRewards.length, 1, 'stale WeChat menu share must not grant a second animal reward');
assert.equal(staleMenu.state.ui.shareRewards[0].rewardType, 'visitors', 'stale menu share must not rewrite the visitor reward');

const clipboardGame = setupGame('复制文案不得发奖');
clipboardGame.runtime = {
  setClipboardData({ success }) { if (success) success(); }
};
clipboardGame.shareVisitorLetter(visitorLetter);
assert.equal((clipboardGame.state.ui.shareRewards || []).length, 0, 'clipboard fallback must not grant a share reward');
assert.equal(clipboardGame.pendingSharePostcard, null, 'clipboard fallback must not leave a pending share reward');

const returnShare = setupGame('从分享页返回才发奖');
returnShare.shareVisitorLetter(visitorLetter);
assert.equal((returnShare.state.ui.shareRewards || []).length, 0, 'opening the share sheet must not grant yet');
assert.equal(returnShare.settlePendingShareReward('return').reason, 'not_hidden', 'returning without leaving the game must not grant');
returnShare.notePendingShareHidden(Date.now() - 800);
const returned = returnShare.settlePendingShareReward('return');
assert.equal(returned.reward.rewardType, 'visitors', 'returning from a completed WeChat share must grant the visitor reward');
assert.equal(returned.reward.after - returned.reward.before, returned.reward.amount, 'visitor share must change the live visitor total by the granted amount');

const panelReturn = setupGame('分享面板未切后台');
panelReturn.shareVisitorLetter(visitorLetter);
panelReturn.pendingSharePostcard.createdAt = Date.now() - 1500;
const panelGranted = panelReturn.settlePendingShareReward('return');
assert.equal(panelGranted.reward && panelGranted.reward.rewardType, 'visitors', 'returning from the share sheet must grant even when WeChat did not hide the game');
assert.equal(panelGranted.reward.after - panelGranted.reward.before, panelGranted.reward.amount, 'the granted visitor amount must be the live increase');

const twice = setupGame('连续两次分享都增加动物');
twice.shareForestPostcard(null, { rewardType: 'animals', sourceKind: 'animal', kind: 'birth' });
twice.pendingSharePostcard.createdAt = Date.now() - 1500;
const firstAnimalShare = twice.settlePendingShareReward('return');
twice.shareForestPostcard(null, { rewardType: 'animals', sourceKind: 'animal', kind: 'birth' });
twice.pendingSharePostcard.createdAt = Date.now() - 1500;
const secondAnimalShare = twice.settlePendingShareReward('return');
assert.equal(firstAnimalShare.reward && firstAnimalShare.reward.rewardType, 'animals', 'the first animal share must add animals');
assert.equal(firstAnimalShare.reward.after - firstAnimalShare.reward.before, firstAnimalShare.reward.amount, 'the first animal share must match the displayed increase');
assert.ok(secondAnimalShare.reward && secondAnimalShare.reward.amount > 0, 'the second animal share in the same chapter must also add animals');
assert.equal(secondAnimalShare.reward.after - firstAnimalShare.reward.after, secondAnimalShare.reward.amount, 'the second animal share must stack on the first');

const aged = setupGame('回到游戏后发放并去掉分享任务');
aged.shareMetricReward('animals');
assert.equal((aged.state.ui.shareRewards || []).length, 0, 'tapping the animal share task must not grant before the share finishes');
assert.equal(aged.state.ui.pendingShareReward.postcard.rewardType, 'animals', 'the animal share must stay pending across a reload');
assert.equal(aged.settleAgedShareReward(Date.now()), null, 'a share that just opened must not grant immediately');
aged.pendingSharePostcard.createdAt = Date.now() - 1000;
const agedAnimal = aged.settleAgedShareReward(Date.now());
assert.equal(agedAnimal.reward.rewardType, 'animals', 'an animal share must add animals after the player returns');
assert.equal(agedAnimal.reward.after - agedAnimal.reward.before, agedAnimal.reward.amount, 'the animal increase must match the granted amount');
aged.shareMetricReward('animals');
aged.pendingSharePostcard.createdAt = Date.now() - 1000;
const agedAnimalAgain = aged.settleAgedShareReward(Date.now());
assert.ok(agedAnimalAgain.reward && agedAnimalAgain.reward.amount > 0, 'the second animal share must also add animals');
aged.openCoreMetricDetail('animals');
assert.equal(aged.infoDetailModal.items.some((item) => item.tag === '分享任务'), false, 'closing and reopening the animal card must drop the share task after two uses');

const agedVisitors = setupGame('游客分享回游戏后入账');
agedVisitors.shareMetricReward('visitors');
agedVisitors.pendingSharePostcard.createdAt = Date.now() - 1000;
const agedVisitor = agedVisitors.settleAgedShareReward(Date.now());
agedVisitors.shareMetricReward('visitors');
agedVisitors.pendingSharePostcard.createdAt = Date.now() - 1000;
const agedVisitorAgain = agedVisitors.settleAgedShareReward(Date.now());
assert.equal(agedVisitor.reward.rewardType, 'visitors', 'a visitor share must add visitors after the player returns');
assert.equal(agedVisitorAgain.reward.after - agedVisitor.reward.after, agedVisitorAgain.reward.amount, 'the second visitor share must add on top of the first');
agedVisitors.openCoreMetricDetail('visitors');
assert.equal(agedVisitors.infoDetailModal.items.some((item) => item.tag === '分享任务'), false, 'closing and reopening the visitor card must drop the share task after two uses');

const reloaded = setupGame('分享后重载仍发放');
reloaded.shareMetricReward('visitors');
const savedPending = reloaded.state.ui.pendingShareReward;
reloaded.pendingSharePostcard = null;
savedPending.createdAt = Date.now() - 1500;
reloaded.state.ui.pendingShareReward = savedPending;
const resumed = reloaded.settleAgedShareReward(Date.now());
assert.equal(resumed.reward.rewardType, 'visitors', 'a reloaded game must still grant the pending visitor share');

const picker = setupGame('主动分享随机选择');
assert.equal(pickActiveShareRewardType(picker.state, () => 0.1), 'animals', 'unused mail share can pick animals');
assert.equal(pickActiveShareRewardType(picker.state, () => 0.9), 'visitors', 'unused mail share can pick visitors');
picker.state.ui.shareRewardChapters = { 1: { animals: 1, visitors: 0 } };
assert.equal(pickActiveShareRewardType(picker.state, () => 0.1), 'visitors', 'after an animal mail share the next active share prefers visitors');
picker.state.ui.shareRewardChapters = { 1: { animals: 2, visitors: 0 } };
assert.equal(pickActiveShareRewardType(picker.state, () => 0.1), 'visitors', 'exhausted animal quota forces visitor mail shares');
picker.state.ui.shareRewardChapters = { 1: { animals: 0, visitors: 2 } };
assert.equal(pickActiveShareRewardType(picker.state, () => 0.9), 'animals', 'exhausted visitor quota forces animal mail shares');

const mailVisitor = setupGame('邮件主动分享可加游客');
mailVisitor.shareRewardRandom = () => 0.9;
mailVisitor.state.world.lifeMemory = Object.assign({}, mailVisitor.state.world.lifeMemory || {}, {
  animalLetters: [{
    id: 'mail_animal_random_visitor',
    dateKey: '2026-09-22',
    createdAt: 1,
    day: 1,
    species: '鹿',
    animalName: '晨角',
    title: '泥岸上的信',
    paragraphs: ['我看见新的脚印。'],
    readAt: 0
  }]
});
mailVisitor.openReserveLetterInbox();
assert.equal(mailVisitor.infoDetailModal.shareRewardType, '', 'map mail inbox must not lock the reward type');
const mailAnimalLetter = mailVisitor.infoDetailModal.letters.find((letter) => letter.id === 'mail_animal_random_visitor');
assert.ok(mailAnimalLetter, 'map mail inbox must include the animal letter');
mailVisitor.openVisitorLetterReader(mailAnimalLetter, mailVisitor.infoDetailModal);
assert.equal(mailVisitor.infoDetailModal.kind, 'animalLetterReader', 'mail animal letters still use the illustrated reader');
assert.equal(mailVisitor.infoDetailModal.shareRewardType, 'visitors', 'active mail share can grant visitors even for an animal letter');
const mailVisitorShare = (mailVisitor.infoDetailModal.choices || []).find((choice) => /分享/.test(choice.label));
assert.ok(mailVisitorShare, 'mail letter reader must expose a share action');
mailVisitorShare.action();
assert.equal((mailVisitor.state.ui.shareRewards || []).length, 0, 'mail share tap must wait for the completed share');
mailVisitor.settlePendingShareReward('success');
assert.equal(mailVisitor.state.ui.shareRewards.at(-1).rewardType, 'visitors', 'completed active mail share can add visitors');

const mailAnimal = setupGame('邮件主动分享可加动物');
mailAnimal.shareRewardRandom = () => 0.1;
mailAnimal.state.world.reserve.development.operations.letters = [{
  id: 'mail_visitor_random_animal',
  day: 1,
  title: '游客来信',
  body: '感谢你的守护。',
  sourceKind: 'visitor',
  readAt: 0
}];
mailAnimal.openReserveLetterInbox();
mailAnimal.openVisitorLetterReader(mailAnimal.infoDetailModal.letters[0], mailAnimal.infoDetailModal);
assert.equal(mailAnimal.infoDetailModal.shareRewardType, 'animals', 'active mail share can grant animals even for a visitor letter');
mailAnimal.infoDetailModal.action();
mailAnimal.settlePendingShareReward('success');
assert.equal(mailAnimal.state.ui.shareRewards.at(-1).rewardType, 'animals', 'completed active mail share can add animals');

const lockedVisitor = setupGame('游客入口仍锁定游客');
lockedVisitor.shareRewardRandom = () => 0.1;
lockedVisitor.state.world.reserve.development.operations.letters = [{
  id: 'locked_visitor_letter',
  day: 1,
  title: '游客来信',
  body: '感谢你的守护。',
  sourceKind: 'visitor',
  readAt: 0
}];
lockedVisitor.openReserveLetterInbox({ shareRewardType: 'visitors' });
lockedVisitor.openVisitorLetterReader(lockedVisitor.infoDetailModal.letters[0], lockedVisitor.infoDetailModal);
assert.equal(lockedVisitor.infoDetailModal.shareRewardType, 'visitors', 'visitor entry must stay visitor-only even when the mail picker would choose animals');

console.log('share source routing check ok (visitor and animal rewards stay isolated)');
