# react-three-game

> **The first 3D game engine designed for AI-native development.**  
> Generate entire game scenes from natural language. Zero boilerplate, 100% declarative, fully typesafe.

```bash
npm i react-three-game @react-three/fiber three
```

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue.svg)](https://react.dev/)

---

## 🤖 Why This Exists

**Traditional 3D engines force you to write imperative code.** Unity requires C# classes. Unreal needs Blueprints. Three.js demands manual scene graph manipulation. **AI agents struggle with all of these.**

**react-three-game is different:**
- ✅ **Everything is JSON** - AI can generate complete scenes without writing code
- ✅ **Component-based architecture** - Like Unity, but declarative and serializable
- ✅ **Visual prefab editor** - Export scenes as versionable JSON files
- ✅ **Built on React Three Fiber** - Leverage the entire React ecosystem
- ✅ **WebGPU renderer** - Cutting-edge graphics with Three.js r181+

### The Problem We Solve

```jsx
// ❌ Traditional Three.js - Imperative, verbose, AI-hostile
const scene = new THREE.Scene();
const geometry = new THREE.BoxGeometry();
const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
cube.position.set(0, 1, 0);
scene.add(cube);

// Physics? Even worse...
const body = new CANNON.Body({ mass: 1 });
body.addShape(new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5)));
world.addBody(body);
// Now sync transforms every frame... 😱
```

```jsx
// ✅ react-three-game - Declarative, concise, AI-friendly
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

**Result:** AI agents can generate this JSON structure. Version control it. Modify it. No code generation required.

---

## 🚀 Quick Start

### Installation
```bash
npm install react-three-game @react-three/fiber @react-three/rapier three
```

### Your First Scene (30 seconds)

```jsx
import { GameCanvas, PrefabRoot } from 'react-three-game';

export default function App() {
  return (
    <GameCanvas>
      <ambientLight intensity={0.5} />
      <PrefabRoot data={{
        id: "scene",
        root: {
          id: "root",
          enabled: true,
          visible: true,
          components: {
            transform: {
              type: "Transform",
              properties: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }
            }
          },
          children: [
            {
              id: "floor",
              enabled: true,
              visible: true,
              components: {
                transform: { type: "Transform", properties: { position: [0, -1, 0] } },
                geometry: { type: "Geometry", properties: { geometryType: "box", args: [10, 0.5, 10] } },
                material: { type: "Material", properties: { color: "#2d5f2e" } },
                physics: { type: "Physics", properties: { type: "fixed" } }
              }
            },
            {
              id: "player",
              enabled: true,
              visible: true,
              components: {
                transform: { type: "Transform", properties: { position: [0, 2, 0] } },
                geometry: { type: "Geometry", properties: { geometryType: "sphere" } },
                material: { type: "Material", properties: { color: "#ff6b6b" } },
                physics: { type: "Physics", properties: { type: "dynamic" } }
              }
            }
          ]
        }
      }} />
    </GameCanvas>
  );
}
```

**That's it.** Physics, rendering, transforms - all declarative. No boilerplate.

---

## 🎮 Core Concepts

### 1. GameObjects & Components

Every object in your scene is a `GameObject` with modular components:

```typescript
interface GameObject {
  id: string;              // Unique identifier
  enabled: boolean;        // Active in scene?
  visible: boolean;        // Rendered?
  components: {
    transform?: TransformComponent;  // Position/rotation/scale
    geometry?: GeometryComponent;    // Box, sphere, plane, etc.
    material?: MaterialComponent;    // Color, textures, PBR properties
    physics?: PhysicsComponent;      // Rapier physics body
    model?: ModelComponent;          // Load GLB/FBX models
    // Add your own!
  };
  children?: GameObject[]; // Nested hierarchy
}
```

**This is Unity/Unreal's ECS pattern, but 100% React.**

### 2. Visual Prefab Editor

Run the built-in editor:
```jsx
import { PrefabEditor } from 'react-three-game';

