# Editing scenes in the browser

Use `window.scene` as the default interface for editing a running `PrefabEditor`, especially for large scenes. Run JavaScript in the browser frame that contains the editor. The API and inspector share the same scene and undo history.

- Start with `const scene = window.scene`, then call `scene.info()` and `scene.help()`. The standalone `/editor` opens a starter cube. For the home demo, open `/editor?map=/prefabs/brutalist-city/game-level.json`.
- Use `scene.search({ query, limit: 20 })` to find relevant node IDs. Collect related changes in one `{ expectedRevision: scene.info().revision, commands }` object. Pass that same object to `scene.validate()` and then `scene.batch()` so the edit can be undone as a unit.
- Check placement in the viewport or with `await scene.capture({ helpers: false })`. When asked to save, check `scene.info().saveMethod`. For `exportJSON`, write the string returned by `scene.exportJSON()` to the intended prefab file.

The [Scene API guide](docs/public/editor-scene-for-agents.md) includes command examples and the equivalent WebMCP tools.
