# Editor API for agents

Start with `window.reactThreeGame.help()` in the running editor. Prefer this
existing interface for authoring before creating another bridge or rewriting scene JSON.

Use targeted reads and small command batches to edit a running scene. The toolbar's
**Agent API** link opens this guide. These calls edit the document and undo history;
gameplay state stays in the host application.

## Connect

In the editor tab's main JavaScript context:

```js
window.reactThreeGame?.help(); // Compact connection guide.
window.reactThreeGame?.listEditors();
const api = window.reactThreeGame.editors.main; // Hosted docs editor's ID.
api.help(); // Method list, read/edit/review example, save and undo rules.
api.getSceneInfo();
```

Discover IDs before choosing an editor in an arbitrary embed. If the registry is
absent, wait for mounting; an older build or `agentTools={false}` will not expose it.
For iframes, target the editor frame's own context.

A Chrome automation tool with CDP support can make the same call:

```js
await cdp.send('Runtime.evaluate', {
  expression: 'window.reactThreeGame.editors.main.findNodes({name:"wall",limit:20})',
  returnByValue: true,
});
```

Use `awaitPromise: true` for asynchronous capture/save calls and check
`exceptionDetails`. This is an ordinary page API; no MCP server is required.

## Change an existing component

```js
const matches = api.findNodes({ component: 'Geometry', limit: 20 });
// Choose the intended node after inspecting matches.nodes.
const id = matches.nodes[0]?.id;
if (!id) throw new Error('No Geometry node found');
const read = api.getNodes({ ids: [id], resolved: true });
const node = read.nodes[0];
const key = Object.keys(node.components).find(key => node.components[key]?.type === 'Geometry');
api.describeComponents({
  names: ['Geometry'],
  properties: { Geometry: { geometryType: 'box' } },
});

api.applyBatch({
  expectedRevision: read.revision,
  commands: [{ op: 'patchComponent', id, key,
    properties: { geometryType: 'box', args: [2, 1, 1] } }],
});
api.getNodes({ ids: [id], resolved: true });
await api.captureView(); // PNG dataUrl, width, height, revision.
```

`key` is the instance key read from the node, not the component type. Discover
custom component fields the same way. A revision mismatch means reread and replan.

## Add a node in one undo step

```js
const api = window.reactThreeGame.editors.main;
const info = api.getSceneInfo();
api.describeComponents(); // compact list of registered types and slots
api.describeComponents({ names: ['Geometry', 'Mesh', 'Material', 'Transform'] });
api.describeCommands(); // command reference and machine-readable JSON Schema

const batch = {
  expectedRevision: info.revision,
  commands: [
    { op: 'add', parentId: info.rootId, node: {
      id: 'agent-box', name: 'Box', components: {
        mesh: { type: 'Mesh', properties: {} },
        geometry: { type: 'Geometry', properties: { geometryType: 'box' } },
        material: { type: 'Material', properties: {} },
      },
    } },
    { op: 'transform', id: 'agent-box', position: [2, 1, 0] },
  ],
};
api.validateBatch(batch); // optional: stages edits without changing scene/history
const result = api.applyBatch(batch); // revalidates against the current scene
api.getNodes({ ids: ['agent-box'], resolved: true });
const image = await api.captureView(); // PNG dataUrl, width, height, revision
// To undo this batch later: api.undo({ expectedRevision: result.revision });
```

## Author an organized assembly

Use a named parent and local child transforms. Repeated boxes share unit geometry;
size them with `Transform.scale` and reuse a material ID. This enables compatible
meshes to batch automatically without losing individual node IDs or editability.

