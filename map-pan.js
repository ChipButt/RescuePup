"use strict";

// Bounded drag camera for the Pawborough town map.
// The camera may move only far enough that the outermost buildable tile centres
// can be brought to the centre of the visible map. Building taps are never
// pointer-captured; capture starts only once a real map drag has begun.
(() => {
  const map = document.getElementById("town-map");
  if (!map) return;

  const DRAG_THRESHOLD_PX = 6;
  const camera = {
    x: 0,
    y: 0,
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
    dragging: false,
    captured: false,
    suppressClickUntil: 0
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
    world.style.setProperty("--map-pan-x", `${camera.x}px`);
    world.style.setProperty("--map-pan-y", `${camera.y}px`);
    map.style.setProperty("--map-pan-x", `${camera.x}px`);
    map.style.setProperty("--map-pan-y", `${camera.y}px`);
  }

  function tileCentre(tile, axis) {
    const raw = axis === "x" ? tile.style.left : tile.style.top;
    const value = Number.parseFloat(raw);
    if (Number.isFinite(value)) return value;
    return axis === "x" ? tile.offsetLeft : tile.offsetTop;
  }

  function measureCameraBounds() {
    const tiles = [...map.querySelectorAll('.buildable-floor-tile[data-buildable="true"]')];
    if (!tiles.length) {
      camera.minX = camera.maxX = 0;
      camera.minY = camera.maxY = 0;
      camera.x = camera.y = 0;
      applyCamera();
      return;
    }

    const centresX = tiles.map((tile) => tileCentre(tile, "x"));
    const centresY = tiles.map((tile) => tileCentre(tile, "y"));
    const leftmost = Math.min(...centresX);
    const rightmost = Math.max(...centresX);
    const topmost = Math.min(...centresY);
    const bottommost = Math.max(...centresY);
    const centreX = map.clientWidth / 2;
    const centreY = map.clientHeight / 2;

    camera.minX = centreX - rightmost;
    camera.maxX = centreX - leftmost;
    camera.minY = centreY - bottommost;
    camera.maxY = centreY - topmost;

    camera.x = clamp(camera.x, camera.minX, camera.maxX);
    camera.y = clamp(camera.y, camera.minY, camera.maxY);
    applyCamera();
  }

  function scheduleMeasure() {
    requestAnimationFrame(() => requestAnimationFrame(measureCameraBounds));
  }

  function clearPointer(event) {
    if (camera.pointerId !== event.pointerId) return;
    if (camera.dragging) camera.suppressClickUntil = performance.now() + 350;
    camera.pointerId = null;
    camera.dragging = false;
    map.classList.remove("map-dragging");
    if (camera.captured && map.hasPointerCapture?.(event.pointerId)) {
      map.releasePointerCapture(event.pointerId);
    }
    camera.captured = false;
  }

  map.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0 || camera.pointerId !== null) return;
    if (placementActive()) return;
    // A building tap belongs to the building. If the user wants to pan they can
    // start the gesture on terrain; this prevents the popup click being stolen.
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
    if (camera.pointerId !== event.pointerId || placementActive()) return;

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

  map.addEventListener("pointerup", clearPointer);
  map.addEventListener("pointercancel", clearPointer);
  map.addEventListener("lostpointercapture", (event) => {
    if (camera.pointerId === event.pointerId) clearPointer(event);
  });

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
    get bounds() { return { minX: camera.minX, maxX: camera.maxX, minY: camera.minY, maxY: camera.maxY }; },
    centre() {
      camera.x = 0;
      camera.y = 0;
      measureCameraBounds();
    },
    refresh: measureCameraBounds
  });

  scheduleMeasure();
})();
