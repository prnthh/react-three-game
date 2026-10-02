# Point-and-click demo

Open `/demo/stage` to play or `/demo/stage/editor` to edit the office and junkyard.

- Scene JSON owns the player model, camera, hotspots, dialogue pages and door destinations.
- `PlayerCharacter` moves the player node and selects the built-in AnimatedModel's idle/walk state. Movement is direct across the floor, without pathfinding.
- `StageInteraction` creates a proximity sensor, or references an existing one with `activationNodeId`. Clicking walks toward the hotspot; entering its sensor activates it.
- `StageCameraFollow` follows the player within a screen-space dead zone and respects axis locks.
- `page.tsx` only composes the event provider, canvas and `StageGame` host component.
- `StageGame`, mounted inside `GameCanvas`, owns clicks, destinations, dialogue and scene changes in React state. Its `PrefabRoot` children use `useGameObject` to move live objects and play animations without changing the scene document.
- `DialogueBox` owns text reveal and optional browser speech. Voice starts enabled; the Voice button mutes it. Advancing, closing, muting or leaving the scene cancels speech. Text remains usable when speech is unavailable or blocked by browser playback policy.
- `AnimatedSceneTransition` plays door animations. Interaction sensors run only in Play mode.

Add a scene to `scenes.ts`. A door's `targetScene` matches its scene ID; `spawn` gives the player's arrival position. Custom components register once in `registerComponents.ts`; inspectors come from their schemas.

The editor route composes `PrefabEditorProvider`, `GameCanvas`, `PrefabEditorScene`, and `PrefabEditorPanel`, just as a separate game project can.

Keep authored settings in JSON and session state in React. Register behaviors that
need per-node editor settings (hotspots, sensors, camera follow); ordinary host
components such as `StageGame` and `PlayerCharacter` do not need registration.
Mount object-facing host components beneath `PrefabRoot` so local node IDs resolve
through its scene APIs. The fullscreen HTML HUD passes pointer input through to the
scene except on its buttons.

Speech uses the browser's [SpeechSynthesis API](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis)
and available device voices, with no API key or audio assets. This demo owns the
page's speech queue; cancellation clears that queue. Speech does not control page
advancement: click once to reveal the text and again to advance.
