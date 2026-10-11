const { archiveItemsForChapter, chapterArchiveSet } = require("./speciesArchiveBox");

const TASK_CHAPTER = 3;
const TASK_ID = "chapter3_white_sturgeon_clues";
const CLUE_LAYOUTS = [
  [[0.20, 0.27], [0.62, 0.73], [0.78, 0.69]],
  [[0.18, 0.34], [0.57, 0.25], [0.78, 0.70]],
  [[0.22, 0.66], [0.56, 0.28], [0.82, 0.58]],
  [[0.18, 0.28], [0.48, 0.72], [0.80, 0.38]],
  [[0.24, 0.74], [0.64, 0.26], [0.82, 0.66]],
  [[0.16, 0.42], [0.55, 0.76], [0.84, 0.30]],
  [[0.24, 0.30], [0.68, 0.70], [0.84, 0.52]],
  [[0.16, 0.68], [0.52, 0.28], [0.80, 0.76]],
  [[0.22, 0.34], [0.62, 0.64], [0.84, 0.42]]
];

function validChapter(chapter) {
  return Math.max(3, Math.min(11, Math.round(Number(chapter) || 3)));
}

function clueItemsForChapter(chapter = 3) {
  const chapterDef = chapterArchiveSet(validChapter(chapter));
  const layout = CLUE_LAYOUTS[(chapterDef.chapter - 3) % CLUE_LAYOUTS.length];
  return chapterDef.items.map((item, index) => Object.assign({}, item, {
    x: layout[index][0],
    y: layout[index][1],
    clue: item.note,
    type: "extinctionClue",
    group: "speciesArchive",
    speciesId: chapterDef.speciesId,
    speciesName: chapterDef.speciesName
  }));
}

const CLUE_ITEMS = clueItemsForChapter(3);

function emptyTask(chapter = 3) {
  const chapterDef = chapterArchiveSet(validChapter(chapter));
  return {
    version: 2,
    id: chapterDef.chapter === 3 ? TASK_ID : `chapter${chapterDef.chapter}_${chapterDef.speciesId}_archive`,
    chapter: chapterDef.chapter,
    speciesId: chapterDef.speciesId,
    speciesName: chapterDef.speciesName,
    title: `找回${chapterDef.speciesName}消失前的线索`,
    status: "locked",
    spawned: false,
    collectedIds: [],
    drops: [],
    activatedAt: 0,
    completedAt: 0,
    lastCollection: null,
    layoutVersion: 2
  };
}

function normalizeExtinctionClueTask(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const chapter = validChapter(source.chapter || TASK_CHAPTER);
  const base = emptyTask(chapter);
  const items = clueItemsForChapter(chapter);
  const collectedIds = Array.from(new Set(
    (Array.isArray(source.collectedIds) ? source.collectedIds : [])
      .map((id) => String(id || ""))
      .filter((id) => items.some((item) => item.id === id))
  ));
  const validDrops = (Array.isArray(source.drops) ? source.drops : [])
    .map((drop) => {
      const item = items.find((entry) => entry.id === String(drop && drop.id || ""));
      if (!item || collectedIds.includes(item.id)) return null;
      return Object.assign({}, item, drop, { id: item.id, x: item.x, y: item.y });
    })
    .filter(Boolean);
  const status = source.status === "completed"
    ? "completed"
    : source.status === "active" || source.spawned
      ? "active"
      : "locked";
  const task = Object.assign({}, base, source, {
    version: 2,
    id: base.id,
    chapter,
    speciesId: base.speciesId,
    speciesName: base.speciesName,
    title: base.title,
    status: collectedIds.length >= items.length ? "completed" : status,
    spawned: status !== "locked" || !!source.spawned,
    collectedIds,
    drops: validDrops,
    activatedAt: Math.max(0, Number(source.activatedAt) || 0),
    completedAt: Math.max(0, Number(source.completedAt) || 0),
    layoutVersion: 2,
    lastCollection: source.lastCollection && typeof source.lastCollection === "object"
      ? Object.assign({}, source.lastCollection)
      : null
  });
  if (Number(source.layoutVersion) !== 2) validDrops.forEach((drop) => { delete drop.renderX; delete drop.renderY; });
  if (task.status === "completed") {
    task.spawned = true;
    task.drops = [];
  }
  return task;
}

