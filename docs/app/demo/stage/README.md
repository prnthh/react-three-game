# Point-and-click games

Open `/demo/stage`. Detective Oni is playable; The Cave is an empty project.

`page.tsx` registers components and composes the game selector, providers, canvas,
`PrefabRoot`, and DOM HUD. Gameplay is implemented by prefab components.

## Game driver

`GameDriver` takes `rootFolder="/prefabs/detective-oni"` and loads
`detective-oni.json` as a normal prefab. Its `SceneRedirect` component points to
`scenes/office.json`. There is no game manifest or separate scene schema.

`useGameDriver()` provides the current prefab and `changeScene(path, spawn?)`.
Paths are relative to the game root. Door components point directly to scene JSON;
the driver handles loading, cancellation, errors, and scene replacement. Each
scene visit mounts fresh entity components. Optional `basePath` supports URL prefixes.

Scenes place characters using the library's `PrefabRef` component. Placement
transforms live in the scene; model, collider, and controller live in the character
prefab. `Walkable` components on floor nodes issue player movement requests.
The player's registered component handle lets cameras and interaction sensors
find it across nested prefab scopes.

The catalog in `games/` contains only names and root folders; no JSON imports.

## Entity drivers

Every character is a prefab file under `public/prefabs/<game>/characters/`.
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
registered behaviors; it does not execute arbitrary JavaScript URLs.

- A player `CharacterDriver` owns movement destination, facing, and idle/walk state.
- An NPC `CharacterDriver` owns its pending interaction and dialogue cursor.
- `InteractionDriver` gives objects examine/interact dialogue, or a scene link.
  It owns its proximity state, pending click, dialogue cursor, and door animation.
- `InteractionCollider` creates a sensor. Drivers can instead reference a separate
  sensor with `activationNodeId`, as the partner prefab does.

Entities listen to the library's existing `click` and contact events. They issue
movement requests to the player and scene changes to the game driver. A transition
notification temporarily locks entity input while a door animates and loads its
next scene. There is no central list of pending entity interactions.

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

`OverlayHUD` only presents the active entity's text and advance callback. The
entity still owns dialogue progress. The HUD is regular DOM outside the canvas,
avoiding Drei Html's separate React-root lifecycle. It owns the voice toggle;
advancing, closing, muting, or unmounting cancels speech.

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
`/editor?map=game:detective-oni/junkyard`. Entity drivers remain inert without a game
driver; full gameplay runs in `/demo/stage`. The editor saves to browser storage
and exports JSON, rather than writing source files.

To start The Cave, add its character and scene prefabs, add a `SceneRedirect` component to `the-cave.json`, and
add dialogue entries. No TypeScript asset import list is needed.
