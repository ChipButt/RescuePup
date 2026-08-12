"use strict";

const STORAGE_KEY = "pawborough-save-v8";

const resourceMeta = {
  food: { label: "Food", icon: "assets/icons/food.png", short: "Food" },
  materials: { label: "Wood", icon: "assets/icons/materials.png", short: "Wood" },
  medicine: { label: "Meds", icon: "assets/icons/medicine.png", short: "Meds" },
  coins: { label: "Coins", icon: "assets/icons/coins.png", short: "Coins" },
  reputation: { label: "Rep", icon: "assets/icons/reputation.png", short: "Rep" }
};

const resourceOrder = ["food", "materials", "medicine", "coins", "reputation"];

const TILE_WIDTH = 96;
const TILE_HEIGHT = 72;
const ISO_ORIGIN_X = 1800;
const ISO_ORIGIN_Y = 280;
const WORLD_WIDTH = 3600;
const WORLD_HEIGHT = 2400;
const DEFAULT_CAMERA = { x: -1200, y: 60, zoom: 0.24, framedLevel: 1 };
const LAYOUT_ISO_TILE_WIDTH = 28;
const LAYOUT_ISO_TILE_HEIGHT = 20;
const LAYOUT_GRID_PADDING = 10;
const KENNEL_SPRITE_CANVAS_WIDTH = 320;
const KENNEL_SPRITE_CANVAS_HEIGHT = 360;
const KENNEL_SOURCE_FOOTPRINT_WIDTH = 224;
const KENNEL_RUNTIME_SCALE = (LAYOUT_ISO_TILE_WIDTH * 2) / KENNEL_SOURCE_FOOTPRINT_WIDTH;
const BUILD_DURATION_MS = 45_000;
const UPGRADE_DURATION_MS = 60_000;
const READY_BUILDING_STATUSES = new Set(["ready", "complete", undefined, null]);
// Active map architecture: logical grid -> footprint occupancy -> isometric projection -> sprite anchor.
const DEBUG_FOOTPRINTS_ONLY = true;
const FOOTPRINT_TEMPLATE_SIZES = [
  { width: 1, height: 1 },
  { width: 2, height: 1 },
  { width: 2, height: 2 },
  { width: 3, height: 2 },
  { width: 3, height: 3 },
  { width: 4, height: 3 }
];
const FOOTPRINT_TEMPLATE_KEYS = FOOTPRINT_TEMPLATE_SIZES.map(({ width, height }) => footprintKey(width, height));
const footprintTemplateCache = new Map();
const footprintColors = {
  "1x1": "#5ec8ff",
  "2x1": "#cfc461",
  "2x2": "#67d083",
  "3x2": "#f09c5b",
  "3x3": "#b67cf1",
  "4x3": "#ff6f75"
};

const constructionRasterAssets = Object.fromEntries(
  FOOTPRINT_TEMPLATE_SIZES.map(({ width, height }) => {
    const key = footprintKey(width, height);
    const sourceWidth = Math.round(((width + height) * (LAYOUT_ISO_TILE_WIDTH / 2)) / KENNEL_RUNTIME_SCALE);
    const sourceHeight = Math.round(((width + height) * (LAYOUT_ISO_TILE_HEIGHT / 2)) / KENNEL_RUNTIME_SCALE);
    const imageWidth = sourceWidth + 96;
    const anchorX = imageWidth / 2;
    const anchorY = sourceHeight + 180;
    const imageHeight = anchorY + 20;
    return [
      key,
      {
        id: `construction-${key}`,
        footprintWidth: width,
        footprintHeight: height,
        image: `assets/buildings/construction-${key}.png`,
        imageWidth,
        imageHeight,
        anchorX,
        anchorY,
        runtimeScale: KENNEL_RUNTIME_SCALE,
        runtimeTileWidth: LAYOUT_ISO_TILE_WIDTH,
        runtimeTileHeight: LAYOUT_ISO_TILE_HEIGHT
      }
    ];
  })
);

const upgradeOverlayRasterAssets = Object.fromEntries(
  FOOTPRINT_TEMPLATE_SIZES.map(({ width, height }) => {
    const key = footprintKey(width, height);
    return [
      key,
      {
        ...constructionRasterAssets[key],
        id: `upgrade-overlay-${key}`,
        image: `assets/buildings/upgrade-overlay-${key}.png`
      }
    ];
  })
);

const rasterBuildingAssets = {
  kennel: {
    id: "kennel",
    footprintWidth: 2,
    footprintHeight: 2,
    image: "assets/buildings/kennel-lvl1.png",
    levelImages: {
      1: "assets/buildings/kennel-lvl1.png",
      2: "assets/buildings/kennel-lvl2.png",
      3: "assets/buildings/kennel-lvl3.png",
      4: "assets/buildings/kennel-lvl4.png",
      5: "assets/buildings/kennel-lvl5.png",
      6: "assets/buildings/kennel-lvl6.png",
      7: "assets/buildings/kennel-lvl7.png"
    },
    imageWidth: KENNEL_SPRITE_CANVAS_WIDTH,
    imageHeight: KENNEL_SPRITE_CANVAS_HEIGHT,
    anchorX: 160,
    anchorY: 340,
    runtimeScale: KENNEL_RUNTIME_SCALE,
    runtimeTileWidth: 28,
    runtimeTileHeight: 20,
    artScale: 4,
    sourceCanvasWidth: KENNEL_SPRITE_CANVAS_WIDTH,
    sourceCanvasHeight: KENNEL_SPRITE_CANVAS_HEIGHT,
    footprintPolygonSource: [
      [160, 180],
      [272, 260],
      [160, 340],
      [48, 260]
    ],
    footprintAnchorSource: [160, 340],
    sprite: "assets/buildings/kennel-lvl1.png"
  }
};

const KENNEL_MAX_LEVEL = 7;
const KENNEL_LEVEL_DATA = {
  1: { spaces: 2, description: "Adds 2 safe dog spaces in a rough starter kennel." },
  2: { spaces: 3, description: "Adds 3 safe dog spaces with sturdier repaired timber." },
  3: { spaces: 4, description: "Adds 4 safe dog spaces in a clean wooden kennel." },
  4: { spaces: 5, description: "Adds 5 safe dog spaces with a stronger tiled roof." },
  5: { spaces: 6, description: "Adds 6 safe dog spaces with polished trim and fixtures." },
  6: { spaces: 7, description: "Adds 7 safe dog spaces in an ornate premium kennel." },
  7: { spaces: 8, description: "Adds 8 safe dog spaces in a fully upgraded luxury kennel." }
};

const KENNEL_UPGRADES = {
  2: { name: "Patch the Kennel", cost: { materials: 8, coins: 25 }, durationMs: 45_000 },
  3: { name: "Rebuild the Kennel", cost: { materials: 16, coins: 45 }, durationMs: 55_000 },
  4: { name: "Tile the Roof", cost: { materials: 26, coins: 70 }, durationMs: 65_000 },
  5: { name: "Add Premium Trim", cost: { materials: 38, coins: 105, reputation: 1 }, durationMs: 75_000 },
  6: { name: "Add Prestige Fixtures", cost: { materials: 52, coins: 145, reputation: 3 }, durationMs: 90_000 },
  7: { name: "Luxury Kennel", cost: { materials: 70, coins: 190, reputation: 5 }, durationMs: 105_000 }
};

const HQ_LEVEL_DATA = {
  1: { name: "Starter Yard", minX: 0, minY: 0, buildWidth: 12, buildHeight: 12 },
  2: { name: "Expanded Yard", minX: -2, minY: -2, buildWidth: 16, buildHeight: 16 },
  3: { name: "Open Yard", minX: -4, minY: -4, buildWidth: 20, buildHeight: 20 },
  4: { name: "Rescue Grounds", minX: -6, minY: -6, buildWidth: 24, buildHeight: 24 }
};

const HQ_UPGRADES = {
  2: {
    name: "Expand Yard",
    cost: { materials: 12, coins: 45 },
    requiresBuildings: ["food"]
  },
  3: {
    name: "Open Yard",
    cost: { materials: 26, coins: 95, reputation: 2 },
    requiresBuildings: ["vet", "staff"]
  },
  4: {
    name: "Rescue Grounds",
    cost: { materials: 42, coins: 160, reputation: 5 },
    requiresBuildings: ["training", "park"]
  }
};

const buildingCatalog = [
  {
    type: "hq",
    name: "Rescue HQ",
    short: "Upgrade to unlock more buildable yard space.",
    className: "hq",
    cost: {},
    max: 1,
    requiresRep: 0,
    requiresBaseLevel: 1,
    requiresBuildings: [],
    footprintWidth: 4,
    footprintHeight: 3,
    groundAnchorX: 2,
    groundAnchorY: 3,
    renderWidth: 520,
    defaultGrid: { x: 4, y: 3 }
  },
  {
    type: "kennel",
    name: "Kennel",
    short: "Adds two safe dog spaces.",
    className: "kennel",
    cost: { materials: 12, coins: 35 },
    max: 4,
    requiresRep: 0,
    requiresBaseLevel: 1,
    requiresBuildings: [],
    footprintWidth: 2,
    footprintHeight: 2,
    groundAnchorX: 1,
    groundAnchorY: 2,
    renderWidth: 300,
    defaultGrid: { x: 2, y: 8 }
  },
  {
    type: "storage",
    name: "Storage Shed",
    short: "Boosts supply hauls and material storage.",
    className: "storage",
    cost: { materials: 8, coins: 25 },
    max: 2,
    requiresRep: 0,
    requiresBaseLevel: 1,
    requiresBuildings: [],
    footprintWidth: 2,
    footprintHeight: 2,
    groundAnchorX: 1,
    groundAnchorY: 2,
    renderWidth: 285,
    defaultGrid: { x: 8, y: 8 }
  },
  {
    type: "food",
    name: "Food Kitchen",
    short: "Prepares meals and adds passive food.",
    className: "food",
    cost: { materials: 14, coins: 45 },
    max: 1,
    requiresRep: 0,
    requiresBaseLevel: 1,
    requiresBuildings: ["storage"],
    footprintWidth: 3,
    footprintHeight: 2,
    groundAnchorX: 1.5,
    groundAnchorY: 2,
    renderWidth: 360,
    defaultGrid: { x: 7, y: 6 }
  },
  {
    type: "vet",
    name: "Vet Clinic",
    short: "Improves treatment and unlocks vet work.",
    className: "vet",
    cost: { materials: 20, medicine: 4, coins: 70 },
    max: 1,
    requiresRep: 2,
    requiresBaseLevel: 2,
    requiresBuildings: ["food"],
    footprintWidth: 2,
    footprintHeight: 2,
    groundAnchorX: 1,
    groundAnchorY: 2,
    renderWidth: 300,
    defaultGrid: { x: 1, y: 1 }
  },
  {
    type: "groom",
    name: "Grooming Station",
    short: "Raises happiness and trust faster.",
    className: "groom",
    cost: { materials: 18, coins: 60 },
    max: 1,
    requiresRep: 3,
    requiresBaseLevel: 2,
    requiresBuildings: ["vet"],
    footprintWidth: 2,
    footprintHeight: 2,
    groundAnchorX: 1,
    groundAnchorY: 2,
    renderWidth: 285,
    defaultGrid: { x: 2, y: 6 }
  },
  {
    type: "training",
    name: "Training Yard",
    short: "Builds adoption readiness.",
    className: "training",
    cost: { materials: 22, coins: 75 },
    max: 1,
    requiresRep: 4,
    requiresBaseLevel: 3,
    requiresBuildings: ["staff"],
    footprintWidth: 3,
    footprintHeight: 2,
    groundAnchorX: 1.5,
    groundAnchorY: 2,
    renderWidth: 365,
    defaultGrid: { x: 6, y: 6 }
  },
  {
    type: "park",
    name: "Dog Park",
    short: "Restores energy and happiness across town.",
    className: "park",
    cost: { materials: 18, coins: 65 },
    max: 1,
    requiresRep: 5,
    requiresBaseLevel: 3,
    requiresBuildings: ["training"],
    footprintWidth: 3,
    footprintHeight: 3,
    groundAnchorX: 1.5,
    groundAnchorY: 3,
    renderWidth: 410,
    defaultGrid: { x: 3, y: 4 }
  },
  {
    type: "adoption",
    name: "Adoption Centre",
    short: "Improves rehoming rewards.",
    className: "adoption",
    cost: { materials: 24, coins: 90 },
    max: 1,
    requiresRep: 6,
    requiresBaseLevel: 3,
    requiresBuildings: ["vet", "training"],
    footprintWidth: 3,
    footprintHeight: 2,
    groundAnchorX: 1.5,
    groundAnchorY: 2,
    renderWidth: 350,
    defaultGrid: { x: 8, y: 4 }
  },
  {
    type: "staff",
    name: "Staff Cabin",
    short: "Adds two worker slots.",
    className: "staff",
    cost: { materials: 16, coins: 55 },
    max: 2,
    requiresRep: 1,
    requiresBaseLevel: 2,
    requiresBuildings: ["food"],
    footprintWidth: 2,
    footprintHeight: 2,
    groundAnchorX: 1,
    groundAnchorY: 2,
    renderWidth: 285,
    defaultGrid: { x: 0, y: 3 }
  },
  {
    type: "donation",
    name: "Donation Office",
    short: "Creates steady coins from goodwill.",
    className: "donation",
    cost: { materials: 18, coins: 70 },
    max: 1,
    requiresRep: 4,
    requiresBaseLevel: 3,
    requiresBuildings: ["staff"],
    footprintWidth: 2,
    footprintHeight: 2,
    groundAnchorX: 1,
    groundAnchorY: 2,
    renderWidth: 300,
    defaultGrid: { x: 6, y: 0 }
  }
];

const roleCatalog = [
  {
    id: "carer",
    name: "Carer",
    building: null,
    detail: "Improves hunger, trust, and happiness."
  },
  {
    id: "vet",
    name: "Vet",
    building: "vet",
    detail: "Restores health each morning."
  },
  {
    id: "trainer",
    name: "Trainer",
    building: "training",
    detail: "Raises adoption readiness."
  },
  {
    id: "groomer",
    name: "Groomer",
    building: "groom",
    detail: "Adds happiness and presentation."
  },
  {
    id: "admin",
    name: "Admin",
    building: "donation",
    detail: "Turns reputation into donations."
  }
];

