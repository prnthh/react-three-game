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
