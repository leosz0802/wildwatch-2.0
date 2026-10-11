const assert = require("assert");
const { createReserveState } = require("../js/world");
const {
  archiveItemsForChapter,
  recordSpeciesArchiveItem,
  speciesArchiveView,
  synthesizeSpeciesArchive
} = require("../js/speciesArchiveBox");

const reserve = createReserveState();
reserve.progression.stage = 6;
reserve.progression.displayChapter = 6;
reserve.inventory.researchSample = 4;
reserve.inventory.recoveredTrap = 2;
reserve.inventory.naturalHide = 1;
const inventoryBefore = JSON.stringify(reserve.inventory);
archiveItemsForChapter(6).forEach((item) => recordSpeciesArchiveItem(reserve, item.id));
assert.strictEqual(speciesArchiveView(reserve).canSynthesize, true, "线索齐全后才能合成");
assert.strictEqual(synthesizeSpeciesArchive(reserve, 6).ok, true, "第6章档案应能合成");
assert.strictEqual(speciesArchiveView(reserve).readyToSell, 1, "合成后应出现1份可售档案");

// 物种档案出售与旧科研样本出售完全分离：只消耗档案产品，不动库存样本。
const sale = require("../js/speciesArchiveBox").sellSpeciesArchive(reserve, 6);
assert.strictEqual(sale.ok, true, "档案产品应能出售");
assert.strictEqual(sale.value, 480, "第6章档案售价应为480基金");
assert.strictEqual(JSON.stringify(reserve.inventory), inventoryBefore, "出售档案不得消耗旧物资库存");
assert.strictEqual(speciesArchiveView(reserve).readyToSell, 0, "同一档案出售后不得再次重复结算");
assert.strictEqual(require("../js/speciesArchiveBox").sellSpeciesArchive(reserve, 6).ok, false, "重复出售必须被拦截");

// 原剧情收藏仍是唯一物证目录，不能被档案盒出售逻辑吞并。
const { collectionSummary, normalizeCollectionState } = require("../js/collectionSystem");
const state = { world: { reserve, collection: {} } };
normalizeCollectionState(state);
assert.strictEqual(collectionSummary(state).total, 45, "原剧情收藏目录必须保留");
assert.strictEqual(Object.keys(state.world.collection.items).length, 0, "新存档不得凭空生成剧情收藏");
console.log("species archive economy check passed (legacy story collection isolated, archive synthesize/sell idempotent)");
