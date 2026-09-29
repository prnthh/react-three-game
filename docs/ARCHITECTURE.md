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

Follow [ComponentRegistry](../src/tools/prefabeditor/components/ComponentRegistry.ts) →
[nodePlan](../src/tools/prefabeditor/nodePlan.ts) →
[PrefabNode](../src/tools/prefabeditor/PrefabNode.tsx).

## Change authoring behavior

Use the [agent guide](editor-api-for-agents.md) for copyable read/edit patterns.
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
not the folder name. [Import-boundary tests](../tests/import-boundaries.test.mjs)
keep authoring out of the viewer and plugins out of core entrypoints.

For resource changes, check startup, activation and unloading in a WebGPU browser.
Run `npm test`, `npm run build` and `npm --prefix docs run build`.
