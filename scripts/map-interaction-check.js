const { createInitialWorld } = require("../js/world");
const { Game } = require("../js/game");
const { getChapterSandboxSpecies } = require("../js/animalWorld");

const width = 375;
const overviewX = 12;
const overviewY = 420;
const overviewW = width - 24;
const mapX = overviewX + 13;
const mapY = overviewY + 107;
const mapW = overviewW - 26;
const mapH = 498;
const world = createInitialWorld();

function currentMapScale(zoom) {
  return zoom > 0 ? 1.88 : 1.18;
}

function clampMapCamera(cx, cy, scale, frame) {
  const halfX = frame.w / (2 * frame.worldSize * scale);
  const halfY = frame.h / (2 * frame.worldSize * scale);
  return {
    cx: Math.max(halfX, Math.min(1 - halfX, cx)),
    cy: Math.max(halfY, Math.min(1 - halfY, cy))
  };
}

function cameraInfo(zoom, mapCamera) {
  const scale = currentMapScale(zoom);
  const worldSize = Math.max(mapW, mapH);
  const frame = { x: mapX, y: mapY, w: mapW, h: mapH, worldSize, scale };
  const camera = clampMapCamera(mapCamera.cx, mapCamera.cy, scale, frame);
  return Object.assign(frame, {
    worldX: mapX + (mapW - worldSize) / 2,
    worldY: mapY + (mapH - worldSize) / 2,
    cx: camera.cx,
    cy: camera.cy
  });
}

function pan(camera, dx, dy) {
  return clampMapCamera(
    camera.cx - dx / (camera.worldSize * camera.scale),
    camera.cy - dy / (camera.worldSize * camera.scale),
    camera.scale,
    camera
  );
}

function mapPoint(nx, ny, camera) {
  return {
    x: camera.worldX + camera.worldSize / 2 + (nx - camera.cx) * camera.worldSize * camera.scale,
    y: camera.worldY + camera.worldSize / 2 + (ny - camera.cy) * camera.worldSize * camera.scale
  };
}

function intersectsViewport(cx, cy, size) {
  const x = cx - size / 2;
  const y = cy - size / 2;
  const left = Math.max(x, mapX);
  const top = Math.max(y, mapY);
  const right = Math.min(x + size, mapX + mapW);
  const bottom = Math.min(y + size, mapY + mapH);
  return right > left && bottom > top;
}

function animalMapPosition(animal, index) {
  const regions = world.regions || [];
  const byId = (id) => regions.find((region) => region.id === id);
  const byName = (name) => regions.find((region) => region.name === name);
  const intentRegion = animal.intent && animal.intent.targetRegionId ? byId(animal.intent.targetRegionId) : null;
  const homeRegion = byName(animal.location);
  const speciesRegion = {
    鹿: byId("meadow"),
    狼: byId("center"),
    乌鸦: byId("north"),
    熊: byId("rocks"),
    水貂: byId("lake")
  }[animal.species];
  const region = intentRegion || speciesRegion || homeRegion || regions[index % regions.length];
  const habits = {
    鹿: [0.02, 0.035],
    狼: [-0.035, 0.005],
    乌鸦: [-0.015, -0.045],
    熊: [-0.045, 0.02],
    水貂: [0.045, 0.02]
  };
  const offset = habits[animal.species] || [0, 0];
  const drift = Math.sin((world.day || 1) * 0.7 + index) * 0.012;
  return {
    x: Math.max(0.05, Math.min(0.95, region.x + offset[0] + drift)),
    y: Math.max(0.05, Math.min(0.95, region.y + offset[1] - drift * 0.6))
  };
}

