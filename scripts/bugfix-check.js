// 验证当前版本的基础 UI 防线：滚动上界、重置入口、长文本截断
const { Game } = require("../js/game");

const g = new Game(); // node 下 ctx 为 null，render 直接 return，不会崩

// 1. 滚动上界 clamp
g.screen = "home";
g.state.character = { id: "scroll-audit" };
g.height = 667;
g.contentHeight = 2000;
// maxScroll = max(0, 2000 - (667 - 62)) = 1395
if (g.maxScroll() !== 1395) {
  throw new Error(`maxScroll 应为 1395，实际 ${g.maxScroll()}`);
}
g.scrollY = 9999;
g.clampScroll();
if (g.scrollY !== 1395) {
  throw new Error(`scrollY 应夹到 1395，实际 ${g.scrollY}`);
}
g.scrollY = -5;
g.clampScroll();
if (g.scrollY !== 0) {
  throw new Error(`scrollY 应夹到 0，实际 ${g.scrollY}`);
}
// 内容不足一屏时 maxScroll=0
g.contentHeight = 300;
if (g.maxScroll() !== 0) {
  throw new Error(`内容不足一屏时 maxScroll 应为 0，实际 ${g.maxScroll()}`);
}

// 2. 长文本截断 "…"
const calls = [];
const mockCtx = {
  fillStyle: "",
  font: "",
  textAlign: "",
  measureText: (s) => ({ width: s.length * 10 }), // 每字符 10px
  fillText: (s) => calls.push(s)
};
// maxWidth=50 → 每行 5 字符；100 字符 → 20 行；maxLines=3 → 只画 3 行，末行带 …
calls.length = 0;
g.wrapText(mockCtx, "a".repeat(100), 0, 0, 50, 12, 16, "#000", 3);
if (calls.length !== 3) {
  throw new Error(`截断时应画 3 行，实际 ${calls.length}`);
}
if (!calls[2].endsWith("…")) {
  throw new Error(`末行应以 … 结尾，实际 "${calls[2]}"`);
}
// 不超行时不加 …
calls.length = 0;
g.wrapText(mockCtx, "abc", 0, 0, 50, 12, 16, "#000", 3);
if (calls.length !== 1 || calls[0] !== "abc") {
  throw new Error(`短文本应原样画 1 行，实际 ${JSON.stringify(calls)}`);
}
// 刚好满行不加 …
calls.length = 0;
g.wrapText(mockCtx, "abcde", 0, 0, 50, 12, 16, "#000", 3);
if (calls.length !== 1 || calls[0] !== "abcde") {
  throw new Error(`刚好满行不应截断，实际 ${JSON.stringify(calls)}`);
}

// 3. 重置入口：resetGame 走 showModal 兜底 → doReset → screen='choose'
g.screen = "home";
g.scrollY = 123;
g.resetGame();
if (g.screen !== "choose") {
  throw new Error(`resetGame 后 screen 应为 choose，实际 ${g.screen}`);
}
if (g.scrollY !== 0) {
  throw new Error(`resetGame 后 scrollY 应为 0，实际 ${g.scrollY}`);
}
if (g.state.character !== null) {
  throw new Error("resetGame 后角色应被清空");
}

// 4. roundRect 的第六参数必须是数值圆角；漏传圆角会让真实 Canvas arcTo 收到字符串并中断渲染。
const source = require("fs").readFileSync(require("path").join(__dirname, "../js/game.js"), "utf8");
const malformedRoundRects = source.split("\n").filter((line) => /roundRect\(ctx,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*[^,]+,\s*["'`]/.test(line));
if (malformedRoundRects.length) {
  throw new Error(`roundRect 存在漏传圆角参数：${malformedRoundRects.join(" | ")}`);
}

console.log("bugfix check ok");
