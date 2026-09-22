const assert = require("assert");

let viewport = { windowWidth: 375, windowHeight: 667, pixelRatio: 1 };

function createFakeContext(width, height) {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width, height };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

global.wx = {
  getSystemInfoSync() { return viewport; },
  createCanvas() {
    const ctx = createFakeContext(viewport.windowWidth, viewport.windowHeight);
    return { width: viewport.windowWidth, height: viewport.windowHeight, getContext() { return ctx; } };
  },
  createImage() {
    return {
      loaded: true,
      set src(value) { this._src = value; this.loaded = true; if (this.onload) this.onload(); },
      get src() { return this._src; }
    };
  },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

for (const [width, height] of [[320, 568], [375, 667], [430, 932]]) {
  viewport = { windowWidth: width, windowHeight: height, pixelRatio: 1 };
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, "目标界面测试");
  game.state.world.reserve.ecology.water = 5;
  game.state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
  game.screen = "home";
  game.infoDetailModal = null;
  game.currentGoalView(true);
  assert(game.openGoalCenter(), `${width}x${height} 应能打开目标中心`);
  const modal = game.infoDetailModal;
  assert.strictEqual(modal.kind, "missionPush");
  assert(modal.goals.length >= 1 && modal.goals.length <= 3, "目标中心只显示1–3项");
  game.hitAreas = [];
  game.drawInfoDetailModal();
  assert.strictEqual((modal.renderedGoalCards || []).length, 1, "默认只应展示唯一当前目标");
  assert.strictEqual(modal.renderedGoalCards[0].id, modal.currentGoalId, "默认卡片必须是当前追踪目标");
  assert.deepStrictEqual((modal.renderedGoalGuides || []).map((item) => item.id), ["guideSandbox", "viewFund", "viewVisitors", "viewSurvival"], "目标卡下方必须提供低打扰的主动查看入口");
  (modal.renderedGoalGuides || []).forEach((guide) => {
    assert(guide.x >= 0 && guide.y >= 0 && guide.x + guide.w <= width && guide.y + guide.h <= height, `${width}x${height} 主动查看入口不得越界`);
  });
  (modal.renderedGoalCards || []).forEach((card, index, cards) => {
    assert(card.x >= 0 && card.y >= 0 && card.x + card.w <= width && card.y + card.h <= height, `${width}x${height} 目标卡不得越界`);
    if (index) assert(card.y >= cards[index - 1].y + cards[index - 1].h, "目标卡不得互相遮挡");
  });
  if (modal.goals[1]) {
    const oldPrimaryId = modal.currentGoalId;
    modal.showAlternatives = true;
    game.drawInfoDetailModal();
    assert.strictEqual((modal.renderedGoalCards || []).length, modal.goals.length, "主动更换时才展示所有备选目标");
    const alternativeId = modal.goals.find((goal) => goal.id !== oldPrimaryId).id;
    assert(game.selectGoalAsPrimary(alternativeId), "备选目标必须可设为当前目标");
    assert.strictEqual(game.state.world.goals.active.primary.id, alternativeId, "选择必须写回全局唯一当前目标");
    assert.strictEqual(modal.currentGoalId, alternativeId, "弹窗必须立即切换当前目标");
    assert.strictEqual(modal.showAlternatives, false, "选定后应自动收起备选目标");
    game.drawInfoDetailModal();
    assert.strictEqual((modal.renderedGoalCards || []).length, 1, "选定后旧目标不得继续并列显示");
    assert.strictEqual(modal.renderedGoalCards[0].id, alternativeId, "选定后只展示新当前目标");
  }
  game.stopLoop();
}

