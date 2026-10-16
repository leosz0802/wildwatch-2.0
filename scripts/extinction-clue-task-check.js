const assert = require("assert");
const { createReserveState } = require("../js/world");
const { createCharacter } = require("../js/storage");
const { simulateDay } = require("../js/simulator");
const {
  CLUE_ITEMS,
  ensureExtinctionClueTask,
  clueItemsForChapter,
  extinctionClueVisibleDrops,
  collectExtinctionClue,
  normalizeExtinctionClueTask,
  tickExtinctionClueDrops,
  presentExtinctionClue,
  spendHoundArchiveSearch,
  houndArchiveSearchStatus,
  grantHoundArchiveAd,
  HOUND_DROP_MULTIPLIER,
  houndArchiveSearchCost,
  kennelUpgradeQuote,
  upgradeHoundKennel,
  kennelDropProfile
} = require("../js/extinctionClueTask");
const { speciesArchiveView, synthesizeSpeciesArchive, recordSpeciesArchiveItem } = require("../js/speciesArchiveBox");

function snapshotEconomy(reserve) {
  return JSON.stringify({
    fund: reserve.fund,
    visitors: reserve.visitors,
    supplies: reserve.supplies,
    inventory: reserve.inventory,
    ecology: reserve.ecology
  });
}

const reserve = createReserveState();
assert.strictEqual(extinctionClueVisibleDrops(reserve).length, 0, "第1章不应生成灭绝线索");
reserve.progression.stage = 3;
reserve.progression.displayChapter = 3;
const before = snapshotEconomy(reserve);
const task = ensureExtinctionClueTask(reserve);
assert.strictEqual(task.status, "active");
assert.strictEqual(task.drops.length, 0, "线索改为定时出现，不会一上来铺满沙盘");
assert.strictEqual(extinctionClueVisibleDrops(reserve).length, 0);

CLUE_ITEMS.forEach((item, index) => {
  presentExtinctionClue(reserve, item.id);
  const result = collectExtinctionClue(reserve, item.id);
  assert.strictEqual(result.ok, true, `第${index + 1}条线索应可收集`);
  assert.strictEqual(result.progress, `${index + 1}/${CLUE_ITEMS.length}`);
  assert.strictEqual(collectExtinctionClue(reserve, item.id).ok, false, "重复点击不应重复结算");
});

const archive = speciesArchiveView(reserve);
assert.strictEqual(archive.canSynthesize, true, "三条线索应开放档案合成");
const synthesis = synthesizeSpeciesArchive(reserve);
assert.strictEqual(synthesis.ok, true, "档案应可合成");
assert.strictEqual(speciesArchiveView(reserve).synthesized, 1);
assert.strictEqual(speciesArchiveView(reserve).canSynthesize, false, "同一组线索只能合成一次");

const stacked = createReserveState();
stacked.progression.stage = 3;
stacked.progression.displayChapter = 3;
ensureExtinctionClueTask(stacked);
presentExtinctionClue(stacked, CLUE_ITEMS[0].id);
assert.strictEqual(collectExtinctionClue(stacked, CLUE_ITEMS[0].id).progress, "1/3");
recordSpeciesArchiveItem(stacked, CLUE_ITEMS[0].id);
const stackedNow = Date.now();
stacked.extinctionClueTask.drops = [];
stacked.extinctionClueTask.nextDropAt = stackedNow;
stacked.extinctionClueTask.dropCursor = 2;
tickExtinctionClueDrops(stacked, stackedNow, () => 0);
const nextDrop = stacked.extinctionClueTask.drops[0];
assert.ok(nextDrop && nextDrop.id !== CLUE_ITEMS[0].id, "已收录种类不再回到沙盘");
assert.strictEqual(collectExtinctionClue(stacked, nextDrop.id).progress, "2/3", "沙盘改投还缺的种类");
recordSpeciesArchiveItem(stacked, CLUE_ITEMS[0].id);
assert.strictEqual(collectExtinctionClue(stacked, nextDrop.id).ok, false, "同一只掉落不能连点两次");
assert.strictEqual(speciesArchiveView(stacked).allItems.find((item) => item.id === CLUE_ITEMS[0].id).count, 2, "同一种线索数量应累加");

