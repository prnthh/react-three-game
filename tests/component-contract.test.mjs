import test from 'node:test';
import assert from 'node:assert/strict';
import { canAddComponentToNode, resolveComponentProperties } from '../src/tools/prefabeditor/components/ComponentRegistry.ts';

test('schema defaults resolve sparse JSON without replacing authored values', () => {
    const component = { name: 'Example', properties: {
        size: { default: 2 },
        width: { default: values => values.size * 2 },
        color: { type: 'color', default: '#ffffff' },
    } };
    const authored = { size: 3, color: '#000000' };
    assert.deepEqual(resolveComponentProperties(component, authored), { size: 3, width: 6, color: '#000000' });
    assert.deepEqual(authored, { size: 3, color: '#000000' });
});

test('exclusive slots reject competing components but allow behaviors and other slots', () => {
    const material = { name: 'Material', slot: 'material', properties: {} };
    const custom = { name: 'CustomMaterial', slot: 'material', properties: {} };
    const geometry = { name: 'Geometry', slot: 'geometry', properties: {} };
    const behavior = { name: 'Spin', properties: {} };
    const node = { id: 'box', components: { surface: { type: 'Material', properties: {} } } };
    const registry = { Material: material };
    assert.equal(canAddComponentToNode(node, custom, registry), false);
    assert.equal(canAddComponentToNode(node, geometry, registry), true);
    assert.equal(canAddComponentToNode(node, behavior, registry), true);
});
