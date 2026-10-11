const TASK_ID = "chapter3_white_sturgeon_clues";
const TASK_CHAPTER = 3;

const CLUE_ITEMS = [
  {
    id: "old_fish_scale",
    name: "旧鱼鳞",
    clue: "白鲟曾在这段河道活动。",
    x: 0.27,
    y: 0.56,
    color: "#6e9f9a"
  },
  {
    id: "broken_river_marker",
    name: "断掉的河道标记",
    clue: "原来的洄游路线被改变。",
    x: 0.54,
    y: 0.47,
    color: "#c39a4d"
  },
  {
    id: "old_fishing_net",
    name: "旧渔网残片",
    clue: "误捕曾增加了白鲟的风险。",
    x: 0.76,
    y: 0.62,
    color: "#8b72a7"
  }
];

function emptyTask() {
  return {
    version: 1,
    id: TASK_ID,
    chapter: TASK_CHAPTER,
    speciesId: "white_sturgeon",
    speciesName: "白鲟",
    title: "找回白鲟消失前的线索",
    status: "locked",
    spawned: false,
    collectedIds: [],
    drops: [],
    activatedAt: 0,
    completedAt: 0,
    lastCollection: null
  };
}

function normalizeExtinctionClueTask(input = {}) {
  const base = emptyTask();
  const source = input && typeof input === "object" ? input : {};
  const collectedIds = Array.from(new Set(
    (Array.isArray(source.collectedIds) ? source.collectedIds : [])
      .map((id) => String(id || ""))
      .filter((id) => CLUE_ITEMS.some((item) => item.id === id))
  ));
  const validDrops = (Array.isArray(source.drops) ? source.drops : [])
    .map((drop) => {
      const item = CLUE_ITEMS.find((entry) => entry.id === String(drop && drop.id || ""));
      if (!item || collectedIds.includes(item.id)) return null;
      return Object.assign({
        type: "extinctionClue",
        group: "extinctionClue",
        speciesId: base.speciesId,
        speciesName: base.speciesName,
        x: item.x,
        y: item.y,
        name: item.name,
        clue: item.clue,
        color: item.color
      }, drop, { id: item.id });
    })
    .filter(Boolean);
  const status = source.status === "completed"
    ? "completed"
    : source.status === "active" || source.spawned
      ? "active"
      : "locked";
  const task = Object.assign({}, base, source, {
    version: 1,
    id: TASK_ID,
    chapter: TASK_CHAPTER,
    speciesId: base.speciesId,
    speciesName: base.speciesName,
    title: base.title,
    status: collectedIds.length >= CLUE_ITEMS.length ? "completed" : status,
    spawned: status !== "locked" || !!source.spawned,
    collectedIds,
    drops: validDrops,
    activatedAt: Math.max(0, Number(source.activatedAt) || 0),
    completedAt: Math.max(0, Number(source.completedAt) || 0),
    lastCollection: source.lastCollection && typeof source.lastCollection === "object"
      ? Object.assign({}, source.lastCollection)
      : null
  });
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
  const task = normalizeExtinctionClueTask(reserve.extinctionClueTask);
  const chapter = currentChapter(reserve);
  if (task.status === "completed") {
    reserve.extinctionClueTask = task;
    return task;
  }
  if (chapter === TASK_CHAPTER && (task.status === "locked" || (task.status === "active" && !task.drops.length))) {
    if (task.status === "locked") task.activatedAt = Date.now();
    task.status = "active";
    task.spawned = true;
    task.drops = CLUE_ITEMS
      .filter((item) => !task.collectedIds.includes(item.id))
      .map((item) => Object.assign({}, item, {
        type: "extinctionClue",
        group: "extinctionClue",
        speciesId: task.speciesId,
        speciesName: task.speciesName
      }));
  }
  reserve.extinctionClueTask = task;
  return task;
}

function extinctionClueVisibleDrops(reserve = {}) {
  const task = normalizeExtinctionClueTask(reserve.extinctionClueTask);
  const chapter = currentChapter(reserve);
  if (chapter !== TASK_CHAPTER || task.status !== "active") return [];
  return task.drops.slice();
}

function collectExtinctionClue(reserve = {}, clueId = "") {
  const task = ensureExtinctionClueTask(reserve);
  const id = String(clueId || "");
  if (task.status !== "active") return { ok: false, reason: "inactive" };
  if (task.collectedIds.includes(id)) return { ok: false, reason: "already_collected" };
  const item = CLUE_ITEMS.find((entry) => entry.id === id);
  if (!item || !task.drops.some((drop) => drop.id === id)) return { ok: false, reason: "unknown_clue" };
  task.collectedIds = task.collectedIds.concat(id);
  task.drops = task.drops.filter((drop) => drop.id !== id);
  task.lastCollection = { id, name: item.name, collectedAt: Date.now() };
  const complete = task.collectedIds.length >= CLUE_ITEMS.length;
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
    total: CLUE_ITEMS.length,
    progress: `${task.collectedIds.length}/${CLUE_ITEMS.length}`
  };
}

function extinctionClueTaskView(reserve = {}) {
  const task = normalizeExtinctionClueTask(reserve.extinctionClueTask);
  return {
    id: task.id,
    title: task.title,
    speciesName: task.speciesName,
    status: task.status,
    progress: task.collectedIds.length,
    total: CLUE_ITEMS.length,
    progressText: `${task.collectedIds.length}/${CLUE_ITEMS.length}`,
    active: task.status === "active" && currentChapter(reserve) === TASK_CHAPTER,
    completed: task.status === "completed"
  };
}

module.exports = {
  TASK_ID,
  TASK_CHAPTER,
  CLUE_ITEMS,
  emptyTask,
  normalizeExtinctionClueTask,
  ensureExtinctionClueTask,
  extinctionClueVisibleDrops,
  collectExtinctionClue,
  extinctionClueTaskView,
  currentChapter
};
