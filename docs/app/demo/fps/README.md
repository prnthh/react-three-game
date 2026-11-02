# Relay Yard

Open `/demo/fps`. A playable, original 4v4 team-deathmatch blockout: you and three Remilio bots against four Milady bots. First to 40 kills or the highest score after five minutes wins. Death respawns you after three seconds; firing cancels spawn protection.

WASD moves, mouse looks, left button fires, right button aims, Shift sprints, Space jumps, hold C crouches, G throws a grenade, R reloads, and Escape pauses. Requires WebGPU. Touch controls use the left 40% of the screen for a floating movement joystick and the right side for drag look, with bottom-right action buttons. Pushing the joystick near its edge engages sprint, with a small release threshold to prevent flicker. The pause icon sits at the top center. Fire, aim and crouch are held; jump, reload and grenade are single presses. Release/cancel or pause clears held controls. Desktop uses mouse capture when available and automatically falls back to drag look when capture is unavailable.

The workshop and communications building each have two rooms, end entrances and courtyard exits. Containers break the center lane's sightlines; perimeter alleys connect the spawns. Bots use grid paths with wall checks on the connections, choose building flanks, check line of sight, reload, and respawn. Teammates block shots but take no friendly damage.

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
produce the same command shape; match rules do not import bot code or choose
outcomes in the view. Actor order and random-number consumption affect
determinism. Static map collision uses Box3D through `shared/physics.ts`.

`map.json` owns scenery, collision and spawn markers; `gameplay.json` owns
manager/player bindings and actor slots. `scene.ts` composes them while preserving
IDs and rejecting duplicates. The compiler expands packed references and applies
parent transforms, including nonuniform scale, reflection and shear. URL prefab
references and cycles are rejected during map compilation. The editor loads the
authored documents without starting physics. Export map edits and start a new
match to apply them.

`shared/protocol.ts` owns command/snapshot types and rule constants.
`MatchAuthority` validates sequenced input for assigned actor IDs, consumes action
edges once, expires stale held input, and publishes owned snapshots. Snapshots
omit AI navigation and random state. The loopback connection exposes command
exchange and copied snapshots rather than authority state. This is an in-process
API boundary, not isolation from other code in the browser.

`page.tsx` owns the session and mounts one advancement driver, the input/menu/audio
bridge and `PrefabRoot`. Registered FPS component views resolve the manager by
scoped node ID and project snapshots onto their nodes. Disabling a binding removes
its consumers without stopping the host. The player controller moves its node;
its authored Camera and held equipment follow as children.

The local host advances from render time and pauses with the menu. A remote host
would construct `MatchAuthority(seed, humanActorIds)`, submit authenticated actor
commands, tick independently at 60 Hz and publish recipient snapshots. Transport,
prediction/reconciliation and lag compensation remain unimplemented. Dynamic
props, character pushing and navigation over multiple elevations are also outside
this demo.

## Assets

Pockit characters come from the existing local Pockit projects, corresponding to <https://pockit.world/milady>:

- `pockit-remilio.glb`: `pockit.world/public/remilio/remilio.glb`; updated Remilio Maker rig with embedded idle, walk and run clips.
- `pockit-milady.glb`: `pockit.world/public/models/human/pockit/milady.glb`; includes the blink clip only. Idle, walk and run clips are retargeted from the updated Remilio rig. Dedicated rifle-holding animations remain an art task.
- `relay-carbine.glb`: original decorative game model created with Blender MCP. Editable source is `docs/public/models/fps/relay-carbine.blend`.
- `relay-grenade.glb`: original Blender-authored grenade, shared by held and thrown views. Editable source is `docs/public/models/fps/relay-grenade.blend`.

The containers, workbenches, communications cabinets, and antenna use Blender-authored GLBs (`relay-container`, `relay-cargo`, `relay-desk`, `relay-equipment`, `relay-antenna-mast`, `relay-antenna-dish`). Their editable asset scenes are in `docs/public/models/fps/relay-environment.blend`. Map nodes use `Model` for visuals and independent `MeshCollider` components imported from the GLBs’ `_convcolonly` proxy meshes. After exporting assets, run `npm run build && node scripts/import-fps-colliders.mjs` from the repository root; `--check` verifies the map is current. The server consumes the serialized map and never loads render assets.

The map is a gameplay blockout with simple PBR surfaces, not a finished environment-art pass. Gunshot audio is generated locally; no external asset downloads are needed at runtime.

## Model collision authoring

