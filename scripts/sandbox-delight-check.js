function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 375, height: 667 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 1 }; },
  createCanvas() { return { width: 375, height: 667, getContext: createFakeContext }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; },
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

function makeGame() {
  const game = new Game();
  game.stopLoop();
  game.state = createCharacter(null, "保护区卫士");
  game.state.ui = Object.assign({}, game.state.ui || {}, { prologue: { version: 1, stage: "complete", completed: true } });
  game.screen = "home";
  game.width = 375;
  game.height = 667;
  game.ctx = createFakeContext();
  game.render = () => {};
  return game;
}

function drawSandbox(game) {
  game.ctx = createFakeContext();
  game.drawHome(game.ctx);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = makeGame();
const animal = game.state.world.knownCharacters[0];
assert(animal && animal.id, "开局沙盘必须有可点选的命名动物");
assert(!game.speakingAnimalId && !game.selectedTarget, "进入沙盘时不得默认选中任何动物");
const wolf = game.state.world.knownCharacters.find((entry) => entry && (entry.id === "npc_wolf" || entry.name === "沉牙狼" || entry.species === "狼"));
assert(wolf, "第一章应存在沉牙狼");
drawSandbox(game);
assert(!game.renderedAnimalFocusOwnerId, "开局沙盘不得自动给沉牙狼套选中圈");
assert(!(game.renderedAnimalFocusMarkers || []).length, "开局沙盘不得显示动物选中圈");
game.state.world.reserveView = { mapMarkers: [{ id: "center_event", type: "event", regionId: "center", title: "中央混交林异常", label: "调查" }] };
drawSandbox(game);
assert(!game.renderedAnimalFocusOwnerId && !(game.renderedAnimalFocusMarkers || []).some((marker) => marker.id === wolf.id),
  "中心区事件不得把选中圈套到沉牙狼身上");
game.openAnimalThought(wolf);
drawSandbox(game);
assert(game.speakingAnimalId === wolf.id, "点选沉牙狼后才进入选中态");
assert(game.renderedAnimalFocusOwnerId === wolf.id, "点选后沉牙狼才显示选中圈");
assert((game.renderedAnimalFocusMarkers || []).some((marker) => marker.id === wolf.id && marker.kind === "selected"),
  "点选后选中圈必须是已选，而不是事件高亮");
game.dismissInfoDetailModal();
drawSandbox(game);
assert(!game.speakingAnimalId && !game.mapSpeakerFocus && !game.selectedTarget, "关闭动物面板必须取消沙盘选中态");
assert(!game.renderedAnimalFocusOwnerId && !(game.renderedAnimalFocusMarkers || []).length,
  "关闭面板后即使留下巡护线索，沉牙狼也不得继续亮着选中圈");
game.openAnimalThought(wolf);
const first = game.infoDetailModal;
assert(first && first.kind === "mapAnimalAction", "tapping a sandbox animal must open the direct action card");
assert(first.listenGain === 0, "listening must no longer expose the removed intel resource");
assert(first.animal === wolf && first.quote && first.quote.length <= 80, "animal response must use a large portrait and a short spoken line");
assert((first.mapActions || []).length === 2, "animal card must only offer the two animal-facing verbs");
assert(!first.mapActions.some((item) => item.id.startsWith("patrol:"))
  && first.mapActions.some((item) => item.id.startsWith("care:"))
  && first.mapActions.some((item) => item.id === "explore:materials"), "animal card must keep only relationship and exploration actions");
assert(first.mapActions.every((item) => item.label && item.value && item.action), "every sandbox action needs a verb, an exact result preview and a tap handler");
assert(first.linkedPatrolTask && first.linkedPatrolTask.id, "animal discovery must create a linked sandbox task instead of a direct patrol button");
const taskMarker = game.reserveViewForDisplay().mapMarkers.find((marker) => marker.id === game.state.world.reserve.animalPatrolLead.id);
assert(taskMarker && taskMarker.recommendAction === first.linkedPatrolTask.id, "the linked patrol task must be visible on the sandbox map");

const firstQuote = first.quote;
game.infoDetailModal = null;
game.openAnimalThought(animal);
const second = game.infoDetailModal;
assert(second.listenGain === 0, "repeated listening must not create a hidden resource reward");
assert(second.quote && second.quote !== firstQuote, "repeat taps should continue the animal conversation instead of repeating one line");

assert(!second.mapActions.some((item) => item.id.startsWith("patrol:")), "the animal modal must never execute patrol directly");
game.openMapMarkerDetail(taskMarker);
assert(game.infoDetailModal && game.infoDetailModal.kind === "watchClue" && game.infoDetailModal.action, "the sandbox task marker must explain the clue before execution");
game.infoDetailModal.action();
assert(game.patrolTaskModal && game.patrolTaskModal.id === taskMarker.recommendAction, "only the sandbox task marker may open the strategic patrol flow");

const leadId = game.state.world.reserve.animalPatrolLead.id;
game.submitCommand();
assert(!game.state.world.reserve.animalPatrolLead, "a completed patrol action must clear the matching animal-reported sandbox task");
assert(!game.reserveViewForDisplay().mapMarkers.some((marker) => marker.id === leadId), "resolved animal task marker must disappear from the sandbox");

game.patrolTaskModal = null;
game.settlementModal = null;
game.infoDetailModal = game.buildAnimalThoughtDetail(animal, game.createAnimalDialogueContext(animal));
const care = game.infoDetailModal.mapActions.find((item) => item.id.startsWith("care:"));
const trustBefore = ((game.state.world.knownCharacters.find((item) => item.id === animal.id) || {}).relation || {}).trust || 0;
care.action();
drawSandbox(game);
assert(!game.speakingAnimalId && !game.selectedTarget, "点选照顾操作后选中态必须立刻消失");
assert(!game.renderedAnimalFocusOwnerId && !(game.renderedAnimalFocusMarkers || []).length, "点选照顾后沉牙狼不得继续亮着选中圈");
assert(game.infoDetailModal && game.infoDetailModal.kind === "animalComfort" && game.infoDetailModal.phase === "approach", "relationship verb must open a warm care process before changing values");
assert((game.infoDetailModal.config.steps || []).length === 2
  && (game.infoDetailModal.config.buttons || []).length === 2, "animal care must stay a two-frame interaction");
assert((((game.state.world.knownCharacters.find((item) => item.id === animal.id) || {}).relation || {}).trust || 0) === trustBefore, "opening the first care frame must not commit values before the player acts");
game.advanceAnimalCareProcess();
const trustAfter = ((game.state.world.knownCharacters.find((item) => item.id === animal.id) || {}).relation || {}).trust || 0;
assert(trustAfter > trustBefore, "finishing the care process must change the animal relationship");
assert(game.infoDetailModal && game.infoDetailModal.kind === "animalComfort" && game.infoDetailModal.phase === "result" && game.infoDetailModal.step === 1
  && (game.infoDetailModal.resultChanges || []).length === 3, "care process must end with a readable three-part result instead of disappearing immediately");
assert(game.screen === "home" && game.mapConsequencePulse, "relationship result must return to the live sandbox instead of a dead-end page");
assert(/\d+→\d+|[+-]\d+/.test(game.mapConsequencePulse.valueText || ""), "sandbox result must expose an exact numeric change");
assert(/：/.test(game.mapConsequencePulse.responseText || "")
  && !/森林用路线和停留时间回应了你/.test(game.mapConsequencePulse.responseText || ""), "a named animal must answer after the numeric result to add emotional value");
const start = game.mapConsequencePulse.startedAt;
assert(game.mapConsequenceStage(game.mapConsequencePulse, start + 200) === "environment"
  && game.mapConsequenceStage(game.mapConsequencePulse, start + 800) === "numbers"
  && game.mapConsequenceStage(game.mapConsequencePulse, start + 1700) === "animal", "feedback rhythm must be picture, number, then animal response");
game.mapConsequencePulse.startedAt = Date.now() - 1700;
game.mapConsequencePulse.expiresAt = Date.now() + 2000;
game.drawMapConsequencePulse(game.ctx, game.mapCameraInfo(0, 0, 375, 500));
assert(game.mapConsequencePulse.renderedCard && game.mapConsequencePulse.renderedCard.w >= 230
  && game.mapConsequencePulse.renderedCard.h >= 100
  && game.mapConsequencePulse.renderedCard.valueSize >= 13
  && game.mapConsequencePulse.renderedCard.hasAnimalResponse
  && game.mapConsequencePulse.renderedCard.palette === "neutral-single-accent"
  && game.mapConsequencePulse.renderedCard.coloredPanels === 0, "sandbox result must use a prominent, restrained card with one semantic accent and the animal reply");

game.openAnimalThought(animal);
const explore = game.infoDetailModal.mapActions.find((item) => item.id === "explore:materials");
assert(/点数/.test(explore.value) && /直接探索/.test(explore.cost) && /物资|线索/.test(explore.cost), "exploration preview must explain the tap, point result and immediate outcome");
explore.action();
drawSandbox(game);
assert(!game.speakingAnimalId && !game.selectedTarget, "点选探索操作后选中态必须立刻消失");
assert(!game.renderedAnimalFocusOwnerId && !(game.renderedAnimalFocusMarkers || []).length, "点选探索后沉牙狼不得继续亮着选中圈");
assert(game.infoDetailModal && game.infoDetailModal.kind === "materialExploration", "sandbox exploration verb must enter the playable six-sided-die flow");
assert(/总点数|六面点数/.test(`${game.infoDetailModal.footer} ${(game.infoDetailModal.items || []).map((item) => item.title).join(" ")}`), "exploration must preserve the clear point formula");

game.infoDetailModal = game.buildAnimalThoughtDetail(animal, game.createAnimalDialogueContext(animal));
assert(game.infoDetailModal.mapActions[0].id === "explore:materials" && game.infoDetailModal.mapActions[0].recommended, "when today's care is complete, exploration must move into the first recommended position");
assert(/今日互动已完成/.test(game.infoDetailModal.nextStepGuide) && /立即/.test(game.infoDetailModal.nextStepGuide), "blocked animal cards must explicitly explain the next available step and its result timing");

game.infoDetailModal = null;
game.speakingAnimalId = wolf.id;
game.selectedTarget = wolf;
game.mapSpeakerFocus = { kind: "animal", id: wolf.id };
game.mapViewport = { x: 0, y: 0, w: 375, h: 500 };
game.hitAreas = [];
game.handleTap(80, 180);
drawSandbox(game);
assert(!game.speakingAnimalId && !game.mapSpeakerFocus && !game.selectedTarget, "点选沙盘空白处必须取消动物选中态");
assert(!game.renderedAnimalFocusOwnerId && !(game.renderedAnimalFocusMarkers || []).length, "点选空白处后沉牙狼不得继续亮着选中圈");

game.mapConsequencePulse = null;
game.infoDetailModal = null;
drawSandbox(game);
const playable = game.sandboxPlayableWorld();
game.state.world.knownCharacters.forEach((animal, index) => {
  const pos = game.animalMapLayoutPosition(animal, index, game.state.world.knownCharacters, game.animalMapLayoutContext(game.state.world.knownCharacters, game.state.world));
  assert(pos.x >= playable.minX && pos.x <= playable.maxX && pos.y >= playable.minY && pos.y <= playable.maxY, `${animal.species} 不得贴在沙盘边缘`);
});
const { facilityStates } = require("../js/reserveFacilities");
facilityStates(game.state).filter((facility) => !facility.concealed).forEach((facility) => {
  const pos = game.clampSandboxWorldPoint(facility.x, facility.y);
  assert(pos.x >= playable.minX && pos.x <= playable.maxX && pos.y >= playable.minY && pos.y <= playable.maxY, `${facility.name} 不得贴在沙盘边缘`);
});
const frame = game.mapCameraFrame || vp;
assert(frame && frame.w > 200 && frame.h > 200, "沙盘可视区域必须保留足够操作空间");
(game.renderedMapFacilityLabels || []).forEach((label) => {
  const centerX = label.x + label.w / 2;
  assert(centerX >= frame.x + 48 && centerX <= frame.x + frame.w - 48, `${label.id} 建筑不能贴在沙盘左右边缘`);
  assert(label.y >= frame.y + 48 && label.y <= frame.y + frame.h - 48, `${label.id} 建筑不能贴在沙盘上下边缘`);
});
(game.renderedRescueMapMarkers || []).forEach((marker) => {
  assert(marker.worldX >= playable.minX && marker.worldX <= playable.maxX, "解救动物必须种在沙盘可玩区域内");
  assert(marker.worldY >= playable.minY && marker.worldY <= playable.maxY, "解救动物必须种在沙盘可玩区域内");
});

const facilityBefore = (game.renderedMapFacilityLabels || []).map((label) => ({ id: label.id, x: label.x, y: label.y }));
const rescueBefore = (game.renderedRescueMapMarkers || []).map((marker) => ({
  id: marker.targetId, x: marker.x, y: marker.y, w: marker.w, worldX: marker.worldX, worldY: marker.worldY
}));
const livingBefore = (game.renderedLivingReserveNodes || []).map((node) => ({ id: node.id, x: node.x, y: node.y }));
const facilityPointsBefore = facilityStates(game.state).filter((facility) => !facility.concealed).map((facility) => (
  Object.assign({ id: facility.id }, game.facilityMapPoint(facility, game.mapCameraFrame))
));
assert(facilityPointsBefore.length, "沙盘必须画出保护区建筑");
assert(rescueBefore.length, "沙盘必须画出困住的待解救动物");
game.panMapBy(90, 70);
drawSandbox(game);
facilityPointsBefore.forEach((before) => {
  const after = game.facilityMapPoint(
    facilityStates(game.state).find((facility) => facility.id === before.id),
    game.mapCameraFrame
  );
  assert(Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1, `${before.id} 建筑应随地图世界坐标移动`);
});
facilityBefore.forEach((before) => {
  const after = (game.renderedMapFacilityLabels || []).find((label) => label.id === before.id);
  const beforePoint = facilityPointsBefore.find((point) => point.id === before.id);
  const afterPoint = game.facilityMapPoint(
    facilityStates(game.state).find((facility) => facility.id === before.id),
    game.mapCameraFrame
  );
  assert(after && beforePoint
    && Math.abs((after.x - before.x) - (afterPoint.x - beforePoint.x)) < 1
    && Math.abs((after.y - before.y) - (afterPoint.y - beforePoint.y)) < 1,
  `${before.id} 建筑标签必须和建筑保持同一地图坐标`);
});
rescueBefore.forEach((before) => {
  const after = (game.renderedRescueMapMarkers || []).find((marker) => marker.targetId === before.id);
  assert(after, "困住的动物拖图后仍须留在沙盘上");
  assert(Math.abs(after.worldX - before.worldX) < 0.0001 && Math.abs(after.worldY - before.worldY) < 0.0001, "困住的动物必须固定在首次出现的沙盘坐标");
  assert(Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1, "困住的动物应随沙盘地形一起平移，不能钉在屏幕上");
  const expected = game.mapPoint(before.worldX, before.worldY, game.mapCameraFrame);
  assert(Math.abs((after.x + after.w / 2) - expected.x) < 1 && Math.abs((after.y + 36) - expected.y) < 1, "困住的动物屏幕位置必须跟着种植点走");
});
livingBefore.forEach((before) => {
  const after = (game.renderedLivingReserveNodes || []).find((node) => node.id === before.id);
  assert(after && (Math.abs(after.x - before.x) > 1 || Math.abs(after.y - before.y) > 1), `${before.id} 建设节点应随地图世界坐标移动`);
});

console.log("sandbox delight check ok");
