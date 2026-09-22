# Killbox demo

- `page.tsx`: scene selection, weapon range, HUD, component registration.
- `FirstPersonPlayer.tsx`: player spawn, movement, camera, footsteps.
- `PlayerInteractions.tsx`: aiming, damage, grabbing and throwing.
- `playerState.ts`: scene-scoped player capability shared with NPCs.
- `NPCManager.tsx`: NPC movement, animation, damage and ragdolls.
- `ElevatorMover.tsx` / `OrbMover.tsx`: authored movement before the physics step.

Enter Play and click the canvas to capture the pointer. WASD/arrows move, Space jumps, 1–4/wheel select weapons, and left click attacks. The Gravity Gun uses right click to pick up/drop, and left click to throw a held object. Escape releases the pointer.

Each lift has a separate, stationary boarding sensor that emits its activation event. The platform remains a solid kinematic body.

Keep spawn configuration stable when changing weapons. Physics state must survive HUD updates. Check scene switching and Edit/Play transitions when changing runtime ownership.
