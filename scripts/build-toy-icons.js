const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "art-source/ui-icons-legacy");
const iconDir = path.join(root, "assets/art/archive/ui-v3/icons");
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wild-guardian-icons-"));
const files = fs.readdirSync(sourceDir).filter((file) => file.endsWith(".png")).sort();

if (files.length !== 29) {
  throw new Error(`expected 29 source icons, got ${files.length}`);
}

files.forEach((file) => {
  const key = path.basename(file, ".png");
  const source = path.join(sourceDir, file);
  const encoded = fs.readFileSync(source).toString("base64");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <clipPath id="subject"><circle cx="48" cy="48" r="30"/></clipPath>
    <filter id="muted" x="-10%" y="-10%" width="120%" height="120%">
      <feColorMatrix type="saturate" values="0.68"/>
    </filter>
  </defs>
  <circle cx="48" cy="50" r="35" fill="#24372F" opacity="0.13"/>
  <circle cx="48" cy="47" r="35" fill="#FBF8EE" stroke="#30483D" stroke-width="2"/>
  <g clip-path="url(#subject)" filter="url(#muted)">
    <image x="0" y="0" width="96" height="96" xlink:href="data:image/png;base64,${encoded}" preserveAspectRatio="xMidYMid meet"/>
  </g>
  <path d="M29 69 C39 75 57 75 67 69" fill="none" stroke="#C9AA6A" stroke-width="2" stroke-linecap="round" opacity="0.78"/>
  <path d="M31 24 C38 18 54 16 64 22" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" opacity="0.44"/>
</svg>`;
  const svgPath = path.join(tempDir, `${key}.svg`);
  const rawPath = path.join(tempDir, `${key}-raw.png`);
  const outPath = path.join(tempDir, file);
  fs.writeFileSync(svgPath, svg);
  execFileSync("sips", ["-s", "format", "png", svgPath, "--out", rawPath], { stdio: "ignore" });
  execFileSync("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-i", rawPath,
    "-filter_complex", "[0:v]split[a][b];[a]palettegen=max_colors=128:reserve_transparent=on[p];[b][p]paletteuse=dither=bayer:bayer_scale=3",
    "-frames:v", "1", "-compression_level", "9", "-pred", "mixed", "-y", outPath
  ]);
});

files.forEach((file) => fs.copyFileSync(path.join(tempDir, file), path.join(iconDir, file)));
const bytes = files.reduce((sum, file) => sum + fs.statSync(path.join(iconDir, file)).size, 0);
fs.rmSync(tempDir, { recursive: true, force: true });
console.log(`restrained icon set rebuilt: ${files.length} icons, ${(bytes / 1024).toFixed(1)}KiB`);
