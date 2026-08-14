"use strict";

/*
  Pawborough authoritative world renderer.

  One source owns:
    - isometric world geometry and buildable/outside terrain;
    - the 110-tile logical world padding around the CURRENT yard;
    - fence placement and the two-tile gate;
    - forest placement/density;
    - final building footprint/scale/offset definitions.

  Terrain and forest are composed in one render pass after their assets are
  preloaded. There is no second "floor extension" layer and no seam patch.
*/
(() => {
  const map = document.getElementById("town-map");
  if (!map) return;

  const TILE_SIZE = 32;
  const STEP_X = 16;
  const STEP_Y = 8;
  const WORLD_PADDING = 110;
  const RENDER_PADDING = 48;
  const BUILDING_NATIVE_SIZE = 64;
  const OUTSIDE_SHEET = "./Bottom%20Grassland.png";
  const BUILDABLE_SHEET = "./Bottom%20Grassland%20Dry.png";
  const STICK_STORAGE_SHEET = "./Stick%20Storage%20Sprite%20Sheet.png";
  const STICK_STORAGE_CELL = 256;
  const TREE_WIDTH = 64;
  const TREE_HEIGHT = 80;
  const NEAR_TREE_MAX = 37;

  const TREE_RULES = Object.freeze({
    hardClearMax: 2,
    innerScatterMax: 9,
    greenBandMax: 25,
    denseTransitionMax: 35,
    gapBiasWidth: 1,
    gapDensityBonus: 0.015
  });

  const TREE_ASSETS = Object.freeze({
    tree5: "./Tree%205.png",
    tree6: "./Tree%206.png",
    tree5Dry: "./Tree%205%20Dry.png",
    tree6Dry: "./Tree%206%20Dry.png"
  });
  const GREEN_TREES = Object.freeze([TREE_ASSETS.tree5, TREE_ASSETS.tree6]);
  const DRY_TREES = Object.freeze([TREE_ASSETS.tree5Dry, TREE_ASSETS.tree6Dry]);
  const ALL_TREES = Object.freeze([...GREEN_TREES, ...DRY_TREES]);

  const FENCE = Object.freeze({
    r0c0: Object.freeze({ asset: "./fence_corner_N.png", offsetX: 0, offsetY: -13 }),
    r0c1: Object.freeze({ asset: "./fence_straight_NE.png", offsetX: 0, offsetY: -13 }),
    r0c2: Object.freeze({ asset: "./fence_corner_E.png", offsetX: 0, offsetY: -13 }),
    r1c0: Object.freeze({ asset: "./fence_straight_NW.png", offsetX: 0, offsetY: -13 }),
    r1c2: Object.freeze({ asset: "./fence_straight_SE.png", offsetX: 0, offsetY: -13 }),
    r2c0: Object.freeze({ asset: "./fence_corner_W.png", offsetX: 0, offsetY: -13 }),
    r2c1: Object.freeze({ asset: "./fence_straight_SW.png", offsetX: 0, offsetY: -13 }),
    r2c2: Object.freeze({ asset: "./fence_corner_S.png", offsetX: 0, offsetY: -13 })
  });

  function makeBuilding(prefix, width, height, values) {
    const levels = {};
    values.forEach(([scale, offsetX, offsetY], index) => {
      const level = index + 1;
      levels[String(level)] = {
        asset: `./${prefix}_lvl${level}.png`,
        scale,
        offsetX,
        offsetY
      };
    });
    return { footprint: { width, height }, levels };
  }

  // FINAL runtime values exported by the user's building scale designer.
  const BUILDINGS = {
    "Kennel": makeBuilding("kennel", 2, 2, [
      [0.85, -0.41, -6.7],
      [0.85, -0.4, -6.7],
      [0.85, -0.4, -6.7],
      [0.85, -0.4, -6.7],
      [0.85, -0.4, -6.7],
      [0.85, -0.4, -6.7]
    ]),
    "Stick Storage": makeBuilding("stick_storage", 3, 2, [
      [0.85, 0.25, -9.5],
      [0.85, 0.25, -9.5],
      [0.85, 0.25, -9.5],
      [0.85, -1.25, -9.44],
      [0.9, 0.25, -9.5],
      [0.95, -2.25, -9.5]
    ]),
    "Kitchen": makeBuilding("kitchen", 3, 2, [
      [0.65, -1.77, -12.02],
      [0.6, -0.58, -13.19],
      [0.52, -1.5, -12.78],
      [0.7, -1.02, -10.63],
      [0.64, -1.45, -10.58],
      [0.7, -0.98, -11.44]
    ]),
    "Crop Farm": makeBuilding("crop_farm", 3, 2, [
      [0.88, -1.04, -7.72],
      [0.968, -2.72, -10.08],
      [1.012, -3.95, -9.07],
      [1.232, -3.61, -6.59],
      [1.276, 0.24, -5.71],
      [1.32, 0.13, -4.36]
    ]),
    "Protein Farm": makeBuilding("protein_farm", 2, 2, [
      [0.704, -1.28, -3.3],
      [0.792, 0.86, -2.17],
      [0.836, -0.16, -1.03],
      [0.88, -2.06, 0.31],
      [0.88, -3.09, 1.02],
      [0.88, -1.1, 1.12]
    ])
  };

  const GAME_TO_VISUAL = Object.freeze({
    kennel: "Kennel",
    storage: "Stick Storage",
    food: "Kitchen",
    kitchen: "Kitchen",
    crop: "Crop Farm",
    crop_farm: "Crop Farm",
    protein: "Protein Farm",
    protein_farm: "Protein Farm"
  });

  const STORAGE_BANDS = Object.freeze([
    Object.freeze({ min: 0, max: 5, column: 0, label: "0-5%" }),
    Object.freeze({ min: 6, max: 35, column: 1, label: "6-35%" }),
    Object.freeze({ min: 36, max: 75, column: 2, label: "36-75%" }),
    Object.freeze({ min: 76, max: 100, column: 3, label: "76-100%" })
  ]);

  const loaded = new Map();
  const storageSprites = new Map();
  let assetsReady = false;
  let assetsPromise = null;
  let storageSheetStarted = false;
  let lastSignature = null;
  let renderToken = 0;
  let resizeFrame = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function point(worldX, worldY) {
    return {
      x: (worldX - worldY) * STEP_X,
      y: (worldX + worldY) * STEP_Y
    };
  }

  function project(worldX, worldY, offsetX = 0, offsetY = 0) {
    const p = point(worldX, worldY);
    return { x: p.x + offsetX, y: p.y + offsetY };
  }

  function buildArea() {
    return typeof currentArea === "function"
      ? currentArea()
      : { minX: 0, minY: 0, maxX: 12, maxY: 12, width: 12, height: 12 };
  }

  function worldBounds(area = buildArea()) {
    return {
      minX: area.minX - WORLD_PADDING,
      minY: area.minY - WORLD_PADDING,
      maxX: area.maxX + WORLD_PADDING,
      maxY: area.maxY + WORLD_PADDING,
      width: area.width + WORLD_PADDING * 2,
      height: area.height + WORLD_PADDING * 2
    };
  }

  function renderRange(area = buildArea()) {
    const world = worldBounds(area);
    return {
      minX: Math.max(world.minX, area.minX - RENDER_PADDING),
      minY: Math.max(world.minY, area.minY - RENDER_PADDING),
      maxX: Math.min(world.maxX, area.maxX + RENDER_PADDING),
      maxY: Math.min(world.maxY, area.maxY + RENDER_PADDING)
    };
  }

  function isBuildable(area, x, y) {
    return x >= area.minX && y >= area.minY && x < area.maxX && y < area.maxY;
  }

  function distanceOutside(x, y, area = buildArea()) {
    return Math.max(
      area.minX - x,
      x - (area.maxX - 1),
      area.minY - y,
      y - (area.maxY - 1),
      0
    );
  }

  function gateXs(area = buildArea()) {
    const first = area.minX + Math.floor(area.width / 2) - 1;
    return [first, first + 1];
  }

  function isFenceGapTile(area, x, y) {
    return y === area.maxY - 1 && gateXs(area).includes(x);
  }

  function nearFenceGap(x, y, area = buildArea()) {
    const distance = distanceOutside(x, y, area);
    if (distance < 3 || distance > TREE_RULES.innerScatterMax || y < area.maxY) return false;
    const xs = gateXs(area);
    const centreX = (xs[0] + xs[1]) / 2;
    return Math.abs(x - centreX) <= TREE_RULES.gapBiasWidth;
  }

  function densityForDistance(distance, gap = false) {
    if (distance <= TREE_RULES.hardClearMax) return 0;
    if (distance <= TREE_RULES.innerScatterMax) {
      const t = (distance - 3) / Math.max(1, TREE_RULES.innerScatterMax - 3);
      const base = 0.035 + t * 0.085;
      return Math.min(0.145, base + (gap ? TREE_RULES.gapDensityBonus : 0));
    }
    if (distance <= TREE_RULES.greenBandMax) {
      const t = (distance - 10) / Math.max(1, TREE_RULES.greenBandMax - 10);
      return 0.16 + clamp(t, 0, 1) * 0.36;
    }
    if (distance <= TREE_RULES.denseTransitionMax) {
      const t = (distance - 26) / Math.max(1, TREE_RULES.denseTransitionMax - 26);
      return 0.56 + clamp(t, 0, 1) * 0.24;
    }
    return 0.84;
  }

  function hash(value) {
    let h = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function treeForCell(x, y, area = buildArea()) {
    const distance = distanceOutside(x, y, area);
    if (distance <= TREE_RULES.hardClearMax || distance > WORLD_PADDING) return null;

    // Absolute-cell seed means yard expansion changes distance bands without
    // arbitrarily reshuffling every distant tree.
    const seed = hash(`${x}:${y}:pawborough-forest-v5`);
    if ((seed % 10000) / 10000 >= densityForDistance(distance, nearFenceGap(x, y, area))) {
      return null;
    }

    let pool;
    if (distance <= TREE_RULES.innerScatterMax) {
      pool = ALL_TREES;
    } else if (distance <= TREE_RULES.greenBandMax) {
      pool = GREEN_TREES;
    } else {
      const dryChance = distance <= TREE_RULES.denseTransitionMax ? 0.03 : 0.015;
      pool = ((seed >>> 8) % 10000) / 10000 < dryChance ? DRY_TREES : GREEN_TREES;
    }

    const asset = pool[(seed >>> 18) % pool.length];
    return {
      id: `tree-${x}-${y}`,
      x,
      y,
      distance,
      nearGap: nearFenceGap(x, y, area),
      dry: DRY_TREES.includes(asset),
      asset
    };
  }

  function nearbyTreeSources(area = buildArea(), maxDistance = TREE_RULES.greenBandMax) {
    const list = [];
    for (let y = area.minY - maxDistance; y < area.maxY + maxDistance; y += 1) {
      for (let x = area.minX - maxDistance; x < area.maxX + maxDistance; x += 1) {
        const tree = treeForCell(x, y, area);
        if (tree && tree.distance >= 3 && tree.distance <= maxDistance) list.push(tree);
      }
    }
    list.sort((a, b) =>
      a.distance - b.distance ||
      Number(b.nearGap) - Number(a.nearGap) ||
      a.y - b.y ||
      a.x - b.x
    );
    return list;
  }

  function pairVariant(firstConnected, secondConnected) {
    if (!firstConnected && secondConnected) return 0;
    if (firstConnected && secondConnected) return 1;
    if (firstConnected && !secondConnected) return 2;
    return 3;
  }

  function sameRegion(area, x, y, buildable) {
    return isBuildable(area, x, y) === buildable;
  }

  function autotile(area, x, y, buildable) {
    // Outside grass is logically continuous beyond the visible render range.
    // No render-boundary check is used here, so there can be no artificial seam.
    const north = sameRegion(area, x, y - 1, buildable);
    const east = sameRegion(area, x + 1, y, buildable);
    const south = sameRegion(area, x, y + 1, buildable);
    const west = sameRegion(area, x - 1, y, buildable);
    return { row: pairVariant(north, south), col: pairVariant(west, east) };
  }

  function loadImage(src) {
    if (loaded.has(src)) return loaded.get(src);
    const promise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
    loaded.set(src, promise);
    return promise;
  }

  function ensureAssets() {
    if (assetsPromise) return assetsPromise;
    const sources = [
      OUTSIDE_SHEET,
      BUILDABLE_SHEET,
      ...Object.values(TREE_ASSETS),
      ...Object.values(FENCE).map((entry) => entry.asset)
    ];
    assetsPromise = Promise.all(sources.map(async (src) => [src, await loadImage(src)]))
      .then((entries) => {
        assetsReady = true;
        return Object.fromEntries(entries);
      });
    return assetsPromise;
  }

  function buildOffset(area, width, height) {
    const centres = [];
    for (let y = area.minY; y < area.maxY; y += 1) {
      for (let x = area.minX; x < area.maxX; x += 1) {
        centres.push(point(x + 0.5, y + 0.5));
      }
    }
    const left = Math.min(...centres.map((p) => p.x - TILE_SIZE / 2));
    const right = Math.max(...centres.map((p) => p.x + TILE_SIZE / 2));
    const top = Math.min(...centres.map((p) => p.y - TILE_SIZE / 2));
    const bottom = Math.max(...centres.map((p) => p.y + TILE_SIZE / 2));
    return {
      x: width / 2 - (left + right) / 2,
      y: height / 2 - (top + bottom) / 2
    };
  }

  function storagePercent(building) {
    const direct = Number(building?.capacityPercent);
    if (Number.isFinite(direct)) return clamp(direct, 0, 100);
    const stored = Number(building?.storedUnits);
    const maximum = Number(building?.maxCapacity);
    if (Number.isFinite(stored) && Number.isFinite(maximum) && maximum > 0) {
      return clamp((stored / maximum) * 100, 0, 100);
    }
    return 0;
  }

  function storageColumn(percent) {
    if (percent <= 5) return 0;
    if (percent <= 35) return 1;
    if (percent <= 75) return 2;
    return 3;
  }

  function storageKey(level, column) {
    return `${level}:${column}`;
  }

  function primeStorageSheet() {
    if (storageSheetStarted) return;
    storageSheetStarted = true;
    loadImage(STICK_STORAGE_SHEET).then((sheet) => {
      if (!sheet) return;
      const canvas = document.createElement("canvas");
      canvas.width = STICK_STORAGE_CELL;
      canvas.height = STICK_STORAGE_CELL;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;

      for (let row = 0; row < 6; row += 1) {
        for (let column = 0; column < 4; column += 1) {
          context.clearRect(0, 0, STICK_STORAGE_CELL, STICK_STORAGE_CELL);
          context.drawImage(
            sheet,
            column * STICK_STORAGE_CELL,
            row * STICK_STORAGE_CELL,
            STICK_STORAGE_CELL,
            STICK_STORAGE_CELL,
            0,
            0,
            STICK_STORAGE_CELL,
            STICK_STORAGE_CELL
          );
          const imageData = context.getImageData(0, 0, STICK_STORAGE_CELL, STICK_STORAGE_CELL);
          const px = imageData.data;
          for (let i = 0; i < px.length; i += 4) {
            const red = px[i], green = px[i + 1], blue = px[i + 2];
            if (
              green >= 150 &&
              green >= red + 70 &&
              green >= blue + 60 &&
              red <= 120 &&
              blue <= 130
            ) {
              px[i] = 0;
              px[i + 1] = 0;
              px[i + 2] = 0;
              px[i + 3] = 0;
            }
          }
          context.putImageData(imageData, 0, 0);
          storageSprites.set(storageKey(row + 1, column), canvas.toDataURL("image/png"));
        }
      }
      refreshStorageSprites();
    });
  }

  function visualDefinition(building) {
    const visualName = GAME_TO_VISUAL[building?.type];
    const definition = BUILDINGS[visualName];
    if (!definition) return null;
    const level = clamp(Math.round(Number(building?.level) || 1), 1, 6);
    const levelDef = definition.levels[String(level)];
    return levelDef ? { visualName, level, footprint: definition.footprint, ...levelDef } : null;
  }

  function buildingAsset(building, definition) {
    if (definition.visualName !== "Stick Storage") return definition.asset;
    const column = storageColumn(storagePercent(building));
    return storageSprites.get(storageKey(definition.level, column)) || definition.asset;
  }

  function refreshStorageSprites() {
    for (const building of state?.buildings || []) {
      if (building.type !== "storage") continue;
      const definition = visualDefinition(building);
      if (!definition) continue;
      const node = map.querySelector(`.terrain-building-object[data-building-id="${building.id}"] .terrain-building-sprite`);
      if (node) node.src = buildingAsset(building, definition);
    }
  }

  function footprintBottomCentre(worldX, worldY, width, height) {
    const origin = point(worldX, worldY);
    return {
      x: origin.x + ((width - height) * STEP_X) / 2,
      y: origin.y + (width + height) * STEP_Y
    };
  }

  function supportedBuildings() {
    if (!Array.isArray(state?.buildings)) return [];
    return state.buildings
      .map((building) => {
        const definition = visualDefinition(building);
        return definition ? { building, definition } : null;
      })
      .filter(Boolean);
  }

  function buildingSignature() {
    return supportedBuildings().map(({ building, definition }) => [
      building.id,
      building.type,
      definition.level,
      building.status || "ready",
      building.worldX,
      building.worldY,
      definition.scale,
      definition.offsetX,
      definition.offsetY,
      definition.visualName === "Stick Storage" ? storageColumn(storagePercent(building)) : ""
    ].join(",")).join("|");
  }

  function signature(area, width, height) {
    return [
      area.minX, area.minY, area.maxX, area.maxY,
      Math.round(width), Math.round(height),
      "world-renderer-v1",
      buildingSignature()
    ].join(":");
  }

  function buildableAnchors(area, offset) {
    const out = [];
    for (let y = area.minY; y < area.maxY; y += 1) {
      for (let x = area.minX; x < area.maxX; x += 1) {
        const p = point(x + 0.5, y + 0.5);
        const variant = autotile(area, x, y, true);
        out.push(
          `<span class="terrain-floor-tile buildable-floor-tile terrain-floor-anchor" ` +
          `aria-hidden="true" data-world-x="${x}" data-world-y="${y}" data-buildable="true" ` +
          `data-tile-id="r${variant.row}c${variant.col}" data-tile-row="${variant.row}" data-tile-col="${variant.col}" ` +
          `style="left:${p.x + offset.x}px;top:${p.y + offset.y}px;background-image:none;opacity:0;z-index:2"></span>`
        );
      }
    }
    return out.join("");
  }

  function fenceMarkup(area, offset) {
    const rows = [];
    let order = 0;
    for (let y = area.minY; y < area.maxY; y += 1) {
      for (let x = area.minX; x < area.maxX; x += 1) {
        if (isFenceGapTile(area, x, y)) continue;
        const variant = autotile(area, x, y, true);
        const tileId = `r${variant.row}c${variant.col}`;
        const fence = FENCE[tileId];
        if (!fence) continue;
        const p = point(x + 0.5, y + 0.5);
        rows.push(
          `<img class="terrain-fence-piece" src="${fence.asset}" alt="" draggable="false" ` +
          `data-fence-for-tile="${tileId}" data-world-x="${x}" data-world-y="${y}" ` +
          `style="left:${p.x + offset.x - TILE_SIZE / 2 + fence.offsetX}px;` +
          `top:${p.y + offset.y - TILE_SIZE / 2 + fence.offsetY}px;z-index:${50 + order}">`
        );
        order += 1;
      }
    }
    return rows.join("");
  }

  function buildingsMarkup(offset) {
    return supportedBuildings().map(({ building, definition }) => {
      const catalog = typeof getCatalog === "function" ? getCatalog(building.type) : null;
      const worldX = Number.isFinite(building.worldX) ? building.worldX : Number(catalog?.defaultGrid?.x) || 0;
      const worldY = Number.isFinite(building.worldY) ? building.worldY : Number(catalog?.defaultGrid?.y) || 0;
      const anchor = footprintBottomCentre(
        worldX,
        worldY,
        definition.footprint.width,
        definition.footprint.height
      );
      const size = BUILDING_NATIVE_SIZE * definition.scale;
      const anchorX = anchor.x + offset.x + definition.offsetX;
      const anchorY = anchor.y + offset.y + definition.offsetY;
      const left = anchorX - size / 2;
      const top = anchorY - size;
      const z = 5000 + Math.round(anchorY * 10);
      const status = building.status || "ready";
      const asset = buildingAsset(building, definition);
      const capacity = definition.visualName === "Stick Storage" ? storagePercent(building) : null;

      return `
        <button class="terrain-building-object status-${status}" type="button"
          data-building-id="${building.id}" data-building-type="${building.type}"
          data-building-visual="${definition.visualName}" data-building-level="${definition.level}"
          data-footprint="${definition.footprint.width}x${definition.footprint.height}"
          ${capacity === null ? "" : `data-capacity-percent="${capacity.toFixed(2)}" data-capacity-column="${storageColumn(capacity)}"`}
          aria-label="${definition.visualName} level ${definition.level}"
          style="left:${left}px;top:${top}px;width:${size}px;height:${size}px;z-index:${z}">
          <img class="terrain-building-sprite" src="${asset}" alt="" draggable="false">
        </button>`;
    }).join("");
  }

  function nearTreesMarkup(trees, offset) {
    return trees.map((tree) => {
      const p = point(tree.x + 0.5, tree.y + 0.5);
      const screenX = p.x + offset.x;
      const screenY = p.y + offset.y;
      return `<img class="forest-tree ${tree.dry ? "dry" : "green"}" src="${tree.asset}" alt="" draggable="false" ` +
        `data-tree-id="${tree.id}" data-world-x="${tree.x}" data-world-y="${tree.y}" data-tree-distance="${tree.distance}" ` +
        `style="left:${screenX}px;top:${screenY}px;z-index:${5000 + Math.round(screenY * 10)}">`;
    }).join("");
  }

  function drawUnifiedCanvas(area, range, offset, assets) {
    const cells = [];
    for (let y = range.minY; y < range.maxY; y += 1) {
      for (let x = range.minX; x < range.maxX; x += 1) {
        const p = point(x + 0.5, y + 0.5);
        cells.push({ x, y, p, depth: x + y });
      }
    }
    cells.sort((a, b) => a.depth - b.depth || a.y - b.y || a.x - b.x);

    const projected = cells.map((cell) => ({
      ...cell,
      screenX: cell.p.x + offset.x,
      screenY: cell.p.y + offset.y
    }));

    const left = Math.floor(Math.min(...projected.map((c) => c.screenX)) - TREE_WIDTH);
    const right = Math.ceil(Math.max(...projected.map((c) => c.screenX)) + TREE_WIDTH);
    const top = Math.floor(Math.min(...projected.map((c) => c.screenY)) - TREE_HEIGHT);
    const bottom = Math.ceil(Math.max(...projected.map((c) => c.screenY)) + TILE_SIZE);
    const canvas = document.createElement("canvas");
    canvas.className = "terrain-world-canvas";
    canvas.width = Math.max(1, right - left);
    canvas.height = Math.max(1, bottom - top);
    canvas.style.left = `${left}px`;
    canvas.style.top = `${top}px`;

    const context = canvas.getContext("2d");
    if (!context) return { canvas, nearTrees: [] };
    context.imageSmoothingEnabled = false;

    // The full visible ground — original yard surroundings and expansion — is
    // drawn on this ONE canvas in one depth-sorted pass.
    for (const cell of projected) {
      const buildable = isBuildable(area, cell.x, cell.y);
      const variant = autotile(area, cell.x, cell.y, buildable);
      const sheet = buildable ? assets[BUILDABLE_SHEET] : assets[OUTSIDE_SHEET];
      if (!sheet) continue;
      context.drawImage(
        sheet,
        variant.col * TILE_SIZE,
        variant.row * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE,
        Math.round(cell.screenX - TILE_SIZE / 2 - left),
        Math.round(cell.screenY - TILE_SIZE / 2 - top),
        TILE_SIZE,
        TILE_SIZE
      );
    }

    const nearTrees = [];
    const farTrees = [];
    for (const cell of projected) {
      const tree = treeForCell(cell.x, cell.y, area);
      if (!tree) continue;
      if (tree.distance <= NEAR_TREE_MAX) nearTrees.push(tree);
      else farTrees.push({ tree, screenX: cell.screenX, screenY: cell.screenY });
    }

    farTrees.sort((a, b) => a.screenY - b.screenY || a.tree.x + a.tree.y - (b.tree.x + b.tree.y));
    for (const item of farTrees) {
      const image = assets[item.tree.asset];
      if (!image) continue;
      context.drawImage(
        image,
        Math.round(item.screenX - TREE_WIDTH / 2 - left),
        Math.round(item.screenY - TREE_HEIGHT * 0.92 - top),
        TREE_WIDTH,
        TREE_HEIGHT
      );
    }

    return { canvas, nearTrees };
  }

  function patchCatalogFootprints() {
    if (!Array.isArray(buildingCatalog)) return;
    const patches = {
      kennel: { footprintWidth: 2, footprintHeight: 2, groundAnchorX: 1, groundAnchorY: 2 },
      storage: { name: "Stick Storage", footprintWidth: 3, footprintHeight: 2, groundAnchorX: 1.5, groundAnchorY: 2 },
      food: { name: "Kitchen", footprintWidth: 3, footprintHeight: 2, groundAnchorX: 1.5, groundAnchorY: 2 },
      crop_farm: { name: "Crop Farm", footprintWidth: 3, footprintHeight: 2, groundAnchorX: 1.5, groundAnchorY: 2 },
      protein_farm: { name: "Protein Farm", footprintWidth: 2, footprintHeight: 2, groundAnchorX: 1, groundAnchorY: 2 }
    };
    Object.entries(patches).forEach(([type, patch]) => {
      const catalog = buildingCatalog.find((item) => item.type === type);
      if (catalog) Object.assign(catalog, patch);
    });
  }

  function syncLegacyWorkerTreeGraphics() {
    // The worker module is a separate gameplay system. Its legacy source nodes
    // are visually converted to the approved tree assets so there is no second
    // "wood source" art system.
    const sources = [...map.querySelectorAll(".dog-worker-wood-source")];
    sources.forEach((source, index) => {
      const asset = ALL_TREES[index % ALL_TREES.length];
      source.src = asset;
      source.dataset.treeSource = "true";
    });
  }

  function renderNow(force = false, assets) {
    const area = buildArea();
    const width = map.clientWidth || 390;
    const height = map.clientHeight || 560;
    const nextSignature = signature(area, width, height);
    const existing = map.querySelector(".terrain-floor-world");
    if (!force && existing && nextSignature === lastSignature) {
      syncLegacyWorkerTreeGraphics();
      return;
    }

    const offset = buildOffset(area, width, height);
    const range = renderRange(area);
    const { canvas, nearTrees } = drawUnifiedCanvas(area, range, offset, assets);

    const world = document.createElement("div");
    world.className = "terrain-floor-world";
    world.dataset.floorSignature = nextSignature;
    world.dataset.worldReady = "true";
    world.dataset.tileSize = String(TILE_SIZE);
    world.dataset.stepX = String(STEP_X);
    world.dataset.stepY = String(STEP_Y);
    world.dataset.worldPadding = String(WORLD_PADDING);
    world.appendChild(canvas);

    const helper = document.createElement("div");
    helper.className = "terrain-anchor-layer";
    helper.innerHTML = buildableAnchors(area, offset);
    world.appendChild(helper);

    const fences = document.createElement("div");
    fences.className = "terrain-fence-layer";
    fences.innerHTML = fenceMarkup(area, offset);
    world.appendChild(fences);

    const treeLayer = document.createElement("div");
    treeLayer.className = "forest-tree-layer";
    treeLayer.innerHTML = nearTreesMarkup(nearTrees, offset);
    world.appendChild(treeLayer);

    const buildingLayer = document.createElement("div");
    buildingLayer.className = "terrain-building-layer";
    buildingLayer.innerHTML = buildingsMarkup(offset);
    world.appendChild(buildingLayer);

    map.className = "town-map layout-grid-mode terrain-floor-mode";
    map.replaceChildren(world);

    lastSignature = nextSignature;
    syncLegacyWorkerTreeGraphics();
    window.dispatchEvent(new CustomEvent("rescuepup:world-rendered", {
      detail: { area: { ...area }, world: worldBounds(area) }
    }));
  }

  function requestRender(force = false) {
    const token = ++renderToken;
    if (assetsReady) {
      ensureAssets().then((assets) => {
        if (token !== renderToken) return;
        renderNow(force, assets);
      });
      return;
    }
    ensureAssets().then((assets) => {
      if (token !== renderToken) return;
      renderNow(true, assets);
    });
  }

  patchCatalogFootprints();

  if (typeof kennelUpgradeStatus === "function") {
    const original = kennelUpgradeStatus;
    kennelUpgradeStatus = function sixStageKennelUpgradeStatus(building) {
      const level = Number(building?.level) || 1;
      if (level >= 6 && (!building?.status || building.status === "ready" || building.status === "complete")) {
        return { canUpgrade: false, reason: "Max level", upgrade: null };
      }
      return original(building);
    };
  }

  layoutIsoPoint = point;
  layoutIsoProject = project;

  window.RescuePupTerrain = Object.freeze({
    tileSize: TILE_SIZE,
    stepX: STEP_X,
    stepY: STEP_Y,
    worldPadding: WORLD_PADDING,
    renderPadding: RENDER_PADDING,
    outsideSheet: OUTSIDE_SHEET,
    buildableSheet: BUILDABLE_SHEET,
    fenceDefinitions: FENCE,
    buildingSpriteDefinitions: BUILDINGS,
    point,
    project,
    footprintBottomCentre,
    worldBounds,
    renderRange,
    refresh: () => requestRender(true)
  });

  window.RescuePupForest = Object.freeze({
    treeAssets: TREE_ASSETS,
    rules: TREE_RULES,
    distanceOutside,
    gateXs,
    nearFenceGap,
    densityForDistance,
    treeForCell,
    nearbyTreeSources,
    worldBounds,
    refresh: () => requestRender(true)
  });

  window.RescuePupBuildingSprites = BUILDINGS;
  window.RescuePupWorldScale = Object.freeze({
    dogDisplayPixels: 32,
    buildingVisualMultiplier: 1,
    scaleMode: "final-runtime-scale-no-global-multiplier",
    footprintsChanged: false,
    offsetsFromFinalLayout: true
  });

  renderMap = function renderAuthoritativeWorld() {
    requestRender(false);
  };

  primeStorageSheet();
  requestRender(true);

  // Worker sprites are a separate gameplay module, but their collection-source
  // artwork is normalized here so the world renderer remains the only owner of
  // tree art.
  new MutationObserver(() => queueMicrotask(syncLegacyWorkerTreeGraphics))
    .observe(map, { childList: true, subtree: true });

  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(() => {
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        requestRender(true);
      });
    });
    observer.observe(map);
  }
})();
