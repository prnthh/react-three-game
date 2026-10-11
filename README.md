# React Three Game

Build scenes visually. Add behavior with React. Ship them on the web.

A **prefab** is a JSON-compatible tree of nodes. Each node has components for
geometry, materials, lighting, sound, or gameplay. Start with an inline prefab in
your app, edit it visually, and pack assemblies to reuse within the scene. Save a
separate prefab file when you want to share it across scenes or load it by URL.

[npm](https://www.npmjs.com/package/react-three-game) ·
[Website](https://prnth.com/react-three-game) ·
[Web editor](https://prnth.com/react-three-game/editor) ·
[Starter](https://github.com/prnthh/react-three-game-starter)

## 1. Render an inline prefab

In a React app, install the library and its rendering dependencies:

```sh
npm install react-three-game @react-three/fiber @react-three/drei three three-text
```

React and React DOM are peer dependencies. Use a WebGPU-capable browser.
In Next.js, put `'use client'` at the top of the canvas module.

<a id="minimal-react-app-with-a-viewer"></a>

This complete app renders a coral cube. Keep the prefab outside the component so
its identity stays stable between renders:

```tsx
import { GameCanvas, PrefabRoot, type Prefab } from 'react-three-game/viewer';

const prefab: Prefab = {
  root: {
    id: 'world',
    children: [{
      id: 'cube', name: 'Cube',
      components: {
        geometry: { type: 'Geometry', properties: { geometryType: 'box' } },
        material: { type: 'Material', properties: { name: 'coral', color: '#ef806a' } },
      },
    }],
  },
};

export default function App() {
  return <div style={{ height: '100vh' }}>
    <GameCanvas camera={{ position: [4, 3, 6] }}>
      <ambientLight intensity={2} />
      <PrefabRoot data={prefab} />
    </GameCanvas>
  </div>;
}
```

Node IDs are unique within a prefab. Component keys such as `geometry` identify
entries on a node; `type` selects the registered component. Each component supplies
defaults for its properties.

## 2. Edit the same prefab

<a id="minimal-react-app-with-an-editor"></a>

Keep `prefab` above and replace the viewer import and `App` with:

```tsx
import type { Prefab } from 'react-three-game/viewer';
import { PrefabEditor } from 'react-three-game/editor';

export default function App() {
  return <div style={{ height: '100vh' }}>
    <PrefabEditor prefab={prefab}
      canvasProps={{ camera: { position: [4, 3, 6] } }}>
      <ambientLight intensity={2} />
    </PrefabEditor>
  </div>;
}
```

Select **Cube** to edit its components. The editor also exposes `window.scene`.
Run this in the browser console to move the cube and frame it:

```js
const scene = window.scene;
await scene.setMode({ mode: 'edit' });
scene.update({ id: 'cube', transform: { position: [0, 1, 0] } });
scene.look({ id: 'cube' });
```

The GUI and API share the document and undo history. Explore `scene.help()` and
`scene.components()` as you add more objects.

## 3. Pack and reuse inline

Select a node or assembly and choose **Pack as Prefab**. This keeps its components and children in place and adds `packed: true`. In the same console session:

```js
scene.pack({ id: 'cube' });
scene.duplicate({ id: 'cube', newId: 'cube-2' });
scene.transform({ id: 'cube-2', position: [3, 1, 0] });
scene.duplicate({ id: 'cube', newId: 'cube-3' });
scene.transform({ id: 'cube-3', position: [-3, 1, 0] });
scene.look({ id: scene.info().rootId });
```

The original node owns the inline definition; copies use `PrefabRef` with its
node ID as `prefabId` and have independent transforms. Edit the original's
components or children to update every copy. **Unpack Prefab** expands a copy
for independent editing. To retain editor changes across an
app reload, replace the inline `prefab` value with the JSON returned by
`scene.exportJSON()`.

See [inline composition in code](docs/ARCHITECTURE.md#compose-an-inline-prefab)
and the [Scene API guide](docs/public/editor-scene-for-agents.md#reusable-subtrees)
for nested assemblies and export.

## 4. Add behavior

A custom component pairs a React view with editable properties. Save this as
`Rotator.tsx` and import `./Rotator` in your app before mounting the editor:

```tsx
import { useFrame } from '@react-three/fiber';
import { registerComponent, useNode, useGameObject,
  type Component, type ComponentViewProps } from 'react-three-game/viewer';

type Props = { speed: number };
function RotatorView({ properties, enabled, children }: ComponentViewProps<Props>) {
  const object = useGameObject();
  const { editMode } = useNode();
  useFrame((_, delta) => {
    if (enabled && !editMode && object.transform) {
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

After the app reloads, select **Cube**, add **Rotator**, then press **Play**.
Or add it through the console after reconnecting to the editor:

```js
const scene = window.scene;
await scene.setMode({ mode: 'edit' });
scene.setComponent({ id: 'cube', key: 'rotator', component: {
  type: 'Rotator', properties: { speed: 1 },
} });
await scene.setMode({ mode: 'play' });
```

Settings are saved with the scene; the implementation stays in your app. Register
custom components in both editor and playback builds. For small scripts stored
with trusted scene data, see the built-in [Runtime component](docs/public/editor-scene-for-agents.md#add-behavior-that-is-not-registered).

## 5. Save and share

Choose **Save Prefab** to download the current scene as JSON. `scene.exportJSON()`
returns the same document as a string; `onSaveScene` connects the editor to your
app's storage. Load a saved `scene.json` in the viewer from step 1 by replacing the
inline declaration with:

```tsx
import prefab from './scene.json';
```

For an assembly shared across scenes, choose **Export Prefab…** on that node and
save it under your app's `public/prefabs/` folder. Place it with a `PrefabRef` URL;
see [file-based reuse and loading](docs/ARCHITECTURE.md#load-a-prefab).
Ship the JSON, its referenced assets, and custom component code with your app.

## Tools and examples

Run this repository's website and editor locally:

```sh
npm install
npm run dev
```

Open `http://localhost:3000/editor`. Asset pickers and `scene.assets()` use
`public/manifest.json`, relative to the editor's `basePath`. Rebuild this demo
catalog with `npm --prefix docs run generate-manifests`.

### Node CLI

With Node 22+, install the CLI and inspect its commands:

```sh
npm install -g react-three-game
rtg components
rtg schema
```

Save this as `commands.json` to move the cube in your exported `scene.json`:

```json
{ "commands": [{ "op": "transform", "id": "cube", "position": [0, 2, 0] }] }
```

```sh
rtg validate scene.json commands.json
rtg apply scene.json commands.json edited.json
rtg convert edited.json scene.glb ./public
rtg convert scene.glb imported.json
```

Prefab JSON preserves editable components and gameplay settings. GLB conversion
produces static geometry and material settings for use in other 3D tools.

| Next step | Example |
| --- | --- |
| Edit through scripts | [Scene API](docs/public/editor-scene-for-agents.md) |
| Compose prefabs, then load chunks | [Architecture patterns](docs/ARCHITECTURE.md#compose-an-inline-prefab) |
| Connect gameplay to live objects | [Host systems](docs/ARCHITECTURE.md#connect-a-host-system) |
| Physics | [Cool stuff demo](docs/app/demo/coolstuff/page.tsx) |
| Inline buildings and movement | [Parkour demo](docs/app/demo/parkour/page.tsx) |
| Custom inspector controls | [Interior mapping](docs/app/demo/coolstuff/INTERIOR-MAPPING.md) |
| More working scenes | [Demo index](docs/README.md) |

## Development

```sh
npm run dev                 # Local website and editor
npm test                    # Library and demo tests
npm run test:package         # Published package and CLI checks
npm run build               # Library build
npm --prefix docs run build # Website build
```

License: see [LICENSE](LICENSE).
