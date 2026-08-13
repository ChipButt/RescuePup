"use strict";

// RescuePup floor-first renderer.
// The supplied 32x32 pixel-art terrain assets are the authoritative geometry
// for the map. The outside ground is one terrain layer; the buildable area is
// a second raised layer so tile_040 keeps its visible dirt/cliff perimeter.
(() => {
  const TERRAIN_TILE_SIZE = 32;
  const TERRAIN_STEP_X = 16;
  const TERRAIN_STEP_Y = 8;
  const TERRAIN_PADDING = 10;
  const BUILDABLE_TILE = "./tile_040.png";
  const OUTSIDE_TILES = ["./tile_037.png", "./tile_038.png", "./tile_039.png"];

  let lastFloorSignature = null;
  let resizeFrame = null;

  function stableHash(x, y, salt = 0) {
    let value = Math.imul((x | 0) ^ 0x45d9f3b, 0x27d4eb2d);
    value ^= Math.imul((y | 0) ^ 0x119de1f3, 0x165667b1);
    value ^= Math.imul((salt | 0) ^ 0x6d2b79f5, 0x1b873593);
    value ^= value >>> 15;
    value = Math.imul(value, 0x85ebca6b);
    value ^= value >>> 13;
    return value >>> 0;
  }

  function outsideTileFor(worldX, worldY) {
    return OUTSIDE_TILES[stableHash(worldX, worldY, 37) % OUTSIDE_TILES.length];
  }

  function terrainIsoPoint(worldX, worldY) {
    return {
      x: (worldX - worldY) * TERRAIN_STEP_X,
      y: (worldX + worldY) * TERRAIN_STEP_Y
    };
  }

  function terrainIsoProject(worldX, worldY, offsetX = 0, offsetY = 0) {
    const point = terrainIsoPoint(worldX, worldY);
    return {
      x: point.x + offsetX,
      y: point.y + offsetY
    };
  }

  function isBuildable(area, worldX, worldY) {
    return (
      worldX >= area.minX &&
      worldY >= area.minY &&
      worldX < area.maxX &&
      worldY < area.maxY
    );
  }

  function floorRange(area) {
    return {
      minX: area.minX - TERRAIN_PADDING,
      minY: area.minY - TERRAIN_PADDING,
      maxX: area.maxX + TERRAIN_PADDING,
      maxY: area.maxY + TERRAIN_PADDING
    };
  }

  function tileRecord(worldX, worldY, src, buildable) {
    const center = terrainIsoPoint(worldX + 0.5, worldY + 0.5);
    return {
      worldX,
      worldY,
      centerX: center.x,
      centerY: center.y,
      buildable,
      src,
      depth: worldX + worldY
    };
  }

  function sortTerrainLayer(tiles) {
    tiles.sort((a, b) =>
      a.depth - b.depth ||
      a.worldY - b.worldY ||
      a.worldX - b.worldX
    );
    return tiles;
  }

  function floorTiles(area) {
    const range = floorRange(area);
    const outside = [];
    const buildable = [];

    for (let worldY = range.minY; worldY < range.maxY; worldY += 1) {
      for (let worldX = range.minX; worldX < range.maxX; worldX += 1) {
        if (isBuildable(area, worldX, worldY)) {
          buildable.push(tileRecord(worldX, worldY, BUILDABLE_TILE, true));
        } else {
          outside.push(tileRecord(
            worldX,
            worldY,
            outsideTileFor(worldX, worldY),
            false
          ));
        }
      }
    }

    return {
      outside: sortTerrainLayer(outside),
      buildable: sortTerrainLayer(buildable)
    };
  }

  function floorBounds(tiles) {
    const half = TERRAIN_TILE_SIZE / 2;
    const left = Math.min(...tiles.map((tile) => tile.centerX - half));
    const right = Math.max(...tiles.map((tile) => tile.centerX + half));
    const top = Math.min(...tiles.map((tile) => tile.centerY - half));
    const bottom = Math.max(...tiles.map((tile) => tile.centerY + half));
    return {
      left,
      right,
      top,
      bottom,
      width: right - left,
      height: bottom - top
    };
  }

  function floorSignature(area, width, height) {
    return [
      area.minX,
      area.minY,
      area.maxX,
      area.maxY,
      Math.round(width),
      Math.round(height)
    ].join(":");
  }

  function tileMarkup(tiles, offsetX, offsetY, zBase) {
    return tiles.map((tile, index) => {
      const x = tile.centerX + offsetX;
      const y = tile.centerY + offsetY;
      return `
        <img
          class="terrain-floor-tile ${tile.buildable ? "buildable-floor-tile" : "outside-floor-tile"}"
          src="${tile.src}"
          alt=""
          draggable="false"
          data-world-x="${tile.worldX}"
          data-world-y="${tile.worldY}"
          data-floor-depth="${tile.depth}"
          style="left:${x}px;top:${y}px;z-index:${zBase + index};"
        />
      `;
    }).join("");
  }

  function renderFloor(force = false) {
    if (!els?.townMap) return;

    const area = currentArea();
    const width = els.townMap.clientWidth || 390;
    const height = els.townMap.clientHeight || 560;
    const signature = floorSignature(area, width, height);
    const existing = els.townMap.querySelector(".terrain-floor-world");

    // Passive game ticks still call renderMap(), but the floor DOM is kept
    // intact unless the playable area or viewport dimensions actually change.
    if (!force && existing && signature === lastFloorSignature) return;

    const layers = floorTiles(area);
    const allTiles = [...layers.outside, ...layers.buildable];
    const bounds = floorBounds(allTiles);
    const offsetX = width / 2 - (bounds.left + bounds.width / 2);
    const offsetY = height / 2 - (bounds.top + bounds.height / 2);

    els.townMap.className = "town-map layout-grid-mode terrain-floor-mode";
    els.townMap.innerHTML = `
      <div
        class="terrain-floor-world"
        data-tile-size="${TERRAIN_TILE_SIZE}"
        data-step-x="${TERRAIN_STEP_X}"
        data-step-y="${TERRAIN_STEP_Y}"
        data-floor-signature="${signature}"
        aria-label="RescuePup terrain floor"
      >
        ${tileMarkup(layers.outside, offsetX, offsetY, 10)}
        ${tileMarkup(layers.buildable, offsetX, offsetY, 10000)}
      </div>
      <div class="map-status terrain-floor-status" aria-hidden="true">
        <span class="status-chip">Floor pass</span>
        <span class="status-chip">32x32 native</span>
        <span class="status-chip">Raised build plateau</span>
      </div>
    `;

    lastFloorSignature = signature;
  }

  // Make the supplied terrain geometry the projection used by future map art.
  // Existing buildings/props are deliberately not rendered during this pass;
  // they will be reintroduced against this projection after the floor is approved.
  layoutIsoPoint = terrainIsoPoint;
  layoutIsoProject = terrainIsoProject;

  window.RescuePupTerrain = Object.freeze({
    tileSize: TERRAIN_TILE_SIZE,
    stepX: TERRAIN_STEP_X,
    stepY: TERRAIN_STEP_Y,
    padding: TERRAIN_PADDING,
    project: terrainIsoProject,
    point: terrainIsoPoint
  });

  renderMap = function renderFloorOnlyMap() {
    renderFloor(false);
  };

  // app.js has already performed its initial render before this deferred script.
  renderFloor(true);

  // Recenter the native-pixel terrain only when the map viewport itself changes.
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        renderFloor(true);
      });
    });
    observer.observe(els.townMap);
  }
})();
