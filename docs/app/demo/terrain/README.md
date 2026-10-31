# Terrain workshop

Open `/demo/terrain`, select any **Landscape row · column** tile, then choose **Paint terrain materials** in the inspector. The editor also has **+ Add object → Terrain**, which creates a flat terrain with four default material colors.

- Pencil or left mouse drag paints the selected material. Radius is measured in world units; strength, hardness and optional pen pressure control the brush.
- Fingers navigate with the existing orbit controls. Right-drag or Alt+left-drag navigates with a mouse. Incidental touches are ignored while a stroke is active.
- Painting crosses unlocked terrain tiles whose four resolved material layers match the selected tile. The world-space brush footprint reaches both sides of seams; incompatible palettes and hidden tiles are excluded. Each completed stroke is one scene-history action across every touched tile. Escape, lost pointer capture, pointer cancellation and window blur cancel the active stroke. Done exits painting; previous object lock flags are preserved.
- Save the scene from the File menu after leaving paint mode. Painted maps are embedded lossless PNGs, so scene JSON round-trips without a separate upload endpoint. Undo revisions retain compressed PNG strings; only the current painted image is decoded locally, outside the shared asset cache.

The demo contains a centered 10×10 grid of independently editable 32×32 terrain tiles, placed edge to edge. Each tile uses 64 subdivisions per axis (819,200 terrain triangles total), its own height/weight crop, and shared PBR layer textures. The camera opens on the full grid; focus a tile to paint it. The crops sample a continuous seeded field covering 2,561×2,561 samples, with one shared border sample. This is not a streamed landscape.

## Component

`Terrain` is a built-in object component that owns its mesh and TSL `MeshStandardNodeMaterial`. Add `Transform` to position it. A separate Geometry or Material component is unnecessary.

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

## Current limits

This first version paints material weights only. It does not sculpt height, stream chunks, implement LOD, or preserve the procedural material in GLB exports. The separate TerrainPhysics component supplies collision geometry. Materials use planar tiling; cliff projection and more advanced blending remain future work. High resolution maps increase scene/history size. The workshop uses existing repository textures and generated sample height/weight maps.

Automated tests cover height orientation/raycast agreement, weight conservation, brush footprint, pen pressure, pointer capture/cancellation, touch ownership, and one-write-per-stroke behavior. Browser checks include a cross-tile stroke and single-step undo/redo. Real Apple Pencil testing is still required.

The terrain editor uses the shared [editor tool, pointer and object-preset systems](../../../editor-systems.md).

## Rebuild the sample maps

The dependency-free Node generator runs automatically before `npm run dev --workspace docs` and `npm run build --workspace docs`. Generated PNGs are ignored by Git; a clean checkout needs only Node and the usual project dependencies. Existing generated maps are reused on subsequent starts, retaining your local seed and offset.

To regenerate a different landscape from the repository root:

```sh
npm run generate-terrain --workspace docs -- --seed 12345 --offset-x 320 --offset-z=-160
```

Defaults are seed `71029` and offset `(0, 0)`. Offsets are world-space sampling coordinates, not node positions. Moving X by 32 samples the next tile of the same landscape. Reload the demo after regeneration to clear its image cache. Explicit generation overwrites the demo maps; normal dev/build startup only fills missing or outdated output.

The script samples continuous seeded noise into 100 overlapping 257×257 height/weight pairs under `docs/public/textures/terrain-demo/tiles/`. A one-sample halo supplies slope-based material weights that agree across borders, even when tiles are generated independently. Heights use 48 world units of range; RGB encodes grass/dirt/rock with sand as the remainder. There are no master images to commit and no generation work during rendering. `generation.json` in the ignored output directory records the seed, offset and generator version. The checked-in asset manifest contains only the stable generated URLs, not pixel data.

## Profiling

Open `/demo/terrain?profile=1` for a rolling 180-frame median/p95 and renderer resource counts after 120 warm-up frames. `&maps=repeated` restores the repeated-map resource benchmark; `&segments=32` compares mesh density; `&shadows=0` compares the shadow pass. The default keeps 64 subdivisions and shadows. Frame intervals are display-paced, not GPU timings, and tracked resource bytes are Three's estimate. See [performance notes](./PERFORMANCE.md) for measurements and design decisions.

## Terrain physics and Play

Every tile now has `TerrainPhysics` alongside `Terrain`. The physics component requires a nonempty height map on that same node; its inspector reports missing data explicitly. It reuses the displaced visual geometry, including its world transform, to build an exact triangle collider. Weight painting does not rebuild collision geometry.

`CrashcatRuntime` owns a single worker that prepares BVHs one at a time, prioritizing the nearest tiles. Prepared shapes stay cached for the scene lifetime; only the **nearest two** have bodies in the physics world. Distances use transformed terrain bounds, ties are stable, and old worker results are ignored after geometry/transform changes or removal. Body switches do not rebuild BVHs. Worker failure is reported rather than falling back to expensive synchronous construction. A browser/bundler supporting module workers is required.

Click **Play** to use the first-person capsule controller: **WASD** or **↑/↓** move, **←/→** turn, **Space** jumps, and dragging the canvas looks around. Editing does not run the controller. The capsule waits while its nearby colliders prepare. The profile overlay includes active/prepared counts and measured activation/submission/update costs.

This is deliberately a camera-local collision budget: distant dynamic objects have no terrain support outside those two tiles. It is intended for the basic single-player camera-following demo, not multiple independent players or distant rigid-body simulation. All collider shapes are cached on the CPU; this bounds active physics work rather than total prepared memory.

Library setup:

```tsx
import { registerComponent } from 'react-three-game/viewer';
import { CrashcatRuntime, TerrainPhysicsComponent, CharacterControllerComponent } from 'react-three-game/plugins/crashcat';
import 'react-three-game/plugins/crashcat/editor'; // optional custom missing-data inspector
registerComponent(TerrainPhysicsComponent);
registerComponent(CharacterControllerComponent);
// Mount <CrashcatRuntime /> inside the scene. Add TerrainPhysics to a Terrain
// node and CharacterController to a Transform node at a valid spawn position.
```

## Visual material displacement

Layers accept `displacementMap` (linear grayscale, mid-gray is neutral) and `displacementScale` (full black-to-white range in local terrain units, default zero). The demo's rock layer uses its existing displacement texture at 0.35 units. TSL offsets vertices along local Y, blended by material weights. This uses the existing mesh subdivisions; normal maps provide detail between vertices. Render bounds include the maximum visual offset, while CPU heightmap geometry, physics colliders, and editor picking remain unchanged. Keep relief shallow so the visible surface stays close to the collision surface.