const chapter6 = createReserveState();
chapter6.progression.stage = 6;
chapter6.progression.displayChapter = 6;
ensureExtinctionClueTask(chapter6);
const chapter6Items = clueItemsForChapter(6);
const chapter6Now = Date.now();
chapter6.extinctionClueTask.collectedIds = [chapter6Items[0].id, chapter6Items[1].id];
chapter6.extinctionClueTask.drops = [{
  id: chapter6Items[0].id,
  x: 0.24,
  y: 0.74,
  spawnedAt: chapter6Now,
  expiresAt: chapter6Now + 20000
}];
chapter6.extinctionClueTask.nextDropAt = chapter6Now + 60000;
tickExtinctionClueDrops(chapter6, chapter6Now, () => 0.99);
assert.strictEqual(chapter6.extinctionClueTask.drops.length, 1, "第6章仍只保留一件档案物资");
assert.strictEqual(chapter6.extinctionClueTask.drops[0].id, chapter6Items[2].id, "第6章已捡到的种类让出位置给还缺的物资");

assert.strictEqual(reserve.extinctionClueTask.status, "completed");
assert.strictEqual(extinctionClueVisibleDrops(reserve).length, 0);
assert.strictEqual(snapshotEconomy(reserve), before, "灭绝线索不应修改基金、游客、动物或物资");

const restored = normalizeExtinctionClueTask(JSON.parse(JSON.stringify(reserve.extinctionClueTask)));
assert.strictEqual(restored.status, "completed", "存档恢复后任务应保持完成");
assert.strictEqual(restored.collectedIds.length, CLUE_ITEMS.length);

const timed = createReserveState();
timed.progression.stage = 5;
timed.progression.displayChapter = 5;
ensureExtinctionClueTask(timed);
timed.extinctionClueTask.nextDropAt = 1000;
const seen = [];
let now = 1000;
for (let i = 0; i < 3; i += 1) {
  tickExtinctionClueDrops(timed, now, () => 0);
  const drop = timed.extinctionClueTask.drops[0];
  assert.ok(drop, "到点且判定成功时应出现一条档案线索");
  const life = drop.expiresAt - drop.spawnedAt;
  assert.ok(life >= 13000 && life <= 15000, "档案线索停留 13—15 秒");
  seen.push(drop.reuseFrom);
  now = Math.max(drop.expiresAt + 1, timed.extinctionClueTask.nextDropAt);
}
assert.deepStrictEqual(seen, ["researchSample", "naturalHide", "recoveredTrap"], "本章三种档案线索要轮流出现");
tickExtinctionClueDrops(timed, seen.length && now, () => 0);
const expired = timed.extinctionClueTask.drops.filter((drop) => drop.expiresAt <= now - 1);
assert.strictEqual(expired.length, 0, "超时未拾取的线索要从沙盘消失");

