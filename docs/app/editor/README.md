# Standalone editor

Open `/editor` after running `npm run dev` from the repository root. For
programmatic scene edits, use the [Scene API](../../public/editor-scene-for-agents.md).

## Loading and saving

`/editor` opens the starter cube, light and sky environment. A `?map=` URL
loads that source document directly.
Reloading or reopening the editor loads the source again and discards unsaved
session edits. Use **Save Prefab** to download JSON, or `scene.exportJSON()` to
write the authored document back to its source file. Check `scene.info().saveMethod`
before using `scene.save()`; a custom host can supply its own persistence callback.

**New Prefab** starts from the template. Demo pages use their own persistence
settings. `scene.reset()` restores live objects from the current authored document
while preserving session edits.

## Initial view

The page derives its initial view from the first enabled authored perspective
camera, including parent transforms. An explicit `?camera=x,y,z` query overrides
that view. The page uses its fallback view by default, including for the starter scene. These query parameters configure the standalone editor page.

## Scene tools and chat

The page supplies [DemoSceneTools](../components/agent/README.md), which adds chat
beside the library's structured Scene tools panel. It also registers the home
demo's PrefabGridStreamer component so saved city scenes can be opened here.
