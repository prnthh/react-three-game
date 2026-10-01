# Editor scene for agents

A scene (or **prefab**) is a JSON document of nodes and component settings.
Registered React components supply behavior and declare editable settings.
The window API edits this document and shares undo history with the visual editor.
Animation and physics change live objects, not the document or its revision.
`export()` returns authored settings; PNG and GLB exports capture live objects.

Use the library in any React app; the hosted website is optional.
[Minimal editor and viewer apps](https://github.com/prnthh/react-three-game#minimal-react-app-with-an-editor)
show setup and component registration.

## 1. Connect and inspect

Execute JavaScript in the browser tab containing `PrefabEditor`, or in its iframe:

```js
const scene = window.scene;
scene.info(); // Mode, revision, rootId, selection, history, and saveMethod.
scene.components(); // Available types.
scene.find({ query: 'specific target name' }); // Require one match and return its placement.
scene.search({ query: 'target name', limit: 20 }); // IDs/names plus local/world transforms.
```

Choose node IDs from the results. Prefer adjusting a suitable existing node before
adding another one. Search results are sufficient for framing and transform edits;
`get({id, resolved:true})` is the full single-node read when properties are needed;
`getMany({ids, resolved:true})` returns authored
settings in `components` and defaults filled in under `resolvedComponents`.
A component **schema** describes its supported settings and types:

```js
scene.components({ names: ['Rotator'] }); // Use a discovered type name.
```

Writes require **Edit** mode; use `await scene.setMode({ mode: "play" })` to check behavior.
Normal individual edits automatically apply to the current scene. Reads still return a
**revision** for undo/redo history and advanced callers that want to pass
`expectedRevision` as a concurrency guard. If a guarded call is rejected, reread and
adjust; validation does not lock the scene.

If `window.scene` is absent, check that `PrefabEditor` has loaded and
`agentTools` is not false. `GameCanvas`/`PrefabRoot` run scenes without this API.
`showUI={false}` hides editor panels but keeps the API and mode unchanged. Only one
agent-enabled editor is supported per page. After navigation or reload, reacquire
`window.scene`.

## 2. Use registered components

Reuse the components returned by `scene.components()`. If the required behavior is
not registered, stop scene editing and add the React component in source first. JSON
stores component type names and settings, not implementations.

## 3. Edit nodes

Each attached component has a key under `node.components`; that key can differ from
its type name. The normal iteration loop is find, look, update and capture:

```js
const before = scene.find({ query: 'north brace' }).node;
const id = before.id;
scene.look({ id });
scene.update({
  id,
  patch: { name: 'North brace' },
  transform: { position: [2, 4, 0], rotation: [0, 0, 0.35] },
  components: { material: { properties: { roughness: 0.8 } } },
});
scene.look({ id }); // Look again after a large move.
const image = await scene.capture();
```

`update` applies its supplied metadata, transform and component patches as one
undo step. Individual calls use the current scene unless the optional
`expectedRevision` guard is supplied. Other operations are `create`, `remove`,
`replace`, `replaceAll`, `setComponent`, `setMaterial`, `updateMaterial`, and
`duplicate`; focused operations such as `transform` and `move` remain
available too.

This helper updates an existing component or adds it if absent:

```js
function configureComponent(scene, id, type, properties) {
  const read = scene.get({ id, resolved: true });
  const node = read.node;
  const existingKey = Object.keys(node.components ?? {})
    .find(key => node.components[key]?.type === type);
  const key = existingKey ?? type;
  if (!existingKey && node.components?.[key]) throw new Error(`Component key is occupied: ${key}`);
  return existingKey
    ? scene.update({ id, components: { [key]: { properties } } })
    : scene.update({ id, components: { [key]: { type, properties } } });
}
// Example after discovery: configureComponent(scene, chosenNodeId, 'Rotator', { speed: 2 });
```

If multiple components share a type, choose the intended key explicitly with
`patchComponent`. Prefer moving, resizing, renaming or removing suitable existing
nodes. Create a node only after confirming that its physical or visual role is missing.

## 4. Review and save

```js
scene.get({ id, resolved: true }); // Read full settings when needed.
scene.look({ id }); // Bring a mounted object into view; Edit mode only.
const image = await scene.capture();
// { mimeType: 'image/png', dataUrl, width, height, revision, currentRevision }
```

Display `image.dataUrl` with the agent tool, inspect the image, then adjust. Capture
waits two animation frames and renders the current camera, but does not wait for
models/textures to load. HTML panels are excluded; canvas helpers can appear. If
revisions differ, edits occurred during capture: read and capture again. Check
animation/physics in Play separately, then return to Edit to save:

Capture can temporarily override the view without moving the editor camera:

```js
const image = await scene.capture({
  mode: 'wireframe', // 'default', 'unlit', or 'wireframe'
  fov: 55,           // Perspective cameras only; 1–179 degrees.
  position: [8, 6, 4],
  target: [0, 1, 0],
});
```

Every field is optional. Omitted camera fields use the current view. The response
includes the normalized `capture` options alongside the image and revisions.

```js
const current = scene.info();
if (current.saveMethod === 'save') {
  const saved = await scene[current.saveMethod]();
  // savedRevision is the saved document; currentRevision may include later edits.
} else {
  const json = scene[current.saveMethod]();
  // Replace the scene file this page loads with this complete JSON string.
}
```

`exportJSON()` is always available and returns the complete authored scene as
pretty-printed JSON; it does not trigger a browser download. `export()` remains
available when a structured object is more useful. `save()` calls the function supplied
as `<PrefabEditor onSaveScene={saveDocument} ... />`; it does not open a file dialog.
If no save function or file destination is configured, return the JSON and state that
it has not been saved. Report what changed and what you verified.

## Download PNG or GLB

```js
await scene.downloadScreenshot({ filename: 'review.png' });
await scene.downloadGLB({ filename: 'scene.glb' });
```

Set the browser tool's download listener before calling. These work in Edit or Play,
clear selection, and request a download without opening menus. Defaults are
`screenshot.png` and `scene.glb`; filenames cannot include directory paths.
Results contain `downloadRequested`, `filename`, `mimeType`, `revision`, and
`currentRevision`. Verify the browser tool's download result: a request does not
confirm that a file reached disk. Errors reject the call.

`downloadScreenshot()` captures the current camera; use `capture()` for inline PNG data.
`downloadGLB()` exports the rendered prefab object tree, excluding sibling JSX and
HTML. Wait for assets to load. GLB is useful for inspecting geometry in another tool,
but does not preserve React behavior; custom shaders may not survive export.
Keep JSON for further scene editing.

## Scene authoring rules

- Keep related nodes under a named parent; child transforms are relative to it.
- Inspect nearby peers before composing a node. Preserve the scene's conventions for
  component ownership, hierarchy, naming and functional versus visual-only details.
- Prefer a few well-placed objects over repeated decoration. Reuse the scene's
  established visual language instead of introducing a new one implicitly.
- Shared material edits affect every user. Prefer a local material/component change
  unless a scene-wide change is intentional.
- Repeated boxes use unit geometry and dimensions in `Transform.scale`. Matching
  built-in materials share rendering resources automatically.

Escalate the operation only when the simpler level cannot express the change:

1. Update one existing node, then capture it.
2. Make a short sequence of individual edits, reviewing between meaningful changes.
3. Create one small missing object or group, then review it in context.
4. Use `batch()` only when dependent cross-node changes must land atomically. Inspect
   `commands()` then, validate the batch, and keep it as small as the dependency requires.

This progression still permits complex authoring. It keeps uncertainty observable
instead of packaging every assumption into one large initial transaction.

`validate()` checks command and component schemas. `analyze()` supplies bounded
structure/rendering hints. Neither judges visual or behavioral correctness, measured
draw calls or FPS; use captures and the application's relevant runtime mode.

Asset URLs resolve against `basePath`; remote URLs require CORS. `Model` keeps its
embedded materials; a sibling `Material` does not replace them. For primitive materials,
`texture` is the color map and `normalMapTexture` the normal map. Groups alone do not
reduce draw calls, and scaling a parent also affects children and colliders.

For image-based lighting/reflections, add an `Environment` node containing a sphere
with a `basic`, `BackSide` image material. A standalone sky sphere only draws the
image; the parent captures it as an environment map. Capture uses `frames={1}` and
refreshes when environment settings or visual assets change, not every frame.
See the [image environment batch example](https://github.com/prnthh/react-three-game/blob/main/docs/LIGHTING.md#image-environment).

## Reference

`scene.help()` lists callable methods. `scene.commands()` supplies command
schemas; `components({names:[...]})` supplies fields and evaluated defaults.
For dependent settings, pass context, for example:

```js
scene.components({
  names: ['Geometry'], properties: { Geometry: { geometryType: 'sphere' } },
});
```

Custom `description` and property `schema` metadata can explain units, references,
arrays and objects. Validation checks registered names/base types, not arbitrary
JSON Schema extensions.

Queries return copies. Search/material pages default to 50 entries (max 200).
`getMany` defaults to depth 0 and 100 nodes (max depth 5, 200 nodes); check `truncated`
and paginate larger results. Only nodes in the document are editable, not expanded
model/prefab internals or generated runtime geometry.

Batches contain 1–1000 commands, evaluated in order. Invalid batches change nothing.
IDs created earlier in a batch can be used by later commands.

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
including the root transform; an enclosing application object's transform is not included.
World commands require position, rotation and scale and reject singular parents,
degenerate decompositions and shear that cannot be represented as local TRS.

## Browser tool connection

Calls use ordinary page JavaScript; no MCP server is required. With CDP, use
`Runtime.evaluate`, `returnByValue:true`, and `awaitPromise:true` for async methods;
check `exceptionDetails`. Target the frame containing the editor, including for
cross-origin iframes. There is no cross-origin message bridge.

The API is available to scripts already running in that page. `agentTools={false}`
disables window exposure; `editorRef.current.scene` remains available to React code.

## Control playback and the view

```js
await scene.setMode({ mode: 'play' });
// Observe behavior, then return to authored placement for another iteration.
await scene.setMode({ mode: 'edit' });
await scene.reset();
scene.select({ id: null });
scene.setCamera({ position: [8, 5, 8], target: [0, 1, 0] });
const image = await scene.capture();
```

Reset remounts the live prefab subtree from the current document and clears
selection. It preserves mode, document revisions and undo history. It does not
reload the original file or undo authored edits. Assets may still be loading;
capture/export does not promise asset readiness. The host can pass `onResetScene`
to reset external game state before remounting. `getCamera()` reads camera position
and target; `setCamera()` works in Edit mode so gameplay cameras do not compete.

## Reusable subtrees

Use the tree's right-click menu (or node action menu): **Pack as Prefab**, **Unpack Prefab**, and **Export Prefab…**.
Packing captures the selected node and all descendants, including shared materials, into a self-contained JSON `PrefabRef` URL. The reference retains the selected node's ID, placement transform, name, and visibility flags. Duplicate it to place more instances. Embedded definitions survive ordinary scene saves without a file server; they are immutable snapshots, not an editable global prefab library. Relative assets still use the editor's `basePath`.

```js
scene.pack({ id: 'assembly' });
scene.duplicate({ id: 'assembly', newId: 'assembly-2' });
scene.transform({ id: 'assembly-2', position: [12, 0, 4] });
await scene.unpack({ id: 'assembly-2' });
const { prefab } = scene.exportPrefab({ id: 'assembly-2' });
```

`pack` and `unpack` each create one undo step. Unpack retains a placement wrapper and expands the asset below it, so scaled/rotated parents, reference transforms, extra components, and pre-existing children are preserved. Loading errors or revision changes during loading leave the document untouched. Unpacked node/material IDs receive a unique scope to avoid collisions. Arbitrary ID strings in custom scripts or component properties are not rewritten: inspect behaviors that cross prefab boundaries before and after packing/unpacking.

`exportPrefab({id})` returns a complete nested subtree with shared materials, with the selected root's placement transform and visibility flags removed. It does not truncate or save. The GUI export uses the same extraction with the existing Save As/download flow. Unlike this nested export, `get()` returns a `node` with `childIds` and a separate flat `descendants` array; it does not return `node.children`.

## Measuring placement

```js
const base = scene.bounds({ id: 'assembly' });
const ground = scene.bounds({ id: 'floor' });
// With an axis-aligned flat floor, a positive difference indicates a vertical gap.
const gap = base.bounds.min[1] - ground.bounds.max[1];
```

`bounds` reports `{min,max,size,center}` in world coordinates for the live mounted subtree, or `null` if it has no geometry. It includes hidden meshes, instancing source meshes, and mounted helpers. It is not a collision query or a guarantee that assets have finished loading. Frame the contact points and inspect a low-angle capture after moving geometry; do not assume the ground is at zero.

### Discover and pack multiple assemblies

```js
const groups = scene.search({ parentId: 'world', recursive: true, groupsOnly: true, limit: 200 });
// Check nextOffset for pagination. Select disjoint assemblies from these results.
scene.packMany({ ids: ['assembly-a', 'assembly-b'], reuse: true });
```

`groupsOnly` filters before pagination; `recursive` searches all descendants of `parentId` instead of only direct children. `packMany` accepts 1–200 unique, disjoint node IDs and commits one undo step. Ancestor/descendant overlap, invalid nodes, or stale revisions reject the entire batch. To create nested prefabs, pack deepest modules first, then their containing assemblies.

`reuse: true` is an explicit choice for self-contained assemblies. It compares component values and ordered child structures within the batch, ignoring node IDs/display names and the selected root's placement. Equivalent assemblies share the first definition's URL, while every placement retains its own ID, name, flags, and transform. The returned `reused` list identifies each shared source. Internal display names come from that source; arbitrary custom ID references are not remapped. The default packs independent snapshots. Matching currently uses exact serialized component values; semantically equivalent defaults or differently ordered property keys need not deduplicate.

### URL and embedded source consistency

Both sources use the same normalized document cache. Mounted references retain their definitions until unmount or a URL change; loading many unrelated prefabs cannot evict an active reference. Unpack reads the cached definition currently used by rendering, rather than fetching a potentially newer server response. Each editable instance still owns its own store, and document reads return isolated copies.

Unpacking scopes shared materials, including the implicit default and fallback for unresolved material IDs. This prevents an outer scene's materials from changing the appearance of an unpacked asset. Embedded JSON may use percent encoding or base64; the inspector identifies it as an embedded source.
