import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SHAPE_DENSITY } from 'crashcat';
import { createRagdollSettings } from '../../src/plugins/crashcat/CrashcatRagdoll.tsx';

const totalMass = settings => [...settings.shapes.values()].reduce(
    (mass, shape) => mass + 8 * shape.args[0] * shape.args[1] * shape.args[2] * shape.density, 0,
);

test('ragdolls use ordinary body density and mass scales with volume', () => {
    const original = createRagdollSettings(1);
    const doubled = createRagdollSettings(2);
    for (const shape of original.shapes.values()) assert.equal(shape.density, DEFAULT_SHAPE_DENSITY);
    assert.ok(Math.abs(totalMass(doubled) / totalMass(original) - 8) < 1e-10);
});
