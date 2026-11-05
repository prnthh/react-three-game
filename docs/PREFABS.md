# Prefab composition and loading

Use this guide to compose reusable scene documents, load them at runtime, and
manage static scenery residency. Start with the [React walkthrough](../README.md)
for a first scene. See [architecture](ARCHITECTURE.md) for implementation boundaries.

## Compose an inline prefab

Start with a small definition in the canvas module. This app places the same
inline prefab twice; each `PrefabRoot` has its own document and local node IDs.

```tsx
import { GameCanvas, PrefabRoot, type Prefab } from 'react-three-game/viewer';

const block: Prefab = {
  root: { id: 'block', components: {
    geometry: { type: 'Geometry', properties: { geometryType: 'box', args: [2, 3, 2] } },
    material: { type: 'Material', properties: { color: '#aaa995' } },
  } },
};

export function Blocks() {
  return <div style={{ height: '100vh' }}>
    <GameCanvas camera={{ position: [8, 5, 10] }}>
      <ambientLight intensity={2} />
      {[0, 4].map(x => <group key={x} position={[x, 1.5, 0]}>
        <PrefabRoot id={`block-${x}`} data={block} />
      </group>)}
    </GameCanvas>
  </div>;
}
```

### Keep placements in the scene document

To edit and save the placements together, embed `block` in `PrefabRef` components.
Add this below `block`, then replace the mapped groups above with
`<PrefabRoot data={scene} />`, or pass `scene` to `PrefabEditor`:

```tsx
const scene: Prefab = {
  root: { id: 'world', children: [
    { ...block.root, id: 'block', packed: true },
    { id: 'block-copy', components: {
      transform: { type: 'Transform', properties: { position: [4, 1.5, 0] } },
      prefabref: { type: 'PrefabRef', properties: { prefabId: 'block' } },
    } },
  ] },
};
```

**Pack as Prefab** marks the original node `packed: true`, keeping its components
and children in the scene graph. **Duplicate** creates a `PrefabRef` pointing to
that node's ID. Editing the packed subtree updates its copies; **Unpack Prefab**
expands a copy for independent editing. The runtime derives its lookup from
packed nodes. Relative asset URLs resolve against `basePath`.

## Load a prefab

When the block is useful across scenes, save its JSON as
`public/prefabs/block.json`. Replace each reference’s properties with
`{ url: '/prefabs/block.json' }`. The original can also become a node with a
`PrefabRef` URL once its subtree is saved in that file.
The placements and their transforms stay the same. Each reference gets local
node IDs and shares rendering resources with compatible instances.

### Prepare a streamed instance

For host-controlled loading and activation, mount `PrefabInstance` inside your
canvas. Using the saved block from the previous step:

```tsx
import { GameCanvas, PrefabInstance } from 'react-three-game/viewer';

export function StreamedBlock() {
  return <div style={{ height: '100vh' }}>
    <GameCanvas camera={{ position: [8, 5, 10] }}>
      <ambientLight intensity={2} />
      <group position={[4, 1.5, 0]}>
        <PrefabInstance id="block-1" url="/prefabs/block.json"
          onStatus={status => console.log(status.phase)} />
      </group>
    </GameCanvas>
  </div>;
}
```

Loading prepares assets and pipelines before activation. The host mounts the
instances it needs and unmounts them to release their objects; URL assets stay in
the shared cache. `static` freezes placement and content for immutable chunks;
remount to change either.

Prefab nodes mount through React reconciliation. Disabled Views unmount by
default. `renderWhenDisabled` opts into keeping a View mounted for preparation or a persistent scene graph; those Views
use `enabled` to gate behavior. Runtime scripts apply that gate inside their View.
`PrefabInstance` waits for assets and shader compilation before activation.
Each streamed placement has its own activation lifetime.
Shader compilation runs in slices between frames. Individual geometry creation,
decoding, and shader work contribute to startup time; measure preparation as well as
steady frame time.

Follow [PrefabInstance](../src/runtime/prefabs/PrefabInstance.tsx) →
[preparePrefab](../src/runtime/prefabs/preparePrefab.ts) →
[AssetRuntime](../src/runtime/assets/AssetRuntime.tsx).
Authored nesting uses [PrefabRef](../src/runtime/components/PrefabRefComponent.tsx).

For standalone asset loading, `loadModel`, `loadTexture` and `loadSound` resolve
to an `Object3D`, `Texture` or `AudioBuffer`. Handle failures with `try`/`catch`
or a Promise rejection handler.

### Automatically stream static scenery

A `ChunkSettings` component on the scene root configures spatial mesh batching
and distance streaming for `static` prefab placements. Placements prepare their
complete document by default. The host can continue mounting copies of the same URL as the
camera travels; source documents, assets and partition plans are shared within
the runtime. A camera can travel in either direction.

```tsx
<PrefabInstance id="district" url="/prefabs/district.json"
  static
  onChunkStatus={({ id, phase }) => console.log(id, phase)}
/>
```

