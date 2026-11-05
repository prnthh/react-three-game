import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { NavigationMesh } from '../app/demo/frozen-yard/navigation.ts';
import { Walker } from '../app/demo/frozen-yard/walker.ts';
const directory = new URL('../public/models/frozen-yard/', import.meta.url);
const navigation = new NavigationMesh(JSON.parse(fs.readFileSync(new URL('navmesh.json', directory))));

test('routes around the monument and rejects buildings and disconnected islands', () => {
    const a = [-10, .025, 0], b = [2, .025, 0];
    assert.equal(navigation.triangleAt([-4, .025, 0]), -1);
    assert.equal(navigation.triangleAt([9, .025, -3.4]), -1);
    assert.equal(navigation.canWalkSegment(a, b), false);
    const path = navigation.findPath(a, b);
    assert.ok(path.length > 2);
    for (let i = 1; i < path.length; i++) assert.ok(navigation.canWalkSegment(path[i - 1], path[i]));
    const islands = new NavigationMesh({ clearance: 0, vertices: [[0,0,0],[1,0,0],[0,0,1],[2,0,0],[3,0,0],[2,0,1]], triangles: [[0,1,2],[3,4,5]] });
    assert.deepEqual(islands.findPath([.1,0,.1], [2.1,0,.1]), []);
    assert.equal(islands.canWalkSegment([.1,0,.1], [2.1,0,.1]), false);
});

test('three walkers remain on the authored surface over five minutes, including frame stalls', () => {
    const starts = [[0,.025,5],[2,.025,0],[-7,.025,7]];
    for (let i = 0; i < starts.length; i++) {
        const walker = new Walker(navigation, starts[i], .72 + i * .07, 713 + i * 51);
        let walked = 0, idle = 0;
        for (let frame = 0; frame < 18000; frame++) {
            const before = [...walker.position];
            walker.update(frame % 1200 === 0 ? 1 : 1 / 60);
            assert.ok(navigation.triangleAt(walker.position) >= 0);
            assert.ok(navigation.canWalkSegment(before, walker.position));
            const distance = Math.hypot(before[0] - walker.position[0], before[2] - walker.position[2]);
            assert.ok(distance <= walker.speed * .1 + 1e-7);
            walked += distance; idle += Number(!walker.moving);
        }
        assert.ok(walked > 100); assert.ok(idle > 0);
    }
});

function glb(name) {
    const b = fs.readFileSync(new URL(name, directory));
    return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
}
test('visible scenery and navigation are separate exports', () => {
    const scenery = glb('scene.glb'), nav = glb('navmesh.glb');
    assert.equal(scenery.meshes.length, 12);
    assert.ok(!scenery.nodes.some(n => n.name?.startsWith('WalkableSurface')));
    assert.equal(nav.meshes.length, 1);
    assert.ok(nav.nodes.some(n => n.name?.startsWith('WalkableSurface')));
    const b = fs.readFileSync(new URL('../public/models/fps/pockit-remilio.glb', import.meta.url));
    const model = JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
    assert.ok(model.animations.some(a=>a.name==='walk'));assert.ok(model.animations.some(a=>a.name==='idle'));
});
