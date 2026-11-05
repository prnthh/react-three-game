# Relay Yard

Open `/demo/fps`. A playable, original 4v4 team-deathmatch blockout: you and three Remilio bots against four Milady bots. First to 40 kills or the highest score after five minutes wins. Death respawns you after three seconds; firing cancels spawn protection.

WASD moves, mouse looks, left button fires, right button aims, Shift sprints, Space jumps, hold C crouches, G throws a grenade, R reloads, and Escape pauses. Requires WebGPU. Touch controls use the left 40% of the screen for a floating movement joystick and the right side for drag look, with bottom-right action buttons. Pushing the joystick near its edge engages sprint, with a small release threshold to prevent flicker. The pause icon sits at the top center. Fire, aim and crouch are held; jump, reload and grenade are single presses. Release/cancel or pause clears held controls. Desktop uses mouse capture when available and automatically falls back to drag look when capture is unavailable.

The workshop and communications building each have two rooms, end entrances and courtyard exits. Containers break the center lane's sightlines; perimeter alleys connect the spawns. Bots use grid paths with wall checks on the connections, choose building flanks, check line of sight, reload, and respawn. Teammates block shots and are protected from friendly damage.

## Boundaries

```text
fakeserver/
  authority.ts       # Player slots, command validation, ticks and snapshots
  match.ts           # Shared gameplay rules and authoritative state
  bot/controller.ts  # AI intent, targeting, steering and pathfinding
shared/
  map.ts             # Pure scene-to-collider/spawn compilation
  world.ts           # Shared immutable query world for the local game
  protocol.ts        # Shared rules/config, packets and snapshot contract
scene.ts             # Authored map/gameplay document composition
components/          # Prefab views, effects, controls and host systems
session.ts           # Client sessions, local loopback and replay
```

The authority assigns controllers and owns gameplay outcomes. Humans and bots
produce the same command shape, and match rules resolve the results. Actor order and random-number consumption affect
determinism. Static map collision uses Box3D through `shared/physics.ts`.

`map.json` owns scenery, collision and spawn markers; `gameplay.json` owns
manager/player bindings and actor slots. `scene.ts` composes them while preserving
IDs and rejecting duplicates. The compiler expands packed references and applies
parent transforms, including nonuniform scale, reflection and shear. Use acyclic packed prefab references for map compilation. The editor loads the
authored documents for editing; the match owns physics. Export map edits and start a new
match to apply them.

`shared/protocol.ts` owns command/snapshot types and rule constants.
`MatchAuthority` validates sequenced input for assigned actor IDs, consumes action
edges once, expires stale held input, and publishes owned snapshots. Snapshots
omit AI navigation and random state. The loopback connection provides command exchange and copied snapshots within
the browser process.

`page.tsx` owns the session and mounts one advancement driver, the input/menu/audio
bridge and `PrefabRoot`. Registered FPS component views resolve the manager by
scoped node ID and project snapshots onto their nodes. Bindings control their consumers independently of the host lifetime. The player controller moves its node;
its authored Camera and held equipment follow as children.

The local host advances from render time at 60 Hz and pauses with the menu.
`LocalSession` runs the authority in the browser process.

## Assets

Pockit characters come from the existing local Pockit projects, corresponding to <https://pockit.world/milady>:

- `pockit-remilio.glb`: `pockit.world/public/remilio/remilio.glb`; Remilio Maker rig with embedded idle, walk and run clips.
- `pockit-milady.glb`: `pockit.world/public/models/human/pockit/milady.glb`; includes the blink clip only. Idle, walk and run clips are retargeted from the Remilio rig.
- `relay-carbine.glb`: original decorative game model created with Blender MCP. Editable source is `docs/public/models/fps/relay-carbine.blend`.
- `relay-grenade.glb`: original Blender-authored grenade, shared by held and thrown views. Editable source is `docs/public/models/fps/relay-grenade.blend`.

The containers, workbenches, communications cabinets, and antenna use Blender-authored GLBs (`relay-container`, `relay-cargo`, `relay-desk`, `relay-equipment`, `relay-antenna-mast`, `relay-antenna-dish`). Their editable asset scenes are in `docs/public/models/fps/relay-environment.blend`. Map nodes use `Model` for visuals and independent `MeshCollider` components imported from the GLBs’ `_convcolonly` proxy meshes. After exporting assets, run `npm run build && node scripts/import-fps-colliders.mjs` from the repository root; `--check` verifies the map is current. The authority consumes serialized map collision data.

