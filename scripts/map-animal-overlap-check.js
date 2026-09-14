const { Game } = require("../js/game");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = Object.create(Game.prototype);
game.hashString = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash) + value.charCodeAt(i);
  return hash | 0;
};

[
  { species: "野猪", bodySize: game.animalVisualSize("野猪") },
  { species: "鹿", bodySize: game.animalVisualSize("鹿") }
].forEach(({ species, bodySize }) => {
  const gap = Math.max(34, bodySize * 1.12);
  const offsets = game.animalGroupRenderOffsets(200, 2, gap, bodySize, 1, { x: 0, w: 400 });
  assert(offsets.length === 1, `${species} group of 2 should produce exactly one companion offset`);
  assert(Math.abs(offsets[0].x) >= bodySize * 1.1, `${species} companion offset should be wide enough to avoid overlap`);
});

const triple = game.animalGroupRenderOffsets(200, 3, 42, 48, 1, { x: 0, w: 400 });
assert(triple.length === 2, "group of 3 should produce two companions");
assert(Math.abs(triple[0].x - triple[1].x) >= 70, "companions in a 3-animal group should stay visually separated");

console.log("map animal overlap check ok");
