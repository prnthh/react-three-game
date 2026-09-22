# React Three Game

Build WebGPU games from editable JSON scenes and React Three Fiber components.

## Start

```tsx
import { GameCanvas, PrefabRoot } from 'react-three-game/viewer';
import type { Prefab } from 'react-three-game/core';
import scene from './scene.json';

export default function Game() {
  return <GameCanvas><PrefabRoot data={scene as Prefab} /></GameCanvas>;
}
```

Use `react-three-game/editor` for authoring:

```tsx
import { PrefabEditor } from 'react-three-game/editor';

<PrefabEditor prefab={scene as Prefab} />
```

Keep the document object stable. Passing a new document reloads it. An editor ref's `save()` returns the edited document.

## Scene JSON

```json
{
  "materials": { "orange": { "color": "#f97316" } },
  "root": {
    "id": "world",
    "children": [{
      "id": "box",
      "components": {
        "transform": { "type": "Transform", "properties": { "position": [0, 1, 0] } },
        "mesh": { "type": "Mesh", "properties": {} },
        "geometry": { "type": "Geometry", "properties": {} },
        "material": { "type": "Material", "properties": { "materialId": "orange" } }
      }
    }]
  }
}
```

Use stable node IDs, local transforms, and radians. Keep properties sparse: the component schema supplies defaults. Material IDs are local to the document. `{ "color": "#f97316" }` is a complete standard material.

A node combines behavior with an object and its geometry/material, like ordinary R3F. Child nodes form the hierarchy. Add `PrefabRef` with `{ "url": "/prefabs/room.json" }` to reuse another document. Asset paths respect `basePath`.

## Add a component

One file defines its properties, view, and ordinary inspector:

```tsx
import { useFrame } from '@react-three/fiber';
import { registerComponent, useNode, useNodeObject,
  type Component, type ComponentViewProps } from 'react-three-game/viewer';

type SpinProps = { speed: number };

function SpinView({ properties, children }: ComponentViewProps<SpinProps>) {
  const object = useNodeObject();
  const { editMode } = useNode();
  useFrame((_, delta) => {
    if (!editMode && object.current) object.current.rotation.y += properties.speed * delta;
  });
  return <>{children}</>;
}

const Spin: Component<SpinProps> = {
  name: 'Spin',
  properties: { speed: { default: 1, step: 0.1 } },
  View: SpinView,
};
registerComponent(Spin);
```

Register before mounting scenes. Use `{ "type": "Spin", "properties": {} }` in JSON. Views receive resolved defaults; do not repeat them in the view. Numeric fields need no `type`; other fields declare it, such as `color`, `boolean`, `string`, `vector3`, or `select` with `options`.

Use the generated inspector unless custom UI is necessary. Register custom UI separately with `registerComponentEditor(component, Inspector)` from the editor entrypoint.

Most behaviors need no composition metadata. Object components use `slot: 'object'`; geometry/material components use `slot: 'geometry'` or `'material'`. A slot is exclusive within a node. The view owns the actual R3F `attach` prop and renders its `children`.

## Runtime conventions

| Need | API |
| --- | --- |
| Current node object | `useNodeObject()` |
| Node selection and edit mode | `useNode()` |
| Current document and its objects | `usePrefab()` |
| Shared scene and mode | `useScene()` |
| Save an authored edit | `prefab.update()`, `add()`, `remove()`, `setMaterial()` |
| Animate or simulate | Mutate live Three objects in `useFrame` |
| Notify systems | `gameEvents.emit()` / `useGameEvent()` |
| Query typed node capabilities | `useRegisterNodeComponent()` / `useSceneComponents()` |

Mount scene systems as children of `PrefabRoot`. Nested prefabs share the scene but have their own document and node IDs.

Use one active `Camera` node. Add `CameraFollow` to follow a `targetId` in the same prefab; its offsets are world-space. Edit mode uses editor controls. `Fog` provides scene-wide color, near, and far fields; use one active fog node with far greater than near.

## Stream content

```tsx
import { AssetRuntimeProvider, PrefabInstance } from 'react-three-game/viewer';

<AssetRuntimeProvider>
  <group position={[0, 0, -320]}>
    <PrefabInstance id="chunk-1" url="/prefabs/chunk.json"
      onActivate={() => console.log('Chunk active')} />
  </group>
</AssetRuntimeProvider>
```

Place this inside `GameCanvas`. Share an `AssetRuntimeProvider` across sibling chunks. `PrefabInstance` loads assets and prepares rendering before showing content. Unmount to release it. `active={false}` prepares without activation; `onStatus` reports loading, compiling, ready, active, or error. Use `static` only for immutable chunks; remount to move or edit them.

Custom asset components declare `dependencies(properties)` with `{ kind: 'texture' | 'model' | 'sound' | 'prefab', path }`. See [architecture](docs/ARCHITECTURE.md) for resource ownership and preparation.

## Plugins and examples

Runtime imports use `react-three-game/viewer` (also available from `react-three-game`). Types and schemas are available from `/core`; authoring UI from `/editor`.

Crashcat physics uses `/plugins/crashcat`: register `CrashcatPhysicsComponent` and mount one `CrashcatRuntime` inside the scene. Inspector controls come from the component schemas; no editor-specific import is needed.

See [demo routes](docs/README.md), [lighting](docs/LIGHTING.md), and [interior mapping](docs/INTERIOR-MAPPING.md).

## Development

```sh
npm run dev
npm run test
npm run build
npm --prefix docs run build
```

WebGPU is required. Check changed behavior in the browser and run the relevant tests. Use production builds for performance comparisons.

License: PFYL / VPL.
