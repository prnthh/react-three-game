# Architecture and implementation patterns

React Three Game handles scene documents, component composition, rendering resources
and authoring. Node behavior can live in registered component Views or trusted
Runtime scripts. The host owns authoritative game state, simulation scheduling,
input, networking and persistence.

```text
Prefab data → document store → component views → R3F / Three objects
                   ↑
          visual editor + agent batches
```

Start with the [README examples](../README.md) for rendering, components and editing.
Use the patterns below when adding integrations or changing internals.

## Documentation map

| Reader task | Primary guide |
| --- | --- |
| First scene, editor and behavior | [README](../README.md) |
| Prefab composition, loading and streaming | [Prefabs](PREFABS.md) |
| Component views, live handles and host integration | [Components](COMPONENTS.md) |
| Inspector controls and editor tools | [Editor extensions](editor-systems.md) |
| Browser scene edits and tool calls | [Scene API](public/editor-scene-for-agents.md) |
| Authored lighting and renderer settings | [Lighting](LIGHTING.md) |
| Demo setup and application-specific behavior | [Examples](README.md) and each demo's README |

## Library and application boundaries

Keep reusable scene mechanisms in the library: document operations, resource
loading, preparation, batching, distance residency and authored rendering features.
Components expose editable configuration and own their effects and cleanup.
Omitted settings inherit Three.js and host defaults. Use existing React, R3F and Three.js behavior before introducing
another manager or lifecycle.

Keep world layout, travel policy, art presets, game rules and session wiring in
the application. Promote a demo component when its contract is useful independently of the originating demo;
remove fixed assumptions and give its resources a clear owner first. Authored
scene settings belong in JSON when they need to travel between editor and viewer.
Host JSX remains available for application integration and editor controls.

## Scene composition

JSON documents contain nodes with registered components. The document store owns
authored state; mounted Three objects and component handles own live state.

`PrefabRoot` establishes a document instance. `PrefabNode` resolves registered
views and composes them inside the node's transform group. Views own their R3F
objects, React effects and frame callbacks. The host schedules game rules. Component schemas supply defaults, generated inspector fields and agent
discovery. See [component composition](COMPONENTS.md#change-a-component).

`PrefabInstance` adds asset preparation, shader compilation and activation.
Static placements may opt into spatial residency through authored
`ChunkSettings`. See [loading and streaming](PREFABS.md#load-a-prefab).

Root-scoped components configure the outer scene before ordinary nodes mount.
Nested prefab copies inherit the enclosing scene configuration. The inspector and command evaluator enforce
root placement; see [authored rendering](LIGHTING.md#authored-sky-probes-and-render-settings).

## Demo organization

Each demo's `page.tsx` owns registration, providers and composition. Put custom
components in that demo's `components/` folder and game-specific wiring alongside
the page or under `games/<game>/`. Shared examples may import another demo's
component directly.

Start scenes inline; pack reusable assemblies within the document. Saved demo
files follow the [prefab directory conventions](public/prefabs/README.md).

## Browser tool ownership

`sceneAgentKnowledge.ts` owns concepts and operation descriptions;
`sceneTools.ts` binds them to structured tools and JSON examples. Browser
registration, the local panel and the demo chat use that shared catalog.
Component and command schemas remain the source of supported fields and defaults.
The demo owns chat transport, connection preferences and conversation policy.

For custom host registration, see [editor integration](editor-systems.md#browser-scene-tools);
for calls against a running editor, see the [Scene API](public/editor-scene-for-agents.md).

## Change authoring behavior

Use the [Scene API guide](public/editor-scene-for-agents.md) for copyable read/edit patterns.
Both the GUI and API write the serializable document store. Agent batches validate before committing one undo step.

| Change | Start here |
| --- | --- |
| Hierarchy or component mutation | [prefabStore](../src/core/prefabStore.ts) |
| Undo grouping | [prefabHistory](../src/core/prefabHistory.ts) |
| Scene API queries or browser exposure | [sceneAgent](../src/editor/agent/sceneAgent.ts), [sceneAgentBridge](../src/editor/agent/sceneAgentBridge.ts) |
| Batch operation | [sceneCommands](../src/core/sceneCommands.ts), [sceneCommandSchema](../src/core/sceneCommandSchema.ts) |
| Agent field discovery | [componentSchemas](../src/core/componentSchemas.ts) |
| Editor integration | [PrefabEditor](../src/editor/PrefabEditor.tsx) |

Command schemas supply the allowed fields used by both core validation and editor
convenience methods. Keep scene-specific checks in the command evaluator. It owns
input copying; synchronous adapters pass data through directly. Authored prefab properties are data, copied with `structuredClone`.

## Keep package boundaries

| Entry | Contains |
| --- | --- |
| `/core` | Definitions, document store, command evaluation, schemas, and model serialization |
| `/node` and `rtg` CLI | Node asset loading and scene conversion; CLI maps command files to core |
| `/browser` | Browser downloads and audio services |
| `/headless` | R3F scene construction in Node.js |
| `/viewer` and package root | R3F views and rendering resources |
| `/editor` | Visual editor, history and Scene API |
| `/plugins/crashcat` | Optional physics adapter |
| `docs/app` | Host applications and game-specific examples |

[SceneRuntime](../src/runtime/SceneRuntime.tsx) groups rendering providers.
Runtime modules are grouped by responsibility:

- `runtime/prefabs`: source loading, dependency preparation, and instance activation.
- `runtime/scene`: live scene contexts, object handles, events, and interaction.
- `runtime/components`: built-in component views; their inspectors live in `editor/components`.
- `runtime/rendering`: mesh batching and material instancing.
- `runtime/assets`: loaders and shared resource ownership/cache.
- `runtime/audio`: the scene listener and sound playback manager.
- `runtime/lighting`: the cascaded directional-light adapter used by the light component.
- `runtime/GameCanvas.tsx` and `runtime/SceneRuntime.tsx`: canvas setup and provider composition.

`core/` owns prefab data, the component registry, document store, document mutations,
and history. React store bindings live in `runtime/prefabs/PrefabStoreContext.ts`.
`editor/` owns authoring UI, inspector registration, agent commands, and file tools.
Dependencies flow from editor to runtime to core. Import authoring tools through
`/editor` and optional physics through `/plugins/crashcat`.

For resource changes, check startup, activation and unloading in a WebGPU browser.
Run `npm test`, `npm run build` and `npm --prefix docs run build`.

## Module imports and builds

Library source uses explicit `.js` relative imports, including `/index.js` for
barrels. TypeScript resolves these to their `.ts`/`.tsx` implementations and emits
Node-compatible imports and declarations directly; the package build is just
`tsc`. The library uses `bundler` type resolution for compatibility with peer
declarations. The docs webpack configuration resolves these paths to source files.

Run `npm run test:package` to check the packed CLI, native Node imports, and a
NodeNext TypeScript consumer.
