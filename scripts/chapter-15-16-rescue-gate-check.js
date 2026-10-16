'use strict';

// The old 15/16-chapter regression is retained as a current-content guard.
// The live game now ends its finite campaign at chapter 11, so this check
// verifies that the final rescue set is present instead of probing removed
// chapters.
const assert = require('node:assert/strict');
const { CHAPTERS } = require('../js/animalWorld');
const { chapterDefinition } = require('../js/chapterRescueSystem');

assert.equal(CHAPTERS.length, 11, 'current campaign should contain 11 chapters');
const final = chapterDefinition(CHAPTERS.length);
assert.deepEqual(final.targets, ['tapir', 'fireflyBird', 'bison', 'crane']);
assert.deepEqual(final.captive, final.targets);
console.log('current chapter rescue gate check ok: removed chapter 15/16 probes now track the chapter-11 final rescue set');
