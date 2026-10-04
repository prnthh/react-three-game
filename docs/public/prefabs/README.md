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

Run `node docs/public/generate-prefab-manifest.mjs` from the repository root to
refresh only the prefab manifest, or `npm run generate-manifests --workspace docs`
for all asset manifests. The prefab manifest includes nested prefab documents and
includes game entry prefabs and excludes dialogue libraries, which have no prefab root.
