import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from 'three';
import { SpeakerCamera } from '../docs/app/components/cutscene/SpeakerCamera.ts';

test('closeup frames a rotated character from the front and restores authored camera', () => {
    const character = new Group();
    character.position.set(3, 0, 2); character.rotation.y = Math.PI / 2;
    const body = new Mesh(new BoxGeometry(0.6, 2, 0.4)); body.position.y = 1; character.add(body);
    const cameraParent = new Group(); cameraParent.position.set(1, 2, 0);
    const camera = new PerspectiveCamera(52, 2, 0.1, 100);
    cameraParent.add(camera); camera.position.set(0, 3, 8); camera.lookAt(0, 1, 0);
    cameraParent.updateMatrixWorld(true);
    const position = camera.position.clone(), rotation = camera.quaternion.clone();
    const shot = new SpeakerCamera(); shot.focus(camera, character, body);
    const world = camera.getWorldPosition(new Vector3());
    assert.ok(world.x > 3); assert.ok(Math.abs(world.z - 2) < 0.001);
    const projected = new Vector3(3, 1.36, 2).project(camera);
    assert.ok(Math.abs(projected.x) < 0.001 && Math.abs(projected.y) < 0.001);
    shot.restore(); assert.ok(camera.position.equals(position)); assert.ok(camera.quaternion.equals(rotation));
    shot.restore(); assert.ok(camera.position.equals(position));
});
