const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const gamePath = path.join(root, "js/game.js");
const source = fs.readFileSync(gamePath, "utf8");
const lines = source.split("\n");
const allowed = new Set([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 25, 28]);

function splitArgs(input) {
  const args = [];
  let current = "";
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      current += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (quote === "`" && ch === "$" && input[i + 1] === "{") {
        depth += 1;
        current += input[i + 1];
        i += 1;
        continue;
      }
      if (quote === "`" && ch === "}" && depth > 0) {
        depth -= 1;
        continue;
      }
      if (ch === quote && !(quote === "`" && depth > 0)) quote = null;
      continue;
    }
    if (ch === "\"" || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

const errors = [];
lines.forEach((line, index) => {
  const callStart = line.indexOf("this.text(");
  if (callStart < 0) return;
  const callEnd = line.lastIndexOf(");");
  if (callEnd < 0) return;
  const args = splitArgs(line.slice(callStart + "this.text(".length, callEnd));
  const sizeArg = args[4];
  if (/^\d+(?:\.\d+)?$/.test(sizeArg || "")) {
    const size = Number(sizeArg);
    if (!allowed.has(size)) errors.push(`${index + 1}: unsupported this.text size ${size}`);
  }
});

if (!/return \[28, 25, 24, 22, 20, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8\];/.test(source)) {
  errors.push("typographyScale does not match the Wild Reserve typography table");
}

if (!/normalizeTypeSize\(size/.test(source) || !/typographyCandidates\(size/.test(source)) {
  errors.push("dynamic typography helpers are missing");
}

if (!/const DESCRIPTION_TEXT_MIN = 10;/.test(source)) {
  errors.push("descriptive text minimum must be 10px");
}
if (!/requestedMin = Math\.max\(DESCRIPTION_TEXT_MIN/.test(source) || !/Math\.max\(DESCRIPTION_TEXT_MIN, Number\(size/.test(source)) {
  errors.push("fitted and wrapped descriptive text must enforce the 10px minimum");
}
if (!/visibleCount = Math\.max\(1, Math\.floor\(maxHeight \/ safeLineHeight\)\)/.test(source)) {
  errors.push("fitted descriptive text must truncate instead of overflowing its card");
}
if (!/Closing punctuation must travel with the preceding Chinese phrase/.test(source)) {
  errors.push("Chinese wrapping must keep closing punctuation with the preceding phrase");
}

if (errors.length) {
  throw new Error(`typography check failed:\n${errors.join("\n")}`);
}

console.log("typography check ok");
