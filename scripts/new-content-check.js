// 验证 Step 4 新内容：北部高地湖泊区域、水貂/貉、npc_mink、角色创建、模拟动向
const { regions, knownCharacters, createInitialWorld, syncKnownCharactersForReserve } = require("../js/world");
const { animals } = require("../js/animals");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const { reconcileSpeciesPopulations } = require("../js/animalWorld");

// 1. 新区域
const lake = regions.find((r) => r.id === "lake");
if (!lake) throw new Error("regions 应包含 lake");
if (lake.name !== "北部高地湖泊") throw new Error("lake 名称错误");
if (lake.mood !== "water") throw new Error("lake mood 应为 water");
if (lake.territory.ownerId !== "npc_mink") throw new Error("lake 领主应为 npc_mink");
// 坐标须落在 zoom0 可视范围，否则破坏 map-layout-check
if (lake.x < 0.28 || lake.x > 0.72) throw new Error(`lake.x 应在 0.28~0.72，实际 ${lake.x}`);
if (lake.y < 0.18 || lake.y > 0.78) throw new Error(`lake.y 越界：${lake.y}`);

// 2. 新动物
const mink = animals.find((a) => a.id === "mink");
if (!mink || mink.species !== "水貂") throw new Error("缺少水貂");
if (mink.startLocation !== "北部高地湖泊") throw new Error("水貂起始位置应为北部高地湖泊");
if (mink.tier !== "middle") throw new Error("水貂 tier 应为 middle");
const raccoon = animals.find((a) => a.id === "raccoondog");
if (!raccoon || raccoon.species !== "貉") throw new Error("缺少貉");
if (raccoon.tier !== "prey") throw new Error("貉 tier 应为 prey");
if (animals.length < 10) throw new Error(`应有至少 10 种动物，实际 ${animals.length}`);

// 3. 新 NPC
const minkNpc = knownCharacters.find((c) => c.id === "npc_mink");
if (!minkNpc || minkNpc.species !== "水貂") throw new Error("缺少 npc_mink");
if (minkNpc.location !== "北部高地湖泊") throw new Error("npc_mink 位置应为北部高地湖泊");
if (minkNpc.intent.targetRegionId !== "lake") throw new Error("npc_mink 意图应指向 lake");
if (knownCharacters.length < 5) throw new Error(`应有至少 5 个 NPC，实际 ${knownCharacters.length}`);

// 4. createCharacter 已迁移为保护区卫士，但新物种仍应参与生态系统
const minkState = createCharacter(mink, "测试貂");
if (!minkState.character || minkState.character.role !== "warden") throw new Error("创建角色应返回保护区卫士");
if (minkState.character.species !== "卫士") throw new Error("玩家物种应为卫士");
if (minkState.character.location !== "中央混交林") throw new Error("卫士起始位置错误");
if (minkState.character.animalName !== "测试貂") throw new Error("卫士命名失败");
if (minkState.world.knownCharacters.find((c) => c.species === "水貂")) throw new Error("Lv1 沙盘不应提前出现 Lv5 水貂");
const raccoonState = createCharacter(raccoon, "测试貉");
if (!raccoonState.character || raccoonState.character.role !== "warden") throw new Error("貉模板创建后也应进入卫士模式");

// 5. simulateDay 用卫士玩家，npc_mink 应出动向且留在湖泊
const state = createCharacter(mink, "流影");
state.world.reserve.progression.level = 5;
reconcileSpeciesPopulations(state.world.reserve, { removeLocked: true, initializeUnlocked: true });
state.world.knownCharacters = syncKnownCharactersForReserve(state.world.knownCharacters, state.world.reserve);
const result = simulateDay("去北部高地湖泊浅滩伏击", state);
const minkMove = result.world.npcMovements.find((m) => m.actorId === "npc_mink");
if (!minkMove) throw new Error("npc_mink 应出现在 npcMovements");
if (!["guard", "hunt", "scout"].includes(minkMove.type)) {
  throw new Error(`npc_mink 动向类型应为 guard/hunt/scout，实际 ${minkMove.type}`);
}
if (minkMove.location !== "北部高地湖泊") {
  throw new Error(`npc_mink 应留在湖泊，实际 ${minkMove.location}`);
}
// 玩家水貂进入湖泊（同类领地）不应被判为冲突
const priv = result.reports.find((r) => r.type === "private");
if (!priv) throw new Error("应生成个人报告");

// 6. 初始世界含新区域与种子事件
const world = createInitialWorld();
if (!world.regions.find((r) => r.id === "lake")) throw new Error("初始世界应含 lake");
if (!world.mapEvents.find((e) => e.regionId === "lake")) throw new Error("初始世界应含 lake 种子事件");

console.log("new content check ok");
