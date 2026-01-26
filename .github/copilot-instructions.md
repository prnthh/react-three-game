# react-three-game - AI Coding Agent Instructions

## Project Overview
AI-native 3D game engine where **scenes are JSON prefabs**. Unity-like GameObject+Component architecture built on React Three Fiber + WebGPU.

## Monorepo Structure
- **`/src`** → Library source, builds to `/dist`, published as `react-three-game`
- **`/docs`** → Next.js 16 site, imports library via `"react-three-game": "file:.."`
- **`npm run dev`** → Runs `tsc --watch` + Next.js concurrently (hot reload works)

## Prefab JSON Schema
```typescript
// See docs/app/samples/*.json for examples
interface Prefab { id?: string; name?: string; root: GameObject; }
interface GameObject {
  id: string;                    // Use crypto.randomUUID() for new nodes
  disabled?: boolean;
  components?: Record<string, { type: string; properties: any }>;
  children?: GameObject[];
}
```
**Transforms are LOCAL** (parent-relative). Rotations in radians. Colors as CSS strings.

## Component System (`src/tools/prefabeditor/components/`)
Every component has `Editor` (inspector UI) + optional `View` (Three.js render):
```typescript
const MyComponent: Component = {
  name: 'MyComponent',  // TitleCase for registry, lowercase key in JSON
  Editor: ({ component, onUpdate }) => <input onChange={e => onUpdate({ value: e.target.value })} />,
  View: ({ properties, children }) => <group>{children}</group>,  // Wrapper components accept children
  defaultProperties: { value: 0 }
};
```
**To add a component:** Create file → export from `components/index.ts` → auto-registered in `PrefabRoot.tsx`.

## Key Files
| File | Purpose |
|------|---------|
| `src/index.ts` | All public exports - add new features here |
| `src/tools/prefabeditor/PrefabRoot.tsx` | Pure renderer - renders prefab as Three.js objects for R3F integration |
| `src/tools/prefabeditor/PrefabEditor.tsx` | Managed scene with editor UI and play/pause controls for physics |
| `src/tools/prefabeditor/utils.ts` | Tree helpers: `findNode`, `updateNode`, `deleteNode`, `cloneNode` |
| `src/shared/GameCanvas.tsx` | WebGPU renderer setup (use `MeshStandardNodeMaterial`) |

## Usage Modes

**GameCanvas + PrefabRoot**: Pure renderer for embedding prefab data in standard R3F applications. Minimal wrapper - just renders the prefab as Three.js objects. Requires manual `<Physics>` setup. Physics always active. Use this to integrate prefabs into larger R3F scenes.

**PrefabEditor**: Managed scene with editor UI and play/pause controls for physics. Full authoring tool for level design and prototyping. Includes canvas, physics, transform gizmos, and inspector. Physics only runs in play mode. Can pass R3F components as children.

## Critical Patterns

### Tree Manipulation (Immutable)
```typescript
import { updateNode, findNode, deleteNode } from 'react-three-game';
const newRoot = updateNode(root, nodeId, node => ({ ...node, components: { ...node.components, physics: {...} } }));
```

### WebGPU Materials
Use node materials only: `MeshStandardNodeMaterial`, `MeshBasicNodeMaterial` (not `MeshStandardMaterial`).

### Physics Wrapping
`PhysicsComponent.View` wraps children in `<RigidBody>` only when `editMode=false`. Edit mode pauses physics.

### Model Instancing
Set `model.properties.instanced = true` → uses `InstanceProvider.tsx` for batched rendering with physics.

## Built-in Components
`Transform`, `Geometry` (box/sphere/plane/cylinder), `Material` (color/texture), `Physics` (dynamic/fixed), `Model` (GLB/FBX), `SpotLight`, `DirectionalLight`, `AmbientLight`, `Text`

## Custom Components (User-space)
See `docs/app/demo/editor/RotatorComponent.tsx` for runtime behavior example using `useFrame`. Register with `registerComponent()` before rendering `<PrefabEditor>`.

## Development Workflow
1. **Edit library**: Modify `/src`, auto-rebuilds via `tsc --watch`
2. **Test in docs**: Changes reflect at `http://localhost:3000`
3. **Add sample prefabs**: `docs/app/samples/*.json`
4. **Release**: `npm run release` (builds + publishes)

## Conventions
- Component keys: lowercase in JSON (`"transform"`), TitleCase in registry (`"Transform"`)
- Asset paths: Relative to `/public` (e.g., `models/cars/taxi/model.glb`)
- All Three.js renders must be inside `<GameCanvas>` (WebGPU init required)
