# React Three Game

Build scenes visually. Add behavior with React. Ship them on the web.

React Three Game combines Three.js, React Three Fiber, and a WebGPU scene editor.
A scene is a **prefab**: a JSON tree of nodes with components for geometry,
materials, lighting, sound, and gameplay. Register your own components to give
those nodes new behavior and editable properties.

[npm](https://www.npmjs.com/package/react-three-game) ·
[Website](https://prnth.com/react-three-game) ·
[Component playground](https://prnth.com/react-three-game/demo/customcomponent) ·
[Starter](https://github.com/prnthh/react-three-game-starter)

## Three ways to work

### Web editor and API

Open the [web editor](https://prnth.com/react-three-game/editor) to assemble a
scene, adjust components, and try it in Play mode. The same editor exposes
`window.scene` for scripts and browser agents:

```js
const scene = window.scene;
scene.help();
scene.search({ query: 'Cube' });
scene.update({ id: 'cube', transform: { position: [0, 2, 0] } });
scene.exportJSON();
```

The API shares the editor's document and undo history. It supports inspecting,
creating, editing, cloning, and packing nodes, plus screenshots and exports.
See the [agent guide](docs/public/editor-scene-for-agents.md) for the full workflow.
The hosted editor includes built-in components; use your own app for custom ones.

### Local editor

Run this repository's editor locally:

```sh
npm install
npm run dev
```

Open `http://localhost:3000/editor`. Or use the
[Starter](https://github.com/prnthh/react-three-game-starter) to build your own app
with an [embedded editor](#minimal-react-app-with-an-editor).

### Node CLI

Use Node 22+ to inspect components, edit scene files, and convert between prefab
JSON and GLB:

```sh
npm install -g react-three-game
rtg components
rtg schema > commands.schema.json
rtg validate scene.json commands.json
rtg apply scene.json commands.json edited.json
rtg convert scene.json scene.glb ./public
rtg convert scene.glb imported.json
```

A command file uses the same operations as the web API's `scene.batch()`:

```json
{
  "commands": [
    { "op": "transform", "id": "cube", "position": [0, 2, 0] }
  ]
}
```

Run `rtg --help` for usage. GLB conversion exports a static scene; it does not
preserve gameplay, animation, or textures. Keep prefab JSON for [playable scenes](#minimal-react-app-with-a-viewer).

## Create custom components

In a React app, install the library and its rendering dependencies:

```sh
npm install react-three-game @react-three/fiber @react-three/drei three three-text
```

React and React DOM are peer dependencies. Rendering needs a WebGPU-capable
browser. Physics is optional through the `crashcat` plugin.

A component pairs a React view with a property definition. Register it once,
before mounting your editor or scene:

```tsx
// Rotator.tsx
import { useFrame } from '@react-three/fiber';
import {
  registerComponent, useNode, useGameObject,
  type Component, type ComponentViewProps,
} from 'react-three-game/viewer';

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
  description: 'Rotate around Y. Speed is radians per second.',
  properties: { speed: { default: 1, step: 0.1 } },
  View: RotatorView,
};

registerComponent(Rotator);
```

`Rotator` now appears in the editor's **Add component** picker, with a Speed field.
Its settings are saved in the scene; its implementation stays in your app.

Here is a small scene using it:

```json
{
  "root": {
    "id": "world",
    "children": [{
      "id": "cube",
      "name": "Cube",
      "components": {
        "geometry": { "type": "Geometry", "properties": { "geometryType": "box" } },
        "material": { "type": "Material", "properties": { "name": "coral", "color": "#ef806a" } },
        "rotator": { "type": "Rotator", "properties": { "speed": 1 } }
      }
    }]
  }
}
```

Save this as `scene.json`. Other nodes can share its material with
`{ "type": "Material", "properties": { "name": "coral" } }`.

<a id="minimal-react-app-with-an-editor"></a>

Embed the editor in your app:

```tsx
import './Rotator';
import { PrefabEditor } from 'react-three-game/editor';
import scene from './scene.json';

export default function App() {
  return <div style={{ height: '100vh' }}>
    <PrefabEditor prefab={scene}
      canvasProps={{ camera: { position: [4, 3, 6] } }}>
      <ambientLight intensity={2} />
    </PrefabEditor>
  </div>;
}
```

Select the cube to change its speed, then press **Play**. Your app also gets
`window.scene`. For code that belongs directly in a scene file, the built-in
`Runtime` component offers JavaScript setup and update fields; use it only with
trusted scene files.

## Export and play your scene

Choose **Save Prefab** in the editor's file menu to download the scene as JSON.
You can also get the document with `scene.exportJSON()`, or connect
`PrefabEditor`'s `onSaveScene` callback to your app's storage.

<a id="minimal-react-app-with-a-viewer"></a>

Load the saved scene with `PrefabRoot` inside `GameCanvas` to run it without
editor panels:

```tsx
import './Rotator';
import { GameCanvas, PrefabRoot } from 'react-three-game/viewer';
import scene from './scene.json';

export default function App() {
  return <div style={{ height: '100vh' }}>
    <GameCanvas camera={{ position: [4, 3, 6] }}>
      <ambientLight intensity={2} />
      <PrefabRoot data={scene} />
    </GameCanvas>
  </div>;
}
```

Ship the scene JSON, referenced assets, and your custom component code with the
app. Register the same components in both editor and playback builds. In Next.js,
mark the component containing the canvas with `'use client'`.

## Explore more

| What you want to build | Start here |
| --- | --- |
| Load and place prefabs by URL | [Loading pattern](docs/ARCHITECTURE.md#load-a-prefab) |
| Connect gameplay to scene objects | [Gameplay example](docs/ARCHITECTURE.md#connect-a-host-system) |
| First-person parkour and character imports | [Parkour demo](docs/app/demo/parkour/page.tsx) |
| Physics | [Cool stuff demo](docs/app/demo/coolstuff/page.tsx) |
| Custom inspector controls | [Inspector example](docs/app/demo/coolstuff/components/InteriorMapComponent.editor.tsx) |
| Architecture and runtime details | [Implementation map](docs/ARCHITECTURE.md) |
| More working scenes | [Demo index](docs/README.md) |

## Development

```sh
npm run dev          # Run the local website and editor
npm test             # Library and demo tests
npm run test:package # Check the published package and CLI
npm run build        # Build the library
npm --prefix docs run build # Build the website
```

License: see [LICENSE](LICENSE).
