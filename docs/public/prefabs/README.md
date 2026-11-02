# Prefab organization

For inline composition and packed assemblies, see the [prefab guide](../../PREFABS.md).
This directory contains saved scene documents and file-based assemblies.

Single-file demos live directly in this folder. Projects with multiple JSON files
have a folder named after the project, containing the main JSON and its supporting
prefabs. Assets such as models and textures stay in their own public folders.

- `brutalist-city/game-level.json`: city scene with packed building definitions, lighting, chunk settings and camera script. The home viewer loads this saved document; generation is a separate authoring step.
- `coolstuff/coolstuff.json`: warehouse demo, with `warehouse-rack.json`.
- `killbox/killbox.json`: Killbox, with player, NPC, and street prefabs.
- `detective-oni/detective-oni.json`: point-and-click entry prefab with a scene redirect, with
  `scenes/`, `characters/`, and a shared `dialogue.json`.
- `the-cave/the-cave.json`: empty point-and-click project scaffold.
- `parkour-course.json`: Concrete passage parkour course, with enclosed routes, local lights and authored renderer settings.
- `rotator-demo.json`: standalone prefab document.

File-based prefab references use full public paths such as `/prefabs/killbox/npc.json`.
Scene redirects and dialogue paths are relative to the game folder.
Demo TypeScript stays under `docs/app/demo`; game-specific wiring stays under
each demo's `games/` folder.

Run `npm run generate-manifests --workspace docs` (or
`node docs/public/generate-manifest.mjs`) to rebuild `docs/public/manifest.json`.
This single catalog lists models, textures, sounds, and prefabs. Its `prefabs`
array includes documents with a prefab root, including nested scenes and game
entry prefabs.