<PrefabEditor />
```

- 🎨 Drag-and-drop 3D models
- 🔧 Edit transforms with gizmos
- 📦 Add/remove components
- 💾 Export JSON files
- ▶️ Toggle edit/play mode

**Pro tip:** Use this to generate scenes, then let AI modify the JSON.

### 3. Component System

Create custom components in minutes:

```tsx
// MyLaserComponent.tsx
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

export default LaserComponent;
```

Register it once, use everywhere:
```typescript
import { registerComponent } from 'react-three-game';
registerComponent(LaserComponent);
```

---

## 🏗️ Architecture

### GameObject Hierarchy
```
Scene Root
├─ Player (Dynamic Physics)
│  ├─ Camera
│  └─ Weapon (Model)
├─ Enemies (Instanced)
│  ├─ Enemy_01
│  ├─ Enemy_02
│  └─ Enemy_03
└─ Environment
   ├─ Ground (Fixed Physics)
   └─ Obstacles
```

### Transform Math (Critical!)
- **Local transforms** stored in JSON (relative to parent)
- **World transforms** computed at runtime (for rendering)
- **TransformControls** use world space, then convert back to local
- Helper: `computeParentWorldMatrix()` handles the math

### Instancing System
Render 1000s of objects efficiently:
```json
{
  "components": {
    "model": { 
      "type": "Model", 
      "properties": { 
        "filename": "tree.glb",
        "instanced": true  // ← Magic flag
      }
    }
  }
}
```
Behind the scenes: drei's `<Merged>` + `<InstancedRigidBodies>` for physics.

---

## 🎯 Real-World Example

Here's what a complete multiplayer game looks like (coming from production code):

```jsx
import { GameCanvas, PrefabRoot } from 'react-three-game';
import { Physics } from '@react-three/rapier';

export default function Game() {
  return (
    <GameCanvas>
      <Physics>
        {/* Load entire scene from JSON */}
        <PrefabRoot data={levelData} />
        
        {/* Mix with React components */}
        <Player controllable />
        <Enemy position={[5, 0, -5]} />
        <MovingPlatform path={[[0,0,0], [10,0,0]]} />
      </Physics>
      
      <ambientLight intensity={0.5} />
      <directionalLight castShadow position={[10, 10, 5]} />
    </GameCanvas>
  );
}
```

**The power:** That `levelData` JSON can be:
- 🤖 Generated by AI from a prompt
- 🎨 Created in the visual editor
- 🔄 Version controlled in git
- 🌐 Loaded from a CMS
- 🧩 Composed from smaller prefabs

---

## 📦 What's Included

### Core Exports

```typescript
import {
  // Rendering
  GameCanvas,        // WebGPU Canvas wrapper
  PrefabRoot,        // Scene renderer from JSON
  PrefabEditor,      // Visual editor component
  
  // Utils
  loadModel,         // GLB/FBX loader with Draco
  registerComponent, // Add custom components
  getComponent,      // Query component registry
  
  // Types
  Prefab,           // Prefab JSON structure
  GameObject,       // Scene node type
  Component,        // Component interface
} from 'react-three-game';
```

### Built-in Components

| Component | Properties | Description |
|-----------|-----------|-------------|
| **Transform** | `position`, `rotation`, `scale` | 3D position/orientation (always present) |
| **Geometry** | `geometryType`, `args` | Box, sphere, plane, cylinder, etc. |
| **Material** | `color`, `texture`, `metalness`, `roughness` | PBR materials with texture support |
| **Physics** | `type` (`dynamic`/`fixed`) | Rapier rigid body |
| **Model** | `filename`, `instanced` | Load GLB/FBX, toggle GPU instancing |
| **SpotLight** | `color`, `intensity`, `angle`, `penumbra` | Dynamic lighting |

**Extending:** Create custom components in 20 lines - see "Component System" above.

---

## 🎨 Visual Editor

Import and use the prefab editor:

```jsx
import { PrefabEditor } from 'react-three-game';

