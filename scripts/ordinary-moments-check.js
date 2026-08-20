const { createCharacter } = require("../js/storage");
const { normalizeCollectionState } = require("../js/collectionSystem");
const { recordOrdinaryMoment, latestOrdinaryMoment, SPECIES_LINES, FACILITY_LINES } = require("../js/ordinaryMoments");

const state = createCharacter(null, "日常观察员");
normalizeCollectionState(state);
state.world.knownCharacters = [
  { id: "deer_friend", name: "晨角", shortName: "晨角", species: "鹿", relation: { trust: 60 } },
  { id: "crow_friend", name: "墨点", shortName: "墨点", species: "乌鸦", relation: { trust: 55 } },
  { id: "hound_friend", name: "砾灰", shortName: "砾灰", species: "猎犬", relation: { trust: 70 } }
];

const seen = new Set();
for (let index = 1; index <= 40; index += 1) {
  state.world.day = index;
  state.world.reserve.progression.totalActions = index;
  const result = recordOrdinaryMoment(state, { actionId: index % 2 ? "houndScout" : "habitat" });
  if (!result.moment || result.moment.kind !== "ordinary") throw new Error("effective action should create a non-modal ordinary moment");
  seen.add(result.moment.text);
}
if ((state.world.ordinaryMoments || []).length !== 24) throw new Error("ordinary moment history should cap at 24");
if (seen.size < 5) throw new Error("ordinary animal moments are too repetitive");
const latest = latestOrdinaryMoment(state);
if (!latest || !latest.animalName || !latest.species || !latest.text) throw new Error("latest ordinary moment lacks animal identity or text");
if (!SPECIES_LINES.鹿 || !SPECIES_LINES.乌鸦 || !SPECIES_LINES.猎犬) throw new Error("core animals need species-specific ordinary lines");
const { SPECIES_DB } = require("../js/animalWorld");
Object.values(SPECIES_DB).forEach((species) => {
  if (!Array.isArray(SPECIES_LINES[species.name]) || SPECIES_LINES[species.name].length < 3) throw new Error(`${species.name} needs three species-specific ordinary lines`);
});
if (Object.keys(FACILITY_LINES).length !== 6) throw new Error("all six repaired facilities need ordinary animal moments");

console.log("ordinary moments check ok");
