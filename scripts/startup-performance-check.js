const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rafQueue = [];
const images = [];
const writes = [];
const storageValues = {};
const sdkCalls = { interstitial: 0, rewarded: 0, custom: 0, openData: 0 };
let touchStart = null;
let openDataCanvas = { width: 375, height: 667, style: {} };

global.requestAnimationFrame = (callback) => {
  rafQueue.push(callback);
  return rafQueue.length;
};
global.cancelAnimationFrame = () => {};
global.wx = {
  getSystemInfoSync() { return { windowWidth: 375, windowHeight: 667, pixelRatio: 2 }; },
  createCanvas() { return { width: 0, height: 0, getContext() { return null; } }; },
  createImage() {
    const image = {
      loaded: false,
      set src(value) { this._src = value; },
      get src() { return this._src; }
    };
    images.push(image);
    return image;
  },
  getStorageSync(key) { return storageValues[key] || null; },
  setStorageSync(key, value) { storageValues[key] = value; writes.push({ key, value }); },
  onTouchStart(callback) { touchStart = callback; },
  onTouchMove() {}, onTouchEnd() {}, onTouchCancel() {}, onAppHide() {}, onAppShow() {},
  createInterstitialAd() { sdkCalls.interstitial += 1; return {}; },
  createRewardedVideoAd() { sdkCalls.rewarded += 1; return {}; },
  createCustomAd() { sdkCalls.custom += 1; return { onLoad() {}, onError() {}, onClose() {} }; },
  getOpenDataContext() {
    sdkCalls.openData += 1;
    return { canvas: openDataCanvas, postMessage() {} };
  },
  showShareMenu() {}, onShareAppMessage() {}
};

const { Game } = require("../js/game");
const { compactStateForStorage, createCharacter } = require("../js/storage");

async function flushMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

function firstEntryAssetPackaged(relative) {
  const root = path.resolve(__dirname, "..");
  const project = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
  const ignored = ((project.packOptions || {}).ignore || []).map((item) => String(item.value || ""));
  assert(fs.existsSync(path.join(root, relative)), `new-player first-entry asset is missing: ${relative}`);
  assert(!ignored.some((entry) => relative === entry || relative.startsWith(`${entry}/`)), `new-player first-entry asset must stay in the main package: ${relative}`);
}

async function verifyNewPlayerFirstEntryArt() {
  Object.keys(storageValues).forEach((key) => { delete storageValues[key]; });
  images.length = 0;
  writes.length = 0;

  [
    "assets/art/prologue/prologue-fog-v1.jpg",
    "assets/art/core-map-anime-v1.jpg",
    "assets/art/animal-map-sprites-atlas-v2.png",
    "assets/art/ui-v3/icons/nav_sandbox.png",
    "assets/art/ui-v3/icons/leaf.png",
    "assets/art/ui-v3/icons/reserve_prosperity.png",
    "assets/art/ui-v3/icons/nav_materials.png",
    "assets/art/ui-v3/icons/eye.png",
    "assets/art/ui-v3/icons/fund_v3.png",
    "assets/art/ui-v3/icons/water.png"
  ].forEach(firstEntryAssetPackaged);

  const game = new Game();
  game.stopLoop();
  game.render = () => {};
  assert(game.screen === "choose", "a new install should start on the prologue");
  assert(images.length === 1 && /prologue-fog-v1\.jpg$/.test(images[0].src), "first enter should request the packed prologue illustration");
  images[0].loaded = true;
  if (typeof images[0].onload === "function") images[0].onload();

  game.prologueStageRuntime("fog").startedAt = Date.now() - 900;
  images.length = 0;
  assert(game.advancePlayablePrologue(), "tapping enter-game should finish the prologue");
  assert(game.screen === "home", "the first enter-game tap should land in the sandbox");

  const homeSources = images.map((image) => image.src);
  assert(homeSources.some((src) => /core-map-anime-v1\.jpg$/.test(src)), "first sandbox frame must load the packed local map");
  assert(homeSources.some((src) => /animal-map-sprites-atlas-v2\.png$/.test(src)), "first sandbox frame must load packed chapter 1-4 animal sprites");
  ["nav_sandbox", "leaf", "reserve_prosperity", "nav_materials", "eye", "fund"].forEach((name) => {
    assert(homeSources.some((src) => src.includes(`ui-v3/icons/`) && src.includes(name === "fund" ? "fund_v3" : name)), `first sandbox frame must load packed ui icon ${name}`);
  });
  assert(!homeSources.some((src) => /core-sprites-atlas|collection-items|animal-portraits-atlas/.test(src)), "first sandbox frame must not wait on the retired core atlas, collection atlas or portrait atlas");

  images.forEach((image) => {
    image.loaded = true;
    image.width = /core-map-anime/.test(image.src) ? 1672 : 896;
    image.height = /core-map-anime/.test(image.src) ? 941 : 512;
    if (typeof image.onload === "function") image.onload();
  });
  const mapSource = game.mapImageSource();
  assert(mapSource && mapSource.image === game.art.map, "sandbox terrain must paint from the local map jpeg, not the retired core atlas");
  assert(game.art.animalMapSprites && game.art.animalMapSprites.loaded, "sandbox animals must have the packed sprite atlas after first enter");
  assert(game.art.uiIcons && game.art.uiIcons.nav_sandbox && game.art.uiIcons.nav_sandbox.loaded, "bottom navigation must have its packed icon after first enter");

  Object.keys(storageValues).forEach((key) => { delete storageValues[key]; });
  images.length = 0;
  writes.length = 0;
  const wechatRuntime = Object.assign({}, global.wx, { downloadFile() {} });
  const originalWx = global.wx;
  global.wx = wechatRuntime;
  const wechatGame = new Game();
  global.wx = originalWx;
  wechatGame.stopLoop();
  wechatGame.render = () => {};
  wechatGame.runtime = wechatRuntime;
  wechatGame.prologueStageRuntime("fog").startedAt = Date.now() - 900;
  images.length = 0;
  assert(wechatGame.advancePlayablePrologue(), "WeChat first enter-game should finish the prologue");
  const wechatHome = images.map((image) => image.src);
  assert(wechatHome.some((src) => /core-map-anime-v1\.jpg$/.test(src)), "WeChat first sandbox frame must still load the packed map");
  assert(wechatHome.some((src) => /animal-map-sprites-atlas-v2\.png$/.test(src)), "WeChat first sandbox frame must still load packed animal sprites");
  assert(!wechatHome.some((src) => /facility-sprites-atlas|collection-items|animal-portraits-atlas|core-sprites-atlas/.test(src)), "WeChat first sandbox frame should download facilities later and keep collection/portraits off the first home paint");
  assert(wechatGame.remoteAssetQueue.length === 0 && !wechatGame.remoteAssetActive,
    "WeChat first home paint must not queue or decode any non-essential remote atlas");

  Object.keys(storageValues).forEach((key) => { delete storageValues[key]; });
  images.length = 0;
  writes.length = 0;
}

