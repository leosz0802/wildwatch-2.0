function integer(value) { return Math.max(0, Math.round(Number(value) || 0)); }
function top10Snapshot(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && row.id)
    .slice()
    .sort((a, b) => integer(a.rank || 999999) - integer(b.rank || 999999) || integer(b.valuation || b.rating) - integer(a.valuation || a.rating))
    .slice(0, 10)
    .map((row, index) => ({
      id: String(row.id).slice(0, 64),
      name: String(row.name || row.reserveName || row.owner || "未命名保护区").slice(0, 40),
      rank: integer(row.rank) || index + 1,
      animals: integer(row.animals),
      valuation: integer(row.valuation || row.rating)
    }));
}
function compareTop10(previous = [], current = []) {
  const before = top10Snapshot(previous);
  const after = top10Snapshot(current);
  if (!before.length) return { changed: false, seeded: true, entered: [], exited: [], animalChanges: [], moves: [], before, after };
  const beforeById = Object.fromEntries(before.map((row) => [row.id, row]));
  const afterById = Object.fromEntries(after.map((row) => [row.id, row]));
  const entered = after.filter((row) => !beforeById[row.id]);
  const exited = before.filter((row) => !afterById[row.id]);
  const animalChanges = after.filter((row) => beforeById[row.id] && row.animals !== beforeById[row.id].animals)
    .map((row) => ({ id: row.id, name: row.name, before: beforeById[row.id].animals, after: row.animals, delta: row.animals - beforeById[row.id].animals }));
  const moves = after.filter((row) => beforeById[row.id] && row.rank !== beforeById[row.id].rank)
    .map((row) => ({ id: row.id, name: row.name, before: beforeById[row.id].rank, after: row.rank }));
  return { changed: !!(entered.length || exited.length || animalChanges.length || moves.length), seeded: false, entered, exited, animalChanges, moves, before, after };
}
function formatTop10Broadcast(diff = {}) {
  const parts = [];
  if (diff.entered && diff.entered.length) diff.entered.forEach((row) => parts.push(`进榜：${row.name}（#${row.rank}）`));
  if (diff.exited && diff.exited.length) diff.exited.forEach((row) => parts.push(`出榜：${row.name}`));
  if (diff.animalChanges && diff.animalChanges.length) diff.animalChanges.forEach((row) => parts.push(`动物数量：${row.name} ${row.delta > 0 ? "+" : ""}${row.delta}只`));
  if (diff.moves && diff.moves.length && !parts.length) diff.moves.forEach((row) => parts.push(`名次变化：${row.name} #${row.before}→#${row.after}`));
  return parts.join("\n") || "Top 10 暂无变化";
}
function formatTop10List(rows = []) {
  const list = top10Snapshot(rows);
  if (!list.length) return "世界榜 Top 10 暂无数据";
  return list.map((row) => `#${row.rank} ${row.name} · 动物${row.animals}只 · 市值${row.valuation}`).join("\n");
}
function isWorldTop10Letter(letter = {}) {
  if (String(letter.openTarget || "") === "world") return true;
  return /^world_top10_/.test(String(letter.id || ""));
}
module.exports = { top10Snapshot, compareTop10, formatTop10Broadcast, formatTop10List, isWorldTop10Letter };