| Option | Default | Meaning |
| --- | --- | --- |
| `cellSize` | 64 | Partition width in prefab-local units. |
| `visibleDistance` | 160 | Show prepared cells within this world-space distance of their bounds. |
| `preloadDistance` | 220 | Start preparation ahead of the visible range. Clamped to at least `visibleDistance`. |
| `unloadDistance` | 280 | Release cell objects outside this range. Clamped to at least `preloadDistance`. |
| `maxNodesPerChunk` | 96 | Split busy cells into small mount units, counting transform ancestors. Minimum 8. |

One canvas-wide queue selects the nearest cold cell across all placements. Only
one cell prepares at a time, and at most one mount or unmount is admitted in a
frame. Preparation yields between batches to spread work across frames. Cold
cells have no React or Three subtrees. Prepared cells outside the visible band are hidden;
they stay warm until the wider unload boundary prevents boundary thrashing.
Selection uses transformed bounding boxes, so a large floor or tower remains
eligible when its center is far away but its geometry is close to the camera.

`onChunkStatus` reports `preparing`, `ready`, `unloaded`, and `error` with a cell ID
local to the placement. `onActivate` and the placement's `active` status fire once
its first prepared cell enters the visible band (or its resident document is
ready when there are no streamable cells). Unmounting cancels preparation. Cells prepare independently and report
their own failures. An errored cell is retried after leaving its unload
range and returning, or after remounting the placement.

Streaming is inherited from the outer scene root and requires `static={true}`. Primitive geometry and ordinary static model
placements are partitioned; external and packed prefab references are expanded
while retaining their transform chains. Named materials are resolved into each
cell, so nearby surfaces retain their materials as distant cells unload.
Lights, cameras, fog and environments remain resident. A prefab containing custom
behavior, colliders, geometry modifiers, animated/skinned models, model repeat
arrays, or unsupported render compositions keeps its complete document resident
to preserve object references and gameplay lifecycles. Streamed visual node IDs
are cell-scoped and their mounted objects are transient; keep gameplay in a
separate prefab when using spatial scenery streaming.

The source JSON and referenced assets are fetched before partitioning. Spatial
unloading releases cell objects and instance batches, while shared source assets,
geometry pools and the plan remain cached. Mount units are bounded by node count.
Individual model mounts, deep transform chains, texture uploads, and driver shader
compilation can take longer than a frame. Keep such assets reasonably sized and measure
on target devices.

When a custom postprocessing pass renders to textures/MRT, register its standing
preparation state with `registerPrefabCompilationContext(renderer, enter)`.
`enter` selects the pass target/MRT and returns a cleanup that restores them.
The canvas-wide compilation queue owns that state until the job completes or
fails. The normal screen render must temporarily select the screen target/MRT,
then restore the paused preparation state; see the working adapter in
[`PostProcessing`](../src/runtime/components/PostProcessingComponent.tsx). Preparing for
the default screen target otherwise builds variants that differ from the actual
scene pass and still require work on first display.

## Document and live state

Use `usePrefabDocument()` inside a prefab to read and edit authored nodes and
materials. Use `useGameObject(id)` for mounted transforms and registered behavior
handles. Document edits are serializable; live mutations are transient.
`usePrefab()` exposes runtime objects and the prefab’s `basePath`. Use
`useAssetRuntime()` for model, texture and sound resources; resolve prefab-relative
paths with `resolveAssetPath(basePath, path)`. Load shared resources with
`await assets.loadModel(path)`, `await assets.loadTexture(path)`, or
`await assets.loadSound(path)`; each returns the loaded resource. Register parsed
or generated resources with `registerModel`, `registerTexture`, or `registerSound`.
Editor refs compose the document and runtime APIs because authoring needs both.

```tsx
const document = usePrefabDocument();
const object = useGameObject('player');
// Authored edit: updates the inspector, undo history (in the editor) and JSON export.
const rename = () => document.update('player', node => ({ ...node, name: 'Hero' }));
// Runtime movement updates the mounted object.
const move = () => object.transform?.position.set(1, 0, 0);
```

Run edits in event handlers or effects. Components and
physics adapters can mutate Three.js objects directly. Instance matrix scanning
detects changes to their transforms.
The window API reads/edits the document; captures and GLB export use live objects.

## Batch document edits

Inside a prefab, group synchronous document edits into one store publication:

```tsx
const document = usePrefabDocument();
// In an event handler, with generatedNodes and parentId supplied by the app:
document.batch(() => {
  for (const node of generatedNodes) document.add(node, parentId);
});
```

Reads inside the callback see earlier edits. An uncaught error rolls back the
batch; nested batches join the outer batch. Keep asynchronous work outside it.
The store copies affected tables once and preserves committed undo snapshots.
Editor refs expose this document API too. The window scene's `batch` method
accepts structured commands and uses this mechanism automatically.
