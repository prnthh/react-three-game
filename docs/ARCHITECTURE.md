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

## Load a prefab

```tsx
import { GameCanvas, PrefabInstance } from 'react-three-game/viewer';

export function Room() {
  return <GameCanvas>
    <group position={[10, 0, 0]}>
      <PrefabInstance id="room-1" url="/prefabs/room.json"
        onStatus={status => console.log(status.phase)} />
    </group>
  </GameCanvas>;
}
```

The host chooses which instances to mount. Each gets local document IDs; rendering
resources are shared. Loading prepares assets and pipelines before activation.
Unmount to release ownership. `active={false}` prepares without activating;
`static` freezes placement/content and requires remounting to change either.

Follow [PrefabInstance](../src/runtime/PrefabInstance.tsx) →
[preparePrefab](../src/runtime/preparePrefab.ts) →
[assetRuntime](../src/tools/prefabeditor/assetRuntime.tsx).
For authored nesting, copy [PrefabRef](../src/tools/prefabeditor/components/PrefabRefComponent.tsx).

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
// Runtime movement: no document write or React render.
const move = () => object.transform?.position.set(1, 0, 0);
```

Run edits in event handlers or effects, not during React render. Components and
physics adapters can still mutate Three.js objects directly. Instance matrix
scanning remains the fallback until every writer can reliably report changes.
The window API reads/edits the document; captures and GLB export use live objects.

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
The window API's `applyBatch` uses this same mechanism automatically.

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
`useFrame` is a rendering callback, not a fixed world tick. Live object changes
are not saved or undoable. Edit/Play does not snapshot/reset host state.

Follow [gameObject](../src/tools/prefabeditor/gameObject.ts) for stable node handles,
[SceneContext](../src/tools/prefabeditor/SceneContext.tsx) for typed capabilities,
and [GameEvents](../src/tools/prefabeditor/GameEvents.ts) for synchronous notifications.
The optional [Crashcat adapter](../src/plugins/crashcat/CrashcatRuntime.tsx)
steps its own physics world from R3F frames.

## Change a component

Copy [Rotator](app/demo/customcomponent/RotatorComponent.tsx) for a behavior, or
[Mesh](../src/tools/prefabeditor/components/MeshComponent.tsx) for an object view.
Register it as in the [custom component demo](app/demo/customcomponent/page.tsx).

- Put editable fields/defaults in the definition; views receive resolved values.
- Return `children` so composition continues through the view.
- Object, geometry and material views declare their `slot` and implement R3F attachments.
- Keep custom inspector imports in `.editor.tsx` modules.

A component may omit `View` entirely when it only stores authored data. For a
custom visual helper, use an ordinary view; no special gameplay component is needed:

```tsx
import { registerComponent, useNode,
  type ComponentViewProps } from 'react-three-game/viewer';

function GuideView({ properties, children }: ComponentViewProps<{ radius: number }>) {
  const { editMode, isSelected } = useNode();
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
when the generated inspector needs custom UI; custom UI is not exposed to agents.

For a separate tool watching another node, subscribe to just the data it needs:

```tsx
import { usePrefabStore } from 'react-three-game/viewer';

function NodeLabel({ id }: { id: string }) {
  const name = usePrefabStore(state => state.nodesById[id]?.name);
  return <span>{name ?? id}</span>;
}
```

Mount this under the document's `PrefabStoreProvider` (provided by the editor).
`usePrefabDocument().get(id)` is an imperative read, not a subscription. For
non-React integrations, `usePrefabStoreApi()` exposes selector-based `subscribe`;
return its unsubscribe function from your effect. No full-document export or timer
is necessary. These subscriptions observe authored edits, not live animation.

For runtime integration, define a token with `createNodeComponentType<T>()` and
publish your own value with `useRegisterNodeComponent(token, value)`. Other code
can use `useGameObject(id).getComponent(token)` for one node or
`useSceneComponents(token)` for a reactive list. Keep the value stable with
`useMemo` unless its data changes. Handles are runtime-only and can expose exactly
the methods your game needs; they are not serialized or callable through the window
API. The window API edits the registered component's authored properties.

Follow [ComponentRegistry](../src/tools/prefabeditor/components/ComponentRegistry.ts) →
[nodePlan](../src/tools/prefabeditor/nodePlan.ts) →
[PrefabNode](../src/tools/prefabeditor/PrefabNode.tsx).

## Control model animation

`AnimatedModel` exposes its existing Three.js mixer and actions through its runtime
handle. In a component, get the node with `useGameObject()`; in an event handler,
after the model has loaded:

```ts
import { LoopOnce } from 'three';
import { ANIMATED_MODEL_COMPONENT } from 'react-three-game/viewer';

const model = object.getComponent(ANIMATED_MODEL_COMPONENT);
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
calls `model.update(delta)` or `model.mixer.update(delta)` itself. Do not advance
both. Use the mixer's events for completion, removing listeners on cleanup.
`animationState` tracks the built-in state selector, not direct action playback.
The model owns mixer lifetime; do not dispose/uncache it from another component.
These are live controls, not serialized settings or window API methods.

## Change authoring behavior

Use the [agent guide](public/editor-api-for-agents.md) for copyable read/edit patterns.
Both the GUI and API write the document store; neither serializes transient
animation or physics. Agent batches validate before committing one undo step.

| Change | Start here |
| --- | --- |
| Hierarchy or component mutation | [prefabStore](../src/tools/prefabeditor/prefabStore.ts) |
| Undo grouping | [prefabHistory](../src/tools/prefabeditor/prefabHistory.ts) |
| Agent query or browser exposure | [sceneAgent](../src/tools/prefabeditor/sceneAgent.ts), [sceneAgentBridge](../src/tools/prefabeditor/sceneAgentBridge.ts) |
| Batch operation | [sceneCommands](../src/tools/prefabeditor/sceneCommands.ts), [sceneCommandSchema](../src/tools/prefabeditor/sceneCommandSchema.ts) |
| Agent field discovery | [componentSchemas](../src/tools/prefabeditor/componentSchemas.ts) |
| Editor integration | [PrefabEditor](../src/tools/prefabeditor/PrefabEditor.tsx) |

## Keep package boundaries

| Entry | Contains |
| --- | --- |
| `/core` | Definitions and document helpers |
| `/viewer` and package root | R3F views and rendering resources |
| `/editor` | Visual editor, history and agent API |
| `/plugins/crashcat` | Optional physics adapter |
| `docs/app` | Host applications and game-specific examples |

[SceneRuntime](../src/runtime/SceneRuntime.tsx) groups providers, not gameplay systems.
The historical `prefabeditor` folder also contains runtime code; follow imports,
not the folder name. [Import-boundary tests](../tests/core/import-boundaries.test.mjs)
keep authoring out of the viewer and plugins out of core entrypoints.

For resource changes, check startup, activation and unloading in a WebGPU browser.
Run `npm test`, `npm run build` and `npm --prefix docs run build`.