function currentChapter(reserve = {}) {
  const progression = reserve.progression || {};
  return Math.max(1, Math.round(Number(
    progression.displayChapter || progression.stage || progression.level || 1
  ) || 1));
}

function ensureExtinctionClueTask(reserve = {}) {
  const chapter = currentChapter(reserve);
  const inRange = chapter >= 3 && chapter <= 11;
  let task = normalizeExtinctionClueTask(reserve.extinctionClueTask);
  // 章节推进后建立新的一组线索；已归档的上一章线索仍保留在物种档案盒。
  if (inRange && task.chapter !== chapter) task = emptyTask(chapter);
  if (inRange && (task.status === "locked" || (task.status === "active" && !task.drops.length))) {
    if (task.status === "locked") task.activatedAt = Date.now();
    task.status = "active";
    task.spawned = true;
    task.drops = clueItemsForChapter(chapter)
      .filter((item) => !task.collectedIds.includes(item.id))
      .map((item) => Object.assign({}, item));
  }
  reserve.extinctionClueTask = task;
  return task;
}

function extinctionClueVisibleDrops(reserve = {}) {
  const task = ensureExtinctionClueTask(reserve);
  const chapter = currentChapter(reserve);
  if (chapter < 3 || chapter > 11 || task.chapter !== chapter || task.status !== "active") return [];
  return task.drops.slice();
}

function collectExtinctionClue(reserve = {}, clueId = "") {
  const task = ensureExtinctionClueTask(reserve);
  const id = String(clueId || "");
  const items = clueItemsForChapter(task.chapter);
  if (task.status !== "active") return { ok: false, reason: "inactive" };
  if (task.collectedIds.includes(id)) return { ok: false, reason: "already_collected" };
  const item = items.find((entry) => entry.id === id);
  if (!item || !task.drops.some((drop) => drop.id === id)) return { ok: false, reason: "unknown_clue" };
  task.collectedIds = task.collectedIds.concat(id);
  task.drops = task.drops.filter((drop) => drop.id !== id);
  task.lastCollection = { id, name: item.name, collectedAt: Date.now() };
  const complete = task.collectedIds.length >= items.length;
  if (complete) {
    task.status = "completed";
    task.completedAt = Date.now();
    task.drops = [];
  }
  reserve.extinctionClueTask = task;
  return {
    ok: true,
    item: Object.assign({}, item),
    complete,
    collected: task.collectedIds.length,
    total: items.length,
    progress: `${task.collectedIds.length}/${items.length}`
  };
}

function extinctionClueTaskView(reserve = {}) {
  const task = ensureExtinctionClueTask(reserve);
  const chapter = currentChapter(reserve);
  const active = task.status === "active" && task.chapter === chapter && chapter >= 3 && chapter <= 11;
  return {
    id: task.id,
    chapter: task.chapter,
    title: task.title,
    speciesName: task.speciesName,
    status: task.status,
    progress: task.collectedIds.length,
    total: clueItemsForChapter(task.chapter).length,
    progressText: `${task.collectedIds.length}/${clueItemsForChapter(task.chapter).length}`,
    active,
    completed: task.status === "completed" && task.chapter === chapter
  };
}

module.exports = {
  TASK_ID,
  TASK_CHAPTER,
  CLUE_ITEMS,
  clueItemsForChapter,
  emptyTask,
  normalizeExtinctionClueTask,
  ensureExtinctionClueTask,
  extinctionClueVisibleDrops,
  collectExtinctionClue,
  extinctionClueTaskView,
  currentChapter
};
