"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const net = require("node:net");
const { DatabaseSync } = require("node:sqlite");
const { calculateReserveValuation } = require("./reserveValuation");

const SERVICE_VERSION = "1.8.1";
const MAX_JSON_BYTES = 16 * 1024;
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
    CREATE TABLE IF NOT EXISTS moderation_actions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK(action IN ('review', 'block', 'takedown', 'restore')),
      reason TEXT NOT NULL,
      moderator_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS moderation_actions_target_idx ON moderation_actions(target_user_id, created_at DESC);
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
  return db;
}

function loadConfig(configPath) {
  const body = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return Object.assign({ version: 1, features: {} }, body);
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
    upsertActiveUser: db.prepare(`INSERT INTO users(user_id, display_name, created_at, updated_at, activated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name, updated_at=excluded.updated_at, activated_at=MAX(users.activated_at, excluded.activated_at)`),
    upsertPendingUser: db.prepare(`INSERT INTO users(user_id, display_name, created_at, updated_at, activated_at) VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(user_id) DO NOTHING`),
    userActivation: db.prepare("SELECT activated_at AS activatedAt FROM users WHERE user_id=?"),
    userModeration: db.prepare("SELECT moderation_status AS status FROM users WHERE user_id=?"),
    score: db.prepare("SELECT score, level, animals, profile_version AS profileVersion FROM scores WHERE user_id=?"),
    upsertScoreProfile: db.prepare(`INSERT INTO scores(user_id, score, level, animals, shield, style, profile_version, updated_at) VALUES (?, ?, ?, ?, ?, ?, 2, ?)
      ON CONFLICT(user_id) DO UPDATE SET score=excluded.score, level=excluded.level, animals=excluded.animals,
      shield=excluded.shield, style=excluded.style, profile_version=excluded.profile_version, updated_at=excluded.updated_at`),
    upsertScoreBasic: db.prepare(`INSERT INTO scores(user_id, score, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET score=excluded.score, updated_at=excluded.updated_at`),
    leaderboard: db.prepare(`SELECT u.user_id AS userId, u.display_name AS displayName, u.friend_match_key AS matchKey, s.score, s.level, s.animals, s.shield, s.style, s.profile_version AS profileVersion, s.updated_at AS updatedAt
      FROM scores s JOIN users u ON u.user_id=s.user_id WHERE u.moderation_status='active' ORDER BY s.score DESC, s.updated_at ASC LIMIT ?`),
    userByPublicId: db.prepare("SELECT user_id AS userId, display_name AS displayName FROM users WHERE substr(user_id, 1, 20)=? AND moderation_status='active' LIMIT 2"),
    anyUserByPublicId: db.prepare("SELECT user_id AS userId, display_name AS displayName, moderation_status AS moderationStatus, moderation_reason AS moderationReason, moderated_at AS moderatedAt FROM users WHERE substr(user_id, 1, 20)=? LIMIT 2"),
    friendRows: db.prepare(`SELECT u.user_id AS userId, u.display_name AS displayName, COALESCE(s.score, 0) AS score,
      COALESCE(s.level, 1) AS level, COALESCE(s.animals, 0) AS animals, COALESCE(s.shield, 0) AS shield,
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
        const style = serverOwnedStyle(body.style);
        statements.upsertActiveUser.run(token.sub, displayName, now, now, now);
        const previous = statements.score.get(token.sub);
        const storedLevel = !hasProfile && previous && Number(previous.profileVersion) > 0 ? previous.level : level;
        const storedAnimals = !hasProfile && previous && Number(previous.profileVersion) > 0 ? previous.animals : animals;
        const serverScore = calculateReserveValuation(storedLevel, storedAnimals);
        if (hasProfile) statements.upsertScoreProfile.run(token.sub, serverScore, level, animals, shield, style, now);
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
