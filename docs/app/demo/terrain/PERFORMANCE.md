# Terrain profiling

This is a historical measurement record. For current defaults, generation and
profiling commands, use the [workshop guide](README.md). Earlier samples below
used larger maps and a different working tree.

## Resource sharing — 2026-10-29

Measured in the local development build, in the in-app browser, from a stationary overview camera. These are single-run diagnostic samples, not hardware-independent guarantees. Frame intervals are display-paced; no GPU timestamp profiling was used.

## Repeated-map baseline and alternatives

| Configuration | Median / p95 frame ms | Draws including shadows | Triangles including shadows | Textures | Tracked GPU MB |
| --- | --- | --- | --- | --- | --- |
| Original, 64 subdivisions | 8.3 / 10.4 | Not captured | Not captured | 701 | 2061.2 |
| Shared layer samplers + geometry, 64 | 8.3 / 8.7 | 202 | 1,622,065 | 111 | 81.1 |
| Shared resources, shadows disabled | 8.3 / 9.2 | 102 | 802,865 | 107 | 48.5 |
| Shared resources, 32 subdivisions | 8.3 / 8.8 | 202 | 405,553 | 111 | 80.9 |

The initial resource count probe read draw counters after automatic reset, so baseline draws/triangles are intentionally omitted. Subsequent runs disable auto-reset while the probe owns sampling, reset once per frame, and restore the previous policy on unmount. Initial allocated geometries dropped from 103 to 4 by using the existing scene geometry pool.

A Chrome CPU sampling profile (`/tmp/terrain-baseline.cpuprofile`) showed renderer `_renderObjectDirect`, `_update`, `updateForRender`, and GPU buffer/bind-group submission among the principal active samples; idle time dominated overall. The large resource count led to inspecting texture ownership: each terrain material cloned six layer samplers and uploaded them independently.

## Chosen design

- Share repeat/color-space sampler variants by source texture and source version. Reference-count ownership; never mutate or dispose the source asset. Weight maps remain independently editable.
- Use the existing scene geometry pool, keyed by height asset/version and geometry parameters. This benefits identical geometry, not unique height maps.
- Use the existing scene material pool for material lifetime, with a tile-specific key because weights and brush uniforms are tile-local.
- Keep full mesh detail and dynamic shadows: neither comparison improved the warmed frame median on this machine. These remain useful lower-end quality options.
- Keep individual tile meshes. A merged mesh would reduce culling granularity and complicate painting. Instancing would need per-instance weight texture indexing (atlas/array), compatible height geometry or GPU displacement, and matching picking/bounds. The current measurements justify resource sharing first.

## Culling

Terrain geometry computes its bounding box and sphere after height displacement; meshes retain Three's default frustum culling. A focus operation reduced measured draws from 202 to 127. Camera and shadow passes cull separately, so off-camera shadow casters may still draw. Ordinary scene mesh/model paths default to culling; instance batches use spatial cells and recompute combined bounds. Skinned meshes deliberately default to culling off. Culling skips draw submission, not React or all scene traversal.

## Painting

The scene component registry supplies candidates. The brush excludes locked, hidden, unavailable, and palette-incompatible terrain. Ray/brush bounds reject irrelevant candidates before mesh raycasts or map painting. Interpolation happens in world space; every stamp projects into all intersecting tile maps, including neighbors at a seam. Each changed map uploads once per input sample. PNG encoding finishes before a single atomic document batch, so one undo restores the whole stroke. Cancellation restores every touched preview.

Tests cover seam footprints, cross-tile cancellation, atomic undo/redo, zero pressure, locking, incompatible palettes, and shared sampler ownership. Browser validation painted outside the selected tile and verified a single Undo disables further undo and enables Redo.

## Continuous master maps / unique tile crops

At the time of this measurement, the demo generated a continuous 2,561×2,561 height and weight field and slices it into 100 unique 257×257 pairs with shared border samples. All 360 PNG borders are verified by the generator. The map occupies 320×320 world units, uses a 48-unit height range, and derives rock/dirt/grass/sand weights globally from height and slope before slicing.

In the unique-map overview: median 8.3 ms, p95 9.7 ms, 204 draws, 1,638,449 triangles including shadows, 103 allocated geometries, 111 textures, and 106.1 MB of tracked GPU resources. Unique heights naturally require distinct geometry; the sampler-sharing benefit remains. Browser panel size changed during this session, so these figures demonstrate resource scaling and a healthy warmed frame interval, not a controlled timing comparison against the earlier table. A second CPU profile including camera drags was saved to `/tmp/terrain-unique-maps.cpuprofile`; renderer work and `intersectsFrustum` are visible among active samples, with idle time dominant. The generated PNG set including masters is about 7.4 MB on disk. Use `?profile=1&maps=repeated` to repeat the shared-height comparison.

## Terrain collision residency

`TerrainPhysics` prepares triangle-mesh BVHs in a module worker, one tile at a time, with nearest-first priority. Main-thread geometry extraction/submission is also limited to one job at a time. Shapes stay cached; switching residency creates/removes only static bodies. Exactly two nearest bounds are selected; a temporarily unprepared target holds the character until ready.

A clean-load Play session with all 100 unique tiles prepared and a five-second walk measured 2 active bodies, 7 total activations, maximum body activation 0.7 ms, maximum residency update 1.3 ms, and maximum geometry extraction/worker submission 1.3 ms. The last worker build took 3.8 ms off-thread. Warm frame median was 8.3 ms and p95 8.8 ms, with 106.3 MB tracked GPU resources. These are local browser measurements, not guarantees on other hardware. CPU collider-cache memory is not included in the GPU counter. The profile HUD exposes these physics counters for further testing.


## Map resolution comparison — 2026-10-31

| Configuration | Tile width | Height / weight maps | Mesh spacing | Weight sample spacing | RGBA weight GPU storage, 100 tiles |
| --- | --- | --- | --- | --- | --- |
| Previous | 32 | 257² / 257² | 0.5 | 0.125 | 25.20 MiB |
| Default | 32 | 65² / 65² | 0.5 | 0.5 | 1.61 MiB |
| Finer paint | 32 | 65² / 129² | 0.5 | 0.25 | 6.35 MiB |
| Bigger tiles | 64 | 65² / 65² | 1 | 1 | 1.61 MiB |

The default reduces map pixel counts by 93.6%. Height bytes at every existing vertex are unchanged for the same seed and offsets, so the base mesh, raycasts and physics colliders retain their shape. Material transitions and paint strokes become coarser; shallow material-driven GPU displacement may change because it samples the interpolated weight texture. The shared layer albedo/normal/displacement/roughness maps keep their detail and 4-unit repeat size.

For the default seed, the 200 tile PNGs total 4,310,607 bytes before and 652,936 after (84.9% less, excluding repeated-map copies). The GPU column is calculated RGBA8 storage without mipmaps, not total renderer memory. Height images feed CPU geometry and are not sampled by the terrain shader. Browser image decoding, canvases and paint snapshots add CPU memory; each full RGBA copy scales with the same pixel count. Compressed PNG size is not GPU storage.

Browser resource check (2026-10-31): the same overview with 257² versus 65² maps reported 132.2 versus 108.6 MiB of total tracked GPU resources, with 205 draws and 1,638,737 triangles including shadows in both. The optimized view prepared all 100 colliders with two active. These are resource checks, not a controlled frame-time benchmark; the historical performance notes used a different working tree.
