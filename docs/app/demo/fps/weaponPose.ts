import { Euler, Quaternion, Vector3, type Bone, type Object3D } from "three";
import { TwoBoneIK } from "react-three-game/viewer";
import { humanoidBones, type CharacterPose } from "./animation";
import { crouchOffset } from "./shared/protocol";

/** Weapon sockets are in weapon-local space; poles are in actor-local space.
 * The weapon drives hands, never the reverse (avoids a cyclic bone dependency).
 */
const CARBINE_POSE = {
  scale: 0.7,
  stock: new Vector3(0, 0.015, 0.36),
  shoulderOffset: new Vector3(-0.025, -0.04, 0.015),
  shoulderReach: 0.45,
  grips: [
    { side: "right", position: [0.04, -0.10, 0.12], rotation: [-Math.PI / 2, 0, 0], pole: [0.65, 0.8, 0.1] },
    { side: "left", position: [-0.04, -0.04, -0.10], rotation: [0, 0, -Math.PI / 2], pole: [-0.65, 0.8, 0.1] },
  ] as const,
};

export class WeaponArms {
  private target = new Vector3();
  private pole = new Vector3();
  private orientation = new Quaternion();
  private weaponRotation = new Quaternion();
  private shoulder: Bone | undefined;
  private shoulderPoint = new Vector3();
  private stockOffset = new Vector3();
  private chains;
  constructor(root: Object3D) {
    const rig = humanoidBones(root);
    this.shoulder = rig.get("rightarm");
    this.chains = CARBINE_POSE.grips.flatMap(grip => {
      const upper = rig.get(`${grip.side}arm`), lower = rig.get(`${grip.side}forearm`), hand = rig.get(`${grip.side}hand`);
      return upper && lower && hand ? [{
        solver: new TwoBoneIK(upper, lower, hand),
        position: new Vector3(...grip.position), pole: new Vector3(...grip.pole),
        rotation: new Quaternion().setFromEuler(new Euler(...grip.rotation)),
      }] : [];
    });
  }
  update(weapon: Object3D, actorRoot: Object3D, pose: CharacterPose) {
    // Full-body actions retain their authored arms. Locomotion remains underneath
    // the IK layer, so releasing the weapon never leaves stale masked bone poses.
    if (pose.hp === 0 || pose.throwing > 0) return;
    weapon.scale.setScalar(CARBINE_POSE.scale);
    // Seat the stock against the inside of the animated right shoulder. Deriving the
    // receiver from the stock socket makes pitch pivot around the shoulder,
    // rather than through the chest, and adapts to either rig's proportions.
    if (this.shoulder && weapon.parent) {
      this.shoulder.getWorldPosition(this.shoulderPoint);
      weapon.parent.updateWorldMatrix(true, false);
      weapon.parent.worldToLocal(this.shoulderPoint);
      this.shoulderPoint.add(CARBINE_POSE.shoulderOffset);
      this.stockOffset.copy(CARBINE_POSE.stock).multiply(weapon.scale).applyQuaternion(weapon.quaternion);
      weapon.position.copy(this.shoulderPoint).sub(this.stockOffset);
    }
    weapon.updateWorldMatrix(true, false);
    weapon.getWorldQuaternion(this.weaponRotation);
    for (const chain of this.chains) {
      this.target.copy(chain.position).applyMatrix4(weapon.matrixWorld);
      this.pole.copy(chain.pole);
      this.pole.y -= crouchOffset(pose);
      this.pole.applyMatrix4(actorRoot.matrixWorld);
      this.orientation.copy(this.weaponRotation).multiply(chain.rotation);
      if ((chain.solver.upper.parent as Bone | null)?.isBone)
        chain.solver.reachWithParent(this.target, CARBINE_POSE.shoulderReach);
      chain.solver.solve(this.target, this.pole, 1, this.orientation);
    }
  }
}
