"use strict";

const STORAGE_KEY = "pawborough-save-v10";
const LEGACY_STORAGE_KEY = "pawborough-save-v8";

const resourceMeta = {
  materials: { label: "Sticks", icon: "assets/icons/materials.png" },
  food: { label: "Food", icon: "assets/icons/food.png" },
  coins: { label: "Coins", icon: "assets/icons/coins.png" }
};
const resourceOrder = ["materials", "food", "coins"];

const HQ_LEVEL_DATA = {
  1: { name: "Starter Yard", minX: 0, minY: 0, buildWidth: 12, buildHeight: 12 },
  2: { name: "Expanded Yard", minX: -2, minY: -2, buildWidth: 16, buildHeight: 16 },
  3: { name: "Open Yard", minX: -4, minY: -4, buildWidth: 20, buildHeight: 20 },
  4: { name: "Rescue Grounds", minX: -6, minY: -6, buildWidth: 24, buildHeight: 24 }
};
const HQ_UPGRADE_COSTS = {
  2: { materials: 12, coins: 45 },
  3: { materials: 26, coins: 95 },
  4: { materials: 42, coins: 160 }
};

const KENNEL_CAPACITY_BY_LEVEL = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7 };
const APPROVED_BUILDING_TYPES = new Set(["kennel", "storage", "food", "crop_farm", "protein_farm"]);

const buildingCatalog = [
  { type: "kennel", name: "Kennel", short: "Provides safe spaces for rescued dogs.", cost: { materials: 12, coins: 35 }, footprintWidth: 2, footprintHeight: 2, groundAnchorX: 1, groundAnchorY: 2, defaultGrid: { x: 2, y: 8 } },
  { type: "storage", name: "Stick Storage", short: "Stores the sticks your dogs collect.", cost: { materials: 8, coins: 25 }, footprintWidth: 3, footprintHeight: 2, groundAnchorX: 1.5, groundAnchorY: 2, defaultGrid: { x: 8, y: 8 } },
  { type: "food", name: "Kitchen", short: "Turns the rescue's food production into usable meals.", cost: { materials: 14, coins: 45 }, footprintWidth: 3, footprintHeight: 2, groundAnchorX: 1.5, groundAnchorY: 2, defaultGrid: { x: 7, y: 6 } },
  { type: "crop_farm", name: "Crop Farm", short: "Produces crop-based food with dogs assigned to it.", cost: { materials: 12, coins: 40 }, footprintWidth: 3, footprintHeight: 2, groundAnchorX: 1.5, groundAnchorY: 2, defaultGrid: { x: 1, y: 1 } },
  { type: "protein_farm", name: "Protein Farm", short: "Produces protein food with dogs assigned to it.", cost: { materials: 14, coins: 45 }, footprintWidth: 2, footprintHeight: 2, groundAnchorX: 1, groundAnchorY: 2, defaultGrid: { x: 9, y: 1 } }
];

const rescueTemplates = [
  { breed: "Puppy", note: "Small, curious, and ready for a safe place to land." },
  { breed: "Friendly Mixed Breed", note: "Social, eager, and happy to join the rescue." },
  { breed: "Nervous Rescue", note: "Quiet and watchful, but beginning to trust." },
  { breed: "Senior Dog", note: "Slow-paced, gentle, and looking for somewhere comfortable." },
  { breed: "Energetic Dog", note: "Full of energy and ready to get involved." },
  { breed: "Large Mixed Breed", note: "Big-hearted, steady, and keen to help." }
];
const dogNames = ["Butter", "Juniper", "Milo", "Pickle", "Dottie", "Toast", "Hazel", "Biscuit", "Mabel", "Scout", "Sunny", "Roo", "Clover", "Otis"];

let layoutIsoPoint = (worldX, worldY) => ({ x: (worldX - worldY) * 16, y: (worldX + worldY) * 8 });
let layoutIsoProject = (worldX, worldY, offsetX = 0, offsetY = 0) => {
  const point = layoutIsoPoint(worldX, worldY);
  return { x: point.x + offsetX, y: point.y + offsetY };
};
let renderMap = () => {};

