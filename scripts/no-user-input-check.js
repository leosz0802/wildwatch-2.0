const fs = require("fs");
const path = require("path");
const { createInitialWorld } = require("../js/world");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const gameSource = read("js/game.js");
const runtimeSource = read("js/runtime.js");
const project = JSON.parse(read("project.config.json"));
const forbiddenProductionTokens = [
  "showKeyboard",
  "hideKeyboard",
  "onKeyboardConfirm",
  "openKeyboard(",
  "inputBox(",
  "messageBody",
  "sendMessage(",
  "ContentSecurityClient",
  "CONTENT_SECURITY_SCENES",
  "msgSecCheck",
  "contentSpam"
];

forbiddenProductionTokens.forEach((token) => {
  assert(!gameSource.includes(token), `player input or moderation code remains in game.js: ${token}`);
  assert(!runtimeSource.includes(token), `keyboard API remains in runtime.js: ${token}`);
});

assert(gameSource.includes('"观察记录", "自动更新"'), "animal observation is not visibly automatic");
assert(gameSource.includes('this.text(ctx, "只读"'), "read-only label is missing");
assert(!gameSource.includes("记录动向"), "legacy free-text submit button remains");
assert(!Object.prototype.hasOwnProperty.call(project, "cloudfunctionRoot"), "unused cloud function root remains configured");
assert(!fs.existsSync(path.join(root, "js/contentSecurity.js")), "content security client remains after removing UGC");
assert(!fs.existsSync(path.join(root, "cloudfunctions/contentSecurity")), "content security cloud function remains after removing UGC");

const saved = {
  world: createInitialWorld(),
  character: null,
  reports: [],
  messages: [{ id: "legacy", body: "旧玩家自由文本" }],
  contentSecurity: { history: [{ traceId: "legacy" }], last: { traceId: "legacy" } }
};
global.wx = {
  getStorageSync() { return saved; },
  setStorageSync() {},
  removeStorageSync() {}
};
const { loadState } = require("../js/storage");
const normalized = loadState();
assert(Array.isArray(normalized.messages) && normalized.messages.length === 0, "legacy player text was not purged during migration");
assert(!Object.prototype.hasOwnProperty.call(normalized, "contentSecurity"), "obsolete moderation history remains in save data");
delete global.wx;

console.log("no user input check ok");
