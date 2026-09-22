const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = Object.create(Game.prototype);
game.state = createCharacter(null, "保护区卫士");
game.numberAnimations = {};
game.displayReserveStats = game.initialDisplayReserveStats();

const reserve = game.state.world.reserve;
const oldFund = reserve.fund;
const oldSafety = reserve.safety;
const oldFood = reserve.supplies.dogFood;
reserve.fund += 125;
reserve.safety = Math.min(100, reserve.safety + 8);
reserve.supplies.dogFood += 3;

game.tweenDisplayReserveStats(300);
const midFund = game.displayReserveNumber("fund", reserve.fund);
assert(midFund > oldFund && midFund < reserve.fund, "fund should roll between old and new value at 300ms");
assert(game.reserveDisplayDelta("fund", reserve.fund) === 125, "fund delta badge should keep the exact total delta while rolling");
assert(game.reserveDisplayDelta("safety", reserve.safety) === reserve.safety - oldSafety, "safety delta is wrong");
assert(game.reserveDisplayDelta("supply:dogFood", reserve.supplies.dogFood) === reserve.supplies.dogFood - oldFood, "supply delta is wrong");

game.tweenDisplayReserveStats(300);
assert(game.displayReserveNumber("fund", reserve.fund) === reserve.fund, "600ms animation must end at exact fund value");
assert(game.displayReserveNumber("safety", reserve.safety) === reserve.safety, "600ms animation must end at exact safety value");
assert(game.displayReserveNumber("supply:dogFood", reserve.supplies.dogFood) === reserve.supplies.dogFood, "600ms animation must end at exact supply value");
game.tweenDisplayReserveStats(221);
assert(game.reserveDisplayDelta("fund", reserve.fund) === 0, "delta badge should clear after animation hold");

const before = game.reserveSnapshot(reserve);
const afterReserve = JSON.parse(JSON.stringify(reserve));
afterReserve.fund += 70;
afterReserve.inventory.researchSample = (afterReserve.inventory.researchSample || 0) + 2;
afterReserve.pendingRecovered.recoveredTrap = (afterReserve.pendingRecovered.recoveredTrap || 0) + 1;
afterReserve.supplies.alarm = (afterReserve.supplies.alarm || 0) - 1;
const after = game.reserveSnapshot(afterReserve);
const notice = game.buildMaterialChangeNotice(before, after);
assert(notice && /基金 \+70/.test(notice.summary), "material feedback should show the fund delta");
assert(notice.inventory.researchSample === 2, "inventory delta should be tracked separately");
assert(notice.pending.recoveredTrap === 1, "pending recovery delta should be tracked separately");
assert(notice.supplies.alarm === -1, "supply consumption should be shown");

const collectionApi = require("../js/collectionSystem");
collectionApi.normalizeCollectionState(game.state);
game.numberAnimations = {};
game.displayReserveStats = game.initialDisplayReserveStats();
const collectionSafetyBefore = game.state.world.reserve.safety;
const collectionPoacherBefore = game.state.world.reserve.poacherPressure;
game.state.world.collection.leads = [{ id: "numeric_collection", caseId: "case_1", quality: 0, sourceAction: "houndScout", sourceLabel: "猎犬侦察", animal: { name: "晨角", trust: 40 } }];
collectionApi.startInvestigation(game.state, "numeric_collection", "risky");
const collectionResult = collectionApi.resolveInvestigation(game.state, 1, () => 0);
assert(!collectionResult.success, "low-risk test fixture should keep the clue");
assert(game.state.world.reserve.safety === collectionSafetyBefore - 2 && game.state.world.reserve.poacherPressure === collectionPoacherBefore + 2, "collection risk values should settle in the real reserve");
game.tweenDisplayReserveStats(300);
assert(game.displayReserveStats.safety > game.state.world.reserve.safety && game.displayReserveStats.safety < collectionSafetyBefore, "collection safety animation should have a real 300ms middle frame");
game.tweenDisplayReserveStats(300);
assert(game.displayReserveNumber("safety", game.state.world.reserve.safety) === game.state.world.reserve.safety, "collection safety animation must land on the stored value at 600ms");
assert(game.reserveDisplayDelta("poacherPressure", game.state.world.reserve.poacherPressure) === 2, "collection poacher delta badge should remain visible during hold");

game.numberAnimations = {};
game.displayReserveStats = game.initialDisplayReserveStats();
game.reserveDisplayTargetRefreshLeft = 0;
game.numberAnimationBurstUntil = Date.now() + 10000;
game.numberAnimationBurstCause = "task";
const taskFund = game.state.world.reserve.fund;
game.state.world.reserve.fund += 100;
game.tweenDisplayReserveStats(300);
assert(game.numberAnimationArrowPhase("fund"), "task arrow must precede the number change");
assert(game.displayReserveNumber("fund", taskFund) === taskFund, "number must wait for arrow");
game.tweenDisplayReserveStats(360);
assert(game.displayReserveNumber("fund", taskFund) > taskFund && game.displayReserveNumber("fund", taskFund) < taskFund + 100, "task number rolls after arrow");
game.tweenDisplayReserveStats(300);
assert(game.displayReserveNumber("fund", taskFund) === taskFund + 100, "task animation lands exactly after its arrow and roll");

game.numberAnimations = {};
game.numberAnimationActiveKey = null;
game.displayReserveStats = game.initialDisplayReserveStats();
game.reserveDisplayTargetRefreshLeft = 0;
game.numberAnimationBurstUntil = Date.now() + 10000;
game.numberAnimationBurstCause = "task";
const animalsBefore = game.displayReserveNumber("animalTotal", game.reserveDynamicTargets().animalTotal);
const herd = game.state.world.reserve.ecology.herbivores;
const herdKey = Object.keys(herd).find((key) => Number(herd[key]) > 0) || "deer";
herd[herdKey] = (Number(herd[herdKey]) || 0) + 8;
game.state.world.reserve.fund += 80;
game.tweenDisplayReserveStats(80);
assert(game.numberAnimations.animalTotal, "animal total must animate with fund instead of snapping");
assert(game.numberAnimationArrowPhase("animalTotal"), "header animal total must flash direction before the count rolls");
assert(game.reserveDisplayDelta("animalTotal", game.reserveDynamicTargets().animalTotal) === 8, "header must keep the full animal delta while rolling");
assert(game.displayReserveNumber("animalTotal", animalsBefore) === animalsBefore, "animal total waits for its arrow");
game.tweenDisplayReserveStats(400);
const rollingAnimals = game.displayReserveNumber("animalTotal", animalsBefore + 8);
assert(rollingAnimals > animalsBefore && rollingAnimals < animalsBefore + 8, "header animal total must visibly roll");
const animalTile = game.drawCompactReserveStateTile(game.ctx || fakeContext(), {
  id: "animalTotal",
  label: "动物总数",
  value: animalsBefore + 8,
  target: 120,
  showProgress: true,
  tone: "good"
}, 20, 80, 118, 30);
assert(animalTile.changeVisible, "animal change badge replaces the percent while rolling");
assert(animalTile.percentVisible === false, "percent must not share the header slot with the arrow badge");

console.log("numeric feedback check ok");

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}
