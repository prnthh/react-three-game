# Terrain normal-map provenance

Grass, dirt and sand normals were generated with ImageGen from their matching
`*-512.jpg` albedo references. They represent generated relief estimates.
Rock retains its authored normal texture.

The generated maps are opaque 1024×1024 PNGs using tangent-space OpenGL (+Y)
normals. They preserve the albedo's UV alignment and repeating edges, with shallow
relief: grass blades, compacted dirt and pebbles, and especially subtle sand grain.
Flat normal is RGB (128, 128, 255); RGB channels encode surface direction.

The terrain renderer samples them as linear data and shares each texture across
tiles. Keep these reusable material assets in source control. Procedural demo
height/weight maps follow the separate [generation workflow](../../../../app/demo/terrain/README.md#rebuild-the-sample-maps).
