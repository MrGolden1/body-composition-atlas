# Body Composition Atlas

Interactive 3D presentation of InBody / Anea body-composition reports — English and Persian,
desktop and mobile.

```
npm install
npm run dev       # http://localhost:5173
npm run build     # static bundle in dist/ (serve with `npm run preview`)
```

Add `?lang=fa` to the URL to open in Persian (the choice is remembered).

## How the body is made

The figure is the MakeHuman base mesh (CC0 1.0, makehumancommunity.org) baked into
`src/assets/body.mhb` by `node tools/bake-body.mjs` (downloads the assets into `tools/mh-cache`).

At runtime, for every test:

1. Each segment's measured lean and fat mass (scaled so segments + head = printed weight) is
   turned into a volume (fat 0.90 kg/L, fat-free mass 1.10 kg/L).
2. MakeHuman's own weight / muscle morph targets are blended **per segment** and solved so that
   each arm, leg and the trunk has exactly that volume.
3. The lean (fat-free) surface is the skin pushed inwards by a fat-thickness field shaped like
   MakeHuman's fat distribution, solved so the removed volume equals the measured subcutaneous fat.
4. Visceral fat is an ellipsoid whose navel-level cross-section equals the measured area.

## Files

- `src/data.js`        – every measurement from the reports (edit numbers / add tests here)
- `src/i18n.js`        – English / Persian strings, Persian digits
- `src/body/model.js`  – mesh decoding, Catmull–Clark subdivision, morphing, volume solver, posing
- `src/shape.js`       – report → shape parameters, colour ramps
- `src/materials.js`   – procedural skin, fat (lobules), muscle (fibres) and cross-section shaders
- `src/main.js`        – scene, cutaway / slice (stencil caps), animation, interaction
- `src/ui.js`          – panels, metric cards, real cross-section from the 3D model, trends
- `tools/bake-body.mjs` – builds `src/assets/body.mhb`

Views: Body · Fat map · Tissue (X-ray / Cutaway / Slice, with layer toggles) · Compare (ghost + change map).
Keys: 1–4 switch view, ←/→ switch test.
