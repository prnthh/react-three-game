# react-three-game

Component-based 3D game engine where everything is JSON. Built on React Three Fiber + WebGPU.

```bash
npm i react-three-game @react-three/fiber three
```

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)

![Prefab Editor](assets/editor.gif)

## Core Principle

Scenes are JSON prefabs. Components are registered modules. Hierarchy is declarative.

```jsx
  <PrefabRoot data={{
      root: {
          id: "cube",
          components: {
              transform: { type: "Transform", properties: { position: [0, 1, 0] } },
              geometry: { type: "Geometry", properties: { geometryType: "box" } },
              material: { type: "Material", properties: { color: "green" } },
              physics: { type: "Physics", properties: { type: "dynamic" } }
          }
      }
  }} />
```

## Styling

The prefab editor UI ships with **inline styles** (no Tailwind / CSS framework required). That means you can install and render it without any additional build-time CSS configuration.

If you want to fully restyle the editor, you can:
- Wrap `PrefabEditor` in your own layout and override positioning.
- Fork/compose the editor UI components (they’re plain React components).

## Quick Start

```bash
npm install react-three-game @react-three/fiber @react-three/rapier three
```

```jsx
import { Physics } from '@react-three/rapier';
import { GameCanvas, PrefabRoot } from 'react-three-game';

export default function App() {
  return (
    <GameCanvas>
      <Physics>
        <ambientLight intensity={0.8} />
        <PrefabRoot
          data={{
              id: "scene",
              name: "scene",
              root: {
                  id: "root",
                  children: [
                      {
                          id: "ground",
                          components: {
                              transform: { type: "Transform", properties: { position: [0, 0, 0], rotation: [-1.57, 0, 0] } },
                              geometry: { type: "Geometry", properties: { geometryType: "plane", args: [50, 50] } },
                              material: { type: "Material", properties: { color: "green" } },
                              physics: { type: "Physics", properties: { type: "fixed" } }
                          }
                      },
                      {
                          id: "player",
                          components: {
                              transform: { type: "Transform", properties: { position: [0, 2, 0] } },
                              geometry: { type: "Geometry", properties: { geometryType: "sphere" } },
                              material: { type: "Material", properties: { color: "#ff6b6b" } },
                              physics: { type: "Physics", properties: { type: "dynamic" } }
                          }
                      }
                  ]
              }
          }}
      />
      </Physics>
    </GameCanvas>
  );
}
```

## GameObject Structure

```typescript
interface GameObject {
  id: string;
  disabled?: boolean;
  hidden?: boolean;
  components: {
    transform?: TransformComponent;
    geometry?: GeometryComponent;
    material?: MaterialComponent;
    physics?: PhysicsComponent;
    model?: ModelComponent;
  };
  children?: GameObject[];
}
```

## Custom Components

```tsx
import { Component } from 'react-three-game';

const LaserComponent: Component = {
  name: 'Laser',
  Editor: ({ component, onUpdate }) => (
    <input 
      value={component.properties.damage} 
      onChange={e => onUpdate({ damage: +e.target.value })}
    />
  ),
  View: ({ properties }) => (
    <pointLight color="red" intensity={properties.damage} />
  ),
  defaultProperties: { damage: 10 }
};

// Register
import { registerComponent } from 'react-three-game';
registerComponent(LaserComponent);
```

## Built-in Components

| Component | Properties |
|-----------|-----------|
| **Transform** | `position: [x,y,z]`, `rotation: [x,y,z]`, `scale: [x,y,z]` |
| **Geometry** | `geometryType: "box"\|"sphere"\|"plane"\|"cylinder"`, `args: number[]` |
| **Material** | `color: string`, `texture?: string`, `metalness?: number`, `roughness?: number` |
| **Physics** | `type: "dynamic"\|"fixed"` |
| **Model** | `filename: string`, `instanced?: boolean` |
| **SpotLight** | `color: string`, `intensity: number`, `angle: number`, `penumbra: number` |

