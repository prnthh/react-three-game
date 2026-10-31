import { useContext, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Group, PerspectiveCamera } from "three";
import { useComponentActive, type Component, type ComponentViewProps } from "react-three-game/viewer";
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
}: {
  match: Match;
  runtime: ClientSession;
  input: React.RefObject<Command>;
  playing: boolean;
}) {
  const { camera } = useThree(),
    weapon = useRef<Group>(null),
    carbine = useRef<Group>(null),
    heldGrenade = useRef<Group>(null);
  useFrame((_, dt) => {
    const viewId = runtime.viewActorId ?? 0;
    const a = match.actors.find(actor => actor.id === viewId)!;
    const previous = runtime.previous.actors.find(actor => actor.id === viewId) ?? a;
    // Replay camera and world must sample the same point between authority ticks.
    const alpha = runtime.predictLook === false && previous.hp > 0 && a.hp > 0 && previous.deaths === a.deaths ? runtime.alpha : 1;
    camera.position.set(previous.x + (a.x - previous.x) * alpha,
      previous.y + eyeHeight(previous) + (a.y + eyeHeight(a) - previous.y - eyeHeight(previous)) * alpha,
      previous.z + (a.z - previous.z) * alpha);
    // Immediate raw look is the only live prediction here. Replays ignore device input.
    const yaw = runtime.predictLook === false ? interpolateYaw(previous.yaw, a.yaw, alpha) : input.current.yaw;
    const pitch = aimPitch(runtime.predictLook === false ? previous.pitch + (a.pitch - previous.pitch) * alpha : input.current.pitch,
      previous.recoilPitch + (a.recoilPitch - previous.recoilPitch) * alpha);
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    const cam = camera as PerspectiveCamera;
    const target = 76 - 24 * a.aimAmount;
    if (Math.abs(cam.fov - target) > 0.1) {
      cam.fov += (target - cam.fov) * Math.min(1, dt * 12);
      cam.updateProjectionMatrix();
    }
    if (weapon.current) {
      weapon.current.position.copy(camera.position);
      weapon.current.quaternion.copy(camera.quaternion);
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
}: ComponentViewProps<{ manager: string }>) {
  const binding = useManagedSession(properties.manager);
  const session = useContext(SessionContext);
  const active = useComponentActive(enabled);
  return (
    <>
      {binding && session && active && <PlayerPresentation {...session} />}
      {children}
    </>
  );
}
export const PlayerControllerComponent: Component<{ manager: string }> = {
  name: "FPSPlayerController",
  category: "camera",
  description:
    "First-person camera and held equipment; reads the named host-session binding.",
  properties: { manager: { type: "string", default: "match-manager" } },
  View: PlayerControllerView,
};
