"use strict";

// RescuePup floor-first renderer.
// Bottom Grassland.png is the authoritative connected terrain tileset.
// The visible map is one continuous terrain layer. The buildable area remains
// logical game data only and does not create a second visual floor layer.
(() => {
  const TERRAIN_TILE_SIZE = 32;
  const TERRAIN_STEP_X = 16;
  const TERRAIN_STEP_Y = 8;
  const TERRAIN_PADDING = 10;
  const TERRAIN_SHEET = "./Bottom%20Grassland.png";

  let lastFloorSignature = null;
  let resizeFrame = null;

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

  // Bottom Grassland.png contains the 16 connected terrain variants in the
  // first 4 columns x 4 rows. The supplied bitmask guide uses this ordering:
  // 0 = no first-side / yes second-side
  // 1 = yes first-side / yes second-side
  // 2 = yes first-side / no second-side
  // 3 = no first-side / no second-side
  function pairVariant(firstConnected, secondConnected) {
    if (!firstConnected && secondConnected) return 0;
    if (firstConnected && secondConnected) return 1;
    if (firstConnected && !secondConnected) return 2;
    return 3;
  }

  function autotileVariant(worldX, worldY, range) {
    const north = worldY > range.minY;
    const east = worldX < range.maxX - 1;
    const south = worldY < range.maxY - 1;
    const west = worldX > range.minX;

    return {
      row: pairVariant(north, south),
      col: pairVariant(west, east)
    };
  }

  function floorTiles(area) {
    const range = floorRange(area);
    const tiles = [];

    for (let worldY = range.minY; worldY < range.maxY; worldY += 1) {
      for (let worldX = range.minX; worldX < range.maxX; worldX += 1) {
        const center = terrainIsoPoint(worldX + 0.5, worldY + 0.5);
        const variant = autotileVariant(worldX, worldY, range);
        tiles.push({
          worldX,
          worldY,
          centerX: center.x,
          centerY: center.y,
          buildable: isBuildable(area, worldX, worldY),
          depth: worldX + worldY,
          tileRow: variant.row,
          tileCol: variant.col
        });
      }
    }

    // One continuous layer: top/back first, bottom/front last.
    tiles.sort((a, b) =>
      a.depth - b.depth ||
      a.worldY - b.worldY ||
      a.worldX - b.worldX
    );

    return tiles;
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
      Math.round(height),
      TERRAIN_SHEET
    ].join(":");
  }

  function renderFloor(force = false) {
    if (!els?.townMap) return;

    const area = currentArea();
    const width = els.townMap.clientWidth || 390;
    const height = els.townMap.clientHeight || 560;
    const signature = floorSignature(area, width, height);
    const existing = els.townMap.querySelector(".terrain-floor-world");

    // Passive ticks must not rebuild the floor and cause image flashing.
    if (!force && existing && signature === lastFloorSignature) return;

    const tiles = floorTiles(area);
    const bounds = floorBounds(tiles);
    const offsetX = width / 2 - (bounds.left + bounds.width / 2);
    const offsetY = height / 2 - (bounds.top + bounds.height / 2);

    const tileMarkup = tiles.map((tile, index) => {
      const x = tile.centerX + offsetX;
      const y = tile.centerY + offsetY;
      const backgroundX = -(tile.tileCol * TERRAIN_TILE_SIZE);
      const backgroundY = -(tile.tileRow * TERRAIN_TILE_SIZE);
      return `
        <span
          class="terrain-floor-tile ${tile.buildable ? "buildable-floor-tile" : "outside-floor-tile"}"
          aria-hidden="true"
          data-world-x="${tile.worldX}"
          data-world-y="${tile.worldY}"
          data-buildable="${tile.buildable ? "true" : "false"}"
          data-floor-depth="${tile.depth}"
          data-tile-row="${tile.tileRow}"
          data-tile-col="${tile.tileCol}"
          style="left:${x}px;top:${y}px;z-index:${10 + index};background-position:${backgroundX}px ${backgroundY}px;"
        ></span>
      `;
    }).join("");

    els.townMap.className = "town-map layout-grid-mode terrain-floor-mode";
    els.townMap.innerHTML = `
      <div
        class="terrain-floor-world"
        data-tile-size="${TERRAIN_TILE_SIZE}"
        data-step-x="${TERRAIN_STEP_X}"
        data-step-y="${TERRAIN_STEP_Y}"
        data-floor-sheet="${TERRAIN_SHEET}"
        data-floor-signature="${signature}"
        aria-label="RescuePup connected terrain floor"
      >
        ${tileMarkup}
      </div>
      <div class="map-status terrain-floor-status" aria-hidden="true">
        <span class="status-chip">Floor pass</span>
        <span class="status-chip">Bottom Grassland</span>
        <span class="status-chip">Connected autotiles</span>
      </div>
    `;

    lastFloorSignature = signature;
  }

  // Future buildings, dogs and props must use this exact terrain projection.
  layoutIsoPoint = terrainIsoPoint;
  layoutIsoProject = terrainIsoProject;

  window.RescuePupTerrain = Object.freeze({
    tileSize: TERRAIN_TILE_SIZE,
    stepX: TERRAIN_STEP_X,
    stepY: TERRAIN_STEP_Y,
    padding: TERRAIN_PADDING,
    sheet: TERRAIN_SHEET,
    project: terrainIsoProject,
    point: terrainIsoPoint
  });

  renderMap = function renderFloorOnlyMap() {
    renderFloor(false);
  };

  // app.js has already rendered once before this deferred script loads.
  renderFloor(true);

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
