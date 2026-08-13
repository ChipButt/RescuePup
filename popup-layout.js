"use strict";

// Exact RescuePup building-popup layout exported from the user's 845x1495 designer.
// Keep this object as the source of truth: popup DOM is positioned directly from rectPercent.
const BUILDING_POPUP_LAYOUT = Object.freeze({
  schema: "rescuepup-building-popup-layout-v1",
  designSpace: Object.freeze({ width: 845, height: 1495, aspectRatio: "845/1495" }),
  elements: Object.freeze({
    popupTemplate: Object.freeze({ rectPx:{x:0,y:0,width:845,height:1495}, rectPercent:{left:0,top:0,width:100,height:100}, zIndex:0, assetPath:"assets/ui/building-popup-template.png", objectFit:"contain" }),
    closeButton: Object.freeze({ rectPx:{x:727,y:83,width:106,height:106}, rectPercent:{left:86.0355,top:5.5518,width:12.5444,height:7.0903}, zIndex:50, assetPath:"assets/ui/button-close-raster-v2.png", objectFit:"contain" }),
    buildingTitle: Object.freeze({ rectPx:{x:225,y:80,width:400,height:65}, rectPercent:{left:26.6272,top:5.3512,width:47.3373,height:4.3478}, zIndex:30 }),
    buildingLevel: Object.freeze({ rectPx:{x:370,y:185,width:175,height:40}, rectPercent:{left:43.787,top:12.3746,width:20.7101,height:2.6756}, zIndex:30 }),
    buildingImage: Object.freeze({ rectPx:{x:130,y:140,width:565,height:510}, rectPercent:{left:15.3846,top:9.3645,width:66.8639,height:34.1137}, zIndex:20, objectFit:"cover" }),
    moveButton: Object.freeze({ rectPx:{x:620,y:650,width:120,height:115}, rectPercent:{left:73.3728,top:43.4783,width:14.2012,height:7.6923}, zIndex:40, assetPath:"assets/ui/button-move-raster.png", objectFit:"contain" }),
    description: Object.freeze({ rectPx:{x:140,y:660,width:456,height:95}, rectPercent:{left:16.568,top:44.1472,width:53.9645,height:6.3545}, zIndex:30 }),
    upgradeHeading: Object.freeze({ rectPx:{x:260,y:800,width:315,height:50}, rectPercent:{left:30.7692,top:53.5117,width:37.2781,height:3.3445}, zIndex:30 }),
    requirementsHeading: Object.freeze({ rectPx:{x:100,y:860,width:286,height:38}, rectPercent:{left:11.8343,top:57.5251,width:33.8462,height:2.5418}, zIndex:30 }),
    requirementsList: Object.freeze({ rectPx:{x:90,y:915,width:312,height:360}, rectPercent:{left:10.6509,top:61.204,width:36.9231,height:24.0803}, zIndex:30, listStyle:{rowHeightPx:58,rowGapPx:3,iconSizePx:36,fontSizePx:16,fontWeight:900,color:"#4e3016",lineHeight:1.05} }),
    bonusesHeading: Object.freeze({ rectPx:{x:465,y:860,width:286,height:38}, rectPercent:{left:55.0296,top:57.5251,width:33.8462,height:2.5418}, zIndex:30 }),
    bonusesList: Object.freeze({ rectPx:{x:450,y:915,width:295,height:355}, rectPercent:{left:53.2544,top:61.204,width:34.9112,height:23.7458}, zIndex:30, listStyle:{rowHeightPx:58,rowGapPx:3,iconSizePx:36,fontSizePx:16,fontWeight:900,color:"#4e3016",lineHeight:1.05} }),
    upgradeButton: Object.freeze({ rectPx:{x:-50,y:1315,width:950,height:115}, rectPercent:{left:-5.9172,top:87.9599,width:112.426,height:7.6923}, zIndex:40, assetPath:"assets/ui/button-start-upgrade.png", objectFit:"contain" }),
    upgradeTime: Object.freeze({ rectPx:{x:365,y:1386,width:200,height:28}, rectPercent:{left:43.1953,top:92.709,width:23.6686,height:1.8729}, zIndex:50 })
  })
});

window.RescuePupBuildingPopupLayout = BUILDING_POPUP_LAYOUT;

function popupLayoutStyle(id) {
  const element = BUILDING_POPUP_LAYOUT.elements[id];
  if (!element) return "";
  const rect = element.rectPercent;
  return `left:${rect.left}%;top:${rect.top}%;width:${rect.width}%;height:${rect.height}%;z-index:${element.zIndex};`;
}

function popupRequirementData(building) {
  if (buildingLevel(building) >= 6) {
    return [{ label:"Upgrade", icon:"./assets/icons/build.png", note:"Maximum level", met:true }];
  }
  const cost = upgradeCost(building);
  return Object.entries(cost).map(([key, required]) => ({
    label: resourceMeta[key]?.label || key,
    icon: `./${resourceMeta[key]?.icon || "assets/icons/build.png"}`,
    note: `${Math.floor(Number(state.resources[key]) || 0)} / ${required}`,
    met: (Number(state.resources[key]) || 0) >= required
  }));
}