The map uses simple PBR surfaces and locally generated gunshot audio.

## Model collision authoring

The map uses imported collision-only model proxies. See the library's
[collision import conventions](../../../COMPONENTS.md#model-collision-authoring)
for suffixes, emitted components and runtime ownership. Bake colliders into the
map for the authority to load as collision data.

## Animation and grenade presentation

Locomotion phase and foot-contact counters advance at authority ticks and are copied into each actor snapshot, including the unseen first-person body. Both footstep events and visible poses read that saved timing. Contact markers are sampled from the shipped walk/run foot plants; retargeted Milady preserves their phase. Normal movement uses walk (4.6 m/s reference), sprint uses run (7 m/s), with threshold hysteresis and preserved phase between gaits. Playback scales with actual movement speed each authority tick, with independent mixers and crossfades between idle, walk and run. `animation.ts` adapts world-space bone rotations between the different bind poses while preserving target limb lengths. Clips are cached per model; horizontal root motion is removed so the simulation retains control of movement. Pausing freezes animation playback.

External action animations live in `/models/fps/animations/`: `crouch.fbx`, `crouch-aim.fbx`, `throw.fbx`, and `death.fbx` supply full-body actions. They load through FBXLoader and stay separate from both GLBs. Native Remilio tracks bind directly; Milady retargeting preserves authored vertical displacement to align crouching and dying with the ground. Death plays once over 2.7 seconds, then holds until the existing 3-second respawn. Moving crouch retains the crouch idle pose.

Crouch/aim state and throw timers replicate in snapshots. Crouching reduces speed to 1.8 m/s and lowers camera, muzzle and hit volumes by 0.55 m. Each life supplies two grenades. G starts the 2.2-second throw; the release marker is 0.8 seconds, sampled from the hand's forward swing. Rules own projectile velocity, gravity, swept box collisions, bounce, a 2.5-second fuse, and distance-scaled blast damage within 6 m. Walls block blast damage and teammates are protected; self-damage is possible. Death cancels an unreleased throw. Bots use the same command and occasionally throw toward visible enemies when teammates are clear. Grenade/explosion views use a fixed mesh pool; sounds use the existing positional occlusion/reverb path. The first-person grenade uses a simple windup presentation.

## Profiling

Profile authority rules and the local snapshot adapter headlessly in Node. Use
Chrome to measure scene loading, frame intervals and rendering with the same
viewport, camera and match seed across runs. Repeat each comparison to establish
normal variation.

Actor and snapshot buffers are retained between ticks. Shots own copied endpoint
arrays. Bot target selection uses a linear nearest-target scan and 20% distance
hysteresis.

## Surfaces and decals

The map uses shared tiled materials for concrete, metal, asphalt and checker
flooring. Labels and floor marks are children of their target meshes. See
[surface mapping and decals](../../../COMPONENTS.md#surface-mapping-and-decals)
for the reusable component contracts.

The original SVG texture/decal assets in `/textures/fps/` regenerate with `node scripts/generate-fps-surfaces.mjs`. Existing checker textures and ground normals are reused. Add new assets to the picker with `node docs/public/generate-manifest.mjs`.

## Spatial audio

All actors emit gunshots and grounded, animation-contact-driven footsteps. Client snapshot ticks deduplicate shot cues; footsteps ignore jumps, teleports, death and paused updates. Indoor tile and outdoor grit use different synthesized samples. The camera drives the Web Audio listener; HRTF panners provide world-space direction and inverse-distance falloff. Samples are cached, distant sounds are culled, concurrent voices are capped at 24, and a master compressor limits overlapping gunfire. Pausing stops active voices and unmounting closes the context. Deploy/resume and active mouse presses unlock audio. Wall and crate occlusion uses three map-box visibility rays per audible cue, low-pass filtering and attenuation. Open doorways transmit direct sound. Two shared short convolution reverbs represent the buildings; their returns fade with listener room changes. The reverb send inherits source distance and occlusion, and pause discards all tails. Occlusion is sampled at cue playback against the static map.

## Controllers

`ActorController.command(match, actor, dt)` supplies the same `Command` for every actor. `MatchAuthority` assigns player-input controllers to human slots and seeded `BotController` instances to the rest, samples their reusable command buffers, then advances `stepMatch` with a complete actor-command map. Bot route planning, target selection, limited turning and analog movement throttle live in the bot controller. Bots wait to face a target before firing; all actors use the same weapon spread. Bot navigation randomness is separate from weapon randomness. The controller parity regression checks 1,200 ticks against the player command boundary, including resulting combat state, retained command buffers and read-only world access.

Bullet impacts are resolved by the authority alongside hitscan damage. Shot snapshots carry the actual endpoint, impacted material (`metal`, `concrete`, `ground`, `body`, or `none`) and victim ID. Clients synthesize and spatialize a single material-specific impact per shot, including impacts on the local actor; sky misses stay silent. Surface sounds are nudged 2.5 cm toward the incoming ray to avoid self-occlusion at the wall boundary. Listener orientation follows the camera each frame, so HRTF left/right changes as you turn. Impact effects use synthesized samples.

The authority validates shots and publishes hit events. Clients own sample choice, audio mixing, occlusion and spatialization.

## Weapon visuals

`components/CombatEffects.tsx` owns bounded client-only combat presentation: 32 layered flash slots, 160 glow/tracer/spark slots, 128 smoke/dust slots, and 64 fading surface marks, rendered as four instanced batches. TSL reads per-instance opacity; textures are small procedural canvas masks. Two shared, shadowless point lights supply brief muzzle illumination. Both character guns and the first-person gun register a muzzle socket, so visual shots originate at the barrel while authority keeps its aim-ray hit detection. The view weapon's recoil updates every frame.

Shots drive brief varied flash petals and a white core, light muzzle smoke, fast short tracers clamped to the hit endpoint, material-specific sparks/dust and flat surface marks. Hits produce material-specific impacts. Effects have their own lifetime and shot cursor, independent of the HUD refresh and short-lived snapshot tracer list; effect cursors preserve their position through pause and resume. Dust uses ordinary depth testing. Particles, lights, textures and decals belong to client presentation.

Weapon recoil is gameplay state: authority accumulates vertical kick on accepted shots, includes the existing kick in the hit ray, recovers it at fixed ticks, and clears it on respawn. Snapshots include `recoilPitch`. Clients send raw look intent and render camera pitch as raw input plus replicated recoil. Visual weapon kick remains a cosmetic client effect. Bots traverse the same recoil rules as human slots.

Small overhead indicators identify each character’s team. Combat particle materials use Three's `MeshBasicNodeMaterial` and TSL for per-instance opacity. Texture masks are canvas-generated and particle motion is CPU-updated in fixed-capacity presentation pools.

## Authority and replay

Snapshot schema 4 includes raw vertical aim (`pitch`), an owned gait state (walk/run/idle, cycle phase, cumulative contacts), and continuous `crouchAmount` / `aimAmount` transition progress. Playback validates the recording schema before loading frames. Positions, heading, aim stance, recoil, ammunition, health, deaths/respawn, throw timing, projectiles, shots and explosion results come from authority. Bots aim vertically at the target's current stance and share player movement/fire rules. Conflicting sprint/fire/aim/crouch intent is resolved in those rules. Remote gun pitch uses saved aim plus recoil. Live mouse sensitivity and key mapping remain client input collection; only immediate local look is predicted. Replay view ignores device input entirely. Crouch animation sampling uses saved simulation time.

`MatchAuthority(seed, humanActorIds, saveFrame?)` emits an owned snapshot initially and after every authority tick when a sink is supplied. `LocalSession(seed, saveFrame?)` exposes that same optional hook. Supplying a sink enables recording; the demo killcam supplies a bounded history sink. Save the emitted frames to capture transient shots and explosions. Playback uses saved authoritative outcomes.

```ts
const recording = createRecording();
const live = new LocalSession(317, frame => recording.frames.push(frame));
// Persist JSON.stringify(recording) using a file/stream adapter when needed.
const playback = new ReplaySession(JSON.parse(JSON.stringify(recording)));
// Supply playback wherever the scene currently accepts a ClientSession.
```

`ReplaySession` reuses scene snapshot buffers, ignores input, supports pause and sequential playback, and validates format/world/schema/contiguous ticks. It caps playback advancement to 100 ms per render to preserve the short event window after stalls. Tests compare saved outcomes tick-by-tick and check shot/footstep delivery at different render rates. The demo uses it for the automatic killcam described below. In-memory full-tick snapshots are an opt-in debugging format; production recordings should stream/compress them. Bump the world/recording version when incompatible map or presentation assets change. Gameplay results and locomotion/contact timing are authoritative. Each playback generates its cosmetic particle placement, fades and synthesized sound variation.

## Killcam

The demo uses `KillcamSession`, a small presentation wrapper around `LocalSession`. A bounded 151-frame authority history supplies approximately two seconds leading up to a death. Damage records `lastKiller` for bullets and grenades, supplying the replay viewpoint. On death, the client plays saved frames from that actor's first-person view, briefly holds the lethal outcome, then returns to live state before the normal three-second respawn. Self-kills skip the killer view. Every respawn resets pending input and adopts the authored spawn facing. The live authority keeps simulating; replay input is replaced with neutral intent and queued actions are cleared when returning. Pause pauses both timelines.

The viewed actor's body is hidden and their weapon, aim, ADS, recoil, HUD and positional audio become the first-person presentation. Actor 0 has a world model so the killer can see the victim. View epochs reset sound/event cursors, particle pools, surface marks and reverb tails across timeline switches. The replay banner distinguishes recorded authority state from the live respawn countdown. Headless tests verify attribution, the lethal frame, ongoing live simulation, input isolation, pause, safe return and respawn.

The viewed actor's full animated world body and world rifle remain in the sun's shadow pass. Their meshes use layer 1 while the first-person camera sees layer 0; the shadow camera includes both. Switching killcam viewpoints restores the previous actor's normal visibility and makes the newly viewed actor shadow-only. The world rifle supplies the weapon shadow, reusing the character rig and gameplay pose.

## Authoring spawn points

Open `/demo/fps/editor` (or **Edit Map** from the game menu), then expand **Map → Spawn Points**. This editor exports only the map document; save/export it as `map.json` in this demo folder. Move/rotate a spawn node using its Transform; Y rotation determines facing. Its `FPSSpawnPoint` component has a team selector for Alpha / Remilio or Bravo / Milady. Editor-only teal/coral body outlines and forward arrows show position and facing; selected markers turn white. These markers supply spawn metadata. Duplicate nodes with unique IDs to add points, or disable unwanted nodes. Both teams need at least one enabled point. Spawn groups support nested translation, scale and Y rotation. Keep their X/Z rotations at zero so characters stay upright.

The match authority compiles these markers when loading the map and uses the team’s authored point order for both initial placement and respawns (wrapping when there are fewer points than actors). Export/save editor changes back to the map document, then load a new match to apply them. Spawn placement follows authored order deterministically. Spawn configuration stays on the authority; clients and killcams receive the resulting actor transforms through existing snapshots.

## Gameplay rules

[shared/protocol.ts](shared/protocol.ts) owns movement, stance, weapon and health
constants; [match.ts](fakeserver/match.ts) applies them for every actor. Crouch and
aim reverse from current progress, overhead clearance gates standing, and
conflicting sprint/fire/reload/throw intents resolve in authority rules. Health
recovery runs after accepted damage; replay consumes saved HP. Tune gameplay
in those rule sources.

[BotController](fakeserver/bot/controller.ts) owns navigation, retained targets and
reaction policy and supplies intent only. It shares actor rules with human input; those rules resolve stance and combat outcomes. Controller-parity tests
feed equivalent intent through both paths and compare resulting ticks.

Snapshots and recording callbacks receive owned copies, including nested gait
state and shot endpoints. Serialization copies the declared public fields explicitly. Compiled world data
and rule constants are shared locally, separately from gameplay snapshots.

## Verification

`docs/tests/fps.test.mjs` covers wall and friendly shot occlusion, spawn shields, ammunition, score termination, navigation through doors, collision, reload, respawn and a deterministic full bot match. Run with the existing `npm test` command.
