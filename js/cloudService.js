const CLOUD_BASE_URL = "https://wild.hubao.tv";
const SESSION_STORAGE_KEY = "wild_guard_cloud_session_v1";
const CONFIG_STORAGE_KEY = "wild_guard_remote_config_v1";
const INSTALL_STORAGE_KEY = "wild_guard_install_id_v1";
const { calculateReserveValuation } = require("./reserveValuation");

const DEFAULT_REMOTE_CONFIG = Object.freeze({
  version: 1,
  minimumClientVersion: "0.3.1",
  maintenance: false,
    features: Object.freeze({
    worldLeaderboard: true,
    socialTrade: false,
    reciprocalTrade: false,
    telemetry: false,
    cloudSave: false,
    remoteBalance: false
  }),
  balance: Object.freeze({
    emergencySupplyDailyLimit: 1,
    eventUploadSampleRate: 0
  }),
  assets: Object.freeze({
    artAtlas: Object.freeze({ url: "", version: "" }),
    premiumUiAtlas: Object.freeze({ url: "", version: "" }),
    wildernessMaterialAtlas: Object.freeze({ url: "", version: "" }),
    animalPortraitAtlas: Object.freeze({ url: "", version: "" }),
    animalMapSprites: Object.freeze({ url: "", version: "" }),
    facilities: Object.freeze({ url: "", version: "" }),
    collectionItems: Object.freeze({ url: "", version: "" })
  }),
  messages: Object.freeze({ maintenance: "保护区正在维护，请稍后回来。" })
});

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function safeConfig(input = {}) {
  const features = input.features && typeof input.features === "object" ? input.features : {};
  const balance = input.balance && typeof input.balance === "object" ? input.balance : {};
  const messages = input.messages && typeof input.messages === "object" ? input.messages : {};
  const assets = input.assets && typeof input.assets === "object" ? input.assets : {};
  const artAtlas = assets.artAtlas && typeof assets.artAtlas === "object" ? assets.artAtlas : {};
  const premiumUiAtlas = assets.premiumUiAtlas && typeof assets.premiumUiAtlas === "object" ? assets.premiumUiAtlas : {};
  const wildernessMaterialAtlas = assets.wildernessMaterialAtlas && typeof assets.wildernessMaterialAtlas === "object" ? assets.wildernessMaterialAtlas : {};
  const animalPortraitAtlas = assets.animalPortraitAtlas && typeof assets.animalPortraitAtlas === "object" ? assets.animalPortraitAtlas : {};
  const animalMapSprites = assets.animalMapSprites && typeof assets.animalMapSprites === "object" ? assets.animalMapSprites : {};
  const facilities = assets.facilities && typeof assets.facilities === "object" ? assets.facilities : {};
  const collectionItems = assets.collectionItems && typeof assets.collectionItems === "object" ? assets.collectionItems : {};
  const rawArtUrl = String(artAtlas.url || "").trim();
  const safeArtUrl = /^https:\/\/wild\.hubao\.tv\/[a-zA-Z0-9/_.,-]+\.(?:png|jpg|jpeg|webp)(?:\?[a-zA-Z0-9=&_.-]+)?$/.test(rawArtUrl) ? rawArtUrl : "";
  const rawPremiumUiUrl = String(premiumUiAtlas.url || "").trim();
  const safePremiumUiUrl = /^https:\/\/wild\.hubao\.tv\/[a-zA-Z0-9/_.,-]+\.(?:png|jpg|jpeg|webp)(?:\?[a-zA-Z0-9=&_.-]+)?$/.test(rawPremiumUiUrl) ? rawPremiumUiUrl : "";
  const rawWildernessMaterialUrl = String(wildernessMaterialAtlas.url || "").trim();
  const safeWildernessMaterialUrl = /^https:\/\/wild\.hubao\.tv\/[a-zA-Z0-9/_.,-]+\.(?:png|jpg|jpeg|webp)(?:\?[a-zA-Z0-9=&_.-]+)?$/.test(rawWildernessMaterialUrl) ? rawWildernessMaterialUrl : "";
  const rawAnimalPortraitUrl = String(animalPortraitAtlas.url || "").trim();
  const safeAnimalPortraitUrl = /^https:\/\/wild\.hubao\.tv\/[a-zA-Z0-9/_.,-]+\.(?:png|jpg|jpeg|webp)(?:\?[a-zA-Z0-9=&_.-]+)?$/.test(rawAnimalPortraitUrl) ? rawAnimalPortraitUrl : "";
  const hostedAsset = (input = {}) => {
    const rawUrl = String(input.url || "").trim();
    const url = /^https:\/\/wild\.hubao\.tv\/[a-zA-Z0-9/_.,-]+\.(?:png|jpg|jpeg|webp)(?:\?[a-zA-Z0-9=&_.-]+)?$/.test(rawUrl) ? rawUrl : "";
    return { url, version: String(input.version || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 48) };
  };
  return {
    version: Math.max(1, Math.round(clampNumber(input.version, 1, 999999, 1))),
    minimumClientVersion: String(input.minimumClientVersion || "0.3.1").slice(0, 24),
    maintenance: input.maintenance === true,
    features: {
      worldLeaderboard: features.worldLeaderboard === true,
      socialTrade: features.socialTrade === true,
      reciprocalTrade: features.reciprocalTrade === true,
      telemetry: features.telemetry === true,
      cloudSave: features.cloudSave === true,
      remoteBalance: features.remoteBalance === true
    },
    balance: {
      emergencySupplyDailyLimit: Math.round(clampNumber(balance.emergencySupplyDailyLimit, 1, 5, 1)),
      eventUploadSampleRate: clampNumber(balance.eventUploadSampleRate, 0, 1, 0)
    },
    assets: {
      artAtlas: {
        url: safeArtUrl,
        version: String(artAtlas.version || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 48)
      },
      premiumUiAtlas: {
        url: safePremiumUiUrl,
        version: String(premiumUiAtlas.version || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 48)
      },
      wildernessMaterialAtlas: {
        url: safeWildernessMaterialUrl,
        version: String(wildernessMaterialAtlas.version || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 48)
      },
      animalPortraitAtlas: {
        url: safeAnimalPortraitUrl,
        version: String(animalPortraitAtlas.version || "").replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 48)
      },
      animalMapSprites: hostedAsset(animalMapSprites),
      facilities: hostedAsset(facilities),
      collectionItems: hostedAsset(collectionItems)
    },
    messages: {
      maintenance: String(messages.maintenance || DEFAULT_REMOTE_CONFIG.messages.maintenance).slice(0, 80)
    }
  };
}

