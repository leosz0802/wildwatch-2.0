// Chapter-facing goals used by the header and chapter transition copy.
// They are intentionally separate from the operational actions: every
// existing action can contribute to these three readable outcomes. Animal
// totals stay below the 1,251-species-capacity ceiling so late chapters are
// demanding without becoming mathematically impossible.
const TARGETS = Object.freeze([
  // Chapter 1 starts with five resident species. Releasing its one required
  // animal (the antelope) brings the reachable roster to six; the target must
  // reflect that rescue instead of requiring the dormant legacy hare.
  [6, 120, 30], [7, 150, 55], [11, 185, 85], [11, 225, 120], [15, 270, 165],
  [15, 330, 220], [19, 400, 290], [19, 480, 380], [21, 570, 490], [21, 670, 630],
  [23, 760, 810], [23, 850, 1030], [25, 930, 1300], [25, 990, 1600], [25, 1040, 1950],
  [27, 1070, 2350], [29, 1090, 2800], [31, 1100, 3350], [33, 1100, 4000], [33, 1100, 4700]
]);

function chapterTargets(chapter = 1) {
  const index = Math.max(0, Math.min(TARGETS.length - 1, Math.round(Number(chapter) || 1) - 1));
  const [species, animals, visitors] = TARGETS[index];
  // The first six chapters are the onboarding arc and stay within 3–5
  // minutes. The 30% growth starts only after that arc (chapter 7 onward).
  const expectedMinutes = index < 6
    ? 3 + index * .4
    : 5 * Math.pow(1.3, index - 5);
  return { species, animals, visitors, expectedMinutes };
}

module.exports = { chapterTargets, CHAPTER_TARGETS: TARGETS };
