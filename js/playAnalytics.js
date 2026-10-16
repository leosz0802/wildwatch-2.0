// Uploads the events the behavior dashboard actually counts.
// The only player label uploaded is an authorized WeChat nickname. Raw saves stay on the device.

const STORAGE_KEY = "wild_guard_behavior_analytics_v1";
const INSTALL_KEY = "wild_guard_analytics_install_id_v1";
const MAX_EVENTS = 240;
const MAX_PENDING = 80;
const MAX_DAYS = 45;
const FLUSH_BATCH = 20;
const FLUSH_DELAY_MS = 2000;
const PROP_KEYS = ["nickname", "screen", "from", "to", "action", "result", "reason", "chapter", "stage", "origin", "durationSec", "count", "success", "fund", "fundDelta", "water", "waterDelta", "grass", "grassDelta", "safety", "safetyDelta", "disease", "diseaseDelta", "animalTotal", "animalDelta", "speciesTotal", "speciesId", "speciesPopulation", "purchaseCost", "level", "chapterFrom", "chapterTo", "population"];

function dayKey(timestamp) {
  const date = new Date((Number(timestamp) || Date.now()) + 8 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function randomId(prefix, random = Math.random) {
  const time = Date.now().toString(36);
  const entropy = Math.floor(Math.max(0, Math.min(0x7fffffff, Number(random()) * 0x80000000))).toString(36);
  return `${prefix}_${time}_${entropy}`.slice(0, 64);
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function cleanString(value, max = 48) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
}

function cleanProps(input = {}) {
  const output = {};
  PROP_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(input, key)) return;
    const value = input[key];
    if (typeof value === "boolean") output[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) output[key] = Math.max(-100000, Math.min(100000, Math.round(value * 100) / 100));
    else if (typeof value === "string" && value) output[key] = cleanString(value);
  });
  return output;
}

function holdTimer(timer) {
  if (timer && typeof timer.unref === "function") timer.unref();
  return timer;
}

function emptyState() {
  return {
    version: 1,
    installId: "",
    firstSeenAt: 0,
    lastSeenAt: 0,
    sessions: 0,
    activeSeconds: 0,
    eventCounts: {},
    screenViews: {},
    actionCounts: {},
    chapterEntries: {},
    daily: {},
    events: [],
    pending: []
  };
}

class PlayAnalytics {
  constructor(runtime, options = {}) {
    this.runtime = runtime || {};
    this.endpoint = cleanString(options.endpoint || "", 240);
    this.enabled = options.enabled !== false;
    this.random = options.random || Math.random;
    this.now = options.now || Date.now;
    this.state = this.loadState();
    this.installId = this.readInstallId();
    this.sessionId = randomId("session", this.random);
    this.sessionStartedAt = this.now();
    this.persistTimer = null;
    this.flushTimer = null;
    this.flushPromise = null;
    this.state.installId = this.installId;
    this.state.sessions = Math.max(0, Math.round(this.state.sessions || 0)) + 1;
    this.state.firstSeenAt = this.state.firstSeenAt || this.sessionStartedAt;
    this.state.lastSeenAt = this.sessionStartedAt;
    this.track("session_start", {});
  }

  readStorage(key) {
    try { return this.runtime.getStorageSync ? this.runtime.getStorageSync(key) : null; } catch (error) { return null; }
  }

  writeStorage(key, value) {
    try {
      if (this.runtime.setStorageSync) this.runtime.setStorageSync(key, value);
    } catch (error) {
      // Storage failures must not stop the game.
    }
  }

  readInstallId() {
    const saved = cleanString(this.readStorage(INSTALL_KEY) || "", 64);
    if (/^wgai_[a-z0-9_]+$/.test(saved)) return saved;
    const created = randomId("wgai", this.random);
    this.writeStorage(INSTALL_KEY, created);
    return created;
  }

  loadState() {
    const saved = this.readStorage(STORAGE_KEY);
    if (!saved || typeof saved !== "object") return emptyState();
    const base = Object.assign(emptyState(), saved);
    base.eventCounts = Object.assign({}, saved.eventCounts || {});
    base.screenViews = Object.assign({}, saved.screenViews || {});
    base.actionCounts = Object.assign({}, saved.actionCounts || {});
    base.chapterEntries = Object.assign({}, saved.chapterEntries || {});
    base.daily = Object.assign({}, saved.daily || {});
    base.events = Array.isArray(saved.events) ? saved.events.slice(-MAX_EVENTS) : [];
    base.pending = Array.isArray(saved.pending) ? saved.pending.slice(-MAX_PENDING) : [];
    return base;
  }

