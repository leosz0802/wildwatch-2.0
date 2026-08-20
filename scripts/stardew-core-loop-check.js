const assert = require("assert");
const { createInitialWorld } = require("../js/world");
const { simulateDay } = require("../js/simulator");
const { normalizeCollectionState, itemsForCase } = require("../js/collectionSystem");
const { facilityStates } = require("../js/reserveFacilities");
const { MAIN_CAST, applyNamedAnimalSchedule } = require("../js/guardianCycle");
const { Game } = require("../js/game");

function state() {
  return {
    world: createInitialWorld(),
    character: { role: "warden", location: "中央混交林", stamina: 82, health: 92 },
    messages: []
  };
}

let current = state();
const before = JSON.parse(JSON.stringify(current.world.reserve));
let result = simulateDay("修复水源草场", current);
assert(result.world.reserve.mastery.habitat.xp > 0, "关键行动应推进长期专长");
assert(result.world.reserve.ecology.water !== before.ecology.water || result.world.reserve.ecology.grass !== before.ecology.grass, "关键行动必须同时改变保护区");
assert(result.visual.guardianCycle.actionRecord.animalResponse, "关键行动必须附带动物回应");

current = Object.assign({}, current, { world: result.world, character: result.character });
current.world.reserve.inventory.researchSample = 3;
result = simulateDay("设施鉴定：批量移交库存中的研究样本", current);
assert.strictEqual(result.world.reserve.fund, current.world.reserve.fund, "设施鉴定当天不能立即发放基金");
assert(result.world.reserve.recoveredProcessing.pending[0].value > 0, "设施鉴定必须形成次日1.25倍拨款");

const collectionState = state();
normalizeCollectionState(collectionState);
const caseItems = itemsForCase("case_1");
collectionState.world.collection.cases.case_1.itemIds = caseItems.slice(0, 3).map((item) => item.id);
caseItems.slice(0, 3).forEach((item) => { collectionState.world.collection.items[item.id] = { itemId: item.id, day: 1 }; });
normalizeCollectionState(collectionState);
let patrolPost = facilityStates(collectionState).find((facility) => facility.caseId === "case_1");
assert.strictEqual(patrolPost.collectionStage, 1, "收藏3/8时设施必须出现清理变化");
assert.strictEqual(patrolPost.buildStage, 0, "收藏进度不得替玩家自动完成设施建设");
collectionState.world.collection.cases.case_1.itemIds = caseItems.slice(0, 6).map((item) => item.id);
caseItems.slice(0, 6).forEach((item) => { collectionState.world.collection.items[item.id] = { itemId: item.id, day: 1 }; });
normalizeCollectionState(collectionState);
patrolPost = facilityStates(collectionState).find((facility) => facility.caseId === "case_1");
assert.strictEqual(patrolPost.collectionStage, 2, "收藏6/8时设施必须进入待修复阶段");
assert.strictEqual(patrolPost.buildStage, 0, "收藏进度不得跳过两次亲手建设");

const scheduled = applyNamedAnimalSchedule(collectionState.world.knownCharacters, collectionState.world.reserve);
const mainCast = scheduled.filter((animal) => animal.mainStory);
assert.strictEqual(MAIN_CAST.length, 10, "必须配置10只跨章节主线动物");
assert.strictEqual(mainCast.filter((animal) => animal.mainStory.active).length, 2, "每章只突出1-2只主线动物");
assert(mainCast.every((animal) => animal.mainStory.relationshipNodes.join(",") === "20,40,65,85"));

const daySixGame = Object.create(Game.prototype);
daySixGame.state = state();
daySixGame.state.world.reserve.guardianCycle.day = 6;
daySixGame.state.world.collection = { leads: [] };
assert(daySixGame.shouldGuaranteeFirstCollectionLead(), "第6日首个动物互动必须保底给出收藏线索，避免七日样板卡住");

console.log("stardew core loop check ok");
