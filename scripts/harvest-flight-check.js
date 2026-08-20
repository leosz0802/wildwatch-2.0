const fs = require("fs");
const path = require("path");
const { Game } = require("../js/game");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const game = Object.create(Game.prototype);
game.width = 375;
game.height = 667;
game.mapViewport = { x: 16, y: 110, w: 343, h: 480 };
const started = game.startMapHarvestFlight(
  { id: "drop_1", type: "forestGift", amount: 2 },
  { short: "赠礼", color: "#8b72b8" },
  { x: 112, y: 318 }
);
const start = game.mapHarvestFlightFrame(started.startedAt, started);
const middle = game.mapHarvestFlightFrame(started.startedAt + started.duration / 2, started);
const impact = game.mapHarvestFlightFrame(started.startedAt + started.duration + 80, started);
const ended = game.mapHarvestFlightFrame(started.startedAt + started.duration + started.impactDuration + 1, started);

assert(start.x === 112 && start.y === 318, "harvest flight did not start at the tapped map resource");
assert(middle.x > start.x && middle.y < impact.y, "harvest flight does not follow a visible upward arc");
assert(impact.x === game.width * .875, "harvest flight does not land on the material navigation item");
assert(impact.y === game.height - game.navHeight() + 19, "harvest flight vertical target is not the material navigation icon");
assert(impact.impact > 0 && impact.scale > 1, "material navigation landing pulse is missing");
assert(ended === null, "harvest flight did not terminate after its bounded impact window");

const source = fs.readFileSync(path.resolve(__dirname, "../js/game.js"), "utf8");
assert(/collectAnimalEcologyDrop\(drop\.id,\s*\{/.test(source), "map drop click does not pass its visual origin into the flight");
assert(source.indexOf("this.drawBottomNav();") < source.indexOf("this.drawMapHarvestFlight();"), "harvest flight is not layered above the bottom navigation");
assert(/this\.mapHarvestFlight = null;/.test(source), "harvest flight has no reset/cleanup state");

console.log("harvest flight check ok (map origin → curved flight → material nav impact → bounded cleanup)");
