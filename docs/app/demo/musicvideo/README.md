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
    { "time": 0, "nodeId": "remilio", "component": "model", "properties": { "animationState": "idle" } },
    { "time": 8, "nodeId": "remilio", "component": "model", "properties": { "animationState": "walk" } },
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

Eight lyric text nodes (`lyric-let`, `lyric-me`, `lyric-go`, `lyric-to`,
`lyric-work`, `lyric-you`, `lyric-help`, `lyric-they`) surround Remilio. All are
visible in Edit for positioning. During Play the timeline hides them initially,
then flashes each word on its cue, with short gaps for repeated words. Leaving
Play restores their authored scales.

Generate the draft word animation with:

```sh
node scripts/generate-music-video-lyrics.mjs
```

This preserves the music, character, and lighting commands and replaces only
`lyric-*` scale-only visibility commands. Other lyric property changes are retained.
Line starts follow the LRC; individual word offsets
are estimates using 0.69-second beats and half-beat stutters. They need listening
and refinement. Edit `time` on the lyric commands in `music-video.json` to tune
individual reveals; regeneration replaces those manual timing edits.

### Lyric timing reference

`public/timelines/codetalker.lrc` contains the line-synced LRCLIB record
[39113256](https://lrclib.net/api/get/39113256), for the 68-second soundtrack
version. It has line timestamps, not word timestamps (`hasWordSync: false`).
The first vocal cues are at 5.04 and 10.52 seconds; the first full phrase begins
at 11.44 seconds. The generator preserves these anchors while estimating the word offsets.

Song: **Codetalker**, by **Packtion**, from *Endacopia Game Soundtrack*.
[Original track](https://packtion.bandcamp.com/track/codetalker), published under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). The LRC
reference adds community timing metadata; the audio is unchanged.
