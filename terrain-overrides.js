"use strict";

// RescuePup terrain/art override.
// Uses the exact user-supplied root assets without regenerating or redrawing them.
(() => {
  const BUILDABLE_TILE = "./tile_040.png";
  const OUTSIDE_TILES = ["./tile_037.png", "./tile_038.png", "./tile_039.png"];
  const WOOD_SOURCE_TILES = [
    "./tile_048.png",
    "./tile_049.png",
    "./tile_050.png",
    "./tile_051.png",
    "./tile_052.png"
  ];
  const WOLF_IDLE_SHEET = "./wolf/no shadow & effects/wolf-idle.png";
  const OUTSIDE_CLEARANCE_TILES = 3;
  const WOOD_SOURCE_COUNT = 20;

  function stableHash(x, y, salt = 0) {
    let value = Math.imul((x | 0) ^ 0x45d9f3b, 0x27d4eb2d);
    value ^= Math.imul((y | 0) ^ 0x119de1f3, 0x165667b1);
    value ^= Math.imul((salt | 0) ^ 0x6d2b79f5, 0x1b873593);
    value ^= value >>> 15;
    value = Math.imul(value, 0x85ebca6b);
    value ^= value >>> 13;
    return value >>> 0;
  }

  function pickByHash(items, x, y, salt = 0) {
    return items[stableHash(x, y, salt) % items.length];
  }

  function isBuildableCell(area, worldX, worldY) {
    return (
      worldX >= area.minX &&
      worldY >= area.minY &&
      worldX < area.maxX &&
      worldY < area.maxY
    );
  }

  // A source can only appear once there are at least three complete outside
  // terrain cells between it and every edge of the buildable rectangle.
  function isFarEnoughFromBuildBoundary(area, worldX, worldY) {
    const insideThreeTileBuffer =
      worldX >= area.minX - OUTSIDE_CLEARANCE_TILES &&
      worldX < area.maxX + OUTSIDE_CLEARANCE_TILES &&
      worldY >= area.minY - OUTSIDE_CLEARANCE_TILES &&
      worldY < area.maxY + OUTSIDE_CLEARANCE_TILES;
    return !insideThreeTileBuffer;
  }

  function layoutFrame(area) {
    const width = els.townMap.clientWidth || 390;
    const height = els.townMap.clientHeight || 560;
    const minX = area.minX - LAYOUT_GRID_PADDING;
    const minY = area.minY - LAYOUT_GRID_PADDING;
    const maxX = area.maxX + LAYOUT_GRID_PADDING;
    const maxY = area.maxY + LAYOUT_GRID_PADDING;
    const columns = maxX - minX;
    const rows = maxY - minY;
    const gridBounds = layoutIsoBounds(minX, minY, maxX, maxY);
    const offsetX = width / 2 - (gridBounds.left + gridBounds.width / 2);
    const offsetY = height / 2 - (gridBounds.top + gridBounds.height / 2);
    return { width, height, minX, minY, maxX, maxY, columns, rows, offsetX, offsetY };
  }

  function applyGroundTiles(grid, area, frame) {
    const cells = [...grid.querySelectorAll(".layout-cell")];
    cells.forEach((cell, index) => {
      const worldX = frame.minX + (index % frame.columns);
      const worldY = frame.minY + Math.floor(index / frame.columns);
      const inBuildArea = isBuildableCell(area, worldX, worldY);
      const tile = inBuildArea
        ? BUILDABLE_TILE
        : pickByHash(OUTSIDE_TILES, worldX, worldY, 37);

      cell.style.setProperty("--terrain-tile", `url("${tile}")`);
      cell.dataset.terrainTile = tile.replace("./", "");
      cell.dataset.terrainWorldX = String(worldX);
      cell.dataset.terrainWorldY = String(worldY);
    });
  }

  function woodSourceCandidates(area, frame) {
    const candidates = [];
    for (let worldY = frame.minY; worldY < frame.maxY; worldY += 1) {
      for (let worldX = frame.minX; worldX < frame.maxX; worldX += 1) {
        if (isBuildableCell(area, worldX, worldY)) continue;
        if (!isFarEnoughFromBuildBoundary(area, worldX, worldY)) continue;
        candidates.push({
          worldX,
          worldY,
          score: stableHash(worldX, worldY, 48052)
        });
      }
    }
    candidates.sort((a, b) => a.score - b.score);
    return candidates;
  }

  function chooseWoodSources(area, frame) {
    const chosen = [];
    for (const candidate of woodSourceCandidates(area, frame)) {
      const tooClose = chosen.some((other) => {
        const dx = Math.abs(other.worldX - candidate.worldX);
        const dy = Math.abs(other.worldY - candidate.worldY);
        return Math.max(dx, dy) < 2;
      });
      if (tooClose) continue;
      chosen.push(candidate);
      if (chosen.length >= WOOD_SOURCE_COUNT) break;
    }
    return chosen;
  }

  function addWoodSources(grid, area, frame) {
    const sources = chooseWoodSources(area, frame)
      .map((source) => ({
        ...source,
        depth: source.worldX + source.worldY,
        image: pickByHash(WOOD_SOURCE_TILES, source.worldX, source.worldY, 52)
      }))
      .sort((a, b) => a.depth - b.depth);

    sources.forEach((source, index) => {
      const position = layoutIsoProject(
        source.worldX + 0.5,
        source.worldY + 0.5,
        frame.offsetX,
        frame.offsetY
      );
      const img = document.createElement("img");
      img.className = "layout-wood-source";
      img.src = source.image;
      img.alt = "";
      img.draggable = false;
      img.dataset.woodSourceId = `wood-${source.worldX}-${source.worldY}`;
      img.dataset.woodSourceTile = source.image.replace("./", "");
      img.dataset.worldX = String(source.worldX);
      img.dataset.worldY = String(source.worldY);
      img.style.left = `${roundCss(position.x)}px`;
      img.style.top = `${roundCss(position.y)}px`;
      img.style.zIndex = String(5 + index);
      grid.appendChild(img);
    });
  }

  function availableDogCells(area) {
    const cells = [];
    for (let worldY = area.minY + 1; worldY < area.maxY - 1; worldY += 1) {
      for (let worldX = area.minX + 1; worldX < area.maxX - 1; worldX += 1) {
        if (buildingAtCell(worldX, worldY)) continue;
        cells.push({
          worldX,
          worldY,
          score: stableHash(worldX, worldY, 911)
        });
      }
    }
    cells.sort((a, b) => a.score - b.score);
    return cells;
  }

  function addWolfDogs(grid, area, frame) {
    const cells = availableDogCells(area);
    state.dogs.slice(0, Math.min(5, cells.length)).forEach((dog, index) => {
      const cell = cells[index];
      const position = layoutIsoProject(
        cell.worldX + 0.5,
        cell.worldY + 0.5,
        frame.offsetX,
        frame.offsetY
      );
      const button = document.createElement("button");
      button.className = "map-wolf-dog";
      button.type = "button";
      button.dataset.dogId = dog.id;
      button.dataset.worldX = String(cell.worldX);
      button.dataset.worldY = String(cell.worldY);
      button.setAttribute("aria-label", dog.name);
      button.style.left = `${roundCss(position.x)}px`;
      button.style.top = `${roundCss(position.y)}px`;
      button.style.zIndex = String(70 + index);
      button.style.setProperty("--wolf-sheet", `url("${WOLF_IDLE_SHEET}")`);
      button.style.setProperty("--wolf-row", `${(index % 2) * -48}px`);
      button.innerHTML = '<span class="map-wolf-sprite" aria-hidden="true"></span>';
      grid.appendChild(button);
    });
  }

  function decorateTerrain() {
    const grid = els?.townMap?.querySelector(".layout-grid");
    if (!grid) return;
    const area = currentArea();
    const frame = layoutFrame(area);
    applyGroundTiles(grid, area, frame);
    addWoodSources(grid, area, frame);
    addWolfDogs(grid, area, frame);
  }

  const originalRenderMap = renderMap;
  renderMap = function renderMapWithSuppliedTerrainAssets(...args) {
    originalRenderMap(...args);
    decorateTerrain();
  };

  // app.js performs its first render before this deferred override executes.
  // Refresh only the map once so the supplied art is visible immediately.
  renderMap();
})();
