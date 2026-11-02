# Components and host integration

Use registered components for editable behavior and rendering. The
[Rotator walkthrough](../README.md#4-add-behavior) introduces registration; this
guide covers composition, live handles, host state and animation. See
[editor extensions](editor-systems.md) for inspectors and authoring tools.

## Change a component

Copy [Rotator](app/demo/customcomponent/components/RotatorComponent.tsx) for a behavior, or
[Model](../src/runtime/components/ModelComponent.tsx) for an object view. Geometry and BufferGeometry render their own mesh, with rendering flags on the geometry component.
Register it as in the [custom component demo](app/demo/customcomponent/page.tsx).

Put editable fields and defaults in the definition; views receive resolved
properties. Return `children` to preserve subsequent components and child nodes.
Returning `null` suppresses that content.

Use React effects and R3F frames for behavior. `useComponentActive(enabled)`
combines Play mode with enabled/preparation state; gate effects and frame work
with its result. Visual previews may remain mounted in Edit. Effects must return
cleanup and tolerate React effect replay. Definitions have no separate lifecycle
callbacks; Runtime's script fields are implemented inside its own view too.

### Rendering composition

`category` groups the editor picker. `slot` chooses the object, geometry or
material composition role. The renderer orders wrappers, objects, geometry, then
materials inside the node's transform group; each view supplies its own R3F
objects and attachments. Geometry views compose their mesh and geometry;
material views attach inside them.

Portal components such as BoneAttachment use an ordinary view on a parent node;
child nodes own bone-local transforms. The portal does not own the target resource.

### Ownership and coexistence

`exclusive` names a node-level ownership constraint, independently of rendering
role. For example, use `exclusive: 'material'` for a material that competes with
built-in materials. Use constraints for competing transform, geometry/material
attachment or bone-parent ownership. Data and ordinary behaviors may coexist.

Runtime handle lookup returns the first live registration for a node and type.
Multiple SkinnedMesh or Terrain instances may coexist; node-keyed queries expose
the first match. Cleanup removes only its own registration and exposes the next
match. Component-instance targeting is not yet supported.

Scene-wide effects such as Environment and Fog have no node-level ownership
constraint; allowing multiple instances does not imply their effects blend.

### Inspector fields

Ordinary fields use the generated inspector. Keep custom controls in editor-only
`.editor.tsx` modules. Share mesh property definitions and editor helpers; the
built-in mesh components use a collapsed `Mesh options` section.

A data component supplies a definition and properties. A visual component also
supplies a `View`. For a custom visual helper, use an ordinary view:

```tsx
import { registerComponent, useNode,
  type ComponentViewProps } from 'react-three-game/viewer';

function GuideView({ properties, children }: ComponentViewProps<{ radius: number }>) {
  const editMode = useNode(node => node.editMode);
  const isSelected = useNode(node => node.isSelected);
  return <>
    {editMode && <mesh>
      <sphereGeometry args={[properties.radius, 12, 8]} />
      <meshBasicMaterial wireframe color={isSelected ? 'cyan' : 'gray'} />
    </mesh>}
    {children}
  </>;
}
registerComponent({
  name: 'Guide',
  properties: { radius: { default: 1, min: 0.01, description: 'Local radius in scene units.' } },
  View: GuideView,
});
```

The view inherits the node's transform; changing its settings supplies new
`properties` automatically. Ordinary descendant meshes participate in editor
picking. Return `children` to render other components and child nodes.
Import the registration module before loading its prefab in both editor and viewer.
The same property definitions generate inspector fields and window API
`describeComponents` output. Use `registerComponentEditor` from `/editor`
when the generated inspector needs custom UI. Agents discover the property schemas.

For a separate tool watching another node, subscribe to just the data it needs:

```tsx
import { usePrefabStore } from 'react-three-game/viewer';

function NodeLabel({ id }: { id: string }) {
  const name = usePrefabStore(state => state.nodesById[id]?.name);
  return <span>{name ?? id}</span>;
}
```

Mount this under the document's `PrefabStoreProvider` (provided by the editor).
`usePrefabDocument().get(id)` provides an immediate read. For reactive integration,
`usePrefabStoreApi()` exposes selector-based `subscribe`; return its unsubscribe
function from your effect. These subscriptions observe authored edits.

For runtime integration, define a token with `createNodeComponentType<T>()` and
publish your own value with `useRegisterNodeComponent(token, value)`. Other code
can use `useGameObject(id).getComponent(token)` for one node or
`useSceneComponents(token)` for a reactive list. Keep the value stable with
`useMemo` unless its data changes. Handles expose the live methods your game needs. The window API edits the
registered component's serializable authored properties.

Follow [ComponentRegistry](../src/core/ComponentRegistry.ts) →
[nodePlan](../src/runtime/prefabs/nodePlan.ts) →
[PrefabNode](../src/runtime/prefabs/PrefabNode.tsx).

`PrefabRoot` establishes a document instance and renders its root node. Shared
services live in `SceneRuntime`; loading and compilation live in `PrefabInstance`.
Within each node, read the document, compose its Views and children, then render
the transform group. The group has a separate subscription boundary so mode and
selection changes do not rerender static content.

Picking and selection policy belong to the editor's `EditorSelection` wrapper,
not `PrefabRoot`. This wrapper owns click cycling, drag rejection, locked-node
fallback and nested-prefab picking. Runtime rendering only reads host-supplied
selection state and forwards batched instance clicks. For a custom editor, wrap
`PrefabRoot` with `EditorSelection` from `/editor`; supply its document `store`,
`selectedId`, `enabled` and `onSelect` callback.

## Connect a host system

```tsx
import { useFrame } from '@react-three/fiber';
import { useGameObject, useScene } from 'react-three-game/viewer';

// Mount <PlayerView player={hostPlayer} /> as a child of PrefabRoot.
function PlayerView({ player }: { player: { position: [number, number, number] } }) {
  const object = useGameObject('player'); // Local authored node ID.
  const scene = useScene();
  useFrame(() => {
    if (scene.mode === 'edit') return;
    object.transform?.position.set(...player.position);
  });
  return null;
}
```

The host advances `player`; this view projects its position onto Three.js.
`useFrame` projects the latest host state on each rendered frame. Keep simulation
timing and state resets in the host; save authored changes through document edits.

Follow [gameObject](../src/runtime/scene/gameObject.ts) for stable node handles,
[SceneContext](../src/runtime/scene/SceneContext.tsx) for typed capabilities,
and [GameEvents](../src/runtime/scene/GameEvents.ts) for synchronous notifications.
`useGameEvent(name, handler)` keeps its subscription while the event name is
unchanged and calls the latest committed handler; no dependency array is needed.
The optional [Crashcat adapter](../src/plugins/crashcat/CrashcatRuntime.tsx)
steps its own physics world from R3F frames.

## Control model animation

`SkinnedMesh` clones the loaded model’s skeletons and creates one Three.js
animation mixer per model instance. Its runtime handle exposes that mixer and its actions. In a component, get the node with `useGameObject()`; in an event handler,
after the model has loaded:

```ts
import { LoopOnce } from 'three';
import { SKINNED_MESH_COMPONENT } from 'react-three-game/viewer';

const model = object.getComponent(SKINNED_MESH_COMPONENT);
const action = model?.getAction('Jump'); // Case-insensitive; null if missing.
if (model && action) {
  model.stop();
  action.reset().setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
}
```

For custom playback, author `animationState: ""` and let your controller choose
actions. Leave `autoUpdate` on for normal playback; set it to `false` if your game
calls `model.update(delta)` once per tick. Use the mixer's events for completion,
removing listeners on cleanup. `animationState` tracks the built-in state selector.
The model manages mixer lifetime; controllers choose and play live actions.

## Runtime scripts

`RuntimeComponent` (`type: "Runtime"`) compiles its `setup` and `update` strings
inside its own View. It uses React `useEffect` for setup/cleanup and R3F `useFrame`
for updates, just like other behavior Views. Runtime runs while enabled in Play, after preparation.
Code edits restart setup with fresh state; data edits keep it running.

Scripts read the current R3F store through `context.three` and resolve local
objects with `prefab.getObject(id)`. Return cleanup from setup or register it with
`context.onCleanup(fn)`. See the
[Runtime usage example](public/editor-scene-for-agents.md#add-behavior-that-is-not-registered).


## Model collision authoring

Core model decomposition recognizes `_col` / `-col` (visible triangle mesh),
`_colonly` / `-colonly` (collision only), and their `convcol` / `convcolonly`
variants (one convex hull per marked mesh). Blender duplicate suffixes such as
`.001` are accepted. Concave convex-proxy assemblies should use multiple marked
meshes; automatic convex decomposition is not performed. `_colinv` is not a supported suffix.

The importer emits engine-neutral `MeshCollider` data with local vertices and
indices, preserving the node hierarchy and transforms. `collisionNames: false`
opts out. The editor recognizes these markers on file import and decomposition.
`Model` hides collision-only proxy meshes, but loading a render asset alone does
not register physics: import/bake the collider components into the scene document
for both the client and headless server. Host adapters compile effective transforms
and choose native triangle meshes or convex hulls; they own physics lifetime.

## Surface mapping and decals

`UVMapping` is a built-in Geometry modifier: `unitsPerTile` sets a consistent local texture density across box faces, including the node's own authored scale. Material `repeat: true` enables wrapping; `repeatCount` and `offset` remain available for extra tiling and alignment. Ancestor scaling is not included by this UV modifier.

`Decal` uses Three.js `DecalGeometry`: add a decal node as a child of its target Geometry or static Model node. Transform places/rotates the projector relative to that parent; `size` is [width, height, depth]. Geometry is clipped to the parent's own mesh surfaces, including compound models, and ignores separate child nodes. Keep projection depth shallow to avoid the reverse face of thin objects. Projected geometry rebuilds when relative transforms or source geometry change, and follows parent motion without rebuilding. Skinned/instanced targets and shader-only displacement are not supported. `depthBias`, alpha textures and `renderOrder` remain available; decals do not add colliders.
