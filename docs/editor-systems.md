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

Terrain surfaces now use the existing node-component registry. A game-object handle can read `TERRAIN_SURFACE_COMPONENT`; its lifecycle follows the owning node. This replaces a separate WeakMap and descendant scan, which could return a child terrain when querying a parent. The editor uses the same ownership resolution as the rest of the runtime.

## Audit boundaries

Fixed in this pass:

- Removed the obsolete selection test block referencing `registerEditPickSources`; retained tree coverage and extended current ownership/picking coverage.
- Removed terrain state and terrain view imports from the editor shell.
- Replaced the dedicated Add terrain button with registered object presets.
- Extracted capture/cancellation/navigation policy from the terrain brush.
- Unified terrain surface lookup with runtime node-component ownership.

Remaining deliberate or deferred boundaries:

- Terrain uses a four-layer RGB-plus-remainder weight format. More layers require a versioned storage/material design, not a wider tool-session interface.
- Terrain image decoding and painted-image export still use browser canvas APIs. Headless terrain export needs an injected image codec and material baking strategy; the tool registry does not solve that.
- Numeric inspector scrubbing still has its own drag lifecycle and per-update history behavior. Adapting it needs an input-focused transaction design so text entry, blur and cancellation remain coherent.
- The new palette creates at the scene root; surface placement and repeated stamping should be registered tools that share the same document API and pointer lifecycle.

Validation includes non-terrain test tools and custom subtree presets, in addition to terrain's interaction and rendering-data tests. Browser visual and physical Pencil testing remain separate from these automated checks.

## Follow-up architecture review

The Add object control now sits below the prefab tree. This follow-up also made tool registration reactive, added editor-lifetime subscriptions, and bound remembered settings to definition identity rather than a string ID. Tests exercise runtime registration, replacement, unloading, cancellation, and repeated cleanup.

Concrete next boundaries, in priority order:

1. **Edit transactions across pointer events.** `src/core/prefabHistory.ts` groups synchronous actions, while `NumberInput` and `Vector3Input` in `src/editor/ui/Input.tsx` publish individual drag updates. A shared begin/commit/cancel transaction should own the initial document state and produce one undo step. It needs explicit policies for Escape, blur, text editing, pointer cancellation, concurrent document commands, and unmount before wiring it to fields and transform controls.
2. **Asset import sessions.** `src/editor/PrefabEditor.tsx` handles file drops, manifest path resolution, placeholder creation, asynchronous model replacement, and selection. Move these responsibilities into an import service accepting asset sources and placement, with a session identity to reject late results after scene changes and a defined rollback/history policy. The browser drop adapter and future palette placement tools can then call the same service.
3. **Component plugin lifecycle.** `src/editor/ComponentEditors.ts` still has a nonreactive map without unregistering, and `src/core/ComponentRegistry.ts` exposes a version counter rather than a subscription. Migrating these requires a policy for documents containing components whose implementation is unloaded. Keep authored data intact and define the missing-component behavior before giving runtime components the same unload lifecycle as editor tools.

These are identified follow-ups, not completed refactors. The extension registry remains editor-internal; it does not claim to solve document transactions, asset persistence, or runtime component lifetime.

## Terrain and physics consolidation

Terrain painting now lives in one `TerrainPaintTool.tsx` module: viewport behavior, panel, typed settings, and its exported definition. Built-in editor setup registers the definition explicitly. Importing the painting implementation alone does not register a global tool. The former settings hook only renamed generic session fields, so callers now use `useEditorToolSession` directly.

`createColliderResidencyScheduler` is exported by the Crashcat plugin for collider sets beyond terrain. Callers provide `activeLimit`, candidates `{ id, revision, distance }`, an asynchronous `build`, and synchronous `activate`/`deactivate` callbacks. It serializes preparation, caches shapes, rejects stale results, and selects by distance with stable ID ties. Terrain supplies its world-space bounds and sets the budget to two; the policy knows nothing about heightmaps, React, workers, or cameras. This is an active-body budget, not a memory-limited streaming cache. Prepared shapes must be plain data; callers own any external resources.

Keep the worker entry point separate: it is a distinct execution boundary required by the bundler. Keep the optional Crashcat inspector entry point separate to avoid pulling editor dependencies into runtime consumers. Terrain's world-to-map projection, four-material weight encoding, and atomic cross-tile persistence stay in the terrain tool. Extracting those into a universal brush framework would add contracts with no second consumer yet.
