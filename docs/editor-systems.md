# Editor systems and extension points

The scene document remains the source of authored state. Tool sessions, hover previews, pointer ownership and isolation are live editor state. Document edits carry the saved scene and object lock flags.

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

Activate tools on existing, unlocked targets that support the tool in Edit mode. Deleting the target, removing its supporting component, locking it, loading another scene or entering Play ends its session. Switching tools cancels the previous interaction first. Settings are remembered per tool definition within that editor. Replacing a definition or unregistering an active tool cancels its interaction and ends its session; a replacement starts with its own default settings. Callbacks are scoped to their originating session.

Register transient-edit cleanup with `session.registerCancellation(cancel)`. The editor cancels active interactions before toolbar/keyboard undo and redo, camera focus, agent document commands and session changes. Cancellation restores the live preview. Commit one document update on completion so each interaction produces one undo entry.

## Pointer tools

`attachPointerTool(canvas, handlers, options)` owns pointer capture and the input lifecycle. The default policy uses primary mouse/pen input, leaves touch and Alt+drag for navigation, ignores incidental pointers during an interaction, processes coalesced pen events, and cancels on lost capture, pointer cancellation, Escape or window blur. Controls are restored to their previous enabled state on completion, cancellation and handler errors.

Handlers provide `begin`, `move`, `end(commit)`, optional `hover`/`leave`, and `onError`. `begin` returns false when the tool has no valid hit. Tools can provide another `acceptsPointer` policy. On unmount call `dispose`; when registered as a tool also register its `cancel` with the session. `end(false)` must roll back tool-local data; `end(true)` owns persistence and its error recovery.

Terrain retains its own raycasting, world-to-map mapping, weight blending and PNG serialization.

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

The referenced runtime component must also be registered. Tools and presets share a reactive extension registry with stable immutable snapshots. Cleanup releases the originating registration while preserving the current registration. Preset registration is reactive, so the palette updates when plugins add or remove entries.

## Runtime ownership

Terrain surfaces register `TERRAIN_SURFACE_COMPONENT` on their owning node. Game-object handles and editor tools use the same live ownership registry. Lookup returns the first live registration of that type on the owning node.

## Terrain tool example

[TerrainPaintTool](../src/editor/terrain/TerrainPaintTool.tsx) is a complete
registered tool with viewport behavior, panel and typed settings. Built-in
editor setup registers it explicitly. Terrain painting and collision setup are
documented in the [workshop guide](app/demo/terrain/README.md); physics scheduling
belongs to the runtime adapter.

## Optional input values

`FieldRenderer` field definitions accept `allowUnset:true`. `initialValue` controls what Set writes;
standard input types otherwise use a value appropriate to their type. Supply an
`initialValue` for custom controls. The default component inspector enables this
for properties whose schema default is undefined.

Runtime Views and custom component inspectors receive properties with schema
defaults already resolved. An `undefined` patch unsets a property and restores
its schema default immediately; `0`, `false` and empty strings remain authored values.

```tsx
import { FieldRenderer, type FieldDefinition } from 'react-three-game/editor';

type Settings = { exposure?: number };
const fields = [{
  name: 'exposure', label: 'Exposure', type: 'number',
  allowUnset: true, initialValue: 1, min: 0,
}] satisfies FieldDefinition<Settings>[];

// <FieldRenderer fields={fields} values={settings} onChange={update} />
```

`NumberField`, `StringField`, `ColorField`, `BooleanField`, `SelectField`,
`Vector3Field` also accept `allowUnset`. Node-reference fields use
`FieldRenderer` with `type: 'node'`. Their fallback supplies the
initial value. Use `UnsettableField` around custom input UI with `value`,
`initialValue`, `label` and `onChange` for the same presentation and behavior.
Unsetting sends undefined through the normal change callback; JSON export omits
that property. Required fields retain their ordinary controls.

## Host-owned scene actions

`PrefabEditorPanel` renders the library's Scene tools panel by default. A host
can pass `sceneToolsPanel={<MySceneActions />}` to replace that area, or null to
hide it. The replacement remains under the editor provider and can use
`useEditorRef()` and `createSceneTools(scene)`.

Use `useEditorRef().scene` for mode, reset, undo/redo, capture, downloads, and
serializable export (`scene.export().prefab`). `scene.save()` persists through the
host's `onSaveScene` callback. The ref's `load(prefab)` opens a document with a
fresh undo history; document edits remain available through `usePrefabDocument()`.

`SceneToolsPanel` accepts action `children` beside its button, plus controlled
`open` / `onOpenChange` props when a host needs to coordinate multiple popovers.
The docs editor uses these to add its chat client. Model endpoints, provider
protocols, chat history and transcript UI belong to that application integration;
the library supplies the scene API, discovery and structured tools.

## Large authoring scenes

Dense authoring hosts can wrap `PrefabEditorScene` in `NodeMountBudget` (from
`react-three-game/viewer`) to bound initial Edit mounts per frame. It preserves
the editor store and IDs and bypasses admission in Play, where prefab preparation
owns activation. `PrefabInstance` accepts a normalized `document` as an alternative
to `url`; both use dependency preparation, shader preparation and spatial streaming.
Hosts with postprocessing can use `registerSceneCaptureRenderer(renderer, render)`
so agent captures include the final composition; dispose the registration on cleanup.

## Browser scene tools

`PrefabEditor` exposes its scene agent through `window.scene` and, where supported,
native `document.modelContext` following the
[current WebMCP draft](https://webmachinelearning.github.io/webmcp/).
`createSceneTools(scene)` supplies the shared structured catalog used by native
registration and `SceneToolsPanel`. Each tool calls existing scene-agent methods;
document validation, revision conflicts and undo remain in the editor store.
Registration follows the editor lifetime and leaves unrelated page tools
untouched. Unsupported browsers retain the local panel. `agentTools={false}` disables these editing interfaces.

For catalog ownership and schema sources, see [architecture](ARCHITECTURE.md#browser-tool-ownership).

Custom hosts can import `createSceneTools` or `registerSceneWebMCP` from
`react-three-game/editor`. `registerSceneWebMCP(scene, document)` returns
`{ ready, dispose }`; await `ready` for registration and call `dispose` during host
cleanup. The default editor manages this lifetime automatically. Mount one
agent-enabled editor per page. The panel can also be mounted under the editor
context when composing a custom UI.


## Asset previews

Mount one `SharedCanvas` alongside the asset lists and single-asset viewers on a
page. The asset views share that canvas. `PrefabEditorProvider` supplies the preview canvas
for its inspectors. The asset viewer demo shows the standalone composition.
Thumbnails and enlarged previews share loaded assets; model placements clone the
object hierarchy and retain the shared geometry and materials.
