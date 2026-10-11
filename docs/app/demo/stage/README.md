# Point-and-click games

Open `/demo/stage`. Detective Oni is playable; The Cave is an empty project.

`page.tsx` registers components and composes the game selector, providers, canvas,
`PrefabRoot`, and DOM HUD. Gameplay is implemented by prefab components.

## Game driver

`GameDriver` takes `rootFolder="/prefabs/detective-oni"` and loads
`detective-oni.json` as a normal prefab. Its `SceneRedirect` component points to
`scenes/office.json`. Both files use the ordinary prefab schema.

`useGameDriver()` provides the current prefab and `changeScene(path, spawn?)`.
Paths are relative to the game root. Door components point directly to scene JSON;
the driver handles loading, cancellation, errors, and scene replacement. Each
scene visit mounts fresh entity components. Optional `basePath` supports URL prefixes.

Scenes place characters using the library's `PrefabRef` component. Placement
transforms live in the scene; model, collider, and controller live in the character
prefab. `Walkable` components on floor nodes issue player movement requests.
The player's registered component handle lets cameras and interaction sensors
find it across nested prefab scopes.

The catalog in `games/` supplies names and root folders for URL loading.

## Entity drivers

This demo shares characters across scenes using files under
`public/prefabs/<game>/characters/`. For scene-local props, pack inline assemblies
and duplicate their placements.
Its model component loads the skinned model and animations; its collider and
`CharacterDriver` are authored in the same prefab. For example:

```json
{
  "type": "CharacterDriver",
  "properties": {
    "id": "stage-office-npc",
    "role": "npc",
    "modelNodeId": "stage-office-npc",
    "dialogue": "dialogue.json",
    "action": "talk",
    "activationNodeId": "stage-office-npc-trigger"
  }
}
```

The registered component type is the pointer to its controller script:
`CharacterDriver` maps to `components/CharacterDriver.tsx`. JSON references
the behaviors registered by the application.

- A player `CharacterDriver` owns movement destination, facing, and idle/walk state.
- An NPC `CharacterDriver` owns its pending interaction and dialogue cursor.
- `InteractionDriver` gives objects examine/interact dialogue, or a scene link.
  It owns its proximity state, pending click, dialogue cursor, and door animation.
- `InteractionCollider` creates a sensor. Drivers can instead reference a separate
  sensor with `activationNodeId`, as the partner prefab does.

Entities listen to the library's existing `click` and contact events. They issue
movement requests to the player and scene changes to the game driver. A transition
notification temporarily locks entity input while a door animates and loads its
next scene. Each entity owns its pending interaction.

## Dialogue

Each driver's `dialogue` property is a JSON path relative to the game root.
Detective Oni uses one `dialogue.json` for all character and examine/interact lines:

```json
{
  "partner": {
    "talk": ["Hello, detective."],
    "examine": ["Your partner is studying the case."],
    "interact": ["You hand over the evidence."]
  }
}
```

The driver's `id` selects the entry and `action` selects its lines. The driver
loads that file when activated, owns the page index, and cancels stale dialogue
requests when another entity is clicked or the scene changes.

`OverlayHUD` presents the active entity's text and advance callback. The entity
owns dialogue progress. The HUD renders regular DOM alongside the canvas and owns
the voice toggle. Advancing, closing, muting, or unmounting cancels speech.

## Content and editing

```text
public/prefabs/detective-oni/
  detective-oni.json      # entry prefab with SceneRedirect
  dialogue.json          # all talk/examine/interact entries
  scenes/                # scene layouts + character PrefabRef placements
  characters/            # model + collider + controller prefabs
```

Use the standard editor to author scenes and component properties:
`/editor?map=game:detective-oni/office` or
`/editor?map=game:detective-oni/junkyard`. Test full gameplay with its game driver
in `/demo/stage`. The editor saves to browser storage; export JSON and write it
to the source file to update the checked-in scene.

To start The Cave, add its character and scene prefabs, add a `SceneRedirect` component to `the-cave.json`, and
add dialogue entries. The game driver discovers content through these URLs.
