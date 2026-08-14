"use strict";

/*
  RescuePup dog worker/navigation runtime.

  All breed sheets use the same verified 960x1024, 64x64-cell layout:
    bite  rows 0-3,  cols 0-14
    death rows 4-7,  cols 0-11
    howl  rows 8-11, cols 0-8
    run   rows 12-15, cols 0-7
    idle  rows 12-15, cols 11-14

  Direction rows from the supplied direction reference:
    0 = screen SW / down-left
    1 = screen SE / down-right
    2 = screen NW / up-left
    3 = screen NE / up-right

  Dogs may pass through the same logical tile while moving. Stationary destinations
  are reserved, so two dogs can never stop/work on the same logical tile.
*/
(() => {
  const SIZE = 32;
  const FULL_SHEET_COLS = 15;
  const FULL_SHEET_ROWS = 16;
  const SPEED = 1.05;
  const WANDER_MARGIN = 3;
  const NAV_MARGIN = 8;

  const STICK_DIG_MS = 10000;
  const CROP_DIG_MS = 2200;
  const CROP_HOWL_MS = 2500;
  const CROP_IDLE_MS = 1800;
  const KITCHEN_IDLE_MIN_MS = 7000;
  const KITCHEN_IDLE_VARIANCE_MS = 5000;
  const KITCHEN_HOWL_MS = 2500;
  const KITCHEN_POST_HOWL_IDLE_MS = 1800;

  const BREED_SHEETS = Object.freeze({
    "Alaskan Malamute": "./wolf-all-alaskan-malamute.png",
    "Belgian Tervuren": "./wolf-all-belgian-tervuren.png",
    "Czechoslovakian Wolfdog": "./wolf-all-czechoslovakian-wolfdog.png",
    "German Shepherd": "./wolf-all-german-shepherd.png",
    "Golden Retriever": "./wolf-all-golden-retriever.png",
    "Greenland Dog": "./wolf-all-greenland-dog.png",
    "Siberian Husky": "./wolf-all-siberian-husky.png",
    "White Swiss Shepherd": "./wolf-all-white-swiss-shepherd.png"
  });
  const BREED_NAMES = Object.keys(BREED_SHEETS);
  const FALLBACK_SHEET = "./wolf/wolf-all.png";

  const ANIMS = Object.freeze({
    run:  Object.freeze({ rowBase: 12, colBase: 0,  frames: 8, frameMs: 180 }),
    idle: Object.freeze({ rowBase: 12, colBase: 11, frames: 4, frameMs: 320 }),
    dig:  Object.freeze({ rowBase: 4,  colBase: 0,  frames: 2, frameMs: 420 }),
    howl: Object.freeze({ rowBase: 8,  colBase: 0,  frames: 9, frameMs: 250 })
  });

  const WOOD = [
    "./tile_048.png", "./tile_049.png", "./tile_050.png",
    "./tile_051.png", "./tile_052.png"
  ];

  const dogs = new Map();
  const stationaryReservations = new Map();
  let map = document.getElementById("town-map");
  let last = performance.now();
  let woodKey = "";
  let woodSources = [];

  const area = () => typeof currentArea === "function"
    ? currentArea()
    : ({ minX: 0, minY: 0, maxX: 12, maxY: 12, width: 12, height: 12 });

  const hash = (s) => {
    let h = 2166136261;
    const text = String(s || "");
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const inside = (x, y, a = area()) =>
    x >= a.minX && y >= a.minY && x < a.maxX && y < a.maxY;

  const gateXs = (a = area()) => {
    const x = a.minX + Math.floor((a.maxX - a.minX) / 2) - 1;
    return [x, x + 1];
  };

  const cell = (x, y) => ({ x: Math.floor(x), y: Math.floor(y) });
  const centre = (c) => ({ x: c.x + 0.5, y: c.y + 0.5 });
  const key = (c) => `${c.x},${c.y}`;

  function sheetForDog(dog) {
    if (BREED_SHEETS[dog?.breed]) return BREED_SHEETS[dog.breed];
    if (BREED_NAMES.length && dog?.id) return BREED_SHEETS[BREED_NAMES[hash(dog.id) % BREED_NAMES.length]];
    return FALLBACK_SHEET;
  }

  function offset() {
    const tile = map?.querySelector('.terrain-floor-tile[data-world-x][data-world-y]');
    if (!tile || !window.RescuePupTerrain) return { x: 0, y: 0 };
    const x = +tile.dataset.worldX;
    const y = +tile.dataset.worldY;
    const p = window.RescuePupTerrain.point(x + 0.5, y + 0.5);
    return { x: parseFloat(tile.style.left) - p.x, y: parseFloat(tile.style.top) - p.y };
  }

  function screen(x, y) {
    const o = offset();
    const p = window.RescuePupTerrain
      ? window.RescuePupTerrain.point(x, y)
      : { x: (x - y) * 16, y: (x + y) * 8 };
    return { x: p.x + o.x, y: p.y + o.y };
  }

  function directionForMovement(dx, dy) {
    const sx = (dx - dy) * 16;
    const sy = (dx + dy) * 8;
    if (sx < 0 && sy >= 0) return 0;
    if (sx >= 0 && sy >= 0) return 1;
    if (sx < 0 && sy < 0) return 2;
    return 3;
  }

  function faceToward(r, target) {
    if (!target) return;
    const dx = target.x - r.x;
    const dy = target.y - r.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.001) {
      r.direction = directionForMovement(dx, dy);
    }
  }

  function setAnim(r, name, now) {
    const meta = ANIMS[name] || ANIMS.idle;
    const frame = Math.floor(now / meta.frameMs) % meta.frames;
    const sheet = sheetForDog(r.dog);
    if (
      r.anim === name &&
      r.frame === frame &&
      r.lastDir === r.direction &&
      r.lastSheet === sheet
    ) return;

    r.anim = name;
    r.frame = frame;
    r.lastDir = r.direction;
    r.lastSheet = sheet;

    const col = meta.colBase + frame;
    const row = meta.rowBase + r.direction;
    r.el.style.backgroundImage = `url("${sheet}")`;
    r.el.style.backgroundSize = `${FULL_SHEET_COLS * SIZE}px ${FULL_SHEET_ROWS * SIZE}px`;
    r.el.style.backgroundPosition = `${-col * SIZE}px ${-row * SIZE}px`;
  }

  function reservationOwner(point) {
    return stationaryReservations.get(key(cell(point.x, point.y))) || null;
  }

  function stationaryFree(r, point) {
    const owner = reservationOwner(point);
    return !owner || owner === r.dog.id;
  }

  function releaseReservation(r) {
    if (!r.reservedCellKey) return;
    if (stationaryReservations.get(r.reservedCellKey) === r.dog.id) {
      stationaryReservations.delete(r.reservedCellKey);
    }
    r.reservedCellKey = null;
  }

  function reservePoint(r, point) {
    const targetKey = key(cell(point.x, point.y));
    const owner = stationaryReservations.get(targetKey);
    if (owner && owner !== r.dog.id) return false;

    if (r.reservedCellKey && r.reservedCellKey !== targetKey) {
      releaseReservation(r);
    }
    stationaryReservations.set(targetKey, r.dog.id);
    r.reservedCellKey = targetKey;
    return true;
  }

  function buildingBlockedCells(exceptBuildingId = null) {
    const blocked = new Set();
    for (const b of state?.buildings || []) {
      if (b.id === exceptBuildingId) continue;
      const c = typeof getCatalog === "function" ? getCatalog(b.type) : null;
      if (!c) continue;
      for (let yy = 0; yy < c.footprintHeight; yy += 1) {
        for (let xx = 0; xx < c.footprintWidth; xx += 1) {
          blocked.add(`${b.worldX + xx},${b.worldY + yy}`);
        }
      }
    }
    return blocked;
  }

  function navigationSignature() {
    const a = area();
    const buildings = (state?.buildings || [])
      .map((b) => `${b.id}:${b.type}:${b.worldX}:${b.worldY}`)
      .sort()
      .join("|");
    return `${a.minX}:${a.minY}:${a.maxX}:${a.maxY}::${buildings}`;
  }

  function withinNavigationBounds(c, a = area()) {
    return (
      c.x >= a.minX - NAV_MARGIN &&
      c.x < a.maxX + NAV_MARGIN &&
      c.y >= a.minY - NAV_MARGIN &&
      c.y < a.maxY + NAV_MARGIN
    );
  }

  function crossingFenceAllowed(from, to, a = area()) {
    const fromInside = inside(from.x, from.y, a);
    const toInside = inside(to.x, to.y, a);
    if (fromInside === toInside) return true;
    if (from.x !== to.x) return false;
    const inner = fromInside ? from : to;
    const outer = fromInside ? to : from;
    return (
      inner.y === a.maxY - 1 &&
      outer.y === a.maxY &&
      gateXs(a).includes(inner.x)
    );
  }

  function walkable(c, blocked = buildingBlockedCells()) {
    return withinNavigationBounds(c) && !blocked.has(key(c));
  }

  function neighbours(c, blocked) {
    const candidates = [
      { x: c.x + 1, y: c.y },
      { x: c.x - 1, y: c.y },
      { x: c.x, y: c.y + 1 },
      { x: c.x, y: c.y - 1 }
    ];
    return candidates.filter((n) => walkable(n, blocked) && crossingFenceAllowed(c, n));
  }

  function reconstruct(cameFrom, endKey) {
    const out = [];
    let current = endKey;
    while (current) {
      const [x, y] = current.split(",").map(Number);
      out.push({ x, y });
      current = cameFrom.get(current) || null;
    }
    return out.reverse();
  }

  function planCells(start, target, allowBuildingId = null) {
    const blocked = buildingBlockedCells(allowBuildingId);
    const startKey = key(start);
    const targetKey = key(target);
    blocked.delete(startKey);

    if (!walkable(target, blocked)) return null;
    if (startKey === targetKey) return [start];

    const open = [{
      cell: start,
      g: 0,
      f: Math.abs(target.x - start.x) + Math.abs(target.y - start.y)
    }];
    const best = new Map([[startKey, 0]]);
    const came = new Map();
    const closed = new Set();

    while (open.length) {
      open.sort((a, b) => a.f - b.f || a.g - b.g);
      const node = open.shift();
      const nodeKey = key(node.cell);
      if (closed.has(nodeKey)) continue;
      if (nodeKey === targetKey) return reconstruct(came, targetKey);
      closed.add(nodeKey);

      for (const next of neighbours(node.cell, blocked)) {
        const nextKey = key(next);
        if (closed.has(nextKey)) continue;
        const g = node.g + 1;
        if (g >= (best.get(nextKey) ?? Infinity)) continue;
        best.set(nextKey, g);
        came.set(nextKey, nodeKey);
        const h = Math.abs(target.x - next.x) + Math.abs(target.y - next.y);
        open.push({ cell: next, g, f: g + h });
      }
    }
    return null;
  }

  function routePlanFrom(x, y, target, allowBuildingId = null) {
    const cells = planCells(cell(x, y), cell(target.x, target.y), allowBuildingId);
    if (!cells) return null;
    const points = cells.slice(1).map(centre);
    const final = points[points.length - 1];
    if (
      !final ||
      Math.abs(final.x - target.x) > 0.001 ||
      Math.abs(final.y - target.y) > 0.001
    ) {
      points.push({ x: target.x, y: target.y });
    }
    return points;
  }

  function routePlan(r, target, allowBuildingId = null) {
    return routePlanFrom(r.x, r.y, target, allowBuildingId);
  }

  function setRoute(r, points, target, after, allowBuildingId = null) {
    r.route = points;
    r.routeIndex = 0;
    r.routeGoal = { x: target.x, y: target.y };
    r.routeNavigationSignature = navigationSignature();
    r.routeAllowBuildingId = allowBuildingId;
    r.after = after || r.after || "idleWait";
    r.phase = points.length ? "move" : r.after;
    r.phaseStarted = performance.now();
  }

  function routeTo(r, target, options = {}) {
    const {
      after = r.after || "idleWait",
      reserve = false,
      allowBuildingId = null
    } = options;

    if (reserve) {
      if (!stationaryFree(r, target)) return false;
      if (!reservePoint(r, target)) return false;
    } else {
      releaseReservation(r);
    }

    const route = routePlan(r, target, allowBuildingId);
    if (!route) {
      if (reserve) releaseReservation(r);
      return false;
    }
    setRoute(r, route, target, after, allowBuildingId);
    return true;
  }

  function routeVia(r, waypoints, options = {}) {
    if (!Array.isArray(waypoints) || !waypoints.length) return false;
    const {
      after = r.after || "idleWait",
      reserveFinal = false,
      allowBuildingId = null
    } = options;
    const finalTarget = waypoints[waypoints.length - 1];

    if (reserveFinal) {
      if (!stationaryFree(r, finalTarget)) return false;
      if (!reservePoint(r, finalTarget)) return false;
    } else {
      releaseReservation(r);
    }

    let fromX = r.x;
    let fromY = r.y;
    const combined = [];
    for (const waypoint of waypoints) {
      const segment = routePlanFrom(fromX, fromY, waypoint, allowBuildingId);
      if (!segment) {
        if (reserveFinal) releaseReservation(r);
        return false;
      }
      combined.push(...segment);
      fromX = waypoint.x;
      fromY = waypoint.y;
    }
    setRoute(r, combined, finalTarget, after, allowBuildingId);
    return true;
  }

  function bestReachableTarget(r, points, options = {}) {
    let best = null;
    for (const point of points) {
      if (options.stationary && !stationaryFree(r, point)) continue;
      const route = routePlan(r, point, options.allowBuildingId || null);
      if (!route) continue;
      const score = route.length;
      if (!best || score < best.score) best = { point, route, score };
    }
    return best;
  }

  function move(r, dt, now) {
    if (
      r.routeNavigationSignature !== navigationSignature() &&
      r.routeGoal
    ) {
      const replanned = routePlan(r, r.routeGoal, r.routeAllowBuildingId || null);
      if (!replanned) {
        releaseReservation(r);
        r.route = [];
        r.routeGoal = null;
        r.phase = "idleWait";
        r.phaseStarted = now;
        return;
      }
      setRoute(
        r,
        replanned,
        r.routeGoal,
        r.after,
        r.routeAllowBuildingId || null
      );
    }

    const target = r.route?.[r.routeIndex];
    if (!target) {
      r.phase = r.after || "idleWait";
      r.phaseStarted = now;
      return;
    }

    const dx = target.x - r.x;
    const dy = target.y - r.y;
    const distance = Math.hypot(dx, dy);
    r.direction = directionForMovement(dx, dy);
    setAnim(r, "run", now);

    const step = SPEED * dt;
    if (distance <= step) {
      r.x = target.x;
      r.y = target.y;
      r.routeIndex += 1;
      if (r.routeIndex >= r.route.length) {
        r.phase = r.after || "idleWait";
        r.phaseStarted = now;
      }
    } else {
      r.x += (dx / distance) * step;
      r.y += (dy / distance) * step;
    }
  }

  function sources() {
    const a = area();
    const sig = [a.minX, a.minY, a.maxX, a.maxY].join(":");
    if (sig === woodKey && woodSources.length) return woodSources;

    const list = [];
    outer:
    for (let y = a.minY - 7; y < a.maxY + 7; y += 1) {
      for (let x = a.minX - 7; x < a.maxX + 7; x += 1) {
        const d = Math.max(
          a.minX - x,
          x - (a.maxX - 1),
          a.minY - y,
          y - (a.maxY - 1),
          0
        );
        if (d < 3 || d > 7) continue;
        const score = hash(`${x}:${y}:${sig}`);
        if (score % 7) continue;
        if (
          list.some(
            (v) => Math.max(Math.abs(v.x - x), Math.abs(v.y - y)) < 2
          )
        ) continue;
        list.push({
          id: `wood-${x}-${y}`,
          x,
          y,
          asset: WOOD[score % WOOD.length]
        });
        if (list.length >= 16) break outer;
      }
    }

    woodKey = sig;
    woodSources = list;
    return list;
  }

  function layers() {
    map = document.getElementById("town-map");
    const world = map?.querySelector(".terrain-floor-world");
    if (!world) return null;

    let woodLayer = world.querySelector(".dog-worker-wood-layer");
    if (!woodLayer) {
      woodLayer = document.createElement("div");
      woodLayer.className = "dog-worker-wood-layer";
      world.appendChild(woodLayer);
    }

    let dogLayer = world.querySelector(".dog-worker-dog-layer");
    if (!dogLayer) {
      dogLayer = document.createElement("div");
      dogLayer.className = "dog-worker-dog-layer";
      world.appendChild(dogLayer);
    }

    const list = sources();
    const sig = woodKey + ":" + list.map((s) => s.id).join("|");
    if (woodLayer.dataset.sig !== sig) {
      woodLayer.dataset.sig = sig;
      woodLayer.innerHTML = list.map((s) => {
        const p = screen(s.x + 0.5, s.y + 0.5);
        return `<img class="dog-worker-wood-source" src="${s.asset}" alt="" draggable="false" style="left:${p.x}px;top:${p.y}px;z-index:${4800 + Math.round(p.y * 10)}">`;
      }).join("");
    }

    return { world, dogLayer };
  }

  function compatibleBuilding(r, type) {
    const list = (state?.buildings || []).filter((b) => b.type === type);
    if (!list.length) return null;

    let building = list.find((b) => b.id === r.dog.assignedBuildingId);
    if (!building) {
      building = [...list].sort(
        (a, b) =>
          (Math.abs(a.worldX - r.x) + Math.abs(a.worldY - r.y)) -
          (Math.abs(b.worldX - r.x) + Math.abs(b.worldY - r.y))
      )[0];
      r.dog.assignedBuildingId = building.id;
      if (typeof saveState === "function") saveState();
    }
    return building;
  }

  function buildingEdge(building) {
    const c = typeof getCatalog === "function" ? getCatalog(building.type) : null;
    if (!c) return [];
    const out = [];

    for (let x = building.worldX - 1; x <= building.worldX + c.footprintWidth; x += 1) {
      out.push({ x: x + 0.5, y: building.worldY - 0.5 });
      out.push({ x: x + 0.5, y: building.worldY + c.footprintHeight + 0.5 });
    }
    for (let y = building.worldY; y < building.worldY + c.footprintHeight; y += 1) {
      out.push({ x: building.worldX - 0.5, y: y + 0.5 });
      out.push({ x: building.worldX + c.footprintWidth + 0.5, y: y + 0.5 });
    }
    return out;
  }

  function cropCorners(building) {
    const c = typeof getCatalog === "function" ? getCatalog(building.type) : null;
    if (!c) return [];
    return [
      { x: building.worldX + 0.5, y: building.worldY + 0.5, name: "north" },
      { x: building.worldX + c.footprintWidth - 0.5, y: building.worldY + 0.5, name: "east" },
      { x: building.worldX + c.footprintWidth - 0.5, y: building.worldY + c.footprintHeight - 0.5, name: "south" },
      { x: building.worldX + 0.5, y: building.worldY + c.footprintHeight - 0.5, name: "west" }
    ];
  }

  function kitchenPoints(building) {
    const c = typeof getCatalog === "function" ? getCatalog(building.type) : null;
    if (!c) return null;

    const topY = building.worldY + 0.5;
    const centreX = building.worldX + c.footprintWidth / 2;
    const centres = [
      { x: centreX, y: topY },
      { x: building.worldX + Math.max(0.5, c.footprintWidth / 2 - 1), y: topY },
      { x: building.worldX + Math.min(c.footprintWidth - 0.5, c.footprintWidth / 2 + 1), y: topY }
    ];

    return {
      centres,
      north: { x: building.worldX + 0.5, y: topY },
      east: { x: building.worldX + c.footprintWidth - 0.5, y: topY }
    };
  }

  function idleCandidate(r, attempt) {
    const a = area();
    const seed = hash(`${r.dog.id}:${r.seq}:${attempt}`);
    const width = a.maxX - a.minX + WANDER_MARGIN * 2;
    const height = a.maxY - a.minY + WANDER_MARGIN * 2;
    return {
      x: a.minX - WANDER_MARGIN + 0.5 + (seed % width),
      y: a.minY - WANDER_MARGIN + 0.5 + ((seed >>> 8) % height)
    };
  }

  function startIdle(r, now) {
    r.seq += 1;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const target = idleCandidate(r, attempt);
      if (!stationaryFree(r, target)) continue;
      if (routeTo(r, target, { after: "idleWait", reserve: true })) {
        r.waitUntil = now + 900 + (hash(`${r.dog.id}:${r.seq}`) % 1800);
        return;
      }
    }

    const here = centre(cell(r.x, r.y));
    reservePoint(r, here);
    r.x = here.x;
    r.y = here.y;
    r.phase = "idleWait";
    r.waitUntil = now + 1000;
  }

  function startWood(r, now = performance.now()) {
    const ordered = sources()
      .map((s) => ({ ...s, centreX: s.x + 0.5, centreY: s.y + 0.5 }))
      .sort(
        (a, b) =>
          Math.hypot(a.centreX - r.x, a.centreY - r.y) -
          Math.hypot(b.centreX - r.x, b.centreY - r.y)
      );

    for (const source of ordered) {
      const around = [
        { x: source.centreX + 1, y: source.centreY },
        { x: source.centreX - 1, y: source.centreY },
        { x: source.centreX, y: source.centreY + 1 },
        { x: source.centreX, y: source.centreY - 1 }
      ];
      const choice = bestReachableTarget(r, around, { stationary: true });
      if (!choice) continue;

      r.wood = { ...source, x: source.centreX, y: source.centreY };
      r.digUntil = 0;
      if (routeTo(r, choice.point, { after: "digWood", reserve: true })) return;
    }

    startIdle(r, now);
  }

  function returnStorage(r, now = performance.now()) {
    const building = compatibleBuilding(r, "storage");
    if (!building) {
      startIdle(r, now);
      return;
    }

    const choice = bestReachableTarget(r, buildingEdge(building), {
      stationary: true
    });
    if (!choice) {
      startIdle(r, now);
      return;
    }

    r.storage = building;
    routeTo(r, choice.point, { after: "deliver", reserve: true });
  }

  function chooseInitialCropCorner(r, building) {
    const corners = cropCorners(building);
    const candidates = corners
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => stationaryFree(r, point));

    let best = null;
    for (const candidate of candidates) {
      const route = routePlan(r, candidate.point, building.id);
      if (!route) continue;
      if (!best || route.length < best.score) {
        best = { ...candidate, score: route.length };
      }
    }
    return best;
  }

  function startCrop(r, now) {
    const building = compatibleBuilding(r, "crop_farm");
    if (!building) {
      startIdle(r, now);
      return;
    }

    r.crop = building;
    const chosen = chooseInitialCropCorner(r, building);
    if (!chosen) {
      r.phase = "cropWaitingForCorner";
      r.waitUntil = now + 600;
      setAnim(r, "idle", now);
      return;
    }

    r.cropCornerIndex = chosen.index;
    routeTo(r, chosen.point, {
      after: "cropCornerAction",
      reserve: true,
      allowBuildingId: building.id
    });
  }

  function cropActionName(r) {
    const sequence = ["dig", "howl", "idle"];
    const seed = hash(`${r.dog.id}:crop`);
    return sequence[(seed + (r.cropCornerVisits || 0)) % sequence.length];
  }

  function startCropCornerAction(r, now) {
    const action = cropActionName(r);
    r.cropCornerAction = action;
    r.cropCornerVisits = (r.cropCornerVisits || 0) + 1;
    r.phaseStarted = now;
    if (action === "dig") r.actionUntil = now + CROP_DIG_MS;
    else if (action === "howl") r.actionUntil = now + CROP_HOWL_MS;
    else r.actionUntil = now + CROP_IDLE_MS;
  }

  function goNextCropCorner(r, now) {
    const corners = cropCorners(r.crop);
    if (!corners.length) {
      startIdle(r, now);
      return;
    }

    const nextIndex = ((r.cropCornerIndex || 0) + 1) % corners.length;
    const target = corners[nextIndex];
    if (!stationaryFree(r, target)) {
      r.phase = "cropWaitingForNextCorner";
      r.waitUntil = now + 500;
      setAnim(r, "idle", now);
      return;
    }

    r.cropCornerIndex = nextIndex;
    routeTo(r, target, {
      after: "cropCornerAction",
      reserve: true,
      allowBuildingId: r.crop.id
    });
  }

  function chooseKitchenCentre(r, building) {
    const points = kitchenPoints(building);
    if (!points) return null;
    return bestReachableTarget(r, points.centres, {
      stationary: true,
      allowBuildingId: building.id
    });
  }

  function startKitchen(r, now) {
    const building = compatibleBuilding(r, "food");
    if (!building) {
      startIdle(r, now);
      return;
    }

    r.kitchen = building;
    const choice = chooseKitchenCentre(r, building);
    if (!choice) {
      r.phase = "kitchenWaitingForCentre";
      r.waitUntil = now + 700;
      setAnim(r, "idle", now);
      return;
    }

    r.kitchenCentre = { ...choice.point };
    routeTo(r, choice.point, {
      after: "kitchenCentre",
      reserve: true,
      allowBuildingId: building.id
    });
  }

  function beginKitchenExcursion(r, now) {
    const points = kitchenPoints(r.kitchen);
    if (!points) {
      startIdle(r, now);
      return;
    }

    if (!stationaryFree(r, points.east)) {
      r.kitchenCentreUntil = now + 1000;
      setAnim(r, "idle", now);
      return;
    }

    if (
      routeVia(r, [points.north, points.east], {
        after: "kitchenEastHowl",
        reserveFinal: true,
        allowBuildingId: r.kitchen.id
      })
    ) {
      r.kitchenCentreUntil = 0;
    } else {
      r.kitchenCentreUntil = now + 1000;
    }
  }

  function returnKitchenCentre(r, now) {
    const choice = chooseKitchenCentre(r, r.kitchen);
    if (!choice) {
      r.phase = "kitchenEastIdle";
      r.waitUntil = now + 700;
      setAnim(r, "idle", now);
      return;
    }

    r.kitchenCentre = { ...choice.point };
    routeTo(r, choice.point, {
      after: "kitchenCentre",
      reserve: true,
      allowBuildingId: r.kitchen.id
    });
  }

  function resetWorkState(r) {
    releaseReservation(r);
    r.route = [];
    r.routeIndex = 0;
    r.routeGoal = null;
    r.routeAllowBuildingId = null;
    r.nextCropDig = 0;
    r.digUntil = 0;
    r.actionUntil = 0;
    r.waitUntil = 0;
    r.kitchenCentreUntil = 0;
    r.cropCornerAction = null;
    r.wood = null;
    r.storage = null;
    r.crop = null;
    r.kitchen = null;
  }

  function jobChanged(r, now) {
    const job = r.dog.job || "idle";
    if (r.job === job) return false;

    resetWorkState(r);
    r.job = job;

    if (job === "sticks") startWood(r, now);
    else if (job === "crop_farm") startCrop(r, now);
    else if (job === "kitchen") startKitchen(r, now);
    else startIdle(r, now);
    return true;
  }

  function update(r, dt, now) {
    jobChanged(r, now);

    if (r.phase === "move") {
      move(r, dt, now);
      return;
    }

    if (r.job === "sticks") {
      if (r.phase === "digWood") {
        if (!r.digUntil) r.digUntil = now + STICK_DIG_MS;
        faceToward(r, r.wood);
        setAnim(r, "dig", now);
        if (now >= r.digUntil) {
          r.digUntil = 0;
          returnStorage(r, now);
        }
        return;
      }

      if (r.phase === "deliver") {
        const c = r.storage && typeof getCatalog === "function"
          ? getCatalog(r.storage.type)
          : null;
        if (r.storage && c) {
          faceToward(r, {
            x: r.storage.worldX + c.footprintWidth / 2,
            y: r.storage.worldY + c.footprintHeight / 2
          });
        }
        setAnim(r, "idle", now);
        if (!r.waitUntil) r.waitUntil = now + 500;
        if (now >= r.waitUntil) {
          r.waitUntil = 0;
          startWood(r, now);
        }
        return;
      }

      startWood(r, now);
      return;
    }

    if (r.job === "crop_farm") {
      if (r.phase === "cropCornerAction") {
        if (!r.cropCornerAction || !r.actionUntil) startCropCornerAction(r, now);

        const c = r.crop && typeof getCatalog === "function"
          ? getCatalog(r.crop.type)
          : null;
        if (r.crop && c && r.cropCornerAction === "dig") {
          faceToward(r, {
            x: r.crop.worldX + c.footprintWidth / 2,
            y: r.crop.worldY + c.footprintHeight / 2
          });
        }

        setAnim(r, r.cropCornerAction || "idle", now);

        if (now >= r.actionUntil) {
          r.actionUntil = 0;
          r.cropCornerAction = null;
          goNextCropCorner(r, now);
        }
        return;
      }

      if (r.phase === "cropWaitingForCorner") {
        setAnim(r, "idle", now);
        if (now >= (r.waitUntil || 0)) startCrop(r, now);
        return;
      }

      if (r.phase === "cropWaitingForNextCorner") {
        setAnim(r, "idle", now);
        if (now >= (r.waitUntil || 0)) goNextCropCorner(r, now);
        return;
      }

      startCrop(r, now);
      return;
    }

    if (r.job === "kitchen") {
      if (r.phase === "kitchenCentre") {
        setAnim(r, "idle", now);
        if (!r.kitchenCentreUntil) {
          r.kitchenCentreUntil =
            now +
            KITCHEN_IDLE_MIN_MS +
            (hash(`${r.dog.id}:${r.seq}:kitchen`) % KITCHEN_IDLE_VARIANCE_MS);
          r.seq += 1;
        }
        if (now >= r.kitchenCentreUntil) beginKitchenExcursion(r, now);
        return;
      }

      if (r.phase === "kitchenEastHowl") {
        setAnim(r, "howl", now);
        if (!r.actionUntil) r.actionUntil = now + KITCHEN_HOWL_MS;
        if (now >= r.actionUntil) {
          r.actionUntil = 0;
          r.phase = "kitchenEastIdle";
          r.waitUntil = now + KITCHEN_POST_HOWL_IDLE_MS;
        }
        return;
      }

      if (r.phase === "kitchenEastIdle") {
        setAnim(r, "idle", now);
        if (now >= (r.waitUntil || 0)) {
          r.waitUntil = 0;
          returnKitchenCentre(r, now);
        }
        return;
      }

      if (r.phase === "kitchenWaitingForCentre") {
        setAnim(r, "idle", now);
        if (now >= (r.waitUntil || 0)) startKitchen(r, now);
        return;
      }

      startKitchen(r, now);
      return;
    }

    if (r.phase === "idleWait") {
      setAnim(r, "idle", now);
      if (!r.waitUntil) r.waitUntil = now + 1000;
      if (now >= r.waitUntil) {
        r.waitUntil = 0;
        startIdle(r, now);
      }
      return;
    }

    startIdle(r, now);
  }

  function safeSpawn(index, used) {
    const a = area();
    const blocked = buildingBlockedCells();
    const cx = Math.floor((a.minX + a.maxX - 1) / 2);
    const cy = Math.floor((a.minY + a.maxY - 1) / 2);
    const candidates = [];

    for (let radius = 0; radius < Math.max(a.width, a.height); radius += 1) {
      for (let y = cy - radius; y <= cy + radius; y += 1) {
        for (let x = cx - radius; x <= cx + radius; x += 1) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== radius) continue;
          const k = `${x},${y}`;
          if (used.has(k)) continue;
          if (!inside(x, y, a) || !walkable({ x, y }, blocked)) continue;
          candidates.push({ x, y });
        }
      }
      if (candidates.length > index) break;
    }

    const chosen =
      candidates[index % Math.max(1, candidates.length)] ||
      { x: a.minX + 1 + index, y: a.minY + 1 };
    used.add(key(chosen));
    return centre(chosen);
  }

  function ensureDogs(dogLayer) {
    const list = state?.dogs || [];
    const active = new Set(list.map((d) => d.id));

    for (const [id, r] of dogs) {
      if (!active.has(id)) {
        releaseReservation(r);
        r.el.remove();
        dogs.delete(id);
      }
    }

    const usedSpawns = new Set(
      [...dogs.values()].map((r) => key(cell(r.x, r.y)))
    );

    list.forEach((dog, index) => {
      let r = dogs.get(dog.id);
      if (!r) {
        const el = document.createElement("div");
        el.className = "dog-worker-sprite";
        el.dataset.dogId = dog.id;
        dogLayer.appendChild(el);

        const spawn = safeSpawn(index, usedSpawns);
        r = {
          dog,
          el,
          x: spawn.x,
          y: spawn.y,
          direction: 1,
          phase: "idleWait",
          job: null,
          route: [],
          routeIndex: 0,
          routeGoal: null,
          routeNavigationSignature: "",
          routeAllowBuildingId: null,
          seq: index + 1,
          waitUntil: performance.now() + index * 300,
          reservedCellKey: null,
          cropCornerIndex: index % 4,
          cropCornerVisits: index
        };
        dogs.set(dog.id, r);
        reservePoint(r, spawn);
      } else {
        r.dog = dog;
        if (r.el.parentNode !== dogLayer) dogLayer.appendChild(r.el);
      }
    });
  }

  function position(r) {
    const p = screen(r.x, r.y);
    r.el.style.left = `${p.x}px`;
    r.el.style.top = `${p.y}px`;
    r.el.style.zIndex = String(5000 + Math.round(p.y * 10) + 3);
    r.el.dataset.breed = r.dog.breed || "";
    r.el.dataset.phase = r.phase || "";
  }

  function tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;

    const l = layers();
    if (l) {
      ensureDogs(l.dogLayer);
      for (const r of dogs.values()) {
        update(r, dt, now);
        position(r);
      }
    }
    requestAnimationFrame(tick);
  }

  document.addEventListener("change", (event) => {
    const select = event.target.closest?.("[data-dog-job]");
    if (!select) return;

    queueMicrotask(() => {
      const dog = (state?.dogs || []).find((d) => d.id === select.dataset.dogJob);
      if (!dog) return;

      const type =
        dog.job === "sticks" ? "storage" :
        dog.job === "crop_farm" ? "crop_farm" :
        dog.job === "kitchen" ? "food" :
        dog.job === "protein_farm" ? "protein_farm" :
        null;

      if (type) {
        const building = (state.buildings || []).find((b) => b.type === type);
        dog.assignedBuildingId = building?.id || null;
      } else {
        delete dog.assignedBuildingId;
      }

      if (typeof saveState === "function") saveState();
      const r = dogs.get(dog.id);
      if (r) r.job = null;
    });
  });

  if (map) {
    new MutationObserver(() => {
      requestAnimationFrame(() => {
        const l = layers();
        if (l) ensureDogs(l.dogLayer);
      });
    }).observe(map, { childList: true });
  }

  window.RescuePupDogWorkers = Object.freeze({
    movementSpeedTilesPerSecond: SPEED,
    boundaryGate: "south-west-centre-two-tiles",
    collisionMode: "A*-buildings-fence; stationary-only dog reservations",
    stationaryRule: "dogs may share transit tiles but never stationary tiles",
    spriteMapping: {
      fullSheet: { width: 960, height: 1024, cell: 64 },
      displayCell: SIZE,
      bite: { rows: [0, 3], cols: [0, 14] },
      death: { rows: [4, 7], cols: [0, 11] },
      howl: { rows: [8, 11], cols: [0, 8] },
      run: { rows: [12, 15], cols: [0, 7] },
      idle: { rows: [12, 15], cols: [11, 14] },
      directions: {
        0: "screen-SW",
        1: "screen-SE",
        2: "screen-NW",
        3: "screen-NE"
      },
      dig: { source: "death", frames: [0, 1] }
    },
    breedSheets: BREED_SHEETS,
    get reservations() {
      return [...stationaryReservations.entries()].map(([tile, dogId]) => ({
        tile,
        dogId
      }));
    },
    get woodSources() {
      return sources().map((x) => ({ ...x }));
    },
    get dogs() {
      return [...dogs.values()].map((r) => ({
        id: r.dog.id,
        breed: r.dog.breed,
        job: r.dog.job,
        assignedBuildingId: r.dog.assignedBuildingId || null,
        phase: r.phase,
        animation: r.anim,
        directionRow: r.direction,
        stationaryTile: r.reservedCellKey,
        x: r.x,
        y: r.y
      }));
    }
  });

  layers();
  requestAnimationFrame(tick);
})();
