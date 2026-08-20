const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");

function playOpening(command) {
  const state = createCharacter(null, "保护区卫士");
  state.world.reserve.actionPoints = 10;
  return simulateDay(command, state);
}

const trackingRun = playOpening("派猎犬侦察中央混交林的陌生脚印");
const ecologyRun = playOpening("修复东部河岸湿地的水源");

const trackingChain = trackingRun.world.reserve.eventChain;
const ecologyChain = ecologyRun.world.reserve.eventChain;
if (trackingChain.branch === ecologyChain.branch) {
  throw new Error("different opening actions should create different event branches");
}
if (trackingChain.branchTitle !== "追踪线" || ecologyChain.branchTitle !== "水草线") {
  throw new Error(`event branches should expose clear route titles: ${trackingChain.branchTitle} / ${ecologyChain.branchTitle}`);
}
if (trackingChain.current.title === ecologyChain.current.title) {
  throw new Error("different event branches should not reuse the same opening chapter");
}

const pausedState = Object.assign({}, trackingRun, { reports: [], messages: [] });
const pausedRun = simulateDay("采购狗粮包", pausedState);
if (pausedRun.world.reserve.eventChain.step !== trackingChain.step || pausedRun.world.reserve.eventChain.advanced) {
  throw new Error("event line should pause for several operations instead of advancing continuously");
}

const nextCycleState = createCharacter(null, "保护区卫士");
nextCycleState.world.reserve.actionPoints = 10;
nextCycleState.world.reserve.progression = Object.assign({}, nextCycleState.world.reserve.progression, {
  level: 2,
  totalActions: 20,
  daysManaged: 20,
  chapterStart: { level: 2, totalActions: 20, daysManaged: 20, activeSeconds: 0, totalFundEarned: 0, totalMigratedIn: 0, totalRareRecovered: 0 }
});
nextCycleState.world.reserve.eventChain = Object.assign({}, nextCycleState.world.reserve.eventChain, {
  branch: "tracker",
  cycle: 1,
  step: 7,
  length: 7,
  completed: true,
  chapterLevel: 1
});
const nextCycle = simulateDay("驱赶偷猎者，封住东部河岸边界", nextCycleState);
const nextChain = nextCycle.world.reserve.eventChain;
if (nextChain.cycle !== 2 || nextChain.step !== 0 || nextChain.completed !== false || nextChain.advanced) {
  throw new Error(`new chapter should reset the event line but keep an opening pause: ${JSON.stringify(nextChain)}`);
}
if (!/刚刚开始|暂歇/.test(`${nextChain.lastResult || ""} ${nextChain.waitingText || ""}`)) {
  throw new Error("new chapter event line should wait for fresh chapter data before opening");
}

console.log("replayability check ok");
