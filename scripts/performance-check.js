const { Game } = require("../js/game");

const game = new Game();

game.screen = "home";
game.gesture = null;
if (game.targetFrameMs() < 70) {
  throw new Error(`home idle frame interval is too aggressive: ${game.targetFrameMs()}ms`);
}

game.gesture = { mapPan: true };
if (!game.isFastMapRender()) {
  throw new Error("map drag should enable fast map rendering");
}
if (game.targetFrameMs() > 55) {
  throw new Error(`map drag frame interval should stay responsive: ${game.targetFrameMs()}ms`);
}

game.gesture = null;
game.scrollY = 0;
if (!game.isVisible(420, 640)) {
  throw new Error("home map should be visible near the top of the page");
}
game.scrollY = 1220;
if (game.isVisible(420, 640)) {
  throw new Error("home map should be culled when far outside the viewport");
}

console.log("performance check ok");
