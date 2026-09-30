# Editor API for agents

A scene (or **prefab**) is a JSON document of nodes and component settings.
Registered React components supply behavior and declare editable settings.
The window API edits this document and shares undo history with the visual editor.
Animation and physics change live objects, not the document or its revision.
`exportScene()` returns authored settings; PNG and GLB exports capture live objects.

Use the library in any React app; the hosted website is optional.
[Minimal editor and viewer apps](https://github.com/prnthh/react-three-game#minimal-react-app-with-an-editor)
show setup and component registration.

## 1. Connect and inspect

Execute JavaScript in the browser tab containing `PrefabEditor`, or in its iframe:

```js
window.reactThreeGame.listEditors();
// Set editorId to the intended returned ID; do not assume "main".
const api = window.reactThreeGame.editors[editorId];
api.getSceneInfo(); // Mode, revision, rootId, selection, history, canSave.
api.describeComponents(); // Available types.
api.findNodes({ name: 'target name', limit: 20 }); // Replace with the user's target.
```

Choose node IDs from the results. `getNodes({ids, resolved:true})` returns authored
settings in `components` and defaults filled in under `resolvedComponents`.
A component **schema** describes its supported settings and types:

```js
api.describeComponents({ names: ['Rotator'] }); // Use a discovered type name.
```

Writes require **Edit** mode; use `await api.setMode({ mode: "play" })` to check behavior.
A **revision** is the scene version returned by a read. Pass it as `expectedRevision`
when editing so a newer change cannot be overwritten. If rejected, reread and adjust
commands; validation does not lock the scene.

If `window.reactThreeGame` is absent, check that `PrefabEditor` has loaded and
`agentTools` is not false. `GameCanvas`/`PrefabRoot` run scenes without this API.
`showUI={false}` hides editor panels but keeps the API and mode unchanged. After
navigation or reload, call `listEditors()` and select the editor again.

## 2. Register behavior only if missing

Reuse a registered component when it fits. Otherwise create a module like this:

```tsx
// Rotator.tsx — example of a new behavior, only needed if rotation is missing.
import { useFrame } from '@react-three/fiber';
import { registerComponent, useGameObject, useNode,
  type Component, type ComponentViewProps } from 'react-three-game/viewer';

type Props = { speed: number };
function View({ properties, children }: ComponentViewProps<Props>) {
  const object = useGameObject();
  const { editMode } = useNode();
  useFrame((_, delta) => {
    if (!editMode && object.transform) object.transform.rotation.y += properties.speed * delta;
  });
  return <>{children}</>;
}
const Rotator: Component<Props> = {
  name: 'Rotator', description: 'Rotate around Y in play; speed is radians per second.',
  properties: { speed: { default: 1, step: 0.1 } },
  View,
};
registerComponent(Rotator);
```

Import `./Rotator` from the module rendering `PrefabEditor`. Save pending scene edits
before reloading, then select the editor again and verify its new schema. The same
registration is needed in a viewer loading the scene: JSON stores type names and
settings, not React implementations.

## 3. Edit nodes

Each attached component has a key under `node.components`; that key can differ from
its type name. This helper updates an existing component or adds it if absent.
A **batch** applies its commands together as one undo step:

```js
function configureComponent(api, id, type, properties) {
  const read = api.getNodes({ ids: [id], resolved: true });
  const node = read.nodes.find(node => node.id === id);
  if (!node) throw new Error(`Node not found: ${id}`);
  const existingKey = Object.keys(node.components ?? {})
    .find(key => node.components[key]?.type === type);
  const key = existingKey ?? type;
  if (!existingKey && node.components?.[key]) throw new Error(`Component key is occupied: ${key}`);
  const command = existingKey
    ? { op: 'patchComponent', id, key, properties }
    : { op: 'component', id, key, component: { type, properties } };
  const batch = { expectedRevision: read.revision, commands: [command] };
  api.validateBatch(batch);
  return api.applyBatch(batch);
}
// Example after discovery: configureComponent(api, chosenNodeId, 'Rotator', { speed: 2 });
```

If multiple components share a type, choose the intended key explicitly with
`patchComponent`. To create objects, use `add`; the assembly example below shows
nodes, geometry, materials and a model in one batch.

## 4. Review and save

```js
api.getNodes({ ids: [id], resolved: true }); // Check the edited settings.
api.focusNode({ id }); // Frame a mounted object; Edit mode only.
const image = await api.captureView();
// { mimeType: 'image/png', dataUrl, width, height, revision, currentRevision }
```

Display `image.dataUrl` with the agent tool, inspect the image, then adjust. Capture
waits two animation frames and renders the current camera, but does not wait for
models/textures to load. HTML panels are excluded; canvas helpers can appear. If
revisions differ, edits occurred during capture: read and capture again. Check
animation/physics in Play separately, then return to Edit to save:

```js
const current = api.getSceneInfo();
if (current.canSave) {
  const saved = await api.saveScene({ expectedRevision: current.revision });
  // savedRevision is the saved document; currentRevision may include later edits.
} else {
  const { prefab } = api.exportScene();
  // Write JSON.stringify(prefab, null, 2) to the scene file this page loads.
}
```

Edits and `exportScene()` stay in memory. `saveScene()` calls the function supplied
as `<PrefabEditor onSaveScene={saveDocument} ... />`; it does not open a file dialog.
If no save function or file destination is configured, return the JSON and state that
it has not been saved. Report what changed and what you verified.

## Download PNG or GLB

```js
await api.screenshot({ filename: 'review.png' });
await api.exportGLB({ filename: 'scene.glb' });
```

Set the browser tool's download listener before calling. These work in Edit or Play,
clear selection, and request a download without opening menus. Defaults are
`screenshot.png` and `scene.glb`; filenames cannot include directory paths.
Results contain `downloadRequested`, `filename`, `mimeType`, `revision`, and
`currentRevision`. Verify the browser tool's download result: a request does not
confirm that a file reached disk. Errors reject the call.

`screenshot()` captures the current camera; use `captureView()` for inline PNG data.
`exportGLB()` exports the rendered prefab object tree, excluding sibling JSX and
HTML. Wait for assets to load. GLB is useful for inspecting geometry in another tool,
but does not preserve React behavior; custom shaders may not survive export.
Keep JSON for further scene editing.

## Author an organized assembly

Use a named parent so the whole group can be moved together. Repeated boxes use
unit geometry with dimensions in `Transform.scale`; matching built-in materials
share rendering resources. Reuse `materialId` when edits should affect all its users.

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
// const batch = assemblyBatch(api, parentId, 'courtyard-1', modelUrl, textureUrl);
// api.validateBatch(batch);
// api.applyBatch(batch);
```

Use real asset URLs. Paths resolve against `basePath`; remote URLs require CORS.
`Model` keeps its embedded materials; a sibling `Material` does not replace them.
For primitive materials, `texture` is the color map and `normalMapTexture` the normal map.
Read `advisories` from batch results or `analyzeScene()` for rendering/organization
suggestions; these are not measured FPS or draw calls. Groups alone do not reduce
draw calls, and changing scale on existing nodes also affects children and colliders.

For image-based lighting/reflections, add an `Environment` node containing a sphere
with a `basic`, `BackSide` image material. A standalone sky sphere only draws the
image; the parent captures it as an environment map. Capture uses `frames={1}` and
refreshes when environment settings or visual assets change, not every frame.
See the [image environment batch example](https://github.com/prnthh/react-three-game/blob/main/docs/LIGHTING.md#image-environment).

## Reference

`api.help()` lists callable methods. `api.describeCommands()` supplies command
schemas; `describeComponents({names:[...]})` supplies fields and evaluated defaults.
For dependent settings, pass context, for example:

```js
api.describeComponents({
  names: ['Geometry'], properties: { Geometry: { geometryType: 'sphere' } },
});
```

Custom `description` and property `schema` metadata can explain units, references,
arrays and objects. Validation checks registered names/base types, not arbitrary
JSON Schema extensions.

Queries return copies. Search/material pages default to 50 entries (max 200).
`getNodes` defaults to depth 0 and 100 nodes (max depth 5, 200 nodes); check `truncated`
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
disables window exposure; `editorRef.current.agent` remains available to React code.

## Control playback and the view

```js
await api.setMode({ mode: 'play' });
// Observe behavior, then return to authored placement for another iteration.
await api.setMode({ mode: 'edit' });
await api.resetScene();
api.setSelection({ id: null });
api.setView({ position: [8, 5, 8], target: [0, 1, 0] });
const image = await api.captureView();
```

Reset remounts the live prefab subtree from the current document and clears
selection. It preserves mode, document revisions and undo history. It does not
reload the original file or undo authored edits. Assets may still be loading;
capture/export does not promise asset readiness. The host can pass `onResetScene`
to reset external game state before remounting. `getView()` reads camera position
and target; `setView()` works in Edit mode so gameplay cameras do not compete.
