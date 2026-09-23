# Infinite TV

Watch `/demo/infinite-tv`; edit the room at `/demo/infinite-tv/editor`. The prefab is `docs/public/prefabs/infinite-tv.json` and uses the Oni and Mixamo rigs from the point-and-click demo.

## Script

Replace `docs/public/cutscenes/infinite-tv.json` and reload, or change the CutsceneRunner component's `source` URL in the editor. The JSON is simply an ordered command array. Character values are prefab node IDs—there is no character metadata, title, or separate character list.

```json
[
  { "type": "animation", "character": "tv-milo", "name": "walk" },
  { "type": "walkto", "character": "tv-milo", "position": [-2, 0, 1], "speed": 1.2 },
  { "type": "animation", "character": "tv-milo", "name": "idle" },
  { "type": "lookat", "character": "tv-milo", "target": "tv-june" },
  { "type": "dialogue", "character": "tv-milo", "text": "Hello again.", "durationMs": 2500, "closeup": true }
]
```

- `animation` sets a clip and continues immediately. It remains active until another animation command changes it. Missing clips fall back to idle/the first clip.
- `walkto` faces and moves toward a local position, waiting until arrival. `speed` defaults to 1.2 units/second. Use animation commands before and after it to select walking/idle clips.
- `lookat` turns toward another node ID or a coordinate `[x, y, z]`, then continues immediately.
- `dialogue` displays a caption and waits. Set `closeup: true` to cut to a front-facing speaker shot for that line; omitted or false keeps the room view. The camera frames the model using its current facing direction and restores the authored camera when the line ends or playback is unloaded. Optional `audioSrc` plays a voice clip and advances on completion. Missing/blocked audio uses `durationMs`, or a reading duration based on text length if omitted.

Characters must have an AnimatedModel with `autoUpdate: false`. Initial poses come from the prefab. All characters should share the same parent coordinate space. Walking uses straight paths without obstacle avoidance.

CutsceneRunner properties: `source`, `channel` (default `infinite-tv`), and `loop` (default true). Looping restores the prefab poses before replaying. Edit mode does not execute the script; Play mode does. Leaving playback stops audio and restores the original poses.

The broadcast only subscribes to `<channel>:dialogue` when captions change. The Audio button below Edit toggles dialogue sound and retries blocked autoplay. A browser-level tab mute must be cleared in the browser. There are no character cards, counters, progress calculations, or periodic status snapshots. Fetch/validation errors appear in the caption area.

Export JSON from the editor and replace the prefab file to persist set edits. Tests: `node --import ./tests/register.mjs --test tests/cutscene-runner.test.mjs`.

CutsceneRunner is registered inline in each viewer/editor entry point; there is no separate registration module.

## Generate voices with Voicebox

Local server: `http://127.0.0.1:17493`. These profile IDs belong to this installation; use `GET /profiles` to look them up on another server.

| Character | Voice profile | `profile_id` |
| --- | --- | --- |
| Milo | guybrush threepwood | `e431e9f5-0a88-45c4-9dae-8d67b535f642` |
| June | duck professor spy fox | `e6364395-26b2-4372-b237-f7835af9abef` |

Generate a line with `POST /generate`, substituting the profile ID and dialogue text:

```sh
curl --fail-with-body http://127.0.0.1:17493/generate \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "profile_id": "e431e9f5-0a88-45c4-9dae-8d67b535f642",
  "text": "Do you ever get the feeling we've had this conversation before?",
  "language": "en",
  "engine": "qwen",
  "model_size": "1.7B",
  "seed": 42,
  "personality": false
}
JSON
```

The response contains an `id` and may initially report `status: "generating"`. Stream its status until `completed`, then download the WAV (replace `GENERATION_ID` with that response ID):

```sh
curl -N http://127.0.0.1:17493/generate/GENERATION_ID/status

curl --fail-with-body http://127.0.0.1:17493/audio/GENERATION_ID \
  -o docs/public/sound/infinite-tv/01-milo.wav
```

Set the dialogue command's `audioSrc` to `/sound/infinite-tv/01-milo.wav`. For June, use the Duck Professor profile ID and a corresponding filename. `personality: false` preserves the supplied dialogue rather than rewriting it.

[Voicebox generation API documentation](https://docs.voicebox.sh/developer/tts-generation)
