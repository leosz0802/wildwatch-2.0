const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const gamePath = path.join(root, "js/game.js");
const projectPath = path.join(root, "project.config.json");
const gameConfigPath = path.join(root, "game.json");
const coreSpritesPath = path.join(root, "assets/art/core-sprites-atlas.png");
const coreMapPath = path.join(root, "assets/art/core-map-anime-v1.jpg");
const premiumUiPath = path.join(root, "server/wild-api/assets/premium-ui-v1.jpg");
const wildernessMaterialPath = path.join(root, "server/wild-api/assets/wilderness-materials-atlas-v1.webp");
const animalPortraitPath = path.join(root, "server/wild-api/assets/animal-portraits-atlas-v4.jpg");
const serverConfigPath = path.join(root, "server/wild-api/config/default.json");

const game = fs.readFileSync(gamePath, "utf8");
const project = fs.readFileSync(projectPath, "utf8");
const gameConfig = JSON.parse(fs.readFileSync(gameConfigPath, "utf8"));
const coreSpritesSize = fs.statSync(coreSpritesPath).size;
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
  || serverConfig.assets.premiumUiAtlas.url !== "https://wild.hubao.tv/assets/premium-ui-v1.jpg"
  || serverConfig.assets.premiumUiAtlas.version !== "premium-ui-v1") {
  throw new Error("server premium UI config missing or version mismatch");
}
if (!/WILDERNESS_MATERIAL_ATLAS/.test(game)
  || !/downloadRemoteWildernessMaterialAtlas/.test(game)
  || !/saveRemoteWildernessMaterialAtlas/.test(game)
  || !/loadWildernessMaterialCandidate/.test(game)
  || !/drawWildernessMaterialIcon/.test(game)) {
  throw new Error("remote wilderness material atlas lifecycle missing");
}
if (!serverConfig.assets.wildernessMaterialAtlas
  || serverConfig.assets.wildernessMaterialAtlas.url !== "https://wild.hubao.tv/assets/wilderness-materials-atlas-v1.webp"
  || serverConfig.assets.wildernessMaterialAtlas.version !== "wilderness-materials-v1") {
  throw new Error("server wilderness material atlas config missing or version mismatch");
}
if (premiumUiSize > 800 * 1024) throw new Error(`premium UI atlas too large: ${premiumUiSize}`);
if (wildernessMaterialSize > 900 * 1024) throw new Error(`wilderness material atlas too large: ${wildernessMaterialSize}`);
if (!/ANIMAL_PORTRAIT_ATLAS/.test(game)
  || !/downloadRemoteAnimalPortraitAtlas/.test(game)
  || !/saveRemoteAnimalPortraitAtlas/.test(game)
  || !/loadAnimalPortraitCandidate/.test(game)) {
  throw new Error("remote animal portrait atlas lifecycle missing");
}
if (!serverConfig.assets.animalPortraitAtlas
  || serverConfig.assets.animalPortraitAtlas.url !== "https://wild.hubao.tv/assets/animal-portraits-atlas-v4.jpg"
  || serverConfig.assets.animalPortraitAtlas.version !== "animal-portraits-v4") {
  throw new Error("server animal portrait atlas config missing or version mismatch");
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
if (urlResolver.remoteWildernessMaterialUrl({ url: serverConfig.assets.wildernessMaterialAtlas.url, urlStorageKey: "legacy" }) !== serverConfig.assets.wildernessMaterialAtlas.url
  || urlResolver.remoteAnimalPortraitUrl({ url: serverConfig.assets.animalPortraitAtlas.url, urlStorageKey: "legacy" }) !== serverConfig.assets.animalPortraitAtlas.url) {
  throw new Error("reviewed server asset URLs should override stale local development URLs");
}
if (!/assets\/art\/core-sprites-atlas\.png/.test(game) || !/assets\/art\/core-map-anime-v1\.jpg/.test(game)) {
  throw new Error("core first-package art config missing");
}
if (/"value": "assets\/art\/core-sprites-atlas\.png"/.test(project) || /"value": "assets\/art\/core-map-anime-v1\.jpg"/.test(project)) {
  throw new Error("core first-package art should not be ignored");
}
if (!/"value": "assets\/art\/core-map-anime-v1\.webp"/.test(project)) {
  throw new Error("legacy WebP map should stay out of the upload package");
}
if (!/"value": "assets\/art\/animal-portraits-atlas-v4\.jpg"/.test(project)) {
  throw new Error("remote animal portraits should be excluded from the first package");
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
if (coreSpritesSize > 1400 * 1024) {
  throw new Error(`core sprites atlas too large: ${coreSpritesSize}`);
}
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
    else total += stat.size;
  });
  return total;
}
const estimated = packageSize(".", { mainOnly: true });
// Keep a practical source-tree safety margin below WeChat's official 4MiB
// main-package limit without rejecting the current compressed-ready runtime
// for a few kilobytes above the old 3.5MiB project target.
const firstPackageSafetyLimit = Math.floor(3.76 * 1024 * 1024);
if (estimated > firstPackageSafetyLimit) {
  throw new Error(`estimated first package too large: ${estimated} (safety limit ${firstPackageSafetyLimit})`);
}
subpackageRoots.forEach((entry) => {
  const size = packageSize(entry);
  if (size > 4 * 1024 * 1024) throw new Error(`subpackage ${entry} too large: ${size}`);
});
const totalEstimated = estimated + subpackageRoots.reduce((sum, entry) => sum + packageSize(entry), 0);
if (totalEstimated > Math.floor(3.95 * 1024 * 1024)) throw new Error(`estimated total package exceeds the 3.95MiB safety target: ${totalEstimated}`);

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
  console.log(`remote art check ok (main ${(estimated / 1024 / 1024).toFixed(3)}MiB, total ${(totalEstimated / 1024 / 1024).toFixed(3)}MiB)`);
}).catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
