const { archiveSetsForChapter, ARCHIVE_ITEMS, ARCHIVE_FIRST_CHAPTER, ARCHIVE_LAST_CHAPTER } = require("./speciesArchiveBox");
const { paceOperatingInflation } = require("./balanceConfig");

const TASK_CHAPTER = ARCHIVE_FIRST_CHAPTER;
const TASK_ID = "chapter2_white_sturgeon_clues";
const DROP_GAP_MS = 8000;
const DROP_LIFE_MIN_MS = 13000;
const DROP_LIFE_MAX_MS = 15000;
const DROP_CHANCE = 0.72;
const HOUND_DROP_MULTIPLIER = 2.5;
const KENNEL_FREE_USES = 3;
const KENNEL_AD_GRANT = 3;
const HOUND_KENNEL = Object.freeze({ x: 0.34, y: 0.64 });
const KENNEL_MAX_LEVEL = 3;
// 犬屋升级只作用于猎犬搜寻。等级提高档案线索的出现概率、频率，
// 并更常落到还缺的种类。世界榜猎犬巡逻不读这张表。
const KENNEL_LEVELS = Object.freeze({
  1: Object.freeze({ level: 1, chance: DROP_CHANCE, gapMs: DROP_GAP_MS, precision: 0, dogFood: 2, fundBase: 320, searchMultiplier: HOUND_DROP_MULTIPLIER }),
  2: Object.freeze({ level: 2, chance: 0.85, gapMs: 6000, precision: 0.55, dogFood: 3, fundBase: 512, searchMultiplier: 3 }),
  3: Object.freeze({ level: 3, chance: 0.92, gapMs: 4000, precision: 0.85, dogFood: 4, fundBase: 768, searchMultiplier: 3.4 })
});
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
// 三个固定落点被生态物资占住时仍要能掉。搜寻则落在犬屋旁边，玩家刚点完就能看见。
const FALLBACK_DROP_POINTS = Object.freeze([
  [0.22, 0.56],
  [0.78, 0.58],
  [0.24, 0.74],
  [0.76, 0.72]
]);
const KENNEL_SEARCH_POINTS = Object.freeze([
  [0.52, 0.64],
  [0.22, 0.56],
  [0.58, 0.74],
  [0.20, 0.74]
]);

const ARCHIVE_CATCHUP_FIRST = 9;
const ARCHIVE_CATCHUP_LAST = 11;

function validChapter(chapter) {
  return Math.max(ARCHIVE_FIRST_CHAPTER, Math.min(ARCHIVE_LAST_CHAPTER, Math.round(Number(chapter) || ARCHIVE_FIRST_CHAPTER)));
}

function isArchiveCatchupChapter(chapter) {
  const value = Math.round(Number(chapter) || 0);
  return value >= ARCHIVE_CATCHUP_FIRST && value <= ARCHIVE_CATCHUP_LAST;
}

function taskChapter(chapter) {
  const value = Math.round(Number(chapter) || ARCHIVE_FIRST_CHAPTER);
  return isArchiveCatchupChapter(value) ? value : validChapter(value);
}

function archiveChapterActive(chapter) {
  return (chapter >= ARCHIVE_FIRST_CHAPTER && chapter <= ARCHIVE_LAST_CHAPTER) || isArchiveCatchupChapter(chapter);
}

function clueItemsForChapter(chapter = 3) {
  if (isArchiveCatchupChapter(chapter)) {
    const layout = CLUE_LAYOUTS[(chapter - ARCHIVE_CATCHUP_FIRST) % CLUE_LAYOUTS.length];
    return ARCHIVE_ITEMS.map((item, index) => Object.assign({}, item, {
      x: layout[index % layout.length][0],
      y: layout[index % layout.length][1],
      clue: item.note,
      type: "extinctionClue",
      group: "speciesArchive",
      speciesId: item.speciesId,
      speciesName: item.speciesName
    }));
  }
  const sets = archiveSetsForChapter(validChapter(chapter));
  const layout = CLUE_LAYOUTS[(sets[0].chapter - ARCHIVE_FIRST_CHAPTER) % CLUE_LAYOUTS.length];
  return sets.flatMap((chapterDef) => chapterDef.items.map((item, index) => Object.assign({}, item, {
    x: layout[index % layout.length][0],
    y: layout[index % layout.length][1],
    clue: item.note,
    type: "extinctionClue",
    group: "speciesArchive",
    speciesId: chapterDef.speciesId,
    speciesName: chapterDef.speciesName
  })));
}

