const assert = require("assert");
const { CATALOG } = require("../js/collectionSystem");
const { WILDERNESS_FIND_CATALOG } = require("../js/wildernessKnowledge");
const { SPECIES_DB } = require("../js/animalWorld");
const { knownCharacters } = require("../js/world");

assert.strictEqual(CATALOG.length, 45, "all 45 modern collectibles must remain available");
CATALOG.forEach((item) => {
  assert(item.reality && item.reality.length >= 24, `${item.name} needs a real-world interpretation layer`);
  assert(item.story && item.story.length >= 12, `${item.name} needs its own story layer`);
  assert(item.easterEgg && item.easterEgg.length >= 18, `${item.name} needs a hidden clue or foreshadow layer`);
});
assert.strictEqual(new Set(CATALOG.map((item) => item.easterEgg)).size, CATALOG.length, "every collectible must carry a distinct hidden clue");

assert.strictEqual(WILDERNESS_FIND_CATALOG.length, 12, "survival material catalog size changed unexpectedly");
WILDERNESS_FIND_CATALOG.forEach((item) => {
  ["reality", "story", "easterEgg", "acquisition", "ecologicalCost"].forEach((key) => {
    assert(item[key] && item[key].length >= (key === "story" ? 12 : 18), `${item.label} missing ${key} narrative layer`);
  });
  assert(item.safety && item.use && item.reserveEffect, `${item.label} must retain safety, practical use and reserve coupling`);
});
assert.strictEqual(new Set(WILDERNESS_FIND_CATALOG.map((item) => item.easterEgg)).size, WILDERNESS_FIND_CATALOG.length, "survival material foreshadows must not be copied templates");
assert.strictEqual(new Set(WILDERNESS_FIND_CATALOG.map((item) => item.ecologicalCost)).size, WILDERNESS_FIND_CATALOG.length, "each gathering action needs its own ecological tradeoff");

assert.strictEqual(knownCharacters.length, Object.keys(SPECIES_DB).length, "named-animal cast should cover the current species roster");
knownCharacters.forEach((animal) => {
  assert(animal.memory && animal.memory.length, `${animal.name} needs persistent memory`);
  assert(animal.trauma && animal.trauma.length >= 22, `${animal.name} needs a distinct trauma`);
  assert(animal.humanStance && animal.humanStance.length >= 22, `${animal.name} needs a considered stance toward humans`);
  assert(animal.sameSpeciesSplit && animal.sameSpeciesSplit.length >= 22, `${animal.name} needs an internal same-species disagreement`);
});
["trauma", "humanStance", "sameSpeciesSplit"].forEach((key) => {
  assert.strictEqual(new Set(knownCharacters.map((animal) => animal[key])).size, knownCharacters.length, `named animals must not share generic ${key} text`);
});

const dialogueText = Object.values(SPECIES_DB).flatMap((species) => {
  const groups = Object.values(species.dialogues || {}).flat();
  return groups.concat((species.representative || {}).quote || "");
}).join("|");
const bannedTone = /内卷|营业|打卡|换台|八卦|批准这片|斑点在线|水面很懂我|专业地扑空|体型优势|耳朵开跑|眼角报警|腿已预热/;
assert(!bannedTone.test(dialogueText), `animal dialogue still contains comic/network shorthand: ${dialogueText.match(bannedTone)}`);

const { Game } = require("../js/game");
const game = new Game();
game.stopLoop();
const deerProfile = game.buildSpeciesProfileDetail("deer");
assert(deerProfile && deerProfile.profile.namedDepth && deerProfile.depthPage === 0, "species detail must expose the named representative's stance, trauma and same-species split as a paged view");

console.log(`narrative depth check ok (45 collectibles, 12 survival materials, ${knownCharacters.length} named-animal memories and restrained voice)`);
