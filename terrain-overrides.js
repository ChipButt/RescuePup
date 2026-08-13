"use strict";

// RescuePup floor-first renderer.
// Bottom Grassland.png is the outside terrain autotile sheet.
// Bottom Grassland Dry.png is the buildable terrain autotile sheet.
// Both regions share one isometric render/depth layer. Fence artwork is tied
// directly to the buildable autotile variant so expansion reproduces it.
(() => {
  const TERRAIN_TILE_SIZE = 32;
  const TERRAIN_STEP_X = 16;
  const TERRAIN_STEP_Y = 8;
  const TERRAIN_PADDING = 10;
  const OUTSIDE_TERRAIN_SHEET = "./Bottom%20Grassland.png";
  const BUILDABLE_TERRAIN_SHEET = "./Bottom%20Grassland%20Dry.png";

  const BUILD_FENCE_DEFINITIONS = Object.freeze({
    r0c0: { asset: "./fence_corner_N.png", offsetX: 0, offsetY: -13 },
    r0c1: { asset: "./fence_straight_NE.png", offsetX: 0, offsetY: -13 },
    r0c2: { asset: "./fence_corner_E.png", offsetX: 0, offsetY: -13 },
    r1c0: { asset: "./fence_straight_NW.png", offsetX: 0, offsetY: -13 },
    r1c2: { asset: "./fence_straight_SE.png", offsetX: 0, offsetY: -13 },
    r2c0: { asset: "./fence_corner_W.png", offsetX: 0, offsetY: -13 },
    r2c1: { asset: "./fence_straight_SW.png", offsetX: 0, offsetY: -13 },
    r2c2: { asset: "./fence_corner_S.png", offsetX: 0, offsetY: -13 }
  });

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

  // The first 4x4 tiles in each terrain sheet follow the supplied bitmask:
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

  function sameRegionNeighbor(area, range, worldX, worldY, buildable) {
    if (
      worldX < range.minX ||
      worldY < range.minY ||
      worldX >= range.maxX ||
      worldY >= range.maxY
    ) {
      return false;
    }
    return isBuildable(area, worldX, worldY) === buildable;
  }

  function autotileVariant(area, range, worldX, worldY, buildable) {
    const north = sameRegionNeighbor(area, range, worldX, worldY - 1, buildable);
    const east = sameRegionNeighbor(area, range, worldX + 1, worldY, buildable);
    const south = sameRegionNeighbor(area, range, worldX, worldY + 1, buildable);
    const west = sameRegionNeighbor(area, range, worldX - 1, worldY, buildable);

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
        const buildable = isBuildable(area, worldX, worldY);
        const variant = autotileVariant(area, range, worldX, worldY, buildable);
        const tileId = `r${variant.row}c${variant.col}`;

        tiles.push({
          worldX,
          worldY,
          centerX: center.x,
          centerY: center.y,
          buildable,
          depth: worldX + worldY,
          tileRow: variant.row,
          tileCol: variant.col,
          tileId,
          fence: buildable ? BUILD_FENCE_DEFINITIONS[tileId] || null : null
        });
      }
    }

    // One shared world layer: top/back first, bottom/front last.
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
    const top = Math.min(...tiles.map((tile) => tile.centerY - half - (tile.fence ? 13 : 0)));
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
      OUTSIDE_TERRAIN_SHEET,
      BUILDABLE_TERRAIN_SHEET,
      "fence-v1"
    ].join(":");
  }

  function renderFloor(force = false) {
    if (!els?.townMap) return;

    const area = currentArea();
    const width = els.townMap.clientWidth || 390;
    const height = els.townMap.clientHeight || 560;
    const signature = floorSignature(area, width, height);
    const existing = els.townMap.querySelector(".terrain-floor-world");

    // Passive ticks must not rebuild the terrain and flash the images.
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
      const terrainZ = 10 + index * 2;
      const fenceZ = terrainZ + 1;

      const fenceMarkup = tile.fence ? `
        <img
          class="terrain-fence-piece"
          src="${tile.fence.asset}"
          alt=""
          draggable="false"
          data-fence-for-tile="${tile.tileId}"
          data-world-x="${tile.worldX}"
          data-world-y="${tile.worldY}"
          style="left:${x - TERRAIN_TILE_SIZE / 2 + tile.fence.offsetX}px;top:${y - TERRAIN_TILE_SIZE / 2 + tile.fence.offsetY}px;z-index:${fenceZ};"
        />
      ` : "";

      return `
        <span
          class="terrain-floor-tile ${tile.buildable ? "buildable-floor-tile" : "outside-floor-tile"}"
          aria-hidden="true"
          data-world-x="${tile.worldX}"
          data-world-y="${tile.worldY}"
          data-buildable="${tile.buildable ? "true" : "false"}"
          data-floor-depth="${tile.depth}"
          data-tile-id="${tile.tileId}"
          data-tile-row="${tile.tileRow}"
          data-tile-col="${tile.tileCol}"
          style="left:${x}px;top:${y}px;z-index:${terrainZ};background-position:${backgroundX}px ${backgroundY}px;"
        ></span>
        ${fenceMarkup}
      `;
    }).join("");

    els.townMap.className = "town-map layout-grid-mode terrain-floor-mode";
    els.townMap.innerHTML = `
      <div
        class="terrain-floor-world"
        data-tile-size="${TERRAIN_TILE_SIZE}"
        data-step-x="${TERRAIN_STEP_X}"
        data-step-y="${TERRAIN_STEP_Y}"
        data-outside-sheet="${OUTSIDE_TERRAIN_SHEET}"
        data-buildable-sheet="${BUILDABLE_TERRAIN_SHEET}"
        data-floor-signature="${signature}"
        aria-label="RescuePup terrain and build boundary"
      >
        ${tileMarkup}
      </div>
      <div class="map-status terrain-floor-status" aria-hidden="true">
        <span class="status-chip">Floor pass</span>
        <span class="status-chip">Dry build area</span>
        <span class="status-chip">Autotile fence</span>
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
    outsideSheet: OUTSIDE_TERRAIN_SHEET,
    buildableSheet: BUILDABLE_TERRAIN_SHEET,
    fenceDefinitions: BUILD_FENCE_DEFINITIONS,
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
