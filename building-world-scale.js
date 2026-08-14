"use strict";

/*
  Final RescuePup building layout exported from the user's building scale designer.
  These values are FINAL runtime scale/offset values. Do not apply an additional
  global multiplier to them. Logical footprint geometry remains unchanged.
*/
(() => {
  const FINAL_LAYOUT = Object.freeze({
    type: "rescuepup-building-footprint-definitions",
    version: 3,
    nativeTile: Object.freeze({ width: 32, height: 16 }),
    scaleMode: "final-runtime-scale-no-global-multiplier",
    definitions: Object.freeze({
      "Kennel::L1": Object.freeze({ type:"Kennel", level:1, footprint:Object.freeze({width:2,height:2}), scale:0.85, offsetX:-0.41, offsetY:-6.7 }),
      "Kennel::L2": Object.freeze({ type:"Kennel", level:2, footprint:Object.freeze({width:2,height:2}), scale:0.85, offsetX:-0.4, offsetY:-6.7 }),
      "Kennel::L3": Object.freeze({ type:"Kennel", level:3, footprint:Object.freeze({width:2,height:2}), scale:0.85, offsetX:-0.4, offsetY:-6.7 }),
      "Kennel::L4": Object.freeze({ type:"Kennel", level:4, footprint:Object.freeze({width:2,height:2}), scale:0.85, offsetX:-0.4, offsetY:-6.7 }),
      "Kennel::L5": Object.freeze({ type:"Kennel", level:5, footprint:Object.freeze({width:2,height:2}), scale:0.85, offsetX:-0.4, offsetY:-6.7 }),
      "Kennel::L6": Object.freeze({ type:"Kennel", level:6, footprint:Object.freeze({width:2,height:2}), scale:0.85, offsetX:-0.4, offsetY:-6.7 }),

      "Stick Storage::L1": Object.freeze({ type:"Stick Storage", level:1, footprint:Object.freeze({width:3,height:2}), scale:0.85, offsetX:0.25, offsetY:-9.5 }),
      "Stick Storage::L2": Object.freeze({ type:"Stick Storage", level:2, footprint:Object.freeze({width:3,height:2}), scale:0.85, offsetX:0.25, offsetY:-9.5 }),
      "Stick Storage::L3": Object.freeze({ type:"Stick Storage", level:3, footprint:Object.freeze({width:3,height:2}), scale:0.85, offsetX:0.25, offsetY:-9.5 }),
      "Stick Storage::L4": Object.freeze({ type:"Stick Storage", level:4, footprint:Object.freeze({width:3,height:2}), scale:0.85, offsetX:-1.25, offsetY:-9.44 }),
      "Stick Storage::L5": Object.freeze({ type:"Stick Storage", level:5, footprint:Object.freeze({width:3,height:2}), scale:0.9, offsetX:0.25, offsetY:-9.5 }),
      "Stick Storage::L6": Object.freeze({ type:"Stick Storage", level:6, footprint:Object.freeze({width:3,height:2}), scale:0.95, offsetX:-2.25, offsetY:-9.5 }),

      "Kitchen::L1": Object.freeze({ type:"Kitchen", level:1, footprint:Object.freeze({width:3,height:2}), scale:0.65, offsetX:-1.77, offsetY:-12.02 }),
      "Kitchen::L2": Object.freeze({ type:"Kitchen", level:2, footprint:Object.freeze({width:3,height:2}), scale:0.6, offsetX:-0.58, offsetY:-13.19 }),
      "Kitchen::L3": Object.freeze({ type:"Kitchen", level:3, footprint:Object.freeze({width:3,height:2}), scale:0.52, offsetX:-1.5, offsetY:-12.78 }),
      "Kitchen::L4": Object.freeze({ type:"Kitchen", level:4, footprint:Object.freeze({width:3,height:2}), scale:0.7, offsetX:-1.02, offsetY:-10.63 }),
      "Kitchen::L5": Object.freeze({ type:"Kitchen", level:5, footprint:Object.freeze({width:3,height:2}), scale:0.64, offsetX:-1.45, offsetY:-10.58 }),
      "Kitchen::L6": Object.freeze({ type:"Kitchen", level:6, footprint:Object.freeze({width:3,height:2}), scale:0.7, offsetX:-0.98, offsetY:-11.44 }),

      "Crop Farm::L1": Object.freeze({ type:"Crop Farm", level:1, footprint:Object.freeze({width:3,height:2}), scale:0.88, offsetX:-1.04, offsetY:-7.72 }),
      "Crop Farm::L2": Object.freeze({ type:"Crop Farm", level:2, footprint:Object.freeze({width:3,height:2}), scale:0.968, offsetX:-2.72, offsetY:-10.08 }),
      "Crop Farm::L3": Object.freeze({ type:"Crop Farm", level:3, footprint:Object.freeze({width:3,height:2}), scale:1.012, offsetX:-3.95, offsetY:-9.07 }),
      "Crop Farm::L4": Object.freeze({ type:"Crop Farm", level:4, footprint:Object.freeze({width:3,height:2}), scale:1.232, offsetX:-3.61, offsetY:-6.59 }),
      "Crop Farm::L5": Object.freeze({ type:"Crop Farm", level:5, footprint:Object.freeze({width:3,height:2}), scale:1.276, offsetX:0.24, offsetY:-5.71 }),
      "Crop Farm::L6": Object.freeze({ type:"Crop Farm", level:6, footprint:Object.freeze({width:3,height:2}), scale:1.32, offsetX:0.13, offsetY:-4.36 }),

      "Protein Farm::L1": Object.freeze({ type:"Protein Farm", level:1, footprint:Object.freeze({width:2,height:2}), scale:0.704, offsetX:-1.28, offsetY:-3.3 }),
      "Protein Farm::L2": Object.freeze({ type:"Protein Farm", level:2, footprint:Object.freeze({width:2,height:2}), scale:0.792, offsetX:0.86, offsetY:-2.17 }),
      "Protein Farm::L3": Object.freeze({ type:"Protein Farm", level:3, footprint:Object.freeze({width:2,height:2}), scale:0.836, offsetX:-0.16, offsetY:-1.03 }),
      "Protein Farm::L4": Object.freeze({ type:"Protein Farm", level:4, footprint:Object.freeze({width:2,height:2}), scale:0.88, offsetX:-2.06, offsetY:0.31 }),
      "Protein Farm::L5": Object.freeze({ type:"Protein Farm", level:5, footprint:Object.freeze({width:2,height:2}), scale:0.88, offsetX:-3.09, offsetY:1.02 }),
      "Protein Farm::L6": Object.freeze({ type:"Protein Farm", level:6, footprint:Object.freeze({width:2,height:2}), scale:0.88, offsetX:-1.1, offsetY:1.12 })
    })
  });

  const registry = window.RescuePupBuildingSprites;
  if (!registry) return;

  for (const definition of Object.values(FINAL_LAYOUT.definitions)) {
    const building = registry[definition.type];
    const level = building?.levels?.[String(definition.level)];
    if (!building || !level) continue;

    building.footprint.width = definition.footprint.width;
    building.footprint.height = definition.footprint.height;
    level.scale = definition.scale;
    level.offsetX = definition.offsetX;
    level.offsetY = definition.offsetY;
  }

  window.RescuePupFinalBuildingLayout = FINAL_LAYOUT;
  window.RescuePupWorldScale = Object.freeze({
    dogDisplayPixels: 32,
    buildingVisualMultiplier: 1,
    scaleMode: FINAL_LAYOUT.scaleMode,
    footprintsChanged: false,
    offsetsFromFinalLayout: true
  });

  // Force one terrain rebuild so the final values are used immediately.
  const existing = document.querySelector("#town-map .terrain-floor-world");
  if (existing) existing.remove();
  try {
    if (typeof renderMap === "function") renderMap();
  } catch {}
})();
