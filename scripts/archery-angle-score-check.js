const assert = require('assert');
const { Game } = require('../js/game');

const game = new Game();
game.stopLoop();
const score = (aim) => game.archeryScoreFor({ archeryAimValue: aim });
assert.strictEqual(score(.5), 6, 'center hit must score 6');
assert(score(.25) < score(.5), 'left/right offset must reduce score');
assert(score(.75) === score(.25), 'symmetric angles must score equally');
assert.strictEqual(score(0), 1, 'outer edge must score 1');
assert.strictEqual(score(1), 1, 'opposite outer edge must score 1');

const modal = { archeryAimStartedAt: 1000 };
const oldNow = Date.now;
try {
  Date.now = () => 1000;
  assert.strictEqual(game.archeryAimValueFor(modal), .5, 'launcher starts at center phase deterministically');
  Date.now = () => 1000 + (Math.PI / 2) / .0042;
  const first = game.archeryAimValueFor(modal);
  assert(first > .99, 'launcher angle must follow elapsed swing phase');
  assert.strictEqual(game.archeryScoreFor({ archeryAimValue: first }), 1, 'locked angle determines edge score');
} finally { Date.now = oldNow; }

console.log('archery angle score check ok (deterministic angle lock, target distance scoring, symmetric edges)');
