# Prefab organization

Start with an inline definition in application code. Use **Pack as Prefab** to
mark an assembly `packed: true` in place, then duplicate it. Copies use its node
ID in `PrefabRef.prefabId`; the original keeps the full subtree. Export a separate prefab file when several
scenes share the same assembly or it needs independent URL loading.

Single-file demos live directly in this folder. Projects with multiple JSON files
have a folder named after the project, containing the main JSON and its supporting
prefabs. Assets such as models and textures stay in their own public folders.

- `brutalist-city/game-level.json`: city demo, with its chunks and building prefabs.
- `coolstuff/coolstuff.json`: warehouse demo, with `warehouse-rack.json`.
- `killbox/killbox.json`: Killbox, with player, NPC, and street prefabs.
- `detective-oni/detective-oni.json`: point-and-click entry prefab with a scene redirect, with
  `scenes/`, `characters/`, and a shared `dialogue.json`.
- `the-cave/the-cave.json`: empty point-and-click project scaffold.
- `parkour-course.json`: parkour playground with a spawn column and three packed inline brutalist towers.
- `parkour2.json`: preserved original parkour course.
- `rotator-demo.json`: standalone prefab document.

File-based prefab references use full public paths such as `/prefabs/killbox/npc.json`.
Scene redirects and dialogue paths are relative to the game folder.
Demo TypeScript stays under `app/demo`; game-specific wiring stays under `games/`.

Run `npm run generate-manifests --workspace docs` (or
`node docs/public/generate-manifest.mjs`) to rebuild `docs/public/manifest.json`.
This single catalog lists models, textures, sounds, and prefabs. Its `prefabs`
array includes documents with a prefab root, including nested scenes and game
entry prefabs.