const boosted = createReserveState();
boosted.progression.stage = 5;
boosted.progression.displayChapter = 5;
ensureExtinctionClueTask(boosted);
const spent = spendHoundArchiveSearch(boosted, 5000);
assert.strictEqual(spent.ok, true);
assert.strictEqual(spent.multiplier, HOUND_DROP_MULTIPLIER);
assert.ok(HOUND_DROP_MULTIPLIER >= 2, "猎犬搜寻要把本章掉落概率提高到 2 倍以上");
assert.strictEqual(houndArchiveSearchStatus(boosted).uses, 2);
boosted.extinctionClueTask.drops = [];
boosted.extinctionClueTask.nextDropAt = 5000;
tickExtinctionClueDrops(boosted, 5000, () => 0.5);
assert.strictEqual(boosted.extinctionClueTask.drops.length, 1, "概率提高后，原先会落空的判定也能掉落");
assert.strictEqual(grantHoundArchiveAd(boosted).ok, false, "还有次数时不能看广告加次");
boosted.extinctionClueTask.kennel.freeRemaining = 0;
boosted.extinctionClueTask.kennel.bonusRemaining = 0;
assert.strictEqual(grantHoundArchiveAd(boosted).ok, true);
assert.strictEqual(houndArchiveSearchStatus(boosted).uses, 3);
const kennel = createReserveState();
kennel.progression.stage = 3;
kennel.progression.displayChapter = 3;
kennel.fund = 30000;
assert.strictEqual(houndArchiveSearchStatus(kennel).level, 1);
assert.deepStrictEqual(houndArchiveSearchCost(kennel), { level: 1, dogFood: 2, fund: 339 });
assert.strictEqual(kennelUpgradeQuote(1, 3).cost, 2035, "第3章升到2级按章节通胀计费");
assert.strictEqual(upgradeHoundKennel(Object.assign(createReserveState(), { fund: 10, progression: { stage: 3, displayChapter: 3 } })).reason, "fund");
assert.strictEqual(upgradeHoundKennel(kennel).ok, true);
assert.strictEqual(kennel.extinctionClueTask.kennel.level, 2);
assert.strictEqual(kennel.fund, 30000 - 2035);
assert.deepStrictEqual(
  { food: houndArchiveSearchCost(kennel).dogFood, fund: houndArchiveSearchCost(kennel).fund, multiplier: spendHoundArchiveSearch(kennel).multiplier },
  { food: 3, fund: 543, multiplier: 3 }
);
assert.strictEqual(upgradeHoundKennel(kennel).reason, "locked", "第3章不能升到3级");
kennel.progression.stage = 6;
kennel.progression.displayChapter = 6;
const reached = upgradeHoundKennel(kennel);
assert.strictEqual(reached.ok, true);
assert.strictEqual(reached.cost, 9072, "第6章升到3级按章节通胀计费");
assert.strictEqual(houndArchiveSearchCost(kennel).dogFood, 4);
assert.strictEqual(houndArchiveSearchCost(kennel).fund, 968);
assert.strictEqual(kennelDropProfile(3).precision, 0.85);
kennel.progression.stage = 7;
kennel.progression.displayChapter = 7;
assert.strictEqual(ensureExtinctionClueTask(kennel).kennel.level, 3, "换章后犬屋等级保留");
assert.strictEqual(ensureExtinctionClueTask(kennel).kennel.freeRemaining, 3, "换章后搜寻次数重新计算");

const precise = createReserveState();
precise.progression.stage = 3;
precise.progression.displayChapter = 3;
ensureExtinctionClueTask(precise);
precise.extinctionClueTask.kennel.level = 2;
precise.extinctionClueTask.collectedIds = [CLUE_ITEMS[0].id];
precise.extinctionClueTask.drops = [];
precise.extinctionClueTask.dropCursor = 2;
precise.extinctionClueTask.nextDropAt = Date.now();
const precisionRolls = [0, 0];
tickExtinctionClueDrops(precise, Date.now(), () => precisionRolls.shift());
assert.strictEqual(precise.extinctionClueTask.drops[0].id, CLUE_ITEMS[1].id, "2级搜寻应优先落到还缺的种类");

