const { Game } = require("./js/game.js");

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

if (!isOpenDataSubContext()) new Game();
