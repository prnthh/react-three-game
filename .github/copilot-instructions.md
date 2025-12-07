# react-three-game - AI Coding Agent Instructions

## Project Mission
The **first 3D game engine designed for AI-native development**. Everything is JSON-serializable prefabs that AI agents can generate, modify, and compose without writing imperative code. Think Unity's component system meets React's declarative paradigm.

## Why This Exists (Critical Context)
Traditional 3D engines (Unity, Unreal, Three.js) require imperative code that's hard for AI to generate reliably. We solve this by making **everything pure data structures**:
- ✅ Entire scenes are JSON objects
- ✅ Components are registered modules with Editor + View separation  
- ✅ Visual prefab editor exports versionable JSON
- ✅ No manual scene graph manipulation required

## Architecture

### Dual-Structure Monorepo
- **`/src`**: Library source (TypeScript) → builds to `/dist` → published as `react-three-game` npm package
- **`/docs`**: Next.js 16 documentation site that imports library via `"react-three-game": "file:.."` in package.json
- Development command: `npm run dev` (runs `tsc --watch` + Next.js dev server concurrently via `concurrently`)
- **Hot reload works**: Changes to `/src` trigger rebuild → docs site sees updates

### Component-Based Prefab System
The core innovation is a **GameObject + Component** architecture similar to Unity/Unreal:

```typescript
// Prefab JSON structure (see src/tools/prefabeditor/samples/*.json)
{
  "id": "prefab-1",
  "root": {
    "id": "root",
    "enabled": true,
    "visible": true,
    "components": {
      "transform": { type: "Transform", properties: { position: [0,0,0], rotation: [0,0,0], scale: [1,1,1] } },
      "geometry": { type: "Geometry", properties: { geometryType: "box", args: [1,1,1] } },
      "material": { type: "Material", properties: { color: "#ffffff" } },
      "physics": { type: "Physics", properties: { type: "dynamic" } }
    },
    "children": [ /* recursive GameObject[] */ ]
  }
}
```

**AI agents can generate this entire structure from natural language prompts.**

### Component Registry Pattern (`src/tools/prefabeditor/components/`)
Every component implements:
```typescript
interface Component {
  name: string;
  Editor: FC<{ component: any; onUpdate: (newComp: any) => void }>;  // Inspector UI
  View?: FC<any>;  // Three.js runtime renderer
  defaultProperties: any;
}
```

Register in `components/index.ts` to make available in editor. Examples:
- **TransformComponent**: Position/rotation/scale (no View - handled by group wrapper)
- **PhysicsComponent**: Wraps children in `<RigidBody>` from @react-three/rapier (only in play mode)
- **MaterialComponent**: Renders as `<meshStandardNodeMaterial>` with texture support
- **ModelComponent**: Loads GLB/FBX via `modelLoader.ts`, supports instancing

### World Matrix Math (CRITICAL)
`PrefabRoot.tsx` maintains **parent-relative transforms** but uses **world matrices** for TransformControls:
- Each `GameObjectRenderer` computes `worldMatrix = parentMatrix * localMatrix`
- On transform drag: extract world matrix → compute parent inverse → derive new local transform
- Helper: `computeParentWorldMatrix(root, targetId)` traverses tree to get parent's world matrix
- **Never directly set world transforms in prefab JSON** - always store local transforms

### Instancing System (`InstanceProvider.tsx`)
Optimizes rendering of repeated models:
1. `GameInstanceProvider` flattens all model meshes into `flatMeshes` map
2. `GameInstance` component registers instance data (position/rotation/scale)
3. Provider renders once per unique mesh using `<Merged>` from drei + `<InstancedRigidBodies>`
4. Toggled by `model.properties.instanced = true` in prefab JSON
5. Physics instances use world-space transforms (not local)

## Key Files & Patterns

### `src/index.ts` - Library Exports
Main entry point for published package. When adding new features, export them here:
```typescript
export { default as GameCanvas } from './shared/GameCanvas';
export { default as PrefabEditor } from './tools/prefabeditor/PrefabEditor';
export { default as PrefabRoot } from './tools/prefabeditor/PrefabRoot';
export { DragDropLoader } from './tools/dragdrop/DragDropLoader';
// Add new exports as features are developed
```

### `PrefabEditor.tsx` - Main Editor Wrapper
- Manages edit/play mode toggle (pauses Rapier physics in edit mode)
- Handles JSON import/export via file input
- Renders `<EditorUI>` (inspector + tree) and `<PrefabRoot>` (scene renderer)

