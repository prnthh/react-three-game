# react-three-game

![Scene Editor](assets/editor.gif)

JSON-first 3D game engine for React Three Fiber.

Built on top of [three.js](https://github.com/mrdoob/three.js), [@react-three/fiber](https://github.com/pmndrs/react-three-fiber), and [@react-three/rapier](https://github.com/pmndrs/react-three-rapier).

* **🧱 Prefabs** - Save scenes as serializable JSON and load them on their own or inside other scenes.
* **🎬 Scene Editor** - Edit prefabs visually with hierarchy, inspector, transform gizmos, and play mode.
* **⚛️ Physics** - Author rigid bodies directly in prefab data and run them through Rapier.
* **🧩 Components** - Build scenes from reusable `GameObject` + component composition.
* **🔧 Runtime Scene API** - Mutate the live world through `Scene`, `Entity`, and `EntityComponent` handles.
* **⚡ R3F Native** - Use normal React Three Fiber components whenever runtime behavior is clearer in code.

## Documentation

* Website: https://prnth.com/react-three-game
* Editor: https://prnth.com/react-three-game/editor

## Install

```bash
npm install react-three-game @react-three/drei @react-three/fiber @react-three/rapier three
```

## Usage

Here is a minimal example that renders a prefab inside a normal R3F app:

```tsx
import { Physics } from "@react-three/rapier";
import { GameCanvas, PrefabRoot, ground } from "react-three-game";

const prefab = {
  id: "starter-scene",
  name: "Starter Scene",
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
          physics: {
            type: "Physics",
            properties: { type: "dynamic" },
          },
        },
      },
    ],
  },
};

export default function App() {
  return (
    <GameCanvas>
      <Physics>
        <ambientLight intensity={0.8} />
        <PrefabRoot data={prefab} />
      </Physics>
    </GameCanvas>
  );
}
```

This example renders a falling sphere above a ground plane.

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

## Prefabs And Scenes

`Prefab` is the serializable pure data format.

`Scene` is the live runtime/editor world handle.

That means a saved scene is just a prefab, and the same prefab can be:

* edited directly in `PrefabEditor`
* rendered directly with `PrefabRoot`
* loaded inside another scene as reusable content

`PrefabRoot` keeps the rendering model narrow and compositional:

* `Transform` is the renderer-owned outer transform
* `Geometry` + `Material` become the primary mesh content
* non-instanced `Model` becomes the node's primary content
* `Physics` is a renderer-owned outer wrapper
* every other component `View` wraps the current subtree

Custom component `View`s use normal React Three Fiber composition with `children`.

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

Use the `Scene` API from `PrefabEditorRef` for authored state changes that should stay in prefab data.

```tsx
import { useEffect, useRef } from "react";
import { PrefabEditor, type PrefabEditorRef } from "react-three-game";

function RaiseBall() {
  const editorRef = useRef<PrefabEditorRef>(null);

  useEffect(() => {
    const transform = editorRef.current
      ?.scene
      .find("ball")
      ?.getComponent<{ position: [number, number, number] }>("Transform");

    transform?.set("position", [0, 8, 0]);
  }, []);

  return <PrefabEditor ref={editorRef} initialPrefab={prefab} />;
}
```

Batch related entity changes so they flush as one store revision:

```tsx
scene.batch(() => {
  scene.find("orb1")?.getComponent("Transform")?.set("position", [1, 0, 0]);
  scene.find("orb2")?.getComponent("Transform")?.set("position", [-1, 0, 0]);
});
```

Define a component runtime factory with `create(ctx)` for hot runtime behavior that mutates the live Three.js object directly:

```tsx
import type { Component } from "react-three-game";

const Rotator: Component = {
  name: "Rotator",
  Editor: () => null,
  defaultProperties: { speed: 1 },
  create(ctx) {
    return {
      update(dt) {
        const speed = ctx.component.get<number>("speed") ?? 1;
        ctx.object.rotation.y += dt * speed;
      },
    };
  },
};
```

`View` handles composition and rendering. `create(ctx)` handles imperative runtime behavior.

## Useful Exports

* `GameCanvas`
* `PrefabRoot`
* `PrefabEditor`
* `PrefabEditorMode`
* `Prefab`
* `GameObject`
* `Scene`
* `Entity`
* `EntityComponent`
* `registerComponent`
* `createPrefabStore`
* `usePrefabStoreApi`
* `useAssetRuntime()` / `useEntityRuntime()`
* `useEntityObjectRef()` / `useEntityRigidBodyRef()`
* `ground(...)`
* `loadJson()` / `saveJson()`
* `loadModel()` / `loadTexture()`
* `loadSound()` / `loadFiles()`
* `exportGLB()`
* `computeParentWorldMatrix()`

## Development

```bash
npm run dev
npm run build
npm run release
```

## License

VPL