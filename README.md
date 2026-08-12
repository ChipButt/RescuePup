# Pawborough mobile prototype

Pawborough is a mobile-first playable prototype for a cosy dog-rescue city-builder.

## Run locally

From this folder:

```bash
python3 -m http.server 8099
```

Then open:

```text
http://127.0.0.1:8112/index.html?v=60
```

If that port is already in use, pick another port and keep the same `index.html?v=60` path.

## Raster art pipeline

The game world now uses image-generated PNG assets instead of inline SVG/CSS placeholder art. The grass tile, fence atlas, building atlas, dog atlas, and icon atlas are stored as source images under `assets/generated/`, then processed into transparent runtime PNGs:

```bash
python3 tools/process_generated_assets.py
```

Runtime art lives in `assets/world/`, `assets/buildings/`, `assets/dogs/`, `assets/icons/`, and `assets/ui/`. The processor removes chroma-green backgrounds from the atlases, trims the subjects, fits them onto consistent transparent canvases, and validates that the exported sprites contain real alpha.

## Included

- Branded splash screen
- Faux-isometric grassy build lot with a fenced starter area
- Grid-based building placement, repositioning, footprint checks, and camera pan
- One continuous perimeter fence around the active world-space rectangle
- HQ upgrades that expand the same buildable rectangle from 12x12 to 16x16, 20x20, and 24x24 while gating later buildings
- Resource bar and supply loop
- Build menu with raster building art, dependency locks, costs, and placement mode
- Dog list, dog detail sheet, care actions, and readiness stats
- Rescue intake offers
- Staff assignment and hiring
- Adoption rewards
- Quest-style goals
- Local save data and PWA manifest

The prototype is dependency-free and can be used as a gameplay and visual target before moving into Expo, React Native, or native SwiftUI.
