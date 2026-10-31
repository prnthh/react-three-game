import {
  AnimationClip,
  AnimationMixer,
  Bone,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  LoopOnce,
} from "three";
import { THROW_DURATION, HEALTH_RULES, STANCE_TIMING, GAITS, advanceGait } from "./shared/protocol";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

const boneKey = (name: string) =>
  name.replace(/^mixamorig:?/i, "").toLowerCase();
export function humanoidBones(root: Object3D) {
  const result = new Map<string, Bone>();
  root.traverse((object) => {
    if ((object as Bone).isBone)
      result.set(boneKey(object.name), object as Bone);
  });
  return result;
}

/** Bake world-space rotation deltas onto a different bind pose, preserving target proportions.
 * Clones both rigs: cached GLTF/FBX assets and other actors must never be mutated.
 * Root travel is removed; only vertical hip bob survives. The match owns displacement.
 */
export function retargetLocomotion(
  source: Object3D,
  target: Object3D,
  clip: AnimationClip,
  name: string,
  preserveHeight = false,
) {
  const from = clone(source),
    to = clone(target);
  from.updateMatrixWorld(true);
  to.updateMatrixWorld(true);
  const sourceBones = humanoidBones(from),
    targetBones = humanoidBones(to);
  const restSource = new Map(
    [...sourceBones].map(([key, bone]) => [
      key,
      bone.getWorldQuaternion(new Quaternion()).invert(),
    ]),
  );
  const restTarget = new Map(
    [...targetBones].map(([key, bone]) => [
      key,
      bone.getWorldQuaternion(new Quaternion()),
    ]),
  );
  const height = (rig: Map<string, Bone>) => {
    const ys = [...rig.values()].map(
      (b) => b.getWorldPosition(new Vector3()).y,
    );
    return Math.max(...ys) - Math.min(...ys);
  };
  const ratio = height(targetBones) / Math.max(0.001, height(sourceBones));
  const hip = targetBones.get("hips"),
    sourceHip = sourceBones.get("hips");
  const hipRest = hip?.position.clone();
  const mixer = new AnimationMixer(from);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const count = Math.ceil(clip.duration * 30) + 1;
  const times = Float32Array.from(
    { length: count },
    (_, i) => (i * clip.duration) / (count - 1),
  );
  const rotations = new Map(
    [...targetBones]
      .filter(([key]) => sourceBones.has(key))
      .map(([key]) => [key, new Float32Array(count * 4)]),
  );
  const positions = new Float32Array(count * 3);
  let startY = sourceHip?.getWorldPosition(new Vector3()).y ?? 0;
  for (let i = 0; i < count; i++) {
    mixer.setTime(times[i]);
    from.updateMatrixWorld(true);
    // GLTF bone traversal is parent-first, including any unmatched target bones.
    to.traverse((object) => {
      const bone = object as Bone;
      if (!bone.isBone) return;
      const key = boneKey(bone.name),
        sourceBone = sourceBones.get(key);
      if (sourceBone) {
        const world = sourceBone
          .getWorldQuaternion(new Quaternion())
          .multiply(restSource.get(key)!)
          .multiply(restTarget.get(key)!);
        const parent =
          bone.parent?.getWorldQuaternion(new Quaternion()) ?? new Quaternion();
        bone.quaternion.copy(parent.invert().multiply(world)).normalize();
        bone.quaternion.toArray(rotations.get(key)!, i * 4);
      }
      if (bone === hip && hipRest && sourceHip) {
        const y = sourceHip.getWorldPosition(new Vector3()).y;
        if (i === 0 && !preserveHeight) startY = y;
        const offset = new Vector3(0, (y - startY) * ratio, 0);
        if (bone.parent) {
          const inverse = bone.parent.matrixWorld.clone().invert();
          offset.applyMatrix4(inverse).sub(new Vector3().applyMatrix4(inverse));
        }
        bone.position.copy(hipRest).add(offset);
        bone.position.toArray(positions, i * 3);
      }
      bone.updateMatrixWorld(true);
    });
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(from);
  const tracks = [...rotations].map(
    ([key, values]) =>
      new QuaternionKeyframeTrack(
        `${targetBones.get(key)!.name}.quaternion`,
        times,
        values,
      ),
  );
  const result = new AnimationClip(name, clip.duration, tracks);
  if (hip && sourceHip)
    result.tracks.push(
      new VectorKeyframeTrack(`${hip.name}.position`, times, positions),
    );
  return result;
}

export { GAITS } from "./shared/protocol";

/** Standalone preview clock; live/replay actors read their saved authoritative gait. */
export class LocomotionClock {
  state: keyof typeof GAITS = "idle";
  phase = 0;
  steps = 0;
  reset() { this.state = "idle"; this.phase = 0; this.steps = 0; }
  advance(speed: number, dt: number) {
    const before = this.steps;
    advanceGait(this, speed, dt);
    return this.steps - before;
  }
}

/** Frame-driven, per-instance mixer. Action transitions never depend on React HUD renders. */
export type CharacterPose = { hp: number; respawn: number; crouching: boolean; crouchAmount?: number; aiming: boolean; throwing: number };
export const EXTRA_ANIMATIONS = ["crouch", "crouch-aim", "throw", "death"] as const;

export class LocomotionPlayer {
  readonly mixer: AnimationMixer;
  private actions;
  private state = "";
  private clock = new LocomotionClock();
  constructor(
    private root: Object3D,
    private clips: AnimationClip[],
    private sharedMixer?: AnimationMixer,
  ) {
    this.mixer = sharedMixer ?? new AnimationMixer(root);
    this.actions = new Map(
      clips.map((clip) => [clip.name, this.mixer.clipAction(clip)]),
    );
  }
  update(speed: number, dt: number, sharedClock?: Readonly<Pick<LocomotionClock, "state" | "phase" | "steps">>, pose?: CharacterPose, presentationTime?: number) {
    if (this.actions.size === 0)
      this.actions = new Map(
        this.clips.map((clip) => [clip.name, this.mixer.clipAction(clip)]),
      );
    if (!sharedClock) this.clock.advance(speed, dt);
    const clock = sharedClock ?? this.clock;
    const requested = pose?.hp === 0 ? "death" : pose && pose.throwing > 0 ? "throw" : pose?.crouching ? (pose.aiming ? "crouch-aim" : "crouch") : clock.state;
    const state = this.actions.has(requested) ? requested : clock.state;
    const action = this.actions.get(state)!;
    if (state !== this.state) {
      const crouched = state === "crouch" || state === "crouch-aim";
      const wasCrouched = this.state === "crouch" || this.state === "crouch-aim";
      const fade = state === "death" ? 0.08 : crouched !== wasCrouched
        ? (crouched ? STANCE_TIMING.crouch : STANCE_TIMING.stand)
        : state === "crouch-aim" ? STANCE_TIMING.aimIn : this.state === "crouch-aim" ? STANCE_TIMING.aimOut : 0.18;
      this.actions.get(this.state)?.fadeOut(fade);
      action.reset().setEffectiveWeight(1).fadeIn(fade).play();
      if (state === "death" || state === "throw") {
        action.setLoop(LoopOnce, 1); action.clampWhenFinished = true;
      }
      this.state = state;
    }
    // Mixer time still advances fades; the shared clock alone advances the pose.
    action.setEffectiveTimeScale(0);
    const duration = action.getClip().duration;
    if (state === "death") action.time = Math.min(duration - 1e-5, (HEALTH_RULES.respawnDelay - pose!.respawn) / 2.7 * duration);
    else if (state === "throw") action.time = Math.min(duration - 1e-5, THROW_DURATION - pose!.throwing);
    else if (state === "crouch" || state === "crouch-aim") action.time = (presentationTime ?? action.time + Math.min(dt, 0.1)) % duration;
    else action.time = clock.phase * duration;
    this.mixer.update(Math.min(dt, 0.1));
  }

  dispose() {
    for (const action of this.actions.values()) action.stop();
    if (!this.sharedMixer) this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.clock.reset();
    this.state = "";
  }
}

/** Interpolate authoritative headings across the shortest arc, including ±π. */
export function interpolateYaw(previous: number, current: number, alpha: number) {
  const delta = Math.atan2(Math.sin(current - previous), Math.cos(current - previous));
  return previous + delta * Math.max(0, Math.min(1, alpha));
}
