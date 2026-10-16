// 物种档案盒是“自然遗留物”的统一归档入口。线索只在沙盘上拾取。
// 旧的研究样本、隐踪器等物资通过 reuseFrom 标记来源，不从动物追踪转入档案盒。
const ARCHIVE_CHAPTERS = [
  { chapter: 2, speciesId: "white_sturgeon", speciesName: "白鲟", title: "白鲟消失档案", items: [
    ["old_fish_scale", "旧鱼鳞", "白鲟曾在河道活动", "#6e9f9a", "researchSample"],
    ["broken_river_marker", "断掉的河道标记", "洄游路线发生改变", "#c39a4d", "recoveredTrap"],
    ["old_fishing_net", "旧渔网残片", "误捕风险留下的痕迹", "#8b72a7", "naturalHide"]
  ]},
  { chapter: 2, speciesId: "passenger_pigeon", speciesName: "旅鸽", title: "旅鸽林冠档案", items: [
    ["pigeon_feather", "旅鸽羽片", "林冠曾有大规模飞行", "#8c9bb8", "researchSample"],
    ["pigeon_roost_branch", "旧栖枝", "群栖树曾经承受过整片鸟群", "#9b744c", "naturalHide"],
    ["pigeon_cage_wire", "旧捕鸟铁丝", "捕捉压力切断了迁飞队伍", "#7b8790", "recoveredTrap"]
  ]},
  { chapter: 2, speciesId: "great_auk", speciesName: "大海雀", title: "大海雀海岸档案", items: [
    ["auk_feather", "海雀羽片", "北方海岸曾有成群海雀", "#738c9c", "researchSample"],
    ["auk_egg_shell", "厚蛋壳", "繁殖岛需要安静的退潮带", "#c6aa77", "naturalHide"],
    ["auk_lure_hook", "旧诱捕钩", "集中捕捉让繁殖群无法补充", "#8c6f63", "recoveredTrap"]
  ]},
  { chapter: 3, speciesId: "baiji", speciesName: "白鱀豚", title: "白鱀豚河湾档案", items: [
    ["baiji_echo_record", "旧声呐记录", "河湾里曾有连续回声", "#6e9f9a", "researchSample"],
    ["baiji_ferry_mark", "废弃航道标记", "船道切断了安静水域", "#c39a4d", "recoveredTrap"],
    ["baiji_net_knot", "渔网结扣", "误捕让繁殖群失去安全水面", "#8b72a7", "naturalHide"]
  ]},
  { chapter: 4, speciesId: "dodo", speciesName: "渡渡鸟", title: "渡渡鸟岛屿档案", items: [
    ["dodo_footprint", "渡渡鸟足印模", "岛屿地表留下过笨拙的脚印", "#b58b6d", "researchSample"],
    ["dodo_seed", "硬壳种子", "它曾帮助传播岛上植物", "#b59c4c", "naturalHide"],
    ["dodo_nest_stone", "旧巢石", "繁殖地被外来动物反复扰动", "#7e8a84", "recoveredTrap"]
  ]},
  { chapter: 5, speciesId: "thylacine", speciesName: "袋狼", title: "袋狼林缘档案", items: [
    ["thylacine_stripe_fur", "条纹毛片", "林缘曾有袋狼巡行的痕迹", "#a57c62", "researchSample"],
    ["thylacine_den_stone", "洞口石片", "破碎林地减少了安全育幼地", "#8b8871", "naturalHide"],
    ["thylacine_track_plate", "旧足迹拓片", "最后的足迹停在边界之外", "#887b91", "recoveredTrap"]
  ]},
  { chapter: 6, speciesId: "quagga", speciesName: "斑驴", title: "斑驴草原档案", items: [
    ["quagga_stripe_hair", "斑纹毛束", "草原迁徙队伍曾在此经过", "#b48453", "researchSample"],
    ["quagga_water_mark", "旧水点刻痕", "水点减少让队伍失去退路", "#6e9f9a", "naturalHide"],
    ["quagga_rail_snare", "边界套索", "围捕切断了草原连线", "#7b8790", "recoveredTrap"]
  ]},
  { chapter: 7, speciesId: "woolly_mammoth", speciesName: "猛犸象", title: "猛犸象冰原档案", items: [
    ["mammoth_hair", "猛犸象毛", "冻土保存了古老的迁徙线", "#9a806b", "researchSample"],
    ["mammoth_tusk_shard", "象牙碎片", "大型草食动物曾维持草原开阔", "#d2b77d", "naturalHide"],
    ["mammoth_ice_mark", "冰层标记", "气候变化压缩了栖息窗口", "#7293a2", "recoveredTrap"]
  ]},
  { chapter: 8, speciesId: "western_black_rhino", speciesName: "西部黑犀", title: "西部黑犀边界档案", items: [
    ["rhino_horn_trace", "角印拓片", "最后的巡护记录停在水坑边", "#a48b69", "researchSample"],
    ["rhino_waterhole_marker", "空水坑标记", "安全水源与繁殖群被切断", "#6e9f9a", "naturalHide"],
    ["rhino_patrol_wire", "边界铁丝", "盗猎线让种群无法连回同伴", "#7b8790", "recoveredTrap"]
  ]}
].map((chapter) => Object.assign({}, chapter, {
  items: chapter.items.map(([id, name, note, color, reuseFrom]) => ({
    id, name, note, color, reuseFrom, chapter: chapter.chapter,
    speciesId: chapter.speciesId, speciesName: chapter.speciesName,
    sourceLabel: "物种档案线索"
  }))
}));

