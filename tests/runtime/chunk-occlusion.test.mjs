import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BoxGeometry, Group, Mesh, PerspectiveCamera, Scene, Vector3, WebGPUCoordinateSystem } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import { getChunkOcclusionStats, profileChunkOcclusion, installChunkOcclusion } from '../../src/runtime/rendering/chunkOcclusion.ts';
import { registerChunkDraws } from '../../src/runtime/rendering/chunkFrustum.ts';

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
    wall.position.z = -12;
    near.add(wall);
    const placement = new Group();
    scene.add(placement);
    placement.add(near, far, side);
    scene.updateMatrixWorld(true);
    const bounds = (x, y, z) => new Box3(new Vector3(-x, -y, -z), new Vector3(x, y, z));
    const cells = [
        { group: near, bounds: bounds(6, 6, 1.5).translate(wall.position) },
        { group: far, bounds: bounds(2, 2, 2).translate(new Vector3(0, 0, -28)) },
        { group: side, bounds: bounds(4, 4, 4).translate(new Vector3(12, 0, -28)) },
    ];
    const placementBounds = new Box3();
    for (const cell of cells) placementBounds.union(cell.bounds);
    const nativeProject = renderer.drawingPipeline.project;
    const clean = registerChunkDraws(renderer, scene, placement, new Map(cells.entries()), { bounds: placementBounds, indices: [0, 1, 2], children: [] });
    const restore = installChunkOcclusion(renderer, scene, camera, target);
    const check = (view, shouldVisitFar) => {
        visits.length = 0;
        renderer.drawingPipeline.project(scene, view);
        assert.ok(visits.includes(side));
        assert.equal(visits.includes(far), shouldVisitFar);
    };
    check(camera, false);
    assert.equal(getChunkOcclusionStats(renderer), undefined);
    const stopProfiling = profileChunkOcclusion(renderer);
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
        material.transparent = false;
        clean();
        check(camera, true);
        assert.equal(getChunkOcclusionStats(renderer).tested, 0);
    } finally {
        stopProfiling();
        restore();
        clean();
        assert.equal(renderer.drawingPipeline.project, nativeProject);
        wall.geometry.dispose();
        material.dispose();
    }
});
