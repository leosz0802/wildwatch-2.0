const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const coreSpritesPath = path.join(root, "assets/art/core-sprites-atlas.png");
const coreMapPath = path.join(root, "assets/art/core-map.jpg");
const animalPortraitsPath = path.join(root, "assets/art/animal-portraits-atlas-v4.jpg");
const animalMapSpritesPath = path.join(root, "assets/art/animal-map-sprites-atlas-v1.png");
const facilitiesPath = path.join(root, "assets/art/facility-sprites-atlas-v4.png");
const collectionItemsPath = path.join(root, "assets/art/collection/collection-items-atlas.png");
const gamePath = path.join(root, "js/game.js");
const projectPath = path.join(root, "project.config.json");

function jpegInfo(data) {
  let offset = 2;
  while (offset + 9 < data.length) {
    if (data[offset] !== 0xff) { offset += 1; continue; }
    const marker = data[offset + 1];
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = data.readUInt16BE(offset + 2);
    if ((marker >= 0xc0 && marker <= 0xc3) && length >= 8) {
      return { progressive: marker === 0xc2, height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
    }
    if (length < 2) break;
    offset += 2 + length;
  }
  return null;
}

const coreSprites = fs.readFileSync(coreSpritesPath);
if (coreSprites.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
  throw new Error("core-sprites-atlas.png is not a valid PNG");
}
if (coreSprites.readUInt32BE(16) !== 2048 || coreSprites.readUInt32BE(20) !== 2048) {
  throw new Error("core sprites atlas dimensions changed");
}
if (coreSprites.length < 700 * 1024 || coreSprites.length > 1400 * 1024) {
  throw new Error(`core sprites atlas unexpected size: ${coreSprites.length}`);
}

const coreMap = fs.readFileSync(coreMapPath);
if (coreMap.subarray(0, 2).toString("hex") !== "ffd8") {
  throw new Error("core-map.jpg is not a valid JPEG");
}
const coreMapInfo = jpegInfo(coreMap);
if (!coreMapInfo || coreMapInfo.width < 2304 || coreMapInfo.height < 1296 || !coreMapInfo.progressive) {
  throw new Error(`core map must stay high-resolution progressive JPEG: ${JSON.stringify(coreMapInfo)}`);
}
// 高清底图必须在正常沙盘缩放下保持原生像素，同时为 4MiB 总包预留余量。
if (coreMap.length < 250 * 1024 || coreMap.length > 340 * 1024) {
  throw new Error(`core map unexpected size: ${coreMap.length}`);
}

const animalPortraits = fs.readFileSync(animalPortraitsPath);
if (animalPortraits.subarray(0, 2).toString("hex") !== "ffd8") throw new Error("animal portraits is not a valid JPEG");
if (animalPortraits.length < 90 * 1024 || animalPortraits.length > 140 * 1024) throw new Error(`animal portraits v4 unexpected size: ${animalPortraits.length}`);

[
  { path: animalMapSpritesPath, width: 896, height: 384, min: 60 * 1024, max: 110 * 1024, label: "animal map sprites v1" },
  { path: facilitiesPath, width: 480, height: 320, min: 12 * 1024, max: 60 * 1024, label: "facility sprites v4" },
  // V2 deliberately uses flat color, broad silhouettes and transparent space.
  // A lower byte size is a quality signal here: the icons stay crisp at 96px
  // without the noisy micro-texture that made the previous atlas look blurred.
  { path: collectionItemsPath, width: 864, height: 480, min: 35 * 1024, max: 140 * 1024, label: "story discovery icons" }
].forEach((asset) => {
  const data = fs.readFileSync(asset.path);
  if (data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error(`${asset.label} is not a valid PNG`);
  if (data.readUInt32BE(16) !== asset.width || data.readUInt32BE(20) !== asset.height) throw new Error(`${asset.label} dimensions changed`);
  if (data.length < asset.min || data.length > asset.max) throw new Error(`${asset.label} unexpected size: ${data.length}`);
});

const game = fs.readFileSync(gamePath, "utf8");
if (!/assets\/art\/core-sprites-atlas\.png/.test(game) || !/assets\/art\/core-map\.jpg/.test(game)
  || !/assets\/art\/animal-portraits-atlas-v4\.jpg/.test(game) || !/assets\/art\/animal-map-sprites-atlas-v1\.png/.test(game)
  || !/assets\/art\/facility-sprites-atlas-v4\.png/.test(game)) {
  throw new Error("game should load core first-package art");
}
if (!/downloadFile/.test(game) || !/getFileSystemManager/.test(game)) {
  throw new Error("game should support remote art atlas download and cache");
}
if (/assets\/art\/bootstrap-art-atlas\.png/.test(game)) {
  throw new Error("game should not use bootstrap placeholder art");
}
const portraitStart = game.indexOf("\n  drawAnimalPortraitAsset(");
const portraitEnd = game.indexOf("\n  drawUiIconBadge(", portraitStart);
const portraitSource = game.slice(portraitStart, portraitEnd);
if (!portraitSource.includes("V4 图集") || portraitSource.includes('"#ffd65a"') || portraitSource.includes('"#e7fff5"')) {
  throw new Error("animal portrait runtime should use the V4 single-ring frame without legacy bright double bases");
}
const stickerStart = game.indexOf("\n  drawAnimalSticker(");
const stickerEnd = game.indexOf("\n  animalMapSpriteIndex(", stickerStart);
const stickerSource = game.slice(stickerStart, stickerEnd);
if (!stickerSource.includes("animalMapSprites") || !stickerSource.includes("spriteIndex") || stickerSource.includes("drawAnimalSilhouette")) {
  throw new Error("sandbox animals must use the 21-species full-body atlas without silhouette fallback");
}
if (/\.drawAnimalSilhouette\s*\(/.test(game)) {
  throw new Error("no screen may invoke the legacy floating animal silhouette renderer");
}
const groundedStart = game.indexOf("\n  drawGroundedAnimal(");
const groundedEnd = game.indexOf("\n  groundedAnimalRenderMetrics(", groundedStart);
if (game.slice(groundedStart, groundedEnd).includes("drawGroundedPlayerToken")) {
  throw new Error("sandbox overview must not replace full-body animals with abstract player tokens");
}
const project = fs.readFileSync(projectPath, "utf8");
if (/"value": "assets\/art\/core-map\.jpg"/.test(project) || /"value": "assets\/art\/core-sprites-atlas\.png"/.test(project)) {
  throw new Error("core art must stay in the first package");
}
[
  "map",
  "animals",
  "icon_eye",
  "icon_signal",
  "icon_leaf",
  "icon_claw",
  "icon_water",
  "icon_berry"
].forEach((frame) => {
  if (!new RegExp(`${frame}: \\{ x:`).test(game)) {
    throw new Error(`missing atlas frame: ${frame}`);
  }
});

console.log("art atlas check ok");
