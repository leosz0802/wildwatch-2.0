#!/usr/bin/env node
// Local behavior analytics console. Dependency-free Node.js server.
// Run: node analytics/server.js

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const HOST = process.env.ANALYTICS_HOST || "127.0.0.1";
const PORT = Math.max(1024, Math.min(65535, Number(process.env.ANALYTICS_PORT) || 3217));
const DATA_DIR = process.env.ANALYTICS_DATA_DIR ? path.resolve(process.env.ANALYTICS_DATA_DIR) : path.join(__dirname, "data");
const EVENTS_FILE = path.join(DATA_DIR, "events.jsonl");
const MAX_BODY = 256 * 1024;
const MAX_EVENTS_PER_REQUEST = 80;
const MAX_EVENT_STRING = 80;
const VALID_NAMES = /^[a-zA-Z0-9_.-]{1,48}$/;

fs.mkdirSync(DATA_DIR, { recursive: true });

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type"
  });
  res.end(body);
}

function cleanString(value, max = MAX_EVENT_STRING) {
  return String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
}

function cleanProps(input) {
  const allowed = new Set(["screen", "from", "to", "action", "result", "reason", "chapter", "stage", "origin", "durationSec", "count", "success", "fund", "fundDelta", "water", "waterDelta", "grass", "grassDelta", "safety", "safetyDelta", "disease", "diseaseDelta", "animalTotal", "animalDelta", "speciesTotal", "speciesId", "speciesPopulation", "purchaseCost", "level", "chapterFrom", "chapterTo", "population", "nickname"]);
  const output = {};
  ["nickname"].concat(Object.keys(input || {}).filter((key) => key !== "nickname")).slice(0, 16).forEach((key) => {
    if (!allowed.has(key)) return;
    const value = input[key];
    if (typeof value === "boolean") output[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) output[key] = Math.max(-100000, Math.min(100000, Math.round(value * 100) / 100));
    else if (typeof value === "string") output[key] = cleanString(value);
  });
  return output;
}

function anonymousId(value) {
  // Keep the identifier stable for aggregation without exposing the client's raw id.
  return crypto.createHash("sha256").update(cleanString(value, 128)).digest("hex").slice(0, 16);
}

const GAME_DB = process.env.WILD_GAME_DB || "/var/lib/wild-guard-api/wild.sqlite";
let publishedCache = { at: 0, rows: [] };

function chinaDay(offset = 0) {
  return new Date(Date.now() + 8 * 60 * 60 * 1000 - offset * 86400000).toISOString().slice(0, 10);
}

function loginWeek(daySet) {
  return Array.from({ length: 7 }, (_, offset) => {
    const day = chinaDay(offset);
    return { label: offset === 0 ? "今天" : `前第${offset}日`, day, loggedIn: !!(daySet && daySet.has(day)) };
  });
}

function sqliteJson(sql) {
  if (!fs.existsSync(GAME_DB)) return null;
  const out = execFileSync("sqlite3", ["-json", GAME_DB, sql], { encoding: "utf8", timeout: 8000, maxBuffer: 8 * 1024 * 1024 });
  const rows = JSON.parse(out || "[]");
  return Array.isArray(rows) ? rows : [];
}

const STORY_CHAPTERS = 11;
let storyChapterCache = { at: 0, buckets: null };

function resolveStoryChapters(storyRows = [], leaveRows = []) {
  const reached = new Map();
  const take = (row, leave) => {
    const pid = cleanString(row && row.pid, 128);
    const chapter = Math.round(Number(row && row.chapter));
    const at = Number(row && row.at) || 0;
    if (!pid || !Number.isFinite(chapter) || chapter < 1) return;
    const prev = reached.get(pid);
    if (leave) {
      if (!prev || !prev.leave || at >= prev.at) reached.set(pid, { chapter, at, leave: true });
      return;
    }
    if (prev && (prev.leave || prev.at > at)) return;
    reached.set(pid, { chapter, at, leave: false });
  };
  (storyRows || []).forEach((row) => take(row, false));
  (leaveRows || []).forEach((row) => take(row, true));
  const chapters = new Map();
  reached.forEach((value, pid) => chapters.set(pid, value.chapter));
  return chapters;
}

