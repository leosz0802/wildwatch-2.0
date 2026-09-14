const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function walk(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target, predicate) : (predicate(target) ? [target] : []);
  });
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function localRequires(sourceFile) {
  const source = fs.readFileSync(sourceFile, "utf8");
  const modules = [];
  const pattern = /require\(\s*["'](\.[^"']+)["']\s*\)/g;
  let match;
  while ((match = pattern.exec(source))) {
    let target = path.resolve(path.dirname(sourceFile), match[1]);
    if (!path.extname(target)) target += ".js";
    modules.push(target);
  }
  return modules;
}

const entry = path.join(root, "game.js");
const reachable = new Set();
const queue = [entry];
while (queue.length) {
  const file = queue.shift();
  if (reachable.has(file)) continue;
  assert(fs.existsSync(file), `missing required module: ${relative(file)}`);
  reachable.add(file);
  localRequires(file).forEach((dependency) => {
    assert(dependency.startsWith(root + path.sep), `local require escaped project: ${dependency}`);
    queue.push(dependency);
  });
}

const runtimeModules = walk(path.join(root, "js"), (file) => file.endsWith(".js"));
const unreachableModules = runtimeModules.filter((file) => !reachable.has(file));
assert(!unreachableModules.length, `unreachable runtime modules: ${unreachableModules.map(relative).join(", ")}`);

const assetReferences = new Set();
const assetPattern = /["']((?:assets|chapter-assets)\/[^"']+)["']/g;
reachable.forEach((file) => {
  const source = fs.readFileSync(file, "utf8");
  let match;
  while ((match = assetPattern.exec(source))) assetReferences.add(match[1].replace(/\\/g, "/"));
});

assetReferences.forEach((asset) => {
  assert(fs.existsSync(path.join(root, asset)), `referenced runtime asset is missing: ${asset}`);
});

const projectConfig = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
const ignoredPackageEntries = ((projectConfig.packOptions || {}).ignore || []).map((entry) => ({
  value: String(entry.value || "").replace(/\/$/, ""),
  type: entry.type
}));
function isPackageIgnored(asset) {
  return ignoredPackageEntries.some((entry) => {
    if (entry.type === "file") return asset === entry.value;
    return asset === entry.value || asset.startsWith(`${entry.value}/`);
  });
}
const runtimeAssets = walk(path.join(root, "assets")).concat(walk(path.join(root, "chapter-assets")))
  .map(relative)
  .filter((asset) => !isPackageIgnored(asset))
  .sort();
const packageConfig = JSON.parse(fs.readFileSync(path.join(root, "game.json"), "utf8"));
const subpackageBootstraps = new Set((packageConfig.subpackages || []).map((item) => `${item.root.replace(/\/$/, "")}/game.js`));
const orphanedAssets = runtimeAssets.filter((asset) => !assetReferences.has(asset) && !subpackageBootstraps.has(asset));
assert(!orphanedAssets.length, `runtime assets without a reachable reference: ${orphanedAssets.join(", ")}`);

const obsoleteSymbols = {
  "js/game.js": [
    "drawHomeActionDock", "latestGuardianEcho", "drawGuardianEchoRow", "buildGuardianEchoDetail",
    "drawHomeGrowthTiles", "drawReserveStateTile", "drawReserveBroadcastRow", "lighterLeaf",
    "drawGroundedPlayerToken", "drawEventIcon", "openStrategyDetail", "drawThreatTileV3",
    "drawPatrolHoundLevelBadge", "guardianGradeColor", "openMetricActionTask",
    "drawMaterialSummary", "buildActionResourceDetail", "requestFieldPermit",
    "buildActionPointDetail", "drawLakePatch", "metric", "tag",
    "buildMissionPushDetail", "drawPatrolDayGauge", "animalFacilityOverlapCount",
    "buildRunGrowthDetail", "drawHomeProsperityStrip", "dailyCareSteps", "infoTickerCards",
    "openReserveStateDetail", "openReserveBroadcastDetail", "buildHoundTeamDetail",
    "actionResourceGuide", "guardianGradeFromScore", "dailyActionShortLabel", "truncateLabel",
    "openMissionPush", "drawFundStack", "shouldOfferRecommendation"
  ],
  "js/reserveView.js": ["labelForTone"],
  "js/simulator.js": ["withTrustTier", "addIntel", "consumeIntel", "consumeFieldPermit"],
  "js/ecologyEconomy.js": ["progressiveAnimalUpkeep"]
};
Object.keys(obsoleteSymbols).forEach((file) => {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  obsoleteSymbols[file].forEach((name) => {
    assert(!new RegExp(`\\b${name}\\s*\\(`).test(source), `obsolete runtime symbol remains: ${file}#${name}`);
  });
});

assert(
  !fs.existsSync(path.join(root, "assets/art/animal-map-sprites-atlas-v1.png")),
  "superseded animal map atlas v1 should stay removed"
);

console.log(`runtime reachability check ok (${reachable.size} modules, ${runtimeAssets.length} packaged assets, 0 orphans)`);
