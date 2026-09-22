const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const coreSpritesPath = path.join(root, "assets/art/core-sprites-atlas.png");
const coreMapPath = path.join(root, "assets/art/core-map-anime-v1.jpg");
const animalPortraitsPath = path.join(root, "assets/art/animal-portraits-atlas-v4.jpg");
const animalMapSpritesPath = path.join(root, "assets/art/animal-map-sprites-atlas-v2.png");
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

function webpInfo(data) {
  if (data.subarray(0, 4).toString("ascii") !== "RIFF" || data.subarray(8, 12).toString("ascii") !== "WEBP") return null;
  const chunk = data.subarray(12, 16).toString("ascii");
  if (chunk === "VP8 " && data.length >= 30 && data.subarray(23, 26).toString("hex") === "9d012a") {
    return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8X" && data.length >= 30) {
    return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 };
  }
  return null;
}

if (fs.existsSync(coreSpritesPath)) {
  throw new Error("retired core sprites atlas should stay removed from the first package");
}

const coreMap = fs.readFileSync(coreMapPath);
const coreMapInfo = jpegInfo(coreMap);
if (!coreMapInfo || coreMapInfo.width !== 1672 || coreMapInfo.height !== 941) {
  throw new Error(`core anime map must stay a 1672x941 baseline JPEG: ${JSON.stringify(coreMapInfo)}`);
}
if (coreMapInfo.progressive) throw new Error("core anime map must use baseline JPEG for broad wx.createImage compatibility");
// Clear broad shapes remain sharp on phone screens without spending the package
// budget on details hidden behind the HUD and animal interactions.
if (coreMap.length < 160 * 1024 || coreMap.length > 300 * 1024) {
  throw new Error(`core map unexpected size: ${coreMap.length}`);
}

const animalPortraits = fs.readFileSync(animalPortraitsPath);
if (animalPortraits.subarray(0, 2).toString("hex") !== "ffd8") throw new Error("animal portraits is not a valid JPEG");
if (animalPortraits.length < 90 * 1024 || animalPortraits.length > 140 * 1024) throw new Error(`animal portraits v4 unexpected size: ${animalPortraits.length}`);

[
  // Full 25-species sandbox atlas stays in the first package.
  { path: animalMapSpritesPath, width: 896, height: 512, min: 75 * 1024, max: 96 * 1024, label: "animal map sprites v2" },
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
if (!/assets\/art\/core-map-anime-v1\.jpg/.test(game)
  || !/ANIMAL_PORTRAITS_SRC/.test(game) || !/ensureLocalArtSlot\("animalPortraits"/.test(game) || !/assets\/art\/animal-map-sprites-atlas-v2\.png/.test(game)
  || !/assets\/art\/facility-sprites-atlas-v4\.png/.test(game)) {
  throw new Error("game should load core art, local animal portraits and local sandbox sprites");
}
if (/assets\/art\/core-sprites-atlas\.png/.test(game) || /ensureLocalArtSlot\("atlas"/.test(game)) {
  throw new Error("game should not decode or reference the retired local core sprites atlas");
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
  throw new Error("sandbox animals must use the 25-species full-body atlas without silhouette fallback");
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
if (/"value": "assets\/art\/core-map-anime-v1\.jpg"/.test(project)) {
  throw new Error("core map must stay in the first package");
}
if (/"value": "assets\/art\/animal-portraits-atlas-v4\.jpg"/.test(project)) {
  throw new Error("animal portraits should stay in the first package");
}
[
  "assets/art/facility-sprites-atlas-v4.png",
  "assets/art/collection/collection-items-atlas.png"
].forEach((asset) => {
  if (!project.includes(`"value": "${asset}"`)) {
    throw new Error(`${asset} should stay outside the first package and download after login`);
  }
});
if (project.includes(`"value": "assets/art/animal-map-sprites-atlas-v2.png"`)) {
  throw new Error("sandbox animal sprites should stay in the first package");
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
