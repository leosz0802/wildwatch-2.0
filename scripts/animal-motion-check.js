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

const allSpecies = getUnlockedSpecies(7, 20).map((species) => species.name);
const atlasIndices = allSpecies.map((species) => game.animalMapSpriteIndex(species));
if (atlasIndices.some((index) => index < 0) || Math.max(...atlasIndices) !== 24) {
  throw new Error(`all 33 unlocked species must map onto the 25-cell full-body atlas: ${atlasIndices.join(",")}`);
}
if (new Set(atlasIndices).size !== 25) {
  throw new Error(`late-chapter species should reuse atlas fallbacks without inventing new cells: ${atlasIndices.join(",")}`);
}
const spriteFallbacks = {
  水獭: "水貂",
  鹈鹕: "火烈鸟",
  猩猩: "熊",
  巨嘴鸟: "乌鸦",
  貘: "野猪",
  夜莺: "猫头鹰",
  野牛: "斑马",
  鹤: "火烈鸟"
};
Object.keys(spriteFallbacks).forEach((species) => {
  if (game.animalMapSpriteIndex(species) !== game.animalMapSpriteIndex(spriteFallbacks[species])) {
    throw new Error(`${species} should reuse the ${spriteFallbacks[species]} atlas cell until dedicated art exists`);
  }
});
if (game.animalMapSpriteIndex("兔子") !== game.animalMapSpriteIndex("野兔")) {
  throw new Error("legacy rabbit alias should resolve to the wild-hare sprite");
}
// This list is deliberately independent from animalSpriteFacesRight(). It
// records the actual native orientation in animal-map-sprites-atlas-v2.png,
// so the regression catches a wrong metadata table instead of merely proving
// that the mirror function agrees with itself.
// Read directly from the atlas cells: these are the only sprites whose
// head/nose is on the right side of the source image. Keep this independent
// from the production lookup so a bad metadata edit cannot self-validate.
const expectedNativeRight = new Set(["狼", "斑马", "野猪", "野犬", "水貂"]);
allSpecies.forEach((species) => {
  const atlasSpecies = spriteFallbacks[species] || species;
  const nativeRight = game.animalSpriteFacesRight(species);
  if (nativeRight !== expectedNativeRight.has(atlasSpecies)) {
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
    const atlasSpecies = spriteFallbacks[species] || species;
    const renderedRight = expectedNativeRight.has(atlasSpecies) !== (scales[0].x < 0);
    if (renderedRight !== (facingX > 0)) {
      throw new Error(`${species} rendered body direction does not match travel direction`);
    }
  });
});

const animals = game.visibleSandAnimals(game.state.world);
if (!animals.length) throw new Error("no animals available for motion check");

// High-priority animals need a visible target treatment, not only a larger
// invisible hit area. Verify the renderer records all three hierarchy states.
const focusGradient = { addColorStop() {} };
const focusCtx = new Proxy({
  createRadialGradient() { return focusGradient; },
  measureText(text) { return { width: String(text || "").length * 7 }; }
}, {
  get(target, property) {
    if (property in target) return target[property];
    return () => {};
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  }
});
game.renderedAnimalFocusMarkers = [];
const focusMetrics = { bodyY: 130, bubbleY: 92, groundY: 164, hitSize: 68 };
game.drawAnimalFocusMarker(focusCtx, 160, focusMetrics, "event", 1, animals[0], false);
game.drawAnimalFocusMarker(focusCtx, 160, focusMetrics, "moment", 1, animals[0], true);
game.drawAnimalFocusMarker(focusCtx, 160, focusMetrics, "selected", 1, animals[0], false);
const focusLabels = game.renderedAnimalFocusMarkers.map((marker) => marker.label).join(",");
const [eventFocus, momentFocus, selectedFocus] = game.renderedAnimalFocusMarkers;
if (focusLabels !== "听线索,看回应,已选"
  || !game.renderedAnimalFocusMarkers.every((marker) => marker.hasBacklight && marker.hasDoubleRing)
  || !eventFocus.actionAffordance || eventFocus.purpose !== "tap-animal-for-clue" || !eventFocus.displayLabel.includes("›")
  || !momentFocus.actionAffordance || momentFocus.purpose !== "tap-animal-for-response" || !momentFocus.displayLabel.includes("›")
  || selectedFocus.actionAffordance || selectedFocus.purpose !== "selected-animal") {
  throw new Error(`animal focus hierarchy must use a backlight, double ring and explicit flag: ${focusLabels}`);
}

