'use strict';
const assert = require('assert');
const api = require('../js/chapterRescueSystem');
const { resolveMaterialExploration } = require('../js/materialExploration');

// A legacy chapter save may still contain two required materials. Normalization
// must keep the first track (and its score) as the only active requirement.
const reserve = { progression: { level: 7 }, ecology: { herbivores: {}, predators: {}, birds: {} } };
const state = api.normalizeChapterRescue(reserve, 7, { fresh: true });
const target = state.targets[0];
const canonical = api.requiredItemsFor(target.speciesId)[0];
target.requiredItems = ['rescue_scent_cloth', canonical];
target.pointProgress = { rescue_scent_cloth: 14, [canonical]: 8 };
state.version = 3;
api.invalidateRescueCache?.(reserve);
const migrated = api.normalizeChapterRescue(reserve, 7);
const migratedTarget = api.findRecord(migrated, target.targetId);
assert.deepStrictEqual(migratedTarget.requiredItems, [canonical]);
assert.strictEqual(migratedTarget.pointProgress[canonical], 8);
assert.strictEqual(migratedTarget.pointProgress.rescue_scent_cloth, undefined);

const recurring = { poacherRescue: { active: [{ targetId: 'poacher:legacy', speciesId: 'boar', chapter: 7, status: 'captive', requiredItems: ['rescue_field_key', 'rescue_scent_cloth'] }] } };
const recurringState = api.poacherRescueState(recurring);
assert.deepStrictEqual(recurringState.active[0].requiredItems, ['rescue_field_key']);

const points = {};
for (const roll of [4, 4, 4, 4, 4]) {
  const result = resolveMaterialExploration(points, [], 'rescue_field_key', () => 0, 4, null, { rescueRequiredScore: 15 });
  assert(result.collectionProgress.current >= 0 && result.collectionProgress.current <= 15);
}
assert.strictEqual(points.materialExplorationProgress.rescue_field_key, 15);
console.log('rescue single material check ok: legacy two-item records migrate to one track and arrow points accumulate');
