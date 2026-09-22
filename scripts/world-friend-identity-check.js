const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const { friendMatchKey, matchWorldFriend } = require('../open-data/worldIdentity');
const { WechatFriendController } = require('../js/wechatFriendSystem');
for (const openid of ['openid-user-one', 'openid-user-two', 'a'.repeat(80)]) {
  assert.equal(friendMatchKey(openid), crypto.createHash('sha256').update('wild-friend-v1:' + openid).digest('hex'));
}
assert.equal(matchWorldFriend({ id: 'other', valuation: 13140 }, [{ worldPlayerId: 'one', valuation: 13140 }]), null);
assert.equal(matchWorldFriend({ id: 'cloud_one' }, [{ worldPlayerId: 'one', title: 'correct' }]).title, 'correct');
assert.equal(matchWorldFriend({ id: 'one' }, [{ worldPlayerId: 'one' }, { worldPlayerId: 'one' }]), null);
assert.equal(matchWorldFriend({ friendMatchKey: friendMatchKey('keep') }, [
  { friendMatchKey: friendMatchKey('keep'), title: 'first' },
  { friendMatchKey: friendMatchKey('keep'), title: 'copy' }
]).title, 'first');
assert.equal(matchWorldFriend({ id: 'cloud_one', friendMatchKey: friendMatchKey('keep') }, [
  { worldPlayerId: 'one', title: 'decoy', fromWorld: true },
  { worldPlayerId: '', friendMatchKey: friendMatchKey('keep'), title: 'real' }
]).title, 'real');
const names = ['Nicole.英', '蘭陵王', 'Bobi波比深圳'];
const scores = [13140, 11856, 11328];
const levels = [4, 4, 3], animals = [395, 288, 394];
const users = names.map((nickname, i) => ({ nickname, avatarUrl: 'avatar-' + i,
  KVDataList: [{ key: 'wild_guardian_rank_v1', value: JSON.stringify({
    name: '自然保护区', valuation: scores[i], level: levels[i], animals: animals[i],
    friendMatchKey: friendMatchKey('test-friend-' + i)
  }) }] }));
const world = names.map((_, i) => ({ id: 'cloud_account-' + i, friendMatchKey: friendMatchKey('test-friend-' + i),
  title: '匿名玩家' + i, rank: 15 + i, valuation: scores[i] + 100, level: levels[i], animals: animals[i] + 5 }));
const text = [], callbacks = [], messages = [];
let onMessage;
const gradient = { addColorStop() {} };
const context = new Proxy({}, { get(target, key) {
  if (key === 'measureText') return value => ({ width: String(value).length * 5 });
  if (key === 'fillText') return value => text.push(String(value));
  if (key === 'createLinearGradient') return () => gradient;
  return target[key] || (() => {});
} });
const canvas = { width: 340, height: 200, getContext: () => context };
vm.runInNewContext(fs.readFileSync(require.resolve('../open-data/index'), 'utf8'), {
  require: name => name === './worldIdentity' ? { friendMatchKey, matchWorldFriend } : null,
  wx: { getSharedCanvas: () => canvas, onMessage: cb => { onMessage = cb; },
    getFriendCloudStorage: options => callbacks.push(options), createImage: () => ({}) }, module: { exports: {} }
});
const show = { type: 'world_rank_show', width: 340, height: 192, rowsJson: JSON.stringify(world) };
onMessage(show);
callbacks.pop().success({ data: users });
for (const name of names) assert(text.includes(name + '的自然'), 'world canvas must render actual WeChat nickname without openid: ' + name);
text.length = 0;
onMessage({ ...show, titleSize: 18, rowsJson: JSON.stringify([world[0]]) });
assert(text.includes(names[0] + '的自然'), 'detail heading must reuse the same WeChat nickname');
onMessage(show);
assert(text.includes('13240'), 'world score must stay server authoritative when friend score differs');
assert(!text.includes('11856'), 'friend snapshots must not replace the world score');
const before = callbacks.length;
onMessage({ ...show, rowsJson: JSON.stringify(world.slice(1)) });
assert.equal(callbacks.length, before, 'pagination reuses loaded friend identity data');
onMessage({ type: 'friend_rank_show', width: 340, height: 420 });
assert.equal(callbacks.length, before, 'friend tab reuses loaded WeChat friend storage');
onMessage({ type: 'friend_rank_show', width: 340, height: 420, reload: true });
const stale = callbacks.pop();
onMessage(show);
assert.equal(callbacks.length, before, 'world tab does not start a second friend-storage request');
text.length = 0;
stale.success({ data: [] });
assert.equal(text.length, 0, 'late friend-tab callbacks must not clear the world surface');
onMessage({ type: 'friend_rank_show', width: 340, height: 420, reload: true });
const failed = callbacks.pop();
failed.fail({ errMsg: 'getFriendCloudStorage:fail concurrent' });
assert.equal(callbacks.length, before + 1, 'a collided friend-storage read should retry after the hosted write');
const controller = new WechatFriendController({ getOpenDataContext: () => ({ canvas, postMessage: msg => messages.push(msg) }) });
controller.drawWorldRows(context, 0, 0, 340, 192, world.map(row => ({ ...row, name: row.title })));
assert.equal(messages.at(-1).type, 'world_rank_show');
const sentCount = messages.length;
controller.drawWorldRows(context, 0, 0, 340, 192, world.map(row => ({ ...row, name: row.title })));
assert.equal(messages.length, sentCount, 'steady frames must not repeatedly fetch friend records');
assert(Object.values(messages.at(-1)).every(value => ['string','number','boolean'].includes(typeof value)));
console.log('world friend identity check ok: three real nickname surfaces, exact identity, authoritative ranking, stale callbacks, pagination');
