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
  {
    type: "kennel",
    name: "Kennel",
    short: "Provides safe spaces for rescued dogs.",
    cost: { materials: 12, coins: 35 },
    footprintWidth: 2,
    footprintHeight: 2,
    groundAnchorX: 1,
    groundAnchorY: 2,
    defaultGrid: { x: 2, y: 8 }
  },
  {
    type: "storage",
    name: "Stick Storage",
    short: "Stores the sticks your dogs collect.",
    cost: { materials: 8, coins: 25 },
    footprintWidth: 3,
    footprintHeight: 2,
    groundAnchorX: 1.5,
    groundAnchorY: 2,
    defaultGrid: { x: 8, y: 8 }
  },
  {
    type: "food",
    name: "Kitchen",
    short: "Turns the rescue's food production into usable meals.",
    cost: { materials: 14, coins: 45 },
    footprintWidth: 3,
    footprintHeight: 2,
    groundAnchorX: 1.5,
    groundAnchorY: 2,
    defaultGrid: { x: 7, y: 6 }
  },
  {
    type: "crop_farm",
    name: "Crop Farm",
    short: "Produces crop-based food with dogs assigned to it.",
    cost: { materials: 12, coins: 40 },
    footprintWidth: 3,
    footprintHeight: 2,
    groundAnchorX: 1.5,
    groundAnchorY: 2,
    defaultGrid: { x: 1, y: 1 }
  },
  {
    type: "protein_farm",
    name: "Protein Farm",
    short: "Produces protein food with dogs assigned to it.",
    cost: { materials: 14, coins: 45 },
    footprintWidth: 2,
    footprintHeight: 2,
    groundAnchorX: 1,
    groundAnchorY: 2,
    defaultGrid: { x: 9, y: 1 }
  }
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

let state = loadState();
let activeBuildingId = null;

const els = {
  splash: document.getElementById("splash"),
  startGame: document.getElementById("start-game"),
  resetGame: document.getElementById("reset-game"),
  resourceBar: document.getElementById("resource-bar"),
  townMap: document.getElementById("town-map"),
  buildSheet: document.getElementById("build-sheet"),
  buildGrid: document.getElementById("build-grid"),
  closeBuild: document.getElementById("close-build"),
  buildingSheet: document.getElementById("building-sheet"),
  buildingDetail: document.getElementById("building-detail"),
  closeBuilding: document.getElementById("close-building"),
  toastStack: document.getElementById("toast-stack"),
  yardButton: document.getElementById("yard-upgrade")
};

function createDog(id, name, breed, note) {
  return { id, name, breed, note, job: "idle" };
}

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

  const keptBuildings = (parsed?.buildings || [])
    .filter((building) => APPROVED_BUILDING_TYPES.has(building.type))
    .map((building, index) => normalizeBuilding({ ...building, id: building.id || `b-${building.type}-${index}` }));
  if (keptBuildings.length) clean.buildings = keptBuildings;
  if (!clean.buildings.some((building) => building.type === "kennel")) {
    clean.buildings.push({ id: "b-kennel-1", type: "kennel", level: 1, status: "ready", worldX: 2, worldY: 8 });
  }
  if (!clean.buildings.some((building) => building.type === "storage")) {
    clean.buildings.push({ id: "b-storage-1", type: "storage", level: 1, status: "ready", worldX: 8, worldY: 8, storedUnits: clean.resources.materials, maxCapacity: 100 });
  }

  const legacyDogs = (parsed?.dogs || []).map((dog, index) => createDog(
    dog.id || `dog-${index + 1}`,
    dog.name || dogNames[index % dogNames.length],
    dog.breed || "Rescue Dog",
    dog.note || "Ready to settle into Pawborough."
  ));
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
        parsed.resources = {
          materials: Math.max(0, Number(parsed.resources?.materials) || 0),
          food: Math.max(0, Number(parsed.resources?.food) || 0),
          coins: Math.max(0, Number(parsed.resources?.coins) || 0)
        };
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

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function makeOffers(count, offset = 0) {
  return Array.from({ length: count }, (_, index) => {
    const template = rescueTemplates[(index + offset) % rescueTemplates.length];
    const name = dogNames[(index + offset + 2) % dogNames.length];
    return {
      id: `offer-${Date.now()}-${offset}-${index}`,
      name,
      breed: template.breed,
      note: template.note
    };
  });
}

function nextOffer() {
  return makeOffers(1, state.rescuedCount + state.rescueOffers.length)[0];
}

function getCatalog(type) {
  return buildingCatalog.find((building) => building.type === type) || null;
}

