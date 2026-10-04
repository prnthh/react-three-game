import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, InstancedMesh, BoxGeometry, MeshBasicMaterial, Raycaster, Vector3, Matrix4 } from 'three';
import { editPickIds, registerEditPickSources } from '../../src/runtime/scene/editPicking.ts';
import { buildAncestorIds, buildVisibleIds } from '../../src/editor/EditorTree.tsx';

describe('Viewport picking', () => {
    test('instanced foreground and ordinary background participate in the same pick cycle', () => {
        const geometry = new BoxGeometry(), material = new MeshBasicMaterial();
        const sourceGroup = new Group(); sourceGroup.userData.prefabNodeId = 'window';
        const source = new Mesh(geometry, material); sourceGroup.add(source); source.layers.mask = 0;
        const batch = new InstancedMesh(geometry, material, 1);
        batch.setMatrixAt(0, new Matrix4());
        const unregister = registerEditPickSources(batch, [source]);
        const backGroup = new Group(); backGroup.userData.prefabNodeId = 'wall';
        const back = new Mesh(geometry, material); back.position.z = -2; backGroup.add(back); backGroup.updateMatrixWorld(true);
        const ray = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
        const hits = ray.intersectObjects([batch, back]);
        const nodes = {window:{id:'window'},wall:{id:'wall'}};
        assert.deepEqual(editPickIds(hits, nodes), ['window', 'wall']);
        assert.deepEqual(editPickIds(hits, {...nodes,window:{id:'window',locked:true}}), ['wall']);
        // A nested document selects its outer placement, not a coincident local ID.
        sourceGroup.userData.prefabNodeId = 'nested-local';
        const placement = new Group(); placement.userData.prefabNodeId = 'placement'; placement.add(sourceGroup);
        assert.deepEqual(editPickIds(hits, {...nodes,placement:{id:'placement'}}), ['placement','wall']);
        unregister();
        assert.deepEqual(editPickIds(hits, nodes), ['wall']);
        geometry.dispose(); material.dispose();
    });
});

describe('Tree search and expansion', () => {
    test('tree search visits every sibling and preserves matching ancestors', () => {
        const state = {
            nodesById: {root:{id:'root'}, a:{id:'a',name:'Door A'}, branch:{id:'branch'}, b:{id:'b',name:'Door B'}, c:{id:'c',name:'Chair'}},
            childIdsById: {root:['a','branch','c'],branch:['b']},
        };
        assert.deepEqual(buildVisibleIds(state, 'root', 'door'), new Set(['a','b','branch','root']));
        assert.equal(buildVisibleIds(state, 'root', ''), null);
    });

    test('selection expansion contains only the selected node path', () => {
        const state = { parentIdById: { branch: 'root', leaf: 'branch', sibling: 'root' } };
        assert.deepEqual(buildAncestorIds(state, 'leaf'), new Set(['branch', 'root']));
        assert.deepEqual(buildAncestorIds(state, 'sibling'), new Set(['root']));
        assert.deepEqual(buildAncestorIds(state, null), new Set());
    });
});
