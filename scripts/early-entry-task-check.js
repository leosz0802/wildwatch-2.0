const assert = require('assert');
const { Game } = require('../js/game');
const { createCharacter } = require('../js/storage');

const game = Object.create(Game.prototype);
game.state = createCharacter(null, '入口引导测试');
game.render = () => {};
game.missionExperienceSeconds = () => 120;
game.onboardingProgress = () => ({ active: true });

game.openTourismDestinationDetail();
assert.equal(game.infoDetailModal.kind, 'tourismProgress');
assert.equal(game.infoDetailModal.kicker, '新手任务 · 查看旅游圣地');
assert(game.infoDetailModal.footer.includes('已查看旅游入口'));
assert.equal(game.state.ui.tourismEntryTaskSeen, true);

// 已完成入口引导后，仍保留正常的晋级详情语义。
game.missionExperienceSeconds = () => 360;
game.openTourismDestinationDetail();
assert.equal(game.infoDetailModal.kicker, '旅游圣地 · 晋级路径');

console.log('early entry task check ok (first 5 minutes tourism guidance and normal follow-up)');
