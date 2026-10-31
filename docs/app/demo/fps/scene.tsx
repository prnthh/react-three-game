"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { useFrame, useThree, useLoader } from "@react-three/fiber";
import { Billboard, useGLTF } from "@react-three/drei";
import {
  Box3,
  Color,
  Fog,
  Group,
  Vector3,
  PerspectiveCamera,
  CanvasTexture,
  SRGBColorSpace,
  type AnimationClip,
  type Object3D,
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ClusteredLighting } from "three/examples/jsm/lighting/ClusteredLighting.js";
import { WebGPURenderer } from "three/webgpu";
import {
  PrefabRoot,
  registerComponent,
  createNodeComponentType,
  useRegisterNodeComponent,
  useSceneComponents,
  useGameObject,
  useNode,
  type Component,
  type ComponentViewProps,
} from "react-three-game/viewer";
import { withBasePath, BASE_PATH } from "../../basePath";
import {
  STEP, eyeHeight, crouchOffset, aimPitch, THROW_DURATION, THROW_RELEASE,
  type Command,
} from "./shared/protocol";
import type { ClientSession } from "./session";
import type { MatchSnapshot as Match, ClientActor as Actor } from "./shared/protocol";
import { SoundCues, type SpatialAudio } from "./audio";
import { relayYardScene } from "./shared/map";
import { CombatEffects, MuzzleContext, MuzzleSocket } from "./effects";
import { EXTRA_ANIMATIONS, LocomotionPlayer, retargetLocomotion, interpolateYaw } from "./animation";
const asset = (name: string) => withBasePath(`/models/fps/${name}.glb`);
const animationURLs = EXTRA_ANIMATIONS.map(name => withBasePath(`/models/fps/animations/${name}.fbx`));
const LocomotionContext = createContext<SoundCues | null>(null);
const locomotionCache = new WeakMap<Object3D, AnimationClip[]>();
function Model({
  name,
  actor,
  playing,
  height = 1.8,
}: {
  name: string;
  actor: Actor;
  playing: boolean;
  height?: number;
}) {
  const cues = useContext(LocomotionContext)!;
  const session = useContext(SessionContext);
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
  const object = useMemo(() => {
    const c = clone(gltf.scene);
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
    return c;
  }, [gltf, height]);
  const player = useMemo(
    () => new LocomotionPlayer(object, clips),
    [object, clips],
  );
  useEffect(() => () => player.dispose(), [player]);
  useFrame((_, dt) => {
    if (playing) player.update(actor.speed, dt, cues.locomotion(actor.id), actor, session ? session.match.tick * STEP : undefined);
  }, -0.5);
  useEffect(() => {
    player.update(0, 0);
  }, [player]);
  return <primitive object={object} />;
}