for (let chapter = 2; chapter <= 11; chapter += 1) {
  const live = createReserveState();
  live.progression.stage = chapter;
  live.progression.displayChapter = chapter;
  ensureExtinctionClueTask(live);
  const chapterItems = clueItemsForChapter(chapter);
  const kept = chapterItems.slice(0, Math.min(2, chapterItems.length - 1));
  kept.forEach((item) => {
    presentExtinctionClue(live, item.id);
    const picked = collectExtinctionClue(live, item.id);
    assert.strictEqual(picked.ok, true, `第${chapter}章应能拾取${item.name}`);
    recordSpeciesArchiveItem(live, item.id);
    const stored = speciesArchiveView(live).allItems.find((entry) => entry.id === item.id);
    assert.ok(stored && stored.count >= 1, `第${chapter}章拾取后${item.name}要进入档案盒`);
  });
  live.extinctionClueTask.chapter = chapter === 2 ? 3 : chapter - 1;
  const returned = ensureExtinctionClueTask(live);
  assert.ok(kept.every((item) => returned.collectedIds.includes(item.id)), `第${chapter}章回来后档案盒里的种类要留在进度里`);
  let stamp = Date.now();
  const thrown = new Set();
  for (let turn = 0; turn < 12; turn += 1) {
    returned.nextDropAt = stamp;
    tickExtinctionClueDrops(live, stamp, () => 0);
    const drop = live.extinctionClueTask.drops[0];
    if (drop && kept.some((item) => item.id === drop.id)) thrown.add(drop.id);
    stamp = drop ? Math.max(stamp + 1000, drop.expiresAt + 1) : stamp + 8000;
  }
  assert.strictEqual(thrown.size, 0, `第${chapter}章不能把已经进档案的种类再投到沙盘上`);
  if (live.extinctionClueTask.status !== "completed") {
    const missing = chapterItems.find((item) => !kept.some((held) => held.id === item.id));
    live.extinctionClueTask.drops = [];
    live.extinctionClueTask.nextDropAt = stamp;
    tickExtinctionClueDrops(live, stamp, () => 0);
    const fresh = live.extinctionClueTask.drops[0];
    assert.ok(fresh && fresh.id === missing.id || (fresh && !kept.some((item) => item.id === fresh.id)), `第${chapter}章仍应投出还没进档案的种类`);
  }
}
const settled = createCharacter(null, "档案结算");
settled.world.reserve.progression.stage = 3;
settled.world.reserve.progression.displayChapter = 3;
const settledItems = clueItemsForChapter(3);
settledItems.forEach((item) => {
  presentExtinctionClue(settled.world.reserve, item.id);
  const picked = collectExtinctionClue(settled.world.reserve, item.id);
  assert.strictEqual(picked.ok, true, `结算前应能拾取${item.name}`);
  recordSpeciesArchiveItem(settled.world.reserve, item.id);
});
const beforeArchive = speciesArchiveView(settled.world.reserve);
const settledReserve = simulateDay("修复水源和草场：去东部河岸湿地修复水源", settled).world.reserve;
const afterArchive = speciesArchiveView(settledReserve);
settledItems.forEach((item) => {
  const beforeCount = (beforeArchive.allItems.find((entry) => entry.id === item.id) || {}).count || 0;
  const afterCount = (afterArchive.allItems.find((entry) => entry.id === item.id) || {}).count || 0;
  assert.ok(beforeCount >= 1 && afterCount >= beforeCount, `结算后档案盒仍保留${item.name}`);
  assert.ok((settledReserve.extinctionClueTask.collectedIds || []).includes(item.id), `结算后仍记得已拾取的${item.name}`);
});
const chapterFive = createReserveState();
chapterFive.progression.stage = 5;
chapterFive.progression.displayChapter = 5;
ensureExtinctionClueTask(chapterFive);
chapterFive.ecologyEconomy = {
  mapDrops: [[0.18, 0.28], [0.48, 0.72], [0.80, 0.38]].map((point, index) => ({ id: `block-${index}`, x: point[0], y: point[1] }))
};
chapterFive.extinctionClueTask.drops = [];
chapterFive.extinctionClueTask.nextDropAt = 1000;
tickExtinctionClueDrops(chapterFive, 1000, () => 0);
assert.ok(chapterFive.extinctionClueTask.drops[0], "固定落点被占住时，未搜寻也会改到其他位置掉落");

const searched = createReserveState();
searched.progression.stage = 5;
searched.progression.displayChapter = 5;
ensureExtinctionClueTask(searched);
const chapterFiveItems = clueItemsForChapter(5);
const firstSearch = spendHoundArchiveSearch(searched, Date.now());
assert.strictEqual(firstSearch.ok, true);
assert.ok(firstSearch.dropped && chapterFiveItems.some((item) => item.id === firstSearch.dropped.id), "第5章搜寻要立刻掉一条本章档案线索");
const besideKennel = searched.extinctionClueTask.drops[0];
assert.ok(Math.hypot(besideKennel.x - 0.34, besideKennel.y - 0.64) < 0.45, "搜寻掉落要落在犬屋旁边");
chapterFiveItems.slice(0, 2).forEach((item) => {
  searched.extinctionClueTask.collectedIds.push(item.id);
  searched.speciesArchiveBox = searched.speciesArchiveBox || { collected: {} };
  searched.speciesArchiveBox.collected[item.id] = 1;
});
const secondSearch = spendHoundArchiveSearch(searched, Date.now());
assert.strictEqual(secondSearch.dropped.id, chapterFiveItems[2].id, "再次搜寻要落到还缺的那一种");
const idle = createReserveState();
idle.progression.stage = 5;
idle.progression.displayChapter = 5;
ensureExtinctionClueTask(idle);
idle.extinctionClueTask.dropMultiplier = 1;
idle.extinctionClueTask.drops = [];
idle.extinctionClueTask.nextDropAt = 2000;
tickExtinctionClueDrops(idle, 2000, () => 0);
assert.strictEqual(idle.extinctionClueTask.drops.length, 1, "不使用犬屋搜寻时，到点仍会随机掉落档案线索");

console.log("extinction clue task check passed");
