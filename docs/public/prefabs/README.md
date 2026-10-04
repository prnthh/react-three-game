# Prefab organization

Single-file demos live directly in this folder. Projects with multiple JSON files
have a folder named after the project, containing the main JSON and its supporting
prefabs. Assets such as models and textures stay in their own public folders.

- `brutalist-city/game-level.json`: city demo, with its chunks and building prefabs.
- `coolstuff/coolstuff.json`: warehouse demo, with `warehouse-rack.json`.
- `killbox/killbox.json`: Killbox, with player, NPC, and street prefabs.
- `detective-oni/detective-oni.json`: point-and-click entry prefab with a scene redirect, with
  `scenes/`, `characters/`, and a shared `dialogue.json`.
- `the-cave/the-cave.json`: empty point-and-click project scaffold.
- `parkour-course.json` and `rotator-demo.json`: standalone prefab documents.

Prefab references use full public paths such as `/prefabs/killbox/npc.json`.
Scene redirects and dialogue paths are relative to the game folder.
Demo TypeScript stays under `app/demo`; game-specific wiring stays under `games/`.

Run `npm run generate-manifests --workspace docs` (or
`node docs/public/generate-manifest.mjs`) to rebuild `docs/public/manifest.json`.
This single catalog lists models, textures, sounds, and prefabs. Its `prefabs`
array includes nested scenes and game entry prefabs, excluding dialogue libraries
that have no prefab root.