## Prefab Editor

```jsx
import { PrefabEditor } from 'react-three-game';

export default function EditorPage() {
  return <PrefabEditor />;
}
```

Transform gizmos (T/R/S keys), drag-to-reorder tree, import/export JSON, edit/play toggle.

## Implementation Details

### Transform Hierarchy
- Local transforms stored in JSON (relative to parent)
- World transforms computed at runtime via matrix multiplication
- `computeParentWorldMatrix(root, targetId)` traverses tree for parent's world matrix
- TransformControls extract world matrix → compute parent inverse → derive new local transform

### GPU Instancing
Enable with `model.properties.instanced = true`:
```json
{
  "components": {
    "model": { 
      "type": "Model", 
      "properties": { 
        "filename": "tree.glb",
        "instanced": true
      }
    }
  }
}
```
Uses drei's `<Merged>` + `<InstancedRigidBodies>` for physics. World-space transforms, terminal nodes.

### Model Loading
- Supports GLB/GLTF (Draco compression) and FBX
- Singleton loaders in `modelLoader.ts`
- Draco decoder from `https://www.gstatic.com/draco/v1/decoders/`
- Auto-loads when `model.properties.filename` detected

### WebGPU Renderer
```tsx
<Canvas gl={async ({ canvas }) => {
  const renderer = new WebGPURenderer({ canvas, shadowMap: true });
  await renderer.init(); // Required
  return renderer;
}}>
```
Use `MeshStandardNodeMaterial` not `MeshStandardMaterial`.

## Patterns

### Load External Prefabs
```jsx
import levelData from './prefabs/arena.json';
<PrefabRoot data={levelData} />
```

### Mix with React Components
```jsx
<Physics>
  <PrefabRoot data={environment} />
  <Player />
  <AIEnemies />
</Physics>
```

### Update Prefab Nodes
```typescript
function updatePrefabNode(root: GameObject, id: string, update: (node: GameObject) => GameObject): GameObject {
  if (root.id === id) return update(root);
  if (root.children) {
    return { ...root, children: root.children.map(child => updatePrefabNode(child, id, update)) };
  }
  return root;
}
```

## AI Agent Reference

### Prefab JSON Schema
```typescript
{
  "id": "unique-id",
  "root": {
    "id": "root-id",
    "components": {
      "transform": {
        "type": "Transform",
        "properties": {
          "position": [x, y, z],      // world units
          "rotation": [x, y, z],      // radians
          "scale": [x, y, z]          // multipliers
        }
      },
      "geometry": {
        "type": "Geometry",
        "properties": {
          "geometryType": "box" | "sphere" | "plane" | "cylinder" | "cone" | "torus",
          "args": [/* geometry-specific */]
        }
      },
      "material": {
        "type": "Material",
        "properties": {
          "color": "#rrggbb",
          "texture": "/path/to/texture.jpg",
          "metalness": 0.0-1.0,
          "roughness": 0.0-1.0
        }
      },
      "physics": {
        "type": "Physics",
        "properties": {
          "type": "dynamic" | "fixed"
        }
      },
      "model": {
        "type": "Model",
        "properties": {
          "filename": "/models/asset.glb",
          "instanced": true
        }
      }
    },
    "children": [/* recursive GameObjects */]
  }
}
```

## Development

```bash
git clone https://github.com/prnthh/react-three-game.git
cd react-three-game
npm install
npm run dev     # tsc --watch + Next.js docs
npm run build   # TypeScript → /dist
npm publish     # publish to npm
```

Project structure:
```
/src              → library source
  /shared         → GameCanvas
  /tools
    /prefabeditor → editor + PrefabRoot
/docs             → Next.js site
  /app            → demo pages
```

## Tech Stack

React 19 • Three.js r181 • TypeScript 5 • WebGPU • Rapier Physics

## License

MIT © [prnth](https://github.com/prnthh)
