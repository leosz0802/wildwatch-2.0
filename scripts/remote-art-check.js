const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const gamePath = path.join(root, "js/game.js");
const projectPath = path.join(root, "project.config.json");
const gameConfigPath = path.join(root, "game.json");
const coreSpritesPath = path.join(root, "assets/art/core-sprites-atlas.png");
const coreMapPath = path.join(root, "assets/art/core-map.jpg");

const game = fs.readFileSync(gamePath, "utf8");
const project = fs.readFileSync(projectPath, "utf8");
const gameConfig = JSON.parse(fs.readFileSync(gameConfigPath, "utf8"));
const coreSpritesSize = fs.statSync(coreSpritesPath).size;
const coreMapSize = fs.statSync(coreMapPath).size;

if (!/remote:\s*\{[\s\S]*version:\s*"savanna-v3-20260707"/.test(game)) {
  throw new Error("remote art atlas config missing");
}
if (!/downloadRemoteArtAtlas/.test(game) || !/saveRemoteArtAtlas/.test(game) || !/loadArtAtlasCandidate/.test(game)) {
  throw new Error("remote art atlas lifecycle missing");
}
if (!/downloadFile/.test(game) || !/getFileSystemManager/.test(game) || !/setStorageSync/.test(game)) {
  throw new Error("remote art atlas should download, persist and cache");
}
if (!/assets\/art\/core-sprites-atlas\.png/.test(game) || !/assets\/art\/core-map\.jpg/.test(game)) {
  throw new Error("core first-package art config missing");
}
if (/"value": "assets\/art\/core-sprites-atlas\.png"/.test(project) || /"value": "assets\/art\/core-map\.jpg"/.test(project)) {
  throw new Error("core first-package art should not be ignored");
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
if (estimated > Math.floor(3.3 * 1024 * 1024)) {
  throw new Error(`estimated first package too large: ${estimated}`);
}
subpackageRoots.forEach((entry) => {
  const size = packageSize(entry);
  if (size > 4 * 1024 * 1024) throw new Error(`subpackage ${entry} too large: ${size}`);
});
const totalEstimated = estimated + subpackageRoots.reduce((sum, entry) => sum + packageSize(entry), 0);
if (totalEstimated > Math.floor(3.95 * 1024 * 1024)) throw new Error(`estimated total package exceeds the 3.95MiB safety target: ${totalEstimated}`);

console.log(`remote art check ok (main ${(estimated / 1024 / 1024).toFixed(3)}MiB, total ${(totalEstimated / 1024 / 1024).toFixed(3)}MiB)`);
