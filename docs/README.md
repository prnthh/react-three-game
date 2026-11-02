# Rendering and authoring examples

Start with the [inline prefab walkthrough](../README.md#1-render-an-inline-prefab):
render a cube, edit it, pack copies, add behavior, then save. For browser-driven
scene edits, follow the [Scene API guide](public/editor-scene-for-agents.md).

These routes are host applications built with React Three Game. Their game loops,
controllers, world layout and narrative policies live in each demo's source.
The library supplies shared loading and residency mechanisms.

Run `npm run dev` from the repository root. The docs webpack configuration resolves library imports to source; `npm run build` builds the published library. Verify production with `npm --prefix docs run build`.

Demo behavior, scene fixtures, and executable documentation examples are tested in
`docs/tests`. Run `npm test --workspace docs` from the repository root, or `npm test`
from this directory. Library regressions belong in the root `tests` directories.

The Examples menu goes from viewing and components to physics, gameplay and streaming.
Keep short game-system connections inline when that makes
the example easier to copy. Extract behavior when it becomes useful across scenes.
Components stay in the demo that owns them and may be imported by other demos.

| Demo | Pattern |
| --- | --- |
| [Viewer](app/viewer/page.tsx) | A Rotator scene shared with the component editor. |
| [Asset Viewer](app/demo/assetviewer/page.tsx) | Browse the shared asset manifest, with loading and error states. |
| [Custom Component](app/demo/customcomponent/page.tsx) | Minimal scene shared with Viewer; Rotator and Squish are registered for editing. |
| [Cool stuff](app/demo/coolstuff/page.tsx) | One scene with interior mapping, ragdolls, and a small sleeping-box warehouse, each under its own parent node. |
| [Parkour](app/demo/parkour/page.tsx) | Concrete passage course with local lighting, player movement and procedural concrete. |
| [Point n Click](app/demo/stage/page.tsx) | Inline interaction/dialogue/transition flow; shared component registration with its editor. |
| [Relay Yard FPS](app/demo/fps/page.tsx) | Authored map and gameplay prefabs, authoritative simulation, snapshot-driven views and replay; includes a map editor. |
| [Terrain workshop](app/demo/terrain/page.tsx) | Registered painting tools, demo-owned player controls and an explicit terrain collider budget. |
| [Killbox FPS](app/demo/killbox/page.tsx) | Player, NPC and weapon-system integration. The page composes its gameplay systems. |
| [Streamed World](app/demo/grassworld/README.md) | Terrain windows, colliders, vegetation and a reusable water component. |


Also available: [general editor](app/editor/page.tsx),
[home city composition](app/components/DemoApp.tsx), and the [Scene API guide](public/editor-scene-for-agents.md).

The home viewer loads its saved scene document. Its demo-owned
[`PrefabGridStreamer`](app/components/PrefabGridStreamerComponent.tsx) defines the
repeating tile window; the library supplies authored lighting and
[distance streaming](PREFABS.md#automatically-stream-static-scenery). Its
[generator](../scripts/generate-home-city.mjs) maintains the authored scene.

Author small scenes inline. Pack assemblies for repetition within a scene; export
a separate prefab file when sharing across scenes. Saved demo documents live in
`public/prefabs` and can be edited directly.

Keep specialized demo components under their demo. Interior mapping and the parkour controller register their own components.

See the [documentation map](ARCHITECTURE.md#documentation-map) for library guides.
Demo-specific setup and implementation notes belong beside each demo.

## Asset catalog

Asset pickers and `scene.assets()` read `public/manifest.json` relative to the
host's `basePath`. After adding assets, run
`npm run generate-manifests --workspace docs` from the repository root. See
[prefab directory conventions](public/prefabs/README.md) for saved scenes and
[asset preview integration](editor-systems.md#asset-previews) for custom hosts.

## Headless export

```sh
npm i -g react-three-game
rtg convert public/prefabs/brutalist-city/brutalist-skywalk.json skywalk.glb public
rtg convert skywalk.glb skywalk.json
```

Run from `docs/`. The commands specify the input, output, and public asset directory.
See the [CLI walkthrough](../README.md#node-cli) for document edits.