export default function EditorPage() {
  return <PrefabEditor />;
}
```

### Editor Features
- **📥 Import/Export** - Load/save JSON prefabs
- **🎮 Edit/Play Toggle** - Test physics in real-time
- **🔧 Transform Gizmos** - Translate/Rotate/Scale (T/R/S keys)
- **🌳 Scene Tree** - Drag to reorder, click to select
- **📋 Inspector** - Edit component properties
- **➕ Add Components** - Dropdown to attach new behaviors

### Workflow
1. Create scene in editor
2. Export JSON
3. Load in game: `<PrefabRoot data={require('./level1.json')} />`
4. Or generate variations with AI by modifying the JSON

---

## 🚀 Advanced Patterns

### Loading External Prefabs

```jsx
import levelData from './prefabs/arena.json';

<PrefabRoot data={levelData} />
```

### Mixing Prefabs with React Components

```jsx
<Physics>
  <PrefabRoot data={environment} /> {/* Static level geometry */}
  <Player />                          {/* Dynamic player logic */}
  <AIEnemies />                       {/* Procedural spawning */}
</Physics>
```

### Dynamic Instancing (1000+ Objects)

```json
{
  "id": "forest",
  "children": [
    {
      "id": "tree-1",
      "components": {
        "model": { 
          "type": "Model", 
          "properties": { 
            "filename": "tree.glb",
            "instanced": true  // ← Automatic GPU instancing
          }
        },
        "physics": { "type": "Physics", "properties": { "type": "fixed" } }
      }
    }
    // Repeat 1000x - only renders once internally
  ]
}
```

### Custom Components (Real Example)

```tsx
// LaserBeamComponent.tsx
import { Component } from 'react-three-game';
import { Line } from '@react-three/drei';

const LaserBeam: Component = {
  name: 'LaserBeam',
  
  Editor: ({ component, onUpdate }) => (
    <>
      <label>Damage</label>
      <input 
        type="number" 
        value={component.properties.damage}
        onChange={e => onUpdate({ damage: +e.target.value })}
      />
      <label>Color</label>
      <input 
        type="color"
        value={component.properties.color}
        onChange={e => onUpdate({ color: e.target.value })}
      />
    </>
  ),
  
  View: ({ properties }) => (
    <Line
      points={[[0, 0, 0], [0, 0, -10]]}
      color={properties.color}
      lineWidth={3}
    />
  ),
  
  defaultProperties: {
    damage: 25,
    color: '#ff0000'
  }
};

export default LaserBeam;
```

Then register it:
```tsx
import { registerComponent } from 'react-three-game';
import LaserBeam from './components/LaserBeam';

registerComponent(LaserBeam);
```

Now it's available in the editor dropdown AND can be serialized in prefab JSON!

---

## 🤝 Integrations

### React Three Fiber Ecosystem
All `@react-three/drei` helpers work seamlessly:

```jsx
import { OrbitControls, Sky, ContactShadows } from '@react-three/drei';

<GameCanvas>
  <Sky />
  <OrbitControls />
  <PrefabRoot data={scene} />
  <ContactShadows />
</GameCanvas>
```

### Physics (@react-three/rapier)
Wrap your scene in `<Physics>`:

```jsx
import { Physics } from '@react-three/rapier';

<Physics gravity={[0, -9.8, 0]}>
  <PrefabRoot data={level} />