const rescueTemplates = [
  {
    breed: "Puppy",
    note: "Small, bright-eyed, and full of nervous energy.",
    color: 1,
    stats: { hunger: 58, happiness: 66, health: 78, trust: 48, energy: 88, readiness: 18 }
  },
  {
    breed: "Friendly Mixed Breed",
    note: "Greets every worker as if they are already friends.",
    color: 2,
    stats: { hunger: 72, happiness: 74, health: 82, trust: 66, energy: 70, readiness: 34 }
  },
  {
    breed: "Nervous Rescue",
    note: "Gentle and watchful, happiest with patient care.",
    color: 3,
    stats: { hunger: 64, happiness: 42, health: 72, trust: 24, energy: 58, readiness: 12 }
  },
  {
    breed: "Injured Dog",
    note: "Needs medicine and calm before adoption prep.",
    color: 4,
    stats: { hunger: 62, happiness: 45, health: 34, trust: 38, energy: 42, readiness: 10 }
  },
  {
    breed: "Senior Dog",
    note: "Slow steps, soft eyes, and a huge heart.",
    color: 2,
    stats: { hunger: 68, happiness: 58, health: 56, trust: 62, energy: 36, readiness: 26 }
  },
  {
    breed: "Energetic Dog",
    note: "Ready for trails, training, and every ball in town.",
    color: 1,
    stats: { hunger: 60, happiness: 70, health: 76, trust: 52, energy: 94, readiness: 24 }
  }
];

const dogNames = [
  "Butter",
  "Juniper",
  "Milo",
  "Pickle",
  "Dottie",
  "Toast",
  "Hazel",
  "Biscuit",
  "Mabel",
  "Scout",
  "Nell",
  "Waffle",
  "Sunny",
  "Roo",
  "Clover",
  "Otis"
];

const goals = [
  {
    id: "build_food",
    title: "Open a Food Kitchen",
    detail: "Keep meals flowing for every rescue.",
    reward: { food: 8, reputation: 1 },
    complete: () => countBuilding("food") > 0
  },
  {
    id: "second_kennel",
    title: "Build a second Kennel",
    detail: "Make room for more arrivals.",
    reward: { materials: 8, reputation: 1 },
    complete: () => countBuilding("kennel") >= 2
  },
  {
    id: "upgrade_hq_2",
    title: "Upgrade Rescue HQ",
    detail: "Expand the fenced buildable yard.",
    reward: { materials: 10, reputation: 1 },
    complete: () => baseLevel() >= 2
  },
  {
    id: "rescue_three",
    title: "Rescue three dogs",
    detail: "Grow the first Pawborough family.",
    reward: { coins: 50, reputation: 2 },
    complete: () => state.rescuedCount >= 3
  },
  {
    id: "hire_worker",
    title: "Hire one worker",
    detail: "Add another pair of capable hands.",
    reward: { coins: 35, reputation: 1 },
    complete: () => state.hiredWorkers >= 1
  },
  {
    id: "vet_clinic",
    title: "Unlock the Vet Clinic",
    detail: "Give injured rescues a proper care room.",
    reward: { medicine: 6, reputation: 1 },
    complete: () => countBuilding("vet") > 0
  },
  {
    id: "first_adoption",
    title: "Complete one adoption",
    detail: "Send a ready dog to a warm home.",
    reward: { coins: 75, reputation: 2 },
    complete: () => state.rehomedCount >= 1
  }
];

let state = loadState();
let activeDogId = null;
let lastBuiltId = null;
let selectedBuildingId = null;
let placementMode = null;
let mapPopup = null;
let panState = null;
let placementDragId = null;
let placementDragState = null;
let suppressMapClick = false;

const els = {
  splash: document.getElementById("splash"),
  startGame: document.getElementById("start-game"),
  resetGame: document.getElementById("reset-game"),
  resourceBar: document.getElementById("resource-bar"),
  townMap: document.getElementById("town-map"),
  goalList: document.getElementById("goal-list"),
  buildSheet: document.getElementById("build-sheet"),
  buildGrid: document.getElementById("build-grid"),
  openBuild: document.getElementById("open-build"),
  closeBuild: document.getElementById("close-build"),
  dogSheet: document.getElementById("dog-sheet"),
  dogTitle: document.getElementById("dog-title"),
  dogSubtitle: document.getElementById("dog-subtitle"),
  dogDetail: document.getElementById("dog-detail"),
  closeDog: document.getElementById("close-dog"),
  toastStack: document.getElementById("toast-stack")
};

function createInitialState() {
  return {
    version: 1,
    screen: "home",
    seenSplash: false,
    baseLevel: 1,
    camera: null,
    resources: {
      food: 18,
      materials: 28,
      medicine: 8,
      coins: 130,
      reputation: 0
    },
    buildings: [
      { id: "b-hq-1", type: "hq", level: 1, worldX: 4, worldY: 3 },
      { id: "b-kennel-1", type: "kennel", level: 1, worldX: 2, worldY: 8 },
      { id: "b-storage-1", type: "storage", worldX: 8, worldY: 8 }
    ],
    dogs: [
      {
        id: "dog-1",
        name: "Butter",
        breed: "Friendly Mixed Breed",
        note: "A sunny rescue who settles faster with regular walks.",
        color: 1,
        location: "Kennel",
        stats: { hunger: 76, happiness: 68, health: 82, trust: 60, energy: 72, readiness: 35 }
      },
      {
        id: "dog-2",
        name: "Juniper",
        breed: "Nervous Rescue",
        note: "Quiet and observant, slowly learning that hands can be kind.",
        color: 3,
        location: "Kennel",
        stats: { hunger: 64, happiness: 46, health: 70, trust: 28, energy: 58, readiness: 12 }
      }
    ],
    rescueOffers: makeOffers(3, 2),
    rescuedCount: 2,
    rehomedCount: 0,
    hiredWorkers: 0,
    workers: {
      total: 2,
      roles: {
        carer: 1,
        vet: 0,
        trainer: 0,
        groomer: 0,
        admin: 0
      }
    },
    completedGoals: [],
    lastTick: Date.now()
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return createInitialState();
    parsed.buildings = (parsed.buildings || []).map((building) => ({
      ...building,
      status: building.status || "ready"
    }));
    return parsed;
  } catch {
    return createInitialState();
  }
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
      note: template.note,
      color: template.color,
      stats: { ...template.stats }
    };
  });
}

