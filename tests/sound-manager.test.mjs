import assert from 'node:assert/strict';
import test from 'node:test';
import { SoundManager } from '../src/helpers/SoundManager.ts';

function setup() {
    const context = {
        state: 'suspended', gesture: false, sources: [], resumes: 0, destination: {},
        resume() { this.resumes++; if (this.gesture) this.state = 'running'; return Promise.resolve(); },
        createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; },
        createBufferSource() {
            const source = { playbackRate: { value: 1 }, detune: { value: 0 }, connect() {}, disconnect() {}, start() { this.started = true; }, stop() { this.stopped = true; } };
            this.sources.push(source); return source;
        },
    };
    const manager = new SoundManager(() => context);
    manager.setBuffer('bgm', {}); manager.setBuffer('sfx', {});
    return { manager, context };
}

test('BGM queued on page load starts alongside overlapping one-offs when interaction resumes context', async () => {
    const { manager, context } = setup();
    await manager.playMusic('bgm');
    assert.equal(context.state, 'suspended'); assert.equal(context.sources[0].loop, true);
    context.gesture = true;
    const first = manager.play('sfx');
    assert.equal(context.state, 'running'); // Resume happened synchronously before awaiting load.
    await first; const second = await manager.play('sfx');
    assert.equal(context.sources.length, 3);
    assert.equal(context.sources[0].stopped, undefined);
    assert.equal(context.sources[1].loop, false);
    second.stop(); assert.equal(context.sources[2].stopped, true);
    assert.equal(context.sources[1].stopped, undefined);
    manager.stopMusic(); assert.equal(context.sources[0].stopped, true);
});

test('stopping or replacing BGM cancels a pending load without stopping SFX', async () => {
    const { manager, context } = setup(); let finish;
    const originalLoad = manager.load.bind(manager);
    manager.load = path => path === 'slow' ? new Promise(resolve => { finish = () => { manager.setBuffer(path, {}); resolve(); }; }) : originalLoad(path);
    const pending = manager.playMusic('slow');
    manager.stopMusic(); finish(); await pending;
    assert.equal(context.sources.length, 0);
    await manager.playMusic('bgm'); const effect = await manager.play('sfx');
    await manager.playMusic('bgm');
    assert.equal(context.sources[0].stopped, true);
    assert.equal(context.sources[1].stopped, undefined);
    effect.stop();
});

test('natural completion invokes callback once; stop is idempotent; context is lazy', async () => {
    let created = 0;
    new SoundManager(() => { created++; throw new Error('not needed'); });
    assert.equal(created, 0);
    const { manager, context } = setup(); let ended = 0;
    const clip = await manager.play('sfx', { onEnded: () => ended++ });
    context.sources[0].onended(); clip.stop(); clip.stop();
    assert.equal(ended, 1);
});
