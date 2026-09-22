function createFakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, prop) {
      if (prop === "measureText") return (value) => ({ width: String(value || "").length * 6 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient") return () => gradient;
      if (prop === "canvas") return { width: 320, height: 568 };
      if (!target[prop]) target[prop] = () => {};
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; }
  });
}

const touchHandlers = {};
global.wx = {
  getSystemInfoSync() { return { windowWidth: 320, windowHeight: 568, pixelRatio: 1 }; },
  createCanvas() { return { width: 320, height: 568, getContext() { return createFakeContext(); } }; },
  createImage() { return { loaded: true, set src(value) { this._src = value; this.loaded = true; if (this.onload) this.onload(); }, get src() { return this._src; } }; },
  getStorageSync() { return null; }, setStorageSync() {},
  onTouchStart(fn) { touchHandlers.start = fn; }, onTouchMove(fn) { touchHandlers.move = fn; }, onTouchEnd(fn) { touchHandlers.end = fn; }, onTouchCancel(fn) { touchHandlers.cancel = fn; },
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { normalizeLifeMemory } = require("../js/emotionSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, "保护区卫士");
game.screen = "home";
const memory = normalizeLifeMemory(game.state.world);
const friends = memory.individuals.slice(0, 3);
memory.memories = Array.from({ length: 14 }, (_, index) => {
  const animal = friends[index % friends.length];
  return {
    id: `timeline_${index + 1}`,
    day: index + 1,
    type: index === 13 ? "old" : index % 4 === 0 ? "birth" : "met",
    individualId: animal.id,
    speciesId: animal.speciesId,
    name: animal.name,
    title: `${animal.name}的第${index + 1}段记忆`,
    body: `第${index + 1}日，它在巡护线上留下了可以完整回看的经历。`,
    tone: "warm"
  };
});
game.state.world.lifeMemory = memory;

const detail = game.buildLifeMemoryDetail();
assert(detail.kind === "lifeMemory" && detail.items.length === 14, "memory modal should expose the complete saved timeline instead of six selected rows");
assert(detail.items[0].day === 14 && detail.items[13].day === 1, "memory timeline should run from newest to earliest");
assert(detail.items.every((item) => item.animal && item.animal.species), "animal memories should retain the corresponding animal portrait identity");

game.infoDetailModal = detail;
game.width = 320;
game.height = 568;
game.hitAreas = [];
game.drawInfoDetailModal();
assert(detail.renderedMemoryTimeline && detail.renderedMemoryTimeline.maxScroll > 0 && detail.renderedMemoryTimeline.canViewEarlier, "long memory history should expose an independently scrollable viewport");
assert(detail.renderedMemoryItems.length < detail.items.length && detail.renderedMemoryItems.every((row) => row.animalIcon), "visible memory cards should use compact animal icons without rendering the whole archive at once");

const view = detail.renderedMemoryViewport;
const pageScrollBefore = game.scrollY;
touchHandlers.start({ touches: [{ clientX: view.x + view.w / 2, clientY: view.y + view.h - 20 }] });
touchHandlers.move({ touches: [{ clientX: view.x + view.w / 2, clientY: view.y + 20 }] });
touchHandlers.end({ touches: [] });
assert(detail.memoryScrollY > 0 && game.scrollY === pageScrollBefore, "dragging the memory archive should scroll only the timeline, not the page behind it");

detail.memoryScrollY = detail.memoryMaxScroll;
game.hitAreas = [];
game.drawInfoDetailModal();
assert(detail.renderedMemoryTimeline.lastVisible === detail.items.length - 1, "the earliest saved memory should be reachable at maximum scroll");
const earliest = detail.items[detail.items.length - 1];
game.openInfoListItemDetail(detail, earliest, detail.items.length - 1);
assert(game.infoDetailModal.returnInfoDetailModal === detail && game.infoDetailModal.animal && /完整回看的经历/.test(game.infoDetailModal.prose), "tapping a memory should open its full text with the same animal portrait and return path");

console.log("life memory timeline check ok (animal portraits, 14 rows, isolated scroll, earliest memory, full detail)");
