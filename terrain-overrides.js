"use strict";
(() => {
  const popupCss = document.createElement("link");
  popupCss.rel = "stylesheet";
  popupCss.href = "./popup-layout.css?v=82";
  document.head.appendChild(popupCss);

  import("./terrain-core.js?v=82")
    .then(() => import("./popup-layout.js?v=82"))
    .catch((error) => console.error("RescuePup world UI failed to load", error));
})();
