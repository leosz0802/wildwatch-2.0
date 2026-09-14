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
  getOpenDataContext() { sdkCalls.openData += 1; return { canvas: {}, postMessage() {} }; },
  showShareMenu() {}, onShareAppMessage() {}
};

const { Game } = require("../js/game");
const { compactStateForStorage, createCharacter } = require("../js/storage");

async function flushMicrotasks() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function verifyStartupBoundaries() {
  const game = new Game();
  assert(game.screen === "choose", "an empty install should enter the single-image prologue");
  assert(images.length === 1 && /prologue-fog-v1\.jpg$/.test(images[0].src), "before the first frame a new install should request only prologue frame one");
  assert(writes.length === 0, "boot should not rewrite the save before the player changes state");
  assert(Object.values(sdkCalls).every((count) => count === 0), "ads, friend rank and open-data must stay cold before the first frame");

  images[0].onload();
  assert(images.length === 1, "the text-led second prologue beat must not request another image");

  const firstBoundary = rafQueue.shift();
  assert(firstBoundary, "deferred services should wait on a render boundary");
  firstBoundary(16);
  assert(Object.values(sdkCalls).every((count) => count === 0), "one animation boundary must not initialize SDK components yet");
  const secondBoundary = rafQueue.shift();
  assert(secondBoundary, "deferred services should have a second post-paint boundary");
  secondBoundary(32);
  assert(sdkCalls.interstitial === 1 && sdkCalls.rewarded === 2 && sdkCalls.custom === 1 && sdkCalls.openData === 1,
    "SDK components and both rewarded placements should initialize exactly once after the first frame");
  assert(typeof touchStart === "function", "the first interaction path should remain bound while services are deferred");

  createCharacter(null, "回流测试玩家");
  images.length = 0;
  writes.length = 0;
  const returningGame = new Game();
  assert(returningGame.screen === "home", "a returning player should boot directly into the sandbox");
  assert(writes.length === 0, "returning-player boot bookkeeping must stay in memory until an action or app-hide checkpoint");
  const returningSources = images.map((image) => image.src);
  assert(returningSources.some((src) => /core-map-anime-v1\.jpg$/.test(src)), "the current sandbox should load its compatible local map before unrelated pages");
  assert(!returningSources.some((src) => /prologue|collection-items|chapter-assets/.test(src)), "returning boot should not load prologue, collection or chapter art");

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
  const queueFrames = [];
  game.raf = (callback) => queueFrames.push(callback);

  const started = [];
  const finishes = [];
  let active = 0;
  let peak = 0;
  const loader = (name) => () => new Promise((resolve) => {
    started.push(name);
    active += 1;
    peak = Math.max(peak, active);
    finishes.push(() => { active -= 1; resolve(true); });
  });
  game.prepareRemoteWildernessMaterialAtlas = loader("wilderness");
  game.prepareRemoteAnimalPortraitAtlas = loader("animals");
  game.prepareRemotePremiumUiAtlas = loader("premium");
  game.prepareRemoteArtAtlas = loader("art");

  game.queueRemoteAssetsForScreen("survival");
  await flushMicrotasks();
  assert(started.join(",") === "wilderness" && active === 1, "the survival atlas should be first and should be the only active decode");
  game.queueRemoteAssetsForScreen("collection");
  finishes.shift()();
  await flushMicrotasks();
  assert(active === 0 && queueFrames.length === 1, "the next atlas should wait for a render frame after decoding");

  while (queueFrames.length || finishes.length || game.remoteAssetQueue.length || game.remoteAssetActive) {
    if (queueFrames.length) {
      queueFrames.shift()();
      await flushMicrotasks();
    }
    if (finishes.length) {
      finishes.shift()();
      await flushMicrotasks();
    }
  }
  assert(started.join(",") === "wilderness,animals,premium,art", `screen priority order drifted: ${started.join(",")}`);
  assert(peak === 1, `remote atlases decoded concurrently: peak ${peak}`);
}

(async () => {
  await verifyStartupBoundaries();
  verifyReportCompaction();
  await verifyRemoteQueue();
  const root = path.resolve(__dirname, "..");
  assert(!fs.existsSync(path.join(root, "js/recommendSystem.js")), "recommendation runtime should be removed from the package");
  console.log("startup performance check ok (first-frame assets, deferred SDKs, compact reports, serial remote queue)");
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
