'use strict';

const assert = require('node:assert/strict');
const { createInitialWorld } = require('../js/world');
const { chapterTargets, CHAPTER_TARGETS, chapterVisitorCarryover } = require('../js/chapterTargets');
const { consumeVisitorRecruitment, previewVisitorRecruitment, grantVisitorRecruitmentAd } = require('../js/visitorRecruitment');
const { getUnlockedSpecies, speciesPopulationGroup } = require('../js/animalWorld');
const { chapterSpecialDef } = require('../js/chapterSpecialSystem');

const day = new Date(2026, 0, 1, 10, 0, 0).getTime();

for (let chapter = 2; chapter <= CHAPTER_TARGETS.length; chapter += 1) {
  const current = chapterTargets(chapter).visitors;
  const previous = chapterTargets(chapter - 1).visitors;
  const inherit = chapterVisitorCarryover(previous, chapter);
  const need = current - inherit;
  assert.ok(current > previous, `visitor target must keep rising at chapter ${chapter}`);
  assert.strictEqual(inherit, Math.round(previous * 0.1), `chapter ${chapter} inherit must stay at 10%`);
  assert.ok(need > inherit, `chapter ${chapter} must be earned mostly in this chapter, not from inherit`);
  assert.ok(need >= 48, `chapter ${chapter} this-chapter visitor need must stay at least as large as chapter 1`);
}

const opening = createInitialWorld().reserve;
const first = consumeVisitorRecruitment(opening, 1, 0.5, day);
const second = consumeVisitorRecruitment(opening, 1, 0.5, day);
assert.ok(first.ok && second.ok, 'chapter 1 should allow two free recruits');
assert.ok(first.visitors >= 22 && first.visitors <= 34, `first recruit should be 22–34, got ${first.visitors}`);
assert.ok(second.visitors >= 28 && second.visitors <= 44, `second recruit should be 28–44, got ${second.visitors}`);
assert.ok(second.visitors / first.visitors <= 1.6, `chapter 1 waves should stay close, got ${first.visitors} then ${second.visitors}`);
assert.ok(second.visitors - first.visitors <= 16, `chapter 1 wave gap should stay within 16, got ${second.visitors - first.visitors}`);
assert.ok(first.visitors < chapterTargets(1).visitors, 'a single recruit should not finish the chapter 1 visitor goal');
assert.ok(
  first.visitors + second.visitors < chapterTargets(1).visitors,
  'two free recruits should leave a small chapter 1 gap so the quick path needs an ad'
);
assert.ok(
  first.visitors + second.visitors < chapterTargets(2).visitors,
  'two chapter 1 recruits must not skip the chapter 2 visitor goal'
);
assert.strictEqual(consumeVisitorRecruitment(opening, 1, 0.5, day).ok, false, 'the daily free quota must stop after two recruits');
assert.ok(grantVisitorRecruitmentAd(opening, 1, day).ok, 'the quick path must be able to unlock two more recruits with an ad');
const adWaveA = consumeVisitorRecruitment(opening, 1, 0.5, day);
const adWaveB = consumeVisitorRecruitment(opening, 1, 0.5, day);
assert.ok(adWaveA.ok && adWaveB.ok, 'the ad grant must provide two usable recruit opportunities');
assert.ok(
  first.visitors + second.visitors + adWaveA.visitors + adWaveB.visitors >= chapterTargets(1).visitors,
  'two free recruits plus one ad grant should finish the chapter 1 visitor goal quickly'
);

function seedChapterAnimals(reserve, chapter) {
  const animalTotal = chapterTargets(chapter).animals;
  const unlocked = getUnlockedSpecies(7, chapter);
  const ecology = { predators: {}, herbivores: {}, birds: {} };
  const weight = unlocked.reduce((sum, species) => sum + (species.initialPop || 4), 0);
  unlocked.forEach((species) => {
    const group = speciesPopulationGroup(species.id);
    const share = Math.max(1, Math.round(animalTotal * (species.initialPop || 4) / Math.max(1, weight)));
    ecology[group][species.id] = Math.min(species.maxPop || 50, Math.max(1, share));
  });
  reserve.ecology = Object.assign({}, reserve.ecology, ecology, {
    water: 70,
    grass: 70,
    disease: 12
  });
  reserve.safety = 70;
  reserve.poacherPressure = 20;
}

