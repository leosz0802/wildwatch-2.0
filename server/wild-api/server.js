"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");
const { DatabaseSync } = require("node:sqlite");
const { calculateReserveValuation } = require("./reserveValuation");

const SERVICE_VERSION = "1.8.2";
const MAX_JSON_BYTES = 16 * 1024;
const PLAYER_SAVE_MAX_BYTES = 700 * 1024;
const PUBLIC_STYLES = new Set(["综合守护", "水源经营", "夜间巡护", "草场恢复", "社区共生", "迁徙通道", "动物救助"]);
const MODERATION_STATUS = Object.freeze({
  review: "pending_review",
  block: "blocked",
  takedown: "taken_down",
  restore: "active"
});
const MODERATION_REASONS = new Set(["policy_risk", "player_report", "manual_review", "false_positive", "appeal_approved", "other"]);
const OWNER_CODENAMES = Object.freeze(["晨岚", "远川", "林迹", "白石", "溪望", "松影", "霜原", "雨岸", "青屿", "星渡", "云岭", "河声"]);
const RESERVE_CODENAMES = Object.freeze(["苔原哨站", "河湾哨站", "松林哨站", "湿地哨站", "山脊哨站", "草海哨站", "杉谷哨站", "湖岸哨站", "荒原哨站", "云岭哨站", "石滩哨站", "林缘哨站"]);
const TRADE_MATERIALS = Object.freeze({
  resin_tinder: { label: "松脂火绒片", value: 1 },
  reed_cord: { label: "芦苇纤维束", value: 1 },
  feather_wind_tag: { label: "落羽风向签", value: 1 },
  track_cast: { label: "兽道泥印板", value: 1 },
  pinecone_humidity: { label: "松果湿度标", value: 2 },
  seedpod_alarm: { label: "荚果风铃警戒器", value: 2 },
  wax_seal: { label: "旧巢蜂蜡防水块", value: 2 },
  quartz_signal: { label: "石英反光信号片", value: 2 },
  gourd_container: { label: "干葫芦样本壶", value: 3 },
  down_insulation: { label: "种绒保温包", value: 3 },
  reed_whistle: { label: "芦管定位哨", value: 3 },
  bark_route_tag: { label: "落皮路线牌", value: 3 }
});
const TRADE_DAILY_LIMIT = 3;
const TRADE_MOTIVES = new Set(["surplus", "shortfall", "rare", "risk", "time"]);
const HOUND_PATROL_DELAY_MS = 5 * 60 * 1000;
const HOUND_PATROL_DAILY_LIMIT = 8;
const HOUND_PATROL_INCOMING_DAILY_LIMIT = 5;
const HOUND_PATROL_COST_MIN = 100;
const HOUND_PATROL_COST_MAX = 1000;

function json(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, Object.assign({
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer"
  }, extraHeaders));
  res.end(payload);
}

function readJson(req, limit = MAX_JSON_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error("payload too large");
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch (error) {
        error.statusCode = 400;
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function hmac(secret, value) {
  return crypto.createHmac("sha256", secret).update(String(value)).digest("base64url");
}

function issueToken(secret, subject, now = Date.now()) {
  const payload = base64url(JSON.stringify({
    sub: subject,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 30 * 86400
  }));
  return `${payload}.${hmac(secret, payload)}`;
}

function verifyToken(secret, token, now = Date.now()) {
  const parts = String(token || "").split(".");
  if (parts.length !== 2) return null;
  const expected = hmac(secret, parts[0]);
  const actualBuffer = Buffer.from(parts[1]);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (!payload.sub || !payload.exp || payload.exp <= Math.floor(now / 1000)) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

class RateLimiter {
  constructor(maxEntries = 5000) {
    this.entries = new Map();
    this.maxEntries = Math.max(100, Number(maxEntries) || 5000);
  }

  consume(key, limit, windowMs, now = Date.now()) {
    const existing = this.entries.get(key);
    if (!existing && this.entries.size >= this.maxEntries) {
      for (const [entryKey, value] of this.entries.entries()) {
        if (now >= value.resetAt) this.entries.delete(entryKey);
      }
      while (this.entries.size >= this.maxEntries) {
        const oldestKey = this.entries.keys().next().value;
        if (oldestKey === undefined) break;
        this.entries.delete(oldestKey);
      }
    }
    const entry = !existing || now >= existing.resetAt ? { count: 0, resetAt: now + windowMs } : existing;
    entry.count += 1;
    this.entries.set(key, entry);
    return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count), resetAt: entry.resetAt };
  }
}

function normalizedIp(value) {
  const candidate = String(value || "").trim();
  return net.isIP(candidate) ? candidate : "";
}

function clientIp(req) {
  const remote = normalizedIp(req.socket && req.socket.remoteAddress) || "unknown";
  const trustedProxy = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
  if (!trustedProxy) return remote;
  // Nginx overwrites X-Real-IP with $remote_addr. Never use the first value
  // from X-Forwarded-For because clients can prepend an arbitrary address.
  return normalizedIp(req.headers["x-real-ip"]) || remote;
}

function sanitizeDisplayName(value, maxLength = 20) {
  return String(value || "守护者")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength) || "守护者";
}

function serverGeneratedIdentity(userId) {
  const stableId = String(userId || "anonymous");
  const digest = crypto.createHash("sha256").update(stableId).digest();
  const suffix = digest.subarray(2, 4).toString("hex").toUpperCase();
  const ownerName = `${OWNER_CODENAMES[digest[0] % OWNER_CODENAMES.length]}·${suffix}`;
  const reserveName = RESERVE_CODENAMES[digest[1] % RESERVE_CODENAMES.length];
  return { ownerName, reserveName, title: `${ownerName}的${reserveName}` };
}

function serverOwnedStyle(value) {
  const candidate = String(value || "").trim();
  return PUBLIC_STYLES.has(candidate) ? candidate : "综合守护";
}

function publicPlayerIdentity(row = {}) {
  const activation = row.activatedAt === undefined ? row.activated_at : row.activatedAt;
  if (Number(activation) === 0) {
    return { ownerName: "微信同玩好友", reserveName: "保护区", title: "微信同玩好友" };
  }
  return serverGeneratedIdentity(row.userId || row.user_id);
}

function safeSecretEqual(actual, expected) {
  const left = crypto.createHash("sha256").update(String(actual || "")).digest();
  const right = crypto.createHash("sha256").update(String(expected || "")).digest();
  return crypto.timingSafeEqual(left, right);
}

