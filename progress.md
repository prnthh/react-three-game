Original prompt: crashcat has ragdoll support, lets try building a simple ragdoll component and set up a demo scene that uses it

## Progress

- Inspected the existing crashcat runtime and physics prefab component.
- Plan: add constrained-pair collision filtering in the runtime, implement a reusable CrashcatRagdoll React component, and add a docs demo scene.
- Added constrained-body collision filtering to CrashcatRuntime.
- Added a reusable CrashcatRagdoll component with box limbs, swing-twist joints, optional stabilization, and mesh sync.
- Added `/demo/ragdoll` docs route with three ragdolls falling onto a static crashcat floor.
- `npm run build` at the package root passes. `docs/npm run build` compiles but fails on existing `/demo/assetviewer` prerendering before reaching this new route.
- Converted ragdolls into prefab nodes using a registered `CrashcatRagdoll` component. The component reads each node's world transform and portals the ragdoll into the scene root so crashcat world-space bodies and visible meshes stay aligned.
- Added node interaction handler plumbing for custom component views and spread those handlers onto the ragdoll wrapper group, so clicking a ragdoll can select its prefab node in edit mode. Removed the extra OrbitControls from the ragdoll demo.
- Reviewed React/R3F composition and perf: custom views now receive transform props plus world position, so the ragdoll component does not reach back into prefab node refs. Effect dependencies use scalar tuple values to avoid body recreation from fresh array props.
- Unified event flow: node clicks always emit `click`, crashcat contacts emit standard physics events plus configured aliases, and physics payloads are gated by `hasListeners`. Ragdolls now apply a click impulse in play mode without adding any per-body physics listeners.

## TODO

- Build and visually verify the ragdoll demo.