const ARCHIVE_ITEMS = ARCHIVE_CHAPTERS.flatMap((chapter) => chapter.items);
const ARCHIVE_FIRST_CHAPTER = 2;
const ARCHIVE_LAST_CHAPTER = 8;
const RECIPES = ARCHIVE_CHAPTERS.map((chapter) => ({
  id: `${chapter.speciesId}_disappearance_file`,
  name: ({
    white_sturgeon: "白鲟河道声纹盒",
    passenger_pigeon: "旅鸽迁飞标本册",
    great_auk: "大海雀海岸证据册",
    baiji: "白鱀豚回声记录盒",
    dodo: "渡渡鸟种子匣",
    thylacine: "袋狼足迹拓印册",
    quagga: "斑驴迁徙水印册",
    woolly_mammoth: "猛犸象冻土样本盒",
    western_black_rhino: "西部黑犀巡护证据册"
  })[chapter.speciesId] || `${chapter.speciesName}保护档案盒`,
  note: `把三条${chapter.speciesName}线索整理成一份物种档案`,
  chapter: chapter.chapter,
  speciesId: chapter.speciesId,
  speciesName: chapter.speciesName,
  // 高阶档案的拨款随章节上升，但独立于科研样本出售次数，避免两套
  // 玩法互相抢占“本章可出售”额度。
  saleValue: (240 + chapter.chapter * 40) * 8,
  saleLabel: "物种保护专项拨款",
  requires: Object.fromEntries(chapter.items.map((item) => [item.id, 1]))
}));
// 兼容现有存档和测试：白鲟档案仍使用原来的 RECIPE 导出。
const RECIPE = RECIPES[0];

function emptySpeciesArchiveBox() {
  return { version: 3, collected: {}, synthesized: {}, sold: {}, lastSynthesis: null, lastSale: null };
}

// 0 表示正常开局：不预置档案物资，也不提前解锁章节。
const SPECIES_ARCHIVE_TEST_READY = 0;