function Gun({ castShadow = false }: { castShadow?: boolean }) {
  const { scene } = useGLTF(asset("relay-carbine"));
  const object = useMemo(() => {
    const object = scene.clone(true);
    object.traverse(part => { if ("isMesh" in part) part.castShadow = castShadow; });
    return object;
  }, [scene, castShadow]);
  return <primitive object={object} />;
}
type MatchPresentation = ClientSession;
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
        />
      </group>
      <group ref={equipment}>
      <group ref={gun} position={[0.28, 1.05, -0.12]} scale={0.8}>
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
function GrenadeEffects({ match }: { match: Match }) {
  const root = useRef<Group>(null);
  useFrame(() => {
    if (!root.current) return;
    root.current.children.forEach((mesh, i) => {
      const g = i < 16 ? match.grenades[i] : match.explosions[i - 16];
      mesh.visible = !!g;
      if (!g) return;
      mesh.position.set(g.x, g.y, g.z);
      mesh.scale.setScalar(i < 16 ? 0.09 : 0.2 + ("age" in g ? g.age : 0) * 9);
    });
  });
  return <group ref={root}>{Array.from({ length: 32 }, (_, i) => <mesh key={i} visible={false}>
    <sphereGeometry args={[1, 10, 8]} />
    {i < 16 ? <meshStandardMaterial color="#53603c" roughness={0.7} /> : <meshBasicMaterial color="#ffb34d" transparent opacity={0.22} depthWrite={false} />}
  </mesh>)}</group>;
}

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
function Arena() {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const background = scene.background,
      fog = scene.fog;
    scene.background = new Color("#bbc4bd");
    scene.fog = new Fog("#bbc4bd", 45, 110);
    return () => {
      scene.background = background;
      scene.fog = fog;
    };
  }, [scene]);
  return (
    <>
      <hemisphereLight args={["#b9d8e1", "#5a5042", 1.6]} />
      <directionalLight
        position={[-18, 28, -10]}
        color="#ffe0a6"
        intensity={3.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-layers-mask={3}
        shadow-camera-left={-32}
        shadow-camera-right={32}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-normalBias={0.04}
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          {[-12, -4, 4, 12].map((z) => (
            <group key={z}>
              <mesh position={[side * 13, 3.9, z]}>
                <boxGeometry args={[2, 0.06, 0.18]} />
                <meshStandardMaterial
                  color="#f2e7c2"
                  emissive="#ffd994"
                  emissiveIntensity={3}
                />
              </mesh>
              <pointLight
                position={[side * 13, 3.25, z]}
                color={side < 0 ? "#ffcf8a" : "#9ed7ee"}
                intensity={22}
                distance={12}
                decay={2}
              />
            </group>
          ))}
          <Sign
            position={[side * 13, 3, -16.31]}
            rotation={[0, Math.PI, 0]}
            fontSize={0.48}
            color="#eee5cf"
          >
            {side < 0 ? "01 / WORKSHOP" : "02 / RELAY"}
          </Sign>
          <Sign
            position={[side * 13, 3, 16.31]}
            fontSize={0.48}
            color="#eee5cf"
          >
            {side < 0 ? "MAINTENANCE" : "COMMUNICATIONS"}
          </Sign>
          {[-14, -10, 10, 14].map((z) => (
            <mesh key={z} position={[side * 18.65, 1.8, z]}>
              <boxGeometry args={[0.1, 1.3, 1.7]} />
              <meshStandardMaterial
                color="#253c40"
                metalness={0.4}
                roughness={0.3}
              />
            </mesh>
          ))}
        </group>
      ))}
      {[-1, 1].map((team) => (
        <group key={team}>
          <mesh receiveShadow position={[0, 0.02, team * 21]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[14, 5]} />
            <meshStandardMaterial
              color={team < 0 ? "#4d7974" : "#955c4f"}
              roughness={0.9}
            />
          </mesh>
          <Sign
            position={[0, 0.04, team * 22]}
            rotation={[-Math.PI / 2, 0, team < 0 ? Math.PI : 0]}
            fontSize={0.8}
            color="#eee6ce"
          >
            {team < 0 ? "POCKIT / A" : "MILADY / B"}
          </Sign>
        </group>
      ))}
      {[-4, 4].map((x) => (
        <mesh key={x} position={[x, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.12, 36]} />
          <meshStandardMaterial color="#c7b270" />
        </mesh>
      ))}
      <group position={[15, 4.3, 4]}>
        <mesh position={[0, 3, 0]}>
          <cylinderGeometry args={[0.1, 0.2, 6, 12]} />
          <meshStandardMaterial color="#647477" metalness={0.7} />
        </mesh>
        <mesh position={[0, 5, 0]} rotation={[0.3, 0, 0.5]}>
          <sphereGeometry args={[1.4, 16, 8, 0, Math.PI]} />
          <meshStandardMaterial color="#d4d0bf" side={2} />
        </mesh>
      </group>
    </>
  );
}
function PlayerPresentation({
  match,
  runtime,
  input,
  playing,
  onReady,
  audio,
}: {
  match: Match;
  runtime: ClientSession;
  input: React.RefObject<Command>;
  playing: boolean;
  onReady: () => void;
  audio: SpatialAudio;
}) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  const { camera, gl } = useThree(),
    weapon = useRef<Group>(null),
    carbine = useRef<Group>(null),
    heldGrenade = useRef<Group>(null);
  const cues = useContext(LocomotionContext)!;
  const viewEpoch = useRef(runtime.viewEpoch ?? 0);
  useEffect(() => {
    const renderer = gl as unknown as WebGPURenderer;
    const previous = renderer.lighting;
    const lighting = new ClusteredLighting(32);
    renderer.lighting = lighting;
    return () => {
      if (renderer.lighting === lighting) renderer.lighting = previous;
      lighting.dispose();
    };
  }, [gl]);
  useFrame((_, dt) => {
    if (viewEpoch.current !== (runtime.viewEpoch ?? 0)) {
      viewEpoch.current = runtime.viewEpoch ?? 0;
      audio.stop(); if (playing) audio.enable();
    }
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
    audio.listener(camera.position.x, camera.position.y, camera.position.z, yaw, pitch);
    cues.update(match, playing, audio.play, viewId, runtime.viewEpoch ?? 0);

  }, -1);
  return (
    <>
      <GrenadeEffects match={match} />
      <CombatEffects match={match} playing={playing} runtime={runtime} />
      <group ref={weapon}>
        <group ref={heldGrenade} visible={false}>
          <mesh><sphereGeometry args={[0.065, 12, 10]} /><meshStandardMaterial color="#53603c" roughness={0.7} /></mesh>
          <mesh position={[0, 0.06, 0]}><boxGeometry args={[0.025, 0.035, 0.035]} /><meshStandardMaterial color="#343b32" /></mesh>
        </group>
        <group ref={carbine} scale={0.62}>
          <Gun />
          <MuzzleSocket actor={-1} />
        </group>
      </group>
    </>
  );
}

