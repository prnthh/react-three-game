# Standalone editor

Open `/editor` after running `npm run dev` from the repository root. For
programmatic scene edits, use the [Scene API](../../public/editor-scene-for-agents.md).

## Loading and saving

`/editor` opens the starter cube, light and sky environment. A `?map=` URL
loads that source document directly; browser drafts never replace its contents.
Reloading or reopening the editor loads the source again and discards unsaved
session edits. Use **Save Prefab** to download JSON, or `scene.exportJSON()` to
write the authored document back to its source file. Check `scene.info().saveMethod`
before using `scene.save()`; a custom host can supply its own persistence callback.

**New Prefab** starts from the template. Demo pages use their own persistence
settings. `scene.reset()` restores live objects from the current authored document
without discarding session edits.

## Initial view

The page derives its initial view from the first enabled authored perspective
camera, including parent transforms. An explicit `?camera=x,y,z` query overrides
that view. The starter scene and scenes without a suitable camera use the page's
fallback view. This URL behavior belongs to this host page, not every PrefabEditor.

## Scene tools and chat

The page supplies [DemoSceneTools](../components/agent/README.md), which adds chat
beside the library's structured Scene tools panel. It also registers the home
demo's PrefabGridStreamer component so saved city scenes can be opened here.
