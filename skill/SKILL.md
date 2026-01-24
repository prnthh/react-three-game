# react-three-game

A Claude Code skill for working with react-three-game, a JSON-first 3D game engine built on React Three Fiber, WebGPU, and Rapier Physics.

## When to Use This Skill

Use this skill when:
- Creating or modifying 3D game scenes with react-three-game
- Working with prefab JSON structures
- Setting up physics-enabled game objects
- Creating custom components with editor UI (see Editor Mode section)

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
| Material | `Material` | `color`, `texture?`, `metalness?`, `roughness?`, `repeat?`, `repeatCount?` |
| Physics | `Physics` | `type`: "dynamic" or "fixed" |
| Model | `Model` | `filename` (GLB/FBX path), `instanced?` for GPU batching |
| SpotLight | `SpotLight` | `color`, `intensity`, `angle`, `penumbra`, `distance?`, `castShadow?` |
| DirectionalLight | `DirectionalLight` | `color`, `intensity`, `castShadow?`, `targetOffset?: [x,y,z]` |
| Text | `Text` | `text`, `font`, `size`, `depth`, `width`, `align`, `color` |

### Geometry Args by Type

| geometryType | args array |
|--------------|------------|
| `box` | `[width, height, depth]` |
| `sphere` | `[radius, widthSegments, heightSegments]` |
| `plane` | `[width, height]` |
| `cylinder` | `[radiusTop, radiusBottom, height, radialSegments]` |

### Material Texture Options

```json
{
  "type": "Material",
  "properties": {
    "color": "white",
    "texture": "/textures/path/to/texture.png",
    "repeat": true,
    "repeatCount": [4, 4]
  }
}
```

- Use `"color": "white"` with textures for accurate texture colors
- `repeatCount: [x, y]` tiles the texture; match to geometry dimensions for proper scaling

### Rotation Reference

Rotations use radians. Common values:
- `1.57` = 90° (π/2)
- `3.14` = 180° (π)
- `-1.57` = -90° (rotate plane flat: `rotation: [-1.57, 0, 0]`)

## Common Patterns

### Usage Modes

The library supports two modes:

**Play Mode** (default) - Immediate rendering without any editor UI. Use `GameCanvas` with `PrefabRoot` for a clean game experience.