function buildingLevel(building) {
  return Math.max(1, Math.min(6, Number(building?.level) || 1));
}

function storageCapacity(level) {
  return Math.max(100, buildingLevel({ level }) * 100);
}

function totalStickCapacity() {
  return state.buildings
    .filter((building) => building.type === "storage")
    .reduce((sum, building) => sum + (Number(building.maxCapacity) || storageCapacity(building.level)), 0);
}

function syncStoredSticks(targetState = state) {
  const storages = targetState.buildings.filter((building) => building.type === "storage");
  const total = Math.max(0, Number(targetState.resources?.materials) || 0);
  let remaining = total;
  storages.forEach((building) => {
    building.maxCapacity = Math.max(Number(building.maxCapacity) || 0, storageCapacity(building.level));
    building.storedUnits = Math.min(building.maxCapacity, remaining);
    remaining -= building.storedUnits;
  });
  targetState.resources.materials = storages.reduce((sum, building) => sum + (Number(building.storedUnits) || 0), 0);
}

function addSticks(amount) {
  let remaining = Math.max(0, Number(amount) || 0);
  const storages = state.buildings.filter((building) => building.type === "storage");
  for (const building of storages) {
    building.maxCapacity = Math.max(Number(building.maxCapacity) || 0, storageCapacity(building.level));
    const room = Math.max(0, building.maxCapacity - (Number(building.storedUnits) || 0));
    const added = Math.min(room, remaining);
    building.storedUnits = (Number(building.storedUnits) || 0) + added;
    remaining -= added;
    if (remaining <= 0) break;
  }
  state.resources.materials = storages.reduce((sum, building) => sum + (Number(building.storedUnits) || 0), 0);
}

function removeSticks(amount) {
  let remaining = Math.max(0, Number(amount) || 0);
  const storages = [...state.buildings.filter((building) => building.type === "storage")].reverse();
  for (const building of storages) {
    const held = Number(building.storedUnits) || 0;
    const removed = Math.min(held, remaining);
    building.storedUnits = held - removed;
    remaining -= removed;
    if (remaining <= 0) break;
  }
  state.resources.materials = state.buildings
    .filter((building) => building.type === "storage")
    .reduce((sum, building) => sum + (Number(building.storedUnits) || 0), 0);
}

function currentArea() {
  const level = HQ_LEVEL_DATA[state.baseLevel] || HQ_LEVEL_DATA[1];
  return {
    minX: level.minX,
    minY: level.minY,
    maxX: level.minX + level.buildWidth,
    maxY: level.minY + level.buildHeight,
    width: level.buildWidth,
    height: level.buildHeight
  };
}

function footprintCells(catalog, worldX, worldY) {
  const cells = [];
  for (let y = 0; y < catalog.footprintHeight; y += 1) {
    for (let x = 0; x < catalog.footprintWidth; x += 1) cells.push({ x: worldX + x, y: worldY + y });
  }
  return cells;
}

function buildingAtCell(worldX, worldY) {
  return state.buildings.find((building) => {
    const catalog = getCatalog(building.type);
    if (!catalog) return false;
    return footprintCells(catalog, building.worldX, building.worldY).some((cell) => cell.x === worldX && cell.y === worldY);
  });
}

function isFootprintOpen(catalog, worldX, worldY) {
  const area = currentArea();
  return footprintCells(catalog, worldX, worldY).every((cell) =>
    cell.x >= area.minX && cell.y >= area.minY && cell.x < area.maxX && cell.y < area.maxY && !buildingAtCell(cell.x, cell.y)
  );
}

function findOpenPlacement(catalog) {
  const preferred = catalog.defaultGrid;
  if (preferred && isFootprintOpen(catalog, preferred.x, preferred.y)) return preferred;
  const area = currentArea();
  for (let y = area.minY + 1; y <= area.maxY - catalog.footprintHeight - 1; y += 1) {
    for (let x = area.minX + 1; x <= area.maxX - catalog.footprintWidth - 1; x += 1) {
      if (isFootprintOpen(catalog, x, y)) return { x, y };
    }
  }
  return null;
}

function canAfford(cost = {}) {
  return Object.entries(cost).every(([key, value]) => (Number(state.resources[key]) || 0) >= value);
}

function spend(cost = {}) {
  if (cost.materials) removeSticks(cost.materials);
  if (cost.food) state.resources.food = Math.max(0, state.resources.food - cost.food);
  if (cost.coins) state.resources.coins = Math.max(0, state.resources.coins - cost.coins);
}

