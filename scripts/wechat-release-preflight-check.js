const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const project = JSON.parse(fs.readFileSync(path.join(root, "project.config.json"), "utf8"));
const privateProjectPath = path.join(root, "project.private.config.json");
const privateProject = fs.existsSync(privateProjectPath) ? JSON.parse(fs.readFileSync(privateProjectPath, "utf8")) : null;
const gameConfig = JSON.parse(fs.readFileSync(path.join(root, "game.json"), "utf8"));
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

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const ignoredEntries = (((project.packOptions || {}).ignore) || []).map((entry) => String(entry.value || "").replace(/\/$/, ""));
const subpackageRoots = (gameConfig.subpackages || []).map((entry) => String(entry.root || "").replace(/\/$/, "")).filter(Boolean);

function isIgnored(relativePath) {
  // Git metadata lives beside the game during development, but never belongs
  // to the WeChat upload package or release-size calculation.
  if (relativePath === ".git" || relativePath.startsWith(".git/")) return true;
  return ignoredEntries.some((entry) => relativePath === entry || relativePath.startsWith(`${entry}/`));
}

function packageSize(relativeDirectory = ".", mainOnly = false) {
  let total = 0;
  const absoluteDirectory = path.join(root, relativeDirectory);
  fs.readdirSync(absoluteDirectory, { withFileTypes: true }).forEach((entry) => {
    const relativePath = relativeDirectory === "." ? entry.name : `${relativeDirectory}/${entry.name}`;
    if (isIgnored(relativePath)) return;
    if (mainOnly && subpackageRoots.some((subpackageRoot) => relativePath === subpackageRoot || relativePath.startsWith(`${subpackageRoot}/`))) return;
    const absolutePath = path.join(root, relativePath);
    if (entry.isDirectory()) total += packageSize(relativePath, mainOnly);
    else total += fs.statSync(absolutePath).size;
  });
  return total;
}

function runtimeText() {
  return [path.join(root, "game.js")]
    .concat(walk(path.join(root, "js")).filter((file) => file.endsWith(".js")))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
}

if (project.compileType === "game") pass("项目类型为微信小游戏");
else fail(`compileType 应为 game，当前为 ${project.compileType}`);

if (/^wx[a-z0-9]{16}$/i.test(String(project.appid || ""))) pass("AppID 格式有效");
else fail("缺少有效的微信小游戏 AppID");

if (/^\d+\.\d+\.\d+$/.test(String(project.libVersion || ""))) pass(`基础库版本已固定为 ${project.libVersion}`);
else warn("基础库版本没有使用明确的三段式版本号");

if (!privateProject || !privateProject.libVersion || privateProject.libVersion === project.libVersion) pass("本机私有配置没有覆盖为其他基础库版本");
else fail(`本机私有配置将基础库覆盖为 ${privateProject.libVersion}，应与项目配置 ${project.libVersion} 一致`);

subpackageRoots.forEach((subpackageRoot) => {
  if (fs.existsSync(path.join(root, subpackageRoot))) pass(`分包目录存在：${subpackageRoot}`);
  else fail(`分包目录不存在：${subpackageRoot}`);
});

const openDataRoot = String(gameConfig.openDataContext || "").replace(/\/$/, "");
const openDataEntry = openDataRoot ? path.join(root, openDataRoot, "index.js") : "";
if (openDataRoot && fs.existsSync(openDataEntry)) pass(`微信开放数据域已配置：${openDataRoot}`);
else fail("缺少微信好友榜开放数据域配置或 index.js");

const mainBytes = packageSize(".", true);
const subpackageBytes = subpackageRoots.reduce((sum, subpackageRoot) => sum + packageSize(subpackageRoot, false), 0);
const totalBytes = mainBytes + subpackageBytes;
const mib = (bytes) => (bytes / 1024 / 1024).toFixed(3);

if (mainBytes <= 4 * 1024 * 1024) pass(`主包 ${mib(mainBytes)} MiB（官方上限 4 MiB）`);
else fail(`主包 ${mib(mainBytes)} MiB 超过官方 4 MiB 上限`);

if (totalBytes <= 20 * 1024 * 1024) pass(`总包 ${mib(totalBytes)} MiB（官方上限 20 MiB）`);
else fail(`总包 ${mib(totalBytes)} MiB 超过官方 20 MiB 上限`);

if (totalBytes < 4 * 1024 * 1024) pass(`总包低于项目自设 4 MiB 门槛：${mib(totalBytes)} MiB`);
else warn(`总包未满足项目自设 4 MiB 门槛：${mib(totalBytes)} MiB`);

