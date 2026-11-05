# Terrain profiling

Open `/demo/terrain?profile=1` to display frame intervals, renderer resources and
terrain physics counters. See the [workshop guide](README.md) for map generation,
configuration and controls.

## Compare changes

Use the same browser, viewport, camera, build mode and map configuration for each
run. Record several runs on each revision and compare medians and variation.

1. Reload and record startup through scene readiness, including asset loading and
   collider preparation when testing Play.
2. Let the HUD complete its 120-frame warm-up, then collect its rolling 180-frame
   median and p95. Keep the tab visible during sampling.
3. Record draw calls, triangles, textures, geometries and tracked resource bytes
   at the same camera position.
4. Paint across a tile seam, then undo the stroke. Compare responsiveness and
   verify that one undo restores every touched tile.
5. Enter Play and walk across tile boundaries. Record active/prepared collider
   counts and activation, submission and residency-update costs.

Frame intervals reflect display pacing. Use Chrome's Performance panel to inspect
main-thread work and GPU profiling to measure GPU execution. Three's tracked
resource bytes estimate renderer allocations; evaluate CPU image, paint-history
and collider-cache memory separately.

## Comparison controls

| Query option | Comparison |
| --- | --- |
| `profile=1` | Show the profiling HUD |
| `maps=repeated` | Reuse height/weight maps across the grid |
| `segments=32` | Use 32 mesh subdivisions per axis |
| `shadows=0` | Render with shadows disabled |

Change one option at a time. The default scene uses the subdivisions in
`terrain-config.json`, unique tile maps and enabled shadows. Regenerate maps and
reload after changing map resolution in the configuration.

## Resource behavior

Repeat samplers are shared by source texture and version. Identical height maps
and geometry parameters share pooled geometry; unique heights produce distinct
geometry. Each tile owns its editable weight map and brush uniforms.

Terrain computes bounds after height displacement and includes visual material
displacement in those bounds. Each tile is culled independently for camera and
shadow passes. Focus a tile to compare a close view with the full-grid overview.

Painting projects each world-space stamp into intersecting editable tiles with
matching palettes. Each changed map uploads once per input sample. A completed
stroke encodes its maps and commits one scene-history action; cancellation
restores the touched previews.

`TerrainPhysicsRuntime` prepares collider BVHs in a module worker with nearest-first
priority. Prepared shapes stay cached for the scene lifetime. The workshop uses
`activeLimit={2}` to keep bodies for the nearest two tiles active. Choose an active
body budget that covers the actors requiring terrain collision in your scene.
