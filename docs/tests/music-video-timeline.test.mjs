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