[0, 1].forEach((zoom) => {
  let camera = cameraInfo(zoom, { cx: 0.52, cy: 0.48 });
  const before = { cx: camera.cx, cy: camera.cy };
  const afterDragRightDown = pan(camera, 80, 120);
  if (afterDragRightDown.cx >= before.cx || afterDragRightDown.cy >= before.cy) {
    throw new Error(`pan direction is wrong at zoom ${zoom}`);
  }
  camera = cameraInfo(zoom, { cx: afterDragRightDown.cx, cy: afterDragRightDown.cy });
  const afterDragLeftUp = pan(camera, -160, -180);
  if (afterDragLeftUp.cx <= camera.cx || afterDragLeftUp.cy <= camera.cy) {
    throw new Error(`reverse pan direction is wrong at zoom ${zoom}`);
  }
  const edge = cameraInfo(zoom, { cx: -99, cy: 99 });
  if (edge.cx < 0 || edge.cx > 1 || edge.cy < 0 || edge.cy > 1) {
    throw new Error(`camera clamp failed at zoom ${zoom}`);
  }
  const hitSize = Math.max(56, Math.min(96, 76 * camera.scale));
  world.regions.forEach((region) => {
    const point = mapPoint(region.x, region.y, camera);
    const visible = point.x >= mapX && point.x <= mapX + mapW && point.y >= mapY && point.y <= mapY + mapH;
    if (visible && !intersectsViewport(point.x, point.y, hitSize)) {
      throw new Error(`visible region has no hit area at zoom ${zoom}: ${region.name}`);
    }
  });
  if (zoom === 1) {
    world.knownCharacters.forEach((animal, index) => {
      const position = animalMapPosition(animal, index);
      const focusedCamera = cameraInfo(zoom, { cx: position.x, cy: position.y });
      const point = mapPoint(position.x, position.y, focusedCamera);
      if (!intersectsViewport(point.x, point.y, Math.max(48, 60 * camera.scale))) {
        throw new Error(`animal has no tappable map area: ${animal.name}`);
      }
    });
  }
});

console.log("map interaction ok");

const game = new Game();
game.mapZoom = 0;
if (Math.abs(game.currentMapScale() - 0.97) > 0.001) throw new Error("the default sandbox camera should start at the minimum map scale");
[0, 0.35, 1, 1.35, 2].forEach((zoom, index, levels) => {
  game.mapZoom = zoom;
  const scale = game.currentMapScale();
  if (index > 0) {
    game.mapZoom = levels[index - 1];
    if (scale <= game.currentMapScale()) throw new Error("continuous map zoom scale must increase monotonically");
  }
});
game.mapZoom = 1;
game.mapCameraFrame = game.mapCameraInfo(0, 0, 375, 500);
const focalBefore = game.mapCamera;
if (!game.setMapZoom(1.4, 280, 190, false) || game.mapZoom <= 1) throw new Error("pinch/button zoom should update the sandbox scale");
if (!game.mapCamera || (game.mapCamera.cx === focalBefore.cx && game.mapCamera.cy === focalBefore.cy)) throw new Error("off-center zoom must preserve its focal point through camera adjustment");
game.setMapZoom(-99, 180, 250, false);
if (game.mapZoom !== 0) throw new Error("map zoom must clamp to minimum");
game.setMapZoom(99, 180, 250, false);
if (game.mapZoom !== 2) throw new Error("map zoom must clamp to maximum");
[0, 1, 2].forEach((zoom, index) => {
  game.mapZoom = zoom;
  const animals = game.visibleSandAnimals(game.state.world);
  const chapter = game.sandboxChapterNumber(game.state.world);
  const expectedSpecies = getChapterSandboxSpecies(chapter)
    .filter((species) => game.sandboxMapSpriteReady(species.name))
    .map((species) => species.name);
  const actualSpecies = animals.map((animal) => animal.species);
  if (new Set(actualSpecies).size !== actualSpecies.length) throw new Error(`duplicate sandbox species at zoom ${zoom}`);
  if (animals.length > 8) throw new Error(`sandbox should keep at most eight herds at zoom ${zoom}`);
  if (expectedSpecies.length <= 8 && JSON.stringify(actualSpecies.slice().sort()) !== JSON.stringify(expectedSpecies.slice().sort())) {
    throw new Error(`sandbox species should exactly match the current chapter at zoom ${zoom}: ${actualSpecies.join(",")}`);
  }
  if (expectedSpecies.length > 8 && actualSpecies.some((species) => expectedSpecies.indexOf(species) < 0)) {
    throw new Error(`sandbox herds must stay within the current chapter at zoom ${zoom}`);
  }
  const ids = animals.map((animal) => animal.id);
  if (new Set(ids).size !== ids.length) throw new Error(`duplicate animal ids at zoom ${zoom}`);
  animals.forEach((animal, animalIndex) => {
    const position = game.animalMapLayoutPosition(animal, animalIndex, animals);
    if (position.x < 0.04 || position.x > 0.96 || position.y < 0.05 || position.y > 0.93) {
      throw new Error(`animal layout escaped map at zoom ${zoom}: ${animal.id}`);
    }
  });
});

