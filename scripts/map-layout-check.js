const { createInitialWorld } = require("../js/world");

function cameraInfo(x, y, w, h, zoom, mapCamera) {
  const scale = zoom > 0 ? 1.88 : 1.18;
  const worldSize = Math.max(w, h);
  const halfX = w / (2 * worldSize * scale);
  const halfY = h / (2 * worldSize * scale);
  const edgePad = 0;
  const camera = {
    cx: Math.max(halfX - edgePad, Math.min(1 - halfX + edgePad, mapCamera.cx)),
    cy: Math.max(halfY - edgePad, Math.min(1 - halfY + edgePad, mapCamera.cy))
  };
  return {
    x,
    y,
    w,
    h,
    worldX: x + (w - worldSize) / 2,
    worldY: y + (h - worldSize) / 2,
    worldSize,
    scale,
    cx: camera.cx,
    cy: camera.cy
  };
}

function mapPoint(nx, ny, camera) {
  return {
    x: camera.worldX + camera.worldSize / 2 + (nx - camera.cx) * camera.worldSize * camera.scale,
    y: camera.worldY + camera.worldSize / 2 + (ny - camera.cy) * camera.worldSize * camera.scale
  };
}

const width = 375;
const overviewX = 12;
const overviewY = 420;
const overviewW = width - 24;
const mapX = overviewX + 13;
const mapY = overviewY + 107;
const mapW = overviewW - 26;
const mapH = 498;
const world = createInitialWorld();

[0, 1].forEach((zoom) => {
  [
    { cx: 0.5, cy: 0.5 },
    { cx: 0.08, cy: 0.08 },
    { cx: 0.92, cy: 0.92 }
  ].forEach((mapCamera) => {
  const camera = cameraInfo(mapX, mapY, mapW, mapH, zoom, mapCamera);
  const coverLeft = camera.worldX + camera.worldSize / 2 - camera.cx * camera.worldSize * camera.scale;
  const coverTop = camera.worldY + camera.worldSize / 2 - camera.cy * camera.worldSize * camera.scale;
  const coverRight = coverLeft + camera.worldSize * camera.scale;
  const coverBottom = coverTop + camera.worldSize * camera.scale;
  const epsilon = 0.5;
  if (coverLeft > mapX + epsilon || coverTop > mapY + epsilon || coverRight < mapX + mapW - epsilon || coverBottom < mapY + mapH - epsilon) {
    throw new Error(`map does not cover viewport at zoom ${zoom}`);
  }
  if (zoom > 0 && (coverRight - coverLeft < mapW * 2 || coverBottom - coverTop < mapH * 1.7)) {
    throw new Error(`map is not large enough to feel draggable at zoom ${zoom}`);
  }
  if (mapCamera.cx !== 0.5 || mapCamera.cy !== 0.5) return;
  const regionsToCheck = zoom === 0 ? world.regions : world.regions.filter((region) => region.id === "center");
  regionsToCheck.forEach((region) => {
    const point = mapPoint(region.x, region.y, camera);
    const margin = zoom === 2 ? 110 : 70;
    if (point.x < mapX - margin || point.x > mapX + mapW + margin || point.y < mapY - margin || point.y > mapY + mapH + margin) {
      throw new Error(`${region.name} point is too far from viewport at zoom ${zoom}`);
    }
  });
  });
});

console.log("map layout ok");
