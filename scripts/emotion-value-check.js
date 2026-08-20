const { createInitialWorld, syncKnownCharactersForReserve } = require("../js/world");
const { createCharacter } = require("../js/storage");
const { Game } = require("../js/game");
const { SPECIES_DB, getUnlockedSpecies, speciesPopulationGroup } = require("../js/animalWorld");
const {
  normalizeLifeMemory,
  advanceLifeMemory,
  prepareGuardianReturnLetter,
  individualsForSpecies,
  relationshipAxes,
  displayStatus
} = require("../js/emotionSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function unlockThrough(world, level) {
  world.reserve.progression.level = level;
  getUnlockedSpecies(level).forEach((species) => {
    const group = speciesPopulationGroup(species.id);
    world.reserve.ecology[group][species.id] = Math.max(1, world.reserve.ecology[group][species.id] || species.initialPop || 1);
  });
  world.knownCharacters = syncKnownCharactersForReserve(world.knownCharacters || [], world.reserve);
  return world;
}

let world = createInitialWorld();
let memory = normalizeLifeMemory(world);
assert(memory.individuals.length === 7, `Lv1 should start with seven named friends, got ${memory.individuals.length}`);
assert(memory.memories.filter((item) => item.type === "met").length === 7, "first encounters should be written into reserve memory");
getUnlockedSpecies(1).forEach((species) => {
  const friends = individualsForSpecies(Object.assign({}, world, { lifeMemory: memory }), species.id);
  assert(friends.length >= 1 && friends.length <= 2, `${species.name} should have one or two known friends`);
  assert(friends[0].name && Number.isFinite(friends[0].ageDays), `${species.name} friend data is incomplete`);
  const axes = relationshipAxes(friends[0]);
  assert(Number.isFinite(axes.security) && Number.isFinite(axes.wildness), `${species.name} should have security and wildness axes`);
});

// 直接救助提高安全感但削弱野性；栖息地修复同时改善安全感和独立生存能力。
const interventionWorld = createInitialWorld();
interventionWorld.lifeMemory = normalizeLifeMemory(interventionWorld);
const interventionBefore = clone(interventionWorld);
interventionWorld.day += 1;
const interventionStep = advanceLifeMemory(interventionBefore, interventionWorld, { actionId: "intervention" });
assert(interventionStep.relationshipChange && interventionStep.relationshipChange.securityDelta > 0 && interventionStep.relationshipChange.wildnessDelta < 0, "direct rescue should trade wildness for security");
const habitatWorld = createInitialWorld();
habitatWorld.lifeMemory = normalizeLifeMemory(habitatWorld);
const habitatBefore = clone(habitatWorld);
habitatWorld.day += 1;
const habitatStep = advanceLifeMemory(habitatBefore, habitatWorld, { actionId: "habitat" });
assert(habitatStep.relationshipChange && habitatStep.relationshipChange.securityDelta > 0 && habitatStep.relationshipChange.wildnessDelta > 0, "habitat restoration should improve both security and wildness");

// 高疾病会让具体朋友受伤；时间会让它老去；良好环境会迎来新生命。
let injuryWorld = createInitialWorld();
injuryWorld.lifeMemory = normalizeLifeMemory(injuryWorld);
injuryWorld.reserve.safety = 60;
injuryWorld.reserve.ecology.disease = 90;
let injuryEvent = null;
for (let index = 0; index < 12 && !injuryEvent; index += 1) {
  const before = clone(injuryWorld);
  injuryWorld.day += 1;
  const next = advanceLifeMemory(before, injuryWorld, { actionId: "houndScout" });
  injuryWorld.lifeMemory = next.state;
  injuryEvent = next.events.find((event) => event.type === "injury") || null;
}
assert(injuryEvent && injuryEvent.individual.health < 46, "high disease should injure a named friend, not only change a macro number");

let oldWorld = createInitialWorld();
oldWorld.lifeMemory = normalizeLifeMemory(oldWorld);
const agingFriend = oldWorld.lifeMemory.individuals[0];
agingFriend.ageDays = Math.ceil(agingFriend.lifespanDays * 0.78) - 1;
agingFriend.oldNoted = false;
agingFriend.lastEventDay = oldWorld.day - 4;
const oldBefore = clone(oldWorld);
oldWorld.day += 1;
let lifeStep = advanceLifeMemory(oldBefore, oldWorld, { actionId: "habitat" });
assert(lifeStep.events.some((event) => event.type === "old" && event.individual.id === agingFriend.id), "aging should become a named memory event");