for (let chapter = 1; chapter <= 20; chapter += 1) {
  const reserve = createInitialWorld().reserve;
  reserve.progression = Object.assign({}, reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    level: Math.min(7, 1 + Math.floor((chapter - 1) / 2))
  });
  seedChapterAnimals(reserve, chapter);
  reserve.development.operations.recruitment = {
    version: 3,
    day: chapter,
    dateKey: '2026-01-01',
    freeRemaining: 2,
    adCredits: 2,
    adWatchedToday: 0,
    totalRecruited: chapter === 1 ? 0 : 80,
    publishCount: chapter === 1 ? 0 : 3,
    lastResult: null
  };
  const previous = chapter === 1 ? 0 : chapterTargets(chapter - 1).visitors;
  const current = chapterTargets(chapter).visitors;
  const inherit = chapter === 1 ? 0 : chapterVisitorCarryover(previous, chapter);
  const need = current - inherit;
  const waveA = consumeVisitorRecruitment(reserve, chapter, 0.5, day);
  const waveB = consumeVisitorRecruitment(reserve, chapter, 0.5, day);
  const waveC = consumeVisitorRecruitment(reserve, chapter, 0.5, day);
  const waveD = consumeVisitorRecruitment(reserve, chapter, 0.5, day);
  assert.ok(waveA.ok && waveB.ok && waveC.ok && waveD.ok, `chapter ${chapter} free/ad recruits must be consumable`);
  assert.ok(
    waveA.visitors < need,
    `chapter ${chapter} one recruit (${waveA.visitors}) must not finish this chapter's +${need} visitor need`
  );
  assert.ok(
    waveA.visitors + waveB.visitors < need,
    `chapter ${chapter} two free recruits must leave a visitor gap: ${waveA.visitors}+${waveB.visitors} < ${need}`
  );
  if (chapter <= 2) {
    assert.ok(
      waveA.visitors + waveB.visitors + waveC.visitors >= need,
      `chapter ${chapter} slow path (two free + one restored recruit) must cover +${need}: ${waveA.visitors}+${waveB.visitors}+${waveC.visitors}`
    );
    assert.ok(
      waveA.visitors + waveB.visitors + waveC.visitors + waveD.visitors >= need,
      `chapter ${chapter} two free recruits plus one ad grant must cover this chapter's +${need} visitor need: ${waveA.visitors}+${waveB.visitors}+${waveC.visitors}+${waveD.visitors}`
    );
  } else {
    assert.ok(
      waveA.visitors + waveB.visitors + waveC.visitors < need,
      `chapter ${chapter} three same-day recruits must not finish the longer +${need} visitor gate: ${waveA.visitors}+${waveB.visitors}+${waveC.visitors}`
    );
  }
  if (chapter < 20) {
    const overshoot = inherit + waveA.visitors + waveB.visitors + waveC.visitors + waveD.visitors;
    const nextInherit = chapterVisitorCarryover(overshoot, chapter + 1);
    assert.ok(
      nextInherit < chapterTargets(chapter + 1).visitors,
      `overshooting chapter ${chapter} with two free plus two ad recruits must not auto-complete the next visitor gate`
    );
  }
}

const healthyEco = { water: 90, grass: 74, disease: 5, safety: 90, poacher: 10 };
for (let chapter = 1; chapter <= 20; chapter += 1) {
  const reserve = createInitialWorld().reserve;
  reserve.progression = Object.assign({}, reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    level: Math.min(7, 1 + Math.floor((chapter - 1) / 2))
  });
  seedChapterAnimals(reserve, chapter);
  reserve.ecology.water = healthyEco.water;
  reserve.ecology.grass = healthyEco.grass;
  reserve.ecology.disease = healthyEco.disease;
  reserve.safety = healthyEco.safety;
  reserve.poacherPressure = healthyEco.poacher;
  reserve.development.operations.recruitment = {
    version: 3,
    day: chapter,
    dateKey: '2026-01-01',
    freeRemaining: 2,
    adCredits: 2,
    adWatchedToday: 0,
    totalRecruited: chapter === 1 ? 0 : 80,
    publishCount: chapter === 1 ? 0 : 3,
    lastResult: null
  };
  const previous = chapter === 1 ? 0 : chapterTargets(chapter - 1).visitors;
  const inherit = chapter === 1 ? 0 : chapterVisitorCarryover(previous, chapter);
  const need = chapterTargets(chapter).visitors - inherit;
  const waveA = consumeVisitorRecruitment(reserve, chapter, 0.95, day);
  const waveB = consumeVisitorRecruitment(reserve, chapter, 0.95, day);
  const waveC = consumeVisitorRecruitment(reserve, chapter, 0.95, day);
  assert.ok(waveA.ok && waveB.ok && waveC.ok, `healthy chapter ${chapter} recruits must be consumable`);
  const specialVisitors = Math.max(0, Math.round(Number((chapterSpecialDef(chapter).success || {}).visitors) || 0));
  assert.ok(
    waveA.visitors + waveB.visitors < need,
    `healthy chapter ${chapter} two free recruits must still need an ad or a restore: ${waveA.visitors}+${waveB.visitors} < ${need}`
  );
  assert.ok(
    waveA.visitors + waveB.visitors + specialVisitors < need,
    `healthy chapter ${chapter} two free recruits plus special task +${specialVisitors} must not skip the ad/restore: ${waveA.visitors}+${waveB.visitors}+${specialVisitors} < ${need}`
  );
  if (chapter <= 2) {
    assert.ok(
      waveA.visitors + waveB.visitors + waveC.visitors >= need,
      `healthy chapter ${chapter} third recruit (restore or ad) must finish: ${waveA.visitors}+${waveB.visitors}+${waveC.visitors} >= ${need}`
    );
  } else {
    assert.ok(
      waveA.visitors + waveB.visitors + waveC.visitors < need,
      `healthy chapter ${chapter} third recruit must still leave a gap for the longer gate: ${waveA.visitors}+${waveB.visitors}+${waveC.visitors} < ${need}`
    );
  }
}

const previewReserve = createInitialWorld().reserve;
previewReserve.progression.stage = 12;
const latePreview = previewVisitorRecruitment(previewReserve, 12, 0.5, day);
assert.ok(latePreview.visitors >= 20, 'late-chapter recruitment must still produce a visible wave');

console.log('chapter visitor recruitment check ok');
