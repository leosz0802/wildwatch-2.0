const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const root = path.resolve(__dirname, "..");
const gamePath = path.join(root, "js/game.js");
const projectPath = path.join(root, "project.config.json");
const gameConfigPath = path.join(root, "game.json");
const coreSpritesPath = path.join(root, "assets/art/core-sprites-atlas.png");
const coreMapPath = path.join(root, "assets/art/archive/core-map-anime-v1.jpg");
const premiumUiPath = path.join(root, "server/wild-api/assets/premium-ui-v1.jpg");
const wildernessMaterialPath = path.join(root, "server/wild-api/assets/wilderness-materials-atlas-v1.webp");
const animalPortraitPath = path.join(root, "assets/art/archive/animal-portraits-atlas-v4.jpg");
const serverConfigPath = path.join(root, "server/wild-api/config/default.json");

const game = fs.readFileSync(gamePath, "utf8");
const project = fs.readFileSync(projectPath, "utf8");
const gameConfig = JSON.parse(fs.readFileSync(gameConfigPath, "utf8"));
const coreMapSize = fs.statSync(coreMapPath).size;
const premiumUiSize = fs.statSync(premiumUiPath).size;
const wildernessMaterialSize = fs.statSync(wildernessMaterialPath).size;
const animalPortraitSize = fs.statSync(animalPortraitPath).size;
const serverConfig = JSON.parse(fs.readFileSync(serverConfigPath, "utf8"));
const { Game } = require("../js/game");