</Physics>
```

Components with `physics` property automatically get rigid bodies.

---

## 🎯 For AI Agents

### Prompt Templates

**Generate a complete scene:**
```
Create a react-three-game prefab JSON for a platformer level with:
- A ground plane (10x10, fixed physics, grass texture)
- 5 floating platforms (dynamic physics)
- A player spawn point at [0, 5, 0]
- 3 collectible coins using sphere geometry
```

**Modify existing scenes:**
```
Take this prefab JSON and add:
- A spotlight pointing at the player spawn
- Convert all "box" geometry to "sphere"
- Scale all objects by 1.5x
```

**Generate component variations:**
```
Create 10 enemy prefab variants by:
- Randomizing position within bounds [[-10,10], [0,5], [-10,10]]
- Varying scale from 0.8 to 1.2
- Using colors from palette: ["#ff6b6b", "#ee5a6f", "#c44569"]
```

### JSON Structure Reference

```typescript
{
  "id": "unique-id",
  "root": {
    "id": "root-id",
    "enabled": true,
    "visible": true,
    "components": {
      "transform": {
        "type": "Transform",
        "properties": {
          "position": [x, y, z],      // Numbers in world units
          "rotation": [x, y, z],      // Radians
          "scale": [x, y, z]          // Multipliers
        }
      },
      "geometry": {
        "type": "Geometry",
        "properties": {
          "geometryType": "box" | "sphere" | "plane" | "cylinder" | "cone" | "torus",
          "args": [/* geometry-specific arguments */]
        }
      },
      "material": {
        "type": "Material",
        "properties": {
          "color": "#rrggbb" | "colorname",
          "texture": "/path/to/texture.jpg",    // Optional
          "metalness": 0.0-1.0,                 // Optional
          "roughness": 0.0-1.0                  // Optional
        }
      },
      "physics": {
        "type": "Physics",
        "properties": {
          "type": "dynamic" | "fixed"           // Dynamic = moves, Fixed = static
        }
      },
      "model": {
        "type": "Model",
        "properties": {
          "filename": "/models/asset.glb",
          "instanced": true                     // Optional: GPU instancing
        }
      }
    },
    "children": [/* Recursive GameObject array */]
  }
}
```

---

## 🛠️ Development

### Local Setup
```bash
git clone https://github.com/prnthh/react-three-game.git
cd react-three-game
npm install
npm run dev  # Runs tsc --watch + Next.js docs site
```

### Project Structure
```
/src              → Library source (exports to npm)
  /shared         → GameCanvas (WebGPU wrapper)
  /tools
    /prefabeditor → Visual editor + PrefabRoot renderer
/docs             → Next.js documentation site
  /app            → Demo pages
```

### Building
```bash
npm run build    # Compile TypeScript → /dist
npm publish      # Publish to npm
```

---

## 🌟 Roadmap

- [x] Core prefab system
- [x] Visual editor
- [x] Component registry
- [x] GPU instancing
- [x] Physics integration
- [ ] Input system (keyboard/gamepad/touch) - **Coming Soon**
- [ ] Multiplayer primitives (WebRTC sync)
- [ ] Animation system (state machines)
- [ ] Audio components (spatial sound)
- [ ] Particle effects
- [ ] AI behavior trees (as JSON!)

---

## 🤖 Why Developers AND AI Love This

### For Developers
- ✅ **Skip the boilerplate** - No manual scene graph management
- ✅ **React patterns** - Use hooks, context, state like normal React
- ✅ **Visual debugging** - See and edit your scene in real-time
- ✅ **Type safety** - Full TypeScript support
- ✅ **Hot reload** - Changes reflect instantly

### For AI Agents
- ✅ **Pure data** - No imperative code to generate
- ✅ **JSON schema** - Structured, validatable format
- ✅ **Compositional** - Build complex scenes from simple primitives
- ✅ **Version controllable** - Git-friendly text files
- ✅ **Deterministic** - Same JSON = same scene every time

---

## 📚 Examples

Check out `/docs/app/demo` for live examples:
- Basic scene with physics
- Model loading and instancing
- Custom component creation
- Multiplayer game prototype

---

## 🤝 Contributing

This is an **AI-first** project. We welcome:
- New built-in components
- Documentation improvements
- Example scenes/games
- AI prompt templates
- Bug reports

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## 📄 License

MIT © [prnth](https://github.com/prnthh)

---

## 💬 Community

- 🐦 Twitter: [@prnth](https://twitter.com/prnth)
- 💼 GitHub Issues: [Report bugs](https://github.com/prnthh/react-three-game/issues)
- 💡 Discussions: [Share ideas](https://github.com/prnthh/react-three-game/discussions)

---

**Built with:** React 19 • Three.js r181 • TypeScript 5 • WebGPU • Rapier Physics

**Status:** Alpha v0.0.1 - API may change  
**AI Prompt to Share:** "Build me a 3D game using react-three-game with [your features]"