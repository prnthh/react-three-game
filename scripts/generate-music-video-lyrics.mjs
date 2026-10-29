import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const LYRIC_WORDS = ['let', 'me', 'go', 'to', 'work', 'you', 'help', 'they'];
const round = value => Math.round(value * 1000) / 1000;
const visibilityCue = (word, time, visible) => ({
    time: round(time), nodeId: `lyric-${word}`, component: 'transform',
    properties: { scale: visible ? [1, 1, 1] : [0, 0, 0] },
});

export function isLyricVisibilityCue(cue) {
    return cue.nodeId?.startsWith('lyric-') && cue.component === 'transform' &&
        Object.keys(cue.properties ?? {}).length === 1 && Array.isArray(cue.properties.scale);
}

/** LRC gives line anchors only. Subdivide on an estimated beat, with half-beat stutters. */
export function createLyricAnimation(lrc, beat = 0.69) {
    if (!Number.isFinite(beat) || beat <= 0) throw new Error('Beat duration must be positive.');
    const lines = [...lrc.matchAll(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/gm)]
        .map(([, minutes, seconds, text]) => ({ time: Number(minutes) * 60 + Number(seconds), text: text.trim() }));
    if (lines.length < 2 || lines.at(-1).text) {
        throw new Error('LRC requires a final empty timestamp to end the last lyric.');
    }
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].time <= lines[i - 1].time) throw new Error('Lyric line times must increase.');
    }
    const cues = LYRIC_WORDS.map(word => visibilityCue(word, 0, false));
    for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (!line.text) continue;
        const groups = line.text.toLowerCase().replace(/[,!.?]/g, '').split(/\s+/);
        const words = groups.flatMap(group => {
            const parts = group.split('-');
            return parts.map(word => ({ word, units: parts.length > 1 ? 0.5 : 1 }));
        });
        for (const { word } of words) if (!LYRIC_WORDS.includes(word)) throw new Error(`Unknown lyric word: ${word}`);
        const duration = lines[i + 1].time - line.time;
        if (duration <= 0) throw new Error('Lyric line times must increase.');
        const step = Math.min(beat, duration / words.reduce((sum, item) => sum + item.units, 0));
        let time = line.time;
        for (const { word, units } of words) {
            const end = Math.min(lines[i + 1].time, time + step * units * 0.85);
            cues.push(visibilityCue(word, time, true), visibilityCue(word, end, false));
            time += step * units;
        }
    }
    return cues.sort((a, b) => a.time - b.time);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const folder = new URL('../docs/public/timelines/', import.meta.url);
    const timelinePath = new URL('music-video.json', folder);
    const timeline = JSON.parse(await readFile(timelinePath, 'utf8'));
    const cues = createLyricAnimation(await readFile(new URL('codetalker.lrc', folder), 'utf8'));
    timeline.lyricTiming = {
        source: 'https://lrclib.net/api/get/39113256',
        status: 'draft: line anchors from LRC; word offsets estimated at 0.69s per beat, stutters at half-beats',
        regenerate: 'node scripts/generate-music-video-lyrics.mjs',
    };
    timeline.commands = [...timeline.commands.filter(cue => !isLyricVisibilityCue(cue)), ...cues]
        .sort((a, b) => a.time - b.time);
    await writeFile(timelinePath, JSON.stringify(timeline, null, 2) + '\n');
    console.log(`Generated ${cues.length} lyric visibility commands.`);
}
