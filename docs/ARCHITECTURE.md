# Architecture and implementation patterns

React Three Game handles rendering and scene authoring. The host application
owns gameplay state, ticks, input, networking and persistence.

```text
Prefab data → document store → component views → R3F / Three objects
                   ↑
          visual editor + agent batches
```

Start with the [README examples](../README.md) for rendering, components and editing.
Use the patterns below when adding integrations or changing internals.

## Demo organization

Each demo's `page.tsx` owns setup, component registration, providers, and main
scene composition. Keep demo-specific systems (movement, transitions, speech,
scene definitions, and shared constants) in files alongside the page. Put custom
prefab components and UI components in that demo's `components/` folder.
Context-dependent orchestration can use a local function inside `page.tsx` so it
runs beneath the providers it needs. For demos hosting multiple games, keep reusable
behaviors in `components/` and game wiring in `games/<game>/`. Start scene definitions inline and pack reusable assemblies inside the document.
Saved demos live in `docs/public/prefabs`: single-file demos at the top level,
projects sharing prefab files in a project-named folder. See [stage](app/demo/stage/README.md).

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

For large scenes, `<GameCanvas mountBatchSize={8}>` admits up to eight new mesh
nodes per frame, nearest first. The default `0` mounts them together. Components
using progressive mounting handle children arriving over several frames;
`PrefabInstance` activates gameplay after mounting and shader compilation.
Environment captures mount their contents together. Measure preparation as well
as steady frame time: individual geometry, decoding, or shader work can still be
expensive. The editor accepts this setting through `canvasProps`.

Follow [PrefabInstance](../src/runtime/prefabs/PrefabInstance.tsx) →
[preparePrefab](../src/runtime/prefabs/preparePrefab.ts) →
[AssetRuntime](../src/runtime/assets/AssetRuntime.tsx).
Authored nesting uses [PrefabRef](../src/runtime/components/PrefabRefComponent.tsx).

## Document and live state

Use `usePrefabDocument()` inside a prefab to read and edit authored nodes and
materials. Use `useGameObject(id)` for mounted transforms and registered behavior
handles. Document edits are serializable; live mutations are transient. Existing
editor/viewer refs retain their combined API for compatibility.

```tsx
const document = usePrefabDocument();
const object = useGameObject('player');
// Authored edit: updates the inspector, undo history (in the editor) and JSON export.
const rename = () => document.update('player', node => ({ ...node, name: 'Hero' }));
// Runtime movement updates the mounted object.
const move = () => object.transform?.position.set(1, 0, 0);
```

Run edits in event handlers or effects. Components and
physics adapters can still mutate Three.js objects directly. Instance matrix
scanning remains the fallback until every writer can reliably report changes.
The window API reads/edits the document; captures and GLB export use live objects.

## Runtime scripts

`RuntimeComponent` (`type: "Runtime"`) compiles its `setup` and `update` strings
through the optional callbacks on `Component`. The renderer maps setup/cleanup to
React `useEffect` and update to R3F `useFrame`; built-in Views can use React/R3F
hooks directly. Runtime runs only while enabled in Play and outside preparation.
Code edits restart setup with fresh state; data edits keep it running.

