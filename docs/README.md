# Rendering and authoring examples

For browser-driven scene edits, see the [agent guide](public/editor-scene-for-agents.md).

These routes are host applications built with React Three Game. Their game loops,
controllers, world residency and narrative systems are examples, not engine APIs.

Run `npm run dev` from the repository root. Demos import the built library from `dist`; `npm run build` rebuilds it. Verify production with `npm --prefix docs run build`.

Demo behavior, scene fixtures, and executable documentation examples are tested in
`docs/tests`. Run `npm test --workspace docs` from the repository root, or `npm test`
from this directory. Library regressions belong in the root `tests` directories.

The Examples menu goes from viewing and components to physics, gameplay and streaming.
Keep short game-system connections inline when that makes
the example easier to copy. Extract reusable scene behavior, not every function.
Components stay in the demo that owns them and may be imported by other demos.

| Demo | Pattern / cleanup status |
| --- | --- |
| [Viewer](app/viewer/page.tsx) | One saved Rotator scene shared with the component editor; no streaming or selector setup. |
| [Asset Viewer](app/demo/assetviewer/page.tsx) | Browse the shared asset manifest, with loading and error states. |
| [Custom Component](app/demo/customcomponent/page.tsx) | Minimal scene shared with Viewer; Rotator and Squish are registered for editing. |
| [Cool stuff](app/demo/coolstuff/page.tsx) | One scene with interior mapping, ragdolls, and a small sleeping-box warehouse, each under its own parent node. |
| [Parkour](app/demo/parkour/page.tsx) | Player movement, procedural concrete, and static scene shadows. |
| [Point n Click](app/demo/stage/page.tsx) | Inline interaction/dialogue/transition flow; shared component registration with its editor. |
| [Killbox FPS](app/demo/killbox/page.tsx) | Player, NPC and weapon-system integration. Keep page wiring inline; review the large NPC component separately. |
| [Streamed World](app/demo/grassworld/page.tsx) | A bounded chunk window owns terrain colliders and deterministic grass/flowers with dense billboard blades, layered wind and recovering trails; [Water](app/demo/grassworld/components/Water.tsx) is a reusable, registered scene component. |

Water remains in `demo/grassworld/components/Water.tsx`. Import `WaterComponent`,
call `registerComponent(WaterComponent)`, then add `{type:'Water', properties:{level:0,size:100,speed:0.1}}`
to a node. It needs an `Environment`, its normal-map asset (or a `normalMap` URL),
and `GameCanvas glConfig={{antialias:false}}`. Keep the surface horizontal; it has
no collider. `followCamera:true` keeps water under a travelling camera; its world-space waves stay anchored.

Also available: [general editor](app/editor/page.tsx),
[home city composition](app/components/DemoApp.tsx), and the [agent guide](public/editor-scene-for-agents.md).

Edit prefab JSON in `public/prefabs` directly. Builds do not generate scenes.

Keep specialized demo components under their demo. Interior mapping and the parkour controller are examples, not built-in engine systems.

See [architecture](ARCHITECTURE.md), [lighting](LIGHTING.md), and [interior mapping](INTERIOR-MAPPING.md).

## Headless export

```sh
npm i -g react-three-game
rtg convert public/prefabs/brutalist-city/brutalist-skywalk.json skywalk.glb public
rtg convert skywalk.glb skywalk.json
```

Run from `docs/`. Both paths are required; no sample is selected automatically.
See the [Node API](../README.md#node-scene-conversion) for scripting.
