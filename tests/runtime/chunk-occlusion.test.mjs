import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, PerspectiveCamera, Scene, Vector3, WebGPUCoordinateSystem } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { getChunkOcclusionStats, installChunkOcclusion, registerOcclusionCell } from '../../src/runtime/rendering/chunkOcclusion.ts';

test('the depth pre-pass prunes only fully covered chunks in the main camera pass', () => {
    const scene = new Scene(), camera = new PerspectiveCamera(60, 1, 0.1, 100);
    camera.coordinateSystem = WebGPUCoordinateSystem;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const shadow = camera.clone(), target = {};
    const visits = [];
    const renderer = {
        getRenderTarget: () => target,
        drawingPipeline: { project(object, camera) {
            if (!object.visible) return;
            visits.push(object);
            for (const child of object.children) this.project(child, camera);
        } },
    };
    const near = new Group(), far = new Group(), side = new Group();
    const material = new MeshPhysicalNodeMaterial();
    const wall = new Mesh(new BoxGeometry(12, 12, 3), material);
    near.position.z = -12;
    far.position.z = -28;
    side.position.set(12, 0, -28);
    near.add(wall);
    scene.add(near, far, side);
    scene.updateMatrixWorld(true);
    const bounds = (x, y, z) => new Box3(new Vector3(-x, -y, -z), new Vector3(x, y, z));
    const clean = [registerOcclusionCell(scene, near, bounds(6, 6, 1.5)),
        registerOcclusionCell(scene, far, bounds(2, 2, 2)), registerOcclusionCell(scene, side, bounds(4, 4, 4))];
    const restore = installChunkOcclusion(renderer, scene, camera, target);
    const check = (view, shouldVisitFar) => {
        visits.length = 0;
        renderer.drawingPipeline.project(scene, view);
        assert.ok(visits.includes(side));
        assert.equal(visits.includes(far), shouldVisitFar);
    };
    try {
        check(camera, false);
        assert.equal(getChunkOcclusionStats(renderer).culled, 1);
        check(shadow, true);
        wall.visible = false;
        check(camera, true);
        assert.equal(getChunkOcclusionStats(renderer).tested, 0, 'empty depth coverage skips chunk tests');
        wall.visible = true;
        material.transparent = true;
        check(camera, true);
        restore();
        check(camera, true);
    } finally {
        restore();
        clean.forEach(remove => remove());
        wall.geometry.dispose();
        material.dispose();
    }
});
