# React Three Game

Build scene behavior as React components. Let agents compose and tune their settings
through the running editor, then save the scene. Built for React Three Fiber with WebGPU.

Install it in your own React app: use `PrefabEditor` for editing, or `GameCanvas`
and `PrefabRoot` for playback. The website is a demo of these same components.

A scene is a JSON document containing nodes (scene objects) and component settings.
Calling `registerComponent` makes a behavior and its editable settings available.
The window API lets agents inspect and edit this document. Reusable scene documents
are called **prefabs**; they store settings. Behavior code usually stays in the application;
the built-in `Runtime` component can also store JavaScript directly in a prefab.

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

For scene edits through a browser agent, follow the [agent guide](docs/public/editor-scene-for-agents.md).
The examples below show how to embed the library in your own app.

## Prepared prefab instances

Use `PrefabInstance` inside your canvas for runtime loading and streamed chunks:

```tsx
import { PrefabInstance } from 'react-three-game';

<PrefabInstance id="courtyard" url="/prefabs/courtyard.json" />
```

It prepares dependencies, mounts an isolated instance with gameplay disabled,
compiles its rendering resources, then makes it visible and activates gameplay.
With `active={false}`, the prepared instance stays hidden and inactive until enabled.

The underlying `useAssetRuntime().preparePrefab(url, { basePath, signal })` discovers
nested prefab documents and declared model, texture, and sound dependencies. It
deduplicates loads, rejects cycles and unknown components, and retains resources
until the returned `PreparedPrefab.release()` is called. Custom components must
declare their assets through `dependencies` for preparation to discover them.
Preparation covers asset loading; GPU compilation and gameplay activation belong
to `PrefabInstance`.

`PrefabRoot` and editor `PrefabRef` rendering load incrementally and do not provide
that whole-instance readiness guarantee. Use them for live authoring, or when your
application manages readiness itself.

## Point light grid

Mount one `LightCullingGrid` inside your R3F canvas or as a child of `PrefabEditor`:

```tsx
import { LightCullingGrid } from 'react-three-game';

<LightCullingGrid cellSize={24} neighborRadius={1} />
```

It selects point lights in the camera's cell and neighboring cells on all three
axes, using stable light slots to avoid shader rebuilds when crossing cells.
It works with ordinary Three.js lights and prefab lights; other light types are
unaffected. Selection uses cell membership, so choose a cell size and radius that
cover the lighting you need. Unmounting restores the original light layers.

The component, `LightCullingGridOptions` type, and imperative
`LightCullingGridController` are also exported from `react-three-game/viewer`.
For manual integration, create one controller per scene, call `update` with the
camera's world position each frame, and call `dispose` when finished.

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

## Runtime behavior without registration

Add a built-in `Runtime` component to any node to author behavior directly in JSON.
No React component or `registerComponent` call is needed:

```json
"spin": {
  "type": "Runtime",
  "properties": {
    "data": { "speed": 1.5 },
    "setup": "const initialY = object.rotation.y; return () => { object.rotation.y = initialY; };",
    "update": "object.rotation.y += data.speed * delta;"
  }
}
```

`setup` is a synchronous JavaScript effect body; its returned function is React's
cleanup. `update` is a synchronous R3F frame callback. Both run only while the node
is enabled in Play mode, after preparation. React runs cleanup on disable, leaving
Play, removal, or a change to either script. Re-enabling or changing code runs setup
again with fresh `state`. React Strict Mode may also repeat setup/cleanup during
development, so effects must tolerate that cycle. These bodies cannot call React hooks.

Both scripts receive `nodeId` (local document ID), `node` (a live `GameObjectHandle`),
`object` (its current Three.js transform), `data` (a private copy of the JSON input),
`state` (mutable state shared by setup and update), `prefab` (document/object APIs),
`events` (the scene event bus), and `delta` (frame seconds, zero outside update).
These are also available through `context`. Use `nodeId` with `prefab.get/update/remove`;
`node.id` is the scoped runtime ID used in scene events.

Data edits do not restart the effect. Each update receives the latest data; callbacks
created inside setup can read `context.data` for current values rather than capturing
the setup-time `data`. The inspector provides multiline editors for both scripts.
For example, setup can subscribe to an event and return the unsubscribe function:

```js
return events.on('jump', event => {
  if (event.sourceNodeId === node.id) object.position.y += context.data.jumpHeight;
});
```

Both bodies compile before setup executes. Compilation/setup errors prevent updates;
an update error stops further updates until the effect restarts. Errors identify the
node and script field, and React still runs any returned cleanup. Release resources
in that cleanup, including timers and subscriptions.

Scripts are trusted application code, not sandboxed: loading an executable prefab
grants it page access. Compilation uses `new Function`, so the host's Content
Security Policy must allow it.

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
    <PrefabEditor prefab={scene}
      canvasProps={{ camera: { position: [4, 3, 6] } }}>
      <ambientLight intensity={2} />
    </PrefabEditor>
  </div>;
}
```

Select **Box** to edit its Rotator speed. Press **Play** to see it rotate. This app
also exposes `window.scene` for agents.

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

## Agent scene

The editor above exposes the scene in its browser tab:

```js
const scene = window.scene;
scene.help(); // Discovery, editing, capture, downloads and saving.
```

The [agent guide](docs/public/editor-scene-for-agents.md) covers inspecting components,
applying edits, reviewing images, and downloading PNG/GLB files. Edits stay in memory:
pass `onSaveScene={saveDocument}` to connect saving, or write the string returned by
`scene.exportJSON()` to a JSON file. Import that file in either app to load it again.

## More starting points

| Task | Copy or adapt |
| --- | --- |
| Load and place URL-backed prefabs | [Loading pattern](docs/ARCHITECTURE.md#load-a-prefab) |
| Connect gameplay code to scene objects | [Gameplay example](docs/ARCHITECTURE.md#connect-a-host-system) |
| Build a first-person jumper or import character data | [Jumper demo](docs/app/demo/jumper/page.tsx) |
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