Scripts read the current R3F store through `context.three` and resolve local
objects with `prefab.getObject(id)`. Return cleanup from setup or register it with
`context.onCleanup(fn)`. See the
[Runtime usage example](public/editor-scene-for-agents.md#add-behavior-that-is-not-registered).

## Batch document edits

With an editor/viewer ref, group synchronous edits into one store publication:

```ts
editor.batch(() => {
  for (const node of generatedNodes) editor.add(node, parentId);
});
```

Reads inside the callback see earlier edits. An uncaught error rolls back the
batch; nested batches join the outer batch. Keep asynchronous work outside it.
The store copies affected tables once and preserves committed undo snapshots.
The window scene's `batch` method uses this same mechanism automatically.

## Connect a host system

```tsx
import { useFrame } from '@react-three/fiber';
import { useGameObject, useScene } from 'react-three-game/viewer';

// Mount <PlayerView player={hostPlayer} /> as a child of PrefabRoot.
function PlayerView({ player }: { player: { position: [number, number, number] } }) {
  const object = useGameObject('player'); // Local authored node ID.
  const scene = useScene();
  useFrame(() => {
    if (scene.mode === 'edit') return;
    object.transform?.position.set(...player.position);
  });
  return null;
}
```

The host advances `player`; this view projects its position onto Three.js.
`useFrame` projects the latest host state on each rendered frame. Keep simulation
timing and state resets in the host; save authored changes through document edits.

Follow [gameObject](../src/runtime/scene/gameObject.ts) for stable node handles,
[SceneContext](../src/runtime/scene/SceneContext.tsx) for typed capabilities,
and [GameEvents](../src/runtime/scene/GameEvents.ts) for synchronous notifications.
The optional [Crashcat adapter](../src/plugins/crashcat/CrashcatRuntime.tsx)
steps its own physics world from R3F frames.

## Change a component

Copy [Rotator](app/demo/customcomponent/components/RotatorComponent.tsx) for a behavior, or
[Model](../src/runtime/components/ModelComponent.tsx) for an object view. Geometry and BufferGeometry supply an implicit mesh, with rendering flags on the geometry component.
Register it as in the [custom component demo](app/demo/customcomponent/page.tsx).

- Put editable fields/defaults in the definition; views receive resolved values.
- Return `children` so composition continues through the view.
- Object, geometry and material views declare their `slot` and implement R3F attachments. Geometry views receive an implicit mesh; object views create their own render object. Each visual component supplies its render-graph part directly.
- Share mesh property definitions and editor fields as code helpers. Geometry, BufferGeometry, Model and SkinnedMesh use the collapsed `Mesh options` inspector section; expose only options the renderer supports.
- Keep custom inspector imports in `.editor.tsx` modules.

A component may omit `View` entirely when it only stores authored data. For a
custom visual helper, use an ordinary view:

```tsx
import { registerComponent, useNode,
  type ComponentViewProps } from 'react-three-game/viewer';

function GuideView({ properties, children }: ComponentViewProps<{ radius: number }>) {
  const editMode = useNode(node => node.editMode);
  const isSelected = useNode(node => node.isSelected);
  return <>
    {editMode && <mesh>
      <sphereGeometry args={[properties.radius, 12, 8]} />
      <meshBasicMaterial wireframe color={isSelected ? 'cyan' : 'gray'} />
    </mesh>}
    {children}
  </>;
}
registerComponent({
  name: 'Guide',
  properties: { radius: { default: 1, min: 0.01, description: 'Local radius in scene units.' } },
  View: GuideView,
});
```

The view inherits the node's transform; changing its settings supplies new
`properties` automatically. Ordinary descendant meshes participate in editor
picking. Keep `children` so other components and child nodes still render.
Import the registration module before loading its prefab in both editor and viewer.
The same property definitions generate inspector fields and window API
`describeComponents` output. Use `registerComponentEditor` from `/editor` only
when the generated inspector needs custom UI. Agents discover the property schemas.

For a separate tool watching another node, subscribe to just the data it needs:

```tsx
import { usePrefabStore } from 'react-three-game/viewer';

function NodeLabel({ id }: { id: string }) {
  const name = usePrefabStore(state => state.nodesById[id]?.name);
  return <span>{name ?? id}</span>;
}
```

Mount this under the document's `PrefabStoreProvider` (provided by the editor).
`usePrefabDocument().get(id)` provides an immediate read. For reactive integration,
`usePrefabStoreApi()` exposes selector-based `subscribe`; return its unsubscribe
function from your effect. These subscriptions observe authored edits.

For runtime integration, define a token with `createNodeComponentType<T>()` and
publish your own value with `useRegisterNodeComponent(token, value)`. Other code
can use `useGameObject(id).getComponent(token)` for one node or
`useSceneComponents(token)` for a reactive list. Keep the value stable with
`useMemo` unless its data changes. Handles expose the live methods your game needs. The window API edits the
registered component's serializable authored properties.

Follow [ComponentRegistry](../src/core/ComponentRegistry.ts) →
[nodePlan](../src/runtime/prefabs/nodePlan.ts) →
[PrefabNode](../src/runtime/prefabs/PrefabNode.tsx).

## Control model animation

`SkinnedMesh` clones the loaded model’s skeletons and creates one Three.js
animation mixer per model instance. Its runtime handle exposes that mixer and its actions. In a component, get the node with `useGameObject()`; in an event handler,
after the model has loaded:

```ts
import { LoopOnce } from 'three';
import { SKINNED_MESH_COMPONENT } from 'react-three-game/viewer';

const model = object.getComponent(SKINNED_MESH_COMPONENT);
const action = model?.getAction('Jump'); // Case-insensitive; null if missing.
if (model && action) {
  model.stop();
  action.reset().setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
}
```

For custom playback, author `animationState: ""` and let your controller choose
actions. Leave `autoUpdate` on for normal playback; set it to `false` if your game
calls `model.update(delta)` once per tick. Use the mixer's events for completion,
removing listeners on cleanup. `animationState` tracks the built-in state selector.
The model manages mixer lifetime; controllers choose and play live actions.

## Change authoring behavior

Use the [Scene API guide](public/editor-scene-for-agents.md) for copyable read/edit patterns.
Both the GUI and API write the serializable document store. Agent batches validate before committing one undo step.

| Change | Start here |
| --- | --- |
| Hierarchy or component mutation | [prefabStore](../src/core/prefabStore.ts) |
| Undo grouping | [prefabHistory](../src/core/prefabHistory.ts) |
| Scene API queries or browser exposure | [sceneAgent](../src/editor/agent/sceneAgent.ts), [sceneAgentBridge](../src/editor/agent/sceneAgentBridge.ts) |
| Batch operation | [sceneCommands](../src/core/sceneCommands.ts), [sceneCommandSchema](../src/core/sceneCommandSchema.ts) |
| Agent field discovery | [componentSchemas](../src/core/componentSchemas.ts) |
| Editor integration | [PrefabEditor](../src/editor/PrefabEditor.tsx) |

Command schemas supply the allowed fields used by both core validation and editor
convenience methods. Keep scene-specific checks in the command evaluator. It owns
input copying; synchronous adapters pass data through directly. Authored prefab properties are data, copied with `structuredClone`.

## Keep package boundaries

| Entry | Contains |
| --- | --- |
| `/core` | Definitions, document store, command evaluation, schemas, and model serialization |
| `/node` and `rtg` CLI | Node asset loading and scene conversion; CLI maps command files to core |
| `/browser` | Browser downloads and audio services |
| `/headless` | R3F scene construction without a browser or GPU |
| `/viewer` and package root | R3F views and rendering resources |
| `/editor` | Visual editor, history and Scene API |
| `/plugins/crashcat` | Optional physics adapter |
| `docs/app` | Host applications and game-specific examples |

[SceneRuntime](../src/runtime/SceneRuntime.tsx) groups rendering providers.
Runtime modules are grouped by responsibility:

- `runtime/prefabs`: source loading, dependency preparation, and instance activation.
- `runtime/scene`: live scene contexts, object handles, events, and interaction.
- `runtime/components`: built-in component views; their inspectors live in `editor/components`.
- `runtime/rendering`: mesh batching and material instancing.
- `runtime/assets`: loaders and shared resource ownership/cache.
- `runtime/audio`: the scene listener and sound playback manager.
- `runtime/lighting`: optional rendering helpers, including the point light grid.
- `runtime/GameCanvas.tsx` and `runtime/SceneRuntime.tsx`: canvas setup and provider composition.

`core/` owns prefab data, the component registry, document store, document mutations,
and history. React store bindings live in `runtime/prefabs/PrefabStoreContext.ts`.
`editor/` owns authoring UI, inspector registration, agent commands, and file tools.
Dependencies flow from editor to runtime to core. Import authoring tools through
`/editor` and optional physics through `/plugins/crashcat`.

For resource changes, check startup, activation and unloading in a WebGPU browser.
Run `npm test`, `npm run build` and `npm --prefix docs run build`.

## Module imports and builds

Library source uses explicit `.js` relative imports, including `/index.js` for
barrels. TypeScript resolves these to their `.ts`/`.tsx` implementations and emits
Node-compatible imports and declarations directly; the package build is just
`tsc`. Keep `bundler` type resolution for peer declarations that do not support
NodeNext. The docs webpack configuration resolves these paths to source files.

Run `npm run test:package` to check the packed CLI, native Node imports, and a
NodeNext TypeScript consumer.
