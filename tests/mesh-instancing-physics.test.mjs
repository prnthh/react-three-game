import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, Layers } from 'three';
import { hideInstancedSources } from '../src/tools/prefabeditor/MeshInstanceProvider.tsx';

test('instancing preserves source geometry for collider rebuilding and restores rendering on cleanup', () => {
    const node = new Group();
    const mesh = new Mesh(new BoxGeometry(2, 0.1, 2), new MeshBasicMaterial());
    node.add(mesh);
    const restore = hideInstancedSources([{id:'lift', mesh}]);
    assert.equal(mesh.parent, node);
    const geometry = [];
    node.traverse(object => { if (object.geometry) geometry.push(object.geometry); });
    assert.deepEqual(geometry, [mesh.geometry]);
    assert.equal(mesh.layers.test(new Layers()), false, 'source does not draw alongside its batch');
    restore();
    assert.equal(mesh.layers.test(new Layers()), true);
    assert.equal(mesh.parent, node);
    mesh.geometry.dispose();
    mesh.material.dispose();
});
