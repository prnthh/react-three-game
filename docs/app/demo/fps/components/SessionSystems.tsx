import { createContext, useContext, useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Euler, Quaternion, Vector3 } from 'three';
import { createNodeComponentType, useComponentActive, useGameObject, useRegisterNodeComponent, useSceneComponents, type Component, type ComponentViewProps } from "react-three-game/viewer";
import type { ClientSession } from "../session";
import type { Command, MatchSnapshot as Match } from "../shared/protocol";
import { SoundCues, type SpatialAudio } from "../audio";

function WorldAudioView({ enabled, children }: ComponentViewProps<{}>) {
  const session = useContext(SessionContext);
  const active = useComponentActive(enabled);
  const camera = useThree(state => state.camera);
  const listener = useMemo(() => ({ position: new Vector3(), rotation: new Euler(0, 0, 0, 'YXZ'), quaternion: new Quaternion() }), []);
  const cues = useMemo(() => new SoundCues(), [session?.runtime]);
  const viewEpoch = useRef(session?.runtime.viewEpoch ?? 0);
  const audio = session?.audio;
  useEffect(() => {
    if (active && audio) return () => audio.stop();
  }, [active, audio]);
  useFrame(() => {
    if (!session || !active) return;
    const { runtime, match, playing, audio } = session;
    if (viewEpoch.current !== (runtime.viewEpoch ?? 0)) {
      viewEpoch.current = runtime.viewEpoch ?? 0;
      audio.stop(); if (playing) audio.enable();
    }
    camera.getWorldPosition(listener.position);
    camera.getWorldQuaternion(listener.quaternion);
    listener.rotation.setFromQuaternion(listener.quaternion, 'YXZ');
    audio.listener(listener.position.x, listener.position.y, listener.position.z, listener.rotation.y, listener.rotation.x);
    cues.update(match, playing, audio.play, runtime.viewActorId ?? 0, runtime.viewEpoch ?? 0);
  }, -0.9);
  return children;
}
export const WorldAudioComponent: Component<{}> = {
  name: 'FPSWorldAudio', category: 'audio', exclusive: 'fps-world-audio', properties: {},
  description: 'Play positional match sounds from the host session using the active scene camera. Audio permission and device lifetime belong to the host.',
  View: WorldAudioView,
};

/** One driver per host session; prefab bindings never advance simulation. */
export function SessionDriver({ runtime, input, playing, onHud, onReady }: FPSSession) {
  const hudTimer = useRef(0);
  useEffect(onReady, [onReady]);
  useFrame((_, dt) => {
    runtime.advance(dt, input.current, playing, 0.1);
    if (!playing) return;
    hudTimer.current += dt;
    if (hudTimer.current > 0.07) { onHud(); hudTimer.current = 0; }
  }, -2);
  return null;
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
export const SessionContext = createContext<FPSSession | null>(null);
export type MatchPresentation = Pick<ClientSession, "state" | "previous" | "alpha" | "predictLook" | "viewActorId" | "viewEpoch">;
export type CharacterSession = { presentation: MatchPresentation; playing: boolean };
export const FPS_MATCH_MANAGER = createNodeComponentType<CharacterSession>(
  "FPSMatchManager",
);

function MatchManagerView({ enabled, children }: ComponentViewProps<{}>) {
  const session = useContext(SessionContext);
  const handle = useMemo<CharacterSession | null>(() => {
    if (!session) return null;
    const { runtime } = session;
    return { playing: session.playing, presentation: {
      get state() { return runtime.state; },
      get previous() { return runtime.previous; },
      get alpha() { return runtime.alpha; },
      get predictLook() { return runtime.predictLook; },
      get viewActorId() { return runtime.viewActorId; },
      get viewEpoch() { return runtime.viewEpoch; },
    } };
  }, [session]);
  useRegisterNodeComponent(FPS_MATCH_MANAGER, enabled ? handle : null);
  return <>{children}</>;
}

export function useManagedSession(managerId: string) {
  const manager = useGameObject(managerId);
  const matches = useSceneComponents(FPS_MATCH_MANAGER);
  const session = matches.find(entry => entry.key === manager.id)?.value;
  return session ?? null;
}
export const MatchManagerComponent: Component<{}> = {
  name: "FPSMatchManager",
  category: "misc",
  description: "Bind this node to the host's session for character and camera references. Bindings share the host session; they do not own or advance it.",
  properties: {},
  View: MatchManagerView,
};
