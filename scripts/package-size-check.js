const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
const ignored = (config.packOptions && config.packOptions.ignore) || [];
const ignoredFiles = new Set(ignored.filter((item) => item.type === "file").map((item) => item.value));
const ignoredFolders = new Set(ignored.filter((item) => item.type === "folder").map((item) => item.value));
const subpackageRoots = new Set(((JSON.parse(fs.readFileSync(path.join(root, "game.json"), "utf8"))).subpackages || []).map((item) => item.root));

function ignoredPath(relative, isDirectory) {
  if (!relative) return false;
  if (relative.startsWith(".git/")) return true;
  if (!isDirectory && ignoredFiles.has(relative)) return true;
  return Array.from(ignoredFolders).some((folder) => relative === folder || relative.startsWith(`${folder}/`));
}

function walk(directory, relative = "") {
  const rows = [];
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (ignoredPath(nextRelative, entry.isDirectory())) return;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...walk(absolute, nextRelative));
    else rows.push({ path: nextRelative, bytes: fs.statSync(absolute).size });
  });
  return rows;
}

const files = walk(root);
const isSubpackage = (file) => Array.from(subpackageRoots).some((folder) => file.path === folder || file.path.startsWith(`${folder}/`));
const mainBytes = files.filter((file) => !isSubpackage(file)).reduce((sum, file) => sum + file.bytes, 0);
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
// Match wechat-release-preflight-check: keep the 4MiB main-package gate,
// and use the conservative 20MiB total gate for configured subpackages.
// The project's tighter total-size budget remains visible as a warning.
const mainLimit = 4 * 1024 * 1024;
const totalLimit = subpackageRoots.size ? 20 * 1024 * 1024 : mainLimit;
if (mainBytes > mainLimit) throw new Error(`main package exceeds 4MiB: ${(mainBytes / 1048576).toFixed(3)}MiB`);
if (totalBytes > totalLimit) throw new Error(`upload total exceeds ${totalLimit / 1048576}MiB: ${(totalBytes / 1048576).toFixed(3)}MiB`);
if (totalBytes >= mainLimit) console.warn(`package budget warning: total ${(totalBytes / 1048576).toFixed(3)}MiB exceeds the optional 4MiB project budget`);

console.log(`package size check ok (main ${(mainBytes / 1048576).toFixed(3)}MiB, total ${(totalBytes / 1048576).toFixed(3)}MiB)`);
