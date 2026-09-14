const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const gamePath = path.join(root, "js/game.js");
const projectPath = path.join(root, "project.config.json");

const game = fs.readFileSync(gamePath, "utf8");
const project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
const ignore = (project.packOptions && project.packOptions.ignore || []).map((item) => item.value);

function isIgnored(rel) {
  return ignore.some((entry) => rel === entry || rel.startsWith(`${entry}/`));
}

const assets = new Set();
const assetRe = /["'](assets\/[^"']+)["']/g;
let match = assetRe.exec(game);
while (match) {
  assets.add(match[1]);
  match = assetRe.exec(game);
}

assets.forEach((asset) => {
  if (!fs.existsSync(path.join(root, asset))) {
    throw new Error(`missing referenced asset: ${asset}`);
  }
});

[
  "assets/art/core-map-anime-v1.jpg",
  "assets/art/core-sprites-atlas.png"
].forEach((asset) => {
  if (!assets.has(asset)) throw new Error(`core first-package asset is not referenced: ${asset}`);
  if (isIgnored(asset)) throw new Error(`core first-package asset must not be ignored: ${asset}`);
});

if (Array.from(assets).some((asset) => asset.startsWith("assets/art/ui-v2/"))) {
  throw new Error("runtime should not reference deprecated ui-v2 icon assets");
}
const runtimeIcons = Array.from(assets).filter((asset) => asset.startsWith("assets/art/ui-v3/icons/"));
if (runtimeIcons.length < 23) {
  throw new Error(`runtime should reference every active ui-v3 icon, got ${runtimeIcons.length}`);
}
runtimeIcons.forEach((asset) => {
  if (isIgnored(asset)) throw new Error(`runtime ui-v3 icon must not be ignored: ${asset}`);
});
if (!assets.has("assets/art/collection/collection-items-atlas.png")) {
  throw new Error("collection V2 should reference its single lightweight item atlas");
}

[
  "assets/art/ui-v2/icons-complete-sheet-640.png"
].forEach((asset) => {
  if (fs.existsSync(path.join(root, asset)) && !isIgnored(asset)) {
    throw new Error(`deprecated ui-v2 asset should be ignored: ${asset}`);
  }
});

[
  "assets/art/game-art-atlas.png",
  "assets/art/savanna-map-v3.png",
  "assets/art/animals-large-v2.png",
  "assets/art/animals-special-v2.png",
  "assets/art/icons-3d-v2.png"
].forEach((asset) => {
  if (fs.existsSync(path.join(root, asset))) throw new Error(`stable build should not keep unused source asset: ${asset}`);
});

console.log("asset reference check ok");
