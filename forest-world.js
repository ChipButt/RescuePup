"use strict";

/*
  Expanded RescuePup outer world.
  Logical world: 110 tiles beyond every current build-area edge (the previous
  10-tile terrain ring + another 100 tiles).

  The forest is deterministic for the whole logical world. For mobile runtime
  performance only the portion that can enter the bounded camera is painted:
  near trees are individual depth-sorted sprites, while the dense far forest is
  flattened onto a canvas backdrop. Dogs still use individual tree sprites as
  their harvest targets.
*/
(() => {
  const map = document.getElementById("town-map");
  if (!map) return;

  const WORLD_PADDING = 110;
  const RENDER_MARGIN = 34;
  const EXISTING_TERRAIN_PADDING = 10;
  const TREE_W = 64;
  const TREE_H = 80;
  const TREE_ASSETS = Object.freeze({
    tree5: "./Tree%205.png",
    tree6: "./Tree%206.png",
    tree5Dry: "./Tree%205%20Dry.png",
    tree6Dry: "./Tree%206%20Dry.png"
  });
  const GREEN_TREES = [TREE_ASSETS.tree5, TREE_ASSETS.tree6];
  const DRY_TREES = [TREE_ASSETS.tree5Dry, TREE_ASSETS.tree6Dry];

  const images = new Map();
  let grassImage = null;
  let renderToken = 0;

  function hash(value) {
    let h = 2166136261;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function areaNow() {
    return typeof currentArea === "function"
      ? currentArea()
      : { minX: 0, minY: 0, maxX: 12, maxY: 12, width: 12, height: 12 };
  }

  function worldBounds(a = areaNow()) {
    return {
      minX: a.minX - WORLD_PADDING,
      minY: a.minY - WORLD_PADDING,
      maxX: a.maxX + WORLD_PADDING,
      maxY: a.maxY + WORLD_PADDING,
      width: (a.maxX - a.minX) + WORLD_PADDING * 2,
      height: (a.maxY - a.minY) + WORLD_PADDING * 2
    };
  }

  function distanceOutside(x, y, a = areaNow()) {
    return Math.max(
      a.minX - x,
      x - (a.maxX - 1),
      a.minY - y,
      y - (a.maxY - 1),
      0
    );
  }

  function gateXs(a = areaNow()) {
    const first = a.minX + Math.floor((a.maxX - a.minX) / 2) - 1;
    return [first, first + 1];
  }

  function gateCorridor(x, y, a = areaNow()) {
    // Preserve a short clear approach through the approved two-tile south-west
    // fence opening so working dogs never visually tunnel through a tree.
    return y >= a.maxY && y <= a.maxY + 3 && gateXs(a).some((gx) => Math.abs(x - gx) <= 1);
  }

  function treeForCell(x, y, a = areaNow()) {
    const d = distanceOutside(x, y, a);
    if (d <= 0 || d > WORLD_PADDING || gateCorridor(x, y, a)) return null;

    const seed = hash(`${x}:${y}:${a.minX}:${a.minY}:${a.maxX}:${a.maxY}:forest-v1`);
    const roll = (seed % 10000) / 10000;
    // Sparse immediately outside the yard, steadily thickening through the
    // 10-tile transition, then becoming a dense forest toward the outer world.
    const density = d <= 10
      ? 0.06 + (d / 10) * 0.55
      : 0.84;
    if (roll >= density) return null;

    const dryChance = d <= 10
      ? 0.03 + 0.32 * (1 - ((d - 1) / 9))
      : 0.015;
    const dryRoll = ((seed >>> 8) % 10000) / 10000;
    const pool = dryRoll < dryChance ? DRY_TREES : GREEN_TREES;
    const asset = pool[(seed >>> 18) % pool.length];
    return {
      id: `tree-${x}-${y}`,
      x,
      y,
      distance: d,
      dry: pool === DRY_TREES,
      asset
    };
  }

  function placementOffset() {
    const tile = map.querySelector('.terrain-floor-tile[data-world-x][data-world-y]');
    if (!tile || !window.RescuePupTerrain) return null;
    const worldX = Number(tile.dataset.worldX);
    const worldY = Number(tile.dataset.worldY);
    const p = window.RescuePupTerrain.point(worldX + 0.5, worldY + 0.5);
    return {
      x: parseFloat(tile.style.left) - p.x,
      y: parseFloat(tile.style.top) - p.y
    };
  }

  function projected(x, y, offset) {
    const p = window.RescuePupTerrain
      ? window.RescuePupTerrain.point(x, y)
      : { x: (x - y) * 16, y: (x + y) * 8 };
    return { x: p.x + offset.x, y: p.y + offset.y };
  }

  function loadImage(src) {
    if (images.has(src)) return images.get(src);
    const promise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
    images.set(src, promise);
    return promise;
  }

  async function ensureAssets() {
    const entries = await Promise.all(Object.values(TREE_ASSETS).map(async (src) => [src, await loadImage(src)]));
    const treeImages = Object.fromEntries(entries);
    if (!grassImage) {
      grassImage = await new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = "./Bottom%20Grassland.png";
      });
    }
    return treeImages;
  }

  function visibleRange(a = areaNow()) {
    return {
      minX: a.minX - RENDER_MARGIN,
      minY: a.minY - RENDER_MARGIN,
      maxX: a.maxX + RENDER_MARGIN,
      maxY: a.maxY + RENDER_MARGIN
    };
  }

  function forestSignature(a) {
    return `${a.minX}:${a.minY}:${a.maxX}:${a.maxY}:forest-v1`;
  }

  async function renderForest() {
    const token = ++renderToken;
    const world = map.querySelector(".terrain-floor-world");
    const offset = placementOffset();
    if (!world || !offset || !window.RescuePupTerrain) return;

    const a = areaNow();
    const signature = forestSignature(a);
    if (world.dataset.forestSignature === signature && world.querySelector(".forest-tree-layer")) {
      replaceHarvestSources();
      return;
    }

    const treeImages = await ensureAssets();
    if (token !== renderToken || !world.isConnected) return;

    world.querySelectorAll(".forest-floor-extension,.forest-tree-layer,.forest-backdrop-canvas").forEach((node) => node.remove());

    const range = visibleRange(a);
    const positions = [];
    for (let y = range.minY; y < range.maxY; y += 1) {
      for (let x = range.minX; x < range.maxX; x += 1) {
        const p = projected(x + 0.5, y + 0.5, offset);
        positions.push({ x, y, p, depth: x + y });
      }
    }
    positions.sort((left, right) => left.depth - right.depth || left.y - right.y || left.x - right.x);

    const minScreenX = Math.floor(Math.min(...positions.map((v) => v.p.x)) - TREE_W - 20);
    const maxScreenX = Math.ceil(Math.max(...positions.map((v) => v.p.x)) + TREE_W + 20);
    const minScreenY = Math.floor(Math.min(...positions.map((v) => v.p.y)) - TREE_H - 20);
    const maxScreenY = Math.ceil(Math.max(...positions.map((v) => v.p.y)) + TREE_H + 20);
    const canvasWidth = Math.max(1, maxScreenX - minScreenX);
    const canvasHeight = Math.max(1, maxScreenY - minScreenY);

    // Extend the grass beyond the old 10-tile DOM terrain ring. Far outside
    // terrain is fully connected, so the standard connected grass cell is used.
    if (grassImage) {
      const floorCanvas = document.createElement("canvas");
      floorCanvas.className = "forest-floor-extension";
      floorCanvas.width = canvasWidth;
      floorCanvas.height = canvasHeight;
      floorCanvas.style.left = `${minScreenX}px`;
      floorCanvas.style.top = `${minScreenY}px`;
      const context = floorCanvas.getContext("2d");
      if (context) {
        context.imageSmoothingEnabled = false;
        for (const item of positions) {
          const d = distanceOutside(item.x, item.y, a);
          if (d <= EXISTING_TERRAIN_PADDING) continue;
          context.drawImage(
            grassImage,
            32, 32, 32, 32,
            Math.round(item.p.x - 16 - minScreenX),
            Math.round(item.p.y - 16 - minScreenY),
            32, 32
          );
        }
      }
      world.prepend(floorCanvas);
    }

    const farCanvas = document.createElement("canvas");
    farCanvas.className = "forest-backdrop-canvas";
    farCanvas.width = canvasWidth;
    farCanvas.height = canvasHeight;
    farCanvas.style.left = `${minScreenX}px`;
    farCanvas.style.top = `${minScreenY}px`;
    const farContext = farCanvas.getContext("2d");
    if (farContext) farContext.imageSmoothingEnabled = false;

    const nearLayer = document.createElement("div");
    nearLayer.className = "forest-tree-layer";
    const nearMarkup = [];

    for (const item of positions) {
      const tree = treeForCell(item.x, item.y, a);
      if (!tree) continue;
      const image = treeImages[tree.asset];
      if (tree.distance > 12) {
        if (farContext && image) {
          farContext.drawImage(
            image,
            Math.round(item.p.x - TREE_W / 2 - minScreenX),
            Math.round(item.p.y - TREE_H * 0.92 - minScreenY),
            TREE_W,
            TREE_H
          );
        }
        continue;
      }
      const zIndex = 5000 + Math.round(item.p.y * 10);
      nearMarkup.push(`<img class="forest-tree ${tree.dry ? "dry" : "green"}" src="${tree.asset}" alt="" draggable="false" data-tree-id="${tree.id}" data-world-x="${tree.x}" data-world-y="${tree.y}" style="left:${item.p.x}px;top:${item.p.y}px;z-index:${zIndex}">`);
    }

    nearLayer.innerHTML = nearMarkup.join("");
    world.appendChild(farCanvas);
    world.appendChild(nearLayer);
    world.dataset.forestSignature = signature;
    replaceHarvestSources();
  }

  function harvestTreeAsset(index) {
    // Harvest targets are mostly living trees with occasional dry trees in the
    // sparse near-yard band, matching the surrounding transition forest.
    if (index % 6 === 0) return DRY_TREES[(index >> 1) % DRY_TREES.length];
    return GREEN_TREES[index % GREEN_TREES.length];
  }

  function replaceHarvestSources() {
    const sources = [...map.querySelectorAll(".dog-worker-wood-source")];
    sources.forEach((source, index) => {
      const nextAsset = harvestTreeAsset(index);
      if (source.dataset.treeAsset !== nextAsset) {
        source.dataset.treeAsset = nextAsset;
        source.dataset.treeSource = "true";
        source.src = nextAsset;
      }
      const top = parseFloat(source.style.top) || 0;
      source.style.zIndex = String(5000 + Math.round(top * 10));
    });
  }

  function nearbyTreeSources(a = areaNow(), maxDistance = 10) {
    const list = [];
    for (let y = a.minY - maxDistance; y < a.maxY + maxDistance; y += 1) {
      for (let x = a.minX - maxDistance; x < a.maxX + maxDistance; x += 1) {
        const tree = treeForCell(x, y, a);
        if (tree && tree.distance <= maxDistance) list.push(tree);
      }
    }
    return list;
  }

  const observer = new MutationObserver(() => {
    requestAnimationFrame(() => {
      renderForest();
      replaceHarvestSources();
    });
  });
  observer.observe(map, { childList: true, subtree: true });

  if (typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(renderForest));
    resizeObserver.observe(map);
  }

  window.RescuePupForest = Object.freeze({
    worldPadding: WORLD_PADDING,
    renderMargin: RENDER_MARGIN,
    treeAssets: TREE_ASSETS,
    worldBounds,
    distanceOutside,
    treeForCell,
    nearbyTreeSources,
    refresh: renderForest
  });

  requestAnimationFrame(() => requestAnimationFrame(renderForest));
})();