function applySpeciesArchiveTestSeed(reserve = {}) {
  const ready = Math.max(0, Math.round(Number(SPECIES_ARCHIVE_TEST_READY) || 0));
  if (!ready) return reserve;
  const box = normalizeSpeciesArchiveBox(reserve.speciesArchiveBox, reserve);
  ARCHIVE_ITEMS.forEach((item) => { box.collected[item.id] = 0; });
  RECIPES.slice(0, ready).forEach((recipe) => {
    Object.keys(recipe.requires || {}).forEach((id) => {
      box.collected[id] = Math.max(1, Math.round(Number(recipe.requires[id]) || 1));
    });
  });
  RECIPES.forEach((recipe) => {
    box.synthesized[recipe.id] = 0;
    box.sold[recipe.id] = 0;
  });
  box.lastSynthesis = null;
  box.lastSale = null;
  reserve.speciesArchiveBox = box;
  const progression = reserve.progression || (reserve.progression = {});
  const chapter = Math.max(1, Math.round(Number(progression.displayChapter || progression.stage) || 1));
  const unlockChapter = ARCHIVE_FIRST_CHAPTER + ready - 1;
  if (chapter < unlockChapter) {
    progression.displayChapter = unlockChapter;
    progression.stage = unlockChapter;
  }
  return reserve;
}

function archiveSetsForChapter(chapter = ARCHIVE_FIRST_CHAPTER) {
  const value = Math.max(ARCHIVE_FIRST_CHAPTER, Math.min(ARCHIVE_LAST_CHAPTER, Math.round(Number(chapter) || ARCHIVE_FIRST_CHAPTER)));
  const sets = ARCHIVE_CHAPTERS.filter((entry) => entry.chapter === value);
  return sets.length ? sets : [ARCHIVE_CHAPTERS[0]];
}

function chapterArchiveSet(chapter = ARCHIVE_FIRST_CHAPTER) {
  return archiveSetsForChapter(chapter)[0];
}

function archiveItemsForChapter(chapter = 3) {
  return archiveSetsForChapter(chapter).flatMap((entry) => entry.items);
}

function archiveItemById(id = "") {
  return ARCHIVE_ITEMS.find((item) => item.id === String(id || "")) || null;
}

function archiveRecipeForChapter(chapter = 3) {
  const target = chapterArchiveSet(chapter).chapter;
  return RECIPES.find((recipe) => recipe.chapter === target) || RECIPE;
}

function normalizeSpeciesArchiveBox(input = {}, reserve = {}) {
  const source = input && typeof input === "object" ? input : {};
  const box = emptySpeciesArchiveBox();
  const collected = Object.assign({}, source.collected || {});
  const task = reserve.extinctionClueTask || {};
  const synthesizedSource = source.synthesized || {};
  const hasArchiveData = !!source.lastSynthesis
    || Object.values(collected).some((value) => Number(value) > 0)
    || Object.values(synthesizedSource).some((value) => Number(value) > 0);
  // 老存档只有灭绝线索任务进度时，首次进入物资页仍能看到已拾取线索。
  if (!hasArchiveData) (Array.isArray(task.collectedIds) ? task.collectedIds : []).forEach((id) => {
    if (archiveItemById(id)) collected[id] = Math.max(1, Math.round(Number(collected[id]) || 0));
  });
  ARCHIVE_ITEMS.forEach((item) => { collected[item.id] = Math.max(0, Math.round(Number(collected[item.id]) || 0)); });
  const synthesized = Object.assign({}, source.synthesized || {});
  RECIPES.forEach((recipe) => { synthesized[recipe.id] = Math.max(0, Math.round(Number(synthesized[recipe.id]) || 0)); });
  const sold = Object.assign({}, source.sold || {});
  RECIPES.forEach((recipe) => {
    sold[recipe.id] = Math.max(0, Math.min(synthesized[recipe.id], Math.round(Number(sold[recipe.id]) || 0)));
  });
  return Object.assign(box, source, { version: 3, collected, synthesized, sold, lastSynthesis: source.lastSynthesis || null, lastSale: source.lastSale || null });
}