// Focused/glowing animals must remain easy to select even when an ordinary
// animal overlaps their visual halo. Hit testing walks from the last-added
// target, so the focused target is intentionally registered last.
game.hitAreas = [];
game.mapViewport = { x: 0, y: 0, w: 320, h: 320 };
let picked = "";
game.addMapHit(160, 160, 52, () => { picked = "ordinary"; });
game.addMapHit(160, 160, 88, () => { picked = "glowing"; });
const haloHit = game.hitAreaAt(195, 160);
if (!haloHit) throw new Error("glowing animal halo should be included in its touch target");
haloHit.onTap();
if (picked !== "glowing") throw new Error("glowing animal should win overlapping animal hit targets");

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
  const scale = collisionCamera.scale || 1;
  const worldW = Math.max(1, (collisionCamera.worldW || collisionCamera.worldSize || collisionCamera.w || 1) * scale);
  const worldH = Math.max(1, (collisionCamera.worldH || collisionCamera.worldSize || collisionCamera.h || 1) * scale);
  const obstacle = game.animalFacilityCollisionSize(collisionCamera);
  const overlapsFacility = placements.some((placement) => {
    const size = game.animalMotionCollisionSize(placement.animal, collisionCamera, placement.groupCount || 1);
    return Math.abs(placement.motion.x - facility.x) * worldW < (size.w + obstacle.w) / 2 - .25
      && Math.abs(placement.motion.y - facility.y) * worldH < (size.h + obstacle.h) / 2 - .25;
  });
  if (overlapsFacility) {
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

game.animalMotionStates = {};
game.anim.t = 0;
const walkDeer = { id: "gait_deer", species: "鹿", name: "鹿" };
const walkAnchor = game.animalMapPosition(walkDeer, 0);
game.movingAnimalPosition(walkDeer, 0, walkAnchor);
let previousGait = null;
for (let frame = 1; frame <= 40; frame += 1) {
  game.anim.t = frame * 100;
  const walked = game.movingAnimalPosition(walkDeer, 0, walkAnchor);
  if (Math.abs(walked.dirX) + Math.abs(walked.dirY) > 0.00005) {
    if (previousGait != null) {
      const delta = Math.min(Math.abs(walked.gaitPhase - previousGait), 1 - Math.abs(walked.gaitPhase - previousGait));
      if (delta > 0.22) {
        throw new Error(`walking gait jumped ${delta.toFixed(3)} in one home-frame; animals would jitter instead of stride`);
      }
    }
    previousGait = walked.gaitPhase;
  }
}
if (previousGait == null) throw new Error("gait smoothness check never observed a walking frame");

const { buildReserveDevelopmentPlan } = require("../js/reserveDevelopment");
const clusterGame = new Game();
clusterGame.state = createCharacter(null, "浅滩散开");
clusterGame.screen = "home";
clusterGame.animalMotionStates = {};
clusterGame.settlementModal = null;
clusterGame.patrolTaskModal = null;
clusterGame.infoDetailModal = null;
clusterGame.gesture = null;
clusterGame.anim = { t: 0 };
const clusterReserve = clusterGame.state.world.reserve;
clusterReserve.ecology.water = 42;
clusterReserve.progression.stage = 9;
clusterReserve.progression.displayChapter = 9;
if (!buildReserveDevelopmentPlan(clusterReserve, "river_shallows", "visitor_boardwalk", 2).ok) {
  throw new Error("浅滩观景建筑应能建成");
}
const clusterAnimals = ["鹿", "羚羊", "斑马", "野兔"].map((species, index) => ({
  id: `cluster_${species}`,
  species,
  name: species
}));
const clusterLayout = clusterGame.animalMapLayoutContext(clusterAnimals, clusterGame.state.world);
const nearShallows = clusterAnimals.filter((animal, index) => {
  const pos = clusterGame.animalMapLayoutPosition(animal, index, clusterAnimals, clusterLayout);
  return Math.abs(pos.x - 0.70) < 0.07 && Math.abs(pos.y - 0.47) < 0.07;
});
if (nearShallows.length > 1) {
  throw new Error(`too many grazers parked on the river building: ${nearShallows.map((item) => item.species).join(",")}`);
}
clusterAnimals.forEach((animal, index) => {
  const habitat = clusterGame.animalMapLayoutPosition(animal, index, clusterAnimals, clusterLayout);
  clusterGame.movingAnimalPosition(animal, index, habitat);
});
let walkedAway = 0;
for (let frame = 1; frame <= 80; frame += 1) {
  clusterGame.anim.t = frame * 120;
  clusterAnimals.forEach((animal, index) => {
    const habitat = clusterGame.animalMapLayoutPosition(animal, index, clusterAnimals, clusterLayout);
    const motion = clusterGame.movingAnimalPosition(animal, index, habitat);
    if (Math.sqrt((motion.x - 0.70) ** 2 + (motion.y - 0.47) ** 2) > 0.08) walkedAway += 1;
  });
}
if (walkedAway < 8) {
  throw new Error("grazers should leave the river building and keep walking");
}

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
