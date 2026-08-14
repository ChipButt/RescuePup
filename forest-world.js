"use strict";

/*
  RescuePup expanded outer world.

  Geometry:
    - the logical outer world is always 110 tiles beyond the CURRENT buildable
      boundary;
    - each yard upgrade expands the buildable area by 2 tiles on every side,
      so the outer world moves outward by the same 2 tiles on every side;
    - all tree distances are measured from currentArea(), so the bands rebuild
      at the same distances from the new fence after every expansion.

  Tree placement rules:
    - distance 0-2: completely clear;
    - distance 3-9: occasional trees using any of the four tree assets;
      a small, narrow bias keeps a few trees reasonably close to the fence gap;
    - distance 10-25: green Tree 5 / Tree 6 only, becoming denser outward;
    - distance 26-35: transition into dense outer forest;
    - distance 36+: dense outer forest, overwhelmingly green with occasional dry trees.
*/
(() => {
  const map = document.getElementById("town-map");
  if (!map) return;

  const WORLD_PADDING = 110;
  const WORLD_EXPANSION_PER_YARD_LEVEL = 2;
  const HARD_CLEAR_TILES = 2;
  const INNER_SCATTER_MAX = 9;
  const GREEN_BAND_MAX = 25;
  const DENSE_TRANSITION_MAX = 35;
  const RENDER_MARGIN = 48;
  const EXISTING_TERRAIN_PADDING = 10;
  const TREE_W = 64;
  const TREE_H = 80;

  const TREE_ASSETS = Object.freeze({ tree5: "./Tree%205.png", tree6: "./Tree%206.png", tree5Dry: "./Tree%205%20Dry.png", tree6Dry: "./Tree%206%20Dry.png" });
  const GREEN_TREES = Object.freeze([TREE_ASSETS.tree5, TREE_ASSETS.tree6]);
  const DRY_TREES = Object.freeze([TREE_ASSETS.tree5Dry, TREE_ASSETS.tree6Dry]);
  const ALL_TREES = Object.freeze([...GREEN_TREES, ...DRY_TREES]);
  const images = new Map();
  let grassImage = null;
  let renderToken = 0;

  function hash(value) { let h = 2166136261; const text = String(value); for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function areaNow() { return typeof currentArea === "function" ? currentArea() : { minX: 0, minY: 0, maxX: 12, maxY: 12, width: 12, height: 12 }; }
  function worldBounds(a = areaNow()) { return { minX: a.minX - WORLD_PADDING, minY: a.minY - WORLD_PADDING, maxX: a.maxX + WORLD_PADDING, maxY: a.maxY + WORLD_PADDING, width: (a.maxX - a.minX) + WORLD_PADDING * 2, height: (a.maxY - a.minY) + WORLD_PADDING * 2 }; }
  function distanceOutside(x, y, a = areaNow()) { return Math.max(a.minX - x, x - (a.maxX - 1), a.minY - y, y - (a.maxY - 1), 0); }
  function gateXs(a = areaNow()) { const first = a.minX + Math.floor((a.maxX - a.minX) / 2) - 1; return [first, first + 1]; }
  function nearFenceGap(x, y, a = areaNow()) { const distance = distanceOutside(x, y, a); if (distance < 3 || distance > 9 || y < a.maxY) return false; const xs = gateXs(a); const centreX = (xs[0] + xs[1]) / 2; return Math.abs(x - centreX) <= 2; }

  function densityForDistance(distance, nearGap = false) {
    if (distance <= HARD_CLEAR_TILES) return 0;
    if (distance <= INNER_SCATTER_MAX) { const t = (distance - 3) / Math.max(1, INNER_SCATTER_MAX - 3); const base = 0.04 + t * 0.10; return Math.min(0.19, base + (nearGap ? 0.03 : 0)); }
    if (distance <= GREEN_BAND_MAX) { const t = (distance - 10) / Math.max(1, GREEN_BAND_MAX - 10); return 0.16 + Math.max(0, Math.min(1, t)) * 0.36; }
    if (distance <= DENSE_TRANSITION_MAX) { const t = (distance - 26) / Math.max(1, DENSE_TRANSITION_MAX - 26); return 0.56 + Math.max(0, Math.min(1, t)) * 0.24; }
    return 0.84;
  }

  function treePoolForDistance(distance) { if (distance >= 3 && distance <= INNER_SCATTER_MAX) return ALL_TREES; if (distance >= 10 && distance <= GREEN_BAND_MAX) return GREEN_TREES; return null; }

  function treeForCell(x, y, a = areaNow()) {
    const distance = distanceOutside(x, y, a); if (distance <= HARD_CLEAR_TILES || distance > WORLD_PADDING) return null;
    const seed = hash(`${x}:${y}:${a.minX}:${a.minY}:${a.maxX}:${a.maxY}:forest-v4-gap-reduced`); const roll = (seed % 10000) / 10000; const isNearGap = nearFenceGap(x, y, a); const density = densityForDistance(distance, isNearGap); if (roll >= density) return null;
    let pool = treePoolForDistance(distance); let dry = false;
    if (!pool) { const dryChance = distance <= DENSE_TRANSITION_MAX ? 0.03 : 0.015; const dryRoll = ((seed >>> 8) % 10000) / 10000; dry = dryRoll < dryChance; pool = dry ? DRY_TREES : GREEN_TREES; }
    else if (pool === ALL_TREES) { const asset = pool[(seed >>> 18) % pool.length]; dry = DRY_TREES.includes(asset); return { id: `tree-${x}-${y}`, x, y, distance, nearGap: isNearGap, dry, asset }; }
    const asset = pool[(seed >>> 18) % pool.length]; return { id: `tree-${x}-${y}`, x, y, distance, nearGap: isNearGap, dry, asset };
  }

  function placementOffset() { const tile = map.querySelector('.terrain-floor-tile[data-world-x][data-world-y]'); if (!tile || !window.RescuePupTerrain) return null; const worldX = Number(tile.dataset.worldX); const worldY = Number(tile.dataset.worldY); const p = window.RescuePupTerrain.point(worldX + 0.5, worldY + 0.5); return { x: parseFloat(tile.style.left) - p.x, y: parseFloat(tile.style.top) - p.y }; }
  function projected(x, y, offset) { const p = window.RescuePupTerrain ? window.RescuePupTerrain.point(x, y) : { x: (x - y) * 16, y: (x + y) * 8 }; return { x: p.x + offset.x, y: p.y + offset.y }; }
  function loadImage(src) { if (images.has(src)) return images.get(src); const promise = new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = src; }); images.set(src, promise); return promise; }
  async function ensureAssets() { const entries = await Promise.all(Object.values(TREE_ASSETS).map(async (src) => [src, await loadImage(src)])); const treeImages = Object.fromEntries(entries); if (!grassImage) { grassImage = await new Promise((resolve) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = "./Bottom%20Grassland.png"; }); } return treeImages; }
  function visibleRange(a = areaNow()) { return { minX: a.minX - RENDER_MARGIN, minY: a.minY - RENDER_MARGIN, maxX: a.maxX + RENDER_MARGIN, maxY: a.maxY + RENDER_MARGIN }; }
  function forestSignature(a) { return `${a.minX}:${a.minY}:${a.maxX}:${a.maxY}:forest-v4-gap-reduced`; }

  async function renderForest() {
    const token = ++renderToken; const world = map.querySelector(".terrain-floor-world"); const offset = placementOffset(); if (!world || !offset || !window.RescuePupTerrain) return;
    const a = areaNow(); const signature = forestSignature(a); if (world.dataset.forestSignature === signature && world.querySelector(".forest-tree-layer")) { suppressLegacyWoodSourceGraphics(); return; }
    const treeImages = await ensureAssets(); if (token !== renderToken || !world.isConnected) return;
    world.querySelectorAll(".forest-floor-extension,.forest-tree-layer,.forest-backdrop-canvas").forEach((node) => node.remove());
    const range = visibleRange(a); const positions = [];
    for (let y = range.minY; y < range.maxY; y += 1) for (let x = range.minX; x < range.maxX; x += 1) { const p = projected(x + 0.5, y + 0.5, offset); positions.push({ x, y, p, depth: x + y }); }
    positions.sort((left, right) => left.depth - right.depth || left.y - right.y || left.x - right.x);
    const minScreenX = Math.floor(Math.min(...positions.map((v) => v.p.x)) - TREE_W - 20); const maxScreenX = Math.ceil(Math.max(...positions.map((v) => v.p.x)) + TREE_W + 20); const minScreenY = Math.floor(Math.min(...positions.map((v) => v.p.y)) - TREE_H - 20); const maxScreenY = Math.ceil(Math.max(...positions.map((v) => v.p.y)) + TREE_H + 20); const canvasWidth = Math.max(1, maxScreenX - minScreenX); const canvasHeight = Math.max(1, maxScreenY - minScreenY);
    if (grassImage) { const floorCanvas = document.createElement("canvas"); floorCanvas.className = "forest-floor-extension"; floorCanvas.width = canvasWidth; floorCanvas.height = canvasHeight; floorCanvas.style.left = `${minScreenX}px`; floorCanvas.style.top = `${minScreenY}px`; const context = floorCanvas.getContext("2d"); if (context) { context.imageSmoothingEnabled = false; for (const item of positions) { const distance = distanceOutside(item.x, item.y, a); if (distance <= EXISTING_TERRAIN_PADDING) continue; context.drawImage(grassImage, 32, 32, 32, 32, Math.round(item.p.x - 16 - minScreenX), Math.round(item.p.y - 16 - minScreenY), 32, 32); } } world.prepend(floorCanvas); }
    const farCanvas = document.createElement("canvas"); farCanvas.className = "forest-backdrop-canvas"; farCanvas.width = canvasWidth; farCanvas.height = canvasHeight; farCanvas.style.left = `${minScreenX}px`; farCanvas.style.top = `${minScreenY}px`; const farContext = farCanvas.getContext("2d"); if (farContext) farContext.imageSmoothingEnabled = false;
    const nearLayer = document.createElement("div"); nearLayer.className = "forest-tree-layer"; const nearMarkup = [];
    for (const item of positions) { const tree = treeForCell(item.x, item.y, a); if (!tree) continue; const image = treeImages[tree.asset]; if (tree.distance > GREEN_BAND_MAX + 12) { if (farContext && image) farContext.drawImage(image, Math.round(item.p.x - TREE_W / 2 - minScreenX), Math.round(item.p.y - TREE_H * 0.92 - minScreenY), TREE_W, TREE_H); continue; } const zIndex = 5000 + Math.round(item.p.y * 10); nearMarkup.push(`<img class="forest-tree ${tree.dry ? "dry" : "green"}" src="${tree.asset}" alt="" draggable="false" data-tree-id="${tree.id}" data-world-x="${tree.x}" data-world-y="${tree.y}" data-tree-distance="${tree.distance}" style="left:${item.p.x}px;top:${item.p.y}px;z-index:${zIndex}">`); }
    nearLayer.innerHTML = nearMarkup.join(""); world.appendChild(farCanvas); world.appendChild(nearLayer); world.dataset.forestSignature = signature; suppressLegacyWoodSourceGraphics(); window.dispatchEvent(new CustomEvent("rescuepup:forest-updated", { detail: { area: { ...a }, worldBounds: worldBounds(a) } }));
  }

  function suppressLegacyWoodSourceGraphics() { map.querySelectorAll(".dog-worker-wood-source").forEach((source) => { source.style.display = "none"; }); }
  function nearbyTreeSources(a = areaNow(), maxDistance = GREEN_BAND_MAX) { const list = []; for (let y = a.minY - maxDistance; y < a.maxY + maxDistance; y += 1) for (let x = a.minX - maxDistance; x < a.maxX + maxDistance; x += 1) { const tree = treeForCell(x, y, a); if (tree && tree.distance >= 3 && tree.distance <= maxDistance) list.push(tree); } list.sort((left, right) => left.distance - right.distance || Number(right.nearGap) - Number(left.nearGap) || left.y - right.y || left.x - right.x); return list; }

  const observer = new MutationObserver(() => { requestAnimationFrame(() => { renderForest(); suppressLegacyWoodSourceGraphics(); }); }); observer.observe(map, { childList: true, subtree: true });
  if (typeof ResizeObserver !== "undefined") { const resizeObserver = new ResizeObserver(() => requestAnimationFrame(renderForest)); resizeObserver.observe(map); }

  window.RescuePupForest = Object.freeze({ worldPadding: WORLD_PADDING, worldExpansionPerYardLevel: WORLD_EXPANSION_PER_YARD_LEVEL, hardClearTiles: HARD_CLEAR_TILES, innerScatterMax: INNER_SCATTER_MAX, greenBandMax: GREEN_BAND_MAX, denseTransitionMax: DENSE_TRANSITION_MAX, renderMargin: RENDER_MARGIN, treeAssets: TREE_ASSETS, worldBounds, distanceOutside, gateXs, nearFenceGap, densityForDistance, treeForCell, nearbyTreeSources, refresh: renderForest });
  requestAnimationFrame(() => requestAnimationFrame(renderForest));
})();
