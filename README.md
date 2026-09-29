# React Three Game

WebGPU rendering and scene authoring for React Three Fiber. Compose React views,
define GameObjects with reusable components, and edit scenes visually or through
an API for agents. Your application owns gameplay state and world ticks.

[npm](https://www.npmjs.com/package/react-three-game) ·
[Website](https://prnth.com/react-three-game) ·
[Editor](https://prnth.com/react-three-game/editor) ·
[Starter](https://github.com/prnthh/react-three-game-starter)

## Author a running scene (agents)

Start with the browser API in the editor tab or its iframe’s JavaScript context:

```js
window.reactThreeGame.help();
window.reactThreeGame.listEditors();
const api = window.reactThreeGame.editors.main; // Choose an ID from listEditors().
api.help();
api.getSceneInfo(); // Check Edit mode, revision and save availability.
```

Use this first for scene authoring in a running environment: targeted reads,
registered component fields and small undoable batches. The editor toolbar’s
**Agent API** hint opens the [agent guide](docs/editor-api-for-agents.md). [Geometry, model and texture examples](docs/editor-api-for-agents.md#author-an-organized-assembly)
show how to keep pieces organized and reusable. `api.analyzeScene()` reports
likely authoring costs; batch results include the same advisories.

## Install

In a React application:

```sh
npm install react-three-game @react-three/fiber @react-three/drei three three-text
```

React and React DOM are peers. `GameCanvas` requires WebGPU. Install `crashcat`
only for the optional physics plugin.

## Render a scene

```tsx
import { GameCanvas, PrefabRoot } from 'react-three-game/viewer';
import type { Prefab } from 'react-three-game/core';

const scene: Prefab = {
  materials: { orange: { color: '#f97316' } },
  root: {
    id: 'world',
    children: [{
      id: 'box',
      components: {
        transform: { type: 'Transform', properties: { position: [0, 1, 0] } },
        mesh: { type: 'Mesh', properties: {} },
        geometry: { type: 'Geometry', properties: { geometryType: 'box' } },
        material: { type: 'Material', properties: { materialId: 'orange' } },
      },
    }],
  },
};

export default function App() {
  return <GameCanvas>
    <ambientLight intensity={2} />
    <PrefabRoot data={scene} />
    {/* Ordinary R3F JSX can live alongside prefabs. */}
    <mesh position={[2, 1, 0]}><sphereGeometry /><meshNormalMaterial /></mesh>
  </GameCanvas>;
}
```

Keep `scene` stable: a new document object reloads it. Nodes use local transforms,
Y up and radians. Sparse component properties use registered defaults.

Start from the [viewer](docs/app/viewer/page.tsx).
Implementation: [PrefabRoot](src/tools/prefabeditor/PrefabRoot.tsx).

## Edit that scene

```tsx
import { PrefabEditor } from 'react-three-game/editor';

// Use the scene above, or import a saved prefab JSON file.
<PrefabEditor prefab={scene} agentId="main" />
```

The editor provides selection, transforms, component fields and undo. An editor
ref's `save()` returns the document. Edit/Play signals components; your host
controls gameplay pause/reset.

Start from the [editor page](docs/app/editor/page.tsx).
For an embedded layout, use `PrefabEditorProvider`, `PrefabEditorScene` and
`PrefabEditorPanel` from [PrefabEditor](src/tools/prefabeditor/PrefabEditor.tsx).

## Add a component

```tsx
import { useFrame } from '@react-three/fiber';
import { registerComponent, useNode, useGameObject,
  type Component, type ComponentViewProps } from 'react-three-game/viewer';

function SpinView({ properties, children }: ComponentViewProps<{ speed: number }>) {
  const object = useGameObject();
  const { editMode } = useNode();
  useFrame((_, delta) => {
    if (!editMode && object.transform) object.transform.rotation.y += properties.speed * delta;
  });
  return <>{children}</>;
}

const Spin: Component<{ speed: number }> = {
  name: 'Spin',
  properties: { speed: { default: 1, step: 0.1 } },
  View: SpinView,
};
registerComponent(Spin); // Before mounting scenes.
```

Add `spin: { type: 'Spin', properties: { speed: 2 } }` to a node's `components`.
The same definition supplies the view, generated inspector and agent-readable
fields. This animates the live object; it does not rewrite the document each frame.

Copy the [Rotator component](docs/app/demo/customcomponent/RotatorComponent.tsx)
and its [registration page](docs/app/demo/customcomponent/page.tsx).

## More starting points

| Task | Copy or adapt |
| --- | --- |
| Load and place URL-backed prefabs | [Loading pattern](docs/ARCHITECTURE.md#load-a-prefab) |
| Connect host gameplay to live objects | [Host-system pattern](docs/ARCHITECTURE.md#connect-a-host-system) |
| Build a first-person jumper or import character data | [Jumper playground](docs/app/demo/jumper/README.md) |
| Add optional physics | [Physics demo](docs/app/demo/physics/page.tsx) |
| Add a custom inspector | [Inspector example](docs/app/demo/physics/AdvancingTargetComponent.editor.tsx) |
| Change rendering or resource ownership | [Implementation map](docs/ARCHITECTURE.md) |
| Explore working scenes | [Demo index](docs/README.md) |

## Development

```sh
npm run dev
npm test
npm run build
npm --prefix docs run build
```

License: see [LICENSE](LICENSE).
