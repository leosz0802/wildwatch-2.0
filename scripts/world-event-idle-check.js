const { createInitialWorld } = require("../js/world");
const { advanceIdleEmergency } = require("../js/simulator");

function assert(value, message) {
  if (!value) throw new Error(message);
}

const reserve = createInitialWorld().reserve;
reserve.emergency = Object.assign({ active: null, cooldown: 0, history: [], lastOutcome: null, idleNextAt: 1 }, reserve.emergency || {});
reserve.emergency.idleNextAt = Date.now() - 1;
reserve.poacherPressure = 5;
reserve.ecology = Object.assign({}, reserve.ecology, { water: 32, grass: 38, disease: 6 });

const outcome = advanceIdleEmergency(reserve, { name: "旱季" }, Date.now(), () => 0.01);
assert(outcome && outcome.kind === "started", "idle emergency should start once the timer is due");
assert(reserve.emergency.active && reserve.emergency.active.type, "idle emergency should attach an active event");
assert(Number(reserve.emergency.idleNextAt) > Date.now(), "idle emergency should schedule the next trigger in the future");

const blocked = advanceIdleEmergency(reserve, { name: "旱季" }, Date.now() + 180000, () => 0.01);
assert(blocked === null, "an already active emergency should block further idle triggers");

console.log("world event idle check ok");