function normalizeReserveRankName(value) {
  const text = String(value || "").trim().replace(/保护区$/, "");
  return text.slice(0, 20) || "未命名哨站";
}

function normalizeLeaderboardOwnerName(value) {
  return String(value || "").trim().replace(/^卫士\s*[·・•.\-_:：]?\s*/, "").trim().slice(0, 20);
}

function leaderboardOwnerName(entry = {}, index = 0) {
  const explicit = normalizeLeaderboardOwnerName(entry.ownerName);
  if (explicit) return explicit;
  const publicId = String(entry.id || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase();
  return publicId || `远方玩家${index + 1}`;
}

function leaderboardIdentity(entry = {}, index = 0) {
  const raw = String(entry.displayName || entry.reserveName || "远方哨站").trim().slice(0, 40);
  const delimiter = raw.indexOf("的");
  const parsedOwner = delimiter > 0 ? normalizeLeaderboardOwnerName(raw.slice(0, delimiter)) : "";
  const parsedReserve = delimiter > 0 ? raw.slice(delimiter + 1).trim() : raw;
  const ownerName = parsedOwner || leaderboardOwnerName(entry, index);
  const reserveName = normalizeReserveRankName(entry.reserveName || parsedReserve);
  return { ownerName, reserveName, title: `${ownerName}的${reserveName}` };
}

function sumAnimals(group) {
  return Object.keys(group || {}).reduce((sum, key) => sum + (Number(group[key]) || 0), 0);
}

function reserveAnimalTotal({ ecology = {}, base = {} } = {}) {
  return sumAnimals(ecology.predators) + sumAnimals(ecology.herbivores) + sumAnimals(ecology.birds)
    || sumAnimals(base.protectedAnimals) || Number(base.animals) || 0;
}

function rankRecord(reserve = {}, valuation) {
  const base = reserve.base || {};
  const progression = reserve.progression || {};
  const level = Math.max(1, Math.min(7, Math.round(Number(progression.level) || 1)));
  const animals = Math.max(0, Math.min(99999, Math.round(reserveAnimalTotal(reserve))));
  // Ignore legacy/caller-supplied valuation. Every ranking surface must derive
  // the same score from the two visible, auditable inputs.
  const marketValue = calculateReserveValuation(level, animals);
  const reserveName = normalizeReserveRankName(base.name || "我的保护区");
  const ownerName = normalizeLeaderboardOwnerName(base.ownerName || reserve.ownerName);
  return {
    score: Math.max(0, Math.min(10000000, Math.round(Number(marketValue) || 0))),
    displayName: ownerName ? `${ownerName}的${reserveName}`.slice(0, 40) : reserveName,
    ownerName,
    reserveName,
    profileVersion: 2,
    level,
    animals,
    shield: Math.max(0, Math.min(100, Math.round(Number(base.shield) || 0))),
    style: String(base.style || progression.title || "综合守护").trim().slice(0, 20) || "综合守护"
  };
}

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || "world");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function leaderboardRow(entry = {}, index = 0) {
  const rating = Math.max(0, Math.round(Number(entry.score) || 0));
  const pendingFriend = entry.registered === false && String(entry.displayName || "") === "微信同玩好友";
  const identity = pendingFriend
    ? { ownerName: `微信同玩好友 ${index + 1}`, reserveName: "保护区", title: `微信同玩好友 ${index + 1}` }
    : leaderboardIdentity(entry, index);
  const name = identity.title;
  const seed = stableHash(`${entry.id || ""}|${name}|${entry.updatedAt || index}`);
  const styles = ["水源经营", "夜间巡护", "草场恢复", "社区共生", "迁徙通道", "动物救助"];
  const hasProfile = entry.profileComplete === true || (entry.profileComplete !== false
    && Number(entry.animals) > 0 && Number(entry.shield) > 0 && Number.isFinite(Number(entry.level)));
  return {
    id: `cloud_${String(entry.id || seed).slice(0, 32)}`,
    name,
    owner: identity.ownerName,
    reserveName: identity.reserveName,
    rank: Math.max(0, Math.round(Number(entry.rank) || 0)),
    valuation: rating,
    rating,
    level: hasProfile ? Math.max(1, Math.min(7, Math.round(Number(entry.level)))) : 1,
    shield: hasProfile ? Math.max(0, Math.min(100, Math.round(Number(entry.shield)))) : 24 + (seed % 49),
    animals: hasProfile ? Math.max(0, Math.min(99999, Math.round(Number(entry.animals)))) : 26 + (Math.floor(seed / 7) % 39),
    material: 80 + (Math.floor(seed / 13) % 151),
    style: String(entry.style || styles[seed % styles.length]).slice(0, 20),
    profileComplete: hasProfile,
    scope: "world",
    simulated: false,
    source: "cloud",
    registered: entry.registered !== false,
    friend: entry.friend === true,
    friendMatchKey: /^[a-f0-9]{64}$/.test(entry.friendMatchKey || "") ? entry.friendMatchKey : "",
    worldPlayerId: String(entry.worldPlayerId || entry.id || "").replace(/^cloud_/, "").slice(0, 32),
    mine: entry.mine === true,
    updatedAt: Math.max(0, Number(entry.updatedAt) || 0)
  };
}