function popupBonusData(building) {
  const level = buildingLevel(building);
  if (level >= 6) return [{ label:"Status", value:"Fully upgraded", icon:"./assets/icons/build.png" }];
  const next = level + 1;
  const catalog = getCatalog(building.type);
  const rows = [{ label:"Level", value:`${level} → ${next}`, icon:"./assets/icons/build.png" }];
  if (building.type === "kennel") rows.push({ label:"Dog spaces", value:String(KENNEL_CAPACITY_BY_LEVEL[next]), icon:"./assets/icons/dogs.png" });
  if (building.type === "storage") rows.push({ label:"Stick capacity", value:String(storageCapacity(next)), icon:"./assets/icons/materials.png" });
  if (["food","crop_farm","protein_farm"].includes(building.type)) rows.push({ label:"Production", value:"Improved", icon:"./assets/icons/food.png" });
  rows.push({ label:"Footprint", value:`${catalog.footprintWidth}×${catalog.footprintHeight}`, icon:"./assets/icons/build.png" });
  return rows;
}

function renderPopupRequirements(building) {
  return popupRequirementData(building).map((row) => `
    <li class="${row.met ? "met" : "missing"}">
      <img src="${row.icon}" alt="" draggable="false" />
      <span><b>${row.label}</b><small>${row.note}</small></span>
      <i aria-hidden="true">${row.met ? "✓" : "!"}</i>
    </li>`).join("");
}

function renderPopupBonuses(building) {
  return popupBonusData(building).map((row) => `
    <li>
      <img src="${row.icon}" alt="" draggable="false" />
      <span><b>${row.label}</b><small>${row.value}</small></span>
    </li>`).join("");
}

// Current cleaned build upgrades complete immediately. Keep the JSON timer position,
// but label the current mechanic accurately rather than inventing an unapproved duration.
function popupUpgradeTime(building) {
  return buildingLevel(building) >= 6 ? "" : "Instant";
}

renderBuildingPopup = function renderJsonBuildingPopup(building) {
  const catalog = getCatalog(building.type);
  if (!catalog) return "";
  const level = buildingLevel(building);
  const nextLevel = Math.min(6, level + 1);
  const cost = level < 6 ? upgradeCost(building) : null;
  const canUpgradeNow = Boolean(cost && canAfford(cost));
  const timeText = popupUpgradeTime(building);
  const upgradeHeading = level < 6 ? `UPGRADE TO LEVEL ${nextLevel}` : "MAXIMUM LEVEL";

  return `
    <button class="building-popup-scrim" type="button" data-close-building-ui aria-label="Close building details"></button>
    <div class="building-inspector" role="dialog" aria-modal="true" aria-label="${catalog.name} details" data-popup-schema="${BUILDING_POPUP_LAYOUT.schema}">
      <img class="popup-layout-image popup-template" data-popup-layout-id="popupTemplate" style="${popupLayoutStyle("popupTemplate")}" src="./assets/ui/building-popup-template.png" alt="" draggable="false" />
      <button class="popup-layout-button popup-close-button" data-popup-layout-id="closeButton" style="${popupLayoutStyle("closeButton")}" type="button" data-close-building-ui aria-label="Close">
        <img src="./assets/ui/button-close-raster-v2.png" alt="" draggable="false" />
      </button>
      <div class="popup-layout-text popup-building-title" data-popup-layout-id="buildingTitle" style="${popupLayoutStyle("buildingTitle")}">${catalog.name}</div>
      <div class="popup-layout-text popup-building-level" data-popup-layout-id="buildingLevel" style="${popupLayoutStyle("buildingLevel")}">Level ${level}</div>
      <div class="popup-layout-image popup-building-image" data-popup-layout-id="buildingImage" style="${popupLayoutStyle("buildingImage")}">
        <img src="${buildingSpritePath(building.type, level)}" alt="" draggable="false" />
      </div>
      <button class="popup-layout-button popup-move-button" data-popup-layout-id="moveButton" style="${popupLayoutStyle("moveButton")}" type="button" data-move-building="${building.id}" aria-label="Move ${catalog.name}">
        <img src="./assets/ui/button-move-raster.png" alt="" draggable="false" />
      </button>
      <div class="popup-layout-text popup-description" data-popup-layout-id="description" style="${popupLayoutStyle("description")}">${catalog.short}</div>
      <div class="popup-layout-text popup-upgrade-heading" data-popup-layout-id="upgradeHeading" style="${popupLayoutStyle("upgradeHeading")}">${upgradeHeading}</div>
      <div class="popup-layout-text popup-section-heading" data-popup-layout-id="requirementsHeading" style="${popupLayoutStyle("requirementsHeading")}">REQUIREMENTS</div>
      <div class="popup-layout-list popup-requirements-list" data-popup-layout-id="requirementsList" style="${popupLayoutStyle("requirementsList")}"><ul>${renderPopupRequirements(building)}</ul></div>
      <div class="popup-layout-text popup-section-heading" data-popup-layout-id="bonusesHeading" style="${popupLayoutStyle("bonusesHeading")}">UPGRADE BONUSES</div>
      <div class="popup-layout-list popup-bonuses-list" data-popup-layout-id="bonusesList" style="${popupLayoutStyle("bonusesList")}"><ul>${renderPopupBonuses(building)}</ul></div>
      <button class="popup-layout-button popup-upgrade-button ${canUpgradeNow ? "upgrade-ready" : "upgrade-locked"}" data-popup-layout-id="upgradeButton" style="${popupLayoutStyle("upgradeButton")}" type="button" data-upgrade-building="${building.id}" ${canUpgradeNow ? "" : "disabled"} aria-label="${level < 6 ? `Upgrade ${catalog.name}` : "Maximum level"}">
        <img src="./assets/ui/button-start-upgrade.png" alt="" draggable="false" />
        <span class="sr-only">${level < 6 ? `Upgrade · ${costText(cost)}` : "Maximum level"}</span>
      </button>
      ${timeText ? `<div class="popup-layout-text popup-upgrade-time" data-popup-layout-id="upgradeTime" style="${popupLayoutStyle("upgradeTime")}">${timeText}</div>` : ""}
    </div>`;
};
