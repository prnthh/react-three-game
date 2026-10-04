# React Three Game

A game creation toolbox for the web. Build games with JavaScript and Three.js,
WebGPU rendering, and a visual scene editor.

We use React and React Three Fiber to make behavior reusable and easy to compose.
Start with small components, then build on them as your game grows. Assemble
scenes in the editor and save them as JSON prefabs. Agents can help compose and
tune scenes through the editor API too.

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

## Choose an interface

All interfaces edit the same JSON prefab format.

| Use case | Entry point |
| --- | --- |
| Edit files, validate command batches, convert GLB | `rtg` CLI (Node 22+) |
| Edit documents in application code | `react-three-game/core` |
| Load local assets and convert scenes in Node | `react-three-game/node` |
| Embed a visual editor and live agent API | `react-three-game/editor` |
| Play a scene in React Three Fiber | `react-three-game/viewer` |

For a first React app, start with the [editor example](#minimal-react-app-with-an-editor)
or [viewer example](#minimal-react-app-with-a-viewer). For files, follow the CLI
example below.

## Prepared prefab instances

Use `PrefabInstance` inside your canvas for runtime loading and streamed chunks:

```tsx
import { PrefabInstance } from 'react-three-game';

<PrefabInstance id="courtyard" url="/prefabs/courtyard.json" />
```

It prepares dependencies, mounts an isolated instance with gameplay disabled,
compiles its rendering resources, then makes it visible and activates gameplay.

The underlying `useAssetRuntime().preparePrefab(url, { basePath, signal })` discovers
nested prefab documents and declared model, texture, and sound dependencies. It
deduplicates loads and rejects cycles and unknown components. Custom components must
declare their assets through `dependencies` for preparation to discover them.
Preparation covers asset loading; GPU compilation and gameplay activation belong
to `PrefabInstance`.

`PrefabRoot` renders model/reference content independently of placement children. Resource reads participate in React
Suspense and use one `suspend-react` cache for decoded assets. Environments and prepared instances wait
for their complete content. `PrefabRef` keeps the current
instance visible while a replacement document loads and preserves matching objects.

Loading failures are contained by the same node or whole-instance boundary that
owns loading. Failed nodes retry on document edits; prepared instances report an
error through `onStatus`. Other rendering errors still propagate to the application.
URL assets remain cached across scene unmounts.
After unmounting consumers and finishing pending loads, hosts can call
`runtime.clearAsset(kind, resolvedPath)` (`kind`: `model`, `texture`, `sound`, or
`prefab`) to evict an unused source from the runtime overrides and asset cache. It returns
that source for host-owned Three.js disposal; eviction never disposes live objects.
Embedded prefab references clear obsolete source revisions when replaced or unmounted.
Imperative preparation awaits the same cache entries that rendering reads.
Three's global cache settings are left to the host application.
Shared source geometry, materials and textures must not be mutated or disposed by
individual instances; instance-local objects and configured copies keep their own
cleanup. Drei's `useProgress` reports underlying Three loader activity; it does not
include prefab JSON or audio fetched directly.

## Node scene conversion

Node 22+, no browser or GPU:

```js
import { convert } from 'react-three-game/node';

const glb = await convert(scene, { from: 'scene', to: 'glb', assetRoot: './public' });
const json = await convert(glb, { from: 'glb', to: 'scene' });
```

`scene` is a prefab object; `glb` is an ArrayBuffer (Buffer input also works).
`assetRoot` defaults to cwd. Lossy static conversion: custom components, textures,
and animation are omitted; compressed models requiring decoders are unsupported.
Install the CLI globally:

```sh
npm i -g react-three-game
rtg convert scene.json scene.glb
rtg convert scene.glb scene.json
```

Both paths are required. Optional third argument: asset root (otherwise cwd).

## Edit scene files

Create `scene.json`:

```json
{ "root": { "id": "world", "children": [{ "id": "player", "name": "Player" }] } }
```

Create `commands.json`:

```json
{
  "commands": [
    { "op": "update", "id": "player", "patch": { "name": "Hero" } },
    { "op": "transform", "id": "player", "position": [1, 0, 0] }
  ]
}
```

Validate, then save a new scene:

```sh
rtg validate scene.json commands.json
rtg apply scene.json commands.json edited.json
rtg components Transform
rtg schema > commands.schema.json
```

`commands.json` uses the same `{ "commands": [...] }` payload as the editor agent
(without its session-specific `expectedRevision`). Validation evaluates the whole
batch without writing a file; apply writes only after all commands succeed.
`rtg schema` describes the complete command-file object. `rtg components` lists
built-ins; pass names to see their properties and defaults. Errors go to stderr
with exit code 1. Run `rtg --help` for usage.

The CLI uses built-in contracts. For application-specific components, register
those definitions with `registerComponent` and use the same core API in a script:

### Use commands from code

```js
import { evaluateSceneCommands } from 'react-three-game/core';
import { registerBuiltInComponents } from 'react-three-game/node';

registerBuiltInComponents(); // Once before validating built-in component properties.
const scene = { root: { id: 'world', children: [{ id: 'player' }] } };
const { prefab, result } = evaluateSceneCommands(scene, {
  commands: [{ op: 'update', id: 'player', patch: { name: 'Hero' } }],
});
```

This returns a new prefab without mutating the input. `evaluateSceneCommandState`
works directly on normalized state for store-backed hosts. Core imports are pure:
they do not install component definitions. `registerBuiltInComponents` is also
available from `/viewer`, and preserves custom definitions already registered.

The GUI uses the core document/store API; the editor agent and CLI use the core
command evaluator. Selection, undo history, camera controls, and file I/O belong
to their hosts. Core stays independent of editor UI and rendering imports.

## Browser services

`SceneRuntime` and `PrefabRoot` own scene resources and document scopes. They do
not create audio listeners or install browser interaction listeners. `GameCanvas`
includes `BrowserRuntime` to supply these services; existing editor and GameCanvas
usage retains audio behavior. When hosting `PrefabRoot` in your own R3F canvas,
opt into browser services explicitly:

```tsx
import { Canvas } from '@react-three/fiber';
import { PrefabRoot } from 'react-three-game/viewer';
import { BrowserRuntime } from 'react-three-game/browser';

<Canvas>
  <BrowserRuntime>
    <PrefabRoot data={prefab} />
  </BrowserRuntime>
</Canvas>
```

Sound nodes preserve their children but do not load or play clips without an audio
provider. `SceneRuntime` also accepts `instancing={false}` for hosts that need source
meshes. `exportGLBData` is shared serialization code; browser downloads are separate
`downloadBlob` / `downloadURL` adapters in `react-three-game/browser`. The editor's
existing save, screenshot, and GLB download APIs use this browser layer.

## Point light grid

Mount one `LightCullingGrid` inside your R3F canvas or as a child of `PrefabEditor`:

```tsx
import { LightCullingGrid } from 'react-three-game';

<LightCullingGrid cellSize={24} neighborRadius={1} />
```

It selects point lights in the camera's cell and neighboring cells on all three
axes, using stable light slots to avoid shader rebuilds when crossing cells.
SceneRuntime indexes live Three.js objects in the existing scene component registry
through hierarchy events, including additions, removals and reparenting. Lights
are a typed view of that same registry; discovery does not traverse the scene
each frame. `useSceneComponents(SCENE_LIGHT)` exposes lights and
`useSceneComponents(SCENE_OBJECT)` exposes graph objects (keyed by Three UUID).
Imperative consumers can use `getSceneComponentRegistry(scene)`. Authored prefab
documents remain in their Zustand store.
It works with ordinary Three.js lights and prefab lights; other light types are
unaffected. Selection uses cell membership, so choose a cell size and radius that
cover the lighting you need. Unmounting restores the original light layers.

The component, `LightCullingGridOptions` type, and imperative
`LightCullingGridController` are also exported from `react-three-game/viewer`.
For manual integration, create one controller per scene, call `update` with the
camera's world position each frame, and call `dispose` when finished.

## Spatial mesh batches

Compatible meshes automatically batch within 24-unit world-space cells. Set
`<GameCanvas spatialCellSize={32}>` (or `PrefabEditor`'s
`canvasProps={{ spatialCellSize: 32 }}`) to change the scene-wide size.
Moving meshes migrate between cells; immutable `PrefabInstance static` content
keeps its prepared membership. Smaller cells trade more draw calls for finer
batch culling.

Batch bounds include the full geometry, even when it extends outside its cell.
Three.js performs its normal per-camera batch culling, including shadow cameras;
source nodes remain available to gameplay and collision. Set a Mesh's
`frustumCulled: false` for geometry with shader deformation that exceeds its
bounds, or `instanced: false` to keep ordinary mesh rendering.

The exported `SpatialGrid<T>` provides generic cell membership for custom node
systems. It groups positions, not influence volumes, and does not hide nodes or
run gameplay visibility logic. Light selection still uses its separate
`LightCullingGrid` cell settings; light distance does not determine membership.

## Runtime ownership and registration

`resolveGameObject(object, instanceId?)` returns the nearest owning
`GameObjectHandle`, or `null` for an unowned object. Prefab node roots register
automatically; imported descendants inherit their owner, and generated mesh
batches resolve through their source instance. A batch needs a valid instance
index to identify its owner.

```ts
import { resolveGameObject } from 'react-three-game/viewer';

const owner = resolveGameObject(hit.object, hit.instanceId);
// owner.id: scoped runtime node ID; owner.nodeId: local document ID;
// owner.scope: prefab placement scope. hit.object.uuid is a separate identity.
```

Custom renderers can use `registerGameObjectOwner(object, handle)` and
`registerRenderSources(batch, sources)`. Both return replacement-safe cleanup
functions. Editor picking uses the same source mapping and ownership identities.
Runtime ownership does not change or serialize the authored document.

Scene component entries expose `key` as their registry identity. The older
`nodeId` alias remains available; graph entry keys are Three UUIDs, not authored
node IDs. `getSceneComponentRegistry(scene).register(key, type, value)` returns
an unregister function that cannot remove a later replacement, even if the
replacement uses the same value. Prefer this cleanup over registering `null`;
explicit `null` clears the current entry unconditionally.

`registry.batch(() => { ... })` coalesces synchronous notifications once per
changed component type, including nested batches. Reads see writes immediately.
It batches notifications, not rollback: writes are retained and notifications
flush if the callback throws. Scene-subtree attachment and removal use batching
automatically. Wrap a multi-step imperative reparent in `registry.batch` when
subscribers should observe only the final membership.

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

For imperative changes, call `notifyObjectChanged(object)` from
`react-three-game/viewer`, or pass `'geometry'` as the second argument for geometry
changes. This updates affected colliders, including inherited transforms and
compound geometry. Authored transforms and primitive geometry notify automatically;
physics simulation writes do not.

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
| Build a first-person parkour or import character data | [Parkour demo](docs/app/demo/parkour/page.tsx) |
| Add optional physics | [Cool stuff demo](docs/app/demo/coolstuff/page.tsx) |
| Add a custom inspector | [Inspector example](docs/app/demo/coolstuff/InteriorMapComponent.editor.tsx) |
| Change rendering or resource ownership | [Implementation map](docs/ARCHITECTURE.md) |
| Explore working scenes | [Demo index](docs/README.md) |

## Development

```sh
npm run dev
npm test
npm run test:package
npm --prefix docs run build
```

The docs app imports local source directly; `npm run dev` does not require a library
build or a separate TypeScript watcher. `npm run build` generates the published package.

`npm test` runs library and docs tests. Use `npm run test:lib` or `npm run test:docs`
to run either suite separately. Library tests live in `tests`; demo tests live in
`docs/tests`.

Library tests cover the offered features: loading scene JSON, composing a Three.js
scene, efficient document mutation and registration, and attaching arbitrary
registered components. Built-ins are checked through representative scene and
interface workflows, including the window API bridge and Node CLI. Custom behavior
fixtures demonstrate extension points; their gameplay choices are not library
requirements. Demo-specific behavior belongs in `docs/tests`.

Keep one suite per feature and prefer observable results over internal import paths,
helper call counts, cache eviction sequences, or a particular implementation's
recovery behavior. Add a regression test only when it protects an intended feature
contract; a failed development attempt alone does not establish one. Keep targeted
identity and notification checks where they verify efficient mutation or registration.

The Node rendering tests mount React Three Fiber with a stub renderer. They check
scene objects and edits, not GPU output or GUI interaction. For changes to built-in
rendering or editor controls, also smoke-test the affected feature in the GUI:
load a scene, edit its built-in properties, play it, and export/reload the JSON.

`npm run test:package` builds and packs the library, checks the CLI, and
compiles a NodeNext TypeScript consumer against the packed files.

License: see [LICENSE](LICENSE).
