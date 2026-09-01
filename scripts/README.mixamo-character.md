# Mixamo stylized character generator

This Blender script builds a stylized low-poly T-pose humanoid, joins its
disconnected body parts into one mesh, rigidly weights each part to one bone,
and exports FBX. Body parts are authored as asymmetric cross-section lofts rather
than scaled primitives: the side profile includes a cranium, face, chin, chest,
belly, back, pelvis, thigh, knee, calf, heel, instep, and toe. The skeleton uses
standard `mixamorig:` bone names and contains no extra leaf bones.

Before joining the parts, the generator recalculates every disconnected shell's
normals outward and rejects non-manifold edges or zero/negative-volume geometry.

The generator follows a small explicit pipeline:

1. Build each declared body part as its own mesh.
2. Validate it and assign all vertices to its matching bone group.
3. Assemble the parts into one disconnected skinned mesh.
4. Build and parent the 22-bone armature.
5. Export the mesh and armature together as FBX.

Run it from the repository root:

```bash
/Applications/Blender.app/Contents/MacOS/blender --background \
  --python scripts/generate_mixamo_character.py
```

Options:

- `--output PATH`: destination FBX (defaults to
  `docs/public/models/human/mixamo-anatomical-character.fbx`, next to
  `onimilio.glb`).
- `--blend PATH`: also save the editable Blender scene.
- `--no-prefix`: use names like `Hips` instead of `mixamorig:Hips`.
- `--no-bevel`: keep the low-poly shapes' edges sharp.

For Mixamo, upload the generated FBX as a character. It is already rigged and
in T-pose, so animations should map directly to the named humanoid skeleton.
Mixamo's service can change, so keep the generated `.blend` as the editable
source of truth if an upload needs adjustment.

To embed downloaded animation-only FBX files into the character as named clips:

```bash
/Applications/Blender.app/Contents/MacOS/blender --background \
  --python scripts/embed_fbx_animations.py -- \
  --character docs/public/models/human/mixamo-anatomical-character.fbx \
  --clip idle=docs/public/models/human/anim/idle.fbx \
  --clip walk=docs/public/models/human/anim/walk.fbx
```

The embed script verifies that every clip uses the character's exact skeleton
before replacing the character FBX.