function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=3000; PRAGMA foreign_keys=ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '守护者',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      activated_at INTEGER NOT NULL DEFAULT 0,
      moderation_status TEXT NOT NULL DEFAULT 'active',
      moderation_reason TEXT NOT NULL DEFAULT '',
      moderated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS scores (
      user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
      score INTEGER NOT NULL DEFAULT 0 CHECK(score >= 0 AND score <= 10000000),
      level INTEGER NOT NULL DEFAULT 1 CHECK(level BETWEEN 1 AND 7),
      animals INTEGER NOT NULL DEFAULT 0 CHECK(animals BETWEEN 0 AND 99999),
      shield INTEGER NOT NULL DEFAULT 0 CHECK(shield BETWEEN 0 AND 100),
      safety INTEGER NOT NULL DEFAULT 50 CHECK(safety BETWEEN 0 AND 100),
      visitors INTEGER NOT NULL DEFAULT 0 CHECK(visitors BETWEEN 0 AND 999999),
      fund INTEGER NOT NULL DEFAULT 0 CHECK(fund BETWEEN 0 AND 100000000),
      style TEXT NOT NULL DEFAULT '综合守护',
      profile_version INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scores_rank_idx ON scores(score DESC, updated_at ASC);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      event_name TEXT NOT NULL,
      install_hash TEXT NOT NULL,
      user_id TEXT,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_created_idx ON events(created_at);
    CREATE TABLE IF NOT EXISTS friend_links (
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      friend_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, friend_user_id),
      CHECK(user_id <> friend_user_id)
    );
    CREATE INDEX IF NOT EXISTS friend_links_friend_idx ON friend_links(friend_user_id);
    CREATE TABLE IF NOT EXISTS trade_receipts (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      target_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      scope TEXT NOT NULL CHECK(scope IN ('friends', 'world')),
      item_id TEXT NOT NULL,
      item_label TEXT NOT NULL,
      requested_item_id TEXT,
      requested_item_label TEXT,
      trade_mode TEXT NOT NULL DEFAULT 'legacy',
      value_points INTEGER NOT NULL CHECK(value_points BETWEEN 1 AND 20),
      partner_credit INTEGER NOT NULL CHECK(partner_credit BETWEEN 1 AND 40),
      client_trade_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      claimed_at INTEGER,
      UNIQUE(actor_user_id, client_trade_id),
      CHECK(actor_user_id <> target_user_id)
    );
    CREATE INDEX IF NOT EXISTS trade_receipts_target_idx ON trade_receipts(target_user_id, claimed_at, created_at);
    CREATE TABLE IF NOT EXISTS trade_offers (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      scope TEXT NOT NULL CHECK(scope IN ('friends', 'world')),
      offered_item_id TEXT NOT NULL,
      offered_item_label TEXT NOT NULL,
      offered_value INTEGER NOT NULL CHECK(offered_value BETWEEN 1 AND 20),
      wanted_item_id TEXT NOT NULL,
      wanted_item_label TEXT NOT NULL,
      wanted_value INTEGER NOT NULL CHECK(wanted_value BETWEEN 1 AND 20),
      motive TEXT NOT NULL DEFAULT 'shortfall',
      client_trade_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'matched', 'cancelled')),
      counterparty_user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
      matched_offer_id TEXT,
      created_at INTEGER NOT NULL,
      matched_at INTEGER,
      UNIQUE(actor_user_id, client_trade_id)
    );
    CREATE INDEX IF NOT EXISTS trade_offers_match_idx ON trade_offers(status, scope, offered_item_id, wanted_item_id, created_at);
    CREATE INDEX IF NOT EXISTS trade_offers_actor_idx ON trade_offers(actor_user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS friend_contracts (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      target_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      objective_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'expired')),
      client_contract_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      completed_at INTEGER,
      UNIQUE(actor_user_id, client_contract_id),
      CHECK(actor_user_id <> target_user_id)
    );
    CREATE INDEX IF NOT EXISTS friend_contract_actor_idx ON friend_contracts(actor_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS friend_contract_target_idx ON friend_contracts(target_user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS world_hound_patrols (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      target_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      cost INTEGER NOT NULL CHECK(cost BETWEEN 100 AND 1000),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'settled', 'cancelled')),
      created_at INTEGER NOT NULL,
      settle_at INTEGER NOT NULL,
      settled_at INTEGER NOT NULL DEFAULT 0,
      target_safety INTEGER NOT NULL DEFAULT 50 CHECK(target_safety BETWEEN 0 AND 100),
      target_fund INTEGER NOT NULL DEFAULT 0 CHECK(target_fund >= 0),
      target_visitors INTEGER NOT NULL DEFAULT 0 CHECK(target_visitors >= 0),
      target_animals INTEGER NOT NULL DEFAULT 0 CHECK(target_animals >= 0),
      fund_floor INTEGER NOT NULL DEFAULT 0 CHECK(fund_floor >= 0),
      visitor_floor INTEGER NOT NULL DEFAULT 0 CHECK(visitor_floor >= 0),
      animal_floor INTEGER NOT NULL DEFAULT 0 CHECK(animal_floor >= 0),
      reward_fund INTEGER NOT NULL DEFAULT 0 CHECK(reward_fund >= 0),
      reward_visitors INTEGER NOT NULL DEFAULT 0 CHECK(reward_visitors >= 0),
      reward_animals INTEGER NOT NULL DEFAULT 0 CHECK(reward_animals >= 0),
      loss_fund INTEGER NOT NULL DEFAULT 0 CHECK(loss_fund >= 0),
      loss_visitors INTEGER NOT NULL DEFAULT 0 CHECK(loss_visitors >= 0),
      loss_animals INTEGER NOT NULL DEFAULT 0 CHECK(loss_animals >= 0),
      actor_chapter INTEGER NOT NULL DEFAULT 1 CHECK(actor_chapter BETWEEN 1 AND 20),
      UNIQUE(actor_user_id, id),
      CHECK(actor_user_id <> target_user_id)
    );
    CREATE INDEX IF NOT EXISTS world_hound_patrol_actor_idx ON world_hound_patrols(actor_user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS world_hound_patrol_target_idx ON world_hound_patrols(target_user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS moderation_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK(action IN ('review', 'block', 'takedown', 'restore')),
      reason TEXT NOT NULL,
      moderator_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS moderation_actions_target_idx ON moderation_actions(target_user_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS player_saves (
      user_id TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
      saved_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
  `);
  // Existing production databases predate friend placeholders. Keep the
  // migration local and idempotent so relation friends can receive a pending
  // exchange before their next login without storing raw openids.
  const friendColumns = db.prepare("PRAGMA table_info(friend_links)").all().map(column => column.name);
  if (!friendColumns.includes("match_key")) db.exec("ALTER TABLE friend_links ADD COLUMN match_key TEXT NOT NULL DEFAULT ''");
  const userColumns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!userColumns.includes("activated_at")) db.exec("ALTER TABLE users ADD COLUMN activated_at INTEGER NOT NULL DEFAULT 0");
  if (!userColumns.includes("moderation_status")) db.exec("ALTER TABLE users ADD COLUMN moderation_status TEXT NOT NULL DEFAULT 'active'");
  if (!userColumns.includes("moderation_reason")) db.exec("ALTER TABLE users ADD COLUMN moderation_reason TEXT NOT NULL DEFAULT ''");
  if (!userColumns.includes("moderated_at")) db.exec("ALTER TABLE users ADD COLUMN moderated_at INTEGER NOT NULL DEFAULT 0");
  if (!userColumns.includes("friend_match_key")) db.exec("ALTER TABLE users ADD COLUMN friend_match_key TEXT NOT NULL DEFAULT ''");
  const scoreColumns = db.prepare("PRAGMA table_info(scores)").all().map((column) => column.name);
  if (!scoreColumns.includes("level")) db.exec("ALTER TABLE scores ADD COLUMN level INTEGER NOT NULL DEFAULT 1");
  if (!scoreColumns.includes("animals")) db.exec("ALTER TABLE scores ADD COLUMN animals INTEGER NOT NULL DEFAULT 0");
  if (!scoreColumns.includes("shield")) db.exec("ALTER TABLE scores ADD COLUMN shield INTEGER NOT NULL DEFAULT 0");
  if (!scoreColumns.includes("safety")) db.exec("ALTER TABLE scores ADD COLUMN safety INTEGER NOT NULL DEFAULT 50");
  if (!scoreColumns.includes("visitors")) db.exec("ALTER TABLE scores ADD COLUMN visitors INTEGER NOT NULL DEFAULT 0");
  if (!scoreColumns.includes("fund")) db.exec("ALTER TABLE scores ADD COLUMN fund INTEGER NOT NULL DEFAULT 0");
  if (!scoreColumns.includes("style")) db.exec("ALTER TABLE scores ADD COLUMN style TEXT NOT NULL DEFAULT '综合守护'");
  if (!scoreColumns.includes("profile_version")) {
    db.exec("ALTER TABLE scores ADD COLUMN profile_version INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE scores SET profile_version=1 WHERE animals>0 AND shield>0");
  }
  const receiptColumns = db.prepare("PRAGMA table_info(trade_receipts)").all().map((column) => column.name);
  if (!receiptColumns.includes("requested_item_id")) db.exec("ALTER TABLE trade_receipts ADD COLUMN requested_item_id TEXT");
  if (!receiptColumns.includes("requested_item_label")) db.exec("ALTER TABLE trade_receipts ADD COLUMN requested_item_label TEXT");
  if (!receiptColumns.includes("trade_mode")) db.exec("ALTER TABLE trade_receipts ADD COLUMN trade_mode TEXT NOT NULL DEFAULT 'legacy'");
  const migrateName = db.prepare("UPDATE users SET display_name=? WHERE user_id=?");
  db.prepare("SELECT user_id AS userId FROM users WHERE activated_at>0").all().forEach((row) => {
    migrateName.run(serverGeneratedIdentity(row.userId).title, row.userId);
  });
  const migrateStyle = db.prepare("UPDATE scores SET style=? WHERE user_id=?");
  db.prepare("SELECT user_id AS userId, style FROM scores").all().forEach((row) => {
    const trustedStyle = serverOwnedStyle(row.style);
    if (trustedStyle !== row.style) migrateStyle.run(trustedStyle, row.userId);
  });
  const migrateValuation = db.prepare("UPDATE scores SET score=? WHERE user_id=?");
  db.prepare("SELECT user_id AS userId, level, animals, profile_version AS profileVersion FROM scores").all().forEach((row) => {
    const hasProfile = Number(row.profileVersion) > 0;
    migrateValuation.run(calculateReserveValuation(hasProfile ? row.level : 1, hasProfile ? row.animals : 0), row.userId);
  });
  const patrolColumns = db.prepare("PRAGMA table_info(world_hound_patrols)").all().map((column) => column.name);
  if (patrolColumns.length && !patrolColumns.includes("actor_chapter")) {
    db.exec("ALTER TABLE world_hound_patrols ADD COLUMN actor_chapter INTEGER NOT NULL DEFAULT 1");
  }
  return db;
}

function loadConfig(configPath) {
  const body = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return Object.assign({ version: 1, features: {} }, body);
}

function playerSaveSnapshot(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const world = value.world;
  if (!world || typeof world !== "object" || Array.isArray(world)) return null;
  const savedAt = Math.round(Number(value.cloudSavedAt) || 0);
  if (!Number.isFinite(savedAt) || savedAt <= 0 || savedAt > now + 86400000) return null;
  const snapshot = {
    world,
    character: value.character && typeof value.character === "object" && !Array.isArray(value.character) ? value.character : null,
    reports: Array.isArray(value.reports) ? value.reports.slice(-8) : [],
    messages: Array.isArray(value.messages) ? value.messages.slice(-8) : [],
    lastCommand: String(value.lastCommand || "").slice(0, 200),
    ui: value.ui && typeof value.ui === "object" && !Array.isArray(value.ui) ? value.ui : {},
    cloudSavedAt: savedAt
  };
  const payload = JSON.stringify(snapshot);
  if (Buffer.byteLength(payload) > PLAYER_SAVE_MAX_BYTES) return null;
  return { savedAt, payload, snapshot };
}

function bearer(req) {
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ""));
  return match ? match[1] : "";
}

async function wechatCodeExchange(appId, appSecret, code) {
  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", appSecret);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const result = await response.json();
    if (!response.ok || !result.openid || result.errcode) {
      const error = new Error(result.errmsg || "wechat login failed");
      error.publicCode = "WECHAT_LOGIN_FAILED";
      throw error;
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function decryptRelationFriendData(sessionKey, encryptedData, iv, appId = "") {
  const key = Buffer.from(String(sessionKey || ""), "base64");
  const vector = Buffer.from(String(iv || ""), "base64");
  const payload = Buffer.from(String(encryptedData || ""), "base64");
  if (key.length !== 16 || vector.length !== 16 || !payload.length) {
    const error = new Error("invalid friend relation payload");
    error.statusCode = 400;
    error.publicCode = "INVALID_FRIEND_DATA";
    throw error;
  }
  try {
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, vector);
    decipher.setAutoPadding(true);
    const result = JSON.parse(Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8"));
    if (appId && result.watermark && result.watermark.appid && result.watermark.appid !== appId) throw new Error("appid mismatch");
    return result;
  } catch (cause) {
    const error = new Error("unable to decrypt friend relation payload");
    error.statusCode = 400;
    error.publicCode = "INVALID_FRIEND_DATA";
    throw error;
  }
}

function publicPlayer(row = {}, viewerId = "") {
  const activation = row.activatedAt === undefined ? row.activated_at : row.activatedAt;
  const identity = publicPlayerIdentity(row);
  const profileComplete = Number(row.profileVersion === undefined ? row.profile_version : row.profileVersion) > 0;
  const matchKey = String(row.matchKey || row.match_key || "");
  return {
    id: String(row.userId || row.user_id || "").slice(0, 20),
    displayName: identity.title,
    ownerName: identity.ownerName,
    reserveName: identity.reserveName,
    score: Math.max(0, Number(row.score) || 0),
    level: Math.max(1, Math.min(7, Math.round(Number(row.level) || 1))),
    animals: profileComplete ? Math.max(0, Math.min(99999, Math.round(Number(row.animals) || 0))) : null,
    shield: profileComplete ? Math.max(0, Math.min(100, Math.round(Number(row.shield) || 0))) : null,
    safety: profileComplete ? Math.max(0, Math.min(100, Math.round(Number(row.safety) || 0))) : null,
    visitors: profileComplete ? Math.max(0, Math.min(999999, Math.round(Number(row.visitors) || 0))) : null,
    style: profileComplete ? serverOwnedStyle(row.style) : "",
    profileComplete,
    updatedAt: Math.max(0, Number(row.updatedAt || row.updated_at) || 0),
    mine: !!viewerId && viewerId === (row.userId || row.user_id),
    registered: activation === undefined ? true : Number(activation) > 0,
    ...(viewerId && matchKey && /^[a-f0-9]{64}$/.test(matchKey) ? { friendMatchKey: matchKey } : {})
  };
}

function publicTradeHistory(row = {}, direction = "sent") {
  return {
    tradeId: String(row.id || "").slice(0, 80),
    direction: direction === "received" ? "received" : "sent",
    scope: row.scope === "friends" ? "friends" : "world",
    itemId: String(row.itemId || "").slice(0, 40),
    itemLabel: String(row.itemLabel || "生存素材").slice(0, 24),
    requestedItemId: String(row.requestedItemId || "").slice(0, 40),
    requestedItemLabel: String(row.requestedItemLabel || "").slice(0, 24),
    mode: row.tradeMode === "barter_v1" ? "barter_v1" : "legacy",
    status: ["open", "matched", "cancelled"].includes(row.status) ? row.status : "matched",
    motive: TRADE_MOTIVES.has(row.motive) ? row.motive : "shortfall",
    partnerCredit: Math.max(0, Math.min(99, Math.round(Number(row.partnerCredit) || 0))),
    partnerId: String(row.partnerId || "").slice(0, 20),
    partnerName: sanitizeDisplayName(row.partnerName || "远方保护区"),
    createdAt: Math.max(0, Number(row.createdAt) || 0),
    claimedAt: Math.max(0, Number(row.claimedAt) || 0),
    claimed: Number(row.claimedAt) > 0
  };
}

function publicTradeOffer(row = {}) {
  return publicTradeHistory({
    id: row.id,
    scope: row.scope,
    itemId: row.offeredItemId,
    itemLabel: row.offeredItemLabel,
    requestedItemId: row.wantedItemId,
    requestedItemLabel: row.wantedItemLabel,
    tradeMode: "barter_v1",
    status: row.status,
    motive: row.motive,
    partnerId: row.partnerId,
    partnerName: row.partnerName || (row.status === "open" ? "等待真实玩家匹配" : "真实玩家"),
    createdAt: row.createdAt,
    claimedAt: row.claimedAt
  }, "sent");
}

function publicFriendContract(row = {}, viewerId = "") {
  const actor = String(row.actorUserId || row.actor_user_id || "");
  const target = String(row.targetUserId || row.target_user_id || "");
  return {
    contractId: String(row.id || "").slice(0, 80),
    clientContractId: String(row.clientContractId || row.client_contract_id || "").slice(0, 80),
    direction: viewerId && viewerId === target ? "received" : "sent",
    partnerId: String(viewerId && viewerId === target ? actor : target).slice(0, 20),
    partnerName: sanitizeDisplayName(row.partnerName || (viewerId && viewerId === target ? row.actorName : row.targetName) || "好友"),
    objectiveId: String(row.objectiveId || row.objective_id || "").slice(0, 40),
    status: ["pending", "completed", "expired"].includes(row.status) ? row.status : "pending",
    createdAt: Math.max(0, Number(row.createdAt || row.created_at) || 0),
    expiresAt: Math.max(0, Number(row.expiresAt || row.expires_at) || 0),
    completedAt: Math.max(0, Number(row.completedAt || row.completed_at) || 0)
  };
}

function houndPatrolChapterNeed(chapter = 1) {
  const targets = [
    [7, 12, 50], [7, 84, 174], [9, 101, 378], [11, 118, 486], [12, 137, 594],
    [14, 158, 714], [16, 182, 984], [18, 209, 1104], [20, 238, 1320], [22, 269, 1488],
    [33, 715, 3888]
  ];
  const stage = Math.max(1, Math.min(targets.length, Math.round(Number(chapter) || 1)));
  const row = targets[stage - 1];
  return { chapter: stage, animals: row[1], visitors: row[2], fund: row[2] * 4 };
}

function houndPatrolOutcome(row = {}) {
  const cost = Math.max(HOUND_PATROL_COST_MIN, Math.min(HOUND_PATROL_COST_MAX, Math.round(Number(row.cost) || HOUND_PATROL_COST_MIN)));
  const rawSafety = row.targetSafety === undefined ? row.target_safety : row.targetSafety;
  const safetyValue = Number(rawSafety);
  const safety = Math.max(0, Math.min(100, Math.round(Number.isFinite(safetyValue) ? safetyValue : 50)));
  const risk = 1 - safety / 100;
  const safetyBand = safety >= 85 ? { key: "secure", label: "严密防护", maxLossRate: 0.03 }
    : safety >= 70 ? { key: "stable", label: "稳定防护", maxLossRate: 0.06 }
      : safety >= 50 ? { key: "normal", label: "常规防护", maxLossRate: 0.10 }
        : safety >= 30 ? { key: "risk", label: "风险偏高", maxLossRate: 0.14 }
          : { key: "danger", label: "高风险", maxLossRate: 0.18 };
  const rate = Math.min(safetyBand.maxLossRate, 0.01 + Math.pow(risk, 1.35) * 0.17);
  const safetyShare = 0.45 + risk * 0.55;
  const stakeShare = cost >= 1000 ? 1 : cost >= 600 ? 0.75 : cost >= 300 ? 0.5 : 0.25;
  const need = houndPatrolChapterNeed(row.actorChapter === undefined ? row.actor_chapter : row.actorChapter);
  const fund = Math.max(0, Math.round(Number(row.targetFund === undefined ? row.target_fund : row.targetFund) || 0));
  const visitors = Math.max(0, Math.round(Number(row.targetVisitors === undefined ? row.target_visitors : row.targetVisitors) || 0));
  const animals = Math.max(0, Math.round(Number(row.targetAnimals === undefined ? row.target_animals : row.targetAnimals) || 0));
  const fundFloor = Math.max(0, Number(row.fundFloor === undefined ? row.fund_floor : row.fundFloor) || 0);
  const visitorFloor = Math.max(0, Number(row.visitorFloor === undefined ? row.visitor_floor : row.visitorFloor) || 0);
  const animalFloor = Math.max(0, Number(row.animalFloor === undefined ? row.animal_floor : row.animalFloor) || 0);
  const fundLoss = Math.min(Math.max(0, fund - fundFloor), Math.max(0, Math.floor(Math.max(0, fund - fundFloor) * rate)));
  const visitorLoss = Math.min(Math.max(0, visitors - visitorFloor), Math.max(0, Math.floor(Math.max(0, visitors - visitorFloor) * rate)));
  const animalLoss = Math.min(Math.max(0, animals - animalFloor), Math.max(0, Math.floor(Math.max(0, animals - animalFloor) * rate * 0.75)));
  return {
    safety,
    risk: Number(risk.toFixed(4)),
    transferRate: Number(rate.toFixed(4)),
    safetyBand,
    rewardFund: Math.max(1, Math.round(need.fund * stakeShare * safetyShare)),
    rewardVisitors: Math.max(1, Math.round(need.visitors * stakeShare * safetyShare * 0.7)),
    rewardAnimals: Math.max(1, Math.round(need.animals * stakeShare * safetyShare * 0.28)),
    lossFund: fundLoss,
    lossVisitors: visitorLoss,
    lossAnimals: animalLoss
  };
}

function publicHoundPatrol(row = {}, viewerId = "") {
  const actor = String(row.actorUserId || row.actor_user_id || "");
  const target = String(row.targetUserId || row.target_user_id || "");
  const isTarget = viewerId && viewerId === target;
  const outcome = houndPatrolOutcome(row);
  return {
    patrolId: String(row.id || "").slice(0, 80),
    direction: isTarget ? "received" : "sent",
    partnerId: String(isTarget ? actor : target).slice(0, 20),
    partnerName: sanitizeDisplayName(isTarget ? (row.actorName || "巡逻者") : (row.targetName || "远方保护区")),
    status: ["pending", "settled", "cancelled"].includes(row.status) ? row.status : "pending",
    cost: Math.max(HOUND_PATROL_COST_MIN, Math.min(HOUND_PATROL_COST_MAX, Math.round(Number(row.cost) || HOUND_PATROL_COST_MIN))),
    createdAt: Math.max(0, Number(row.createdAt || row.created_at) || 0),
    settleAt: Math.max(0, Number(row.settleAt || row.settle_at) || 0),
    settledAt: Math.max(0, Number(row.settledAt || row.settled_at) || 0),
    targetSafety: Math.max(0, Math.min(100, Math.round(Number(row.targetSafety || row.target_safety) || 0))),
    actorChapter: Math.max(1, Math.round(Number(row.actorChapter === undefined ? row.actor_chapter : row.actorChapter) || 1)),
    reward: { fund: outcome.rewardFund, visitors: outcome.rewardVisitors, animals: outcome.rewardAnimals },
    loss: { fund: outcome.lossFund, visitors: outcome.lossVisitors, animals: outcome.lossAnimals },
    risk: outcome.risk,
    transferRate: outcome.transferRate,
    safetyBand: outcome.safetyBand,
    protectedFloors: {
      fund: Math.max(0, Math.round(Number(row.fundFloor || row.fund_floor) || 0)),
      visitors: Math.max(0, Math.round(Number(row.visitorFloor || row.visitor_floor) || 0)),
      animals: Math.max(0, Math.round(Number(row.animalFloor || row.animal_floor) || 0))
    }
  };
}

function createApiServer(options = {}) {
  const dbPath = options.dbPath || process.env.WILD_DB_PATH || path.join(__dirname, "data", "wild.sqlite");
  const configPath = options.configPath || process.env.WILD_CONFIG_PATH || path.join(__dirname, "config", "default.json");
  const sessionSecret = options.sessionSecret || process.env.WILD_SESSION_SECRET || "";
  const wxAppId = options.wxAppId == null ? (process.env.WX_APP_ID || "") : options.wxAppId;
  const wxAppSecret = options.wxAppSecret == null ? (process.env.WX_APP_SECRET || "") : options.wxAppSecret;
  const moderationSecret = options.moderationSecret == null ? (process.env.WILD_MODERATION_SECRET || "") : options.moderationSecret;
  const exchangeWechatCode = typeof options.wechatCodeExchange === "function" ? options.wechatCodeExchange : wechatCodeExchange;
  if (sessionSecret.length < 32) throw new Error("WILD_SESSION_SECRET must contain at least 32 characters");
  const db = openDatabase(dbPath);
  const limiter = new RateLimiter();
  const wechatSessions = new Map();
  let eventWrites = 0;

  const statements = {
    health: db.prepare("SELECT 1 AS ok"),
    playerSave: db.prepare("SELECT saved_at AS savedAt, payload FROM player_saves WHERE user_id=?"),
    upsertPlayerSave: db.prepare(`INSERT INTO player_saves(user_id, saved_at, updated_at, payload) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET saved_at=excluded.saved_at, updated_at=excluded.updated_at, payload=excluded.payload
      WHERE excluded.saved_at > player_saves.saved_at`),
    upsertActiveUser: db.prepare(`INSERT INTO users(user_id, display_name, created_at, updated_at, activated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, updated_at=excluded.updated_at, activated_at=MAX(users.activated_at, excluded.activated_at)`),
    upsertPendingUser: db.prepare(`INSERT INTO users(user_id, display_name, created_at, updated_at, activated_at) VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(user_id) DO NOTHING`),
    userActivation: db.prepare("SELECT activated_at AS activatedAt FROM users WHERE user_id=?"),
    userModeration: db.prepare("SELECT moderation_status AS status FROM users WHERE user_id=?"),
    score: db.prepare("SELECT score, level, animals, shield, safety, visitors, fund, profile_version AS profileVersion FROM scores WHERE user_id=?"),
    upsertScoreProfile: db.prepare(`INSERT INTO scores(user_id, score, level, animals, shield, safety, visitors, fund, style, profile_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?)
      ON CONFLICT(user_id) DO UPDATE SET score=excluded.score, level=excluded.level, animals=excluded.animals,
      shield=excluded.shield, safety=excluded.safety, visitors=excluded.visitors, fund=excluded.fund,
      style=excluded.style, profile_version=excluded.profile_version, updated_at=excluded.updated_at`),
    upsertScoreBasic: db.prepare(`INSERT INTO scores(user_id, score, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET score=excluded.score, updated_at=excluded.updated_at`),
    leaderboard: db.prepare(`SELECT u.user_id AS userId, u.display_name AS displayName, u.friend_match_key AS matchKey, s.score, s.level, s.animals, s.shield, s.safety, s.visitors, s.style, s.profile_version AS profileVersion, s.updated_at AS updatedAt
      FROM scores s JOIN users u ON u.user_id=s.user_id WHERE u.moderation_status='active' ORDER BY s.score DESC, s.updated_at ASC LIMIT ?`),
    userByPublicId: db.prepare("SELECT user_id AS userId, display_name AS displayName FROM users WHERE substr(user_id, 1, 20)=? AND moderation_status='active' LIMIT 2"),
    anyUserByPublicId: db.prepare("SELECT user_id AS userId, display_name AS displayName, moderation_status AS moderationStatus, moderation_reason AS moderationReason, moderated_at AS moderatedAt FROM users WHERE substr(user_id, 1, 20)=? LIMIT 2"),
    friendRows: db.prepare(`SELECT u.user_id AS userId, u.display_name AS displayName, COALESCE(s.score, 0) AS score,
      COALESCE(s.level, 1) AS level, COALESCE(s.animals, 0) AS animals, COALESCE(s.safety, 50) AS safety, COALESCE(s.visitors, 0) AS visitors, COALESCE(s.shield, 0) AS shield,
      COALESCE(s.style, '综合守护') AS style, COALESCE(s.profile_version, 0) AS profileVersion, COALESCE(s.updated_at, u.updated_at) AS updatedAt, u.activated_at AS activatedAt,
      f.match_key AS matchKey
      FROM friend_links f JOIN users u ON u.user_id=f.friend_user_id LEFT JOIN scores s ON s.user_id=u.user_id
      WHERE f.user_id=? AND u.moderation_status='active' ORDER BY COALESCE(s.score, 0) DESC, u.updated_at ASC LIMIT 100`),
    deleteFriendLinks: db.prepare("DELETE FROM friend_links WHERE user_id=?"),
    upsertFriend: db.prepare(`INSERT INTO friend_links(user_id, friend_user_id, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id, friend_user_id) DO UPDATE SET updated_at=excluded.updated_at`),
    isFriend: db.prepare("SELECT match_key AS matchKey FROM friend_links WHERE user_id=? AND friend_user_id=?"),
    setFriendMatchKey: db.prepare("UPDATE friend_links SET match_key=? WHERE user_id=? AND friend_user_id=?"),
    setUserMatchKey: db.prepare("UPDATE users SET friend_match_key=? WHERE user_id=?"),
    insertTrade: db.prepare(`INSERT INTO trade_receipts(id, actor_user_id, target_user_id, scope, item_id, item_label, value_points, partner_credit, client_trade_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(actor_user_id, client_trade_id) DO NOTHING`),
    tradeByClientId: db.prepare(`SELECT id, scope, item_id AS itemId, item_label AS itemLabel, requested_item_id AS requestedItemId,
      requested_item_label AS requestedItemLabel, trade_mode AS tradeMode, value_points AS valuePoints,
      partner_credit AS partnerCredit, client_trade_id AS clientTradeId, created_at AS createdAt
      FROM trade_receipts WHERE actor_user_id=? AND client_trade_id=?`),
    pendingTrades: db.prepare(`SELECT t.id, t.scope, t.item_id AS itemId, t.item_label AS itemLabel,
      t.requested_item_id AS requestedItemId, t.requested_item_label AS requestedItemLabel, t.trade_mode AS tradeMode, t.partner_credit AS partnerCredit,
      t.created_at AS createdAt, u.display_name AS partnerName, substr(t.actor_user_id, 1, 20) AS partnerId
      FROM trade_receipts t JOIN users u ON u.user_id=t.actor_user_id
      WHERE t.target_user_id=? AND t.claimed_at IS NULL ORDER BY t.created_at ASC LIMIT 50`),
    claimTrades: db.prepare("UPDATE trade_receipts SET claimed_at=? WHERE target_user_id=? AND claimed_at IS NULL"),
    sentTradeHistory: db.prepare(`SELECT t.id, t.scope, t.item_id AS itemId, t.item_label AS itemLabel,
      t.requested_item_id AS requestedItemId, t.requested_item_label AS requestedItemLabel, t.trade_mode AS tradeMode, t.partner_credit AS partnerCredit,
      t.created_at AS createdAt, t.claimed_at AS claimedAt, u.display_name AS partnerName, substr(t.target_user_id, 1, 20) AS partnerId
      FROM trade_receipts t JOIN users u ON u.user_id=t.target_user_id
      WHERE t.actor_user_id=? ORDER BY t.created_at DESC LIMIT ?`),
    receivedTradeHistory: db.prepare(`SELECT t.id, t.scope, t.item_id AS itemId, t.item_label AS itemLabel,
      t.requested_item_id AS requestedItemId, t.requested_item_label AS requestedItemLabel, t.trade_mode AS tradeMode, t.partner_credit AS partnerCredit,
      t.created_at AS createdAt, t.claimed_at AS claimedAt, u.display_name AS partnerName, substr(t.actor_user_id, 1, 20) AS partnerId
      FROM trade_receipts t JOIN users u ON u.user_id=t.actor_user_id
      WHERE t.target_user_id=? ORDER BY t.created_at DESC LIMIT ?`),
    patrolById: db.prepare(`SELECT p.*, au.display_name AS actorName, tu.display_name AS targetName
      FROM world_hound_patrols p JOIN users au ON au.user_id=p.actor_user_id JOIN users tu ON tu.user_id=p.target_user_id WHERE p.id=?`),
    updatePatrolTarget: db.prepare("UPDATE scores SET score=?, animals=?, visitors=?, fund=?, updated_at=? WHERE user_id=?"),
    patrolDailyCount: db.prepare("SELECT COUNT(*) AS count FROM world_hound_patrols WHERE actor_user_id=? AND created_at>=? AND created_at<?"),
    patrolIncomingDay: db.prepare("SELECT COUNT(*) AS count FROM world_hound_patrols WHERE target_user_id=? AND created_at>=? AND created_at<?"),
    patrolTargetDay: db.prepare("SELECT id FROM world_hound_patrols WHERE actor_user_id=? AND target_user_id=? AND created_at>=? AND created_at<? LIMIT 1"),
    insertPatrol: db.prepare(`INSERT INTO world_hound_patrols(id, actor_user_id, target_user_id, cost, status, created_at, settle_at, target_safety, target_fund, target_visitors, target_animals, fund_floor, visitor_floor, animal_floor, actor_chapter)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    pendingPatrols: db.prepare(`SELECT p.*, au.display_name AS actorName, tu.display_name AS targetName
      FROM world_hound_patrols p JOIN users au ON au.user_id=p.actor_user_id JOIN users tu ON tu.user_id=p.target_user_id
      WHERE p.status='pending' AND p.settle_at<=?`),
    settlePatrol: db.prepare(`UPDATE world_hound_patrols SET status='settled', settled_at=?, reward_fund=?, reward_visitors=?, reward_animals=?, loss_fund=?, loss_visitors=?, loss_animals=? WHERE id=? AND status='pending'`),
    sentPatrolHistory: db.prepare(`SELECT p.*, au.display_name AS actorName, tu.display_name AS targetName FROM world_hound_patrols p
      JOIN users au ON au.user_id=p.actor_user_id JOIN users tu ON tu.user_id=p.target_user_id WHERE p.actor_user_id=? ORDER BY p.created_at DESC LIMIT ?`),
    receivedPatrolHistory: db.prepare(`SELECT p.*, au.display_name AS actorName, tu.display_name AS targetName FROM world_hound_patrols p
      JOIN users au ON au.user_id=p.actor_user_id JOIN users tu ON tu.user_id=p.target_user_id WHERE p.target_user_id=? ORDER BY p.created_at DESC LIMIT ?`),
    friendContractByClientId: db.prepare(`SELECT c.id, c.actor_user_id AS actorUserId, c.target_user_id AS targetUserId,
      c.objective_id AS objectiveId, c.status, c.client_contract_id AS clientContractId,
      c.created_at AS createdAt, c.expires_at AS expiresAt, c.completed_at AS completedAt,
      u.display_name AS partnerName
      FROM friend_contracts c JOIN users u ON u.user_id=c.target_user_id
      WHERE c.actor_user_id=? AND c.client_contract_id=?`),
    activeFriendContractsByActor: db.prepare("SELECT COUNT(*) AS count FROM friend_contracts WHERE actor_user_id=? AND status='pending' AND expires_at>?"),
    insertFriendContract: db.prepare(`INSERT INTO friend_contracts(id, actor_user_id, target_user_id, objective_id, status, client_contract_id, created_at, expires_at)
      VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
      ON CONFLICT(actor_user_id, client_contract_id) DO NOTHING`),
    friendContractById: db.prepare(`SELECT c.id, c.actor_user_id AS actorUserId, c.target_user_id AS targetUserId,
      c.objective_id AS objectiveId, c.status, c.client_contract_id AS clientContractId,
      c.created_at AS createdAt, c.expires_at AS expiresAt, c.completed_at AS completedAt,
      actor.display_name AS actorName, target.display_name AS targetName
      FROM friend_contracts c JOIN users actor ON actor.user_id=c.actor_user_id
      JOIN users target ON target.user_id=c.target_user_id WHERE c.id=?`),
    expireFriendContracts: db.prepare("UPDATE friend_contracts SET status='expired', completed_at=? WHERE status='pending' AND expires_at<=?"),
    completeFriendContract: db.prepare("UPDATE friend_contracts SET status='completed', completed_at=? WHERE id=? AND target_user_id=? AND status='pending' AND expires_at>?"),
    sentFriendContracts: db.prepare(`SELECT c.id, c.actor_user_id AS actorUserId, c.target_user_id AS targetUserId,
      c.objective_id AS objectiveId, c.status, c.client_contract_id AS clientContractId,
      c.created_at AS createdAt, c.expires_at AS expiresAt, c.completed_at AS completedAt,
      target.display_name AS partnerName
      FROM friend_contracts c JOIN users target ON target.user_id=c.target_user_id
      WHERE c.actor_user_id=? ORDER BY c.created_at DESC LIMIT ?`),
    receivedFriendContracts: db.prepare(`SELECT c.id, c.actor_user_id AS actorUserId, c.target_user_id AS targetUserId,
      c.objective_id AS objectiveId, c.status, c.client_contract_id AS clientContractId,
      c.created_at AS createdAt, c.expires_at AS expiresAt, c.completed_at AS completedAt,
      actor.display_name AS partnerName
      FROM friend_contracts c JOIN users actor ON actor.user_id=c.actor_user_id
      WHERE c.target_user_id=? ORDER BY c.created_at DESC LIMIT ?`),
    insertTradeOffer: db.prepare(`INSERT INTO trade_offers(id, actor_user_id, scope, offered_item_id, offered_item_label, offered_value,
      wanted_item_id, wanted_item_label, wanted_value, motive, client_trade_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(actor_user_id, client_trade_id) DO NOTHING`),
    tradeOfferByClientId: db.prepare(`SELECT o.id, o.scope, o.offered_item_id AS offeredItemId, o.offered_item_label AS offeredItemLabel,
      o.wanted_item_id AS wantedItemId, o.wanted_item_label AS wantedItemLabel, o.motive, o.client_trade_id AS clientTradeId,
      o.status, o.created_at AS createdAt, o.matched_at AS matchedAt, substr(o.counterparty_user_id, 1, 20) AS partnerId,
      u.display_name AS partnerName FROM trade_offers o LEFT JOIN users u ON u.user_id=o.counterparty_user_id
      WHERE o.actor_user_id=? AND o.client_trade_id=?`),
    openWorldMatch: db.prepare(`SELECT o.id, o.actor_user_id AS actorUserId, o.client_trade_id AS clientTradeId,
      o.offered_item_id AS offeredItemId, o.offered_item_label AS offeredItemLabel, o.offered_value AS offeredValue,
      o.wanted_item_id AS wantedItemId, o.wanted_item_label AS wantedItemLabel, o.wanted_value AS wantedValue, o.motive, o.created_at AS createdAt
      FROM trade_offers o JOIN users u ON u.user_id=o.actor_user_id
      WHERE o.status='open' AND o.scope=? AND o.actor_user_id<>? AND o.offered_item_id=? AND o.wanted_item_id=?
      AND u.moderation_status='active' ORDER BY o.created_at ASC LIMIT 1`),
    openFriendMatch: db.prepare(`SELECT o.id, o.actor_user_id AS actorUserId, o.client_trade_id AS clientTradeId,
      o.offered_item_id AS offeredItemId, o.offered_item_label AS offeredItemLabel, o.offered_value AS offeredValue,
      o.wanted_item_id AS wantedItemId, o.wanted_item_label AS wantedItemLabel, o.wanted_value AS wantedValue, o.motive, o.created_at AS createdAt
      FROM trade_offers o JOIN users u ON u.user_id=o.actor_user_id
      WHERE o.status='open' AND o.scope='friends' AND o.actor_user_id<>? AND o.offered_item_id=? AND o.wanted_item_id=?
      AND u.moderation_status='active' AND (EXISTS(SELECT 1 FROM friend_links f WHERE f.user_id=? AND f.friend_user_id=o.actor_user_id)
      OR EXISTS(SELECT 1 FROM friend_links f WHERE f.user_id=o.actor_user_id AND f.friend_user_id=?))
      ORDER BY o.created_at ASC LIMIT 1`),
    matchTradeOffer: db.prepare("UPDATE trade_offers SET status='matched', counterparty_user_id=?, matched_offer_id=?, matched_at=? WHERE id=? AND status='open'"),
    insertMatchedReceipt: db.prepare(`INSERT INTO trade_receipts(id, actor_user_id, target_user_id, scope, item_id, item_label,
      requested_item_id, requested_item_label, trade_mode, value_points, partner_credit, client_trade_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'barter_v1', ?, 1, ?, ?)
      ON CONFLICT(actor_user_id, client_trade_id) DO NOTHING`),
    tradeOfferCountSince: db.prepare("SELECT COUNT(*) AS count FROM trade_offers WHERE actor_user_id=? AND created_at>=?"),
    openTradeHistory: db.prepare(`SELECT o.id, o.scope, o.offered_item_id AS offeredItemId, o.offered_item_label AS offeredItemLabel,
      o.wanted_item_id AS wantedItemId, o.wanted_item_label AS wantedItemLabel, o.motive, o.client_trade_id AS clientTradeId,
      o.status, o.created_at AS createdAt, 0 AS claimedAt, '' AS partnerId, '' AS partnerName
      FROM trade_offers o WHERE o.actor_user_id=? AND o.status='open' ORDER BY o.created_at DESC LIMIT ?`),
    rank: db.prepare("SELECT 1 + COUNT(*) AS rank FROM scores s JOIN users u ON u.user_id=s.user_id WHERE s.score > ? AND u.moderation_status='active'"),
    moderationRows: db.prepare(`SELECT u.user_id AS userId, u.display_name AS displayName, u.moderation_status AS moderationStatus,
      u.moderation_reason AS moderationReason, u.moderated_at AS moderatedAt, u.activated_at AS activatedAt,
      COALESCE(s.score, 0) AS score, COALESCE(s.level, 1) AS level, COALESCE(s.animals, 0) AS animals,
      COALESCE(s.shield, 0) AS shield, COALESCE(s.style, '综合守护') AS style,
      COALESCE(s.profile_version, 0) AS profileVersion, COALESCE(s.updated_at, u.updated_at) AS updatedAt
      FROM users u LEFT JOIN scores s ON s.user_id=u.user_id
      WHERE (?='all' OR u.moderation_status=?) ORDER BY u.moderated_at DESC, u.updated_at DESC LIMIT ?`),
    updateModeration: db.prepare("UPDATE users SET moderation_status=?, moderation_reason=?, moderated_at=? WHERE user_id=?"),
    insertModerationAction: db.prepare("INSERT INTO moderation_actions(target_user_id, action, reason, moderator_hash, created_at) VALUES (?, ?, ?, ?, ?)"),
    moderationHistory: db.prepare("SELECT action, reason, created_at AS createdAt FROM moderation_actions WHERE target_user_id=? ORDER BY created_at DESC LIMIT 50"),
    insertEvent: db.prepare("INSERT INTO events(created_at, event_name, install_hash, user_id, payload) VALUES (?, ?, ?, ?, ?)"),
    pruneEvents: db.prepare("DELETE FROM events WHERE id IN (SELECT id FROM events ORDER BY id DESC LIMIT -1 OFFSET 50000)")
  };

  const moderationAccess = (req, res, ip) => {
    const rate = limiter.consume(`moderation:${ip}`, 20, 60000);
    if (!rate.allowed) {
      json(res, 429, { ok: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
      return false;
    }
    if (String(moderationSecret || "").length < 32) {
      json(res, 503, { ok: false, code: "MODERATION_NOT_CONFIGURED" });
      return false;
    }
    if (!safeSecretEqual(req.headers["x-moderation-key"], moderationSecret)) {
      json(res, 401, { ok: false, code: "UNAUTHORIZED" });
      return false;
    }
    return true;
  };

  const settleDueHoundPatrols = (now = Date.now()) => {
    const due = statements.pendingPatrols.all(now);
    due.forEach((row) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        // The target snapshot is fixed when the patrol starts, so the preview
        // shown to the player and the eventual settlement are deterministic.
        // The current row is still read below to cap the actual debit if the
        // target changed its published values during the five-minute window.
        const current = statements.score.get(row.target_user_id) || row;
        const outcome = houndPatrolOutcome(row);
        const settled = statements.settlePatrol.run(now, outcome.rewardFund, outcome.rewardVisitors, outcome.rewardAnimals,
          outcome.lossFund, outcome.lossVisitors, outcome.lossAnimals, row.id);
        if (settled.changes) {
          const level = Math.max(1, Math.min(7, Math.round(Number(current.level) || 1)));
          const animalFloor = Math.max(0, Number(row.animal_floor) || 0);
          const visitorFloor = Math.max(0, Number(row.visitor_floor) || 0);
          const fundFloor = Math.max(0, Number(row.fund_floor) || 0);
          const currentAnimals = Math.max(0, Number(current.animals) || 0);
          const currentVisitors = Math.max(0, Number(current.visitors) || 0);
          const currentFund = Math.max(0, Number(current.fund) || 0);
          const afterAnimals = currentAnimals > animalFloor ? Math.max(animalFloor, currentAnimals - Math.min(outcome.lossAnimals, currentAnimals - animalFloor)) : currentAnimals;
          const afterVisitors = currentVisitors > visitorFloor ? Math.max(visitorFloor, currentVisitors - Math.min(outcome.lossVisitors, currentVisitors - visitorFloor)) : currentVisitors;
          const afterFund = currentFund > fundFloor ? Math.max(fundFloor, currentFund - Math.min(outcome.lossFund, currentFund - fundFloor)) : currentFund;
          statements.updatePatrolTarget.run(calculateReserveValuation(level, afterAnimals), afterAnimals, afterVisitors, afterFund, now, row.target_user_id);
          const actor = statements.score.get(row.actor_user_id);
          if (actor && Number(actor.profileVersion) > 0) {
            const actorLevel = Math.max(1, Math.min(7, Math.round(Number(actor.level) || 1)));
            const actorAnimals = Math.max(0, Number(actor.animals) || 0) + Math.max(0, Number(outcome.rewardAnimals) || 0);
            const actorVisitors = Math.max(0, Number(actor.visitors) || 0) + Math.max(0, Number(outcome.rewardVisitors) || 0);
            const actorFund = Math.max(0, Number(actor.fund) || 0) + Math.max(0, Number(outcome.rewardFund) || 0);
            statements.updatePatrolTarget.run(calculateReserveValuation(actorLevel, actorAnimals), actorAnimals, actorVisitors, actorFund, now, row.actor_user_id);
          }
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    });
    return due.length;
  };

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const requestId = crypto.randomBytes(6).toString("hex");
    const url = new URL(req.url || "/", "http://localhost");
    const ip = clientIp(req);
    res.setHeader("x-request-id", requestId);
    try {
      if (req.method === "GET" && url.pathname === "/health") {
        const dbState = statements.health.get();
        return json(res, 200, { ok: dbState.ok === 1, service: "wild-guard-api", version: SERVICE_VERSION, uptime: Math.floor(process.uptime()) });
      }

      if (req.method === "GET" && url.pathname === "/v1/config") {
        const config = loadConfig(configPath);
        const etag = `\"${crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex").slice(0, 16)}\"`;
        if (req.headers["if-none-match"] === etag) {
          res.writeHead(304, { etag, "cache-control": "public, max-age=60" });
          return res.end();
        }
        return json(res, 200, { ok: true, config }, { etag, "cache-control": "public, max-age=60" });
      }

      if (req.method === "POST" && url.pathname === "/v1/events") {
        const rate = limiter.consume(`events:${ip}`, 30, 60000);
        if (!rate.allowed) return json(res, 429, { ok: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
        const body = await readJson(req);
        const eventName = String(body.event || "");
        if (!/^[a-zA-Z0-9_.:-]{1,64}$/.test(eventName)) return json(res, 400, { ok: false, code: "INVALID_EVENT" });
        const installId = String(body.installId || "anonymous").slice(0, 128);
        const token = verifyToken(sessionSecret, bearer(req));
        const properties = body.properties && typeof body.properties === "object" && !Array.isArray(body.properties) ? body.properties : {};
        const payload = JSON.stringify(properties);
        if (Buffer.byteLength(payload) > 8192) return json(res, 413, { ok: false, code: "EVENT_TOO_LARGE" });
        statements.insertEvent.run(Date.now(), eventName, hmac(sessionSecret, installId), token ? token.sub : null, payload);
        eventWrites += 1;
        if (eventWrites % 500 === 0) statements.pruneEvents.run();
        return json(res, 202, { ok: true, requestId });
      }

      if (req.method === "POST" && url.pathname === "/v1/auth/wechat") {
        const rate = limiter.consume(`auth:${ip}`, 10, 60000);
        if (!rate.allowed) return json(res, 429, { ok: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
        if (!wxAppId || !wxAppSecret) return json(res, 503, { ok: false, code: "AUTH_NOT_CONFIGURED" });
        const body = await readJson(req, 4096);
        const code = String(body.code || "");
        if (!/^[a-zA-Z0-9_-]{8,160}$/.test(code)) return json(res, 400, { ok: false, code: "INVALID_LOGIN_CODE" });
        const result = await exchangeWechatCode(wxAppId, wxAppSecret, code);
        const userId = hmac(sessionSecret, `wx:${result.openid}`);
        const now = Date.now();
        statements.upsertActiveUser.run(userId, serverGeneratedIdentity(userId).title, now, now, now);
        const loginMatchKey = crypto.createHash("sha256").update(`wild-friend-v1:${result.openid}`).digest("hex");
        statements.setUserMatchKey.run(loginMatchKey, userId);
        if (result.session_key) {
          wechatSessions.set(userId, { sessionKey: String(result.session_key), expiresAt: now + 10 * 60000 });
          if (wechatSessions.size > 2000) {
            for (const [sessionUserId, session] of wechatSessions.entries()) {
              if (session.expiresAt <= now || wechatSessions.size > 10000) wechatSessions.delete(sessionUserId);
            }
          }
        }
        return json(res, 200, {
          ok: true,
          token: issueToken(sessionSecret, userId),
          publicId: userId.slice(0, 20),
          friendMatchKey: loginMatchKey,
          expiresIn: 30 * 86400
        });
      }

      if (req.method === "POST" && url.pathname === "/v1/friends/import") {
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const session = wechatSessions.get(token.sub);
        if (!session || session.expiresAt <= Date.now()) return json(res, 401, { ok: false, code: "FRIEND_SESSION_EXPIRED" });
        const body = await readJson(req, 64 * 1024);
        const relation = decryptRelationFriendData(session.sessionKey, body.encryptedData, body.iv, wxAppId);
        const now = Date.now();
        const openids = Array.from(new Set((Array.isArray(relation.list) ? relation.list : []).map((row) => String((row || {}).openid || "")).filter(Boolean))).slice(0, 500);
        let matched = 0;
        let linked = 0;
        let pending = 0;
        db.exec("BEGIN IMMEDIATE");
        try {
          statements.deleteFriendLinks.run(token.sub);
          openids.forEach((openid) => {
            const friendId = hmac(sessionSecret, `wx:${openid}`);
            if (friendId === token.sub) return;
            const activation = statements.userActivation.get(friendId);
            if (activation && Number(activation.activatedAt) > 0) matched += 1;
            else pending += 1;
            // getRelationFriendList has already established the real WeChat
            // relation. Create only a hashed placeholder; the next login for
            // that openid activates the same deterministic user row.
            statements.upsertPendingUser.run(friendId, "微信同玩好友", now, now);
            statements.upsertFriend.run(token.sub, friendId, now);
            const matchKey = crypto.createHash("sha256").update(`wild-friend-v1:${openid}`).digest("hex");
            statements.setFriendMatchKey.run(matchKey, token.sub, friendId);
            linked += 1;
          });
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        const friends = statements.friendRows.all(token.sub).map((row) => publicPlayer(row, token.sub));
        return json(res, 200, { ok: true, relationCount: openids.length, linked, matched, pending, friends });
      }

      if (req.method === "GET" && url.pathname === "/v1/friends") {
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const friends = statements.friendRows.all(token.sub).map((row) => publicPlayer(row, token.sub));
        return json(res, 200, { ok: true, friends });
      }

      if (req.method === "POST" && url.pathname === "/v1/friend-contracts") {
        const rate = limiter.consume(`friend-contract:${ip}`, 30, 60000);
        if (!rate.allowed) return json(res, 429, { ok: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const body = await readJson(req, 8192);
        const targetId = String(body.targetId || "");
        const objectiveId = String(body.objectiveId || "").slice(0, 40);
        const clientContractId = String(body.clientContractId || "");
        if (!/^[a-zA-Z0-9_-]{1,20}$/.test(targetId)
          || !/^[a-zA-Z0-9_.:-]{1,40}$/.test(objectiveId)
          || !/^[a-zA-Z0-9_-]{8,80}$/.test(clientContractId)) {
          return json(res, 400, { ok: false, code: "INVALID_FRIEND_CONTRACT" });
        }
        const targets = statements.userByPublicId.all(targetId);
        if (targets.length !== 1 || targets[0].userId === token.sub) return json(res, 404, { ok: false, code: "TARGET_NOT_FOUND" });
        const target = targets[0];
        if (!statements.isFriend.get(token.sub, target.userId)) return json(res, 403, { ok: false, code: "FRIEND_REQUIRED" });
        const now = Date.now();
        statements.expireFriendContracts.run(now, now);
        const existing = statements.friendContractByClientId.get(token.sub, clientContractId);
        if (existing) return json(res, 200, { ok: true, contract: publicFriendContract(existing, token.sub) });
        const active = Number((statements.activeFriendContractsByActor.get(token.sub, now) || {}).count) || 0;
        if (active >= 5) return json(res, 409, { ok: false, code: "FRIEND_CONTRACT_LIMIT", limit: 5 });
        const contractId = crypto.randomUUID();
        const expiresAt = now + 48 * 60 * 60 * 1000;
        statements.insertFriendContract.run(contractId, token.sub, target.userId, objectiveId, clientContractId, now, expiresAt);
        const stored = statements.friendContractByClientId.get(token.sub, clientContractId);
        return json(res, 200, { ok: true, contract: publicFriendContract(stored, token.sub) });
      }

      if (req.method === "POST" && /^\/v1\/friend-contracts\/[a-zA-Z0-9_-]+\/complete$/.test(url.pathname)) {
        const rate = limiter.consume(`friend-contract-complete:${ip}`, 30, 60000);
        if (!rate.allowed) return json(res, 429, { ok: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const contractId = url.pathname.split("/")[3];
        const now = Date.now();
        statements.expireFriendContracts.run(now, now);
        const existing = statements.friendContractById.get(contractId);
        if (!existing) return json(res, 404, { ok: false, code: "CONTRACT_NOT_FOUND" });
        if (existing.targetUserId !== token.sub) return json(res, 403, { ok: false, code: "CONTRACT_RECIPIENT_REQUIRED" });
        if (existing.status === "completed") return json(res, 200, { ok: true, contract: publicFriendContract(existing, token.sub), alreadyCompleted: true });
        if (existing.status === "expired" || Number(existing.expiresAt) <= now) return json(res, 409, { ok: false, code: "CONTRACT_EXPIRED" });
        statements.completeFriendContract.run(now, contractId, token.sub, now);
        const completed = statements.friendContractById.get(contractId);
        return json(res, 200, { ok: true, contract: publicFriendContract(completed, token.sub) });
      }

      if (req.method === "GET" && url.pathname === "/v1/friend-contracts") {
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const now = Date.now();
        statements.expireFriendContracts.run(now, now);
        const limit = Math.max(1, Math.min(100, Math.round(Number(url.searchParams.get("limit")) || 50)));
        return json(res, 200, {
          ok: true,
          sent: statements.sentFriendContracts.all(token.sub, limit).map((row) => publicFriendContract(row, token.sub)),
          received: statements.receivedFriendContracts.all(token.sub, limit).map((row) => publicFriendContract(row, token.sub)),
          maxActive: 5,
          expiryHours: 48
        });
      }

      if (req.method === "GET" && url.pathname === "/v1/trades/history") {
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const limit = Math.max(1, Math.min(50, Math.round(Number(url.searchParams.get("limit")) || 24)));
        const sentReceipts = statements.sentTradeHistory.all(token.sub, limit).map((row) => publicTradeHistory(row, "sent"));
        const openOffers = statements.openTradeHistory.all(token.sub, limit).map(publicTradeOffer);
        const sentById = {};
        sentReceipts.concat(openOffers).forEach((entry) => { sentById[entry.tradeId] = entry; });
        const sent = Object.values(sentById).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
        const received = statements.receivedTradeHistory.all(token.sub, limit).map((row) => publicTradeHistory(row, "received"));
        return json(res, 200, { ok: true, sent, received, dailyLimit: TRADE_DAILY_LIMIT });
      }

      if (req.method === "POST" && url.pathname === "/v1/trades/exchange") {
        const rate = limiter.consume(`trade:${ip}`, 30, 60000);
        if (!rate.allowed) return json(res, 429, { ok: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const body = await readJson(req, 8192);
        const scope = body.scope === "friends" ? "friends" : body.scope === "world" ? "world" : "";
        const targetId = String(body.targetId || "");
        const itemId = String(body.itemId || "");
        const wantedItemId = String(body.wantedItemId || "");
        const clientTradeId = String(body.clientTradeId || "");
        const material = TRADE_MATERIALS[itemId];
        const wantedMaterial = TRADE_MATERIALS[wantedItemId];
        if (wantedItemId) {
          if (!scope || !material || !wantedMaterial || itemId === wantedItemId || Math.abs(material.value - wantedMaterial.value) > 1
            || !/^[a-zA-Z0-9_-]{8,80}$/.test(clientTradeId)) {
            return json(res, 400, { ok: false, code: "INVALID_BARTER" });
          }
          const previous = statements.tradeOfferByClientId.get(token.sub, clientTradeId);
          if (previous) return json(res, 200, { ok: true, trade: Object.assign(publicTradeOffer(previous), { clientTradeId }) });
          const now = Date.now();
          const utcDayStart = Math.floor(now / 86400000) * 86400000;
          const usedToday = Math.max(0, Number((statements.tradeOfferCountSince.get(token.sub, utcDayStart) || {}).count) || 0);
          if (usedToday >= TRADE_DAILY_LIMIT) {
            return json(res, 429, { ok: false, code: "DAILY_TRADE_LIMIT", dailyLimit: TRADE_DAILY_LIMIT, usedToday });
          }
          const motive = TRADE_MOTIVES.has(body.motive) ? body.motive : "shortfall";
          const offerId = crypto.randomUUID();
          db.exec("BEGIN IMMEDIATE");
          try {
            statements.insertTradeOffer.run(offerId, token.sub, scope, itemId, material.label, material.value,
              wantedItemId, wantedMaterial.label, wantedMaterial.value, motive, clientTradeId, now);
            const counterpart = scope === "friends"
              ? statements.openFriendMatch.get(token.sub, wantedItemId, itemId, token.sub, token.sub)
              : statements.openWorldMatch.get(scope, token.sub, wantedItemId, itemId);
            if (counterpart) {
              statements.matchTradeOffer.run(counterpart.actorUserId, counterpart.id, now, offerId);
              statements.matchTradeOffer.run(token.sub, offerId, now, counterpart.id);
              statements.insertMatchedReceipt.run(offerId, token.sub, counterpart.actorUserId, scope, itemId, material.label,
                wantedItemId, wantedMaterial.label, material.value, clientTradeId, now);
              statements.insertMatchedReceipt.run(counterpart.id, counterpart.actorUserId, token.sub, scope,
                counterpart.offeredItemId, counterpart.offeredItemLabel, counterpart.wantedItemId, counterpart.wantedItemLabel,
                counterpart.offeredValue, counterpart.clientTradeId, counterpart.createdAt);
            }
            db.exec("COMMIT");
          } catch (error) {
            db.exec("ROLLBACK");
            throw error;
          }
          const storedOffer = statements.tradeOfferByClientId.get(token.sub, clientTradeId);
          return json(res, 200, {
            ok: true,
            trade: Object.assign(publicTradeOffer(storedOffer), {
              clientTradeId,
              dailyUsed: usedToday + 1,
              dailyLimit: TRADE_DAILY_LIMIT
            })
          });
        }
        if (!scope || !/^[a-zA-Z0-9_-]{1,20}$/.test(targetId) || !material || !/^[a-zA-Z0-9_-]{8,80}$/.test(clientTradeId)) {
          return json(res, 400, { ok: false, code: "INVALID_TRADE" });
        }
        const targets = statements.userByPublicId.all(targetId);
        if (targets.length !== 1 || targets[0].userId === token.sub) return json(res, 404, { ok: false, code: "TARGET_NOT_FOUND" });
        const target = targets[0];
        if (scope === "friends" && !statements.isFriend.get(token.sub, target.userId)) return json(res, 403, { ok: false, code: "FRIEND_REQUIRED" });
        const valuePoints = material.value;
        const partnerCredit = Math.max(1, Math.min(40, scope === "friends" ? valuePoints * 2 : valuePoints));
        const now = Date.now();
        const tradeId = crypto.randomUUID();
        statements.insertTrade.run(tradeId, token.sub, target.userId, scope, itemId, material.label, valuePoints, partnerCredit, clientTradeId, now);
        const receipt = statements.tradeByClientId.get(token.sub, clientTradeId);
        return json(res, 200, { ok: true, trade: Object.assign({}, receipt, { tradeId: receipt.id, targetId, targetName: target.displayName }) });
      }

      if (req.method === "POST" && url.pathname === "/v1/trades/inbox/claim") {
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const claimedAt = Date.now();
        const trades = statements.pendingTrades.all(token.sub).map((row) => Object.assign({}, row, {
          tradeId: row.id,
          claimed: true,
          claimedAt
        }));
        if (trades.length) statements.claimTrades.run(claimedAt, token.sub);
        return json(res, 200, { ok: true, trades });
      }

      if (req.method === "POST" && url.pathname === "/v1/world-patrols") {
        const rate = limiter.consume(`hound-patrol:${ip}`, 20, 60000);
        if (!rate.allowed) return json(res, 429, { ok: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const body = await readJson(req, 8192);
        const targetId = String(body.targetId || "").replace(/^cloud_/, "").slice(0, 20);
        const clientPatrolId = String(body.clientPatrolId || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
        const cost = Math.round(Number(body.cost));
        if (!/^[a-zA-Z0-9_-]{1,20}$/.test(targetId) || !clientPatrolId || !Number.isInteger(cost) || cost < HOUND_PATROL_COST_MIN || cost > HOUND_PATROL_COST_MAX) {
          return json(res, 400, { ok: false, code: "INVALID_PATROL" });
        }
        const targets = statements.userByPublicId.all(targetId);
        if (targets.length !== 1 || targets[0].userId === token.sub) return json(res, 404, { ok: false, code: "TARGET_NOT_FOUND" });
        const targetUser = targets[0];
        const score = db.prepare("SELECT score, level, animals, safety, visitors, fund, profile_version AS profileVersion FROM scores WHERE user_id=?").get(targetUser.userId);
        if (!score || Number(score.profileVersion) <= 0) return json(res, 409, { ok: false, code: "TARGET_PROFILE_NOT_READY" });
        const actorScore = statements.score.get(token.sub);
        if (actorScore && Number(actorScore.profileVersion) > 0 && Math.max(0, Number(actorScore.fund) || 0) < cost) {
          return json(res, 409, { ok: false, code: "INSUFFICIENT_FUND" });
        }
        const now = Date.now();
        const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
        const dayEnd = dayStart.getTime() + 86400000;
        if (statements.patrolDailyCount.get(token.sub, dayStart.getTime(), dayEnd).count >= HOUND_PATROL_DAILY_LIMIT) return json(res, 409, { ok: false, code: "DAILY_LIMIT" });
        if (statements.patrolTargetDay.get(token.sub, targetUser.userId, dayStart.getTime(), dayEnd)) return json(res, 409, { ok: false, code: "TARGET_ALREADY_PATROLLED" });
        if (statements.patrolIncomingDay.get(targetUser.userId, dayStart.getTime(), dayEnd).count >= HOUND_PATROL_INCOMING_DAILY_LIMIT) return json(res, 409, { ok: false, code: "TARGET_DAILY_FULL" });
        const existing = statements.patrolById.get(clientPatrolId);
        if (existing) {
          if (existing.actor_user_id !== token.sub) return json(res, 409, { ok: false, code: "PATROL_ID_CONFLICT" });
          return json(res, 200, { ok: true, patrol: publicHoundPatrol(existing, token.sub) });
        }
        const floors = body.floors && typeof body.floors === "object" ? body.floors : {};
        const actorChapter = Math.max(1, Math.min(20, Math.round(Number(body.actorChapter) || Number(floors.actorChapter) || 1)));
        statements.insertPatrol.run(clientPatrolId, token.sub, targetUser.userId, cost, now, now + HOUND_PATROL_DELAY_MS,
          Math.max(0, Math.min(100, Math.round(Number.isFinite(Number(score.safety)) ? Number(score.safety) : 50))), Math.max(0, Math.round(Number(score.fund) || 0)),
          Math.max(0, Math.round(Number(score.visitors) || 0)), Math.max(0, Math.round(Number(score.animals) || 0)),
          Math.max(0, Math.round(Number(floors.fund) || 0)), Math.max(0, Math.round(Number(floors.visitors) || 0)), Math.max(0, Math.round(Number(floors.animals) || 0)),
          actorChapter);
        const patrol = statements.patrolById.get(clientPatrolId);
        return json(res, 201, { ok: true, patrol: publicHoundPatrol(patrol, token.sub) });
      }

      if (req.method === "GET" && url.pathname === "/v1/world-patrols") {
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        settleDueHoundPatrols(Date.now());
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 50));
        const sent = statements.sentPatrolHistory.all(token.sub, limit).map((row) => publicHoundPatrol(row, token.sub));
        const received = statements.receivedPatrolHistory.all(token.sub, limit).map((row) => publicHoundPatrol(row, token.sub));
        return json(res, 200, { ok: true, sent, received });
      }

      if (req.method === "GET" && url.pathname === "/v1/leaderboard") {
        const rate = limiter.consume(`leaderboard:${ip}`, 60, 60000);
        if (!rate.allowed) return json(res, 429, { ok: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 100));
        const viewer = verifyToken(sessionSecret, bearer(req));
        const leaderboard = statements.leaderboard.all(limit).map((entry, index) => {
          const entryUserId = entry.userId || entry.user_id || "";
          // 登录观众可以拿到不透明匹配键，用于在开放数据域里叠微信昵称；
          // 未登录请求仍只返回服务器公开身份。
          const relation = viewer && entryUserId && entryUserId !== viewer.sub
            ? statements.isFriend.get(viewer.sub, entryUserId) : null;
          const matchKey = (relation && relation.matchKey) || entry.matchKey || "";
          return Object.assign(publicPlayer(Object.assign({}, entry, { matchKey }), viewer && viewer.sub), {
            rank: index + 1, friend: !!relation,
            ...(relation && relation.matchKey ? { friendMatchKey: relation.matchKey } : {})
          });
        });
        return json(res, 200, { ok: true, leaderboard, scoring: "level-animal-v1", identitySource: "server" });
      }

      if (req.method === "GET" && url.pathname === "/v1/moderation/leaderboard") {
        if (!moderationAccess(req, res, ip)) return;
        const requestedStatus = String(url.searchParams.get("status") || "pending_review");
        const allowedStatuses = new Set(["all", "active", "pending_review", "blocked", "taken_down"]);
        if (!allowedStatuses.has(requestedStatus)) return json(res, 400, { ok: false, code: "INVALID_MODERATION_STATUS" });
        const limit = Math.max(1, Math.min(100, Math.round(Number(url.searchParams.get("limit")) || 50)));
        const entries = statements.moderationRows.all(requestedStatus, requestedStatus, limit).map((row) => Object.assign(
          publicPlayer(row),
          { moderationStatus: row.moderationStatus, moderationReason: row.moderationReason, moderatedAt: Math.max(0, Number(row.moderatedAt) || 0) }
        ));
        const targetId = String(url.searchParams.get("targetId") || "");
        let history = [];
        if (targetId) {
          if (!/^[a-zA-Z0-9_-]{1,20}$/.test(targetId)) return json(res, 400, { ok: false, code: "INVALID_TARGET" });
          const targets = statements.anyUserByPublicId.all(targetId);
          if (targets.length !== 1) return json(res, 404, { ok: false, code: "TARGET_NOT_FOUND" });
          history = statements.moderationHistory.all(targets[0].userId);
        }
        return json(res, 200, { ok: true, entries, history });
      }

      if (req.method === "POST" && url.pathname === "/v1/moderation/leaderboard/status") {
        if (!moderationAccess(req, res, ip)) return;
        const body = await readJson(req, 4096);
        const targetId = String(body.targetId || "");
        const action = String(body.action || "");
        const reason = MODERATION_REASONS.has(String(body.reason || "")) ? String(body.reason) : "other";
        if (!/^[a-zA-Z0-9_-]{1,20}$/.test(targetId) || !MODERATION_STATUS[action]) {
          return json(res, 400, { ok: false, code: "INVALID_MODERATION_ACTION" });
        }
        const targets = statements.anyUserByPublicId.all(targetId);
        if (targets.length !== 1) return json(res, 404, { ok: false, code: "TARGET_NOT_FOUND" });
        const target = targets[0];
        const status = MODERATION_STATUS[action];
        const now = Date.now();
        db.exec("BEGIN IMMEDIATE");
        try {
          statements.updateModeration.run(status, reason, now, target.userId);
          statements.insertModerationAction.run(target.userId, action, reason, hmac(sessionSecret, String(moderationSecret)), now);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        return json(res, 200, { ok: true, targetId, moderationStatus: status, reason, visible: status === "active" });
      }

      if (req.method === "GET" && url.pathname === "/v1/player-save") {
        const rate = limiter.consume(`player-save-read:${ip}`, 60, 60000);
        if (!rate.allowed) return json(res, 429, { ok: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const row = statements.playerSave.get(token.sub);
        if (!row || !row.payload) return json(res, 200, { ok: true, found: false });
        let state = null;
        try { state = JSON.parse(row.payload); } catch (error) { state = null; }
        if (!state || !state.world) return json(res, 200, { ok: true, found: false });
        return json(res, 200, { ok: true, found: true, savedAt: Number(row.savedAt) || 0, state });
      }

      if (req.method === "PUT" && url.pathname === "/v1/player-save") {
        const rate = limiter.consume(`player-save-write:${ip}`, 30, 60000);
        if (!rate.allowed) return json(res, 429, { ok: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const body = await readJson(req, PLAYER_SAVE_MAX_BYTES + 4096);
        const packed = playerSaveSnapshot(body.state, Date.now());
        if (!packed) return json(res, 400, { ok: false, code: "INVALID_SAVE" });
        const now = Date.now();
        const displayName = serverGeneratedIdentity(token.sub).title;
        statements.upsertActiveUser.run(token.sub, displayName, now, now, now);
        const existing = statements.playerSave.get(token.sub);
        if (existing && Number(existing.savedAt) >= packed.savedAt) {
          return json(res, 200, { ok: true, stored: false, savedAt: Number(existing.savedAt) || 0 });
        }
        statements.upsertPlayerSave.run(token.sub, packed.savedAt, now, packed.payload);
        return json(res, 200, { ok: true, stored: true, savedAt: packed.savedAt });
      }

      if (req.method === "POST" && url.pathname === "/v1/leaderboard/score") {
        const rate = limiter.consume(`score:${ip}`, 30, 60000);
        if (!rate.allowed) return json(res, 429, { ok: false, code: "RATE_LIMITED" }, { "retry-after": "60" });
        const token = verifyToken(sessionSecret, bearer(req));
        if (!token) return json(res, 401, { ok: false, code: "UNAUTHORIZED" });
        const body = await readJson(req, 4096);
        const score = Number(body.score);
        if (!Number.isInteger(score) || score < 0 || score > 10000000) return json(res, 400, { ok: false, code: "INVALID_SCORE" });
        const now = Date.now();
        const displayName = serverGeneratedIdentity(token.sub).title;
        const hasProfile = ["level", "animals", "shield", "style"].every((key) => Object.prototype.hasOwnProperty.call(body, key))
          && Number.isFinite(Number(body.level)) && Number.isFinite(Number(body.animals)) && Number(body.animals) >= 0
          && Number.isFinite(Number(body.shield)) && Number(body.shield) >= 0;
        const level = Math.max(1, Math.min(7, Math.round(Number(body.level) || 1)));
        const animals = Math.max(0, Math.min(99999, Math.round(Number(body.animals) || 0)));
        const shield = Math.max(0, Math.min(100, Math.round(Number(body.shield) || 0)));
        const safety = Math.max(0, Math.min(100, Math.round(Number(body.safety) || 0)));
        const visitors = Math.max(0, Math.min(999999, Math.round(Number(body.visitors) || 0)));
        const fund = Math.max(0, Math.min(100000000, Math.round(Number(body.fund) || 0)));
        const style = serverOwnedStyle(body.style);
        statements.upsertActiveUser.run(token.sub, displayName, now, now, now);
        const previous = statements.score.get(token.sub);
        const storedLevel = !hasProfile && previous && Number(previous.profileVersion) > 0 ? previous.level : level;
        const storedAnimals = !hasProfile && previous && Number(previous.profileVersion) > 0 ? previous.animals : animals;
        const serverScore = calculateReserveValuation(storedLevel, storedAnimals);
        if (hasProfile) statements.upsertScoreProfile.run(token.sub, serverScore, level, animals, shield, safety, visitors, fund, style, now);
        else statements.upsertScoreBasic.run(token.sub, serverScore, now);
        const stored = statements.score.get(token.sub) || { score: 0 };
        const moderation = statements.userModeration.get(token.sub) || { status: "active" };
        const visible = moderation.status === "active";
        const rank = visible ? statements.rank.get(stored.score).rank : null;
        return json(res, 200, { ok: true, score: stored.score, rank, visible });
      }

      return json(res, 404, { ok: false, code: "NOT_FOUND" });
    } catch (error) {
      const status = error.statusCode || (error.publicCode ? 502 : 500);
      console.error(JSON.stringify({ level: "error", requestId, path: url.pathname, code: error.publicCode || "INTERNAL", message: error.message }));
      return json(res, status, { ok: false, code: error.publicCode || (status === 400 ? "INVALID_JSON" : status === 413 ? "PAYLOAD_TOO_LARGE" : "INTERNAL"), requestId });
    } finally {
      console.log(JSON.stringify({ level: "info", requestId, method: req.method, path: url.pathname, status: res.statusCode, durationMs: Date.now() - started }));
    }
  });

  server.on("close", () => db.close());
  return server;
}

if (require.main === module) {
  const port = Math.max(1, Math.min(65535, Number(process.env.PORT) || 3117));
  const host = process.env.HOST || "127.0.0.1";
  const server = createApiServer();
  server.listen(port, host, () => console.log(JSON.stringify({ level: "info", message: "wild-guard-api started", host, port, version: SERVICE_VERSION })));
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

module.exports = { createApiServer, issueToken, verifyToken, sanitizeDisplayName, serverGeneratedIdentity, serverOwnedStyle, decryptRelationFriendData, clientIp, RateLimiter, calculateReserveValuation };