```js
// Pick an unused assembly ID and an existing parent after inspecting the scene.
function assemblyBatch(api, parentId, id, modelUrl, textureUrl) {
  return {
    expectedRevision: api.getSceneInfo().revision,
    commands: [
      { op: 'material', id: `${id}-stone`, material: {
        color: '#aaa18c', roughness: 0.95, texture: textureUrl,
      } },
      { op: 'add', parentId, node: { id, name: 'Courtyard', children: [
        { id: `${id}-wall`, name: 'Wall', components: {
          transform: { type: 'Transform', properties: { position: [0, 1.5, 0], scale: [6, 3, 0.3] } },
          mesh: { type: 'Mesh', properties: {} },
          geometry: { type: 'Geometry', properties: { geometryType: 'box', args: [1, 1, 1] } },
          material: { type: 'Material', properties: { materialId: `${id}-stone` } },
        } },
        { id: `${id}-prop`, name: 'Imported prop', components: {
          transform: { type: 'Transform', properties: { position: [2, 0, 2] } },
          model: { type: 'Model', properties: { filename: modelUrl } },
        } },
      ] } },
    ],
  };
}
// Supply actual URLs from your host's asset catalog or uploaded assets:
// const batch = assemblyBatch(api, parentId, 'courtyard-1', modelUrl, textureUrl);
// api.validateBatch(batch); // Inspect advisories; no writes or downloads.
// api.applyBatch(batch);    // One undo step; referenced assets now load.
// api.focusNode({ id: 'courtyard-1' });
// await api.captureView();
```

Discover model options with `describeComponents({names:['Model']})`; `repeat` and
`repeatAxes` support regular repeated placements. Reuse exact asset URLs so loads
can be shared. `Model` retains embedded materials; a sibling `Material` does not
replace arbitrary imported submeshes. Use material commands for authored primitive
materials: `texture` is the color map and `normalMapTexture` is the normal map.

Paths resolve against the editor’s `basePath`; absolute URLs need appropriate CORS
access. The host owns asset catalogs and uploads. Validation checks document shape,
not asset availability; wait for loading, check errors, then review the viewport.

`validateBatch()` and `applyBatch()` return `advisories` about the resulting document.
`analyzeScene()` includes counts. Reports identify unique box sizes, explicit
instancing opt-outs, multiple live point shadows and a large flat root hierarchy.
IDs are bounded samples; `count` gives the total affected. These are heuristics,
not errors or draw-call/FPS measurements, and host behavior can override document settings.

Groups organize assemblies; they do not reduce draw calls by themselves. Different
materials, selection, interaction or skinning can prevent batching. Use cached
shadows only when you also own their invalidation. Avoid automatically moving
geometry dimensions into existing node scale: that changes children and colliders too.

## Read reference

| Method | Result |
| --- | --- |
| `analyzeScene()` | Document counts and bounded rendering/organization advisories; not a runtime profiler |
| `help()` | Compact workflow, method signatures, example and persistence rules |
| `getSceneInfo()` | Revision, root ID, name, edit/play mode, selection, node count, undo/redo and save availability |
| `describeComponents()` | Registered type names, descriptions and slots |
| `describeComponents({names, properties?})` | Selected types' property schemas and evaluated defaults |
| `findNodes({name?, component?, parentId?, offset?, limit?})` | Compact summaries; case-insensitive name/ID substring, exact component type, optional **direct** parent filter; total and nextOffset |
| `getNodes({ids, depth?, limit?, resolved?})` | Flat node records, parent/child IDs, optionally descendants and resolved component defaults |
| `getMaterials({ids? , offset?, limit?})` | Material summaries by default; complete definitions for explicit IDs |
| `describeCommands()` | Command semantics and input schema |
| `focusNode({id})` | Frame a mounted node in the editor camera |
| `captureView()` | PNG of the current canvas, without editor HTML |
| `exportScene()` | Explicit full-document export with its revision |

Queries return copies, not references to mutable live state. Search/material
pages default to 50 entries (maximum 200). `getNodes` defaults to depth 0 and
100 nodes (maximum depth 5, 200 nodes), with a `truncated` flag. Child ID lists
are capped at 200; use paginated `findNodes({parentId})` for larger branches.
Only nodes authored in this prefab document are editable; expanded asset/prefab
internals and generated runtime geometry are not separate editable document nodes.

