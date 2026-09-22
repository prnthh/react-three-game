import assert from 'node:assert/strict';
import test from 'node:test';
import { DirectionalLight, PointLight, SpotLight } from 'three';
import { invalidateShadows, subscribeShadowUpdates } from '../src/runtime/lighting/shadowUpdates.ts';
import { gameEvents } from '../src/tools/prefabeditor/GameEvents.ts';

test('static shadows capture initially, refresh selectively, and unsubscribe', () => {
    const lights = [new DirectionalLight(), new PointLight(), new SpotLight()];
    const renders = [0, 0, 0];
    lights.forEach(light => { light.shadow.autoUpdate = false; });
    const cleanup = lights.map((light, i) => subscribeShadowUpdates(light, () => renders[i]++));
    try {
        assert.ok(lights.every(light => light.shadow.needsUpdate));
        lights.forEach(light => { light.shadow.needsUpdate = false; });
        invalidateShadows([lights[1]]);
        assert.deepEqual(lights.map(light => light.shadow.needsUpdate), [false, true, false]);
        assert.deepEqual(renders, [1, 2, 1]);
        gameEvents.emit('shadows:invalidate', {});
        assert.ok(lights.every(light => light.shadow.needsUpdate));
        assert.ok(lights.every(light => !light.shadow.autoUpdate));
        cleanup[0]();
        lights[0].shadow.needsUpdate = false;
        invalidateShadows();
        assert.equal(lights[0].shadow.needsUpdate, false);
        assert.deepEqual(renders, [2, 4, 3]);
    } finally {
        cleanup.forEach(dispose => dispose());
        lights.forEach(light => light.dispose());
    }
});
