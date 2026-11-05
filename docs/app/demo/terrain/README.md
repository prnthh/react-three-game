# Terrain workshop

Open `/demo/terrain`, select any **Landscape row · column** tile, then choose **Paint terrain materials** in the inspector. The editor also has **+ Add object → Terrain**, which creates a flat terrain with four default material colors.

- Pencil or left mouse drag paints the selected material. Radius is measured in world units; strength, hardness and optional pen pressure control the brush.
- Fingers navigate with the existing orbit controls. Right-drag or Alt+left-drag navigates with a mouse. Incidental touches are ignored while a stroke is active.
- Painting crosses unlocked terrain tiles whose four resolved material layers match the selected tile. The world-space brush footprint reaches both sides of seams; incompatible palettes and hidden tiles are excluded. Each completed stroke is one scene-history action across every touched tile. Escape, lost pointer capture, pointer cancellation and window blur cancel the active stroke. Done exits painting; previous object lock flags are preserved.
- Save the scene from the File menu after leaving paint mode. Painted maps are embedded lossless PNGs and travel with the scene JSON. Undo revisions retain compressed PNG strings; only the current painted image is decoded locally, outside the shared asset cache.

The demo contains a centered 10×10 grid of independently editable 32×32 terrain tiles, placed edge to edge. Each tile uses 64 subdivisions per axis (819,200 terrain triangles total), its own height/weight crop, and shared PBR layer textures. The camera opens on the full grid; focus a tile to paint it. The default maps sample a continuous seeded field covering 641×641 samples, with one shared border sample. Each tile has a 65×65 height map aligned to its 65×65 mesh vertices and a separate 65×65 editable weight map. The workshop keeps all 100 tiles mounted.

## Component

`Terrain` is a built-in object component that owns its mesh and TSL `MeshStandardNodeMaterial`. Add `Transform` to position it.

| Property | Default | Meaning |
| --- | --- | --- |
| width / depth | 32 | Local world dimensions |
| segments | 128 | Subdivisions per axis, clamped to 1–512 |
| heightScale | 8 | Height represented by white in the height map |
| heightMap | empty | Linear grayscale image; empty gives flat ground |
| weightMap | empty | RGB material weights; empty gives the first material |
| weightResolution | 256 | Editable map size per axis, clamped to 16–1024 |
| layers | Grass, Dirt, Rock, Sand | Four layers in fixed channel order |

Each layer has `name`, `color` (tint), `albedoMap`, `normalMap` (OpenGL tangent-space), `roughnessMap` (red channel), `roughness` (multiplier) and `tileSize` in local scene units. Albedo is sampled in sRGB; height, weights, normals and roughness are linear data. Images can be uploaded or referenced by URL/basePath-relative asset path. Uploaded images are embedded in the scene. Remote height and weight images require CORS permission for canvas pixel access.

The weight image stores layers 1–3 in RGB. Layer 4 is `1 - R - G - B`; excess RGB weight is normalized. Alpha is always 255, avoiding PNG premultiplication damage. Black selects layer 4, red layer 1, green layer 2, blue layer 3. Brushes redistribute weight across all four layers and preserve a total of one. Imported weights are resampled to `weightResolution`.

The image top edge maps to local negative Z (UV v=1). Height uses the red channel as 8-bit normalized data, bilinearly sampled onto the real mesh. Mesh normals, bounds and raycast picking are rebuilt when height/dimensions change. The visual brush ring is a TSL overlay on the same mesh.

## Material painting

The tool paints material weights using planar layer textures. Height maps define the surface shape, and `TerrainPhysics` supplies collision geometry. Save scene JSON to preserve the editable procedural material. Higher map resolutions increase paint detail and scene/history size. The workshop uses repository textures and generated sample height/weight maps.

Automated tests cover height orientation/raycast agreement, weight conservation, brush footprint, pen pressure, pointer capture/cancellation, touch ownership, and one-write-per-stroke behavior. Browser checks include a cross-tile stroke and single-step undo/redo.

The terrain editor uses the shared [editor tool, pointer and object-preset systems](../../../editor-systems.md).

## Rebuild the sample maps

The dependency-free Node generator runs automatically before `npm run dev --workspace docs` and `npm run build --workspace docs`. Generated PNGs are ignored by Git; a clean checkout needs only Node and the usual project dependencies. Existing generated maps are reused on subsequent starts, retaining your local seed and offset.

To regenerate a different landscape from the repository root:

```sh
npm run generate-terrain --workspace docs -- --seed 12345 --offset-x 320 --offset-z=-160
```

Defaults are seed `71029` and offset `(0, 0)`. Offsets select world-space sampling coordinates. Moving X by the configured tile size (32 by default) samples the next tile of the same landscape. Reload the demo after regeneration to clear its image cache. Explicit generation overwrites the demo maps; normal dev/build startup only fills missing or outdated output.

The script samples continuous seeded noise into 100 overlapping height/weight pairs (65×65 by default) under `docs/public/textures/terrain-demo/tiles/`. A fixed 0.125-unit centered slope probe supplies material weights that agree across borders and retain consistent classification at shared sample locations across output resolutions. Heights use 48 world units of range; RGB encodes grass/dirt/rock with sand as the remainder. Generation runs as a setup step. `generation.json` in the ignored output directory records the seed, offset, generator version and terrain configuration. The checked-in asset manifest contains the stable generated URLs.

## Tile size and map budget

Edit `terrain-config.json` beside this page, then restart the docs dev server (or run `npm run generate-terrain --workspace docs -- --ensure`) and reload the page. The generator and page consume the same file. Startup detects changed settings and rebuilds maps while preserving the saved seed and offsets. Run generation after each configuration change. These settings configure newly created demo scenes; saved scenes retain their own terrain properties.

