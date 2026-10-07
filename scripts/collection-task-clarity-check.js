const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function fakeContext() {
  return new Proxy({ font: "12px sans-serif" }, {
    get(target, key) {
      if (key === "measureText") return (value) => ({ width: String(value).length * 12 });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop() {} });
      return target[key] || (() => {});
    },
    set(target, key, value) { target[key] = value; return true; }
  });
}

// The collection task must explain one linear action loop without changing the
// underlying charge, roll, or save rules: choose -> start -> read result.
const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "保护区卫士");
game.state.world.collection.leads = [{
  id: "clarity_lead",
  caseId: "case_1",
  quality: 1,
  sourceAction: "houndScout",
  sourceLabel: "猎犬侦察",
  animal: { id: "npc_deer", name: "晨角", trust: 72 },
  title: "水边无人认领的脚印",
  clue: "水边出现一条待调查的旧路线。"
}];
game.state.world.collection.investigation.charges = 2;
game.state.world.collection.investigation.failedAttempts = 0;

game.openCollectionInvestigation("clarity_lead");
const first = game.infoDetailModal;
assert.strictEqual(first.kind, "collectionInvestigation");
assert.strictEqual(first.kicker, "调查任务");
assert.strictEqual(first.primaryActionLabel, "开始调查");
assert.strictEqual(first.taskStepText, "选方案 → 开始调查 → 查看结果");
assert(/本案剩余机会 2\/3/.test(first.footer), "调查卡必须显示本案剩余次数，而不是混用失败次数");
assert(!/失败0\/3/.test(first.footer), "调查卡不能把失败次数伪装成可操作次数");

game.selectCollectionMethod("field");
assert.strictEqual(game.infoDetailModal.selectedMethodId, "field");
game.openCollectionDice("clarity_lead", "field");
const second = game.infoDetailModal;
assert.strictEqual(second.kind, "collectionDice");
assert.strictEqual(second.kicker, "调查任务 · 射箭判定");
assert.strictEqual(second.title, "射箭调查");
assert(/发射并判定/.test(second.footer), "点数步骤必须说明按钮会完成判定");
assert.strictEqual(second.standardArchery, true, "调查结果步骤必须使用标准射箭模式");
assert.strictEqual(second.explorationMode, "archery", "调查结果步骤必须进入射箭判定模式");
assert.strictEqual(game.isArcheryInputModal(second), true, "调查结果步骤必须让瞄准箭头进入动态状态");

// The compact task card must remain readable at the three supported phone
// widths. This is a geometry check, not a screenshot comparison.
for (const [width, height] of [[320, 568], [375, 667], [430, 932]]) {
  game.width = width;
  game.height = height;
  game.dpr = 1;
  game.info = { windowWidth: width, windowHeight: height, pixelRatio: 1, safeArea: { top: 0, bottom: height } };
  game.ctx = fakeContext();
  game.infoDetailModal = Object.assign({}, first, { selectedMethodId: "animal", selectionChanged: false });
  game.hitAreas = [];
  game.drawInfoDetailModal();
  const frame = game.infoDetailModal.renderedInfoFrame;
  const visual = game.infoDetailModal.renderedCollectionInvestigation;
  assert(frame && visual && visual.layout === "simple", `调查卡布局缺失: ${width}`);
  const methodLayout = game.infoDetailModal.renderedMethodLayout || [];
  assert.strictEqual(methodLayout.length, 3, `调查方案数量错误: ${width}`);
  assert(methodLayout.every((item) => item.x >= frame.x && item.x + item.w <= frame.x + frame.w && item.y + item.h <= frame.y + frame.h), `调查方案越界: ${width}`);
  assert(visual.summaryY + visual.summaryH <= frame.y + frame.h - 50, `调查结算说明挤到底部按钮: ${width}`);
}

const source = fs.readFileSync(path.join(__dirname, "../js/game.js"), "utf8");
assert(!source.includes("确认并生成点数"), "旧的含糊按钮文案不能回归");
assert(!source.includes("调查机会 ${collection.investigation.charges}/3 · 线索质量"), "旧的混合状态文案不能回归");
assert(source.includes("① 选方案   →   ② 开始调查   →   ③ 看结果"), "调查卡必须展示三步流程");

console.log("collection task clarity check ok (simple three-step flow, remaining charges and result wording)");