export type FPSSession = {
  runtime: ClientSession;
  match: Match;
  input: RefObject<Command>;
  playing: boolean;
  onHud: () => void;
  onReady: () => void;
  audio: SpatialAudio;
};
const SessionContext = createContext<FPSSession | null>(null);
export const FPS_MATCH_MANAGER = createNodeComponentType<MatchPresentation>(
  "FPSMatchManager",
);

function MatchManagerView({
  properties,
  enabled,
  children,
}: ComponentViewProps<{ maxFrameDelta: number }>) {
  const session = useContext(SessionContext),
    { editMode } = useNode();
  const hudTimer = useRef(0);
  const handle = session?.runtime ?? null;
  useRegisterNodeComponent(FPS_MATCH_MANAGER, enabled ? handle : null);
  // Authority and client snapshots advance before presentation callbacks.
  useFrame((_, dt) => {
    if (!session || !enabled || editMode) return;
    session.runtime.advance(dt, session.input.current, session.playing, properties.maxFrameDelta);
    if (!session.playing) return;
    hudTimer.current += dt;
    if (hudTimer.current > 0.07) {
      session.onHud();
      hudTimer.current = 0;
    }
  }, -2);
  return <>{children}</>;
}

function useManagedSession(managerId: string) {
  const session = useContext(SessionContext);
  const manager = useGameObject(managerId);
  const matches = useSceneComponents(FPS_MATCH_MANAGER);
  const entry = matches.find((entry) => entry.key === manager.id);
  return session && entry?.value.state === session.match
    ? { ...session, presentation: entry.value } : null;
}
function PlayerControllerView({
  properties,
  enabled,
  children,
}: ComponentViewProps<{ manager: string }>) {
  const session = useManagedSession(properties.manager),
    { editMode } = useNode();
  return (
    <>
      {session && enabled && !editMode && <PlayerPresentation {...session} />}
      {children}
    </>
  );
}
function CharacterView({
  properties,
  enabled,
  children,
}: ComponentViewProps<{ manager: string; actorId: number }>) {
  const session = useManagedSession(properties.manager),
    { editMode } = useNode();
  const actor = session?.match.actors.find((a) => a.id === properties.actorId);
  return (
    <>
      {actor && enabled && (
        <Fighter actor={actor} playing={session!.playing && !editMode}
          presentation={session!.presentation} />
      )}{" "}
      {children}
    </>
  );
}
export const MatchManagerComponent: Component<{ maxFrameDelta: number }> = {
  name: "FPSMatchManager",
  description:
    "Owns fixed-step match simulation: bots, combat, respawns and scoring.",
  properties: {
    maxFrameDelta: {
      default: 0.1,
      min: STEP,
      max: 0.25,
      step: 0.01,
      description: "Maximum catch-up time per rendered frame, in seconds.",
    },
  },
  View: MatchManagerView,
};
export const PlayerControllerComponent: Component<{ manager: string }> = {
  name: "FPSPlayerController",
  description:
    "First-person camera, weapon presentation and shot feedback; reads the named match manager.",
  properties: { manager: { type: "string", default: "match-manager" } },
  View: PlayerControllerView,
};
export const CharacterComponent: Component<{
  manager: string;
  actorId: number;
}> = {
  name: "FPSCharacter",
  description:
    "Presents one match actor with independent locomotion animation.",
  properties: {
    manager: { type: "string", default: "match-manager" },
    actorId: { default: 1, min: 0, max: 7, step: 1 },
  },
  View: CharacterView,
};
/** Editor-only markers are children of the node, so selection and transforms work normally. */
export const SpawnPointComponent: Component<{ team: "alpha" | "bravo" }> = {
  name: "FPSSpawnPoint",
  description: "Team spawn position and facing. Forward is local -Z. Read by the match authority on map load.",
  properties: { team: { type: "select", default: "alpha", options: [
    { value: "alpha", label: "Alpha / Remilio" }, { value: "bravo", label: "Bravo / Milady" },
  ] } },
  View: function SpawnPointView({ properties, children }) {
    const { editMode, isSelected } = useNode();
    const color = isSelected ? "#ffffff" : properties.team === "bravo" ? "#ff795c" : "#49dbbd";
    return <>{children}{editMode && <group>
      <mesh position={[0, 0.9, 0]} renderOrder={10000}>
        <capsuleGeometry args={[0.3, 1.2, 4, 8]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.65} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.08, -0.65]} renderOrder={10000}>
        <boxGeometry args={[0.07, 0.07, 1.3]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.08, -1.4]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={10000}>
        <coneGeometry args={[0.2, 0.4, 8]} />
        <meshBasicMaterial color={color} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>}</>;
  },
};
const ArenaComponent: Component<{}> = {
  name: "FPSArena",
  description: "Relay Yard lighting, signs and decorative details.",
  properties: {},
  View: ({ children }) => (
    <>
      <Arena />
      {children}
    </>
  ),
};
registerComponent(MatchManagerComponent);
registerComponent(PlayerControllerComponent);
registerComponent(CharacterComponent);
registerComponent(ArenaComponent);
registerComponent(SpawnPointComponent);

/** React supplies the local session/UI bridge; scene nodes own the runtime behaviors. */
export function FPSScene(props: FPSSession) {
  const cues = useMemo(() => new SoundCues(), [props.match]);
  const muzzles = useMemo(() => new Map<number, Group>(), [props.match]);
  useLoader(FBXLoader, animationURLs);
  // Resolve assets before committing registry-backed nodes, avoiding a scene-wide
  // Suspense hide/unregister cycle while character components discover the manager.
  useGLTF([
    asset("pockit-remilio"),
    asset("pockit-milady"),
    asset("relay-carbine"),
  ]);
  return (
    <SessionContext.Provider value={props}>
      <LocomotionContext.Provider value={cues}>
        <MuzzleContext.Provider value={muzzles}>
          <PrefabRoot id="fps" data={relayYardScene} basePath={BASE_PATH} />
        </MuzzleContext.Provider>
      </LocomotionContext.Provider>
    </SessionContext.Provider>
  );
}
