# Mixamo character tools

Generate a rigged low-poly T-pose character with Blender:

```sh
/Applications/Blender.app/Contents/MacOS/blender --background \
  --python scripts/generate_mixamo_character.py
```

Default output: `docs/public/models/human/mixamo-anatomical-character.fbx`.
Options after `--`: `--output PATH`, `--blend PATH`, `--no-prefix`, `--no-bevel`.
The script validates geometry and uses `mixamorig:` bone names by default.

Embed animation-only FBX clips with the same skeleton:

```sh
/Applications/Blender.app/Contents/MacOS/blender --background \
  --python scripts/embed_fbx_animations.py -- \
  --character docs/public/models/human/mixamo-anatomical-character.fbx \
  --clip idle=docs/public/models/human/anim/idle.fbx \
  --clip walk=docs/public/models/human/anim/walk.fbx
```

The embed command checks skeleton compatibility before replacing the character file.
