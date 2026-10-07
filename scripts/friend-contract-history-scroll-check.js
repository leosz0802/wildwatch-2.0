"use strict";

const assert = require("node:assert/strict");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

const game = new Game();
game.stopLoop();
game.render = () => {};
game.requestRender = () => {};
game.toast = () => {};
game.state = createCharacter(null, "合同详情滚动");
game.openFriendContractHistoryDetail({
  type: "started",
  partnerId: "cloud_friend",
  partnerName: "Nicole.英",
  objective: "night_rescue",
  dateKey: "2026-10-04"
});
assert.equal(game.infoDetailModal.kind, "friendContractHistoryDetail", "必须打开合同历史详情");
assert.equal(game.isInfoListScrollModal(game.infoDetailModal), true, "合同详情必须走列表滚动");
assert.equal(game.memoryTimelineScrollKeys(game.infoDetailModal).scrollKey, "infoListScrollY", "合同详情滑动必须写 infoListScrollY");
game.infoDetailModal.infoListMaxScroll = 80;
game.infoDetailModal.infoListScrollY = 0;
game.infoDetailModal.memoryScrollY = 0;
game.infoDetailModal.renderedFundLedgerViewport = { x: 20, y: 80, w: 300, h: 260 };
assert.ok(game.lifeMemoryTimelineTouchPoint(40, 140), "合同详情列表区域必须能开始滑动");
game.gesture = { memoryTimeline: true, startX: 40, startY: 140, lastX: 40, lastY: 140, startScroll: 0, moved: false };
assert.equal(game.applyMemoryTimelineScroll(-56), true, "上滑必须写入合同详情滚动");
assert.equal(game.infoDetailModal.infoListScrollY, 56, "合同详情滑动应更新 infoListScrollY");
assert.equal(game.infoDetailModal.memoryScrollY, 0, "合同详情滑动不能写到记忆时间轴字段");
console.log("friend contract history scroll check ok");
