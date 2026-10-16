const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, "..");
const gameSource = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
const simulatorSource = fs.readFileSync(path.join(root, "js/simulator.js"), "utf8");
const emotionSource = fs.readFileSync(path.join(root, "js/emotionSystem.js"), "utf8");
const allSource = `${gameSource}\n${simulatorSource}\n${emotionSource}`;

[
  "这不是临时加成",
  "复杂系统会在后续",
  "系统自动归档 · 无需输入",
  "内容随巡护结果更新，不保存玩家输入",
  "玩家亲手掷骰",
  "补给不是装饰",
  "这些不是任务日志",
  "线索会把后台生态变化翻译",
  "迁移是动物对保护区的投票",
  "不会顺手买齐其他补给",
  "所有变化已写入同一保护区存档"
].forEach((phrase) => assert(!allSource.includes(phrase), `meta copy returned: ${phrase}`));

[
  "确认后生效",
  "库存决定可执行的巡护。",
  "探索 → 收取 → 移交",
  "安全感决定停留，野性决定独立。"
].forEach((phrase) => assert(gameSource.includes(phrase), `missing concise action copy: ${phrase}`));

const { GUARDIAN_PROMISES } = require("../js/guardianPromises");
GUARDIAN_PROMISES.forEach((promise) => {
  assert(promise.story.length <= 28, `${promise.id} dilemma introduction is too long: ${promise.story}`);
});

assert(/沿旧路回来了/.test(emotionSource), "return should remain a personal story");
assert(/离开，是守护成功/.test(emotionSource), "independence should retain emotional meaning");

console.log("concise copy check ok (direct status, cost and action copy; narrative dialogue preserved)");
