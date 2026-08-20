const { Game } = require("../js/game");
const { createCharacter } = require("../js/storage");
const { getUnlockedSpecies } = require("../js/animalWorld");

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function assertInside(position, label) {
  if (position.x < 0.04 || position.x > 0.96 || position.y < 0.06 || position.y > 0.92) {
    throw new Error(`${label} moved outside map bounds`);
  }
}

function assertGroundedMetrics(game, animal, motion, label) {
  const closeMetrics = game.groundedAnimalRenderMetrics(animal, motion, 320, 0.68, 1.88, true, false);
  const hitTop = closeMetrics.hitY - closeMetrics.hitSize / 2;
  const hitBottom = closeMetrics.hitY + closeMetrics.hitSize / 2;
  if (hitTop > closeMetrics.bodyY || hitBottom < closeMetrics.bodyY || hitTop > closeMetrics.groundY || hitBottom < closeMetrics.groundY) {
    throw new Error(`${label} hit area should cover body and ground`);
  }
  if (closeMetrics.kind !== "air" && Math.abs(closeMetrics.bodyLift) > 1.2) {
    throw new Error(`${label} non-air body lift is too large`);
  }
  if (closeMetrics.kind === "air" && closeMetrics.flight <= 8) {
    throw new Error(`${label} air animal should use shadow/flight separation`);
  }
}

const game = new Game();
game.state = createCharacter(null, "保护区卫士");
game.screen = "home";
game.animalMotionStates = {};
game.settlementModal = null;
game.patrolTaskModal = null;
game.infoDetailModal = null;
game.gesture = null;
game.anim = { t: 0 };

const allSpecies = getUnlockedSpecies(5).map((species) => species.name);
const atlasIndices = allSpecies.map((species) => game.animalMapSpriteIndex(species));
if (atlasIndices.some((index) => index < 0) || new Set(atlasIndices).size !== 21 || Math.max(...atlasIndices) !== 20) {
  throw new Error(`all 21 unlocked species must have unique full-body map sprites: ${atlasIndices.join(",")}`);
}
if (game.animalMapSpriteIndex("兔子") !== game.animalMapSpriteIndex("野兔")) {
  throw new Error("legacy rabbit alias should resolve to the wild-hare sprite");
}
// This list is deliberately independent from animalSpriteFacesRight(). It
// records the actual native orientation in animal-map-sprites-atlas-v1.png,
// so the regression catches a wrong metadata table instead of merely proving
// that the mirror function agrees with itself.
const expectedNativeRight = new Set(["鹿", "羚羊", "乌鸦", "斑马", "野猪", "秃鹫", "水貂"]);
allSpecies.forEach((species) => {
  const nativeRight = game.animalSpriteFacesRight(species);
  if (nativeRight !== expectedNativeRight.has(species)) {
    throw new Error(`${species} native atlas direction metadata is incorrect`);
  }
  const rightMirror = game.animalSpriteMirrorForMotion(species, 0.01);
  const leftMirror = game.animalSpriteMirrorForMotion(species, -0.01);
  const renderedRight = rightMirror ? !nativeRight : nativeRight;
  const renderedLeft = leftMirror ? !nativeRight : nativeRight;
  if (!renderedRight || renderedLeft) {
    throw new Error(`${species} sprite should face its horizontal travel direction`);
  }
});

// Render every species in both directions and verify the canvas transform only
// mirrors the X axis. A negative Y scale would turn an animal upside down.
game.art = Object.assign({}, game.art || {}, { animalMapSprites: { loaded: true } });
allSpecies.forEach((species) => {
  [-1, 1].forEach((facingX) => {
    const scales = [];
    const drawCtx = {
      save() {},
      restore() {},
      translate() {},
      scale(x, y) { scales.push({ x, y }); },
      drawImage() {}
    };
    const drawn = game.drawAnimalSticker(drawCtx, 80, 80, { species }, 1, 1, false, { facingX });
    if (!drawn || scales.length !== 1 || scales[0].y !== 1) {
      throw new Error(`${species} must render upright with horizontal-only mirroring`);
    }
    const renderedRight = expectedNativeRight.has(species) !== (scales[0].x < 0);
    if (renderedRight !== (facingX > 0)) {
      throw new Error(`${species} rendered body direction does not match travel direction`);
    }
  });
});

