const { Game, formatDisplayNumber, normalizeDisplayNumericText } = require("../js/game");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(formatDisplayNumber(71.75453711904763) === "71.8", "grass values must round to one decimal place");
assert(formatDisplayNumber(69.75453711904763) === "69.8", "after values must round to one decimal place");
assert(formatDisplayNumber(71) === "71", "whole values must not gain a trailing decimal");
assert(formatDisplayNumber(-1.25) === "-1.3", "negative values must use half-up rounding");
assert(formatDisplayNumber(0.04) === "0", "values below the display precision must round to zero");
assert(formatDisplayNumber("not-a-number") === "not-a-number", "non-numeric labels must remain unchanged");
assert(normalizeDisplayNumericText("水源 67.61351893939394 · 草场 58.40535106060606") === "水源 67.6 · 草场 58.4", "raw ecology values must be rounded before rendering");
assert(normalizeDisplayNumericText("安全 27.000/100.000 · 游客 47.25%") === "安全 27/100 · 游客 47.3%", "fractions, percentages and signed display values must use one decimal maximum");

const rendered = [];
const game = Object.create(Game.prototype);
game.normalizeTypeSize = (value) => Number(value) || 8;
game.toyPaletteColor = (value) => value;
game.text({
  fillText(value) { rendered.push(String(value)); },
  set fillStyle(_) {},
  set font(_) {},
  set textAlign(_) {},
  set textBaseline(_) {}
}, "草场 58.40535106060606", 0, 0, 12, "#000");
assert(rendered[0] === "草场 58.4", "canvas text boundary must normalize legacy raw interpolations");

console.log("metric number format check ok");
