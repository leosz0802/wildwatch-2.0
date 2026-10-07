const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { Game } = require("../js/game");
const { supplyPurchaseCatalog } = require("../js/actions");

const ROOT = path.resolve(__dirname, "..");
const legacyLabels = [
  "\u9e7f\u89d2",
  "\u9ebb\u9189\u5f39",
  "\u8bc1\u636e\u9677\u9631",
  "\u9677\u9631\u8bc1\u636e",
  "\u9ebb\u9189\u8f6c\u79fb"
];
const scannedExtensions = new Set([".js", ".md", ".json"]);

function collectFiles(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(absolute, result);
    else if (scannedExtensions.has(path.extname(entry.name))) result.push(absolute);
  }
  return result;
}

const staleFiles = collectFiles(ROOT).filter((file) => {
  const source = fs.readFileSync(file, "utf8");
  return legacyLabels.some((label) => source.includes(label));
});
assert.deepStrictEqual(staleFiles, [], "legacy sensitive material labels remain in source or documentation");

const supplyLabels = Object.fromEntries(supplyPurchaseCatalog().map((item) => [item.id, item.label]));
assert.strictEqual(supplyLabels.tranquilizer, "阻滞弹", "tranquilizer display label should be 阻滞弹");
assert.strictEqual(supplyLabels.evidenceTrap, "诱迹机关", "evidenceTrap display label should be 诱迹机关");

for (const icon of ["tranquilizer", "evidenceTrap", "recoveredTrap"]) {
  const file = path.join(ROOT, "assets", "art", "ui-v3", "icons", `${icon}.png`);
  assert(fs.existsSync(file), `${icon} icon asset should exist`);
  assert(fs.statSync(file).size > 100, `${icon} icon asset should not be empty`);
}

const game = Object.create(Game.prototype);
game.state = {
  world: {
    reserve: {
      inventory: { shedAntlerA: 1, shedAntlerB: 2 },
      pendingRecovered: {},
      market: { antler: 86, hideSalvage: 124, researchSample: 42 },
      progression: { level: 1 },
      base: { rating: 1100 },
      fund: 1000
    }
  }
};

const aGrade = game.buildMaterialDetail("goods", "shedAntlerA");
const bGrade = game.buildMaterialDetail("goods", "shedAntlerB");
assert(aGrade && aGrade.title.startsWith("A级岩角"), "A-grade material detail uses the current label");
assert(bGrade && bGrade.title.startsWith("B级岩角"), "B-grade material detail uses the current label");

const recovered = game.buildMaterialDetail("goods", "recoveredTrap");
assert(recovered && recovered.title.startsWith("隐踪器"), "recovered material detail uses the new label");

console.log("material label compliance check ok");