const animals = game.visibleSandAnimals(game.state.world);
if (!animals.length) throw new Error("no animals available for motion check");

// Run every atlas species through several seconds of real map motion. This
// catches direction regressions in species that are not currently unlocked in
// the test save and guards both walking and flying/water movement profiles.
allSpecies.forEach((species, speciesIndex) => {
  const movingAnimal = { id: `direction_${speciesIndex}`, species, name: species };
  const anchor = game.animalMapPosition(movingAnimal, speciesIndex);
  game.anim.t = 0;
  game.movingAnimalPosition(movingAnimal, speciesIndex, anchor);
  let movedFrames = 0;
  for (let frame = 1; frame <= 90; frame += 1) {
    game.anim.t = frame * 100;
    const motion = game.movingAnimalPosition(movingAnimal, speciesIndex, anchor);
    assertInside(motion, `${species} direction simulation`);
    if (Math.abs(motion.dirX) >= 0.00001) {
      movedFrames += 1;
      if (Math.sign(motion.facingX) !== Math.sign(motion.dirX)) {
        throw new Error(`${species} walked backwards during frame ${frame}`);
      }
    }
  }
  if (!movedFrames) throw new Error(`${species} did not produce any horizontal motion`);
});

// Force a dense mixed-species crossing and verify the render-time separation
// keeps every visible body in its own lane throughout the motion.
const collisionSpecies = ["大象", "长颈鹿", "熊", "鹿", "斑马", "狼", "野犬", "野兔"];
const collisionAnimals = collisionSpecies.map((species, index) => ({
  id: `collision_${index}`,
  species,
  name: species
}));
[[320, 568], [375, 667], [430, 932]].forEach(([width, height]) => {
  collisionAnimals.forEach((animal, index) => delete game.animalMotionStates[game.animalMotionKey(animal, index)]);
  const collisionCamera = game.mapCameraInfo(0, 0, width, height);
  for (let frame = 0; frame <= 120; frame += 1) {
    game.anim.t = frame * 100;
    const placements = collisionAnimals.map((animal, index) => {
      const base = { x: 0.50 + (index % 2) * 0.002, y: 0.50 + (index % 3) * 0.002 };
      return { animal, motion: game.movingAnimalPosition(animal, index, base), groupCount: index < 2 ? 3 : 1 };
    });
    game.resolveAnimalMotionOverlaps(placements, collisionCamera);
    const overlapCount = game.animalPlacementOverlapCount(placements, collisionCamera);
    if (overlapCount) throw new Error(`${width}x${height} animal collision resolver left ${overlapCount} overlaps on frame ${frame}`);
    placements.forEach((placement, index) => {
      const state = game.animalMotionStates[game.animalMotionKey(placement.animal, index)];
      if (placement.motion.kind !== "air" && state && placement.motion.facingX !== state.facingX) {
        throw new Error(`${width}x${height} collision separation must update the rendered facing in the same frame`);
      }
    });
  }
});

// Persistent facilities are fixed visual obstacles. A moving herd can pass
// nearby, but may not cover the building or its clickable name plate.
[[320, 568], [375, 667], [430, 932]].forEach(([width, height]) => {
  const collisionCamera = game.mapCameraInfo(0, 0, width, height);
  const facility = { id: "motion_test_station", x: .52, y: .47 };
  const placements = collisionAnimals.slice(0, 4).map((animal, index) => {
    const key = game.animalMotionKey(animal, index);
    game.animalMotionStates[key] = {
      key, seed: index + 1, step: 1, x: facility.x, y: facility.y,
      targetX: facility.x, targetY: facility.y, facingX: 1, dirX: 0, dirY: 0
    };
    return {
      animal,
      groupCount: index === 0 ? 3 : 1,
      motion: { key, x: facility.x, y: facility.y, facingX: 1, kind: "ground" }
    };
  });
  game.resolveAnimalMotionOverlaps(placements, collisionCamera);
  game.resolveAnimalFacilityOverlaps(placements, collisionCamera, [facility]);
  if (game.animalFacilityOverlapCount(placements, collisionCamera, [facility])) {
    throw new Error(`${width}x${height} animals must not cover a facility or its label`);
  }
  placements.forEach((placement, index) => {
    const state = game.animalMotionStates[game.animalMotionKey(placement.animal, index)];
    if (state && placement.motion.kind !== "air" && state.facingX !== placement.motion.facingX) {
      throw new Error(`${width}x${height} facility avoidance must preserve rendered facing`);
    }
  });
});

