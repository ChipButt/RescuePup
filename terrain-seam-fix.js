"use strict";

/*
  Removes the false autotile edge between terrain-overrides.js' 10-tile DOM
  grass ring and forest-world.js' connected grass extension.

  The extension draws Bottom Grassland's fully-connected r1c1 tile. The old
  terrain range treated cells beyond its own render boundary as disconnected,
  so its final outside row/column used edge variants even though the world
  continued. Force only those OUTSIDE boundary cells to r1c1.
*/
(() => {
  const map = document.getElementById("town-map");
  if (!map) return;

  const CONNECTED_BACKGROUND = "-32px -32px";
  let frame = 0;

  function patchOuterGrassBoundary() {
    frame = 0;
    const tiles = [...map.querySelectorAll(".terrain-floor-tile[data-world-x][data-world-y]")];
    if (!tiles.length) return;

    const xs = tiles.map((tile) => Number(tile.dataset.worldX)).filter(Number.isFinite);
    const ys = tiles.map((tile) => Number(tile.dataset.worldY)).filter(Number.isFinite);
    if (!xs.length || !ys.length) return;

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    for (const tile of tiles) {
      if (tile.dataset.buildable === "true") continue;
      const x = Number(tile.dataset.worldX);
      const y = Number(tile.dataset.worldY);
      if (x !== minX && x !== maxX && y !== minY && y !== maxY) continue;

      tile.style.backgroundPosition = CONNECTED_BACKGROUND;
      tile.dataset.tileId = "r1c1";
      tile.dataset.tileRow = "1";
      tile.dataset.tileCol = "1";
      tile.dataset.seamlessOuterEdge = "true";
    }
  }

  function schedulePatch() {
    if (frame) return;
    frame = requestAnimationFrame(patchOuterGrassBoundary);
  }

  new MutationObserver(schedulePatch).observe(map, { childList: true, subtree: true });
  window.addEventListener("rescuepup:forest-updated", schedulePatch);
  window.addEventListener("resize", schedulePatch);

  window.RescuePupTerrainSeam = Object.freeze({ refresh: patchOuterGrassBoundary });
  schedulePatch();
})();
