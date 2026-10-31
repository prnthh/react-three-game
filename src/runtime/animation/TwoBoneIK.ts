import { Object3D, Quaternion, Vector3 } from 'three';

/** Analytic, rotation-only limb constraint. Targets/poles are world-space.
 * Run after animation and parent transforms. Uniform rig scale is supported;
 * never changes bone lengths or allocates objects during solve().
 */
export class TwoBoneIK {
    private a = new Vector3();
    private b = new Vector3();
    private c = new Vector3();
    private axis = new Vector3();
    private bend = new Vector3();
    private elbow = new Vector3();
    private end = new Vector3();
    private from = new Vector3();
    private to = new Vector3();
    private rotation = new Quaternion();
    private world = new Quaternion();
    private parent = new Quaternion();
    private upperPose = new Quaternion();
    private lowerPose = new Quaternion();
    private tipPose = new Quaternion();
    private identity = new Quaternion();

    constructor(readonly upper: Object3D, readonly lower: Object3D, readonly tip: Object3D) {
        if (lower.parent !== upper || tip.parent !== lower)
            throw new Error('TwoBoneIK requires a direct upper → lower → tip chain');
    }

    solve(target: Vector3, pole: Vector3, weight = 1, orientation?: Quaternion) {
        weight = Math.max(0, Math.min(1, weight));
        if (!weight) return;
        this.upper.updateWorldMatrix(true, true);
        this.upper.getWorldPosition(this.a);
        this.lower.getWorldPosition(this.b);
        this.tip.getWorldPosition(this.c);
        const first = this.a.distanceTo(this.b), second = this.b.distanceTo(this.c);
        if (first < 1e-8 || second < 1e-8) return;
        this.upperPose.copy(this.upper.quaternion);
        this.lowerPose.copy(this.lower.quaternion);
        this.tipPose.copy(this.tip.quaternion);
        this.axis.subVectors(target, this.a);
        if (this.axis.lengthSq() < 1e-12) this.axis.subVectors(this.c, this.a);
        if (this.axis.lengthSq() < 1e-12) this.axis.set(0, 1, 0);
        const distance = Math.max(Math.abs(first - second) + 1e-6,
            Math.min(first + second - 1e-6, this.a.distanceTo(target)));
        this.axis.normalize();
        this.bend.subVectors(pole, this.a).addScaledVector(this.axis, -this.bend.dot(this.axis));
        if (this.bend.lengthSq() < 1e-10) {
            this.bend.set(Math.abs(this.axis.x) < 0.9 ? 1 : 0, Math.abs(this.axis.x) < 0.9 ? 0 : 1, 0);
            this.bend.addScaledVector(this.axis, -this.bend.dot(this.axis));
        }
        this.bend.normalize();
        const along = (first * first - second * second + distance * distance) / (2 * distance);
        const across = Math.sqrt(Math.max(0, first * first - along * along));
        this.elbow.copy(this.a).addScaledVector(this.axis, along).addScaledVector(this.bend, across);
        this.end.copy(this.a).addScaledVector(this.axis, distance);
        this.rotate(this.upper, this.a, this.b, this.elbow);
        this.lower.getWorldPosition(this.b);
        this.tip.getWorldPosition(this.c);
        this.rotate(this.lower, this.b, this.c, this.end);
        if (orientation) {
            this.lower.getWorldQuaternion(this.parent).invert();
            this.tip.quaternion.copy(this.parent).multiply(orientation);
        }
        this.upper.quaternion.copy(this.upperPose.slerp(this.upper.quaternion, weight));
        this.lower.quaternion.copy(this.lowerPose.slerp(this.lower.quaternion, weight));
        this.tip.quaternion.copy(this.tipPose.slerp(this.tip.quaternion, weight));
        this.upper.updateWorldMatrix(false, true);
    }

    /** Optional shoulder/hip assistance before solve(). Rotates the upper bone's
     * parent only when the target exceeds reach. Animation must restore that
     * parent before each frame; maxAngle is a world-space angular limit in radians. */
    reachWithParent(target: Vector3, maxAngle: number) {
        const joint = this.upper.parent;
        if (!joint || maxAngle <= 0) return;
        joint.updateWorldMatrix(true, true);
        this.upper.getWorldPosition(this.a);
        this.lower.getWorldPosition(this.b);
        this.tip.getWorldPosition(this.c);
        const reach = this.a.distanceTo(this.b) + this.b.distanceTo(this.c);
        const excess = this.a.distanceTo(target) - reach * 0.98;
        if (excess <= 0) return;
        joint.getWorldPosition(this.b);
        this.from.subVectors(this.a, this.b);
        const turnLimit = Math.min(maxAngle, excess * 2 / Math.max(this.from.length(), 1e-6));
        this.from.normalize();
        this.to.subVectors(target, this.b).normalize();
        this.rotation.setFromUnitVectors(this.from, this.to);
        const angle = this.rotation.angleTo(this.identity);
        this.rotation.slerp(this.identity, 1 - Math.min(1, turnLimit / Math.max(angle, 1e-6)));
        joint.getWorldQuaternion(this.world).premultiply(this.rotation);
        if (joint.parent) joint.parent.getWorldQuaternion(this.parent).invert();
        else this.parent.identity();
        joint.quaternion.copy(this.parent).multiply(this.world);
        joint.updateWorldMatrix(false, true);
    }

    private rotate(bone: Object3D, origin: Vector3, current: Vector3, target: Vector3) {
        this.from.subVectors(current, origin).normalize();
        this.to.subVectors(target, origin).normalize();
        this.rotation.setFromUnitVectors(this.from, this.to);
        bone.getWorldQuaternion(this.world).premultiply(this.rotation);
        if (bone.parent) bone.parent.getWorldQuaternion(this.parent).invert();
        else this.parent.identity();
        bone.quaternion.copy(this.parent).multiply(this.world).normalize();
        bone.updateWorldMatrix(false, true);
    }
}
