# Scene API

This guide covers `window.scene`, the API for inspecting and editing a running
`PrefabEditor`. It shares undo history with the visual editor.

Use this path for live scene changes. You can also edit prefab JSON directly or add
custom components in application source, then load the result in an editor or viewer.
See the [agent skill's workflow chooser](https://github.com/prnthh/react-three-game-skill/blob/main/react-three-game/SKILL.md#choose-how-to-work).
`PrefabRoot` renders JSON inside `GameCanvas` or the user's R3F canvas, alongside
their own JSX and gameplay systems, without this authoring API.
When switching between file edits and the editor, reload the changed file before
continuing: saving stale in-memory content can overwrite a newer file.

A **node** is a scene object. Its **components** supply settings such as geometry, material, or behavior. The authored scene is a JSON document called a **prefab**. Animation and physics change live objects; they do not rewrite that document.

## Edit files without a browser

The `rtg` CLI uses the same core command evaluator as `scene.batch()`. Save the
commands as `{ "commands": [...] }`, omitting the editor session's
`expectedRevision`, then run:

```sh
rtg validate scene.json commands.json
rtg apply scene.json commands.json edited.json
rtg components Transform
rtg schema
```

The CLI supports built-in component contracts. Register custom definitions in a
Node script and use `evaluateSceneCommands` from `react-three-game/core` for custom
components. File edits have no live selection, camera, or undo history; reload
`edited.json` in the editor to inspect the result.

## Find the right section

| Need | Section |
| --- | --- |
| Make a first edit | [Connect](#1-connect), [find](#2-find-the-object), [edit](#3-edit-and-review), [save](#4-save) |
| Change component settings or add behavior | [Components](#edit-component-settings) |
| Check motion or restore authored placement | [Playback and reset](#control-playback-and-the-view) |
| Choose a capture angle or hide guides | [Capture options](#capture-options) |
| Align objects or check ground contact | [Placement](#measuring-placement) |
| Reuse an assembly | [Reusable subtrees](#reusable-subtrees) |
| Commit dependent changes together | [Atomic batches](#atomic-batches-and-revision-guards) |
| Export an image or model | [Downloads](#download-png-or-glb) |
| Connect through a browser tool | [Browser connection](#browser-tool-connection) |

## 1. Connect

Execute JavaScript in the browser frame containing the editor:

```js
const scene = window.scene;
scene.info(); // Mode, revision, rootId, selection, history, saveMethod.
```

If `window.scene` is absent, check the frame, wait for `PrefabEditor` to mount, and
check that `agentTools` is not false. `GameCanvas`/`PrefabRoot` alone do not expose
this API. `showUI={false}` hides panels but keeps the API. Only one agent-enabled
editor is supported per page. Reacquire `window.scene` after navigation or reload.

For application setup, see the [minimal editor and viewer apps](https://github.com/prnthh/react-three-game#minimal-react-app-with-an-editor).

## Standalone editor: create shapes and export GLB

Open `/react-three-game/editor` on the hosted site (or `/editor` locally).
It restores the saved prefab from this browser, or uses the starter template:
a default-material cube, directional light, and visible image-textured sky sphere
environment. New Prefab replaces the current scene with a fresh copy of the template.
Changes autosave to one storage slot after a short delay; pending edits flush when
the page is hidden or left. `await scene.save()` writes immediately and rejects if
storage is unavailable or full. Autosave failures are reported in the browser console.
The demo pages do not opt into this persistence.

`?map=/prefabs/brutalist-city/game-level.json` explicitly loads that source instead of restoring
storage. Edits still save to the same slot; return to `/editor` to resume them.
The saved prefab belongs to this browser and origin; it is not synced, a source-file
edit, or a portable asset backup. Multiple editor tabs share that slot; the latest
write wins. Clearing browser data removes it. `scene.reset()` only resets live
objects and does not discard authored edits. Use New Prefab or `replaceAll` below
to intentionally start over.

```js
const scene = window.scene;
await scene.setMode({ mode: 'edit' });
// Intentionally replaces the current document; undo is available.
const base = location.pathname.replace(/\/editor\/?$/, '');
const starter = await fetch(`${base}/prefabs/starter-scene.json`).then(r => r.json());
scene.replaceAll({ prefab: starter });
scene.remove({ id: 'cube' }); // Keep the starter light and sky environment.
for (const [index, geometryType] of ['box', 'sphere', 'torus'].entries()) {
  const id = `shape-${index}`;
  scene.setMaterial({ id, material: {
    color: ['#ff7659', '#51bca8', '#a58cff'][index], roughness: 0.4
  } });
  scene.create({ parentId: scene.info().rootId, node: {
    id, name: geometryType,
    components: {
      transform: { type: 'Transform', properties: { position: [(index - 1) * 3, 1, 0] } },
      geometry: { type: 'Geometry', properties: { geometryType } },
      material: { type: 'Material', properties: { name: id } }
    }
  } });
}
await scene.save();
```

Allow the objects to mount, then use `scene.look({id: scene.info().rootId})`
and `await scene.capture({helpers:false})` to review. Set your browser tool's
download listener **before** calling
`await scene.downloadGLB({filename:'three-shapes.glb'})` and verify the downloaded
file. GLB carries rendered geometry and materials; retain `scene.exportJSON()`
as well when you need editable components and behavior. Reacquire `window.scene`
after refreshing, then inspect `scene.info()` to continue.

## 2. Find the object

```js
const { node } = scene.find({ query: 'north brace' });
const id = node.id;
await scene.setMode({ mode: 'edit' });
scene.look({ id });
```

`find()` requires exactly one match. If the name is ambiguous, use
`scene.search({query:'brace',limit:20})` and choose an ID from its results.
Search summaries include component keys/types and local/world transforms, so they
are enough for framing and moving an object. Use `scene.get({id,resolved:true})`
when you need full properties: `components` contains authored values and
`resolvedComponents` includes defaults.

Only document nodes are editable. Imported model internals and generated geometry
are not separate editable nodes. See [reusable subtrees](#reusable-subtrees) to
unpack a prefab reference before editing its contents.

## 3. Edit and review

Writes and `look()` require Edit mode. Inspect the selected object and nearby peers
before changing it; use the scene's existing hierarchy and conventions.

```js
await scene.setMode({ mode: 'edit' });
scene.update({ id, transform: { position: [2, 4, 0] } });
scene.look({ id }); // Reframe after moving it.
const image = await scene.capture({ helpers: false });
```

Display `image.dataUrl` with the browser/agent tool and inspect the result.
Capture returns PNG data, dimensions, `revision`, and `currentRevision`. Wait for
assets to appear first: capture waits two animation frames, not for asset loading.
If its revisions differ, the document changed during capture; read and capture again.

`update()` can combine metadata, transform, and component patches into one undo
step. `scene.undo()` reverses an authored edit; `scene.redo()` reapplies it. Begin
with small edits you can review. Create missing objects with `create()`; use
[atomic batches](#atomic-batches-and-revision-guards) when changes depend on one another.

Check animation and physics in [Play mode](#control-playback-and-the-view), then
return to Edit before saving. A capture verifies appearance; it does not establish
that gameplay works.

## 4. Save

```js
const current = scene.info();
if (current.saveMethod === 'save') {
  const saved = await scene.save();
  // savedRevision is the saved document; currentRevision may include later edits.
} else {
  const json = scene.exportJSON();
  // Replace the scene file this page loads with this complete JSON string.
}
```

`exportJSON()` is always available and returns the complete authored scene as
pretty-printed JSON; it does not trigger a browser download. `export()` remains
available when a structured object is more useful. `save()` calls the function supplied
as `<PrefabEditor onSaveScene={saveDocument} ... />`; it does not open a file dialog.
If no save function or file destination is configured, return the JSON and state that
it has not been saved. Report what changed and what you verified.

## Edit component settings

Discover available types with `scene.components()`, then request only the schemas
you need. A schema describes supported properties, types, and defaults:

```js
scene.components({ names: ['Material'] });
const { node } = scene.get({ id, resolved: true });
// Inspect node.components and choose the intended instance key.
scene.patchComponent({ id, key: 'material', properties: { roughness: 0.8 } });
```

Here `material` must be a key found on that node; it is not necessarily the type
name `Material`. Use `setComponent({id,key,component})` to replace an instance,
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

If multiple components share a type, choose the intended instance key explicitly with `patchComponent`. Nested objects and arrays replace complete values; patches do not deep-merge them.

### Add behavior that is not registered

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
restart setup; data edits do not. Use `context.data` inside retained callbacks for
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

Reset remounts the live prefab subtree from the current document and clears
selection. It preserves mode, document revisions and undo history. It does not
reload the original file or undo authored edits. Assets may still be loading;
capture/export does not promise asset readiness. The host can pass `onResetScene`
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

`bounds` reports `{min,max,size,center}` in world coordinates for the live mounted subtree, or `null` if it has no geometry. It includes hidden meshes, instancing source meshes, and mounted helpers. It is not a collision query or a guarantee that assets have finished loading. Frame the contact points and inspect a low-angle capture after moving geometry; do not assume the ground is at zero.

Y is up; rotations are XYZ Euler radians. World means prefab document space,
including the root transform; an enclosing application object's transform is not included.
World commands require position, rotation and scale and reject singular parents,
degenerate decompositions and shear that cannot be represented as local TRS.

## Reusable subtrees

Use inline (embedded) prefabs for objects reused within one scene. Use a separate
prefab file for a reusable concept shared across scenes. Choose the form based on
where it is reused; repetition within a single scene does not require a separate file.

Use the tree's right-click menu (or node action menu): **Pack as Prefab**, **Unpack Prefab**, and **Export Prefab…**.
Packing captures the selected node and all descendants, including shared materials, into a self-contained JSON `PrefabRef` URL. The reference retains the selected node's ID, placement transform, name, and visibility flags. Duplicate it to place more instances. Embedded definitions survive ordinary scene saves without a file server; they are immutable snapshots, not an editable global prefab library. Relative assets still use the editor's `basePath`.

```js
scene.pack({ id: 'assembly' });
scene.duplicate({ id: 'assembly', newId: 'assembly-2' });
scene.transform({ id: 'assembly-2', position: [12, 0, 4] });
await scene.unpack({ id: 'assembly-2' });
const { prefab } = scene.exportPrefab({ id: 'assembly-2' });
```

`pack` and `unpack` each create one undo step. Unpack retains a placement wrapper and expands the asset below it, so scaled/rotated parents, reference transforms, extra components, and pre-existing children are preserved. Loading errors or revision changes during loading leave the document untouched. Unpacked node IDs/material names receive a unique scope to avoid collisions. Arbitrary ID strings in custom scripts or component properties are not rewritten: inspect behaviors that cross prefab boundaries before and after packing/unpacking.

`exportPrefab({id})` returns a complete nested subtree with shared materials, with the selected root's placement transform and visibility flags removed. It does not truncate or save. The GUI export uses the same extraction with the existing Save As/download flow. Unlike this nested export, `get()` returns a `node` with `childIds` and a separate flat `descendants` array; it does not return `node.children`.

### Discover and pack multiple assemblies

```js
const groups = scene.search({ parentId: 'world', recursive: true, groupsOnly: true, limit: 200 });
// Check nextOffset for pagination. Select disjoint assemblies from these results.
scene.packMany({ ids: ['assembly-a', 'assembly-b'], reuse: true });
```

`groupsOnly` filters before pagination; `recursive` searches all descendants of `parentId` instead of only direct children. `packMany` accepts 1–200 unique, disjoint node IDs and commits one undo step. Ancestor/descendant overlap, invalid nodes, or stale revisions reject the entire batch. To create nested prefabs, pack deepest modules first, then their containing assemblies.

`reuse: true` is an explicit choice for self-contained assemblies. It compares component values and ordered child structures within the batch, ignoring node IDs/display names and the selected root's placement. Equivalent assemblies share the first definition's URL, while every placement retains its own ID, name, flags, and transform. The returned `reused` list identifies each shared source. Internal display names come from that source; arbitrary custom ID references are not remapped. The default packs independent snapshots. Matching currently uses exact serialized component values; semantically equivalent defaults or differently ordered property keys need not deduplicate.

### Unpack the version currently on screen

Unpack uses the cached definition currently rendered by the reference. It scopes
node IDs and material names, including default materials, to preserve appearance inside
the outer scene. Custom ID strings are not remapped; verify behaviors that refer
across the prefab boundary. Each instance owns its editable state.

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

Validation is read-only and does not reserve the revision. Applying commits one
shared undo step in Edit mode. `validate()` checks schemas; `analyze()` offers
bounded structure/rendering hints. Neither measures draw calls/FPS or verifies
visual and behavioral correctness.

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
| `material` | `id, material` | Add/replace a shared material |
| `patchMaterial` | `id, patch` | Shallow patch of an existing shared material |

`key` is a component **instance key**, not its type; discover it with node queries.
Nested objects and arrays are replaced as values, never implicitly deep-merged.
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
`currentRevision`. Verify the browser tool's download result: a request does not
confirm that a file reached disk. Errors reject the call.

`downloadScreenshot()` captures the current camera; use `capture()` for inline PNG data.
`downloadGLB()` exports the rendered prefab object tree, excluding sibling JSX and
HTML. Wait for assets to load. GLB is useful for inspecting geometry in another tool,
but does not preserve React behavior; custom shaders may not survive export.
Keep JSON for further scene editing.

## Scene authoring rules

- Define materials on a node's `Material` component, for example
  `{ name: "concrete", color: "#888888", roughness: 0.9 }`. Other nodes
  reference it with `{ name: "concrete" }` only. Do not write a top-level
  `materials` table. Names resolve across loaded prefabs in one scene; unresolved
  references stay invisible until a definition loads. `scene.materials()` is a
  derived index of definitions in the current document, and `setMaterial` edits
  their owning components (or creates a definition node for a new name).
- Keep related nodes under a named parent; child transforms are relative to it.
- Inspect nearby peers before composing a node. Preserve the scene's conventions for
  component ownership, hierarchy, naming and functional versus visual-only details.
- Prefer a few well-placed objects over repeated decoration. Reuse the scene's
  established visual language instead of introducing a new one implicitly.
- Shared material edits affect every user. Prefer a local material/component change
  unless a scene-wide change is intentional.

Asset URLs resolve against `basePath`; remote URLs require CORS. `Model` keeps its
embedded materials; a sibling `Material` does not replace them. For primitive materials,
`texture` is the color map and `normalMapTexture` the normal map. Groups alone do not
reduce draw calls, and scaling a parent also affects children and colliders.

For image-based lighting/reflections, add an `Environment` node containing a sphere
with a `basic`, `BackSide` image material. A standalone sky sphere only draws the
image; the parent captures it as an environment map. Capture uses `frames={1}` and
refreshes when environment settings or visual assets change, not every frame.
See the [image environment batch example](https://github.com/prnthh/react-three-game/blob/main/docs/LIGHTING.md#image-environment).

## Query limits and API discovery

Use `scene.help()` for callable methods, `scene.components()` for component
schemas, and `scene.commands()` for batch inputs. These reflect the running version.
`get()` returns a node with `childIds` and flat `descendants`; use `exportPrefab()`
when you need a complete nested subtree. Neither saves a file.

Custom `description` and property `schema` metadata can explain units, references,
arrays and objects. Validation checks registered names/base types, not arbitrary
JSON Schema extensions.

Queries return copies. Search/material pages default to 50 entries (max 200).
`getMany` defaults to depth 0 and 100 nodes (max depth 5, 200 nodes); check `truncated`
and paginate larger results. Only nodes in the document are editable, not expanded
model/prefab internals or generated runtime geometry.

## Browser tool connection

Calls use ordinary page JavaScript; no MCP server is required. With CDP, use
`Runtime.evaluate`, `returnByValue:true`, and `awaitPromise:true` for async methods;
check `exceptionDetails`. Target the frame containing the editor, including for
cross-origin iframes. There is no cross-origin message bridge.

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
