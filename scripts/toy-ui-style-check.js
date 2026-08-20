const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const gamePath = path.join(root, "js/game.js");
const iconDir = path.join(root, "assets/art/ui-v3/icons");
const source = fs.readFileSync(gamePath, "utf8");

function fail(message) {
  throw new Error(message);
}

const requiredStyleTokens = [
  '#18352a',
  '#244a3a',
  '#356a53',
  '#648273',
  '#8fa292',
  '#8fb9a5',
  '#c7a55f',
  '#fffdf7',
  '#f3f5f1',
  '#d35d57'
];

requiredStyleTokens.forEach((token) => {
  if (!source.toLowerCase().includes(token)) fail(`missing restrained UI palette token ${token}`);
});

const themeStart = source.indexOf("const UI_THEME = {");
const themeEnd = source.indexOf("\n};", themeStart);
const themeSource = source.slice(themeStart, themeEnd);
['#64d7c2', '#ffd65a', '#f46773', '#a99af4', '#70ccef'].forEach((token) => {
  if (themeSource.toLowerCase().includes(token)) fail(`bright toy token remained in the core theme: ${token}`);
});

[
  '#0d1f16',
  '#081a12',
  '#071b12',
  '#08261a',
  '#09261a'
].forEach((token) => {
  if (source.toLowerCase().includes(token)) fail(`deprecated near-black UI token returned: ${token}`);
});

if (!source.includes('drawPageBackdrop(ctx, variant = "field")')) fail("shared system page backdrop missing");
if (!source.includes('this.roundRect(ctx, x, y, w, h, 18, UI_THEME.surface, UI_THEME.separator)')) fail("shared iOS surface panel missing");
if (!source.includes('if (role === "primary") return { fill: UI_THEME.tint')) fail("semantic system primary button missing");
if (!source.includes('const UI_FONT_STACK')) fail("Apple system typography stack missing");
if (source.includes('g.addColorStop(1, "#6e73d7")')) fail("lavender modal gradient returned");
if (source.includes('g.addColorStop(0, "#35c7a3")')) fail("bright teal patrol shell returned");
if (!source.includes('const displaySize = Math.min(badgeSize, iconSize)')) fail("double-framed icon badge regression");
const badgeStart = source.indexOf("\n  drawUiIconBadge(ctx");
const badgeEnd = source.indexOf("\n  bindEvents()", badgeStart);
const badgeSource = source.slice(badgeStart, badgeEnd);
if (badgeSource.includes("iy + 4") || badgeSource.includes('"rgba(18,61,52,.18)"')) fail("ui badge restored the extra square shadow block");
if (source.includes("const iconR = 30") || source.includes("this.roundRect(ctx, x + 9, y + 10, 32, 32")) fail("material cards restored a second icon backing plate");

const iconFiles = fs.readdirSync(iconDir).filter((file) => file.endsWith(".png")).sort();
if (iconFiles.length !== 29) fail(`expected 29 independent toy icons, got ${iconFiles.length}`);

let totalBytes = 0;
iconFiles.forEach((file) => {
  const fullPath = path.join(iconDir, file);
  const buffer = fs.readFileSync(fullPath);
  totalBytes += buffer.length;
  if (buffer.length < 2000) fail(`${file} is unexpectedly small`);
  if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") fail(`${file} is not a PNG`);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width !== 96 || height !== 96) fail(`${file} must stay 96x96, got ${width}x${height}`);
});

if (totalBytes > 450 * 1024) fail(`toy icon set exceeds 450KiB: ${(totalBytes / 1024).toFixed(1)}KiB`);

console.log(`ios-inspired ui style check ok (${iconFiles.length} icons, ${(totalBytes / 1024).toFixed(1)}KiB)`);