function loadStoryChapterBuckets() {
  if (storyChapterCache.buckets && Date.now() - storyChapterCache.at < 15000) return storyChapterCache.buckets;
  const recorded = sqliteJson("SELECT e.user_id AS pid, CAST(json_extract(e.payload,'$.chapter') AS INTEGER) AS chapter, e.created_at AS at FROM events e WHERE e.event_name IN ('narrative.beat_view','narrative.hook_view') AND json_extract(e.payload,'$.kind')='chapter' AND NULLIF(e.user_id,'') IS NOT NULL;");
  const leaves = sqliteJson("SELECT e.user_id AS pid, CAST(json_extract(e.payload,'$.chapter') AS INTEGER) AS chapter, e.created_at AS at FROM events e WHERE e.event_name='chapter.leave' AND json_extract(e.payload,'$.kind')='chapter' AND NULLIF(e.user_id,'') IS NOT NULL;");
  const players = sqliteJson("SELECT u.user_id AS pid, COALESCE(NULLIF(u.display_name,''),'未命名') AS nickname FROM users u WHERE EXISTS (SELECT 1 FROM scores s WHERE s.user_id=u.user_id) OR EXISTS (SELECT 1 FROM events e WHERE e.user_id=u.user_id);");
  if (!recorded || !leaves || !players) return null;
  const reached = resolveStoryChapters(recorded, leaves);
  const recentRows = sqliteJson("SELECT DISTINCT e.user_id AS pid FROM events e WHERE NULLIF(e.user_id,'') IS NOT NULL AND date(e.created_at/1000,'unixepoch','+8 hours') >= date('now','+8 hours','-6 days');") || [];
  const recentIds = new Set(recentRows.map((row) => cleanString(row && row.pid, 128)).filter(Boolean));
  const yesterdayRows = sqliteJson("SELECT DISTINCT e.user_id AS pid FROM events e WHERE NULLIF(e.user_id,'') IS NOT NULL AND date(e.created_at/1000,'unixepoch','+8 hours') = date('now','+8 hours','-1 day');") || [];
  const yesterdayIds = new Set(yesterdayRows.map((row) => cleanString(row && row.pid, 128)).filter(Boolean));
  const buckets = Array.from({ length: STORY_CHAPTERS }, () => ({ users: 0, recent: [], yesterday: 0 }));
  players.forEach((row) => {
    const pid = cleanString(row && row.pid, 128);
    if (!pid) return;
    const raw = reached.get(pid) || 1;
    const chapter = Math.max(1, Math.min(STORY_CHAPTERS, raw));
    const bucket = buckets[chapter - 1];
    bucket.users += 1;
    if (recentIds.has(pid)) bucket.recent.push(cleanString(row && row.nickname, 48) || "未命名");
    if (yesterdayIds.has(pid)) bucket.yesterday += 1;
  });
  buckets.forEach((bucket) => bucket.recent.sort((a, b) => a.localeCompare(b, "zh")));
  storyChapterCache = { at: Date.now(), buckets };
  return buckets;
}

function historicalChapterReach() {
  try {
    const buckets = loadStoryChapterBuckets();
    if (!buckets) return null;
    return buckets.map((bucket, index) => ({ chapter: String(index + 1), users: bucket.users, recentUsers: bucket.recent.length, yesterdayUsers: bucket.yesterday }));
  } catch (error) {
    return null;
  }
}

function historicalNicknames(chapter) {
  const level = Math.round(Number(chapter));
  if (!Number.isInteger(level) || level < 1 || level > STORY_CHAPTERS) return [];
  try {
    const buckets = loadStoryChapterBuckets();
    return buckets ? buckets[level - 1].recent.slice() : [];
  } catch (error) {
    return [];
  }
}

function readPublishedPresence() {
  if (Date.now() - publishedCache.at < 4000) return publishedCache.rows;
  if (!fs.existsSync(GAME_DB)) return publishedCache.rows;
  const sql = "SELECT date(e.created_at/1000,'unixepoch','+8 hours') AS day, COALESCE(NULLIF(e.user_id,''), e.install_hash) AS pid, COALESCE(NULLIF(u.display_name,''),'未命名') AS nickname, s.level AS chapter, s.fund AS fund, s.animals AS animalTotal FROM events e LEFT JOIN users u ON u.user_id=NULLIF(e.user_id,'') LEFT JOIN scores s ON s.user_id=NULLIF(e.user_id,'') WHERE e.created_at >= (strftime('%s','now') - 8*86400) * 1000 AND (NULLIF(e.user_id,'') IS NOT NULL OR NOT EXISTS (SELECT 1 FROM events named WHERE named.install_hash=e.install_hash AND NULLIF(named.user_id,'') IS NOT NULL AND date(named.created_at/1000,'unixepoch','+8 hours')=date(e.created_at/1000,'unixepoch','+8 hours'))) GROUP BY day, pid;";
  try {
    const out = execFileSync("sqlite3", ["-json", GAME_DB, sql], { encoding: "utf8", timeout: 4000, maxBuffer: 4 * 1024 * 1024 });
    const rows = JSON.parse(out || "[]");
    publishedCache = { at: Date.now(), rows: Array.isArray(rows) ? rows : [] };
  } catch (error) {
    publishedCache = { at: Date.now(), rows: publishedCache.rows };
  }
  return publishedCache.rows;
}

