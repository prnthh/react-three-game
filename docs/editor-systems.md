# Editor systems and extension points

The scene document remains the source of authored state. Tool sessions, hover previews, pointer ownership and isolation are live editor state; they are not serialized and do not modify object lock flags.

## Registered tools

`registerEditorTool` installs a tool definition before or after mounting an editor. The inspector subscribes to registrations, so plugin tools appear and disappear immediately. Each `PrefabEditorProvider` owns an independent controller. A definition supplies an ID, label, target predicate, settings factory, canvas component and HTML panel. Matching tools automatically appear as actions in the node inspector. The shell mounts the registered views and isolates scene selection/transforms while the tool is active.

```tsx
import { registerEditorTool, useEditorTools, useEditorToolSession } from 'react-three-game/editor';
import { PathViewport, PathPanel } from './pathTool';

registerEditorTool({
  id: 'path.edit',
  label: 'Edit path',
  supports: node => Object.values(node.components ?? {}).some(c => c?.type === 'Path'),
  createSettings: () => ({ spacing: 1 }),
  Viewport: PathViewport,
  Panel: PathPanel,
});

// In the component inspector:
// const tools = useEditorTools();
// tools.activate('path.edit', node.id);

// In either registered view:
// const session = useEditorToolSession<{ spacing: number }>('path.edit');
// session.setSettings({ spacing: 2 });
// session.end();
```

Activation rejects missing, locked, unsupported or non-editable targets. Deleting the target, removing its supporting component, locking it, loading another scene or entering Play ends its session. Switching tools cancels the previous interaction first. Settings are remembered per tool definition within that editor. Replacing a definition or unregistering an active tool cancels its interaction and ends its session; a replacement starts with its own default settings. Session-specific callbacks cannot alter a later session after an asynchronous operation completes.

Register transient-edit cleanup with `session.registerCancellation(cancel)`. The editor cancels active interactions before toolbar/keyboard undo and redo, camera focus, agent document commands and session changes. Cancel must restore the preview without writing history. Keep live preview out of the document and commit one update on completion, so one interaction produces one undo entry.

## Pointer tools

`attachPointerTool(canvas, handlers, options)` owns capture and input lifecycle without knowing about terrain, materials or scene storage. The default policy uses primary mouse/pen input, leaves touch and Alt+drag for navigation, ignores incidental pointers during an interaction, processes coalesced pen events, and cancels on lost capture, pointer cancellation, Escape or window blur. Controls are restored to their previous enabled state on completion, cancellation and handler errors.

Handlers provide `begin`, `move`, `end(commit)`, optional `hover`/`leave`, and `onError`. `begin` returns false when the tool has no valid hit. Tools can provide another `acceptsPointer` policy. On unmount call `dispose`; when registered as a tool also register its `cancel` with the session. `end(false)` must roll back tool-local data; `end(true)` owns persistence and its error recovery.

Terrain retains its own raycasting, world-to-map mapping, weight blending and PNG serialization. Those are terrain semantics, not pointer policy.

## Object presets

The Add object palette reads `registerEditorNodePreset` entries. Presets can create a single component node, a light, a primitive or an entire prefab-style subtree. Creation goes through the normal document API and undo history. Factories must return fresh IDs and independent data on every call.

```ts
import { registerEditorNodePreset } from 'react-three-game/editor';

registerEditorNodePreset({
  id: 'game.spawn', label: 'Spawn point', category: 'Gameplay',
  create: () => ({
    id: crypto.randomUUID(), name: 'Spawn point',
    components: {
      transform: { type: 'Transform', properties: {} },
      spawn: { type: 'Spawn', properties: { team: 'neutral' } },
    },
  }),
});
```

The referenced runtime component must also be registered. Tools and presets share a reactive extension registry with stable immutable snapshots. Cleanup belongs to each registration: removing an old registration does not remove its replacement, even if both registrations used the same object. Preset registration is reactive, so the palette updates when plugins add or remove entries.

## Runtime ownership

Terrain surfaces register `TERRAIN_SURFACE_COMPONENT` on their owning node. Game-object handles and editor tools use the same live ownership registry. Lookup returns the first live registration of that type on the node; it does not scan descendants or infer ownership from `userData`.

## Current boundaries

- Terrain uses four material layers with RGB weights and a remainder. More layers require a storage and material design change.
- Terrain image decoding and painted-image export use browser canvas APIs. Headless scene creation rejects Terrain until an image adapter is available.
- Numeric inspector scrubbing publishes individual drag updates. Pointer-tool transactions do not yet cover numeric fields or transform controls.
- The Add object palette creates at the scene root. Surface placement and repeated stamping can use registered tools and the document API.
- File-drop import and asynchronous model replacement live in `PrefabEditor.tsx`.
- Runtime component and inspector registrations do not have the reactive replacement/unload lifecycle of editor tools.

## Terrain and physics

Terrain painting lives in one `TerrainPaintTool.tsx` module: viewport behavior, panel, typed settings, and its exported definition. Built-in editor setup registers the definition explicitly. Importing the painting implementation alone does not register a global tool. Views read settings with `useEditorToolSession`.

`createColliderResidencyScheduler` is exported by the Crashcat plugin for collider sets beyond terrain. Callers provide `activeLimit`, candidates `{ id, revision, distance }`, an asynchronous `build`, and synchronous `activate`/`deactivate` callbacks. It serializes preparation, caches shapes, rejects stale results, and selects by distance with stable ID ties. `TerrainPhysicsRuntime` supplies world-space terrain bounds and requires the host to choose `activeLimit`; the workshop mounts it with `activeLimit={2}`. The policy knows nothing about heightmaps, React, workers, or cameras. This is an active-body budget, not a memory-limited streaming cache. Prepared shapes must be plain data; callers own any external resources.

Keep the worker entry point separate: it is a distinct execution boundary required by the bundler. Keep the optional Crashcat inspector entry point separate to avoid pulling editor dependencies into runtime consumers. Terrain's world-to-map projection, four-material weight encoding, and atomic cross-tile persistence stay in the terrain tool. Extracting those into a universal brush framework would add contracts with no second consumer yet.
