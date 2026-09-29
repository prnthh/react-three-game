# Jumper API playground

Run `npm run dev`, then open `/demo/jumper`. Select Play in the toolbar, click
**Click to look**, move with WASD and jump with Space. Ctrl or C starts a crouch slide.
Jump beside a wall to wallrun; Space kicks away from it. Esc releases the mouse.
The wide concrete ground catches missed jumps; returning to Edit restores the spawn pose.

The course uses axis-aligned solid platforms and walls with a kinematic body.
Platforms block side and underside entry as well as catching landings.
Keep surface rotations zero and one character playable. Slopes, moving platforms
and general mesh collision belong in a physics integration such as Crashcat.

## Start with the part you need

| Task | Copy |
| --- | --- |
| Fetch character data and populate a scene | [page.tsx](page.tsx) |
| Validate external data and map it to nodes | [roster.ts](roster.ts), [sample data](../../../public/data/jumper-characters.json) |
| Define editable character fields and attach a controller | [CharacterComponent.tsx](CharacterComponent.tsx) |
| Expose/query live platform capabilities | [SurfaceComponent.tsx](SurfaceComponent.tsx) |
| Change the course geometry | [saved prefab](../../../public/prefabs/jumper-course.json) |
| Change jumping rules | [movement.ts](movement.ts) |

The roster is fetched once, validated, then converted into a stable prefab. It is
an initial import: subsequent inspector/API edits are not overwritten by polling.
To load another roster, deliberately replace the document. For temporary NPCs
that should not be saved, compose separate React views/prefab instances instead.

## Tune it through the running editor

In Edit mode, in the page's main JavaScript context:

```js
const api = window.reactThreeGame.editors.jumper;
api.describeComponents({ names: ['JumperCharacter', 'JumperSurface'] });
api.findNodes({ component: 'JumperCharacter' });
const read = api.getNodes({ ids: ['character-runner'] });
const key = Object.keys(read.nodes[0].components).find(
  key => read.nodes[0].components[key].type === 'JumperCharacter'
);
api.applyBatch({
  expectedRevision: read.revision,
  commands: [
    { op: 'patchComponent', id: 'character-runner', key,
      properties: { speed: 6, jumpSpeed: 10, jumpBoost: 2, slideBoost: 3, wallRunSpeed: 7 } },
    { op: 'transform', id: 'entry-lamp', position: [0, 2.55, -1.5] },
  ],
});
api.getNodes({ ids: ['character-runner', 'entry-lamp'], resolved: true });
```

One undo restores both edits. Play uses the edited settings. `exportScene()` returns
configuration, not the player's current position or velocity. Browser access and
save adapters are covered in the [agent guide](../../../editor-api-for-agents.md).

The component schema supplies both inspector fields and agent metadata. Movement
uses live objects and host-owned state; it does not edit the document each frame.
The roster importer enforces one playable character. Preserve that constraint
when editing—the component schema cannot validate relationships between nodes.

## Movement tuning

- Idle jumps go straight up. Moving jumps add `jumpBoost` along existing momentum or movement input; wall jumps also kick outward.
- Ctrl/C gives `slideBoost` once when crouching while moving on the ground. Holding it decelerates to a complete stop; jumping carries the remaining momentum.
- Set a `JumperSurface`'s `solid` field to enable its sides and ceiling. Airborne contact while moving along a side starts a wallrun, with reduced gravity and `wallRunSpeed` as its minimum speed. Runs last up to two seconds; wall jumps briefly disable reattachment.
- Mouse turns create a small camera sway. Wallrunning leans the camera away from the surface; crouching lowers the eye height. Camera effects are smoothed and kept separate from mouse aim.

The fixed-step state machine and camera-roll calculation live in [movement.ts](movement.ts).
The [timestep loop](timestep.ts) advances simulation at 120 Hz and interpolates the
previous/current positions for rendering, keeping movement smooth between ticks.
Catch-up is capped at 100 ms after a stall; respawns reset both poses. The controller
projects the interpolated pose onto the live node and camera without per-frame document edits.

## Concrete course

The playground loads [the saved course](../../../public/prefabs/jumper-course.json)
and adds characters from the roster. [ConcreteComponent.tsx](ConcreteComponent.tsx)
provides shared, procedural concrete materials. Rubble is decorative; solid slabs
provide collision. The 256 × 256 ground sits 1.5 units below the course so missed
jumps are recoverable.

Edit the course in the playground or through `window.reactThreeGame.editors.jumper`.
Use `api.help()` to discover the workflow. Export the scene when ready to persist
changes; this demo has no server save adapter. The page adds the character roster
to the course at load time, so keep roster-owned characters out of the course file.

## Keep the course inexpensive

Repeated boxes use unit geometry with dimensions in `Transform.scale`, allowing
shared-material meshes to instance while remaining individually editable. Collision
sizes are local to the same transform. Avoid unique geometry dimensions for every
stone, or disabling instancing without a reason.

`CourseShadows` keeps point-light shadows live in Edit mode and caches them in Play,
where the course has no moving shadow casters. Remove this policy or explicitly
invalidate shadows if you add moving lights or casters. Custom materials should use
`useSharedMaterialResource` so instances share materials and regroup after edits.