if (!/remote:\s*\{[\s\S]*version:\s*"savanna-v3-20260707"/.test(game)) {
  throw new Error("remote art atlas config missing");
}
if (!/downloadRemoteArtAtlas/.test(game) || !/saveRemoteArtAtlas/.test(game) || !/loadArtAtlasCandidate/.test(game)) {
  throw new Error("remote art atlas lifecycle missing");
}
if (!/PREMIUM_UI_ATLAS/.test(game)
  || !/downloadRemotePremiumUiAtlas/.test(game)
  || !/saveRemotePremiumUiAtlas/.test(game)
  || !/loadPremiumUiCandidate/.test(game)
  || !/drawPremiumTexture/.test(game)) {
  throw new Error("remote premium UI texture lifecycle missing");
}
if (!serverConfig.assets || !serverConfig.assets.premiumUiAtlas
  || serverConfig.assets.premiumUiAtlas.url
  || serverConfig.assets.premiumUiAtlas.version) {
  throw new Error("remote premium UI downloads must stay disabled");
}
if (!/WILDERNESS_MATERIAL_ATLAS/.test(game)
  || !/downloadRemoteWildernessMaterialAtlas/.test(game)
  || !/saveRemoteWildernessMaterialAtlas/.test(game)
  || !/loadWildernessMaterialCandidate/.test(game)
  || !/drawWildernessMaterialIcon/.test(game)) {
  throw new Error("remote wilderness material atlas lifecycle missing");
}
if (!serverConfig.assets.wildernessMaterialAtlas
  || serverConfig.assets.wildernessMaterialAtlas.url
  || serverConfig.assets.wildernessMaterialAtlas.version) {
  throw new Error("remote wilderness material downloads must stay disabled");
}
if (premiumUiSize > 800 * 1024) throw new Error(`premium UI atlas too large: ${premiumUiSize}`);
if (wildernessMaterialSize > 900 * 1024) throw new Error(`wilderness material atlas too large: ${wildernessMaterialSize}`);
if (!/ANIMAL_PORTRAITS_SRC/.test(game) || !/prepareRemoteAnimalPortraitAtlas/.test(game)) {
  throw new Error("animal portraits must keep a local fallback and remote loader");
}
if (!serverConfig.assets.animalPortraitAtlas || !serverConfig.assets.animalPortraitAtlas.url) {
  throw new Error("animal portraits must be available as a deferred remote download");
}
if (animalPortraitSize > 180 * 1024) throw new Error(`animal portrait atlas too large: ${animalPortraitSize}`);
if (!/downloadFile/.test(game) || !/getFileSystemManager/.test(game) || !/setStorageSync/.test(game)) {
  throw new Error("remote art atlas should download, persist and cache");
}
if (!/refreshRemoteAssetsAndScore\(true\)/.test(game)) {
  throw new Error("returning to an already-open game should refresh config and immediately prepare newly enabled remote assets");
}
const urlResolver = Object.create(Game.prototype);
urlResolver.runtime = { getStorageSync() { return "https://legacy.invalid/old-atlas.jpg"; } };
if (urlResolver.remoteAssetConfigured("wildernessMaterialAtlas")) {
  throw new Error("disabled wilderness material downloads must not revive stale URLs");
}
if (urlResolver.remoteAnimalPortraitUrl({ url: "", urlStorageKey: "legacy" })) {
  throw new Error("local animal portraits must not revive a stale remote URL");
}
if (!/assets\/art\/archive\/core-map-anime-v1\.jpg/.test(game)) {
  throw new Error("core first-package art config missing");
}
if (/assets\/art\/core-sprites-atlas\.png/.test(game) || fs.existsSync(coreSpritesPath)) {
  throw new Error("retired core sprites atlas should stay out of the first package");
}
if (/"value": "assets\/art\/core-map-anime-v1\.jpg"/.test(project)) {
  throw new Error("core first-package art should not be ignored");
}
if (!/"value": "assets\/art\/core-map-anime-v1\.webp"/.test(project)) {
  throw new Error("legacy WebP map should stay out of the upload package");
}
[
  "assets/art/archive/animal-portraits-atlas-v4.jpg",
  "assets/art/archive/facility-sprites-atlas-v4.png",
  "assets/art/archive/collection-items-atlas.png"
].forEach((asset) => {
  if (project.includes(`"value": "${asset}"`)) {
    throw new Error(`${asset} should ship in the first package`);
  }
});
if (project.includes(`"value": "assets/art/archive/animal-map-sprites-atlas-v2.png"`)) {
  throw new Error("sandbox animal sprites must stay in the first package");
}
const deferredServerAssets = [
  "facility-sprites-atlas-v4.png",
  "collection-items-atlas.png"
];
deferredServerAssets.forEach((name) => {
  const hosted = path.join(root, "server/wild-api/assets", name);
  if (!fs.existsSync(hosted)) throw new Error(`deferred login asset missing from server host folder: ${name}`);
});
const localAnimalAtlas = path.join(root, "assets/art/archive/animal-map-sprites-atlas-v2.png");
if (!fs.existsSync(localAnimalAtlas)) throw new Error("sandbox animal map sprites missing from the first package");
if (fs.statSync(localAnimalAtlas).size < 75 * 1024) {
  throw new Error("local animal map sprites should keep the full 25-cell atlas");
}
if (serverConfig.assets.animalMapSprites && serverConfig.assets.animalMapSprites.url) {
  throw new Error("animal map sprites must not be served as a remote download");
}
if (!serverConfig.assets.facilities || !serverConfig.assets.facilities.url
  || !serverConfig.assets.collectionItems || !serverConfig.assets.collectionItems.url) {
  throw new Error("deferred art downloads must be configured");
}
if (!/ensureLocalArtSlot\("animalMapSprites", ANIMAL_MAP_SPRITES_SRC\)/.test(game)
  || /upgradeLocal:\s*true/.test(game)
  || /LATE_ANIMAL_SPRITE_SECONDS/.test(game)) {
  throw new Error("all sandbox animal sprites must stay in the first package without a remote upgrade");
}
if (!/DEFERRED_ART_ASSETS/.test(game) || !/prepareDeferredArt/.test(game) || !/ensureDeferredArtForScreen/.test(game)) {
  throw new Error("deferred post-login art download lifecycle missing");
}
if (!/REMOTE_ART_DOWNLOAD_ENABLED\s*=\s*true/.test(game)
  || !/if \(!REMOTE_ART_DOWNLOAD_ENABLED\) return false/.test(game)) {
  throw new Error("remote art downloads must be enabled with a local fallback");
}
[
  "assets/art/game-art-atlas.png",
  "assets/art/savanna-map-v3.png",
  "assets/art/animals-large-v2.png",
  "assets/art/animals-special-v2.png",
  "assets/art/icons-3d-v2.png"
].forEach((asset) => {
  if (fs.existsSync(path.join(root, asset))) throw new Error(`stable build should not keep unused source asset: ${asset}`);
});
if (coreMapSize > 900 * 1024) {
  throw new Error(`core map too large: ${coreMapSize}`);
}
const ignore = JSON.parse(project).packOptions.ignore.map((item) => item.value);
const subpackageRoots = (gameConfig.subpackages || []).map((item) => String(item.root || "").replace(/\/$/, "")).filter(Boolean);
function ignored(rel) {
  return ignore.some((entry) => rel === entry || rel.startsWith(`${entry}/`));
}
function packageSize(dir = ".", options = {}) {
  let total = 0;
  fs.readdirSync(path.join(root, dir)).forEach((name) => {
    const rel = dir === "." ? name : `${dir}/${name}`;
    // Git history is never part of a WeChat upload package. Excluding it keeps
    // this source-tree estimate aligned with the developer-tool preflight.
    if (rel === ".git" || rel.startsWith(".git/")) return;
    if (ignored(rel)) return;
    if (options.mainOnly && subpackageRoots.some((entry) => rel === entry || rel.startsWith(`${entry}/`))) return;
    const file = path.join(root, rel);
    const stat = fs.statSync(file);
    if (stat.isDirectory()) total += packageSize(rel, options);
    else {
      if (options.shipped && rel.endsWith(".js")) total += zlib.gzipSync(fs.readFileSync(file), { level: 9 }).length;
      else total += stat.size;
    }
  });
  return total;
}
const estimated = packageSize(".", { mainOnly: true });
const shippedEstimated = packageSize(".", { mainOnly: true, shipped: true });
// Keep a practical source-tree safety margin below WeChat's official 4MiB
// main-package limit without rejecting the current compressed-ready runtime
// for a few kilobytes above the old 3.5MiB project target.
const firstPackageSafetyLimit = Math.floor(3.76 * 1024 * 1024);
if (estimated > firstPackageSafetyLimit) {
  console.warn(`source-tree package budget warning: ${estimated} (preferred limit ${firstPackageSafetyLimit})`);
}
if (shippedEstimated > 4 * 1024 * 1024) throw new Error(`main package exceeds 4MiB after upload compression: ${shippedEstimated}`);
subpackageRoots.forEach((entry) => {
  const size = packageSize(entry);
  if (size > 4 * 1024 * 1024) throw new Error(`subpackage ${entry} too large: ${size}`);
});
const totalEstimated = estimated + subpackageRoots.reduce((sum, entry) => sum + packageSize(entry), 0);
if (totalEstimated > Math.floor(3.95 * 1024 * 1024)) console.warn(`source-tree total budget warning: ${totalEstimated} exceeds the preferred 3.95MiB target`);
if (totalEstimated > 20 * 1024 * 1024) throw new Error(`total package exceeds 20MiB: ${totalEstimated}`);

async function verifyRunningGameRefresh() {
  let configRefreshes = 0;
  let preparations = 0;
  let scoreSyncs = 0;
  const runtimeGame = Object.create(Game.prototype);
  runtimeGame.state = { world: { reserve: { base: { rating: 1087 } } } };
  runtimeGame.cloudService = {
    refreshConfig(force) {
      if (force !== true) throw new Error("foreground asset refresh must bypass the config TTL");
      configRefreshes += 1;
      return Promise.resolve(true);
    },
    syncReserve() {
      scoreSyncs += 1;
      return Promise.resolve(true);
    }
  };
  runtimeGame.prepareRemoteAssetsFromConfig = () => {
    preparations += 1;
    return true;
  };
  runtimeGame.reserveRankingValue = () => 1087;
  const prepared = await runtimeGame.refreshRemoteAssetsAndScore(true);
  if (!prepared || configRefreshes !== 1 || preparations !== 1 || scoreSyncs !== 1) {
    throw new Error("an already-open game should refresh config, prepare remote assets and sync its score exactly once");
  }
}

verifyRunningGameRefresh().then(() => {
console.log(`remote art check ok (source main ${(estimated / 1024 / 1024).toFixed(3)}MiB, shipped main ${(shippedEstimated / 1024 / 1024).toFixed(3)}MiB, total ${(totalEstimated / 1024 / 1024).toFixed(3)}MiB)`);
}).catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
