# Demo scene agent

The standalone docs editor mounts `DemoSceneTools` under its editor provider.
It composes the library's Scene tools panel with this demo's chat UI.

`sceneChat.ts` handles the OpenAI-compatible HTTP/SSE protocol and conversation
policy. Scene concepts and tool descriptions come from the public
`createSceneToolGuide()` and `createSceneTools(scene)` APIs. Keep those contracts
in the library rather than duplicating them in the client.

Connection preferences are browser-local; API keys stay in memory. Tests mock the
model server, so they require no running LM Studio instance. Run them with
`npm test --workspace docs` from the repository root.

## Connect the demo chat

The docs editor adds a demo-owned **Agent chat** beside Scene tools. It connects directly to an OpenAI-compatible chat server
(for example LM Studio). Enter its HTTP endpoint and exact model ID; **Connect /
list models** discovers available IDs. Enable CORS on the server for the editor's
origin. Endpoint, model and vision preferences stay in this browser; the optional
API key stays in memory. Scene data and tool results are sent to the chosen server.
The agent uses this same tool catalog, revision checks and undo history. **Stop**
cancels the current turn while preserving completed edits. Captures appear inline;
only enable image delivery when the model supports vision. Export a transcript to
inspect tool arguments, errors, request timings and the conversation. Transcripts
contain scene data and captures but omit the configured API key. **New chat** clears
the conversation without resetting the scene.

For scene operations, use the [Scene API guide](../../../public/editor-scene-for-agents.md).