Registered game/plugin components are discovered at call time. Function defaults
are evaluated, never sent as source code. Supply context for dependent defaults:

```js
api.describeComponents({
  names: ['Geometry'],
  properties: { Geometry: { geometryType: 'sphere' } },
});
```

Geometry argument schemas describe each positional argument for the chosen shape.
Custom components can add `description` and per-property `schema` metadata
(JSON Schema object, or a function of resolved properties) for nested objects,
arrays, units or references. This metadata is descriptive; command validation
checks registered property names and base types, not arbitrary JSON Schema extensions.

## Commands

Batches contain 1–1000 commands, evaluated in order. IDs created by one command
can be used later in that batch. All changes commit once; an invalid command
leaves scene and undo history untouched. Untouched node records retain their
identity. Applying is available only in edit mode.

| Operation | Fields | Meaning |
| --- | --- | --- |
| `add` | `parentId, node` | Add a node/subtree; every ID must be unique |
| `update` | `id, patch` | Change name, hidden, disabled or locked |
| `remove` | `id` | Remove a subtree; root protected |
| `move` | `id, parentId` | Reparent, keeping local transform; cycles and root moves rejected |
| `duplicate` | `id, newId, parentId?` | Copy subtree; defaults to the source's parent |
| `transform` | `id, space?, position?, rotation?, scale?` | Set local or world transform |
| `component` | `id, key, component` | Replace a component instance; null removes it |
| `patchComponent` | `id, key, properties, unset?` | Shallow property patch; unset restores defaults |
| `material` | `id, material` | Add/replace a shared material |
| `patchMaterial` | `id, patch` | Shallow patch of an existing shared material |

`key` is a component **instance key**, not its type; discover it with node queries.
Nested objects and arrays are replaced as values, never implicitly deep-merged.
Duplicates use `newId` for their root and `newId/originalId` for descendants;
reference strings inside components remain unchanged, including external refs.
Returned `createdIds` lists the generated IDs.

Y is up; rotations are XYZ Euler radians. World means prefab document space,
including the root transform; an enclosing host's transform is not included.
World commands require position, rotation and scale and reject singular parents,
degenerate decompositions and shear that cannot be represented as local TRS.

Results include `commandCount`, `changedIds`, `createdIds`, `removedIds`, `changed`
and `revision`. `changedIds` may contain material IDs as well as node IDs.
`expectedRevision` is required for apply, validate, undo, redo and save. A mismatch
rejects the operation; reread affected nodes and replan instead of blindly retrying.
Revision tokens are scoped to the editor session; a remounted page gets new tokens.

## Connect saving to your host

```tsx
import { PrefabEditor } from 'react-three-game/editor';

<PrefabEditor
  agentId="main"
  prefab={document}
  onSaveScene={saveDocument} // Your async persistence function.
/>
```

Then an agent can save explicitly:

```js
const { revision, canSave } = api.getSceneInfo();
if (canSave) await api.saveScene({ expectedRevision: revision });
else {
  const { prefab } = api.exportScene(); // Return this document to the host/user.
}
```

The API is also on `editorRef.current.agent`, even when `agentTools={false}` hides
it from the page registry and hides the Agent API link. Override `agentDocsUrl`
when hosting your own copy of this guide. `showUI={false}` does not disable the API. A provider
with a separately mounted scene works the same way.

`saveScene({expectedRevision})` calls the host adapter and returns `savedRevision`
and `currentRevision`, which can differ if editing continued during an async save.
It never claims that live edits are already on disk, and never opens a file dialog.
Without an adapter it fails explicitly: retrieve `exportScene()` or use the
editor's existing Save action. The static docs editor has no server persistence.

For same-origin iframes, call the API on the iframe's own window. For cross-origin
embeds, browser automation must target that frame's main execution context, or
open the editor URL directly. This package does not install a cross-origin
postMessage listener or open network access. The page API is available to scripts
already running in that page; it is an integration surface, not an authorization
boundary. Set `agentTools={false}` where exposing an editor API is inappropriate.
