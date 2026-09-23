import { Box3, PerspectiveCamera, Quaternion, Vector3, type Camera, type Object3D } from 'three';

/** Temporary front-facing shot; the authored room camera is restored exactly. */
export class SpeakerCamera {
    private saved: { camera: Camera; position: Vector3; quaternion: Quaternion } | null = null;

    focus(camera: Camera, character: Object3D, model: Object3D) {
        this.restore();
        character.updateWorldMatrix(true, true);
        const bounds = new Box3().setFromObject(model, true);
        if (bounds.isEmpty()) return;
        this.saved = { camera, position: camera.position.clone(), quaternion: camera.quaternion.clone() };
        const size = bounds.getSize(new Vector3());
        const height = Math.max(size.y, 0.5);
        const target = bounds.getCenter(new Vector3());
        target.y = bounds.min.y + height * 0.68;
        const forward = new Vector3(0, 0, 1).applyQuaternion(character.getWorldQuaternion(new Quaternion()));
        forward.y = 0;
        forward.normalize();
        const halfFov = camera instanceof PerspectiveCamera ? camera.getEffectiveFOV() * Math.PI / 360 : Math.PI / 6;
        const aspect = camera instanceof PerspectiveCamera ? camera.aspect : 1;
        const distance = Math.max(height * 0.46, size.x * 0.65 / aspect) / Math.tan(halfFov);
        const position = target.clone().addScaledVector(forward, distance);
        position.y += height * 0.06;
        camera.parent?.worldToLocal(position);
        camera.position.copy(position);
        camera.lookAt(target);
        camera.updateMatrixWorld(true);
    }

    restore() {
        if (!this.saved) return;
        const { camera, position, quaternion } = this.saved;
        camera.position.copy(position);
        camera.quaternion.copy(quaternion);
        camera.updateMatrixWorld(true);
        this.saved = null;
    }
}