  track(name, props = {}) {
    if (!this.enabled) return null;
    const eventName = cleanString(name, 48).replace(/[^a-zA-Z0-9_.-]/g, "_");
    if (!eventName) return null;
    const timestamp = this.now();
    const event = {
      id: randomId("event", this.random),
      name: eventName,
      timestamp,
      day: dayKey(timestamp),
      sessionId: this.sessionId,
      props: cleanProps(props)
    };
    this.state.lastSeenAt = timestamp;
    this.state.events = this.state.events.concat(event).slice(-MAX_EVENTS);
    this.state.pending = this.state.pending.concat(event).slice(-MAX_PENDING);
    this.state.eventCounts[eventName] = (this.state.eventCounts[eventName] || 0) + 1;
    const day = this.state.daily[event.day] || { events: 0, sessions: 0, activeSeconds: 0 };
    day.events += 1;
    if (eventName === "session_start") day.sessions += 1;
    if (eventName === "screen_view" && event.props.screen) this.state.screenViews[event.props.screen] = (this.state.screenViews[event.props.screen] || 0) + 1;
    if (eventName === "action_complete" && event.props.action) this.state.actionCounts[event.props.action] = (this.state.actionCounts[event.props.action] || 0) + 1;
    if (eventName === "chapter_view" && event.props.chapter != null) {
      const chapter = String(event.props.chapter);
      this.state.chapterEntries[chapter] = (this.state.chapterEntries[chapter] || 0) + 1;
    }
    this.state.daily[event.day] = day;
    this.pruneDays(event.day);
    this.schedulePersist();
    if (this.state.pending.length >= FLUSH_BATCH) this.flush();
    else this.scheduleFlush();
    return event;
  }

  pruneDays(today) {
    const keys = Object.keys(this.state.daily).sort();
    while (keys.length > MAX_DAYS) delete this.state.daily[keys.shift()];
    if (!this.state.daily[today]) this.state.daily[today] = { events: 0, sessions: 0, activeSeconds: 0 };
  }

  endSession(reason = "hide", extra = {}) {
    const elapsed = Math.round(Math.max(0, (this.now() - this.sessionStartedAt) / 1000));
    const chapter = Math.round(Number(extra && extra.chapter));
    this.track("session_end", {
      reason,
      durationSec: Math.min(1800, elapsed),
      ...(Number.isInteger(chapter) && chapter > 0 ? { chapter } : {})
    });
    this.persist();
    return this.flush();
  }

  resumeSession() {
    this.sessionId = randomId("session", this.random);
    this.sessionStartedAt = this.now();
    this.state.sessions = Math.max(0, Math.round(this.state.sessions || 0)) + 1;
    this.track("session_start", { reason: "resume" });
  }

  schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = holdTimer(setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, 1200));
  }

  scheduleFlush() {
    if (!this.endpoint || !this.runtime.request || this.flushTimer || !this.state.pending.length) return;
    this.flushTimer = holdTimer(setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, FLUSH_DELAY_MS));
  }

  persist() {
    this.writeStorage(STORAGE_KEY, this.state);
  }

  flush() {
    if (!this.endpoint || !this.runtime.request || this.flushPromise || !this.state.pending.length) return Promise.resolve(false);
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    const batch = this.state.pending.slice(0, FLUSH_BATCH);
    this.flushPromise = new Promise((resolve) => {
      try {
        this.runtime.request({
          url: this.endpoint,
          method: "POST",
          header: { "content-type": "application/json", accept: "application/json" },
          data: { version: 1, installId: this.installId, events: batch },
          timeout: 5000,
          success: (response = {}) => {
            if (Number(response.statusCode) >= 200 && Number(response.statusCode) < 300) {
              this.state.pending = this.state.pending.slice(batch.length);
              this.persist();
              if (this.state.pending.length) this.scheduleFlush();
              resolve(true);
            } else resolve(false);
          },
          fail: () => resolve(false)
        });
      } catch (error) { resolve(false); }
    }).finally(() => { this.flushPromise = null; });
    return this.flushPromise;
  }
}

module.exports = {
  PlayAnalytics,
  dayKey,
  cleanProps,
  finite
};