let birthWorld = createInitialWorld();
birthWorld.lifeMemory = normalizeLifeMemory(birthWorld);
birthWorld.reserve.safety = 86;
birthWorld.reserve.ecologyScore = 84;
birthWorld.reserve.ecology.water = 84;
birthWorld.reserve.ecology.grass = 84;
birthWorld.reserve.ecology.disease = 8;
let birthEvent = null;
for (let index = 0; index < 35 && !birthEvent; index += 1) {
  const before = clone(birthWorld);
  birthWorld.day += 1;
  const next = advanceLifeMemory(before, birthWorld, { actionId: "habitat" });
  birthWorld.lifeMemory = next.state;
  birthEvent = next.events.find((event) => event.type === "birth") || null;
}
assert(birthEvent && birthEvent.individual.lifeStage === "幼年", "healthy reserve should eventually welcome a named newborn");

// 高质量保护区会依次触发白鹿、黑狼、金象，且同一罕见时刻不重复。
world.lifeMemory = memory;
world = unlockThrough(world, 4);
world.reserve.safety = 90;
world.reserve.ecologyScore = 88;
world.reserve.stability = 88;
world.reserve.ecology.water = 88;
world.reserve.ecology.grass = 88;
world.reserve.ecology.disease = 8;
const beforeRare = clone(world);
world.day += 1;
let update;
const rareTypes = [];
for (let index = 0; index < 3; index += 1) {
  const before = clone(world);
  world.day += 1;
  update = advanceLifeMemory(before, world, { actionId: "habitat" });
  world.lifeMemory = update.state;
  rareTypes.push(...update.events.filter((event) => event.type === "rare"));
}
assert(rareTypes.length === 3, `three qualifying actions should reveal three rare moments one at a time, got ${rareTypes.length}`);
assert(new Set(rareTypes.map((event) => event.individual.rarity)).has("白鹿"), "white deer moment missing");
assert(new Set(rareTypes.map((event) => event.individual.rarity)).has("黑狼"), "black wolf moment missing");
assert(new Set(rareTypes.map((event) => event.individual.rarity)).has("金象"), "gold elephant moment missing");
const afterRare = clone(world);
world.day += 1;
update = advanceLifeMemory(afterRare, world, { actionId: "habitat" });
assert(!update.events.some((event) => event.type === "rare"), "rare moments should not repeat after discovery");
world.lifeMemory = update.state;

// 离开的朋友在保护区恢复后以独立事件归来，并进入永久记忆。
const departed = world.lifeMemory.individuals.find((item) => item.status === "active" && !item.rarity);
departed.status = "departed";
departed.lastEventDay = world.day - 4;
const beforeReturn = clone(world);
world.day += 1;
world.reserve.migration = { trend: "in", delta: 2, reason: "保护区恢复" };
update = advanceLifeMemory(beforeReturn, world, { actionId: "habitat" });
const returnEvent = update.events.find((event) => event.type === "return" && event.individual.id === departed.id);
assert(returnEvent && /回来了/.test(returnEvent.title), "departed named friend should return as an event");
assert(/沿旧路回来了/.test(returnEvent.body) && returnEvent.body.length <= 30, "return event should be a concise personal moment, not a numeric notice");
assert(update.state.memories.some((item) => item.type === "return" && item.individualId === departed.id), "return should be written to reserve memory");
world.lifeMemory = update.state;

// 高安全感与高野性不是“满信任”，而是允许朋友独立离开；雨季后可带幼崽经过但不会重新变成被照顾对象。
let freedomWorld = createInitialWorld();
freedomWorld.lifeMemory = normalizeLifeMemory(freedomWorld);
freedomWorld.reserve.safety = 88;
freedomWorld.reserve.ecologyScore = 86;
freedomWorld.reserve.ecology.water = 86;
freedomWorld.reserve.ecology.grass = 86;
freedomWorld.reserve.ecology.disease = 6;
freedomWorld.reserve.migration = { trend: "in", delta: 2, reason: "迁徙通畅" };
freedomWorld.season = "雨季";
const freedomFriend = freedomWorld.lifeMemory.individuals[0];
freedomFriend.security = 78;
freedomFriend.wildness = 90;
freedomFriend.bond = 78;
freedomFriend.health = 92;
freedomFriend.lifeStage = "成年";
freedomFriend.ageDays = Math.max(freedomFriend.ageDays, Math.ceil(freedomFriend.lifespanDays * .3));
freedomFriend.lastEventDay = freedomWorld.day - 8;
let independenceEvent = null;
for (let index = 0; index < 8 && !independenceEvent; index += 1) {
  const before = clone(freedomWorld);
  freedomWorld.day += 1;
  const next = advanceLifeMemory(before, freedomWorld, { actionId: "buySupplies" });
  freedomWorld.lifeMemory = next.state;
  independenceEvent = next.events.find((event) => event.type === "independence" && event.individual.id === freedomFriend.id) || null;
}
assert(independenceEvent && /不再需要/.test(independenceEvent.title), "high security and wildness should produce a positive independence event");
let independentFriend = freedomWorld.lifeMemory.individuals.find((item) => item.id === freedomFriend.id);
assert(independentFriend.status === "independent" && displayStatus(independentFriend) === "重归野外", "independence must be a distinct positive status");
freedomWorld.day = independentFriend.independenceDay + 8;
independentFriend.lastEventDay = independentFriend.independenceDay;
const visitBefore = clone(freedomWorld);
freedomWorld.day += 1;
const visitStep = advanceLifeMemory(visitBefore, freedomWorld, { actionId: "buySupplies" });
const wildVisit = visitStep.events.find((event) => event.type === "wild_visit" && event.individual.id === freedomFriend.id);
assert(wildVisit && /幼崽/.test(wildVisit.title), "an independent friend should be able to revisit with young in the rainy season");
assert(visitStep.state.individuals.find((item) => item.id === freedomFriend.id).status === "independent", "a wild visit must not turn independence back into dependency");

