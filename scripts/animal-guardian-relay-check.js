const { createCharacter } = require("../js/storage");
const {
  sharePayload,
  parseShareInvite,
  applyShareAssistance
} = require("../js/shareSystem");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function queryObject(query) {
  return Object.fromEntries(String(query || "").split("&").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  }));
}

const sender = createCharacter(null, "分享者");
sender.world.day = 21;
const animal = sender.world.lifeMemory.individuals[0] || {
  id: "relay-animal-1",
  name: "晨角",
  species: "鹿",
  speciesId: "deer"
};

const letter = sharePayload(sender.world, null, {
  id: "letter-21",
  forceDaily: true,
  sourceKind: "animal",
  relayKind: "animal_letter",
  animal,
  animalName: animal.name,
  title: "晨角写来的信",
  quote: "今天的水边很安静。",
  body: "今天的水边很安静。"
});
assert(letter.relayKind === "animal_letter" && letter.type === "animal_letter", "animal letter must be tagged for guardian relay");
const letterInvite = parseShareInvite({ query: queryObject(letter.query) });
assert(letterInvite && letterInvite.relayKind === "animal_letter" && letterInvite.sourceTitle === "晨角写来的信", "animal letter invite must retain relay source");

const rescue = sharePayload(sender.world, {
  type: "chapterRescue",
  relayKind: "rescue_event",
  sourceKind: "animal",
  day: 21,
  individualId: animal.id,
  name: animal.name,
  species: animal.species,
  title: "晨角已解救",
  body: "出口已经打开，晨角回到了保护区。"
});
assert(rescue.kind === "rescue" && rescue.relayKind === "rescue_event", "rescue event must use rescue relay presentation");
const rescueInvite = parseShareInvite({ query: queryObject(rescue.query) });
assert(rescueInvite && rescueInvite.relayKind === "rescue_event" && rescueInvite.individualId === animal.id, "rescue invite must retain animal identity");

const realEvent = sharePayload(sender.world, {
  type: "realNature",
  relayKind: "real_event",
  sourceKind: "animal",
  day: 21,
  name: animal.name,
  species: animal.species,
  title: "湿地恢复记录",
  body: "一次真实事件让保护区重新调整巡护路线。"
});
assert(realEvent.kind === "realNature" && realEvent.relayKind === "real_event", "real event must use real-event relay presentation");
const realInvite = parseShareInvite({ query: queryObject(realEvent.query) });
assert(realInvite && realInvite.relayKind === "real_event" && realInvite.sourceTitle === "湿地恢复记录", "real event invite must retain source title");

const receiver = createCharacter(null, "接力者");
receiver.world.knownCharacters[0].id = animal.id;
receiver.world.knownCharacters[0].species = animal.species;
const trustBefore = receiver.world.knownCharacters[0].relation.trust;
const result = applyShareAssistance(receiver, rescueInvite);
assert(result.applied && result.relayKind === "rescue_event", "rescue relay should apply once");
assert(receiver.world.knownCharacters[0].relation.trust === Math.min(100, trustBefore + 1), "relay should update animal trust");
assert(receiver.world.knownCharacters[0].relation.friendRelayCount === 1, "relay should count friend guardianship");
assert(receiver.world.knownCharacters[0].relation.lastFriendRelay.relayKind === "rescue_event", "relay should update relationship metadata");
assert((receiver.world.guardianRelayHistory || []).some((item) => item.shareId === rescueInvite.shareId), "relay should persist guardian history");
assert(receiver.world.lifeMemory.memories.some((item) => item.id === `memory_share_${rescueInvite.shareId}` && item.individualId === animal.id), "relay should persist an animal memory for the named individual");
assert(!applyShareAssistance(receiver, rescueInvite).applied, "same relay must be idempotent");

console.log("animal guardian relay check ok (animal letter, rescue event, real event, relationship text, memory, idempotency)");