async function verifyStartupBoundaries() {
  Object.keys(storageValues).forEach((key) => { delete storageValues[key]; });
  images.length = 0;
  writes.length = 0;
  rafQueue.length = 0;
  sdkCalls.interstitial = 0;
  sdkCalls.rewarded = 0;
  sdkCalls.custom = 0;
  sdkCalls.openData = 0;
  touchStart = null;
  openDataCanvas = { width: 375, height: 667, style: {} };
  const game = new Game();
  assert(game.screen === "choose", "an empty install should enter the single-image prologue");
  assert(images.length === 1 && /prologue-fog-v1\.jpg$/.test(images[0].src), "before the first frame a new install should request only prologue frame one");
  assert(writes.every((entry) => entry.key === "forest_kingdom_minigame_favorite_logins"), "boot should not rewrite the save before the player changes state");
  assert(writes.filter((entry) => entry.key === "forest_kingdom_minigame_favorite_logins").length === 1, "boot counts one login toward the five favorite-button appearances");
  assert(sdkCalls.interstitial === 0 && sdkCalls.rewarded === 0 && sdkCalls.custom === 0,
    "ads must stay cold before the first frame");
  assert(sdkCalls.openData === 1 && openDataCanvas.width === 1 && openDataCanvas.height === 1
    && openDataCanvas.style.top === "-9999px" && openDataCanvas.style.left === "-9999px",
    "boot must park the full-screen open-data canvas offscreen so it cannot cover 进入游戏");

  images[0].onload();
  assert(images.length === 1, "the text-led second prologue beat must not request another image");

  const firstBoundary = rafQueue.shift();
  assert(firstBoundary, "deferred services should wait on a render boundary");
  firstBoundary(16);
  assert(sdkCalls.interstitial === 0 && sdkCalls.rewarded === 0 && sdkCalls.custom === 0,
    "one animation boundary must not initialize ad SDK components yet");
  const secondBoundary = rafQueue.shift();
  assert(secondBoundary, "deferred services should have a second post-paint boundary");
  secondBoundary(32);
  assert(sdkCalls.interstitial === 0 && sdkCalls.rewarded === 0 && sdkCalls.custom === 0,
    "prologue must not create ads; custom ads steal the enter-game tap");
  assert(openDataCanvas.width === 1 && openDataCanvas.style.top === "-9999px",
    "prologue must keep the open-data native overlay parked at 1px offscreen");
  assert(typeof touchStart === "function", "the first interaction path should remain bound while services are deferred");

  game.stopLoop();
  game.prologueStageRuntime("fog").startedAt = Date.now() - 900;
  assert(game.advancePlayablePrologue(), "enter-game should leave the prologue");
  assert(sdkCalls.interstitial === 0 && sdkCalls.rewarded === 0 && sdkCalls.openData >= 1 && sdkCalls.custom === 0,
    "leaving prologue must not warm ad SDKs; home must not create a custom-ad touch layer");
  assert(openDataCanvas.width === 1 && openDataCanvas.style.top === "-9999px",
    "first home frame must still park the open-data overlay instead of restoring a full-screen touch layer");

  createCharacter(null, "回流测试玩家");
  images.length = 0;
  writes.length = 0;
  const returningGame = new Game();
  assert(returningGame.screen === "home", "a returning player should boot directly into the sandbox");
  assert(writes.every((entry) => entry.key === "forest_kingdom_minigame_favorite_logins"), "returning-player boot bookkeeping must stay in memory until an action or app-hide checkpoint");
  assert(writes.filter((entry) => entry.key === "forest_kingdom_minigame_favorite_logins").length === 1, "returning boot counts one login and does not rewrite the reserve save");
  const returningSources = images.map((image) => image.src);
  assert(returningSources.some((src) => /core-map-anime-v1\.jpg$/.test(src)), "the current sandbox should load its compatible local map before unrelated pages");
  assert(!returningSources.some((src) => /prologue|collection-items|chapter-assets|core-sprites-atlas/.test(src)), "returning boot should not load prologue, collection, chapter art or the retired core atlas");

  const firstMap = returningGame.art.map;
  assert(firstMap && typeof firstMap.onerror === "function", "the local map should expose a recoverable load lifecycle");
  firstMap.onerror();
  assert(returningGame.mapArtLoad.status === "retrying", "a rejected local map should enter retry instead of making the procedural fallback permanent");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const retriedMap = returningGame.art.map;
  assert(retriedMap && retriedMap !== firstMap && /core-map-anime-v1\.jpg$/.test(retriedMap.src), "the compatible local map should be requested once more after a transient failure");
  retriedMap.onload();
  assert(returningGame.mapArtLoad.status === "ready" && returningGame.mapImageSource(), "a successful retry must immediately restore the illustrated map");
}

