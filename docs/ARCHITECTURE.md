# Architecture

JSON → normalized Zustand document → registered component views → R3F objects.

The editor changes the document. Animation and physics change live objects. Keep these separate.

Editor history observes store actions, including edits through the prefab API. `PrefabEditorProvider`, `PrefabEditorScene`, and `PrefabEditorPanel` compose the complete editor or a custom layout.

## Ownership

| Part | Owns |
| --- | --- |
| Prefab document | Hierarchy, component properties, material definitions |
| Component | Schema, view, optional asset dependencies |
| Editor | Generated fields and optional custom inspectors |
| Scene runtime | Shared assets, materials, geometry, node capabilities |
| Prefab instance | Its document store, live nodes, preparation and disposal |
| Streamer | Which instances exist and where they are placed |

`GameCanvas` owns one shared runtime. Nested roots and instances reuse it; each prefab keeps a local document store. `PrefabRoot` creates a runtime when mounted in a plain R3F canvas.

`PrefabRoot` renders an in-memory document. `PrefabInstance` loads a URL and prepares its resources before activation. `PrefabRef` composes a nested document with its own local IDs.

## Components

Register definitions before mounting scenes. Schemas resolve defaults once, before views and inspectors receive properties. Keep ordinary inspectors generated from the schema.

Most components are behaviors that wrap their children. Optional `slot` selects an exclusive node role: `object`, `geometry`, `material`, `transform`, `environment`, `fog`, or `data`. Behaviors wrap the object; geometry and material render inside it. Views implement native R3F attachments themselves.

`renderWhenDisabled` is for visual components that must mount during resource preparation. Those views must respect `enabled` for gameplay effects. Ordinary behaviors are not mounted while disabled. Keep runtime definitions free of inspector imports.

## Loading

`PrefabInstance` loads its declared dependencies, mounts visuals, waits for its own materials/batches, compiles pipelines, then activates. Unrelated loads do not block it. `onActivate` fires on activation. `onStatus` exposes loading, compiling, ready, active, and error. `active={false}` stops at ready.

Unknown component types, failed assets, and cyclic prefab references fail preparation. Register custom types first. Declare initial asset dependencies in the component schema.

Shared assets stay alive while used. Unmounting releases ownership; the runtime keeps a bounded idle cache. Custom immutable materials use `useSharedMaterialResource(key, factory)`; include all appearance settings and texture identity in the key.

Keep cameras and global lighting outside streamed chunks. Keep old terrain active until replacement chunks activate. Residency belongs in runtime state, not document edits.

Physics belongs to the Three.js scene: mount one `CrashcatRuntime` per scene. Components use `useCrashcat()`; debug display does not reset simulation.

## Rendering

`PrefabRoot` owns the document scope and editor picking. `PrefabNode` subscribes to one node and its child IDs; `nodePlan` resolves its component composition. Three.js owns world transforms. Store actions preserve untouched node references; use hierarchy actions to add, move, or replace nodes.

Eligible leaf meshes batch automatically. `instanced: false` opts out. Animated models and interactive objects can use the ordinary object path.

`static` instances freeze transforms after preparation. Remount them to change placement or content. Shader compilation and low draw counts do not eliminate loading, mounting, or simulation costs.

The engine is WebGPU-only. Test startup, chunk transitions, steady frames, and unloading separately when changing resource code.

Events are scoped to the outer `GameEventsProvider`, supplied automatically by the canvas/editor. Wrap HTML game UI and its canvas together to share a bus. Gameplay uses `useGameObject(localId)` for a live transform and typed component access. Its `id` matches events; the engine handles instance prefixes. Document lookup uses local IDs.