function costText(cost = {}) {
  return Object.entries(cost).map(([key, value]) => `${value} ${resourceMeta[key]?.label || key}`).join(" · ") || "Free";
}

function dogCapacity() {
  return state.buildings
    .filter((building) => building.type === "kennel")
    .reduce((sum, building) => sum + (KENNEL_CAPACITY_BY_LEVEL[buildingLevel(building)] || 2), 0);
}

function buildCount(type) {
  return state.buildings.filter((building) => building.type === type).length;
}

function assignedDogs(job) {
  return state.dogs.filter((dog) => dog.job === job).length;
}

function jobOptions() {
  const options = [{ value: "idle", label: "Unassigned" }];
  if (buildCount("storage")) options.push({ value: "sticks", label: "Collect sticks" });
  if (buildCount("crop_farm")) options.push({ value: "crop_farm", label: "Work Crop Farm" });
  if (buildCount("protein_farm")) options.push({ value: "protein_farm", label: "Work Protein Farm" });
  if (buildCount("food")) options.push({ value: "kitchen", label: "Work Kitchen" });
  return options;
}

function upgradeCost(building) {
  const level = buildingLevel(building);
  return { materials: 6 + level * 4, coins: 20 + level * 15 };
}

function render() {
  els.splash.classList.toggle("hidden", state.seenSplash);
  renderResourceBar();
  renderScreens();
  renderBuildMenu();
  renderYardButton();
  renderMap();
  if (activeBuildingId) renderBuildingSheet(activeBuildingId);
}

function renderResourceBar() {
  els.resourceBar.innerHTML = resourceOrder.map((key) => `
    <div class="resource-pill">
      <img src="./${resourceMeta[key].icon}" alt="" draggable="false" />
      <span>${resourceMeta[key].label}</span>
      <strong>${Math.floor(Number(state.resources[key]) || 0)}</strong>
    </div>
  `).join("");
}

function renderScreens() {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
  document.getElementById(`screen-${state.screen}`)?.classList.add("active");
  document.querySelectorAll("[data-screen]").forEach((button) => button.classList.toggle("active", button.dataset.screen === state.screen));
  renderDogsScreen();
  renderRescueScreen();
}

function renderDogsScreen() {
  const screen = document.getElementById("screen-dogs");
  if (!screen) return;
  const options = jobOptions();
  screen.innerHTML = `
    <div class="screen-heading">
      <div><p class="eyebrow">Rescued dogs</p><h2>${state.dogs.length} / ${dogCapacity()} spaces used</h2></div>
    </div>
    <div class="card-grid dog-grid">
      ${state.dogs.map((dog) => `
        <article class="game-card dog-card">
          <div class="dog-card-head">
            <img src="./assets/icons/dogs.png" alt="" draggable="false" />
            <div><h3>${dog.name}</h3><p>${dog.breed}</p></div>
          </div>
          <p class="card-copy">${dog.note}</p>
          <label class="assignment-control">Job
            <select data-dog-job="${dog.id}">
              ${options.map((option) => `<option value="${option.value}" ${dog.job === option.value ? "selected" : ""}>${option.label}</option>`).join("")}
            </select>
          </label>
        </article>
      `).join("")}
    </div>
  `;
}

function renderRescueScreen() {
  const screen = document.getElementById("screen-rescue");
  if (!screen) return;
  const full = state.dogs.length >= dogCapacity();
  screen.innerHTML = `
    <div class="screen-heading">
      <div><p class="eyebrow">Rescue intake</p><h2>Dogs needing a place</h2></div>
      <span class="capacity-note">${state.dogs.length}/${dogCapacity()} kennel spaces</span>
    </div>
    <div class="card-grid">
      ${state.rescueOffers.map((offer) => `
        <article class="game-card rescue-card">
          <div class="dog-card-head">
            <img src="./assets/icons/dogs.png" alt="" draggable="false" />
            <div><h3>${offer.name}</h3><p>${offer.breed}</p></div>
          </div>
          <p class="card-copy">${offer.note}</p>
          <button class="primary-button compact" type="button" data-rescue-dog="${offer.id}" ${full ? "disabled" : ""}>${full ? "Kennels full" : "Rescue"}</button>
        </article>
      `).join("")}
    </div>
  `;
}