const code = runtimeText();
const inputApis = /(?:showKeyboard|onKeyboardInput|onKeyboardConfirm|offKeyboardInput|chooseImage|chooseMedia|chooseMessageFile|getClipboardData)/;
const nonFriendPrivacyApis = /(?:getUserProfile|getUserInfo|getPhoneNumber|getLocation|chooseLocation|startRecord)/;
const relationFriendApi = /\.getRelationFriendList\s*\(/.test(code);
const relationFriendAuthorization = /scope\s*:\s*["']scope\.interactedUserInfo["']/.test(code);
const obsoleteFriendAuthorization = /scope\s*:\s*["']scope\.WxFriendInteraction["']/.test(code);
const paymentOrAdApis = /(?:requestPayment|createRewardedVideoAd|createBannerAd|createInterstitialAd|createCustomAd)/;

if (!inputApis.test(code) && /editable:\s*true/.test(code)) pass("生产代码没有公开UGC入口；仅保留本地整数采购数量输入");
else if (!inputApis.test(code)) pass("生产代码没有玩家文本/媒体录入入口");
else fail("生产代码仍包含玩家输入或媒体选择接口，需补充内容安全与隐私链路");

if (!nonFriendPrivacyApis.test(code) && !relationFriendApi && !relationFriendAuthorization && !obsoleteFriendAuthorization) pass("好友榜仅使用开放数据域，不额外请求同玩互动好友资料");
else if (!nonFriendPrivacyApis.test(code) && relationFriendApi && relationFriendAuthorization && !obsoleteFriendAuthorization) pass("同玩互动好友接口使用 scope.interactedUserInfo，并与好友榜能力分离");
else if (!nonFriendPrivacyApis.test(code)) fail("同玩互动好友授权配置不匹配：getRelationFriendList 必须对应 scope.interactedUserInfo，且不得使用 scope.WxFriendInteraction");
else warn("检测到其他敏感隐私接口，须确认隐私保护指引、用途声明和授权时机");

const openDataCode = openDataEntry && fs.existsSync(openDataEntry) ? fs.readFileSync(openDataEntry, "utf8") : "";
if (/getFriendCloudStorage/.test(openDataCode) && !/getFriendCloudStorage/.test(code)) pass("好友云数据只在开放数据域读取，主域不会取得完整好友列表");
else fail("好友云数据读取边界错误：getFriendCloudStorage 必须且只能位于开放数据域");
if (/setUserCloudStorage/.test(code) && /wild_guardian_rank_v1/.test(code)) pass("本保护区排行数据已写入微信托管 KV 数据");
else fail("好友榜缺少本玩家排行数据上传链路");

if (!paymentOrAdApis.test(code)) pass("生产代码未接入支付或广告接口");
else warn("检测到支付或广告接口，须补齐对应类目、协议和审核材料");

if (/showShareMenu/.test(code) && /onShareAppMessage/.test(code)) pass("原生分享菜单与分享回调均已配置");
else warn("分享菜单或分享回调配置不完整");

const remoteDefault = code.match(/remote:\s*\{[\s\S]*?url:\s*"([^"]*)"/);
if (!remoteDefault || remoteDefault[1] === "") pass("默认版本不加载远程动态美术内容");
else warn(`检测到默认远程美术地址：${remoteDefault[1]}，须配置下载域名并纳入内容审核`);

const secretPatterns = [
  /(?:^|[^A-Za-z0-9_-])sk-[A-Za-z0-9]{24,}/,
  /access_token\s*[:=]\s*["'][A-Za-z0-9._-]{20,}["']/i,
  /(?:api[_-]?secret|client[_-]?secret|app[_-]?secret)\s*[:=]\s*["'][A-Za-z0-9_-]{24,}["']/i
];
const packageTextFiles = walk(root).filter((file) => {
  const relativePath = path.relative(root, file).replace(/\\/g, "/");
  return !isIgnored(relativePath) && /\.(?:js|json|md|txt|wxml|wxss)$/i.test(file);
});
const leaked = packageTextFiles.some((file) => {
  const text = fs.readFileSync(file, "utf8");
  return secretPatterns.some((pattern) => pattern.test(text));
});
if (!leaked) pass("上传包未发现常见密钥或 access_token 泄露");
else fail("上传包疑似包含密钥或 access_token");

if ((project.setting || {}).minified) pass("上传构建已启用代码压缩");
else warn("project.config.json 未启用 minified；不阻断审核，但正式上传建议启用并复测");

const fortifyConfigPath = path.join(root, "code.fortify.config.json");
if (fs.existsSync(fortifyConfigPath)) {
  try {
    const fortifyConfig = JSON.parse(fs.readFileSync(fortifyConfigPath, "utf8"));
    const tasks = (((fortifyConfig.obfuscation || {}).tasks) || []);
    const files = tasks.flatMap((task) => task.files || []);
    if (tasks.length && files.length) pass(`微信游戏深度保护已配置：${files.length} 个 JS 文件`);
    else fail("code.fortify.config.json 没有有效的代码混淆任务");
  } catch (error) {
    fail(`code.fortify.config.json 无法解析：${error.message}`);
  }
} else {
  fail("缺少微信游戏深度保护配置 code.fortify.config.json");
}

if (ignoredEntries.includes("code.fortify.config.json")) pass("深度保护配置已从正式上传包排除");
else fail("深度保护配置应加入 packOptions.ignore");

if ((project.setting || {}).urlCheck) pass("开发者工具已启用合法域名校验");
else warn("开发者工具 urlCheck=false；当前无默认网络请求，但上线前若启用远程资源必须开启并配置域名");

passes.forEach((message) => console.log(`ok ${message}`));
warnings.forEach((message) => console.log(`warn ${message}`));
failures.forEach((message) => console.error(`fail ${message}`));
console.log(`wechat release preflight: ${passes.length} passed, ${warnings.length} warnings, ${failures.length} failed`);
if (failures.length) process.exit(1);
