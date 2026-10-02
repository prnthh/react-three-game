import test from 'node:test';
import assert from 'node:assert/strict';
import { createConcreteMaterial } from '../app/demo/jumper/components/ConcreteComponent.tsx';

test('concrete variations share a shader while uniforms follow the current material', () => {
    const first = createConcreteMaterial({ color: '#89816a', weathering: 1, scale: 1, roughness: 0.96 });
    const second = createConcreteMaterial({ color: '#334455', weathering: 0.2, scale: 3, roughness: 0.5 });
    assert.equal(first.customProgramCacheKey(), second.customProgramCacheKey());
    const references = new Set();
    first.colorNode.traverse(node => { if (node.constructor.type === 'ReferenceNode') references.add(node); });
    first.normalNode.traverse(node => { if (node.constructor.type === 'ReferenceNode') references.add(node); });
    assert.deepEqual([...references].map(node => node.property).sort(), ['material.color', 'material.userData.scale', 'material.userData.weathering']);
    for (const material of [first, second, first]) {
        for (const reference of references) {
            // Shadow passes can replace the frame material; the source mesh still owns our values.
            reference.updateReference({ object: { material }, material: {} });
            reference.update({ material });
            const expected = reference.property.split('.').reduce((value, key) => value[key], { material });
            assert.equal(reference.node.value, expected);
        }
    }
    first.dispose();
    second.dispose();
});
