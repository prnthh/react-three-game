import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrefabStore } from 'react-three-game/viewer';
import { parseTimeline, createTimelinePlayer } from '../app/demo/musicvideo/timeline.ts';

const cue = (time, intensity) => ({ time, nodeId: 'key', component: 'light', properties: { intensity } });
const makeStore = () => createPrefabStore({ root: { id: 'key', components: {
    light: { type: 'DirectionalLight', properties: { intensity: 3, color: '#ffffff' } },
} } });

test('timeline catches up in time order, applies equal-time cues in file order, and restores on replay', () => {
    const store = makeStore();
    const player = createTimelinePlayer(parseTimeline({ commands: [cue(8, 5), cue(0, 1), cue(4, 2), cue(4, 4)] }), store);
    const props = () => store.getState().nodesById.key.components.light.properties;
    player.advance(-1);
    assert.equal(props().intensity, 3);
    player.advance(0);
    assert.equal(props().intensity, 1);
    player.advance(7);
    assert.equal(props().intensity, 4);
    player.advance(100);
    assert.equal(props().intensity, 5);
    assert.equal(props().color, '#ffffff');
    player.stop();
    assert.deepEqual(props(), { intensity: 3, color: '#ffffff' });
    player.advance(0);
    assert.equal(props().intensity, 1);
    player.stop();
});

test('invalid cues and missing targets fail before any scene changes', () => {
    for (const value of [null, {}, { commands: [cue(-1, 2)] }, { commands: [{ ...cue(0, 2), properties: [] }] }]) {
        assert.throws(() => parseTimeline(value));
    }
    const store = makeStore();
    assert.throws(() => createTimelinePlayer(parseTimeline({ commands: [cue(0, 1), { ...cue(1, 2), nodeId: 'missing' }] }), store), /target not found/);
    assert.equal(store.getState().nodesById.key.components.light.properties.intensity, 3);
});

test('audio commands fire at their cue times once per run and can overlap', () => {
    const first = { time: 0, action: 'playAudio', clip: '/sound/CodeTalkerSong.mp3', volume: 1 };
    const second = { time: 4, action: 'playAudio', clip: '/sound/hit.mp3', volume: 0.5 };
    const played = [];
    const player = createTimelinePlayer(parseTimeline({ commands: [second, cue(4, 2), first] }), makeStore(), cue => played.push(cue));
    player.advance(0);
    assert.deepEqual(played, [first]);
    player.advance(3);
    assert.equal(played.length, 1);
    player.advance(9);
    assert.deepEqual(played, [first, second]);
    player.advance(10);
    assert.equal(played.length, 2);
    player.stop();
    player.advance(0);
    assert.deepEqual(played, [first, second, first]);
    assert.throws(() => parseTimeline({ commands: [{ ...first, clip: '' }] }));
    assert.throws(() => parseTimeline({ commands: [{ ...first, volume: -1 }] }));
    assert.throws(() => parseTimeline({ commands: [{ ...first, action: 'unknown' }] }));
});

test('music video contains one reusable text node per lyric word', async () => {
    const { readFile } = await import('node:fs/promises');
    const scene = JSON.parse(await readFile(new URL('../public/prefabs/music-video.json', import.meta.url), 'utf8'));
    const words = ['let', 'me', 'go', 'to', 'work', 'you', 'help', 'they'];
    for (const word of words) {
        const nodes = scene.root.children.filter(node => node.id === `lyric-${word}`);
        assert.equal(nodes.length, 1);
        assert.equal(nodes[0].components.text.properties.text, word.toUpperCase());
    }
});

test('lyric animation follows LRC anchors, flashes repeated words, and restores on stop', async () => {
    const { readFile } = await import('node:fs/promises');
    const { createLyricAnimation, isLyricVisibilityCue, LYRIC_WORDS } = await import('../../scripts/generate-music-video-lyrics.mjs');
    const scene = JSON.parse(await readFile(new URL('../public/prefabs/music-video.json', import.meta.url), 'utf8'));
    const data = JSON.parse(await readFile(new URL('../public/timelines/music-video.json', import.meta.url), 'utf8'));
    const cues = data.commands.filter(cue => cue.nodeId?.startsWith('lyric-'));
    const lrc = await readFile(new URL('../public/timelines/codetalker.lrc', import.meta.url), 'utf8');
    const generated = createLyricAnimation(lrc);
    assert.ok(generated.length > 0);
    assert.ok(cues.length > 0, 'the authored timeline includes lyric animation');
    const store = createPrefabStore(scene);
    const player = createTimelinePlayer(parseTimeline({ commands: cues }), store);
    const scale = word => store.getState().nodesById[`lyric-${word}`].components.transform.properties.scale;
    player.advance(0);
    for (const word of LYRIC_WORDS) assert.deepEqual(scale(word), [0, 0, 0]);
    player.advance(5.04);
    assert.deepEqual(scale('work'), [1, 1, 1]);
    player.advance(6);
    assert.deepEqual(scale('work'), [0, 0, 0]);
    player.advance(10.52);
    assert.deepEqual(scale('work'), [1, 1, 1]);
    player.advance(11.44);
    assert.deepEqual(scale('let'), [1, 1, 1]);
    player.advance(68);
    for (const word of LYRIC_WORDS) assert.deepEqual(scale(word), [0, 0, 0]);
    player.stop();
    for (const word of LYRIC_WORDS) assert.deepEqual(scale(word), [1, 1, 1]);
    player.advance(0);
    for (const word of LYRIC_WORDS) assert.deepEqual(scale(word), [0, 0, 0]);
    assert.throws(() => createLyricAnimation('[00:01]unknown\n[00:02]'), /Unknown lyric/);
    assert.throws(() => createLyricAnimation('[00:01]work'), /final empty timestamp/);
    assert.throws(() => createLyricAnimation('[00:02]work\n[00:01]'), /times must increase/);
    assert.throws(() => createLyricAnimation(lrc, 0), /Beat duration/);
    assert.equal(isLyricVisibilityCue(generated[0]), true);
    assert.equal(isLyricVisibilityCue({ nodeId: 'lyric-let', component: 'text', properties: { color: '#fff' } }), false);
    assert.equal(isLyricVisibilityCue({ nodeId: 'lyric-let', component: 'transform', properties: { position: [1, 2, 3] } }), false);
});
