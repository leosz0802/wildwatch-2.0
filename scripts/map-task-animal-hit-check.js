"use strict";

const assert = require("node:assert/strict");
const { Game } = require("../js/game");

// The animated event graphic is kept outside hitAreas.  It must still win
// when an animal's visual hit circle happens to sit beside the prompt.
const game = Object.create(Game.prototype);
let selected = "";
const eventHit = {
  x: 96, y: 96, w: 84, h: 72,
  map: true,
  taskMarker: true,
  onTap: () => { selected = "event"; }
};
const animalHit = {
  x: 84, y: 84, w: 108, h: 108,
  map: true,
  animal: true,
  onTap: () => { selected = "animal"; }
};
game.anim = { paused: true };
game.startLoop = () => {};
game.tryEnterPlayableGame = () => false;
game.interstitialAds = null;
game.adTouchGuardUntil = 0;
game.screen = "home";
game.chapterStoryModal = null;
game.infoDetailModal = null;
game.patrolTaskModal = null;
game.state = { character: {} };
game.height = 640;
game.width = 360;
game.navHeight = () => 64;
game.bottomNavHitAt = () => null;
game.blockingOverlayOpen = () => false;
game.eventBalloonHitAt = () => eventHit;
game.hitAreaAt = () => animalHit;
game.activateHitArea = (hit) => hit.onTap();
game.handleTap(120, 120);
assert.equal(selected, "event", "active task prompt must win over a nearby animal");

console.log("map task/animal hit check ok");
