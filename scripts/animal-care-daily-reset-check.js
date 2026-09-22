const assert = require("node:assert/strict");

function fakeContext() {
  const gradient = { addColorStop() {} };
  return new Proxy({}, {
    get(target, key) {
      if (key === "measureText") return (text) => ({ width: String(text || "").length * 7 });
      if (key === "createLinearGradient" || key === "createRadialGradient") return () => gradient;
      if (key === "canvas") return { width: 375, height: 667 };
      if (!target[key]) target[key] = () => {};
      return target[key];
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    }
  });
}

global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 667, pixelRatio: 1 }),
  createCanvas: () => ({ width: 375, height: 667, getContext: () => fakeContext() }),
  createImage: () => ({ loaded: true, set src(value) { this._src = value; if (this.onload) this.onload(); } }),
  getStorageSync: () => null,
  setStorageSync() {},
  onTouchStart() {}, onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {},
  onKeyboardConfirm() {}, onAppHide() {}, onAppShow() {}, showToast() {}
};

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { localDateKey } = require("../js/firstReturnHook");

const originalNow = Date.now;
const firstDay = new Date(2026, 8, 17, 12, 0, 0).getTime();
const nextDay = new Date(2026, 8, 18, 0, 1, 0).getTime();

try {
  Date.now = () => firstDay;
  const game = new Game();
  game.stopLoop();
  game.render = () => {};
  game.toast = () => {};
  game.state = createCharacter(null, "自然日互动回归");

  const reserve = game.state.world.reserve;
  const animals = game.state.world.knownCharacters.filter((animal) => animal && animal.id);
  assert(animals.length >= 2, "fixture needs two animals");
  const animal = animals[0];
  const otherAnimal = animals[1];
  game.speakingAnimalId = animal.id;

  reserve.animalCareLog[animal.id] = (reserve.guardianCycle || {}).day || 1;
  assert.equal(game.animalActionStatus("calmObserve").canRun, true, "legacy numeric game-day records must expire after upgrade");

  game.performAnimalAction(animal, "calmObserve");
  assert.equal(game.state.world.reserve.animalCareLog[animal.id], localDateKey(firstDay), "care must store the local calendar date");
  game.speakingAnimalId = animal.id;
  assert.equal(game.animalActionStatus("calmObserve").canRun, false, "same calendar day must remain blocked");
  assert.equal(game.animalActionStatus("guideMigration").canRun, false, "all care actions share the per-animal daily limit");

  const restarted = new Game();
  restarted.stopLoop();
  restarted.state = JSON.parse(JSON.stringify(game.state));
  restarted.speakingAnimalId = animal.id;
  assert.equal(restarted.animalActionStatus("calmObserve").canRun, false, "restarting on the same date must not reset care");

  restarted.state.world.reserve.guardianCycle.day += 1;
  assert.equal(restarted.animalActionStatus("calmObserve").canRun, false, "advancing the gameplay day must not bypass the calendar-day limit");

  restarted.speakingAnimalId = otherAnimal.id;
  assert.equal(restarted.animalActionStatus("calmObserve").canRun, true, "different animals must have independent daily limits");

  Date.now = () => nextDay;
  restarted.speakingAnimalId = animal.id;
  assert.equal(restarted.animalActionStatus("calmObserve").canRun, true, "crossing local midnight must restore care without advancing gameplay");
} finally {
  Date.now = originalNow;
  delete global.wx;
}

console.log("animal care daily reset check ok: local midnight, restart, gameplay-day independence, separate animals and legacy saves");
