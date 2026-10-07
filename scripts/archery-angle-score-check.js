const assert = require('assert');
const { Game } = require('../js/game');

const game = new Game();
game.stopLoop();
const score = (aim) => game.archeryScoreFor({ archeryAimValue: aim });
assert.strictEqual(score(.5), 6, 'center hit must score 6');
assert.strictEqual(score(.4), 5, 'near-center should still be a high but not perfect score');
assert.ok(score(.25) >= 3 && score(.25) < score(.5), 'ordinary band must still hit, but below a center shot');
assert.strictEqual(score(.75), score(.25), 'symmetric angles must score equally');
assert.strictEqual(score(0), 1, 'outer edge must score 1');
assert.strictEqual(score(1), 1, 'opposite outer edge must score 1');
assert.ok(score(.47) >= 5, 'the widened center band should remain easy to land');
assert.strictEqual(score(.48), 6, 'only a tight center window is Perfect');
assert.notEqual(score(.42), 6, 'a visible near-miss must not award Perfect');

const modal = { archeryAimStartedAt: 1000 };
const oldNow = Date.now;
try {
  Date.now = () => 1000;
  assert.strictEqual(game.archeryAimValueFor(modal), .5, 'launcher starts at center phase deterministically');
  const rate = game.archeryAimSwingRate();
  Date.now = () => 1000 + (Math.PI / 2) / rate;
  const first = game.archeryAimValueFor(modal);
  assert(first > .99, 'launcher angle must follow elapsed swing phase');
  assert.strictEqual(game.archeryScoreFor({ archeryAimValue: first }), 1, 'locked angle determines edge score');
  const period = (Math.PI * 2) / rate;
  assert(period > 2850 && period < 3150, 'pointer tempo should stay slower and readable');
  const recovered = { kind: 'neighborEventDice', phase: 'ready' };
  Date.now = () => 5000;
  assert.ok(game.isArcheryAimingModal(recovered), 'a ready real-event card must count as aiming even without a clock');
  assert.strictEqual(game.archeryAimValueFor(recovered), .5, 'a recovered clock still starts at center');
  assert.strictEqual(recovered.archeryAimStartedAt, 5000, 'a missing aim clock must start itself');
  Date.now = () => 5000 + (Math.PI / 2) / rate;
  assert(game.archeryAimValueFor(recovered) > .99, 'a recovered clock must keep swinging');
} finally { Date.now = oldNow; }

game.screen = 'home';
game.gesture = null;
game.infoDetailModal = { kind: 'neighborEventDice', phase: 'ready', archeryAimStartedAt: Date.now() };
assert.ok(game.targetFrameMs() <= 50, 'ready archery cards must redraw fast enough for the needle to move');
game.infoDetailModal = { kind: 'neighborEventDice', phase: 'ready', archeryAimValue: .5 };
assert.ok(game.targetFrameMs() >= 150, 'a locked aim should not keep the modal at animation rate');
game.infoDetailModal = null;

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === 'measureText') return (text) => ({ width: String(text || '').length * 7 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'canvas') return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set() { return true; }
  });
}

game.ctx = fakeContext();
game.width = 375;
game.height = 667;
const landed = { kind: 'neighborEventDice', phase: 'result', displayRoll: 2, archeryAimValue: .18, archeryPerfect: false };
game.drawArcheryStage(game.ctx, landed, 24, 80, 280, 260, {});
const hit = landed.renderedArcheryHitArrow;
assert(hit && hit.landed, 'a finished shot must leave an arrow on the target');
assert(hit.angle < -.7 && hit.angle > -2.6, 'landed arrow must follow the bow-to-target flight instead of sitting flat');
assert(Math.abs(hit.angle + .18) > .4, 'landed arrow must not keep the old nearly-horizontal tilt');
const center = { kind: 'neighborEventDice', phase: 'result', displayRoll: 6, archeryAimValue: .5, archeryPerfect: true };
game.drawArcheryStage(game.ctx, center, 24, 80, 280, 260, {});
assert(Math.abs(center.renderedArcheryHitArrow.angle + Math.PI / 2) < .08, 'a center hit must stick in from below');

const unlocked = { kind: 'materialExploration', explorationMode: 'archery', phase: 'resolved', displayRoll: 5, resultScore: 5, archeryAimStartedAt: 1000 };
const firstAim = game.archeryAimValueFor(unlocked, 1000);
const laterAim = game.archeryAimValueFor(unlocked, 1000 + 800);
assert.strictEqual(firstAim, laterAim, '落靶后瞄准角必须锁死，不能继续摆动');
assert.ok(Number.isFinite(Number(unlocked.archeryAimValue)), '确认得分页必须写下锁定瞄准角');
game.drawArcheryStage(game.ctx, unlocked, 24, 80, 280, 260, {});
const firstHit = Object.assign({}, unlocked.renderedArcheryHitArrow);
unlocked.archeryAimStartedAt = 1000;
game.drawArcheryStage(game.ctx, unlocked, 24, 80, 280, 260, {});
assert.strictEqual(unlocked.renderedArcheryHitArrow.x, firstHit.x, '确认页箭位不能随时间在靶上移动');
assert.strictEqual(unlocked.renderedArcheryHitArrow.y, firstHit.y, '确认页箭位必须停在落点');
assert.strictEqual(game.archeryScoreFor({ archeryAimValue: unlocked.archeryAimValue }), 5, '锁定位必须对应本次 5 点');

game.hitAreas = [];
const visualOnly = { kind: 'neighborEventDice', phase: 'ready', archeryAimStartedAt: 1000 };
game.drawArcheryStage(game.ctx, visualOnly, 24, 80, 280, 260, { externalControls: true });
assert.strictEqual(game.hitAreas.length, 0, 'footer-controlled archery must not register hidden target or compass fire hits');
game.hitAreas = [];
const selfFire = { kind: 'collectionDice', phase: 'ready', archeryAimStartedAt: 1000 };
game.drawArcheryStage(game.ctx, selfFire, 24, 80, 280, 260, {});
assert.strictEqual(game.hitAreas.length, 1, 'dice input pages expose only the footer action');

console.log('archery angle score check ok (deterministic angle lock, easy hit / hard Perfect, symmetric edges)');
