"use strict";

/*
  World-art scale correction only.
  Logical footprints, placement tiles and the user's per-level scale/offset JSON
  remain authoritative. This applies one shared visual multiplier around the
  existing footprint-bottom-centre anchor so the buildings read at a more
  believable scale beside the 32px dog sprites.
*/
(() => {
  const WORLD_BUILDING_SCALE = 0.88;
  const registry = window.RescuePupBuildingSprites;
  if (!registry) return;

  for (const building of Object.values(registry)) {
    for (const level of Object.values(building?.levels || {})) {
      if (!level || level.__dogScaleApplied) continue;
      level.scale = Number((Number(level.scale || 1) * WORLD_BUILDING_SCALE).toFixed(4));
      Object.defineProperty(level, "__dogScaleApplied", {
        value: true,
        enumerable: false,
        configurable: false,
        writable: false
      });
    }
  }

  window.RescuePupWorldScale = Object.freeze({
    dogDisplayPixels: 32,
    buildingVisualMultiplier: WORLD_BUILDING_SCALE,
    footprintsChanged: false,
    offsetsChanged: false
  });

  const existing = document.querySelector("#town-map .terrain-floor-world");
  if (existing) existing.remove();
  try {
    if (typeof renderMap === "function") renderMap();
  } catch {}
})();
