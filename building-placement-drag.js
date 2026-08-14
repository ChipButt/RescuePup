"use strict";

/*
  Drag building placement for RescuePup.
  - Normal building taps remain taps and open the approved JSON popup.
  - Move mode keeps the original building fixed until a valid drop succeeds.
  - The candidate footprint follows the pointer and is green/red live.
  - Invalid drops show a short centred "Can't Move Here" message and keep
    placement active without resetting the building or the pointer workflow.
*/
(() => {
  const map = document.getElementById("town-map");
  const overlay = document.getElementById("map-ui-overlay");
  if (!map || !overlay) return;

  let drag = null;
  const MOVE_THRESHOLD = 4;

  function mode() {
    try { return placementMode || null; } catch { return null; }
  }

  function cameraPosition() {
    return window.RescuePupMapCamera?.position || { x: 0, y: 0 };
  }

  function visualName(type) {
    if (type === "kennel") return "Kennel";
    if (type === "storage") return "Stick Storage";
    if (type === "food") return "Kitchen";
    if (type === "crop_farm") return "Crop Farm";
    return "Protein Farm";
  }

  function logicalWorldBounds() {
    const forest = window.RescuePupForest;
    if (forest?.worldBounds) return forest.worldBounds(currentArea());
    const a = currentArea();
    return { minX: a.minX - 12, minY: a.minY - 12, maxX: a.maxX + 12, maxY: a.maxY + 12 };
  }

  function mapWorldPoint(clientX, clientY) {
    const rect = map.getBoundingClientRect();
    const o = placementOffset();
    if (!o) return null;
    const camera = cameraPosition();
    const localX = clientX - rect.left - camera.x - o.x;
    const localY = clientY - rect.top - camera.y - o.y;
    const difference = localX / 16;
    const sum = localY / 8;
    return {
      x: (difference + sum) / 2,
      y: (sum - difference) / 2
    };
  }

  function boundedPlacementCell(worldX, worldY) {
    const bounds = logicalWorldBounds();
    return {
      x: Math.max(bounds.minX, Math.min(bounds.maxX - 1, Math.round(worldX))),
      y: Math.max(bounds.minY, Math.min(bounds.maxY - 1, Math.round(worldY)))
    };
  }

  function placementValidity() {
    const m = mode();
    if (!m) return false;
    const catalog = getCatalog(m.type);
    const exceptId = m.action === "move" ? m.buildingId : null;
    return Boolean(catalog && isFootprintOpen(catalog, m.worldX, m.worldY, exceptId));
  }

  function footprintMarkup(catalog, valid) {
    const m = mode();
    const o = placementOffset();
    if (!m || !o || !window.RescuePupTerrain) return "";
    const camera = cameraPosition();
    const cells = [];
    for (let y = 0; y < catalog.footprintHeight; y += 1) {
      for (let x = 0; x < catalog.footprintWidth; x += 1) {
        const worldX = m.worldX + x;
        const worldY = m.worldY + y;
        const p = window.RescuePupTerrain.point(worldX + 0.5, worldY + 0.5);
        cells.push(`<span class="placement-highlight-cell ${valid ? "valid" : "invalid"}" style="left:${p.x + o.x + camera.x}px;top:${p.y + o.y + camera.y}px"></span>`);
      }
    }
    return cells.join("");
  }

  function previewMarkup(catalog, valid) {
    const m = mode();
    const o = placementOffset();
    const registry = window.RescuePupBuildingSprites;
    if (!m || !o || !registry || !window.RescuePupTerrain) return "";

    const building = m.action === "move"
      ? state.buildings.find((item) => item.id === m.buildingId)
      : null;
    const level = m.action === "move" ? buildingLevel(building) : 1;
    const def = registry[visualName(catalog.type)]?.levels?.[String(level)];
    if (!def) return "";

    const camera = cameraPosition();
    const anchor = window.RescuePupTerrain.footprintBottomCentre(
      m.worldX,
      m.worldY,
      catalog.footprintWidth,
      catalog.footprintHeight
    );
    const size = 64 * Number(def.scale || 1);
    const left = anchor.x + o.x + camera.x + Number(def.offsetX || 0) - size / 2;
    const top = anchor.y + o.y + camera.y + Number(def.offsetY || 0) - size;
    return `<img class="placement-building-preview drag-preview ${valid ? "valid" : "invalid"}" src="${buildingSpritePath(catalog.type, level)}" alt="" draggable="false" style="left:${left}px;top:${top}px;width:${size}px;height:${size}px" />`;
  }

  function placementBanner(catalog, valid) {
    const m = mode();
    return `<div class="placement-banner ${valid ? "valid" : "invalid"}">
      <strong>${m?.action === "move" ? "Move" : "Place"} ${catalog.name}</strong>
      <span>${valid ? "Drag it into position. Green means it can be placed here." : "Red means this position cannot be used."}</span>
      <div class="placement-actions">
        <button type="button" class="placement-round-button confirm" data-confirm-placement aria-label="Confirm"><img src="./assets/ui/button-confirm-raster.png" alt="" /></button>
        <button type="button" class="placement-round-button cancel" data-cancel-placement aria-label="Cancel"><img src="./assets/ui/button-cancel-raster.png" alt="" /></button>
      </div>
    </div>`;
  }

  function hideMovingOriginal() {
    const m = mode();
    if (!m || m.action !== "move") return;
    map.querySelector(`.terrain-building-object[data-building-id="${CSS.escape(m.buildingId)}"]`)?.classList.add("placement-source-hidden");
  }

  function refreshPlacementUi() {
    renderMapUi();
    map.classList.toggle("building-placement-active", Boolean(mode()));
    hideMovingOriginal();
  }

  function showCantMoveHere() {
    document.querySelectorAll(".cant-move-here-pop").forEach((node) => node.remove());
    const node = document.createElement("div");
    node.className = "cant-move-here-pop";
    node.textContent = "Can't Move Here";
    document.body.appendChild(node);
    requestAnimationFrame(() => node.classList.add("show"));
    window.setTimeout(() => node.classList.remove("show"), 650);
    window.setTimeout(() => node.remove(), 900);
  }

  // Replace the old full clickable grid with a pointer surface and only the
  // current footprint highlight. This lets the building be dragged outside the
  // build boundary so invalid positions can visibly turn red.
  renderPlacementGrid = function renderDragPlacementGrid() {
    const m = mode();
    if (!m) return "";
    const catalog = getCatalog(m.type);
    if (!catalog) return "";
    const valid = placementValidity();
    return `<div class="placement-drag-surface" data-placement-drag-surface>
      ${footprintMarkup(catalog, valid)}
      ${previewMarkup(catalog, valid)}
    </div>${placementBanner(catalog, valid)}`;
  };

  setPlacementCell = function setDragPlacementCell(worldX, worldY) {
    const m = mode();
    if (!m) return;
    const next = boundedPlacementCell(worldX, worldY);
    if (next.x === m.worldX && next.y === m.worldY) return;
    m.worldX = next.x;
    m.worldY = next.y;
    refreshPlacementUi();
  };

  startMovePlacement = function startDragMovePlacement(buildingId) {
    const building = state.buildings.find((item) => item.id === buildingId);
    if (!building) return;
    selectedBuildingId = null;
    placementMode = {
      action: "move",
      type: building.type,
      buildingId,
      worldX: building.worldX,
      worldY: building.worldY,
      originalWorldX: building.worldX,
      originalWorldY: building.worldY
    };
    state.screen = "home";
    closeBuildSheet();
    refreshPlacementUi();
  };

  const originalStartBuildPlacement = startBuildPlacement;
  startBuildPlacement = function startDragBuildPlacement(type) {
    originalStartBuildPlacement(type);
    if (mode()) refreshPlacementUi();
  };

  cancelPlacement = function cancelDragPlacement() {
    placementMode = null;
    drag = null;
    map.classList.remove("building-placement-active", "building-placement-dragging");
    renderMap();
    renderMapUi();
  };

  confirmPlacement = function confirmDragPlacement() {
    const m = mode();
    if (!m) return;
    const catalog = getCatalog(m.type);
    const exceptId = m.action === "move" ? m.buildingId : null;
    if (!catalog || !isFootprintOpen(catalog, m.worldX, m.worldY, exceptId)) {
      showCantMoveHere();
      refreshPlacementUi();
      return;
    }

    if (m.action === "move") {
      const id = m.buildingId;
      const building = state.buildings.find((item) => item.id === id);
      if (!building) return cancelPlacement();
      building.worldX = m.worldX;
      building.worldY = m.worldY;
      placementMode = null;
      selectedBuildingId = id;
      map.classList.remove("building-placement-active", "building-placement-dragging");
      saveAndRender();
      toast(`${catalog.name} moved`);
      return;
    }

    if (!canAfford(catalog.cost)) {
      placementMode = null;
      return toast(`Need ${costText(catalog.cost)}`);
    }
    spend(catalog.cost);
    const building = normalizeBuilding({
      id: `b-${catalog.type}-${Date.now()}`,
      type: catalog.type,
      level: 1,
      status: "ready",
      worldX: m.worldX,
      worldY: m.worldY,
      ...(catalog.type === "storage" ? { storedUnits: 0, maxCapacity: storageCapacity(1) } : {})
    });
    state.buildings.push(building);
    placementMode = null;
    selectedBuildingId = building.id;
    map.classList.remove("building-placement-active", "building-placement-dragging");
    saveAndRender();
    toast(`${catalog.name} built`);
  };

  overlay.addEventListener("pointerdown", (event) => {
    const m = mode();
    if (!m || event.button !== 0) return;
    if (event.target.closest("[data-confirm-placement],[data-cancel-placement]")) return;
    const surface = event.target.closest("[data-placement-drag-surface]");
    if (!surface) return;

    const point = mapWorldPoint(event.clientX, event.clientY);
    if (!point) return;
    drag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      grabX: point.x - m.worldX,
      grabY: point.y - m.worldY,
      moved: false,
      action: m.action
    };
    surface.setPointerCapture?.(event.pointerId);
    map.classList.add("building-placement-dragging");
    event.preventDefault();
  });

  overlay.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId || !mode()) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) >= MOVE_THRESHOLD) {
      drag.moved = true;
    }
    if (!drag.moved) return;
    const point = mapWorldPoint(event.clientX, event.clientY);
    if (!point) return;
    setPlacementCell(point.x - drag.grabX, point.y - drag.grabY);
    event.preventDefault();
  }, { passive: false });

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved;
    const wasMove = drag.action === "move";
    drag = null;
    map.classList.remove("building-placement-dragging");

    if (!moved || !mode()) return;
    if (!placementValidity()) {
      showCantMoveHere();
      refreshPlacementUi();
      return;
    }
    // Moving a building is true drag/drop: a valid release completes the move.
    // New construction still retains the explicit Confirm button.
    if (wasMove) confirmPlacement();
  }

  overlay.addEventListener("pointerup", finishDrag);
  overlay.addEventListener("pointercancel", (event) => {
    if (drag?.pointerId === event.pointerId) {
      drag = null;
      map.classList.remove("building-placement-dragging");
    }
  });

  // Extra direct tap path for robustness. The document-level handler also does
  // this, but this local listener ensures map-camera changes can never regress it.
  map.addEventListener("click", (event) => {
    if (mode()) return;
    const building = event.target.closest?.(".terrain-building-object[data-building-id]");
    if (!building) return;
    selectedBuildingId = building.dataset.buildingId;
    renderMapUi();
  });

  window.RescuePupPlacementDrag = Object.freeze({
    get active() { return Boolean(mode()); },
    get valid() { return placementValidity(); },
    showCantMoveHere
  });
})();
