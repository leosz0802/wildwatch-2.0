// 验证 Step 2 渲染循环 + 环境动画：注入假 raf 手动泵帧
const origRaf = global.requestAnimationFrame;
const origCaf = global.cancelAnimationFrame;

let lastCb = null;
let cancelCalled = false;
global.requestAnimationFrame = (cb) => { lastCb = cb; return 999; };
global.cancelAnimationFrame = () => { cancelCalled = true; };

const { Game } = require("../js/game");

// 1. 构造：raf 存在但 ctx 为 null（node 兜底）→ 不自动启动循环
const g = new Game();
if (g.raf === null) {
  throw new Error("存在全局 raf 时 g.raf 不应为 null");
}
if (g.anim.rafId !== 0) {
  throw new Error("ctx 为 null 时不应自动启动循环");
}

// 2. 手动启动
g.startLoop();
if (g.anim.rafId !== 999) {
  throw new Error(`startLoop 后 rafId 应为 999，实际 ${g.anim.rafId}`);
}
if (typeof lastCb !== "function") {
  throw new Error("startLoop 应已注册帧回调");
}

// 3. 泵帧推进 anim.t（首帧 lastTs=0 → dt=0，需多泵几帧）
let ts = 1000;
for (let i = 0; i < 20; i++) {
  ts += 40;
  lastCb(ts);
}
if (g.anim.t < 100) {
  throw new Error(`泵 20 帧后 anim.t 应显著推进，实际 ${g.anim.t}`);
}

// 4. displayStats 向角色值收敛（不一步到位）
g.state.character = { hunger: 80, thirst: 80, stamina: 80, health: 80 };
g.displayStats = { hunger: 10, thirst: 10, stamina: 10, health: 10 };
const before = g.displayStats.hunger;
for (let i = 0; i < 5; i++) {
  ts += 40;
  lastCb(ts);
}
if (g.displayStats.hunger <= before) {
  throw new Error(`displayStats.hunger 应向 80 收敛，起点 ${before}，实际 ${g.displayStats.hunger}`);
}
if (g.displayStats.hunger >= 80) {
  throw new Error(`displayStats.hunger 不应一步到位，实际 ${g.displayStats.hunger}`);
}

// 5. screenFade 随时间从 0 升到 1
g.screenChangedAt = g.anim.t;
if (g.screenFade() !== 0) {
  throw new Error("刚切屏时 screenFade 应为 0");
}
for (let i = 0; i < 10; i++) {
  ts += 40;
  lastCb(ts);
}
if (g.screenFade() < 0.9) {
  throw new Error(`300ms 后 screenFade 应接近 1，实际 ${g.screenFade()}`);
}

// 6. stopLoop 暂停并取消下一帧
cancelCalled = false;
g.stopLoop();
if (!g.anim.paused) {
  throw new Error("stopLoop 后应处于 paused");
}
if (!cancelCalled) {
  throw new Error("stopLoop 应调用 cancelAnimationFrame");
}
const tPaused = g.anim.t;
lastCb(ts + 1000); // paused → tick 立即 return
if (g.anim.t !== tPaused) {
  throw new Error("paused 后泵帧不应推进 anim.t");
}

// 7. 无 raf 环境（node 原生）不崩
delete global.requestAnimationFrame;
delete global.cancelAnimationFrame;
const g2 = new Game();
if (g2.raf !== null) {
  throw new Error("无全局 raf 时 g.raf 应为 null");
}
if (g2.anim.rafId !== 0) {
  throw new Error("无 raf 时不应启动循环");
}
g2.startLoop(); // no-op
if (g2.anim.rafId !== 0) {
  throw new Error("无 raf 时 startLoop 应为 no-op");
}

// 还原
global.requestAnimationFrame = origRaf;
global.cancelAnimationFrame = origCaf;

console.log("ambient loop check ok");
