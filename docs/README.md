# Demo workspace

Run `npm run dev` from the repository root. Demos import the built library from `dist`; `npm run build` rebuilds it. Verify production with `npm --prefix docs run build`.

| Route | Demonstrates |
| --- | --- |
| `/` | City chunks behind a centered landing-page hero |
| `/viewer` | Scene-authored camera and runtime rendering |
| `/editor` | Visual prefab authoring |
| `/demo/customcomponent` | One-file components with schema-generated inspectors |
| `/demo/grassworld` | CameraFollow, streamed terrain, physics, cascaded sunlight |
| `/demo/lights` | Budgeted colored lights and cached sun shadows |
| `/demo/interior` | Interior mapping and instanced windows |
| `/demo/interior/editor` | Custom interior mapping inspector |
| `/demo/physics` | Authored physics and gameplay |
| `/demo/stage` | Point-and-click game |
| `/demo/stage/editor` | Its scene editor |
| `/demo/benchmark` | Rendering scale and instancing |

Edit prefab JSON in `public/prefabs` directly. Builds do not generate scenes.

The city uses one shared set of visual prefabs: three buildings and a planter. `city-chunk.json` places them around a continuous path. `game-level.json` owns the camera, fog, lighting, and chunk streamer. Concrete reuses the grey-tinted sand texture. Physics/NPC examples have their own scenes.

Keep specialized demo components under their demo. Interior mapping and light-budget selection are examples, not built-in engine systems.

See [architecture](ARCHITECTURE.md), [lighting](LIGHTING.md), and [interior mapping](INTERIOR-MAPPING.md).