function nextOffer() {
  const seed = state.rescuedCount + state.rescueOffers.length + state.rehomedCount;
  return makeOffers(1, seed)[0];
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function countBuilding(type) {
  return state.buildings.filter((building) => building.type === type && isBuildingReady(building)).length;
}

function countBuildingSlots(type) {
  return state.buildings.filter((building) => building.type === type).length;
}

function isBuildingReady(building) {
  return READY_BUILDING_STATUSES.has(building?.status);
}

function isBuildingConstructing(building) {
  return building?.status === "constructing";
}

function isBuildingUpgrading(building) {
  return building?.status === "upgrading";
}

function hasBuildingWorkInProgress(building) {
  return isBuildingConstructing(building) || isBuildingUpgrading(building);
}

function remainingMs(until, now = Date.now()) {
  return Math.max(0, Math.ceil((Number(until) || 0) - now));
}

function formatDuration(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const leftover = seconds % 60;
  return `${minutes}m ${String(leftover).padStart(2, "0")}s`;
}

function buildingProgress(building) {
  const job = isBuildingConstructing(building) ? building.construction : building.upgrade;
  if (!job) return 100;
  const startedAt = Number(job.startedAt) || Date.now();
  const finishesAt = Number(job.finishesAt) || startedAt;
  const duration = Math.max(1, finishesAt - startedAt);
  return Math.max(0, Math.min(100, Math.round(((Date.now() - startedAt) / duration) * 100)));
}

function buildingStatusText(building) {
  if (isBuildingConstructing(building)) return `Building - ${formatDuration(remainingMs(building.construction?.finishesAt))}`;
  if (isBuildingUpgrading(building)) return `Upgrading - ${formatDuration(remainingMs(building.upgrade?.finishesAt))}`;
  return "";
}

function buildingProgressDegrees(building) {
  return Math.round(buildingProgress(building) * 3.6);
}

function completeReadyJobs(now = Date.now()) {
  let changed = false;
  state.buildings.forEach((building) => {
    if (isBuildingConstructing(building) && remainingMs(building.construction?.finishesAt, now) <= 0) {
      building.status = "ready";
      delete building.construction;
      changed = true;
      toast(`${getCatalog(building.type)?.name || "Building"} complete`);
    }

    if (isBuildingUpgrading(building) && remainingMs(building.upgrade?.finishesAt, now) <= 0) {
      const nextLevel = Number(building.upgrade?.toLevel) || buildingLevel(building) + 1;
      building.level = nextLevel;
      if (building.type === "hq") state.baseLevel = nextLevel;
      building.status = "ready";
      delete building.upgrade;
      changed = true;
      toast(`${getCatalog(building.type)?.name || "Building"} upgraded`);
    }
  });
  if (changed) checkGoals();
  return changed;
}

function getCatalog(type) {
  return buildingCatalog.find((building) => building.type === type);
}

function baseLevel() {
  return Math.max(1, Math.min(4, state.baseLevel || 1));
}

function currentArea(level = baseLevel()) {
  const area = HQ_LEVEL_DATA[Math.max(1, Math.min(4, level))];
  return {
    ...area,
    maxX: area.minX + area.buildWidth,
    maxY: area.minY + area.buildHeight
  };
}

function projectedAreaCorners(area = currentArea()) {
  return [
    worldToScreen(area.minX, area.minY),
    worldToScreen(area.maxX, area.minY),
    worldToScreen(area.maxX, area.maxY),
    worldToScreen(area.minX, area.maxY)
  ];
}

function projectedAreaBounds(area = currentArea()) {
  const corners = projectedAreaCorners(area);
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

function mapViewportSize() {
  return {
    width: els.townMap.clientWidth || 390,
    height: els.townMap.clientHeight || 520
  };
}

function cameraForArea(area = currentArea()) {
  const viewport = mapViewportSize();
  const bounds = projectedAreaBounds(area);
  const zoom = Math.min(
    0.72,
    (viewport.width * 0.88) / Math.max(1, bounds.width),
    (viewport.height * 0.82) / Math.max(1, bounds.height)
  );
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  return {
    zoom,
    x: viewport.width / 2 - centerX * zoom,
    y: viewport.height / 2 - centerY * zoom,
    framedLevel: baseLevel()
  };
}

function ensureCamera() {
  if (!state.camera || state.camera.framedLevel !== baseLevel()) state.camera = cameraForArea();
  state.camera.zoom = Number.isFinite(state.camera.zoom) ? state.camera.zoom : DEFAULT_CAMERA.zoom;
  state.camera.x = Number.isFinite(state.camera.x) ? state.camera.x : DEFAULT_CAMERA.x;
  state.camera.y = Number.isFinite(state.camera.y) ? state.camera.y : DEFAULT_CAMERA.y;
  state.camera.framedLevel = state.camera.framedLevel || baseLevel();
}

function clampCamera() {
  ensureCamera();
  const viewport = mapViewportSize();
  const minX = -WORLD_WIDTH * state.camera.zoom + viewport.width - 36;
  const minY = -WORLD_HEIGHT * state.camera.zoom + viewport.height - 36;
  state.camera.x = Math.max(minX, Math.min(36, state.camera.x));
  state.camera.y = Math.max(minY, Math.min(36, state.camera.y));
}

function worldToScreen(worldX, worldY) {
  return {
    x: ISO_ORIGIN_X + (worldX - worldY) * (TILE_WIDTH / 2),
    y: ISO_ORIGIN_Y + (worldX + worldY) * (TILE_HEIGHT / 2)
  };
}

function screenToWorld(screenX, screenY) {
  ensureCamera();
  const localX = (screenX - state.camera.x) / state.camera.zoom - ISO_ORIGIN_X;
  const localY = (screenY - state.camera.y) / state.camera.zoom - ISO_ORIGIN_Y;
  return {
    x: localX / TILE_WIDTH + localY / TILE_HEIGHT,
    y: localY / TILE_HEIGHT - localX / TILE_WIDTH
  };
}

function footprintCells(catalog, worldX, worldY) {
  const cells = [];
  for (let y = worldY; y < worldY + catalog.footprintHeight; y += 1) {
    for (let x = worldX; x < worldX + catalog.footprintWidth; x += 1) {
      cells.push({ x, y });
    }
  }
  return cells;
}

function isCellInsideArea(worldX, worldY) {
  const area = currentArea();
  return worldX >= area.minX && worldY >= area.minY && worldX < area.maxX && worldY < area.maxY;
}

function buildingOccupiesCell(building, worldX, worldY) {
  const catalog = getCatalog(building.type);
  const buildingX = building.worldX ?? catalog.defaultGrid.x;
  const buildingY = building.worldY ?? catalog.defaultGrid.y;
  return (
    worldX >= buildingX &&
    worldY >= buildingY &&
    worldX < buildingX + catalog.footprintWidth &&
    worldY < buildingY + catalog.footprintHeight
  );
}

function buildingAtCell(worldX, worldY, exceptId = null) {
  return state.buildings.find((building) => {
    if (building.id === exceptId) return false;
    return buildingOccupiesCell(building, worldX, worldY);
  });
}

function isFootprintValid(catalog, worldX, worldY, exceptId = null) {
  return footprintCells(catalog, worldX, worldY).every((cell) => {
    return isCellInsideArea(cell.x, cell.y) && !buildingAtCell(cell.x, cell.y, exceptId);
  });
}

function findOpenPlacement(catalog, exceptId = null) {
  const area = currentArea();
  const first = catalog.defaultGrid || { x: 0, y: 0 };
  if (isFootprintValid(catalog, first.x, first.y, exceptId)) return { ...first };

  for (let y = area.minY; y <= area.maxY - catalog.footprintHeight; y += 1) {
    for (let x = area.minX; x <= area.maxX - catalog.footprintWidth; x += 1) {
      if (isFootprintValid(catalog, x, y, exceptId)) return { x, y };
    }
  }
  return null;
}

function hasOpenPlacement(catalog, exceptId = null) {
  return Boolean(findOpenPlacement(catalog, exceptId));
}

function missingBuildings(required = []) {
  return required.filter((type) => countBuilding(type) <= 0);
}

function requirementNames(types) {
  return types.map((type) => getCatalog(type)?.name || type).join(", ");
}

function buildStatus(catalog) {
  const built = countBuildingSlots(catalog.type);
  const missing = missingBuildings(catalog.requiresBuildings || []);
  if (built >= catalog.max) return { canBuild: false, reason: "Built" };
  if (baseLevel() < catalog.requiresBaseLevel) return { canBuild: false, reason: `HQ Lv ${catalog.requiresBaseLevel}` };
  if (missing.length) return { canBuild: false, reason: `Build ${requirementNames(missing)}` };
  if (state.resources.reputation < catalog.requiresRep) return { canBuild: false, reason: `Need ${catalog.requiresRep} Rep` };
  if (!canAfford(catalog.cost)) return { canBuild: false, reason: "Need supplies" };
  if (!hasOpenPlacement(catalog)) return { canBuild: false, reason: "Need yard space" };
  return { canBuild: true, reason: "Place" };
}

function buildingLevel(building) {
  const max = building?.type === "kennel" ? KENNEL_MAX_LEVEL : Number.POSITIVE_INFINITY;
  const level = Number.isFinite(building?.level) ? building.level : 1;
  return Math.max(1, Math.min(max, level));
}

function kennelLevelData(level) {
  return KENNEL_LEVEL_DATA[Math.max(1, Math.min(KENNEL_MAX_LEVEL, level))] || KENNEL_LEVEL_DATA[1];
}

function kennelCapacity(building) {
  return kennelLevelData(buildingLevel(building)).spaces;
}

function buildingLevelText(building, catalog) {
  if (isBuildingConstructing(building)) return `Level ${buildingLevel(building)} - ${buildingStatusText(building)}`;
  if (isBuildingUpgrading(building)) return `Level ${buildingLevel(building)} -> ${building.upgrade?.toLevel || buildingLevel(building) + 1} - ${formatDuration(remainingMs(building.upgrade?.finishesAt))}`;
  if (building.type === "hq") return `Level ${baseLevel()}`;
  if (building.type === "kennel") return `Level ${buildingLevel(building)} / ${KENNEL_MAX_LEVEL}`;
  return `Level ${buildingLevel(building)}`;
}

function buildingDescription(building, catalog) {
  if (isBuildingConstructing(building)) return `Construction is underway. Finishes in ${formatDuration(remainingMs(building.construction?.finishesAt))}.`;
  if (isBuildingUpgrading(building)) return `Upgrade is underway. Finishes in ${formatDuration(remainingMs(building.upgrade?.finishesAt))}.`;
  if (building.type === "kennel") return kennelLevelData(buildingLevel(building)).description;
  return catalog.short;
}

function buildingPanelLevelLabel(building) {
  if (isBuildingUpgrading(building)) return `Level ${buildingLevel(building)} -> ${building.upgrade?.toLevel || buildingLevel(building) + 1}`;
  if (building.type === "hq") return `Level ${baseLevel()}`;
  return `Level ${buildingLevel(building)}`;
}

function buildingUpgradeHeading(building, upgradeStatus) {
  if (isBuildingConstructing(building)) return "Construction Progress";
  if (isBuildingUpgrading(building)) return `Upgrade to Level ${building.upgrade?.toLevel || buildingLevel(building) + 1}`;
  if (upgradeStatus?.upgrade) {
    const nextLevel = building.type === "hq" ? baseLevel() + 1 : buildingLevel(building) + 1;
    return `Upgrade to Level ${nextLevel}`;
  }
  return "Upgrade";
}

function buildingWorkRequirementRows(building) {
  const job = isBuildingConstructing(building) ? building.construction : building.upgrade;
  return [
    {
      label: "Progress",
      icon: "assets/icons/build.png",
      current: buildingProgress(building),
      required: 100,
      met: false,
      note: `${buildingProgress(building)}%`
    },
    {
      label: "Time Left",
      icon: "assets/icons/coins.png",
      current: 0,
      required: 1,
      met: false,
      note: formatDuration(remainingMs(job?.finishesAt))
    }
  ];
}

function buildingCurrentBonusRows(building, catalog) {
  if (building.type === "kennel") {
    return [
      { label: "Capacity", value: `${kennelCapacity(building)} dogs`, icon: "assets/icons/dogs.png" },
      { label: "Footprint", value: `${catalog.footprintWidth}x${catalog.footprintHeight}`, icon: "assets/icons/build.png" }
    ];
  }
  if (building.type === "hq") {
    const area = currentArea();
    return [
      { label: "Build Zone", value: `${area.buildWidth}x${area.buildHeight}`, icon: "assets/buildings/hq.png" },
      { label: "Expansion", value: `HQ Level ${baseLevel()}`, icon: "assets/icons/reputation.png" }
    ];
  }
  return [
    { label: "Benefit", value: catalog.short, icon: `assets/buildings/${catalog.type}.png` },
    { label: "Footprint", value: `${catalog.footprintWidth}x${catalog.footprintHeight}`, icon: "assets/icons/build.png" }
  ];
}

function kennelUpgradeStatus(building) {
  if (!isBuildingReady(building)) return { canUpgrade: false, reason: isBuildingConstructing(building) ? "Building" : "Upgrading", upgrade: null };
  const nextLevel = buildingLevel(building) + 1;
  const upgrade = KENNEL_UPGRADES[nextLevel];
  if (!upgrade) return { canUpgrade: false, reason: "Max level", upgrade: null };
  if (!canAfford(upgrade.cost)) return { canUpgrade: false, reason: `Need ${costText(upgrade.cost)}`, upgrade };
  return { canUpgrade: true, reason: upgrade.name, upgrade };
}

function buildingUpgradeStatus(building) {
  if (!isBuildingReady(building)) return { canUpgrade: false, reason: isBuildingConstructing(building) ? "Building" : "Upgrading" };
  if (building.type === "hq") return baseUpgradeStatus();
  if (building.type === "kennel") return kennelUpgradeStatus(building);
  return null;
}

function nextBaseUpgrade() {
  return HQ_UPGRADES[baseLevel() + 1] || null;
}

function baseUpgradeStatus() {
  const upgrade = nextBaseUpgrade();
  if (!upgrade) return { canUpgrade: false, reason: "Max level", upgrade: null };
  const missing = missingBuildings(upgrade.requiresBuildings || []);
  if (missing.length) return { canUpgrade: false, reason: `Build ${requirementNames(missing)}`, upgrade };
  if (!canAfford(upgrade.cost)) return { canUpgrade: false, reason: `Need ${costText(upgrade.cost)}`, upgrade };
  return { canUpgrade: true, reason: upgrade.name, upgrade };
}

function dogCapacity() {
  const kennelSpaces = state.buildings.reduce((sum, building) => {
    return building.type === "kennel" && isBuildingReady(building) ? sum + kennelCapacity(building) : sum;
  }, 0);
  return 1 + kennelSpaces + countBuilding("park");
}

function workerCapacity() {
  return 2 + countBuilding("staff") * 2;
}

function assignedWorkers() {
  return Object.values(state.workers.roles).reduce((sum, value) => sum + value, 0);
}

function canAfford(cost) {
  return Object.entries(cost).every(([key, value]) => state.resources[key] >= value);
}

function spend(cost) {
  Object.entries(cost).forEach(([key, value]) => {
    state.resources[key] -= value;
  });
}

function award(reward) {
  Object.entries(reward).forEach(([key, value]) => {
    state.resources[key] = Math.max(0, state.resources[key] + value);
  });
}

function rewardText(reward) {
  return Object.entries(reward)
    .map(([key, value]) => `+${value} ${resourceMeta[key].label}`)
    .join(", ");
}

function costText(cost) {
  const entries = Object.entries(cost);
  if (!entries.length) return "Built";
  return entries.map(([key, value]) => `${value} ${resourceMeta[key].label}`).join("  ");
}

function resourceRequirementRows(cost = {}) {
  return Object.entries(cost).map(([key, value]) => {
    const meta = resourceMeta[key] || { label: key, icon: "" };
    const owned = state.resources[key] || 0;
    return {
      label: meta.label,
      icon: meta.icon,
      current: Math.min(owned, value),
      required: value,
      met: owned >= value
    };
  });
}

function buildingRequirementRows(building, upgradeStatus) {
  const rows = resourceRequirementRows(upgradeStatus?.upgrade?.cost || []);
  if (building.type === "hq" && upgradeStatus?.upgrade?.requiresBuildings?.length) {
    upgradeStatus.upgrade.requiresBuildings.forEach((type) => {
      const catalog = getCatalog(type);
      rows.push({
        label: catalog?.name || type,
        icon: `assets/buildings/${type}.png`,
        current: countBuilding(type) > 0 ? 1 : 0,
        required: 1,
        met: countBuilding(type) > 0
      });
    });
  }
  if (!rows.length) {
    rows.push({
      label: "All upgrades",
      icon: "assets/icons/reputation.png",
      current: 1,
      required: 1,
      met: false,
      note: "Max level"
    });
  }
  return rows;
}

function buildingUpgradeBonusRows(building, upgradeStatus) {
  if (!upgradeStatus?.upgrade) {
    return [
      { label: "Status", value: building.type === "kennel" ? "Best kennel" : "Fully expanded", icon: "assets/icons/reputation.png" },
      { label: "Upgrade", value: "Complete", icon: "assets/icons/coins.png" }
    ];
  }
  if (building.type === "kennel") {
    const current = kennelLevelData(buildingLevel(building)).spaces;
    const next = kennelLevelData(Math.min(KENNEL_MAX_LEVEL, buildingLevel(building) + 1)).spaces;
    return [
      { label: "Capacity", value: `+${Math.max(0, next - current)} dogs`, icon: "assets/icons/dogs.png" },
      { label: "Dog spaces", value: `${next} total`, icon: "assets/buildings/kennel-lvl1.png" },
      { label: "Build time", value: formatDuration(upgradeStatus.upgrade.durationMs || UPGRADE_DURATION_MS), icon: "assets/icons/build.png" }
    ];
  }
  if (building.type === "hq") {
    const nextLevel = baseLevel() + 1;
    const nextArea = currentArea(nextLevel);
    return [
      { label: "Build zone", value: `${nextArea.buildWidth}x${nextArea.buildHeight}`, icon: "assets/buildings/hq.png" },
      { label: "Unlocks", value: `HQ Level ${nextLevel}`, icon: "assets/icons/reputation.png" },
      { label: "Build time", value: formatDuration(upgradeStatus.upgrade.durationMs || UPGRADE_DURATION_MS), icon: "assets/icons/build.png" }
    ];
  }
  return [
    { label: "Benefit", value: "Improved service", icon: `assets/buildings/${building.type}.png` },
    { label: "Build time", value: formatDuration(upgradeStatus.upgrade.durationMs || UPGRADE_DURATION_MS), icon: "assets/icons/build.png" }
  ];
}

function renderPanelRequirementRows(rows) {
  return rows
    .map((row) => `
      <li class="${row.met ? "met" : "missing"}">
        <img src="${row.icon}" alt="" draggable="false" />
        <span><b>${row.label}</b><small>${row.note || `${row.current} / ${row.required}`}</small></span>
        <i aria-hidden="true">${row.met ? "✓" : "!"}</i>
      </li>
    `)
    .join("");
}

function renderPanelBonusRows(rows) {
  return rows
    .map((row) => `
      <li>
        <img src="${row.icon}" alt="" draggable="false" />
        <span><b>${row.label}</b><small>${row.value}</small></span>
      </li>
    `)
    .join("");
}

function averageWellbeing() {
  if (!state.dogs.length) return 100;
  const total = state.dogs.reduce((sum, dog) => {
    return sum + dog.stats.hunger + dog.stats.happiness + dog.stats.health + dog.stats.trust;
  }, 0);
  return Math.round(total / (state.dogs.length * 4));
}

function isDogReady(dog) {
  return (
    dog.stats.readiness >= 82 &&
    dog.stats.health >= 58 &&
    dog.stats.happiness >= 58 &&
    dog.stats.trust >= 52
  );
}

function updateReadiness(dog, amount) {
  const core = (dog.stats.health + dog.stats.happiness + dog.stats.trust + dog.stats.energy) / 4;
  const bonus = core > 68 ? 2 : core > 52 ? 1 : 0;
  dog.stats.readiness = clamp(dog.stats.readiness + amount + bonus);
}

function render() {
  showSplashState();
  renderResources();
  setActiveScreen(state.screen);
  renderMap();
  renderGoals();
  renderBuildGrid();
  renderDogsScreen();
  renderRescueScreen();
  renderWorkersScreen();
  renderAdoptionScreen();
  if (activeDogId) renderDogDetail(activeDogId);
}

function showSplashState() {
  els.splash.classList.toggle("hidden", state.seenSplash);
}

function renderResources() {
  els.resourceBar.innerHTML = resourceOrder
    .map((key) => {
      const meta = resourceMeta[key];
      return `
        <div class="resource-pill" aria-label="${meta.label}: ${state.resources[key]}">
          <img class="res-icon" src="${meta.icon}" alt="" draggable="false" />
          <span><small>${meta.short}</small><strong>${state.resources[key]}</strong></span>
          <b class="resource-plus" aria-hidden="true">+</b>
        </div>
      `;
    })
    .join("");
}

function setActiveScreen(screen) {
  document.querySelectorAll(".screen").forEach((node) => {
    node.classList.toggle("active", node.id === `screen-${screen}`);
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === screen);
  });
}

function renderMap() {
  const area = currentArea();
  const mapClasses = ["town-map", "layout-grid-mode"];
  if (placementMode) mapClasses.push("placement-active");
  if (selectedBuildingId && !placementMode) mapClasses.push("has-selection");
  els.townMap.className = mapClasses.join(" ");

  els.townMap.innerHTML = `
    ${renderLayoutGrid(area)}
    <div class="map-status">
      <span class="status-chip">HQ Lv ${baseLevel()}</span>
      <span class="status-chip">${area.buildWidth}x${area.buildHeight}</span>
      <span class="status-chip">Iso Grid</span>
    </div>
  `;

  window.setTimeout(() => {
    lastBuiltId = null;
  }, 440);
}

function renderLayoutGrid(area) {
  const width = els.townMap.clientWidth || 390;
  const height = els.townMap.clientHeight || 560;
  const minX = area.minX - LAYOUT_GRID_PADDING;
  const minY = area.minY - LAYOUT_GRID_PADDING;
  const maxX = area.maxX + LAYOUT_GRID_PADDING;
  const maxY = area.maxY + LAYOUT_GRID_PADDING;
  const columns = maxX - minX;
  const rows = maxY - minY;
  const gridBounds = layoutIsoBounds(minX, minY, maxX, maxY);
  const offsetX = width / 2 - (gridBounds.left + gridBounds.width / 2);
  const offsetY = height / 2 - (gridBounds.top + gridBounds.height / 2);
  const occupancy = buildOccupancyGrid(state.buildings, placementMode?.buildingId || null);
  const placementCatalog = placementMode ? getCatalog(placementMode.type) : null;
  const placementValid = placementCatalog
    ? isFootprintValid(
        placementCatalog,
        placementMode.worldX,
        placementMode.worldY,
        placementMode.action === "move" ? placementMode.buildingId : null
      )
    : false;
  const cells = [];

  for (let worldY = minY; worldY < maxY; worldY += 1) {
    for (let worldX = minX; worldX < maxX; worldX += 1) {
      const inBuildArea =
        worldX >= area.minX &&
        worldY >= area.minY &&
        worldX < area.maxX &&
        worldY < area.maxY;
      const occupied = occupancy.get(cellKey(worldX, worldY));
      const inPlacementFootprint = Boolean(
        placementCatalog &&
          worldX >= placementMode.worldX &&
          worldY >= placementMode.worldY &&
          worldX < placementMode.worldX + placementCatalog.footprintWidth &&
          worldY < placementMode.worldY + placementCatalog.footprintHeight
      );
      const position = layoutIsoProject(worldX + 0.5, worldY + 0.5, offsetX, offsetY);
      const classes = [
        "layout-cell",
        inBuildArea ? "active-area" : "outside-area",
        occupied ? "occupied-cell" : "",
        inPlacementFootprint ? "preview-cell" : "",
        inPlacementFootprint ? (placementValid ? "valid-preview-cell" : "invalid-preview-cell") : ""
      ].filter(Boolean);
      cells.push(`
        <button
          class="${classes.join(" ")}"
          style="left:${position.x}px;top:${position.y}px;"
          type="button"
          data-occupied-by="${occupied?.id || ""}"
          ${inBuildArea ? `data-cell-x="${worldX}" data-cell-y="${worldY}"` : ""}
          aria-label="${inBuildArea ? `Build area cell ${worldX}, ${worldY}` : "Inactive grid cell"}"
        ></button>
      `);
    }
  }

  return `
    <div
      class="layout-grid"
      data-render-mode="${DEBUG_FOOTPRINTS_ONLY ? "debug-footprints" : "sprites"}"
      data-footprint-templates="${FOOTPRINT_TEMPLATE_KEYS.join(" ")}"
      data-architecture="logical-grid footprint-occupancy isometric-projection sprite-anchor raster-art"
      data-active-area="${area.buildWidth}x${area.buildHeight}"
      data-iso-tile-width="${LAYOUT_ISO_TILE_WIDTH}"
      data-iso-tile-height="${LAYOUT_ISO_TILE_HEIGHT}"
      style="--layout-cols:${columns};--layout-rows:${rows};--layout-tile-width:${LAYOUT_ISO_TILE_WIDTH}px;--layout-tile-height:${LAYOUT_ISO_TILE_HEIGHT}px;"
      aria-label="Full screen planning grid"
    >
      ${cells.join("")}
      ${renderLayoutGridLines(minX, minY, maxX, maxY, area, offsetX, offsetY, width, height)}
      ${DEBUG_FOOTPRINTS_ONLY ? "" : renderLayoutFence(area, offsetX, offsetY)}
      ${renderLayoutFootprintObjects(offsetX, offsetY)}
      ${renderPlacementBanner()}
      ${renderBuildingInspector()}
      ${renderMapPopup()}
    </div>
  `;
}

function renderLayoutGridLines(minX, minY, maxX, maxY, area, offsetX, offsetY, width, height) {
  const lines = [];
  const pushLine = (start, end, isActive) => {
    lines.push(`
      <line
        class="layout-grid-line ${isActive ? "active-grid-line" : "outside-grid-line"}"
        x1="${start.x}"
        y1="${start.y}"
        x2="${end.x}"
        y2="${end.y}"
      />
    `);
  };

  for (let worldX = minX; worldX <= maxX; worldX += 1) {
    pushLine(
      layoutIsoProject(worldX, minY, offsetX, offsetY),
      layoutIsoProject(worldX, maxY, offsetX, offsetY),
      false
    );
  }

  for (let worldY = minY; worldY <= maxY; worldY += 1) {
    pushLine(
      layoutIsoProject(minX, worldY, offsetX, offsetY),
      layoutIsoProject(maxX, worldY, offsetX, offsetY),
      false
    );
  }

  for (let worldX = area.minX; worldX <= area.maxX; worldX += 1) {
    pushLine(
      layoutIsoProject(worldX, area.minY, offsetX, offsetY),
      layoutIsoProject(worldX, area.maxY, offsetX, offsetY),
      true
    );
  }

  for (let worldY = area.minY; worldY <= area.maxY; worldY += 1) {
    pushLine(
      layoutIsoProject(area.minX, worldY, offsetX, offsetY),
      layoutIsoProject(area.maxX, worldY, offsetX, offsetY),
      true
    );
  }

  return `
    <svg
      class="layout-grid-lines"
      viewBox="0 0 ${width} ${height}"
      width="${width}"
      height="${height}"
      aria-hidden="true"
      focusable="false"
    >
      ${lines.join("")}
    </svg>
  `;
}

function renderLayoutFence(area, offsetX, offsetY) {
  const pieces = [];
  const postKeys = new Set();

  const addRail = (asset, startX, startY, endX, endY, className) => {
    const position = layoutIsoProject((startX + endX) / 2, (startY + endY) / 2, offsetX, offsetY);
    const depth = (startX + startY + endX + endY) / 2;
    pieces.push({
      depth: depth - 0.15,
      html: `
        <img
          class="layout-fence layout-fence-rail ${className}"
          src="assets/world/${asset}.png"
          alt=""
          draggable="false"
          style="left:${position.x}px;top:${position.y}px;"
        />
      `
    });
  };

  const addPost = (worldX, worldY) => {
    const key = `${worldX},${worldY}`;
    if (postKeys.has(key)) return;
    postKeys.add(key);
    const position = layoutIsoProject(worldX, worldY, offsetX, offsetY);
    pieces.push({
      depth: worldX + worldY + 0.25,
      html: `
        <img
          class="layout-fence layout-fence-post"
          data-fence-post="${key}"
          src="assets/world/fence_post_tile.png"
          alt=""
          draggable="false"
          style="left:${position.x}px;top:${position.y}px;"
        />
      `
    });
  };

  for (let worldX = area.minX; worldX < area.maxX; worldX += 1) {
    addRail("fence_rail_x_tile", worldX, area.minY, worldX + 1, area.minY, "layout-fence-x layout-fence-top");
    addRail("fence_rail_x_tile", worldX, area.maxY, worldX + 1, area.maxY, "layout-fence-x layout-fence-bottom");
  }

  for (let worldY = area.minY; worldY < area.maxY; worldY += 1) {
    addRail("fence_rail_y_tile", area.minX, worldY, area.minX, worldY + 1, "layout-fence-y layout-fence-left");
    addRail("fence_rail_y_tile", area.maxX, worldY, area.maxX, worldY + 1, "layout-fence-y layout-fence-right");
  }

  for (let worldX = area.minX; worldX <= area.maxX; worldX += 1) {
    addPost(worldX, area.minY);
    addPost(worldX, area.maxY);
  }

  for (let worldY = area.minY + 1; worldY < area.maxY; worldY += 1) {
    addPost(area.minX, worldY);
    addPost(area.maxX, worldY);
  }

  return pieces
    .sort((a, b) => a.depth - b.depth)
    .map((piece) => piece.html)
    .join("");
}

function renderLayoutFootprintObjects(offsetX, offsetY) {
  const objects = state.buildings.map((building) => {
    const catalog = getCatalog(building.type);
    const isMovingBuilding = placementMode?.action === "move" && placementMode.buildingId === building.id;
    const worldX = isMovingBuilding ? placementMode.worldX : building.worldX ?? catalog.defaultGrid.x;
    const worldY = isMovingBuilding ? placementMode.worldY : building.worldY ?? catalog.defaultGrid.y;
    const exceptId = isMovingBuilding ? placementMode.buildingId : null;
    const movingClass = isMovingBuilding
      ? [
          placementMode.hasDragged ? "moving-source" : "move-pending-source",
          isFootprintValid(catalog, worldX, worldY, exceptId) ? "valid" : "invalid"
        ].join(" ")
      : "";
    return renderLayoutFootprintObject({
      id: building.id,
      label: building.type === "hq" ? `${catalog.name} Lv ${baseLevel()}` : `${catalog.name} Lv ${buildingLevel(building)}`,
      catalog,
      building,
      worldX,
      worldY,
      offsetX,
      offsetY,
      stateClass: [
        building.id === selectedBuildingId ? "selected" : "",
        movingClass
      ].filter(Boolean).join(" "),
      disabled: Boolean(placementMode && !isMovingBuilding)
    });
  });

  if (placementMode?.action === "build") {
    const catalog = getCatalog(placementMode.type);
    objects.push(
      renderLayoutFootprintObject({
        id: "placement-preview",
        label: `${catalog.name} ${catalog.footprintWidth}x${catalog.footprintHeight}`,
        catalog,
        building: { type: catalog.type, level: 1 },
        worldX: placementMode.worldX,
        worldY: placementMode.worldY,
        offsetX,
        offsetY,
        stateClass: isFootprintValid(catalog, placementMode.worldX, placementMode.worldY)
          ? "placement-preview valid"
          : "placement-preview invalid",
        disabled: true
      })
    );
  }

  return objects
    .sort((a, b) => a.depth - b.depth)
    .map((object) => object.html)
    .join("");
}

function renderLayoutFootprintObject({ id, label, catalog, building = null, worldX, worldY, offsetX, offsetY, stateClass = "", disabled = false }) {
  const template = getFootprintTemplate(catalog.footprintWidth, catalog.footprintHeight);
  const geometry = layoutIsoFootprintGeometry({
    x: worldX,
    y: worldY,
    width: template.width,
    height: template.height
  });
  const { bounds, metrics } = geometry;
  const footprint = template.key;
  const depth = worldX + worldY + template.width + template.height;
  const constructionAsset = isBuildingConstructing(building) ? getConstructionRasterAsset(catalog) : null;
  if (constructionAsset) {
    return renderLayoutRasterFootprintObject({
      id,
      label,
      rasterAsset: constructionAsset,
      template,
      bounds,
      metrics,
      footprint,
      worldX,
      worldY,
      offsetX,
      offsetY,
      stateClass,
      disabled,
      depth,
      building
    });
  }
  const rasterAsset = getRasterBuildingAsset(catalog, building);
  if (rasterAsset) {
    return renderLayoutRasterFootprintObject({
      id,
      label,
      rasterAsset,
      template,
      bounds,
      metrics,
      footprint,
      worldX,
      worldY,
      offsetX,
      offsetY,
      stateClass,
      disabled,
      depth,
      building,
      overlayAsset: isBuildingUpgrading(building) ? getUpgradeOverlayRasterAsset(catalog) : null
    });
  }

  const anchor = catalogSpriteAnchor(catalog);
  const fallbackOverlayAsset = isBuildingUpgrading(building) ? getUpgradeOverlayRasterAsset(catalog) : null;
  const fallbackOverlayPlacement = fallbackOverlayAsset
    ? getBuildingSpritePlacement(
        {
          gridX: worldX,
          gridY: worldY,
          footprintWidth: template.width,
          footprintHeight: template.height
        },
        fallbackOverlayAsset,
        offsetX,
        offsetY
      )
    : null;

  return {
    depth,
    html: `
      <button
        class="layout-footprint-object footprint-${footprint.replace("x", "-")} ${stateClass}"
        type="button"
        ${id === "placement-preview" ? "" : `data-building-id="${id}"`}
        data-footprint="${footprint}"
        data-grid-x="${worldX}"
        data-grid-y="${worldY}"
        data-grid-width="${template.width}"
        data-grid-height="${template.height}"
        data-anchor-grid-x="${roundCss(anchor.x)}"
        data-anchor-grid-y="${roundCss(anchor.y)}"
        data-footprint-px-width="${roundCss(bounds.width)}"
        data-footprint-px-height="${roundCss(bounds.height)}"
        data-long-side-px="${roundCss(metrics.longSide)}"
        data-short-side-px="${roundCss(metrics.shortSide)}"
        data-side-ratio="${roundCss(metrics.ratio)}"
        ${disabled ? "disabled" : ""}
        style="left:${bounds.left + offsetX}px;top:${bounds.top + offsetY}px;width:${bounds.width}px;height:${bounds.height}px;clip-path:${template.clipPath};--footprint-color:${footprintColor(footprint)};"
        aria-label="${label}, footprint ${footprint}"
      >
        <span class="layout-footprint-label">${label}<b>${footprint}</b></span>
        ${
          fallbackOverlayAsset && fallbackOverlayPlacement
            ? `<img
                class="layout-footprint-work-overlay"
                src="${fallbackOverlayAsset.image}"
                alt=""
                draggable="false"
                style="left:${roundCss(fallbackOverlayPlacement.left - (bounds.left + offsetX))}px;top:${roundCss(fallbackOverlayPlacement.top - (bounds.top + offsetY))}px;width:${roundCss(fallbackOverlayPlacement.width)}px;height:${roundCss(fallbackOverlayPlacement.height)}px;"
              />`
            : ""
        }
        ${hasBuildingWorkInProgress(building) ? renderWorkProgressBadge(building) : ""}
      </button>
    `
  };
}

function renderLayoutRasterFootprintObject({
  id,
  label,
  rasterAsset,
  template,
  bounds,
  metrics,
  footprint,
  worldX,
  worldY,
  offsetX,
  offsetY,
  stateClass,
  disabled,
  depth,
  building = null,
  overlayAsset = null
}) {
  const placement = getBuildingSpritePlacement(
    {
      gridX: worldX,
      gridY: worldY,
      footprintWidth: template.width,
      footprintHeight: template.height
    },
    rasterAsset,
    offsetX,
    offsetY
  );
  const overlayPlacement = overlayAsset
    ? getBuildingSpritePlacement(
        {
          gridX: worldX,
          gridY: worldY,
          footprintWidth: template.width,
          footprintHeight: template.height
        },
        overlayAsset,
        offsetX,
        offsetY
      )
    : null;
  const footprintLeft = bounds.left + offsetX - placement.left;
  const footprintTop = bounds.top + offsetY - placement.top;
  const anchorDeltaX = placement.left + placement.spriteAnchorX - placement.anchorScreenX;
  const anchorDeltaY = placement.top + placement.spriteAnchorY - placement.anchorScreenY;

  return {
    depth,
    html: `
      <button
        class="layout-raster-object footprint-${footprint.replace("x", "-")} ${stateClass}"
        type="button"
        ${id === "placement-preview" ? "" : `data-building-id="${id}"`}
        data-raster-asset="${rasterAsset.id}"
        ${rasterAsset.metadata ? `data-raster-metadata="${rasterAsset.metadata}"` : ""}
        data-footprint="${footprint}"
        data-grid-x="${worldX}"
        data-grid-y="${worldY}"
        data-grid-width="${template.width}"
        data-grid-height="${template.height}"
        data-anchor-grid-x="${roundCss(template.width)}"
        data-anchor-grid-y="${roundCss(template.height)}"
        data-world-anchor-x="${roundCss(placement.anchorWorldX)}"
        data-world-anchor-y="${roundCss(placement.anchorWorldY)}"
        data-footprint-px-width="${roundCss(bounds.width)}"
        data-footprint-px-height="${roundCss(bounds.height)}"
        data-long-side-px="${roundCss(metrics.longSide)}"
        data-short-side-px="${roundCss(metrics.shortSide)}"
        data-side-ratio="${roundCss(metrics.ratio)}"
        data-image-width="${rasterAsset.imageWidth}"
        data-image-height="${rasterAsset.imageHeight}"
        data-runtime-scale="${roundCss(placement.scale)}"
        data-rendered-width="${roundCss(placement.width)}"
        data-rendered-height="${roundCss(placement.height)}"
        data-sprite-anchor-x="${rasterAsset.anchorX}"
        data-sprite-anchor-y="${rasterAsset.anchorY}"
        data-sprite-anchor-runtime-x="${roundCss(placement.spriteAnchorX)}"
        data-sprite-anchor-runtime-y="${roundCss(placement.spriteAnchorY)}"
        data-anchor-screen-x="${roundCss(placement.anchorScreenX)}"
        data-anchor-screen-y="${roundCss(placement.anchorScreenY)}"
        data-anchor-delta-x="${roundCss(anchorDeltaX)}"
        data-anchor-delta-y="${roundCss(anchorDeltaY)}"
        ${disabled ? "disabled" : ""}
        style="left:${roundCss(placement.left)}px;top:${roundCss(placement.top)}px;width:${roundCss(placement.width)}px;height:${roundCss(placement.height)}px;--footprint-color:${footprintColor(footprint)};"
        aria-label="${label}, raster asset anchored to footprint ${footprint}"
      >
        <span
          class="layout-footprint-object layout-raster-footprint-underlay ${stateClass}"
          style="left:${roundCss(footprintLeft)}px;top:${roundCss(footprintTop)}px;width:${roundCss(bounds.width)}px;height:${roundCss(bounds.height)}px;clip-path:${template.clipPath};--footprint-color:${footprintColor(footprint)};"
          aria-hidden="true"
        ></span>
        <img class="layout-raster-sprite" src="${rasterAsset.image}" alt="" draggable="false" />
        ${
          overlayAsset && overlayPlacement
            ? `<img
                class="layout-raster-overlay"
                src="${overlayAsset.image}"
                alt=""
                draggable="false"
                style="left:${roundCss(overlayPlacement.left - placement.left)}px;top:${roundCss(overlayPlacement.top - placement.top)}px;width:${roundCss(overlayPlacement.width)}px;height:${roundCss(overlayPlacement.height)}px;"
              />`
            : ""
        }
        <span
          class="layout-raster-footprint-outline"
          style="left:${roundCss(footprintLeft)}px;top:${roundCss(footprintTop)}px;width:${roundCss(bounds.width)}px;height:${roundCss(bounds.height)}px;clip-path:${template.clipPath};"
          aria-hidden="true"
        ></span>
        ${hasBuildingWorkInProgress(building) ? renderWorkProgressBadge(building) : ""}
      </button>
    `
  };
}

function renderWorkProgressBadge(building) {
  const progress = buildingProgress(building);
  const degrees = buildingProgressDegrees(building);
  const label = isBuildingConstructing(building) ? "Building" : "Upgrade";
  return `
    <span class="layout-work-progress ${isBuildingConstructing(building) ? "construction-progress" : "upgrade-progress"}" style="--progress-deg:${degrees}deg;" aria-hidden="true">
      <span class="work-progress-core"><b>${progress}%</b><small>${label}</small></span>
    </span>
  `;
}

function getBuildingSpritePlacement(building, asset, offsetX, offsetY) {
  const anchorWorldX = building.gridX + building.footprintWidth;
  const anchorWorldY = building.gridY + building.footprintHeight;
  const projectedAnchor = layoutIsoPoint(anchorWorldX, anchorWorldY);
  const anchorScreenX = projectedAnchor.x + offsetX;
  const anchorScreenY = projectedAnchor.y + offsetY;
  const scale = asset.runtimeScale;
  const spriteAnchorX = asset.anchorX * scale;
  const spriteAnchorY = asset.anchorY * scale;
  const width = asset.imageWidth * scale;
  const height = asset.imageHeight * scale;
  return {
    anchorWorldX,
    anchorWorldY,
    anchorScreenX,
    anchorScreenY,
    scale,
    spriteAnchorX,
    spriteAnchorY,
    left: anchorScreenX - spriteAnchorX,
    top: anchorScreenY - spriteAnchorY,
    width,
    height
  };
}

function getFootprintTemplate(width, height) {
  const key = footprintKey(width, height);
  if (!footprintTemplateCache.has(key)) {
    const corners = layoutIsoCorners(0, 0, width, height);
    const bounds = layoutBoundsFromCorners(corners);
    const clipPath = `polygon(${corners
      .map((corner) => {
        const x = ((corner.x - bounds.left) / bounds.width) * 100;
        const y = ((corner.y - bounds.top) / bounds.height) * 100;
        return `${roundCss(x)}% ${roundCss(y)}%`;
      })
      .join(", ")})`;
    const sides = corners.map((corner, index) => distance(corner, corners[(index + 1) % corners.length]));
    footprintTemplateCache.set(key, {
      key,
      width,
      height,
      corners,
      bounds,
      clipPath,
      anchor: { x: width / 2, y: height },
      metrics: {
        sides,
        longSide: Math.max(...sides),
        shortSide: Math.min(...sides),
        ratio: Math.max(...sides) / Math.min(...sides)
      }
    });
  }
  return footprintTemplateCache.get(key);
}

function footprintKey(width, height) {
  return `${width}x${height}`;
}

function footprintColor(key) {
  return footprintColors[key] || "#77c7f2";
}

function catalogSpriteAnchor(catalog) {
  return {
    x: Number.isFinite(catalog.groundAnchorX) ? catalog.groundAnchorX : catalog.footprintWidth / 2,
    y: Number.isFinite(catalog.groundAnchorY) ? catalog.groundAnchorY : catalog.footprintHeight
  };
}

function getRasterBuildingAsset(catalog, building = null) {
  const asset = rasterBuildingAssets[catalog.type];
  if (!asset) return null;
  if (asset.footprintWidth !== catalog.footprintWidth || asset.footprintHeight !== catalog.footprintHeight) return null;
  if (asset.runtimeTileWidth !== LAYOUT_ISO_TILE_WIDTH || asset.runtimeTileHeight !== LAYOUT_ISO_TILE_HEIGHT) return null;
  if (!asset.levelImages) return asset;
  const level = catalog.type === "kennel" ? buildingLevel(building || { type: catalog.type, level: 1 }) : 1;
  const image = asset.levelImages[level] || asset.image;
  return {
    ...asset,
    id: `${asset.id}-lvl${level}`,
    image,
    sprite: image,
    level
  };
}

function getConstructionRasterAsset(catalog) {
  return constructionRasterAssets[footprintKey(catalog.footprintWidth, catalog.footprintHeight)] || null;
}

function getUpgradeOverlayRasterAsset(catalog) {
  return upgradeOverlayRasterAssets[footprintKey(catalog.footprintWidth, catalog.footprintHeight)] || null;
}

function cellKey(worldX, worldY) {
  return `${worldX},${worldY}`;
}

function buildOccupancyGrid(buildings, exceptId = null) {
  const occupancy = new Map();
  buildings.forEach((building) => {
    if (building.id === exceptId) return;
    const catalog = getCatalog(building.type);
    const worldX = building.worldX ?? catalog.defaultGrid.x;
    const worldY = building.worldY ?? catalog.defaultGrid.y;
    footprintCells(catalog, worldX, worldY).forEach((cell) => {
      occupancy.set(cellKey(cell.x, cell.y), building);
    });
  });
  return occupancy;
}

function layoutIsoPoint(worldX, worldY) {
  return {
    x: (worldX - worldY) * (LAYOUT_ISO_TILE_WIDTH / 2),
    y: (worldX + worldY) * (LAYOUT_ISO_TILE_HEIGHT / 2)
  };
}

function layoutIsoProject(worldX, worldY, offsetX, offsetY) {
  const point = layoutIsoPoint(worldX, worldY);
  return {
    x: point.x + offsetX,
    y: point.y + offsetY
  };
}

function layoutIsoCorners(minX, minY, maxX, maxY) {
  return [
    layoutIsoPoint(minX, minY),
    layoutIsoPoint(maxX, minY),
    layoutIsoPoint(maxX, maxY),
    layoutIsoPoint(minX, maxY)
  ];
}

function layoutIsoFootprintGeometry(footprint) {
  const corners = layoutIsoCorners(
    footprint.x,
    footprint.y,
    footprint.x + footprint.width,
    footprint.y + footprint.height
  );
  const bounds = layoutBoundsFromCorners(corners);
  const sides = corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    return distance(corner, next);
  });
  const longSide = Math.max(...sides);
  const shortSide = Math.min(...sides);
  return {
    bounds,
    corners,
    metrics: {
      sides,
      longSide,
      shortSide,
      ratio: longSide / shortSide
    }
  };
}

