# React Three Game

Build WebGPU games from editable JSON scenes and React Three Fiber components.

The library and docs use React / React DOM 19.3.0 and React Three Fiber 9.8.0. Consumers need matching React / React DOM versions in the supported range `>=19.0.0 <19.4.0` and R3F `^9.8.0`. R3F 9.8 fixes async renderer root setup and Strict Mode canvas remounts; `GameCanvas` continues to await WebGPU initialization before rendering. React 19.3 compatibility does not imply support for every new React API in R3F.

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

For an existing canvas or custom layout, compose the same editor pieces:

```tsx
<PrefabEditorProvider prefab={scene as Prefab}>
  <GameCanvas><PrefabEditorScene><GameSystems /></PrefabEditorScene></GameCanvas>
  <PrefabEditorPanel />
</PrefabEditorProvider>
```

These editor pieces are exported from `/editor`. Store actions and prefab API edits share undo history; synchronous actions form one undo step.

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
import { registerComponent, useNode, useGameObject,
  type Component, type ComponentViewProps } from 'react-three-game/viewer';

type SpinProps = { speed: number };

function SpinView({ properties, children }: ComponentViewProps<SpinProps>) {
  const object = useGameObject();
  const { editMode } = useNode();
  useFrame((_, delta) => {
    if (!editMode && object.transform) object.transform.rotation.y += properties.speed * delta;
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
| Current or referenced live object | `useGameObject()` / `useGameObject(id)` |
| Node selection and edit mode | `useNode()` |
| Document edits and assets | `usePrefab()` |
| Shared scene and mode | `useScene()` |
| Save an authored edit | `prefab.update()`, `add()`, `remove()`, `setMaterial()` |
| Animate or simulate | Mutate live Three objects in `useFrame` |
| Notify systems | `useGameEvents().emit()` / `useGameEvent()` |
| Read one runtime component | `object.getComponent(type)` |
| Register or query scene components | `useRegisterNodeComponent()` / `useSceneComponents()` |

Mount scene systems as children of `PrefabRoot`. Nested prefabs share runtime services but keep their own documents and local node IDs. Use distinct `id` props when mounting the same document in multiple `PrefabRoot`s. Use `useGameObject(id)` for a live object reference in the current prefab, or `useGameObject()` for the current node. Its `id` matches event payloads; instance scoping is automatic.

`GameCanvas` supplies the runtime; `PrefabRoot` also supplies it when used in an existing R3F canvas. Wrap HTML controls and their canvas in `GameEventsProvider` when both need `useGameEvents()` or `useGameEvent()`.

Use one active `Camera` node. Add `CameraFollow` to follow a `targetId` in the same prefab; its offsets are world-space. Edit mode uses editor controls. `Fog` provides scene-wide color, near, and far fields; use one active fog node with far greater than near.

```tsx
const player = useGameObject('player');
const model = useGameObject('player-model');

useFrame(() => {
  player.transform?.position.setY(1);
  model.getComponent(ANIMATED_MODEL_COMPONENT)?.setAnimationState('idle');
});
```

Handles stay stable; `transform` and `getComponent()` read current values and return `null` until mounted or after unloading. Crashcat bodies are available through `getComponent(RIGID_BODY_COMPONENT)` from the physics plugin. Use `usePrefab()` for document edits and assets, and `useSceneComponents(type)` when you need all components of a type.

## Stream content

```tsx
import { PrefabInstance } from 'react-three-game/viewer';

<group position={[0, 0, -320]}>
  <PrefabInstance id="chunk-1" url="/prefabs/chunk.json"
    onActivate={() => console.log('Chunk active')} />
</group>
```

Place this inside `GameCanvas`. Its runtime is shared automatically across roots and chunks. `PrefabInstance` loads assets and prepares rendering before showing content. Unmount to release it. `active={false}` prepares without activation; `onStatus` reports loading, compiling, ready, active, or error. Use `static` only for immutable chunks; remount to move or edit them.

Custom asset components declare `dependencies(properties)` with `{ kind: 'texture' | 'model' | 'sound' | 'prefab', path }`. See [architecture](docs/ARCHITECTURE.md) for resource ownership and preparation.

## Audio

The shared sound manager plays looping background music and overlapping one-off sounds:

```ts
import { soundManager } from 'react-three-game/viewer';

void soundManager.playMusic('/sound/music.wav', { volume: 0.3 });
// Call directly from a click/tap handler to also unlock audio blocked on page load.
void soundManager.play('/sound/click.wav');
soundManager.stopMusic();
```

Music and one-off sounds share an audio context, so playing a sound after interaction also resumes queued music. `play()` returns a handle with `stop()` and accepts an `onEnded` callback. Master, music, and sound-effect volume controls are available through `setMasterVolume()`, `setMusicVolume()`, and `setSfxVolume()`.

## Plugins and examples

Runtime imports use `react-three-game/viewer` (also available from `react-three-game`). Types and schemas are available from `/core`; authoring UI from `/editor`.

Crashcat physics uses `/plugins/crashcat`: register `CrashcatPhysicsComponent` and mount one `CrashcatRuntime` inside the scene. Inspector controls come from the component schemas; no editor-specific import is needed. Pass `importModel={importCollisionModel}` to the editor to convert Blender `_col`/`_colonly` meshes into physics nodes; the importer comes from the Crashcat plugin.

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
