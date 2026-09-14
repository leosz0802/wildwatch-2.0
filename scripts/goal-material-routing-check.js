const assert = require("node:assert/strict");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

// 目标卡点击后，如果行动缺少补给，必须进入物资页而不是打开不可提交的巡护卡。
const game = Object.create(Game.prototype);
game.state = createCharacter(null, "物资路由测试");
game.screen = "home";
game.activeTaskLock = null;
game.infoDetailModal = { kind: "missionPush" };
game.setScreen = (screen) => { game.screen = screen; };
game.toast = (message) => { game.lastToast = message; };
game.render = () => {};
game.actionResourceStatus = Game.prototype.actionResourceStatus;
game.canOpenMaterialsForMissing = Game.prototype.canOpenMaterialsForMissing;
game.openMaterialsForMissing = Game.prototype.openMaterialsForMissing;
game.executeGoalAction = Game.prototype.executeGoalAction;

const reserve = game.state.world.reserve;
reserve.supplies = Object.assign({}, reserve.supplies, { fieldKit: 0 });
const opened = game.executeGoalAction({
  id: "goal-water-repair",
  kind: "stage",
  recommendedAction: "habitat",
  title: "修复水源"
});

assert.equal(opened, true, "缺少物资时目标入口仍应完成路由");
assert.equal(game.screen, "role", "缺少物资时必须跳转到物资界面");
assert.equal(game.pendingGuidedSupplyReturnScreen, "home", "补给后应返回沙盘继续当前目标");
assert.equal(game.activeTaskLock, null, "跳转补给时不能锁住无法执行的任务");
assert.match(game.lastToast, /先补/, "物资页应告知玩家当前缺口");

console.log("goal material routing check ok");