function ensureCurrentShell() {
  document.body.innerHTML = `
    <main class="app-shell" aria-label="Pawborough game">
      <section class="splash" id="splash">
        <div class="splash-card">
          <img class="splash-paw" src="./assets/icons/dogs.png" alt="" draggable="false" />
          <h1>Pawborough</h1>
          <p>Rescue dogs. Put them to work. Grow the town.</p>
          <button class="primary-button" id="start-game" type="button">Start rescue</button>
        </div>
      </section>
      <section class="game-frame">
        <header class="top-bar">
          <div class="brand-block"><img src="./assets/icons/dogs.png" alt="" draggable="false" /><div><p class="eyebrow">Pawborough</p><h1>Rescue Yard</h1></div></div>
          <div class="top-actions"><button class="yard-button" id="yard-upgrade" type="button">Expand Yard</button><button class="icon-button" id="reset-game" type="button" aria-label="Reset game">↻</button></div>
        </header>
        <div class="resource-bar" id="resource-bar"></div>
        <section class="screen active map-screen" id="screen-home">
          <div class="town-map" id="town-map"></div>
          <div class="map-ui-overlay" id="map-ui-overlay" aria-live="polite"></div>
        </section>
        <section class="screen padded-screen" id="screen-dogs"></section>
        <section class="screen padded-screen" id="screen-rescue"></section>
        <nav class="bottom-nav" aria-label="Game controls">
          <button class="nav-button active" type="button" data-screen="home"><img class="nav-art" src="./pawborough-icon.svg" alt="" /><span>Town</span></button>
          <button class="nav-button" type="button" data-screen="dogs"><img class="nav-art" src="./assets/icons/dogs.png" alt="" /><span>Dogs</span></button>
          <button class="nav-button" type="button" data-screen="rescue"><img class="nav-art" src="./assets/icons/rescue.png" alt="" /><span>Rescue</span></button>
          <button class="nav-button build-hotbar-button" type="button" data-open-build><img class="nav-art" src="./assets/icons/build.png" alt="" /><span>Build</span></button>
        </nav>
      </section>
      <section class="sheet-backdrop" id="build-sheet" aria-hidden="true">
        <div class="sheet" role="dialog" aria-modal="true" aria-label="Build menu">
          <div class="sheet-header"><div><p class="eyebrow">Expand the rescue</p><h2>Build</h2></div><button class="icon-button" id="close-build" type="button" aria-label="Close build menu">×</button></div>
          <div class="build-grid" id="build-grid"></div>
        </div>
      </section>
      <div class="toast-stack" id="toast-stack"></div>
    </main>
  `;
}

ensureCurrentShell();

let state = loadState();
let selectedBuildingId = null;
let placementMode = null;

const els = {
  splash: document.getElementById("splash"),
  startGame: document.getElementById("start-game"),
  resetGame: document.getElementById("reset-game"),
  resourceBar: document.getElementById("resource-bar"),
  townMap: document.getElementById("town-map"),
  mapUi: document.getElementById("map-ui-overlay"),
  buildSheet: document.getElementById("build-sheet"),
  buildGrid: document.getElementById("build-grid"),
  closeBuild: document.getElementById("close-build"),
  toastStack: document.getElementById("toast-stack"),
  yardButton: document.getElementById("yard-upgrade")
};

function createDog(id, name, breed, note) { return { id, name, breed, note, job: "idle" }; }
function createInitialState() {
  return {
    version: 10,
    screen: "home",
    seenSplash: false,
    baseLevel: 1,
    resources: { materials: 28, food: 18, coins: 130 },
    buildings: [
      { id: "b-kennel-1", type: "kennel", level: 1, status: "ready", worldX: 2, worldY: 8 },
      { id: "b-storage-1", type: "storage", level: 1, status: "ready", worldX: 8, worldY: 8, storedUnits: 28, maxCapacity: 100 }
    ],
    dogs: [
      createDog("dog-1", "Butter", "Friendly Mixed Breed", "A sunny rescue who is keen to get involved."),
      createDog("dog-2", "Juniper", "Nervous Rescue", "Quiet and observant, slowly settling into Pawborough.")
    ],
    rescueOffers: makeOffers(3, 2),
    rescuedCount: 2,
    lastTick: Date.now()
  };
}

function cleanLegacyState(parsed) {
  const clean = createInitialState();
  clean.seenSplash = Boolean(parsed?.seenSplash);
  clean.baseLevel = Math.max(1, Math.min(4, Number(parsed?.baseLevel) || 1));
  clean.resources.materials = Math.max(0, Number(parsed?.resources?.materials) || clean.resources.materials);
  clean.resources.food = Math.max(0, Number(parsed?.resources?.food) || clean.resources.food);
  clean.resources.coins = Math.max(0, Number(parsed?.resources?.coins) || clean.resources.coins);
  const keptBuildings = (parsed?.buildings || []).filter((building) => APPROVED_BUILDING_TYPES.has(building.type)).map((building, index) => normalizeBuilding({ ...building, id: building.id || `b-${building.type}-${index}` }));
  if (keptBuildings.length) clean.buildings = keptBuildings;
  if (!clean.buildings.some((building) => building.type === "kennel")) clean.buildings.push({ id: "b-kennel-1", type: "kennel", level: 1, status: "ready", worldX: 2, worldY: 8 });
  if (!clean.buildings.some((building) => building.type === "storage")) clean.buildings.push({ id: "b-storage-1", type: "storage", level: 1, status: "ready", worldX: 8, worldY: 8, storedUnits: clean.resources.materials, maxCapacity: 100 });
  const legacyDogs = (parsed?.dogs || []).map((dog, index) => createDog(dog.id || `dog-${index + 1}`, dog.name || dogNames[index % dogNames.length], dog.breed || "Rescue Dog", dog.note || "Ready to settle into Pawborough."));
  if (legacyDogs.length) clean.dogs = legacyDogs;
  clean.rescuedCount = Math.max(clean.dogs.length, Number(parsed?.rescuedCount) || clean.dogs.length);
  clean.rescueOffers = makeOffers(3, clean.rescuedCount);
  syncStoredSticks(clean);
  return clean;
}