function recordSpeciesArchiveItem(reserve = {}, itemId = "") {
  const item = archiveItemById(itemId);
  const prior = (reserve.speciesArchiveBox && reserve.speciesArchiveBox.collected) || {};
  const before = Math.max(0, Math.round(Number(prior[itemId]) || 0));
  const box = normalizeSpeciesArchiveBox(reserve.speciesArchiveBox, reserve);
  if (!item) return box;
  const normalized = Math.max(0, Number(box.collected[item.id]) || 0);
  // 旧档会把任务里已有的种类迁成 1。这一次拾取如果档案盒里还没有，那 1 就是本次，不再加一次。
  box.collected[item.id] = before > 0 || normalized === before ? normalized + 1 : normalized;
  reserve.speciesArchiveBox = box;
  return box;
}

function recordSpeciesArchiveFromMaterial(reserve = {}, materialId = "", chapter = 3) {
  const box = normalizeSpeciesArchiveBox(reserve.speciesArchiveBox, reserve);
  const candidates = archiveItemsForChapter(chapter).filter((item) => item.reuseFrom === String(materialId || ""));
  if (!candidates.length) return { box, item: null };
  const item = candidates.find((entry) => !(Number(box.collected[entry.id]) > 0)) || candidates[0];
  box.collected[item.id] = Math.max(0, Number(box.collected[item.id]) || 0) + 1;
  reserve.speciesArchiveBox = box;
  return { box, item };
}

function archiveRecipeFromHint(hint, fallbackChapter) {
  if (hint && typeof hint === "object" && hint.id) {
    return RECIPES.find((recipe) => recipe.id === hint.id) || RECIPE;
  }
  return archiveRecipeForChapter(hint || fallbackChapter);
}

function canSynthesizeSpeciesArchive(reserve = {}, chapter = null) {
  const fallbackChapter = (((reserve.progression || {}).displayChapter || (reserve.progression || {}).stage) || ARCHIVE_FIRST_CHAPTER);
  const recipe = archiveRecipeFromHint(chapter, fallbackChapter);
  const box = normalizeSpeciesArchiveBox(reserve.speciesArchiveBox, reserve);
  const missing = Object.keys(recipe.requires).filter((id) => (Number(box.collected[id]) || 0) < recipe.requires[id]);
  return { ok: missing.length === 0, missing, box, recipe };
}

function synthesizeSpeciesArchive(reserve = {}, chapter = null) {
  const check = canSynthesizeSpeciesArchive(reserve, chapter);
  if (!check.ok) return { ok: false, missing: check.missing, box: check.box, recipe: check.recipe };
  const box = check.box;
  Object.keys(check.recipe.requires).forEach((id) => { box.collected[id] = Math.max(0, (Number(box.collected[id]) || 0) - check.recipe.requires[id]); });
  box.synthesized[check.recipe.id] = Math.max(0, Number(box.synthesized[check.recipe.id]) || 0) + 1;
  box.lastSynthesis = { id: check.recipe.id, name: check.recipe.name, chapter: check.recipe.chapter, at: Date.now() };
  reserve.speciesArchiveBox = box;
  return { ok: true, recipe: check.recipe, box };
}

function sellSpeciesArchive(reserve = {}, chapter = null) {
  const fallbackChapter = (((reserve.progression || {}).displayChapter || (reserve.progression || {}).stage) || ARCHIVE_FIRST_CHAPTER);
  const recipe = archiveRecipeFromHint(chapter, fallbackChapter);
  const box = normalizeSpeciesArchiveBox(reserve.speciesArchiveBox, reserve);
  const synthesized = Math.max(0, Number(box.synthesized[recipe.id]) || 0);
  const sold = Math.max(0, Number(box.sold[recipe.id]) || 0);
  if (synthesized <= sold) return { ok: false, reason: "none", recipe, box, readyToSell: 0 };
  box.sold[recipe.id] = sold + 1;
  box.lastSale = {
    id: recipe.id,
    name: recipe.name,
    chapter: recipe.chapter,
    value: recipe.saleValue,
    at: Date.now()
  };
  reserve.speciesArchiveBox = box;
  return {
    ok: true,
    recipe,
    value: recipe.saleValue,
    sold: box.sold[recipe.id],
    readyToSell: Math.max(0, synthesized - box.sold[recipe.id]),
    box
  };
}

