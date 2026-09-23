import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Mesh, MeshBasicMaterial, BoxGeometry } from 'three';
import { getPendingMaterialCount } from '../src/tools/prefabeditor/components/MaterialComponent.tsx';

test('a ready chunk is not blocked by an unrelated chunk material, but shared dependencies still block both', () => {
    const a = new Group(), b = new Group();
    const common = new MeshBasicMaterial(), extra = new MeshBasicMaterial();
    const geometry = new BoxGeometry();
    a.add(new Mesh(geometry, common));
    b.add(new Mesh(geometry, [common, extra]));
    const shared = { material: common, configured: false };
    const local = { material: extra, configured: false };
    const entries = [shared, local];
    assert.equal(getPendingMaterialCount(a, entries), 1);
    assert.equal(getPendingMaterialCount(b, entries), 2);
    shared.configured = true;
    assert.equal(getPendingMaterialCount(a, entries), 0);
    assert.equal(getPendingMaterialCount(b, entries), 1);
    local.configured = true;
    assert.equal(getPendingMaterialCount(b, entries), 0);
    common.dispose(); extra.dispose(); geometry.dispose();
});
