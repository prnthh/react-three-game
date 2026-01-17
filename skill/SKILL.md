# react-three-game

A Claude Code skill for working with react-three-game, a JSON-first 3D game engine built on React Three Fiber, WebGPU, and Rapier Physics.

## When to Use This Skill

Use this skill when:
- Creating or modifying 3D game scenes with react-three-game
- Working with prefab JSON structures
- Creating custom components for the game engine
- Setting up physics-enabled game objects
- Using the visual PrefabEditor

## Core Concepts

### GameObject Structure

Every game object follows this schema:

```typescript
interface GameObject {
  id: string;
  disabled?: boolean;
  hidden?: boolean;
  components?: Record<string, { type: string; properties: any }>;
  children?: GameObject[];
}
```

### Prefab JSON Format

Scenes are defined as JSON prefabs with a root node containing children:

```json
{
  "root": {
    "id": "scene",
    "children": [
      {
        "id": "my-object",
        "components": {
          "transform": { "type": "Transform", "properties": { "position": [0, 0, 0] } },
          "geometry": { "type": "Geometry", "properties": { "geometryType": "box" } },
          "material": { "type": "Material", "properties": { "color": "#ff0000" } }
        }
      }
    ]
  }
}
```

## Built-in Components

| Component | Type | Key Properties |
|-----------|------|----------------|
| Transform | `Transform` | `position: [x,y,z]`, `rotation: [x,y,z]` (radians), `scale: [x,y,z]` |
| Geometry | `Geometry` | `geometryType`: box/sphere/plane/cylinder, `args`: dimension array |
| Material | `Material` | `color`, `texture?`, `metalness?`, `roughness?` |
| Physics | `Physics` | `type`: "dynamic" or "fixed" |
| Model | `Model` | `filename` (GLB/FBX path), `instanced?` for GPU batching |
| SpotLight | `SpotLight` | `color`, `intensity`, `angle`, `penumbra` |

## Common Patterns

### Basic Scene Setup

```jsx
import { Physics } from '@react-three/rapier';
import { GameCanvas, PrefabRoot } from 'react-three-game';

<GameCanvas>
  <Physics>
    <PrefabRoot data={prefabData} />
  </Physics>
</GameCanvas>
```

### Creating a Custom Component

```tsx
import { Component, registerComponent, FieldRenderer, FieldDefinition } from 'react-three-game';

const myFields: FieldDefinition[] = [
  { name: 'speed', type: 'number', label: 'Speed', step: 0.1 },
  { name: 'enabled', type: 'boolean', label: 'Enabled' },
];

const MyComponent: Component = {
  name: 'MyComponent',
  Editor: ({ component, onUpdate }) => (
    <FieldRenderer fields={myFields} values={component.properties} onChange={onUpdate} />
  ),
  View: ({ properties, children }) => {
    // Runtime behavior here
    return <group>{children}</group>;
  },
  defaultProperties: { speed: 1, enabled: true }
};

registerComponent(MyComponent);
```

### Field Types for Editor UI

| Type | Description | Options |
|------|-------------|---------|
| `vector3` | X/Y/Z inputs | `snap?: number` |
| `number` | Numeric input | `min?`, `max?`, `step?` |
| `string` | Text input | `placeholder?` |
| `color` | Color picker | - |
| `boolean` | Checkbox | - |
| `select` | Dropdown | `options: { value, label }[]` |
| `custom` | Custom render function | `render: (props) => ReactNode` |

### Tree Manipulation Utilities

```typescript
import { findNode, updateNode, deleteNode, cloneNode } from 'react-three-game';

// Update a node by ID
const updated = updateNode(root, nodeId, node => ({ ...node, disabled: true }));

// Find a node
const node = findNode(root, nodeId);

// Delete a node
const afterDelete = deleteNode(root, nodeId);

// Clone a node
const cloned = cloneNode(node);
```

### Using the Visual Editor

```jsx
import { PrefabEditor } from 'react-three-game';

<PrefabEditor
  initialPrefab={sceneData}
  onPrefabChange={setSceneData}
/>
```

Keyboard shortcuts: **T** (Translate), **R** (Rotate), **S** (Scale)

## Dependencies

Required peer dependencies:
- `@react-three/fiber`
- `@react-three/rapier`
- `three`

Install with:
```bash
npm i react-three-game @react-three/fiber @react-three/rapier three
```

## File Structure

```
/src                 → library source (published to npm)
/docs                → Next.js demo site
/dist                → built output
```

## Development Commands

```bash
npm run dev     # tsc --watch + docs site
npm run build   # build to /dist
npm run release # build + publish
```