function publishedPlayers() {
  const players = new Map();
  readPublishedPresence().forEach((row) => {
    const pid = cleanString(row && row.pid, 128);
    if (!pid || !row.day) return;
    const id = crypto.createHash("sha256").update(`published:${pid}`).digest("hex").slice(0, 16);
    const player = players.get(id) || { id, nickname: "未命名", chapter: null, fund: null, animalTotal: null, days: new Set() };
    player.days.add(String(row.day));
    if (row.nickname) player.nickname = cleanString(row.nickname, 48);
    const chapter = Number(row.chapter);
    const fund = Number(row.fund);
    const animals = Number(row.animalTotal);
    if (row.chapter != null && Number.isFinite(chapter) && chapter > 0) player.chapter = Math.round(chapter);
    if (row.fund != null && Number.isFinite(fund)) player.fund = Math.round(fund);
    if (row.animalTotal != null && Number.isFinite(animals)) player.animalTotal = Math.round(animals);
    players.set(id, player);
  });
  return players;
}

function namedLogin(value) {
  const name = cleanString(value, 48);
  return name && name !== "未命名" ? name : "";
}

function loginFundsMatch(client, server) {
  return client && server
    && client.fund != null && server.fund != null && Number(client.fund) === Number(server.fund)
    && client.animalTotal != null && server.animalTotal != null && Number(client.animalTotal) === Number(server.animalTotal);
}

function matchClientLogin(client, users, used) {
  const name = namedLogin(client && client.nickname);
  if (name) return users.findIndex((user, index) => !used.has(index) && namedLogin(user.nickname) === name);
  return users.findIndex((user, index) => !used.has(index) && loginFundsMatch(client, user));
}

function applyClientLogin(server, client) {
  return Object.assign({}, server, {
    screen: client.screen || server.screen || "",
    water: client.water != null ? client.water : server.water,
    grass: client.grass != null ? client.grass : server.grass,
    safety: client.safety != null ? client.safety : server.safety,
    disease: client.disease != null ? client.disease : server.disease
  });
}

function mergeDailyLogins(summary, players = publishedPlayers()) {
  const clientByDay = new Map((summary.dailyLogins || []).map((day) => [day.day, (day.users || []).slice()]));
  const byDay = new Map();
  players.forEach((player) => {
    const next = {
      id: player.id,
      nickname: player.nickname || "未命名",
      chapter: player.chapter,
      fund: player.fund,
      screen: "",
      animalTotal: player.animalTotal,
      water: null,
      grass: null,
      safety: null,
      disease: null,
      week: loginWeek(player.days)
    };
    player.days.forEach((day) => {
      const users = byDay.get(day) || [];
      users.push(Object.assign({}, next));
      byDay.set(day, users);
    });
  });
  new Set([...byDay.keys(), ...clientByDay.keys()]).forEach((day) => {
    const servers = byDay.get(day) || [];
    const clients = clientByDay.get(day) || [];
    if (!servers.length) {
      byDay.set(day, clients);
      return;
    }
    const used = new Set();
    clients.forEach((client) => {
      const index = matchClientLogin(client, servers, used);
      if (index < 0) return;
      used.add(index);
      servers[index] = applyClientLogin(servers[index], client);
    });
    byDay.set(day, servers);
  });
  const historyDays = Array.from(byDay.keys());
  const visibleDays = [chinaDay(0), chinaDay(1)];
  summary.dailyLogins = visibleDays.map((day) => ({
    day,
    users: (byDay.get(day) || []).map((user) => {
      if (!user.id) user.id = crypto.createHash("sha256").update(`row:${user.nickname}:${user.fund}:${user.animalTotal}`).digest("hex").slice(0, 16);
      if (!user.week) {
        const seen = new Set();
        historyDays.forEach((otherDay) => {
          if ((byDay.get(otherDay) || []).some((item) => item.id === user.id || (item.nickname === user.nickname && item.fund === user.fund && item.animalTotal === user.animalTotal))) seen.add(otherDay);
        });
        user.week = loginWeek(seen);
      }
      return user;
    })
  }));
  const counts = new Map(summary.dailyLogins.map((day) => [day.day, day.users.length]));
  (summary.daily || []).forEach((row) => {
    if (counts.has(row.day)) row.users = Math.max(Number(row.users) || 0, counts.get(row.day));
  });
  const todayCount = counts.get(chinaDay(0));
  if (todayCount) summary.users = Math.max(Number(summary.users) || 0, todayCount);
  return summary;
}

