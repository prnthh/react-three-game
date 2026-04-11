# react-three-game - AI Coding Agent Instructions

## Project Overview
AI-native 3D game engine where **scenes are JSON prefabs**. Unity-like GameObject+Component architecture built on React Three Fiber + WebGPU. Zustand-backed normalized store for fast scene mutations.

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
  locked?: boolean;
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
| `src/index.ts` | All public exports (explicit, no wildcards) |
| `src/tools/prefabeditor/prefabStore.ts` | Zustand store — normalized scene state (nodesById, childIdsById, parentIdById) |
| `src/tools/prefabeditor/sceneApi.ts` | Unity-style Scene/Entity/EntityComponent handle API |
| `src/tools/prefabeditor/PrefabRoot.tsx` | Pure renderer — subscribe-per-node via `usePrefabNode` |
| `src/tools/prefabeditor/PrefabEditor.tsx` | Managed editor: canvas, physics, gizmos, inspector, undo/redo |
| `src/tools/prefabeditor/utils.ts` | IO helpers: `loadJson`, `saveJson`, `exportGLB`, `computeParentWorldMatrix` |
| `src/tools/prefabeditor/GameEvents.ts` | Typed pub/sub for physics and custom game events |
| `src/shared/GameCanvas.tsx` | WebGPU renderer setup (use `MeshStandardNodeMaterial`) |

## Usage Modes

**PrefabRoot**: Pure renderer for embedding prefab data in standard R3F applications. Render it inside a `<Canvas>` with `<Physics>` wrapper for physics. Accepts `scene` prop (static prefab) or `store` prop (external Zustand store).

**PrefabEditor**: Managed editor with inspector, tree, transform gizmos, play/pause, undo/redo. Exposes `PrefabEditorRef` with `scene` (Scene API), `save()`, `load()`, `addModel()`, `addTexture()`.

## Scene Data Architecture

### Normalized Store (prefabStore.ts)
The store normalizes the recursive `GameObject` tree into flat maps for O(1) lookups:
- `nodesById` — every node record (without children)
- `childIdsById` — ordered child IDs per node
- `parentIdById` — parent lookup

Mutations (`updateNode`, `addChild`, `deleteNode`, `duplicateNode`, `moveNode`) produce new object references for changed maps only — untouched nodes stay identity-stable for React memoization.

### Scene API (sceneApi.ts)
Unity-style imperative handles for runtime mutation:
```typescript
const scene: Scene = editorRef.current.scene;
scene.rootId;                                    // root node ID
scene.find("ball-id")                            // by ID → Entity | null
  ?.getComponent<{ position: number[] }>("Transform")
  ?.set("position", [0, 5, 0]);
scene.create("Cube", {                            // auto UUID + Transform
  geometry: { type: "Geometry", properties: { geometryType: "box" } },
});
scene.add(newNode, { parentId: "root" });         // spawn entity from full GameObject
scene.remove("ball-id");                          // delete entity by ID
entity.addComponent("Physics", { type: "dynamic" }); // add component
entity.removeComponent("Physics");                // remove component
entity.destroy();                                 // self-remove
entity.name;                                      // readonly name
entity.enabled;                                   // !disabled
entity.parent;                                    // parent Entity | null
entity.children;                                  // child Entity[]
scene.update("ball-id", node => ({ ...node, ... })); // whole-node update
scene.update({ id1: fn1, id2: fn2 });             // batched update
```

## Critical Patterns

### Per-Node Reactivity
Use `usePrefabNode(id)` and `usePrefabChildIds(id)` in renderer components. These select from the store and only re-render when their specific node changes.

### WebGPU Materials
Use node materials only: `MeshStandardNodeMaterial`, `MeshBasicNodeMaterial` (not `MeshStandardMaterial`).

### Physics Wrapping
`PhysicsComponent.View` wraps children in `<RigidBody>` only when `editMode=false`. Edit mode pauses physics.

### Model Instancing
Set `model.properties.instanced = true` → uses `InstanceProvider.tsx` for batched rendering with physics.

### Game Events
```typescript
import { gameEvents, useGameEvent } from 'react-three-game';
gameEvents.emit('sensor:enter', payload);
useGameEvent('click', (payload) => { ... });
// Extend GameEventMap via module augmentation for custom typed events
```

## Built-in Components
`Transform`, `Geometry` (box/sphere/plane/cylinder), `Material` (color/texture), `Physics` (dynamic/fixed/kinematic + sensor), `Model` (GLB/FBX + instancing + repeat), `SpotLight`, `DirectionalLight`, `AmbientLight`, `Text`, `Environment`, `Camera`, `Click`

## Custom Components (User-space)
See `docs/app/demo/customcomponent/RotatorComponent.tsx` for runtime behavior using `useFrame`. Register with `registerComponent()` before rendering `<PrefabEditor>`.

## Development Workflow
1. **Edit library**: Modify `/src`, auto-rebuilds via `tsc --watch`
2. **Test in docs**: Changes reflect at `http://localhost:3000`
3. **Add sample prefabs**: `docs/app/samples/*.json`
4. **Release**: `npm run release` (builds + publishes)

## Conventions
- Component keys: lowercase in JSON (`"transform"`), TitleCase in registry (`"Transform"`)
- Asset paths: Relative to `/public` (e.g., `models/cars/taxi/model.glb`)
- All Three.js renders must be inside `<GameCanvas>` (WebGPU init required)
- Exports: Always explicit in `src/index.ts`, never `export *`
- Public API naming: `PrefabEditor`, `PrefabRoot`, `Scene`, `Entity` — internal filenames match (PrefabEditor.tsx, PrefabRoot.tsx)
