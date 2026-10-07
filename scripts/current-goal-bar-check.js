const assert = require("node:assert/strict");
const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");

const game = Object.create(Game.prototype);
game.state = createCharacter(null, "目标测试");
game.currentGoalView = Game.prototype.currentGoalView;
game.sandboxPrimaryGuidance = Game.prototype.sandboxPrimaryGuidance;

const goal = Game.prototype.sandboxGoalBarData.call(game);
assert.equal(goal.chapter, 1);
assert(goal.title && goal.progressText && goal.action, "goal bar must expose the three player-facing layers");
game.truncateTextToWidth = (_ctx, text) => text;
game.roundRect = () => {};
game.text = () => {};
game.addMapRectHit = () => {};
game.drawSandboxGoalBar({}, { x: 0, y: 100, w: 320, h: 640 });
assert.equal(game.renderedSandboxGoalBar.y, 162, "goal bar should sit directly below the upper information dock");
assert.equal(game.renderedSandboxGoalBar.x, 0, "goal bar should use the full map width");
assert.equal(game.renderedSandboxGoalBar.w, 320, "goal bar should span the complete map width");
assert.equal(game.renderedSandboxGoalBar.h, 52, "goal bar should keep a compact single information-row height");
assert.equal(game.renderedSandboxGoalBar.interaction, "full-card", "current goal must expose a full-card interaction");
assert(game.hitAreas.some((hit) => hit.w >= 320 && hit.h >= 52), "current goal card must register a tappable full-card hit area");
const goalHit = game.hitAreas.find((hit) => hit.goalEntry);
assert(goalHit, "current goal card must be marked as the task entry");
assert.equal(Game.prototype.isPressImmediateHudHit.call(game, goalHit), true, "the task entry must respond when the finger goes down");
game.state.world.reserve.emergency.active = { id: "fire-1", type: "wildfire", recommendedAction: "habitat" };
const crisisGoal = Game.prototype.sandboxGoalBarData.call(game);
assert(crisisGoal.title.includes("危机") && !crisisGoal.guidance, "an active crisis must outrank onboarding guidance");

const chip = Object.create(Game.prototype);
chip.state = game.state;
chip.drawUiIcon = () => true;
chip.drawSmallGlyph = () => {};
chip.roundRect = () => {};
chip.text = () => {};
chip.addMapRectHit = () => {};
chip.animT = () => 0;
chip.displayReserveNumber = (_kind, value) => value;
chip.numberAnimationPulse = () => 0;
chip.allIncomingLetters = Game.prototype.allIncomingLetters.bind(chip);

const camera = { x: 0, y: 0, w: 320, h: 640 };
Game.prototype.drawMapVisitorCountChip.call(chip, {}, camera, [], 1);
assert.equal(chip.renderedMapVisitorCountChip.visible, false, "visitor and letter chips should be hidden without a fresh change");

chip.state.world.reserve.development.operations.today = {
  day: 1,
  visitors: 3,
  recruitedVisitors: 0
};
Game.prototype.drawMapVisitorCountChip.call(chip, {}, camera, [], 1);
assert.equal(chip.renderedMapVisitorCountChip.visible, false, "visitor-only changes should not surface a map notice");
chip.addMapRectHit = () => {};
chip.drawSmallGlyph = () => {};
Game.prototype.drawSandboxOpportunityAggregate.call(chip, {}, camera, { aggregateVisible: true, hidden: [{ key: "hint-1" }, { key: "hint-2" }] });
assert.equal(chip.renderedMapOpportunityAggregate.visible, true, "clues should remain available when there is no inbox notice");

console.log("current goal bar check ok");