const CLUE_ITEMS = clueItemsForChapter(3);

function emptyTask(chapter = 3) {
  if (isArchiveCatchupChapter(chapter)) {
    const value = taskChapter(chapter);
    return {
      version: 2,
      id: `chapter${value}_archive_catchup`,
      chapter: value,
      speciesId: "all_archive",
      speciesName: "全部",
      title: "补齐还缺的档案物资",
      status: "locked",
      spawned: false,
      collectedIds: [],
      drops: [],
      activatedAt: 0,
      completedAt: 0,
      lastCollection: null,
      layoutVersion: 2,
      dropMultiplier: 1,
      dropCursor: 0,
      nextDropAt: 0,
      kennel: emptyKennel(value)
    };
  }
  const sets = archiveSetsForChapter(validChapter(chapter));
  const chapterDef = sets[0];
  const names = sets.map((entry) => entry.speciesName);
  const multi = names.length > 1;
  return {
    version: 2,
    id: chapterDef.chapter === ARCHIVE_FIRST_CHAPTER ? TASK_ID : `chapter${chapterDef.chapter}_${chapterDef.speciesId}_archive`,
    chapter: chapterDef.chapter,
    speciesId: multi ? "chapter_species" : chapterDef.speciesId,
    speciesName: multi ? "本章" : names[0],
    title: multi ? `找回${names.join("、")}消失前的线索` : `找回${names[0]}消失前的线索`,
    status: "locked",
    spawned: false,
    collectedIds: [],
    drops: [],
    activatedAt: 0,
    completedAt: 0,
    lastCollection: null,
    layoutVersion: 2,
    dropMultiplier: 1,
    dropCursor: 0,
    nextDropAt: 0,
    kennel: emptyKennel(chapterDef.chapter)
  };
}

function kennelLevel(value = 1) {
  return Math.max(1, Math.min(KENNEL_MAX_LEVEL, Math.round(Number(value) || 1)));
}

function kennelDropProfile(level = 1) {
  return KENNEL_LEVELS[kennelLevel(level)];
}

function emptyKennel(chapter = 3, level = 1) {
  return {
    chapter: taskChapter(chapter),
    freeRemaining: KENNEL_FREE_USES,
    bonusRemaining: 0,
    adUsed: false,
    level: kennelLevel(level)
  };
}

function normalizeKennel(source, chapter = 3) {
  const current = taskChapter(chapter);
  const level = kennelLevel(source && source.level);
  if (!source || Number(source.chapter) !== current) return emptyKennel(current, level);
  return {
    chapter: current,
    freeRemaining: Math.max(0, Math.min(KENNEL_FREE_USES, Math.round(Number(source.freeRemaining) || 0))),
    bonusRemaining: Math.max(0, Math.min(KENNEL_AD_GRANT, Math.round(Number(source.bonusRemaining) || 0))),
    adUsed: source.adUsed === true,
    level
  };
}

