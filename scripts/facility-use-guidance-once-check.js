const assert = require("node:assert/strict");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { normalizeFacilityConstruction } = require("../js/reserveFacilities");

function makeGame(name) {
  const game = new Game();
  if (game.stopLoop) game.stopLoop();
  game.render = game.requestRender = () => {};
  game.toast = () => {};
  game.state = createCharacter(null, name);
  game.screen = "home";
  const reserve = game.state.world.reserve;
  reserve.fund = 2000;
  reserve.supplies = Object.assign({}, reserve.supplies || {}, { dogFood: 8 });
  normalizeFacilityConstruction(reserve);
  return game;
}

const game = makeGame("巡护站一次性指引");

game.openReserveFacilityDetail("old_patrol_post");
assert(game.infoDetailModal, "首次打开巡护站应创建使用弹窗");
assert.equal(game.infoDetailModal.kind, "facilityConstruction");
assert.equal(game.infoDetailModal.showUsageGuidance, true, "首次打开必须显示使用指引");
assert.equal(
  game.state.world.reserve.facilityConstruction.guidanceSeen.old_patrol_post,
  true,
  "首次打开后必须把巡护站指引写入存档状态"
);

const firstUse = game.useReserveFacility("old_patrol_post");
assert(firstUse, "首次派出短巡应成功");
assert.equal(game.infoDetailModal.kicker, "巡护站 · 已生效", "使用结果仍应正常显示");

game.infoDetailModal = null;
game.openReserveFacilityDetail("old_patrol_post");
assert.equal(game.infoDetailModal.showUsageGuidance, false, "连续再次打开不得重复显示使用指引");
const secondUse = game.useReserveFacility("old_patrol_post");
assert(secondUse, "关闭指引后再次派出短巡仍应成功");

// 任务入口与地图入口必须共用同一个一次性标记；连续打开任务指引时，
// 只能第一次显示说明，后续仍可正常派出短巡。
game.infoDetailModal = null;
game.openNextFacilityUse();
assert.equal(game.infoDetailModal.showUsageGuidance, false, "任务入口再次打开不得重复显示使用指引");
assert(game.useReserveFacility("old_patrol_post"), "任务入口打开后仍应允许再次派出短巡");
game.infoDetailModal = null;
game.openNextFacilityUse();
assert.equal(game.infoDetailModal.showUsageGuidance, false, "连续第三次打开任务入口不得重复显示使用指引");

// 模拟重启并恢复刚刚的存档，确保一次性标记不会只存在于内存。
const restarted = makeGame("巡护站指引重启");
restarted.state = JSON.parse(JSON.stringify(game.state));
restarted.openReserveFacilityDetail("old_patrol_post");
assert.equal(restarted.infoDetailModal.showUsageGuidance, false, "重启后不得再次显示已看过的指引");

console.log("facility use guidance once check ok");