// A multi-animal group near a panned viewport edge must reflow inward instead
// of drawing a companion half outside the visible sandbox.
[[320, 568], [375, 667], [430, 932]].forEach(([width, height]) => {
  const camera = { x: 0, y: 0, w: width, h: height, scale: 1 };
  const bodySize = 32;
  const gap = 28;
  const leftOffsets = game.animalGroupRenderOffsets(8, 3, gap, bodySize, 1, camera);
  const rightOffsets = game.animalGroupRenderOffsets(width - 8, 3, gap, bodySize, 1, camera);
  if (leftOffsets.some((offset) => 8 + offset.x - bodySize * .34 < 0)) {
    throw new Error(`${width}x${height} left-edge animal group should reflow inward`);
  }
  if (rightOffsets.some((offset) => width - 8 + offset.x + bodySize * .34 > width)) {
    throw new Error(`${width}x${height} right-edge animal group should reflow inward`);
  }
});

const deer = animals.find((animal) => animal.species === "鹿") || animals[0];
const base = game.animalMapPosition(deer, 0);
game.anim.t = 0;
const first = game.movingAnimalPosition(deer, 0, base);
assertInside(first, "initial animal");
const deerState = game.animalMotionStates[game.animalMotionKey(deer, 0)];
const targetDirection = Math.sign(deerState.targetX - deerState.x);
if (targetDirection && Math.sign(first.facingX) !== targetDirection) {
  throw new Error("animal should turn toward a newly selected destination before walking");
}

game.anim.t = 1200;
const second = game.movingAnimalPosition(deer, 0, base);
assertInside(second, "moving animal");
if (distance(first, second) < 0.0005) {
  throw new Error("animal should move after animation tick");
}
if (Math.abs(second.dirX) >= 0.00001 && Math.sign(second.facingX) !== Math.sign(second.dirX)) {
  throw new Error("walking animal should face its actual frame direction");
}
assertGroundedMetrics(game, deer, second, "deer");

// A waiting animal must not keep the previous movement vector and slide in
// place. Facing remains stable while the step vector is reset to zero.
deerState.wait = 1;
deerState.dirX = -0.01;
deerState.facingX = -1;
game.anim.t = 1500;
const waiting = game.movingAnimalPosition(deer, 0, base);
if (waiting.dirX !== 0 || waiting.dirY !== 0 || waiting.facingX !== -1) {
  throw new Error("waiting animal should stop without losing its stable facing");
}

game.infoDetailModal = { title: "pause" };
game.anim.t = 1800;
const pausedA = game.movingAnimalPosition(deer, 0, base);
game.anim.t = 2400;
const pausedB = game.movingAnimalPosition(deer, 0, base);
if (distance(pausedA, pausedB) > 0.00001) {
  throw new Error("animal motion should pause while modal is open");
}
game.infoDetailModal = null;

game.gesture = { mapPan: true };
game.anim.t = 3000;
const panA = game.movingAnimalPosition(deer, 0, base, { fast: true });
game.anim.t = 3600;
const panB = game.movingAnimalPosition(deer, 0, base, { fast: true });
if (distance(panA, panB) > 0.00001) {
  throw new Error("animal motion should pause during map pan");
}
game.gesture = null;

["河马", "鳄鱼", "火烈鸟", "鹰", "秃鹫", "斑马", "羚羊"].forEach((species) => {
  const animal = animals.find((item) => item.species === species) || game.state.world.knownCharacters.find((item) => item.species === species);
  if (!animal) return;
  const index = animals.findIndex((item) => item.id === animal.id);
  const safeIndex = index >= 0 ? index : 0;
  const anchor = game.animalMapPosition(animal, safeIndex);
  game.anim.t += 900;
  const moved = game.movingAnimalPosition(animal, safeIndex, anchor);
  assertInside(moved, species);
  const kind = game.animalMotionProfile(species).kind;
  const maxRange = kind === "air" ? 0.20 : kind === "water" ? 0.075 : 0.13;
  if (distance(anchor, moved) > maxRange) {
    throw new Error(`${species} moved too far from habitat`);
  }
  assertGroundedMetrics(game, animal, moved, species);
});

console.log("animal motion check ok");
