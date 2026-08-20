const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const configPath = path.join(root, "code.fortify.config.json");
const projectPath = path.join(root, "project.config.json");
const failures = [];
const warnings = [];
const passes = [];

function pass(message) {
  passes.push(message);
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${path.basename(filePath)} 无法解析：${error.message}`);
    return null;
  }
}

function runtimeFiles() {
  const jsDirectory = path.join(root, "js");
  return ["game.js"].concat(
    fs.readdirSync(jsDirectory)
      .filter((name) => name.endsWith(".js"))
      .map((name) => `js/${name}`)
  ).sort();
}

function assertUnique(files, label) {
  const seen = new Set();
  files.forEach((file) => {
    if (seen.has(file)) fail(`${label} 内重复配置：${file}`);
    seen.add(file);
  });
}

if (!fs.existsSync(configPath)) {
  fail("缺少 code.fortify.config.json");
}

const config = fs.existsSync(configPath) ? readJson(configPath) : null;
const project = fs.existsSync(projectPath) ? readJson(projectPath) : null;
const obfuscationTasks = (((config || {}).obfuscation || {}).tasks) || [];
const watermarkFiles = (((config || {}).watermark || {}).files) || [];
const obfuscatedFiles = obfuscationTasks.flatMap((task) => task.files || []);

if (config) {
  if (!obfuscationTasks.length) fail("未配置任何代码混淆任务");
  else pass(`已配置 ${obfuscationTasks.length} 档代码混淆`);

  obfuscationTasks.forEach((task, index) => {
    if (![1, 2, 3].includes(task.level)) fail(`第 ${index + 1} 档混淆等级必须为 1、2 或 3`);
    if (!Array.isArray(task.files) || !task.files.length) fail(`第 ${index + 1} 档混淆文件为空`);
    assertUnique(task.files || [], `第 ${index + 1} 档混淆`);
  });
  assertUnique(obfuscatedFiles, "全部混淆任务");
  assertUnique(watermarkFiles, "水印任务");

  const configured = Array.from(new Set(obfuscatedFiles.concat(watermarkFiles)));
  configured.forEach((relativePath) => {
    if (!relativePath.endsWith(".js")) fail(`深度保护仅支持 JS：${relativePath}`);
    else if (!fs.existsSync(path.join(root, relativePath))) fail(`加固文件不存在：${relativePath}`);
  });

  const missingRuntime = runtimeFiles().filter((file) => !obfuscatedFiles.includes(file));
  if (missingRuntime.length) fail(`运行时代码未纳入混淆：${missingRuntime.join("、")}`);
  else pass(`全部 ${runtimeFiles().length} 个运行时 JS 已纳入分级混淆`);

  const smallWatermarks = watermarkFiles.filter((file) => {
    const absolutePath = path.join(root, file);
    return fs.existsSync(absolutePath) && fs.statSync(absolutePath).size < 20000;
  });
  if (smallWatermarks.length) warn(`以下文件小于 20KiB，微信水印可能不生效：${smallWatermarks.join("、")}`);
  else pass(`水印文件均达到微信建议的 20KiB 最低体积`);

  const unsupported = [
    { label: "eval", pattern: /\beval\s*\(/ },
    { label: "with", pattern: /\bwith\s*\(/ },
    { label: "动态 Function", pattern: /(?:new\s+)?Function\s*\(/ },
    { label: "函数源码读取", pattern: /\.toString\s*\(\s*\)/ },
    { label: "函数名称反射", pattern: /Object\.getOwnPropertyDescriptor\s*\([^,]+,\s*["']name["']/ }
  ];
  configured.forEach((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) return;
    const source = fs.readFileSync(absolutePath, "utf8");
    unsupported.forEach(({ label, pattern }) => {
      if (pattern.test(source)) fail(`${relativePath} 使用深度保护不支持的 ${label} 语法`);
    });
  });
  if (!failures.some((message) => /不支持的/.test(message))) pass("未发现 eval、with、函数源码/名称反射等不兼容语法");
}

if (project) {
  const ignored = (((project.packOptions || {}).ignore) || []).map((entry) => entry.value);
  if (ignored.includes("code.fortify.config.json")) pass("加固配置不进入正式上传包");
  else fail("project.config.json 应忽略 code.fortify.config.json，避免占用包体");
  if (((project.setting || {}).uploadWithSourceMap) === true) pass("正式上传已保留加固 sourcemap");
  else fail("正式上传必须启用 uploadWithSourceMap");
  if (((project.setting || {}).minified) === true) pass("正式上传已启用代码压缩");
  else warn("正式上传尚未启用代码压缩");
}

const nodeParts = process.versions.node.split(".").map(Number);
if (nodeParts[0] > 17 || (nodeParts[0] === 17 && nodeParts[1] >= 5)) pass(`Node ${process.versions.node} 满足 CLI ≥17.5`);
else fail(`Node ${process.versions.node} 不满足 CLI ≥17.5`);

passes.forEach((message) => console.log(`ok ${message}`));
warnings.forEach((message) => console.log(`warn ${message}`));
failures.forEach((message) => console.error(`fail ${message}`));
console.log(`code fortify readiness: ${passes.length} passed, ${warnings.length} warnings, ${failures.length} failed`);
if (failures.length) process.exit(1);
