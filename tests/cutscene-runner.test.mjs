import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { characterIds, parseScript } from '../docs/app/components/cutscene/script.ts';
import { Runner } from '../docs/app/components/cutscene/Runner.ts';

function setup(script, makeAudio = () => { throw new Error('Unexpected audio'); }, loop = true) {
    let position = [0, 0, 0], animation = 'idle', facing = null;
    const captions = [];
    const actor = {
        position: () => [...position], place: p => { position = [...p]; },
        face: p => { facing = p; }, animate: name => { animation = name; }, update() {},
        reset: () => { position = [0, 0, 0]; animation = 'idle'; },
    };
    const runner = new Runner(parseScript(script), { a: actor }, makeAudio, caption => captions.push(caption), loop);
    return { runner, captions, position: () => position, animation: () => animation, facing: () => facing };
}
const dialogue = { type: 'dialogue', character: 'a', text: 'Hello', durationMs: 100 };

test('executes animation, walkto, lookat and dialogue in order', () => {
    const s = setup([
        { type: 'animation', character: 'a', name: 'walk' },
        { type: 'walkto', character: 'a', position: [1, 0, 0], speed: 1 },
        { type: 'animation', character: 'a', name: 'idle' },
        { type: 'lookat', character: 'a', target: [0, 0, 2] },
        dialogue,
    ]);
    s.runner.tick(0.1);
    assert.equal(s.animation(), 'walk'); assert.deepEqual(s.position(), [0.1, 0, 0]); assert.deepEqual(s.captions, []);
    for (let i = 0; i < 9; i++) s.runner.tick(0.1);
    assert.deepEqual(s.position(), [1, 0, 0]); assert.deepEqual(s.captions, []);
    s.runner.tick(0.05);
    assert.equal(s.animation(), 'idle'); assert.deepEqual(s.facing(), [0, 0, 2]);
    assert.deepEqual(s.captions, [{ character: 'a', text: 'Hello' }]);
});
test('loop restores prefab pose; non-looping scripts stop; immediate-only scripts are bounded', () => {
    const s = setup([{ type: 'walkto', character: 'a', position: [0.1, 0, 0] }, dialogue]);
    s.runner.tick(0.1); s.runner.tick(0.1); s.runner.tick(0.1);
    assert.deepEqual(s.position(), [0, 0, 0]);
    const once = setup([dialogue], undefined, false);
    for (let i = 0; i < 10; i++) once.runner.tick(0.1);
    assert.equal(once.captions.length, 2);
    const immediate = setup([{ type: 'animation', character: 'a', name: 'wave' }]);
    immediate.runner.tick(0.1); immediate.runner.tick(0.1);
    assert.equal(immediate.animation(), 'idle');
});
function audioMock(blocked = false) {
    return { play() { if (blocked) return Promise.reject(new Error('blocked')); this.onplaying?.(); return Promise.resolve(); }, pause() {}, load() {}, removeAttribute() {} };
}
test('voice waits for ended, cleans up, and captions emit only on dialogue changes', () => {
    const clip = audioMock();
    const s = setup([{ ...dialogue, audioSrc: '/voice.mp3' }], () => clip, false);
    for (let i = 0; i < 10; i++) s.runner.tick(0.1);
    assert.equal(s.captions.length, 1);
    clip.onended(); s.runner.tick(0.1);
    assert.equal(s.captions.at(-1), null); assert.equal(clip.onended, null);
    s.runner.dispose();
});
test('blocked audio falls back to reading duration and disposal restores actors', async () => {
    const s = setup([{ ...dialogue, audioSrc: '/voice.mp3' }], () => audioMock(true), false);
    s.runner.tick(0.05); await Promise.resolve(); s.runner.tick(0.05);
    assert.equal(s.captions.at(-1), null);
    s.runner.dispose(); assert.deepEqual(s.position(), [0, 0, 0]);
});
test('validates command-only scripts and discovers referenced character IDs', () => {
    const shipped = parseScript(JSON.parse(readFileSync(new URL('../docs/public/cutscenes/infinite-tv.json', import.meta.url))));
    assert.deepEqual(characterIds(shipped).sort(), ['tv-june', 'tv-milo']);
    assert.deepEqual(characterIds([{ type: 'lookat', character: 'a', target: 'b' }]), ['a', 'b']);
    assert.throws(() => parseScript([]), /nonempty/);
    assert.throws(() => parseScript([{ type: 'fly', character: 'a' }]), /unknown/);
    assert.throws(() => parseScript([{ type: 'walkto', character: 'a', position: [1, 0, 0], speed: 0 }]), /walkto/);
    assert.throws(() => parseScript([{ ...dialogue, character: '' }]), /node ID/);
    assert.throws(() => parseScript([{ type: 'lookat', character: 'a', target: [0, 0] }]), /lookat/);
});

test('closeup flag selects the speaking character and restores on line end and disposal', () => {
    const shots = [];
    const actor = { position: () => [0, 0, 0], place() {}, face() {}, animate() {}, update() {}, reset() {} };
    const runner = new Runner(parseScript([{ ...dialogue, closeup: true }, dialogue]), { a: actor }, () => audioMock(), () => {}, false, id => shots.push(id));
    runner.tick(0.05); assert.deepEqual(shots, ['a']);
    runner.tick(0.05); assert.deepEqual(shots, ['a', null]);
    runner.tick(0.05); assert.equal(shots.at(-1), null);
    runner.dispose(); assert.equal(shots.at(-1), null);
    const active = new Runner(parseScript([{ ...dialogue, closeup: true }]), { a: actor }, () => audioMock(), () => {}, true, id => shots.push(id));
    active.tick(0.01); assert.equal(shots.at(-1), 'a');
    active.dispose(); assert.equal(shots.at(-1), null);
    assert.throws(() => parseScript([{ ...dialogue, closeup: 'yes' }]), /closeup/);
});
