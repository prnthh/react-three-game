# Point-and-click demo

Open `/demo/stage` to play or `/demo/stage/editor` to edit the office and junkyard.

- Scene JSON owns the player model, camera, hotspots, dialogue pages and door destinations.
- `PlayerCharacter` moves the player node and selects the built-in AnimatedModel's idle/walk state. Movement is direct across the floor, without pathfinding.
- `StageInteraction` creates a proximity sensor, or references an existing one with `activationNodeId`. Clicking walks toward the hotspot; entering its sensor activates it.
- `StageCameraFollow` follows the player within a screen-space dead zone and respects axis locks.
- `page.tsx` coordinates clicks, dialogue and scene changes. `DialogueBox` owns text reveal; `AnimatedSceneTransition` plays door animations.

Add a scene to `scenes.ts`. A door's `targetScene` matches its scene ID; `spawn` gives the player's arrival position. Custom components register once in `registerComponents.ts`; inspectors come from their schemas.

The editor route composes `PrefabEditorProvider`, `GameCanvas`, `PrefabEditorScene`, and `PrefabEditorPanel`, just as a separate game project can.
