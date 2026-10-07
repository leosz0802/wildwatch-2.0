'use strict';

const assert = require('node:assert/strict');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

const game = Object.create(Game.prototype);
game.state = createCharacter(null, '自己的保护区');
game.leagueScope = 'world';
game.render = () => {};
game.cloudService = { myRank: 5, feature: () => true, rows: [], friendRows: [] };
game.raidChance = () => 42;

const ownRow = {
  id: 'mine', mine: true, name: '我的自然保护区', owner: '我', reserveName: '自然保护区',
  valuation: 8676, level: 2, animals: 323, shield: 48, profileComplete: true,
  avatarUrl: 'https://example.com/avatar.png', rank: 5, scope: 'world'
};

game.openLeaguePlayerDetail(ownRow, 5);
const modal = game.infoDetailModal;
assert(modal && modal.friendProfile, '世界榜自己的详情必须使用统一紧凑卡片');
assert.deepEqual(modal.items.map((item) => item.tag), ['市值', '等级', '动物']);
assert.deepEqual(modal.friendProfileMetrics.map((item) => item.label), ['市值', '等级', '动物']);
assert.equal(modal.friendProfileMetrics[0].value, 8676);
assert.equal(modal.friendProfileMetrics[1].value, '等级2');
assert.equal(modal.friendProfileMetrics[2].value, '323只');
assert.equal(modal.worldRank, 5, '自己的世界排名必须保留');
assert.match(modal.profileFootnote, /当前保护区/);

let avatarCalls = 0;
game.wechatFriends = {
  drawWorldAvatar(_ctx, x, y, size, row) {
    avatarCalls += 1;
    assert.equal(row.avatarUrl, ownRow.avatarUrl, '自己的头像地址必须传入开放数据头像渲染');
    return { source: 'wechat-open-data', x, y, size };
  }
};
game.drawModalHeaderIcon({}, modal, 40, 40, 50);
assert.equal(avatarCalls, 1, '详情卡片应优先调用开放数据头像');
assert.equal(modal.renderedPlayerAvatar.source, 'wechat-open-data');

game.drawPremiumParchmentPanel = () => {};
game.roundRect = () => {};
game.text = () => {};
game.fitTextSize = (_ctx, value) => Math.min(15, String(value || '').length ? 15 : 10);
game.truncateTextToWidth = (_ctx, value) => String(value || '');
game.drawLinkedFriendProfileContent({}, modal, 0, 0, 375, 300);
assert.equal(modal.renderedInfoItems.length, 3, '自己的卡片只展示三项核心指标');

console.log('world own detail consistency check ok: own world profile uses the unified card, rank and avatar path');
