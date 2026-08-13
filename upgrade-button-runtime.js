"use strict";
(() => {
  if (!window.RescuePupUpgradeButtonAsset || typeof renderBuildingPopup !== "function") return;
  const renderPopupWithLayout = renderBuildingPopup;
  renderBuildingPopup = function renderPopupWithApprovedUpgradeButton(building) {
    return renderPopupWithLayout(building).replace(
      "./assets/ui/button-start-upgrade.png",
      window.RescuePupUpgradeButtonAsset
    );
  };
})();