function normalizeExtinctionClueTask(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const chapter = taskChapter(source.chapter || TASK_CHAPTER);
  const base = emptyTask(chapter);
  const items = clueItemsForChapter(chapter);
  const collectedIds = Array.from(new Set(
    (Array.isArray(source.collectedIds) ? source.collectedIds : [])
      .map((id) => String(id || ""))
      .filter((id) => items.some((item) => item.id === id))
  ));
  const now = Date.now();
  const validDrops = (Array.isArray(source.drops) ? source.drops : [])
    .map((drop) => {
      const item = items.find((entry) => entry.id === String(drop && drop.id || ""));
      const expiresAt = Math.round(Number(drop && drop.expiresAt) || 0);
      if (!item || !(expiresAt > now)) return null;
      const savedX = Number(drop && drop.x);
      const savedY = Number(drop && drop.y);
      const renderX = Number(drop && drop.renderX);
      const renderY = Number(drop && drop.renderY);
      const placed = {
        id: item.id,
        x: Number.isFinite(savedX) ? savedX : item.x,
        y: Number.isFinite(savedY) ? savedY : item.y,
        spawnedAt: Math.max(0, Math.round(Number(drop.spawnedAt) || 0)),
        expiresAt
      };
      // 画在沙盘上的位置只算一次。每帧重算会让物资在动物旁边来回跳。
      if (Number.isFinite(renderX) && Number.isFinite(renderY)) {
        placed.renderX = renderX;
        placed.renderY = renderY;
      }
      return Object.assign({}, item, placed);
    })
    .filter(Boolean)
    .slice(0, 1);
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
    status: !isArchiveCatchupChapter(chapter) && collectedIds.length >= items.length ? "completed" : status,
    spawned: status !== "locked" || !!source.spawned,
    collectedIds,
    drops: validDrops,
    activatedAt: Math.max(0, Number(source.activatedAt) || 0),
    completedAt: Math.max(0, Number(source.completedAt) || 0),
    layoutVersion: 2,
    dropMultiplier: Math.max(1, Number(source.dropMultiplier) || 1),
    dropCursor: Math.max(0, Math.round(Number(source.dropCursor) || 0)),
    nextDropAt: Math.max(0, Math.round(Number(source.nextDropAt) || 0)),
    kennel: normalizeKennel(source.kennel, chapter),
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

function archiveBoxCount(reserve = {}, itemId = "") {
  const collected = ((reserve.speciesArchiveBox || {}).collected) || {};
  return Math.max(0, Math.round(Number(collected[itemId]) || 0));
}

function rememberArchivedCollections(reserve = {}, task = {}) {
  const items = clueItemsForChapter(task.chapter);
  const archived = items.filter((item) => archiveBoxCount(reserve, item.id) >= 1).map((item) => item.id);
  if (archived.length) {
    task.collectedIds = Array.from(new Set((task.collectedIds || []).concat(archived)));
  }
  // 换章会清空任务进度，但档案盒还留着。已经进盒的种类要算进进度，
  // 否则沙盘会把它们再投出来，十几秒后自己消失。
  if (!isArchiveCatchupChapter(task.chapter) && task.collectedIds.length >= items.length && items.length) {
    task.status = "completed";
    task.spawned = true;
    task.drops = [];
    if (!task.completedAt) task.completedAt = Date.now();
  }
  return task;
}

function ensureExtinctionClueTask(reserve = {}) {
  const chapter = currentChapter(reserve);
  const inRange = archiveChapterActive(chapter);
  let task = normalizeExtinctionClueTask(reserve.extinctionClueTask);
  const carriedLevel = kennelLevel(task.kennel && task.kennel.level);
  // 章节推进后建立新的一组线索；犬屋等级留下，搜寻次数按新章节重新计算。
  if (inRange && task.chapter !== chapter) {
    task = emptyTask(chapter);
    task.kennel = emptyKennel(chapter, carriedLevel);
  }
  if (inRange && task.status === "locked") {
    task.activatedAt = Date.now();
    task.status = "active";
    task.spawned = true;
    task.drops = [];
    task.dropMultiplier = 1;
    task.dropCursor = 0;
    task.nextDropAt = Date.now() + 1800;
    task.kennel = emptyKennel(chapter, task.kennel && task.kennel.level);
  }
  if (inRange) rememberArchivedCollections(reserve, task);
  task.kennel = normalizeKennel(task.kennel, inRange ? chapter : task.chapter);
  reserve.extinctionClueTask = task;
  return task;
}

const DROP_POINT_GAP = 0.1;

function dropPointTaken(points, x, y, gap = DROP_POINT_GAP) {
  return (points || []).some((point) => {
    const px = Number(point && point.x);
    const py = Number(point && point.y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) return false;
    return Math.hypot(px - x, py - y) < gap;
  });
}

function mapDropPoints(reserve = {}) {
  return ((((reserve.ecologyEconomy || {}).mapDrops) || []))
    .map((drop) => ({ x: Number(drop.x), y: Number(drop.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

function preferredMissingItem(reserve, missing, cursor) {
  const ranked = missing.slice().sort((a, b) => archiveBoxCount(reserve, a.id) - archiveBoxCount(reserve, b.id));
  const lowest = archiveBoxCount(reserve, ranked[0].id);
  const tied = ranked.filter((item) => archiveBoxCount(reserve, item.id) === lowest);
  return tied[Math.max(0, cursor) % tied.length];
}

function placeArchiveDrop(reserve, task, item, nowMs, random, pointList) {
  const occupied = mapDropPoints(reserve);
  let slotX = pointList[0][0];
  let slotY = pointList[0][1];
  let placed = false;
  for (let step = 0; step < pointList.length; step += 1) {
    let nextX = pointList[step][0];
    let nextY = pointList[step][1];
    if (Math.abs(nextX - HOUND_KENNEL.x) < 0.08 && Math.abs(nextY - HOUND_KENNEL.y) < 0.08) {
      nextX = Math.min(0.86, nextX + 0.14);
    }
    if (dropPointTaken(occupied, nextX, nextY)) continue;
    slotX = nextX;
    slotY = nextY;
    placed = true;
    break;
  }
  if (!placed) {
    slotX = Math.min(0.86, pointList[0][0] + 0.12);
    slotY = pointList[0][1];
  }
  const life = DROP_LIFE_MIN_MS + Math.floor(random() * (DROP_LIFE_MAX_MS - DROP_LIFE_MIN_MS + 1));
  const drop = Object.assign({}, item, {
    x: slotX,
    y: slotY,
    spawnedAt: nowMs,
    expiresAt: nowMs + life
  });
  delete drop.renderX;
  delete drop.renderY;
  task.drops = [drop];
  task.dropCursor = Math.max(0, Math.round(Number(task.dropCursor) || 0)) + 1;
  return drop;
}

function extinctionClueVisibleDrops(reserve = {}) {
  const task = tickExtinctionClueDrops(reserve, Date.now());
  const chapter = currentChapter(reserve);
  if (!archiveChapterActive(chapter) || task.chapter !== chapter || task.status !== "active") return [];
  return task.drops.slice();
}

function tickExtinctionClueDrops(reserve = {}, now = Date.now(), random = Math.random) {
  const task = ensureExtinctionClueTask(reserve);
  const chapter = currentChapter(reserve);
  const nowMs = Math.max(0, Math.round(Number(now) || Date.now()));
  if (!archiveChapterActive(chapter) || task.chapter !== chapter || task.status !== "active") {
    reserve.extinctionClueTask = task;
    return task;
  }
  task.drops = (task.drops || []).filter((drop) => Number(drop.expiresAt) > nowMs).slice(0, 1);
  const chapterItems = clueItemsForChapter(chapter);
  const held = (item) => task.collectedIds.includes(item.id) || archiveBoxCount(reserve, item.id) >= 1;
  const unmet = chapterItems.filter((item) => !held(item));
  // 已经捡到的种类不再回到沙盘。它会占住唯一的掉落位置，十几秒后自己消失。
  let replacingHeld = false;
  if (unmet.length && task.drops.some((drop) => held(drop))) {
    task.drops = [];
    task.nextDropAt = nowMs;
    replacingHeld = true;
  }
  const notOnBoard = (item) => !task.drops.some((drop) => drop.id === item.id);
  const missing = unmet.filter(notOnBoard);
  const pool = missing;
  if (!pool.length || task.drops.length) {
    reserve.extinctionClueTask = task;
    return task;
  }
  const profile = kennelDropProfile(task.kennel && task.kennel.level);
  const boost = Math.max(1, Number(task.dropMultiplier) || 1);
  const gap = Math.max(4000, Math.round(profile.gapMs / boost));
  if (!task.nextDropAt) task.nextDropAt = nowMs + 1800;
  if (nowMs < task.nextDropAt) {
    reserve.extinctionClueTask = task;
    return task;
  }
  task.nextDropAt = nowMs + gap;
  const chance = Math.min(1, profile.chance * boost);
  if (replacingHeld || random() < chance) {
    const cursor = Math.max(0, Math.round(Number(task.dropCursor) || 0));
    let item = pool[cursor % pool.length];
    const bias = boost > 1 ? Math.max(profile.precision, 0.8) : profile.precision;
    if (bias > 0 && missing.length && random() < bias) {
      item = boost > 1 ? preferredMissingItem(reserve, missing, cursor) : missing[cursor % missing.length];
    }
    const layouts = CLUE_LAYOUTS[(chapter - ARCHIVE_FIRST_CHAPTER) % CLUE_LAYOUTS.length]
      .concat(FALLBACK_DROP_POINTS);
    placeArchiveDrop(reserve, task, item, nowMs, random, layouts);
  }
  reserve.extinctionClueTask = task;
  return task;
}

function presentExtinctionClue(reserve = {}, clueId = "", now = Date.now()) {
  const task = ensureExtinctionClueTask(reserve);
  const item = clueItemsForChapter(task.chapter).find((entry) => entry.id === String(clueId || ""));
  if (!item || task.status === "completed" || task.collectedIds.includes(item.id)) return null;
  const stamp = Math.max(1, Math.round(Number(now) || Date.now()));
  task.status = "active";
  task.spawned = true;
  task.drops = [Object.assign({}, item, { spawnedAt: stamp, expiresAt: stamp + 10 * 60 * 1000 })];
  reserve.extinctionClueTask = task;
  return task.drops[0];
}

function houndArchiveSearchStatus(reserve = {}) {
  const task = ensureExtinctionClueTask(reserve);
  const chapter = currentChapter(reserve);
  const kennel = normalizeKennel(task.kennel, task.chapter || chapter);
  task.kennel = kennel;
  reserve.extinctionClueTask = task;
  const uses = kennel.freeRemaining + kennel.bonusRemaining;
  return {
    chapter: kennel.chapter,
    freeRemaining: kennel.freeRemaining,
    bonusRemaining: kennel.bonusRemaining,
    uses,
    adUsed: kennel.adUsed,
    canSearch: uses > 0,
    canWatchAd: uses <= 0 && !kennel.adUsed,
    multiplier: Math.max(1, Number(task.dropMultiplier) || 1),
    boosted: Number(task.dropMultiplier) > 1,
    level: kennelLevel(kennel.level)
  };
}

function spendHoundArchiveSearch(reserve = {}, now = Date.now()) {
  const status = houndArchiveSearchStatus(reserve);
  if (!status.canSearch) return { ok: false, reason: status.canWatchAd ? "needs_ad" : "no_uses", status };
  const task = reserve.extinctionClueTask;
  if (task.kennel.freeRemaining > 0) task.kennel.freeRemaining -= 1;
  else task.kennel.bonusRemaining -= 1;
  const profile = kennelDropProfile(task.kennel && task.kennel.level);
  const nowMs = Math.max(0, Math.round(Number(now) || Date.now()));
  task.dropMultiplier = profile.searchMultiplier;
  const chapterItems = clueItemsForChapter(task.chapter);
  const held = (item) => task.collectedIds.includes(item.id) || archiveBoxCount(reserve, item.id) >= 1;
  const missing = chapterItems.filter((item) => !held(item));
  if (missing.length && task.status === "active") {
    const cursor = Math.max(0, Math.round(Number(task.dropCursor) || 0));
    const item = preferredMissingItem(reserve, missing, cursor);
    placeArchiveDrop(reserve, task, item, nowMs, Math.random, KENNEL_SEARCH_POINTS);
  }
  const gap = Math.max(4000, Math.round(profile.gapMs / profile.searchMultiplier));
  task.nextDropAt = nowMs + gap;
  reserve.extinctionClueTask = task;
  const dropped = task.drops[0];
  return {
    ok: true,
    multiplier: profile.searchMultiplier,
    level: profile.level,
    dropped: dropped ? { id: dropped.id, name: dropped.name } : null,
    status: houndArchiveSearchStatus(reserve)
  };
}

function houndArchiveSearchCost(reserve = {}) {
  const task = ensureExtinctionClueTask(reserve);
  const profile = kennelDropProfile(task.kennel && task.kennel.level);
  const chapter = currentChapter(reserve);
  return {
    level: profile.level,
    dogFood: profile.dogFood,
    fund: Math.max(profile.fundBase, Math.round(profile.fundBase * paceOperatingInflation(chapter)))
  };
}

function kennelUpgradeQuote(level = 1, chapter = 3) {
  const current = kennelLevel(level);
  if (current >= KENNEL_MAX_LEVEL) return null;
  const next = current + 1;
  const minChapter = next === 2 ? ARCHIVE_FIRST_CHAPTER : 5;
  const base = next === 2 ? 640 : 1200;
  const n = Math.max(1, Math.round(Number(chapter) || 1));
  return {
    next,
    minChapter,
    base,
    cost: Math.max(1, Math.round(base * n * paceOperatingInflation(n)))
  };
}

function upgradeHoundKennel(reserve = {}) {
  const task = ensureExtinctionClueTask(reserve);
  const chapter = currentChapter(reserve);
  const level = kennelLevel(task.kennel && task.kennel.level);
  const quote = kennelUpgradeQuote(level, chapter);
  if (!quote) return { ok: false, reason: "maxed", level };
  if (chapter < quote.minChapter) return { ok: false, reason: "locked", level, quote };
  const before = Math.max(0, Number(reserve.fund) || 0);
  if (before < quote.cost) return { ok: false, reason: "fund", level, quote, short: quote.cost - before };
  reserve.fund = before - quote.cost;
  task.kennel.level = quote.next;
  if (Number(task.dropMultiplier) > 1) task.dropMultiplier = kennelDropProfile(quote.next).searchMultiplier;
  reserve.extinctionClueTask = task;
  return { ok: true, level: quote.next, cost: quote.cost, before, fund: reserve.fund };
}

function grantHoundArchiveAd(reserve = {}) {
  const status = houndArchiveSearchStatus(reserve);
  if (status.adUsed) return { ok: false, reason: "already_granted", status };
  if (status.uses > 0) return { ok: false, reason: "uses_left", status };
  const task = reserve.extinctionClueTask;
  task.kennel.adUsed = true;
  task.kennel.bonusRemaining = KENNEL_AD_GRANT;
  reserve.extinctionClueTask = task;
  return { ok: true, granted: KENNEL_AD_GRANT, status: houndArchiveSearchStatus(reserve) };
}

function collectExtinctionClue(reserve = {}, clueId = "") {
  const task = ensureExtinctionClueTask(reserve);
  const id = String(clueId || "");
  const items = clueItemsForChapter(task.chapter);
  if (task.status !== "active") return { ok: false, reason: "inactive" };
  const item = items.find((entry) => entry.id === id);
  if (!item || !task.drops.some((drop) => drop.id === id)) return { ok: false, reason: task.collectedIds.includes(id) ? "already_collected" : "unknown_clue" };
  const alreadyHad = task.collectedIds.includes(id);
  if (!alreadyHad) task.collectedIds = task.collectedIds.concat(id);
  task.drops = task.drops.filter((drop) => drop.id !== id);
  const profile = kennelDropProfile(task.kennel && task.kennel.level);
  const boost = Math.max(1, Number(task.dropMultiplier) || 1);
  const gap = Math.max(4000, Math.round(profile.gapMs / boost));
  task.nextDropAt = Date.now() + gap;
  task.lastCollection = { id, name: item.name, collectedAt: Date.now() };
  const complete = !isArchiveCatchupChapter(task.chapter) && task.collectedIds.length >= items.length;
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
  const active = task.status === "active" && task.chapter === chapter && archiveChapterActive(chapter);
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
    completed: task.status === "completed" && task.chapter === chapter,
    completedAt: Math.max(0, Number(task.completedAt) || 0),
    shownAt: task.status === "completed"
      ? Math.max(0, Number(task.completedAt) || 0)
      : Math.max(0, Number((task.lastCollection && task.lastCollection.collectedAt) || task.activatedAt) || 0)
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
  tickExtinctionClueDrops,
  presentExtinctionClue,
  collectExtinctionClue,
  extinctionClueTaskView,
  houndArchiveSearchStatus,
  spendHoundArchiveSearch,
  grantHoundArchiveAd,
  houndArchiveSearchCost,
  kennelDropProfile,
  kennelUpgradeQuote,
  upgradeHoundKennel,
  HOUND_DROP_MULTIPLIER,
  KENNEL_MAX_LEVEL,
  HOUND_KENNEL,
  KENNEL_FREE_USES,
  KENNEL_AD_GRANT,
  currentChapter,
  archiveChapterActive,
  isArchiveCatchupChapter
};
