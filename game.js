function isOpenDataSubContext() {
  try {
    if (typeof GameGlobal !== "undefined" && (GameGlobal.__isSubContext || GameGlobal.isSubContext)) return true;
  } catch (error) {}
  try {
    if (typeof wx !== "undefined"
      && typeof wx.onMessage === "function"
      && typeof wx.getOpenDataContext !== "function") return true;
  } catch (error) {}
  return false;
}

let gameBooted = false;

function bootGame() {
  if (gameBooted || isOpenDataSubContext()) return;
  try {
    const loaded = require("./js/game.js");
    const Game = loaded && loaded.Game;
    if (typeof Game !== "function") throw new Error("game module did not export Game");
    gameBooted = true;
    new Game();
  } catch (error) {
    if (typeof console !== "undefined" && console.error) console.error("game boot failed", error);
  }
}

function startMainGame() {
  const runtime = typeof wx !== "undefined" ? wx : null;
  if (runtime && typeof runtime.loadSubpackage === "function") {
    try {
      runtime.loadSubpackage({ name: "archive-art", success() {}, fail() {} });
      runtime.loadSubpackage({ name: "audio-pack", success() {}, fail() {} });
    } catch (error) {}
    try {
      runtime.loadSubpackage({
        name: "archive-logic",
        success: bootGame,
        fail: bootGame
      });
    } catch (error) {
      bootGame();
    }
    return;
  }
  bootGame();
}

if (!isOpenDataSubContext()) startMainGame();
