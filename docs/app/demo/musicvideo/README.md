# Music Video

Open `/demo/musicvideo`, then enter Play. `CutsceneDirector` loads
`public/timelines/music-video.json` and plays `sound/CodeTalkerSong.mp3` from zero.
It waits for both the timeline and audio buffer. Cues use the shared audio
context clock to keep the timeline synchronized with playback. Leaving Play stops
audio and restores the original properties; entering Play again restarts everything.

The director's `timeline` property is editable in the scene editor. Music paths
and volume belong to `playAudio` commands in the timeline. The scene is `public/prefabs/music-video.json`.

Timeline commands contain seconds from the song start, a node ID, the component
key on that node, such as `model` or `light`, and a partial properties update:

```json
{
  "commands": [
    { "time": 0, "action": "playAudio", "clip": "/sound/CodeTalkerSong.mp3", "volume": 1 },
    { "time": 0, "nodeId": "oni", "component": "model", "properties": { "animationState": "idle" } },
    { "time": 8, "nodeId": "oni", "component": "model", "properties": { "animationState": "walk" } },
    { "time": 8, "nodeId": "key", "component": "light", "properties": { "color": "#66ccff", "intensity": 5 } }
  ]
}
```

`playAudio` commands start a clip from the beginning at the specified time, with
optional volume from 0 to 1. Multiple clips can overlap. All clips preload before
the timeline starts; failures are reported in the console. A late frame starts
audio at the elapsed offset to retain sync. Clicking Play unlocks audio directly
in the interaction handler. All active clips stop when leaving Play.

Commands are sorted by time, preserving file order for simultaneous cues. They
apply once per playback and merge into existing component properties. Node and
component targets must exist in the director's prefab store. Use valid properties
and animation clip names for each component. Commands apply instant property
changes during a single playback. The sample timestamps are illustrative;
edit them to match the song's beats. Load failures are reported in the console.
