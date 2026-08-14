"use strict";

// The visual stick-collection loop is authoritative: a stick is added only when
// a collector actually reaches its assigned Stick Storage. This replaces the
// old invisible six-second background stick tick.
(() => {
  try {
    if (typeof passiveTick === "function") passiveTick = function dogWorkerAuthoritativePassiveTick() {};
  } catch {}

  const previousPhase = new Map();

  function awardDeliveredSticks() {
    const workerApi = window.RescuePupDogWorkers;
    if (!workerApi) return;

    for (const dog of workerApi.dogs) {
      const previous = previousPhase.get(dog.id);
      const deliveredNow = dog.job === "sticks" && dog.phase === "deliver" && previous !== "deliver";
      previousPhase.set(dog.id, dog.phase);

      if (!deliveredNow || typeof addSticks !== "function") continue;
      addSticks(1);
      if (typeof saveState === "function") saveState();
      if (typeof renderResourceBar === "function") renderResourceBar();
      // Only rebuilds terrain when a capacity visual band changes; otherwise the
      // terrain renderer's signature check makes this effectively a no-op.
      if (typeof renderMap === "function") renderMap();
    }
  }

  window.setInterval(awardDeliveredSticks, 120);
})();
