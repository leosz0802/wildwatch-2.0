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
} finally { Date.now = oldNow; }

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
const landed = { phase: 'result', displayRoll: 2, archeryAimValue: .18, archeryPerfect: false };
game.drawArcheryStage(game.ctx, landed, 24, 80, 280, 260, {});
const hit = landed.renderedArcheryHitArrow;
assert(hit && hit.landed, 'a finished shot must leave an arrow on the target');
assert(hit.angle < -.7 && hit.angle > -2.6, 'landed arrow must follow the bow-to-target flight instead of sitting flat');
assert(Math.abs(hit.angle + .18) > .4, 'landed arrow must not keep the old nearly-horizontal tilt');
const center = { phase: 'result', displayRoll: 6, archeryAimValue: .5, archeryPerfect: true };
game.drawArcheryStage(game.ctx, center, 24, 80, 280, 260, {});
assert(Math.abs(center.renderedArcheryHitArrow.angle + Math.PI / 2) < .08, 'a center hit must stick in from below');

console.log('archery angle score check ok (deterministic angle lock, easy hit / hard Perfect, symmetric edges)');