function recipeArchiveState(reserve = {}, recipe = null) {
  const chapter = Math.max(1, Math.round(Number((reserve.progression || {}).displayChapter || (reserve.progression || {}).stage) || 1));
  const target = recipe || archiveRecipeForChapter(chapter);
  const box = normalizeSpeciesArchiveBox(reserve.speciesArchiveBox, reserve);
  const requires = target.requires || {};
  const missing = Object.keys(requires).filter((id) => (Number(box.collected[id]) || 0) < (Number(requires[id]) || 1));
  const synthesized = Math.max(0, Number(box.synthesized[target.id]) || 0);
  const sold = Math.max(0, Number(box.sold[target.id]) || 0);
  const unlocked = chapter >= Number(target.chapter);
  return {
    recipe: target,
    unlocked,
    missing,
    canSynthesize: unlocked && missing.length === 0,
    synthesized,
    sold,
    readyToSell: Math.max(0, synthesized - sold),
    saleValue: target.saleValue
  };
}

function speciesArchiveView(reserve = {}) {
  const chapter = Math.max(1, Math.round(Number((reserve.progression || {}).displayChapter || (reserve.progression || {}).stage) || 1));
  const sets = archiveSetsForChapter(chapter);
  const activeChapter = sets[0];
  const box = normalizeSpeciesArchiveBox(reserve.speciesArchiveBox, reserve);
  const canSynthesize = canSynthesizeSpeciesArchive(reserve, chapter);
  const chapterItems = sets.flatMap((entry) => entry.items.map((item) => Object.assign({}, item, { count: Math.max(0, Number(box.collected[item.id]) || 0) })));
  const overallCollected = ARCHIVE_ITEMS.reduce((sum, item) => sum + (Number(box.collected[item.id]) || 0), 0);
  const overallSynthesized = RECIPES.reduce((sum, recipe) => sum + (Number(box.synthesized[recipe.id]) || 0), 0);
  const recipeSold = Math.max(0, Number(box.sold[canSynthesize.recipe.id]) || 0);
  const readyToSell = Math.max(0, Math.max(0, Number(box.synthesized[canSynthesize.recipe.id]) || 0) - recipeSold);
  return {
    box,
    chapter: activeChapter.chapter,
    chapterTitle: sets.length > 1 ? "本章消失档案" : activeChapter.title,
    speciesName: sets.length > 1 ? sets.map((entry) => entry.speciesName).join("、") : activeChapter.speciesName,
    items: chapterItems,
    allItems: ARCHIVE_ITEMS.map((item) => Object.assign({}, item, { count: Math.max(0, Number(box.collected[item.id]) || 0) })),
    recipe: canSynthesize.recipe,
    synthesized: Math.max(0, Number(box.synthesized[canSynthesize.recipe.id]) || 0),
    sold: recipeSold,
    readyToSell,
    saleValue: canSynthesize.recipe.saleValue,
    saleLabel: canSynthesize.recipe.saleLabel,
    canSynthesize: canSynthesize.ok,
    missing: canSynthesize.missing,
    overallCollected,
    overallTotal: ARCHIVE_ITEMS.length,
    overallSynthesized,
    unlocked: chapter >= ARCHIVE_FIRST_CHAPTER
  };
}

module.exports = {
  ARCHIVE_CHAPTERS,
  ARCHIVE_ITEMS,
  ARCHIVE_FIRST_CHAPTER,
  ARCHIVE_LAST_CHAPTER,
  RECIPES,
  RECIPE,
  archiveSetsForChapter,
  chapterArchiveSet,
  archiveItemsForChapter,
  archiveItemById,
  emptySpeciesArchiveBox,
  applySpeciesArchiveTestSeed,
  normalizeSpeciesArchiveBox,
  recordSpeciesArchiveItem,
  recordSpeciesArchiveFromMaterial,
  canSynthesizeSpeciesArchive,
  synthesizeSpeciesArchive,
  sellSpeciesArchive,
  recipeArchiveState,
  speciesArchiveView
};
