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

Extend the engine by registering your own components. Components have two parts:
- **Editor**: UI for inspector panel (edit mode)
- **View**: Three.js runtime renderer (play mode)

### Component Interface

```typescript
import { Component } from 'react-three-game';

interface Component {
  name: string;
  Editor: FC<{ component: any; onUpdate: (newComp: any) => void }>;
  View?: FC<{ properties: any; children?: React.ReactNode }>;
  defaultProperties: any;
}
```

### Example: Rotator Component

```tsx
import { Component, registerComponent } from 'react-three-game';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

const RotatorComponent: Component = {
  name: 'Rotator',
  
  Editor: ({ component, onUpdate }) => (
    <div>
      <label>Speed</label>
      <input 
        type="number"
        value={component.properties.speed ?? 1.0}
        onChange={e => onUpdate({ ...component.properties, speed: parseFloat(e.target.value) })}
      />
      <label>Axis</label>
      <select 
        value={component.properties.axis ?? 'y'}
        onChange={e => onUpdate({ ...component.properties, axis: e.target.value })}
      >
        <option value="x">X</option>
        <option value="y">Y</option>
        <option value="z">Z</option>
      </select>
    </div>
  ),
  
  View: ({ properties, children }) => {
    const ref = useRef();
    const speed = properties.speed ?? 1.0;
    const axis = properties.axis ?? 'y';
    
    useFrame((state, delta) => {
      if (ref.current) {
        ref.current.rotation[axis] += delta * speed;
      }
    });
    
    return <group ref={ref}>{children}</group>;
  },
  
  defaultProperties: { speed: 1.0, axis: 'y' }
};

// Register before using PrefabEditor
registerComponent(RotatorComponent);
```

### Usage in Prefab JSON

```json
{
  "id": "spinning-cube",
  "components": {
    "transform": { "type": "Transform", "properties": { "position": [0, 1, 0] } },
    "geometry": { "type": "Geometry", "properties": { "geometryType": "box" } },
    "material": { "type": "Material", "properties": { "color": "#ff6b6b" } },
    "rotator": { "type": "Rotator", "properties": { "speed": 2.0, "axis": "y" } }
  }
}
```

### Wrapper vs Leaf Components

**Wrapper components** (accept `children`) wrap the rendered content:
- Use for behaviors that need to manipulate the scene graph (animations, controllers)
- Example: Rotator wraps mesh to apply rotation

**Leaf components** (no `children`) render as siblings:
- Use for standalone effects (lights, particles, audio sources)
- Example: SpotLight renders a `<spotLight>` element

The engine automatically detects component type by checking if `View` accepts `children` prop.

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
- TransformControls extract world matrix → compute parent inverse → derive new local transform

### GPU Instancing
Enable with `model.properties.instanced = true` for optimized repeated geometry. Uses drei's `<Merged>` + `<InstancedRigidBodies>`.

### Model Loading
Supports GLB/GLTF (with Draco compression) and FBX. Models auto-load when `model.properties.filename` is detected.

## Patterns

### Load External Prefabs
```jsx
import levelData from './prefabs/arena.json';
<PrefabRoot data={levelData} />
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
