import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { SoundManager, sound } from '../../src/runtime/audio/SoundManager.ts';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { AudioContext, Group } from 'three';
import { BrowserRuntime } from '../../src/browser/index.tsx';
import { useAudioListener } from '../../src/runtime/audio/AudioRuntime.tsx';
import { AssetRuntimeProvider } from '../../src/runtime/assets/AssetRuntime.tsx';

describe('Playback', () => {
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
});

describe('Browser integration', () => {
    extend({ Group });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;

    test('browser host owns one listener, resumes it on interaction, bridges buffers, and removes listeners on unmount', async t => {
        const previousWindow = globalThis.window;
        const listeners = new Map();
        globalThis.window = {
            addEventListener: (event, fn) => listeners.set(event, fn),
            removeEventListener: (event, fn) => { assert.equal(listeners.get(event), fn); listeners.delete(event); },
        };
        let resumes = 0;
        AudioContext.setContext({ createGain: () => ({ connect() {} }), destination: {}, listener: {}, resume: async () => { resumes++; } });
        const target = { width: 1, height: 1 };
        const root = createRoot(target);
        await root.configure({ gl: { render() {}, setSize() {}, setPixelRatio() {} }, size: { width: 1, height: 1, top: 0, left: 0 }, frameloop: 'never', dpr: 1 });
        t.after(async () => {
            await act(async () => root.unmount());
            if (previousWindow === undefined) delete globalThis.window;
            else globalThis.window = previousWindow;
        });
        const found = [];
        function Probe() { found.push(useAudioListener()); return null; }
        const runtimeRef = { current: null };
        let store;
        await act(async () => {
            store = root.render(h(BrowserRuntime, null, h(Probe), h(BrowserRuntime, null, h(Probe)),
                h(AssetRuntimeProvider, { runtimeRef })));
        });
        assert.ok(found[0]);
        assert.equal(found[0], found[1]);
        assert.equal(store.getState().camera.children.filter(child => child.type === 'AudioListener').length, 1);
        assert.deepEqual([...listeners.keys()], ['pointerdown', 'keydown']);
        await listeners.get('pointerdown')();
        assert.equal(resumes, 1);
        const buffer = {};
        const path = '/browser-host-test.wav';
        runtimeRef.current.registerSound(path, buffer);
        assert.equal(sound.hasBuffer(path), true);
        runtimeRef.current.clearAsset('sound', path);
        assert.equal(sound.hasBuffer(path), false);
        const camera = store.getState().camera;
        await act(async () => root.render(null));
        assert.equal(listeners.size, 0);
        assert.equal(camera.children.filter(child => child.type === 'AudioListener').length, 0);
    });
});
