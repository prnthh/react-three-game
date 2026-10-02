import test from 'node:test';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { applyProps } from '@react-three/fiber';
import assert from 'node:assert/strict';
import { MaterialComponent } from '../../src/viewer.ts';
import { ConcreteMaterialComponent, createConcreteMaterialOverrides } from '../app/demo/jumper/components/ConcreteMaterialComponent.tsx';

test('concrete variations share a shader while uniforms follow the current material', () => {
    const create = properties => applyProps(new MeshStandardNodeMaterial(), createConcreteMaterialOverrides(properties));
    const first = create({ color: '#89816a', weathering: 1, scale: 1, roughness: 0.96 });
    const second = create({ color: '#334455', weathering: 0.2, scale: 3, roughness: 0.5 });
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

test('ConcreteMaterial extends the regular Material contract',()=>{
    assert.equal(ConcreteMaterialComponent.name,'ConcreteMaterial');
    assert.equal(ConcreteMaterialComponent.slot,MaterialComponent.slot);
    assert.equal(ConcreteMaterialComponent.properties.materialId,MaterialComponent.properties.materialId);
    assert.equal(ConcreteMaterialComponent.properties.attach,MaterialComponent.properties.attach);
});
