const assert = require('node:assert/strict');
const rendered = [];
const context = new Proxy({ font: '12px sans-serif' }, {
  get(target, key) {
    if (key === 'measureText') return text => ({ width: String(text).length * 10 });
    if (key === 'fillText') return text => rendered.push(String(text));
    if (/create.*Gradient/.test(key)) return () => ({ addColorStop() {} });
    return target[key] || (() => {});
  },
  set(target, key, value) { target[key] = value; return true; }
});
global.wx = {
  getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, pixelRatio: 1 }),
  createCanvas: () => ({ getContext: () => context }),
  getStorageSync() {}, setStorageSync() {},
  onTouchStart() {}, onTouchEnd() {}, onTouchMove() {}, onTouchCancel() {}, onKeyboardConfirm() {}
};
const { createCharacter, normalizeReserve } = require('../js/storage');
const { animalSourceSummary, populationSnapshot } = require('../js/animalSourceLedger');
const { normalizeChapterRescue, rescueAnimal, livingAnimalTotal } = require('../js/chapterRescueSystem');
const { CHAPTERS, SPECIES_DB } = require('../js/animalWorld');
const { simulateDay } = require('../js/simulator');
const { survivalImpact } = require('../js/survivalImpact');
const { habitatMigrationAssessment } = require('../js/ecologyConsistency');
const { Game } = require('../js/game');
const total = reserve => Object.values(populationSnapshot(reserve)).reduce((sum, n) => sum + n, 0);
for (let chapter = 1; chapter <= 20; chapter++) {
  const state = createCharacter(null, '动物来源回归'), reserve = state.world.reserve;
  Object.assign(reserve.progression, { stage: chapter, displayChapter: chapter, level: CHAPTERS[chapter - 1].level });
  normalizeChapterRescue(reserve, chapter, { fresh: true });
  const target = reserve.chapterRescue.targets[0];
  if (!target) {
    assert.equal(normalizeReserve(JSON.parse(JSON.stringify(reserve))).progression.stage, chapter);
    continue;
  }
  target.requiredItems.forEach(id => { target.pointProgress[id] = 15; target.collectedItems[id] = true; });
  const before = total(reserve);
  const beforeHud = livingAnimalTotal(reserve);
  const beforeSpecies = Number(populationSnapshot(reserve)[target.speciesId]) || 0;
  const starter = Math.max(1, Math.round(Number((SPECIES_DB[target.speciesId] || {}).initialPop) || 1));
  assert.equal(rescueAnimal(reserve, target.targetId).ok, true);
  const added = livingAnimalTotal(reserve) - beforeHud;
  const released = Number(populationSnapshot(reserve)[target.speciesId]) || 0;
  assert.equal(released, Math.max(beforeSpecies, starter), 'rescuing a trapped species restores its starter herd');
  assert.equal(total(reserve) - before, added, 'HUD animal-total change must match the released population');
  assert.equal(animalSourceSummary(reserve).rescued, added);
  assert.equal(rescueAnimal(reserve, target.targetId).ok, false);
  assert.equal(animalSourceSummary(reserve).rescued, added, 'repeat completion adds nothing');
  const loaded = normalizeReserve(JSON.parse(JSON.stringify(reserve)));
  assert.equal(loaded.progression.stage, chapter, 'late chapters must survive reload');
  const savedSources = animalSourceSummary(reserve);
  const loadedSources = animalSourceSummary(loaded);
  ["rescued", "returned", "growth", "opening", "immigrated", "breeding", "comforted", "advertised", "shared", "tasked", "emigrated", "died"].forEach((key) => {
    assert.equal(loadedSources[key], savedSources[key], `reload must keep ${key}`);
  });
  const game = Object.create(Game.prototype); game.state = state; game.render = () => {};
  const detail = game.buildChapterProgressDetail().metricDetails.animals;
  assert.equal(detail.items.length, 6, "解救、迁入、繁殖剩余合成一条，并前置最近可做事件");
  assert.ok(detail.items[0].sourceStrip);
  assert.ok(detail.items[0].title.includes(`+${added}`));
  assert.equal(detail.items[1].tag, "最近");
  assert.ok(detail.items.some(item => item.tag === '具体任务' && typeof item.action === 'function'));
  assert.ok(detail.items.some(item => /幸运获得|迁入动物/.test(`${item.tag}${item.title}`)));
  assert.ok(detail.items.some(item => item.tag === '流水' && /留存/.test(`${item.title}${item.body}`)));
  assert.ok(!detail.items.some(item => item.tag === '分享任务'), "built chapter card keeps share off the stacked list");
  assert.ok(!detail.items.some(item => /游客|晋级路径/.test(item.title)));
  game.openCoreMetricDetail("animals");
  const liveItems = (game.infoDetailModal && game.infoDetailModal.items) || [];
  assert.ok(liveItems.some(item => item.tag === "分享任务" && /获得动物/.test(item.title)), "opening the animal detail injects the live share row");
}
const state = createCharacter(null, '生态来源');
const reserve = state.world.reserve;
Object.assign(reserve.ecology, { water: 78, grass: 74, disease: 0 });
Object.assign(reserve, { safety: 80, poacherPressure: 0 });
const locked = reserve.chapterRescue.targets.filter(t => !t.rescuedAt).map(t => t.speciesId);
let current = state;
const previousRandom = Math.random;
Math.random = () => .01;
try {
for (let i = 0; i < 8; i++) {
  const result = simulateDay('修复栖息地', current);
  current = Object.assign({}, current, result);
  assert.ok(locked.every(id => (Number(populationSnapshot(current.world.reserve)[id]) || 0) <= 1), 'environment must not grow captive species');
}
} finally { Math.random = previousRandom; }
const logged = animalSourceSummary(current.world.reserve);
assert.ok(logged.returned > 0, 'natural return settlement must write the source ledger');
assert.ok(logged.growth > 0, 'actual births must write the source ledger');
const oldSave = createCharacter(null, '旧存档').world.reserve;
const oldSummary = animalSourceSummary(oldSave);
assert.equal(oldSummary.rescued, 0);
assert.equal(oldSummary.returned, 0);
assert.equal(oldSummary.growth, 0);
assert.equal(oldSummary.opening, oldSummary.ending, 'unread chapter stock is opening, not a visitor-style zero');
reserve.safety = 20;
assert.ok(habitatMigrationAssessment(reserve).delta <= 0, 'unsafe reserve pauses natural returns');
const poor = survivalImpact(reserve);
reserve.safety = 80;
const healthy = survivalImpact(reserve);
assert.notEqual(poor[0].lines[1], healthy[0].lines[1], 'migration share follows safety');
reserve.ecology.water = 90;
reserve.ecology.grass = 90;
assert.notEqual(survivalImpact(reserve)[0].lines[1], healthy[0].lines[1], 'migration share follows water and grass');
assert.deepEqual(survivalImpact(reserve).map((item) => item.id), ['safety']);
reserve.progression.stage = 2;
assert.equal(animalSourceSummary(reserve).rescued, 0, 'new chapter has separate sources');
for (const [width, height] of [[320, 568], [375, 812], [430, 932]]) {
  const game = new Game(); game.stopLoop();
  game.state = state; game.width = width; game.height = height;
  game.screen = 'survival'; game.scrollY = 0;
  rendered.length = 0;
  game.drawSurvival(context);
  assert.equal(game.renderedSurvivalImpacts.length, 1);
  assert.deepEqual(game.renderedSurvivalImpacts.map(item => item.id), ['safety']);
  assert.ok(rendered.some(text => text.includes('生存经营')));
  assert.ok(!game.renderedSurvivalImpacts.some(item => /物资|可应急|库存保障/.test(`${item.title} ${item.lines.join(' ')}`)), 'survival ops must not show the emergency-supplies block');
  game.infoDetailModal = game.buildChapterProgressDetail().metricDetails.animals;
  game.drawInfoDetailModal();
  assert.ok(rendered.join('').includes('解救'));
  assert.ok(rendered.join('').includes('迁入'));
  assert.ok(rendered.join('').includes('繁殖剩余'));
}
{
  const game = new Game(); game.stopLoop();
  game.state = state; game.width = 375; game.height = 812;
  game.infoDetailModal = game.buildSpeciesProfileDetail('deer');
  rendered.length = 0;
  game.drawInfoDetailModal();
  assert.equal(game.infoDetailModal.profile.breeding, animalSourceSummary(state.world.reserve).species.deer
    ? animalSourceSummary(state.world.reserve).species.deer.breeding || 0
    : 0);
  assert.ok(rendered.join('').includes('本章繁殖剩余'));
  assert.ok(/本章繁殖剩余/.test(game.infoDetailModal.footer));
}
console.log('survival animal sources ok: 20 chapters, real rescue deltas, repeat protection, save/reload, locked species, safety and water effects, independent detail');
