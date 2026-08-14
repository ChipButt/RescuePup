"use strict";

(() => {
  const BREEDS = Object.freeze([
    Object.freeze({ name: "Alaskan Malamute", asset: "./wolf-all-alaskan-malamute.png", note: "Strong, steady, and happiest with a job to do." }),
    Object.freeze({ name: "Beagle", asset: "./wolf-all-beagle.webp", note: "Curious, cheerful, and always ready to follow an interesting scent." }),
    Object.freeze({ name: "Belgian Tervuren", asset: "./wolf-all-belgian-tervuren.png", note: "Alert, clever, and quick to learn the rescue routine." }),
    Object.freeze({ name: "Czechoslovakian Wolfdog", asset: "./wolf-all-czechoslovakian-wolfdog.png", note: "Athletic, observant, and always ready to explore." }),
    Object.freeze({ name: "German Shepherd", asset: "./wolf-all-german-shepherd.png", note: "Focused, dependable, and eager to help around the yard." }),
    Object.freeze({ name: "Golden Retriever", asset: "./wolf-all-golden-retriever.png", note: "Friendly, enthusiastic, and delighted to be involved." }),
    Object.freeze({ name: "Greenland Dog", asset: "./wolf-all-greenland-dog.png", note: "Hardy, energetic, and built for a busy working day." }),
    Object.freeze({ name: "Siberian Husky", asset: "./wolf-all-siberian-husky.png", note: "Lively, independent, and always looking for the next task." }),
    Object.freeze({ name: "White Swiss Shepherd", asset: "./wolf-all-white-swiss-shepherd.png", note: "Gentle, attentive, and keen to stay close to the team." })
  ]);

  const known = new Set(BREEDS.map((breed) => breed.name));
  const starterBeagle = BREEDS.find((breed) => breed.name === "Beagle");

  function stableHash(value) {
    let h = 2166136261;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function breedForKey(value) {
    return BREEDS[stableHash(value) % BREEDS.length];
  }

  try {
    if (typeof rescueTemplates !== "undefined" && Array.isArray(rescueTemplates)) {
      rescueTemplates.splice(
        0,
        rescueTemplates.length,
        ...BREEDS.map((breed) => ({ breed: breed.name, note: breed.note }))
      );
    }
  } catch {}

  let changed = false;

  try {
    for (const dog of state?.dogs || []) {
      // dog-1 is the starter dog created by app.js. Make the new Beagle
      // immediately visible in existing saves as well as new games.
      if (dog.id === "dog-1" && starterBeagle && dog.breed !== starterBeagle.name) {
        dog.breed = starterBeagle.name;
        changed = true;
        continue;
      }

      if (!known.has(dog.breed)) {
        const breed = breedForKey(dog.id || dog.name);
        dog.breed = breed.name;
        dog.note = dog.note || breed.note;
        changed = true;
      }
    }

    for (const offer of state?.rescueOffers || []) {
      if (!known.has(offer.breed)) {
        const breed = breedForKey(offer.id || offer.name);
        offer.breed = breed.name;
        offer.note = breed.note;
        changed = true;
      }
    }
  } catch {}

  if (changed) {
    try { if (typeof saveState === "function") saveState(); } catch {}
    try { if (typeof renderScreens === "function") renderScreens(); } catch {}
  }

  window.RescuePupDogBreeds = Object.freeze({
    breeds: BREEDS,
    names: Object.freeze(BREEDS.map((breed) => breed.name)),
    assetForBreed(name) {
      return BREEDS.find((breed) => breed.name === name)?.asset || null;
    }
  });
})();
