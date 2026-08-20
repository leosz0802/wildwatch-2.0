const { Game } = require("../js/game");

const game = new Game();
const candidates = [
  { key: "animal:deer", kind: "animal", id: "deer", priority: 100 },
  { key: "animal:wolf", kind: "animal", id: "wolf", priority: 220 },
  { key: "marker:urgent", kind: "marker", id: "urgent", priority: 390 },
  { key: "facility:water", kind: "facility", id: "water", priority: 430 }
];
const resourceMarkers = [
  { presentation: "resource-flow", flowKind: "consumption", delta: -2 },
  { presentation: "resource-flow", flowKind: "production", delta: 2 }
];
const speakers = [];
let restFrames = 0;
let dialogueFrames = 0;

for (let now = 0; now <= 60000; now += 100) {
  const cycle = game.mapFeedbackCycle(resourceMarkers, [{ id: "drop" }], now);
  const selected = game.selectMapSpeechCandidate(cycle.phase === "dialogue" ? candidates : [], cycle);
  if (cycle.phase === "rest") restFrames += 1;
  if (cycle.phase === "dialogue") {
    dialogueFrames += 1;
    if (!selected) throw new Error(`dialogue phase lost its only speaker at ${now}ms`);
    const previous = speakers[speakers.length - 1];
    if (!previous || previous.slot !== cycle.dialogueSlot) speakers.push({ slot: cycle.dialogueSlot, key: selected.key });
    else if (previous.key !== selected.key) throw new Error("one dialogue slot changed speaker while it was visible");
  } else if (selected) {
    throw new Error(`${cycle.phase} phase must suppress map speech`);
  }
}

if (!restFrames || !dialogueFrames) throw new Error("map speech loop must contain both visible and blank frames");
if (speakers.length < 4) throw new Error("60 seconds should rotate through multiple map speakers");
for (let index = 1; index < speakers.length; index += 1) {
  if (speakers[index].key === speakers[index - 1].key) throw new Error("map speaker repeated despite other candidates being available");
}
if (new Set(speakers.map((entry) => entry.key)).size < 3) throw new Error("normal rotation should cover the visible cast");

const noResourceDialogue = game.mapFeedbackCycle([], [], 0);
const noResourceRest = game.mapFeedbackCycle([], [], 5000);
if (noResourceDialogue.phase !== "dialogue" || noResourceDialogue.duration !== 4800 || noResourceRest.phase !== "rest" || noResourceRest.duration !== 1800) {
  throw new Error("map dialogue must use 4.8s visible + 1.8s blank timing");
}

game.mapSpeechSelection = null;
game.mapSpeechHistory = {};
game.mapSpeakerFocus = { kind: "animal", id: "deer", expiresAfterSlot: 2, usedSlot: null };
const focused = game.selectMapSpeechCandidate(candidates, noResourceDialogue);
if (!focused || focused.key !== "animal:deer") throw new Error("player-tapped animal should own the next available speech slot");
const afterFocusCycle = game.mapFeedbackCycle([], [], 6600);
const afterFocus = game.selectMapSpeechCandidate(candidates, afterFocusCycle);
if (!afterFocus || afterFocus.key === "animal:deer" || game.mapSpeakerFocus) throw new Error("player focus should affect one speech slot only, then return to normal rotation");

console.log("map speech rotation check ok");
