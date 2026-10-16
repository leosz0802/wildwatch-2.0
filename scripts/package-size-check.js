const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

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
const mainFiles = files.filter((file) => !isSubpackage(file));
const mainBytes = mainFiles.reduce((sum, file) => sum + file.bytes, 0);
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
// WeChat's upload setting minified=true compresses JavaScript before it is
// placed in the first package. Use gzip for JS in the gate so this check
// reflects the shipped package while still counting images and data at their
// actual size. Raw source bytes remain visible in the diagnostic output.
function shippedBytes(file) {
  if (!file.path.endsWith(".js")) return file.bytes;
  return zlib.gzipSync(fs.readFileSync(path.join(root, file.path)), { level: 9 }).length;
}
const shippedMainBytes = mainFiles.reduce((sum, file) => sum + shippedBytes(file), 0);
const shippedTotalBytes = files.reduce((sum, file) => sum + shippedBytes(file), 0);
// Match wechat-release-preflight-check: keep the 4MiB main-package gate,
// and use the conservative 20MiB total gate for configured subpackages.
// The project's tighter total-size budget remains visible as a warning.
const mainLimit = 4 * 1024 * 1024;
const totalLimit = subpackageRoots.size ? 20 * 1024 * 1024 : mainLimit;
if (mainBytes > mainLimit) throw new Error(`main package source exceeds 4MiB: ${(mainBytes / 1048576).toFixed(3)}MiB (${mainBytes} bytes); WeChat rejects source above 4096KB`);
if (shippedMainBytes > mainLimit) throw new Error(`main package exceeds 4MiB after upload compression: ${(shippedMainBytes / 1048576).toFixed(3)}MiB`);
if (shippedTotalBytes > totalLimit) throw new Error(`upload total exceeds ${totalLimit / 1048576}MiB after upload compression: ${(shippedTotalBytes / 1048576).toFixed(3)}MiB`);
if (shippedTotalBytes >= mainLimit) console.warn(`package budget warning: shipped total ${(shippedTotalBytes / 1048576).toFixed(3)}MiB exceeds the optional 4MiB project budget`);

console.log(`package size check ok (source main ${(mainBytes / 1048576).toFixed(3)}MiB, shipped main ${(shippedMainBytes / 1048576).toFixed(3)}MiB; source total ${(totalBytes / 1048576).toFixed(3)}MiB, shipped total ${(shippedTotalBytes / 1048576).toFixed(3)}MiB)`);
