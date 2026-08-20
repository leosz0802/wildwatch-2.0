// 验证 Phase 3 NPC 真实化：意图多样化、结盟、伏击、盟友益处
const { animals } = require("../js/animals");
const { createCharacter } = require("../js/storage");
const { simulateDay, resolveNpcEvents } = require("../js/simulator");

// 1. NPC 意图多样化（狼的动向不再是单一循环）
const deer = animals.find((a) => a.id === "deer");
let s = createCharacter(deer, "晨角");
const wolfTypes = new Set();
for (let i = 0; i < 40; i += 1) {
  const res = simulateDay("休息", s);
  const wolfMove = res.world.npcMovements.find((m) => m.actorId === "npc_wolf");
  if (wolfMove) wolfTypes.add(wolfMove.type);
  s = Object.assign({}, s, { world: res.world, character: res.character, reports: res.reports });
}
if (wolfTypes.size < 2) {
  throw new Error(`狼的意图应多样化（≥2 种），实际 ${[...wolfTypes].join("/")}`);
}

// 2. 结盟：trust≥70 且非盟 → ally=true + 结盟事件
const char2 = { hunger: 50, thirst: 50, stamina: 50, health: 80, skills: {}, inventory: {} };
const npcUpdate2 = {
  knownCharacters: [{ id: "npc_x", name: "测试鹿", species: "鹿", relation: { trust: 75, threat: 20 }, ally: false, intent: { targetRegionId: "meadow" } }],
  npcMovements: []
};
const res2 = resolveNpcEvents(char2, npcUpdate2, 10, "南部林缘草甸");
if (!res2.knownCharacters[0].ally) throw new Error("trust≥70 的 NPC 应结盟");
if (!res2.events.some((e) => e.kind === "ally")) throw new Error("应有结盟事件");

// 3. 伏击：非盟捕食者 threat≥75，多次应至少触发一次
const predator = { id: "npc_w", name: "沉牙", species: "狼", relation: { trust: 20, threat: 80 }, ally: false, intent: { targetRegionId: "meadow" } };
let ambushed = false;
for (let i = 0; i < 30; i += 1) {
  const c = { hunger: 50, thirst: 50, stamina: 50, health: 80, skills: {}, inventory: {} };
  const r = resolveNpcEvents(c, { knownCharacters: [predator], npcMovements: [] }, i, "南部林缘草甸");
  if (r.events.some((e) => e.kind === "ambush")) { ambushed = true; break; }
}
if (!ambushed) throw new Error("threat≥75 的捕食者 30 次应至少伏击一次");
// 伏击应掉血
let dropped = false;
for (let i = 0; i < 30; i += 1) {
  const c = { hunger: 50, thirst: 50, stamina: 50, health: 80, skills: {}, inventory: {} };
  const r = resolveNpcEvents(c, { knownCharacters: [predator], npcMovements: [] }, i, "南部林缘草甸");
  if (r.character.health < 80) { dropped = true; break; }
}
if (!dropped) throw new Error("伏击应让玩家掉血");

// 4. 盟友益处：盟友每日 hunger -3，且盟友不伏击
const ally = { id: "npc_a", name: "盟友鸦", species: "乌鸦", relation: { trust: 80, threat: 10 }, ally: true, intent: { targetRegionId: "meadow" } };
const char4 = { hunger: 50, thirst: 50, stamina: 50, health: 80, skills: {}, inventory: {} };
const res4 = resolveNpcEvents(char4, { knownCharacters: [ally], npcMovements: [] }, 5, "南部林缘草甸");
if (res4.character.hunger !== 47) {
  throw new Error(`盟友应让 hunger -3：50→47，实际 ${res4.character.hunger}`);
}
if (res4.events.some((e) => e.kind === "ambush")) throw new Error("盟友不应伏击");
if (!res4.events.some((e) => e.kind === "allyHelp")) throw new Error("应有盟友益处事件");

// 5. 已结盟的 NPC 不会再次触发结盟事件
const res5 = resolveNpcEvents(char4, { knownCharacters: [Object.assign({}, ally)], npcMovements: [] }, 6, "南部林缘草甸");
if (res5.events.some((e) => e.kind === "ally")) throw new Error("已结盟不应重复触发结盟事件");

console.log("npc realism check ok");