function readEvents() {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  return fs.readFileSync(EVENTS_FILE, "utf8").split("\n").filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch (error) { return null; }
  }).filter(Boolean);
}

function appendEvents(events) {
  if (!events.length) return;
  fs.appendFileSync(EVENTS_FILE, events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf8");
}

function normalizeEvents(payload) {
  if (!payload || !Array.isArray(payload.events)) return [];
  const installId = anonymousId(payload.installId || "anonymous");
  return payload.events.slice(0, MAX_EVENTS_PER_REQUEST).map((raw) => {
    const name = cleanString(raw && raw.name, 48);
    if (!VALID_NAMES.test(name)) return null;
    return {
      id: cleanString(raw.id, 80),
      name,
      timestamp: Number.isFinite(Number(raw.timestamp)) ? Number(raw.timestamp) : Date.now(),
      day: cleanString(raw.day, 16),
      sessionId: anonymousId(raw.sessionId || "session"),
      installId,
      props: cleanProps(raw.props || {}),
      receivedAt: Date.now()
    };
  }).filter(Boolean);
}

function summarize(events) {
  const users = new Set();
  const sessions = new Set();
  const eventCounts = {};
  const screens = {};
  const actions = {};
  const chapters = {};
  const chapterUsers = {};
  const internal = {
    fund: { samples: 0, sum: 0, min: null, max: null, last: null },
    animals: { samples: 0, sum: 0, min: null, max: null, last: null, speciesSamples: 0 },
    species: {},
    ecology: { samples: 0, waterSum: 0, grassSum: 0, safetySum: 0, diseaseSum: 0 },
    actionEconomy: {}
  };
  const addMetric = (bucket, value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    bucket.samples += 1;
    bucket.sum += number;
    bucket.min = bucket.min == null ? number : Math.min(bucket.min, number);
    bucket.max = bucket.max == null ? number : Math.max(bucket.max, number);
    bucket.last = number;
  };
  const daily = {};
  const loginByDay = {};
  const blankLogin = () => ({ nickname: "", chapter: null, fund: null, screen: "", animalTotal: null, water: null, grass: null, safety: null, disease: null, at: 0 });
  const rounded = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : null;
  };
  const writeLogin = (row, event) => {
    const props = event.props || {};
    const at = Number(event.timestamp) || 0;
    if (at < row.at) {
      if (props.nickname && !row.nickname) row.nickname = props.nickname;
      return;
    }
    if (props.nickname) row.nickname = props.nickname;
    const chapter = rounded(props.chapter);
    const fund = rounded(props.fund);
    if (chapter != null) row.chapter = chapter;
    if (fund != null) row.fund = fund;
    ["animalTotal", "water", "grass", "safety", "disease"].forEach((key) => {
      const value = rounded(props[key]);
      if (value != null) row[key] = value;
    });
    if (props.screen) row.screen = props.screen;
    row.at = at;
  };
  let activeSeconds = 0;
  events.forEach((event) => {
    users.add(event.installId);
    sessions.add(`${event.installId}:${event.sessionId}`);
    eventCounts[event.name] = (eventCounts[event.name] || 0) + 1;
    const day = event.day || new Date((Number(event.timestamp) || Date.now()) + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    daily[day] = daily[day] || { events: 0, users: new Set(), sessions: new Set(), activeSeconds: 0 };
    daily[day].events += 1;
    daily[day].users.add(event.installId);
    daily[day].sessions.add(`${event.installId}:${event.sessionId}`);
    if (event.name === "screen_view" && event.props.screen) screens[event.props.screen] = (screens[event.props.screen] || 0) + 1;
    if (event.name === "action_complete" && event.props.action) actions[event.props.action] = (actions[event.props.action] || 0) + 1;
    if (event.name === "chapter_view" && event.props.chapter != null) chapters[String(event.props.chapter)] = (chapters[String(event.props.chapter)] || 0) + 1;
    if ((event.name === "chapter_view" || event.name === "chapter_transition" || event.name === "economy_snapshot") && event.props.chapter != null) {
      const chapter = String(event.props.chapter);
      chapterUsers[chapter] = chapterUsers[chapter] || new Set();
      chapterUsers[chapter].add(event.installId);
    }
    if (event.name === "economy_snapshot" || event.name === "animal_world_view") {
      addMetric(internal.fund, event.props.fund);
      addMetric(internal.animals, event.props.animalTotal);
      if (Number.isFinite(Number(event.props.speciesTotal))) internal.animals.speciesSamples += 1;
      const ecologySample = ["water", "grass", "safety", "disease"].some((key) => Number.isFinite(Number(event.props[key])));
      const loginDay = loginByDay[day];
      const loginRow = loginDay && loginDay[event.installId || "anonymous"];
      if (loginRow) writeLogin(loginRow, event);
      if (ecologySample) {
        internal.ecology.samples += 1;
        internal.ecology.waterSum += Number(event.props.water) || 0;
        internal.ecology.grassSum += Number(event.props.grass) || 0;
        internal.ecology.safetySum += Number(event.props.safety) || 0;
        internal.ecology.diseaseSum += Number(event.props.disease) || 0;
      }
      if (event.props.action) {
        const action = event.props.action;
        const item = internal.actionEconomy[action] || { samples: 0, fundDelta: 0, animalDelta: 0 };
        item.samples += 1;
        item.fundDelta += Number(event.props.fundDelta) || 0;
        item.animalDelta += Number(event.props.animalDelta) || 0;
        internal.actionEconomy[action] = item;
      }
    }
    if (event.name === "animal_species_snapshot" && event.props.speciesId) {
      const speciesId = event.props.speciesId;
      const item = internal.species[speciesId] || { samples: 0, sum: 0, last: null };
      const population = Number(event.props.speciesPopulation != null ? event.props.speciesPopulation : event.props.population);
      if (Number.isFinite(population)) { item.samples += 1; item.sum += population; item.last = population; }
      internal.species[speciesId] = item;
    }
    if (event.name === "player_login") {
      const loginDay = loginByDay[day] || (loginByDay[day] = {});
      const loginId = event.installId || "anonymous";
      const row = loginDay[loginId] || blankLogin();
      writeLogin(row, event);
      loginDay[loginId] = row;
    }
    if (event.name === "session_end") {
      const duration = Math.max(0, Math.min(1800, Number(event.props.durationSec) || 0));
      activeSeconds += duration;
      daily[day].activeSeconds += duration;
    }
  });
  const top = (values) => Object.entries(values).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const dailyRows = Object.keys(daily).sort().slice(-45).map((day) => ({
    day,
    events: daily[day].events,
    users: daily[day].users.size,
    sessions: daily[day].sessions.size,
    activeSeconds: Math.round(daily[day].activeSeconds)
  }));
  const average = (bucket) => bucket.samples ? Math.round((bucket.sum / bucket.samples) * 100) / 100 : 0;
  const internalSummary = {
    fund: Object.assign({}, internal.fund, { average: average(internal.fund) }),
    animals: Object.assign({}, internal.animals, { average: average(internal.animals) }),
    species: Object.entries(internal.species).map(([speciesId, item]) => [speciesId, { samples: item.samples, average: item.samples ? Math.round(item.sum / item.samples * 100) / 100 : 0, last: item.last }]).sort((a, b) => (b[1].last || 0) - (a[1].last || 0)),
    ecology: {
      samples: internal.ecology.samples,
      waterAverage: internal.ecology.samples ? Math.round(internal.ecology.waterSum / internal.ecology.samples * 100) / 100 : 0,
      grassAverage: internal.ecology.samples ? Math.round(internal.ecology.grassSum / internal.ecology.samples * 100) / 100 : 0,
      safetyAverage: internal.ecology.samples ? Math.round(internal.ecology.safetySum / internal.ecology.samples * 100) / 100 : 0,
      diseaseAverage: internal.ecology.samples ? Math.round(internal.ecology.diseaseSum / internal.ecology.samples * 100) / 100 : 0
    },
    chapterReach: Object.entries(chapterUsers).map(([chapter, users]) => [chapter, users.size]).sort((a, b) => Number(a[0]) - Number(b[0])),
    actionEconomy: Object.entries(internal.actionEconomy).map(([action, item]) => [action, {
      samples: item.samples,
      averageFundDelta: Math.round(item.fundDelta / item.samples * 100) / 100,
      averageAnimalDelta: Math.round(item.animalDelta / item.samples * 100) / 100
    }]).sort((a, b) => b[1].samples - a[1].samples)
  };
  return {
    generatedAt: Date.now(),
    users: users.size,
    sessions: sessions.size,
    events: events.length,
    activeSeconds: Math.round(activeSeconds),
    eventCounts,
    topScreens: top(screens),
    topActions: top(actions),
    chapterEntries: top(chapters),
    internal: internalSummary,
    daily: dailyRows,
    dailyLogins: Object.keys(loginByDay).sort().reverse().slice(0, 14).map((day) => ({
      day,
      users: Object.keys(loginByDay[day]).map((id) => loginByDay[day][id]).sort((a, b) => b.at - a.at).map((user) => ({
        nickname: user.nickname || "未命名",
        chapter: user.chapter,
        fund: user.fund,
        screen: user.screen || "",
        animalTotal: user.animalTotal,
        water: user.water,
        grass: user.grass,
        safety: user.safety,
        disease: user.disease
      }))
    })),
    funnel: {
      appOpened: eventCounts.app_open || 0,
      onboardingStarted: eventCounts.onboarding_start || 0,
      onboardingCompleted: eventCounts.onboarding_complete || 0,
      actionsStarted: eventCounts.action_start || 0,
      actionsCompleted: eventCounts.action_complete || 0,
      collectionDiscoveries: eventCounts.collection_discovery || 0
    }
  };
}

function dashboard() {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>野境守护 · 行为统计</title><style>
  :root{color-scheme:light;--ink:#1f3028;--muted:#68776f;--green:#2f7d62;--paper:#f6f4ea;--card:#fffdf7;--line:#dfe6dc}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}main{max-width:1080px;margin:0 auto;padding:28px 18px 48px}h1{margin:0 0 6px;font-size:26px}h2{font-size:16px;margin:0 0 14px}.sub{color:var(--muted);margin-bottom:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px}.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:0 3px 12px #2f4a3510}.metric{font-size:28px;font-weight:700;color:var(--green);margin-top:8px}.label{color:var(--muted)}section{margin-top:20px}.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px}.chapter-board{grid-column:span 2}@media(max-width:640px){.chapter-board{grid-column:auto}}.row{display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding:8px 0}.bar{height:8px;background:#e8eee5;border-radius:5px;overflow:hidden;margin-top:5px}.bar i{display:block;height:100%;background:var(--green)}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border-bottom:1px solid var(--line)}th{color:var(--muted);font-weight:500}.small{font-size:12px;color:var(--muted)}button.login-btn{border:0;background:var(--green);color:#fff;border-radius:8px;padding:4px 10px;font:12px inherit;cursor:pointer}.detail td{background:#f3f7f1}.chapter-names{max-height:280px;overflow:auto;margin:0 0 8px}.name-line{padding:6px 0;border-bottom:1px solid var(--line)}.chapter-table{width:100%;border-collapse:collapse}.chapter-table th,.chapter-table td{font-size:14px;padding:10px 14px;white-space:nowrap;border-bottom:1px solid var(--line);text-align:right;vertical-align:top}.chapter-table th:first-child,.chapter-table td:first-child{text-align:left}.chapter-table th{color:var(--muted);font-weight:500}.chapter-table .pct{color:#d64545;font-weight:600}</style></head><body><main><h1>野境守护 · 游戏行为统计</h1><div class="sub">公网数据后台 · <span id="updated">加载中</span></div><div id="app">加载中…</div></main><script>
let selectedLogin="";
function selectLogin(key){selectedLogin=selectedLogin===key?"":key;load();}
let selectedChapter="";
let chapterNames={};
function selectChapter(chapter){chapter=String(chapter);if(selectedChapter===chapter){selectedChapter="";load();return;}selectedChapter=chapter;load();if(chapterNames[chapter])return;const base=(location.pathname.indexOf('/wild-analytics')===0?'/wild-analytics':'');fetch(base+'/api/chapter-users?chapter='+encodeURIComponent(chapter)).then(function(r){return r.json();}).then(function(data){chapterNames[chapter]=data.nicknames||[];if(selectedChapter===chapter)load();}).catch(function(){chapterNames[chapter]=[];if(selectedChapter===chapter)load();});}
async function load(){const r=await fetch((location.pathname.indexOf('/wild-analytics')===0?'/wild-analytics':'')+'/api/summary');const s=await r.json();const f=s.funnel||{};const i=s.internal||{};const fund=i.fund||{};const animals=i.animals||{};const ecology=i.ecology||{};const species=i.species||[];const list=(items)=>items&&items.length?items.map(x=>'<div class="row"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join(''):'<div class="small">暂无数据</div>';const days=(s.daily||[]).slice(-14);const chapterReach=i.chapterReach||[];const esc=(value)=>String(value==null?'':value).replace(/[&<>"']/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));const chapterTotal=chapterReach.reduce(function(sum,row){return sum+(Number(row&&row.users!=null?row.users:row&&row[1])||0);},0);const recentTotal=chapterReach.reduce(function(sum,row){return sum+(Number(row&&row.recentUsers)||0);},0);const yesterdayTotal=chapterReach.reduce(function(sum,row){return sum+(Number(row&&row.yesterdayUsers)||0);},0);const pct=function(count,total){if(!total)return "0%";const value=Math.round(Number(count||0)/total*1000)/10;return (value%1?value.toFixed(1):String(value))+"%";};const chapterReachHtml=chapterReach.length?('<table class="chapter-table"><tr><th>章节</th><th>全部用户</th><th>昨日登录</th><th>近7日登录</th></tr>'+chapterReach.map(function(x){const chapter=String(x&&x.chapter!=null?x.chapter:x[0]);const users=Number(x&&x.users!=null?x.users:x[1])||0;const recent=Number(x&&x.recentUsers)||0;const yesterday=Number(x&&x.yesterdayUsers)||0;const chapterNo=Math.round(Number(chapter));const open=selectedChapter===chapter;const names=chapterNames[chapter];const body=open?(Array.isArray(names)?(names.length?'<div class="chapter-names">'+names.map(function(name){return '<div class="name-line">'+esc(name)+'</div>';}).join('')+'</div>':'<div class="small">近7日这一章没有登录</div>'):'<div class="small">正在读取昵称…</div>'):'';const button=chapterNo>=1&&chapterNo<=11?' <button class="login-btn" onclick="selectChapter('+chapterNo+')">'+(open?'收起':'查看')+'</button>':'';return '<tr><td>'+esc(chapter)+'</td><td>'+users+' · <span class="pct">'+pct(users,chapterTotal)+'</span></td><td>'+yesterday+' · <span class="pct">'+pct(yesterday,yesterdayTotal)+'</span></td><td>'+recent+' · <span class="pct">'+pct(recent,recentTotal)+'</span>'+button+'</td></tr>'+(body?'<tr class="detail"><td colspan="4">'+body+'</td></tr>':'');}).join('')+'</table>'):'<div class="small">暂无数据</div>';const actionEconomy=i.actionEconomy||[];const places={choose:"登录",home:"沙盘",survival:"生存",collection:"发现",animalworld:"发现",role:"物资",archive:"档案",league:"排行",social:"社交"};const statusLine=(user)=>{const bits=[places[user.screen]||user.screen||"游戏中"];if(user.animalTotal!=null)bits.push("动物 "+user.animalTotal);if(user.water!=null)bits.push("水源 "+user.water);if(user.grass!=null)bits.push("草场 "+user.grass);if(user.safety!=null)bits.push("安全 "+user.safety);if(user.disease!=null)bits.push("疾病 "+user.disease);return bits.join(" · ");};const chapterText=(value)=>value==null?"—":("第 "+value+" 章");const fundText=(value)=>value==null?"—":String(value);const loginDays=s.dailyLogins||[];const loginHtml='<section class="card"><h2>每日登录</h2><div class="small">只列出今天和昨天的登录用户，同一用户只保留一行。点「查看」看该用户近 7 天是否登录，以及当前章节和基金。</div>'+(loginDays.length?loginDays.map((day)=>'<div class="small" style="margin-top:12px">'+esc(day.day)+' · '+day.users.length+' 人</div><table><tr><th>昵称</th><th>章节</th><th>基金</th><th></th></tr>'+day.users.map((user,index)=>{const key=(day.day||'')+':'+(user.id||index);const open=selectedLogin===key;const week=(user.week||[]).map((item)=>'<div class="row"><span>'+esc(item.label)+' · '+esc(item.day)+'</span><b>'+(item.loggedIn?'登录':'未登录')+'</b></div>').join('');return '<tr><td>'+esc(user.nickname)+'</td><td>'+esc(chapterText(user.chapter))+'</td><td>'+esc(fundText(user.fund))+'</td><td><button class="login-btn" onclick="selectLogin(\\''+esc(key)+'\\')">'+(open?'收起':'查看')+'</button></td></tr>'+(open?'<tr class="detail"><td colspan="4">'+week+'<div class="row"><span>主要状态</span><b>'+esc(statusLine(user))+'</b></div><div class="row"><span>章节</span><b>'+esc(chapterText(user.chapter))+'</b></div><div class="row"><span>基金</span><b>'+esc(fundText(user.fund))+'</b></div></td></tr>':'');}).join('')+'</table>').join(''):'<div class="small">暂无登录</div>')+'</section>';document.getElementById('updated').textContent=new Date(s.generatedAt).toLocaleString();document.getElementById('app').innerHTML=loginHtml+'<div class="grid">'+[['用户数',s.users],['会话数',s.sessions],['事件数',s.events],['活跃时长',Math.round(s.activeSeconds/60)+' 分钟'],['行动完成',f.actionsCompleted||0],['章节进入',((s.chapterEntries||[]).reduce((n,x)=>n+x[1],0))]].map(x=>'<div class="card"><div class="label">'+x[0]+'</div><div class="metric">'+x[1]+'</div></div>').join('')+'</div><div class="cols"><div class="card"><h2>行为漏斗</h2>'+[['打开游戏',f.appOpened],['开始引导',f.onboardingStarted],['完成引导',f.onboardingCompleted],['开始行动',f.actionsStarted],['完成行动',f.actionsCompleted],['收藏发现',f.collectionDiscoveries]].map(x=>'<div class="row"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('')+'</div><div class="card"><h2>基金</h2>'+[['最新余额',fund.last==null?0:fund.last],['平均余额',fund.average||0],['最低余额',fund.min==null?0:fund.min],['最高余额',fund.max==null?0:fund.max],['采样次数',fund.samples||0]].map(x=>'<div class="row"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('')+'</div><div class="card"><h2>动物</h2>'+[['最新总量',animals.last==null?0:animals.last],['平均总量',animals.average||0],['最低总量',animals.min==null?0:animals.min],['最高总量',animals.max==null?0:animals.max],['物种采样',animals.speciesSamples||0]].map(x=>'<div class="row"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('')+'</div><div class="card"><h2>物种分布</h2>'+ (species.length?species.map(x=>'<div class="row"><span>'+x[0]+'</span><b>最新 '+x[1].last+' · 平均 '+x[1].average+'</b></div>').join(''):'<div class="small">暂无数据</div>')+'</div><div class="card chapter-board"><h2>章节到达用户</h2><div class="small">11个剧情章节。昨日百分比按昨日登录总人数。近7日百分比按近7日登录总人数。近7日登录可查看该章用户，全部用户不展开名单。按离开游戏时的章节。还没有离开记录时，用最后一次章节事件，不用登录当次。没有章节记录的算在第1章。</div>'+chapterReachHtml+'</div><div class="card"><h2>行动平均变化</h2>'+ (actionEconomy.length?actionEconomy.map(x=>'<div class="row"><span>'+x[0]+'</span><b>基金 '+x[1].averageFundDelta+' · 动物 '+x[1].averageAnimalDelta+'</b></div>').join(''):'<div class="small">暂无数据</div>')+'</div><div class="card"><h2>常用行动</h2>'+list(s.topActions)+'</div><div class="card"><h2>常用页面</h2>'+list(s.topScreens)+'</div></div><section class="card"><h2>近14日趋势</h2><table><tr><th>日期</th><th>用户</th><th>会话</th><th>事件</th><th>活跃秒数</th></tr>'+days.map(d=>'<tr><td>'+d.day+'</td><td>'+d.users+'</td><td>'+d.sessions+'</td><td>'+d.events+'</td><td>'+d.activeSeconds+'</td></tr>').join('')+'</table></section>';}
load();setInterval(load,5000);
</script></body></html>`;
}

function body(req) {
  return new Promise((resolve, reject) => {
    let value = ""; let size = 0;
    req.on("data", (chunk) => { size += chunk.length; if (size <= MAX_BODY) value += chunk; });
    req.on("end", () => { if (size > MAX_BODY) return reject(new Error("PAYLOAD_TOO_LARGE")); try { resolve(JSON.parse(value || "{}")); } catch (error) { reject(new Error("INVALID_JSON")); } });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" }); return res.end(); }
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (req.method === "GET" && url.pathname === "/") { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); return res.end(dashboard()); }
  if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true, service: "wild-guard-analytics", port: PORT });
  if (req.method === "GET" && url.pathname === "/api/chapter-users") {
    const chapter = Math.round(Number(url.searchParams.get("chapter")));
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > 11) return json(res, 400, { error: "BAD_CHAPTER" });
    const nicknames = historicalNicknames(chapter);
    return json(res, 200, { chapter, count: nicknames.length, nicknames });
  }
  if (req.method === "GET" && url.pathname === "/api/summary") {
    const summary = mergeDailyLogins(summarize(readEvents()));
    const reach = historicalChapterReach();
    if (reach && summary.internal) summary.internal.chapterReach = reach;
    return json(res, 200, summary);
  }
  if (req.method === "GET" && url.pathname === "/api/events") return json(res, 200, { events: readEvents().slice(-1000) });
  if (req.method === "POST" && url.pathname === "/api/events") {
    try { const events = normalizeEvents(await body(req)); appendEvents(events); return json(res, 202, { accepted: events.length }); }
    catch (error) { return json(res, error.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: error.message }); }
  }
  return json(res, 404, { error: "NOT_FOUND" });
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`Wild Guard analytics: http://${HOST}:${PORT}`);
    console.log(`Data file: ${EVENTS_FILE}`);
  });
}

module.exports = { mergeDailyLogins, chinaDay, namedLogin, matchClientLogin, resolveStoryChapters };