// 老去和死亡不会删除个体，100天后仍可翻看。
const elder = world.lifeMemory.individuals.find((item) => item.status === "active" && !item.rarity);
elder.ageDays = elder.lifespanDays;
elder.lastEventDay = world.day - 4;
const beforeDeath = clone(world);
world.day += 1;
update = advanceLifeMemory(beforeDeath, world, { actionId: "houndScout" });
const deathEvent = update.events.find((event) => event.type === "death" && event.individual.id === elder.id);
assert(deathEvent, "natural death should create a named life event");
assert(update.state.individuals.some((item) => item.id === elder.id && item.status === "dead"), "dead friend should remain in the individual archive");
assert(update.state.memories.some((item) => item.individualId === elder.id && item.type === "death"), "death memory should remain readable");
assert(displayStatus(update.state.individuals.find((item) => item.id === elder.id)) === "已故", "dead friend status label is wrong");
world.lifeMemory = update.state;

for (let i = 0; i < 100; i += 1) {
  const before = clone(world);
  world.day += 1;
  const next = advanceLifeMemory(before, world, { actionId: "houndScout" });
  world.lifeMemory = next.state;
}
assert(world.lifeMemory.individuals.some((item) => item.id === elder.id && item.status === "dead"), "named friend disappeared after 100 days");
assert(world.lifeMemory.memories.some((item) => item.individualId === elder.id && item.type === "death"), "death memory disappeared after 100 days");
const memoryGame = Object.create(Game.prototype);
memoryGame.state = { world };
const memoryDetail = memoryGame.buildLifeMemoryDetail();
assert(memoryDetail.items.some((item) => /走完了一生/.test(`${item.title} ${item.body}`)), "100-day memory view should surface landmark life memories");

// 断签至少两天才来信，信件只生成一次，并明确表达“你回来就好”。
const now = Date.now();
world.lifeMemory.lastSeenAt = now - 4 * 24 * 60 * 60 * 1000;
world.lifeMemory.lastLetterKey = "";
const letterVisit = prepareGuardianReturnLetter(world, now);
assert(letterVisit.letter && letterVisit.letter.absentDays === 4, "four-day absence should trigger a guardian letter");
assert(/你回来就好/.test(`${letterVisit.letter.quote}${letterVisit.letter.body}`), "return letter should provide being-needed emotion");
world.lifeMemory = letterVisit.state;
const repeated = prepareGuardianReturnLetter(world, now + 1000);
assert(!repeated.letter, "the same return window should not create a duplicate letter");

// 即时守护回声会把信任跨档变成关系突破。
const game = Object.create(Game.prototype);
game.state = createCharacter(null, "保护区卫士");
const beforeWorld = clone(game.state.world);
const actorBefore = beforeWorld.knownCharacters.find((animal) => animal.species === "鹿");
actorBefore.relation.trust = 57;
const afterWorld = clone(beforeWorld);
const actorAfter = afterWorld.knownCharacters.find((animal) => animal.id === actorBefore.id);
actorAfter.relation.trust = 58;
afterWorld.day += 1;
const echo = game.buildGuardianEcho(beforeWorld, afterWorld, "驱赶偷猎者：清理边界", {});
assert(echo.milestone, "trust tier crossing should become a relationship breakthrough");
assert(/记住|知道|睡得/.test(echo.title), "guardian echo should be emotional rather than a raw number");

console.log("emotion value check ok");
