import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement as h } from 'react';
import { createRoot, extend } from '@react-three/fiber';
import { AudioContext, Group } from 'three';
import { BrowserRuntime } from '../../src/browser.tsx';
import { useAudioListener } from '../../src/runtime/audio/AudioRuntime.tsx';
import { AssetRuntimeProvider } from '../../src/runtime/assets/AssetRuntime.tsx';
import { sound } from '../../src/runtime/audio/SoundManager.ts';

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
