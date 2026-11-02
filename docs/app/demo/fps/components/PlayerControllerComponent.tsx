import { useContext, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, PerspectiveCamera, Quaternion } from "three";
import { useComponentActive, useGameObject, type Component, type ComponentViewProps } from "react-three-game/viewer";
import { eyeHeight, aimPitch, THROW_DURATION, THROW_RELEASE, type Command, type MatchSnapshot as Match } from "../shared/protocol";
import type { ClientSession } from "../session";
import { interpolateYaw } from "../animation";
import { SessionContext, useManagedSession } from "./SessionSystems";
import { GrenadeModel, MuzzleSocket } from "./CombatEffects";
import { Gun } from "./Gun";

function PlayerPresentation({
  match,
  runtime,
  input,
  playing,
  aimFov,
  fovResponse,
}: {
  match: Match;
  runtime: ClientSession;
  input: React.RefObject<Command>;
  playing: boolean;
  aimFov: number;
  fovResponse: number;
}) {
  const { camera } = useThree(),
    weapon = useRef<Group>(null),
    carbine = useRef<Group>(null),
    heldGrenade = useRef<Group>(null);
  const node = useGameObject();
  const parentRotation = useMemo(() => new Quaternion(), []);
  const baseFov = useMemo(() => camera instanceof PerspectiveCamera ? camera.fov : 76, [camera]);
  useEffect(() => () => {
    if (camera instanceof PerspectiveCamera) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
  }, [camera, baseFov]);
  useFrame((_, dt) => {
    const object = node.transform;
    if (!object) return;
    const viewId = runtime.viewActorId ?? 0;
    const a = match.actors.find(actor => actor.id === viewId)!;
    const previous = runtime.previous.actors.find(actor => actor.id === viewId) ?? a;
    // Replay camera and world must sample the same point between authority ticks.
    const alpha = runtime.predictLook === false && previous.hp > 0 && a.hp > 0 && previous.deaths === a.deaths ? runtime.alpha : 1;
    object.position.set(previous.x + (a.x - previous.x) * alpha,
      previous.y + eyeHeight(previous) + (a.y + eyeHeight(a) - previous.y - eyeHeight(previous)) * alpha,
      previous.z + (a.z - previous.z) * alpha);
    // Immediate raw look is the only live prediction here. Replays ignore device input.
    const yaw = runtime.predictLook === false ? interpolateYaw(previous.yaw, a.yaw, alpha) : input.current.yaw;
    const pitch = aimPitch(runtime.predictLook === false ? previous.pitch + (a.pitch - previous.pitch) * alpha : input.current.pitch,
      previous.recoilPitch + (a.recoilPitch - previous.recoilPitch) * alpha);
    object.rotation.set(pitch, yaw, 0, "YXZ");
    if (object.parent) {
      object.parent.updateWorldMatrix(true, false);
      object.parent.worldToLocal(object.position);
      object.parent.getWorldQuaternion(parentRotation);
      object.quaternion.premultiply(parentRotation.invert());
    }
    const cam = camera as PerspectiveCamera;
    const target = baseFov + (aimFov - baseFov) * a.aimAmount;
    if (Math.abs(cam.fov - target) > 0.1) {
      cam.fov += (target - cam.fov) * Math.min(1, dt * fovResponse);
      cam.updateProjectionMatrix();
    }
    if (weapon.current) {
      weapon.current.visible = a.hp > 0;
      if (carbine.current) {
        carbine.current.visible = a.throwing === 0;
        const latest = match.shots.find(s => s.shooter === viewId);
        const recoil = latest ? Math.exp(-latest.age * 40) : 0;
        const aim = a.aimAmount;
        carbine.current.position.set(0.24 - 0.21 * aim, (-0.27 + 0.09 * aim) + recoil * 0.008, (-0.4 + 0.07 * aim) + recoil * 0.045);
        carbine.current.rotation.set(a.reload > 0 ? -0.6 : recoil * 0.055, 0, a.reload > 0 ? -0.3 : 0);
      }
      if (heldGrenade.current) {
        const elapsed = THROW_DURATION - a.throwing;
        heldGrenade.current.visible = a.throwing > 0 && elapsed < THROW_RELEASE;
        heldGrenade.current.position.set(0.24, -0.28 + Math.sin(elapsed / THROW_RELEASE * Math.PI) * 0.2, -0.4);
        heldGrenade.current.rotation.x = -elapsed * 2;
      }
    }

  }, -1);
  return (
    <>
      <group ref={weapon}>
        <group ref={heldGrenade} visible={false}>
          <GrenadeModel />
        </group>
        <group ref={carbine} scale={0.62}>
          <Gun />
          <MuzzleSocket actor={-1} />
        </group>
      </group>
    </>
  );
}

function PlayerControllerView({
  properties,
  enabled,
  children,
}: ComponentViewProps<PlayerControllerProperties>) {
  const binding = useManagedSession(properties.manager);
  const session = useContext(SessionContext);
  const active = useComponentActive(enabled);
  return (
    <>
      {binding && session && active && <PlayerPresentation {...session} aimFov={properties.aimFov} fovResponse={properties.fovResponse} />}
      {children}
    </>
  );
}
type PlayerControllerProperties = { manager: string; aimFov: number; fovResponse: number };
export const PlayerControllerComponent: Component<PlayerControllerProperties> = {
  name: "FPSPlayerController",
  category: "camera",
  description:
    "First-person camera motion and held equipment; reads the named host-session binding. Add Camera to this node to author projection and clipping; this behavior controls its live pose and aim FOV.",
  properties: {
    manager: { type: "string", default: "match-manager" },
    aimFov: { default: 52, min: 1, max: 179 },
    fovResponse: { default: 12, min: 0 },
  },
  View: PlayerControllerView,
};