```json
{
  "tileSize": 32,
  "segments": 64,
  "heightIntervals": 64,
  "weightIntervals": 64
}
```

`tileSize` supports 16, 32, 64 or 128 world units. The three density settings support 32, 64, 128, 256 or 512 intervals/subdivisions. Map dimensions are **intervals + 1**, preserving endpoint samples. `heightIntervals` must be at least `segments`; these power-of-two choices keep vertices aligned with height samples. Height and weight resolutions are independent. Use `weightIntervals: 128` for finer painting at the same geometry and height-map resolution.

Use the [profiling workflow](PERFORMANCE.md) to compare map resolutions and resource use.

Larger tiles sample more of the continuous world field. Tile placement, player X/Z spawn, overview camera and sun/shadow coverage follow the configured size; height range stays 48. Doubling tile width quadruples covered area at the same tile count and map budget, but halves linear mesh/paint/shadow density and makes culling less granular. Keep small tiles for close-up editing. Very small brushes can fall between coarse weight samples; choose more weight intervals for fine markings.

The grid contains 100 terrain meshes and 819,200 base triangles at 64 subdivisions. Map resolution controls download, decode, paint/upload and map memory costs. Mesh subdivisions control geometry and collider detail. Use `?profile=1&segments=32` to quarter triangle counts, and `&shadows=0` to compare shadow cost.

Checks cover retained vertex samples, material classification, both seam directions, larger tiles, independent map sizes, invalid configuration, and automatic regeneration. The existing terrain suite covers raycasts, painting, cross-tile undo/cancellation and sampler ownership. Compare `/demo/terrain?profile=1` at a fixed viewport/camera and reload after each generation; record frame intervals and memory use as separate measurements.

## Profiling

Open `/demo/terrain?profile=1` for a rolling 180-frame median/p95 and renderer resource counts after 120 warm-up frames. `&maps=repeated` shares maps across tiles for resource comparisons; `&segments=32` compares mesh density; `&shadows=0` compares the shadow pass. The default keeps the configured subdivisions (64 initially) and shadows. Frame intervals reflect display pacing, and tracked resource bytes are Three's estimate. See the [profiling workflow](./PERFORMANCE.md) for controlled comparisons.

## Terrain physics and Play

The Crashcat plugin also exports `createColliderResidencyScheduler` for custom
collider sets. Supply `activeLimit`, candidates `{ id, revision, distance }`, an
asynchronous `build`, and synchronous `activate` / `deactivate` callbacks. It
serializes preparation, caches plain shape data, rejects stale results and
selects by distance with stable ID ties. Callers own external resources. `activeLimit` bounds active bodies; prepared shapes remain cached.

Every tile has `TerrainPhysics` alongside `Terrain`. The physics component requires a nonempty height map on that same node; its inspector reports missing data explicitly. It reuses the displaced visual geometry, including its world transform, to build an exact triangle collider. Collider rebuilds follow height and transform changes; weight painting updates the visual material.

`TerrainPhysicsRuntime`, explicitly mounted by the page with `activeLimit={2}`, owns a single worker that prepares BVHs one at a time, prioritizing the nearest tiles. Prepared shapes stay cached for the scene lifetime; only the **nearest two** have bodies in the physics world. Distances use transformed terrain bounds, ties are stable, and old worker results are ignored after geometry/transform changes or removal. Body switches reuse prepared BVHs. Worker failures appear as errors. A browser/bundler supporting module workers is required.

Click **Play** to use the first-person capsule controller: **WASD** or **↑/↓** move, **←/→** turn, **Space** jumps, and dragging the canvas looks around. The controller runs during Play. The capsule waits while its nearby colliders prepare. The profile overlay includes active/prepared counts and measured activation/submission/update costs.

The demo uses a camera-local collision budget for its single player. Choose an active-body budget that covers every actor requiring terrain collision in your scene. All prepared collider shapes stay cached on the CPU.

Library setup:

```tsx
import { registerComponent } from 'react-three-game/viewer';
import { CrashcatRuntime, TerrainPhysicsRuntime, TerrainPhysicsComponent } from 'react-three-game/plugins/crashcat';
import { CharacterControllerComponent } from './components/CharacterControllerComponent';
import 'react-three-game/plugins/crashcat/editor'; // optional custom missing-data inspector
registerComponent(TerrainPhysicsComponent);
registerComponent(CharacterControllerComponent);
// Mount <CrashcatRuntime><TerrainPhysicsRuntime activeLimit={2} /></CrashcatRuntime>.
// Choose the budget for your game. Add TerrainPhysics to a Terrain
// node and CharacterController to a Transform node at a valid spawn position.
```

## Visual material displacement

Layers accept `displacementMap` (linear grayscale, mid-gray is neutral) and `displacementScale` (full black-to-white range in local terrain units, default zero). The demo's rock layer uses its existing displacement texture at 0.35 units. TSL offsets vertices along local Y, blended by material weights. This uses the existing mesh subdivisions; normal maps provide detail between vertices. Render bounds include the maximum visual offset, while CPU heightmap geometry, physics colliders, and editor picking remain unchanged. Keep relief shallow so the visible surface stays close to the collision surface.

The player controller is demo-owned: input bindings, movement rules and camera live in `components/CharacterControllerComponent.tsx`; the page renders `components/PlayerStatus.tsx` as ordinary React HTML. The Crashcat plugin owns physics integration and terrain collider preparation. Run Terrain in the browser runtime, where canvas image processing supports height decoding and painting.
