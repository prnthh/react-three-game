# Scene API

`window.scene` edits a running `PrefabEditor` and shares its undo history. Start
with a node, pack it into an inline prefab, and duplicate it. Export a separate
file when you want to share that assembly across scenes.

For application setup, follow the [inline React walkthrough](https://github.com/prnthh/react-three-game#1-render-an-inline-prefab).
For saved-file editing, see [CLI edits](#edit-files-with-the-cli).

## 1. Connect

Open the [web editor](https://prnth.com/react-three-game/editor), or `/editor` in
a local app. Run the following in the browser frame containing the editor:

```js
const scene = window.scene;
scene.info(); // Mode, revision, rootId, selection, history, saveMethod.
await scene.setMode({ mode: 'edit' });
```

The API becomes available when `PrefabEditor` mounts with `agentTools` enabled.
Use one agent-enabled editor per page and reacquire `window.scene` after reload.
`showUI={false}` keeps the API available while hiding panels.

## 2. Create and edit an assembly

This adds a pedestal to the current scene. Use fresh IDs when running it again:

```js
scene.create({ parentId: scene.info().rootId, node: {
  id: 'assembly', name: 'Pedestal',
  children: [
    { id: 'pedestal-base', components: {
      transform: { type: 'Transform', properties: { position: [0, 1, 0] } },
      geometry: { type: 'Geometry', properties: { geometryType: 'box', args: [2, 2, 2] } },
      material: { type: 'Material', properties: { name: 'stone', color: '#aaa995' } },
    } },
    { id: 'pedestal-cap', components: {
      transform: { type: 'Transform', properties: { position: [0, 2.2, 0] } },
      geometry: { type: 'Geometry', properties: { geometryType: 'box', args: [2.5, 0.4, 2.5] } },
      material: { type: 'Material', properties: { name: 'stone' } },
    } },
  ],
} });
scene.look({ id: 'assembly' });
```

The base defines the shared `stone` material; the cap references it by name.
Child transforms are relative to their parent. Move the assembly as a unit:

```js
const id = 'assembly';
scene.update({ id, transform: { position: [2, 0, 0] } });
scene.look({ id });
const image = await scene.capture({ helpers: false });
```

After the geometry appears, display `image.dataUrl` through your browser tool.
Each update is one undo step; `scene.undo()` and `scene.redo()` navigate edits.
Capture waits two frames. If `revision` and `currentRevision` differ, read and
capture again to review the latest document. Check gameplay separately in Play.

To work on an existing object, `scene.search({query:'Pedestal'})` lists matching
IDs and transforms. `scene.find({query:'Pedestal'})` returns `{node}` when exactly
one matches. `scene.get({id,resolved:true})` adds properties and their defaults.

<a id="reusable-subtrees"></a>

## 3. Pack and place copies

Pack the assembly from step 2, then add two placements:

```js
scene.pack({ id: 'assembly' });
scene.duplicate({ id: 'assembly', newId: 'assembly-2' });
scene.transform({ id: 'assembly-2', position: [6, 0, 0] });
scene.duplicate({ id: 'assembly', newId: 'assembly-3' });
scene.transform({ id: 'assembly-3', position: [-2, 0, 0] });
scene.look({ id: scene.info().rootId });
```

**Pack as Prefab** keeps the original subtree in place and adds `packed: true`.
Copies use `PrefabRef` with the original node's ID as `prefabId`. The runtime
builds its shared lookup from those packed nodes. If the owner is deleted, its
data moves into a remaining user so saving and reloading preserves the copies.

### Update every placement

Edit a component on the original packed subtree:

```js
scene.patchComponent({
  id: 'pedestal-base', key: 'material', properties: { color: '#d9b58b' },
});
```

### Edit one copy

```js
await scene.unpack({ id: 'assembly-2' });
const parts = scene.search({ parentId: 'assembly-2', recursive: true });
// Inspect parts.nodes to choose an expanded node's ID before editing it.
```

Unpack expands the rendered definition beneath its placement wrapper and scopes
IDs and material names. Edit those nodes, then pack the placement again. Other
copies continue using the original packed subtree. `pack` and `unpack` each create one undo
step. Keep behavior references local to their prefab; verify custom ID strings
when crossing a packing boundary because those strings retain their values.

### Share across scenes

Export the unpacked assembly when another scene needs it:

```js
const { prefab } = scene.exportPrefab({ id: 'assembly-2' });
const json = JSON.stringify(prefab, null, 2);
// Save json as public/prefabs/pedestal.json in your app.
```

Export produces a complete nested subtree with shared material definitions,
relative to the selected root. **Export Prefab…** provides the file download
flow. Once the file is served, add a file-based placement:

```js
scene.create({ parentId: scene.info().rootId, node: {
  id: 'shared-pedestal',
  components: {
    transform: { type: 'Transform', properties: { position: [10, 0, 0] } },
    prefabref: { type: 'PrefabRef', properties: { url: '/prefabs/pedestal.json' } },
  },
} });
```

### Pack existing repeated assemblies

```js
scene.search({ parentId: scene.info().rootId, recursive: true, groupsOnly: true });
scene.duplicate({ id: 'assembly-2', newId: 'assembly-4' });
scene.transform({ id: 'assembly-4', position: [14, 0, 0] });
scene.packMany({ ids: ['assembly-2', 'assembly-4'], reuse: true });
```

`packMany` accepts 1–200 disjoint groups and commits one undo step. With
`reuse:true`, groups with matching serialized components and ordered children
share the first definition's ID. Root placement, IDs, and display names are
ignored for comparison; custom reference strings retain their original values.
Pack inner modules before their containing assemblies for nested reuse.

## 4. Save

```js
if (scene.info().saveMethod === 'save') {
  await scene.save();
} else {
  const json = scene.exportJSON();
  // Write this complete string to the scene file your application loads.
}
```

`save()` calls the host's `onSaveScene` callback. `exportJSON()` returns a complete
JSON string; `export()` returns the structured document. Report the actual save
destination and what you verified. After source-file edits, reload the editor to
work from the latest saved document.

## Next steps

| Need | Section |
| --- | --- |
| Configure components or add behavior | [Component settings](#edit-component-settings) |
| Test motion and reset | [Playback](#control-playback-and-the-view) |
| Frame a capture | [Capture options](#capture-options) |
| Align objects | [Placement](#measuring-placement) |
| Commit dependent changes together | [Batches](#atomic-batches-and-revision-guards) |
| Export PNG or GLB | [Downloads](#download-png-or-glb) |
| Understand local editor storage | [Standalone editor](#standalone-editor-storage) |

## Edit component settings

Discover available types with `scene.components()`, then request only the schemas
you need. A schema describes supported properties, types, and defaults:

```js
await scene.unpack({ id: 'assembly' });
const { node: base } = scene.find({
  parentId: 'assembly', recursive: true, component: 'Geometry', query: 'pedestal-base',
});
const surfaceId = base.id;
scene.components({ names: ['Material'] });
scene.get({ id: surfaceId, resolved: true }); // Inspect instance keys and defaults.
scene.patchComponent({ id: surfaceId, key: 'material', properties: { roughness: 0.8 } });
```

Here `material` is the instance key found on that node; `Material` is its type.
Use `setComponent({id,key,component})` to replace an instance,
or pass `component:null` to remove it.

For properties whose defaults depend on other settings, include that context:

```js
scene.components({
  names: ['Geometry'], properties: { Geometry: { geometryType: 'sphere' } },
});
```

### Add or update a component by type

This helper updates an existing component or adds it if absent:

```js
function configureComponent(scene, id, type, properties) {
  const read = scene.get({ id, resolved: true });
  const node = read.node;
  const keys = Object.keys(node.components ?? {})
    .filter(key => node.components[key]?.type === type);
  if (keys.length > 1) throw new Error('Choose a component instance key explicitly.');
  const existingKey = keys[0];
  const key = existingKey ?? type;
  if (!existingKey && node.components?.[key]) throw new Error(`Component key is occupied: ${key}`);
  return existingKey
    ? scene.update({ id, components: { [key]: { properties } } })
    : scene.update({ id, components: { [key]: { type, properties } } });
}
// Example after discovery: configureComponent(scene, chosenNodeId, 'Rotator', { speed: 2 });
```

If multiple components share a type, choose the intended instance key explicitly with `patchComponent`. Supply complete values when patching nested objects or arrays.

<a id="add-behavior-that-is-not-registered"></a>

### Add scripted behavior

Use a registered component when it already provides the behavior. Otherwise, add
a React component in application source, or use the built-in `Runtime` component
for JavaScript stored with the scene. Read its schema first.

`setup` maps to a React effect with cleanup; `update` maps to an R3F frame callback.
Both run only while enabled in Play after preparation. For an existing node ID:

```js
scene.setComponent({ id, key: 'motion', component: {
  type: 'Runtime',
  properties: {
    data: { speed: 2 },
    setup: 'return events.on("jump", () => { const o = context.object; if (o) o.position.y += 1; });',
    update: 'if (object) object.position.x += data.speed * delta;',
  },
} });
```

`delta` is seconds; `object` is this node's live transform. Resolve another node in
the same prefab instance with `prefab.getObject('id')`; it may return null while
loading. `state` persists between frames and resets when setup restarts. Code edits
restart setup; data edits keep the current state. Use `context.data` inside retained callbacks for
current inputs, and `context.three.camera`, `.scene` or `.gl` for current R3F state.
Return cleanup or call `context.onCleanup(fn)` for subscriptions and other resources.
Scripts are trusted page code; use source components for behavior needing React hooks.

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

Reset remounts live objects from the current authored document and clears
selection, preserving mode, revisions, and undo history. Wait for assets to appear
before capturing or exporting. The host can pass `onResetScene`
to reset external game state before remounting. `getCamera()` reads camera position
and target; `setCamera()` works in Edit mode so gameplay cameras do not compete.

## Capture options

Capture can temporarily override the view without moving the editor camera:

```js
const image = await scene.capture({
  helpers: false,   // Hide editor guides without changing mode or resetting.
  mode: 'wireframe', // 'default', 'unlit', or 'wireframe'
  fov: 55,           // Perspective cameras only; 1–179 degrees.
  position: [8, 6, 4],
  target: [0, 1, 0],
});
```

Every field is optional. Omitted camera fields use the current view. The response
includes the normalized `capture` options alongside the image and revisions.
Custom guides opt into helper hiding with `userData.editorHelper = true`.

HTML panels are excluded from PNG captures. Canvas helpers can appear unless hidden.
`getCamera()` reads the view; `setCamera({position,target})` changes the editor camera
in Edit mode. Capture overrides affect only the returned image.

## Measuring placement

```js
const base = scene.bounds({ id: 'assembly' });
const ground = scene.bounds({ id: 'floor' });
if (!base.bounds || !ground.bounds) throw new Error('Wait for geometry to mount.');
// With an axis-aligned flat floor, a positive difference indicates a vertical gap.
const gap = base.bounds.min[1] - ground.bounds.max[1];
```

`bounds` reports `{min,max,size,center}` for mounted geometry, including hidden
meshes and helpers; it returns `null` while geometry is unavailable. Use the
floor’s measured top to align an object, then inspect a low-angle capture. Use
your physics integration for collision queries.

Y is up; rotations are XYZ Euler radians. World coordinates are relative to the prefab document, including its root
transform. Account for enclosing application transforms separately.
World commands require position, rotation and scale and reject singular parents,
degenerate decompositions and shear that cannot be represented as local TRS.

## Atomic batches and revision guards

A **revision** identifies the authored document state. Individual edits normally
use the current revision. Supply `expectedRevision` when an edit must apply only
to the version you inspected. On conflict, reread and adjust the edit.

For dependent changes, discover command inputs through `scene.commands()`, then
validate and apply the same batch:

```js
const { revision } = scene.info();
const batch = {
  expectedRevision: revision,
  commands: [
    { op: 'update', id, patch: { name: 'North brace' } },
    { op: 'transform', id, position: [2, 4, 0] },
  ],
};
scene.validate(batch);
scene.batch(batch);
```

Validation checks command schemas against the inspected revision. Applying
rechecks it and commits one undo step in Edit mode. `analyze()` provides structure
and rendering hints; use captures, Play mode, and profiling to review the result.

Both `validate({expectedRevision, commands})` and `batch({expectedRevision, commands})`
require the revision from a recent read, unlike individual edits where it is optional.
Batches contain 1–1000 commands, evaluated in order. Invalid batches change nothing.
IDs created earlier in a batch can be used by later commands.

| Operation | Fields | Meaning |
| --- | --- | --- |
| `add` | `parentId, node` | Add a node/subtree; every ID must be unique |
| `update` | `id, patch` | Change name, hidden, disabled or locked |
| `replaceNode` | `id, node` | Replace a complete subtree; exposed as `scene.replace()` |
| `replace` | `prefab` | Replace the complete document; exposed as `scene.replaceAll()` |
| `remove` | `id` | Remove a subtree; root protected |
| `move` | `id, parentId` | Reparent, keeping local transform; cycles and root moves rejected |
| `duplicate` | `id, newId, parentId?` | Copy subtree; defaults to the source's parent |
| `transform` | `id, space?, position?, rotation?, scale?` | Set local or world transform |
| `component` | `id, key, component` | Replace a component instance; null removes it |
| `patchComponent` | `id, key, properties, unset?` | Shallow property patch; unset restores defaults |

`key` is the component **instance key** found through node queries.
Supply complete replacement values for nested objects and arrays.
Duplicates use `newId` for their root and `newId/originalId` for descendants;
reference strings inside components remain unchanged, including external refs.
Returned `createdIds` lists the generated IDs.

## Download PNG or GLB

```js
await scene.downloadScreenshot({ filename: 'review.png' });
await scene.downloadGLB({ filename: 'scene.glb' });
```

Set the browser tool's download listener before calling. These work in Edit or Play,
clear selection, and request a download without opening menus. Defaults are
`screenshot.png` and `scene.glb`; filenames cannot include directory paths.
Results contain `downloadRequested`, `filename`, `mimeType`, `revision`, and
`currentRevision`. Verify the saved file through the browser tool's download result. Errors reject the call.

`downloadScreenshot()` captures the current camera; use `capture()` for inline PNG data.
`downloadGLB()` exports the rendered prefab object tree, excluding sibling JSX and
HTML. Wait for assets to load. Use GLB for static geometry in other tools. Keep JSON and component code for
editable scenes, React behavior, and custom shaders.

## Materials and assets

Define a shared material on one node and reference its name on another:

```js
scene.setComponent({ id: surfaceId, key: 'material', component: {
  type: 'Material', properties: { name: 'warm-stone', color: '#aa9980', roughness: 0.9 },
} });
const { node: cap } = scene.find({
  parentId: 'assembly', recursive: true, component: 'Geometry', query: 'pedestal-cap',
});
scene.setComponent({ id: cap.id, key: 'material', component: {
  type: 'Material', properties: { name: 'warm-stone' },
} });
```

This continues from the unpacked geometry in [component settings](#edit-component-settings).
Names resolve across loaded prefabs; load the defining node alongside its users. `scene.materials()` lists the current
document's definitions. Edit a shared definition to change all its users, or give
one node its own definition for a local variation.

Asset URLs resolve against `basePath`; remote URLs require CORS. `Model` uses the
materials embedded in its asset. Primitive `Material` components accept `texture`
for color and `normalMapTexture` for normals.

For image lighting, add an `Environment` node containing a sphere with a `basic`,
`BackSide` image material. It captures once per mount and refreshes when settings
or visual assets change. See the [image environment example](https://github.com/prnthh/react-three-game/blob/main/docs/LIGHTING.md#image-environment).

## Query limits and API discovery

Use `scene.help()` for callable methods, `scene.components()` for component
schemas, and `scene.commands()` for batch inputs. These reflect the running version.
`get()` returns a node with `childIds` and flat `descendants`; use `exportPrefab()`
when you need a complete nested subtree. Write the returned data to your chosen destination.

Custom `description` and property `schema` metadata can explain units, references,
arrays and objects. Validation checks registered names and base types; metadata documents richer
component-specific structures.

Queries return copies. Search/material pages default to 50 entries (max 200).
`getMany` defaults to depth 0 and 100 nodes (max depth 5, 200 nodes); check `truncated`
and paginate larger results. Edit authored document nodes directly; unpack prefab references to expose their
children as editable nodes.

## Browser tool connection

Calls use ordinary page JavaScript. With CDP, use
`Runtime.evaluate`, `returnByValue:true`, and `awaitPromise:true` for async methods;
check `exceptionDetails`. Target the frame containing the editor, including for
cross-origin iframes. Execute calls in that frame's JavaScript context.

The API is available to scripts already running in that page. `agentTools={false}`
disables window exposure; `editorRef.current.scene` remains available to React code.

## Discover available assets

Browse the project catalog of available assets through the editor API. This catalog
is independent of the active scene and includes assets available to add to it:

```js
await scene.assets();
await scene.assets({ type: 'model', query: 'human', limit: 20 });
await scene.assets({ type: 'texture', query: 'brick' });
await scene.assets({ type: 'prefab', offset: 20, limit: 20 });
```

Types are `model`, `texture`, `sound`, and `prefab`. Results contain `assets`
(`type` and `path`), `total`, and `nextOffset`; use `nextOffset` for the next page.
Paths are ready for component properties such as `filename`, `texture`, and prefab
`url`. Queries match paths case-insensitively. The catalog comes from `/manifest.json`
under the editor's `basePath`. Use `scene.search()` to inspect nodes in the active scene. Missing or malformed manifests report an error.

The manifest format is:

```json
{
  "models": ["/models/hero.glb"],
  "textures": ["/textures/brick.png"],
  "sound": ["/sound/jump.wav"],
  "prefabs": ["/prefabs/room.json"]
}
```

## Standalone editor storage

`/editor` restores a scene from this browser's storage, or opens a starter cube,
light, and sky environment. Changes autosave to one slot; `await scene.save()`
flushes it immediately and reports storage errors. Multiple tabs share the slot,
with the latest write winning. Download JSON for a portable backup.

`?map=/prefabs/parkour-course.json` loads a source file, then saves edits to the
same browser slot. Return to `/editor` to resume. **New Prefab** starts from the
template. Demo pages use their own persistence settings. `scene.reset()` restores
live objects from the current authored document.

## Edit files with the CLI

Save commands as `{"commands":[...]}` and run:

```sh
rtg validate scene.json commands.json
rtg apply scene.json commands.json edited.json
rtg components Transform
rtg schema
```

The CLI uses the same core evaluator as `scene.batch()` with built-in component
contracts. For custom definitions, register them in a Node script and call
`evaluateSceneCommands` from `react-three-game/core`. Load `edited.json` in the
editor to review the result. See the [CLI walkthrough](https://github.com/prnthh/react-three-game#node-cli).