function renderBuildMenu() {
  els.buildGrid.innerHTML = buildingCatalog.map((catalog) => {
    const affordable = canAfford(catalog.cost);
    return `
      <article class="build-card">
        <div>
          <h3>${catalog.name}</h3>
          <p>${catalog.short}</p>
          <small>${catalog.footprintWidth}×${catalog.footprintHeight} footprint · ${costText(catalog.cost)}</small>
        </div>
        <button class="primary-button compact" type="button" data-build-type="${catalog.type}" ${affordable ? "" : "disabled"}>Build</button>
      </article>
    `;
  }).join("");
}

function renderYardButton() {
  const nextLevel = state.baseLevel + 1;
  if (nextLevel > 4) {
    els.yardButton.textContent = `Yard Lv ${state.baseLevel} · Max`;
    els.yardButton.disabled = true;
    return;
  }
  const cost = HQ_UPGRADE_COSTS[nextLevel];
  els.yardButton.textContent = `Expand Yard · ${costText(cost)}`;
  els.yardButton.disabled = !canAfford(cost);
}

function renderBuildingSheet(buildingId) {
  const building = state.buildings.find((item) => item.id === buildingId);
  if (!building) return closeBuildingSheet();
  const catalog = getCatalog(building.type);
  if (!catalog) return closeBuildingSheet();
  const level = buildingLevel(building);
  const cost = level < 6 ? upgradeCost(building) : null;
  const assigned = building.type === "storage" ? assignedDogs("sticks") :
    building.type === "crop_farm" ? assignedDogs("crop_farm") :
    building.type === "protein_farm" ? assignedDogs("protein_farm") :
    building.type === "food" ? assignedDogs("kitchen") : 0;

  let extra = `<p><strong>Footprint:</strong> ${catalog.footprintWidth}×${catalog.footprintHeight}</p>`;
  if (building.type === "kennel") extra += `<p><strong>Dog spaces:</strong> ${KENNEL_CAPACITY_BY_LEVEL[level]}</p>`;
  if (building.type === "storage") extra += `<p><strong>Stored:</strong> ${Math.floor(building.storedUnits || 0)} / ${Math.floor(building.maxCapacity || storageCapacity(level))} sticks</p>`;
  if (["storage", "crop_farm", "protein_farm", "food"].includes(building.type)) extra += `<p><strong>Dogs assigned:</strong> ${assigned}</p>`;

  els.buildingDetail.innerHTML = `
    <div class="modal-heading"><p class="eyebrow">Building</p><h2>${catalog.name}</h2><span class="level-tag">Level ${level}</span></div>
    <p class="modal-copy">${catalog.short}</p>
    <div class="building-facts">${extra}</div>
    ${cost ? `<button class="primary-button" type="button" data-upgrade-building="${building.id}" ${canAfford(cost) ? "" : "disabled"}>Upgrade · ${costText(cost)}</button>` : `<button class="primary-button" type="button" disabled>Maximum level</button>`}
  `;
}

function openBuildSheet() {
  els.buildSheet.classList.add("open");
  els.buildSheet.setAttribute("aria-hidden", "false");
}
function closeBuildSheet() {
  els.buildSheet.classList.remove("open");
  els.buildSheet.setAttribute("aria-hidden", "true");
}
function openBuildingSheet(id) {
  activeBuildingId = id;
  renderBuildingSheet(id);
  els.buildingSheet.classList.add("open");
  els.buildingSheet.setAttribute("aria-hidden", "false");
}
function closeBuildingSheet() {
  activeBuildingId = null;
  els.buildingSheet.classList.remove("open");
  els.buildingSheet.setAttribute("aria-hidden", "true");
}

function buildBuilding(type) {
  const catalog = getCatalog(type);
  if (!catalog) return;
  if (!canAfford(catalog.cost)) return toast(`Need ${costText(catalog.cost)}`);
  const placement = findOpenPlacement(catalog);
  if (!placement) return toast("No open space in the current yard");
  spend(catalog.cost);
  const building = normalizeBuilding({
    id: `b-${type}-${Date.now()}`,
    type,
    level: 1,
    status: "ready",
    worldX: placement.x,
    worldY: placement.y,
    ...(type === "storage" ? { storedUnits: 0, maxCapacity: storageCapacity(1) } : {})
  });
  state.buildings.push(building);
  closeBuildSheet();
  saveAndRender();
  toast(`${catalog.name} built`);
  window.setTimeout(() => openBuildingSheet(building.id), 80);
}

function upgradeBuilding(id) {
  const building = state.buildings.find((item) => item.id === id);
  if (!building) return;
  const level = buildingLevel(building);
  if (level >= 6) return;
  const cost = upgradeCost(building);
  if (!canAfford(cost)) return toast(`Need ${costText(cost)}`);
  spend(cost);
  building.level = level + 1;
  if (building.type === "storage") building.maxCapacity = storageCapacity(building.level);
  saveAndRender();
  renderBuildingSheet(id);
  toast(`${getCatalog(building.type).name} upgraded to Level ${building.level}`);
}

