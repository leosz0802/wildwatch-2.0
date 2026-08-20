const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "assets/art/facility-sprites-atlas-v4.png");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "wild-guardian-facilities-"));
const svgPath = path.join(temp, "facility-atlas-v4.svg");
const rawPath = path.join(temp, "facility-atlas-v4-raw.png");

const cell = (x, y, body) => `<g transform="translate(${x} ${y})">${body}</g>`;
const ground = (wide = 116) => `
  <ellipse cx="80" cy="128" rx="${wide / 2}" ry="15" fill="#263b33" opacity=".17"/>
  <ellipse cx="80" cy="124" rx="${wide / 2 - 5}" ry="11" fill="url(#ground)" opacity=".72"/>`;
const solar = (x, y, w = 48, h = 18) => `
  <g transform="translate(${x} ${y}) skewX(-18)">
    <rect width="${w}" height="${h}" rx="2" fill="#496158" stroke="#24372f" stroke-width="2"/>
    <path d="M${w / 3} 1v${h - 2}M${w * 2 / 3} 1v${h - 2}M1 ${h / 2}h${w - 2}" stroke="#9db5bd" stroke-width="1" opacity=".9"/>
  </g>`;
const windowPane = (x, y, w = 18, h = 23, warm = false) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${warm ? "#f1d28b" : "#a9c7c5"}" stroke="#30483d" stroke-width="2.4"/>
  <path d="M${x + 3} ${y + 4}h${w - 6}" stroke="#fbf8ee" stroke-width="2" opacity=".48"/>`;
const antenna = (x, y, height = 34) => `
  <path d="M${x} ${y}v-${height}" stroke="#30483d" stroke-width="3" stroke-linecap="round"/>
  <circle cx="${x}" cy="${y - height}" r="5" fill="#c9aa6a" stroke="#30483d" stroke-width="2"/>
  <path d="M${x - 9} ${y - height + 8}q9-9 18 0M${x - 13} ${y - height + 13}q13-13 26 0" fill="none" stroke="#6f8579" stroke-width="1.5" opacity=".8"/>`;
const plant = (x, y, s = 1) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M0 13C-8 8-9 2-5 0c5-2 8 4 7 9C4 3 9 0 12 3c3 4-2 9-9 11" fill="#6f8d64" stroke="#30483d" stroke-width="1.8"/>
  </g>`;

const patrol = `${ground(124)}
  <path d="M29 113l10-55 78-7 18 56-23 18-63 1z" fill="#d9d3bd" stroke="#30483d" stroke-width="3"/>
  <path d="M36 57l35-28 61 11-15 17z" fill="#496158" stroke="#24372f" stroke-width="3"/>
  <path d="M44 57l27-21 44 8-11 8z" fill="#6f8579" opacity=".72"/>
  ${solar(70, 33, 40, 14)}
  ${windowPane(48, 70, 20, 25, true)}${windowPane(75, 67, 22, 27, false)}
  <path d="M105 62v50h21V58" fill="#30483d" stroke="#24372f" stroke-width="3"/>
  <path d="M42 110h73M52 110v19M106 108v19" stroke="#30483d" stroke-width="3"/>
  ${antenna(123, 43, 30)}${plant(28, 111, .8)}${plant(129, 112, .7)}
  <circle cx="43" cy="63" r="4" fill="#c9aa6a"/>`;

const hydro = `${ground(126)}
  <path d="M35 111l7-51 77-4 15 51-20 17H50z" fill="#e3dfca" stroke="#30483d" stroke-width="3"/>
  <path d="M39 62l35-28 58 12-13 15z" fill="#496158" stroke="#24372f" stroke-width="3"/>
  ${solar(70, 38, 39, 13)}
  ${windowPane(52, 69, 22, 28, false)}${windowPane(81, 66, 23, 30, false)}
  <path d="M111 65v45h15M48 109v22M112 108v23" stroke="#30483d" stroke-width="3"/>
  <path d="M26 119c22-9 36-8 54 0 18 9 37 8 58-1" fill="none" stroke="#84b9b5" stroke-width="8" opacity=".78"/>
  <path d="M24 118c24-7 39-5 56 2 19 8 37 6 59-2" fill="none" stroke="#d8ece5" stroke-width="2"/>
  <path d="M131 56v43M131 70h10M141 70v30" stroke="#30483d" stroke-width="2.5"/>
  <circle cx="141" cy="69" r="4" fill="#c9aa6a"/>${plant(29, 105, .75)}`;

const intel = `${ground(122)}
  <path d="M30 111l9-52 79-4 16 52-22 18H48z" fill="#d8d6c6" stroke="#30483d" stroke-width="3"/>
  <path d="M36 60l35-25 61 11-14 14z" fill="#3d5a50" stroke="#24372f" stroke-width="3"/>
  ${windowPane(50, 71, 48, 24, false)}
  <path d="M105 64v45h22V61" fill="#496158" stroke="#24372f" stroke-width="3"/>
  <path d="M46 109h70M53 109v19M108 108v20" stroke="#30483d" stroke-width="3"/>
  <path d="M119 43q17-17 28-4-2 18-21 20z" fill="#f0ede2" stroke="#30483d" stroke-width="3"/>
  <path d="M131 50l-7 12" stroke="#30483d" stroke-width="3"/>
  ${antenna(72, 39, 27)}
  <rect x="26" y="88" width="16" height="25" rx="3" fill="#6f8579" stroke="#30483d" stroke-width="2"/>
  <circle cx="34" cy="96" r="3" fill="#c9aa6a"/>${plant(132, 110, .7)}`;

