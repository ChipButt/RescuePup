"use strict";

// Bounded pan + pinch zoom camera for the Pawborough town map.
// Zoom limits are derived from gameplay geometry:
//   MIN = entire buildable area fits on screen with the limiting edge touching.
//   MAX = viewport width spans approximately 20 logical isometric tile steps.
// Pan remains bounded so an outermost buildable tile centre can reach the
// viewport centre, but never travel farther than that.
(() => {
  const map = document.getElementById("town-map");
  if (!map) return;

  const DRAG_THRESHOLD_PX = 6;
  const TILE_STEP_X = 16;
  const TILE_HALF_WIDTH = 16;
  const TILE_HALF_HEIGHT = 8;
  const MAX_ZOOM_VISIBLE_TILE_STEPS = 20;

  const camera = {
    x: 0,
    y: 0,
    zoom: 1,
    minZoom: 1,
    maxZoom: 1,
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    initialized: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
    dragging: false,
    captured: false,
    suppressClickUntil: 0,
    pointers: new Map(),
    pinch: null
  };

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function placementActive() {
    try { return Boolean(placementMode); } catch { return false; }
  }

  function worldLayer() {
    return map.querySelector(".terrain-floor-world");
  }

  function applyCamera() {
    const world = worldLayer();
    if (!world) return;
    for (const target of [world, map]) {
      target.style.setProperty("--map-pan-x", `${camera.x}px`);
      target.style.setProperty("--map-pan-y", `${camera.y}px`);
      target.style.setProperty("--map-zoom", String(camera.zoom));
    }
  }

  function tileCentre(tile, axis) {
    const raw = axis === "x" ? tile.style.left : tile.style.top;
    const value = Number.parseFloat(raw);
    if (Number.isFinite(value)) return value;
    return axis === "x" ? tile.offsetLeft : tile.offsetTop;
  }

  function metrics() {
    const tiles = [...map.querySelectorAll('.buildable-floor-tile[data-buildable="true"]')];
    if (!tiles.length) return null;
    const centresX = tiles.map((tile) => tileCentre(tile, "x"));
    const centresY = tiles.map((tile) => tileCentre(tile, "y"));
    const leftmost = Math.min(...centresX);
    const rightmost = Math.max(...centresX);
    const topmost = Math.min(...centresY);
    const bottommost = Math.max(...centresY);
    return {
      leftmost,
      rightmost,
      topmost,
      bottommost,
      left: leftmost - TILE_HALF_WIDTH,
      right: rightmost + TILE_HALF_WIDTH,
      top: topmost - TILE_HALF_HEIGHT,
      bottom: bottommost + TILE_HALF_HEIGHT
    };
  }

  function calculateZoomLimits(m) {
    const buildWidth = Math.max(1, m.right - m.left);
    const buildHeight = Math.max(1, m.bottom - m.top);
    // No artificial margin: at minimum zoom, one build-area dimension touches
    // the corresponding viewport edges exactly.
    const fitZoom = Math.min(map.clientWidth / buildWidth, map.clientHeight / buildHeight);
    const twentyTileZoom = map.clientWidth / (MAX_ZOOM_VISIBLE_TILE_STEPS * TILE_STEP_X);
    camera.minZoom = Math.max(0.1, fitZoom);
    camera.maxZoom = Math.max(camera.minZoom, twentyTileZoom);
  }

  function calculatePanBounds(m) {
    const centreX = map.clientWidth / 2;
    const centreY = map.clientHeight / 2;
    camera.minX = centreX - m.rightmost * camera.zoom;
    camera.maxX = centreX - m.leftmost * camera.zoom;
    camera.minY = centreY - m.bottommost * camera.zoom;
    camera.maxY = centreY - m.topmost * camera.zoom;
  }

  function clampPan() {
    camera.x = clamp(camera.x, camera.minX, camera.maxX);
    camera.y = clamp(camera.y, camera.minY, camera.maxY);
  }

  function centreBuildArea(m) {
    const viewportX = map.clientWidth / 2;
    const viewportY = map.clientHeight / 2;
    const buildCentreX = (m.left + m.right) / 2;
    const buildCentreY = (m.top + m.bottom) / 2;
    camera.x = viewportX - buildCentreX * camera.zoom;
    camera.y = viewportY - buildCentreY * camera.zoom;
    clampPan();
  }

  function measureCameraBounds({ centreIfFirst = true } = {}) {
    const m = metrics();
    if (!m) {
      camera.minX = camera.maxX = 0;
      camera.minY = camera.maxY = 0;
      camera.x = camera.y = 0;
      applyCamera();
      return;
    }

    calculateZoomLimits(m);
    const previousZoom = camera.zoom;
    camera.zoom = clamp(camera.zoom, camera.minZoom, camera.maxZoom);
    calculatePanBounds(m);

    if (!camera.initialized && centreIfFirst) {
      // Start at the furthest useful zoom-out: all buildable tiles are visible.
      camera.zoom = camera.minZoom;
      calculatePanBounds(m);
      centreBuildArea(m);
      camera.initialized = true;
    } else {
      if (previousZoom !== camera.zoom) calculatePanBounds(m);
      clampPan();
    }
    applyCamera();
  }

  function scheduleMeasure() {
    requestAnimationFrame(() => requestAnimationFrame(() => measureCameraBounds()));
  }

  function pointerDistance(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function pointerMidpoint(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function beginPinch() {
    const entries = [...camera.pointers.entries()];
    if (entries.length < 2) return;
    const [first, second] = entries.slice(0, 2);
    const a = first[1];
    const b = second[1];
    const midpointClient = pointerMidpoint(a, b);
    const rect = map.getBoundingClientRect();
    const midpoint = { x: midpointClient.x - rect.left, y: midpointClient.y - rect.top };
    const distance = Math.max(1, pointerDistance(a, b));
    camera.pinch = {
      ids: [first[0], second[0]],
      startDistance: distance,
      startZoom: camera.zoom,
      anchorWorldX: (midpoint.x - camera.x) / camera.zoom,
      anchorWorldY: (midpoint.y - camera.y) / camera.zoom
    };
    camera.dragging = false;
    camera.pointerId = null;
    camera.suppressClickUntil = performance.now() + 500;
    map.classList.add("map-pinching");
    for (const id of camera.pinch.ids) map.setPointerCapture?.(id);
  }

  function updatePinch() {
    const pinch = camera.pinch;
    if (!pinch) return;
    const a = camera.pointers.get(pinch.ids[0]);
    const b = camera.pointers.get(pinch.ids[1]);
    if (!a || !b) return;

    const distance = Math.max(1, pointerDistance(a, b));
    const ratio = distance / pinch.startDistance;
    const nextZoom = clamp(pinch.startZoom * ratio, camera.minZoom, camera.maxZoom);
    const midpointClient = pointerMidpoint(a, b);
    const rect = map.getBoundingClientRect();
    const midpoint = { x: midpointClient.x - rect.left, y: midpointClient.y - rect.top };

    camera.zoom = nextZoom;
    const m = metrics();
    if (!m) return;
    calculatePanBounds(m);
    // Keep the same world point under the pinch midpoint while zooming.
    camera.x = midpoint.x - pinch.anchorWorldX * camera.zoom;
    camera.y = midpoint.y - pinch.anchorWorldY * camera.zoom;
    clampPan();
    applyCamera();
  }

  function endPinchPointer(pointerId) {
    camera.pointers.delete(pointerId);
    if (!camera.pinch || !camera.pinch.ids.includes(pointerId)) return;
    camera.pinch = null;
    map.classList.remove("map-pinching");
    camera.suppressClickUntil = performance.now() + 450;
    // Do not turn the remaining finger into a pan mid-gesture. The user can
    // lift and touch again to start a normal map drag.
    camera.pointerId = null;
  }

  function clearSinglePointer(event) {
    if (camera.pointerId !== event.pointerId) return;
    if (camera.dragging) camera.suppressClickUntil = performance.now() + 350;
    camera.pointerId = null;
    camera.dragging = false;
    map.classList.remove("map-dragging");
    if (camera.captured && map.hasPointerCapture?.(event.pointerId)) map.releasePointerCapture(event.pointerId);
    camera.captured = false;
  }

  map.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary && event.pointerType === "mouse") return;
    if (placementActive()) return;

    // Track touch points even if one begins on a building so a two-finger pinch
    // works anywhere on the map. A single building touch is still left alone.
    if (event.pointerType !== "mouse") {
      camera.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (camera.pointers.size >= 2) {
        beginPinch();
        event.preventDefault();
        return;
      }
    }

    if (event.button !== 0 || camera.pointerId !== null) return;
    if (event.target.closest?.(".terrain-building-object")) return;
    if (event.target.closest?.(".map-ui-overlay")) return;

    camera.pointerId = event.pointerId;
    camera.startClientX = event.clientX;
    camera.startClientY = event.clientY;
    camera.startPanX = camera.x;
    camera.startPanY = camera.y;
    camera.dragging = false;
    camera.captured = false;
  });

  map.addEventListener("pointermove", (event) => {
    if (placementActive()) return;
    if (camera.pointers.has(event.pointerId)) {
      camera.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (camera.pinch) {
        updatePinch();
        event.preventDefault();
        return;
      }
    }

    if (camera.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - camera.startClientX;
    const deltaY = event.clientY - camera.startClientY;
    if (!camera.dragging && Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;

    if (!camera.dragging) {
      camera.dragging = true;
      map.classList.add("map-dragging");
      map.setPointerCapture?.(event.pointerId);
      camera.captured = Boolean(map.hasPointerCapture?.(event.pointerId));
    }

    camera.x = clamp(camera.startPanX + deltaX, camera.minX, camera.maxX);
    camera.y = clamp(camera.startPanY + deltaY, camera.minY, camera.maxY);
    applyCamera();
    event.preventDefault();
  }, { passive: false });

  function endPointer(event) {
    endPinchPointer(event.pointerId);
    clearSinglePointer(event);
  }
  map.addEventListener("pointerup", endPointer);
  map.addEventListener("pointercancel", endPointer);
  map.addEventListener("lostpointercapture", (event) => {
    if (camera.pointerId === event.pointerId) clearSinglePointer(event);
  });

  // Desktop/testing support: wheel zoom follows the same limits and zooms
  // around the cursor. Touch devices use the pinch path above.
  map.addEventListener("wheel", (event) => {
    if (placementActive()) return;
    event.preventDefault();
    const rect = map.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    const worldX = (point.x - camera.x) / camera.zoom;
    const worldY = (point.y - camera.y) / camera.zoom;
    const factor = event.deltaY < 0 ? 1.08 : 0.92;
    camera.zoom = clamp(camera.zoom * factor, camera.minZoom, camera.maxZoom);
    const m = metrics();
    if (!m) return;
    calculatePanBounds(m);
    camera.x = point.x - worldX * camera.zoom;
    camera.y = point.y - worldY * camera.zoom;
    clampPan();
    applyCamera();
  }, { passive: false });

  map.addEventListener("click", (event) => {
    if (performance.now() >= camera.suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === "childList")) scheduleMeasure();
  });
  observer.observe(map, { childList: true });

  if (typeof ResizeObserver !== "undefined") {
    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(map);
  } else {
    window.addEventListener("resize", scheduleMeasure);
  }

  window.RescuePupMapCamera = Object.freeze({
    get position() { return { x: camera.x, y: camera.y }; },
    get zoom() { return camera.zoom; },
    get zoomBounds() { return { min: camera.minZoom, max: camera.maxZoom }; },
    get bounds() { return { minX: camera.minX, maxX: camera.maxX, minY: camera.minY, maxY: camera.maxY }; },
    centre() {
      const m = metrics();
      if (!m) return;
      calculateZoomLimits(m);
      camera.zoom = clamp(camera.zoom, camera.minZoom, camera.maxZoom);
      calculatePanBounds(m);
      centreBuildArea(m);
      applyCamera();
    },
    fit() {
      const m = metrics();
      if (!m) return;
      calculateZoomLimits(m);
      camera.zoom = camera.minZoom;
      calculatePanBounds(m);
      centreBuildArea(m);
      applyCamera();
    },
    refresh: measureCameraBounds
  });

  scheduleMeasure();
})();
