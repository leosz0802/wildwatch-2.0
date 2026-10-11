const ARCHIVE_ITEMS = [
  { id: "old_fish_scale", name: "旧鱼鳞", note: "白鲟曾在河道活动", color: "#6e9f9a" },
  { id: "broken_river_marker", name: "断掉的河道标记", note: "洄游路线发生改变", color: "#c39a4d" },
  { id: "old_fishing_net", name: "旧渔网残片", note: "误捕风险留下的痕迹", color: "#8b72a7" }
];
const RECIPE = {
  id: "white_sturgeon_disappearance_file",
  name: "白鲟消失档案",
  note: "把三条线索整理成一份物种档案",
  requires: { old_fish_scale: 1, broken_river_marker: 1, old_fishing_net: 1 }
};

function emptySpeciesArchiveBox() {
  return { version: 1, collected: {}, synthesized: {}, lastSynthesis: null };
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
  if (!hasArchiveData) (Array.isArray(task.collectedIds) ? task.collectedIds : []).forEach((id) => {
    if (ARCHIVE_ITEMS.some((item) => item.id === id)) collected[id] = Math.max(1, Math.round(Number(collected[id]) || 0));
  });
  ARCHIVE_ITEMS.forEach((item) => { collected[item.id] = Math.max(0, Math.round(Number(collected[item.id]) || 0)); });
  const synthesized = Object.assign({}, source.synthesized || {});
  Object.keys(synthesized).forEach((id) => { synthesized[id] = Math.max(0, Math.round(Number(synthesized[id]) || 0)); });
  return Object.assign(box, source, { version: 1, collected, synthesized, lastSynthesis: source.lastSynthesis || null });
}

function recordSpeciesArchiveItem(reserve = {}, itemId = "") {
  const box = normalizeSpeciesArchiveBox(reserve.speciesArchiveBox, reserve);
  if (!ARCHIVE_ITEMS.some((item) => item.id === itemId)) return box;
  box.collected[itemId] = Math.max(0, Number(box.collected[itemId]) || 0) + 1;
  reserve.speciesArchiveBox = box;
  return box;
}

function canSynthesizeSpeciesArchive(reserve = {}) {
  const box = normalizeSpeciesArchiveBox(reserve.speciesArchiveBox, reserve);
  const missing = Object.keys(RECIPE.requires).filter((id) => (Number(box.collected[id]) || 0) < RECIPE.requires[id]);
  return { ok: missing.length === 0, missing, box };
}

function synthesizeSpeciesArchive(reserve = {}) {
  const check = canSynthesizeSpeciesArchive(reserve);
  if (!check.ok) return { ok: false, missing: check.missing, box: check.box };
  const box = check.box;
  Object.keys(RECIPE.requires).forEach((id) => { box.collected[id] = Math.max(0, (Number(box.collected[id]) || 0) - RECIPE.requires[id]); });
  box.synthesized[RECIPE.id] = Math.max(0, Number(box.synthesized[RECIPE.id]) || 0) + 1;
  box.lastSynthesis = { id: RECIPE.id, name: RECIPE.name, at: Date.now() };
  reserve.speciesArchiveBox = box;
  return { ok: true, recipe: RECIPE, box };
}

function speciesArchiveView(reserve = {}) {
  const box = normalizeSpeciesArchiveBox(reserve.speciesArchiveBox, reserve);
  const canSynthesize = canSynthesizeSpeciesArchive(reserve);
  return {
    box,
    items: ARCHIVE_ITEMS.map((item) => Object.assign({}, item, { count: Math.max(0, Number(box.collected[item.id]) || 0) })),
    recipe: RECIPE,
    synthesized: Math.max(0, Number(box.synthesized[RECIPE.id]) || 0),
    canSynthesize: canSynthesize.ok,
    missing: canSynthesize.missing
  };
}

module.exports = {
  ARCHIVE_ITEMS,
  RECIPE,
  emptySpeciesArchiveBox,
  normalizeSpeciesArchiveBox,
  recordSpeciesArchiveItem,
  canSynthesizeSpeciesArchive,
  synthesizeSpeciesArchive,
  speciesArchiveView
};