### `PrefabRoot.tsx` - Recursive Scene Renderer
Three rendering paths:
1. **Instanced nodes**: Short-circuit to `<GameInstance>` (world-space, terminal node)
2. **Model nodes**: Render as `<primitive object={clonedModel}>` with material override
3. **Geometry nodes**: Render as `<mesh>` with geometry + material components
- Always wrap in physics if component exists (except edit mode)
- Children always use relative transforms in `<group>`

### `EditorUI.tsx` + `EditorTree.tsx`
- Tree view: Drag-to-reorder via pointer events (updates parent's children array)
- Inspector: Dynamically renders component editors from registry
- Transform modes: T/R/S keyboard shortcuts handled in PrefabEditor

### `GameCanvas.tsx` - WebGPU Renderer Wrapper
Uses Three.js WebGPU renderer (not WebGL):
```tsx
<Canvas gl={async ({ canvas }) => {
  const renderer = new WebGPURenderer({ canvas, shadowMap: true });
  await renderer.init(); // MUST await initialization
  return renderer;
}}>
```
**Material nodes**: Use `MeshStandardNodeMaterial` not `MeshStandardMaterial` (extends for node materials)

## Development Workflows

### Adding New Components
1. Create `src/tools/prefabeditor/components/MyComponent.tsx`:
```typescript
const MyComponent: Component = {
  name: 'MyComponent',
  Editor: ({ component, onUpdate }) => { /* Inspector UI */ },
  View: ({ properties, children }) => { /* Three.js render */ },
  defaultProperties: { /* defaults */ }
};
export default MyComponent;
```
2. Export in `components/index.ts`
3. Auto-registers via `components.forEach(registerComponent)` in PrefabRoot

### Testing in Docs Site
1. Export new component from `src/index.ts`
2. Run `npm run dev` (rebuilds library on save)
3. Use in `docs/app/demo/page.tsx` or create new demo page

### Model Loading
- Supports GLB/GLTF (with Draco compression) and FBX
- Models auto-load when `model.properties.filename` detected in prefab tree
- Uses singleton loaders (don't recreate GLTFLoader instances)
- Draco decoder from CDN: `https://www.gstatic.com/draco/v1/decoders/`

## Common Patterns

### Update Prefab Node
```typescript
function updatePrefabNode(root: GameObject, id: string, update: (node: GameObject) => GameObject): GameObject {
  if (root.id === id) return update(root);
  if (root.children) {
    return { ...root, children: root.children.map(child => updatePrefabNode(child, id, update)) };
  }
  return root;
}
```

### Three Object References
- `objectRefs.current[gameObjectId]` stores Three.Object3D for each node
- `registerRef(id, obj)` callback passed down hierarchy
- Used by TransformControls to manipulate objects directly

### Edit vs Play Mode
- Edit mode: `<MapControls>`, `<TransformControls>`, physics paused
- Play mode: Physics active, no editor UI
- Components check `editMode` prop to conditionally wrap (e.g., PhysicsComponent only wraps in play)

## Publishing
```bash
npm run build  # tsc → dist/
npm publish --access public
```

## Conventions
- **IDs**: Use UUIDs for GameObjects (important for tree operations)
- **Transforms**: Always `[x, y, z]` number arrays, rotations in radians
- **Colors**: Accept CSS strings (hex codes or named colors) → convert to THREE.Color
- **Texture paths**: Relative to public root (e.g., `/textures/grid.png`)
- **Component keys**: Lowercase in prefab JSON (`"transform"`, `"physics"`) but TitleCase for registry (`"Transform"`, `"Physics"`)

## Tech Stack
- **React 19** + **TypeScript 5**
- **@react-three/fiber** (React renderer for Three.js)
- **@react-three/drei** (helpers: MapControls, TransformControls, Merged)
- **@react-three/rapier** (physics via Rapier WASM)
- **Three.js WebGPU** (cutting edge renderer, not WebGL)
- **Next.js 16** (docs site only)
- **Tailwind 4** (docs site styling)

## Design Principles
1. **AI-first**: Prefabs are JSON → LLMs can generate complete scenes
2. **Zero boilerplate**: No manual Three.js object creation in user code
3. **Component composition**: Mix physics + rendering + behavior via declarative components
4. **Visual editing**: Prefab editor generates JSON that can be version controlled
5. **Instancing by default**: Optimize repeated geometry automatically

## Coming Soon (Migration in Progress)
These features exist in another repo and are being migrated:
- **Input system**: Keyboard, gamepad, and touchscreen controls
- **Multiplayer primitives**: WebRTC-based state synchronization (Trystero)
- **Controller patterns**: First-person and third-person camera controllers
- **Touch UI**: Virtual joystick and button components for mobile

When implementing these, maintain the same philosophy:
- Controllers should work with prefab-based scenes
- Input should be declarative (hook-based, not imperative event listeners)
- Multiplayer state sync should serialize naturally with JSON prefabs
