# React Three Game

Build scene behavior as React components. Let agents compose and tune their settings
through the running editor, then save the scene. Built for React Three Fiber with WebGPU.

Install it in your own React app: use `PrefabEditor` for editing, or `GameCanvas`
and `PrefabRoot` for playback. The website is a demo of these same components.

A scene is a JSON document containing nodes (scene objects) and component settings.
Calling `registerComponent` makes a behavior and its editable settings available.
The window API lets agents inspect and edit this document. Reusable scene documents
are called **prefabs**; they store settings, while behavior code stays in the application.

[npm](https://www.npmjs.com/package/react-three-game) ·
[Website](https://prnth.com/react-three-game) ·
[Component playground](https://prnth.com/react-three-game/demo/customcomponent) ·
[Starter](https://github.com/prnthh/react-three-game-starter)

## Install

```sh
npm install react-three-game @react-three/fiber @react-three/drei three three-text
```

React and React DOM are peers. Rendering requires WebGPU. Install `crashcat` only
for the optional physics plugin.

For scene edits through a browser agent, follow the [agent guide](docs/public/editor-api-for-agents.md).
The examples below show how to embed the library in your own app.

## Define and register behavior

```tsx
// Rotator.tsx
import { useFrame } from '@react-three/fiber';
import { registerComponent, useNode, useGameObject,
  type Component, type ComponentViewProps } from 'react-three-game/viewer';

type Props = { speed: number };

function RotatorView({ properties, children }: ComponentViewProps<Props>) {
  const object = useGameObject();
  const { editMode } = useNode();
  useFrame((_, delta) => {
    if (!editMode && object.transform) {
      object.transform.rotation.y += properties.speed * delta;
    }
  });
  return <>{children}</>;
}

const Rotator: Component<Props> = {
  name: 'Rotator',
  description: 'Rotate around Y during play. Speed is radians per second.',
  properties: { speed: { default: 1, step: 0.1 } },
  View: RotatorView,
};
registerComponent(Rotator); // Import this module before mounting the scene.
```

The definition supplies behavior, inspector fields, and agent-readable settings.

## A scene shared by both apps

```ts
// scene.ts
import type { Prefab } from 'react-three-game/core';

export const scene: Prefab = {
  root: { id: 'world', children: [{
    id: 'box', name: 'Box',
    components: {
      transform: { type: 'Transform', properties: {} },
      mesh: { type: 'Mesh', properties: {} },
      geometry: { type: 'Geometry', properties: { geometryType: 'box' } },
      material: { type: 'Material', properties: {} },
      rotator: { type: 'Rotator', properties: { speed: 1 } },
    },
  }] },
};
```

`type: 'Rotator'` matches the registered component name. `speed` is saved with the
scene. Keep this document outside the render function; a new `prefab` object reloads it.

## Minimal React app with an editor

Use the `Rotator.tsx` and `scene.ts` modules above:

```tsx
// App.tsx
import './Rotator'; // Runs registerComponent(Rotator) before the scene renders.
import { PrefabEditor } from 'react-three-game/editor';
import { scene } from './scene';

export default function App() {
  return <div style={{ height: '100vh' }}>
    <PrefabEditor prefab={scene} agentId="main"
      canvasProps={{ camera: { position: [4, 3, 6] } }}>
      <ambientLight intensity={2} />
    </PrefabEditor>
  </div>;
}
```

Select **Box** to edit its Rotator speed. Press **Play** to see it rotate. This app
also exposes `window.reactThreeGame.editors.main` for agents.

## Minimal React app with a viewer

Replace `App.tsx` with this version, keeping the same two shared modules:

```tsx
// App.tsx
import './Rotator'; // The viewer needs the behavior implementation too.
import { GameCanvas, PrefabRoot } from 'react-three-game/viewer';
import { scene } from './scene';

export default function App() {
  return <div style={{ height: '100vh' }}>
    <GameCanvas camera={{ position: [4, 3, 6] }}>
      <ambientLight intensity={2} />
      <PrefabRoot data={scene} />
    </GameCanvas>
  </div>;
}
```

The viewer runs the Rotator immediately, without editor panels or a window editor API.
To display an exported document, replace the `scene.ts` import with a saved prefab
JSON import. Keep `import './Rotator'` so its behavior remains available.

Both versions use an ordinary React entry point:

```tsx
// main.tsx — index.html contains <div id="root"></div>.
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
```

These examples fit a React + TypeScript app such as Vite. In Next.js, put
`'use client'` at the top of `App.tsx` and render it from a page instead of using `main.tsx`.

## Agent API

The editor above exposes this API in its browser tab:

```js
window.reactThreeGame.listEditors();
const api = window.reactThreeGame.editors.main;
api.help(); // Discovery, editing, capture, downloads and saving.
```

The [agent guide](docs/public/editor-api-for-agents.md) covers inspecting components,
applying edits, reviewing images, and downloading PNG/GLB files. Edits stay in memory:
pass `onSaveScene={saveDocument}` to connect saving, or write `api.exportScene().prefab`
to a JSON file. Import that file in either app to load it again.

## More starting points

| Task | Copy or adapt |
| --- | --- |
| Load and place URL-backed prefabs | [Loading pattern](docs/ARCHITECTURE.md#load-a-prefab) |
| Connect gameplay code to scene objects | [Gameplay example](docs/ARCHITECTURE.md#connect-a-host-system) |
| Build a first-person jumper or import character data | [Jumper playground](docs/app/demo/jumper/README.md) |
| Add optional physics | [Cool stuff demo](docs/app/demo/coolstuff/page.tsx) |
| Add a custom inspector | [Inspector example](docs/app/demo/coolstuff/InteriorMapComponent.editor.tsx) |
| Change rendering or resource ownership | [Implementation map](docs/ARCHITECTURE.md) |
| Explore working scenes | [Demo index](docs/README.md) |

## Development

```sh
npm run dev
npm test
npm run build
npm --prefix docs run build
```

`npm test` runs library and docs tests. Use `npm run test:lib` or `npm run test:docs`
to run either suite separately. Library tests live in `tests`; demo tests live in `docs/tests`.

License: see [LICENSE](LICENSE).