const migration = `${ground(130)}
  <path d="M41 117l4-42 73-4 7 44-16 12H53z" fill="#d9d4bd" stroke="#30483d" stroke-width="3"/>
  <path d="M28 72l40-25 72 12-17 18z" fill="#496158" stroke="#24372f" stroke-width="3"/>
  <path d="M39 72l31-18 52 8-10 9z" fill="#6f8579"/>
  <rect x="54" y="78" width="54" height="23" rx="7" fill="#9db5bd" stroke="#30483d" stroke-width="3"/>
  <path d="M61 83h39" stroke="#fbf8ee" stroke-width="3" opacity=".58"/>
  <path d="M49 104v29M113 103v30M35 132h91" stroke="#30483d" stroke-width="3"/>
  <path d="M56 114h48M62 121h37M69 128h25" stroke="#98763f" stroke-width="3" stroke-linecap="round"/>
  ${antenna(128, 59, 27)}${plant(30, 111, .8)}${plant(126, 112, .75)}`;

const governance = `${ground(132)}
  <path d="M30 110l12-48 75-6 17 49-22 21H47z" fill="#e5dfc9" stroke="#30483d" stroke-width="3"/>
  <path d="M36 63l36-26 62 12-16 14z" fill="#496158" stroke="#24372f" stroke-width="3"/>
  <path d="M45 62l28-18 43 8-9 8z" fill="#6f8579"/>
  ${solar(74, 44, 33, 11)}
  ${windowPane(48, 72, 23, 25, true)}${windowPane(91, 68, 23, 28, false)}
  <path d="M76 67v45h14V66" fill="#30483d" stroke="#24372f" stroke-width="3"/>
  <circle cx="83" cy="88" r="3" fill="#c9aa6a"/>
  <path d="M41 108h80M48 108v20M113 107v20" stroke="#30483d" stroke-width="3"/>
  <path d="M18 121h25M117 119h27" stroke="#98763f" stroke-width="3" stroke-linecap="round"/>
  ${plant(24, 105, .9)}${plant(132, 105, .9)}`;

const memorial = `${ground(118)}
  <path d="M39 117V78q0-23 19-23t19 23v39" fill="#d8d3c0" stroke="#30483d" stroke-width="3"/>
  <path d="M83 117V66q0-26 21-26t21 26v51" fill="#e5dfc9" stroke="#30483d" stroke-width="3"/>
  <path d="M47 116V80q0-14 11-14t11 14v36M91 116V68q0-15 13-15t13 15v48" fill="#496158" opacity=".30" stroke="#30483d" stroke-width="2"/>
  <path d="M80 117V54" stroke="#c9aa6a" stroke-width="4"/>
  <circle cx="80" cy="52" r="8" fill="#c9aa6a" stroke="#30483d" stroke-width="3"/>
  <path d="M80 58c-10-8-17-1-15 6 6 1 11-1 15-6zm0 0c10-8 17-1 15 6-6 1-11-1-15-6z" fill="#6f8d64" stroke="#30483d" stroke-width="1.8"/>
  <path d="M32 118h99" stroke="#30483d" stroke-width="4" stroke-linecap="round"/>
  ${plant(31, 105, 1)}${plant(126, 105, 1)}
  <circle cx="80" cy="95" r="5" fill="#f1d28b" opacity=".8"/>`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#91a17b"/><stop offset="1" stop-color="#6f8579"/></linearGradient>
    <filter id="paper" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="17" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 .08 0" result="grain"/>
      <feBlend in="SourceGraphic" in2="grain" mode="multiply"/>
    </filter>
  </defs>
  <g filter="url(#paper)" stroke-linejoin="round" stroke-linecap="round">
    ${cell(0, 0, patrol)}${cell(160, 0, hydro)}${cell(320, 0, intel)}
    ${cell(0, 160, migration)}${cell(160, 160, governance)}${cell(320, 160, memorial)}
  </g>
</svg>`;

fs.writeFileSync(svgPath, svg);
execFileSync("sips", ["-s", "format", "png", svgPath, "--out", rawPath], { stdio: "ignore" });
execFileSync("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-i", rawPath,
  "-filter_complex", "[0:v]split[a][b];[a]palettegen=max_colors=192:reserve_transparent=on[p];[b][p]paletteuse=dither=sierra2_4a",
  "-frames:v", "1", "-compression_level", "9", "-pred", "mixed", "-y", output
]);
fs.rmSync(temp, { recursive: true, force: true });
console.log(`facility atlas v4 built: ${path.relative(root, output)} ${(fs.statSync(output).size / 1024).toFixed(1)}KiB`);
