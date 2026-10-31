import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { Billboard, useGLTF } from "@react-three/drei";
import { Box3, Group, Vector3, CanvasTexture, SRGBColorSpace, type AnimationClip, type Object3D } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { useSkinnedModel, useRegisterNodeComponent, SKINNED_MESH_COMPONENT, useComponentActive, type Component, type ComponentViewProps } from "react-three-game/viewer";
import { STEP, crouchOffset, aimPitch, type ClientActor as Actor } from "../shared/protocol";
import { EXTRA_ANIMATIONS, LocomotionPlayer, retargetLocomotion, interpolateYaw } from "../animation";
import { asset, animationURLs } from "../assets";
import { WeaponArms } from "../weaponPose";
import { useManagedSession, type MatchPresentation } from "./SessionSystems";
import { MuzzleSocket } from "./CombatEffects";
import { Gun } from "./Gun";

const locomotionCache = new WeakMap<Object3D, AnimationClip[]>();
function Model({
  name,
  actor,
  playing,
  height = 1.8,
  weapon,
  actorRoot,
  presentation,
}: {
  name: string;
  actor: Actor;
  playing: boolean;
  height?: number;
  weapon?: RefObject<Group | null>;
  actorRoot?: RefObject<Group | null>;
  presentation?: MatchPresentation;
}) {
  const gltf = useGLTF(asset(name));
  const source = useGLTF(asset("pockit-remilio"));
  const external = useLoader(FBXLoader, animationURLs);
  const clips = useMemo(() => {
    let clips = locomotionCache.get(gltf.scene);
    if (!clips) {
      const extras = external.map((fbx, i) => {
        const clip = fbx.animations[0].clone();
        clip.name = EXTRA_ANIMATIONS[i];
        // Keep root motion under authority while preserving crouch/death height.
        for (const track of clip.tracks) if (track.name.endsWith("Hips.position")) {
          for (let j = 0; j < track.values.length; j += 3) {
            track.values[j] = track.values[0]; track.values[j + 2] = track.values[2];
          }
        }
        return clip;
      });
      const all = [...source.animations, ...extras];
      clips = gltf.scene === source.scene ? all : all.map(clip =>
        retargetLocomotion(source.scene, gltf.scene, clip, clip.name, extras.includes(clip)));
      locomotionCache.set(gltf.scene, clips);
    }
    return clips;
  }, [gltf, source, external]);
  const prepare = useCallback((c: Object3D) => {
    c.updateMatrixWorld(true);
    const b = new Box3().setFromObject(c),
      s = b.getSize(new Vector3()),
      center = b.getCenter(new Vector3());
    const scale = height / s.y;
    c.scale.multiplyScalar(scale);
    c.position.set(-center.x * scale, -b.min.y * scale, -center.z * scale);
    c.traverse((o) => {
      if ("isMesh" in o) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
  }, [height]);
  const model = useSkinnedModel(gltf.scene, { animations: clips, prepare })!;
  const object = model.object;
  useRegisterNodeComponent(SKINNED_MESH_COMPONENT, model);
  const player = useMemo(
    () => new LocomotionPlayer(object, clips, model.mixer),
    [object, clips, model.mixer],
  );
  const arms = useMemo(() => new WeaponArms(object), [object]);
  useEffect(() => () => player.dispose(), [player]);
  // Parent placement and weapon pose run at -0.4, after the mixer at -0.5.
  useFrame(() => {
    if (playing && weapon?.current && actorRoot?.current) arms.update(weapon.current, actorRoot.current, actor);
  }, -0.3);
  useFrame((_, dt) => {
    if (playing) player.update(actor.speed, dt, actor.gait, actor, presentation ? presentation.state.tick * STEP : undefined);
  }, -0.5);
  useEffect(() => {
    player.update(0, 0);
  }, [player]);
  return <primitive object={object} dispose={null} />;
}

function Fighter({ actor, playing, presentation }: {
  actor: Actor;
  playing: boolean;
  presentation: MatchPresentation;
}) {
  const root = useRef<Group>(null), equipment = useRef<Group>(null), gun = useRef<Group>(null);
  const nameplate = useRef<Group>(null);
  const shadowOnly = useRef<boolean | null>(null);
  useFrame(() => {
    if (!root.current) return;
    const viewActor = presentation.state.actors.find(pose => pose.id === (presentation.viewActorId ?? 0));
    const firstPerson = actor.id === viewActor?.id;
    if (nameplate.current) {
      nameplate.current.visible = playing && actor.hp > 0 && !!viewActor && !firstPerson && actor.team === viewActor.team;
      nameplate.current.position.y = 2.08 - crouchOffset(actor);
    }
    const previous = presentation.previous.actors.find((pose) => pose.id === actor.id);
    // Remote presentation trails authority by one tick. Death/respawn is a teleport.
    const alpha = (!firstPerson || presentation.predictLook === false) && previous && previous.hp > 0 && actor.hp > 0 &&
      previous.deaths === actor.deaths ? presentation.alpha : 1;
    const pose = previous ?? actor;
    root.current.position.set(
      pose.x + (actor.x - pose.x) * alpha,
      pose.y + (actor.y - pose.y) * alpha,
      pose.z + (actor.z - pose.z) * alpha,
    );
    root.current.rotation.y = interpolateYaw(pose.yaw, actor.yaw, alpha);
    // Keep the viewed character in the shadow pass. Hiding the group also hides
    // it from lights; a separate mesh layer hides only its first-person pixels.
    if (shadowOnly.current !== firstPerson) {
      root.current.traverse(part => { if ("isMesh" in part) part.layers.set(firstPerson ? 1 : 0); });
      shadowOnly.current = firstPerson;
    }
    if (gun.current) gun.current.rotation.x = aimPitch(actor.pitch, actor.recoilPitch);
    if (equipment.current) {
      equipment.current.visible = actor.hp > 0 && actor.throwing === 0;
      equipment.current.position.y = -crouchOffset(actor);
    }
  }, -0.4);
  return (
    <group ref={root}>
      <group rotation={[0, Math.PI, 0]}>
        <Model
          name={actor.team ? "pockit-milady" : "pockit-remilio"}
          actor={actor}
          playing={playing}
          weapon={gun}
          actorRoot={root}
          presentation={presentation}
        />
      </group>
      <group ref={equipment}>
      <group ref={gun}>
        <Gun castShadow />
        <MuzzleSocket actor={actor.id} />
      </group>
      </group>
      <group ref={nameplate} visible={false}>
        <Billboard>
          <Sign position={[0, 0, 0]} fontSize={0.32} color="#69b7ff">{actor.name}</Sign>
        </Billboard>
      </group>
    </group>
  );
}
/** Reusable meshes follow snapshot buffers without spawning React objects per tick. */
function Sign({
  children,
  fontSize,
  color,
  ...props
}: {
  children: string;
  fontSize: number;
  color: string;
  position: [number, number, number];
  rotation?: [number, number, number];
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "bold 72px Arial";
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(children, 512, 64, 1000);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }, [children, color]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <mesh {...props}>
      <planeGeometry args={[fontSize * 8, fontSize]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}
function CharacterView({
  properties,
  enabled,
  children,
}: ComponentViewProps<{ manager: string; actorId: number }>) {
  const session = useManagedSession(properties.manager),
    active = useComponentActive(enabled);
  const actor = session?.presentation.state.actors.find((a) => a.id === properties.actorId);
  return (
    <>
      {actor && enabled && (
        <Fighter actor={actor} playing={session!.playing && active}
          presentation={session!.presentation} />
      )}{" "}
      {children}
    </>
  );
}
export const CharacterComponent: Component<{
  manager: string;
  actorId: number;
}> = {
  name: "FPSCharacter",
  category: "mesh",
  description:
    "Presents one match actor with independent locomotion animation.",
  properties: {
    manager: { type: "string", default: "match-manager" },
    actorId: { default: 1, min: 0, max: 7, step: 1 },
  },
  View: CharacterView,
};