function upgradeYard() {
  const nextLevel = state.baseLevel + 1;
  if (nextLevel > 4) return;
  const cost = HQ_UPGRADE_COSTS[nextLevel];
  if (!canAfford(cost)) return toast(`Need ${costText(cost)}`);
  spend(cost);
  state.baseLevel = nextLevel;
  saveAndRender();
  toast(`${HQ_LEVEL_DATA[nextLevel].name} unlocked`);
}

function rescueDog(offerId) {
  if (state.dogs.length >= dogCapacity()) return toast("Build or upgrade a Kennel first");
  const offer = state.rescueOffers.find((item) => item.id === offerId);
  if (!offer) return;
  state.dogs.push(createDog(`dog-${Date.now()}`, offer.name, offer.breed, offer.note));
  state.rescueOffers = state.rescueOffers.filter((item) => item.id !== offerId);
  state.rescueOffers.push(nextOffer());
  state.rescuedCount += 1;
  saveAndRender();
  toast(`${offer.name} joined Pawborough`);
}

function assignDog(dogId, job) {
  const dog = state.dogs.find((item) => item.id === dogId);
  if (!dog) return;
  dog.job = jobOptions().some((option) => option.value === job) ? job : "idle";
  saveAndRender();
}

function passiveTick() {
  const collectors = assignedDogs("sticks");
  if (collectors > 0 && state.resources.materials < totalStickCapacity()) addSticks(collectors);
}

function advanceTime() {
  const now = Date.now();
  const steps = Math.min(10, Math.floor((now - state.lastTick) / 6000));
  if (steps <= 0) return;
  for (let index = 0; index < steps; index += 1) passiveTick();
  state.lastTick = now;
  saveAndRender();
}

function saveAndRender() {
  saveState();
  render();
}

function toast(message) {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  els.toastStack.appendChild(node);
  window.setTimeout(() => node.classList.add("leaving"), 2200);
  window.setTimeout(() => node.remove(), 2800);
}

function resetGame() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  state = createInitialState();
  closeBuildSheet();
  closeBuildingSheet();
  saveAndRender();
  toast("Fresh rescue started");
}

document.addEventListener("click", (event) => {
  const buildingButton = event.target.closest("[data-building-id]");
  if (buildingButton) {
    event.preventDefault();
    event.stopPropagation();
    openBuildingSheet(buildingButton.dataset.buildingId);
    return;
  }

  const screenButton = event.target.closest("[data-screen]");
  if (screenButton) {
    state.screen = screenButton.dataset.screen;
    closeBuildSheet();
    closeBuildingSheet();
    saveAndRender();
    return;
  }

  if (event.target.closest("[data-open-build]")) {
    renderBuildMenu();
    openBuildSheet();
    return;
  }

  const buildButton = event.target.closest("[data-build-type]");
  if (buildButton) {
    buildBuilding(buildButton.dataset.buildType);
    return;
  }

  const rescueButton = event.target.closest("[data-rescue-dog]");
  if (rescueButton) {
    rescueDog(rescueButton.dataset.rescueDog);
    return;
  }

  const upgradeButton = event.target.closest("[data-upgrade-building]");
  if (upgradeButton) upgradeBuilding(upgradeButton.dataset.upgradeBuilding);
});

document.addEventListener("change", (event) => {
  const jobSelect = event.target.closest("[data-dog-job]");
  if (jobSelect) assignDog(jobSelect.dataset.dogJob, jobSelect.value);
});

els.startGame.addEventListener("click", () => {
  state.seenSplash = true;
  saveAndRender();
});
els.resetGame.addEventListener("click", resetGame);
els.closeBuild.addEventListener("click", closeBuildSheet);
els.closeBuilding.addEventListener("click", closeBuildingSheet);
els.yardButton.addEventListener("click", upgradeYard);
els.buildSheet.addEventListener("click", (event) => { if (event.target === els.buildSheet) closeBuildSheet(); });
els.buildingSheet.addEventListener("click", (event) => { if (event.target === els.buildingSheet) closeBuildingSheet(); });
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeBuildSheet();
    closeBuildingSheet();
  }
});

window.setInterval(advanceTime, 1000);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js?v=80").then((registration) => registration.update()).catch(() => {});
}

syncStoredSticks();
saveState();
render();
