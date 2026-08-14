"use strict";

/*
  Dog sprites are the organised strips from the supplied 960x1024 main sheet.
  Verified mapping against the supplied reference images:
  bite rows 0-3 cols 0-14; death rows 4-7 cols 0-11;
  howl rows 8-11 cols 0-8; run rows 12-15 cols 0-7;
  idle rows 12-15 cols 11-14.

  IMPORTANT: frame-row direction is based on the visible screen direction in the
  supplied direction reference, not the logical grid direction:
    row 0 = screen down-left  (SW)
    row 1 = screen down-right (SE)
    row 2 = screen up-left    (NW)
    row 3 = screen up-right   (NE)

  Dig intentionally uses only death frames 0 and 1.
  Movement uses logical-tile A* navigation so dogs cannot cross building
  footprints or the boundary fence. The only inside/outside crossing is the
  approved two-tile opening on the south-west side of the buildable area.
*/
(() => {
  const SIZE = 32;
  const SPEED = 1.05;
  const WANDER_MARGIN = 3;
  const NAV_MARGIN = 8;
  const STICK_DIG = 10000;
  const CROP_DIG_INTERVAL = 10000;
  const CROP_DIG_TIME = 1200;

  const SPRITES = {
    run: "./wolf/wolf-run.png",
    idle: "./wolf/wolf-idle.png",
    dig: "./wolf/wolf-death.png"
  };
  const WOOD = ["./tile_048.png", "./tile_049.png", "./tile_050.png", "./tile_051.png", "./tile_052.png"];

  const dogs = new Map();
  let map = document.getElementById("town-map");
  let last = performance.now();
  let woodKey = "";
  let woodSources = [];

  const area = () => typeof currentArea === "function"
    ? currentArea()
    : ({ minX: 0, minY: 0, maxX: 12, maxY: 12, width: 12, height: 12 });

  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const inside = (x, y, a = area()) => x >= a.minX && y >= a.minY && x < a.maxX && y < a.maxY;
  const gateXs = (a = area()) => {
    const x = a.minX + Math.floor((a.maxX - a.minX) / 2) - 1;
    return [x, x + 1];
  };
  const cell = (x, y) => ({ x: Math.floor(x), y: Math.floor(y) });
  const centre = (c) => ({ x: c.x + 0.5, y: c.y + 0.5 });
  const key = (c) => `${c.x},${c.y}`;

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
    if (Math.abs(dx) + Math.abs(dy) > 0.001) r.direction = directionForMovement(dx, dy);
  }

  function setAnim(r, name, now) {
    const frames = name === "run" ? 8 : name === "dig" ? 2 : 4;
    const cols = name === "dig" ? 12 : frames;
    const ms = name === "run" ? 160 : name === "dig" ? 420 : 320;
    const frame = Math.floor(now / ms) % frames;
    if (r.anim === name && r.frame === frame && r.lastDir === r.direction) return;
    r.anim = name;
    r.frame = frame;
    r.lastDir = r.direction;
    r.el.style.backgroundImage = `url("${SPRITES[name]}")`;
    r.el.style.backgroundSize = `${cols * SIZE}px ${4 * SIZE}px`;
    r.el.style.backgroundPosition = `${-frame * SIZE}px ${-r.direction * SIZE}px`;
  }

  function buildingBlockedCells() {
    const blocked = new Set();
    for (const b of state?.buildings || []) {
      const c = typeof getCatalog === "function" ? getCatalog(b.type) : null;
      if (!c) continue;
      for (let yy = 0; yy < c.footprintHeight; yy += 1) {
        for (let xx = 0; xx < c.footprintWidth; xx += 1) blocked.add(`${b.worldX + xx},${b.worldY + yy}`);
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
    return c.x >= a.minX - NAV_MARGIN && c.x < a.maxX + NAV_MARGIN
      && c.y >= a.minY - NAV_MARGIN && c.y < a.maxY + NAV_MARGIN;
  }

  function crossingFenceAllowed(from, to, a = area()) {
    const fromInside = inside(from.x, from.y, a);
    const toInside = inside(to.x, to.y, a);
    if (fromInside === toInside) return true;
    if (from.x !== to.x) return false;
    const inner = fromInside ? from : to;
    const outer = fromInside ? to : from;
    return inner.y === a.maxY - 1
      && outer.y === a.maxY
      && gateXs(a).includes(inner.x);
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

  function planCells(start, target) {
    const blocked = buildingBlockedCells();
    const startKey = key(start);
    const targetKey = key(target);
    if (!walkable(target, blocked)) return null;
    if (startKey === targetKey) return [start];
    blocked.delete(startKey);

    const open = [{ cell: start, g: 0, f: Math.abs(target.x - start.x) + Math.abs(target.y - start.y) }];
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

  function routePlan(r, target) {
    const cells = planCells(cell(r.x, r.y), cell(target.x, target.y));
    if (!cells) return null;
    const points = cells.slice(1).map(centre);
    const final = points[points.length - 1];
    if (!final || Math.abs(final.x - target.x) > 0.001 || Math.abs(final.y - target.y) > 0.001) points.push(target);
    return points;
  }

  function routeTo(r, target) {
    const route = routePlan(r, target);
    if (!route) return false;
    r.route = route;
    r.routeIndex = 0;
    r.routeGoal = { x: target.x, y: target.y };
    r.routeNavigationSignature = navigationSignature();
    r.phase = route.length ? "move" : (r.after || "idleWait");
    r.phaseStarted = performance.now();
    return true;
  }

  function bestReachableTarget(r, points) {
    let best = null;
    for (const point of points) {
      const route = routePlan(r, point);
      if (!route) continue;
      const score = route.length;
      if (!best || score < best.score) best = { point, route, score };
    }
    return best;
  }

  function move(r, dt, now) {
    if (r.routeNavigationSignature !== navigationSignature() && r.routeGoal) {
      if (!routeTo(r, r.routeGoal)) {
        r.route = [];
        r.routeGoal = null;
        r.phase = r.after || "idleWait";
        r.phaseStarted = now;
        return;
      }
    }

    const t = r.route?.[r.routeIndex];
    if (!t) {
      r.phase = r.after || "idleWait";
      r.phaseStarted = now;
      return;
    }

    const dx = t.x - r.x;
    const dy = t.y - r.y;
    const distance = Math.hypot(dx, dy);
    r.direction = directionForMovement(dx, dy);
    setAnim(r, "run", now);

    const step = SPEED * dt;
    if (distance <= step) {
      r.x = t.x;
      r.y = t.y;
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
    outer: for (let y = a.minY - 7; y < a.maxY + 7; y += 1) {
      for (let x = a.minX - 7; x < a.maxX + 7; x += 1) {
        const d = Math.max(a.minX - x, x - (a.maxX - 1), a.minY - y, y - (a.maxY - 1), 0);
        if (d < 3 || d > 7) continue;
        const score = hash(`${x}:${y}:${sig}`);
        if (score % 7) continue;
        if (list.some((v) => Math.max(Math.abs(v.x - x), Math.abs(v.y - y)) < 2)) continue;
        list.push({ id: `wood-${x}-${y}`, x, y, asset: WOOD[score % WOOD.length] });
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
    let wl = world.querySelector(".dog-worker-wood-layer");
    if (!wl) {
      wl = document.createElement("div");
      wl.className = "dog-worker-wood-layer";
      world.appendChild(wl);
    }
    let dl = world.querySelector(".dog-worker-dog-layer");
    if (!dl) {
      dl = document.createElement("div");
      dl.className = "dog-worker-dog-layer";
      world.appendChild(dl);
    }
    const list = sources();
    const sig = woodKey + ":" + list.map((s) => s.id).join("|");
    if (wl.dataset.sig !== sig) {
      wl.dataset.sig = sig;
      wl.innerHTML = list.map((s) => {
        const p = screen(s.x + 0.5, s.y + 0.5);
        return `<img class="dog-worker-wood-source" src="${s.asset}" alt="" draggable="false" style="left:${p.x}px;top:${p.y}px;z-index:${4800 + Math.round(p.y * 10)}">`;
      }).join("");
    }
    return { world, dl };
  }

  function compatibleBuilding(r, type) {
    const list = (state?.buildings || []).filter((b) => b.type === type);
    if (!list.length) return null;
    let b = list.find((x) => x.id === r.dog.assignedBuildingId);
    if (!b) {
      b = [...list].sort((aa, bb) =>
        (Math.abs(aa.worldX - r.x) + Math.abs(aa.worldY - r.y))
        - (Math.abs(bb.worldX - r.x) + Math.abs(bb.worldY - r.y))
      )[0];
      r.dog.assignedBuildingId = b.id;
      if (typeof saveState === "function") saveState();
    }
    return b;
  }

  function buildingEdge(b) {
    const c = typeof getCatalog === "function" ? getCatalog(b.type) : null;
    if (!c) return [];
    const out = [];
    for (let x = b.worldX - 1; x <= b.worldX + c.footprintWidth; x += 1) {
      out.push({ x: x + 0.5, y: b.worldY - 0.5 });
      out.push({ x: x + 0.5, y: b.worldY + c.footprintHeight + 0.5 });
    }
    for (let y = b.worldY; y < b.worldY + c.footprintHeight; y += 1) {
      out.push({ x: b.worldX - 0.5, y: y + 0.5 });
      out.push({ x: b.worldX + c.footprintWidth + 0.5, y: y + 0.5 });
    }
    return out;
  }

  function cropLoop(b) {
    const c = typeof getCatalog === "function" ? getCatalog(b.type) : null;
    if (!c) return [];
    const L = b.worldX - 0.5;
    const R = b.worldX + c.footprintWidth + 0.5;
    const T = b.worldY - 0.5;
    const B = b.worldY + c.footprintHeight + 0.5;
    const raw = [];
    for (let x = L; x <= R; x += 1) raw.push({ x, y: T });
    for (let y = T + 1; y <= B; y += 1) raw.push({ x: R, y });
    for (let x = R - 1; x >= L; x -= 1) raw.push({ x, y: B });
    for (let y = B - 1; y > T; y -= 1) raw.push({ x: L, y });
    const blocked = buildingBlockedCells();
    return raw.filter((p) => walkable(cell(p.x, p.y), blocked));
  }

  function idleCandidate(r, attempt) {
    const a = area();
    const seed = hash(`${r.dog.id}:${r.seq}:${attempt}`);
    const w = a.maxX - a.minX + WANDER_MARGIN * 2;
    const h = a.maxY - a.minY + WANDER_MARGIN * 2;
    return {
      x: a.minX - WANDER_MARGIN + 0.5 + (seed % w),
      y: a.minY - WANDER_MARGIN + 0.5 + ((seed >>> 8) % h)
    };
  }

  function startIdle(r, now) {
    r.seq += 1;
    r.after = "idleWait";
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const target = idleCandidate(r, attempt);
      if (routeTo(r, target)) {
        r.waitUntil = now + 900 + (hash(`${r.dog.id}:${r.seq}`) % 1800);
        return;
      }
    }
    r.phase = "idleWait";
    r.waitUntil = now + 1000;
  }

  function startWood(r) {
    const ordered = sources()
      .map((s) => ({ ...s, centreX: s.x + 0.5, centreY: s.y + 0.5 }))
      .sort((aa, bb) => Math.hypot(aa.centreX - r.x, aa.centreY - r.y) - Math.hypot(bb.centreX - r.x, bb.centreY - r.y));

    for (const s of ordered) {
      const around = [
        { x: s.centreX + 1, y: s.centreY },
        { x: s.centreX - 1, y: s.centreY },
        { x: s.centreX, y: s.centreY + 1 },
        { x: s.centreX, y: s.centreY - 1 }
      ];
      const choice = bestReachableTarget(r, around);
      if (!choice) continue;
      r.wood = { ...s, x: s.centreX, y: s.centreY };
      r.after = "digWood";
      r.digUntil = 0;
      routeTo(r, choice.point);
      return;
    }
    startIdle(r, performance.now());
  }

  function returnStorage(r) {
    const b = compatibleBuilding(r, "storage");
    if (!b) {
      startIdle(r, performance.now());
      return;
    }
    const choice = bestReachableTarget(r, buildingEdge(b));
    if (!choice) {
      startIdle(r, performance.now());
      return;
    }
    r.storage = b;
    r.after = "deliver";
    routeTo(r, choice.point);
  }

  function startCrop(r, now) {
    const b = compatibleBuilding(r, "crop_farm");
    if (!b) {
      startIdle(r, now);
      return;
    }
    r.crop = b;
    const loop = cropLoop(b);
    if (!loop.length) {
      startIdle(r, now);
      return;
    }
    for (let attempt = 0; attempt < loop.length; attempt += 1) {
      r.cropIndex = (r.cropIndex || 0) % loop.length;
      const target = loop[r.cropIndex];
      r.after = "cropEdge";
      if (routeTo(r, target)) {
        if (!r.nextCropDig) r.nextCropDig = now + CROP_DIG_INTERVAL;
        return;
      }
      r.cropIndex = (r.cropIndex + 1) % loop.length;
    }
    startIdle(r, now);
  }

  function jobChanged(r, now) {
    const job = r.dog.job || "idle";
    if (r.job === job) return false;
    r.job = job;
    r.route = [];
    r.routeGoal = null;
    r.nextCropDig = 0;
    r.digUntil = 0;
    if (job === "sticks") startWood(r);
    else if (job === "crop_farm") startCrop(r, now);
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
        if (!r.digUntil) r.digUntil = now + STICK_DIG;
        faceToward(r, r.wood);
        setAnim(r, "dig", now);
        if (now >= r.digUntil) {
          r.digUntil = 0;
          returnStorage(r);
        }
        return;
      }
      if (r.phase === "deliver") {
        const c = r.storage && typeof getCatalog === "function" ? getCatalog(r.storage.type) : null;
        if (r.storage && c) faceToward(r, { x: r.storage.worldX + c.footprintWidth / 2, y: r.storage.worldY + c.footprintHeight / 2 });
        setAnim(r, "idle", now);
        if (!r.waitUntil) r.waitUntil = now + 500;
        if (now >= r.waitUntil) {
          r.waitUntil = 0;
          startWood(r);
        }
        return;
      }
      startWood(r);
      return;
    }

    if (r.job === "crop_farm") {
      if (r.phase === "cropDig") {
        const c = r.crop && typeof getCatalog === "function" ? getCatalog(r.crop.type) : null;
        if (r.crop && c) faceToward(r, { x: r.crop.worldX + c.footprintWidth / 2, y: r.crop.worldY + c.footprintHeight / 2 });
        setAnim(r, "dig", now);
        if (now >= r.digUntil) {
          const loop = cropLoop(r.crop);
          r.cropIndex = (r.cropIndex + 1) % Math.max(1, loop.length);
          r.nextCropDig = now + CROP_DIG_INTERVAL;
          startCrop(r, now);
        }
        return;
      }
      if (r.phase === "cropEdge") {
        if (now >= r.nextCropDig) {
          r.phase = "cropDig";
          r.digUntil = now + CROP_DIG_TIME;
          setAnim(r, "dig", now);
        } else {
          const loop = cropLoop(r.crop);
          r.cropIndex = (r.cropIndex + 1) % Math.max(1, loop.length);
          startCrop(r, now);
        }
        return;
      }
      startCrop(r, now);
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

  function safeSpawn(index) {
    const a = area();
    const blocked = buildingBlockedCells();
    const cx = Math.floor((a.minX + a.maxX - 1) / 2);
    const cy = Math.floor((a.minY + a.maxY - 1) / 2);
    const candidates = [];
    for (let radius = 0; radius < Math.max(a.width, a.height); radius += 1) {
      for (let y = cy - radius; y <= cy + radius; y += 1) {
        for (let x = cx - radius; x <= cx + radius; x += 1) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== radius) continue;
          if (!inside(x, y, a) || !walkable({ x, y }, blocked)) continue;
          candidates.push({ x, y });
        }
      }
      if (candidates.length > index) break;
    }
    const chosen = candidates[index % Math.max(1, candidates.length)] || { x: a.minX + 1, y: a.minY + 1 };
    return centre(chosen);
  }

  function ensureDogs(dl) {
    const list = state?.dogs || [];
    const active = new Set(list.map((d) => d.id));
    for (const [id, r] of dogs) {
      if (!active.has(id)) {
        r.el.remove();
        dogs.delete(id);
      }
    }

    list.forEach((dog, i) => {
      let r = dogs.get(dog.id);
      if (!r) {
        const el = document.createElement("div");
        el.className = "dog-worker-sprite";
        el.dataset.dogId = dog.id;
        dl.appendChild(el);
        const spawn = safeSpawn(i);
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
          seq: i + 1,
          waitUntil: performance.now() + i * 300,
          cropIndex: i
        };
        dogs.set(dog.id, r);
      } else {
        r.dog = dog;
        if (r.el.parentNode !== dl) dl.appendChild(r.el);
      }
    });
  }

  function position(r) {
    const p = screen(r.x, r.y);
    r.el.style.left = `${p.x}px`;
    r.el.style.top = `${p.y}px`;
    r.el.style.zIndex = String(5000 + Math.round(p.y * 10) + 3);
  }

  function tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const l = layers();
    if (l) {
      ensureDogs(l.dl);
      for (const r of dogs.values()) {
        update(r, dt, now);
        position(r);
      }
    }
    requestAnimationFrame(tick);
  }

  document.addEventListener("change", (e) => {
    const s = e.target.closest?.("[data-dog-job]");
    if (!s) return;
    queueMicrotask(() => {
      const dog = (state?.dogs || []).find((d) => d.id === s.dataset.dogJob);
      if (!dog) return;
      const type = dog.job === "sticks" ? "storage" : dog.job === "crop_farm" ? "crop_farm" : null;
      if (type) {
        const b = (state.buildings || []).find((x) => x.type === type);
        dog.assignedBuildingId = b?.id || null;
      } else delete dog.assignedBuildingId;
      if (typeof saveState === "function") saveState();
      const r = dogs.get(dog.id);
      if (r) r.job = null;
    });
  });

  if (map) {
    new MutationObserver(() => requestAnimationFrame(() => {
      const l = layers();
      if (l) ensureDogs(l.dl);
    })).observe(map, { childList: true });
  }

  window.RescuePupDogWorkers = Object.freeze({
    movementSpeedTilesPerSecond: SPEED,
    boundaryGate: "south-west-centre-two-tiles",
    collisionMode: "tile-pathfinding-buildings-and-fence",
    spriteMapping: {
      bite: { rows: [0, 3], cols: [0, 14] },
      death: { rows: [4, 7], cols: [0, 11] },
      howl: { rows: [8, 11], cols: [0, 8] },
      run: { rows: [12, 15], cols: [0, 7] },
      idle: { rows: [12, 15], cols: [11, 14] },
      directions: { 0: "screen-SW", 1: "screen-SE", 2: "screen-NW", 3: "screen-NE" },
      dig: { source: "death", frames: [0, 1] }
    },
    get woodSources() { return sources().map((x) => ({ ...x })); },
    get dogs() {
      return [...dogs.values()].map((r) => ({
        id: r.dog.id,
        job: r.dog.job,
        assignedBuildingId: r.dog.assignedBuildingId || null,
        phase: r.phase,
        directionRow: r.direction,
        x: r.x,
        y: r.y
      }));
    }
  });

  layers();
  requestAnimationFrame(tick);
})();