function layoutIsoBounds(minX, minY, maxX, maxY) {
  const corners = layoutIsoCorners(minX, minY, maxX, maxY);
  return layoutBoundsFromCorners(corners);
}

function layoutBoundsFromCorners(corners) {
  const xs = corners.map((corner) => corner.x);
  const ys = corners.map((corner) => corner.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function roundCss(value) {
  return Math.round(value * 1000) / 1000;
}

function applyCameraTransform() {
  ensureCamera();
  clampCamera();
  const world = els.townMap.querySelector(".iso-world");
  if (world) {
    world.style.transform = `translate(${state.camera.x}px, ${state.camera.y}px) scale(${state.camera.zoom})`;
  }
}

function isoObjectStyle(position, extra = "") {
  return `left:${position.x}px;top:${position.y}px;${extra}`;
}

function renderPlayableGround(area) {
  const bounds = projectedAreaBounds(area);
  const pad = 18;
  return `
    <div
      class="playable-ground"
      style="left:${bounds.left - pad}px;top:${bounds.top - pad}px;width:${bounds.width + pad * 2}px;height:${bounds.height + pad * 2}px;"
      aria-hidden="true"
    ></div>
  `;
}

function renderIsoGrid(area) {
  if (!placementMode) {
    return `<div class="build-grid-layer" aria-hidden="true"></div>`;
  }

  const cells = [];
  const catalog = getCatalog(placementMode.type);
  const exceptId = placementMode?.action === "move" ? placementMode.buildingId : null;
  const previewX = placementMode?.worldX ?? -1;
  const previewY = placementMode?.worldY ?? -1;
  const previewValid = isFootprintValid(catalog, previewX, previewY, exceptId);
  for (let y = area.minY; y < area.maxY; y += 1) {
    for (let x = area.minX; x < area.maxX; x += 1) {
      const position = worldToScreen(x + 0.5, y + 0.5);
      const occupied = buildingAtCell(x, y, exceptId);
      const inFootprint = Boolean(
        x >= previewX &&
          y >= previewY &&
          x < previewX + catalog.footprintWidth &&
          y < previewY + catalog.footprintHeight
      );
      const classes = ["grid-cell", occupied ? "occupied" : "", inFootprint ? (previewValid ? "valid-footprint" : "invalid-footprint") : ""].filter(Boolean);
      cells.push(`
        <button class="${classes.join(" ")}" style="${isoObjectStyle(position)}" type="button" data-cell-x="${x}" data-cell-y="${y}" aria-label="Grid ${x + 1}, ${y + 1}"></button>
      `);
    }
  }
  return `<div class="build-grid-layer" aria-hidden="${placementMode ? "false" : "true"}">${cells.join("")}</div>`;
}

function renderFencePieces(area) {
  const pieces = [];
  for (let x = area.minX; x < area.maxX; x += 1) {
    const top = worldToScreen(x + 0.5, area.minY);
    const bottom = worldToScreen(x + 0.5, area.maxY);
    pieces.push({
      depth: x + area.minY + 0.5,
      html: `<img class="fence-piece fence-x" src="assets/world/fence_axis_x.png" style="${isoObjectStyle(top)}" alt="" draggable="false" />`
    });
    pieces.push({
      depth: x + area.maxY + 1,
      html: `<img class="fence-piece fence-x" src="assets/world/fence_axis_x.png" style="${isoObjectStyle(bottom)}" alt="" draggable="false" />`
    });
  }
  for (let y = area.minY; y < area.maxY; y += 1) {
    const left = worldToScreen(area.minX, y + 0.5);
    const right = worldToScreen(area.maxX, y + 0.5);
    pieces.push({
      depth: area.minX + y + 0.5,
      html: `<img class="fence-piece fence-y" src="assets/world/fence_axis_y.png" style="${isoObjectStyle(left)}" alt="" draggable="false" />`
    });
    pieces.push({
      depth: area.maxX + y + 1,
      html: `<img class="fence-piece fence-y" src="assets/world/fence_axis_y.png" style="${isoObjectStyle(right)}" alt="" draggable="false" />`
    });
  }
  [
    ["top", area.minX, area.minY],
    ["right", area.maxX, area.minY],
    ["bottom", area.maxX, area.maxY],
    ["left", area.minX, area.maxY]
  ].forEach(([name, x, y]) => {
    const position = worldToScreen(x, y);
    pieces.push({
      depth: x + y + 2,
      html: `<img class="fence-piece fence-corner fence-corner-${name}" src="assets/world/fence_corner_${name}.png" style="${isoObjectStyle(position)}" alt="" draggable="false" />`
    });
  });
  return pieces;
}

function renderBuildingPieces() {
  return state.buildings.map((building) => {
    const catalog = getCatalog(building.type);
    const worldX = building.worldX ?? catalog.defaultGrid.x;
    const worldY = building.worldY ?? catalog.defaultGrid.y;
    const anchor = worldToScreen(worldX + catalog.groundAnchorX, worldY + catalog.groundAnchorY);
    const depth = worldX + worldY + catalog.footprintWidth + catalog.footprintHeight;
    const classes = [
      "building-token",
      catalog.className,
      building.id === lastBuiltId ? "constructing" : "",
      building.id === selectedBuildingId ? "selected" : "",
      placementMode?.buildingId === building.id ? "moving-source" : ""
    ].filter(Boolean);
    const label = building.type === "hq" ? `${catalog.name} Lv ${baseLevel()}` : catalog.name;
    return {
      depth,
      html: `
        <button class="${classes.join(" ")}" style="${isoObjectStyle(anchor, `width:${catalog.renderWidth}px;`)}" data-building-id="${building.id}" type="button" aria-label="${label}" ${placementMode ? "disabled" : ""}>
          <span class="building-shadow"></span>
          ${buildingArt(catalog.type)}
          <span class="building-label">${label}</span>
        </button>
      `
    };
  });
}

function renderDogPieces() {
  const positions = [
    { x: 10.0, y: 4.7 },
    { x: 5.7, y: 10.3 },
    { x: 2.3, y: 6.2 },
    { x: 9.6, y: 6.3 },
    { x: 6.2, y: 6.8 }
  ];
  return state.dogs.slice(0, 5).map((dog, index) => {
    const pos = positions[index % positions.length];
    const screen = worldToScreen(pos.x, pos.y);
    return {
      depth: pos.x + pos.y + 0.5,
      html: `
        <button class="dog-on-map" style="${isoObjectStyle(screen, `animation-delay:${index * -1.2}s;`)}" data-dog-id="${dog.id}" type="button" aria-label="${dog.name}">
          ${dogMini(dog, "scene")}
        </button>
      `
    };
  });
}

function renderPlacementPreview() {
  if (!placementMode) return [];
  const catalog = getCatalog(placementMode.type);
  const exceptId = placementMode.action === "move" ? placementMode.buildingId : null;
  const valid = isFootprintValid(catalog, placementMode.worldX, placementMode.worldY, exceptId);
  const anchor = worldToScreen(placementMode.worldX + catalog.groundAnchorX, placementMode.worldY + catalog.groundAnchorY);
  return [
    {
      depth: placementMode.worldX + placementMode.worldY + catalog.footprintWidth + catalog.footprintHeight + 0.2,
      html: `
        <div class="placement-preview ${valid ? "valid" : "invalid"}" style="${isoObjectStyle(anchor, `width:${catalog.renderWidth}px;`)}">
          ${buildingArt(catalog.type)}
        </div>
      `
    }
  ];
}

function renderPlacementBanner() {
  if (!placementMode) return "";
  const catalog = getCatalog(placementMode.type);
  const verb = placementMode.action === "move" ? "Move" : "Place";
  const exceptId = placementMode.action === "move" ? placementMode.buildingId : null;
  const valid = isFootprintValid(catalog, placementMode.worldX, placementMode.worldY, exceptId);
  return `
    <div class="placement-banner ${valid ? "valid" : "invalid"}">
      <span>${verb} ${catalog.name}</span>
      <div class="placement-actions">
        <button class="confirm-placement panel-integrated-button placement-confirm-control" type="button" data-confirm-placement data-placement-valid="${valid ? "true" : "false"}" aria-disabled="${valid ? "false" : "true"}" aria-label="Confirm placement">
          <span class="confirm-mark" aria-hidden="true"></span>
        </button>
        <button class="cancel-placement panel-integrated-button placement-cancel-control" type="button" data-cancel-placement aria-label="Cancel placement">
          <span class="cancel-mark" aria-hidden="true"></span>
        </button>
      </div>
    </div>
  `;
}

function renderBuildingInspector() {
  if (!selectedBuildingId || placementMode) return "";
  const building = state.buildings.find((item) => item.id === selectedBuildingId);
  if (!building) return "";
  const catalog = getCatalog(building.type);
  const rawUpgradeStatus = buildingUpgradeStatus(building);
  const upgradeStatus = rawUpgradeStatus || { canUpgrade: false, reason: "No upgrade", upgrade: null };
  const isWorking = hasBuildingWorkInProgress(building);
  const levelText = buildingPanelLevelLabel(building, catalog);
  const descriptionText = buildingDescription(building, catalog);
  const requirements = isWorking ? buildingWorkRequirementRows(building) : buildingRequirementRows(building, upgradeStatus);
  const bonuses = isWorking ? buildingCurrentBonusRows(building, catalog) : buildingUpgradeBonusRows(building, upgradeStatus);
  const upgradeLabel = isBuildingConstructing(building)
    ? "Being Built"
    : isBuildingUpgrading(building)
      ? "Upgrading"
      : upgradeStatus.canUpgrade
        ? "Start Upgrade"
        : upgradeStatus.reason;
  const upgradeTime = upgradeStatus?.upgrade?.durationMs ? formatDuration(upgradeStatus.upgrade.durationMs) : "";
  return `
    <button class="building-popup-scrim" type="button" data-close-inspector aria-label="Close building panel"></button>
    <div class="building-inspector ${isWorking ? "building-work-active" : ""}">
      <img class="building-popup-template" src="assets/ui/building-popup-template.png" alt="" draggable="false" />
      <button class="building-popup-close" type="button" data-close-inspector aria-label="Close building panel">
        <img src="assets/ui/button-close-raster-v2.png" alt="" draggable="false" />
      </button>
      <div class="building-title-plank">
        <span class="building-title-bone" aria-hidden="true"></span>
        <h3>${catalog.name}</h3>
      </div>
      <div class="building-level-ribbon">
        <span class="building-level-shield" aria-hidden="true"><img src="assets/icons/reputation.png" alt="" draggable="false" /></span>
        <strong>${levelText}</strong>
      </div>
      <div class="popup-window building-image-window">
        <div class="building-panel-backdrop" aria-hidden="true"></div>
        <div class="building-panel-art">${buildingPanelArt(catalog, building)}</div>
        <button class="building-move-control" type="button" data-move-building="${building.id}" ${isWorking ? "disabled" : ""} aria-label="Move ${catalog.name}">
          <img class="move-button-raster" src="assets/ui/button-move-raster.png" alt="" draggable="false" />
        </button>
      </div>
      <div class="popup-window building-description-window">
        <p>${descriptionText}</p>
      </div>
      <div class="building-upgrade-heading"><span></span><strong>${buildingUpgradeHeading(building, upgradeStatus)}</strong><span></span></div>
      <div class="building-upgrade-grid">
        <section class="popup-window building-panel-list">
          <h4>Requirements</h4>
          <ul>${renderPanelRequirementRows(requirements)}</ul>
        </section>
        <section class="popup-window building-panel-list">
          <h4>Upgrade Bonuses</h4>
          <ul>${renderPanelBonusRows(bonuses)}</ul>
        </section>
      </div>
      <div class="building-panel-controls">
        <button class="panel-integrated-button upgrade-building-button ${upgradeStatus.canUpgrade ? "upgrade-ready" : "upgrade-locked"}" type="button" data-upgrade-building="${building.id}" ${upgradeStatus.canUpgrade ? "" : "disabled"} aria-label="${upgradeLabel}${upgradeTime ? `, ${upgradeTime}` : ""}">
          <span class="upgrade-spark-icon" aria-hidden="true"></span>
          <img class="upgrade-button-art" src="assets/ui/button-start-upgrade.png" alt="" draggable="false" />
          <span class="upgrade-button-copy">${upgradeLabel}</span>
          ${upgradeTime ? `<small class="upgrade-button-time">${upgradeTime}</small>` : ""}
        </button>
      </div>
    </div>
  `;
}

function renderMapPopup() {
  if (!mapPopup) return "";
  return `
    <div class="map-popup map-popup-${mapPopup.variant}" role="alertdialog" aria-live="assertive" aria-labelledby="map-popup-title" aria-describedby="map-popup-body">
      <div class="popup-window map-popup-title-window">
        <h3 id="map-popup-title">${mapPopup.title}</h3>
      </div>
      <div class="popup-window map-popup-body-window">
        <p id="map-popup-body">${mapPopup.body}</p>
      </div>
      <div class="map-popup-actions">
        <button class="panel-integrated-button popup-integrated-close" type="button" data-close-map-popup aria-label="Close message">
          <img class="popup-close-raster" src="assets/ui/button-close-raster-v2.png" alt="" draggable="false" />
        </button>
      </div>
    </div>
  `;
}

function buildingArt(type = "hq") {
  if (type === "kennel") {
    return `<img class="building-art building-art-${type}" src="assets/buildings/kennel-lvl1.png" alt="" loading="eager" draggable="false" />`;
  }
  return `<img class="building-art building-art-${type}" src="assets/buildings/${type}.png" alt="" loading="eager" draggable="false" />`;
}

function buildingPanelArt(catalog, building = null) {
  if (isBuildingConstructing(building)) {
    const constructionAsset = getConstructionRasterAsset(catalog);
    if (constructionAsset) {
      return `<img class="building-panel-sprite building-panel-sprite-${catalog.type} uses-map-raster" src="${constructionAsset.image}" alt="" loading="eager" draggable="false" />`;
    }
  }
  const rasterAsset = getRasterBuildingAsset(catalog, building);
  const overlayAsset = isBuildingUpgrading(building) ? getUpgradeOverlayRasterAsset(catalog) : null;
  const src = rasterAsset?.image || `assets/buildings/${catalog.type}.png`;
  const classes = [
    "building-panel-sprite",
    `building-panel-sprite-${catalog.type}`,
    rasterAsset ? "uses-map-raster" : ""
  ].filter(Boolean);
  if (overlayAsset) {
    return `
      <span class="building-panel-sprite-stack">
        <img class="${classes.join(" ")}" src="${src}" alt="" loading="eager" draggable="false" />
        <img class="building-panel-overlay" src="${overlayAsset.image}" alt="" loading="eager" draggable="false" />
      </span>
    `;
  }
  return `<img class="${classes.join(" ")}" src="${src}" alt="" loading="eager" draggable="false" />`;
}

function dogMini(input, mode = "mini") {
  const dog = typeof input === "object" ? input : { color: input, breed: "" };
  const type = dogSpriteName(dog);
  return `<img class="dog-illo dog-mode-${mode}" src="assets/dogs/${type}.png" alt="" loading="eager" draggable="false" />`;
}

function dogSpriteName(dog) {
  const breed = dog.breed || "";
  const name = breed.toLowerCase();
  if (name.includes("puppy")) return "puppy";
  if (name.includes("senior")) return "senior";
  if (name.includes("injured")) return "terrier";
  if (name.includes("energetic")) return "labrador";
  if (name.includes("nervous")) return "mixed";
  if ((dog.color || 0) === 2) return "labrador";
  if ((dog.color || 0) === 3) return "mixed";
  if ((dog.color || 0) === 4) return "terrier";
  return "beagle";
}

function renderGoals() {
  const activeGoals = goals.filter((goal) => !state.completedGoals.includes(goal.id));
  if (!activeGoals.length) {
    els.goalList.innerHTML = `
      <div class="goal-row">
        <div>
          <strong>First chapter complete</strong>
          <small>Keep expanding Pawborough.</small>
        </div>
        <span class="goal-reward">Done</span>
      </div>
    `;
    return;
  }

  els.goalList.innerHTML = activeGoals
    .slice(0, 1)
    .map((goal) => `
      <div class="goal-row">
        <div>
          <strong>${goal.title}</strong>
          <small>${goal.detail}</small>
        </div>
        <span class="goal-reward">${rewardText(goal.reward).split(",")[0]}</span>
      </div>
    `)
    .join("");
}

function renderBuildGrid() {
  els.buildGrid.innerHTML = buildingCatalog
    .filter((building) => building.type !== "hq")
    .map((building) => {
      const status = buildStatus(building);
      const locked = !status.canBuild;
      return `
        <article class="build-card ${locked ? "locked" : ""}">
          ${buildingArt(building.type)}
          <h3>${building.name}</h3>
          <p>${building.short}</p>
          <div class="cost-row">
            ${Object.entries(building.cost)
              .map(([key, value]) => `<span class="cost-pill">${value} ${resourceMeta[key].label}</span>`)
              .join("")}
          </div>
          <button type="button" data-start-build="${building.type}" ${status.canBuild ? "" : "disabled"}>${status.reason}</button>
        </article>
      `;
    })
    .join("");
}

function renderDogsScreen() {
  const screen = document.getElementById("screen-dogs");
  if (!state.dogs.length) {
    screen.innerHTML = emptyState("No dogs in care", "Open rescue intake when you have space for another arrival.");
    return;
  }

  screen.innerHTML = `
    <div class="list-screen">
      <div class="screen-title">
        <div>
          <h2>Dogs in care</h2>
          <p>${state.dogs.length} of ${dogCapacity()} spaces filled</p>
        </div>
      </div>
      ${state.dogs.map(dogCard).join("")}
    </div>
  `;
}

function dogCard(dog) {
  return `
    <button class="dog-card" type="button" data-dog-id="${dog.id}">
      <span class="dog-portrait">${dogMini(dog, "portrait")}</span>
      <span>
        <h3>${dog.name}</h3>
        <p>${dog.breed} - ${dog.location}</p>
      </span>
      <span class="dog-readiness">
        <span class="ring" style="--value:${dog.stats.readiness}%"><b>${dog.stats.readiness}</b></span>
        Ready
      </span>
    </button>
  `;
}

function renderRescueScreen() {
  const screen = document.getElementById("screen-rescue");
  const isFull = state.dogs.length >= dogCapacity();
  screen.innerHTML = `
    <div class="list-screen">
      <div class="screen-title">
        <div>
          <h2>Rescue intake</h2>
          <p>${dogCapacity() - state.dogs.length} spaces available</p>
        </div>
      </div>
      ${state.rescueOffers
        .map((offer) => `
          <article class="rescue-card">
            <span class="dog-portrait">${dogMini(offer, "portrait")}</span>
            <span>
              <h3>${offer.name}</h3>
              <p>${offer.breed}. ${offer.note}</p>
              <div class="tag-row">
                <span class="tag">Health ${offer.stats.health}</span>
                <span class="tag">Trust ${offer.stats.trust}</span>
                <span class="tag">Energy ${offer.stats.energy}</span>
              </div>
            </span>
            <button type="button" data-accept-rescue="${offer.id}" ${isFull ? "disabled" : ""}>
              ${isFull ? "Need kennel space" : "Accept rescue"}
            </button>
          </article>
        `)
        .join("")}
    </div>
  `;
}

function renderWorkersScreen() {
  const screen = document.getElementById("screen-workers");
  const assigned = assignedWorkers();
  screen.innerHTML = `
    <div class="list-screen">
      <div class="screen-title">
        <div>
          <h2>Staff rota</h2>
          <p>${assigned}/${state.workers.total} assigned. ${state.workers.total}/${workerCapacity()} worker slots.</p>
        </div>
      </div>
      <button class="action-button primary" type="button" data-hire-worker ${state.workers.total >= workerCapacity() || state.resources.coins < 60 ? "disabled" : ""}>
        Hire worker - 60 Coins
      </button>
      ${roleCatalog.map(workerCard).join("")}
    </div>
  `;
}

function workerCard(role) {
  const count = state.workers.roles[role.id];
  const locked = role.building && countBuilding(role.building) === 0;
  const free = state.workers.total - assignedWorkers();
  return `
    <article class="worker-card">
      <span>
        <h3>${role.name}</h3>
        <p>${locked ? `Build ${getCatalog(role.building).name} to assign this role.` : role.detail}</p>
      </span>
      <span class="worker-controls">
        <button class="stepper" type="button" data-worker-minus="${role.id}" ${count <= 0 ? "disabled" : ""}>-</button>
        <span class="worker-count">${count}</span>
        <button class="stepper" type="button" data-worker-plus="${role.id}" ${locked || free <= 0 ? "disabled" : ""}>+</button>
      </span>
    </article>
  `;
}

function renderAdoptionScreen() {
  const screen = document.getElementById("screen-adopt");
  const readyDogs = state.dogs.filter(isDogReady);
  const almostReady = [...state.dogs].sort((a, b) => b.stats.readiness - a.stats.readiness).slice(0, 3);

  screen.innerHTML = `
    <div class="list-screen">
      <div class="screen-title">
        <div>
          <h2>Adoptions</h2>
          <p>${countBuilding("adoption") ? "Adoption Centre rewards are active." : "HQ can rehome ready dogs."}</p>
        </div>
      </div>
      ${
        readyDogs.length
          ? readyDogs.map(adoptionCard).join("")
          : `
            <div class="empty-state">
              <div>
                <h3>No dogs ready yet</h3>
                <p>Care, treatment, trust, and training will bring adoption readiness up.</p>
              </div>
            </div>
          `
      }
      ${almostReady.map(progressCard).join("")}
    </div>
  `;
}

function adoptionCard(dog) {
  const reward = adoptionReward(dog);
  return `
    <article class="adopt-card">
      <div class="adopt-ready">
        <span class="dog-portrait">${dogMini(dog, "portrait")}</span>
        <span>
          <h3>${dog.name} is ready</h3>
          <p>${dog.breed}. Reward: ${reward.coins} Coins, ${reward.reputation} Rep.</p>
        </span>
        <span class="ring" style="--value:${dog.stats.readiness}%"><b>${dog.stats.readiness}</b></span>
      </div>
      <button class="action-button primary" type="button" data-rehome="${dog.id}">Complete adoption</button>
    </article>
  `;
}

function progressCard(dog) {
  if (isDogReady(dog)) return "";
  const needed = [
    dog.stats.readiness < 82 ? "training" : "",
    dog.stats.health < 58 ? "health" : "",
    dog.stats.happiness < 58 ? "happiness" : "",
    dog.stats.trust < 52 ? "trust" : ""
  ].filter(Boolean);
  return `
    <article class="progress-card">
      <h3>${dog.name}</h3>
      <p>${dog.stats.readiness} readiness. Needs ${needed.join(", ") || "a final check"}.</p>
    </article>
  `;
}

function renderDogDetail(dogId) {
  const dog = state.dogs.find((item) => item.id === dogId);
  if (!dog) {
    closeDogSheet();
    return;
  }

  els.dogTitle.textContent = dog.name;
  els.dogSubtitle.textContent = dog.breed;
  els.dogDetail.innerHTML = `
    <div class="dog-profile-hero">
      <span class="dog-portrait">${dogMini(dog, "portrait")}</span>
      <span>
        <p>${dog.note}</p>
        <div class="tag-row">
          <span class="tag">${dog.location}</span>
          <span class="tag">${isDogReady(dog) ? "Ready to adopt" : "In care"}</span>
        </div>
      </span>
    </div>
    <div class="stat-grid">
      ${statRow("Hunger", dog.stats.hunger)}
      ${statRow("Happiness", dog.stats.happiness)}
      ${statRow("Health", dog.stats.health)}
      ${statRow("Trust", dog.stats.trust)}
      ${statRow("Energy", dog.stats.energy)}
      ${statRow("Readiness", dog.stats.readiness)}
    </div>
    <div class="dog-actions">
      <button class="action-button" type="button" data-dog-action="feed" data-id="${dog.id}" ${state.resources.food <= 0 ? "disabled" : ""}>Feed</button>
      <button class="action-button" type="button" data-dog-action="treat" data-id="${dog.id}" ${state.resources.medicine <= 0 ? "disabled" : ""}>Treat</button>
      <button class="action-button" type="button" data-dog-action="groom" data-id="${dog.id}">Groom</button>
      <button class="action-button" type="button" data-dog-action="train" data-id="${dog.id}">Train</button>
      <button class="action-button" type="button" data-dog-action="play" data-id="${dog.id}">Play</button>
      <button class="action-button ${isDogReady(dog) ? "primary" : "warn"}" type="button" data-rehome="${dog.id}" ${isDogReady(dog) ? "" : "disabled"}>Rehome</button>
    </div>
  `;
}

function statRow(label, value) {
  return `
    <div class="stat-row">
      <span>${label}</span>
      <span class="stat-track"><span class="stat-fill" style="--value:${value}%"></span></span>
      <span>${value}</span>
    </div>
  `;
}

function emptyState(title, body) {
  return `
    <div class="empty-state">
      <div>
        <h3>${title}</h3>
        <p>${body}</p>
      </div>
    </div>
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

function openDogSheet(dogId) {
  activeDogId = dogId;
  renderDogDetail(dogId);
  els.dogSheet.classList.add("open");
  els.dogSheet.setAttribute("aria-hidden", "false");
}

function closeDogSheet() {
  activeDogId = null;
  els.dogSheet.classList.remove("open");
  els.dogSheet.setAttribute("aria-hidden", "true");
}

function startBuildPlacement(type) {
  const catalog = getCatalog(type);
  if (!catalog) return;
  const status = buildStatus(catalog);
  if (!status.canBuild) {
    toast(status.reason);
    return;
  }
  const placement = findOpenPlacement(catalog);
  if (!placement) {
    toast("Need yard space");
    return;
  }
  selectedBuildingId = null;
  mapPopup = null;
  placementMode = { action: "build", type, worldX: placement.x, worldY: placement.y };
  state.screen = "home";
  closeBuildSheet();
  render();
  toast(`Place ${catalog.name}`);
}

function startMovePlacement(buildingId) {
  const building = state.buildings.find((item) => item.id === buildingId);
  if (!building) return;
  if (hasBuildingWorkInProgress(building)) {
    toast("Finish the current work first");
    return;
  }
  const catalog = getCatalog(building.type);
  const worldX = building.worldX ?? catalog.defaultGrid.x;
  const worldY = building.worldY ?? catalog.defaultGrid.y;
  selectedBuildingId = null;
  mapPopup = null;
  placementMode = {
    action: "move",
    type: building.type,
    buildingId,
    worldX,
    worldY,
    originalWorldX: worldX,
    originalWorldY: worldY,
    hasDragged: false
  };
  state.screen = "home";
  render();
  toast(`Move ${catalog.name}`);
}

function cancelPlacement() {
  placementMode = null;
  mapPopup = null;
  render();
}

function setPlacementCell(worldX, worldY) {
  if (!placementMode) return;
  mapPopup = null;
  if (placementMode.action === "move") {
    const originalX = placementMode.originalWorldX ?? placementMode.worldX;
    const originalY = placementMode.originalWorldY ?? placementMode.worldY;
    if (worldX !== originalX || worldY !== originalY) placementMode.hasDragged = true;
  }
  placementMode.worldX = worldX;
  placementMode.worldY = worldY;
  renderMap();
}

function getLayoutCellFromClientPoint(clientX, clientY) {
  const stack = typeof document.elementsFromPoint === "function"
    ? document.elementsFromPoint(clientX, clientY)
    : [document.elementFromPoint(clientX, clientY)].filter(Boolean);
  return stack
    .map((target) => target?.closest?.("[data-cell-x][data-cell-y]"))
    .find((target) => target && els.townMap.contains(target));
}

function layoutGridDeltaFromPointer(dx, dy) {
  return {
    x: Math.round(dx / LAYOUT_ISO_TILE_WIDTH + dy / LAYOUT_ISO_TILE_HEIGHT),
    y: Math.round(dy / LAYOUT_ISO_TILE_HEIGHT - dx / LAYOUT_ISO_TILE_WIDTH)
  };
}

function setPlacementFromLayoutPointer(event) {
  if (!placementMode) return false;
  if (placementMode.action === "move" && placementDragState?.layoutGrid) {
    const delta = layoutGridDeltaFromPointer(
      event.clientX - placementDragState.startX,
      event.clientY - placementDragState.startY
    );
    setPlacementCell(placementDragState.startWorldX + delta.x, placementDragState.startWorldY + delta.y);
    return true;
  }
  const cell = getLayoutCellFromClientPoint(event.clientX, event.clientY);
  if (!cell || !els.townMap.contains(cell)) return false;
  setPlacementCell(Number(cell.dataset.cellX), Number(cell.dataset.cellY));
  return true;
}

function setPlacementFromPointer(event) {
  if (!placementMode) return;
  const rect = els.townMap.getBoundingClientRect();
  const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
  setPlacementCell(Math.floor(world.x), Math.floor(world.y));
}

function isFootprintInsideBuildArea(catalog, worldX, worldY) {
  return footprintCells(catalog, worldX, worldY).every((cell) => isCellInsideArea(cell.x, cell.y));
}

function hasFootprintCollision(catalog, worldX, worldY, exceptId = null) {
  return footprintCells(catalog, worldX, worldY).some((cell) => buildingAtCell(cell.x, cell.y, exceptId));
}

function showPlacementProblem(catalog, worldX, worldY, exceptId = null) {
  const outsideArea = !isFootprintInsideBuildArea(catalog, worldX, worldY);
  const collides = hasFootprintCollision(catalog, worldX, worldY, exceptId);
  let body = `${catalog.name} must stay fully inside the fenced build zone.`;
  if (outsideArea && collides) {
    body = `${catalog.name} must stay fully inside the fenced build zone and clear of other buildings.`;
  } else if (collides) {
    body = `${catalog.name} cannot overlap another building. Pick an empty footprint.`;
  }
  mapPopup = {
    variant: "warning",
    title: "Cannot place there",
    body
  };
  renderMap();
}

function confirmPlacement() {
  if (!placementMode) return;
  const catalog = getCatalog(placementMode.type);
  const exceptId = placementMode.action === "move" ? placementMode.buildingId : null;
  if (!isFootprintValid(catalog, placementMode.worldX, placementMode.worldY, exceptId)) {
    showPlacementProblem(catalog, placementMode.worldX, placementMode.worldY, exceptId);
    return;
  }

  if (placementMode.action === "move") {
    const building = state.buildings.find((item) => item.id === placementMode.buildingId);
    if (!building) return cancelPlacement();
    building.worldX = placementMode.worldX;
    building.worldY = placementMode.worldY;
    placementMode = null;
    mapPopup = null;
    selectedBuildingId = building.id;
    saveAndRender();
    return;
  }

  const status = buildStatus(catalog);
  if (!status.canBuild) {
    toast(status.reason);
    placementMode = null;
    mapPopup = null;
    render();
    return;
  }

  spend(catalog.cost);
  const instance = countBuildingSlots(placementMode.type) + 1;
  lastBuiltId = `b-${placementMode.type}-${Date.now()}`;
  const now = Date.now();
  state.buildings.push({
    id: lastBuiltId,
    type: placementMode.type,
    instance,
    level: 1,
    status: "constructing",
    worldX: placementMode.worldX,
    worldY: placementMode.worldY,
    construction: {
      startedAt: now,
      finishesAt: now + (catalog.buildDurationMs || BUILD_DURATION_MS)
    }
  });
  placementMode = null;
  mapPopup = null;
  selectedBuildingId = lastBuiltId;
  toast(`${catalog.name} construction started`);
  checkGoals();
  saveAndRender();
}

function upgradeBase() {
  const upgrade = nextBaseUpgrade();
  if (!upgrade) {
    toast("Rescue HQ is fully upgraded");
    return;
  }
  const status = baseUpgradeStatus();
  if (!status.canUpgrade) {
    toast(status.reason);
    return;
  }
  spend(upgrade.cost);
  const hq = state.buildings.find((building) => building.type === "hq");
  if (hq) {
    const nextLevel = baseLevel() + 1;
    const now = Date.now();
    hq.status = "upgrading";
    hq.upgrade = {
      name: upgrade.name,
      fromLevel: baseLevel(),
      toLevel: nextLevel,
      startedAt: now,
      finishesAt: now + (upgrade.durationMs || UPGRADE_DURATION_MS)
    };
  }
  toast(`${upgrade.name} started`);
  saveAndRender();
}

function upgradeKennel(building) {
  const status = kennelUpgradeStatus(building);
  if (!status.canUpgrade) {
    toast(status.reason);
    return;
  }
  spend(status.upgrade.cost);
  const now = Date.now();
  building.status = "upgrading";
  building.upgrade = {
    name: status.upgrade.name,
    fromLevel: buildingLevel(building),
    toLevel: buildingLevel(building) + 1,
    startedAt: now,
    finishesAt: now + (status.upgrade.durationMs || UPGRADE_DURATION_MS)
  };
  toast(`${status.upgrade.name} started`);
  saveAndRender();
}

function upgradeBuilding(buildingId) {
  const building = state.buildings.find((item) => item.id === buildingId);
  if (!building) return;
  if (building.type === "hq") {
    upgradeBase();
    return;
  }
  if (building.type === "kennel") {
    upgradeKennel(building);
  }
}

function acceptRescue(offerId) {
  if (state.dogs.length >= dogCapacity()) {
    toast("Build another Kennel first");
    return;
  }

  const offer = state.rescueOffers.find((item) => item.id === offerId);
  if (!offer) return;

  state.dogs.push({
    id: `dog-${Date.now()}`,
    name: offer.name,
    breed: offer.breed,
    note: offer.note,
    color: offer.color,
    location: "Kennel",
    stats: { ...offer.stats }
  });
  state.rescuedCount += 1;
  state.rescueOffers = state.rescueOffers.filter((item) => item.id !== offerId);
  state.rescueOffers.push(nextOffer());
  toast(`${offer.name} arrived at Pawborough`);
  checkGoals();
  saveAndRender();
}

function dogAction(dogId, action) {
  const dog = state.dogs.find((item) => item.id === dogId);
  if (!dog) return;

  if (action === "feed") {
    if (state.resources.food <= 0) return toast("No food left");
    state.resources.food -= 1;
    dog.stats.hunger = clamp(dog.stats.hunger + 24);
    dog.stats.trust = clamp(dog.stats.trust + 4);
    dog.stats.happiness = clamp(dog.stats.happiness + 3);
    toast(`${dog.name} had a proper meal`);
  }

  if (action === "treat") {
    if (state.resources.medicine <= 0) return toast("No medicine left");
    state.resources.medicine -= 1;
    const clinicBonus = countBuilding("vet") ? 12 : 4;
    dog.stats.health = clamp(dog.stats.health + 18 + clinicBonus);
    dog.stats.trust = clamp(dog.stats.trust + 3);
    dog.stats.energy = clamp(dog.stats.energy + 4);
    toast(`${dog.name} was treated`);
  }

  if (action === "groom") {
    const bonus = countBuilding("groom") ? 12 : 5;
    dog.stats.happiness = clamp(dog.stats.happiness + 10 + bonus);
    dog.stats.trust = clamp(dog.stats.trust + 6);
    dog.stats.energy = clamp(dog.stats.energy - 2);
    toast(`${dog.name} looks spruced up`);
  }

  if (action === "train") {
    const bonus = countBuilding("training") ? 10 : 3;
    dog.stats.energy = clamp(dog.stats.energy - 10);
    dog.stats.trust = clamp(dog.stats.trust + 5);
    updateReadiness(dog, 12 + bonus);
    toast(`${dog.name} learned a little more`);
  }

  if (action === "play") {
    const bonus = countBuilding("park") ? 11 : 4;
    dog.stats.happiness = clamp(dog.stats.happiness + 12 + bonus);
    dog.stats.energy = clamp(dog.stats.energy - 7);
    dog.stats.trust = clamp(dog.stats.trust + 4);
    updateReadiness(dog, 3);
    toast(`${dog.name} had play time`);
  }

  normalizeDog(dog);
  checkGoals();
  saveAndRender();
}

function normalizeDog(dog) {
  Object.keys(dog.stats).forEach((key) => {
    dog.stats[key] = clamp(dog.stats[key]);
  });
}

function adoptionReward(dog) {
  const centerBonus = countBuilding("adoption") ? 20 : 0;
  const repBonus = countBuilding("adoption") ? 1 : 0;
  return {
    coins: 45 + Math.floor(dog.stats.readiness / 3) + centerBonus,
    reputation: 2 + repBonus
  };
}

function rehomeDog(dogId) {
  const dog = state.dogs.find((item) => item.id === dogId);
  if (!dog || !isDogReady(dog)) return;
  const reward = adoptionReward(dog);
  award(reward);
  state.dogs = state.dogs.filter((item) => item.id !== dogId);
  state.rehomedCount += 1;
  activeDogId = null;
  closeDogSheet();
  toast(`${dog.name} found a home: ${rewardText(reward)}`);
  checkGoals();
  saveAndRender();
}

function hireWorker() {
  if (state.workers.total >= workerCapacity()) {
    toast("Build a Staff Cabin for more workers");
    return;
  }
  if (state.resources.coins < 60) {
    toast("Need 60 Coins");
    return;
  }
  state.resources.coins -= 60;
  state.workers.total += 1;
  state.hiredWorkers += 1;
  toast("New worker joined the rota");
  checkGoals();
  saveAndRender();
}

function changeWorker(roleId, delta) {
  const role = roleCatalog.find((item) => item.id === roleId);
  if (!role) return;
  if (role.building && countBuilding(role.building) === 0 && delta > 0) {
    toast(`Build ${getCatalog(role.building).name} first`);
    return;
  }
  if (delta > 0 && assignedWorkers() >= state.workers.total) {
    toast("No free workers");
    return;
  }
  const current = state.workers.roles[roleId];
  state.workers.roles[roleId] = Math.max(0, current + delta);
  saveAndRender();
}

function buildingTap(buildingId) {
  if (placementMode) return;
  selectedBuildingId = selectedBuildingId === buildingId ? null : buildingId;
  renderMap();
}

function advanceTime() {
  const now = Date.now();
  const workChanged = completeReadyJobs(now);
  const steps = Math.min(8, Math.floor((now - state.lastTick) / 6000));
  if (steps <= 0) {
    if (state.buildings.some(hasBuildingWorkInProgress)) {
      if (workChanged) saveState();
      render();
    } else if (workChanged) {
      saveAndRender();
    }
    return;
  }

  for (let index = 0; index < steps; index += 1) {
    passiveTick();
  }
  state.lastTick = now;
  checkGoals();
  saveAndRender();
}

function passiveTick() {
  if (countBuilding("food")) state.resources.food += 1;
  if (countBuilding("storage")) state.resources.materials += 1;
  if (countBuilding("donation")) state.resources.coins += 3 + state.workers.roles.admin * 2;

  state.dogs.forEach((dog) => {
    dog.stats.hunger = clamp(dog.stats.hunger - 2);
    dog.stats.energy = clamp(dog.stats.energy - 1);

    if (dog.stats.hunger < 38) {
      dog.stats.happiness = clamp(dog.stats.happiness - 2);
      dog.stats.health = clamp(dog.stats.health - 1);
    }

    if (state.workers.roles.carer > 0) {
      dog.stats.hunger = clamp(dog.stats.hunger + state.workers.roles.carer);
      dog.stats.happiness = clamp(dog.stats.happiness + state.workers.roles.carer);
      dog.stats.trust = clamp(dog.stats.trust + 1);
    }

    if (state.workers.roles.vet > 0 && countBuilding("vet")) {
      dog.stats.health = clamp(dog.stats.health + state.workers.roles.vet * 2);
    }

    if (state.workers.roles.groomer > 0 && countBuilding("groom")) {
      dog.stats.happiness = clamp(dog.stats.happiness + state.workers.roles.groomer * 2);
      dog.stats.trust = clamp(dog.stats.trust + 1);
    }

    if (state.workers.roles.trainer > 0 && countBuilding("training")) {
      updateReadiness(dog, state.workers.roles.trainer * 2);
    }

    if (countBuilding("park")) {
      dog.stats.energy = clamp(dog.stats.energy + 1);
    }

    normalizeDog(dog);
  });
}

function checkGoals() {
  goals.forEach((goal) => {
    if (!state.completedGoals.includes(goal.id) && goal.complete()) {
      state.completedGoals.push(goal.id);
      award(goal.reward);
      toast(`Goal complete: ${goal.title}`);
    }
  });
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
  window.setTimeout(() => {
    node.style.opacity = "0";
    node.style.transform = "translateY(8px)";
  }, 2500);
  window.setTimeout(() => node.remove(), 3000);
}

function resetGame() {
  localStorage.removeItem(STORAGE_KEY);
  state = createInitialState();
  activeDogId = null;
  lastBuiltId = null;
  selectedBuildingId = null;
  placementMode = null;
  mapPopup = null;
  panState = null;
  placementDragId = null;
  placementDragState = null;
  saveAndRender();
  toast("Fresh rescue started");
}

document.addEventListener("click", (event) => {
  if (suppressMapClick && event.target.closest("#town-map")) {
    suppressMapClick = false;
    return;
  }

  const cell = event.target.closest("[data-cell-x][data-cell-y]");
  if (cell) {
    setPlacementCell(Number(cell.dataset.cellX), Number(cell.dataset.cellY));
    return;
  }

  const confirmPlacementButton = event.target.closest("[data-confirm-placement]");
  if (confirmPlacementButton) {
    confirmPlacement();
    return;
  }

  const cancelPlacementButton = event.target.closest("[data-cancel-placement]");
  if (cancelPlacementButton) {
    cancelPlacement();
    return;
  }

  const closeMapPopupButton = event.target.closest("[data-close-map-popup]");
  if (closeMapPopupButton) {
    mapPopup = null;
    renderMap();
    return;
  }

  const closeInspectorButton = event.target.closest("[data-close-inspector]");
  if (closeInspectorButton) {
    selectedBuildingId = null;
    mapPopup = null;
    renderMap();
    return;
  }

  const moveButton = event.target.closest("[data-move-building]");
  if (moveButton) {
    startMovePlacement(moveButton.dataset.moveBuilding);
    return;
  }

  const upgradeButton = event.target.closest("[data-upgrade-building]");
  if (upgradeButton) {
    upgradeBuilding(upgradeButton.dataset.upgradeBuilding);
    return;
  }

  const buildNavButton = event.target.closest("[data-open-build-nav]");
  if (buildNavButton) {
    placementMode = null;
    selectedBuildingId = null;
    mapPopup = null;
    state.screen = "home";
    saveAndRender();
    openBuildSheet();
    return;
  }

  const nav = event.target.closest("[data-screen]");
  if (nav) {
    placementMode = null;
    selectedBuildingId = null;
    mapPopup = null;
    state.screen = nav.dataset.screen;
    saveAndRender();
    return;
  }

  const shortcut = event.target.closest("[data-screen-shortcut]");
  if (shortcut) {
    placementMode = null;
    selectedBuildingId = null;
    mapPopup = null;
    state.screen = shortcut.dataset.screenShortcut;
    saveAndRender();
    return;
  }

  const buildButton = event.target.closest("[data-start-build]");
  if (buildButton) {
    startBuildPlacement(buildButton.dataset.startBuild);
    return;
  }

  const dogButton = event.target.closest("[data-dog-id]");
  if (dogButton) {
    openDogSheet(dogButton.dataset.dogId);
    return;
  }

  const rescueButton = event.target.closest("[data-accept-rescue]");
  if (rescueButton) {
    acceptRescue(rescueButton.dataset.acceptRescue);
    return;
  }

  const actionButton = event.target.closest("[data-dog-action]");
  if (actionButton) {
    dogAction(actionButton.dataset.id, actionButton.dataset.dogAction);
    return;
  }

  const rehomeButton = event.target.closest("[data-rehome]");
  if (rehomeButton) {
    rehomeDog(rehomeButton.dataset.rehome);
    return;
  }

  const hireButton = event.target.closest("[data-hire-worker]");
  if (hireButton) {
    hireWorker();
    return;
  }

  const workerPlus = event.target.closest("[data-worker-plus]");
  if (workerPlus) {
    changeWorker(workerPlus.dataset.workerPlus, 1);
    return;
  }

  const workerMinus = event.target.closest("[data-worker-minus]");
  if (workerMinus) {
    changeWorker(workerMinus.dataset.workerMinus, -1);
    return;
  }

  const building = event.target.closest("[data-building-id]");
  if (building) {
    buildingTap(building.dataset.buildingId);
  }
});

els.townMap.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  if (event.target.closest(".placement-banner, .building-inspector, .map-popup, .map-side, .map-status")) return;
  if (placementMode) {
    placementDragId = event.pointerId;
    placementDragState = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWorldX: placementMode.worldX,
      startWorldY: placementMode.worldY,
      moved: false,
      layoutGrid: els.townMap.classList.contains("layout-grid-mode")
    };
    els.townMap.setPointerCapture(event.pointerId);
    if (!placementDragState.layoutGrid) {
      setPlacementFromPointer(event);
      suppressMapClick = true;
    }
    return;
  }
  if (els.townMap.classList.contains("layout-grid-mode")) return;
  panState = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    cameraX: state.camera?.x ?? DEFAULT_CAMERA.x,
    cameraY: state.camera?.y ?? DEFAULT_CAMERA.y,
    moved: false
  };
  els.townMap.setPointerCapture(event.pointerId);
});

els.townMap.addEventListener("pointermove", (event) => {
  if (placementDragId === event.pointerId) {
    if (placementDragState?.layoutGrid) {
      const dx = event.clientX - placementDragState.startX;
      const dy = event.clientY - placementDragState.startY;
      if (!placementDragState.moved && Math.hypot(dx, dy) <= 5) return;
      placementDragState.moved = true;
      suppressMapClick = true;
      setPlacementFromLayoutPointer(event);
    } else {
      setPlacementFromPointer(event);
    }
    return;
  }

  if (!panState || panState.id !== event.pointerId) return;
  const dx = event.clientX - panState.startX;
  const dy = event.clientY - panState.startY;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panState.moved = true;
  if (!panState.moved) return;
  state.camera.x = panState.cameraX + dx;
  state.camera.y = panState.cameraY + dy;
  applyCameraTransform();
});

function finishPan(event) {
  if (placementDragId === event.pointerId) {
    const dragged = Boolean(placementDragState?.moved);
    placementDragId = null;
    placementDragState = null;
    suppressMapClick = dragged;
    window.setTimeout(() => {
      suppressMapClick = false;
    }, 120);
    return;
  }

  if (!panState || panState.id !== event.pointerId) return;
  suppressMapClick = panState.moved;
  panState = null;
  if (suppressMapClick) {
    window.setTimeout(() => {
      suppressMapClick = false;
    }, 120);
  }
  saveState();
}

els.townMap.addEventListener("pointerup", finishPan);
els.townMap.addEventListener("pointercancel", finishPan);

els.startGame.addEventListener("click", () => {
  state.seenSplash = true;
  saveAndRender();
});

els.resetGame.addEventListener("click", resetGame);
els.openBuild?.addEventListener("click", openBuildSheet);
els.closeBuild.addEventListener("click", closeBuildSheet);
els.closeDog.addEventListener("click", closeDogSheet);

els.buildSheet.addEventListener("click", (event) => {
  if (event.target === els.buildSheet) closeBuildSheet();
});

els.dogSheet.addEventListener("click", (event) => {
  if (event.target === els.dogSheet) closeDogSheet();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    mapPopup = null;
    closeBuildSheet();
    closeDogSheet();
    renderMap();
  }
});

window.setInterval(advanceTime, 1000);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js?v=60").then((registration) => {
    registration.update();
  }).catch(() => {});
}

checkGoals();
completeReadyJobs();
saveAndRender();
