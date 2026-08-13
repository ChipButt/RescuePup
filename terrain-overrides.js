"use strict";

// RescuePup authoritative terrain + approved building sprite renderer.
// Terrain/fence geometry is native 32x32 artwork on a 16x8 isometric step.
// Building scale/offset values below come directly from the user's footprint editor.
(() => {
  const TERRAIN_TILE_SIZE = 32;
  const TERRAIN_STEP_X = 16;
  const TERRAIN_STEP_Y = 8;
  const TERRAIN_PADDING = 10;
  const OUTSIDE_TERRAIN_SHEET = "./Bottom%20Grassland.png";
  const BUILDABLE_TERRAIN_SHEET = "./Bottom%20Grassland%20Dry.png";
  const BUILDING_NATIVE_SIZE = 64;
  const STICK_STORAGE_SPRITE_SHEET = "./Stick%20Storage%20Sprite%20Sheet.png";
  const STICK_STORAGE_CELL_SIZE = 256;
  const STICK_STORAGE_CAPACITY_BANDS = Object.freeze([
    Object.freeze({ min: 0, max: 5, column: 0, label: "0-5%" }),
    Object.freeze({ min: 6, max: 35, column: 1, label: "6-35%" }),
    Object.freeze({ min: 36, max: 75, column: 2, label: "36-75%" }),
    Object.freeze({ min: 76, max: 100, column: 3, label: "76-100%" })
  ]);
  const stickStorageSpriteCache = new Map();
  let stickStorageSheetLoading = false;
  let stickStorageSheetReady = false;

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

  function isFenceGapTile(area, worldX, worldY) {
    if (!area || worldY !== area.maxY - 1) return false;
    const width = area.maxX - area.minX;
    const firstGapX = area.minX + Math.floor(width / 2) - 1;
    return worldX === firstGapX || worldX === firstGapX + 1;
  }

  function clampCapacityPercent(value) {
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  function stickStorageCapacityPercent(building) {
    const direct = Number(building?.capacityPercent);
    if (Number.isFinite(direct)) return clampCapacityPercent(direct);

    const stored = Number(
      building?.storedUnits ??
      building?.storedMaterials ??
      building?.materialsStored
    );
    const maximum = Number(
      building?.maxCapacity ??
      building?.storageCapacity ??
      building?.materialCapacity
    );
    if (Number.isFinite(stored) && Number.isFinite(maximum) && maximum > 0) {
      return clampCapacityPercent((stored / maximum) * 100);
    }

    const globalMaximum = Number(
      state?.resourceCaps?.materials ??
      state?.materialsCapacity ??
      state?.maxMaterials
    );
    const globalStored = Number(state?.resources?.materials);
    if (Number.isFinite(globalStored) && Number.isFinite(globalMaximum) && globalMaximum > 0) {
      return clampCapacityPercent((globalStored / globalMaximum) * 100);
    }

    return 0;
  }

  function stickStorageCapacityColumn(percent) {
    const safePercent = clampCapacityPercent(percent);
    if (safePercent <= 5) return 0;
    if (safePercent <= 35) return 1;
    if (safePercent <= 75) return 2;
    return 3;
  }

  function stickStorageSpriteKey(level, column) {
    return `${level}:${column}`;
  }

  function greenKeyCell(context) {
    const imageData = context.getImageData(0, 0, STICK_STORAGE_CELL_SIZE, STICK_STORAGE_CELL_SIZE);
    const pixels = imageData.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const chromaGreen =
        green >= 150 &&
        green >= red + 70 &&
        green >= blue + 60 &&
        red <= 120 &&
        blue <= 130;
      if (chromaGreen) {
        pixels[index] = 0;
        pixels[index + 1] = 0;
        pixels[index + 2] = 0;
        pixels[index + 3] = 0;
      }
    }
    context.putImageData(imageData, 0, 0);
  }

  function primeStickStorageSpriteSheet() {
    if (stickStorageSheetLoading || stickStorageSheetReady || typeof document === "undefined") return;
    stickStorageSheetLoading = true;
    const sheet = new Image();
    sheet.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = STICK_STORAGE_CELL_SIZE;
      canvas.height = STICK_STORAGE_CELL_SIZE;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        stickStorageSheetLoading = false;
        return;
      }

      for (let row = 0; row < 6; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          context.clearRect(0, 0, STICK_STORAGE_CELL_SIZE, STICK_STORAGE_CELL_SIZE);
          context.drawImage(
            sheet,
            column * STICK_STORAGE_CELL_SIZE,
            row * STICK_STORAGE_CELL_SIZE,
            STICK_STORAGE_CELL_SIZE,
            STICK_STORAGE_CELL_SIZE,
            0,
            0,
            STICK_STORAGE_CELL_SIZE,
            STICK_STORAGE_CELL_SIZE
          );
          greenKeyCell(context);
          stickStorageSpriteCache.set(
            stickStorageSpriteKey(row + 1, column),
            canvas.toDataURL("image/png")
          );
        }
      }

      stickStorageSheetReady = true;
      stickStorageSheetLoading = false;
      lastRenderSignature = null;
      renderWorld(true);
    };
    sheet.onerror = () => {
      stickStorageSheetLoading = false;
    };
    sheet.src = STICK_STORAGE_SPRITE_SHEET;
  }

  const BUILDING_SPRITE_DEFINITIONS = Object.freeze({
  "Kennel": {
    "footprint": {
      "width": 2,
      "height": 2
    },
    "levels": {
      "1": {
        "asset": "./kennel_lvl1.png",
        "scale": 1.3,
        "offsetX": -1.5,
        "offsetY": -6.69
      },
      "2": {
        "asset": "./kennel_lvl2.png",
        "scale": 1.3,
        "offsetX": -2.68,
        "offsetY": -6.62
      },
      "3": {
        "asset": "./kennel_lvl3.png",
        "scale": 1.3,
        "offsetX": -1.89,
        "offsetY": -6.77
      },
      "4": {
        "asset": "./kennel_lvl4.png",
        "scale": 1.3,
        "offsetX": -1.7,
        "offsetY": -5.5
      },
      "5": {
        "asset": "./kennel_lvl5.png",
        "scale": 1.28,
        "offsetX": 2.48,
        "offsetY": -3.55
      },
      "6": {
        "asset": "./kennel_lvl6.png",
        "scale": 1.25,
        "offsetX": 0.71,
        "offsetY": 0.73
      }
    }
  },
  "Stick Storage": {
    "footprint": {
      "width": 3,
      "height": 2
    },
    "levels": {
      "1": {
        "asset": "./stick_storage_lvl1.png",
        "scale": 1,
        "offsetX": 0.49,
        "offsetY": -8.24
      },
      "2": {
        "asset": "./stick_storage_lvl2.png",
        "scale": 1.2,
        "offsetX": 0,
        "offsetY": -7.17
      },
      "3": {
        "asset": "./stick_storage_lvl3.png",
        "scale": 1.25,
        "offsetX": -0.39,
        "offsetY": -5.72
      },
      "4": {
        "asset": "./stick_storage_lvl4.png",
        "scale": 1.35,
        "offsetX": -3.09,
        "offsetY": -4.93
      },
      "5": {
        "asset": "./stick_storage_lvl5.png",
        "scale": 1.4,
        "offsetX": -1.84,
        "offsetY": -3.58
      },
      "6": {
        "asset": "./stick_storage_lvl6.png",
        "scale": 1.6,
        "offsetX": -2.63,
        "offsetY": -1.18
      }
    }
  },
  "Kitchen": {
    "footprint": {
      "width": 3,
      "height": 2
    },
    "levels": {
      "1": {
        "asset": "./kitchen_lvl1.png",
        "scale": 1,
        "offsetX": -0.67,
        "offsetY": -9.29
      },
      "2": {
        "asset": "./kitchen_lvl2.png",
        "scale": 1,
        "offsetX": 0.57,
        "offsetY": -9.37
      },
      "3": {
        "asset": "./kitchen_lvl3.png",
        "scale": 1.1,
        "offsetX": -1.11,
        "offsetY": -5.43
      },
      "4": {
        "asset": "./kitchen_lvl4.png",
        "scale": 1.5,
        "offsetX": -2.79,
        "offsetY": -3.61
      },
      "5": {
        "asset": "./kitchen_lvl5.png",
        "scale": 1.5,
        "offsetX": -2.8,
        "offsetY": -3.72
      },
      "6": {
        "asset": "./kitchen_lvl6.png",
        "scale": 1.55,
        "offsetX": -2.42,
        "offsetY": -3.63
      }
    }
  },
  "Crop Farm": {
    "footprint": {
      "width": 3,
      "height": 2
    },
    "levels": {
      "1": {
        "asset": "./crop_farm_lvl1.png",
        "scale": 1,
        "offsetX": -1.04,
        "offsetY": -7.72
      },
      "2": {
        "asset": "./crop_farm_lvl2.png",
        "scale": 1.1,
        "offsetX": -2.72,
        "offsetY": -10.08
      },
      "3": {
        "asset": "./crop_farm_lvl3.png",
        "scale": 1.15,
        "offsetX": -3.95,
        "offsetY": -9.07
      },
      "4": {
        "asset": "./crop_farm_lvl4.png",
        "scale": 1.4,
        "offsetX": -3.61,
        "offsetY": -6.59
      },
      "5": {
        "asset": "./crop_farm_lvl5.png",
        "scale": 1.45,
        "offsetX": 0.24,
        "offsetY": -5.71
      },
      "6": {
        "asset": "./crop_farm_lvl6.png",
        "scale": 1.5,
        "offsetX": 0.13,
        "offsetY": -4.36
      }
    }
  },
  "Protein Farm": {
    "footprint": {
      "width": 2,
      "height": 2
    },
    "levels": {
      "1": {
        "asset": "./protein_farm_lvl1.png",
        "scale": 0.8,
        "offsetX": -1.28,
        "offsetY": -3.3
      },
      "2": {
        "asset": "./protein_farm_lvl2.png",
        "scale": 0.9,
        "offsetX": 0.86,
        "offsetY": -2.17
      },
      "3": {
        "asset": "./protein_farm_lvl3.png",
        "scale": 0.95,
        "offsetX": -0.16,
        "offsetY": -1.03
      },
      "4": {
        "asset": "./protein_farm_lvl4.png",
        "scale": 1,
        "offsetX": -2.06,
        "offsetY": 0.31
      },
      "5": {
        "asset": "./protein_farm_lvl5.png",
        "scale": 1,
        "offsetX": -3.09,
        "offsetY": 1.02
      },
      "6": {
        "asset": "./protein_farm_lvl6.png",
        "scale": 1,
        "offsetX": -1.1,
        "offsetY": 1.12
      }
    }
  }
});

  const GAME_TYPE_TO_VISUAL = Object.freeze({
    kennel: "Kennel",
    storage: "Stick Storage",
    food: "Kitchen",
    kitchen: "Kitchen",
    crop: "Crop Farm",
    crop_farm: "Crop Farm",
    protein: "Protein Farm",
    protein_farm: "Protein Farm"
  });

  let lastRenderSignature = null;
  let resizeFrame = null;

  function terrainIsoPoint(worldX, worldY) {
    return {
      x: (worldX - worldY) * TERRAIN_STEP_X,
      y: (worldX + worldY) * TERRAIN_STEP_Y
    };
  }

  function terrainIsoProject(worldX, worldY, offsetX = 0, offsetY = 0) {
    const point = terrainIsoPoint(worldX, worldY);
    return { x: point.x + offsetX, y: point.y + offsetY };
  }

  function isBuildable(area, worldX, worldY) {
    return worldX >= area.minX && worldY >= area.minY && worldX < area.maxX && worldY < area.maxY;
  }

  function floorRange(area) {
    return {
      minX: area.minX - TERRAIN_PADDING,
      minY: area.minY - TERRAIN_PADDING,
      maxX: area.maxX + TERRAIN_PADDING,
      maxY: area.maxY + TERRAIN_PADDING
    };
  }

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
          fence: buildable && !isFenceGapTile(area, worldX, worldY) ? BUILD_FENCE_DEFINITIONS[tileId] || null : null
        });
      }
    }

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

  function visualNameForGameType(type) {
    return GAME_TYPE_TO_VISUAL[type] || null;
  }

  function visualDefinitionForBuilding(building) {
    const visualName = visualNameForGameType(building?.type);
    if (!visualName) return null;

    const definition = BUILDING_SPRITE_DEFINITIONS[visualName];
    if (!definition) return null;

    const rawLevel = Number(building?.level) || 1;
    const level = Math.max(1, Math.min(6, Math.round(rawLevel)));
    const levelDefinition = definition.levels[String(level)];
    if (!levelDefinition) return null;

    return {
      visualName,
      level,
      footprint: definition.footprint,
      ...levelDefinition
    };
  }

  function buildingCapacityVisual(building, definition) {
    if (definition?.visualName !== "Stick Storage") return null;
    const percent = stickStorageCapacityPercent(building);
    const column = stickStorageCapacityColumn(percent);
    const band = STICK_STORAGE_CAPACITY_BANDS[column];
    return {
      percent,
      column,
      band: band?.label || "0-5%",
      row: definition.level - 1
    };
  }

  function buildingSpriteAsset(building, definition) {
    const capacity = buildingCapacityVisual(building, definition);
    if (!capacity) return definition.asset;
    return stickStorageSpriteCache.get(stickStorageSpriteKey(definition.level, capacity.column)) || definition.asset;
  }

  // Matches the editor's "footprint-bottom-centre" anchor exactly.
  // The footprint is measured from the top-left logical grid corner.
  function footprintBottomCentre(worldX, worldY, footprintWidth, footprintHeight) {
    const origin = terrainIsoPoint(worldX, worldY);
    return {
      x: origin.x + ((footprintWidth - footprintHeight) * TERRAIN_STEP_X) / 2,
      y: origin.y + (footprintWidth + footprintHeight) * TERRAIN_STEP_Y
    };
  }

  function supportedBuildingState() {
    if (!Array.isArray(state?.buildings)) return [];
    return state.buildings
      .map((building) => {
        const definition = visualDefinitionForBuilding(building);
        return definition ? { building, definition } : null;
      })
      .filter(Boolean);
  }

  function buildingStateSignature() {
    return supportedBuildingState()
      .map(({ building, definition }) => [
        building.id,
        building.type,
        definition.level,
        building.status || "ready",
        building.worldX ?? "",
        building.worldY ?? "",
        definition.scale,
        definition.offsetX,
        definition.offsetY,
        definition.visualName === "Stick Storage" ? stickStorageCapacityColumn(stickStorageCapacityPercent(building)) : ""
      ].join(","))
      .join("|");
  }

  function renderSignature(area, width, height) {
    return [
      area.minX,
      area.minY,
      area.maxX,
      area.maxY,
      Math.round(width),
      Math.round(height),
      OUTSIDE_TERRAIN_SHEET,
      BUILDABLE_TERRAIN_SHEET,
      "fence-v2-centre-gap",
      "buildings-v2-stick-capacity",
      buildingStateSignature()
    ].join(":");
  }

  function buildingMarkup(offsetX, offsetY) {
    return supportedBuildingState()
      .map(({ building, definition }) => {
        const catalog = typeof getCatalog === "function" ? getCatalog(building.type) : null;
        const worldX = Number.isFinite(building.worldX)
          ? building.worldX
          : Number(catalog?.defaultGrid?.x) || 0;
        const worldY = Number.isFinite(building.worldY)
          ? building.worldY
          : Number(catalog?.defaultGrid?.y) || 0;

        const anchor = footprintBottomCentre(
          worldX,
          worldY,
          definition.footprint.width,
          definition.footprint.height
        );

        const spriteSize = BUILDING_NATIVE_SIZE * definition.scale;
        const spriteAnchorX = anchor.x + offsetX + definition.offsetX;
        const spriteAnchorY = anchor.y + offsetY + definition.offsetY;
        const left = spriteAnchorX - spriteSize / 2;
        const top = spriteAnchorY - spriteSize;
        const zIndex = 5000 + Math.round(spriteAnchorY * 10);
        const status = building.status || "ready";
        const spriteAsset = buildingSpriteAsset(building, definition);
        const capacityVisual = buildingCapacityVisual(building, definition);

        return `
          <button
            class="terrain-building-object status-${status}"
            type="button"
            data-building-id="${building.id}"
            data-building-type="${building.type}"
            data-building-visual="${definition.visualName}"
            data-building-level="${definition.level}"
            data-footprint="${definition.footprint.width}x${definition.footprint.height}"
            ${capacityVisual ? `data-capacity-percent="${capacityVisual.percent.toFixed(2)}" data-capacity-band="${capacityVisual.band}" data-capacity-column="${capacityVisual.column}"` : ""}
            aria-label="${definition.visualName} level ${definition.level}"
            style="left:${left}px;top:${top}px;width:${spriteSize}px;height:${spriteSize}px;z-index:${zIndex};"
          >
            <img
              class="terrain-building-sprite"
              src="${spriteAsset}"
              alt=""
              draggable="false"
            />
          </button>
        `;
      })
      .join("");
  }

  function patchApprovedFootprints() {
    if (!Array.isArray(buildingCatalog)) return;

    const patches = {
      kennel: { footprintWidth: 2, footprintHeight: 2, groundAnchorX: 1, groundAnchorY: 2 },
      storage: {
        name: "Stick Storage",
        footprintWidth: 3,
        footprintHeight: 2,
        groundAnchorX: 1.5,
        groundAnchorY: 2
      },
      food: {
        name: "Kitchen",
        footprintWidth: 3,
        footprintHeight: 2,
        groundAnchorX: 1.5,
        groundAnchorY: 2
      }
    };

    Object.entries(patches).forEach(([type, patch]) => {
      const catalog = buildingCatalog.find((item) => item.type === type);
      if (catalog) Object.assign(catalog, patch);
    });
  }

  function renderWorld(force = false) {
    if (!els?.townMap) return;

    const area = currentArea();
    const width = els.townMap.clientWidth || 390;
    const height = els.townMap.clientHeight || 560;
    const signature = renderSignature(area, width, height);
    const existing = els.townMap.querySelector(".terrain-floor-world");

    if (!force && existing && signature === lastRenderSignature) return;

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
        aria-label="RescuePup terrain, fence and approved building sprites"
      >
        ${tileMarkup}
        ${buildingMarkup(offsetX, offsetY)}
      </div>
      <div class="map-status terrain-floor-status" aria-hidden="true">
        <span class="status-chip">32×32 terrain</span>
        <span class="status-chip">Autotile fence</span>
        <span class="status-chip">Capacity sprites</span>
      </div>
    `;

    lastRenderSignature = signature;
  }

  patchApprovedFootprints();

  // The new kennel artwork has six visual stages: starter + five upgrades.
  if (typeof kennelUpgradeStatus === "function") {
    const originalKennelUpgradeStatus = kennelUpgradeStatus;
    kennelUpgradeStatus = function sixStageKennelUpgradeStatus(building) {
      const level = Number(building?.level) || 1;
      if (level >= 6 && (!building?.status || building.status === "ready" || building.status === "complete")) {
        return { canUpgrade: false, reason: "Max level", upgrade: null };
      }
      return originalKennelUpgradeStatus(building);
    };
  }

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
    buildingSpriteDefinitions: BUILDING_SPRITE_DEFINITIONS,
    stickStorageSheet: STICK_STORAGE_SPRITE_SHEET,
    stickStorageCapacityBands: STICK_STORAGE_CAPACITY_BANDS,
    stickStorageCapacityPercent,
    stickStorageCapacityColumn,
    project: terrainIsoProject,
    point: terrainIsoPoint,
    footprintBottomCentre
  });

  window.RescuePupBuildingSprites = BUILDING_SPRITE_DEFINITIONS;

  renderMap = function renderApprovedWorld() {
    renderWorld(false);
  };

  primeStickStorageSpriteSheet();
  renderWorld(true);

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        renderWorld(true);
      });
    });
    observer.observe(els.townMap);
  }
})();
