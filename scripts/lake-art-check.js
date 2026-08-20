// 验证 drawLakePatch 不崩、无湖泊时 no-op（用 mock ctx）
const { Game } = require("../js/game");

const noop = () => {};
const grad = { addColorStop: noop };
const mockCtx = new Proxy({}, {
  get: (t, prop) => {
    if (prop === "createRadialGradient" || prop === "createLinearGradient") return () => grad;
    return noop;
  },
  set: () => true
});

const g = new Game(); // node 下 ctx 为 null
const fakeCamera = { x: 0, y: 0, w: 343, h: 343, worldX: 0, worldY: 0, worldSize: 343, scale: 1.18, cx: 0.5, cy: 0.5 };

// 1. 有湖泊时绘制不崩
g.drawLakePatch(mockCtx, fakeCamera);

// 2. 无湖泊时 no-op
const saved = g.state.world.regions;
g.state.world.regions = saved.filter((r) => r.id !== "lake");
g.drawLakePatch(mockCtx, fakeCamera); // 应直接 return
g.state.world.regions = saved;

// 3. 不同缩放下不崩
[1.18, 1.72, 2.45].forEach((scale) => {
  g.drawLakePatch(mockCtx, Object.assign({}, fakeCamera, { scale }));
});

// 4. mapPoint 返回 NaN 时（极端相机）也不崩
g.drawLakePatch(mockCtx, { worldX: NaN, worldY: NaN, worldSize: NaN, scale: NaN, cx: NaN, cy: NaN });

console.log("lake art check ok");
