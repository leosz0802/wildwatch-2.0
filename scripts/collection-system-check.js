const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { createInitialWorld } = require("../js/world");
const {
  CASES, ITEMS, METHODS, ENDINGS, collectionItemById, itemsForCase,
  normalizeCollectionState, updateCollectionAfterAction, offerAnimalCollectionLead,
  beginStoryDiscovery, advanceStoryDiscovery, collectStoryDiscovery, storyDiscoverySummary,
  startInvestigation, resolveInvestigation, submitCaseEnding, collectionSummary
} = require("../js/collectionSystem");

function fresh(level = 1) {
  const world = createInitialWorld();
  world.reserve.progression.level = level;
  world.reserve.enforcement = 90;
  world.reserve.reputation = 90;
  world.reserve.strategy.totalChoices = 30;
  world.reserve.houndTeam.totalRuns = 30;
  world.knownCharacters = (world.knownCharacters || []).map((animal) => Object.assign({}, animal, {
    relation: Object.assign({}, animal.relation || {}, { trust: 90 })
  }));
  world.lifeMemory = Object.assign({}, world.lifeMemory || {}, {
    guardianLetters: [{ day: 3 }],
    memories: Array.from({ length: 16 }, (_, index) => ({ type: index === 0 ? "return" : "met", day: index + 1 }))
  });
  const state = { world, character: { role: "warden" }, ui: {} };
  normalizeCollectionState(state);
  return state;
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function setDay(state, day) {
  state.world.day = day;
  state.world.reserve.guardianCycle = Object.assign({}, state.world.reserve.guardianCycle || {}, { day });
}

assert.strictEqual(ITEMS.length, 45, "剧情发现目录必须严格为45件");
assert.strictEqual(CASES.length, 6, "必须为五章案件+隐藏档案");
assert.strictEqual(new Set(ITEMS.map((item) => item.id)).size, 45, "藏品ID必须唯一");
assert.deepStrictEqual(CASES.map((entry) => itemsForCase(entry.id).length), [8, 8, 8, 8, 8, 5], "案件物件数量错误");
ITEMS.forEach((item) => {
  assert(item.discoveryRole, `${item.id}缺少剧情角色`);
  assert(item.discoveryAction, `${item.id}缺少发现行动`);
  assert(item.discoveryRegion, `${item.id}缺少沙盘区域`);
  const condition = item.condition || {};
  if (condition.trust) assert(condition.trust <= 55, `${item.id} 关系门槛过高，会卡在本章最后一件`);
  if (condition.enforcement) assert(condition.enforcement <= 50, `${item.id} 执法门槛过高`);
  if (condition.reputation) assert(condition.reputation <= 50, `${item.id} 声望门槛过高`);
  if (condition.choices) assert(condition.choices <= 8, `${item.id} 策略次数门槛过高`);
  if (condition.houndRuns) assert(condition.houndRuns <= 8, `${item.id} 猎犬次数门槛过高`);
  if (condition.namedMemories) assert(condition.namedMemories <= 8, `${item.id} 记忆门槛过高`);
});
const legacyMaterialIds = ["shedAntlerA", "shedAntlerB", "naturalHide", "recoveredTrap", "researchSample", "whiteRhinoHornEvidence", "ivoryEvidence"];
legacyMaterialIds.forEach((id) => assert(!collectionItemById(id), `剧情发现禁止沿用库存ID: ${id}`));
assert.strictEqual(METHODS.length, 3, "隐藏档案仍须保留三种高风险调查方式");
Object.keys(ENDINGS).forEach((id) => assert.strictEqual(ENDINGS[id].length, 3, `${id}必须有三种结局`));

const initial = fresh();
assert.strictEqual(initial.world.collection.version, 3, "新档案必须使用剧情发现V3结构");
assert.strictEqual(Object.keys(initial.world.collection.items).length, 0, "初始档案不得自动解锁藏品");
assert.strictEqual(initial.world.collection.discovery.active, null, "初始不应凭空生成发现");

const legacyState = { world: createInitialWorld(), ui: {} };
legacyState.world.collection = { version: 1, entries: { shedAntlerA: { count: 3 }, white_deer: { count: 1 } }, history: [{ id: "shedAntlerA", name: "A级完整岩角", day: 8 }] };
normalizeCollectionState(legacyState);
assert.strictEqual(legacyState.world.collection.version, 3, "旧存档必须迁移到V3");
assert.strictEqual(legacyState.world.collection.legacyArchive.count, 2, "旧记录必须完整迁入纪念档案");
assert.strictEqual(Object.keys(legacyState.world.collection.items).length, 0, "旧记录不能折算新完成度");
normalizeCollectionState(legacyState);
assert.strictEqual(legacyState.world.collection.legacyArchive.count, 2, "重复归一化不得重复迁移");

// 主流程：动物发现异常 -> 对应守护行动 -> 沙盘实物 -> 点击收录。
const storyState = fresh(5);
const deer = storyState.world.knownCharacters.find((entry) => entry.species === "鹿") || storyState.world.knownCharacters[0];
setDay(storyState, 2);
const animalOffer = offerAnimalCollectionLead(storyState, deer, { caseId: "case_1", guaranteed: true, season: storyState.world.season }, () => 0);
assert(animalOffer.discovery && animalOffer.discovery.status === "hinted", "动物必须能给出剧情迹象");
assert.strictEqual(animalOffer.discovery.itemId, "c1_footprint", "案件第一件必须按剧情顺序出现");
assert.strictEqual(storyState.world.collection.leads.length, 0, "主线发现不得重新进入旧随机线索池");
assert(!advanceStoryDiscovery(storyState, { actionId: "antiPoacher" }).advanced, "无关行动不得推进剧情发现");
const located = advanceStoryDiscovery(storyState, { actionId: animalOffer.discovery.actionId, actionLabel: animalOffer.discovery.actionLabel });
assert(located.advanced && located.discovery.status === "located", "匹配行动必须把物件定位到沙盘");
assert.strictEqual(Object.keys(storyState.world.collection.items).length, 0, "定位后必须等待玩家点击，不能自动入档");
const archived = collectStoryDiscovery(storyState, located.item.id);
assert(archived.ok && archived.entry.discovery, "点击沙盘物件必须生成完整发现档案");
assert.strictEqual(archived.entry.discovery.who, deer.shortName || deer.name || deer.species, "档案必须记录带路动物");
assert.strictEqual(storyDiscoverySummary(storyState).active, null, "收录后应清空当前发现");

// 线索池最多同时保留5条，且新手期过后同类提示应当节流。
const clueState = fresh(5);
const clueAnimal = clueState.world.knownCharacters.find((entry) => entry.species === "鹿") || clueState.world.knownCharacters[0];
clueState.world.collection.leads = Array.from({ length: 5 }, (_, index) => ({ id: `lead_${index}`, caseId: "case_1" }));
const fullPool = offerAnimalCollectionLead(clueState, clueAnimal, { caseId: "case_1", guaranteed: true }, () => 0);
assert(!fullPool.lead && /线索已经有点多了/.test(fullPool.reason), "线索池满时不得继续生成");
const originalNow = Date.now;
Date.now = () => 1700000000000;
const cooldownState = fresh(5);
const cooldownAnimal = cooldownState.world.knownCharacters.find((entry) => entry.species === "鹿") || cooldownState.world.knownCharacters[0];
cooldownState.ui.firstSessionFocus = { version: 1, startedAt: Date.now() - (10 * 60 * 1000) };
cooldownState.world.collection.investigation.lastLeadAt = Date.now();
const blockedLead = offerAnimalCollectionLead(cooldownState, cooldownAnimal, { caseId: "case_1", guaranteed: true }, () => 0);
Date.now = originalNow;
assert(!blockedLead.lead && /缓一缓/.test(blockedLead.reason), "新手期后线索应按30秒节流");

// 自动动物发现优先服务当前等级案件，不能因为鹿也属于第1章，就在
// 第5章继续把旧物件当作主线投放。
const currentChapterState = fresh(5);
setDay(currentChapterState, 30);
currentChapterState.world.reserve.eventChain = Object.assign({}, currentChapterState.world.reserve.eventChain, { chapterLevel: 5, step: 1 });
const currentChapterOffer = offerAnimalCollectionLead(currentChapterState, deer, { guaranteed: true }, () => 0);
assert(currentChapterOffer.discovery && currentChapterOffer.discovery.caseId === "case_5", "自动剧情发现必须优先当前章节案件");

{
  const lateChapter = fresh(5);
  setDay(lateChapter, 40);
  lateChapter.world.reserve.progression.stage = 9;
  lateChapter.world.reserve.progression.displayChapter = 9;
  lateChapter.world.reserve.eventChain = Object.assign({}, lateChapter.world.reserve.eventChain, { chapterLevel: 9, step: 2 });
  const lateOffer = offerAnimalCollectionLead(lateChapter, deer, { guaranteed: true }, () => 0);
  assert(lateOffer.discovery && lateOffer.discovery.caseId === "case_5", "进入第9章后仍应能投放第5章未完成藏品");
}

// 动物发现的“每天一次”必须跟随现实自然日，而不是停留在同一个
// 守护日时永久锁住；高章节和旧数字存档也不能阻止后续碎片出现。
{
  const savedNow = Date.now;
  const firstDate = new Date(2026, 8, 17, 12).getTime();
  const secondDate = new Date(2026, 8, 18, 12).getTime();
  try {
    Date.now = () => firstDate;
    const calendarState = fresh(7);
    setDay(calendarState, 100);
    calendarState.world.reserve.eventChain = Object.assign({}, calendarState.world.reserve.eventChain, { chapterLevel: 7, step: 1 });
    const guide = calendarState.world.knownCharacters[0];
    const first = offerAnimalCollectionLead(calendarState, guide, {}, () => 0);
    assert(first.discovery && first.discovery.caseId === "case_5", "高章节仍应继续投放未完成收藏");
    assert(advanceStoryDiscovery(calendarState, { actionId: first.discovery.actionId }).advanced, "自然日测试线索必须能定位");
    assert(collectStoryDiscovery(calendarState, first.discovery.itemId).ok, "自然日测试线索必须能收录");
    const sameDate = offerAnimalCollectionLead(calendarState, calendarState.world.knownCharacters[1], {}, () => 0);
    assert(!sameDate.lead, "同一自然日不得开启第二件剧情发现");

    Date.now = () => secondDate;
    const nextDate = offerAnimalCollectionLead(calendarState, guide, {}, () => 0);
    assert(nextDate.lead, "跨自然日后无需推进游戏日也应恢复碎片发现");

    const legacy = fresh(7);
    setDay(legacy, 100);
    legacy.world.reserve.eventChain = Object.assign({}, legacy.world.reserve.eventChain, { chapterLevel: 7, step: 1 });
    legacy.world.collection.discovery.lastStartedDay = 100;
    legacy.world.collection.investigation.animalLeadSeen[`100:${guide.id}:listen`] = 100;
    const migrated = offerAnimalCollectionLead(legacy, guide, {}, () => 0);
    assert(migrated.lead, "旧版数字游戏日记录必须自动过期");
  } finally {
    Date.now = savedNow;
  }
}

// 三件主证据开始修复设施；七件后才允许案件结局。
for (let index = 1; index < 7; index += 1) {
  setDay(storyState, index + 3);
  const started = beginStoryDiscovery(storyState, deer, { caseId: "case_1", guaranteed: true }, () => 0);
  assert(started.created, `case_1第${index + 1}段发现未生成: ${started.reason}`);
  const progressed = advanceStoryDiscovery(storyState, { actionId: started.discovery.actionId, actionLabel: started.discovery.actionLabel });
  assert(progressed.advanced, `case_1第${index + 1}段未被匹配行动推进`);
  assert(collectStoryDiscovery(storyState, started.discovery.itemId).ok, `case_1第${index + 1}段无法收录`);
}
assert.strictEqual(storyState.world.collection.cases.case_1.itemIds.length, 7, "案件结局前必须恰有7件发现物");
assert.strictEqual(storyState.world.reserve.storyDiscoveries.case_1.evidence, 3, "前3件必须作为主证据推进章节");
const ending = submitCaseEnding(storyState, "case_1", ENDINGS.case_1[0].id);
assert(ending.ok, "集齐7件后必须可做永久结局选择");
assert.strictEqual(storyState.world.collection.cases.case_1.itemIds.length, 8, "结局必须生成第8件终章物件");

// 隐藏档案仍使用手动调查与六面骰，和主剧情发现明确分流。
const hiddenState = fresh(5);
hiddenState.world.collection.leads = [{ id: "hidden_risk", caseId: "hidden", day: 100, quality: 2, sourceAction: "animalMemory", sourceLabel: "动物记忆", animal: { id: "npc_deer", name: "晨角", trust: 90, security: 90, wildness: 80 } }];
assert(startInvestigation(hiddenState, "hidden_risk", "risky").ok, "隐藏档案应能进入高风险调查");
const hiddenResult = resolveInvestigation(hiddenState, 6, () => 0);
assert(hiddenResult.success && hiddenResult.item.caseId === "hidden", "隐藏调查必须获得具体记忆物件");

// 经营只负责推进已存在的发现，不得凭空发放新物件。
const before = fresh(5);
const after = clone(before);
after.world.reserve.strategy.totalMeaningfulActions = 2;
after.world.reserve.progression.totalMeaningfulActions = 2;
const update = updateCollectionAfterAction(before, after, { actionId: "houndScout", actionLabel: "猎犬侦察" }, () => 0);
assert.strictEqual(update.chargeGained, 1, "兼容支线每2次有效经营应增加1次调查机会");
assert.strictEqual(update.lead, null, "经营行动不得直接生成剧情发现");
assert.strictEqual(Object.keys(after.world.collection.items).length, 0, "经营行动不能直接发藏品");

Object.keys(ENDINGS).forEach((caseId) => {
  ENDINGS[caseId].forEach((choice) => {
    const state = fresh(5);
    itemsForCase(caseId).slice(0, 7).forEach((item) => {
      state.world.collection.items[item.id] = { id: item.id, firstDay: 1 };
      state.world.collection.cases[caseId].itemIds.push(item.id);
    });
    const result = submitCaseEnding(state, caseId, choice.id);
    assert(result.ok, `${caseId}/${choice.id}结局不可达`);
    assert(state.world.collection.worldFlags[choice.flag], "结局必须写入永久世界标记");
  });
});

const restored = clone(storyState);
normalizeCollectionState(restored);
assert.strictEqual(restored.world.collection.cases.case_1.itemIds.length, 8, "存档恢复后剧情发现不得丢失");
assert.strictEqual(collectionSummary(restored).total, 45, "汇总必须读取45件唯一目录");

const gameSource = fs.readFileSync(path.join(__dirname, "../js/game.js"), "utf8");
const atlasPath = path.join(__dirname, "../assets/art/collection/collection-items-atlas.png");
assert(fs.existsSync(atlasPath), "45件剧情发现物的图集缺失");
const atlasData = fs.readFileSync(atlasPath);
assert.strictEqual(atlasData.readUInt32BE(16), 864, "图集必须提供每格96px的清晰宽度");
assert.strictEqual(atlasData.readUInt32BE(20), 480, "图集必须保持9×5切片");
assert(fs.statSync(atlasPath).size <= 140 * 1024, "高清简笔图集必须控制在140KiB内");
assert(gameSource.includes("剧情发现") && gameSource.includes("主证据推动剧情"), "发现首页必须解释剧情与设施关系");
assert(gameSource.includes('["collection", "发现", "reserve_prosperity"]'), "底部频道必须显示为发现");
assert(gameSource.includes("drawStoryDiscoveryMarker") && gameSource.includes("collectMapStoryDiscovery"), "沙盘必须展示并可点击收录现场物件");
assert(gameSource.includes('const labels = ["迹象", "守护", "现场", "收录"]'), "详情页必须展示新的剧情发现链路");
assert(gameSource.includes("collectionDice"), "隐藏档案仍须保留六面骰体验");
assert(gameSource.includes("openForestRemembersIllustration"), "隐藏档案完成后必须能打开最终纪念插画");

console.log("collection V3 check ok (45 items, story discovery loop, facilities, 15 endings, hidden dice, migration)");
