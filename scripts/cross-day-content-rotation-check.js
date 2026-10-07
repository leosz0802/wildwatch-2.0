'use strict';

const assert = require('node:assert/strict');
const { createCharacter } = require('../js/storage');
const { normalizeGoalState, resolveGoals } = require('../js/goalSystem');
const { ensureDailyAnimalLetters } = require('../js/animalLetters');
const { visitorStoryLetter } = require('../js/speciesStoryLetters');
const { Game } = require('../js/game');

function refresh(state, now) {
  state.world.goals = resolveGoals(
    state,
    normalizeGoalState(state.world.goals, state, now),
    'cross-day-content-rotation-check'
  );
  return state.world.goals;
}

const state = createCharacter(null, '跨天体验稳定性检查');
const reserve = state.world.reserve;
reserve.progression.stage = 4;
reserve.progression.displayChapter = 4;
reserve.progression.level = 2;
reserve.progression.totalActions = 0;
reserve.chapterTheme = { chapter: 4, step: 0, completedTaskIds: [] };
reserve.ecology.water = 70;
reserve.ecology.grass = 38;
reserve.ecology.disease = 20;
reserve.safety = 78;
reserve.poacherPressure = 12;

const dayOneGoal = refresh(state, Date.parse('2026-10-01T12:00:00Z')).active.primary;
reserve.ecology.water = 32;
reserve.ecology.grass = 76;
reserve.safety = 42;
reserve.poacherPressure = 78;
const dayTwoGoal = refresh(state, Date.parse('2026-10-02T12:00:00Z')).active.primary;
assert(dayOneGoal && dayOneGoal.id, 'chapter 4 must expose a primary goal before the day rollover');
assert.equal(dayTwoGoal.id, dayOneGoal.id, 'an unfinished chapter task must remain the main task after a day rollover');

const letterWorld = createCharacter(null, '三日文本轮换检查').world;
letterWorld.reserve.progression.stage = 5;
letterWorld.reserve.progression.displayChapter = 5;
letterWorld.reserve.progression.level = 3;
letterWorld.reserve.ecology.water = 46;
letterWorld.reserve.ecology.grass = 62;
letterWorld.reserve.safety = 64;
letterWorld.reserve.ecology.herbivores.deer = 24;
letterWorld.lifeMemory.animalLetters = [];
letterWorld.lifeMemory.animalLetterDateKey = '';
const firstLetters = ensureDailyAnimalLetters(letterWorld, new Date('2026-10-01T12:00:00Z'));
letterWorld.lifeMemory = firstLetters.state;
const sameDay = ensureDailyAnimalLetters(letterWorld, new Date('2026-10-01T18:00:00Z'));
assert.equal(sameDay.changed, false, 'opening the game twice on one date must not rewrite animal letters');
const thirdDay = ensureDailyAnimalLetters(letterWorld, new Date('2026-10-04T12:00:00Z'));
assert.equal(thirdDay.changed, true, 'a new three-day window must create a new set of animal letters');
assert.notDeepEqual(
  firstLetters.created.map((letter) => letter.paragraphs.join('|')),
  thirdDay.created.map((letter) => letter.paragraphs.join('|')),
  'animal letter wording must rotate after the three-day window'
);
assert(thirdDay.created.every((letter) => letter.chapter === 5 && letter.level === 3 && /第5章/.test(letter.paragraphs.join(' '))),
  'animal letters must retain chapter and level context');

const visitorHistory = [];
const visitorReserve = letterWorld.reserve;
visitorReserve.ecology.herbivores.deer = 24;
const visitorOne = visitorStoryLetter(visitorReserve, 1, visitorHistory);
visitorHistory.push(visitorOne);
const visitorFour = visitorStoryLetter(visitorReserve, 4, visitorHistory);
assert(visitorOne && visitorFour && visitorOne.id !== visitorFour.id, 'visitor letters must rotate after three game days');
assert(visitorOne.chapter === 5 && visitorOne.level === 3 && /第5章|等级3/.test(visitorOne.body),
  'visitor letters must include current chapter and level');
assert(visitorOne.body !== visitorFour.body, 'visitor letters must not repeat the same body across rotation windows');

const game = new Game();
game.stopLoop();
game.render = () => {};
game.state = createCharacter(null, '图鉴轮换检查');
game.state.world.day = 1;
game.state.world.reserve.progression.stage = 5;
game.state.world.reserve.progression.displayChapter = 5;
game.state.world.reserve.progression.level = 3;
game.state.world.reserve.ecology.water = 52;
game.state.world.reserve.ecology.grass = 68;
const profileOne = game.buildSpeciesProfileDetail('deer');
game.state.world.day = 4;
const profileFour = game.buildSpeciesProfileDetail('deer');
assert(profileOne.profile.feedback !== profileFour.profile.feedback, 'animal encyclopedia feedback must rotate after three days');
assert.notDeepEqual(profileOne.profile.dialogues, profileFour.profile.dialogues,
  'animal encyclopedia dialogue set must rotate after three days');
assert(!/第5章|等级3/.test(profileFour.profile.feedback), 'animal encyclopedia feedback should read as natural animal language, without chapter/status metadata');
assert(profileFour.profile.dialogues.every((line) => !/^第\d+章·等级\d+/.test(line)),
  'animal encyclopedia dialogues should not expose chapter/status metadata as a fake quote');

console.log('cross-day content rotation check ok (stable chapter task, three-day visitor/animal/encyclopedia rotation)');
