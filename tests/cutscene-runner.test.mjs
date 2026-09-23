import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { characterIds, parseScript } from '../docs/app/components/cutscene/script.ts';
import { Runner } from '../docs/app/components/cutscene/Runner.ts';

function setup(script, sound = fakeSound(), loop = true) {
    let position = [0, 0, 0], animation = 'idle', facing = null;
    const captions = [];
    const actor = {
        position: () => [...position], place: p => { position = [...p]; },
        face: p => { facing = p; }, animate: name => { animation = name; }, update() {},
        reset: () => { position = [0, 0, 0]; animation = 'idle'; },
    };
    const runner = new Runner(parseScript(script), { a: actor }, sound, caption => captions.push(caption), loop);
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
function fakeSound() {
    return {
        isRunning: true, clips: [], volume: 1,
        resume() { this.isRunning = true; return Promise.resolve(true); },
        setMasterVolume(value) { this.volume = value; },
        async play(src, options) {
            const clip = { src, options, stopped: false, stop() { this.stopped = true; } };
            this.clips.push(clip); return clip;
        },
    };
}
test('voice waits for ended and stops its own playback on disposal', async () => {
    const sound = fakeSound();
    const s = setup([{ ...dialogue, audioSrc: '/voice.wav' }], sound, false);
    s.runner.tick(0.1); await Promise.resolve();
    for (let i = 0; i < 10; i++) s.runner.tick(0.1);
    assert.equal(s.captions.length, 1);
    sound.clips[0].options.onEnded(); s.runner.tick(0.1);
    assert.equal(s.captions.at(-1), null); assert.equal(sound.clips[0].stopped, true);
    s.runner.dispose();
});
test('failed audio loads fall back to reading duration', async () => {
    const sound = fakeSound(); sound.play = async () => { throw new Error('missing file'); };
    const s = setup([{ ...dialogue, audioSrc: '/missing.wav' }], sound, false);
    s.runner.tick(0.05); await Promise.resolve(); await Promise.resolve(); s.runner.tick(0.05);
    assert.equal(s.captions.at(-1), null); s.runner.dispose();
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
    const runner = new Runner(parseScript([{ ...dialogue, closeup: true }, dialogue]), { a: actor }, fakeSound(), () => {}, false, id => shots.push(id));
    runner.tick(0.05); assert.deepEqual(shots, ['a']);
    runner.tick(0.05); assert.deepEqual(shots, ['a', null]);
    runner.tick(0.05); assert.equal(shots.at(-1), null);
    runner.dispose(); assert.equal(shots.at(-1), null);
    const active = new Runner(parseScript([{ ...dialogue, closeup: true }]), { a: actor }, fakeSound(), () => {}, true, id => shots.push(id));
    active.tick(0.01); assert.equal(shots.at(-1), 'a');
    active.dispose(); assert.equal(shots.at(-1), null);
    assert.throws(() => parseScript([{ ...dialogue, closeup: 'yes' }]), /closeup/);
});

test('audio enable resumes shared context, holds blocked dialogue, and preserves mute across lines', async () => {
    const sound = fakeSound(); sound.isRunning = false;
    const s = setup([{ ...dialogue, audioSrc: '/one.wav' }, { ...dialogue, audioSrc: '/two.wav' }], sound);
    s.runner.tick(0.1); await Promise.resolve();
    for (let i = 0; i < 10; i++) s.runner.tick(0.1);
    assert.equal(s.runner.audioState, 'blocked'); assert.equal(s.captions.length, 1);
    s.runner.setAudioEnabled(true); s.runner.tick(0.01);
    assert.equal(s.runner.audioState, 'on');
    s.runner.setAudioEnabled(false); assert.equal(sound.volume, 0);
    sound.clips[0].options.onEnded(); s.runner.tick(0.01); s.runner.tick(0.01); await Promise.resolve();
    assert.equal(sound.clips[1].src, '/two.wav'); assert.equal(sound.volume, 0);
    s.runner.setAudioEnabled(true); assert.equal(sound.volume, 1);
    s.runner.dispose(); assert.equal(sound.clips[1].stopped, true);
});

test('a late audio load is stopped after the runner is disposed', async () => {
    const sound = fakeSound(); let resolve;
    sound.play = () => new Promise(done => { resolve = done; });
    const s = setup([{ ...dialogue, audioSrc: '/voice.wav' }], sound);
    s.runner.tick(0.01); s.runner.dispose();
    let stopped = false; resolve({ stop() { stopped = true; } }); await Promise.resolve();
    assert.equal(stopped, true);
});
