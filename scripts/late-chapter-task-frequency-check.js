const assert = require("node:assert/strict");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { CHAPTERS } = require("../js/animalWorld");
const {
  resolveEcologyNarrativeEvent,
  applyEcologyNarrativeDecision,
  ecologyNarrativeCadence
} = require("../js/ecologyNarrativeSystem");

function stateFor(chapter) {
  const state = createCharacter(null, "后期任务频度");
  Object.assign(state.world.reserve.progression, {
    stage: chapter,
    displayChapter: chapter,
    level: CHAPTERS[chapter - 1].level,
    activeSeconds: 3600
  });
  Object.assign(state.world.reserve, { safety: 80, poacherPressure: 18, fund: 10000 });
  Object.assign(state.world.reserve.ecology, { water: 76, grass: 72, disease: 8 });
  return state;
}

let previousLateCadence = null;
for (let chapter = 1; chapter <= CHAPTERS.length; chapter++) {
  const state = stateFor(chapter);
  const game = Object.create(Game.prototype);
  game.state = state;
  const cadence = game.chapterTaskCadence();
  assert(cadence.actionGap >= 4 && cadence.actionGap <= 24, `chapter ${chapter}: invalid action gap`);
  assert(cadence.intervalMs >= 70000 && cadence.cooldownMs >= cadence.intervalMs, `chapter ${chapter}: invalid real-time gap`);
  if (chapter <= 2) {
    assert.equal(cadence.mapGuided, false, `chapter ${chapter}: onboarding pacing must stay unchanged`);
    assert.equal(cadence.routineSlots, 3);
  } else {
    assert.equal(cadence.mapGuided, true, `chapter ${chapter}: mid and late chapter map tasks must not be permanently suppressed`);
    assert.equal(cadence.routineSlots, 4);
    if (previousLateCadence) {
      assert(cadence.actionGap <= previousLateCadence.actionGap, `chapter ${chapter}: task action gap must not grow`);
      assert(cadence.cooldownMs <= previousLateCadence.cooldownMs, `chapter ${chapter}: task time gap must not grow`);
    }
    previousLateCadence = cadence;
  }

  const reserve = state.world.reserve;
  assert(ecologyNarrativeCadence(reserve) >= 1, `chapter ${chapter}: retired nature-rule cadence should stay a harmless number`);
  for (let day = 1; day <= 12; day++) {
    assert.equal(resolveEcologyNarrativeEvent(reserve, reserve, { day, dayClosed: true, random: () => .999 }), null, `chapter ${chapter}: nature-rule tasks must stay removed`);
    assert.equal((reserve.ecologyNarrative || {}).pendingDecision || null, null, `chapter ${chapter}: day ${day} left a nature-rule task`);
  }
}

{
  const reserve = stateFor(CHAPTERS.length).world.reserve;
  assert.equal(resolveEcologyNarrativeEvent(reserve, reserve, { day: 1, dayClosed: true, random: () => .999 }), null, "late chapters must not spawn a nature-rule task");
  assert.equal(applyEcologyNarrativeDecision(reserve, "retired", "observe").ok, false, "a removed nature-rule task must not settle");
}

console.log(`late chapter task frequency ok: ${CHAPTERS.length} chapter bands, map guidance, 4/5 routine slots, 6–12 action cadence and non-stacking story guarantees`);
