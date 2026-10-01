import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, InstancedMesh, BoxGeometry, MeshBasicMaterial, Raycaster, Vector3, Matrix4 } from 'three';
import { editPickIds, registerEditPickSources } from '../../src/runtime/scene/editPicking.ts';

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

test('repeated and nested prefab picks select the clicked placement despite source ID collisions', () => {
    const placement = new Group();
    placement.userData = {prefabNodeId:'window-6',prefabNodeScope:''};
    const sourceRoot = new Group();
    sourceRoot.userData = {prefabNodeId:'window-0',prefabNodeScope:'window-6'};
    placement.add(sourceRoot);
    const nested = new Group();
    nested.userData = {prefabNodeId:'window-0',prefabNodeScope:'window-6/trim'};
    sourceRoot.add(nested);
    const mesh = new Mesh();nested.add(mesh);
    const nodes={'window-0':{id:'window-0'},'window-6':{id:'window-6'}};
    assert.deepEqual(editPickIds([{object:mesh}],nodes),['window-6']);
    assert.deepEqual(editPickIds([{object:mesh}],nodes,'window-6'),['window-0']);
    const batch = new Group();
    const unregister=registerEditPickSources(batch,[mesh]);
    assert.deepEqual(editPickIds([{object:batch,instanceId:0}],nodes),['window-6']);
    assert.deepEqual(editPickIds([{object:batch,instanceId:0}],{...nodes,'window-6':{id:'window-6',locked:true}}),[]);
    unregister();
});
