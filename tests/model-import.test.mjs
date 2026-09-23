import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three';
import { decomposeModelToPrefabNodes } from '../src/tools/prefabeditor/modelPrefab.ts';
import { importCollisionModel } from '../src/plugins/crashcat/importCollisionModel.ts';

test('generic model conversion is physics agnostic; collision import is explicitly supplied by the plugin', () => {
    const model = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    model.name = 'wall_colonly';
    const generic = decomposeModelToPrefabNodes(model);
    assert.equal(generic.root.components.mesh.properties.visible, true);
    assert.ok(!Object.values(generic.root.components).some(c => c.type === 'CrashcatPhysics'));
    const physics = importCollisionModel(model);
    assert.equal(physics.root.name, 'wall');
    assert.equal(physics.root.hidden, false);
    assert.equal(physics.root.components.mesh.properties.visible, false);
    assert.equal(physics.root.components.physics.type, 'CrashcatPhysics');
    model.name = 'wall';
    assert.equal(importCollisionModel(model), null);
    model.geometry.dispose();
    model.material.dispose();
});
