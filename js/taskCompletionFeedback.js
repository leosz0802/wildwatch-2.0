// Presentation-only tracking: never awards rewards or changes task progress.
const COMPLETE_COLOR = '#168447';
function metricProgress(value, target) {
  const current = Math.max(0, Number(value) || 0);
  const goal = Math.max(0, Number(target) || 0);
  const complete = goal > 0 && current >= goal;
  return { complete, percentage: goal ? (complete ? 100 : Math.min(99, Math.round(current / goal * 100))) : 0,
    color: complete ? COMPLETE_COLOR : '#8b7355' };
}
function completedTaskEntries(state = {}) {
  const world = state.world || {}, reserve = world.reserve || {};
  const entries = [];
  const add = (key, title, extra) => {
    if (!key || !title) return;
    entries.push(extra && typeof extra === "object" ? Object.assign({ key, title }, extra) : { key, title });
  };
  ((world.goals || {}).history || []).forEach(item => {
    // Core/full are the same daily batch reward, not additional player tasks.
    if (!item || ['daily_core', 'daily_full'].includes(item.type)) return;
    // Instant rewards are issued per action, even halfway through a daily
    // objective. Only its daily_objective entry represents task completion.
    if (item.type === 'instant' && /^(daily:|rescue:|chapter:.*:rescue:)/.test(item.id || '')) return;
    add(`goal:${item.dateKey || ''}:${item.type}:${item.id}`, item.title);
  });
  const rescue = reserve.chapterRescue || {};
  Object.values(rescue.animals || {}).concat(rescue.targets || [], (reserve.poacherRescue || {}).history || []).forEach(item => {
    if (item && item.status === 'rescued' && item.rescuedAt && !item.legacyOnly)
      add(`rescue:${item.targetId || item.speciesId}:${item.rescuedAt}`, `解救${item.speciesName || item.speciesId}`);
  });
  ((reserve.emergency || {}).history || []).forEach(item => {
    if (item && item.id && item.success !== false && item.kind === 'resolved') {
      const realNature = String(item.type || "").startsWith("real_nature_") || item.category === "realNature";
      const impactChanges = realNature
        ? ((item.businessChange || {}).impactChanges || []).filter((change) => change && (change.label || change.metric)).slice(0, 2)
        : [];
      add(`event:${item.id}`, item.title, realNature ? { impactChanges, realNature: true } : null);
    }
  });
  return entries;
}
class TaskCompletionFeedback {
  constructor(entries = []) {
    this.seen = new Set(entries.map(item => item.key));
    this.pending = [];
    this.resultModals = new WeakSet();
  }
  collect(entries) {
    entries.forEach(item => {
      if (!item.key || !item.title || this.seen.has(item.key)) return;
      this.seen.add(item.key);
      this.pending.push(item);
    });
  }
  absorb(keys = []) {
    const skip = new Set((keys || []).filter(Boolean));
    skip.forEach((key) => this.seen.add(key));
    this.pending = this.pending.filter((item) => !skip.has(item.key));
  }
  take() { return this.pending.shift() || null; }
}
module.exports = { COMPLETE_COLOR, metricProgress, completedTaskEntries, TaskCompletionFeedback };
