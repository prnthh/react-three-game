# Parkour

`page.tsx` registers the demo components and opens the saved
`public/prefabs/parkour-course.json` scene in Play. The editor and playback use
that same document and component definitions.

Repeated assemblies are authored as `packed:true` owners. Copies reference the
owner's node ID with `PrefabRef.prefabId`; editing the owner updates its copies.
Keep placement transforms on the owner or copy. Geometry, collision surfaces and
weathering remain together inside each assembly.

The scene's Shared materials group contains ordinary named `Material`
definitions. Meshes reference those names. `ConcreteSurface` only adds procedural
mottling and pores; color and roughness belong to the referenced Material. Its
shader graph and compatible material variations share rendering resources.
`WeatheredGeometry` changes the visible geometry; `CollisionSurface` derives its
box from authored dimensions, preserving predictable movement surfaces.

Movement rules, fixed-step simulation and replay stay in demo code. The character
component projects simulation state onto its node and visual rig. HUD and input
are application integration. Lighting and renderer settings are authored in the
scene JSON.

Run `npm test --workspace docs` from the repository root for scene, material,
collision, movement and replay checks.

## Benchmarking a run

Open [/demo/parkour?debug](http://localhost:3000/demo/parkour?debug) and filter
the browser console for `[parkour-profile]`. Let the course settle, click the
canvas to capture the pointer, hold W, then press T to restart with the recorded
ghost. Compare the same route, viewport and browser across runs.

Each one-second record uses the home demo's frame measurements. `frameP95Ms`
and `longestFrameGap.gapMs` are wall-clock intervals between rendered-frame
callbacks. `longestFrameGap.startMs` locates the gap on the Performance timeline.
`longestLongFrameMs` comes from the browser's 50 ms long-animation-frame observer
and is null when unsupported.

`ticks` counts live fixed steps and `replayTicks` counts completed ghost steps.
Both stay at zero while the controls are unlocked. `simulationMs` totals elapsed
time in the fixed-step loop, including collision, recording, gait updates and
replay. `peakSimulationMs` is its most expensive invocation that second.
The character's authored `debug` property controls the third-person camera independently.
