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
assert.strictEqual(sale.value, 3840, "第6章档案售价应为3840基金");
assert.strictEqual(JSON.stringify(reserve.inventory), inventoryBefore, "出售档案不得消耗旧物资库存");
assert.strictEqual(speciesArchiveView(reserve).readyToSell, 0, "同一档案出售后不得再次重复结算");
assert.strictEqual(require("../js/speciesArchiveBox").sellSpeciesArchive(reserve, 6).ok, false, "重复出售必须被拦截");

// 原剧情收藏仍是唯一物证目录，不能被档案盒出售逻辑吞并。
const { collectionSummary, normalizeCollectionState } = require("../js/collectionSystem");
const state = { world: { reserve, collection: {} } };
normalizeCollectionState(state);
assert.strictEqual(collectionSummary(state).total, 45, "原剧情收藏目录必须保留");
assert.strictEqual(Object.keys(state.world.collection.items).length, 0, "新存档不得凭空生成剧情收藏");

const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const game = new Game();
game.stopLoop();
game.render = () => {};
const character = createCharacter(null, "档案出售");
const live = character.world.reserve;
live.progression.stage = 6;
live.progression.displayChapter = 6;
live.fund = 100;
archiveItemsForChapter(6).forEach((item) => recordSpeciesArchiveItem(live, item.id));
assert.strictEqual(synthesizeSpeciesArchive(live, 6).ok, true, "界面出售前应先合成");
game.state = character;
const sold = game.sellSpeciesArchiveFromBox();
assert.strictEqual(sold && sold.ok, true, "档案盒出售按钮应能成交");
assert.strictEqual(sold.value, 3840, "界面出售金额应是第6章档案售价");
assert.strictEqual(live.fund, 3940, "出售第6章档案应把3840基金记入保护基金");
assert.strictEqual(game.sellSpeciesArchiveFromBox(), false, "界面上也不能把同一份档案再卖一次");
assert.strictEqual(live.fund, 3940, "重复点击出售不得再次加基金");

const past = createReserveState();
past.progression.stage = 6;
past.progression.displayChapter = 6;
archiveItemsForChapter(3).forEach((item) => recordSpeciesArchiveItem(past, item.id));
assert.strictEqual(require("../js/speciesArchiveBox").recipeArchiveState(past, require("../js/speciesArchiveBox").RECIPES.find((recipe) => recipe.chapter === 3)).canSynthesize, true, "早前章节材料齐了也可以合成");
assert.strictEqual(synthesizeSpeciesArchive(past, 3).ok, true);
assert.strictEqual(require("../js/speciesArchiveBox").sellSpeciesArchive(past, 6).ok, false, "没有第6章成品时不能误售本章");
const pastSale = require("../js/speciesArchiveBox").sellSpeciesArchive(past, 3);
assert.strictEqual(pastSale.ok, true, "已经合成的旧章节档案仍可出售");
assert.strictEqual(pastSale.value, 2880);
console.log("species archive economy check passed (legacy story collection isolated, archive synthesize/sell idempotent)");
