# react-three-game

![Prefab Editor](assets/editor.gif)

JSON-first prefab mounting and authoring for React Three Fiber.

Built on top of [three.js](https://github.com/mrdoob/three.js), [@react-three/fiber](https://github.com/pmndrs/react-three-fiber), and [@react-three/drei](https://github.com/pmndrs/drei).

* **🧱 Prefabs** - Save prefabs as serializable JSON and load them on their own or inside larger app worlds.
* **🎬 Prefab Editor** - Edit prefabs visually with hierarchy, inspector, transform gizmos, and play mode.
* **🧩 Components** - Build prefabs from reusable `GameObject` + component composition.
* **🔧 Direct Runtime Access** - Get native `Object3D`, runtime handles, and authored prefab mutation APIs without a parallel engine API.
* **⚡ R3F Native** - Use normal React Three Fiber components whenever runtime behavior is clearer in code.

## Documentation

* Website: https://prnth.com/react-three-game
* Editor: https://prnth.com/react-three-game/editor
* Starter template: https://github.com/prnthh/react-three-game-starter

## Install

```bash
npm install react-three-game @react-three/drei @react-three/fiber three
```

## Usage

Here is a minimal example that renders a prefab inside a normal R3F app:

```tsx
import { GameCanvas, PrefabRoot, ground } from "react-three-game";

const prefab = {
  id: "starter-scene",
  name: "Starter Prefab",
  root: {
    id: "root",
    children: [
      ground({ size: 50, color: "#3a3" }),
      {
        id: "ball",
        components: {
          transform: {
            type: "Transform",
            properties: {
              position: [0, 5, 0],
              rotation: [0, 0, 0],
              scale: [1, 1, 1],
            },
          },
          geometry: {
            type: "Geometry",
            properties: { geometryType: "sphere", args: [0.5, 32, 32] },
          },
          material: {
            type: "Material",
            properties: { color: "#f66" },
          },
        },
      },
    ],
  },
};

export default function App() {
  return (
    <GameCanvas>
      <ambientLight intensity={0.8} />
      <PrefabRoot data={prefab} />
    </GameCanvas>
  );
}
```

This example renders a simple authored prefab with a ground plane and mesh content.

## Prefab Editor

In addition to the runtime renderer, there is a visual editor for authoring prefabs.

```tsx
import { PrefabEditor } from "react-three-game";

export default function App() {
  return <PrefabEditor initialPrefab={prefab} onChange={console.log} />;
}
```

Open the hosted editor here:

* https://prnth.com/react-three-game/editor

## Prefabs And Mounted Objects

`Prefab` is the serializable pure data format.

That means authored content stays as a prefab, and the same prefab can be:

* edited directly in `PrefabEditor`
* rendered directly with `PrefabRoot`
* loaded inside another prefab or app scene as reusable content

`PrefabRoot` keeps the rendering model narrow and compositional:

* `Transform` is the renderer-owned outer transform
* `Geometry` or `BufferGeometry` + `Material` become the primary mesh content
* non-instanced `Model` becomes the node's primary content
* every other component `View` wraps the current subtree

Custom component `View`s use normal React Three Fiber composition with `children`.

For agent-authored custom meshes, use `BufferGeometry` with flat numeric arrays:

```json
{
  "id": "triangle",
  "components": {
    "bufferGeometry": {
      "type": "BufferGeometry",
      "properties": {
        "positions": [0, 0, 0, 1, 0, 0, 0, 1, 0],
        "indices": [0, 1, 2],
        "computeVertexNormals": true
      }
    },
    "material": {
      "type": "Material",
      "properties": { "color": "#ff8844" }
    }
  }
}
```

## Prefab Format

```ts
interface Prefab {
  id?: string;
  name?: string;
  root: GameObject;
}

interface GameObject {
  id: string;
  name?: string;
  disabled?: boolean;
  locked?: boolean;
  components?: Record<string, { type: string; properties: any }>;
  children?: GameObject[];
}
```

## Runtime Mutation

Use the editor or root ref for scene-native object access, and the `Scene` mutation methods for authored data changes.

```tsx
import { useEffect, useRef } from "react";
import { PrefabEditor, type PrefabEditorRef } from "react-three-game";

function RaiseBall() {
  const editorRef = useRef<PrefabEditorRef>(null);

  useEffect(() => {
    editorRef.current?.update("ball", (node) => ({
      ...node,
      components: {
        ...node.components,
        transform: {
          type: "Transform",
          properties: {
            ...node.components?.transform?.properties,
            position: [0, 8, 0],
          },
        },
      },
    }));
  }, []);

  return <PrefabEditor ref={editorRef} initialPrefab={prefab} />;
}
```

For live Three.js access, use mounted objects directly:

```tsx
const ball = editorRef.current?.getObject("ball");
ball?.rotateY(0.5);
```

For runtime integrations that need to react to authored scene changes, subscribe through the prefab store:

```tsx
import { usePrefabStoreApi } from "react-three-game";

const store = usePrefabStoreApi();
const stop = store.subscribe(
  (s) => s.nodesById,
  (next, prev) => console.log("scene changed", next, prev),
);

stop();
```

For runtime-owned imperative state, register node-local handles instead of reaching for ad hoc globals:

```tsx
import { useEffect } from "react";
import { useAssetRuntime, useNode, useNodeHandle } from "react-three-game";

function SpinnerView({ children }: { children?: React.ReactNode }) {
  const { nodeId } = useNode();
  const { registerHandle } = useAssetRuntime();

  useEffect(() => {
    const handle = {
      setSpeed(next: number) {
        console.log("speed", next);
      },
    };

    registerHandle(nodeId, "spinner", handle);
    return () => registerHandle(nodeId, "spinner", null);
  }, [nodeId, registerHandle]);

  return <>{children}</>;
}

function SpinnerStatus() {
  const spinnerRef = useNodeHandle<{ setSpeed: (next: number) => void }>("spinner");

  useEffect(() => {
    spinnerRef.current?.setSpeed(2);
  }, [spinnerRef]);

  return null;
}
```

Mounted node metadata is mirrored onto the canonical Three.js wrapper object:

* `GameObject.id` -> `object.userData.prefabNodeId`
* `GameObject.name` -> `object.name` and `object.userData.prefabNodeName`
* `Data.properties.data` -> merged into `object.userData`

That gives you a stable authored id for traversal-based integrations, while still making Three.js name lookup convenient:

```tsx
const playerByName = editorRef.current?.root?.getObjectByName("Player");
const playerById = editorRef.current?.root?.getObjectByProperty("userData.prefabNodeId", "player");
```

Treat names as a convenience surface, with stable ids as the primary lookup key:

* `editorRef.current?.getObject(id)` is the clearest stable authored-node lookup
* names are not guaranteed unique
* traversal metadata is applied to the prefab node transform object — the inner mesh or model child is one level deeper

You can author extra `userData` from the editor with a `Data` component:

```json
{
  "data": {
    "faction": "enemy",
    "health": 100,
    "loot": { "table": "crate" }
  }
}
```

Custom component `View`s use normal React and R3F behavior — `useFrame`, refs, and native Three.js APIs.

## Useful Exports

* `GameCanvas`, `PrefabRoot`, `PrefabEditor`, `PrefabEditorMode`
* `Prefab`, `GameObject`, `ComponentData`, `PrefabNode`, `PrefabEditorRef`, `Scene`
* `registerComponent`, `Component`, `ComponentViewProps`, `FieldDefinition`
* `useScene`, `useEditorRef`, `useEditorContext`
* `useNode`, `useNodeObject`, `useNodeHandle`, `useAssetRuntime`
* `usePrefabStore`, `usePrefabStoreApi`
* `gameEvents`, `useGameEvent`, `useClickEvent`
* `loadJson`, `saveJson`, `loadFiles`, `loadModel`, `loadTexture`, `loadSound`
* `exportGLB`, `exportGLBData`, `regenerateIds`, `computeParentWorldMatrix`
* `ground`, `soundManager`
* `FieldRenderer`, `Vector3Field`, `NumberField`, `StringField`, `BooleanField`, `SelectField`, `ColorField`

## Development

```bash
npm run dev
npm run build
npm run release
```

## License

PFYL / VPL