**Editor Mode** - Visual GUI using `PrefabEditor` for scene inspection and custom component development. See the [Editor Mode](#editor-mode) section at the end of this document.

### Basic Scene Setup (Play Mode)

```jsx
import { Physics } from '@react-three/rapier';
import { GameCanvas, PrefabRoot } from 'react-three-game';

<GameCanvas>
  <Physics>
    <PrefabRoot data={prefabData} />
  </Physics>
</GameCanvas>
```

### Tree Manipulation Utilities

```typescript
import { findNode, updateNode, updateNodeById, deleteNode, cloneNode } from 'react-three-game';

// Update a node by ID (optimized - avoids unnecessary object creation)
const updated = updateNodeById(root, nodeId, node => ({ ...node, disabled: true }));

// Find a node
const node = findNode(root, nodeId);

// Delete a node
const afterDelete = deleteNode(root, nodeId);

// Clone a node
const cloned = cloneNode(node);
```

## Building Game Levels

### Complete Prefab Structure

```json
{
  "id": "level-id",
  "name": "Level Name",
  "root": {
    "id": "root",
    "enabled": true,
    "visible": true,
    "components": { ... },
    "children": [ ... ]
  }
}
```

### Floor/Ground Pattern

```json
{
  "id": "main-floor",
  "components": {
    "transform": { "type": "Transform", "properties": { "position": [0, -0.5, 0] } },
    "geometry": { "type": "Geometry", "properties": { "geometryType": "box", "args": [40, 1, 40] } },
    "material": { "type": "Material", "properties": { "color": "white", "texture": "/textures/GreyboxTextures/greybox_dark_grid.png", "repeat": true, "repeatCount": [20, 20] } },
    "physics": { "type": "Physics", "properties": { "type": "fixed" } }
  }
}
```

### Platform Pattern

Floating platforms use "fixed" physics and smaller box geometry:

```json
{
  "id": "platform-1",
  "components": {
    "transform": { "type": "Transform", "properties": { "position": [-8, 2, -5] } },
    "geometry": { "type": "Geometry", "properties": { "geometryType": "box", "args": [6, 0.5, 4] } },
    "material": { "type": "Material", "properties": { "color": "white", "texture": "/textures/GreyboxTextures/greybox_teal_grid.png", "repeat": true, "repeatCount": [3, 2] } },
    "physics": { "type": "Physics", "properties": { "type": "fixed" } }
  }
}
```

### Ramp Pattern

Rotate on the Z-axis to create inclined surfaces:

```json
{
  "id": "ramp",
  "components": {
    "transform": { "type": "Transform", "properties": { "position": [-12, 1, -5], "rotation": [0, 0, 0.3] } },
    "geometry": { "type": "Geometry", "properties": { "geometryType": "box", "args": [5, 0.3, 3] } },
    "physics": { "type": "Physics", "properties": { "type": "fixed" } }
  }
}
```

### Wall Pattern

Tall thin boxes positioned at boundaries:

```json
{
  "id": "wall-back",
  "components": {
    "transform": { "type": "Transform", "properties": { "position": [0, 3, -20] } },
    "geometry": { "type": "Geometry", "properties": { "geometryType": "box", "args": [40, 7, 1] } },
    "physics": { "type": "Physics", "properties": { "type": "fixed" } }
  }
}
```

### Three-Point Lighting Setup

Good lighting uses main, fill, and accent lights:

```json
[
  { "id": "main-light", "components": { "transform": { "properties": { "position": [10, 15, 10] } }, "spotlight": { "type": "SpotLight", "properties": { "color": "#ffffff", "intensity": 200, "angle": 0.8, "castShadow": true } } } },
  { "id": "fill-light", "components": { "transform": { "properties": { "position": [-10, 12, -5] } }, "spotlight": { "type": "SpotLight", "properties": { "color": "#b0c4de", "intensity": 80, "angle": 0.9 } } } },
  { "id": "accent-light", "components": { "transform": { "properties": { "position": [0, 10, -15] } }, "spotlight": { "type": "SpotLight", "properties": { "color": "#ffd700", "intensity": 50, "angle": 0.4 } } } }
]
```

### Available Greybox Textures

Located in `/textures/GreyboxTextures/`:
- `greybox_dark_grid.png` - dark floors
- `greybox_light_grid.png` - light surfaces
- `greybox_teal_grid.png`, `greybox_purple_grid.png`, `greybox_orange_grid.png` - colored platforms
- `greybox_red_grid.png`, `greybox_blue_grid.png` - obstacles/hazards
- `greybox_yellow_grid.png`, `greybox_lime_grid.png`, `greybox_green_grid.png` - special areas

### Metallic/Special Materials

For goal platforms or special objects, use metalness and roughness:

```json
{
  "type": "Material",
  "properties": {
    "color": "#FFD700",
    "metalness": 0.8,
    "roughness": 0.2
  }
}
```

### Text Component

3D text rendering using `three-text`. The Text component is non-composable (cannot have children).

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `text` | string | `"Hello World"` | Text content to display |
| `color` | string | `"#888888"` | Text color (hex or CSS color) |
| `font` | string | `"/fonts/NotoSans-Regular.ttf"` | Path to TTF font file |
| `size` | number | `0.5` | Font size in world units |
| `depth` | number | `0` | 3D extrusion depth (0 for flat text) |
| `width` | number | `5` | Text block width for wrapping/alignment |
| `align` | string | `"center"` | Horizontal alignment: `"left"`, `"center"`, `"right"` |

```json
{
  "id": "title-text",
  "components": {
    "transform": { "type": "Transform", "properties": { "position": [0, 3, 0] } },
    "text": {
      "type": "Text",
      "properties": {
        "text": "Welcome",
        "color": "#ffffff",
        "size": 1,
        "depth": 0.1,
        "align": "center"
      }
    }
  }
}
```

### Model Placement

GLB models don't need geometry/material components:

```json
{
  "id": "tree-1",
  "components": {
    "transform": { "type": "Transform", "properties": { "position": [-12, 0, 10], "scale": [1.5, 1.5, 1.5] } },
    "model": { "type": "Model", "properties": { "filename": "models/environment/tree.glb" } }
  }
}
```

Available models: `models/environment/tree.glb`, `models/environment/servers.glb`, `models/environment/cubeart.glb`

## Editor Mode

Use editor mode when building scenes visually or creating custom components with inspector UI.

### Using the Visual Editor

```jsx
import { PrefabEditor } from 'react-three-game';

<PrefabEditor
  initialPrefab={sceneData}
  onPrefabChange={setSceneData}
/>
```

The editor provides a full GUI with:
- Scene hierarchy tree for navigating and selecting objects
- Component inspector panel for editing properties
- Transform gizmos for manipulating objects visually
- Keyboard shortcuts: **T** (Translate), **R** (Rotate), **S** (Scale)

### Programmatic Updates with PrefabEditor

Use the editor ref to update prefabs programmatically:

```jsx
import { useRef } from 'react';
import { PrefabEditor, updateNodeById } from 'react-three-game';
import type { PrefabEditorRef, Prefab } from 'react-three-game';

function Game() {
  const editorRef = useRef<PrefabEditorRef>(null);

  const movePlayer = () => {
    if (!editorRef.current) return;
    const prefab = editorRef.current.prefab;
    const newRoot = updateNodeById(prefab.root, "player", node => ({
      ...node,
      components: {
        ...node.components,
        transform: {
          ...node.components!.transform!,
          properties: { ...node.components!.transform!.properties, position: [5, 0, 0] }
        }
      }
    }));
    editorRef.current.setPrefab({ ...prefab, root: newRoot });
  };

  return (
    <PrefabEditor ref={editorRef} initialPrefab={sceneData}>
      {/* Children render inside the Canvas - can use useFrame here */}
    </PrefabEditor>
  );
}
```

The `PrefabEditorRef` provides:
- `prefab` - current prefab state
- `setPrefab(prefab)` - update the prefab
- `screenshot()` - save canvas as PNG
- `exportGLB()` - export scene as GLB

### Live Node Updates with useFrame

To animate objects by updating the prefab JSON at runtime, pass a child component to `PrefabEditor` that uses `useFrame`:

```tsx
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { PrefabEditor, updateNodeById } from "react-three-game";
import type { Prefab, PrefabEditorRef } from "react-three-game";

// Animation component runs inside the editor's Canvas
function PlayerAnimator({ editorRef }: { editorRef: React.RefObject<PrefabEditorRef | null> }) {
  const velocityRef = useRef({ x: 0, z: 0 });

  useFrame(() => {
    if (!editorRef.current) return;

    const prefab = editorRef.current.prefab;
    const newRoot = updateNodeById(prefab.root, "player", (node) => {
      const transform = node.components?.transform?.properties;
      if (!transform) return node;

      const pos = transform.position as [number, number, number];
      return {
        ...node,
        components: {
          ...node.components,
          transform: {
            ...node.components!.transform!,
            properties: {
              ...transform,
              position: [pos[0] + velocityRef.current.x * 0.02, pos[1], pos[2] + velocityRef.current.z * 0.02],
            },
          },
        },
      };
    });

    if (newRoot !== prefab.root) {
      editorRef.current.setPrefab({ ...prefab, root: newRoot });
    }
  });

  return null;
}

// Usage
function Game() {
  const editorRef = useRef<PrefabEditorRef>(null);

  return (
    <PrefabEditor ref={editorRef} initialPrefab={sceneData}>
      <PlayerAnimator editorRef={editorRef} />
    </PrefabEditor>
  );
}
```

Key points:
- Pass animation components as `children` to `PrefabEditor` - they render inside the Canvas
- Access prefab via `editorRef.current.prefab` and update via `editorRef.current.setPrefab()`
- `updateNodeById` is optimized to avoid recreating unchanged branches
- Store mutable state (velocities, timers) in refs to avoid re-renders

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