The map uses imported collision-only model proxies. See the library's
[collision import conventions](../../../COMPONENTS.md#model-collision-authoring)
for suffixes, emitted components and runtime ownership. Bake colliders into the
map so the authority can load it without render assets.

## Animation and grenade presentation

Locomotion phase and foot-contact counters advance at authority ticks and are copied into each actor snapshot, including the unseen first-person body. Both footstep events and visible poses read that saved timing. Contact markers are sampled from the shipped walk/run foot plants; retargeted Milady preserves their phase. Normal movement uses walk (4.6 m/s reference), sprint uses run (7 m/s), with threshold hysteresis and preserved phase between gaits. Playback scales with actual movement speed each authority tick, with independent mixers and crossfades between idle, walk and run. `animation.ts` adapts world-space bone rotations between the different bind poses without copying source limb lengths. Clips are cached per model; horizontal root motion is removed so the simulation retains control of movement. Pausing freezes animation playback.

External action animations live in `/models/fps/animations/`: `crouch.fbx`, `crouch-aim.fbx`, and `throw.fbx` are copied from the Maker's Idle Crouching, Crouch Scoped, and Throw previews; `death.fbx` is the newer Downloads/Dying.fbx. They load through FBXLoader and stay separate from both GLBs. Native Remilio tracks bind directly; Milady retargeting preserves authored vertical displacement so crouching and dying do not float at standing height. Death plays once over 2.7 seconds, then holds until the existing 3-second respawn. These assets are full-body actions; a dedicated moving crouch clip and first-person rigged arms remain art/presentation work (the current moving crouch retains its idle pose).

Crouch/aim state and throw timers replicate in snapshots. Crouching reduces speed to 1.8 m/s and lowers camera, muzzle and hit volumes by 0.55 m. Each life supplies two grenades. G starts the 2.2-second throw; the release marker is 0.8 seconds, sampled from the hand's forward swing. Rules own projectile velocity, gravity, swept box collisions, bounce, a 2.5-second fuse, and distance-scaled blast damage within 6 m. Walls block blast damage and teammates are protected; self-damage is possible. Death cancels an unreleased throw. Bots use the same command and occasionally throw toward visible enemies when teammates are clear. Grenade/explosion views use a fixed mesh pool; sounds use the existing positional occlusion/reverb path. The first-person grenade has a simple windup presentation, not rigged arms.

## Performance baseline for the session boundary

The authority and local snapshot adapter run headlessly in Node. Browser rendering costs must be profiled separately; these CPU rule benchmarks do not establish a GPU or frame-rate improvement. Actor and snapshot buffers are retained between ticks; shots are independent events with their own copied endpoint arrays. Bot target selection uses a linear nearest-target scan and 20% distance hysteresis instead of sorting a temporary target list each tick.

A local Node measurement on October 31, 2026 ran ten seeds × 6,000 ticks per pass (five warm passes after one warm-up). Median rules cost was 0.0189 ms/tick; the local command + two-snapshot pipeline including rules was 0.0271 ms/tick, an approximately 0.0082 ms/tick difference in that workload. Bot target behavior changed and browser rendering was active during the run, so this is an overhead estimate, not a before/after FPS comparison.

## Surfaces and decals

The map uses shared tiled materials for concrete, metal, asphalt and checker
flooring. Labels and floor marks are children of their target meshes. See
[surface mapping and decals](../../../COMPONENTS.md#surface-mapping-and-decals)
for the reusable component contracts.

The original SVG texture/decal assets in `/textures/fps/` regenerate with `node scripts/generate-fps-surfaces.mjs`. Existing checker textures and ground normals are reused. Add new assets to the picker with `node docs/public/generate-manifest.mjs`.

## Spatial audio

All actors emit gunshots and grounded, animation-contact-driven footsteps. Client snapshot ticks deduplicate shot cues; footsteps ignore jumps, teleports, death and paused updates. Indoor tile and outdoor grit use different synthesized samples. The camera drives the Web Audio listener; HRTF panners provide world-space direction and inverse-distance falloff. Samples are cached, distant sounds are culled, concurrent voices are capped at 24, and a master compressor limits overlapping gunfire. Pausing stops active voices and unmounting closes the context. Deploy/resume and active mouse presses unlock audio. Wall and crate occlusion uses three map-box visibility rays per audible cue, low-pass filtering and attenuation. Open doorways transmit direct sound. Two shared short convolution reverbs represent the buildings; their returns fade with listener room changes. The reverb send inherits source distance and occlusion, and pause discards all tails. This is a lightweight static-map approximation: no diffraction, acoustic portals, or continuous occlusion updates during an individual short sample.

## Controllers

`ActorController.command(match, actor, dt)` supplies the same `Command` for every actor. `MatchAuthority` assigns player-input controllers to human slots and seeded `BotController` instances to the rest, samples their reusable command buffers, then advances `stepMatch` with a complete actor-command map. The rules no longer infer bots from missing player input or use separate bot movement/weapon rules. Bot route planning, target selection, limited turning and analog movement throttle live in the bot controller. Bots wait to face a target before firing; all actors use the same weapon spread. Bot navigation randomness is separate from weapon randomness. The controller parity regression checks 1,200 ticks against the player command boundary, including resulting combat state, retained command buffers and read-only world access.

Bullet impacts are resolved by the authority alongside hitscan damage. Shot snapshots carry the actual endpoint, impacted material (`metal`, `concrete`, `ground`, `body`, or `none`) and victim ID. Clients synthesize and spatialize a single material-specific impact per shot, including impacts on the local actor; sky misses stay silent. Surface sounds are nudged 2.5 cm toward the incoming ray to avoid self-occlusion at the wall boundary. Listener orientation follows the camera each frame, so HRTF left/right changes as you turn. These are synthesized placeholder effects, not recorded Foley.

For a future network transport, keep this division: the server validates shots and publishes hit events; clients own sample choice, audio mixing, occlusion and spatialization. Local muzzle audio can be predicted and reconciled by shot ID, while damage/confirmed hit feedback remains authoritative. The current local snapshot adapter has no network loss or latency; a real transport must deliver/deduplicate events beyond the short-lived tracer snapshot window.

## Weapon visuals

`components/CombatEffects.tsx` owns bounded client-only combat presentation: 32 layered flash slots, 160 glow/tracer/spark slots, 128 smoke/dust slots, and 64 fading surface marks, rendered as four instanced batches. TSL reads per-instance opacity; textures are small procedural canvas masks. Two shared, shadowless point lights supply brief muzzle illumination. Both character guns and the first-person gun register a muzzle socket, so visual shots originate at the barrel while authority keeps its aim-ray hit detection. The view weapon's recoil updates every frame.

Shots drive brief varied flash petals and a white core, light muzzle smoke, fast short tracers clamped to the hit endpoint, material-specific sparks/dust and flat surface marks. Sky misses produce no impact. Effects have their own lifetime and shot cursor, independent of the HUD refresh and short-lived snapshot tracer list; paused snapshots never replay effects on resume. These are a procedural first pass, not CoD assets or a full volumetric/soft-particle renderer. Dust has ordinary depth testing; it does not yet fade against the scene depth buffer. No particles, lights, textures or decals enter authoritative state.

Weapon recoil is gameplay state: authority accumulates vertical kick on accepted shots, includes the existing kick in the hit ray, recovers it at fixed ticks, and clears it on respawn. Snapshots include `recoilPitch`. Clients send raw look intent and render camera pitch as raw input plus replicated recoil; the view never writes recoil back into input. Visual weapon kick remains a cosmetic client effect. Bots traverse the same recoil rules as human slots. The authority still runs locally via `LocalSession`; a remote server transport and client prediction/reconciliation are not implemented yet.

Character floor rings have been removed; the small overhead team indicators remain. Combat particle materials use Three's `MeshBasicNodeMaterial` and TSL for per-instance opacity. Texture masks are canvas-generated and particle motion is currently CPU-updated in fixed-capacity presentation pools, not a GPU compute simulation.

## Authority and replay

Snapshot schema 4 includes raw vertical aim (`pitch`), an owned gait state (walk/run/idle, cycle phase, cumulative contacts), and continuous `crouchAmount` / `aimAmount` transition progress. Older snapshot recordings are rejected rather than replayed with missing stance timing. Positions, heading, aim stance, recoil, ammunition, health, deaths/respawn, throw timing, projectiles, shots and explosion results come from authority. Bots aim vertically at the target's current stance and share player movement/fire rules. Conflicting sprint/fire/aim/crouch intent is resolved in those rules. Remote gun pitch uses saved aim plus recoil. Live mouse sensitivity and key mapping remain client input collection; only immediate local look is predicted. Replay view ignores device input entirely. Crouch animation sampling uses saved simulation time.

`MatchAuthority(seed, humanActorIds, saveFrame?)` emits an owned snapshot initially and after every authority tick when a sink is supplied. `LocalSession(seed, saveFrame?)` exposes that same optional hook. Core sessions allocate no recording frames unless a sink is supplied; the demo killcam supplies a bounded history sink. Save these frames rather than polling the HUD: transient shots and explosions could otherwise be missed. The schema retains results, so playback does not rerun AI, random spread, collisions or damage.

```ts
const recording = createRecording();
const live = new LocalSession(317, frame => recording.frames.push(frame));
// Persist JSON.stringify(recording) using a file/stream adapter when needed.
const playback = new ReplaySession(JSON.parse(JSON.stringify(recording)));
// Supply playback wherever the scene currently accepts a ClientSession.
```

`ReplaySession` reuses scene snapshot buffers, ignores input, supports pause and sequential playback, and validates format/world/schema/contiguous ticks. It caps playback advancement to 100 ms per render to preserve the short event window after stalls. Tests compare saved outcomes tick-by-tick and check shot/footstep delivery at different render rates. This is a minimal replay adapter, not a general replay browser, seek/rewind system, storage service, or network protocol. The demo now uses it for the automatic killcam described below. In-memory full-tick snapshots are an opt-in debugging format; production recordings should stream/compress them. Bump the world/recording version when incompatible map or presentation assets change. Cosmetic particle placement, fades and synthesized sound variation are not pixel/sample-identical between runs; gameplay results and locomotion/contact timing are authoritative.

Still deferred: remote transport, reliable event delivery under packet loss, prediction/reconciliation, lag compensation, and rewind/seek cleanup for transient VFX. The local adapter remains in-process. These additions should use this same authority and snapshot boundary, not move outcome decisions into the view.

## Killcam

The demo uses `KillcamSession`, a small presentation wrapper around `LocalSession`. A bounded 151-frame authority history supplies approximately two seconds leading up to a death. Damage records `lastKiller` for bullets and grenades; the replay never guesses from tracers or the kill-feed text. On death, the client plays saved frames from that actor's first-person view, briefly holds the lethal outcome, then returns to live state before the normal three-second respawn. Self-kills skip the killer view. Every respawn resets pending input and adopts the authored spawn facing. The live authority keeps simulating; replay input is replaced with neutral intent and queued actions are cleared when returning. Pause pauses both timelines.

The viewed actor's body is hidden and their weapon, aim, ADS, recoil, HUD and positional audio become the first-person presentation. Actor 0 now has a world model so the killer can see the victim. View epochs reset sound/event cursors, particle pools, surface marks and reverb tails across timeline switches. The replay banner distinguishes recorded authority state from the live respawn countdown. Headless tests verify attribution, the lethal frame, ongoing live simulation, input isolation, pause, safe return and respawn. The current authority is still local; this is not a networked server or client rollback implementation.

The viewed actor's full animated world body and world rifle remain in the sun's shadow pass. Their meshes use layer 1 while the first-person camera sees layer 0; the shadow camera includes both. Switching killcam viewpoints restores the previous actor's normal visibility and makes the newly viewed actor shadow-only. The separate view weapon does not cast a duplicate shadow. This reuses the existing character rig and gameplay pose, with no additional simulation body.

## Authoring spawn points

Open `/demo/fps/editor` (or **Edit Map** from the game menu), then expand **Map → Spawn Points**. This editor exports only the map document; save/export it as `map.json` in this demo folder. Move/rotate a spawn node using its Transform; Y rotation determines facing. Its `FPSSpawnPoint` component has a team selector for Alpha / Remilio or Bravo / Milady. Editor-only teal/coral body outlines and forward arrows show position and facing; selected markers turn white. These markers add no gameplay geometry or collision. Duplicate nodes with unique IDs to add points, or disable unwanted nodes. Both teams need at least one enabled point. Spawn groups support nested translation, scale and Y rotation; pitched/rolled spawn groups are rejected because characters stay upright.

The match authority compiles these markers when loading the map and uses the team’s authored point order for both initial placement and respawns (wrapping when there are fewer points than actors). Saved map changes take effect in a newly loaded match, not mid-match; export/save editor changes back to the map document. This is deterministic placement, not enemy-aware safe-spawn selection. Spawn configuration stays on the authority; clients and killcams receive the resulting actor transforms through existing snapshots.

## Gameplay rules

[shared/protocol.ts](shared/protocol.ts) owns movement, stance, weapon and health
constants; [match.ts](fakeserver/match.ts) applies them for every actor. Crouch and
aim reverse from current progress, overhead clearance gates standing, and
conflicting sprint/fire/reload/throw intents resolve in authority rules. Health
recovery runs after accepted damage; replay consumes saved HP rather than
recalculating it. Keep tuning in those sources rather than in presentation code.

[BotController](fakeserver/bot/controller.ts) owns navigation, retained targets and
reaction policy and supplies intent only. It shares actor rules with human input;
it does not write resolved stance or combat outcomes. Controller-parity tests
feed equivalent intent through both paths and compare resulting ticks.

Snapshots and recording callbacks receive owned copies, including nested gait
state and shot endpoints. Serialization copies public fields explicitly, so new
server-only fields do not silently enter the protocol. Compiled world data and
rule constants are shared locally but are not gameplay snapshots.

## Verification

`docs/tests/fps.test.mjs` covers wall and friendly shot occlusion, spawn shields, ammunition, score termination, navigation through doors, collision, reload, respawn and a deterministic full bot match. Run with the existing `npm test` command.