function loadState() {
  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    if (currentRaw) {
      const parsed = JSON.parse(currentRaw);
      if (parsed?.version === 10) {
        parsed.buildings = (parsed.buildings || []).filter((building) => APPROVED_BUILDING_TYPES.has(building.type)).map(normalizeBuilding);
        parsed.dogs = (parsed.dogs || []).map((dog) => ({ id: dog.id, name: dog.name, breed: dog.breed, note: dog.note, job: dog.job || "idle" }));
        parsed.resources = { materials: Math.max(0, Number(parsed.resources?.materials) || 0), food: Math.max(0, Number(parsed.resources?.food) || 0), coins: Math.max(0, Number(parsed.resources?.coins) || 0) };
        parsed.baseLevel = Math.max(1, Math.min(4, Number(parsed.baseLevel) || 1));
        parsed.rescueOffers = Array.isArray(parsed.rescueOffers) && parsed.rescueOffers.length ? parsed.rescueOffers : makeOffers(3, parsed.rescuedCount || 0);
        syncStoredSticks(parsed);
        return parsed;
      }
    }
    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) return cleanLegacyState(JSON.parse(legacyRaw));
  } catch {}
  return createInitialState();
}

function normalizeBuilding(building) {
  const level = Math.max(1, Math.min(6, Number(building.level) || 1));
  const normalized = { ...building, level, status: "ready" };
  if (normalized.type === "storage") {
    normalized.maxCapacity = Math.max(Number(normalized.maxCapacity) || 0, storageCapacity(level));
    normalized.storedUnits = Math.max(0, Math.min(normalized.maxCapacity, Number(normalized.storedUnits) || 0));
  }
  return normalized;
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function makeOffers(count, offset = 0) { return Array.from({ length: count }, (_, index) => { const template = rescueTemplates[(index + offset) % rescueTemplates.length]; const name = dogNames[(index + offset + 2) % dogNames.length]; return { id: `offer-${Date.now()}-${offset}-${index}`, name, breed: template.breed, note: template.note }; }); }
function nextOffer() { return makeOffers(1, state.rescuedCount + state.rescueOffers.length)[0]; }
function getCatalog(type) { return buildingCatalog.find((building) => building.type === type) || null; }
function buildingLevel(building) { return Math.max(1, Math.min(6, Number(building?.level) || 1)); }
function storageCapacity(level) { return Math.max(100, buildingLevel({ level }) * 100); }
function totalStickCapacity() { return state.buildings.filter((building) => building.type === "storage").reduce((sum, building) => sum + (Number(building.maxCapacity) || storageCapacity(building.level)), 0); }
function syncStoredSticks(targetState = state) { const storages = targetState.buildings.filter((building) => building.type === "storage"); const total = Math.max(0, Number(targetState.resources?.materials) || 0); let remaining = total; storages.forEach((building) => { building.maxCapacity = Math.max(Number(building.maxCapacity) || 0, storageCapacity(building.level)); building.storedUnits = Math.min(building.maxCapacity, remaining); remaining -= building.storedUnits; }); targetState.resources.materials = storages.reduce((sum, building) => sum + (Number(building.storedUnits) || 0), 0); }
function addSticks(amount) { let remaining = Math.max(0, Number(amount) || 0); const storages = state.buildings.filter((building) => building.type === "storage"); for (const building of storages) { building.maxCapacity = Math.max(Number(building.maxCapacity) || 0, storageCapacity(building.level)); const room = Math.max(0, building.maxCapacity - (Number(building.storedUnits) || 0)); const added = Math.min(room, remaining); building.storedUnits = (Number(building.storedUnits) || 0) + added; remaining -= added; if (remaining <= 0) break; } state.resources.materials = storages.reduce((sum, building) => sum + (Number(building.storedUnits) || 0), 0); }
function removeSticks(amount) { let remaining = Math.max(0, Number(amount) || 0); const storages = [...state.buildings.filter((building) => building.type === "storage")].reverse(); for (const building of storages) { const held = Number(building.storedUnits) || 0; const removed = Math.min(held, remaining); building.storedUnits = held - removed; remaining -= removed; if (remaining <= 0) break; } state.resources.materials = state.buildings.filter((building) => building.type === "storage").reduce((sum, building) => sum + (Number(building.storedUnits) || 0), 0); }
function currentArea() { const level = HQ_LEVEL_DATA[state.baseLevel] || HQ_LEVEL_DATA[1]; return { minX: level.minX, minY: level.minY, maxX: level.minX + level.buildWidth, maxY: level.minY + level.buildHeight, width: level.buildWidth, height: level.buildHeight }; }
function footprintCells(catalog, worldX, worldY) { const cells = []; for (let y = 0; y < catalog.footprintHeight; y += 1) for (let x = 0; x < catalog.footprintWidth; x += 1) cells.push({ x: worldX + x, y: worldY + y }); return cells; }
function buildingAtCell(worldX, worldY, exceptId = null) { return state.buildings.find((building) => { if (building.id === exceptId) return false; const catalog = getCatalog(building.type); if (!catalog) return false; return footprintCells(catalog, building.worldX, building.worldY).some((cell) => cell.x === worldX && cell.y === worldY); }); }
function isFootprintOpen(catalog, worldX, worldY, exceptId = null) { const area = currentArea(); return footprintCells(catalog, worldX, worldY).every((cell) => cell.x >= area.minX && cell.y >= area.minY && cell.x < area.maxX && cell.y < area.maxY && !buildingAtCell(cell.x, cell.y, exceptId)); }
function findOpenPlacement(catalog, exceptId = null) { const preferred = catalog.defaultGrid; if (preferred && isFootprintOpen(catalog, preferred.x, preferred.y, exceptId)) return preferred; const area = currentArea(); for (let y = area.minY + 1; y <= area.maxY - catalog.footprintHeight - 1; y += 1) for (let x = area.minX + 1; x <= area.maxX - catalog.footprintWidth - 1; x += 1) if (isFootprintOpen(catalog, x, y, exceptId)) return { x, y }; return null; }
function canAfford(cost = {}) { return Object.entries(cost).every(([key, value]) => (Number(state.resources[key]) || 0) >= value); }
function spend(cost = {}) { if (cost.materials) removeSticks(cost.materials); if (cost.food) state.resources.food = Math.max(0, state.resources.food - cost.food); if (cost.coins) state.resources.coins = Math.max(0, state.resources.coins - cost.coins); }
function costText(cost = {}) { return Object.entries(cost).map(([key, value]) => `${value} ${resourceMeta[key]?.label || key}`).join(" · ") || "Free"; }
function dogCapacity() { return state.buildings.filter((building) => building.type === "kennel").reduce((sum, building) => sum + (KENNEL_CAPACITY_BY_LEVEL[buildingLevel(building)] || 2), 0); }
function buildCount(type) { return state.buildings.filter((building) => building.type === type).length; }
function assignedDogs(job) { return state.dogs.filter((dog) => dog.job === job).length; }
function jobOptions() { const options = [{ value: "idle", label: "Unassigned" }]; if (buildCount("storage")) options.push({ value: "sticks", label: "Collect sticks" }); if (buildCount("crop_farm")) options.push({ value: "crop_farm", label: "Work Crop Farm" }); if (buildCount("protein_farm")) options.push({ value: "protein_farm", label: "Work Protein Farm" }); if (buildCount("food")) options.push({ value: "kitchen", label: "Work Kitchen" }); return options; }
function upgradeCost(building) { const level = buildingLevel(building); return { materials: 6 + level * 4, coins: 20 + level * 15 }; }

function render() { els.splash.classList.toggle("hidden", state.seenSplash); renderResourceBar(); renderScreens(); renderBuildMenu(); renderYardButton(); renderMap(); renderMapUi(); }
function renderResourceBar() { els.resourceBar.innerHTML = resourceOrder.map((key) => `<div class="resource-pill"><img src="./${resourceMeta[key].icon}" alt="" draggable="false" /><span>${resourceMeta[key].label}</span><strong>${Math.floor(Number(state.resources[key]) || 0)}</strong></div>`).join(""); }
function renderScreens() { document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active")); document.getElementById(`screen-${state.screen}`)?.classList.add("active"); document.querySelectorAll("[data-screen]").forEach((button) => button.classList.toggle("active", button.dataset.screen === state.screen)); renderDogsScreen(); renderRescueScreen(); }
function renderDogsScreen() { const screen = document.getElementById("screen-dogs"); if (!screen) return; const options = jobOptions(); screen.innerHTML = `<div class="screen-heading"><div><p class="eyebrow">Rescued dogs</p><h2>${state.dogs.length} / ${dogCapacity()} spaces used</h2></div></div><div class="card-grid dog-grid">${state.dogs.map((dog) => `<article class="game-card dog-card"><div class="dog-card-head"><img src="./assets/icons/dogs.png" alt="" draggable="false" /><div><h3>${dog.name}</h3><p>${dog.breed}</p></div></div><p class="card-copy">${dog.note}</p><label class="assignment-control">Job<select data-dog-job="${dog.id}">${options.map((option) => `<option value="${option.value}" ${dog.job === option.value ? "selected" : ""}>${option.label}</option>`).join("")}</select></label></article>`).join("")}</div>`; }
function renderRescueScreen() { const screen = document.getElementById("screen-rescue"); if (!screen) return; const full = state.dogs.length >= dogCapacity(); screen.innerHTML = `<div class="screen-heading"><div><p class="eyebrow">Rescue intake</p><h2>Dogs needing a place</h2></div><span class="capacity-note">${state.dogs.length}/${dogCapacity()} kennel spaces</span></div><div class="card-grid">${state.rescueOffers.map((offer) => `<article class="game-card rescue-card"><div class="dog-card-head"><img src="./assets/icons/dogs.png" alt="" draggable="false" /><div><h3>${offer.name}</h3><p>${offer.breed}</p></div></div><p class="card-copy">${offer.note}</p><button class="primary-button compact" type="button" data-rescue-dog="${offer.id}" ${full ? "disabled" : ""}>${full ? "Kennels full" : "Rescue"}</button></article>`).join("")}</div>`; }
function renderBuildMenu() { els.buildGrid.innerHTML = buildingCatalog.map((catalog) => { const affordable = canAfford(catalog.cost); return `<article class="build-card"><img class="build-card-art" src="${buildingSpritePath(catalog.type, 1)}" alt="" draggable="false" /><div class="build-card-copy"><h3>${catalog.name}</h3><p>${catalog.short}</p><small>${catalog.footprintWidth}×${catalog.footprintHeight} footprint · ${costText(catalog.cost)}</small></div><button class="primary-button compact" type="button" data-start-build="${catalog.type}" ${affordable ? "" : "disabled"}>Build</button></article>`; }).join(""); }
function renderYardButton() { const nextLevel = state.baseLevel + 1; if (nextLevel > 4) { els.yardButton.textContent = `Yard Lv ${state.baseLevel} · Max`; els.yardButton.disabled = true; return; } const cost = HQ_UPGRADE_COSTS[nextLevel]; els.yardButton.textContent = `Expand Yard · ${costText(cost)}`; els.yardButton.disabled = !canAfford(cost); }

function buildingSpritePath(type, level = 1) { const safeLevel = Math.max(1, Math.min(6, Number(level) || 1)); if (type === "kennel") return `./kennel_lvl${safeLevel}.png`; if (type === "storage") return `./stick_storage_lvl${safeLevel}.png`; if (type === "food") return `./kitchen_lvl${safeLevel}.png`; if (type === "crop_farm") return `./crop_farm_lvl${safeLevel}.png`; if (type === "protein_farm") return `./protein_farm_lvl${safeLevel}.png`; return "./pawborough-icon.svg"; }
function buildingFacts(building, catalog) { const level = buildingLevel(building); const rows = [`<li><b>Footprint</b><span>${catalog.footprintWidth}×${catalog.footprintHeight}</span></li>`]; if (building.type === "kennel") rows.push(`<li><b>Dog spaces</b><span>${KENNEL_CAPACITY_BY_LEVEL[level]}</span></li>`); if (building.type === "storage") rows.push(`<li><b>Stored sticks</b><span>${Math.floor(building.storedUnits || 0)} / ${Math.floor(building.maxCapacity || storageCapacity(level))}</span></li>`); const job = building.type === "storage" ? "sticks" : building.type === "crop_farm" ? "crop_farm" : building.type === "protein_farm" ? "protein_farm" : building.type === "food" ? "kitchen" : null; if (job) rows.push(`<li><b>Dogs assigned</b><span>${assignedDogs(job)}</span></li>`); return rows.join(""); }
function upgradeRequirementRows(building) { if (buildingLevel(building) >= 6) return `<li class="met"><b>Upgrade</b><span>Maximum level</span></li>`; const cost = upgradeCost(building); return Object.entries(cost).map(([key, value]) => `<li class="${(state.resources[key] || 0) >= value ? "met" : "missing"}"><b>${resourceMeta[key]?.label || key}</b><span>${Math.floor(state.resources[key] || 0)} / ${value}</span></li>`).join(""); }
function upgradeBonusRows(building) { const next = Math.min(6, buildingLevel(building) + 1); const catalog = getCatalog(building.type); if (buildingLevel(building) >= 6) return `<li><b>Status</b><span>Fully upgraded</span></li>`; const rows = [`<li><b>Level</b><span>${buildingLevel(building)} → ${next}</span></li>`]; if (building.type === "kennel") rows.push(`<li><b>Dog spaces</b><span>${KENNEL_CAPACITY_BY_LEVEL[next]}</span></li>`); if (building.type === "storage") rows.push(`<li><b>Stick capacity</b><span>${storageCapacity(next)}</span></li>`); if (["food", "crop_farm", "protein_farm"].includes(building.type)) rows.push(`<li><b>Production</b><span>Improved</span></li>`); rows.push(`<li><b>Footprint</b><span>${catalog.footprintWidth}×${catalog.footprintHeight}</span></li>`); return rows.join(""); }
function placementOffset() { const tile = els.townMap.querySelector('.terrain-floor-tile[data-buildable="true"]'); if (!tile || !window.RescuePupTerrain) return null; const worldX = Number(tile.dataset.worldX); const worldY = Number(tile.dataset.worldY); const theoretical = window.RescuePupTerrain.point(worldX + 0.5, worldY + 0.5); return { x: parseFloat(tile.style.left) - theoretical.x, y: parseFloat(tile.style.top) - theoretical.y }; }
function placementPreviewMarkup(catalog, valid) { if (!placementMode || !window.RescuePupTerrain || !window.RescuePupBuildingSprites) return ""; const visualName = catalog.type === "kennel" ? "Kennel" : catalog.type === "storage" ? "Stick Storage" : catalog.type === "food" ? "Kitchen" : catalog.type === "crop_farm" ? "Crop Farm" : "Protein Farm"; const definition = window.RescuePupBuildingSprites[visualName]; const level = placementMode.action === "move" ? buildingLevel(state.buildings.find((item) => item.id === placementMode.buildingId)) : 1; const levelDef = definition?.levels?.[String(level)]; const offset = placementOffset(); if (!definition || !levelDef || !offset) return ""; const anchor = window.RescuePupTerrain.footprintBottomCentre(placementMode.worldX, placementMode.worldY, catalog.footprintWidth, catalog.footprintHeight); const size = 64 * levelDef.scale; const left = anchor.x + offset.x + levelDef.offsetX - size / 2; const top = anchor.y + offset.y + levelDef.offsetY - size; return `<img class="placement-building-preview ${valid ? "valid" : "invalid"}" src="${buildingSpritePath(catalog.type, level)}" alt="" draggable="false" style="left:${left}px;top:${top}px;width:${size}px;height:${size}px;" />`; }
function renderPlacementGrid() { if (!placementMode) return ""; const catalog = getCatalog(placementMode.type); if (!catalog) return ""; const exceptId = placementMode.action === "move" ? placementMode.buildingId : null; const valid = isFootprintOpen(catalog, placementMode.worldX, placementMode.worldY, exceptId); const cells = [...els.townMap.querySelectorAll('.terrain-floor-tile[data-buildable="true"]')].map((tile) => { const x = Number(tile.dataset.worldX); const y = Number(tile.dataset.worldY); const selected = x >= placementMode.worldX && y >= placementMode.worldY && x < placementMode.worldX + catalog.footprintWidth && y < placementMode.worldY + catalog.footprintHeight; return `<button class="move-grid-cell ${selected ? (valid ? "selected valid" : "selected invalid") : ""}" type="button" data-placement-x="${x}" data-placement-y="${y}" style="left:${tile.style.left};top:${tile.style.top};" aria-label="Place at ${x}, ${y}"></button>`; }).join(""); return `<div class="placement-grid-layer">${cells}${placementPreviewMarkup(catalog, valid)}</div><div class="placement-banner ${valid ? "valid" : "invalid"}"><strong>${placementMode.action === "move" ? "Move" : "Place"} ${catalog.name}</strong><span>${valid ? "Choose a tile, then confirm." : "That footprint is blocked."}</span><div class="placement-actions"><button type="button" class="placement-round-button confirm" data-confirm-placement aria-label="Confirm"><img src="./assets/ui/button-confirm-raster.png" alt="" /></button><button type="button" class="placement-round-button cancel" data-cancel-placement aria-label="Cancel"><img src="./assets/ui/button-cancel-raster.png" alt="" /></button></div></div>`; }
function renderBuildingPopup(building) { const catalog = getCatalog(building.type); if (!catalog) return ""; const level = buildingLevel(building); const cost = level < 6 ? upgradeCost(building) : null; return `<button class="building-popup-scrim" type="button" data-close-building-ui aria-label="Close building details"></button><div class="building-inspector" role="dialog" aria-modal="true" aria-label="${catalog.name} details"><img class="building-popup-template" src="./assets/ui/building-popup-template.png" alt="" draggable="false" /><button class="building-popup-close" type="button" data-close-building-ui aria-label="Close"><img src="./assets/ui/button-close-raster-v2.png" alt="" /></button><h2 class="building-popup-title">${catalog.name}</h2><div class="building-popup-level">Level ${level}</div><div class="building-popup-preview"><img src="${buildingSpritePath(building.type, level)}" alt="" draggable="false" /></div><button class="building-move-control" type="button" data-move-building="${building.id}" aria-label="Move ${catalog.name}"><img src="./assets/ui/button-move-raster.png" alt="" /></button><p class="building-popup-description">${catalog.short}</p><section class="building-popup-panel requirements"><h3>Requirements</h3><ul>${upgradeRequirementRows(building)}</ul></section><section class="building-popup-panel bonuses"><h3>Upgrade Bonuses</h3><ul>${upgradeBonusRows(building)}</ul></section><div class="building-popup-current"><ul>${buildingFacts(building, catalog)}</ul></div><button class="building-upgrade-control" type="button" data-upgrade-building="${building.id}" ${cost && canAfford(cost) ? "" : "disabled"} aria-label="${cost ? `Upgrade ${catalog.name}` : "Maximum level"}"><img src="./assets/ui/button-start-upgrade.png" alt="" /><span>${cost ? `Upgrade · ${costText(cost)}` : "Maximum level"}</span></button></div>`; }
function renderMapUi() { if (!els.mapUi) return; els.townMap.querySelector('.terrain-floor-status')?.remove(); if (state.screen !== "home") { els.mapUi.innerHTML = ""; return; } if (placementMode) { els.mapUi.innerHTML = renderPlacementGrid(); return; } const building = state.buildings.find((item) => item.id === selectedBuildingId); els.mapUi.innerHTML = building ? renderBuildingPopup(building) : ""; }
function openBuildSheet() { els.buildSheet.classList.add("open"); els.buildSheet.setAttribute("aria-hidden", "false"); }
function closeBuildSheet() { els.buildSheet.classList.remove("open"); els.buildSheet.setAttribute("aria-hidden", "true"); }
function closeBuildingUi() { selectedBuildingId = null; renderMapUi(); }
function startBuildPlacement(type) { const catalog = getCatalog(type); if (!catalog) return; if (!canAfford(catalog.cost)) return toast(`Need ${costText(catalog.cost)}`); const placement = findOpenPlacement(catalog); if (!placement) return toast("No open space in the current yard"); selectedBuildingId = null; placementMode = { action: "build", type, worldX: placement.x, worldY: placement.y }; state.screen = "home"; closeBuildSheet(); render(); toast(`Place ${catalog.name}`); }
function startMovePlacement(buildingId) { const building = state.buildings.find((item) => item.id === buildingId); if (!building) return; selectedBuildingId = null; placementMode = { action: "move", type: building.type, buildingId, worldX: building.worldX, worldY: building.worldY, originalWorldX: building.worldX, originalWorldY: building.worldY }; render(); }
function setPlacementCell(worldX, worldY) { if (!placementMode) return; placementMode.worldX = worldX; placementMode.worldY = worldY; if (placementMode.action === "move") { const building = state.buildings.find((item) => item.id === placementMode.buildingId); if (building) { building.worldX = worldX; building.worldY = worldY; } } renderMap(); renderMapUi(); }
function cancelPlacement() { if (placementMode?.action === "move") { const building = state.buildings.find((item) => item.id === placementMode.buildingId); if (building) { building.worldX = placementMode.originalWorldX; building.worldY = placementMode.originalWorldY; } } placementMode = null; renderMap(); renderMapUi(); }
function confirmPlacement() { if (!placementMode) return; const catalog = getCatalog(placementMode.type); const exceptId = placementMode.action === "move" ? placementMode.buildingId : null; if (!isFootprintOpen(catalog, placementMode.worldX, placementMode.worldY, exceptId)) return toast("That footprint is blocked"); if (placementMode.action === "move") { const id = placementMode.buildingId; const building = state.buildings.find((item) => item.id === id); if (!building) return cancelPlacement(); building.worldX = placementMode.worldX; building.worldY = placementMode.worldY; placementMode = null; selectedBuildingId = id; saveAndRender(); toast(`${catalog.name} moved`); return; } if (!canAfford(catalog.cost)) { placementMode = null; return toast(`Need ${costText(catalog.cost)}`); } spend(catalog.cost); const building = normalizeBuilding({ id: `b-${catalog.type}-${Date.now()}`, type: catalog.type, level: 1, status: "ready", worldX: placementMode.worldX, worldY: placementMode.worldY, ...(catalog.type === "storage" ? { storedUnits: 0, maxCapacity: storageCapacity(1) } : {}) }); state.buildings.push(building); placementMode = null; selectedBuildingId = building.id; saveAndRender(); toast(`${catalog.name} built`); }

function upgradeBuilding(id) { const building = state.buildings.find((item) => item.id === id); if (!building) return; const level = buildingLevel(building); if (level >= 6) return; const cost = upgradeCost(building); if (!canAfford(cost)) return toast(`Need ${costText(cost)}`); spend(cost); building.level = level + 1; if (building.type === "storage") building.maxCapacity = storageCapacity(building.level); saveAndRender(); toast(`${getCatalog(building.type).name} upgraded to Level ${building.level}`); }
function upgradeYard() { const nextLevel = state.baseLevel + 1; if (nextLevel > 4) return; const cost = HQ_UPGRADE_COSTS[nextLevel]; if (!canAfford(cost)) return toast(`Need ${costText(cost)}`); spend(cost); state.baseLevel = nextLevel; saveAndRender(); toast(`${HQ_LEVEL_DATA[nextLevel].name} unlocked`); }
function rescueDog(offerId) { if (state.dogs.length >= dogCapacity()) return toast("Build or upgrade a Kennel first"); const offer = state.rescueOffers.find((item) => item.id === offerId); if (!offer) return; state.dogs.push(createDog(`dog-${Date.now()}`, offer.name, offer.breed, offer.note)); state.rescueOffers = state.rescueOffers.filter((item) => item.id !== offerId); state.rescueOffers.push(nextOffer()); state.rescuedCount += 1; saveAndRender(); toast(`${offer.name} joined Pawborough`); }
function assignDog(dogId, job) { const dog = state.dogs.find((item) => item.id === dogId); if (!dog) return; dog.job = jobOptions().some((option) => option.value === job) ? job : "idle"; saveAndRender(); }
function passiveTick() { const collectors = assignedDogs("sticks"); if (collectors > 0 && state.resources.materials < totalStickCapacity()) addSticks(collectors); }
function advanceTime() { const now = Date.now(); const steps = Math.min(10, Math.floor((now - state.lastTick) / 6000)); if (steps <= 0) return; for (let index = 0; index < steps; index += 1) passiveTick(); state.lastTick = now; saveAndRender(); }
function saveAndRender() { saveState(); render(); }
function toast(message) { const node = document.createElement("div"); node.className = "toast"; node.textContent = message; els.toastStack.appendChild(node); window.setTimeout(() => node.classList.add("leaving"), 2200); window.setTimeout(() => node.remove(), 2800); }
function resetGame() { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(LEGACY_STORAGE_KEY); state = createInitialState(); closeBuildSheet(); selectedBuildingId = null; placementMode = null; saveAndRender(); toast("Fresh rescue started"); }

document.addEventListener("click", (event) => {
  const placementCell = event.target.closest("[data-placement-x][data-placement-y]"); if (placementCell) { setPlacementCell(Number(placementCell.dataset.placementX), Number(placementCell.dataset.placementY)); return; }
  if (event.target.closest("[data-confirm-placement]")) { confirmPlacement(); return; }
  if (event.target.closest("[data-cancel-placement]")) { cancelPlacement(); return; }
  if (event.target.closest("[data-close-building-ui]")) { closeBuildingUi(); return; }
  const moveButton = event.target.closest("[data-move-building]"); if (moveButton) { startMovePlacement(moveButton.dataset.moveBuilding); return; }
  const buildingButton = event.target.closest("[data-building-id]"); if (buildingButton && !placementMode) { event.preventDefault(); event.stopPropagation(); selectedBuildingId = buildingButton.dataset.buildingId; renderMapUi(); return; }
  const screenButton = event.target.closest("[data-screen]"); if (screenButton) { if (placementMode) cancelPlacement(); selectedBuildingId = null; state.screen = screenButton.dataset.screen; closeBuildSheet(); saveAndRender(); return; }
  if (event.target.closest("[data-open-build]")) { if (placementMode) cancelPlacement(); selectedBuildingId = null; state.screen = "home"; renderBuildMenu(); openBuildSheet(); return; }
  const buildButton = event.target.closest("[data-start-build]"); if (buildButton) { startBuildPlacement(buildButton.dataset.startBuild); return; }
  const rescueButton = event.target.closest("[data-rescue-dog]"); if (rescueButton) { rescueDog(rescueButton.dataset.rescueDog); return; }
  const upgradeButton = event.target.closest("[data-upgrade-building]"); if (upgradeButton) { upgradeBuilding(upgradeButton.dataset.upgradeBuilding); return; }
});
document.addEventListener("change", (event) => { const jobSelect = event.target.closest("[data-dog-job]"); if (jobSelect) assignDog(jobSelect.dataset.dogJob, jobSelect.value); });
els.startGame.addEventListener("click", () => { state.seenSplash = true; saveAndRender(); });
els.resetGame.addEventListener("click", resetGame);
els.closeBuild.addEventListener("click", closeBuildSheet);
els.yardButton.addEventListener("click", upgradeYard);
els.buildSheet.addEventListener("click", (event) => { if (event.target === els.buildSheet) closeBuildSheet(); });
window.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeBuildSheet(); if (placementMode) cancelPlacement(); else closeBuildingUi(); } });
window.setInterval(advanceTime, 1000);
if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js?v=81").then((registration) => registration.update()).catch(() => {});
syncStoredSticks(); saveState(); render();