const eventAnimal = game.state.world.knownCharacters.find((animal) => animal.species === "水貂") || game.state.world.knownCharacters[0];
game.state.world.mapEvents = [{ id: "old_water", regionId: "lake", label: "旧湖泊水位观察", body: "已经处理", impact: "历史记录" }];
game.state.world.reserveView = Object.assign({}, game.state.world.reserveView, {
  mapMarkers: [{ id: "test_water", regionId: "lake", label: "湖泊水位观察", body: "浅滩水线变窄", impact: "鱼群退向深水" }]
});
const eventContext = game.createAnimalDialogueContext(eventAnimal);
if (!/水线紧|浅滩退了|去深水边|附近有事|路线变/.test(game.animalBubbleText(eventAnimal, eventContext))) {
  throw new Error("animal bubble should reflect the nearby map event");
}

game.state.world.reserveView = Object.assign({}, game.state.world.reserveView, { mapMarkers: [] });
if (game.latestAnimalMapEvent(eventAnimal, game.animalCurrentRegion(eventAnimal))) {
  throw new Error("resolved historical map events must not leak back into current animal dialogue");
}

game.state.world.reserveView = Object.assign({}, game.state.world.reserveView, {
  mapMarkers: [{ id: "fund_transfer", regionId: "lake", label: "项目拨款到账", body: "样本已移交", impact: "基金 +20" }]
});
if (game.latestAnimalMapEvent(eventAnimal, game.animalCurrentRegion(eventAnimal))) {
  throw new Error("fund, purchase and transfer markers must not impersonate live animal events even in the same region");
}

game.mapZoom = 1.85;
game.mapCamera = { cx: 0.18, cy: 0.22 };
game.mapEmergencyFocusId = "lingering-task";
if (Math.abs(game.restoreSandboxOverviewCamera() - 0.97) > 0.001 || game.mapZoom !== 0 || game.mapCamera.cx !== 0.52 || game.mapEmergencyFocusId) {
  throw new Error("returning to the sandbox must restore the default overview camera");
}
const zoomBeforeCrisis = game.mapZoom;
game.beginMapCrisisBurst({
  kind: "emergency_started",
  title: "北太平洋海豹实施二十六次生存干预",
  body: "现场需要处置。",
  visualKind: "risk-zone"
});
if (game.mapZoom !== zoomBeforeCrisis || game.mapZoom !== 0) {
  throw new Error("a live task must not persist a closer sandbox scale");
}
if (!game.setMapZoom(1.4, 180, 250, false) || game.mapZoom <= 1) {
  throw new Error("pinch/button zoom should still change the sandbox scale");
}
game.restoreSandboxOverviewCamera();
if (game.mapZoom !== 0 || Math.abs(game.currentMapScale() - 0.97) > 0.001) {
  throw new Error("background resume must return to the minimum map viewpoint");
}

console.log("map density and dialogue linkage ok");
