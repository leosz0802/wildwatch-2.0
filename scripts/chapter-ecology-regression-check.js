const assert = require('assert');
const design = require('../js/chapterEcologyDesign');
const stories = require('../js/animalInteractionStories');
const { speciesPopulationGroup } = require('../js/animalWorld');
for (let chapter = 1; chapter <= 11; chapter += 1) {
  const plan = design.chapterEcologyPlan(chapter);
  assert(plan && plan.theme && plan.cadenceDays >= 3, `missing plan ${chapter}`);
  assert(plan.stories.length >= 1, `missing story pool ${chapter}`);
  for (const item of design.chapterStoriesFor(chapter)) {
    assert(item.id && item.chapter === chapter, `bad story ${item.id}`);
    assert(item.choices.length >= 1, `story needs an intervention choice ${item.id}`);
  }
}
const reserve = { progression: { stage: 8, activeSeconds: 240 }, safety: 35, fund: 500,
  ecology: { water: 55, grass: 55, disease: 28, predators: { wilddog: 3, crocodile: 2 },
    herbivores: { zebra: 20, antelope: 15, deer: 20, hare: 8 }, birds: {} }, development: { operations: { today: { visitors: 20, recruitedVisitors: 0, income: 0 } } } };
const spawn = stories.advanceAnimalInteractionStories(reserve, {}, { day: 4 });
assert(spawn.active && spawn.active.storyId === 'ch8_wilddog_zebra_chase', `unexpected chapter story ${spawn.active && spawn.active.storyId}`);
assert(spawn.active.choices.length === 3, 'animal relationship UI should expose stop-loss, balance, and natural outcomes');
const before = reserve.safety;
const result = stories.resolveAnimalInteraction(reserve, spawn.active.storyId, spawn.active.choices[0].id, 4);
assert(result.ok && reserve.safety > before, 'intervention must change safety');
console.log(`chapter ecology regression ok (11 plans, ${design.allChapterStories().length} stories, chapter 8 trigger and resolution)`);
