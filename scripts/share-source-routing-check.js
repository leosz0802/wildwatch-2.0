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
assert.match(visitorDetail.items.find((item) => item.tag === '分享奖励').title, /游客/, 'visitor postcard detail must preview a visitor reward');

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