function tradeMailboxRow(entry = {}, direction = "sent") {
  const itemLabel = String(entry.itemLabel || entry.label || "生存素材").slice(0, 24);
  return {
    tradeId: String(entry.tradeId || entry.id || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
    direction: direction === "received" || entry.direction === "received" ? "received" : "sent",
    scope: entry.scope === "friends" ? "friends" : "world",
    itemId: String(entry.itemId || "").slice(0, 40),
    itemLabel,
    label: itemLabel,
    wantedItemId: String(entry.wantedItemId || entry.requestedItemId || "").slice(0, 40),
    wantedItemLabel: String(entry.wantedItemLabel || entry.requestedItemLabel || "").slice(0, 24),
    mode: entry.mode === "barter_v1" || entry.tradeMode === "barter_v1" ? "barter_v1" : "legacy",
    status: ["open", "matched", "claimed", "cancelled"].includes(entry.status) ? entry.status : "matched",
    motive: String(entry.motive || "shortfall").slice(0, 16),
    partnerId: String(entry.partnerId || entry.targetId || "").slice(0, 32),
    partnerName: String(entry.partnerName || entry.targetName || "远方保护区").slice(0, 24),
    partnerCredit: Math.max(0, Math.min(99, Math.round(Number(entry.partnerCredit) || 0))),
    createdAt: Math.max(0, Number(entry.createdAt) || 0),
    claimedAt: Math.max(0, Number(entry.claimedAt) || 0),
    claimed: entry.claimed === true || Number(entry.claimedAt) > 0
  };
}

function mergeTradeMailboxRows(current = [], incoming = [], direction = "sent") {
  const rows = {};
  (current || []).concat(incoming || []).forEach((entry) => {
    const row = tradeMailboxRow(entry, direction);
    if (!row.tradeId) return;
    rows[row.tradeId] = Object.assign({}, rows[row.tradeId] || {}, row);
  });
  return Object.keys(rows).map((id) => rows[id]).sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
}

class CloudServiceController {
  constructor(runtime, options = {}) {
    this.runtime = runtime || {};
    this.baseUrl = String(options.baseUrl || CLOUD_BASE_URL).replace(/\/$/, "");
    this.now = typeof options.now === "function" ? options.now : () => Date.now();
    this.random = typeof options.random === "function" ? options.random : Math.random;
    this.onChange = typeof options.onChange === "function" ? options.onChange : () => {};
    this.requestTimeout = Math.max(1500, Number(options.requestTimeout) || 5000);
    this.scoreSyncIntervalMs = Math.max(1000, Number(options.scoreSyncIntervalMs) || 15000);
    this.leaderboardRefreshMs = Math.max(5000, Number(options.leaderboardRefreshMs) || 60000);
    this.supported = typeof this.runtime.request === "function";
    this.status = this.supported ? "idle" : "unsupported";
    this.authStatus = typeof this.runtime.login === "function" && this.supported ? "idle" : "unsupported";
    this.configStatus = this.supported ? "idle" : "unsupported";
    this.lastError = "";
    this.lastScoreSignature = "";
    this.lastScoreSyncAt = 0;
    this.lastLeaderboardAt = 0;
    this.leaderboardAuthed = false;
    this.sessionMatchKeyAttempted = false;
    this.syncPromise = null;
    this.loginPromise = null;
    this.configPromise = null;
    this.leaderboardPromise = null;
    this.friendPromise = null;
    this.tradePromise = null;
    this.tradeMailboxPromise = null;
    this.rows = [];
    this.friendRows = [];
    this.friendStatus = "idle";
    this.friendRelationCount = 0;
    this.friendMatchedCount = 0;
    this.friendPendingCount = 0;
    this.tradeMailbox = { sent: [], received: [] };
    this.tradeMailboxStatus = "idle";
    this.myRank = 0;
    this.myScore = 0;
    this.session = this.readSession();
    this.remoteConfig = this.readCachedConfig();
    this.installId = this.readInstallId();
    if (this.session.token && this.session.expiresAt > this.now() + 60000) this.authStatus = "authenticated";
  }

  notify() {
    try { this.onChange(this.status); } catch (error) { /* cloud UI callbacks never block play */ }
  }

  readStorage(key) {
    try { return this.runtime.getStorageSync ? this.runtime.getStorageSync(key) : null; } catch (error) { return null; }
  }

  writeStorage(key, value) {
    try { if (this.runtime.setStorageSync) this.runtime.setStorageSync(key, value); } catch (error) { /* keep memory fallback */ }
  }

  readSession() {
    const saved = this.readStorage(SESSION_STORAGE_KEY) || {};
    const token = typeof saved.token === "string" ? saved.token : "";
    const expiresAt = Math.max(0, Number(saved.expiresAt) || 0);
    const friendMatchKey = /^[a-f0-9]{64}$/.test(String(saved.friendMatchKey || "")) ? String(saved.friendMatchKey) : "";
    return token && expiresAt > this.now() + 60000
      ? { token, expiresAt, publicId: String(saved.publicId || ""), friendMatchKey }
      : { token: "", expiresAt: 0, publicId: "", friendMatchKey: "" };
  }

  readCachedConfig() {
    const cached = this.readStorage(CONFIG_STORAGE_KEY) || {};
    return {
      value: safeConfig(cached.value || DEFAULT_REMOTE_CONFIG),
      etag: String(cached.etag || ""),
      updatedAt: Math.max(0, Number(cached.updatedAt) || 0)
    };
  }

  readInstallId() {
    const saved = String(this.readStorage(INSTALL_STORAGE_KEY) || "");
    if (/^[a-zA-Z0-9_-]{12,80}$/.test(saved)) return saved;
    const generated = `wg_${this.now().toString(36)}_${Math.floor(this.random() * 0x7fffffff).toString(36)}`;
    this.writeStorage(INSTALL_STORAGE_KEY, generated);
    return generated;
  }

  config() {
    return this.remoteConfig.value;
  }

  feature(name) {
    return !!((this.config().features || {})[name]);
  }

  request(path, options = {}) {
    if (!this.supported) return Promise.reject(new Error("REQUEST_UNSUPPORTED"));
    const headers = Object.assign({ accept: "application/json" }, options.headers || {});
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.auth && this.session.token) headers.authorization = `Bearer ${this.session.token}`;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        callback(value);
      };
      try {
        this.runtime.request({
          url: `${this.baseUrl}${path}`,
          method: options.method || "GET",
          header: headers,
          data: options.body,
          timeout: this.requestTimeout,
          success: (response = {}) => {
            const statusCode = Number(response.statusCode) || 0;
            const result = { statusCode, data: response.data || {}, headers: response.header || {} };
            if ((statusCode >= 200 && statusCode < 300) || statusCode === 304) finish(resolve, result);
            else {
              const error = new Error(String((result.data && result.data.code) || `HTTP_${statusCode}`));
              error.statusCode = statusCode;
              error.data = result.data;
              finish(reject, error);
            }
          },
          fail: (error) => finish(reject, new Error(String((error && error.errMsg) || "NETWORK_FAILED")))
        });
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  refreshConfig(force = false) {
    if (!this.supported) return Promise.resolve(this.config());
    if (this.configPromise) return this.configPromise;
    if (!force && this.remoteConfig.updatedAt && this.now() - this.remoteConfig.updatedAt < 60000) return Promise.resolve(this.config());
    this.configStatus = "loading";
    const headers = this.remoteConfig.etag ? { "if-none-match": this.remoteConfig.etag } : {};
    this.configPromise = this.request("/v1/config", { headers }).then((response) => {
      if (response.statusCode !== 304) {
        const value = safeConfig((response.data || {}).config || {});
        const etag = String(response.headers.etag || response.headers.ETag || "");
        this.remoteConfig = { value, etag, updatedAt: this.now() };
        this.writeStorage(CONFIG_STORAGE_KEY, this.remoteConfig);
      } else {
        this.remoteConfig.updatedAt = this.now();
        this.writeStorage(CONFIG_STORAGE_KEY, this.remoteConfig);
      }
      this.configStatus = "ready";
      this.status = "online";
      this.notify();
      return this.config();
    }).catch((error) => {
      this.configStatus = this.remoteConfig.updatedAt ? "cached" : "offline";
      this.status = "offline";
      this.lastError = error.message;
      this.notify();
      return this.config();
    }).finally(() => { this.configPromise = null; });
    return this.configPromise;
  }

  login(force = false) {
    if (!this.supported || typeof this.runtime.login !== "function") return Promise.resolve(false);
    if (!force && this.session.token && this.session.expiresAt > this.now() + 60000) {
      const hasMatchKey = /^[a-f0-9]{64}$/.test(this.session.friendMatchKey || "");
      if (!hasMatchKey && !this.sessionMatchKeyAttempted) {
        this.sessionMatchKeyAttempted = true;
        return this.login(true);
      }
      this.authStatus = "authenticated";
      return Promise.resolve(true);
    }
    if (this.loginPromise) return this.loginPromise;
    this.authStatus = "logging_in";
    this.loginPromise = new Promise((resolve, reject) => {
      this.runtime.login({
        timeout: this.requestTimeout,
        success: (result = {}) => result.code ? resolve(result.code) : reject(new Error("WX_LOGIN_NO_CODE")),
        fail: (error) => reject(new Error(String((error && error.errMsg) || "WX_LOGIN_FAILED")))
      });
    }).then((code) => this.request("/v1/auth/wechat", { method: "POST", body: { code } })).then((response) => {
      const data = response.data || {};
      if (!data.token) throw new Error("AUTH_TOKEN_MISSING");
      const friendMatchKey = /^[a-f0-9]{64}$/.test(String(data.friendMatchKey || "")) ? String(data.friendMatchKey) : "";
      this.session = {
        token: String(data.token),
        publicId: String(data.publicId || ""),
        friendMatchKey,
        expiresAt: this.now() + Math.max(60, Number(data.expiresIn) || 0) * 1000
      };
      this.sessionMatchKeyAttempted = true;
      this.writeStorage(SESSION_STORAGE_KEY, this.session);
      this.authStatus = "authenticated";
      this.status = "online";
      this.lastError = "";
      this.notify();
      return true;
    }).catch((error) => {
      this.authStatus = "offline";
      this.lastError = error.message;
      this.notify();
      return false;
    }).finally(() => { this.loginPromise = null; });
    return this.loginPromise;
  }

  clearSession() {
    this.session = { token: "", expiresAt: 0, publicId: "", friendMatchKey: "" };
    this.sessionMatchKeyAttempted = false;
    this.leaderboardAuthed = false;
    this.writeStorage(SESSION_STORAGE_KEY, this.session);
    this.authStatus = "idle";
  }

  syncScore(reserve = {}, force = false, retry = true, valuation) {
    if (!this.feature("worldLeaderboard") || !this.session.token) return Promise.resolve(false);
    const record = rankRecord(reserve, valuation);
    const signature = `${record.displayName}|${record.score}|${record.level}|${record.animals}|${record.shield}|${record.style}`;
    const now = this.now();
    if (!force && (signature === this.lastScoreSignature || now - this.lastScoreSyncAt < this.scoreSyncIntervalMs)) return Promise.resolve(false);
    if (this.syncPromise) return this.syncPromise;
    this.lastScoreSyncAt = now;
    this.syncPromise = this.request("/v1/leaderboard/score", { method: "POST", auth: true, body: record }).then((response) => {
      this.lastScoreSignature = signature;
      this.myRank = Math.max(0, Math.round(Number(response.data.rank) || 0));
      this.myScore = Math.max(0, Math.round(Number(response.data.score) || record.score));
      this.status = "online";
      this.notify();
      return true;
    }).catch((error) => {
      if (retry && error.statusCode === 401) {
        this.clearSession();
        this.syncPromise = null;
        return this.login(true).then((ok) => ok ? this.syncScore(reserve, true, false, valuation) : false);
      }
      this.lastError = error.message;
      this.status = "offline";
      this.notify();
      return false;
    }).finally(() => { this.syncPromise = null; });
    return this.syncPromise;
  }

  refreshLeaderboard(force = false) {
    if (!this.feature("worldLeaderboard")) return Promise.resolve([]);
    const now = this.now();
    const authed = !!this.session.token;
    if (!force && this.lastLeaderboardAt && now - this.lastLeaderboardAt < this.leaderboardRefreshMs
      && !(authed && !this.leaderboardAuthed)) {
      return Promise.resolve(this.rows);
    }
    if (this.leaderboardPromise) return this.leaderboardPromise;
    this.leaderboardPromise = this.request("/v1/leaderboard?limit=100", { auth: authed }).then((response) => {
      const list = Array.isArray(response.data.leaderboard) ? response.data.leaderboard : [];
      this.rows = list.map(leaderboardRow).filter((row) => !row.mine).slice(0, 100);
      this.lastLeaderboardAt = now;
      this.leaderboardAuthed = authed;
      this.status = "online";
      this.notify();
      return this.rows;
    }).catch((error) => {
      this.lastError = error.message;
      this.status = "offline";
      this.notify();
      return this.rows;
    }).finally(() => { this.leaderboardPromise = null; });
    return this.leaderboardPromise;
  }

  relationFriendData() {
    if (typeof this.runtime.getRelationFriendList !== "function") return Promise.reject(new Error("RELATION_FRIEND_UNSUPPORTED"));
    const requestList = () => new Promise((resolve, reject) => {
      try {
        this.runtime.getRelationFriendList({
          success: (result = {}) => resolve({ encryptedData: String(result.encryptedData || ""), iv: String(result.iv || "") }),
          fail: (error = {}) => reject(new Error(String(error.errMsg || "RELATION_FRIEND_FAILED")))
        });
      } catch (error) { reject(error); }
    });
    if (typeof this.runtime.authorize !== "function") return requestList();
    return new Promise((resolve, reject) => {
      this.runtime.authorize({
        scope: "scope.interactedUserInfo",
        success: resolve,
        fail: (error = {}) => reject(new Error(String(error.errMsg || "authorize:fail auth deny")))
      });
    }).then(requestList);
  }

  refreshRelationFriends(force = false) {
    if (!this.feature("socialTrade")) return Promise.resolve([]);
    if (!force && this.friendStatus === "ready") return Promise.resolve(this.friendRows);
    if (this.friendPromise) return this.friendPromise;
    this.friendStatus = "loading";
    this.friendPromise = this.login(true).then((ok) => {
      if (!ok) throw new Error("AUTH_REQUIRED");
      return this.relationFriendData();
    }).then((payload) => this.request("/v1/friends/import", { method: "POST", auth: true, body: payload })).then((response) => {
      const list = Array.isArray(response.data.friends) ? response.data.friends : [];
      this.friendRows = list.map((entry, index) => Object.assign(leaderboardRow(entry, index), { scope: "friends", source: "wechat" })).filter((row) => !row.mine);
      this.friendRelationCount = Math.max(0, Math.round(Number(response.data.relationCount) || list.length));
      this.friendMatchedCount = Math.max(0, Math.round(Number(response.data.matched) || 0));
      this.friendPendingCount = Math.max(0, Math.round(Number(response.data.pending) || 0));
      this.friendStatus = "ready";
      this.status = "online";
      this.lastError = "";
      return this.refreshLeaderboard(true).then(() => {
        this.notify();
        return this.friendRows;
      });
    }).catch((error) => {
      this.friendStatus = /auth deny/i.test(error.message) ? "denied" : "offline";
      this.lastError = error.message;
      this.notify();
      return this.friendRows;
    }).finally(() => { this.friendPromise = null; });
    return this.friendPromise;
  }

  exchangeMaterial(payload = {}, retry = true) {
    if (!this.feature("socialTrade")) return Promise.reject(new Error("SOCIAL_TRADE_DISABLED"));
    if (this.tradePromise) return this.tradePromise;
    this.tradePromise = this.login().then((ok) => {
      if (!ok) throw new Error("AUTH_REQUIRED");
      return this.request("/v1/trades/exchange", { method: "POST", auth: true, body: payload });
    }).then((response) => {
      const receipt = response.data.trade || null;
      if (receipt) {
        this.tradeMailbox.sent = mergeTradeMailboxRows(this.tradeMailbox.sent, [receipt], "sent");
        this.notify();
      }
      return receipt;
    }).catch((error) => {
      if (retry && error.statusCode === 401) {
        this.clearSession();
        this.tradePromise = null;
        return this.login(true).then((ok) => ok ? this.exchangeMaterial(payload, false) : Promise.reject(error));
      }
      throw error;
    }).finally(() => { this.tradePromise = null; });
    return this.tradePromise;
  }

  claimTradeInbox(retry = true) {
    if (!this.feature("socialTrade")) return Promise.resolve([]);
    return this.login().then((ok) => {
      if (!ok) return [];
      return this.request("/v1/trades/inbox/claim", { method: "POST", auth: true, body: {} }).then((response) => {
        const trades = (Array.isArray(response.data.trades) ? response.data.trades : []).map((trade) => Object.assign({}, trade, {
          claimed: true,
          claimedAt: Math.max(1, Number(trade.claimedAt) || this.now())
        }));
        this.tradeMailbox.received = mergeTradeMailboxRows(this.tradeMailbox.received, trades, "received");
        if (trades.length) this.notify();
        return trades;
      });
    }).catch((error) => {
      if (retry && error.statusCode === 401) {
        this.clearSession();
        return this.claimTradeInbox(false);
      }
      this.lastError = error.message;
      return [];
    });
  }

  refreshTradeMailbox(force = false) {
    if (!this.feature("socialTrade")) return Promise.resolve(this.tradeMailbox);
    if (!force && this.tradeMailboxStatus === "ready") return Promise.resolve(this.tradeMailbox);
    if (this.tradeMailboxPromise) return this.tradeMailboxPromise;
    this.tradeMailboxStatus = "loading";
    this.tradeMailboxPromise = this.login().then((ok) => {
      if (!ok) throw new Error("AUTH_REQUIRED");
      return this.request("/v1/trades/history?limit=50", { auth: true });
    }).then((response) => {
      this.tradeMailbox = {
        sent: mergeTradeMailboxRows(this.tradeMailbox.sent, response.data.sent, "sent"),
        received: mergeTradeMailboxRows(this.tradeMailbox.received, response.data.received, "received")
      };
      this.tradeMailboxStatus = "ready";
      this.status = "online";
      this.lastError = "";
      this.notify();
      return this.tradeMailbox;
    }).catch((error) => {
      this.tradeMailboxStatus = "offline";
      this.lastError = error.message;
      this.notify();
      return this.tradeMailbox;
    }).finally(() => { this.tradeMailboxPromise = null; });
    return this.tradeMailboxPromise;
  }

  syncReserve(reserve = {}, force = false, valuation) {
    if (!this.supported || !this.feature("worldLeaderboard")) return false;
    const before = this.lastScoreSignature;
    this.login().then((loggedIn) => {
      if (!loggedIn) return this.feature("worldLeaderboard") ? this.refreshLeaderboard(force) : [];
      return this.syncScore(reserve, force, true, valuation).then(() => this.refreshLeaderboard(force));
    });
    const record = rankRecord(reserve, valuation);
    return force || before !== `${record.displayName}|${record.score}|${record.level}|${record.animals}|${record.shield}|${record.style}`;
  }

  track(event, properties = {}) {
    if (!this.feature("telemetry")) return Promise.resolve(false);
    const sampleRate = this.config().balance.eventUploadSampleRate;
    if (this.random() > sampleRate) return Promise.resolve(false);
    return this.request("/v1/events", {
      method: "POST",
      auth: true,
      body: { event: String(event || "").slice(0, 64), installId: this.installId, properties }
    }).then(() => true).catch(() => false);
  }

  bootstrap(reserve = {}, valuation) {
    if (!this.supported) return Promise.resolve(false);
    return Promise.all([this.refreshConfig(true), this.login()]).then((results) => {
      if (!this.feature("worldLeaderboard")) return [];
      if (results[1]) return this.syncScore(reserve, true, true, valuation).then(() => this.refreshLeaderboard(true));
      return this.refreshLeaderboard(true);
    }).then(() => {
      this.track("game.boot", { configVersion: this.config().version });
      return true;
    });
  }
}

module.exports = {
  CLOUD_BASE_URL,
  DEFAULT_REMOTE_CONFIG,
  safeConfig,
  reserveAnimalTotal,
  rankRecord,
  leaderboardRow,
  tradeMailboxRow,
  CloudServiceController
};