function verifyReportCompaction() {
  const reports = Array.from({ length: 30 }, (_, index) => ({
    id: `report_${index}`,
    day: index,
    type: index % 2 ? "public" : "private",
    title: ` 报告 ${index} `,
    body: "详细内容 ".repeat(500),
    visual: {
      actionType: "habitat",
      location: "中央混交林",
      hugeRenderPayload: "x".repeat(20000),
      eventCard: { tag: "现场", title: "生态变化", body: "事件详情 ".repeat(300), extra: "drop me" }
    }
  }));
  const state = { reports };
  const compact = compactStateForStorage(state);
  assert(compact.reports.length === 12 && compact.reports[0].id === "report_18", "persistent reports should keep only the latest summaries");
  assert(compact.reports.every((report) => report.body.length <= 1200 && !report.visual.hugeRenderPayload), "render-only report payloads must not enter the boot save");
  assert(reports.length === 30 && reports[0].visual.hugeRenderPayload.length === 20000, "storage compaction must not damage the live report model");
  assert(JSON.stringify(compact).length < 30000, "report summaries should keep boot deserialization bounded");
}

async function verifyRemoteQueue() {
  const game = Object.create(Game.prototype);
  game.screen = "survival";
  game.runtime = { downloadFile() {} };
  const remote = { url: "https://wild.hubao.tv/assets/test.webp", version: "v1" };
  game.artAtlas = { remote };
  game.premiumUiAtlas = { remote };
  game.wildernessMaterialAtlas = { remote };
  game.animalPortraitAtlas = { remote };
  game.remoteAssetManifestReady = true;
  game.remoteAssetQueue = [];
  game.remoteAssetQueued = new Set();
  game.remoteAssetCompleted = new Set();
  game.remoteAssetActive = "";
  game.remoteAssetManifestReady = false;
  game.queueRemoteAssetsForScreen("survival");
  game.queueRemoteAssetsForScreen("collection");
  assert(game.remoteAssetQueue.length === 0
    && game.remoteAssetActive === ""
    && game.remoteAssetQueued.size === 0,
  "remote art downloads should stay disabled when local/canvas fallbacks are used");
}

(async () => {
  await verifyNewPlayerFirstEntryArt();
  await verifyStartupBoundaries();
  verifyReportCompaction();
  await verifyRemoteQueue();
  const root = path.resolve(__dirname, "..");
  assert(!fs.existsSync(path.join(root, "js/recommendSystem.js")), "recommendation runtime should be removed from the package");
  console.log("startup performance check ok (first-frame assets, deferred SDKs, compact reports, remote art disabled)");
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
