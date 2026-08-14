"use strict";

/* Drag/drop building placement, kept in screen sync with the zoomable map. */
(() => {
  const map = document.getElementById("town-map");
  const overlay = document.getElementById("map-ui-overlay");
  if (!map || !overlay) return;

  let drag = null;
  const MOVE_THRESHOLD = 4;

  const mode = () => {
    try { return placementMode || null; } catch { return null; }
  };
  const camera = () => ({
    ...(window.RescuePupMapCamera?.position || { x: 0, y: 0 }),
    zoom: window.RescuePupMapCamera?.zoom || 1
  });

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
    const c = camera();
    // Inverse of: screen = pan + zoom * (terrainPoint + terrainOffset)
    const layerX = (clientX - rect.left - c.x) / c.zoom;
    const layerY = (clientY - rect.top - c.y) / c.zoom;
    const localX = layerX - o.x;
    const localY = layerY - o.y;
    const difference = localX / 16;
    const sum = localY / 8;
    return { x: (difference + sum) / 2, y: (sum - difference) / 2 };
  }

  function boundedPlacementCell(worldX, worldY) {
    const b = logicalWorldBounds();
    return {
      x: Math.max(b.minX, Math.min(b.maxX - 1, Math.round(worldX))),
      y: Math.max(b.minY, Math.min(b.maxY - 1, Math.round(worldY)))
    };
  }

  function placementValidity() {
    const m = mode();
    if (!m) return false;
    const catalog = getCatalog(m.type);
    const exceptId = m.action === "move" ? m.buildingId : null;
    return Boolean(catalog && isFootprintOpen(catalog, m.worldX, m.worldY, exceptId));
  }

  function screenPoint(worldX, worldY) {
    const o = placementOffset();
    if (!o || !window.RescuePupTerrain) return null;
    const c = camera();
    const p = window.RescuePupTerrain.point(worldX, worldY);
    return { x: c.x + (p.x + o.x) * c.zoom, y: c.y + (p.y + o.y) * c.zoom };
  }

  function footprintMarkup(catalog, valid) {
    const m = mode();
    const c = camera();
    if (!m) return "";
    const cells = [];
    for (let y = 0; y < catalog.footprintHeight; y += 1) {
      for (let x = 0; x < catalog.footprintWidth; x += 1) {
        const p = screenPoint(m.worldX + x + 0.5, m.worldY + y + 0.5);
        if (!p) continue;
        cells.push(`<span class="placement-highlight-cell ${valid ? "valid" : "invalid"}" style="left:${p.x}px;top:${p.y}px;width:${32 * c.zoom}px;height:${16 * c.zoom}px"></span>`);
      }
    }
    return cells.join("");
  }

  function previewMarkup(catalog, valid) {
    const m = mode();
    const o = placementOffset();
    const registry = window.RescuePupBuildingSprites;
    if (!m || !o || !registry || !window.RescuePupTerrain) return "";

    const building = m.action === "move" ? state.buildings.find((item) => item.id === m.buildingId) : null;
    const level = m.action === "move" ? buildingLevel(building) : 1;
    const def = registry[visualName(catalog.type)]?.levels?.[String(level)];
    if (!def) return "";

    const c = camera();
    const anchor = window.RescuePupTerrain.footprintBottomCentre(m.worldX, m.worldY, catalog.footprintWidth, catalog.footprintHeight);
    const nativeSize = 64 * Number(def.scale || 1);
    const worldLeft = anchor.x + o.x + Number(def.offsetX || 0) - nativeSize / 2;
    const worldTop = anchor.y + o.y + Number(def.offsetY || 0) - nativeSize;
    const left = c.x + worldLeft * c.zoom;
    const top = c.y + worldTop * c.zoom;
    const size = nativeSize * c.zoom;
    return `<img class="placement-building-preview drag-preview ${valid ? "valid" : "invalid"}" src="${buildingSpritePath(catalog.type, level)}" alt="" draggable="false" style="left:${left}px;top:${top}px;width:${size}px;height:${size}px" />`;
  }

  function placementBanner(catalog, valid) {
    const m = mode();
    return `<div class="placement-banner ${valid ? "valid" : "invalid"}"><strong>${m?.action === "move" ? "Move" : "Place"} ${catalog.name}</strong><span>${valid ? "Drag it into position. Green means it can be placed here." : "Red means this position cannot be used."}</span><div class="placement-actions"><button type="button" class="placement-round-button confirm" data-confirm-placement aria-label="Confirm"><img src="./assets/ui/button-confirm-raster.png" alt="" /></button><button type="button" class="placement-round-button cancel" data-cancel-placement aria-label="Cancel"><img src="./assets/ui/button-cancel-raster.png" alt="" /></button></div></div>`;
  }

  function hideMovingOriginal() {
    const m = mode();
    if (!m || m.action !== "move") return;
    const node = [...map.querySelectorAll(".terrain-building-object[data-building-id]")].find((item) => item.dataset.buildingId === m.buildingId);
    node?.classList.add("placement-source-hidden");
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

  renderPlacementGrid = function renderDragPlacementGrid() {
    const m = mode();
    if (!m) return "";
    const catalog = getCatalog(m.type);
    if (!catalog) return "";
    const valid = placementValidity();
    return `<div class="placement-drag-surface" data-placement-drag-surface>${footprintMarkup(catalog, valid)}${previewMarkup(catalog, valid)}</div>${placementBanner(catalog, valid)}`;
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
    placementMode = { action: "move", type: building.type, buildingId, worldX: building.worldX, worldY: building.worldY, originalWorldX: building.worldX, originalWorldY: building.worldY };
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
      const building = state.buildings.find((item) => item.id === m.buildingId);
      if (!building) return cancelPlacement();
      building.worldX = m.worldX;
      building.worldY = m.worldY;
      const id = building.id;
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
    const building = normalizeBuilding({ id: `b-${catalog.type}-${Date.now()}`, type: catalog.type, level: 1, status: "ready", worldX: m.worldX, worldY: m.worldY, ...(catalog.type === "storage" ? { storedUnits: 0, maxCapacity: storageCapacity(1) } : {}) });
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
    drag = { pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY, grabX: point.x - m.worldX, grabY: point.y - m.worldY, moved: false, action: m.action };
    surface.setPointerCapture?.(event.pointerId);
    map.classList.add("building-placement-dragging");
    event.preventDefault();
  });

  overlay.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId || !mode()) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) >= MOVE_THRESHOLD) drag.moved = true;
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
    if (wasMove) confirmPlacement();
  }
  overlay.addEventListener("pointerup", finishDrag);
  overlay.addEventListener("pointercancel", (event) => {
    if (drag?.pointerId !== event.pointerId) return;
    drag = null;
    map.classList.remove("building-placement-dragging");
  });

  map.addEventListener("click", (event) => {
    if (mode()) return;
    const building = event.target.closest?.(".terrain-building-object[data-building-id]");
    if (!building) return;
    selectedBuildingId = building.dataset.buildingId;
    renderMapUi();
  });

  // A zoom changes overlay screen coordinates while placement is active.
  let lastZoom = 0;
  function syncToCamera() {
    const next = camera().zoom;
    if (mode() && Math.abs(next - lastZoom) > 0.0001) refreshPlacementUi();
    lastZoom = next;
    requestAnimationFrame(syncToCamera);
  }
  requestAnimationFrame(syncToCamera);

  window.RescuePupPlacementDrag = Object.freeze({ get active() { return Boolean(mode()); }, get valid() { return placementValidity(); }, showCantMoveHere });
})();