// Regression: the goal dock is painted every animation frame. With rerouting
// active, resolving once in currentGoalView and again in buildGoalView used to
// alternate two candidates and flash both title and progress values.
viewport = { windowWidth: 375, windowHeight: 667, pixelRatio: 1 };
const stableGame = new Game();
stableGame.stopLoop();
stableGame.state = createCharacter(null, "目标稳定帧测试");
stableGame.state.world.reserve.ecology.water = 5;
stableGame.state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
const prepared = stableGame.currentGoalView(true);
stableGame.state.world.goals.noProgressActions = 3;
const firstStableView = stableGame.currentGoalView(true);
const storedGoals = stableGame.state.world.goals;
const signature = (view) => [
  view.primary && view.primary.id,
  view.primary && view.primary.title,
  view.primary && view.primary.progress,
  view.primary && view.primary.target,
  (view.alternatives || []).map((goal) => goal.id).join(",")
].join("|");
assert(prepared.primary, "稳定帧测试必须先生成主目标");
assert.strictEqual(firstStableView.primary.id, storedGoals.active.primary.id, "绘制目标必须与已决策主目标一致");
for (let frame = 0; frame < 180; frame += 1) {
  const frameView = stableGame.currentGoalView();
  assert.strictEqual(signature(frameView), signature(firstStableView), `第${frame + 1}帧目标文字和数值不得闪烁`);
  assert.strictEqual(stableGame.state.world.goals, storedGoals, "纯绘制不得替换目标状态");
}
stableGame.stopLoop();

// Navigation suggestions must be inspection-only: they open the requested
// channel without creating a patrol task or consuming an action.
const navigationGame = new Game();
navigationGame.stopLoop();
navigationGame.state = createCharacter(null, "主动查看入口测试");
navigationGame.state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
navigationGame.screen = "home";
const actionsBeforeBrowse = navigationGame.state.world.reserve.progression.totalActions || 0;
assert(navigationGame.openGuidedChannel("viewFund"), "星币入口必须可打开收支明细");
assert.strictEqual(navigationGame.infoDetailModal.kind, "fundLedger", "星币入口不得进入巡护页面");
assert.strictEqual(navigationGame.state.world.reserve.progression.totalActions || 0, actionsBeforeBrowse, "查看星币不得消耗行动");
assert(navigationGame.openGuidedChannel("viewVisitors"), "游客入口必须可打开游客频道");
assert.strictEqual(navigationGame.screen, "collection");
assert.strictEqual(navigationGame.discoveryTab, "visitors");
assert(navigationGame.openGuidedChannel("viewSurvival"), "生存入口必须可打开生存频道");
assert.strictEqual(navigationGame.screen, "survival");
assert(navigationGame.openGuidedChannel("guideSandbox"), "沙盘入口必须可返回沙盘");
assert.strictEqual(navigationGame.screen, "home");
navigationGame.stopLoop();

// Resource recovery goals should recruit visitors or restore supplies,
// not force the Survival channel as a daily/main task.
const survivalRouteGame = new Game();
survivalRouteGame.stopLoop();
survivalRouteGame.state = createCharacter(null, "生存引导测试");
survivalRouteGame.state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
survivalRouteGame.screen = "home";
survivalRouteGame.infoDetailModal = { kind: "missionPush" };
survivalRouteGame.state.world.goals = require("../js/goalSystem").normalizeGoalState(survivalRouteGame.state.world.goals, survivalRouteGame.state);
assert(survivalRouteGame.state.world.goals.daily.objectives.every((item) => item.recommendedAction !== "exploreMaterials" && item.targetScreen !== "survival"), "每日任务不得强制去生存频道");
assert(survivalRouteGame.executeGoalAction({ recommendedAction: "viewVisitors" }), "游客招募任务应能打开招募");
assert.notEqual(survivalRouteGame.screen, "survival", "游客任务不得进入生存频道");
survivalRouteGame.stopLoop();

// Animal-care goals must route to the sandbox and focus a named animal rather
// than dumping the player into the population page with an empty selection.
const animalGoalGame = new Game();
animalGoalGame.stopLoop();
animalGoalGame.state = createCharacter(null, "动物目标聚焦测试");
animalGoalGame.state.ui = { onboarding: { version: 2, completed: true, seen: {} } };
animalGoalGame.screen = "home";
animalGoalGame.infoDetailModal = { kind: "missionPush" };
assert(animalGoalGame.executeGoalAction({ id: "story:animal", recommendedAction: "animalCare" }), "动物目标应能执行");
assert.strictEqual(animalGoalGame.screen, "home", "动物目标应返回沙盘而不是停在种群观察页");
assert(animalGoalGame.speakingAnimalId && animalGoalGame.selectedTarget && animalGoalGame.selectedTarget.id === animalGoalGame.speakingAnimalId,
  "动物目标应聚焦同一只命名动物");
animalGoalGame.stopLoop();

console.log("goal ui check ok");
